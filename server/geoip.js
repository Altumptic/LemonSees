// Гео-IP збагачення адрес атакуючих — OPT-IN (PSB P2 «least data»).
// Вмикається лише явно в налаштуваннях; запит іде тільки по HTTPS (ipwho.is), лише для публічних IP
// атакуючих (не для твоїх хостів), через проксі/Tor, якщо налаштовано. Кеш у памʼяті 12 год.
import { netFetch } from "./netproxy.js";

export const GEO_PROVIDER = "https://ipwho.is";
const cache = new Map(); // ip -> { geo, at }
const TTL = 12 * 3600 * 1000;
const MAX_PER_CALL = 60;

function isPrivate(ip) {
  return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|fc|fd|fe80)/i.test(ip);
}

async function one(ip) {
  const r = await netFetch(`${GEO_PROVIDER}/${encodeURIComponent(ip)}?fields=success,country,country_code,city,latitude,longitude,connection`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  const g = await r.json();
  return g.success
    ? { country: g.country || "", countryCode: g.country_code || "", city: g.city || "", isp: g.connection?.isp || g.connection?.org || "", lat: g.latitude ?? 0, lon: g.longitude ?? 0 }
    : { country: "?", countryCode: "", city: "", isp: "", lat: 0, lon: 0 };
}

export async function geoLookup(ips) {
  const out = {};
  const need = [];
  for (const ip of ips) {
    if (isPrivate(ip)) {
      out[ip] = { country: "Локальна", countryCode: "", city: "", isp: "", lat: 0, lon: 0 };
      continue;
    }
    const c = cache.get(ip);
    if (c && Date.now() - c.at < TTL) out[ip] = c.geo;
    else if (need.length < MAX_PER_CALL) need.push(ip);
  }
  // Невелика паралельність — чемно до безкоштовного сервісу
  for (let i = 0; i < need.length; i += 4) {
    await Promise.all(
      need.slice(i, i + 4).map(async (ip) => {
        try {
          const geo = await one(ip);
          out[ip] = geo;
          cache.set(ip, { geo, at: Date.now() });
        } catch {
          /* офлайн / ліміт / kill switch — лишаємо без гео */
        }
      }),
    );
  }
  return out;
}
