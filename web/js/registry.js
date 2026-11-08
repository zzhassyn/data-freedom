/* Реестр обращений: поиск, фильтры, страницы, загрузка, итог с разбором при наведении. */
(function () {
  const DA = window.DA, h = DA.h, F = DA.registryFilters;
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
    "registry.export": { ru: "Выгрузить", kk: "Экспорттау", en: "Export" },
    "registry.exportOrganizers": { ru: "Результаты оценки (JSON)", kk: "Бағалау нәтижелері (JSON)", en: "Evaluation results (JSON)" },
    "registry.exportGroup": { ru: "Текущий набор", kk: "Ағымдағы жинақ", en: "Current dataset" },
    "registry.exportScope": { ru: "Весь набор, независимо от фильтров", kk: "Сүзгілерге қарамастан, бүкіл жинақ", en: "The whole dataset, regardless of filters" },
    "registry.exportLoading": { ru: "Проверяем текущий набор…", kk: "Ағымдағы жинақ тексерілуде…", en: "Checking the current dataset…" },
    "registry.exportPreparing": { ru: "Готовим файл…", kk: "Файл дайындалуда…", en: "Preparing the file…" },
    "registry.exportRetry": { ru: "Повторить", kk: "Қайталау", en: "Try again" },
    "registry.exportNoSource": { ru: "Набор не выбран. Откройте загрузку обращений и выберите набор.", kk: "Жинақ таңдалмаған. Өтініштерді жүктеуді ашып, жинақты таңдаңыз.", en: "No dataset selected. Open Upload conversations and choose a dataset." },
    "registry.exportSync": { ru: "Синхронизируйте полный набор через загрузку обращений и повторите выгрузку.", kk: "Өтініштерді жүктеу арқылы толық жинақты синхрондап, экспорттауды қайталаңыз.", en: "Sync the complete dataset through Upload conversations, then export again." },
    "registry.exportInvalid": { ru: "Сервер не смог проверить результаты. Файл не скачан. Повторите выгрузку.", kk: "Сервер нәтижелерді тексере алмады. Файл жүктелмеді. Экспорттауды қайталаңыз.", en: "The server could not validate the results. No file was downloaded. Try exporting again." },
    "registry.summary": { ru: "Сводка всего реестра", kk: "Бүкіл тізілімнің жиынтығы", en: "Whole registry summary" },
    "registry.totalAll": { ru: "Всего обращений", kk: "Барлық өтініш", en: "Total conversations" },
    "registry.evaluatedLabel": { ru: "Оценено", kk: "Бағаланды", en: "Evaluated" },
    "registry.averageLabel": { ru: "Средний итог", kk: "Орташа қорытынды", en: "Average score" },
    "registry.conversationNoun": { ru: { one: "обращение", few: "обращения", many: "обращений", other: "обращения" }, kk: "өтініш", en: { one: "conversation", other: "conversations" } },
    "registry.evaluatedBefore": { ru: "оценено ", kk: "", en: "evaluated " },
    "registry.evaluatedAfter": { ru: "", kk: " бағаланды", en: "" },
    "registry.averageInline": { ru: "средний итог ", kk: "орташа қорытынды ", en: "average score " },
    "registry.allEvaluated": { ru: "все оценены", kk: "бәрі бағаланды", en: "all evaluated" },
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
    "registry.emptyHelp": { ru: "Загрузите выгрузку из CRM файлом или синхронизируйте обращения.", kk: "CRM жүйесінен экспортталған файлды жүктеңіз немесе өтініштерді синхрондаңыз.", en: "Upload a CRM export file or sync conversations." }
  });

  DA.i18n.addMessages({
    "registry.filters": { ru: "Фильтры", kk: "Сүзгілер", en: "Filters" },
    "registry.applyFilters": { ru: "Применить фильтры", kk: "Сүзгілерді қолдану", en: "Apply filters" },
    "registry.attention": { ru: "Требует внимания", kk: "Назар аудару қажет", en: "Needs attention" },
    "registry.appeals": { ru: "Апелляции", kk: "Апелляциялар", en: "Appeals" },
    "registry.noAppeals": { ru: "Нет", kk: "Жоқ", en: "None" },
    "registry.openAppeals": { ru: "Ожидают решения", kk: "Шешім күтілуде", en: "Awaiting a decision" },
    "registry.resolvedAppeals": { ru: "Решение принято", kk: "Шешім қабылданды", en: "Decided" },
    "registry.scoreRange": { ru: "Итог, от 0 до 100", kk: "Қорытынды, 0 мен 100 арасы", en: "Score, 0 to 100" },
    "registry.from": { ru: "От", kk: "Бастап", en: "From" },
    "registry.to": { ru: "До", kk: "Дейін", en: "To" },
    "registry.dateRange": { ru: "Дата обращения", kk: "Өтініш күні", en: "Conversation date" },
    "registry.channelLanguage": { ru: "Канал и язык", kk: "Арна және тіл", en: "Channel and language" },
    "registry.scoreFilter": { ru: "Баллы", kk: "Ұпайлар", en: "Score" },
    "registry.periodFilter": { ru: "Период", kk: "Кезең", en: "Period" },
    "registry.checklistFilter": { ru: "Чек-лист", kk: "Чек-лист", en: "Checklist" },
    "registry.resetFiltersShort": { ru: "Сбросить", kk: "Тазалау", en: "Reset" },
    "registry.applyFiltersShort": { ru: "Применить", kk: "Қолдану", en: "Apply" },
    "registry.removeFilter": { ru: "Убрать условие", kk: "Шартты алып тастау", en: "Remove filter" },
    "registry.checklist": { ru: "Версия чек-листа", kk: "Чек-лист нұсқасы", en: "Checklist version" },
    "registry.activeChecklist": { ru: "Текущая версия", kk: "Ағымдағы нұсқа", en: "Active version" },
    "registry.versionLabel": { ru: "Версия {version}", kk: "{version}-нұсқа", en: "Version {version}" },
    "registry.exactSelection": { ru: "Обращения: {count}", kk: "Өтініштер: {count}", en: "Conversations: {count}" },
    "registry.groupSelection": { ru: "Набор {group}", kk: "{group} жинағы", en: "Dataset {group}" },
    "registry.scoreChip": { ru: "Итог: {from}–{to}", kk: "Қорытынды: {from}–{to}", en: "Score: {from}–{to}" },
    "registry.dateChip": { ru: "Даты: {from}–{to}", kk: "Күндер: {from}–{to}", en: "Dates: {from}–{to}" },
    "registry.searchChip": { ru: "Поиск: {query}", kk: "Іздеу: {query}", en: "Search: {query}" },
    "registry.scoreError": { ru: "Укажите число от 0 до 100.", kk: "0 мен 100 арасындағы санды енгізіңіз.", en: "Enter a number from 0 to 100." },
    "registry.scoreOrderError": { ru: "Начало диапазона не может быть больше конца.", kk: "Аралықтың басы соңынан үлкен болмауы керек.", en: "The lower score cannot exceed the upper score." },
    "registry.dateError": { ru: "Укажите существующую дату.", kk: "Дұрыс күнді енгізіңіз.", en: "Enter a valid date." },
    "registry.dateOrderError": { ru: "Начало периода не может быть позже конца.", kk: "Кезеңнің басы соңынан кейін болмауы керек.", en: "The start date cannot be after the end date." },
    "registry.invalidFilters": { ru: "Не удалось применить условия из ссылки. Сбросьте фильтры и выберите их заново.", kk: "Сілтемедегі шарттар қолданылмады. Сүзгілерді тазалап, қайта таңдаңыз.", en: "The link contains invalid filters. Clear the filters and choose them again." },
    "registry.loading": { ru: "Загружаем обращения…", kk: "Өтініштер жүктелуде…", en: "Loading conversations…" },
    "registry.loadFailed": { ru: "Не удалось загрузить обращения", kk: "Өтініштерді жүктеу мүмкін болмады", en: "Could not load conversations" },
    "registry.previousScore": { ru: "Сохранённый итог", kk: "Сақталған қорытынды", en: "Saved score" },
    "registry.selectedSummary": { ru: "Сводка выбранных обращений", kk: "Таңдалған өтініштердің жиынтығы", en: "Selected conversation summary" }
  });
  const GROUPS = [
    { key: "languages", title: m("language"), options: ["RU", "KZ", "EN"].map((value) => ({ value, label: DA.msg(() => DA.langLabel[value]) })) },
    { key: "channels", title: m("channel"), options: [{ value: "agent chat", label: m("chats") }, { value: "voice call", label: m("calls") }] },
    { key: "status", title: m("state"), options: [
      { value: "done", label: m("done") }, { value: "new", label: m("new") },
      { value: "running", label: m("running") }, { value: "failed", label: m("failed") },
      { value: "stale", label: m("stale") }] },
    { key: "attention", title: m("attention"), options: [{ value: "review", label: m("needsReview") }, { value: "gross", label: m("gross") }] },
    { key: "appealStatus", title: m("appeals"), options: [{ value: "none", label: m("noAppeals") }, { value: "open", label: m("openAppeals") }, { value: "resolved", label: m("resolvedAppeals") }] }
  ];
  /* Фильтры, поиск и страница живут в модуле: возврат из карточки показывает реестр таким, каким его оставили. */
  let filter = F.normalize();
  let batchFilter = null;
  const view = { page: 1, selected: new Set(), anchor: null };
  const filterKey = () => JSON.stringify([filter, batchFilter]);
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

  function requestFilters() {
    const result = F.normalize(filter);
    if (!batchFilter) return result;
    const batch = DA.bulk?.current();
    const ids = batch?.jobId === batchFilter ? batch.items.filter((item) => item.status === "failed").map((item) => item.conversationId) : [];
    result.conversationIds = result.conversationIds === null ? ids : result.conversationIds.filter((id) => ids.includes(id));
    return result;
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

  function scoreCell(cid, reveal, item) {
    const ev = DA.state.evaluations[cid];
    const itemTotal = item?.total;
    const evTotal = ev?.status === 'done' && !ev?.stale ? ev?.total : null;
    const total = itemTotal ?? evTotal;
    if (total == null) return h('span', { class: (item?.status || ev?.status) === 'failed' ? 'da-error da-small' : 'da-muted da-small' },
      m(({ new: 'notEvaluated', stale: 'stale', failed: 'failed', running: 'running' })[item?.status || ev?.status] || 'notEvaluated'));
    if (item && item.total != null && (ev?.id !== item.qualityEvaluationId || ev?.status !== 'done' || ev?.stale)) {
      return h('div', { class: 'da-score-cell' }, h('span', { class: 'da-score-num' }, DA.msg(() => DA.fmt.score(item.total))),
        item.originalTotal != null && item.originalTotal !== item.total ? h('s', {}, DA.msg(() => DA.fmt.score(item.originalTotal))) : null),
      item.readyIsPreviousAttempt ? h('span', { class: 'da-score-note' }, m(item.status === 'failed' ? 'failed' : item.status === 'running' ? 'running' : 'previousScore')) : null);
    }
    if (!ev) return h('div', { class: 'da-score-cell' }, h('span', { class: 'da-score-num' }, DA.msg(() => DA.fmt.score(total))));
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
    if (item?.readyIsPreviousAttempt) cell.append(h("span", { class: "da-score-note" }, m(item.status === "failed" ? "failed" : item.status === "running" ? "running" : "previousScore")));
    if (reveal && ev.total != null) DA.countTo(value, 0, ev.total, 600);
    return cell;
  }

  function topic(record) {
    const modelTopic = record.summary?.topic;
    if (typeof modelTopic === "string" && modelTopic.trim()) return modelTopic;
    return record.transcript?.find((turn) => turn.speaker === "client")?.text || "";
  }

  function organizerExport() {
    let alive = true, busy = false, loading = false, groupId = "", error = null;
    let sourceController = null, downloadController = null;
    const button = h("button", { class: "da-btn is-text is-sm da-registry-export", type: "button", "aria-haspopup": "menu", "aria-expanded": "false" }, m("export"), DA.icon("chevron", 14));
    const group = h("p", { class: "da-export-group" });
    const scope = h("p", { class: "da-export-scope" }, m("exportScope"));
    const status = h("p", { class: "da-export-status", role: "status" });
    const action = h("button", { class: "da-export-action", type: "button", role: "menuitem", onclick: download }, m("exportOrganizers"));
    const retry = h("button", { class: "da-btn is-text is-sm da-export-retry", type: "button", role: "menuitem", hidden: true, onclick: loadSource }, m("exportRetry"));
    const panel = h("div", { class: "da-export-menu", role: "menu", "aria-label": m("export"), tabindex: -1, hidden: true }, group, scope, action, status, retry);
    document.body.append(panel);
    DA.i18n.bindText(group, () => groupId ? DA.t("registry.exportGroup") : "");
    DA.i18n.bindText(action, () => DA.t("registry." + (busy ? "exportPreparing" : "exportOrganizers")));
    DA.i18n.bindText(status, () => {
      if (loading) return DA.t("registry.exportLoading");
      if (!error) return "";
      if (["export_roster_missing", "export_roster_invalid", "export_source_changed"].includes(error.code)) return DA.t("registry.exportSync");
      if (error.code === "invalid_results_export") return DA.t("registry.exportInvalid");
      if (error.code === "export_no_source") return DA.t("registry.exportNoSource");
      return DA.apiErrorMessage(error);
    });
    function sync() {
      group.hidden = !groupId;
      scope.hidden = !groupId;
      status.hidden = !loading && !error;
      status.classList.toggle("is-error", !!error);
      action.disabled = loading || busy || !groupId;
      panel.setAttribute("aria-busy", String(loading || busy));
      retry.hidden = loading || busy || !!groupId || !error;
      [group, action, status].forEach(DA.i18n.refresh);
      place();
    }
    function place() {
      if (panel.hidden) return;
      const rect = button.getBoundingClientRect(), width = Math.min(360, innerWidth - 24);
      panel.style.width = `${width}px`;
      panel.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, rect.right - width))}px`;
      panel.style.maxHeight = `${Math.max(120, innerHeight - 24)}px`;
      const height = panel.offsetHeight;
      panel.style.top = `${Math.max(12, Math.min(rect.bottom + 6, innerHeight - height - 12))}px`;
    }
    function close(returnFocus = false) {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
      sourceController?.abort();
      sourceController = null;
      loading = false;
      if (returnFocus && alive) button.focus({ preventScroll: true });
    }
    async function open() {
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      panel.focus({ preventScroll: true });
      if (busy) { sync(); return; }
      await loadSource();
    }
    async function loadSource() {
      sourceController?.abort();
      const controller = new AbortController();
      sourceController = controller;
      groupId = ""; error = null; loading = true; sync();
      try {
        const source = await DA.api.getSource({ signal: controller.signal });
        if (!alive || controller.signal.aborted || sourceController !== controller) return;
        if (typeof source?.groupId !== "string" || !source.groupId.trim()) throw { code: "export_no_source" };
        groupId = source.groupId.trim();
      } catch (caught) {
        if (!alive || controller.signal.aborted || sourceController !== controller) return;
        error = caught;
      } finally {
        if (alive && !controller.signal.aborted && sourceController === controller) {
          sourceController = null; loading = false; sync();
          if (!panel.hidden && panel.contains(document.activeElement)) (groupId ? action : retry).focus({ preventScroll: true });
        }
      }
    }
    async function download() {
      if (busy || loading || !groupId) return;
      const controller = new AbortController();
      downloadController = controller; busy = true; error = null; sync();
      try {
        const data = await DA.api.request("/export/organizers", { method: "POST", body: { groupId, evaluateMissing: false }, signal: controller.signal });
        if (!alive || controller.signal.aborted) return;
        if (!data || data.schema_version !== "1.0" || !Array.isArray(data.results)) throw { code: "invalid_results_export" };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json;charset=utf-8" }));
        const link = h("a", { href: url, download: "results.json", hidden: true });
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        close(panel.contains(document.activeElement));
      } catch (caught) {
        if (alive && !controller.signal.aborted) error = caught;
      } finally {
        if (alive && !controller.signal.aborted) { busy = false; downloadController = null; sync(); }
      }
    }
    function outside(event) { if (!button.contains(event.target) && !panel.contains(event.target)) close(); }
    function keys(event) {
      if (panel.hidden) return;
      if (event.key === "Escape") { event.preventDefault(); close(true); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const target = !retry.hidden ? retry : action.disabled ? panel : action;
        target.focus({ preventScroll: true });
      } else if (event.key === "Tab") close(true);
    }
    button.addEventListener("click", () => panel.hidden ? open() : close());
    button.addEventListener("keydown", (event) => {
      if (panel.hidden && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); open(); }
    });
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keys);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("da:locale-changed", place);
    return { button, destroy() {
      alive = false;
      sourceController?.abort(); downloadController?.abort(); panel.remove();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keys);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("da:locale-changed", place);
    } };
  }

  function marks(item) {
    return h("div", { class: "da-marks" },
      item.grossFlagged ? h("span", { class: "da-mark t-gross", title: m("gross"), "aria-label": m("gross") }, DA.icon("flag", 15)) : null,
      item.needsReviewCount ? h("span", { class: "da-mark t-review", title: m("uncertain"), "aria-label": m("uncertain") }, DA.icon("alert", 15)) : null);
  }

  function appealCell(item) {
    if (!item.openAppeals && !item.decidedAppeals) return h("span", { class: "da-muted" }, m("noAppeals"));
    return h("div", { class: "da-registry-appeals" },
      item.openAppeals ? h("span", { class: "da-pill t-partial" }, m("openAppeals"), item.openAppeals > 1 ? ` (${item.openAppeals})` : "") : null,
      item.decidedAppeals ? h("span", { class: "da-pill t-pending" }, m("resolvedAppeals"), item.decidedAppeals > 1 ? ` (${item.decidedAppeals})` : "") : null);
  }

  /* Компактная панель показывает одну группу, сохраняя черновики остальных условий. */
  function filterPanel(onApply) {
    const count = h("span", { class: "da-count is-brand" });
    const button = h("button", { class: "da-btn", type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": "registry-filter-panel" }, DA.icon("filter"), m("filters"), count);
    const panel = h("section", { class: "da-registry-filters", id: "registry-filter-panel", hidden: true, role: "dialog", "aria-label": m("filters") });
    const sections = [
      { key: "status", title: m("state"), keys: ["status", "attention"] },
      { key: "appealStatus", title: m("appeals"), keys: ["appealStatus"] },
      { key: "channels", title: m("channelLanguage"), keys: ["channels", "languages"] },
      { key: "score", title: m("scoreFilter"), keys: ["scoreFrom", "scoreTo"] },
      { key: "date", title: m("periodFilter"), keys: ["dateFrom", "dateTo"] },
      { key: "checklistId", title: m("checklistFilter"), keys: ["checklistId"] }
    ];
    let draft, active = "status", fields = new Map(), errors = new Map(), tabs = new Map(), panes = new Map(), refreshVersion = () => {};
    const groupKey = (key) => sections.find((section) => section.key === key || section.keys.includes(key))?.key || "status";
    function place() {
      if (panel.hidden) return;
      const anchor = button.getBoundingClientRect(), width = Math.min(540, innerWidth - 24);
      panel.style.width = width + "px";
      panel.style.maxHeight = Math.max(180, innerHeight - 24) + "px";
      const height = panel.getBoundingClientRect().height;
      panel.style.left = Math.max(12, Math.min(anchor.right - width, innerWidth - width - 12)) + "px";
      panel.style.top = Math.max(12, Math.min(anchor.bottom + 8 + height <= innerHeight - 12 ? anchor.bottom + 8 : anchor.top - height - 8, innerHeight - height - 12)) + "px";
    }
    function close(returnFocus = false) {
      panel.hidden = true; button.setAttribute("aria-expanded", "false");
      document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", keys);
      window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
      if (returnFocus) button.focus({ preventScroll: true });
    }
    function outside(event) { if (!panel.contains(event.target) && !button.contains(event.target)) close(); }
    function keys(event) { if (event.key === "Escape") { event.preventDefault(); close(true); } }
    function refreshCounts() {
      sections.forEach((section) => {
        const n = section.key === "score" ? Number(draft.scoreFrom != null && draft.scoreFrom !== "" || draft.scoreTo != null && draft.scoreTo !== "")
          : section.key === "date" ? Number(!!(draft.dateFrom || draft.dateTo))
          : section.key === "checklistId" ? Number(!!draft.checklistId)
          : section.keys.reduce((total, key) => total + draft[key].length, 0);
        const badge = tabs.get(section.key)?.querySelector(".da-filter-group-count");
        if (badge) { badge.textContent = n; badge.hidden = !n; }
      });
    }
    function activate(key, focus = false) {
      active = groupKey(key);
      tabs.forEach((tab, name) => { tab.setAttribute("aria-selected", String(name === active)); tab.tabIndex = name === active ? 0 : -1; });
      panes.forEach((pane, name) => { pane.hidden = name !== active; });
      if (focus) tabs.get(active)?.focus();
      place();
    }
    function errorText(code) { return m(({ score: "scoreError", scoreOrder: "scoreOrderError", date: "dateError", dateOrder: "dateOrderError" })[code] || "invalidFilters"); }
    function validate() {
      const result = F.validate(draft);
      errors.forEach((node) => { node.hidden = true; node.replaceChildren(); });
      fields.forEach((node) => node.removeAttribute("aria-invalid"));
      result.errors.forEach(({ field, code }) => {
        const input = fields.get(field), error = errors.get(field);
        if (input) input.setAttribute("aria-invalid", "true");
        if (error) { error.hidden = false; error.append(DA.i18n.text(errorText(code))); }
      });
      return result;
    }
    function group(key) {
      const g = GROUPS.find((entry) => entry.key === key);
      return h("fieldset", { class: "da-registry-filter-group" }, h("legend", {}, g.title),
        g.options.map((option) => DA.checkbox(option.label, draft[key].includes(option.value), (checked) => {
          draft[key] = checked ? [...draft[key], option.value] : draft[key].filter((value) => value !== option.value);
          refreshCounts();
        })));
    }
    function range(title, from, to, type) {
      let calendar;
      const input = (key, label) => {
        const error = h("span", { class: "da-registry-filter-error", id: `registry-${key}-error`, hidden: true, "aria-live": "polite" });
        const node = h("input", { class: "da-input", type: "text", inputmode: type === "date" ? "numeric" : "decimal",
          value: type === "date" ? DA.calendarDates.format(draft[key]) : draft[key] ?? "", "aria-describedby": error.id,
          placeholder: type === "date" ? DA.msg("ui.calendarFormat") : key === from ? "0" : "100" });
        node.addEventListener("input", () => {
          const parsed = type === "date" ? DA.calendarDates.parse(node.value) : node.value;
          draft[key] = parsed === null ? node.value : parsed;
          if (type === "date") {
            draft.timezoneOffsetMinutes = new Date().getTimezoneOffset();
            calendar?.setRange({ from: draft[from], to: draft[to], ...(parsed ? { month: parsed } : {}) });
          }
          validate(); refreshCounts();
        });
        if (type === "date") node.addEventListener("blur", () => {
          const parsed = DA.calendarDates.parse(node.value);
          if (parsed !== null) node.value = DA.calendarDates.format(parsed);
        });
        fields.set(key, node); errors.set(key, error);
        return h("label", { class: "da-registry-filter-field" }, h("span", {}, label), node, error);
      };
      const fieldsGroup = h("fieldset", { class: "da-registry-filter-group" }, h("legend", { class: type === "date" ? "da-sr" : null }, title),
        h("div", { class: "da-registry-filter-range" }, input(from, m("from")), input(to, m("to"))));
      if (type !== "date") return fieldsGroup;
      calendar = DA.dateRangeCalendar({ from: draft[from], to: draft[to], onChange: (value) => {
        draft[from] = value.from; draft[to] = value.to; draft.timezoneOffsetMinutes = new Date().getTimezoneOffset();
        fields.get(from).value = DA.calendarDates.format(value.from); fields.get(to).value = DA.calendarDates.format(value.to);
        validate(); refreshCounts();
      } });
      return h("div", { class: "da-registry-date-range" }, fieldsGroup, calendar);
    }
    function draw() {
      draft = F.normalize(filter); fields = new Map(); errors = new Map(); tabs = new Map(); panes = new Map();
      const versions = Object.values(DA.state.checklists || {}).sort((a, b) => b.version - a.version);
      const versionOptions = [{ value: "", label: DA.t("registry.activeChecklist") },
        ...versions.map((cl) => ({ value: cl.id, label: DA.t("registry.versionLabel", { version: cl.version }) }))];
      const version = DA.dropdown(versionOptions, draft.checklistId, (value) => { draft.checklistId = value; refreshCounts(); }, m("checklist"));
      refreshVersion = () => {
        versionOptions[0].label = DA.t("registry.activeChecklist");
        versions.forEach((cl, index) => { versionOptions[index + 1].label = DA.t("registry.versionLabel", { version: cl.version }); });
        version.setValue(draft.checklistId);
      };
      const contents = {
        status: [group("status"), group("attention")], appealStatus: [group("appealStatus")], channels: [group("channels"), group("languages")],
        score: [range(m("scoreRange"), "scoreFrom", "scoreTo", "score")], date: [range(m("dateRange"), "dateFrom", "dateTo", "date")],
        checklistId: [h("fieldset", { class: "da-registry-filter-group" }, h("legend", {}, m("checklist")), version)]
      };
      sections.forEach((section, index) => {
        const id = `registry-filter-${section.key}`;
        tabs.set(section.key, h("button", { type: "button", class: "da-filter-group-tab", role: "tab", id: id + "-tab", "data-filter-group": section.key,
          "aria-controls": id, onclick: () => activate(section.key), onkeydown: (event) => {
            const next = event.key === "ArrowDown" ? (index + 1) % sections.length : event.key === "ArrowUp" ? (index + sections.length - 1) % sections.length
              : event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : null;
            if (next != null) { event.preventDefault(); activate(sections[next].key, true); }
          } }, h("span", {}, section.title), h("span", { class: "da-filter-group-count", hidden: true })));
        panes.set(section.key, h("div", { class: "da-registry-filter-pane", id, role: "tabpanel", "aria-labelledby": id + "-tab", hidden: true }, contents[section.key]));
      });
      panel.replaceChildren(
        h("div", { class: "da-registry-filter-picker" },
          h("div", { class: "da-registry-filter-nav", role: "tablist", "aria-orientation": "vertical", "aria-label": m("filters") }, ...tabs.values()),
          h("div", { class: "da-registry-filter-content" }, ...panes.values())),
        h("div", { class: "da-registry-filters-foot" },
          h("button", { class: "da-btn is-text", type: "button", onclick: () => { filter = F.normalize(); batchFilter = null; draw(); onApply(); } }, m("resetFiltersShort")),
          h("button", { class: "da-btn is-primary", type: "button", onclick: () => {
            const result = validate();
            if (!result.valid) { activate(result.errors[0].field); fields.get(result.errors[0].field)?.focus(); return; }
            filter = F.normalize({ ...draft, q: filter.q }); batchFilter = null; close(true); onApply();
          } }, m("applyFiltersShort"))));
      activate(active); refreshCounts(); validate();
    }
    function open(key) {
      if (panel.hidden) draw();
      panel.hidden = false; button.setAttribute("aria-expanded", "true");
      activate(key || active);
      document.addEventListener("mousedown", outside); document.addEventListener("keydown", keys);
      window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
      tabs.get(active)?.focus({ preventScroll: true });
    }
    const refreshLocale = () => { refreshVersion(); place(); };
    window.addEventListener("da:locale-changed", refreshLocale);
    button.addEventListener("click", () => panel.hidden ? open() : close());
    return { button, panel, open, refresh() { const n = F.count({ ...filter, q: "" }); count.textContent = n; count.hidden = !n; }, close,
      destroy() { close(); window.removeEventListener("da:locale-changed", refreshLocale); } };
  }

  DA.views = DA.views || {};
  DA.views.registry = function mount(root, params) {
    if (!SIZES.includes(DA.state.pageSize)) DA.state.pageSize = storedSize() || 10;
    const query = params && params.query || {};
    if (F.hasQuery(query) || Object.hasOwn(query, "batch")) {
      filter = F.readQuery(query);
      batchFilter = query.batch || null;
      if (filterKey() !== selectionFilters) view.page = 1;
      filtersChanged();
    }
    for (const cid of view.selected) if (!DA.state.conversations[cid]) view.selected.delete(cid);
    const tbody = h("tbody");
    const counter = h("span", { class: "da-registry-scope", "aria-live": "polite" });
    const totalValue = h("b"), evaluatedValue = h("b"), averageValue = h("b"), appealValue = h("b"), grossValue = h("b");
    const totalLabel = h("span"), appealLabel = h("span"), grossLabel = h("span");
    const totalMetric = h("div", { class: "da-registry-metric" }, totalValue, " ", totalLabel);
    const averageMetric = h("div", { class: "da-registry-metric is-average" }, m("averageInline"), averageValue);
    const evaluatedPart = h("span", {}, m("evaluatedBefore"), evaluatedValue, m("evaluatedAfter"));
    const evaluatedAll = h("span", { hidden: true }, m("allEvaluated"));
    const progressFill = h("i"), progress = h("span", { class: "da-registry-evaluation-progress", "aria-hidden": "true" }, progressFill);
    const evaluatedMetric = h("div", { class: "da-registry-metric da-registry-evaluation" }, evaluatedPart, evaluatedAll, progress);
    const appealMetric = h("a", { class: "da-registry-metric is-link is-appeal", href: "#/appeals?status=open" }, appealValue, " ", appealLabel);
    const grossMetric = h("a", { class: "da-registry-metric is-link is-gross", href: "#/?state=gross", onclick: (event) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      filter = F.normalize({ attention: ["gross"], checklistId: filter.checklistId }); batchFilter = null;
      applyFilters();
    } }, grossValue, " ", grossLabel);
    const summary = h("section", { class: "da-registry-summary", "aria-label": m("selectedSummary"), tabindex: 0 }, totalMetric, evaluatedMetric, averageMetric, appealMetric, grossMetric);
    const chips = h("div", { class: "da-active-filters" });
    const menu = filterPanel(applyFilters);
    const loadStatus = h("div", { class: "da-registry-load-status", hidden: true, role: "status", "aria-live": "polite" });
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
    const upload = h("button", { class: "da-btn da-registry-upload", type: "button", "aria-label": m("upload"), onclick: () => DA.openUpload(loadScope) }, DA.icon("upload", 17), m("uploadShort"));
    const sttEntry = h("button", { class: "da-btn is-text is-sm stt-registry-open", type: "button", hidden: true, onclick: () => DA.stt?.open({ all: true }) }, DA.icon("phone", 16), m("transcriptions"));
    const exports = organizerExport();
    const rows = new Map();
    let fresh = new Set(), animate = false, filtered = [], pageRecords = [], mounted = true, starting = false;
    let report = null, compact = new Map(), request = null, requestId = 0, refreshing = false, refreshTimer;

    function applyFilters() {
      search.value = filter.q;
      filtersChanged(); view.page = 1; menu.refresh(); renderChips();
      loadScope();
    }

    function notifyAssistant(scope, next, current) {
      // Ошибка дополнительной панели не меняет успешно полученный реестр.
      Promise.resolve().then(() => {
        if (!mounted || current !== requestId) return;
        return DA.setAssistantScope?.({ filters: scope, count: next.scope.total,
          fingerprint: JSON.stringify([next.scope.conversationIds, next.scope.checklist?.id]) });
      }).catch(() => console.warn("Assistant context update failed"));
    }

    async function loadScope(added, background = false) {
      const current = ++requestId;
      request?.abort(); request = new AbortController();
      const scope = requestFilters(), validation = F.validate(scope);
      refreshing = true;
      if (!background) {
        loadStatus.hidden = false;
        loadStatus.classList.remove("is-error");
        loadStatus.replaceChildren(DA.i18n.text(m("loading")));
      }
      wrap.setAttribute("aria-busy", "true");
      if (!background) { report = null; compact.clear(); render(); }
      try {
        if (!validation.valid) throw new TypeError("invalid_filters");
        const next = await DA.api.getAnalytics(scope, { signal: request.signal });
        if (!mounted || current !== requestId) return;
        report = next;
        compact = new Map(next.conversations.map((row) => [row.conversationId, row]));
        for (const id of view.selected) if (!compact.has(id)) view.selected.delete(id);
        loadStatus.hidden = true;
        notifyAssistant(scope, next, current);
      } catch (error) {
        if (!mounted || current !== requestId || error?.name === "AbortError") return;
        report = null; compact.clear();
        loadStatus.hidden = false;
        loadStatus.classList.add("is-error");
        loadStatus.replaceChildren(h("span", {}, validation.valid ? m("loadFailed") : m("invalidFilters")),
          h("button", { class: "da-btn is-text is-sm", type: "button", onclick: validation.valid ? () => loadScope() : reset },
            validation.valid ? m("exportRetry") : m("clearFilters")));
      } finally {
        if (mounted && current === requestId) {
          refreshing = false; wrap.removeAttribute("aria-busy"); render(added);
        }
      }
    }

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
      const total = report?.scope.total || 0, evaluated = report?.coverage.evaluated || 0;
      const average = report?.overview.avgScore, appeals = report?.overview.openAppealCount || 0, gross = report?.overview.grossCount || 0;
      DA.i18n.bindText(totalValue, () => total.toLocaleString(DA.fmt.locale()));
      DA.i18n.bindText(totalLabel, m("conversationNoun", { count: total }));
      DA.i18n.bindText(evaluatedValue, () => evaluated.toLocaleString(DA.fmt.locale()));
      DA.i18n.bindText(averageValue, () => average == null ? "" : average.toLocaleString(DA.fmt.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
      DA.i18n.bindText(appealValue, () => appeals.toLocaleString(DA.fmt.locale()));
      DA.i18n.bindText(grossValue, () => gross.toLocaleString(DA.fmt.locale()));
      DA.i18n.bindText(appealLabel, m("pendingAppeals", { count: appeals }));
      DA.i18n.bindText(grossLabel, m("grossCount", { count: gross }));
      summary.hidden = !report || !total;
      const complete = total > 0 && evaluated === total;
      evaluatedPart.hidden = complete; evaluatedAll.hidden = !complete; progress.hidden = complete;
      progressFill.style.transform = `scaleX(${total ? evaluated / total : 0})`;
      averageMetric.hidden = average == null; appealMetric.hidden = !appeals; grossMetric.hidden = !gross;
      const constrained = F.count(filter) || batchFilter;
      DA.i18n.bindText(counter, report ? constrained
        ? m("scopeFiltered", { count: total, total: Object.keys(DA.state.conversations).length }) : m("scopeAll") : "");
      const count = Object.keys(DA.state.conversations).filter((cid) => !DA.state.evaluations[cid]).length;
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

    /* Обновление результата заново проверяет выбранную версию и состав выборки на сервере. */
    function refreshProgress() {
      if (!mounted) return;
      updateCounter();
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => loadScope(null, true), 250);
    }

    /* Состояние звонка обновляется отдельно от строки и её выбора. */
    function refreshStt() {
      if (!mounted) return;
      const current = DA.stt?.current();
      sttEntry.hidden = !current || !(current.allPending || current.allFailed || current.retryPending || current.missing || current.error && current.tracking);
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
      if (F.validate(filter).valid) {
        const query = new URLSearchParams(F.toQuery(filter));
        if (batchFilter) query.set("batch", batchFilter);
        history.replaceState(null, "", "#/" + (query.size ? "?" + query : ""));
      }
      chips.replaceChildren();
      function chip(label, clear, group) {
        if (!group) {
          chips.append(h("button", { class: "da-filter-chip", type: "button", onclick: () => { clear(); applyFilters(); } }, label, DA.icon("x", 14)));
          return;
        }
        chips.append(h("span", { class: "da-filter-chip da-filter-edit-chip" },
          h("button", { class: "da-filter-chip-edit", type: "button", onclick: () => menu.open(group) }, label),
          h("button", { class: "da-filter-chip-remove", type: "button", "aria-label": m("removeFilter"), onclick: () => { clear(); applyFilters(); } }, DA.icon("x", 14))));
      }
      for (const g of GROUPS) for (const value of filter[g.key]) {
        const option = g.options.find((entry) => entry.value === value);
        if (option) chip(option.label, () => { filter[g.key] = filter[g.key].filter((entry) => entry !== value); batchFilter = null; }, g.key);
      }
      if (filter.q) chip(m("searchChip", { query: filter.q }), () => { filter.q = ""; });
      if (filter.scoreFrom != null || filter.scoreTo != null) chip(m("scoreChip", { from: filter.scoreFrom ?? 0, to: filter.scoreTo ?? 100 }), () => { filter.scoreFrom = filter.scoreTo = null; }, "score");
      if (filter.dateFrom || filter.dateTo) chip(m("dateChip", { from: filter.dateFrom || "…", to: filter.dateTo || "…" }), () => { filter.dateFrom = filter.dateTo = ""; }, "date");
      if (filter.checklistId) {
        const cl = Object.values(DA.state.checklists || {}).find((entry) => entry.id === filter.checklistId);
        chip(cl ? m("versionLabel", { version: cl.version }) : m("checklist"), () => { filter.checklistId = ""; }, "checklistId");
      }
      if (filter.groupId) chip(m("groupSelection", { group: filter.groupId }), () => { filter.groupId = ""; });
      if (Array.isArray(filter.conversationIds)) chip(m("exactSelection", { count: filter.conversationIds.length }), () => { filter.conversationIds = null; });
      if (batchFilter) chip(m("failed"), () => { batchFilter = null; });
      if (chips.children.length > 1) chips.append(h("button", { class: "da-btn is-text is-sm", type: "button", onclick: reset }, m("clearAll")));
      menu.refresh();
    }
    function reset() {
      filter = F.normalize(); batchFilter = null; menu.close(); applyFilters();
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
      const focusRow = document.activeElement?.closest("tr[data-conversation]");
      const focusId = focusRow?.dataset.conversation, focusCheckbox = document.activeElement?.type === "checkbox";
      const list = filtered = (report?.conversations || []).map((item) => ({
        ...(DA.state.conversations[item.conversationId] || {}), conversation_id: item.conversationId,
        transcript: DA.state.conversations[item.conversationId]?.transcript || [],
        language: item.language, channel: item.channel, scopeRow: item
      })).sort((a, b) => a.scopeRow.number - b.scopeRow.number);
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
      const empty = !Object.keys(DA.state.conversations).length && !refreshing && !!report;
      page.classList.toggle("is-empty", empty);
      emptyState.hidden = !empty;
      table.hidden = empty || !report;
      selectionBar.hidden = empty || !report;
      toolbar.hidden = empty;
      upload.hidden = empty;
      tbody.replaceChildren();
      rows.clear();
      tbody.classList.remove("is-paging");
      pageRecords = list.slice((view.page - 1) * size, view.page * size);
      if (empty || !report) {
        pager.hidden = true;
        syncSelection();
        return;
      }
      if (!list.length) {
        pager.hidden = true;
        tbody.append(h("tr", { class: "da-empty-row" }, h("td", { colspan: 6 },
          h("div", {}, m("noMatches")),
          h("button", { class: "da-btn is-text", onclick: reset }, m("clearFilters")))));
        syncSelection();
        return;
      }
      pager.hidden = false;
      pageRecords.forEach((r, i) => {
        const cid = r.conversation_id, item = r.scopeRow;
        const current = DA.state.evaluations[cid];
        const currentResult = !filter.checklistId && !item.readyIsPreviousAttempt && current?.id === item.evaluationId
          && item.latestEvaluationId === item.evaluationId;
        // Обычная карточка показывает текущую расшифровку. Явный выбор версии или прежнего итога сохраняет источник оценки.
        const evaluationId = item.evaluationId && !currentResult ? item.evaluationId : null;
        const open = () => (location.hash = `#/c/${encodeURIComponent(cid)}` + (evaluationId ? `?evaluation=${encodeURIComponent(evaluationId)}` : ""));
        const control = rowCheckbox(cid), score = h("td", { class: "c-score" }, scoreCell(cid, false, item)), mark = h("td", { class: "c-marks" }, marks(item));
        const stt = h("span", { class: "stt-row-slot" });
        const row = h("tr", { class: fresh.has(cid) ? "is-fresh" : null, "data-conversation": cid, style: `--i: ${Math.min(i, 14)}`, tabindex: 0, onclick: open,
          onkeydown: (e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(); } },
          h("td", { class: "c-select", onclick: (e) => e.stopPropagation() }, control),
          h("td", { class: "da-num c-num", title: cid }, DA.convNumber(cid)),
          h("td", { class: "c-prev" }, h("div", { class: "da-preview" }, item.preview || item.topic || topic(r)),
            h("div", { class: "da-record-meta" },
              h("span", { class: "c-chan" }, h("span", { class: "da-channel" }, DA.icon(r.channel === "voice call" ? "phone" : "message", 14), DA.msg(() => DA.channelLabel(r)))),
              h("span", { class: "c-lang" }, DA.msg(() => DA.langLabel[r.language])),
              item.startedAt ? h("span", { class: "c-date" }, DA.msg(() => when(item.startedAt))) : null,
              h("span", { class: "c-dur" }, DA.icon("clock", 12), h("span", { class: "da-sr" }, m("durationLabel")), DA.fmt.duration(DA.tx.duration(r))),
              r.channel === "voice call" ? stt : null)),
          score, h("td", { class: "c-appeals" }, appealCell(item)), mark);
        rows.set(cid, { row, input: control.querySelector("input"), score, mark, stt, sttStamp: null });
        tbody.append(row);
      });
      if (animate) { void tbody.offsetWidth; tbody.classList.add("is-paging"); }
      animate = false;
      fresh = new Set();
      renderPager(list.length, pages);
      syncSelection();
      refreshStt();
      if (focusId && rows.has(focusId)) (focusCheckbox ? rows.get(focusId).input : rows.get(focusId).row).focus({ preventScroll: true });
    }

    const search = h("input", { class: "da-input", type: "search", placeholder: m("searchPlaceholder"), value: filter.q, "aria-label": m("search") });
    let t;
    search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { filter.q = search.value; batchFilter = null; applyFilters(); }, 250); });

    const toolbar = h("div", { class: "da-registry-tools" },
      h("div", { class: "da-registry-find" }, h("div", { class: "da-search" }, DA.icon("search"), search), menu.button),
      allNew,
      h("div", { class: "da-registry-filter-state" }, counter, chips, sttEntry, exports.button), menu.panel);
    const table = h("table", { class: "da-table da-registry" },
        h("thead", {}, h("tr", {},
          h("th", { class: "c-select" }, pageCheck),
          h("th", {}, m("number")), h("th", {}, m("conversation")), h("th", {}, m("total")), h("th", {}, m("appeals")), h("th", {}, h("span", { class: "da-sr" }, m("marks"))))), tbody);
    const emptyState = h("div", { class: "da-registry-empty", hidden: true },
      h("div", { class: "da-empty-register", "aria-hidden": "true" },
        ...Array.from({ length: 4 }, (_, i) => h("div", { class: i ? "da-empty-register-row" : "da-empty-register-head" }, h("i"), h("i"), h("i")))),
      h("h2", {}, m("emptyTitle")), h("p", {}, m("emptyHelp")),
      h("button", { class: "da-btn is-primary", type: "button", onclick: () => DA.openUpload(loadScope) }, DA.icon("upload", 18), m("upload")));
    wrap.append(toolbar, loadStatus, selectionBar, table, pager, emptyState);
    const headingTitle = h("h1", { class: "da-h1", tabindex: -1 }, m("title"));
    const heading = h("div", { class: "da-page-head da-registry-heading" }, headingTitle, summary, upload);
    const page = h("div", { class: "da-page da-registry-page" }, heading, wrap);
    root.append(page);
    render();
    loadScope();
    const summaryLayout = new ResizeObserver(() => {
      if (!mounted || summary.hidden) return;
      const widths = [...summary.children].map((node) => node.getBoundingClientRect().width).filter(Boolean);
      const needed = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * 8;
      const available = heading.clientWidth - headingTitle.getBoundingClientRect().width - upload.getBoundingClientRect().width - 32;
      heading.classList.toggle("has-summary-row", innerWidth < 1100 || needed > available);
    });
    [heading, headingTitle, upload, ...summary.children].forEach((node) => summaryLayout.observe(node));
    let receivedBulkSnapshot = false;
    const unsubscribe = DA.bulk?.subscribe(() => { if (receivedBulkSnapshot) refreshProgress(); receivedBulkSnapshot = true; });
    const unsubscribeStt = DA.stt?.subscribe(refreshStt);
    window.addEventListener("da:appeals-changed", refreshProgress);
    return () => {
      mounted = false;
      clearTimeout(t);
      clearTimeout(refreshTimer);
      request?.abort();
      unsubscribe?.();
      unsubscribeStt?.();
      summaryLayout.disconnect();
      exports.destroy();
      menu.destroy();
      window.removeEventListener("da:appeals-changed", refreshProgress);
      DA.bulk?.clearSelection();
    };
  };
})();
