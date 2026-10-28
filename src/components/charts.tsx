// Легка SVG-бібліотека графіків без залежностей: лінійні, стовпчикові з накопиченням,
// кільцеві, теплова карта, радар. Малюються в реальних пікселях (чіткий текст) з підказками.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

/* ---------------- Палітри ---------------- */

export const SERIES = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

export const SEV_COLOR: Record<string, string> = {
  critical: "var(--danger)",
  high: "var(--sev-high)",
  medium: "var(--warning)",
  low: "var(--info)",
  info: "var(--text-disabled)",
};

/* ---------------- Утиліти ---------------- */

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** «Гарний» максимум осі: 1, 2, 2.5, 5 × 10^n */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const compact = (v: number) =>
  Math.abs(v) >= 1e9 ? `${+(v / 1e9).toFixed(1)}B` : Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : `${+v.toFixed(1)}`;

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(8, x + 14), Math.max(8, width - 196));
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[150px] max-w-[190px] rounded-xl border border-[var(--hairline-strong)] px-3 py-2 text-[12.5px] shadow-[var(--shadow-raised)]"
      style={{ left, top: Math.max(0, y - 12), background: "var(--modal-bg)" }}
    >
      {children}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string; value?: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
      {items.map((it) => (
        <span key={it.name} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />
          {it.name}
          {it.value != null && <span className="num text-foreground">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

/* ---------------- Лінійний / area графік ---------------- */

export type Series = { name: string; data: number[]; color?: string; area?: boolean };

export function LineChart({
  series,
  labels,
  height = 220,
  yMax,
  yFmt = compact,
  legend = true,
}: {
  series: Series[];
  labels?: string[];
  height?: number;
  yMax?: number;
  yFmt?: (v: number) => string;
  legend?: boolean;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(0, ...series.map((s) => s.data.length));
  const padL = 44;
  const padR = 10;
  const padT = 10;
  const padB = labels ? 26 : 10;
  const max = yMax ?? niceMax(Math.max(0, ...series.flatMap((s) => s.data)));
  const iw = Math.max(1, w - padL - padR);
  const ih = height - padT - padB;
  const x = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => padT + ih - (Math.min(v, max) / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const step = labels ? Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(iw / 80)))) : 1;

  return (
    <div>
      {legend && series.length > 1 && (
        <div className="mb-3">
          <Legend items={series.map((s, i) => ({ name: s.name, color: s.color ?? SERIES[i % SERIES.length] }))} />
        </div>
      )}
      <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        {w > 0 && n > 0 && (
          <svg
            width={w}
            height={height}
            className="block"
            onMouseMove={(e) => {
              const r = (e.currentTarget as SVGElement).getBoundingClientRect();
              const px = ((e.clientX - r.left) / r.width) * w;
              setHover(Math.max(0, Math.min(n - 1, Math.round(((px - padL) / iw) * (n - 1)))));
            }}
          >
            {ticks.map((tv) => (
              <g key={tv}>
                <line x1={padL} x2={w - padR} y1={y(tv)} y2={y(tv)} stroke="var(--hairline)" strokeDasharray={tv === 0 ? undefined : "3 4"} />
                <text x={padL - 8} y={y(tv) + 4} textAnchor="end" fontSize="11.5" fill="var(--muted-foreground)" className="num">
                  {yFmt(tv)}
                </text>
              </g>
            ))}
            {labels &&
              labels.map((l, i) =>
                i % step === 0 ? (
                  <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize="11.5" fill="var(--muted-foreground)">
                    {l}
                  </text>
                ) : null,
              )}
            {series.map((s, si) => {
              const c = s.color ?? SERIES[si % SERIES.length];
              if (s.data.length === 0) return null;
              const pts = s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
              const gid = `lg-${si}-${s.name.replace(/\W/g, "")}`;
              return (
                <g key={s.name}>
                  {(s.area ?? series.length === 1) && (
                    <>
                      <defs>
                        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor={c} stopOpacity="0.22" />
                          <stop offset="1" stopColor={c} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <polygon points={`${x(0)},${y(0)} ${pts.join(" ")} ${x(s.data.length - 1)},${y(0)}`} fill={`url(#${gid})`} />
                    </>
                  )}
                  <polyline points={pts.join(" ")} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </g>
              );
            })}
            {hover != null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="var(--hairline-strong)" />
                {series.map((s, si) =>
                  s.data[hover] != null ? (
                    <circle key={s.name} cx={x(hover)} cy={y(s.data[hover])} r="4" fill="var(--surface)" stroke={s.color ?? SERIES[si % SERIES.length]} strokeWidth="2" />
                  ) : null,
                )}
              </g>
            )}
          </svg>
        )}
        {w > 0 && n === 0 && <div className="grid h-full place-items-center text-[13px] text-muted-foreground">—</div>}
        {hover != null && w > 0 && (
          <Tooltip x={x(hover)} y={padT} width={w}>
            {labels?.[hover] && <div className="mb-1 font-medium text-[var(--fg-display)]">{labels[hover]}</div>}
            {series.map((s, si) => (
              <div key={s.name} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? SERIES[si % SERIES.length] }} />
                  {s.name}
                </span>
                <span className="num">{s.data[hover] != null ? yFmt(s.data[hover]) : "—"}</span>
              </div>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/* ---------------- Стовпчики з накопиченням ---------------- */

export function StackedBars({
  data,
  keys,
  height = 220,
  legend = true,
}: {
  data: { label: string; values: number[] }[];
  keys: { name: string; color: string }[];
  height?: number;
  legend?: boolean;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 36;
  const padB = 26;
  const padT = 8;
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(0, ...totals));
  const iw = Math.max(1, w - padL - 4);
  const ih = height - padT - padB;
  const bw = data.length ? iw / data.length : iw;
  const gap = Math.min(10, bw * 0.28);
  const y = (v: number) => (v / max) * ih;
  const step = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 64))));

  return (
    <div>
      {legend && (
        <div className="mb-3">
          <Legend items={keys.map((k, i) => ({ ...k, value: data.reduce((a, d) => a + (d.values[i] ?? 0), 0) }))} />
        </div>
      )}
      <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={w} height={height} className="block">
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={padL} x2={w} y1={padT + ih - f * ih} y2={padT + ih - f * ih} stroke="var(--hairline)" strokeDasharray={f ? "3 4" : undefined} />
                <text x={padL - 8} y={padT + ih - f * ih + 4} textAnchor="end" fontSize="11.5" fill="var(--muted-foreground)">
                  {compact(f * max)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              let acc = 0;
              const bx = padL + i * bw + gap / 2;
              return (
                <g key={i} onMouseEnter={() => setHover(i)}>
                  <rect x={padL + i * bw} y={padT} width={bw} height={ih} fill={hover === i ? "var(--hover)" : "transparent"} />
                  {d.values.map((v, k) => {
                    if (!v) return null;
                    const h = y(v);
                    acc += h;
                    return <rect key={k} x={bx} y={padT + ih - acc} width={Math.max(1, bw - gap)} height={Math.max(1, h - 1)} rx={Math.min(3, (bw - gap) / 3)} fill={keys[k]?.color} />;
                  })}
                  {i % step === 0 && (
                    <text x={bx + (bw - gap) / 2} y={height - 7} textAnchor="middle" fontSize="11.5" fill="var(--muted-foreground)">
                      {d.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hover != null && data[hover] && (
          <Tooltip x={padL + hover * bw + bw / 2} y={padT} width={w}>
            <div className="mb-1 flex justify-between gap-3 font-medium text-[var(--fg-display)]">
              {data[hover].label} <span className="num">{totals[hover]}</span>
            </div>
            {keys.map((k, i) =>
              data[hover].values[i] ? (
                <div key={k.name} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: k.color }} />
                    {k.name}
                  </span>
                  <span className="num">{data[hover].values[i]}</span>
                </div>
              ) : null,
            )}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/* ---------------- Кільцевий графік ---------------- */

export function Donut({
  items,
  size = 168,
  thickness = 22,
  center,
  sub,
  legend = true,
}: {
  items: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
  sub?: ReactNode;
  legend?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = items.reduce((a, b) => a + b.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  const shown = hover != null ? items[hover] : null;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline)" strokeWidth={thickness} />
          {total > 0 &&
            items.map((it, i) => {
              if (!it.value) return null;
              const len = (it.value / total) * c;
              const seg = (
                <circle
                  key={it.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={it.color}
                  strokeWidth={hover === i ? thickness + 4 : thickness}
                  strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                  strokeDashoffset={-off}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ transition: "stroke-width 120ms" }}
                />
              );
              off += len;
              return seg;
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="doto text-[30px] leading-none text-[var(--fg-display)]">{shown ? shown.value : (center ?? total)}</div>
            <div className="mt-1 max-w-[110px] truncate text-[12px] text-muted-foreground">{shown ? shown.label : sub}</div>
          </div>
        </div>
      </div>
      {legend && (
        <ul className="min-w-[140px] flex-1 space-y-2">
          {items.map((it, i) => (
            <li
              key={it.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-[14px] ${hover === i ? "bg-[var(--hover)]" : ""}`}
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: it.color }} />
                <span className="truncate">{it.label}</span>
              </span>
              <span className="num shrink-0 text-muted-foreground">
                {it.value}
                <span className="ml-1.5 text-[12px] opacity-70">{total ? Math.round((it.value / total) * 100) : 0}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Теплова карта ---------------- */

export function Heatmap({
  rows,
  cols,
  values,
  color = "var(--primary)",
  colEvery = 1,
}: {
  rows: string[];
  cols: string[];
  values: number[][];
  color?: string;
  colEvery?: number;
}) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const max = Math.max(1, ...values.flat());
  return (
    <div className="relative">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `minmax(40px,auto) repeat(${cols.length}, minmax(0,1fr))` }}>
        <div />
        {cols.map((c, i) => (
          <div key={i} className="truncate text-center text-[11px] text-muted-foreground">
            {i % colEvery === 0 ? c : ""}
          </div>
        ))}
        {rows.map((r, ri) => (
          <div key={r} className="contents">
            <div className="truncate pr-2 text-[12px] leading-[22px] text-muted-foreground">{r}</div>
            {cols.map((_, ci) => {
              const v = values[ri]?.[ci] ?? 0;
              const a = v ? 12 + (v / max) * 88 : 0;
              return (
                <div
                  key={ci}
                  onMouseEnter={() => setHover([ri, ci])}
                  onMouseLeave={() => setHover(null)}
                  className="h-[22px] rounded-[4px] transition-transform hover:scale-110"
                  style={{ background: v ? `color-mix(in oklab, ${color} ${a}%, var(--surface-raised))` : "var(--surface-raised)" }}
                />
              );
            })}
          </div>
        ))}
      </div>
      {hover && (
        <div className="mt-2 text-[12.5px] text-muted-foreground">
          {rows[hover[0]]} · {cols[hover[1]]}: <span className="num text-foreground">{values[hover[0]]?.[hover[1]] ?? 0}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- Радар ---------------- */

export function Radar({ items, size = 260, color = "var(--primary)" }: { items: { label: string; value: number }[]; size?: number; color?: string }) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 44;
  const n = items.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * R * (v / 100), cy + Math.sin(a) * R * (v / 100)] as const;
  };
  const poly = useMemo(() => items.map((it, i) => pt(i, Math.max(0, Math.min(100, it.value))).join(",")).join(" "), [items]); // eslint-disable-line react-hooks/exhaustive-deps
  if (n < 3) return null;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full max-w-[320px]">
      {[25, 50, 75, 100].map((l) => (
        <polygon key={l} points={items.map((_, i) => pt(i, l).join(",")).join(" ")} fill="none" stroke="var(--hairline)" />
      ))}
      {items.map((_, i) => {
        const [x, y] = pt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--hairline)" />;
      })}
      <polygon points={poly} fill={`color-mix(in oklab, ${color} 20%, transparent)`} stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {items.map((it, i) => {
        const [x, y] = pt(i, Math.max(0, Math.min(100, it.value)));
        const [lx, ly] = pt(i, 122);
        return (
          <g key={it.label}>
            <circle cx={x} cy={y} r="3.5" fill={color} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="var(--muted-foreground)">
              {it.label.length > 16 ? it.label.slice(0, 15) + "…" : it.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------- Міні-тренд для KPI ---------------- */

export function MiniTrend({ data, color = "var(--primary)", height = 36 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} />;
  const w = 120;
  const max = Math.max(1, ...data);
  const min = Math.min(...data);
  const span = Math.max(1, max - min);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - 3 - ((v - min) / span) * (height - 6)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
