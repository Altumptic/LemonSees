import { useEffect, useState, type CSSProperties, type ComponentType } from "react";
import {
  LayoutDashboard,
  ScrollText,
  MonitorSmartphone,
  Cpu,
  Cog,
  Shield,
  Bug,
  Waypoints,
  Cable,
  Crosshair,
  Search,
  Siren,
  Workflow,
  ShieldCheck,
  FileText,
  Server,
  Boxes,
  Network,
  HardDrive,
  Gauge,
  Globe,
  Activity,
  Wrench,
  Terminal,
  Database,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { isElectron } from "@/lib/settings";
import { Tabs } from "@/components/ui";
import Dashboard from "@/pages/Dashboard";
import Events from "@/pages/Events";
import Endpoints from "@/pages/Endpoints";
import Processes from "@/pages/Processes";
import Persistence from "@/pages/Persistence";
import Security from "@/pages/Security";
import Vulnerabilities from "@/pages/Vulnerabilities";
import Traffic from "@/pages/Traffic";
import Connections from "@/pages/Connections";
import Threats from "@/pages/Threats";
import Investigate from "@/pages/Investigate";
import Incidents from "@/pages/Incidents";
import Playbooks from "@/pages/Playbooks";
import Compliance from "@/pages/Compliance";
import Reports from "@/pages/Reports";
import Audit from "@/pages/Audit";
import Hosts from "@/pages/Hosts";
import Containers from "@/pages/Containers";
import Networks from "@/pages/Networks";
import Volumes from "@/pages/Volumes";
import Toolkit from "@/pages/Toolkit";
import TerminalPage from "@/pages/Terminal";
import DatabasePage from "@/pages/Database";
import UptimePage from "@/pages/Uptime";
import StatusPage from "@/pages/Status";
import MetricsPage from "@/pages/Metrics";
import SettingsPage from "@/pages/Settings";

type Nav = (path: string) => void;
type Tab = { id: string; label: string; icon: LucideIcon; render: ComponentType<{ go: Nav }> };
type Section = { id: string; label: string; group: string; icon: LucideIcon; tabs: Tab[] };

const wrap = (C: ComponentType): ComponentType<{ go: Nav }> => () => <C />;

const SECTIONS: Section[] = [
  {
    id: "siem", label: "Пульт · SIEM", group: "Операції", icon: LayoutDashboard,
    tabs: [
      { id: "overview", label: "Огляд", icon: LayoutDashboard, render: ({ go }) => <Dashboard go={go} /> },
      { id: "events", label: "Події", icon: ScrollText, render: wrap(Events) },
    ],
  },
  {
    id: "edr", label: "Кінцеві точки · EDR", group: "Операції", icon: MonitorSmartphone,
    tabs: [
      { id: "endpoints", label: "Кінцеві точки", icon: MonitorSmartphone, render: wrap(Endpoints) },
      { id: "processes", label: "Процеси", icon: Cpu, render: wrap(Processes) },
      { id: "persistence", label: "Персистентність", icon: Cog, render: wrap(Persistence) },
      { id: "posture", label: "Постура", icon: Shield, render: wrap(Security) },
      { id: "vulns", label: "Вразливості", icon: Bug, render: wrap(Vulnerabilities) },
    ],
  },
  {
    id: "ndr", label: "Мережа · NDR", group: "Операції", icon: Waypoints,
    tabs: [
      { id: "traffic", label: "Трафік", icon: Waypoints, render: wrap(Traffic) },
      { id: "connections", label: "Зʼєднання", icon: Cable, render: wrap(Connections) },
    ],
  },
  {
    id: "cti", label: "Розвідка · CTI", group: "Аналітика", icon: Crosshair,
    tabs: [
      { id: "threats", label: "Загрози", icon: Crosshair, render: wrap(Threats) },
      { id: "investigate", label: "Розвідка IP", icon: Search, render: wrap(Investigate) },
    ],
  },
  {
    id: "soar", label: "Реагування · SOAR", group: "Аналітика", icon: Siren,
    tabs: [
      { id: "incidents", label: "Інциденти", icon: Siren, render: wrap(Incidents) },
      { id: "playbooks", label: "Плейбуки", icon: Workflow, render: wrap(Playbooks) },
    ],
  },
  {
    id: "grc", label: "Управління · GRC", group: "Аналітика", icon: ShieldCheck,
    tabs: [
      { id: "compliance", label: "Комплаєнс", icon: ShieldCheck, render: wrap(Compliance) },
      { id: "reports", label: "Звіти", icon: FileText, render: wrap(Reports) },
      { id: "audit", label: "Аудит", icon: ScrollText, render: wrap(Audit) },
    ],
  },
  {
    id: "infra", label: "Інфраструктура", group: "Ресурси", icon: Server,
    tabs: [
      { id: "hosts", label: "Хости", icon: Server, render: wrap(Hosts) },
      { id: "metrics", label: "Метрики", icon: Gauge, render: wrap(MetricsPage) },
      { id: "containers", label: "Контейнери", icon: Boxes, render: wrap(Containers) },
      { id: "networks", label: "Мережі", icon: Network, render: wrap(Networks) },
      { id: "volumes", label: "Томи", icon: HardDrive, render: wrap(Volumes) },
    ],
  },
  {
    id: "uptime", label: "Аптайм · Сайти", group: "Ресурси", icon: Globe,
    tabs: [
      { id: "monitors", label: "Монітори", icon: Globe, render: wrap(UptimePage) },
      { id: "status", label: "Статус-борд", icon: Activity, render: wrap(StatusPage) },
    ],
  },
  {
    id: "tools", label: "Утиліти", group: "Ресурси", icon: Wrench,
    tabs: [
      { id: "toolkit", label: "Мережеві інструменти", icon: Wrench, render: wrap(Toolkit) },
      { id: "terminal", label: "Термінал", icon: Terminal, render: wrap(TerminalPage) },
      { id: "databases", label: "Бази даних", icon: Database, render: wrap(DatabasePage) },
    ],
  },
  {
    id: "system", label: "Система", group: "Ресурси", icon: SettingsIcon,
    tabs: [{ id: "settings", label: "Налаштування", icon: SettingsIcon, render: wrap(SettingsPage) }],
  },
];

const GROUPS = ["Операції", "Аналітика", "Ресурси"];

function usePath(): [string, string, Nav] {
  const parse = (): [string, string] => {
    const raw = location.hash.replace(/^#\/?/, "");
    const [sec, tab] = raw.split("/");
    const section = SECTIONS.find((s) => s.id === sec) ?? SECTIONS[0];
    const t = section.tabs.find((x) => x.id === tab) ?? section.tabs[0];
    return [section.id, t.id];
  };
  const [[sec, tab], set] = useState<[string, string]>(parse);
  useEffect(() => {
    const on = () => set(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go: Nav = (path) => (location.hash = `#/${path}`);
  return [sec, tab, go];
}

export default function App() {
  const [secId, tabId, go] = usePath();
  const { hosts, connected } = useAppState();
  const { t } = useI18n();

  const section = SECTIONS.find((s) => s.id === secId) ?? SECTIONS[0];
  const tab = section.tabs.find((x) => x.id === tabId) ?? section.tabs[0];
  const Active = tab.render;
  const online = hosts.filter((h) => h.status === "online").length;

  return (
    <div className="app-bg relative min-h-screen">
      <div className="relative z-10 flex min-h-screen">
        {/* Сайдбар */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--hairline)] lg:flex">
          <div className={`px-5 py-4 ${isElectron ? "drag-region" : ""}`}>
            <div className="text-[16px] font-bold tracking-tight text-[var(--fg-display)]">LemonSees</div>
            <div className="eyebrow mt-0.5" style={{ letterSpacing: "0.22em" }}>SOC Platform</div>
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
            {GROUPS.map((grp) => (
              <div key={grp}>
                <div className="eyebrow mb-2 px-2">{t(grp)}</div>
                <div className="flex flex-col gap-0.5">
                  {SECTIONS.filter((s) => s.group === grp).map((s) => {
                    const on = s.id === secId;
                    const Icon = s.icon;
                    return (
                      <div key={s.id}>
                        <button
                          onClick={() => go(s.id)}
                          className={`group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                            on ? "text-foreground" : "text-muted-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] hover:text-foreground"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" style={on ? { color: "var(--primary)" } : undefined} />
                          <span className="truncate font-medium tracking-tight">{t(s.label)}</span>
                        </button>
                        {/* Вкладені підрозділи активного розділу (Cloudflare-стиль) */}
                        {on && s.tabs.length > 1 && (
                          <div className="ml-[15px] mt-0.5 flex flex-col border-l border-[var(--hairline)] pl-3">
                            {s.tabs.map((x) => {
                              const active = x.id === tabId;
                              return (
                                <button
                                  key={x.id}
                                  onClick={() => go(`${s.id}/${x.id}`)}
                                  className={`relative -ml-3 flex items-center gap-2 rounded-md py-1 pl-3 pr-2 text-left text-[12.5px] transition-colors ${
                                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {active && <span className="absolute -left-[1px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-sm bg-[var(--primary)]" />}
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
          </nav>
        </aside>

        {/* Основна колонка */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className={`sticky top-0 z-20 flex items-center justify-end gap-4 border-b border-[var(--hairline)] px-6 py-2.5 lg:px-10 ${isElectron ? "drag-region" : ""}`}
            style={{ background: "var(--topbar-bg)", paddingRight: isElectron ? 148 : undefined } as CSSProperties}
          >
            <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>{t("хости")} {online}/{hosts.length}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "live-dot bg-[var(--success)]" : "bg-[var(--danger)]"}`} />
            </div>
          </header>

          <main className="min-w-0 flex-1 px-6 py-6 lg:px-10 lg:py-8">
            <div key={`${section.id}/${tab.id}`} className="mx-auto w-full max-w-[1600px] fade-in">
              <Active go={go} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
