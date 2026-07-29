// Аналіз вразливостей: config/exposure-скан хоста по SSH (у стилі легкого Lynis).
// Не CVE-сканер: оцінює конфігурацію, експозицію та стан патчів, дає ремедіацію.

const SCAN = `
LANG=C
echo "SSHD_ROOT $(sshd -T 2>/dev/null | awk '/^permitrootlogin/{print $2}')"
echo "SSHD_PASS $(sshd -T 2>/dev/null | awk '/^passwordauthentication/{print $2}')"
echo "SSHD_EMPTY $(sshd -T 2>/dev/null | awk '/^permitemptypasswords/{print $2}')"
echo "SSHD_MAXAUTH $(sshd -T 2>/dev/null | awk '/^maxauthtries/{print $2}')"
echo "UPD_ALL $( (timeout 12 apt-get -s upgrade 2>/dev/null | grep -c '^Inst') ; (timeout 12 dnf -q check-update 2>/dev/null | grep -Ec '^[a-zA-Z0-9]') ; echo 0 | sort -rn | head -1)"
echo "UPD_SEC $( (timeout 12 apt list --upgradable 2>/dev/null | grep -ic security) ; echo 0 | sort -rn | head -1)"
echo "REBOOT $([ -f /var/run/reboot-required ] && echo yes || echo no)"
echo "PUB_PORTS $(ss -tlnH 2>/dev/null | awk '{print $4}' | grep -E '^(0\\.0\\.0\\.0|\\*|\\[::\\]):' | wc -l)"
echo "WW_FILES $(timeout 8 find /etc /usr/local /home /srv /opt -xdev -type f -perm -0002 2>/dev/null | wc -l)"
echo "SUID $(timeout 8 find /usr/bin /usr/sbin /bin /sbin /usr/local -perm -4000 -type f 2>/dev/null | wc -l)"
echo "EMPTY_PASS $(awk -F: '(\\$2==""){c++} END{print c+0}' /etc/shadow 2>/dev/null)"
echo "UID0 $(awk -F: '(\\$3==0){print \\$1}' /etc/passwd 2>/dev/null | grep -vc '^root$')"
echo "PASSMAX $(awk '/^PASS_MAX_DAYS/{print \\$2}' /etc/login.defs 2>/dev/null)"
echo "FAIL2BAN $(systemctl is-active fail2ban 2>/dev/null || echo inactive)"
echo "FW $(ufw status 2>/dev/null | head -1 | grep -qi active && echo active || (systemctl is-active firewalld 2>/dev/null | grep -q '^active' && echo active || echo inactive))"
echo "PUB_DB $(docker ps --format '{{.Ports}}' 2>/dev/null | grep -oE '0\\.0\\.0\\.0:(5432|3306|6379|27017|9200|5984|8123|9042)' | wc -l)"
echo "OSREL $(. /etc/os-release 2>/dev/null; echo "\\$ID \\$VERSION_ID")"
`.trim();

const CATS = {
  patching: "Патчі",
  exposure: "Експозиція",
  ssh: "SSH",
  accounts: "Облікові записи",
  filesystem: "Файлова система",
  services: "Сервіси",
};

// vuln:true → знайдено вразливість. Кожен чек дає ремедіацію.
const CHECKS = [
  {
    id: "sec-updates",
    title: "Немає непоставлених security-оновлень",
    cat: "patching",
    severity: "high",
    eval: (d) => {
      const sec = num(d.UPD_SEC);
      const all = num(d.UPD_ALL);
      if (sec > 0) return vuln(`${sec} security-оновлень очікують (усього ${all})`, "sudo apt update && sudo apt upgrade");
      if (all > 50) return vuln(`${all} оновлень очікують`, "sudo apt upgrade — застарілі пакети підвищують ризик CVE");
      return ok(all ? `${all} звичайних оновлень` : "актуально");
    },
  },
  {
    id: "reboot",
    title: "Не потрібне перезавантаження після оновлень",
    cat: "patching",
    severity: "medium",
    eval: (d) => (d.REBOOT === "yes" ? vuln("Ядро/бібліотеки оновлено — потрібен reboot", "sudo reboot у вікно обслуговування") : ok("reboot не потрібен")),
  },
  {
    id: "ssh-root",
    title: "Root-логін по SSH заборонено",
    cat: "ssh",
    severity: "critical",
    eval: (d) => (d.SSHD_ROOT === "yes" ? vuln("PermitRootLogin yes", "У /etc/ssh/sshd_config: PermitRootLogin no; systemctl restart ssh") : ok(`PermitRootLogin ${d.SSHD_ROOT || "?"}`)),
  },
  {
    id: "ssh-pass",
    title: "Автентифікація паролем вимкнена",
    cat: "ssh",
    severity: "high",
    eval: (d) => (d.SSHD_PASS === "yes" ? vuln("PasswordAuthentication yes — вразливо до брутфорсу", "Перейди на ключі: PasswordAuthentication no") : ok("лише ключі")),
  },
  {
    id: "ssh-empty",
    title: "Порожні паролі заборонено",
    cat: "ssh",
    severity: "critical",
    eval: (d) => (d.SSHD_EMPTY === "yes" ? vuln("PermitEmptyPasswords yes", "PermitEmptyPasswords no") : ok("заборонено")),
  },
  {
    id: "ssh-maxauth",
    title: "MaxAuthTries обмежено (≤4)",
    cat: "ssh",
    severity: "low",
    eval: (d) => {
      const n = num(d.SSHD_MAXAUTH);
      return n > 4 ? vuln(`MaxAuthTries ${n}`, "MaxAuthTries 4") : ok(`MaxAuthTries ${n || "?"}`);
    },
  },
  {
    id: "firewall",
    title: "Firewall активний",
    cat: "exposure",
    severity: "high",
    eval: (d) => (d.FW !== "active" ? vuln("Firewall неактивний — усі порти відкриті", "sudo ufw enable та обмеж вхідні") : ok("активний")),
  },
  {
    id: "fail2ban",
    title: "Захист від брутфорсу (fail2ban)",
    cat: "exposure",
    severity: "medium",
    eval: (d) => (d.FAIL2BAN !== "active" ? vuln("fail2ban неактивний", "sudo apt install fail2ban && systemctl enable --now fail2ban") : ok("активний")),
  },
  {
    id: "pub-ports",
    title: "Мало публічно відкритих портів",
    cat: "exposure",
    severity: "medium",
    eval: (d) => {
      const n = num(d.PUB_PORTS);
      return n > 5 ? vuln(`${n} портів слухають 0.0.0.0`, "Прив'яжи сервіси до 127.0.0.1 або закрий фаєрволом") : ok(`${n} публічних портів`);
    },
  },
  {
    id: "pub-db",
    title: "БД не виставлені в інтернет",
    cat: "exposure",
    severity: "critical",
    eval: (d) => {
      const n = num(d.PUB_DB);
      return n > 0 ? vuln(`${n} контейнерів БД публікують порт на 0.0.0.0`, "Прибери публікацію: слухай 127.0.0.1, доступ через SSH-тунель") : ok("БД не виставлені");
    },
  },
  {
    id: "empty-pass",
    title: "Немає акаунтів з порожнім паролем",
    cat: "accounts",
    severity: "critical",
    eval: (d) => {
      const n = num(d.EMPTY_PASS);
      if (d.EMPTY_PASS === undefined || d.EMPTY_PASS === "") return unk();
      return n > 0 ? vuln(`${n} акаунтів без пароля`, "passwd -l <user> або встанови пароль") : ok("немає");
    },
  },
  {
    id: "uid0",
    title: "Єдиний акаунт з UID 0",
    cat: "accounts",
    severity: "high",
    eval: (d) => {
      const n = num(d.UID0);
      return n > 0 ? vuln(`${n} додаткових акаунтів з UID 0`, "Прибери зайві UID 0 — це прихований root") : ok("лише root");
    },
  },
  {
    id: "passmax",
    title: "Політика віку пароля (≤365)",
    cat: "accounts",
    severity: "low",
    eval: (d) => {
      const n = num(d.PASSMAX);
      if (!d.PASSMAX) return unk();
      return n > 365 || n <= 0 ? vuln(`PASS_MAX_DAYS ${n}`, "PASS_MAX_DAYS 90 у /etc/login.defs") : ok(`${n} днів`);
    },
  },
  {
    id: "ww-files",
    title: "Немає world-writable файлів",
    cat: "filesystem",
    severity: "medium",
    eval: (d) => {
      const n = num(d.WW_FILES);
      return n > 0 ? vuln(`${n} world-writable файлів`, "chmod o-w на знайдені файли") : ok("немає");
    },
  },
  {
    id: "suid",
    title: "Кількість SUID-бінарників у нормі",
    cat: "filesystem",
    severity: "low",
    eval: (d) => {
      const n = num(d.SUID);
      return n > 30 ? vuln(`${n} SUID-бінарників (багато)`, "Перевір список: find / -perm -4000; прибери зайві") : ok(`${n} SUID`);
    },
  },
];

function num(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}
function vuln(detail, remediation) {
  return { vuln: true, detail, remediation };
}
function ok(detail) {
  return { vuln: false, detail, remediation: "" };
}
function unk() {
  return { vuln: false, unknown: true, detail: "немає даних (потрібні права root?)", remediation: "" };
}

function parseKV(text) {
  const kv = {};
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const sp = line.indexOf(" ");
    if (sp > 0) kv[line.slice(0, sp)] = line.slice(sp + 1).trim();
  }
  return kv;
}

const SEV_WEIGHT = { critical: 25, high: 15, medium: 8, low: 3, info: 1 };

export async function scanVulns(conn) {
  const { stdout } = await conn.exec(SCAN, { timeout: 45000 });
  const d = parseKV(stdout);

  const findings = CHECKS.map((c) => {
    let r;
    try {
      r = c.eval(d);
    } catch {
      r = unk();
    }
    return {
      id: c.id,
      title: c.title,
      category: c.cat,
      categoryLabel: CATS[c.cat],
      severity: c.severity,
      status: r.unknown ? "unknown" : r.vuln ? "vuln" : "ok",
      detail: r.detail,
      remediation: r.remediation,
    };
  });

  const vulns = findings.filter((f) => f.status === "vuln");
  const evaluable = findings.filter((f) => f.status !== "unknown");
  const passed = evaluable.filter((f) => f.status === "ok").length;
  const secScore = evaluable.length ? Math.round((passed / evaluable.length) * 100) : 0;

  let riskPoints = 0;
  for (const v of vulns) riskPoints += SEV_WEIGHT[v.severity] || 1;
  const risk = Math.min(100, riskPoints);

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const v of vulns) bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;

  const categories = Object.keys(CATS).map((cat) => {
    const inCat = findings.filter((f) => f.category === cat && f.status !== "unknown");
    const okCount = inCat.filter((f) => f.status === "ok").length;
    return { cat, label: CATS[cat], total: inCat.length, passed: okCount, pct: inCat.length ? Math.round((okCount / inCat.length) * 100) : 100 };
  });

  return {
    secScore,
    risk,
    grade: risk >= 60 ? "critical" : risk >= 35 ? "warning" : risk >= 15 ? "info" : "ok",
    findings,
    vulnCount: vulns.length,
    bySeverity,
    categories,
    os: d.OSREL || "",
    at: Date.now(),
  };
}
