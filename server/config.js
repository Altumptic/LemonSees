// Зберігання списку хостів у config/hosts.json поряд із програмою.
// Паролі лежать локально на цьому ПК; для безпеки радимо SSH-ключі.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { ENGINES } from "./engines.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(__dirname, "..");
// В Electron конфіг живе у профілі користувача (SHOK_CONFIG_DIR),
// при запуску через node — у папці програми.
const CONFIG_DIR = process.env.SHOK_CONFIG_DIR || path.join(APP_ROOT, "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "hosts.json");
const DBS_FILE = path.join(CONFIG_DIR, "dbs.json");

export function loadHosts() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data.hosts) ? data.hosts : [];
  } catch {
    return [];
  }
}

export function saveHosts(hosts) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ hosts }, null, 2), "utf8");
}

export function newHostId() {
  return "h_" + crypto.randomBytes(4).toString("hex");
}

// Нормалізація запису хоста з форми
export function sanitizeHost(input, existing = null) {
  const h = {
    id: existing?.id ?? newHostId(),
    name: String(input.name ?? "").trim() || String(input.host ?? "").trim(),
    host: String(input.host ?? "").trim(),
    port: Math.max(1, Math.min(65535, parseInt(input.port, 10) || 22)),
    user: String(input.user ?? "root").trim() || "root",
    authType: input.authType === "password" ? "password" : "key",
    keyPath: String(input.keyPath ?? "").trim(),
    passphrase: input.passphrase ? String(input.passphrase) : "",
    password: input.password ? String(input.password) : "",
    interval: Math.max(2, Math.min(120, parseInt(input.interval, 10) || 5)),
  };
  if (!h.host) throw new Error("Не вказано адресу хоста");
  if (h.authType === "key" && !h.keyPath) throw new Error("Не вказано шлях до SSH-ключа");
  if (h.authType === "password" && !h.password && existing) h.password = existing.password;
  if (h.authType === "password" && !h.password) throw new Error("Не вказано пароль");
  return h;
}

// Версія хоста без секретів — для віддачі у UI
export function publicHost(h) {
  const { password, passphrase, ...rest } = h;
  return { ...rest, hasPassword: !!password, hasPassphrase: !!passphrase };
}

/* ---------------- Бази даних ---------------- */

export function loadDbs() {
  try {
    const data = JSON.parse(fs.readFileSync(DBS_FILE, "utf8"));
    return Array.isArray(data.dbs) ? data.dbs : [];
  } catch {
    return [];
  }
}

export function saveDbs(dbs) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(DBS_FILE, JSON.stringify({ dbs }, null, 2), "utf8");
}

export function newDbId() {
  return "db_" + crypto.randomBytes(4).toString("hex");
}

export function sanitizeDb(input, existing = null) {
  const meta = ENGINES[input.type];
  if (!meta) throw new Error("Невідомий тип бази даних");
  const type = input.type;
  const d = {
    id: existing?.id ?? newDbId(),
    hostId: String(input.hostId ?? "").trim(),
    name: String(input.name ?? "").trim(),
    type,
    dbHost: String(input.dbHost ?? "127.0.0.1").trim() || "127.0.0.1",
    dbPort: Math.max(0, Math.min(65535, parseInt(input.dbPort, 10) || meta.port)),
    user: String(input.user ?? "").trim(),
    database: String(input.database ?? "").trim(),
    dbFile: String(input.dbFile ?? "").trim(),
    password: input.password ? String(input.password) : "",
  };
  if (!d.hostId) throw new Error("Не вибрано хост (SSH)");
  if (meta.file && !d.dbFile) throw new Error("Не вказано шлях до файлу .db");
  if (!d.name) d.name = meta.file ? `${meta.label}: ${d.dbFile}` : `${meta.label} @ ${d.dbHost}:${d.dbPort}`;
  if (!input.password && existing) d.password = existing.password;
  return d;
}

export function publicDb(d) {
  const { password, ...rest } = d;
  return { ...rest, hasPassword: !!password };
}
