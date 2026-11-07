/* Загрузка файла и синхронизация обращений с CRM. */
(function () {
  const DA = window.DA, h = DA.h;
  const plural = (n, forms) => `${n} ${DA.fmt.plural(n, forms)}`;
  const CONV = ["обращение", "обращения", "обращений"];
  const LANGS = ["RU", "KZ", "EN"];
  const CHANNELS = ["agent chat", "voice call"];
  const errorText = (error) => error instanceof DA.ApiError ? error.message : "Не удалось выполнить действие. Попробуйте ещё раз.";

  function stats(records) {
    const calls = records.filter((r) => r.channel === "voice call").length;
    const langs = LANGS.map((l) => [l, records.filter((r) => r.language === l).length]).filter(([, n]) => n);
    return { total: records.length, calls, chats: records.length - calls, langs };
  }

  const resultText = (r) => `Новых ${r.imported}, обновлено ${r.updated}, без изменений ${r.unchanged}`;

  /* ---------- Разбор файла выгрузки ---------- */
  const validTime = (ts) => typeof ts === "string" && (/^\d+:\d{2}$/.test(ts) || (ts.includes("T") && !isNaN(Date.parse(ts.slice(0, 23) + ts.slice(-6)))));

  function parseExport(text) {
    let json;
    try { json = JSON.parse(text.replace(/^﻿/, "")); } catch (e) { return { error: "Не удалось прочитать файл. Нужна выгрузка обращений в формате JSON." }; }
    const records = Array.isArray(json) ? json : json && json.data && Array.isArray(json.data.records) ? json.data.records : json && Array.isArray(json.records) ? json.records : null;
    if (!records || !records.length) return { error: "В файле нет обращений: ожидается выгрузка с полем records." };
    const seen = new Map();
    for (let i = 0; i < records.length; i++) {
      const r = records[i], n = i + 1;
      if (!r || typeof r !== "object") return { error: `Обращение ${n} записано не полностью.` };
      if (typeof r.conversation_id !== "string" || !r.conversation_id.trim()) return { error: `У обращения ${n} нет идентификатора.` };
      if (seen.has(r.conversation_id)) return { error: `Обращения ${seen.get(r.conversation_id)} и ${n} повторяют друг друга.` };
      seen.set(r.conversation_id, n);
      if (!CHANNELS.includes(r.channel)) return { error: `У обращения ${n} неизвестный канал: ожидается чат или звонок.` };
      if (!LANGS.includes(r.language)) return { error: `У обращения ${n} неизвестный язык: ожидается русский, казахский или английский.` };
      if (!Array.isArray(r.transcript) || !r.transcript.length) return { error: `У обращения ${n} нет реплик.` };
      for (let j = 0; j < r.transcript.length; j++) {
        const t = r.transcript[j];
        if (!t || typeof t.text !== "string" || !t.text.trim() || !Object.hasOwn(DA.speakerLabel, t.speaker)) return { error: `В обращении ${n} реплика ${j + 1} без текста или без автора.` };
        if (!validTime(t.timestamp)) return { error: `В обращении ${n} у реплики ${j + 1} непонятное время.` };
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
    let tab = "file", busy = false, closed = false, ready = !backend;
    let source = DA.state.source || { groupId: "DEV", lastSyncAt: null, lastResult: null };
    let sourceError = "", settingsOpen = false, draftGroup = source.groupId;

    const tabs = backend ? DA.segmented([{ value: "file", label: "Из файла" }, { value: "crm", label: "Из CRM" }], tab, (v) => { tab = v; show(); }, "Откуда загрузить") : null;
    if (tabs) tabs.classList.add("da-up-tabs");

    const m = DA.modal({
      title: "Загрузить обращения",
      body: [tabs, pane],
      foot,
      onClose() { closed = true; document.removeEventListener("dragover", block); document.removeEventListener("drop", block); }
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
    const cancelBtn = () => h("button", { class: "da-btn", type: "button", onclick: () => m.close() }, "Отмена");
    function show() { if (!busy) (tab === "crm" ? crmPane : filePane)(); }

    /* Режим выбран при запуске. Сбой источника не переключает его на данные браузера. */
    const initialization = (async () => {
      if (backend) {
        try { source = await DA.api.getSource(); draftGroup = source.groupId; DA.state.source = source; }
        catch (e) { sourceError = errorText(e); }
      }
      ready = true;
      if (!closed && tab === "crm" && !busy) crmPane();
    })();

    /* ----- Из CRM ----- */
    function lastSyncLabel() {
      if (!source.lastSyncAt) return "Ещё не синхронизировали";
      const d = new Date(source.lastSyncAt);
      const day = d.toDateString() === new Date().toDateString() ? "сегодня" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
      return `Последняя синхронизация ${day} в ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
    }

    function crmPane() {
      const error = h("p", { class: "da-up-error", role: "alert", hidden: !sourceError }, sourceError);
      const input = h("input", { class: "da-input", value: draftGroup, maxlength: 100, autocomplete: "off", disabled: !ready });
      const saved = h("span", { class: "da-small da-muted", role: "status" });
      const save = h("button", { class: "da-btn", type: "button", disabled: !ready }, "Сохранить");
      const load = h("button", { class: "da-btn is-primary", type: "button", disabled: !ready }, DA.icon("refresh"), "Синхронизировать");
      const field = h("div", { class: "da-source-settings", hidden: !settingsOpen },
        h("label", { class: "da-field" }, h("span", {}, "Набор обращений"), input),
        h("div", { class: "da-source-save" }, save, saved));
      const toggle = h("button", { class: "da-btn is-text is-sm", type: "button", "aria-expanded": String(settingsOpen), onclick: () => {
        settingsOpen = !settingsOpen;
        field.hidden = !settingsOpen;
        toggle.setAttribute("aria-expanded", String(settingsOpen));
        if (settingsOpen) input.focus();
      } }, "Настройки источника");
      input.addEventListener("input", () => { draftGroup = input.value; saved.textContent = ""; });
      const fail = (message) => { sourceError = message; error.textContent = message; error.hidden = false; };
      async function saveSource() {
        const groupId = draftGroup.trim();
        if (!groupId || groupId.length > 100) { fail("Укажите набор обращений, до 100 символов."); input.focus(); return false; }
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
            sourceError = ""; error.hidden = true; saved.textContent = "Сохранено";
            last.textContent = lastSyncLabel();
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
      const last = h("p", { class: "da-up-note", role: "status" }, ready ? lastSyncLabel() : "Проверяем источник обращений");
      swap(h("div", { class: "da-source" },
        h("p", { class: "da-source-name" }, "CRM Freedom, обращения отдела поддержки"), last,
        source.lastResult ? h("p", { class: "da-up-note" }, resultText(source.lastResult)) : null,
        load, toggle, field, error), []);
    }

    async function synchronize() {
      const title = h("b", {}, "Ждём ответ CRM");
      const count = h("span");
      const bar = h("progress", { max: 1, "aria-label": "Ход синхронизации" });
      swap(h("div", { class: "da-up-progress", role: "status", "aria-live": "polite" },
        h("div", { class: "da-up-progress-head" }, title, count), bar), []);
      const progress = (processed, total, label) => {
        title.textContent = label;
        count.textContent = `${processed} из ${total}`;
        bar.max = total || 1; bar.value = processed;
      };
      const result = await DA.api.syncSource({ onProgress(event) {
        if (event.stage === "importing") progress(event.processed, event.total, "Сохраняем обращения из CRM");
      } });
      source = { groupId: source.groupId, lastSyncAt: result.lastSyncAt,
        lastResult: { imported: result.imported, updated: result.updated, unchanged: result.unchanged } };
      DA.state.source = source;
      title.textContent = "Обновляем реестр";
      count.textContent = "";
      bar.removeAttribute("value");
      await finishServerImport("Синхронизация завершена", result);
    }

    /* После сохранения повторяем только загрузку реестра, а не уже завершённый импорт. */
    async function finishServerImport(title, result, ids) {
      DA.data.invalidate("conversations");
      try {
        await DA.data.refresh();
        onDone && onDone(ids || []);
        if (!closed) doneView(title, resultText(result));
      } catch (e) {
        if (closed) return;
        const retry = h("button", { class: "da-btn is-primary", type: "button", onclick: async () => {
          setBusy(true); retry.disabled = true; retry.classList.add("is-busy");
          try { await finishServerImport(title, result, ids); }
          finally { setBusy(false); retry.disabled = false; retry.classList.remove("is-busy"); }
        } }, "Обновить реестр");
        swap(h("div", { class: "da-up-done" },
          h("h3", {}, "Обращения сохранены"), h("p", {}, resultText(result)),
          h("p", { class: "da-up-error", role: "alert" }, `${errorText(e)} Реестр пока не обновился.`)), [cancelBtn(), retry]);
      }
    }

    function doneView(title, text) {
      const ok = h("button", { class: "da-btn is-primary", type: "button", onclick: () => m.close() }, "Готово");
      swap(h("div", { class: "da-up-done", role: "status" },
        h("span", { class: "da-up-done-icon" }, DA.icon("check", 22)),
        h("h3", {}, title), h("p", {}, text)), [ok]);
      ok.focus();
    }

    /* ----- Из файла ----- */
    function filePane() {
      const input = h("input", { type: "file", accept: ".json,application/json", class: "da-sr" });
      const zone = h("label", { class: "da-drop da-up-drop" }, input,
        h("span", { class: "da-up-drop-icon" }, DA.icon("upload")),
        h("b", {}, "Перетащите файл выгрузки", h("br"), "или ", h("u", {}, "выберите его на компьютере")),
        h("span", { class: "da-small da-muted" }, "Выгрузка обращений из CRM в формате JSON"));
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
        if (r.error) { error.textContent = r.error; error.prepend(DA.icon("alert", 16)); error.hidden = false; return; }
        previewPane(file, r);
      };
      reader.onerror = () => { error.replaceChildren(DA.icon("alert", 16), "Не удалось открыть файл. Попробуйте выбрать его ещё раз."); error.hidden = false; };
      reader.readAsText(file);
    }

    function previewPane(file, r) {
      const s = r.stats, n = r.fresh.length, changed = r.updated.length, known = s.total - n - changed;
      const add = h("button", { class: "da-btn is-primary", type: "button", disabled: !n && !changed },
        DA.icon(changed ? "refresh" : "plus"), changed ? "Обновить реестр" : n ? `Добавить ${plural(n, CONV)}` : "Добавить обращения");
      const error = h("p", { class: "da-up-error", role: "alert", hidden: true });
      add.addEventListener("click", async () => {
        setBusy(true); add.disabled = true; add.classList.add("is-busy");
        try {
          await initialization;
          if (backend) {
            const result = await DA.api.uploadConversations(r.records);
            await finishServerImport("Реестр обновлён", result, [...r.fresh, ...r.updated].map((rec) => rec.conversation_id));
          } else {
            const result = DA.upsertConversations(r.records);
            onDone && onDone(result.ids);
            if (!closed) doneView("Реестр обновлён", resultText(result));
          }
        } catch (e) {
          error.textContent = `${errorText(e)} Файл остался выбранным, можно повторить сохранение.`;
          error.hidden = false;
        } finally { setBusy(false); add.disabled = false; add.classList.remove("is-busy"); }
      });
      const stat = (label, value) => h("div", { class: "da-up-stat" }, h("span", {}, label), h("b", {}, value));
      swap([
        h("div", { class: "da-up-file" },
          h("span", { class: "da-up-file-icon" }, DA.icon("list")),
          h("div", {}, h("b", {}, file.name), h("span", {}, `${plural(s.total, CONV)} в файле`)),
          h("button", { class: "da-btn is-text is-sm", type: "button", onclick: filePane }, "Выбрать другой")),
        h("div", { class: "da-up-stats" },
          stat("Чатов", s.chats), stat("Звонков", s.calls),
          s.langs.map(([l, c]) => stat(DA.langLabel[l], c)),
          stat("Новых", n)),
        changed ? h("p", { class: "da-up-note" }, `${plural(changed, CONV)} ${DA.fmt.plural(changed, ["изменилось", "изменились", "изменились"])}, обновим ${changed === 1 ? "его" : "их"}.`,
          " Прежние оценки этих обращений станут устаревшими.") : null,
        known ? h("p", { class: "da-up-note" }, `${plural(known, CONV)} уже есть в реестре без изменений, ${known === 1 ? "его" : "их"} пропустим.`)
          : !changed ? h("p", { class: "da-up-note" }, "Все обращения из файла новые.") : null,
        error
      ], [cancelBtn(), add]);
    }

    show();
    return m;
  };
})();
