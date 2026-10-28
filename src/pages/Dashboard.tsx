import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Server, Siren, ShieldCheck, ShieldAlert, Activity, ArrowUpRight, Cpu, Plus, FlaskConical, Grid3x3, Gauge, Timer, SlidersHorizontal } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { fmtWhen, type Incident, type AuditEvent, type HostState } from "@/lib/types";
import { SEVERITIES, incidentsByDay, mitreCoverage, responseTimes, countBy } from "@/lib/analytics";
import { Modal, PageHeader, Panel, Kpi, PrimaryButton, GhostButton, ScoreRing, SeverityBadge, IncidentStatusBadge, Track, StatusDot, SectionHeader, EmptyState, riskTone, toneColor, scoreTone } from "@/components/ui";
import { Donut, LineChart, StackedBars, SEV_COLOR, SERIES } from "@/components/charts";
import type { Nav } from "@/nav";

const SEV_LABEL: Record<string, string> = { critical: "критичний", high: "високий", medium: "середній", low: "низький", info: "інфо" };

export default function Dashboard({ go }: { go: Nav }) {
  const { hosts } = useAppState();
  const { t, lang } = useI18n();
  const { settings, set } = useSettings();
  const [customize, setCustomize] = useState(false);
  const hidden = settings.hiddenWidgets ?? [];
  const vis = (id: string, cls = "") => `${cls} ${hidden.includes(id) ? "hidden" : ""}`;
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const fleet = useFleetHistory(hosts);

  useEffect(() => {
    const load = () => {
      api.listIncidents().then(setIncidents).catch(() => {});
      api.audit(400).then((r) => setAudit(r.events)).catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [hosts.length]);

  const totals = useMemo(() => {
    const online = hosts.filter((h) => h.status === "online").length;
    const running = hosts.reduce((a, h) => a + h.containers.filter((c) => c.state === "running").length, 0);
    const withM = hosts.filter((h) => h.metrics);
    const avgCpu = withM.length ? Math.round(withM.reduce((a, h) => a + (h.metrics?.cpu ?? 0), 0) / withM.length) : 0;
    return { online, running, avgCpu };
  }, [hosts]);

  const open = incidents.filter((i) => i.status !== "closed");
  const crit = open.filter((i) => i.severity === "critical" || i.severity === "high").length;
  const byDay = useMemo(() => incidentsByDay(incidents, 14, lang), [incidents, lang]);
  const daily = byDay.map((d) => d.values.reduce((a, b) => a + b, 0));
  const rt = useMemo(() => responseTimes(incidents), [incidents]);
  const mitre = useMemo(() => mitreCoverage(incidents), [incidents]);
  const topTactics = mitre.tactics.filter((x) => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 6);
  const cats = useMemo(() => countBy(open, (i) => i.category).slice(0, 5), [open]);

  const fleetRisk = useMemo(() => {
    if (hosts.length === 0) return 0;
    const avg = hosts.reduce((a, h) => a + hostRisk(h), 0) / hosts.length;
    return Math.min(100, Math.round(avg + crit * 3));
  }, [hosts, crit]);
  const posture = Math.max(0, 100 - fleetRisk);

  return (
    <>
      <PageHeader
        eyebrow={`SOC · ${new Date().toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" })}`}
        title={
          <>
            {t("Центр операцій безпеки.")}
            <br />
            <span className="text-muted-foreground">{t("Один погляд на весь стан.")}</span>
          </>
        }
        lede={t("Моніторинг, безпека й відповідність — у єдиній панелі. Дані наживо по SSH, без агентів.")}
        action={
          hosts.length > 0 && (
            <>
              <GhostButton onClick={() => setCustomize(true)}>
                <SlidersHorizontal className="h-4 w-4" /> {t("Віджети")}
              </GhostButton>
              <GhostButton onClick={() => go("siem/analytics")}>
                <Activity className="h-4 w-4" /> {t("SOC-аналітика")}
              </GhostButton>
              <PrimaryButton onClick={() => go("soar/incidents?new")}>
                <Plus className="h-4 w-4" /> {t("Новий інцидент")}
              </PrimaryButton>
            </>
          )
        }
      />

      {hosts.length === 0 ? (
        <div className="space-y-6">
          <EmptyState
            icon={Server}
            title={t("Почни з додавання хоста")}
            hint={t("Підключи перший сервер — і тут зʼявляться метрики, ризик і статус безпеки. Або подивись продукт на демо-даних.")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <PrimaryButton onClick={() => go("infra/hosts?new")}>
                  <Plus className="h-4 w-4" /> {t("Додати хост")}
                </PrimaryButton>
                <GhostButton onClick={() => set({ demo: true })}>
                  <FlaskConical className="h-4 w-4" /> {t("Спробувати демо")}
                </GhostButton>
              </div>
            }
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {[
              { n: "01", icon: Server, ti: t("Підключи по SSH"), d: t("Хост, користувач і ключ — без встановлення агентів.") },
              { n: "02", icon: Activity, ti: t("Дивись наживо"), d: t("Метрики, процеси, зʼєднання й логи в реальному часі.") },
              { n: "03", icon: ShieldCheck, ti: t("Тримай під контролем"), d: t("Ризик, інциденти, комплаєнс і аптайм в одній панелі.") },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.n} className="glass rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-subtle)]">
                      <Icon className="h-5 w-5 text-[var(--primary)]" />
                    </span>
                    <span className="doto text-[18px] text-muted-foreground">{s.n}</span>
                  </div>
                  <div className="mt-4 text-[16px] font-semibold tracking-tight">{s.ti}</div>
                  <div className="mt-1 text-[14.5px] leading-relaxed text-muted-foreground">{s.d}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI з трендами */}
          <div className={vis("kpis", "grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6")}>
            <Kpi label={t("Хости онлайн")} value={`${totals.online}/${hosts.length}`} icon={Server} tone={totals.online === hosts.length ? "ok" : "warning"} onClick={() => go("edr/endpoints")} />
            <Kpi label={t("Середній CPU")} value={`${totals.avgCpu}%`} icon={Cpu} tone={totals.avgCpu >= 85 ? "warning" : "neutral"} trend={fleet.cpu.slice(-40)} onClick={() => go("infra/metrics")} />
            <Kpi label={t("Тривоги, 14 днів")} value={daily.reduce((a, b) => a + b, 0)} icon={Activity} tone="info" trend={daily} onClick={() => go("siem/analytics")} />
            <Kpi label={t("Відкриті інциденти")} value={open.length} icon={Siren} tone={open.length > 0 ? "warning" : "ok"} onClick={() => go("soar/incidents")} />
            <Kpi label={t("Критичні")} value={crit} icon={ShieldAlert} tone={crit > 0 ? "critical" : "ok"} onClick={() => go("soar/incidents")} />
            <Kpi label="MTTR" value={rt.mttrHours ? `${rt.mttrHours.toFixed(1)}h` : "—"} sub={rt.mttaMinutes ? `MTTA ${Math.round(rt.mttaMinutes)} ${t("хв")}` : undefined} icon={Timer} tone="neutral" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Тривоги в часі */}
            <Panel className={vis("alerts", "xl:col-span-2")}>
              <SectionHeader icon={Activity} title={t("Тривоги за серйозністю")} sub={t("Нові інциденти по днях, останні 14 днів")} right={<LinkBtn onClick={() => go("siem/analytics")}>{t("аналітика")}</LinkBtn>} />
              <StackedBars data={byDay} keys={SEVERITIES.map((s) => ({ name: t(SEV_LABEL[s]), color: SEV_COLOR[s] }))} height={240} />
            </Panel>

            {/* Постура */}
            <Panel className={vis("posture")}>
              <SectionHeader icon={ShieldCheck} title={t("Постура флоту")} right={<LinkBtn onClick={() => go("grc/compliance")}>{t("комплаєнс")}</LinkBtn>} />
              <div className="flex flex-col items-center gap-4 py-2">
                <ScoreRing value={posture} size={150} color={toneColor(scoreTone(posture))} label={t("захищеність")} />
                <div className="text-center text-[14px] text-muted-foreground">
                  {posture >= 85 ? t("Стан флоту стабільний.") : posture >= 60 ? t("Є що підсилити.") : t("Потрібна увага аналітика.")}
                </div>
                <div className="grid w-full grid-cols-3 gap-2 text-center">
                  {[
                    [t("Ризик"), fleetRisk],
                    [t("Відкриті"), open.length],
                    [t("Контейнери"), totals.running],
                  ].map(([l, v]) => (
                    <div key={String(l)} className="rounded-xl bg-[var(--surface-raised)] py-2.5">
                      <div className="doto text-[22px]">{v}</div>
                      <div className="text-[12px] text-muted-foreground">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            {/* Ресурси флоту */}
            <Panel className={vis("fleet", "xl:col-span-2")}>
              <SectionHeader icon={Gauge} title={t("Навантаження флоту")} sub={t("Середнє по всіх онлайн-хостах")} right={<LinkBtn onClick={() => go("infra/metrics")}>{t("метрики")}</LinkBtn>} />
              <LineChart
                series={[
                  { name: "CPU %", data: fleet.cpu, color: SERIES[0] },
                  { name: t("Памʼять %"), data: fleet.mem, color: SERIES[1] },
                  { name: t("Диск %"), data: fleet.disk, color: SERIES[2] },
                ]}
                labels={fleet.labels}
                yMax={100}
                yFmt={(v) => `${Math.round(v)}%`}
                height={230}
              />
            </Panel>

            {/* Розподіл відкритих */}
            <Panel className={vis("openDonut")}>
              <SectionHeader icon={Siren} title={t("Відкриті за серйозністю")} />
              <Donut
                items={SEVERITIES.map((s) => ({ label: t(SEV_LABEL[s]), value: open.filter((i) => i.severity === s).length, color: SEV_COLOR[s] }))}
                sub={t("відкритих")}
              />
            </Panel>

            {/* Ризик по хостах */}
            <Panel className={vis("hostRisk", "xl:col-span-2")}>
              <SectionHeader icon={ShieldAlert} title={t("Ризик по хостах")} sub={t("Оцінка з живих метрик і статусу")} right={<LinkBtn onClick={() => go("edr/endpoints")}>{t("кінцеві точки")}</LinkBtn>} />
              <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
                {[...hosts].sort((a, b) => hostRisk(b) - hostRisk(a)).map((h) => {
                  const hr = hostRisk(h);
                  return (
                    <li key={h.id} className="flex items-center gap-3 border-b border-[var(--hairline)] py-3">
                      <StatusDot status={h.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[14.5px] font-medium">{h.name}</span>
                          <span className="num text-[13px]" style={{ color: toneColor(riskTone(hr)) }}>{hr}</span>
                        </div>
                        <div className="mt-1.5">
                          <Track value={hr} tone={riskTone(hr)} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            {/* MITRE */}
            <Panel className={vis("mitre")}>
              <SectionHeader icon={Grid3x3} title="MITRE ATT&CK" sub={t("Найактивніші тактики")} right={<LinkBtn onClick={() => go("cti/mitre")}>{t("матриця")}</LinkBtn>} />
              {topTactics.length === 0 ? (
                <div className="py-8 text-center text-[14px] text-muted-foreground">{t("Ще немає зіставлених технік.")}</div>
              ) : (
                <ul className="space-y-3">
                  {topTactics.map((tac) => (
                    <li key={tac.id}>
                      <div className="mb-1.5 flex items-center justify-between text-[14px]">
                        <span className="truncate">{tac.name}</span>
                        <span className="num text-muted-foreground">{tac.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--hairline)]">
                        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${(tac.count / topTactics[0].count) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Інциденти */}
            <Panel className={vis("recent", "xl:col-span-2")}>
              <SectionHeader icon={Siren} title={t("Останні інциденти")} right={<LinkBtn onClick={() => go("soar/incidents")}>{t("всі")}</LinkBtn>} />
              {incidents.length === 0 ? (
                <div className="py-6 text-center text-[14.5px] text-muted-foreground">{t("Інцидентів немає.")}</div>
              ) : (
                <ul className="divide-y divide-[var(--hairline)]">
                  {incidents.slice(0, 6).map((inc) => (
                    <li key={inc.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14.5px] font-medium">{inc.title}</div>
                        <div className="text-[12.5px] text-muted-foreground">
                          {inc.category} · {fmtWhen(inc.createdAt)}
                        </div>
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

            {/* Категорії + активність */}
            <Panel className={vis("categories")}>
              <SectionHeader icon={Activity} title={t("Категорії загроз")} sub={t("Відкриті інциденти")} />
              {cats.length === 0 ? (
                <div className="py-6 text-center text-[14.5px] text-muted-foreground">{t("Поки тихо.")}</div>
              ) : (
                <Donut size={140} thickness={18} items={cats.map((c, i) => ({ label: c.key, value: c.count, color: SERIES[i % SERIES.length] }))} sub={t("відкритих")} />
              )}
              <div className="mt-5 border-t border-[var(--hairline)] pt-4">
                <div className="mb-2 text-[13px] font-medium text-muted-foreground">{t("Остання активність")}</div>
                <ul className="space-y-1.5">
                  {audit.slice(0, 5).map((e, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="mono truncate text-foreground/80">{e.action}</span>
                      <span className="shrink-0 text-muted-foreground">{fmtWhen(e.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {customize && (
        <Modal title={t("Віджети огляду")} onClose={() => setCustomize(false)}>
          <p className="mb-4 text-[14.5px] text-muted-foreground">{t("Обери, що показувати на огляді. Налаштування зберігається на цьому пристрої.")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {WIDGETS.map(([id, label]) => {
              const on = !hidden.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => set({ hiddenWidgets: on ? [...hidden, id] : hidden.filter((x) => x !== id) })}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-[14.5px] transition-colors ${on ? "border-[var(--primary)] bg-[var(--accent-subtle)]" : "border-[var(--hairline)]"}`}
                >
                  {t(label)}
                  <span className={`h-5 w-5 rounded-md border text-center text-[12px] leading-[18px] ${on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--hairline-strong)]"}`}>{on ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex justify-end">
            <GhostButton onClick={() => set({ hiddenWidgets: [] })}>{t("Показати все")}</GhostButton>
          </div>
        </Modal>
      )}
    </>
  );
}

const WIDGETS: [string, string][] = [
  ["kpis", "Ключові показники"],
  ["alerts", "Тривоги за серйозністю"],
  ["posture", "Постура флоту"],
  ["fleet", "Навантаження флоту"],
  ["openDonut", "Відкриті за серйозністю"],
  ["hostRisk", "Ризик по хостах"],
  ["mitre", "MITRE ATT&CK"],
  ["recent", "Останні інциденти"],
  ["categories", "Категорії загроз"],
];

function LinkBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-muted-foreground hover:bg-[var(--hover)] hover:text-foreground">
      {children} <ArrowUpRight className="h-3.5 w-3.5" />
    </button>
  );
}

/** Середні ресурси флоту з історії метрик кожного хоста. */
function useFleetHistory(hosts: HostState[]) {
  const [hist, setHist] = useState<{ cpu: number[]; mem: number[]; disk: number[]; labels: string[] }>({ cpu: [], mem: [], disk: [], labels: [] });
  const ids = hosts.filter((h) => h.status === "online").map((h) => h.id).join(",");
  useEffect(() => {
    if (!ids) return;
    let alive = true;
    const load = async () => {
      const all = await Promise.all(ids.split(",").map((id) => api.history(id).then((r) => r.history).catch(() => [])));
      const len = Math.min(...all.filter((a) => a.length).map((a) => a.length), 120);
      if (!alive || !isFinite(len) || len < 2) return;
      const tail = all.filter((a) => a.length).map((a) => a.slice(-len));
      const avg = (k: "cpu" | "memPct" | "diskPct") => Array.from({ length: len }, (_, i) => tail.reduce((s, a) => s + a[i][k], 0) / tail.length);
      setHist({
        cpu: avg("cpu"),
        mem: avg("memPct"),
        disk: avg("diskPct"),
        labels: tail[0].map((s) => new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
      });
    };
    load();
    const id = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ids]);
  return hist;
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
