import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { HostStatus, ContainerState } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--hairline)] pb-4">
      <div className="max-w-2xl">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="h-2.5 w-1 rounded-full bg-[var(--primary)]" />
          <span className="eyebrow">{eyebrow}</span>
        </div>
        <h1 className="text-[23px] font-semibold leading-tight tracking-tight md:text-[26px]">{title}</h1>
        {lede && <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">{lede}</p>}
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
      className="inline-flex items-center gap-2 rounded-lg bg-[var(--fg-display)] px-4 py-2 text-xs font-semibold tracking-wide text-[var(--background)] shadow-[var(--shadow-card)] transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40"
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
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
        active
          ? "border-[var(--primary)]/50 bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] text-[var(--primary)]"
          : "border-[var(--hairline)] bg-transparent text-muted-foreground hover:border-[var(--hairline-strong)] hover:text-foreground"
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
    <div className={`hero-card relative overflow-hidden rounded-xl p-5 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="mono text-[11px] uppercase tracking-[0.09em]" style={{ color: `color-mix(in oklab, ${ink} 62%, transparent)` }}>
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4" style={{ color: `color-mix(in oklab, ${ink} 55%, transparent)` }} />}
      </div>
      <div className="doto mt-3 text-[44px] leading-none" style={{ color: ink }}>
        {value}
      </div>
      {sub && (
        <div className="mt-2 text-[12px] font-medium" style={{ color: `color-mix(in oklab, ${ink} 72%, transparent)` }}>
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
      className="mono inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors"
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
  const { t } = useI18n();
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
      className="mono inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
      style={{
        color: c,
        background: `color-mix(in oklab, ${c} 10%, transparent)`,
        border: `1px solid color-mix(in oklab, ${c} 26%, transparent)`,
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
    <div className="glass rounded-xl p-5 transition-colors hover:border-[var(--hairline-strong)]">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="doto mt-3 text-[32px] leading-none">{value}</div>
      {sub && <div className="mt-2 text-[11px] text-muted-foreground">{sub}</div>}
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
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  const c = toneColor(tone);
  return (
    <div className="glass relative overflow-hidden rounded-xl p-5 transition-colors hover:border-[var(--hairline-strong)]">
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: c, opacity: tone === "neutral" ? 0.25 : 0.7 }} />
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        {Icon && <Icon className="h-3.5 w-3.5" style={{ color: tone === "neutral" ? "var(--muted-foreground)" : c }} />}
      </div>
      <div className="doto mt-3 text-[32px] leading-none">{value}</div>
      {sub && <div className="mt-2 text-[11px] text-muted-foreground">{sub}</div>}
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
        <span className="num text-lg font-medium leading-none">
          {Math.round(v)}
          <span className="text-[10px] text-muted-foreground">{suffix}</span>
        </span>
        {label && <span className="mono mt-0.5 text-[8px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>}
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
      className="mono inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em]"
      style={{
        color,
        background: `color-mix(in oklab, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 28%, transparent)`,
      }}
    >
      {dot && <span className="h-1 w-1 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="mono rounded border border-[var(--hairline)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
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
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--hairline)] bg-white/[0.02]">
            <Icon className="h-4 w-4 text-[var(--primary)]" />
          </span>
        )}
        <div>
          <div className="text-[15px] font-medium tracking-tight">{title}</div>
          {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
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
    <div className="glass grid place-items-center gap-4 rounded-2xl px-6 py-16 text-center">
      {Icon && (
        <span
          className="grid h-14 w-14 place-items-center rounded-2xl border border-[var(--hairline-strong)] text-[var(--primary)]"
          style={{ background: "var(--surface-raised)" }}
        >
          <Icon className="h-6 w-6" />
        </span>
      )}
      <div>
        <div className="text-[15px] font-semibold tracking-tight">{title}</div>
        {hint && <div className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">{hint}</div>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Права висувна панель. */
export function Drawer({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="glass-strong h-full w-full max-w-md overflow-y-auto p-6"
        style={{ background: "var(--modal-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-base font-medium tracking-tight">{title}</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--hairline)] text-muted-foreground hover:text-foreground">
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
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
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
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-md border border-[var(--hairline)] bg-white/[0.02] px-2 py-1">
        {value && <StatusDot status={hosts.find((h) => h.id === value)?.status ?? "offline"} />}
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="mono bg-transparent text-xs outline-none"
        >
          {hosts.map((h) => (
            <option key={h.id} value={h.id} className="bg-[var(--ink)]">
              {h.name}
            </option>
          ))}
        </select>
      </div>
      {right}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-[var(--hairline)] px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-[var(--hairline-strong)] hover:text-foreground disabled:opacity-50"
        >
          <span className={loading ? "animate-spin" : ""}>↻</span>
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
    <div className="mb-6 flex flex-wrap items-center gap-1 border-b border-[var(--hairline)]">
      {items.map((it) => {
        const on = active === it.id;
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className={`group relative -mb-px inline-flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {Icon && <Icon className={`h-3.5 w-3.5 ${on ? "text-[var(--primary)]" : ""}`} />}
            {it.label}
            {it.badge != null && (
              <span className="mono rounded-full bg-[color-mix(in_oklab,var(--primary)_20%,transparent)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--primary)]">
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
      <div className="mono absolute right-1 top-0 text-[10px] text-muted-foreground">
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
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
            <span className="truncate">{it.label}</span>
            <span className="num shrink-0 text-muted-foreground">
              {it.sub ?? it.value}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-[1px] bg-white/[0.06]">
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

/** Геокарта (equirectangular) — точки атак за координатами. */
export function MapPlot({ points, height = 260 }: { points: { lon: number; lat: number; count: number; label: string }[]; height?: number }) {
  const w = 560;
  const h = height;
  const toX = (lon: number) => ((lon + 180) / 360) * w;
  const toY = (lat: number) => ((90 - lat) / 180) * h;
  const max = Math.max(1, ...points.map((p) => p.count));
  const pid = "mapdots";
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" style={{ background: "var(--surface)" }}>
        <defs>
          <pattern id={pid} width="11" height="11" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill="var(--hairline-strong)" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill={`url(#${pid})`} opacity="0.5" />
        {Array.from({ length: 11 }, (_, i) => (
          <line key={`v${i}`} x1={(i * w) / 11} y1={0} x2={(i * w) / 11} y2={h} stroke="var(--hairline)" strokeWidth="0.4" />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={(i * h) / 6} x2={w} y2={(i * h) / 6} stroke="var(--hairline)" strokeWidth="0.4" />
        ))}
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="var(--hairline-strong)" strokeWidth="0.7" />
        {points.filter((p) => p.lat || p.lon).map((p, i) => {
          const r = 2.5 + (p.count / max) * 7;
          const x = toX(p.lon);
          const y = toY(p.lat);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={r + 4} fill="var(--danger)" opacity="0.12" />
              <circle cx={x} cy={y} r={r} fill="var(--danger)" opacity="0.85">
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
        style={{ background: "var(--modal-bg)" }}
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
