import { useMemo, useState } from "react";
import { Network as NetworkIcon } from "lucide-react";
import { useAppState } from "@/lib/api";
import { PageHeader, Panel } from "@/components/ui";

export default function Networks() {
  const { hosts } = useAppState();
  const [hostFilter, setHostFilter] = useState("all");

  const all = useMemo(
    () =>
      hosts.flatMap((h) =>
        h.networks.map((n) => ({ ...n, hostId: h.id, hostName: h.name })),
      ),
    [hosts],
  );

  const rows = all.filter((n) => hostFilter === "all" || n.hostId === hostFilter);

  return (
    <>
      <PageHeader
        eyebrow="Фабрика"
        title="Мережі"
        lede="Bridge, overlay, macvlan — кожна точка підключення в одному реєстрі."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={hostFilter}
          onChange={(e) => setHostFilter(e.target.value)}
          className="mono rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground outline-none focus:border-[var(--hairline-strong)]"
        >
          <option value="all" className="bg-[var(--ink)]">
            Всі хости
          </option>
          {hosts.map((h) => (
            <option key={h.id} value={h.id} className="bg-[var(--ink)]">
              {h.name}
            </option>
          ))}
        </select>
        <span className="mono ml-auto text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {rows.length} з {all.length}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {rows.length === 0 && (
          <div className="rounded-xl border border-[var(--hairline)] px-4 py-12 text-center text-sm text-muted-foreground md:col-span-2">
            Немає мереж (або дані ще не зібрано).
          </div>
        )}
        {rows.map((n) => (
          <Panel
            key={`${n.hostId}:${n.id}`}
            eyebrow={`${n.driver} · ${n.scope}`}
            title={
              <span className="flex items-center gap-2">
                <NetworkIcon className="h-4 w-4 text-muted-foreground" />
                {n.name}
              </span>
            }
          >
            <dl className="mono grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
              <Row k="Хост" v={n.hostName} />
              <Row k="Драйвер" v={n.driver} />
              <Row k="Scope" v={n.scope} />
              <Row k="ID" v={n.id.slice(0, 12)} />
            </dl>
            <div className="mono mt-4 border-t border-[var(--hairline)] pt-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              docker network inspect {n.name}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="uppercase tracking-[0.18em] text-muted-foreground">{k}</dt>
      <dd className="truncate text-foreground/90">{v}</dd>
    </div>
  );
}
