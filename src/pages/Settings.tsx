import { Languages, Palette, Blend, SlidersHorizontal, Sparkles, RotateCcw, Droplet } from "lucide-react";
import { PageHeader, Panel, GhostButton } from "@/components/ui";
import { useSettings, ACCENTS, type Lang, type ThemeId, type AccentId } from "@/lib/settings";
import { useI18n } from "@/lib/i18n";

const LANGS: ReadonlyArray<readonly [Lang, string]> = [
  ["uk", "Українська"],
  ["en", "English"],
  ["ru", "Русский"],
  ["pl", "Polski"],
  ["zh", "中文"],
];

const THEMES: ReadonlyArray<{ id: ThemeId; label: string; swatch: string; bg: string; fg: string }> = [
  { id: "champagne", label: "Шампань", swatch: "#d4b483", bg: "#14151a", fg: "#e8e6df" },
  { id: "ink", label: "Чорнило", swatch: "#d4b483", bg: "#000000", fg: "#e8e6df" },
  { id: "midnight", label: "Опівніч", swatch: "#7b8cf0", bg: "#0b0e1c", fg: "#e8e6df" },
  { id: "ocean", label: "Океан", swatch: "#7fb0d8", bg: "#10151d", fg: "#e8e6df" },
  { id: "forest", label: "Ліс", swatch: "#86c29a", bg: "#101712", fg: "#e8e6df" },
  { id: "violet", label: "Фіолет", swatch: "#b99bd8", bg: "#15101c", fg: "#e8e6df" },
  { id: "rose", label: "Троянда", swatch: "#e18aa0", bg: "#1a1013", fg: "#e8e6df" },
  { id: "amber", label: "Бурштин", swatch: "#e0a95f", bg: "#181206", fg: "#e8e6df" },
  { id: "crimson", label: "Кармін", swatch: "#e05f5f", bg: "#170b0b", fg: "#e8e6df" },
  { id: "nord", label: "Nord", swatch: "#88c0d0", bg: "#3b4252", fg: "#eceff4" },
  { id: "dracula", label: "Dracula", swatch: "#ff79c6", bg: "#282a36", fg: "#f8f8f2" },
  { id: "cyber", label: "Кібер", swatch: "#3dff88", bg: "#05100a", fg: "#c8ffd8" },
  { id: "slate", label: "Графіт", swatch: "#aeb6c2", bg: "#22262e", fg: "#e8e6df" },
  { id: "light", label: "Світла", swatch: "#a8874f", bg: "#f4f2ec", fg: "#2a2a2a" },
  { id: "solarized", label: "Solarized", swatch: "#268bd2", bg: "#eee8d5", fg: "#586e75" },
  { id: "sand", label: "Пісок", swatch: "#b07a45", bg: "#efe7d8", fg: "#4a3f33" },
];

const ACCENT_LIST: ReadonlyArray<{ id: AccentId; color: string }> = [
  { id: "auto", color: "" },
  { id: "amber", color: ACCENTS.amber },
  { id: "blue", color: ACCENTS.blue },
  { id: "green", color: ACCENTS.green },
  { id: "violet", color: ACCENTS.violet },
  { id: "rose", color: ACCENTS.rose },
  { id: "cyan", color: ACCENTS.cyan },
  { id: "red", color: ACCENTS.red },
];

export default function SettingsPage() {
  const { settings, set, reset } = useSettings();
  const { t } = useI18n();

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

        {/* Акцент */}
        <Panel
          eyebrow={t("Вигляд")}
          title={
            <span className="flex items-center gap-2">
              <Droplet className="h-4 w-4 text-muted-foreground" />
              {t("Колір акценту")}
            </span>
          }
        >
          <p className="mb-3 text-[12px] text-muted-foreground">
            {t("«Авто» — колір із теми. Або обери власний.")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_LIST.map((a) => {
              const active = settings.accent === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => set({ accent: a.id })}
                  title={a.id}
                  className={`grid h-9 w-9 place-items-center rounded-full border-2 transition-transform ${
                    active ? "scale-110 border-foreground" : "border-transparent hover:scale-105"
                  }`}
                  style={{ background: a.id === "auto" ? "transparent" : a.color }}
                >
                  {a.id === "auto" && (
                    <span className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      {t("авто")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Прозорість */}
        <Panel
          eyebrow={t("Вигляд")}
          title={
            <span className="flex items-center gap-2">
              <Blend className="h-4 w-4 text-muted-foreground" />
              {t("Прозорість панелей")}
            </span>
          }
        >
          <p className="mb-3 text-[12px] text-muted-foreground">{t("Скло і фон — від щільного до прозорого.")}</p>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              value={settings.alpha}
              onChange={(e) => set({ alpha: parseInt(e.target.value, 10) })}
              className="shok-range w-full"
            />
            <span className="num w-12 text-right text-sm text-foreground/80">{settings.alpha}%</span>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Toggle
              label={t("Скляне вікно")}
              desc={t("Прозорий акриловий фон — крізь вікно видно робочий стіл.")}
              on={settings.glassWindow}
              onChange={(v) => set({ glassWindow: v })}
            />
            <Toggle
              label={t("Кольорове сяйво")}
              desc={t("Тінь у колір акценту навколо панелей.")}
              on={settings.glow}
              onChange={(v) => set({ glow: v })}
            />
            <Toggle
              label={t("Фонові ефекти")}
              desc={t("Сітка й зерно на фоні.")}
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
