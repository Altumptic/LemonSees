// Threat intelligence: аналіз auth.log / journald на предмет SSH-атак.
// Один прохід awk агрегує топ IP атакуючих, цільові логіни та успішні входи.
import { geoLookup } from "./geoip.js";
import { core } from "./core/index.js";
import { loadSoc } from "./config.js";
import { findSuspects } from "./authfallback.js";

// Запасний шлях без ядра. Як і у rawScript, джерело одне (journald, інакше файли), щоб не рахувати подію двічі.
const SCAN = String.raw`LANG=C
{ J=$(timeout 15 journalctl _COMM=sshd --since "48 hours ago" --no-pager 2>/dev/null); if [ -n "$J" ]; then printf '%s\n' "$J"; else cat /var/log/auth.log /var/log/secure 2>/dev/null; fi; } | awk '
/Failed password|authentication failure|Invalid user/ { if (match($0, /from [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/)) { ip=substr($0,RSTART+5,RLENGTH-5); fip[ip]++; tot++ } }
/Invalid user/ { if (match($0, /Invalid user [A-Za-z0-9._-]+/)) { u=substr($0,RSTART+13,RLENGTH-13); usr[u]++ } }
/Accepted / { if (match($0, /from [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/)) { a=substr($0,RSTART+5,RLENGTH-5); acc[a]++ } }
END {
  print "@@FAILED@@"; for (i in fip) print fip[i], i;
  print "@@USERS@@"; for (u in usr) print usr[u], u;
  print "@@ACCEPTED@@"; for (a in acc) print acc[a], a;
  print "@@TOTAL@@"; print tot+0;
  print "@@END@@";
}'`;

function sections(text) {
  const s = {};
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "").trim();
    const m = line.match(/^@@([A-Z]+)@@$/);
    if (m) {
      cur = m[1];
      s[cur] = [];
    } else if (cur && line) {
      s[cur].push(line);
    }
  }
  return s;
}

function pairs(lines = [], limit = 100) {
  return lines
    .map((l) => {
      const sp = l.indexOf(" ");
      return sp > 0 ? { count: parseInt(l.slice(0, sp), 10) || 0, value: l.slice(sp + 1).trim() } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

const AUTH_PATTERN = "sshd.*(Failed |Invalid user |Accepted |authentication failure)";

/**
 * Сценарій збору рядків sshd за `hours` годин + годинник і пояс СЕРВЕРА (аналіз виконує Rust-ядро).
 *
 * Джерело ОДНЕ: journald, а якщо він порожній, то файли журналу. Раніше брались обидва, і на хостах із rsyslog
 * (Debian, Ubuntu) кожна подія потрапляла в обидва джерела й рахувалась двічі: завищені лічильники атак і хибні
 * «підозрілі входи». Фільтр і ліміт рядків діють на хості, ще до того як дані потраплять у змінну.
 * `files` і `journal` перевизначаються лише в тестах.
 */
export function rawScript({ hours = 48, maxLines = 400000, files = "/var/log/auth.log /var/log/secure", journal } = {}) {
  const h = Math.max(1, Math.min(168, Math.floor(Number(hours)) || 48));
  const n = Math.max(1000, Math.min(1_000_000, Math.floor(Number(maxLines)) || 400000));
  const j = journal ?? `timeout 20 journalctl _COMM=sshd --since "${h} hours ago" --no-pager -o short-iso 2>/dev/null`;
  return [
    "LANG=C",
    'echo "@@NOW@@ $(date +%s) $(date +%z)"',
    `J=$( ${j} | grep -aE '${AUTH_PATTERN}' | tail -n ${n} )`,
    `if [ -n "$J" ]; then printf '%s\\n' "$J"; else tail -q -n ${n} ${files} 2>/dev/null | grep -aE '${AUTH_PATTERN}'; fi`,
  ].join("\n");
}

/** "+0200" → хвилини. */
function tzMinutes(z) {
  const m = /^([+-])(\d\d)(\d\d)$/.exec(z || "");
  return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0;
}

/** Розбір виводу rawScript: час сервера, пояс і текст журналу. */
export function parseRaw(stdout) {
  const nl = stdout.indexOf("\n");
  const head = /^@@NOW@@ (\d+) ([+-]\d{4})/.exec(stdout.slice(0, nl < 0 ? 0 : nl));
  return { nowMs: head ? +head[1] * 1000 : Date.now(), tz: tzMinutes(head?.[2]), text: nl < 0 ? "" : stdout.slice(nl + 1) };
}

/** Забирає рядки журналу з хоста разом із годинником і поясом сервера. Кидає помилку, якщо хост не відповів. */
async function fetchAuthRaw(conn, { hours = 48, maxLines = 400000, timeout = 60000, maxBytes = 64 * 1024 * 1024 } = {}) {
  const { stdout, truncated } = await conn.exec(rawScript({ hours, maxLines }), { timeout, maxBytes });
  return { ...parseRaw(stdout), truncated: !!truncated };
}

/** Аналіз ядром для сторінки загроз: { rep, truncated } або null, якщо ядро недоступне чи відхилило дані. */
async function analyzeAuthLog(conn, opts = {}) {
  if (!core.available()) return null;
  const hours = opts.hours ?? 48;
  const raw = await fetchAuthRaw(conn, opts);
  // Поріг «підозрілого входу» один для сторінки загроз і для планових сповіщень (Налаштування → SOC)
  const rep = core.auth(raw.text, { now_ms: raw.nowMs, tz_offset_min: raw.tz, window_hours: hours, suspect_threshold: loadSoc().suspectThreshold });
  return rep ? { rep, truncated: raw.truncated } : null;
}

const collectViaCore = (conn) => analyzeAuthLog(conn);

/**
 * Легка перевірка для планових циклів: лише останні години, до 50k рядків, без геолокації.
 * Повертає { suspects, truncated, engine } або null, якщо хост не відповів.
 * Спершу Rust-ядро; якщо його немає (немає .wasm, LEMONSEES_CORE=off, збій модуля), працює JS-відповідник
 * (server/authfallback.js), який тестами зведено до тієї самої поведінки. Тож сповіщення не залежать від ядра.
 */
export async function scanSuspects(conn, { hours = 3 } = {}) {
  let raw;
  try {
    raw = await fetchAuthRaw(conn, { hours, maxLines: 50000, timeout: 30000, maxBytes: 8 * 1024 * 1024 });
  } catch {
    return null;
  }
  const threshold = loadSoc().suspectThreshold;
  const rep = core.available() ? core.auth(raw.text, { now_ms: raw.nowMs, tz_offset_min: raw.tz, window_hours: hours, suspect_threshold: threshold }) : null;
  if (rep) return { suspects: rep.suspects, truncated: raw.truncated || !!rep.truncated, engine: "rust-wasm" };
  return { suspects: findSuspects(raw.text, { nowMs: raw.nowMs, tzOffsetMin: raw.tz, windowHours: hours, threshold }), truncated: raw.truncated, engine: "js" };
}

export async function collectThreats(conn, { geo = true } = {}) {
  let attackers, users, accepted, total, extra = {};
  const viaCore = core.available() ? await collectViaCore(conn).catch(() => null) : null;
  if (viaCore) {
    const { rep } = viaCore;
    attackers = rep.attackers.map((a) => ({ ip: a.ip, count: a.count, geo: null, firstMs: a.first_ms, lastMs: a.last_ms, users: a.users, private: a.private }));
    users = rep.users.map((u) => ({ user: u.user, count: u.count }));
    accepted = rep.accepted.map((a) => ({ ip: a.ip, count: a.count, user: a.user, method: a.method, private: a.private }));
    total = rep.total;
    extra = { suspects: rep.suspects, hourly: rep.hourly, engine: "rust-wasm", truncated: rep.truncated || viaCore.truncated };
  } else {
    const { stdout } = await conn.exec(SCAN, { timeout: 40000 });
    const s = sections(stdout);
    attackers = pairs(s.FAILED, 50).map((p) => ({ ip: p.value, count: p.count, geo: null }));
    users = pairs(s.USERS, 15).map((p) => ({ user: p.value, count: p.count }));
    accepted = pairs(s.ACCEPTED, 10).map((p) => ({ ip: p.value, count: p.count }));
    total = parseInt((s.TOTAL || ["0"])[0], 10) || 0;
    extra = { suspects: [], hourly: [], engine: "awk" };
  }

  if (geo && attackers.length) {
    try {
      const g = await geoLookup(attackers.map((a) => a.ip));
      for (const a of attackers) a.geo = g[a.ip] || null;
    } catch {
      /* лишаємо без гео */
    }
  }

  // Розподіл по країнах
  const byCountry = {};
  for (const a of attackers) {
    const cc = a.geo?.countryCode || "??";
    byCountry[cc] = (byCountry[cc] || 0) + a.count;
  }
  const countries = Object.entries(byCountry)
    .map(([cc, count]) => ({ cc, count, country: attackers.find((a) => a.geo?.countryCode === cc)?.geo?.country || cc }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return { attackers, users, accepted, countries, total, uniqueIps: attackers.length, at: Date.now(), ...extra };
}

// Легка перевірка кількості невдалих логінів за 24 год (для монітора автоінцидентів).
export async function countRecentFailed(conn) {
  const cmd = `( timeout 12 journalctl _COMM=sshd --since "24 hours ago" --no-pager 2>/dev/null | grep -acE 'Failed password' ; timeout 8 grep -acE 'Failed password' /var/log/auth.log 2>/dev/null ; echo 0 ) | sort -rn | head -1`;
  const { stdout } = await conn.exec(cmd, { timeout: 25000 });
  return parseInt(stdout.trim(), 10) || 0;
}
