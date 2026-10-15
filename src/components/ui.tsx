import { useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { HostStatus, ContainerState } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { MiniTrend } from "./charts";
import { WORLD, WORLD_ROWS } from "@/lib/worldDots";
import { useSettings } from "@/lib/settings";

/* -------- Каркас -------- */

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass rounded-2xl ${className}`}>
      {(title || eyebrow || action) && (
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--hairline)] px-6 py-4">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h2 className="text-[16.5px] font-semibold tracking-tight">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div className="p-6">{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-3xl">
        <div className="eyebrow mb-2 text-[var(--primary)]">{eyebrow}</div>
        <h1 className="serif text-[32px] font-medium leading-[1.12] tracking-[-0.015em] md:text-[38px]">{title}</h1>
        {lede && <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground">{lede}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/* -------- Кнопки -------- */

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4.5 py-2.5 text-[14px] font-medium text-[var(--primary-foreground)] shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--primary-hover)] active:translate-y-px disabled:pointer-events-none disabled:opacity-45"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  active,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13.5px] font-medium transition-colors disabled:opacity-50 ${
        active
          ? "border-[color-mix(in_oklab,var(--primary)_45%,transparent)] bg-[var(--accent-subtle)] text-[var(--primary)]"
          : "border-[var(--hairline-strong)] bg-[var(--surface)] text-foreground/80 hover:bg-[var(--surface-raised)] hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* -------- Hero-картка (глянцевий зелений градієнт з великою цифрою) -------- */

export function HeroStat({
  label,
  value,
  sub,
  actions,
  icon: Icon,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const ink = "var(--background)";
  return (
    <div className={`hero-card relative overflow-hidden rounded-2xl p-6 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium" style={{ color: `color-mix(in oklab, ${ink} 66%, transparent)` }}>
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4" style={{ color: `color-mix(in oklab, ${ink} 55%, transparent)` }} />}
      </div>
      <div className="doto mt-3 text-[52px] leading-none" style={{ color: ink }}>
        {value}
      </div>
      {sub && (
        <div className="mt-2.5 text-[14px]" style={{ color: `color-mix(in oklab, ${ink} 72%, transparent)` }}>
          {sub}
        </div>
      )}
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Дія всередині інвертованої hero-картки. */
export function HeroAction({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-opacity hover:opacity-85"
      style={{ background: "color-mix(in oklab, var(--background) 16%, transparent)", color: "var(--background)" }}
    >
      {children}
    </button>
  );
}

export function IconBtn({
  children,
  title,
  danger,
  onClick,
  disabled,
}: {
  children: ReactNode;
  title: string;
  danger?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-9 w-9 place-items-center rounded-lg border border-[var(--hairline)] bg-[var(--surface)] text-muted-foreground transition-colors hover:bg-[var(--surface-raised)] disabled:opacity-40 ${
        danger ? "hover:text-[var(--danger)]" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* -------- Статуси -------- */

export const STATUS_LABEL: Record<HostStatus, string> = {
  online: "онлайн",
  connecting: "з'єднання",
  offline: "офлайн",
  error: "помилка",
};

export function statusColor(status: HostStatus): string {
  if (status === "online") return "var(--success)";
  if (status === "connecting") return "var(--warning)";
  return "var(--danger)";
}

export function StatusDot({ status }: { status: HostStatus }) {
  const c = statusColor(status);
  return (
    <span className="relative grid h-4 w-4 place-items-center" title={status}>
      <span
        className={`h-2 w-2 rounded-full ${status === "online" || status === "connecting" ? "live-dot" : ""}`}
        style={{
          backgroundColor: c,
          boxShadow: `0 0 0 3px color-mix(in oklab, ${c} 18%, transparent)`,
        }}
      />
    </span>
  );
}

const STATE_MAP: Record<ContainerState, { c: string; label: string }> = {
  running: { c: "var(--success)", label: "працює" },
  restarting: { c: "var(--warning)", label: "рестарт" },
  paused: { c: "var(--warning)", label: "пауза" },
  created: { c: "var(--muted-foreground)", label: "створено" },
  exited: { c: "var(--danger)", label: "зупинено" },
  dead: { c: "var(--danger)", label: "мертвий" },
};

export function StatePill({ state }: { state: ContainerState }) {
  const { t } = useI18n();
  const { c, label } = STATE_MAP[state] ?? STATE_MAP.exited;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium"
      style={{
        color: c,
        background: `color-mix(in oklab, ${c} 11%, transparent)`,
      }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${state === "running" || state === "restarting" ? "live-dot" : ""}`}
        style={{ backgroundColor: c }}
      />
      {t(label)}
    </span>
  );
}

export function SeverityTag({ level }: { level: "critical" | "warning" | "info" }) {
  const { t } = useI18n();
  const map = {
    critical: { c: "var(--danger)", label: "критично" },
    warning: { c: "var(--warning)", label: "увага" },
    info: { c: "var(--muted-foreground)", label: "інфо" },
  } as const;
  const { c, label } = map[level];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium"
      style={{
        color: c,
        background: `color-mix(in oklab, ${c} 11%, transparent)`,
      }}
    >
      {t(label)}
    </span>
  );
}

/* -------- Метрики -------- */

export function Bar({ value, tint }: { value: number; tint?: string }) {
  const color = tint ?? "var(--foreground)";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--hairline)]">
      <div
        className="h-full transition-[width] duration-700"
        style={{ width: `${Math.min(100, Math.max(2, value))}%`, background: color, opacity: 0.85 }}
      />
    </div>
  );
}

export function MiniMeter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-muted-foreground">
        <span>{label}</span>
        <span className="num text-foreground/85">{String(Math.round(value)).padStart(2, "0")}%</span>
      </div>
      <Bar value={value} />
    </div>
  );
}

export function RadialMetric({
  label,
  value,
  icon: Icon,
  unit = "%",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  unit?: string;
}) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, value) / 100) * c;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[var(--hairline)] bg-[var(--surface-raised)] p-4">
      <svg viewBox="0 0 72 72" className="h-14 w-14 -rotate-90">
        <circle cx="36" cy="36" r={r} stroke="var(--hairline)" strokeWidth="3" fill="none" />
        <circle
          cx="36"
          cy="36"
          r={r}
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 800ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div>
        <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="doto mt-0.5 text-[28px]">
          {Math.round(value)}
          <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>
        </div>
      </div>
    </div>
  );
}

export function Sparkline({
  data,
  height = 44,
  stroke = "var(--foreground)",
}: {
  data: number[];
  height?: number;
  stroke?: string;
}) {
  const w = 240;
  const h = height;
  if (data.length < 2) return <div className="mt-2 h-11 w-full" />;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - (v / 100) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-11 w-full">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

/* -------- Статистика -------- */

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="glass rounded-2xl p-6 transition-colors hover:border-[var(--hairline-strong)]">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="doto mt-3 text-[40px] leading-none text-[var(--fg-display)]">{value}</div>
      {sub && <div className="mt-2.5 text-[13px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ==================== Дизайн-система v2 (SOC & GRC) ==================== */

export type Tone = "ok" | "info" | "warning" | "critical" | "neutral";

export function toneColor(tone: Tone): string {
  return tone === "ok"
    ? "var(--success)"
    : tone === "info"
    ? "var(--info)"
    : tone === "warning"
    ? "var(--warning)"
    : tone === "critical"
    ? "var(--danger)"
    : "var(--muted-foreground)";
}

/** KPI-плитка з тоновою смугою й іконкою. */
export function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
  trend,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  trend?: number[];
  onClick?: () => void;
}) {
  const c = toneColor(tone);
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      className={`glass relative overflow-hidden rounded-2xl p-6 transition-colors hover:border-[var(--hairline-strong)] ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow flex items-center gap-2">
          {tone !== "neutral" && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />}
          {label}
        </span>
        {Icon && (
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
            style={{ background: tone === "neutral" ? "var(--surface-raised)" : `color-mix(in oklab, ${c} 11%, transparent)` }}
          >
            <Icon className="h-4 w-4" style={{ color: tone === "neutral" ? "var(--muted-foreground)" : c }} />
          </span>
        )}
      </div>
      <div className="doto mt-3 text-[40px] leading-none text-[var(--fg-display)]">{value}</div>
      {sub && <div className="mt-2.5 text-[13px] text-muted-foreground">{sub}</div>}
      {trend && trend.length > 1 && (
        <div className="mt-3 -mb-1">
          <MiniTrend data={trend} color={tone === "neutral" ? "var(--c2)" : c} />
        </div>
      )}
    </div>
  );
}

/** Кільцевий індикатор (гейдж) 0..100. */
export function ScoreRing({
  value,
  size = 84,
  color,
  label,
  suffix = "%",
}: {
  value: number;
  size?: number;
  color?: string;
  label?: string;
  suffix?: string;
}) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const off = c - (v / 100) * c;
  const col = color ?? "var(--primary)";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--hairline)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={col}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 800ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute grid place-items-center text-center">
        <span className="doto text-[22px] leading-none">
          {Math.round(v)}
          <span className="text-[11px] text-muted-foreground">{suffix}</span>
        </span>
        {label && <span className="mt-0.5 text-[10.5px] text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}

const SEV_MAP: Record<string, { c: string; label: string }> = {
  critical: { c: "var(--danger)", label: "критичний" },
  high: { c: "var(--danger)", label: "високий" },
  medium: { c: "var(--warning)", label: "середній" },
  low: { c: "var(--info)", label: "низький" },
  info: { c: "var(--muted-foreground)", label: "інфо" },
};

export function SeverityBadge({ level, labelText }: { level: string; labelText?: string }) {
  const { t } = useI18n();
  const { c, label } = SEV_MAP[level] ?? SEV_MAP.info;
  return <Pill color={c}>{labelText ?? t(label)}</Pill>;
}

const STATUS_MAP: Record<string, { c: string; label: string }> = {
  open: { c: "var(--danger)", label: "відкрито" },
  investigating: { c: "var(--warning)", label: "розслідування" },
  mitigated: { c: "var(--info)", label: "стримано" },
  closed: { c: "var(--success)", label: "закрито" },
};

export function IncidentStatusBadge({ status, labelText }: { status: string; labelText?: string }) {
  const { t } = useI18n();
  const { c, label } = STATUS_MAP[status] ?? STATUS_MAP.open;
  return <Pill color={c} dot>{labelText ?? t(label)}</Pill>;
}

const CONTROL_MAP: Record<string, { c: string; label: string }> = {
  pass: { c: "var(--success)", label: "пройдено" },
  fail: { c: "var(--danger)", label: "провалено" },
  unknown: { c: "var(--muted-foreground)", label: "невідомо" },
  attested: { c: "var(--success)", label: "атестовано" },
  na: { c: "var(--muted-foreground)", label: "не застос." },
  failed: { c: "var(--danger)", label: "провалено" },
};

export function ControlBadge({ status, labelText }: { status: string; labelText?: string }) {
  const { t } = useI18n();
  const { c, label } = CONTROL_MAP[status] ?? CONTROL_MAP.unknown;
  return <Pill color={c} dot>{labelText ?? t(label)}</Pill>;
}

/** Базова «пігулка». */
export function Pill({ children, color, dot }: { children: ReactNode; color: string; dot?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium"
      style={{
        color,
        background: `color-mix(in oklab, ${color} 11%, transparent)`,
      }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-md border border-[var(--hairline)] bg-[var(--surface-raised)] px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  sub,
  right,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-subtle)]">
            <Icon className="h-4.5 w-4.5 text-[var(--primary)]" />
          </span>
        )}
        <div>
          <div className="text-[17px] font-semibold tracking-tight text-[var(--fg-display)]">{title}</div>
          {sub && <div className="text-[13px] text-muted-foreground">{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass grid place-items-center gap-5 rounded-2xl px-6 py-16 text-center">
      {Icon && (
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[var(--accent-subtle)] text-[var(--primary)]">
          <Icon className="h-7 w-7" />
        </span>
      )}
      <div>
        <div className="serif text-[24px] font-medium tracking-tight text-[var(--fg-display)]">{title}</div>
        {hint && <div className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">{hint}</div>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Права висувна панель. */
export function Drawer({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "var(--scrim)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="glass-strong fade-in h-full w-full max-w-lg overflow-y-auto p-7"
        style={{ background: "var(--modal-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <EscClose onClose={onClose} />
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="serif text-[22px] font-medium tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-[var(--hover)] hover:text-foreground">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Тонка смуга-трек для прогресу/скору. */
export function Track({ value, tone = "neutral" }: { value: number; tone?: Tone }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--hairline)]">
      <div className="h-full transition-[width] duration-700" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: toneColor(tone) }} />
    </div>
  );
}

/** Компактний рядок вибору хоста + оновлення для підвкладок SOC-модулів. */
export function HostBar({
  hosts,
  value,
  onChange,
  onRefresh,
  loading,
  right,
}: {
  hosts: { id: string; name: string; status: HostStatus }[];
  value: string | null;
  onChange: (id: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
  right?: ReactNode;
}) {
  const { settings } = useSettings();
  // Автооновлення з налаштувань (0 — вручну). Не стріляємо, поки йде попередній скан.
  const latest = useRef({ onRefresh, loading });
  latest.current = { onRefresh, loading };
  useEffect(() => {
    if (!settings.refreshSec || !onRefresh) return;
    const id = setInterval(() => {
      const l = latest.current;
      if (!l.loading && document.visibilityState === "visible") l.onRefresh?.();
    }, settings.refreshSec * 1000);
    return () => clearInterval(id);
  }, [settings.refreshSec, !!onRefresh]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2.5">
      <div className="flex items-center gap-2 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] py-1.5 pl-3 pr-2 shadow-[var(--shadow-card)]">
        {value && <StatusDot status={hosts.find((h) => h.id === value)?.status ?? "offline"} />}
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-[160px] cursor-pointer bg-transparent py-0.5 text-[14px] font-medium outline-none"
        >
          {hosts.map((h) => (
            <option key={h.id} value={h.id} className="bg-[var(--ink)]">
              {h.name}
            </option>
          ))}
        </select>
      </div>
      {right}
      {onRefresh && settings.refreshSec > 0 && (
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
          {settings.refreshSec >= 60 ? `${settings.refreshSec / 60} min` : `${settings.refreshSec} s`}
        </span>
      )}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
          className={`${settings.refreshSec > 0 ? "" : "ml-auto"} inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] px-3.5 text-[14px] text-muted-foreground transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground disabled:opacity-50`}
        >
          <span className={`inline-block ${loading ? "animate-spin" : ""}`}>↻</span>
        </button>
      )}
    </div>
  );
}

/** Cloudflare-стиль: горизонтальні підвкладки з підкресленням активної. */
export function Tabs({
  items,
  active,
  onChange,
}: {
  items: { id: string; label: ReactNode; icon?: LucideIcon; badge?: ReactNode }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="no-scrollbar mb-7 flex items-center gap-1 overflow-x-auto border-b border-[var(--hairline)]">
      {items.map((it) => {
        const on = active === it.id;
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className={`group relative -mb-px inline-flex shrink-0 items-center gap-2 px-4 py-3 text-[14.5px] font-medium transition-colors ${
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {Icon && <Icon className={`h-4 w-4 ${on ? "text-[var(--primary)]" : ""}`} />}
            {it.label}
            {it.badge != null && (
              <span className="rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--primary)]">
                {it.badge}
              </span>
            )}
            <span className={`absolute inset-x-2 -bottom-px h-[2px] rounded-full transition-colors ${on ? "bg-[var(--primary)]" : "bg-transparent"}`} />
          </button>
        );
      })}
    </div>
  );
}

export function riskTone(score: number): Tone {
  return score >= 60 ? "critical" : score >= 35 ? "warning" : score >= 15 ? "info" : "ok";
}
export function scoreTone(pct: number): Tone {
  return pct >= 85 ? "ok" : pct >= 60 ? "info" : pct >= 40 ? "warning" : "critical";
}

/* ==================== Графіки (Nothing-стиль) ==================== */

/** Заповнений часовий ряд (area). data — сирі значення; max авто. */
export function AreaChart({
  data,
  height = 72,
  color = "var(--primary)",
  unit,
  fmt,
}: {
  data: number[];
  height?: number;
  color?: string;
  unit?: string;
  fmt?: (v: number) => string;
}) {
  const w = 320;
  const h = height;
  if (!data || data.length < 2)
    return <div className="grid place-items-center text-[11px] text-muted-foreground" style={{ height: h }}>—</div>;
  const max = Math.max(1, ...data);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - (v / max) * (h - 6) - 3]);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const cur = data[data.length - 1];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }}>
        <defs>
          <linearGradient id={`ac-${color.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#ac-${color.replace(/\W/g, "")})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="num absolute right-1 top-0 text-[12px] text-muted-foreground">
        {fmt ? fmt(cur) : cur}
        {unit ? ` ${unit}` : ""}
      </div>
    </div>
  );
}

/** Вертикальні статус-бари up/down (uptime timeline). */
export function StatusBars({ data, height = 34 }: { data: { ok: boolean | null }[]; height?: number }) {
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px]"
          style={{
            height: "100%",
            minWidth: 3,
            background:
              d.ok === null ? "var(--hairline-strong)" : d.ok ? "var(--success)" : "var(--danger)",
            opacity: d.ok === null ? 0.5 : 1,
          }}
          title={d.ok === null ? "no data" : d.ok ? "up" : "down"}
        />
      ))}
    </div>
  );
}

/** Горизонтальний список-барчарт. */
export function BarList({ items }: { items: { label: string; value: number; max?: number; sub?: string; color?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.max ?? i.value));
  return (
    <div className="space-y-3.5">
      {items.map((it, i) => (
        <div key={i}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-[14px]">
            <span className="truncate">{it.label}</span>
            <span className="num shrink-0 text-muted-foreground">
              {it.sub ?? it.value}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--hairline)]">
            <div className="h-full" style={{ width: `${Math.min(100, (it.value / max) * 100)}%`, background: it.color ?? "var(--primary)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Часова гістограма (обʼєм подій по бакетах). */
export function Histogram({ buckets, height = 64, color = "var(--primary)" }: { buckets: number[]; height?: number; color?: string }) {
  const max = Math.max(1, ...buckets);
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {buckets.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px]"
          style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 2 : 1, minWidth: 2, background: v > 0 ? color : "var(--hairline)" }}
          title={String(v)}
        />
      ))}
    </div>
  );
}

/** Геокарта (equirectangular): крапковий світ + джерела атак. */
const LAND = (() => {
  const pts: [number, number][] = [];
  WORLD_ROWS.forEach((hex, r) => {
    const bits = BigInt("0x" + hex).toString(2).padStart(WORLD.cols, "0");
    for (let c = 0; c < WORLD.cols; c++) if (bits[c] === "1") pts.push([c, r]);
  });
  return pts;
})();

export function MapPlot({ points }: { points: { lon: number; lat: number; count: number; label: string }[]; height?: number }) {
  const cell = 6;
  const w = WORLD.cols * cell;
  const h = WORLD.rows * cell;
  const toX = (lon: number) => ((lon + 180) / 360) * w;
  const toY = (lat: number) => ((WORLD.latTop - lat) / WORLD.latSpan) * h;
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface-raised)]">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full">
        {LAND.map(([c, r]) => (
          <circle key={`${c}-${r}`} cx={c * cell + cell / 2} cy={r * cell + cell / 2} r={1.55} fill="var(--hairline-strong)" />
        ))}
        {points
          .filter((p) => p.lat || p.lon)
          .sort((a, b) => a.count - b.count)
          .map((p, i) => {
            const r = 4 + Math.sqrt(p.count / max) * 13;
            const x = toX(p.lon);
            const y = toY(Math.max(-56, Math.min(84, p.lat)));
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={r * 1.9} fill="var(--danger)" opacity="0.08" />
                <circle cx={x} cy={y} r={r} fill="var(--danger)" opacity="0.22" />
                <circle cx={x} cy={y} r={Math.max(2.5, r * 0.42)} fill="var(--danger)">
                  <title>{p.label}: {p.count}</title>
                </circle>
              </g>
            );
          })}
      </svg>
    </div>
  );
}

/* -------- Форми -------- */

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[13.5px] font-medium text-foreground/85">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-[14.5px] outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-[var(--primary)] focus:ring-3 focus:ring-[var(--ring)]"
      />
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "var(--scrim)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`glass-strong pop-in max-h-[88vh] w-full overflow-y-auto rounded-2xl p-7 ${wide ? "max-w-4xl" : "max-w-xl"}`}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--modal-bg)" }}
      >
        <EscClose onClose={onClose} />
        <div className="mb-5 flex items-center justify-between">
          <h2 className="serif text-[24px] font-medium tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-[var(--hover)] hover:text-foreground"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Закриття модалок/панелей клавішею Escape. */
function EscClose({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);
  return null;
}

/** Плейсхолдер сторінки, поки довантажується її код. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="space-y-3">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton h-10 w-80" />
        <div className="skeleton h-4 w-[28rem] max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-32" />
        ))}
      </div>
      <div className="skeleton h-72" />
    </div>
  );
}
