// Регресійні тести на виправлення з аналізу CodeQL (chore/security-triage).
import test from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../server/netops.js";
import { declarativeOnly } from "../server/db.js";

const fakeConn = { exec: async () => ({ stdout: "ok", code: 0, stderr: "" }) };

test("netops: prototype keys are not treated as tools", async () => {
  for (const tool of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    await assert.rejects(() => runTool(fakeConn, tool, "example.com"), /Невідомий інструмент/, tool);
  }
});

test("netops: a real tool still runs", async () => {
  const r = await runTool(fakeConn, "dig", "example.com");
  assert.equal(r.tool, "dig");
});

test("db: Mongo server-side JS operators are refused at any depth", () => {
  assert.throws(() => declarativeOnly({ $where: "sleep(1000)" }), /\$where/);
  assert.throws(() => declarativeOnly({ a: { b: [{ $function: {} }] } }), /\$function/);
  assert.throws(() => declarativeOnly({ x: { $accumulator: {} } }), /\$accumulator/);
  const ok = { status: "open", n: { $gt: 3 } };
  assert.equal(declarativeOnly(ok), ok);
});
