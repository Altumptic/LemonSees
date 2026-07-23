import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Boxes,
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { useAppState } from "@/lib/api";
import { fmtUptime, fmtGb, type HostState } from "@/lib/types";
import {
  PageHeader,
  Panel,
  StatCard,
  StatusDot,
  MiniMeter,
  RadialMetric,
  Sparkline,
  StatePill,
  SeverityTag,
  PrimaryButton,
  STATUS_LABEL,
} from "@/components/ui";

// Історія CPU для спарклайнів (живе поки відкрита вкладка)
const cpuHistory = new Map<string, number[]>();

type Alert = { severity: "critical" | "warning" | "info"; title: string; host: string; detail: string };

function deriveAlerts(hosts: HostState[]): Alert[] {
  const out: Alert[] = [];
  for (const h of hosts) {
    if (h.status === "offline" || h.status === "error") {
      out.push({
        severity: "critical",
        title: "Хост недоступний",
        host: h.name,
        detail: h.error || "SSH-з'єднання не встановлено.",
      });
      continue;
    }
    const m = h.metrics;
    if (!m) continue;
    if (m.cpu >= 90)
      out.push({ severity: "critical", title: `CPU ${m.cpu}%`, host: h.name, detail: "Процесор перевантажено." });
    else if (m.cpu >= 75)
      out.push({ severity: "warning", title: `CPU ${m.cpu}%`, host: h.name, detail: "Підвищене навантаження CPU." });
    if (m.memPct >= 90)
      out.push({ severity: "critical", title: `RAM ${m.memPct}%`, host: h.name, detail: "Пам'ять майже вичерпано." });
    else if (m.memPct >= 80)
      out.push({ severity: "warning", title: `RAM ${m.memPct}%`, host: h.name, detail: "Високе споживання пам'яті." });
    if (m.diskPct >= 85)
      out.push({ severity: "warning", title: `Диск ${m.diskPct}%`, host: h.name, detail: "Мало місця на диску /." });
    for (const c of h.containers) {
      if (c.state === "restarting")
        out.push({ severity: "warning", title: "Контейнер у циклі рестартів", host: h.name, detail: c.name });
    }
  }
  return out.slice(0, 6);
}

export default function Overview({ go }: { go: (p: "hosts" | "containers") => void }) {
  const { hosts } = useAppState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const tickRef = useRef(0);

  const host = hosts.find((h) => h.id === selectedId) ?? hosts[0] ?? null;

  // Накопичуємо історію CPU
  useEffect(() => {
    for (const h of hosts) {
      if (!h.metrics) continue;
      const arr = cpuHistory.get(h.id) ?? [];
      if (arr.length === 0 || arr[arr.length - 1] !== h.metrics.cpu || true) {
        arr.push(h.metrics.cpu);
        if (arr.length > 48) arr.shift();
        cpuHistory.set(h.id, arr);
      }
    }
    tickRef.current += 1;
    forceTick(tickRef.current);
  }, [hosts]);

  const totals = useMemo(() => {
    const running = hosts.reduce((a, h) => a + h.containers.filter((c) => c.state === "running").length, 0);
    const total = hosts.reduce((a, h) => a + h.containers.length, 0);
    const up = hosts.filter((h) => h.status === "online").length;
    const withM = hosts.filter((h) => h.metrics);
    const avgCpu = withM.length
      ? Math.round(withM.reduce((a, h) => a + (h.metrics?.cpu ?? 0), 0) / withM.length)
      : 0;
    return { running, total, up, avgCpu };
  }, [hosts]);

  const alerts = useMemo(() => deriveAlerts(hosts), [hosts]);

  if (hosts.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Флот · Порожньо"
          title={
            <>
              Кожен хост, кожен контейнер.
              <br />
              <span className="text-muted-foreground">Одна тиха поверхня.</span>
            </>
          }
          lede="Поки що не додано жодного сервера. Додай перший хост — і метрики з'являться тут за кілька секунд."
          action={<PrimaryButton onClick={() => go("hosts")}>Додати хост</PrimaryButton>}
        />
        <Panel>
          <div className="py-16 text-center text-sm text-muted-foreground">
            Немає підключених серверів. Перейди в «Хости» → «Додати хост».
          </div>
        </Panel>
      </>
    );
  }

  const spark = host ? (cpuHistory.get(host.id) ?? []) : [];

  return (
    <>
      <PageHeader
        eyebrow={`Флот · Наживо · ${new Date().toLocaleTimeString()}`}
        title={
          <>
            Кожен хост, кожен контейнер.
            <br />
            <span className="text-muted-foreground">Одна тиха поверхня.</span>
          </>
        }
        lede="Дані збираються по SSH без агентів. Дії з контейнерами вимагають явного підтвердження."
        action={<PrimaryButton onClick={() => go("hosts")}>Додати хост</PrimaryButton>}
      />

      {/* Загальні цифри */}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Контейнери" value={`${totals.running} / ${totals.total}`} sub="працює / всього" icon={Boxes} />
        <StatCard label="Хости онлайн" value={`${totals.up} / ${hosts.length}`} sub="доступні по SSH" icon={Server} />
        <StatCard label="Середній CPU" value={`${totals.avgCpu}%`} sub="по всіх хостах" icon={Cpu} />
        <StatCard label="Сигнали" value={String(alerts.length)} sub="активні попередження" icon={Activity} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Список хостів */}
        <Panel
          eyebrow="Флот"
          title="Хости"
          className="xl:col-span-1"
          action={
            <button
              onClick={() => go("hosts")}
              className="mono flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
            >
              всі <ArrowUpRight className="h-3 w-3" />
            </button>
          }
        >
          <ul className="divide-y divide-[var(--hairline)]">
            {hosts.map((h) => {
              const active = host && h.id === host.id;
              return (
                <li key={h.id}>
                  <button
                    onClick={() => setSelectedId(h.id)}
                    className={`group w-full py-3 text-left transition-colors ${active ? "" : "opacity-80 hover:opacity-100"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <StatusDot status={h.status} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{h.name}</span>
                            {active && (
                              <span className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--primary)]">
                                обрано
                              </span>
                            )}
                          </div>
                          <div className="mono truncate text-[11px] text-muted-foreground">
                            {h.user}@{h.host}:{h.port}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    {h.metrics ? (
                      <div className="mt-3 grid grid-cols-3 gap-3 pl-7">
                        <MiniMeter label="CPU" value={h.metrics.cpu} />
                        <MiniMeter label="RAM" value={h.metrics.memPct} />
                        <MiniMeter label="ДИСК" value={h.metrics.diskPct} />
                      </div>
                    ) : (
                      <div className="mono mt-2 pl-7 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {STATUS_LABEL[h.status]}
                        {h.error ? ` · ${h.error.slice(0, 60)}` : ""}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Деталі хоста */}
        <div className="space-y-6 xl:col-span-2">
          {host && (
            <Panel
              eyebrow={`${host.user}@${host.host}:${host.port}`}
              title={
                <span className="flex items-center gap-3">
                  {host.name}
                  <span className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    аптайм {host.metrics ? fmtUptime(host.metrics.uptimeSec) : "—"}
                  </span>
                </span>
              }
            >
              {host.metrics ? (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <RadialMetric label="CPU" value={host.metrics.cpu} icon={Cpu} />
                    <RadialMetric label="Пам'ять" value={host.metrics.memPct} icon={MemoryStick} />
                    <RadialMetric label="Диск" value={host.metrics.diskPct} icon={HardDrive} />
                    <div className="glass-strong flex flex-col justify-between rounded-lg p-4">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        <span>CPU · історія</span>
                        <Activity className="h-3 w-3" />
                      </div>
                      <div className="num mt-1 text-2xl font-medium tracking-tight">
                        {host.metrics.load1.toFixed(2)}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">load</span>
                      </div>
                      <Sparkline data={spark} stroke="var(--primary)" />
                    </div>
                  </div>

                  <dl className="mono mt-5 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-[var(--hairline)] pt-4 text-[11px] md:grid-cols-4">
                    <MetaRow k="Docker" v={host.dockerVersion} />
                    <MetaRow k="Ядро" v={host.metrics.kernel} />
                    <MetaRow k="CPU ядер" v={String(host.metrics.cores)} />
                    <MetaRow
                      k="RAM"
                      v={`${(host.metrics.memUsedMb / 1024).toFixed(1)} / ${(host.metrics.memTotalMb / 1024).toFixed(1)} GB`}
                    />
                    <MetaRow k="Диск /" v={`${fmtGb(host.metrics.diskUsedKb)} / ${fmtGb(host.metrics.diskTotalKb)}`} />
                    <MetaRow
                      k="Контейнери"
                      v={`${host.containers.filter((c) => c.state === "running").length}/${host.containers.length}`}
                    />
                    <MetaRow k="Опитування" v={`${host.interval}с`} />
                    <MetaRow k="Статус" v={STATUS_LABEL[host.status]} />
                  </dl>
                </>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {host.status === "connecting" ? "Встановлюю SSH-з'єднання…" : host.error || "Немає даних."}
                </div>
              )}
            </Panel>
          )}

          <Panel eyebrow="Сигнал" title="Попередження">
            {alerts.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Все спокійно. Жодних попереджень.</div>
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {alerts.map((a, i) => (
                  <li key={i} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <SeverityTag level={a.severity} />
                        <span className="text-sm">{a.title}</span>
                      </div>
                      <div className="mono mt-1 text-[11px] text-muted-foreground">
                        {a.host} — {a.detail}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {host && (
            <Panel
              eyebrow="Навантаження"
              title={`Контейнери на ${host.name}`}
              action={
                <button
                  onClick={() => go("containers")}
                  className="mono flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
                >
                  всі <ArrowUpRight className="h-3 w-3" />
                </button>
              }
            >
              {host.containers.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  На цьому хості немає контейнерів (або Docker не встановлено).
                </div>
              ) : (
                <ul className="divide-y divide-[var(--hairline)]">
                  {host.containers.slice(0, 6).map((c) => (
                    <li key={c.id} className="grid grid-cols-12 items-center gap-3 py-2.5 text-sm">
                      <div className="col-span-5 min-w-0">
                        <div className="truncate font-medium">{c.name}</div>
                        <div className="mono truncate text-[11px] text-muted-foreground">{c.image}</div>
                      </div>
                      <div className="col-span-2">
                        <StatePill state={c.state} />
                      </div>
                      <div className="num col-span-2 text-xs text-muted-foreground">CPU {c.cpuPct.toFixed(1)}%</div>
                      <div className="num col-span-3 text-xs text-muted-foreground">
                        RAM {c.memUsedMb}
                        {c.memLimitMb ? `/${c.memLimitMb}` : ""} MB
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="uppercase tracking-[0.18em] text-muted-foreground">{k}</dt>
      <dd className="truncate text-foreground/90">{v}</dd>
    </div>
  );
}
