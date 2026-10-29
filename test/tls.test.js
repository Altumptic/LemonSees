// HTTPS-режим: самопідписаний сертифікат має бути SHA-256 / RSA-2048, з SAN і чесним терміном дії (PSB §2.1).
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateSelfSigned, loadTls } from "../server/tls.js";

test("self-signed certificate uses RSA-2048 + SHA-256 and covers localhost", async () => {
  const pems = await generateSelfSigned();
  const x = new crypto.X509Certificate(pems.cert);
  assert.match(x.subjectAltName, /DNS:localhost/);
  assert.match(x.subjectAltName, /IP Address:127\.0\.0\.1/);
  assert.equal(x.publicKey.asymmetricKeyDetails.modulusLength, 2048);
  const days = (Date.parse(x.validTo) - Date.now()) / 86400000;
  assert.ok(days > 800 && days < 830, `validity ${days} days`);
  assert.ok(x.verify(x.publicKey));
  // Алгоритм підпису в DER: sha256WithRSAEncryption (1.2.840.113549.1.1.11), не sha1WithRSAEncryption (…1.1.5)
  const der = x.raw.toString("hex");
  assert.ok(der.includes("06092a864886f70d01010b"), "expected SHA-256 signature OID");
  assert.ok(!der.includes("06092a864886f70d010105"), "SHA-1 signature is forbidden by PSB");
  const key = crypto.createPrivateKey(pems.private);
  assert.equal(key.asymmetricKeyType, "rsa");
});

test("LEMONSEES_TLS=self creates the certificate once with a 0600 key and reuses it", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lemonsees-tls-"));
  const first = await loadTls(dir, { LEMONSEES_TLS: "self" });
  assert.ok(first?.cert && first?.key);
  if (process.platform !== "win32") assert.equal(fs.statSync(path.join(dir, "tls", "key.pem")).mode & 0o077, 0);
  const second = await loadTls(dir, { LEMONSEES_TLS: "self" });
  assert.equal(second.cert.toString(), first.cert.toString());
});

test("without TLS settings the engine stays on HTTP (null)", async () => {
  assert.equal(await loadTls(os.tmpdir(), {}), null);
});
