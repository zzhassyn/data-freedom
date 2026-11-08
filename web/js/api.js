/* HTTP-клиент. Ошибки сохраняют безопасное сообщение сервера для интерфейса. */
(function () {
  const DA = (window.DA = window.DA || {});
  class ApiError extends Error {
    constructor(code, message, status) {
      super(message);
      this.name = "ApiError";
      this.code = code;
      this.status = status || 0;
    }
  }
  DA.ApiError = ApiError;
  DA.i18n.addMessages({
    "apiError.network": { ru: "Нет связи с сервером. Проверьте соединение и повторите запрос.", kk: "Сервермен байланыс жоқ. Қосылымды тексеріп, сұрауды қайталаңыз.", en: "Cannot reach the server. Check your connection and try again." },
    "apiError.server_required": { ru: "Для работы нужен сервер приложения. Откройте адрес запущенного сервера и повторите запрос.", kk: "Жұмыс істеу үшін қолданба сервері қажет. Іске қосылған сервердің мекенжайын ашып, сұрауды қайталаңыз.", en: "The application server is required. Open the running server's address and try again." },
    "apiError.invalid_response": { ru: "Не удалось прочитать ответ сервера. Повторите запрос.", kk: "Сервер жауабын оқу мүмкін болмады. Сұрауды қайталаңыз.", en: "Could not read the server response. Try again." },
    "apiError.interrupted": { ru: "Загрузка прервалась. Проверьте список обращений перед повторной загрузкой.", kk: "Жүктеу үзілді. Қайта жүктемес бұрын өтініштер тізімін тексеріңіз.", en: "The upload was interrupted. Check the conversation list before uploading again." },
    "apiError.not_found": { ru: "Запрошенные данные не найдены. Обновите список и повторите действие.", kk: "Сұралған деректер табылмады. Тізімді жаңартып, әрекетті қайталаңыз.", en: "The requested data was not found. Refresh the list and try again." },
    "apiError.model_failed": { ru: "Не удалось получить корректный ответ модели. Повторите через минуту.", kk: "Модельден дұрыс жауап алу мүмкін болмады. Бір минуттан кейін қайталаңыз.", en: "Could not get a valid model response. Try again in a minute." },
    "apiError.model_unavailable": { ru: "Модель сейчас недоступна. Повторите позже.", kk: "Модель қазір қолжетімсіз. Кейінірек қайталаңыз.", en: "The model is currently unavailable. Try again later." },
    "apiError.translation_unavailable": { ru: "Перевод на выбранный язык пока недоступен. Выберите другой язык или повторите позже.", kk: "Таңдалған тілге аудару әзірге қолжетімсіз. Басқа тілді таңдаңыз немесе кейінірек қайталаңыз.", en: "Translation into the selected language is not available yet. Choose another language or try again later." },
    "apiError.stt_disabled": { ru: "Расшифровка звонков выключена.", kk: "Қоңырауларды мәтінге айналдыру өшірілген.", en: "Call transcription is disabled." },
    "apiError.no_audio": { ru: "У этого обращения нет аудиозаписи.", kk: "Бұл өтініштің аудиожазбасы жоқ.", en: "This conversation has no audio recording." },
    "apiError.evaluation_not_ready": { ru: "Дождитесь завершения оценки и повторите действие.", kk: "Бағалау аяқталғанша күтіп, әрекетті қайталаңыз.", en: "Wait for the evaluation to finish, then try again." },
    "apiError.evaluation_running": { ru: "Оценка ещё выполняется. Дождитесь её завершения.", kk: "Бағалау әлі жүріп жатыр. Оның аяқталуын күтіңіз.", en: "The evaluation is still running. Wait for it to finish." },
    "apiError.criterion_not_failed": { ru: "Повтор доступен только для критерия с ошибкой.", kk: "Тек қатесі бар критерийді қайта орындауға болады.", en: "Only a failed criterion can be retried." },
    "apiError.appeal_exists": { ru: "По этому критерию уже открыта апелляция. Откройте её в списке апелляций.", kk: "Бұл критерий бойынша апелляция ашылған. Оны апелляциялар тізімінен ашыңыз.", en: "An appeal is already open for this criterion. Open it from the appeals list." },
    "apiError.appeal_decided": { ru: "Решение по этой апелляции уже принято. Обновите список, чтобы увидеть его.", kk: "Бұл апелляция бойынша шешім қабылданған. Оны көру үшін тізімді жаңартыңыз.", en: "This appeal has already been decided. Refresh the list to see the decision." },
    "apiError.comment_too_short": { ru: "Напишите комментарий не короче 10 символов.", kk: "Кемінде 10 таңбадан тұратын түсініктеме жазыңыз.", en: "Enter a comment with at least 10 characters." },
    "apiError.reason_too_short": { ru: "Укажите причину решения не короче 10 символов.", kk: "Шешімнің себебін кемінде 10 таңбамен көрсетіңіз.", en: "Enter a decision reason with at least 10 characters." },
    "apiError.stale_evaluation": { ru: "Диалог изменился после оценки. Оцените его заново.", kk: "Диалог бағалаудан кейін өзгерді. Оны қайта бағалаңыз.", en: "The conversation changed after evaluation. Evaluate it again." },
    "apiError.stale_source": { ru: "Данные изменились. Откройте обращение заново и повторите действие.", kk: "Деректер өзгерді. Өтінішті қайта ашып, әрекетті қайталаңыз.", en: "The data changed. Reopen the conversation and try again." },
    "apiError.batch_running": { ru: "Дождитесь завершения текущей оценки.", kk: "Ағымдағы бағалаудың аяқталуын күтіңіз.", en: "Wait for the current evaluation to finish." },
    "apiError.no_conversations": { ru: "Выберите хотя бы одно обращение.", kk: "Кемінде бір өтінішті таңдаңыз.", en: "Select at least one conversation." },
    "apiError.nothing_to_retry": { ru: "В этом пакете нет обращений с ошибкой.", kk: "Бұл топтамада қатесі бар өтініштер жоқ.", en: "This batch has no failed conversations to retry." },
    "apiError.too_many": { ru: "Выберите не больше трёх обращений для пробной оценки.", kk: "Сынақ бағалау үшін үштен артық өтініш таңдамаңыз.", en: "Select no more than three conversations for a trial evaluation." },
    "apiError.too_large": { ru: "Файл превышает 20 МБ. Разделите набор на несколько файлов.", kk: "Файл 20 МБ-тан үлкен. Жинақты бірнеше файлға бөліңіз.", en: "The file exceeds 20 MB. Split the dataset into smaller files." },
    "apiError.forbidden_origin": { ru: "Источник запроса не разрешён. Откройте приложение по его обычному адресу.", kk: "Сұрау көзіне рұқсат жоқ. Қолданбаны оның қалыпты мекенжайынан ашыңыз.", en: "This request source is not allowed. Open the app at its usual address." },
    "apiError.upstream_failed": { ru: "Не удалось получить данные от внешнего сервиса. Повторите запрос позже.", kk: "Сыртқы қызметтен деректер алу мүмкін болмады. Сұрауды кейінірек қайталаңыз.", en: "Could not get data from the external service. Try again later." },
    "apiError.unavailable": { ru: "Это действие сейчас недоступно. Повторите позже.", kk: "Бұл әрекет қазір қолжетімсіз. Кейінірек қайталаңыз.", en: "This action is currently unavailable. Try again later." },
    "apiError.invalid_json": { ru: "Проверьте формат JSON и повторите запрос.", kk: "JSON пішімін тексеріп, сұрауды қайталаңыз.", en: "Check the JSON format and try again." },
    "apiError.invalid_format": { ru: "Выберите формат CSV или JSON.", kk: "CSV немесе JSON пішімін таңдаңыз.", en: "Choose CSV or JSON format." },
    "apiError.invalid_filter": { ru: "Проверьте выбранные фильтры языка, канала и состояния.", kk: "Таңдалған тіл, арна және күй сүзгілерін тексеріңіз.", en: "Check the selected language, channel and status filters." },
    "apiError.invalid_decision": { ru: "Выберите, подтвердить оценку или изменить её.", kk: "Бағаны растауды немесе өзгертуді таңдаңыз.", en: "Choose whether to confirm or change the score." },
    "apiError.invalidAnswerCriterion": { ru: "Недопустимый ответ для критерия «{criterion}». Проверьте выбранный ответ.", kk: "«{criterion}» критерийінің жауабы жарамсыз. Таңдалған жауапты тексеріңіз.", en: "The answer is not valid for “{criterion}”. Check the selected answer." },
    "apiError.validation": { ru: "Проверьте данные и повторите действие. {details}", kk: "Деректерді тексеріп, әрекетті қайталаңыз. {details}", en: "Check the data and try again. {details}" },
    "apiError.details": { ru: "Не удалось выполнить действие. Проверьте сообщение: {details}", kk: "Әрекетті орындау мүмкін болмады. Хабарды тексеріңіз: {details}", en: "Could not complete the action. Check the message: {details}" },
    "apiError.fallback": { ru: "Не удалось выполнить действие. Повторите запрос.", kk: "Әрекетті орындау мүмкін болмады. Сұрауды қайталаңыз.", en: "Could not complete the action. Try again." },
    "apiError.cancelled": { ru: "Действие отменено.", kk: "Әрекет тоқтатылды.", en: "The action was cancelled." }
  });
  const localizedErrors = new Set(["network", "server_required", "invalid_response", "interrupted", "not_found", "model_failed", "model_unavailable",
    "translation_unavailable", "stt_disabled", "no_audio", "evaluation_not_ready", "evaluation_running", "criterion_not_failed",
    "appeal_exists", "appeal_decided", "comment_too_short", "reason_too_short", "stale_evaluation", "stale_source", "batch_running",
    "no_conversations", "nothing_to_retry", "too_many", "too_large", "forbidden_origin", "upstream_failed", "unavailable",
    "invalid_json", "invalid_format", "invalid_filter", "invalid_decision"]);
  const validationErrors = new Set(["invalid_request", "invalid_checklist", "invalid_transcript", "invalid_answer", "invalid_gold", "bad_group", "unsupported_media_type"]);
  // Вызывается при отрисовке/обновлении привязанного текста, не меняет исходную ошибку.
  DA.apiErrorMessage = function (error) {
    if (DA.i18n.isMessage(error?.uiMessage)) return DA.t(error.uiMessage.key, error.uiMessage.params);
    if (error?.name === "AbortError") return DA.t("apiError.cancelled");
    if (localizedErrors.has(error?.code)) return DA.t("apiError." + error.code);
    const safe = error instanceof ApiError || error?.name === "ApiError";
    const details = safe && typeof error.message === "string" ? error.message.trim() : "";
    if (error?.code === "invalid_answer") {
      const match = details.match(/^Недопустимый ответ для критерия «(.+)»$/u);
      if (match) return DA.t("apiError.invalidAnswerCriterion", { criterion: match[1] });
    }
    if (details && validationErrors.has(error?.code)) return DA.i18n.locale() === "ru" ? details : DA.t("apiError.validation", { details });
    if (details && !["request_failed", "internal_error"].includes(error?.code)) return DA.i18n.locale() === "ru" ? details : DA.t("apiError.details", { details });
    return DA.t("apiError.fallback");
  };
  const part = encodeURIComponent;
  function query(values) {
    const params = new URLSearchParams();
    Object.entries(values || {}).forEach(([key, value]) => {
      if (value != null && value !== "") params.set(key, value);
    });
    return params.size ? "?" + params : "";
  }

  async function request(path, options) {
    const opts = options || {}, controller = new AbortController();
    const abort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) abort();
      else opts.signal.addEventListener("abort", abort, { once: true });
    }
    const timer = setTimeout(abort, opts.timeout == null ? 30000 : opts.timeout);
    try {
      const response = await fetch("/api" + path, {
        method: opts.method || "GET", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(opts.onProgress ? { Accept: "application/x-ndjson" } : {}), ...opts.headers },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {})
      });
      if (opts.onProgress && response.ok && (response.headers.get("content-type") || "").includes("ndjson")) {
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let pending = "", result, completed = false;
        const receive = (line) => {
          if (!line.trim()) return;
          let step;
          try { step = JSON.parse(line); }
          catch (_) { throw new ApiError("invalid_response", "Не удалось прочитать поток ответа сервера", response.status); }
          const stage = step.type || step.stage;
          if (stage === "error") throw new ApiError(step.error?.code || "model_failed", step.error?.message || "Модель не ответила", response.status);
          if (completed) throw new ApiError("invalid_response", "Сервер продолжил завершённый ответ", response.status);
          opts.onProgress(step);
          if (stage === "done") { result = step.result; completed = true; }
        };
        try {
          while (true) {
            const chunk = await reader.read();
            pending += decoder.decode(chunk.value, { stream: !chunk.done });
            if (pending.length > 1000000) throw new ApiError("invalid_response", "Ответ сервера слишком большой", response.status);
            const lines = pending.split("\n");
            pending = lines.pop();
            lines.forEach(receive);
            if (chunk.done) break;
          }
          receive(pending);
          if (result === undefined) throw new ApiError("interrupted", "Загрузка прервалась. Проверьте список обращений и повторите синхронизацию", 0);
          return result;
        } finally {
          if (!completed) { try { await reader.cancel(); } catch (_) { /* Поток уже мог закрыться. */ } }
          reader.releaseLock();
        }
      }
      let body;
      try { body = await response.json(); }
      catch (error) { throw new ApiError("invalid_response", "Не удалось прочитать ответ сервера. Повторите запрос", response.status); }
      if (!response.ok) throw new ApiError(body.error?.code || "request_failed", body.error?.message || "Не удалось выполнить действие. Повторите запрос", response.status);
      return body;
    } catch (error) {
      if (opts.signal?.aborted) throw new DOMException("Действие прервано", "AbortError");
      if (error instanceof ApiError && !controller.signal.aborted) throw error;
      throw new ApiError("network", "Нет связи с сервером", 0);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", abort);
    }
  }
  const get = (path, values, options) => request(path + query(values), options);
  const post = (path, body, options) => request(path, { ...options, method: "POST", body: body || {} });
  const aiOptions = (options) => ({ ...options, timeout: options?.timeout ?? 120000 });
  const aiGet = (path, options) => get(path, { refresh: options?.refresh, stream: options?.onProgress ? true : undefined }, aiOptions(options));
  let detected;
  DA.mode = "server";
  DA.backendAvailable = false;
  DA.api = {
    request,
    detect() {
      const unavailable = () => new ApiError("server_required", "Для работы нужен сервер приложения", 0);
      if (!detected) detected = (window.location?.protocol === "file:" ? Promise.reject(unavailable())
        : request("/health", { timeout: 5000 })).then((health) => {
        if (health?.ok === false) throw unavailable();
        if (health?.ok !== true) throw new ApiError("invalid_response", "Не удалось прочитать ответ сервера", 200);
        DA.health = health;
        DA.backendAvailable = true;
        return DA.mode;
      }).catch((error) => {
        detected = null;
        DA.backendAvailable = false;
        throw [404, 405].includes(error.status) ? unavailable() : error;
      });
      return detected;
    },
    health: (options) => request("/health", options),
    bootstrap: (options) => request("/bootstrap", options),
    listConversations: (filters, options) => get("/conversations", filters, options),
    getConversation: (id, options) => request(`/conversations/${part(id)}`, options),
    getSttJobs: (filters, options) => get("/stt/jobs", filters, options),
    getTranscription: (id, options) => request(`/conversations/${part(id)}/transcription`, options),
    retryTranscription: (id, options) => post(`/conversations/${part(id)}/transcription/retry`, options?.force === true ? { force: true } : {}, options),
    getSummary: (id, options) => aiGet(`/conversations/${part(id)}/summary`, options),
    askAssistant: (id, body, options) => post(`/conversations/${part(id)}/assistant`, body, aiOptions(options)),
    getTranslation: (id, options) => get(`/conversations/${part(id)}/translation`, {
      refresh: options?.refresh, targetLanguage: options?.targetLanguage || "RU", source: options?.source || "canonical", sourceHash: options?.sourceHash
    }, aiOptions(options)),
    listEvaluations: (id, options) => request(`/conversations/${part(id)}/evaluations`, options),
    getEvaluation: (id, options) => request(`/evaluations/${part(id)}`, options),
    getEvaluationConversation: (id, options) => request(`/evaluations/${part(id)}/conversation`, options),
    getCoaching: (id, options) => aiGet(`/evaluations/${part(id)}/coaching`, options),
    startEvaluation: (body, options) => post("/evaluations", body, options),
    listJobs: (filters, options) => get("/jobs", filters, options),
    getJob: (id, options) => request(`/jobs/${part(id)}`, options),
    retryCriterion: (id, criterionId, options) => post(`/evaluations/${part(id)}/criteria/${part(criterionId)}/retry`, {}, options),
    listChecklists: (options) => request("/checklists", options),
    getChecklist: (id, options) => request(`/checklists/${part(id)}`, options),
    createChecklist: (body, options) => post("/checklists", body, options),
    activateChecklist: (id, options) => post(`/checklists/${part(id)}/activate`, {}, options),
    diffChecklists: (id, against, options) => get(`/checklists/${part(id)}/diff`, { against }, options),
    compareChecklists: (id, against, filters, options) => get(`/checklists/${part(id)}/compare`, { ...filters, against }, options),
    listAppeals: (filters, options) => get("/appeals", { status: "all", ...filters }, options),
    getAppeal: (id, options) => request(`/appeals/${part(id)}`, options),
    createAppeal: (body, options) => post("/appeals", body, options),
    decideAppeal: (id, body, options) => post(`/appeals/${part(id)}/decision`, body, options),
    secondOpinion: (id, options) => post(`/appeals/${part(id)}/second-opinion` + query({ refresh: options?.refresh }), {}, aiOptions(options)),
    getStats: (filters, options) => get("/stats", filters, options),
    getOperators: (filters, options) => get("/operators", filters, options),
    getSource: (options) => request("/source", options),
    putSource: (body, options) => request("/source", { ...options, method: "PUT", body }),
    syncSource: (options) => post("/source/sync", {}, options),
    uploadConversations: (body, options) => post("/conversations/upload", body, options)
  };
})();
