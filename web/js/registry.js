/* Реестр обращений: поиск, фильтры, страницы, загрузка, итог с разбором при наведении. */
(function () {
  const DA = window.DA, h = DA.h;

  const GROUPS = [
    { key: "lang", title: "Язык", options: [{ value: "RU", label: "Русский" }, { value: "KZ", label: "Казахский" }, { value: "EN", label: "Английский" }] },
    { key: "channel", title: "Канал", options: [{ value: "agent chat", label: "Чаты" }, { value: "voice call", label: "Звонки" }] },
    { key: "state", title: "Состояние", options: [
      { value: "done", label: "Оценено" }, { value: "new", label: "Без оценки" },
      { value: "running", label: "Оценивается" }, { value: "failed", label: "Не удалось оценить" },
      { value: "appeal", label: "Есть апелляция" }, { value: "review", label: "Стоит проверить вручную" }, { value: "gross", label: "Грубая ошибка" }] }
  ];
  /* Фильтры, поиск и страница живут в модуле: возврат из карточки показывает реестр таким, каким его оставили. */
  const filter = { lang: new Set(), channel: new Set(), state: new Set(), q: "", batch: null };
  const view = { page: 1, selected: new Set(), anchor: null };
  const filterKey = () => JSON.stringify([filter.q, filter.batch, ...GROUPS.map((g) => [...filter[g.key]].sort())]);
  let selectionFilters = filterKey();

  function filtersChanged() {
    const next = filterKey();
    if (next === selectionFilters) return;
    if (view.selected.size) DA.toast("Выбор сброшен, потому что изменились фильтры");
    view.selected.clear();
    view.anchor = null;
    selectionFilters = next;
  }

  /* Размер страницы core.js не сохраняет, поэтому храним его отдельно. */
  const SIZES = [10, 25, 50, 100];
  const SIZE_KEY = "da.pageSize";
  function storedSize() {
    try { const n = Number(localStorage.getItem(SIZE_KEY)); return SIZES.includes(n) ? n : null; } catch (e) { return null; }
  }
  function setPageSize(n) {
    DA.state.pageSize = n;
    try { localStorage.setItem(SIZE_KEY, String(n)); } catch (e) { /* без сохранения */ }
    DA.save();
  }

  function matchesState(cid) {
    if (!filter.state.size) return true;
    const ev = DA.state.evaluations[cid];
    const checks = {
      done: () => !!ev && ev.status === "done" && !ev.stale,
      new: () => !ev,
      running: () => !!ev && !ev.stale && ["queued", "running"].includes(ev.status),
      failed: () => !!ev && !ev.stale && ev.status === "failed",
      appeal: () => DA.state.appeals.some((a) => a.conversationId === cid),
      review: () => !!ev && (ev.stale || ev.items.some((i) => i.needsReview)),
      gross: () => !!ev && !ev.stale && ev.grossFlagged
    };
    return [...filter.state].some((k) => checks[k]());
  }

  function visible(records) {
    const q = filter.q.trim().toLowerCase();
    const batch = filter.batch && DA.bulk?.current();
    const failed = filter.batch ? new Set(batch?.jobId === filter.batch ? batch.items.filter((item) => item.status === "failed").map((item) => item.conversationId) : []) : null;
    return records.filter((r) => {
      const cid = r.conversation_id;
      if (failed && !failed.has(cid)) return false;
      if (filter.lang.size && !filter.lang.has(r.language)) return false;
      if (filter.channel.size && !filter.channel.has(r.channel)) return false;
      if (!matchesState(cid)) return false;
      if (q && !DA.convNumber(cid).includes(q) && !cid.toLowerCase().includes(q) && !r.transcript.some((t) => t.text.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  /* Сегодняшнюю дату не повторяем в каждой строке: только время. */
  function when(ms) {
    const d = new Date(ms);
    const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === new Date().toDateString()) return time;
    return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, ${time}`;
  }

  /* Номера страниц: все, если их до 7, иначе первая, последняя, текущая с соседями и многоточия. */
  function pageList(page, pages) {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    let from = Math.max(2, page - 1), to = Math.min(pages - 1, page + 1);
    if (page <= 3) to = 4;
    if (page >= pages - 2) from = pages - 3;
    const out = [1];
    if (from > 2) out.push(null);
    for (let p = from; p <= to; p++) out.push(p);
    if (to < pages - 1) out.push(null);
    out.push(pages);
    return out;
  }

  function scoreCell(cid, reveal) {
    const ev = DA.state.evaluations[cid];
    if (!ev) return h("span", { class: "da-quiet" }, "Не оценено");
    if (ev.stale) return h("span", { class: "da-muted da-small" }, "Оценка устарела");
    if (ev.status === "queued") return h("span", { class: "da-muted da-small" }, "В очереди");
    if (ev.status === "running") return h("span", { class: "da-thinking" }, "Оценивается");
    if (ev.status === "failed") return h("span", { class: "da-error" }, "Не удалось оценить");
    const cl = DA.checklist(ev.checklistVersion);
    const value = h("span", {}, DA.fmt.score(ev.total));
    const cell = h("div", { class: "da-score-cell" + (reveal ? " is-evaluated" : ""), tabindex: 0, onclick: (e) => e.stopPropagation() },
      h("span", { class: "da-score-num" }, value,
        ev.originalTotal !== ev.total ? h("s", {}, DA.fmt.score(ev.originalTotal)) : null),
      DA.ribbon(ev.items.map((i) => ({ ...i, c: DA.criterionById(cl, i.criterionId) })), { mini: true }));
    DA.hoverCard(cell, () => DA.ribbonLegend(ev));
    if (reveal && ev.total != null) DA.countTo(value, 0, ev.total, 600);
    return cell;
  }

  function marks(cid) {
    const ev = DA.state.evaluations[cid];
    const open = DA.state.appeals.some((a) => a.conversationId === cid && a.status === "open");
    const decided = DA.state.appeals.some((a) => a.conversationId === cid && a.status !== "open");
    return h("div", { class: "da-marks" },
      ev && ev.grossFlagged ? h("span", { class: "da-mark t-gross", title: "Грубая ошибка" }, DA.icon("flag", 15)) : null,
      ev && ev.items.some((i) => i.needsReview) ? h("span", { class: "da-mark t-review", title: "Модель не уверена в части ответов, их стоит проверить" }, DA.icon("alert", 15)) : null,
      open ? h("span", { class: "da-pill t-partial" }, "Апелляция") : decided ? h("span", { class: "da-pill t-pending" }, "Пересмотрено") : null);
  }

  DA.views = DA.views || {};
  DA.views.registry = function mount(root, params) {
    if (!SIZES.includes(DA.state.pageSize)) DA.state.pageSize = storedSize() || 10;
    const query = params && params.query || {};
    if (GROUPS.some((g) => Object.hasOwn(query, g.key)) || Object.hasOwn(query, "batch")) {
      const before = JSON.stringify(GROUPS.map((g) => [...filter[g.key]].sort()));
      GROUPS.forEach((g) => {
        filter[g.key].clear();
        String(query[g.key] || "").split(",").forEach((v) => {
          if (g.options.some((o) => o.value === v)) filter[g.key].add(v);
        });
      });
      filter.batch = query.batch || null;
      if (before !== JSON.stringify(GROUPS.map((g) => [...filter[g.key]].sort()))) filter.q = "";
      if (filterKey() !== selectionFilters) view.page = 1;
      filtersChanged();
    }
    for (const cid of view.selected) if (!DA.state.conversations[cid]) view.selected.delete(cid);
    const tbody = h("tbody");
    const counter = h("span", { class: "da-muted" });
    const chips = h("div", { class: "da-active-filters" });
    const menu = DA.filterMenu(GROUPS, filter, () => { filter.batch = null; filtersChanged(); view.page = 1; render(); });
    const range = h("span", { class: "da-pager-range", "aria-live": "polite" });
    const nav = h("nav", { class: "da-pager-nav", "aria-label": "Страницы" });
    const sizes = DA.segmented(SIZES.map((n) => ({ value: n, label: String(n) })), DA.state.pageSize, (n) => {
      const first = (view.page - 1) * DA.state.pageSize;
      setPageSize(n);
      goTo(Math.floor(first / n) + 1);
    }, "Обращений на странице");
    const pager = h("div", { class: "da-pager" }, range,
      h("div", { class: "da-pager-size" }, h("span", { "aria-hidden": "true" }, "На странице"), sizes), nav);
    const wrap = h("div", { class: "da-table-wrap" });
    const pageCheck = pageCheckbox("");
    const mobilePageCheck = pageCheckbox("Выбрать страницу");
    mobilePageCheck.classList.add("da-select-page-mobile");
    const selectionMessage = h("span", { class: "da-selection-message", "aria-live": "polite" });
    const selectionBar = h("div", { class: "da-registry-selection" }, mobilePageCheck, selectionMessage);
    const allNew = h("button", { class: "da-btn", type: "button", onclick: evaluateNew });
    const rows = new Map(), stamps = new Map();
    let fresh = new Set(), animate = false, filtered = [], pageRecords = [], mounted = true, starting = false;

    function pageCheckbox(label) {
      const control = DA.checkbox(label, false, (checked) => {
        for (const r of pageRecords) checked ? view.selected.add(r.conversation_id) : view.selected.delete(r.conversation_id);
        view.anchor = null;
        syncSelection();
      });
      control.classList.add("da-row-select");
      control.querySelector("input").setAttribute("aria-label", "Выбрать все на этой странице");
      return control;
    }

    function rowCheckbox(cid) {
      let shift = false;
      const control = DA.checkbox("", view.selected.has(cid), (checked) => {
        const ids = filtered.map((r) => r.conversation_id), from = ids.indexOf(view.anchor), to = ids.indexOf(cid);
        const chosen = shift && from >= 0 ? ids.slice(Math.min(from, to), Math.max(from, to) + 1) : [cid];
        chosen.forEach((id) => checked ? view.selected.add(id) : view.selected.delete(id));
        view.anchor = cid;
        shift = false;
        syncSelection();
      });
      control.classList.add("da-row-select");
      const input = control.querySelector("input");
      input.setAttribute("aria-label", `Выбрать обращение № ${DA.convNumber(cid)}`);
      input.addEventListener("click", (e) => { shift = e.shiftKey; });
      input.addEventListener("keydown", (e) => { if (e.key === " ") shift = e.shiftKey; });
      control.addEventListener("click", (e) => e.stopPropagation());
      control.addEventListener("keydown", (e) => e.stopPropagation());
      return control;
    }

    function clearSelection() {
      view.selected.clear();
      view.anchor = null;
      if (mounted) syncSelection();
    }

    function syncSelection() {
      rows.forEach(({ row, input }, cid) => {
        input.checked = view.selected.has(cid);
        row.classList.toggle("is-selected", input.checked);
      });
      const checked = pageRecords.filter((r) => view.selected.has(r.conversation_id)).length;
      const allPage = pageRecords.length > 0 && checked === pageRecords.length;
      for (const control of [pageCheck, mobilePageCheck]) {
        const input = control.querySelector("input");
        input.checked = allPage;
        input.indeterminate = checked > 0 && !allPage;
        input.disabled = !pageRecords.length;
      }
      selectionBar.classList.toggle("has-selection", allPage);
      selectionMessage.replaceChildren();
      if (allPage) {
        const allFiltered = filtered.every((r) => view.selected.has(r.conversation_id));
        selectionMessage.append(`Выбрано ${pageRecords.length} на этой странице. `);
        if (!allFiltered) selectionMessage.append(h("button", { class: "da-btn is-text is-sm", type: "button", onclick: () => {
          filtered.forEach((r) => view.selected.add(r.conversation_id));
          syncSelection();
        } }, `Выбрать все ${filtered.length} по текущим фильтрам`));
        else if (filtered.length > pageRecords.length) selectionMessage.append(`Выбраны все ${filtered.length} по текущим фильтрам`);
      }
      DA.bulk?.setSelection([...view.selected], clearSelection);
    }

    function updateCounter() {
      const records = Object.values(DA.state.conversations);
      const evaluated = records.filter((r) => {
        const ev = DA.state.evaluations[r.conversation_id];
        return ev && ev.status === "done" && !ev.stale;
      }).length;
      counter.textContent = `${records.length} ${DA.fmt.plural(records.length, ["обращение", "обращения", "обращений"])}, оценено ${evaluated}`;
      const count = records.filter((r) => !DA.state.evaluations[r.conversation_id]).length;
      allNew.textContent = `Оценить все без оценки (${count})`;
      allNew.disabled = !count || starting || !DA.bulk || DA.bulk.isBusy();
    }

    async function evaluateNew() {
      if (starting || !DA.bulk || DA.bulk.isBusy()) return;
      const ids = Object.keys(DA.state.conversations).filter((cid) => !DA.state.evaluations[cid]);
      if (!ids.length) return;
      starting = true;
      updateCounter();
      try {
        await DA.bulk.start(ids, { checklistVersion: DA.activeChecklist().version, reuse: false });
      } catch (error) {
        if (mounted) DA.toast(error.message || "Не удалось начать оценку", allNew);
      } finally {
        starting = false;
        if (mounted) updateCounter();
      }
    }

    function evaluationStamp(cid) {
      const ev = DA.state.evaluations[cid];
      return ev ? JSON.stringify([ev.id, ev.status, ev.stale, ev.total, ev.originalTotal, ev.grossFlagged, ev.items.some((i) => i.needsReview)]) : "";
    }

    /* Опрос меняет только ячейки результата: порядок строк и фокус остаются на месте. */
    function refreshProgress() {
      if (!mounted) return;
      updateCounter();
      rows.forEach(({ row, score, mark }, cid) => {
        const stamp = evaluationStamp(cid), previous = stamps.get(cid);
        if (stamp === previous) return;
        const ev = DA.state.evaluations[cid];
        const before = previous ? JSON.parse(previous) : null;
        const reveal = ev?.status === "done" && !ev.stale && (!before || before[0] !== ev.id || before[1] !== "done");
        const focus = score.contains(document.activeElement);
        score.replaceChildren(scoreCell(cid, reveal));
        mark.replaceChildren(marks(cid));
        if (focus) (score.querySelector("[tabindex]") || row).focus({ preventScroll: true });
        if (reveal) {
          row.classList.remove("is-evaluated");
          void row.offsetWidth;
          row.classList.add("is-evaluated");
        }
        stamps.set(cid, stamp);
      });
    }

    function renderChips() {
      const query = new URLSearchParams();
      GROUPS.forEach((g) => { if (filter[g.key].size) query.set(g.key, [...filter[g.key]].join(",")); });
      if (filter.batch) query.set("batch", filter.batch);
      history.replaceState(null, "", "#/" + (query.size ? "?" + query : ""));
      chips.replaceChildren();
      for (const g of GROUPS) for (const v of filter[g.key]) {
        const o = g.options.find((x) => x.value === v);
        chips.append(h("button", { class: "da-filter-chip", type: "button", onclick: () => { filter[g.key].delete(v); filter.batch = null; filtersChanged(); view.page = 1; menu.refresh(); render(); } }, o.label, DA.icon("x", 14)));
      }
      if (chips.children.length > 1) chips.append(h("button", { class: "da-btn is-text is-sm", onclick: reset }, "Сбросить все"));
    }
    function reset() {
      GROUPS.forEach((g) => filter[g.key].clear());
      filter.q = "";
      filter.batch = null;
      search.value = "";
      filtersChanged();
      view.page = 1;
      menu.refresh();
      render();
    }

    /* Переход на страницу: строки коротко проявляются, таблица возвращается в поле зрения. */
    function goTo(page) {
      view.page = page;
      animate = true;
      render();
      const offset = (matchMedia("(max-width: 900px)").matches ? 56 : 0) + 12;
      const top = wrap.getBoundingClientRect().top;
      if (top < offset) window.scrollTo({ top: scrollY + top - offset, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }

    function renderPager(total, pages) {
      const size = DA.state.pageSize, from = (view.page - 1) * size + 1, to = Math.min(total, view.page * size);
      range.textContent = pages > 1 ? `Показаны ${from}–${to} из ${total}` : `Показаны все ${total}`;
      const had = nav.contains(document.activeElement) ? document.activeElement.dataset.go : null;
      const step = (go, label, icon, disabled) => h("button", { class: "da-pager-btn is-step", type: "button", "data-go": go, disabled, "aria-label": label, onclick: () => goTo(view.page + (go === "next" ? 1 : -1)) },
        go === "prev" ? DA.icon(icon, 16) : null, h("span", {}, label), go === "next" ? DA.icon(icon, 16) : null);
      nav.replaceChildren(
        step("prev", "Назад", "back", view.page === 1),
        ...pageList(view.page, pages).map((p) => p == null
          ? h("span", { class: "da-pager-gap", "aria-hidden": "true" }, "…")
          : h("button", { class: "da-pager-btn", type: "button", "data-go": String(p), "aria-label": `Страница ${p}`, "aria-current": p === view.page ? "page" : null, onclick: () => p !== view.page && goTo(p) }, p)),
        step("next", "Вперёд", "chevron", view.page === pages));
      nav.hidden = pages < 2;
      if (had) {
        const same = nav.querySelector(`[data-go="${had}"]:not([disabled])`) || nav.querySelector("[aria-current]");
        same && same.focus();
      }
    }

    /* added: идентификаторы только что загруженных обращений, их строки коротко подсвечиваются. */
    function render(added) {
      const records = Object.values(DA.state.conversations).sort((a, b) => DA.state.numbers[a.conversation_id] - DA.state.numbers[b.conversation_id]);
      const list = filtered = visible(records);
      const size = DA.state.pageSize;
      if (Array.isArray(added) && added.length) {
        fresh = new Set(added);
        const idx = list.findIndex((r) => fresh.has(r.conversation_id));
        if (idx >= 0) view.page = Math.floor(idx / size) + 1;
        animate = true;
      }
      const pages = Math.max(1, Math.ceil(list.length / size));
      view.page = Math.min(Math.max(1, view.page), pages);

      updateCounter();
      renderChips();
      tbody.replaceChildren();
      rows.clear();
      stamps.clear();
      tbody.classList.remove("is-paging");
      pageRecords = list.slice((view.page - 1) * size, view.page * size);
      if (!list.length) {
        pager.hidden = true;
        tbody.append(h("tr", { class: "da-empty-row" }, h("td", { colspan: 9 },
          h("div", {}, "Под эти условия ничего не подходит"),
          h("button", { class: "da-btn is-text", onclick: reset }, "Сбросить фильтры"))));
        syncSelection();
        return;
      }
      pager.hidden = false;
      pageRecords.forEach((r, i) => {
        const cid = r.conversation_id;
        const open = () => (location.hash = `#/c/${encodeURIComponent(cid)}`);
        const control = rowCheckbox(cid), score = h("td", { class: "c-score" }, scoreCell(cid)), mark = h("td", { class: "c-marks" }, marks(cid));
        const row = h("tr", { class: fresh.has(cid) ? "is-fresh" : null, "data-conversation": cid, style: `--i: ${Math.min(i, 14)}`, tabindex: 0, onclick: open,
          onkeydown: (e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(); } },
          h("td", { class: "c-select", onclick: (e) => e.stopPropagation() }, control),
          h("td", { class: "da-num c-num", title: cid }, DA.convNumber(cid)),
          h("td", { class: "da-muted da-nowrap c-date" }, when(DA.tx.startedAt(r))),
          h("td", { class: "c-lang" }, DA.langLabel[r.language]),
          h("td", { class: "c-chan" }, h("span", { class: "da-channel" }, DA.icon(r.channel === "voice call" ? "phone" : "message", 16), DA.channelLabel(r))),
          h("td", { class: "c-prev" }, h("div", { class: "da-preview" }, r.summary?.topic || DA.tx.preview(r))),
          h("td", { class: "da-muted c-dur" }, h("span", { class: "da-only-narrow" }, "Длительность "), DA.fmt.duration(DA.tx.duration(r))),
          score, mark);
        rows.set(cid, { row, input: control.querySelector("input"), score, mark });
        stamps.set(cid, evaluationStamp(cid));
        tbody.append(row);
      });
      if (animate) { void tbody.offsetWidth; tbody.classList.add("is-paging"); }
      animate = false;
      fresh = new Set();
      renderPager(list.length, pages);
      syncSelection();
    }

    const search = h("input", { class: "da-input", type: "search", placeholder: "Номер обращения или текст", value: filter.q, "aria-label": "Поиск" });
    let t;
    search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { filter.q = search.value; filter.batch = null; filtersChanged(); view.page = 1; render(); }, 200); });

    wrap.append(
      selectionBar,
      h("table", { class: "da-table da-registry" },
        h("thead", {}, h("tr", {},
          h("th", { class: "c-select" }, pageCheck),
          h("th", {}, "№"), h("th", {}, "Дата и время"), h("th", {}, "Язык"), h("th", {}, "Канал"),
          h("th", {}, "С чем обратились"), h("th", {}, "Длительность"), h("th", {}, "Итог"), h("th", {}, h("span", { class: "da-sr" }, "Отметки")))),
        tbody),
      pager);
    root.append(h("div", { class: "da-page" },
      h("div", { class: "da-page-head" },
        h("h1", { class: "da-h1", tabindex: -1 }, "Обращения"), counter,
        h("div", { class: "da-registry-actions da-head-action" }, allNew,
          h("button", { class: "da-btn is-primary", onclick: () => DA.openUpload(render) }, DA.icon("upload"), "Загрузить обращения"))),
      h("div", { class: "da-toolbar" }, h("div", { class: "da-search" }, DA.icon("search"), search), menu, chips),
      wrap));
    render();
    const unsubscribe = DA.bulk?.subscribe(refreshProgress);
    return () => {
      mounted = false;
      clearTimeout(t);
      unsubscribe?.();
      DA.bulk?.clearSelection();
    };
  };
})();
