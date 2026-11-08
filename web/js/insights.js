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
    unknownResults: ["Без подтверждённого результата: {count} из {total}", "Расталған нәтижесіз: {count} / {total}", "Without a confirmed outcome: {count} of {total}"],
    resolvedCount: ["Решено {count} из {total}", "Шешілгені: {count} / {total}", "Resolved {count} of {total}"]
  }).map(([key, values]) => ["insights." + key, { ru: values[0], kk: values[1], en: values[2] }])));


  DA.i18n.addMessages(Object.fromEntries(Object.entries({
    quality: ["Критерии", "Критерийлер", "Criteria"], overview: ["Обзор", "Шолу", "Overview"], topics: ["Темы", "Тақырыптар", "Topics"],
    from: ["С даты", "Басталу күні", "From date"], to: ["По дату включительно", "Соңғы күнді қоса", "Through date"],
    channel: ["Канал", "Арна", "Channel"], language: ["Язык", "Тіл", "Language"], version: ["Версия чек-листа", "Чек-лист нұсқасы", "Checklist version"],
    activeVersion: ["Активная версия", "Белсенді нұсқа", "Active version"], apply: ["Применить", "Қолдану", "Apply"], reset: ["Сбросить", "Тазалау", "Reset"],
    selectedValues: ["Выбрано несколько", "Бірнешеуі таңдалды", "Multiple selected"], scopeLabel: ["Область сводки", "Жиынтық ауқымы", "Summary scope"],
    scopeCount: ["{count} обращений в выборке", "Таңдауда {count} өтініш", "{count} conversations in scope"],
    extraFilters: ["Есть дополнительные условия из реестра", "Тізілімнен қосымша шарттар бар", "Additional registry filters applied"],
    invalidScope: ["Проверьте условия выборки. Начало диапазона не должно быть позже конца.", "Таңдау шарттарын тексеріңіз. Басталуы аяқталуынан кейін болмауы тиіс.", "Check the selection. The range must start before it ends."],
    loading: ["Загружаем сводку…", "Жиынтық жүктелуде…", "Loading summary…"], loadFailed: ["Не удалось загрузить сводку", "Жиынтық жүктелмеді", "Could not load the summary"], retry: ["Повторить", "Қайталау", "Retry"],
    noMatches: ["В этой выборке нет обращений", "Бұл таңдауда өтініштер жоқ", "No conversations in this selection"],
    noMatchesHelp: ["Измените период или другие условия выборки.", "Кезеңді немесе басқа таңдау шарттарын өзгертіңіз.", "Change the period or other selection filters."],
    topicCoverage: ["Темы проанализированы: {count} из {total}", "Тақырыптар талданды: {count} / {total}", "Topics analyzed: {count} of {total}"],
    importedDates: ["У {count} обращений вместо даты разговора используется дата загрузки", "{count} өтініште сөйлесу күні орнына жүктеу күні қолданылған", "{count} conversations use the import date instead of the conversation date"],
    unknownDates: ["Без даты: {count}", "Күні жоқ: {count}", "Without a date: {count}"],
    savedScore: ["Сохранённая оценка", "Сақталған баға", "Saved score"], attentionTitle: ["Требуют разбора", "Талдауды қажет етеді", "Need review"],
    scoredCount: ["В среднем учтено: {count}", "Орташаға кіргені: {count}", "Scores included in mean: {count}"],
    reviewSelection: ["Открыть обращения для разбора", "Талдауға арналған өтініштерді ашу", "Open conversations to review"],
    explain: ["Обсудить с ассистентом", "Көмекшімен талқылау", "Discuss with assistant"],
    explainPrompt: ["Что стоит разобрать в этой выборке и почему? Покажи источники и предложи порядок работы.", "Бұл таңдауда нені және неге талдау керек? Дереккөздерді көрсетіп, жұмыс ретін ұсын.", "What should we review in this selection and why? Show sources and suggest an order of work."],
    reviewReasons: ["Поводы для разбора", "Талдау себептері", "Reasons to review"], lowScore: ["Оценка ниже {score}", "Баға {score} ұпайдан төмен", "Score below {score}"],
    manualReview: ["Ответы требуют проверки", "Жауаптарды тексеру қажет", "Answers need review"], unresolved: ["Вопрос не решён", "Мәселе шешілмеген", "Issue unresolved"],
    failedEvaluations: ["Оценка завершилась ошибкой", "Бағалау қатемен аяқталды", "Evaluation failed"],
    noReview: ["В этой выборке нет отмеченных поводов для разбора", "Бұл таңдауда талдау себептері белгіленбеген", "No review reasons are flagged in this selection"],
    reasonOverlap: ["Одно обращение может иметь несколько поводов", "Бір өтініште бірнеше себеп болуы мүмкін", "A conversation can have several reasons"],
    coveragePending: ["Без готовой оценки: {count}", "Дайын бағасы жоқ: {count}", "Without a completed evaluation: {count}"],
    coverageRunning: ["Оценивается: {count}", "Бағалануда: {count}", "Evaluating: {count}"], coverageStale: ["Устаревшие оценки: {count}", "Ескірген бағалар: {count}", "Outdated evaluations: {count}"],
    periodTitle: ["Сравнение периодов", "Кезеңдерді салыстыру", "Period comparison"],
    period_not_selected: ["Выберите обе даты. Сравним с предыдущим периодом такой же длины.", "Екі күнді де таңдаңыз. Ұзақтығы бірдей алдыңғы кезеңмен салыстырамыз.", "Select both dates to compare with the preceding period of equal length."],
    import_dates: ["Сравнение недоступно: часть дат относится к загрузке, а не к разговору.", "Салыстыру қолжетімсіз: кейбір күндер сөйлесуге емес, жүктеуге қатысты.", "Comparison is unavailable because some dates refer to imports, not conversations."],
    insufficient_data: ["Для сравнения нужно не менее 5 готовых оценок в каждом периоде по одной версии чек-листа.", "Салыстыру үшін әр кезеңде бір чек-лист нұсқасы бойынша кемінде 5 дайын баға қажет.", "Comparison needs at least 5 completed evaluations in each period using the same checklist version."],
    currentPeriod: ["Выбранный период", "Таңдалған кезең", "Selected period"], previousPeriod: ["Предыдущий период", "Алдыңғы кезең", "Previous period"],
    scoreChange: ["Изменение среднего: {value} балла", "Орташа баға өзгерісі: {value} ұпай", "Average score change: {value} points"],
    weakCriteria: ["Где теряются баллы", "Ұпай қай жерде жоғалады", "Where scores are lost"],
    applicable: ["Применимо: {count}", "Қолданылады: {count}", "Applicable: {count}"], missingAnswers: ["Нет ответа: {count}", "Жауабы жоқ: {count}", "Missing: {count}"], notApplicable: ["N/A: {count}", "N/A: {count}", "N/A: {count}"],
    belowTarget: ["Потеря баллов: {count} из {total}", "Ұпай жоғалуы: {count} / {total}", "Lost points: {count} of {total}"],
    noWeakCriteria: ["По применимым ответам потерь баллов нет", "Қолданылатын жауаптарда ұпай жоғалуы жоқ", "No lost points in the applicable answers"],
    allCriteria: ["Все критерии", "Барлық критерийлер", "All criteria"], allTopics: ["Все темы", "Барлық тақырыптар", "All topics"],
    topicIssues: ["Темы с нерешёнными вопросами", "Шешілмеген мәселелері бар тақырыптар", "Topics with unresolved issues"],
    noTopicIssues: ["Подтверждённых нерешённых вопросов в проанализированных темах нет", "Талданған тақырыптарда расталған шешілмеген мәселелер жоқ", "No confirmed unresolved issues in the analyzed topics"],
    topicName: ["Тема обращения", "Өтініш тақырыбы", "Conversation topic"], resolved: ["Решено", "Шешілді", "Resolved"], unknown: ["Исход неизвестен", "Нәтижесі белгісіз", "Outcome unknown"],
    knownResults: ["Решено {resolved} из {known} с известным исходом", "Нәтижесі белгілі {known} өтініштің {resolved} шешілді", "Resolved {resolved} of {known} with known outcomes"],
    noKnownResults: ["Подтверждённых исходов нет", "Расталған нәтижелер жоқ", "No confirmed outcomes"],
    outcomeCounts: ["Не решено: {unresolved}; неизвестно: {unknown}", "Шешілмеген: {unresolved}; белгісіз: {unknown}", "Unresolved: {unresolved}; unknown: {unknown}"],
    rareTopics: ["Редкие темы ({count})", "Сирек тақырыптар ({count})", "Rare topics ({count})"],
    noTopics: ["В этой выборке ещё нет определённых тем", "Бұл таңдауда анықталған тақырыптар әлі жоқ", "No identified topics in this selection yet"],
    topicPending: ["Ожидают анализа: {count}", "Талдауды күтуде: {count}", "Awaiting analysis: {count}"],
    unclearTopics: ["После анализа тема не определена: {count}", "Талдаудан кейін тақырып анықталмады: {count}", "Topic unidentified after analysis: {count}"],
    analyzeTopics: ["Определить темы ({count})", "Тақырыптарды анықтау ({count})", "Identify topics ({count})"], analyzingTopics: ["Определяем темы…", "Тақырыптар анықталуда…", "Identifying topics…"],
    topicsQueued: ["Анализ тем в очереди", "Тақырыптарды талдау кезекте", "Topic analysis queued"],
    topicQueuedHelp: ["Задача принята и ожидает обработки. Сводка обновится автоматически.", "Тапсырма қабылданды және өңдеуді күтуде. Жиынтық автоматты түрде жаңарады.", "The task is accepted and waiting to be processed. The summary will update automatically."],
    topicsComplete: ["Все обращения этой выборки проанализированы", "Осы таңдаудың барлық өтініштері талданды", "Every conversation in this selection has been analyzed"],
    topicJobRunning: ["Идёт анализ тем. Сводка обновится автоматически.", "Тақырыптар талданып жатыр. Жиынтық автоматты түрде жаңарады.", "Topic analysis is running. The summary will update automatically."],
    topicJobElsewhere: ["Сейчас анализируется другая выборка. Дождитесь завершения, чтобы запустить эту.", "Қазір басқа таңдау талданып жатыр. Осыны бастау үшін аяқталуын күтіңіз.", "Another selection is being analyzed. Wait for it to finish before starting this one."],
    missingIdentity: ["Имя не определено", "Аты анықталмаған", "Name not identified"], botOnly: ["Без реплик оператора", "Оператор репликалары жоқ", "No agent turns"],
    viewConversations: ["Показать обращения ({count})", "Өтініштерді көрсету ({count})", "Show conversations ({count})"],
    durationAudio: ["По аудио: {count} звонков", "Аудио бойынша: {count} қоңырау", "From audio: {count} calls"],
    durationTranscript: ["По меткам реплик: {count} звонков", "Реплика уақыттары бойынша: {count} қоңырау", "From turn timestamps: {count} calls"],
    durationMixed: ["По аудио и меткам реплик: {count} звонков", "Аудио және реплика уақыттары бойынша: {count} қоңырау", "From audio and turn timestamps: {count} calls"],
    appealCount: ["{count} апелляций в {conversations} обращениях", "{conversations} өтініште {count} апелляция", "{count} appeals in {conversations} conversations"]
  }).map(([key, values]) => ["insights." + key, { ru: values[0], kk: values[1], en: values[2] }])));
  DA.i18n.addMessages(Object.fromEntries(Object.entries({
    quality: ["Качество", "Сапа", "Quality"], overview: ["Общая сводка", "Жалпы жиынтық", "General summary"],
    topics: ["Анализ тем обращений", "Өтініш тақырыптарын талдау", "Conversation topics"],
    scopeCount: ["{count} обращений", "{count} өтініш", "{count} conversations"], scopeLabel: ["Фильтры сводки", "Жиынтық сүзгілері", "Summary filters"],
    versionNumber: ["Версия {number}", "{number}-нұсқа", "Version {number}"], versionRules: ["Что проверяем", "Нені тексереміз", "What is assessed"],
    active: ["Текущая", "Ағымдағы", "Current"], criterionCount: ["Критериев: {count}", "Критерийлер: {count}", "Criteria: {count}"],
    allChannels: ["Все каналы", "Барлық арналар", "All channels"], allTime: ["За всё время", "Барлық уақыт", "All time"],
    period: ["Период", "Кезең", "Period"], cancel: ["Отмена", "Бас тарту", "Cancel"], dateFormat: ["ДД.ММ.ГГГГ", "КК.АА.ЖЖЖЖ", "DD.MM.YYYY"],
    previousMonth: ["Предыдущий месяц", "Алдыңғы ай", "Previous month"], nextMonth: ["Следующий месяц", "Келесі ай", "Next month"],
    from: ["С", "Бастап", "From"], to: ["По", "Дейін", "To"],
    invalidScope: ["Укажите даты в формате ДД.ММ.ГГГГ. Начало не должно быть позже конца.", "Күндерді КК.АА.ЖЖЖЖ пішімінде көрсетіңіз. Басталуы аяқталуынан кейін болмауы тиіс.", "Use DD.MM.YYYY dates. The start must not be after the end."],
    extraFilters: ["Дополнительные фильтры", "Қосымша сүзгілер", "Additional filters"],
    explain: ["Спросить ассистента", "Көмекшіден сұрау", "Ask assistant"],
    explainPrompt: ["Какие из этих обращений стоит разобрать и почему? Покажи источники.", "Осы өтініштердің қайсысын және неге талдау керек? Дереккөздерді көрсет.", "Which of these conversations should we review and why? Show sources."],
    noMatches: ["Обращения не найдены", "Өтініштер табылмады", "No conversations found"], noMatchesHelp: ["Измените период или фильтры.", "Кезеңді немесе сүзгілерді өзгертіңіз.", "Change the period or filters."],
    noTopics: ["Темы пока не определены", "Тақырыптар әлі анықталмаған", "Topics have not been identified yet"],
    noReview: ["Поводов для разбора не найдено", "Талдау себептері табылмады", "No review reasons found"],
    reviewSelection: ["Открыть обращения для разбора", "Талдауға арналған өтініштерді ашу", "Open conversations to review"],
    scoreN: ["По {count} оценкам", "{count} баға бойынша", "From {count} scores"],
    pendingAppealsShort: ["На рассмотрении", "Қаралуда", "Under review"],
    topicOutcomeShort: ["Решено {resolved}, не решено {unresolved}, неизвестно {unknown}", "Шешілгені {resolved}, шешілмегені {unresolved}, белгісізі {unknown}", "Resolved {resolved}, unresolved {unresolved}, unknown {unknown}"],
    unknownShort: ["Неизвестно: {count}", "Белгісіз: {count}", "Unknown: {count}"],
    importedDatesShort: ["Даты загрузки у {count} обращений", "{count} өтініште жүктеу күні", "{count} conversations use import dates"],
    topicJobElsewhere: ["Сейчас анализируются другие обращения. Можно будет продолжить после завершения.", "Қазір басқа өтініштер талданып жатыр. Аяқталғаннан кейін жалғастыруға болады.", "Other conversations are being analyzed. You can continue when that finishes."]
  }).map(([key, values]) => ["insights." + key, { ru: values[0], kk: values[1], en: values[2] }])));
  DA.i18n.addMessages(Object.fromEntries(Object.entries({
    open: ["Открыть", "Ашу", "Open"], openOperator: ["Открыть оператора: {name}", "Операторды ашу: {name}", "Open agent: {name}"],
    backOperators: ["Все операторы", "Барлық операторлар", "All agents"],
    operatorMissing: ["У этого оператора нет обращений по выбранным фильтрам", "Бұл операторда таңдалған сүзгілерге сай өтініштер жоқ", "This agent has no conversations matching these filters"],
    operatorCriteria: ["На что обратить внимание", "Неге назар аудару керек", "What needs attention"],
    completion: ["Выполнение", "Орындалуы", "Completion"], reviewConversations: ["Обращения для разбора", "Талдауға арналған өтініштер", "Conversations to review"],
    operatorConversations: ["Обращения оператора", "Оператордың өтініштері", "Agent conversations"],
    number: ["№", "№", "No."], date: ["Дата", "Күні", "Date"], subject: ["С чем обратились", "Өтініш тақырыбы", "Customer request"],
    score: ["Итог", "Қорытынды", "Score"], pages: ["Страницы", "Беттер", "Pages"], perPage: ["На странице", "Бетте", "Per page"],
    pageSize: ["Записей на странице", "Беттегі жазбалар", "Rows per page"], page: ["Страница {number}", "{number}-бет", "Page {number}"],
    shownRange: ["Показаны {from}–{to} из {total}", "{total} жазбаның {from}–{to} аралығы көрсетілген", "Showing {from}–{to} of {total}"],
    shownAll: ["Всего: {count}", "Барлығы: {count}", "Total: {count}"],
    callRecord: ["Звонок", "Қоңырау", "Call"], chatRecord: ["Чат", "Чат", "Chat"],
    previous: ["Назад", "Алдыңғы", "Previous"], next: ["Вперёд", "Келесі", "Next"],
    knownResults: ["Решено: {resolved} из {known}", "Шешілді: {resolved} / {known}", "Resolved: {resolved} of {known}"],
    unclearTopics: ["Без темы: {count}", "Тақырыпсыз: {count}", "Without a topic: {count}"],
    callsCount: ["Звонков: {count}", "Қоңыраулар: {count}", "Calls: {count}"],
    period_not_selected: ["Выберите период для сравнения", "Салыстыру кезеңін таңдаңыз", "Select a period to compare"],
    import_dates: ["Даты разговоров известны не для всех обращений", "Барлық өтініштің сөйлесу күні белгілі емес", "Some conversations have no conversation date"],
    insufficient_data: ["Недостаточно оценок для сравнения", "Салыстыру үшін баға жеткіліксіз", "Not enough evaluations to compare"],
    topicJobElsewhere: ["Сейчас анализируются другие обращения", "Қазір басқа өтініштер талданып жатыр", "Other conversations are being analyzed"],
    topicProgressCount: ["{count} из {total}", "{total} ішінен {count}", "{count} of {total}"],
    topicAnalysisFinished: ["Анализ тем завершён", "Тақырыптарды талдау аяқталды", "Topic analysis finished"],
    topicAnalysisFailed: ["Анализ тем завершён с ошибками", "Тақырыптарды талдау қателермен аяқталды", "Topic analysis finished with errors"],
    topicList: ["Темы обращений", "Өтініш тақырыптары", "Conversation topics"],
    topicName: ["Тема обращения", "Өтініш тақырыбы", "Topic"],
    topicResolved: ["Решено", "Шешілген", "Resolved"],
    topicUnresolved: ["Без решения", "Шешілмеген", "Unresolved"],
    topicUnknown: ["Результат неизвестен", "Нәтижесі белгісіз", "Outcome unknown"],
    topicOrder: ["Порядок тем", "Тақырыптар реті", "Topic order"],
    topicSortReview: ["Сначала без решения", "Алдымен шешілмегендері", "Most unresolved first"],
    topicSortVolume: ["Сначала частые", "Алдымен жиі кездесетіндері", "Most frequent first"],
    topicSortName: ["По названию", "Атауы бойынша", "By name"],
    topicUnassigned: ["Без определённой темы: {count}", "Тақырыбы анықталмаған: {count}", "Without an identified topic: {count}"],
    topicNoRare: ["Редких тем в этой выборке нет", "Бұл таңдауда сирек тақырыптар жоқ", "No rare topics in this selection"],
    topicOpen: ["Открыть обращения по теме «{topic}»", "«{topic}» тақырыбы бойынша өтініштерді ашу", "Open conversations about {topic}"],
    topicOutcomeLink: ["{topic}: {outcome}, обращений: {count}", "{topic}: {outcome}, өтініштер: {count}", "{topic}: {outcome}, conversations: {count}"],
    topicResolvedRate: ["Решено {resolved} из {known} обращений с известным результатом ({rate})", "Нәтижесі белгілі {known} өтініштің {resolved} шешілген ({rate})", "Resolved {resolved} of {known} conversations with a known outcome ({rate})"]
  }).map(([key, values]) => ["insights." + key, { ru: values[0], kk: values[1], en: values[2] }])));
  const TABS = ["overview", "quality", "topics", "operators"], LANGS = ["RU", "KZ", "EN"];
  const recordChannelKey = (channel) => channel === "voice call" ? "callRecord" : "chatRecord";
  const pct = (value) => new Intl.NumberFormat(DA.fmt.locale(), { style: "percent", maximumFractionDigits: 0 }).format(value);
  const score = (value) => value == null ? m("noData") : DA.msg(() => DA.fmt.score(value));
  const note = (value) => h("p", { class: "da-ins-note" }, value);
  function selectionLink(report, ids, label, cls, overrides) {
    return h("a", { class: cls || "da-ins-text-link", href: DA.registryFilters.href({ ...report.scope.filters, ...overrides, conversationIds: ids }) }, label);
  }
  function duration(value) {
    if (value == null) return m("noData");
    const seconds = Math.round(value);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function sourceLink(report, id) {
    const row = report.conversations.find((item) => item.conversationId === id);
    if (!row) return null;
    const query = row.evaluationId ? new URLSearchParams({ evaluation: row.evaluationId }).toString() : "";
    return h("a", { class: "da-ins-op-conv", href: `#/c/${encodeURIComponent(id)}` + (query ? "?" + query : "") },
      h("b", { class: "da-num" }, `№ ${row.number}`), h("span", { class: "da-ins-op-preview" }, row.preview),
      h("span", { class: "da-ins-source-score" }, score(row.total)));
  }
  function sourceList(report, ids) {
    return h("div", { class: "da-ins-source-list" }, ids.slice(0, 8).map((id) => sourceLink(report, id)),
      selectionLink(report, ids, m("viewConversations", { count: ids.length })));
  }
  function stackBar(parts, cls) {
    return h("div", { class: "da-ins-stack" + (cls ? " " + cls : ""), "aria-hidden": "true" },
      parts.filter((part) => part.n > 0).map((part) => h("i", { class: "t-" + part.tone, style: { flexGrow: part.n } })));
  }
  function criterionMetric(report, criterion, cell, language, index) {
    if (!cell.assessed) return h("span", { class: "da-ins-dash", title: m("missingAnswers", { count: cell.missing }) }, m("noData"));
    const ids = cell.belowTargetIds.length ? cell.belowTargetIds : cell.conversationIds;
    const label = criterion.type === "flag" ? cell.flaggedCount ? m("foundIn", { count: cell.flaggedCount, total: cell.applicable }) : m("notFound")
      : cell.avgFraction == null ? m("na") : DA.msg(() => pct(cell.avgFraction));
    const counts = cell.answerCounts || {};
    const parts = ["yes", "partial", "no", "na"].map((tone) => ({ tone, n: counts[tone] || 0 }));
    const link = selectionLink(report, ids, criterion.type === "flag"
      ? h("span", { class: cell.flaggedCount ? "da-ins-flag" : "da-muted" }, cell.flaggedCount ? DA.icon("flag", 14) : null, label)
      : [h("span", { class: "da-ins-rate" + (cell.avgFraction == null ? " is-na" : "") }, label), stackBar(parts)],
      criterion.type === "flag" ? "da-ins-flag-link" : "da-ins-cell");
    link.style.setProperty("--i", index);
    const detail = () => [h("div", { class: "da-hc-title" }, criterion.title),
      h("p", { class: "da-hc-note" }, m("applicable", { count: cell.applicable }), ". ", m("notApplicable", { count: cell.na }), ". ", m("missingAnswers", { count: cell.missing })),
      h("ul", { class: "da-hc-list" }, parts.filter((part) => part.n).map((part) => h("li", {},
        h("i", { class: "da-swatch t-" + (criterion.type === "flag" && part.tone === "yes" ? "no" : criterion.type === "flag" && part.tone === "no" ? "yes" : part.tone) }), h("span", {}, m(part.tone === "yes" && criterion.type === "scale" ? "fullScore" : part.tone)),
        h("b", {}, part.n), h("small", {}, (cell.answerIds?.[part.tone] || []).map((id) => `№ ${report.conversations.find((row) => row.conversationId === id)?.number || id}`).join(", ")))))];
    DA.hoverCard?.(link, detail);
    link.setAttribute("aria-label", t("cellLabel", { criterion: criterion.title, language: language ? DA.langLabel[language] : t("allLanguages"), result: criterion.type === "flag" ? t("foundIn", { count: cell.flaggedCount, total: cell.applicable }) : cell.avgFraction == null ? t("na") : pct(cell.avgFraction) }));
    return link;
  }
  function quality(report) {
    if (!report.coverage.evaluated) return h("div", { class: "da-empty" }, h("h2", {}, m("noEvaluations")),
      selectionLink(report, report.scope.conversationIds, m("backToList"), "da-btn"));
    const languages = report.scope.filters.languages || [];
    const cols = [null, ...LANGS.filter((lang) => !languages.length || languages.includes(lang))];
    const criteria = report.criteria.filter((row) => row.type !== "flag").slice().sort((a,b) => (a.sectionOrder || 0) - (b.sectionOrder || 0) || (a.order || 0) - (b.order || 0));
    const weak = criteria.filter((row) => row.avgFraction != null && row.avgFraction < 1).slice().sort((a,b) => a.avgFraction - b.avgFraction)[0];
    const rows = []; let section = null, index = 0;
    for (const criterion of criteria) {
      if (criterion.sectionTitle && criterion.sectionId !== section) { section = criterion.sectionId;
        rows.push(h("tr", { class: "da-ins-sec" }, h("th", { scope: "colgroup", colspan: cols.length + 1 }, criterion.sectionTitle))); }
      rows.push(h("tr", {}, h("th", { scope: "row" }, h("span", {}, criterion.title), weak?.id === criterion.id ? h("span", { class: "da-ins-weak" }, m("weakPoint")) : null),
        cols.map((lang) => h("td", {}, criterionMetric(report, criterion, lang ? criterion.byLanguage[lang] : criterion, lang, index++)))));
    }
    const head = h("thead", {}, h("tr", {}, h("th", { scope: "col" }, m("criterion")), cols.map((lang) => {
      const count = lang ? report.conversations.filter((row) => row.language === lang && row.qualityEvaluationId).length : report.coverage.evaluated;
      return h("th", { scope: "col" }, DA.msg(() => lang ? DA.langLabel[lang] : t("all")), h("small", {}, m("conversations", { count })));
    })));
    const flags = report.criteria.filter((row) => row.type === "flag");
    return h("div", { class: "da-ins-quality" },
      h("div", { class: "da-ins-matrix-wrap" }, h("table", { class: "da-ins-matrix" }, head, h("tbody", {}, rows),
        flags.length ? h("tbody", { class: "da-ins-gross-row" }, flags.map((criterion) => h("tr", {}, h("th", { scope: "row" }, criterion.title), cols.map((lang) => h("td", {}, criterionMetric(report, criterion, lang ? criterion.byLanguage[lang] : criterion, lang, index++)))))) : null)),
      h("div", { class: "da-ins-trio" }, totalsBlock(report), grossBlock(report), appealsBlock(report)));
  }
  function totalsBlock(report) {
    const buckets = [[0,49],[50,69],[70,84],[85,100]], rows = report.conversations.filter((row) => row.total != null);
    const counts = buckets.map(([lo,hi]) => rows.filter((row) => row.total >= lo && (hi === 100 ? row.total <= hi : row.total < hi + 1)).length), max = Math.max(1,...counts);
    return h("section", { class: "da-ins-block is-totals" }, h("h2", {}, m("meanScore")),
      h("div", { class: "da-ins-big", title: m("scoreN", { count: report.overview.scoredCount }) }, score(report.overview.avgScore), h("small", {}, m("of100"))),
      h("div", { class: "da-ins-hist", role: "img", "aria-label": m("distribution", { ranges: buckets.map(([lo,hi],i) => `${lo}–${hi}: ${counts[i]}`).join(", ") }) },
        buckets.map(([lo,hi],i) => h("div", { class: "da-ins-col" }, h("b", { class: counts[i] ? "" : "da-quiet" }, counts[i]),
          h("i", { class: counts[i] ? "" : "is-zero", style: { height: `${counts[i] / max * 100}%`, "--i": i } }), h("span", {}, `${lo}–${hi}`)))));
  }
  function grossBlock(report) {
    const ids = report.overview.drilldowns.gross;
    return h("section", { class: "da-ins-block" }, h("h2", {}, m("grossErrors")), ids.length ? h("div", { class: "da-ins-convs" }, ids.map((id) => {
      const row = report.conversations.find((item) => item.conversationId === id);
      return h("a", { class: "da-ins-conv", href: `#/c/${encodeURIComponent(id)}?evaluation=${encodeURIComponent(row.evaluationId)}` }, h("b", { class: "da-num" }, `№ ${row.number}`),
        h("span", { class: "da-muted" }, DA.msg(() => `${DA.langLabel[row.language] || row.language}, ${t(recordChannelKey(row.channel)).toLocaleLowerCase(DA.fmt.locale())}`)));
    })) : h("div", { class: "da-ins-clean" }, h("span", { class: "da-ins-ok" }, DA.icon("check",16)), h("div", {}, h("b", {}, m("noGrossErrors")), h("p", {}, m("checked", { count: report.coverage.evaluated })))));
  }
  function appealsBlock(report) {
    const data = report.overview.appeals;
    const parts = data ? ["confirmed","changed","open"].map((tone) => ({ tone, n: data[tone], label: m(tone === "open" ? "pending" : tone) })) : [];
    return h("section", { class: "da-ins-block" }, h("h2", {}, m("appeals")),
      h("div", { class: "da-ins-big" }, data ? data.total : report.overview.openAppealCount, h("small", {}, m(data ? "submitted" : "pendingAppealsShort", { count: data?.total }))),
      data?.total ? [stackBar(parts,"is-appeals"), h("ul", { class: "da-ins-legend" }, parts.map((part) => h("li", { class: part.n ? "" : "is-zero" }, h("i", { class: "da-ins-dot t-" + part.tone }),
        h("span", {}, part.label), part.n ? selectionLink(report,data[part.tone + "Ids"],part.n) : h("b",{},0))))] : h("p", { class: "da-muted da-small" }, m("noAppeals")),
      data?.total || report.overview.openAppealCount ? h("a", { class: "da-btn is-text is-sm da-ins-more", href: "#/appeals" }, m("openAppeals")) : null);
  }
  function periodView(report) {
    const period = report.periodComparison;
    const rowView = (key,row) => row ? h("div", { class: "da-ins-period-row" }, h("div", {}, h("b", {}, m(key)), h("span", {}, `${row.dateFrom} – ${row.dateTo}`)),
      h("strong", { title: m("scoreN", { count: row.scoredCount }) }, score(row.avgScore)), selectionLink(report,row.conversationIds,m("evaluatedCount", { count: row.evaluated, total: row.count }),null,{ dateFrom: row.dateFrom, dateTo: row.dateTo })) : null;
    return h("section", { class: "da-ins-extra-section" }, h("h2", {}, m("periodTitle")), period.available
      ? h("p", { class: "da-ins-period-delta" }, m("scoreChange", () => ({ value: `${period.deltaScore > 0 ? "+" : ""}${DA.fmt.score(period.deltaScore)}` }))) : note(m(period.reason || "insufficient_data")),
      period.previous ? [rowView("currentPeriod",period.current),rowView("previousPeriod",period.previous)] : null);
  }
  function overview(report) {
    const data = report.overview, coverage = report.coverage;
    const metric = (label,value,help,extra) => h("section", { class: "da-ins-stat" }, h("h3", {}, m(label)), h("div", { class: "da-ins-stat-value" }, value), extra || null, help ? h("p", {}, help) : null);
    const reasons = [["lowScore",m("lowScore",{score:data.lowScoreThreshold}),data.lowScoreCount],["gross",m("grossErrors"),data.grossCount],
      ["review",m("manualReview"),data.reviewCount],["unresolved",m("unresolved"),data.unresolvedCount],["failed",m("failedEvaluations"),coverage.failed]];
    return h("div", {}, h("section", { class: "da-ins-dashboard" }, h("h2", {}, m("overviewTitle")), h("div", { class: "da-ins-stats" },
      metric("evaluatedLabel",`${coverage.evaluated} / ${report.scope.total}`,null,
        h("div", { class: "da-ins-progress", role: "progressbar", "aria-label":m("evaluatedLabel"), "aria-valuenow":coverage.evaluated,"aria-valuemin":0,"aria-valuemax":report.scope.total || 1 },h("i",{style:{width:`${report.scope.total ? coverage.evaluated / report.scope.total * 100 : 0}%`}}))),
      metric("averageLabel",score(data.avgScore),m("scoreN",{count:data.scoredCount})),
      metric("callDuration",duration(data.callDuration.averageSeconds),data.callDuration.count?m("callsCount",{count:data.callDuration.count}):null),
      metric("pendingAppeals",selectionLink(report,data.drilldowns.openAppeals,data.openAppealCount),null))),
      h("div",{class:"da-ins-extras"},h("section",{class:"da-ins-extra-section"},h("h2",{},m("reviewReasons")),
        reasons.some((part)=>part[2]) ? h("div",{class:"da-ins-reasons"},reasons.filter((part)=>part[2]).map(([key,label,count])=>selectionLink(report,data.drilldowns[key],[h("span",{},label),h("b",{},count)],"da-ins-reason"))) : note(m("noReview")),
        data.attentionCount ? selectionLink(report,data.drilldowns.attention,m("reviewSelection")) : null),periodView(report)));
  }
  const TOPIC_OUTCOMES=["resolved","unresolved","unknown"],TOPIC_SORTS=["unresolved","count","name"];
  const topicOutcomeKey=key=>"topic"+key[0].toUpperCase()+key.slice(1);
  function topicProportions(row,className) {
    return h("span",{class:"da-ins-topic-proportions"+(className?" "+className:""),"aria-hidden":"true"},TOPIC_OUTCOMES.filter(key=>row[key]>0).map(key=>
      h("i",{class:"is-"+key,style:{width:`${row.count?row[key]/row.count*100:0}%`}})));
  }
  function topicSummary(report) {
    const source=new Map(report.conversations.map(row=>[row.conversationId,row])),cohorts={resolved:[],unresolved:[],unknown:[]};
    for(const id of report.scope.conversationIds) {
      const outcome=source.get(id)?.resolutionStatus;
      cohorts[outcome==="resolved"||outcome==="unresolved"?outcome:"unknown"].push(id);
    }
    const totals={count:report.scope.total,...Object.fromEntries(TOPIC_OUTCOMES.map(key=>[key,cohorts[key].length]))};
    const stat=(key,ids,label)=>{const link=selectionLink(report,ids,[h("span",{},label),h("b",{},ids.length)],"da-ins-topic-stat is-"+key);link.setAttribute("data-topic-target","summary-"+key);return link;};
    return h("section",{class:"da-ins-topic-summary","aria-label":m("topicList")},h("div",{class:"da-ins-topic-totals"},
      stat("total",report.scope.conversationIds,m("total")),TOPIC_OUTCOMES.map(key=>stat(key,cohorts[key],m(topicOutcomeKey(key))))),topicProportions(totals,"is-overall"));
  }
  const topicJobActive = data => ["running","queued"].includes(data?.topics.job?.status);
  function topicsView(report,start,starting,error,liveReport,view) {
    const topics=report.topics,rareCount=topics.rows.filter(row=>row.isRare).length;
    const current=liveReport||report,running=starting||topicJobActive(current),queued=running&&!starting&&current.topics.job?.phase==="queued";
    const names=new Intl.Collator(DA.fmt.locale(),{numeric:true,sensitivity:"base"});
    const rows=topics.rows.filter(row=>!view.rareOnly||row.isRare).slice().sort((a,b)=>
      (view.sort==="name"?0:view.sort==="count"?b.count-a.count:b.unresolved-a.unresolved||b.count-a.count)||names.compare(a.topic,b.topic));
    const assigned=new Set(topics.rows.flatMap(row=>row.conversationIds)),unassigned=report.scope.conversationIds.filter(id=>!assigned.has(id));
    const order=DA.dropdown(TOPIC_SORTS.map((value,i)=>({value,label:m(["topicSortReview","topicSortVolume","topicSortName"][i])})),view.sort,view.changeSort,m("topicOrder"));
    order.dataset.topicSort="true";order.querySelector("button")?.setAttribute("data-topic-action","sort");view.register(order);
    const outcome=(row,key)=>{
      const label=m("topicOutcomeLink",()=>({topic:row.topic,outcome:t(topicOutcomeKey(key)),count:row[key]}));
      if(!row[key])return h("span",{class:"da-ins-topic-zero"},0);
      return h("a",{class:"da-ins-topic-outcome is-"+key,"data-topic-target":row.id+"-"+key,href:DA.registryFilters.href({...report.scope.filters,conversationIds:row[key+"Ids"]}),"aria-label":label,
        title:key==="resolved"?m("topicResolvedRate",()=>({resolved:row.resolved,known:row.known,rate:pct(row.resolutionRate)})):null},row[key]);
    };
    return h("div",{class:"da-ins-topic-panel"},h("div",{class:"da-ins-topic-controls"},h("span",{"data-topic-coverage":"true",hidden:running},m("topicCoverage",{count:topics.analyzed,total:report.scope.total})),
      running||topics.pending?h("button",{class:"da-btn is-primary",type:"button","data-topic-action":"start",disabled:running,onclick:start},m(queued?"topicsQueued":running?"analyzingTopics":"analyzeTopics",{count:topics.pending})):null),
      error?h("p",{class:"da-review",role:"alert"},DA.apiErrorMessage(error)):null,topics.job?.error?h("p",{class:"da-review",role:"alert"},topics.job.error):null,
      topicSummary(report),
      h("div",{class:"da-ins-topic-list-head"},h("h2",{},m("topicList"),h("span",{class:"da-count"},rows.length)),
        h("div",{class:"da-ins-topic-list-tools"},rareCount||view.rareOnly?h("button",{class:"da-btn is-text da-ins-topic-rare",type:"button","data-topic-action":"rare","aria-pressed":String(view.rareOnly),onclick:view.toggleRare},m("rareTopics",{count:rareCount})):null,order)),
      rows.length?pagedTable([m("topicName"),m("conversationColumn"),m("topicResolved"),m("topicUnresolved"),m("topicUnknown"),m("averageLabel")],rows,
        {key:"topics",page:view.page,size:10,sizes:[10]},row=>h("tr",{"data-topic":row.id},
          h("td",{},h("a",{class:"da-ins-topic-name","data-topic-target":row.id+"-name",href:DA.registryFilters.href({...report.scope.filters,conversationIds:row.conversationIds}),"aria-label":m("topicOpen",{topic:row.topic})},row.topic)),
          h("td",{},h("a",{class:"da-ins-topic-count","data-topic-target":row.id+"-count",href:DA.registryFilters.href({...report.scope.filters,conversationIds:row.conversationIds}),"aria-label":m("topicOpen",{topic:row.topic})},row.count),topicProportions(row)),
          TOPIC_OUTCOMES.map(key=>h("td",{},outcome(row,key))),
          h("td",{class:"da-ins-topic-score",title:m("scoreN",{count:row.scoredCount})},score(row.avgScore))),view.changePage,view.register,"da-ins-topics-table"):
        h("div",{class:"da-empty da-ins-topics-empty"},h("h3",{},m(view.rareOnly?"topicNoRare":"noTopics"))),
      unassigned.length?selectionLink(report,unassigned,m("topicUnassigned",{count:unassigned.length}),"da-ins-topic-unassigned"):null);
  }
  function operatorName(op) {
    return op.kind === "named" ? op.name : t(op.kind === "hidden" ? "nameHidden" : op.kind === "botOnly" ? "botOnly" : "missingIdentity");
  }
  function recordHref(row) {
    return `#/c/${encodeURIComponent(row.conversationId)}` + (row.evaluationId ? `?evaluation=${encodeURIComponent(row.evaluationId)}` : "");
  }
  function linkedRow(href, attrs, cells) {
    const open=()=>{window.location.hash=href;};
    return h("tr",{...attrs,tabindex:0,role:"link",onclick:event=>{
      if(event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.target.closest("a, button"))return;open();
    },onkeydown:event=>{if((event.key==="Enter"||event.key===" ")&&event.target===event.currentTarget){event.preventDefault();open();}}},cells);
  }
  function pagedTable(headings,rows,state,renderRow,onChange,register,className) {
    const size=state.size,pages=Math.max(1,Math.ceil(rows.length/size)),page=Math.min(pages,Math.max(1,state.page));
    const from=(page-1)*size,to=Math.min(rows.length,from+size);
    const pageNumbers=Array.from({length:pages},(_,i)=>i+1).filter(number=>number===1||number===pages||Math.abs(number-page)<=1);
    const buttons=[];let previous=0;
    for(const number of pageNumbers){if(previous&&number-previous>1)buttons.push(h("span",{class:"da-pager-gap","aria-hidden":"true"},"…"));
      buttons.push(h("button",{class:"da-pager-btn",type:"button","aria-current":number===page?"page":null,"aria-label":m("page",{number}),"data-page-action":state.key+"-"+number,onclick:()=>onChange(number,size)},number));previous=number;}
    const sizeOptions=state.sizes||[10,25,50];
    const sizes=sizeOptions.length>1?DA.dropdown(sizeOptions.map(value=>({value,label:String(value)})),size,value=>onChange(Math.floor(from/value)+1,value),t("pageSize")):null;
    if(sizes){sizes.dataset.pagination=state.key;register(sizes);}
    const step=(direction,label,icon,disabled)=>h("button",{class:"da-pager-btn is-step",type:"button",disabled,"data-page-action":state.key+"-"+direction,"aria-label":m(label),onclick:()=>onChange(page+(direction==="next"?1:-1),size)},
      direction==="previous"?DA.icon(icon,16):null,h("span",{},m(label)),direction==="next"?DA.icon(icon,16):null);
    return h("div",{class:"da-table-wrap da-ins-list-wrap"},h("table",{class:"da-table "+className},
      h("thead",{},h("tr",{},headings.map(label=>h("th",{scope:"col"},label)))),h("tbody",{},rows.slice(from,to).map(renderRow))),
      h("div",{class:"da-pager"},h("span",{class:"da-pager-range","aria-live":"polite"},pages>1?m("shownRange",{from:from+1,to,total:rows.length}):m("shownAll",{count:rows.length})),
        sizes?h("div",{class:"da-pager-size"},h("span",{"aria-hidden":"true"},m("perPage")),sizes):null,
        h("nav",{class:"da-pager-nav","aria-label":m("pages")},step("previous","previous","back",page===1),buttons,step("next","next","chevron",page===pages))));
  }
  function operators(report,view) {
    const selected=view.operatorId?report.operators.find(op=>op.id===view.operatorId):null;
    const back=h("a",{class:"da-btn is-text da-ins-operator-back",href:view.href(null)},DA.icon("back",16),m("backOperators"));
    if(view.operatorId&&!selected)return h("div",{},back,h("div",{class:"da-empty"},h("h2",{},m("operatorMissing"))));
    if(!selected)return pagedTable([m("operator"),m("conversationColumn"),m("meanScore"),m("weakPoint"),m("grossErrors"),""],report.operators,
      {key:"operators",page:view.page,size:view.size},op=>{
        const href=view.href(op.id),name=operatorName(op),weak=op.weakCriteria[0];
        return linkedRow(href,{"data-operator":op.id,"aria-label":m("openOperator",{name})},[
          h("td",{},h("a",{class:"da-ins-table-name",href},name)),h("td",{class:"da-ins-table-count"},op.count),
          h("td",{},h("div",{class:"da-ins-table-score"},h("b",{},score(op.avgScore)),op.avgScore!=null?h("span",{class:"da-ins-meter"},h("i",{style:{width:op.avgScore+"%"}})):null)),
          h("td",{class:"da-ins-table-criterion"},weak?weak.title:h("span",{class:"da-quiet"},m(op.scoredCount?"noWeakAreas":"noData"))),
          h("td",{class:"da-ins-table-count"},op.grossCount?h("span",{class:"da-ins-flag"},DA.icon("flag",14),op.grossCount):0),
          h("td",{},h("a",{class:"da-btn is-text is-sm",href},m("open")))]);
      },view.changePage,view.register,"da-ins-operators-table");
    const ids=new Set(selected.conversationIds),conversations=report.conversations.filter(row=>ids.has(row.conversationId));
    const criteria=selected.weakCriteria;
    return h("div",{class:"da-ins-operator-detail"},back,
      h("div",{class:"da-ins-operator-heading"},h("h2",{},operatorName(selected)),h("div",{class:"da-ins-operator-facts"},
        h("span",{},m("conversationColumn"),": ",h("b",{},selected.count)),h("span",{},m("meanScore"),": ",h("b",{},score(selected.avgScore))),h("span",{},m("grossErrors"),": ",h("b",{},selected.grossCount)))),
      h("section",{class:"da-ins-operator-criteria"},h("h3",{},m("operatorCriteria")),criteria.length?
        h("div",{class:"da-table-wrap"},h("table",{class:"da-table da-ins-criteria-list"},h("thead",{},h("tr",{},h("th",{scope:"col"},m("criterion")),h("th",{scope:"col"},m("completion")),h("th",{scope:"col"},m("reviewConversations")))),
          h("tbody",{},criteria.map(criterion=>h("tr",{},h("td",{},criterion.title),h("td",{},criterion.avgFraction==null?m("noData"):DA.msg(()=>pct(criterion.avgFraction))),
            h("td",{},selectionLink(report,criterion.belowTargetIds,m("viewConversations",{count:criterion.belowTargetCount}),"da-btn is-text is-sm")))))))
        :note(m(selected.scoredCount?"noWeakAreas":"noData"))),
      h("section",{class:"da-ins-operator-conversations"},h("h3",{},m("operatorConversations")),
        pagedTable([m("number"),m("date"),m("language"),m("channel"),m("subject"),m("score")],conversations,{key:"conversations",page:view.conversationPage,size:view.conversationSize},row=>{
          const href=recordHref(row),when=row.startedAt?new Date(row.startedAt):null;
          return linkedRow(href,{"data-conversation":row.conversationId,"aria-label":`№ ${row.number}`},[
            h("td",{class:"da-id"},h("a",{class:"da-ins-table-name",href},`№ ${row.number}`)),
            h("td",{class:"da-ins-conversation-date"},when&&!Number.isNaN(when.getTime())?DA.msg(()=>new Intl.DateTimeFormat(DA.fmt.locale(),{day:"2-digit",month:"2-digit",year:"numeric"}).format(when)):m("noData")),
            h("td",{},DA.msg(()=>DA.langLabel[row.language]||row.language)),h("td",{},m(recordChannelKey(row.channel))),
            h("td",{class:"da-ins-conversation-subject"},h("div",{class:"da-preview"},row.topic||row.preview)),h("td",{},h("b",{class:"da-score-num"},score(row.total)))]);
        },view.changeConversationPage,view.register,"da-ins-conversations-table")));
  }
  function inputDate(value) {
    if (!value.trim()) return "";
    const match=value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    const iso=match?`${match[3]}-${match[2]}-${match[1]}`:value.trim();
    return DA.registryFilters.dateValue(iso)==null?null:iso;
  }
  const displayDate=(value)=>value?value.split("-").reverse().join("."):"";
  DA.views = DA.views || {};
  DA.views.insights = function mount(root,params) {
    const F=DA.registryFilters;
    let filters=F.readQuery(params.query),tab=TABS.includes(params.query.tab)?params.query.tab:"overview";
    const positive=value=>Number.isInteger(Number(value))&&Number(value)>0?Number(value):1;
    const pageSize=value=>[10,25,50].includes(Number(value))?Number(value):10;
    let operatorId=typeof params.query.operator==="string"?params.query.operator:null;
    let operatorPage=positive(params.query.opPage),operatorSize=pageSize(params.query.opSize),conversationPage=positive(params.query.conversationPage),conversationSize=pageSize(params.query.conversationSize);
    let topicPage=positive(params.query.topicPage),topicSort=TOPIC_SORTS.includes(params.query.topicSort)?params.query.topicSort:"unresolved",topicRare=params.query.rareTopics==="1";
    let report=null,liveReport=null,alive=true,loading=false,loadError=null,topicError=null,starting=false,awaitingTopicStatus=false,revision=0,timer=null,progressShown=false;
    let activePopup=null,calendarMonth=new Date();
    const popups=[],dropdowns=[],tableDropdowns=[];
    const body=h("div",{class:"da-ins-body","aria-live":"polite"});
    const progressSpinner=h("span",{class:"da-ins-topic-spinner","aria-hidden":"true"});
    const progressLabel=h("span"),progressCount=h("b",{class:"da-ins-topic-progress-count"});
    const progress=h("div",{class:"da-ins-topic-progress",hidden:true,role:"status","aria-live":"polite","aria-atomic":"true"},progressSpinner,progressLabel,progressCount);
    function popup(label,cls,role) {
      const button=h("button",{class:"da-dd-btn",type:"button","aria-expanded":"false","aria-haspopup":role||"dialog"},h("span",{class:"da-dd-value"},label),DA.icon("chevron",14));
      const panel=h("div",{class:"da-ins-popover "+cls,hidden:true,role:role||"dialog","aria-label":label});
      const wrap=h("div",{class:"da-dd da-ins-popup"},button,panel);
      function outside(event) { if(!wrap.contains(event.target)) close(false); }
      function key(event) { if(event.key==="Escape") { event.preventDefault();close(true); } }
      function close(focus) { panel.hidden=true;button.setAttribute("aria-expanded","false");wrap.classList.remove("is-open");
        document.removeEventListener("mousedown",outside);document.removeEventListener("keydown",key);if(activePopup===api)activePopup=null;if(focus)button.focus(); }
      function open() { activePopup?.close(false);activePopup=api;api.beforeOpen?.();panel.hidden=false;button.setAttribute("aria-expanded","true");wrap.classList.add("is-open");
        document.addEventListener("mousedown",outside);document.addEventListener("keydown",key); }
      const api={wrap,button,panel,open,close,beforeOpen:null};popups.push(api);
      button.addEventListener("click",()=>panel.hidden?open():close(false));
      button.addEventListener("keydown",event=>{if(event.key==="ArrowDown"){event.preventDefault();open();panel.querySelector("button, input")?.focus();}});
      wrap.addEventListener("focusout",event=>{if(event.relatedTarget&&!wrap.contains(event.relatedTarget))close(false);});
      return api;
    }
    function commit(patch) { filters=F.normalize({...filters,...patch});operatorPage=1;conversationPage=1;topicPage=1;syncUrl();updateControls();load(); }
    const range=popup(m("period"),"da-ins-date-popover");
    const dates={from:h("input",{class:"da-input",type:"text",inputmode:"numeric",placeholder:m("dateFormat"),"aria-label":m("from")}),
      to:h("input",{class:"da-input",type:"text",inputmode:"numeric",placeholder:m("dateFormat"),"aria-label":m("to")})};
    const dateError=h("p",{class:"da-ins-date-error",role:"alert",hidden:true},m("invalidScope"));
    const calendar=h("div",{class:"da-ins-calendar"});
    function drawCalendar() {
      const year=calendarMonth.getUTCFullYear(),month=calendarMonth.getUTCMonth(),first=new Date(Date.UTC(year,month,1)),offset=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(year,month+1,0)).getUTCDate();
      const start=inputDate(dates.from.value),end=inputDate(dates.to.value);
      const dayButtons=[];
      for(let i=0;i<offset;i++)dayButtons.push(h("span",{"aria-hidden":"true"}));
      for(let day=1;day<=days;day++) {
        const iso=`${String(year).padStart(4,"0")}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        const selected=iso===start||iso===end,between=start&&end&&iso>start&&iso<end;
        dayButtons.push(h("button",{class:"da-ins-calendar-day"+(selected?" is-selected":between?" is-between":""),type:"button","aria-label":displayDate(iso),"aria-pressed":String(!!selected),onclick:()=>{
          if(!start||end||iso<start){dates.from.value=displayDate(iso);dates.to.value="";}else dates.to.value=displayDate(iso);
          dateError.hidden=true;drawCalendar();calendar.querySelector(`[aria-label="${displayDate(iso)}"]`)?.focus();
        }},day));
      }
      calendar.replaceChildren(h("div",{class:"da-ins-calendar-head"},
        h("button",{class:"da-btn is-text is-sm",type:"button","aria-label":m("previousMonth"),onclick:()=>{calendarMonth=new Date(Date.UTC(year,month-1,1));drawCalendar();}},DA.icon("back",16)),
        h("b",{},DA.msg(()=>new Intl.DateTimeFormat(DA.fmt.locale(),{month:"long",year:"numeric",timeZone:"UTC"}).format(first))),
        h("button",{class:"da-btn is-text is-sm",type:"button","aria-label":m("nextMonth"),onclick:()=>{calendarMonth=new Date(Date.UTC(year,month+1,1));drawCalendar();}},DA.icon("chevron",16))),
        h("div",{class:"da-ins-calendar-week","aria-hidden":"true"},Array.from({length:7},(_,i)=>h("span",{},DA.msg(()=>new Intl.DateTimeFormat(DA.fmt.locale(),{weekday:"short",timeZone:"UTC"}).format(new Date(Date.UTC(2024,0,1+i))))))),
        h("div",{class:"da-ins-calendar-grid"},dayButtons));
    }
    range.panel.append(h("div",{class:"da-ins-date-fields"},h("label",{},m("from"),dates.from),h("label",{},m("to"),dates.to)),calendar,dateError,
      h("div",{class:"da-ins-date-actions"},h("button",{class:"da-btn is-text",type:"button",onclick:()=>{range.close(true);commit({dateFrom:"",dateTo:""});}},m("allTime")),
        h("button",{class:"da-btn is-primary",type:"button",onclick:()=>{
          const dateFrom=inputDate(dates.from.value),dateTo=inputDate(dates.to.value),valid=dateFrom!==null&&dateTo!==null&&F.validate({...filters,dateFrom,dateTo}).valid;
          dateError.hidden=valid;dates.from.setAttribute("aria-invalid",String(!valid));dates.to.setAttribute("aria-invalid",String(!valid));
          if(!valid)return;range.close(true);commit({dateFrom,dateTo});
        }},m("apply"))));
    range.beforeOpen=()=>{dates.from.value=displayDate(filters.dateFrom);dates.to.value=displayDate(filters.dateTo);dateError.hidden=true;
      calendarMonth=filters.dateFrom?new Date(filters.dateFrom+"T00:00:00Z"):new Date();drawCalendar();};
    for(const input of Object.values(dates))input.addEventListener("change",()=>{const parsed=inputDate(input.value);if(parsed)calendarMonth=new Date(parsed+"T00:00:00Z");drawCalendar();});
    const version=popup(m("version"),"da-ins-version-popover","listbox");
    function drawVersions() {
      if(!report)return;
      version.panel.replaceChildren(...report.scope.checklists.map(cl=>{
        const saved=DA.state.checklists.find(item=>item.id===cl.id),criteria=saved?.criteria || (cl.id===report.scope.checklist.id?report.criteria:[]);
        const option=h("button",{class:"da-ins-version-option",type:"button",role:"option","aria-selected":String(cl.id===filters.checklistId),onclick:()=>{version.close(true);commit({checklistId:cl.id});}},
          h("span",{class:"da-ins-version-option-head"},h("b",{},m("versionNumber",{number:cl.version})),cl.isActive?h("small",{},m("active")):null,cl.id===filters.checklistId?DA.icon("check",16):null),
          h("span",{class:"da-ins-version-preview"},criteria.slice(0,4).map(item=>h("span",{},item.title))),h("small",{class:"da-ins-version-count"},m("criterionCount",{count:criteria.length})));
        option.addEventListener("keydown",event=>{const options=[...version.panel.querySelectorAll("button")],index=options.indexOf(option);
          if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?options.length-1:Math.max(0,Math.min(options.length-1,index+(event.key==="ArrowDown"?1:-1)));options[next].focus();}});
        return option;
      }));
    }
    version.beforeOpen=drawVersions;
    function filterDropdown(key,options,allLabel) {
      const choices=[{value:"",label:t(allLabel)},...options.map(([value,label])=>({value,label:label()}))];
      if(filters[key].length>1)choices.push({value:"_selection",label:t("selectedValues")});
      const node=DA.dropdown(choices,filters[key].length>1?"_selection":filters[key][0]||"",value=>{if(value!=="_selection")commit({[key]:value?[value]:[]});},t(key==="languages"?"language":"channel"));
      node.dataset.filter=key;node.refreshLabels=()=>{choices[0].label=t(allLabel);options.forEach((entry,i)=>{choices[i+1].label=entry[1]();});if(choices.at(-1).value==="_selection")choices.at(-1).label=t("selectedValues");node.setValue(filters[key].length>1?"_selection":filters[key][0]||"");};dropdowns.push(node);return node;
    }
    const channel=filterDropdown("channels",[["voice call",()=>t("calls")],["agent chat",()=>t("chats")]],"allChannels");
    const language=filterDropdown("languages",LANGS.map(lang=>[lang,()=>DA.langLabel[lang]]),"allLanguages");
    const resetButton=h("button",{class:"da-btn is-text",type:"button",onclick:()=>{activePopup?.close(false);filters=F.normalize({});operatorPage=1;conversationPage=1;topicPage=1;syncUrl();updateControls();load();}},m("reset"));
    function assistantScope() {
      const operator=tab==="operators"&&operatorId?report?.operators.find(item=>item.id===operatorId):null;
      if(tab==="operators"&&operatorId&&!operator)return {filters:{...report.scope.filters,conversationIds:[]},label:t("operatorMissing"),fingerprint:report.sourceHash};
      return {filters:operator?{...report.scope.filters,conversationIds:operator.conversationIds}:report.scope.filters,
        label:operator?operatorName(operator):t("scopeCount",{count:report.scope.total}),fingerprint:report.sourceHash};
    }
    const ask=h("button",{class:"da-btn is-text da-ins-ask",type:"button",disabled:true,onclick:()=>{if(!report||loading||loadError)return;
      DA.setAssistantScope?.(assistantScope());DA.openAssistant?.({context:"workspace",message:t("explainPrompt")});}},DA.icon("message",16),m("explain"));
    const toolbar=h("div",{class:"da-ins-toolbar","aria-label":m("scopeLabel")},range.wrap,channel,language,version.wrap,resetButton,ask);
    function updateControls() {
      range.button.replaceChildren(h("span",{class:"da-dd-value"},filters.dateFrom||filters.dateTo?`${displayDate(filters.dateFrom)||"…"} – ${displayDate(filters.dateTo)||"…"}`:m("allTime")),DA.icon("chevron",14));
      channel.setValue(filters.channels.length>1?"_selection":filters.channels[0]||"");language.setValue(filters.languages.length>1?"_selection":filters.languages[0]||"");
      const selected=report?.scope.checklists.find(cl=>cl.id===filters.checklistId)||report?.scope.checklists.find(cl=>cl.isActive);
      version.button.replaceChildren(h("span",{class:"da-dd-value"},selected?m("versionNumber",{number:selected.version}):m("version")),DA.icon("chevron",14));
      version.button.disabled=!report;
      const count=F.count(filters)-(filters.checklistId?1:0);
      resetButton.hidden=!count&&(!selected||selected.isActive);
    }
    function viewHref(targetTab,targetOperator) {
      const query=new URLSearchParams(F.toQuery(filters));if(targetTab!=="overview")query.set("tab",targetTab);
      if(targetTab==="topics") {
        if(topicPage>1)query.set("topicPage",topicPage);if(topicSort!=="unresolved")query.set("topicSort",topicSort);if(topicRare)query.set("rareTopics","1");
      }
      if(targetTab==="operators") {
        if(operatorPage>1)query.set("opPage",operatorPage);if(operatorSize!==10)query.set("opSize",operatorSize);
        if(targetOperator) {query.set("operator",targetOperator);if(targetOperator===operatorId&&conversationPage>1)query.set("conversationPage",conversationPage);if(conversationSize!==10)query.set("conversationSize",conversationSize);}
      }
      return "#/insights"+(query.size?"?"+query:"");
    }
    function syncUrl() {if(F.validate(filters).valid)history.replaceState(null,"",viewHref(tab,operatorId));}
    function switchTab(value) {if(value!==tab)operatorId=null;tab=value;seg.setValue(value);syncUrl();render();if(report)DA.setAssistantScope?.(assistantScope());}
    const seg=DA.segmented(TABS.map(value=>({value,label:m(value)})),tab,switchTab,m("section"));
    const cohortKey=data=>data?JSON.stringify([F.toQuery(data.scope.filters),data.scope.checklist?.id,data.scope.conversationIds.slice().sort()]):null;
    const topicJobState=data=>JSON.stringify([data?.topics.job?.status,data?.topics.job?.phase,data?.topics.job?.error]);
    function updateTopicProgress() {
      const data=liveReport||report,running=starting||awaitingTopicStatus||topicJobActive(data),job=data?.topics.job;
      if(running)progressShown=true;
      progress.hidden=!progressShown;progressSpinner.hidden=!running;
      if(progressShown) {
        const elsewhere=topicJobActive(data)&&job.selectedCount===0,queued=running&&!starting&&job?.phase==="queued";
        DA.i18n.bindText(progressLabel,m(!running?(job?.status==="error"?"topicAnalysisFailed":"topicAnalysisFinished"):elsewhere?"topicJobElsewhere":queued?"topicsQueued":"analyzingTopics"));
        const count=elsewhere?(job.processed||0)+(job.failed||0)+(job.skipped||0):data?.topics.analyzed,total=elsewhere?job.total:data?.scope.total;
        progressCount.hidden=!running||!Number.isFinite(total);
        if(!progressCount.hidden)DA.i18n.bindText(progressCount,m("topicProgressCount",{count:count||0,total}));
      }
      const action=body.querySelector('[data-topic-action="start"]');
      if(action) {
        action.disabled=running||!data?.topics.pending;
        const key=running?(job?.phase==="queued"&&!starting?"topicsQueued":"analyzingTopics"):"analyzeTopics";
        const state=key+":"+(!running?data?.topics.pending:"");
        if(action.dataset.progressState!==state){DA.i18n.bindText(action,m(key,{count:data?.topics.pending}));action.dataset.progressState=state;}
      }
      const coverageLabel=body.querySelector('[data-topic-coverage="true"]');if(coverageLabel)coverageLabel.hidden=running;
    }
    async function load(background) {
      const own=++revision;clearTimeout(timer);if(!F.validate(filters).valid){loadError=new Error(t("invalidScope"));loading=false;render();return;}
      const foreground=!background||!report||loading||!!loadError;
      loading=foreground;loadError=null;if(loading)render();
      let refreshBody=foreground,failed=false;
      try {
        const data=await DA.api.getAnalytics(filters);if(!alive||own!==revision)return;
        const wasRunning=topicJobActive(liveReport||report),cohortChanged=cohortKey(data)!==cohortKey(report);
        liveReport=data;awaitingTopicStatus=false;
        // A topic response changes the report hash for every record. Keep the
        // current reading surface until the job finishes or its cohort changes.
        if(foreground||cohortChanged||(!topicJobActive(data)&&(wasRunning||data.sourceHash!==report.sourceHash||topicJobState(data)!==topicJobState(report)))) {
          report=data;filters=F.normalize(data.scope.filters);updateControls();syncUrl();
          DA.setAssistantScope?.(assistantScope());refreshBody=true;
        }
      }
      catch(error){if(!alive||own!==revision)return;failed=true;if(foreground){loadError=error;refreshBody=true;}}
      finally{if(alive&&own===revision){loading=false;if(refreshBody)render(!!background);updateTopicProgress();
        const latest=liveReport||report;
        if((failed&&report)||topicJobActive(latest)||latest?.coverage.pending)timer=setTimeout(()=>load(true),3000);}}
    }
    async function startTopics() {
      if(starting||awaitingTopicStatus||topicJobActive(liveReport||report)||!report?.topics.pending)return;
      const ids=report.scope.conversationIds.slice();starting=true;topicError=null;updateTopicProgress();
      try{await DA.api.analyzeTopicSelection(ids);awaitingTopicStatus=true;}catch(error){if(alive)topicError=error;}finally{starting=false;if(alive){if(topicError){progressShown=false;render(true);updateTopicProgress();}else load(true);}}
    }
    function coverage() {
      const data=report.coverage;
      return h("div",{class:"da-ins-cover"},selectionLink(report,report.scope.conversationIds,m("coverage",{count:data.evaluated,total:report.scope.total})),
        data.evaluated<report.scope.total?h("span",{class:"da-ins-cover-bar","aria-hidden":"true"},h("i",{style:{width:`${report.scope.total?data.evaluated/report.scope.total*100:0}%`}})):null,
        data.pending?h("span",{},m("coverageRunning",{count:data.pending})):null,
        filters.q||filters.groupId||filters.scoreFrom!=null||filters.scoreTo!=null||filters.status.length||filters.attention.length||filters.appealStatus.length||filters.conversationIds!==null?selectionLink(report,report.scope.conversationIds,m("extraFilters")):null);
    }
    function hasAdditionalFilters(){return !!(filters.q||filters.groupId||filters.scoreFrom!=null||filters.scoreTo!=null||filters.status.length||filters.attention.length||filters.appealStatus.length||filters.conversationIds!==null);}
    function closeTableDropdowns(){tableDropdowns.splice(0).forEach(item=>{const button=item.querySelector("button");if(button?.getAttribute("aria-expanded")==="true")button.click();});}
    function operatorView() {
      return operators(report,{operatorId,page:operatorPage,size:operatorSize,conversationPage,conversationSize,href:id=>viewHref("operators",id),register:node=>tableDropdowns.push(node),
        changePage:(page,size)=>{operatorPage=page;operatorSize=size;syncUrl();render();},
        changeConversationPage:(page,size)=>{conversationPage=page;conversationSize=size;syncUrl();render();}});
    }
    function topicView() {
      const rows=report.topics.rows.filter(row=>!topicRare||row.isRare);
      const page=Math.min(topicPage,Math.max(1,Math.ceil(rows.length/10)));
      if(page!==topicPage){topicPage=page;syncUrl();}
      return topicsView(report,startTopics,starting||awaitingTopicStatus,topicError,liveReport,{page:topicPage,sort:topicSort,rareOnly:topicRare,register:node=>tableDropdowns.push(node),
        changePage:page=>{topicPage=page;syncUrl();render(true);},
        changeSort:value=>{topicSort=value;topicPage=1;syncUrl();render(true);},
        toggleRare:()=>{topicRare=!topicRare;topicPage=1;syncUrl();render(true);}});
    }
    function render(preserveScroll) {
      const scroll=preserveScroll?{left:window.scrollX,top:window.scrollY}:null;
      const matrixScroll=body.querySelector('.da-ins-matrix-wrap')?.scrollLeft;
      ask.disabled=!report||loading||!!loadError||!!(tab==="operators"&&operatorId&&!report?.operators.some(item=>item.id===operatorId));
      const active=body.contains(document.activeElement)?document.activeElement:null;
      const focusKey=active?["data-page-action","data-operator","data-conversation","data-topic-action","data-topic-target","href"].map(key=>[key,active.getAttribute(key)]).find(([,value])=>value!=null):null;
      const pageFocus=document.activeElement?.dataset.pageAction;closeTableDropdowns();
      const disclosures=new Map([...body.querySelectorAll("details[data-disclosure]")].map(node=>[node.dataset.disclosure,node.open]));
      const focused=body.contains(document.activeElement)?document.activeElement.closest("details[data-disclosure]")?.dataset.disclosure:null;
      if(loading){body.replaceChildren(h("p",{class:"da-ins-loading",role:"status"},m("loading")));return;}
      if(loadError){body.replaceChildren(h("div",{class:"da-empty",role:"alert"},h("h2",{},m("loadFailed")),h("p",{},DA.apiErrorMessage(loadError)),h("button",{class:"da-btn",type:"button",onclick:()=>load()},m("retry"))));return;}
      if(!report)return;
      body.replaceChildren(...(tab==="quality"?[coverage()]:hasAdditionalFilters()?[h("div",{class:"da-ins-cover"},selectionLink(report,report.scope.conversationIds,m("extraFilters")))]:[]),report.scope.total||tab==="operators"&&operatorId?h("div",{class:"da-ins-tab","data-tab":tab},tab==="quality"?quality(report):tab==="topics"?topicView():tab==="operators"?operatorView():overview(report)):
        h("div",{class:"da-empty"},h("h2",{},m("noMatches")),h("p",{},m("noMatchesHelp"))));
      body.querySelectorAll("details[data-disclosure]").forEach(node=>{if(disclosures.has(node.dataset.disclosure))node.open=disclosures.get(node.dataset.disclosure);if(focused===node.dataset.disclosure)node.querySelector("summary").focus({preventScroll:true});});
      if(pageFocus)(body.querySelector(`[data-page-action="${pageFocus}"]:not([disabled])`)||body.querySelector('[aria-current="page"]'))?.focus({preventScroll:true});
      if(focusKey)[...body.querySelectorAll("a, button, tr")].find(node=>node.getAttribute(focusKey[0])===focusKey[1]&&!node.disabled)?.focus({preventScroll:true});
      const matrix=body.querySelector('.da-ins-matrix-wrap');if(matrix&&matrixScroll!=null)matrix.scrollLeft=matrixScroll;
      if(scroll)window.scrollTo?.({...scroll,behavior:"instant"});
      updateTopicProgress();
    }
    root.append(h("div",{class:"da-page da-ins"},h("div",{class:"da-page-head da-ins-head"},h("h1",{class:"da-h1",tabindex:-1},m("title")),seg),toolbar,progress,body));
    updateControls();load();
    const refresh=()=>load(true),events=["da:appeals-changed","da:stt-changed","da:evaluations-changed","da:checklists-changed"];
    const refreshLocale=()=>dropdowns.forEach(item=>item.refreshLabels());window.addEventListener("da:locale-changed",refreshLocale);
    events.forEach(event=>window.addEventListener(event,refresh));
    return()=>{alive=false;revision++;clearTimeout(timer);closeTableDropdowns();popups.forEach(item=>item.close(false));dropdowns.forEach(item=>{const btn=item.querySelector("button");if(btn?.getAttribute("aria-expanded")==="true")btn.click();});events.forEach(event=>window.removeEventListener(event,refresh));window.removeEventListener("da:locale-changed",refreshLocale);};
  };
})();
