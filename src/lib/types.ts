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

export type Geo = { country: string; countryCode: string; city: string; isp: string };
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
export type SocConfig = { autoIncidents: boolean; bruteThreshold: number };

export function fmtWhen(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = Date.now();
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60) return "щойно";
  if (diff < 3600) return `${Math.floor(diff / 60)} хв тому`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} год тому`;
  return d.toLocaleString();
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
