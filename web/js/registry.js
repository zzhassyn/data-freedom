/* Реестр обращений: поиск, фильтры, страницы, загрузка, итог с разбором при наведении. */
(function () {
  const DA = window.DA, h = DA.h;

  const GROUPS = [
    { key: "lang", title: "Язык", options: [{ value: "RU", label: "Русский" }, { value: "KZ", label: "Казахский" }, { value: "EN", label: "Английский" }] },
    { key: "channel", title: "Канал", options: [{ value: "agent chat", label: "Чаты" }, { value: "voice call", label: "Звонки" }] },
    { key: "state", title: "Состояние", options: [
      { value: "done", label: "Оценено" }, { value: "new", label: "Без оценки" },
      { value: "appeal", label: "Есть апелляция" }, { value: "review", label: "Стоит проверить вручную" }, { value: "gross", label: "Грубая ошибка" }] }
  ];
  /* Фильтры, поиск и страница живут в модуле: возврат из карточки показывает реестр таким, каким его оставили. */
  const filter = { lang: new Set(), channel: new Set(), state: new Set(), q: "" };
  const view = { page: 1 };

  /* Размер страницы core.js не сохраняет, поэтому храним его отдельно. */
  const SIZES = [10, 25, 50, 100];
  const SIZE_KEY = "da.pageSize";
  function storedSize() {
    try { const n = Number(localStorage.getItem(SIZE_KEY)); return SIZES.includes(n) ? n : null; } catch (e) { return null; }
  }
  DA.state.pageSize = DA.state.pageSize || storedSize() || 10;
  function setPageSize(n) {
    DA.state.pageSize = n;
    try { localStorage.setItem(SIZE_KEY, String(n)); } catch (e) { /* без сохранения */ }
    DA.save();
  }

  function matchesState(cid) {
    if (!filter.state.size) return true;
    const ev = DA.state.evaluations[cid];
    const checks = {
      done: () => !!ev && !ev.stale,
      new: () => !ev,
      appeal: () => DA.state.appeals.some((a) => a.conversationId === cid),
      review: () => !!ev && (ev.stale || ev.items.some((i) => i.needsReview)),
      gross: () => !!ev && ev.grossFlagged
    };
    return [...filter.state].some((k) => checks[k]());
  }

  function visible(records) {
    const q = filter.q.trim().toLowerCase();
    return records.filter((r) => {
      const cid = r.conversation_id;
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

  function scoreCell(cid) {
    const ev = DA.state.evaluations[cid];
    if (!ev) return h("span", { class: "da-quiet" }, "Не оценено");
    if (ev.stale) return h("span", { class: "da-muted da-small" }, "Оценка устарела");
    const cl = DA.checklist(ev.checklistVersion);
    const cell = h("div", { class: "da-score-cell", tabindex: 0, onclick: (e) => e.stopPropagation() },
      h("span", { class: "da-score-num" }, DA.fmt.score(ev.total),
        ev.originalTotal !== ev.total ? h("s", {}, DA.fmt.score(ev.originalTotal)) : null),
      DA.ribbon(ev.items.map((i) => ({ ...i, c: DA.criterionById(cl, i.criterionId) })), { mini: true }));
    DA.hoverCard(cell, () => DA.ribbonLegend(ev));
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
    const query = params && params.query || {};
    if (GROUPS.some((g) => Object.hasOwn(query, g.key))) {
      GROUPS.forEach((g) => {
        filter[g.key].clear();
        String(query[g.key] || "").split(",").forEach((v) => {
          if (g.options.some((o) => o.value === v)) filter[g.key].add(v);
        });
      });
      filter.q = "";
      view.page = 1;
    }
    const tbody = h("tbody");
    const counter = h("span", { class: "da-muted" });
    const chips = h("div", { class: "da-active-filters" });
    const menu = DA.filterMenu(GROUPS, filter, () => { view.page = 1; render(); });
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
    let fresh = new Set(), animate = false;

    function renderChips() {
      const query = new URLSearchParams();
      GROUPS.forEach((g) => { if (filter[g.key].size) query.set(g.key, [...filter[g.key]].join(",")); });
      history.replaceState(null, "", "#/" + (query.size ? "?" + query : ""));
      chips.replaceChildren();
      for (const g of GROUPS) for (const v of filter[g.key]) {
        const o = g.options.find((x) => x.value === v);
        chips.append(h("button", { class: "da-filter-chip", type: "button", onclick: () => { filter[g.key].delete(v); view.page = 1; menu.refresh(); render(); } }, o.label, DA.icon("x", 14)));
      }
      if (chips.children.length > 1) chips.append(h("button", { class: "da-btn is-text is-sm", onclick: reset }, "Сбросить все"));
    }
    function reset() {
      GROUPS.forEach((g) => filter[g.key].clear());
      filter.q = "";
      search.value = "";
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
      const list = visible(records);
      const size = DA.state.pageSize;
      if (Array.isArray(added) && added.length) {
        fresh = new Set(added);
        const idx = list.findIndex((r) => fresh.has(r.conversation_id));
        if (idx >= 0) view.page = Math.floor(idx / size) + 1;
        animate = true;
      }
      const pages = Math.max(1, Math.ceil(list.length / size));
      view.page = Math.min(Math.max(1, view.page), pages);

      const evaluated = records.filter((r) => DA.state.evaluations[r.conversation_id] && !DA.state.evaluations[r.conversation_id].stale).length;
      counter.textContent = `${records.length} ${DA.fmt.plural(records.length, ["обращение", "обращения", "обращений"])}, оценено ${evaluated}`;
      renderChips();
      tbody.replaceChildren();
      tbody.classList.remove("is-paging");
      if (!list.length) {
        pager.hidden = true;
        tbody.append(h("tr", { class: "da-empty-row" }, h("td", { colspan: 8 },
          h("div", {}, "Под эти условия ничего не подходит"),
          h("button", { class: "da-btn is-text", onclick: reset }, "Сбросить фильтры"))));
        return;
      }
      pager.hidden = false;
      list.slice((view.page - 1) * size, view.page * size).forEach((r, i) => {
        const cid = r.conversation_id;
        const open = () => (location.hash = `#/c/${encodeURIComponent(cid)}`);
        tbody.append(h("tr", { class: fresh.has(cid) ? "is-fresh" : null, style: `--i: ${Math.min(i, 14)}`, tabindex: 0, onclick: open, onkeydown: (e) => e.key === "Enter" && open() },
          h("td", { class: "da-num c-num", title: cid }, DA.convNumber(cid)),
          h("td", { class: "da-muted da-nowrap c-date" }, when(DA.tx.startedAt(r))),
          h("td", { class: "c-lang" }, DA.langLabel[r.language]),
          h("td", { class: "c-chan" }, h("span", { class: "da-channel" }, DA.icon(r.channel === "voice call" ? "phone" : "message", 16), DA.channelLabel(r))),
          h("td", { class: "c-prev" }, h("div", { class: "da-preview" }, DA.tx.preview(r))),
          h("td", { class: "da-muted c-dur" }, h("span", { class: "da-only-narrow" }, "Длительность "), DA.fmt.duration(DA.tx.duration(r))),
          h("td", { class: "c-score" }, scoreCell(cid)),
          h("td", { class: "c-marks" }, marks(cid))));
      });
      if (animate) { void tbody.offsetWidth; tbody.classList.add("is-paging"); }
      animate = false;
      fresh = new Set();
      renderPager(list.length, pages);
    }

    const search = h("input", { class: "da-input", type: "search", placeholder: "Номер обращения или текст", value: filter.q, "aria-label": "Поиск" });
    let t;
    search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { filter.q = search.value; view.page = 1; render(); }, 200); });

    wrap.append(
      h("table", { class: "da-table da-registry" },
        h("thead", {}, h("tr", {},
          h("th", {}, "№"), h("th", {}, "Дата и время"), h("th", {}, "Язык"), h("th", {}, "Канал"),
          h("th", {}, "С чем обратились"), h("th", {}, "Длительность"), h("th", {}, "Итог"), h("th", {}, h("span", { class: "da-sr" }, "Отметки")))),
        tbody),
      pager);
    root.append(h("div", { class: "da-page" },
      h("div", { class: "da-page-head" },
        h("h1", { class: "da-h1", tabindex: -1 }, "Обращения"), counter,
        h("button", { class: "da-btn is-primary da-head-action", onclick: () => DA.openUpload(render) }, DA.icon("upload"), "Загрузить обращения")),
      h("div", { class: "da-toolbar" }, h("div", { class: "da-search" }, DA.icon("search"), search), menu, chips),
      wrap));
    render();
    return () => clearTimeout(t);
  };
})();
