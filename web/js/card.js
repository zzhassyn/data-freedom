/* Карточка диалога: транскрипт слева, оценка справа, связь критериев и реплик, апелляции. */
(function () {
  const DA = window.DA, h = DA.h;
  const m = (key, params) => DA.msg(`card.${key}`, params);
  const t = (key, params) => DA.t(`card.${key}`, params);
  const dynamic = (value) => DA.msg(value);
  DA.i18n.addMessages({
    "card.notFound": { ru: "Такого обращения нет в базе", kk: "Бұл өтініш дерекқорда жоқ", en: "Conversation not found" },
    "card.notImported": { ru: "Возможно, набор ещё не загружен.", kk: "Деректер жиыны әлі жүктелмеген болуы мүмкін.", en: "The dataset may not have been imported yet." },
    "card.backQueue": { ru: "Вернуться к очереди", kk: "Кезекке оралу", en: "Back to queue" },
    "card.backList": { ru: "К списку обращений", kk: "Өтініштер тізіміне", en: "Back to conversations" },
    "card.dialogue": { ru: "Диалог", kk: "Диалог", en: "Conversation" },
    "card.evaluation": { ru: "Оценка", kk: "Бағалау", en: "Evaluation" },
    "card.checked": { ru: "Проверенный участок", kk: "Тексерілген бөлік", en: "Reviewed segment" },
    "card.waitingReply": { ru: "Ожидание ответа {time}", kk: "Жауап күту: {time}", en: "Waiting for a reply: {time}" },
    "card.selectTurn": { ru: "Выделить реплику: {speaker}, {time}", kk: "Репликаны таңдау: {speaker}, {time}", en: "Select turn: {speaker}, {time}" },
    "card.firstReply": { ru: "Первый ответ оператора", kk: "Оператордың алғашқы жауабы", en: "First operator response" },
    "card.showFull": { ru: "Показать полностью", kk: "Толық көрсету", en: "Show full text" },
    "card.collapse": { ru: "Свернуть", kk: "Жию", en: "Collapse" },
    "card.recording": { ru: "Запись звонка", kk: "Қоңырау жазбасы", en: "Call recording" },
    "card.listenRecording": { ru: "Слушать запись звонка", kk: "Қоңырау жазбасын тыңдау", en: "Play call recording" },
    "card.transcript": { ru: "Расшифровка", kk: "Транскрипт", en: "Transcript" },
    "card.historyTranscriptOnly": { ru: "В этой сохранённой оценке доступна только расшифровка.", kk: "Бұл сақталған бағалауда тек транскрипт қолжетімді.", en: "Only the transcript is available for this saved evaluation." },
    "card.listenHere": { ru: "Слушать с этого места", kk: "Осы жерден тыңдау", en: "Play from here" },
    "card.listen": { ru: "Слушать", kk: "Тыңдау", en: "Play" },
    "card.pauseRecording": { ru: "Поставить запись на паузу", kk: "Жазбаны кідірту", en: "Pause recording" },
    "card.pause": { ru: "Пауза", kk: "Кідірту", en: "Pause" },
    "card.voice": { ru: "Голос {number}", kk: "Дауыс {number}", en: "Voice {number}" },
    "card.goTurn": { ru: "Перейти к реплике: {speaker}, {time}", kk: "Репликаға өту: {speaker}, {time}", en: "Go to turn: {speaker}, {time}" },
    "card.uncertainTime": { ru: "время неточное", kk: "уақыты шамамен", en: "approximate timing" },
    "card.transcribeFailed": { ru: "Не удалось расшифровать звонок", kk: "Қоңырау транскриптін жасау мүмкін болмады", en: "Could not transcribe the call" },
    "card.sourceChanged": { ru: "Расшифровка относится к обновлённому диалогу. Откройте обращение заново.", kk: "Транскрипт жаңартылған диалогқа тиесілі. Өтінішті қайта ашыңыз.", en: "The conversation has changed. Reopen it to load the current transcript." },
    "card.transcriptNotReady": { ru: "Расшифровка записи ещё не готова.", kk: "Жазба транскрипті әлі дайын емес.", en: "The recording transcript is not ready yet." },
    "card.transcriptQueued": { ru: "Расшифровка звонка в очереди.", kk: "Қоңырау транскрипті кезекте тұр.", en: "Call transcription is queued." },
    "card.downloading": { ru: "Скачиваем запись", kk: "Жазба жүктелуде", en: "Downloading recording" },
    "card.recognizing": { ru: "Распознаём речь", kk: "Сөйлеу танылуда", en: "Recognizing speech" },
    "card.masking": { ru: "Скрываем личные данные", kk: "Жеке деректер жасырылуда", en: "Hiding personal data" },
    "card.buildingTurns": { ru: "Собираем реплики", kk: "Репликалар құрылуда", en: "Building conversation turns" },
    "card.transcribing": { ru: "Расшифровываем звонок", kk: "Қоңырау транскрипті жасалуда", en: "Transcribing call" },
    "card.noSpeech": { ru: "В записи не удалось распознать речь.", kk: "Жазбада сөйлеу танылмады.", en: "No speech could be recognized in the recording." },
    "card.loadingTranscript": { ru: "Загружаем расшифровку", kk: "Транскрипт жүктелуде", en: "Loading transcript" },
    "card.loading": { ru: "Загружаем", kk: "Жүктелуде", en: "Loading" },
    "card.transcribe": { ru: "Расшифровать звонок", kk: "Қоңырау транскриптін жасау", en: "Transcribe call" },
    "card.retry": { ru: "Повторить", kk: "Қайталау", en: "Try again" },
    "card.loadTranscriptFailed": { ru: "Не удалось загрузить расшифровку", kk: "Транскриптті жүктеу мүмкін болмады", en: "Could not load transcript" },
    "card.downloadFailed": { ru: "Не удалось скачать запись", kk: "Жазбаны жүктеу мүмкін болмады", en: "Could not download recording" },
    "card.serviceTimeout": { ru: "Сервис распознавания не ответил", kk: "Сөйлеуді тану қызметі жауап бермеді", en: "The speech recognition service did not respond" },
    "card.recordingDamaged": { ru: "Запись повреждена", kk: "Жазба бүлінген", en: "The recording is damaged" },
    "card.sttNotConfigured": { ru: "Сервис распознавания не настроен", kk: "Сөйлеуді тану қызметі бапталмаған", en: "The speech recognition service is not configured" },
    "card.sttIncompleteResponse": { ru: "Сервис распознавания вернул неполный ответ", kk: "Сөйлеуді тану қызметі толық емес жауап қайтарды", en: "The speech recognition service returned an incomplete response" },
    "card.sttInvalidDuration": { ru: "Сервис распознавания вернул неверную длительность", kk: "Сөйлеуді тану қызметі қате ұзақтық қайтарды", en: "The speech recognition service returned an invalid duration" },
    "card.sttInterrupted": { ru: "Расшифровка прервалась. Повторите её", kk: "Транскрипт жасау үзілді. Қайталаңыз", en: "Transcription was interrupted. Try again" },
    "card.sttMaskFailed": { ru: "Не удалось безопасно скрыть личные данные. Повторите расшифровку", kk: "Жеке деректерді қауіпсіз жасыру мүмкін болмады. Транскрипт жасауды қайталаңыз", en: "Personal data could not be safely hidden. Retry transcription" },
    "card.sttProcessingFailed": { ru: "Не удалось обработать расшифровку. Повторите её", kk: "Транскриптті өңдеу мүмкін болмады. Қайталаңыз", en: "Could not process the transcript. Try again" },
    "card.sttCheckFailed": { ru: "Не удалось проверить запись", kk: "Жазбаны тексеру мүмкін болмады", en: "Could not check the recording" },
    "card.stale": { ru: "Оценка устарела", kk: "Бағалау ескірген", en: "Evaluation is out of date" },
    "card.staleDetail": { ru: "Транскрипт изменился. Прежний итог {score} больше не участвует в сводке.", kk: "Транскрипт өзгерді. Бұрынғы {score} нәтижесі жиынтықта енді есептелмейді.", en: "The transcript changed. The previous score of {score} is no longer included in the summary." },
    "card.notEvaluated": { ru: "Диалог ещё не оценён", kk: "Диалог әлі бағаланбаған", en: "This conversation has not been evaluated" },
    "card.analystStarts": { ru: "Оценку запускает аналитик.", kk: "Бағалауды талдаушы бастайды.", en: "An analyst starts the evaluation." },
    "card.evaluateDetail": { ru: "Модель пройдёт по каждому критерию чек-листа и приведёт реплики, на которых основан ответ.", kk: "Модель чек-парақтың әр критерийін тексеріп, жауабына негіз болған репликаларды көрсетеді.", en: "The model checks each criterion and cites the conversation turns supporting its answer." },
    "card.evaluate": { ru: "Оценить", kk: "Бағалау", en: "Evaluate" },
    "card.reevaluate": { ru: "Переоценить", kk: "Қайта бағалау", en: "Re-evaluate" },
    "card.evaluating": { ru: "Оценка идёт", kk: "Бағалануда", en: "Evaluating" },
    "card.evaluationProgress": { ru: "Оценка идёт: {done} из {total} критериев", kk: "Бағалануда: {total} критерийдің {done}", en: "Evaluating: {done} of {total} criteria" },
    "card.incomplete": { ru: "Оценка не завершена", kk: "Бағалау аяқталмаған", en: "Evaluation is incomplete" },
    "card.savedProgress": { ru: "Готово {done} из {total} критериев. Ответы сохранены.", kk: "{total} критерийдің {done} дайын. Жауаптар сақталды.", en: "{done} of {total} criteria are complete. Answers have been saved." },
    "card.noTotal": { ru: "Итог не рассчитывается", kk: "Қорытынды есептелмейді", en: "No total score" },
    "card.noScoredCriteria": { ru: "К этому разговору не применяется ни один критерий с баллами", kk: "Бұл диалогқа ұпай берілетін критерийлер қолданылмайды", en: "No scored criteria apply to this conversation" },
    "card.beforeAppeals": { ru: "до апелляций", kk: "апелляцияларға дейін", en: "before appeals" },
    "card.of100": { ru: "из 100", kk: "100 ұпайдан", en: "of 100" },
    "card.checklistVersion": { ru: "По чек-листу версии {version}", kk: "Чек-парақтың {version}-нұсқасы бойынша", en: "Checklist version {version}" },
    "card.activeVersion": { ru: "Активна версия {version}", kk: "Белсенді нұсқа: {version}", en: "Active version: {version}" },
    "card.modelReading": { ru: "Модель читает диалог", kk: "Модель диалогты оқып жатыр", en: "The model is reading the conversation" },
    "card.someUnfinished": { ru: "Часть критериев не оценена", kk: "Кейбір критерийлер бағаланбаған", en: "Some criteria have not been evaluated" },
    "card.evaluatedAgo": { ru: "Оценено {ago}", kk: "{ago} бағаланды", en: "Evaluated {ago}" },
    "card.evaluatedDuration": { ru: "Оценено {ago} за {seconds} с", kk: "{ago}, {seconds} с ішінде бағаланды", en: "Evaluated {ago} in {seconds}s" },
    "card.evaluationCost": { ru: "Стоимость оценки: {cost}", kk: "Бағалау құны: {cost}", en: "Evaluation cost: {cost}" },
    "card.evaluationUsage": { ru: "Запросы: {calls} · Токены на входе: {input} · На выходе: {output}", kk: "Сұраулар: {calls} · Кіріс токендері: {input} · Шығыс токендері: {output}", en: "Requests: {calls} · Input tokens: {input} · Output tokens: {output}" },
    "card.grossError": { ru: "Грубая ошибка", kk: "Өрескел қате", en: "Serious violation" },
    "card.naSubject": { ru: ({count}) => `${["", "Один", "Два", "Три", "Четыре"][count] || count} ${DA.fmt.plural(count, ["критерий к этому разговору не относится", "критерия к этому разговору не относятся", "критериев к этому разговору не относятся"])}`, kk: "Бұл диалогқа {count} критерий қолданылмайды", en: { one: "One criterion does not apply to this conversation", other: "{count} criteria do not apply to this conversation" } },
    "card.naAll": { ru: "{subject}. Применимых критериев с баллами нет.", kk: "{subject}. Ұпай берілетін қолданылатын критерийлер жоқ.", en: "{subject}. No scored criteria apply." },
    "card.redistributedPoints": { ru: { one: "{count} балл распределён", few: "{count} балла распределены", other: "{count} баллов распределены" }, kk: "{count} ұпай бөлінеді", en: { one: "{count} point is distributed", other: "{count} points are distributed" } },
    "card.redistributedFraction": { ru: "{points} балла распределены", kk: "{points} ұпай бөлінеді", en: "{points} points are distributed" },
    "card.naRedistributed": { ru: "{subject}, поэтому {points} между остальными.", kk: "{subject}. Қалғандарына {points}.", en: "{subject}, so {points} among the others." },
    "card.originalScore": { ru: "Исходная оценка ", kk: "Бастапқы баға ", en: "Original score " },
    "card.decisions": { ru: "Решения: изменено {changed}, подтверждено {confirmed}", kk: "Шешімдер: {changed} өзгертілді, {confirmed} расталды", en: "Decisions: {changed} changed, {confirmed} confirmed" },
    "card.finalScore": { ru: "Финальный итог ", kk: "Соңғы нәтиже ", en: "Final score " },
    "card.manualReview": { ru: { one: "{count} критерий стоит проверить вручную", few: "{count} критерия стоит проверить вручную", other: "{count} критериев стоит проверить вручную" }, kk: "{count} критерийді қолмен тексерген жөн", en: { one: "{count} criterion needs a manual review", other: "{count} criteria need a manual review" } },
    "card.pointsOf": { ru: "{points} из {max}", kk: "{max} ұпайдан {points}", en: "{points} of {max}" },
    "card.notApplicable": { ru: "не применяется", kk: "қолданылмайды", en: "not applicable" },
    "card.disputed": { ru: "Оспорено", kk: "Даулы", en: "Disputed" },
    "card.disputedDetail": { ru: "Аналитик не согласен с оценкой, решение за проверяющим", kk: "Талдаушы бағамен келіспейді, шешімді тексеруші қабылдайды", en: "The analyst disagrees with the score. The reviewer decides." },
    "card.reviewed": { ru: "Пересмотрено", kk: "Қайта қаралды", en: "Reviewed" },
    "card.changedDetail": { ru: "Проверяющий изменил оценку: было {before}, стало {after}", kk: "Тексеруші бағаны өзгертті: бұрын {before}, қазір {after}", en: "The reviewer changed the answer from {before} to {after}" },
    "card.confirmedDetail": { ru: "Проверяющий подтвердил оценку после рассмотрения апелляции", kk: "Тексеруші апелляцияны қарап, бағаны растады", en: "The reviewer confirmed the score after considering the appeal" },
    "card.needsReview": { ru: "Стоит проверить", kk: "Тексерген жөн", en: "Needs review" },
    "card.needsReviewDetail": { ru: "Проверьте ответ модели по исходному диалогу", kk: "Модель жауабын бастапқы диалогпен салыстырып тексеріңіз", en: "Check the model's answer against the original conversation." },
    "card.criterionFailed": { ru: "Не удалось оценить этот критерий", kk: "Бұл критерийді бағалау мүмкін болмады", en: "Could not evaluate this criterion" },
    "card.whyNA": { ru: "Почему не применимо", kk: "Неліктен қолданылмайды", en: "Why it does not apply" },
    "card.speakerTime": { ru: "{speaker}, {time}", kk: "{speaker}, {time}", en: "{speaker}, {time}" },
    "card.expectedHere": { ru: "Здесь ожидалось действие", kk: "Мұнда әрекет күтілді", en: "An action was expected here" },
    "card.quotes": { ru: "Цитаты из разговора", kk: "Диалогтан дәйексөздер", en: "Conversation quotes" },
    "card.noQuote": { ru: "Модель не привела реплику", kk: "Модель реплика келтірмеді", en: "The model did not cite a turn" },
    "card.checkedRange": { ru: "Проверенный участок {from}–{to}", kk: "Тексерілген бөлік {from}–{to}", en: "Reviewed segment {from}–{to}" },
    "card.flagCalculation": { ru: "Нарушение отмечается отдельно и не меняет итоговый балл.", kk: "Бұзушылық бөлек белгіленеді және қорытынды ұпайды өзгертпейді.", en: "The violation is recorded separately and does not change the total score." },
    "card.naAllCalculation": { ru: "Критерий не учитывается. В этом разговоре нет применимых критериев с баллами.", kk: "Критерий есептелмейді. Бұл диалогта ұпай берілетін қолданылатын критерийлер жоқ.", en: "This criterion is excluded. No scored criteria apply to this conversation." },
    "card.naCalculation": { ru: "Критерий не учитывается, {points} между остальными.", kk: "Критерий есептелмейді, қалғандарына {points}.", en: "This criterion is excluded; {points} among the others." },
    "card.adjustedCalculation": { ru: "Вес критерия {weight} из {total}. {subject}, поэтому сейчас он стоит {max} балла. Набрано {points}.", kk: "Критерий салмағы: {total} ішінен {weight}. {subject}, сондықтан оның қазіргі салмағы {max} ұпай. Жиналғаны: {points}.", en: "Criterion weight: {weight} of {total}. {subject}, so it is now worth {max} points. Earned: {points}." },
    "card.calculation": { ru: "Вес критерия {weight} из {total}. Набрано {points} из {max}.", kk: "Критерий салмағы: {total} ішінен {weight}. {max} ұпайдан {points} жиналды.", en: "Criterion weight: {weight} of {total}. Earned {points} of {max}." },
    "card.howCalculated": { ru: "Как посчитаны баллы", kk: "Ұпайлар қалай есептелді", en: "How points are calculated" },
    "card.withReviewer": { ru: "На рассмотрении у проверяющего", kk: "Тексерушінің қарауында", en: "Under review" },
    "card.reviewAppeal": { ru: "Разобрать апелляцию", kk: "Апелляцияны қарау", en: "Review appeal" },
    "card.answerChanged": { ru: "Изменено проверяющим: было {before}, стало {after}", kk: "Тексеруші өзгертті: бұрын {before}, қазір {after}", en: "Changed by reviewer: {before} → {after}" },
    "card.answerConfirmed": { ru: "Оценка подтверждена проверяющим", kk: "Бағаны тексеруші растады", en: "Score confirmed by reviewer" },
    "card.appeal": { ru: "Оспорить оценку", kk: "Бағаға дау айту", en: "Appeal score" },
    "card.naRule": { ru: "Критерий не применяется: {condition}", kk: "Критерий қолданылмайды: {condition}", en: "The criterion does not apply: {condition}" },
    "card.rule": { ru: "Правило критерия", kk: "Критерий ережесі", en: "Criterion rule" },
    "card.appealExample": { ru: "Например: оператор представился во втором сообщении", kk: "Мысалы: оператор екінші хабарламада өзін таныстырды", en: "For example: the operator introduced themselves in the second message" },
    "card.moreCharacters": { ru: { one: "Ещё {count} символ", few: "Ещё {count} символа", other: "Ещё {count} символов" }, kk: "Тағы {count} таңба", en: { one: "{count} more character", other: "{count} more characters" } },
    "card.submitAppeal": { ru: "Подать апелляцию", kk: "Апелляция жіберу", en: "Submit appeal" },
    "card.appealTitle": { ru: "Апелляция по критерию", kk: "Критерий бойынша апелляция", en: "Criterion appeal" },
    "card.modelScore": { ru: "Оценка модели", kk: "Модель бағасы", en: "Model score" },
    "card.whyDisagree": { ru: "Почему вы не согласны", kk: "Неліктен келіспейсіз", en: "Why do you disagree?" },
    "card.proposedOptional": { ru: "Какой должна быть оценка, по желанию", kk: "Қалауыңыз бойынша, қандай баға болуы керек", en: "Suggested answer, optional" },
    "card.ifAccepted": { ru: "Если согласиться, итог станет", kk: "Қабылданса, қорытынды", en: "If accepted, the total becomes" },
    "card.proposed": { ru: "Предлагаемая оценка", kk: "Ұсынылған баға", en: "Suggested answer" },
    "card.cancel": { ru: "Отмена", kk: "Бас тарту", en: "Cancel" },
    "card.appealSent": { ru: "Апелляция отправлена проверяющему", kk: "Апелляция тексерушіге жіберілді", en: "Appeal sent to reviewer" },
    "card.contents": { ru: "Содержимое карточки", kk: "Карточка мазмұны", en: "Card content" },
    "card.title": { ru: "Обращение № {number}", kk: "№ {number} өтініш", en: "Conversation {number}" },
    "card.dateDuration": { ru: "{date}, длительность {duration}", kk: "{date}, ұзақтығы {duration}", en: "{date}, duration {duration}" },
    "card.historyOpen": { ru: "Открыта сохранённая оценка. ", kk: "Сақталған бағалау ашылды. ", en: "Viewing a saved evaluation. " },
    "card.currentConversation": { ru: "Перейти к текущему обращению", kk: "Ағымдағы өтінішке өту", en: "Open current conversation" }
  });
  const labelFor = (answer, c) => DA.answerText(answer, c);
  const TONE_VARS = {
    yes: ["var(--da-yes)", "var(--da-yes-soft)"], partial: ["var(--da-partial)", "var(--da-partial-soft)"],
    no: ["var(--da-no)", "var(--da-no-soft)"], na: ["var(--da-na)", "var(--da-na-soft)"],
    flag: ["var(--da-gross)", "var(--da-gross-soft)"], pending: ["var(--da-line)", "var(--da-surface-2)"]
  };
  const toneStyle = (tone) => ({ "--lit": TONE_VARS[tone][0], "--lit-soft": TONE_VARS[tone][1] });
  function setTone(node, tone) { for (const [k, v] of Object.entries(toneStyle(tone))) node.style.setProperty(k, v); }

  DA.views.card = function mount(root, params) {
    const cardContext = DA.data.cardContext(params.id, params.query.evaluation);
    const conv = cardContext.conv;
    if (!conv) {
      root.append(h("div", { class: "da-page" }, h("div", { class: "da-empty" },
        h("h2", { tabindex: -1 }, m("notFound")),
        h("p", {}, m("notImported")),
        DA.state.role === "reviewer" ? h("a", { class: "da-btn", href: "#/review" }, m("backQueue")) : h("a", { class: "da-btn", href: "#/" }, m("backList")))));
      return;
    }
    const cid = conv.conversation_id;
    const isCall = conv.channel === "voice call";
    let ev = cardContext.ev;
    const evaluationSignature = (value) => value ? JSON.stringify([value.id, value.conversationId, value.checklistVersion,
      value.transcriptHash, value.stale, value.status, value.total, value.originalTotal, value.grossFlagged,
      value.sections, value.items, value.usage, value.durationSec, value.minutesAgo]) : null;
    let renderedEvaluationSignature = null;
    const CL = () => (ev ? DA.checklist(ev.checklistVersion) : DA.activeChecklist());
    let openId = params.query.criterion || null;
    let running = !!ev && ["queued", "running"].includes(ev.status);
    let disposed = false, selectedTurn = null, loadError = null;
    const controller = new AbortController();
    /* Проверяющий видит карточку только для чтения: без переоценки и без новых апелляций. */
    const historyView = !!params.query.evaluation;
    const readOnly = DA.state.role === "reviewer" || historyView;
    const timers = [];

    /* ---------- Транскрипт ---------- */
    const transcript = h("section", { class: "da-transcript", "aria-label": m("dialogue") });
    const bracket = h("div", { class: "da-bracket", "aria-hidden": "true" }, h("span", {}, m("checked")));
    const turnNodes = [];
    const sttNodes = [];
    const listenButtons = [];
    let transcription = null, transcriptSource = "crm", sttError = "", sttPending = false, sttTimer = null;
    let player = null, speakingNode = null, selectedSttTurn = null, lastManualScroll = 0;
    let lastPlayback = { time: 0, playing: false };
    const sourceHash = conv.transcriptHash || ev?.transcriptHash;
    const currentHash = DA.state.conversations[cid]?.transcriptHash;
    const historicAudioChanged = historyView && (!sourceHash || !currentHash || sourceHash !== currentHash);
    const audioHref = DA.audioHref(conv);
    const canPlay = isCall && audioHref && !historicAudioChanged && DA.audioPlayer;
    const gaps = DA.tx.gaps(conv);
    const firstOp = DA.tx.firstOperatorIdx(conv);
    const turnsBox = h("div", { class: "da-turns" });

    conv.transcript.forEach((t, i) => {
      if (gaps[i]) {
        const long = gaps[i] >= 180;
        turnsBox.append(h("div", { class: "da-gap" + (long ? " is-long" : "") }, DA.icon("clock"), m("waitingReply", { time: DA.fmt.duration(gaps[i]) })));
      }
      let node;
      if (t.speaker === "system") {
        const kind = DA.tx.systemKind(t.text);
        const ic = { verified: "check", escalate: "escalate", closed: "x", hold: "pause" }[kind];
        node = h("div", { class: `da-sys k-${kind}`, "data-idx": i, tabindex: -1 },
          h("span", {}, ic ? DA.icon(ic) : null, h("span", {}, t.text), h("time", { datetime: t.timestamp, title: t.timestamp }, DA.tx.clock(t.timestamp))));
      } else {
        const long = t.speaker === "bot" && t.text.length > 220;
        const bubble = h("div", { class: "da-bubble" + (long ? " is-clamped" : ""), tabindex: 0, role: "button", "aria-pressed": "false",
          "aria-label": m("selectTurn", () => ({ speaker: DA.speakerLabel[t.speaker], time: DA.tx.clock(t.timestamp) })),
          onclick: () => selectTurn(i), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectTurn(i); } } }, t.text);
        node = h("div", { class: `da-turn r-${t.speaker}`, "data-idx": i, tabindex: -1 },
          h("div", { class: "da-turn-meta" },
            h("b", {}, dynamic(() => DA.speakerLabel[t.speaker])), h("time", {}, DA.tx.clock(t.timestamp)),
            i === firstOp ? h("span", { class: "da-first" }, m("firstReply")) : null,
            canPlay ? listenButton(() => seekCrmTurn(i, true), "crm", i) : null),
          bubble,
          long ? h("button", { class: "da-more", type: "button", onclick: (e) => { bubble.classList.toggle("is-clamped"); DA.i18n.refresh(e.currentTarget.firstChild); } }, dynamic(() => DA.t(`card.${bubble.classList.contains("is-clamped") ? "showFull" : "collapse"}`))) : null,
          h("div", { class: "da-turn-tags" }));
        node.addEventListener("mouseenter", () => hoverTurn(i));
        node.addEventListener("mouseleave", () => hoverTurn(null));
      }
      turnNodes[i] = node;
      turnsBox.append(node);
    });
    const canonicalContent = Array.from(turnsBox.childNodes);

    if (canPlay) player = DA.audioPlayer({ conversationId: cid, src: audioHref, onTime: playbackTime });
    const ai = DA.cardAI?.({ conversation: conv, evaluation: ev, historyView, signal: controller.signal,
      onTranscriptChange: () => { if (focused) focusCriterion(ev?.items.find((item) => item.criterionId === focused) || null); } });
    const transcriptTools = h("div", { class: "da-transcript-tools" });
    const sttControls = h("div", { class: "da-transcription-controls", hidden: !isCall });
    const sttStatus = h("div", { class: "da-transcription-status", role: "status" });
    sttControls.append(h("h2", { class: "da-transcription-title" }, m("transcript")), sttStatus);
    transcriptTools.append(sttControls);
    if (ai?.translationControl) transcriptTools.append(ai.translationControl);
    transcript.append(...[bracket, player?.el, ai?.summary,
      historicAudioChanged ? h("p", { class: "da-transcription-status" }, m("historyTranscriptOnly")) : null,
      transcriptTools, turnsBox].filter(Boolean));

    function listenButton(action, source, index) {
      const button = h("button", { class: "da-turn-listen", type: "button", "aria-label": m("listenHere"), "aria-pressed": "false", title: m("listenHere"), onclick: (event) => {
        event.stopPropagation();
        lastManualScroll = Date.now();
        if (button.getAttribute("aria-pressed") === "true") player?.audio.pause();
        else if (player && !player.audio.ended && source === transcriptSource && playbackIndex(player.audio.currentTime) === index && player.audio.currentTime > 0) player.seek(player.audio.currentTime, { play: true });
        else action();
      } }, DA.icon("play", 13), h("span", {}, m("listen")));
      listenButtons.push({ button, source, index });
      return button;
    }
    function updateListenButtons(index, playing) {
      for (const control of listenButtons) {
        const active = !!playing && control.source === transcriptSource && control.index === index;
        if (control.button.getAttribute("aria-pressed") === String(active)) continue;
        const label = m(active ? "pauseRecording" : "listenHere");
        control.button.setAttribute("aria-pressed", String(active));
        DA.i18n.bindAttr(control.button, "aria-label", label); DA.i18n.bindAttr(control.button, "title", label);
        control.button.replaceChildren(DA.icon(active ? "pause" : "play", 13), h("span", {}, m(active ? "pause" : "listen")));
      }
    }
    function transcriptionReady() {
      return transcription?.status === "done" && !historyView && !!sourceHash
        && transcription.transcriptHash === sourceHash && Array.isArray(transcription.turns) && transcription.turns.length > 0;
    }
    function mappedSttIndex(idx) {
      if (!transcriptionReady()) return -1;
      const orgIdx = conv.transcript[idx]?.idx ?? idx;
      const reliable = transcription.turns.findIndex((turn) => turn.orgIdx === orgIdx && !turn.doubtful && Number.isFinite(turn.start));
      return reliable >= 0 ? reliable : transcription.turns.findIndex((turn) => turn.orgIdx === orgIdx && Number.isFinite(turn.start));
    }
    function crmTime(idx) {
      const turn = conv.transcript[idx];
      if (!turn) return 0;
      const mapped = transcription?.turns?.[mappedSttIndex(idx)];
      if (mapped) return Math.max(0, mapped.start);
      const seconds = Number.isFinite(turn.tSec) ? turn.tSec : DA.tx.seconds(turn.timestamp, conv.transcript[0].timestamp);
      return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    }
    function seekCrmTurn(idx, play) {
      if (!player) return;
      player.seek(crmTime(idx), { play: !!play });
    }
    function maskedText(text) {
      return String(text).split(/(\[[^\]\r\n]{1,100}\])/g).filter(Boolean).map((part) => /^\[.*скры.*\]$/i.test(part)
        ? h("span", { class: "da-mask" }, part.slice(1, -1)) : document.createTextNode(part));
    }
    function renderSttTurns() {
      sttNodes.length = 0;
      for (let i = listenButtons.length - 1; i >= 0; i--) if (listenButtons[i].source === "stt") listenButtons.splice(i, 1);
      if (!transcriptionReady()) return;
      const speakers = new Map((transcription.speakers || []).map((speaker, index) => [speaker.speakerId, { ...speaker, number: index + 1 }]));
      for (const [i, turn] of transcription.turns.entries()) {
        const speaker = speakers.get(turn.speakerId), inferredRole = turn.role || speaker?.role;
        const role = ["client", "operator", "bot"].includes(inferredRole) ? inferredRole : "unknown";
        const name = () => role === "unknown" ? t("voice", { number: speaker?.number || i + 1 }) : DA.speakerLabel[role];
        const select = (play) => {
          markSelectedTurn(null);
          selectedSttTurn = i;
          sttNodes.forEach((node, index) => { node.classList.toggle("is-selected", index === i); node.querySelector(".da-bubble").setAttribute("aria-pressed", String(index === i)); });
          player?.seek(turn.start, { play: !!play });
        };
        const bubble = h("div", { class: "da-bubble", role: "button", tabindex: 0, "aria-pressed": String(selectedSttTurn === i), "aria-label": m("goTurn", () => ({ speaker: name(), time: DA.fmt.duration(turn.start) })),
          onclick: () => select(false), onkeydown: (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(false); } } }, maskedText(turn.text));
        const node = h("div", { class: `da-turn r-${role}`, "data-stt-idx": turn.idx ?? i, tabindex: -1 },
          h("div", { class: "da-turn-meta" }, h("b", {}, dynamic(name)), h("time", {}, DA.fmt.duration(turn.start)),
            turn.doubtful ? h("span", { class: "da-turn-doubtful" }, m("uncertainTime")) : null,
            player ? listenButton(() => select(true), "stt", i) : null), bubble);
        sttNodes.push(node);
      }
    }
    function attachDisplayedTranscript() {
      const stt = transcriptSource === "stt";
      ai?.attachTranscript({ turnNodes: stt ? sttNodes : turnNodes, source: transcriptSource,
        turns: stt ? transcription.turns : conv.transcript, transcriptHash: sourceHash,
        sourceHash: stt ? transcription.sourceHash : sourceHash });
    }
    function speechWithSystemEvents() {
      const words = (value) => (String(value).toLowerCase().replace(/\[[^\]]*\]/g, " ").match(/[\p{L}\p{N}]+/gu) || []);
      const sharesAnchor = (first, second) => {
        const a = words(first), b = words(second);
        if (a.length < 3 || b.length < 3) return false;
        const triples = new Set(a.slice(0, -2).map((_, index) => a.slice(index, index + 3).join(" ")));
        return b.slice(0, -2).some((_, index) => triples.has(b.slice(index, index + 3).join(" ")));
      };
      const originalIndex = new Map(conv.transcript.map((turn, index) => [turn.idx ?? index, index]));
      // orgIdx может быть приближённым. Порядок подтверждаем совпавшей фразой.
      const anchors = transcription.turns.flatMap((turn, index) => {
        const original = originalIndex.get(turn.orgIdx), source = conv.transcript[original];
        return source && source.speaker !== "system" && !turn.doubtful && sharesAnchor(turn.text, source.text)
          ? [{ original, index }] : [];
      });
      const before = Array.from({ length: sttNodes.length + 1 }, () => []);
      let previousPosition = 0;
      conv.transcript.forEach((event, index) => {
        if (event.speaker !== "system") return;
        const first = conv.transcript[0]?.timestamp;
        const relative = DA.tx.seconds(event.timestamp, first) - (first?.includes("T") ? 0 : DA.tx.seconds(first, first));
        const nextAtTime = transcription.turns.findIndex((turn) => turn.start >= relative);
        let position = nextAtTime < 0 ? sttNodes.length : nextAtTime;
        const preceding = anchors.filter((anchor) => anchor.original < index).sort((a, b) => b.original - a.original || b.index - a.index)[0];
        const following = anchors.filter((anchor) => anchor.original > index).sort((a, b) => a.original - b.original || a.index - b.index)[0];
        if (!preceding || !following || preceding.index < following.index) {
          if (preceding) position = Math.max(position, preceding.index + 1);
          if (following) position = Math.min(position, following.index);
        }
        position = Math.max(previousPosition, Math.min(sttNodes.length, position));
        before[position].push(turnNodes[index]); previousPosition = position;
      });
      return before.flatMap((events, index) => [...events, ...(index < sttNodes.length ? [sttNodes[index]] : [])]);
    }
    function presentTranscript(force) {
      const source = transcriptionReady() ? "stt" : "crm";
      if (source === transcriptSource && !force) return;
      transcriptSource = source;
      turnsBox.classList.toggle("da-stt-turns", source === "stt");
      turnsBox.replaceChildren(...(source === "stt" ? speechWithSystemEvents() : canonicalContent));
      // Отложенный запасной транскрипт мог быть отсоединён во время смены языка.
      const walker = document.createTreeWalker(turnsBox, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) DA.i18n.refresh(walker.currentNode);
      lastManualScroll = Date.now();
      speakingNode?.classList.remove("is-speaking"); speakingNode = null;
      focusCriterion(ev?.items.find((item) => item.criterionId === focused) || null);
      attachDisplayedTranscript();
      playbackTime(lastPlayback.time, lastPlayback);
    }
    function renderTranscriptionState() {
      const status = transcription?.status;
      const mismatched = status === "done" && transcription.transcriptHash !== sourceHash;
      const waiting = !status || ["queued", "running"].includes(status);
      const errorCopy = (value, fallback) => dynamic(() => {
        const raw = typeof value === "object" ? value?.message : value;
        const key = { "Не удалось загрузить расшифровку": "loadTranscriptFailed", "Не удалось расшифровать звонок": "transcribeFailed", "Не удалось скачать запись": "downloadFailed", "Сервис распознавания не ответил": "serviceTimeout", "Запись повреждена": "recordingDamaged",
          "Сервис распознавания не настроен": "sttNotConfigured", "Сервис распознавания вернул неполный ответ": "sttIncompleteResponse", "Сервис распознавания вернул неверную длительность": "sttInvalidDuration", "Расшифровка прервалась. Повторите её": "sttInterrupted",
          "Не удалось безопасно скрыть личные данные. Повторите расшифровку": "sttMaskFailed", "Не удалось обработать расшифровку. Повторите её": "sttProcessingFailed", "Не удалось проверить запись": "sttCheckFailed" }[raw];
        return key ? t(key) : value && typeof value === "object" ? DA.apiErrorMessage(value) : raw || t(fallback);
      });
      const copy = sttError ? errorCopy(sttError, "loadTranscriptFailed") : status === "failed" ? errorCopy(transcription.error, "transcribeFailed") : mismatched ? m("sourceChanged")
        : status === "not_queued" ? m("transcriptNotReady") : status === "queued" ? m("transcriptQueued")
        : status === "running" ? m({ download: "downloading", transcribe: "recognizing", mask: "masking", build: "buildingTurns" }[transcription.step] || "transcribing")
        : status === "done" ? transcription.turns?.length ? "" : m("noSpeech") : m("loadingTranscript");
      const action = !historyView && (sttError || status === "failed" || status === "not_queued");
      sttStatus.replaceChildren(...[copy ? h("span", { class: !sttError && waiting ? "da-thinking" : "" }, copy) : null,
        action ? h("button", { class: "da-btn is-text is-sm", type: "button", disabled: sttPending, onclick: () => loadTranscription(!sttError) },
          m(sttPending ? "loading" : status === "not_queued" && !sttError ? "transcribe" : "retry")) : null].filter(Boolean));
      sttStatus.hidden = !copy || !isCall || historyView || status === "disabled";
      presentTranscript();
    }
    async function loadTranscription(retry) {
      if (disposed || sttPending || !isCall || historyView) return;
      clearTimeout(sttTimer); sttPending = true; sttError = ""; renderTranscriptionState();
      try {
        const next = retry ? await DA.api.retryTranscription(cid, { signal: controller.signal }) : await DA.api.getTranscription(cid, { signal: controller.signal });
        if (disposed) return;
        const changed = transcription?.status !== "done" || transcription?.transcriptHash !== next.transcriptHash || transcription?.sourceHash !== next.sourceHash;
        transcription = next;
        if (changed && transcriptionReady()) { renderSttTurns(); presentTranscript(true); }
        if (transcriptionReady()) player?.setMetadata(transcription);
        refreshAudioMarkers();
      } catch (error) {
        if (disposed || error.name === "AbortError") return;
        sttError = error;
      } finally {
        sttPending = false;
        if (!disposed) {
          renderTranscriptionState();
          if (!sttError && ["queued", "running"].includes(transcription?.status)) sttTimer = setTimeout(() => loadTranscription(false), 1000);
        }
      }
    }
    function refreshAudioMarkers(item) {
      if (!player) return;
      const active = item === undefined ? ev?.items.find((entry) => entry.criterionId === focused) : item;
      const markers = [];
      if (transcriptionReady()) {
        const roles = new Map(transcription.speakers.map((speaker) => [speaker.speakerId, speaker.role]));
        transcription.turns.forEach((turn) => { if ((turn.role || roles.get(turn.speakerId)) === "operator" && !turn.doubtful) markers.push({ time: turn.start, kind: "operator" }); });
      } else conv.transcript.forEach((turn, idx) => { if (turn.speaker === "operator") markers.push({ time: crmTime(idx), kind: "operator" }); });
      if (active?.status === "done" && !ev.stale) {
        const tone = DA.tone(active.answer, DA.criterionById(CL(), active.criterionId));
        active.evidence.forEach((evidence) => markers.push({ time: crmTime(evidence.turnIdx), kind: "evidence", tone }));
      }
      player.setMarkers(markers);
    }
    function playbackIndex(time) {
      return transcriptSource === "stt"
        ? transcription.turns.findIndex((turn) => time >= turn.start && time < turn.end)
        : conv.transcript.findIndex((turn, i) => turn.speaker !== "system" && time >= crmTime(i) && time < (i + 1 < conv.transcript.length ? crmTime(i + 1) : Infinity));
    }
    function playbackTime(time, state) {
      lastPlayback = { time, playing: !!state.playing };
      let node = null, activeIndex = -1;
      if (state.playing) {
        activeIndex = playbackIndex(time);
        if (transcriptSource === "stt") {
          if (!transcription.turns[activeIndex]?.doubtful) node = sttNodes[activeIndex];
        } else {
          node = turnNodes[activeIndex];
        }
      }
      updateListenButtons(activeIndex, state.playing);
      if (node === speakingNode) return;
      speakingNode?.classList.remove("is-speaking"); speakingNode = node;
      if (!node) return;
      node.classList.add("is-speaking");
      if (Date.now() - lastManualScroll < 4000 || !node.getClientRects().length) return;
      const bounds = node.getBoundingClientRect(), playerBottom = player?.el.getBoundingClientRect().bottom || 0;
      if (bounds.top < Math.max(120, playerBottom + 12) || bounds.bottom > innerHeight - 24) node.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    const manualScroll = () => { lastManualScroll = Date.now(); };
    if (player) {
      document.addEventListener("wheel", manualScroll, { passive: true, signal: controller.signal });
      document.addEventListener("touchmove", manualScroll, { passive: true, signal: controller.signal });
      document.addEventListener("keydown", (event) => { if (["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) manualScroll(); }, { signal: controller.signal });
    }

    /* ---------- Связь критерий ↔ реплики ---------- */
    let focused = null;
    function focusCriterion(item) {
      focused = item ? item.criterionId : null;
      turnNodes.forEach((n) => n && n.classList.remove("is-lit"));
      refreshAudioMarkers(item);
      if (!item || transcriptSource === "stt") { transcript.classList.remove("is-focusing"); bracket.classList.remove("is-on"); ribbon && ribbon.light(item?.criterionId || null); return; }
      const c = DA.criterionById(CL(), item.criterionId);
      const tone = DA.tone(item.answer, c);
      setTone(transcript, tone);
      const idxs = new Set(item.evidence.map((e) => e.turnIdx));
      if (item.checkedRange) for (let k = item.checkedRange.fromIdx; k <= item.checkedRange.toIdx; k++) if (k === item.checkedRange.fromIdx || k === item.checkedRange.toIdx) idxs.add(k);
      idxs.forEach((k) => turnNodes[k] && turnNodes[k].classList.add("is-lit"));
      transcript.classList.toggle("is-focusing", idxs.size > 0);
      if (item.checkedRange && turnNodes[item.checkedRange.fromIdx] && turnNodes[item.checkedRange.toIdx]) {
        const a = turnNodes[item.checkedRange.fromIdx], b = turnNodes[item.checkedRange.toIdx];
        bracket.style.top = a.offsetTop + "px";
        bracket.style.height = b.offsetTop + b.offsetHeight - a.offsetTop + "px";
        bracket.classList.add("is-on");
      } else bracket.classList.remove("is-on");
      ribbon && ribbon.light(item.criterionId);
    }
    function jumpTo(idx, tone) {
      showCardPart("dialogue");
      let n;
      if (conv.transcript[idx]?.speaker === "system") {
        selectedSttTurn = null;
        sttNodes.forEach((node) => { node.classList.remove("is-selected"); node.querySelector(".da-bubble").setAttribute("aria-pressed", "false"); });
        markSelectedTurn(idx);
        n = turnNodes[idx];
      } else if (transcriptSource === "stt") {
        seekCrmTurn(idx, true);
        markSelectedTurn(null);
        // orgIdx связывает участки записи; текст цитаты остаётся в панели оценки.
        let mapped = mappedSttIndex(idx);
        if (mapped < 0) {
          const time = crmTime(idx);
          mapped = transcription.turns.reduce((nearest, turn, index, turns) => nearest < 0 || Math.abs(turn.start - time) < Math.abs(turns[nearest].start - time) ? index : nearest, -1);
        }
        selectedSttTurn = mapped;
        sttNodes.forEach((node, index) => {
          node.classList.toggle("is-selected", index === mapped);
          node.querySelector(".da-bubble").setAttribute("aria-pressed", String(index === mapped));
        });
        n = sttNodes[mapped];
      } else {
        seekCrmTurn(idx, true);
        markSelectedTurn(idx);
        n = turnNodes[idx];
        if (n) {
          setTone(n, tone || "yes");
          n.classList.remove("is-flash"); void n.offsetWidth; n.classList.add("is-flash");
        }
      }
      if (!n) return;
      lastManualScroll = Date.now();
      n.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      n.focus({ preventScroll: true });
    }
    function markSelectedTurn(idx) {
      selectedTurn = idx;
      turnNodes.forEach((node, i) => {
        node.classList.toggle("is-selected", i === selectedTurn);
        const bubble = node.querySelector(".da-bubble");
        if (bubble) bubble.setAttribute("aria-pressed", String(i === selectedTurn));
      });
    }
    function selectTurn(idx) {
      seekCrmTurn(idx, false);
      markSelectedTurn(selectedTurn === idx ? null : idx);
      const related = selectedTurn == null || !ev || ev.stale ? [] : ev.items.filter((item) => item.status === "done" && item.evidence.some((e) => e.turnIdx === selectedTurn));
      if (related.length) toggle(related[0].criterionId, true, false);
      else { openId = null; renderPanel(); focusCriterion(null); }
      hoverTurn(selectedTurn);
    }
    function hoverTurn(idx) {
      if (idx == null) idx = selectedTurn;
      critNodes.forEach((node, id) => {
        const it = ev && ev.items.find((x) => x.criterionId === id);
        node.classList.toggle("is-hot", idx != null && !!it && it.evidence.some((e) => e.turnIdx === idx));
      });
    }
    function indexEvidence() {
      turnNodes.forEach((n) => { const tags = n && n.querySelector(".da-turn-tags"); tags && tags.replaceChildren(); });
      if (!ev) return;
      for (const it of ev.items) {
        if (it.status !== "done") continue;
        const c = DA.criterionById(CL(), it.criterionId);
        for (const e of it.evidence) {
          const tags = turnNodes[e.turnIdx] && turnNodes[e.turnIdx].querySelector(".da-turn-tags");
          if (tags && !tags.querySelector(`[data-c="${c.id}"]`)) {
            const p = DA.answerPill(it.answer, c);
            p.dataset.c = c.id;
            p.prepend(c.title + ": ");
            tags.append(p);
          }
        }
      }
    }

    /* ---------- Панель оценки ---------- */
    const panel = h("section", { class: "da-eval", "aria-label": m("evaluation") });
    const critNodes = new Map();
    let ribbon = null;
    let totalNode = null;

    function itemsWithC() { return ev.items.map((i) => ({ ...i, c: DA.criterionById(CL(), i.criterionId) })); }

    function renderPanel(opts) {
      opts = opts || {};
      renderedEvaluationSignature = evaluationSignature(ev);
      ai?.updateEvaluation(ev);
      panel.replaceChildren();
      critNodes.clear();
      totalNode = null;
      if (loadError) panel.append(h("div", { class: "da-card-error", role: "alert" },
        h("p", {}, dynamic(() => DA.apiErrorMessage(loadError))), h("button", { class: "da-btn is-sm", onclick: () => runEvaluation(ev && ["queued", "running"].includes(ev.status) ? "resume" : "start") }, m("retry"))));
      if (ev && ev.stale) {
        panel.append(h("div", { class: "da-empty" },
          h("h2", {}, m("stale")),
          h("p", {}, m("staleDetail", () => ({ score: DA.fmt.score(ev.total) })))));
        return;
      }
      if (!ev) {
        panel.append(h("div", { class: "da-empty" },
          h("div", { class: "da-empty-ribbon", "aria-hidden": "true" }, CL().criteria.filter((c) => c.weight).map((c) => h("i", { style: { "--w": c.weight } }))),
          h("h2", {}, m("notEvaluated")),
          h("p", {}, m(readOnly ? "analystStarts" : "evaluateDetail")),
          readOnly ? null : h("button", { class: "da-btn is-primary", onclick: (e) => evaluate(e.currentTarget) }, m("evaluate"))));
        return;
      }
      const done = ev.items.filter((i) => i.status === "done").length;
      const top = h("div", { class: "da-eval-top" });
      const totalBox = h("div", {});
      if (running) {
        totalBox.append(h("div", { class: "da-total-live" }, m("evaluationProgress", { done, total: ev.items.length })),
          h("div", { class: "da-progress" }, h("i", { style: { width: (done / ev.items.length) * 100 + "%" } })));
      } else if (ev.status === "failed") {
        totalBox.append(h("div", { class: "da-total-live" }, m("incomplete")), h("div", { class: "da-small da-muted" }, m("savedProgress", { done, total: ev.items.length })));
      } else if (ev.total == null) {
        totalBox.append(h("div", { class: "da-total-live" }, m("noTotal")), h("div", { class: "da-small da-muted" }, m("noScoredCriteria")));
      } else {
        totalNode = h("span", {}, dynamic(() => DA.fmt.score(ev.total)));
        if (ev.originalTotal !== ev.total) totalBox.append(h("div", { class: "da-total-was" }, h("s", {}, dynamic(() => DA.fmt.score(ev.originalTotal))), m("beforeAppeals")));
        totalBox.append(h("div", { class: "da-total" }, totalNode, h("small", {}, m("of100"))));
      }
      const reviewCount = ev.items.filter((i) => i.needsReview && i.status === "done").length;
      top.append(h("div", { class: "da-total-row" }, totalBox,
        h("div", { class: "da-eval-meta" },
          h("span", {}, m("checklistVersion", { version: ev.checklistVersion })),
          ev.checklistVersion !== DA.activeChecklist().version ? h("span", {}, m("activeVersion", { version: DA.activeChecklist().version })) : null,
          h("span", {}, running ? m("modelReading") : ev.status === "failed" ? m("someUnfinished") : m(ev.durationSec != null ? "evaluatedDuration" : "evaluatedAgo", () => ({ ago: DA.fmt.ago(ev.minutesAgo || 0), seconds: Math.max(1, Math.round(ev.durationSec)) }))),
          Number.isFinite(ev.usage?.costUsd) && ev.usage.costUsd >= 0 ? h("span", { class: "da-eval-cost",
            title: m("evaluationUsage", () => {
              const count = (value) => Number.isFinite(value) && value >= 0 ? new Intl.NumberFormat(DA.fmt.locale()).format(value) : "—";
              return { calls: count(ev.usage.calls), input: count(ev.usage.inputTokens), output: count(ev.usage.outputTokens) };
            }) }, m("evaluationCost", () => ({ cost: new Intl.NumberFormat(DA.fmt.locale(), {
              style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6
            }).format(ev.usage.costUsd) }))) : null)));

      if (ev.grossFlagged) {
        const g = ev.items.find((i) => DA.criterionById(CL(), i.criterionId).type === "flag");
        top.append(h("div", { class: "da-gross-bar" }, DA.icon("flag"), m("grossError"), g.explanation ? h("span", { style: { fontWeight: 400 } }, g.explanation) : null));
      }
      ribbon = DA.ribbon(itemsWithC(), {
        interactive: true,
        onHover: (id) => { const it = id && ev.items.find((x) => x.criterionId === id); if (!openId) focusCriterion(it || null); },
        onClick: (id) => toggle(id, true)
      });
      const excluded = naSummary();
      top.append(ribbon);
      if (excluded.count) {
        const points = Math.round(excluded.points);
        top.append(h("div", { class: "da-cr-note" }, m(excluded.all ? "naAll" : "naRedistributed", () => ({
          subject: t("naSubject", { count: excluded.count }), points: t("redistributedPoints", { count: points }) }))));
      }

      const decided = DA.state.appeals.filter((a) => a.conversationId === cid && (!a.evaluationId || a.evaluationId === ev.id) && a.status !== "open");
      if (decided.length) {
        const changed = decided.filter((a) => a.status === "changed").length;
        top.append(h("div", { class: "da-history" },
          h("span", {}, m("originalScore"), h("b", {}, dynamic(() => DA.fmt.score(ev.originalTotal)))),
          h("span", {}, m("decisions", { changed, confirmed: decided.length - changed })),
          h("span", {}, m("finalScore"), h("b", {}, dynamic(() => DA.fmt.score(ev.total))))));
      }
      if (reviewCount && !running) top.append(h("div", { class: "da-small", style: { color: "var(--da-partial-ink)", display: "flex", gap: "6px", alignItems: "center" } }, DA.icon("alert", 15), m("manualReview", { count: reviewCount })));
      panel.append(top);

      for (const s of CL().sections) {
        const crits = CL().criteria.filter((c) => c.sectionId === s.id);
        const sr = ev.sections.find((x) => x.sectionId === s.id);
        const weighted = crits.some((c) => c.type !== "flag" && c.weight > 0);
        const sec = h("div", { class: "da-section da-cr-section" },
          h("div", { class: "da-cr-section-head" }, h("h3", {}, s.title),
            weighted && sr && !running ? h("span", {}, sr.max > 0 ? m("pointsOf", { points: Math.round(sr.earned), max: Math.round(sr.max) }) : m("notApplicable")) : null),
          weighted && sr && sr.max > 0 ? h("div", { class: "da-cr-section-bar", "aria-hidden": "true" }, h("i", { style: { width: `${Math.max(0, Math.min(100, sr.earned / sr.max * 100))}%` } })) : null);
        for (const c of crits) sec.append(critRow(c, opts));
        panel.append(sec);
      }
      if (ai?.coaching) panel.append(ai.coaching);
      indexEvidence();
      if (openId) {
        const it = ev.items.find((i) => i.criterionId === openId);
        it && it.status === "done" ? focusCriterion(it) : null;
      }
    }

    function naSummary() {
      const excluded = ev.items.filter((i) => i.status === "done" && i.answer === "na" && DA.criterionById(CL(), i.criterionId).type !== "flag");
      const weighted = CL().criteria.filter((c) => c.type !== "flag" && c.weight > 0);
      const totalWeight = weighted.reduce((sum, c) => sum + c.weight, 0);
      const weight = excluded.reduce((sum, i) => sum + DA.criterionById(CL(), i.criterionId).weight, 0);
      const count = excluded.length;
      return { count, totalWeight, points: totalWeight ? weight / totalWeight * 100 : 0, all: weighted.length === count };
    }

    function critRow(c, opts) {
      const it = ev.items.find((i) => i.criterionId === c.id);
      const isOpen = openId === c.id && it.status === "done";
      const tone = DA.tone(it.status === "done" ? it.answer : null, c);
      const node = h("div", { class: "da-crit da-cr-criterion" + (isOpen ? " is-open" : "") + (it.answer === "na" ? " is-na" : ""), "data-id": c.id });
      setTone(node, tone);
      critNodes.set(c.id, node);
      const appeal = it.appealId && DA.state.appeals.find((a) => a.id === it.appealId);

      const ready = it.status === "done";
      const points = ready && c.type !== "flag" && it.answer !== "na" ? Math.round(it.points) : null;
      const pts = points == null ? null : h("span", { class: "da-cr-points" + (points === 0 ? " is-zero" : "") }, points ? `+${points}` : "0");
      const marks = [];
      function mark(text, kind, explanation) {
        const badge = h("span", { class: `da-cr-mark is-${kind}` }, text);
        DA.hoverCard(badge, () => h("p", { class: "da-cr-tooltip" }, explanation));
        marks.push(badge);
      }
      if (appeal) {
        if (appeal.status === "open") mark(m("disputed"), "appeal", m("disputedDetail"));
        else mark(m("reviewed"), "reviewed", appeal.status === "changed"
          ? m("changedDetail", () => ({ before: labelFor(appeal.originalAnswer, c), after: labelFor(appeal.decision.newAnswer, c) }))
          : m("confirmedDetail"));
      }
      if (it.needsReview && ready) mark(m("needsReview"), "check", m("needsReviewDetail"));
      const maxWeight = Math.max(1, ...ev.items.map((item) => item.effectiveWeight || 0));
      const fraction = Math.max(0, Math.min(1, it.fraction || 0));
      const bar = c.type !== "flag" ? h("span", { class: "da-cr-track" + (it.answer === "na" ? " is-na" : ""), "aria-hidden": "true",
        style: { width: it.answer === "na" ? "100%" : `${(it.effectiveWeight || 0) / maxWeight * 100}%` } },
        h("i", { style: { width: `${ready ? fraction * 100 : 0}%` } })) : null;
      const pill = DA.answerPill(it.answer, c, null, it.status);
      if (opts.justDone === c.id) pill.classList.add("is-in");
      const row = h("button", { class: "da-cr-row", type: "button", "aria-expanded": String(isOpen), "aria-controls": `da-criterion-${c.id}`, disabled: !ready ? true : null },
        h("span", { class: "da-cr-title" }, h("span", {}, c.title), marks),
        h("span", { class: "da-cr-score" },
          it.status === "running" ? h("span", { class: "da-thinking" }, m("modelReading")) : null,
          pts, pill),
        bar);
      row.addEventListener("click", () => toggle(c.id));
      node.addEventListener("mouseenter", () => { if (!openId && it.status === "done") { focusCriterion(it); ribbon && ribbon.light(c.id); } });
      node.addEventListener("mouseleave", () => { if (!openId) focusCriterion(null); });
      node.append(row);

      if (it.status === "pending" && running) {
        node.querySelector(".da-cr-title").style.color = "var(--da-text-3)";
      }
      if (it.status === "failed") node.append(h("div", { class: "da-card-error" },
        h("p", {}, it.explanation || m("criterionFailed")),
        readOnly ? null : h("button", { class: "da-btn is-sm", disabled: running, onclick: () => runEvaluation("retry", c.id) }, m("retry"))));
      if (ready) {
        const reveal = h("div", { class: "da-cr-reveal", id: `da-criterion-${c.id}`, "aria-hidden": String(!isOpen) }, h("div", { class: "da-cr-inner" }, critBody(c, it, tone, appeal)));
        reveal.inert = !isOpen;
        node.append(reveal);
      }
      return node;
    }

    function critBody(c, it, tone, appeal) {
      const body = h("div", { class: "da-crit-body" });
      if (it.answer === "na") body.append(h("div", {}, h("div", { class: "da-label" }, m("whyNA")), h("p", {}, it.naReason || it.explanation)));
      else if (it.explanation) body.append(h("p", {}, it.explanation));
      if (it.evidence.length) {
        const list = h("div", { style: { display: "grid", gap: "8px" } });
        for (const e of it.evidence) {
          const t = conv.transcript[e.turnIdx];
          const q = h("button", { class: "da-quote", type: "button", onclick: () => jumpTo(e.turnIdx, tone) },
            h("small", {}, m("speakerTime", () => ({ speaker: DA.speakerLabel[t.speaker], time: DA.tx.clock(t.timestamp) })), e.kind === "expected_here" ? h("em", {}, m("expectedHere")) : null),
            h("q", {}, e.quote));
          setTone(q, tone);
          list.append(q);
        }
        body.append(h("div", {}, h("div", { class: "da-label" }, m("quotes")), list));
      } else if (it.answer !== "na" && c.type !== "flag") body.append(h("p", { class: "da-small da-muted" }, m("noQuote")));
      if (it.checkedRange) {
        body.append(h("div", {}, h("button", { class: "da-turnchip", type: "button", onclick: () => jumpTo(it.checkedRange.fromIdx, tone) },
          m("checkedRange", { from: DA.tx.clock(conv.transcript[it.checkedRange.fromIdx].timestamp), to: DA.tx.clock(conv.transcript[it.checkedRange.toIdx].timestamp) }))));
      }
      const excluded = naSummary();
      const basePoints = excluded.totalWeight ? c.weight / excluded.totalWeight * 100 : 0;
      let calculation;
      if (c.type === "flag") calculation = m("flagCalculation");
      else if (it.answer === "na") calculation = excluded.all ? m("naAllCalculation")
        : m("naCalculation", () => ({ points: Number.isInteger(basePoints) ? t("redistributedPoints", { count: basePoints }) : t("redistributedFraction", { points: DA.fmt.score(basePoints) }) }));
      else calculation = m(excluded.count ? "adjustedCalculation" : "calculation", () => ({ weight: c.weight, total: excluded.totalWeight,
        subject: t("naSubject", { count: excluded.count }), max: DA.fmt.score(it.effectiveWeight), points: DA.fmt.score(it.points) }));
      body.append(h("div", {}, h("div", { class: "da-label" }, m("howCalculated")), h("p", {}, calculation)), ruleBlock(c, it));

      if (appeal) {
        if (appeal.status === "open") {
          body.append(h("div", { class: "da-appeal-state" },
            h("b", {}, m("withReviewer")),
            h("span", {}, appeal.comment),
            readOnly ? h("div", {}, h("a", { class: "da-btn is-sm", style: { marginTop: "6px" }, href: `#/review/${appeal.id}` }, m("reviewAppeal"))) : null));
        } else {
          body.append(h("div", { class: "da-appeal-state is-done" },
            h("b", {}, appeal.status === "changed" ? m("answerChanged", () => ({ before: labelFor(appeal.originalAnswer, c), after: labelFor(appeal.decision.newAnswer, c) })) : m("answerConfirmed")),
            h("span", {}, appeal.decision.reason)));
        }
      } else if (!running && !readOnly && ev.status === "done") {
        body.append(h("div", { class: "da-crit-actions" },
          h("button", { class: "da-btn is-sm", onclick: (e) => appealDrawer(c, it, e.currentTarget) }, DA.icon("message"), m("appeal"))));
      }
      return body;
    }

    function ruleBlock(c, it) {
      const box = h("div", { class: "da-rule" });
      const content = h("div", { hidden: true, style: { marginTop: "8px" } },
        h("p", { style: { margin: 0 } }, c.description),
        c.naAllowed ? h("p", { style: { margin: "6px 0 0" } }, m("naRule", { condition: c.naCondition })) : null,
        c.scale ? h("ol", {}, c.scale.map((s) => h("li", { class: it.answer === s.value ? "is-picked" : "" }, h("b", {}, s.value), h("span", {}, s.description)))) : null);
      const btn = h("button", { class: "da-rule-toggle", type: "button", "aria-expanded": "false" }, DA.icon("chevron"), m("rule"));
      btn.addEventListener("click", () => {
        content.hidden = !content.hidden;
        btn.setAttribute("aria-expanded", String(!content.hidden));
      });
      box.append(btn, content);
      return box;
    }

    function toggle(id, fromRibbon, scroll = true) {
      const it = ev.items.find((i) => i.criterionId === id);
      if (!it || it.status !== "done") return;
      if (scroll) markSelectedTurn(null);
      openId = openId === id && !fromRibbon ? null : id;
      critNodes.forEach((node, criterionId) => {
        const isOpen = criterionId === openId;
        node.classList.toggle("is-open", isOpen);
        node.querySelector(".da-cr-row").setAttribute("aria-expanded", String(isOpen));
        const reveal = node.querySelector(".da-cr-reveal");
        if (reveal) { reveal.inert = !isOpen; reveal.setAttribute("aria-hidden", String(!isOpen)); }
      });
      focusCriterion(openId ? it : null);
      const node = critNodes.get(id);
      if (node && fromRibbon && scroll) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    /* ---------- Живая оценка: сохранённые частичные ответы из слоя данных ---------- */
    let operationPending = false;
    const evaluate = () => runEvaluation("start");
    async function runEvaluation(kind, criterionId) {
      if (operationPending || (readOnly && kind !== "resume")) return;
      operationPending = true;
      loadError = null;
      running = true;
      if (kind === "start") { openId = null; markSelectedTurn(null); focusCriterion(null); }
      setHeadBusy(true);
      showCardPart("evaluation");
      const onProgress = (next) => {
        if (disposed) return;
        const previousDone = new Set((ev?.items || []).filter((i) => i.status === "done").map((i) => i.criterionId));
        const justDone = next.items.find((i) => i.status === "done" && !previousDone.has(i.criterionId));
        ev = next;
        running = ["queued", "running"].includes(ev.status);
        renderPanel({ justDone: justDone?.criterionId });
      };
      const options = { signal: controller.signal, onProgress };
      try {
        const next = kind === "resume" ? await DA.data.watchEvaluation(ev.id, options)
          : kind === "retry" ? await DA.data.retryCriterion(ev.id, criterionId, options)
          : await DA.data.evaluate(cid, { ...options, checklistVersion: DA.activeChecklist().version, reuse: false });
        if (disposed) return;
        ev = next;
        running = false;
        renderPanel();
        if (totalNode && ev.status === "done" && kind !== "resume") DA.countTo(totalNode, 0, ev.total, 700);
      } catch (error) {
        if (disposed || error.name === "AbortError") return;
        loadError = error;
        running = false;
        renderPanel();
      } finally {
        operationPending = false;
        if (!disposed) { setHeadBusy(false); syncExternalEvaluation(); }
      }
    }
    function syncExternalEvaluation() {
      if (disposed || historyView || operationPending) return;
      const next = DA.state.evaluations[cid];
      if (!next || next.conversationId !== cid || !DA.checklist(next.checklistVersion)
        || evaluationSignature(next) === renderedEvaluationSignature) return;
      ev = next;
      running = ["queued", "running"].includes(ev.status);
      loadError = null;
      renderPanel();
      setHeadBusy(running);
    }

    /* ---------- Апелляция ---------- */
    function previewTotal(criterionId, answer) {
      const answers = Object.fromEntries(ev.items.map((i) => [i.criterionId, i.answer]));
      answers[criterionId] = answer;
      return DA.computeScores(CL(), answers).total;
    }
    function answerOptions(c, exclude) {
      return DA.allowedAnswers(c).filter((a) => a !== exclude).map((a) => ({ value: a, label: dynamic(() => labelFor(a, c)) }));
    }

    function appealDrawer(c, it, anchor) {
      const evaluationId = ev.id;
      const answerAtOpen = JSON.stringify([it.status, it.answer, it.explanation, it.naReason, it.evidence, it.checkedRange]);
      let proposed = null;
      let submitting = false;
      const err = h("div", { class: "da-error", hidden: true });
      const ta = h("textarea", { class: "da-textarea", placeholder: m("appealExample") });
      const left = h("span", { class: "da-hint" });
      DA.i18n.bindText(left, dynamic(() => ta.value.trim().length < 10 ? t("moreCharacters", { count: 10 - ta.value.trim().length }) : ""));
      const prev = h("div", { class: "da-preview-total", hidden: true });
      const upd = () => {
        const n = ta.value.trim().length;
        DA.i18n.refresh(left);
        submit.disabled = submitting || n < 10;
      };
      ta.addEventListener("input", upd);
      const submit = h("button", { class: "da-btn is-primary", disabled: true }, m("submitAppeal"));
      const d = DA.drawer({
        title: m("appealTitle"), subtitle: c.title,
        body: [
          h("div", { class: "da-block" }, h("div", { class: "da-label" }, m("modelScore")),
            h("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, DA.answerPill(it.answer, c), c.type !== "flag" && it.answer !== "na" ? h("span", { class: "da-small da-muted" }, m("pointsOf", () => ({ points: DA.fmt.score(it.points), max: DA.fmt.score(it.effectiveWeight) }))) : null),
            h("p", { style: { margin: 0, fontSize: "14px" } }, it.answer === "na" ? it.naReason : it.explanation)),
          h("label", { class: "da-field" }, h("span", {}, m("whyDisagree")), ta, left),
          h("div", { class: "da-block" }, h("div", { class: "da-label" }, m("proposedOptional")),
            DA.segmented(answerOptions(c, it.answer), null, (v) => {
              proposed = v;
              const t = previewTotal(c.id, v);
              prev.hidden = false;
              prev.replaceChildren(h("span", { class: "da-muted" }, m("ifAccepted")), h("b", {}, dynamic(() => DA.fmt.score(t))));
            }, m("proposed")),
            prev),
          err],
        foot: [submit, h("button", { class: "da-btn is-text", onclick: () => d.close() }, m("cancel"))]
      });
      submit.addEventListener("click", async () => {
        if (submitting || ta.value.trim().length < 10) return;
        submitting = true;
        err.hidden = true;
        submit.classList.add("is-busy");
        upd();
        try {
          const current = DA.state.evaluations[cid], item = current?.items.find((value) => value.criterionId === c.id);
          if (current?.id !== evaluationId || !item
            || JSON.stringify([item.status, item.answer, item.explanation, item.naReason, item.evidence, item.checkedRange]) !== answerAtOpen) {
            throw new DA.ApiError("stale_source", "Оценка изменилась. Откройте критерий заново", 409);
          }
          await DA.data.createAppeal(cid, c.id, ta.value.trim(), proposed);
          d.close();
          if (disposed) return;
          ev = DA.state.evaluations[cid];
          renderPanel();
          DA.toast(m("appealSent"), critNodes.get(c.id) || anchor);
        } catch (error) {
          DA.i18n.bindText(err, dynamic(() => DA.apiErrorMessage(error)));
          err.hidden = false;
        } finally {
          submitting = false;
          submit.classList.remove("is-busy");
          upd();
        }
      });
    }

    /* ---------- Шапка карточки ---------- */
    const evalBtn = h("button", { class: "da-btn", onclick: (e) => evaluate(e.currentTarget) }, DA.icon("refresh"), m(ev ? "reevaluate" : "evaluate"));
    function setHeadBusy(b) { evalBtn.disabled = b; evalBtn.classList.toggle("is-busy", b); DA.i18n.bindText(evalBtn.lastChild, m(b ? "evaluating" : ev ? "reevaluate" : "evaluate")); }
    const initialPart = ev && !params.query.turn ? "evaluation" : "dialogue";
    const grid = h("div", { class: "da-card-grid", "data-part": initialPart }, transcript, panel);
    const cardTabs = DA.segmented([{ value: "dialogue", label: m("dialogue") }, { value: "evaluation", label: m("evaluation") }], initialPart, showCardPart, m("contents"));
    const tabs = h("div", { class: "da-card-tabs" }, cardTabs);
    function showCardPart(part) {
      grid.dataset.part = part;
      cardTabs.setValue(part);
    }
    const durSec = DA.tx.duration(conv);
    root.append(h("div", { class: "da-page" },
      DA.state.role === "reviewer" ? h("a", { class: "da-btn is-text is-sm", href: "#/review", style: { marginBottom: "8px" } }, DA.icon("back", 16), m("backQueue")) : null,
      h("div", { class: "da-card-head" },
        readOnly ? null : h("a", { class: "da-back", href: "#/", "aria-label": m("backList") }, DA.icon("back")),
        h("h1", { class: "da-h1", tabindex: -1, title: cid }, m("title", { number: DA.convNumber(cid) })),
        h("span", { class: "da-chip" }, dynamic(() => DA.langLabel[conv.language])),
        h("span", { class: "da-chip" }, DA.icon(isCall ? "phone" : "message"), dynamic(() => DA.channelLabel(conv))),
        h("span", { class: "da-muted da-small" }, m("dateDuration", () => ({ date: DA.fmt.dateTime(DA.tx.startedAt(conv)), duration: DA.fmt.duration(durSec) }))),
        readOnly ? null : h("div", { class: "da-card-actions" }, evalBtn)),
      historyView ? h("p", { class: "da-card-history" }, m("historyOpen"), h("a", { href: `#/c/${encodeURIComponent(cid)}` }, m("currentConversation"))) : null,
      tabs, grid));

    renderPanel();
    attachDisplayedTranscript();
    renderTranscriptionState();
    refreshAudioMarkers();
    if (isCall) loadTranscription(false);
    setHeadBusy(running);
    if (running) runEvaluation("resume");
    const unsubscribeBulk = historyView ? null : DA.bulk?.subscribe(syncExternalEvaluation);
    if (params.query.turn) timers.push(setTimeout(() => jumpTo(+params.query.turn, "yes"), 200));
    if (openId) timers.push(setTimeout(() => { const n = critNodes.get(openId); n && n.scrollIntoView({ block: "nearest" }); }, 100));
    window.addEventListener("da:locale-changed", () => requestAnimationFrame(() => {
      if (!disposed && focused) focusCriterion(ev?.items.find((item) => item.criterionId === focused) || null);
    }), { signal: controller.signal });
    return () => { disposed = true; unsubscribeBulk?.(); controller.abort(); clearTimeout(sttTimer); player?.destroy(); ai?.dispose?.(); timers.forEach(clearTimeout); };
  };
})();
