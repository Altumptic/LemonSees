import { useEffect, useMemo, useState } from "react";
import { Radar as RadarIcon, RefreshCw, Shield, Siren, Server, Plug, Activity } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtWhen, type WazuhData } from "@/lib/types";
import { countBy } from "@/lib/analytics";
import { BarList, EmptyState, GhostButton, Kpi, PageHeader, Panel, Pill, PrimaryButton, SectionHeader, SeverityBadge } from "@/components/ui";
import { Donut, StackedBars, SEV_COLOR } from "@/components/charts";
import { Treemap } from "@/components/charts2";
import type { Nav } from "@/nav";

const SEVS = ["critical", "high", "medium", "low", "info"] as const;
const SEV_TXT: Record<string, string> = { critical: "критичний", high: "високий", medium: "середній", low: "низький", info: "інфо" };

export default function WazuhPage({ go }: { go: Nav }) {
  const { demo } = useAppState();
  const { t } = useI18n();
  const [data, setData] = useState<WazuhData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.wazuh().then(setData).catch(() => setData({ connected: false, agents: [], alerts: [] }));
  useEffect(() => {
    load();
  }, [demo]);

  const refresh = async () => {
    setBusy(true);
    await api.wazuhRefresh().catch(() => {});
    await load();
    setBusy(false);
  };

  const alerts = data?.alerts ?? [];
  const agents = data?.agents ?? [];
  const hourly = useMemo(() => {
    const now = Date.now();
    return Array.from({ length: 24 }, (_, i) => {
      const from = now - (24 - i) * 3600000;
      const slice = alerts.filter((a) => a.at >= from && a.at < from + 3600000);
      return { label: new Date(from + 3600000).toLocaleTimeString([], { hour: "2-digit" }), values: SEVS.map((s) => slice.filter((a) => a.severity === s).length) };
    });
  }, [alerts]);

  if (data && !data.connected)
    return (
      <>
        <Header t={t} />
        <EmptyState
          icon={Plug}
          title={t("Wazuh не підключено")}
          hint={t("LemonSees працює і без Wazuh. Якщо він у тебе вже є — підключи API менеджера й індексер, і тут зʼявляться його агенти й тривоги поруч із даними LemonSees.")}
          action={
            <PrimaryButton onClick={() => go("system/integrations?new")}>
              <Plug className="h-4 w-4" /> {t("Підключити Wazuh")}
            </PrimaryButton>
          }
        />
      </>
    );

  return (
    <>
      <Header
        t={t}
        action={
          <GhostButton onClick={refresh} disabled={busy}>
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> {t("Оновити")}
          </GhostButton>
        }
      />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label={t("Агенти Wazuh")} value={agents.length} icon={Server} tone="neutral" sub={`${agents.filter((a) => a.status === "active").length} ${t("активних")}`} />
          <Kpi label={t("Тривоги, 24 год")} value={alerts.length} icon={Siren} tone={alerts.length ? "warning" : "ok"} trend={hourly.map((h) => h.values.reduce((a, b) => a + b, 0))} />
          <Kpi label={t("Рівень ≥ 12")} value={alerts.filter((a) => a.level >= 12).length} icon={Shield} tone="critical" sub={t("стають інцидентами")} />
          <Kpi label={t("Техніки MITRE")} value={new Set(alerts.flatMap((a) => a.mitre)).size} icon={RadarIcon} tone="info" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <SectionHeader icon={Activity} title={t("Тривоги Wazuh по годинах")} />
            <StackedBars data={hourly} keys={SEVS.map((s) => ({ name: t(SEV_TXT[s]), color: SEV_COLOR[s] }))} height={220} />
          </Panel>
          <Panel>
            <SectionHeader icon={Server} title={t("Стан агентів")} />
            <Donut
              size={150}
              thickness={20}
              items={countBy(agents, (a) => a.status).map((s) => ({ label: s.key, value: s.count, color: s.key === "active" ? "var(--success)" : s.key === "disconnected" ? "var(--danger)" : "var(--warning)" }))}
              sub={t("агентів")}
            />
          </Panel>
          <Panel className="xl:col-span-2">
            <SectionHeader icon={RadarIcon} title={t("Найчастіші правила")} />
            <Treemap items={countBy(alerts, (a) => a.rule).slice(0, 10).map((r) => ({ label: r.key, value: r.count }))} height={230} />
          </Panel>
          <Panel>
            <SectionHeader icon={Shield} title={t("Тактики MITRE")} />
            <BarList items={countBy(alerts.flatMap((a) => a.tactic.map((x) => ({ x }))), (o) => o.x).slice(0, 7).map((x) => ({ label: x.key, value: x.count }))} />
          </Panel>
        </div>

        <Panel>
          <SectionHeader icon={Server} title={t("Агенти")} sub={t("З API менеджера Wazuh")} />
          <div className="overflow-x-auto">
            <table className="data-table w-full text-left text-[14px]">
              <thead>
                <tr className="border-b border-[var(--hairline)] text-[12.5px] text-muted-foreground">
                  {["ID", t("Імʼя"), "IP", t("ОС"), t("Версія"), t("Група"), t("Стан")].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={`${a.source}-${a.id}`} className="border-b border-[var(--hairline)] last:border-0">
                    <td className="mono px-3 py-2.5 text-[13px]">{a.id}</td>
                    <td className="px-3 py-2.5 font-medium">{a.name}</td>
                    <td className="mono px-3 py-2.5 text-[13px]">{a.ip}</td>
                    <td className="px-3 py-2.5 text-[13px] text-muted-foreground">{a.os}</td>
                    <td className="mono px-3 py-2.5 text-[13px] text-muted-foreground">{a.version}</td>
                    <td className="px-3 py-2.5 text-[13px] text-muted-foreground">{a.group}</td>
                    <td className="px-3 py-2.5">
                      <Pill color={a.status === "active" ? "var(--success)" : a.status === "disconnected" ? "var(--danger)" : "var(--warning)"} dot>
                        {a.status}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <SectionHeader icon={Siren} title={t("Останні тривоги")} />
          <ul className="divide-y divide-[var(--hairline)]">
            {alerts.slice(0, 25).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="num w-10 shrink-0 text-center text-[15px] font-semibold" style={{ color: SEV_COLOR[a.severity] }}>
                  {a.level}
                </span>
                <div className="min-w-[240px] flex-1">
                  <div className="text-[14.5px] font-medium">{a.rule}</div>
                  <div className="text-[12.5px] text-muted-foreground">
                    {a.agent} · rule {a.ruleId} {a.srcip && `· ${a.srcip}`} · {fmtWhen(a.at)}
                  </div>
                </div>
                {a.mitre.map((m) => (
                  <Pill key={m} color="var(--c2)">{m}</Pill>
                ))}
                <SeverityBadge level={a.severity} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

function Header({ t, action }: { t: (s: string) => string; action?: React.ReactNode }) {
  return <PageHeader eyebrow={t("SIEM · Інтеграція")} title="Wazuh" lede={t("Агенти та тривоги з наявного Wazuh у тому ж спокійному інтерфейсі. Тривоги рівня 12+ автоматично стають інцидентами LemonSees і мапляться на MITRE.")} action={action} />;
}
