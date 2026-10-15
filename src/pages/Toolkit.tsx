import { useState } from "react";
import { Wrench, Play } from "lucide-react";
import { api, useAppState , useHostSelection } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ToolResult } from "@/lib/types";
import { HostBar, Panel, PrimaryButton, GhostButton, SectionHeader, EmptyState } from "@/components/ui";

const TOOLS = [
  { id: "dig", label: "dig (DNS)", needsPort: false },
  { id: "reverse", label: "reverse DNS", needsPort: false },
  { id: "whois", label: "whois", needsPort: false },
  { id: "ping", label: "ping", needsPort: false },
  { id: "traceroute", label: "traceroute", needsPort: false },
  { id: "http", label: "HTTP check (curl)", needsPort: false },
  { id: "port", label: "port check (TCP)", needsPort: true },
];

export default function ToolkitPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostId, setHostId] = useHostSelection();
  const [tool, setTool] = useState("dig");
  const [target, setTarget] = useState("");
  const [port, setPort] = useState("443");
  const [res, setRes] = useState<ToolResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const active = hostId ?? hosts.find((h) => h.status === "online")?.id ?? hosts[0]?.id ?? null;
  const cur = TOOLS.find((x) => x.id === tool)!;

  const run = () => {
    if (!active || !target.trim()) return;
    setLoading(true);
    setErr("");
    setRes(null);
    api.tool(active, tool, target.trim(), cur.needsPort ? parseInt(port, 10) : undefined).then(setRes).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };

  if (hosts.length === 0) return <EmptyState icon={Wrench} title={t("Немає хостів")} hint={t("Додай сервер — інструменти виконуються з нього.")} />;

  return (
    <>
      <HostBar hosts={hosts} value={active} onChange={setHostId} />
      <Panel className="mb-5">
        <SectionHeader icon={Wrench} title={t("Мережеві інструменти")} sub={t("Виконуються на віддаленому хості по SSH — точка огляду з інфраструктури")} />
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TOOLS.map((x) => (
            <GhostButton key={x.id} active={tool === x.id} onClick={() => setTool(x.id)}>
              <span className="mono text-[12.5px]">{x.label}</span>
            </GhostButton>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder={cur.needsPort ? "хост або IP" : "домен або IP (напр. github.com)"}
            className="mono min-w-[220px] flex-1 rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[14.5px] outline-none focus:border-[var(--hairline-strong)] focus:ring-1 focus:ring-[var(--ring)]"
          />
          {cur.needsPort && (
            <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="порт" className="mono w-24 rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[14.5px] outline-none focus:border-[var(--hairline-strong)]" />
          )}
          <PrimaryButton onClick={run} disabled={loading}><Play className="h-3 w-3" /> {loading ? t("Виконую…") : t("Запустити")}</PrimaryButton>
        </div>
      </Panel>

      {err && <Panel><div className="mono py-4 text-center text-[14.5px] text-[var(--danger)]">{err}</div></Panel>}
      {res && (
        <Panel>
          <div className="mb-2 flex items-center gap-2 text-[12.5px] text-muted-foreground font-medium">
            <span className="text-[var(--primary)]">{res.tool}</span> · {res.target}
          </div>
          <pre className="mono max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--hairline)] bg-[var(--code-bg)] p-4 text-[13.5px] leading-relaxed text-foreground/85">{res.output}</pre>
        </Panel>
      )}
    </>
  );
}
