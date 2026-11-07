/* Карточка диалога: транскрипт слева, оценка справа, связь критериев и реплик, апелляции. */
(function () {
  const DA = window.DA, h = DA.h;
  const labelFor = (answer, c) => DA.answerText(answer, c);
  const TONE_VARS = {
    yes: ["var(--da-yes)", "var(--da-yes-soft)"], partial: ["var(--da-partial)", "var(--da-partial-soft)"],
    no: ["var(--da-no)", "var(--da-no-soft)"], na: ["var(--da-na)", "var(--da-na-soft)"],
    flag: ["var(--da-gross)", "var(--da-gross-soft)"], pending: ["var(--da-line)", "var(--da-surface-2)"]
  };
  const toneStyle = (tone) => ({ "--lit": TONE_VARS[tone][0], "--lit-soft": TONE_VARS[tone][1] });
  function setTone(node, tone) { for (const [k, v] of Object.entries(toneStyle(tone))) node.style.setProperty(k, v); }

  DA.views.card = function mount(root, params) {
    const cardContext = DA.data.cardContext(params.id, params.query.evaluation);
    const conv = cardContext.conv;
    if (!conv) {
      root.append(h("div", { class: "da-page" }, h("div", { class: "da-empty" },
        h("h2", { tabindex: -1 }, "Такого обращения нет в базе"),
        h("p", {}, "Возможно, набор ещё не загружен."),
        DA.state.role === "reviewer" ? h("a", { class: "da-btn", href: "#/review" }, "Вернуться к очереди") : h("a", { class: "da-btn", href: "#/" }, "К списку обращений"))));
      return;
    }
    const cid = conv.conversation_id;
    const isCall = conv.channel === "voice call";
    let ev = cardContext.ev;
    const CL = () => (ev ? DA.checklist(ev.checklistVersion) : DA.activeChecklist());
    let openId = params.query.criterion || null;
    let running = !!ev && ["queued", "running"].includes(ev.status);
    let disposed = false, selectedTurn = null, loadError = null;
    const controller = new AbortController();
    /* Проверяющий видит карточку только для чтения: без переоценки и без новых апелляций. */
    const historyView = !!params.query.evaluation;
    const readOnly = DA.state.role === "reviewer" || historyView;
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
        const bubble = h("div", { class: "da-bubble" + (long ? " is-clamped" : ""), tabindex: 0, role: "button", "aria-pressed": "false",
          "aria-label": `Выделить реплику: ${DA.speakerLabel[t.speaker]}, ${DA.tx.clock(t.timestamp)}`,
          onclick: () => selectTurn(i), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectTurn(i); } } }, t.text);
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
      showCardPart("dialogue");
      markSelectedTurn(idx);
      setTone(n, tone || "yes");
      n.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      n.classList.remove("is-flash"); void n.offsetWidth; n.classList.add("is-flash");
      n.focus({ preventScroll: true });
    }
    function markSelectedTurn(idx) {
      selectedTurn = idx;
      turnNodes.forEach((node, i) => {
        node.classList.toggle("is-selected", i === selectedTurn);
        const bubble = node.querySelector(".da-bubble");
        if (bubble) bubble.setAttribute("aria-pressed", String(i === selectedTurn));
      });
    }
    function selectTurn(idx) {
      markSelectedTurn(selectedTurn === idx ? null : idx);
      const related = selectedTurn == null || !ev || ev.stale ? [] : ev.items.filter((item) => item.status === "done" && item.evidence.some((e) => e.turnIdx === selectedTurn));
      if (related.length) toggle(related[0].criterionId, true, false);
      else { openId = null; renderPanel(); focusCriterion(null); }
      hoverTurn(selectedTurn);
    }
    function hoverTurn(idx) {
      if (idx == null) idx = selectedTurn;
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
      totalNode = null;
      if (loadError) panel.append(h("div", { class: "da-card-error", role: "alert" },
        h("p", {}, loadError.message), h("button", { class: "da-btn is-sm", onclick: () => runEvaluation(ev && ["queued", "running"].includes(ev.status) ? "resume" : "start") }, "Повторить")));
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
      } else if (ev.status === "failed") {
        totalBox.append(h("div", { class: "da-total-live" }, "Оценка не завершена"), h("div", { class: "da-small da-muted" }, `Готово ${done} из ${ev.items.length} критериев. Ответы сохранены.`));
      } else if (ev.total == null) {
        totalBox.append(h("div", { class: "da-total-live" }, "Итог не рассчитывается"), h("div", { class: "da-small da-muted" }, "К этому разговору не применяется ни один критерий с баллами"));
      } else {
        totalNode = h("span", {}, DA.fmt.score(ev.total));
        if (ev.originalTotal !== ev.total) totalBox.append(h("div", { class: "da-total-was" }, h("s", {}, DA.fmt.score(ev.originalTotal)), "до апелляций"));
        totalBox.append(h("div", { class: "da-total" }, totalNode, h("small", {}, "из 100")));
      }
      const reviewCount = ev.items.filter((i) => i.needsReview && i.status === "done").length;
      top.append(h("div", { class: "da-total-row" }, totalBox,
        h("div", { class: "da-eval-meta" },
          h("span", {}, `По чек-листу версии ${ev.checklistVersion}`),
          ev.checklistVersion !== DA.activeChecklist().version ? h("span", {}, `Активна версия ${DA.activeChecklist().version}`) : null,
          h("span", {}, running ? "Модель читает диалог" : ev.status === "failed" ? "Часть критериев не оценена" : `Оценено ${DA.fmt.ago(ev.minutesAgo || 0)}${ev.durationSec != null ? ` за ${Math.max(1, Math.round(ev.durationSec))} с` : ""}`))));

      if (ev.grossFlagged) {
        const g = ev.items.find((i) => DA.criterionById(CL(), i.criterionId).type === "flag");
        top.append(h("div", { class: "da-gross-bar" }, DA.icon("flag"), "Грубая ошибка", g.explanation ? h("span", { style: { fontWeight: 400 } }, g.explanation) : null));
      }
      ribbon = DA.ribbon(itemsWithC(), {
        interactive: true,
        onHover: (id) => { const it = id && ev.items.find((x) => x.criterionId === id); if (!openId) focusCriterion(it || null); },
        onClick: (id) => toggle(id, true)
      });
      const excluded = naSummary();
      top.append(ribbon);
      if (excluded.count) {
        const points = Math.round(excluded.points);
        top.append(h("div", { class: "da-cr-note" }, excluded.all
          ? `${excluded.subject}. Применимых критериев с баллами нет.`
          : `${excluded.subject}, поэтому ${excluded.count === 1 ? "его" : "их"} ${points} ${DA.fmt.plural(points, ["балл распределён", "балла распределены", "баллов распределены"])} между остальными.`));
      }

      const decided = DA.state.appeals.filter((a) => a.conversationId === cid && (!a.evaluationId || a.evaluationId === ev.id) && a.status !== "open");
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
        const weighted = crits.some((c) => c.type !== "flag" && c.weight > 0);
        const sec = h("div", { class: "da-section da-cr-section" },
          h("div", { class: "da-cr-section-head" }, h("h3", {}, s.title),
            weighted && sr && !running ? h("span", {}, sr.max > 0 ? `${Math.round(sr.earned)} из ${Math.round(sr.max)}` : "не применяется") : null),
          weighted && sr && sr.max > 0 ? h("div", { class: "da-cr-section-bar", "aria-hidden": "true" }, h("i", { style: { width: `${Math.max(0, Math.min(100, sr.earned / sr.max * 100))}%` } })) : null);
        for (const c of crits) sec.append(critRow(c, opts));
        panel.append(sec);
      }
      indexEvidence();
      if (openId) {
        const it = ev.items.find((i) => i.criterionId === openId);
        it && it.status === "done" ? focusCriterion(it) : null;
      }
    }

    function naSummary() {
      const excluded = ev.items.filter((i) => i.status === "done" && i.answer === "na" && DA.criterionById(CL(), i.criterionId).type !== "flag");
      const weighted = CL().criteria.filter((c) => c.type !== "flag" && c.weight > 0);
      const totalWeight = weighted.reduce((sum, c) => sum + c.weight, 0);
      const weight = excluded.reduce((sum, i) => sum + DA.criterionById(CL(), i.criterionId).weight, 0);
      const count = excluded.length;
      const word = ["", "Один", "Два", "Три", "Четыре"][count] || String(count);
      return { count, totalWeight, points: totalWeight ? weight / totalWeight * 100 : 0, all: weighted.length === count,
        subject: `${word} ${DA.fmt.plural(count, ["критерий к этому разговору не относится", "критерия к этому разговору не относятся", "критериев к этому разговору не относятся"])}` };
    }

    function critRow(c, opts) {
      const it = ev.items.find((i) => i.criterionId === c.id);
      const isOpen = openId === c.id && it.status === "done";
      const tone = DA.tone(it.status === "done" ? it.answer : null, c);
      const node = h("div", { class: "da-crit da-cr-criterion" + (isOpen ? " is-open" : "") + (it.answer === "na" ? " is-na" : ""), "data-id": c.id });
      setTone(node, tone);
      critNodes.set(c.id, node);
      const appeal = it.appealId && DA.state.appeals.find((a) => a.id === it.appealId);

      const ready = it.status === "done";
      const points = ready && c.type !== "flag" && it.answer !== "na" ? Math.round(it.points) : null;
      const pts = points == null ? null : h("span", { class: "da-cr-points" + (points === 0 ? " is-zero" : "") }, points ? `+${points}` : "0");
      const marks = [];
      function mark(text, kind, explanation) {
        const badge = h("span", { class: `da-cr-mark is-${kind}` }, text);
        DA.hoverCard(badge, () => h("p", { class: "da-cr-tooltip" }, explanation));
        marks.push(badge);
      }
      if (appeal) {
        if (appeal.status === "open") mark("Оспорено", "appeal", "Аналитик не согласен с оценкой, решение за проверяющим");
        else mark("Пересмотрено", "reviewed", appeal.status === "changed"
          ? `Проверяющий изменил оценку: было ${labelFor(appeal.originalAnswer, c)}, стало ${labelFor(appeal.decision.newAnswer, c)}`
          : "Проверяющий подтвердил оценку после рассмотрения апелляции");
      }
      if (it.needsReview && ready) mark("Стоит проверить", "check", "Модель ответила по-разному при двух проверках, ответ стоит перепроверить");
      const maxWeight = Math.max(1, ...ev.items.map((item) => item.effectiveWeight || 0));
      const fraction = Math.max(0, Math.min(1, it.fraction || 0));
      const bar = c.type !== "flag" ? h("span", { class: "da-cr-track" + (it.answer === "na" ? " is-na" : ""), "aria-hidden": "true",
        style: { width: it.answer === "na" ? "100%" : `${(it.effectiveWeight || 0) / maxWeight * 100}%` } },
        h("i", { style: { width: `${ready ? fraction * 100 : 0}%` } })) : null;
      const pill = DA.answerPill(it.answer, c, null, it.status);
      if (opts.justDone === c.id) pill.classList.add("is-in");
      const row = h("button", { class: "da-cr-row", type: "button", "aria-expanded": String(isOpen), "aria-controls": `da-criterion-${c.id}`, disabled: !ready ? true : null },
        h("span", { class: "da-cr-title" }, h("span", {}, c.title), marks),
        h("span", { class: "da-cr-score" },
          it.status === "running" ? h("span", { class: "da-thinking" }, "Модель читает диалог") : null,
          pts, pill),
        bar);
      row.addEventListener("click", () => toggle(c.id));
      node.addEventListener("mouseenter", () => { if (!openId && it.status === "done") { focusCriterion(it); ribbon && ribbon.light(c.id); } });
      node.addEventListener("mouseleave", () => { if (!openId) focusCriterion(null); });
      node.append(row);

      if (it.status === "pending" && running) {
        node.querySelector(".da-cr-title").style.color = "var(--da-text-3)";
      }
      if (it.status === "failed") node.append(h("div", { class: "da-card-error" },
        h("p", {}, it.explanation || "Не удалось оценить этот критерий"),
        readOnly ? null : h("button", { class: "da-btn is-sm", disabled: running, onclick: () => runEvaluation(DA.mode === "server" ? "retry" : "start", c.id) }, "Повторить")));
      if (ready) {
        const reveal = h("div", { class: "da-cr-reveal", id: `da-criterion-${c.id}`, "aria-hidden": String(!isOpen) }, h("div", { class: "da-cr-inner" }, critBody(c, it, tone, appeal)));
        reveal.inert = !isOpen;
        node.append(reveal);
      }
      return node;
    }

    function critBody(c, it, tone, appeal) {
      const body = h("div", { class: "da-crit-body" });
      if (it.answer === "na") body.append(h("div", {}, h("div", { class: "da-label" }, "Почему не применимо"), h("p", {}, it.naReason || it.explanation)));
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
        body.append(h("div", {}, h("div", { class: "da-label" }, "Цитаты из разговора"), list));
      } else if (it.answer !== "na" && c.type !== "flag") body.append(h("p", { class: "da-small da-muted" }, "Модель не привела реплику"));
      if (it.checkedRange) {
        body.append(h("div", {}, h("button", { class: "da-turnchip", type: "button", onclick: () => jumpTo(it.checkedRange.fromIdx, tone) },
          `Проверенный участок ${DA.tx.clock(conv.transcript[it.checkedRange.fromIdx].timestamp)}–${DA.tx.clock(conv.transcript[it.checkedRange.toIdx].timestamp)}`)));
      }
      const excluded = naSummary();
      const basePoints = excluded.totalWeight ? c.weight / excluded.totalWeight * 100 : 0;
      const baseLabel = Number.isInteger(basePoints) ? basePoints : DA.fmt.score(basePoints);
      let calculation;
      if (c.type === "flag") calculation = "Нарушение отмечается отдельно и не меняет итоговый балл.";
      else if (it.answer === "na") calculation = excluded.all ? "Критерий не учитывается. В этом разговоре нет применимых критериев с баллами."
        : `Критерий не учитывается, его ${baseLabel} ${Number.isInteger(basePoints) ? DA.fmt.plural(basePoints, ["балл распределён", "балла распределены", "баллов распределены"]) : "балла распределены"} между остальными.`;
      else if (excluded.count) calculation = `Вес критерия ${c.weight} из ${excluded.totalWeight}. ${excluded.subject}, поэтому сейчас он стоит ${DA.fmt.score(it.effectiveWeight)} балла. Набрано ${DA.fmt.score(it.points)}.`;
      else calculation = `Вес критерия ${c.weight} из ${excluded.totalWeight}. Набрано ${DA.fmt.score(it.points)} из ${DA.fmt.score(it.effectiveWeight)}.`;
      body.append(h("div", {}, h("div", { class: "da-label" }, "Как посчитаны баллы"), h("p", {}, calculation)), ruleBlock(c, it));

      if (appeal) {
        if (appeal.status === "open") {
          body.append(h("div", { class: "da-appeal-state" },
            h("b", {}, "На рассмотрении у проверяющего"),
            h("span", {}, appeal.comment),
            readOnly ? h("div", {}, h("a", { class: "da-btn is-sm", style: { marginTop: "6px" }, href: `#/review/${appeal.id}` }, "Разобрать апелляцию")) : null));
        } else {
          body.append(h("div", { class: "da-appeal-state is-done" },
            h("b", {}, appeal.status === "changed" ? `Изменено проверяющим: было ${labelFor(appeal.originalAnswer, c)}, стало ${labelFor(appeal.decision.newAnswer, c)}` : "Оценка подтверждена проверяющим"),
            h("span", {}, appeal.decision.reason)));
        }
      } else if (!running && !readOnly && ev.status === "done") {
        body.append(h("div", { class: "da-crit-actions" },
          h("button", { class: "da-btn is-sm", onclick: (e) => appealDrawer(c, it, e.currentTarget) }, DA.icon("message"), "Оспорить оценку")));
      }
      return body;
    }

    function ruleBlock(c, it) {
      const box = h("div", { class: "da-rule" });
      const content = h("div", { hidden: true, style: { marginTop: "8px" } },
        h("p", { style: { margin: 0 } }, c.description),
        c.naAllowed ? h("p", { style: { margin: "6px 0 0" } }, `Критерий не применяется: ${c.naCondition}`) : null,
        c.scale ? h("ol", {}, c.scale.map((s) => h("li", { class: it.answer === s.value ? "is-picked" : "" }, h("b", {}, s.value), h("span", {}, s.description)))) : null);
      const btn = h("button", { class: "da-rule-toggle", type: "button", "aria-expanded": "false" }, DA.icon("chevron"), "Правило критерия");
      btn.addEventListener("click", () => {
        content.hidden = !content.hidden;
        btn.setAttribute("aria-expanded", String(!content.hidden));
      });
      box.append(btn, content);
      return box;
    }

    function toggle(id, fromRibbon, scroll = true) {
      const it = ev.items.find((i) => i.criterionId === id);
      if (!it || it.status !== "done") return;
      if (scroll) markSelectedTurn(null);
      openId = openId === id && !fromRibbon ? null : id;
      critNodes.forEach((node, criterionId) => {
        const isOpen = criterionId === openId;
        node.classList.toggle("is-open", isOpen);
        node.querySelector(".da-cr-row").setAttribute("aria-expanded", String(isOpen));
        const reveal = node.querySelector(".da-cr-reveal");
        if (reveal) { reveal.inert = !isOpen; reveal.setAttribute("aria-hidden", String(!isOpen)); }
      });
      focusCriterion(openId ? it : null);
      const node = critNodes.get(id);
      if (node && fromRibbon && scroll) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    /* ---------- Живая оценка: сохранённые частичные ответы из слоя данных ---------- */
    let operationPending = false;
    const evaluate = () => runEvaluation("start");
    async function runEvaluation(kind, criterionId) {
      if (operationPending || (readOnly && kind !== "resume")) return;
      operationPending = true;
      loadError = null;
      running = true;
      if (kind === "start") { openId = null; markSelectedTurn(null); focusCriterion(null); }
      setHeadBusy(true);
      showCardPart("evaluation");
      const onProgress = (next) => {
        if (disposed) return;
        const previousDone = new Set((ev?.items || []).filter((i) => i.status === "done").map((i) => i.criterionId));
        const justDone = next.items.find((i) => i.status === "done" && !previousDone.has(i.criterionId));
        ev = next;
        running = ["queued", "running"].includes(ev.status);
        renderPanel({ justDone: justDone?.criterionId });
      };
      const options = { signal: controller.signal, onProgress };
      try {
        const next = kind === "resume" ? await DA.data.watchEvaluation(ev.id, options)
          : kind === "retry" ? await DA.data.retryCriterion(ev.id, criterionId, options)
          : await DA.data.evaluate(cid, { ...options, checklistVersion: DA.activeChecklist().version, reuse: false });
        if (disposed) return;
        ev = next;
        running = false;
        renderPanel();
        if (totalNode && ev.status === "done" && kind !== "resume") DA.countTo(totalNode, 0, ev.total, 700);
      } catch (error) {
        if (disposed || error.name === "AbortError") return;
        loadError = error;
        running = false;
        renderPanel();
      } finally {
        operationPending = false;
        if (!disposed) setHeadBusy(false);
      }
    }

    /* ---------- Апелляция ---------- */
    function previewTotal(criterionId, answer) {
      const answers = Object.fromEntries(ev.items.map((i) => [i.criterionId, i.answer]));
      answers[criterionId] = answer;
      return DA.computeScores(CL(), answers).total;
    }
    function answerOptions(c, exclude) {
      return DA.allowedAnswers(c).filter((a) => a !== exclude).map((a) => ({ value: a, label: labelFor(a, c) }));
    }

    function appealDrawer(c, it, anchor) {
      let proposed = null;
      let submitting = false;
      const err = h("div", { class: "da-error", hidden: true });
      const ta = h("textarea", { class: "da-textarea", placeholder: "Например: оператор представился во втором сообщении" });
      const left = h("span", { class: "da-hint" });
      const prev = h("div", { class: "da-preview-total", hidden: true });
      const upd = () => {
        const n = ta.value.trim().length;
        left.textContent = n < 10 ? `Ещё ${10 - n} ${DA.fmt.plural(10 - n, ["символ", "символа", "символов"])}` : "";
        submit.disabled = submitting || n < 10;
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
      submit.addEventListener("click", async () => {
        if (submitting || ta.value.trim().length < 10) return;
        submitting = true;
        err.hidden = true;
        submit.classList.add("is-busy");
        upd();
        try {
          await DA.data.createAppeal(cid, c.id, ta.value.trim(), proposed);
          d.close();
          if (disposed) return;
          ev = DA.state.evaluations[cid];
          renderPanel();
          DA.toast("Апелляция отправлена проверяющему", critNodes.get(c.id) || anchor);
        } catch (error) {
          err.textContent = error.message;
          err.hidden = false;
        } finally {
          submitting = false;
          submit.classList.remove("is-busy");
          upd();
        }
      });
    }

    /* ---------- Шапка карточки ---------- */
    const evalBtn = h("button", { class: "da-btn", onclick: (e) => evaluate(e.currentTarget) }, DA.icon("refresh"), ev ? "Переоценить" : "Оценить");
    function setHeadBusy(b) { evalBtn.disabled = b; evalBtn.classList.toggle("is-busy", b); evalBtn.lastChild.textContent = b ? "Оценка идёт" : ev ? "Переоценить" : "Оценить"; }
    const initialPart = ev && !params.query.turn ? "evaluation" : "dialogue";
    const grid = h("div", { class: "da-card-grid", "data-part": initialPart }, transcript, panel);
    const cardTabs = DA.segmented([{ value: "dialogue", label: "Диалог" }, { value: "evaluation", label: "Оценка" }], initialPart, showCardPart, "Содержимое карточки");
    const tabs = h("div", { class: "da-card-tabs" }, cardTabs);
    function showCardPart(part) {
      grid.dataset.part = part;
      cardTabs.setValue(part);
    }
    const durSec = DA.tx.duration(conv);
    root.append(h("div", { class: "da-page" },
      DA.state.role === "reviewer" ? h("a", { class: "da-btn is-text is-sm", href: "#/review", style: { marginBottom: "8px" } }, DA.icon("back", 16), "Вернуться к очереди") : null,
      h("div", { class: "da-card-head" },
        readOnly ? null : h("a", { class: "da-back", href: "#/", "aria-label": "К списку обращений" }, DA.icon("back")),
        h("h1", { class: "da-h1", tabindex: -1, title: cid }, `Обращение № ${DA.convNumber(cid)}`),
        h("span", { class: "da-chip" }, DA.langLabel[conv.language]),
        h("span", { class: "da-chip" }, DA.icon(isCall ? "phone" : "message"), DA.channelLabel(conv)),
        h("span", { class: "da-muted da-small" }, `${DA.fmt.dateTime(DA.tx.startedAt(conv))}, длительность ${DA.fmt.duration(durSec)}`),
        readOnly ? null : h("div", { class: "da-card-actions" }, evalBtn)),
      historyView ? h("p", { class: "da-card-history" }, "Открыта сохранённая оценка. ", h("a", { href: `#/c/${encodeURIComponent(cid)}` }, "Перейти к текущему обращению")) : null,
      tabs, grid));

    renderPanel();
    setHeadBusy(running);
    if (running) runEvaluation("resume");
    if (params.query.turn) timers.push(setTimeout(() => jumpTo(+params.query.turn, "yes"), 200));
    if (openId) timers.push(setTimeout(() => { const n = critNodes.get(openId); n && n.scrollIntoView({ block: "nearest" }); }, 100));
    return () => { disposed = true; controller.abort(); timers.forEach(clearTimeout); };
  };
})();
