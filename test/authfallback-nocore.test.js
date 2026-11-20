// Підозрілі входи БЕЗ Rust-ядра: сповіщення не повинні від нього залежати.
// Ядро вимикається ще до імпорту модулів, тож `core.available()` тут false (як при відсутньому .wasm чи LEMONSEES_CORE=off).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.LEMONSEES_CORE = "off";
process.env.SHOK_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ls-nocore-cfg-"));
const { core } = await import("../server/core/index.js");
const { scanSuspects } = await import("../server/threats.js");
const { newIncidents } = await import("../server/suspects.js");

const NOW = 1_793_780_101; // 2026-11-04T08:15:01Z
const stamp = (i) => `2026-11-04T10:${String(i).padStart(2, "0")}:00+0200`;
const failed = (ip, n) => Array.from({ length: n }, (_, i) => `${stamp(i)} srv sshd[${i}]: Failed password for root from ${ip} port 4000${i} ssh2`);
const accepted = (ip, method = "password") => `${stamp(30)} srv sshd[9]: Accepted ${method} for root from ${ip} port 40010 ssh2`;
const fakeConn = (logLines) => ({ exec: async () => ({ code: 0, stderr: "", truncated: false, stdout: `@@NOW@@ ${NOW} +0200\n${logLines.join("\n")}\n` }) });

test("precondition: the core really is off in this process", () => {
  assert.equal(core.available(), false);
  assert.equal(core.info().backend, "none");
});

test("without the core, a success after a run of failures still becomes an incident", async () => {
  const r = await scanSuspects(fakeConn([...failed("198.51.100.9", 12), accepted("198.51.100.9")]));
  assert.equal(r.engine, "js", "the fallback did the work");
  assert.equal(r.suspects.length, 1);
  const [inc] = newIncidents({ id: "h1", name: "web-01" }, r.suspects, []);
  assert.equal(inc.severity, "critical");
  assert.match(inc.title, /198\.51\.100\.9/);
});

test("without the core, the same threshold and the same quiet cases apply", async () => {
  assert.equal((await scanSuspects(fakeConn([...failed("198.51.100.9", 6), accepted("198.51.100.9")]))).suspects.length, 0, "6 < default threshold 10");
  assert.equal((await scanSuspects(fakeConn([...failed("198.51.100.9", 12), accepted("198.51.100.77")]))).suspects.length, 0, "another address");
  const lan = await scanSuspects(fakeConn([...failed("10.0.0.9", 12), accepted("10.0.0.9", "publickey")]));
  assert.equal(lan.suspects[0].private, true);
  assert.equal(newIncidents({ id: "h", name: "n" }, lan.suspects, [])[0].severity, "low");
});

test("without the core, a host that fails to answer still yields null, not an exception", async () => {
  assert.equal(await scanSuspects({ exec: async () => { throw new Error("lost"); } }), null);
});
