/* Апелляции аналитика и строка апелляции, общая с экраном «Решённые» проверяющего. */
(function () {
  const DA = window.DA, h = DA.h;
  const m = (key, params) => DA.msg("pages." + key, params);
  DA.i18n.addMessages({
    "pages.pending": { ru: "На рассмотрении, подана {time}", kk: "Қаралуда, {time} берілді", en: "Under review, submitted {time}" },
    "pages.changed": { ru: "Оценка изменена, {time}", kk: "Баға өзгертілді, {time}", en: "Score changed, {time}" },
    "pages.confirmed": { ru: "Оценка подтверждена, {time}", kk: "Баға расталды, {time}", en: "Score confirmed, {time}" },
    "pages.reviewerDecision": { ru: "Решение проверяющего", kk: "Тексерушінің шешімі", en: "Reviewer decision" },
    "pages.appeals": { ru: "Апелляции", kk: "Апелляциялар", en: "Appeals" },
    "pages.noOpen": { ru: "Открытых апелляций нет", kk: "Ашық апелляциялар жоқ", en: "No open appeals" },
    "pages.noResolved": { ru: "Решённых апелляций пока нет", kk: "Әзірге шешілген апелляциялар жоқ", en: "No resolved appeals yet" },
    "pages.noOpenHelp": { ru: "Если не согласны с оценкой, откройте обращение и нажмите «Оспорить оценку» у нужного критерия.", kk: "Бағамен келіспесеңіз, өтінішті ашып, қажетті критерийдің «Бағаға шағымдану» түймесін басыңыз.", en: "If you disagree with a score, open the conversation and select “Appeal score” for that criterion." },
    "pages.noResolvedHelp": { ru: "Когда проверяющий разберёт апелляцию, здесь появится его решение с причиной.", kk: "Тексеруші апелляцияны қарағаннан кейін оның шешімі мен себебі осында көрсетіледі.", en: "Once a reviewer resolves an appeal, their decision and reason appear here." },
    "pages.backToList": { ru: "К списку обращений", kk: "Өтініштер тізіміне", en: "Back to conversations" },
    "pages.openCount": { ru: "Открытые {count}", kk: "Ашық {count}", en: "Open {count}" },
    "pages.resolvedCount": { ru: "Решённые {count}", kk: "Шешілген {count}", en: "Resolved {count}" },
    "pages.status": { ru: "Статус", kk: "Күй", en: "Status" }
  });
  let appealsTab = "open";

  /* Строка апелляции: обращение, критерий, ответ модели и что с ним стало. opts.comment показывает комментарий аналитика. */
  DA.appealRow = function (a, opts) {
    const { ev, c, conv } = DA.data.appealContext(a);
    const open = a.status === "open";
    const target = open ? a.proposedAnswer : a.status === "changed" ? a.decision.newAnswer : null;
    const status = m(open ? "pending" : a.status === "changed" ? "changed" : "confirmed", () => ({
      time: open ? DA.fmt.ago(Math.round((Date.now() - a.createdAt) / 60000)) : DA.fmt.dateTime(a.decision.decidedAt)
    }));
    const query = new URLSearchParams({ criterion: a.criterionId, evaluation: ev.id });
    return h("a", { class: "da-list-row ap-row", href: `#/c/${encodeURIComponent(a.conversationId)}?${query}` },
      h("div", {}, h("div", { class: "da-num" }, `№ ${DA.convNumber(a.conversationId)}`), h("div", { class: "da-small da-muted" }, DA.msg(() => `${DA.langLabel[conv.language]}, ${DA.channelLabel(conv).toLocaleLowerCase(DA.fmt.locale())}`))),
      h("div", { class: "ap-main" },
        h("b", {}, c.title),
        opts.comment ? h("p", {}, a.comment) : null,
        open ? null : h("p", { class: "ap-reason" }, h("span", {}, m("reviewerDecision")), a.decision.reason)),
      h("div", { class: "ap-side" },
        h("div", { class: "ap-pills" }, DA.answerPill(a.originalAnswer, c), target != null ? [DA.icon("chevron", 14), DA.answerPill(target, c)] : null),
        h("span", { class: "da-small da-muted" }, status)));
  };

  DA.views.appeals = function mount(root, params = {}) {
    if (["open", "done"].includes(params.query?.status)) appealsTab = params.query.status;
    const list = h("div", { class: "da-list" });
    const head = h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, m("appeals")));

    function render() {
      const shown = DA.state.appeals
        .filter((a) => (appealsTab === "open" ? a.status === "open" : a.status !== "open"))
        .sort((a, b) => (appealsTab === "open" ? b.createdAt - a.createdAt : b.decision.decidedAt - a.decision.decidedAt));
      if (!shown.length) {
        list.replaceChildren(h("div", { class: "da-empty" },
          h("h2", {}, m(appealsTab === "open" ? "noOpen" : "noResolved")),
          h("p", {}, m(appealsTab === "open" ? "noOpenHelp" : "noResolvedHelp")),
          h("a", { class: "da-btn", href: "#/" }, m("backToList"))));
        return;
      }
      list.replaceChildren(...shown.map((a) => DA.appealRow(a, { comment: true })));
    }
    const open = DA.openAppeals().length;
    const seg = DA.segmented([{ value: "open", label: m("openCount", { count: open }) }, { value: "done", label: m("resolvedCount", { count: DA.state.appeals.length - open }) }], appealsTab, (v) => { appealsTab = v; render(); }, m("status"));
    head.append(seg);
    root.append(h("div", { class: "da-page", style: { maxWidth: "1040px" } }, head, list));
    render();
  };
})();
