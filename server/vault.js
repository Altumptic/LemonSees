// Сховище секретів: AES-256-GCM для паролів, passphrase, токенів інтеграцій у конфігу.
// Джерело ключа (за пріоритетом):
//   1) LEMONSEES_MASTER_KEY — парольна фраза (scrypt) — зручно для серверів/Docker;
//   2) LEMONSEES_VAULT_KEY  — 64 hex (передає Electron, ключ захищений ОС через safeStorage);
//   3) файл <config>/.vault.key (32 випадкові байти, права 0600) — створюється автоматично.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PREFIX = "enc:v1:";
let KEY = null;
let SOURCE = "file";

export function initVault(configDir) {
  if (process.env.LEMONSEES_MASTER_KEY) {
    KEY = crypto.scryptSync(process.env.LEMONSEES_MASTER_KEY, "lemonsees-vault-v1", 32);
    SOURCE = "passphrase";
    return;
  }
  if (/^[0-9a-f]{64}$/i.test(process.env.LEMONSEES_VAULT_KEY || "")) {
    KEY = Buffer.from(process.env.LEMONSEES_VAULT_KEY, "hex");
    SOURCE = "os-keychain";
    return;
  }
  const file = path.join(configDir, ".vault.key");
  try {
    KEY = fs.readFileSync(file);
    if (KEY.length !== 32) throw new Error("bad key");
  } catch {
    fs.mkdirSync(configDir, { recursive: true });
    KEY = crypto.randomBytes(32);
    fs.writeFileSync(file, KEY, { mode: 0o600 });
  }
  SOURCE = "file";
}

export const vaultInfo = () => ({ algorithm: "AES-256-GCM", keySource: SOURCE });

export function seal(plain) {
  if (!plain || typeof plain !== "string" || plain.startsWith(PREFIX)) return plain || "";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

export function open(value) {
  if (!value || typeof value !== "string" || !value.startsWith(PREFIX)) return value || "";
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", KEY, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return ""; // інший ключ — секрет недоступний, користувач введе заново
  }
}

/** Шифрує / розшифровує вказані поля обʼєкта. */
export const sealFields = (obj, keys) => {
  const o = { ...obj };
  for (const k of keys) if (o[k]) o[k] = seal(o[k]);
  return o;
};
export const openFields = (obj, keys) => {
  const o = { ...obj };
  for (const k of keys) if (o[k]) o[k] = open(o[k]);
  return o;
};

/* ---------------- Шифрований бекап (PSB §2.2) ---------------- */
// scrypt (N=2^15, r=8, p=1) → AES-256-GCM. Формат версіонований.
const BK = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function encryptBackup(obj, passphrase) {
  if (!passphrase || passphrase.length < 10) throw new Error("Пароль бекапу — щонайменше 10 символів");
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, BK);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return { format: "lemonsees-backup", version: 1, kdf: { name: "scrypt", N: BK.N, r: BK.r, p: BK.p, salt: salt.toString("base64") }, cipher: "aes-256-gcm", iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") };
}

export function decryptBackup(blob, passphrase) {
  if (blob?.format !== "lemonsees-backup" || blob.version !== 1 || blob.kdf?.name !== "scrypt" || blob.cipher !== "aes-256-gcm") throw new Error("Невідомий формат бекапу");
  const key = crypto.scryptSync(passphrase || "", Buffer.from(blob.kdf.salt, "base64"), 32, { N: blob.kdf.N, r: blob.kdf.r, p: blob.kdf.p, maxmem: BK.maxmem });
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "base64"));
    d.setAuthTag(Buffer.from(blob.tag, "base64"));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(blob.data, "base64")), d.final()]).toString("utf8"));
  } catch {
    throw new Error("Невірний пароль або пошкоджений файл");
  }
}
