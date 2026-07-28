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
const INCIDENTS_FILE = path.join(CONFIG_DIR, "incidents.json");
const ATTEST_FILE = path.join(CONFIG_DIR, "attestations.json");
const AUDIT_FILE = path.join(CONFIG_DIR, "audit.jsonl");
const SOC_FILE = path.join(CONFIG_DIR, "soc.json");

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

/* ---------------- Інциденти (SOC) ---------------- */

const SEVERITIES = ["critical", "high", "medium", "low", "info"];
const STATUSES = ["open", "investigating", "mitigated", "closed"];

export function loadIncidents() {
  try {
    const data = JSON.parse(fs.readFileSync(INCIDENTS_FILE, "utf8"));
    return Array.isArray(data.incidents) ? data.incidents : [];
  } catch {
    return [];
  }
}

export function saveIncidents(incidents) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(INCIDENTS_FILE, JSON.stringify({ incidents }, null, 2), "utf8");
}

export function sanitizeIncident(input, existing = null) {
  const now = Date.now();
  const inc = {
    id: existing?.id ?? "inc_" + crypto.randomBytes(4).toString("hex"),
    title: String(input.title ?? "").trim(),
    severity: SEVERITIES.includes(input.severity) ? input.severity : "medium",
    status: STATUSES.includes(input.status) ? input.status : "open",
    hostId: String(input.hostId ?? "").trim(),
    assignee: String(input.assignee ?? "").trim(),
    detail: String(input.detail ?? "").trim(),
    category: String(input.category ?? "").trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    timeline: Array.isArray(existing?.timeline) ? existing.timeline : [],
    auto: existing?.auto ?? !!input.auto,
    rule: existing?.rule ?? String(input.rule ?? ""),
  };
  if (!inc.title) throw new Error("Не вказано назву інциденту");
  return inc;
}

/* ---------------- SOC-конфіг (пороги, автоінциденти) ---------------- */

const SOC_DEFAULTS = { autoIncidents: true, bruteThreshold: 300 };

export function loadSoc() {
  try {
    return { ...SOC_DEFAULTS, ...JSON.parse(fs.readFileSync(SOC_FILE, "utf8")) };
  } catch {
    return { ...SOC_DEFAULTS };
  }
}

export function saveSoc(cfg) {
  const clean = {
    autoIncidents: !!cfg.autoIncidents,
    bruteThreshold: Math.max(10, Math.min(100000, parseInt(cfg.bruteThreshold, 10) || SOC_DEFAULTS.bruteThreshold)),
  };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SOC_FILE, JSON.stringify(clean, null, 2), "utf8");
  return clean;
}

/* ---------------- Атестації (GRC ручні контролі) ---------------- */

export function loadAttest() {
  try {
    return JSON.parse(fs.readFileSync(ATTEST_FILE, "utf8")) || {};
  } catch {
    return {};
  }
}

export function saveAttest(map) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(ATTEST_FILE, JSON.stringify(map, null, 2), "utf8");
}

/* ---------------- Аудит-журнал (JSONL) ---------------- */

export function appendAudit(entry) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_FILE, JSON.stringify({ at: Date.now(), ...entry }) + "\n", "utf8");
  } catch {
    /* ignore */
  }
}

export function loadAudit(limit = 500) {
  try {
    const lines = fs.readFileSync(AUDIT_FILE, "utf8").trim().split("\n").filter(Boolean);
    const out = [];
    for (const l of lines.slice(-limit)) {
      try {
        out.push(JSON.parse(l));
      } catch {
        /* skip */
      }
    }
    return out.reverse();
  } catch {
    return [];
  }
}
