import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileKey2, KeyRound, Lock, ScanSearch, ShieldAlert, Trash2 } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { fmtWhen, type ExpectedKey, type HygieneFinding, type HygieneKey, type HygieneSeverity, type HygieneView } from "@/lib/types";
import { EmptyState, GhostButton, Kpi, PageHeader, Panel, Pill, PrimaryButton, SectionHeader } from "@/components/ui";

/** Локалізовані назви й поради за кодом знахідки. Невідомий код показує англійський текст з ядра. */
const FINDING: Record<string, { title: string; fix: string }> = {
  ROOT_LOGIN: { title: "Вхід root через SSH дозволено", fix: "Встанови «PermitRootLogin no» (або «prohibit-password», якщо потрібен вхід root за ключем) і перезавантаж sshd." },
  PASSWORD_AUTH: { title: "Увімкнено вхід за паролем", fix: "Переконайся, що вхід за ключем працює для всіх акаунтів, потім встанови «PasswordAuthentication no» і перезавантаж sshd." },
  EMPTY_PASSWORDS: { title: "Дозволено порожні паролі", fix: "Встанови «PermitEmptyPasswords no» і перезавантаж sshd." },
  MAX_AUTH_TRIES: { title: "Забагато спроб автентифікації (MaxAuthTries)", fix: "Зменш MaxAuthTries до 4 або менше." },
  X11_FORWARDING: { title: "Увімкнено X11-forwarding", fix: "Встанови «X11Forwarding no», якщо графічне перенаправлення не потрібне." },
  KEY_WEAK_RSA: { title: "RSA-ключ коротший за 2048 біт", fix: "Заміни на ключ Ed25519 (ssh-keygen -t ed25519) і видали цей." },
  KEY_DSA: { title: "Застарілий DSA-ключ", fix: "Заміни на ключ Ed25519 (ssh-keygen -t ed25519) і видали цей." },
  KEY_UNKNOWN: { title: "Ключа немає у списку очікуваних", fix: "З'ясуй, чий це ключ. Додай до списку очікуваних, якщо він легітимний, інакше видали." },
  KEY_WRONG_HOST: { title: "Ключ не дозволений на цьому хості", fix: "Видали ключ з цього хоста або розшир список дозволених хостів, якщо доступ потрібен." },
  KEY_SHARED_USERS: { title: "Один ключ в кількох акаунтах", fix: "Дай кожному акаунту власний ключ, щоб входи можна було приписати конкретній людині." },
  KEY_ON_MANY_HOSTS: { title: "Той самий ключ на кількох хостах", fix: "Для особистого адмін-ключа це нормально. Перевір, якщо ключ спільний сервісний чи для деплою." },
  KEY_STALE: { title: "Ключ давно не використовувався", fix: "Переконайся, що ключ ще потрібен, інакше видали. Відсутність у журналах — не доказ невикористання." },
  KEY_NO_COMMENT: { title: "Ключ без коментаря", fix: "Додай коментар із власником і призначенням." },
  AUTHKEYS_UNREADABLE: { title: "Не вдалося прочитати authorized_keys", fix: "Дай акаунту сканера право читання (або акаунт із sudo без пароля), або прийми прогалину." },
  SSHD_UNAVAILABLE: { title: "Не вдалося прочитати конфігурацію sshd", fix: "Скануй акаунтом, що може читати конфігурацію sshd (root або sudo без пароля), або прийми прогалину." },
  LOG_COVERAGE_SHORT: { title: "Історія журналів коротша за поріг застарілості", fix: "Зберігай журнали SSH довше (journald або logrotate), якщо хочеш виявляти застарілі ключі." },
  HOST_UNSCANNED: { title: "Хост не було перевірено", fix: "Перевір підключення до хоста й скануй ще раз." },
};

const SEV: Record<HygieneSeverity, { c: string; label: string }> = {
  critical: { c: "var(--danger)", label: "Критична" },
  high: { c: "var(--danger)", label: "Висока" },
  medium: { c: "var(--warning)", label: "Середня" },
  low: { c: "var(--info)", label: "Низька" },
  info: { c: "var(--text-disabled)", label: "Інфо" },
};
const SEV_ORDER: HygieneSeverity[] = ["critical", "high", "medium", "low", "info"];

const shortFp = (fp: string) => `${fp.slice(0, 17)}…`;
const daysAgo = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));

/** Колір значення налаштування: червоний — небезпечне, зелений — безпечне. */
function settingTone(key: string, v: string | undefined): string {
  if (v === undefined) return "var(--text-disabled)";
  if (key === "permitrootlogin") return v === "yes" ? "var(--danger)" : "var(--success)";
  if (key === "passwordauthentication") return v === "yes" ? "var(--danger)" : "var(--success)";
  if (key === "permitemptypasswords") return v === "yes" ? "var(--danger)" : "var(--success)";
  if (key === "maxauthtries") return Number(v) > 6 ? "var(--warning)" : "var(--success)";
  if (key === "x11forwarding") return v === "yes" ? "var(--warning)" : "var(--success)";
  return "var(--muted-foreground)";
}

export default function HygienePage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const { settings } = useSettings();
  const [view, setView] = useState<HygieneView | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<HygieneSeverity | "all">("all");
  const [mark, setMark] = useState<{ fp: string; owner: string; purpose: string } | null>(null);
  const [comments, setComments] = useState(false);

  const load = useCallback(() => {
    api.hygiene().then(setView).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const scan = () => {
    setLoading(true);
    setErr("");
    api
      .hygieneScan()
      .then(setView)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  const saveExpected = (expected: ExpectedKey[], staleDays?: number) => {
    setErr("");
    api
      .hygieneExpected(expected, staleDays)
      .then((v) => {
        setView(v);
        setMark(null);
      })
      .catch((e) => setErr(e.message));
  };

  const report = view?.report ?? null;
  const expectedMap = useMemo(() => new Map((view?.expected ?? []).map((e) => [e.fingerprint, e])), [view]);
  const findings = useMemo(() => (report?.findings ?? []).filter((f) => filter === "all" || f.severity === filter), [report, filter]);
  const keyRows = useMemo(() => (view?.hosts ?? []).flatMap((h) => h.keys.map((k) => ({ host: h.name, k }))), [view]);
  const urgent = (report?.by_severity.critical ?? 0) + (report?.by_severity.high ?? 0);
  const unknown = (report?.findings ?? []).filter((f) => f.code === "KEY_UNKNOWN").length;

  const text = (f: HygieneFinding) => FINDING[f.code] ?? { title: f.title, fix: f.suggestion };
  const exportHref = (format: string) => `/api/hygiene/export?format=${format}&comments=${comments ? 1 : 0}`;

  return (
    <>
      <PageHeader
        eyebrow={t("EDR · SSH")}
        title={t("SSH-гігієна парку")}
        lede={t("Ефективні налаштування sshd, ключі в authorized_keys, дублікати, невідомі та застарілі ключі. Лише читання: на серверах нічого не змінюється.")}
        action={
          <PrimaryButton onClick={scan} disabled={loading || hosts.length === 0 || view?.core === false}>
            <ScanSearch className="h-4 w-4" /> {loading ? t("Сканування…") : t("Сканувати парк")}
          </PrimaryButton>
        }
      />

      {err && <div className="mb-4 rounded-xl border border-[var(--danger)]/30 bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-4 py-3 text-[14px] text-[var(--danger)]">{err}</div>}

      {hosts.length === 0 ? (
        <EmptyState icon={KeyRound} title={t("Немає хостів")} hint={t("Додай сервери, щоб перевірити їхні SSH-налаштування й ключі.")} />
      ) : view && !view.core ? (
        <EmptyState icon={ShieldAlert} title={t("Потрібне Rust-ядро")} hint={t("SSH-гігієна працює лише з Rust-ядром. Збери його командою npm run build:core або встанови реліз.")} />
      ) : !report ? (
        <EmptyState icon={ScanSearch} title={t("Ще не скановано")} hint={t("Натисни «Сканувати парк». Усі команди лише читають дані.")} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label={t("Хостів перевірено")} value={`${report.hosts_scanned}/${report.hosts_total}`} icon={Lock} tone={report.hosts_scanned === report.hosts_total ? "ok" : "neutral"} sub={view?.scannedAt ? fmtWhen(view.scannedAt) : undefined} />
            <Kpi label={t("Ключів")} value={report.keys_total} icon={KeyRound} tone="neutral" sub={`${report.unique_keys} ${t("унікальних")}`} />
            <Kpi label={t("Критичні та високі")} value={urgent} icon={AlertTriangle} tone={urgent ? "critical" : "ok"} />
            <Kpi label={t("Невідомі ключі")} value={report.expected_declared ? unknown : "—"} icon={FileKey2} tone={unknown ? "critical" : "neutral"} sub={report.expected_declared ? undefined : t("список не задано")} />
          </div>

          <p className="-mt-2 mb-6 text-[13px] text-muted-foreground">
            {view && view.scanEveryHours > 0
              ? `${t("Автоматична перевірка кожні")} ${view.scanEveryHours} ${t("год")}. ${t("Новий ключ чи погіршення налаштувань стають інцидентами.")}`
              : t("Автоматична перевірка вимкнена. Увімкни її в Налаштуваннях.")}
          </p>

          <Panel className="mb-6">
            <SectionHeader
              icon={ShieldAlert}
              title={t("Знахідки")}
              right={
                <div className="flex flex-wrap gap-1.5">
                  {(["all", ...SEV_ORDER] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilter(s)}
                      className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${filter === s ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--hairline)] text-muted-foreground hover:bg-[var(--surface-2)]"}`}
                    >
                      {s === "all" ? t("Усі") : `${t(SEV[s].label)} · ${report.by_severity[s] ?? 0}`}
                    </button>
                  ))}
                </div>
              }
            />
            {findings.length === 0 ? (
              <div className="flex items-center gap-2 py-6 text-[14.5px] text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-[var(--success)]" /> {t("Усе гаразд — знахідок немає.")}
              </div>
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {findings.map((f, i) => {
                  const tx = text(f);
                  return (
                    <li key={`${f.code}-${f.host_id}-${f.fingerprint}-${f.user}-${i}`} className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill color={SEV[f.severity].c} dot>{t(SEV[f.severity].label)}</Pill>
                        <span className="text-[14.5px] font-medium">{t(tx.title)}</span>
                        {f.host_name && <span className="mono text-[12.5px] text-muted-foreground">{f.host_name}</span>}
                        {f.user && <span className="mono text-[12.5px] text-muted-foreground">{f.user}</span>}
                        {f.params.value && <span className="mono text-[12.5px] text-muted-foreground">{f.params.value}</span>}
                        {f.params.bits && <span className="mono text-[12.5px] text-muted-foreground">{f.params.bits} bit</span>}
                        {f.params.days && <span className="mono text-[12.5px] text-muted-foreground">{f.params.days} d</span>}
                        {f.fingerprint && <span className="mono text-[12.5px] text-muted-foreground" title={f.fingerprint}>{shortFp(f.fingerprint)}</span>}
                      </div>
                      {(f.params.users || f.params.hosts) && <div className="mono mt-1 text-[12.5px] text-muted-foreground">{[f.params.users, f.params.hosts].filter(Boolean).join(" · ")}</div>}
                      <p className="mt-1 text-[13.5px] text-muted-foreground">{t(tx.fix)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel className="mb-6">
            <SectionHeader icon={Lock} title={t("Налаштування sshd")} sub={t("Глобальні значення; блоки Match не враховуються")} />
            <div className="overflow-x-auto">
              <table className="data-table w-full text-left text-[14px]">
                <thead>
                  <tr className="border-b border-[var(--hairline)] text-[12.5px] text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">{t("Хост")}</th>
                    <th className="px-3 py-2.5 font-medium">PermitRootLogin</th>
                    <th className="px-3 py-2.5 font-medium">PasswordAuth</th>
                    <th className="px-3 py-2.5 font-medium">EmptyPasswords</th>
                    <th className="px-3 py-2.5 font-medium">MaxAuthTries</th>
                    <th className="px-3 py-2.5 font-medium">X11</th>
                    <th className="px-3 py-2.5 font-medium">{t("Джерело")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(view?.hosts ?? []).map((h) => (
                    <tr key={h.id} className="border-b border-[var(--hairline)] last:border-0">
                      <td className="mono px-3 py-2.5 text-[13px]">{h.name}</td>
                      {h.error ? (
                        <td colSpan={6} className="px-3 py-2.5 text-[13px] text-muted-foreground">{t("Хост не було перевірено")}: {h.error}</td>
                      ) : (
                        <>
                          {["permitrootlogin", "passwordauthentication", "permitemptypasswords", "maxauthtries", "x11forwarding"].map((k) => (
                            <td key={k} className="px-3 py-2.5">
                              <Pill color={settingTone(k, h.settings[k])}>
                                {h.settings[k] ?? "—"}
                                {h.defaulted.includes(k) ? " *" : ""}
                              </Pill>
                            </td>
                          ))}
                          <td className="mono px-3 py-2.5 text-[12.5px] text-muted-foreground">{h.sshd_source}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12.5px] text-muted-foreground">{t("* значення за замовчуванням OpenSSH: конфігурацію прочитано з файлу, а не через sshd -T")}</p>
          </Panel>

          <Panel className="mb-6">
            <SectionHeader icon={KeyRound} title={t("Ключі")} sub={`${keyRows.length}`} />
            {keyRows.length === 0 ? (
              <div className="py-6 text-center text-[14.5px] text-muted-foreground">{t("Немає даних")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table w-full text-left text-[14px]">
                  <thead>
                    <tr className="border-b border-[var(--hairline)] text-[12.5px] text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">{t("Хост")}</th>
                      <th className="px-3 py-2.5 font-medium">{t("Користувач")}</th>
                      <th className="px-3 py-2.5 font-medium">{t("Тип")}</th>
                      <th className="px-3 py-2.5 font-medium">{t("Відбиток")}</th>
                      <th className="px-3 py-2.5 font-medium">{t("Коментар")}</th>
                      <th className="px-3 py-2.5 font-medium">{t("Востаннє")}</th>
                      <th className="px-3 py-2.5 font-medium">{t("Очікуваний")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keyRows.map(({ host, k }: { host: string; k: HygieneKey }, i) => {
                      const exp = expectedMap.get(k.fingerprint);
                      return (
                        <tr key={`${host}-${k.user}-${k.fingerprint}-${i}`} className="border-b border-[var(--hairline)] last:border-0">
                          <td className="mono px-3 py-2.5 text-[13px]">{host}</td>
                          <td className="mono px-3 py-2.5 text-[13px]">{k.user}</td>
                          <td className="mono whitespace-nowrap px-3 py-2.5 text-[12.5px] text-muted-foreground">{k.key_type.replace("ssh-", "").replace("ecdsa-sha2-", "")}{k.bits ? ` ${k.bits}` : ""}</td>
                          <td className="mono px-3 py-2.5 text-[12.5px] text-muted-foreground" title={k.fingerprint}>{shortFp(k.fingerprint)}</td>
                          <td className="px-3 py-2.5 text-[13px] text-muted-foreground">{k.comment || "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-muted-foreground">
                            {k.last_used_ms ? `${daysAgo(k.last_used_ms)} d · ${k.uses}×` : t("ніколи")}
                          </td>
                          <td className="px-3 py-2.5">
                            {exp ? (
                              <Pill color="var(--success)" dot>{exp.owner || t("так")}</Pill>
                            ) : mark?.fp === k.fingerprint ? (
                              <span className="flex flex-wrap items-center gap-1.5">
                                <input
                                  autoFocus
                                  value={mark.owner}
                                  onChange={(e) => setMark({ ...mark, owner: e.target.value })}
                                  placeholder={t("Власник")}
                                  maxLength={80}
                                  className="w-28 rounded-lg border border-[var(--hairline)] bg-transparent px-2 py-1 text-[13px]"
                                />
                                <GhostButton onClick={() => saveExpected([...(view?.expected ?? []), { fingerprint: mark.fp, owner: mark.owner.trim(), purpose: mark.purpose, hosts: [] }], view?.staleDays)}>{t("Зберегти")}</GhostButton>
                                <GhostButton onClick={() => setMark(null)}>{t("Скасувати")}</GhostButton>
                              </span>
                            ) : (
                              <GhostButton onClick={() => setMark({ fp: k.fingerprint, owner: k.comment.split("@")[0] ?? "", purpose: "" })}>{t("Позначити очікуваним")}</GhostButton>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel>
              <SectionHeader icon={FileKey2} title={t("Очікувані ключі")} sub={`${view?.expected.length ?? 0}`} />
              {(view?.expected.length ?? 0) === 0 ? (
                <p className="py-2 text-[14px] text-muted-foreground">{t("Список порожній: перевірку «невідомий ключ» вимкнено. Познач ключі, які мають бути, і вона ввімкнеться.")}</p>
              ) : (
                <ul className="divide-y divide-[var(--hairline)]">
                  {view!.expected.map((e) => (
                    <li key={e.fingerprint} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-[14px] font-medium">{e.owner || "—"}{e.purpose ? ` · ${e.purpose}` : ""}</div>
                        <div className="mono truncate text-[12.5px] text-muted-foreground" title={e.fingerprint}>{e.fingerprint}</div>
                      </div>
                      <GhostButton onClick={() => saveExpected(view!.expected.filter((x) => x.fingerprint !== e.fingerprint), view?.staleDays)}>
                        <Trash2 className="h-4 w-4" />
                      </GhostButton>
                    </li>
                  ))}
                </ul>
              )}
              <label className="mt-4 flex items-center gap-3 text-[13.5px] text-muted-foreground">
                {t("Поріг застарілості, днів")}
                <input
                  type="number"
                  min={7}
                  max={3650}
                  defaultValue={view?.staleDays ?? 180}
                  key={view?.staleDays}
                  onBlur={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (n && n !== view?.staleDays) saveExpected(view?.expected ?? [], n);
                  }}
                  className="w-24 rounded-lg border border-[var(--hairline)] bg-transparent px-2 py-1 text-[13.5px]"
                />
              </label>
            </Panel>

            <Panel>
              <SectionHeader icon={Download} title={t("Експорт звіту")} sub={t("Лише читання; коментарі ключів за замовчуванням маскуються")} />
              <label className="mb-4 flex items-center gap-2 text-[13.5px] text-muted-foreground">
                <input type="checkbox" checked={comments} onChange={(e) => setComments(e.target.checked)} />
                {t("Включити коментарі ключів (можуть містити імена й email)")}
              </label>
              {settings.demo ? (
                <p className="text-[13.5px] text-muted-foreground">{t("Експорт доступний у робочому режимі, не в демо.")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(["md", "csv", "json"] as const).map((f) => (
                    <a key={f} href={exportHref(f)} download className="inline-flex items-center gap-2 rounded-xl border border-[var(--hairline)] px-4 py-2 text-[14px] font-medium transition-colors hover:bg-[var(--surface-2)]">
                      <Download className="h-4 w-4" /> {f.toUpperCase()}
                    </a>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
