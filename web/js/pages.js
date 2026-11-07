/* Очередь апелляций. */
(function () {
  const DA = window.DA, h = DA.h;
  let appealsTab = "open";

  DA.views.appeals = function mount(root) {
    const list = h("div", { class: "da-list" });
    const head = h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, "Апелляции"));
    const roleNote = h("div", {});

    function render() {
      const all = DA.state.appeals.slice().sort((a, b) => (a.status === "open" ? a.createdAt - b.createdAt : b.decision.decidedAt - a.decision.decidedAt));
      const shown = all.filter((a) => (appealsTab === "open" ? a.status === "open" : a.status !== "open"));
      roleNote.replaceChildren();
      if (DA.state.role !== "reviewer" && appealsTab === "open" && shown.length) {
        roleNote.append(h("div", { class: "da-history", style: { marginBottom: "16px", alignItems: "center" } },
          h("span", {}, "Решение по апелляции принимает проверяющий."),
          h("button", { class: "da-btn is-sm", onclick: () => DA.setRole("reviewer") }, "Переключить на проверяющего")));
      }
      list.replaceChildren();
      if (!shown.length) {
        list.append(h("div", { class: "da-empty" },
          h("h2", {}, appealsTab === "open" ? "Открытых апелляций нет" : "Решённых апелляций пока нет"),
          h("p", {}, "Апелляции подаются из карточки диалога кнопкой «Оспорить оценку»."),
          h("a", { class: "da-btn", href: "#/" }, "К списку обращений")));
        return;
      }
      for (const a of shown) {
        const c = DA.criterionById(DA.checklist(DA.state.evaluations[a.conversationId].checklistVersion), a.criterionId);
        const conv = DA.state.conversations[a.conversationId];
        const min = Math.round((Date.now() - a.createdAt) / 60000);
        list.append(h("a", { class: "da-list-row", href: `#/c/${a.conversationId}?criterion=${a.criterionId}${a.status === "open" ? `&decide=${a.id}` : ""}` },
          h("div", {}, h("div", { class: "da-num" }, `№ ${DA.convNumber(a.conversationId)}`), h("div", { class: "da-small da-muted" }, `${DA.langLabel[conv.language]}, ${DA.channelLabel(conv).toLowerCase()}`)),
          h("div", {}, h("b", { style: { fontWeight: 600 } }, c.title), h("p", {}, a.comment)),
          h("div", { style: { display: "grid", justifyItems: "end", gap: "4px" } },
            h("div", { style: { display: "flex", gap: "6px", alignItems: "center" } },
              DA.answerPill(a.originalAnswer, c),
              a.status === "open" && a.proposedAnswer != null ? [DA.icon("chevron", 14), DA.answerPill(a.proposedAnswer, c)] : null,
              a.status === "changed" ? [DA.icon("chevron", 14), DA.answerPill(a.decision.newAnswer, c)] : null),
            h("span", { class: "da-small da-muted" }, a.status === "open" ? `подана ${DA.fmt.ago(min)}` : a.status === "changed" ? "оценка изменена" : "оценка подтверждена"))));
      }
    }
    const counts = () => ({ open: DA.openAppeals().length, done: DA.state.appeals.length - DA.openAppeals().length });
    const seg = DA.segmented([{ value: "open", label: `Открытые ${counts().open}` }, { value: "done", label: `Решённые ${counts().done}` }], appealsTab, (v) => { appealsTab = v; render(); }, "Статус");
    head.append(seg);
    root.append(h("div", { class: "da-page", style: { maxWidth: "1040px" } }, head, roleNote, list));
    render();
  };

})();
