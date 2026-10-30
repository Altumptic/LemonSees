// Оверлей «режисера» для промо-ролику LemonSees by Altumptic.
// Інжектиться в живий застосунок: заставки, підписи, курсор, кліки й набір тексту поверх справжнього UI.
(() => {
  if (window.__promo) return;
  const css = `
  :root{--pr-s:${window.__SLOW || 1}}
  #pr-card{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:#f4f2ea;opacity:0;pointer-events:none;transition:opacity calc(900ms * var(--pr-s)) cubic-bezier(.2,.7,.2,1)}
  #pr-card.dark{background:#1a1917}
  #pr-card.on{opacity:1}
  #pr-card .glow{position:absolute;inset:0;background:radial-gradient(90% 70% at 50% 0%,rgba(193,95,60,.07),transparent 65%)}
  html::-webkit-scrollbar,*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
  html{scrollbar-width:none!important}
  body.pr-carded #pr-cur{opacity:0}
  #pr-cur{transition:transform calc(900ms * var(--pr-s)) cubic-bezier(.45,.05,.2,1),opacity calc(500ms * var(--pr-s)) ease}
  #pr-card .wrap{position:relative;text-align:center;max-width:1300px;padding:0 80px}
  #pr-card .l{opacity:0;transform:translateY(18px);transition:opacity calc(1100ms * var(--pr-s)) ease,transform calc(1100ms * var(--pr-s)) cubic-bezier(.2,.7,.2,1)}
  #pr-card .l.in{opacity:1;transform:none}
  #pr-card .serif{font-family:"Source Serif 4 Variable",Georgia,serif;font-weight:500;letter-spacing:-.02em;color:#141413;line-height:1.08}
  #pr-card.dark .serif{color:#faf9f5}
  #pr-card .sans{font-family:"DM Sans Variable",system-ui,sans-serif;color:#6b6963}
  #pr-card.dark .sans{color:#a6a399}
  #pr-card .clay{color:#c15f3c}
  #pr-cap{position:fixed;left:64px;bottom:56px;z-index:99998;max-width:900px;padding:22px 30px;border-radius:22px;background:rgba(255,254,251,.92);backdrop-filter:blur(10px);box-shadow:0 30px 60px -25px rgba(31,30,29,.35),0 0 0 1px #e2dfd3;opacity:0;transform:translateY(16px);transition:opacity calc(700ms * var(--pr-s)) ease,transform calc(700ms * var(--pr-s)) cubic-bezier(.2,.7,.2,1);pointer-events:none}
  #pr-cap.on{opacity:1;transform:none}
  #pr-cap.dark{background:rgba(38,38,36,.92);box-shadow:0 30px 60px -25px rgba(0,0,0,.7),0 0 0 1px #46443f}
  #pr-cap .k{font:600 17px "DM Sans Variable",sans-serif;color:#c15f3c;letter-spacing:.01em;margin-bottom:6px}
  #pr-cap .t{font:500 38px/1.15 "Source Serif 4 Variable",Georgia,serif;color:#141413;letter-spacing:-.015em}
  #pr-cap.dark .t{color:#faf9f5}
  #pr-cur{position:fixed;left:0;top:0;z-index:100000;width:30px;height:30px;pointer-events:none;transition:transform calc(900ms * var(--pr-s)) cubic-bezier(.45,.05,.2,1);filter:drop-shadow(0 3px 6px rgba(0,0,0,.25))}
  #pr-ring{position:fixed;z-index:99999;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #c15f3c;opacity:0;pointer-events:none}
  #pr-ring.go{animation:prRing calc(650ms * var(--pr-s)) ease-out}
  @keyframes prRing{from{opacity:.9;transform:scale(.3)}to{opacity:0;transform:scale(1.6)}}
  .pr-mark{width:150px;height:150px;margin:0 auto 34px}
  .pr-mark .lid{transform-origin:32px 32px;animation:prBlink calc(4.2s * var(--pr-s)) infinite}
  .pr-mark .pupil{animation:prLook calc(4.2s * var(--pr-s)) infinite cubic-bezier(.45,.05,.2,1)}
  @keyframes prBlink{0%,46%,54%,100%{transform:rotate(-24deg) scaleY(1)}50%{transform:rotate(-24deg) scaleY(.08)}}
  @keyframes prLook{0%,20%{transform:translate(0,0)}30%,45%{transform:translate(3.2px,-1.2px)}60%,75%{transform:translate(-3px,1px)}90%,100%{transform:translate(0,0)}}
  .pr-mark.pop{animation:prPop calc(1200ms * var(--pr-s)) cubic-bezier(.2,.9,.2,1.15) both}
  @keyframes prPop{from{opacity:0;transform:scale(.6) rotate(-8deg)}to{opacity:1;transform:none}}
  `;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  const card = Object.assign(document.createElement("div"), { id: "pr-card" });
  const cap = Object.assign(document.createElement("div"), { id: "pr-cap" });
  const cur = Object.assign(document.createElement("div"), { id: "pr-cur" });
  const ring = Object.assign(document.createElement("div"), { id: "pr-ring" });
  cur.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2.5l15 8.4-6.6 1.7-3 6.2z" fill="#1f1e1d" stroke="#fffefb" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  document.body.append(card, cap, ring, cur);

  const MARK = `<svg class="pr-mark pop" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#C15F3C"/>
    <g class="lid" style="transform:rotate(-24deg)"><path d="M8 32c1.6-.9 3.2-2 4.6-3.2C15 21.4 22.8 17 32 17s17 4.4 19.4 11.8c1.4 1.2 3 2.3 4.6 3.2-1.6.9-3.2 2-4.6 3.2C49 42.6 41.2 47 32 47s-17-4.4-19.4-11.8C11.2 34 9.6 32.9 8 32Z" fill="#FAF9F5"/>
    <g class="pupil"><circle cx="32" cy="32" r="9" fill="#1F1E1D"/><circle cx="32" cy="32" r="4.2" fill="#C15F3C"/><circle cx="35.2" cy="28.8" r="2.1" fill="#FAF9F5"/></g></g>
    <path d="M46 13.5c3.6-1.6 7.4-1 9.5.6-1.5 3-5.3 5-9.7 4.4-.6-1.9-.5-3.6.2-5Z" fill="#FAF9F5" opacity=".92"/></svg>`;

  const SLOW = window.__SLOW || 1; // CSS-анімації сповільнені через CDP; JS-паузи — тут
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SLOW));
  let cx = 1500, cy = 900;
  cur.style.transform = `translate(${cx}px,${cy}px)`;

  function hoverAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    for (const type of ["pointerover", "mouseover", "pointermove", "mousemove"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
    }
    return el;
  }

  window.__promo = {
    MARK,
    async card(lines, { dark = false, hold = 0 } = {}) {
      card.className = dark ? "dark" : "";
      card.innerHTML = `<div class="glow"></div><div class="wrap">${lines.map((l) => `<div class="l">${l}</div>`).join("")}</div>`;
      await sleep(30);
      card.classList.add("on");
      document.body.classList.add("pr-carded");
      const ls = [...card.querySelectorAll(".l")];
      for (const l of ls) {
        await sleep(l.dataset.delay ? +l.dataset.delay : 650);
        l.classList.add("in");
      }
      await sleep(hold);
    },
    async addLine(html, delay = 0) {
      const w = card.querySelector(".wrap");
      const d = document.createElement("div");
      d.className = "l";
      d.innerHTML = html;
      w.appendChild(d);
      await sleep(30 + delay);
      d.classList.add("in");
    },
    async hideCard() {
      card.classList.remove("on");
      document.body.classList.remove("pr-carded");
      await sleep(950);
    },
    async caption(kicker, text, dark = false) {
      cap.classList.remove("on");
      await sleep(cap.innerHTML ? 450 : 0);
      cap.className = dark ? "dark" : "";
      cap.innerHTML = `<div class="k">${kicker}</div><div class="t">${text}</div>`;
      await sleep(30);
      cap.classList.add("on");
    },
    async hideCaption() {
      cap.classList.remove("on");
      await sleep(700);
    },
    async move(x, y, ms = 900) {
      // траєкторія з кількох кроків, щоб графіки отримували mousemove по дорозі
      cur.style.transition = `transform ${ms * SLOW}ms cubic-bezier(.45,.05,.2,1), opacity ${500 * SLOW}ms ease`;
      cur.style.transform = `translate(${x}px,${y}px)`;
      const steps = Math.max(4, Math.round(ms / 60));
      const sx = cx, sy = cy;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        hoverAt(sx + (x - sx) * e, sy + (y - sy) * e);
        await sleep(ms / steps);
      }
      cx = x;
      cy = y;
    },
    async moveTo(sel, { text, dx = 0, dy = 0, ms = 900 } = {}) {
      const el = findEl(sel, text);
      if (!el) return false;
      el.scrollIntoView?.({ block: "nearest" });
      const r = el.getBoundingClientRect();
      await this.move(r.left + r.width / 2 + dx, r.top + r.height / 2 + dy, ms);
      return true;
    },
    async click(sel, opts = {}) {
      if (sel && !(await this.moveTo(sel, opts))) return false;
      ring.style.left = `${cx}px`;
      ring.style.top = `${cy}px`;
      ring.classList.remove("go");
      void ring.offsetWidth;
      ring.classList.add("go");
      const el = document.elementFromPoint(cx, cy);
      el?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: cx, clientY: cy }));
      el?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: cx, clientY: cy }));
      el?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
      await sleep(250);
      return true;
    },
    key(key, mods = {}) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...mods }));
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...mods }));
    },
    async type(text, delay = 90) {
      const el = document.activeElement;
      if (!el || !("value" in el)) return false;
      const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
      for (const ch of text) {
        setter.call(el, el.value + ch);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(delay + Math.random() * 50);
      }
      return true;
    },
    async scroll(y, ms = 1600) {
      const start = window.scrollY;
      const t0 = performance.now();
      return new Promise((res) => {
        const step = (now) => {
          const t = Math.min(1, (now - t0) / (ms * SLOW));
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          window.scrollTo(0, start + (y - start) * e);
          if (t < 1) requestAnimationFrame(step);
          else res();
        };
        requestAnimationFrame(step);
      });
    },
  };

  function findEl(sel, text) {
    const els = [...document.querySelectorAll(sel || "*")].filter((e) => e.offsetParent !== null || e.getClientRects().length);
    if (!text) return els[0];
    return els.find((e) => e.textContent?.trim() === text) || els.find((e) => e.textContent?.includes(text));
  }
})();
