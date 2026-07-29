import { useEffect, useState } from "react";
import { Bug, RefreshCw, ShieldCheck, Wrench, ChevronDown } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtWhen, type VulnReport } from "@/lib/types";
import {
  PageHeader,
  Panel,
  GhostButton,
  ScoreRing,
  Kpi,
  SeverityBadge,
  ControlBadge,
  Track,
  SectionHeader,
  EmptyState,
  scoreTone,
  toneColor,
  StatusDot,
} from "@/components/ui";

export default function VulnerabilitiesPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostId, setHostId] = useState<string | null>(null);
  const [data, setData] = useState<VulnReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [onlyVulns, setOnlyVulns] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const online = hosts.filter((h) => h.status === "online");
  const active = hostId ?? online[0]?.id ?? hosts[0]?.id ?? null;
  const host = hosts.find((h) => h.id === active) ?? null;

  const scan = (id: string) => {
    setLoading(true);
    setErr("");
    setData(null);
    api.vulns(id).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => {
    if (active) scan(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (hosts.length === 0) {
    return (
      <>
        <PageHeader eyebrow={t("Кібераналіз")} title={t("Вразливості")} lede={t("Скан конфігурації, експозиції та патчів.")} />
        <EmptyState icon={Bug} title={t("Немає хостів")} hint={t("Додай сервер, щоб просканувати його на вразливості.")} />
      </>
    );
  }

  const rows = data ? (onlyVulns ? data.findings.filter((f) => f.status === "vuln") : data.findings) : [];
  const st = data ? scoreTone(data.secScore) : "neutral";

  return (
    <>
      <PageHeader
        eyebrow={t("Кібераналіз · Вразливості")}
        title={t("Вразливості")}
        lede={t("Аналіз конфігурації й експозиції по SSH: SSH, firewall, патчі, права, облікові записи. З ремедіацією.")}
        action={
          <div className="flex items-center gap-2">
            <select value={active ?? ""} onChange={(e) => setHostId(e.target.value)} className="mono rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-xs outline-none focus:border-[var(--hairline-strong)]">
              {hosts.map((h) => <option key={h.id} value={h.id} className="bg-[var(--ink)]">{h.name}</option>)}
            </select>
            <GhostButton onClick={() => active && scan(active)} disabled={loading}>
              <RefreshCw className="h-3 w-3" /> {loading ? t("Сканую…") : t("Пересканувати")}
            </GhostButton>
          </div>
        }
      />

      {host && host.status !== "online" && (
        <div className="mono mb-4 flex items-center gap-2 rounded-lg border border-[var(--warning)]/40 px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[var(--warning)]">
          <StatusDot status={host.status} /> {t("Хост не онлайн — дані можуть бути недоступні")}
        </div>
      )}

      {loading ? (
        <Panel><div className="py-16 text-center text-sm text-muted-foreground">{t("Сканую на вразливості…")}</div></Panel>
      ) : err ? (
        <Panel><div className="mono py-10 text-center text-sm text-[var(--danger)]">{err}</div></Panel>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
            <Panel>
              <div className="flex items-center gap-5">
                <ScoreRing value={data.secScore} size={104} color={toneColor(st)} label={t("захищеність")} />
                <div>
                  <div className="eyebrow mb-1">{t("Індекс захищеності")}</div>
                  <div className="num text-xl font-medium" style={{ color: toneColor(st) }}>{data.secScore}%</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{data.vulnCount} {t("вразливостей")} · {fmtWhen(data.at)}</div>
                  {data.os && <div className="mono mt-1 text-[10px] text-muted-foreground">{data.os}</div>}
                </div>
              </div>
            </Panel>
            <div className="grid grid-cols-3 gap-4 md:grid-cols-5">
              <Kpi label={t("Критичні")} value={data.bySeverity.critical || 0} tone={data.bySeverity.critical ? "critical" : "ok"} />
              <Kpi label={t("Високі")} value={data.bySeverity.high || 0} tone={data.bySeverity.high ? "warning" : "ok"} />
              <Kpi label={t("Середні")} value={data.bySeverity.medium || 0} tone={data.bySeverity.medium ? "warning" : "neutral"} />
              <Kpi label={t("Низькі")} value={data.bySeverity.low || 0} tone="neutral" />
              <Kpi label={t("Ризик")} value={data.risk} tone={data.grade} />
            </div>
          </div>

          {/* Чекбари по категоріях */}
          <Panel>
            <SectionHeader icon={ShieldCheck} title={t("Покриття по категоріях")} sub={t("Частка пройдених перевірок")} />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.categories.map((c) => (
                <div key={c.cat}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span>{t(c.label)}</span>
                    <span className="num text-muted-foreground">{c.passed}/{c.total} · {c.pct}%</span>
                  </div>
                  <Track value={c.pct} tone={scoreTone(c.pct)} />
                </div>
              ))}
            </div>
          </Panel>

          {/* Знахідки */}
          <Panel>
            <SectionHeader
              icon={Bug}
              title={t("Знахідки")}
              right={
                <div className="flex gap-1.5">
                  <GhostButton active={onlyVulns} onClick={() => setOnlyVulns(true)}><span className="mono text-[10px] uppercase tracking-[0.16em]">{t("лише вразливі")}</span></GhostButton>
                  <GhostButton active={!onlyVulns} onClick={() => setOnlyVulns(false)}><span className="mono text-[10px] uppercase tracking-[0.16em]">{t("всі")}</span></GhostButton>
                </div>
              }
            />
            {rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("Вразливостей не знайдено. Хост добре налаштовано.")}</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
                {rows.map((f) => (
                  <div key={f.id} className="border-b border-[var(--hairline)] last:border-0">
                    <button onClick={() => setOpen(open === f.id ? null : f.id)} className="grid w-full grid-cols-12 items-center gap-3 px-4 py-2.5 text-left hover:bg-[color-mix(in_oklab,var(--foreground)_2%,transparent)]">
                      <div className="col-span-6 min-w-0">
                        <div className="truncate text-sm">{f.title}</div>
                        <div className="mono truncate text-[10px] text-muted-foreground">{f.detail}</div>
                      </div>
                      <div className="col-span-2"><span className="mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t(f.categoryLabel)}</span></div>
                      <div className="col-span-3 flex justify-start">
                        {f.status === "vuln" ? <SeverityBadge level={f.severity} /> : <ControlBadge status={f.status === "ok" ? "pass" : "unknown"} labelText={t(f.status === "ok" ? "пройдено" : "невідомо")} />}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {f.remediation && <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open === f.id ? "rotate-180" : ""}`} />}
                      </div>
                    </button>
                    {open === f.id && f.remediation && (
                      <div className="mono flex items-start gap-2 border-t border-[var(--hairline)] bg-black/20 px-4 py-3 text-[12px] text-muted-foreground">
                        <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
                        <span><span className="text-[var(--primary)]">{t("Ремедіація:")}</span> {f.remediation}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      ) : null}
    </>
  );
}
