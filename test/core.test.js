// Тести Rust-ядра (WASM) та його інтеграції. Якщо .wasm не зібрано (npm run build:core) — тести ядра пропускаються,
// а перевіряється лише те, що сервер коректно працює без нього.
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "../server/core/index.js";
import { collectThreats } from "../server/threats.js";
import { diffFim } from "../server/fim.js";

const have = core.available();
const NOW = 1793780101000; // 2026-11-04T08:15:01Z
const o = { now_ms: NOW, tz_offset_min: 120 };
const line = (t, rest) => `${t} srv sshd[1]: ${rest}`;

test("core: backend info is honest", () => {
  const i = core.info();
  if (have) {
    assert.equal(i.backend, "wasm");
    assert.match(i.sha256, /^[0-9a-f]{64}$/);
  } else {
    assert.equal(i.backend, "none");
    assert.ok(i.reason);
  }
});

test("core: auth analysis counts attempts, not duplicate lines", { skip: !have }, () => {
  const log = [
    line("2026-11-04T10:10:01+0200", "Invalid user admin from 203.0.113.9 port 1"),
    line("2026-11-04T10:10:01+0200", "Failed password for invalid user admin from 203.0.113.9 port 1 ssh2"),
    line("2026-11-04T10:11:01+0200", "Failed password for root from 2001:db8::7 port 2 ssh2"),
  ].join("\n");
  const r = core.auth(log, o);
  assert.equal(r.total, 2);
  assert.equal(r.attackers.find((a) => a.ip === "203.0.113.9").count, 1);
  assert.ok(r.attackers.some((a) => a.ip === "2001:db8::7"));
});

test("core: success after brute force becomes a suspect", { skip: !have }, () => {
  const fails = Array.from({ length: 6 }, (_, i) => line(`2026-11-04T10:1${i}:00+0200`, `Failed password for root from 198.51.100.7 port ${i} ssh2`));
  const r = core.auth([...fails, line("2026-11-04T10:14:30+0200", "Accepted password for root from 198.51.100.7 port 9 ssh2")].join("\n"), o);
  assert.equal(r.suspects.length, 1);
  assert.equal(r.suspects[0].ip, "198.51.100.7");
});

test("core: rules are linear-time (no ReDoS) and bad patterns are rejected", { skip: !have }, () => {
  const text = ("a".repeat(3000) + "!\n").repeat(200);
  const t0 = Date.now();
  const r = core.rules(text, [{ id: "evil", pattern: "^(a+)+$", threshold: 1, window_min: 15 }], o);
  assert.ok(Date.now() - t0 < 2000, "catastrophic pattern must stay fast");
  assert.equal(r.results[0].matches, 0);
  const bad = core.rules("x", [{ id: "bad", pattern: "(?=x)" }], o);
  assert.equal(bad.error.rule_id, "bad");
});

test("core: garbage input never crashes the instance", { skip: !have }, () => {
  const junk = "\u0000\uFFFD".repeat(5000) + "\nsshd Failed password for \u0000 from \n" + "x".repeat(200000);
  assert.ok(core.auth(junk, o));
  assert.ok(core.rules(junk, [{ id: "a", pattern: "x", threshold: 1 }], o));
  assert.ok(core.auth("ok", o));
});

test("fim: unreadable hash is not a change; mode change is (core and JS agree)", () => {
  const base = { at: 1, files: [{ path: "/etc/shadow", sha256: "abc", size: 1, mode: "640", owner: "root", mtime: 0 }] };
  const same = [{ path: "/etc/shadow", sha256: "?", size: 1, mode: "640", owner: "root", mtime: 0 }];
  const chmod = [{ path: "/etc/shadow", sha256: "abc", size: 1, mode: "666", owner: "root", mtime: 0 }];
  assert.equal(diffFim(same, base).changed, 0);
  const r = diffFim(chmod, base);
  assert.equal(r.changed, 1);
  assert.equal(r.files[0].status, "modified");
});

test("threats: collectThreats works through a fake SSH connection (core path and awk fallback)", async () => {
  const log = Array.from({ length: 4 }, (_, i) => line("2026-11-04T10:10:0" + i + "+0200", "Failed password for root from 203.0.113.9 port 1 ssh2")).join("\n");
  const conn = {
    async exec(cmd) {
      if (cmd.includes("@@NOW@@")) return { code: 0, stdout: `@@NOW@@ ${NOW / 1000} +0200\n${log}\n`, stderr: "" };
      return { code: 0, stdout: "@@FAILED@@\n4 203.0.113.9\n@@USERS@@\n@@ACCEPTED@@\n@@TOTAL@@\n4\n@@END@@\n", stderr: "" };
    },
  };
  const r = await collectThreats(conn, { geo: false });
  assert.equal(r.total, 4);
  assert.equal(r.attackers[0].ip, "203.0.113.9");
  assert.equal(r.engine, have ? "rust-wasm" : "awk");
});

test("audit: hash chain detects tampering", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ls-audit-"));
  process.env.SHOK_CONFIG_DIR = dir;
  const cfg = await import("../server/config.js?audit");
  for (let i = 0; i < 4; i++) cfg.appendAudit({ actor: "t", action: "a" + i });
  assert.equal(cfg.verifyAudit().ok, true);
  const f = path.join(dir, "audit.jsonl");
  const lines = fs.readFileSync(f, "utf8").trim().split("\n");
  lines[1] = lines[1].replace("a1", "aX");
  fs.writeFileSync(f, lines.join("\n") + "\n");
  assert.equal(cfg.verifyAudit().brokenAt, 2);
});
