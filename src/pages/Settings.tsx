import { useEffect, useState } from "react";
import { Languages, Palette, SlidersHorizontal, Sparkles, RotateCcw, ShieldAlert } from "lucide-react";
import { PageHeader, Panel, GhostButton } from "@/components/ui";
import { useSettings, type Lang, type ThemeId } from "@/lib/settings";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import type { SocConfig } from "@/lib/types";

const LANGS: ReadonlyArray<readonly [Lang, string]> = [
  ["uk", "Українська"],
  ["en", "English"],
  ["ru", "Русский"],
  ["pl", "Polski"],
  ["zh", "中文"],
];

const THEMES: ReadonlyArray<{ id: ThemeId; label: string; swatch: string; bg: string; fg: string }> = [
  { id: "dark", label: "Темна", swatch: "#d71921", bg: "#000000", fg: "#e8e8e8" },
  { id: "light", label: "Світла", swatch: "#d71921", bg: "#f5f5f5", fg: "#1a1a1a" },
];

export default function SettingsPage() {
  const { settings, set, reset } = useSettings();
  const { t } = useI18n();
  const [soc, setSoc] = useState<SocConfig>({ autoIncidents: true, bruteThreshold: 300 });

  useEffect(() => {
    api.getSoc().then(setSoc).catch(() => {});
  }, []);

  const updateSoc = (patch: Partial<SocConfig>) => {
    const next = { ...soc, ...patch };
    setSoc(next);
    api.setSoc(next).then(setSoc).catch(() => {});
  };

  return (
    <>
      <PageHeader
        eyebrow={t("Застосунок")}
        title={t("Налаштування")}
        lede={t("Вигляд і мова застосунку. Зберігається на цьому ПК.")}
        action={
          <GhostButton onClick={reset}>
            <RotateCcw className="h-3 w-3" /> {t("Скинути")}
          </GhostButton>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Мова */}
        <Panel
          eyebrow={t("Мова")}
          title={
            <span className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              {t("Мова інтерфейсу")}
            </span>
          }
        >
          <div className="flex flex-wrap gap-2">
            {LANGS.map(([code, label]) => {
              const active = settings.lang === code;
              return (
                <button
                  key={code}
                  onClick={() => set({ lang: code })}
                  className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors ${
                    active
                      ? "border-[var(--primary)]/50 bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-[var(--primary)]"
                      : "border-[var(--hairline)] text-muted-foreground hover:border-[var(--hairline-strong)] hover:text-foreground"
                  }`}
                >
                  <span className="mono text-[10px] uppercase tracking-[0.16em] opacity-60">{code}</span>
                  {label}
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Масштаб */}
        <Panel
          eyebrow={t("Вигляд")}
          title={
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              {t("Масштаб інтерфейсу")}
            </span>
          }
        >
          <p className="mb-3 text-[12px] text-muted-foreground">{t("Розмір усього інтерфейсу.")}</p>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={80}
              max={140}
              step={5}
              value={settings.scale}
              onChange={(e) => set({ scale: parseInt(e.target.value, 10) })}
              className="shok-range w-full"
            />
            <span className="num w-12 text-right text-sm text-foreground/80">{settings.scale}%</span>
          </div>
        </Panel>

        {/* Поведінка */}
        <Panel
          eyebrow={t("Поведінка")}
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              {t("Ефекти та безпека")}
            </span>
          }
          className="lg:col-span-2"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Toggle
              label={t("Фонове сяйво")}
              desc={t("Мʼякий градієнт на фоні.")}
              on={settings.effects}
              onChange={(v) => set({ effects: v })}
            />
            <Toggle
              label={t("Менше анімацій")}
              desc={t("Вимкнути пульсацію й переходи.")}
              on={settings.reduceMotion}
              onChange={(v) => set({ reduceMotion: v })}
            />
            <Toggle
              label={t("Підтверджувати небезпечне")}
              desc={t("Питати перед видаленням і зупинкою.")}
              on={settings.confirmDestructive}
              onChange={(v) => set({ confirmDestructive: v })}
            />
          </div>
        </Panel>

        {/* SOC / Загрози */}
        <Panel
          eyebrow={t("SOC")}
          title={
            <span className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              {t("Загрози та автоінциденти")}
            </span>
          }
          className="lg:col-span-2"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Toggle
              label={t("Автоінциденти (брутфорс)")}
              desc={t("Автоматично створювати інцидент, коли невдалих SSH-логінів більше порогу.")}
              on={soc.autoIncidents}
              onChange={(v) => updateSoc({ autoIncidents: v })}
            />
            <div className="rounded-lg border border-[var(--hairline)] p-4">
              <div className="text-sm font-medium">{t("Поріг брутфорсу (за 24 год)")}</div>
              <div className="mb-3 text-[12px] text-muted-foreground">{t("Скільки невдалих логінів запускає інцидент.")}</div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={50}
                  max={5000}
                  step={50}
                  value={soc.bruteThreshold}
                  onChange={(e) => updateSoc({ bruteThreshold: parseInt(e.target.value, 10) })}
                  className="shok-range w-full"
                />
                <span className="num w-16 text-right text-sm text-foreground/80">{soc.bruteThreshold}</span>
              </div>
            </div>
            <Toggle
              label={t("Гео-IP збагачення")}
              desc={t("Визначати країну/провайдера атакуючих. Надсилає публічні IP у зовнішній сервіс геолокації.")}
              on={settings.geoip}
              onChange={(v) => set({ geoip: v })}
            />
          </div>
        </Panel>

        {/* Теми */}
        <Panel
          eyebrow={t("Тема")}
          title={
            <span className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              {t("Кольорова тема поверхні")}
            </span>
          }
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
            {THEMES.map((th) => {
              const active = settings.theme === th.id;
              return (
                <button
                  key={th.id}
                  onClick={() => set({ theme: th.id })}
                  className={`group flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? "border-[var(--primary)]/60 bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]"
                      : "border-[var(--hairline)] hover:border-[var(--hairline-strong)]"
                  }`}
                >
                  <span
                    className="flex h-14 w-full flex-col justify-between rounded-md border border-[var(--hairline)] p-2"
                    style={{ background: th.bg }}
                  >
                    <span className="flex gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: th.swatch }} />
                      <span className="h-2 w-6 rounded-full opacity-40" style={{ background: th.fg }} />
                    </span>
                    <span className="h-1.5 w-8 rounded-full" style={{ background: th.swatch }} />
                  </span>
                  <span className="flex items-center justify-between">
                    <span className={`text-[13px] ${active ? "text-[var(--primary)]" : ""}`}>
                      {t(th.label)}
                    </span>
                    {active && <span className="text-[10px] text-[var(--primary)]">✓</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Toggle({
  label,
  desc,
  on,
  onChange,
}: {
  label: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-[var(--hairline)] p-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[12px] text-muted-foreground">{desc}</div>
      </div>
      <button
        onClick={() => onChange(!on)}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          on
            ? "border-[var(--primary)]/50 bg-[color-mix(in_oklab,var(--primary)_35%,transparent)]"
            : "border-[var(--hairline)] bg-white/[0.03]"
        }`}
      >
        <span
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all ${
            on ? "left-[calc(100%-1.05rem)] bg-[var(--primary)]" : "left-[3px] bg-muted-foreground"
          }`}
        />
      </button>
    </div>
  );
}
