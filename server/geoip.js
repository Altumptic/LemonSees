// Гео-IP збагачення атакуючих адрес. Кеш у памʼяті, пакетний запит до ip-api.com.
// Запит виходить назовні ЛИШЕ для публічних IP атакуючих і лише коли увімкнено гео-IP.
const cache = new Map(); // ip -> { geo, at }
const TTL = 12 * 3600 * 1000;

function isPrivate(ip) {
  return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd)/.test(ip);
}

export async function geoLookup(ips) {
  const out = {};
  const need = [];
  for (const ip of ips) {
    if (isPrivate(ip)) {
      out[ip] = { country: "Локальна", countryCode: "", city: "", isp: "" };
      continue;
    }
    const c = cache.get(ip);
    if (c && Date.now() - c.at < TTL) {
      out[ip] = c.geo;
      continue;
    }
    need.push(ip);
  }

  for (let i = 0; i < need.length; i += 90) {
    const chunk = need.slice(i, i + 90).map((q) => ({ query: q, fields: "status,country,countryCode,city,isp,query" }));
    try {
      const r = await fetch("http://ip-api.com/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(12000),
      });
      const arr = await r.json();
      for (const g of arr) {
        const geo =
          g.status === "success"
            ? { country: g.country || "", countryCode: g.countryCode || "", city: g.city || "", isp: g.isp || "" }
            : { country: "?", countryCode: "", city: "", isp: "" };
        if (g.query) {
          out[g.query] = geo;
          cache.set(g.query, { geo, at: Date.now() });
        }
      }
    } catch {
      // офлайн або ліміт — лишаємо без гео
    }
  }
  return out;
}
