import { Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type LazyExoticComponent } from "react";
import { PanelLeftClose, PanelLeftOpen, X, Sun, Moon, FlaskConical, Plus, Keyboard, KeyRound } from "lucide-react";
import { api, store, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { isElectron, useSettings } from "@/lib/settings";
import { Modal, PageSkeleton, PrimaryButton, Tabs } from "@/components/ui";
import CommandPalette, { type PaletteItem } from "@/components/CommandPalette";
import Topbar from "@/components/Topbar";
import { BrandMark } from "@/components/Brand";
import { GROUPS, SECTIONS, go, parseHash, type Loader, type PageProps } from "@/nav";

const LAZY = new Map<Loader, LazyExoticComponent<ComponentType<PageProps>>>();
function pageOf(load: Loader) {
  let C = LAZY.get(load);
  if (!C) {
    C = lazy(load);
    LAZY.set(load, C);
  }
  return C;
}

function usePath(): [string, string] {
  const [path, set] = useState<[string, string]>(parseHash);
  useEffect(() => {
    const on = () => set(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return path;
}

// «g» + літера — перехід як у Gmail/GitHub
const GOTO: Record<string, string> = {
  o: "siem/overview",
  a: "siem/analytics",
  e: "siem/events",
  h: "infra/hosts",
  i: "soar/incidents",
  m: "cti/mitre",
  t: "cti/threats",
  v: "edr/vulns",
  c: "grc/compliance",
  u: "uptime/monitors",
  s: "system/settings",
};

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export default function App() {
  const [secId, tabId] = usePath();
  const { hosts, connected, authed, demo } = useAppState();
  const { settings, set } = useSettings();
  const { t } = useI18n();
  const [mobileNav, setMobileNav] = useState(false);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);

  const section = SECTIONS.find((s) => s.id === secId) ?? SECTIONS[0];
  const tab = section.tabs.find((x) => x.id === tabId) ?? section.tabs[0];
  const Active = pageOf(tab.load);
  const online = hosts.filter((h) => h.status === "online").length;
  const expanded = settings.sidebar;
  const toggleTheme = () => set({ theme: settings.theme === "dark" ? "light" : "dark" });

  useEffect(() => {
    if (settings.demo) return;
    api.info().then((i) => setAuthEnabled(i.auth)).catch(() => {});
  }, [settings.demo, authed]);

  // Гарячі клавіші
  useEffect(() => {
    let gPending = 0;
    const on = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      } else if (mod && k === "b") {
        e.preventDefault();
        set({ sidebar: !expanded });
      } else if (!mod && !e.altKey && !typing(e)) {
        if (e.key === "?") setShortcuts(true);
        else if (e.key === "/") {
          e.preventDefault();
          setPalette(true);
        } else if (k === "g") gPending = Date.now();
        else if (gPending && Date.now() - gPending < 1200 && GOTO[k]) {
          go(GOTO[k]);
          gPending = 0;
        }
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [expanded, set]);

  useEffect(() => setMobileNav(false), [secId, tabId]);

  // Після старту тихо догружаємо решту сторінок — переходи стають миттєвими
  useEffect(() => {
    const ric = (window as { requestIdleCallback?: typeof window.requestIdleCallback }).requestIdleCallback;
    const warm = () => SECTIONS.forEach((s) => s.tabs.forEach((x) => x.load().catch(() => {})));
    if (ric) {
      const id = ric(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(id);
  }, []);

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];
    for (const s of SECTIONS)
      for (const x of s.tabs)
        items.push({
          id: `${s.id}/${x.id}`,
          label: t(x.label),
          hint: t(s.label),
          icon: x.icon,
          keywords: `${s.id} ${x.id} ${x.label} ${s.label}`,
          run: () => go(`${s.id}/${x.id}`),
        });
    const action = (id: string, label: string, icon: PaletteItem["icon"], keywords: string, run: () => void) =>
      items.push({ id: `action/${id}`, label, hint: t("Дія"), icon, keywords, run });
    action("new-host", t("Додати хост"), Plus, "add host new ssh", () => go("infra/hosts?new"));
    action("new-incident", t("Новий інцидент"), Plus, "new incident create", () => go("soar/incidents?new"));
    action("new-monitor", t("Додати монітор"), Plus, "new monitor uptime", () => go("uptime/monitors?new"));
    action("theme", settings.theme === "dark" ? t("Світла тема") : t("Темна тема"), settings.theme === "dark" ? Sun : Moon, "theme тема dark light", toggleTheme);
    action("sidebar", expanded ? t("Згорнути меню") : t("Розгорнути меню"), expanded ? PanelLeftClose : PanelLeftOpen, "sidebar menu", () => set({ sidebar: !expanded }));
    action("demo", settings.demo ? t("Вимкнути демо-режим") : t("Увімкнути демо-режим"), FlaskConical, "demo sample data", () => set({ demo: !settings.demo }));
    action("shortcuts", t("Гарячі клавіші"), Keyboard, "keyboard shortcuts hotkeys", () => setShortcuts(true));
    for (const h of hosts)
      items.push({ id: `host/${h.id}`, label: h.name, hint: `${t("Хост")} · ${h.host}`, keywords: `host ${h.host}`, run: () => (set({ hostId: h.id }), go("edr/endpoints")) });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, settings.theme, settings.demo, expanded, hosts.length]);

  if (!authed && !demo) return <Login />;

  const nav = (compact: boolean) => <SideNav compact={compact} secId={section.id} tabId={tab.id} />;

  return (
    <div className="app-bg relative min-h-app">
      <div className="relative z-10 flex min-h-app">
        <aside
          className={`sticky top-0 hidden h-app shrink-0 flex-col border-r border-[var(--hairline)] bg-[var(--ink)] transition-[width] duration-200 lg:flex ${
            expanded ? "w-[272px]" : "w-[76px]"
          }`}
        >
          <Brand compact={!expanded} />
          {nav(!expanded)}
          <SidebarFooter compact={!expanded} connected={connected} demo={demo} online={online} total={hosts.length} onToggle={() => set({ sidebar: !expanded })} />
        </aside>

        {mobileNav && (
          <div className="fixed inset-0 z-40 lg:hidden" style={{ background: "var(--scrim)" }} onClick={() => setMobileNav(false)}>
            <aside className="fade-in flex h-full w-[300px] max-w-[86vw] flex-col border-r border-[var(--hairline)] bg-[var(--ink)]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between pr-3">
                <Brand compact={false} />
                <button onClick={() => setMobileNav(false)} aria-label="Close menu" className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-[var(--hover)]">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {nav(false)}
              <SidebarFooter compact={false} connected={connected} demo={demo} online={online} total={hosts.length} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar section={section} tab={tab} onMenu={() => setMobileNav(true)} onSearch={() => setPalette(true)} onShortcuts={() => setShortcuts(true)} authEnabled={authEnabled} />

          <main className="min-w-0 flex-1 px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
            <div key={`${section.id}/${tab.id}`} className="fade-in mx-auto w-full max-w-[1680px]">
              {section.tabs.length > 1 && (
                <div className={expanded ? "lg:hidden" : ""}>
                  <Tabs items={section.tabs.map((x) => ({ id: x.id, label: t(x.label), icon: x.icon }))} active={tab.id} onChange={(id) => go(`${section.id}/${id}`)} />
                </div>
              )}
              <Suspense fallback={<PageSkeleton />}>
                <Active go={go} />
              </Suspense>
            </div>
          </main>
        </div>
      </div>

      {palette && <CommandPalette items={paletteItems} onClose={() => setPalette(false)} />}
      {shortcuts && <ShortcutsModal onClose={() => setShortcuts(false)} />}
    </div>
  );
}

/* ---------------- Частини оболонки ---------------- */

function Brand({ compact }: { compact: boolean }) {
  return (
    <div className={`flex h-[60px] shrink-0 items-center gap-3 ${compact ? "justify-center px-0" : "px-5"} ${isElectron ? "drag-region" : ""}`}>
      <BrandMark className="h-8 w-8 shrink-0" />
      {!compact && (
        <div className="min-w-0 leading-tight">
          <div className="serif text-[19px] font-semibold tracking-[-0.01em] text-[var(--fg-display)]">LemonSees</div>
          <div className="text-[12px] text-muted-foreground">by Altumptic</div>
        </div>
      )}
    </div>
  );
}

function SideNav({ compact, secId, tabId }: { compact: boolean; secId: string; tabId: string }) {
  const { t } = useI18n();
  return (
    <nav className={`flex-1 overflow-y-auto pb-6 pt-2 ${compact ? "px-3" : "px-3.5"}`}>
      <div className="space-y-6">
        {GROUPS.map((grp) => (
          <div key={grp}>
            {compact ? <div className="mx-auto mb-2 h-px w-8 bg-[var(--hairline-strong)]" /> : <div className="mb-1.5 px-3 text-[12.5px] font-medium text-muted-foreground">{t(grp)}</div>}
            <div className="flex flex-col gap-0.5">
              {SECTIONS.filter((s) => s.group === grp).map((s) => {
                const on = s.id === secId;
                const Icon = s.icon;
                const prefetch = () => s.tabs.forEach((x) => x.load().catch(() => {}));
                return (
                  <div key={s.id}>
                    <button
                      onClick={() => go(s.id)}
                      onMouseEnter={prefetch}
                      onFocus={prefetch}
                      title={compact ? t(s.label) : undefined}
                      aria-current={on ? "page" : undefined}
                      className={`group flex w-full items-center rounded-xl text-left text-[15px] transition-colors ${compact ? "h-11 justify-center" : "gap-3 px-3 py-2.5"} ${
                        on ? "bg-[var(--surface)] font-medium text-[var(--fg-display)] shadow-[var(--shadow-card)]" : "text-foreground/75 hover:bg-[var(--hover)] hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" style={on ? { color: "var(--primary)" } : undefined} />
                      {!compact && <span className="truncate">{t(s.label)}</span>}
                    </button>
                    {!compact && on && s.tabs.length > 1 && (
                      <div className="mb-1 ml-[21px] mt-1 flex flex-col border-l border-[var(--hairline-strong)] pl-2.5">
                        {s.tabs.map((x) => {
                          const active = x.id === tabId;
                          return (
                            <button
                              key={x.id}
                              onClick={() => go(`${s.id}/${x.id}`)}
                              aria-current={active ? "page" : undefined}
                              className={`relative rounded-lg px-3 py-2 text-left text-[14px] transition-colors ${
                                active ? "font-medium text-[var(--primary)]" : "text-muted-foreground hover:bg-[var(--hover)] hover:text-foreground"
                              }`}
                            >
                              {active && <span className="absolute -left-[11.5px] top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-[var(--primary)]" />}
                              <span className="truncate">{t(x.label)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

function SidebarFooter({
  compact,
  connected,
  demo,
  online,
  total,
  onToggle,
}: {
  compact: boolean;
  connected: boolean;
  demo: boolean;
  online: number;
  total: number;
  onToggle?: () => void;
}) {
  const { t } = useI18n();
  const label = demo ? t("Демо-режим") : connected ? t("двигун ок") : t("немає зв'язку");
  const status = <span className={`h-2 w-2 shrink-0 rounded-full ${demo ? "bg-[var(--primary)]" : connected ? "live-dot bg-[var(--success)]" : "bg-[var(--danger)]"}`} title={label} />;
  return (
    <div className={`flex shrink-0 items-center border-t border-[var(--hairline)] py-3 ${compact ? "flex-col gap-3 px-2" : "gap-3 px-4"}`}>
      {compact ? (
        status
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5 text-[13.5px]">
          {status}
          <span className="truncate text-muted-foreground">
            {label} · <span className="num text-foreground">{online}/{total}</span> {t("хости")}
          </span>
        </div>
      )}
      {onToggle && (
        <button
          onClick={onToggle}
          title={`${compact ? t("Розгорнути меню") : t("Згорнути меню")} (Ctrl B)`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--hover)] hover:text-foreground"
        >
          {compact ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
      )}
    </div>
  );
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const rows: [string, string][] = [
    ["Ctrl K  /  /", t("Пошук і палітра команд")],
    ["Ctrl B", t("Згорнути / розгорнути меню")],
    ["?", t("Гарячі клавіші")],
    ["g o", t("Огляд")],
    ["g a", t("SOC-аналітика")],
    ["g e", t("Події")],
    ["g i", t("Інциденти")],
    ["g m", "MITRE ATT&CK"],
    ["g t", t("Загрози")],
    ["g v", t("Вразливості")],
    ["g c", t("Комплаєнс")],
    ["g h", t("Хости")],
    ["g u", t("Монітори")],
    ["g s", t("Налаштування")],
    ["Esc", t("Закрити вікно")],
  ];
  return (
    <Modal title={t("Гарячі клавіші")} onClose={onClose}>
      <ul className="divide-y divide-[var(--hairline)]">
        {rows.map(([k, d]) => (
          <li key={k} className="flex items-center justify-between gap-4 py-2.5 text-[14.5px]">
            <span>{d}</span>
            <span className="flex gap-1">
              {k.split("  ").map((part) => (
                <kbd key={part} className="rounded-md border border-[var(--hairline-strong)] bg-[var(--surface-raised)] px-2 py-0.5 text-[12.5px]">
                  {part}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function Login() {
  const { t } = useI18n();
  const { set } = useSettings();
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      await api.login(token.trim());
      store.setAuth(true);
    } catch {
      setErr(t("Невірний токен доступу."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="app-bg grid min-h-app place-items-center px-4">
      <div className="glass relative z-10 w-full max-w-[420px] rounded-3xl p-8">
        <BrandMark className="mb-6 h-12 w-12" />
        <h1 className="serif text-[30px] font-medium leading-tight">{t("Вхід до LemonSees")}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{t("Цей сервер захищено токеном доступу. Його задає адміністратор у LEMONSEES_TOKEN.")}</p>
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="block">
            <div className="mb-1.5 text-[13.5px] font-medium">{t("Токен доступу")}</div>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] px-3.5 focus-within:border-[var(--primary)]">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <input autoFocus type="password" value={token} onChange={(e) => setToken(e.target.value)} className="h-11 w-full bg-transparent text-[15px] outline-none" />
            </div>
          </label>
          {err && <div className="text-[14px] text-[var(--danger)]">{err}</div>}
          <PrimaryButton type="submit" disabled={busy || !token.trim()}>
            {t("Увійти")}
          </PrimaryButton>
        </form>
        <button onClick={() => set({ demo: true })} className="mt-6 text-[14px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t("Або переглянути демо без входу")}
        </button>
        <div className="mt-8 text-[12.5px] text-muted-foreground">LemonSees · by Altumptic</div>
      </div>
    </div>
  );
}
