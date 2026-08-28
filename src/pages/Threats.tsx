import { useEffect, useRef, useState } from "react";
import { Crosshair, RefreshCw, Globe, UserX, ShieldCheck, Radio, MapPin } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { fmtWhen, type ThreatReport } from "@/lib/types";
import {
  PageHeader,
  Panel,
  GhostButton,
  Kpi,
  Pill,
  Track,
  SectionHeader,
  MapPlot,
  EmptyState,
  StatusDot,
} from "@/components/ui";

const REFRESH_MS = 20000;

function flag(cc: string): string {
  if (!cc || cc.length !== 2) return "🌐";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export default function ThreatsPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const { settings } = useSettings();
  const [hostId, setHostId] = useState<string | null>(null);
  const [data, setData] = useState<ThreatReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [live, setLive] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const online = hosts.filter((h) => h.status === "online");
  const active = hostId ?? online[0]?.id ?? hosts[0]?.id ?? null;
  const host = hosts.find((h) => h.id === active) ?? null;

  const scan = (id: string, silent = false) => {
    if (!silent) {
      setLoading(true);
      setErr("");
    }
    api
      .threats(id, settings.geoip)
      .then(setData)
      .catch((e) => !silent && setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (active) scan(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (live && active) timer.current = setInterval(() => scan(active, true), REFRESH_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, active, settings.geoip]);

  if (hosts.length === 0) {
    return (
      <>
        <PageHeader eyebrow={t("SOC · Загрози")} title={t("Загрози")} lede={t("Аналіз атак на SSH у реальному часі з гео-IP.")} />
        <EmptyState icon={Crosshair} title={t("Немає хостів")} hint={t("Додай сервер, щоб бачити атаки на нього.")} />
      </>
    );
  }

  const maxCount = data?.attackers[0]?.count ?? 1;

  return (
    <>
      <PageHeader
        eyebrow={t("SOC · Загрози")}
        title={t("Загрози")}
        lede={t("Топ атакуючих IP з auth.log і journald, гео-IP та цільові логіни. Оновлення наживо.")}
        action={
          <div className="flex items-center gap-2">
            <GhostButton active={live} onClick={() => setLive((v) => !v)}>
              <Radio className={`h-3 w-3 ${live ? "text-[var(--success)]" : ""}`} /> {live ? t("Наживо") : t("Пауза")}
            </GhostButton>
            <select
              value={active ?? ""}
              onChange={(e) => setHostId(e.target.value)}
              className="mono rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-xs outline-none focus:border-[var(--hairline-strong)]"
            >
              {hosts.map((h) => (
                <option key={h.id} value={h.id} className="bg-[var(--ink)]">{h.name}</option>
              ))}
            </select>
            <GhostButton onClick={() => active && scan(active)} disabled={loading}>
              <RefreshCw className="h-3 w-3" /> {loading ? t("Сканую…") : t("Оновити")}
            </GhostButton>
          </div>
        }
      />

      {host && host.status !== "online" && (
        <div className="mono mb-4 flex items-center gap-2 rounded-lg border border-[var(--warning)]/40 px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[var(--warning)]">
          <StatusDot status={host.status} /> {t("Хост не онлайн — дані можуть бути недоступні")}
        </div>
      )}

      {loading && !data ? (
        <Panel><div className="py-16 text-center text-sm text-muted-foreground">{t("Аналізую журнали атак…")}</div></Panel>
      ) : err ? (
        <Panel><div className="mono py-10 text-center text-sm text-[var(--danger)]">{err}</div></Panel>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label={t("Атак (48 год)")} value={data.total.toLocaleString()} icon={Crosshair} tone={data.total > 1000 ? "critical" : data.total > 100 ? "warning" : "ok"} sub={t("невдалих спроб")} />
            <Kpi label={t("Унікальних IP")} value={data.uniqueIps} icon={Globe} tone="neutral" sub={t("джерел атак")} />
            <Kpi label={t("Країн")} value={data.countries.length} icon={MapPin} tone="neutral" sub={t("походження")} />
            <Kpi label={t("Успішні входи")} value={data.accepted.reduce((a, x) => a + x.count, 0)} icon={ShieldCheck} tone={data.accepted.length ? "info" : "ok"} sub={`${data.accepted.length} ${t("джерел")}`} />
          </div>

          {settings.geoip && data.attackers.some((a) => a.geo && ((a.geo.lat ?? 0) || (a.geo.lon ?? 0))) && (
            <Panel className="mb-6">
              <SectionHeader icon={Globe} title={t("Геокарта атак")} sub={t("Джерела атак за координатами")} />
              <MapPlot
                points={data.attackers
                  .filter((a) => a.geo)
                  .map((a) => ({ lon: a.geo!.lon ?? 0, lat: a.geo!.lat ?? 0, count: a.count, label: `${a.ip} · ${a.geo!.country || ""}` }))}
              />
            </Panel>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Топ атакуючих */}
            <Panel className="xl:col-span-2">
              <SectionHeader icon={Crosshair} title={t("Топ атакуючих IP")} sub={settings.geoip ? t("з гео-IP збагаченням") : t("гео-IP вимкнено в налаштуваннях")} right={<span className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{fmtWhen(data.at)}</span>} />
              {data.attackers.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">{t("Атак не зафіксовано.")}</div>
              ) : (
                <div className="space-y-1.5">
                  {data.attackers.slice(0, 15).map((a) => (
                    <div key={a.ip} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                      <span className="text-base leading-none">{flag(a.geo?.countryCode || "")}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="mono truncate text-[12.5px] font-medium">{a.ip}</span>
                          <span className="num shrink-0 text-xs text-[var(--danger)]">{a.count.toLocaleString()}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="flex-1"><Track value={(a.count / maxCount) * 100} tone="critical" /></div>
                          {a.geo && (a.geo.country || a.geo.isp) && (
                            <span className="mono shrink-0 truncate text-[10px] text-muted-foreground" style={{ maxWidth: 200 }}>
                              {[a.geo.city, a.geo.country].filter(Boolean).join(", ")}{a.geo.isp ? ` · ${a.geo.isp}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Країни */}
            <Panel>
              <SectionHeader icon={Globe} title={t("Географія атак")} />
              {data.countries.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{settings.geoip ? t("Немає даних") : t("Увімкни гео-IP")}</div>
              ) : (
                <ul className="space-y-2">
                  {data.countries.map((c) => (
                    <li key={c.cc} className="flex items-center gap-2.5">
                      <span className="text-base leading-none">{flag(c.cc)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12.5px]">{c.country || c.cc}</span>
                          <span className="num shrink-0 text-[11px] text-muted-foreground">{c.count.toLocaleString()}</span>
                        </div>
                        <div className="mt-1"><Track value={(c.count / (data.countries[0]?.count || 1)) * 100} tone="warning" /></div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Цільові логіни */}
            <Panel>
              <SectionHeader icon={UserX} title={t("Цільові логіни")} sub={t("Які імена підбирають")} />
              {data.users.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("Немає даних")}</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {data.users.map((u) => (
                    <Pill key={u.user} color="var(--warning)">{u.user} · {u.count}</Pill>
                  ))}
                </div>
              )}
            </Panel>

            {/* Успішні входи */}
            <Panel className="xl:col-span-2">
              <SectionHeader icon={ShieldCheck} title={t("Успішні входи")} sub={t("Звідки реально заходили — перевір, чи знайомі")} />
              {data.accepted.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("Успішних входів у журналі немає.")}</div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
                  {data.accepted.map((a) => (
                    <div key={a.ip} className="mono flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-2 text-[12px] last:border-0">
                      <span className="truncate">{a.ip}</span>
                      <span className="text-muted-foreground">{a.count} {t("входів")}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
            {t("Автоінциденти вмикаються в Налаштуваннях. Гео-IP надсилає лише публічні IP атакуючих у сервіс геолокації.")}
          </div>
        </div>
      ) : null}
    </>
  );
}
