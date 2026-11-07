/* Общая панель пакетной оценки: выбор, прогресс и восстановление текущей задачи. */
(function () {
  const DA = window.DA, h = DA.h, KEY = "da.bulk.v1";
  const listeners = new Set();
  let batch = null, selection = null, starting = false, controller = null;
  let panel = null, panelKind = "", restored = false, hideTimer = null, collapseTimer = null;
  let selectionError = "", version = null;

  const terminal = (job) => job && ["done", "failed"].includes(job.status);
  const busy = () => starting || !!batch && !batch.unavailable && !terminal(batch);
  const plural = (n) => DA.fmt.plural(n, ["обращение", "обращения", "обращений"]);
  const errorText = (error) => error?.message || "Не удалось получить результат. Попробуйте ещё раз";
  const elapsedText = (seconds) => {
    const s = Math.max(0, Math.round(seconds || 0)), m = Math.floor(s / 60);
    return m ? `${m} мин${s % 60 ? ` ${s % 60} с` : ""}` : `${s} с`;
  };
  function save() {
    try {
      if (!batch) sessionStorage.removeItem(KEY);
      else {
        const stored = { ...batch, mode: DA.mode, items: batch.items.map(({ evaluation, ...item }) => item) };
        sessionStorage.setItem(KEY, JSON.stringify(stored));
      }
    } catch (e) { /* Оценка продолжается и без хранилища браузера. */ }
  }
  function publish() {
    save();
    render();
    listeners.forEach((fn) => fn(batch));
  }
  function timersOff() { clearTimeout(hideTimer); clearTimeout(collapseTimer); }
  function hideNotice() {
    if (!batch) return;
    const hadFocus = panel?.contains(document.activeElement);
    timersOff();
    batch.hidden = true;
    publish();
    if (hadFocus) document.querySelector("#da-main h1")?.focus({ preventScroll: true });
  }
  const dismissButton = () => h("button", { class: "bulk-dismiss", type: "button", "aria-label": "Скрыть уведомление об оценке", title: "Скрыть уведомление об оценке", onclick: hideNotice }, DA.icon("x", 18));
  function finishLater() {
    timersOff();
    if (batch?.hidden) return;
    collapseTimer = setTimeout(() => {
      if (!terminal(batch)) return;
      batch.collapsed = true;
      publish();
      if (!batch.failed) hideTimer = setTimeout(() => { if (terminal(batch)) { batch.hidden = true; publish(); } }, 3000);
    }, 6000);
  }
  function receive(job) {
    if (!batch || batch.jobId !== job.id) return;
    const wasDone = terminal(batch);
    Object.assign(batch, job, { jobId: job.id, error: null, unavailable: false });
    publish();
    if (!wasDone && terminal(batch)) finishLater();
  }
  async function watch() {
    if (!batch?.jobId) return;
    controller?.abort();
    const own = new AbortController(), id = batch.jobId;
    controller = own;
    batch.error = null;
    publish();
    try {
      const job = await DA.data.watchJob(id, { signal: own.signal, onProgress: receive });
      if (!own.signal.aborted) receive(job);
    } catch (error) {
      if (own.signal.aborted || batch?.jobId !== id) return;
      batch.error = errorText(error);
      if (error.code === "not_found" || error.status === 404) batch.unavailable = true;
      publish();
    }
  }

  /* Версия выбирается до запуска; в работе её уже нельзя изменить. */
  function versionPicker() {
    const target = DA.checklist(version) || DA.activeChecklist();
    version = target.version;
    const label = h("span", {}, `Версия ${version}`);
    const button = h("button", { class: "da-btn bulk-version", type: "button", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": "Версия чек-листа" }, label, DA.icon("chevron", 14));
    const choices = h("div", { class: "bulk-versions", role: "listbox", "aria-label": "Версия чек-листа", hidden: true });
    const wrap = h("div", { class: "bulk-picker" }, button, choices);
    const close = () => { choices.hidden = true; button.setAttribute("aria-expanded", "false"); };
    const options = [...DA.state.checklists].sort((a, b) => b.version - a.version);
    options.forEach((cl) => choices.append(h("button", {
      class: "bulk-version-option", type: "button", role: "option", "aria-selected": String(cl.version === version),
      onclick: () => { version = cl.version; close(); render(); panel?.querySelector(".bulk-version")?.focus(); }
    }, `Версия ${cl.version}`, cl.isActive ? h("span", {}, "Активная") : null)));
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
      h("b", { class: "bulk-selected-count" }, `Выбрано ${n}`),
      h("div", { class: "bulk-version-field" }, h("span", {}, "По чек-листу"), versionPicker()),
      h("button", { class: "da-btn is-primary bulk-start" + (starting ? " is-busy" : ""), type: "button", disabled: starting, onclick: async () => {
        try { await start(ids, { checklistVersion: version, reuse: false, source: "registry" }); }
        catch (error) { selectionError = errorText(error); render(); }
      } }, starting ? "Запускаем оценку" : `Оценить ${n} ${plural(n)}`),
      h("button", { class: "da-btn is-text bulk-clear", type: "button", disabled: starting, onclick: () => selection?.onClear?.() }, "Снять выбор"));
    if (repeated) content.append(h("p", { class: "bulk-repeat" }, `${repeated} уже ${repeated === 1 ? "оценено" : "оценены"} по этой версии, их переоценим`));
    if (selectionError) content.append(h("p", { class: "bulk-error", role: "alert" }, selectionError));
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
    try { await start(failed, { ...old.meta, checklistVersion: old.checklistVersion, reuse: true, retryOf: old.jobId }); }
    catch (error) { if (batch === old) { old.error = errorText(error); old.collapsed = false; publish(); } }
  }
  function progressBar() {
    const done = batch.done + batch.failed;
    const bar = h("div", { class: "bulk-meter" + (batch.total > 100 ? " is-continuous" : ""), role: "progressbar", "aria-label": "Завершено обращений", "aria-valuemin": 0, "aria-valuemax": batch.total, "aria-valuenow": done });
    if (batch.total > 100) {
      bar.append(h("i", { style: { transform: `scaleX(${batch.total ? done / batch.total : 0})` } }));
    } else batch.items.forEach((item) => {
      const tone = item.status === "failed" ? "failed" : item.status === "done" ? item.total >= 85 ? "yes" : item.total >= 50 ? "partial" : "no" : item.status;
      const label = `№ ${DA.convNumber(item.conversationId)}: ${item.status === "done" ? DA.fmt.score(item.total) : item.status === "failed" ? "не удалось оценить" : item.status === "running" ? "оценивается" : "в очереди"}`;
      bar.append(h("i", { class: `is-${tone}`, title: label }, item.status === "failed" ? DA.icon("x", 10) : null));
    });
    return bar;
  }
  function pill() {
    const done = batch.done + batch.failed, finished = terminal(batch), value = batch.total ? done / batch.total : 0;
    const ring = h("span", { class: "bulk-ring", "aria-hidden": "true" });
    ring.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle class="bulk-ring-value" cx="12" cy="12" r="9"/></svg>';
    ring.querySelector(".bulk-ring-value").style.strokeDasharray = `${value * 56.55} 56.55`;
    return h("div", { class: "bulk-pill-wrap" },
      h("button", { class: "bulk-pill", type: "button", onclick: () => { timersOff(); batch.collapsed = false; publish(); } },
        finished && !batch.failed ? DA.icon("check", 18) : ring,
        h("span", {}, batch.error ? "Проверить оценку" : finished ? batch.failed ? `Не удалось оценить ${batch.failed}` : "Готово" : `Оценка ${done} из ${batch.total}`)),
      dismissButton());
  }
  function progressPanel() {
    const finished = terminal(batch), settled = batch.done + batch.failed;
    const title = h("b", { class: "bulk-progress-title", "aria-live": "polite" }, finished
      ? `Готово: оценено ${batch.done} ${plural(batch.done)} за ${elapsedText(batch.durationSec)}`
      : `Оцениваем обращения: ${settled} из ${batch.total}`);
    const head = h("div", { class: "bulk-progress-head" }, title,
      h("div", { class: "bulk-progress-actions" },
        h("button", { class: "da-btn is-text is-sm", type: "button", onclick: () => { timersOff(); batch.collapsed = true; publish(); } }, "Свернуть"),
        dismissButton()));
    const foot = h("div", { class: "bulk-progress-foot" });
    if (batch.failed) foot.append(h("button", { class: "da-btn is-text is-sm bulk-failures", type: "button", onclick: showFailures }, `Не удалось оценить ${batch.failed}. Показать`));
    if (finished && batch.failed) foot.append(h("button", { class: "da-btn is-sm", type: "button", disabled: starting, onclick: retryFailed }, starting ? "Запускаем" : "Повторить их"));
    if (!finished && batch.done >= 3 && !batch.error) {
      const seconds = (batch.durationSec / batch.done) * (batch.total - settled);
      if (seconds > 0) foot.append(h("span", { class: "bulk-estimate" }, `Осталось около ${seconds >= 60 ? Math.max(1, Math.round(seconds / 60)) + " мин" : Math.max(1, Math.round(seconds)) + " с"}`));
    }
    const content = h("div", { class: "bulk-progress-content" }, head, progressBar(), foot);
    if (batch.error) content.append(h("div", { class: "bulk-error", role: "alert" }, h("span", {}, batch.error),
      h("button", { class: "da-btn is-sm", type: "button", onclick: () => {
        if (batch.unavailable) hideNotice();
        else watch();
      } }, batch.unavailable ? "Закрыть" : "Проверить снова")));
    return content;
  }
  function render() {
    const showSelection = selection?.ids.length && (!busy() || starting);
    const kind = showSelection ? "selection" : batch && !batch.hidden ? batch.collapsed ? "pill" : "progress" : "";
    if (!kind) { panel?.remove(); panel = null; panelKind = ""; document.body.classList.remove("has-bulk-panel"); return; }
    if (!panel) { panel = h("section", { class: "bulk-panel", "aria-label": "Пакетная оценка" }); document.body.append(panel); }
    const focused = panel.contains(document.activeElement) ? document.activeElement.className : null;
    panel.className = "bulk-panel" + (kind === "pill" ? " is-pill" : "");
    if (kind !== panelKind) {
      panel.classList.add(panelKind ? "is-changing" : "is-entering");
      panelKind = kind;
    }
    panel.replaceChildren(kind === "selection" ? selectionPanel() : kind === "pill" ? pill() : progressPanel());
    document.body.classList.toggle("has-bulk-panel", kind !== "pill");
    if (focused) [...panel.querySelectorAll("button")].find((button) => button.className === focused)?.focus({ preventScroll: true });
  }

  async function start(ids, options) {
    if (busy()) throw new DA.ApiError("batch_running", "Дождитесь завершения текущей оценки", 409);
    const unique = [...new Set(ids)], opts = { ...options };
    if (!unique.length) throw new DA.ApiError("no_conversations", "Выберите обращения для оценки", 400);
    starting = true;
    selectionError = "";
    render();
    try {
      const result = await DA.data.startBatch(unique, opts);
      timersOff();
      controller?.abort();
      const meta = { ...opts };
      delete meta.signal;
      batch = { ...meta, meta, ids: unique, evaluationIds: result.evaluationIds, jobId: result.jobId, startedAt: new Date().toISOString(),
        finishedAt: null, durationSec: 0, status: "running", total: unique.length, done: 0, failed: 0,
        items: unique.map((cid) => ({ conversationId: cid, evaluationId: result.evaluationIds[cid], status: "queued", total: null })),
        ...result.job, jobId: result.jobId, collapsed: false, hidden: false, error: null };
      starting = false;
      const clear = selection?.onClear;
      selection = null;
      clear?.();
      publish();
      if (terminal(batch)) finishLater();
      else watch();
      return batch;
    } catch (error) { starting = false; render(); throw error; }
  }
  async function restore() {
    if (restored) return;
    restored = true;
    let stored;
    try { stored = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return; }
    if (!stored || stored.mode !== DA.mode || typeof stored.jobId !== "string" || !Array.isArray(stored.ids) || !Array.isArray(stored.items)) return;
    batch = stored;
    publish();
    if (!terminal(batch) || !batch.hidden) watch();
  }
  DA.bulk = {
    start, restore, current: () => batch, isBusy: busy,
    subscribe(fn) { listeners.add(fn); fn(batch); return () => listeners.delete(fn); },
    setSelection(ids, onClear) {
      selection = ids.length ? { ids: [...ids], onClear } : null;
      if (version == null) version = DA.activeChecklist()?.version;
      selectionError = "";
      render();
    },
    clearSelection() { selection = null; selectionError = ""; render(); }
  };
})();
