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
