import { useState } from "react";
import { Cpu, HardDrive, MemoryStick, Server, Pencil, Trash2, Plug } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { fmtUptime, type HostInput, type HostState } from "@/lib/types";
import {
  PageHeader,
  Panel,
  StatusDot,
  Bar,
  GhostButton,
  PrimaryButton,
  IconBtn,
  TextInput,
  Modal,
  STATUS_LABEL,
} from "@/components/ui";

const EMPTY: HostInput = {
  name: "",
  host: "",
  port: 22,
  user: "root",
  authType: "key",
  keyPath: "",
  passphrase: "",
  password: "",
  interval: 5,
};

export default function Hosts() {
  const { hosts } = useAppState();
  const [editing, setEditing] = useState<HostState | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Флот"
        title="Хости"
        lede="Кожен сервер, доступний по SSH. Ключ або пароль — дані лишаються тільки на цьому ПК."
        action={<PrimaryButton onClick={() => setAdding(true)}>Додати хост</PrimaryButton>}
      />

      <Panel eyebrow={`${hosts.length} серверів`} title="Інвентар флоту">
        {hosts.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Поки що порожньо. Натисни «Додати хост» і вкажи адресу сервера.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
            <div className="mono grid grid-cols-12 gap-3 border-b border-[var(--hairline)] bg-white/[0.02] px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <div className="col-span-3">Хост</div>
              <div className="col-span-2">Статус</div>
              <div className="col-span-3">CPU / RAM / Диск</div>
              <div className="col-span-1 text-right">Ктнр</div>
              <div className="col-span-1 text-right">Аптайм</div>
              <div className="col-span-2 text-right">Дії</div>
            </div>

            {hosts.map((h) => (
              <div
                key={h.id}
                className="grid grid-cols-12 items-center gap-3 border-b border-[var(--hairline)] px-4 py-3 last:border-b-0 hover:bg-white/[0.02]"
              >
                <div className="col-span-3 min-w-0">
                  <div className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{h.name}</span>
                  </div>
                  <div className="mono truncate text-[11px] text-muted-foreground">
                    {h.user}@{h.host}:{h.port}
                  </div>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <StatusDot status={h.status} />
                  <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {STATUS_LABEL[h.status]}
                  </span>
                </div>
                <div className="col-span-3 grid grid-cols-3 gap-3">
                  <MiniStat icon={Cpu} value={h.metrics?.cpu ?? 0} />
                  <MiniStat icon={MemoryStick} value={h.metrics?.memPct ?? 0} />
                  <MiniStat icon={HardDrive} value={h.metrics?.diskPct ?? 0} />
                </div>
                <div className="num col-span-1 text-right text-sm">
                  {h.containers.filter((c) => c.state === "running").length}
                  <span className="text-muted-foreground">/{h.containers.length}</span>
                </div>
                <div className="mono col-span-1 text-right text-xs text-muted-foreground">
                  {h.metrics ? fmtUptime(h.metrics.uptimeSec) : "—"}
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <IconBtn title="Редагувати" onClick={() => setEditing(h)}>
                    <Pencil className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn
                    title="Видалити"
                    danger
                    onClick={() => {
                      if (confirm(`Прибрати хост «${h.name}» з моніторингу?`)) {
                        api.deleteHost(h.id).catch((e) => alert(e.message));
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </IconBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {(adding || editing) && (
        <HostForm
          initial={
            editing
              ? {
                  name: editing.name,
                  host: editing.host,
                  port: editing.port,
                  user: editing.user,
                  authType: editing.authType,
                  keyPath: editing.keyPath,
                  passphrase: "",
                  password: "",
                  interval: editing.interval,
                }
              : EMPTY
          }
          editingId={editing?.id ?? null}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function MiniStat({ icon: Icon, value }: { icon: typeof Cpu; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="num">{Math.round(value)}%</span>
      </div>
      <div className="mt-1">
        <Bar value={value} />
      </div>
    </div>
  );
}

function HostForm({
  initial,
  editingId,
  onClose,
}: {
  initial: HostInput;
  editingId: string | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<HostInput>(initial);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string>("");

  const set = <K extends keyof HostInput>(k: K, v: HostInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      if (editingId) await api.updateHost(editingId, form);
      else await api.addHost(form);
      onClose();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setTestResult("Перевіряю з'єднання…");
    try {
      const r = await api.testHost(form);
      setTestResult(r.ok ? `✓ З'єднання ОК · ${r.output.split("\n").pop()}` : "Не вдалося виконати команду");
    } catch (e) {
      setTestResult(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editingId ? "Редагувати хост" : "Додати хост"} onClose={onClose}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <TextInput label="Назва (як показувати)" value={form.name} onChange={(v) => set("name", v)} placeholder="мій-vps" />
          <TextInput label="Адреса (IP або домен)" value={form.host} onChange={(v) => set("host", v)} placeholder="203.0.113.10" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <TextInput label="Порт" value={String(form.port)} onChange={(v) => set("port", parseInt(v, 10) || 22)} />
          <TextInput label="Користувач" value={form.user} onChange={(v) => set("user", v)} placeholder="root" />
          <TextInput
            label="Інтервал, с"
            value={String(form.interval)}
            onChange={(v) => set("interval", parseInt(v, 10) || 5)}
          />
        </div>

        <div>
          <div className="eyebrow mb-2">Автентифікація</div>
          <div className="flex gap-2">
            <GhostButton active={form.authType === "key"} onClick={() => set("authType", "key")}>
              SSH-ключ (радимо)
            </GhostButton>
            <GhostButton active={form.authType === "password"} onClick={() => set("authType", "password")}>
              Пароль
            </GhostButton>
          </div>
        </div>

        {form.authType === "key" ? (
          <div className="grid gap-4">
            <TextInput
              label="Шлях до приватного ключа"
              value={form.keyPath}
              onChange={(v) => set("keyPath", v)}
              placeholder="C:\Users\User\.ssh\id_ed25519"
            />
            <TextInput
              label="Пароль ключа (якщо є)"
              type="password"
              value={form.passphrase}
              onChange={(v) => set("passphrase", v)}
            />
          </div>
        ) : (
          <TextInput
            label={editingId ? "Пароль (порожньо — лишити старий)" : "Пароль"}
            type="password"
            value={form.password}
            onChange={(v) => set("password", v)}
          />
        )}

        {testResult && (
          <div className="mono rounded-md border border-[var(--hairline)] px-3 py-2 text-[11px] text-muted-foreground">
            {testResult}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-[var(--hairline)] pt-4">
          <GhostButton onClick={test} disabled={busy}>
            <Plug className="h-3 w-3" /> Перевірити з'єднання
          </GhostButton>
          <div className="flex gap-2">
            <GhostButton onClick={onClose}>Скасувати</GhostButton>
            <PrimaryButton onClick={submit} disabled={busy}>
              {editingId ? "Зберегти" : "Додати"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
