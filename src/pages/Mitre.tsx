import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Grid3x3, Layers, Target } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtWhen, type Incident } from "@/lib/types";
import { mitreCoverage, techniqueOf } from "@/lib/analytics";
import { Drawer, EmptyState, Kpi, PageHeader, Panel, SectionHeader, SeverityBadge, IncidentStatusBadge } from "@/components/ui";
import { Radar } from "@/components/charts";

export default function MitrePage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    api.listIncidents().then(setIncidents).catch(() => {});
  }, [hosts.length]);

  const cov = useMemo(() => mitreCoverage(incidents), [incidents]);
  const max = Math.max(1, ...cov.tactics.flatMap((x) => x.techniques.map((y) => y.count)));
  const active = cov.tactics.filter((x) => x.count > 0);
  const techCount = new Set(cov.tactics.flatMap((x) => x.techniques.map((y) => y.t.id))).size;
  const related = focus ? incidents.filter((i) => techniqueOf(i)?.id === focus) : [];
  const focusTech = cov.catalog.find((x) => x.id === focus);

  return (
    <>
      <PageHeader
        eyebrow={t("CTI · Фреймворк")}
        title="MITRE ATT&CK"
        lede={t("Інциденти автоматично зіставляються з тактиками й техніками ATT&CK. Видно, на яких етапах атаки зосереджена активність.")}
      />
      {incidents.length === 0 ? (
        <EmptyState icon={Grid3x3} title={t("Немає інцидентів для зіставлення")} hint={t("Щойно зʼявляться інциденти, матриця заповниться автоматично.")} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label={t("Зіставлено інцидентів")} value={`${cov.mapped}/${incidents.length}`} icon={Target} tone="info" />
            <Kpi label={t("Активних тактик")} value={`${active.length}/${cov.tactics.length}`} icon={Layers} tone={active.length > 5 ? "warning" : "neutral"} />
            <Kpi label={t("Технік")} value={techCount} icon={Grid3x3} tone="neutral" />
            <Kpi label={t("Найчастіша тактика")} value={<span className="text-[24px]">{[...active].sort((a, b) => b.count - a.count)[0]?.name ?? "—"}</span>} icon={Target} tone="critical" />
          </div>

          <Panel>
            <SectionHeader icon={Grid3x3} title={t("Матриця")} sub={t("Колір клітинки — кількість інцидентів. Натисни техніку, щоб побачити повʼязані інциденти.")} />
            <div className="overflow-x-auto pb-2">
              <div className="grid min-w-[1560px] gap-2" style={{ gridTemplateColumns: `repeat(${cov.tactics.length}, minmax(0,1fr))` }}>
                {cov.tactics.map((tac) => (
                  <div key={tac.id} className="flex flex-col gap-1.5">
                    <div className={`rounded-xl px-2.5 py-2.5 ${tac.count ? "bg-[var(--fg-display)] text-[var(--background)]" : "bg-[var(--surface-raised)] text-muted-foreground"}`}>
                      <div className="text-[12.5px] font-semibold leading-tight">{tac.name}</div>
                      <div className="mt-1 flex items-center justify-between text-[11px] opacity-75">
                        <span className="mono">{tac.id}</span>
                        <span className="num">{tac.count}</span>
                      </div>
                    </div>
                    {cov.catalog
                      .filter((tech) => tech.tactic === tac.id)
                      .map((tech) => {
                        const hit = tac.techniques.find((x) => x.t.id === tech.id)?.count ?? 0;
                        const a = hit ? 18 + (hit / max) * 70 : 0;
                        return (
                          <button
                            key={tech.id}
                            onClick={() => hit && setFocus(tech.id)}
                            className={`rounded-lg border px-2 py-2 text-left transition-transform ${hit ? "border-transparent hover:-translate-y-0.5" : "border-[var(--hairline)] opacity-70"}`}
                            style={{ background: hit ? `color-mix(in oklab, var(--primary) ${a}%, var(--surface))` : "var(--surface)" }}
                          >
                            <div className={`text-[12px] leading-snug ${hit && a > 50 ? "text-white" : ""}`}>{tech.name}</div>
                            <div className={`mono mt-1 flex justify-between text-[10.5px] ${hit && a > 50 ? "text-white/80" : "text-muted-foreground"}`}>
                              <span>{tech.id}</span>
                              {hit > 0 && <span className="num">×{hit}</span>}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel>
              <SectionHeader icon={Layers} title={t("Профіль атак")} sub={t("Відносна активність за тактиками")} />
              <Radar items={cov.tactics.map((x) => ({ label: x.name, value: active.length ? (x.count / Math.max(...active.map((a) => a.count))) * 100 : 0 }))} size={340} />
            </Panel>
            <Panel>
              <SectionHeader icon={Target} title={t("Топ технік")} />
              <ul className="divide-y divide-[var(--hairline)]">
                {cov.tactics
                  .flatMap((x) => x.techniques.map((y) => ({ ...y, tactic: x.name })))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 8)
                  .map((x) => (
                    <li key={x.t.id}>
                      <button onClick={() => setFocus(x.t.id)} className="flex w-full items-center gap-3 py-3 text-left hover:opacity-80">
                        <span className="mono w-14 shrink-0 text-[12.5px] text-[var(--primary)]">{x.t.id}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-medium">{x.t.name}</span>
                          <span className="block text-[12.5px] text-muted-foreground">{x.tactic}</span>
                        </span>
                        <span className="doto text-[22px]">{x.count}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}

      {focus && focusTech && (
        <Drawer title={`${focusTech.id} · ${focusTech.name}`} onClose={() => setFocus(null)}>
          <a
            href={`https://attack.mitre.org/techniques/${focusTech.id}/`}
            target="_blank"
            rel="noreferrer"
            className="mb-5 inline-flex items-center gap-1.5 text-[14px] text-[var(--primary)] hover:underline"
          >
            {t("Опис техніки на attack.mitre.org")} <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <ul className="space-y-3">
            {related.map((i) => (
              <li key={i.id} className="rounded-xl border border-[var(--hairline)] p-3.5">
                <div className="text-[14.5px] font-medium">{i.title}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                  <SeverityBadge level={i.severity} />
                  <IncidentStatusBadge status={i.status} />
                  <span>{fmtWhen(i.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Drawer>
      )}
    </>
  );
}
