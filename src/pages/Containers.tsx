import { useMemo, useState } from "react";
import { Play, Square, RotateCw, ScrollText, Trash2, Search, Boxes } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import type { Container } from "@/lib/types";
import { PageHeader, Panel, StatePill, Bar, IconBtn, Modal, BarList, SectionHeader } from "@/components/ui";
import { Donut } from "@/components/charts";

type Row = Container & { hostId: string; hostName: string };

const ROW_TINT = "hover:bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]";
const HEAD_TINT = "bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]";

export default function Containers() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const { settings } = useSettings();
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
    const ask = settings.confirmDestructive;
    if (action === "remove" && ask && !confirm(`${t("Видалити контейнер")} «${row.name}» ${t("на")} ${row.hostName}? ${t("Це незворотно.")}`))
      return;
    if (action === "stop" && ask && !confirm(`${t("Зупинити")} «${row.name}» ${t("на")} ${row.hostName}?`)) return;
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
    setLogView({ title: `${row.name} @ ${row.hostName}`, text: t("Завантажую логи…") });
    try {
      const r = await api.containerLogs(row.hostId, row.name, 400);
      setLogView({ title: `${row.name} @ ${row.hostName}`, text: r.logs || t("(порожньо)") });
    } catch (e) {
      setLogView({ title: `${row.name} @ ${row.hostName}`, text: `${t("Помилка:")} ${(e as Error).message}` });
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={t("Навантаження")}
        title={t("Контейнери")}
        lede={t("Все, що крутиться на кожному хості. Дії летять через SSH-тунель і підтверджуються на віддаленому Docker.")}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Пошук за назвою чи образом…")}
            className="mono w-full rounded-md border border-[var(--hairline)] bg-transparent py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[var(--hairline-strong)] focus:ring-1 focus:ring-[var(--ring)]"
          />
        </div>

        <SelectRow
          value={hostFilter}
          onChange={setHostFilter}
          options={[["all", t("Всі хости")], ...hosts.map((h) => [h.id, h.name] as const)]}
        />
        <SelectRow
          value={stateFilter}
          onChange={setStateFilter}
          options={[
            ["all", t("Будь-який стан")],
            ["running", t("працює")],
            ["restarting", t("рестарт")],
            ["paused", t("пауза")],
            ["exited", t("зупинено")],
          ]}
        />
        <span className="ml-auto text-[12px] text-muted-foreground font-medium">
          {rows.length} {t("з")} {all.length}
        </span>
      </div>

      {all.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Panel>
            <SectionHeader icon={Boxes} title={t("Стан контейнерів")} />
            <Donut
              size={140}
              thickness={18}
              items={[
                { label: t("працює"), value: all.filter((r) => r.state === "running").length, color: "var(--success)" },
                { label: t("пауза / рестарт"), value: all.filter((r) => r.state === "paused" || r.state === "restarting").length, color: "var(--warning)" },
                { label: t("зупинено"), value: all.filter((r) => r.state === "exited" || r.state === "dead").length, color: "var(--danger)" },
                { label: t("створено"), value: all.filter((r) => r.state === "created").length, color: "var(--text-disabled)" },
              ]}
              sub={t("контейнерів")}
            />
          </Panel>
          <Panel>
            <SectionHeader icon={Boxes} title={t("Топ за CPU")} />
            <BarList items={[...all].sort((a, b) => b.cpuPct - a.cpuPct).slice(0, 6).map((r) => ({ label: r.name, value: Math.round(r.cpuPct * 10) / 10, sub: `${r.cpuPct.toFixed(1)}%` }))} />
          </Panel>
          <Panel>
            <SectionHeader icon={Boxes} title={t("Топ за памʼяттю")} />
            <BarList items={[...all].sort((a, b) => b.memUsedMb - a.memUsedMb).slice(0, 6).map((r) => ({ label: r.name, value: r.memUsedMb, sub: `${Math.round(r.memUsedMb)} MB`, color: "var(--c2)" }))} />
          </Panel>
        </div>
      )}

      <Panel>
        <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
          <div className={`mono grid grid-cols-12 gap-3 border-b border-[var(--hairline)] ${HEAD_TINT} px-4 py-2.5 text-[12px] text-muted-foreground font-medium`}>
            <div className="col-span-4">{t("Контейнер")}</div>
            <div className="col-span-2">{t("Хост")}</div>
            <div className="col-span-1">{t("Стан")}</div>
            <div className="col-span-1">CPU</div>
            <div className="col-span-2">{t("Пам'ять")}</div>
            <div className="col-span-2 text-right">{t("Дії")}</div>
          </div>

          {rows.length === 0 && (
            <div className="px-4 py-12 text-center text-[14.5px] text-muted-foreground">
              {all.length === 0 ? t("Немає даних — додай хост або дочекайся першого опитування.") : t("Нічого не збігається.")}
            </div>
          )}

          {rows.map((c) => {
            const key = `${c.hostId}:${c.name}`;
            const isBusy = busy === key;
            return (
              <div
                key={key}
                className={`grid grid-cols-12 items-center gap-3 border-b border-[var(--hairline)] px-4 py-3 text-[14.5px] last:border-b-0 ${ROW_TINT} ${isBusy ? "opacity-50" : ""}`}
              >
                <div className="col-span-4 min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="mono truncate text-[12.5px] text-muted-foreground">
                    {c.image}
                    {c.ports ? ` · ${c.ports}` : ""}
                  </div>
                </div>
                <div className="mono col-span-2 truncate text-[13px] text-muted-foreground">{c.hostName}</div>
                <div className="col-span-1">
                  <StatePill state={c.state} />
                </div>
                <div className="col-span-1">
                  <div className="num text-[12.5px] text-muted-foreground">{c.cpuPct.toFixed(1)}%</div>
                  <div className="mt-1">
                    <Bar value={c.cpuPct} />
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="num text-[12.5px] text-muted-foreground">
                    {c.memUsedMb}
                    {c.memLimitMb ? ` / ${c.memLimitMb}` : ""} MB
                  </div>
                  <div className="mt-1">
                    <Bar value={c.memLimitMb ? Math.round((c.memUsedMb / c.memLimitMb) * 100) : 0} />
                  </div>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <IconBtn title={t("Запустити")} disabled={isBusy || c.state === "running"} onClick={() => act(c, "start")}>
                    <Play className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn title={t("Зупинити")} disabled={isBusy || c.state !== "running"} onClick={() => act(c, "stop")}>
                    <Square className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn title={t("Перезапустити")} disabled={isBusy} onClick={() => act(c, "restart")}>
                    <RotateCw className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn title={t("Логи")} disabled={isBusy} onClick={() => showLogs(c)}>
                    <ScrollText className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn title={t("Видалити")} danger disabled={isBusy} onClick={() => act(c, "remove")}>
                    <Trash2 className="h-3 w-3" />
                  </IconBtn>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {logView && (
        <Modal title={`${t("Логи")} · ${logView.title}`} onClose={() => setLogView(null)} wide>
          <pre className="mono max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--hairline)] bg-[var(--code-bg)] p-4 text-[13px] leading-relaxed text-muted-foreground">
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
      className="rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[13px] text-muted-foreground outline-none focus:border-[var(--hairline-strong)] font-medium"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v} className="bg-[var(--ink)]">
          {l}
        </option>
      ))}
    </select>
  );
}
