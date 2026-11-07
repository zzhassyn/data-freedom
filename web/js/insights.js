/* Сводка: выполнение критериев по языкам и операторы. */
(function () {
  const DA = window.DA, h = DA.h;
  const m = (key, params) => DA.msg("insights." + key, params);
  const t = (key, params) => DA.t("insights." + key, params);
  DA.i18n.addMessages({
    "insights.quality": { ru: "Оценка качества по критериям", kk: "Критерийлер бойынша сапа", en: "Quality by criterion" },
    "insights.overview": { ru: "Общая сводка", kk: "Жалпы жиынтық", en: "Overview" },
    "insights.topics": { ru: "Анализ тем обращений", kk: "Өтініш тақырыптарын талдау", en: "Conversation topics" },
    "insights.total": { ru: "Всего обращений", kk: "Барлық өтініштер", en: "Total conversations" },
    "insights.calls": { ru: "Звонки", kk: "Қоңыраулар", en: "Calls" },
    "insights.chats": { ru: "Чаты", kk: "Чаттар", en: "Chats" },
    "insights.topicMissing": { ru: "Тема ещё не определена", kk: "Тақырып әлі анықталмаған", en: "Topic not yet identified" },
    "insights.topicHelp": { ru: "Звонки сгруппированы по сохранённым темам резюме. Доля рассчитана от всех звонков. Раскройте тему, чтобы открыть записи.", kk: "Қоңыраулар сақталған түйіндеме тақырыптары бойынша топталған. Үлес барлық қоңыраулардан есептеледі. Жазбаларды көру үшін тақырыпты ашыңыз.", en: "Calls are grouped by saved summary topics. Shares use all calls. Expand a topic to open its conversations." },
    "insights.noCalls": { ru: "Звонков пока нет", kk: "Қоңыраулар әлі жоқ", en: "No calls yet" },
    "insights.noCallsHelp": { ru: "Загрузите звонки, чтобы увидеть распределение тем.", kk: "Тақырыптардың үлестірімін көру үшін қоңырауларды жүктеңіз.", en: "Import calls to see their topic distribution." },
    "insights.topicCoverage": { ru: "Тема определена у {count} из {total} звонков", kk: "{total} қоңыраудың {count} тақырыбы анықталған", en: "Topic identified for {count} of {total} calls" },
    "insights.operators": { ru: "Операторы", kk: "Операторлар", en: "Agents" },
    "insights.conversations": { ru: { one: "{count} обращение", few: "{count} обращения", many: "{count} обращений", other: "{count} обращения" }, kk: "{count} өтініш", en: { one: "{count} conversation", other: "{count} conversations" } },
    "insights.nameHidden": { ru: "Имя скрыто в записи", kk: "Жазбада аты жасырылған", en: "Name hidden in the record" },
    "insights.noIntroduction": { ru: "Оператор не представился", kk: "Оператор өзін таныстырмады", en: "Agent did not introduce themselves" },
    "insights.fullScore": { ru: "Полный балл", kk: "Толық ұпай", en: "Full score" },
    "insights.yes": { ru: "Да", kk: "Иә", en: "Yes" },
    "insights.partial": { ru: "Частично", kk: "Ішінара", en: "Partial" },
    "insights.no": { ru: "Нет", kk: "Жоқ", en: "No" },
    "insights.na": { ru: "Не применимо", kk: "Қолданылмайды", en: "Not applicable" },
    "insights.all": { ru: "Все", kk: "Барлығы", en: "All" },
    "insights.allLanguages": { ru: "Все языки", kk: "Барлық тілдер", en: "All languages" },
    "insights.criterion": { ru: "Критерий", kk: "Критерий", en: "Criterion" },
    "insights.noEvaluations": { ru: "Нет оценок", kk: "Бағалар жоқ", en: "No evaluations" },
    "insights.weakPoint": { ru: "Слабое место", kk: "Әлсіз тұсы", en: "Weak area" },
    "insights.foundIn": { ru: "в {count} из {total}", kk: "{total} ішінен {count}", en: "in {count} of {total}" },
    "insights.notFound": { ru: "не найдены", kk: "табылған жоқ", en: "none found" },
    "insights.cellLabel": { ru: "{criterion}, {language}: {result}", kk: "{criterion}, {language}: {result}", en: "{criterion}, {language}: {result}" },
    "insights.fulfilled": { ru: "выполнено {rate}", kk: "орындалуы: {rate}", en: "completion: {rate}" },
    "insights.openConversations": { ru: "Нажмите, чтобы открыть эти обращения в списке.", kk: "Осы өтініштерді тізімнен ашу үшін басыңыз.", en: "Click to view these conversations in the list." },
    "insights.meanScore": { ru: "Средний итог", kk: "Орташа қорытынды", en: "Mean score" },
    "insights.of100": { ru: "из 100", kk: "100 ұпайдан", en: "of 100" },
    "insights.distribution": { ru: "Распределение итогов: {ranges}", kk: "Қорытынды ұпайлардың үлестірімі: {ranges}", en: "Score distribution: {ranges}" },
    "insights.grossErrors": { ru: "Грубые ошибки", kk: "Өрескел қателер", en: "Critical errors" },
    "insights.noGrossErrors": { ru: "Грубых ошибок не найдено", kk: "Өрескел қателер табылған жоқ", en: "No critical errors found" },
    "insights.checked": { ru: { one: "Проверено {count} обращение.", few: "Проверено {count} обращения.", other: "Проверено {count} обращений." }, kk: "{count} өтініш тексерілді.", en: { one: "{count} conversation checked.", other: "{count} conversations checked." } },
    "insights.confirmed": { ru: "Оценка подтверждена", kk: "Баға расталды", en: "Score confirmed" },
    "insights.changed": { ru: "Оценка изменена", kk: "Баға өзгертілді", en: "Score changed" },
    "insights.pending": { ru: "На рассмотрении", kk: "Қаралуда", en: "Under review" },
    "insights.appeals": { ru: "Апелляции", kk: "Апелляциялар", en: "Appeals" },
    "insights.submitted": { ru: { one: "подана", few: "поданы", other: "подано" }, kk: "берілді", en: "submitted" },
    "insights.noAppeals": { ru: "Оценки пока никто не оспаривал.", kk: "Бағаларға әзірге ешкім шағымданған жоқ.", en: "No scores have been appealed yet." },
    "insights.openAppeals": { ru: "Открыть апелляции", kk: "Апелляцияларды ашу", en: "Open appeals" },
    "insights.emptyTitle": { ru: "Сводка появится после первой оценки", kk: "Алғашқы бағалаудан кейін жиынтық пайда болады", en: "Insights appear after the first evaluation" },
    "insights.emptyHelp": { ru: "Здесь будет видно, какие пункты чек-листа выполняются хуже всего и на каком языке.", kk: "Мұнда чек-листтің қай тармақтары және қай тілде нашар орындалатыны көрсетіледі.", en: "See which checklist criteria have the lowest completion rates and in which languages." },
    "insights.backToList": { ru: "К списку обращений", kk: "Өтініштер тізіміне", en: "Back to conversations" },
    "insights.operator": { ru: "Оператор", kk: "Оператор", en: "Agent" },
    "insights.conversationColumn": { ru: "Обращений", kk: "Өтініштер", en: "Conversations" },
    "insights.botClosed": { ru: { one: "Бот закрыл {count} обращение без оператора", few: "Бот закрыл {count} обращения без оператора", other: "Бот закрыл {count} обращений без оператора" }, kk: "Бот {count} өтінішті операторсыз жапты", en: { one: "The bot closed {count} conversation without an agent", other: "The bot closed {count} conversations without an agent" } },
    "insights.awaitingEvaluation": { ru: { one: "Ещё {count} обращение без оценки: операторы появятся здесь после оценки их обращений", few: "Ещё {count} обращения без оценки: операторы появятся здесь после оценки их обращений", other: "Ещё {count} обращений без оценки: операторы появятся здесь после оценки их обращений" }, kk: "Тағы {count} өтініш бағаланбаған: операторлар өтініштері бағаланғаннан кейін осында пайда болады", en: { one: "{count} more conversation awaits evaluation; its agent will appear here once it is evaluated", other: "{count} more conversations await evaluation; their agents will appear here once they are evaluated" } },
    "insights.fulfilledRate": { ru: "выполняет в {rate} обращений", kk: "өтініштердің {rate} бөлігінде орындайды", en: "met in {rate} of conversations" },
    "insights.fulfilledCount": { ru: "Выполнено: {count} из {total}", kk: "Орындалғаны: {count} / {total}", en: "Met in {count} of {total}" },
    "insights.grossError": { ru: "Грубая ошибка", kk: "Өрескел қате", en: "Critical error" },
    "insights.notEvaluated": { ru: "Не оценено", kk: "Бағаланбаған", en: "Not evaluated" },
    "insights.missingNameHelp": { ru: "В этих обращениях оператор не назвал имя в первом ответе", kk: "Бұл өтініштерде оператор алғашқы жауабында атын атамаған", en: "The agent did not give their name in the first response in these conversations" },
    "insights.evaluatedCount": { ru: "Оценено {count} из {total}", kk: "{total} ішінен {count} бағаланды", en: "Evaluated {count} of {total}" },
    "insights.contact": { ru: "Установление контакта", kk: "Байланыс орнату", en: "Establishing contact" },
    "insights.missingName": { ru: "Не названо имя в первом ответе", kk: "Алғашқы жауапта аты аталмаған", en: "No name given in the first response" },
    "insights.noWeakAreas": { ru: "Слабых мест нет", kk: "Әлсіз тұстары жоқ", en: "No weak areas" },
    "insights.section": { ru: "Раздел сводки", kk: "Жиынтық бөлімі", en: "Insights section" },
    "insights.coverage": { ru: "Оценено {count} из {total} обращений", kk: "Бағаланған өтініштер: {count} / {total}", en: "Evaluated {count} of {total} conversations" },
    "insights.title": { ru: "Сводка", kk: "Жиынтық", en: "Insights" }
  });

  DA.i18n.addMessages(Object.fromEntries(Object.entries({
    overviewTitle: ["Сводка качества обслуживания", "Қызмет көрсету сапасының жиынтығы", "Service quality summary"],
    evaluatedLabel: ["Оценено обращений", "Бағаланған өтініштер", "Evaluated conversations"],
    averageLabel: ["Средняя оценка", "Орташа баға", "Average score"],
    ofTotal: ["{rate} от общего количества", "Жалпы санның {rate}", "{rate} of all conversations"],
    callDuration: ["Средняя длительность звонка", "Қоңыраудың орташа ұзақтығы", "Average call duration"],
    durationHelp: ["По аудио и временным меткам · {count} звонков", "Аудио және уақыт белгілері бойынша · {count} қоңырау", "From audio and timestamps · {count} calls"],
    noData: ["Нет данных", "Деректер жоқ", "No data"],
    pendingAppeals: ["Апелляции на рассмотрении", "Қаралудағы апелляциялар", "Pending appeals"],
    decisionRequired: ["Требуется решение", "Шешім қажет", "Decision required"],
    noPending: ["Нет ожидающих решения", "Шешім күтіп тұрған жоқ", "No decisions pending"],
    popularity: ["Популярность тем", "Тақырыптардың танымалдығы", "Topic popularity"],
    resolvedShare: ["Доля решённых обращений по темам", "Тақырып бойынша шешілген өтініштердің үлесі", "Resolution rate by topic"],
    popularityHelp: ["Количество обращений по основной теме", "Негізгі тақырып бойынша өтініштер саны", "Number of conversations by primary topic"],
    resolvedHelp: ["Процент подтверждённо решённых обращений от всех обращений темы. Неизвестный результат не считается решённым.", "Тақырыптың барлық өтініштерінен расталған шешімдердің пайызы. Белгісіз нәтиже шешілді деп есептелмейді.", "Confirmed resolved conversations as a percentage of all conversations in each topic. Unknown outcomes do not count as resolved."],
    unknownResults: ["Без подтверждённого результата: {count} из {total}", "Расталған нәтижесіз: {count} / {total}", "Without a confirmed outcome: {count} of {total}"],
    resolvedCount: ["Решено {count} из {total}", "Шешілгені: {count} / {total}", "Resolved {count} of {total}"]
  }).map(([key, values]) => ["insights." + key, { ru: values[0], kk: values[1], en: values[2] }])));

  const LANGS = ["RU", "KZ", "EN"];
  DA.i18n.addMessages(Object.fromEntries(Object.entries({
    analyzeTopics: ["Определить темы", "Тақырыптарды анықтау", "Identify topics"],
    analyzingTopics: ["Определяем темы…", "Тақырыптар анықталуда…", "Identifying topics…"],
    topicsRule: ["Показаны темы с 3 и более обращениями. Похожие запросы объединяются по смыслу.", "3 және одан көп өтініші бар тақырыптар көрсетіледі. Ұқсас сұраулар мағынасы бойынша біріктіріледі.", "Only topics with at least 3 conversations are shown. Similar requests are grouped by meaning."],
    analysisCoverage: ["Проанализировано {count} из {total} обращений", "Талданған өтініштер: {count} / {total}", "Analyzed {count} of {total} conversations"],
    rareTopics: ["В темах с частотой менее 3: {count} обращений", "3-тен аз кездесетін тақырыптарда: {count} өтініш", "Conversations in topics occurring fewer than 3 times: {count}"],
    noFrequentTopics: ["Пока нет тем с тремя обращениями", "Үш өтініші бар тақырыптар әлі жоқ", "No topic has three conversations yet"],
    startTopicsHelp: ["Запустите анализ транскриптов. Сохранённые результаты используются повторно; запросы к модели расходуют баланс OpenRouter.", "Транскрипттерді талдауды іске қосыңыз. Сақталған нәтижелер қайта қолданылады; модель сұраулары OpenRouter теңгерімін жұмсайды.", "Analyze the transcripts. Saved results are reused; model requests use your OpenRouter balance."],
    topicsLoading: ["Загружаем темы…", "Тақырыптар жүктелуде…", "Loading topics…"],
    unclearTopics: ["Запрос не определён: {count}", "Сұрау анықталмаған: {count}", "Unclear requests: {count}"]
  }).map(([key, v]) => ["insights." + key, { ru: v[0], kk: v[1], en: v[2] }])));
  const TABS = ["overview", "topics", "quality"].map((value) => ({ value, label: m(value) }));
  const BUCKETS = [[0, 49], [50, 69], [70, 84], [85, 100]];
  const pct = (x) => new Intl.NumberFormat(DA.fmt.locale(), { style: "percent", maximumFractionDigits: 0 }).format(x);
  const nConv = (count) => t("conversations", { count });

  /* ---------- Данные ---------- */
  const evaluated = () => Object.values(DA.state.evaluations)
    .filter((ev) => ev && ev.status === "done" && !ev.stale && ev.total != null && DA.state.conversations[ev.conversationId])
    .sort((a, b) => DA.state.numbers[a.conversationId] - DA.state.numbers[b.conversationId]);

  function doneItem(ev, criterionId) {
    const item = ev.items.find((i) => i.criterionId === criterionId && i.status === "done");
    const c = item && DA.criterionById(DA.checklist(ev.checklistVersion), criterionId);
    return c ? { item, c } : null;
  }
  const fraction = (answer, c) => (c.type === "scale" ? answer / DA.scaleMax(c) : answer === "yes" ? 1 : 0);

  /* Доли ответов и выполнение одного критерия: набранные баллы от возможных, N/A не в счёт. */
  function cellStats(evs, criterionId) {
    const s = { yes: 0, partial: 0, no: 0, na: 0, flag: 0, earned: 0, possible: 0, cids: [], c: null };
    for (const ev of evs) {
      const hit = doneItem(ev, criterionId);
      if (!hit) continue;
      s.c = hit.c;
      s[DA.tone(hit.item.answer, hit.c)]++;
      s.cids.push(ev.conversationId);
      if (hit.item.answer !== "na") { s.earned += fraction(hit.item.answer, hit.c); s.possible++; }
    }
    s.n = s.cids.length;
    s.rate = s.possible ? s.earned / s.possible : null;
    return s;
  }

  /* Критерий с наименьшим выполнением. Если всё выполнено полностью, слабого места нет. */
  function weakest(cl, evs) {
    let worst = null;
    for (const c of cl.criteria) {
      if (c.type === "flag") continue;
      const s = cellStats(evs, c.id);
      if (s.rate != null && s.rate < 1 && (!worst || s.rate < worst.stats.rate)) worst = { c, stats: s };
    }
    return worst;
  }

  const average = (evs) => (evs.length ? evs.reduce((s, ev) => s + ev.total, 0) / evs.length : null);

  /* Имя оператора из его первой реплики. Казахское «мен Айбекпін» теряет окончание сказуемого. */
  const NAME_RULES = [
    { re: /[Мм]еня зовут\s+(\p{Lu}\p{Ll}+)/u },
    { re: /[Мм]енің атым\s+(\p{Lu}\p{Ll}+)/u },
    { re: /[Mm]y name is\s+(\p{Lu}\p{Ll}+)/u },
    { re: /(?<!\p{L})I['’]m\s+(\p{Lu}\p{Ll}+)/u },
    { re: /(?<!\p{L})[Яя]\s+(\p{Lu}\p{Ll}+)/u },
    { re: /(?<!\p{L})[Мм]ен\s+(\p{Lu}\p{Ll}+)/u, kz: true }
  ];
  const NOT_NAMES = new Set(["Вам", "Вас", "Вы", "Сейчас", "Сіз", "Сізге"]);
  const HIDDEN_NAME = /\[(?:имя скрыто|персональные данные скрыты|аты[\s-]*жөні жасырылған|аты жасырылған|есімі жасырылған|жеке (?:деректер|мәліметтер) жасырылған|name (?:hidden|redacted)|personal (?:data|information) (?:hidden|redacted))\]/iu;
  function operatorName(conv) {
    const first = conv.transcript.find((t) => t.speaker === "operator");
    if (!first) return null;
    for (const rule of NAME_RULES) {
      const m = first.text.match(rule.re);
      if (!m || NOT_NAMES.has(m[1])) continue;
      const name = rule.kz ? m[1].replace(/(мын|мін|пын|пін|бын|бін)$/u, "") : m[1];
      if (name.length > 1) return name;
    }
    return null;
  }

  function operators() {
    const byName = new Map();
    let botOnly = 0;
    for (const conv of Object.values(DA.state.conversations)) {
      const turns = conv.transcript.filter((t) => t.speaker === "operator");
      if (!turns.length) { botOnly++; continue; }
      const name = operatorName(conv);
      const kind = name ? "named" : turns.some((t) => HIDDEN_NAME.test(t.text)) ? "hidden" : "missing";
      const key = kind === "named" ? "name:" + name : kind;
      if (!byName.has(key)) byName.set(key, { name, kind, convs: [] });
      byName.get(key).convs.push(conv.conversation_id);
    }
    const evs = evaluated(), cl = DA.activeChecklist();
    const rows = [...byName.values()].map((op) => {
      op.convs.sort((a, b) => DA.state.numbers[a] - DA.state.numbers[b]);
      op.evs = evs.filter((ev) => op.convs.includes(ev.conversationId));
      op.avg = average(op.evs);
      op.weak = weakest(cl, op.evs);
      op.gross = op.evs.filter((ev) => ev.grossFlagged).length;
      return op;
    });
    const order = { named: 0, missing: 1, hidden: 2 };
    const shown = rows.filter((op) => op.evs.length || op.kind !== "named")
      .sort((a, b) => order[a.kind] - order[b.kind] || b.avg - a.avg || b.evs.length - a.evs.length);
    const hiddenConvs = rows.filter((op) => !op.evs.length && op.kind === "named").reduce((s, op) => s + op.convs.length, 0);
    return { shown, hiddenConvs, botOnly };
  }

  /* ---------- Мелкие элементы ---------- */
  const TONES = ["yes", "partial", "no", "na"];
  const toneLabel = (tone, c) => t(({ yes: c && c.type === "scale" ? "fullScore" : "yes", partial: "partial", no: "no", na: "na" })[tone]);

  function stackBar(parts, cls) {
    const total = parts.reduce((s, p) => s + p.n, 0);
    return h("div", { class: "da-ins-stack" + (cls ? " " + cls : ""), "aria-hidden": "true" },
      total ? parts.filter((p) => p.n).map((p) => h("i", { class: `t-${p.tone}`, style: { flexGrow: p.n } })) : null);
  }

  function convLink(cid, extra) {
    const conv = DA.state.conversations[cid];
    return h("a", { class: "da-ins-conv", href: `#/c/${encodeURIComponent(cid)}` + (extra || "") },
      h("b", { class: "da-num" }, `№ ${DA.convNumber(cid)}`),
      h("span", { class: "da-muted" }, DA.msg(() => `${DA.langLabel[conv.language]}, ${DA.channelLabel(conv).toLocaleLowerCase(DA.fmt.locale())}`)));
  }

  /* ---------- Качество ---------- */
  function quality(evs) {
    const cl = DA.activeChecklist();
    if (!evs.length) return emptyQuality();
    const cols = [{ key: null, evs }, ...LANGS.map((l) => ({ key: l, evs: evs.filter((ev) => DA.state.conversations[ev.conversationId].language === l) }))];
    const weak = weakest(cl, evs);

    const head = h("tr", {}, h("th", { scope: "col" }, m("criterion")),
      cols.map((col) => h("th", { scope: "col" }, DA.msg(() => col.key ? DA.langLabel[col.key] : t("all")), h("small", {}, col.evs.length ? m("conversations", { count: col.evs.length }) : m("noEvaluations")))));
    const body = [];
    let i = 0;
    for (const sec of cl.sections.slice().sort((a, b) => a.order - b.order)) {
      const crits = cl.criteria.filter((c) => c.sectionId === sec.id && c.type !== "flag").sort((a, b) => a.order - b.order);
      if (!crits.length) continue;
      body.push(h("tr", { class: "da-ins-sec" }, h("th", { colspan: cols.length + 1, scope: "colgroup" }, sec.title)));
      for (const c of crits) {
        body.push(h("tr", {},
          h("th", { scope: "row" }, h("span", {}, c.title), weak && weak.c.id === c.id ? h("span", { class: "da-ins-weak" }, m("weakPoint")) : null),
          cols.map((col) => h("td", {}, matrixCell(c, col, i++)))));
      }
    }
    const gross = cl.criteria.find((c) => c.type === "flag");
    const grossRow = gross ? h("tbody", { class: "da-ins-gross-row" }, h("tr", {},
      h("th", { scope: "row" }, gross.title),
      cols.map((col) => {
        const s = cellStats(col.evs, gross.id);
        if (!s.n) return h("td", {}, h("span", { class: "da-ins-dash" }, "—"));
        return h("td", {}, s.flag ? h("span", { class: "da-ins-flag" }, DA.icon("flag", 14), m("foundIn", { count: s.flag, total: s.n })) : h("span", { class: "da-muted" }, m("notFound")));
      }))) : null;

    return h("div", { class: "da-ins-quality" },
      h("div", { class: "da-ins-matrix-wrap" }, h("table", { class: "da-ins-matrix" }, h("thead", {}, head), h("tbody", {}, body), grossRow)));
  }

  function matrixCell(c, col, i) {
    const s = cellStats(col.evs, c.id);
    if (!s.n) return h("span", { class: "da-ins-dash", "aria-label": m("noEvaluations") }, "—");
    const href = col.key ? `#/?lang=${col.key}&state=done` : "#/?state=done";
    const cell = h("a", { class: "da-ins-cell", href, style: { "--i": i },
      "aria-label": m("cellLabel", () => ({ criterion: c.title, language: col.key ? DA.langLabel[col.key] : t("all"), result: s.rate == null ? t("na") : t("fulfilled", { rate: pct(s.rate) }) })) },
      h("span", { class: "da-ins-rate" + (s.rate == null ? " is-na" : "") }, s.rate == null ? m("na") : DA.msg(() => pct(s.rate))),
      stackBar(TONES.map((tone) => ({ tone, n: s[tone] }))));
    DA.hoverCard(cell, () => [
      h("div", { class: "da-hc-title" }, DA.msg(() => `${col.key ? DA.langLabel[col.key] : t("allLanguages")}: ${nConv(s.n)}. ${TONES.filter((tone) => s[tone]).map((tone) => `${toneLabel(tone, c)} ${s[tone]}`).join(", ")}`)),
      h("ul", { class: "da-hc-list" }, TONES.filter((tone) => s[tone]).map((tone) => h("li", {}, h("i", { class: `da-swatch t-${tone}` }), h("span", {}, DA.msg(() => toneLabel(tone, c))),
        h("b", {}, s.cids.filter((cid) => DA.tone(doneItem(DA.state.evaluations[cid], c.id).item.answer, c) === tone).map((cid) => `№ ${DA.convNumber(cid)}`).join(", "))))),
      h("p", { class: "da-hc-note" }, m("openConversations"))
    ]);
    return cell;
  }

  function totalsBlock(evs) {
    const counts = BUCKETS.map(([lo, hi]) => evs.filter((ev) => ev.total >= lo && (hi === 100 ? ev.total <= 100 : ev.total < hi + 1)).length);
    const max = Math.max(1, ...counts);
    return h("section", { class: "da-ins-block is-totals" },
      h("h2", {}, m("meanScore")),
      h("div", { class: "da-ins-big" }, DA.msg(() => DA.fmt.score(average(evs))), h("small", {}, m("of100"))),
      h("div", { class: "da-ins-hist", role: "img", "aria-label": m("distribution", { ranges: BUCKETS.map(([lo, hi], i) => `${lo}–${hi}: ${counts[i]}`).join(", ") }) },
        BUCKETS.map(([lo, hi], i) => h("div", { class: "da-ins-col" },
          h("b", { class: counts[i] ? "" : "da-quiet" }, counts[i]),
          h("i", { style: { height: `${(counts[i] / max) * 100}%`, "--i": i }, class: counts[i] ? "" : "is-zero" }),
          h("span", {}, `${lo}–${hi}`)))));
  }

  function grossBlock(evs) {
    const found = evs.filter((ev) => ev.grossFlagged);
    return h("section", { class: "da-ins-block" },
      h("h2", {}, m("grossErrors")),
      found.length
        ? h("div", { class: "da-ins-convs" }, found.map((ev) => convLink(ev.conversationId, "?criterion=gross")))
        : h("div", { class: "da-ins-clean" }, h("span", { class: "da-ins-ok" }, DA.icon("check", 16)),
          h("div", {}, h("b", {}, m("noGrossErrors")), h("p", {}, m("checked", { count: evs.length })))));
  }

  function appealsBlock() {
    const all = DA.state.appeals;
    const parts = [
      { tone: "confirmed", n: all.filter((a) => a.status === "confirmed").length, label: m("confirmed") },
      { tone: "changed", n: all.filter((a) => a.status === "changed").length, label: m("changed") },
      { tone: "open", n: all.filter((a) => a.status === "open").length, label: m("pending") }
    ];
    return h("section", { class: "da-ins-block" },
      h("h2", {}, m("appeals")),
      h("div", { class: "da-ins-big" }, all.length, h("small", {}, m("submitted", { count: all.length }))),
      all.length ? stackBar(parts, "is-appeals") : null,
      all.length
        ? h("ul", { class: "da-ins-legend" }, parts.map((p) => h("li", { class: p.n ? "" : "is-zero" }, h("i", { class: `da-ins-dot t-${p.tone}` }), h("span", {}, p.label), h("b", {}, p.n))))
        : h("p", { class: "da-muted da-small" }, m("noAppeals")),
      all.length ? h("a", { class: "da-btn is-text is-sm da-ins-more", href: "#/appeals" }, m("openAppeals")) : null);
  }

  function emptyQuality() {
    return h("div", { class: "da-empty" },
      h("div", { class: "da-empty-ribbon", "aria-hidden": "true" }, [10, 15, 20, 20, 15, 15, 5].map((w) => h("i", { style: { "--w": w } }))),
      h("h2", {}, m("emptyTitle")),
      h("p", {}, m("emptyHelp")),
      h("a", { class: "da-btn", href: "#/" }, m("backToList")));
  }

  /* ---------- Операторы ---------- */
  function operatorsView() {
    const { shown, hiddenConvs, botOnly } = operators();
    const list = h("div", { class: "da-ins-ops", role: "list" },
      h("div", { class: "da-ins-op-head", "aria-hidden": "true" },
        h("span", {}, m("operator")), h("span", {}, m("conversationColumn")), h("span", {}, m("meanScore")), h("span", {}, m("weakPoint")), h("span", {}, m("grossErrors"))),
      shown.map((op, i) => operatorRow(op, i)));
    return h("div", {}, shown.length ? list : emptyQuality(),
      botOnly ? h("p", { class: "da-ins-after" }, m("botClosed", { count: botOnly })) : null,
      hiddenConvs ? h("p", { class: "da-ins-after" }, m("awaitingEvaluation", { count: hiddenConvs })) : null);
  }

  function operatorRow(op, i) {
    const weakText = !op.weak ? null : op.weak.stats.possible >= 5
      ? m("fulfilledRate", () => ({ rate: pct(op.weak.stats.yes / op.weak.stats.possible) }))
      : m("fulfilledCount", { count: op.weak.stats.yes, total: op.weak.stats.possible });
    const panel = h("div", { class: "da-ins-op-panel", id: `da-op-${i}` },
      h("div", { class: "da-ins-op-inner" },
        op.convs.map((cid) => {
          const ev = DA.state.evaluations[cid];
          const conv = DA.state.conversations[cid];
          return h("a", { class: "da-ins-op-conv", href: `#/c/${encodeURIComponent(cid)}` },
            h("b", { class: "da-num" }, `№ ${DA.convNumber(cid)}`),
            h("span", { class: "da-ins-op-preview" }, DA.tx.preview(conv)),
            ev && !ev.stale && ev.total != null
              ? h("span", { class: "da-ins-op-total" }, ev.grossFlagged ? h("span", { class: "da-flag", title: m("grossError") }, DA.icon("flag", 14)) : null, DA.msg(() => DA.fmt.score(ev.total)))
              : h("span", { class: "da-quiet" }, m("notEvaluated")));
        })));
    const row = h("button", { class: "da-ins-op", type: "button", "aria-expanded": "false", "aria-controls": `da-op-${i}` },
      h("span", { class: "da-ins-op-name" },
        h("span", { class: "da-ins-chev" }, DA.icon("chevron", 16)),
        h("span", {}, h("b", { class: op.kind === "named" ? "" : "is-unnamed" },
          op.kind === "missing" ? h("span", { class: "da-review", title: m("missingNameHelp") }, DA.icon("alert", 16)) : null, op.kind === "named" ? op.name : m(op.kind === "hidden" ? "nameHidden" : "noIntroduction")),
          h("small", {}, m("evaluatedCount", { count: op.evs.length, total: op.convs.length })))),
      h("span", { class: "da-ins-op-n" }, h("i", { class: "da-ins-m" }, m("conversationColumn"), " "), op.convs.length),
      h("span", { class: "da-ins-op-avg" }, h("b", {}, DA.msg(() => DA.fmt.score(op.avg))), op.avg != null ? h("span", { class: "da-ins-meter" }, h("i", { style: { width: op.avg + "%", "--i": i } })) : null),
      h("span", { class: "da-ins-op-weak" }, op.kind === "missing" ? [h("b", {}, DA.activeChecklist().criteria.find((c) => c.id === "contact")?.title || m("contact")), h("small", {}, m("missingName"))] : op.weak ? [h("b", {}, op.weak.c.title), h("small", {}, weakText)] : h("span", { class: "da-quiet" }, m(op.evs.length ? "noWeakAreas" : "noEvaluations"))),
      h("span", { class: "da-ins-op-gross" }, op.gross ? h("span", { class: "da-ins-flag" }, DA.icon("flag", 14), op.gross) : h("span", { class: "da-quiet" }, m(op.evs.length ? "no" : "noEvaluations"))));
    if (op.kind === "missing") DA.hoverCard(row, () => m("missingNameHelp"));
    row.addEventListener("click", () => {
      const open = row.getAttribute("aria-expanded") !== "true";
      row.setAttribute("aria-expanded", String(open));
      wrap.classList.toggle("is-open", open);
    });
    const wrap = h("div", { class: "da-ins-op-wrap", role: "listitem" }, row, panel);
    return wrap;
  }

  function overview(evs) {
    const convs = Object.values(DA.state.conversations);
    const durations = convs.filter((c) => c.channel === "voice call").map((conv) => {
      const audio = DA.stt?.item(conv.conversation_id);
      const positive = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
      if (positive(audio?.audioSecondsDeclared)) return audio.audioSecondsDeclared;
      if (positive(audio?.audioSecondsDecoded)) return audio.audioSecondsDecoded;
      const seconds = DA.tx.duration(conv);
      return positive(seconds) ? seconds : null;
    }).filter((n) => n != null);
    const duration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
    const pending = DA.state.appeals.filter((a) => a.status === "open").length;
    const rate = convs.length ? evs.length / convs.length : 0;
    const metric = (label, value, help, extra) => h("section", { class: "da-ins-stat" },
      h("h3", {}, m(label)), h("div", { class: "da-ins-stat-value" }, value), extra || null, h("p", {}, help));
    return h("section", { class: "da-ins-dashboard" }, h("h2", {}, m("overviewTitle")),
      h("div", { class: "da-ins-stats" },
        metric("evaluatedLabel", `${evs.length} / ${convs.length}`, m("ofTotal", () => ({ rate: new Intl.NumberFormat(DA.fmt.locale(), { style: "percent", maximumFractionDigits: 1 }).format(rate) })),
          h("div", { class: "da-ins-progress", role: "progressbar", "aria-label": m("evaluatedLabel"), "aria-valuenow": evs.length, "aria-valuemin": 0, "aria-valuemax": convs.length || 1 }, h("i", { style: { width: `${rate * 100}%` } }))),
        metric("averageLabel", DA.msg(() => DA.fmt.score(average(evs))), m("of100")),
        metric("callDuration", duration == null ? "—" : `${String(Math.floor(duration / 60)).padStart(2, "0")}:${String(duration % 60).padStart(2, "0")}`,
          durations.length ? m("durationHelp", { count: durations.length }) : m("noData")),
        metric("pendingAppeals", h("a", { href: "#/appeals" }, pending), m(pending ? "decisionRequired" : "noPending"))));
  }

  function topicsView(report) {
    if (!report) return h("p", { role: "status" }, m("topicsLoading"));
    const rows = report.rows;
    if (!rows.length) return h("div", { class: "da-empty" }, h("h2", {}, m("noFrequentTopics")), h("p", {}, m("topicsRule")));
    const unknown = rows.reduce((sum, r) => sum + r.count - r.known, 0);
    const maxCount = Math.max(...rows.map((r) => r.count));
    const step = Math.max(1, Math.ceil(maxCount / 4));
    const countMax = step * 4;
    const chart = (resolved) => h("section", { class: "da-ins-chart" },
      h("h2", {}, m(resolved ? "resolvedShare" : "popularity")),
      h("div", { class: "da-ins-chart-plot" },
        rows.map((group) => {
          const done = group.resolved;
          const known = group.known > 0;
          const value = resolved ? done / group.count : group.count;
          const available = !resolved || known;
          const label = group.topic || m("topicMissing");
          return h("details", { class: "da-ins-chart-row", "data-topic": group.id + (resolved ? "-resolved" : "-count") },
            h("summary", {}, h("span", { class: "da-ins-chart-label" }, label),
              h("span", { class: "da-ins-chart-track" },
                available ? h("span", { class: "da-ins-chart-bar", style: { width: `${100 * value / (resolved ? 1 : countMax)}%` } }) : null,
                h("span", { class: "da-ins-chart-value" }, available ? DA.msg(() => resolved ? pct(value) : String(value)) : m("noData")))),
            h("div", { class: "da-ins-chart-detail" }, h("p", {}, resolved ? m("resolvedCount", { count: done, total: group.count }) : nConv(group.count)),
              h("div", { class: "da-ins-convs" }, group.conversationIds.filter((id) => DA.state.conversations[id]).map((id) => convLink(id)))));
        }),
        h("div", { class: "da-ins-chart-axis", "aria-hidden": "true" }, Array.from({ length: 5 }, (_, i) => h("span", {}, resolved ? `${i * 25}%` : String(i * step))))),
      h("p", { class: "da-ins-chart-caption" }, m(resolved ? "resolvedHelp" : "popularityHelp")),
      resolved && unknown ? h("p", { class: "da-ins-chart-caption" }, m("unknownResults", { count: unknown, total: rows.reduce((sum, r) => sum + r.count, 0) })) : null);
    return h("div", { class: "da-ins-topic-dashboard" }, chart(false), chart(true));
  }

  /* ---------- Экран ---------- */
  DA.views = DA.views || {};
  DA.views.insights = function mount(root, params) {
    let tab = TABS.some((t) => t.value === params.query.tab) ? params.query.tab : "overview";
    let topicReport = null, topicChannel = "all", topicError = null, topicLoading = false, starting = false, alive = true, timer = null, revision = 0;
    async function loadTopics() {
      const own = ++revision;
      topicLoading = true;
      try {
        const result = await DA.api.getTopics(topicChannel);
        if (!alive || own !== revision) return;
        topicReport = result;
        topicError = null;
      } catch (error) {
        if (!alive || own !== revision) return;
        topicError = error;
      } finally {
        if (alive && own === revision) {
          topicLoading = false;
          render();
          clearTimeout(timer);
          if (topicReport?.job.status === "running" && !topicError) timer = setTimeout(loadTopics, 2000);
        }
      }
    }
    async function startTopics() {
      starting = true; topicError = null; render();
      try { await DA.api.analyzeTopics(); }
      catch (error) { if (alive) topicError = error; }
      starting = false;
      if (!alive) return;
      if (topicError) render(); else loadTopics();
    }
    const topicChannelSeg = DA.segmented(["all", "calls", "chats"].map((value) => ({ value, label: m(value) })), topicChannel, (v) => {
      topicChannel = v; topicReport = null; loadTopics(); render();
    }, m("section"));
    function topicPanel() {
      const running = starting || topicReport?.job.status === "running";
      return h("div", { class: "da-ins-topic-panel" },
        h("div", { class: "da-ins-topic-controls" },
          topicChannelSeg,
          h("button", { class: "da-btn is-primary", type: "button", disabled: running || topicLoading, onclick: startTopics }, m(running ? "analyzingTopics" : "analyzeTopics"))),
        topicError ? h("p", { role: "alert", class: "da-review" }, DA.apiErrorMessage(topicError)) : null,
        topicReport?.job.error ? h("p", { role: "alert", class: "da-review" }, topicReport.job.error) : null,
        topicsView(topicReport));
    }
    const body = h("div", { class: "da-ins-body" });
    const seg = DA.segmented(TABS, tab, (v) => {
      tab = v;
      history.replaceState(null, "", v === "overview" ? "#/insights" : `#/insights?tab=${v}`);
      render();
      if (tab === "topics") loadTopics();
    }, m("section"));

    function coverage(evs) {
      const total = Object.keys(DA.state.conversations).length;
      return h("div", { class: "da-ins-cover" },
        h("span", {}, m("coverage", { count: evs.length, total })),
        evs.length < total ? h("span", { class: "da-ins-cover-bar", "aria-hidden": "true" }, h("i", { style: { width: (evs.length / total) * 100 + "%" } })) : null);
    }

    function render() {
      const openTopics = new Set([...body.querySelectorAll("details[data-topic][open]")].map((node) => node.dataset.topic));
      const focusedTopic = body.contains(document.activeElement) ? document.activeElement.closest("details[data-topic]")?.dataset.topic : null;
      const evs = evaluated();
      const view = tab === "quality" ? quality(evs) : tab === "topics" ? topicPanel() : overview(evs);
      body.replaceChildren(...(tab === "quality" ? [coverage(evs)] : []), h("div", { class: "da-ins-tab", "data-tab": tab }, view));
      body.querySelectorAll("details[data-topic]").forEach((node) => {
        node.open = openTopics.has(node.dataset.topic);
        if (focusedTopic === node.dataset.topic) node.querySelector("summary").focus({ preventScroll: true });
      });
    }

    root.append(h("div", { class: "da-page da-ins" },
      h("div", { class: "da-page-head da-ins-head" }, h("h1", { class: "da-h1", tabindex: -1 }, m("title")), seg),
      body));
    render();
    if (tab === "topics") loadTopics();
    window.addEventListener("da:appeals-changed", render);
    window.addEventListener("da:stt-changed", render);
    return () => {
      alive = false; clearTimeout(timer); revision++;
      window.removeEventListener("da:appeals-changed", render);
      window.removeEventListener("da:stt-changed", render);
    };
  };
})();
