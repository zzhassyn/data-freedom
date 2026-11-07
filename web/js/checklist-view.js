/* Чек-лист как документ: доли в итоге, правила и история сохранённых версий. */
(function () {
  const DA = window.DA, h = DA.h;
  const byOrder = (a, b) => a.order - b.order;
  const contentFields = ["title", "description", "type", "naAllowed", "naCondition", "scale", "flagTypes"];
  const changed = (a, b, field) => JSON.stringify(a[field] ?? null) !== JSON.stringify(b[field] ?? null);

  /* Одни и те же изменения используются в истории, сохранении и применении версии. */
  DA.checklistChanges = function (next, previous) {
    const before = new Map((previous?.criteria || []).map((c) => [c.id, c]));
    const after = new Map((next?.criteria || []).map((c) => [c.id, c]));
    const rows = [];
    for (const c of next?.criteria || []) {
      const old = before.get(c.id);
      if (!old) { rows.push({ criterionId: c.id, title: c.title, kind: "added", label: "Добавлен", fields: [], before: null, after: c }); continue; }
      const fields = [...contentFields, "weight", "sectionId", "order"].filter((field) => changed(c, old, field));
      if (fields.some((field) => contentFields.includes(field))) rows.push({ criterionId: c.id, title: c.title, kind: "rule", label: "Изменено правило", fields, before: old, after: c });
      if (fields.includes("weight")) rows.push({ criterionId: c.id, title: c.title, kind: "weight", label: "Изменён вес", fields: ["weight"], before: old, after: c });
      if (fields.includes("sectionId")) rows.push({ criterionId: c.id, title: c.title, kind: "section", label: "Изменён раздел", fields: ["sectionId"], before: old, after: c });
      else if (fields.includes("order")) rows.push({ criterionId: c.id, title: c.title, kind: "order", label: "Изменён порядок", fields: ["order"], before: old, after: c });
    }
    for (const c of previous?.criteria || []) if (!after.has(c.id)) rows.push({ criterionId: c.id, title: c.title, kind: "removed", label: "Удалён", fields: [], before: c, after: null });
    return rows;
  };

  /* Целые доли в документе в сумме дают 100, даже если исходные веса другие. */
  DA.checklistShares = function (cl) {
    const weighted = cl.criteria.filter((c) => c.type !== "flag" && Number(c.weight) > 0);
    const total = weighted.reduce((sum, c) => sum + Number(c.weight), 0);
    const portions = weighted.map((c, index) => {
      const exact = total ? Number(c.weight) / total * 100 : 0;
      return { id: c.id, exact, value: Math.floor(exact), index };
    });
    let remainder = total ? 100 - portions.reduce((sum, item) => sum + item.value, 0) : 0;
    for (const item of [...portions].sort((a, b) => (b.exact - b.value) - (a.exact - a.value) || a.index - b.index)) {
      if (remainder-- <= 0) break;
      item.value++;
    }
    const criteria = Object.fromEntries(portions.map((item) => [item.id, item.value]));
    const sections = Object.fromEntries(cl.sections.map((section) => [section.id, cl.criteria.filter((c) => c.sectionId === section.id).reduce((sum, c) => sum + (criteria[c.id] || 0), 0)]));
    return { criteria, sections, total };
  };

  DA.checklistRibbon = function (cl, opts) {
    const options = opts || {}, shares = DA.checklistShares(cl);
    const weighted = cl.criteria.filter((c) => c.type !== "flag" && Number(c.weight) > 0);
    const ribbon = DA.ribbon(weighted.map((c) => ({ c: { ...c, type: "binary" }, answer: "yes", status: "done", fraction: 1,
      effectiveWeight: Number(c.weight) / shares.total * 100, points: Number(c.weight) / shares.total * 100 })), {
      interactive: !!options.onFocus,
      onHover: (id) => options.onFocus?.(id),
      onClick: (id) => options.onSelect?.(id)
    });
    ribbon.classList.add("cl-ribbon");
    ribbon.setAttribute("aria-label", "Доли критериев в итоговых 100 баллах");
    for (const segment of ribbon.children) {
      const c = weighted.find((item) => item.id === segment.dataset.id);
      const text = `${c.title || "Новый критерий"}: ${shares.criteria[c.id]} % итога`;
      segment.removeAttribute("title");
      if (options.onSelect) {
        segment.setAttribute("tabindex", "0");
        segment.setAttribute("role", "button");
        segment.setAttribute("aria-label", text);
        segment.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); options.onSelect(c.id); } });
      }
      segment.addEventListener("focus", () => options.onFocus?.(c.id));
      segment.addEventListener("blur", () => options.onFocus?.(null));
      DA.hoverCard(segment, () => h("p", { class: "cl-ribbon-tip" }, text));
    }
    if (options.selected) ribbon.light(options.selected);
    return ribbon;
  };

  DA.views.checklistView = function mount(root, params) {
    let viewing = DA.checklist(Number(params?.query?.version)) || DA.activeChecklist() || DA.state.checklists[0];
    let busy = false, receipt = "", error = "", disposed = false;
    const page = h("div", { class: "da-page cl-document" });
    root.append(page);

    function card(c, share) {
      const node = h("article", { class: "cl-criterion", "data-criterion": c.id },
        h("div", { class: "cl-criterion-head" }, h("h3", { tabindex: -1 }, c.title),
          c.type !== "flag" ? h("span", { class: "cl-share" }, `${share || 0} % итога`) : null),
        h("p", { class: "cl-rule" }, c.description),
        h("p", { class: "cl-answer" }, c.type === "flag" ? "Отмечается как нарушение, на итог не влияет" : c.type === "scale" ? `Ответ: баллы от 0 до ${DA.scaleMax(c)}` : "Ответ: да или нет",
          c.naAllowed ? `. Не применяется, если ${(c.naCondition || "").replace(/^./, (letter) => letter.toLocaleLowerCase("ru-RU"))}` : ""));
      if (c.type === "scale") {
        const list = h("ol", { class: "cl-scale", hidden: true }, c.scale.map((step) => h("li", {}, h("b", {}, step.value), h("span", {}, step.description))));
        const button = h("button", { class: "cl-scale-toggle", type: "button", "aria-expanded": "false", onclick: () => {
          list.hidden = !list.hidden;
          button.setAttribute("aria-expanded", String(!list.hidden));
        } }, DA.icon("chevron", 14), "Ступени шкалы");
        node.append(button, list);
      }
      return node;
    }

    function historyRow(cl) {
      const base = DA.checklist(cl.basedOnVersion) || DA.state.checklists.filter((entry) => entry.version < cl.version).at(-1);
      const names = [...new Set(DA.checklistChanges(cl, base).map((item) => item.title))];
      const initial = cl.version === 1 && !cl.basedOnVersion;
      const row = h("li", { class: "cl-version", "data-version": cl.version },
        h("div", { class: "cl-version-copy" },
          h("div", { class: "cl-version-name" }, h("b", {}, `Версия ${cl.version}`), cl.isActive ? h("span", { class: "cl-active" }, "активна") : null,
            !initial ? h("span", { class: "cl-version-time" }, DA.fmt.dateTime(cl.createdAt).toLocaleLowerCase("ru-RU")) : null),
          h("p", {}, initial ? "Исходная из задания" : names.length ? `Изменено: ${names.join(", ")}` : "Правила критериев не изменились")),
        h("div", { class: "cl-version-actions" },
          cl.version !== viewing.version ? h("a", { class: "da-btn is-sm", href: `#/checklists?version=${cl.version}` }, "Посмотреть") : h("span", { class: "cl-current" }, "Открыта сейчас"),
          !cl.isActive ? h("button", { class: "da-btn is-sm", type: "button", disabled: busy, onclick: () => activate(cl) }, "Сделать активной") : null,
          !cl.isActive || cl.version > 1 ? h("a", { class: "da-btn is-text is-sm", href: `#/checklists/apply/${cl.version}` }, "Применить к обращениям") : null));
      return row;
    }

    async function activate(cl) {
      if (busy) return;
      busy = true; error = ""; receipt = ""; render();
      try {
        viewing = await DA.data.activateChecklist(cl.version);
        receipt = `Версия ${viewing.version} стала активной. Новые оценки пойдут по её правилам.`;
        history.replaceState(null, "", `#/checklists?version=${viewing.version}`);
      } catch (e) { error = e.message || "Не удалось сделать версию активной. Попробуйте ещё раз"; }
      finally { busy = false; if (!disposed) render(); }
    }

    function render() {
      if (!viewing) {
        page.replaceChildren(h("div", { class: "da-empty" }, h("h1", { class: "da-h1" }, "Чек-лист не найден"), h("p", {}, "Не удалось получить правила оценки."),
          h("button", { class: "da-btn is-primary", type: "button", onclick: () => DA.route() }, "Повторить")));
        return;
      }
      const shares = DA.checklistShares(viewing), cards = new Map();
      const sections = [...viewing.sections].sort(byOrder).map((section) => {
        const criteria = viewing.criteria.filter((c) => c.sectionId === section.id).sort(byOrder);
        if (!criteria.length) return null;
        const weighted = criteria.some((c) => c.type !== "flag");
        return h("section", { class: "cl-section", "aria-label": section.title },
          h("div", { class: "cl-section-head" }, h("h2", {}, section.title), h("span", {}, weighted ? `${shares.sections[section.id]} % итога` : "отдельно от итога")),
          h("div", { class: "cl-criteria" }, criteria.map((c) => { const node = card(c, shares.criteria[c.id]); cards.set(c.id, node); return node; })));
      });
      const ribbon = DA.checklistRibbon(viewing, {
        onFocus(id) { for (const [key, node] of cards) node.classList.toggle("is-lit", key === id); },
        onSelect(id) { const node = cards.get(id); node?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); node?.querySelector("h3").focus({ preventScroll: true }); }
      });
      page.replaceChildren(
        h("div", { class: "cl-document-head" }, h("h1", { class: "da-h1", tabindex: -1 }, "Чек-лист"),
          h("a", { class: "da-btn is-primary", href: `#/checklists/edit?version=${viewing.version}` }, "Изменить чек-лист")),
        h("p", { class: "cl-document-meta" }, `Версия ${viewing.version}, сохранена ${DA.fmt.dateTime(viewing.createdAt).toLocaleLowerCase("ru-RU")}. ${viewing.criteria.length} ${DA.fmt.plural(viewing.criteria.length, ["критерий", "критерия", "критериев"])}${shares.total ? ", итог из 100 баллов." : ". Нарушения отмечаются отдельно."}`),
        ribbon, h("div", { class: "cl-sections" }, sections),
        h("section", { class: "cl-history", "aria-label": "История версий" }, h("h2", {}, "История версий"),
          receipt ? h("p", { class: "cl-receipt", role: "status" }, DA.icon("check", 16), receipt) : null,
          error ? h("p", { class: "da-error", role: "alert" }, error) : null,
          busy ? h("p", { class: "cl-history-pending", role: "status" }, "Меняем активную версию") : null,
          h("ol", { class: "cl-version-list" }, [...DA.state.checklists].sort((a, b) => b.version - a.version).map(historyRow))));
    }
    render();
    return () => { disposed = true; };
  };
})();
