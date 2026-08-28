import { useEffect, useState } from "react";
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
} from "./types";

/* ---------- REST ---------- */

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await r.json().catch(() => ({}));
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

class StateStore {
  hosts: HostState[] = [];
  connected = false;
  private listeners = new Set<Listener>();
  private ws: WebSocket | null = null;
  private retry = 1000;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    if (!this.ws) this.connect();
    return () => this.listeners.delete(fn);
  }

  private emit() {
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
        const msg = JSON.parse(e.data as string);
        if (msg.type === "state") {
          this.hosts = msg.hosts as HostState[];
          this.emit();
        }
      } catch {
        /* ignore */
      }
    };
    const reconnect = () => {
      this.connected = false;
      this.ws = null;
      this.emit();
      setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(this.retry * 1.6, 10000);
    };
    ws.onclose = reconnect;
    ws.onerror = () => ws.close();
  }
}

export const store = new StateStore();

export function useAppState(): { hosts: HostState[]; connected: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = store.subscribe(() => force((v) => v + 1));
    return () => {
      unsub();
    };
  }, []);
  return { hosts: store.hosts, connected: store.connected };
}
