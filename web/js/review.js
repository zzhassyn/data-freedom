/* Рабочее место проверяющего: очередь апелляций слева, разбор одной апелляции справа, список решённых. */
(function () {
  const DA = window.DA, h = DA.h;
  const MIN_REASON = 10;
  const AROUND = 2;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Цвет ответа для подсветки реплик: те же переменные, что в карточке. */
  function paint(node, tone) {
    const k = tone === "flag" ? "gross" : tone;
    node.style.setProperty("--lit", `var(--da-${k})`);
    node.style.setProperty("--lit-soft", `var(--da-${k}-soft)`);
  }

  function waited(a) {
    const min = Math.max(0, Math.round((Date.now() - a.createdAt) / 60000));
    if (min < 1) return "только что";
    if (min < 60) return `${min} мин`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} ч`;
    const d = Math.round(hr / 24);
    return `${d} ${DA.fmt.plural(d, ["день", "дня", "дней"])}`;
  }

  /* Всё, что нужно для разбора: оценка, чек-лист той версии, по которой она сделана, критерий, обращение. */
  const context = (appeal) => DA.data.appealContext(appeal);
  const openQueue = () => DA.openAppeals().slice().sort((a, b) => a.createdAt - b.createdAt);
  const decidedToday = () => DA.state.appeals.filter((a) => a.decision && new Date(a.decision.decidedAt).toDateString() === new Date().toDateString()).length;

  function ribbonItems(cl, answers, scores) {
    return cl.criteria.map((c) => ({ c, answer: answers[c.id], status: "done", ...scores.items[c.id] }));
  }

  /* ---------- Фрагмент диалога ---------- */
  function fragment(conv, item, tone) {
    const t = conv.transcript;
    const gaps = DA.tx.gaps(conv);
    const firstOp = DA.tx.firstOperatorIdx(conv);
    const evidence = new Map(item.evidence.map((e) => [e.turnIdx, e]));
    const anchors = [...evidence.keys()];
    if (!anchors.length && item.checkedRange) anchors.push(item.checkedRange.fromIdx, item.checkedRange.toIdx);
    const shown = new Set();
    for (const k of anchors) for (let j = k - AROUND; j <= k + AROUND; j++) if (j >= 0 && j < t.length) shown.add(j);
    let full = false, opinionFocus = null;

    const box = h("div", { class: "da-turns rv-turns" });
    const toggle = h("button", { class: "da-btn is-sm", type: "button", onclick: () => { full = !full; render(true); } });
    const isCall = conv.channel === "voice call";
    const audioHref = DA.audioHref(conv);
    const listen = isCall && audioHref ? h("a", { class: "da-btn is-sm is-text", href: audioHref, target: "_blank", rel: "noopener noreferrer" }, DA.icon("play", 16), "Слушать запись") : null;

    function bubbleText(text, quote) {
      const k = quote ? text.indexOf(quote) : -1;
      if (k < 0) return text;
      return [text.slice(0, k), h("mark", { class: "rv-mark" }, quote), text.slice(k + quote.length)];
    }
    function turnNode(i) {
      const turn = t[i], ev = evidence.get(i), focused = opinionFocus?.index === i;
      let node;
      if (turn.speaker === "system") {
        const kind = DA.tx.systemKind(turn.text);
        const ic = { verified: "check", escalate: "escalate", closed: "x", hold: "pause" }[kind];
        node = h("div", { class: `da-sys k-${kind}` }, h("span", {}, ic ? DA.icon(ic) : null, h("span", {}, turn.text), h("time", {}, DA.tx.clock(turn.timestamp))));
      } else {
        const long = turn.speaker === "bot" && turn.text.length > 220 && !ev && !focused;
        const bubble = h("div", { class: "da-bubble" + (long ? " is-clamped" : "") }, bubbleText(turn.text, focused ? opinionFocus.quote : ev && ev.quote));
        node = h("div", { class: `da-turn r-${turn.speaker}` },
          h("div", { class: "da-turn-meta" },
            h("b", {}, DA.speakerLabel[turn.speaker]), h("time", {}, DA.tx.clock(turn.timestamp)),
            i === firstOp ? h("span", { class: "da-first" }, "Первый ответ оператора") : null,
            ev && ev.kind === "expected_here" ? h("span", { class: "rv-expected" }, "Здесь ожидалось действие") : null),
          bubble,
          long ? h("button", { class: "da-more", type: "button", onclick: (e) => { bubble.classList.toggle("is-clamped"); e.target.textContent = bubble.classList.contains("is-clamped") ? "Показать полностью" : "Свернуть"; } }, "Показать полностью") : null);
      }
      if (ev) { node.classList.add("is-lit"); paint(node, tone); }
      node.dataset.turnIdx = turn.idx ?? i;
      node.setAttribute("tabindex", "-1");
      if (focused) { node.classList.add("is-lit", "rv-opinion-focus"); paint(node, opinionFocus.tone); }
      return node;
    }
    function skipNode(from, to) {
      const n = to - from;
      return h("button", { class: "rv-skip", type: "button", onclick: () => { for (let j = from; j < to; j++) shown.add(j); render(true, from, to); } },
        `Показать ${n} ${DA.fmt.plural(n, ["реплику", "реплики", "реплик"])}`);
    }
    /* Скрытые участки сворачиваются в кнопку, раскрытые реплики появляются на её месте. */
    function render(animate, from, to) {
      const nodes = [];
      for (let i = 0; i < t.length;) {
        if (full || shown.has(i)) {
          if (gaps[i]) nodes.push(h("div", { class: "da-gap" + (gaps[i] >= 180 ? " is-long" : "") }, DA.icon("clock"), `Ожидание ответа ${DA.fmt.duration(gaps[i])}`));
          const node = turnNode(i);
          if (animate && (from == null || (i >= from && i < to)) && !evidence.has(i)) node.classList.add("rv-in");
          nodes.push(node);
          i++;
          continue;
        }
        let j = i;
        while (j < t.length && !shown.has(j)) j++;
        if (anchors.length) nodes.push(skipNode(i, j));
        i = j;
      }
      if (!anchors.length && !full) nodes.push(h("p", { class: "rv-note" }, "Модель не сослалась на реплики. Откройте весь диалог, чтобы проверить ответ."));
      box.replaceChildren(...nodes);
      toggle.textContent = full ? "Показать только фрагмент" : "Показать весь диалог";
      toggle.setAttribute("aria-expanded", String(full));
    }
    render(false);
    const panel = h("section", { class: "rv-panel rv-dialog", "aria-label": "Фрагмент диалога" },
      h("div", { class: "rv-panel-head" }, h("h2", { class: "rv-h2" }, "Фрагмент диалога"), h("div", { class: "rv-panel-actions" }, listen, toggle)),
      box);
    /* Ссылка повторного мнения раскрывает нужный участок того же снимка диалога. */
    panel.jumpTo = function (entry, nextTone) {
      const index = t.findIndex((turn, i) => (turn.idx ?? i) === entry.turnIdx);
      if (index < 0) return;
      opinionFocus = { index, quote: entry.quote, tone: nextTone };
      for (let i = Math.max(0, index - AROUND); i <= Math.min(t.length - 1, index + AROUND); i++) shown.add(i);
      render(false);
      const target = [...box.querySelectorAll("[data-turn-idx]")].find((node) => Number(node.dataset.turnIdx) === entry.turnIdx);
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
      target.focus({ preventScroll: true });
    };
    return panel;
  }

  /* ---------- Правило критерия ---------- */
  function ruleBlock(c, modelAnswer) {
    const steps = c.scale ? c.scale.map((s) => h("li", { class: s.value === modelAnswer ? "is-picked" : "", "data-value": s.value },
      h("b", {}, s.value), h("span", {}, s.description), s.value === modelAnswer ? h("small", {}, "ответ модели") : null)) : [];
    const node = h("section", { class: "rv-panel is-quiet rv-rule", "aria-label": "Правило критерия" },
      h("h2", { class: "rv-h2" }, "Правило критерия"),
      h("p", {}, c.description),
      c.naAllowed ? h("p", { class: "rv-na" }, h("b", {}, "Критерий не применяется. "), c.naCondition) : null,
      steps.length ? h("ol", { class: "rv-scale" }, steps) : null);
    node.mark = (value) => steps.forEach((li) => li.classList.toggle("is-new", value != null && +li.dataset.value === value && value !== modelAnswer));
    return node;
  }

  /* ---------- Спор: оценка модели и апелляция аналитика ---------- */
  function disputeBlock(appeal, c, item) {
    const shown = appeal.status === "changed" && item.original ? item.original : item;
    const answer = appeal.originalAnswer;
    return h("section", { class: "rv-panel rv-dispute" },
      h("div", { class: "rv-side" },
        h("h2", { class: "rv-h2" }, "Оценка модели"),
        h("div", { class: "rv-answer" }, DA.answerPill(answer, c),
          c.type !== "flag" && answer !== "na" ? h("span", { class: "da-small da-muted" }, `${Math.round(shown.points)} из ${Math.round(shown.effectiveWeight)} баллов`) : null),
        h("p", {}, answer === "na" ? item.naReason : item.explanation || "Модель не оставила объяснения."),
        item.needsReview ? h("p", { class: "rv-warn" }, DA.icon("alert", 15), "При двух проверках модель ответила по-разному") : null),
      h("div", { class: "rv-side" },
        h("h2", { class: "rv-h2" }, "Апелляция аналитика"),
        appeal.proposedAnswer != null ? h("div", { class: "rv-answer" }, h("span", { class: "da-small da-muted" }, "Предлагает"), DA.answerPill(appeal.proposedAnswer, c)) : null,
        h("p", { class: "rv-comment" }, appeal.comment),
        h("span", { class: "da-small da-muted" }, `Подана ${DA.fmt.dateTime(appeal.createdAt).toLowerCase()}`)));
  }

  /* Повторная проверка помогает человеку выбрать ответ, но не принимает решение. */
  function secondOpinionBlock(appeal, c, conv, hooks) {
    if (!DA.backendAvailable || (appeal.status !== "open" && !appeal.secondOpinion)) return null;
    const node = h("section", { class: "rv-side rv-opinion", "aria-label": "Повторная проверка" });
    const controller = new AbortController();
    let opinion = appeal.secondOpinion || null, busy = false, disposed = false, error = "", returnFocus = false;
    function render() {
      node.setAttribute("aria-busy", String(busy));
      if (busy) {
        node.replaceChildren(h("p", { class: "da-thinking rv-opinion-pending", role: "status" }, "Модель перечитывает разговор с учётом комментария"));
        return;
      }
      if (!opinion) {
        const button = h("button", { class: "da-btn is-sm rv-opinion-request", type: "button", onclick: request }, DA.icon("refresh", 16), error ? "Повторить перепроверку" : "Попросить модель перепроверить");
        node.replaceChildren(...[error ? h("p", { class: "da-error rv-opinion-error", role: "alert" }, error) : null, button].filter(Boolean));
        if (returnFocus && document.activeElement === document.body) button.focus({ preventScroll: true });
        return;
      }
      const heading = h("h2", { class: "rv-h2", tabindex: -1 }, "Модель после перепроверки");
      const quotes = (opinion.evidence || []).map((entry) => {
        const turn = conv.transcript.find((item, index) => (item.idx ?? index) === entry.turnIdx);
        if (!turn || !entry.quote || !turn.text.includes(entry.quote)) return null;
        return h("button", { class: "rv-opinion-quote", type: "button", onclick: () => hooks.jump(entry, DA.tone(opinion.answer, c)) },
          h("span", { class: "rv-opinion-quote-text" }, entry.quote),
          h("span", { class: "rv-opinion-quote-meta" }, `${DA.speakerLabel[turn.speaker]}, ${DA.tx.clock(turn.timestamp)}`, h("span", {}, "К реплике", DA.icon("chevron", 13))));
      });
      node.replaceChildren(heading,
        h("div", { class: "rv-answer" }, DA.answerPill(opinion.answer, c), h("span", { class: "rv-opinion-verdict" + (opinion.agreesWithAppeal ? " is-agree" : ""), role: "status" }, opinion.agreesWithAppeal ? "Согласна с аналитиком" : "Остаётся при своей оценке")),
        h("p", { class: "rv-opinion-explanation" }, opinion.explanation || "Модель не оставила объяснения."),
        h("div", { class: "rv-opinion-evidence" }, quotes));
      if (returnFocus && document.activeElement === document.body) heading.focus({ preventScroll: true });
    }
    async function request() {
      if (busy || disposed || opinion) return;
      returnFocus = node.contains(document.activeElement);
      busy = true; error = ""; render();
      try {
        const result = await DA.data.secondOpinion(appeal.id, { signal: controller.signal });
        if (disposed) return;
        opinion = result; appeal.secondOpinion = result;
        if (result.agreesWithAppeal) hooks.prefill(result.answer);
      } catch (e) {
        if (!disposed && e.name !== "AbortError") error = e.message || "Модель не смогла перепроверить критерий. Попробуйте ещё раз";
      } finally { busy = false; if (!disposed) render(); }
    }
    if (opinion?.agreesWithAppeal) hooks.prefill(opinion.answer);
    render();
    return { node, dispose() { disposed = true; controller.abort(); } };
  }

  /* ---------- Предпросмотр итога ---------- */
  function preview(ev, cl, c) {
    const answers = Object.fromEntries(ev.items.map((i) => [i.criterionId, i.answer]));
    const now = DA.computeScores(cl, answers);
    const label = h("span", { class: "rv-total-label" });
    const before = h("span", {}, DA.fmt.score(ev.total));
    const arrow = h("span", { class: "rv-arrow", "aria-hidden": "true" }, "→");
    const after = h("span", { class: "rv-after" }, DA.fmt.score(ev.total));
    const line = h("div", { class: "rv-total-line" }, label, h("div", { class: "rv-total" }, before, arrow, after));
    const ribbonBefore = DA.ribbon(ribbonItems(cl, answers, now));
    const ribbonAfter = DA.ribbon(ribbonItems(cl, answers, now));
    for (const r of [ribbonBefore, ribbonAfter]) { const s = r.querySelector(`[data-id="${c.id}"]`); s && s.classList.add("is-changed"); }
    const afterRow = h("div", { class: "rv-reveal" }, h("div", {}, h("div", { class: "rv-ribbon-row" }, h("span", {}, "Стало"), ribbonAfter)));
    const node = h("div", { class: "rv-preview", "aria-live": "polite" }, line,
      h("div", { class: "rv-ribbons" }, h("div", { class: "rv-ribbon-row" }, h("span", {}, "Было"), ribbonBefore), afterRow));
    let shownAfter = ev.total;

    node.update = function (action, newAnswer) {
      const changing = action === "change" && newAnswer != null;
      node.classList.toggle("is-change", changing);
      afterRow.classList.toggle("is-on", changing);
      afterRow.inert = !changing;
      label.textContent = changing ? "Итог" : action === "confirm" ? "Итог не изменится" : "Итог сейчас";
      if (!changing) return;
      const next = { ...answers, [c.id]: newAnswer };
      const r = DA.computeScores(cl, next);
      ribbonAfter.update(ribbonItems(cl, next, r));
      after.classList.toggle("is-up", r.total > ev.total);
      after.classList.toggle("is-down", r.total < ev.total);
      DA.countTo(after, shownAfter, r.total, 420);
      shownAfter = r.total;
    };
    /* После сохранения: старый итог зачёркнут, новый отсчитывается к своему значению. */
    node.settle = function (from, result, changed) {
      const to = result.total;
      label.textContent = changed ? "Итог пересчитан" : from !== to ? "Итог после решения" : "Итог не изменился";
      before.textContent = DA.fmt.score(from);
      before.classList.toggle("rv-was", from !== to);
      node.classList.toggle("is-change", changed || from !== to);
      ribbonAfter.update(result.items.map((i) => ({ ...i, c: DA.criterionById(cl, i.criterionId) })));
      arrow.hidden = true;
      after.hidden = from === to;
      if (!after.hidden) DA.countTo(after, from, to, 700);
    };
    node.update(null, null);
    return node;
  }

  /* ---------- Решение ---------- */
  function decisionBlock(appeal, ctx, hooks) {
    const { ev, cl, c, item } = ctx;
    const modelAnswer = item.answer;
    const options = DA.allowedAnswers(c).filter((a) => a !== modelAnswer);
    let action = null, busy = false, committed = false, disposed = false, answerTouched = false;
    let newAnswer = options.includes(appeal.proposedAnswer) ? appeal.proposedAnswer : null;

    const choice = (value, icon, title, sub) => h("button", { class: "rv-option", type: "button", role: "radio", "aria-checked": "false", "data-value": value, onclick: () => choose(value) },
      h("span", { class: "rv-option-icon" }, DA.icon(icon)), h("span", { class: "rv-option-text" }, h("b", {}, title), h("small", {}, sub)));
    const optConfirm = choice("confirm", "check", "Оценка верна", "Ответ модели остаётся");
    const optChange = choice("change", "refresh", "Изменить оценку", "Поставить другой ответ");
    const optionsBox = h("div", { class: "rv-options", role: "radiogroup", "aria-label": "Решение" }, optConfirm, optChange);

    const seg = DA.segmented(options.map((a) => ({ value: a, label: DA.answerText(a, c) })), newAnswer, (v) => { if (!busy && !committed) { answerTouched = true; newAnswer = v; refresh(); } }, "Новый ответ");
    const suggestion = h("span", { class: "da-hint", hidden: appeal.proposedAnswer == null }, appeal.proposedAnswer != null ? `Аналитик предложил «${DA.answerText(appeal.proposedAnswer, c)}»` : "");
    const changeBox = h("div", { class: "rv-reveal" }, h("div", {}, h("div", { class: "rv-new" },
      h("span", { class: "rv-label" }, "Новый ответ"), seg,
      suggestion)));
    changeBox.inert = true;

    const reason = h("textarea", { class: "da-textarea", id: "rv-reason", placeholder: "Коротко объясните решение, его увидит аналитик" });
    const left = h("span", { class: "da-hint rv-left" });
    reason.addEventListener("input", refresh);
    const field = h("div", { class: "da-field" }, h("label", { for: "rv-reason" }, "Причина решения"), reason, left);

    const prev = preview(ev, cl, c);
    const saveBtn = h("button", { class: "da-btn is-primary rv-save", type: "button", disabled: true, onclick: () => save() }, "Сохранить решение");
    const error = h("p", { class: "da-error rv-save-error", role: "alert", hidden: true });
    const showDecision = h("button", { class: "da-btn is-text is-sm", type: "button", hidden: true, onclick: () => DA.route() }, "Открыть принятое решение");
    const keys = h("p", { class: "rv-keys" }, h("kbd", {}, "1"), " оценка верна, ", h("kbd", {}, "2"), " изменить оценку, ", h("kbd", {}, "Ctrl"), "+", h("kbd", {}, "Enter"), " сохранить решение");
    const foot = h("div", { class: "rv-foot" }, error, showDecision, saveBtn, keys);

    const node = h("section", { class: "rv-decide", "aria-label": "Решение" },
      h("h2", { class: "rv-h2" }, "Решение"), optionsBox, changeBox, field, prev, foot);

    function ready() {
      return !busy && !committed && !disposed && action != null && reason.value.trim().length >= MIN_REASON && (action === "confirm" || newAnswer != null);
    }
    function choose(value, fromKey) {
      if (busy || committed || disposed) return;
      action = value;
      [optConfirm, optChange].forEach((b) => b.setAttribute("aria-checked", String(b.dataset.value === value)));
      changeBox.classList.toggle("is-on", value === "change");
      changeBox.inert = value !== "change";
      refresh();
      if (fromKey && !reason.value.trim()) reason.focus({ preventScroll: true });
    }
    function refresh() {
      const n = reason.value.trim().length;
      left.textContent = n < MIN_REASON ? `Ещё ${MIN_REASON - n} ${DA.fmt.plural(MIN_REASON - n, ["символ", "символа", "символов"])}` : "";
      prev.update(action, action === "change" ? newAnswer : null);
      hooks.rule.mark(action === "change" ? newAnswer : null);
      saveBtn.disabled = !ready();
    }
    /* Ctrl+Enter до заполнения показывает, чего не хватает. */
    function nudge() {
      if (busy || committed || disposed) return;
      const target = action == null ? optionsBox : action === "change" && newAnswer == null ? seg : left;
      target.classList.remove("rv-nudge"); void target.offsetWidth; target.classList.add("rv-nudge");
      if (target === left) reason.focus();
    }
    async function save() {
      if (!ready()) return;
      const before = ev.total, submittedAction = action, submittedAnswer = action === "change" ? newAnswer : null;
      const submittedReason = reason.value.trim();
      busy = true;
      error.hidden = true; showDecision.hidden = true;
      node.setAttribute("aria-busy", "true");
      saveBtn.disabled = true; saveBtn.classList.add("is-busy");
      [optionsBox, changeBox, field].forEach((x) => (x.inert = true));
      try {
        const result = await DA.data.decideAppeal(appeal.id, submittedAction, submittedAnswer, submittedReason);
        Object.assign(appeal, result.appeal);
        Object.assign(ev, result.evaluation);
        committed = true;
        const changed = result.appeal.decision.action === "change";
        if (!disposed) {
          node.classList.add("is-saved");
          prev.settle(before, result.evaluation, changed);
          foot.replaceChildren(h("div", { class: "rv-saved", role: "status" }, h("span", { class: "rv-saved-icon" }, DA.icon("check")),
            changed ? "Решение сохранено, оценка изменена" : "Решение сохранено, оценка подтверждена"));
          hooks.saved(result.appeal.decision.action, result.appeal.decision.newAnswer);
        } else hooks.updated();
      } catch (e) {
        if (!disposed) {
          error.textContent = e instanceof DA.ApiError ? e.message : "Не удалось сохранить решение. Причина осталась в форме, повторите сохранение";
          error.hidden = false;
          showDecision.hidden = e.code !== "appeal_decided";
        }
      } finally {
        busy = false;
        node.removeAttribute("aria-busy");
        saveBtn.classList.remove("is-busy");
        if (!committed && !disposed) {
          optionsBox.inert = field.inert = false;
          changeBox.inert = action !== "change";
          refresh();
        }
      }
    }
    refresh();
    function prefill(answer) {
      if (busy || committed || disposed || answerTouched || !options.includes(answer)) return;
      newAnswer = answer; seg.setValue(answer);
      suggestion.textContent = `После перепроверки модель предлагает «${DA.answerText(answer, c)}»`;
      suggestion.hidden = false;
      refresh();
    }
    return { node, ready, save, nudge, choose, prefill, dispose: () => { disposed = true; } };
  }

  /* Решение по апелляции, которая уже закрыта: вместо формы итог разбора. */
  function outcomeBlock(appeal, c) {
    const changed = appeal.status === "changed";
    return h("section", { class: "rv-decide is-done", "aria-label": "Решение" },
      h("h2", { class: "rv-h2" }, "Решение принято"),
      h("div", { class: "rv-answer" },
        changed ? [DA.answerPill(appeal.originalAnswer, c), h("span", { class: "rv-arrow" }, "→"), DA.answerPill(appeal.decision.newAnswer, c)]
          : [DA.answerPill(appeal.originalAnswer, c), h("span", { class: "da-small da-muted" }, "оценка подтверждена")]),
      h("p", { class: "rv-comment" }, appeal.decision.reason),
      h("div", { class: "rv-total-line" }, h("span", { class: "rv-total-label" }, changed ? "Итог" : "Итог не изменился"),
        h("div", { class: "rv-total" }, changed && appeal.totalBefore !== appeal.totalAfter ? [h("span", { class: "rv-was" }, DA.fmt.score(appeal.totalBefore)), " "] : null, DA.fmt.score(appeal.totalAfter))),
      h("span", { class: "da-small da-muted" }, DA.fmt.dateTime(appeal.decision.decidedAt)));
  }

  /* ---------- Рабочая область одной апелляции ---------- */
  function workspace(appeal, onSaved) {
    const ctx = context(appeal);
    const { c, item, conv } = ctx;
    const isOpen = appeal.status === "open";
    const tone = DA.tone(appeal.originalAnswer, c);
    const pillBox = h("div", { class: "rv-pills", "aria-label": "Ответ модели" }, DA.answerPill(appeal.originalAnswer, c));
    const head = h("header", { class: "rv-head" },
      h("div", { class: "rv-head-meta" },
        h("a", { class: "rv-conv", href: `#/c/${encodeURIComponent(conv.conversation_id)}?${new URLSearchParams({ criterion: c.id, evaluation: ctx.ev.id })}`, title: "Открыть карточку обращения" }, `Обращение № ${DA.convNumber(conv.conversation_id)}`),
        h("span", { class: "da-chip" }, DA.langLabel[conv.language]),
        h("span", { class: "da-chip" }, DA.icon(conv.channel === "voice call" ? "phone" : "message"), DA.channelLabel(conv)),
        h("span", { class: "da-small da-muted" }, isOpen ? `Ждёт решения ${waited(appeal)}` : "Апелляция разобрана")),
      h("div", { class: "rv-head-title" }, h("h1", { class: "rv-h1", tabindex: -1 }, c.title), pillBox));

    const rule = ruleBlock(c, appeal.originalAnswer);
    let decision = null;
    if (isOpen) {
      decision = decisionBlock(appeal, ctx, {
        rule,
        updated: () => onSaved(appeal),
        saved(action, newAnswer) {
          const old = pillBox.firstChild;
          if (action === "change") {
            old.classList.add("is-struck");
            const fresh = DA.answerPill(newAnswer, c);
            fresh.classList.add("rv-pill-in");
            pillBox.append(fresh);
          } else pillBox.append(h("span", { class: "rv-stamp rv-pill-in" }, DA.icon("check", 14), "Подтверждено"));
          onSaved(appeal);
        }
      });
    }
    const dialogue = fragment(conv, item, tone), dispute = disputeBlock(appeal, c, item);
    const opinion = secondOpinionBlock(appeal, c, conv, {
      jump: (entry, nextTone) => dialogue.jumpTo(entry, nextTone),
      prefill: (answer) => decision?.prefill(answer)
    });
    if (opinion) dispute.append(opinion.node);
    const node = h("article", { class: "rv-work", "data-id": appeal.id }, head,
      h("div", { class: "rv-body" },
        h("div", { class: "rv-col" }, dialogue, rule),
        h("div", { class: "rv-col" }, dispute, decision ? decision.node : outcomeBlock(appeal, c))));
    node.decision = decision;
    node.dispose = () => { decision?.dispose(); opinion?.dispose(); };
    return node;
  }

  /* ---------- Очередь ---------- */
  DA.views.review = function mount(root, params) {
    const timers = [];
    let current = null, work = null, disposed = false, stageVersion = 0;

    const count = h("span", { class: "da-count" });
    const list = h("div", { class: "rv-q-list" });
    const queue = h("nav", { class: "rv-queue", "aria-label": "Открытые апелляции" },
      h("div", { class: "rv-queue-head" }, h("span", {}, "Открытые апелляции"), count), list);
    const stage = h("div", { class: "rv-stage" });
    const page = h("div", { class: "rv" }, queue, stage);
    root.append(page);

    function queueItem(a) {
      const { c } = context(a);
      return h("a", {
        class: "rv-q-item", href: `#/review/${a.id}`, "data-id": a.id, "aria-current": a.id === current ? "true" : null,
        onclick: (e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
          e.preventDefault();
          if (a.id === current) return;
          history.pushState(null, "", `#/review/${a.id}`);
          select(a.id, "swap");
        }
      },
      h("span", { class: "rv-q-num" }, `№ ${DA.convNumber(a.conversationId)}`),
      h("span", { class: "rv-q-wait", title: "Сколько апелляция ждёт решения" }, waited(a)),
      h("span", { class: "rv-q-crit" }, c.title));
    }
    function renderQueue() {
      const items = openQueue();
      count.textContent = items.length;
      count.hidden = !items.length;
      const existing = new Map([...list.children].map((n) => [n.dataset.id, n]));
      list.replaceChildren(...items.map((a) => existing.get(a.id) || queueItem(a)));
      [...list.children].forEach((n) => (n.dataset.id === current ? n.setAttribute("aria-current", "true") : n.removeAttribute("aria-current")));
      page.classList.toggle("has-queue", items.length > 0);
    }

    function emptyState() {
      const n = decidedToday();
      return h("div", { class: "rv-empty" },
        h("span", { class: "rv-empty-mark", "aria-hidden": "true" }, DA.icon("check")),
        h("h1", { class: "da-h1", tabindex: -1 }, "Все апелляции разобраны"),
        h("p", {}, n ? `Сегодня ${DA.fmt.plural(n, ["решена", "решено", "решено"])} ${n} ${DA.fmt.plural(n, ["апелляция", "апелляции", "апелляций"])}. Новые появятся здесь, как только аналитик оспорит оценку.` : "Новые появятся здесь, как только аналитик оспорит оценку."),
        h("a", { class: "da-btn", href: "#/review/done" }, "Открыть решённые"));
    }
    function notFound() {
      return h("div", { class: "rv-empty" },
        h("h1", { class: "da-h1", tabindex: -1 }, "Такой апелляции нет"),
        h("p", {}, "Возможно, обращение оценили заново и апелляция закрылась вместе со старой оценкой."),
        h("a", { class: "da-btn", href: "#/review" }, "Вернуться к очереди"));
    }

    /* Смена содержимого справа: старое уходит вверх, новое приходит снизу. */
    function swap(next) {
      const version = ++stageVersion;
      const prev = stage.firstElementChild;
      if (!prev || reduced()) { stage.replaceChildren(next); return; }
      prev.classList.add("rv-out");
      timers.push(setTimeout(() => {
        if (disposed || version !== stageVersion) return;
        stage.replaceChildren(next);
        next.classList.add("rv-enter");
        window.scrollTo({ top: 0 });
      }, 180));
    }
    function select(id, how) {
      work?.dispose();
      const appeal = DA.state.appeals.find((a) => a.id === id);
      current = appeal ? appeal.id : null;
      renderQueue();
      work = appeal ? workspace(appeal, saved) : null;
      const next = work || notFound();
      if (how === "swap") swap(next); else { stageVersion++; stage.replaceChildren(next); }
      if (how === "swap") timers.push(setTimeout(() => { const t = next.isConnected && next.querySelector("h1"); t && t.focus({ preventScroll: true }); }, 200));
    }

    /* После сохранения: апелляция уходит из очереди, через секунду открывается следующая. */
    function saved(appeal) {
      if (disposed) return;
      if (current !== appeal.id) { renderQueue(); return; }
      count.textContent = DA.openAppeals().length;
      count.hidden = !DA.openAppeals().length;
      timers.push(setTimeout(() => {
        if (disposed || current !== appeal.id) { if (!disposed) renderQueue(); return; }
        const node = list.querySelector(`[data-id="${appeal.id}"]`);
        if (node && !reduced()) {
          node.style.height = node.offsetHeight + "px";
          node.classList.add("rv-q-leave");
        }
        timers.push(setTimeout(() => {
          if (disposed || current !== appeal.id) { if (!disposed) renderQueue(); return; }
          const rest = openQueue();
          if (rest.length) {
            history.replaceState(null, "", `#/review/${rest[0].id}`);
            select(rest[0].id, "swap");
          } else {
            history.replaceState(null, "", "#/review");
            current = null;
            work?.dispose();
            work = null;
            renderQueue();
            swap(emptyState());
          }
        }, reduced() ? 0 : 260));
      }, 1100));
    }

    function onKey(e) {
      const d = work && work.decision;
      if (!d || (work.querySelector(".rv-decide.is-saved"))) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        d.ready() ? d.save() : d.nudge();
        return;
      }
      const typing = /^(TEXTAREA|INPUT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "1" && e.key !== "2") return;
      e.preventDefault();
      d.choose(e.key === "1" ? "confirm" : "change", true);
    }
    document.addEventListener("keydown", onKey);

    /* Время ожидания в очереди идёт само. */
    const tick = setInterval(() => {
      for (const n of list.children) {
        const a = DA.state.appeals.find((x) => x.id === n.dataset.id);
        if (a) n.querySelector(".rv-q-wait").textContent = waited(a);
      }
    }, 30000);

    const first = openQueue()[0];
    if (params.id) select(params.id);
    else if (first) {
      history.replaceState(null, "", `#/review/${first.id}`);
      select(first.id);
    } else {
      renderQueue();
      stage.replaceChildren(emptyState());
    }

    return () => {
      disposed = true;
      work?.dispose();
      timers.forEach(clearTimeout);
      clearInterval(tick);
      document.removeEventListener("keydown", onKey);
    };
  };

  /* ---------- Решённые ---------- */
  DA.views.reviewDone = function mount(root) {
    const done = DA.state.appeals.filter((a) => a.status !== "open").sort((a, b) => b.decision.decidedAt - a.decision.decidedAt);
    const list = h("div", { class: "da-list" });
    if (done.length) list.append(...done.map((a) => DA.appealRow(a, { comment: false })));
    else list.append(h("div", { class: "da-empty" },
      h("h2", {}, "Решённых апелляций пока нет"),
      h("p", {}, "Здесь появится каждое решение с причиной и новым итогом."),
      h("a", { class: "da-btn", href: "#/review" }, "Вернуться к очереди")));
    root.append(h("div", { class: "da-page", style: { maxWidth: "1040px" } },
      h("div", { class: "da-page-head" },
        h("h1", { class: "da-h1", tabindex: -1 }, "Решённые"),
        done.length ? h("span", { class: "da-muted" }, `${done.length} ${DA.fmt.plural(done.length, ["решение", "решения", "решений"])}, сегодня ${decidedToday()}`) : null),
      list));
  };
})();
