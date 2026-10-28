import { useSyncExternalStore } from "react";

export type Lang = "uk" | "en" | "ru" | "pl" | "zh";

export type ThemeId = "dark" | "light";

export type AppSettings = {
  lang: Lang;
  theme: ThemeId;
  scale: number; // 80..150 масштаб UI
  effects: boolean; // мʼяке фонове сяйво
  sidebar: boolean; // розгорнутий сайдбар
  reduceMotion: boolean;
  confirmDestructive: boolean;
  geoip: boolean; // гео-IP збагачення атакуючих (зовнішній запит)
  demo: boolean; // демо-режим: локальні правдоподібні дані замість двигуна
  hostId: string | null; // глобально вибраний хост (верхня панель)
  clock24: boolean; // 24-годинний формат часу
  refreshSec: number; // автооновлення сторінок зі сканами (0 — вручну)
  notify: boolean; // сповіщення в застосунку про нові інциденти
  hiddenWidgets?: string[]; // приховані віджети огляду
  v?: number; // версія схеми налаштувань
};

const VERSION = 4;

const KEY = "shok.settings";

export const DEFAULTS: AppSettings = {
  lang: "uk",
  theme: "light",
  scale: 110,
  effects: true,
  sidebar: true,
  reduceMotion: false,
  confirmDestructive: true,
  geoip: false, // opt-in (PSB P2): зовнішній запит лише за згодою
  demo: false,
  hostId: null,
  clock24: true,
  refreshSec: 0,
  notify: true,
  v: VERSION,
};

type Listener = () => void;

class SettingsStore {
  value: AppSettings;
  private listeners = new Set<Listener>();

  constructor() {
    let v = DEFAULTS;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<AppSettings>;
      // Міграція на v3: кремова тема + комфортний масштаб за замовчуванням
      if ((saved.v ?? 0) < 3) {
        delete saved.theme;
        delete saved.scale;
      }
      // v4: гео-IP стає opt-in — вимикаємо, користувач увімкне свідомо
      if ((saved.v ?? 0) < 4) saved.geoip = false;
      v = { ...DEFAULTS, ...saved, v: VERSION };
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

    // Чистимо будь-які старі inline-акценти
    root.style.removeProperty("--primary");
    root.style.removeProperty("--accent");
    root.style.removeProperty("--ring");

    const zoom = Math.max(80, Math.min(150, v.scale)) / 100;
    root.style.setProperty("--zoom", String(zoom));
    document.body.style.zoom = String(zoom);
  }
}

export const settingsStore = new SettingsStore();

const subscribe = (fn: Listener) => settingsStore.subscribe(fn);
const snapshot = () => settingsStore.value;
const setSettings = (p: Partial<AppSettings>) => settingsStore.set(p);
const resetSettings = () => settingsStore.reset();

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, snapshot);
  return { settings, set: setSettings, reset: resetSettings };
}

export const isElectron = navigator.userAgent.includes("Electron");
