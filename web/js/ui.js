/* Компоненты интерфейса: DOM, иконки, панели, тосты, переключатели, лента весов. */
(function () {
  const DA = (window.DA = window.DA || {});

  /* ---------- DOM ---------- */
  DA.h = function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  };

  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    upload: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    escalate: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
    scale: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 7a4 4 0 0 0 6 0z"/><path d="m19 7-3 7a4 4 0 0 0 6 0z"/>',
    list: '<path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="m3 6 1 1 2-2"/><path d="m3 12 1 1 2-2"/><path d="m3 18 1 1 2-2"/>',
    chart: '<path d="M3 3v18h18"/><path d="M8 17V11"/><path d="M13 17V7"/><path d="M18 17v-4"/>',
    filter: '<path d="M3 5h18"/><path d="M6 12h12"/><path d="M10 19h4"/>',
    menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
  };
  DA.icon = function (name, size) {
    const span = document.createElement("span");
    span.style.display = "inline-flex";
    span.innerHTML = `<svg class="da-icon" viewBox="0 0 24 24" aria-hidden="true"${size ? ` style="width:${size}px;height:${size}px"` : ""}>${ICONS[name] || ""}</svg>`;
    return span.firstChild;
  };

  /* ---------- Слои ---------- */
  DA.toast = function (text, anchor) {
    const t = DA.h("div", { class: "da-toast", role: "status" }, text);
    document.body.append(t);
    const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2 - 150, bottom: innerHeight - 80, top: innerHeight - 80 };
    const w = Math.min(360, innerWidth - 32);
    t.style.maxWidth = w + "px";
    t.style.left = Math.max(16, Math.min(r.left, innerWidth - w - 16)) + "px";
    const height = t.offsetHeight, below = r.bottom + 8 + height < innerHeight - 16;
    t.style.top = Math.max(16, Math.min(below ? r.bottom + 8 : r.top - height - 8, innerHeight - height - 16)) + "px";
    const remove = () => { t.remove(); window.removeEventListener("hashchange", remove); window.removeEventListener("resize", remove); };
    window.addEventListener("hashchange", remove, { once: true });
    window.addEventListener("resize", remove, { once: true });
    setTimeout(() => { t.style.transition = "opacity 200ms"; t.style.opacity = "0"; setTimeout(remove, 220); }, 3600);
  };

  DA.drawer = function ({ title, subtitle, body, foot, onClose }) {
    const prevFocus = document.activeElement;
    const scrim = DA.h("div", { class: "da-scrim" });
    const panel = DA.h("aside", { class: "da-drawer", role: "dialog", "aria-modal": "true", "aria-label": title },
      DA.h("div", { class: "da-drawer-head" },
        DA.h("div", {}, DA.h("h2", {}, title), subtitle ? DA.h("p", {}, subtitle) : null),
        DA.h("button", { class: "da-close", "aria-label": "Закрыть", onclick: () => close() }, DA.icon("x"))),
      DA.h("div", { class: "da-drawer-body" }, body),
      foot ? DA.h("div", { class: "da-drawer-foot" }, foot) : null);
    function key(e) {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const f = [...panel.querySelectorAll("button, textarea, input, [tabindex]")].filter((x) => !x.disabled);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }
    function close() {
      scrim.classList.remove("is-on"); panel.classList.remove("is-on");
      document.removeEventListener("keydown", key);
      setTimeout(() => { scrim.remove(); panel.remove(); }, 300);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      onClose && onClose();
    }
    scrim.addEventListener("click", close);
    document.addEventListener("keydown", key);
    document.body.append(scrim, panel);
    requestAnimationFrame(() => { scrim.classList.add("is-on"); panel.classList.add("is-on"); });
    setTimeout(() => { const f = panel.querySelector("textarea, .da-seg button, .da-btn"); f && f.focus(); }, 320);
    return { close, panel };
  };

  /* Сегментированный переключатель. options: [{ value, label }] */
  DA.segmented = function (options, value, onChange, label) {
    const thumb = DA.h("span", { class: "da-seg-thumb", "aria-hidden": "true" });
    const root = DA.h("div", { class: "da-seg", role: "group", "aria-label": label || "" }, thumb);
    const buttons = options.map((o) => {
      const b = DA.h("button", { type: "button", "aria-pressed": String(o.value === value) }, o.label);
      b.addEventListener("click", () => set(o.value, true));
      root.append(b);
      return b;
    });
    function place(animate) {
      const i = options.findIndex((o) => o.value === value);
      const b = buttons[i];
      if (!b || !b.offsetWidth) return;
      if (!animate) thumb.style.transition = "none";
      thumb.style.width = b.offsetWidth + "px";
      thumb.style.transform = `translateX(${b.offsetLeft}px)`;
      if (!animate) requestAnimationFrame(() => (thumb.style.transition = ""));
    }
    function set(v, fire) {
      value = v;
      buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(options[i].value === v)));
      place(true);
      if (fire) onChange(v);
    }
    requestAnimationFrame(() => place(false));
    new ResizeObserver(() => place(false)).observe(root);
    root.setValue = (v) => set(v, false);
    return root;
  };

  /* Лента весов. items: [{ c, answer, status, effectiveWeight, fraction }] */
  DA.ribbon = function (items, opts) {
    opts = opts || {};
    const root = DA.h("div", { class: "da-ribbon" + (opts.mini ? " is-mini" : "") + (opts.interactive ? " is-interactive" : ""), role: opts.mini ? "presentation" : "img" });
    const segs = {};
    for (const it of items) {
      if (it.c.type === "flag") continue;
      const s = DA.h("div", { class: "da-seg-w", "data-id": it.c.id });
      segs[it.c.id] = s;
      root.append(s);
      if (opts.interactive) {
        s.addEventListener("mouseenter", () => opts.onHover && opts.onHover(it.c.id));
        s.addEventListener("mouseleave", () => opts.onHover && opts.onHover(null));
        s.addEventListener("click", () => opts.onClick && opts.onClick(it.c.id));
      }
    }
    root.update = function (list) {
      for (const it of list) {
        const s = segs[it.c.id];
        if (!s) continue;
        const tone = DA.tone(it.status === "done" ? it.answer : null, it.c);
        s.classList.toggle("is-na", tone === "na");
        s.classList.toggle("is-pending", it.status !== "done");
        s.style.setProperty("--w", tone === "na" ? 0 : (it.effectiveWeight || it.c.weight).toFixed(3));
        s.style.setProperty("--f", it.status === "done" && it.fraction != null ? it.fraction : 0);
        s.style.setProperty("--tone", `var(--da-${tone === "partial" ? "partial" : tone === "flag" ? "gross" : tone})`);
        if (!opts.mini) s.title = `${it.c.title}: ${it.status === "done" ? (tone === "na" ? "Не применимо" : DA.fmt.score(it.points) + " из " + DA.fmt.score(it.effectiveWeight)) : "оценивается"}`;
      }
      const done = list.filter((i) => i.status === "done" && i.c.type !== "flag");
      root.setAttribute("aria-label", `Лента весов: ${done.length} из ${list.filter((i) => i.c.type !== "flag").length} критериев оценено`);
    };
    root.update(items);
    root.light = (id) => Object.entries(segs).forEach(([k, s]) => s.classList.toggle("is-lit", k === id));
    return root;
  };

  /* Ряд пилюль: ответ, при апелляции старый зачёркнут. */
  DA.answerPill = function (answer, c, previous, status) {
    if (status && status !== "done") return DA.h("span", { class: "da-pill t-pending" }, "…");
    const label = (value) => DA.answerText(value, c);
    const tone = DA.tone(answer, c);
    const pill = DA.h("span", { class: `da-pill t-${tone}` });
    if (previous != null && previous !== answer) pill.append(DA.h("s", {}, label(previous)), " ");
    pill.append(label(answer));
    return pill;
  };

  DA.countTo = function (node, from, to, ms) {
    if (from == null || to == null || matchMedia("(prefers-reduced-motion: reduce)").matches) { node.textContent = DA.fmt.score(to); return; }
    const t0 = performance.now();
    (function step(t) {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      node.textContent = DA.fmt.score(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  };

  /* Плашка при наведении и фокусе. build() вызывается каждый раз, чтобы показать свежие данные. */
  let hoverEl = null, hoverTimer = null;
  DA.hoverCard = function (anchor, build) {
    function show() {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        hide(true);
        hoverEl = DA.h("div", { class: "da-hovercard", role: "tooltip" }, build());
        document.body.append(hoverEl);
        const r = anchor.getBoundingClientRect(), w = hoverEl.offsetWidth, hh = hoverEl.offsetHeight;
        const below = r.bottom + 10 + hh < innerHeight;
        hoverEl.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + "px";
        hoverEl.style.top = (below ? r.bottom + 10 : r.top - hh - 10) + "px";
        hoverEl.classList.toggle("is-above", !below);
      }, 160);
    }
    function hide(now) {
      clearTimeout(hoverTimer);
      if (!hoverEl) return;
      const el = hoverEl;
      hoverEl = null;
      if (now === true) el.remove();
      else { el.classList.add("is-out"); setTimeout(() => el.remove(), 150); }
    }
    anchor.addEventListener("mouseenter", show);
    anchor.addEventListener("mouseleave", hide);
    anchor.addEventListener("focus", show);
    anchor.addEventListener("blur", hide);
    window.addEventListener("hashchange", () => hide(true));
  };

  /* Разбор ленты весов: что значит каждый сегмент. */
  DA.ribbonLegend = function (ev) {
    const cl = DA.checklist(ev.checklistVersion);
    const rows = ev.items
      .map((i) => ({ ...i, c: DA.criterionById(cl, i.criterionId) }))
      .filter((i) => i.c.type !== "flag");
    const hasNa = rows.some((i) => i.answer === "na");
    return [
      DA.h("div", { class: "da-hc-title" }, "Из чего сложился итог"),
      DA.ribbon(rows),
      DA.h("ul", { class: "da-hc-list" }, rows.map((i) => {
        const tone = DA.tone(i.answer, i.c);
        return DA.h("li", {},
          DA.h("i", { class: `da-swatch t-${tone}` }),
          DA.h("span", {}, i.c.title),
          DA.h("b", {}, i.answer === "na" ? "Не применимо" : `${DA.fmt.score(i.points)} из ${DA.fmt.score(i.effectiveWeight)}`));
      })),
      DA.h("p", { class: "da-hc-note" },
        "Каждый сегмент это критерий. Ширина показывает его вес, заливка показывает, сколько баллов набрано.",
        hasNa ? " Штриховка отмечает критерии, которые не применяются. Их баллы распределены между остальными." : "")
    ];
  };

  /* Галочка в стиле продукта. */
  DA.checkbox = function (label, checked, onChange) {
    const input = DA.h("input", { type: "checkbox", class: "da-check-input" });
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    return DA.h("label", { class: "da-check" }, input, DA.h("span", { class: "da-check-box", "aria-hidden": "true" }, DA.icon("check", 14)), DA.h("span", {}, label));
  };

  /* Кнопка «Фильтры» с выпадающей панелью групп. groups: [{ key, title, options: [{ value, label }] }], value: { key: Set } */
  DA.filterMenu = function (groups, value, onChange) {
    const count = DA.h("span", { class: "da-count is-brand" });
    const btn = DA.h("button", { class: "da-btn", type: "button", "aria-haspopup": "true", "aria-expanded": "false" }, DA.icon("filter"), "Фильтры", count);
    const panel = DA.h("div", { class: "da-menu", hidden: true });
    const root = DA.h("div", { class: "da-menu-wrap" }, btn, panel);
    function sync() {
      const n = groups.reduce((s, g) => s + value[g.key].size, 0);
      count.textContent = n;
      count.hidden = !n;
    }
    function render() {
      panel.replaceChildren(...groups.map((g) => DA.h("fieldset", { class: "da-menu-group" },
        DA.h("legend", {}, g.title),
        g.options.map((o) => DA.checkbox(o.label, value[g.key].has(o.value), (on) => {
          on ? value[g.key].add(o.value) : value[g.key].delete(o.value);
          sync();
          onChange();
        })))));
    }
    function outside(e) { if (!root.contains(e.target)) toggle(false); }
    function esc(e) { if (e.key === "Escape") { toggle(false); btn.focus(); } }
    function toggle(open) {
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      if (open) { render(); document.addEventListener("mousedown", outside); document.addEventListener("keydown", esc); }
      else { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", esc); }
    }
    btn.addEventListener("click", () => toggle(panel.hidden));
    root.refresh = () => { sync(); if (!panel.hidden) render(); };
    sync();
    return root;
  };
})();

/* Модальное окно по центру поверх затемнения, на телефоне выезжает снизу. */
(function () {
  const DA = window.DA, h = DA.h;
  let seq = 0;

  DA.modal = function ({ title, body, foot, onClose, width }) {
    const prevFocus = document.activeElement;
    const titleId = "da-modal-title-" + ++seq;
    const scrim = h("div", { class: "da-scrim" });
    const panel = h("div", { class: "da-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, tabindex: -1, style: { width: `min(${width || 560}px, 100%)` } },
      h("div", { class: "da-modal-head" },
        h("h2", { id: titleId }, title),
        h("button", { class: "da-close", type: "button", "aria-label": "Закрыть", onclick: () => close() }, DA.icon("x"))),
      h("div", { class: "da-modal-body" }, body),
      foot ? h("div", { class: "da-modal-foot" }, foot) : null);
    const wrap = h("div", { class: "da-modal-wrap" }, panel);
    let open = true;

    const focusable = () => [...panel.querySelectorAll("button, input, textarea, a[href], [tabindex]:not([tabindex='-1'])")]
      .filter((x) => !x.disabled && x.offsetParent !== null && !(x.type === "radio" && !x.checked));
    function key(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key === "Tab") {
        const f = focusable();
        if (!f.length) { e.preventDefault(); return; }
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
      }
    }
    function close() {
      if (!open) return;
      open = false;
      scrim.classList.remove("is-on"); panel.classList.remove("is-on");
      document.removeEventListener("keydown", key);
      window.removeEventListener("hashchange", close);
      setTimeout(() => { scrim.remove(); wrap.remove(); }, 240);
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
      onClose && onClose();
    }
    scrim.addEventListener("click", close);
    document.addEventListener("keydown", key);
    window.addEventListener("hashchange", close);
    document.body.append(scrim, wrap);
    requestAnimationFrame(() => { scrim.classList.add("is-on"); panel.classList.add("is-on"); });
    setTimeout(() => {
      if (!open || panel.contains(document.activeElement)) return;
      const f = panel.querySelector("[autofocus], .da-seg button[aria-pressed='true'], input:checked, .da-input");
      (f || panel).focus();
    }, 60);
    return { close, panel };
  };
})();
