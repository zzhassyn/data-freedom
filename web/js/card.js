/* Карточка диалога: транскрипт слева, оценка справа, связь критериев и реплик, апелляции. */
(function () {
  const DA = window.DA, h = DA.h;
  const TONE_VARS = {
    yes: ["var(--da-yes)", "var(--da-yes-soft)"], partial: ["var(--da-partial)", "var(--da-partial-soft)"],
    no: ["var(--da-no)", "var(--da-no-soft)"], na: ["var(--da-na)", "var(--da-na-soft)"],
    flag: ["var(--da-gross)", "var(--da-gross-soft)"], pending: ["var(--da-line)", "var(--da-surface-2)"]
  };
  const toneStyle = (tone) => ({ "--lit": TONE_VARS[tone][0], "--lit-soft": TONE_VARS[tone][1] });
  function setTone(node, tone) { for (const [k, v] of Object.entries(toneStyle(tone))) node.style.setProperty(k, v); }

  DA.views.card = function mount(root, params) {
    const conv = DA.state.conversations[params.id];
    if (!conv) {
      root.append(h("div", { class: "da-page" }, h("div", { class: "da-empty" },
        h("h2", { tabindex: -1 }, "Такого обращения нет в базе"),
        h("p", {}, "Возможно, набор ещё не загружен."),
        DA.state.role === "reviewer" ? h("a", { class: "da-btn", href: "#/review" }, "Вернуться к очереди") : h("a", { class: "da-btn", href: "#/" }, "К списку обращений"))));
      return;
    }
    const cid = conv.conversation_id;
    const isCall = conv.channel === "voice call";
    let ev = DA.state.evaluations[cid] || null;
    const CL = () => (ev ? DA.checklist(ev.checklistVersion) : DA.activeChecklist());
    let openId = params.query.criterion || null;
    let running = false;
    /* Проверяющий видит карточку только для чтения: без переоценки и без новых апелляций. */
    const readOnly = DA.state.role === "reviewer";
    const timers = [];

    /* ---------- Транскрипт ---------- */
    const transcript = h("section", { class: "da-transcript", "aria-label": "Диалог" });
    const bracket = h("div", { class: "da-bracket", "aria-hidden": "true" }, h("span", {}, "Проверенный участок"));
    const turnNodes = [];
    const gaps = DA.tx.gaps(conv);
    const firstOp = DA.tx.firstOperatorIdx(conv);
    const turnsBox = h("div", { class: "da-turns" });

    conv.transcript.forEach((t, i) => {
      if (gaps[i]) {
        const long = gaps[i] >= 180;
        turnsBox.append(h("div", { class: "da-gap" + (long ? " is-long" : "") }, DA.icon("clock"), `Ожидание ответа ${DA.fmt.duration(gaps[i])}`));
      }
      let node;
      if (t.speaker === "system") {
        const kind = DA.tx.systemKind(t.text);
        const ic = { verified: "check", escalate: "escalate", closed: "x", hold: "pause" }[kind];
        node = h("div", { class: `da-sys k-${kind}`, "data-idx": i, tabindex: -1 },
          h("span", {}, ic ? DA.icon(ic) : null, h("span", {}, t.text), h("time", {}, DA.tx.clock(t.timestamp))));
      } else {
        const long = t.speaker === "bot" && t.text.length > 220;
        const bubble = h("div", { class: "da-bubble" + (long ? " is-clamped" : "") }, t.text);
        node = h("div", { class: `da-turn r-${t.speaker}`, "data-idx": i, tabindex: -1 },
          h("div", { class: "da-turn-meta" },
            h("b", {}, DA.speakerLabel[t.speaker]), h("time", {}, DA.tx.clock(t.timestamp)),
            i === firstOp ? h("span", { class: "da-first" }, "Первый ответ оператора") : null),
          bubble,
          long ? h("button", { class: "da-more", type: "button", onclick: (e) => { bubble.classList.toggle("is-clamped"); e.target.textContent = bubble.classList.contains("is-clamped") ? "Показать полностью" : "Свернуть"; } }, "Показать полностью") : null,
          h("div", { class: "da-turn-tags" }));
        node.addEventListener("mouseenter", () => hoverTurn(i));
        node.addEventListener("mouseleave", () => hoverTurn(null));
      }
      turnNodes[i] = node;
      turnsBox.append(node);
    });

    const audioHref = DA.audioHref(conv);
    const player = isCall && audioHref ? h("div", { class: "da-player" },
      h("a", { class: "da-play", href: audioHref, target: "_blank", rel: "noopener noreferrer", "aria-label": "Слушать запись звонка" }, DA.icon("play")),
      h("div", {}, h("b", {}, "Запись звонка"), h("div", { class: "da-small da-muted" }, DA.fmt.duration(DA.tx.duration(conv))))) : null;

    transcript.append(...[bracket, player, turnsBox].filter(Boolean));

    /* ---------- Связь критерий ↔ реплики ---------- */
    let focused = null;
    function focusCriterion(item) {
      focused = item ? item.criterionId : null;
      turnNodes.forEach((n) => n && n.classList.remove("is-lit"));
      if (!item) { transcript.classList.remove("is-focusing"); bracket.classList.remove("is-on"); ribbon && ribbon.light(null); return; }
      const c = DA.criterionById(CL(), item.criterionId);
      const tone = DA.tone(item.answer, c);
      setTone(transcript, tone);
      const idxs = new Set(item.evidence.map((e) => e.turnIdx));
      if (item.checkedRange) for (let k = item.checkedRange.fromIdx; k <= item.checkedRange.toIdx; k++) if (k === item.checkedRange.fromIdx || k === item.checkedRange.toIdx) idxs.add(k);
      idxs.forEach((k) => turnNodes[k] && turnNodes[k].classList.add("is-lit"));
      transcript.classList.toggle("is-focusing", idxs.size > 0);
      if (item.checkedRange && turnNodes[item.checkedRange.fromIdx] && turnNodes[item.checkedRange.toIdx]) {
        const a = turnNodes[item.checkedRange.fromIdx], b = turnNodes[item.checkedRange.toIdx];
        bracket.style.top = a.offsetTop + "px";
        bracket.style.height = b.offsetTop + b.offsetHeight - a.offsetTop + "px";
        bracket.classList.add("is-on");
      } else bracket.classList.remove("is-on");
      ribbon && ribbon.light(item.criterionId);
    }
    function jumpTo(idx, tone) {
      const n = turnNodes[idx];
      if (!n) return;
      setTone(n, tone || "yes");
      n.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      n.classList.remove("is-flash"); void n.offsetWidth; n.classList.add("is-flash");
      n.focus({ preventScroll: true });
    }
    function hoverTurn(idx) {
      critNodes.forEach((node, id) => {
        const it = ev && ev.items.find((x) => x.criterionId === id);
        node.classList.toggle("is-hot", idx != null && !!it && it.evidence.some((e) => e.turnIdx === idx));
      });
    }
    function indexEvidence() {
      turnNodes.forEach((n) => { const tags = n && n.querySelector(".da-turn-tags"); tags && tags.replaceChildren(); });
      if (!ev) return;
      for (const it of ev.items) {
        if (it.status !== "done") continue;
        const c = DA.criterionById(CL(), it.criterionId);
        for (const e of it.evidence) {
          const tags = turnNodes[e.turnIdx] && turnNodes[e.turnIdx].querySelector(".da-turn-tags");
          if (tags && !tags.querySelector(`[data-c="${c.id}"]`)) {
            const p = DA.answerPill(it.answer, c);
            p.dataset.c = c.id;
            p.prepend(c.title + ": ");
            tags.append(p);
          }
        }
      }
    }

    /* ---------- Панель оценки ---------- */
    const panel = h("section", { class: "da-eval", "aria-label": "Оценка" });
    const critNodes = new Map();
    let ribbon = null;
    let totalNode = null;

    function itemsWithC() { return ev.items.map((i) => ({ ...i, c: DA.criterionById(CL(), i.criterionId) })); }

    function renderPanel(opts) {
      opts = opts || {};
      panel.replaceChildren();
      critNodes.clear();
      if (ev && ev.stale) {
        panel.append(h("div", { class: "da-empty" },
          h("h2", {}, "Оценка устарела"),
          h("p", {}, `Транскрипт изменился. Прежний итог ${DA.fmt.score(ev.total)} больше не участвует в сводке.`)));
        return;
      }
      if (!ev) {
        panel.append(h("div", { class: "da-empty" },
          h("div", { class: "da-empty-ribbon", "aria-hidden": "true" }, CL().criteria.filter((c) => c.weight).map((c) => h("i", { style: { "--w": c.weight } }))),
          h("h2", {}, "Диалог ещё не оценён"),
          h("p", {}, readOnly ? "Оценку запускает аналитик." : "Модель пройдёт по каждому критерию чек-листа и приведёт реплики, на которых основан ответ."),
          readOnly ? null : h("button", { class: "da-btn is-primary", onclick: (e) => evaluate(e.currentTarget) }, "Оценить")));
        return;
      }
      const done = ev.items.filter((i) => i.status === "done").length;
      const top = h("div", { class: "da-eval-top" });
      const totalBox = h("div", {});
      if (running) {
        totalBox.append(h("div", { class: "da-total-live" }, `Оценка идёт: ${done} из ${ev.items.length} ${DA.fmt.plural(ev.items.length, ["критерий", "критерия", "критериев"])}`),
          h("div", { class: "da-progress" }, h("i", { style: { width: (done / ev.items.length) * 100 + "%" } })));
      } else if (ev.total == null) {
        totalBox.append(h("div", { class: "da-total-live" }, "Итог не рассчитывается"), h("div", { class: "da-small da-muted" }, "Все критерии с весом получили N/A"));
      } else {
        totalNode = h("span", {}, DA.fmt.score(ev.total));
        if (ev.originalTotal !== ev.total) totalBox.append(h("div", { class: "da-total-was" }, h("s", {}, DA.fmt.score(ev.originalTotal)), "до апелляций"));
        totalBox.append(h("div", { class: "da-total" }, totalNode, h("small", {}, "из 100")));
      }
      const reviewCount = ev.items.filter((i) => i.needsReview && i.status === "done").length;
      top.append(h("div", { class: "da-total-row" }, totalBox,
        h("div", { class: "da-eval-meta" },
          h("span", {}, `Чек-лист, версия ${ev.checklistVersion}`),
          ev.checklistVersion !== DA.activeChecklist().version ? h("span", {}, `Активна версия ${DA.activeChecklist().version}`) : null,
          h("span", {}, running ? "Модель читает диалог" : `Оценено ${DA.fmt.ago(ev.minutesAgo || 0)} за ${ev.durationSec} с`))));

      if (ev.grossFlagged) {
        const g = ev.items.find((i) => DA.criterionById(CL(), i.criterionId).type === "flag");
        top.append(h("div", { class: "da-gross-bar" }, DA.icon("flag"), "Грубая ошибка", g.explanation ? h("span", { style: { fontWeight: 400 } }, g.explanation) : null));
      }
      ribbon = DA.ribbon(itemsWithC(), {
        interactive: true,
        onHover: (id) => { const it = id && ev.items.find((x) => x.criterionId === id); note(it); if (!openId) focusCriterion(it || null); },
        onClick: (id) => toggle(id, true)
      });
      const noteNode = h("div", { class: "da-ribbon-note" });
      function note(it) {
        const naItems = ev.items.filter((i) => i.status === "done" && i.answer === "na");
        if (it && it.answer === "na") {
          const c = DA.criterionById(CL(), it.criterionId);
          noteNode.textContent = `«${c.title}» не применяется. Его ${c.weight} ${DA.fmt.plural(c.weight, ["балл", "балла", "баллов"])} разделены между остальными критериями пропорционально весам.`;
        } else noteNode.textContent = naItems.length ? `Вес ${naItems.length} ${DA.fmt.plural(naItems.length, ["критерия", "критериев", "критериев"])} с N/A разделён между остальными. Сегменты показывают вклад каждого критерия в 100 баллов.` : "";
      }
      note(null);
      top.append(ribbon, noteNode);

      const decided = DA.state.appeals.filter((a) => a.conversationId === cid && a.status !== "open");
      if (decided.length) {
        const changed = decided.filter((a) => a.status === "changed").length;
        top.append(h("div", { class: "da-history" },
          h("span", {}, "Исходная оценка ", h("b", {}, DA.fmt.score(ev.originalTotal))),
          h("span", {}, `Решения: ${changed ? `изменено ${changed}` : ""}${changed && decided.length - changed ? ", " : ""}${decided.length - changed ? `подтверждено ${decided.length - changed}` : ""}`),
          h("span", {}, "Финальный итог ", h("b", {}, DA.fmt.score(ev.total)))));
      }
      if (reviewCount && !running) top.append(h("div", { class: "da-small", style: { color: "var(--da-partial-ink)", display: "flex", gap: "6px", alignItems: "center" } }, DA.icon("alert", 15), `${reviewCount} ${DA.fmt.plural(reviewCount, ["критерий стоит", "критерия стоит", "критериев стоит"])} проверить вручную`));
      panel.append(top);

      for (const s of CL().sections) {
        const crits = CL().criteria.filter((c) => c.sectionId === s.id);
        const sr = ev.sections.find((x) => x.sectionId === s.id);
        const sec = h("div", { class: "da-section" },
          h("div", { class: "da-section-head" }, h("h3", {}, s.title),
            sr && sr.max > 0 && !running ? h("span", {}, `${DA.fmt.score(sr.earned)} из ${DA.fmt.score(sr.max)}`) : null));
        for (const c of crits) sec.append(critRow(c, opts));
        panel.append(sec);
      }
      indexEvidence();
      if (openId) {
        const it = ev.items.find((i) => i.criterionId === openId);
        it && it.status === "done" ? focusCriterion(it) : null;
      }
    }

    function critRow(c, opts) {
      const it = ev.items.find((i) => i.criterionId === c.id);
      const isOpen = openId === c.id && it.status === "done";
      const tone = DA.tone(it.status === "done" ? it.answer : null, c);
      const node = h("div", { class: "da-crit" + (isOpen ? " is-open" : ""), "data-id": c.id });
      setTone(node, tone);
      critNodes.set(c.id, node);
      const appeal = it.appealId && DA.state.appeals.find((a) => a.id === it.appealId);

      let pts = null, sub = null;
      if (it.status === "done" && c.type !== "flag") {
        if (it.answer === "na") pts = h("span", { class: "da-pts" }, "без баллов");
        else pts = h("span", { class: "da-pts" }, h("b", {}, DA.fmt.score(it.points)), ` из ${DA.fmt.score(it.effectiveWeight)}`);
        if (it.answer === "na") sub = h("div", { class: "da-crit-sub" }, h("span", {}, `вес ${c.weight} передан другим критериям`));
        else if (Math.abs(it.effectiveWeight - c.weight) > 0.005) sub = h("div", { class: "da-crit-sub" }, h("span", { class: opts.blink ? "is-blink" : "" }, `вес ${c.weight} → ${DA.fmt.score(it.effectiveWeight)}`));
      }
      const pill = DA.answerPill(it.answer, c, it.original ? it.original.answer : null, it.status);
      if (opts.justDone === c.id) pill.classList.add("is-in");
      const row = h("button", { class: "da-crit-row", type: "button", "aria-expanded": String(isOpen), disabled: it.status !== "done" ? true : null },
        h("span", { class: "da-crit-title" }, c.title,
          it.needsReview && it.status === "done" ? h("span", { class: "da-review", title: "Модель ответила по-разному при двух проверках, ответ стоит перепроверить" }, DA.icon("alert")) : null,
          appeal && appeal.status === "open" ? h("span", { class: "da-review", title: "Есть открытая апелляция" }, DA.icon("message")) : null),
        h("span", { class: "da-crit-score" },
          it.status === "running" ? h("span", { class: "da-thinking" }, "Модель читает диалог") : null,
          pts, pill),
        sub);
      row.addEventListener("click", () => toggle(c.id));
      node.addEventListener("mouseenter", () => { if (!openId && it.status === "done") { focusCriterion(it); ribbon && ribbon.light(c.id); } });
      node.addEventListener("mouseleave", () => { if (!openId) focusCriterion(null); });
      node.append(row);

      if (it.status === "pending" && running) {
        node.querySelector(".da-crit-title").style.color = "var(--da-text-3)";
      }
      if (isOpen) node.append(critBody(c, it, tone, appeal));
      return node;
    }

    function critBody(c, it, tone, appeal) {
      const body = h("div", { class: "da-crit-body" });
      if (it.answer === "na") body.append(h("div", {}, h("div", { class: "da-label" }, "Почему N/A"), h("p", {}, it.naReason)));
      else if (it.explanation) body.append(h("p", {}, it.explanation));
      if (it.evidence.length) {
        const list = h("div", { style: { display: "grid", gap: "8px" } });
        for (const e of it.evidence) {
          const t = conv.transcript[e.turnIdx];
          const q = h("button", { class: "da-quote", type: "button", onclick: () => jumpTo(e.turnIdx, tone) },
            h("small", {}, `${DA.speakerLabel[t.speaker]}, ${DA.tx.clock(t.timestamp)}`, e.kind === "expected_here" ? h("em", {}, "Здесь ожидалось действие") : null),
            h("q", {}, e.quote));
          setTone(q, tone);
          list.append(q);
        }
        body.append(h("div", {}, h("div", { class: "da-label" }, "Доказательства"), list));
      } else if (it.answer !== "na" && c.type !== "flag") body.append(h("p", { class: "da-small da-muted" }, "Модель не привела реплику"));
      if (it.checkedRange) {
        body.append(h("div", {}, h("button", { class: "da-turnchip", type: "button", onclick: () => jumpTo(it.checkedRange.fromIdx, tone) },
          `Проверенный участок ${DA.tx.clock(conv.transcript[it.checkedRange.fromIdx].timestamp)}–${DA.tx.clock(conv.transcript[it.checkedRange.toIdx].timestamp)}`)));
      }
      body.append(ruleBlock(c, it));

      if (appeal) {
        if (appeal.status === "open") {
          body.append(h("div", { class: "da-appeal-state" },
            h("b", {}, "На рассмотрении у проверяющего"),
            h("span", {}, appeal.comment),
            readOnly ? h("div", {}, h("a", { class: "da-btn is-sm", style: { marginTop: "6px" }, href: `#/review/${appeal.id}` }, "Разобрать апелляцию")) : null));
        } else {
          body.append(h("div", { class: "da-appeal-state is-done" },
            h("b", {}, appeal.status === "changed" ? `Изменено проверяющим: ${DA.answerLabel(appeal.originalAnswer, c)} → ${DA.answerLabel(appeal.decision.newAnswer, c)}` : "Оценка подтверждена проверяющим"),
            h("span", {}, appeal.decision.reason)));
        }
      } else if (!running && !readOnly) {
        body.append(h("div", { class: "da-crit-actions" },
          h("button", { class: "da-btn is-sm", onclick: (e) => appealDrawer(c, it, e.currentTarget) }, DA.icon("message"), "Оспорить оценку")));
      }
      return body;
    }

    function ruleBlock(c, it) {
      const box = h("div", { class: "da-rule" });
      const content = h("div", { hidden: true, style: { marginTop: "8px" } },
        h("p", { style: { margin: 0 } }, c.description),
        c.naAllowed ? h("p", { style: { margin: "6px 0 0" } }, `N/A: ${c.naCondition}`) : null,
        c.scale ? h("ol", {}, c.scale.map((s) => h("li", { class: it.answer === s.value ? "is-picked" : "" }, h("b", {}, s.value), h("span", {}, s.description)))) : null);
      const btn = h("button", { class: "da-rule-toggle", type: "button", "aria-expanded": "false" }, DA.icon("chevron"), "Правило критерия");
      btn.addEventListener("click", () => {
        content.hidden = !content.hidden;
        btn.setAttribute("aria-expanded", String(!content.hidden));
      });
      box.append(btn, content);
      return box;
    }

    function toggle(id, fromRibbon) {
      const it = ev.items.find((i) => i.criterionId === id);
      if (!it || it.status !== "done") return;
      openId = openId === id && !fromRibbon ? null : id;
      renderPanel();
      focusCriterion(openId ? it : null);
      const node = critNodes.get(id);
      if (node && fromRibbon) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    /* ---------- Живая оценка (в прототипе проигрывает тестовые ответы) ---------- */
    function evaluate(btn) {
      const fresh = DA.freshEvaluation(cid);
      if (!fresh) {
        DA.toast("Оценка для этого транскрипта пока недоступна", btn);
        return;
      }
      const prevTotal = ev && ev.total;
      running = true;
      openId = null;
      focusCriterion(null);
      DA.state.appeals = DA.state.appeals.filter((a) => a.conversationId !== cid);
      ev = fresh;
      const answers = ev.items.map((i) => ({ ...i }));
      ev.items.forEach((i) => { i.status = "pending"; i.answer = null; });
      ev.total = null;
      DA.rescore(ev);
      renderPanel();
      setHeadBusy(true);
      const order = answers.map((_, k) => k).sort(() => Math.random() - 0.5);
      let delay = 300;
      order.forEach((k, n) => {
        timers.push(setTimeout(() => { ev.items[k].status = "running"; renderPanel(); }, delay - 250));
        delay += 450 + Math.random() * 500;
        timers.push(setTimeout(() => {
          Object.assign(ev.items[k], answers[k], { status: "done" });
          DA.rescore(ev);
          if (n === order.length - 1) finish(prevTotal);
          else renderPanel({ justDone: answers[k].criterionId, blink: answers[k].answer === "na" });
        }, delay));
      });
    }
    function finish(prevTotal) {
      running = false;
      ev.originalTotal = ev.total;
      ev.minutesAgo = 0;
      DA.state.evaluations[cid] = ev;
      DA.save();
      window.dispatchEvent(new CustomEvent("da:appeals-changed"));
      renderPanel();
      if (totalNode) DA.countTo(totalNode, 0, ev.total, 700);
      setHeadBusy(false);
    }

    /* ---------- Апелляция ---------- */
    function previewTotal(criterionId, answer) {
      const answers = Object.fromEntries(ev.items.map((i) => [i.criterionId, i.answer]));
      answers[criterionId] = answer;
      return DA.computeScores(CL(), answers).total;
    }
    function answerOptions(c, exclude) {
      return DA.allowedAnswers(c).filter((a) => a !== exclude).map((a) => ({ value: a, label: DA.answerLabel(a, c) }));
    }

    function appealDrawer(c, it, anchor) {
      let proposed = null;
      const err = h("div", { class: "da-error", hidden: true });
      const ta = h("textarea", { class: "da-textarea", placeholder: "Например: оператор представился во втором сообщении" });
      const left = h("span", { class: "da-hint" });
      const prev = h("div", { class: "da-preview-total", hidden: true });
      const upd = () => {
        const n = ta.value.trim().length;
        left.textContent = n < 10 ? `Ещё ${10 - n} ${DA.fmt.plural(10 - n, ["символ", "символа", "символов"])}` : "";
        submit.disabled = n < 10;
      };
      ta.addEventListener("input", upd);
      const submit = h("button", { class: "da-btn is-primary", disabled: true }, "Подать апелляцию");
      const d = DA.drawer({
        title: "Апелляция по критерию", subtitle: c.title,
        body: [
          h("div", { class: "da-block" }, h("div", { class: "da-label" }, "Оценка модели"),
            h("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, DA.answerPill(it.answer, c), c.type !== "flag" && it.answer !== "na" ? h("span", { class: "da-small da-muted" }, `${DA.fmt.score(it.points)} из ${DA.fmt.score(it.effectiveWeight)}`) : null),
            h("p", { style: { margin: 0, fontSize: "14px" } }, it.answer === "na" ? it.naReason : it.explanation)),
          h("label", { class: "da-field" }, h("span", {}, "Почему вы не согласны"), ta, left),
          h("div", { class: "da-block" }, h("div", { class: "da-label" }, "Какой должна быть оценка, по желанию"),
            DA.segmented(answerOptions(c, it.answer), null, (v) => {
              proposed = v;
              const t = previewTotal(c.id, v);
              prev.hidden = false;
              prev.replaceChildren(h("span", { class: "da-muted" }, "Если согласиться, итог станет"), h("b", {}, DA.fmt.score(t)));
            }, "Предлагаемая оценка"),
            prev),
          err],
        foot: [submit, h("button", { class: "da-btn is-text", onclick: () => d.close() }, "Отмена")]
      });
      submit.addEventListener("click", () => {
        DA.createAppeal(cid, c.id, ta.value.trim(), proposed, 0);
        d.close();
        renderPanel();
        const node = critNodes.get(c.id);
        DA.toast("Апелляция отправлена проверяющему", node || anchor);
      });
    }

    /* ---------- Шапка карточки ---------- */
    const evalBtn = h("button", { class: "da-btn", onclick: (e) => evaluate(e.currentTarget) }, DA.icon("refresh"), ev ? "Переоценить" : "Оценить");
    function setHeadBusy(b) { evalBtn.disabled = b; evalBtn.classList.toggle("is-busy", b); evalBtn.lastChild.textContent = b ? "Оценка идёт" : "Переоценить"; }
    const durSec = DA.tx.duration(conv);
    root.append(h("div", { class: "da-page" },
      readOnly ? h("a", { class: "da-btn is-text is-sm", href: "#/review", style: { marginBottom: "8px" } }, DA.icon("back", 16), "Вернуться к очереди") : null,
      h("div", { class: "da-card-head" },
        readOnly ? null : h("a", { class: "da-back", href: "#/", "aria-label": "К списку обращений" }, DA.icon("back")),
        h("h1", { class: "da-h1", tabindex: -1, title: cid }, `Обращение № ${DA.convNumber(cid)}`),
        h("span", { class: "da-chip" }, DA.langLabel[conv.language]),
        h("span", { class: "da-chip" }, DA.icon(isCall ? "phone" : "message"), DA.channelLabel(conv)),
        h("span", { class: "da-muted da-small" }, `${DA.fmt.dateTime(DA.tx.startedAt(conv))}, длительность ${DA.fmt.duration(durSec)}`),
        readOnly ? null : h("div", { class: "da-card-actions" }, evalBtn)),
      h("div", { class: "da-card-grid" }, transcript, panel)));

    renderPanel();
    if (params.query.turn) setTimeout(() => jumpTo(+params.query.turn, "yes"), 200);
    if (openId) setTimeout(() => { const n = critNodes.get(openId); n && n.scrollIntoView({ block: "nearest" }); }, 100);
    return () => timers.forEach(clearTimeout);
  };
})();
