// Зберігання списку хостів у config/hosts.json поряд із програмою.
// Паролі лежать локально на цьому ПК; для безпеки радимо SSH-ключі.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(__dirname, "..");
// В Electron конфіг живе у профілі користувача (SHOK_CONFIG_DIR),
// при запуску через node — у папці програми.
const CONFIG_DIR = process.env.SHOK_CONFIG_DIR || path.join(APP_ROOT, "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "hosts.json");

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
