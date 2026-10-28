import { useSyncExternalStore } from "react";
import type {
  HostInput,
  HostState,
  DbConn,
  DbInput,
  DbSchema,
  QueryResult,
  TableResult,
  DetectedDb,
  SecurityPosture,
  ControlDef,
  ControlResult,
  Attestations,
  Incident,
  IncidentInput,
  AuditEvent,
  ThreatReport,
  SocConfig,
  VulnReport,
  Peer,
  ProcessReport,
  MetricSample,
  Monitor,
  MonitorInput,
  MonitorCheck,
  MonitorStats,
  MonitorEvent,
  PersistenceReport,
  ConnectionsReport,
  ToolResult,
  IpIntel,
  FimReport,
  NetworkConfig,
  SecurityStatus,
  Integration,
  IntegrationCatalog,
  WazuhData,
  DetectionRule,
  AgentView,
} from "./types";
import { settingsStore } from "./settings";
// Демо-двигун вантажиться окремим чанком лише коли увімкнено демо-режим
const loadDemo = () => import("./demo");

/* ---------- REST ---------- */

export class AuthError extends Error {}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  if (settingsStore.value.demo) {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const { demoRequest } = await loadDemo();
    return (await demoRequest(init?.method ?? "GET", url, body)) as T;
  }
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    store.setAuth(false);
    throw new AuthError("Unauthorized");
  }
  if (!r.ok) throw new Error((data as { error?: string }).error || `HTTP ${r.status}`);
  return data as T;
}

export const api = {
  addHost: (h: HostInput) => req<HostState>("/api/hosts", { method: "POST", body: JSON.stringify(h) }),
  updateHost: (id: string, h: HostInput) =>
    req<HostState>(`/api/hosts/${id}`, { method: "PUT", body: JSON.stringify(h) }),
  deleteHost: (id: string) => req<{ ok: boolean }>(`/api/hosts/${id}`, { method: "DELETE" }),
  testHost: (h: HostInput) =>
    req<{ ok: boolean; output: string }>("/api/hosts/test", { method: "POST", body: JSON.stringify(h) }),
  containerAction: (hostId: string, action: string, name: string) =>
    req<{ ok: boolean }>(`/api/containers/${hostId}/${action}`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  containerLogs: (hostId: string, name: string, tail = 300) =>
    req<{ logs: string }>(
      `/api/containers/${hostId}/logs?name=${encodeURIComponent(name)}&tail=${tail}`,
    ),

  // Бази даних
  listDbs: () => req<DbConn[]>("/api/dbs"),
  detectDbs: (hostId: string) =>
    req<{ found: DetectedDb[] }>(`/api/hosts/${hostId}/detect-dbs`, { method: "POST" }),
  addDb: (d: DbInput) => req<DbConn>("/api/dbs", { method: "POST", body: JSON.stringify(d) }),
  updateDb: (id: string, d: DbInput) =>
    req<DbConn>(`/api/dbs/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteDb: (id: string) => req<{ ok: boolean }>(`/api/dbs/${id}`, { method: "DELETE" }),
  testDb: (d: DbInput) =>
    req<{ ok: boolean; rowCount: number }>(`/api/dbs/new/test`, {
      method: "POST",
      body: JSON.stringify(d),
    }),
  dbSchema: (id: string) => req<DbSchema>(`/api/dbs/${id}/schema`, { method: "POST" }),
  dbQuery: (id: string, sql: string) =>
    req<QueryResult>(`/api/dbs/${id}/query`, { method: "POST", body: JSON.stringify({ sql }) }),
  dbTable: (id: string, schema: string, table: string, limit: number, offset: number) =>
    req<TableResult>(`/api/dbs/${id}/table`, {
      method: "POST",
      body: JSON.stringify({ schema, table, limit, offset }),
    }),
  dbUpdateRow: (
    id: string,
    schema: string,
    table: string,
    pk: Record<string, unknown>,
    changes: Record<string, unknown>,
  ) =>
    req<{ affected: number }>(`/api/dbs/${id}/update`, {
      method: "POST",
      body: JSON.stringify({ schema, table, pk, changes }),
    }),

  // SOC — безпека
  security: (hostId: string) =>
    req<SecurityPosture>(`/api/hosts/${hostId}/security`, { method: "POST" }),
  threats: (hostId: string, geo: boolean) =>
    req<ThreatReport>(`/api/hosts/${hostId}/threats?geo=${geo ? 1 : 0}`, { method: "POST" }),
  getSoc: () => req<SocConfig>("/api/soc"),
  setSoc: (cfg: SocConfig) => req<SocConfig>("/api/soc", { method: "PUT", body: JSON.stringify(cfg) }),
  vulns: (hostId: string) => req<VulnReport>(`/api/hosts/${hostId}/vulns`, { method: "POST" }),
  peers: (hostId: string, geo: boolean) =>
    req<{ peers: Peer[] }>(`/api/hosts/${hostId}/peers?geo=${geo ? 1 : 0}`, { method: "POST" }),

  // EDR / NDR / CTI / утиліти
  processes: (hostId: string) => req<ProcessReport>(`/api/hosts/${hostId}/processes`, { method: "POST" }),
  persistence: (hostId: string) => req<PersistenceReport>(`/api/hosts/${hostId}/persistence`, { method: "POST" }),
  connections: (hostId: string) => req<ConnectionsReport>(`/api/hosts/${hostId}/connections`, { method: "POST" }),
  tool: (hostId: string, tool: string, target: string, port?: number) =>
    req<ToolResult>(`/api/hosts/${hostId}/tool`, { method: "POST", body: JSON.stringify({ tool, target, port }) }),
  investigate: (hostId: string, ip: string, geo: boolean) =>
    req<IpIntel>(`/api/hosts/${hostId}/investigate?geo=${geo ? 1 : 0}`, { method: "POST", body: JSON.stringify({ ip }) }),
  logtail: (hostId: string, path: string, lines = 200) =>
    req<{ path: string; lines: string[] }>(`/api/hosts/${hostId}/logtail?path=${encodeURIComponent(path)}&lines=${lines}`),
  history: (hostId: string) => req<{ history: MetricSample[] }>(`/api/hosts/${hostId}/history`),
  fim: (hostId: string) => req<FimReport>(`/api/hosts/${hostId}/fim`, { method: "POST" }),
  fimBaseline: (hostId: string) => req<FimReport>(`/api/hosts/${hostId}/fim-baseline`, { method: "POST" }),

  // Приватність і мережа
  network: () => req<NetworkConfig>("/api/network"),
  setNetwork: (n: Omit<Partial<NetworkConfig>, "proxy"> & { proxy?: unknown }) => req<NetworkConfig>("/api/network", { method: "PUT", body: JSON.stringify(n) }),
  egress: () => req<{ ip: string; viaProxy: boolean; ms: number }>("/api/network/test", { method: "POST" }),
  securityStatus: () => req<SecurityStatus>("/api/security/status"),
  resetHostKey: (id: string) => req<{ ok: boolean }>(`/api/hosts/${id}/hostkey/reset`, { method: "POST" }),

  outbound: () => req<{ route: string; killSwitch: boolean; telemetry: string; items: { id: string; target: string; purpose: string; when: string; enabled: boolean | null }[] }>("/api/security/outbound"),
  backupExport: (settings: unknown, passphrase: string) => req<Record<string, unknown>>("/api/backup/export", { method: "POST", body: JSON.stringify({ settings, passphrase }) }),
  backupImport: (blob: unknown, passphrase: string) => req<{ settings: Record<string, unknown>; soc: SocConfig | null; exportedAt: string }>("/api/backup/import", { method: "POST", body: JSON.stringify({ blob, passphrase }) }),

  // Інтеграції
  integrations: () => req<{ catalog: IntegrationCatalog; integrations: Integration[] }>("/api/integrations"),
  addIntegration: (i: Partial<Integration>) => req<Integration>("/api/integrations", { method: "POST", body: JSON.stringify(i) }),
  updateIntegration: (id: string, i: Partial<Integration>) => req<Integration>(`/api/integrations/${id}`, { method: "PUT", body: JSON.stringify(i) }),
  deleteIntegration: (id: string) => req<{ ok: boolean }>(`/api/integrations/${id}`, { method: "DELETE" }),
  testIntegration: (id: string) => req<{ ok: boolean; ms?: number; agents?: number; alerts?: number }>(`/api/integrations/${id}/test`, { method: "POST" }),
  wazuh: () => req<WazuhData>("/api/wazuh"),
  wazuhRefresh: () => req<{ ok: boolean }>("/api/wazuh/refresh", { method: "POST" }),

  // Правила виявлення
  rules: () => req<{ rules: DetectionRule[]; presets: Partial<DetectionRule>[] }>("/api/rules"),
  saveRules: (rules: Partial<DetectionRule>[]) => req<{ rules: DetectionRule[] }>("/api/rules", { method: "PUT", body: JSON.stringify({ rules }) }),
  testRule: (rule: Partial<DetectionRule>, hostId: string) => req<{ count: number; triggered: boolean }>("/api/rules/test", { method: "POST", body: JSON.stringify({ rule, hostId }) }),

  // Агенти
  agents: () => req<{ version: string; agents: AgentView[] }>("/api/agents"),
  deployAgent: (id: string, o: { mode: "pull" | "push"; interval: number; pushUrl?: string; insecure?: boolean }) => req<AgentView>(`/api/agents/${id}/deploy`, { method: "POST", body: JSON.stringify(o) }),
  removeAgent: (id: string) => req<{ ok: boolean }>(`/api/agents/${id}/remove`, { method: "POST" }),
  syncAgent: (id: string) => req<AgentView | null>(`/api/agents/${id}/sync`, { method: "POST" }),
  agentCommand: (id: string, o: { interval: number; pushUrl?: string; insecure?: boolean }) => req<{ command: string; uninstall: string }>(`/api/agents/${id}/command`, { method: "POST", body: JSON.stringify(o) }),

  // Доступ (веб-режим із токеном)
  login: (token: string) => req<{ ok: boolean }>("/api/auth/login", { method: "POST", body: JSON.stringify({ token }) }),
  logout: () => req<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  info: () => req<{ version: string; auth: boolean; platform: string; web: boolean }>("/api/info"),

  // Uptime-монітори
  listMonitors: () => req<Monitor[]>("/api/monitors"),
  addMonitor: (m: MonitorInput) => req<Monitor>("/api/monitors", { method: "POST", body: JSON.stringify(m) }),
  updateMonitor: (id: string, m: MonitorInput) => req<Monitor>(`/api/monitors/${id}`, { method: "PUT", body: JSON.stringify(m) }),
  deleteMonitor: (id: string) => req<{ ok: boolean }>(`/api/monitors/${id}`, { method: "DELETE" }),
  monitorHistory: (id: string) =>
    req<{ history: MonitorCheck[]; stats: MonitorStats }>(`/api/monitors/${id}/history`),
  checkMonitor: (id: string) => req<MonitorCheck>(`/api/monitors/${id}/check`, { method: "POST" }),
  monitorEvents: () => req<{ events: MonitorEvent[] }>("/api/monitors/events"),

  // GRC — комплаєнс
  complianceControls: () =>
    req<{ auto: ControlDef[]; manual: ControlDef[]; attest: Attestations }>("/api/compliance/controls"),
  complianceRun: (hostId: string) =>
    req<{ controls: ControlResult[] }>(`/api/hosts/${hostId}/compliance`, { method: "POST" }),
  attest: (controlId: string, status: string, note: string) =>
    req<{ ok: boolean; attest: Attestations }>(`/api/compliance/attest/${controlId}`, {
      method: "PUT",
      body: JSON.stringify({ status, note }),
    }),

  // SOC — інциденти
  listIncidents: () => req<Incident[]>("/api/incidents"),
  addIncident: (i: IncidentInput) => req<Incident>("/api/incidents", { method: "POST", body: JSON.stringify(i) }),
  updateIncident: (id: string, i: IncidentInput) =>
    req<Incident>(`/api/incidents/${id}`, { method: "PUT", body: JSON.stringify(i) }),
  deleteIncident: (id: string) => req<{ ok: boolean }>(`/api/incidents/${id}`, { method: "DELETE" }),

  // GRC — аудит
  audit: (limit = 500) => req<{ events: AuditEvent[] }>(`/api/audit?limit=${limit}`),
};

/* ---------- Живий стан через WebSocket ---------- */

type Listener = () => void;

type Snapshot = { hosts: HostState[]; connected: boolean; authed: boolean; demo: boolean };

class StateStore {
  hosts: HostState[] = [];
  connected = false;
  authed = true;
  snapshot: Snapshot = { hosts: [], connected: false, authed: true, demo: false };
  private demoTimer: number | null = null;
  private demoOn = false;
  private lastRaw = "";
  private listeners = new Set<Listener>();
  private ws: WebSocket | null = null;
  private retry = 1000;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    this.sync();
    return () => this.listeners.delete(fn);
  }

  setAuth(ok: boolean) {
    if (this.authed === ok) return;
    this.authed = ok;
    if (ok) this.sync();
    this.emit();
  }

  /** Перемикання між живим двигуном і демо-режимом. */
  sync() {
    const demo = settingsStore.value.demo;
    if (demo && !this.demoOn) {
      this.demoOn = true;
      this.ws?.close();
      this.ws = null;
      loadDemo().then(({ demoHosts }) => {
        if (!this.demoOn) return;
        const tick = () => {
          this.hosts = demoHosts();
          this.connected = true;
          this.emit();
        };
        tick();
        this.demoTimer = window.setInterval(tick, 3000);
      });
    } else if (!demo && this.demoOn) {
      this.demoOn = false;
      if (this.demoTimer) clearInterval(this.demoTimer);
      this.hosts = [];
      this.connected = false;
      this.lastRaw = "";
      this.emit();
    }
    if (!demo && !this.ws && this.authed) this.connect();
  }

  private emit() {
    this.snapshot = { hosts: this.hosts, connected: this.connected, authed: this.authed, demo: this.demoOn };
    for (const fn of this.listeners) fn();
  }

  private connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/state`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retry = 1000;
      this.emit();
    };
    ws.onmessage = (e) => {
      try {
        const raw = e.data as string;
        // Ідентичний стан — нічого не перемальовуємо
        if (raw === this.lastRaw) return;
        this.lastRaw = raw;
        const msg = JSON.parse(raw);
        if (msg.type === "state") {
          this.hosts = msg.hosts as HostState[];
          this.emit();
        }
      } catch {
        /* ignore */
      }
    };
    const reconnect = () => {
      if (this.demoOn || this.ws !== ws) return;
      this.connected = false;
      this.ws = null;
      this.lastRaw = "";
      this.emit();
      setTimeout(() => !this.demoOn && !this.ws && this.connect(), this.retry);
      this.retry = Math.min(this.retry * 1.6, 10000);
    };
    ws.onclose = reconnect;
    ws.onerror = () => ws.close();
  }
}

export const store = new StateStore();
settingsStore.subscribe(() => store.sync());

const subscribeState = (fn: Listener) => store.subscribe(fn);
const stateSnapshot = () => store.snapshot;

export function useAppState(): Snapshot {
  return useSyncExternalStore(subscribeState, stateSnapshot);
}

/** Глобально вибраний хост — спільний для верхньої панелі й усіх сторінок. */
export function useHostSelection(): [string | null, (id: string | null) => void] {
  const { hosts } = useAppState();
  const id = useSyncExternalStore(
    (fn) => settingsStore.subscribe(fn),
    () => settingsStore.value.hostId,
  );
  const valid = id && hosts.some((h) => h.id === id) ? id : null;
  return [valid, setHostSelection];
}
const setHostSelection = (id: string | null) => settingsStore.set({ hostId: id });
