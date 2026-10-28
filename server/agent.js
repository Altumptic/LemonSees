// Опційний агент LemonSees: легкий POSIX-sh колектор (лише читання, без root, без демонів).
// Режими: pull — двигун забирає state.jsonl по SSH; push — агент сам шле JSON на двигун (HTTPS + токен).
// Агентлес-режим лишається основним: агент потрібен для безперервної історії, коли двигун офлайн,
// або для хостів, до яких двигун не має постійного SSH.
import crypto from "node:crypto";

export const AGENT_VERSION = "1.0.0";
const DIR = "$HOME/.lemonsees-agent";

const SCRIPT = String.raw`#!/bin/sh
# LemonSees agent — by Altumptic (https://altumptic.com). Read-only telemetry collector.
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/agent.conf"
OUT="$DIR/state.jsonl"
cpu_snap() { awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8, $5+$6}' /proc/stat; }
collect() {
  a=$(cpu_snap); sleep 1; b=$(cpu_snap)
  cpu=$(echo "$a $b" | awk '{t=$3-$1; i=$4-$2; if (t>0) printf "%.1f", (t-i)*100/t; else print 0}')
  mt=$(awk '/MemTotal/{print $2}' /proc/meminfo); ma=$(awk '/MemAvailable/{print $2}' /proc/meminfo)
  mem=$(( (mt-ma)*100/mt ))
  disk=$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')
  load=$(cut -d' ' -f1 /proc/loadavg)
  fails=$( (journalctl _COMM=sshd --since "-$((INTERVAL+5))s" --no-pager 2>/dev/null || tail -n 500 /var/log/auth.log 2>/dev/null) | grep -c "Failed password")
  listen=$(ss -ltnH 2>/dev/null | wc -l | tr -d ' ')
  procs=$(ls -d /proc/[0-9]* 2>/dev/null | wc -l | tr -d ' ')
  fim=$(cat /etc/passwd /etc/group /etc/ssh/sshd_config /etc/crontab "$HOME/.ssh/authorized_keys" 2>/dev/null | sha256sum | cut -c1-16)
  line="{\"at\":$(date +%s),\"cpu\":$cpu,\"mem\":$mem,\"disk\":$disk,\"load\":$load,\"fails\":$fails,\"listen\":$listen,\"procs\":$procs,\"fim\":\"$fim\",\"host\":\"$(hostname)\",\"v\":\"$VERSION\"}"
  echo "$line" >> "$OUT"
  tail -n 1440 "$OUT" > "$OUT.tmp" 2>/dev/null && mv "$OUT.tmp" "$OUT"
  if [ -n "$PUSH_URL" ]; then
    curl -fsS -m 10 $CURL_OPTS -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$line" "$PUSH_URL" >/dev/null 2>&1 || true
  fi
}
# Cron запускає щохвилини; за хвилину збираємо 60/INTERVAL зразків
n=$((60 / INTERVAL)); [ "$n" -lt 1 ] && n=1
i=0
while [ "$i" -lt "$n" ]; do
  collect
  i=$((i+1))
  [ "$i" -lt "$n" ] && sleep $((INTERVAL - 1))
done
`;

export const newAgentToken = () => crypto.randomBytes(24).toString("hex");

function conf({ interval, pushUrl, token, insecure }) {
  return [
    `VERSION="${AGENT_VERSION}"`,
    `INTERVAL=${Math.max(10, Math.min(60, interval | 0 || 30))}`,
    `PUSH_URL="${pushUrl || ""}"`,
    `TOKEN="${token}"`,
    `CURL_OPTS="${insecure ? "-k" : ""}"`,
    "",
  ].join("\n");
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

/** Shell-команда встановлення (той самий текст — і для SSH-розгортання, і для ручного запуску). */
export function installCommand(opts) {
  return [
    `set -e`,
    `mkdir -p ${DIR} && chmod 700 ${DIR}`,
    `echo '${b64(SCRIPT)}' | base64 -d > ${DIR}/agent.sh`,
    `echo '${b64(conf(opts))}' | base64 -d > ${DIR}/agent.conf`,
    `chmod 700 ${DIR}/agent.sh && chmod 600 ${DIR}/agent.conf`,
    `(crontab -l 2>/dev/null | grep -v lemonsees-agent; echo "* * * * * ${DIR}/agent.sh >/dev/null 2>&1 # lemonsees-agent") | crontab -`,
    `sh ${DIR}/agent.sh >/dev/null 2>&1 &`,
    `echo "lemonsees-agent ${AGENT_VERSION} installed"`,
  ].join("\n");
}

export const uninstallCommand = () =>
  `(crontab -l 2>/dev/null | grep -v lemonsees-agent) | crontab - ; rm -rf ${DIR} ; echo "lemonsees-agent removed"`;

export const statusCommand = () =>
  `if [ -f ${DIR}/agent.conf ]; then . ${DIR}/agent.conf; echo "VERSION=$VERSION"; echo "INTERVAL=$INTERVAL"; echo "PUSH=$PUSH_URL"; crontab -l 2>/dev/null | grep -q lemonsees-agent && echo CRON=1; echo "@@DATA@@"; tail -n 120 ${DIR}/state.jsonl 2>/dev/null; else echo NONE; fi`;

/** Розбір виводу statusCommand. */
export function parseStatus(stdout) {
  if (stdout.trim() === "NONE") return { installed: false, samples: [] };
  const [head, data = ""] = stdout.split("@@DATA@@");
  const kv = Object.fromEntries(head.split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  const samples = data
    .split("\n")
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .map((s) => ({ ...s, at: s.at * 1000 }));
  return { installed: true, version: kv.VERSION, interval: +kv.INTERVAL || 30, push: kv.PUSH || "", cron: kv.CRON === "1", samples };
}

export function sanitizeSample(s) {
  const n = (v, max = 1e9) => Math.max(0, Math.min(max, Number(v) || 0));
  return { at: n(s.at, 1e13) * (s.at < 1e12 ? 1000 : 1), cpu: n(s.cpu, 100), mem: n(s.mem, 100), disk: n(s.disk, 100), load: n(s.load, 1e4), fails: n(s.fails), listen: n(s.listen, 1e5), procs: n(s.procs, 1e6), fim: String(s.fim || "").slice(0, 32), host: String(s.host || "").slice(0, 120), v: String(s.v || "").slice(0, 16) };
}
