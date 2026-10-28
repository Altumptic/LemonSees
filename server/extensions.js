// Розширення двигуна LemonSees 3.1: мережа/приватність, інтеграції (у т.ч. Wazuh), агенти, власні правила.
import crypto from "node:crypto";
import {
  loadNetwork,
  saveNetwork,
  publicNetwork,
  loadIntegrations,
  saveIntegrations,
  publicIntegration,
  loadRules,
  saveRules,
  loadAgents,
  saveAgents,
  sanitizeIncident,
} from "./config.js";
import { setNetConfig, egressCheck, getNetConfig, proxyEnabled } from "./netproxy.js";
import { vaultInfo, encryptBackup, decryptBackup } from "./vault.js";
import { GEO_PROVIDER } from "./geoip.js";
import { CATALOG, sanitizeIntegration, dispatch, wazuhPull } from "./integrations.js";
import { AGENT_VERSION, installCommand, uninstallCommand, statusCommand, parseStatus, newAgentToken, sanitizeSample } from "./agent.js";
import { authEnabled } from "./auth.js";

const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/* ---------------- Шаблони правил виявлення ---------------- */

export const RULE_PRESETS = [
  { name: "Невдалі sudo", source: "journal", pattern: "sudo.*(authentication failure|incorrect password)", threshold: 3, windowMin: 15, severity: "high", technique: "T1548", category: "privilege-escalation" },
  { name: "Створено нового користувача", source: "journal", pattern: "useradd.*new user", threshold: 1, windowMin: 60, severity: "medium", technique: "T1136", category: "persistence" },
  { name: "Вхід root по SSH", source: "journal", pattern: "Accepted .* for root from", threshold: 1, windowMin: 60, severity: "high", technique: "T1078", category: "credential access" },
  { name: "OOM killer", source: "journal", pattern: "Out of memory: Killed process", threshold: 1, windowMin: 30, severity: "medium", technique: "T1499", category: "downtime" },
  { name: "Segfault процесів", source: "journal", pattern: "segfault at", threshold: 5, windowMin: 30, severity: "low", technique: "T1203", category: "malware" },
  { name: "Сплеск блокувань UFW", source: "journal", pattern: "UFW BLOCK", threshold: 500, windowMin: 10, severity: "medium", technique: "T1595", category: "recon / scan" },
  { name: "Зміни crontab", source: "journal", pattern: "crontab.*(REPLACE|BEGIN EDIT)", threshold: 1, windowMin: 60, severity: "medium", technique: "T1053", category: "persistence" },
  { name: "Встановлення пакетів", source: "file", path: "/var/log/dpkg.log", pattern: " install ", threshold: 1, windowMin: 60, severity: "low", technique: "T1072", category: "misconfiguration" },
];

function sanitizeRule(r, existing) {
  const sev = ["critical", "high", "medium", "low", "info"];
  const rule = {
    id: existing?.id ?? r.id ?? "rule_" + crypto.randomBytes(4).toString("hex"),
    name: String(r.name || "").trim().slice(0, 120),
    enabled: r.enabled !== false,
    source: ["journal", "file"].includes(r.source) ? r.source : "journal",
    path: String(r.path || "").trim().slice(0, 300),
    pattern: String(r.pattern || "").slice(0, 500),
    threshold: Math.max(1, Math.min(1e6, parseInt(r.threshold, 10) || 1)),
    windowMin: Math.max(1, Math.min(1440, parseInt(r.windowMin, 10) || 15)),
    severity: sev.includes(r.severity) ? r.severity : "medium",
    technique: String(r.technique || "").trim().slice(0, 16),
    category: String(r.category || "").trim().slice(0, 60),
    hosts: Array.isArray(r.hosts) ? r.hosts.map(String) : [],
    lastHit: existing?.lastHit ?? null,
  };
  if (!rule.name) throw new Error("Вкажи назву правила");
  if (!rule.pattern) throw new Error("Вкажи шаблон (регулярний вираз)");
  try {
    new RegExp(rule.pattern);
  } catch {
    throw new Error("Некоректний регулярний вираз");
  }
  if (rule.source === "file" && !rule.path.startsWith("/")) throw new Error("Вкажи абсолютний шлях до файлу журналу");
  return rule;
}

function ruleCommand(rule) {
  const pat = q(rule.pattern);
  if (rule.source === "file") return `timeout 15 tail -n 20000 ${q(rule.path)} 2>/dev/null | grep -cE ${pat} || true`;
  return `timeout 20 journalctl --since "-${rule.windowMin}min" --no-pager 2>/dev/null | grep -cE ${pat} || true`;
}

/* ---------------- Підключення ---------------- */

export function mountExtensions(app, ctx) {
  // ctx: { hosts(), conns, addIncident(inc), audit(action,target,meta), saveHosts(), onAuth? }
  let network = loadNetwork();
  setNetConfig(network);
  let integrations = loadIntegrations();
  let rules = loadRules();
  let agents = loadAgents(); // hostId -> {mode, token, interval, pushUrl, installedAt}
  const pushed = new Map(); // hostId -> samples[]
  const wazuhCache = new Map(); // integrationId -> pull result
  const hostName = (id) => ctx.hosts().find((h) => h.id === id)?.name || id;

  const setStatus = (id, st) => {
    integrations = integrations.map((i) => (i.id === id ? { ...i, lastStatus: { ...st, at: Date.now() } } : i));
    saveIntegrations(integrations);
  };
  const send = (event) => dispatch(integrations, event, { onStatus: setStatus }).catch(() => []);

  /* ----- Мережа та безпека ----- */

  app.get("/api/network", (req, res) => res.json(publicNetwork(network)));
  app.put("/api/network", (req, res) => {
    try {
      network = saveNetwork(req.body || {}, network);
      setNetConfig(network);
      ctx.audit("network.update", proxyEnabled(network.proxy) ? `${network.proxy.type}://${network.proxy.host}:${network.proxy.port}` : "direct", { killSwitch: network.killSwitch });
      ctx.reconnectAll?.();
      res.json(publicNetwork(network));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post("/api/network/test", async (req, res) => {
    try {
      res.json(await egressCheck());
    } catch (e) {
      res.status(502).json({ error: e.cause?.message || e.message });
    }
  });
  app.get("/api/security/status", (req, res) => {
    const n = getNetConfig();
    res.json({
      vault: vaultInfo(),
      tls: !!ctx.tls,
      auth: authEnabled(),
      proxy: proxyEnabled() ? { type: n.proxy.type, host: n.proxy.host, port: n.proxy.port } : null,
      killSwitch: n.killSwitch,
      hardenedCrypto: n.hardenedCrypto,
      strictHostKeys: n.strictHostKeys,
      pinnedHosts: ctx.hosts().filter((h) => h.hostKey).length,
      totalHosts: ctx.hosts().length,
      bastionHosts: ctx.hosts().filter((h) => h.jumpHostId).length,
    });
  });
  app.post("/api/hosts/:id/hostkey/reset", (req, res) => {
    const h = ctx.hosts().find((x) => x.id === req.params.id);
    if (!h) return res.status(404).json({ error: "Хост не знайдено" });
    h.hostKey = "";
    ctx.saveHosts();
    ctx.restartHost?.(h.id);
    ctx.audit("hostkey.reset", h.name, {});
    res.json({ ok: true });
  });

  /* ----- Шифрований бекап ----- */

  app.post("/api/backup/export", (req, res) => {
    try {
      const { settings, passphrase } = req.body || {};
      const data = ctx.backupData();
      const payload = {
        app: "LemonSees",
        vendor: "Altumptic",
        exportedAt: new Date().toISOString(),
        settings: settings && typeof settings === "object" ? settings : {},
        soc: data.soc,
        incidents: data.incidents,
        monitors: data.monitors,
        rules,
        // інтеграції та мережа — без секретів (вони лишаються лише у сховищі цього ПК)
        integrations: integrations.map(publicIntegration),
        network: publicNetwork(network),
      };
      ctx.audit("backup.export", "encrypted", {});
      res.json(encryptBackup(payload, String(passphrase || "")));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post("/api/backup/import", (req, res) => {
    try {
      const data = decryptBackup(req.body?.blob, String(req.body?.passphrase || ""));
      ctx.audit("backup.import", "settings", {});
      res.json({ settings: data.settings || {}, soc: data.soc || null, exportedAt: data.exportedAt });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  /* ----- Інвентар вихідних зʼєднань (PSB §6) ----- */

  app.get("/api/security/outbound", (req, res) => {
    const n = getNetConfig();
    res.json({
      route: proxyEnabled() ? `${n.proxy.type}://${n.proxy.host}:${n.proxy.port}` : "direct",
      killSwitch: n.killSwitch,
      telemetry: "none",
      items: [
        { id: "ssh", target: "your servers (SSH)", purpose: "telemetry, scans, terminal", when: "always, for configured hosts", enabled: ctx.hosts().length > 0 },
        { id: "geoip", target: GEO_PROVIDER, purpose: "country/ISP of attacker IPs", when: "opt-in (Settings → SOC)", enabled: null },
        { id: "egress", target: "https://api.ipify.org", purpose: "show which IP servers see", when: "only when you press the button", enabled: false },
        { id: "uptime", target: "your monitored URLs", purpose: "uptime checks", when: "for configured monitors", enabled: (ctx.monitorCount?.() ?? 0) > 0 },
        ...integrations.filter((i) => i.enabled).map((i) => ({ id: i.id, target: i.name, purpose: CATALOG[i.type].dir === "in" ? "import agents/alerts" : "forward alerts", when: "configured integration", enabled: true })),
      ],
    });
  });

  /* ----- Інтеграції ----- */

  app.get("/api/integrations", (req, res) => res.json({ catalog: CATALOG, integrations: integrations.map(publicIntegration) }));
  app.post("/api/integrations", (req, res) => {
    try {
      const i = sanitizeIntegration(req.body || {});
      integrations.push(i);
      saveIntegrations(integrations);
      ctx.audit("integration.create", i.name, { type: i.type });
      res.json(publicIntegration(i));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.put("/api/integrations/:id", (req, res) => {
    const idx = integrations.findIndex((i) => i.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "Не знайдено" });
    try {
      integrations[idx] = sanitizeIntegration(req.body || {}, integrations[idx]);
      saveIntegrations(integrations);
      ctx.audit("integration.update", integrations[idx].name, {});
      res.json(publicIntegration(integrations[idx]));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.delete("/api/integrations/:id", (req, res) => {
    const i = integrations.find((x) => x.id === req.params.id);
    integrations = integrations.filter((x) => x.id !== req.params.id);
    saveIntegrations(integrations);
    wazuhCache.delete(req.params.id);
    if (i) ctx.audit("integration.delete", i.name, {});
    res.json({ ok: true });
  });
  app.post("/api/integrations/:id/test", async (req, res) => {
    const i = integrations.find((x) => x.id === req.params.id);
    if (!i) return res.status(404).json({ error: "Не знайдено" });
    try {
      if (CATALOG[i.type].dir === "in") {
        const r = await wazuhPull(i.config);
        wazuhCache.set(i.id, r);
        setStatus(i.id, { ok: true, info: `${r.agents.length} agents · ${r.alerts.length} alerts` });
        return res.json({ ok: true, agents: r.agents.length, alerts: r.alerts.length });
      }
      const [r] = await dispatch([i], { kind: "test", severity: "info", title: "LemonSees test", text: "Тестова подія від LemonSees by Altumptic — інтеграція працює." }, { force: true, onStatus: setStatus });
      if (!r.ok) throw new Error(r.error);
      res.json(r);
    } catch (e) {
      setStatus(i.id, { ok: false, error: e.message });
      res.status(502).json({ error: e.message });
    }
  });

  // Wazuh: періодичний імпорт агентів і тривог
  const knownAlerts = new Set();
  async function pullWazuh() {
    for (const i of integrations.filter((x) => x.type === "wazuh" && x.enabled)) {
      try {
        const r = await wazuhPull(i.config);
        wazuhCache.set(i.id, r);
        setStatus(i.id, { ok: true, info: `${r.agents.length} agents · ${r.alerts.length} alerts` });
        for (const a of r.alerts) {
          if (a.level < 12 || knownAlerts.has(a.id)) continue;
          knownAlerts.add(a.id);
          ctx.addIncident({
            title: `Wazuh: ${a.rule}${a.agent ? ` (${a.agent})` : ""}`,
            severity: a.severity,
            category: a.tactic[0] || "wazuh",
            detail: `Rule ${a.ruleId}, level ${a.level}${a.mitre.length ? `, MITRE ${a.mitre.join(", ")}` : ""}${a.srcip ? `, src ${a.srcip}` : ""}.\n${a.log}`,
            rule: `wazuh:${a.ruleId}:${a.agent}`,
          });
        }
      } catch (e) {
        setStatus(i.id, { ok: false, error: e.message });
      }
    }
  }
  setTimeout(pullWazuh, 20000);
  setInterval(pullWazuh, 5 * 60 * 1000);

  app.get("/api/wazuh", (req, res) => {
    const agentsAll = [];
    const alertsAll = [];
    for (const [id, r] of wazuhCache) {
      const src = integrations.find((i) => i.id === id)?.name || "Wazuh";
      agentsAll.push(...r.agents.map((a) => ({ ...a, source: src })));
      alertsAll.push(...r.alerts.map((a) => ({ ...a, source: src })));
    }
    res.json({ connected: wazuhCache.size > 0, agents: agentsAll, alerts: alertsAll.sort((a, b) => b.at - a.at) });
  });
  app.post("/api/wazuh/refresh", async (req, res) => {
    await pullWazuh();
    res.json({ ok: true });
  });

  /* ----- Власні правила виявлення ----- */

  app.get("/api/rules", (req, res) => res.json({ rules, presets: RULE_PRESETS }));
  app.put("/api/rules", (req, res) => {
    try {
      const list = (req.body?.rules || []).map((r) => sanitizeRule(r, rules.find((x) => x.id === r.id)));
      rules = list;
      saveRules(rules);
      ctx.audit("rules.update", `${rules.length} rules`, {});
      res.json({ rules });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post("/api/rules/test", async (req, res) => {
    try {
      const rule = sanitizeRule(req.body?.rule || {});
      const conn = ctx.conns.get(req.body?.hostId);
      if (!conn) throw new Error("Хост не підключено");
      const { stdout } = await conn.exec(ruleCommand(rule), { timeout: 30000 });
      const count = parseInt(stdout.trim(), 10) || 0;
      res.json({ count, triggered: count >= rule.threshold });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  async function runRules() {
    for (const rule of rules.filter((r) => r.enabled)) {
      for (const h of ctx.hosts()) {
        if (rule.hosts.length && !rule.hosts.includes(h.id)) continue;
        const conn = ctx.conns.get(h.id);
        if (!conn || !conn.ready) continue;
        try {
          const { stdout } = await conn.exec(ruleCommand(rule), { timeout: 30000 });
          const count = parseInt(stdout.trim(), 10) || 0;
          if (count < rule.threshold) continue;
          rule.lastHit = Date.now();
          ctx.addIncident({
            title: `${rule.name} на ${h.name}`,
            severity: rule.severity,
            hostId: h.id,
            category: rule.category || "custom rule",
            detail: `Власне правило «${rule.name}»: ${count} збігів за ${rule.windowMin} хв (поріг ${rule.threshold}). Шаблон: ${rule.pattern}${rule.technique ? `. MITRE ${rule.technique}` : ""}`,
            rule: `custom:${rule.id}:${h.id}`,
          });
        } catch {
          /* хост недоступний */
        }
      }
    }
    saveRules(rules);
  }

  /* ----- Агенти ----- */

  const agentView = (hostId) => {
    const a = agents[hostId];
    const samples = pushed.get(hostId) || a?.samples || [];
    return a ? { hostId, host: hostName(hostId), mode: a.mode, interval: a.interval, installedAt: a.installedAt, version: a.version || AGENT_VERSION, lastSeen: samples.at(-1)?.at || a.lastSeen || null, samples: samples.slice(-120) } : null;
  };

  app.get("/api/agents", (req, res) => res.json({ version: AGENT_VERSION, agents: Object.keys(agents).map(agentView).filter(Boolean) }));

  app.post("/api/agents/:id/deploy", async (req, res) => {
    const conn = ctx.conns.get(req.params.id);
    if (!conn) return res.status(400).json({ error: "Хост не підключено" });
    const mode = req.body?.mode === "push" ? "push" : "pull";
    const interval = Math.max(10, Math.min(60, parseInt(req.body?.interval, 10) || 30));
    const token = agents[req.params.id]?.token || newAgentToken();
    const pushUrl = mode === "push" ? String(req.body?.pushUrl || "").trim() : "";
    if (mode === "push" && !/^https?:\/\//.test(pushUrl)) return res.status(400).json({ error: "Для push-режиму вкажи URL двигуна (https://…/api/agent/ingest)" });
    try {
      const { stdout, stderr, code } = await conn.exec(installCommand({ interval, pushUrl, token, insecure: !!req.body?.insecure }), { timeout: 40000 });
      if (code !== 0) throw new Error(stderr || stdout || `exit ${code}`);
      agents[req.params.id] = { mode, token, interval, pushUrl, installedAt: Date.now(), version: AGENT_VERSION };
      saveAgents(agents);
      ctx.audit("agent.deploy", hostName(req.params.id), { mode, interval });
      res.json(agentView(req.params.id));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/agents/:id/remove", async (req, res) => {
    const conn = ctx.conns.get(req.params.id);
    try {
      if (conn) await conn.exec(uninstallCommand(), { timeout: 20000 });
      delete agents[req.params.id];
      pushed.delete(req.params.id);
      saveAgents(agents);
      ctx.audit("agent.remove", hostName(req.params.id), {});
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/agents/:id/sync", async (req, res) => {
    const conn = ctx.conns.get(req.params.id);
    if (!conn) return res.status(400).json({ error: "Хост не підключено" });
    try {
      const { stdout } = await conn.exec(statusCommand(), { timeout: 20000 });
      const st = parseStatus(stdout);
      if (!st.installed) {
        delete agents[req.params.id];
        saveAgents(agents);
        return res.json(null);
      }
      agents[req.params.id] = { ...(agents[req.params.id] || { mode: st.push ? "push" : "pull", token: newAgentToken(), installedAt: Date.now() }), interval: st.interval, version: st.version, samples: st.samples.slice(-120), lastSeen: st.samples.at(-1)?.at || null };
      saveAgents(agents);
      res.json(agentView(req.params.id));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Ручне встановлення: команда, яку можна виконати на сервері самостійно
  app.post("/api/agents/:id/command", (req, res) => {
    const token = agents[req.params.id]?.token || newAgentToken();
    const interval = Math.max(10, Math.min(60, parseInt(req.body?.interval, 10) || 30));
    const pushUrl = String(req.body?.pushUrl || "").trim();
    agents[req.params.id] = { ...(agents[req.params.id] || {}), mode: pushUrl ? "push" : "pull", token, interval, pushUrl, installedAt: agents[req.params.id]?.installedAt || Date.now() };
    saveAgents(agents);
    res.json({ command: installCommand({ interval, pushUrl, token, insecure: !!req.body?.insecure }), uninstall: uninstallCommand() });
  });

  // Прийом даних від агента (push). Автентифікація — персональний токен агента, без сесії.
  app.post("/api/agent/ingest", (req, res) => {
    const m = String(req.headers.authorization || "").match(/^Bearer ([a-f0-9]{48})$/);
    const hostId = m && Object.keys(agents).find((id) => crypto.timingSafeEqual(Buffer.from(agents[id].token || "".padEnd(48, "0")), Buffer.from(m[1])));
    if (!hostId) return res.status(401).json({ error: "bad agent token" });
    const sample = sanitizeSample(req.body || {});
    const arr = pushed.get(hostId) || [];
    arr.push(sample);
    if (arr.length > 1440) arr.shift();
    pushed.set(hostId, arr);
    agents[hostId].lastSeen = sample.at;
    res.json({ ok: true });
  });

  return {
    notifyIncident: (inc) => send({ id: inc.id, kind: inc.rule?.startsWith("fim") ? "fim" : "incident", severity: inc.severity, title: inc.title, text: inc.detail || "", host: hostName(inc.hostId) }),
    notifyDowntime: (evt) => send({ kind: "downtime", severity: evt.ok ? "info" : "high", title: evt.ok ? `${evt.name} відновився` : `${evt.name} недоступний`, text: `${evt.url} · ${evt.ok ? `HTTP ${evt.status}, ${evt.ms} ms` : evt.error || `HTTP ${evt.status}`}` }),
    runRules,
  };
}

export { sanitizeIncident };
