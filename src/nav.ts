import type { ComponentType } from "react";
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
  ChartColumnBig,
  Grid3x3,
  FileLock2,
  Radar,
  Bot,
  ListChecks,
  EyeOff,
  Plug,
  type LucideIcon,
} from "lucide-react";

export type Nav = (path: string) => void;
export type PageProps = { go: Nav };
export type Loader = () => Promise<{ default: ComponentType<PageProps> }>;
export type Tab = { id: string; label: string; icon: LucideIcon; load: Loader; hint?: string };
export type Section = { id: string; label: string; group: string; icon: LucideIcon; tabs: Tab[] };

// Кожна сторінка — окремий чанк: стартує лише потрібне, решта догружається у фоні
export const SECTIONS: Section[] = [
  {
    id: "siem", label: "Пульт · SIEM", group: "Операції", icon: LayoutDashboard,
    tabs: [
      { id: "overview", label: "Огляд", icon: LayoutDashboard, load: () => import("@/pages/Dashboard") },
      { id: "analytics", label: "SOC-аналітика", icon: ChartColumnBig, load: () => import("@/pages/Analytics") },
      { id: "events", label: "Події", icon: ScrollText, load: () => import("@/pages/Events") },
      { id: "wazuh", label: "Wazuh", icon: Radar, load: () => import("@/pages/Wazuh") },
    ],
  },
  {
    id: "edr", label: "Кінцеві точки · EDR", group: "Операції", icon: MonitorSmartphone,
    tabs: [
      { id: "endpoints", label: "Кінцеві точки", icon: MonitorSmartphone, load: () => import("@/pages/Endpoints") },
      { id: "processes", label: "Процеси", icon: Cpu, load: () => import("@/pages/Processes") },
      { id: "persistence", label: "Персистентність", icon: Cog, load: () => import("@/pages/Persistence") },
      { id: "fim", label: "Цілісність файлів", icon: FileLock2, load: () => import("@/pages/Fim") },
      { id: "agents", label: "Агенти", icon: Bot, load: () => import("@/pages/Agents") },
      { id: "posture", label: "Постура", icon: Shield, load: () => import("@/pages/Security") },
      { id: "vulns", label: "Вразливості", icon: Bug, load: () => import("@/pages/Vulnerabilities") },
    ],
  },
  {
    id: "ndr", label: "Мережа · NDR", group: "Операції", icon: Waypoints,
    tabs: [
      { id: "traffic", label: "Трафік", icon: Waypoints, load: () => import("@/pages/Traffic") },
      { id: "connections", label: "Зʼєднання", icon: Cable, load: () => import("@/pages/Connections") },
    ],
  },
  {
    id: "cti", label: "Розвідка · CTI", group: "Аналітика", icon: Crosshair,
    tabs: [
      { id: "threats", label: "Загрози", icon: Crosshair, load: () => import("@/pages/Threats") },
      { id: "mitre", label: "MITRE ATT&CK", icon: Grid3x3, load: () => import("@/pages/Mitre") },
      { id: "investigate", label: "Розвідка IP", icon: Search, load: () => import("@/pages/Investigate") },
    ],
  },
  {
    id: "soar", label: "Реагування · SOAR", group: "Аналітика", icon: Siren,
    tabs: [
      { id: "incidents", label: "Інциденти", icon: Siren, load: () => import("@/pages/Incidents") },
      { id: "rules", label: "Правила виявлення", icon: ListChecks, load: () => import("@/pages/Rules") },
      { id: "playbooks", label: "Плейбуки", icon: Workflow, load: () => import("@/pages/Playbooks") },
    ],
  },
  {
    id: "grc", label: "Управління · GRC", group: "Аналітика", icon: ShieldCheck,
    tabs: [
      { id: "compliance", label: "Комплаєнс", icon: ShieldCheck, load: () => import("@/pages/Compliance") },
      { id: "reports", label: "Звіти", icon: FileText, load: () => import("@/pages/Reports") },
      { id: "audit", label: "Аудит", icon: ScrollText, load: () => import("@/pages/Audit") },
    ],
  },
  {
    id: "infra", label: "Інфраструктура", group: "Ресурси", icon: Server,
    tabs: [
      { id: "hosts", label: "Хости", icon: Server, load: () => import("@/pages/Hosts") },
      { id: "metrics", label: "Метрики", icon: Gauge, load: () => import("@/pages/Metrics") },
      { id: "containers", label: "Контейнери", icon: Boxes, load: () => import("@/pages/Containers") },
      { id: "networks", label: "Мережі", icon: Network, load: () => import("@/pages/Networks") },
      { id: "volumes", label: "Томи", icon: HardDrive, load: () => import("@/pages/Volumes") },
    ],
  },
  {
    id: "uptime", label: "Аптайм · Сайти", group: "Ресурси", icon: Globe,
    tabs: [
      { id: "monitors", label: "Монітори", icon: Globe, load: () => import("@/pages/Uptime") },
      { id: "status", label: "Статус-борд", icon: Activity, load: () => import("@/pages/Status") },
    ],
  },
  {
    id: "tools", label: "Утиліти", group: "Ресурси", icon: Wrench,
    tabs: [
      { id: "toolkit", label: "Мережеві інструменти", icon: Wrench, load: () => import("@/pages/Toolkit") },
      { id: "terminal", label: "Термінал", icon: Terminal, load: () => import("@/pages/Terminal") },
      { id: "databases", label: "Бази даних", icon: Database, load: () => import("@/pages/Database") },
    ],
  },
  {
    id: "system", label: "Система", group: "Ресурси", icon: SettingsIcon,
    tabs: [
      { id: "settings", label: "Налаштування", icon: SettingsIcon, load: () => import("@/pages/Settings") },
      { id: "privacy", label: "Безпека та мережа", icon: EyeOff, load: () => import("@/pages/Privacy") },
      { id: "integrations", label: "Інтеграції", icon: Plug, load: () => import("@/pages/Integrations") },
    ],
  },
];

export const GROUPS = ["Операції", "Аналітика", "Ресурси"];

export const go: Nav = (path) => {
  location.hash = `#/${path}`;
};

export function parseHash(): [string, string] {
  const raw = location.hash.replace(/^#\/?/, "").split("?")[0];
  const [sec, tab] = raw.split("/");
  const section = SECTIONS.find((s) => s.id === sec) ?? SECTIONS[0];
  const t = section.tabs.find((x) => x.id === tab) ?? section.tabs[0];
  return [section.id, t.id];
}
