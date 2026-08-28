import { useMemo } from "react";
import { MonitorSmartphone, Cpu, MemoryStick, HardDrive, Boxes, Server } from "lucide-react";
import { useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtUptime, type HostState } from "@/lib/types";
import { PageHeader, Panel, Kpi, StatusDot, MiniMeter, EmptyState, Pill, STATUS_LABEL } from "@/components/ui";

function endpointRisk(h: HostState): number {
  if (h.status !== "online") return 70;
  const m = h.metrics;
  if (!m) return 20;
  let r = 0;
  if (m.cpu >= 90) r += 30; else if (m.cpu >= 75) r += 15;
  if (m.memPct >= 90) r += 30; else if (m.memPct >= 80) r += 15;
  if (m.diskPct >= 85) r += 25; else if (m.diskPct >= 70) r += 10;
  return Math.min(100, r);
}

export default function EndpointsPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();

  const stats = useMemo(() => {
    const online = hosts.filter((h) => h.status === "online").length;
    const containers = hosts.reduce((a, h) => a + h.containers.length, 0);
    const running = hosts.reduce((a, h) => a + h.containers.filter((c) => c.state === "running").length, 0);
    return { online, containers, running };
  }, [hosts]);

  if (hosts.length === 0) return <EmptyState icon={MonitorSmartphone} title={t("Немає кінцевих точок")} hint={t("Кожен доданий хост стає керованою кінцевою точкою (агент = SSH-сесія).")} />;

  return (
    <>
      <PageHeader eyebrow="EDR" title={t("Кінцеві точки")} lede={t("Керовані хости як кінцеві точки — метрики, ризик і стан у реальному часі.")} />
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label={t("Кінцевих точок")} value={hosts.length} icon={MonitorSmartphone} tone="neutral" />
        <Kpi label={t("Онлайн")} value={`${stats.online}/${hosts.length}`} icon={Server} tone={stats.online === hosts.length ? "ok" : "warning"} />
        <Kpi label={t("Контейнери")} value={`${stats.running}/${stats.containers}`} icon={Boxes} tone="neutral" />
        <Kpi label={t("Агент")} value="SSH" icon={MonitorSmartphone} tone="ok" sub={t("агентлес — сесія як збирач")} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {hosts.map((h) => {
          const risk = endpointRisk(h);
          const m = h.metrics;
          return (
            <Panel key={h.id}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <StatusDot status={h.status} />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold">{h.name}</div>
                    <div className="mono truncate text-[10px] text-muted-foreground">{h.user}@{h.host}:{h.port}</div>
                  </div>
                </div>
                <Pill color={risk >= 60 ? "var(--danger)" : risk >= 35 ? "var(--warning)" : risk >= 15 ? "var(--info)" : "var(--success)"}>{t("ризик")} {risk}</Pill>
              </div>
              {m ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <MiniMeter label="CPU" value={m.cpu} />
                    <MiniMeter label="RAM" value={m.memPct} />
                    <MiniMeter label={t("Диск")} value={m.diskPct} />
                  </div>
                  <dl className="mono mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[var(--hairline)] pt-3 text-[10.5px]">
                    <Meta icon={Cpu} k={t("Ядро")} v={m.kernel} />
                    <Meta icon={MemoryStick} k="Docker" v={h.dockerVersion} />
                    <Meta icon={Boxes} k={t("Контейнери")} v={`${h.containers.filter((c) => c.state === "running").length}/${h.containers.length}`} />
                    <Meta icon={HardDrive} k={t("Аптайм")} v={fmtUptime(m.uptimeSec)} />
                  </dl>
                </>
              ) : (
                <div className="py-4 text-center text-[12px] text-muted-foreground">{t(STATUS_LABEL[h.status])}</div>
              )}
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function Meta({ icon: Icon, k, v }: { icon: typeof Cpu; k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-1 uppercase tracking-[0.1em] text-muted-foreground"><Icon className="h-2.5 w-2.5" />{k}</dt>
      <dd className="truncate text-foreground/85">{v}</dd>
    </div>
  );
}
