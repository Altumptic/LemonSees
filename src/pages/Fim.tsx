import { useCallback, useEffect, useState } from "react";
import { FileLock2, FileWarning, FileCheck2, FileX2, RotateCcw, Fingerprint } from "lucide-react";
import { api, useAppState, useHostSelection } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtWhen, type FimReport } from "@/lib/types";
import { EmptyState, GhostButton, HostBar, Kpi, PageHeader, Panel, Pill, SectionHeader } from "@/components/ui";
import { Donut } from "@/components/charts";

const STATUS: Record<string, { c: string; label: string }> = {
  ok: { c: "var(--success)", label: "без змін" },
  new: { c: "var(--info)", label: "базова лінія" },
  modified: { c: "var(--danger)", label: "змінено" },
  added: { c: "var(--warning)", label: "зʼявився" },
  missing: { c: "var(--text-disabled)", label: "відсутній" },
};

export default function FimPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostId, setHostId] = useHostSelection();
  const active = hostId ?? hosts.find((h) => h.status === "online")?.id ?? hosts[0]?.id ?? null;
  const [data, setData] = useState<FimReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const scan = useCallback((id: string, baseline = false) => {
    setLoading(true);
    setErr("");
    (baseline ? api.fimBaseline(id) : api.fim(id))
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setData(null);
    if (active) scan(active);
  }, [active, scan]);

  const files = data?.files ?? [];
  const sorted = [...files].sort((a, b) => order(a.status) - order(b.status) || a.path.localeCompare(b.path));
  const count = (s: string) => files.filter((f) => f.status === s).length;

  return (
    <>
      <PageHeader
        eyebrow={t("EDR · Цілісність")}
        title={t("Контроль цілісності файлів")}
        lede={t("SHA-256 і атрибути критичних системних файлів порівнюються з базовою лінією. Зміни автоматично стають інцидентами.")}
        action={
          active && (
            <GhostButton onClick={() => scan(active, true)} disabled={loading}>
              <RotateCcw className="h-4 w-4" /> {t("Нова базова лінія")}
            </GhostButton>
          )
        }
      />
      {hosts.length === 0 ? (
        <EmptyState icon={FileLock2} title={t("Немає хостів")} hint={t("Додай сервер, щоб відстежувати цілісність його файлів.")} />
      ) : (
        <>
          <HostBar hosts={hosts} value={active} onChange={setHostId} onRefresh={() => active && scan(active)} loading={loading} />
          {err && <div className="mb-4 rounded-xl border border-[var(--danger)]/30 bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-4 py-3 text-[14px] text-[var(--danger)]">{err}</div>}
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label={t("Під наглядом")} value={files.length} icon={Fingerprint} tone="neutral" />
            <Kpi label={t("Змінено")} value={count("modified") + count("added")} icon={FileWarning} tone={count("modified") + count("added") ? "critical" : "ok"} />
            <Kpi label={t("Без змін")} value={count("ok") + count("new")} icon={FileCheck2} tone="ok" />
            <Kpi label={t("Відсутні")} value={count("missing")} icon={FileX2} tone="neutral" sub={data?.baselineAt ? `${t("базова лінія")}: ${fmtWhen(data.baselineAt)}` : undefined} />
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Panel>
              <SectionHeader icon={FileLock2} title={t("Стан файлів")} />
              <Donut
                items={Object.keys(STATUS).map((k) => ({ label: t(STATUS[k].label), value: count(k), color: STATUS[k].c }))}
                sub={t("файлів")}
              />
            </Panel>
            <Panel className="xl:col-span-2">
              <SectionHeader icon={Fingerprint} title={t("Файли під наглядом")} sub={data ? `${t("перевірено")} ${fmtWhen(data.at)}` : undefined} />
              {loading && !data ? (
                <div className="skeleton h-72" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table w-full text-left text-[14px]">
                    <thead>
                      <tr className="border-b border-[var(--hairline)] text-[12.5px] text-muted-foreground">
                        <th className="px-3 py-2.5 font-medium">{t("Файл")}</th>
                        <th className="px-3 py-2.5 font-medium">{t("Стан")}</th>
                        <th className="px-3 py-2.5 font-medium">SHA-256</th>
                        <th className="px-3 py-2.5 font-medium">{t("Права")}</th>
                        <th className="px-3 py-2.5 font-medium">{t("Змінено")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((f) => (
                        <tr key={f.path} className="border-b border-[var(--hairline)] last:border-0">
                          <td className="mono px-3 py-2.5 text-[13px]">{f.path}</td>
                          <td className="px-3 py-2.5">
                            <Pill color={STATUS[f.status]?.c ?? "var(--muted-foreground)"} dot>
                              {t(STATUS[f.status]?.label ?? f.status)}
                            </Pill>
                          </td>
                          <td className="mono px-3 py-2.5 text-[12.5px] text-muted-foreground" title={f.sha256}>
                            {f.sha256 ? `${f.sha256.slice(0, 12)}…` : "—"}
                          </td>
                          <td className="mono whitespace-nowrap px-3 py-2.5 text-[12.5px] text-muted-foreground">
                            {f.mode ? `${f.mode} ${f.owner}` : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-muted-foreground">{f.mtime ? fmtWhen(f.mtime) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

const order = (s: string) => ["modified", "added", "missing", "new", "ok"].indexOf(s);
