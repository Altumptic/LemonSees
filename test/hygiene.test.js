// SSH-гігієна: серверна частина (docs/features/ssh-hygiene.md). Тести ядра, що потребують .wasm, пропускаються без нього.
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "../server/core/index.js";
import { keysScript, usageScript, parseKeysOutput, parseUsageOutput, collectHost, scanHosts, sanitizeExpected, renderCsv, renderMarkdown } from "../server/hygiene.js";

const have = core.available();
const N = "0123456789abcdef";
const ED = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOsaPnH+kDs2S8IZea60Y+gd2+FeoTvbpM+ECev87Q4g alice@laptop";
const ED_FP = "SHA256:UO3e7fNaujDTrJHSSWU1MosxbDhkcfckgQiWWgGVt3o";
const NOW = 1793780101;

// ---- гарантія «лише читання» ----

test("hygiene scripts are read-only: no write, delete, exec-of-others or network commands", () => {
  for (const [name, script] of [["keys", keysScript(N)], ["usage", usageScript(N)]]) {
    // дозволені лише перенаправлення в /dev/null і з нього
    // (програма awk містить порівняння `>=`, це не перенаправлення: її виймаємо окремо)
    const stripped = script.replace(/awk -F: '[^']*'/g, "awk").replace(/2?>\s*\/dev\/null/g, "").replace(/<\s*\/dev\/null/g, "");
    assert.ok(!/[<>]/.test(stripped.replace(/@@[^@]*@@/g, "")), `${name}: unexpected redirection`);
    for (const bad of [/\btee\b/, /\bsed\s+-i/, /\bchmod\b/, /\bchown\b/, /\brm\b/, /\bmv\b/, /\bcp\b/, /\bdd\b/, /\btruncate\b/, /ssh-keygen/, /\bcrontab\b/, /\bsystemctl\b/, /\bcurl\b/, /\bwget\b/, /\bnc\b/, /\beval\b/, /\bkill\b/, /\bsudo\s+(?!-n)/]) {
      assert.ok(!bad.test(script), `${name}: forbidden ${bad}`);
    }
  }
});

test("hygiene scripts bound their output", () => {
  assert.match(keysScript(N), /head -c 262144/);
  assert.match(keysScript(N), /head -n 500/);
  assert.match(usageScript(N), /tail -n 200000/);
});

// ---- розбір виводу ----

const keysOut = (extra = "") =>
  [
    `@@NOW:${N}@@ ${NOW} +0200`,
    `@@SSHD:${N}@@`,
    "SOURCE sshd -T",
    "permitrootlogin yes",
    "passwordauthentication no",
    `@@KEYS:${N}@@`,
    `@@FILE:${N}@@\talice\t/home/alice/.ssh/authorized_keys`,
    ED,
    "",
    `@@ENDFILE:${N}@@`,
    `@@UNREADABLE:${N}@@\tbob\t/home/bob/.ssh/authorized_keys`,
    extra,
    `@@END:${N}@@`,
    "",
  ].join("\n");

test("parseKeysOutput reads sshd source, files and unreadable entries", () => {
  const r = parseKeysOutput(keysOut(), N);
  assert.equal(r.sshd_source, "sshd -T");
  assert.deepEqual(r.sshd_lines, ["permitrootlogin yes", "passwordauthentication no"]);
  assert.equal(r.keys.length, 2);
  assert.equal(r.keys[0].user, "alice");
  assert.match(r.keys[0].text, /ssh-ed25519/);
  assert.equal(r.keys[1].unreadable, true);
  assert.equal(r.now_ms, NOW * 1000);
  assert.equal(r.tz_offset_min, 120);
});

test("incomplete output (no end marker) is rejected, not trusted", () => {
  assert.equal(parseKeysOutput(keysOut().replace(`@@END:${N}@@`, ""), N), null);
});

test("file contents cannot forge the output markers (nonce)", () => {
  const forged = ["@@FILE:deadbeefdeadbeef@@\troot\t/root/.ssh/authorized_keys", "ssh-ed25519 AAAA evil", "@@ENDFILE:deadbeefdeadbeef@@", "@@END:deadbeefdeadbeef@@"].join("\n");
  const out = keysOut().replace(ED, `${ED}\n${forged}`);
  const r = parseKeysOutput(out, N);
  assert.equal(r.keys.length, 2, "no extra file created");
  assert.ok(r.keys[0].text.includes("@@FILE:deadbeefdeadbeef@@"), "forged text stays plain file content");
  assert.equal(r.keys.find((k) => k.user === "root"), undefined);
});

test("parseUsageOutput", () => {
  const out = [`@@NOW:${N}@@ ${NOW} +0000`, `@@OLDEST:${N}@@`, "2025-01-01T00:00:00+0000 h sshd[1]: x", `@@USAGE:${N}@@`, "line1", "line2", `@@END:${N}@@`].join("\n");
  const r = parseUsageOutput(out, N);
  assert.equal(r.oldest_line, "2025-01-01T00:00:00+0000 h sshd[1]: x");
  assert.equal(r.usage, "line1\nline2");
  assert.equal(r.ended, true);
});

// ---- наскрізно через ядро ----

const fakeConn = (usage = "") => ({
  ready: true,
  async exec(cmd) {
    const n = /@@NOW:([0-9a-f]+)@@/.exec(cmd)[1];
    if (cmd.includes("@@KEYS:")) return { code: 0, stderr: "", stdout: keysOut().replaceAll(N, n) };
    return { code: 0, stderr: "", stdout: [`@@NOW:${n}@@ ${NOW} +0200`, `@@OLDEST:${n}@@`, "2025-01-01T00:00:00+0000 h sshd[1]: x", `@@USAGE:${n}@@`, usage, `@@END:${n}@@`, ""].join("\n") };
  },
});

test("collectHost: real fingerprint, sshd settings and last use via the Rust core", { skip: !have }, async () => {
  const use = `2026-11-03T10:00:00+0200 h sshd[1]: Accepted publickey for alice from 10.0.0.1 port 5 ssh2: ED25519 ${ED_FP}`;
  const host = await collectHost(fakeConn(use));
  assert.equal(host.settings.permitrootlogin, "yes");
  assert.equal(host.keys[0].fingerprint, ED_FP);
  assert.equal(host.keys[0].uses, 1);
  assert.ok(host.keys[0].last_used_ms > 0);
  assert.deepEqual(host.unreadable, ["bob:/home/bob/.ssh/authorized_keys"]);
});

test("scanHosts reports unreachable hosts instead of dropping them", { skip: !have }, async () => {
  const hosts = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  const conns = new Map([["a", fakeConn()]]);
  const r = await scanHosts(hosts, conns);
  assert.equal(r[0].error, null);
  assert.match(r[1].error, /не підключено/);
  const report = core.sshJudge({ hosts: r, now_ms: NOW * 1000 });
  assert.equal(report.hosts_scanned, 1);
  assert.ok(report.findings.some((f) => f.code === "HOST_UNSCANNED" && f.host_id === "b"));
  assert.ok(report.findings.some((f) => f.code === "ROOT_LOGIN" && f.host_id === "a"));
});

// ---- очікувані ключі ----

test("sanitizeExpected validates fingerprints, dedupes and drops unknown hosts", () => {
  const ok = sanitizeExpected([{ fingerprint: ED_FP, owner: "  Alice  ", purpose: "admin", hosts: ["a", "ghost", "a"] }], ["a", "b"]);
  assert.deepEqual(ok, [{ fingerprint: ED_FP, owner: "Alice", purpose: "admin", hosts: ["a"] }]);
  assert.throws(() => sanitizeExpected([{ fingerprint: "SHA256:short" }], []), /відбиток/);
  assert.throws(() => sanitizeExpected([{ fingerprint: ED_FP }, { fingerprint: ED_FP }], []), /повторюється/);
  assert.throws(() => sanitizeExpected("nope", []), /масив/);
  assert.throws(() => sanitizeExpected(Array.from({ length: 2001 }, () => ({})), []), /Забагато/);
});

// ---- експорт ----

const report = (over = {}) => ({
  generated_ms: NOW * 1000,
  hosts_total: 2,
  hosts_scanned: 2,
  keys_total: 3,
  unique_keys: 2,
  expected_declared: true,
  stale_days: 180,
  by_severity: { high: 1, info: 1 },
  truncated: false,
  findings: [
    { code: "KEY_UNKNOWN", severity: "high", host_id: "a", host_name: "=cmd|calc", user: "alice", fingerprint: ED_FP, params: { comment: "alice@private.example" }, title: "Key is not in the expected-keys list", detail: "d", suggestion: "s" },
    { code: "KEY_ON_MANY_HOSTS", severity: "info", host_id: null, host_name: null, user: null, fingerprint: ED_FP, params: {}, title: "Same key on several hosts", detail: "d", suggestion: "s" },
  ],
  ...over,
});

test("export masks key comments by default and includes them on request", () => {
  const masked = JSON.stringify(report().findings.map((f) => f.params));
  assert.ok(masked.includes("alice@private.example"), "fixture sanity");
  assert.ok(!renderCsv(report(), false).includes("alice@private.example"), "CSV never carries key comments");
  assert.ok(!renderCsv(report(), true).includes("alice@private.example"), "CSV has no comment column at all");
  const md = renderMarkdown(report(), { includeComments: false, version: "3.3.0" });
  assert.ok(!md.includes("alice@private.example"));
  assert.match(md, /read-only: nothing was changed/);
  assert.match(md, /masked/);
  assert.match(renderMarkdown(report(), { includeComments: true }), /included/);
});

test("CSV export neutralises formula injection and quotes fields", () => {
  const csv = renderCsv(report(), false);
  assert.match(csv, /"'=cmd\|calc"/, "leading = is neutralised");
  assert.ok(csv.startsWith('"severity","code"'));
  assert.ok(csv.endsWith("\r\n"));
});

test("Markdown export neutralises syntax that a monitored host could inject", () => {
  const evil = report({
    findings: [
      { code: "KEY_UNKNOWN", severity: "high", host_id: "a", host_name: "web", user: "[click](http://evil.example)", fingerprint: ED_FP, params: {}, title: "Key is not in the expected-keys list", detail: "![x](http://evil.example/p.png) <script>", suggestion: "s" },
    ],
  });
  const md = renderMarkdown(evil, {});
  assert.ok(!md.includes("[click](http://evil.example)"), "link must be escaped");
  assert.ok(!md.includes("![x](http"), "image must be escaped");
  assert.ok(!md.includes("<script>"), "html must be escaped");
  assert.match(md, /\\\[click\\\]\\\(http/);
});

test("expected-keys update without a list is rejected, not treated as clear-all", async () => {
  const { mountHygiene } = await import("../server/hygiene.js");
  const routes = {};
  const app = { get: (p, h) => (routes["GET " + p] = h), post: (p, h) => (routes["POST " + p] = h), put: (p, h) => (routes["PUT " + p] = h) };
  mountHygiene(app, { hosts: () => [], conns: new Map(), audit: () => {}, version: "t" });
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  routes["PUT /api/hygiene/expected"]({ body: {} }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.error, /expected/);
});
