/* Чат привязан к открытой карточке и её текущей оценке. */
(function () {
  const DA = window.DA, h = DA.h;
  DA.i18n.addMessages({
    "assistant.title": { ru: "ИИ-ассистент", kk: "ЖИ көмекшісі", en: "AI assistant" },
    "assistant.open": { ru: "Спросить ассистента", kk: "Көмекшіден сұрау", en: "Ask the assistant" },
    "assistant.minimize": { ru: "Свернуть чат", kk: "Чатты жию", en: "Minimize chat" },
    "assistant.context": { ru: "Обращение №{number}", kk: "№{number} өтініш", en: "Conversation #{number}" },
    "assistant.welcome": { ru: "Разберём этот диалог", kk: "Осы диалогты талдайық", en: "Let’s review this conversation" },
    "assistant.intro": { ru: "Помогу понять оценку, найти подтверждающие цитаты и улучшить ответ оператора.", kk: "Бағаны түсінуге, дәлел болатын дәйексөздерді табуға және оператор жауабын жақсартуға көмектесемін.", en: "I can explain the assessment, find supporting quotes and suggest better operator responses." },
    "assistant.explain": { ru: "Объясни оценку", kk: "Бағаны түсіндір", en: "Explain the assessment" },
    "assistant.quotes": { ru: "Найди важные цитаты", kk: "Маңызды дәйексөздерді тап", en: "Find important quotes" },
    "assistant.recommend": { ru: "Что можно улучшить?", kk: "Нені жақсартуға болады?", en: "What could be improved?" },
    "assistant.placeholder": { ru: "Вопрос по этому обращению…", kk: "Осы өтініш туралы сұрақ…", en: "Ask about this conversation…" },
    "assistant.send": { ru: "Отправить", kk: "Жіберу", en: "Send" },
    "assistant.stop": { ru: "Остановить", kk: "Тоқтату", en: "Stop" },
    "assistant.thinking": { ru: "Изучаю диалог и оценку…", kk: "Диалог пен бағаны талдап жатырмын…", en: "Reviewing the conversation and assessment…" },
    "assistant.you": { ru: "Вы", kk: "Сіз", en: "You" },
    "assistant.quote": { ru: "Реплика {number}", kk: "{number}-реплика", en: "Turn {number}" },
    "assistant.clear": { ru: "Начать новый чат", kk: "Жаңа чат бастау", en: "Start a new chat" },
    "assistant.changed": { ru: "Оценка обновилась. Начат новый чат по текущим данным.", kk: "Баға жаңарды. Ағымдағы деректер бойынша жаңа чат басталды.", en: "The assessment changed. A new chat has started with the current data." },
    "assistant.stopped": { ru: "Ответ остановлен. Вопрос можно отправить снова.", kk: "Жауап тоқтатылды. Сұрақты қайта жіберуге болады.", en: "Reply stopped. You can send the question again." },
    "assistant.note": { ru: "Ответы по исходному диалогу · История хранится до закрытия карточки", kk: "Бастапқы диалог бойынша жауаптар · Тарих карточка жабылғанша сақталады", en: "Based on the original conversation · History lasts until you leave this card" },
    "assistant.messages": { ru: "Сообщения ассистента", kk: "Көмекші хабарламалары", en: "Assistant messages" }
  });
  const m = (key, params) => DA.msg(`assistant.${key}`, params);
  const t = (key, params) => DA.t(`assistant.${key}`, params);
  const signature = (value) => JSON.stringify(value ? [value.id, value.checklistVersion,
    value.transcriptHash, value.status, value.stale, value.total, value.items] : null);

  DA.conversationAssistant = function ({ conversation, evaluation, onCitation }) {
    const cid = conversation.conversation_id;
    let currentEvaluation = evaluation, currentSignature = signature(evaluation);
    let history = [], pending = null, sequence = 0, disposed = false, expanded = false;
    const events = new AbortController();
    const avatar = (className) => h("span", { class: `da-assistant-avatar ${className || ""}`, "aria-hidden": "true" },
      h("img", { src: "assets/assistant.png", alt: "", draggable: "false" }));
    const launcher = h("button", { type: "button", class: "da-assistant-launcher", "aria-label": m("open"),
      "aria-controls": "da-assistant-panel", "aria-expanded": "false", title: m("open"), onclick: () => setOpen(!expanded) }, avatar());
    const welcome = h("div", { class: "da-assistant-welcome" }, avatar("is-large"),
      h("h3", {}, m("welcome")), h("p", {}, m("intro")));
    const log = h("div", { class: "da-assistant-messages", role: "log", "aria-live": "polite", "aria-label": m("messages") });
    const notice = h("p", { class: "da-assistant-notice", role: "status", hidden: true });
    const suggestions = h("div", { class: "da-assistant-suggestions" },
      ["explain", "quotes", "recommend"].map((key) => h("button", { type: "button", onclick: () => {
        input.value = t(key); send();
      } }, m(key))));
    const input = h("textarea", { rows: "2", maxlength: "2000", placeholder: m("placeholder"),
      "aria-label": m("placeholder"), oninput: syncControls,
      onkeydown: (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
      } });
    const submit = h("button", { type: "submit", class: "da-assistant-send", "aria-label": m("send") }, DA.icon("chevron", 16), h("span", {}, m("send")));
    const stop = h("button", { type: "button", class: "da-assistant-stop", hidden: true, onclick: () => {
      cancel(); showNotice(m("stopped")); input.focus();
    } }, m("stop"));
    const composer = h("form", { class: "da-assistant-composer", onsubmit: (event) => { event.preventDefault(); send(); } },
      input, h("div", { class: "da-assistant-composer-actions" }, stop, submit));
    const body = h("div", { class: "da-assistant-body" }, welcome, log, notice);
    const close = h("button", { class: "da-assistant-control da-assistant-minimize", type: "button", "aria-label": m("minimize"), title: m("minimize"), onclick: () => setOpen(false) }, h("span", { "aria-hidden": "true" }, "−"));
    const clear = h("button", { class: "da-assistant-control", type: "button", "aria-label": m("clear"), title: m("clear"), onclick: () => {
      cancel(); history = []; log.replaceChildren(); notice.hidden = true; welcome.hidden = false; input.value = ""; syncControls(); input.focus();
    } }, DA.icon("refresh", 17));
    const panel = h("section", { id: "da-assistant-panel", class: "da-assistant-panel", role: "dialog",
      "aria-modal": "false", "aria-labelledby": "da-assistant-title", hidden: true },
      h("header", { class: "da-assistant-head" }, avatar(),
        h("div", { class: "da-assistant-heading" }, h("h2", { id: "da-assistant-title" }, m("title")),
          h("p", {}, m("context", { number: DA.convNumber(cid) }))), clear, close),
      body, suggestions, composer, h("p", { class: "da-assistant-footnote" }, m("note")));
    const element = h("div", { class: "da-assistant" }, panel, launcher);

    function syncControls() {
      submit.disabled = !!pending || !input.value.trim();
      input.disabled = !!pending;
      stop.hidden = !pending;
      suggestions.querySelectorAll("button").forEach((button) => { button.disabled = !!pending; });
      panel?.setAttribute("aria-busy", String(!!pending));
    }
    function setOpen(value) {
      expanded = value; panel.hidden = !value; launcher.hidden = value;
      element.classList.toggle("is-expanded", value);
      launcher.setAttribute("aria-expanded", String(value));
      if (value) { (pending ? close : input).focus(); body.scrollTop = body.scrollHeight; }
      else launcher.focus();
    }
    function showNotice(message) {
      DA.i18n.bindText(notice, message); notice.hidden = false;
    }
    function cancel() {
      sequence++;
      if (pending) {
        pending.controller.abort(); pending.userNode.remove(); pending.waitNode.remove();
        input.value = pending.message; pending = null;
      }
      welcome.hidden = history.length > 0;
      syncControls();
    }
    function messageNode(role, content) {
      return h("article", { class: `da-assistant-message is-${role}` },
        h("span", { class: "da-assistant-author" }, m(role === "user" ? "you" : "title")),
        h("p", {}, content));
    }
    async function send() {
      const message = input.value.trim();
      if (disposed || pending || !message) return;
      const requestNumber = ++sequence;
      const controller = new AbortController();
      const userNode = messageNode("user", message);
      const waitNode = h("p", { class: "da-assistant-thinking", role: "status" }, h("span", { class: "da-assistant-dot" }), m("thinking"));
      pending = { controller, userNode, waitNode, message };
      welcome.hidden = true; notice.hidden = true;
      log.append(userNode, waitNode); input.value = ""; syncControls(); body.scrollTop = body.scrollHeight;
      try {
        const transcriptHash = conversation.transcriptHash || currentEvaluation?.transcriptHash;
        const evaluationId = currentEvaluation && currentEvaluation.transcriptHash === transcriptHash ? currentEvaluation.id : null;
        const result = await DA.api.askAssistant(cid, {
          message, history: history.slice(-12), language: DA.i18n.languageCode(),
          transcriptHash, evaluationId
        }, { signal: controller.signal });
        if (disposed || requestNumber !== sequence) return;
        if (typeof result.answer !== "string" || !Array.isArray(result.citations)) throw new DA.ApiError("invalid_response", "Invalid assistant response", 502);
        const reply = messageNode("assistant", result.answer);
        if (result.citations.length) reply.append(h("div", { class: "da-assistant-citations" }, result.citations.map((citation) =>
          h("button", { type: "button", class: "da-assistant-citation", onclick: () => {
            setOpen(false); onCitation(citation.turnIdx);
          } }, h("span", {}, m("quote", { number: citation.turnIdx + 1 })), h("q", {}, citation.quote)))));
        waitNode.replaceWith(reply);
        history.push({ role: "user", content: message }, { role: "assistant", content: result.answer });
        history = history.slice(-12);
      } catch (error) {
        if (disposed || requestNumber !== sequence) return;
        userNode.remove(); waitNode.remove(); input.value = message;
        showNotice(DA.apiErrorMessage(error));
      } finally {
        if (!disposed && requestNumber === sequence) {
          pending = null; welcome.hidden = history.length > 0; syncControls();
          body.scrollTop = body.scrollHeight;
          if (expanded) input.focus();
        }
      }
    }
    element.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    }, { signal: events.signal });
    syncControls();
    return {
      element,
      updateEvaluation(next) {
        const nextSignature = signature(next);
        currentEvaluation = next;
        if (nextSignature === currentSignature) return;
        currentSignature = nextSignature;
        const hadMessages = history.length > 0 || !!pending;
        cancel(); history = []; log.replaceChildren(); welcome.hidden = false;
        if (hadMessages) showNotice(m("changed"));
      },
      dispose() { disposed = true; cancel(); events.abort(); DA.i18n.release(element); element.remove(); }
    };
  };
})();
