/* Резюме, перевод и советы относятся к открытому транскрипту и конкретной оценке. */
(function () {
  const DA = window.DA, h = DA.h;
  const sourceKey = (conv) => conv && `${conv.language}:${conv.transcriptHash || DA.transcriptKey(conv.transcript || [])}`;
  const evaluationKey = (ev) => ev ? JSON.stringify([ev.id, ev.status, !!ev.stale, ev.checklistVersion, ev.transcriptHash, ev.items]) : null;
  const emptyController = () => ({ summary: null, translationControl: null, coaching: null,
    attachTranscript() {}, updateEvaluation() {}, dispose() {} });

  DA.cardAI = function create(options) {
    const conv = options.conversation;
    // Эти маршруты работают с текущим диалогом, а не с сохранённым снимком оценки.
    if (DA.mode !== "server" || options.historyView || !conv) return emptyController();
    const cid = conv.conversation_id, originalKey = sourceKey(conv);
    const controller = new AbortController();
    let disposed = false, summaryData = null, collapsed = false;
    let summaryRequest = 0, summaryPending = false;
    let translationData = null, translationPending = false, translationError = false;
    let translated = false, transcriptSource = "crm", turnNodes = [], translatedNodes = [];
    let coachingRequest = null, coachingKey = null, activeEvaluation = null;
    const summary = h("section", { class: "cai-summary", "aria-label": "Резюме диалога" });
    const translationControl = h("div", { class: "cai-translation-control", hidden: !["KZ", "EN"].includes(conv.language) });
    const translationStatus = h("div", { class: "cai-translation-status", hidden: true, "aria-live": "polite" });
    const coaching = h("section", { class: "cai-coaching", "aria-label": "Советы оператору", hidden: true });
    try { collapsed = localStorage.getItem("da.summary.collapsed") === "true"; } catch (_) { /* Настройка необязательна. */ }
    const validSource = () => !disposed && !controller.signal.aborted && sourceKey(DA.state.conversations[cid]) === originalKey;
    const validEvaluation = (key) => validSource() && key === coachingKey && evaluationKey(DA.state.evaluations[cid]) === key;
    function layoutChanged() { requestAnimationFrame(() => { if (!disposed) options.onTranscriptChange?.(); }); }
    function abortError(error) { return disposed || controller.signal.aborted || error?.name === "AbortError"; }
    function retryButton(callback) { return h("button", { class: "da-btn is-text is-sm", type: "button", onclick: callback }, DA.icon("refresh", 14), "Повторить"); }

    function renderSummary() {
      summary.removeAttribute("aria-busy");
      summary.classList.toggle("is-collapsed", collapsed);
      const fields = [["О чём", summaryData.topic], ["Запрос", summaryData.request], ["Итог", summaryData.outcome]];
      const list = h("dl", { class: "cai-summary-lines" }, fields.slice(0, collapsed ? 1 : 3).map(([label, text]) => [h("dt", {}, label), h("dd", {}, text)]));
      const toggle = h("button", { class: "cai-summary-toggle", type: "button", "aria-expanded": String(!collapsed),
        "aria-label": collapsed ? "Развернуть резюме" : "Свернуть резюме", onclick: () => {
          collapsed = !collapsed;
          try { localStorage.setItem("da.summary.collapsed", String(collapsed)); } catch (_) { /* Открытое состояние остаётся доступным. */ }
          renderSummary(); summary.querySelector("button").focus({ preventScroll: true }); layoutChanged();
        } }, DA.icon("chevron", 16));
      summary.replaceChildren(list, toggle);
      if (!collapsed && summaryData.operatorName) summary.append(h("p", { class: "cai-operator" }, `Оператор: ${summaryData.operatorName}`));
      layoutChanged();
    }
    async function loadSummary(refresh) {
      if (summaryPending || !validSource()) return;
      const request = ++summaryRequest;
      summaryPending = true;
      summary.classList.remove("is-collapsed");
      summary.setAttribute("aria-busy", "true");
      summary.replaceChildren(h("span", { class: "da-sr", role: "status" }, "Составляем резюме"),
        h("dl", { class: "cai-summary-lines", "aria-hidden": "true" }, ["О чём", "Запрос", "Итог"].map((label, index) => [
          h("dt", {}, label), h("dd", {}, h("span", { class: "da-skel", style: { width: ["92%", "78%", "86%"][index] } }))])));
      try {
        const data = await DA.api.getSummary(cid, { signal: controller.signal, refresh: !!refresh });
        if (request !== summaryRequest || !validSource()) return;
        if (!["topic", "request", "outcome"].every((field) => typeof data[field] === "string")) throw new Error("invalid_summary");
        summaryData = data;
        renderSummary();
      } catch (error) {
        if (abortError(error) || request !== summaryRequest || !validSource()) return;
        summary.removeAttribute("aria-busy");
        summary.replaceChildren(h("div", { class: "cai-error", role: "status" }, h("span", {}, "Резюме не получилось"), retryButton(() => loadSummary(true))));
      } finally { if (request === summaryRequest) summaryPending = false; }
    }

    function clearTranslations() {
      translatedNodes.forEach((node) => node.remove());
      translatedNodes = [];
    }
    function renderTranslations(animate) {
      clearTranslations();
      if (!translated || !translationData || transcriptSource !== "crm" || !validSource()) { layoutChanged(); return; }
      const byIndex = new Map(translationData.map((turn) => [turn.idx, turn.text]));
      let shown = 0;
      (conv.transcript || []).forEach((turn, index) => {
        const text = byIndex.get(turn.idx ?? index), bubble = turnNodes[index]?.querySelector(".da-bubble");
        if (!bubble || !text || text.trim() === turn.text.trim()) return;
        const node = h("p", { class: "cai-turn-translation" + (animate ? " is-entering" : ""), lang: "ru", "aria-label": "Перевод на русский",
          style: animate ? { animationDelay: `${shown++ * 30}ms` } : null }, text);
        const expand = bubble.nextElementSibling?.matches(".da-more") ? bubble.nextElementSibling : bubble;
        expand.after(node); translatedNodes.push(node);
      });
      layoutChanged();
    }
    function renderTranslationStatus() {
      translationStatus.replaceChildren();
      translationStatus.hidden = !translated || !(translationPending || translationError || translationData?.length === 0);
      if (translationPending) translationStatus.append(h("span", { class: "da-thinking" }, "Готовим перевод"));
      else if (translationError) translationStatus.append(h("span", {}, "Перевод не получился"), retryButton(() => loadTranslation(true)));
      else if (translationData?.length === 0) translationStatus.append(h("span", {}, "Для этого диалога нет перевода"));
    }
    async function loadTranslation(refresh) {
      if (translationPending || !validSource()) return;
      translationPending = true; translationError = false; renderTranslationStatus();
      try {
        const result = await DA.api.getTranslation(cid, { signal: controller.signal, refresh: !!refresh });
        if (!validSource()) return;
        if (!Array.isArray(result.turns) || result.turns.some((turn) => !Number.isInteger(turn.idx) || typeof turn.text !== "string")) throw new Error("invalid_translation");
        translationData = result.turns;
        renderTranslations(true);
      } catch (error) {
        if (abortError(error) || !validSource()) return;
        translationError = true;
      } finally { translationPending = false; if (!disposed) renderTranslationStatus(); }
    }
    const translationSwitch = DA.segmented([{ value: false, label: "Оригинал" }, { value: true, label: "Перевод на русский" }], false, (value) => {
      translated = value;
      if (translated && translationData == null && !translationError) loadTranslation(false);
      else renderTranslations(false);
      renderTranslationStatus();
    }, "Язык диалога");
    translationControl.append(translationSwitch, translationStatus);
    function attachTranscript(next) {
      clearTranslations();
      turnNodes = next.turnNodes || [];
      transcriptSource = next.source || "crm";
      translationControl.hidden = !["KZ", "EN"].includes(conv.language) || transcriptSource !== "crm";
      renderTranslations(false); renderTranslationStatus();
    }

    async function copyExample(text, button) {
      button.disabled = true;
      try {
        if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
        await navigator.clipboard.writeText(text);
        if (!disposed && button.isConnected) DA.toast("Скопировано", button);
      } catch (_) {
        if (!disposed && button.isConnected) DA.toast("Не удалось скопировать. Выделите фразу и скопируйте её", button);
      } finally { button.disabled = false; }
    }
    function renderCoaching(tips, evaluation) {
      coaching.replaceChildren();
      coaching.hidden = !tips.length;
      if (!tips.length) return;
      const checklist = DA.checklist(evaluation.checklistVersion);
      coaching.append(h("h3", {}, "Что оператору сказать иначе"), h("div", { class: "cai-tips" }, tips.map((tip) => {
        const criterion = checklist?.criteria.find((item) => item.id === tip.criterionId);
        const copy = h("button", { class: "cai-copy", type: "button", "aria-label": "Скопировать пример фразы", title: "Скопировать пример фразы", onclick: () => copyExample(tip.example, copy) }, DA.icon("copy", 16));
        return h("article", { class: "cai-tip" }, h("p", { class: "cai-tip-criterion" }, criterion?.title || "Критерий"),
          h("p", { class: "cai-tip-text" }, tip.tip), tip.example ? h("div", { class: "cai-example" }, h("p", {}, tip.example), copy) : null);
      })));
    }
    async function loadCoaching(evaluation, key, refresh) {
      coachingRequest?.abort();
      const request = new AbortController(); coachingRequest = request;
      const abort = () => request.abort();
      controller.signal.addEventListener("abort", abort, { once: true });
      coaching.hidden = true; coaching.replaceChildren();
      try {
        const result = await DA.api.getCoaching(evaluation.id, { signal: request.signal, refresh: !!refresh });
        if (request.signal.aborted || !validEvaluation(key)) return;
        if (!Array.isArray(result.tips) || result.tips.some((tip) => typeof tip.tip !== "string" || typeof tip.example !== "string")) throw new Error("invalid_coaching");
        renderCoaching(result.tips, evaluation);
      } catch (error) {
        if (abortError(error) || request.signal.aborted || !validEvaluation(key)) return;
        coaching.hidden = false;
        coaching.replaceChildren(h("div", { class: "cai-error", role: "status" }, h("span", {}, "Советы не получились"), retryButton(() => loadCoaching(activeEvaluation, key, true))));
      } finally { controller.signal.removeEventListener("abort", abort); }
    }
    function updateEvaluation(evaluation) {
      const nextKey = evaluationKey(evaluation);
      if (coachingKey === nextKey) return;
      coachingRequest?.abort();
      coachingKey = nextKey; activeEvaluation = evaluation;
      coaching.hidden = true; coaching.replaceChildren();
      if (!evaluation || evaluation.status !== "done" || evaluation.stale || !validSource()) return;
      if (evaluation.transcriptHash && conv.transcriptHash && evaluation.transcriptHash !== conv.transcriptHash) return;
      loadCoaching(evaluation, nextKey, false);
    }
    function invalidateChangedSource() {
      if (!validSource()) { summary.hidden = true; translationControl.hidden = true; clearTranslations(); }
      if (coachingKey && !validEvaluation(coachingKey)) { coachingRequest?.abort(); coaching.hidden = true; coaching.replaceChildren(); }
    }
    function dispose() {
      if (disposed) return;
      disposed = true; controller.abort(); coachingRequest?.abort(); clearTranslations();
      options.signal?.removeEventListener("abort", dispose);
      window.removeEventListener("da:evaluations-changed", invalidateChangedSource);
      window.removeEventListener("da:appeals-changed", invalidateChangedSource);
    }
    options.signal?.addEventListener("abort", dispose, { once: true });
    window.addEventListener("da:evaluations-changed", invalidateChangedSource);
    window.addEventListener("da:appeals-changed", invalidateChangedSource);
    if (options.signal?.aborted) dispose();
    else { loadSummary(false); updateEvaluation(options.evaluation); }
    return { summary, translationControl, coaching, attachTranscript, updateEvaluation, dispose };
  };
})();
