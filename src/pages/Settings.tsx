import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Languages,
  Palette,
  SlidersHorizontal,
  RotateCcw,
  ShieldAlert,
  Bell,
  FlaskConical,
  DatabaseBackup,
  Info,
  Download,
  Upload,
  ExternalLink,
  KeyRound,
  Timer,
} from "lucide-react";
import { PageHeader, Panel, GhostButton, PrimaryButton } from "@/components/ui";
import { BrandMark } from "@/components/Brand";
import { useSettings, isElectron, DEFAULTS, type AppSettings, type Lang, type ThemeId } from "@/lib/settings";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useIntent } from "@/lib/intent";
import type { SocConfig } from "@/lib/types";

const LANGS: ReadonlyArray<readonly [Lang, string]> = [
  ["uk", "Українська"],
  ["en", "English"],
  ["ru", "Русский"],
  ["pl", "Polski"],
  ["zh", "中文"],
];

const THEMES: ReadonlyArray<{ id: ThemeId; label: string; swatch: string; bg: string; card: string; fg: string }> = [
  { id: "light", label: "Кремова", swatch: "#c15f3c", bg: "#f0eee6", card: "#fffefb", fg: "#1f1e1d" },
  { id: "dark", label: "Графітова", swatch: "#d97757", bg: "#1a1917", card: "#262624", fg: "#ecebe4" },
];

const SCALES: ReadonlyArray<readonly [number, string]> = [
  [95, "Компактний"],
  [110, "Комфортний"],
  [125, "Великий"],
  [140, "Дуже великий"],
];

const REFRESH: ReadonlyArray<readonly [number, string]> = [
  [0, "Вручну"],
  [30, "30 с"],
  [60, "1 хв"],
  [300, "5 хв"],
];

export default function SettingsPage() {
  const { settings, set, reset } = useSettings();
  const { t } = useI18n();
  const [soc, setSoc] = useState<SocConfig>({ autoIncidents: true, bruteThreshold: 300, notifyDowntime: true, retentionDays: 90, sweepMinutes: 5 });
  const [info, setInfo] = useState<{ version: string; auth: boolean; platform: string; web: boolean } | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const [msg, setMsg] = useState("");
  const aboutRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getSoc().then((s) => setSoc((p) => ({ ...p, ...s }))).catch(() => {});
    api.info().then(setInfo).catch(() => {});
  }, [settings.demo]);

  useIntent("about", () => setTimeout(() => aboutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120));

  const updateSoc = (patch: Partial<SocConfig>) => {
    const next = { ...soc, ...patch };
    setSoc(next);
    api.setSoc(next).then((s) => setSoc((p) => ({ ...p, ...s }))).catch(() => {});
  };

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 3500);
  };

  const exportBackup = async () => {
    const [incidents, monitors, socCfg] = await Promise.all([api.listIncidents().catch(() => []), api.listMonitors().catch(() => []), api.getSoc().catch(() => soc)]);
    const payload = { app: "LemonSees", vendor: "Altumptic", version: info?.version ?? "", exportedAt: new Date().toISOString(), settings, soc: socCfg, incidents, monitors };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lemonsees-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash(t("Резервну копію збережено. Паролі та ключі в неї не потрапляють."));
  };

  const importSettings = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (data.settings) {
        const allowed = Object.keys(DEFAULTS) as (keyof AppSettings)[];
        const patch: Partial<AppSettings> = {};
        for (const k of allowed) if (k in data.settings && k !== "hostId") (patch as Record<string, unknown>)[k] = data.settings[k];
        set(patch);
      }
      if (data.soc) updateSoc(data.soc);
      flash(t("Налаштування імпортовано."));
    } catch {
      flash(t("Не вдалося прочитати файл резервної копії."));
    }
  };

  const askNotify = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") new Notification("LemonSees", { body: t("Сповіщення увімкнено."), icon: "/logo.svg" });
  };

  return (
    <>
      <PageHeader
        eyebrow={t("Застосунок")}
        title={t("Налаштування")}
        lede={t("Вигляд, поведінка й параметри SOC-двигуна. Налаштування інтерфейсу зберігаються на цьому пристрої, параметри SOC — у двигуні.")}
        action={
          <GhostButton onClick={reset}>
            <RotateCcw className="h-4 w-4" /> {t("Скинути інтерфейс")}
          </GhostButton>
        }
      />

      {msg && <div className="fade-in mb-5 rounded-xl bg-[var(--accent-subtle)] px-4 py-3 text-[14.5px] text-[var(--primary)]">{msg}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Тема */}
        <Panel title={<Title icon={Palette}>{t("Тема")}</Title>}>
          <div className="grid grid-cols-2 gap-4">
            {THEMES.map((th) => {
              const active = settings.theme === th.id;
              return (
                <button
                  key={th.id}
                  onClick={() => set({ theme: th.id })}
                  className={`flex flex-col gap-3 rounded-2xl border p-3 text-left transition-colors ${active ? "border-[var(--primary)] bg-[var(--accent-subtle)]" : "border-[var(--hairline)] hover:border-[var(--hairline-strong)]"}`}
                >
                  <span className="flex h-24 w-full gap-2 rounded-xl p-2.5" style={{ background: th.bg }}>
                    <span className="flex w-1/4 flex-col gap-1.5">
                      <span className="h-3 w-3 rounded-[4px]" style={{ background: th.swatch }} />
                      <span className="h-1.5 w-full rounded-full opacity-30" style={{ background: th.fg }} />
                      <span className="h-1.5 w-3/4 rounded-full opacity-30" style={{ background: th.fg }} />
                    </span>
                    <span className="flex flex-1 flex-col justify-between rounded-lg p-2" style={{ background: th.card }}>
                      <span className="h-2 w-1/2 rounded-full opacity-70" style={{ background: th.fg }} />
                      <span className="h-6 w-full rounded-md opacity-25" style={{ background: th.swatch }} />
                    </span>
                  </span>
                  <span className="flex items-center justify-between px-1 text-[15px] font-medium">
                    {t(th.label)}
                    {active && <span className="text-[13px] text-[var(--primary)]">✓</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Toggle label={t("Фонове сяйво")} desc={t("Мʼякий теплий градієнт згори.")} on={settings.effects} onChange={(v) => set({ effects: v })} />
            <Toggle label={t("Менше анімацій")} desc={t("Без пульсації та переходів.")} on={settings.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
          </div>
        </Panel>

        {/* Масштаб */}
        <Panel title={<Title icon={SlidersHorizontal}>{t("Масштаб інтерфейсу")}</Title>}>
          <p className="mb-4 text-[14.5px] text-muted-foreground">{t("Розмір усього інтерфейсу — для великих моніторів, ноутбуків і презентацій.")}</p>
          <div className="flex items-center gap-4">
            <input type="range" min={80} max={150} step={5} value={settings.scale} onChange={(e) => set({ scale: parseInt(e.target.value, 10) })} className="shok-range w-full" />
            <span className="num w-14 text-right text-[15px]">{settings.scale}%</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {SCALES.map(([v, label]) => (
              <GhostButton key={v} active={settings.scale === v} onClick={() => set({ scale: v })}>
                {t(label)} <span className="num text-[12px] opacity-60">{v}%</span>
              </GhostButton>
            ))}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Toggle label={t("Розгорнуте меню")} desc={t("Бокова панель з підписами (Ctrl B).")} on={settings.sidebar} onChange={(v) => set({ sidebar: v })} />
            <Toggle label={t("24-годинний час")} desc={t("Формат часу в журналах і таблицях.")} on={settings.clock24} onChange={(v) => set({ clock24: v })} />
          </div>
        </Panel>

        {/* Мова */}
        <Panel title={<Title icon={Languages}>{t("Мова інтерфейсу")}</Title>}>
          <div className="flex flex-wrap gap-2">
            {LANGS.map(([code, label]) => (
              <GhostButton key={code} active={settings.lang === code} onClick={() => set({ lang: code })}>
                <span className="mono text-[11.5px] uppercase opacity-60">{code}</span> {label}
              </GhostButton>
            ))}
          </div>
        </Panel>

        {/* Робота */}
        <Panel title={<Title icon={Timer}>{t("Робочий процес")}</Title>}>
          <div className="mb-4">
            <div className="mb-2 text-[14.5px] font-medium">{t("Автооновлення сканів")}</div>
            <div className="mb-3 text-[13.5px] text-muted-foreground">{t("Процеси, зʼєднання, постура, FIM та інші сторінки з вибором хоста оновлюються самі.")}</div>
            <div className="flex flex-wrap gap-2">
              {REFRESH.map(([v, label]) => (
                <GhostButton key={v} active={settings.refreshSec === v} onClick={() => set({ refreshSec: v })}>
                  {t(label)}
                </GhostButton>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle label={t("Підтверджувати небезпечне")} desc={t("Питати перед видаленням і зупинкою.")} on={settings.confirmDestructive} onChange={(v) => set({ confirmDestructive: v })} />
            <Toggle label={t("Сповіщення про інциденти")} desc={t("Системне сповіщення, коли зʼявляється новий критичний інцидент.")} on={settings.notify} onChange={(v) => set({ notify: v })} />
          </div>
          {settings.notify && perm !== "granted" && perm !== "unsupported" && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-raised)] px-4 py-3 text-[14px]">
              <span className="text-muted-foreground">{t("Браузер ще не дозволив сповіщення.")}</span>
              <GhostButton onClick={askNotify}>
                <Bell className="h-4 w-4" /> {t("Дозволити")}
              </GhostButton>
            </div>
          )}
        </Panel>

        {/* SOC */}
        <Panel title={<Title icon={ShieldAlert}>{t("SOC-двигун")}</Title>} className="xl:col-span-2">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Toggle label={t("Автоінциденти")} desc={t("Брутфорс SSH і зміни критичних файлів (FIM) стають інцидентами автоматично.")} on={soc.autoIncidents} onChange={(v) => updateSoc({ autoIncidents: v })} />
            <Toggle label={t("Сповіщення про даунтайм")} desc={t("Десктоп-сповіщення, коли монітор сайту падає чи відновлюється.")} on={soc.notifyDowntime !== false} onChange={(v) => updateSoc({ notifyDowntime: v })} />
            <Toggle label={t("Гео-IP збагачення")} desc={t("Країна та провайдер атакуючих. Надсилає публічні IP у зовнішній сервіс геолокації.")} on={settings.geoip} onChange={(v) => set({ geoip: v })} />
            <Slider label={t("Поріг брутфорсу (за 24 год)")} desc={t("Скільки невдалих логінів запускає інцидент.")} min={50} max={5000} step={50} value={soc.bruteThreshold} onChange={(v) => updateSoc({ bruteThreshold: v })} />
            <Slider label={t("Перевірка загроз")} desc={t("Як часто двигун сканує журнали хостів.")} min={1} max={60} step={1} value={soc.sweepMinutes ?? 5} unit={t("хв")} onChange={(v) => updateSoc({ sweepMinutes: v })} />
            <Slider label={t("Зберігати аудит")} desc={t("Старіші записи журналу дій видаляються.")} min={7} max={730} step={7} value={soc.retentionDays ?? 90} unit={t("днів")} onChange={(v) => updateSoc({ retentionDays: v })} />
          </div>
        </Panel>

        {/* Демо */}
        <Panel title={<Title icon={FlaskConical}>{t("Демо-режим")}</Title>}>
          <p className="mb-4 text-[14.5px] text-muted-foreground">
            {t("Правдоподібні дані 6 хостів, інцидентів, атак і комплаєнсу — без підключення до серверів. Для знайомства з продуктом і презентацій.")}
          </p>
          <Toggle label={t("Увімкнути демо-дані")} desc={t("Живий двигун призупиняється, поки демо активне.")} on={settings.demo} onChange={(v) => set({ demo: v })} />
        </Panel>

        {/* Дані */}
        <Panel title={<Title icon={DatabaseBackup}>{t("Резервна копія")}</Title>}>
          <p className="mb-4 text-[14.5px] text-muted-foreground">{t("Експорт налаштувань, параметрів SOC, інцидентів і моніторів у JSON. Секрети (паролі, ключі) не експортуються.")}</p>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={exportBackup}>
              <Download className="h-4 w-4" /> {t("Експортувати")}
            </PrimaryButton>
            <GhostButton onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> {t("Імпортувати налаштування")}
            </GhostButton>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importSettings(e.target.files[0])} />
          </div>
        </Panel>

        {/* Про продукт */}
        <div ref={aboutRef} className="scroll-mt-24 xl:col-span-2">
          <Panel title={<Title icon={Info}>{t("Про LemonSees")}</Title>}>
            <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
              <div className="flex gap-5">
                <BrandMark className="h-16 w-16 shrink-0" />
                <div>
                  <div className="serif text-[26px] font-medium leading-tight text-[var(--fg-display)]">LemonSees</div>
                  <div className="text-[14.5px] text-muted-foreground">
                    {t("Агентлес SOC-платформа")} · {t("версія")} <span className="num">{info?.version ?? "—"}</span>
                  </div>
                  <div className="mt-1 text-[14.5px]">
                    by{" "}
                    <a href="https://altumptic.com" target="_blank" rel="noreferrer" className="font-medium text-[var(--primary)] hover:underline">
                      Altumptic
                    </a>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[13px] text-muted-foreground">
                    <Chip>{isElectron ? t("Десктоп") : t("Веб")}</Chip>
                    {info && <Chip>{info.platform}</Chip>}
                    {info?.auth && <Chip>{t("доступ за токеном")}</Chip>}
                    {settings.demo && <Chip>{t("демо")}</Chip>}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
                    <ExtLink href="https://github.com/Altumptic/LemonSees">GitHub</ExtLink>
                    <ExtLink href="https://altumptic.com">altumptic.com</ExtLink>
                    <ExtLink href="https://github.com/Altumptic/LemonSees/issues">{t("Повідомити про проблему")}</ExtLink>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-[var(--surface-raised)] p-5">
                <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                  <KeyRound className="h-4 w-4 text-[var(--primary)]" /> {t("Безпека та розкриття вразливостей")}
                </div>
                <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-[14px]">
                  <dt className="text-muted-foreground">PGP key</dt>
                  <dd>
                    <ExtLink href="https://altumptic.com/.well-known/pgp-key.txt">/.well-known/pgp-key.txt</ExtLink>
                  </dd>
                  <dt className="text-muted-foreground">Fingerprint</dt>
                  <dd className="mono break-all text-[13px]">117B A978 F332 80B5 12EE 84B5 D278 3C4F DE43 0CA6</dd>
                  <dt className="text-muted-foreground">Key type</dt>
                  <dd>Ed25519 / Cv25519 · expires 13 Oct 2028</dd>
                  <dt className="text-muted-foreground">Machine-readable</dt>
                  <dd>
                    <ExtLink href="/.well-known/security.txt">/.well-known/security.txt</ExtLink>
                  </dd>
                </dl>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Title({ icon: Icon, children }: { icon: typeof Info; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <Icon className="h-[18px] w-[18px] text-[var(--primary)]" />
      {children}
    </span>
  );
}

const Chip = ({ children }: { children: ReactNode }) => <span className="rounded-full border border-[var(--hairline-strong)] px-2.5 py-0.5">{children}</span>;

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline">
      {children} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function Toggle({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-start justify-between gap-4 rounded-2xl border border-[var(--hairline)] p-4 text-left transition-colors hover:border-[var(--hairline-strong)]"
    >
      <span>
        <span className="block text-[14.5px] font-medium">{label}</span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-muted-foreground">{desc}</span>
      </span>
      <span className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--primary)]" : "bg-[var(--hairline-strong)]"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${on ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Slider({ label, desc, min, max, step, value, unit, onChange }: { label: string; desc: string; min: number; max: number; step: number; value: number; unit?: string; onChange: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="rounded-2xl border border-[var(--hairline)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14.5px] font-medium">{label}</span>
        <span className="num text-[15px]">
          {v}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <div className="mb-3 mt-0.5 text-[13.5px] leading-snug text-muted-foreground">{desc}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => setV(parseInt(e.target.value, 10))}
        onPointerUp={() => v !== value && onChange(v)}
        onKeyUp={() => v !== value && onChange(v)}
        className="shok-range w-full"
      />
    </div>
  );
}
