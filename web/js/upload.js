/* Загрузка обращений: пакет выгрузки из CRM или файл выгрузки. */
(function () {
  const DA = window.DA, h = DA.h;
  const plural = (n, forms) => `${n} ${DA.fmt.plural(n, forms)}`;
  const CONV = ["обращение", "обращения", "обращений"];
  const LANGS = ["RU", "KZ", "EN"];
  const CHANNELS = ["agent chat", "voice call"];
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Состав набора: чаты, звонки, языки. Считается по записям, а не задаётся руками. */
  function stats(records) {
    const calls = records.filter((r) => r.channel === "voice call").length;
    const langs = LANGS.map((l) => [l, records.filter((r) => r.language === l).length]).filter(([, n]) => n);
    return { total: records.length, calls, chats: records.length - calls, langs };
  }
  const compositionText = (s) => `${plural(s.total, CONV)}: ${plural(s.chats, ["чат", "чата", "чатов"])} и ${plural(s.calls, ["звонок", "звонка", "звонков"])}`;
  const langsText = (s) => s.langs.map(([l], i) => (i ? DA.langLabel[l].toLowerCase() : DA.langLabel[l])).join(", ");

  /* Новые записи получают следующие номера по порядку. */
  function addConversations(records) {
    let next = Math.max(0, ...Object.values(DA.state.numbers)) + 1;
    return records.map((r) => {
      const rec = { conversation_id: r.conversation_id, channel: r.channel, language: r.language, transcript: r.transcript, audio_url: r.audio_url || null };
      DA.state.conversations[rec.conversation_id] = rec;
      DA.state.numbers[rec.conversation_id] = next++;
      return rec.conversation_id;
    });
  }

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
        if (!t || typeof t.text !== "string" || !DA.speakerLabel[t.speaker]) return { error: `В обращении ${n} реплика ${j + 1} без текста или без автора.` };
        if (!validTime(t.timestamp)) return { error: `В обращении ${n} у реплики ${j + 1} непонятное время.` };
      }
    }
    const fresh = records.filter((r) => !DA.state.conversations[r.conversation_id]);
    return { records, fresh, stats: stats(records) };
  }

  /* ---------- Окно загрузки ---------- */
  DA.openUpload = function (onDone) {
    const dev = window.DA_DEV.records;
    const devStats = stats(dev);
    const pane = h("div", { class: "da-up-pane" });
    const foot = h("div", { class: "da-up-foot" });
    let tab = "crm", busy = false, closed = false;

    const tabs = DA.segmented([{ value: "crm", label: "Из CRM" }, { value: "file", label: "Из файла" }], tab, (v) => { tab = v; show(); }, "Откуда загрузить");
    tabs.classList.add("da-up-tabs");

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

    function setBusy(on) { busy = on; tabs.classList.toggle("is-locked", on); }
    function swap(nodes, actions) {
      pane.replaceChildren(...[nodes].flat());
      pane.classList.remove("is-in"); void pane.offsetWidth; pane.classList.add("is-in");
      foot.replaceChildren(...actions);
    }
    const cancelBtn = () => h("button", { class: "da-btn", type: "button", onclick: () => m.close() }, "Отмена");
    function show() { if (!busy) (tab === "crm" ? crmPane : filePane)(); }

    /* ----- Из CRM ----- */
    let pack = "dev", packNo = "";
    function crmPane() {
      const input = h("input", { class: "da-input", value: packNo, placeholder: "Например, 4512", "aria-label": "Номер пакета", autocomplete: "off" });
      const error = h("p", { class: "da-up-error", role: "alert", hidden: true });
      const load = h("button", { class: "da-btn is-primary", type: "button" }, DA.icon("upload"), "Загрузить");
      const numberField = h("label", { class: "da-field da-up-number", hidden: pack !== "other" }, h("span", {}, "Номер пакета"), input);

      const card = (value, title, lines) => {
        const radio = h("input", { type: "radio", name: "da-pack", value, class: "da-sr" });
        radio.checked = pack === value;
        radio.addEventListener("change", () => {
          pack = value;
          numberField.hidden = pack !== "other";
          error.hidden = true;
          sync();
          if (pack === "other") input.focus();
        });
        return h("label", { class: "da-pack" }, radio,
          h("span", { class: "da-pack-dot", "aria-hidden": "true" }),
          h("span", { class: "da-pack-text" }, h("b", {}, title), lines.map((l) => h("span", {}, l))));
      };
      function sync() { load.disabled = pack === "other" && !input.value.trim(); }
      input.addEventListener("input", () => { packNo = input.value; error.hidden = true; sync(); });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !load.disabled) load.click(); });
      load.addEventListener("click", () => (pack === "dev" ? importDev() : importOther(packNo.trim(), load, error)));
      sync();

      swap([
        h("div", { class: "da-pack-list", role: "radiogroup", "aria-label": "Пакет обращений" },
          card("dev", "Обращения для разработки", [compositionText(devStats), langsText(devStats)]),
          card("other", "Другой пакет", ["Пакет выгрузки из CRM по его номеру"])),
        numberField, error
      ], [cancelBtn(), load]);
    }

    /* Пакет разработки уже лежит в приложении: сверяем каждое обращение с реестром и показываем ход сверки. */
    function importDev() {
      setBusy(true);
      const count = h("span", {}, `0 из ${dev.length}`);
      const bar = h("i");
      swap(h("div", { class: "da-up-progress", role: "status" },
        h("div", { class: "da-up-progress-head" }, h("b", {}, "Сверяем обращения с реестром"), count),
        h("div", { class: "da-up-bar" }, bar)), [cancelBtn()]);
      const fresh = [], updated = [];
      let i = 0;
      const t0 = performance.now(), span = reduced() ? 0 : 1200;
      (function step(now) {
        if (closed) return;
        const target = span ? Math.min(dev.length, Math.floor(((now - t0) / span) * dev.length)) : dev.length;
        for (; i < target; i++) {
          const r = dev[i], had = DA.state.conversations[r.conversation_id];
          if (!had) fresh.push(r);
          else if (JSON.stringify(had.transcript) !== JSON.stringify(r.transcript)) { updated.push(r); had.transcript = r.transcript; }
        }
        count.textContent = `${i} из ${dev.length}`;
        bar.style.width = (i / dev.length) * 100 + "%";
        if (i < dev.length) return requestAnimationFrame(step);
        const added = addConversations(fresh);
        setBusy(false);
        doneView(`Загружено ${plural(dev.length, CONV)}`, `Новых ${fresh.length}, обновлено ${updated.length}.`);
        if (added.length || updated.length) onDone && onDone(added);
      })(t0);
    }

    /* Другой пакет запрашивается у сервера (CONTRACTS.md, POST /api/datasets/import). */
    async function importOther(no, btn, error) {
      setBusy(true);
      btn.classList.add("is-busy"); btn.disabled = true;
      const fail = (msg) => {
        if (closed) return;
        setBusy(false);
        btn.classList.remove("is-busy"); btn.disabled = false;
        error.replaceChildren(DA.icon("alert", 16), h("span", {}, msg || `Не удалось получить пакет ${no} из CRM. Проверьте номер или попробуйте позже.`));
        error.hidden = false;
      };
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch("/api/datasets/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: no }), signal: ctrl.signal });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.error) return fail(data && data.error && data.error.message);
        if (closed) return;
        setBusy(false);
        doneView(`Загружено ${plural(data.total, CONV)}`, `Новых ${data.imported}, обновлено ${data.updated}.`);
        onDone && onDone([]);
      } catch (e) {
        fail();
      } finally {
        clearTimeout(timer);
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
      if (!dropTarget || !dropTarget.isConnected) return;
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
      const s = r.stats, n = r.fresh.length, known = s.total - n;
      const add = h("button", { class: "da-btn is-primary", type: "button", disabled: !n },
        DA.icon("plus"), n ? `Добавить ${plural(n, CONV)}` : "Добавить обращения");
      add.addEventListener("click", () => {
        const ids = addConversations(r.fresh);
        m.close();
        onDone && onDone(ids);
        /* Подтверждение появляется у кнопки, которой открыли окно: фокус уже вернулся на неё. */
        const anchor = document.activeElement && document.activeElement.closest("button");
        DA.toast(`В реестр ${DA.fmt.plural(ids.length, ["добавлено", "добавлены", "добавлено"])} ${plural(ids.length, CONV)}`, anchor || undefined);
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
        h("p", { class: "da-up-note" }, n
          ? known ? `${plural(known, CONV)} уже есть в реестре, ${known === 1 ? "его" : "их"} пропустим.` : "Все обращения из файла новые."
          : "Все обращения из этого файла уже есть в реестре.")
      ], [cancelBtn(), add]);
    }

    show();
    return m;
  };
})();
