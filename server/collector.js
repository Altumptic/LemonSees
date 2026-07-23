// Збирач метрик: один exec на цикл.
// CPU рахується всередині сесії через ДВА зчитування /proc/stat з паузою —
// це дає реальне миттєве навантаження окремо для кожного хоста (не залежить від інтервалу опитування).

const SCRIPT = `
LANG=C
CPU1=$(head -1 /proc/stat)
sleep 0.3
CPU2=$(head -1 /proc/stat)
echo "CPU1 $CPU1"
echo "CPU2 $CPU2"
echo "MEM $(free -m 2>/dev/null | awk 'NR==2{print $2, $3, $7}')"
echo "SWAP $(free -m 2>/dev/null | awk 'NR==3{print $2, $3}')"
echo "DISK $(df -kP / 2>/dev/null | awk 'NR==2{print $2, $3}')"
echo "UPTIME $(cut -d. -f1 /proc/uptime)"
echo "LOAD $(awk '{print $1, $2, $3}' /proc/loadavg)"
echo "KERNEL $(uname -r)"
echo "CORES $(nproc 2>/dev/null || echo 1)"
echo "HOSTNAME $(hostname 2>/dev/null)"
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

// Розбиває на пари ключ→значення (до першого @@…@@) та секції докера.
function parseOutput(text) {
  const kv = {};
  const sections = {};
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const marker = line.trim().match(/^@@([A-Z]+)@@$/);
    if (marker) {
      current = marker[1];
      sections[current] = [];
      continue;
    }
    if (current === null) {
      const sp = line.indexOf(" ");
      if (sp > 0) kv[line.slice(0, sp)] = line.slice(sp + 1).trim();
      else if (line.trim()) kv[line.trim()] = "";
    } else if (line.trim() !== "") {
      sections[current].push(line.trim());
    }
  }
  return { kv, sections };
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

// "cpu 123 0 456 789 ..." → { idle, total }
function parseCpuLine(line) {
  const m = String(line).trim().match(/^cpu\s+(.+)$/);
  if (!m) return null;
  const parts = m[1].trim().split(/\s+/).map(Number);
  if (parts.length < 4 || parts.some(Number.isNaN)) return null;
  const idle = (parts[3] || 0) + (parts[4] || 0); // idle + iowait
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function cpuPercent(l1, l2) {
  const a = parseCpuLine(l1);
  const b = parseCpuLine(l2);
  if (!a || !b) return null;
  const dTotal = b.total - a.total;
  const dIdle = b.idle - a.idle;
  if (dTotal <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - dIdle / dTotal) * 100)));
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

function normState(s) {
  const v = String(s || "").toLowerCase();
  if (["running", "restarting", "paused", "exited", "created", "dead"].includes(v)) return v;
  return "exited";
}

function nums(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

export class Poller {
  constructor(conn, cfg, onUpdate) {
    this.conn = conn;
    this.cfg = cfg;
    this.onUpdate = onUpdate;
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
    const { kv, sections } = parseOutput(text);

    const cpu = cpuPercent(kv.CPU1, kv.CPU2);
    const mem = nums(kv.MEM); // total used avail
    const disk = nums(kv.DISK); // total used (KB)
    const load = nums(kv.LOAD);
    const uptimeSec = parseInt(kv.UPTIME, 10) || 0;
    const cores = parseInt(kv.CORES, 10) || 1;

    const memTotal = mem[0] || 0;
    const memAvail = mem.length >= 3 ? mem[2] : null;
    const memUsed = memAvail != null && memTotal ? memTotal - memAvail : mem[1] || 0;

    this.state.metrics = {
      cpu: cpu ?? this.state.metrics?.cpu ?? 0,
      memTotalMb: memTotal,
      memUsedMb: memUsed,
      memPct: memTotal ? Math.round((memUsed / memTotal) * 100) : 0,
      diskTotalKb: disk[0] || 0,
      diskUsedKb: disk[1] || 0,
      diskPct: disk[0] ? Math.round(((disk[1] || 0) / disk[0]) * 100) : 0,
      uptimeSec,
      load1: load[0] || 0,
      kernel: kv.KERNEL || "-",
      cores,
      hostname: kv.HOSTNAME || "",
    };

    this.state.dockerVersion = (sections.DOCKERV || ["-"])[0] || "-";

    const ps = parseJsonLines(sections.PS);
    const stats = parseJsonLines(sections.STATS);
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

    this.state.networks = parseJsonLines(sections.NET).map((n) => ({
      id: n.ID || "",
      name: n.Name || "",
      driver: n.Driver || "",
      scope: n.Scope || "",
    }));

    this.state.volumes = parseJsonLines(sections.VOL).map((v) => ({
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
