import { useEffect, useState } from "react";
import { Clock, Cog, Zap, Terminal as TermIcon } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { PersistenceReport } from "@/lib/types";
import { PageHeader, HostBar, Panel, Kpi, SectionHeader, EmptyState, Tag } from "@/components/ui";

export default function PersistencePage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostId, setHostId] = useState<string | null>(null);
  const [data, setData] = useState<PersistenceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const active = hostId ?? hosts.find((h) => h.status === "online")?.id ?? hosts[0]?.id ?? null;
  const scan = (id: string) => {
    setLoading(true);
    setErr("");
    api.persistence(id).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => {
    if (active) scan(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (hosts.length === 0) return <EmptyState icon={Cog} title={t("Немає хостів")} hint={t("Додай сервер для аналізу персистентності.")} />;

  return (
    <>
      <PageHeader eyebrow="EDR" title={t("Персистентність")} lede={t("Механізми автозапуску: cron, служби, таймери та стартові скрипти.")} />
      <HostBar hosts={hosts} value={active} onChange={setHostId} onRefresh={() => active && scan(active)} loading={loading} />
      {err ? (
        <Panel><div className="mono py-10 text-center text-sm text-[var(--danger)]">{err}</div></Panel>
      ) : loading && !data ? (
        <Panel><div className="py-14 text-center text-sm text-muted-foreground">{t("Аналізую механізми автозапуску…")}</div></Panel>
      ) : data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label={t("Cron-завдання")} value={data.counts.cron} icon={Clock} tone={data.counts.cron > 0 ? "info" : "neutral"} />
            <Kpi label={t("Служби (running)")} value={data.counts.running} icon={Cog} tone="neutral" />
            <Kpi label={t("В автозапуску")} value={data.counts.enabled} icon={Zap} tone="neutral" />
            <Kpi label={t("Таймери")} value={data.counts.timers} icon={Clock} tone="neutral" />
          </div>

          <Panel>
            <SectionHeader icon={Clock} title={t("Cron-завдання")} sub={t("Заплановані команди — часте місце персистентності")} />
            {data.cron.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">{t("Cron-завдань не знайдено")}</div>
            ) : (
              <div className="space-y-1">
                {data.cron.map((c, i) => (
                  <div key={i} className="mono flex items-start gap-2 rounded-md border border-[var(--hairline)] px-3 py-1.5 text-[11.5px]">
                    <Tag>{c.source}</Tag>
                    <span className="min-w-0 flex-1 truncate text-foreground/85" title={c.entry}>{c.entry}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel>
              <SectionHeader icon={Cog} title={t("Активні служби")} right={<span className="mono text-[10px] text-muted-foreground">{data.running.length}</span>} />
              <div className="flex flex-wrap gap-1.5">
                {data.running.map((s) => <Tag key={s}>{s.replace(".service", "")}</Tag>)}
              </div>
            </Panel>
            <Panel>
              <SectionHeader icon={Zap} title={t("У автозапуску (enabled)")} right={<span className="mono text-[10px] text-muted-foreground">{data.enabled.length}</span>} />
              <div className="flex flex-wrap gap-1.5">
                {data.enabled.map((s) => <Tag key={s}>{s.replace(".service", "")}</Tag>)}
              </div>
            </Panel>
          </div>

          {data.startup.length > 0 && (
            <Panel>
              <SectionHeader icon={TermIcon} title={t("Стартові скрипти")} />
              <ul className="mono space-y-1 text-[11.5px] text-muted-foreground">
                {data.startup.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </Panel>
          )}
        </div>
      ) : null}
    </>
  );
}
