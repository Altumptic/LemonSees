// Сповіщення про зміни SSH-гігієни: що вважається зміною, яка серйозність, і головне: коли порівнювати НЕ можна.
import test from "node:test";
import assert from "node:assert/strict";
import { driftIncidents, newKeySeverity } from "../server/hygienealerts.js";

const FP = (n) => `SHA256:${String(n).padStart(43, "A")}`;
const key = (user, n, over = {}) => ({ user, path: `/home/${user}/.ssh/authorized_keys`, key_type: "ssh-ed25519", bits: 256, fingerprint: FP(n), comment: "c", ...over });
const GOOD = { permitrootlogin: "no", passwordauthentication: "no", permitemptypasswords: "no" };
const entry = (keys, over = {}, id = "h1", extra = {}) => ({
  id,
  name: "web-01",
  error: null,
  host: { sshd_source: "sshd -T", settings: { ...GOOD }, keys, unreadable: [], truncated: false, ...over },
  ...extra,
});
const drift = (a, b, opts = {}) => driftIncidents(a, b, opts);

// ---- ключі ----

test("no change, a removed key and a reordered list raise nothing", () => {
  const a = entry([key("alice", 1), key("bob", 2)]);
  assert.deepEqual(drift(a, entry([key("bob", 2), key("alice", 1)])), []);
  assert.deepEqual(drift(a, entry([key("alice", 1)])), [], "a removed key is not an alert");
});

test("a new key becomes an incident with a stable, host-scoped rule", () => {
  const out = drift(entry([key("alice", 1)]), entry([key("alice", 1), key("alice", 2)]), { prevAt: 1_700_000_000_000, nextAt: 1_700_086_400_000 });
  assert.equal(out.length, 1);
  const i = out[0];
  assert.equal(i.rule, `ssh-newkey:h1:alice:${FP(2)}`);
  assert.equal(i.category, "persistence");
  assert.equal(i.severity, "medium");
  assert.match(i.title, /web-01.*alice/);
  assert.match(i.detail, /нічого не змінює/, "says that LemonSees changes nothing");
  assert.ok(i.detail.includes("2023-11-14") && i.detail.includes("2023-11-15"), "the time span between the two scans is stated");
  assert.ok(!i.detail.includes("comment"), "the key comment (names, emails) is not copied into incidents");
});

test("the same key under another account counts as new", () => {
  const out = drift(entry([key("alice", 1)]), entry([key("alice", 1), key("deploy", 1)]));
  assert.equal(out.length, 1);
  assert.match(out[0].rule, /:deploy:/);
});

test("severity of a new key", () => {
  const h = { id: "h1" };
  assert.equal(newKeySeverity(key("alice", 5), h, []), "medium");
  assert.equal(newKeySeverity(key("root", 5), h, []), "high", "a key for root");
  assert.equal(newKeySeverity(key("alice", 5, { key_type: "ssh-rsa", bits: 1024 }), h, []), "high", "weak RSA");
  assert.equal(newKeySeverity(key("alice", 5, { key_type: "ssh-dss", bits: 1024 }), h, []), "high", "DSA");
  assert.equal(newKeySeverity(key("alice", 5, { key_type: "ssh-rsa", bits: 2048 }), h, []), "medium", "2048-bit RSA is fine");
  const exp = [{ fingerprint: FP(5), owner: "Alice", hosts: [] }];
  assert.equal(newKeySeverity(key("alice", 5), h, exp), "low", "a key the analyst declared expected is probably deliberate");
  assert.equal(newKeySeverity(key("root", 5), h, exp), "low", "…even for root");
  assert.equal(newKeySeverity(key("alice", 6), h, exp), "high", "an unlisted key when a list exists");
  assert.equal(newKeySeverity(key("alice", 5), h, [{ fingerprint: FP(5), hosts: ["other"] }]), "high", "listed, but not allowed on this host");
  assert.equal(newKeySeverity(key("alice", 5, { key_type: "ssh-rsa", bits: 1024 }), h, exp), "high", "a weak key is high even when expected");
});

// ---- налаштування ----

test("settings that got worse become incidents; the rest do not", () => {
  const worse = (settings) => drift(entry([]), entry([], { settings: { ...GOOD, ...settings } }));
  assert.equal(worse({ permitrootlogin: "yes" })[0].severity, "high");
  assert.equal(worse({ passwordauthentication: "yes" })[0].severity, "high");
  assert.equal(worse({ permitemptypasswords: "yes" })[0].severity, "critical");
  assert.equal(worse({}).length, 0);
  const both = worse({ permitrootlogin: "yes", permitemptypasswords: "yes" });
  assert.equal(both.length, 2);
  assert.match(both[0].rule, /^ssh-setting:h1:/);
  assert.equal(both[0].category, "misconfiguration");
  // з небезпечного: «prohibit-password» → «yes» теж погіршення
  assert.equal(drift(entry([], { settings: { permitrootlogin: "prohibit-password" } }), entry([], { settings: { permitrootlogin: "yes" } })).length, 1);
});

test("an already unsafe setting that stays unsafe, or gets better, raises nothing", () => {
  const bad = { settings: { ...GOOD, permitrootlogin: "yes" } };
  assert.deepEqual(drift(entry([], bad), entry([], bad)), []);
  assert.deepEqual(drift(entry([], bad), entry([])), [], "fixed");
  assert.deepEqual(drift(entry([], { settings: {} }), entry([], { settings: { permitrootlogin: "yes" } })), [], "no previous value to compare with");
});

// ---- коли порівнювати не можна (захист від хибних тривог) ----

test("GUARD: different settings sources are not compared (exact value vs a default is not a change)", () => {
  const fromFile = entry([], { sshd_source: "file", settings: { ...GOOD } });
  const exact = entry([], { sshd_source: "sshd -T", settings: { ...GOOD, passwordauthentication: "yes" } });
  assert.deepEqual(drift(fromFile, exact), []);
  const none = entry([], { sshd_source: "unavailable", settings: {} });
  assert.deepEqual(drift(none, entry([], { sshd_source: "unavailable", settings: { permitrootlogin: "yes" } })), []);
});

test("GUARD: a truncated scan is not compared for keys", () => {
  const a = entry([key("alice", 1)]);
  assert.deepEqual(drift(a, entry([key("alice", 1), key("alice", 2)], { truncated: true })), []);
  assert.deepEqual(drift(entry([key("alice", 1)], { truncated: true }), entry([key("alice", 1), key("alice", 2)])), []);
});

test("GUARD: an account whose file was unreadable in either scan is skipped", () => {
  const unreadable = ["bob:/home/bob/.ssh/authorized_keys"];
  // bob читався вперше: його ключі не «нові», а просто раніше були недоступні
  assert.deepEqual(drift(entry([key("alice", 1)], { unreadable }), entry([key("alice", 1), key("bob", 2)])), []);
  // і навпаки
  assert.deepEqual(drift(entry([key("alice", 1)]), entry([key("alice", 1), key("bob", 2)], { unreadable })), []);
  // але справжній новий ключ іншого акаунта все одно помічається
  assert.equal(drift(entry([key("alice", 1)], { unreadable }), entry([key("alice", 1), key("alice", 3), key("bob", 2)])).length, 1);
});

test("GUARD: a failed new scan, or no previous data, raises nothing", () => {
  const a = entry([key("alice", 1)]);
  assert.deepEqual(drift(a, entry([key("alice", 1), key("alice", 2)], {}, "h1", { error: "timeout" })), []);
  assert.deepEqual(drift({ id: "h1", name: "x", error: "down", host: {} }, entry([key("alice", 2)])), [], "previous entry holds no usable data");
  assert.deepEqual(drift(undefined, entry([key("alice", 2)])), []);
  assert.deepEqual(drift(a, undefined), []);
});

test("an earlier outage does not hide changes: a previous entry with an error but retained data is still compared", () => {
  const retained = entry([key("alice", 1)], {}, "h1", { error: "timeout" });
  assert.equal(drift(retained, entry([key("alice", 1), key("alice", 2)])).length, 1);
});

// ---- дедуплікація й обмеження ----

test("an incident is not raised again while one is open or was created within a day", () => {
  const a = entry([key("alice", 1)]);
  const b = entry([key("alice", 1), key("alice", 2)]);
  const rule = `ssh-newkey:h1:alice:${FP(2)}`;
  const now = 1_800_000_000_000;
  assert.equal(drift(a, b, { now }).length, 1);
  assert.equal(drift(a, b, { now, existing: [{ rule, status: "open", createdAt: now - 9 * 86_400_000 }] }).length, 0);
  assert.equal(drift(a, b, { now, existing: [{ rule, status: "closed", createdAt: now - 3_600_000 }] }).length, 0);
  assert.equal(drift(a, b, { now, existing: [{ rule, status: "closed", createdAt: now - 3 * 86_400_000 }] }).length, 1);
});

test("one host cannot flood the journal", () => {
  const many = Array.from({ length: 60 }, (_, i) => key("alice", 100 + i));
  assert.equal(drift(entry([]), entry(many)).length, 20);
});

test("names from a hostile host are cleaned before they reach incidents and notifications", () => {
  const out = drift(entry([]), entry([key("al\u0000ice\n\u001b[31m" + "x".repeat(200), 1)], {}, "h1", { name: "we\nb" }));
  assert.ok(!/[\u0000-\u001f\u007f]/.test(out[0].title + out[0].rule + out[0].detail.slice(0, 200)));
  assert.ok(out[0].rule.length < 250);
});

test("garbage input never throws", () => {
  const junk = [null, undefined, {}, { host: null }, { host: { keys: "no", sshd_source: 3 } }, { id: 1, host: { keys: [null, 5, {}], sshd_source: "file", settings: 7 } }];
  for (const a of junk) for (const b of junk) assert.doesNotThrow(() => drift(a, b));
});
