import { useEffect, useRef, useState } from "react";
import { ScrollText, RefreshCw, FileText } from "lucide-react";
import { api, useAppState , useHostSelection } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtWhen, type AuditEvent } from "@/lib/types";
import { PageHeader, HostBar, Panel, GhostButton, SectionHeader, Histogram, EmptyState, Tag } from "@/components/ui";

const LOGS = [
  "/var/log/syslog",
  "/var/log/auth.log",
  "/var/log/kern.log",
  "/var/log/nginx/access.log",
  "/var/log/nginx/error.log",
  "/var/log/dpkg.log",
];

function lineTone(l: string): string | undefined {
  if (/\b(error|fail|failed|denied|refused|critical|fatal)\b/i.test(l)) return "var(--danger)";
  if (/\b(warn|warning|invalid)\b/i.test(l)) return "var(--warning)";
  if (/\b(accepted|success|started|listening)\b/i.test(l)) return "var(--success)";
  return undefined;
}

export default function EventsPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostId, setHostId] = useHostSelection();
  const [path, setPath] = useState(LOGS[1]);
  const [custom, setCustom] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const active = hostId ?? hosts.find((h) => h.status === "online")?.id ?? hosts[0]?.id ?? null;

  const tail = (id: string, p: string) => {
    setLoading(true);
    setErr("");
    api.logtail(id, p, 300).then((r) => setLines(r.lines)).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => {
    if (active) tail(active, custom || path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, path]);
  useEffect(() => {
    api.audit(300).then((r) => setAudit(r.events)).catch(() => {});
  }, []);

  const sev = lines.reduce(
    (a, l) => {
      const tone = lineTone(l);
      if (tone === "var(--danger)") a.error++;
      else if (tone === "var(--warning)") a.warn++;
      else if (tone === "var(--success)") a.ok++;
      else a.other++;
      return a;
    },
    { error: 0, warn: 0, ok: 0, other: 0 },
  );
  const sevTotal = Math.max(1, lines.length);

  // Гістограма подій застосунку за часом (30 бакетів)
  const buckets = (() => {
    if (audit.length < 2) return audit.length ? [audit.length] : [];
    const times = audit.map((e) => e.at);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const span = Math.max(1, max - min);
    const N = 30;
    const b = new Array(N).fill(0);
    for (const at of times) b[Math.min(N - 1, Math.floor(((at - min) / span) * N))]++;
    return b;
  })();
  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [lines]);

  if (hosts.length === 0) return <EmptyState icon={ScrollText} title={t("Немає хостів")} hint={t("Додай сервер, щоб дивитись його логи.")} />;

  return (
    <>
      <PageHeader eyebrow="SIEM" title={t("Події")} lede={t("Логи хоста та журнал подій застосунку в одному місці.")} />
      <HostBar hosts={hosts} value={active} onChange={setHostId} onRefresh={() => active && tail(active, custom || path)} loading={loading} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <SectionHeader
            icon={FileText}
            title={t("Перегляд логів")}
            sub={<span className="mono">{custom || path}</span>}
          />
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {LOGS.map((l) => (
              <GhostButton key={l} active={!custom && path === l} onClick={() => { setCustom(""); setPath(l); }}>
                <span className="mono text-[12px]">{l.replace("/var/log/", "")}</span>
              </GhostButton>
            ))}
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && active && tail(active, custom || path)}
              placeholder="/var/log/…"
              className="mono w-40 rounded-md border border-[var(--hairline)] bg-transparent px-2 py-1 text-[12.5px] outline-none focus:border-[var(--hairline-strong)]"
            />
          </div>
          {/* Зведення важливості логів */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-3 text-[12px] text-muted-foreground font-medium">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--danger)]" />{t("помилки")} {sev.error}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--warning)]" />{t("увага")} {sev.warn}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--success)]" />ok {sev.ok}</span>
              <span className="ml-auto">{lines.length} {t("рядків")}</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-[1px]">
              <div style={{ width: `${(sev.error / sevTotal) * 100}%`, background: "var(--danger)" }} />
              <div style={{ width: `${(sev.warn / sevTotal) * 100}%`, background: "var(--warning)" }} />
              <div style={{ width: `${(sev.ok / sevTotal) * 100}%`, background: "var(--success)" }} />
              <div style={{ width: `${(sev.other / sevTotal) * 100}%`, background: "var(--hairline-strong)" }} />
            </div>
          </div>
          {err ? (
            <div className="mono rounded-lg border border-[var(--danger)]/40 px-3 py-3 text-[13.5px] text-[var(--danger)]">{err}</div>
          ) : (
            <div className="mono h-[520px] overflow-auto rounded-lg border border-[var(--hairline)] bg-[var(--code-bg)] p-3 text-[13px] leading-relaxed">
              {lines.map((l, i) => (
                <div key={i} style={{ color: lineTone(l) }} className={lineTone(l) ? "" : "text-muted-foreground"}>{l || " "}</div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </Panel>

        <Panel>
          <SectionHeader icon={ScrollText} title={t("Події застосунку")} sub={t("Дії аналітика й авто-детекти")} />
          {buckets.length > 1 && (
            <div className="mb-4">
              <Histogram buckets={buckets} height={48} color="var(--primary)" />
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground font-medium">
                <span>{audit.length ? fmtWhen(Math.min(...audit.map((e) => e.at))) : ""}</span>
                <span>{t("зараз")}</span>
              </div>
            </div>
          )}
          {audit.length === 0 ? (
            <div className="py-6 text-center text-[14.5px] text-muted-foreground">{t("Поки тихо.")}</div>
          ) : (
            <ul className="space-y-2">
              {audit.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-2 border-b border-[var(--hairline)] pb-2 text-[13px] last:border-0">
                  <span className="mono min-w-0">
                    <span className={e.action.startsWith("incident.auto") ? "text-[var(--danger)]" : "text-foreground/85"}>{e.action}</span>
                    {e.target && <span className="ml-1 truncate text-muted-foreground">{e.target}</span>}
                  </span>
                  <span className="mono shrink-0 text-muted-foreground">{fmtWhen(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground font-medium">
            <Tag>SIEM</Tag> {t("логи хоста + журнал застосунку")}
          </div>
        </Panel>
      </div>
    </>
  );
}
