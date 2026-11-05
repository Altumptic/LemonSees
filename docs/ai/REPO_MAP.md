# Repo map (generated — do not edit)

Regenerate: `npm run docs:map`. CI fails if this file is stale. For meaning and invariants read [AGENTS.md](../../AGENTS.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).

| File | What it is |
|---|---|
| `.github/workflows/ci.yml` |  |
| `.github/workflows/codeql.yml` |  |
| `.github/workflows/datadog-synthetics.yml` | This workflow will trigger Datadog Synthetic tests within your Datadog organisation |
| `.github/workflows/release.yml` | Тег v* → портативні збірки Windows/Linux + веб-архів, а також докази автентичності (Altumptic PSB §3): |
| `AGENTS.md` | AGENTS.md — LemonSees (read this first, then stop exploring) |
| `CHANGELOG.md` | Changelog |
| `CLAUDE.md` |  |
| `CONTRIBUTORS.md` | Contributors |
| `DESIGN.md` | LemonSees by Altumptic — Design Spec |
| `README.md` | LemonSees |
| `SECURITY.md` | Security Policy |
| `bench/core.bench.mjs` | Бенчмарк гарячих шляхів. Запуск: npm run bench  (потрібен зібраний .wasm: npm run build:core) |
| `core/fuzz/Cargo.toml` |  |
| `core/lemonsees-core/Cargo.toml` |  |
| `core/lemonsees-core/src/auth.rs` | Аналіз журналів SSH-автентифікації (journald / auth.log / secure). |
| `core/lemonsees-core/src/fim.rs` | Контроль цілісності файлів: порівняння знімка з базовою лінією. |
| `core/lemonsees-core/src/hash.rs` | HashMap із сидованим хешером. |
| `core/lemonsees-core/src/ip.rs` | Розбір та класифікація IP-адрес у рядках журналів. |
| `core/lemonsees-core/src/lib.rs` | LemonSees core — гарячі шляхи двигуна, написані на безпечному Rust. |
| `core/lemonsees-core/src/rules.rs` | Рушій правил виявлення. |
| `core/lemonsees-core/src/time.rs` | Розбір часових міток рядків журналів без зовнішніх залежностей. |
| `core/lemonsees-wasm/Cargo.toml` |  |
| `core/lemonsees-wasm/src/lib.rs` | WebAssembly-обгортка над `lemonsees-core`. |
| `docs/ARCHITECTURE.md` | Architecture |
| `docs/PERFORMANCE.md` | Performance (measured, reproducible) |
| `docs/ROADMAP.md` | Roadmap |
| `docs/TESTING.md` | Help us test LemonSees (beta) |
| `docs/security/RELEASE-NOTES-FOOTER.md` | ## Verify this release |
| `docs/security/SECURITY-NOTES.md` | LemonSees — Security design notes |
| `docs/security/THREAT-MODEL.md` | LemonSees — Threat model (short) |
| `docs/security/VERIFY.md` | Verify a LemonSees release |
| `electron/main.js` | LemonSees by Altumptic — десктопна SOC-оболонка для Windows і Linux. |
| `package.json` |  |
| `scripts/build-core.mjs` | Збірка Rust-ядра у WebAssembly → server/core/lemonsees_core.wasm (+ .sha256). |
| `scripts/gen-repo-map.mjs` | Генерує docs/ai/REPO_MAP.md: файл → однорядковий опис (перший коментар/doc-рядок) + розмір. |
| `scripts/promo-overlay.js` | Оверлей «режисера» для промо-ролику LemonSees by Altumptic. |
| `scripts/promo.cjs` | LemonSees by Altumptic — промо-ролик із ЖИВОГО застосунку (демо-режим), без монтажу картинок. |
| `scripts/render.cjs` | LemonSees by Altumptic — генератор графіки через офскрін-рендер Electron. |
| `scripts/world-dots.mjs` | Генерує src/lib/worldDots.ts — крапкову маску суші (equirectangular) для карти атак. |
| `server/agent.js` | Опційний агент LemonSees: легкий POSIX-sh колектор (лише читання, без root, без демонів). |
| `server/auth.js` | Доступ у веб-режимі. Якщо задано LEMONSEES_TOKEN — усі /api та /ws вимагають сесії. |
| `server/collector.js` | Збирач метрик: один exec на цикл. |
| `server/compliance.js` | Комплаєнс: автоматичні контролі (CIS-подібні) перевіряються по SSH, |
| `server/config.js` | Зберігання списку хостів у config/hosts.json поряд із програмою. |
| `server/core/index.js` | Фасад Rust-ядра (WebAssembly). Усі гарячі шляхи (аналіз auth-журналів, правила, FIM-diff) викликаються звідси. |
| `server/db.js` | Робота з базами даних через SSH-тунель (local port forwarding). |
| `server/edr.js` | EDR: телеметрія кінцевої точки по SSH — процеси та механізми персистентності. |
| `server/engines.js` | Реєстр рушіїв БД. family визначає, який адаптер використовує сервер: |
| `server/extensions.js` | Розширення двигуна LemonSees 3.1: мережа/приватність, інтеграції (у т.ч. Wazuh), агенти, власні правила. |
| `server/fim.js` | FIM — контроль цілісності критичних файлів по SSH (як syscheck у Wazuh, але без агента). |
| `server/geoip.js` | Гео-IP збагачення адрес атакуючих — OPT-IN (PSB P2 «least data»). |
| `server/guard.js` | Захист периметра двигуна (PSB §5.1, §5.3): |
| `server/index.js` | LemonSees by Altumptic — двигун SOC-платформи. |
| `server/integrations.js` | Інтеграції LemonSees — повністю опційні: без них продукт працює автономно. |
| `server/netops.js` | NDR та утиліти аналітика: активні зʼєднання, мережеві інструменти (dig/whois/ping/…), |
| `server/netproxy.js` | Мережевий шар приватності: SOCKS5 / HTTP CONNECT проксі (VPN-шлюз, Tor, корпоративний проксі) |
| `server/security.js` | Збір постури безпеки хоста по SSH (агентлес). Один exec на запит. |
| `server/ssh.js` | SSH-пул: одне тривале з'єднання на хост (multiplexing), |
| `server/threats.js` | Threat intelligence: аналіз auth.log / journald на предмет SSH-атак. |
| `server/tls.js` | HTTPS для веб-режиму: власний сертифікат (LEMONSEES_TLS_CERT / LEMONSEES_TLS_KEY) |
| `server/uptime.js` | Uptime-моніторинг сайтів/ендпоінтів. HTTP-перевірки з двигуна (fetch), |
| `server/vault.js` | Сховище секретів: AES-256-GCM для паролів, passphrase, токенів інтеграцій у конфігу. |
| `server/vulns.js` | Аналіз вразливостей: config/exposure-скан хоста по SSH (у стилі легкого Lynis). |
| `src/App.tsx` |  |
| `src/components/Brand.tsx` | Знак LemonSees (by Altumptic): лимон-«око» на глиняному тлі. |
| `src/components/CommandPalette.tsx` |  |
| `src/components/Topbar.tsx` | Верхня панель: клікабельні хлібні крихти з меню, перемикач хоста, тривоги, |
| `src/components/charts.tsx` | Легка SVG-бібліотека графіків без залежностей: лінійні, стовпчикові з накопиченням, |
| `src/components/charts2.tsx` | Розширені графіки аналітики: Sankey, Treemap, воронка, календарна теплова карта, шкала. |
| `src/components/ui.tsx` | -------- Каркас -------- |
| `src/lib/analytics.ts` | SOC-аналітика поверх інцидентів і аудиту: тренди, розподіли, MITRE ATT&CK, MTTR. |
| `src/lib/api.ts` |  |
| `src/lib/demo.ts` | Демо-режим: повністю локальний «двигун» з правдоподібними даними. |
| `src/lib/demoExt.ts` | Демо-дані для модулів 3.1: мережа/приватність, інтеграції, Wazuh, правила, агенти. |
| `src/lib/engines.ts` | Клієнтський реєстр рушіїв БД (дзеркало server/engines.js). |
| `src/lib/i18n.ts` | Легка i18n: ключ — український рядок, словники — переклади. |
| `src/lib/intent.ts` | Наміри через хеш: #/infra/hosts?new — сторінка відкриває форму створення. |
| `src/lib/settings.ts` |  |
| `src/lib/types.ts` |  |
| `src/lib/worldDots.ts` | Згенеровано scripts/world-dots.mjs — не редагувати вручну. |
| `src/main.tsx` |  |
| `src/nav.ts` |  |
| `src/pages/Agents.tsx` |  |
| `src/pages/Analytics.tsx` |  |
| `src/pages/Audit.tsx` |  |
| `src/pages/Compliance.tsx` |  |
| `src/pages/Connections.tsx` |  |
| `src/pages/Containers.tsx` |  |
| `src/pages/Dashboard.tsx` |  |
| `src/pages/Database.tsx` |  |
| `src/pages/Endpoints.tsx` |  |
| `src/pages/Events.tsx` |  |
| `src/pages/Fim.tsx` |  |
| `src/pages/Hosts.tsx` |  |
| `src/pages/Incidents.tsx` |  |
| `src/pages/Integrations.tsx` |  |
| `src/pages/Investigate.tsx` |  |
| `src/pages/Metrics.tsx` |  |
| `src/pages/Mitre.tsx` |  |
| `src/pages/Networks.tsx` |  |
| `src/pages/Persistence.tsx` |  |
| `src/pages/Playbooks.tsx` |  |
| `src/pages/Privacy.tsx` |  |
| `src/pages/Processes.tsx` |  |
| `src/pages/Reports.tsx` |  |
| `src/pages/Rules.tsx` |  |
| `src/pages/Security.tsx` |  |
| `src/pages/Settings.tsx` |  |
| `src/pages/Status.tsx` |  |
| `src/pages/Terminal.tsx` |  |
| `src/pages/Threats.tsx` |  |
| `src/pages/Toolkit.tsx` |  |
| `src/pages/Traffic.tsx` | Історія throughput на клієнті для спарклайнів |
| `src/pages/Uptime.tsx` |  |
| `src/pages/Volumes.tsx` |  |
| `src/pages/Vulnerabilities.tsx` |  |
| `src/pages/Wazuh.tsx` |  |
| `src/styles.css` | Self-hosted variable fonts — жодних мережевих запитів, миттєвий старт в Electron |
| `test/auth.test.js` | Авторизація веб-режиму: без сесії — 401, неправильний токен — 401, обмеження спроб — 429. |
| `test/core.test.js` | Тести Rust-ядра (WASM) та його інтеграції. Якщо .wasm не зібрано (npm run build:core) — тести ядра пропускаються, |
| `test/security.test.js` | Негативні тести безпеки (PSB §7): fail-closed, цілісність шифрування, Host/Origin, розбір недовіреного вводу. |
| `test/tls.test.js` | HTTPS-режим: самопідписаний сертифікат має бути SHA-256 / RSA-2048, з SAN і чесним терміном дії (PSB §2.1). |
