// Комплаєнс: автоматичні контролі (CIS-подібні) перевіряються по SSH,
// ручні контролі (governance) атестує аналітик — стан зберігається локально.

const SCRIPT = `
LANG=C
echo "@@SSHD@@"
sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication|permitemptypasswords|x11forwarding|maxauthtries|clientaliveinterval|clientalivecountmax) '
echo "@@KV@@"
echo "FW $(timeout 6 ufw status 2>/dev/null | head -1 | grep -qi active && echo active || (systemctl is-active firewalld 2>/dev/null | grep -q '^active' && echo active || (timeout 6 iptables -S 2>/dev/null | grep -q '^-A' && echo active || echo inactive)))"
echo "UFWDEF $(timeout 6 ufw status verbose 2>/dev/null | grep -i 'Default:' | head -1 | tr -d '\\n')"
echo "AUTOUPD $( (systemctl is-active unattended-upgrades 2>/dev/null; systemctl is-active dnf-automatic.timer 2>/dev/null) | grep -m1 active || echo inactive )"
echo "FAIL2BAN $(systemctl is-active fail2ban 2>/dev/null || echo inactive)"
echo "AUDITD $(systemctl is-active auditd 2>/dev/null || echo inactive)"
echo "TIMESYNC $(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo unknown)"
echo "PASSMAX $(grep -E '^PASS_MAX_DAYS' /etc/login.defs 2>/dev/null | awk '{print \\$2}')"
echo "WWETC $(find /etc -xdev -type f -perm -0002 2>/dev/null | wc -l)"
echo "ROOTUID $(awk -F: '(\\$3==0){print \\$1}' /etc/passwd 2>/dev/null | grep -vc '^root$')"
echo "@@END@@"
`.trim();

// Визначення авто-контролів. eval(sshd, kv) → { status, evidence }
export const AUTO_CONTROLS = [
  {
    id: "ssh-root",
    title: "Вхід root по SSH заборонено",
    framework: "CIS 5.2.7",
    severity: "critical",
    eval: (s) => {
      const v = s.sshd.permitrootlogin;
      if (!v) return unk();
      return v === "no" || v === "prohibit-password"
        ? pass(`PermitRootLogin ${v}`)
        : fail(`PermitRootLogin ${v}`);
    },
  },
  {
    id: "ssh-pass",
    title: "Автентифікація паролем вимкнена (SSH)",
    framework: "CIS 5.2.10",
    severity: "warning",
    eval: (s) => bool(s.sshd.passwordauthentication === "no", `PasswordAuthentication ${s.sshd.passwordauthentication || "?"}`),
  },
  {
    id: "ssh-empty",
    title: "Порожні паролі заборонено (SSH)",
    framework: "CIS 5.2.9",
    severity: "critical",
    eval: (s) => bool(s.sshd.permitemptypasswords === "no", `PermitEmptyPasswords ${s.sshd.permitemptypasswords || "?"}`),
  },
  {
    id: "ssh-x11",
    title: "X11 forwarding вимкнено",
    framework: "CIS 5.2.6",
    severity: "info",
    eval: (s) => bool(s.sshd.x11forwarding === "no", `X11Forwarding ${s.sshd.x11forwarding || "?"}`),
  },
  {
    id: "ssh-maxauth",
    title: "MaxAuthTries ≤ 4",
    framework: "CIS 5.2.5",
    severity: "info",
    eval: (s) => {
      const n = parseInt(s.sshd.maxauthtries, 10);
      if (Number.isNaN(n)) return unk();
      return bool(n <= 4, `MaxAuthTries ${n}`);
    },
  },
  {
    id: "ssh-idle",
    title: "SSH idle timeout налаштовано",
    framework: "CIS 5.2.16",
    severity: "info",
    eval: (s) => {
      const i = parseInt(s.sshd.clientaliveinterval, 10);
      const c = parseInt(s.sshd.clientalivecountmax, 10);
      if (Number.isNaN(i)) return unk();
      return bool(i > 0 && i <= 900 && c <= 3, `Interval ${i}, CountMax ${c}`);
    },
  },
  {
    id: "firewall",
    title: "Firewall активний",
    framework: "CIS 3.5",
    severity: "warning",
    eval: (s) => bool(s.kv.FW === "active", `firewall: ${s.kv.FW || "?"}`),
  },
  {
    id: "ufw-deny",
    title: "UFW: вхідний трафік за замовчуванням deny",
    framework: "CIS 3.5.1",
    severity: "info",
    eval: (s) => {
      if (!s.kv.UFWDEF) return unk("UFW не використовується");
      return bool(/deny \(incoming\)/i.test(s.kv.UFWDEF), s.kv.UFWDEF);
    },
  },
  {
    id: "auto-updates",
    title: "Автоматичні оновлення безпеки увімкнено",
    framework: "CIS 1.9",
    severity: "warning",
    eval: (s) => bool(s.kv.AUTOUPD === "active", `auto-updates: ${s.kv.AUTOUPD || "?"}`),
  },
  {
    id: "fail2ban",
    title: "fail2ban активний",
    framework: "NIST AC-7",
    severity: "info",
    eval: (s) => bool(s.kv.FAIL2BAN === "active", `fail2ban: ${s.kv.FAIL2BAN || "?"}`),
  },
  {
    id: "auditd",
    title: "auditd (аудит подій) активний",
    framework: "CIS 4.1",
    severity: "warning",
    eval: (s) => bool(s.kv.AUDITD === "active", `auditd: ${s.kv.AUDITD || "?"}`),
  },
  {
    id: "timesync",
    title: "Синхронізація часу активна",
    framework: "CIS 2.1",
    severity: "info",
    eval: (s) => bool(s.kv.TIMESYNC === "yes", `NTPSynchronized: ${s.kv.TIMESYNC || "?"}`),
  },
  {
    id: "pass-max",
    title: "Макс. вік пароля ≤ 365 днів",
    framework: "CIS 5.4.1.1",
    severity: "info",
    eval: (s) => {
      const n = parseInt(s.kv.PASSMAX, 10);
      if (Number.isNaN(n)) return unk();
      return bool(n > 0 && n <= 365, `PASS_MAX_DAYS ${n}`);
    },
  },
  {
    id: "ww-etc",
    title: "Немає world-writable файлів у /etc",
    framework: "CIS 6.1",
    severity: "warning",
    eval: (s) => {
      const n = parseInt(s.kv.WWETC, 10);
      if (Number.isNaN(n)) return unk();
      return bool(n === 0, `${n} файлів`);
    },
  },
  {
    id: "single-root",
    title: "Єдиний обліковий запис з UID 0 (root)",
    framework: "CIS 5.4.2",
    severity: "critical",
    eval: (s) => {
      const n = parseInt(s.kv.ROOTUID, 10);
      if (Number.isNaN(n)) return unk();
      return bool(n === 0, n === 0 ? "лише root" : `${n} додаткових UID 0`);
    },
  },
];

// Ручні контролі (governance) — атестує аналітик, зберігається локально.
export const MANUAL_CONTROLS = [
  { id: "m-access-review", title: "Перегляд доступів проводиться щоквартально", framework: "ISO 27001 A.9", severity: "warning" },
  { id: "m-backups", title: "Резервні копії налаштовані й протестовані", framework: "ISO 27001 A.12.3", severity: "critical" },
  { id: "m-ir-plan", title: "План реагування на інциденти задокументовано", framework: "NIST IR-8", severity: "warning" },
  { id: "m-retention", title: "Політику зберігання даних визначено", framework: "GDPR Art.5", severity: "info" },
  { id: "m-mfa", title: "MFA для адмін-доступу увімкнено", framework: "NIST IA-2", severity: "critical" },
  { id: "m-vuln-scan", title: "Сканування вразливостей за розкладом", framework: "NIST RA-5", severity: "warning" },
  { id: "m-central-log", title: "Логування/моніторинг централізовано", framework: "NIST AU-6", severity: "info" },
  { id: "m-encryption", title: "Шифрування чутливих даних у спокої", framework: "ISO 27001 A.10", severity: "warning" },
];

function pass(evidence) {
  return { status: "pass", evidence };
}
function fail(evidence) {
  return { status: "fail", evidence };
}
function unk(evidence = "немає даних (потрібні права root?)") {
  return { status: "unknown", evidence };
}
function bool(ok, evidence) {
  return ok ? pass(evidence) : fail(evidence);
}

function parse(text) {
  const sshd = {};
  const kv = {};
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const m = line.trim().match(/^@@([A-Z]+)@@$/);
    if (m) {
      cur = m[1];
      continue;
    }
    if (cur === "SSHD") {
      const [k, v] = line.trim().toLowerCase().split(/\s+/);
      if (k) sshd[k] = v;
    } else if (cur === "KV") {
      const sp = line.indexOf(" ");
      if (sp > 0) kv[line.slice(0, sp)] = line.slice(sp + 1).trim();
    }
  }
  return { sshd, kv };
}

export async function runAuto(conn) {
  const { stdout } = await conn.exec(SCRIPT, { timeout: 45000 });
  const data = parse(stdout);
  return AUTO_CONTROLS.map((c) => {
    let r;
    try {
      r = c.eval(data);
    } catch {
      r = unk("помилка перевірки");
    }
    return { id: c.id, title: c.title, framework: c.framework, severity: c.severity, ...r };
  });
}
