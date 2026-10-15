import { useEffect, useMemo, useState } from "react";
import { ScrollText, Download, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtWhen, type AuditEvent } from "@/lib/types";
import { PageHeader, Panel, GhostButton, Tag, EmptyState, SectionHeader } from "@/components/ui";
import { Donut, LineChart, SERIES } from "@/components/charts";
import { auditActionGroup, countBy, eventsByDay } from "@/lib/analytics";

function actionTone(action: string): string {
  if (/\.remove|\.delete/.test(action)) return "var(--danger)";
  if (/\.add|\.create/.test(action)) return "var(--success)";
  if (/container\.(stop|restart)/.test(action)) return "var(--warning)";
  if (/attest|compliance/.test(action)) return "var(--info)";
  return "var(--muted-foreground)";
}

export default function AuditPage() {
  const { t, lang } = useI18n();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    api.audit(1000).then((r) => setEvents(r.events)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => {
    refresh();
  }, []);

  const rows = useMemo(() => {
    if (!q.trim()) return events;
    const n = q.toLowerCase();
    return events.filter((e) => e.action.toLowerCase().includes(n) || String(e.target).toLowerCase().includes(n) || JSON.stringify(e.meta).toLowerCase().includes(n));
  }, [events, q]);

  const daily = useMemo(() => eventsByDay(events, 14, lang), [events, lang]);
  const groups = useMemo(() => countBy(events, auditActionGroup).slice(0, 6), [events]);

  const exportCsv = () => {
    const header = "timestamp,actor,action,target,meta\n";
    const body = events
      .map((e) => [new Date(e.at).toISOString(), e.actor, e.action, e.target, JSON.stringify(e.meta).replace(/"/g, "'")].map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lemonsees-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader
        eyebrow={t("GRC · Докази")}
        title={t("Аудит")}
        lede={t("Незмінний журнал дій у застосунку — докази для аудиту та розслідувань.")}
        action={
          <div className="flex items-center gap-2">
            <GhostButton onClick={refresh} disabled={loading}><RefreshCw className="h-3 w-3" /> {t("Оновити")}</GhostButton>
            <GhostButton onClick={exportCsv}><Download className="h-3 w-3" /> {t("Експорт CSV")}</GhostButton>
          </div>
        }
      />

      {events.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <SectionHeader icon={ScrollText} title={t("Активність за 14 днів")} />
            <LineChart series={[{ name: t("Події"), data: daily.data, color: "var(--c2)" }]} labels={daily.labels} height={200} />
          </Panel>
          <Panel>
            <SectionHeader icon={ScrollText} title={t("Типи дій")} />
            <Donut size={140} thickness={18} items={groups.map((g, i) => ({ label: g.key, value: g.count, color: SERIES[i % SERIES.length] }))} sub={t("подій")} />
          </Panel>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <div className="relative min-w-[240px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Пошук за дією, ціллю…")} className="mono w-full rounded-md border border-[var(--hairline)] bg-transparent py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[var(--hairline-strong)]" />
        </div>
        <span className="ml-auto text-[12px] text-muted-foreground font-medium">{rows.length} {t("подій")}</span>
      </div>

      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={ScrollText} title={t("Журнал порожній")} hint={t("Дії (додавання хостів, керування контейнерами, атестації) зʼявлятимуться тут.")} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
            <div className="grid grid-cols-12 gap-3 border-b border-[var(--hairline)] bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)] px-4 py-2.5 text-[12px] text-muted-foreground font-medium">
              <div className="col-span-2">{t("Час")}</div>
              <div className="col-span-2">{t("Актор")}</div>
              <div className="col-span-3">{t("Дія")}</div>
              <div className="col-span-5">{t("Ціль / деталі")}</div>
            </div>
            {rows.map((e, i) => (
              <div key={i} className="mono grid grid-cols-12 items-center gap-3 border-b border-[var(--hairline)] px-4 py-2 text-[13.5px] last:border-0 hover:bg-[color-mix(in_oklab,var(--foreground)_2%,transparent)]">
                <div className="col-span-2 text-muted-foreground" title={new Date(e.at).toLocaleString()}>{fmtWhen(e.at)}</div>
                <div className="col-span-2">{e.actor}</div>
                <div className="col-span-3"><span style={{ color: actionTone(e.action) }}>{e.action}</span></div>
                <div className="col-span-5 flex items-center gap-2 truncate text-foreground/80">
                  <span className="truncate">{e.target}</span>
                  {e.meta && Object.keys(e.meta).length > 0 && <Tag>{Object.entries(e.meta).map(([k, v]) => `${k}=${v}`).join(" ")}</Tag>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
