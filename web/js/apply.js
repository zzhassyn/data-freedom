/* Применение версии: выбор обращений и сравнение с исходными оценками. */
(function () {
  const DA = window.DA, h = DA.h;
  const modelFields = ["title", "description", "type", "naAllowed", "naCondition", "scale", "flagTypes"];
  const brief = (ev) => ({ id: ev.id, total: ev.total ?? null, answers: Object.fromEntries((ev.items || []).filter((i) => i.status === "done").map((i) => [i.criterionId, i.answer])) });
  const number = (n, digits) => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  const delta = (n, digits) => n === 0 ? "0" : `${n > 0 ? "+" : "−"}${number(Math.abs(n), digits)}`;
  const answer = (value) => value == null ? "Нет ответа" : ({ yes: "Да", no: "Нет", na: "Не применимо" }[value] || String(value));
  const cacheKey = (version) => `da.apply.${DA.mode}.${version}`;
  function readRun(version) {
    try { return JSON.parse(sessionStorage.getItem(cacheKey(version)) || "null"); } catch (_) { return null; }
  }
  function saveRun(version, run) {
    try { sessionStorage.setItem(cacheKey(version), JSON.stringify(run)); } catch (_) { /* Сравнение остаётся на текущем экране. */ }
  }

  DA.views = DA.views || {};
  DA.views.apply = function mount(root, params) {
    const target = DA.state.checklists.find((cl) => cl.version === Number(params?.version));
    if (!target) {
      root.append(h("div", { class: "da-page" }, h("div", { class: "da-empty" }, h("h1", { tabindex: -1 }, "Версия не найдена"), h("a", { class: "da-btn", href: "#/checklists" }, "Открыть чек-лист"))));
      return;
    }
    let disposed = false, loadId = 0, loaded = false, starting = false, activating = false;
    let run = readRun(target.version), mode = "version", selected = new Set(), searchText = "", sort = "delta", resultError = "";
    const fetching = new Set();
    const versions = [...DA.state.checklists].sort((a, b) => b.version - a.version);
    const current = DA.bulk?.current();
    let sourceVersion = (current?.source === "apply" && Number(current.toVersion) === target.version && !["done", "failed"].includes(current.status) ? Number(current.fromVersion) : null) || run?.fromVersion || target.basedOnVersion || versions.find((cl) => cl.version < target.version)?.version || versions.find((cl) => cl.version !== target.version)?.version || target.version;
    let ignoredRun = run?.dismissed || null;
    if (run?.dismissed) run = null;
    // Возврат к сравнению сохраняет точный набор, даже если общий список вырос.
    if (run?.ids) { mode = "manual"; selected = new Set(run.ids); }
    let allEvaluations = [], sourceEvaluations = [], diff = null, baseline = {}, loadError = "", actionError = "";
    const activeNotice = h("div", { class: "ap-active" }), setup = h("div", { class: "ap-setup" });
    const result = h("section", { class: "ap-results", "aria-labelledby": "ap-results-title" });
    const page = h("div", { class: "da-page ap-page" },
      h("a", { class: "ap-back", href: `#/checklists?version=${target.version}` }, DA.icon("back", 16), "К чек-листу"),
      h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, `Применить версию ${target.version} к обращениям`)),
      activeNotice, setup, result);
    root.append(page);

    const busy = () => starting || !!DA.bulk?.isBusy();
    const source = () => DA.state.checklists.find((cl) => cl.version === sourceVersion);
    const ids = () => mode === "manual" ? [...selected] : (mode === "all" ? allEvaluations : sourceEvaluations).map((ev) => ev.conversationId);
    function notice() {
      activeNotice.hidden = !!DA.state.checklists.find((cl) => cl.version === target.version)?.isActive;
      activeNotice.replaceChildren(h("span", {}, "Эта версия пока не активна."),
        h("button", { class: `da-btn is-text is-sm${activating ? " is-busy" : ""}`, type: "button", disabled: activating, onclick: async () => {
          activating = true; actionError = ""; notice();
          try { await DA.data.activateChecklist(target.version); }
          catch (error) { actionError = error.message || "Не удалось сделать версию активной. Повторите действие"; }
          finally { activating = false; if (!disposed) { notice(); refreshActions(); } }
        } }, "Сделать активной"));
    }
    function versionPicker() {
      const box = h("details", { class: "ap-version" });
      const trigger = h("summary", { class: "da-btn", "aria-label": "Версия для сравнения" }, `Версия ${sourceVersion}`, DA.icon("chevron", 14));
      const menu = h("div", { class: "ap-version-menu", role: "group", "aria-label": "Выберите версию для сравнения" }, versions.map((cl) =>
        h("button", { type: "button", class: cl.version === sourceVersion ? "is-selected" : null, onclick: () => {
          if (busy()) return;
          box.open = false;
          if (cl.version === sourceVersion) return;
          ignoredRun = run?.key || DA.bulk?.current()?.applyRunId || null;
          sourceVersion = cl.version; run = null; actionError = ""; resultError = "";
          saveRun(target.version, { dismissed: ignoredRun, fromVersion: sourceVersion });
          load();
        } }, `Версия ${cl.version}`, cl.version === sourceVersion ? DA.icon("check", 15) : null)));
      box.append(trigger, menu);
      trigger.addEventListener("click", (event) => { if (busy()) event.preventDefault(); });
      box.addEventListener("keydown", (event) => { if (event.key === "Escape") { box.open = false; trigger.focus(); } });
      return box;
    }
    function changeDetail(row) {
      if (row.kind === "weight") return `Вес ${row.before.weight} → ${row.after.weight}`;
      if (row.kind === "removed") return "Больше не участвует в оценке";
      if (row.kind === "added") return row.after.description;
      if (row.kind === "section") return `${source()?.sections.find((s) => s.id === row.before.sectionId)?.title || "Раздел"} → ${target.sections.find((s) => s.id === row.after.sectionId)?.title || "Раздел"}`;
      if (row.kind === "order") return "Изменилось место в списке критериев";
      if (row.fields.includes("description")) return row.after.description;
      if (row.fields.includes("title")) return `${row.before.title} → ${row.after.title}`;
      if (row.fields.includes("type")) {
        const types = { binary: "Да или нет", scale: "Баллы по шкале", flag: "Отметка нарушения" };
        return `${types[row.before.type]} → ${types[row.after.type]}`;
      }
      if (row.fields.some((field) => ["naAllowed", "naCondition"].includes(field))) return row.after.naAllowed ? `Не применяется, если ${row.after.naCondition}` : "Применяется ко всем разговорам";
      if (row.fields.includes("scale")) return "Изменены ступени шкалы";
      return "Изменены виды нарушений";
    }
    function changes() {
      const rows = DA.checklistChanges(target, source());
      const changedIds = new Set([...(diff?.added || []), ...(diff?.changed || []).filter((item) => item.fields.some((field) => modelFields.includes(field))).map((item) => item.criterionId)]);
      const count = changedIds.size, reused = target.criteria.length - count;
      let summary;
      if (!count) summary = rows.some((row) => row.kind === "weight") ? "Модель вызывать не нужно, итоги пересчитаются по новым весам." : "Ответы по совпадающим правилам возьмём из прошлых оценок.";
      else summary = `Модель заново оценит ${count} ${DA.fmt.plural(count, ["критерий", "критерия", "критериев"])}.${reused ? ` Ответы по ${reused} ${DA.fmt.plural(reused, ["остальному критерию", "остальным критериям", "остальным критериям"])} возьмём из прошлых оценок, это быстрее и дешевле.` : ""}`;
      return h("section", { class: "ap-changes", "aria-labelledby": "ap-changes-title" },
        h("div", { class: "ap-section-head" }, h("h2", { id: "ap-changes-title" }, "Что изменилось по сравнению с"), versionPicker()),
        rows.length ? h("ul", { class: "ap-change-list" }, rows.map((row) => h("li", {}, h("span", { class: `ap-change-label is-${row.kind}` }, row.label), h("div", {}, h("b", {}, row.title), h("p", {}, changeDetail(row)))))) : h("p", { class: "da-muted" }, "Правила и веса совпадают."),
        h("p", { class: "ap-reuse-note" }, DA.icon("refresh", 17), h("span", {}, summary, h("small", { class: "ap-reuse-extra", hidden: true }))));
    }
    function manualList() {
      const q = searchText.toLocaleLowerCase("ru-RU").trim();
      const list = allEvaluations.filter((ev) => {
        const conv = DA.state.conversations[ev.conversationId];
        return !q || DA.convNumber(ev.conversationId).includes(q) || DA.tx.preview(conv).toLocaleLowerCase("ru-RU").includes(q);
      });
      const host = setup.querySelector(".ap-manual-list");
      if (!host) return;
      host.replaceChildren(...list.map((ev) => {
        const conv = DA.state.conversations[ev.conversationId];
        const check = DA.checkbox(h("span", { class: "ap-choice-text" }, h("b", {}, `№ ${DA.convNumber(ev.conversationId)}`), h("span", {}, conv.summary?.topic || DA.tx.preview(conv))), selected.has(ev.conversationId), (on) => {
          on ? selected.add(ev.conversationId) : selected.delete(ev.conversationId); refreshActions();
        });
        check.querySelector("input").disabled = busy();
        return h("div", { class: "ap-choice" }, check, h("span", { class: "ap-choice-score" }, DA.fmt.score(ev.total)));
      }));
      if (!list.length) host.append(h("p", { class: "ap-no-matches" }, "Обращения не найдены. Измените запрос."));
    }
    function renderSetup() {
      if (!loaded) {
        setup.replaceChildren(h("div", { class: "ap-loading", role: "status" }, loadError ? h("div", { role: "alert" }, h("p", {}, loadError), h("button", { class: "da-btn", type: "button", onclick: load }, "Повторить загрузку")) : h("span", { class: "da-thinking" }, "Загружаем версии и оценки")));
        return;
      }
      const selector = DA.segmented([
        { value: "all", label: `Все оценённые (${allEvaluations.length})` },
        { value: "version", label: `Оценённые по версии ${sourceVersion} (${sourceEvaluations.length})` },
        { value: "manual", label: "Выбрать вручную" }
      ], mode, (value) => { mode = value; renderSetup(); }, "К каким обращениям применить версию");
      const search = h("input", { class: "da-input", type: "search", value: searchText, placeholder: "Номер обращения или текст", "aria-label": "Найти обращение", oninput: (e) => { searchText = e.target.value; manualList(); } });
      setup.replaceChildren(changes(), h("section", { class: "ap-selection", "aria-labelledby": "ap-selection-title" },
        h("h2", { id: "ap-selection-title" }, "К каким обращениям"), selector,
        mode === "manual" ? h("div", { class: "ap-manual" }, h("div", { class: "da-search" }, DA.icon("search"), search), h("div", { class: "ap-manual-list" })) : null,
        !allEvaluations.length ? h("p", { class: "ap-no-evaluations" }, "Сначала оцените обращения, чтобы сравнить результаты двух версий. ", h("a", { href: "#/" }, "Перейти к обращениям")) : null,
        h("div", { class: "ap-actions" }, h("button", { class: "da-btn is-primary ap-start", type: "button", onclick: () => start() }), h("p", { class: "ap-action-error", role: "alert", hidden: true })),
        h("p", { class: "ap-busy-note", hidden: true }, "Дождитесь завершения текущей оценки. Прогресс доступен внизу экрана.")));
      manualList(); refreshActions();
    }
    function refreshActions() {
      const button = setup.querySelector(".ap-start"), error = setup.querySelector(".ap-action-error");
      if (!button) return;
      const n = ids().length;
      const missing = ids().filter((id) => !baseline[id]).length, extra = setup.querySelector(".ap-reuse-extra");
      extra.hidden = !missing;
      extra.textContent = missing ? `У ${missing} ${DA.fmt.plural(missing, ["обращения", "обращений", "обращений"])} нет оценки по версии ${sourceVersion}. Для них модель проверит все критерии.` : "";
      button.textContent = starting ? "Начинаем оценку" : `Применить к ${n} ${DA.fmt.plural(n, ["обращению", "обращениям", "обращениям"])}`;
      button.disabled = !n || busy(); button.classList.toggle("is-busy", starting);
      error.textContent = actionError; error.hidden = !actionError;
      const blocked = busy();
      setup.querySelectorAll(".da-seg button, .ap-manual input, .ap-version button").forEach((control) => { control.disabled = blocked; });
      const picker = setup.querySelector(".ap-version");
      if (picker) { picker.classList.toggle("is-disabled", blocked); if (blocked) picker.open = false; }
      setup.querySelector(".ap-busy-note").hidden = !blocked || starting;
    }
    function changedAnswers(before, after) {
      const keys = new Set([...Object.keys(before?.answers || {}), ...Object.keys(after?.answers || {})]);
      return [...keys].filter((key) => (before?.answers[key] ?? null) !== (after?.answers[key] ?? null)).map((key) => ({
        title: target.criteria.find((c) => c.id === key)?.title || source()?.criteria.find((c) => c.id === key)?.title || "Критерий",
        before: before?.answers[key] ?? null, after: after?.answers[key] ?? null
      }));
    }
    function renderResults() {
      const focusId = result.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
      result.hidden = !run;
      if (!run) { result.replaceChildren(); return; }
      const rows = run.ids.map((id) => {
        const before = run.baseline[id], after = run.results[id];
        const complete = after?.status === "done", a = complete ? after.total : null, b = before?.total ?? null;
        return { id, before: b, after: a, status: after?.status || "queued", evaluationId: after?.id, delta: a != null && b != null ? a - b : null, changed: complete && before ? changedAnswers(before, after) : [] };
      });
      const paired = rows.filter((row) => row.delta != null), complete = rows.filter((row) => row.status === "done").length;
      const changed = paired.filter((row) => Math.abs(row.delta) > .00001).length;
      const average = paired.length ? paired.reduce((sum, row) => sum + row.delta, 0) / paired.length : null;
      const summary = paired.length ? `Итог изменился у ${changed} ${DA.fmt.plural(changed, ["обращения", "обращений", "обращений"])} из ${paired.length}, в среднем на ${delta(average, 1)}.` : "Новые итоги появятся по мере готовности.";
      rows.sort((a, b) => sort === "number" ? DA.state.numbers[a.id] - DA.state.numbers[b.id] : (b.delta == null ? -1 : Math.abs(b.delta)) - (a.delta == null ? -1 : Math.abs(a.delta)) || DA.state.numbers[a.id] - DA.state.numbers[b.id]);
      const tbody = h("tbody", {}, rows.map((row) => {
        const open = () => { if (row.status === "done" && row.evaluationId) location.hash = `#/c/${encodeURIComponent(row.id)}?evaluation=${encodeURIComponent(row.evaluationId)}`; };
        const tr = h("tr", { class: row.status === "done" ? "is-ready" : null, "data-focus": row.id, tabindex: row.status === "done" ? 0 : null, onclick: open, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } } },
          h("td", { class: "ap-number" }, `№ ${DA.convNumber(row.id)}`),
          h("td", { class: "ap-before", "data-label": `Версия ${run.fromVersion}` }, row.before == null ? "Нет оценки" : DA.fmt.score(row.before)),
          h("td", { class: `ap-after${row.status === "failed" ? " is-failed" : ""}`, "data-label": `Версия ${target.version}` }, row.status === "done" ? (row.after == null ? "Нет итога" : DA.fmt.score(row.after)) : row.status === "failed" ? "Не удалось оценить" : h("span", { class: ["running", "loading"].includes(row.status) ? "da-thinking" : "da-muted" }, row.status === "running" ? "Оценивается" : row.status === "loading" ? "Загружаем итог" : "В очереди")),
          h("td", { class: `ap-delta ${row.delta > 0 ? "is-up" : row.delta < 0 ? "is-down" : ""}`, "data-label": "Разница" }, row.delta == null ? "Нет сравнения" : delta(row.delta, 2)),
          h("td", { class: "ap-answers", "data-label": "Изменившиеся ответы" }, row.changed.length ? row.changed.map((item) => h("span", { class: "ap-answer-change" }, h("b", {}, `${item.title}: `), `${answer(item.before)} → ${answer(item.after)}`)) : h("span", { class: "da-muted" }, row.status === "done" ? (row.before == null ? "Нет прежней оценки" : "Ответы не изменились") : "")));
        if (row.status === "done") tr.setAttribute("aria-label", `Открыть обращение № ${DA.convNumber(row.id)} с оценкой по версии ${target.version}`);
        return tr;
      }));
      const failed = rows.filter((row) => row.status === "failed").map((row) => row.id);
      result.replaceChildren(...[h("div", { class: "ap-section-head" }, h("h2", { id: "ap-results-title" }, "Было и стало"),
        h("button", { class: "da-btn is-text is-sm", type: "button", "data-focus": "sort", onclick: () => { sort = sort === "delta" ? "number" : "delta"; renderResults(); } }, DA.icon("list", 15), sort === "delta" ? "Сначала большие изменения" : "По номеру обращения")),
        h("p", { class: "ap-summary", "aria-live": "polite" }, summary, complete < rows.length ? ` Готово ${complete} из ${rows.length}.` : "", complete > paired.length ? ` У ${complete - paired.length} нет прежнего итога для сравнения.` : ""),
        h("div", { class: "ap-table-wrap" }, h("table", { class: "ap-table" }, h("thead", {}, h("tr", {}, h("th", {}, "Обращение"), h("th", {}, `Версия ${run.fromVersion}`), h("th", {}, `Версия ${target.version}`), h("th", {}, "Разница"), h("th", {}, "Изменившиеся ответы"))), tbody)),
        failed.length ? h("div", { class: "ap-retry" }, h("span", {}, `Не удалось оценить ${failed.length} ${DA.fmt.plural(failed.length, ["обращение", "обращения", "обращений"])}.`), h("button", { class: "da-btn", type: "button", "data-focus": "retry", disabled: busy(), onclick: () => start(failed) }, "Повторить их")) : null,
        resultError ? h("div", { class: "ap-retry", role: "alert" }, h("span", {}, resultError), h("button", { class: "da-btn", type: "button", "data-focus": "reload", onclick: () => { resultError = ""; receive(DA.bulk.current()); } }, "Обновить сравнение")) : null].filter(Boolean));
      if (focusId) [...result.querySelectorAll("[data-focus]")].find((node) => node.dataset.focus === focusId)?.focus({ preventScroll: true });
    }
    function loadMissing(item, key) {
      if (fetching.has(item.evaluationId)) return;
      fetching.add(item.evaluationId);
      DA.data.evaluationById(item.evaluationId).then((ev) => {
        if (disposed || run?.key !== key || run.results[item.conversationId]?.id !== item.evaluationId) return;
        if (ev?.id !== item.evaluationId || ev.status !== "done") throw new Error("Итог ещё не готов. Обновите сравнение");
        run.results[item.conversationId] = { status: "done", ...brief(ev) };
        saveRun(target.version, run); renderResults();
      }).catch((error) => {
        if (!disposed && run?.key === key) { resultError = error.message || "Не удалось загрузить новые итоги"; renderResults(); }
      }).finally(() => fetching.delete(item.evaluationId));
    }
    function receive(snapshot) {
      if (disposed) return;
      if (snapshot?.source === "apply" && Number(snapshot.toVersion) === target.version && Number(snapshot.fromVersion) === sourceVersion && snapshot.applyRunId && snapshot.applyRunId !== ignoredRun) {
        if (run?.key !== snapshot.applyRunId) {
          run = { key: snapshot.applyRunId, fromVersion: Number(snapshot.fromVersion), ids: snapshot.selectedIds || snapshot.ids, baseline: snapshot.beforeEvaluations || {}, results: {} };
          if (!starting) { mode = "manual"; selected = new Set(run.ids); if (loaded) renderSetup(); }
        }
        for (const item of snapshot.items || []) {
          const ev = item.evaluation;
          // Итог и ответы берутся только из оценки, принадлежащей текущей задаче.
          const old = run.results[item.conversationId];
          if (item.status === "done" && ev?.id !== item.evaluationId) {
            if (old?.id === item.evaluationId && old.status === "done") continue;
            run.results[item.conversationId] = { status: "loading", id: item.evaluationId, total: null, answers: {} };
            loadMissing(item, run.key);
          } else run.results[item.conversationId] = { status: item.status, ...(ev?.id === item.evaluationId ? brief(ev) : { id: item.evaluationId, total: null, answers: {} }) };
        }
        saveRun(target.version, run);
        renderResults();
      }
      refreshActions();
    }
    async function start(retryIds) {
      if (busy()) return;
      const chosen = retryIds || ids();
      if (!chosen.length) return;
      const next = retryIds && run ? run : { key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, fromVersion: sourceVersion, ids: chosen, baseline: structuredClone(baseline), results: {} };
      starting = true; actionError = ""; refreshActions();
      try {
        await DA.bulk.start(chosen, { checklistVersion: target.version, reuse: true, source: "apply", fromVersion: next.fromVersion, toVersion: target.version,
          applyRunId: next.key, selectedIds: next.ids, beforeEvaluations: next.baseline });
      } catch (error) { actionError = error.message || "Не удалось начать оценку. Ваш выбор сохранён"; }
      finally { starting = false; if (!disposed) { refreshActions(); renderResults(); } }
    }
    async function load() {
      const request = ++loadId;
      loaded = false; loadError = ""; renderSetup();
      try {
        await DA.data.conversations({ refresh: true });
        const [all, previous, changes] = await Promise.all([DA.data.latestEvaluations(), DA.data.latestEvaluations({ checklistVersion: sourceVersion }), DA.data.diffChecklists(target.version, sourceVersion)]);
        if (disposed || request !== loadId) return;
        allEvaluations = all; sourceEvaluations = previous; diff = changes;
        baseline = Object.fromEntries(previous.map((ev) => [ev.conversationId, brief(ev)]));
        selected = new Set([...selected].filter((id) => all.some((ev) => ev.conversationId === id)));
        loaded = true; renderSetup(); renderResults();
      } catch (error) {
        if (disposed || request !== loadId) return;
        loadError = error.message || "Не удалось загрузить оценки. Повторите загрузку"; renderSetup();
      }
    }
    function outside(event) { setup.querySelectorAll(".ap-version[open]").forEach((node) => { if (!node.contains(event.target)) node.open = false; }); }
    document.addEventListener("click", outside);
    notice(); load();
    const unsubscribe = DA.bulk?.subscribe(receive);
    return () => { disposed = true; loadId++; unsubscribe?.(); document.removeEventListener("click", outside); };
  };
})();
