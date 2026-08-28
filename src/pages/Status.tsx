import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Bell, Activity } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtWhen, type Monitor, type MonitorEvent } from "@/lib/types";
import { PageHeader, Panel, SectionHeader, StatusBars, EmptyState } from "@/components/ui";

export default function StatusPage() {
  const { t } = useI18n();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [tls, setTls] = useState<Record<string, { ok: boolean | null }[]>>({});

  const refresh = () => {
    api.listMonitors().then(setMonitors).catch(() => {});
    api.monitorEvents().then((r) => setEvents(r.events)).catch(() => {});
  };
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    monitors.forEach((m) => {
      api.monitorHistory(m.id).then((r) => setTls((p) => ({ ...p, [m.id]: r.history.slice(-50).map((c) => ({ ok: c.ok })) }))).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitors.length]);

  const state = useMemo(() => {
    const active = monitors.filter((m) => m.stats && m.stats.checks > 0);
    const down = active.filter((m) => !m.stats!.up);
    return { total: monitors.length, active: active.length, down: down.length, allUp: active.length > 0 && down.length === 0 };
  }, [monitors]);

  if (monitors.length === 0) {
    return <EmptyState icon={Activity} title={t("Немає моніторів")} hint={t("Додай монітор у розділі «Аптайм», щоб бачити статус-борд.")} />;
  }

  const banner = state.down > 0 ? "critical" : state.active === 0 ? "neutral" : "ok";
  const bannerColor = banner === "critical" ? "var(--danger)" : banner === "ok" ? "var(--success)" : "var(--muted-foreground)";

  return (
    <>
      <PageHeader eyebrow="UPTIME" title={t("Статус-борд")} lede={t("Публічний стан сервісів, аптайм і сповіщення про даунтайм.")} />
      <div className="space-y-6">
      {/* Загальний статус-банер */}
      <div className="rounded-xl border p-6" style={{ borderColor: `color-mix(in oklab, ${bannerColor} 40%, transparent)`, background: `color-mix(in oklab, ${bannerColor} 8%, transparent)` }}>
        <div className="flex items-center gap-4">
          {banner === "ok" ? <CheckCircle2 className="h-8 w-8" style={{ color: bannerColor }} /> : <AlertTriangle className="h-8 w-8" style={{ color: bannerColor }} />}
          <div>
            <div className="doto text-[28px] leading-none" style={{ color: bannerColor }}>
              {state.down > 0 ? t("Є недоступні сервіси") : state.active === 0 ? t("Очікую перші перевірки") : t("Усі системи в нормі")}
            </div>
            <div className="mono mt-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {state.active - state.down}/{state.total} {t("онлайн")} · {state.down} {t("офлайн")}
            </div>
          </div>
        </div>
      </div>

      {/* Борд моніторів */}
      <Panel>
        <SectionHeader icon={Activity} title={t("Сервіси")} />
        <div className="divide-y divide-[var(--hairline)]">
          {monitors.map((m) => {
            const s = m.stats;
            const has = !!(s && s.checks > 0);
            const color = !has ? "var(--muted-foreground)" : s!.up ? "var(--success)" : "var(--danger)";
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-4 py-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${has && s!.up ? "live-dot" : ""}`} style={{ background: color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.name}</div>
                  <div className="mono truncate text-[11px] text-muted-foreground">{m.url}</div>
                </div>
                <div className="hidden w-40 shrink-0 sm:block">
                  <StatusBars data={tls[m.id]?.length ? tls[m.id] : [{ ok: null }]} height={26} />
                </div>
                <div className="w-16 shrink-0 text-right">
                  <div className="doto text-base leading-none" style={{ color }}>{has ? `${s!.uptimePct}%` : "—"}</div>
                  <div className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{has ? t(s!.up ? "онлайн" : "офлайн") : "—"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Стрічка даунтайм-подій */}
      <Panel>
        <SectionHeader icon={Bell} title={t("Сповіщення про даунтайм")} sub={t("Переходи стану сервісів (desktop-сповіщення надсилаються)")} />
        {events.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t("Змін стану ще не було.")}</div>
        ) : (
          <ul className="space-y-2">
            {events.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] pb-2 text-[12.5px] last:border-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.ok ? "var(--success)" : "var(--danger)" }} />
                  <span className="truncate font-medium">{e.name}</span>
                  <span className="mono shrink-0 text-[11px]" style={{ color: e.ok ? "var(--success)" : "var(--danger)" }}>
                    {e.ok ? t("відновився") : t("недоступний")}
                  </span>
                </span>
                <span className="mono shrink-0 text-[11px] text-muted-foreground">
                  {e.ok ? `HTTP ${e.status} · ${e.ms}ms` : e.error || `HTTP ${e.status}`} · {fmtWhen(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      </div>
    </>
  );
}
