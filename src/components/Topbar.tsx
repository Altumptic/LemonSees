// Верхня панель: клікабельні хлібні крихти з меню, перемикач хоста, тривоги,
// швидкі дії, стан двигуна, пошук, тема та меню застосунку.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  FlaskConical,
  Globe,
  Keyboard,
  Languages,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Server,
  Settings as SettingsIcon,
  ShieldAlert,
  Siren,
  Sun,
  Info,
  CircleHelp,
} from "lucide-react";
import { api, store, useAppState, useHostSelection } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { isElectron, useSettings, type Lang } from "@/lib/settings";
import { fmtWhen, type Incident, type MonitorEvent } from "@/lib/types";
import { GROUPS, SECTIONS, go, type Section, type Tab } from "@/nav";
import { SeverityBadge, StatusDot } from "@/components/ui";

/* ---------------- Поповер ---------------- */

function Popover({
  trigger,
  children,
  align = "left",
  width = 280,
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="no-drag relative">
      {trigger(open, () => setOpen((v) => !v))}
      {open && (
        <div
          className={`glass-strong pop-in absolute top-[calc(100%+8px)] z-40 max-h-[70vh] overflow-y-auto rounded-2xl p-1.5 ${align === "right" ? "right-0" : "left-0"}`}
          style={{ width, background: "var(--modal-bg)" }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  children,
  hint,
  active,
  onClick,
}: {
  icon?: typeof Bell;
  children: ReactNode;
  hint?: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[14px] transition-colors hover:bg-[var(--hover)] ${active ? "text-[var(--primary)]" : ""}`}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-80" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[12px] text-muted-foreground">{hint}</span>}
      {active && <Check className="h-4 w-4 shrink-0" />}
    </button>
  );
}

const MenuLabel = ({ children }: { children: ReactNode }) => <div className="px-3 pb-1 pt-2 text-[12px] font-medium text-muted-foreground">{children}</div>;
const MenuSep = () => <div className="my-1.5 h-px bg-[var(--hairline)]" />;

const iconBtn = "grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-[var(--hover)] hover:text-foreground";

/* ---------------- Хлібні крихти ---------------- */

function Crumb({ children, open, onClick, strong }: { children: ReactNode; open?: boolean; onClick: () => void; strong?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex min-w-0 items-center gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--hover)] ${
        strong ? "font-medium text-[var(--fg-display)]" : "text-muted-foreground hover:text-foreground"
      } ${open ? "bg-[var(--hover)]" : ""}`}
    >
      <span className="truncate">{children}</span>
      <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

function Breadcrumbs({ section, tab }: { section: Section; tab: Tab }) {
  const { t } = useI18n();
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center text-[14.5px]">
      <span className="hidden lg:contents">
        <Popover trigger={(o, toggle) => <Crumb open={o} onClick={toggle}>{t(section.group)}</Crumb>}>
          {(close) =>
            GROUPS.map((g) => (
              <div key={g}>
                <MenuLabel>{t(g)}</MenuLabel>
                {SECTIONS.filter((s) => s.group === g).map((s) => (
                  <MenuItem key={s.id} icon={s.icon} active={s.id === section.id} onClick={() => (close(), go(s.id))}>
                    {t(s.label)}
                  </MenuItem>
                ))}
              </div>
            ))
          }
        </Popover>
        <span className="px-0.5 text-[var(--hairline-strong)]">/</span>
      </span>
      <Popover
        width={300}
        trigger={(o, toggle) => (
          <Crumb open={o} onClick={toggle} strong={section.tabs.length === 1}>
            {t(section.label)}
          </Crumb>
        )}
      >
        {(close) =>
          SECTIONS.filter((s) => s.group === section.group).map((s) => (
            <MenuItem key={s.id} icon={s.icon} active={s.id === section.id} hint={s.tabs.length > 1 ? s.tabs.length : undefined} onClick={() => (close(), go(s.id))}>
              {t(s.label)}
            </MenuItem>
          ))
        }
      </Popover>
      {section.tabs.length > 1 && (
        <>
          <span className="hidden px-0.5 text-[var(--hairline-strong)] sm:inline">/</span>
          <span className="hidden min-w-0 sm:contents">
            <Popover trigger={(o, toggle) => <Crumb open={o} onClick={toggle} strong>{t(tab.label)}</Crumb>}>
              {(close) =>
                section.tabs.map((x) => (
                  <MenuItem key={x.id} icon={x.icon} active={x.id === tab.id} onClick={() => (close(), go(`${section.id}/${x.id}`))}>
                    {t(x.label)}
                  </MenuItem>
                ))
              }
            </Popover>
          </span>
        </>
      )}
    </nav>
  );
}

/* ---------------- Перемикач хоста ---------------- */

function HostSwitcher() {
  const { hosts } = useAppState();
  const [sel, setSel] = useHostSelection();
  const { t } = useI18n();
  const active = hosts.find((h) => h.id === sel) ?? hosts.find((h) => h.status === "online") ?? hosts[0];
  const online = hosts.filter((h) => h.status === "online").length;
  return (
    <Popover
      align="right"
      width={300}
      trigger={(o, toggle) => (
        <button
          onClick={toggle}
          title={t("Активний хост для сторінок зі скануванням")}
          className={`hidden h-10 max-w-[210px] shrink-0 items-center gap-2 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] pl-3 pr-2 text-[14px] shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--surface-raised)] sm:inline-flex ${o ? "bg-[var(--surface-raised)]" : ""}`}
        >
          {active ? <StatusDot status={active.status} /> : <Server className="h-4 w-4 text-muted-foreground" />}
          <span className="truncate font-medium">{active ? active.name : t("Немає хостів")}</span>
          <span className="num shrink-0 text-[12px] text-muted-foreground">
            {online}/{hosts.length}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>{t("Хости")}</MenuLabel>
          {hosts.length === 0 && <div className="px-3 py-2 text-[13.5px] text-muted-foreground">{t("Ще немає підключених хостів.")}</div>}
          {hosts.map((h) => (
            <button
              key={h.id}
              onClick={() => (setSel(h.id), close())}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[14px] hover:bg-[var(--hover)]"
            >
              <StatusDot status={h.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{h.name}</span>
                <span className="mono block truncate text-[12px] text-muted-foreground">{h.host}</span>
              </span>
              {h.metrics && <span className="num shrink-0 text-[12px] text-muted-foreground">CPU {Math.round(h.metrics.cpu)}%</span>}
              {active?.id === h.id && <Check className="h-4 w-4 shrink-0 text-[var(--primary)]" />}
            </button>
          ))}
          <MenuSep />
          <MenuItem icon={Plus} onClick={() => (close(), go("infra/hosts?new"))}>{t("Додати хост")}</MenuItem>
          <MenuItem icon={Server} onClick={() => (close(), go("infra/hosts"))}>{t("Керувати хостами")}</MenuItem>
        </>
      )}
    </Popover>
  );
}

/* ---------------- Тривоги ---------------- */

function useAlerts() {
  const { connected, demo } = useAppState();
  const { settings } = useSettings();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [down, setDown] = useState<MonitorEvent[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const notify = useRef(settings.notify);
  notify.current = settings.notify;
  useEffect(() => {
    seen.current = null;
    const load = () => {
      api
        .listIncidents()
        .then((list) => {
          // Нові критичні/високі — системне сповіщення (перше завантаження лише запамʼятовує)
          const prev = seen.current;
          if (prev && notify.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
            for (const i of list) {
              if (!prev.has(i.id) && i.status === "open" && (i.severity === "critical" || i.severity === "high")) {
                const n = new Notification(`LemonSees · ${i.severity.toUpperCase()}`, { body: i.title, icon: "/logo.svg", tag: i.id });
                n.onclick = () => {
                  window.focus();
                  go("soar/incidents");
                };
              }
            }
          }
          seen.current = new Set(list.map((i) => i.id));
          setIncidents(list);
        })
        .catch(() => {});
      api.monitorEvents().then((r) => setDown(r.events.filter((e) => !e.ok).slice(0, 5))).catch(() => {});
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [connected, demo]);
  const open = incidents.filter((i) => i.status === "open" || i.status === "investigating");
  return { open, down };
}

function AlertsBell() {
  const { t } = useI18n();
  const { open, down } = useAlerts();
  const crit = open.filter((i) => i.severity === "critical" || i.severity === "high").length;
  const count = open.length;
  return (
    <Popover
      align="right"
      width={380}
      trigger={(o, toggle) => (
        <button onClick={toggle} title={t("Тривоги")} className={`${iconBtn} relative ${o ? "bg-[var(--hover)]" : ""}`}>
          <Bell className="h-[18px] w-[18px]" />
          {count > 0 && (
            <span
              className="num absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-semibold text-white"
              style={{ background: crit ? "var(--danger)" : "var(--warning)" }}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between px-3 pb-1 pt-2">
            <span className="text-[15px] font-semibold text-[var(--fg-display)]">{t("Тривоги")}</span>
            <span className="text-[12.5px] text-muted-foreground">
              {count} {t("активних")} · {crit} {t("критичних")}
            </span>
          </div>
          {count === 0 && down.length === 0 && (
            <div className="px-3 py-6 text-center text-[14px] text-muted-foreground">{t("Усе спокійно. Активних тривог немає.")}</div>
          )}
          {open.slice(0, 6).map((i) => (
            <button key={i.id} onClick={() => (close(), go("soar/incidents"))} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--hover)]">
              <Siren className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">{i.title}</span>
                <span className="block text-[12px] text-muted-foreground">{fmtWhen(i.createdAt)}</span>
              </span>
              <SeverityBadge level={i.severity} />
            </button>
          ))}
          {down.length > 0 && (
            <>
              <MenuSep />
              <MenuLabel>{t("Даунтайм")}</MenuLabel>
              {down.slice(0, 3).map((e, n) => (
                <button key={n} onClick={() => (close(), go("uptime/status"))} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-[var(--hover)]">
                  <Globe className="h-4 w-4 shrink-0 text-[var(--danger)]" />
                  <span className="min-w-0 flex-1 truncate text-[14px]">{e.name}</span>
                  <span className="shrink-0 text-[12px] text-muted-foreground">{fmtWhen(e.at)}</span>
                </button>
              ))}
            </>
          )}
          <MenuSep />
          <MenuItem icon={ShieldAlert} onClick={() => (close(), go("soar/incidents"))}>{t("Усі інциденти")}</MenuItem>
        </>
      )}
    </Popover>
  );
}

/* ---------------- Швидкі дії ---------------- */

function QuickAdd() {
  const { t } = useI18n();
  return (
    <Popover
      align="right"
      width={260}
      trigger={(o, toggle) => (
        <button
          onClick={toggle}
          title={t("Створити")}
          className={`grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--primary-hover)] ${o ? "bg-[var(--primary-hover)]" : ""}`}
        >
          <Plus className="h-[18px] w-[18px]" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>{t("Створити")}</MenuLabel>
          <MenuItem icon={Server} onClick={() => (close(), go("infra/hosts?new"))}>{t("Хост (SSH)")}</MenuItem>
          <MenuItem icon={Siren} onClick={() => (close(), go("soar/incidents?new"))}>{t("Інцидент")}</MenuItem>
          <MenuItem icon={Globe} onClick={() => (close(), go("uptime/monitors?new"))}>{t("Монітор сайту")}</MenuItem>
          <MenuSep />
          <MenuLabel>{t("Запустити")}</MenuLabel>
          <MenuItem icon={ShieldAlert} onClick={() => (close(), go("edr/vulns"))}>{t("Сканування вразливостей")}</MenuItem>
          <MenuItem icon={Check} onClick={() => (close(), go("grc/compliance"))}>{t("Перевірку комплаєнсу")}</MenuItem>
        </>
      )}
    </Popover>
  );
}

/* ---------------- Меню застосунку ---------------- */

const LANGS: [Lang, string][] = [
  ["uk", "Українська"],
  ["en", "English"],
  ["ru", "Русский"],
  ["pl", "Polski"],
  ["zh", "中文"],
];

function AppMenu({ onShortcuts, authEnabled }: { onShortcuts: () => void; authEnabled: boolean }) {
  const { t } = useI18n();
  const { settings, set } = useSettings();
  return (
    <Popover
      align="right"
      width={280}
      trigger={(o, toggle) => (
        <button onClick={toggle} title={t("Меню")} className={`${iconBtn} ${o ? "bg-[var(--hover)]" : ""}`}>
          <CircleHelp className="h-[18px] w-[18px]" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={SettingsIcon} onClick={() => (close(), go("system/settings"))}>{t("Налаштування")}</MenuItem>
          <MenuItem icon={Keyboard} hint="?" onClick={() => (close(), onShortcuts())}>{t("Гарячі клавіші")}</MenuItem>
          <MenuItem icon={FlaskConical} active={settings.demo} onClick={() => set({ demo: !settings.demo })}>{t("Демо-режим")}</MenuItem>
          <MenuSep />
          <MenuLabel>
            <span className="inline-flex items-center gap-1.5"><Languages className="h-3.5 w-3.5" /> {t("Мова")}</span>
          </MenuLabel>
          {LANGS.map(([code, label]) => (
            <MenuItem key={code} active={settings.lang === code} onClick={() => set({ lang: code })}>
              {label}
            </MenuItem>
          ))}
          <MenuSep />
          <MenuItem icon={Info} onClick={() => (close(), go("system/settings?about"))}>{t("Про LemonSees")}</MenuItem>
          {authEnabled && (
            <MenuItem icon={LogOut} onClick={() => api.logout().finally(() => store.setAuth(false))}>
              {t("Вийти")}
            </MenuItem>
          )}
        </>
      )}
    </Popover>
  );
}

/* ---------------- Сама панель ---------------- */

export default function Topbar({
  section,
  tab,
  onMenu,
  onSearch,
  onShortcuts,
  authEnabled,
}: {
  section: Section;
  tab: Tab;
  onMenu: () => void;
  onSearch: () => void;
  onShortcuts: () => void;
  authEnabled: boolean;
}) {
  const { t } = useI18n();
  const { settings, set } = useSettings();
  const { connected, demo } = useAppState();
  const dark = settings.theme === "dark";
  return (
    <header
      className={`sticky top-0 z-30 flex h-[60px] items-center gap-2 border-b border-[var(--hairline)] px-3 backdrop-blur-md sm:px-5 lg:px-8 ${isElectron ? "drag-region" : ""}`}
      style={{ background: "var(--topbar-bg)", paddingRight: isElectron ? 150 : undefined } as CSSProperties}
    >
      <button onClick={onMenu} aria-label="Open menu" className={`${iconBtn} no-drag lg:hidden`}>
        <Menu className="h-5 w-5" />
      </button>

      <Breadcrumbs section={section} tab={tab} />

      <div className="no-drag ml-auto flex items-center gap-1.5">
        {demo ? (
          <button
            onClick={() => set({ demo: false })}
            title={t("Вимкнути демо-режим")}
            className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--accent-subtle)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--primary)] 2xl:inline-flex"
          >
            <FlaskConical className="h-3.5 w-3.5" /> {t("Демо")}
          </button>
        ) : (
          <span
            title={connected ? t("двигун ок") : t("немає зв'язку")}
            className="hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] text-muted-foreground xl:inline-flex"
          >
            <span className={`h-2 w-2 rounded-full ${connected ? "live-dot bg-[var(--success)]" : "bg-[var(--danger)]"}`} />
            {connected ? t("Наживо") : t("Офлайн")}
          </span>
        )}

        <button
          onClick={onSearch}
          className="hidden h-10 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] pl-3 pr-2 text-[14px] text-muted-foreground shadow-[var(--shadow-card)] transition-colors hover:text-foreground 2xl:inline-flex"
        >
          <Search className="h-4 w-4" />
          <span className="w-36 text-left">{t("Пошук…")}</span>
          <kbd className="rounded-md border border-[var(--hairline)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[11.5px]">Ctrl K</kbd>
        </button>
        <button onClick={onSearch} aria-label={t("Пошук…")} className={`${iconBtn} 2xl:hidden`}>
          <Search className="h-5 w-5" />
        </button>

        <HostSwitcher />
        <AlertsBell />
        <button onClick={() => set({ theme: dark ? "light" : "dark" })} title={dark ? t("Світла тема") : t("Темна тема")} className={iconBtn}>
          {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>
        <AppMenu onShortcuts={onShortcuts} authEnabled={authEnabled} />
        <QuickAdd />
      </div>
    </header>
  );
}
