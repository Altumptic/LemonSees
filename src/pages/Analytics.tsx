import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarRange, Clock3, Flame, Server, Siren, Tags, Timer, Users } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { AuditEvent, Incident } from "@/lib/types";
import { SEVERITIES, STATUSES, auditActionGroup, countBy, eventsByDay, incidentsByDay, responseTimes, weekHourMatrix } from "@/lib/analytics";
import { EmptyState, GhostButton, Kpi, PageHeader, Panel, SectionHeader } from "@/components/ui";
import { Donut, Heatmap, LineChart, SERIES, SEV_COLOR, StackedBars } from "@/components/charts";
import { BarList } from "@/components/ui";
import { CalendarHeatmap, Funnel, Gauge, Sankey } from "@/components/charts2";
import { GitBranch, Filter, Gauge as GaugeIcon, CalendarDays } from "lucide-react";

const SEV_LABEL: Record<string, string> = { critical: "критичний", high: "високий", medium: "середній", low: "низький", info: "інфо" };
const STATUS_LABEL: Record<string, string> = { open: "відкрито", investigating: "розслідування", mitigated: "стримано", closed: "закрито" };
const STATUS_COLOR: Record<string, string> = { open: "var(--danger)", investigating: "var(--warning)", mitigated: "var(--info)", closed: "var(--success)" };
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export default function AnalyticsPage() {
  const { hosts } = useAppState();
  const { t, lang } = useI18n();
  const [range, setRange] = useState(14);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);

  useEffect(() => {
    api.listIncidents().then(setIncidents).catch(() => {});
    api.audit(2000).then((r) => setAudit(r.events)).catch(() => {});
  }, [hosts.length]);

  const from = Date.now() - range * 86400000;
  const inRange = useMemo(() => incidents.filter((i) => i.createdAt >= from), [incidents, from]);
  const auditRange = useMemo(() => audit.filter((e) => e.at >= from), [audit, from]);
  const byDay = useMemo(() => incidentsByDay(incidents, range, lang), [incidents, range, lang]);
  const ev = useMemo(() => eventsByDay(audit, range, lang), [audit, range, lang]);
  const heat = useMemo(() => weekHourMatrix([...auditRange, ...inRange.map((i) => ({ at: i.createdAt }))]), [auditRange, inRange]);
  const rt = useMemo(() => responseTimes(inRange), [inRange]);
  const hostName = (id: string) => hosts.find((h) => h.id === id)?.name ?? id ?? "—";
  const byHost = countBy(inRange, (i) => hostName(i.hostId)).slice(0, 8);
  const byCat = countBy(inRange, (i) => i.category).slice(0, 8);
  const byAction = countBy(auditRange, auditActionGroup).slice(0, 8);
  const byAnalyst = countBy(inRange, (i) => i.assignee).slice(0, 6);
  // Потік: категорія → серйозність → статус
  const flow = useMemo(() => {
    const cats = countBy(inRange, (i) => i.category).slice(0, 6).map((c) => c.key);
    const catOf = (c: string) => (cats.includes(c || "—") ? c || "—" : t("інше"));
    const sevs = SEVERITIES.filter((s) => inRange.some((i) => i.severity === s)).map((s) => t(SEV_LABEL[s]));
    const sts = STATUSES.filter((s) => inRange.some((i) => i.status === s)).map((s) => t(STATUS_LABEL[s]));
    const links = new Map<string, number>();
    const add = (a: string, b: string) => links.set(`${a}\u0000${b}`, (links.get(`${a}\u0000${b}`) ?? 0) + 1);
    for (const i of inRange) {
      add(catOf(i.category), t(SEV_LABEL[i.severity]));
      add(t(SEV_LABEL[i.severity]), t(STATUS_LABEL[i.status]));
    }
    const col0 = [...new Set(inRange.map((i) => catOf(i.category)))];
    return {
      columns: [col0, sevs, sts],
      links: [...links.entries()].map(([k, value]) => {
        const [from, to] = k.split("\u0000");
        return { from, to, value };
      }),
    };
  }, [inRange, t]);
  const acked = inRange.filter((i) => i.timeline.length > 1);
  const slaOk = acked.filter((i) => i.timeline[1].at - i.createdAt <= 60 * 60000).length;
  const sla = inRange.length ? (slaOk / inRange.length) * 100 : 0;
  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    const key = (ts: number) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    for (const i of incidents) m.set(key(i.createdAt), (m.get(key(i.createdAt)) ?? 0) + 1);
    for (const e of audit) m.set(key(e.at), (m.get(key(e.at)) ?? 0) + 1);
    return m;
  }, [incidents, audit]);

  const critShare = inRange.length ? Math.round((inRange.filter((i) => i.severity === "critical" || i.severity === "high").length / inRange.length) * 100) : 0;

  if (incidents.length === 0 && audit.length === 0)
    return (
      <>
        <Header t={t} range={range} setRange={setRange} />
        <EmptyState icon={Activity} title={t("Ще немає даних для аналітики")} hint={t("Аналітика будується з інцидентів і журналу дій. Додай хости або увімкни демо-режим.")} />
      </>
    );

  return (
    <>
      <Header t={t} range={range} setRange={setRange} />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
          <Kpi label={t("Тривоги")} value={inRange.length} icon={Siren} tone="info" trend={byDay.map((d) => d.values.reduce((a, b) => a + b, 0))} />
          <Kpi label={t("Критичні/високі")} value={`${critShare}%`} icon={Flame} tone={critShare > 30 ? "critical" : "warning"} />
          <Kpi label={t("Події журналу")} value={auditRange.length} icon={Activity} tone="neutral" trend={ev.data} />
          <Kpi label="MTTA" value={rt.mttaMinutes ? `${Math.round(rt.mttaMinutes)} ${t("хв")}` : "—"} sub={t("до першої реакції")} icon={Clock3} tone="neutral" />
          <Kpi label="MTTR" value={rt.mttrHours ? `${rt.mttrHours.toFixed(1)} ${t("год")}` : "—"} sub={t("до стримування")} icon={Timer} tone="neutral" />
          <Kpi label={t("Хостів уражено")} value={new Set(inRange.map((i) => i.hostId)).size} sub={`${t("з")} ${hosts.length}`} icon={Server} tone="neutral" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <SectionHeader icon={Siren} title={t("Обсяг тривог")} sub={t("Нові інциденти по днях за серйозністю")} />
            <StackedBars data={byDay} keys={SEVERITIES.map((s) => ({ name: t(SEV_LABEL[s]), color: SEV_COLOR[s] }))} height={260} />
          </Panel>
          <Panel>
            <SectionHeader icon={Tags} title={t("Статуси")} sub={t("Воронка обробки")} />
            <Donut items={STATUSES.map((s) => ({ label: t(STATUS_LABEL[s]), value: inRange.filter((i) => i.status === s).length, color: STATUS_COLOR[s] }))} sub={t("інцидентів")} />
          </Panel>

          <Panel className="xl:col-span-2">
            <SectionHeader icon={GitBranch} title={t("Потік інцидентів")} sub={t("Категорія → серйозність → статус. Наведи на вузол, щоб підсвітити шлях.")} />
            {inRange.length ? <Sankey columns={flow.columns} links={flow.links} height={300} colorOf={(n, c) => (c === 1 ? SEV_COLOR[SEVERITIES.find((s) => t(SEV_LABEL[s]) === n) ?? "info"] : c === 2 ? STATUS_COLOR[STATUSES.find((s) => t(STATUS_LABEL[s]) === n) ?? "open"] : SERIES[flow.columns[0].indexOf(n) % SERIES.length])} /> : <Quiet t={t} />}
          </Panel>
          <Panel>
            <SectionHeader icon={GaugeIcon} title={t("SLA реакції")} sub={t("Взято в роботу ≤ 60 хв")} />
            <div className="py-3">
              <Gauge value={sla} color={sla >= 90 ? "var(--success)" : sla >= 70 ? "var(--warning)" : "var(--danger)"} label={`${slaOk} / ${inRange.length}`} sub={t("інцидентів у межах SLA")} />
            </div>
            <div className="mt-4 border-t border-[var(--hairline)] pt-4">
              <SectionHeader icon={Filter} title={t("Воронка обробки")} />
              <Funnel
                steps={[
                  { label: t("Тривоги"), value: inRange.length },
                  { label: t("Взято в роботу"), value: acked.length },
                  { label: t("Стримано"), value: inRange.filter((i) => i.status === "mitigated" || i.status === "closed").length },
                  { label: t("Закрито"), value: inRange.filter((i) => i.status === "closed").length },
                ]}
              />
            </div>
          </Panel>

          <Panel className="xl:col-span-2">
            <SectionHeader icon={CalendarRange} title={t("Теплова карта активності")} sub={t("День тижня × година — тривоги та дії аналітиків")} />
            <Heatmap rows={DAYS.map(t)} cols={Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"))} values={heat} colEvery={3} />
          </Panel>
          <Panel>
            <SectionHeader icon={Server} title={t("Найуражаніші хости")} />
            {byHost.length ? <BarList items={byHost.map((h) => ({ label: h.key, value: h.count }))} /> : <Quiet t={t} />}
          </Panel>

          <Panel className="xl:col-span-2">
            <SectionHeader icon={Activity} title={t("Події журналу")} sub={t("Дії аналітиків і системи по днях")} />
            <LineChart series={[{ name: t("Події"), data: ev.data, color: SERIES[1] }]} labels={ev.labels} height={220} />
          </Panel>
          <Panel>
            <SectionHeader icon={Tags} title={t("Категорії")} />
            {byCat.length ? <Donut size={150} thickness={20} items={byCat.map((c, i) => ({ label: c.key, value: c.count, color: SERIES[i % SERIES.length] }))} sub={t("інцидентів")} /> : <Quiet t={t} />}
          </Panel>

          <Panel>
            <SectionHeader icon={Activity} title={t("Типи дій")} />
            {byAction.length ? <BarList items={byAction.map((a, i) => ({ label: a.key, value: a.count, color: SERIES[i % SERIES.length] }))} /> : <Quiet t={t} />}
          </Panel>
          <Panel>
            <SectionHeader icon={Users} title={t("Навантаження аналітиків")} />
            {byAnalyst.length ? <BarList items={byAnalyst.map((a) => ({ label: a.key, value: a.count, color: "var(--c2)" }))} /> : <Quiet t={t} />}
          </Panel>
          <Panel className="xl:col-span-3">
            <SectionHeader icon={CalendarDays} title={t("Календар активності")} sub={t("Інциденти та дії за 20 тижнів")} />
            <CalendarHeatmap counts={perDay} weeks={26} lang={lang} />
          </Panel>

          <Panel>
            <SectionHeader icon={Flame} title={t("Серйозність")} />
            <Donut size={150} thickness={20} items={SEVERITIES.map((s) => ({ label: t(SEV_LABEL[s]), value: inRange.filter((i) => i.severity === s).length, color: SEV_COLOR[s] }))} sub={t("інцидентів")} />
          </Panel>
        </div>
      </div>
    </>
  );
}

function Header({ t, range, setRange }: { t: (s: string) => string; range: number; setRange: (n: number) => void }) {
  return (
    <PageHeader
      eyebrow={t("SIEM · Аналітика")}
      title={t("SOC-аналітика")}
      lede={t("Тренди тривог, швидкість реакції, ураженість хостів і навантаження команди — за обраний період.")}
      action={[7, 14, 30].map((d) => (
        <GhostButton key={d} active={range === d} onClick={() => setRange(d)}>
          {d} {t("днів")}
        </GhostButton>
      ))}
    />
  );
}

const Quiet = ({ t }: { t: (s: string) => string }) => <div className="py-8 text-center text-[14px] text-muted-foreground">{t("Поки тихо.")}</div>;
