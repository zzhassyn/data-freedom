/* Применение версии: выбор обращений и сравнение с исходными оценками. */
(function () {
  const DA = window.DA, h = DA.h;
  DA.i18n.addMessages({
    "apply.versionNotFound": { ru: "Версия не найдена", kk: "Нұсқа табылмады", en: "Version not found" },
    "apply.openChecklist": { ru: "Открыть чек-лист", kk: "Тексеру парағын ашу", en: "Open checklist" },
    "apply.back": { ru: "К чек-листу", kk: "Тексеру парағына", en: "Back to checklist" },
    "apply.heading": { ru: "Применить версию {version} к обращениям", kk: "{version}-нұсқаны өтініштерге қолдану", en: "Apply version {version} to conversations" },
    "apply.inactive": { ru: "Эта версия пока не активна.", kk: "Бұл нұсқа әзірге белсенді емес.", en: "This version is not active yet." },
    "apply.activate": { ru: "Сделать активной", kk: "Белсенді ету", en: "Make active" },
    "apply.activateError": { ru: "Не удалось сделать версию активной. Повторите действие", kk: "Нұсқаны белсенді ету мүмкін болмады. Қайталап көріңіз", en: "Could not activate this version. Try again" },
    "apply.compareVersionLabel": { ru: "Версия для сравнения", kk: "Салыстыруға арналған нұсқа", en: "Comparison version" },
    "apply.chooseCompare": { ru: "Выберите версию для сравнения", kk: "Салыстыру үшін нұсқаны таңдаңыз", en: "Choose a version to compare" },
    "apply.version": { ru: "Версия {version}", kk: "{version}-нұсқа", en: "Version {version}" },
    "apply.weightChange": { ru: "Вес {before} → {after}", kk: "Салмақ: {before} → {after}", en: "Weight {before} → {after}" },
    "apply.removedDetail": { ru: "Больше не участвует в оценке", kk: "Бағалауға енді қатыспайды", en: "No longer included in evaluation" },
    "apply.section": { ru: "Раздел", kk: "Бөлім", en: "Section" },
    "apply.sectionChange": { ru: "{before} → {after}", kk: "{before} → {after}", en: "{before} → {after}" },
    "apply.orderDetail": { ru: "Изменилось место в списке критериев", kk: "Критерийлер тізіміндегі орны өзгерді", en: "Position in the criteria list changed" },
    "apply.typeBinary": { ru: "Да или нет", kk: "Иә немесе жоқ", en: "Yes or no" },
    "apply.typeScale": { ru: "Баллы по шкале", kk: "Шкала бойынша ұпай", en: "Points on a scale" },
    "apply.typeFlag": { ru: "Отметка нарушения", kk: "Бұзушылық белгісі", en: "Violation flag" },
    "apply.typeChange": { ru: "{before} → {after}", kk: "{before} → {after}", en: "{before} → {after}" },
    "apply.naDetail": { ru: "Не применяется, если {condition}", kk: "Мына жағдайда қолданылмайды: {condition}", en: "Does not apply if {condition}" },
    "apply.alwaysApplies": { ru: "Применяется ко всем разговорам", kk: "Барлық әңгімеге қолданылады", en: "Applies to every conversation" },
    "apply.scaleChanged": { ru: "Изменены ступени шкалы", kk: "Шкала деңгейлері өзгертілді", en: "Scale levels changed" },
    "apply.flagsChanged": { ru: "Изменены виды нарушений", kk: "Бұзушылық түрлері өзгертілді", en: "Violation types changed" },
    "apply.changeAdded": { ru: "Добавлен", kk: "Қосылды", en: "Added" },
    "apply.changeRemoved": { ru: "Удалён", kk: "Жойылды", en: "Removed" },
    "apply.changeRule": { ru: "Изменено правило", kk: "Ереже өзгерді", en: "Rule changed" },
    "apply.changeWeight": { ru: "Изменён вес", kk: "Салмақ өзгерді", en: "Weight changed" },
    "apply.changeSection": { ru: "Изменён раздел", kk: "Бөлім өзгерді", en: "Section changed" },
    "apply.changeOrder": { ru: "Изменён порядок", kk: "Реті өзгерді", en: "Order changed" },
    "apply.weightsOnly": { ru: "Модель вызывать не нужно, итоги пересчитаются по новым весам.", kk: "Модельді шақыру қажет емес, қорытындылар жаңа салмақтар бойынша қайта есептеледі.", en: "No model call is needed. Totals will be recalculated with the new weights." },
    "apply.reuseSame": { ru: "Ответы по совпадающим правилам возьмём из прошлых оценок.", kk: "Ережелері бірдей жауаптарды бұрынғы бағалаулардан аламыз.", en: "Answers for unchanged rules will be reused from previous evaluations." },
    "apply.modelRecheck": { ru: { one: "Модель заново оценит {count} критерий.", few: "Модель заново оценит {count} критерия.", many: "Модель заново оценит {count} критериев.", other: "Модель заново оценит {count} критерия." }, kk: "Модель {count} критерийді қайта бағалайды.", en: { one: "The model will reevaluate {count} criterion.", other: "The model will reevaluate {count} criteria." } },
    "apply.reuseRest": { ru: { one: " Ответ по {count} остальному критерию возьмём из прошлых оценок, это быстрее и дешевле.", other: " Ответы по {count} остальным критериям возьмём из прошлых оценок, это быстрее и дешевле." }, kk: " Қалған {count} критерий бойынша жауаптарды бұрынғы бағалаулардан аламыз. Бұл жылдамырақ әрі арзанырақ.", en: { one: " The remaining answer will be reused, saving time and cost.", other: " Answers for the other {count} criteria will be reused, saving time and cost." } },
    "apply.changesHeading": { ru: "Что изменилось по сравнению с", kk: "Өзгерістерді салыстыру нұсқасы", en: "Changes compared with" },
    "apply.sameRules": { ru: "Правила и веса совпадают.", kk: "Ережелер мен салмақтар бірдей.", en: "Rules and weights are unchanged." },
    "apply.number": { ru: "№ {number}", kk: "№ {number}", en: "#{number}" },
    "apply.noMatches": { ru: "Обращения не найдены. Измените запрос.", kk: "Өтініштер табылмады. Сұрауды өзгертіңіз.", en: "No conversations found. Change your search." },
    "apply.retryLoad": { ru: "Повторить загрузку", kk: "Қайта жүктеу", en: "Retry loading" },
    "apply.loading": { ru: "Загружаем версии и оценки", kk: "Нұсқалар мен бағалар жүктелуде", en: "Loading versions and evaluations" },
    "apply.selectAll": { ru: "Все оценённые ({count})", kk: "Барлық бағаланған өтініштер ({count})", en: "All evaluated ({count})" },
    "apply.selectVersion": { ru: "Оценённые по версии {version} ({count})", kk: "{version}-нұсқамен бағаланғандар ({count})", en: "Evaluated with version {version} ({count})" },
    "apply.selectManual": { ru: "Выбрать вручную", kk: "Қолмен таңдау", en: "Select manually" },
    "apply.selectionLabel": { ru: "К каким обращениям применить версию", kk: "Нұсқаны қай өтініштерге қолдану керек", en: "Conversations to apply this version to" },
    "apply.searchPlaceholder": { ru: "Номер обращения или текст", kk: "Өтініш нөмірі немесе мәтін", en: "Conversation number or text" },
    "apply.searchLabel": { ru: "Найти обращение", kk: "Өтінішті табу", en: "Find a conversation" },
    "apply.whichConversations": { ru: "К каким обращениям", kk: "Қай өтініштерге қолдану керек", en: "Which conversations" },
    "apply.noEvaluations": { ru: "Сначала оцените обращения, чтобы сравнить результаты двух версий. ", kk: "Екі нұсқаның нәтижесін салыстыру үшін алдымен өтініштерді бағалаңыз. ", en: "Evaluate conversations first to compare the results of two versions. " },
    "apply.goConversations": { ru: "Перейти к обращениям", kk: "Өтініштерге өту", en: "Go to conversations" },
    "apply.busyNote": { ru: "Дождитесь завершения текущей оценки. Прогресс доступен внизу экрана.", kk: "Ағымдағы бағалаудың аяқталуын күтіңіз. Оның барысы экранның төменгі жағында көрсетілген.", en: "Wait for the current evaluation to finish. Progress is shown at the bottom of the screen." },
    "apply.missingBaseline": { ru: { one: "У {count} обращения нет оценки по версии {version}. Для него модель проверит все критерии.", other: "У {count} обращений нет оценки по версии {version}. Для них модель проверит все критерии." }, kk: "{count} өтініштің {version}-нұсқа бойынша бағасы жоқ. Модель олар үшін барлық критерийді тексереді.", en: { one: "{count} conversation has no evaluation with version {version}. The model will check every criterion for it.", other: "{count} conversations have no evaluation with version {version}. The model will check every criterion for them." } },
    "apply.starting": { ru: "Начинаем оценку", kk: "Бағалау басталуда", en: "Starting evaluation" },
    "apply.applyCount": { ru: { one: "Применить к {count} обращению", other: "Применить к {count} обращениям" }, kk: "{count} өтінішке қолдану", en: { one: "Apply to {count} conversation", other: "Apply to {count} conversations" } },
    "apply.criterion": { ru: "Критерий", kk: "Критерий", en: "Criterion" },
    "apply.noAnswer": { ru: "Нет ответа", kk: "Жауап жоқ", en: "No answer" },
    "apply.yes": { ru: "Да", kk: "Иә", en: "Yes" },
    "apply.no": { ru: "Нет", kk: "Жоқ", en: "No" },
    "apply.na": { ru: "Не применимо", kk: "Қолданылмайды", en: "Not applicable" },
    "apply.value": { ru: "{value}", kk: "{value}", en: "{value}" },
    "apply.resultSummary": { ru: { one: "Итог изменился у {count} обращения из {total}, в среднем на {delta}.", other: "Итог изменился у {count} обращений из {total}, в среднем на {delta}." }, kk: "{total} өтініштің {count} қорытындысы өзгерді. Орташа өзгеріс: {delta}.", en: { one: "The total changed for {count} of {total} conversations, by {delta} on average.", other: "The total changed for {count} of {total} conversations, by {delta} on average." } },
    "apply.resultsPending": { ru: "Новые итоги появятся по мере готовности.", kk: "Жаңа қорытындылар дайын болғанда көрсетіледі.", en: "New totals will appear as they are ready." },
    "apply.noEvaluation": { ru: "Нет оценки", kk: "Баға жоқ", en: "No evaluation" },
    "apply.noTotal": { ru: "Нет итога", kk: "Қорытынды жоқ", en: "No total" },
    "apply.evaluationFailed": { ru: "Не удалось оценить", kk: "Бағалау мүмкін болмады", en: "Evaluation failed" },
    "apply.evaluating": { ru: "Оценивается", kk: "Бағалануда", en: "Being evaluated" },
    "apply.loadingTotal": { ru: "Загружаем итог", kk: "Қорытынды жүктелуде", en: "Loading total" },
    "apply.queued": { ru: "В очереди", kk: "Кезекте", en: "Queued" },
    "apply.difference": { ru: "Разница", kk: "Айырма", en: "Difference" },
    "apply.noComparison": { ru: "Нет сравнения", kk: "Салыстыру жоқ", en: "No comparison" },
    "apply.changedAnswers": { ru: "Изменившиеся ответы", kk: "Өзгерген жауаптар", en: "Changed answers" },
    "apply.answerChange": { ru: "{before} → {after}", kk: "{before} → {after}", en: "{before} → {after}" },
    "apply.noPrevious": { ru: "Нет прежней оценки", kk: "Бұрынғы баға жоқ", en: "No previous evaluation" },
    "apply.answersUnchanged": { ru: "Ответы не изменились", kk: "Жауаптар өзгерген жоқ", en: "Answers unchanged" },
    "apply.openRow": { ru: "Открыть обращение № {number} с оценкой по версии {version}", kk: "{version}-нұсқамен бағаланған № {number} өтінішті ашу", en: "Open conversation #{number} evaluated with version {version}" },
    "apply.resultsHeading": { ru: "Было и стало", kk: "Бұрынғы және жаңа нәтиже", en: "Before and after" },
    "apply.sortDelta": { ru: "Сначала большие изменения", kk: "Алдымен үлкен өзгерістер", en: "Largest changes first" },
    "apply.sortNumber": { ru: "По номеру обращения", kk: "Өтініш нөмірі бойынша", en: "By conversation number" },
    "apply.completedOf": { ru: " Готово {done} из {total}.", kk: " Дайыны: {total} ішінен {done}.", en: " {done} of {total} complete." },
    "apply.missingPrevious": { ru: " У {count} нет прежнего итога для сравнения.", kk: " {count} өтініштің салыстыруға арналған бұрынғы қорытындысы жоқ.", en: " {count} have no previous total to compare." },
    "apply.conversation": { ru: "Обращение", kk: "Өтініш", en: "Conversation" },
    "apply.failedCount": { ru: { one: "Не удалось оценить {count} обращение.", few: "Не удалось оценить {count} обращения.", many: "Не удалось оценить {count} обращений.", other: "Не удалось оценить {count} обращения." }, kk: "{count} өтінішті бағалау мүмкін болмады.", en: { one: "Could not evaluate {count} conversation.", other: "Could not evaluate {count} conversations." } },
    "apply.retryFailed": { ru: "Повторить их", kk: "Қайта бағалау", en: "Retry failed" },
    "apply.refreshComparison": { ru: "Обновить сравнение", kk: "Салыстыруды жаңарту", en: "Refresh comparison" },
    "apply.totalNotReady": { ru: "Итог ещё не готов. Обновите сравнение", kk: "Қорытынды әлі дайын емес. Салыстыруды жаңартыңыз", en: "The total is not ready yet. Refresh the comparison" },
    "apply.loadTotalsError": { ru: "Не удалось загрузить новые итоги", kk: "Жаңа қорытындыларды жүктеу мүмкін болмады", en: "Could not load the new totals" },
    "apply.startError": { ru: "Не удалось начать оценку. Ваш выбор сохранён", kk: "Бағалауды бастау мүмкін болмады. Таңдауыңыз сақталды", en: "Could not start evaluation. Your selection was kept" },
    "apply.loadError": { ru: "Не удалось загрузить оценки. Повторите загрузку", kk: "Бағаларды жүктеу мүмкін болмады. Қайта жүктеп көріңіз", en: "Could not load evaluations. Try loading again" }
  });
  const msg = (key, params) => DA.msg(`apply.${key}`, params);
  const text = (key, params) => DA.t(`apply.${key}`, params);
  const uiError = (error, fallback) => error?.uiMessageKey ? msg(error.uiMessageKey) : error?.message || error?.code ? DA.msg(() => DA.apiErrorMessage(error)) : msg(fallback);
  const score = (value) => msg("value", () => ({ value: DA.fmt.score(value) }));
  const modelFields = ["title", "description", "type", "naAllowed", "naCondition", "scale", "flagTypes"];
  const brief = (ev) => ({ id: ev.id, total: ev.total ?? null, answers: Object.fromEntries((ev.items || []).filter((i) => i.status === "done").map((i) => [i.criterionId, i.answer])) });
  const number = (n, digits) => new Intl.NumberFormat(DA.fmt.locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  const delta = (n, digits) => n === 0 ? "0" : `${n > 0 ? "+" : "−"}${number(Math.abs(n), digits)}`;
  const answer = (value) => value == null ? text("noAnswer") : ["yes", "no", "na"].includes(value) ? text(value) : String(value);
  const cacheKey = (version) => `da.apply.${DA.mode}.${version}`;
  function readRun(version) {
    try { return JSON.parse(sessionStorage.getItem(cacheKey(version)) || "null"); } catch (_) { return null; }
  }
  function saveRun(version, run) {
    try { sessionStorage.setItem(cacheKey(version), JSON.stringify(run)); } catch (_) { /* Сравнение остаётся на текущем экране. */ }
  }

  DA.views = DA.views || {};
  DA.views.apply = function mount(root, params) {
    const target = DA.state.checklists.find((cl) => cl.version === Number(params?.version));
    if (!target) {
      root.append(h("div", { class: "da-page" }, h("div", { class: "da-empty" }, h("h1", { tabindex: -1 }, msg("versionNotFound")), h("a", { class: "da-btn", href: "#/checklists" }, msg("openChecklist")))));
      return;
    }
    let disposed = false, loadId = 0, loaded = false, starting = false, activating = false;
    let run = readRun(target.version), mode = "version", selected = new Set(), searchText = "", sort = "delta", resultError = "";
    const fetching = new Set();
    const versions = [...DA.state.checklists].sort((a, b) => b.version - a.version);
    const jobs = () => DA.bulk?.jobs?.() || [DA.bulk?.current()].filter(Boolean);
    const belongs = (job) => job?.source === "apply" && Number(job.toVersion) === target.version && job.applyRunId;
    const newest = () => [...jobs()].reverse().find(belongs);
    let ignoredRun = run?.dismissed || null;
    const current = newest()?.applyRunId === ignoredRun ? null : newest();
    let pinnedRunId = current?.applyRunId || run?.key || null, pendingRunId = null;
    let sourceVersion = Number(current?.fromVersion) || run?.fromVersion || target.basedOnVersion || versions.find((cl) => cl.version < target.version)?.version || versions.find((cl) => cl.version !== target.version)?.version || target.version;
    if (run?.dismissed) run = null;
    if (current && run?.key !== current.applyRunId) run = null;
    // Возврат к сравнению сохраняет точный набор, даже если общий список вырос.
    if (run?.ids) { mode = "manual"; selected = new Set(run.ids); }
    let allEvaluations = [], sourceEvaluations = [], diff = null, baseline = {}, loadError = "", actionError = "";
    const activeNotice = h("div", { class: "ap-active" }), setup = h("div", { class: "ap-setup" });
    const result = h("section", { class: "ap-results", "aria-labelledby": "ap-results-title" });
    const page = h("div", { class: "da-page ap-page" },
      h("a", { class: "ap-back", href: `#/checklists?version=${target.version}` }, DA.icon("back", 16), msg("back")),
      h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, msg("heading", { version: target.version }))),
      activeNotice, setup, result);
    root.append(page);

    const busy = () => starting || !!DA.bulk?.isBusy();
    const source = () => DA.state.checklists.find((cl) => cl.version === sourceVersion);
    const ids = () => mode === "manual" ? [...selected] : (mode === "all" ? allEvaluations : sourceEvaluations).map((ev) => ev.conversationId);
    function notice() {
      activeNotice.hidden = !!DA.state.checklists.find((cl) => cl.version === target.version)?.isActive;
      activeNotice.replaceChildren(h("span", {}, msg("inactive")),
        h("button", { class: `da-btn is-text is-sm${activating ? " is-busy" : ""}`, type: "button", disabled: activating, onclick: async () => {
          activating = true; actionError = ""; notice();
          try { await DA.data.activateChecklist(target.version); }
          catch (error) { actionError = uiError(error, "activateError"); }
          finally { activating = false; if (!disposed) { notice(); refreshActions(); } }
        } }, msg("activate")));
    }
    function versionPicker() {
      const box = h("details", { class: "ap-version" });
      const trigger = h("summary", { class: "da-btn", "aria-label": msg("compareVersionLabel") }, msg("version", { version: sourceVersion }), DA.icon("chevron", 14));
      const menu = h("div", { class: "ap-version-menu", role: "group", "aria-label": msg("chooseCompare") }, versions.map((cl) =>
        h("button", { type: "button", class: cl.version === sourceVersion ? "is-selected" : null, onclick: () => {
          if (busy()) return;
          box.open = false;
          if (cl.version === sourceVersion) return;
          ignoredRun = pinnedRunId || newest()?.applyRunId || null;
          pinnedRunId = null; pendingRunId = null;
          sourceVersion = cl.version; run = null; actionError = ""; resultError = "";
          saveRun(target.version, { dismissed: ignoredRun, fromVersion: sourceVersion });
          load();
        } }, msg("version", { version: cl.version }), cl.version === sourceVersion ? DA.icon("check", 15) : null)));
      box.append(trigger, menu);
      trigger.addEventListener("click", (event) => { if (busy()) event.preventDefault(); });
      box.addEventListener("keydown", (event) => { if (event.key === "Escape") { box.open = false; trigger.focus(); } });
      return box;
    }
    function changeDetail(row) {
      if (row.kind === "weight") return msg("weightChange", { before: row.before.weight, after: row.after.weight });
      if (row.kind === "removed") return msg("removedDetail");
      if (row.kind === "added") return row.after.description;
      if (row.kind === "section") return msg("sectionChange", () => ({ before: source()?.sections.find((s) => s.id === row.before.sectionId)?.title || text("section"), after: target.sections.find((s) => s.id === row.after.sectionId)?.title || text("section") }));
      if (row.kind === "order") return msg("orderDetail");
      if (row.fields.includes("description")) return row.after.description;
      if (row.fields.includes("title")) return `${row.before.title} → ${row.after.title}`;
      if (row.fields.includes("type")) {
        const types = { binary: "typeBinary", scale: "typeScale", flag: "typeFlag" };
        return msg("typeChange", () => ({ before: text(types[row.before.type]), after: text(types[row.after.type]) }));
      }
      if (row.fields.some((field) => ["naAllowed", "naCondition"].includes(field))) return row.after.naAllowed ? msg("naDetail", { condition: row.after.naCondition }) : msg("alwaysApplies");
      if (row.fields.includes("scale")) return msg("scaleChanged");
      return msg("flagsChanged");
    }
    function changes() {
      const rows = DA.checklistChanges(target, source());
      const changedIds = new Set([...(diff?.added || []), ...(diff?.changed || []).filter((item) => item.fields.some((field) => modelFields.includes(field))).map((item) => item.criterionId)]);
      const count = changedIds.size, reused = target.criteria.length - count;
      let summary;
      if (!count) summary = msg(rows.some((row) => row.kind === "weight") ? "weightsOnly" : "reuseSame");
      else summary = [msg("modelRecheck", { count }), reused ? msg("reuseRest", { count: reused }) : null];
      const labels = { added: "changeAdded", removed: "changeRemoved", rule: "changeRule", weight: "changeWeight", section: "changeSection", order: "changeOrder" };
      return h("section", { class: "ap-changes", "aria-labelledby": "ap-changes-title" },
        h("div", { class: "ap-section-head" }, h("h2", { id: "ap-changes-title" }, msg("changesHeading")), versionPicker()),
        rows.length ? h("ul", { class: "ap-change-list" }, rows.map((row) => h("li", {}, h("span", { class: `ap-change-label is-${row.kind}` }, msg(labels[row.kind] || "changeRule")), h("div", {}, h("b", {}, row.title), h("p", {}, changeDetail(row)))))) : h("p", { class: "da-muted" }, msg("sameRules")),
        h("p", { class: "ap-reuse-note" }, DA.icon("refresh", 17), h("span", {}, summary, h("small", { class: "ap-reuse-extra", hidden: true }))));
    }
    function manualList() {
      const q = searchText.toLocaleLowerCase("ru-RU").trim();
      const list = allEvaluations.filter((ev) => {
        const conv = DA.state.conversations[ev.conversationId];
        return !q || DA.convNumber(ev.conversationId).includes(q) || DA.tx.preview(conv).toLocaleLowerCase("ru-RU").includes(q);
      });
      const host = setup.querySelector(".ap-manual-list");
      if (!host) return;
      host.replaceChildren(...list.map((ev) => {
        const conv = DA.state.conversations[ev.conversationId];
        const check = DA.checkbox(h("span", { class: "ap-choice-text" }, h("b", {}, msg("number", { number: DA.convNumber(ev.conversationId) })), h("span", {}, conv.summary?.topic || DA.tx.preview(conv))), selected.has(ev.conversationId), (on) => {
          on ? selected.add(ev.conversationId) : selected.delete(ev.conversationId); refreshActions();
        });
        check.querySelector("input").disabled = busy();
        return h("div", { class: "ap-choice" }, check, h("span", { class: "ap-choice-score" }, score(ev.total)));
      }));
      if (!list.length) host.append(h("p", { class: "ap-no-matches" }, msg("noMatches")));
    }
    function renderSetup() {
      if (!loaded) {
        setup.replaceChildren(h("div", { class: "ap-loading", role: "status" }, loadError ? h("div", { role: "alert" }, h("p", {}, loadError), h("button", { class: "da-btn", type: "button", onclick: load }, msg("retryLoad"))) : h("span", { class: "da-thinking" }, msg("loading"))));
        return;
      }
      const selector = DA.segmented([
        { value: "all", label: msg("selectAll", { count: allEvaluations.length }) },
        { value: "version", label: msg("selectVersion", { version: sourceVersion, count: sourceEvaluations.length }) },
        { value: "manual", label: msg("selectManual") }
      ], mode, (value) => { mode = value; renderSetup(); }, msg("selectionLabel"));
      const search = h("input", { class: "da-input", type: "search", value: searchText, placeholder: msg("searchPlaceholder"), "aria-label": msg("searchLabel"), oninput: (e) => { searchText = e.target.value; manualList(); } });
      setup.replaceChildren(changes(), h("section", { class: "ap-selection", "aria-labelledby": "ap-selection-title" },
        h("h2", { id: "ap-selection-title" }, msg("whichConversations")), selector,
        mode === "manual" ? h("div", { class: "ap-manual" }, h("div", { class: "da-search" }, DA.icon("search"), search), h("div", { class: "ap-manual-list" })) : null,
        !allEvaluations.length ? h("p", { class: "ap-no-evaluations" }, msg("noEvaluations"), h("a", { href: "#/" }, msg("goConversations"))) : null,
        h("div", { class: "ap-actions" }, h("button", { class: "da-btn is-primary ap-start", type: "button", onclick: () => start() }), h("p", { class: "ap-action-error", role: "alert", hidden: true })),
        h("p", { class: "ap-busy-note", hidden: true }, msg("busyNote"))));
      manualList(); refreshActions();
    }
    function refreshActions() {
      const button = setup.querySelector(".ap-start"), error = setup.querySelector(".ap-action-error");
      if (!button) return;
      const n = ids().length;
      const missing = ids().filter((id) => !baseline[id]).length, extra = setup.querySelector(".ap-reuse-extra");
      extra.hidden = !missing;
      DA.i18n.bindText(extra, "apply.missingBaseline", { count: missing, version: sourceVersion });
      DA.i18n.bindText(button, starting ? "apply.starting" : "apply.applyCount", { count: n });
      button.disabled = !n || busy(); button.classList.toggle("is-busy", starting);
      DA.i18n.bindText(error, () => DA.i18n.isMessage(actionError) ? DA.t(actionError.key, actionError.params) : actionError); error.hidden = !actionError;
      const blocked = busy();
      setup.querySelectorAll(".da-seg button, .ap-manual input, .ap-version button").forEach((control) => { control.disabled = blocked; });
      const picker = setup.querySelector(".ap-version");
      if (picker) { picker.classList.toggle("is-disabled", blocked); if (blocked) picker.open = false; }
      setup.querySelector(".ap-busy-note").hidden = !blocked || starting;
    }
    function changedAnswers(before, after) {
      const keys = new Set([...Object.keys(before?.answers || {}), ...Object.keys(after?.answers || {})]);
      return [...keys].filter((key) => (before?.answers[key] ?? null) !== (after?.answers[key] ?? null)).map((key) => ({
        title: target.criteria.find((c) => c.id === key)?.title || source()?.criteria.find((c) => c.id === key)?.title || null,
        before: before?.answers[key] ?? null, after: after?.answers[key] ?? null
      }));
    }
    function renderResults() {
      const focusId = result.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
      result.hidden = !run;
      if (!run) { result.replaceChildren(); return; }
      const rows = run.ids.map((id) => {
        const before = run.baseline[id], after = run.results[id];
        const complete = after?.status === "done", a = complete ? after.total : null, b = before?.total ?? null;
        return { id, before: b, after: a, status: after?.status || "queued", evaluationId: after?.id, delta: a != null && b != null ? a - b : null, changed: complete && before ? changedAnswers(before, after) : [] };
      });
      const paired = rows.filter((row) => row.delta != null), complete = rows.filter((row) => row.status === "done").length;
      const changed = paired.filter((row) => Math.abs(row.delta) > .00001).length;
      const average = paired.length ? paired.reduce((sum, row) => sum + row.delta, 0) / paired.length : null;
      const summary = paired.length ? msg("resultSummary", () => ({ count: changed, total: paired.length, delta: delta(average, 1) })) : msg("resultsPending");
      rows.sort((a, b) => sort === "number" ? DA.state.numbers[a.id] - DA.state.numbers[b.id] : (b.delta == null ? -1 : Math.abs(b.delta)) - (a.delta == null ? -1 : Math.abs(a.delta)) || DA.state.numbers[a.id] - DA.state.numbers[b.id]);
      const tbody = h("tbody", {}, rows.map((row) => {
        const open = () => { if (row.status === "done" && row.evaluationId) location.hash = `#/c/${encodeURIComponent(row.id)}?evaluation=${encodeURIComponent(row.evaluationId)}`; };
        const tr = h("tr", { class: row.status === "done" ? "is-ready" : null, "data-focus": row.id, tabindex: row.status === "done" ? 0 : null, onclick: open, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } } },
          h("td", { class: "ap-number" }, msg("number", { number: DA.convNumber(row.id) })),
          h("td", { class: "ap-before", "data-label": msg("version", { version: run.fromVersion }) }, row.before == null ? msg("noEvaluation") : score(row.before)),
          h("td", { class: `ap-after${row.status === "failed" ? " is-failed" : ""}`, "data-label": msg("version", { version: target.version }) }, row.status === "done" ? (row.after == null ? msg("noTotal") : score(row.after)) : row.status === "failed" ? msg("evaluationFailed") : h("span", { class: ["running", "loading"].includes(row.status) ? "da-thinking" : "da-muted" }, msg(row.status === "running" ? "evaluating" : row.status === "loading" ? "loadingTotal" : "queued"))),
          h("td", { class: `ap-delta ${row.delta > 0 ? "is-up" : row.delta < 0 ? "is-down" : ""}`, "data-label": msg("difference") }, row.delta == null ? msg("noComparison") : msg("value", () => ({ value: delta(row.delta, 2) }))),
          h("td", { class: "ap-answers", "data-label": msg("changedAnswers") }, row.changed.length ? row.changed.map((item) => h("span", { class: "ap-answer-change" }, h("b", {}, item.title || msg("criterion"), ": "), msg("answerChange", () => ({ before: answer(item.before), after: answer(item.after) })))) : h("span", { class: "da-muted" }, row.status === "done" ? msg(row.before == null ? "noPrevious" : "answersUnchanged") : "")));
        if (row.status === "done") DA.i18n.bindAttr(tr, "aria-label", "apply.openRow", { number: DA.convNumber(row.id), version: target.version });
        return tr;
      }));
      const failed = rows.filter((row) => row.status === "failed").map((row) => row.id);
      result.replaceChildren(...[h("div", { class: "ap-section-head" }, h("h2", { id: "ap-results-title" }, msg("resultsHeading")),
        h("button", { class: "da-btn is-text is-sm", type: "button", "data-focus": "sort", onclick: () => { sort = sort === "delta" ? "number" : "delta"; renderResults(); } }, DA.icon("list", 15), msg(sort === "delta" ? "sortDelta" : "sortNumber"))),
        h("p", { class: "ap-summary", "aria-live": "polite" }, summary, complete < rows.length ? msg("completedOf", { done: complete, total: rows.length }) : null, complete > paired.length ? msg("missingPrevious", { count: complete - paired.length }) : null),
        h("div", { class: "ap-table-wrap" }, h("table", { class: "ap-table" }, h("thead", {}, h("tr", {}, h("th", {}, msg("conversation")), h("th", {}, msg("version", { version: run.fromVersion })), h("th", {}, msg("version", { version: target.version })), h("th", {}, msg("difference")), h("th", {}, msg("changedAnswers")))), tbody)),
        failed.length ? h("div", { class: "ap-retry" }, h("span", {}, msg("failedCount", { count: failed.length })), h("button", { class: "da-btn", type: "button", "data-focus": "retry", disabled: busy(), onclick: () => start(failed) }, msg("retryFailed"))) : null,
        resultError ? h("div", { class: "ap-retry", role: "alert" }, h("span", {}, resultError), h("button", { class: "da-btn", type: "button", "data-focus": "reload", onclick: () => { resultError = ""; refreshRun(); } }, msg("refreshComparison"))) : null].filter(Boolean));
      if (focusId) [...result.querySelectorAll("[data-focus]")].find((node) => node.dataset.focus === focusId)?.focus({ preventScroll: true });
    }
    function loadMissing(item, key) {
      if (fetching.has(item.evaluationId)) return;
      fetching.add(item.evaluationId);
      DA.data.evaluationById(item.evaluationId).then((ev) => {
        if (disposed || run?.key !== key || run.results[item.conversationId]?.id !== item.evaluationId) return;
        if (ev?.id !== item.evaluationId || ev.status !== "done") throw Object.assign(new Error(text("totalNotReady")), { uiMessageKey: "totalNotReady" });
        run.results[item.conversationId] = { status: "done", ...brief(ev) };
        saveRun(target.version, run); renderResults();
      }).catch((error) => {
        if (!disposed && run?.key === key && run.results[item.conversationId]?.id === item.evaluationId) { resultError = uiError(error, "loadTotalsError"); renderResults(); }
      }).finally(() => fetching.delete(item.evaluationId));
    }
    function refreshRun() {
      jobs().filter((job) => belongs(job) && job.applyRunId === pinnedRunId).forEach(receive);
    }
    function receive(snapshot) {
      if (disposed) return;
      if (belongs(snapshot) && Number(snapshot.fromVersion) === sourceVersion && snapshot.applyRunId === (pendingRunId || pinnedRunId) && snapshot.applyRunId !== ignoredRun) {
        if (pendingRunId === snapshot.applyRunId) { pinnedRunId = pendingRunId; pendingRunId = null; }
        if (run?.key !== snapshot.applyRunId) {
          run = { key: snapshot.applyRunId, fromVersion: Number(snapshot.fromVersion), ids: snapshot.selectedIds || snapshot.ids, baseline: snapshot.beforeEvaluations || {}, results: {} };
          if (!starting) { mode = "manual"; selected = new Set(run.ids); if (loaded) renderSetup(); }
        }
        // Повтор одного обращения создаёт новую оценку, исходная задача больше не может её заменить.
        const latest = new Map();
        jobs().filter((job) => belongs(job) && job.applyRunId === pinnedRunId).forEach((job) => {
          (job.items || []).forEach((item) => latest.set(item.conversationId, item.evaluationId));
        });
        for (const item of snapshot.items || []) {
          if (latest.has(item.conversationId) && latest.get(item.conversationId) !== item.evaluationId) continue;
          const ev = item.evaluation;
          // Итог и ответы берутся только из оценки, принадлежащей текущей задаче.
          const old = run.results[item.conversationId];
          if (old?.id === item.evaluationId && old.status === "done" && item.status !== "done") continue;
          if (item.status === "done" && ev?.id !== item.evaluationId) {
            if (old?.id === item.evaluationId && old.status === "done") continue;
            run.results[item.conversationId] = { status: "loading", id: item.evaluationId, total: null, answers: {} };
            loadMissing(item, run.key);
          } else run.results[item.conversationId] = { status: item.status, ...(ev?.id === item.evaluationId ? brief(ev) : { id: item.evaluationId, total: null, answers: {} }) };
        }
        saveRun(target.version, run);
        renderResults();
      }
      refreshActions();
    }
    async function start(retryIds) {
      if (busy()) return;
      const chosen = retryIds || ids();
      if (!chosen.length) return;
      const next = retryIds && run ? run : { key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, fromVersion: sourceVersion, ids: chosen, baseline: structuredClone(baseline), results: {} };
      starting = true; pendingRunId = next.key; actionError = ""; refreshActions();
      try {
        await DA.bulk.start(chosen, { checklistVersion: target.version, reuse: true, source: "apply", fromVersion: next.fromVersion, toVersion: target.version,
          applyRunId: next.key, selectedIds: next.ids, beforeEvaluations: next.baseline });
      } catch (error) { actionError = uiError(error, "startError"); }
      finally { starting = false; pendingRunId = null; if (!disposed) { refreshRun(); refreshActions(); renderResults(); } }
    }
    async function load() {
      const request = ++loadId;
      loaded = false; loadError = ""; renderSetup();
      try {
        await DA.data.conversations({ refresh: true });
        const [all, previous, changes] = await Promise.all([DA.data.latestEvaluations(), DA.data.latestEvaluations({ checklistVersion: sourceVersion }), DA.data.diffChecklists(target.version, sourceVersion)]);
        if (disposed || request !== loadId) return;
        allEvaluations = all; sourceEvaluations = previous; diff = changes;
        baseline = Object.fromEntries(previous.map((ev) => [ev.conversationId, brief(ev)]));
        selected = new Set([...selected].filter((id) => all.some((ev) => ev.conversationId === id)));
        loaded = true; renderSetup(); renderResults();
      } catch (error) {
        if (disposed || request !== loadId) return;
        loadError = uiError(error, "loadError"); renderSetup();
      }
    }
    function outside(event) { setup.querySelectorAll(".ap-version[open]").forEach((node) => { if (!node.contains(event.target)) node.open = false; }); }
    document.addEventListener("click", outside);
    notice(); load();
    const unsubscribe = DA.bulk?.subscribe(receive);
    refreshRun();
    return () => { disposed = true; loadId++; unsubscribe?.(); document.removeEventListener("click", outside); };
  };
})();
