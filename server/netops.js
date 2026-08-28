// NDR та утиліти аналітика: активні зʼєднання, мережеві інструменти (dig/whois/ping/…),
// IP-розвідка (гео + reverse DNS + звірка з базою атак). Усе виконується на віддаленому хості по SSH.
import { geoLookup } from "./geoip.js";

/* ---------------- Активні зʼєднання ---------------- */

export async function collectConnections(conn) {
  const { stdout } = await conn.exec(`ss -tunaH 2>/dev/null | head -300`, { timeout: 20000 });
  const conns = [];
  const listen = [];
  for (const raw of stdout.split("\n")) {
    const p = raw.trim().split(/\s+/);
    if (p.length < 5) continue;
    const [netid, state, , , local, peer] = p;
    const proc = raw.match(/users:\(\("([^"]+)"/);
    const item = { proto: netid, state, local, peer: peer || "", process: proc ? proc[1] : "" };
    if (state === "LISTEN") listen.push(item);
    else if (state === "ESTAB") conns.push(item);
  }
  return { established: conns.slice(0, 200), listening: listen.slice(0, 100), estabCount: conns.length, listenCount: listen.length, at: Date.now() };
}

/* ---------------- Мережеві інструменти ---------------- */

const TARGET_RE = /^[a-zA-Z0-9.\-_:]{1,255}$/;

const TOOLS = {
  dig: (t) => `dig +noall +answer +stats ${shq(t)} A 2>/dev/null || nslookup ${shq(t)} 2>/dev/null`,
  reverse: (t) => `dig +short -x ${shq(t)} 2>/dev/null || nslookup ${shq(t)} 2>/dev/null`,
  whois: (t) => `whois ${shq(t)} 2>/dev/null | grep -viE '^(%|#|>>>|NOTICE|TERMS)' | grep -vE '^\\s*$' | head -50`,
  ping: (t) => `ping -c 4 -W 2 ${shq(t)} 2>&1`,
  traceroute: (t) => `traceroute -m 15 -w 2 -q 1 ${shq(t)} 2>&1 || tracepath -m 15 ${shq(t)} 2>&1`,
  http: (t) => `curl -sS -o /dev/null -w 'HTTP %{http_code} · ${'$'}{time_total}s · ${'$'}{remote_ip}' --max-time 8 ${shq(t)} 2>&1`,
};

function shq(s) {
  return `'${String(s).replace(/'/g, "")}'`;
}

export async function runTool(conn, tool, target, port) {
  if (!TOOLS[tool] && tool !== "port") throw new Error("Невідомий інструмент");
  const t = String(target || "").trim();
  if (!TARGET_RE.test(t)) throw new Error("Некоректна ціль (дозволено літери, цифри, .-_:)");

  let cmd;
  if (tool === "port") {
    const pnum = parseInt(port, 10);
    if (!(pnum > 0 && pnum < 65536)) throw new Error("Некоректний порт");
    cmd = `timeout 5 bash -c 'exec 3<>/dev/tcp/${t}/${pnum} && echo "OPEN — ${t}:${pnum} приймає зʼєднання" || echo "CLOSED/FILTERED — ${t}:${pnum}"' 2>&1 || echo "CLOSED/FILTERED — ${t}:${pnum}"`;
  } else {
    cmd = TOOLS[tool](t);
  }
  const { stdout } = await conn.exec(cmd, { timeout: 30000 });
  return { tool, target: t, output: stdout.trim() || "(порожній вивід)", at: Date.now() };
}

/* ---------------- IP-розвідка (CTI) ---------------- */

export async function investigateIp(conn, ip, geo = true, attackers = []) {
  const t = String(ip || "").trim();
  if (!/^[0-9a-fA-F.:]{3,45}$/.test(t)) throw new Error("Некоректний IP");

  const { stdout } = await conn.exec(
    `echo "@@RDNS@@"; dig +short -x ${shq(t)} 2>/dev/null | head -3; echo "@@WHOIS@@"; whois ${shq(t)} 2>/dev/null | grep -iE 'netname|orgname|org-name|country|abuse|descr' | head -12`,
    { timeout: 25000 },
  );
  const rdns = grab(stdout, "RDNS");
  const whois = grab(stdout, "WHOIS");

  let geoInfo = null;
  if (geo) {
    try {
      geoInfo = (await geoLookup([t]))[t] || null;
    } catch {
      /* без гео */
    }
  }

  const attack = attackers.find((a) => a.ip === t) || null;
  const known = !!attack;
  const reputation = known ? "malicious" : "unknown";

  return {
    ip: t,
    geo: geoInfo,
    rdns: rdns[0] || "",
    whois: whois,
    known,
    attackCount: attack?.count || 0,
    reputation,
    at: Date.now(),
  };
}

function grab(text, tag) {
  const out = [];
  let on = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === `@@${tag}@@`) {
      on = true;
      continue;
    }
    if (/^@@[A-Z]+@@$/.test(line)) {
      on = false;
      continue;
    }
    if (on && line) out.push(line);
  }
  return out;
}
