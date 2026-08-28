// Uptime-моніторинг сайтів/ендпоінтів. HTTP-перевірки з двигуна (fetch),
// історія в памʼяті, статистика доступності й затримки.
export class Uptime {
  constructor() {
    this.history = new Map(); // id -> [{at, ok, status, ms, error}]
    this.timers = new Map();
    this.monitors = [];
    this.lastOk = new Map(); // id -> boolean
    this.events = []; // переходи up/down
    this.onEvent = null; // (evt) => void
  }

  setMonitors(list) {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
    this.monitors = list;
    for (const m of list) if (m.enabled) this.schedule(m);
  }

  schedule(m) {
    this.check(m).catch(() => {});
    const t = setInterval(() => {
      const cur = this.monitors.find((x) => x.id === m.id);
      if (cur && cur.enabled) this.check(cur).catch(() => {});
    }, Math.max(10, m.intervalSec) * 1000);
    this.timers.set(m.id, t);
  }

  async check(m) {
    const start = Date.now();
    let ok = false;
    let status = 0;
    let error = "";
    try {
      const res = await fetch(m.url, {
        method: m.method || "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(m.timeoutMs || 10000),
        headers: { "user-agent": "LemonSees-Uptime/1.0" },
      });
      status = res.status;
      ok = m.expectStatus ? status === m.expectStatus : status >= 200 && status < 400;
    } catch (e) {
      error = e?.name === "TimeoutError" ? "timeout" : e?.message || "error";
      ok = false;
    }
    const ms = Date.now() - start;
    const arr = this.history.get(m.id) || [];
    arr.push({ at: Date.now(), ok, status, ms, error });
    if (arr.length > 240) arr.shift();
    this.history.set(m.id, arr);

    // Перехід стану → подія + сповіщення
    const prev = this.lastOk.get(m.id);
    if (prev !== undefined && prev !== ok) {
      const evt = { monitorId: m.id, name: m.name, url: m.url, ok, status, ms, error, at: Date.now() };
      this.events.unshift(evt);
      if (this.events.length > 100) this.events.pop();
      try {
        this.onEvent?.(evt);
      } catch {
        /* ignore */
      }
    }
    this.lastOk.set(m.id, ok);
    return { ok, status, ms, error };
  }

  stats(id) {
    const arr = this.history.get(id) || [];
    const n = arr.length;
    if (!n) return { uptimePct: null, checks: 0, avgMs: 0, last: null, up: false };
    const up = arr.filter((x) => x.ok).length;
    const avg = Math.round(arr.reduce((a, x) => a + x.ms, 0) / n);
    const last = arr[n - 1];
    return { uptimePct: Math.round((up / n) * 100), checks: n, avgMs: avg, last, up: !!last.ok };
  }

  getHistory(id) {
    return this.history.get(id) || [];
  }

  remove(id) {
    const t = this.timers.get(id);
    if (t) clearInterval(t);
    this.timers.delete(id);
    this.history.delete(id);
  }
}
