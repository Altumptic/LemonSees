import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { HostStatus, ContainerState } from "@/lib/types";

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
    <section className={`glass rounded-xl ${className}`}>
      {(title || eyebrow || action) && (
        <header className="flex items-end justify-between gap-4 border-b border-[var(--hairline)] px-5 py-3.5">
          <div>
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && <h2 className="text-[15px] font-medium tracking-tight">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--hairline)] pb-6">
      <div className="max-w-2xl">
        <div className="eyebrow mb-2">{eyebrow}</div>
        <h1 className="text-3xl font-medium leading-tight tracking-tight md:text-[34px]">{title}</h1>
        {lede && <p className="mt-2 text-sm text-muted-foreground">{lede}</p>}
      </div>
      {action}
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
      className="inline-flex items-center gap-2 rounded-md border border-[var(--primary)]/40 bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] px-3.5 py-1.5 text-xs font-medium tracking-wide text-[var(--primary)] transition-colors hover:bg-[color-mix(in_oklab,var(--primary)_22%,transparent)] disabled:opacity-50"
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
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
        active
          ? "border-[var(--hairline-strong)] bg-white/[0.04] text-foreground"
          : "border-[var(--hairline)] bg-transparent text-muted-foreground hover:border-[var(--hairline-strong)] hover:text-foreground"
      }`}
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
      className={`grid h-7 w-7 place-items-center rounded-md border border-[var(--hairline)] bg-transparent text-muted-foreground transition-colors hover:border-[var(--hairline-strong)] disabled:opacity-40 ${
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
    <span className="relative grid h-4 w-4 place-items-center">
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === "online" || status === "connecting" ? "live-dot" : ""}`}
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
  const { c, label } = STATE_MAP[state] ?? STATE_MAP.exited;
  return (
    <span
      className="mono inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
      style={{
        color: c,
        background: `color-mix(in oklab, ${c} 10%, transparent)`,
        border: `1px solid color-mix(in oklab, ${c} 28%, transparent)`,
      }}
    >
      <span
        className={`h-1 w-1 rounded-full ${state === "running" || state === "restarting" ? "live-dot" : ""}`}
        style={{ backgroundColor: c }}
      />
      {label}
    </span>
  );
}

export function SeverityTag({ level }: { level: "critical" | "warning" | "info" }) {
  const map = {
    critical: { c: "var(--danger)", label: "критично" },
    warning: { c: "var(--warning)", label: "увага" },
    info: { c: "var(--muted-foreground)", label: "інфо" },
  } as const;
  const { c, label } = map[level];
  return (
    <span
      className="mono inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
      style={{
        color: c,
        background: `color-mix(in oklab, ${c} 10%, transparent)`,
        border: `1px solid color-mix(in oklab, ${c} 26%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

/* -------- Метрики -------- */

export function Bar({ value, tint }: { value: number; tint?: string }) {
  const color = tint ?? "var(--foreground)";
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.05]">
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
      <div className="mb-1 flex items-center justify-between text-[10px] tracking-[0.16em] text-muted-foreground">
        <span className="uppercase">{label}</span>
        <span className="num text-foreground/80">{String(Math.round(value)).padStart(2, "0")}%</span>
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
    <div className="glass-strong flex items-center gap-4 rounded-lg p-4">
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
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </div>
        <div className="num mt-0.5 text-2xl font-medium tracking-tight">
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
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="num mt-4 text-[32px] font-medium leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-2 text-[11px] text-muted-foreground">{sub}</div>}
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
      <div className="eyebrow mb-1">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mono w-full rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-[var(--hairline-strong)] focus:ring-1 focus:ring-[var(--ring)]"
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className={`glass-strong max-h-[85vh] w-full overflow-y-auto rounded-xl p-6 ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "oklch(0.14 0.005 250 / 0.97)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md border border-[var(--hairline)] text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
