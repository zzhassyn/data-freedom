/* Реестр обращений: поиск, фильтры, загрузка, итог с разбором при наведении. */
(function () {
  const DA = window.DA, h = DA.h;

  const GROUPS = [
    { key: "lang", title: "Язык", options: [{ value: "RU", label: "Русский" }, { value: "KZ", label: "Казахский" }, { value: "EN", label: "Английский" }] },
    { key: "channel", title: "Канал", options: [{ value: "agent chat", label: "Чаты" }, { value: "voice call", label: "Звонки" }] },
    { key: "state", title: "Состояние", options: [
      { value: "done", label: "Оценено" }, { value: "new", label: "Без оценки" },
      { value: "appeal", label: "Есть апелляция" }, { value: "review", label: "Стоит проверить вручную" }, { value: "gross", label: "Грубая ошибка" }] }
  ];
  const filter = { lang: new Set(), channel: new Set(), state: new Set(), q: "" };

  function matchesState(cid) {
    if (!filter.state.size) return true;
    const ev = DA.state.evaluations[cid];
    const checks = {
      done: () => !!ev,
      new: () => !ev,
      appeal: () => DA.state.appeals.some((a) => a.conversationId === cid),
      review: () => !!ev && ev.items.some((i) => i.needsReview),
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

  function scoreCell(cid) {
    const ev = DA.state.evaluations[cid];
    if (!ev) return h("span", { class: "da-quiet" }, "Не оценено");
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

  function uploadDrawer(records) {
    const code = h("input", { class: "da-input", value: "DEV" });
    const drop = h("label", { class: "da-drop" },
      h("input", { type: "file", accept: ".json,application/json", class: "da-sr" }),
      DA.icon("upload"), h("b", {}, "Перетащите файл с диалогами"), h("span", { class: "da-small da-muted" }, "или нажмите, чтобы выбрать JSON"));
    const d = DA.drawer({
      title: "Загрузить диалоги",
      body: [
        h("div", { class: "da-block" },
          h("label", { class: "da-field" }, h("span", {}, "Код набора от организаторов"), code),
          h("button", { class: "da-btn is-primary", onclick: (e) => { DA.toast(`Набор ${code.value.trim() || "DEV"} загружен: ${records.length} обращений, новых 0`, e.currentTarget); } }, "Загрузить набор")),
        h("div", { class: "da-or" }, h("span", {}, "или")),
        drop]
    });
    drop.querySelector("input").addEventListener("change", () => { d.close(); DA.toast("Файл принят, новые обращения появятся в списке"); });
  }

  DA.views = DA.views || {};
  DA.views.registry = function mount(root) {
    const records = Object.values(DA.state.conversations);
    const tbody = h("tbody");
    const counter = h("span", { class: "da-muted" });
    const chips = h("div", { class: "da-active-filters" });
    const menu = DA.filterMenu(GROUPS, filter, render);

    function renderChips() {
      chips.replaceChildren();
      for (const g of GROUPS) for (const v of filter[g.key]) {
        const o = g.options.find((x) => x.value === v);
        chips.append(h("button", { class: "da-filter-chip", type: "button", onclick: () => { filter[g.key].delete(v); menu.refresh(); render(); } }, o.label, DA.icon("x", 14)));
      }
      if (chips.children.length > 1) chips.append(h("button", { class: "da-btn is-text is-sm", onclick: reset }, "Сбросить все"));
    }
    function reset() {
      GROUPS.forEach((g) => filter[g.key].clear());
      filter.q = "";
      search.value = "";
      menu.refresh();
      render();
    }

    function render() {
      const list = visible(records);
      const evaluated = records.filter((r) => DA.state.evaluations[r.conversation_id]).length;
      counter.textContent = `${records.length} ${DA.fmt.plural(records.length, ["обращение", "обращения", "обращений"])}, оценено ${evaluated}`;
      renderChips();
      tbody.replaceChildren();
      if (!list.length) {
        tbody.append(h("tr", { class: "da-empty-row" }, h("td", { colspan: 8 },
          h("div", {}, "Под эти условия ничего не подходит"),
          h("button", { class: "da-btn is-text", onclick: reset }, "Сбросить фильтры"))));
        return;
      }
      for (const r of list) {
        const cid = r.conversation_id;
        const open = () => (location.hash = `#/c/${cid}`);
        tbody.append(h("tr", { tabindex: 0, onclick: open, onkeydown: (e) => e.key === "Enter" && open() },
          h("td", { class: "da-num", title: cid }, DA.convNumber(cid)),
          h("td", { class: "da-muted da-nowrap" }, DA.fmt.dateTime(DA.tx.startedAt(r))),
          h("td", {}, DA.langLabel[r.language]),
          h("td", {}, h("span", { class: "da-channel" }, DA.icon(r.channel === "voice call" ? "phone" : "message", 16), DA.channelLabel(r))),
          h("td", {}, h("div", { class: "da-preview" }, DA.tx.preview(r))),
          h("td", { class: "da-muted" }, DA.fmt.duration(DA.tx.duration(r))),
          h("td", {}, scoreCell(cid)),
          h("td", {}, marks(cid))));
      }
    }

    const search = h("input", { class: "da-input", type: "search", placeholder: "Номер обращения или текст", value: filter.q, "aria-label": "Поиск" });
    let t;
    search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { filter.q = search.value; render(); }, 200); });

    root.append(h("div", { class: "da-page" },
      h("div", { class: "da-page-head" },
        h("h1", { class: "da-h1", tabindex: -1 }, "Обращения"), counter,
        h("button", { class: "da-btn is-primary da-head-action", onclick: () => uploadDrawer(records) }, DA.icon("upload"), "Загрузить диалоги")),
      h("div", { class: "da-toolbar" }, h("div", { class: "da-search" }, DA.icon("search"), search), menu, chips),
      h("div", { class: "da-table-wrap" },
        h("table", { class: "da-table" },
          h("thead", {}, h("tr", {},
            h("th", {}, "№"), h("th", {}, "Дата и время"), h("th", {}, "Язык"), h("th", {}, "Канал"),
            h("th", {}, "С чем обратились"), h("th", {}, "Длительность"), h("th", {}, "Итог"), h("th", {}, h("span", { class: "da-sr" }, "Отметки")))),
          tbody))));
    render();
  };
})();
