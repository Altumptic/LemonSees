import { useEffect, useState } from "react";
import { Cpu, MemoryStick, HardDrive, ArrowDownToLine, ArrowUpFromLine, Cable } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtBps, type MetricSample } from "@/lib/types";
import { PageHeader, Panel, GhostButton, Kpi, AreaChart, SectionHeader, EmptyState, StatusDot } from "@/components/ui";

export default function MetricsPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostId, setHostId] = useState<string | null>(null);
  const [hist, setHist] = useState<MetricSample[]>([]);

  const active = hostId ?? hosts.find((h) => h.status === "online")?.id ?? hosts[0]?.id ?? null;
  const host = hosts.find((h) => h.id === active) ?? null;
  const m = host?.metrics ?? null;

  useEffect(() => {
    if (!active) return;
    const load = () => api.history(active).then((r) => setHist(r.history)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [active]);

  if (hosts.length === 0) {
    return (
      <>
        <PageHeader eyebrow={t("Ресурси")} title={t("Метрики")} lede={t("Історія CPU, памʼяті, диска й мережі.")} />
        <EmptyState icon={Cpu} title={t("Немає хостів")} hint={t("Додай сервер, щоб бачити графіки ресурсів.")} />
      </>
    );
  }

  const cpu = hist.map((s) => s.cpu);
  const mem = hist.map((s) => s.memPct);
  const disk = hist.map((s) => s.diskPct);
  const rx = hist.map((s) => s.rx);
  const tx = hist.map((s) => s.tx);
  const conn = hist.map((s) => s.conn);

  return (
    <>
      <PageHeader
        eyebrow={t("Ресурси · Наживо")}
        title={t("Метрики")}
        lede={t("Часові ряди ресурсів хоста з /proc по SSH. Оновлюється щоцикл опитування.")}
        action={
          <select value={active ?? ""} onChange={(e) => setHostId(e.target.value)} className="mono rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-xs outline-none focus:border-[var(--hairline-strong)]">
            {hosts.map((h) => <option key={h.id} value={h.id} className="bg-[var(--surface)]">{h.name}</option>)}
          </select>
        }
      />

      {host && host.status !== "online" && (
        <div className="mono mb-4 flex items-center gap-2 rounded-lg border border-[var(--warning)]/40 px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[var(--warning)]">
          <StatusDot status={host.status} /> {t("Хост не онлайн — дані можуть бути недоступні")}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="CPU" value={`${m?.cpu ?? 0}%`} icon={Cpu} tone={(m?.cpu ?? 0) >= 85 ? "warning" : "neutral"} />
        <Kpi label={t("Памʼять")} value={`${m?.memPct ?? 0}%`} icon={MemoryStick} tone={(m?.memPct ?? 0) >= 85 ? "warning" : "neutral"} />
        <Kpi label={t("Диск")} value={`${m?.diskPct ?? 0}%`} icon={HardDrive} tone={(m?.diskPct ?? 0) >= 85 ? "warning" : "neutral"} />
        <Kpi label={t("Вхідний")} value={fmtBps(m?.netRxBps ?? 0)} icon={ArrowDownToLine} tone="info" />
        <Kpi label={t("Вихідний")} value={fmtBps(m?.netTxBps ?? 0)} icon={ArrowUpFromLine} tone="ok" />
        <Kpi label={t("Зʼєднання")} value={m?.connections ?? 0} icon={Cable} tone="neutral" />
      </div>

      {hist.length < 2 ? (
        <Panel><div className="py-16 text-center text-sm text-muted-foreground">{t("Збираю історію… графіки зʼявляться за кілька циклів опитування.")}</div></Panel>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartCard icon={Cpu} title="CPU %" data={cpu} color="var(--primary)" unit="%" />
          <ChartCard icon={MemoryStick} title={t("Памʼять %")} data={mem} color="var(--interactive)" unit="%" />
          <ChartCard icon={HardDrive} title={t("Диск %")} data={disk} color="var(--warning)" unit="%" />
          <ChartCard icon={Cable} title={t("Зʼєднання")} data={conn} color="var(--muted-foreground)" />
          <ChartCard icon={ArrowDownToLine} title={t("Вхідний трафік")} data={rx} color="var(--interactive)" fmt={fmtBps} />
          <ChartCard icon={ArrowUpFromLine} title={t("Вихідний трафік")} data={tx} color="var(--success)" fmt={fmtBps} />
        </div>
      )}
    </>
  );
}

function ChartCard({ icon, title, data, color, unit, fmt }: { icon: typeof Cpu; title: string; data: number[]; color: string; unit?: string; fmt?: (v: number) => string }) {
  return (
    <Panel>
      <SectionHeader icon={icon} title={title} />
      <AreaChart data={data} color={color} unit={unit} fmt={fmt} height={90} />
    </Panel>
  );
}
