import { useEffect, useState } from "react";
import type { HostInput, HostState } from "./types";

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
