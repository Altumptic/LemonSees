import { useEffect, useState } from "react";

export type Lang = "uk" | "en" | "ru" | "pl" | "zh";

export type ThemeId =
  | "champagne"
  | "ink"
  | "midnight"
  | "ocean"
  | "forest"
  | "violet"
  | "rose"
  | "amber"
  | "crimson"
  | "nord"
  | "dracula"
  | "cyber"
  | "slate"
  | "light"
  | "solarized"
  | "sand";

export type AccentId = "auto" | "amber" | "blue" | "green" | "violet" | "rose" | "cyan" | "red";

export type AppSettings = {
  lang: Lang;
  theme: ThemeId;
  alpha: number; // 0..100 прозорість панелей
  scale: number; // 80..130 масштаб UI
  accent: AccentId;
  effects: boolean; // фонова сітка + зерно
  reduceMotion: boolean;
  confirmDestructive: boolean;
  glassWindow: boolean; // прозорий (акриловий) фон вікна
  glow: boolean; // кольорове сяйво навколо панелей
  geoip: boolean; // гео-IP збагачення атакуючих (зовнішній запит)
};

const KEY = "shok.settings";

export const DEFAULTS: AppSettings = {
  lang: "uk",
  theme: "champagne",
  alpha: 25,
  scale: 100,
  accent: "auto",
  effects: true,
  reduceMotion: false,
  confirmDestructive: true,
  glassWindow: false,
  glow: false,
  geoip: true,
};

export const ACCENTS: Record<Exclude<AccentId, "auto">, string> = {
  amber: "oklch(0.82 0.09 75)",
  blue: "oklch(0.72 0.1 240)",
  green: "oklch(0.76 0.11 155)",
  violet: "oklch(0.72 0.12 300)",
  rose: "oklch(0.72 0.13 5)",
  cyan: "oklch(0.78 0.1 200)",
  red: "oklch(0.66 0.17 25)",
};

type Listener = () => void;

class SettingsStore {
  value: AppSettings;
  private listeners = new Set<Listener>();

  constructor() {
    let v = DEFAULTS;
    try {
      v = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    } catch {
      /* ignore */
    }
    this.value = v;
    this.apply();
  }

  set(patch: Partial<AppSettings>) {
    this.value = { ...this.value, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      /* ignore */
    }
    this.apply();
    for (const l of this.listeners) l();
  }

  reset() {
    this.set({ ...DEFAULTS });
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  apply() {
    const root = document.documentElement;
    const v = this.value;
    root.dataset.theme = v.theme;
    root.dataset.effects = v.effects ? "on" : "off";
    root.dataset.motion = v.reduceMotion ? "reduced" : "full";
    root.dataset.glass = v.glassWindow ? "on" : "off";
    root.dataset.glow = v.glow ? "on" : "off";

    const a = Math.max(0, Math.min(100, v.alpha)) / 1000;
    root.style.setProperty("--glass-alpha", String(a));
    root.style.setProperty("--glass-alpha-strong", String(Math.min(0.18, a * 1.6)));

    if (v.accent !== "auto") {
      const c = ACCENTS[v.accent];
      root.style.setProperty("--primary", c);
      root.style.setProperty("--accent", c);
      root.style.setProperty("--ring", c.replace(")", " / 0.4)").replace("oklch(", "oklch("));
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--accent");
      root.style.removeProperty("--ring");
    }

    document.body.style.zoom = String(Math.max(80, Math.min(140, v.scale)) / 100);
  }
}

export const settingsStore = new SettingsStore();

export function useSettings() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = settingsStore.subscribe(() => force((x) => x + 1));
    return () => {
      unsub();
    };
  }, []);
  return {
    settings: settingsStore.value,
    set: (p: Partial<AppSettings>) => settingsStore.set(p),
    reset: () => settingsStore.reset(),
  };
}

export const isElectron = navigator.userAgent.includes("Electron");
