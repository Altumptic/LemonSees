import { useEffect, useState } from "react";
import { Plug, Plus, Send, Trash2, Pencil, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, XCircle } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useIntent } from "@/lib/intent";
import { fmtWhen, type Integration, type IntegrationCatalog, type IntegrationType } from "@/lib/types";
import { EmptyState, GhostButton, IconBtn, Kpi, Modal, PageHeader, Panel, Pill, PrimaryButton, SectionHeader } from "@/components/ui";

const ACCENT: Record<IntegrationType, string> = {
  datadog: "#632CA6",
  slack: "#4A154B",
  teams: "#4B53BC",
  telegram: "#229ED9",
  webhook: "#56688c",
  splunk: "#65A637",
  elastic: "#00A9A5",
  syslog: "#6b6963",
  pagerduty: "#06AC38",
  wazuh: "#3595F9",
};

const FIELD_LABEL: Record<string, string> = {
  site: "Сайт Datadog (datadoghq.com, datadoghq.eu, us5.datadoghq.com…)",
  apiKey: "API key",
  tags: "Теги (через кому)",
  webhookUrl: "Webhook URL",
  token: "Токен",
  chatId: "Chat ID",
  url: "URL",
  secret: "Секрет / пароль",
  index: "Індекс",
  insecure: "Дозволити самопідписаний сертифікат",
  host: "Хост",
  port: "Порт",
  protocol: "Протокол (udp / tcp / tls)",
  routingKey: "Routing key (Events v2)",
  apiUrl: "Wazuh API (https://manager:55000)",
  user: "Користувач API",
  password: "Пароль API",
  indexerUrl: "Wazuh indexer (https://indexer:9200), необовʼязково",
  indexerUser: "Користувач індексера",
  minLevel: "Мінімальний рівень правила (1–15)",
};

const DESC: Record<IntegrationType, string> = {
  datadog: "Події та логи в Datadog Events і Logs.",
  slack: "Повідомлення в канал через Incoming Webhook.",
  teams: "Картки в канал Microsoft Teams.",
  telegram: "Повідомлення від бота в чат чи групу.",
  webhook: "JSON POST із підписом HMAC-SHA256.",
  splunk: "HTTP Event Collector.",
  elastic: "Документи в індекс Elasticsearch / OpenSearch.",
  syslog: "CEF-повідомлення на SIEM-колектор.",
  pagerduty: "Виклик чергового через Events API v2.",
  wazuh: "Імпорт агентів і тривог із наявного Wazuh.",
};

const SEVS = ["critical", "high", "medium", "low", "info"] as const;
const SEV_TXT: Record<string, string> = { critical: "критичний", high: "високий", medium: "середній", low: "низький", info: "інфо" };

export function IntegrationBadge({ type, size = 40 }: { type: IntegrationType; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-xl text-[15px] font-semibold text-white" style={{ width: size, height: size, background: ACCENT[type] }}>
      {type === "pagerduty" ? "PD" : type === "webhook" ? "{}" : type[0].toUpperCase()}
    </span>
  );
}

export default function IntegrationsPage() {
  const { demo } = useAppState();
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<IntegrationCatalog | null>(null);
  const [list, setList] = useState<Integration[]>([]);
  const [edit, setEdit] = useState<Partial<Integration> | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = () =>
    api.integrations().then((r) => {
      setCatalog(r.catalog);
      setList(r.integrations);
    }).catch(() => {});
  useEffect(() => {
    load();
  }, [demo]);
  useIntent("new", () => setEdit({ type: "slack" }));

  const test = async (i: Integration) => {
    setTesting(i.id);
    setNote(null);
    try {
      const r = await api.testIntegration(i.id);
      setNote({ id: i.id, ok: true, text: r.agents !== undefined ? `${t("Підключено")}: ${r.agents} ${t("агентів")}, ${r.alerts} ${t("тривог")}` : `${t("Тестову подію доставлено")} · ${r.ms} ms` });
    } catch (e) {
      setNote({ id: i.id, ok: false, text: (e as Error).message });
    } finally {
      setTesting(null);
      load();
    }
  };

  const outCount = list.filter((i) => catalog?.[i.type]?.dir === "out" && i.enabled).length;
  const inCount = list.filter((i) => catalog?.[i.type]?.dir === "in" && i.enabled).length;
  const failing = list.filter((i) => i.lastStatus && !i.lastStatus.ok).length;

  return (
    <>
      <PageHeader
        eyebrow={t("Система · Екосистема")}
        title={t("Інтеграції")}
        lede={t("LemonSees повністю працює автономно. Інтеграції — за бажанням: надсилай тривоги в Datadog, Slack чи SIEM, або підтягуй агентів і тривоги з наявного Wazuh.")}
        action={
          <PrimaryButton onClick={() => setEdit({ type: "slack" })}>
            <Plus className="h-4 w-4" /> {t("Додати інтеграцію")}
          </PrimaryButton>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label={t("Вихідні")} value={outCount} icon={ArrowUpFromLine} tone="neutral" sub={t("куди йдуть тривоги")} />
        <Kpi label={t("Вхідні")} value={inCount} icon={ArrowDownToLine} tone="neutral" sub="Wazuh" />
        <Kpi label={t("З помилкою")} value={failing} icon={XCircle} tone={failing ? "critical" : "ok"} />
        <Kpi label={t("Доступно")} value={catalog ? Object.keys(catalog).length : "—"} icon={Plug} tone="neutral" sub={t("типів інтеграцій")} />
      </div>

      <Panel className="mb-6">
        <SectionHeader icon={Plug} title={t("Підключені")} />
        {list.length === 0 ? (
          <EmptyState icon={Plug} title={t("Ще немає інтеграцій")} hint={t("Обери систему з каталогу нижче. Усі секрети шифруються на диску.")} />
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {list.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-4 py-3.5">
                <IntegrationBadge type={i.type} />
                <div className="min-w-[200px] flex-1">
                  <div className="flex items-center gap-2 text-[15px] font-medium">
                    {i.name}
                    {!i.enabled && <Pill color="var(--text-disabled)">{t("вимкнено")}</Pill>}
                    <Pill color="var(--c2)">{catalog?.[i.type]?.dir === "in" ? t("вхідна") : t("вихідна")}</Pill>
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    {catalog?.[i.type]?.dir === "out" ? `${t("від рівня")} «${t(SEV_TXT[i.minSeverity])}» · ${i.events.join(", ")}` : DESC[i.type] && t(DESC[i.type])}
                  </div>
                  {note?.id === i.id ? (
                    <div className={`mt-1 text-[13px] ${note.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{note.text}</div>
                  ) : (
                    i.lastStatus && (
                      <div className={`mt-1 inline-flex items-center gap-1.5 text-[12.5px] ${i.lastStatus.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                        {i.lastStatus.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {i.lastStatus.ok ? i.lastStatus.info || t("доставлено") : i.lastStatus.error} · {fmtWhen(i.lastStatus.at)}
                      </div>
                    )
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <GhostButton onClick={() => test(i)} disabled={testing === i.id}>
                    <Send className="h-4 w-4" /> {testing === i.id ? t("Перевіряю…") : t("Тест")}
                  </GhostButton>
                  <IconBtn title={t("Редагувати")} onClick={() => setEdit(i)}>
                    <Pencil className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn
                    title={t("Видалити")}
                    danger
                    onClick={() => {
                      if (confirm(t("Видалити інтеграцію?"))) api.deleteIntegration(i.id).then(load);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <SectionHeader icon={Plus} title={t("Каталог")} sub={t("Натисни, щоб підключити")} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {catalog &&
          (Object.keys(catalog) as IntegrationType[]).map((type) => (
            <button key={type} onClick={() => setEdit({ type })} className="glass flex flex-col gap-3 rounded-2xl p-5 text-left transition-colors hover:border-[var(--hairline-strong)]">
              <IntegrationBadge type={type} />
              <div>
                <div className="text-[15px] font-semibold">{catalog[type].label}</div>
                <div className="mt-1 text-[13px] leading-snug text-muted-foreground">{t(DESC[type])}</div>
              </div>
            </button>
          ))}
      </div>

      {edit && catalog && <IntegrationForm initial={edit} catalog={catalog} onClose={(changed) => (setEdit(null), changed && load())} />}
    </>
  );
}

function IntegrationForm({ initial, catalog, onClose }: { initial: Partial<Integration>; catalog: IntegrationCatalog; onClose: (changed: boolean) => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<Partial<Integration>>({ enabled: true, minSeverity: "high", events: ["incident", "downtime", "fim"], config: {}, ...initial });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = catalog[f.type as IntegrationType];
  const cfg = (k: string) => f.config?.[k] ?? "";
  const setCfg = (k: string, v: string | boolean) => setF({ ...f, config: { ...(f.config || {}), [k]: v } });
  const secret = (k: string) => ["apiKey", "token", "password", "secret", "webhookUrl", "routingKey"].includes(k);

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      if (f.id) await api.updateIntegration(f.id, f);
      else await api.addIntegration(f);
      onClose(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={f.id ? t("Редагувати інтеграцію") : t("Нова інтеграція")} onClose={() => onClose(false)} wide>
      <div className="space-y-4">
        {!f.id && (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(catalog) as IntegrationType[]).map((type) => (
              <GhostButton key={type} active={f.type === type} onClick={() => setF({ ...f, type, config: {} })}>
                {catalog[type].label}
              </GhostButton>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <div className="mb-1.5 text-[13.5px] font-medium">{t("Назва")}</div>
            <input value={f.name ?? ""} placeholder={meta?.label} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
          </label>
          {meta?.fields.map((k) =>
            k === "insecure" ? (
              <label key={k} className="flex items-center gap-2 text-[14px] sm:col-span-2">
                <input type="checkbox" checked={!!cfg(k)} onChange={(e) => setCfg(k, e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                {t(FIELD_LABEL[k])}
              </label>
            ) : (
              <label key={k} className="block">
                <div className="mb-1.5 text-[13.5px] font-medium">{t(FIELD_LABEL[k] ?? k)}</div>
                <input
                  type={secret(k) ? "password" : "text"}
                  value={String(cfg(k) === "••••••" ? "" : cfg(k))}
                  placeholder={cfg(k) === "••••••" ? t("збережено — залиш порожнім") : ""}
                  onChange={(e) => setCfg(k, e.target.value)}
                  className={inputCls}
                />
              </label>
            ),
          )}
        </div>
        {meta?.dir === "out" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[13.5px] font-medium">{t("Надсилати від рівня")}</div>
              <div className="flex flex-wrap gap-1.5">
                {SEVS.map((s) => (
                  <GhostButton key={s} active={f.minSeverity === s} onClick={() => setF({ ...f, minSeverity: s })}>
                    {t(SEV_TXT[s])}
                  </GhostButton>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[13.5px] font-medium">{t("Події")}</div>
              <div className="flex flex-wrap gap-1.5">
                {(["incident", "downtime", "fim"] as const).map((ev) => {
                  const on = f.events?.includes(ev);
                  return (
                    <GhostButton key={ev} active={on} onClick={() => setF({ ...f, events: on ? f.events!.filter((x) => x !== ev) : [...(f.events || []), ev] })}>
                      {ev === "incident" ? t("Інциденти") : ev === "downtime" ? t("Даунтайм") : "FIM"}
                    </GhostButton>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={f.enabled !== false} onChange={(e) => setF({ ...f, enabled: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
          {t("Увімкнено")}
        </label>
        {err && <div className="text-[14px] text-[var(--danger)]">{err}</div>}
        <div className="flex justify-end gap-2">
          <GhostButton onClick={() => onClose(false)}>{t("Скасувати")}</GhostButton>
          <PrimaryButton onClick={submit} disabled={busy}>
            {t("Зберегти")}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

const inputCls = "h-10 w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] px-3 text-[14.5px] outline-none focus:border-[var(--primary)]";
