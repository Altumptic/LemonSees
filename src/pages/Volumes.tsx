import { useMemo, useState } from "react";
import { HardDrive } from "lucide-react";
import { useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { PageHeader, Panel } from "@/components/ui";

const ROW_TINT = "hover:bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]";
const HEAD_TINT = "bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]";

export default function Volumes() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostFilter, setHostFilter] = useState("all");

  const all = useMemo(
    () =>
      hosts.flatMap((h) =>
        h.volumes.map((v) => ({ ...v, hostId: h.id, hostName: h.name })),
      ),
    [hosts],
  );

  const rows = all.filter((v) => hostFilter === "all" || v.hostId === hostFilter);

  return (
    <>
      <PageHeader
        eyebrow={t("Персистентність")}
        title={t("Томи")}
        lede={t("Кожен mount, що переживає рестарт, — одним списком.")}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={hostFilter}
          onChange={(e) => setHostFilter(e.target.value)}
          className="mono rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground outline-none focus:border-[var(--hairline-strong)]"
        >
          <option value="all" className="bg-[var(--ink)]">
            {t("Всі хости")}
          </option>
          {hosts.map((h) => (
            <option key={h.id} value={h.id} className="bg-[var(--ink)]">
              {h.name}
            </option>
          ))}
        </select>
        <span className="mono ml-auto text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {rows.length} {t("з")} {all.length}
        </span>
      </div>

      <Panel eyebrow={`${rows.length} ${t("томів")}`} title={t("Реєстр сховищ")}>
        <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
          <div className={`mono grid grid-cols-12 gap-3 border-b border-[var(--hairline)] ${HEAD_TINT} px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground`}>
            <div className="col-span-4">{t("Назва")}</div>
            <div className="col-span-2">{t("Драйвер")}</div>
            <div className="col-span-4">{t("Точка монтування")}</div>
            <div className="col-span-2">{t("Хост")}</div>
          </div>

          {rows.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              {t("Немає томів (або дані ще не зібрано).")}
            </div>
          )}

          {rows.map((v) => (
            <div
              key={`${v.hostId}:${v.name}`}
              className={`grid grid-cols-12 items-center gap-3 border-b border-[var(--hairline)] px-4 py-3 text-sm last:border-b-0 ${ROW_TINT}`}
            >
              <div className="col-span-4 min-w-0">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate font-medium">{v.name}</span>
                </div>
              </div>
              <div className="mono col-span-2 text-xs text-muted-foreground">{v.driver}</div>
              <div className="mono col-span-4 truncate text-[11px] text-muted-foreground">
                {v.mountpoint || "—"}
              </div>
              <div className="mono col-span-2 truncate text-xs text-muted-foreground">{v.hostName}</div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
