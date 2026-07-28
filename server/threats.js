// Threat intelligence: аналіз auth.log / journald на предмет SSH-атак.
// Один прохід awk агрегує топ IP атакуючих, цільові логіни та успішні входи.
import { geoLookup } from "./geoip.js";

const SCAN = String.raw`LANG=C
( timeout 15 journalctl _COMM=sshd --since "48 hours ago" --no-pager 2>/dev/null; cat /var/log/auth.log /var/log/secure 2>/dev/null ) | awk '
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

export async function collectThreats(conn, { geo = true } = {}) {
  const { stdout } = await conn.exec(SCAN, { timeout: 40000 });
  const s = sections(stdout);

  const attackers = pairs(s.FAILED, 50).map((p) => ({ ip: p.value, count: p.count, geo: null }));
  const users = pairs(s.USERS, 15).map((p) => ({ user: p.value, count: p.count }));
  const accepted = pairs(s.ACCEPTED, 10).map((p) => ({ ip: p.value, count: p.count }));
  const total = parseInt((s.TOTAL || ["0"])[0], 10) || 0;

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

  return { attackers, users, accepted, countries, total, uniqueIps: attackers.length, at: Date.now() };
}

// Легка перевірка кількості невдалих логінів за 24 год (для монітора автоінцидентів).
export async function countRecentFailed(conn) {
  const cmd = `( timeout 12 journalctl _COMM=sshd --since "24 hours ago" --no-pager 2>/dev/null | grep -acE 'Failed password' ; timeout 8 grep -acE 'Failed password' /var/log/auth.log 2>/dev/null ; echo 0 ) | sort -rn | head -1`;
  const { stdout } = await conn.exec(cmd, { timeout: 25000 });
  return parseInt(stdout.trim(), 10) || 0;
}
