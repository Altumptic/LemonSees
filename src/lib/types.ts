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
