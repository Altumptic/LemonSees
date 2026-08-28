import { useEffect, useState } from "react";
import { Cable, Radio, Server } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ConnectionsReport } from "@/lib/types";
import { PageHeader, HostBar, Panel, Kpi, SectionHeader, EmptyState, Pill } from "@/components/ui";

export default function ConnectionsPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostId, setHostId] = useState<string | null>(null);
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
        <Panel><div className="mono py-10 text-center text-sm text-[var(--danger)]">{err}</div></Panel>
      ) : loading && !data ? (
        <Panel><div className="py-14 text-center text-sm text-muted-foreground">{t("Читаю таблицю сокетів…")}</div></Panel>
      ) : data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Kpi label={t("Established")} value={data.estabCount} icon={Cable} tone={data.estabCount > 400 ? "warning" : "neutral"} />
            <Kpi label={t("Слухають")} value={data.listenCount} icon={Radio} tone="neutral" />
            <Kpi label={t("Публічні порти")} value={data.listening.filter((l) => isPub(l.local)).length} icon={Server} tone={data.listening.filter((l) => isPub(l.local)).length > 5 ? "warning" : "neutral"} />
          </div>

          <Panel>
            <SectionHeader icon={Radio} title={t("Слухаючі сокети")} sub={t("Сервіси, що приймають зʼєднання")} />
            <div className="overflow-auto rounded-lg border border-[var(--hairline)]">
              <table className="w-full text-left text-[12px]">
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
            <SectionHeader icon={Cable} title={t("Встановлені зʼєднання")} right={<span className="mono text-[10px] text-muted-foreground">{data.established.length}</span>} />
            {data.established.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">{t("Активних зʼєднань немає")}</div>
            ) : (
              <div className="max-h-96 overflow-auto rounded-lg border border-[var(--hairline)]">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--hairline)] bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]">
                      {[t("Локальний"), t("Віддалений"), t("Процес")].map((h) => <th key={h} className="mono px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{h}</th>)}
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
