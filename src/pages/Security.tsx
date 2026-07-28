import { useEffect, useState } from "react";
import {
  Shield,
  ShieldAlert,
  Flame,
  RefreshCw,
  KeyRound,
  Users,
  Network,
  PackageOpen,
  Lock,
  Terminal as TermIcon,
} from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtWhen, type SecurityPosture } from "@/lib/types";
import {
  PageHeader,
  Panel,
  GhostButton,
  ScoreRing,
  Kpi,
  Pill,
  SectionHeader,
  EmptyState,
  riskTone,
  toneColor,
  StatusDot,
} from "@/components/ui";

export default function SecurityPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostId, setHostId] = useState<string | null>(null);
  const [data, setData] = useState<SecurityPosture | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const online = hosts.filter((h) => h.status === "online");
  const active = hostId ?? online[0]?.id ?? hosts[0]?.id ?? null;
  const host = hosts.find((h) => h.id === active) ?? null;

  const scan = (id: string) => {
    setLoading(true);
    setErr("");
    setData(null);
    api
      .security(id)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (active) scan(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (hosts.length === 0) {
    return (
      <>
        <PageHeader eyebrow={t("SOC")} title={t("Безпека")} lede={t("Постура безпеки хостів: порти, сесії, firewall, SSH-хардненг.")} />
        <EmptyState icon={Shield} title={t("Немає хостів")} hint={t("Додай сервер на сторінці «Хости», щоб оцінити його безпеку.")} />
      </>
    );
  }

  const riskColor = data ? toneColor(riskTone(data.risk)) : "var(--muted-foreground)";

  return (
    <>
      <PageHeader
        eyebrow={t("SOC · Постура")}
        title={t("Безпека")}
        lede={t("Реальна оцінка стану хоста по SSH. Нічого не встановлюється на сервер.")}
        action={
          <div className="flex items-center gap-2">
            <select
              value={active ?? ""}
              onChange={(e) => setHostId(e.target.value)}
              className="mono rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-xs outline-none focus:border-[var(--hairline-strong)]"
            >
              {hosts.map((h) => (
                <option key={h.id} value={h.id} className="bg-[var(--ink)]">
                  {h.name}
                </option>
              ))}
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
        <Panel><div className="py-16 text-center text-sm text-muted-foreground">{t("Оцінюю постуру безпеки…")}</div></Panel>
      ) : err ? (
        <Panel><div className="mono py-10 text-center text-sm text-[var(--danger)]">{err}</div></Panel>
      ) : data ? (
        <div className="space-y-6">
          {/* Ризик + KPI */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
            <Panel>
              <div className="flex items-center gap-5">
                <ScoreRing value={data.risk} size={104} color={riskColor} label={t("ризик")} suffix="" />
                <div>
                  <div className="eyebrow mb-1">{t("Рівень ризику")}</div>
                  <div className="text-xl font-medium capitalize" style={{ color: riskColor }}>
                    {t(gradeLabel(data.grade))}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {data.findings.length} {t("знахідок")} · {fmtWhen(data.at)}
                  </div>
                </div>
              </div>
            </Panel>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Kpi label={t("Публічні порти")} value={data.publicPortCount} icon={Network} tone={data.publicPortCount > 3 ? "warning" : "neutral"} sub={`${data.ports.length} ${t("всього")}`} />
              <Kpi label={t("Невдалі логіни")} value={data.failedLogins} icon={ShieldAlert} tone={data.failedLogins > 50 ? "warning" : "neutral"} sub={t("за 24 год")} />
              <Kpi label={t("Оновлення")} value={data.updates} icon={PackageOpen} tone={data.updates > 30 ? "warning" : data.updates > 0 ? "info" : "ok"} sub={t("очікують")} />
              <Kpi label="Firewall" value={data.firewall.active ? t("активний") : t("вимкнено")} icon={Flame} tone={data.firewall.active ? "ok" : "warning"} sub={data.firewall.tool} />
              <Kpi label={t("Сесії")} value={data.sessions.length} icon={Users} tone="neutral" sub={t("активних зараз")} />
              <Kpi label="SUID" value={data.suid} icon={Lock} tone="neutral" sub={t("бінарників")} />
            </div>
          </div>

          {/* Знахідки */}
          <Panel>
            <SectionHeader icon={ShieldAlert} title={t("Знахідки")} sub={t("Рекомендації з підсилення захисту")} />
            {data.findings.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t("Проблем не виявлено. Хост у гарному стані.")}</div>
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {data.findings.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <Pill color={f.severity === "critical" ? "var(--danger)" : f.severity === "warning" ? "var(--warning)" : "var(--muted-foreground)"}>
                      {t(f.severity === "critical" ? "критично" : f.severity === "warning" ? "увага" : "інфо")}
                    </Pill>
                    <span className="text-sm">{f.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* SSH hardening */}
            <Panel>
              <SectionHeader icon={KeyRound} title={t("SSH-хардненг")} />
              <dl className="mono grid grid-cols-1 gap-y-2 text-[12px]">
                <SshRow k="PermitRootLogin" v={data.ssh.rootLogin} good={["no", "prohibit-password"].includes(data.ssh.rootLogin)} />
                <SshRow k="PasswordAuthentication" v={data.ssh.passwordAuth} good={data.ssh.passwordAuth === "no"} />
                <SshRow k="PermitEmptyPasswords" v={data.ssh.emptyPasswords} good={data.ssh.emptyPasswords === "no"} />
                <SshRow k="X11Forwarding" v={data.ssh.x11} good={data.ssh.x11 === "no"} />
                <SshRow k="fail2ban" v={data.fail2ban ? "active" : "inactive"} good={data.fail2ban} />
              </dl>
            </Panel>

            {/* Порти */}
            <Panel>
              <SectionHeader icon={Network} title={t("Слухаючі порти")} right={<span className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{data.ports.length}</span>} />
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-left text-[12px]">
                  <tbody>
                    {data.ports.map((p, i) => (
                      <tr key={i} className="border-b border-[var(--hairline)] last:border-0">
                        <td className="num py-1.5 pr-2 font-medium">{p.port}</td>
                        <td className="mono py-1.5 pr-2 text-muted-foreground">{p.proto}</td>
                        <td className="mono py-1.5 text-muted-foreground">{p.addr}</td>
                        <td className="py-1.5 text-right">
                          {p.public ? <Pill color="var(--warning)">{t("публічний")}</Pill> : <Pill color="var(--muted-foreground)">{t("локальний")}</Pill>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            {/* Сесії */}
            <Panel>
              <SectionHeader icon={Users} title={t("Активні сесії")} />
              {data.sessions.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">{t("Немає активних сесій")}</div>
              ) : (
                <ul className="divide-y divide-[var(--hairline)]">
                  {data.sessions.map((s, i) => (
                    <li key={i} className="mono flex items-center justify-between py-2 text-[12px]">
                      <span className="flex items-center gap-2"><TermIcon className="h-3 w-3 text-muted-foreground" />{s.user}</span>
                      <span className="text-muted-foreground">{s.tty} · {s.from}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Останні входи */}
            <Panel>
              <SectionHeader icon={KeyRound} title={t("Останні входи")} />
              {data.lastLogins.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">{t("Немає даних")}</div>
              ) : (
                <ul className="space-y-1">
                  {data.lastLogins.map((l, i) => (
                    <li key={i} className="mono truncate text-[11px] text-muted-foreground">{l}</li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      ) : null}
    </>
  );
}

function gradeLabel(g: string) {
  return g === "critical" ? "Критичний" : g === "warning" ? "Підвищений" : g === "info" ? "Помірний" : "Низький";
}

function SshRow({ k, v, good }: { k: string; v: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--hairline)] py-1.5 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="flex items-center gap-2">
        <span className={good ? "text-[var(--success)]" : "text-[var(--warning)]"}>{v || "—"}</span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: good ? "var(--success)" : "var(--warning)" }} />
      </dd>
    </div>
  );
}
