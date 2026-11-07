/* Рабочее место проверяющего: очередь апелляций слева, разбор одной апелляции справа, список решённых. */
(function () {
  const DA = window.DA, h = DA.h;
  const m = (key, params) => DA.msg("review." + key, params);
  const t = (key, params) => DA.t("review." + key, params);
  DA.i18n.addMessages({
    "review.justNow": { ru: "только что", kk: "жаңа ғана", en: "just now" },
    "review.minutes": { ru: "{count} мин", kk: "{count} мин", en: "{count} min" },
    "review.hours": { ru: "{count} ч", kk: "{count} сағ", en: "{count} hr" },
    "review.days": { ru: { one: "{count} день", few: "{count} дня", many: "{count} дней", other: "{count} дня" }, kk: "{count} күн", en: { one: "{count} day", other: "{count} days" } },
    "review.listen": { ru: "Слушать запись", kk: "Жазбаны тыңдау", en: "Listen to recording" },
    "review.firstReply": { ru: "Первый ответ оператора", kk: "Оператордың алғашқы жауабы", en: "First agent reply" },
    "review.expectedHere": { ru: "Здесь ожидалось действие", kk: "Әрекет осы жерде күтілді", en: "Action expected here" },
    "review.expand": { ru: "Показать полностью", kk: "Толық көрсету", en: "Show in full" },
    "review.collapse": { ru: "Свернуть", kk: "Жинау", en: "Collapse" },
    "review.showTurns": { ru: { one: "Показать {count} реплику", few: "Показать {count} реплики", many: "Показать {count} реплик", other: "Показать {count} реплики" }, kk: "{count} репликаны көрсету", en: { one: "Show {count} turn", other: "Show {count} turns" } },
    "review.waitingReply": { ru: "Ожидание ответа {duration}", kk: "Жауапты күту: {duration}", en: "Waiting for a reply: {duration}" },
    "review.noEvidence": { ru: "Модель не сослалась на реплики. Откройте весь диалог, чтобы проверить ответ.", kk: "Модель репликаларға сілтеме бермеді. Жауапты тексеру үшін диалогты толық ашыңыз.", en: "The model did not cite any turns. Open the full conversation to check its answer." },
    "review.showFragment": { ru: "Показать только фрагмент", kk: "Тек үзіндіні көрсету", en: "Show excerpt only" },
    "review.showConversation": { ru: "Показать весь диалог", kk: "Диалогты толық көрсету", en: "Show full conversation" },
    "review.fragment": { ru: "Фрагмент диалога", kk: "Диалог үзіндісі", en: "Conversation excerpt" },
    "review.modelAnswer": { ru: "Ответ модели", kk: "Модельдің жауабы", en: "Model answer" },
    "review.modelAnswerNote": { ru: "ответ модели", kk: "модель жауабы", en: "model answer" },
    "review.newAnswerNote": { ru: "новый ответ", kk: "жаңа жауап", en: "new answer" },
    "review.rule": { ru: "Правило критерия", kk: "Критерий ережесі", en: "Criterion rule" },
    "review.notApplicable": { ru: "Критерий не применяется. ", kk: "Критерий қолданылмайды. ", en: "The criterion does not apply. " },
    "review.modelScore": { ru: "Оценка модели", kk: "Модельдің бағасы", en: "Model score" },
    "review.points": { ru: "{points} из {max} баллов", kk: "{max} ұпайдан {points}", en: "{points} of {max} points" },
    "review.noExplanation": { ru: "Модель не оставила объяснения.", kk: "Модель түсіндірме қалдырмады.", en: "The model did not provide an explanation." },
    "review.differentAnswers": { ru: "При двух проверках модель ответила по-разному", kk: "Екі тексеруде модель әртүрлі жауап берді", en: "The model gave different answers across two checks" },
    "review.analystAppeal": { ru: "Апелляция аналитика", kk: "Талдаушының апелляциясы", en: "Analyst appeal" },
    "review.proposes": { ru: "Предлагает", kk: "Ұсынысы", en: "Suggested answer" },
    "review.submitted": { ru: "Подана {time}", kk: "Берілген уақыты: {time}", en: "Submitted {time}" },
    "review.secondCheck": { ru: "Повторная проверка", kk: "Қайта тексеру", en: "Second review" },
    "review.secondCheckPending": { ru: "Модель перечитывает разговор с учётом комментария", kk: "Модель пікірді ескеріп, диалогты қайта оқып жатыр", en: "The model is reviewing the conversation with the analyst’s comment" },
    "review.retryCheck": { ru: "Повторить перепроверку", kk: "Қайта тексеруді қайталау", en: "Retry model review" },
    "review.requestCheck": { ru: "Попросить модель перепроверить", kk: "Модельден қайта тексеруді сұрау", en: "Ask the model to review again" },
    "review.afterCheck": { ru: "Модель после перепроверки", kk: "Қайта тексеруден кейінгі модель жауабы", en: "Model answer after review" },
    "review.toTurn": { ru: "К реплике", kk: "Репликаға өту", en: "Go to turn" },
    "review.agrees": { ru: "Согласна с аналитиком", kk: "Талдаушымен келіседі", en: "Agrees with the analyst" },
    "review.keepsScore": { ru: "Остаётся при своей оценке", kk: "Бұрынғы бағасын өзгертпейді", en: "Keeps its original score" },
    "review.checkError": { ru: "Модель не смогла перепроверить критерий. Попробуйте ещё раз", kk: "Модель критерийді қайта тексере алмады. Қайталап көріңіз", en: "The model could not review this criterion. Try again" },
    "review.before": { ru: "Было", kk: "Бұрын", en: "Before" },
    "review.after": { ru: "Стало", kk: "Кейін", en: "After" },
    "review.total": { ru: "Итог", kk: "Қорытынды", en: "Total" },
    "review.totalUnchangedFuture": { ru: "Итог не изменится", kk: "Қорытынды өзгермейді", en: "Total will stay the same" },
    "review.totalCurrent": { ru: "Итог сейчас", kk: "Қазіргі қорытынды", en: "Current total" },
    "review.totalRecalculated": { ru: "Итог пересчитан", kk: "Қорытынды қайта есептелді", en: "Total recalculated" },
    "review.totalAfter": { ru: "Итог после решения", kk: "Шешімнен кейінгі қорытынды", en: "Total after the decision" },
    "review.totalUnchanged": { ru: "Итог не изменился", kk: "Қорытынды өзгерген жоқ", en: "Total unchanged" },
    "review.confirmScore": { ru: "Оценка верна", kk: "Баға дұрыс", en: "Score is correct" },
    "review.confirmHint": { ru: "Ответ модели остаётся", kk: "Модельдің жауабы қалады", en: "Keep the model’s answer" },
    "review.changeScore": { ru: "Изменить оценку", kk: "Бағаны өзгерту", en: "Change score" },
    "review.changeHint": { ru: "Поставить другой ответ", kk: "Басқа жауапты таңдау", en: "Choose a different answer" },
    "review.decision": { ru: "Решение", kk: "Шешім", en: "Decision" },
    "review.newAnswer": { ru: "Новый ответ", kk: "Жаңа жауап", en: "New answer" },
    "review.analystSuggestion": { ru: "Аналитик предложил «{answer}»", kk: "Талдаушы «{answer}» жауабын ұсынды", en: "The analyst suggested “{answer}”" },
    "review.modelSuggestion": { ru: "После перепроверки модель предлагает «{answer}»", kk: "Қайта тексеруден кейін модель «{answer}» жауабын ұсынады", en: "After review, the model suggests “{answer}”" },
    "review.reasonPlaceholder": { ru: "Коротко объясните решение, его увидит аналитик", kk: "Шешімді қысқаша түсіндіріңіз, оны талдаушы көреді", en: "Briefly explain your decision for the analyst" },
    "review.reason": { ru: "Причина решения", kk: "Шешімнің себебі", en: "Reason for the decision" },
    "review.save": { ru: "Сохранить решение", kk: "Шешімді сақтау", en: "Save decision" },
    "review.openDecision": { ru: "Открыть принятое решение", kk: "Қабылданған шешімді ашу", en: "Open the saved decision" },
    "review.keyConfirm": { ru: " оценка верна, ", kk: " баға дұрыс, ", en: " score is correct, " },
    "review.keyChange": { ru: " изменить оценку, ", kk: " бағаны өзгерту, ", en: " change score, " },
    "review.keySave": { ru: " сохранить решение", kk: " шешімді сақтау", en: " save decision" },
    "review.charactersLeft": { ru: { one: "Ещё {count} символ", few: "Ещё {count} символа", many: "Ещё {count} символов", other: "Ещё {count} символа" }, kk: "Тағы {count} таңба қажет", en: { one: "{count} more character needed", other: "{count} more characters needed" } },
    "review.savedChanged": { ru: "Решение сохранено, оценка изменена", kk: "Шешім сақталды, баға өзгертілді", en: "Decision saved, score changed" },
    "review.savedConfirmed": { ru: "Решение сохранено, оценка подтверждена", kk: "Шешім сақталды, баға расталды", en: "Decision saved, score confirmed" },
    "review.saveError": { ru: "Не удалось сохранить решение. Причина осталась в форме, повторите сохранение", kk: "Шешімді сақтау мүмкін болмады. Себебі пішінде сақталды, қайта сақтап көріңіз", en: "The decision could not be saved. Your reason is still in the form. Try saving again" },
    "review.networkError": { ru: "Нет связи с сервером. Введённые данные сохранены в форме", kk: "Сервермен байланыс жоқ. Енгізілген деректер пішінде сақталды", en: "Cannot connect to the server. Your input is still in the form" },
    "review.alreadyDecided": { ru: "По этой апелляции уже принято решение. Откройте его, чтобы увидеть результат", kk: "Бұл апелляция бойынша шешім қабылданған. Нәтижесін көру үшін оны ашыңыз", en: "This appeal has already been resolved. Open the saved decision to see the result" },
    "review.decided": { ru: "Решение принято", kk: "Шешім қабылданды", en: "Decision made" },
    "review.scoreConfirmed": { ru: "оценка подтверждена", kk: "баға расталды", en: "score confirmed" },
    "review.openConversation": { ru: "Открыть карточку обращения", kk: "Өтініш карточкасын ашу", en: "Open conversation" },
    "review.conversation": { ru: "Обращение № {number}", kk: "№ {number} өтініш", en: "Conversation {number}" },
    "review.conversationNumber": { ru: "№ {number}", kk: "№ {number}", en: "#{number}" },
    "review.waitingDecision": { ru: "Ждёт решения {time}", kk: "Шешімді күту: {time}", en: "Awaiting a decision: {time}" },
    "review.appealResolved": { ru: "Апелляция разобрана", kk: "Апелляция қаралды", en: "Appeal resolved" },
    "review.confirmed": { ru: "Подтверждено", kk: "Расталды", en: "Confirmed" },
    "review.openAppeals": { ru: "Открытые апелляции", kk: "Ашық апелляциялар", en: "Open appeals" },
    "review.waitingTitle": { ru: "Сколько апелляция ждёт решения", kk: "Апелляцияның шешім күткен уақыты", en: "Time awaiting a decision" },
    "review.allResolved": { ru: "Все апелляции разобраны", kk: "Барлық апелляциялар қаралды", en: "All appeals resolved" },
    "review.noAppeals": { ru: "Апелляций пока нет", kk: "Әзірге апелляциялар жоқ", en: "No appeals yet" },
    "review.noAppealsHelp": { ru: "Они появятся здесь, когда аналитик оспорит оценку обращения.", kk: "Талдаушы өтініштің бағасына шағымданғанда, апелляциялар осында пайда болады.", en: "Appeals will appear here when an analyst disputes a conversation’s score." },
    "review.goConversations": { ru: "К обращениям", kk: "Өтініштерге өту", en: "Go to conversations" },
    "review.emptyHelp": { ru: "Новые появятся здесь, как только аналитик оспорит оценку.", kk: "Талдаушы бағаға шағымданғанда, жаңа апелляциялар осында пайда болады.", en: "New appeals will appear here when an analyst disputes a score." },
    "review.resolvedToday": { ru: { one: "Сегодня решена {count} апелляция. Новые появятся здесь, как только аналитик оспорит оценку.", few: "Сегодня решено {count} апелляции. Новые появятся здесь, как только аналитик оспорит оценку.", many: "Сегодня решено {count} апелляций. Новые появятся здесь, как только аналитик оспорит оценку.", other: "Сегодня решено {count} апелляции. Новые появятся здесь, как только аналитик оспорит оценку." }, kk: "Бүгін {count} апелляция шешілді. Талдаушы бағаға шағымданғанда, жаңа апелляциялар осында пайда болады.", en: { one: "{count} appeal resolved today. New appeals will appear here when an analyst disputes a score.", other: "{count} appeals resolved today. New appeals will appear here when an analyst disputes a score." } },
    "review.openResolved": { ru: "Открыть решённые", kk: "Шешілгендерді ашу", en: "Open resolved appeals" },
    "review.notFound": { ru: "Такой апелляции нет", kk: "Мұндай апелляция жоқ", en: "Appeal not found" },
    "review.notFoundHelp": { ru: "Возможно, обращение оценили заново и апелляция закрылась вместе со старой оценкой.", kk: "Өтініш қайта бағаланып, апелляция бұрынғы бағамен бірге жабылған болуы мүмкін.", en: "The conversation may have been evaluated again and the appeal closed with the earlier evaluation." },
    "review.backToQueue": { ru: "Вернуться к очереди", kk: "Кезекке оралу", en: "Back to queue" },
    "review.noneResolved": { ru: "Решённых апелляций пока нет", kk: "Әзірге шешілген апелляциялар жоқ", en: "No resolved appeals yet" },
    "review.resolvedHelp": { ru: "Здесь появится каждое решение с причиной и новым итогом.", kk: "Әр шешім оның себебі және жаңа қорытындысымен осында көрсетіледі.", en: "Each decision will appear here with its reason and updated total." },
    "review.resolved": { ru: "Решённые", kk: "Шешілгендер", en: "Resolved appeals" },
    "review.decisionCount": { ru: { one: "{count} решение, сегодня {today}", few: "{count} решения, сегодня {today}", many: "{count} решений, сегодня {today}", other: "{count} решения, сегодня {today}" }, kk: "{count} шешім, бүгін {today}", en: { one: "{count} decision, {today} today", other: "{count} decisions, {today} today" } }
  });
  const MIN_REASON = 10;
  const AROUND = 2;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Цвет ответа для подсветки реплик: те же переменные, что в карточке. */
  function paint(node, tone) {
    const k = tone === "flag" ? "gross" : tone;
    node.style.setProperty("--lit", `var(--da-${k})`);
    node.style.setProperty("--lit-soft", `var(--da-${k}-soft)`);
    node.style.setProperty("--lit-ink", `var(--da-${k}-on-soft, var(--da-bubble-ink, var(--da-text)))`);
  }

  function waited(a) {
    const min = Math.max(0, Math.round((Date.now() - a.createdAt) / 60000));
    if (min < 1) return t("justNow");
    if (min < 60) return t("minutes", { count: min });
    const hr = Math.round(min / 60);
    if (hr < 24) return t("hours", { count: hr });
    const d = Math.round(hr / 24);
    return t("days", { count: d });
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
    const listen = isCall && audioHref ? h("a", { class: "da-btn is-sm is-text", href: audioHref, target: "_blank", rel: "noopener noreferrer" }, DA.icon("play", 16), m("listen")) : null;

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
            h("b", {}, DA.msg(() => DA.speakerLabel[turn.speaker])), h("time", {}, DA.tx.clock(turn.timestamp)),
            i === firstOp ? h("span", { class: "da-first" }, m("firstReply")) : null,
            ev && ev.kind === "expected_here" ? h("span", { class: "rv-expected" }, m("expectedHere")) : null),
          bubble,
          long ? h("button", { class: "da-more", type: "button", onclick: (e) => { bubble.classList.toggle("is-clamped"); DA.i18n.bindText(e.currentTarget, bubble.classList.contains("is-clamped") ? m("expand") : m("collapse")); } }, m("expand")) : null);
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
        m("showTurns", { count: n }));
    }
    /* Скрытые участки сворачиваются в кнопку, раскрытые реплики появляются на её месте. */
    function render(animate, from, to) {
      const nodes = [];
      for (let i = 0; i < t.length;) {
        if (full || shown.has(i)) {
          const gapDuration = gaps[i];
          if (gapDuration) nodes.push(h("div", { class: "da-gap" + (gapDuration >= 180 ? " is-long" : "") }, DA.icon("clock"), m("waitingReply", () => ({ duration: DA.fmt.duration(gapDuration) }))));
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
      if (!anchors.length && !full) nodes.push(h("p", { class: "rv-note" }, m("noEvidence")));
      box.replaceChildren(...nodes);
      DA.i18n.bindText(toggle, full ? m("showFragment") : m("showConversation"));
      toggle.setAttribute("aria-expanded", String(full));
    }
    render(false);
    const panel = h("section", { class: "rv-panel rv-dialog", "aria-label": m("fragment") },
      h("div", { class: "rv-panel-head" }, h("h2", { class: "rv-h2" }, m("fragment")), h("div", { class: "rv-panel-actions" }, listen, toggle)),
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
      h("b", {}, s.value), h("span", {}, s.description), s.value === modelAnswer ? h("small", {}, m("modelAnswerNote")) : null,
      h("small", { class: "rv-scale-new" }, m("newAnswerNote")))) : [];
    const node = h("section", { class: "rv-panel is-quiet rv-rule", "aria-label": m("rule") },
      h("h2", { class: "rv-h2" }, m("rule")),
      h("p", {}, c.description),
      c.naAllowed ? h("p", { class: "rv-na" }, h("b", {}, m("notApplicable")), c.naCondition) : null,
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
        h("h2", { class: "rv-h2" }, m("modelScore")),
        h("div", { class: "rv-answer" }, DA.answerPill(answer, c),
          c.type !== "flag" && answer !== "na" ? h("span", { class: "da-small da-muted" }, m("points", { points: Math.round(shown.points), max: Math.round(shown.effectiveWeight) })) : null),
        h("p", {}, answer === "na" ? item.naReason : item.explanation || m("noExplanation")),
        item.needsReview ? h("p", { class: "rv-warn" }, DA.icon("alert", 15), m("differentAnswers")) : null),
      h("div", { class: "rv-side" },
        h("h2", { class: "rv-h2" }, m("analystAppeal")),
        appeal.proposedAnswer != null ? h("div", { class: "rv-answer" }, h("span", { class: "da-small da-muted" }, m("proposes")), DA.answerPill(appeal.proposedAnswer, c)) : null,
        h("p", { class: "rv-comment" }, appeal.comment),
        h("span", { class: "da-small da-muted" }, m("submitted", () => ({ time: DA.fmt.dateTime(appeal.createdAt) })))));
  }

  /* Повторная проверка помогает человеку выбрать ответ, но не принимает решение. */
  function secondOpinionBlock(appeal, c, conv, hooks) {
    if (appeal.status !== "open" && !appeal.secondOpinion) return null;
    const node = h("section", { class: "rv-side rv-opinion", "aria-label": m("secondCheck") });
    const controller = new AbortController();
    let opinion = appeal.secondOpinion || null, busy = false, disposed = false, error = "", returnFocus = false;
    function render() {
      node.setAttribute("aria-busy", String(busy));
      if (busy) {
        node.replaceChildren(h("p", { class: "da-thinking rv-opinion-pending", role: "status" }, m("secondCheckPending")));
        return;
      }
      if (!opinion) {
        const button = h("button", { class: "da-btn is-sm rv-opinion-request", type: "button", onclick: request }, DA.icon("refresh", 16), error ? m("retryCheck") : m("requestCheck"));
        node.replaceChildren(...[error ? h("p", { class: "da-error rv-opinion-error", role: "alert" }, error) : null, button].filter(Boolean));
        if (returnFocus && document.activeElement === document.body) button.focus({ preventScroll: true });
        return;
      }
      const heading = h("h2", { class: "rv-h2", tabindex: -1 }, m("afterCheck"));
      const quotes = (opinion.evidence || []).map((entry) => {
        const turn = conv.transcript.find((item, index) => (item.idx ?? index) === entry.turnIdx);
        if (!turn || !entry.quote || !turn.text.includes(entry.quote)) return null;
        return h("button", { class: "rv-opinion-quote", type: "button", onclick: () => hooks.jump(entry, DA.tone(opinion.answer, c)) },
          h("span", { class: "rv-opinion-quote-text" }, entry.quote),
          h("span", { class: "rv-opinion-quote-meta" }, DA.msg(() => `${DA.speakerLabel[turn.speaker]}, ${DA.tx.clock(turn.timestamp)}`), h("span", {}, m("toTurn"), DA.icon("chevron", 13))));
      });
      node.replaceChildren(heading,
        h("div", { class: "rv-answer" }, DA.answerPill(opinion.answer, c), h("span", { class: "rv-opinion-verdict" + (opinion.agreesWithAppeal ? " is-agree" : ""), role: "status" }, opinion.agreesWithAppeal ? m("agrees") : m("keepsScore"))),
        h("p", { class: "rv-opinion-explanation" }, opinion.explanation || m("noExplanation")),
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
        if (!disposed && e.name !== "AbortError") error = e instanceof DA.ApiError ? DA.msg(() => DA.apiErrorMessage(e)) : m("checkError");
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
    let beforeTotal = ev.total;
    const before = h("span", {}, DA.msg(() => DA.fmt.score(beforeTotal)));
    const arrow = h("span", { class: "rv-arrow", "aria-hidden": "true" }, "→");
    const after = h("span", { class: "rv-after" }, DA.fmt.score(ev.total));
    const line = h("div", { class: "rv-total-line" }, label, h("div", { class: "rv-total" }, before, arrow, after));
    const ribbonBefore = DA.ribbon(ribbonItems(cl, answers, now));
    const ribbonAfter = DA.ribbon(ribbonItems(cl, answers, now));
    for (const r of [ribbonBefore, ribbonAfter]) { const s = r.querySelector(`[data-id="${c.id}"]`); s && s.classList.add("is-changed"); }
    const afterRow = h("div", { class: "rv-reveal" }, h("div", {}, h("div", { class: "rv-ribbon-row" }, h("span", {}, m("after")), ribbonAfter)));
    const node = h("div", { class: "rv-preview", "aria-live": "polite" }, line,
      h("div", { class: "rv-ribbons" }, h("div", { class: "rv-ribbon-row" }, h("span", {}, m("before")), ribbonBefore), afterRow));
    let shownAfter = ev.total;

    node.update = function (action, newAnswer) {
      const changing = action === "change" && newAnswer != null;
      node.classList.toggle("is-change", changing);
      afterRow.classList.toggle("is-on", changing);
      afterRow.inert = !changing;
      DA.i18n.bindText(label, changing ? m("total") : action === "confirm" ? m("totalUnchangedFuture") : m("totalCurrent"));
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
      DA.i18n.bindText(label, changed ? m("totalRecalculated") : from !== to ? m("totalAfter") : m("totalUnchanged"));
      beforeTotal = from;
      DA.i18n.refresh(before.firstChild);
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
    const optConfirm = choice("confirm", "check", m("confirmScore"), m("confirmHint"));
    const optChange = choice("change", "refresh", m("changeScore"), m("changeHint"));
    const optionsBox = h("div", { class: "rv-options", role: "radiogroup", "aria-label": m("decision") }, optConfirm, optChange);

    const seg = DA.segmented(options.map((a) => ({ value: a, label: DA.msg(() => DA.answerText(a, c)) })), newAnswer, (v) => { if (!busy && !committed) { answerTouched = true; newAnswer = v; refresh(); } }, m("newAnswer"));
    const suggestion = h("span", { class: "da-hint", hidden: appeal.proposedAnswer == null }, appeal.proposedAnswer != null ? m("analystSuggestion", () => ({ answer: DA.answerText(appeal.proposedAnswer, c) })) : "");
    const changeBox = h("div", { class: "rv-reveal" }, h("div", {}, h("div", { class: "rv-new" },
      h("span", { class: "rv-label" }, m("newAnswer")), seg,
      suggestion)));
    changeBox.inert = true;

    const reason = h("textarea", { class: "da-textarea", id: "rv-reason", placeholder: m("reasonPlaceholder") });
    const left = h("span", { class: "da-hint rv-left" });
    reason.addEventListener("input", refresh);
    const field = h("div", { class: "da-field" }, h("label", { for: "rv-reason" }, m("reason")), reason, left);

    const prev = preview(ev, cl, c);
    const saveBtn = h("button", { class: "da-btn is-primary rv-save", type: "button", disabled: true, onclick: () => save() }, m("save"));
    const error = h("p", { class: "da-error rv-save-error", role: "alert", hidden: true });
    const showDecision = h("button", { class: "da-btn is-text is-sm", type: "button", hidden: true, onclick: () => DA.route() }, m("openDecision"));
    const keys = h("p", { class: "rv-keys" }, h("kbd", {}, "1"), m("keyConfirm"), h("kbd", {}, "2"), m("keyChange"), h("kbd", {}, "Ctrl"), "+", h("kbd", {}, "Enter"), m("keySave"));
    const foot = h("div", { class: "rv-foot" }, error, showDecision, saveBtn, keys);

    const node = h("section", { class: "rv-decide", "aria-label": m("decision") },
      h("h2", { class: "rv-h2" }, m("decision")), optionsBox, changeBox, field, prev, foot);

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
      DA.i18n.bindText(left, () => n < MIN_REASON ? t("charactersLeft", { count: MIN_REASON - n }) : "");
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
            changed ? m("savedChanged") : m("savedConfirmed")));
          hooks.saved(result.appeal.decision.action, result.appeal.decision.newAnswer);
        } else hooks.updated();
      } catch (e) {
        if (!disposed) {
          DA.i18n.bindText(error, e instanceof DA.ApiError ? DA.msg(() => DA.apiErrorMessage(e)) : m("saveError"));
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
      DA.i18n.bindText(suggestion, m("modelSuggestion", () => ({ answer: DA.answerText(answer, c) })));
      suggestion.hidden = false;
      refresh();
    }
    return { node, ready, save, nudge, choose, prefill, dispose: () => { disposed = true; } };
  }

  /* Решение по апелляции, которая уже закрыта: вместо формы итог разбора. */
  function outcomeBlock(appeal, c) {
    const changed = appeal.status === "changed";
    return h("section", { class: "rv-decide is-done", "aria-label": m("decision") },
      h("h2", { class: "rv-h2" }, m("decided")),
      h("div", { class: "rv-answer" },
        changed ? [DA.answerPill(appeal.originalAnswer, c), h("span", { class: "rv-arrow" }, "→"), DA.answerPill(appeal.decision.newAnswer, c)]
          : [DA.answerPill(appeal.originalAnswer, c), h("span", { class: "da-small da-muted" }, m("scoreConfirmed"))]),
      h("p", { class: "rv-comment" }, appeal.decision.reason),
      h("div", { class: "rv-total-line" }, h("span", { class: "rv-total-label" }, changed ? m("total") : m("totalUnchanged")),
        h("div", { class: "rv-total" }, changed && appeal.totalBefore !== appeal.totalAfter ? [h("span", { class: "rv-was" }, DA.msg(() => DA.fmt.score(appeal.totalBefore))), " "] : null, DA.msg(() => DA.fmt.score(appeal.totalAfter)))),
      h("span", { class: "da-small da-muted" }, DA.msg(() => DA.fmt.dateTime(appeal.decision.decidedAt))));
  }

  /* ---------- Рабочая область одной апелляции ---------- */
  function workspace(appeal, onSaved) {
    const ctx = context(appeal);
    const { c, item, conv } = ctx;
    const isOpen = appeal.status === "open";
    const tone = DA.tone(appeal.originalAnswer, c);
    const pillBox = h("div", { class: "rv-pills", "aria-label": m("modelAnswer") }, DA.answerPill(appeal.originalAnswer, c));
    const head = h("header", { class: "rv-head" },
      h("div", { class: "rv-head-meta" },
        h("a", { class: "rv-conv", href: `#/c/${encodeURIComponent(conv.conversation_id)}?${new URLSearchParams({ criterion: c.id, evaluation: ctx.ev.id })}`, title: m("openConversation") }, m("conversation", { number: DA.convNumber(conv.conversation_id) })),
        h("span", { class: "da-chip" }, DA.msg(() => DA.langLabel[conv.language])),
        h("span", { class: "da-chip" }, DA.icon(conv.channel === "voice call" ? "phone" : "message"), DA.msg(() => DA.channelLabel(conv))),
        h("span", { class: "da-small da-muted" }, isOpen ? m("waitingDecision", () => ({ time: waited(appeal) })) : m("appealResolved"))),
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
          } else pillBox.append(h("span", { class: "rv-stamp rv-pill-in" }, DA.icon("check", 14), m("confirmed")));
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
        h("div", { class: "rv-col rv-evidence" }, dialogue),
        h("div", { class: "rv-col" }, rule, dispute, decision ? decision.node : outcomeBlock(appeal, c))));
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
    const queue = h("nav", { class: "rv-queue", "aria-label": m("openAppeals") },
      h("div", { class: "rv-queue-head" }, h("span", {}, m("openAppeals")), count), list);
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
      h("span", { class: "rv-q-num" }, m("conversationNumber", { number: DA.convNumber(a.conversationId) })),
      h("span", { class: "rv-q-wait", title: m("waitingTitle") }, DA.msg(() => waited(a))),
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
      if (!DA.state.appeals.length) return h("div", { class: "rv-empty" },
        h("span", { class: "rv-empty-mark", "aria-hidden": "true" }, DA.icon("message")),
        h("h1", { class: "da-h1", tabindex: -1 }, m("noAppeals")),
        h("p", {}, m("noAppealsHelp")),
        h("button", { class: "da-btn", type: "button", onclick: () => DA.setRole("analyst") }, m("goConversations")));
      const n = decidedToday();
      return h("div", { class: "rv-empty" },
        h("span", { class: "rv-empty-mark", "aria-hidden": "true" }, DA.icon("check")),
        h("h1", { class: "da-h1", tabindex: -1 }, m("allResolved")),
        h("p", {}, n ? m("resolvedToday", { count: n }) : m("emptyHelp")),
        h("a", { class: "da-btn", href: "#/review/done" }, m("openResolved")));
    }
    function notFound() {
      return h("div", { class: "rv-empty" },
        h("h1", { class: "da-h1", tabindex: -1 }, m("notFound")),
        h("p", {}, m("notFoundHelp")),
        h("a", { class: "da-btn", href: "#/review" }, m("backToQueue")));
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
        if (a) DA.i18n.refresh(n.querySelector(".rv-q-wait").firstChild);
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
      h("h2", {}, m("noneResolved")),
      h("p", {}, m("resolvedHelp")),
      h("a", { class: "da-btn", href: "#/review" }, m("backToQueue"))));
    root.append(h("div", { class: "da-page", style: { maxWidth: "1040px" } },
      h("div", { class: "da-page-head" },
        h("h1", { class: "da-h1", tabindex: -1 }, m("resolved")),
        done.length ? h("span", { class: "da-muted" }, m("decisionCount", { count: done.length, today: decidedToday() })) : null),
      list));
  };
})();
