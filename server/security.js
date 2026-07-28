// Збір постури безпеки хоста по SSH (агентлес). Один exec на запит.
// Дані реальні: слухаючі порти, сесії, невдалі логіни, firewall, оновлення, SUID, sshd hardening.

const SCRIPT = `
LANG=C
echo "@@PORTS@@"
(ss -tulnH 2>/dev/null | awk '{print $1" "$5}') || (netstat -tuln 2>/dev/null | awk 'NR>2{print $1" "$4}')
echo "@@WHO@@"
who 2>/dev/null
echo "@@LAST@@"
last -n 10 -w 2>/dev/null | grep -v '^$' | head -10
echo "@@FAILED@@"
( (timeout 8 journalctl _COMM=sshd --since "24 hours ago" --no-pager 2>/dev/null | grep -c 'Failed password') ; (grep -c 'Failed password' /var/log/auth.log 2>/dev/null) ; echo 0 ) | sort -rn | head -1
echo "@@FW@@"
timeout 6 ufw status 2>/dev/null | head -1
systemctl is-active firewalld 2>/dev/null
echo "IPT $(timeout 6 iptables -S 2>/dev/null | grep -c '^-A')"
echo "@@UPDATES@@"
( (timeout 10 apt-get -s upgrade 2>/dev/null | grep -c '^Inst') ; (timeout 10 dnf -q check-update 2>/dev/null | grep -Ec '^[a-zA-Z0-9]') ; echo 0 ) | sort -rn | head -1
echo "@@SUID@@"
timeout 8 find /usr/bin /usr/sbin /bin /sbin /usr/local/bin /usr/local/sbin -perm -4000 -type f 2>/dev/null | wc -l
echo "@@SSHCFG@@"
sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication|permitemptypasswords|x11forwarding|maxauthtries) '
echo "@@FAIL2BAN@@"
systemctl is-active fail2ban 2>/dev/null || echo inactive
echo "@@END@@"
`.trim();

function splitSections(text) {
  const s = {};
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const m = line.trim().match(/^@@([A-Z0-9]+)@@$/);
    if (m) {
      cur = m[1];
      s[cur] = [];
    } else if (cur && line.trim() !== "") {
      s[cur].push(line);
    }
  }
  return s;
}

function isPublicAddr(addr) {
  // 0.0.0.0:22, [::]:22, *:22 → публічний; 127.0.0.1 / [::1] → локальний
  return /^(0\.0\.0\.0|\*|\[?::\]?|0)[:.]/.test(addr) || /^\[::\]:/.test(addr) || addr.startsWith("*:");
}

function portOf(addr) {
  const m = String(addr).match(/:(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

export async function collectSecurity(conn) {
  const { stdout } = await conn.exec(SCRIPT, { timeout: 45000 });
  const s = splitSections(stdout);

  // Порти
  const ports = [];
  const seen = new Set();
  for (const line of s.PORTS || []) {
    const [proto, addr] = line.trim().split(/\s+/);
    const port = portOf(addr);
    if (!port) continue;
    const pub = isPublicAddr(addr);
    const key = `${proto}:${port}:${pub}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ports.push({ proto: (proto || "").toLowerCase(), port, addr, public: pub });
  }
  ports.sort((a, b) => a.port - b.port);
  const publicPorts = ports.filter((p) => p.public);

  // Сесії / останні входи
  const sessions = (s.WHO || []).map((l) => {
    const parts = l.trim().split(/\s+/);
    return { user: parts[0] || "", tty: parts[1] || "", from: parts[parts.length - 1] || "" };
  });
  const lastLogins = (s.LAST || [])
    .filter((l) => !/^wtmp|^\s*$/.test(l) && !/reboot/.test(l))
    .slice(0, 8)
    .map((l) => l.trim());

  const failedLogins = parseInt((s.FAILED || ["0"])[0], 10) || 0;

  // Firewall
  const fwLines = s.FW || [];
  const ufwLine = fwLines.find((l) => /Status:/i.test(l)) || "";
  const firewalld = fwLines.find((l) => l.trim() === "active");
  const iptLine = fwLines.find((l) => l.startsWith("IPT "));
  const iptCount = iptLine ? parseInt(iptLine.slice(4), 10) || 0 : 0;
  let firewall = { tool: "none", active: false };
  if (/active/i.test(ufwLine)) firewall = { tool: "ufw", active: true };
  else if (/inactive/i.test(ufwLine)) firewall = { tool: "ufw", active: false };
  else if (firewalld) firewall = { tool: "firewalld", active: true };
  else if (iptCount > 0) firewall = { tool: "iptables", active: true };

  const updates = parseInt((s.UPDATES || ["0"])[0], 10) || 0;
  const suid = parseInt((s.SUID || ["0"])[0], 10) || 0;

  // sshd
  const ssh = { rootLogin: "unknown", passwordAuth: "unknown", emptyPasswords: "unknown", x11: "unknown", maxAuthTries: "" };
  for (const l of s.SSHCFG || []) {
    const [k, v] = l.trim().toLowerCase().split(/\s+/);
    if (k === "permitrootlogin") ssh.rootLogin = v;
    if (k === "passwordauthentication") ssh.passwordAuth = v;
    if (k === "permitemptypasswords") ssh.emptyPasswords = v;
    if (k === "x11forwarding") ssh.x11 = v;
    if (k === "maxauthtries") ssh.maxAuthTries = v;
  }

  const fail2ban = (s.FAIL2BAN || ["inactive"])[0].trim() === "active";

  // Ризик-скор (0..100, більше = гірше)
  let risk = 0;
  const findings = [];
  const add = (pts, sev, text) => {
    risk += pts;
    findings.push({ severity: sev, text });
  };
  if (ssh.rootLogin === "yes") add(20, "critical", "Дозволено вхід root по SSH");
  if (ssh.passwordAuth === "yes") add(14, "warning", "Дозволено вхід по паролю (SSH)");
  if (ssh.emptyPasswords === "yes") add(20, "critical", "Дозволено порожні паролі (SSH)");
  if (!firewall.active) add(16, "warning", "Firewall неактивний");
  if (publicPorts.length > 3) add(Math.min(16, publicPorts.length * 2), "warning", `${publicPorts.length} публічних портів`);
  if (updates > 0) add(Math.min(12, Math.ceil(updates / 5)), updates > 30 ? "warning" : "info", `${updates} оновлень очікують`);
  if (failedLogins > 50) add(10, "warning", `${failedLogins} невдалих SSH-логінів за 24 год`);
  else if (failedLogins > 10) add(5, "info", `${failedLogins} невдалих SSH-логінів за 24 год`);
  if (!fail2ban) add(6, "info", "fail2ban неактивний");
  risk = Math.min(100, risk);

  return {
    risk,
    grade: risk >= 60 ? "critical" : risk >= 35 ? "warning" : risk >= 15 ? "info" : "ok",
    findings,
    ports,
    publicPortCount: publicPorts.length,
    sessions,
    lastLogins,
    failedLogins,
    firewall,
    updates,
    suid,
    ssh,
    fail2ban,
    at: Date.now(),
  };
}
