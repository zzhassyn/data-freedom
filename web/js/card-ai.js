/* Резюме, перевод и советы относятся к открытому транскрипту и конкретной оценке. */
(function () {
  const DA = window.DA, h = DA.h;
  const messages = {
    "cai.summary": { ru: "Резюме диалога", kk: "Диалогтың қысқаша мазмұны", en: "Conversation summary" },
    "cai.topic": { ru: "О чём", kk: "Тақырып", en: "Topic" },
    "cai.request": { ru: "Запрос", kk: "Сұрау", en: "Request" },
    "cai.outcome": { ru: "Итог", kk: "Нәтиже", en: "Outcome" },
    "cai.operator": { ru: "Оператор: {name}", kk: "Оператор: {name}", en: "Operator: {name}" },
    "cai.summaryExpand": { ru: "Развернуть резюме", kk: "Қысқаша мазмұнды ашу", en: "Expand summary" },
    "cai.summaryCollapse": { ru: "Свернуть резюме", kk: "Қысқаша мазмұнды жию", en: "Collapse summary" },
    "cai.summaryLoading": { ru: "Составляем резюме", kk: "Қысқаша мазмұн дайындалуда", en: "Preparing summary" },
    "cai.summaryError": { ru: "Резюме не получилось", kk: "Қысқаша мазмұнды жасау мүмкін болмады", en: "Could not prepare the summary" },
    "cai.retry": { ru: "Повторить", kk: "Қайталау", en: "Try again" },
    "cai.original": { ru: "Оригинал", kk: "Түпнұсқа", en: "Original" },
    "cai.translation": { ru: "Перевод на русский", kk: "Қазақша аударма", en: "English translation" },
    "cai.dialogueLanguage": { ru: "Язык диалога", kk: "Диалог тілі", en: "Conversation language" },
    "cai.translationLoading": { ru: "Готовим перевод", kk: "Аударма дайындалуда", en: "Preparing translation" },
    "cai.translationError": { ru: "Перевод не получился", kk: "Аудару мүмкін болмады", en: "Could not translate the conversation" },
    "cai.translationEmpty": { ru: "Для этого диалога нет перевода", kk: "Бұл диалогтың аудармасы жоқ", en: "No translation is available for this conversation" },
    "cai.coaching": { ru: "Советы оператору", kk: "Операторға арналған кеңестер", en: "Operator coaching" },
    "cai.coachingTitle": { ru: "Что оператору сказать иначе", kk: "Операторға арналған кеңестер", en: "What the operator could say differently" },
    "cai.coachingError": { ru: "Советы не получились", kk: "Кеңестерді дайындау мүмкін болмады", en: "Could not prepare coaching" },
    "cai.criterion": { ru: "Критерий", kk: "Критерий", en: "Criterion" },
    "cai.copy": { ru: "Скопировать пример фразы", kk: "Мысал сөзді көшіру", en: "Copy example phrase" },
    "cai.copied": { ru: "Скопировано", kk: "Көшірілді", en: "Copied" },
    "cai.copyError": { ru: "Не удалось скопировать. Выделите фразу и скопируйте её", kk: "Көшіру мүмкін болмады. Мәтінді белгілеп, көшіріңіз", en: "Could not copy. Select the phrase and copy it" }
  };
  DA.i18n?.addMessages(messages);
  const fallback = (key, params) => messages[`cai.${key}`].ru.replace(/\{(\w+)\}/g, (_, name) => params?.[name] ?? "");
  const msg = (key, params) => DA.msg ? DA.msg(`cai.${key}`, params) : fallback(key, params);
  const text = (key, params) => DA.t ? DA.t(`cai.${key}`, params) : fallback(key, params);
  const uiLanguage = () => DA.i18n?.languageCode() || "RU";
  const languageTag = (language) => ({ RU: "ru", KZ: "kk", EN: "en" })[language];
  const sourceKey = (conv) => conv && `${conv.language}:${conv.transcriptHash || DA.transcriptKey(conv.transcript || [])}`;
  const evaluationKey = (ev) => ev ? JSON.stringify([ev.id, ev.status, !!ev.stale, ev.checklistVersion, ev.transcriptHash, ev.items]) : null;
  const emptyController = () => ({ summary: null, translationControl: null, coaching: null,
    attachTranscript() {}, updateEvaluation() {}, dispose() {} });

  DA.cardAI = function create(options) {
    const conv = options.conversation;
    if (!conv) return emptyController();
    const cid = conv.conversation_id, originalKey = sourceKey(conv);
    const controller = new AbortController();
    let disposed = false, summaryData = null, collapsed = false;
    let summaryRequest = 0, summaryPending = false;
    const translations = new Map();
    let targetLanguage = uiLanguage();
    let translated = false, transcriptSource = "crm", turnNodes = [], translatedNodes = [];
    let displayedTurns = conv.transcript || [], displayedSourceHash = conv.transcriptHash || null;
    let displayedOriginHash = conv.transcriptHash || null;
    let coachingRequest = null, coachingKey = null, activeEvaluation = null;
    const summary = h("section", { class: "cai-summary", "aria-label": msg("summary"), hidden: true });
    const translationControl = h("div", { class: "cai-translation-control", hidden: true });
    const translationStatus = h("div", { class: "cai-translation-status", hidden: true, "aria-live": "polite" });
    const coaching = h("section", { class: "cai-coaching", "aria-label": msg("coaching"), hidden: true });
    try { collapsed = localStorage.getItem("da.summary.collapsed") === "true"; } catch (_) { /* Настройка необязательна. */ }
    const validSource = () => !disposed && !controller.signal.aborted && sourceKey(DA.state.conversations[cid]) === originalKey;
    function selectedEvaluation() {
      const id = activeEvaluation?.id;
      if (!id) return null;
      const selected = DA.data?.cardContext?.(cid, id)?.ev;
      if (selected?.id === id) return selected;
      const saved = DA.state.evaluationHistory?.[id];
      if (saved?.id === id) return saved;
      const latest = DA.state.evaluations[cid];
      return latest?.id === id ? latest : null;
    }
    const validEvaluation = (key) => validSource() && key === coachingKey
      && evaluationKey(activeEvaluation) === key && evaluationKey(selectedEvaluation()) === key;
    const validDisplayedSource = () => validSource()
      && (!displayedOriginHash || !conv.transcriptHash || displayedOriginHash === conv.transcriptHash)
      && (transcriptSource !== "stt" || !!displayedSourceHash);
    function translationContext() {
      const source = transcriptSource === "stt" ? "transcription" : "canonical";
      return { source, sourceHash: displayedSourceHash, target: targetLanguage, turns: displayedTurns,
        key: JSON.stringify([source, displayedSourceHash || DA.transcriptKey(displayedTurns), targetLanguage]) };
    }
    function layoutChanged() { requestAnimationFrame(() => { if (!disposed) options.onTranscriptChange?.(); }); }
    function abortError(error) { return disposed || controller.signal.aborted || error?.name === "AbortError"; }
    function retryButton(callback) { return h("button", { class: "da-btn is-text is-sm", type: "button", onclick: callback }, DA.icon("refresh", 14), msg("retry")); }

    function renderSummary() {
      if (summaryPending) summary.setAttribute("aria-busy", "true");
      else summary.removeAttribute("aria-busy");
      summary.classList.toggle("is-collapsed", collapsed);
      const fields = [["topic", summaryData.topic], ["request", summaryData.request], ["outcome", summaryData.outcome]];
      const list = h("dl", { class: "cai-summary-lines" }, fields.slice(0, collapsed ? 1 : 3).map(([label, value]) => [h("dt", {}, msg(label)), h("dd", { "data-summary-field": label }, value || "")]));
      const toggle = h("button", { class: "cai-summary-toggle", type: "button", "aria-expanded": String(!collapsed),
        "aria-label": msg(collapsed ? "summaryExpand" : "summaryCollapse"), onclick: () => {
          collapsed = !collapsed;
          try { localStorage.setItem("da.summary.collapsed", String(collapsed)); } catch (_) { /* Открытое состояние остаётся доступным. */ }
          renderSummary(); summary.querySelector("button").focus({ preventScroll: true }); layoutChanged();
        } }, DA.icon("chevron", 16));
      summary.replaceChildren(list, toggle);
      if (!collapsed && summaryData.operatorName) summary.append(h("p", { class: "cai-operator" }, msg("operator", { name: summaryData.operatorName })));
      layoutChanged();
    }
    async function loadSummary(refresh) {
      if (summaryPending || !validSource()) return;
      const request = ++summaryRequest;
      summaryPending = true;
      summaryData = null;
      summary.hidden = false;
      summary.classList.remove("is-collapsed");
      summary.setAttribute("aria-busy", "true");
      summary.replaceChildren(h("span", { class: "da-sr", role: "status" }, msg("summaryLoading")),
        h("dl", { class: "cai-summary-lines", "aria-hidden": "true" }, ["topic", "request", "outcome"].map((label, index) => [
          h("dt", {}, msg(label)), h("dd", {}, h("span", { class: "da-skel", style: { width: ["92%", "78%", "86%"][index] } }))])));
      try {
        const data = await DA.api.getSummary(cid, { signal: controller.signal, refresh: !!refresh, onProgress: (event) => {
          if (event.type !== "partial" || request !== summaryRequest || !validSource() || !event.value) return;
          const partial = {};
          ["topic", "request", "outcome"].forEach((field) => {
            if (typeof event.value[field] === "string") partial[field] = event.value[field];
          });
          if (!Object.keys(partial).length) return;
          if (!summaryData) { summaryData = { topic: "", request: "", outcome: "", operatorName: null }; renderSummary(); }
          Object.assign(summaryData, partial);
          summary.querySelectorAll("[data-summary-field]").forEach((node) => {
            node.textContent = summaryData[node.dataset.summaryField];
          });
          layoutChanged();
        } });
        if (request !== summaryRequest || !validSource()) return;
        if (!["topic", "request", "outcome"].every((field) => typeof data[field] === "string")) throw new Error("invalid_summary");
        summaryData = data;
        summaryPending = false;
        renderSummary();
      } catch (error) {
        if (abortError(error) || request !== summaryRequest || !validSource()) return;
        summary.removeAttribute("aria-busy");
        summary.replaceChildren(h("div", { class: "cai-error", role: "status" }, h("span", {}, msg("summaryError")), retryButton(() => loadSummary(true))));
      } finally { if (request === summaryRequest) summaryPending = false; }
    }

    function clearTranslations() {
      translatedNodes.forEach((node) => node.remove());
      translatedNodes = [];
    }
    function renderTranslations(animate) {
      clearTranslations();
      const translationData = translations.get(translationContext().key)?.data;
      if (!translated || !translationData || conv.language === targetLanguage || !validDisplayedSource()) { layoutChanged(); return; }
      const byIndex = new Map(translationData.map((turn) => [turn.idx, turn.text]));
      let shown = 0;
      displayedTurns.forEach((turn, index) => {
        const text = byIndex.get(turn.idx ?? index), bubble = turnNodes[index]?.querySelector(".da-bubble");
        if (!bubble || !text || text.trim() === turn.text.trim()) return;
        const node = h("p", { class: "cai-turn-translation" + (animate ? " is-entering" : ""), lang: languageTag(targetLanguage), "aria-label": msg("translation"),
          style: animate ? { animationDelay: `${shown++ * 30}ms` } : null }, text);
        const expand = bubble.nextElementSibling?.matches(".da-more") ? bubble.nextElementSibling : bubble;
        expand.after(node); translatedNodes.push(node);
      });
      layoutChanged();
    }
    function renderTranslationStatus() {
      translationStatus.replaceChildren();
      const entry = translations.get(translationContext().key);
      translationStatus.hidden = !translated || !(entry?.pending || entry?.error || entry?.data?.length === 0);
      if (entry?.pending) translationStatus.append(h("span", { class: "da-thinking" }, msg("translationLoading")));
      else if (entry?.error) translationStatus.append(h("span", {}, msg("translationError")), retryButton(() => loadTranslation(true)));
      else if (entry?.data?.length === 0) translationStatus.append(h("span", {}, msg("translationEmpty")));
    }
    function validTranslation(result, request) {
      if (result.targetLanguage !== request.target || result.source !== request.source || typeof result.sourceHash !== "string" || !result.sourceHash) return false;
      if (request.sourceHash && result.sourceHash !== request.sourceHash) return false;
      if (!Array.isArray(result.turns) || result.turns.length !== request.turns.length) return false;
      const ids = new Set(request.turns.map((turn, index) => turn.idx ?? index));
      for (const turn of result.turns) {
        if (!Number.isInteger(turn.idx) || typeof turn.text !== "string" || !ids.delete(turn.idx)) return false;
      }
      return ids.size === 0;
    }
    function loadTranslation(refresh) {
      const request = translationContext(), existing = translations.get(request.key);
      if (request.target === conv.language || !validDisplayedSource()) return;
      if (existing?.pending) return existing.promise;
      if (!refresh && (existing?.data || existing?.error)) return;
      const entry = { data: null, pending: true, error: false, promise: null };
      translations.set(request.key, entry);
      renderTranslationStatus();
      entry.promise = (async () => {
        try {
          const result = await DA.api.getTranslation(cid, { targetLanguage: request.target, source: request.source,
            sourceHash: request.sourceHash, signal: controller.signal, refresh: !!refresh });
          if (!validSource()) return;
          if (!validTranslation(result, request)) throw new Error("invalid_translation");
          entry.data = result.turns;
          if (request.key === translationContext().key) renderTranslations(true);
        } catch (error) {
          if (abortError(error) || !validSource()) return;
          entry.error = true;
        } finally {
          entry.pending = false;
          if (!disposed && request.key === translationContext().key) renderTranslationStatus();
        }
      })();
      return entry.promise;
    }
    function updateTranslationView() {
      translationControl.hidden = conv.language === targetLanguage || !validDisplayedSource();
      translationControl.dataset.targetLanguage = targetLanguage;
      renderTranslations(false); renderTranslationStatus();
      if (translated && !translationControl.hidden) loadTranslation(false);
      requestAnimationFrame(() => { if (!disposed) translationSwitch.setValue(translated); });
    }
    const translationSwitch = DA.segmented([{ value: false, label: msg("original") }, { value: true, label: msg("translation") }], false, (value) => {
      translated = value;
      updateTranslationView();
    }, msg("dialogueLanguage"));
    translationControl.append(translationSwitch, translationStatus);
    function attachTranscript(next) {
      clearTranslations();
      turnNodes = next.turnNodes || [];
      transcriptSource = next.source || "crm";
      displayedTurns = next.turns || (transcriptSource === "crm" ? conv.transcript || [] : []);
      displayedOriginHash = next.transcriptHash || conv.transcriptHash || null;
      displayedSourceHash = next.sourceHash || (transcriptSource === "crm" ? displayedOriginHash : null);
      updateTranslationView();
    }
    function localeChanged() {
      targetLanguage = uiLanguage();
      updateTranslationView();
    }

    async function copyExample(phrase, button) {
      button.disabled = true;
      try {
        if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
        await navigator.clipboard.writeText(phrase);
        if (!disposed && button.isConnected) DA.toast(text("copied"), button);
      } catch (_) {
        if (!disposed && button.isConnected) DA.toast(text("copyError"), button);
      } finally { button.disabled = false; }
    }
    function renderCoaching(tips, evaluation) {
      coaching.replaceChildren();
      coaching.hidden = !tips.length;
      if (!tips.length) return;
      const checklist = DA.checklist(evaluation.checklistVersion);
      coaching.append(h("h3", {}, msg("coachingTitle")), h("div", { class: "cai-tips" }, tips.map((tip) => {
        const criterion = checklist?.criteria.find((item) => item.id === tip.criterionId);
        const copy = h("button", { class: "cai-copy", type: "button", "aria-label": msg("copy"), title: msg("copy"), onclick: () => copyExample(tip.example, copy) }, DA.icon("copy", 16));
        return h("article", { class: "cai-tip" }, h("p", { class: "cai-tip-criterion" }, criterion?.title || msg("criterion")),
          h("p", { class: "cai-tip-text" }, tip.tip), tip.example ? h("div", { class: "cai-example" }, h("p", {}, tip.example), copy) : null);
      })));
    }
    async function loadCoaching(evaluation, key, refresh) {
      if (!validEvaluation(key)) return;
      coachingRequest?.abort();
      const request = new AbortController(); coachingRequest = request;
      const abort = () => request.abort();
      controller.signal.addEventListener("abort", abort, { once: true });
      coaching.hidden = true; coaching.replaceChildren();
      const previews = new Map();
      const criteria = new Map((DA.checklist(evaluation.checklistVersion)?.criteria || []).map((item) => [item.id, item]));
      let previewList = null;
      try {
        const result = await DA.api.getCoaching(evaluation.id, { signal: request.signal, refresh: !!refresh, onProgress: (event) => {
          if (event.type !== "partial" || request.signal.aborted || !validEvaluation(key) || !Array.isArray(event.value?.tips)) return;
          event.value.tips.forEach((tip) => {
            const criterion = criteria.get(tip.criterionId);
            if (!criterion || (typeof tip.tip !== "string" && typeof tip.example !== "string")) return;
            if (!previewList) {
              previewList = h("div", { class: "cai-tips" });
              coaching.replaceChildren(h("h3", {}, msg("coachingTitle")), previewList);
              coaching.hidden = false; coaching.setAttribute("aria-busy", "true");
            }
            let nodes = previews.get(tip.criterionId);
            if (!nodes) {
              const body = h("p", { class: "cai-tip-text" });
              const example = h("p", {}), box = h("div", { class: "cai-example", style: { display: "none" } }, example);
              const article = h("article", { class: "cai-tip" }, h("p", { class: "cai-tip-criterion" }, criterion.title), body, box);
              previewList.append(article); nodes = { body, example, box }; previews.set(tip.criterionId, nodes);
            }
            if (typeof tip.tip === "string") nodes.body.textContent = tip.tip;
            if (typeof tip.example === "string") { nodes.example.textContent = tip.example; nodes.box.style.display = tip.example ? "" : "none"; }
          });
        } });
        if (request.signal.aborted || !validEvaluation(key)) return;
        if (!Array.isArray(result.tips) || result.tips.some((tip) => typeof tip.tip !== "string" || typeof tip.example !== "string")) throw new Error("invalid_coaching");
        renderCoaching(result.tips, evaluation);
      } catch (error) {
        if (abortError(error) || request.signal.aborted || !validEvaluation(key)) return;
        coaching.hidden = false;
        coaching.replaceChildren(h("div", { class: "cai-error", role: "status" }, h("span", {}, msg("coachingError")), retryButton(() => loadCoaching(activeEvaluation, key, true))));
      } finally { if (coachingRequest === request) coaching.removeAttribute("aria-busy"); controller.signal.removeEventListener("abort", abort); }
    }
    function updateEvaluation(evaluation) {
      const nextKey = evaluationKey(evaluation);
      activeEvaluation = evaluation;
      if (coachingKey === nextKey) return;
      coachingRequest?.abort();
      coachingKey = nextKey;
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
      window.removeEventListener("da:locale-changed", localeChanged);
    }
    options.signal?.addEventListener("abort", dispose, { once: true });
    window.addEventListener("da:evaluations-changed", invalidateChangedSource);
    window.addEventListener("da:appeals-changed", invalidateChangedSource);
    window.addEventListener("da:locale-changed", localeChanged);
    if (options.signal?.aborted) dispose();
    else { loadSummary(false); updateEvaluation(options.evaluation); }
    return { summary, translationControl, coaching, attachTranscript, updateEvaluation, dispose };
  };
})();
