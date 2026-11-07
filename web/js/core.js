/* Общие функции: DOM, форматирование, расчёт баллов, хранилище прототипа, слои. */
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
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
  };
  DA.icon = function (name, size) {
    const span = document.createElement("span");
    span.style.display = "inline-flex";
    span.innerHTML = `<svg class="da-icon" viewBox="0 0 24 24" aria-hidden="true"${size ? ` style="width:${size}px;height:${size}px"` : ""}>${ICONS[name] || ""}</svg>`;
    return span.firstChild;
  };

  /* ---------- Форматирование ---------- */
  const nf = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  DA.fmt = {
    score: (x) => (x == null ? "—" : nf.format(x)),
    duration(sec) {
      sec = Math.max(0, Math.round(sec));
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    },
    plural(n, forms) {
      const a = Math.abs(n) % 100, b = a % 10;
      if (a > 10 && a < 20) return forms[2];
      if (b > 1 && b < 5) return forms[1];
      if (b === 1) return forms[0];
      return forms[2];
    },
    ago(min) {
      if (min < 1) return "только что";
      if (min < 60) return `${min} мин назад`;
      return `${Math.round(min / 60)} ч назад`;
    }
  };

  DA.speakerLabel = { client: "Клиент", operator: "Оператор", bot: "Бот AIM", system: "Система" };
  DA.langLabel = { RU: "RU", KZ: "KZ", EN: "EN" };

  /* ---------- Транскрипт ---------- */
  DA.tx = {
    seconds(ts, first) {
      if (ts.includes("T")) return (Date.parse(ts.slice(0, 23) + ts.slice(-6)) - Date.parse(first.slice(0, 23) + first.slice(-6))) / 1000;
      const [m, s] = ts.split(":").map(Number);
      return m * 60 + s;
    },
    clock(ts) { return ts.includes("T") ? ts.slice(11, 19) : ts; },
    duration(conv) {
      const t = conv.transcript;
      return t.length ? DA.tx.seconds(t[t.length - 1].timestamp, t[0].timestamp) : 0;
    },
    preview(conv) {
      const first = conv.transcript.find((t) => t.speaker === "client" && t.text.length > 3);
      return first ? first.text : "";
    },
    firstOperatorIdx(conv) { return conv.transcript.findIndex((t) => t.speaker === "operator"); },
    /* Паузы от 60 с между репликой клиента и следующей репликой оператора. */
    gaps(conv) {
      const t = conv.transcript, out = {};
      let lastClient = null;
      t.forEach((turn, i) => {
        if (turn.speaker === "client") lastClient = i;
        if (turn.speaker === "operator" && lastClient != null) {
          const sec = DA.tx.seconds(turn.timestamp, t[0].timestamp) - DA.tx.seconds(t[lastClient].timestamp, t[0].timestamp);
          if (sec >= 60) out[i] = sec;
          lastClient = null;
        }
      });
      return out;
    },
    systemKind(text) {
      const s = text.toLowerCase();
      if (/подтвержден|расталды|identity verified/.test(s)) return "verified";
      if (/эскалац|операторға жіберілді|transferred to an agent|переведен/.test(s)) return "escalate";
      if (/закрыл|жапты|closed the chat|завершил|покинул|прерван|үзілді|lost/.test(s)) return "closed";
      if (/удержани|приостановлен/.test(s)) return "hold";
      return "plain";
    }
  };

  /* ---------- Ответы и расчёт баллов (CONTRACTS.md, раздел 3) ---------- */
  DA.criterionById = (cl, id) => cl.criteria.find((c) => c.id === id);
  DA.scaleMax = (c) => Math.max(...c.scale.map((s) => s.value));

  DA.tone = function (answer, c) {
    if (answer == null) return "pending";
    if (answer === "na") return "na";
    if (c.type === "flag") return answer === "yes" ? "flag" : "yes";
    if (c.type === "scale") {
      const max = DA.scaleMax(c);
      return answer === max ? "yes" : answer === 0 ? "no" : "partial";
    }
    return answer === "yes" ? "yes" : "no";
  };
  DA.answerLabel = function (answer, c) {
    if (answer == null) return "…";
    if (answer === "na") return "N/A";
    if (c.type === "scale") return `${answer} из ${DA.scaleMax(c)}`;
    if (c.type === "flag") return answer === "yes" ? "Найдена" : "Нет";
    return answer === "yes" ? "Да" : "Нет";
  };
  DA.allowedAnswers = function (c) {
    if (c.type === "scale") return [...c.scale.map((s) => s.value), ...(c.naAllowed ? ["na"] : [])];
    return ["yes", "no", ...(c.naAllowed ? ["na"] : [])];
  };

  /* answers: { criterionId: answer | null }. null = ещё не готов, считается применимым. */
  DA.computeScores = function (cl, answers) {
    const weighted = cl.criteria.filter((c) => c.type !== "flag" && c.weight > 0);
    const applicable = weighted.filter((c) => answers[c.id] !== "na");
    const W = applicable.reduce((s, c) => s + c.weight, 0);
    const items = {};
    for (const c of cl.criteria) {
      const a = answers[c.id];
      const isApp = applicable.includes(c);
      const eff = isApp && W > 0 ? (c.weight * 100) / W : 0;
      let fraction = null;
      if (a != null && a !== "na" && c.type !== "flag") fraction = c.type === "scale" ? a / DA.scaleMax(c) : a === "yes" ? 1 : 0;
      items[c.id] = { fraction, effectiveWeight: eff, points: (fraction || 0) * eff };
    }
    const sections = cl.sections.map((s) => {
      const cs = cl.criteria.filter((c) => c.sectionId === s.id && c.type !== "flag");
      return {
        sectionId: s.id,
        earned: cs.reduce((x, c) => x + items[c.id].points, 0),
        max: cs.reduce((x, c) => x + items[c.id].effectiveWeight, 0)
      };
    });
    const sum = Object.values(items).reduce((s, i) => s + i.points, 0);
    const total = W > 0 ? Math.round((sum + Number.EPSILON) * 100) / 100 : null;
    return { items, sections, total };
  };

  /* ---------- Хранилище прототипа (в браузере, до бэкенда) ---------- */
  const KEY = "da.proto.v1";
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ evaluations: DA.state.evaluations, appeals: DA.state.appeals, role: DA.state.role })); } catch (e) { /* без сохранения */ } }

  function buildEvaluation(cid) {
    const src = window.DA_MOCK_ANSWERS[cid];
    if (!src) return null;
    const items = DA_CHECKLIST.criteria.map((c) => {
      const m = src[c.id];
      return {
        criterionId: c.id, status: "done", answer: m.answer,
        explanation: m.explanation || null, naReason: m.naReason || null,
        evidence: (m.evidence || []).map(([turnIdx, quote, kind]) => ({ turnIdx, quote, kind })),
        checkedRange: m.range ? { fromIdx: m.range[0], toIdx: m.range[1] } : null,
        needsReview: !!m.needsReview, original: null, appealId: null
      };
    });
    const ev = { id: "ev_" + cid, conversationId: cid, checklistVersion: 1, model: src.model, status: "done", minutesAgo: 25, durationSec: 11 + (cid.length % 7), items };
    DA.rescore(ev);
    ev.originalTotal = ev.total;
    return ev;
  }

  DA.rescore = function (ev) {
    const answers = Object.fromEntries(ev.items.map((i) => [i.criterionId, i.status === "done" ? i.answer : null]));
    const r = DA.computeScores(DA_CHECKLIST, answers);
    ev.items.forEach((i) => Object.assign(i, r.items[i.criterionId]));
    ev.sections = r.sections;
    ev.total = ev.items.every((i) => i.status === "done") ? r.total : null;
    const g = ev.items.find((i) => DA.criterionById(DA_CHECKLIST, i.criterionId).type === "flag");
    ev.grossFlagged = !!g && g.answer === "yes";
    return ev;
  };

  DA.state = { evaluations: {}, appeals: [], role: "analyst", conversations: {} };
  DA.initState = function () {
    for (const r of window.DA_DEV.records) DA.state.conversations[r.conversation_id] = r;
    const saved = load();
    if (saved) Object.assign(DA.state, saved);
    else {
      for (const cid of Object.keys(window.DA_MOCK_ANSWERS)) DA.state.evaluations[cid] = buildEvaluation(cid);
      for (const a of window.DA_MOCK_APPEALS) DA.createAppeal(a.conversationId, a.criterionId, a.comment, a.proposedAnswer, a.createdMinutesAgo, true);
    }
  };
  DA.save = save;
  DA.resetState = function () { try { localStorage.removeItem(KEY); } catch (e) { /* ничего */ } location.reload(); };
  DA.freshEvaluation = buildEvaluation;

  DA.createAppeal = function (cid, criterionId, comment, proposedAnswer, minutesAgo, silent) {
    const ev = DA.state.evaluations[cid];
    const item = ev.items.find((i) => i.criterionId === criterionId);
    const appeal = {
      id: "ap_" + (DA.state.appeals.length + 1), conversationId: cid, criterionId, comment, proposedAnswer,
      createdAt: Date.now() - (minutesAgo || 0) * 60000, status: "open",
      originalAnswer: item.answer, totalBefore: ev.total, decision: null, totalAfter: null
    };
    DA.state.appeals.push(appeal);
    item.appealId = appeal.id;
    save();
    if (!silent) window.dispatchEvent(new CustomEvent("da:appeals-changed"));
    return appeal;
  };
  DA.decideAppeal = function (appeal, action, newAnswer, reason) {
    const ev = DA.state.evaluations[appeal.conversationId];
    const item = ev.items.find((i) => i.criterionId === appeal.criterionId);
    if (action === "change") {
      if (!item.original) item.original = { answer: item.answer, points: item.points, effectiveWeight: item.effectiveWeight };
      item.answer = newAnswer;
      DA.rescore(ev);
    }
    appeal.status = action === "change" ? "changed" : "confirmed";
    appeal.decision = { action, newAnswer: action === "change" ? newAnswer : null, reason, decidedAt: Date.now() };
    appeal.totalAfter = ev.total;
    save();
    window.dispatchEvent(new CustomEvent("da:appeals-changed"));
  };
  DA.openAppeals = () => DA.state.appeals.filter((a) => a.status === "open");

  /* ---------- Слои ---------- */
  DA.toast = function (text, anchor) {
    const t = DA.h("div", { class: "da-toast", role: "status" }, text);
    document.body.append(t);
    const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2 - 150, bottom: innerHeight - 80, top: innerHeight - 80 };
    const w = Math.min(360, innerWidth - 32);
    t.style.left = Math.max(16, Math.min(r.left, innerWidth - w - 16)) + "px";
    const below = r.bottom + 8 + 60 < innerHeight;
    t.style.top = (below ? r.bottom + 8 : r.top - 52) + "px";
    setTimeout(() => { t.style.transition = "opacity 200ms"; t.style.opacity = "0"; setTimeout(() => t.remove(), 220); }, 3600);
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
        if (!opts.mini) s.title = `${it.c.title}: ${it.status === "done" ? (tone === "na" ? "N/A" : DA.fmt.score(it.points) + " из " + DA.fmt.score(it.effectiveWeight)) : "оценивается"}`;
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
    const tone = DA.tone(answer, c);
    const pill = DA.h("span", { class: `da-pill t-${tone}` });
    if (previous != null && previous !== answer) pill.append(DA.h("s", {}, DA.answerLabel(previous, c)), " ");
    pill.append(DA.answerLabel(answer, c));
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
})();
