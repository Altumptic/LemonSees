// Підозрілі входи: серйозність, дедуплікація, збір журналу (одне джерело), наскрізно через ядро.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Конфігурація — у порожній теці, щоб тести не читали справжній soc.json розробника (поріг за замовчуванням = 10)
process.env.SHOK_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ls-suspects-cfg-"));
const { severityFor, ruleKey, incidentFor, newIncidents } = await import("../server/suspects.js");
const { rawScript, parseRaw, scanSuspects } = await import("../server/threats.js");
const { core } = await import("../server/core/index.js");
const have = core.available();

const HOST = { id: "h1", name: "web-01" };
const S = (over = {}) => ({ ip: "203.0.113.9", user: "root", method: "password", accepted_ms: 1_793_780_000_000, failures_before: 12, private: false, ...over });

// ---- серйозність ----

test("severity depends on the address and the login method", () => {
  assert.equal(severityFor(S({ private: false, method: "password" })), "critical");
  assert.equal(severityFor(S({ private: false, method: "keyboard-interactive/pam" })), "critical", "any non-key method counts as a password");
  assert.equal(severityFor(S({ private: false, method: "publickey" })), "high");
  assert.equal(severityFor(S({ private: true, method: "password" })), "medium");
  assert.equal(severityFor(S({ private: true, method: "publickey" })), "low");
});

// ---- форма інциденту ----

test("incidentFor builds a stable, host-scoped rule and a useful text", () => {
  const i = incidentFor(HOST, S());
  assert.equal(i.rule, "ssh-suspect:h1:203.0.113.9:root");
  assert.equal(i.category, "credential access");
  assert.equal(i.severity, "critical");
  assert.equal(i.hostId, "h1");
  assert.match(i.title, /web-01.*root.*203\.0\.113\.9/);
  assert.match(i.detail, /12 невдалих спроб/);
  assert.match(i.detail, /нічого не змінює/, "says clearly that LemonSees changes nothing");
  assert.equal(ruleKey("h2", S()), "ssh-suspect:h2:203.0.113.9:root", "the same attacker on another host is a different incident");
});

test("names from a hostile log are cleaned and clipped before they reach incidents and notifications", () => {
  const i = incidentFor({ id: "h1", name: "web" }, S({ user: "ro\u0000ot\n\u001b[31m" + "x".repeat(200), ip: "1.2.3.4\r\nINJECT" }));
  assert.ok(!/[\u0000-\u001f\u007f]/.test(i.title + i.rule), "no control characters");
  assert.ok(i.rule.length < 200);
  assert.equal(incidentFor(HOST, S({ user: "" })).title.includes("(empty)"), true);
});

// ---- дедуплікація ----

test("an incident is not raised again while one is open or was created within a day", () => {
  const now = 1_800_000_000_000;
  const rule = ruleKey("h1", S());
  assert.equal(newIncidents(HOST, [S()], [], now).length, 1);
  assert.equal(newIncidents(HOST, [S()], [{ rule, status: "open", createdAt: now - 5 * 86_400_000 }], now).length, 0, "open → skip, however old");
  assert.equal(newIncidents(HOST, [S()], [{ rule, status: "closed", createdAt: now - 3_600_000 }], now).length, 0, "closed an hour ago → still quiet");
  assert.equal(newIncidents(HOST, [S()], [{ rule, status: "closed", createdAt: now - 2 * 86_400_000 }], now).length, 1, "closed two days ago and seen again → new incident");
});

test("duplicates in one scan, other hosts and an empty input are handled", () => {
  assert.equal(newIncidents(HOST, [S(), S(), S({ user: "deploy" })], []).length, 2);
  const existingElsewhere = [{ rule: ruleKey("h2", S()), status: "open", createdAt: Date.now() }];
  assert.equal(newIncidents(HOST, [S()], existingElsewhere).length, 1, "an incident for another host does not suppress this one");
  assert.deepEqual(newIncidents(HOST, undefined, []), []);
  assert.deepEqual(newIncidents(HOST, [], []), []);
});

test("one host under attack cannot flood the journal in a single sweep", () => {
  const many = Array.from({ length: 100 }, (_, i) => S({ ip: `198.51.100.${i}` }));
  assert.equal(newIncidents(HOST, many, []).length, 20);
});

// ---- збір журналу: одне джерело ----

const sh = (() => {
  try {
    execFileSync("sh", ["-c", "exit 0"]);
    return true;
  } catch {
    return false;
  }
})();

const NOW = 1_793_780_101; // 2026-11-04T08:15:01Z
const ev = (i, what) => `2026-11-04T10:0${i}:00+0200 srv sshd[${i}]: ${what}`;
const failed = (ip, n) => Array.from({ length: n }, (_, i) => ev(i, `Failed password for root from ${ip} port 4000${i} ssh2`));
const accepted = (ip) => ev(9, `Accepted password for root from ${ip} port 40010 ssh2`);

/** Виконує справжній сценарій збору під sh у тимчасовій теці, з файлами замість journalctl і auth.log. */
function runRaw({ journal = "", authlog = "", hours = 3, maxLines = 50000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ls-raw-"));
  fs.writeFileSync(path.join(dir, "journal.txt"), journal);
  fs.writeFileSync(path.join(dir, "auth.log"), authlog);
  const script = rawScript({ hours, maxLines, journal: "cat journal.txt", files: "auth.log" });
  return execFileSync("sh", ["-c", script], { cwd: dir, encoding: "utf8" });
}

test("collection takes ONE source: journald when it has data, the log files only when it is empty", { skip: !sh }, () => {
  const j = failed("198.51.100.1", 3).join("\n") + "\n";
  const f = failed("198.51.100.2", 3).join("\n") + "\n";
  const fromJournal = runRaw({ journal: j, authlog: f });
  assert.ok(fromJournal.includes("198.51.100.1") && !fromJournal.includes("198.51.100.2"), "journald wins; the file is not appended");
  const fromFile = runRaw({ journal: "", authlog: f });
  assert.ok(fromFile.includes("198.51.100.2"), "empty journald falls back to the file");
  assert.match(fromFile, /^@@NOW@@ \d+ [+-]\d{4}\n/, "the server clock header is always printed");
});

test("irrelevant lines are filtered on the host and the line cap applies", { skip: !sh }, () => {
  const noise = ["Nov  4 10:00:00 srv cron[1]: (root) CMD (x)", "Nov  4 10:00:01 srv sshd[2]: Connection closed by 1.2.3.4", "random"];
  const out = runRaw({ journal: [...noise, ...failed("198.51.100.1", 2)].join("\n") + "\n" });
  assert.ok(!out.includes("cron") && !out.includes("Connection closed") && !out.includes("random"));
  assert.equal((out.match(/Failed password/g) || []).length, 2);
  const many = Array.from({ length: 5000 }, (_, i) => ev(i % 10, `Failed password for u${i} from 198.51.100.7 port ${i} ssh2`)).join("\n") + "\n";
  assert.equal((runRaw({ journal: many, maxLines: 1000 }).match(/Failed password/g) || []).length, 1000, "tail keeps the newest lines up to the cap");
});

test("rawScript never lets a value reach the shell unvalidated", () => {
  const s = rawScript({ hours: "1; rm -rf /", maxLines: "5; reboot" });
  assert.ok(!/rm -rf|reboot/.test(s), "non-numeric input is replaced by defaults");
  assert.match(s, /--since "48 hours ago"/);
  assert.match(rawScript({ hours: 9999 }), /--since "168 hours ago"/, "hours are clamped");
});

// ---- наскрізно: збір → ядро → підозрілі входи ----

const fakeConn = (logLines) => ({ exec: async () => ({ code: 0, stderr: "", truncated: false, stdout: `@@NOW@@ ${NOW} +0200\n${logLines.join("\n")}\n` }) });

test("parseRaw reads the server clock and zone", () => {
  const r = parseRaw(`@@NOW@@ ${NOW} +0530\nline1\nline2\n`);
  assert.equal(r.nowMs, NOW * 1000);
  assert.equal(r.tz, 330);
  assert.equal(r.text, "line1\nline2\n");
});

test("a success after enough failures is reported; below the threshold it is not", { skip: !have }, async () => {
  const log = [...failed("198.51.100.9", 6), ...failed("198.51.100.9", 6).map((l) => l.replace("10:0", "10:1")), accepted("198.51.100.9")];
  const r = await scanSuspects(fakeConn(log));
  assert.equal(r.suspects.length, 1, "12 failures reach the default threshold of 10");
  assert.deepEqual([r.suspects[0].ip, r.suspects[0].user, r.suspects[0].private], ["198.51.100.9", "root", false]);
  const few = await scanSuspects(fakeConn([...failed("198.51.100.9", 6), accepted("198.51.100.9")]));
  assert.equal(few.suspects.length, 0, "6 failures stay below 10: a person who mistyped a few times is not an alarm");
});

test("a private address is marked private and gets a lower severity", { skip: !have }, async () => {
  const log = [...failed("10.0.0.9", 6), ...failed("10.0.0.9", 6).map((l) => l.replace("10:0", "10:1")), accepted("10.0.0.9")];
  const r = await scanSuspects(fakeConn(log));
  assert.equal(r.suspects[0].private, true);
  assert.equal(incidentFor(HOST, r.suspects[0]).severity, "medium");
});

test("the same events present in two sources are counted once", { skip: !have || !sh }, async () => {
  // Дублі як на Debian з rsyslog: ті самі події і в journald, і в auth.log. Для оцінки ядром беремо вивід реального скрипта.
  const events = failed("198.51.100.9", 6);
  const single = runRaw({ journal: events.join("\n") + "\n", authlog: events.join("\n") + "\n" });
  const { text } = parseRaw(single);
  // Час фіксуємо: скрипт друкує справжній «зараз» хоста, а події у фікстурі датовані 4 листопада 2026
  const rep = core.auth(text, { now_ms: NOW * 1000, tz_offset_min: 120, window_hours: 3 });
  assert.equal(rep.total, 6, "six failures, not twelve");
});

test("without the Rust core the scan returns null instead of guessing", { skip: have }, async () => {
  assert.equal(await scanSuspects(fakeConn([])), null);
});

test("a host that fails to answer does not throw out of the scan", async () => {
  const broken = { exec: async () => { throw new Error("connection lost"); } };
  assert.equal(await scanSuspects(broken), null);
});
