// FIM — контроль цілісності критичних файлів по SSH (як syscheck у Wazuh, але без агента).
// Знімаємо sha256 + атрибути, порівнюємо з базовою лінією, що зберігається локально.

export const FIM_PATHS = [
  "/etc/passwd",
  "/etc/shadow",
  "/etc/group",
  "/etc/gshadow",
  "/etc/sudoers",
  "/etc/ssh/sshd_config",
  "/etc/hosts",
  "/etc/resolv.conf",
  "/etc/crontab",
  "/etc/pam.d/sshd",
  "/etc/pam.d/common-auth",
  "/etc/ld.so.preload",
  "/etc/profile",
  "/etc/bash.bashrc",
  "/root/.ssh/authorized_keys",
  "/root/.bashrc",
  "/usr/bin/sudo",
  "/usr/bin/passwd",
  "/usr/sbin/sshd",
];
const FIM_DIRS = ["/etc/cron.d", "/etc/sudoers.d", "/etc/systemd/system"];

const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

function script() {
  const files = FIM_PATHS.map(q).join(" ");
  const dirs = FIM_DIRS.map(q).join(" ");
  // sudo -n — якщо дозволено без пароля, читаємо й закриті файли (shadow); інакше — як є
  return `S=""; sudo -n true 2>/dev/null && S="sudo -n";
for d in ${dirs}; do [ -d "$d" ] && find "$d" -maxdepth 1 -type f 2>/dev/null; done > /tmp/.lsfim.$$;
for f in ${files} $(cat /tmp/.lsfim.$$); do
  if [ -e "$f" ]; then
    h=$($S sha256sum "$f" 2>/dev/null | cut -d' ' -f1);
    echo "F|$f|\${h:-?}|$(stat -c '%s|%a|%U|%Y' "$f" 2>/dev/null)";
  else echo "M|$f"; fi;
done; rm -f /tmp/.lsfim.$$`;
}

export async function scanFim(conn) {
  const { stdout } = await conn.exec(script(), { timeout: 30000 });
  const files = [];
  for (const line of stdout.split("\n")) {
    const p = line.trim().split("|");
    if (p[0] === "F" && p.length >= 7) {
      files.push({ path: p[1], sha256: p[2], size: +p[3] || 0, mode: p[4], owner: p[5], mtime: (+p[6] || 0) * 1000 });
    } else if (p[0] === "M") {
      files.push({ path: p[1], sha256: "", size: 0, mode: "", owner: "", mtime: 0, missing: true });
    }
  }
  return files;
}

/** Порівняння з базовою лінією. */
export function diffFim(current, baseline) {
  const base = new Map((baseline?.files || []).map((f) => [f.path, f]));
  const out = current.map((f) => {
    const b = base.get(f.path);
    let status = "ok";
    if (!baseline) status = f.missing ? "missing" : "new";
    else if (f.missing) status = b && !b.missing ? "missing" : "ok";
    else if (!b || b.missing) status = "added";
    else if (b.sha256 !== f.sha256 || b.mode !== f.mode || b.owner !== f.owner) status = "modified";
    const { missing, ...rest } = f;
    return { ...rest, status: f.missing && status === "ok" ? "missing" : status };
  });
  for (const [path, b] of base) {
    if (!current.some((f) => f.path === path) && !b.missing) out.push({ ...b, status: "missing" });
  }
  const changed = baseline ? out.filter((f) => f.status === "modified" || f.status === "added" || (f.status === "missing" && base.get(f.path) && !base.get(f.path).missing)).length : 0;
  return { baselineAt: baseline?.at ?? null, at: Date.now(), files: out, changed };
}
