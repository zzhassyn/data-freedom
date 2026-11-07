/* Апелляции аналитика и строка апелляции, общая с экраном «Решённые» проверяющего. */
(function () {
  const DA = window.DA, h = DA.h;
  let appealsTab = "open";

  /* Строка апелляции: обращение, критерий, ответ модели и что с ним стало. opts.comment показывает комментарий аналитика. */
  DA.appealRow = function (a, opts) {
    const { ev, c, conv } = DA.data.appealContext(a);
    const open = a.status === "open";
    const target = open ? a.proposedAnswer : a.status === "changed" ? a.decision.newAnswer : null;
    const status = open ? `На рассмотрении, подана ${DA.fmt.ago(Math.round((Date.now() - a.createdAt) / 60000))}`
      : `${a.status === "changed" ? "Оценка изменена" : "Оценка подтверждена"}, ${DA.fmt.dateTime(a.decision.decidedAt).toLowerCase()}`;
    const query = new URLSearchParams({ criterion: a.criterionId, evaluation: ev.id });
    return h("a", { class: "da-list-row ap-row", href: `#/c/${encodeURIComponent(a.conversationId)}?${query}` },
      h("div", {}, h("div", { class: "da-num" }, `№ ${DA.convNumber(a.conversationId)}`), h("div", { class: "da-small da-muted" }, `${DA.langLabel[conv.language]}, ${DA.channelLabel(conv).toLowerCase()}`)),
      h("div", { class: "ap-main" },
        h("b", {}, c.title),
        opts.comment ? h("p", {}, a.comment) : null,
        open ? null : h("p", { class: "ap-reason" }, h("span", {}, "Решение проверяющего"), a.decision.reason)),
      h("div", { class: "ap-side" },
        h("div", { class: "ap-pills" }, DA.answerPill(a.originalAnswer, c), target != null ? [DA.icon("chevron", 14), DA.answerPill(target, c)] : null),
        h("span", { class: "da-small da-muted" }, status)));
  };

  DA.views.appeals = function mount(root) {
    const list = h("div", { class: "da-list" });
    const head = h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, "Апелляции"));

    function render() {
      const shown = DA.state.appeals
        .filter((a) => (appealsTab === "open" ? a.status === "open" : a.status !== "open"))
        .sort((a, b) => (appealsTab === "open" ? b.createdAt - a.createdAt : b.decision.decidedAt - a.decision.decidedAt));
      if (!shown.length) {
        list.replaceChildren(h("div", { class: "da-empty" },
          h("h2", {}, appealsTab === "open" ? "Открытых апелляций нет" : "Решённых апелляций пока нет"),
          h("p", {}, appealsTab === "open" ? "Если не согласны с оценкой, откройте обращение и нажмите «Оспорить оценку» у нужного критерия." : "Когда проверяющий разберёт апелляцию, здесь появится его решение с причиной."),
          h("a", { class: "da-btn", href: "#/" }, "К списку обращений")));
        return;
      }
      list.replaceChildren(...shown.map((a) => DA.appealRow(a, { comment: true })));
    }
    const open = DA.openAppeals().length;
    const seg = DA.segmented([{ value: "open", label: `Открытые ${open}` }, { value: "done", label: `Решённые ${DA.state.appeals.length - open}` }], appealsTab, (v) => { appealsTab = v; render(); }, "Статус");
    head.append(seg);
    root.append(h("div", { class: "da-page", style: { maxWidth: "1040px" } }, head, list));
    render();
  };
})();
