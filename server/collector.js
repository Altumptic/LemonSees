// Збирач метрик: один exec на цикл — CPU/RAM/Disk/uptime + docker ps/stats/networks/volumes.
// CPU рахується як дельта /proc/stat між двома опитуваннями (без sleep на сервері).

// Маркери секцій, щоб парсити суцільний вивід одного скрипта
const SCRIPT = `
LANG=C
echo "@@HOST@@"
head -1 /proc/stat
free -m 2>/dev/null | awk 'NR==2{print $2" "$3" "$7}'
df -kP / 2>/dev/null | awk 'NR==2{print $2" "$3}'
cut -d. -f1 /proc/uptime
awk '{print $1" "$2" "$3}' /proc/loadavg
uname -r
nproc 2>/dev/null || echo 1
echo "@@DOCKERV@@"
docker version --format '{{.Server.Version}}' 2>/dev/null || echo "-"
echo "@@PS@@"
docker ps -a --no-trunc --format '{{json .}}' 2>/dev/null
echo "@@STATS@@"
docker stats --no-stream --format '{{json .}}' 2>/dev/null
echo "@@NET@@"
docker network ls --format '{{json .}}' 2>/dev/null
echo "@@VOL@@"
docker volume ls --format '{{json .}}' 2>/dev/null
echo "@@END@@"
`.trim();

function splitSections(text) {
  const sections = {};
  let current = null;
  for (const line of text.split("\n")) {
    const t = line.trim();
    const m = t.match(/^@@([A-Z]+)@@$/);
    if (m) {
      current = m[1];
      sections[current] = [];
      continue;
    }
    if (current && t !== "") sections[current].push(t);
  }
  return sections;
}

function parseJsonLines(lines = []) {
  const out = [];
  for (const l of lines) {
    try {
      out.push(JSON.parse(l));
    } catch {
      /* пропускаємо биті рядки */
    }
  }
  return out;
}

// "128MiB / 1.944GiB" → { used: MB, limit: MB }
function parseMemUsage(s) {
  const toMb = (v) => {
    const m = String(v).trim().match(/^([\d.]+)\s*([A-Za-z]+)$/);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    if (u.startsWith("b")) return n / 1024 / 1024;
    if (u.startsWith("k")) return n / 1024;
    if (u.startsWith("m")) return n;
    if (u.startsWith("g")) return n * 1024;
    if (u.startsWith("t")) return n * 1024 * 1024;
    return n;
  };
  const [used, limit] = String(s).split("/");
  return { used: Math.round(toMb(used || "0")), limit: Math.round(toMb(limit || "0")) };
}

function parseCpuLine(line) {
  // cpu  user nice system idle iowait irq softirq steal ...
  const parts = line.replace(/^cpu\s+/, "").trim().split(/\s+/).map(Number);
  if (parts.length < 4 || parts.some(Number.isNaN)) return null;
  const idle = (parts[3] || 0) + (parts[4] || 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function normState(s) {
  const v = String(s || "").toLowerCase();
  if (v === "running" || v === "restarting" || v === "paused" || v === "exited" || v === "created" || v === "dead")
    return v;
  return "exited";
}

export class Poller {
  constructor(conn, cfg, onUpdate) {
    this.conn = conn;
    this.cfg = cfg;
    this.onUpdate = onUpdate;
    this.prevCpu = null;
    this.timer = null;
    this.stopped = false;
    this.running = false;
    this.state = {
      id: cfg.id,
      status: "connecting",
      error: "",
      metrics: null,
      containers: [],
      networks: [],
      volumes: [],
      dockerVersion: "-",
      updatedAt: 0,
    };
  }

  updateConfig(cfg) {
    this.cfg = cfg;
  }

  start() {
    this.stopped = false;
    this.loop();
  }

  loop() {
    if (this.stopped) return;
    this.tick().finally(() => {
      if (this.stopped) return;
      this.timer = setTimeout(() => this.loop(), (this.cfg.interval || 5) * 1000);
    });
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const { stdout } = await this.conn.exec(SCRIPT, { timeout: 30000 });
      this.parse(stdout);
      this.state.status = "online";
      this.state.error = "";
    } catch (e) {
      this.state.status = this.conn.ready ? "error" : "offline";
      this.state.error = e?.message || String(e);
    } finally {
      this.state.updatedAt = Date.now();
      this.running = false;
      this.onUpdate(this.cfg.id, this.state);
    }
  }

  parse(text) {
    const s = splitSections(text);

    // --- host metrics ---
    const hostLines = s.HOST || [];
    const cpuNow = hostLines[0] ? parseCpuLine(hostLines[0]) : null;
    let cpuPct = this.state.metrics?.cpu ?? 0;
    if (cpuNow && this.prevCpu) {
      const dTotal = cpuNow.total - this.prevCpu.total;
      const dIdle = cpuNow.idle - this.prevCpu.idle;
      if (dTotal > 0) cpuPct = Math.max(0, Math.min(100, Math.round((1 - dIdle / dTotal) * 100)));
    }
    if (cpuNow) this.prevCpu = cpuNow;

    const mem = (hostLines[1] || "").split(/\s+/).map(Number);
    const disk = (hostLines[2] || "").split(/\s+/).map(Number);
    const uptimeSec = parseInt(hostLines[3], 10) || 0;
    const load = (hostLines[4] || "").split(/\s+/).map(Number);
    const kernel = hostLines[5] || "-";
    const cores = parseInt(hostLines[6], 10) || 1;

    const memTotal = mem[0] || 0;
    const memAvail = Number.isFinite(mem[2]) ? mem[2] : null;
    const memUsed = memAvail != null && memTotal ? memTotal - memAvail : mem[1] || 0;

    this.state.metrics = {
      cpu: cpuPct,
      memTotalMb: memTotal,
      memUsedMb: memUsed,
      memPct: memTotal ? Math.round((memUsed / memTotal) * 100) : 0,
      diskTotalKb: disk[0] || 0,
      diskUsedKb: disk[1] || 0,
      diskPct: disk[0] ? Math.round(((disk[1] || 0) / disk[0]) * 100) : 0,
      uptimeSec,
      load1: load[0] || 0,
      kernel,
      cores,
    };

    this.state.dockerVersion = (s.DOCKERV || ["-"])[0] || "-";

    // --- docker ---
    const ps = parseJsonLines(s.PS);
    const stats = parseJsonLines(s.STATS);
    const statByName = new Map();
    for (const st of stats) statByName.set(st.Name, st);

    this.state.containers = ps.map((c) => {
      const st = statByName.get(c.Names) || null;
      const memU = st ? parseMemUsage(st.MemUsage) : { used: 0, limit: 0 };
      return {
        id: String(c.ID || "").slice(0, 12),
        name: c.Names || "",
        image: c.Image || "",
        state: normState(c.State),
        status: c.Status || "",
        ports: c.Ports || "",
        cpuPct: st ? parseFloat(String(st.CPUPerc).replace("%", "")) || 0 : 0,
        memUsedMb: memU.used,
        memLimitMb: memU.limit,
      };
    });

    this.state.networks = parseJsonLines(s.NET).map((n) => ({
      id: n.ID || "",
      name: n.Name || "",
      driver: n.Driver || "",
      scope: n.Scope || "",
    }));

    this.state.volumes = parseJsonLines(s.VOL).map((v) => ({
      name: v.Name || "",
      driver: v.Driver || "",
      scope: v.Scope || "",
      mountpoint: v.Mountpoint || "",
    }));
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
