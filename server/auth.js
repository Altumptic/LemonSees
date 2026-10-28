// Доступ у веб-режимі. Якщо задано LEMONSEES_TOKEN — усі /api та /ws вимагають сесії.
// Без токена сервер дозволено слухати лише на loopback (127.0.0.1).
import crypto from "node:crypto";

export const TOKEN = process.env.LEMONSEES_TOKEN || "";
const COOKIE = "lemonsees_session";
const sessions = new Map(); // sid -> expiresAt
const TTL = 12 * 3600 * 1000;

export const authEnabled = () => TOKEN.length > 0;

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cookieSid(req) {
  const raw = req.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}

export function isAuthed(req) {
  if (!authEnabled()) return true;
  const sid = cookieSid(req);
  const exp = sid && sessions.get(sid);
  if (!exp || exp < Date.now()) return false;
  sessions.set(sid, Date.now() + TTL);
  return true;
}

// Простий захист від перебору: не більше 10 спроб за 10 хв з однієї адреси
const attempts = new Map();
function throttled(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter((t) => now - t < 600000);
  attempts.set(ip, a);
  return a.length >= 10;
}

export function mountAuth(app, { secure }) {
  app.post("/api/auth/login", (req, res) => {
    const ip = req.socket.remoteAddress || "?";
    if (!authEnabled()) return res.json({ ok: true });
    if (throttled(ip)) return res.status(429).json({ error: "Too many attempts" });
    if (!safeEqual(req.body?.token || "", TOKEN)) {
      attempts.get(ip).push(Date.now());
      return res.status(401).json({ error: "Invalid token" });
    }
    const sid = crypto.randomBytes(32).toString("hex");
    sessions.set(sid, Date.now() + TTL);
    res.setHeader("Set-Cookie", `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL / 1000}${secure ? "; Secure" : ""}`);
    res.json({ ok: true });
  });
  app.post("/api/auth/logout", (req, res) => {
    const sid = cookieSid(req);
    if (sid) sessions.delete(sid);
    res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    res.json({ ok: true });
  });
  // Усе інше під /api — лише з сесією
  app.use("/api", (req, res, next) => {
    // /agent/ingest автентифікується власним токеном агента
    if (req.path === "/info" || req.path.startsWith("/auth/") || req.path === "/agent/ingest") return next();
    if (!isAuthed(req)) return res.status(401).json({ error: "Unauthorized" });
    next();
  });
}
