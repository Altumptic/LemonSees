// Зберігання списку хостів у config/hosts.json поряд із програмою.
// Паролі лежать локально на цьому ПК; для безпеки радимо SSH-ключі.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { ENGINES } from "./engines.js";
import { initVault, seal, open } from "./vault.js";

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
const MONITORS_FILE = path.join(CONFIG_DIR, "monitors.json");
const FIM_FILE = path.join(CONFIG_DIR, "fim-baseline.json");
const NETWORK_FILE = path.join(CONFIG_DIR, "network.json");
const INTEGRATIONS_FILE = path.join(CONFIG_DIR, "integrations.json");
const RULES_FILE = path.join(CONFIG_DIR, "rules.json");
const AGENTS_FILE = path.join(CONFIG_DIR, "agents.json");

export { CONFIG_DIR };
initVault(CONFIG_DIR);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
}
const openProxy = (p) => (p ? { ...p, pass: open(p.pass) } : p);
const sealProxy = (p) => (p ? { ...p, pass: seal(p.pass) } : p);

export function loadHosts() {
  const data = readJson(CONFIG_FILE, {});
  const list = Array.isArray(data.hosts) ? data.hosts : [];
  const hosts = list.map((h) => ({ ...h, password: open(h.password), passphrase: open(h.passphrase), proxy: openProxy(h.proxy) }));
  // Міграція: старі відкриті паролі одразу перезаписуємо зашифрованими
  if (list.some((h) => (h.password && !String(h.password).startsWith("enc:")) || (h.passphrase && !String(h.passphrase).startsWith("enc:")))) saveHosts(hosts);
  return hosts;
}

export function saveHosts(hosts) {
  writeJson(CONFIG_FILE, { hosts: hosts.map((h) => ({ ...h, password: seal(h.password), passphrase: seal(h.passphrase), proxy: sealProxy(h.proxy) })) });
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
    jumpHostId: String(input.jumpHostId ?? "").trim(),
    proxy: sanitizeProxy(input.proxy, existing?.proxy),
    hostKey: input.resetHostKey ? "" : existing?.hostKey ?? "",
    tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12) : existing?.tags ?? [],
  };
  if (!h.host) throw new Error("Не вказано адресу хоста");
  if (h.authType === "key" && !h.keyPath) throw new Error("Не вказано шлях до SSH-ключа");
  if (h.authType === "password" && !h.password && existing) h.password = existing.password;
  if (h.authType === "password" && !h.password) throw new Error("Не вказано пароль");
  return h;
}

// Версія хоста без секретів — для віддачі у UI
export function publicHost(h) {
  const { password, passphrase, proxy, ...rest } = h;
  return { ...rest, proxy: publicProxy(proxy), hasPassword: !!password, hasPassphrase: !!passphrase };
}

export function sanitizeProxy(input, existing) {
  const type = ["socks5", "http"].includes(input?.type) ? input.type : "none";
  if (type === "none") return { type: "none", host: "", port: 0, user: "", pass: "" };
  const p = {
    type,
    host: String(input.host ?? "").trim(),
    port: Math.max(1, Math.min(65535, parseInt(input.port, 10) || (type === "socks5" ? 1080 : 8080))),
    user: String(input.user ?? "").trim(),
    pass: input.pass ? String(input.pass) : existing?.pass ?? "",
  };
  if (!p.host) throw new Error("Не вказано адресу проксі");
  return p;
}
export const publicProxy = (p) => (p ? { type: p.type, host: p.host, port: p.port, user: p.user, hasPass: !!p.pass } : { type: "none", host: "", port: 0, user: "", hasPass: false });

/* ---------------- Мережа / приватність ---------------- */

const NET_DEFAULTS = {
  proxy: { type: "none", host: "", port: 0, user: "", pass: "" },
  applySsh: true,
  applyOutbound: true,
  killSwitch: true,
  remoteDns: true,
  hardenedCrypto: true,
  strictHostKeys: true,
};
export function loadNetwork() {
  const d = readJson(NETWORK_FILE, {});
  return { ...NET_DEFAULTS, ...d, proxy: openProxy({ ...NET_DEFAULTS.proxy, ...(d.proxy || {}) }) };
}
export function saveNetwork(input, existing) {
  const n = {
    proxy: sanitizeProxy(input.proxy, existing?.proxy),
    applySsh: input.applySsh !== false,
    applyOutbound: input.applyOutbound !== false,
    killSwitch: input.killSwitch !== false,
    remoteDns: input.remoteDns !== false,
    hardenedCrypto: input.hardenedCrypto !== false,
    strictHostKeys: input.strictHostKeys !== false,
  };
  writeJson(NETWORK_FILE, { ...n, proxy: sealProxy(n.proxy) });
  return n;
}
export const publicNetwork = (n) => ({ ...n, proxy: publicProxy(n.proxy) });

/* ---------------- Інтеграції / правила / агенти ---------------- */

const SECRET_KEYS = ["apiKey", "token", "password", "secret", "webhookUrl", "routingKey", "appKey"];
export function loadIntegrations() {
  const list = readJson(INTEGRATIONS_FILE, { integrations: [] }).integrations || [];
  return list.map((i) => ({ ...i, config: Object.fromEntries(Object.entries(i.config || {}).map(([k, v]) => [k, SECRET_KEYS.includes(k) ? open(v) : v])) }));
}
export function saveIntegrations(list) {
  writeJson(INTEGRATIONS_FILE, {
    integrations: list.map((i) => ({ ...i, config: Object.fromEntries(Object.entries(i.config || {}).map(([k, v]) => [k, SECRET_KEYS.includes(k) ? seal(v) : v])) })),
  });
}
export const publicIntegration = (i) => ({
  ...i,
  config: Object.fromEntries(Object.entries(i.config || {}).map(([k, v]) => [k, SECRET_KEYS.includes(k) ? (v ? "••••••" : "") : v])),
});
export const isSecretKey = (k) => SECRET_KEYS.includes(k);

export const loadRules = () => readJson(RULES_FILE, { rules: [] }).rules || [];
export const saveRules = (rules) => writeJson(RULES_FILE, { rules });

export const loadAgents = () => readJson(AGENTS_FILE, { agents: {} }).agents || {};
export const saveAgents = (agents) => writeJson(AGENTS_FILE, { agents });

/* ---------------- Бази даних ---------------- */

export function loadDbs() {
  const data = readJson(DBS_FILE, {});
  const list = Array.isArray(data.dbs) ? data.dbs : [];
  const dbs = list.map((d) => ({ ...d, password: open(d.password) }));
  if (list.some((d) => d.password && !String(d.password).startsWith("enc:"))) saveDbs(dbs);
  return dbs;
}

export function saveDbs(dbs) {
  writeJson(DBS_FILE, { dbs: dbs.map((d) => ({ ...d, password: seal(d.password) })) });
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
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(INCIDENTS_FILE, JSON.stringify({ incidents }, null, 2), { encoding: "utf8", mode: 0o600 });
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

const SOC_DEFAULTS = { autoIncidents: true, bruteThreshold: 300, notifyDowntime: true, retentionDays: 90, sweepMinutes: 5 };

export function loadSoc() {
  try {
    return { ...SOC_DEFAULTS, ...JSON.parse(fs.readFileSync(SOC_FILE, "utf8")) };
  } catch {
    return { ...SOC_DEFAULTS };
  }
}

/* ---------------- Uptime-монітори (сайти/ендпоінти) ---------------- */

export function loadMonitors() {
  try {
    const data = JSON.parse(fs.readFileSync(MONITORS_FILE, "utf8"));
    return Array.isArray(data.monitors) ? data.monitors : [];
  } catch {
    return [];
  }
}

export function saveMonitors(monitors) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(MONITORS_FILE, JSON.stringify({ monitors }, null, 2), { encoding: "utf8", mode: 0o600 });
}

export function sanitizeMonitor(input, existing = null) {
  let url = String(input.url ?? "").trim();
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  if (!/^https?:\/\/.+/i.test(url)) throw new Error("Некоректний URL (потрібен http/https)");
  const m = {
    id: existing?.id ?? "mon_" + crypto.randomBytes(4).toString("hex"),
    name: String(input.name ?? "").trim() || url.replace(/^https?:\/\//, "").split("/")[0],
    url,
    method: ["GET", "HEAD", "POST"].includes(input.method) ? input.method : "GET",
    expectStatus: parseInt(input.expectStatus, 10) || 0, // 0 = будь-який 2xx/3xx
    intervalSec: Math.max(10, Math.min(3600, parseInt(input.intervalSec, 10) || 60)),
    timeoutMs: Math.max(1000, Math.min(30000, parseInt(input.timeoutMs, 10) || 10000)),
    enabled: input.enabled === undefined ? true : !!input.enabled,
  };
  return m;
}

export function saveSoc(cfg) {
  const clean = {
    autoIncidents: !!cfg.autoIncidents,
    bruteThreshold: Math.max(10, Math.min(100000, parseInt(cfg.bruteThreshold, 10) || SOC_DEFAULTS.bruteThreshold)),
    notifyDowntime: cfg.notifyDowntime !== false,
    retentionDays: Math.max(7, Math.min(3650, parseInt(cfg.retentionDays, 10) || SOC_DEFAULTS.retentionDays)),
    sweepMinutes: Math.max(1, Math.min(120, parseInt(cfg.sweepMinutes, 10) || SOC_DEFAULTS.sweepMinutes)),
  };
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(SOC_FILE, JSON.stringify(clean, null, 2), { encoding: "utf8", mode: 0o600 });
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
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(ATTEST_FILE, JSON.stringify(map, null, 2), { encoding: "utf8", mode: 0o600 });
}

/* ---------------- Аудит-журнал (JSONL) ---------------- */

export function appendAudit(entry) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    fs.appendFileSync(AUDIT_FILE, JSON.stringify({ at: Date.now(), ...entry }) + "\n", { encoding: "utf8", mode: 0o600 });
  } catch {
    /* ignore */
  }
}

/** Обрізає журнал аудиту до retentionDays. */
export function pruneAudit(days) {
  try {
    const cutoff = Date.now() - days * 86400000;
    const lines = fs.readFileSync(AUDIT_FILE, "utf8").split("\n").filter(Boolean);
    const keep = lines.filter((l) => {
      try {
        return JSON.parse(l).at >= cutoff;
      } catch {
        return false;
      }
    });
    if (keep.length !== lines.length) fs.writeFileSync(AUDIT_FILE, keep.join("\n") + (keep.length ? "\n" : ""), { encoding: "utf8", mode: 0o600 });
    return lines.length - keep.length;
  } catch {
    return 0;
  }
}

/* ---------------- FIM — базові лінії ---------------- */

export function loadFimBaselines() {
  try {
    return JSON.parse(fs.readFileSync(FIM_FILE, "utf8"));
  } catch {
    return {};
  }
}

export function saveFimBaselines(all) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(FIM_FILE, JSON.stringify(all), { encoding: "utf8", mode: 0o600 });
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
