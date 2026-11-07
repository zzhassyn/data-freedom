/* Правка чек-листа по шагам. Исходная версия не меняется до сохранения новой. */
(function () {
  const DA = window.DA, h = DA.h;
  const m = (key, params) => DA.msg(`ce.${key}`, params);
  const labels = {
    binary: ["Да или нет", "Иә немесе жоқ", "Yes or no"],
    binaryHint: ["Оператор сделал это или нет", "Оператор бұл әрекетті орындады ма", "Whether the operator did it"],
    scale: ["Баллы по шкале", "Шкала бойынша ұпай", "Score on a scale"],
    scaleHint: ["Насколько хорошо, например от 0 до 20", "Қаншалықты жақсы, мысалы 0-ден 20-ға дейін", "How well, for example from 0 to 20"],
    flag: ["Отметка нарушения", "Бұзушылық белгісі", "Violation flag"],
    flagHint: ["Не даёт баллов, отмечается отдельно, как грубые ошибки", "Ұпай бермейді, өрескел қателер сияқты бөлек белгіленеді", "Recorded separately, like serious errors; gives no points"],
    titleRequired: ["Назовите критерий", "Критерийге атау беріңіз", "Name the criterion"],
    titleDuplicate: ["Критерий с таким названием уже есть", "Мұндай атауы бар критерий бар", "A criterion with this name already exists"],
    ruleRequired: ["Опишите действие, которое должна проверить модель", "Модель тексеруі тиіс әрекетті сипаттаңыз", "Describe the action the model should check"],
    weightInvalid: ["Укажите вес от 1 до 100", "1 мен 100 аралығындағы салмақты көрсетіңіз", "Enter a weight from 1 to 100"],
    naRequired: ["Опишите, когда критерий не относится к разговору", "Критерий әңгімеге қашан қолданылмайтынын сипаттаңыз", "Describe when the criterion does not apply"],
    scaleMinimum: ["Нужно минимум две ступени", "Кемінде екі деңгей қажет", "At least two levels are required"],
    scaleNegative: ["Баллы должны быть не меньше нуля", "Ұпай нөлден кем болмауы керек", "Scores must be zero or greater"],
    scaleZero: ["Добавьте ступень 0", "0 деңгейін қосыңыз", "Add a level worth 0 points"],
    scaleDuplicate: ["Баллы ступеней повторяются", "Деңгей ұпайлары қайталанады", "Level scores must be unique"],
    scaleDescription: ["Опишите каждую ступень", "Әр деңгейді сипаттаңыз", "Describe each level"],
    saving: ["Сохраняем версию", "Нұсқа сақталуда", "Saving version"],
    unchanged: ["Нет изменений", "Өзгерістер жоқ", "No changes"],
    save: ["Сохранить версию", "Нұсқаны сақтау", "Save version"],
    back: ["К чек-листу", "Тексеру парағына", "Back to checklist"],
    draftVersion: ["Черновик версии {version}", "{version}-нұсқаның жобасы", "Draft version {version}"],
    basedOn: ["На основе версии {version}", "{version}-нұсқа негізінде", "Based on version {version}"],
    restored: ["Несохранённый черновик восстановлен", "Сақталмаған жоба қалпына келтірілді", "Your unsaved draft was restored"],
    reset: ["Отменить все изменения", "Барлық өзгерістерді болдырмау", "Discard all changes"],
    new: ["новый", "жаңа", "new"],
    changed: ["изменён", "өзгертілді", "changed"],
    add: ["Добавить критерий", "Критерий қосу", "Add criterion"],
    chooseCriterion: ["Выбрать критерий", "Критерий таңдау", "Choose a criterion"],
    blank: ["С нуля", "Басынан", "From scratch"],
    blankHint: ["Написать своё правило", "Өз ережеңізді жазу", "Write your own rule"],
    removed: ["Критерий удалён из черновика.", "Критерий жобадан жойылды.", "Criterion removed from the draft."],
    undo: ["Вернуть", "Қайтару", "Undo"],
    addFirst: ["Добавьте критерий", "Критерий қосыңыз", "Add a criterion"],
    empty: ["Выберите раздел и добавьте своё правило или готовый шаблон.", "Бөлімді таңдап, өз ережеңізді немесе дайын үлгіні қосыңыз.", "Choose a section and add your own rule or a template."],
    titlePlaceholder: ["Например: Предложение дополнительной помощи", "Мысалы: Қосымша көмек ұсыну", "For example: Offering further help"],
    rulePlaceholder: ["Да, если оператор…", "Иә, егер оператор…", "Yes, if the operator…"],
    specific: ["Конкретно", "Нақты", "Specific"],
    goodRule: ["Да, если оператор поздоровался на языке клиента и представился в первом ответе.", "Иә, егер оператор бірінші жауапта клиенттің тілінде амандасып, өзін таныстырса.", "Yes, if the operator greeted the client in their language and introduced themselves in the first reply."],
    goodHint: ["Конкретное действие, понятно, где искать.", "Нақты әрекет, оны қайдан іздеу керегі түсінікті.", "A specific action with a clear place to look."],
    vague: ["Неясно", "Түсініксіз", "Vague"],
    badRule: ["Оператор был вежливым.", "Оператор сыпайы болды.", "The operator was polite."],
    badHint: ["Непонятно, что считать вежливостью.", "Сыпайылықты қалай анықтау керегі түсініксіз.", "It is unclear what counts as polite."],
    tipOne: ["Одно действие на критерий.", "Әр критерийге бір әрекет.", "One action per criterion."],
    tipWhere: ["Укажите, где в разговоре его искать.", "Оны әңгіменің қай жерінен іздеу керегін көрсетіңіз.", "Say where to look for it in the conversation."],
    tipViolation: ["Объясните, что считать нарушением.", "Нені бұзушылық деп санау керегін түсіндіріңіз.", "Explain what counts as a violation."],
    ruleHelp: ["Как написать правило, чтобы модель поняла", "Модель түсінетін ережені қалай жазуға болады", "How to write a rule the model can follow"],
    section: ["Раздел: ", "Бөлім: ", "Section: "],
    choose: ["Выбрать", "Таңдау", "Choose"],
    stepOne: ["Что проверяем", "Нені тексереміз", "What to check"],
    title: ["Название", "Атауы", "Name"],
    rule: ["Правило для модели", "Модельге арналған ереже", "Rule for the model"],
    stepTwo: ["Как отвечать", "Қалай жауап беру керек", "How to answer"],
    yes: ["Да", "Иә", "Yes"],
    no: ["Нет", "Жоқ", "No"],
    weightLabel: ["Вес критерия", "Критерий салмағы", "Criterion weight"],
    weightChange: ["Изменить вес критерия", "Критерий салмағын өзгерту", "Change criterion weight"],
    stepThree: ["Насколько важно", "Қаншалықты маңызды", "How important it is"],
    weight: ["Вес", "Салмақ", "Weight"],
    weightHint: ["Сумма весов может быть любой, итог всё равно считается из 100.", "Салмақтар қосындысы кез келген сан болуы мүмкін, қорытынды бәрібір 100 ұпайдан есептеледі.", "Weights can add up to any number. The total is always scored out of 100."],
    naPlaceholder: ["Например: клиент спрашивал только про тарифы, проверять личность не нужно", "Мысалы: клиент тек тарифтерді сұрады, жеке басын тексеру қажет емес", "For example: the client only asked about rates, so identity verification was unnecessary"],
    stepFour: ["Когда не применять", "Қашан қолданылмайды", "When it does not apply"],
    naToggle: ["Критерий может не относиться к разговору", "Критерий әңгімеге қолданылмауы мүмкін", "The criterion may not apply to a conversation"],
    naCondition: ["Когда он не относится", "Қолданылмайтын жағдай", "When it does not apply"],
    optional: ["по желанию", "міндетті емес", "optional"],
    delete: ["Удалить критерий", "Критерийді жою", "Delete criterion"],
    replace: ["Заменить", "Ауыстыру", "Replace"],
    replaceTitle: ["Заменить критерий", "Критерийді ауыстыру", "Replace criterion"],
    replaceKeeps: ["Новый критерий займёт это же место в разделе. Вес {weight} сохранится, его можно изменить.", "Жаңа критерий бөлімдегі осы орынға қойылады. {weight} салмағы сақталады, оны өзгертуге болады.", "The new criterion will take the same place in this section and keep its weight of {weight}. You can change the weight."],
    replaceUnweighted: ["У прежнего критерия не было веса. Новый займёт его место; задайте ему вес перед сохранением.", "Бұрынғы критерийдің салмағы болмаған. Жаңасы оның орнын алады; сақтау алдында оған салмақ беріңіз.", "The previous criterion had no weight. The new one will take its place; set its weight before saving."],
    replaced: ["«{title}» заменён в черновике.", "Жобадағы «{title}» ауыстырылды.", "“{title}” was replaced in the draft."],
    levelScore: ["Баллы ступени {index}", "{index}-деңгейдің ұпайы", "Score for level {index}"],
    levelPlaceholder: ["Что значит эта ступень", "Бұл деңгей нені білдіреді", "What this level means"],
    levelDescription: ["Описание ступени {index}", "{index}-деңгейдің сипаттамасы", "Description of level {index}"],
    levelDelete: ["Удалить ступень {index}", "{index}-деңгейді жою", "Delete level {index}"],
    points: ["Баллы", "Ұпай", "Points"],
    meaning: ["Что значит", "Мағынасы", "Meaning"],
    levelAdd: ["Добавить ступень", "Деңгей қосу", "Add level"],
    levelHint: ["Самая высокая ступень даёт полный вес критерия. Обязательно есть ступень 0.", "Ең жоғары деңгей критерийдің толық салмағын береді. 0 деңгейі міндетті түрде болуы керек.", "The highest level earns the criterion’s full weight. A level worth 0 is required."],
    criterionSection: ["Раздел критерия", "Критерий бөлімі", "Criterion section"],
    leave: ["Выйти из редактора", "Редактордан шығу", "Leave the editor"],
    discardWarning: ["Несохранённые изменения будут потеряны.", "Сақталмаған өзгерістер жоғалады.", "Unsaved changes will be lost."],
    keepEditing: ["Вернуться к правке", "Өңдеуге оралу", "Keep editing"],
    discard: ["Не сохранять", "Сақтамау", "Discard changes"],
    chooseBase: ["Взять за основу", "Негіз ретінде алу", "Choose a base version"],
    switchVersion: ["Перейти к другой версии", "Басқа нұсқаға ауысу", "Switch to another version"],
    weightChanged: ["Вес: {before} → {after}", "Салмақ: {before} → {after}", "Weight: {before} → {after}"],
    saveVersion: ["Сохранить версию {version}", "{version}-нұсқаны сақтау", "Save version {version}"],
    saveExplainer: ["Новые оценки пойдут по версии {version}. Уже оценённые обращения можно переоценить, модель заново оценит только изменённые критерии.", "Жаңа бағалаулар {version}-нұсқа бойынша орындалады. Бұрын бағаланған өтініштерді қайта бағалауға болады: модель тек өзгертілген критерийлерді қайта тексереді.", "New evaluations will use version {version}. Existing requests can be reevaluated; the model will reassess only the changed criteria."],
    saveApply: ["Сохранить и применить к обращениям", "Сақтап, өтініштерге қолдану", "Save and apply to requests"],
    saveOnly: ["Только сохранить", "Тек сақтау", "Save only"],
    saveFailed: ["Не удалось сохранить версию. Изменения остались в форме", "Нұсқаны сақтау мүмкін болмады. Өзгерістер пішінде сақталды", "The version could not be saved. Your changes remain in the form"],
    "template.additional_help.title": ["Предложение дополнительной помощи", "Қосымша көмек ұсыну", "Offering further help"],
    "template.additional_help.hint": ["Оператор уточнил, остались ли у клиента вопросы.", "Оператор клиенттің тағы сұрақтары бар-жоғын нақтылады.", "The operator checked whether the client had any more questions."],
    "template.request_reference.title": ["Уточнение номера обращения или счёта", "Өтініш немесе шот нөмірін нақтылау", "Confirming the request or account number"],
    "template.request_reference.hint": ["Оператор уточнил, к какому обращению или счёту относится вопрос.", "Оператор сұрақтың қай өтінішке немесе шотқа қатысты екенін нақтылады.", "The operator confirmed which request or account the question concerned."],
    "template.waiting_time.title": ["Предупреждение о сроках", "Мерзім туралы хабарлау", "Explaining the waiting time"],
    "template.waiting_time.hint": ["Клиент понимает, сколько ждать и когда узнать результат.", "Клиент қанша күтіп, нәтижені қашан білетінін түсінеді.", "The client knows how long to wait and when to expect a result."],
    "template.closing_summary.title": ["Корректное прощание с итогом", "Қорытынды жасап қоштасу", "Closing with a summary"],
    "template.closing_summary.hint": ["Оператор повторил результат или следующий шаг и попрощался.", "Оператор нәтижені не келесі қадамды қайталап, қоштасты.", "The operator restated the result or next step and said goodbye."],
    "template.personalization.title": ["Персонализация (обращение по имени)", "Жеке қарым-қатынас (есімімен атау)", "Personalization (using the client’s name)"],
    "template.personalization.hint": ["Оператор корректно обратился к клиенту по известному имени.", "Оператор клиенттің белгілі есімін дұрыс қолданды.", "The operator addressed the client by their known name correctly."]
  };
  DA.i18n.addMessages(Object.fromEntries(Object.entries(labels).map(([key, [ru, kk, en]]) => [`ce.${key}`, { ru, kk, en }])));
  DA.i18n.addMessages({ "ce.fixFields": { ru: { one: "Исправьте {count} поле", few: "Исправьте {count} поля", many: "Исправьте {count} полей", other: "Исправьте {count} поля" }, kk: "{count} өрісті түзетіңіз", en: { one: "Fix {count} field", other: "Fix {count} fields" } } });
  const TYPES = [
    { value: "binary", title: m("binary"), hint: m("binaryHint") },
    { value: "scale", title: m("scale"), hint: m("scaleHint") },
    { value: "flag", title: m("flag"), hint: m("flagHint") }
  ];
  const sorted = (items) => [...items].sort((a, b) => a.order - b.order);

  function errorsOf(c, all) {
    const e = {};
    if (!c.title.trim()) e.title = "titleRequired";
    else if (all.filter((x) => x.title.trim().toLocaleLowerCase("ru-RU") === c.title.trim().toLocaleLowerCase("ru-RU")).length > 1) e.title = "titleDuplicate";
    if (!c.description.trim()) e.description = "ruleRequired";
    if (c.type !== "flag" && (!Number.isFinite(c.weight) || c.weight < 1 || c.weight > 100)) e.weight = "weightInvalid";
    if (c.type !== "flag" && c.naAllowed && !(c.naCondition || "").trim()) e.naCondition = "naRequired";
    if (c.type === "scale") {
      const steps = c.scale || [], values = steps.map((s) => s.value);
      if (steps.length < 2) e.scale = "scaleMinimum";
      else if (values.some((v) => !Number.isFinite(v) || v < 0)) e.scale = "scaleNegative";
      else if (!values.includes(0)) e.scale = "scaleZero";
      else if (new Set(values).size !== values.length) e.scale = "scaleDuplicate";
      else if (steps.some((s) => !s.description.trim())) e.scale = "scaleDescription";
    }
    return e;
  }

  DA.views.checklistEdit = function mount(root, params) {
    let viewing = DA.checklist(Number(params?.query?.version)) || DA.activeChecklist();
    if (!viewing) return;
    let draft = structuredClone(viewing), selectedId = draft.criteria[0]?.id, restored = false;
    const draftKey = () => `da.checklist.draft.${viewing.version}`;
    try {
      const cached = JSON.parse(sessionStorage.getItem(draftKey()) || "null");
      if (cached?.draft?.version === viewing.version && Array.isArray(cached.draft.criteria) && cached.draft.criteria.every((c) => typeof c.id === "string" && typeof c.title === "string" && typeof c.description === "string")) {
        draft = cached.draft; selectedId = cached.selectedId || draft.criteria[0]?.id; restored = true;
      }
    } catch (error) { /* Закрытое хранилище не мешает редактированию. */ }
    let saving = false, saveError = "", disposed = false, deleted = null, undoTimer = null, menuClose = null;
    let helpOpen = false, mobileTreeOpen = false;
    const typeDrafts = new Map();
    const page = h("div", { class: "da-page ce-page" });
    const bar = h("div", { class: "ce-top" });
    const tree = h("nav", { class: "ce-tree", "aria-label": DA.msg("cl.criteria") });
    const form = h("div", { class: "ce-form" });
    const body = h("div", { class: "ce-layout" }, tree, form);
    root.append(page); page.append(bar, body);
    let formWidth = 0;
    const formSize = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === formWidth) return;
      formWidth = entry.contentRect.width;
      for (const input of form.querySelectorAll(".ce-rule-input, .ce-scale-row textarea")) {
        input.style.height = "auto";
        const isRule = input.classList.contains("ce-rule-input");
        input.style.height = Math.min(isRule ? 220 : Infinity, Math.max(isRule ? 92 : 44, input.scrollHeight)) + "px";
      }
    });
    formSize.observe(form);
    const selected = () => draft.criteria.find((c) => c.id === selectedId);
    const isDirty = () => JSON.stringify(viewing.criteria) !== JSON.stringify(draft.criteria);
    const allErrors = () => draft.criteria.length ? draft.criteria.reduce((n, c) => n + Object.keys(errorsOf(c, draft.criteria)).length, 0) : 1;
    const nextVersion = () => Math.max(...DA.state.checklists.map((cl) => cl.version)) + 1;
    const shares = () => DA.checklistShares(draft).criteria;
    function preserveDraft() {
      try {
        if (isDirty()) sessionStorage.setItem(draftKey(), JSON.stringify({ draft, selectedId }));
        else sessionStorage.removeItem(draftKey());
      } catch (error) { /* Основной путь сохранения остаётся доступным. */ }
    }
    function forgetDraft() { try { sessionStorage.removeItem(draftKey()); } catch (error) { /* Необязательное хранилище. */ } restored = false; }

    function renderBar() {
      preserveDraft();
      const errors = allErrors(), dirty = isDirty();
      const reason = saving ? m("saving") : !dirty ? m("unchanged") : errors ? m("fixFields", { count: errors }) : "";
      const save = h("button", { class: "da-btn is-primary", type: "button", disabled: !!reason, onclick: saveSummary }, saving ? m("saving") : m("save"));
      const saveWrap = h("span", { class: "ce-save", tabindex: reason ? 0 : null, "aria-label": reason || null }, save);
      if (reason) DA.hoverCard(saveWrap, () => h("p", { class: "cl-ribbon-tip" }, reason));
      bar.replaceChildren(...[
        h("div", { class: "ce-heading" }, h("a", { class: "ce-back", href: `#/checklists?version=${viewing.version}` }, DA.icon("back", 16), m("back")),
          h("h1", { class: "da-h1", tabindex: -1 }, m("draftVersion", { version: nextVersion() })),
          h("button", { class: "ce-version", type: "button", disabled: saving, onclick: chooseVersion }, m("basedOn", { version: viewing.version }), DA.icon("chevron", 13))),
        saveWrap, saveError ? h("p", { class: "da-error ce-save-error", role: "alert" }, saveError) : null,
        restored ? h("p", { class: "ce-restored", role: "status" }, m("restored")) : null].filter(Boolean));
    }

    function renderTree() {
      menuClose?.();
      const portion = shares();
      const contents = h("div", { class: "ce-tree-content", id: "ce-criteria-list" });
      if (isDirty()) contents.append(h("button", { class: "da-btn is-text is-sm ce-reset", type: "button", disabled: saving, onclick: resetDraft }, m("reset")));
      for (const section of sorted(draft.sections)) {
        const group = h("section", { class: "ce-tree-section" }, h("h3", {}, section.title));
        for (const c of sorted(draft.criteria.filter((item) => item.sectionId === section.id))) {
          const old = viewing.criteria.find((item) => item.id === c.id), errors = errorsOf(c, draft.criteria);
          const mark = !old ? m("new") : JSON.stringify(old) !== JSON.stringify(c) ? m("changed") : "";
          const row = h("button", { class: "ce-tree-row", type: "button", disabled: saving, "data-criterion": c.id,
            "aria-current": String(c.id === selectedId), onclick: () => selectCriterion(c.id) },
            h("span", { class: "ce-tree-name" }, Object.keys(errors).length ? h("span", { class: "ce-error-dot", "aria-label": m(Object.values(errors)[0]) }) : null,
              c.title || DA.msg("cl.newCriterion"), mark ? h("small", { class: "ce-mark" + (!old ? " is-new" : "") }, mark) : null),
            h("span", { class: "ce-tree-share" }, c.type === "flag" ? DA.icon("flag", 15) : `${portion[c.id] || 0} %`));
          if (Object.keys(errors).length) DA.hoverCard(row, () => h("p", { class: "cl-ribbon-tip" }, m(Object.values(errors)[0])));
          group.append(row);
        }
        const add = h("button", { class: "da-btn is-text is-sm ce-add", type: "button", disabled: saving, "aria-expanded": "false", onclick: () => templateMenu(add, section.id) }, DA.icon("plus", 15), m("add"));
        group.append(add); contents.append(group);
      }
      tree.replaceChildren(h("div", { class: "ce-tree-head" }, h("h2", {}, DA.msg("cl.criteria")), h("span", {}, `${draft.criteria.length}`)),
        h("button", { class: "ce-mobile-select", type: "button", "aria-expanded": String(mobileTreeOpen), "aria-controls": "ce-criteria-list", onclick: () => { mobileTreeOpen = !mobileTreeOpen; renderTree(); } },
          h("span", {}, selected()?.title || m("chooseCriterion")), DA.icon("chevron", 16)), contents);
      tree.classList.toggle("is-open", mobileTreeOpen);
    }

    function selectCriterion(id) {
      selectedId = id; mobileTreeOpen = false; renderTree(); renderForm();
      if (matchMedia("(max-width: 760px)").matches) form.scrollIntoView({ block: "start", behavior: "auto" });
      form.querySelector("h2")?.focus({ preventScroll: true });
    }

    function resetDraft() {
      clearTimeout(undoTimer); deleted = null; draft = structuredClone(viewing); saveError = ""; restored = false; typeDrafts.clear();
      if (!selected()) selectedId = draft.criteria[0]?.id;
      renderAll();
    }

    function templateMenu(anchor, sectionId) {
      if (menuClose) { menuClose(); return; }
      const menu = h("div", { class: "ce-add-menu", role: "group", "aria-label": m("add") });
      for (const item of [{ key: null, title: m("blank"), summary: m("blankHint") }, ...(window.DA_CRITERION_TEMPLATES || [])]) {
        menu.append(h("button", { type: "button", onclick: () => { close(); addCriterion(sectionId, item.key ? item : null); } }, h("b", {}, item.key ? m(`template.${item.key}.title`) : item.title), h("span", {}, item.key ? m(`template.${item.key}.hint`) : item.summary)));
      }
      function outside(e) { if (!e.target.closest?.(".da-locale-control") && !menu.contains(e.target) && !anchor.contains(e.target)) close(); }
      function key(e) { if (e.key === "Escape") { e.preventDefault(); close(); anchor.focus(); } }
      function close() {
        menu.remove(); anchor.setAttribute("aria-expanded", "false");
        document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); menuClose = null;
      }
      menuClose = close; anchor.after(menu); anchor.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key);
      menu.querySelector("button").focus({ preventScroll: true });
    }

    function makeCriterion(sectionId, template, order) {
      const fields = template ? structuredClone(template) : { title: "", description: "", type: "binary", weight: 10, naAllowed: false, naCondition: null, scale: null, flagTypes: null };
      delete fields.key; delete fields.summary;
      return { ...fields, id: "c_" + crypto.randomUUID().replaceAll("-", ""), sectionId, order };
    }

    function addCriterion(sectionId, template) {
      const c = makeCriterion(sectionId, template, Math.max(0, ...draft.criteria.map((item) => item.order)) + 1);
      draft.criteria.push(c); selectedId = c.id; mobileTreeOpen = false; saveError = ""; renderAll();
      form.querySelector("input")?.focus();
    }

    function chooseReplacement(c) {
      if (saving) return;
      let modal;
      const choices = [{ key: null }, ...(window.DA_CRITERION_TEMPLATES || [])];
      const list = h("div", { class: "ce-option-list ce-replace-options" }, choices.map((item) =>
        h("button", { class: "ce-option", type: "button", "data-template": item.key || "blank", onclick: () => {
          modal.close(); replaceCriterion(c, item.key ? item : null);
        } }, h("span", {}, h("b", {}, m(item.key ? `template.${item.key}.title` : "blank")),
          h("small", {}, m(item.key ? `template.${item.key}.hint` : "blankHint"))))));
      modal = DA.modal({ title: m("replaceTitle"), body: h("div", {},
        h("p", { class: "ce-replace-intro" }, h("strong", {}, c.title || DA.msg("cl.newCriterion")),
          h("span", {}, c.type === "flag" ? m("replaceUnweighted") : m("replaceKeeps", { weight: Number.isFinite(c.weight) ? c.weight : "—" }))), list), width: 560 });
    }

    function replaceCriterion(c, template) {
      const index = draft.criteria.indexOf(c);
      if (saving || index < 0) return;
      const next = makeCriterion(c.sectionId, template, c.order);
      next.weight = next.type === "flag" ? 0 : c.weight;
      clearTimeout(undoTimer);
      deleted = { c, index, replacementId: next.id, typeDraft: typeDrafts.get(c.id) };
      draft.criteria.splice(index, 1, next); typeDrafts.delete(c.id);
      selectedId = next.id; mobileTreeOpen = false; saveError = ""; renderAll();
      form.querySelector("input")?.focus();
      undoTimer = setTimeout(() => { deleted = null; if (!disposed) form.querySelector(".ce-undo")?.remove(); }, 6000);
    }

    function renderForm() {
      form.replaceChildren();
      const undo = deleted;
      if (undo) form.append(h("div", { class: "ce-undo", role: "status" }, h("span", {}, undo.replacementId ? m("replaced", () => ({ title: undo.c.title || DA.t("cl.newCriterion") })) : m("removed")), h("button", { class: "da-btn is-text is-sm", type: "button", onclick: undoDelete }, m("undo"))));
      const c = selected();
      if (!c) {
        if (!deleted) form.append(h("div", { class: "ce-empty" }, h("h2", {}, m("addFirst")), h("p", {}, m("empty"))));
        return;
      }
      const errNodes = {}, steps = new Map();
      let shareNode, weightRibbon;
      const stepErrors = { 1: ["title", "description"], 2: ["scale"], 3: ["weight"], 4: ["naCondition"] };
      const errSlot = (key) => (errNodes[key] = h("span", { class: "da-error", id: `ce-error-${key}`, hidden: true }));
      function refresh(clearError = true) {
        if (clearError) saveError = "";
        renderTree(); renderBar();
        const errors = errorsOf(c, draft.criteria);
        for (const [key, node] of Object.entries(errNodes)) {
          DA.i18n.bindText(node, () => errorsOf(c, draft.criteria)[key] ? DA.t(`ce.${errorsOf(c, draft.criteria)[key]}`) : ""); node.hidden = !errors[key];
          form.querySelector(`[aria-describedby="ce-error-${key}"]`)?.setAttribute("aria-invalid", String(!!errors[key]));
        }
        for (const [number, node] of steps) {
          const invalid = stepErrors[number].some((key) => errors[key]);
          node.classList.toggle("is-invalid", invalid);
          node.classList.toggle("is-quiet", number > 1 && (!!errors.title || !!errors.description));
          node.querySelector(".ce-step-number").replaceChildren(invalid || (number === 4 && !c.naAllowed) ? String(number) : DA.icon("check", 15));
        }
        if (shareNode) DA.i18n.bindText(shareNode, "cl.share", () => ({ percent: shares()[c.id] || 0 }));
        if (weightRibbon) weightRibbon.replaceChildren(DA.checklistRibbon(draft, { selected: c.id }));
      }
      function bind(node, key, map) {
        node.addEventListener("input", () => { c[key] = map ? map(node.value) : node.value; refresh(); });
        return node;
      }
      function field(label, node, key, hint) {
        node.setAttribute("aria-describedby", `ce-error-${key}`);
        return h("label", { class: "da-field" }, h("span", {}, label), node, hint ? h("small", { class: "ce-hint" }, hint) : null, errSlot(key));
      }
      function step(number, title, content, extra, action) {
        const node = h("section", { class: "ce-step-block", "data-step": number },
          h("div", { class: "ce-step-heading" }, h("span", { class: "ce-step-number", "aria-hidden": "true" }, number), h("h2", { tabindex: -1 }, title), extra ? h("span", { class: "ce-optional" }, extra) : null, action),
          h("div", { class: "ce-step-body" }, content));
        steps.set(number, node); return node;
      }
      const title = bind(h("input", { class: "da-input", value: c.title, placeholder: m("titlePlaceholder") }), "title");
      const rule = bind(h("textarea", { class: "da-textarea ce-rule-input", rows: 3, placeholder: m("rulePlaceholder") }), "description"); rule.value = c.description;
      const resizeRule = () => { rule.style.height = "auto"; rule.style.height = Math.min(220, Math.max(92, rule.scrollHeight)) + "px"; };
      rule.addEventListener("input", resizeRule);
      const help = h("div", { class: "ce-rule-help", hidden: !helpOpen },
        h("div", { class: "ce-rule-example is-good" }, h("b", {}, m("specific")), h("p", {}, m("goodRule")), h("small", {}, m("goodHint"))),
        h("div", { class: "ce-rule-example" }, h("b", {}, m("vague")), h("p", {}, m("badRule")), h("small", {}, m("badHint"))),
        h("ul", {}, h("li", {}, m("tipOne")), h("li", {}, m("tipWhere")), h("li", {}, m("tipViolation"))));
      const helpButton = h("button", { class: "ce-help-toggle", type: "button", "aria-expanded": String(helpOpen), onclick: () => { helpOpen = !helpOpen; help.hidden = !helpOpen; helpButton.setAttribute("aria-expanded", String(helpOpen)); } }, DA.icon("chevron", 14), m("ruleHelp"));
      const sectionButton = h("button", { class: "ce-section-select", type: "button", onclick: () => chooseSection(c) }, m("section"), draft.sections.find((s) => s.id === c.sectionId)?.title || m("choose"), DA.icon("chevron", 13));
      form.append(step(1, m("stepOne"), [field(m("title"), title, "title"), field(m("rule"), rule, "description"), helpButton, help, sectionButton], null,
        h("button", { class: "da-btn is-text is-sm ce-replace", type: "button", onclick: () => chooseReplacement(c) }, DA.icon("refresh", 14), m("replace"))));

      const typeCards = h("div", { class: "ce-types", role: "group", "aria-label": m("stepTwo") }, TYPES.map((type) => {
        const sample = type.value === "binary" ? h("div", { class: "ce-type-sample" }, h("span", { class: "ce-mini-pill is-yes" }, m("yes")), h("span", { class: "ce-mini-pill is-no" }, m("no")))
          : type.value === "scale" ? h("div", { class: "ce-type-sample ce-scale-sample", "aria-hidden": "true" }, [1, 2, 3, 4, 5].map((n) => h("i", { style: { height: `${n * 4 + 3}px` } })))
          : h("div", { class: "ce-type-sample", "aria-hidden": "true" }, DA.icon("flag", 25));
        return h("button", { class: "ce-type", type: "button", "data-type": type.value, "aria-pressed": String(c.type === type.value), onclick: () => changeType(c, type.value) },
          sample, h("b", {}, type.title), h("span", {}, type.hint), c.type === type.value ? h("i", { class: "ce-type-check" }, DA.icon("check", 13)) : null);
      }));
      form.append(step(2, m("stepTwo"), [typeCards, c.type === "scale" ? scaleEditor(c, errSlot("scale"), refresh) : null]));

      if (c.type !== "flag") {
        shareNode = h("strong", { class: "ce-share-live", "aria-live": "off" });
        const number = h("input", { class: "da-input ce-weight-number", type: "number", min: 1, max: 100, step: "any", value: c.weight, "aria-label": m("weightLabel"), "aria-describedby": "ce-error-weight" });
        const slider = h("input", { class: "ce-weight-slider", type: "range", min: 1, max: 50, step: 1, value: Math.min(50, c.weight), "aria-label": m("weightChange") });
        const paintSlider = () => slider.style.setProperty("--filled", `${(Math.min(50, Math.max(1, Number(c.weight) || 1)) - 1) / 49 * 100}%`);
        slider.addEventListener("input", () => { c.weight = Number(slider.value); number.value = c.weight; paintSlider(); refresh(); });
        number.addEventListener("input", () => { c.weight = number.value === "" ? NaN : Number(number.value); slider.value = Math.min(50, c.weight || 1); paintSlider(); refresh(); });
        paintSlider(); weightRibbon = h("div", { class: "ce-weight-ribbon" });
        form.append(step(3, m("stepThree"), [h("div", { class: "ce-weight-value" }, shareNode, h("label", { class: "ce-weight-label" }, m("weight"), number)),
          slider, errSlot("weight"), weightRibbon, h("p", { class: "ce-hint" }, m("weightHint"))]));
        const toggle = h("input", { type: "checkbox", checked: c.naAllowed });
        toggle.addEventListener("change", () => { c.naAllowed = toggle.checked; c.naCondition = toggle.checked ? (c.naCondition || "") : null; renderForm(); form.querySelector(".ce-na-switch input")?.focus({ preventScroll: true }); });
        const na = bind(h("textarea", { class: "da-textarea", rows: 2, placeholder: m("naPlaceholder") }), "naCondition"); na.value = c.naCondition || "";
        form.append(step(4, m("stepFour"), [h("label", { class: "da-switch ce-na-switch" }, toggle, h("i", { "aria-hidden": "true" }), h("span", {}, m("naToggle"))),
          c.naAllowed ? field(m("naCondition"), na, "naCondition") : null], m("optional")));
      }
      form.append(h("div", { class: "ce-delete" }, h("button", { class: "da-btn is-text", type: "button", onclick: () => removeCriterion(c) }, DA.icon("trash", 16), m("delete"))));
      refresh(false); requestAnimationFrame(() => { if (rule.isConnected) resizeRule(); }); form.inert = saving;
    }

    function scaleEditor(c, error, refresh) {
      const list = h("div", { class: "ce-scale-rows" });
      function draw(focusIndex) {
        list.replaceChildren(...c.scale.map((s, index) => {
          const value = h("input", { class: "da-input", type: "number", min: 0, step: "any", value: s.value, "aria-label": m("levelScore", { index: index + 1 }) });
          value.addEventListener("input", () => { s.value = value.value === "" ? NaN : Number(value.value); refresh(); });
          value.addEventListener("change", () => {
            requestAnimationFrame(() => {
              if (!list.isConnected) return;
              const active = document.activeElement;
              const rowIndex = [...list.children].findIndex((row) => row.contains(active));
              const nextStep = c.scale[rowIndex];
              const controlIndex = rowIndex < 0 ? -1 : [...list.children[rowIndex].querySelectorAll("input, textarea, button")].indexOf(active);
              c.scale.sort((a, b) => b.value - a.value); draw(); refresh();
              if (nextStep && controlIndex >= 0) list.children[c.scale.indexOf(nextStep)]?.querySelectorAll("input, textarea, button")[controlIndex]?.focus({ preventScroll: true });
            });
          });
          const description = h("textarea", { class: "da-textarea", rows: 1, placeholder: m("levelPlaceholder"), "aria-label": m("levelDescription", { index: index + 1 }) });
          description.value = s.description;
          const resize = () => { description.style.height = "auto"; description.style.height = Math.max(44, description.scrollHeight) + "px"; };
          description.addEventListener("input", () => { s.description = description.value; resize(); refresh(); });
          requestAnimationFrame(() => { if (description.isConnected) resize(); });
          return h("div", { class: "ce-scale-row" }, value, description, h("button", { class: "da-icon-btn", type: "button", "aria-label": m("levelDelete", { index: index + 1 }), onclick: () => { c.scale.splice(index, 1); draw(); refresh(); list.querySelector("input")?.focus(); } }, DA.icon("x", 16)));
        }));
        if (focusIndex != null) list.children[focusIndex]?.querySelector("input")?.focus({ preventScroll: true });
      }
      c.scale.sort((a, b) => b.value - a.value); draw();
      return h("div", { class: "ce-scale-editor" }, h("div", { class: "ce-scale-labels" }, h("span", {}, m("points")), h("span", {}, m("meaning"))), list,
        h("button", { class: "da-btn is-text is-sm", type: "button", onclick: () => {
          const values = new Set(c.scale.map((s) => s.value)); let value = 0; while (values.has(value)) value++;
          const item = { value, description: "" }; c.scale.push(item); c.scale.sort((a, b) => b.value - a.value); draw(c.scale.indexOf(item)); refresh();
        } }, DA.icon("plus", 15), m("levelAdd")),
        h("p", { class: "ce-hint" }, m("levelHint")), error);
    }
    function changeType(c, type) {
      if (c.type === type) return;
      const remembered = typeDrafts.get(c.id) || {};
      if (c.type === "scale") remembered.scale = structuredClone(c.scale);
      if (c.type === "flag") remembered.flagTypes = structuredClone(c.flagTypes);
      else { remembered.weight = c.weight; remembered.naAllowed = c.naAllowed; remembered.naCondition = c.naCondition; }
      typeDrafts.set(c.id, remembered);
      const previous = c.type;
      c.type = type;
      const original = viewing.criteria.find((item) => item.id === c.id);
      c.scale = type === "scale" ? structuredClone(remembered.scale || original?.scale || [{ value: 20, description: "" }, { value: 10, description: "" }, { value: 0, description: "" }]) : null;
      c.flagTypes = type === "flag" ? structuredClone(remembered.flagTypes || original?.flagTypes || [{ id: "violation", title: "Нарушение" }]) : null;
      if (type === "flag") { c.weight = 0; c.naAllowed = false; c.naCondition = null; }
      else if (previous === "flag") { c.weight = remembered.weight ?? 10; c.naAllowed = !!remembered.naAllowed; c.naCondition = remembered.naCondition || null; }
      saveError = ""; renderAll(); form.querySelector(`[data-type="${type}"]`)?.focus({ preventScroll: true });
    }

    function chooseSection(c) {
      let modal;
      const list = h("div", { class: "ce-option-list" }, sorted(draft.sections).map((s) => h("button", { class: "ce-option", type: "button", "aria-pressed": String(c.sectionId === s.id), onclick: () => { c.sectionId = s.id; modal.close(); renderAll(); form.querySelector(".ce-section-select")?.focus({ preventScroll: true }); } }, s.title, c.sectionId === s.id ? DA.icon("check", 16) : null)));
      modal = DA.modal({ title: m("criterionSection"), body: list, width: 480 });
    }

    function removeCriterion(c) {
      clearTimeout(undoTimer); deleted = { c, index: draft.criteria.indexOf(c) };
      draft.criteria.splice(deleted.index, 1); selectedId = null; saveError = ""; renderAll();
      form.querySelector(".ce-undo button")?.focus({ preventScroll: true });
      undoTimer = setTimeout(() => {
        const index = deleted?.index || 0; deleted = null;
        if (!disposed && selected()) form.querySelector(".ce-undo")?.remove();
        else if (!disposed) { selectedId = (draft.criteria[index] || draft.criteria[index - 1])?.id; renderAll(); }
      }, 6000);
    }

    function undoDelete() {
      if (!deleted || saving) return;
      clearTimeout(undoTimer);
      const index = deleted.replacementId ? draft.criteria.findIndex((c) => c.id === deleted.replacementId) : -1;
      if (index >= 0) { draft.criteria.splice(index, 1, deleted.c); typeDrafts.delete(deleted.replacementId); }
      else draft.criteria.splice(deleted.index, 0, deleted.c);
      if (deleted.typeDraft) typeDrafts.set(deleted.c.id, deleted.typeDraft);
      selectedId = deleted.c.id; deleted = null;
      renderAll(); form.querySelector("h2")?.focus({ preventScroll: true });
    }

    function confirmLeave(change, title) {
      if (!isDirty()) { change(); return; }
      let modal;
      modal = DA.modal({ title: title || m("leave"), body: h("p", {}, m("discardWarning")),
        foot: h("div", { class: "ce-dialog-actions" }, h("button", { class: "da-btn", type: "button", onclick: () => modal.close() }, m("keepEditing")),
          h("button", { class: "da-btn is-primary", type: "button", onclick: () => { modal.close(); forgetDraft(); change(); } }, m("discard"))) });
    }

    function chooseVersion() {
      let modal;
      modal = DA.modal({ title: m("chooseBase"), body: h("div", { class: "ce-option-list" }, [...DA.state.checklists].sort((a, b) => b.version - a.version).map((cl) =>
        h("button", { class: "ce-option", type: "button", "aria-pressed": String(cl.version === viewing.version), onclick: () => {
          modal.close(); if (cl.version === viewing.version) return;
          confirmLeave(() => { viewing = cl; draft = structuredClone(cl); selectedId = draft.criteria[0]?.id; deleted = null; clearTimeout(undoTimer); typeDrafts.clear(); saveError = ""; history.replaceState(null, "", `#/checklists/edit?version=${cl.version}`); renderAll(); }, m("switchVersion"));
        } }, h("span", {}, DA.msg("cl.version", { version: cl.version }), cl.isActive ? h("small", {}, DA.msg("cl.active")) : null), cl.version === viewing.version ? DA.icon("check", 16) : null))), width: 420 });
    }

    function saveSummary() {
      if (saving || !isDirty() || allErrors()) return;
      const version = nextVersion();
      let modal;
      const list = h("ul", { class: "ce-change-list" }, DA.checklistChanges(draft, viewing).map((change) => h("li", {}, h("span", { class: `ce-change-label is-${change.kind}` }, DA.msg(`cl.change.${change.kind}`)),
        h("span", {}, change.title, change.kind === "weight" ? h("small", {}, m("weightChanged", { before: change.before.weight, after: change.after.weight })) : null))));
      modal = DA.modal({ title: m("saveVersion", { version }), body: h("div", {}, list,
        h("p", { class: "ce-save-explainer" }, m("saveExplainer", { version }))),
        foot: h("div", { class: "ce-save-actions" },
          h("button", { class: "da-btn is-primary", type: "button", onclick: () => { modal.close(); saveVersion(true); } }, m("saveApply")),
          h("div", {}, h("button", { class: "da-btn", type: "button", onclick: () => { modal.close(); saveVersion(false); } }, m("saveOnly")),
            h("button", { class: "da-btn is-text", type: "button", onclick: () => modal.close() }, m("keepEditing")))), width: 600 });
    }

    async function saveVersion(apply) {
      if (saving || allErrors()) return;
      saving = true; saveError = ""; menuClose?.(); clearTimeout(undoTimer); deleted = null; renderAll();
      try {
        const saved = await DA.data.saveChecklist(structuredClone(draft), { activate: true });
        forgetDraft(); viewing = saved; draft = structuredClone(saved);
        if (!disposed) location.hash = apply ? `#/checklists/apply/${saved.version}` : `#/checklists?version=${saved.version}`;
      } catch (error) { saveError = DA.msg(() => DA.apiErrorMessage?.(error) || DA.t("ce.saveFailed")); }
      finally { saving = false; if (!disposed) renderAll(); }
    }

    function renderAll() { renderBar(); renderTree(); renderForm(); tree.inert = saving; form.inert = saving; }
    /* Смена основы и внутренние переходы сохраняют возможность вернуться к вводу. */
    function guardNavigation(e) {
      const link = e.target.closest?.("a[href^='#']");
      if (!link || !isDirty() || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const hash = link.getAttribute("href");
      if (hash === location.hash) return;
      e.preventDefault(); e.stopPropagation();
      if (!saving) confirmLeave(() => { location.hash = hash; });
    }
    document.addEventListener("click", guardNavigation, true);
    renderAll();
    return () => { disposed = true; formSize.disconnect(); clearTimeout(undoTimer); menuClose?.(); document.removeEventListener("click", guardNavigation, true); };
  };
})();
