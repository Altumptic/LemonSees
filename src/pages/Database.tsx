import { useEffect, useMemo, useRef, useState } from "react";
import {
  Database as DbIcon,
  Pencil,
  Trash2,
  Plug,
  Play,
  Table as TableIcon,
  Boxes,
  KeyRound,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Radar,
  Search,
  Lock,
  Cloud,
  Clock,
} from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  ENGINES,
  engineOf,
  engineAccent,
  familyOf,
  isEditable,
  hasDataTab,
  isFileBased,
  isConnectable,
  groupedEngines,
  type EngineDef,
} from "@/lib/engines";
import type { DbConn, DbInput, DbSchema, DbTable, QueryResult, DetectedDb } from "@/lib/types";
import {
  PageHeader,
  Panel,
  GhostButton,
  PrimaryButton,
  IconBtn,
  TextInput,
  Modal,
} from "@/components/ui";

type Tab = "structure" | "data" | "query";

const EMPTY = (hostId: string): DbInput => ({
  hostId,
  name: "",
  type: "postgres",
  dbHost: "127.0.0.1",
  dbPort: 5432,
  user: "",
  database: "",
  dbFile: "",
  password: "",
});

export default function DatabasePage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [dbs, setDbs] = useState<DbConn[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DbConn | null>(null);
  const [formInit, setFormInit] = useState<DbInput | null>(null);
  const [detectOpen, setDetectOpen] = useState(false);

  const refresh = () => api.listDbs().then(setDbs).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const sel = dbs.find((d) => d.id === selId) ?? null;
  const hostName = (id: string) => hosts.find((h) => h.id === id)?.name ?? id;
  const noHost = () => alert(t("Спершу додай хост на сторінці «Хости»."));

  return (
    <>
      <PageHeader
        eyebrow={t("Дані")}
        title={t("Бази даних")}
        lede={t("Понад 30 рушіїв через SSH-тунель: реляційні, документні, ключ-значення, пошукові, векторні. Порти назовні не відкриваються.")}
        action={
          <div className="flex gap-2">
            <GhostButton onClick={() => (hosts.length ? setDetectOpen(true) : noHost())}>
              <Radar className="h-3 w-3" /> {t("Знайти на сервері")}
            </GhostButton>
            <PrimaryButton onClick={() => (hosts.length ? setFormInit(EMPTY(hosts[0]?.id ?? "")) : noHost())}>
              {t("Додати базу")}
            </PrimaryButton>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_1fr]">
        {/* Бічний рейл підключень */}
        <aside className="space-y-2">
          <div className="eyebrow px-1">{t("Підключення")}</div>
          {dbs.length === 0 && (
            <div className="rounded-lg border border-dashed border-[var(--hairline)] px-3 py-8 text-center text-[13.5px] text-muted-foreground">
              {t("Ще немає баз. «Знайти на сервері» підтягне їх автоматично, або додай вручну.")}
            </div>
          )}
          {dbs.map((d) => {
            const active = d.id === selId;
            const eng = engineOf(d.type);
            return (
              <div
                key={d.id}
                className={`group flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
                  active
                    ? "border-[var(--primary)]/50 bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]"
                    : "border-[var(--hairline)] hover:border-[var(--hairline-strong)]"
                }`}
              >
                <button onClick={() => setSelId(d.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded" style={{ background: `color-mix(in oklab, ${engineAccent(d.type)} 22%, transparent)` }}>
                    <DbIcon className="h-3 w-3" style={{ color: engineAccent(d.type) }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-medium">{d.name}</span>
                    <span className="mono block truncate text-[12px] text-muted-foreground">
                      {eng.label} · {hostName(d.hostId)}
                    </span>
                  </span>
                </button>
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <IconBtn
                    title={t("Редагувати")}
                    onClick={() => {
                      setEditing(d);
                      setFormInit({
                        hostId: d.hostId,
                        name: d.name,
                        type: d.type,
                        dbHost: d.dbHost,
                        dbPort: d.dbPort,
                        user: d.user,
                        database: d.database,
                        dbFile: d.dbFile,
                        password: "",
                      });
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn
                    title={t("Видалити")}
                    danger
                    onClick={() => {
                      if (confirm(`${t("Прибрати базу")} «${d.name}»?`))
                        api.deleteDb(d.id).then(() => {
                          if (selId === d.id) setSelId(null);
                          refresh();
                        });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </IconBtn>
                </span>
              </div>
            );
          })}
        </aside>

        <div className="min-w-0">
          {sel ? (
            <DbWorkspace key={sel.id} db={sel} hostName={hostName(sel.hostId)} />
          ) : (
            <Panel>
              <div className="py-20 text-center text-[14.5px] text-muted-foreground">
                {dbs.length === 0 ? t("Додай першу базу, щоб почати.") : t("Обери базу зліва.")}
              </div>
            </Panel>
          )}
        </div>
      </div>

      {formInit && (
        <DbForm
          hosts={hosts}
          initial={formInit}
          editingId={editing?.id ?? null}
          onClose={(changed) => {
            setFormInit(null);
            setEditing(null);
            if (changed) refresh();
          }}
        />
      )}

      {detectOpen && (
        <DetectModal
          hosts={hosts}
          onClose={() => setDetectOpen(false)}
          onPick={(input) => {
            setDetectOpen(false);
            setEditing(null);
            setFormInit(input);
          }}
        />
      )}
    </>
  );
}

/* ---------------- Робоча зона однієї бази ---------------- */

function DbWorkspace({ db, hostName }: { db: DbConn; hostName: string }) {
  const { t } = useI18n();
  const eng = engineOf(db.type);
  const fam = familyOf(db.type);
  const showData = hasDataTab(db.type);
  const [tab, setTab] = useState<Tab>("structure");
  const [schema, setSchema] = useState<DbSchema | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [pickTable, setPickTable] = useState<DbTable | null>(null);
  const [queryPrefill, setQueryPrefill] = useState("");

  const loadSchema = () => {
    setLoading(true);
    setErr("");
    api
      .dbSchema(db.id)
      .then((s) => setSchema(s))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(loadSchema, [db.id]);

  const readOnlyNote =
    fam === "sqlite"
      ? t("SQLite: файл завантажено локально, лише перегляд.")
      : fam === "mongo"
        ? t("MongoDB: перегляд документів, редагування у консолі.")
        : "";

  return (
    <div className="space-y-4">
      <Panel
        eyebrow={`${eng.label} · ${hostName}`}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <DbIcon className="h-4 w-4" style={{ color: engineAccent(db.type) }} />
            {db.name}
            <span className="text-[12px] text-muted-foreground font-medium">
              {isFileBased(db.type) ? db.dbFile : `${db.dbHost}:${db.dbPort}${db.database ? ` / ${db.database}` : ""}`}
            </span>
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-[var(--hairline)] p-0.5">
              <TabBtn active={tab === "structure"} onClick={() => setTab("structure")}>
                <Boxes className="h-3 w-3" /> {t("Структура")}
              </TabBtn>
              {showData && (
                <TabBtn active={tab === "data"} onClick={() => setTab("data")}>
                  <TableIcon className="h-3 w-3" /> {t("Дані")}
                </TabBtn>
              )}
              <TabBtn active={tab === "query"} onClick={() => setTab("query")}>
                <Play className="h-3 w-3" /> {fam === "http" ? t("Запит") : t("Запити")}
              </TabBtn>
            </div>
            <IconBtn title={t("Оновити")} onClick={loadSchema}>
              <RefreshCw className="h-3 w-3" />
            </IconBtn>
          </div>
        }
      >
        {loading ? (
          <div className="py-16 text-center text-[14.5px] text-muted-foreground">{t("З'єднуюся з базою…")}</div>
        ) : err ? (
          <div className="mono whitespace-pre-wrap rounded-lg border border-[var(--danger)]/40 bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-4 py-6 text-center text-[14.5px] text-[var(--danger)]">
            {err}
          </div>
        ) : (
          <>
            {readOnlyNote && tab !== "query" && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-[var(--hairline)] px-3 py-1.5 text-[12px] text-muted-foreground font-medium">
                <Lock className="h-3 w-3" /> {readOnlyNote}
              </div>
            )}
            {tab === "structure" && (
              <Structure
                schema={schema}
                onOpenTable={(tbl) => {
                  setPickTable(tbl);
                  setTab("data");
                }}
                onPrefill={(q) => {
                  setQueryPrefill(q);
                  setTab("query");
                }}
              />
            )}
            {tab === "data" && showData && schema?.kind === "sql" && (
              <DataBrowser db={db} tables={schema.tables} initial={pickTable} editable={isEditable(db.type)} />
            )}
            {tab === "query" && <QueryConsole db={db} prefill={queryPrefill} />}
          </>
        )}
      </Panel>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
        active ? "bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] text-[var(--primary)]" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------- Структура ---------------- */

function Structure({
  schema,
  onOpenTable,
  onPrefill,
}: {
  schema: DbSchema | null;
  onOpenTable: (t: DbTable) => void;
  onPrefill: (q: string) => void;
}) {
  const { t } = useI18n();
  if (!schema) return null;

  if (schema.kind === "http") {
    return (
      <div className="space-y-3">
        <div className="text-[13.5px] text-muted-foreground">{t("Швидкі запити — клікни, щоб підставити в консоль:")}</div>
        <div className="grid gap-2">
          {schema.hints.map((h, i) => (
            <button
              key={i}
              onClick={() => onPrefill(h)}
              className="mono flex items-start gap-2 rounded-lg border border-[var(--hairline)] px-3 py-2 text-left text-[13.5px] hover:border-[var(--primary)]/50"
            >
              <Play className="mt-0.5 h-3 w-3 shrink-0 text-[var(--primary)]" />
              <span className="whitespace-pre-wrap">{h}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (schema.kind === "redis") {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("Ключів")} value={String(schema.dbsize)} />
          {Object.entries(schema.info).map(([k, v]) => (
            <Stat key={k} label={k} value={v} />
          ))}
        </div>
        <div>
          <div className="eyebrow mb-2">{t("Ключі (зразок)")}</div>
          <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
            {schema.keys.length === 0 && (
              <div className="px-4 py-8 text-center text-[14.5px] text-muted-foreground">{t("Порожньо")}</div>
            )}
            {schema.keys.map((k) => (
              <button
                key={k.key}
                onClick={() => onPrefill(k.type === "string" ? `GET ${k.key}` : `TYPE ${k.key}`)}
                className="flex w-full items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-2 text-left last:border-b-0 hover:bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]"
              >
                <span className="mono flex min-w-0 items-center gap-2 text-[13.5px]">
                  <KeyRound className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{k.key}</span>
                </span>
                <span className="shrink-0 text-[12px] text-muted-foreground font-medium">{k.type}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (schema.tables.length === 0)
    return <div className="py-12 text-center text-[14.5px] text-muted-foreground">{t("Немає таблиць.")}</div>;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {schema.tables.map((tbl) => (
        <button
          key={`${tbl.schema}.${tbl.name}`}
          onClick={() => onOpenTable(tbl)}
          className="group flex flex-col overflow-hidden rounded-lg border border-[var(--hairline)] text-left transition-colors hover:border-[var(--primary)]/50"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--hairline)] bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)] px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <TableIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-[14.5px] font-medium">{tbl.name}</span>
            </span>
            <span className="mono shrink-0 text-[12px] text-muted-foreground">{tbl.columns.length}</span>
          </div>
          <div className="max-h-44 overflow-auto p-1">
            {tbl.columns.map((c) => (
              <div key={c.name} className="flex items-center justify-between gap-3 rounded px-2 py-1 text-[13.5px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  {c.pk && <KeyRound className="h-2.5 w-2.5 shrink-0 text-[var(--primary)]" />}
                  <span className={`truncate ${c.pk ? "font-medium text-[var(--primary)]" : ""}`}>{c.name}</span>
                </span>
                <span className="mono shrink-0 text-[12px] text-muted-foreground">{c.type}</span>
              </div>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-strong rounded-lg p-3">
      <div className="eyebrow truncate">{label}</div>
      <div className="num mt-1 truncate text-lg font-medium">{value}</div>
    </div>
  );
}

/* ---------------- Дані ---------------- */

function DataBrowser({
  db,
  tables,
  initial,
  editable,
}: {
  db: DbConn;
  tables: DbTable[];
  initial: DbTable | null;
  editable: boolean;
}) {
  const { t } = useI18n();
  const [cur, setCur] = useState<DbTable | null>(initial ?? tables[0] ?? null);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ columns: string[]; rows: Record<string, unknown>[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<{ r: number; c: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const limit = 50;

  const pkCols = useMemo(() => cur?.columns.filter((c) => c.pk).map((c) => c.name) ?? [], [cur]);
  const canEdit = editable && pkCols.length > 0;

  const load = () => {
    if (!cur) return;
    setLoading(true);
    setErr("");
    api
      .dbTable(db.id, cur.schema, cur.name, limit, page * limit)
      .then((d) => setData(d))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [db.id, cur, page]);
  useEffect(() => setPage(0), [cur]);

  const saveCell = async (rowIdx: number, col: string, value: string) => {
    if (!cur || !data) return;
    const row = data.rows[rowIdx];
    if (String(row[col] ?? "") === value) return setEdit(null);
    const pk: Record<string, unknown> = {};
    for (const k of pkCols) pk[k] = row[k];
    setSaving(true);
    try {
      await api.dbUpdateRow(db.id, cur.schema, cur.name, pk, { [col]: value });
      const rows = data.rows.slice();
      rows[rowIdx] = { ...row, [col]: value };
      setData({ ...data, rows });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
      setEdit(null);
    }
  };

  const pages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={cur ? `${cur.schema}.${cur.name}` : ""}
          onChange={(e) => setCur(tables.find((tb) => `${tb.schema}.${tb.name}` === e.target.value) ?? null)}
          className="mono min-w-[160px] rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--hairline-strong)]"
        >
          {tables.length === 0 && <option>{t("немає таблиць")}</option>}
          {tables.map((tb) => (
            <option key={`${tb.schema}.${tb.name}`} value={`${tb.schema}.${tb.name}`} className="bg-[var(--ink)]">
              {tb.schema}.{tb.name}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-muted-foreground font-medium">
          {canEdit ? t("подвійний клік — редагувати") : t("лише перегляд")}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {data && (
            <span className="text-[12px] text-muted-foreground font-medium">
              {data.total === 0 ? "0" : `${page * limit + 1}–${Math.min((page + 1) * limit, data.total)}`} / {data.total}
            </span>
          )}
          <IconBtn title={t("Назад")} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-3 w-3" />
          </IconBtn>
          <IconBtn title={t("Далі")} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-3 w-3" />
          </IconBtn>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-[14.5px] text-muted-foreground">{t("Завантажую…")}</div>
      ) : err ? (
        <div className="mono rounded-lg border border-[var(--danger)]/40 px-4 py-4 text-[14.5px] text-[var(--danger)]">{err}</div>
      ) : data && data.rows.length === 0 ? (
        <div className="rounded-lg border border-[var(--hairline)] px-4 py-10 text-center text-[14.5px] text-muted-foreground">
          {t("Таблиця порожня.")}
        </div>
      ) : data ? (
        <ResultGrid
          columns={data.columns}
          rows={data.rows}
          pkCols={pkCols}
          editable={canEdit}
          edit={edit}
          saving={saving}
          onEdit={setEdit}
          onSave={saveCell}
        />
      ) : null}
    </div>
  );
}

/* ---------------- Консоль запитів ---------------- */

function QueryConsole({ db, prefill }: { db: DbConn; prefill: string }) {
  const { t } = useI18n();
  const eng = engineOf(db.type);
  const fam = familyOf(db.type);
  const placeholder =
    fam === "redis"
      ? "KEYS *\nGET my-key\nHGETALL my-hash"
      : fam === "mongo"
        ? '{ "collection": "users", "filter": {}, "limit": 50 }'
        : fam === "http"
          ? "GET /_cat/indices?v"
          : fam === "sqlite"
            ? "SELECT name FROM sqlite_master WHERE type='table';"
            : eng.family === "pg"
              ? "SELECT * FROM information_schema.tables LIMIT 20;"
              : "SHOW TABLES;\nSELECT * FROM users LIMIT 20;";
  const [sql, setSql] = useState(prefill || "");
  const [res, setRes] = useState<QueryResult | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (prefill) {
      setSql(prefill);
      taRef.current?.focus();
    }
  }, [prefill]);

  const run = async () => {
    if (!sql.trim()) return;
    setBusy(true);
    setErr("");
    try {
      setRes(await api.dbQuery(db.id, sql));
    } catch (e) {
      setErr((e as Error).message);
      setRes(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          ref={taRef}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              run();
            }
          }}
          placeholder={placeholder}
          spellCheck={false}
          className="mono min-h-[120px] w-full resize-y rounded-lg border border-[var(--hairline)] bg-[var(--code-bg)] p-3 text-[14px] leading-relaxed outline-none focus:border-[var(--hairline-strong)] focus:ring-1 focus:ring-[var(--ring)]"
        />
        <div className="pointer-events-none absolute bottom-2 right-3 text-[12px] text-muted-foreground/60 font-medium">
          Ctrl+Enter
        </div>
      </div>
      <div className="flex items-center gap-2">
        <PrimaryButton onClick={run} disabled={busy}>
          <Play className="h-3 w-3" /> {busy ? t("Виконую…") : t("Виконати")}
        </PrimaryButton>
        <span className="text-[12px] text-muted-foreground font-medium">{eng.label}</span>
        {res && (
          <span className="ml-auto text-[12px] text-muted-foreground font-medium">
            {res.command} · {res.rowCount} {t("рядків")}
          </span>
        )}
      </div>

      {err && (
        <div className="mono whitespace-pre-wrap rounded-lg border border-[var(--danger)]/40 bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-4 py-3 text-[13.5px] text-[var(--danger)]">
          {err}
        </div>
      )}
      {res && !err && (
        res.rows.length === 0 ? (
          <div className="rounded-lg border border-[var(--hairline)] px-4 py-6 text-center text-[14.5px] text-muted-foreground">
            {t("Готово. Рядків не повернуто.")}
          </div>
        ) : (
          <ResultGrid columns={res.columns} rows={res.rows} pkCols={[]} editable={false} />
        )
      )}
    </div>
  );
}

/* ---------------- Універсальна таблиця ---------------- */

function cellText(v: unknown): { text: string; nullish: boolean } {
  if (v === null || v === undefined) return { text: "NULL", nullish: true };
  if (typeof v === "object") return { text: JSON.stringify(v), nullish: false };
  return { text: String(v), nullish: false };
}

function ResultGrid({
  columns,
  rows,
  pkCols,
  editable,
  edit,
  saving,
  onEdit,
  onSave,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  pkCols: string[];
  editable: boolean;
  edit?: { r: number; c: string } | null;
  saving?: boolean;
  onEdit?: (e: { r: number; c: string } | null) => void;
  onSave?: (r: number, c: string, v: string) => void;
}) {
  return (
    <div className="overflow-auto rounded-lg border border-[var(--hairline)]">
      <table className="data-table w-full border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-[var(--hairline)] bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]">
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 text-[12px] text-muted-foreground font-medium">
                <span className="inline-flex items-center gap-1">
                  {pkCols.includes(c) && <KeyRound className="h-2.5 w-2.5 text-[var(--primary)]" />}
                  {c}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-[var(--hairline)] last:border-b-0 hover:bg-[color-mix(in_oklab,var(--foreground)_2%,transparent)]">
              {columns.map((c) => {
                const isEditing = edit && edit.r === ri && edit.c === c;
                const { text, nullish } = cellText(row[c]);
                return (
                  <td
                    key={c}
                    onDoubleClick={() => editable && onEdit?.({ r: ri, c })}
                    className="mono max-w-[320px] truncate px-3 py-1.5 align-top"
                    title={text}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        defaultValue={nullish ? "" : text}
                        disabled={saving}
                        onBlur={(e) => onSave?.(ri, c, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") onEdit?.(null);
                        }}
                        className="mono w-full min-w-[80px] rounded border border-[var(--primary)]/50 bg-[var(--code-bg)] px-1 py-0.5 text-[14px] outline-none"
                      />
                    ) : (
                      <span className={nullish ? "text-muted-foreground/50 italic" : ""}>{text}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Вибір рушія ---------------- */

function EnginePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const all = groupedEngines();
    if (!q.trim()) return all;
    const needle = q.toLowerCase();
    return all
      .map((g) => ({ ...g, items: g.items.filter((e) => e.label.toLowerCase().includes(needle) || e.id.includes(needle)) }))
      .filter((g) => g.items.length > 0);
  }, [q]);

  return (
    <div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Пошук рушія…")}
          className="mono w-full rounded-md border border-[var(--hairline)] bg-transparent py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[var(--hairline-strong)]"
        />
      </div>
      <div className="max-h-[240px] space-y-3 overflow-auto pr-1">
        {groups.map((g) => (
          <div key={g.cat}>
            <div className="eyebrow mb-1.5 flex items-center gap-1.5">
              {g.cat === "cloud" && <Cloud className="h-3 w-3" />}
              {g.label}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((e) => {
                const active = value === e.id;
                const usable = isConnectable(e.id);
                return (
                  <button
                    key={e.id}
                    onClick={() => onPick(e.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13.5px] transition-colors ${
                      active
                        ? "border-[var(--primary)]/60 bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-[var(--primary)]"
                        : usable
                          ? "border-[var(--hairline)] text-foreground/90 hover:border-[var(--hairline-strong)]"
                          : "border-[var(--hairline)] text-muted-foreground/70"
                    }`}
                    title={usable ? e.label : t("Поки без драйвера / хмарна")}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: engineAccent(e.id) }} />
                    {e.label}
                    {!usable && (familyOf(e.id) === "cloud" ? <Cloud className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Форма підключення ---------------- */

function DbForm({
  hosts,
  initial,
  editingId,
  onClose,
}: {
  hosts: { id: string; name: string }[];
  initial: DbInput;
  editingId: string | null;
  onClose: (changed: boolean) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<DbInput>(initial);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState("");

  const eng: EngineDef = engineOf(form.type);
  const fam = eng.family;
  const usable = isConnectable(form.type);
  const set = <K extends keyof DbInput>(k: K, v: DbInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const pickEngine = (id: string) => setForm((f) => ({ ...f, type: id, dbPort: engineOf(id).port }));

  const submit = async () => {
    setBusy(true);
    try {
      if (editingId) await api.updateDb(editingId, form);
      else await api.addDb(form);
      onClose(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setTestResult(t("Перевіряю з'єднання…"));
    try {
      await api.testDb(form);
      setTestResult(`✓ ${t("З'єднання ОК")}`);
    } catch (e) {
      setTestResult(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editingId ? t("Редагувати базу") : t("Додати базу")} onClose={() => onClose(false)} wide>
      <div className="grid gap-4">
        <div>
          <div className="eyebrow mb-2">{t("Рушій")}</div>
          <EnginePicker value={form.type} onPick={pickEngine} />
        </div>

        {!usable ? (
          <div className="mono flex items-start gap-2 rounded-lg border border-[var(--hairline)] px-4 py-4 text-[13.5px] text-muted-foreground">
            {fam === "cloud" ? <Cloud className="mt-0.5 h-4 w-4 shrink-0" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>
              {fam === "cloud"
                ? t("Це керована хмарна БД — доступ через ключі API постачальника, а не через SSH. Поки не підтримується.")
                : t("Для цього рушія драйвер ще в роботі. Скоро додамо.")}
            </span>
          </div>
        ) : (
          <>
            <label className="block">
              <div className="eyebrow mb-1">{t("Хост (SSH)")}</div>
              <select
                value={form.hostId}
                onChange={(e) => set("hostId", e.target.value)}
                className="mono w-full rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[14.5px] outline-none focus:border-[var(--hairline-strong)]"
              >
                {hosts.map((h) => (
                  <option key={h.id} value={h.id} className="bg-[var(--ink)]">
                    {h.name}
                  </option>
                ))}
              </select>
            </label>

            <TextInput label={t("Назва (як показувати)")} value={form.name} onChange={(v) => set("name", v)} placeholder={eng.label} />

            {isFileBased(form.type) ? (
              <TextInput
                label={t("Шлях до файлу .db на сервері")}
                value={form.dbFile}
                onChange={(v) => set("dbFile", v)}
                placeholder="/opt/app/data.db"
              />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <TextInput label={t("Адреса БД (на сервері)")} value={form.dbHost} onChange={(v) => set("dbHost", v)} placeholder="127.0.0.1" />
                  </div>
                  <TextInput label={t("Порт")} value={String(form.dbPort)} onChange={(v) => set("dbPort", parseInt(v, 10) || eng.port)} />
                </div>

                {fam === "redis" ? (
                  <TextInput label={t("Номер БД (0–15)")} value={form.database} onChange={(v) => set("database", v)} placeholder="0" />
                ) : fam === "http" ? (
                  <div className="grid grid-cols-2 gap-4">
                    <TextInput label={t("Користувач (Basic, якщо є)")} value={form.user} onChange={(v) => set("user", v)} />
                    <TextInput label={t("База / індекс (необов'язково)")} value={form.database} onChange={(v) => set("database", v)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <TextInput label={t("Користувач БД")} value={form.user} onChange={(v) => set("user", v)} placeholder={fam === "pg" ? "postgres" : fam === "mysql" ? "root" : ""} />
                    <TextInput label={t("База (database)")} value={form.database} onChange={(v) => set("database", v)} />
                  </div>
                )}

                <TextInput
                  label={editingId ? t("Пароль (порожньо — лишити старий)") : t("Пароль (якщо є)")}
                  type="password"
                  value={form.password}
                  onChange={(v) => set("password", v)}
                />
              </>
            )}

            {testResult && (
              <div className="mono rounded-md border border-[var(--hairline)] px-3 py-2 text-[12.5px] text-muted-foreground">{testResult}</div>
            )}
          </>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-[var(--hairline)] pt-4">
          {usable ? (
            <GhostButton onClick={test} disabled={busy}>
              <Plug className="h-3 w-3" /> {t("Перевірити з'єднання")}
            </GhostButton>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <GhostButton onClick={() => onClose(false)}>{t("Скасувати")}</GhostButton>
            <PrimaryButton onClick={submit} disabled={busy || !usable}>
              {editingId ? t("Зберегти") : t("Додати")}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Автопошук ---------------- */

function DetectModal({
  hosts,
  onClose,
  onPick,
}: {
  hosts: { id: string; name: string }[];
  onClose: () => void;
  onPick: (input: DbInput) => void;
}) {
  const { t } = useI18n();
  const [hostId, setHostId] = useState(hosts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [found, setFound] = useState<DetectedDb[] | null>(null);

  const scan = async () => {
    setBusy(true);
    setErr("");
    setFound(null);
    try {
      const r = await api.detectDbs(hostId);
      setFound(r.found);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("Знайти бази на сервері")} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <label className="block flex-1">
            <div className="eyebrow mb-1">{t("Хост (SSH)")}</div>
            <select
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
              className="mono w-full rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[14.5px] outline-none focus:border-[var(--hairline-strong)]"
            >
              {hosts.map((h) => (
                <option key={h.id} value={h.id} className="bg-[var(--ink)]">
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          <PrimaryButton onClick={scan} disabled={busy || !hostId}>
            <Radar className="h-3 w-3" /> {busy ? t("Сканую…") : t("Сканувати")}
          </PrimaryButton>
        </div>

        <p className="text-[13.5px] text-muted-foreground">
          {t("Шукаємо Docker-контейнери БД, слухаючі порти й файли SQLite.")}
        </p>

        {err && <div className="mono rounded-md border border-[var(--danger)]/40 px-3 py-2 text-[13.5px] text-[var(--danger)]">{err}</div>}

        {found && (
          <div className="space-y-2">
            {found.length === 0 && (
              <div className="rounded-lg border border-[var(--hairline)] px-4 py-8 text-center text-[14.5px] text-muted-foreground">
                {t("Нічого не знайдено. Додай базу вручну.")}
              </div>
            )}
            {found.map((d, i) => {
              const eng = engineOf(d.type);
              return (
                <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--hairline)] px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: engineAccent(d.type) }} />
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-medium">{eng.label}</div>
                      <div className="mono truncate text-[12px] text-muted-foreground">{d.source}</div>
                    </div>
                  </div>
                  <GhostButton
                    onClick={() =>
                      onPick({
                        hostId,
                        name: d.name,
                        type: d.type,
                        dbHost: d.dbHost || "127.0.0.1",
                        dbPort: d.dbPort || eng.port,
                        user: "",
                        database: "",
                        dbFile: d.dbFile ?? "",
                        password: "",
                      })
                    }
                  >
                    {t("Додати")}
                  </GhostButton>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
