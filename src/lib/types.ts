import { settingsStore } from "./settings";

export type HostStatus = "online" | "connecting" | "offline" | "error";

export type ContainerState = "running" | "restarting" | "paused" | "exited" | "created" | "dead";

export type Metrics = {
  cpu: number;
  memTotalMb: number;
  memUsedMb: number;
  memPct: number;
  diskTotalKb: number;
  diskUsedKb: number;
  diskPct: number;
  uptimeSec: number;
  load1: number;
  kernel: string;
  cores: number;
  hostname?: string;
  netRxBps?: number;
  netTxBps?: number;
  netRxTotal?: number;
  netTxTotal?: number;
  connections?: number;
};

export type Container = {
  id: string;
  name: string;
  image: string;
  state: ContainerState;
  status: string;
  ports: string;
  cpuPct: number;
  memUsedMb: number;
  memLimitMb: number;
};

export type NetworkItem = { id: string; name: string; driver: string; scope: string };
export type Volume = { name: string; driver: string; scope: string; mountpoint: string };

export type HostState = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  authType: "key" | "password";
  keyPath: string;
  interval: number;
  hasPassword: boolean;
  status: HostStatus;
  error: string;
  metrics: Metrics | null;
  containers: Container[];
  networks: NetworkItem[];
  volumes: Volume[];
  dockerVersion: string;
  updatedAt: number;
  jumpHostId?: string;
  proxy?: ProxyPublic;
  hostKey?: string;
  tags?: string[];
};

export type HostInput = {
  name: string;
  host: string;
  port: number;
  user: string;
  authType: "key" | "password";
  keyPath: string;
  passphrase: string;
  password: string;
  interval: number;
  jumpHostId?: string;
  proxy?: ProxyInput;
  resetHostKey?: boolean;
  tags?: string[];
};

/* ---------------- Бази даних ---------------- */

export type DbType = string; // id рушія з реєстру engines.ts

export type DbConn = {
  id: string;
  hostId: string;
  name: string;
  type: DbType;
  dbHost: string;
  dbPort: number;
  user: string;
  database: string;
  dbFile: string;
  hasPassword: boolean;
};

export type DbInput = {
  hostId: string;
  name: string;
  type: DbType;
  dbHost: string;
  dbPort: number;
  user: string;
  database: string;
  dbFile: string;
  password: string;
};

export type DetectedDb = {
  type: DbType;
  dbHost: string;
  dbPort: number;
  dbFile?: string;
  name: string;
  source: string;
};

export type DbColumn = { name: string; type: string; pk: boolean };
export type DbTable = { schema: string; name: string; columns: DbColumn[] };
export type RedisKey = { key: string; type: string };

export type DbSchema =
  | { kind: "sql"; tables: DbTable[] }
  | { kind: "redis"; dbsize: number; keys: RedisKey[]; info: Record<string, string> }
  | { kind: "http"; hints: string[] };

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  command: string;
};

export type TableResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
};

/* ---------------- SOC / GRC ---------------- */

export type Finding = { severity: "critical" | "warning" | "info"; text: string };

export type SecurityPosture = {
  risk: number;
  grade: "ok" | "info" | "warning" | "critical";
  findings: Finding[];
  ports: { proto: string; port: number; addr: string; public: boolean }[];
  publicPortCount: number;
  sessions: { user: string; tty: string; from: string }[];
  lastLogins: string[];
  failedLogins: number;
  firewall: { tool: string; active: boolean };
  updates: number;
  suid: number;
  ssh: { rootLogin: string; passwordAuth: string; emptyPasswords: string; x11: string; maxAuthTries: string };
  fail2ban: boolean;
  at: number;
};

export type ControlDef = { id: string; title: string; framework: string; severity: string };
export type ControlResult = ControlDef & { status: "pass" | "fail" | "unknown"; evidence: string };
export type Attestation = { status: "attested" | "na" | "failed"; note: string; at: number };
export type Attestations = Record<string, Attestation>;

export type Incident = {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  status: "open" | "investigating" | "mitigated" | "closed";
  hostId: string;
  assignee: string;
  detail: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  timeline: { at: number; text: string }[];
};

export type IncidentInput = {
  title: string;
  severity: Incident["severity"];
  status: Incident["status"];
  hostId: string;
  assignee: string;
  detail: string;
  category: string;
  note?: string;
};

export type AuditEvent = { at: number; actor: string; action: string; target: string; meta: Record<string, unknown> };

export type Geo = { country: string; countryCode: string; city: string; isp: string; lat?: number; lon?: number };
export type Attacker = { ip: string; count: number; geo: Geo | null };
export type ThreatReport = {
  attackers: Attacker[];
  users: { user: string; count: number }[];
  accepted: { ip: string; count: number }[];
  countries: { cc: string; country: string; count: number }[];
  total: number;
  uniqueIps: number;
  at: number;
};
export type SocConfig = {
  autoIncidents: boolean;
  bruteThreshold: number;
  notifyDowntime?: boolean; // desktop-сповіщення про даунтайм моніторів
  retentionDays?: number; // скільки днів тримати аудит
  sweepMinutes?: number; // як часто перевіряти брутфорс
};

/* ---------------- FIM (контроль цілісності файлів) ---------------- */

export type FimFile = {
  path: string;
  sha256: string;
  size: number;
  mode: string;
  owner: string;
  mtime: number;
  status: "ok" | "modified" | "added" | "missing" | "new";
};
export type FimReport = { baselineAt: number | null; at: number; files: FimFile[]; changed: number };

export type VulnFinding = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  status: "vuln" | "ok" | "unknown";
  detail: string;
  remediation: string;
};
export type VulnCategory = { cat: string; label: string; total: number; passed: number; pct: number };
export type VulnReport = {
  secScore: number;
  risk: number;
  grade: "ok" | "info" | "warning" | "critical";
  findings: VulnFinding[];
  vulnCount: number;
  bySeverity: Record<string, number>;
  categories: VulnCategory[];
  os: string;
  at: number;
};

export type Peer = { ip: string; count: number; geo: Geo | null };

export type MetricSample = { at: number; cpu: number; memPct: number; diskPct: number; rx: number; tx: number; conn: number };

export type MonitorCheck = { at: number; ok: boolean; status: number; ms: number; error: string };
export type MonitorStats = { uptimePct: number | null; checks: number; avgMs: number; last: MonitorCheck | null; up: boolean };
export type Monitor = {
  id: string;
  name: string;
  url: string;
  method: string;
  expectStatus: number;
  intervalSec: number;
  timeoutMs: number;
  enabled: boolean;
  stats?: MonitorStats;
};
export type MonitorInput = {
  name: string;
  url: string;
  method: string;
  expectStatus: number;
  intervalSec: number;
  timeoutMs: number;
  enabled: boolean;
};
export type MonitorEvent = { monitorId: string; name: string; url: string; ok: boolean; status: number; ms: number; error: string; at: number };

/* ---------------- EDR / NDR / CTI / утиліти ---------------- */

export type Process = {
  user: string;
  pid: number;
  ppid: number;
  cpu: number;
  mem: number;
  uptimeSec: number;
  stat: string;
  comm: string;
};
export type ProcessReport = { processes: Process[]; total: number; cpuSum: number; memSum: number; at: number };

export type CronEntry = { source: string; entry: string };
export type PersistenceReport = {
  cron: CronEntry[];
  running: string[];
  enabled: string[];
  timers: string[];
  startup: string[];
  counts: { cron: number; running: number; enabled: number; timers: number };
  at: number;
};

export type Connection = { proto: string; state: string; local: string; peer: string; process: string };
export type ConnectionsReport = {
  established: Connection[];
  listening: Connection[];
  estabCount: number;
  listenCount: number;
  at: number;
};

export type ToolResult = { tool: string; target: string; output: string; at: number };

export type IpIntel = {
  ip: string;
  geo: Geo | null;
  rdns: string;
  whois: string[];
  known: boolean;
  attackCount: number;
  reputation: string;
  at: number;
};

export function fmtBps(bps: number): string {
  if (!bps || bps < 0) return "0 B/s";
  const u = ["B/s", "KB/s", "MB/s", "GB/s"];
  let i = 0;
  let v = bps;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function fmtWhen(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const hour12 = !settingsStore.value.clock24;
  const now = Date.now();
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60) return "щойно";
  if (diff < 3600) return `${Math.floor(diff / 60)} хв тому`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} год тому`;
  return d.toLocaleString(undefined, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12 });
}

export function fmtUptime(sec: number): string {
  if (!sec) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}д ${String(h).padStart(2, "0")}г`;
  if (h > 0) return `${h}г ${String(m).padStart(2, "0")}хв`;
  return `${m}хв`;
}

export function fmtGb(kb: number): string {
  return (kb / 1024 / 1024).toFixed(1) + " GB";
}

/* ---------------- 3.1: приватність, інтеграції, агенти, правила ---------------- */

export type ProxyType = "none" | "socks5" | "http";
export type ProxyPublic = { type: ProxyType; host: string; port: number; user: string; hasPass: boolean };
export type ProxyInput = { type: ProxyType; host: string; port: number; user: string; pass?: string };

export type NetworkConfig = {
  proxy: ProxyPublic;
  applySsh: boolean;
  applyOutbound: boolean;
  killSwitch: boolean;
  remoteDns: boolean;
  hardenedCrypto: boolean;
  strictHostKeys: boolean;
};

export type SecurityStatus = {
  vault: { algorithm: string; keySource: "file" | "passphrase" | "os-keychain" };
  tls: boolean;
  auth: boolean;
  proxy: { type: string; host: string; port: number } | null;
  killSwitch: boolean;
  hardenedCrypto: boolean;
  strictHostKeys: boolean;
  pinnedHosts: number;
  totalHosts: number;
  bastionHosts: number;
};

export type IntegrationType = "datadog" | "slack" | "teams" | "telegram" | "webhook" | "splunk" | "elastic" | "syslog" | "pagerduty" | "wazuh";
export type IntegrationCatalog = Record<IntegrationType, { label: string; dir: "in" | "out"; fields: string[] }>;
export type Integration = {
  id: string;
  type: IntegrationType;
  name: string;
  enabled: boolean;
  minSeverity: "critical" | "high" | "medium" | "low" | "info";
  events: ("incident" | "downtime" | "fim")[];
  config: Record<string, string | boolean>;
  lastStatus: { ok: boolean; error?: string; info?: string; ms?: number; at: number } | null;
};

export type WazuhAgent = { id: string; name: string; ip: string; status: string; os: string; version: string; lastKeepAlive: string; group: string; source: string };
export type WazuhAlert = { id: string; at: number; level: number; severity: Incident["severity"]; rule: string; ruleId: string; mitre: string[]; tactic: string[]; agent: string; srcip: string; log: string; source: string };
export type WazuhData = { connected: boolean; agents: WazuhAgent[]; alerts: WazuhAlert[] };

export type DetectionRule = {
  id: string;
  name: string;
  enabled: boolean;
  source: "journal" | "file";
  path: string;
  pattern: string;
  threshold: number;
  windowMin: number;
  severity: Incident["severity"];
  technique: string;
  category: string;
  hosts: string[];
  lastHit: number | null;
};

export type AgentSample = { at: number; cpu: number; mem: number; disk: number; load: number; fails: number; listen: number; procs: number; fim: string };
export type AgentView = { hostId: string; host: string; mode: "pull" | "push"; interval: number; installedAt: number; version: string; lastSeen: number | null; samples: AgentSample[] };
