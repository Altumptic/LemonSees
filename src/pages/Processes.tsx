import { useEffect, useState } from "react";
import { Cpu, RefreshCw, Activity, MemoryStick } from "lucide-react";
import { api, useAppState , useHostSelection } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtUptime, type ProcessReport } from "@/lib/types";
import { PageHeader, HostBar, Panel, Kpi, Bar, BarList, SectionHeader, EmptyState } from "@/components/ui";

export default function ProcessesPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostId, setHostId] = useHostSelection();
  const [data, setData] = useState<ProcessReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const active = hostId ?? hosts.find((h) => h.status === "online")?.id ?? hosts[0]?.id ?? null;

  const scan = (id: string) => {
    setLoading(true);
    setErr("");
    api.processes(id).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => {
    if (active) scan(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (hosts.length === 0) return <EmptyState icon={Cpu} title={t("Немає хостів")} hint={t("Додай сервер, щоб бачити його процеси.")} />;

  return (
    <>
      <PageHeader eyebrow="EDR" title={t("Процеси")} lede={t("Таблиця процесів хоста — топ за CPU та памʼяттю, наживо по SSH.")} />
      <HostBar hosts={hosts} value={active} onChange={setHostId} onRefresh={() => active && scan(active)} loading={loading} />
      {err ? (
        <Panel><div className="mono py-10 text-center text-[14.5px] text-[var(--danger)]">{err}</div></Panel>
      ) : loading && !data ? (
        <Panel><div className="py-14 text-center text-[14.5px] text-muted-foreground">{t("Читаю таблицю процесів…")}</div></Panel>
      ) : data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label={t("Процесів")} value={data.total} icon={Activity} tone="neutral" />
            <Kpi label={t("CPU (сума)")} value={`${data.cpuSum}%`} icon={Cpu} tone={data.cpuSum > 120 ? "warning" : "neutral"} />
            <Kpi label={t("RAM (сума)")} value={`${data.memSum}%`} icon={MemoryStick} tone={data.memSum > 85 ? "warning" : "neutral"} />
            <Kpi label={t("Топ-споживач")} value={data.processes[0]?.comm.slice(0, 14) || "—"} icon={Cpu} tone="neutral" sub={`${data.processes[0]?.cpu ?? 0}% CPU`} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel>
              <SectionHeader icon={Cpu} title={t("Топ за CPU")} />
              <BarList items={data.processes.slice(0, 8).map((p) => ({ label: p.comm, value: p.cpu, sub: `${p.cpu}%`, color: p.cpu > 50 ? "var(--danger)" : "var(--primary)" }))} />
            </Panel>
            <Panel>
              <SectionHeader icon={MemoryStick} title={t("Топ за памʼяттю")} />
              <BarList items={[...data.processes].sort((a, b) => b.mem - a.mem).slice(0, 8).map((p) => ({ label: p.comm, value: p.mem, sub: `${p.mem}%`, color: "var(--interactive)" }))} />
            </Panel>
          </div>

          <Panel>
            <div className="overflow-auto rounded-lg border border-[var(--hairline)]">
              <table className="data-table w-full text-left text-[14px]">
                <thead>
                  <tr className="border-b border-[var(--hairline)] bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]">
                    {["PID", t("Користувач"), "CPU %", "MEM %", t("Аптайм"), "STAT", t("Команда")].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 text-[12px] text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.processes.map((p) => (
                    <tr key={p.pid} className="border-b border-[var(--hairline)] last:border-0 hover:bg-[color-mix(in_oklab,var(--foreground)_2%,transparent)]">
                      <td className="num px-3 py-1.5 text-muted-foreground">{p.pid}</td>
                      <td className="mono px-3 py-1.5">{p.user}</td>
                      <td className="px-3 py-1.5" style={{ width: 90 }}>
                        <div className="num text-[12.5px]" style={{ color: p.cpu > 50 ? "var(--danger)" : p.cpu > 15 ? "var(--warning)" : undefined }}>{p.cpu}</div>
                        <div className="mt-0.5"><Bar value={Math.min(100, p.cpu)} tint={p.cpu > 50 ? "var(--danger)" : "var(--primary)"} /></div>
                      </td>
                      <td className="px-3 py-1.5" style={{ width: 90 }}>
                        <div className="num text-[12.5px] text-muted-foreground">{p.mem}</div>
                        <div className="mt-0.5"><Bar value={Math.min(100, p.mem)} /></div>
                      </td>
                      <td className="mono px-3 py-1.5 text-muted-foreground">{fmtUptime(p.uptimeSec)}</td>
                      <td className="mono px-3 py-1.5 text-muted-foreground">{p.stat}</td>
                      <td className="mono truncate px-3 py-1.5" style={{ maxWidth: 260 }} title={p.comm}>{p.comm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
