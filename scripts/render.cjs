// LemonSees by Altumptic — генератор графіки через офскрін-рендер Electron.
//   npx electron scripts/render.cjs icons                 — PNG-іконки з public/logo.svg
//   npx electron scripts/render.cjs shots [url]           — скриншоти демо (2x) у .github/assets/screens
//   npx electron scripts/render.cjs gallery               — маркетингові зображення 1270×760 (Product Hunt)
// Для shots має працювати фронт (npm run dev → http://localhost:5198 або зібраний npm start).
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const mode = process.argv[2] || "icons";
const arg = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.commandLine.appendSwitch("force-color-profile", "srgb");
app.disableHardwareAcceleration();

async function win(width, height, zoom = 1, transparent = false) {
  const w = new BrowserWindow({
    width: Math.round(width * zoom),
    height: Math.round(height * zoom),
    show: false,
    frame: false,
    transparent,
    backgroundColor: transparent ? "#00000000" : "#faf9f5",
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  w.webContents.setFrameRate(30);
  w.setContentSize(Math.round(width * zoom), Math.round(height * zoom));
  return w;
}

async function capture(w, zoom, out) {
  w.webContents.setZoomFactor(zoom);
  await sleep(250);
  const img = await w.webContents.capturePage();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, img.toPNG());
  console.log("  ✓", path.relative(ROOT, out), img.getSize());
}

/* ---------------- Іконки ---------------- */

async function icons() {
  const svg = fs.readFileSync(path.join(ROOT, "public/logo.svg"), "utf8").replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"');
  const targets = [
    [1024, "buildResources/icon.png"],
    [512, "public/logo.png"],
    [512, ".github/assets/logo.png"],
    [180, "public/apple-touch-icon.png"],
    [64, "public/favicon.png"],
    [240, ".github/assets/producthunt/thumbnail.png"],
  ];
  // Рендеримо один раз у 1024 px, решту — якісним даунскейлом
  const w = await win(1024, 1024, 1, true);
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden"><div style="width:1024px;height:1024px">${svg}</div></body></html>`;
  const tmp = path.join(require("node:os").tmpdir(), "lemonsees-icon.html");
  fs.writeFileSync(tmp, html);
  await w.loadFile(tmp);
  await sleep(400);
  const big = await w.webContents.capturePage();
  w.destroy();
  fs.unlinkSync(tmp);
  for (const [size, rel] of targets) {
    const img = size === 1024 ? big : big.resize({ width: size, height: size, quality: "best" });
    const out = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, img.toPNG());
    console.log("  ✓", rel, img.getSize());
  }
}

/* ---------------- Скриншоти застосунку ---------------- */

const SHOTS = [
  ["overview", "#/siem/overview", "light", 0],
  ["analytics", "#/siem/analytics", "light", 0],
  ["mitre", "#/cti/mitre", "light", 380],
  ["threats", "#/cti/threats", "light", 0],
  ["incidents", "#/soar/incidents", "light", 0],
  ["compliance", "#/grc/compliance", "light", 0],
  ["fim", "#/edr/fim", "light", 0],
  ["overview-dark", "#/siem/overview", "dark", 0],
  ["endpoints-dark", "#/edr/endpoints", "dark", 0],
  ["analytics-flow", "#/siem/analytics", "light", 700],
  ["privacy", "#/system/privacy", "light", 0],
  ["integrations", "#/system/integrations", "light", 0],
  ["wazuh", "#/siem/wazuh", "light", 0],
  ["agents", "#/edr/agents", "light", 360],
  ["rules", "#/soar/rules", "light", 0],
];

async function shots() {
  const base = arg || "http://localhost:5198/";
  const W = 1440;
  const H = 900;
  const Z = 2;
  // Одне вікно на всі знімки (повторні офскрін-вікна в Electron нестабільні)
  const w = await win(W, H, Z);
  await w.loadURL(base);
  let n = 0;
  for (const [name, hash, theme, scrollY] of SHOTS) {
    await w.webContents.executeJavaScript(
      `localStorage.setItem("shok.settings", JSON.stringify({ v: 4, demo: true, theme: ${JSON.stringify(theme)}, scale: 100, lang: "en", sidebar: true, effects: true, geoip: true, refreshSec: 0, notify: false, clock24: true, hostId: "h_web01" })); true`,
    );
    await w.loadURL(`${base}?r=${n++}${hash}`);
    w.webContents.setZoomFactor(Z);
    await sleep(3500);
    if (scrollY) {
      await w.webContents.executeJavaScript(`window.scrollTo(0, ${scrollY}); true`);
      await sleep(700);
    }
    await capture(w, Z, path.join(ROOT, ".github/assets/screens", `${name}.png`));
  }
  w.destroy();
}

/* ---------------- Галерея Product Hunt ---------------- */

const GALLERY = [
  { file: "01-overview", shot: "overview", kicker: "Agentless SOC platform", title: "The calm SOC.", sub: "Agentless security operations over SSH — SIEM, EDR, NDR, CTI, SOAR and GRC in one quiet, beautiful console." },
  { file: "02-analytics", shot: "analytics", kicker: "SOC analytics", title: "See the shape of every alert.", sub: "Alert volume by severity, MTTA / MTTR, activity heatmaps and analyst workload — out of the box." },
  { file: "03-mitre", shot: "mitre", kicker: "MITRE ATT&CK", title: "Every incident, mapped.", sub: "Detections land on the ATT&CK matrix automatically, so you see which attack stages are hot." },
  { file: "04-threats", shot: "threats", kicker: "Threat intelligence", title: "Who is knocking, and from where.", sub: "Brute-force sources with geo-IP, targeted usernames and successful logins you should double-check." },
  { file: "05-compliance", shot: "compliance", kicker: "GRC", title: "Compliance you can show an auditor.", sub: "CIS, NIST, ISO 27001 and GDPR controls — automated over SSH, attested by humans, exported as reports." },
  { file: "07-privacy", shot: "privacy", kicker: "Privacy by design", title: "Your IP stays yours.", sub: "Route SSH and every outbound call through Tor, a VPN gateway or a proxy — with a kill switch, no DNS leaks and AES-256 secrets at rest." },
  { file: "08-integrations", shot: "integrations", kicker: "Works alone. Plays well with others.", title: "Datadog, Slack, Wazuh and more.", sub: "Forward alerts to Datadog, Splunk, Elastic, Syslog CEF, PagerDuty or chat — or pull agents and alerts from the Wazuh you already run." },
  { file: "09-flow", shot: "analytics-flow", kicker: "Deeper analytics", title: "Follow every alert to its end.", sub: "Sankey flows, response SLA gauges, handling funnels and a half-year activity calendar — built in, no plugins." },
  { file: "06-dark", shot: "overview-dark", kicker: "Web · Windows · Linux", title: "Runs where you work.", sub: "Self-host the web app, or grab the portable desktop build. Ivory and Graphite themes, scales to any screen." },
];

function galleryHtml(g, img) {
  const dark = g.shot.includes("dark");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:Serif;src:url("${path.join(ROOT, "node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2").replace(/\\/g, "/")}") format("woff2");font-weight:200 900}
  @font-face{font-family:Sans;src:url("${path.join(ROOT, "node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2").replace(/\\/g, "/")}") format("woff2");font-weight:100 1000}
  *{box-sizing:border-box}html,body{margin:0;width:1270px;height:760px;overflow:hidden}
  body{background:${dark ? "#1a1917" : "#f0eee6"};font-family:Sans,system-ui;color:${dark ? "#ecebe4" : "#1f1e1d"};position:relative}
  .glow{position:absolute;inset:0;background:radial-gradient(60% 55% at 85% 10%, ${dark ? "rgba(217,119,87,.18)" : "rgba(193,95,60,.14)"}, transparent 70%)}
  .copy{position:absolute;left:64px;top:64px;width:400px}
  .brand{display:flex;align-items:center;gap:12px;font-size:17px;font-weight:600;letter-spacing:-.01em}
  .brand img{width:36px;height:36px}
  .kicker{margin-top:56px;color:${dark ? "#d97757" : "#c15f3c"};font-size:16px;font-weight:600;letter-spacing:.01em}
  h1{font-family:Serif;font-weight:500;font-size:52px;line-height:1.06;letter-spacing:-.02em;margin:14px 0 0;color:${dark ? "#faf9f5" : "#141413"}}
  p{font-size:19px;line-height:1.5;color:${dark ? "#a6a399" : "#6b6963"};margin:22px 0 0}
  .foot{position:absolute;left:64px;bottom:56px;font-size:14px;color:${dark ? "#a6a399" : "#6b6963"}}
  .shot{position:absolute;left:510px;top:70px;width:1080px;border-radius:18px;overflow:hidden;
    box-shadow:0 40px 80px -30px rgba(31,30,29,${dark ? ".8" : ".35"}),0 0 0 1px ${dark ? "#34332f" : "#e2dfd3"}}
  .bar{height:30px;background:${dark ? "#262624" : "#fffefb"};display:flex;align-items:center;gap:7px;padding:0 14px;border-bottom:1px solid ${dark ? "#34332f" : "#e8e5da"}}
  .bar i{width:10px;height:10px;border-radius:50%;background:${dark ? "#46443f" : "#d6d2c4"}}
  .shot img{display:block;width:100%}
  </style></head><body><div class="glow"></div>
  <div class="copy">
    <div class="brand"><img src="${path.join(ROOT, "public/logo.png").replace(/\\/g, "/")}">LemonSees <span style="font-weight:400;opacity:.6">by Altumptic</span></div>
    <div class="kicker">${g.kicker}</div>
    <h1>${g.title}</h1>
    <p>${g.sub}</p>
  </div>
  <div class="foot">github.com/Altumptic/LemonSees</div>
  <div class="shot"><div class="bar"><i></i><i></i><i></i></div><img src="${img.replace(/\\/g, "/")}"></div>
  </body></html>`;
}

async function gallery() {
  const dir = path.join(ROOT, ".github/assets/producthunt");
  fs.mkdirSync(dir, { recursive: true });
  const w = await win(1270, 760, 2);
  for (const g of GALLERY) {
    const img = path.join(ROOT, ".github/assets/screens", `${g.shot}.png`);
    if (!fs.existsSync(img)) {
      console.log("  – skip (no screenshot)", g.shot);
      continue;
    }
    const tmp = path.join(dir, `.${g.file}.html`);
    fs.writeFileSync(tmp, galleryHtml(g, img));
    await w.loadFile(tmp);
    await sleep(900);
    await capture(w, 2, path.join(dir, `${g.file}.png`));
    fs.unlinkSync(tmp);
  }
  // Соц-превʼю репозиторію (1280×640) — та сама розмітка, інший кадр
  const tmp = path.join(dir, ".social.html");
  fs.writeFileSync(tmp, galleryHtml(GALLERY[0], path.join(ROOT, ".github/assets/screens/overview.png")).replace(/1270px/g, "1280px").replace(/760px/g, "640px"));
  w.setContentSize(1280, 640);
  await w.loadFile(tmp);
  await sleep(900);
  await capture(w, 1, path.join(ROOT, ".github/assets/social-preview.png"));
  w.destroy();
  fs.unlinkSync(tmp);
}

app.whenReady().then(async () => {
  try {
    if (mode === "icons") await icons();
    else if (mode === "shots") await shots();
    else if (mode === "gallery") await gallery();
    else console.log("usage: electron scripts/render.cjs icons|shots [url]|gallery");
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
  app.quit();
});
