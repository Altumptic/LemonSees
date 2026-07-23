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
