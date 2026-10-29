// HTTPS для веб-режиму: власний сертифікат (LEMONSEES_TLS_CERT / LEMONSEES_TLS_KEY)
// або самопідписаний (LEMONSEES_TLS=self), що генерується один раз і зберігається в <config>/tls.
// PSB §2.1: RSA-2048 + SHA-256 (selfsigned за замовчуванням підписує SHA-1 — тому задаємо явно).
import fs from "node:fs";
import path from "node:path";
import selfsigned from "selfsigned";

const DAY = 86400000;

export async function generateSelfSigned() {
  const now = new Date();
  return selfsigned.generate([{ name: "commonName", value: "lemonsees.local" }], {
    keyType: "rsa",
    keySize: 2048,
    algorithm: "sha256",
    notBeforeDate: new Date(now.getTime() - DAY), // допуск на розбіжність годинників
    notAfterDate: new Date(now.getTime() + 825 * DAY), // ліміт браузерів для серверних сертифікатів
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
      { name: "extKeyUsage", serverAuth: true },
      { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] },
    ],
  });
}

/** Повертає { cert, key } або null (HTTP). Помилка конфігурації TLS не валить двигун, але пишеться в лог. */
export async function loadTls(configDir, env = process.env) {
  try {
    if (env.LEMONSEES_TLS_CERT && env.LEMONSEES_TLS_KEY) {
      return { cert: fs.readFileSync(env.LEMONSEES_TLS_CERT), key: fs.readFileSync(env.LEMONSEES_TLS_KEY) };
    }
    if (env.LEMONSEES_TLS === "self") {
      const dir = path.join(configDir, "tls");
      const cf = path.join(dir, "cert.pem");
      const kf = path.join(dir, "key.pem");
      if (!fs.existsSync(cf) || !fs.existsSync(kf)) {
        const pems = await generateSelfSigned();
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(cf, pems.cert);
        fs.writeFileSync(kf, pems.private, { mode: 0o600 });
      }
      return { cert: fs.readFileSync(cf), key: fs.readFileSync(kf) };
    }
  } catch (e) {
    console.error("  ✖ TLS:", e.message);
  }
  return null;
}
