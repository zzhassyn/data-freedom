/* Расшифровка звонков: серверная очередь, второй шаг загрузки и фоновая панель. */
(function () {
  const DA = window.DA, h = DA.h, KEY = "da.stt.v1";
  const M = (key, params) => DA.msg(`stt.${key}`, params), T = (key, params) => DA.t(`stt.${key}`, params);
  const bind = (node, value) => DA.i18n.bindText(node, DA.i18n.isMessage(value) ? value : () => String(value || ""));
  DA.i18n.addMessages(Object.fromEntries(Object.entries({
    queued: ["В очереди", "Кезекте", "Queued"], download: ["Скачиваем запись", "Жазбаны жүктеудеміз", "Downloading recording"],
    transcribe: ["Распознаём речь", "Сөйлеуді танудамыз", "Transcribing speech"], mask: ["Скрываем личные данные", "Жеке деректерді жасырудамыз", "Hiding personal data"],
    build: ["Собираем реплики", "Репликаларды құрастырудамыз", "Assembling transcript turns"], done: ["Готово", "Дайын", "Done"],
    failed: ["Не получилось", "Орындалмады", "Failed"], genericError: ["Не удалось получить состояние расшифровки. Повторите запрос", "Мәтінге айналдыру күйін алу мүмкін болмады. Қайталап көріңіз", "Could not get transcription status. Try again"],
    missingError: ["Не удалось получить состояние всех звонков. Обновите список", "Барлық қоңыраулардың күйін алу мүмкін болмады. Тізімді жаңартыңыз", "Could not get the status of all calls. Refresh the list"],
    failedReason: ["Не получилось: {reason}", "Орындалмады: {reason}", "Failed: {reason}"],
    failedDefault: ["не удалось расшифровать звонок", "қоңырауды мәтінге айналдыру мүмкін болмады", "could not transcribe the call"],
    truncated: ["Готово, запись обрывается на {decoded} из {declared}", "Дайын, {declared} жазба {decoded} кезінде үзіледі", "Done; recording ends at {decoded} of {declared}"],
    incomplete: ["Готово, запись неполная", "Дайын, жазба толық емес", "Done; recording is incomplete"],
    callDuration: ["Звонок, {duration}", "Қоңырау, {duration}", "Call, {duration}"], call: ["Звонок", "Қоңырау", "Call"],
    progressLabel: ["Ход расшифровки звонков", "Қоңырауларды мәтінге айналдыру барысы", "Call transcription progress"],
    refresh: ["Обновить список", "Тізімді жаңарту", "Refresh list"], background: ["Продолжить в фоне", "Фонда жалғастыру", "Continue in background"],
    steps: ["Этапы загрузки", "Жүктеу қадамдары", "Import steps"], upload: ["Загрузка", "Жүктеу", "Import"],
    title: ["Расшифровка звонков", "Қоңырауларды мәтінге айналдыру", "Call transcription"],
    intro: ["Расшифровка позволяет перематывать запись к репликам. Имена, номера документов и коды скрываются до показа.", "Мәтін арқылы жазбадағы репликаға өтуге болады. Көрсетуден бұрын есімдер, құжат нөмірлері мен кодтар жасырылады.", "The transcript lets you seek to individual turns. Names, document numbers, and codes are hidden before display."],
    progress: ["Готово {done} из {total}", "{total} ішінен {done} дайын", "{done} of {total} done"],
    complete: ["Все звонки расшифрованы", "Барлық қоңыраулар мәтінге айналдырылды", "All calls transcribed"],
    completeErrors: ["Расшифровано {done} из {total}, {failure}", "{total} қоңыраудың {done} мәтінге айналдырылды, {failed} қоңырау орындалмады", "Transcribed {done} of {total}; {failure}"],
    retryFailed: ["Повторить неудачные", "Орындалмағандарын қайталау", "Retry failed calls"],
    ready: ["Расшифровка готова", "Қоңыраулардың мәтіні дайын", "Transcription ready"],
    finishedErrors: ["Расшифровка завершена: {errors}", "Мәтінге айналдыру аяқталды: {errors}", "Transcription complete: {errors}"],
    errors: ["Ошибок {failed}", "Қателер: {failed}", "Errors: {failed}"],
    progressErrors: ["Готово {done} из {total}, ошибок {failed}", "{total} ішінен {done} дайын, қателер: {failed}", "{done} of {total} done, {failed} errors"],
    loading: ["Получаем состояние звонков", "Қоңыраулардың күйін алудамыз", "Loading call status"],
    disabled: ["Расшифровка звонков сейчас недоступна", "Қазір қоңырауларды мәтінге айналдыру қолжетімсіз", "Call transcription is currently unavailable"],
    empty: ["Звонков для расшифровки нет", "Мәтінге айналдыратын қоңыраулар жоқ", "No calls to transcribe"],
    retry: ["Повторить", "Қайталау", "Retry"], hide: ["Скрыть панель расшифровки", "Мәтінге айналдыру панелін жасыру", "Hide transcription panel"],
    check: ["Проверить расшифровку звонков", "Қоңыраулардың мәтінін тексеру", "Check call transcription"],
    pill: ["Расшифровка звонков {done} из {total}", "Қоңыраулар: {total} ішінен {done} дайын", "Call transcription: {done} of {total}"],
    pillErrors: ["Расшифровка звонков {done} из {total}, {failure}", "Қоңыраулар: {total} ішінен {done} дайын, қателер: {failed}", "Call transcription: {done} of {total}; {failure}"]
  }).map(([key, [ru, kk, en]]) => [`stt.${key}`, { ru, kk, en }])));
  const serverMessages = [
    ["Сервис распознавания не настроен", "Сөйлеуді тану қызметі бапталмаған", "The transcription service is not configured"],
    ["Сервис распознавания не ответил", "Сөйлеуді тану қызметі жауап бермеді", "The transcription service did not respond"],
    ["Сервис распознавания вернул неполный ответ", "Сөйлеуді тану қызметінің жауабы толық емес", "The transcription service returned an incomplete response"],
    ["Сервис распознавания вернул неверную длительность", "Сөйлеуді тану қызметі ұзақтықты қате көрсетті", "The transcription service returned an invalid duration"],
    ["Не удалось скачать запись", "Жазбаны жүктеу мүмкін болмады", "Could not download the recording"],
    ["Запись повреждена", "Жазба бүлінген", "The recording is damaged"],
    ["Не удалось проверить запись", "Жазбаны тексеру мүмкін болмады", "Could not verify the recording"],
    ["Расшифровка прервалась. Повторите её", "Мәтінге айналдыру үзілді. Қайталаңыз", "Transcription was interrupted. Retry it"],
    ["Не удалось безопасно скрыть личные данные. Повторите расшифровку", "Жеке деректерді қауіпсіз жасыру мүмкін болмады. Мәтінге айналдыруды қайталаңыз", "Personal data could not be safely hidden. Retry transcription"],
    ["Не удалось обработать расшифровку. Повторите её", "Транскрипцияны өңдеу мүмкін болмады. Қайталаңыз", "Could not process the transcript. Retry it"],
    ["Расшифровка звонков выключена", "Қоңырауларды мәтінге айналдыру өшірілген", "Call transcription is disabled"],
    ["У этого обращения нет аудиозаписи", "Бұл өтініштің аудиожазбасы жоқ", "This conversation has no audio recording"]
  ];
  const serverKeys = new Map(serverMessages.map(([ru], index) => [ru, `server${index}`]));
  DA.i18n.addMessages(Object.fromEntries(serverMessages.map(([ru, kk, en], index) => [`stt.server${index}`, { ru, kk, en }])));
  const serverMessage = (value) => serverKeys.has(value) ? T(serverKeys.get(value)) : value;
  const listeners = new Set(), imports = new WeakSet(), retrying = new Set(), retryErrors = new Map();
  const steps = new Set(["queued", "download", "transcribe", "mask", "build", "done", "failed"]);
  let snapshot = null, scopeIds = null, tracking = false, hidden = false, restored = false, loading = false;
  let error = "", timer = null, request = null, requestId = 0, waitingSince = 0, viewers = 0, modal = null;
  let floating = null, floatButton = null, floatLabel = null, floatRing = null, dockFrame = null;
  let bulkNode = null, resizeObserver = null, bodyObserver = null;
  let completionAt = 0, completionTimer = null;
  const active = (item) => item.status === "queued" || item.status === "running";
  const errorText = (e) => DA.msg(() => serverMessage(e?.message) || T("genericError"));
  const settled = (value) => value.loaded && value.total > 0 && !value.pending && !value.missing && !value.retryPending && !value.error && value.done + value.failed === value.total;
  function failureText(count) {
    const number = count.toLocaleString(DA.i18n.locale());
    if (DA.i18n.locale() === "ru") return count === 1 ? "один звонок не получился" : `${number} ${DA.fmt.plural(count, ["звонок не получился", "звонка не получились", "звонков не получилось"])}`;
    return `${number} ${count === 1 ? "call failed" : "calls failed"}`;
  }
  const completedSummary = (current) => M("completeErrors", () => ({ ...current, failure: failureText(current.failed) }));
  function errorCount(count) {
    const number = count.toLocaleString(DA.i18n.locale());
    if (DA.i18n.locale() === "ru") return `${number} ${DA.fmt.plural(count, ["ошибка", "ошибки", "ошибок"])}`;
    return DA.i18n.locale() === "kk" ? `${number} қате` : `${number} ${count === 1 ? "error" : "errors"}`;
  }

  function state(options) {
    const all = snapshot?.items || [], selected = options?.all ? null : options?.ids || scopeIds;
    const set = selected ? new Set(selected) : null;
    const items = all.filter((item) => !set || set.has(item.conversationId)).sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
    const done = items.filter((item) => item.status === "done").length, failed = items.filter((item) => item.status === "failed").length;
    return { enabled: snapshot?.enabled !== false, items, total: items.length, done, failed, pending: items.filter(active).length,
      retryPending: items.filter((item) => retrying.has(item.conversationId)).length,
      missing: set ? [...set].filter((id) => !items.some((item) => item.conversationId === id)).length : 0,
      allTotal: all.length, allPending: all.filter(active).length, allFailed: all.filter((item) => item.status === "failed").length,
      loaded: snapshot !== null, loading, error, hidden, tracking };
  }
  function save() {
    try {
      if (tracking) sessionStorage.setItem(KEY, JSON.stringify({ ids: scopeIds, hidden, completionAt }));
      else sessionStorage.removeItem(KEY);
    } catch (_) { /* Опрос продолжается без сохранения состояния панели. */ }
  }
  function publish() {
    updateCompletion();
    save();
    renderFloating();
    const value = state();
    listeners.forEach((fn) => fn(value));
    window.dispatchEvent(new CustomEvent("da:stt-changed", { detail: value }));
  }
  function updateCompletion() {
    clearTimeout(completionTimer);
    const current = state();
    if (!tracking || current.loaded && (current.pending || current.missing || current.retryPending)) completionAt = 0;
    else if (settled(current)) {
      if (!completionAt) completionAt = Date.now() + 4000;
      const remaining = completionAt - Date.now();
      if (remaining <= 0) hidden = true;
      else completionTimer = setTimeout(publish, remaining);
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (snapshot?.enabled === false) return;
    const current = state();
    const missing = current.missing && waitingSince && Date.now() - waitingSince < 30000;
    if (current.allPending || missing || error && tracking) timer = setTimeout(() => refresh(), 1000);
  }
  async function refresh(force) {
    if (request && !force) return state();
    clearTimeout(timer);
    request?.abort();
    const own = new AbortController(), id = ++requestId;
    request = own; loading = true;
    publish();
    try {
      const result = await DA.api.getSttJobs({}, { signal: own.signal });
      if (id !== requestId || own.signal.aborted) return state();
      snapshot = { ...result, items: Array.isArray(result.items) ? result.items : [] };
      error = "";
      if (!tracking && snapshot.items.some(active)) { tracking = true; scopeIds = snapshot.items.filter(active).map((item) => item.conversationId); }
      if (!state().missing) waitingSince = 0;
      else if (waitingSince && Date.now() - waitingSince >= 30000) error = M("missingError");
    } catch (e) {
      if (id === requestId && !own.signal.aborted) error = errorText(e);
    } finally {
      if (id === requestId) { request = null; loading = false; publish(); schedule(); }
    }
    return state();
  }
  async function retryItems(ids) {
    const selected = [...new Set(ids)].filter((id) => !retrying.has(id));
    if (!selected.length) return;
    selected.forEach((id) => { retrying.add(id); retryErrors.delete(id); });
    tracking = true;
    if (scopeIds) scopeIds = [...new Set([...scopeIds, ...selected])];
    hidden = false; completionAt = 0; publish();
    try {
      await Promise.all(selected.map(async (id) => {
        try {
          const result = await DA.api.retryTranscription(id);
          const item = snapshot?.items.find((entry) => entry.conversationId === id);
          if (item) { item.status = result.status || "queued"; item.step = result.step || "queued"; item.error = null; }
        } catch (e) { retryErrors.set(id, errorText(e)); }
      }));
      await refresh(true);
    } finally { selected.forEach((id) => retrying.delete(id)); publish(); schedule(); }
  }
  const retry = (id) => retryItems([id]);
  function ring(done, total) {
    const value = total ? Math.max(0, Math.min(100, done / total * 100)) : 0;
    return h("span", { class: "stt-ring", "aria-hidden": "true", html: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle class="stt-ring-value" cx="12" cy="12" r="9" pathLength="100" stroke-dasharray="${value} 100"/></svg>` });
  }
  function statusText(item) {
    if (item.status === "failed") return T("failedReason", { reason: serverMessage(item.error) || T("failedDefault") });
    if (item.status === "done" && item.incomplete) {
      const decoded = item.audioSecondsDecoded, declared = item.audioSecondsDeclared;
      return Number.isFinite(decoded) && Number.isFinite(declared) ? T("truncated", { decoded: DA.fmt.duration(decoded), declared: DA.fmt.duration(declared) }) : T("incomplete");
    }
    return T(item.status === "done" ? "done" : steps.has(item.step) ? item.step : "queued");
  }
  function duration(item) {
    const conv = DA.state.conversations[item.conversationId];
    const seconds = item.audioSecondsDeclared ?? item.durationSec ?? (conv ? DA.tx.duration(conv) : null);
    return Number.isFinite(seconds) ? T("callDuration", { duration: DA.fmt.duration(seconds) }) : T("call");
  }
  function attach(options) {
    const { pane, foot, close, receipt } = options;
    viewers++; renderFloating();
    const meter = h("div", { class: "stt-meter", role: "progressbar", "aria-label": M("progressLabel"), "aria-valuemin": "0" },
      h("span", { class: "stt-meter-done" }), h("span", { class: "stt-meter-failed" }));
    const summary = h("b"), failedCount = h("span", { class: "stt-failed-count" });
    const list = h("ul", { class: "stt-list" }), empty = h("p", { class: "stt-empty", role: "status" });
    const networkText = h("p"), reconnect = h("button", { class: "da-btn is-sm", type: "button", onclick: () => refresh(true) }, M("refresh"));
    const network = h("div", { class: "stt-network", role: "alert", hidden: true }, networkText, reconnect);
    const progress = h("div", { class: "stt-progress" }, h("div", { class: "stt-progress-head", "aria-live": "polite" }, summary, failedCount), meter);
    const background = h("button", { class: "da-btn stt-background", type: "button", onclick: close }, M("background"));
    const retryFailed = h("button", { class: "da-btn", type: "button", hidden: true, onclick: () => retryItems(state(options).items.filter((item) => item.status === "failed").map((item) => item.conversationId)) }, M("retryFailed"));
    const done = h("button", { class: "da-btn is-primary", type: "button", disabled: true, onclick: () => {
      if (!settled(state(options))) return;
      if (settled(state())) { hidden = true; publish(); }
      close();
    } }, M("done"));
    pane.classList.add("stt-step-pane");
    pane.classList.remove("is-in");
    pane.replaceChildren(...[
      receipt ? h("ol", { class: "stt-steps", "aria-label": M("steps") }, h("li", { class: "is-done" }, h("span", {}, DA.icon("check", 12)), M("upload")), h("li", { "aria-current": "step" }, h("span", {}, "2"), M("title"))) : null,
      receipt ? h("p", { class: "stt-import-receipt" }, receipt) : null,
      h("p", { class: "stt-intro" }, M("intro")),
      progress, empty, list, network
    ].filter(Boolean));
    foot.classList.add("stt-foot");
    foot.replaceChildren(background, retryFailed, done);
    let stamp = "", alive = true, footerMode = null, backgroundAnimation = null;
    function renderFooter(current) {
      const complete = settled(current), mode = complete ? current.failed ? "failed" : "done" : "pending";
      const focusedRetry = document.activeElement === retryFailed, focusedBackground = document.activeElement === background;
      done.disabled = !complete;
      retryFailed.hidden = mode !== "failed";
      if (mode === footerMode) return;
      backgroundAnimation?.cancel(); backgroundAnimation = null;
      background.disabled = mode !== "pending";
      if (mode === "pending") { background.hidden = false; if (focusedRetry) background.focus({ preventScroll: true }); }
      else {
        if (focusedBackground) done.focus({ preventScroll: true });
        if (footerMode === "pending" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const width = background.getBoundingClientRect().width;
          backgroundAnimation = background.animate([
            { maxWidth: `${width}px`, opacity: 1, marginRight: "0px" },
            { maxWidth: "0px", opacity: 0, paddingLeft: "0px", paddingRight: "0px", borderWidth: "0px", marginRight: "-8px" }
          ], { duration: 150, easing: "ease-out", fill: "forwards" });
          backgroundAnimation.onfinish = () => { background.hidden = true; backgroundAnimation?.cancel(); backgroundAnimation = null; };
        } else background.hidden = true;
      }
      footerMode = mode;
    }
    function render() {
      if (!alive) return;
      const current = state(options), finished = current.done + current.failed, complete = settled(current);
      if (options.heading) bind(options.heading, complete ? M("title") : options.pendingTitle || M("title"));
      progress.hidden = !current.total;
      bind(summary, complete ? current.failed ? completedSummary(current) : M("complete") : M("progress", current));
      bind(failedCount, current.failed && !complete ? M("errors", current) : "");
      meter.setAttribute("aria-valuemax", String(current.total || 1));
      meter.setAttribute("aria-valuenow", String(finished));
      DA.i18n.bindAttr(meter, "aria-valuetext", complete ? current.failed ? completedSummary(current) : M("complete") : M(current.failed ? "progressErrors" : "progress", current));
      meter.children[0].style.width = `${current.total ? current.done / current.total * 100 : 0}%`;
      meter.children[1].style.width = `${current.total ? current.failed / current.total * 100 : 0}%`;
      renderFooter(current);
      empty.hidden = !!current.total;
      bind(empty, M(!current.loaded || current.loading && current.missing ? "loading" : !current.enabled ? "disabled" : "empty"));
      network.hidden = !current.error;
      bind(networkText, current.error);
      reconnect.disabled = current.loading;
      const nextStamp = JSON.stringify(current.items.map((item) => [item.conversationId, item.number, item.status, item.step, item.error, item.incomplete, item.audioSecondsDeclared, item.audioSecondsDecoded, item.durationSec, retrying.has(item.conversationId), retryErrors.get(item.conversationId)]));
      if (nextStamp === stamp) return;
      stamp = nextStamp;
      const focusId = list.contains(document.activeElement) ? document.activeElement.dataset.sttFocus || document.activeElement.dataset.sttStatus : null;
      list.replaceChildren(...current.items.map((item) => {
        const cid = item.conversationId;
        const status = h("div", { class: `stt-status is-${item.status}`, tabindex: -1, "data-stt-status": cid },
          active(item) ? h("i", { class: item.status === "running" ? "stt-spinner" : "stt-queued", "aria-hidden": "true" }) : DA.icon(item.status === "done" ? "check" : "x", 17),
          h("span", {}, DA.msg(() => statusText(item))));
        const action = item.status === "failed" ? h("button", { class: `da-btn is-text is-sm${retrying.has(cid) ? " is-busy" : ""}`, type: "button", "data-stt-focus": cid, disabled: retrying.has(cid), onclick: () => retry(cid) }, M("retry")) : null;
        return h("li", { class: "stt-row", "data-stt-id": cid },
          h("div", { class: "stt-call" }, h("b", {}, `№ ${item.number != null ? DA.fmt.number(item.number) : DA.convNumber(cid)}`), h("span", {}, DA.msg(() => duration(item)))),
          status, action,
          retryErrors.has(cid) ? h("p", { class: "stt-retry-error", role: "alert" }, retryErrors.get(cid)) : null);
      }));
      if (focusId) ([...list.querySelectorAll("[data-stt-focus]")].find((node) => node.dataset.sttFocus === focusId && !node.disabled)
        || [...list.querySelectorAll("[data-stt-status]")].find((node) => node.dataset.sttStatus === focusId))?.focus({ preventScroll: true });
    }
    const off = subscribe(render);
    return () => { if (!alive) return; alive = false; backgroundAnimation?.cancel(); off(); viewers--; pane.classList.remove("stt-step-pane"); renderFloating(); };
  }
  function open(options) {
    if (modal) { modal.panel.focus(); return; }
    const pane = h("div"), foot = h("div", { class: "stt-foot" });
    let detach;
    const own = DA.modal({ title: M("title"), width: 640, body: pane, foot,
      onClose() { detach?.(); if (modal === own) modal = null; } });
    modal = own;
    own.panel.classList.add("stt-modal");
    detach = attach({ ...options, pane, foot, close: () => own.close() });
    if (!snapshot || error) refresh(true);
  }
  function dock() {
    dockFrame = null;
    if (!floating) return;
    const base = innerWidth <= 760 ? 16 : 24;
    const rect = bulkNode?.getBoundingClientRect();
    const bottom = rect && rect.height ? Math.max(base, innerHeight - rect.top + 12) : base;
    floating.style.bottom = `${bottom}px`;
    document.body.style.setProperty("--stt-clearance", `${bottom + floating.offsetHeight + 16}px`);
  }
  function watchDock() {
    const next = document.querySelector(".bulk-panel");
    if (next !== bulkNode) { if (bulkNode) resizeObserver?.unobserve(bulkNode); bulkNode = next; if (bulkNode) resizeObserver?.observe(bulkNode); }
    if (!dockFrame) dockFrame = requestAnimationFrame(dock);
  }
  function renderFloating() {
    const current = state();
    const visible = tracking && !hidden && !viewers && (current.total || !current.loaded || current.error);
    if (!visible) { floating?.remove(); floating = null; document.body.classList.remove("has-stt-panel"); return; }
    if (!floating) {
      floatLabel = h("span"); floatRing = h("span");
      floatButton = h("button", { class: "stt-pill", type: "button", onclick: () => open() }, floatRing, floatLabel);
      floating = h("div", { class: "stt-floating", "aria-label": M("title") }, floatButton,
        h("button", { class: "stt-dismiss", type: "button", "aria-label": M("hide"), title: M("hide"), onclick: () => { hidden = true; publish(); } }, DA.icon("x", 16)));
      document.body.append(floating);
    }
    const complete = settled(current);
    bind(floatLabel, M(current.error ? "check" : complete ? current.failed ? "finishedErrors" : "ready" : current.total ? current.failed ? "pillErrors" : "pill" : "loading", () => ({ ...current, failure: failureText(current.failed), errors: errorCount(current.failed) })));
    floatRing.replaceChildren(current.error || complete && current.failed ? DA.icon("alert", 20) : complete ? DA.icon("check", 20) : ring(current.done + current.failed, current.total));
    document.body.classList.add("has-stt-panel");
    watchDock();
  }
  function subscribe(fn) { listeners.add(fn); fn(state()); return () => listeners.delete(fn); }
  function restore() {
    if (restored) return Promise.resolve(state());
    restored = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (saved) { tracking = true; scopeIds = Array.isArray(saved.ids) ? saved.ids.filter((id) => typeof id === "string") : null; hidden = saved.hidden === true; completionAt = Number.isFinite(saved.completionAt) ? saved.completionAt : 0; }
    } catch (_) { /* Начинаем с текущего состояния сервера. */ }
    resizeObserver = new ResizeObserver(watchDock);
    bodyObserver = new MutationObserver(watchDock);
    bodyObserver.observe(document.body, { childList: true, attributes: true, attributeFilter: ["class", "data-sidebar"] });
    window.addEventListener("resize", watchDock);
    window.addEventListener("da:locale-changed", watchDock);
    return refresh();
  }
  function trackImport(result, options) {
    if (!result?.sttQueued) return false;
    if (imports.has(result)) return true;
    imports.add(result);
    tracking = true; hidden = false; completionAt = 0;
    const ids = Array.isArray(result.sttConversationIds) && result.sttConversationIds.length ? result.sttConversationIds : null;
    scopeIds = options?.append && scopeIds && ids ? [...new Set([...scopeIds, ...ids])] : ids ? [...new Set(ids)] : null;
    if (ids) snapshot?.items.forEach((item) => { if (ids.includes(item.conversationId)) { item.status = "queued"; item.step = "queued"; item.error = null; } });
    waitingSince = Date.now(); error = "";
    publish(); refresh(true);
    return true;
  }
  DA.stt = { restore, refresh, trackImport, attach, open, retry, subscribe, current: state,
    item: (id) => snapshot?.items.find((item) => item.conversationId === id) || null };
})();
