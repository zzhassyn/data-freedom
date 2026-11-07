/* Загрузка файла и синхронизация обращений с CRM. */
(function () {
  const DA = window.DA, h = DA.h;
  const M = (key, params) => DA.msg(`upload.${key}`, params);
  const T = (key, params) => DA.t(`upload.${key}`, params);
  const textOf = (value) => DA.i18n.isMessage(value) ? DA.t(value.key, value.params) : String(value || "");
  const bind = (node, value) => DA.i18n.bindText(node, DA.i18n.isMessage(value) ? value : () => String(value || ""));
  DA.i18n.addMessages(Object.fromEntries(Object.entries({
    file: ["Из файла", "Файлдан", "From file"], crm: ["Из CRM", "CRM жүйесінен", "From CRM"],
    source: ["Откуда загрузить", "Жүктеу көзі", "Import source"], title: ["Загрузить обращения", "Өтініштерді жүктеу", "Import conversations"],
    cancel: ["Отмена", "Бас тарту", "Cancel"], save: ["Сохранить", "Сақтау", "Save"], saved: ["Сохранено", "Сақталды", "Saved"],
    sync: ["Синхронизировать", "Синхрондау", "Sync"], dataset: ["Набор обращений", "Өтініштер жиыны", "Conversation dataset"],
    settings: ["Настройки источника", "Дереккөз баптаулары", "Source settings"],
    groupError: ["Укажите набор обращений, до 100 символов.", "Өтініштер жиынын көрсетіңіз, 100 таңбадан аспасын.", "Enter a dataset name, up to 100 characters."],
    genericError: ["Не удалось выполнить действие. Попробуйте ещё раз.", "Әрекет орындалмады. Қайталап көріңіз.", "The action could not be completed. Try again."],
    neverSync: ["Ещё не синхронизировали", "Әлі синхрондалмаған", "Not synced yet"], today: ["сегодня", "бүгін", "today"],
    lastSync: ["Последняя синхронизация {day} в {time}", "Соңғы синхрондау: {day}, {time}", "Last synced {day} at {time}"],
    checking: ["Проверяем источник обращений", "Өтініштер көзін тексерудеміз", "Checking the conversation source"],
    sourceName: ["CRM Freedom, обращения отдела поддержки", "Freedom CRM, қолдау бөлімінің өтініштері", "Freedom CRM, support conversations"],
    result: ["Новых {imported}, обновлено {updated}, без изменений {unchanged}", "Жаңа: {imported}, жаңартылған: {updated}, өзгеріссіз: {unchanged}", "New: {imported}, updated: {updated}, unchanged: {unchanged}"],
    waitingCrm: ["Ждём ответ CRM", "CRM жауабын күтудеміз", "Waiting for CRM"],
    syncProgress: ["Ход синхронизации", "Синхрондау барысы", "Sync progress"],
    progress: ["{processed} из {total}", "{total} ішінен {processed}", "{processed} of {total}"],
    savingCrm: ["Сохраняем обращения из CRM", "CRM өтініштерін сақтаудамыз", "Saving CRM conversations"],
    refreshing: ["Обновляем реестр", "Тізілімді жаңартудамыз", "Refreshing the registry"],
    syncDone: ["Синхронизация завершена", "Синхрондау аяқталды", "Sync complete"],
    refresh: ["Обновить реестр", "Тізілімді жаңарту", "Refresh registry"],
    recordsSaved: ["Обращения сохранены", "Өтініштер сақталды", "Conversations saved"],
    registryError: ["{error} Реестр пока не обновился.", "{error} Тізілім әлі жаңартылған жоқ.", "{error} The registry has not refreshed yet."],
    newStarted: ["Оценка новых обращений запущена.", "Жаңа өтініштерді бағалау басталды.", "Evaluation of new conversations has started."],
    retryEvaluation: ["Повторить запуск оценки", "Бағалауды қайта іске қосу", "Retry starting evaluation"],
    skipped: ["Повторная обработка существующих обращений пропущена.", "Бар өтініштерді қайта өңдеу өткізілді.", "Reprocessing of existing conversations was skipped."],
    reprocessStarted: ["Повторная обработка запущена: {count}.", "Қайта өңдеу басталды: {count}.", "Reprocessing started: {count}."],
    existing: ["У вас уже есть {count}", "Сізде {count} бар", "You already have {count}"],
    reprocessCalls: ["Мы заново расшифруем звонки и оценим эти обращения.", "Қоңырауларды қайта мәтінге айналдырып, осы өтініштерді қайта бағалаймыз.", "We will transcribe the calls and evaluate these conversations again."],
    reprocessRecords: ["Мы заново оценим эти обращения.", "Осы өтініштерді қайта бағалаймыз.", "We will evaluate these conversations again."],
    evaluationError: ["Не удалось начать оценку. {error}", "Бағалауды бастау мүмкін болмады. {error}", "Could not start evaluation. {error}"],
    transcriptionError: ["Не удалось запустить расшифровку звонков: {count}. {error}", "Қоңырауларды мәтінге айналдыру басталмады: {count}. {error}", "Could not start transcription for {count} calls. {error}"],
    onlyTranscription: ["Оценка уже запущена. Повторим только расшифровку, которая не началась.", "Бағалау басталды. Тек басталмаған мәтінге айналдыруды қайталаймыз.", "Evaluation has already started. Only transcription that did not start will be retried."],
    starting: ["Запускаем обработку", "Өңдеуді бастаудамыз", "Starting processing"],
    retryStart: ["Повторить запуск", "Қайта іске қосу", "Retry start"],
    reprocess: ["Обработать заново", "Қайта өңдеу", "Process again"], skip: ["Пропустить", "Өткізу", "Skip"],
    transcription: ["Расшифровка звонков", "Қоңырауларды мәтінге айналдыру", "Call transcription"],
    transcribing: ["Расшифровываем звонки", "Қоңырауларды мәтінге айналдырудамыз", "Transcribing calls"],
    background: ["Продолжить в фоне", "Фонда жалғастыру", "Continue in background"], done: ["Готово", "Дайын", "Done"],
    dragFile: ["Перетащите файл выгрузки", "Экспорт файлын осында сүйреңіз", "Drop your export file here"],
    or: ["или ", "немесе ", "or "], browse: ["выберите его на компьютере", "компьютерден таңдаңыз", "choose it from your computer"],
    format: ["Выгрузка обращений из CRM в формате JSON", "CRM өтініштерінің JSON пішіміндегі экспорты", "CRM conversation export in JSON format"],
    readError: ["Не удалось открыть файл. Попробуйте выбрать его ещё раз.", "Файлды ашу мүмкін болмады. Қайта таңдап көріңіз.", "Could not open the file. Try selecting it again."],
    updated: ["Реестр обновлён", "Тізілім жаңартылды", "Registry updated"],
    add: ["Добавить {count}", "{count} қосу", "Add {count}"], continue: ["Продолжить", "Жалғастыру", "Continue"],
    fileStillSelected: ["{error} Файл остался выбранным, можно повторить сохранение.", "{error} Файл таңдалған күйде қалды, сақтауды қайталауға болады.", "{error} The file is still selected; you can retry saving it."],
    inFile: ["{count} в файле", "Файлда {count}", "{count} in the file"], otherFile: ["Выбрать другой", "Басқасын таңдау", "Choose another"],
    chats: ["Чатов", "Чаттар", "Chats"], calls: ["Звонков", "Қоңыраулар", "Calls"], new: ["Новых", "Жаңа", "New"],
    changed: ["Изменено: {count}. Обновим их; прежние оценки станут устаревшими.", "Өзгертілген: {count}. Оларды жаңартамыз; бұрынғы бағалар ескіреді.", "Changed: {count}. These conversations will be updated and previous evaluations will become outdated."],
    newAuto: ["Новые обращения начнут оцениваться после загрузки.", "Жүктегеннен кейін жаңа өтініштерді бағалау басталады.", "New conversations will be evaluated after import."],
    callsAuto: [" Для звонков также запустится расшифровка.", " Қоңырауларды мәтінге айналдыру да басталады.", " Calls will also be transcribed."],
    known: ["Уже есть в реестре без изменений: {count}. После загрузки можно обработать их заново или пропустить.", "Тізілімде өзгеріссіз бар: {count}. Жүктегеннен кейін қайта өңдеуге немесе өткізуге болады.", "Already in the registry unchanged: {count}. After import, you can process them again or skip them."],
    jsonError: ["Не удалось прочитать файл. Нужна выгрузка обращений в формате JSON.", "Файлды оқу мүмкін болмады. JSON пішіміндегі өтініштер экспорты қажет.", "Could not read the file. A JSON conversation export is required."],
    emptyFile: ["В файле нет обращений: ожидается выгрузка с полем records.", "Файлда өтініштер жоқ: records өрісі бар экспорт қажет.", "No conversations found: the export must contain a records field."],
    incomplete: ["Обращение {n} записано не полностью.", "{n}-өтініш толық жазылмаған.", "Conversation {n} is incomplete."],
    missingId: ["У обращения {n} нет идентификатора.", "{n}-өтініштің идентификаторы жоқ.", "Conversation {n} has no identifier."],
    duplicate: ["Обращения {first} и {n} повторяют друг друга.", "{first} және {n} өтініштері қайталанады.", "Conversations {first} and {n} are duplicates."],
    unknownChannel: ["У обращения {n} неизвестный канал: ожидается чат или звонок.", "{n}-өтініштің арнасы белгісіз: чат немесе қоңырау болуы керек.", "Conversation {n} has an unknown channel: expected chat or call."],
    unknownLanguage: ["У обращения {n} неизвестный язык: ожидается русский, казахский или английский.", "{n}-өтініштің тілі белгісіз: орыс, қазақ немесе ағылшын тілі болуы керек.", "Conversation {n} has an unknown language: expected Russian, Kazakh, or English."],
    noTurns: ["У обращения {n} нет реплик.", "{n}-өтініште репликалар жоқ.", "Conversation {n} has no transcript turns."],
    invalidTurn: ["В обращении {n} реплика {turn} без текста или без автора.", "{n}-өтініштің {turn}-репликасында мәтін немесе автор жоқ.", "Turn {turn} in conversation {n} is missing its text or speaker."],
    invalidTime: ["В обращении {n} у реплики {turn} непонятное время.", "{n}-өтініштің {turn}-репликасының уақыты белгісіз.", "Turn {turn} in conversation {n} has an invalid timestamp."]
  }).map(([key, [ru, kk, en]]) => [`upload.${key}`, { ru, kk, en }])));
  const conversations = (count) => DA.i18n.locale() === "ru" ? `${count} ${DA.fmt.plural(count, ["обращение", "обращения", "обращений"])}` : DA.i18n.locale() === "kk" ? `${count} өтініш` : `${count} conversation${count === 1 ? "" : "s"}`;
  const LANGS = ["RU", "KZ", "EN"];
  const CHANNELS = ["agent chat", "voice call"];
  const errorText = (error) => error instanceof DA.ApiError ? error.message : M("genericError");

  function stats(records) {
    const calls = records.filter((r) => r.channel === "voice call").length;
    const langs = LANGS.map((l) => [l, records.filter((r) => r.language === l).length]).filter(([, n]) => n);
    return { total: records.length, calls, chats: records.length - calls, langs };
  }

  const resultText = (r) => M("result", r);

  /* ---------- Разбор файла выгрузки ---------- */
  const validTime = (ts) => typeof ts === "string" && (/^\d+:\d{2}$/.test(ts) || (ts.includes("T") && !isNaN(Date.parse(ts.slice(0, 23) + ts.slice(-6)))));

  function parseExport(text) {
    let json;
    try { json = JSON.parse(text.replace(/^﻿/, "")); } catch (e) { return { error: M("jsonError") }; }
    const records = Array.isArray(json) ? json : json && json.data && Array.isArray(json.data.records) ? json.data.records : json && Array.isArray(json.records) ? json.records : null;
    if (!records || !records.length) return { error: M("emptyFile") };
    const seen = new Map();
    for (let i = 0; i < records.length; i++) {
      const r = records[i], n = i + 1;
      if (!r || typeof r !== "object") return { error: M("incomplete", { n }) };
      if (typeof r.conversation_id !== "string" || !r.conversation_id.trim()) return { error: M("missingId", { n }) };
      if (seen.has(r.conversation_id)) return { error: M("duplicate", { first: seen.get(r.conversation_id), n }) };
      seen.set(r.conversation_id, n);
      if (!CHANNELS.includes(r.channel)) return { error: M("unknownChannel", { n }) };
      if (!LANGS.includes(r.language)) return { error: M("unknownLanguage", { n }) };
      if (!Array.isArray(r.transcript) || !r.transcript.length) return { error: M("noTurns", { n }) };
      for (let j = 0; j < r.transcript.length; j++) {
        const t = r.transcript[j];
        if (!t || typeof t.text !== "string" || !t.text.trim() || !Object.hasOwn(DA.speakerLabel, t.speaker)) return { error: M("invalidTurn", { n, turn: j + 1 }) };
        if (!validTime(t.timestamp)) return { error: M("invalidTime", { n, turn: j + 1 }) };
      }
    }
    const fresh = records.filter((r) => !DA.state.conversations[r.conversation_id]);
    const updated = records.filter((r) => {
      const old = DA.state.conversations[r.conversation_id];
      return old && DA.transcriptKey(old.transcript) !== DA.transcriptKey(r.transcript);
    });
    return { records, fresh, updated, stats: stats(records) };
  }

  /* ---------- Окно загрузки ---------- */
  DA.openUpload = function (onDone) {
    const backend = DA.mode === "server";
    const pane = h("div", { class: "da-up-pane" });
    const foot = h("div", { class: "da-up-foot" });
    let tab = "file", busy = false, closed = false, ready = !backend, secondStep = false, detachStt = null;
    let source = DA.state.source || { groupId: "DEV", lastSyncAt: null, lastResult: null };
    let sourceError = "", settingsOpen = false, draftGroup = source.groupId;
    const processing = new WeakMap();

    const tabs = backend ? DA.segmented([{ value: "file", label: M("file") }, { value: "crm", label: M("crm") }], tab, (v) => { tab = v; show(); }, M("source")) : null;
    if (tabs) tabs.classList.add("da-up-tabs");

    const m = DA.modal({
      title: M("title"),
      body: [tabs, pane],
      foot,
      onClose() { closed = true; detachStt?.(); document.removeEventListener("dragover", block); document.removeEventListener("drop", block); }
    });
    /* Файл, брошенный мимо зоны, не должен открываться в браузере вместо страницы. */
    function block(e) { e.preventDefault(); }
    document.addEventListener("dragover", block);
    document.addEventListener("drop", block);

    function setBusy(on) {
      busy = on;
      if (tabs) {
        tabs.classList.toggle("is-locked", on);
        tabs.querySelectorAll("button").forEach((b) => { b.disabled = on; });
      }
    }
    function swap(nodes, actions) {
      pane.replaceChildren(...[nodes].flat().filter((node) => node != null && node !== false));
      pane.classList.remove("is-in"); void pane.offsetWidth; pane.classList.add("is-in");
      foot.replaceChildren(...actions);
    }
    const cancelBtn = () => h("button", { class: "da-btn", type: "button", onclick: () => m.close() }, M("cancel"));
    function show() { if (!busy && !secondStep) (tab === "crm" ? crmPane : filePane)(); }

    /* Режим выбран при запуске. Сбой источника не переключает его на данные браузера. */
    const initialization = (async () => {
      if (backend) {
        try { source = await DA.api.getSource(); draftGroup = source.groupId; DA.state.source = source; }
        catch (e) { sourceError = errorText(e); }
      }
      ready = true;
      if (!closed && tab === "crm" && !busy && !secondStep) crmPane();
    })();

    /* ----- Из CRM ----- */
    function lastSyncLabel() {
      if (!source.lastSyncAt) return T("neverSync");
      const d = new Date(source.lastSyncAt);
      const day = d.toDateString() === new Date().toDateString() ? T("today") : d.toLocaleDateString(DA.i18n.locale(), { day: "numeric", month: "long" });
      return T("lastSync", { day, time: d.toLocaleTimeString(DA.i18n.locale(), { hour: "2-digit", minute: "2-digit" }) });
    }

    function crmPane() {
      const error = h("p", { class: "da-up-error", role: "alert", hidden: !sourceError }, sourceError);
      const input = h("input", { class: "da-input", value: draftGroup, maxlength: 100, autocomplete: "off", disabled: !ready });
      const saved = h("span", { class: "da-small da-muted", role: "status" });
      const save = h("button", { class: "da-btn", type: "button", disabled: !ready }, M("save"));
      const load = h("button", { class: "da-btn is-primary", type: "button", disabled: !ready }, DA.icon("refresh"), M("sync"));
      const field = h("div", { class: "da-source-settings", hidden: !settingsOpen },
        h("label", { class: "da-field" }, h("span", {}, M("dataset")), input),
        h("div", { class: "da-source-save" }, save, saved));
      const toggle = h("button", { class: "da-btn is-text is-sm", type: "button", "aria-expanded": String(settingsOpen), onclick: () => {
        settingsOpen = !settingsOpen;
        field.hidden = !settingsOpen;
        toggle.setAttribute("aria-expanded", String(settingsOpen));
        if (settingsOpen) input.focus();
      } }, M("settings"));
      input.addEventListener("input", () => { draftGroup = input.value; bind(saved, ""); });
      const fail = (message) => { sourceError = message; bind(error, message); error.hidden = false; };
      async function saveSource() {
        const groupId = draftGroup.trim();
        if (!groupId || groupId.length > 100) { fail(M("groupError")); input.focus(); return false; }
        await DA.api.putSource({ groupId });
        if (groupId !== source.groupId) source = { groupId, lastSyncAt: null, lastResult: null };
        draftGroup = groupId;
        DA.state.source = source;
        return true;
      }
      save.addEventListener("click", async () => {
        setBusy(true); save.disabled = load.disabled = input.disabled = true;
        try {
          if (await saveSource()) {
            sourceError = ""; error.hidden = true; bind(saved, M("saved"));
            DA.i18n.refresh(last.firstChild);
          }
        } catch (e) { fail(errorText(e)); }
        finally { setBusy(false); save.disabled = load.disabled = input.disabled = false; }
      });
      load.addEventListener("click", async () => {
        setBusy(true); save.disabled = load.disabled = input.disabled = true;
        try {
          if (!await saveSource()) return;
          sourceError = "";
          await synchronize();
        } catch (e) {
          sourceError = errorText(e);
          if (!closed) crmPane();
        } finally {
          setBusy(false); save.disabled = load.disabled = input.disabled = false;
        }
      });
      const last = h("p", { class: "da-up-note", role: "status" }, DA.msg(() => ready ? lastSyncLabel() : T("checking")));
      swap(h("div", { class: "da-source" },
        h("p", { class: "da-source-name" }, M("sourceName")), last,
        source.lastResult ? h("p", { class: "da-up-note" }, resultText(source.lastResult)) : null,
        load, toggle, field, error), []);
    }

    async function synchronize() {
      const title = h("b"); bind(title, M("waitingCrm"));
      const count = h("span");
      const bar = h("progress", { max: 1, "aria-label": M("syncProgress") });
      swap(h("div", { class: "da-up-progress", role: "status", "aria-live": "polite" },
        h("div", { class: "da-up-progress-head" }, title, count), bar), []);
      const progress = (processed, total, label) => {
        bind(title, label);
        bind(count, M("progress", { processed, total }));
        bar.max = total || 1; bar.value = processed;
      };
      const result = await DA.api.syncSource({ onProgress(event) {
        if (event.stage === "importing") progress(event.processed, event.total, M("savingCrm"));
      } });
      source = { groupId: source.groupId, lastSyncAt: result.lastSyncAt,
        lastResult: { imported: result.imported, updated: result.updated, unchanged: result.unchanged } };
      DA.state.source = source;
      bind(title, M("refreshing"));
      bind(count, "");
      bar.removeAttribute("value");
      await finishServerImport(M("syncDone"), result);
    }

    /* После сохранения повторяем только загрузку реестра, а не уже завершённый импорт. */
    async function finishServerImport(title, result, ids) {
      const work = processingFor(result);
      if (work.sttActive) DA.stt.trackImport(result, { groupId: tab === "crm" ? source.groupId : null });
      await startNew(work);
      DA.data.invalidate("conversations");
      try {
        await DA.data.refresh();
        onDone && onDone(ids || []);
        if (!closed) processingView(title, work);
      } catch (e) {
        if (closed) return;
        const retry = h("button", { class: "da-btn is-primary", type: "button", onclick: async () => {
          setBusy(true); retry.disabled = true; retry.classList.add("is-busy");
          try { await finishServerImport(title, result, ids); }
          finally { setBusy(false); retry.disabled = false; retry.classList.remove("is-busy"); }
        } }, M("refresh"));
        swap(h("div", { class: "da-up-done" },
          h("h3", {}, M("recordsSaved")), h("p", {}, resultText(result)),
          h("p", { class: "da-up-error", role: "alert" }, M("registryError", () => ({ error: textOf(errorText(e)) })))), [cancelBtn(), retry]);
      }
    }

    function processingFor(result) {
      if (!processing.has(result)) processing.set(result, { result,
        newIds: [...new Set(result.newConversationIds || [])], existingIds: [...new Set(result.existingConversationIds || [])],
        newAccepted: false, newBusy: false, newError: "", choice: null, existingBusy: false, existingAccepted: false,
        existingError: "", voiceFailures: [], voiceStarted: new Set(), sttActive: backend && result.sttQueued > 0 && !!DA.stt, view: null });
      return processing.get(result);
    }
    async function startNew(work) {
      if (work.newAccepted || work.newBusy || !(backend ? work.result.evaluationJob : work.newIds.length)) return;
      work.newBusy = true; work.newError = "";
      try {
        if (backend) await DA.bulk.adopt(work.result.evaluationJob, { source: "import", reuse: false });
        else await DA.bulk.start(work.newIds, { checklistVersion: DA.activeChecklist().version, reuse: false, source: "import", allowConcurrent: true });
        work.newAccepted = true;
      } catch (error) { work.newError = errorText(error); }
      finally { work.newBusy = false; if (!closed) renderProcessing(work); }
    }
    async function processExisting(work) {
      if (work.existingBusy || !work.existingIds.length) return;
      const voices = backend ? work.existingIds.filter((id) => {
        const conv = DA.state.conversations[id];
        return conv?.channel === "voice call" && (conv.audio_url || conv.audioUrl) && !work.voiceStarted.has(id);
      }) : [];
      work.existingBusy = true; work.choice = "processing"; work.existingError = ""; work.voiceFailures = [];
      renderProcessing(work);
      const evaluate = async () => {
        if (work.existingAccepted) return;
        try {
          await DA.bulk.start(work.existingIds, { checklistVersion: DA.activeChecklist().version, reuse: false, source: "import", allowConcurrent: true });
          work.existingAccepted = true;
        } catch (error) { work.existingError = errorText(error); }
      };
      const transcribe = async () => {
        const responses = await Promise.allSettled(voices.map((id) => DA.api.retryTranscription(id, { force: true })));
        const accepted = [];
        responses.forEach((response, i) => {
          if (response.status === "fulfilled") { accepted.push(voices[i]); work.voiceStarted.add(voices[i]); }
          else work.voiceFailures.push({ id: voices[i], error: errorText(response.reason) });
        });
        if (accepted.length) {
          work.sttActive = true;
          DA.stt.trackImport({ sttQueued: accepted.length, sttConversationIds: accepted }, { append: true });
        }
      };
      await Promise.all([evaluate(), transcribe()]);
      work.existingBusy = false;
      work.choice = work.existingAccepted && !work.voiceFailures.length ? "processed" : "error";
      if (!closed) { renderProcessing(work); ensureStt(work); }
    }
    function renderProcessing(work) {
      if (!work.view || closed) return;
      const { receipt, decision } = work.view;
      receipt.replaceChildren(...[
        !work.sttActive ? h("p", { class: "da-up-note" }, resultText(work.result)) : null,
        work.newAccepted ? h("p", { class: "da-up-note" }, M("newStarted")) : null,
        work.newError ? h("div", { class: "stt-import-error", role: "alert" }, h("p", {}, work.newError),
          h("button", { class: "da-btn", type: "button", disabled: work.newBusy, onclick: () => startNew(work) }, M("retryEvaluation"))) : null
      ].filter(Boolean));
      const count = work.existingIds.length;
      decision.hidden = !count;
      if (!count) return;
      if (work.choice === "skipped") {
        decision.replaceChildren(h("p", { class: "stt-import-choice" }, DA.icon("check", 17), M("skipped")));
      } else if (work.choice === "processed") {
        decision.replaceChildren(h("p", { class: "stt-import-choice" }, DA.icon("check", 17), M("reprocessStarted", () => ({ count: conversations(count) }))));
      } else {
        const hasCalls = backend && work.existingIds.some((id) => {
          const conv = DA.state.conversations[id];
          return conv?.channel === "voice call" && (conv.audio_url || conv.audioUrl);
        });
        decision.replaceChildren(h("h3", {}, M("existing", () => ({ count: conversations(count) }))),
          h("p", {}, hasCalls ? M("reprocessCalls") : M("reprocessRecords")),
          ...[work.existingError ? h("p", { class: "da-error", role: "alert" }, M("evaluationError", () => ({ error: textOf(work.existingError) }))) : null,
            work.voiceFailures.length ? h("p", { class: "da-error", role: "alert" }, M("transcriptionError", () => ({ count: work.voiceFailures.length, error: textOf(work.voiceFailures[0].error) }))) : null,
            work.choice === "error" && work.existingAccepted ? h("p", { class: "da-up-note" }, M("onlyTranscription")) : null
          ].filter(Boolean),
          h("div", { class: "stt-import-actions" },
            h("button", { class: `da-btn is-primary${work.existingBusy ? " is-busy" : ""}`, type: "button", disabled: work.existingBusy, onclick: () => processExisting(work) },
              M(work.existingBusy ? "starting" : work.choice === "error" ? "retryStart" : "reprocess")),
            !work.choice ? h("button", { class: "da-btn", type: "button", onclick: () => { work.choice = "skipped"; renderProcessing(work); } }, M("skip")) : null));
      }
    }
    function ensureStt(work) {
      if (!work.view || closed || !work.sttActive || work.view.attached) return;
      work.view.attached = true;
      const host = work.view.stt;
      if (work.existingIds.length) host.append(h("h3", { class: "stt-import-section" }, M("transcription")));
      const content = h("div"); host.append(content);
      m.panel.classList.add("stt-modal");
      if (!work.existingIds.length) bind(m.panel.querySelector(".da-modal-head h2"), M("transcribing"));
      detachStt = DA.stt.attach({ pane: content, foot, close: () => m.close(), receipt: resultText(work.result) });
    }
    function processingView(title, work) {
      secondStep = true;
      if (tabs) tabs.hidden = true;
      detachStt?.(); detachStt = null;
      bind(m.panel.querySelector(".da-modal-head h2"), title);
      const receipt = h("div"), decision = h("div", { class: "stt-import-duplicates" }), stt = h("div", { class: "stt-import-progress" });
      pane.replaceChildren(receipt, decision, stt);
      work.view = { receipt, decision, stt, attached: false };
      foot.replaceChildren(h("button", { class: "da-btn", type: "button", onclick: () => m.close() }, M(work.newAccepted ? "background" : "done")));
      renderProcessing(work); ensureStt(work);
    }

    /* ----- Из файла ----- */
    function filePane() {
      const input = h("input", { type: "file", accept: ".json,application/json", class: "da-sr" });
      const zone = h("label", { class: "da-drop da-up-drop" }, input,
        h("span", { class: "da-up-drop-icon" }, DA.icon("upload")),
        h("b", {}, M("dragFile"), h("br"), M("or"), h("u", {}, M("browse"))),
        h("span", { class: "da-small da-muted" }, M("format")));
      const error = h("p", { class: "da-up-error", role: "alert", hidden: true });
      input.addEventListener("change", () => input.files[0] && read(input.files[0], error));
      watchDrag(zone, error);
      swap([zone, error], [cancelBtn()]);
    }

    /* Подсветка зоны, пока файл над окном. Счётчик нужен, потому что dragleave приходит от каждого вложенного элемента. */
    let depth = 0, dropTarget = null, dropError = null;
    function watchDrag(zone, error) { dropTarget = zone; dropError = error; depth = 0; }
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    m.panel.addEventListener("dragenter", (e) => { if (!hasFiles(e) || tab !== "file" || busy || !dropTarget || !dropTarget.isConnected) return; depth++; dropTarget.classList.add("is-over"); });
    m.panel.addEventListener("dragleave", () => { if (depth && --depth === 0) dropTarget.classList.remove("is-over"); });
    m.panel.addEventListener("drop", (e) => {
      if (tab !== "file" || busy || !dropTarget || !dropTarget.isConnected) return;
      depth = 0;
      dropTarget.classList.remove("is-over");
      const f = e.dataTransfer.files[0];
      if (f) read(f, dropError);
    });

    function read(file, error) {
      const reader = new FileReader();
      reader.onload = () => {
        if (closed) return;
        const r = parseExport(String(reader.result));
        if (r.error) { error.replaceChildren(DA.icon("alert", 16), DA.i18n.text(r.error)); error.hidden = false; return; }
        previewPane(file, r);
      };
      reader.onerror = () => { error.replaceChildren(DA.icon("alert", 16), DA.i18n.text(M("readError"))); error.hidden = false; };
      reader.readAsText(file);
    }

    function previewPane(file, r) {
      const s = r.stats, n = r.fresh.length, changed = r.updated.length, known = s.total - n - changed;
      const add = h("button", { class: "da-btn is-primary", type: "button" },
        DA.icon(changed ? "refresh" : "plus"), changed ? M("refresh") : n ? M("add", () => ({ count: conversations(n) })) : M("continue"));
      const error = h("p", { class: "da-up-error", role: "alert", hidden: true });
      add.addEventListener("click", async () => {
        setBusy(true); add.disabled = true; add.classList.add("is-busy");
        try {
          await initialization;
          if (backend) {
            const result = await DA.api.uploadConversations(r.records);
            await finishServerImport(M("updated"), result, [...r.fresh, ...r.updated].map((rec) => rec.conversation_id));
          } else {
            const result = { ...DA.upsertConversations(r.records), newConversationIds: r.fresh.map((rec) => rec.conversation_id),
              existingConversationIds: r.records.filter((rec) => !r.fresh.some((fresh) => fresh.conversation_id === rec.conversation_id)).map((rec) => rec.conversation_id) };
            const work = processingFor(result);
            await startNew(work);
            onDone && onDone(result.ids);
            if (!closed) processingView(M("updated"), work);
          }
        } catch (e) {
          bind(error, M("fileStillSelected", () => ({ error: textOf(errorText(e)) })));
          error.hidden = false;
        } finally { setBusy(false); add.disabled = false; add.classList.remove("is-busy"); }
      });
      const stat = (label, value) => h("div", { class: "da-up-stat" }, h("span", {}, label), h("b", {}, value));
      swap([
        h("div", { class: "da-up-file" },
          h("span", { class: "da-up-file-icon" }, DA.icon("list")),
          h("div", {}, h("b", {}, file.name), h("span", {}, M("inFile", () => ({ count: conversations(s.total) })))),
          h("button", { class: "da-btn is-text is-sm", type: "button", onclick: filePane }, M("otherFile"))),
        h("div", { class: "da-up-stats" },
          stat(M("chats"), s.chats), stat(M("calls"), s.calls),
          s.langs.map(([l, c]) => stat(DA.msg(() => DA.langLabel[l]), c)),
          stat(M("new"), n)),
        changed ? h("p", { class: "da-up-note" }, M("changed", () => ({ count: conversations(changed) }))) : null,
        n ? h("p", { class: "da-up-note" }, M("newAuto"), backend && r.fresh.some((rec) => rec.channel === "voice call") ? M("callsAuto") : "") : null,
        known ? h("p", { class: "da-up-note" }, M("known", () => ({ count: conversations(known) })))
          : null,
        error
      ], [cancelBtn(), add]);
    }

    show();
    return m;
  };
})();
