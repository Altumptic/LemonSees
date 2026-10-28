// Розширені графіки аналітики: Sankey, Treemap, воронка, календарна теплова карта, шкала.
import { useState, type ReactNode } from "react";
import { SERIES, useWidth } from "./charts";

/* ---------------- Sankey (потоки між етапами) ---------------- */

export function Sankey({
  columns,
  links,
  height = 300,
  colorOf,
}: {
  columns: string[][];
  links: { from: string; to: string; value: number }[];
  height?: number;
  colorOf?: (node: string, col: number) => string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const nodeW = 12;
  const gap = 10;
  const labelPad = 120;
  const cols = columns.length;
  const inner = Math.max(1, w - labelPad * 2);
  const colX = (c: number) => labelPad + (cols <= 1 ? 0 : (c / (cols - 1)) * (inner - nodeW));
  const total = (n: string, c: number) => {
    const out = links.filter((l) => l.from === n).reduce((a, l) => a + l.value, 0);
    const inn = links.filter((l) => l.to === n).reduce((a, l) => a + l.value, 0);
    return c === 0 ? out : c === cols - 1 ? inn : Math.max(out, inn);
  };
  const colSum = columns.map((col, c) => col.reduce((a, n) => a + total(n, c), 0));
  const scale = Math.min(...columns.map((col, c) => (height - gap * Math.max(0, col.length - 1)) / Math.max(1, colSum[c])));
  const pos = new Map<string, { x: number; y: number; h: number; c: number; outY: number; inY: number }>();
  columns.forEach((col, c) => {
    let y = (height - (colSum[c] * scale + gap * Math.max(0, col.length - 1))) / 2;
    for (const n of col) {
      const h = Math.max(2, total(n, c) * scale);
      pos.set(`${c}:${n}`, { x: colX(c), y, h, c, outY: y, inY: y });
      y += h + gap;
    }
  });
  const color = (n: string, c: number) => colorOf?.(n, c) ?? SERIES[(columns[c].indexOf(n) + c * 2) % SERIES.length];
  const paths = links
    .filter((l) => l.value > 0)
    .map((l, i) => {
      const fc = columns.findIndex((col) => col.includes(l.from));
      const a = pos.get(`${fc}:${l.from}`);
      const b = pos.get(`${fc + 1}:${l.to}`);
      if (!a || !b) return null;
      const t = l.value * scale;
      const y0 = a.outY + t / 2;
      const y1 = b.inY + t / 2;
      a.outY += t;
      b.inY += t;
      const x0 = a.x + nodeW;
      const x1 = b.x;
      const mx = (x0 + x1) / 2;
      const on = !hover || hover === l.from || hover === l.to;
      return (
        <path key={i} d={`M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`} fill="none" stroke={color(l.from, fc)} strokeOpacity={on ? 0.34 : 0.06} strokeWidth={Math.max(1, t)}>
          <title>{`${l.from} → ${l.to}: ${l.value}`}</title>
        </path>
      );
    });
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} className="block">
          {paths}
          {[...pos.entries()].map(([k, p]) => {
            const n = k.slice(k.indexOf(":") + 1);
            const left = p.c === 0;
            return (
              <g key={k} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}>
                <rect x={p.x} y={p.y} width={nodeW} height={p.h} rx={3} fill={color(n, p.c)} />
                <text x={left ? p.x - 8 : p.x + nodeW + 8} y={p.y + p.h / 2 + 4} textAnchor={left ? "end" : "start"} fontSize="12" fill="var(--foreground)">
                  {n.length > 16 ? n.slice(0, 15) + "…" : n}
                  <tspan fill="var(--muted-foreground)"> {total(n, p.c)}</tspan>
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ---------------- Treemap (squarified) ---------------- */

type Cell = { label: string; value: number; color?: string };

export function Treemap({ items, height = 260 }: { items: Cell[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const data = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = data.reduce((a, b) => a + b.value, 0);
  const rects: { x: number; y: number; w: number; h: number; it: Cell; i: number }[] = [];
  if (w > 0 && total > 0) {
    const scale = (w * height) / total;
    let x = 0;
    let y = 0;
    let rw = w;
    let rh = height;
    type R = { v: number; it: Cell; i: number };
    let row: R[] = [];
    const worst = (r: R[], side: number) => {
      const s = r.reduce((a, b) => a + b.v, 0);
      const mx = Math.max(...r.map((b) => b.v));
      const mn = Math.min(...r.map((b) => b.v));
      return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    };
    const layout = (r: R[]) => {
      const s = r.reduce((a, b) => a + b.v, 0);
      if (rw >= rh) {
        const cw = s / rh;
        let cy = y;
        for (const b of r) {
          rects.push({ x, y: cy, w: cw, h: b.v / cw, it: b.it, i: b.i });
          cy += b.v / cw;
        }
        x += cw;
        rw -= cw;
      } else {
        const ch = s / rw;
        let cx = x;
        for (const b of r) {
          rects.push({ x: cx, y, w: b.v / ch, h: ch, it: b.it, i: b.i });
          cx += b.v / ch;
        }
        y += ch;
        rh -= ch;
      }
    };
    data.forEach((it, i) => {
      const cell = { v: it.value * scale, it, i };
      const side = Math.min(rw, rh);
      if (row.length && worst([...row, cell], side) > worst(row, side)) {
        layout(row);
        row = [];
      }
      row.push(cell);
    });
    if (row.length) layout(row);
  }
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {rects.map((r) => (
        <div
          key={r.i}
          title={`${r.it.label}: ${r.it.value}`}
          className="absolute overflow-hidden rounded-[10px] border-2 border-[var(--surface)] p-2.5 transition-opacity hover:opacity-85"
          style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: r.it.color ?? `color-mix(in oklab, ${SERIES[r.i % SERIES.length]} ${Math.max(45, 95 - r.i * 7)}%, var(--surface))` }}
        >
          {r.w > 64 && r.h > 36 && (
            <>
              <div className="truncate text-[13px] font-medium text-white">{r.it.label}</div>
              <div className="num text-[12px] text-white/85">
                {r.it.value.toLocaleString()} · {Math.round((r.it.value / total) * 100)}%
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Воронка ---------------- */

export function Funnel({ steps }: { steps: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const pct = (s.value / max) * 100;
        const conv = i > 0 && steps[i - 1].value ? Math.round((s.value / steps[i - 1].value) * 100) : null;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <div className="w-32 shrink-0 truncate text-[13.5px] text-muted-foreground">{s.label}</div>
            <div className="relative h-9 flex-1">
              <div
                className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-lg transition-all"
                style={{ width: `${Math.max(8, pct)}%`, background: s.color ?? `color-mix(in oklab, var(--primary) ${92 - i * 13}%, var(--surface))` }}
              >
                <span className="num text-[13px] font-semibold text-white">{s.value}</span>
              </div>
            </div>
            <div className="num w-12 shrink-0 text-right text-[12.5px] text-muted-foreground">{conv !== null ? `${conv}%` : ""}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Календарна теплова карта ---------------- */

export function CalendarHeatmap({ counts, weeks = 20, lang = "uk", color = "var(--primary)" }: { counts: Map<string, number>; weeks?: number; lang?: string; color?: string }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7; // 0 = Пн
  const start = new Date(today);
  start.setDate(today.getDate() - dow - (weeks - 1) * 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { d, key, v: counts.get(key) ?? 0 };
  });
  const max = Math.max(1, ...days.map((x) => x.v));
  const loc = lang === "zh" ? "zh-CN" : lang;
  const fmt = new Intl.DateTimeFormat(loc, { day: "numeric", month: "short" });
  const monthFmt = new Intl.DateTimeFormat(loc, { month: "short" });
  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-grid gap-[4px]" style={{ gridTemplateRows: "16px repeat(7, 15px)", gridAutoFlow: "column", gridAutoColumns: "15px" }}>
        {Array.from({ length: weeks }, (_, wk) => {
          const first = days[wk * 7];
          return [
            <div key={`m${wk}`} className="whitespace-nowrap text-[10.5px] leading-4 text-muted-foreground">
              {first.d.getDate() <= 7 ? monthFmt.format(first.d) : ""}
            </div>,
            ...days.slice(wk * 7, wk * 7 + 7).map((x) => (
              <div
                key={x.key}
                title={`${fmt.format(x.d)}: ${x.v}`}
                className="rounded-[4px]"
                style={{ background: x.d > today ? "transparent" : x.v ? `color-mix(in oklab, ${color} ${18 + (x.v / max) * 82}%, var(--surface-raised))` : "var(--surface-raised)" }}
              />
            )),
          ];
        })}
      </div>
    </div>
  );
}

/* ---------------- Шкала (gauge) ---------------- */

export function Gauge({ value, label, sub, color = "var(--primary)", size = 200 }: { value: number; label?: string; sub?: ReactNode; color?: string; size?: number }) {
  const v = Math.max(0, Math.min(100, value));
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  const pt = (p: number) => {
    const a = Math.PI * (1 - p / 100);
    return `${cx + r * Math.cos(a)},${cy - r * Math.sin(a)}`;
  };
  const arc = (to: number) => `M${pt(0)} A${r},${r} 0 0 1 ${pt(to)}`;
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <path d={arc(100)} fill="none" stroke="var(--hairline)" strokeWidth={14} strokeLinecap="round" />
        {v > 0.5 && <path d={arc(v)} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="34" fontFamily="var(--font-serif)" fill="var(--fg-display)">
          {Math.round(v)}%
        </text>
      </svg>
      {label && <div className="text-[14px] font-medium">{label}</div>}
      {sub && <div className="text-[12.5px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
