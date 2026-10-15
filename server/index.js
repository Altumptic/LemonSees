// LemonSees by Altumptic — двигун SOC-платформи.
// За замовчуванням слухає лише 127.0.0.1. Веб-режим (LEMONSEES_HOST=0.0.0.0) вимагає LEMONSEES_TOKEN.
// На віддалені сервери нічого не встановлюється.
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { exec as cpExec } from "node:child_process";
import express from "express";
import { WebSocketServer } from "ws";

import {
  APP_ROOT,
  loadHosts,
  saveHosts,
  sanitizeHost,
  publicHost,
  loadDbs,
  saveDbs,
  sanitizeDb,
  publicDb,
  loadIncidents,
  saveIncidents,
  sanitizeIncident,
  loadAttest,
  saveAttest,
  appendAudit,
  loadAudit,
  loadSoc,
  saveSoc,
  loadMonitors,
  saveMonitors,
  sanitizeMonitor,
  pruneAudit,
  loadFimBaselines,
  saveFimBaselines,
} from "./config.js";
import { scanFim, diffFim } from "./fim.js";
import { mountAuth, isAuthed, authEnabled } from "./auth.js";
import { Uptime } from "./uptime.js";
import { HostConnection } from "./ssh.js";
import { Poller } from "./collector.js";
import * as dbmod from "./db.js";
import { engineFamily } from "./engines.js";
import { collectSecurity } from "./security.js";
import { runAuto, AUTO_CONTROLS, MANUAL_CONTROLS } from "./compliance.js";
import { collectThreats, countRecentFailed } from "./threats.js";
import { scanVulns } from "./vulns.js";
import { geoLookup } from "./geoip.js";
import { collectProcesses, collectPersistence } from "./edr.js";
import { collectConnections, runTool, investigateIp } from "./netops.js";

const PORT = parseInt(process.env.LEMONSEES_PORT || process.env.SHOK_PORT || "5199", 10);
const LOOPBACK = ["127.0.0.1", "::1", "localhost"];
let HOST = process.env.LEMONSEES_HOST || "127.0.0.1";
if (!LOOPBACK.includes(HOST) && !authEnabled()) {
  console.error(`\n  ✖ LEMONSEES_HOST=${HOST} без LEMONSEES_TOKEN небезпечно (SSH-доступ і термінал були б відкриті в мережу).\n    Задай LEMONSEES_TOKEN або слухай лише 127.0.0.1. Переходжу на 127.0.0.1.\n`);
  HOST = "127.0.0.1";
}
const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  } catch {
    return "dev";
  }
})();
const NO_OPEN = process.argv.includes("--no-open") || process.env.SHOK_NO_OPEN === "1";

let hosts = loadHosts();
let dbs = loadDbs();
let incidents = loadIncidents();
const conns = new Map(); // id -> HostConnection

const hostName = (id) => hosts.find((h) => h.id === id)?.name || id;
function audit(action, target, meta) {
  appendAudit({ actor: "analyst", action, target: target || "", meta: meta || {} });
}

/* ---------------- Монітор автоінцидентів (SSH brute-force) ---------------- */

async function threatSweep() {
  const soc = loadSoc();
  if (!soc.autoIncidents) return;
  for (const h of hosts) {
    const conn = conns.get(h.id);
    if (!conn || !conn.ready) continue;
    try {
      const failed = await countRecentFailed(conn);
      evaluateBruteforce(h, failed, soc.bruteThreshold);
    } catch {
      /* хост недоступний — пропускаємо */
    }
  }
}

function evaluateBruteforce(h, failed, threshold) {
  if (failed < threshold) return;
  const rule = "ssh-bruteforce";
  const open = incidents.find((i) => i.rule === rule && i.hostId === h.id && i.status !== "closed");
  if (open) {
    // оновлюємо лічильник у таймлайні не частіше разу на годину
    const last = open.timeline[open.timeline.length - 1];
    if (!last || Date.now() - (open.updatedAt || 0) > 3600000) {
      open.timeline.push({ at: Date.now(), text: `Оновлення: ${failed} невдалих логінів за 24 год` });
      open.updatedAt = Date.now();
      saveIncidents(incidents);
    }
    return;
  }
  const severity = failed >= 5000 ? "critical" : failed >= 1500 ? "high" : "medium";
  const inc = sanitizeIncident({
    title: `Брутфорс SSH на ${h.name}`,
    severity,
    status: "open",
    hostId: h.id,
    category: "brute-force",
    detail: `Автоматично виявлено: ${failed} невдалих SSH-логінів за 24 год (поріг ${threshold}). Рекомендація: увімкнути fail2ban, заборонити PasswordAuthentication.`,
    auto: true,
    rule,
  });
  inc.timeline = [{ at: Date.now(), text: `Автостворено: ${failed} невдалих логінів (поріг ${threshold})` }];
  incidents.unshift(inc);
  saveIncidents(incidents);
  audit("incident.auto", inc.id, { rule, failed, host: h.name });
}

// Перша перевірка через 45с після старту, далі — з інтервалом із налаштувань SOC.
function scheduleSweep(delay) {
  setTimeout(async () => {
    await threatSweep().catch(() => {});
    scheduleSweep((loadSoc().sweepMinutes || 5) * 60 * 1000);
  }, delay);
}
scheduleSweep(45000);

// Ретеншн журналу аудиту — раз на 6 год
setInterval(() => pruneAudit(loadSoc().retentionDays || 90), 6 * 3600 * 1000);
setTimeout(() => pruneAudit(loadSoc().retentionDays || 90), 60000);
const pollers = new Map(); // id -> Poller
const hostStates = new Map(); // id -> state

/* ---------------- стан і роздача ---------------- */

const stateClients = new Set();

function snapshot() {
  return {
    type: "state",
    hosts: hosts.map((h) => ({
      ...publicHost(h),
      ...(hostStates.get(h.id) || { status: "connecting", error: "", metrics: null, containers: [], networks: [], volumes: [], dockerVersion: "-", updatedAt: 0 }),
      id: h.id,
    })),
  };
}

function broadcast() {
  const msg = JSON.stringify(snapshot());
  for (const ws of stateClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function onStatus(id, status, error) {
  const st = hostStates.get(id) || { metrics: null, containers: [], networks: [], volumes: [], dockerVersion: "-", updatedAt: 0 };
  st.status = status;
  // Під час повторної спроби лишаємо текст останньої помилки, щоб було видно причину
  st.error = error || (status === "connecting" ? st.error : "");
  st.updatedAt = Date.now();
  hostStates.set(id, st);
  broadcast();
}

const metricHistory = new Map(); // id -> [{at,cpu,memPct,diskPct,rx,tx,conn}]
function onUpdate(id, state) {
  hostStates.set(id, { ...state });
  if (state.metrics && state.status === "online") {
    const arr = metricHistory.get(id) || [];
    const m = state.metrics;
    arr.push({
      at: state.updatedAt || Date.now(),
      cpu: m.cpu ?? 0,
      memPct: m.memPct ?? 0,
      diskPct: m.diskPct ?? 0,
      rx: m.netRxBps ?? 0,
      tx: m.netTxBps ?? 0,
      conn: m.connections ?? 0,
    });
    if (arr.length > 180) arr.shift();
    metricHistory.set(id, arr);
  }
  broadcast();
}

function startHost(cfg) {
  const conn = new HostConnection(cfg, onStatus);
  const poller = new Poller(conn, cfg, onUpdate);
  conns.set(cfg.id, conn);
  pollers.set(cfg.id, poller);
  hostStates.set(cfg.id, { status: "connecting", error: "", metrics: null, containers: [], networks: [], volumes: [], dockerVersion: "-", updatedAt: Date.now() });
  poller.start();
}

function stopHost(id) {
  pollers.get(id)?.stop();
  conns.get(id)?.dispose();
  pollers.delete(id);
  conns.delete(id);
  hostStates.delete(id);
}

for (const h of hosts) startHost(h);

/* ---------------- HTTP API ---------------- */

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.get("/api/info", (req, res) =>
  res.json({ version: VERSION, auth: authEnabled(), authed: isAuthed(req), platform: process.platform, web: !process.versions.electron, vendor: "Altumptic" }),
);
mountAuth(app, { secure: process.env.LEMONSEES_SECURE_COOKIE === "1" });

app.get("/api/state", (req, res) => res.json(snapshot()));

app.get("/api/hosts/:id/history", (req, res) =>
  res.json({ history: metricHistory.get(req.params.id) || [] }),
);

/* ---------------- Uptime-монітори ---------------- */

let monitors = loadMonitors();
const uptime = new Uptime();
uptime.onEvent = (evt) => {
  audit(evt.ok ? "monitor.up" : "monitor.down", evt.name, { url: evt.url, status: evt.status });
  if (loadSoc().notifyDowntime === false) return;
  try {
    globalThis.__lemonNotify?.(
      evt.ok ? `✅ ${evt.name}` : `🔴 ${evt.name}`,
      evt.ok ? `Відновився · HTTP ${evt.status} · ${evt.ms} ms` : `Недоступний · ${evt.error || "HTTP " + evt.status}`,
    );
  } catch {
    /* ignore */
  }
};
uptime.setMonitors(monitors);

app.get("/api/monitors", (req, res) =>
  res.json(monitors.map((m) => ({ ...m, stats: uptime.stats(m.id) }))),
);

app.get("/api/monitors/events", (req, res) => res.json({ events: uptime.events }));

app.post("/api/monitors", (req, res) => {
  try {
    const m = sanitizeMonitor(req.body);
    monitors.push(m);
    saveMonitors(monitors);
    uptime.setMonitors(monitors);
    audit("monitor.add", m.name, { url: m.url });
    res.json({ ...m, stats: uptime.stats(m.id) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/monitors/:id", (req, res) => {
  const idx = monitors.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Монітор не знайдено" });
  try {
    monitors[idx] = sanitizeMonitor(req.body, monitors[idx]);
    saveMonitors(monitors);
    uptime.setMonitors(monitors);
    res.json({ ...monitors[idx], stats: uptime.stats(monitors[idx].id) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/monitors/:id", (req, res) => {
  const idx = monitors.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Монітор не знайдено" });
  audit("monitor.delete", monitors[idx].name, {});
  uptime.remove(req.params.id);
  monitors.splice(idx, 1);
  saveMonitors(monitors);
  uptime.setMonitors(monitors);
  res.json({ ok: true });
});

app.get("/api/monitors/:id/history", (req, res) =>
  res.json({ history: uptime.getHistory(req.params.id), stats: uptime.stats(req.params.id) }),
);

app.post("/api/monitors/:id/check", async (req, res) => {
  const m = monitors.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: "Монітор не знайдено" });
  res.json(await uptime.check(m));
});

app.get("/api/hosts", (req, res) => res.json(hosts.map(publicHost)));

app.post("/api/hosts", (req, res) => {
  try {
    const h = sanitizeHost(req.body);
    hosts.push(h);
    saveHosts(hosts);
    startHost(h);
    broadcast();
    audit("host.add", h.id, { name: h.name, addr: `${h.user}@${h.host}:${h.port}` });
    res.json(publicHost(h));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/hosts/:id", (req, res) => {
  const idx = hosts.findIndex((h) => h.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Хост не знайдено" });
  try {
    const h = sanitizeHost(req.body, hosts[idx]);
    hosts[idx] = h;
    saveHosts(hosts);
    stopHost(h.id);
    startHost(h);
    broadcast();
    res.json(publicHost(h));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/hosts/:id", (req, res) => {
  const idx = hosts.findIndex((h) => h.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Хост не знайдено" });
  dbmod.closeTunnelsForHost(req.params.id, dbs);
  audit("host.remove", req.params.id, { name: hostName(req.params.id) });
  stopHost(req.params.id);
  hosts.splice(idx, 1);
  saveHosts(hosts);
  broadcast();
  res.json({ ok: true });
});

// Перевірка з'єднання без збереження
app.post("/api/hosts/test", async (req, res) => {
  let conn;
  try {
    const cfg = sanitizeHost(req.body);
    conn = new HostConnection(cfg, () => {});
    const r = await conn.exec("echo ok && uname -sr", { timeout: 15000 });
    res.json({ ok: r.stdout.includes("ok"), output: r.stdout.trim() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  } finally {
    conn?.dispose();
  }
});

// Дії з контейнерами
const ACTIONS = { start: "start", stop: "stop", restart: "restart", pause: "pause", unpause: "unpause", remove: "rm -f" };
app.post("/api/containers/:hostId/:action", async (req, res) => {
  const conn = conns.get(req.params.hostId);
  const verb = ACTIONS[req.params.action];
  const name = String(req.body?.name || "").replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!conn) return res.status(404).json({ error: "Хост не знайдено" });
  if (!verb) return res.status(400).json({ error: "Невідома дія" });
  if (!name) return res.status(400).json({ error: "Не вказано контейнер" });
  try {
    const r = await conn.exec(`docker ${verb} ${name}`, { timeout: 30000 });
    if (r.code !== 0) return res.status(500).json({ error: r.stderr.trim() || "Помилка docker" });
    audit(`container.${req.params.action}`, name, { host: hostName(req.params.hostId) });
    pollers.get(req.params.hostId)?.tick();
    res.json({ ok: true, output: r.stdout.trim() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Логи контейнера
app.get("/api/containers/:hostId/logs", async (req, res) => {
  const conn = conns.get(req.params.hostId);
  const name = String(req.query.name || "").replace(/[^a-zA-Z0-9_.-]/g, "");
  const tail = Math.max(10, Math.min(2000, parseInt(req.query.tail, 10) || 300));
  if (!conn) return res.status(404).json({ error: "Хост не знайдено" });
  if (!name) return res.status(400).json({ error: "Не вказано контейнер" });
  try {
    const r = await conn.exec(`docker logs --tail ${tail} ${name} 2>&1`, { timeout: 30000 });
    res.json({ logs: r.stdout });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Бази даних ---------------- */

app.get("/api/dbs", (req, res) => res.json(dbs.map(publicDb)));

// Автопошук баз на підключеному хості
app.post("/api/hosts/:id/detect-dbs", async (req, res) => {
  const conn = conns.get(req.params.id);
  if (!conn) return res.status(400).json({ error: "Хост не підключено" });
  try {
    res.json({ found: await dbmod.detectDatabases(conn) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/dbs", (req, res) => {
  try {
    const d = sanitizeDb(req.body);
    if (!hosts.some((h) => h.id === d.hostId)) return res.status(400).json({ error: "Хост не знайдено" });
    dbs.push(d);
    saveDbs(dbs);
    audit("db.add", d.id, { name: d.name, type: d.type });
    res.json(publicDb(d));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/dbs/:id", (req, res) => {
  const idx = dbs.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Базу не знайдено" });
  try {
    const d = sanitizeDb(req.body, dbs[idx]);
    dbs[idx] = d;
    saveDbs(dbs);
    dbmod.closeTunnel(d.id);
    res.json(publicDb(d));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/dbs/:id", (req, res) => {
  const idx = dbs.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Базу не знайдено" });
  dbmod.closeTunnel(req.params.id);
  dbs.splice(idx, 1);
  saveDbs(dbs);
  res.json({ ok: true });
});

function dbAndConn(id) {
  const d = dbs.find((x) => x.id === id);
  if (!d) return { error: "Базу не знайдено", code: 404 };
  const conn = conns.get(d.hostId);
  if (!conn) return { error: "Хост цієї бази не підключено", code: 400 };
  return { d, conn };
}

app.post("/api/dbs/:id/test", async (req, res) => {
  // Дозволяємо тест непорядкованого (ще не збереженого) з'єднання
  let d, conn;
  try {
    if (req.body && req.body.hostId) {
      d = sanitizeDb(req.body);
      conn = conns.get(d.hostId);
      if (!conn) return res.status(400).json({ error: "Хост не підключено" });
    } else {
      const r = dbAndConn(req.params.id);
      if (r.error) return res.status(r.code).json({ error: r.error });
      ({ d, conn } = r);
    }
    const fam = engineFamily(d.type);
    const probe =
      fam === "redis"
        ? "PING"
        : fam === "mongo"
          ? '{ "command": { "ping": 1 } }'
          : fam === "http"
            ? "GET /"
            : "SELECT 1";
    const out = await dbmod.runQuery(d, conn, probe);
    res.json({ ok: true, rowCount: out.rowCount });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/dbs/:id/schema", async (req, res) => {
  const r = dbAndConn(req.params.id);
  if (r.error) return res.status(r.code).json({ error: r.error });
  try {
    res.json(await dbmod.getSchema(r.d, r.conn));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/dbs/:id/query", async (req, res) => {
  const r = dbAndConn(req.params.id);
  if (r.error) return res.status(r.code).json({ error: r.error });
  const sql = String(req.body?.sql || "");
  if (!sql.trim()) return res.status(400).json({ error: "Порожній запит" });
  try {
    res.json(await dbmod.runQuery(r.d, r.conn, sql));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/dbs/:id/table", async (req, res) => {
  const r = dbAndConn(req.params.id);
  if (r.error) return res.status(r.code).json({ error: r.error });
  try {
    res.json(await dbmod.browseTable(r.d, r.conn, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/dbs/:id/update", async (req, res) => {
  const r = dbAndConn(req.params.id);
  if (r.error) return res.status(r.code).json({ error: r.error });
  try {
    res.json(await dbmod.updateRow(r.d, r.conn, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ---------------- Безпека (SOC) ---------------- */

app.post("/api/hosts/:id/security", async (req, res) => {
  const conn = conns.get(req.params.id);
  if (!conn) return res.status(400).json({ error: "Хост не підключено" });
  try {
    res.json(await collectSecurity(conn));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Threat intelligence: топ атакуючих IP + гео
app.post("/api/hosts/:id/threats", async (req, res) => {
  const conn = conns.get(req.params.id);
  if (!conn) return res.status(400).json({ error: "Хост не підключено" });
  const geo = req.query.geo !== "0";
  try {
    res.json(await collectThreats(conn, { geo }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Аналіз вразливостей (кібераналіз)
app.post("/api/hosts/:id/vulns", async (req, res) => {
  const conn = conns.get(req.params.id);
  if (!conn) return res.status(400).json({ error: "Хост не підключено" });
  try {
    res.json(await scanVulns(conn));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Топ мережевих пірів (established) + гео
app.post("/api/hosts/:id/peers", async (req, res) => {
  const conn = conns.get(req.params.id);
  if (!conn) return res.status(400).json({ error: "Хост не підключено" });
  const geo = req.query.geo !== "0";
  try {
    const r = await conn.exec(
      `ss -tunH state established 2>/dev/null | awk '{print $5}' | sed -E 's/:[0-9]+$//; s/^\\[//; s/\\]$//' | sort | uniq -c | sort -rn | head -20`,
      { timeout: 20000 },
    );
    const peers = r.stdout
      .trim()
      .split("\n")
      .map((l) => {
        const m = l.trim().match(/^(\d+)\s+(.+)$/);
        return m ? { ip: m[2], count: parseInt(m[1], 10) || 0, geo: null } : null;
      })
      .filter(Boolean)
      .filter((p) => p.ip && p.ip !== "*" && !p.ip.startsWith("127."));
    if (geo && peers.length) {
      try {
        const g = await geoLookup(peers.map((p) => p.ip));
        for (const p of peers) p.geo = g[p.ip] || null;
      } catch {
        /* без гео */
      }
    }
    res.json({ peers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// EDR — процеси
app.post("/api/hosts/:id/processes", async (req, res) => {
  const conn = conns.get(req.params.id);
  if (!conn) return res.status(400).json({ error: "Хост не підключено" });
  try {
    res.json(await collectProcesses(conn));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// EDR — персистентність (cron, служби, таймери)
app.post("/api/hosts/:id/persistence", async (req, res) => {
  const conn = conns.get(req.params.id);
  if (!conn) return res.status(400).json({ error: "Хост не підключено" });
  try {
    res.json(await collectPersistence(conn));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// NDR — активні зʼєднання
app.post("/api/hosts/:id/connections", async (req, res) => {
  const conn = conns.get(req.params.id);
  if (!conn) return res.status(400).json({ error: "Хост не підключено" });
  try {
    res.json(await collectConnections(conn));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Утиліти — мережеві інструменти (виконуються на хості)
app.post("/api/hosts/:id/tool", async (req, res) => {
  const conn = conns.get(req.params.id);
  if (!conn) return res.status(400).json({ error: "Хост не підключено" });
  try {
    const r = await runTool(conn, req.body?.tool, req.body?.target, req.body?.port);
    audit("tool.run", `${req.body?.tool} ${req.body?.target || ""}`.trim(), { host: hostName(req.params.id) });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// CTI — розвідка по IP
app.post("/api/hosts/:id/investigate", async (req, res) => {
  const conn = conns.get(req.params.id);
  if (!conn) return res.status(400).json({ error: "Хост не підключено" });
  const geo = req.query.geo !== "0";
  try {
    const attackers = Array.isArray(req.body?.attackers) ? req.body.attackers : [];
    res.json(await investigateIp(conn, req.body?.ip, geo, attackers));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// SIEM — тейл лог-файлу (allowlist /var/log)
app.get("/api/hosts/:id/logtail", async (req, res) => {
  const conn = conns.get(req.params.id);
  if (!conn) return res.status(400).json({ error: "Хост не підключено" });
  const path = String(req.query.path || "/var/log/syslog");
  const lines = Math.max(20, Math.min(1000, parseInt(req.query.lines, 10) || 200));
  if (!/^\/var\/log\/[a-zA-Z0-9._/-]+$/.test(path) || path.includes(".."))
    return res.status(400).json({ error: "Дозволено лише /var/log/*" });
  try {
    const r = await conn.exec(`tail -n ${lines} '${path}' 2>&1`, { timeout: 20000 });
    res.json({ path, lines: r.stdout.split("\n") });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SOC-конфіг (пороги, автоінциденти)
app.get("/api/soc", (req, res) => res.json(loadSoc()));
app.put("/api/soc", (req, res) => {
  const cfg = saveSoc(req.body || {});
  audit("soc.config", "", cfg);
  res.json(cfg);
});

/* ---------------- Комплаєнс (GRC) ---------------- */

app.get("/api/compliance/controls", (req, res) => {
  res.json({
    auto: AUTO_CONTROLS.map((c) => ({ id: c.id, title: c.title, framework: c.framework, severity: c.severity })),
    manual: MANUAL_CONTROLS,
    attest: loadAttest(),
  });
});

app.post("/api/hosts/:id/compliance", async (req, res) => {
  const conn = conns.get(req.params.id);
  if (!conn) return res.status(400).json({ error: "Хост не підключено" });
  try {
    res.json({ controls: await runAuto(conn) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/compliance/attest/:controlId", (req, res) => {
  const map = loadAttest();
  const status = ["attested", "na", "failed"].includes(req.body?.status) ? req.body.status : "attested";
  map[req.params.controlId] = { status, note: String(req.body?.note ?? "").trim(), at: Date.now() };
  saveAttest(map);
  audit("compliance.attest", req.params.controlId, { status });
  res.json({ ok: true, attest: map });
});

/* ---------------- Інциденти (SOC) ---------------- */

app.get("/api/incidents", (req, res) => res.json(incidents));

app.post("/api/incidents", (req, res) => {
  try {
    const inc = sanitizeIncident(req.body);
    inc.timeline = [{ at: Date.now(), text: "Інцидент створено" }];
    incidents.unshift(inc);
    saveIncidents(incidents);
    audit("incident.create", inc.id, { title: inc.title, severity: inc.severity });
    res.json(inc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/incidents/:id", (req, res) => {
  const idx = incidents.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Інцидент не знайдено" });
  try {
    const prev = incidents[idx];
    const inc = sanitizeIncident(req.body, prev);
    inc.timeline = prev.timeline.slice();
    if (req.body.note) inc.timeline.push({ at: Date.now(), text: String(req.body.note).trim() });
    if (prev.status !== inc.status)
      inc.timeline.push({ at: Date.now(), text: `Статус → ${inc.status}` });
    incidents[idx] = inc;
    saveIncidents(incidents);
    audit("incident.update", inc.id, { status: inc.status });
    res.json(inc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/incidents/:id", (req, res) => {
  const idx = incidents.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Інцидент не знайдено" });
  audit("incident.delete", req.params.id, {});
  incidents.splice(idx, 1);
  saveIncidents(incidents);
  res.json({ ok: true });
});

/* ---------------- FIM — цілісність файлів ---------------- */

let fimBaselines = loadFimBaselines();

function fimIncident(h, report) {
  const soc = loadSoc();
  if (!soc.autoIncidents || !report.changed) return;
  const rule = "fim-change";
  const changed = report.files.filter((f) => f.status === "modified" || f.status === "added" || f.status === "missing").map((f) => f.path);
  const openInc = incidents.find((i) => i.rule === rule && i.hostId === h.id && i.status !== "closed");
  if (openInc) return;
  const critical = changed.some((p) => /shadow|sudoers|authorized_keys|sshd|ld\.so\.preload|pam\.d/.test(p));
  const inc = sanitizeIncident({
    title: `FIM: змінено ${changed.length} критичн. файл(ів) на ${h.name}`,
    severity: critical ? "high" : "medium",
    status: "open",
    hostId: h.id,
    category: "integrity",
    detail: `Змінені файли: ${changed.join(", ")}. Перевір, чи це плановані зміни; якщо ні — ізолюй хост і проаналізуй.`,
    auto: true,
    rule,
  });
  inc.timeline = [{ at: Date.now(), text: `Автостворено FIM: ${changed.join(", ")}` }];
  incidents.unshift(inc);
  saveIncidents(incidents);
  audit("incident.auto", inc.id, { rule, host: h.name });
}

app.post("/api/hosts/:id/fim", async (req, res) => {
  const conn = conns.get(req.params.id);
  const h = hosts.find((x) => x.id === req.params.id);
  if (!conn || !h) return res.status(400).json({ error: "Хост не підключено" });
  try {
    const files = await scanFim(conn);
    // Перше сканування автоматично стає базовою лінією
    if (!fimBaselines[h.id]) {
      fimBaselines[h.id] = { at: Date.now(), files };
      saveFimBaselines(fimBaselines);
      audit("fim.baseline", h.name, { files: files.length, auto: true });
    }
    const report = diffFim(files, fimBaselines[h.id]);
    fimIncident(h, report);
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/hosts/:id/fim-baseline", async (req, res) => {
  const conn = conns.get(req.params.id);
  const h = hosts.find((x) => x.id === req.params.id);
  if (!conn || !h) return res.status(400).json({ error: "Хост не підключено" });
  try {
    const files = await scanFim(conn);
    fimBaselines[h.id] = { at: Date.now(), files };
    saveFimBaselines(fimBaselines);
    audit("fim.baseline", h.name, { files: files.length });
    res.json(diffFim(files, fimBaselines[h.id]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Аудит (GRC) ---------------- */

app.get("/api/audit", (req, res) => {
  const limit = Math.max(1, Math.min(2000, parseInt(req.query.limit, 10) || 500));
  res.json({ events: loadAudit(limit) });
});

/* ---------------- статика (зібраний фронт) ---------------- */

const DIST = path.join(APP_ROOT, "dist");
// security.txt / PGP-ключ Altumptic (RFC 9116)
const WELL_KNOWN = fs.existsSync(path.join(DIST, ".well-known")) ? path.join(DIST, ".well-known") : path.join(APP_ROOT, "public", ".well-known");
app.use("/.well-known", express.static(WELL_KNOWN, { setHeaders: (res) => res.setHeader("Content-Type", "text/plain; charset=utf-8") }));

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: "1h", setHeaders: (res, p) => /[\\/]assets[\\/]/.test(p) && res.setHeader("Cache-Control", "public, max-age=31536000, immutable") }));
  app.get("*path", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/ws")) return next();
    res.sendFile(path.join(DIST, "index.html"));
  });
}

/* ---------------- WebSocket ---------------- */

const server = http.createServer(app);
const wssState = new WebSocketServer({ noServer: true });
const wssTerm = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (!isAuthed(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/ws/state") {
    wssState.handleUpgrade(req, socket, head, (ws) => wssState.emit("connection", ws, req));
  } else if (url.pathname === "/ws/term") {
    wssTerm.handleUpgrade(req, socket, head, (ws) => wssTerm.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

wssState.on("connection", (ws) => {
  stateClients.add(ws);
  ws.send(JSON.stringify(snapshot()));
  ws.on("close", () => stateClients.delete(ws));
  ws.on("error", () => stateClients.delete(ws));
});

// Термінал: \x01 + data — ввід; \x02 + JSON — керування (resize)
wssTerm.on("connection", async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const hostId = url.searchParams.get("host");
  const conn = conns.get(hostId);
  if (!conn) {
    ws.send("\r\n[ШОК] Хост не знайдено.\r\n");
    ws.close();
    return;
  }
  let stream;
  try {
    stream = await conn.shell({ cols: 120, rows: 32 });
  } catch (e) {
    ws.send(`\r\n[ШОК] Не вдалося відкрити shell: ${e.message}\r\n`);
    ws.close();
    return;
  }
  stream.on("data", (d) => ws.readyState === 1 && ws.send(d));
  stream.stderr?.on("data", (d) => ws.readyState === 1 && ws.send(d));
  stream.on("close", () => ws.close());
  ws.on("message", (raw) => {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    if (buf.length === 0) return;
    const kind = buf[0];
    const payload = buf.subarray(1);
    if (kind === 0x01) {
      stream.write(payload);
    } else if (kind === 0x02) {
      try {
        const msg = JSON.parse(payload.toString("utf8"));
        if (msg.type === "resize") stream.setWindow(msg.rows, msg.cols, 0, 0);
      } catch { /* ignore */ }
    }
  });
  ws.on("close", () => {
    try { stream.close(); } catch { /* ignore */ }
  });
});

/* ---------------- старт ---------------- */

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`\n  LemonSees ${VERSION} by Altumptic → ${url}\n  Хостів у конфігу: ${hosts.length}. Доступ: ${authEnabled() ? "токен (LEMONSEES_TOKEN)" : "лише локально"}. Ctrl+C — зупинити.\n`);
  if (!NO_OPEN && process.platform === "win32" && fs.existsSync(DIST) && LOOPBACK.includes(HOST)) {
    cpExec(`start "" "${url}"`, { shell: "cmd.exe" });
  }
});
