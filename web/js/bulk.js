/* Общая панель пакетной оценки: выбор, прогресс и восстановление текущей задачи. */
(function () {
  const DA = window.DA, h = DA.h, KEY = "da.bulk.v1";
  const messages = {
    "bulk.resultError": { ru: "Не удалось получить результат. Попробуйте ещё раз", kk: "Нәтижені алу мүмкін болмады. Қайталап көріңіз", en: "Could not load the result. Try again" },
    "bulk.waitCurrent": { ru: "Дождитесь завершения текущей оценки", kk: "Ағымдағы бағалаудың аяқталуын күтіңіз", en: "Wait for the current evaluation to finish" },
    "bulk.noConversations": { ru: "Выберите обращения для оценки", kk: "Бағалау үшін өтініштерді таңдаңыз", en: "Select conversations to evaluate" },
    "bulk.dismiss": { ru: "Скрыть уведомление об оценке", kk: "Бағалау туралы хабарландыруды жасыру", en: "Hide evaluation notification" },
    "bulk.version": { ru: "Версия {version}", kk: "{version}-нұсқа", en: "Version {version}" },
    "bulk.versionLabel": { ru: "Версия чек-листа", kk: "Тексеру парағының нұсқасы", en: "Checklist version" },
    "bulk.active": { ru: "Активная", kk: "Белсенді", en: "Active" },
    "bulk.selected": { ru: "Выбрано {count}", kk: "Таңдалғаны: {count}", en: "{count} selected" },
    "bulk.checklist": { ru: "По чек-листу", kk: "Тексеру парағы", en: "Checklist" },
    "bulk.startingEvaluation": { ru: "Запускаем оценку", kk: "Бағалау басталуда", en: "Starting evaluation" },
    "bulk.evaluate": {
      ru: { one: "Оценить {count} обращение", few: "Оценить {count} обращения", many: "Оценить {count} обращений", other: "Оценить {count} обращения" },
      kk: "{count} өтінішті бағалау",
      en: { one: "Evaluate {count} conversation", other: "Evaluate {count} conversations" }
    },
    "bulk.clearSelection": { ru: "Снять выбор", kk: "Таңдауды алып тастау", en: "Clear selection" },
    "bulk.repeated": {
      ru: { one: "{count} обращение уже оценено по этой версии. Оценим заново", few: "{count} обращения уже оценены по этой версии. Оценим заново", many: "{count} обращений уже оценены по этой версии. Оценим заново", other: "{count} обращения уже оценены по этой версии. Оценим заново" },
      kk: "Осы нұсқа бойынша {count} өтініш бағаланған. Оларды қайта бағалаймыз",
      en: { one: "{count} was already evaluated with this version. It will be evaluated again", other: "{count} were already evaluated with this version. They will be evaluated again" }
    },
    "bulk.completedLabel": { ru: "Завершено обращений", kk: "Бағалауы аяқталған өтініштер", en: "Completed conversations" },
    "bulk.itemDone": { ru: "№ {number}: {score}", kk: "№ {number}: {score}", en: "#{number}: {score}" },
    "bulk.itemFailed": { ru: "№ {number}: не удалось оценить", kk: "№ {number}: бағалау мүмкін болмады", en: "#{number}: evaluation failed" },
    "bulk.itemRunning": { ru: "№ {number}: оценивается", kk: "№ {number}: бағалануда", en: "#{number}: being evaluated" },
    "bulk.itemQueued": { ru: "№ {number}: в очереди", kk: "№ {number}: кезекте", en: "#{number}: queued" },
    "bulk.checkEvaluation": { ru: "Проверить оценку", kk: "Бағалауды тексеру", en: "Check evaluation" },
    "bulk.failedCount": { ru: "Не удалось оценить {count}", kk: "{count} өтінішті бағалау мүмкін болмады", en: "Failed to evaluate {count}" },
    "bulk.ready": { ru: "Готово", kk: "Дайын", en: "Done" },
    "bulk.progressCount": { ru: "Оценка {done} из {total}", kk: "Бағалау: {total} ішінен {done}", en: "Evaluating {done} of {total}" },
    "bulk.moreEvaluations": {
      ru: { one: "Ещё {count} оценка", few: "Ещё {count} оценки", many: "Ещё {count} оценок", other: "Ещё {count} оценки" },
      kk: "Тағы {count} бағалау",
      en: { one: "{count} more evaluation", other: "{count} more evaluations" }
    },
    "bulk.jobsLabel": { ru: "Текущие оценки", kk: "Ағымдағы бағалаулар", en: "Current evaluations" },
    "bulk.evaluationNumber": { ru: "Оценка {number}", kk: "{number}-бағалау", en: "Evaluation {number}" },
    "bulk.missingJob": { ru: "Не найдена", kk: "Табылмады", en: "Not found" },
    "bulk.offline": { ru: "Нет связи", kk: "Байланыс жоқ", en: "No connection" },
    "bulk.countOf": { ru: "{done} из {total}", kk: "{total} ішінен {done}", en: "{done} of {total}" },
    "bulk.errorCount": { ru: "Ошибок {count}", kk: "Қателер: {count}", en: "Errors: {count}" },
    "bulk.finished": {
      ru: { one: "Готово: оценено {count} обращение за {time}", few: "Готово: оценено {count} обращения за {time}", many: "Готово: оценено {count} обращений за {time}", other: "Готово: оценено {count} обращения за {time}" },
      kk: "Дайын: {time} ішінде {count} өтініш бағаланды",
      en: { one: "Done: {count} conversation evaluated in {time}", other: "Done: {count} conversations evaluated in {time}" }
    },
    "bulk.evaluating": { ru: "Оцениваем обращения: {done} из {total}", kk: "Өтініштер бағалануда: {total} ішінен {done}", en: "Evaluating conversations: {done} of {total}" },
    "bulk.collapse": { ru: "Свернуть", kk: "Жию", en: "Collapse" },
    "bulk.showFailures": { ru: "Не удалось оценить {count}. Показать", kk: "{count} өтінішті бағалау мүмкін болмады. Көрсету", en: "Failed to evaluate {count}. Show" },
    "bulk.starting": { ru: "Запускаем", kk: "Басталуда", en: "Starting" },
    "bulk.retryFailed": { ru: "Повторить их", kk: "Қайта бағалау", en: "Retry failed" },
    "bulk.remainingMinutes": { ru: "Осталось около {count} мин", kk: "Шамамен {count} мин қалды", en: "About {count} min remaining" },
    "bulk.remainingSeconds": { ru: "Осталось около {count} с", kk: "Шамамен {count} с қалды", en: "About {count} s remaining" },
    "bulk.close": { ru: "Закрыть", kk: "Жабу", en: "Close" },
    "bulk.checkAgain": { ru: "Проверить снова", kk: "Қайта тексеру", en: "Check again" },
    "bulk.panelLabel": { ru: "Пакетная оценка", kk: "Топтық бағалау", en: "Batch evaluation" },
    "bulk.durationSeconds": { ru: "{seconds} с", kk: "{seconds} с", en: "{seconds} s" },
    "bulk.durationMinutes": { ru: "{minutes} мин", kk: "{minutes} мин", en: "{minutes} min" },
    "bulk.durationBoth": { ru: "{minutes} мин {seconds} с", kk: "{minutes} мин {seconds} с", en: "{minutes} min {seconds} s" }
  };
  DA.i18n.addMessages(messages);
  const msg = (key, params) => DA.msg(`bulk.${key}`, params);
  const text = (key, params) => DA.t(`bulk.${key}`, params);
  const errorKeys = { batch_running: "waitCurrent", no_conversations: "noConversations" };
  const errorInfo = (error) => {
    const errorKey = errorKeys[error?.code] || (!error?.message ? "resultError" : null);
    return { error: error?.message || text(errorKey), errorKey,
      errorDetail: error ? { name: error.name, code: error.code, message: error.message, status: error.status } : null };
  };
  const errorMessage = (value, key, detail) => key ? msg(key) : DA.msg(() => DA.apiErrorMessage(detail || { name: "ApiError", message: value }));
  const listeners = new Set(), batches = new Map(), controllers = new Map(), reconnects = new Map(), starts = new Map();
  let batch = null, selection = null, starting = 0;
  let panel = null, panelKind = "", restored = false, hideTimer = null, collapseTimer = null;
  let selectionError = "", selectionErrorKey = null, selectionErrorDetail = null, version = null;

  const terminal = (job) => job && ["done", "failed"].includes(job.status);
  const running = (job) => job && !job.unavailable && !terminal(job);
  const busy = () => starting > 0 || [...batches.values()].some(running);
  const visibleJobs = () => [...batches.values()].filter((job) => !job.hidden);
  const elapsedText = (seconds) => {
    const s = Math.max(0, Math.round(seconds || 0)), m = Math.floor(s / 60);
    return text(m ? s % 60 ? "durationBoth" : "durationMinutes" : "durationSeconds", { minutes: m, seconds: s % 60 });
  };
  function save() {
    try {
      if (!batches.size) sessionStorage.removeItem(KEY);
      else {
        const snapshots = [...batches.values()].map((job) => ({ ...job, items: job.items.map(({ evaluation, ...item }) => item) }));
        const stored = { ...snapshots.find((job) => job.jobId === batch?.jobId), mode: DA.mode, focusedJobId: batch?.jobId, jobs: snapshots };
        sessionStorage.setItem(KEY, JSON.stringify(stored));
      }
    } catch (e) { /* Оценка продолжается и без хранилища браузера. */ }
  }
  function publish(changed) {
    render();
    save();
    listeners.forEach((fn) => fn(changed || batch));
  }
  function timersOff() { clearTimeout(hideTimer); clearTimeout(collapseTimer); }
  function hideNotice() {
    if (!batch) return;
    const hadFocus = panel?.contains(document.activeElement);
    timersOff();
    visibleJobs().forEach((job) => { job.hidden = true; });
    publish();
    batches.forEach((job) => { if (job.hidden && job.error && running(job)) watch(job); });
    if (hadFocus) document.querySelector("#da-main h1")?.focus({ preventScroll: true });
  }
  const dismissButton = () => h("button", { class: "bulk-dismiss", type: "button", "aria-label": msg("dismiss"), title: msg("dismiss"), onclick: hideNotice }, DA.icon("x", 18));
  function finishLater(job) {
    if (!job || job.hidden || job !== batch) return;
    timersOff();
    collapseTimer = setTimeout(() => {
      if (batch !== job || job.hidden || !terminal(job)) return;
      job.collapsed = true;
      publish(job);
      if (!job.failed) hideTimer = setTimeout(() => { if (batch === job && terminal(job)) { job.hidden = true; publish(job); } }, 3000);
    }, 6000);
  }
  function receive(job) {
    const target = batches.get(job.id);
    if (!target) return;
    const wasDone = terminal(target);
    Object.assign(target, job, { jobId: job.id, error: null, errorKey: null, errorDetail: null, unavailable: false });
    if (!wasDone && terminal(target) && target === batch) {
      const next = visibleJobs().find((item) => item !== target && running(item));
      if (next) { timersOff(); batch = next; }
    }
    publish(target);
    if (!wasDone && terminal(target)) finishLater(target);
  }
  async function watch(target = batch) {
    if (!target?.jobId) return;
    const id = target.jobId, own = new AbortController();
    clearTimeout(reconnects.get(id));
    reconnects.delete(id);
    controllers.get(id)?.abort();
    controllers.set(id, own);
    target.error = null;
    target.errorKey = null;
    target.errorDetail = null;
    publish(target);
    try {
      const job = await DA.data.watchJob(id, { signal: own.signal, onProgress: (job) => { if (!own.signal.aborted) receive(job); } });
      if (!own.signal.aborted) receive(job);
    } catch (error) {
      if (own.signal.aborted || batches.get(id) !== target) return;
      Object.assign(target, errorInfo(error));
      if (error.code === "not_found" || error.status === 404) target.unavailable = true;
      publish(target);
      if (target.hidden && running(target)) reconnects.set(id, setTimeout(() => {
        reconnects.delete(id);
        if (batches.get(id) === target && running(target)) watch(target);
      }, 5000));
    } finally { if (controllers.get(id) === own) controllers.delete(id); }
  }

  /* Версия выбирается до запуска; в работе её уже нельзя изменить. */
  function versionPicker() {
    const target = DA.checklist(version) || DA.activeChecklist();
    version = target.version;
    const label = h("span", {}, msg("version", { version }));
    const button = h("button", { class: "da-btn bulk-version", type: "button", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": msg("versionLabel") }, label, DA.icon("chevron", 14));
    const choices = h("div", { class: "bulk-versions", role: "listbox", "aria-label": msg("versionLabel"), hidden: true });
    const wrap = h("div", { class: "bulk-picker" }, button, choices);
    const close = () => { choices.hidden = true; button.setAttribute("aria-expanded", "false"); };
    const options = [...DA.state.checklists].sort((a, b) => b.version - a.version);
    options.forEach((cl) => choices.append(h("button", {
      class: "bulk-version-option", type: "button", role: "option", "aria-selected": String(cl.version === version),
      onclick: () => { version = cl.version; close(); render(); panel?.querySelector(".bulk-version")?.focus(); }
    }, msg("version", { version: cl.version }), cl.isActive ? h("span", {}, msg("active")) : null)));
    button.addEventListener("click", () => {
      choices.hidden = !choices.hidden;
      button.setAttribute("aria-expanded", String(!choices.hidden));
      if (!choices.hidden) choices.querySelector('[aria-selected="true"]')?.focus();
    });
    wrap.addEventListener("focusout", (e) => { if (!wrap.contains(e.relatedTarget)) close(); });
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); button.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        choices.hidden = false;
        button.setAttribute("aria-expanded", "true");
        const buttons = [...choices.children], at = buttons.indexOf(document.activeElement);
        const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    });
    return wrap;
  }
  function selectionPanel() {
    const ids = selection.ids, n = ids.length;
    const repeated = ids.filter((cid) => {
      const ev = DA.state.evaluations[cid];
      return ev?.status === "done" && !ev.stale && ev.checklistVersion === version;
    }).length;
    const content = h("div", { class: "bulk-selection-content" },
      h("b", { class: "bulk-selected-count" }, msg("selected", { count: n })),
      h("div", { class: "bulk-version-field" }, h("span", {}, msg("checklist")), versionPicker()),
      h("button", { class: "da-btn is-primary bulk-start" + (starting ? " is-busy" : ""), type: "button", disabled: starting > 0, onclick: async () => {
        try { await start(ids, { checklistVersion: version, reuse: false, source: "registry" }); }
        catch (error) { const info = errorInfo(error); selectionError = info.error; selectionErrorKey = info.errorKey; selectionErrorDetail = info.errorDetail; render(); }
      } }, starting ? msg("startingEvaluation") : msg("evaluate", { count: n })),
      h("button", { class: "da-btn is-text bulk-clear", type: "button", disabled: starting > 0, onclick: () => selection?.onClear?.() }, msg("clearSelection")));
    if (repeated) content.append(h("p", { class: "bulk-repeat" }, msg("repeated", { count: repeated })));
    if (selectionError) content.append(h("p", { class: "bulk-error", role: "alert" }, errorMessage(selectionError, selectionErrorKey, selectionErrorDetail)));
    return content;
  }
  function showFailures() {
    if (!batch) return;
    batch.collapsed = true;
    publish();
    const hash = "#/?state=failed&batch=" + encodeURIComponent(batch.jobId);
    if (location.hash === hash) DA.route();
    else location.hash = hash;
  }
  async function retryFailed() {
    const old = batch, failed = old.items.filter((item) => item.status === "failed").map((item) => item.conversationId);
    if (!failed.length) return;
    try { await start(failed, { ...old.meta, checklistVersion: old.checklistVersion, reuse: true, retryOf: old.jobId, allowConcurrent: true }); }
    catch (error) { if (batch === old) { Object.assign(old, errorInfo(error), { collapsed: false }); publish(); } }
  }
  function progressBar() {
    const done = batch.done + batch.failed;
    const bar = h("div", { class: "bulk-meter" + (batch.total > 100 ? " is-continuous" : ""), role: "progressbar", "aria-label": msg("completedLabel"), "aria-valuemin": 0, "aria-valuemax": batch.total, "aria-valuenow": done });
    if (batch.total > 100) {
      bar.append(h("i", { style: { transform: `scaleX(${batch.total ? done / batch.total : 0})` } }));
    } else batch.items.forEach((item) => {
      const tone = item.status === "failed" ? "failed" : item.status === "done" ? item.total >= 85 ? "yes" : item.total >= 50 ? "partial" : "no" : item.status;
      const label = msg(item.status === "done" ? "itemDone" : item.status === "failed" ? "itemFailed" : item.status === "running" ? "itemRunning" : "itemQueued",
        () => ({ number: DA.convNumber(item.conversationId), score: DA.fmt.score(item.total) }));
      bar.append(h("i", { class: `is-${tone}`, title: label }, item.status === "failed" ? DA.icon("x", 10) : null));
    });
    return bar;
  }
  function pill() {
    const done = batch.done + batch.failed, finished = terminal(batch), value = batch.total ? done / batch.total : 0;
    const other = visibleJobs().length - 1;
    const ring = h("span", { class: "bulk-ring", "aria-hidden": "true" });
    ring.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle class="bulk-ring-value" cx="12" cy="12" r="9"/></svg>';
    ring.querySelector(".bulk-ring-value").style.strokeDasharray = `${value * 56.55} 56.55`;
    return h("div", { class: "bulk-pill-wrap" },
      h("button", { class: "bulk-pill", type: "button", onclick: () => { timersOff(); batch.collapsed = false; publish(); } },
        finished && !batch.failed ? DA.icon("check", 18) : ring,
        h("span", { class: "bulk-pill-label" },
          h("span", {}, batch.error ? msg("checkEvaluation") : finished ? batch.failed ? msg("failedCount", { count: batch.failed }) : msg("ready") : msg("progressCount", { done, total: batch.total })),
          other ? h("small", {}, msg("moreEvaluations", { count: other })) : null)),
      dismissButton());
  }
  function jobSwitcher() {
    const jobs = visibleJobs();
    if (jobs.length < 2) return null;
    return h("div", { class: "bulk-jobs", role: "group", "aria-label": msg("jobsLabel") }, jobs.map((job, index) =>
      h("button", { class: "bulk-job", type: "button", "data-bulk-focus": job.jobId, "aria-pressed": String(job === batch),
        onclick: () => { timersOff(); batch = job; job.collapsed = false; publish(job); } },
      h("b", {}, msg("evaluationNumber", { number: index + 1 })),
      h("span", {}, job.unavailable ? msg("missingJob") : job.error ? msg("offline") : msg("countOf", { done: job.done + job.failed, total: job.total })),
      job.failed ? h("small", {}, msg("errorCount", { count: job.failed })) : null)));
  }
  function progressPanel() {
    const finished = terminal(batch), settled = batch.done + batch.failed;
    const job = batch;
    const title = h("b", { class: "bulk-progress-title", "aria-live": "polite" }, finished
      ? msg("finished", () => ({ count: job.done, time: elapsedText(job.durationSec) }))
      : msg("evaluating", { done: settled, total: batch.total }));
    const head = h("div", { class: "bulk-progress-head" }, title,
      h("div", { class: "bulk-progress-actions" },
        h("button", { class: "da-btn is-text is-sm", type: "button", onclick: () => { timersOff(); batch.collapsed = true; publish(); } }, msg("collapse")),
        dismissButton()));
    const foot = h("div", { class: "bulk-progress-foot" });
    if (batch.failed) foot.append(h("button", { class: "da-btn is-text is-sm bulk-failures", type: "button", onclick: showFailures }, msg("showFailures", { count: batch.failed })));
    if (finished && batch.failed) foot.append(h("button", { class: "da-btn is-sm", type: "button", disabled: starting > 0, onclick: retryFailed }, msg(starting ? "starting" : "retryFailed")));
    if (!finished && batch.done >= 3 && !batch.error) {
      const seconds = (batch.durationSec / batch.done) * (batch.total - settled);
      if (seconds > 0) foot.append(h("span", { class: "bulk-estimate" }, msg(seconds >= 60 ? "remainingMinutes" : "remainingSeconds", { count: Math.max(1, Math.round(seconds >= 60 ? seconds / 60 : seconds)) })));
    }
    const content = h("div", { class: "bulk-progress-content" }, jobSwitcher(), head, progressBar(), foot);
    if (batch.error) content.append(h("div", { class: "bulk-error", role: "alert" }, h("span", {}, errorMessage(batch.error, batch.errorKey, batch.errorDetail)),
      h("button", { class: "da-btn is-sm", type: "button", onclick: () => {
        if (batch.unavailable) hideNotice();
        else watch();
      } }, msg(batch.unavailable ? "close" : "checkAgain"))));
    return content;
  }
  function render() {
    if (!batch || batch.hidden) batch = visibleJobs().find(running) || visibleJobs().at(-1) || batch;
    const showSelection = selection?.ids.length && (!busy() || starting);
    const kind = showSelection ? "selection" : batch && !batch.hidden ? batch.collapsed ? "pill" : "progress" : "";
    if (!kind) { panel?.remove(); panel = null; panelKind = ""; document.body.classList.remove("has-bulk-panel"); return; }
    if (!panel) { panel = h("section", { class: "bulk-panel", "aria-label": msg("panelLabel") }); document.body.append(panel); }
    const focused = panel.contains(document.activeElement) ? document.activeElement.dataset.bulkFocus || document.activeElement.className : null;
    const jobsScroll = panel.querySelector(".bulk-jobs")?.scrollLeft || 0;
    panel.className = "bulk-panel" + (kind === "pill" ? " is-pill" : "");
    if (kind !== panelKind) {
      panel.classList.add(panelKind ? "is-changing" : "is-entering");
      panelKind = kind;
    }
    panel.replaceChildren(kind === "selection" ? selectionPanel() : kind === "pill" ? pill() : progressPanel());
    document.body.classList.toggle("has-bulk-panel", kind !== "pill");
    if (panel.querySelector(".bulk-jobs")) panel.querySelector(".bulk-jobs").scrollLeft = jobsScroll;
    if (focused) [...panel.querySelectorAll("button")].find((button) => (button.dataset.bulkFocus || button.className) === focused)?.focus({ preventScroll: true });
  }

  function retain(result, ids, options, focus) {
    const existing = batches.get(result.jobId);
    if (existing) return existing;
    const meta = { ...options };
    delete meta.signal;
    const job = { ...meta, meta, ids, evaluationIds: result.evaluationIds, jobId: result.jobId, attachedAt: Date.now(), startedAt: new Date().toISOString(),
      finishedAt: null, durationSec: 0, status: "running", total: ids.length, done: 0, failed: 0,
      items: ids.map((cid) => ({ conversationId: cid, evaluationId: result.evaluationIds[cid], status: "queued", total: null })),
      ...result.job, jobId: result.jobId, collapsed: false, hidden: false, error: null, errorKey: null, errorDetail: null };
    batches.set(job.jobId, job);
    if (focus || !batch || batch.hidden || terminal(batch)) { timersOff(); batch = job; }
    publish(job);
    if (terminal(job)) finishLater(job);
    else watch(job);
    return job;
  }
  function start(ids, options) {
    const unique = [...new Set(ids)], opts = { ...options };
    const key = JSON.stringify([[...unique].sort(), opts.checklistVersion, opts.reuse ?? false]);
    if (starts.has(key)) return starts.get(key);
    if (busy() && !opts.allowConcurrent) return Promise.reject(new DA.ApiError("batch_running", text("waitCurrent"), 409));
    if (!unique.length) return Promise.reject(new DA.ApiError("no_conversations", text("noConversations"), 400));
    starting++;
    selectionError = "";
    selectionErrorKey = null;
    render();
    const task = (async () => {
      try {
        const result = await DA.data.startBatch(unique, opts);
        const clear = selection?.onClear;
        selection = null;
        clear?.();
        return retain(result, unique, opts, true);
      } finally {
        starting--;
        starts.delete(key);
        publish();
      }
    })();
    starts.set(key, task);
    return task;
  }
  async function adopt(accepted, options) {
    if (!accepted?.jobId) return null;
    const existing = batches.get(accepted.jobId);
    if (existing) return existing;
    const result = await DA.data.adoptBatch(accepted, options);
    return retain(result, Object.keys(result.evaluationIds), { ...options }, false);
  }
  async function restore() {
    if (restored) return;
    restored = true;
    let stored;
    try { stored = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return; }
    if (!stored || stored.mode !== DA.mode) return;
    const snapshots = Array.isArray(stored.jobs) ? stored.jobs : [stored];
    snapshots.forEach((job) => {
      if (typeof job.jobId === "string" && Array.isArray(job.ids) && Array.isArray(job.items)) batches.set(job.jobId, job);
    });
    batch = batches.get(stored.focusedJobId || stored.jobId) || [...batches.values()].at(-1) || null;
    publish();
    batches.forEach((job) => { if (!terminal(job) || !job.hidden) watch(job); });
  }
  DA.bulk = {
    start, adopt, attach: adopt, restore, current: () => batch, jobs: () => [...batches.values()], isBusy: busy,
    subscribe(fn) { listeners.add(fn); fn(batch); return () => listeners.delete(fn); },
    setSelection(ids, onClear) {
      selection = ids.length ? { ids: [...ids], onClear } : null;
      if (version == null) version = DA.activeChecklist()?.version;
      selectionError = "";
      selectionErrorKey = null;
      render();
    },
    clearSelection() { selection = null; selectionError = ""; selectionErrorKey = null; render(); }
  };
})();
