// Демо-дані для модулів 3.1: мережа/приватність, інтеграції, Wazuh, правила, агенти.
import type { AgentView, DetectionRule, Integration, NetworkConfig, SecurityStatus, WazuhData } from "./types";

const NOW = () => Date.now();
const H = 3600000;
let seed = 99;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const ri = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

let network: NetworkConfig = {
  proxy: { type: "socks5", host: "127.0.0.1", port: 9050, user: "", hasPass: false },
  applySsh: true,
  applyOutbound: true,
  killSwitch: true,
  remoteDns: true,
  hardenedCrypto: true,
  strictHostKeys: true,
};

const CATALOG = {
  datadog: { label: "Datadog", dir: "out", fields: ["site", "apiKey", "tags"] },
  slack: { label: "Slack", dir: "out", fields: ["webhookUrl"] },
  teams: { label: "Microsoft Teams", dir: "out", fields: ["webhookUrl"] },
  telegram: { label: "Telegram", dir: "out", fields: ["token", "chatId"] },
  webhook: { label: "Webhook (HMAC)", dir: "out", fields: ["url", "secret"] },
  splunk: { label: "Splunk HEC", dir: "out", fields: ["url", "token", "index", "insecure"] },
  elastic: { label: "Elastic / OpenSearch", dir: "out", fields: ["url", "index", "apiKey", "insecure"] },
  syslog: { label: "Syslog (CEF)", dir: "out", fields: ["host", "port", "protocol"] },
  pagerduty: { label: "PagerDuty", dir: "out", fields: ["routingKey"] },
  wazuh: { label: "Wazuh", dir: "in", fields: ["apiUrl", "user", "password", "indexerUrl", "indexerUser", "secret", "minLevel", "insecure"] },
};

let integrations: Integration[] = [
  { id: "int_dd", type: "datadog", name: "Datadog · prod", enabled: true, minSeverity: "medium", events: ["incident", "downtime", "fim"], config: { site: "datadoghq.eu", apiKey: "••••••", tags: "team:soc,env:prod" }, lastStatus: { ok: true, ms: 184, at: NOW() - 22 * 60000 } },
  { id: "int_slack", type: "slack", name: "Slack · #soc-alerts", enabled: true, minSeverity: "high", events: ["incident", "downtime"], config: { webhookUrl: "••••••" }, lastStatus: { ok: true, ms: 211, at: NOW() - 22 * 60000 } },
  { id: "int_wz", type: "wazuh", name: "Wazuh · legacy cluster", enabled: true, minSeverity: "high", events: [], config: { apiUrl: "https://wazuh.example.internal:55000", user: "lemonsees", password: "••••••", indexerUrl: "https://wazuh-indexer.example.internal:9200", indexerUser: "lemonsees", secret: "••••••", minLevel: "7", insecure: true }, lastStatus: { ok: true, info: "12 agents · 186 alerts", at: NOW() - 4 * 60000 } },
  { id: "int_syslog", type: "syslog", name: "QRadar (CEF)", enabled: true, minSeverity: "critical", events: ["incident"], config: { host: "203.0.113.50", port: "6514", protocol: "tls" }, lastStatus: { ok: false, error: "connect ETIMEDOUT 203.0.113.50:6514", at: NOW() - 3 * H } },
  { id: "int_pd", type: "pagerduty", name: "PagerDuty · on-call", enabled: false, minSeverity: "critical", events: ["incident"], config: { routingKey: "••••••" }, lastStatus: null },
];

const WZ_RULES: [string, number, string[], string[]][] = [
  ["sshd: authentication failed.", 5, ["T1110.001"], ["Credential Access"]],
  ["sshd: brute force trying to get access to the system. Authentication failed.", 10, ["T1110"], ["Credential Access"]],
  ["PAM: Multiple failed logins in a small period of time.", 10, ["T1110"], ["Credential Access"]],
  ["Integrity checksum changed.", 7, ["T1565.001"], ["Impact"]],
  ["Listened ports status (netstat) changed (new port opened or closed).", 7, ["T1049"], ["Discovery"]],
  ["Web server 400 error code.", 5, ["T1190"], ["Initial Access"]],
  ["Multiple web server 400 error codes from same source ip.", 10, ["T1595.002"], ["Reconnaissance"]],
  ["New user added to the system.", 8, ["T1136"], ["Persistence"]],
  ["Successful sudo to ROOT executed.", 3, ["T1548.003"], ["Privilege Escalation"]],
  ["Host-based anomaly detection event (rootcheck).", 7, ["T1014"], ["Defense Evasion"]],
  ["Shellshock attack detected", 15, ["T1190", "T1068"], ["Initial Access", "Privilege Escalation"]],
  ["Possible SQL injection attempt.", 12, ["T1190"], ["Initial Access"]],
];

function wazuh(): WazuhData {
  seed = 314;
  const agents = Array.from({ length: 12 }, (_, i) => ({
    id: String(i + 1).padStart(3, "0"),
    name: ["legacy-web-1", "legacy-web-2", "legacy-db", "vpn-gw", "ad-dc-01", "ad-dc-02", "fileserver", "jenkins", "gitlab", "mail-old", "erp-app", "erp-db"][i],
    ip: `10.30.${Math.floor(i / 4)}.${10 + i}`,
    status: i === 9 ? "disconnected" : i === 6 ? "never_connected" : "active",
    os: i === 4 || i === 5 ? "Microsoft Windows Server 2022" : pick(["Ubuntu 22.04.4 LTS", "Debian GNU/Linux 12", "Rocky Linux 9.4"]),
    version: "Wazuh v4.8.2",
    lastKeepAlive: new Date(NOW() - ri(5, 50) * 1000).toISOString(),
    group: i < 3 ? "web, linux" : i < 6 ? "core" : "default",
    source: "Wazuh · legacy cluster",
  }));
  const alerts = Array.from({ length: 186 }, (_, n) => {
    const [rule, base, mitre, tactic] = WZ_RULES[Math.min(WZ_RULES.length - 1, Math.floor(Math.pow(rnd(), 1.7) * WZ_RULES.length))];
    const level = Math.min(15, base + (rnd() > 0.85 ? 2 : 0));
    const a = agents[ri(0, 11)];
    return {
      id: `wz-${n}`,
      at: NOW() - ri(0, 24 * 60) * 60000,
      level,
      severity: (level >= 13 ? "critical" : level >= 10 ? "high" : level >= 7 ? "medium" : level >= 4 ? "low" : "info") as WazuhData["alerts"][number]["severity"],
      rule,
      ruleId: String(5700 + WZ_RULES.findIndex((r) => r[0] === rule) * 13),
      mitre,
      tactic,
      agent: a.name,
      srcip: rule.includes("sshd") || rule.includes("web") ? `203.0.113.${ri(2, 250)}` : "",
      log: `${new Date().toISOString()} ${a.name} ${rule}`,
      source: "Wazuh · legacy cluster",
    };
  }).sort((a, b) => b.at - a.at);
  return { connected: true, agents, alerts };
}

let rules: DetectionRule[] = [
  { id: "rule_sudo", name: "Невдалі sudo", enabled: true, source: "journal", path: "", pattern: "sudo.*(authentication failure|incorrect password)", threshold: 3, windowMin: 15, severity: "high", technique: "T1548", category: "privilege-escalation", hosts: [], lastHit: NOW() - 5 * H },
  { id: "rule_root", name: "Вхід root по SSH", enabled: true, source: "journal", path: "", pattern: "Accepted .* for root from", threshold: 1, windowMin: 60, severity: "high", technique: "T1078", category: "credential access", hosts: [], lastHit: null },
  { id: "rule_user", name: "Створено нового користувача", enabled: true, source: "journal", path: "", pattern: "useradd.*new user", threshold: 1, windowMin: 60, severity: "medium", technique: "T1136", category: "persistence", hosts: [], lastHit: NOW() - 26 * H },
  { id: "rule_nginx", name: "Сплеск 5xx у nginx", enabled: true, source: "file", path: "/var/log/nginx/access.log", pattern: "\" 5[0-9]{2} ", threshold: 200, windowMin: 10, severity: "medium", technique: "T1499", category: "downtime", hosts: ["h_web01", "h_web02"], lastHit: NOW() - 50 * 60000 },
  { id: "rule_ufw", name: "Сплеск блокувань UFW", enabled: false, source: "journal", path: "", pattern: "UFW BLOCK", threshold: 500, windowMin: 10, severity: "medium", technique: "T1595", category: "recon / scan", hosts: [], lastHit: null },
];
const PRESETS = [
  { name: "Невдалі sudo", source: "journal", pattern: "sudo.*(authentication failure|incorrect password)", threshold: 3, windowMin: 15, severity: "high", technique: "T1548", category: "privilege-escalation" },
  { name: "Створено нового користувача", source: "journal", pattern: "useradd.*new user", threshold: 1, windowMin: 60, severity: "medium", technique: "T1136", category: "persistence" },
  { name: "Вхід root по SSH", source: "journal", pattern: "Accepted .* for root from", threshold: 1, windowMin: 60, severity: "high", technique: "T1078", category: "credential access" },
  { name: "OOM killer", source: "journal", pattern: "Out of memory: Killed process", threshold: 1, windowMin: 30, severity: "medium", technique: "T1499", category: "downtime" },
  { name: "Segfault процесів", source: "journal", pattern: "segfault at", threshold: 5, windowMin: 30, severity: "low", technique: "T1203", category: "malware" },
  { name: "Сплеск блокувань UFW", source: "journal", pattern: "UFW BLOCK", threshold: 500, windowMin: 10, severity: "medium", technique: "T1595", category: "recon / scan" },
  { name: "Зміни crontab", source: "journal", pattern: "crontab.*(REPLACE|BEGIN EDIT)", threshold: 1, windowMin: 60, severity: "medium", technique: "T1053", category: "persistence" },
  { name: "Встановлення пакетів", source: "file", path: "/var/log/dpkg.log", pattern: " install ", threshold: 1, windowMin: 60, severity: "low", technique: "T1072", category: "misconfiguration" },
];

function samples(base: number, k: number) {
  return Array.from({ length: 120 }, (_, i) => {
    const at = NOW() - (119 - i) * 30000;
    return { at, cpu: Math.max(2, base + Math.sin(i / 7 + k) * 12 + Math.sin(i / 2.3) * 3), mem: 55 + k * 6 + Math.sin(i / 19) * 3, disk: 48 + k * 9, load: 0.6 + k * 0.3, fails: i % 17 === 0 ? ri(3, 30) : ri(0, 2), listen: 12 + k, procs: 180 + k * 20, fim: "a3f9c2e1d0b4c8aa" };
  });
}
let agents: AgentView[] = [
  { hostId: "h_web01", host: "web-prod-01", mode: "push", interval: 30, installedAt: NOW() - 9 * 24 * H, version: "1.0.0", lastSeen: NOW() - 20000, samples: samples(34, 0) },
  { hostId: "h_db01", host: "db-primary", mode: "pull", interval: 30, installedAt: NOW() - 30 * 24 * H, version: "1.0.0", lastSeen: NOW() - 40000, samples: samples(52, 1) },
  { hostId: "h_edge", host: "edge-gateway", mode: "push", interval: 15, installedAt: NOW() - 3 * 24 * H, version: "1.0.0", lastSeen: NOW() - 12 * 60000, samples: samples(18, 2) },
];

const status = (): SecurityStatus => ({
  vault: { algorithm: "AES-256-GCM", keySource: "os-keychain" },
  tls: true,
  auth: true,
  proxy: network.proxy.type !== "none" ? { type: network.proxy.type, host: network.proxy.host, port: network.proxy.port } : null,
  killSwitch: network.killSwitch,
  hardenedCrypto: network.hardenedCrypto,
  strictHostKeys: network.strictHostKeys,
  pinnedHosts: 6,
  totalHosts: 6,
  bastionHosts: 1,
});

/** Повертає відповідь або undefined, якщо маршрут не з 3.1. */
export function demoExtRequest(method: string, p: string, body: unknown): unknown {
  if (p === "/api/info") return { version: "3.1.0", auth: true, authed: true, platform: "demo", web: true, vendor: "Altumptic" };
  if (p === "/api/network") {
    if (method === "PUT") {
      const b = body as Partial<NetworkConfig> & { proxy?: { type: NetworkConfig["proxy"]["type"]; host: string; port: number; user: string } };
      network = { ...network, ...b, proxy: b.proxy ? { type: b.proxy.type, host: b.proxy.host, port: b.proxy.port, user: b.proxy.user, hasPass: false } : network.proxy } as NetworkConfig;
    }
    return network;
  }
  if (p === "/api/network/test") return { ip: network.proxy.type !== "none" ? "198.51.100.200" : "192.0.2.77", viaProxy: network.proxy.type !== "none", ms: network.proxy.type !== "none" ? 612 : 48 };
  if (p === "/api/security/status") return status();
  if (p === "/api/security/outbound")
    return {
      route: network.proxy.type !== "none" ? `${network.proxy.type}://${network.proxy.host}:${network.proxy.port}` : "direct",
      killSwitch: network.killSwitch,
      telemetry: "none",
      items: [
        { id: "ssh", target: "your servers (SSH)", purpose: "telemetry, scans, terminal", when: "always, for configured hosts", enabled: true },
        { id: "geoip", target: "https://ipwho.is", purpose: "country/ISP of attacker IPs", when: "opt-in (Settings → SOC)", enabled: null },
        { id: "egress", target: "https://api.ipify.org", purpose: "show which IP servers see", when: "only when you press the button", enabled: false },
        { id: "uptime", target: "your monitored URLs", purpose: "uptime checks", when: "for configured monitors", enabled: true },
        ...integrations.filter((i) => i.enabled).map((i) => ({ id: i.id, target: i.name, purpose: i.type === "wazuh" ? "import agents/alerts" : "forward alerts", when: "configured integration", enabled: true })),
      ],
    };
  if (p === "/api/backup/export") {
    const b = body as { passphrase?: string };
    if (!b.passphrase || b.passphrase.length < 10) throw new Error("Пароль бекапу — щонайменше 10 символів");
    return { format: "lemonsees-backup", version: 1, kdf: { name: "scrypt", N: 32768, r: 8, p: 1, salt: "ZGVtby1zYWx0" }, cipher: "aes-256-gcm", iv: "ZGVtby1pdg==", tag: "ZGVtby10YWc=", data: "ZGVtbyBiYWNrdXAgKGVuY3J5cHRlZCBieSB0aGUgcmVhbCBlbmdpbmUp", demo: true };
  }
  if (p === "/api/backup/import") throw new Error("Імпорт бекапу недоступний у демо-режимі");
  if (p === "/api/integrations" && method === "GET") return { catalog: CATALOG, integrations };
  if (p === "/api/integrations" && method === "POST") {
    const i = { ...(body as Integration), id: `int_${Date.now()}`, lastStatus: null };
    integrations = [...integrations, i];
    return i;
  }
  let m = p.match(/^\/api\/integrations\/([^/]+)(\/test)?$/);
  if (m) {
    const id = m[1];
    if (m[2]) {
      const i = integrations.find((x) => x.id === id);
      if (i?.type === "syslog") throw new Error("connect ETIMEDOUT 203.0.113.50:6514");
      integrations = integrations.map((x) => (x.id === id ? { ...x, lastStatus: { ok: true, ms: 190, at: NOW(), info: x.type === "wazuh" ? "12 agents · 186 alerts" : undefined } } : x));
      return i?.type === "wazuh" ? { ok: true, agents: 12, alerts: 186 } : { ok: true, ms: 190 };
    }
    if (method === "DELETE") integrations = integrations.filter((x) => x.id !== id);
    else integrations = integrations.map((x) => (x.id === id ? { ...x, ...(body as object) } : x));
    return { ok: true };
  }
  if (p === "/api/wazuh") return wazuh();
  if (p === "/api/wazuh/refresh") return { ok: true };
  if (p === "/api/rules" && method === "GET") return { rules, presets: PRESETS };
  if (p === "/api/rules" && method === "PUT") {
    rules = ((body as { rules: DetectionRule[] }).rules || []).map((r) => ({ ...r, id: r.id || `rule_${Math.random().toString(36).slice(2, 8)}`, lastHit: r.lastHit ?? null, hosts: r.hosts ?? [] }));
    return { rules };
  }
  if (p === "/api/rules/test") return { count: 7, triggered: true };
  if (p === "/api/agents") return { version: "1.0.0", agents };
  m = p.match(/^\/api\/agents\/([^/]+)\/(deploy|remove|sync|command)$/);
  if (m) {
    const [, id, act] = m;
    if (act === "remove") {
      agents = agents.filter((a) => a.hostId !== id);
      return { ok: true };
    }
    if (act === "command") return { command: "set -e\nmkdir -p $HOME/.lemonsees-agent && chmod 700 $HOME/.lemonsees-agent\necho '…' | base64 -d > $HOME/.lemonsees-agent/agent.sh\n# (демо) повна команда генерується двигуном", uninstall: "" };
    if (act === "deploy") {
      const o = body as { mode: "pull" | "push"; interval: number };
      agents = [...agents.filter((a) => a.hostId !== id), { hostId: id, host: id.replace("h_", ""), mode: o.mode, interval: o.interval, installedAt: NOW(), version: "1.0.0", lastSeen: NOW(), samples: samples(30, agents.length) }];
    }
    return agents.find((a) => a.hostId === id) ?? null;
  }
  return undefined;
}
