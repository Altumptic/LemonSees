// JS-відповідник пошуку підозрілих входів (server/authfallback.js) мусить поводитись так само, як Rust-ядро.
// Головний тест тут диференційний: сотні випадкових журналів проганяються через обидві реалізації, результати порівнюються.
import test from "node:test";
import assert from "node:assert/strict";
import { findSuspects, parseLineTime, isPrivate, ipVersion } from "../server/authfallback.js";
import { core } from "../server/core/index.js";

const have = core.available();
const NOW = 1_793_780_101_000; // 2026-11-04T08:15:01Z
const TZ = 120;
const ctx = { nowMs: NOW, tzOffsetMin: TZ };

// ---------- час ----------

test("time: the three formats, offsets, fractions and year inference", () => {
  const iso = (s) => parseLineTime(s, ctx);
  assert.equal(iso("2026-11-04T10:15:01+0200 host sshd[1]: x"), NOW);
  assert.equal(iso("2026-11-04T10:15:01.250000+02:00 host"), NOW + 250);
  assert.equal(iso("2026-11-04 08:15:01Z host"), NOW);
  assert.equal(iso("2026-11-04T10:15:01 host"), NOW, "no zone → server zone");
  assert.equal(iso("Nov  4 10:15:01 host sshd[1]: x"), NOW);
  assert.equal(iso("Nov 04 10:15:01 host"), NOW);
  assert.ok(iso("Dec 31 23:00:00 host") < NOW, "a December line in November is last year");
  assert.equal(iso('203.0.113.5 - - [04/Nov/2026:10:15:01 +0200] "GET / HTTP/1.1" 200 12'), NOW);
  for (const junk of ["", "x", "2026-13-45T99:99:99", "Foo  4 10:15:01", "[04/Nov/2026", "[", "9999-99-99 99:99:99Z", "Nov  4 25:00:00 h"]) assert.equal(iso(junk), null, JSON.stringify(junk));
  assert.equal(iso("[".repeat(10_000)), null);
});

test("addresses: versions and the internal ranges", () => {
  for (const ip of ["10.1.2.3", "192.168.0.1", "172.16.5.5", "127.0.0.1", "169.254.1.1", "100.64.0.9", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "224.0.0.1", "0.0.0.0", "::"]) assert.equal(isPrivate(ip), true, ip);
  for (const ip of ["8.8.8.8", "203.0.113.9", "2001:db8::1", "100.128.0.1", "172.32.0.1", "::ffff:8.8.8.8"]) assert.equal(isPrivate(ip), false, ip);
  for (const bad of ["", "x", "1.2.3", "1.2.3.4.5", "fe80::1%eth0", "a".repeat(46)]) assert.equal(ipVersion(bad), null, bad);
});

// ---------- семантика ----------

const lines = {
  fail: (t, ip, n = 1) => Array.from({ length: n }, (_, i) => `${t(i)} srv sshd[${i}]: Failed password for root from ${ip} port 4000${i} ssh2`),
  acc: (t, ip, method = "password", user = "root") => `${t(99)} srv sshd[9]: Accepted ${method} for ${user} from ${ip} port 40010 ssh2`,
};
const stamp = (i) => `2026-11-04T10:${String(i % 60).padStart(2, "0")}:00+0200`;
const opts = { nowMs: NOW, tzOffsetMin: TZ, windowHours: 3, threshold: 5 };

test("a success after enough failures from the same address is a suspect", () => {
  const log = [...lines.fail(stamp, "198.51.100.4", 6), lines.acc(stamp, "198.51.100.4")].join("\n");
  const s = findSuspects(log, opts);
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].ip, s[0].user, s[0].method, s[0].failures_before, s[0].private], ["198.51.100.4", "root", "password", 6, false]);
});

test("below the threshold, from another address, or success before failures: not a suspect", () => {
  assert.equal(findSuspects([...lines.fail(stamp, "198.51.100.4", 4), lines.acc(stamp, "198.51.100.4")].join("\n"), opts).length, 0);
  assert.equal(findSuspects([...lines.fail(stamp, "198.51.100.4", 9), lines.acc(stamp, "198.51.100.77")].join("\n"), opts).length, 0);
  assert.equal(findSuspects([lines.acc(stamp, "198.51.100.4"), ...lines.fail(stamp, "198.51.100.4", 9)].join("\n"), opts).length, 0);
});

test("attempts are the larger of the three counters, not their sum", () => {
  // 3 Failed + 3 Invalid user + 3 PAM для однієї адреси = 3 спроби, а не 9
  const log = [
    ...lines.fail(stamp, "198.51.100.4", 3),
    ...Array.from({ length: 3 }, (_, i) => `${stamp(i)} srv sshd[1]: Invalid user bob from 198.51.100.4 port 22 [preauth]`),
    ...Array.from({ length: 3 }, (_, i) => `${stamp(i)} srv sshd[1]: pam_unix(sshd:auth): authentication failure; rhost=198.51.100.4  user=bob`),
    lines.acc(stamp, "198.51.100.4"),
  ].join("\n");
  assert.equal(findSuspects(log, { ...opts, threshold: 4 }).length, 0);
  assert.equal(findSuspects(log, { ...opts, threshold: 3 }).length, 1);
});

test("events older than the window are ignored", () => {
  const old = (i) => `2026-11-02T10:${String(i % 60).padStart(2, "0")}:00+0200`;
  const log = [...lines.fail(old, "198.51.100.4", 9), lines.acc(stamp, "198.51.100.4")].join("\n");
  assert.equal(findSuspects(log, opts).length, 0, "9 failures two days ago do not count in a 3-hour window");
  assert.equal(findSuspects(log, { ...opts, windowHours: 72 }).length, 1);
});

test("BSD-syslog logs, IPv6 and internal addresses", () => {
  const bsd = (i) => `Nov  4 10:0${i % 10}:00`;
  const v6 = [...lines.fail(bsd, "2001:db8::7", 6), lines.acc(bsd, "2001:db8::7", "publickey")].join("\n");
  const r = findSuspects(v6, opts);
  assert.deepEqual([r[0].ip, r[0].method, r[0].private], ["2001:db8::7", "publickey", false]);
  const lan = [...lines.fail(stamp, "10.0.0.9", 6), lines.acc(stamp, "10.0.0.9")].join("\n");
  assert.equal(findSuspects(lan, opts)[0].private, true);
});

test("one suspect per address and user; different users are separate", () => {
  const log = [...lines.fail(stamp, "198.51.100.4", 6), lines.acc(stamp, "198.51.100.4"), lines.acc(stamp, "198.51.100.4"), lines.acc(stamp, "198.51.100.4", "password", "deploy")].join("\n");
  assert.deepEqual(findSuspects(log, opts).map((s) => s.user), ["root", "deploy"]);
});

test("lines that are not from sshd, garbage and CRLF do not break it", () => {
  const log = [`${stamp(0)} srv cron[1]: Failed password for root from 198.51.100.4 port 1 ssh2`, "\u0000\uFFFD".repeat(500), "", "Accepted", ...lines.fail(stamp, "198.51.100.4", 6), lines.acc(stamp, "198.51.100.4")].join("\r\n");
  assert.equal(findSuspects(log, opts).length, 1, "the cron line is not sshd, so it does not count");
});

test("caps: at most 50 suspects", () => {
  const log = Array.from({ length: 80 }, (_, k) => [...lines.fail(stamp, `198.51.100.${k}`, 6), lines.acc(stamp, `198.51.100.${k}`)]).flat().join("\n");
  assert.equal(findSuspects(log, opts).length, 50);
});

// ---------- диференційний тест із ядром ----------

class Rng {
  constructor(seed) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    this.s ^= this.s << 13;
    this.s >>>= 0;
    this.s ^= this.s >>> 17;
    this.s ^= this.s << 5;
    this.s >>>= 0;
    return this.s;
  }
  below(n) {
    return this.next() % n;
  }
  pick(a) {
    return a[this.below(a.length)];
  }
}

const IPS = ["203.0.113.9", "198.51.100.4", "10.0.0.5", "192.168.1.7", "2001:db8::7", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:8.8.8.8", "::1", "100.64.0.9", "172.16.5.5", "172.32.0.1", "8.8.8.8", "169.254.1.1", "224.0.0.1", "0.0.0.0", "::", "01.2.3.4", "1.2.3.4.5", "fe80::1%eth0", "300.1.1.1"];
const USERS = ["root", "admin", "deploy", "ubuntu", "", "a b", "x".repeat(80)];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n) => String(n).padStart(2, "0");

function stampAt(rng, tMs) {
  const kind = rng.below(8);
  const off = rng.pick([0, 120, -300, 330]);
  const loc = new Date(tMs + off * 60_000);
  const hms = `${p2(loc.getUTCHours())}:${p2(loc.getUTCMinutes())}:${p2(loc.getUTCSeconds())}`;
  const ymd = `${loc.getUTCFullYear()}-${p2(loc.getUTCMonth() + 1)}-${p2(loc.getUTCDate())}`;
  const sign = off < 0 ? "-" : "+";
  const hh = p2(Math.floor(Math.abs(off) / 60));
  const mm = p2(Math.abs(off) % 60);
  switch (kind) {
    case 0: return `${ymd}T${hms}${sign}${hh}${mm}`;
    case 1: return `${ymd}T${hms}.${rng.below(1_000_000)}${sign}${hh}:${mm}`;
    case 2: return `${ymd} ${hms}Z`.replace(/\d\d:\d\d:\d\dZ/, () => { const u = new Date(tMs); return `${p2(u.getUTCHours())}:${p2(u.getUTCMinutes())}:${p2(u.getUTCSeconds())}Z`; });
    case 3: { const l = new Date(tMs + TZ * 60_000); const d = l.getUTCDate(); return `${MON[l.getUTCMonth()]} ${d < 10 ? " " : ""}${d} ${p2(l.getUTCHours())}:${p2(l.getUTCMinutes())}:${p2(l.getUTCSeconds())}`; }
    case 4: { const l = new Date(tMs + TZ * 60_000); return `${MON[l.getUTCMonth()]} ${p2(l.getUTCDate())} ${p2(l.getUTCHours())}:${p2(l.getUTCMinutes())}:${p2(l.getUTCSeconds())}`; }
    case 5: return `${ymd}T${hms}`; // без зони → зона сервера (зсув іншого пояса тут навмисно «неправильний»: обидві реалізації мають однаково помилитись)
    case 6: return rng.pick(["Xyz 99 99:99:99", "garbage", "", "2026-13-45T99:99:99"]);
    default: return `[${p2(loc.getUTCDate())}/${MON[loc.getUTCMonth()]}/${loc.getUTCFullYear()}:${hms} ${sign}${hh}${mm}]`;
  }
}

function corpus(rng) {
  const out = [];
  const n = 5 + rng.below(60);
  for (let i = 0; i < n; i++) {
    // Кожна десята подія — з далекого майбутнього (до 300 днів): для міток без року (BSD) це змушує виводити минулий рік;
    // без таких подій гілка «рік мінус один» у випадковому корпусі не виконувалась би (виявив негативний контроль)
    const t = rng.below(10) === 0 ? NOW + (1 + rng.below(300)) * 86_400_000 : NOW - rng.below(80 * 3600) * 1000 + rng.below(3600) * 1000;
    const ts = stampAt(rng, t);
    const ip = rng.pick(IPS);
    const user = rng.pick(USERS);
    const k = rng.below(12);
    const sshd = rng.below(25) === 0 ? "cron" : "sshd";
    let body;
    if (k <= 3) body = `Failed password for ${rng.below(3) === 0 ? "invalid user " : ""}${user} from ${ip} port ${rng.below(65535)} ssh2`;
    else if (k === 4) body = `Failed publickey for ${user} from ${ip} port 22 ssh2`;
    else if (k === 5) body = `Failed keyboard-interactive/pam for ${user} from ${ip} port 22 ssh2`;
    else if (k === 6) body = `Invalid user ${user} from ${ip} port 22 [preauth]`;
    else if (k === 7) body = `pam_unix(sshd:auth): authentication failure; logname= uid=0 euid=0 tty=ssh ruser= rhost=${ip}${rng.below(2) ? ` user=${user}` : ""}`;
    else if (k <= 10) body = `Accepted ${rng.pick(["password", "publickey", "keyboard-interactive/pam"])} for ${user} from ${ip} port ${rng.below(65535)} ssh2${rng.below(2) ? ": ED25519 SHA256:xx" : ""}`;
    else body = rng.pick(["Connection closed by 1.2.3.4", "Accepted", "Failed password for", `Accepted password for ${user} from`, `Accepted password ${user} from ${ip}`]);
    out.push(`${ts} srv ${sshd}[${i}]: ${body}${rng.below(30) === 0 ? "\r" : ""}`);
  }
  return out.join("\n");
}

test("DIFFERENTIAL: the JS fallback and the Rust core agree on random logs", { skip: !have }, () => {
  const rng = new Rng(0xC0FFEE);
  let withSuspects = 0;
  const kinds = new Set();
  for (let round = 0; round < 600; round++) {
    const text = corpus(rng);
    const windowHours = rng.pick([0, 1, 3, 24, 48, 168]);
    const threshold = rng.pick([1, 2, 3, 5, 10]);
    const rep = core.auth(text, { now_ms: NOW, tz_offset_min: TZ, window_hours: windowHours, suspect_threshold: threshold });
    const js = findSuspects(text, { nowMs: NOW, tzOffsetMin: TZ, windowHours, threshold });
    assert.deepEqual(js, rep.suspects, `round ${round} (window ${windowHours}h, threshold ${threshold})\n${text.slice(0, 600)}`);
    if (js.length) withSuspects++;
    for (const s of js) kinds.add(`${s.private ? "private" : "public"}/${s.method}`);
  }
  // Захист від порожнього тесту: корпус справді породжує підозрілі входи різних видів, інакше порівнювати нічого
  assert.ok(withSuspects > 40, `only ${withSuspects} of 600 corpora contained a suspect`);
  assert.ok(kinds.size >= 4, `suspect kinds covered: ${[...kinds].join(", ")}`);
});
