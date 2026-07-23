import { Languages, Palette, Blend } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui";
import { useSettings, type Lang, type ThemeId } from "@/lib/settings";
import { useI18n } from "@/lib/i18n";

const LANGS: ReadonlyArray<readonly [Lang, string]> = [
  ["uk", "Українська"],
  ["en", "English"],
  ["ru", "Русский"],
  ["pl", "Polski"],
  ["zh", "中文"],
];

const THEMES: ReadonlyArray<{ id: ThemeId; label: string; swatch: string; bg: string }> = [
  { id: "champagne", label: "Шампань", swatch: "#d4b483", bg: "#14151a" },
  { id: "ink", label: "Чорнило", swatch: "#d4b483", bg: "#000000" },
  { id: "ocean", label: "Океан", swatch: "#7fb0d8", bg: "#10151d" },
  { id: "forest", label: "Ліс", swatch: "#86c29a", bg: "#101712" },
  { id: "violet", label: "Пурпур", swatch: "#b99bd8", bg: "#15101c" },
  { id: "light", label: "Світла", swatch: "#a8874f", bg: "#f4f2ec" },
];

export default function SettingsPage() {
  const { settings, set } = useSettings();
  const { t } = useI18n();

  return (
    <>
      <PageHeader
        eyebrow={t("Застосунок")}
        title={t("Налаштування")}
        lede={t("Вигляд і мова застосунку. Зберігається на цьому ПК.")}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                  <span className="mono text-[10px] uppercase tracking-[0.16em] opacity-60">
                    {code}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel
          eyebrow={t("Вигляд")}
          title={
            <span className="flex items-center gap-2">
              <Blend className="h-4 w-4 text-muted-foreground" />
              {t("Прозорість панелей")}
            </span>
          }
        >
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">{t("Скло і фон — від щільного до прозорого.")}</p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                value={settings.alpha}
                onChange={(e) => set({ alpha: parseInt(e.target.value, 10) })}
                className="shok-range w-full"
              />
              <span className="num w-10 text-right text-sm text-foreground/80">{settings.alpha}</span>
            </div>
          </div>
        </Panel>

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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {THEMES.map((th) => {
              const active = settings.theme === th.id;
              return (
                <button
                  key={th.id}
                  onClick={() => set({ theme: th.id })}
                  className={`group flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors ${
                    active
                      ? "border-[var(--primary)]/60 bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]"
                      : "border-[var(--hairline)] hover:border-[var(--hairline-strong)]"
                  }`}
                >
                  <span
                    className="flex h-12 w-full items-center justify-center rounded-md border border-[var(--hairline)]"
                    style={{ background: th.bg }}
                  >
                    <span className="h-4 w-4 rounded-full" style={{ background: th.swatch }} />
                  </span>
                  <span className="flex items-center justify-between">
                    <span className={`text-sm ${active ? "text-[var(--primary)]" : ""}`}>
                      {t(th.label)}
                    </span>
                    {active && (
                      <span className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--primary)]">
                        ✓
                      </span>
                    )}
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
