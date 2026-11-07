/* Реестр диалогов: загрузка набора, фильтры, итоги с мини-лентой. */
(function () {
  const DA = window.DA, h = DA.h;
  const filter = { lang: "all", channel: "all", state: "all", q: "" };

  DA.views = DA.views || {};
  DA.views.registry = function mount(root) {
    const records = Object.values(DA.state.conversations);
    const tbody = h("tbody");
    const counter = h("span", { class: "da-muted" });

    function rows() {
      const q = filter.q.trim().toLowerCase();
      return records.filter((r) => {
        if (filter.lang !== "all" && r.language !== filter.lang) return false;
        if (filter.channel === "chat" && r.channel !== "agent chat") return false;
        if (filter.channel === "call" && r.channel !== "voice call") return false;
        const ev = DA.state.evaluations[r.conversation_id];
        if (filter.state === "done" && !ev) return false;
        if (filter.state === "new" && ev) return false;
        if (filter.state === "appeal" && !DA.state.appeals.some((a) => a.conversationId === r.conversation_id)) return false;
        if (q && !r.conversation_id.toLowerCase().includes(q) && !r.transcript.some((t) => t.text.toLowerCase().includes(q))) return false;
        return true;
      });
    }

    function scoreCell(r) {
      const ev = DA.state.evaluations[r.conversation_id];
      if (!ev) return h("span", { class: "da-quiet" }, "Не оценён");
      const items = ev.items.map((i) => ({ ...i, c: DA.criterionById(DA_CHECKLIST, i.criterionId) }));
      return h("div", { class: "da-score-cell" },
        h("span", { class: "da-score-num" }, DA.fmt.score(ev.total),
          ev.originalTotal !== ev.total ? h("s", {}, DA.fmt.score(ev.originalTotal)) : null),
        DA.ribbon(items, { mini: true }));
    }

    function render() {
      const list = rows();
      const evaluated = records.filter((r) => DA.state.evaluations[r.conversation_id]).length;
      counter.textContent = `${records.length} ${DA.fmt.plural(records.length, ["диалог", "диалога", "диалогов"])}, оценено ${evaluated}`;
      tbody.replaceChildren();
      if (!list.length) {
        tbody.append(h("tr", { class: "da-empty-row" }, h("td", { colspan: 8 },
          h("div", {}, "Под эти фильтры ничего не подходит"),
          h("button", { class: "da-btn is-text", onclick: () => { Object.assign(filter, { lang: "all", channel: "all", state: "all", q: "" }); DA.route(); } }, "Сбросить фильтры"))));
        return;
      }
      for (const r of list) {
        const cid = r.conversation_id;
        const appeals = DA.state.appeals.filter((a) => a.conversationId === cid);
        const open = appeals.some((a) => a.status === "open");
        const ev = DA.state.evaluations[cid];
        const tr = h("tr", { tabindex: 0, onclick: () => (location.hash = `#/c/${cid}`), onkeydown: (e) => e.key === "Enter" && (location.hash = `#/c/${cid}`) },
          h("td", { class: "da-id" }, cid),
          h("td", {}, h("span", { class: "da-chip" }, r.language)),
          h("td", {}, h("span", { class: "da-chip", title: r.channel === "voice call" ? "Звонок" : "Чат" },
            DA.icon(r.channel === "voice call" ? "phone" : "message"), r.channel === "voice call" ? "Звонок" : "Чат")),
          h("td", {}, h("div", { class: "da-preview" }, DA.tx.preview(r))),
          h("td", { class: "c-turns da-muted" }, r.transcript.length),
          h("td", { class: "da-muted" }, DA.fmt.duration(DA.tx.duration(r))),
          h("td", {}, scoreCell(r)),
          h("td", {},
            ev && ev.grossFlagged ? h("span", { class: "da-flag", title: "Грубая ошибка" }, DA.icon("flag")) : null,
            appeals.length ? h("span", { class: `da-pill ${open ? "t-partial" : "t-pending"}` }, open ? "Апелляция" : "Решена") : null));
        tbody.append(tr);
      }
    }

    const groupInput = h("input", { class: "da-input", value: "DEV", "aria-label": "group_id набора" });
    const loadBtn = h("button", { class: "da-btn", onclick: () => DA.toast(`Набор ${groupInput.value.trim() || "DEV"} загружен: ${records.length} диалогов, новых 0`, loadBtn) }, DA.icon("upload"), "Загрузить набор");
    const search = h("input", { class: "da-input", type: "search", placeholder: "Найти по ID или тексту", value: filter.q });
    let t;
    search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { filter.q = search.value; render(); }, 200); });

    root.append(h("div", { class: "da-page" },
      h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, "Диалоги"), counter),
      h("div", { class: "da-toolbar" },
        h("div", { class: "da-load" }, h("label", { class: "da-field" }, h("span", {}, "group_id"), groupInput), loadBtn),
        DA.segmented([{ value: "all", label: "Все" }, { value: "RU", label: "RU" }, { value: "KZ", label: "KZ" }, { value: "EN", label: "EN" }], filter.lang, (v) => { filter.lang = v; render(); }, "Язык"),
        DA.segmented([{ value: "all", label: "Все каналы" }, { value: "chat", label: "Чаты" }, { value: "call", label: "Звонки" }], filter.channel, (v) => { filter.channel = v; render(); }, "Канал"),
        DA.segmented([{ value: "all", label: "Все" }, { value: "done", label: "Оценённые" }, { value: "new", label: "Без оценки" }, { value: "appeal", label: "С апелляцией" }], filter.state, (v) => { filter.state = v; render(); }, "Состояние"),
        h("div", { class: "da-search da-toolbar-end" }, DA.icon("search"), search)),
      h("div", { class: "da-table-wrap" },
        h("table", { class: "da-table" },
          h("thead", {}, h("tr", {},
            h("th", {}, "ID"), h("th", {}, "Язык"), h("th", {}, "Канал"), h("th", {}, "Первая реплика клиента"),
            h("th", { class: "c-turns" }, "Реплик"), h("th", {}, "Длительность"), h("th", {}, "Итог"), h("th", {}, h("span", { class: "da-sr" }, "Отметки")))),
          tbody))));
    render();
  };
})();
