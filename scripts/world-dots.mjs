// Генерує src/lib/worldDots.ts — крапкову маску суші (equirectangular) для карти атак.
// npm run world-dots  (потрібні devDependencies world-atlas, topojson-client, d3-geo)
import fs from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";
import { geoContains } from "d3-geo";

const require = createRequire(import.meta.url);
const topo = require("world-atlas/land-110m.json");
const land = feature(topo, topo.objects.land);
const COLS = 120;
const ROWS = 58; // 84°N … 56°S — без Антарктиди
const LAT_TOP = 84;
const LAT_SPAN = 140;
const rows = [];
for (let r = 0; r < ROWS; r++) {
  let bits = "";
  for (let c = 0; c < COLS; c++) {
    const lon = -180 + (c + 0.5) * (360 / COLS);
    const lat = LAT_TOP - (r + 0.5) * (LAT_SPAN / ROWS);
    bits += geoContains(land, [lon, lat]) ? "1" : "0";
  }
  // кожен рядок — hex-рядок бітів
  rows.push(BigInt("0b" + bits).toString(16).padStart(COLS / 4, "0"));
}
const out = `// Згенеровано scripts/world-dots.mjs — не редагувати вручну.
export const WORLD = { cols: ${COLS}, rows: ${ROWS}, latTop: ${LAT_TOP}, latSpan: ${LAT_SPAN} };
export const WORLD_ROWS: string[] = ${JSON.stringify(rows)};
`;
fs.writeFileSync(new URL("../src/lib/worldDots.ts", import.meta.url), out);
console.log("worldDots.ts:", out.length, "bytes");
