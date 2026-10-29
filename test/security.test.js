// Негативні тести безпеки (PSB §7): fail-closed, цілісність шифрування, Host/Origin, розбір недовіреного вводу.
// Запуск: npm test  (node --test, без зовнішніх залежностей)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lemonsees-test-"));
process.env.SHOK_CONFIG_DIR = tmp;

const vault = await import("../server/vault.js");
vault.initVault(tmp);

test("vault: AES-256-GCM roundtrip, values are not stored in clear", () => {
  const sealed = vault.seal("hunter2-secret");
  assert.match(sealed, /^enc:v1:/);
  assert.ok(!sealed.includes("hunter2"));
  assert.equal(vault.open(sealed), "hunter2-secret");
});

test("vault: tampered ciphertext is rejected (fail closed → empty)", () => {
  const sealed = vault.seal("top-secret");
  const raw = Buffer.from(sealed.slice(7), "base64");
  raw[raw.length - 1] ^= 0xff;
  assert.equal(vault.open("enc:v1:" + raw.toString("base64")), "");
});

test("vault: key file is created with owner-only permissions", () => {
  const st = fs.statSync(path.join(tmp, ".vault.key"));
  assert.equal(st.size, 32);
  if (process.platform !== "win32") assert.equal(st.mode & 0o077, 0);
});

test("backup: scrypt + AES-256-GCM, wrong passphrase fails, short passphrase refused", () => {
  const blob = vault.encryptBackup({ a: 1 }, "correct horse battery");
  assert.equal(blob.kdf.name, "scrypt");
  assert.equal(blob.cipher, "aes-256-gcm");
  assert.deepEqual(vault.decryptBackup(blob, "correct horse battery"), { a: 1 });
  assert.throws(() => vault.decryptBackup(blob, "wrong passphrase!!"));
  assert.throws(() => vault.encryptBackup({}, "short"));
  assert.throws(() => vault.decryptBackup({ ...blob, cipher: "aes-128-cbc" }, "correct horse battery"));
});

/* ---------------- Kill switch ---------------- */

const netp = await import("../server/netproxy.js");

async function deadPort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return port;
}

test("kill switch: SSH never falls back to a direct connection when the proxy is down", async () => {
  netp.setNetConfig({ proxy: { type: "socks5", host: "127.0.0.1", port: await deadPort() }, killSwitch: true, applySsh: true });
  await assert.rejects(netp.sshSocket({ host: "192.0.2.10", port: 22 }), /kill switch/);
});

test("kill switch: outbound HTTP never goes direct when the proxy is down", async () => {
  netp.setNetConfig({ proxy: { type: "socks5", host: "127.0.0.1", port: await deadPort() }, killSwitch: true, applyOutbound: true });
  await assert.rejects(netp.netFetch("https://example.com/", { signal: AbortSignal.timeout(5000) }));
});

test("without kill switch the operator explicitly allows direct fallback", async () => {
  netp.setNetConfig({ proxy: { type: "socks5", host: "127.0.0.1", port: await deadPort() }, killSwitch: false, applySsh: true });
  assert.equal(await netp.sshSocket({ host: "192.0.2.10", port: 22 }), null);
  netp.setNetConfig({ proxy: { type: "none", host: "", port: 0 }, killSwitch: true });
});

test("hardened SSH algorithms exclude SHA-1 and legacy ciphers", () => {
  netp.setNetConfig({ hardenedCrypto: true });
  const a = netp.sshAlgorithms();
  const all = [...a.kex, ...a.cipher, ...a.hmac, ...a.serverHostKey].join(" ");
  assert.ok(!/sha1|cbc|3des|arcfour|ssh-rsa\b|ssh-dss/.test(all), all);
});

test("hardened SSH algorithms are all supported by ssh2 in this runtime (no 'Unsupported algorithm')", async () => {
  netp.setNetConfig({ hardenedCrypto: true });
  const { createRequire } = await import("node:module");
  const c = createRequire(import.meta.url)("ssh2/lib/protocol/constants.js");
  const a = netp.sshAlgorithms();
  const sup = { kex: c.SUPPORTED_KEX, cipher: c.SUPPORTED_CIPHER, hmac: c.SUPPORTED_MAC, serverHostKey: c.SUPPORTED_SERVER_HOST_KEY };
  for (const k of Object.keys(sup)) {
    assert.ok(a[k].length > 0, `${k} must not be empty`);
    for (const alg of a[k]) assert.ok(sup[k].includes(alg), `${alg} not supported by ssh2`);
  }
  assert.ok(a.cipher.some((x) => /gcm/.test(x)), "an AEAD cipher must remain");
});

/* ---------------- Host / Origin guard ---------------- */

const { createGuard } = await import("../server/guard.js");
const req = (host, origin) => ({ headers: { host, ...(origin ? { origin } : {}) } });

test("guard: local mode rejects foreign Host headers (DNS rebinding)", () => {
  const g = createGuard({ bindHost: "127.0.0.1" });
  assert.equal(g.hostOk(req("127.0.0.1:5199")), true);
  assert.equal(g.hostOk(req("localhost:5199")), true);
  assert.equal(g.hostOk(req("evil.example:5199")), false);
});

test("guard: cross-site Origin is refused for API and WebSocket", () => {
  const g = createGuard({ bindHost: "127.0.0.1" });
  assert.equal(g.originOk(req("127.0.0.1:5199", "http://127.0.0.1:5199")), true);
  assert.equal(g.originOk(req("127.0.0.1:5199", "https://evil.example")), false);
  assert.equal(g.originOk(req("127.0.0.1:5199", "null")), false);
  assert.equal(g.upgradeOk(req("127.0.0.1:5199", "https://evil.example")), false);
  assert.equal(g.originOk(req("127.0.0.1:5199")), true); // не браузер (агент/curl)
});

/* ---------------- Недовірений ввід ---------------- */

test("agent ingest sanitises untrusted samples", async () => {
  const { sanitizeSample } = await import("../server/agent.js");
  const s = sanitizeSample({ at: 1, cpu: 9999, mem: -5, fim: "x".repeat(500), host: "<script>", extra: "drop" });
  assert.equal(s.cpu, 100);
  assert.equal(s.mem, 0);
  assert.equal(s.fim.length, 32);
  assert.equal("extra" in s, false);
});

test("integration secrets are kept when the masked value is sent back", async () => {
  const { sanitizeIntegration } = await import("../server/integrations.js");
  const first = sanitizeIntegration({ type: "slack", config: { webhookUrl: "https://hooks.example/abc" } });
  const again = sanitizeIntegration({ type: "slack", config: { webhookUrl: "••••••" } }, first);
  assert.equal(again.config.webhookUrl, "https://hooks.example/abc");
  assert.throws(() => sanitizeIntegration({ type: "unknown" }));
});

test("FIM detects modified, added and missing files against the baseline", async () => {
  const { diffFim } = await import("../server/fim.js");
  const base = { at: 1, files: [{ path: "/etc/a", sha256: "1", mode: "644", owner: "root" }, { path: "/etc/b", sha256: "2", mode: "644", owner: "root" }] };
  const r = diffFim([{ path: "/etc/a", sha256: "X", mode: "644", owner: "root" }, { path: "/etc/c", sha256: "3", mode: "644", owner: "root" }], base);
  const st = Object.fromEntries(r.files.map((f) => [f.path, f.status]));
  assert.deepEqual(st, { "/etc/a": "modified", "/etc/c": "added", "/etc/b": "missing" });
  assert.equal(r.changed, 3);
});
