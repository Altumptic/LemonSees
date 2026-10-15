import { useEffect, useMemo, useState } from "react";
import { useIntent } from "@/lib/intent";
import { Siren, Plus, Trash2, Clock } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtWhen, type Incident, type IncidentInput } from "@/lib/types";
import {
  PageHeader,
  Panel,
  GhostButton,
  PrimaryButton,
  IconBtn,
  SeverityBadge,
  IncidentStatusBadge,
  Kpi,
  Drawer,
  Modal,
  TextInput,
  EmptyState,
  SectionHeader,
} from "@/components/ui";
import { Donut, StackedBars, SEV_COLOR } from "@/components/charts";
import { SEVERITIES, incidentsByDay } from "@/lib/analytics";

const SEV_TXT: Record<string, string> = { critical: "критичний", high: "високий", medium: "середній", low: "низький", info: "інфо" };
const STATUS_TXT: Record<string, string> = { open: "відкрито", investigating: "розслідування", mitigated: "стримано", closed: "закрито" };
const STATUS_C: Record<string, string> = { open: "var(--danger)", investigating: "var(--warning)", mitigated: "var(--info)", closed: "var(--success)" };

const SEVS: Incident["severity"][] = ["critical", "high", "medium", "low", "info"];
const STATS: Incident["status"][] = ["open", "investigating", "mitigated", "closed"];

const EMPTY: IncidentInput = {
  title: "",
  severity: "medium",
  status: "open",
  hostId: "",
  assignee: "",
  detail: "",
  category: "",
};

export default function IncidentsPage() {
  const { hosts } = useAppState();
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Incident[]>([]);
  const [filter, setFilter] = useState<string>("active");
  const [form, setForm] = useState<IncidentInput | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [view, setView] = useState<Incident | null>(null);
  useIntent("new", () => {
    setEditId(null);
    setForm(EMPTY);
  });

  const refresh = () => api.listIncidents().then(setItems).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const hostName = (id: string) => hosts.find((h) => h.id === id)?.name ?? (id ? id : "—");

  const rows = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "active") return items.filter((i) => i.status !== "closed");
    return items.filter((i) => i.status === filter || i.severity === filter);
  }, [items, filter]);

  const trend = useMemo(() => incidentsByDay(items, 30, lang), [items, lang]);

  const stats = useMemo(() => {
    const open = items.filter((i) => i.status !== "closed").length;
    const crit = items.filter((i) => (i.severity === "critical" || i.severity === "high") && i.status !== "closed").length;
    const inv = items.filter((i) => i.status === "investigating").length;
    return { open, crit, inv, total: items.length };
  }, [items]);

  return (
    <>
      <PageHeader
        eyebrow={t("SOC · Реагування")}
        title={t("Інциденти")}
        lede={t("Реєстр інцидентів безпеки з таймлайном. Зберігається локально на цьому ПК.")}
        action={<PrimaryButton onClick={() => { setEditId(null); setForm(EMPTY); }}><Plus className="h-3 w-3" /> {t("Новий інцидент")}</PrimaryButton>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label={t("Відкриті")} value={stats.open} icon={Siren} tone={stats.open > 0 ? "warning" : "ok"} />
        <Kpi label={t("Критичні/високі")} value={stats.crit} icon={Siren} tone={stats.crit > 0 ? "critical" : "ok"} />
        <Kpi label={t("Розслідування")} value={stats.inv} icon={Clock} tone="info" />
        <Kpi label={t("Всього")} value={stats.total} icon={Siren} tone="neutral" />
      </div>

      {items.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <SectionHeader icon={Siren} title={t("Динаміка інцидентів")} sub={t("Нові за 30 днів за серйозністю")} />
            <StackedBars data={trend} keys={SEVERITIES.map((s) => ({ name: t(SEV_TXT[s]), color: SEV_COLOR[s] }))} height={210} />
          </Panel>
          <Panel>
            <SectionHeader icon={Clock} title={t("Статуси")} />
            <Donut
              size={150}
              thickness={20}
              items={STATS.map((s) => ({ label: t(STATUS_TXT[s]), value: items.filter((i) => i.status === s).length, color: STATUS_C[s] }))}
              sub={t("інцидентів")}
            />
          </Panel>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[["active", t("Активні")], ["all", t("Всі")], ["critical", t("критичний")], ["open", t("відкрито")], ["investigating", t("розслідування")], ["closed", t("закрито")]].map(([k, l]) => (
          <GhostButton key={k} active={filter === k} onClick={() => setFilter(k)}>
            <span className="text-[12px] font-medium">{l}</span>
          </GhostButton>
        ))}
        <span className="ml-auto text-[12px] text-muted-foreground font-medium">{rows.length} / {items.length}</span>
      </div>

      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={Siren} title={t("Немає інцидентів")} hint={t("Створи перший інцидент або зміни фільтр.")} action={<PrimaryButton onClick={() => { setEditId(null); setForm(EMPTY); }}>{t("Новий інцидент")}</PrimaryButton>} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
            <div className="grid grid-cols-12 gap-3 border-b border-[var(--hairline)] bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)] px-4 py-2.5 text-[12px] text-muted-foreground font-medium">
              <div className="col-span-5">{t("Інцидент")}</div>
              <div className="col-span-2">{t("Серйозність")}</div>
              <div className="col-span-2">{t("Статус")}</div>
              <div className="col-span-2">{t("Хост")}</div>
              <div className="col-span-1 text-right">{t("Дії")}</div>
            </div>
            {rows.map((inc) => (
              <div key={inc.id} className="grid grid-cols-12 items-center gap-3 border-b border-[var(--hairline)] px-4 py-3 last:border-0 hover:bg-[color-mix(in_oklab,var(--foreground)_2%,transparent)]">
                <button onClick={() => setView(inc)} className="col-span-5 min-w-0 text-left">
                  <div className="truncate text-[14.5px] font-medium">{inc.title}</div>
                  <div className="mono truncate text-[12.5px] text-muted-foreground">{inc.category || t("без категорії")} · {fmtWhen(inc.updatedAt)}</div>
                </button>
                <div className="col-span-2"><SeverityBadge level={inc.severity} /></div>
                <div className="col-span-2"><IncidentStatusBadge status={inc.status} /></div>
                <div className="mono col-span-2 truncate text-[13px] text-muted-foreground">{hostName(inc.hostId)}</div>
                <div className="col-span-1 flex justify-end">
                  <IconBtn title={t("Видалити")} danger onClick={() => { if (confirm(t("Видалити інцидент?"))) api.deleteIncident(inc.id).then(refresh); }}>
                    <Trash2 className="h-3 w-3" />
                  </IconBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {form && (
        <IncidentForm
          hosts={hosts}
          initial={form}
          editId={editId}
          onClose={(changed) => { setForm(null); setEditId(null); if (changed) refresh(); }}
        />
      )}

      {view && (
        <IncidentDrawer
          inc={view}
          hostName={hostName(view.hostId)}
          onClose={() => setView(null)}
          onEdit={() => { setEditId(view.id); setForm({ title: view.title, severity: view.severity, status: view.status, hostId: view.hostId, assignee: view.assignee, detail: view.detail, category: view.category }); setView(null); }}
          onChanged={(u) => { setView(u); refresh(); }}
        />
      )}
    </>
  );
}

function IncidentDrawer({ inc, hostName, onClose, onEdit, onChanged }: { inc: Incident; hostName: string; onClose: () => void; onEdit: () => void; onChanged: (u: Incident) => void }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");

  const changeStatus = async (status: Incident["status"]) => {
    const updated = await api.updateIncident(inc.id, { title: inc.title, severity: inc.severity, status, hostId: inc.hostId, assignee: inc.assignee, detail: inc.detail, category: inc.category });
    onChanged(updated);
  };
  const addNote = async () => {
    if (!note.trim()) return;
    const updated = await api.updateIncident(inc.id, { title: inc.title, severity: inc.severity, status: inc.status, hostId: inc.hostId, assignee: inc.assignee, detail: inc.detail, category: inc.category, note });
    setNote("");
    onChanged(updated);
  };

  return (
    <Drawer title={inc.title} onClose={onClose}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SeverityBadge level={inc.severity} />
        <IncidentStatusBadge status={inc.status} />
        <GhostButton onClick={onEdit}>{t("Редагувати")}</GhostButton>
      </div>

      <dl className="mono mb-4 space-y-1.5 text-[13.5px]">
        <Row k={t("Хост")} v={hostName} />
        <Row k={t("Категорія")} v={inc.category || "—"} />
        <Row k={t("Виконавець")} v={inc.assignee || "—"} />
        <Row k={t("Створено")} v={new Date(inc.createdAt).toLocaleString()} />
      </dl>

      {inc.detail && <p className="mb-4 rounded-lg border border-[var(--hairline)] p-3 text-[14.5px] leading-relaxed text-foreground/90">{inc.detail}</p>}

      <div className="mb-4">
        <div className="eyebrow mb-2">{t("Змінити статус")}</div>
        <div className="flex flex-wrap gap-1.5">
          {STATS.map((s) => (
            <GhostButton key={s} active={inc.status === s} onClick={() => changeStatus(s)}>
              <IncidentStatusBadge status={s} />
            </GhostButton>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="eyebrow mb-2">{t("Додати запис у таймлайн")}</div>
        <div className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} placeholder={t("Що зроблено…")} className="mono flex-1 rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--hairline-strong)]" />
          <PrimaryButton onClick={addNote}>{t("Додати")}</PrimaryButton>
        </div>
      </div>

      <div className="eyebrow mb-2">{t("Таймлайн")}</div>
      <ol className="relative space-y-3 border-l border-[var(--hairline)] pl-4">
        {[...inc.timeline].reverse().map((e, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[var(--primary)]" />
            <div className="text-[14.5px]">{e.text}</div>
            <div className="mono text-[12px] text-muted-foreground">{fmtWhen(e.at)}</div>
          </li>
        ))}
      </ol>
    </Drawer>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground font-medium">{k}</dt>
      <dd className="truncate text-foreground/90">{v}</dd>
    </div>
  );
}

function IncidentForm({ hosts, initial, editId, onClose }: { hosts: { id: string; name: string }[]; initial: IncidentInput; editId: string | null; onClose: (changed: boolean) => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<IncidentInput>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof IncidentInput>(k: K, v: IncidentInput[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      if (editId) await api.updateIncident(editId, f);
      else await api.addIncident(f);
      onClose(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editId ? t("Редагувати інцидент") : t("Новий інцидент")} onClose={() => onClose(false)}>
      <div className="grid gap-4">
        <TextInput label={t("Назва")} value={f.title} onChange={(v) => set("title", v)} placeholder={t("Напр.: підозра на брутфорс SSH")} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="eyebrow mb-1">{t("Серйозність")}</div>
            <select value={f.severity} onChange={(e) => set("severity", e.target.value as IncidentInput["severity"])} className="mono w-full rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[14.5px] outline-none focus:border-[var(--hairline-strong)]">
              {SEVS.map((s) => <option key={s} value={s} className="bg-[var(--ink)]">{s}</option>)}
            </select>
          </div>
          <div>
            <div className="eyebrow mb-1">{t("Статус")}</div>
            <select value={f.status} onChange={(e) => set("status", e.target.value as IncidentInput["status"])} className="mono w-full rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[14.5px] outline-none focus:border-[var(--hairline-strong)]">
              {STATS.map((s) => <option key={s} value={s} className="bg-[var(--ink)]">{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="eyebrow mb-1">{t("Хост")}</div>
            <select value={f.hostId} onChange={(e) => set("hostId", e.target.value)} className="mono w-full rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[14.5px] outline-none focus:border-[var(--hairline-strong)]">
              <option value="" className="bg-[var(--ink)]">{t("— не привʼязано —")}</option>
              {hosts.map((h) => <option key={h.id} value={h.id} className="bg-[var(--ink)]">{h.name}</option>)}
            </select>
          </div>
          <TextInput label={t("Категорія")} value={f.category} onChange={(v) => set("category", v)} placeholder="brute-force, malware…" />
        </div>
        <TextInput label={t("Виконавець")} value={f.assignee} onChange={(v) => set("assignee", v)} />
        <label className="block">
          <div className="eyebrow mb-1">{t("Опис")}</div>
          <textarea value={f.detail} onChange={(e) => set("detail", e.target.value)} rows={3} className="mono w-full resize-y rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[14.5px] outline-none focus:border-[var(--hairline-strong)]" />
        </label>
        <div className="flex justify-end gap-2 border-t border-[var(--hairline)] pt-4">
          <GhostButton onClick={() => onClose(false)}>{t("Скасувати")}</GhostButton>
          <PrimaryButton onClick={submit} disabled={busy}>{editId ? t("Зберегти") : t("Створити")}</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
