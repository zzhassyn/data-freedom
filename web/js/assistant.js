/* Сохранённые диалоги с инструментами приложения и проверяемыми источниками. */
(function () {
  const DA = window.DA, h = DA.h;
  const COPY = {
    title: ["ИИ-ассистент", "ЖИ көмекшісі", "AI assistant"],
    open: ["Открыть ассистента", "Көмекшіні ашу", "Open assistant"],
    minimize: ["Свернуть чат", "Чатты жию", "Minimize chat"],
    expand: ["Расширить панель", "Панельді кеңейту", "Expand panel"],
    compact: ["Уменьшить панель", "Панельді кішірейту", "Compact panel"],
    compare: ["Объясни изменения", "Өзгерістерді түсіндір", "Explain the changes"],
    compareQuestion: ["Объясни различия выбранных версий чек-листа. Какие правила и веса изменились и что это значит для оценки?", "Чек-парақтың таңдалған нұсқаларының айырмашылығын түсіндір. Қандай ережелер мен салмақтар өзгерді және бұл бағалауға қалай әсер етеді?", "Explain the differences between the selected checklist versions. Which rules and weights changed, and what does that mean for assessment?"],
    welcomeTitle: ["Чем могу помочь?", "Қалай көмектесе аламын?", "How can I help?"],
    welcomeIntro: ["Найду нужные обращения, объясню оценки и помогу подготовить рекомендации операторам.", "Қажетті өтініштерді тауып, бағаларды түсіндіріп, операторларға ұсыныстар дайындауға көмектесемін.", "Find conversations, understand assessments and prepare useful feedback for operators."],
    priorities: ["С чего начать проверку?", "Тексеруді неден бастау керек?", "Where should I start reviewing?"],
    prioritiesQuestion: ["Какие обращения стоит проверить в первую очередь и почему? Покажи конкретные примеры.", "Қай өтініштерді алдымен тексеру керек және неліктен? Нақты мысалдарды көрсет.", "Which conversations should be reviewed first, and why? Show specific examples."],
    unresolved: ["Какие вопросы не решены?", "Қандай сұрақтар шешілмеген?", "Which issues remain unresolved?"],
    unresolvedQuestion: ["Какие темы содержат нерешённые вопросы? Отдели подтверждённые результаты от неизвестных и покажи обращения.", "Қай тақырыптарда шешілмеген сұрақтар бар? Расталған нәтижелерді белгісіз нәтижелерден бөліп, өтініштерді көрсет.", "Which topics contain unresolved issues? Separate confirmed outcomes from unknown outcomes and show conversations."],
    weaknesses: ["Где теряем баллы?", "Ұпай қай жерде жоғалады?", "Where are scores falling?"],
    weaknessesQuestion: ["По каким критериям чаще всего снижаются оценки? Покажи, сколько обращений это затрагивает, и приведи примеры.", "Қай критерийлер бойынша бағалар жиі төмендейді? Қанша өтінішке қатысты екенін көрсетіп, мысалдар келтір.", "Which criteria most often reduce scores? Show how many conversations are affected and include examples."],
    explain: ["Объясни оценку", "Бағаны түсіндір", "Explain the assessment"],
    explainQuestion: ["Объясни выбранную оценку обращения. Какие критерии снизили итог и какие цитаты это подтверждают?", "Өтініштің таңдалған бағасын түсіндір. Қай критерийлер ұпайды төмендетті және қандай дәйексөздер оны растайды?", "Explain the selected assessment. Which criteria reduced the score, and which quotes support that?"],
    recommend: ["Подготовь обратную связь", "Кері байланыс дайында", "Prepare operator feedback"],
    recommendQuestion: ["Подготовь обратную связь оператору: что получилось и что нужно улучшить. Отдели факты от рекомендаций.", "Операторға кері байланыс дайында: не жақсы болды және нені жақсарту керек. Фактілерді ұсыныстардан ажырат.", "Prepare feedback for the operator: what went well and what should improve. Separate facts from recommendations."],
    wording: ["Предложи лучший ответ", "Жақсырақ жауап ұсын", "Suggest a better reply"],
    wordingQuestion: ["Предложи улучшенную формулировку ответа клиенту без неподтверждённых возможностей, сроков и обещаний.", "Расталмаған мүмкіндіктерді, мерзімдерді немесе уәделерді қоспай, клиентке жақсырақ жауап ұсын.", "Suggest better wording for an operator reply, without unconfirmed capabilities, deadlines or promises."],
    placeholder: ["Задайте вопрос", "Сұрақ қойыңыз", "Ask a question"],
    send: ["Спросить", "Сұрау", "Ask"],
    stop: ["Остановить ответ", "Жауапты тоқтату", "Stop response"],
    analyzing: ["Обдумываю вопрос", "Сұрақты қарастырып жатырмын", "Considering your question"],
    searching: ["Ищу обращения", "Өтініштерді іздеп жатырмын", "Finding conversations"],
    reading: ["Читаю разговор", "Әңгімені оқып жатырмын", "Reading the conversation"],
    comparing: ["Сравниваю версии", "Нұсқаларды салыстырып жатырмын", "Comparing versions"],
    answering: ["Собираю ответ", "Жауап дайындап жатырмын", "Putting the answer together"],
    checking: ["Проверяю источники", "Дереккөздерді тексеріп жатырмын", "Checking sources"],
    refreshing: ["Обновляю данные", "Деректерді жаңартып жатырмын", "Updating the data"],
    you: ["Вы", "Сіз", "You"],
    sources: ["Источники", "Дереккөздер", "Sources"],
    citations: ["Цитаты из диалогов ({count})", "Диалогтардан дәйексөздер ({count})", "Conversation quotes ({count})"],
    quote: ["№{number}, реплика {turn}", "№{number}, {turn}-реплика", "#{number}, turn {turn}"],
    quoteHere: ["Реплика {turn}", "{turn}-реплика", "Turn {turn}"],
    clear: ["Начать новый чат", "Жаңа чат бастау", "Start a new chat"],
    history: ["История диалогов", "Диалогтар тарихы", "Chat history"],
    backToChat: ["К диалогу", "Диалогқа оралу", "Back to chat"],
    newChat: ["Новый диалог", "Жаңа диалог", "New chat"],
    emptyHistory: ["Диалогов пока нет", "Әзірге диалогтар жоқ", "No chats yet"],
    emptyHistoryHelp: ["Задайте первый вопрос ассистенту.", "Көмекшіге алғашқы сұрағыңызды қойыңыз.", "Ask the assistant your first question."],
    deleteChat: ["Удалить диалог", "Диалогты жою", "Delete chat"],
    deleteConfirm: ["Удалить этот диалог?", "Осы диалогты жою керек пе?", "Delete this chat?"],
    delete: ["Удалить", "Жою", "Delete"],
    keep: ["Отмена", "Бас тарту", "Cancel"],
    chatLimit: ["Сохранено 30 диалогов. Удалите ненужный, чтобы начать новый.", "30 диалог сақталды. Жаңасын бастау үшін қажетсізін жойыңыз.", "You have 30 saved chats. Delete one to start another."],
    messageLimit: ["Этот диалог заполнен. Начните новый, чтобы продолжить.", "Бұл диалог толды. Жалғастыру үшін жаңасын бастаңыз.", "This chat is full. Start a new one to continue."],
    savedInTab: ["Не удалось сохранить историю в браузере. Она доступна в этой вкладке до её закрытия.", "Тарихты браузерге сақтау мүмкін болмады. Ол осы қойынды жабылғанша қолжетімді.", "Could not save history in the browser. It remains available in this tab until you close it."],
    notSaved: ["Не удалось сохранить историю. Скопируйте важные ответы перед закрытием страницы.", "Тарихты сақтау мүмкін болмады. Бетті жаппас бұрын маңызды жауаптарды көшіріңіз.", "Could not save history. Copy any important answers before closing the page."],
    saveAgain: ["Повторить сохранение", "Қайта сақтау", "Try saving again"],
    deleteFailed: ["Не удалось удалить диалог. Повторите попытку.", "Диалогты жою мүмкін болмады. Қайталап көріңіз.", "Could not delete the chat. Try again."],
    stopped: ["Ответ остановлен. Вопрос сохранён в поле ввода.", "Жауап тоқтатылды. Сұрақ енгізу өрісінде сақталды.", "The response stopped. Your question is preserved in the input."],
    sourceChanged: ["Данные изменились во время ответа. Повторите вопрос.", "Жауап дайындалған кезде деректер өзгерді. Сұрақты қайталаңыз.", "The data changed while answering. Try the question again."],
    retry: ["Повторить вопрос", "Сұрақты қайталау", "Retry question"],
    copy: ["Скопировать ответ", "Жауапты көшіру", "Copy answer"],
    copied: ["Скопировано", "Көшірілді", "Copied"],
    copyFailed: ["Не удалось скопировать. Выделите текст ответа и скопируйте его.", "Көшіру мүмкін болмады. Жауап мәтінін таңдап, көшіріңіз.", "Could not copy. Select the response text and copy it."],
    keyboard: ["Enter отправляет, Shift+Enter переносит строку", "Enter жібереді, Shift+Enter жаңа жолға көшіреді", "Enter sends, Shift+Enter adds a line"],
    messages: ["История разговора с ассистентом", "Көмекшімен сөйлесу тарихы", "Assistant conversation history"],
    inputLabel: ["Ваш вопрос", "Сіздің сұрағыңыз", "Your question"]
  };
  DA.i18n.addMessages(Object.fromEntries(Object.entries(COPY).map(([key, values]) =>
    ["assistant." + key, { ru: values[0], kk: values[1], en: values[2] }])));
  const m = (key, params) => DA.msg("assistant." + key, params);
  const t = (key, params) => DA.t("assistant." + key, params);
  const STORAGE = "da.assistant.history.v1.", BACKUP = "da.assistant.history.tab.v1.", ACTIVE = "da.assistant.active.v1";
  const LEGACY = ["da.assistant.chat.v5", "da.assistant.chat.v4", "da.assistant.sessions.v3"];
  const MAX_CHATS = 30, MAX_MESSAGES = 12, MAX_HISTORY = 120, MAX_STORAGE = 2000000;
  const text = (value, max, empty) => typeof value === "string" && value.length <= max && (empty || value.trim()) ? value : null;
  const id = (value) => text(value, 200, false);
  const positive = (value) => Number.isInteger(value) && value > 0 && value < 1000000;
  const plain = (value) => value && typeof value === "object" && !Array.isArray(value);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const newId = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  const contentKey = (chat) => JSON.stringify([chat.title || "", chat.history, chat.draft]);
  const hasContent = (chat) => chat.history.length > 0 || !!chat.draft.trim();
  const timestamp = (value) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 8640000000000000 ? Number(value) : Date.now();

  function safeScope(value) {
    if (!plain(value)) return null;
    const out = {};
    for (const key of ["languages", "channels", "status", "attention", "appealStatus", "conversationIds"]) if (value[key] != null) {
      if (!Array.isArray(value[key]) || value[key].length > (key === "conversationIds" ? 1000 : 20) ||
          value[key].some((item) => !id(item))) return null;
      if (key === "conversationIds" || value[key].length) out[key] = [...new Set(value[key])].sort();
    }
    for (const key of ["q", "dateFrom", "dateTo", "groupId", "checklistId"]) if (value[key] != null && value[key] !== "") {
      if (!text(value[key], key === "q" ? 2000 : 200, false)) return null;
      out[key] = value[key];
    }
    for (const key of ["scoreFrom", "scoreTo", "timezoneOffsetMinutes"]) if (value[key] != null && value[key] !== "") {
      const n = value[key];
      if (typeof n !== "number" || !Number.isFinite(n) ||
          (key === "timezoneOffsetMinutes" ? !Number.isInteger(n) || Math.abs(n) > 840 : n < 0 || n > 100)) return null;
      out[key] = n;
    }
    if (!out.dateFrom && !out.dateTo) delete out.timezoneOffsetMinutes;
    return DA.registryFilters?.validate(out).valid === false ? null : out;
  }
  function safeReference(value, kind) {
    if (!plain(value) || !id(value.id)) return null;
    const result = { id: value.id };
    if (kind === "citation") {
      if (!id(value.conversationId) || !Number.isInteger(value.turnIdx) || value.turnIdx < 0 || !text(value.quote, 500, false)) return null;
      Object.assign(result, { conversationId: value.conversationId, turnIdx: value.turnIdx, quote: value.quote });
    } else {
      const allowed = kind === "action" ? ["open_conversation", "show_registry", "compare_versions"]
        : ["conversation", "analytics", "topics", "checklist_comparison"];
      if (!allowed.includes(value.type) || !text(value.label, 300, false)) return null;
      Object.assign(result, { type: value.type, label: value.label });
      if (["conversation", "open_conversation"].includes(value.type)) {
        if (!id(value.conversationId)) return null;
        result.conversationId = value.conversationId;
      }
      if (["analytics", "topics", "show_registry"].includes(value.type)) {
        result.filters = safeScope(value.filters);
        if (result.filters === null) return null;
      }
      if (["checklist_comparison", "compare_versions"].includes(value.type)) {
        if (!positive(value.fromVersion) || !positive(value.toVersion)) return null;
        result.fromVersion = value.fromVersion; result.toVersion = value.toVersion;
      }
    }
    if (result.conversationId) {
      if (value.evaluationId != null && !id(value.evaluationId)) return null;
      result.evaluationId = value.evaluationId || null;
      if (value.transcriptHash != null && !text(value.transcriptHash, 128, false)) return null;
      result.transcriptHash = value.transcriptHash || null;
      if (positive(value.number)) result.number = value.number;
    }
    return result;
  }
  function safeReply(value) {
    if (!plain(value) || !text(value.answer, 8000, false)) return null;
    const result = { answer: value.answer };
    for (const [key, kind] of [["citations", "citation"], ["sources", "source"], ["actions", "action"]]) {
      if (!Array.isArray(value[key]) || value[key].length > 30) return null;
      result[key] = value[key].map((item) => safeReference(item, kind));
      if (result[key].some((item) => !item)) return null;
    }
    return result;
  }
  function safeHistory(value) {
    if (!Array.isArray(value) || value.length > MAX_HISTORY || value.length % 2) return null;
    const result = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i], role = i % 2 ? "assistant" : "user";
      if (!plain(item) || item.role !== role || !text(item.content, role === "user" ? 2000 : 8000, false)) return null;
      const normalized = { role, content: item.content };
      if (role === "assistant") {
        normalized.reply = safeReply(item.reply);
        if (!normalized.reply || normalized.reply.answer !== item.content) return null;
      }
      result.push(normalized);
    }
    return result;
  }
  function storage(kind) { try { return window[kind]; } catch (_) { return null; } }
  function storedValue(kind, key) { try { return storage(kind)?.getItem(key) || null; } catch (_) { return null; } }
  function readChat(raw) {
    try {
      const value = JSON.parse(raw), history = safeHistory(value?.history);
      if (!plain(value) || value.version !== 1 || !id(value.key) || !history || !id(value.revision)) return null;
      const chat = { key: value.key, title: text(value.title, 140, true) || "", history,
        draft: text(value.draft, 2000, true) || "", createdAt: timestamp(value.createdAt),
        updatedAt: timestamp(value.updatedAt), revision: value.revision,
        baseRevision: id(value.baseRevision) || null, notice: null, dirty: false, saved: "local", migration: value.migration === true };
      chat.signature = contentKey(chat);
      return chat;
    } catch (_) { return null; }
  }
  function readChats(kind, prefix) {
    try {
      const target = storage(kind), result = [];
      for (let i = 0; i < (target?.length || 0); i++) {
        const key = target.key(i);
        if (!key?.startsWith(prefix)) continue;
        const chat = readChat(target.getItem(key));
        if (chat && key === prefix + chat.key) result.push(chat);
      }
      return result;
    } catch (_) { return []; }
  }
  function restoreSessions() {
    const records = new Map(readChats("localStorage", STORAGE).map((chat) => {
      chat.baseRevision = chat.revision; return [chat.key, chat];
    }));
    for (const backup of readChats("sessionStorage", BACKUP)) {
      const durable = records.get(backup.key);
      if (durable?.revision === backup.revision) {
        try { storage("sessionStorage")?.removeItem(BACKUP + backup.key); } catch (_) { /* The durable copy already contains this backup. */ }
        continue;
      }
      backup.backupKey = backup.key; backup.saved = "tab"; backup.dirty = true;
      if (durable && durable.revision !== backup.baseRevision) {
        backup.key = backup.key + "-recovered-" + backup.revision.slice(-12); backup.baseRevision = null;
      }
      records.set(backup.key, backup);
    }
    for (const key of LEGACY) {
      const raw = storedValue("sessionStorage", key);
      if (!raw) continue;
      try {
        const saved = JSON.parse(raw);
        if (!plain(saved) || ![3, 4, 5].includes(saved.version) || !Array.isArray(saved.sessions)) continue;
        const old = saved.sessions.flatMap((entry) => {
          if (!Array.isArray(entry?.history) || entry.history.length > MAX_MESSAGES) return [];
          const history = safeHistory(entry?.history);
          return history ? [{ history, draft: text(entry.draft, 2000, true) || "", updatedAt: timestamp(entry.updatedAt) }] : [];
        }).sort((a, b) => a.updatedAt - b.updatedAt);
        if (!old.length) continue;
        let hash = 2166136261;
        for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
        const migratedKey = "imported-" + (hash >>> 0).toString(16);
        if (!records.has(migratedKey)) records.set(migratedKey, { key: migratedKey, title: "",
          history: old.flatMap((entry) => entry.history), draft: old.at(-1).draft,
          createdAt: old[0].updatedAt, updatedAt: old.at(-1).updatedAt, revision: newId(), baseRevision: null,
          notice: null, dirty: true, saved: "tab", migration: true, signature: "" });
        break;
      } catch (_) { /* A malformed record never becomes rendered HTML or overwrites saved chats. */ }
    }
    for (const chat of records.values()) if (chat.migration) chat.signature = contentKey(chat);
    return [...records.values()];
  }
  function replace(node, ...children) {
    [...node.childNodes].forEach((child) => DA.i18n.release(child));
    node.replaceChildren(...children);
  }
  function paragraphs(content) {
    const output = h("div", { class: "da-assistant-prose" });
    let list = null, lines = [];
    const flush = () => { if (lines.length) { output.append(h("p", {}, lines.join("\n"))); lines = []; } list = null; };
    String(content).split(/\r?\n/).forEach((line) => {
      const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/u);
      if (!line.trim()) { flush(); return; }
      if (bullet) {
        if (lines.length) flush();
        if (!list) { list = h("ul", {}); output.append(list); }
        list.append(h("li", {}, bullet[1])); return;
      }
      if (/^#{1,3}\s/.test(line)) { flush(); output.append(h("h3", {}, line.replace(/^#{1,3}\s+/, ""))); return; }
      if (list) list = null;
      lines.push(line);
    });
    flush(); return output;
  }

  let singleton = null;
  DA.initAssistant = function () {
    if (singleton) return singleton;
    let sessions = restoreSessions(), current = null, pending = null, sequence = 0, ownerSequence = 0;
    let conversation = null, expanded = false, wide = false, returnFocus = null;
    let historyOpen = false, deleteCandidate = null, draftTimer = null, storageMessage = null;
    let workspace = { filters: {}, route: null };
    const events = new AbortController(), timers = new Set();
    const avatar = (extra) => h("span", { class: "da-assistant-avatar " + (extra || ""), "aria-hidden": "true" },
      h("img", { src: "assets/assistant.svg", width: 48, height: 48, alt: "", draggable: "false" }));
    const launcher = h("button", { type: "button", class: "da-assistant-launcher", "aria-label": m("open"),
      "aria-controls": "da-assistant-panel", "aria-expanded": "false", onclick: () => setOpen(true) },
      avatar(), h("span", {}, m("title")));
    const welcome = h("div", { class: "da-assistant-welcome" });
    const log = h("div", { class: "da-assistant-messages", role: "log", "aria-live": "polite", "aria-label": m("messages") });
    const noticeText = h("span", {}), retry = h("button", { type: "button", onclick: () => send() }, m("retry"));
    const notice = h("div", { class: "da-assistant-notice", role: "status", hidden: true }, noticeText, retry);
    const body = h("div", { class: "da-assistant-body" }, welcome, log, notice);
    const suggestions = h("div", { class: "da-assistant-suggestions" });
    const input = h("textarea", { id: "da-assistant-input", rows: 3, maxlength: 2000, "aria-label": m("inputLabel"),
      oninput: () => { if (current) current.draft = input.value; schedulePersist(); syncControls(); },
      onkeydown: (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
      } });
    const submit = h("button", { type: "submit", class: "da-assistant-send" }, m("send"));
    const stop = h("button", { type: "button", class: "da-assistant-stop", hidden: true,
      onclick: () => { cancel("stopped"); renderLog(); input.focus(); } }, DA.icon("pause", 16), m("stop"));
    const composer = h("form", { class: "da-assistant-composer", onsubmit: (event) => { event.preventDefault(); send(); } },
      h("label", { for: "da-assistant-input", class: "da-assistant-input-label" }, m("inputLabel")),
      input, h("div", { class: "da-assistant-composer-actions" },
        h("span", { class: "da-assistant-keyboard" }, m("keyboard")), stop, submit));
    const expandButton = h("button", { class: "da-assistant-control", type: "button", "aria-label": m("expand"),
      title: m("expand"), "aria-pressed": "false", onclick: () => {
        wide = !wide; element.classList.toggle("is-wide", wide);
        expandButton.setAttribute("aria-pressed", String(wide));
        DA.i18n.bindAttr(expandButton, "aria-label", m(wide ? "compact" : "expand"));
        DA.i18n.bindAttr(expandButton, "title", m(wide ? "compact" : "expand"));
      } }, DA.icon("external", 18));
    const historyButton = h("button", { class: "da-assistant-control da-assistant-history-toggle", type: "button",
      "aria-label": m("history"), title: m("history"), "aria-controls": "da-assistant-history", "aria-expanded": "false",
      onclick: () => setHistory(!historyOpen) }, DA.icon("clock", 18));
    const clear = h("button", { class: "da-assistant-control da-assistant-new", type: "button", "aria-label": m("clear"), title: m("clear"),
      onclick: () => newChat() }, DA.icon("plus", 19));
    const close = h("button", { class: "da-assistant-control", type: "button", "aria-label": m("minimize"),
      title: m("minimize"), onclick: () => setOpen(false) }, DA.icon("x", 18));
    const historyList = h("div", { class: "da-assistant-history-list" });
    const historyBack = h("button", { class: "da-assistant-history-back", type: "button", onclick: () => setHistory(false) }, DA.icon("back", 15), m("backToChat"));
    const historyPanel = h("section", { id: "da-assistant-history", class: "da-assistant-history", hidden: true, "aria-labelledby": "da-assistant-history-title" },
      h("div", { class: "da-assistant-history-head" }, h("h3", { id: "da-assistant-history-title" }, m("history")), historyBack), historyList);
    const storageText = h("span", {});
    const storageRetry = h("button", { type: "button", onclick: () => {
      storageMessage = null; sessions.filter((chat) => chat.dirty).forEach(saveChat); renderStorage(); if (historyOpen) renderHistory();
    } }, m("saveAgain"));
    const storageNotice = h("div", { class: "da-assistant-storage-notice", role: "status", hidden: true }, storageText, storageRetry);
    const panel = h("section", { id: "da-assistant-panel", class: "da-assistant-panel", role: "dialog",
      "aria-modal": "false", "aria-labelledby": "da-assistant-title", hidden: true },
      h("header", { class: "da-assistant-head" }, avatar(), h("h2", { id: "da-assistant-title" }, m("title")), historyButton, expandButton, clear, close),
      storageNotice, historyPanel, body, suggestions, composer);
    const element = h("div", { class: "da-assistant" }, panel, launcher);
    document.body.append(element);
    function pageFocus() {
      const focus = {}, route = location.hash || "#/", query = new URLSearchParams(route.split("?")[1] || "");
      if (conversation && route.split("?")[0] === "#/c/" + encodeURIComponent(conversation.value.conversation_id)) {
        const source = conversation.value, ev = conversation.evaluation;
        const hash = source.transcriptHash || ev?.transcriptHash || "";
        const pinned = text(query.get("evaluation"), 128, false);
        const evaluationId = pinned || (ev && ev.transcriptHash === hash ? ev.id : null);
        if (hash) focus.conversation = { conversationId: source.conversation_id, evaluationId, transcriptHash: hash };
      }
      if (/^#\/(?:insights)?(?:\?|$)/.test(route)) {
        const filters = workspace.route === route ? workspace.filters : safeScope(DA.registryFilters?.readQuery(query) || {});
        if (filters && Object.keys(filters).length) focus.filters = clone(filters);
      }
      if (/^#\/checklists(?:\?|$)/.test(route) && query.get("compare") === "1") {
        const versions = DA.state.checklists || [], selected = versions.find((item) => item.version === Number(query.get("version"))) ||
          versions.find((item) => item.isActive) || versions.at(-1);
        const after = query.has("to") ? Number(query.get("to")) : selected?.version;
        const afterChecklist = versions.find((item) => item.version === after);
        const before = query.has("from") ? Number(query.get("from")) : afterChecklist?.basedOnVersion ||
          versions.filter((item) => item.version < after).sort((a, b) => b.version - a.version)[0]?.version || after;
        if (positive(before) && positive(after)) focus.comparison = { fromVersion: before, toVersion: after };
      }
      return focus;
    }
    function writeActive() { try { if (current) storage("sessionStorage")?.setItem(ACTIVE, current.key); } catch (_) { /* The current chat remains open. */ } }
    function saveChat(chat) {
      if (!chat) return;
      const signature = contentKey(chat);
      if (signature !== chat.signature) {
        chat.signature = signature; chat.updatedAt = Date.now(); chat.revision = newId(); chat.dirty = true;
      }
      if (!chat.dirty || !hasContent(chat) && !chat.baseRevision) return;
      const durable = readChat(storedValue("localStorage", STORAGE + chat.key));
      if (durable && durable.revision !== chat.baseRevision && durable.revision !== chat.revision) {
        // Preserve both edits if another tab changed this same chat.
        durable.baseRevision = durable.revision;
        sessions = sessions.filter((entry) => entry !== chat);
        sessions.push(durable, chat); chat.key = newId(); chat.baseRevision = null;
      }
      const record = { version: 1, key: chat.key, title: chat.title || "", history: chat.history, draft: chat.draft,
        createdAt: chat.createdAt, updatedAt: chat.updatedAt, revision: chat.revision, baseRevision: chat.baseRevision, migration: !!chat.migration };
      const serialized = JSON.stringify(record);
      try {
        const target = storage("localStorage");
        if (!target) throw new Error("Storage unavailable");
        let size = serialized.length;
        for (let i = 0; i < target.length; i++) {
          const key = target.key(i);
          if (key?.startsWith(STORAGE) && key !== STORAGE + chat.key) size += (target.getItem(key) || "").length;
        }
        if (size > MAX_STORAGE) throw new Error("History is full");
        target.setItem(STORAGE + chat.key, serialized);
        chat.baseRevision = chat.revision; chat.dirty = false; chat.saved = "local";
        try {
          storage("sessionStorage")?.removeItem(BACKUP + (chat.backupKey || chat.key));
          delete chat.backupKey;
          if (chat.migration) { LEGACY.forEach((key) => storage("sessionStorage")?.removeItem(key)); chat.migration = false; }
        } catch (_) { /* A durable saved record is already available. */ }
      } catch (_) {
        try {
          const target = storage("sessionStorage");
          if (!target) throw new Error("Storage unavailable");
          target.setItem(BACKUP + chat.key, serialized); chat.saved = "tab";
          const previousBackup = chat.backupKey; chat.backupKey = chat.key;
          if (previousBackup && previousBackup !== chat.key) {
            try { target.removeItem(BACKUP + previousBackup); } catch (_) { /* The newer fallback remains available. */ }
          }
        } catch (_) { chat.saved = "memory"; }
      }
      writeActive();
    }
    function persist() {
      if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
      saveChat(current); writeActive(); renderStorage();
      if (historyOpen) renderHistory();
    }
    function schedulePersist() {
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(() => { draftTimer = null; persist(); }, 250);
    }
    function renderStorage() {
      const unsaved = sessions.filter((chat) => chat.dirty && hasContent(chat));
      const key = storageMessage || (unsaved.length ? unsaved.some((chat) => chat.saved === "memory") ? "notSaved" : "savedInTab" : null);
      storageNotice.hidden = !key;
      if (key) replace(storageText, DA.i18n.text(m(key)));
      storageRetry.hidden = !unsaved.length || !!storageMessage;
    }
    function refreshSavedChats() {
      for (const saved of restoreSessions()) {
        const existing = sessions.find((chat) => chat.key === saved.key);
        if (!existing) sessions.push(saved);
        else if (existing !== current && !existing.dirty) sessions[sessions.indexOf(existing)] = saved;
      }
    }
    function freshChat() {
      const chat = { key: newId(), title: "", history: [], draft: "", createdAt: Date.now(), updatedAt: Date.now(),
        revision: newId(), baseRevision: null, notice: null, dirty: false, saved: "memory" };
      chat.signature = contentKey(chat); return chat;
    }
    function activate() {
      if (current) { renderChrome(); return; }
      const active = storedValue("sessionStorage", ACTIVE);
      current = sessions.find((chat) => chat.key === active) || [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (!current) { current = freshChat(); sessions.push(current); }
      input.value = current.draft;
      persist(); renderChrome(); renderLog(); syncControls();
    }
    function chatTitle(chat) {
      return chat.title || (chat.history.find((item) => item.role === "user")?.content || chat.draft).trim().replace(/\s+/g, " ").slice(0, 120) || t("newChat");
    }
    function renderHistory() {
      const chats = sessions.filter(hasContent).sort((a, b) => b.updatedAt - a.updatedAt);
      const locale = { RU: "ru", KZ: "kk", EN: "en" }[DA.i18n.languageCode()] || "ru";
      replace(historyList, ...(chats.length ? chats.map((chat) => {
        const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(chat.updatedAt);
        const entry = h("button", { class: "da-assistant-history-entry", type: "button", "data-chat-id": chat.key,
          "aria-current": chat === current ? "true" : null, onclick: () => selectChat(chat.key) },
          h("span", { class: "da-assistant-history-title" }, chatTitle(chat)), h("time", { datetime: new Date(chat.updatedAt).toISOString() }, date));
        const remove = h("button", { class: "da-assistant-history-delete", type: "button", title: m("deleteChat"), "aria-label": m("deleteChat"), onclick: () => {
          deleteCandidate = chat.key; renderHistory(); historyList.querySelector(".da-assistant-delete-cancel")?.focus();
        } }, DA.icon("trash", 16));
        return h("div", { class: "da-assistant-history-row" }, h("div", { class: "da-assistant-history-choice" }, entry, remove),
          deleteCandidate === chat.key ? h("div", { class: "da-assistant-delete-confirm" }, h("span", {}, m("deleteConfirm")),
            h("button", { type: "button", class: "da-assistant-delete-cancel", onclick: () => { deleteCandidate = null; renderHistory(); historyList.querySelector(".da-assistant-history-entry")?.focus(); } }, m("keep")),
            h("button", { type: "button", class: "da-assistant-delete-confirmed", onclick: () => deleteChat(chat.key) }, m("delete"))) : null);
      }) : [h("div", { class: "da-assistant-history-empty" }, h("h4", {}, m("emptyHistory")), h("p", {}, m("emptyHistoryHelp")))]));
    }
    function renderView() {
      historyPanel.hidden = !historyOpen; body.hidden = historyOpen; composer.hidden = historyOpen;
      suggestions.hidden = historyOpen || !!current?.history.length || !!pending;
      historyButton.setAttribute("aria-expanded", String(historyOpen));
    }
    function setHistory(value, focus = true) {
      historyOpen = value; deleteCandidate = null;
      if (value) { persist(); refreshSavedChats(); renderHistory(); }
      renderView();
      if (focus) (value ? historyList.querySelector(".da-assistant-history-entry") || historyBack : historyButton).focus();
    }
    function selectChat(key) {
      const next = sessions.find((chat) => chat.key === key);
      if (!next) return;
      if (next !== current) { cancel("stopped"); persist(); current = next; input.value = current.draft; }
      storageMessage = null; persist(); renderChrome(); renderLog(); setHistory(false, false); input.focus();
    }
    function newChat() {
      activate(); refreshSavedChats();
      if (hasContent(current) && sessions.filter(hasContent).length >= MAX_CHATS) {
        storageMessage = "chatLimit"; setHistory(true); renderStorage(); return;
      }
      if (hasContent(current) || pending) { cancel("stopped"); persist(); current = freshChat(); sessions.push(current); }
      input.value = ""; storageMessage = null; writeActive(); renderChrome(); renderLog(); setHistory(false, false); input.focus();
    }
    function deleteChat(key) {
      const chat = sessions.find((entry) => entry.key === key);
      if (!chat) return;
      if (chat === current) { cancel(); persist(); }
      try {
        const durable = storage("localStorage"), backup = storage("sessionStorage");
        if (!durable && chat.baseRevision || !backup && chat.saved === "tab") throw new Error("Storage unavailable");
        durable?.removeItem(STORAGE + key); backup?.removeItem(BACKUP + (chat.backupKey || key));
        if (chat.migration) LEGACY.forEach((legacy) => backup?.removeItem(legacy));
      } catch (_) { storageMessage = "deleteFailed"; renderStorage(); return; }
      sessions = sessions.filter((entry) => entry !== chat); deleteCandidate = null; storageMessage = null;
      if (current === chat) { current = null; activate(); }
      renderStorage(); renderHistory(); historyList.querySelector(".da-assistant-history-entry")?.focus();
    }
    function renderChrome() {
      replace(welcome, avatar("is-large"), h("h3", {}, m("welcomeTitle")), h("p", {}, m("welcomeIntro")));
      const focus = pageFocus();
      const prompts = focus.conversation ? ["explain", "recommend", "wording"] : focus.comparison ? ["compare", "priorities"] : ["priorities", "unresolved", "weaknesses"];
      replace(suggestions, ...prompts.map((key) => h("button", { type: "button", disabled: !!pending,
        onclick: () => { if (pending) return; activate(); input.value = t(key + "Question"); current.draft = input.value; persist(); send(); } }, m(key))));
      DA.i18n.bindAttr(input, "placeholder", m("placeholder"));
      launcher.hidden = expanded;
      syncControls(); renderView(); renderStorage(); if (historyOpen) renderHistory();
    }
    function showNotice(value, canRetry) {
      current.notice = value ? { ...(typeof value === "string" ? { text: value } : value), retry: !!canRetry } : null;
      renderNotice();
    }
    function renderNotice() {
      const value = current?.notice;
      notice.hidden = !value;
      if (value) replace(noticeText, value.key ? DA.i18n.text(m(value.key)) : document.createTextNode(value.text));
      retry.hidden = !value?.retry; retry.disabled = !!pending || !input.value.trim();
    }
    function syncControls() {
      submit.disabled = !!pending || !input.value.trim();
      input.disabled = !!pending; stop.hidden = !pending;
      suggestions.querySelectorAll("button").forEach((button) => { button.disabled = !!pending; });
      panel.setAttribute("aria-busy", String(!!pending)); renderNotice();
    }
    function setOpen(value) {
      if (value) { activate(); returnFocus = document.activeElement; }
      else persist();
      expanded = value; panel.hidden = !value; launcher.hidden = value;
      element.classList.toggle("is-expanded", value); launcher.setAttribute("aria-expanded", String(value));
      if (value) { (historyOpen ? historyList.querySelector(".da-assistant-history-entry") || historyBack : pending ? stop : input).focus(); scrollEnd(); }
      else if (returnFocus?.isConnected && !element.contains(returnFocus)) returnFocus.focus();
      else {
        const pageTrigger = document.querySelector?.(".da-ins-ask:not([disabled]):not([hidden])");
        if (pageTrigger) pageTrigger.focus();
        else if (!launcher.hidden) launcher.focus();
      }
    }
    function cancel(noticeKey) {
      sequence++;
      if (!pending) return;
      const abandoned = pending; pending = null;
      abandoned.controller.abort(); abandoned.session.draft = abandoned.message;
      if (noticeKey) abandoned.session.notice = { key: noticeKey };
      if (current === abandoned.session) input.value = abandoned.message;
      persist(); syncControls();
    }
    function scrollEnd() { body.scrollTop = body.scrollHeight; }
    function routeFor(ref, citation) {
      if (ref.conversationId) {
        const query = new URLSearchParams();
        if (ref.evaluationId) query.set("evaluation", ref.evaluationId);
        const hash = DA.state?.conversations?.[ref.conversationId]?.transcriptHash;
        if (citation && (ref.evaluationId || ref.transcriptHash && ref.transcriptHash === hash)) query.set("turn", String(ref.turnIdx));
        return "#/c/" + encodeURIComponent(ref.conversationId) + (query.size ? "?" + query : "");
      }
      if (["compare_versions", "checklist_comparison"].includes(ref.type))
        return "#/checklists?compare=1&from=" + ref.fromVersion + "&to=" + ref.toVersion;
      let registry;
      try { registry = DA.registryFilters?.href(ref.filters); } catch (_) { return null; }
      if (!registry) return null;
      if (["analytics", "topics"].includes(ref.type)) {
        const query = new URLSearchParams(registry.split("?")[1] || "");
        query.set("tab", ref.type === "topics" ? "topics" : "overview");
        return "#/insights?" + query;
      }
      return registry;
    }
    function navigate(ref, citation) {
      const focus = pageFocus();
      if (citation && conversation && ref.conversationId === conversation.value.conversation_id &&
          (ref.evaluationId || null) === (focus.conversation?.evaluationId || null) &&
          ref.transcriptHash && ref.transcriptHash === focus.conversation?.transcriptHash) {
        setOpen(false); conversation.onCitation?.(ref.turnIdx); return;
      }
      const target = routeFor(ref, citation);
      if (target) {
        setOpen(false);
        if (!ref.conversationId && DA.state?.role === "reviewer") DA.setRole?.("analyst");
        location.hash = target;
      }
    }
    function referenceNode(ref, citation) {
      if (!routeFor(ref, citation)) return null;
      if (citation) {
        const number = ref.number || DA.state?.numbers?.[ref.conversationId];
        return h("button", { type: "button", class: "da-assistant-citation", onclick: () => navigate(ref, true) },
          h("span", {}, number ? m("quote", { number, turn: ref.turnIdx + 1 }) : m("quoteHere", { turn: ref.turnIdx + 1 })),
          h("q", {}, ref.quote));
      }
      return h("button", { type: "button", class: "da-assistant-reference", onclick: () => navigate(ref, false) },
        DA.icon(ref.conversationId ? "message" : ref.type.includes("comparison") || ref.type === "compare_versions" ? "scale" :
          ref.type === "show_registry" ? "list" : "chart", 15), h("span", {}, ref.label));
    }
    function messageNode(item) {
      if (item.role === "user") return h("article", { class: "da-assistant-message is-user" },
        h("span", { class: "da-assistant-author" }, m("you")), h("p", {}, item.content));
      const copyButton = h("button", { type: "button", class: "da-assistant-copy", title: m("copy"), "aria-label": m("copy"),
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(item.content);
            replace(copyButton, DA.icon("check", 15)); DA.i18n.bindAttr(copyButton, "aria-label", m("copied"));
            const timer = setTimeout(() => { timers.delete(timer); if (!copyButton.isConnected) return;
              replace(copyButton, DA.icon("copy", 15)); DA.i18n.bindAttr(copyButton, "aria-label", m("copy")); }, 1800);
            timers.add(timer);
          } catch (_) { showNotice({ key: "copyFailed" }); }
        } }, DA.icon("copy", 15));
      const reply = h("article", { class: "da-assistant-message is-assistant" },
        h("div", { class: "da-assistant-answer-head" }, h("span", { class: "da-assistant-author" }, m("title")), copyButton),
        paragraphs(item.content));
      const sources = item.reply.sources.map((source) => referenceNode(source, false)).filter(Boolean);
      if (sources.length) reply.append(h("div", { class: "da-assistant-sources" },
        h("span", { class: "da-assistant-source-label" }, m("sources")), h("div", {}, sources)));
      if (item.reply.citations.length) reply.append(h("details", { class: "da-assistant-citations" },
        h("summary", {}, m("citations", { count: item.reply.citations.length }), DA.icon("chevron", 14)),
        h("div", {}, item.reply.citations.map((citation) => referenceNode(citation, true)).filter(Boolean))));
      const actions = item.reply.actions.map((action) => referenceNode(action, false)).filter(Boolean);
      if (actions.length) reply.append(h("div", { class: "da-assistant-result-actions" }, actions));
      return reply;
    }
    function renderLog() {
      if (!current) return;
      const oldScroll = body.scrollTop;
      replace(log, ...current.history.map(messageNode));
      if (pending && pending.session === current) {
        log.append(messageNode({ role: "user", content: pending.message }));
        pending.streamNode = h("div", { class: "da-assistant-stream", "aria-live": "off" }, pending.text);
        pending.answerNode = h("article", { class: "da-assistant-message is-assistant", hidden: !pending.text },
          h("span", { class: "da-assistant-author" }, m("title")), pending.streamNode);
        log.append(pending.answerNode);
        pending.statusNode = h("span", {}, m(pending.stage));
        log.append(h("p", { class: "da-assistant-thinking", role: "status" },
          h("span", { class: "da-assistant-spinner", "aria-hidden": "true" }), pending.statusNode));
      }
      welcome.hidden = current.history.length > 0 || !!pending;
      renderView();
      body.scrollTop = oldScroll; renderNotice();
    }
    async function refreshFocus(focus, pinnedEvaluationId, signal, stillCurrent) {
      const check = () => {
        if (signal.aborted || !stillCurrent()) { const error = new Error("Aborted"); error.name = "AbortError"; throw error; }
      };
      const invalid = () => new DA.ApiError("invalid_response", "Invalid assistant context", 502);
      const selected = focus.conversation;
      if (!selected) throw invalid();
      check();
      const [source, assessments] = await Promise.all(pinnedEvaluationId ? [
        DA.api.getEvaluationConversation(pinnedEvaluationId, { signal }),
        DA.api.getEvaluation(pinnedEvaluationId, { signal })
      ] : [
        DA.api.getConversation(selected.conversationId, { signal }),
        DA.api.listEvaluations(selected.conversationId, { signal })
      ]);
      check();
      const sourceId = source?.id || source?.conversation_id, hash = text(source?.transcriptHash, 128, false);
      if (sourceId !== selected.conversationId || !hash) throw invalid();
      let evaluationId = null;
      if (pinnedEvaluationId) {
        if (assessments?.id !== pinnedEvaluationId || assessments.conversationId !== sourceId || assessments.transcriptHash !== hash) throw invalid();
        evaluationId = pinnedEvaluationId;
      } else {
        if (!Array.isArray(assessments?.items)) throw invalid();
        const latest = assessments.items[0];
        if (latest && (!id(latest.id) || latest.conversationId !== sourceId)) throw invalid();
        if (latest?.transcriptHash === hash) evaluationId = latest.id;
      }
      return { ...focus, conversation: { conversationId: sourceId, transcriptHash: hash, evaluationId } };
    }
    async function send() {
      const message = input.value.trim();
      if (pending || !message || message.length > 2000) return;
      activate();
      if (current.history.length >= MAX_HISTORY) { showNotice({ key: "messageLimit" }); return; }
      let focus = pageFocus();
      const session = current, requestNumber = ++sequence, controller = new AbortController();
      const query = new URLSearchParams((location.hash || "").split("?")[1] || "");
      const pinnedEvaluationId = focus.conversation ? text(query.get("evaluation"), 128, false) : null;
      const history = session.history.slice(-MAX_MESSAGES).map(({ role, content }) => ({ role, content: content.slice(0, 6000) }));
      const language = DA.i18n.languageCode();
      session.draft = message; session.notice = null;
      if (!session.title) session.title = message.replace(/\s+/g, " ").slice(0, 120);
      pending = { controller, message, session, focus, number: requestNumber, attempt: 0, stage: "analyzing", text: "",
        statusNode: null, streamNode: null, answerNode: null };
      input.value = ""; persist(); renderLog(); syncControls(); scrollEnd();
      const stillCurrent = () => pending?.number === requestNumber && current === session;
      const resetAnswer = () => {
        pending.text = "";
        if (pending.streamNode) replace(pending.streamNode);
        if (pending.answerNode) pending.answerNode.hidden = true;
      };
      const setStage = (stage) => {
        pending.stage = stage;
        if (pending.statusNode) DA.i18n.bindText(pending.statusNode, m(stage));
      };
      try {
        let result;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (!stillCurrent() || controller.signal.aborted) return;
          pending.attempt = attempt;
          let receivedText = false;
          try {
            result = await DA.api.askWorkspaceAssistant({ message, history, language,
              ...(Object.keys(focus).length ? { focus } : {})
            }, { signal: controller.signal, onProgress: (step) => {
              if (!stillCurrent() || pending.attempt !== attempt) return;
              if (step.type === "progress" && ["analyzing", "searching", "reading", "comparing", "answering", "checking", "refreshing"].includes(step.stage)) {
                setStage(step.stage);
              } else if (step.type === "answer_reset") {
                resetAnswer();
              } else if (step.type === "answer_delta") {
                if (typeof step.text !== "string" || pending.text.length + step.text.length > 8000)
                  throw new DA.ApiError("invalid_response", "Invalid assistant response", 502);
                receivedText ||= !!step.text;
                const stick = body.scrollHeight - body.scrollTop - body.clientHeight < 100;
                pending.text += step.text;
                if (pending.streamNode) pending.streamNode.append(document.createTextNode(step.text));
                if (pending.answerNode) pending.answerNode.hidden = !pending.text;
                if (stick) scrollEnd();
              }
            } });
            break;
          } catch (error) {
            if (!stillCurrent() || controller.signal.aborted || attempt !== 0 || receivedText ||
                error?.code !== "assistant_focus_stale" || !focus.conversation) throw error;
            // This code is emitted only before any model call. Later source changes
            // are recovered by the server within its existing paid-call budget.
            pending.attempt = 1; resetAnswer(); setStage("refreshing");
            focus = await refreshFocus(focus, pinnedEvaluationId, controller.signal, stillCurrent);
            if (!stillCurrent() || controller.signal.aborted) return;
            pending.focus = focus;
          }
        }
        if (!stillCurrent()) {
          if (pending?.number === requestNumber) { cancel(); activate(); renderLog(); }
          return;
        }
        const reply = safeReply(result);
        if (!reply) throw new DA.ApiError("invalid_response", "Invalid assistant response", 502);
        const stick = body.scrollHeight - body.scrollTop - body.clientHeight < 100;
        session.history.push({ role: "user", content: message }, { role: "assistant", content: reply.answer, reply });
        session.draft = ""; session.notice = null;
        pending = null; input.value = ""; persist(); renderLog(); syncControls();
        if (stick) scrollEnd();
      } catch (error) {
        if (!stillCurrent()) {
          if (pending?.number === requestNumber) { cancel(); activate(); renderLog(); }
          return;
        }
        pending = null; session.draft = message; input.value = message;
        const changed = ["assistant_focus_stale", "assistant_source_changed", "stale_source"].includes(error?.code);
        showNotice(error?.name === "AbortError" ? { key: "stopped" } : changed ? { key: "sourceChanged" } : DA.apiErrorMessage(error), true);
        persist(); renderLog(); syncControls();
      } finally {
        if (current === session && !pending) syncControls();
      }
    }
    function refreshData() {
      renderChrome();
    }
    element.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); if (historyOpen) setHistory(false); else setOpen(false); }
    }, { signal: events.signal });
    for (const name of ["da:evaluations-changed", "da:appeals-changed", "da:checklists-changed"])
      window.addEventListener(name, refreshData, { signal: events.signal });
    window.addEventListener("da:locale-changed", renderChrome, { signal: events.signal });
    window.addEventListener("hashchange", refreshData, { signal: events.signal });
    window.addEventListener("pagehide", persist, { signal: events.signal });

    singleton = {
      element,
      open(options) {
        const opts = options || {};
        activate(); setOpen(true);
        if (text(opts.message, 2000, false) && !pending) {
          input.value = opts.message; current.draft = opts.message; persist(); syncControls(); input.focus();
        }
      },
      close() { setOpen(false); },
      setScope(options) {
        const filters = safeScope(options?.filters || {});
        if (!filters) return;
        workspace = { filters, route: location.hash || "#/" };
        renderChrome();
      },
      bindConversation(options) {
        const owner = ++ownerSequence;
        conversation = { owner, value: options.conversation, evaluation: options.evaluation, onCitation: options.onCitation };
        renderChrome();
        return {
          element: h("span", { hidden: true, "aria-hidden": "true" }),
          updateEvaluation(value) {
            if (conversation?.owner !== owner) return;
            conversation.evaluation = value; refreshData();
          },
          dispose() {
            if (conversation?.owner !== owner) return;
            conversation = null; renderChrome();
          }
        };
      },
      syncRole() { activate(); },
      dispose() {
        cancel(); events.abort(); timers.forEach(clearTimeout); persist();
        DA.i18n.release(element); element.remove(); singleton = null;
      }
    };
    renderChrome();
    return singleton;
  };
  DA.setAssistantScope = (options) => DA.initAssistant().setScope(options);
  DA.openAssistant = (options) => DA.initAssistant().open(options);
  DA.syncAssistantRole = () => singleton?.syncRole();
  DA.conversationAssistant = (options) => DA.initAssistant().bindConversation(options);
})();
