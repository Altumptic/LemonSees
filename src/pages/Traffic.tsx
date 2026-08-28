import { useEffect, useRef, useState } from "react";
import { Activity, ArrowDownToLine, ArrowUpFromLine, Cable, Globe, RefreshCw } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { fmtBps, type Peer } from "@/lib/types";
import { PageHeader, Panel, GhostButton, Kpi, AreaChart, SectionHeader, EmptyState, StatusDot, Track } from "@/components/ui";

// Історія throughput на клієнті для спарклайнів
const hist = new Map<string, { rx: number[]; tx: number[]; conn: number[] }>();

function flag(cc: string): string {
  if (!cc || cc.length !== 2) return "🌐";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export default function TrafficPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const { settings } = useSettings();
  const [hostId, setHostId] = useState<string | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [peersLoading, setPeersLoading] = useState(false);
  const [, force] = useState(0);
  const tick = useRef(0);

  const active = hostId ?? hosts.find((h) => h.status === "online")?.id ?? hosts[0]?.id ?? null;
  const host = hosts.find((h) => h.id === active) ?? null;
  const m = host?.metrics ?? null;

  // Накопичуємо історію з живих метрик
  useEffect(() => {
    if (!host || !m) return;
    const h = hist.get(host.id) ?? { rx: [], tx: [], conn: [] };
    h.rx.push(m.netRxBps ?? 0);
    h.tx.push(m.netTxBps ?? 0);
    h.conn.push(m.connections ?? 0);
    for (const k of ["rx", "tx", "conn"] as const) if (h[k].length > 40) h[k].shift();
    hist.set(host.id, h);
    tick.current += 1;
    force(tick.current);
  }, [host, m?.netRxBps, m?.netTxBps, m?.connections, m]);

  const loadPeers = (id: string) => {
    setPeersLoading(true);
    api.peers(id, settings.geoip).then((r) => setPeers(r.peers)).catch(() => setPeers([])).finally(() => setPeersLoading(false));
  };
  useEffect(() => {
    if (active) loadPeers(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (hosts.length === 0) {
    return (
      <>
        <PageHeader eyebrow={t("Мережа")} title={t("Трафік")} lede={t("Пропускна здатність і зʼєднання наживо.")} />
        <EmptyState icon={Activity} title={t("Немає хостів")} hint={t("Додай сервер, щоб бачити його мережевий трафік.")} />
      </>
    );
  }

  const h = host ? hist.get(host.id) : null;
  const rxMax = h ? Math.max(1, ...h.rx) : 1;
  const txMax = h ? Math.max(1, ...h.tx) : 1;
  const scale = (arr: number[], max: number) => arr.map((v) => (v / max) * 100);

  return (
    <>
      <PageHeader
        eyebrow={t("Мережа · Наживо")}
        title={t("Трафік")}
        lede={t("Пропускна здатність rx/tx, активні зʼєднання й топ віддалених вузлів. Дані з /proc/net/dev по SSH.")}
        action={
          <div className="flex items-center gap-2">
            <select value={active ?? ""} onChange={(e) => setHostId(e.target.value)} className="mono rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-xs outline-none focus:border-[var(--hairline-strong)]">
              {hosts.map((x) => <option key={x.id} value={x.id} className="bg-[var(--ink)]">{x.name}</option>)}
            </select>
            <GhostButton onClick={() => active && loadPeers(active)} disabled={peersLoading}>
              <RefreshCw className="h-3 w-3" /> {t("Оновити піри")}
            </GhostButton>
          </div>
        }
      />

      {host && host.status !== "online" && (
        <div className="mono mb-4 flex items-center gap-2 rounded-lg border border-[var(--warning)]/40 px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[var(--warning)]">
          <StatusDot status={host.status} /> {t("Хост не онлайн — дані можуть бути недоступні")}
        </div>
      )}

      {!m ? (
        <Panel><div className="py-16 text-center text-sm text-muted-foreground">{t("Чекаю метрики…")}</div></Panel>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label={t("Вхідний")} value={fmtBps(m.netRxBps ?? 0)} icon={ArrowDownToLine} tone="info" sub={t("наживо")} />
            <Kpi label={t("Вихідний")} value={fmtBps(m.netTxBps ?? 0)} icon={ArrowUpFromLine} tone="ok" sub={t("наживо")} />
            <Kpi label={t("Зʼєднання")} value={m.connections ?? 0} icon={Cable} tone={(m.connections ?? 0) > 500 ? "warning" : "neutral"} sub={t("established")} />
            <Kpi label={t("Пірів")} value={peers.length} icon={Globe} tone="neutral" sub={t("віддалених")} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel>
              <SectionHeader icon={ArrowDownToLine} title={t("Вхідний трафік")} right={<span className="num text-sm" style={{ color: "var(--info)" }}>{fmtBps(m.netRxBps ?? 0)}</span>} />
              <AreaChart data={h ? h.rx : []} color="var(--interactive)" fmt={fmtBps} height={72} />
            </Panel>
            <Panel>
              <SectionHeader icon={ArrowUpFromLine} title={t("Вихідний трафік")} right={<span className="num text-sm" style={{ color: "var(--success)" }}>{fmtBps(m.netTxBps ?? 0)}</span>} />
              <AreaChart data={h ? h.tx : []} color="var(--success)" fmt={fmtBps} height={72} />
            </Panel>
          </div>

          <Panel>
            <SectionHeader icon={Globe} title={t("Топ віддалених вузлів")} sub={settings.geoip ? t("established-зʼєднання з гео-IP") : t("гео-IP вимкнено")} right={<span className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{peers.length}</span>} />
            {peersLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t("Завантажую…")}</div>
            ) : peers.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t("Активних зовнішніх зʼєднань немає.")}</div>
            ) : (
              <div className="space-y-1.5">
                {peers.map((p) => {
                  const max = peers[0]?.count || 1;
                  return (
                    <div key={p.ip} className="flex items-center gap-3 py-1">
                      <span className="text-base leading-none">{flag(p.geo?.countryCode || "")}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="mono truncate text-[12.5px]">{p.ip}</span>
                          <span className="num shrink-0 text-xs text-muted-foreground">{p.count}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="flex-1"><Track value={(p.count / max) * 100} tone="info" /></div>
                          {p.geo && (p.geo.country || p.geo.isp) && (
                            <span className="mono shrink-0 truncate text-[10px] text-muted-foreground" style={{ maxWidth: 220 }}>
                              {[p.geo.city, p.geo.country].filter(Boolean).join(", ")}{p.geo.isp ? ` · ${p.geo.isp}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
