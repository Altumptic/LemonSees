// EDR: телеметрія кінцевої точки по SSH — процеси та механізми персистентності.
// Агентлес: SSH-сесія виступає збирачем, нічого не встановлюється.

function splitSections(text) {
  const s = {};
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const m = line.trim().match(/^@@([A-Z]+)@@$/);
    if (m) {
      cur = m[1];
      s[cur] = [];
    } else if (cur && line.trim() !== "") {
      s[cur].push(line);
    }
  }
  return s;
}

/* ---------------- Процеси ---------------- */

const PS = `ps -eo user:20,pid,ppid,pcpu,pmem,etimes,stat,comm --sort=-pcpu 2>/dev/null | head -61`;

export async function collectProcesses(conn) {
  const { stdout } = await conn.exec(PS, { timeout: 20000 });
  const lines = stdout.split("\n").filter((l) => l.trim());
  const rows = [];
  for (const l of lines.slice(1)) {
    const p = l.trim().split(/\s+/);
    if (p.length < 8) continue;
    const [user, pid, ppid, pcpu, pmem, etimes, stat] = p;
    const comm = p.slice(7).join(" ");
    rows.push({
      user,
      pid: parseInt(pid, 10) || 0,
      ppid: parseInt(ppid, 10) || 0,
      cpu: parseFloat(pcpu) || 0,
      mem: parseFloat(pmem) || 0,
      uptimeSec: parseInt(etimes, 10) || 0,
      stat,
      comm,
    });
  }
  const total = rows.length;
  const cpuSum = rows.reduce((a, r) => a + r.cpu, 0);
  const memSum = rows.reduce((a, r) => a + r.mem, 0);
  return { processes: rows, total, cpuSum: Math.round(cpuSum * 10) / 10, memSum: Math.round(memSum * 10) / 10, at: Date.now() };
}

/* ---------------- Персистентність ---------------- */

const PERSIST = `
LANG=C
echo "@@CRON@@"
for f in /etc/crontab /etc/cron.d/* /var/spool/cron/crontabs/*; do [ -f "$f" ] && grep -vhE '^\\s*(#|$)' "$f" 2>/dev/null | sed "s|^|$(basename $f): |"; done
crontab -l 2>/dev/null | grep -vE '^\\s*(#|$)' | sed 's/^/user-crontab: /'
echo "@@SERVICES@@"
systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null | awk '{print $1}' | head -60
echo "@@ENABLED@@"
systemctl list-unit-files --type=service --state=enabled --no-legend --no-pager 2>/dev/null | awk '{print $1}' | head -60
echo "@@TIMERS@@"
systemctl list-timers --all --no-legend --no-pager 2>/dev/null | awk '{print $(NF-1), $NF}' | head -25
echo "@@STARTUP@@"
ls -1 /etc/rc.local /etc/profile.d/*.sh /root/.bashrc 2>/dev/null | head -20
echo "@@END@@"
`.trim();

export async function collectPersistence(conn) {
  const { stdout } = await conn.exec(PERSIST, { timeout: 25000 });
  const s = splitSections(stdout);

  const cron = (s.CRON || []).map((l) => {
    const idx = l.indexOf(": ");
    return idx > 0 ? { source: l.slice(0, idx), entry: l.slice(idx + 2).trim() } : { source: "?", entry: l.trim() };
  });
  const running = (s.SERVICES || []).map((x) => x.trim()).filter(Boolean);
  const enabled = (s.ENABLED || []).map((x) => x.trim()).filter(Boolean);
  const timers = (s.TIMERS || []).map((x) => x.trim()).filter(Boolean);
  const startup = (s.STARTUP || []).map((x) => x.trim()).filter(Boolean);

  // Служби, що ввімкнені в автозапуск але не в дефолтному наборі, підсвічуємо як варті уваги
  return {
    cron,
    running,
    enabled,
    timers,
    startup,
    counts: { cron: cron.length, running: running.length, enabled: enabled.length, timers: timers.length },
    at: Date.now(),
  };
}
