// Авторизація веб-режиму: без сесії — 401, неправильний токен — 401, обмеження спроб — 429.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.LEMONSEES_TOKEN = "t".repeat(48);
const express = (await import("express")).default;
const { mountAuth } = await import("../server/auth.js");

const app = express();
app.use(express.json());
mountAuth(app, { secure: false });
app.get("/api/secret", (req, res) => res.json({ ok: true }));
app.post("/api/agent/ingest", (req, res) => res.json({ reached: true }));
const server = http.createServer(app);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const post = (p, body, headers = {}) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("API is closed without a session", async () => {
  assert.equal((await fetch(base + "/api/secret")).status, 401);
});

test("wrong token is rejected, right token yields an HttpOnly SameSite=Strict session", async () => {
  assert.equal((await post("/api/auth/login", { token: "nope" })).status, 401);
  const ok = await post("/api/auth/login", { token: "t".repeat(48) });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const r = await fetch(base + "/api/secret", { headers: { cookie: cookie.split(";")[0] } });
  assert.equal(r.status, 200);
});

test("agent ingest bypasses the session (it has its own token check)", async () => {
  assert.equal((await post("/api/agent/ingest", {})).status, 200);
});

test("login is rate-limited", async () => {
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await post("/api/auth/login", { token: "bad" })).status;
  assert.equal(last, 429);
  server.close();
});
