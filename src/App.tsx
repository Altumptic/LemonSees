import { useEffect, useState } from "react";
import { Activity, Server, Boxes, Network, HardDrive, Terminal } from "lucide-react";
import { useAppState } from "@/lib/api";
import Overview from "@/pages/Overview";
import Hosts from "@/pages/Hosts";
import Containers from "@/pages/Containers";
import Networks from "@/pages/Networks";
import Volumes from "@/pages/Volumes";
import TerminalPage from "@/pages/Terminal";

const NAV = [
  { to: "overview", label: "Огляд", icon: Activity },
  { to: "hosts", label: "Хости", icon: Server },
  { to: "containers", label: "Контейнери", icon: Boxes },
  { to: "networks", label: "Мережі", icon: Network },
  { to: "volumes", label: "Томи", icon: HardDrive },
  { to: "terminal", label: "Термінал", icon: Terminal },
] as const;

type Page = (typeof NAV)[number]["to"];

function usePage(): [Page, (p: Page) => void] {
  const read = (): Page => {
    const h = location.hash.replace(/^#\/?/, "");
    return (NAV.some((n) => n.to === h) ? h : "overview") as Page;
  };
  const [page, setPage] = useState<Page>(read);
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

  const online = hosts.filter((h) => h.status === "online").length;

  return (
    <div className="app-bg relative min-h-screen">
      <div className="relative z-10 flex min-h-screen">
        {/* Сайдбар */}
        <aside className="hidden w-60 shrink-0 border-r border-[var(--hairline)] px-4 py-6 lg:flex lg:flex-col">
          <div className="mb-8 flex items-center gap-2.5 px-2">
            <img
              src="/shok.jpg"
              alt="ШОК"
              className="h-10 w-10 rounded-md border border-[var(--hairline-strong)]"
            />
            <div>
              <div className="text-[15px] font-semibold tracking-tight">ШОК</div>
              <div className="eyebrow" style={{ letterSpacing: "0.28em" }}>
                Моніторинг
              </div>
            </div>
          </div>

          <div className="eyebrow mb-2 px-2">Флот</div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const active = page === item.to;
              const Icon = item.icon;
              return (
                <button
                  key={item.to}
                  onClick={() => go(item.to)}
                  className={`group flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                    active
                      ? "bg-white/[0.05] text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-[2px] rounded-sm transition-colors ${
                      active ? "bg-[var(--primary)]" : "bg-transparent"
                    }`}
                  />
                  <Icon className="h-3.5 w-3.5" />
                  <span className="tracking-tight">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3 px-2">
            <div className="border-t border-[var(--hairline)] pt-4">
              <div className="eyebrow mb-1">Режим</div>
              <div className="text-[12px] leading-relaxed text-muted-foreground">
                Без агентів. SSH-тунель до сервера. На віддалені машини нічого не встановлюється.
              </div>
            </div>
            <div className="mono flex items-center justify-between text-[10px] text-muted-foreground">
              <span>v1.0</span>
              <span className="flex items-center gap-1.5">
                <span
                  className={`h-1 w-1 rounded-full ${connected ? "live-dot bg-[var(--success)]" : "bg-[var(--danger)]"}`}
                />
                {connected ? "двигун ок" : "немає зв'язку"}
              </span>
            </div>
          </div>
        </aside>

        {/* Основна колонка */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--hairline)] px-6 py-3 backdrop-blur-xl lg:px-10"
            style={{ background: "oklch(0.13 0.005 250 / 0.55)" }}
          >
            <div className="mono flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              <span>шок</span>
              <span className="opacity-40">/</span>
              <span className="text-foreground">
                {NAV.find((n) => n.to === page)?.label ?? "Огляд"}
              </span>
            </div>
            <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>
                хости {online}/{hosts.length}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${connected ? "live-dot bg-[var(--success)]" : "bg-[var(--danger)]"}`}
              />
            </div>
          </header>

          <main className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-10">
            {page === "overview" && <Overview go={go} />}
            {page === "hosts" && <Hosts />}
            {page === "containers" && <Containers />}
            {page === "networks" && <Networks />}
            {page === "volumes" && <Volumes />}
            {page === "terminal" && <TerminalPage />}
          </main>

          <footer className="border-t border-[var(--hairline)] px-6 py-4 lg:px-10">
            <div className="mono flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>ШОК · Агентлес моніторинг серверів</span>
              <span>локально · 127.0.0.1</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
