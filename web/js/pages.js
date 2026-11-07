/* Очередь апелляций, чек-лист, сводка. */
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
          h("a", { class: "da-btn", href: "#/" }, "К списку диалогов")));
        return;
      }
      for (const a of shown) {
        const c = DA.criterionById(DA_CHECKLIST, a.criterionId);
        const conv = DA.state.conversations[a.conversationId];
        const min = Math.round((Date.now() - a.createdAt) / 60000);
        list.append(h("a", { class: "da-list-row", href: `#/c/${a.conversationId}?criterion=${a.criterionId}${a.status === "open" ? `&decide=${a.id}` : ""}` },
          h("div", {}, h("div", { class: "da-id" }, a.conversationId), h("div", { class: "da-small da-muted" }, `${conv.language}, ${conv.channel === "voice call" ? "звонок" : "чат"}`)),
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

  DA.views.checklists = function mount(root) {
    const cl = DA_CHECKLIST;
    const items = cl.criteria.map((c) => ({ c, status: "done", answer: c.type === "scale" ? DA.scaleMax(c) : "yes", fraction: 1, effectiveWeight: c.weight }));
    const typeLabel = (c) => (c.type === "scale" ? `Шкала ${Math.min(...c.scale.map((s) => s.value))}–${DA.scaleMax(c)}` : c.type === "flag" ? "Флаг без баллов" : "Да / Нет");
    const body = h("div", { class: "da-list" });
    for (const s of cl.sections) {
      body.append(h("div", { class: "da-section-head", style: { padding: "16px 18px 4px" } }, h("h3", {}, s.title)));
      for (const c of cl.criteria.filter((x) => x.sectionId === s.id)) {
        body.append(h("div", { class: "da-cl-crit" },
          h("h3", {}, c.title),
          h("div", { style: { display: "flex", gap: "6px" } },
            h("span", { class: "da-chip" }, typeLabel(c)),
            c.weight ? h("span", { class: "da-chip" }, `вес ${c.weight}`) : null,
            c.naAllowed ? h("span", { class: "da-chip" }, "N/A разрешён") : null),
          h("p", {}, c.description),
          c.naAllowed ? h("p", {}, `N/A: ${c.naCondition}`) : null));
      }
    }
    root.append(h("div", { class: "da-page", style: { maxWidth: "1040px" } },
      h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, "Чек-лист, версия 1"), h("span", { class: "da-pill t-yes" }, "активная")),
      h("div", { class: "da-cl-grid" },
        h("div", { style: { display: "grid", gap: "8px" } }, h("div", { class: "da-label" }, "Вклад критериев в 100 баллов"), DA.ribbon(items)),
        body)));
  };

  DA.views.insights = function mount(root) {
    root.append(h("div", { class: "da-page" },
      h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, "Сводка")),
      h("div", { class: "da-list" }, h("div", { class: "da-empty" },
        h("div", { class: "da-empty-ribbon", "aria-hidden": "true" }, DA_CHECKLIST.criteria.filter((c) => c.weight).map((c) => h("i", { style: { "--w": c.weight } }))),
        h("h2", {}, "Сводка появится, когда будет оценён весь набор"),
        h("p", {}, "Здесь будут критерии по языкам, распределение итогов, рейтинг операторов и точность против ручной разметки."),
        h("a", { class: "da-btn", href: "#/" }, "К списку диалогов")))));
  };
})();
