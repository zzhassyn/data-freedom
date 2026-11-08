/* Чек-лист как документ: доли в итоге, правила и история сохранённых версий. */
(function () {
  const DA = window.DA, h = DA.h;
  const m = (key, params) => DA.msg(`cl.${key}`, params);
  DA.i18n.addMessages({
    "cl.checklist": { ru: "Чек-лист", kk: "Тексеру парағы", en: "Checklist" },
    "cl.edit": { ru: "Изменить чек-лист", kk: "Тексеру парағын өзгерту", en: "Edit checklist" },
    "cl.notFound": { ru: "Чек-лист не найден", kk: "Тексеру парағы табылмады", en: "Checklist not found" },
    "cl.rulesFailed": { ru: "Не удалось получить правила оценки.", kk: "Бағалау ережелерін жүктеу мүмкін болмады.", en: "The evaluation rules could not be loaded." },
    "cl.retry": { ru: "Повторить", kk: "Қайталау", en: "Retry" },
    "cl.criteria": { ru: "Критерии", kk: "Критерийлер", en: "Criteria" },
    "cl.newCriterion": { ru: "Новый критерий", kk: "Жаңа критерий", en: "New criterion" },
    "cl.share": { ru: "{percent} % итога", kk: "қорытындының {percent} %", en: "{percent}% of total" },
    "cl.ribbonLabel": { ru: "Доли критериев в итоговых 100 баллах", kk: "Критерийлердің қорытынды 100 ұпайдағы үлесі", en: "Each criterion’s share of the 100-point total" },
    "cl.ribbonCriterion": { ru: "{criterion}: {percent} % итога", kk: "{criterion}: қорытындының {percent} %", en: "{criterion}: {percent}% of total" },
    "cl.answerFlag": { ru: "Отмечается как нарушение, на итог не влияет", kk: "Бұзушылық ретінде белгіленеді, қорытынды ұпайға әсер етпейді", en: "Recorded as a violation; does not affect the total" },
    "cl.answerScale": { ru: "Ответ: баллы от 0 до {max}", kk: "Жауап: 0 мен {max} аралығындағы ұпай", en: "Answer: a score from 0 to {max}" },
    "cl.answerBinary": { ru: "Ответ: да или нет", kk: "Жауап: иә немесе жоқ", en: "Answer: yes or no" },
    "cl.naCondition": { ru: ". Не применяется, если {condition}", kk: ". Қолданылмайтын жағдай: {condition}", en: ". Does not apply when: {condition}" },
    "cl.scaleSteps": { ru: "Ступени шкалы", kk: "Шкала деңгейлері", en: "Scale levels" },
    "cl.version": { ru: "Версия {version}", kk: "{version}-нұсқа", en: "Version {version}" },
    "cl.active": { ru: "активна", kk: "белсенді", en: "active" },
    "cl.initialVersion": { ru: "Исходная из задания", kk: "Тапсырмадағы бастапқы нұсқа", en: "Original version from the brief" },
    "cl.changedNames": { ru: "Изменено: {names}", kk: "Өзгертілді: {names}", en: "Changed: {names}" },
    "cl.unchangedRules": { ru: "Правила критериев не изменились", kk: "Критерий ережелері өзгерген жоқ", en: "Criterion rules are unchanged" },
    "cl.viewVersion": { ru: "Посмотреть", kk: "Қарау", en: "View" },
    "cl.currentVersion": { ru: "Открыта сейчас", kk: "Қазір ашық", en: "Currently open" },
    "cl.activate": { ru: "Сделать активной", kk: "Белсенді ету", en: "Make active" },
    "cl.apply": { ru: "Применить к обращениям", kk: "Өтініштерге қолдану", en: "Apply to requests" },
    "cl.activationReceipt": { ru: "Версия {version} стала активной. Новые оценки пойдут по её правилам.", kk: "{version}-нұсқа белсенді болды. Жаңа бағалаулар оның ережелерімен орындалады.", en: "Version {version} is now active. New evaluations will use its rules." },
    "cl.activationFailed": { ru: "Не удалось сделать версию активной. Попробуйте ещё раз", kk: "Нұсқаны белсенді ету мүмкін болмады. Қайталап көріңіз", en: "The version could not be activated. Try again" },
    "cl.networkError": { ru: "Нет связи с сервером. Изменения сохранены в форме", kk: "Сервермен байланыс жоқ. Өзгерістер пішінде сақталды", en: "The server cannot be reached. Your changes remain in the form" },
    "cl.separate": { ru: "отдельно от итога", kk: "қорытындыдан бөлек", en: "separate from the total" },
    "cl.metadata": { ru: "Версия {version}, сохранена {date}. ", kk: "{version}-нұсқа, сақталған уақыты: {date}. ", en: "Version {version}, saved {date}. " },
    "cl.criterionCount": { ru: { one: "{count} критерий", few: "{count} критерия", many: "{count} критериев", other: "{count} критерия" }, kk: "{count} критерий", en: { one: "{count} criterion", other: "{count} criteria" } },
    "cl.total100": { ru: ", итог из 100 баллов.", kk: ", қорытынды 100 ұпайдан есептеледі.", en: ", scored out of 100." },
    "cl.flagsSeparate": { ru: ". Нарушения отмечаются отдельно.", kk: ". Бұзушылықтар бөлек белгіленеді.", en: ". Violations are recorded separately." },
    "cl.history": { ru: "История версий", kk: "Нұсқалар тарихы", en: "Version history" },
    "cl.activating": { ru: "Меняем активную версию", kk: "Белсенді нұсқа ауыстырылуда", en: "Changing the active version" },
    "cl.change.added": { ru: "Добавлен", kk: "Қосылды", en: "Added" },
    "cl.change.removed": { ru: "Удалён", kk: "Жойылды", en: "Removed" },
    "cl.change.rule": { ru: "Изменено правило", kk: "Ереже өзгертілді", en: "Rule changed" },
    "cl.change.weight": { ru: "Изменён вес", kk: "Салмақ өзгертілді", en: "Weight changed" },
    "cl.change.section": { ru: "Изменён раздел", kk: "Бөлім өзгертілді", en: "Section changed" },
    "cl.change.order": { ru: "Изменён порядок", kk: "Реті өзгертілді", en: "Order changed" }
  });
  DA.i18n.addMessages(Object.fromEntries(Object.entries({
    compare: ["Сравнить версии", "Нұсқаларды салыстыру", "Compare versions"],
    compareTitle: ["Сравнение версий", "Нұсқаларды салыстыру", "Version comparison"],
    compareBack: ["Вернуться к чек-листу", "Тексеру парағына оралу", "Back to checklist"],
    compareHistory: ["Сравнить с предыдущей", "Алдыңғы нұсқамен салыстыру", "Compare with previous"],
    compareFrom: ["Было", "Бұрын", "Before"],
    compareTo: ["Стало", "Кейін", "After"],
    compareSwap: ["Поменять версии местами", "Нұсқалардың орнын ауыстыру", "Swap versions"],
    compareChooseFrom: ["Выберите исходную версию", "Бастапқы нұсқаны таңдаңыз", "Choose the before version"],
    compareChooseTo: ["Выберите версию для сравнения", "Салыстыру нұсқасын таңдаңыз", "Choose the after version"],
    compareAdded: ["Добавлено", "Қосылды", "Added"],
    compareRemoved: ["Удалено", "Жойылды", "Removed"],
    compareRules: ["Изменены правила", "Ережелер өзгерді", "Rules changed"],
    compareWeights: ["Только веса", "Тек салмақтар", "Weights only"],
    compareChanged: ["Критерии", "Критерийлер", "Criteria"],
    compareUnchanged: ["Без изменений: {count}", "Өзгеріссіз: {count}", "Unchanged: {count}"],
    compareShowAll: ["Показать неизменённые ({count})", "Өзгермегендерін көрсету ({count})", "Show unchanged ({count})"],
    compareHideUnchanged: ["Скрыть неизменённые", "Өзгермегендерін жасыру", "Hide unchanged"],
    compareNoCriteriaChanges: ["Различий в критериях нет", "Критерийлерде айырмашылық жоқ", "No criterion differences"],
    compareSameVersion: ["Для сравнения выберите разные версии.", "Салыстыру үшін әртүрлі нұсқаларды таңдаңыз.", "Choose different versions to compare."],
    compareSingle: ["Пока сохранена одна версия", "Әзірге бір нұсқа сақталған", "Only one version has been saved"],
    compareSingleHelp: ["После сохранения изменений здесь можно будет сравнить правила и веса двух версий.", "Өзгерістер сақталғаннан кейін екі нұсқаның ережелері мен салмақтарын салыстыруға болады.", "After saving changes, you can compare the rules and weights of two versions here."],
    compareMissing: ["Одна из версий не найдена", "Нұсқалардың бірі табылмады", "One of the versions was not found"],
    compareMissingHelp: ["Откройте историю чек-листа и выберите две сохранённые версии.", "Тексеру парағының тарихын ашып, сақталған екі нұсқаны таңдаңыз.", "Open checklist history and choose two saved versions."],
    compareField: ["Что изменилось", "Не өзгерді", "What changed"],
    compareFieldTitle: ["Название критерия", "Критерий атауы", "Criterion name"],
    compareFieldDescription: ["Правило", "Ереже", "Rule"],
    compareFieldType: ["Тип ответа", "Жауап түрі", "Answer type"],
    compareFieldWeight: ["Вес", "Салмақ", "Weight"],
    compareFieldNaAllowed: ["Неприменимость", "Қолданылмау мүмкіндігі", "N/A eligibility"],
    compareFieldNaCondition: ["Условие неприменимости", "Қолданылмау шарты", "N/A condition"],
    compareFieldScale: ["Шкала и правила ступеней", "Шкала мен деңгей ережелері", "Scale and level rules"],
    compareFieldFlagTypes: ["Перечень нарушений", "Бұзушылықтар тізімі", "Violation types"],
    compareFieldSectionId: ["Раздел", "Бөлім", "Section"],
    compareFieldOrder: ["Порядок", "Рет", "Order"],
    compareFieldName: ["Название чек-листа", "Тексеру парағының атауы", "Checklist name"],
    compareSectionTitle: ["Название раздела", "Бөлім атауы", "Section name"],
    compareSectionOrder: ["Порядок раздела", "Бөлім реті", "Section order"],
    compareStructure: ["Название и разделы", "Атауы мен бөлімдер", "Name and sections"],
    compareStructureCount: ["Оформление", "Орналасуы", "Layout"],
    compareFlagAdded: ["Добавлен тип", "Түрі қосылды", "Type added"],
    compareFlagRemoved: ["Удалён тип", "Түрі жойылды", "Type removed"],
    compareFlagReordered: ["Порядок типов нарушений изменён.", "Бұзушылық түрлерінің реті өзгерді.", "The order of violation types changed."],
    compareSection: ["Раздел «{name}»", "«{name}» бөлімі", "Section “{name}”"],
    compareAbsent: ["В этой версии нет", "Бұл нұсқада жоқ", "Not in this version"],
    compareNotSet: ["Не задано", "Берілмеген", "Not specified"],
    compareAllowed: ["Разрешена при выполнении условия", "Шарт орындалса, рұқсат етіледі", "Allowed when the condition is met"],
    compareNotAllowed: ["Не предусмотрена", "Қарастырылмаған", "Not allowed"],
    compareBinary: ["Да или нет", "Иә немесе жоқ", "Yes or no"],
    compareScale: ["Баллы по шкале", "Шкала бойынша ұпай", "Score on a scale"],
    compareFlag: ["Отметка нарушения", "Бұзушылық белгісі", "Violation flag"],
    compareExpand: ["Прочитать полностью", "Толық оқу", "Read in full"],
    compareCollapse: ["Свернуть", "Жию", "Collapse"],
    compareLayout: ["Изменено оформление", "Орналасуы өзгерді", "Layout changed"],
    compareUnchangedRule: ["Правило сохранено", "Ереже сақталды", "Rule unchanged"],
    compareConsequences: ["Как применится версия", "Нұсқа қалай қолданылады", "How this version will be applied"],
    compareNeedsEvaluation: ["Новые и изменённые критерии: {count}. Ответы исходной версии для них не подходят.", "Жаңа және өзгерген критерийлер: {count}. Бастапқы нұсқаның жауаптары оларға жарамайды.", "New and changed criteria: {count}. Answers from the before version cannot be reused for them."],
    compareNoNewRules: ["Правила оставшихся критериев не изменились.", "Қалған критерийлердің ережелері өзгерген жоқ.", "The rules of the retained criteria are unchanged."],
    compareReuseHelp: ["Сохранённые ответы можно использовать повторно при совместимых правилах, тексте диалога и настройках модели. Веса меняют расчёт баллов; разделы и порядок не меняют ответы. Апелляции в новую оценку не переносятся.", "Ережелер, диалог мәтіні және модель баптаулары үйлесімді болса, сақталған жауаптарды қайта пайдалануға болады. Салмақ ұпайды қайта есептейді; бөлімдер мен рет жауаптарды өзгертпейді. Апелляциялар жаңа бағалауға көшірілмейді.", "Saved answers can be reused when the rules, transcript and model settings are compatible. Weights change the score calculation; sections and order do not change answers. Appeal decisions are not carried over."],
    compareNameRule: ["Новое название критерия тоже считается изменением правила.", "Критерий атауын өзгерту де ережені өзгерту болып саналады.", "Renaming a criterion also counts as a rule change."],
    compareApply: ["Применить версию {version}", "{version}-нұсқаны қолдану", "Apply version {version}"],
    compareApplyHelp: ["Перед запуском оценки можно выбрать обращения.", "Бағалауды бастамас бұрын өтініштерді таңдауға болады.", "You can select conversations before starting evaluation."],
    compareViewAfter: ["Посмотреть версию {version}", "{version}-нұсқаны қарау", "View version {version}"]
  }).map(([key, value]) => [`cl.${key}`, { ru: value[0], kk: value[1], en: value[2] }])));
  DA.checklistChangeLabel = (kind) => DA.t(`cl.change.${kind}`);
  DA.checklistFailure = (error, key) => DA.msg(() => DA.apiErrorMessage?.(error) || DA.t(`cl.${key}`));
  const byOrder = (a, b) => a.order - b.order;
  const contentFields = ["title", "description", "type", "naAllowed", "naCondition", "scale", "flagTypes"];
  const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value ?? null;
  const changed = (a, b, field) => JSON.stringify(canonical(a[field])) !== JSON.stringify(canonical(b[field]));

  /* Одни и те же изменения используются в истории, сохранении и применении версии. */
  DA.checklistChanges = function (next, previous) {
    const before = new Map((previous?.criteria || []).map((c) => [c.id, c]));
    const after = new Map((next?.criteria || []).map((c) => [c.id, c]));
    const rows = [];
    for (const c of next?.criteria || []) {
      const old = before.get(c.id);
      if (!old) { rows.push({ criterionId: c.id, title: c.title, kind: "added", label: "Добавлен", fields: [], before: null, after: c }); continue; }
      const fields = [...contentFields, "weight", "sectionId", "order"].filter((field) => changed(c, old, field));
      if (fields.some((field) => contentFields.includes(field))) rows.push({ criterionId: c.id, title: c.title, kind: "rule", label: "Изменено правило", fields, before: old, after: c });
      if (fields.includes("weight")) rows.push({ criterionId: c.id, title: c.title, kind: "weight", label: "Изменён вес", fields: ["weight"], before: old, after: c });
      if (fields.includes("sectionId")) rows.push({ criterionId: c.id, title: c.title, kind: "section", label: "Изменён раздел", fields: ["sectionId"], before: old, after: c });
      else if (fields.includes("order")) rows.push({ criterionId: c.id, title: c.title, kind: "order", label: "Изменён порядок", fields: ["order"], before: old, after: c });
    }
    for (const c of previous?.criteria || []) if (!after.has(c.id)) rows.push({ criterionId: c.id, title: c.title, kind: "removed", label: "Удалён", fields: [], before: c, after: null });
    return rows.map((row) => ({ ...row, label: DA.checklistChangeLabel(row.kind) }));
  };

  DA.checklistCompareHref = (from, to) => `#/checklists?compare=1&from=${Number(from)}&to=${Number(to)}`;

  /* Одна строка на критерий: несколько изменённых полей не завышают счётчики. */
  DA.checklistComparison = function (next, previous) {
    const before = new Map((previous?.criteria || []).map((c) => [c.id, c]));
    const after = new Map((next?.criteria || []).map((c) => [c.id, c]));
    const ids = [...(next?.criteria || [])].sort(byOrder).map((c) => c.id)
      .concat([...(previous?.criteria || [])].sort(byOrder).filter((c) => !after.has(c.id)).map((c) => c.id));
    const criteria = ids.map((id) => {
      const old = before.get(id) || null, current = after.get(id) || null;
      const fields = old && current ? [...contentFields, "weight", "sectionId", "order"].filter((field) => changed(current, old, field)) : [];
      const kind = !old ? "added" : !current ? "removed" : fields.some((field) => contentFields.includes(field)) ? "rule"
        : fields.includes("weight") ? "weight" : fields.length ? "layout" : "unchanged";
      const oldFlags = (old?.flagTypes || []).map((flag) => flag.id), newFlags = (current?.flagTypes || []).map((flag) => flag.id);
      const flagChanges = { added: newFlags.filter((key) => !oldFlags.includes(key)), removed: oldFlags.filter((key) => !newFlags.includes(key)),
        reordered: oldFlags.length === newFlags.length && oldFlags.every((key) => newFlags.includes(key)) && oldFlags.some((key, index) => key !== newFlags[index]) };
      return { criterionId: id, title: (current || old).title, before: old, after: current, fields, kind, flagChanges,
        needsEvaluation: kind === "added" || kind === "rule" };
    });
    const oldSections = new Map((previous?.sections || []).map((s) => [s.id, s]));
    const newSections = new Map((next?.sections || []).map((s) => [s.id, s]));
    const sections = [...new Set([...newSections.keys(), ...oldSections.keys()])].map((id) => {
      const old = oldSections.get(id) || null, current = newSections.get(id) || null;
      return { id, before: old, after: current, fields: old && current ? ["title", "order"].filter((field) => changed(current, old, field)) : ["title", "order"] };
    }).filter((row) => row.fields.length);
    const counts = Object.fromEntries(["added", "removed", "rule", "weight", "layout", "unchanged"].map((kind) => [kind, criteria.filter((c) => c.kind === kind).length]));
    return { criteria, sections, counts, nameChanged: previous?.name !== next?.name,
      needsEvaluation: criteria.filter((c) => c.needsEvaluation).length,
      hasChanges: criteria.some((c) => c.kind !== "unchanged") || sections.length > 0 || previous?.name !== next?.name };
  };

  /* Целые доли в документе в сумме дают 100, даже если исходные веса другие. */
  DA.checklistShares = function (cl) {
    const weighted = cl.criteria.filter((c) => c.type !== "flag" && Number(c.weight) > 0);
    const total = weighted.reduce((sum, c) => sum + Number(c.weight), 0);
    const portions = weighted.map((c, index) => {
      const exact = total ? Number(c.weight) / total * 100 : 0;
      return { id: c.id, exact, value: Math.floor(exact), index };
    });
    let remainder = total ? 100 - portions.reduce((sum, item) => sum + item.value, 0) : 0;
    for (const item of [...portions].sort((a, b) => (b.exact - b.value) - (a.exact - a.value) || a.index - b.index)) {
      if (remainder-- <= 0) break;
      item.value++;
    }
    const criteria = Object.fromEntries(portions.map((item) => [item.id, item.value]));
    const sections = Object.fromEntries(cl.sections.map((section) => [section.id, cl.criteria.filter((c) => c.sectionId === section.id).reduce((sum, c) => sum + (criteria[c.id] || 0), 0)]));
    return { criteria, sections, total };
  };

  DA.checklistRibbon = function (cl, opts) {
    const options = opts || {}, shares = DA.checklistShares(cl);
    const weighted = cl.criteria.filter((c) => c.type !== "flag" && Number(c.weight) > 0);
    const ribbon = DA.ribbon(weighted.map((c) => ({ c: { ...c, type: "binary" }, answer: "yes", status: "done", fraction: 1,
      effectiveWeight: Number(c.weight) / shares.total * 100, points: Number(c.weight) / shares.total * 100 })), {
      interactive: !!options.onFocus,
      onHover: (id) => options.onFocus?.(id),
      onClick: (id) => options.onSelect?.(id)
    });
    ribbon.classList.add("cl-ribbon");
    DA.i18n.bindAttr(ribbon, "aria-label", "cl.ribbonLabel");
    for (const segment of ribbon.children) {
      const c = weighted.find((item) => item.id === segment.dataset.id);
      const text = m("ribbonCriterion", () => ({ criterion: c.title || DA.t("cl.newCriterion"), percent: shares.criteria[c.id] }));
      DA.i18n.unbindAttr(segment, "title");
      segment.removeAttribute("title");
      if (options.onSelect) {
        segment.setAttribute("tabindex", "0");
        segment.setAttribute("role", "button");
        DA.i18n.bindAttr(segment, "aria-label", text);
        segment.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); options.onSelect(c.id); } });
      }
      segment.addEventListener("focus", () => options.onFocus?.(c.id));
      segment.addEventListener("blur", () => options.onFocus?.(null));
      DA.hoverCard(segment, () => h("p", { class: "cl-ribbon-tip" }, text));
    }
    if (options.selected) ribbon.light(options.selected);
    return ribbon;
  };

  DA.views.checklistView = function mount(root, params) {
    let viewing = DA.checklist(Number(params?.query?.version)) || DA.activeChecklist() || DA.state.checklists[0];
    let busy = false, receipt = "", error = "", disposed = false;
    const versions = [...DA.state.checklists].sort((a, b) => a.version - b.version);
    const previousVersion = (cl) => DA.checklist(cl?.basedOnVersion) || versions.filter((entry) => entry.version < cl?.version).at(-1);
    const comparing = params?.query?.compare === "1";
    const requested = (key, fallback) => params?.query?.[key] != null ? DA.checklist(Number(params.query[key])) : fallback;
    let afterVersion = requested("to", viewing), beforeVersion = requested("from", previousVersion(afterVersion) || afterVersion);
    let showUnchanged = false;
    const events = new AbortController();
    const page = h("div", { class: "da-page cl-document" });
    root.append(page);

    function compareLink(from, to, label, className) {
      return h("a", { class: className || "da-btn", href: DA.checklistCompareHref(from, to) }, label || m("compare"));
    }

    function chooseVersion(side, version) {
      if (side === "before") beforeVersion = version;
      else afterVersion = version;
      history.replaceState(null, "", DA.checklistCompareHref(beforeVersion.version, afterVersion.version));
      render();
      page.querySelector(`[data-picker="${side}"] summary`)?.focus();
    }

    function versionPicker(side, current) {
      const from = side === "before";
      const box = h("details", { class: "cl-version-picker", "data-picker": side });
      const trigger = h("summary", { class: "da-btn cl-picker-trigger", "aria-label": m(from ? "compareChooseFrom" : "compareChooseTo") },
        h("span", {}, h("b", {}, m("version", { version: current.version })),
          h("small", {}, DA.msg(() => DA.fmt.dateTime(current.createdAt)))), DA.icon("chevron", 16));
      const menu = h("div", { class: "cl-picker-menu", role: "group", "aria-label": m(from ? "compareChooseFrom" : "compareChooseTo") },
        [...versions].reverse().map((cl) => h("button", { type: "button", class: cl.version === current.version ? "is-selected" : null,
          "aria-pressed": String(cl.version === current.version), onclick: () => { box.open = false; chooseVersion(side, cl); } },
          h("span", {}, h("b", {}, m("version", { version: cl.version })), h("small", {}, DA.msg(() => DA.fmt.dateTime(cl.createdAt)))),
          cl.isActive ? h("span", { class: "cl-active" }, m("active")) : null,
          cl.version === current.version ? DA.icon("check", 16) : null)));
      box.append(trigger, menu);
      box.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); box.open = false; trigger.focus(); }
      });
      box.addEventListener("toggle", () => {
        if (box.open) page.querySelectorAll(".cl-version-picker[open]").forEach((other) => { if (other !== box) other.open = false; });
      });
      return h("div", { class: "cl-picker-field" }, h("span", { class: "cl-picker-label" }, m(from ? "compareFrom" : "compareTo")), box);
    }

    function textValue(value) {
      if (value == null || value === "") return h("span", { class: "cl-compare-muted" }, m("compareNotSet"));
      const text = String(value);
      if (text.length <= 320) return h("p", { class: "cl-compare-text" }, text);
      return h("details", { class: "cl-compare-long" },
        h("summary", {}, h("span", { class: "cl-compare-preview" }, text.slice(0, 210).trimEnd() + "…"),
          h("span", { class: "cl-compare-expand" }, m("compareExpand")), h("span", { class: "cl-compare-collapse" }, m("compareCollapse"))),
        h("p", { class: "cl-compare-text" }, text));
    }

    function fieldValue(criterion, field, cl, row, side) {
      const value = criterion?.[field];
      if (field === "type") return m(({ binary: "compareBinary", scale: "compareScale", flag: "compareFlag" })[value] || "compareNotSet");
      if (field === "naAllowed") return m(value ? "compareAllowed" : "compareNotAllowed");
      if (field === "sectionId") return textValue(cl.sections.find((section) => section.id === value)?.title);
      if (field === "order") return Number.isFinite(value) ? value + 1 : m("compareNotSet");
      if (field === "weight") return DA.msg(() => DA.fmt.score(value));
      if (field === "scale" || field === "flagTypes") {
        return Array.isArray(value) && value.length ? h("div", {}, h("ul", { class: "cl-compare-values" }, value.map((item) => field === "scale"
          ? h("li", {}, h("b", {}, item.value), textValue(item.description))
          : h("li", { class: "is-flag" }, textValue(item.title), row?.before && row?.after && row.flagChanges[side === "before" ? "removed" : "added"].includes(item.id)
            ? h("small", { class: "cl-compare-flag-change" }, m(side === "before" ? "compareFlagRemoved" : "compareFlagAdded")) : null))),
          field === "flagTypes" && row?.flagChanges.reordered ? h("p", { class: "cl-compare-flag-change" }, m("compareFlagReordered")) : null) : m("compareNotSet");
      }
      return textValue(value);
    }

    const fieldLabels = { title: "compareFieldTitle", description: "compareFieldDescription", type: "compareFieldType", weight: "compareFieldWeight",
      naAllowed: "compareFieldNaAllowed", naCondition: "compareFieldNaCondition", scale: "compareFieldScale", flagTypes: "compareFieldFlagTypes",
      sectionId: "compareFieldSectionId", order: "compareFieldOrder" };
    function tableHead() {
      return h("thead", {}, h("tr", {}, h("th", { scope: "col" }, m("compareField")),
        h("th", { scope: "col" }, m("compareFrom"), h("small", {}, m("version", { version: beforeVersion.version }))),
        h("th", { scope: "col" }, m("compareTo"), h("small", {}, m("version", { version: afterVersion.version })))));
    }
    function criterionRows(row) {
      const criterion = row.after || row.before;
      const labels = { added: "change.added", removed: "change.removed", rule: "change.rule", weight: "change.weight", layout: "compareLayout", unchanged: "compareUnchangedRule" };
      const fields = row.before && row.after && row.fields.length ? row.fields : ["title", "description", "type", "weight", "naAllowed",
        ...(criterion.naAllowed || criterion.naCondition ? ["naCondition"] : []), ...(criterion.type === "scale" ? ["scale"] : []),
        ...(criterion.type === "flag" ? ["flagTypes"] : []), "sectionId", "order"];
      return h("tbody", { "data-comparison-criterion": row.criterionId, class: `cl-compare-group is-${row.kind}` },
        h("tr", { class: "cl-compare-group-head" }, h("th", { colspan: 3, scope: "rowgroup" },
          h("div", {}, h("h3", {}, row.title), h("span", { class: `cl-compare-kind is-${row.kind}` }, m(labels[row.kind]))))),
        fields.map((field, index) => h("tr", {}, h("th", { scope: "row" }, m(fieldLabels[field])),
          row.before ? h("td", { class: "is-before" }, fieldValue(row.before, field, beforeVersion, row, "before"))
            : index === 0 ? h("td", { rowspan: fields.length, class: "cl-compare-absent" }, m("compareAbsent")) : null,
          row.after ? h("td", { class: "is-after" }, fieldValue(row.after, field, afterVersion, row, "after"))
            : index === 0 ? h("td", { rowspan: fields.length, class: "cl-compare-absent" }, m("compareAbsent")) : null)));
    }
    function structureTable(comparison) {
      if (!comparison.nameChanged && !comparison.sections.length) return null;
      const rows = [];
      if (comparison.nameChanged) rows.push(h("tr", {}, h("th", { scope: "row" }, m("compareFieldName")), h("td", {}, textValue(beforeVersion.name)), h("td", {}, textValue(afterVersion.name))));
      comparison.sections.forEach((section) => {
        rows.push(h("tr", { class: "cl-compare-group-head" }, h("th", { colspan: 3, scope: "rowgroup" }, m("compareSection", { name: (section.after || section.before).title }))));
        section.fields.forEach((field) => rows.push(h("tr", {}, h("th", { scope: "row" }, m(field === "title" ? "compareSectionTitle" : "compareSectionOrder")),
          h("td", {}, section.before ? textValue(field === "order" ? section.before.order + 1 : section.before.title) : m("compareAbsent")),
          h("td", {}, section.after ? textValue(field === "order" ? section.after.order + 1 : section.after.title) : m("compareAbsent")))));
      });
      return h("section", { class: "cl-compare-structure" }, h("h2", {}, m("compareStructure")),
        h("div", { class: "cl-compare-table-wrap" }, h("table", { class: "cl-compare-table" }, tableHead(), h("tbody", {}, rows))));
    }
    function renderComparison() {
      page.classList.add("cl-comparison");
      const header = h("div", { class: "cl-comparison-heading" },
        h("a", { class: "ce-back", href: `#/checklists?version=${afterVersion?.version || viewing?.version || ""}` }, DA.icon("back", 16), m("compareBack")),
        h("h1", { class: "da-h1", tabindex: -1 }, m("compareTitle")));
      if (!beforeVersion || !afterVersion || versions.length < 2) {
        const missing = versions.length > 1;
        page.replaceChildren(header, h("div", { class: "da-empty cl-compare-empty" }, h("h2", {}, m(missing ? "compareMissing" : "compareSingle")),
          h("p", {}, m(missing ? "compareMissingHelp" : "compareSingleHelp")),
          h("a", { class: "da-btn is-primary", href: missing ? "#/checklists" : `#/checklists/edit?version=${viewing?.version || versions[0]?.version || 1}` }, m(missing ? "compareBack" : "edit"))));
        return;
      }
      const comparison = DA.checklistComparison(afterVersion, beforeVersion);
      const same = beforeVersion.version === afterVersion.version;
      const rows = comparison.criteria.filter((row) => showUnchanged || row.kind !== "unchanged");
      const summary = [["added", "compareAdded"], ["removed", "compareRemoved"], ["rule", "compareRules"], ["weight", "compareWeights"]];
      const structureCount = comparison.counts.layout + comparison.sections.length + Number(comparison.nameChanged);
      page.replaceChildren(...[header,
        h("div", { class: "cl-compare-controls" }, versionPicker("before", beforeVersion),
          h("button", { class: "da-icon-btn cl-compare-swap", type: "button", "aria-label": m("compareSwap"), title: m("compareSwap"), onclick: () => {
            [beforeVersion, afterVersion] = [afterVersion, beforeVersion];
            history.replaceState(null, "", DA.checklistCompareHref(beforeVersion.version, afterVersion.version)); render(); page.querySelector(".cl-compare-swap")?.focus();
          } }, DA.icon("refresh", 18)), versionPicker("after", afterVersion)),
        same ? h("p", { class: "cl-compare-notice", role: "status" }, m("compareSameVersion")) : null,
        h("dl", { class: "cl-compare-summary", "aria-live": "polite" }, summary.map(([key, label]) => h("div", {}, h("dt", {}, m(label)), h("dd", {}, comparison.counts[key]))),
          structureCount ? h("div", {}, h("dt", {}, m("compareStructureCount")), h("dd", {}, structureCount)) : null),
        h("section", { class: "cl-compare-criteria", "aria-labelledby": "cl-compare-changes" },
          h("div", { class: "cl-compare-section-head" }, h("h2", { id: "cl-compare-changes" }, m("compareChanged")),
            comparison.counts.unchanged ? h("button", { class: "da-btn is-text is-sm", type: "button", "aria-pressed": String(showUnchanged), onclick: () => {
              showUnchanged = !showUnchanged; render(); page.querySelector(".cl-compare-section-head button")?.focus();
            } }, showUnchanged ? m("compareHideUnchanged") : m("compareShowAll", { count: comparison.counts.unchanged })) : null),
          rows.length ? h("div", { class: "cl-compare-table-wrap" }, h("table", { class: "cl-compare-table" }, tableHead(), rows.map(criterionRows)))
            : h("div", { class: "cl-compare-equal" }, DA.icon("check", 18), h("div", {}, h("h3", {}, m("compareNoCriteriaChanges"))))),
        structureTable(comparison),
        !same && comparison.hasChanges ? h("details", { class: "cl-compare-consequences" },
          h("summary", {}, m("compareConsequences")),
          h("div", {},
            h("p", {}, comparison.needsEvaluation ? m("compareNeedsEvaluation", { count: comparison.needsEvaluation }) : m("compareNoNewRules")),
            h("p", {}, m("compareReuseHelp")),
            comparison.criteria.some((row) => row.fields.includes("title")) ? h("p", {}, m("compareNameRule")) : null,
            h("p", {}, m("compareApplyHelp")))) : null,
        h("div", { class: "cl-compare-next" },
          h("a", { class: "da-btn", href: `#/checklists?version=${afterVersion.version}` }, m("compareViewAfter", { version: afterVersion.version })),
          !same ? h("a", { class: "da-btn is-primary", href: `#/checklists/apply/${afterVersion.version}` }, m("compareApply", { version: afterVersion.version })) : null)].filter(Boolean));
    }

    document.addEventListener("pointerdown", (event) => {
      page.querySelectorAll(".cl-version-picker[open]").forEach((box) => { if (!box.contains(event.target)) box.open = false; });
    }, { signal: events.signal });

    function card(c, share) {
      const node = h("article", { class: "cl-criterion", "data-criterion": c.id },
        h("div", { class: "cl-criterion-head" }, h("h3", { tabindex: -1 }, c.title),
          c.type !== "flag" ? h("span", { class: "cl-share" }, m("share", { percent: share || 0 })) : null),
        h("p", { class: "cl-rule" }, c.description),
        h("p", { class: "cl-answer" }, c.type === "flag" ? m("answerFlag") : c.type === "scale" ? m("answerScale", { max: DA.scaleMax(c) }) : m("answerBinary"),
          c.naAllowed ? m("naCondition", { condition: c.naCondition || "" }) : ""));
      if (c.type === "scale") {
        const list = h("ol", { class: "cl-scale", hidden: true }, c.scale.map((step) => h("li", {}, h("b", {}, step.value), h("span", {}, step.description))));
        const button = h("button", { class: "cl-scale-toggle", type: "button", "aria-expanded": "false", onclick: () => {
          list.hidden = !list.hidden;
          button.setAttribute("aria-expanded", String(!list.hidden));
        } }, DA.icon("chevron", 14), m("scaleSteps"));
        node.append(button, list);
      }
      return node;
    }

    function historyRow(cl) {
      const base = previousVersion(cl);
      const names = [...new Set(DA.checklistChanges(cl, base).map((item) => item.title))];
      const initial = cl.version === 1 && !cl.basedOnVersion;
      const row = h("li", { class: "cl-version", "data-version": cl.version },
        h("div", { class: "cl-version-copy" },
          h("div", { class: "cl-version-name" }, h("b", {}, m("version", { version: cl.version })), cl.isActive ? h("span", { class: "cl-active" }, m("active")) : null,
            !initial ? h("span", { class: "cl-version-time" }, DA.msg(() => DA.fmt.dateTime(cl.createdAt))) : null),
          h("p", {}, initial ? m("initialVersion") : names.length ? m("changedNames", { names: names.join(", ") }) : m("unchangedRules"))),
        h("div", { class: "cl-version-actions" },
          base ? compareLink(base.version, cl.version, m("compareHistory"), "da-btn is-sm") : null,
          cl.version !== viewing.version ? h("a", { class: "da-btn is-sm", href: `#/checklists?version=${cl.version}` }, m("viewVersion")) : h("span", { class: "cl-current" }, m("currentVersion")),
          !cl.isActive ? h("button", { class: "da-btn is-sm", type: "button", disabled: busy, onclick: () => activate(cl) }, m("activate")) : null,
          !cl.isActive || cl.version > 1 ? h("a", { class: "da-btn is-text is-sm", href: `#/checklists/apply/${cl.version}` }, m("apply")) : null));
      return row;
    }

    async function activate(cl) {
      if (busy) return;
      busy = true; error = ""; receipt = ""; render();
      try {
        viewing = await DA.data.activateChecklist(cl.version);
        receipt = m("activationReceipt", { version: viewing.version });
        history.replaceState(null, "", `#/checklists?version=${viewing.version}`);
      } catch (e) { error = DA.checklistFailure(e, "activationFailed"); }
      finally { busy = false; if (!disposed) render(); }
    }

    function render() {
      DA.i18n.release(page);
      if (comparing) { renderComparison(); return; }
      if (!viewing) {
        page.replaceChildren(h("div", { class: "da-empty" }, h("h1", { class: "da-h1" }, m("notFound")), h("p", {}, m("rulesFailed")),
          h("button", { class: "da-btn is-primary", type: "button", onclick: () => DA.route() }, m("retry"))));
        return;
      }
      const shares = DA.checklistShares(viewing), cards = new Map();
      const sections = [...viewing.sections].sort(byOrder).map((section) => {
        const criteria = viewing.criteria.filter((c) => c.sectionId === section.id).sort(byOrder);
        if (!criteria.length) return null;
        const weighted = criteria.some((c) => c.type !== "flag");
        return h("section", { class: "cl-section", "aria-label": section.title },
          h("div", { class: "cl-section-head" }, h("h2", {}, section.title), h("span", {}, weighted ? m("share", { percent: shares.sections[section.id] }) : m("separate"))),
          h("div", { class: "cl-criteria" }, criteria.map((c) => { const node = card(c, shares.criteria[c.id]); cards.set(c.id, node); return node; })));
      });
      const ribbon = DA.checklistRibbon(viewing, {
        onFocus(id) { for (const [key, node] of cards) node.classList.toggle("is-lit", key === id); },
        onSelect(id) { const node = cards.get(id); node?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); node?.querySelector("h3").focus({ preventScroll: true }); }
      });
      page.replaceChildren(
        h("div", { class: "cl-document-head" }, h("h1", { class: "da-h1", tabindex: -1 }, m("checklist")),
          h("div", { class: "cl-document-actions" }, compareLink((previousVersion(viewing) || viewing).version, viewing.version),
            h("a", { class: "da-btn is-primary", href: `#/checklists/edit?version=${viewing.version}` }, m("edit")))),
        h("p", { class: "cl-document-meta" }, m("metadata", () => ({ version: viewing.version, date: DA.fmt.dateTime(viewing.createdAt) })),
          m("criterionCount", { count: viewing.criteria.length }), m(shares.total ? "total100" : "flagsSeparate")),
        ribbon, h("div", { class: "cl-sections" }, sections),
        h("section", { class: "cl-history", "aria-label": m("history") }, h("h2", {}, m("history")),
          receipt ? h("p", { class: "cl-receipt", role: "status" }, DA.icon("check", 16), receipt) : null,
          error ? h("p", { class: "da-error", role: "alert" }, error) : null,
          busy ? h("p", { class: "cl-history-pending", role: "status" }, m("activating")) : null,
          h("ol", { class: "cl-version-list" }, [...DA.state.checklists].sort((a, b) => b.version - a.version).map(historyRow))));
    }
    render();
    return () => { disposed = true; events.abort(); };
  };
})();
