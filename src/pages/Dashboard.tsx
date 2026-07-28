import { useEffect, useMemo, useState } from "react";
import {
  Server,
  Boxes,
  Siren,
  ShieldCheck,
  ShieldAlert,
  Activity,
  ArrowUpRight,
  Cpu,
} from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtWhen, type Incident, type AuditEvent } from "@/lib/types";
import {
  PageHeader,
  Panel,
  Kpi,
  ScoreRing,
  SeverityBadge,
  IncidentStatusBadge,
  Track,
  StatusDot,
  SectionHeader,
  EmptyState,
  riskTone,
  toneColor,
  scoreTone,
} from "@/components/ui";

type Nav = (p: string) => void;

export default function Dashboard({ go }: { go: Nav }) {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);

  useEffect(() => {
    api.listIncidents().then(setIncidents).catch(() => {});
    api.audit(8).then((r) => setAudit(r.events)).catch(() => {});
    const t = setInterval(() => {
      api.listIncidents().then(setIncidents).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, []);

  const totals = useMemo(() => {
    const online = hosts.filter((h) => h.status === "online").length;
    const running = hosts.reduce((a, h) => a + h.containers.filter((c) => c.state === "running").length, 0);
    const withM = hosts.filter((h) => h.metrics);
    const avgCpu = withM.length ? Math.round(withM.reduce((a, h) => a + (h.metrics?.cpu ?? 0), 0) / withM.length) : 0;
    return { online, running, avgCpu };
  }, [hosts]);

  const incStats = useMemo(() => {
    const open = incidents.filter((i) => i.status !== "closed");
    const crit = open.filter((i) => i.severity === "critical" || i.severity === "high").length;
    return { open: open.length, crit };
  }, [incidents]);

  // Приблизний ризик-скор флоту з наявних метрик і статусів (без окремого сканування)
  const fleetRisk = useMemo(() => {
    if (hosts.length === 0) return 0;
    let r = 0;
    for (const h of hosts) {
      if (h.status !== "online") r += 25;
      const m = h.metrics;
      if (m) {
        if (m.cpu >= 90) r += 10;
        if (m.memPct >= 90) r += 10;
        if (m.diskPct >= 85) r += 8;
      }
    }
    r += incStats.crit * 12;
    return Math.min(100, Math.round(r / Math.max(1, hosts.length)) + incStats.crit * 4);
  }, [hosts, incStats.crit]);

  const posture = Math.max(0, 100 - fleetRisk);

  return (
    <>
      <PageHeader
        eyebrow={`SOC · ${new Date().toLocaleTimeString()}`}
        title={
          <>
            {t("Центр операцій безпеки.")}
            <br />
            <span className="text-muted-foreground">{t("Один погляд на весь стан.")}</span>
          </>
        }
        lede={t("Моніторинг, безпека й відповідність — у єдиній панелі. Дані наживо по SSH, без агентів.")}
      />

      {hosts.length === 0 ? (
        <EmptyState icon={Server} title={t("Почни з додавання хоста")} hint={t("Підключи перший сервер — і тут зʼявляться метрики, ризик і статус безпеки.")} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label={t("Хости онлайн")} value={`${totals.online}/${hosts.length}`} icon={Server} tone={totals.online === hosts.length ? "ok" : "warning"} />
            <Kpi label={t("Контейнери")} value={totals.running} icon={Boxes} tone="neutral" />
            <Kpi label={t("Середній CPU")} value={`${totals.avgCpu}%`} icon={Cpu} tone={totals.avgCpu >= 85 ? "warning" : "neutral"} />
            <Kpi label={t("Відкриті інциденти")} value={incStats.open} icon={Siren} tone={incStats.open > 0 ? "warning" : "ok"} />
            <Kpi label={t("Критичні")} value={incStats.crit} icon={ShieldAlert} tone={incStats.crit > 0 ? "critical" : "ok"} />
            <Kpi label={t("Ризик флоту")} value={fleetRisk} icon={Activity} tone={riskTone(fleetRisk)} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Постура + ризик по хостах */}
            <Panel className="xl:col-span-2">
              <SectionHeader
                icon={ShieldCheck}
                title={t("Ризик по хостах")}
                sub={t("Оцінка з живих метрик і статусу")}
                right={
                  <button onClick={() => go("security")} className="mono flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
                    {t("безпека")} <ArrowUpRight className="h-3 w-3" />
                  </button>
                }
              />
              <ul className="divide-y divide-[var(--hairline)]">
                {hosts.map((h) => {
                  const hr = hostRisk(h);
                  return (
                    <li key={h.id} className="flex items-center gap-3 py-2.5">
                      <StatusDot status={h.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{h.name}</span>
                          <span className="num text-xs" style={{ color: toneColor(riskTone(hr)) }}>{hr}</span>
                        </div>
                        <div className="mt-1"><Track value={hr} tone={riskTone(hr)} /></div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            {/* Постура флоту */}
            <Panel>
              <SectionHeader icon={ShieldCheck} title={t("Постура флоту")} />
              <div className="flex flex-col items-center gap-3 py-2">
                <ScoreRing value={posture} size={130} color={toneColor(scoreTone(posture))} label={t("захищеність")} />
                <div className="text-center text-[12px] text-muted-foreground">
                  {posture >= 85 ? t("Стан флоту стабільний.") : posture >= 60 ? t("Є що підсилити.") : t("Потрібна увага аналітика.")}
                </div>
                <button onClick={() => go("compliance")} className="mono flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-[var(--primary)]">
                  {t("до комплаєнсу")} <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </Panel>

            {/* Інциденти */}
            <Panel className="xl:col-span-2">
              <SectionHeader
                icon={Siren}
                title={t("Останні інциденти")}
                right={
                  <button onClick={() => go("incidents")} className="mono flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
                    {t("всі")} <ArrowUpRight className="h-3 w-3" />
                  </button>
                }
              />
              {incidents.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("Інцидентів немає.")}</div>
              ) : (
                <ul className="divide-y divide-[var(--hairline)]">
                  {incidents.slice(0, 5).map((inc) => (
                    <li key={inc.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm">{inc.title}</div>
                        <div className="mono text-[10px] text-muted-foreground">{fmtWhen(inc.updatedAt)}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <SeverityBadge level={inc.severity} />
                        <IncidentStatusBadge status={inc.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Аудит */}
            <Panel>
              <SectionHeader
                icon={Activity}
                title={t("Активність")}
                right={
                  <button onClick={() => go("audit")} className="mono flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
                    {t("аудит")} <ArrowUpRight className="h-3 w-3" />
                  </button>
                }
              />
              {audit.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("Поки тихо.")}</div>
              ) : (
                <ul className="space-y-2">
                  {audit.map((e, i) => (
                    <li key={i} className="mono flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-foreground/80">{e.action}</span>
                      <span className="shrink-0 text-muted-foreground">{fmtWhen(e.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

function hostRisk(h: { status: string; metrics: { cpu: number; memPct: number; diskPct: number } | null }): number {
  let r = 0;
  if (h.status !== "online") return 70;
  const m = h.metrics;
  if (!m) return 20;
  if (m.cpu >= 90) r += 30;
  else if (m.cpu >= 75) r += 15;
  if (m.memPct >= 90) r += 30;
  else if (m.memPct >= 80) r += 15;
  if (m.diskPct >= 85) r += 25;
  else if (m.diskPct >= 70) r += 10;
  return Math.min(100, r);
}
