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
        let pending = "", result;
        const receive = (line) => {
          if (!line.trim()) return;
          const step = JSON.parse(line);
          if (step.stage === "error") throw new ApiError(step.error.code, step.error.message, response.status);
          opts.onProgress(step);
          if (step.stage === "done") result = step.result;
        };
        try {
          while (true) {
            const chunk = await reader.read();
            pending += decoder.decode(chunk.value, { stream: !chunk.done });
            const lines = pending.split("\n");
            pending = lines.pop();
            lines.forEach(receive);
            if (chunk.done) break;
          }
          receive(pending);
          if (result === undefined) throw new ApiError("interrupted", "Загрузка прервалась. Проверьте список обращений и повторите синхронизацию", 0);
          return result;
        } finally { reader.releaseLock(); }
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
  const aiGet = (path, options) => get(path, { refresh: options?.refresh }, aiOptions(options));
  let detected;
  DA.mode = "local";
  DA.api = {
    request,
    detect() {
      if (!detected) detected = request("/health", { timeout: 2000 }).then((health) => {
        DA.health = health;
        DA.mode = health.ok === true ? "server" : "local";
        return DA.mode;
      }, () => (DA.mode = "local")).then((mode) => {
        DA.backendAvailable = mode === "server";
        return mode;
      });
      return detected;
    },
    health: (options) => request("/health", options),
    listConversations: (filters, options) => get("/conversations", filters, options),
    getConversation: (id, options) => request(`/conversations/${part(id)}`, options),
    getSttJobs: (filters, options) => get("/stt/jobs", filters, options),
    getTranscription: (id, options) => request(`/conversations/${part(id)}/transcription`, options),
    retryTranscription: (id, options) => post(`/conversations/${part(id)}/transcription/retry`, {}, options),
    getSummary: (id, options) => aiGet(`/conversations/${part(id)}/summary`, options),
    getTranslation: (id, options) => aiGet(`/conversations/${part(id)}/translation`, options),
    listEvaluations: (id, options) => request(`/conversations/${part(id)}/evaluations`, options),
    getEvaluation: (id, options) => request(`/evaluations/${part(id)}`, options),
    getEvaluationConversation: (id, options) => request(`/evaluations/${part(id)}/conversation`, options),
    getCoaching: (id, options) => aiGet(`/evaluations/${part(id)}/coaching`, options),
    startEvaluation: (body, options) => post("/evaluations", body, options),
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
