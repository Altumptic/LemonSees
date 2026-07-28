import { useEffect, useState, type CSSProperties } from "react";
import {
  LayoutDashboard,
  Server,
  Boxes,
  Network,
  HardDrive,
  Terminal,
  Database,
  Shield,
  Crosshair,
  Siren,
  ShieldCheck,
  ScrollText,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { isElectron } from "@/lib/settings";
import Dashboard from "@/pages/Dashboard";
import Hosts from "@/pages/Hosts";
import Containers from "@/pages/Containers";
import Networks from "@/pages/Networks";
import Volumes from "@/pages/Volumes";
import TerminalPage from "@/pages/Terminal";
import DatabasePage from "@/pages/Database";
import SecurityPage from "@/pages/Security";
import ThreatsPage from "@/pages/Threats";
import IncidentsPage from "@/pages/Incidents";
import CompliancePage from "@/pages/Compliance";
import AuditPage from "@/pages/Audit";
import SettingsPage from "@/pages/Settings";

type NavItem = { to: string; label: string; icon: LucideIcon };
type NavGroup = { group: string | null; items: NavItem[] };

const NAV: NavGroup[] = [
  { group: null, items: [{ to: "dashboard", label: "Панель", icon: LayoutDashboard }] },
  {
    group: "Моніторинг",
    items: [
      { to: "hosts", label: "Хости", icon: Server },
      { to: "containers", label: "Контейнери", icon: Boxes },
      { to: "databases", label: "Бази даних", icon: Database },
      { to: "networks", label: "Мережі", icon: Network },
      { to: "volumes", label: "Томи", icon: HardDrive },
      { to: "terminal", label: "Термінал", icon: Terminal },
    ],
  },
  {
    group: "Безпека · SOC",
    items: [
      { to: "security", label: "Безпека", icon: Shield },
      { to: "threats", label: "Загрози", icon: Crosshair },
      { to: "incidents", label: "Інциденти", icon: Siren },
    ],
  },
  {
    group: "Управління · GRC",
    items: [
      { to: "compliance", label: "Комплаєнс", icon: ShieldCheck },
      { to: "audit", label: "Аудит", icon: ScrollText },
    ],
  },
  { group: "Система", items: [{ to: "settings", label: "Налаштування", icon: SettingsIcon }] },
];

const ALL = NAV.flatMap((g) => g.items);

function usePage(): [string, (p: string) => void] {
  const read = (): string => {
    const h = location.hash.replace(/^#\/?/, "");
    return ALL.some((n) => n.to === h) ? h : "dashboard";
  };
  const [page, setPage] = useState<string>(read);
  useEffect(() => {
    const onHash = () => setPage(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return [page, (p) => (location.hash = `#/${p}`)];
}

export default function App() {
  const [page, go] = usePage();
  const { hosts, connected } = useAppState();
  const { t } = useI18n();

  const online = hosts.filter((h) => h.status === "online").length;
  const current = ALL.find((n) => n.to === page);

  return (
    <div className="app-bg relative min-h-screen">
      <div className="relative z-10 flex min-h-screen">
        {/* Сайдбар */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--hairline)] lg:flex">
          <div className={`flex items-center gap-2.5 px-5 py-5 ${isElectron ? "drag-region" : ""}`}>
            <img src="/shok.jpg" alt="ШОК" className="h-9 w-9 rounded-md border border-[var(--hairline-strong)]" />
            <div>
              <div className="text-[15px] font-semibold tracking-tight">ШОК</div>
              <div className="eyebrow" style={{ letterSpacing: "0.24em" }}>SOC · GRC</div>
            </div>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
            {NAV.map((grp, gi) => (
              <div key={gi}>
                {grp.group && <div className="eyebrow mb-1.5 px-2">{t(grp.group)}</div>}
                <div className="flex flex-col gap-0.5">
                  {grp.items.map((item) => {
                    const active = page === item.to;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.to}
                        onClick={() => go(item.to)}
                        className={`group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                          active
                            ? "bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] text-foreground"
                            : "text-muted-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] hover:text-foreground"
                        }`}
                      >
                        <span className={`inline-block h-4 w-[2px] rounded-sm transition-colors ${active ? "bg-[var(--primary)]" : "bg-transparent"}`} />
                        <Icon className="h-3.5 w-3.5" />
                        <span className="tracking-tight">{t(item.label)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mono flex items-center justify-between border-t border-[var(--hairline)] px-5 py-3 text-[10px] text-muted-foreground">
            <span>v1.4.0</span>
            <span className="flex items-center gap-1.5">
              <span className={`h-1 w-1 rounded-full ${connected ? "live-dot bg-[var(--success)]" : "bg-[var(--danger)]"}`} />
              {connected ? t("двигун ок") : t("немає зв'язку")}
            </span>
          </div>
        </aside>

        {/* Основна колонка */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className={`sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--hairline)] px-6 py-3 backdrop-blur-xl lg:px-10 ${isElectron ? "drag-region" : ""}`}
            style={{ background: "var(--topbar-bg)", paddingRight: isElectron ? 148 : undefined } as CSSProperties}
          >
            <div className="mono flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              <span>шок</span>
              <span className="opacity-40">/</span>
              <span className="text-foreground">{t(current?.label ?? "Панель")}</span>
            </div>
            <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>{t("хости")} {online}/{hosts.length}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "live-dot bg-[var(--success)]" : "bg-[var(--danger)]"}`} />
            </div>
          </header>

          <main className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-10">
            {page === "dashboard" && <Dashboard go={go} />}
            {page === "hosts" && <Hosts />}
            {page === "containers" && <Containers />}
            {page === "databases" && <DatabasePage />}
            {page === "networks" && <Networks />}
            {page === "volumes" && <Volumes />}
            {page === "terminal" && <TerminalPage />}
            {page === "security" && <SecurityPage />}
            {page === "threats" && <ThreatsPage />}
            {page === "incidents" && <IncidentsPage />}
            {page === "compliance" && <CompliancePage />}
            {page === "audit" && <AuditPage />}
            {page === "settings" && <SettingsPage />}
          </main>

          <footer className="border-t border-[var(--hairline)] px-6 py-4 lg:px-10">
            <div className="mono flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>{t("ШОК · SOC & GRC платформа")}</span>
              <span>{t("локально · 127.0.0.1")}</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
