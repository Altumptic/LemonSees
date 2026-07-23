// ШОК — локальний двигун моніторингу.
// Слухає лише 127.0.0.1. На віддалені сервери нічого не встановлюється.
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { exec as cpExec } from "node:child_process";
import express from "express";
import { WebSocketServer } from "ws";

import { APP_ROOT, loadHosts, saveHosts, sanitizeHost, publicHost } from "./config.js";
import { HostConnection } from "./ssh.js";
import { Poller } from "./collector.js";

const PORT = parseInt(process.env.SHOK_PORT || "5199", 10);
const HOST = "127.0.0.1";
const NO_OPEN = process.argv.includes("--no-open") || process.env.SHOK_NO_OPEN === "1";

let hosts = loadHosts();
const conns = new Map(); // id -> HostConnection
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

function onUpdate(id, state) {
  hostStates.set(id, { ...state });
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
app.use(express.json());

app.get("/api/state", (req, res) => res.json(snapshot()));

app.get("/api/hosts", (req, res) => res.json(hosts.map(publicHost)));

app.post("/api/hosts", (req, res) => {
  try {
    const h = sanitizeHost(req.body);
    hosts.push(h);
    saveHosts(hosts);
    startHost(h);
    broadcast();
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

/* ---------------- статика (зібраний фронт) ---------------- */

const DIST = path.join(APP_ROOT, "dist");
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
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
  console.log(`\n  ШОК · моніторинг запущено → ${url}\n  Хостів у конфігу: ${hosts.length}. Закрий це вікно, щоб зупинити.\n`);
  if (!NO_OPEN && process.platform === "win32" && fs.existsSync(DIST)) {
    cpExec(`start "" "${url}"`, { shell: "cmd.exe" });
  }
});
