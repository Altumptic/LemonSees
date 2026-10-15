import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useAppState , useHostSelection } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { PageHeader, Panel, GhostButton, statusColor } from "@/components/ui";

export default function TerminalPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostId, setHostId] = useHostSelection();
  const [sessionKey, setSessionKey] = useState(0);

  const activeId = hostId ?? hosts[0]?.id ?? null;
  const activeHost = hosts.find((h) => h.id === activeId) ?? null;

  return (
    <>
      <PageHeader
        eyebrow={t("Оболонка")}
        title={t("Термінал")}
        lede={t("Ефемерний shell без агентів. Кожне натискання їде через SSH-тунель; на сервері нічого не зберігається.")}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {hosts.map((h) => (
          <GhostButton
            key={h.id}
            active={activeId === h.id}
            onClick={() => {
              setHostId(h.id);
              setSessionKey((k) => k + 1);
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: statusColor(h.status) }}
            />
            <span className="text-[12px] font-medium">{h.name}</span>
          </GhostButton>
        ))}
        {hosts.length === 0 && (
          <span className="text-[14.5px] text-muted-foreground">{t("Спершу додай хост на сторінці «Хости».")}</span>
        )}
        {activeHost && (
          <span className="ml-auto">
            <GhostButton onClick={() => setSessionKey((k) => k + 1)}>{t("Нова сесія")}</GhostButton>
          </span>
        )}
      </div>

      {activeHost && (
        <Panel eyebrow={`${t("Підключено")} · ${activeHost.name}`} title="tty · ssh">
          <TermView key={`${activeHost.id}:${sessionKey}`} hostId={activeHost.id} />
          <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground font-medium">
            <span>{t("сесія · ефемерна")}</span>
            <span>
              {activeHost.user}@{activeHost.host}:{activeHost.port}
            </span>
          </div>
        </Panel>
      )}
    </>
  );
}

function TermView({ hostId }: { hostId: string }) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    const term = new XTerm({
      fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
      fontSize: 14,
      lineHeight: 1.25,
      cursorBlink: true,
      theme: {
        background: "#00000000",
        foreground: "#ecebe4",
        cursor: "#d97757",
        selectionBackground: "#d9775740",
      },
      allowTransparency: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/term?host=${encodeURIComponent(hostId)}`);
    ws.binaryType = "arraybuffer";

    term.writeln("\x1b[38;5;180m[ШОК] Відкриваю SSH-сесію…\x1b[0m");

    ws.onopen = () => {
      const resize = () => {
        fit.fit();
        ws.send(new Blob(["\x02" + JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })]));
      };
      resize();
      window.addEventListener("resize", resize);
      (ws as WebSocket & { _cleanupResize?: () => void })._cleanupResize = () =>
        window.removeEventListener("resize", resize);
    };
    ws.onmessage = (e) => {
      if (typeof e.data === "string") term.write(e.data);
      else term.write(new Uint8Array(e.data as ArrayBuffer));
    };
    ws.onclose = () => term.writeln("\r\n\x1b[38;5;180m[ШОК] Сесію завершено.\x1b[0m");

    const sub = term.onData((data) => {
      if (ws.readyState === 1) {
        const payload = new TextEncoder().encode(data);
        const buf = new Uint8Array(payload.length + 1);
        buf[0] = 0x01;
        buf.set(payload, 1);
        ws.send(buf);
      }
    });

    return () => {
      sub.dispose();
      (ws as WebSocket & { _cleanupResize?: () => void })._cleanupResize?.();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      term.dispose();
    };
  }, [hostId]);

  return (
    <div className="term-wrap relative overflow-hidden rounded-lg border border-[var(--hairline)]">
      <div ref={boxRef} className="h-[460px] w-full" />
    </div>
  );
}
