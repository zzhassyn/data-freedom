/* Реестр обращений: поиск, фильтры, страницы, загрузка, итог с разбором при наведении. */
(function () {
  const DA = window.DA, h = DA.h;
  const m = (key, params) => DA.msg(`registry.${key}`, params);
  DA.i18n.addMessages({
    "registry.title": { ru: "Обращения", kk: "Өтініштер", en: "Conversations" },
    "registry.language": { ru: "Язык", kk: "Тіл", en: "Language" },
    "registry.channel": { ru: "Канал", kk: "Арна", en: "Channel" },
    "registry.chats": { ru: "Чаты", kk: "Чаттар", en: "Chats" },
    "registry.calls": { ru: "Звонки", kk: "Қоңыраулар", en: "Calls" },
    "registry.state": { ru: "Состояние", kk: "Күйі", en: "Status" },
    "registry.done": { ru: "Оценено", kk: "Бағаланды", en: "Evaluated" },
    "registry.new": { ru: "Без оценки", kk: "Бағаланбаған", en: "Not evaluated" },
    "registry.running": { ru: "Оценивается", kk: "Бағалануда", en: "Evaluating" },
    "registry.failed": { ru: "Не удалось оценить", kk: "Бағалау мүмкін болмады", en: "Evaluation failed" },
    "registry.hasAppeal": { ru: "Есть апелляция", kk: "Апелляция бар", en: "Has an appeal" },
    "registry.needsReview": { ru: "Стоит проверить вручную", kk: "Қолмен тексеру қажет", en: "Needs manual review" },
    "registry.gross": { ru: "Грубая ошибка", kk: "Өрескел қате", en: "Serious error" },
    "registry.selectionReset": { ru: "Выбор сброшен, потому что изменились фильтры", kk: "Сүзгілер өзгергендіктен, таңдау алынып тасталды", en: "Selection cleared because the filters changed" },
    "registry.notEvaluated": { ru: "Не оценено", kk: "Бағаланбаған", en: "Not evaluated" },
    "registry.stale": { ru: "Оценка устарела", kk: "Бағалау ескірген", en: "Evaluation is outdated" },
    "registry.queued": { ru: "В очереди", kk: "Кезекте", en: "Queued" },
    "registry.uncertain": { ru: "Модель не уверена в части ответов, их стоит проверить", kk: "Модель кейбір жауаптарға сенімді емес, оларды тексеру қажет", en: "The model is uncertain about some answers. Review them manually" },
    "registry.appeal": { ru: "Апелляция", kk: "Апелляция", en: "Appeal" },
    "registry.reviewed": { ru: "Пересмотрено", kk: "Қайта қаралды", en: "Reviewed" },
    "registry.pages": { ru: "Страницы", kk: "Беттер", en: "Pages" },
    "registry.pageSize": { ru: "Обращений на странице", kk: "Беттегі өтініштер саны", en: "Conversations per page" },
    "registry.perPage": { ru: "На странице", kk: "Бетте", en: "Per page" },
    "registry.selectPage": { ru: "Выбрать страницу", kk: "Осы бетті таңдау", en: "Select this page" },
    "registry.selectAllPage": { ru: "Выбрать все на этой странице", kk: "Осы беттегінің бәрін таңдау", en: "Select all on this page" },
    "registry.selectConversation": { ru: "Выбрать обращение № {number}", kk: "№ {number} өтінішті таңдау", en: "Select conversation {number}" },
    "registry.selectedPage": { ru: "Выбрано {count} на этой странице. ", kk: "Осы бетте {count} өтініш таңдалды. ", en: "Selected {count} on this page. " },
    "registry.selectFiltered": { ru: "Выбрать все {count} по текущим фильтрам", kk: "Ағымдағы сүзгілерге сай барлық {count} өтінішті таңдау", en: "Select all {count} matching these filters" },
    "registry.selectedFiltered": { ru: "Выбраны все {count} по текущим фильтрам", kk: "Ағымдағы сүзгілерге сай барлық {count} өтініш таңдалды", en: "All {count} matching conversations selected" },
    "registry.counter": {
      ru: { one: "{count} обращение, оценено {evaluated}", few: "{count} обращения, оценено {evaluated}", many: "{count} обращений, оценено {evaluated}", other: "{count} обращения, оценено {evaluated}" },
      kk: "{count} өтініш, {evaluated} бағаланды",
      en: { one: "{count} conversation, {evaluated} evaluated", other: "{count} conversations, {evaluated} evaluated" }
    },
    "registry.evaluateNew": { ru: "Оценить все без оценки ({count})", kk: "Бағаланбағанның бәрін бағалау ({count})", en: "Evaluate all unrated ({count})" },
    "registry.startFailed": { ru: "Не удалось начать оценку", kk: "Бағалауды бастау мүмкін болмады", en: "Could not start the evaluation" },
    "registry.transcriptions": { ru: "Расшифровка звонков", kk: "Қоңырауларды мәтінге айналдыру", en: "Call transcription" },
    "registry.openTranscription": { ru: "Открыть расшифровку обращения № {number}", kk: "№ {number} өтініштің транскрипциясын ашу", en: "Open transcript for conversation {number}" },
    "registry.transcriptionFailed": { ru: "Расшифровка не готова", kk: "Транскрипция дайын емес", en: "Transcript unavailable" },
    "registry.transcribing": { ru: "Расшифровывается", kk: "Мәтінге айналдырылуда", en: "Transcribing" },
    "registry.clearAll": { ru: "Сбросить все", kk: "Барлығын тазалау", en: "Clear all" },
    "registry.shownRange": { ru: "Показаны {from}–{to} из {total}", kk: "{total} өтініштің {from}–{to} аралығы көрсетілген", en: "Showing {from}–{to} of {total}" },
    "registry.shownAll": { ru: "Показаны все {count}", kk: "Барлық {count} өтініш көрсетілген", en: "Showing all {count}" },
    "registry.previous": { ru: "Назад", kk: "Алдыңғы", en: "Previous" },
    "registry.next": { ru: "Вперёд", kk: "Келесі", en: "Next" },
    "registry.page": { ru: "Страница {number}", kk: "{number}-бет", en: "Page {number}" },
    "registry.noMatches": { ru: "Под эти условия ничего не подходит", kk: "Бұл шарттарға сәйкес өтініштер жоқ", en: "No conversations match these filters" },
    "registry.clearFilters": { ru: "Сбросить фильтры", kk: "Сүзгілерді тазалау", en: "Clear filters" },
    "registry.durationLabel": { ru: "Длительность ", kk: "Ұзақтығы ", en: "Duration " },
    "registry.searchPlaceholder": { ru: "Номер обращения или текст", kk: "Өтініш нөмірі немесе мәтін", en: "Conversation number or text" },
    "registry.search": { ru: "Поиск", kk: "Іздеу", en: "Search" },
    "registry.number": { ru: "№", kk: "№", en: "No." },
    "registry.yesterdayAt": { ru: "Вчера, {time}", kk: "Кеше, {time}", en: "Yesterday, {time}" },
    "registry.dateTime": { ru: "Дата и время", kk: "Күні мен уақыты", en: "Date and time" },
    "registry.topic": { ru: "С чем обратились", kk: "Өтініш тақырыбы", en: "Customer request" },
    "registry.duration": { ru: "Длительность", kk: "Ұзақтығы", en: "Duration" },
    "registry.total": { ru: "Итог", kk: "Қорытынды", en: "Total" },
    "registry.marks": { ru: "Отметки", kk: "Белгілер", en: "Flags" },
    "registry.upload": { ru: "Загрузить обращения", kk: "Өтініштерді жүктеу", en: "Upload conversations" },
    "registry.uploadShort": { ru: "Загрузить", kk: "Жүктеу", en: "Upload" },
    "registry.summary": { ru: "Сводка всего реестра", kk: "Бүкіл тізілімнің жиынтығы", en: "Whole registry summary" },
    "registry.totalAll": { ru: "Всего обращений", kk: "Барлық өтініш", en: "Total conversations" },
    "registry.evaluatedLabel": { ru: "Оценено", kk: "Бағаланды", en: "Evaluated" },
    "registry.averageLabel": { ru: "Средний итог", kk: "Орташа қорытынды", en: "Average score" },
    "registry.pendingAppeals": {
      ru: { one: "апелляция ждёт решения", few: "апелляции ждут решения", many: "апелляций ждут решения", other: "апелляции ждут решения" },
      kk: "апелляция шешім күтуде", en: { one: "appeal awaiting a decision", other: "appeals awaiting a decision" }
    },
    "registry.grossCount": { ru: { one: "грубая ошибка", few: "грубые ошибки", many: "грубых ошибок", other: "грубые ошибки" }, kk: "өрескел қате", en: { one: "serious error", other: "serious errors" } },
    "registry.scopeAll": { ru: "Все обращения в реестре", kk: "Тізілімдегі барлық өтініш", en: "All conversations in the registry" },
    "registry.scopeFiltered": { ru: "По фильтрам: {count} из {total}", kk: "Сүзгі бойынша: {total} ішінен {count}", en: "Matching filters: {count} of {total}" },
    "registry.evaluateAllHint": { ru: "Оценить все обращения без оценки во всём реестре, включая скрытые фильтрами", kk: "Сүзгілер жасырған өтініштерді қоса, бүкіл тізілімдегі бағаланбаған өтініштердің бәрін бағалау", en: "Evaluate every unrated conversation in the registry, including those hidden by filters" },
    "registry.conversation": { ru: "Обращение", kk: "Өтініш", en: "Conversation" },
    "registry.emptyTitle": { ru: "Обращений пока нет", kk: "Өтініштер әзірге жоқ", en: "No conversations yet" },
    "registry.emptyHelp": { ru: "Загрузите выгрузку из CRM файлом или синхронизируйте обращения.", kk: "CRM жүйесінен экспортталған файлды жүктеңіз немесе өтініштерді синхрондаңыз.", en: "Upload a CRM export file or sync conversations." },
    "registry.emptyFileHelp": { ru: "Загрузите файл выгрузки, чтобы увидеть обращения и начать оценку.", kk: "Өтініштерді көріп, бағалауды бастау үшін экспорт файлын жүктеңіз.", en: "Upload an export file to see conversations and start evaluating them." }
  });

  const GROUPS = [
    { key: "lang", title: m("language"), options: ["RU", "KZ", "EN"].map((value) => ({ value, label: DA.msg(() => DA.langLabel[value]) })) },
    { key: "channel", title: m("channel"), options: [{ value: "agent chat", label: m("chats") }, { value: "voice call", label: m("calls") }] },
    { key: "state", title: m("state"), options: [
      { value: "done", label: m("done") }, { value: "new", label: m("new") },
      { value: "running", label: m("running") }, { value: "failed", label: m("failed") },
      { value: "appeal", label: m("hasAppeal") }, { value: "review", label: m("needsReview") }, { value: "gross", label: m("gross") }] }
  ];
  /* Фильтры, поиск и страница живут в модуле: возврат из карточки показывает реестр таким, каким его оставили. */
  const filter = { lang: new Set(), channel: new Set(), state: new Set(), q: "", batch: null };
  const view = { page: 1, selected: new Set(), anchor: null };
  const filterKey = () => JSON.stringify([filter.q, filter.batch, ...GROUPS.map((g) => [...filter[g.key]].sort())]);
  let selectionFilters = filterKey();

  function filtersChanged() {
    const next = filterKey();
    if (next === selectionFilters) return;
    if (view.selected.size) DA.toast(m("selectionReset"));
    view.selected.clear();
    view.anchor = null;
    selectionFilters = next;
  }

  /* Размер страницы core.js не сохраняет, поэтому храним его отдельно. */
  const SIZES = [10, 25, 50, 100];
  const SIZE_KEY = "da.pageSize";
  function storedSize() {
    try { const n = Number(localStorage.getItem(SIZE_KEY)); return SIZES.includes(n) ? n : null; } catch (e) { return null; }
  }
  function setPageSize(n) {
    DA.state.pageSize = n;
    try { localStorage.setItem(SIZE_KEY, String(n)); } catch (e) { /* без сохранения */ }
    DA.save();
  }

  function matchesState(cid) {
    if (!filter.state.size) return true;
    const ev = DA.state.evaluations[cid];
    const checks = {
      done: () => !!ev && ev.status === "done" && !ev.stale,
      new: () => !ev,
      running: () => !!ev && !ev.stale && ["queued", "running"].includes(ev.status),
      failed: () => !!ev && !ev.stale && ev.status === "failed",
      appeal: () => DA.state.appeals.some((a) => a.conversationId === cid),
      review: () => !!ev && (ev.stale || ev.items.some((i) => i.needsReview)),
      gross: () => !!ev && !ev.stale && ev.grossFlagged
    };
    return [...filter.state].some((k) => checks[k]());
  }

  function visible(records) {
    const q = filter.q.trim().toLowerCase();
    const batch = filter.batch && DA.bulk?.current();
    const failed = filter.batch ? new Set(batch?.jobId === filter.batch ? batch.items.filter((item) => item.status === "failed").map((item) => item.conversationId) : []) : null;
    return records.filter((r) => {
      const cid = r.conversation_id;
      if (failed && !failed.has(cid)) return false;
      if (filter.lang.size && !filter.lang.has(r.language)) return false;
      if (filter.channel.size && !filter.channel.has(r.channel)) return false;
      if (!matchesState(cid)) return false;
      if (q && !DA.convNumber(cid).includes(q) && !cid.toLowerCase().includes(q) && !r.transcript.some((t) => t.text.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  /* Сегодняшние и вчерашние обращения подписываются словом, остальные датой. */
  function when(ms) {
    const d = new Date(ms);
    const time = d.toLocaleTimeString(DA.fmt.locale(), { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === new Date().toDateString()) return DA.t("core.todayAt", { time });
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return DA.t("registry.yesterdayAt", { time });
    return `${d.toLocaleDateString(DA.fmt.locale(), { day: "numeric", month: "long" })}, ${time}`;
  }

  /* Номера страниц: все, если их до 7, иначе первая, последняя, текущая с соседями и многоточия. */
  function pageList(page, pages) {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    let from = Math.max(2, page - 1), to = Math.min(pages - 1, page + 1);
    if (page <= 3) to = 4;
    if (page >= pages - 2) from = pages - 3;
    const out = [1];
    if (from > 2) out.push(null);
    for (let p = from; p <= to; p++) out.push(p);
    if (to < pages - 1) out.push(null);
    out.push(pages);
    return out;
  }

  function scoreCell(cid, reveal) {
    const ev = DA.state.evaluations[cid];
    if (!ev) return h("span", { class: "da-quiet" }, m("notEvaluated"));
    if (ev.stale) return h("span", { class: "da-muted da-small" }, m("stale"));
    if (ev.status === "queued") return h("span", { class: "da-muted da-small" }, m("queued"));
    if (ev.status === "running") return h("span", { class: "da-thinking" }, m("running"));
    if (ev.status === "failed") return h("span", { class: "da-error" }, m("failed"));
    const cl = DA.checklist(ev.checklistVersion);
    const value = h("span", {}, DA.fmt.score(ev.total));
    DA.i18n.bindText(value, () => DA.fmt.score(ev.total));
    const cell = h("div", { class: "da-score-cell" + (reveal ? " is-evaluated" : ""), tabindex: 0, onclick: (e) => e.stopPropagation() },
      h("span", { class: "da-score-num" }, value,
        ev.originalTotal !== ev.total ? h("s", {}, DA.msg(() => DA.fmt.score(ev.originalTotal))) : null),
      DA.ribbon(ev.items.map((i) => ({ ...i, c: DA.criterionById(cl, i.criterionId) })), { mini: true }));
    DA.hoverCard(cell, () => DA.ribbonLegend(ev));
    if (reveal && ev.total != null) DA.countTo(value, 0, ev.total, 600);
    return cell;
  }

  function marks(cid) {
    const ev = DA.state.evaluations[cid];
    const open = DA.state.appeals.some((a) => a.conversationId === cid && a.status === "open");
    const decided = DA.state.appeals.some((a) => a.conversationId === cid && a.status !== "open");
    return h("div", { class: "da-marks" },
      ev && ev.grossFlagged ? h("span", { class: "da-mark t-gross", title: m("gross") }, DA.icon("flag", 15)) : null,
      ev && ev.items.some((i) => i.needsReview) ? h("span", { class: "da-mark t-review", title: m("uncertain") }, DA.icon("alert", 15)) : null,
      open ? h("span", { class: "da-pill t-partial" }, m("appeal")) : decided ? h("span", { class: "da-pill t-pending" }, m("reviewed")) : null);
  }

  DA.views = DA.views || {};
  DA.views.registry = function mount(root, params) {
    if (!SIZES.includes(DA.state.pageSize)) DA.state.pageSize = storedSize() || 10;
    const query = params && params.query || {};
    if (GROUPS.some((g) => Object.hasOwn(query, g.key)) || Object.hasOwn(query, "batch")) {
      const before = JSON.stringify(GROUPS.map((g) => [...filter[g.key]].sort()));
      GROUPS.forEach((g) => {
        filter[g.key].clear();
        String(query[g.key] || "").split(",").forEach((v) => {
          if (g.options.some((o) => o.value === v)) filter[g.key].add(v);
        });
      });
      filter.batch = query.batch || null;
      if (before !== JSON.stringify(GROUPS.map((g) => [...filter[g.key]].sort()))) filter.q = "";
      if (filterKey() !== selectionFilters) view.page = 1;
      filtersChanged();
    }
    for (const cid of view.selected) if (!DA.state.conversations[cid]) view.selected.delete(cid);
    const tbody = h("tbody");
    const counter = h("span", { class: "da-registry-scope", "aria-live": "polite" });
    const totalValue = h("b"), evaluatedValue = h("b"), averageValue = h("b"), appealValue = h("b"), grossValue = h("b");
    const appealLabel = h("span"), grossLabel = h("span");
    const metric = (value, label, cls) => h("div", { class: `da-registry-metric${cls ? " " + cls : ""}` }, value, h("span", {}, label));
    const averageMetric = metric(averageValue, m("averageLabel"), "is-average");
    const evaluatedMetric = h("div", { class: "da-registry-evaluation" }, metric(evaluatedValue, m("evaluatedLabel")), averageMetric);
    const appealMetric = h("a", { class: "da-registry-metric is-link", href: "#/appeals?status=open" }, appealValue, appealLabel);
    const grossMetric = h("a", { class: "da-registry-metric is-link is-gross", href: "#/?state=gross", onclick: (event) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      GROUPS.forEach((g) => filter[g.key].clear());
      filter.state.add("gross"); filter.q = ""; filter.batch = null; search.value = "";
      filtersChanged(); view.page = 1; menu.refresh(); render();
    } }, grossValue, grossLabel);
    const summary = h("section", { class: "da-registry-summary", "aria-label": m("summary") }, metric(totalValue, m("totalAll")), evaluatedMetric, appealMetric, grossMetric);
    const chips = h("div", { class: "da-active-filters" });
    const menu = DA.filterMenu(GROUPS, filter, () => { filter.batch = null; filtersChanged(); view.page = 1; render(); });
    const range = h("span", { class: "da-pager-range", "aria-live": "polite" });
    const nav = h("nav", { class: "da-pager-nav", "aria-label": m("pages") });
    const sizes = DA.dropdown(SIZES.map((n) => ({ value: n, label: String(n) })), DA.state.pageSize, (n) => {
      const first = (view.page - 1) * DA.state.pageSize;
      setPageSize(n);
      goTo(Math.floor(first / n) + 1);
    }, m("pageSize"));
    const pager = h("div", { class: "da-pager" }, range,
      h("div", { class: "da-pager-size" }, h("span", { "aria-hidden": "true" }, m("perPage")), sizes), nav);
    const wrap = h("div", { class: "da-table-wrap" });
    const pageCheck = pageCheckbox("");
    const mobilePageCheck = pageCheckbox(m("selectPage"));
    mobilePageCheck.classList.add("da-select-page-mobile");
    const selectionMessage = h("span", { class: "da-selection-message", "aria-live": "polite" });
    const selectionBar = h("div", { class: "da-registry-selection" }, mobilePageCheck, selectionMessage);
    const allNew = h("button", { class: "da-btn is-primary da-registry-evaluate", type: "button", title: m("evaluateAllHint"), onclick: evaluateNew });
    const upload = h("button", { class: "da-btn da-registry-upload", type: "button", "aria-label": m("upload"), onclick: () => DA.openUpload(render) }, DA.icon("upload", 17), m("uploadShort"));
    const sttEntry = h("button", { class: "da-btn is-text is-sm stt-registry-open", type: "button", hidden: true, onclick: () => DA.stt?.open({ all: true }) }, DA.icon("phone", 16), m("transcriptions"));
    const rows = new Map(), stamps = new Map();
    let fresh = new Set(), animate = false, filtered = [], pageRecords = [], mounted = true, starting = false;

    function pageCheckbox(label) {
      const control = DA.checkbox(label, false, (checked) => {
        for (const r of pageRecords) checked ? view.selected.add(r.conversation_id) : view.selected.delete(r.conversation_id);
        view.anchor = null;
        syncSelection();
      });
      control.classList.add("da-row-select");
      DA.i18n.bindAttr(control.querySelector("input"), "aria-label", m("selectAllPage"));
      return control;
    }

    function rowCheckbox(cid) {
      let shift = false;
      const control = DA.checkbox("", view.selected.has(cid), (checked) => {
        const ids = filtered.map((r) => r.conversation_id), from = ids.indexOf(view.anchor), to = ids.indexOf(cid);
        const chosen = shift && from >= 0 ? ids.slice(Math.min(from, to), Math.max(from, to) + 1) : [cid];
        chosen.forEach((id) => checked ? view.selected.add(id) : view.selected.delete(id));
        view.anchor = cid;
        shift = false;
        syncSelection();
      });
      control.classList.add("da-row-select");
      const input = control.querySelector("input");
      DA.i18n.bindAttr(input, "aria-label", m("selectConversation", { number: DA.convNumber(cid) }));
      input.addEventListener("click", (e) => { shift = e.shiftKey; });
      input.addEventListener("keydown", (e) => { if (e.key === " ") shift = e.shiftKey; });
      control.addEventListener("click", (e) => e.stopPropagation());
      control.addEventListener("keydown", (e) => e.stopPropagation());
      return control;
    }

    function clearSelection() {
      view.selected.clear();
      view.anchor = null;
      if (mounted) syncSelection();
    }

    function syncSelection() {
      rows.forEach(({ row, input }, cid) => {
        input.checked = view.selected.has(cid);
        row.classList.toggle("is-selected", input.checked);
      });
      const checked = pageRecords.filter((r) => view.selected.has(r.conversation_id)).length;
      const allPage = pageRecords.length > 0 && checked === pageRecords.length;
      for (const control of [pageCheck, mobilePageCheck]) {
        const input = control.querySelector("input");
        input.checked = allPage;
        input.indeterminate = checked > 0 && !allPage;
        input.disabled = !pageRecords.length;
      }
      selectionBar.classList.toggle("has-selection", allPage);
      selectionMessage.replaceChildren();
      if (allPage) {
        const allFiltered = filtered.every((r) => view.selected.has(r.conversation_id));
        selectionMessage.append(DA.i18n.text(m("selectedPage", { count: pageRecords.length })));
        if (!allFiltered) selectionMessage.append(h("button", { class: "da-btn is-text is-sm", type: "button", onclick: () => {
          filtered.forEach((r) => view.selected.add(r.conversation_id));
          syncSelection();
        } }, m("selectFiltered", { count: filtered.length })));
        else if (filtered.length > pageRecords.length) selectionMessage.append(DA.i18n.text(m("selectedFiltered", { count: filtered.length })));
      }
      DA.bulk?.setSelection([...view.selected], clearSelection);
    }

    function updateCounter() {
      const records = Object.values(DA.state.conversations);
      const evaluated = records.map((r) => DA.state.evaluations[r.conversation_id]).filter((ev) => ev && ev.status === "done" && !ev.stale);
      const scored = evaluated.filter((ev) => Number.isFinite(ev.total));
      const average = scored.length ? scored.reduce((sum, ev) => sum + ev.total, 0) / scored.length : null;
      const ids = new Set(records.map((r) => r.conversation_id));
      const appeals = DA.state.appeals.filter((appeal) => appeal.status === "open" && ids.has(appeal.conversationId)).length;
      const gross = records.filter((r) => {
        const ev = DA.state.evaluations[r.conversation_id];
        return ev && !ev.stale && ev.grossFlagged;
      }).length;
      DA.i18n.bindText(totalValue, () => records.length.toLocaleString(DA.fmt.locale()));
      DA.i18n.bindText(evaluatedValue, () => evaluated.length.toLocaleString(DA.fmt.locale()));
      DA.i18n.bindText(averageValue, () => average == null ? "" : average.toLocaleString(DA.fmt.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
      DA.i18n.bindText(appealValue, () => appeals.toLocaleString(DA.fmt.locale()));
      DA.i18n.bindText(grossValue, () => gross.toLocaleString(DA.fmt.locale()));
      DA.i18n.bindText(appealLabel, m("pendingAppeals", { count: appeals }));
      DA.i18n.bindText(grossLabel, m("grossCount", { count: gross }));
      summary.hidden = !records.length;
      evaluatedMetric.hidden = !evaluated.length;
      averageMetric.hidden = !scored.length;
      appealMetric.hidden = !appeals;
      grossMetric.hidden = !gross;
      const constrained = filter.q.trim() || filter.batch || GROUPS.some((g) => filter[g.key].size);
      DA.i18n.bindText(counter, constrained ? m("scopeFiltered", { count: visible(records).length, total: records.length }) : m("scopeAll"));
      const count = records.filter((r) => !DA.state.evaluations[r.conversation_id]).length;
      DA.i18n.bindText(allNew, m("evaluateNew", { count }));
      allNew.hidden = !count;
      allNew.disabled = !count || starting || !DA.bulk || DA.bulk.isBusy();
    }

    async function evaluateNew() {
      if (starting || !DA.bulk || DA.bulk.isBusy()) return;
      const ids = Object.keys(DA.state.conversations).filter((cid) => !DA.state.evaluations[cid]);
      if (!ids.length) return;
      starting = true;
      updateCounter();
      try {
        await DA.bulk.start(ids, { checklistVersion: DA.activeChecklist().version, reuse: false });
      } catch (error) {
        if (mounted) DA.toast(DA.msg(() => DA.apiErrorMessage(error)), allNew);
      } finally {
        starting = false;
        if (mounted) updateCounter();
      }
    }

    function evaluationStamp(cid) {
      const ev = DA.state.evaluations[cid];
      return ev ? JSON.stringify([ev.id, ev.status, ev.stale, ev.total, ev.originalTotal, ev.grossFlagged, ev.items.some((i) => i.needsReview)]) : "";
    }

    /* Опрос меняет только ячейки результата: порядок строк и фокус остаются на месте. */
    function refreshProgress() {
      if (!mounted) return;
      updateCounter();
      rows.forEach(({ row, score, mark }, cid) => {
        const stamp = evaluationStamp(cid), previous = stamps.get(cid);
        if (stamp === previous) return;
        const ev = DA.state.evaluations[cid];
        const before = previous ? JSON.parse(previous) : null;
        const reveal = ev?.status === "done" && !ev.stale && (!before || before[0] !== ev.id || before[1] !== "done");
        const focus = score.contains(document.activeElement);
        score.replaceChildren(scoreCell(cid, reveal));
        mark.replaceChildren(marks(cid));
        if (focus) (score.querySelector("[tabindex]") || row).focus({ preventScroll: true });
        if (reveal) {
          row.classList.remove("is-evaluated");
          void row.offsetWidth;
          row.classList.add("is-evaluated");
        }
        stamps.set(cid, stamp);
      });
    }

    /* Состояние звонка обновляется отдельно от строки и её выбора. */
    function refreshStt() {
      if (!mounted) return;
      const current = DA.stt?.current();
      sttEntry.hidden = DA.mode !== "server" || !current || !(current.allTotal || current.error && current.tracking);
      rows.forEach((entry, cid) => {
        const item = DA.stt?.item(cid), stamp = item?.status || "";
        if (entry.sttStamp === stamp) return;
        entry.sttStamp = stamp;
        const focused = entry.stt.contains(document.activeElement);
        entry.stt.replaceChildren();
        if (item && ["queued", "running", "failed"].includes(item.status)) {
          const failed = item.status === "failed";
          entry.stt.append(h("button", { class: "stt-row-status" + (failed ? " is-failed" : ""), type: "button",
            "aria-label": m("openTranscription", { number: DA.convNumber(cid) }),
            onclick: (event) => { event.stopPropagation(); DA.stt.open({ ids: [cid] }); },
            onkeydown: (event) => event.stopPropagation() }, m(failed ? "transcriptionFailed" : "transcribing")));
        }
        if (focused) (entry.stt.querySelector("button") || entry.row).focus({ preventScroll: true });
      });
    }

    function renderChips() {
      const query = new URLSearchParams();
      GROUPS.forEach((g) => { if (filter[g.key].size) query.set(g.key, [...filter[g.key]].join(",")); });
      if (filter.batch) query.set("batch", filter.batch);
      history.replaceState(null, "", "#/" + (query.size ? "?" + query : ""));
      chips.replaceChildren();
      for (const g of GROUPS) for (const v of filter[g.key]) {
        const o = g.options.find((x) => x.value === v);
        chips.append(h("button", { class: "da-filter-chip", type: "button", onclick: () => { filter[g.key].delete(v); filter.batch = null; filtersChanged(); view.page = 1; menu.refresh(); render(); } }, o.label, DA.icon("x", 14)));
      }
      if (chips.children.length > 1) chips.append(h("button", { class: "da-btn is-text is-sm", onclick: reset }, m("clearAll")));
    }
    function reset() {
      GROUPS.forEach((g) => filter[g.key].clear());
      filter.q = "";
      filter.batch = null;
      search.value = "";
      filtersChanged();
      view.page = 1;
      menu.refresh();
      render();
    }

    /* Переход на страницу: строки коротко проявляются, таблица возвращается в поле зрения. */
    function goTo(page) {
      view.page = page;
      animate = true;
      render();
      const offset = (matchMedia("(max-width: 900px)").matches ? 56 : 0) + 12;
      const top = wrap.getBoundingClientRect().top;
      if (top < offset) window.scrollTo({ top: scrollY + top - offset, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }

    function renderPager(total, pages) {
      const size = DA.state.pageSize, from = (view.page - 1) * size + 1, to = Math.min(total, view.page * size);
      DA.i18n.bindText(range, pages > 1 ? m("shownRange", { from, to, total }) : m("shownAll", { count: total }));
      const had = nav.contains(document.activeElement) ? document.activeElement.dataset.go : null;
      const step = (go, label, icon, disabled) => h("button", { class: "da-pager-btn is-step", type: "button", "data-go": go, disabled, "aria-label": label, onclick: () => goTo(view.page + (go === "next" ? 1 : -1)) },
        go === "prev" ? DA.icon(icon, 16) : null, h("span", {}, label), go === "next" ? DA.icon(icon, 16) : null);
      nav.replaceChildren(
        step("prev", m("previous"), "back", view.page === 1),
        ...pageList(view.page, pages).map((p) => p == null
          ? h("span", { class: "da-pager-gap", "aria-hidden": "true" }, "…")
          : h("button", { class: "da-pager-btn", type: "button", "data-go": String(p), "aria-label": m("page", { number: p }), "aria-current": p === view.page ? "page" : null, onclick: () => p !== view.page && goTo(p) }, p)),
        step("next", m("next"), "chevron", view.page === pages));
      if (had) {
        const same = nav.querySelector(`[data-go="${had}"]:not([disabled])`) || nav.querySelector("[aria-current]");
        same && same.focus();
      }
    }

    /* added: идентификаторы только что загруженных обращений, их строки коротко подсвечиваются. */
    function render(added) {
      const records = Object.values(DA.state.conversations).sort((a, b) => DA.state.numbers[a.conversation_id] - DA.state.numbers[b.conversation_id]);
      const list = filtered = visible(records);
      const size = DA.state.pageSize;
      if (Array.isArray(added) && added.length) {
        fresh = new Set(added);
        const idx = list.findIndex((r) => fresh.has(r.conversation_id));
        if (idx >= 0) view.page = Math.floor(idx / size) + 1;
        animate = true;
      }
      const pages = Math.max(1, Math.ceil(list.length / size));
      view.page = Math.min(Math.max(1, view.page), pages);

      updateCounter();
      renderChips();
      const empty = !records.length;
      page.classList.toggle("is-empty", empty);
      emptyState.hidden = !empty;
      table.hidden = empty;
      selectionBar.hidden = empty;
      toolbar.hidden = empty;
      upload.hidden = empty;
      tbody.replaceChildren();
      rows.clear();
      stamps.clear();
      tbody.classList.remove("is-paging");
      pageRecords = list.slice((view.page - 1) * size, view.page * size);
      if (empty) {
        pager.hidden = true;
        syncSelection();
        return;
      }
      if (!list.length) {
        pager.hidden = true;
        tbody.append(h("tr", { class: "da-empty-row" }, h("td", { colspan: 5 },
          h("div", {}, m("noMatches")),
          h("button", { class: "da-btn is-text", onclick: reset }, m("clearFilters")))));
        syncSelection();
        return;
      }
      pager.hidden = false;
      pageRecords.forEach((r, i) => {
        const cid = r.conversation_id;
        const open = () => (location.hash = `#/c/${encodeURIComponent(cid)}`);
        const control = rowCheckbox(cid), score = h("td", { class: "c-score" }, scoreCell(cid)), mark = h("td", { class: "c-marks" }, marks(cid));
        const stt = h("span", { class: "stt-row-slot" });
        const row = h("tr", { class: fresh.has(cid) ? "is-fresh" : null, "data-conversation": cid, style: `--i: ${Math.min(i, 14)}`, tabindex: 0, onclick: open,
          onkeydown: (e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(); } },
          h("td", { class: "c-select", onclick: (e) => e.stopPropagation() }, control),
          h("td", { class: "da-num c-num", title: cid }, DA.convNumber(cid)),
          h("td", { class: "c-prev" }, h("div", { class: "da-preview" }, r.summary?.topic || DA.tx.preview(r)),
            h("div", { class: "da-record-meta" },
              h("span", { class: "c-chan" }, h("span", { class: "da-channel" }, DA.icon(r.channel === "voice call" ? "phone" : "message", 14), DA.msg(() => DA.channelLabel(r)))),
              h("span", { class: "c-lang" }, DA.msg(() => DA.langLabel[r.language])),
              h("span", { class: "c-date" }, DA.msg(() => when(DA.tx.startedAt(r)))),
              h("span", { class: "c-dur" }, DA.icon("clock", 12), h("span", { class: "da-sr" }, m("durationLabel")), DA.fmt.duration(DA.tx.duration(r))),
              r.channel === "voice call" ? stt : null)),
          score, mark);
        rows.set(cid, { row, input: control.querySelector("input"), score, mark, stt, sttStamp: null });
        stamps.set(cid, evaluationStamp(cid));
        tbody.append(row);
      });
      if (animate) { void tbody.offsetWidth; tbody.classList.add("is-paging"); }
      animate = false;
      fresh = new Set();
      renderPager(list.length, pages);
      syncSelection();
      refreshStt();
    }

    const search = h("input", { class: "da-input", type: "search", placeholder: m("searchPlaceholder"), value: filter.q, "aria-label": m("search") });
    let t;
    search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { filter.q = search.value; filter.batch = null; filtersChanged(); view.page = 1; render(); }, 200); });

    const toolbar = h("div", { class: "da-registry-tools" },
      h("div", { class: "da-registry-find" }, h("div", { class: "da-search" }, DA.icon("search"), search), menu),
      allNew,
      h("div", { class: "da-registry-filter-state" }, counter, chips, sttEntry));
    const table = h("table", { class: "da-table da-registry" },
        h("thead", {}, h("tr", {},
          h("th", { class: "c-select" }, pageCheck),
          h("th", {}, m("number")), h("th", {}, m("conversation")), h("th", {}, m("total")), h("th", {}, h("span", { class: "da-sr" }, m("marks"))))), tbody);
    const emptyState = h("div", { class: "da-registry-empty", hidden: true },
      h("div", { class: "da-empty-register", "aria-hidden": "true" },
        ...Array.from({ length: 4 }, (_, i) => h("div", { class: i ? "da-empty-register-row" : "da-empty-register-head" }, h("i"), h("i"), h("i")))),
      h("h2", {}, m("emptyTitle")), h("p", {}, m(DA.mode === "server" ? "emptyHelp" : "emptyFileHelp")),
      h("button", { class: "da-btn is-primary", type: "button", onclick: () => DA.openUpload(render) }, DA.icon("upload", 18), m("upload")));
    wrap.append(toolbar, selectionBar, table, pager, emptyState);
    const page = h("div", { class: "da-page da-registry-page" },
      h("div", { class: "da-page-head da-registry-heading" }, h("h1", { class: "da-h1", tabindex: -1 }, m("title")), upload), summary, wrap);
    root.append(page);
    render();
    const unsubscribe = DA.bulk?.subscribe(refreshProgress);
    const unsubscribeStt = DA.stt?.subscribe(refreshStt);
    window.addEventListener("da:appeals-changed", updateCounter);
    return () => {
      mounted = false;
      clearTimeout(t);
      unsubscribe?.();
      unsubscribeStt?.();
      window.removeEventListener("da:appeals-changed", updateCounter);
      DA.bulk?.clearSelection();
    };
  };
})();
