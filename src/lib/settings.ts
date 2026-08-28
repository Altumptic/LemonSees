import { useEffect, useState } from "react";

export type Lang = "uk" | "en" | "ru" | "pl" | "zh";

export type ThemeId = "dark" | "light";

export type AppSettings = {
  lang: Lang;
  theme: ThemeId;
  scale: number; // 80..140 масштаб UI
  effects: boolean; // dot-matrix фон
  reduceMotion: boolean;
  confirmDestructive: boolean;
  geoip: boolean; // гео-IP збагачення атакуючих (зовнішній запит)
};

const KEY = "shok.settings";

export const DEFAULTS: AppSettings = {
  lang: "uk",
  theme: "dark",
  scale: 100,
  effects: true,
  reduceMotion: false,
  confirmDestructive: true,
  geoip: true,
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
    root.dataset.theme = v.theme === "light" ? "light" : "dark";
    root.dataset.effects = v.effects ? "on" : "off";
    root.dataset.motion = v.reduceMotion ? "reduced" : "full";

    // Nothing — монохром + сигнальний червоний; чистимо будь-які старі inline-акценти
    root.style.removeProperty("--primary");
    root.style.removeProperty("--accent");
    root.style.removeProperty("--ring");

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
