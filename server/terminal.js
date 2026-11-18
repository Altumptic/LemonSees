// Інтерактивний термінал (/ws/term): міст між WebSocket і SSH-shell.
//
// Помилки сокета (завеликий кадр понад maxPayload, порушення протоколу) — це подія `error`. Без обробника Node
// вважає її необробленою і ЗУПИНЯЄ увесь двигун, а з ним і моніторинг усіх хостів. Тож обробник `error` реєструється
// першим, ще до будь-якого `await`, і закриває shell. Покрито test/terminal.test.js.

/** Підключає WebSocket `ws` до shell на `conn`. Ніколи не кидає: усі помилки закривають сеанс. */
export async function handleTerminal(ws, conn) {
  let stream = null;
  const shutdown = () => {
    try {
      stream?.close();
    } catch {
      /* вже закрито */
    }
  };
  ws.on("error", shutdown);
  ws.on("close", shutdown);

  try {
    stream = await conn.shell({ cols: 120, rows: 32 });
  } catch (e) {
    if (ws.readyState === 1) ws.send(`\r\n[ШОК] Не вдалося відкрити shell: ${e.message}\r\n`);
    ws.close();
    return;
  }
  // Клієнт міг піти, поки відкривався shell: не лишаємо осиротілий сеанс на хості
  if (ws.readyState !== 1) {
    shutdown();
    return;
  }

  stream.on("data", (d) => ws.readyState === 1 && ws.send(d));
  stream.stderr?.on("data", (d) => ws.readyState === 1 && ws.send(d));
  stream.on("error", () => ws.close());
  stream.on("close", () => ws.close());

  ws.on("message", (raw) => {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    if (buf.length === 0) return;
    const kind = buf[0];
    const payload = buf.subarray(1);
    if (kind === 0x01) {
      stream.write(payload);
    } else if (kind === 0x02) {
      try {
        const msg = JSON.parse(payload.toString("utf8"));
        if (msg.type === "resize") stream.setWindow(msg.rows, msg.cols, 0, 0);
      } catch {
        /* некоректний керуючий кадр ігноруємо */
      }
    }
  });
}
