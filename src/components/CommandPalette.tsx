import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CornerDownLeft, Search, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  keywords?: string;
  run: () => void;
};

/** Швидкий перехід між модулями (Ctrl/⌘+K) — як у Wazuh, але з клавіатури. */
export default function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return items;
    return items.filter((it) => {
      const hay = `${it.label} ${it.hint ?? ""} ${it.keywords ?? ""}`.toLowerCase();
      return terms.every((w) => hay.includes(w));
    });
  }, [q, items]);

  useEffect(() => setIdx(0), [q]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const pick = (it: PaletteItem | undefined) => {
    if (!it) return;
    onClose();
    it.run();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[idx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" style={{ background: "var(--scrim)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Пошук модулів…")}
        className="glass-strong pop-in w-full max-w-[640px] overflow-hidden rounded-2xl"
        style={{ background: "var(--modal-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--hairline)] px-5">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={t("Куди перейти? Наприклад: процеси, інциденти, тема")}
            className="h-[60px] w-full bg-transparent text-[16.5px] outline-none placeholder:text-muted-foreground/70"
          />
          <kbd className="rounded-md border border-[var(--hairline)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[11.5px] text-muted-foreground">Esc</kbd>
        </div>
        <div ref={list} className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-[15px] text-muted-foreground">{t("Нічого не знайдено")}</div>
          ) : (
            results.map((it, i) => {
              const Icon = it.icon;
              const on = i === idx;
              return (
                <button
                  key={it.id}
                  data-idx={i}
                  onMouseMove={() => setIdx(i)}
                  onClick={() => pick(it)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    on ? "bg-[var(--accent-subtle)]" : ""
                  }`}
                >
                  {Icon && (
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                        on ? "bg-[var(--surface)] text-[var(--primary)]" : "bg-[var(--surface-raised)] text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[15px] ${on ? "font-medium text-[var(--fg-display)]" : ""}`}>{it.label}</span>
                    {it.hint && <span className="block truncate text-[13px] text-muted-foreground">{it.hint}</span>}
                  </span>
                  {on && <CornerDownLeft className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
