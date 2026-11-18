// Термінал (/ws/term): завеликий кадр чи порушення протоколу не повинні зупиняти двигун.
// Без обробника `error` на сокеті Node вважає подію необробленою й завершує увесь процес (знайдено під час оновлення ws).
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { EventEmitter } from "node:events";
import { WebSocketServer, WebSocket } from "ws";
import { handleTerminal } from "../server/terminal.js";

class FakeStream extends EventEmitter {
  constructor() {
    super();
    this.stderr = new EventEmitter();
    this.written = [];
    this.window = null;
    this.closed = false;
  }
  write(b) {
    this.written.push(Buffer.from(b).toString());
  }
  setWindow(...a) {
    this.window = a;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.emit("close");
  }
}

async function harness({ maxPayload = 1024, shell } = {}) {
  const streams = [];
  const conn = { shell: shell ?? (async () => { const s = new FakeStream(); streams.push(s); return s; }) };
  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true, maxPayload });
  server.on("upgrade", (req, sock, head) => wss.handleUpgrade(req, sock, head, (ws) => wss.emit("connection", ws, req)));
  wss.on("connection", (ws) => handleTerminal(ws, conn));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${server.address().port}`;
  // Повідомлення буферизуються з моменту створення клієнта: сервер може написати першим, до того як тест підпишеться
  const connect = () => new Promise((res, rej) => { const c = new WebSocket(url); c.inbox = []; c.on("message", (m) => c.inbox.push(String(m))); c.on("open", () => res(c)); c.on("error", rej); });
  const done = () => new Promise((r) => { wss.clients.forEach((c) => c.terminate()); wss.close(); server.close(r); });
  return { connect, streams, done };
}

const until = async (cond, ms = 2000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout waiting for condition");
    await new Promise((r) => setTimeout(r, 10));
  }
};

test("an oversized frame closes the session and shell; the process survives", async () => {
  const h = await harness({ maxPayload: 1024 });
  const c = await h.connect();
  await until(() => h.streams.length === 1);
  const closed = new Promise((r) => c.once("close", r));
  c.send(Buffer.concat([Buffer.from([1]), Buffer.alloc(4096, 0x61)])); // 4 KiB > 1 KiB
  assert.equal(await closed, 1009, "closed with 'message too big'");
  await until(() => h.streams[0].closed);
  // двигун живий і приймає нові сеанси
  const c2 = await h.connect();
  await until(() => h.streams.length === 2);
  assert.equal(h.streams[1].closed, false);
  c2.close();
  await h.done();
});

test("input, output and resize are bridged", async () => {
  const h = await harness();
  const c = await h.connect();
  await until(() => h.streams.length === 1);
  const s = h.streams[0];
  c.send(Buffer.concat([Buffer.from([1]), Buffer.from("ls\n")]));
  await until(() => s.written.length === 1);
  assert.equal(s.written[0], "ls\n");
  c.send(Buffer.concat([Buffer.from([2]), Buffer.from(JSON.stringify({ type: "resize", rows: 40, cols: 100 }))]));
  await until(() => s.window !== null);
  assert.deepEqual(s.window, [40, 100, 0, 0]);
  const got = new Promise((r) => c.once("message", (m) => r(String(m))));
  s.emit("data", Buffer.from("hello"));
  assert.equal(await got, "hello");
  c.close();
  await h.done();
});

test("a malformed control frame is ignored, not fatal", async () => {
  const h = await harness();
  const c = await h.connect();
  await until(() => h.streams.length === 1);
  c.send(Buffer.concat([Buffer.from([2]), Buffer.from("{not json")]));
  c.send(Buffer.from([]));
  c.send(Buffer.concat([Buffer.from([1]), Buffer.from("x")]));
  await until(() => h.streams[0].written.length === 1);
  assert.equal(h.streams[0].closed, false);
  c.close();
  await h.done();
});

test("a client that leaves while the shell is opening does not leave an orphaned shell", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const opened = [];
  const h = await harness({ shell: async () => { await gate; const s = new FakeStream(); opened.push(s); return s; } });
  const c = await h.connect();
  c.terminate();
  await new Promise((r) => setTimeout(r, 50));
  release();
  await until(() => opened.length === 1);
  await until(() => opened[0].closed);
  await h.done();
});

test("a shell that fails to open closes the session with a message", async () => {
  const h = await harness({ shell: async () => { throw new Error("no shell"); } });
  const c = await h.connect();
  await until(() => c.inbox.length === 1);
  assert.match(c.inbox[0], /no shell/);
  await until(() => c.readyState === WebSocket.CLOSED);
  await h.done();
});
