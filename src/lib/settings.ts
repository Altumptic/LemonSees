import { useEffect, useState } from "react";

export type Lang = "uk" | "en" | "ru" | "pl" | "zh";
export type ThemeId = "champagne" | "ink" | "ocean" | "forest" | "violet" | "light";

export type AppSettings = { lang: Lang; theme: ThemeId; alpha: number };

const KEY = "shok.settings";
const DEFAULTS: AppSettings = { lang: "uk", theme: "champagne", alpha: 25 };

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

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  apply() {
    const root = document.documentElement;
    root.dataset.theme = this.value.theme;
    // 0..100 → альфа скла 0..0.1
    const a = Math.max(0, Math.min(100, this.value.alpha)) / 1000;
    root.style.setProperty("--glass-alpha", String(a));
    root.style.setProperty("--glass-alpha-strong", String(Math.min(0.16, a * 1.6)));
  }
}

export const settingsStore = new SettingsStore();

export function useSettings() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = settingsStore.subscribe(() => force((v) => v + 1));
    return () => {
      unsub();
    };
  }, []);
  return {
    settings: settingsStore.value,
    set: (p: Partial<AppSettings>) => settingsStore.set(p),
  };
}

export const isElectron = navigator.userAgent.includes("Electron");
