import { useMemo, useState } from "react";
import { Play, Square, RotateCw, ScrollText, Trash2, Search } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import type { Container } from "@/lib/types";
import { PageHeader, Panel, StatePill, Bar, IconBtn, Modal } from "@/components/ui";

type Row = Container & { hostId: string; hostName: string };

export default function Containers() {
  const { hosts } = useAppState();
  const [q, setQ] = useState("");
  const [hostFilter, setHostFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [busy, setBusy] = useState<string>("");
  const [logView, setLogView] = useState<{ title: string; text: string } | null>(null);

  const all: Row[] = useMemo(
    () =>
      hosts.flatMap((h) =>
        h.containers.map((c) => ({ ...c, hostId: h.id, hostName: h.name })),
      ),
    [hosts],
  );

  const rows = all.filter(
    (c) =>
      (hostFilter === "all" || c.hostId === hostFilter) &&
      (stateFilter === "all" || c.state === stateFilter) &&
      (q === "" || c.name.includes(q) || c.image.includes(q)),
  );

  const act = async (row: Row, action: string) => {
    if (action === "remove" && !confirm(`Видалити контейнер «${row.name}» на ${row.hostName}? Це незворотно.`))
      return;
    if (action === "stop" && !confirm(`Зупинити «${row.name}» на ${row.hostName}?`)) return;
    const key = `${row.hostId}:${row.name}`;
    setBusy(key);
    try {
      await api.containerAction(row.hostId, action, row.name);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const showLogs = async (row: Row) => {
    setLogView({ title: `${row.name} @ ${row.hostName}`, text: "Завантажую логи…" });
    try {
      const r = await api.containerLogs(row.hostId, row.name, 400);
      setLogView({ title: `${row.name} @ ${row.hostName}`, text: r.logs || "(порожньо)" });
    } catch (e) {
      setLogView({ title: `${row.name} @ ${row.hostName}`, text: `Помилка: ${(e as Error).message}` });
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Навантаження"
        title="Контейнери"
        lede="Все, що крутиться на кожному хості. Дії летять через SSH-тунель і підтверджуються на віддаленому Docker."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Пошук за назвою чи образом…"
            className="mono w-full rounded-md border border-[var(--hairline)] bg-transparent py-2 pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-[var(--hairline-strong)] focus:ring-1 focus:ring-[var(--ring)]"
          />
        </div>

        <SelectRow
          value={hostFilter}
          onChange={setHostFilter}
          options={[["all", "Всі хости"], ...hosts.map((h) => [h.id, h.name] as const)]}
        />
        <SelectRow
          value={stateFilter}
          onChange={setStateFilter}
          options={[
            ["all", "Будь-який стан"],
            ["running", "працює"],
            ["restarting", "рестарт"],
            ["paused", "пауза"],
            ["exited", "зупинено"],
          ]}
        />
        <span className="mono ml-auto text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {rows.length} з {all.length}
        </span>
      </div>

      <Panel>
        <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
          <div className="mono grid grid-cols-12 gap-3 border-b border-[var(--hairline)] bg-white/[0.02] px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <div className="col-span-4">Контейнер</div>
            <div className="col-span-2">Хост</div>
            <div className="col-span-1">Стан</div>
            <div className="col-span-1">CPU</div>
            <div className="col-span-2">Пам'ять</div>
            <div className="col-span-2 text-right">Дії</div>
          </div>

          {rows.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              {all.length === 0 ? "Немає даних — додай хост або дочекайся першого опитування." : "Нічого не збігається."}
            </div>
          )}

          {rows.map((c) => {
            const key = `${c.hostId}:${c.name}`;
            const isBusy = busy === key;
            return (
              <div
                key={key}
                className={`grid grid-cols-12 items-center gap-3 border-b border-[var(--hairline)] px-4 py-3 text-sm last:border-b-0 hover:bg-white/[0.02] ${isBusy ? "opacity-50" : ""}`}
              >
                <div className="col-span-4 min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="mono truncate text-[11px] text-muted-foreground">
                    {c.image}
                    {c.ports ? ` · ${c.ports}` : ""}
                  </div>
                </div>
                <div className="mono col-span-2 truncate text-xs text-muted-foreground">{c.hostName}</div>
                <div className="col-span-1">
                  <StatePill state={c.state} />
                </div>
                <div className="col-span-1">
                  <div className="num text-[11px] text-muted-foreground">{c.cpuPct.toFixed(1)}%</div>
                  <div className="mt-1">
                    <Bar value={c.cpuPct} />
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="num text-[11px] text-muted-foreground">
                    {c.memUsedMb}
                    {c.memLimitMb ? ` / ${c.memLimitMb}` : ""} MB
                  </div>
                  <div className="mt-1">
                    <Bar value={c.memLimitMb ? Math.round((c.memUsedMb / c.memLimitMb) * 100) : 0} />
                  </div>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <IconBtn title="Запустити" disabled={isBusy || c.state === "running"} onClick={() => act(c, "start")}>
                    <Play className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn title="Зупинити" disabled={isBusy || c.state !== "running"} onClick={() => act(c, "stop")}>
                    <Square className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn title="Перезапустити" disabled={isBusy} onClick={() => act(c, "restart")}>
                    <RotateCw className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn title="Логи" disabled={isBusy} onClick={() => showLogs(c)}>
                    <ScrollText className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn title="Видалити" danger disabled={isBusy} onClick={() => act(c, "remove")}>
                    <Trash2 className="h-3 w-3" />
                  </IconBtn>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {logView && (
        <Modal title={`Логи · ${logView.title}`} onClose={() => setLogView(null)} wide>
          <pre className="mono max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--hairline)] bg-black/40 p-4 text-[11.5px] leading-relaxed text-muted-foreground">
            {logView.text}
          </pre>
        </Modal>
      )}
    </>
  );
}

function SelectRow({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mono rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground outline-none focus:border-[var(--hairline-strong)]"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v} className="bg-[var(--ink)]">
          {l}
        </option>
      ))}
    </select>
  );
}
