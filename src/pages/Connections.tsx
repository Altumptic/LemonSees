import { useEffect, useState } from "react";
import { Cable, Radio, Server } from "lucide-react";
import { api, useAppState , useHostSelection } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ConnectionsReport } from "@/lib/types";
import { PageHeader, HostBar, Panel, Kpi, SectionHeader, EmptyState, Pill, BarList } from "@/components/ui";
import { Donut, SERIES } from "@/components/charts";
import { countBy } from "@/lib/analytics";

export default function ConnectionsPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostId, setHostId] = useHostSelection();
  const [data, setData] = useState<ConnectionsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const active = hostId ?? hosts.find((h) => h.status === "online")?.id ?? hosts[0]?.id ?? null;
  const scan = (id: string) => {
    setLoading(true);
    setErr("");
    api.connections(id).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => {
    if (active) scan(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (hosts.length === 0) return <EmptyState icon={Cable} title={t("Немає хостів")} hint={t("Додай сервер, щоб бачити зʼєднання.")} />;
  const isPub = (a: string) => /^(0\.0\.0\.0|\*|\[::\]):/.test(a);

  return (
    <>
      <PageHeader eyebrow="NDR" title={t("Зʼєднання")} lede={t("Слухаючі сокети та встановлені зʼєднання хоста.")} />
      <HostBar hosts={hosts} value={active} onChange={setHostId} onRefresh={() => active && scan(active)} loading={loading} />
      {err ? (
        <Panel><div className="mono py-10 text-center text-[14.5px] text-[var(--danger)]">{err}</div></Panel>
      ) : loading && !data ? (
        <Panel><div className="py-14 text-center text-[14.5px] text-muted-foreground">{t("Читаю таблицю сокетів…")}</div></Panel>
      ) : data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Kpi label={t("Established")} value={data.estabCount} icon={Cable} tone={data.estabCount > 400 ? "warning" : "neutral"} />
            <Kpi label={t("Слухають")} value={data.listenCount} icon={Radio} tone="neutral" />
            <Kpi label={t("Публічні порти")} value={data.listening.filter((l) => isPub(l.local)).length} icon={Server} tone={data.listening.filter((l) => isPub(l.local)).length > 5 ? "warning" : "neutral"} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Panel>
              <SectionHeader icon={Cable} title={t("Стани TCP")} />
              <Donut size={140} thickness={18} items={countBy(data.established, (c) => c.state).map((s, i) => ({ label: s.key, value: s.count, color: SERIES[i % SERIES.length] }))} sub={t("зʼєднань")} />
            </Panel>
            <Panel>
              <SectionHeader icon={Server} title={t("За процесом")} />
              <BarList items={countBy(data.established, (c) => c.process || "?").slice(0, 6).map((p) => ({ label: p.key, value: p.count }))} />
            </Panel>
            <Panel>
              <SectionHeader icon={Radio} title={t("Топ віддалених вузлів")} />
              <BarList items={countBy(data.established, (c) => c.peer.replace(/:\d+$/, "")).slice(0, 6).map((p) => ({ label: p.key, value: p.count, color: "var(--c2)" }))} />
            </Panel>
          </div>

          <Panel>
            <SectionHeader icon={Radio} title={t("Слухаючі сокети")} sub={t("Сервіси, що приймають зʼєднання")} />
            <div className="overflow-auto rounded-lg border border-[var(--hairline)]">
              <table className="data-table w-full text-left text-[13.5px]">
                <tbody>
                  {data.listening.map((c, i) => (
                    <tr key={i} className="border-b border-[var(--hairline)] last:border-0">
                      <td className="mono px-3 py-1.5 text-muted-foreground" style={{ width: 60 }}>{c.proto}</td>
                      <td className="mono px-3 py-1.5 font-medium">{c.local}</td>
                      <td className="mono px-3 py-1.5 text-muted-foreground">{c.process}</td>
                      <td className="px-3 py-1.5 text-right">{isPub(c.local) ? <Pill color="var(--warning)">{t("публічний")}</Pill> : <Pill color="var(--muted-foreground)">{t("локальний")}</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel>
            <SectionHeader icon={Cable} title={t("Встановлені зʼєднання")} right={<span className="mono text-[12px] text-muted-foreground">{data.established.length}</span>} />
            {data.established.length === 0 ? (
              <div className="py-4 text-center text-[14.5px] text-muted-foreground">{t("Активних зʼєднань немає")}</div>
            ) : (
              <div className="max-h-96 overflow-auto rounded-lg border border-[var(--hairline)]">
                <table className="data-table w-full text-left text-[13.5px]">
                  <thead>
                    <tr className="border-b border-[var(--hairline)] bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]">
                      {[t("Локальний"), t("Віддалений"), t("Процес")].map((h) => <th key={h} className="px-3 py-2 text-[12px] text-muted-foreground font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.established.map((c, i) => (
                      <tr key={i} className="border-b border-[var(--hairline)] last:border-0 hover:bg-[color-mix(in_oklab,var(--foreground)_2%,transparent)]">
                        <td className="mono px-3 py-1.5 text-muted-foreground">{c.local}</td>
                        <td className="mono px-3 py-1.5 font-medium">{c.peer}</td>
                        <td className="mono px-3 py-1.5 text-muted-foreground">{c.process}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      ) : null}
    </>
  );
}
