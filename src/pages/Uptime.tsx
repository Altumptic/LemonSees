import { useEffect, useMemo, useState } from "react";
import { useIntent } from "@/lib/intent";
import { Globe, Plus, Trash2, RefreshCw, Activity, Gauge, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtWhen, type Monitor, type MonitorInput, type MonitorCheck, type MonitorStats } from "@/lib/types";
import {
  PageHeader,
  Panel,
  PrimaryButton,
  GhostButton,
  IconBtn,
  Modal,
  TextInput,
  Kpi,
  AreaChart,
  StatusBars,
  EmptyState,
  Drawer,
} from "@/components/ui";

const EMPTY: MonitorInput = { name: "", url: "", method: "GET", expectStatus: 0, intervalSec: 60, timeoutMs: 10000, enabled: true };

function upColor(up: boolean | undefined, has: boolean) {
  if (!has) return "var(--muted-foreground)";
  return up ? "var(--success)" : "var(--danger)";
}

export default function UptimePage() {
  const { t } = useI18n();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [form, setForm] = useState<MonitorInput | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  useIntent("new", () => {
    setEditId(null);
    setForm(EMPTY);
  });

  const refresh = () => api.listMonitors().then(setMonitors).catch(() => {});
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, []);

  const agg = useMemo(() => {
    const withStats = monitors.filter((m) => m.stats && m.stats.checks > 0);
    const up = withStats.filter((m) => m.stats!.up).length;
    const down = withStats.filter((m) => !m.stats!.up).length;
    const avgUp = withStats.length ? Math.round(withStats.reduce((a, m) => a + (m.stats!.uptimePct ?? 0), 0) / withStats.length) : null;
    const avgMs = withStats.length ? Math.round(withStats.reduce((a, m) => a + m.stats!.avgMs, 0) / withStats.length) : 0;
    return { total: monitors.length, up, down, avgUp, avgMs };
  }, [monitors]);

  return (
    <>
      <PageHeader
        eyebrow={t("Аптайм · Сайти")}
        title={t("Моніторинг сайтів")}
        lede={t("HTTP-перевірки сайтів і ендпоінтів з двигуна: доступність, затримка, історія збоїв.")}
        action={<PrimaryButton onClick={() => { setEditId(null); setForm(EMPTY); }}><Plus className="h-3 w-3" /> {t("Додати монітор")}</PrimaryButton>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label={t("Моніторів")} value={agg.total} icon={Globe} tone="neutral" />
        <Kpi label={t("Онлайн")} value={agg.up} icon={CheckCircle2} tone={agg.down === 0 ? "ok" : "neutral"} />
        <Kpi label={t("Офлайн")} value={agg.down} icon={Activity} tone={agg.down > 0 ? "critical" : "ok"} />
        <Kpi label={t("Середній аптайм")} value={agg.avgUp === null ? "—" : `${agg.avgUp}%`} icon={Gauge} tone={agg.avgUp === null ? "neutral" : agg.avgUp >= 99 ? "ok" : agg.avgUp >= 95 ? "warning" : "critical"} sub={`~${agg.avgMs} ms`} />
      </div>

      {monitors.length === 0 ? (
        <EmptyState icon={Globe} title={t("Немає моніторів")} hint={t("Додай URL сайту чи API — і LemonSees почне перевіряти його доступність.")} action={<PrimaryButton onClick={() => { setEditId(null); setForm(EMPTY); }}>{t("Додати монітор")}</PrimaryButton>} />
      ) : (
        <div className="space-y-3">
          {monitors.map((m) => {
            const s = m.stats;
            const has = !!(s && s.checks > 0);
            return (
              <Panel key={m.id} className="!p-0">
                <div className="flex flex-wrap items-center gap-4 p-4">
                  <button onClick={() => setView(m.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--hairline)]">
                      <span className={`h-2.5 w-2.5 rounded-full ${has && s!.up ? "live-dot" : ""}`} style={{ background: upColor(s?.up, has) }} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-semibold">{m.name}</div>
                      <div className="mono truncate text-[12.5px] text-muted-foreground">{m.url}</div>
                    </div>
                  </button>

                  <div className="hidden w-28 shrink-0 md:block">
                    <div className="mb-1 text-[12px] text-muted-foreground font-medium">{t("аптайм")}</div>
                    <div className="doto text-lg leading-none" style={{ color: has ? (s!.uptimePct! >= 99 ? "var(--success)" : s!.uptimePct! >= 95 ? "var(--warning)" : "var(--danger)") : "var(--muted-foreground)" }}>
                      {has ? `${s!.uptimePct}%` : "—"}
                    </div>
                  </div>
                  <div className="hidden w-24 shrink-0 md:block">
                    <div className="mb-1 text-[12px] text-muted-foreground font-medium">{t("затримка")}</div>
                    <div className="num text-[14.5px]">{has ? `${s!.last?.ms ?? s!.avgMs} ms` : "—"}</div>
                  </div>
                  <div className="hidden w-40 shrink-0 lg:block">
                    <MiniTimeline id={m.id} />
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <IconBtn title={t("Редагувати")} onClick={() => { setEditId(m.id); setForm({ name: m.name, url: m.url, method: m.method, expectStatus: m.expectStatus, intervalSec: m.intervalSec, timeoutMs: m.timeoutMs, enabled: m.enabled }); }}>
                      <RefreshCw className="h-3 w-3" />
                    </IconBtn>
                    <IconBtn title={t("Видалити")} danger onClick={() => { if (confirm(t("Видалити монітор?"))) api.deleteMonitor(m.id).then(refresh); }}>
                      <Trash2 className="h-3 w-3" />
                    </IconBtn>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {form && <MonitorForm initial={form} editId={editId} onClose={(ch) => { setForm(null); setEditId(null); if (ch) refresh(); }} />}
      {view && <MonitorDrawer id={view} monitor={monitors.find((m) => m.id === view)} onClose={() => setView(null)} />}
    </>
  );
}

function MiniTimeline({ id }: { id: string }) {
  const [checks, setChecks] = useState<MonitorCheck[]>([]);
  useEffect(() => {
    api.monitorHistory(id).then((r) => setChecks(r.history.slice(-40))).catch(() => {});
  }, [id]);
  const bars = checks.length ? checks.map((c) => ({ ok: c.ok })) : Array.from({ length: 20 }, () => ({ ok: null as null }));
  return <StatusBars data={bars} height={28} />;
}

function MonitorDrawer({ id, monitor, onClose }: { id: string; monitor?: Monitor; onClose: () => void }) {
  const { t } = useI18n();
  const [history, setHistory] = useState<MonitorCheck[]>([]);
  const [stats, setStats] = useState<MonitorStats | null>(null);

  const load = () => api.monitorHistory(id).then((r) => { setHistory(r.history); setStats(r.stats); }).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const latency = history.slice(-60).map((c) => c.ms);
  const bars = history.slice(-60).map((c) => ({ ok: c.ok }));

  return (
    <Drawer title={monitor?.name ?? t("Монітор")} onClose={onClose}>
      <div className="mono mb-4 truncate text-[13.5px] text-muted-foreground">{monitor?.url}</div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-[var(--hairline)] p-3">
          <div className="text-[11px] text-muted-foreground font-medium">{t("аптайм")}</div>
          <div className="doto mt-1 text-xl leading-none">{stats?.uptimePct ?? "—"}%</div>
        </div>
        <div className="rounded-lg border border-[var(--hairline)] p-3">
          <div className="text-[11px] text-muted-foreground font-medium">{t("затримка")}</div>
          <div className="doto mt-1 text-xl leading-none">{stats?.avgMs ?? 0}</div>
        </div>
        <div className="rounded-lg border border-[var(--hairline)] p-3">
          <div className="text-[11px] text-muted-foreground font-medium">{t("перевірок")}</div>
          <div className="doto mt-1 text-xl leading-none">{stats?.checks ?? 0}</div>
        </div>
      </div>

      <div className="eyebrow mb-2">{t("Затримка (ms)")}</div>
      <div className="mb-4 rounded-lg border border-[var(--hairline)] p-3">
        <AreaChart data={latency} color="var(--interactive)" unit="ms" height={80} />
      </div>

      <div className="eyebrow mb-2">{t("Історія доступності")}</div>
      <div className="mb-4 rounded-lg border border-[var(--hairline)] p-3">
        <StatusBars data={bars.length ? bars : [{ ok: null }]} height={38} />
      </div>

      <div className="eyebrow mb-2">{t("Останні перевірки")}</div>
      <div className="space-y-1">
        {[...history].reverse().slice(0, 14).map((c, i) => (
          <div key={i} className="mono flex items-center justify-between gap-2 text-[12.5px]">
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.ok ? "var(--success)" : "var(--danger)" }} />
              {c.ok ? `HTTP ${c.status}` : c.error || `HTTP ${c.status}`}
            </span>
            <span className="text-muted-foreground">{c.ms} ms · {fmtWhen(c.at)}</span>
          </div>
        ))}
        {history.length === 0 && <div className="text-[13.5px] text-muted-foreground">{t("Ще немає перевірок…")}</div>}
      </div>
    </Drawer>
  );
}

function MonitorForm({ initial, editId, onClose }: { initial: MonitorInput; editId: string | null; onClose: (changed: boolean) => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<MonitorInput>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof MonitorInput>(k: K, v: MonitorInput[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      if (editId) await api.updateMonitor(editId, f);
      else await api.addMonitor(f);
      onClose(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editId ? t("Редагувати монітор") : t("Новий монітор")} onClose={() => onClose(false)}>
      <div className="grid gap-4">
        <TextInput label="URL" value={f.url} onChange={(v) => set("url", v)} placeholder="https://example.com/health" />
        <TextInput label={t("Назва")} value={f.name} onChange={(v) => set("name", v)} placeholder={t("автоматично з URL")} />
        <div className="grid grid-cols-3 gap-4">
          <label className="block">
            <div className="eyebrow mb-1">{t("Метод")}</div>
            <select value={f.method} onChange={(e) => set("method", e.target.value)} className="mono w-full rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[14.5px] outline-none focus:border-[var(--hairline-strong)]">
              {["GET", "HEAD", "POST"].map((m) => <option key={m} value={m} className="bg-[var(--surface)]">{m}</option>)}
            </select>
          </label>
          <TextInput label={t("Інтервал, с")} value={String(f.intervalSec)} onChange={(v) => set("intervalSec", parseInt(v, 10) || 60)} />
          <TextInput label={t("Код (0=будь-який)")} value={String(f.expectStatus)} onChange={(v) => set("expectStatus", parseInt(v, 10) || 0)} />
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--hairline)] pt-4">
          <GhostButton onClick={() => onClose(false)}>{t("Скасувати")}</GhostButton>
          <PrimaryButton onClick={submit} disabled={busy}>{editId ? t("Зберегти") : t("Додати")}</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
