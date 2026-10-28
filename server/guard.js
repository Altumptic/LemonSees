// Захист периметра двигуна (PSB §5.1, §5.3):
//  • Host-allowlist — блокує DNS rebinding (сторонній сайт, що резолвиться в 127.0.0.1);
//  • Origin-перевірка для API та WebSocket — блокує cross-site запити й cross-site WebSocket
//    (браузер не застосовує CORS до WebSocket, тому без цього будь-який сайт міг би відкрити термінал);
//  • CSP без 'unsafe-inline'/'eval' для скриптів, COOP/CORP, Permissions-Policy.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const LOOPBACK_NAMES = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function hostName(hostHeader) {
  const h = String(hostHeader || "").trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.split(":")[0];
}

export function createGuard({ bindHost }) {
  const loopbackOnly = ["127.0.0.1", "::1", "localhost"].includes(bindHost);
  const allowed = new Set(
    String(process.env.LEMONSEES_ALLOWED_HOSTS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  /** Чи довіряємо заголовку Host (захист від DNS rebinding). */
  function hostOk(req) {
    const name = hostName(req.headers.host);
    if (!name) return false;
    if (LOOPBACK_NAMES.has(name)) return true;
    if (loopbackOnly) return false; // локальний режим: лише loopback-імена
    return allowed.size === 0 || allowed.has(name);
  }

  /** Origin має збігатися з Host (той самий сайт). Без Origin — не браузерний клієнт (агент, curl). */
  function originOk(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (origin === "null") return false;
    try {
      const o = new URL(origin);
      return o.host.toLowerCase() === String(req.headers.host || "").toLowerCase() || allowed.has(o.hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  const middleware = (req, res, next) => {
    if (!hostOk(req)) return res.status(421).json({ error: "Host not allowed" });
    if (req.path.startsWith("/api") && req.path !== "/api/agent/ingest" && !originOk(req)) return res.status(403).json({ error: "Cross-origin request blocked" });
    next();
  };

  const upgradeOk = (req) => hostOk(req) && originOk(req);

  return { middleware, upgradeOk, hostOk, originOk };
}

/** CSP для зібраного фронту: хеш єдиного inline-скрипта (ранній вибір теми) замість 'unsafe-inline'. */
export function buildCsp(distDir) {
  let hashes = [];
  try {
    const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
    hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${crypto.createHash("sha256").update(m[1]).digest("base64")}'`);
  } catch {
    /* фронт не зібрано — двигун працює лише як API */
  }
  return (req) =>
    [
      "default-src 'self'",
      `script-src 'self' ${hashes.join(" ")}`.trim(),
      // Динамічні стилі (xterm, графіки) — відомий компроміс, задокументовано в SECURITY-NOTES.md
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src 'self' ws://${req.headers.host} wss://${req.headers.host}`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
}

export function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), usb=(), payment=(), interest-cohort=()");
}
