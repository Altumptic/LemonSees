// Бенчмарк гарячих шляхів. Запуск: npm run bench  (потрібен зібраний .wasm: npm run build:core)
// Порівнюємо з прямолінійною JS-реалізацією (один RegExp на рядок + Map) на тому ж корпусі.
// Це НЕ порівняння з Wazuh: тут вимірюється лише наш розбір у процесі Node. Цифри залежать від машини — дивіться "env".
import os from "node:os";
import { core } from "../server/core/index.js";

if (!core.available()) {
  console.error("Ядро недоступне:", core.info().reason);
  process.exit(1);
}
const NOW = Date.parse("2026-11-04T08:15:01Z");
const o = { now_ms: NOW, tz_offset_min: 120 };
const N = +process.env.BENCH_LINES || 1_000_000;

function corpus(n) {
  const out = [];
  let seed = 42;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < n; i++) {
    const sec = Math.floor(rnd() * 3600 * 40);
    const t = new Date(NOW - sec * 1000).toISOString().replace(/\.\d+Z$/, "+0000");
    const ip = `${1 + Math.floor(rnd() * 223)}.${Math.floor(rnd() * 255)}.${Math.floor(rnd() * 255)}.${1 + Math.floor(rnd() * 254)}`;
    const k = rnd();
    if (k < 0.55) out.push(`${t} srv sshd[${i}]: Failed password for root from ${ip} port ${1024 + (i % 60000)} ssh2`);
    else if (k < 0.8) out.push(`${t} srv sshd[${i}]: Invalid user admin${i % 50} from ${ip} port 22 [preauth]`);
    else if (k < 0.83) out.push(`${t} srv sshd[${i}]: Accepted publickey for deploy from ${ip} port 22 ssh2`);
    else out.push(`${t} srv cron[${i}]: (root) CMD (run-parts /etc/cron.hourly)`);
  }
  return out.join("\n") + "\n";
}

// Наївний JS-еталон: те, що написав би розробник без ядра
function naiveAuth(text) {
  const ips = new Map();
  const users = new Map();
  let total = 0;
  const re = /(Failed \w+ for (?:invalid user )?(\S+) from ([0-9a-f:.]+)|Invalid user (\S*) from ([0-9a-f:.]+))/;
  for (const line of text.split("\n")) {
    if (!line.includes("sshd")) continue;
    const m = re.exec(line);
    if (!m) continue;
    total++;
    const ip = m[3] || m[5];
    ips.set(ip, (ips.get(ip) || 0) + 1);
    const u = m[2] || m[4];
    users.set(u, (users.get(u) || 0) + 1);
  }
  return { total, ips: ips.size, users: users.size };
}

function time(fn, runs = 5) {
  fn(); // прогрів
  const ts = [];
  let r;
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    r = fn();
    ts.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  ts.sort((a, b) => a - b);
  return { ms: ts[Math.floor(ts.length / 2)], r };
}

const text = corpus(N);
const mb = Buffer.byteLength(text) / 1048576;
const rows = [];
const add = (name, t) => rows.push({ test: name, median_ms: +t.ms.toFixed(1), lines_per_s: Math.round(N / (t.ms / 1000)), MB_per_s: +(mb / (t.ms / 1000)).toFixed(0) });

add("auth: JS (naive regex+Map)", time(() => naiveAuth(text)));
add("auth: Rust/WASM core", time(() => core.auth(text, o)));
const rule = [{ id: "bf", pattern: "Failed password|Invalid user", threshold: 5, window_min: 60, group_by: "ip" }];
add("rules: 1 rule, group_by ip", time(() => core.rules(text, rule, o)));
const many = Array.from({ length: 50 }, (_, i) => ({ id: "r" + i, pattern: `user admin${i}\b|session ${i}x`, threshold: 5, window_min: 60 }));
add("rules: 50 rules (single pass)", time(() => core.rules(text, many, o)));

const files = Array.from({ length: 50_000 }, (_, i) => ({ path: `/etc/f/${i}`, sha256: "h" + i, size: i, mode: "644", owner: "root", mtime: 0 }));
const cur = files.map((f, i) => (i % 100 === 0 ? { ...f, sha256: "x" } : f));
add("fim: diff 50k files", { ms: time(() => core.fim({ baseline: { at: 1, files }, current: cur, critical: ["/etc/f/1*"], now_ms: NOW }), 5).ms });
rows[rows.length - 1].lines_per_s = Math.round(50000 / (rows[rows.length - 1].median_ms / 1000));
rows[rows.length - 1].MB_per_s = "-";

console.log(`env: node ${process.version}, ${os.cpus()[0].model.trim()} x${os.cpus().length}, ${os.platform()} ${os.arch()}; core ${core.info().version} sha256=${core.info().sha256.slice(0, 12)}…`);
console.log(`corpus: ${N.toLocaleString("en")} lines, ${mb.toFixed(0)} MiB, median of 5 runs after warmup`);
console.table(rows);
const [js, rs] = rows;
console.log(`auth speedup vs naive JS: x${(js.median_ms / rs.median_ms).toFixed(1)}`);
