import { useEffect, useState, type ReactNode } from "react";
import { EyeOff, Globe2, KeyRound, Lock, Network, RefreshCw, ShieldCheck, Fingerprint, ServerCog, CheckCircle2, AlertTriangle } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { NetworkConfig, ProxyType, SecurityStatus } from "@/lib/types";
import { GhostButton, Kpi, PageHeader, Panel, Pill, PrimaryButton, SectionHeader, StatusDot } from "@/components/ui";

const PRESETS: { label: string; hint: string; type: ProxyType; host: string; port: number }[] = [
  { label: "Tor", hint: "Tor Browser / tor service", type: "socks5", host: "127.0.0.1", port: 9050 },
  { label: "Tor Browser", hint: "127.0.0.1:9150", type: "socks5", host: "127.0.0.1", port: 9150 },
  { label: "SSH -D", hint: "ssh -D 1080 bastion", type: "socks5", host: "127.0.0.1", port: 1080 },
  { label: "HTTP proxy", hint: "corporate / VPN gateway", type: "http", host: "", port: 8080 },
];

export default function PrivacyPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [net, setNet] = useState<NetworkConfig | null>(null);
  const [form, setForm] = useState({ type: "none" as ProxyType, host: "", port: 1080, user: "", pass: "" });
  const [sec, setSec] = useState<SecurityStatus | null>(null);
  const [egress, setEgress] = useState<{ ip: string; viaProxy: boolean; ms: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    api.network().then((n) => {
      setNet(n);
      setForm({ type: n.proxy.type, host: n.proxy.host, port: n.proxy.port || 1080, user: n.proxy.user, pass: "" });
    }).catch(() => {});
    api.securityStatus().then(setSec).catch(() => {});
  };
  useEffect(load, [hosts.length]);

  const save = async (patch: Partial<NetworkConfig> = {}, withProxy = false) => {
    if (!net) return;
    setBusy(true);
    setMsg(null);
    try {
      const n = await api.setNetwork({ ...net, ...patch, proxy: withProxy ? form : { ...net.proxy } });
      setNet(n);
      setMsg({ ok: true, text: t("Збережено. SSH-зʼєднання перепідключаються через новий маршрут.") });
      api.securityStatus().then(setSec).catch(() => {});
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setEgress(null);
    setMsg(null);
    try {
      setEgress(await api.egress());
    } catch (e) {
      setMsg({ ok: false, text: `${t("Перевірка не вдалася")}: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (k: keyof NetworkConfig) => net && save({ [k]: !net[k] } as Partial<NetworkConfig>);
  const proxyOn = net && net.proxy.type !== "none";

  return (
    <>
      <PageHeader
        eyebrow={t("Система · Приватність")}
        title={t("Безпека та мережа")}
        lede={t("Маршрутизуй SSH і зовнішні запити через проксі, VPN-шлюз або Tor, щоб сервери не бачили IP твого ПК. Секрети зашифровано, ключі хостів закріплено.")}
        action={
          <GhostButton onClick={check} disabled={busy}>
            <Globe2 className="h-4 w-4" /> {t("Який IP бачать сервери?")}
          </GhostButton>
        }
      />

      {msg && (
        <div className={`fade-in mb-5 flex items-center gap-2 rounded-xl px-4 py-3 text-[14.5px] ${msg.ok ? "bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-[var(--success)]" : "bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-[var(--danger)]"}`}>
          {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}
        </div>
      )}
      {egress && (
        <div className="fade-in mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-[var(--surface-raised)] px-4 py-3 text-[14.5px]">
          <EyeOff className="h-4 w-4 text-[var(--primary)]" />
          {t("Зовнішні сервіси бачать IP")} <span className="mono font-semibold">{egress.ip}</span>
          <Pill color={egress.viaProxy ? "var(--success)" : "var(--warning)"} dot>{egress.viaProxy ? t("через проксі") : t("напряму")}</Pill>
          <span className="num text-muted-foreground">{egress.ms} ms</span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label={t("Маршрут")} value={<span className="text-[26px]">{proxyOn ? net!.proxy.type.toUpperCase() : t("Напряму")}</span>} icon={Network} tone={proxyOn ? "ok" : "neutral"} sub={proxyOn ? `${net!.proxy.host}:${net!.proxy.port}` : t("IP ПК видно серверам")} />
        <Kpi label={t("Секрети")} value={<span className="text-[26px]">AES-256</span>} icon={Lock} tone="ok" sub={sec ? keySourceLabel(sec.vault.keySource, t) : "—"} />
        <Kpi label={t("Закріплені ключі")} value={sec ? `${sec.pinnedHosts}/${sec.totalHosts}` : "—"} icon={Fingerprint} tone={sec && sec.pinnedHosts === sec.totalHosts ? "ok" : "info"} sub={t("захист від MITM")} />
        <Kpi label={t("Веб-доступ")} value={<span className="text-[26px]">{sec?.tls ? "HTTPS" : "HTTP"}</span>} icon={ShieldCheck} tone={sec?.tls || !sec?.auth ? "ok" : "warning"} sub={sec?.auth ? t("токен увімкнено") : t("лише локально")} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title={<Title icon={EyeOff}>{t("Проксі · VPN · Tor")}</Title>}>
          <div className="mb-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <GhostButton key={p.label} active={form.type === p.type && form.host === p.host && form.port === p.port} onClick={() => setForm({ ...form, type: p.type, host: p.host, port: p.port })}>
                {p.label} <span className="text-[12px] opacity-60">{p.hint}</span>
              </GhostButton>
            ))}
            <GhostButton active={form.type === "none"} onClick={() => setForm({ ...form, type: "none" })}>
              {t("Без проксі")}
            </GhostButton>
          </div>
          {form.type !== "none" && (
            <div className="grid gap-3 sm:grid-cols-[140px_1fr_110px]">
              <Field label={t("Тип")}>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ProxyType })} className={inputCls}>
                  <option value="socks5">SOCKS5</option>
                  <option value="http">HTTP CONNECT</option>
                </select>
              </Field>
              <Field label={t("Адреса")}>
                <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="127.0.0.1" className={inputCls} />
              </Field>
              <Field label={t("Порт")}>
                <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 0 })} className={inputCls} />
              </Field>
              <Field label={t("Користувач (необовʼязково)")}>
                <input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} className={inputCls} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={net?.proxy.hasPass ? t("Пароль (збережено, залиш порожнім)") : t("Пароль")}>
                  <input type="password" value={form.pass} onChange={(e) => setForm({ ...form, pass: e.target.value })} className={inputCls} />
                </Field>
              </div>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <PrimaryButton onClick={() => save({}, true)} disabled={busy}>
              {t("Застосувати маршрут")}
            </PrimaryButton>
            <GhostButton onClick={check} disabled={busy}>
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> {t("Перевірити")}
            </GhostButton>
          </div>
          <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">
            {t("Повна приватність: увімкни системний VPN або Tor, обери пресет і залиш kill switch увімкненим — тоді жодне зʼєднання не піде напряму, навіть якщо проксі впаде. Окремий проксі або бастіон можна задати кожному хосту.")}
          </p>
        </Panel>

        <Panel title={<Title icon={ShieldCheck}>{t("Захист тунелів")}</Title>}>
          {net && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle on={net.killSwitch} onChange={() => toggle("killSwitch")} label={t("Kill switch")} desc={t("Якщо проксі недоступний — не підключатися напряму.")} />
              <Toggle on={net.remoteDns} onChange={() => toggle("remoteDns")} label={t("DNS через проксі")} desc={t("Імена резолвить проксі — без DNS-витоку з ПК.")} />
              <Toggle on={net.applySsh} onChange={() => toggle("applySsh")} label={t("SSH через проксі")} desc={t("Усі сесії до серверів ідуть маршрутом вище.")} />
              <Toggle on={net.applyOutbound} onChange={() => toggle("applyOutbound")} label={t("Зовнішні запити через проксі")} desc={t("Гео-IP, аптайм, інтеграції — теж приховано.")} />
              <Toggle on={net.hardenedCrypto} onChange={() => toggle("hardenedCrypto")} label={t("Сучасна SSH-криптографія")} desc="curve25519 · chacha20-poly1305 · AES-GCM · ETM" />
              <Toggle on={net.strictHostKeys} onChange={() => toggle("strictHostKeys")} label={t("Суворі ключі хостів")} desc={t("Блокувати зʼєднання, якщо ключ сервера змінився.")} />
            </div>
          )}
        </Panel>

        <Panel title={<Title icon={Fingerprint}>{t("Закріплені ключі хостів")}</Title>} className="xl:col-span-2">
          {hosts.length === 0 ? (
            <div className="py-6 text-center text-[14.5px] text-muted-foreground">{t("Ще немає хостів.")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full text-left text-[14px]">
                <thead>
                  <tr className="border-b border-[var(--hairline)] text-[12.5px] text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">{t("Хост")}</th>
                    <th className="px-3 py-2.5 font-medium">{t("Маршрут")}</th>
                    <th className="px-3 py-2.5 font-medium">{t("Відбиток ключа (SHA-256)")}</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {hosts.map((h) => (
                    <tr key={h.id} className="border-b border-[var(--hairline)] last:border-0">
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <StatusDot status={h.status} /> <span className="font-medium">{h.name}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-muted-foreground">
                        {h.jumpHostId ? `${t("бастіон")} → ${hosts.find((x) => x.id === h.jumpHostId)?.name ?? "?"}` : h.proxy && h.proxy.type !== "none" ? `${h.proxy.type}://${h.proxy.host}:${h.proxy.port}` : proxyOn ? t("глобальний проксі") : t("напряму")}
                      </td>
                      <td className="mono px-3 py-2.5 text-[12.5px]">{h.hostKey || <span className="text-muted-foreground">{t("ще не отримано")}</span>}</td>
                      <td className="px-3 py-2.5 text-right">
                        {h.hostKey && (
                          <GhostButton
                            onClick={() => {
                              if (confirm(t("Скинути закріплений ключ? Наступне підключення запамʼятає новий ключ сервера."))) api.resetHostKey(h.id).then(load);
                            }}
                          >
                            <KeyRound className="h-4 w-4" /> {t("Скинути")}
                          </GhostButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={<Title icon={Lock}>{t("Шифрування даних")}</Title>} className="xl:col-span-2">
          <div className="grid gap-4 md:grid-cols-3">
            <Info icon={Lock} title={t("Секрети на диску")} text={t("Паролі SSH, passphrase, паролі БД, проксі та токени інтеграцій шифруються AES-256-GCM. Ключ")} strong={sec ? keySourceLabel(sec.vault.keySource, t) : "…"} />
            <Info icon={ServerCog} title={t("Тунелі до серверів")} text={t("SSH з сучасними алгоритмами; бази даних — лише через SSH-тунель, порти БД назовні не відкриваються.")} strong={net?.hardenedCrypto ? "chacha20 / AES-GCM" : t("сумісний режим")} />
            <Info icon={ShieldCheck} title={t("Веб-доступ")} text={t("HTTPS через LEMONSEES_TLS=self або власний сертифікат, вхід за токеном, HttpOnly-сесії, HSTS.")} strong={sec?.tls ? "HTTPS" : t("локально (HTTP)")} />
          </div>
        </Panel>
      </div>
    </>
  );
}

const inputCls = "h-10 w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] px-3 text-[14.5px] outline-none focus:border-[var(--primary)]";

function keySourceLabel(k: string, t: (s: string) => string) {
  return k === "os-keychain" ? t("захищено сховищем ОС") : k === "passphrase" ? t("з майстер-пароля") : t("локальний файл-ключ");
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[13px] font-medium text-foreground/80">{label}</div>
      {children}
    </label>
  );
}

function Title({ icon: Icon, children }: { icon: typeof Lock; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <Icon className="h-[18px] w-[18px] text-[var(--primary)]" /> {children}
    </span>
  );
}

function Info({ icon: Icon, title, text, strong }: { icon: typeof Lock; title: string; text: string; strong: string }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-raised)] p-4">
      <div className="mb-1.5 flex items-center gap-2 text-[14.5px] font-semibold">
        <Icon className="h-4 w-4 text-[var(--primary)]" /> {title}
      </div>
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        {text} <span className="font-medium text-foreground">{strong}</span>
      </p>
    </div>
  );
}

function Toggle({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onChange} className="flex w-full items-start justify-between gap-4 rounded-2xl border border-[var(--hairline)] p-4 text-left transition-colors hover:border-[var(--hairline-strong)]">
      <span>
        <span className="block text-[14.5px] font-medium">{label}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{desc}</span>
      </span>
      <span className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--primary)]" : "bg-[var(--hairline-strong)]"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${on ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
