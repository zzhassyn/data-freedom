/* Редактор чек-листа: критерии, веса, тип ответа, шкала, N/A. Сохранение создаёт новую версию. */
(function () {
  const DA = window.DA, h = DA.h;

  const TYPES = [
    { value: "binary", label: "Да / Нет" },
    { value: "scale", label: "Шкала" },
    { value: "flag", label: "Без баллов" }
  ];
  const typeShort = (c) => (c.type === "scale" ? `шкала 0–${DA.scaleMax(c)}` : c.type === "flag" ? "отметка без баллов" : "да / нет");

  function errorsOf(c, all) {
    const e = {};
    if (!c.title.trim()) e.title = "Назовите критерий";
    if (!c.description.trim()) e.description = "Опишите, когда ставится «Да». Модель оценивает именно по этому тексту";
    if (c.type !== "flag" && !(c.weight >= 1 && c.weight <= 100)) e.weight = "Вес от 1 до 100";
    if (c.naAllowed && !(c.naCondition || "").trim()) e.naCondition = "Опишите, когда критерий не применяется";
    if (c.type === "scale") {
      const values = c.scale.map((s) => s.value);
      if (c.scale.length < 2) e.scale = "Нужно минимум две ступени";
      else if (!values.includes(0)) e.scale = "Добавьте ступень 0";
      else if (new Set(values).size !== values.length) e.scale = "Баллы ступеней повторяются";
      else if (c.scale.some((s) => !s.description.trim())) e.scale = "Опишите каждую ступень";
    }
    if (all.filter((x) => x.title.trim() && x.title.trim() === c.title.trim()).length > 1) e.title = "Критерий с таким названием уже есть";
    return e;
  }

  DA.views.checklists = function mount(root, params) {
    let viewing = DA.activeChecklist();
    let draft = structuredClone(viewing);
    let selectedId = draft.criteria[0].id;
    const tree = h("nav", { class: "da-tree", "aria-label": "Критерии" });
    const form = h("div", {});
    const bar = h("div", { class: "da-editor-bar" });
    const versions = h("div", { class: "da-versions" });
    let saving = false, saveError = "", disposed = false;

    const base = () => viewing;
    const sameAsBase = (c) => { const b = base().criteria.find((x) => x.id === c.id); return b && JSON.stringify(b) === JSON.stringify(c); };
    const isDirty = () => JSON.stringify(base().criteria) !== JSON.stringify(draft.criteria);
    const allErrors = () => draft.criteria.length ? draft.criteria.reduce((n, c) => n + Object.keys(errorsOf(c, draft.criteria)).length, 0) : 1;
    const selected = () => draft.criteria.find((c) => c.id === selectedId);

    function renderVersions() {
      versions.replaceChildren(...DA.state.checklists.map((cl) => h("button", {
        class: "da-filter-chip" + (cl.version === viewing.version ? "" : " is-quiet"), type: "button",
        style: cl.version === viewing.version ? {} : { background: "var(--da-surface-2)", color: "var(--da-text-2)" },
        disabled: saving,
        onclick: () => switchVersion(cl)
      }, `Версия ${cl.version}`, cl.isActive ? ", активная" : "")));
    }

    function switchVersion(cl) {
      if (saving || cl.version === viewing.version) return;
      const change = () => {
        viewing = cl; draft = structuredClone(cl); selectedId = draft.criteria[0]?.id;
        saveError = ""; renderAll();
      };
      if (!isDirty()) { change(); return; }
      let modal;
      modal = DA.modal({ title: "Перейти к другой версии", body: h("p", {}, "Несохранённые изменения будут потеряны."),
        foot: h("div", { class: "da-crit-actions" },
          h("button", { class: "da-btn", type: "button", onclick: () => modal.close() }, "Вернуться к правке"),
          h("button", { class: "da-btn is-primary", type: "button", onclick: () => { modal.close(); change(); } }, "Не сохранять")) });
    }

    function renderBar() {
      const weighted = draft.criteria.filter((c) => c.type !== "flag");
      const sum = weighted.reduce((s, c) => s + (Number(c.weight) || 0), 0);
      const preview = DA.computeScores({ ...draft, criteria: draft.criteria.map((c) => ({ ...c, weight: Number(c.weight) || 0 })) },
        Object.fromEntries(draft.criteria.map((c) => [c.id, c.type === "scale" ? DA.scaleMax(c) : "yes"])));
      const ribbon = DA.ribbon(weighted.map((c) => ({ c, status: "done", answer: "yes", fraction: 1, effectiveWeight: preview.items[c.id].effectiveWeight, points: preview.items[c.id].points })));
      const errors = allErrors();
      const save = h("button", { class: "da-btn is-primary" + (saving ? " is-busy" : ""), disabled: saving || !isDirty() || errors > 0 ? true : null, onclick: onSave }, `Сохранить как версию ${Math.max(...DA.state.checklists.map((c) => c.version)) + 1}`);
      if (errors && isDirty()) save.title = `Исправьте ${errors} ${DA.fmt.plural(errors, ["поле", "поля", "полей"])}`;
      bar.replaceChildren(...[
        ribbon,
        h("span", { class: "da-weight-sum" + (sum !== 100 ? " is-warn" : "") },
          sum === 100 ? "Сумма весов 100" : `Сумма весов ${sum}. Итог всё равно считается из 100: веса будут пересчитаны пропорционально`),
        isDirty() ? h("button", { class: "da-btn is-text", disabled: saving, onclick: () => { draft = structuredClone(viewing); if (!selected()) selectedId = draft.criteria[0]?.id; saveError = ""; renderAll(); } }, "Отменить изменения") : null,
        !viewing.isActive && !isDirty() ? h("button", { class: "da-btn" + (saving ? " is-busy" : ""), disabled: saving, onclick: onActivate }, "Сделать активной") : null,
        save,
        saveError ? h("p", { class: "da-error da-save-error", role: "alert" }, saveError) : null].filter(Boolean));
    }

    function renderTree() {
      tree.replaceChildren();
      for (const s of draft.sections) {
        tree.append(h("div", { class: "da-tree-sec" }, s.title));
        for (const c of draft.criteria.filter((x) => x.sectionId === s.id)) {
          const isNew = !base().criteria.some((x) => x.id === c.id);
          const hasErr = Object.keys(errorsOf(c, draft.criteria)).length > 0;
          tree.append(h("button", {
            class: "da-tree-item" + (isNew ? " is-new" : !sameAsBase(c) ? " is-changed" : ""), type: "button", disabled: saving,
            "aria-current": String(c.id === selectedId), onclick: () => { selectedId = c.id; renderTree(); renderForm(); }
          },
            h("span", { style: hasErr ? { color: "var(--da-no-ink)" } : {} }, c.title || "Без названия"),
            h("small", {}, typeShort(c) + (c.naAllowed ? ", может не применяться" : "")),
            c.type !== "flag" ? h("b", {}, c.weight || 0) : null));
        }
        tree.append(h("button", { class: "da-btn is-text is-sm da-tree-add", disabled: saving, onclick: () => addCriterion(s.id) }, DA.icon("plus", 16), "Добавить критерий"));
      }
    }

    function addCriterion(sectionId) {
      const c = {
        id: "c_" + Date.now().toString(36), sectionId, order: draft.criteria.length + 1,
        title: "", description: "", type: "binary", weight: 10, naAllowed: false, naCondition: null, scale: null, flagTypes: null
      };
      draft.criteria.push(c);
      selectedId = c.id;
      renderAll();
      setTimeout(() => form.querySelector("input") && form.querySelector("input").focus(), 50);
    }

    function field(label, control, error) {
      return h("label", { class: "da-field" }, h("span", {}, label), control, error ? h("span", { class: "da-error" }, error) : null);
    }

    function renderForm() {
      const c = selected();
      form.replaceChildren();
      if (!c) return;
      const err = errorsOf(c, draft.criteria);
      const refreshSide = () => { renderTree(); renderBar(); };
      const bind = (node, key, map) => node.addEventListener("input", () => { c[key] = map ? map(node.value) : node.value; refreshSide(); showErrors(); });

      const title = h("input", { class: "da-input", value: c.title, placeholder: "Например: Предложение дополнительной помощи" });
      bind(title, "title");
      const rule = h("textarea", { class: "da-textarea", placeholder: "Да, если оператор…" });
      rule.value = c.description;
      bind(rule, "description");
      const weight = h("input", { class: "da-input", type: "number", min: 1, max: 100, value: c.weight });
      bind(weight, "weight", Number);

      const sections = h("div", { class: "da-versions" }, draft.sections.map((s) => h("button", {
        type: "button", class: "da-filter-chip", style: s.id === c.sectionId ? {} : { background: "var(--da-surface-2)", color: "var(--da-text-2)" },
        onclick: () => { c.sectionId = s.id; renderAll(); }
      }, s.title)));

      const type = DA.segmented(TYPES, c.type, (v) => {
        c.type = v;
        if (v === "scale" && !c.scale) c.scale = [{ value: 10, description: "" }, { value: 5, description: "" }, { value: 0, description: "" }];
        if (v === "flag") { c.weight = 0; c.naAllowed = false; c.flagTypes = c.flagTypes || [{ id: "violation", title: "Нарушение" }]; }
        else if (!c.weight) c.weight = 10;
        renderAll();
      }, "Тип ответа");

      const na = h("input", { type: "checkbox", checked: c.naAllowed ? true : null });
      na.addEventListener("change", () => { c.naAllowed = na.checked; if (!na.checked) c.naCondition = null; renderAll(); });
      const naCond = h("textarea", { class: "da-textarea", style: { minHeight: "64px" }, placeholder: "Например: клиент не успел сформулировать запрос" });
      naCond.value = c.naCondition || "";
      bind(naCond, "naCondition");

      const errNodes = {};
      const errSlot = (key) => (errNodes[key] = h("span", { class: "da-error", hidden: !err[key] }, err[key] || ""));
      function showErrors() {
        const e = errorsOf(c, draft.criteria);
        for (const [k, n] of Object.entries(errNodes)) { n.textContent = e[k] || ""; n.hidden = !e[k]; }
      }

      form.append(h("div", { class: "da-form" },
        h("div", { class: "da-form-row" },
          h("label", { class: "da-field" }, h("span", {}, "Название"), title, errSlot("title")),
          c.type !== "flag" ? h("label", { class: "da-field" }, h("span", {}, "Вес"), weight, errSlot("weight")) : h("div", {})),
        h("div", { class: "da-field" }, h("span", {}, "Тип ответа"), type),
        h("div", { class: "da-field" }, h("span", {}, "Раздел"), sections),
        h("label", { class: "da-field" }, h("span", {}, "Правило оценки"), rule, h("span", { class: "da-hint" }, "Модель получает этот текст дословно и оценивает по нему"), errSlot("description")),
        c.type === "scale" ? scaleEditor(c, errSlot("scale"), showErrors) : null,
        c.type !== "flag" ? h("label", { class: "da-switch" }, na, h("i"), "Критерий может не относиться к разговору") : null,
        c.naAllowed ? h("label", { class: "da-field" }, h("span", {}, "Когда критерий не применяется"), naCond, errSlot("naCondition")) : null,
        h("div", {}, h("button", { class: "da-btn is-text", style: { color: "var(--da-no-ink)" }, onclick: () => removeCriterion(c) }, DA.icon("trash", 16), "Удалить критерий"))));
    }

    function scaleEditor(c, errNode, showErrors) {
      const list = h("div", { class: "da-steps" });
      function draw() {
        list.replaceChildren(...c.scale.map((s, i) => {
          const v = h("input", { class: "da-input", type: "number", min: 0, value: s.value, "aria-label": "Баллы" });
          v.addEventListener("change", () => { s.value = Number(v.value); c.scale.sort((a, b) => b.value - a.value); draw(); renderBar(); renderTree(); showErrors(); });
          const d = h("input", { class: "da-input", value: s.description, placeholder: "Что значит эта ступень" });
          d.addEventListener("input", () => { s.description = d.value; showErrors(); renderBar(); });
          return h("div", { class: "da-step" }, v, d,
            h("button", { class: "da-icon-btn", type: "button", "aria-label": "Удалить ступень", onclick: () => { c.scale.splice(i, 1); draw(); renderBar(); showErrors(); } }, DA.icon("trash", 16)));
        }));
      }
      draw();
      return h("div", { class: "da-field" }, h("span", {}, "Ступени шкалы"), list,
        h("div", {}, h("button", { class: "da-btn is-text is-sm", onclick: () => { c.scale.push({ value: 0, description: "" }); draw(); showErrors(); } }, DA.icon("plus", 16), "Добавить ступень")),
        h("span", { class: "da-hint" }, "Верхняя ступень даёт полный вес критерия"), errNode);
    }

    function removeCriterion(c) {
      const idx = draft.criteria.indexOf(c);
      draft.criteria.splice(idx, 1);
      selectedId = (draft.criteria[idx] || draft.criteria[idx - 1] || {}).id;
      renderAll();
      DA.toast(`Критерий «${c.title || "без названия"}» удалён из черновика`, bar);
    }

    async function onSave() {
      if (saving || !isDirty() || allErrors()) return;
      saving = true; saveError = ""; renderAll();
      try {
        const saved = await DA.data.saveChecklist(structuredClone(draft), { activate: true });
        viewing = saved;
        draft = structuredClone(saved);
        if (!disposed) DA.toast(`Версия ${saved.version} сохранена и стала активной. Новые оценки пойдут по ней`, bar);
      } catch (error) {
        saveError = error.message || "Не удалось сохранить версию. Изменения остались в форме";
      } finally {
        saving = false;
        if (!disposed) renderAll();
      }
    }

    async function onActivate() {
      if (saving) return;
      saving = true; saveError = ""; renderAll();
      try {
        viewing = await DA.data.activateChecklist(viewing.version);
        draft = structuredClone(viewing);
        if (!disposed) DA.toast(`Версия ${viewing.version} стала активной`, bar);
      } catch (error) {
        saveError = error.message || "Не удалось сделать версию активной. Повторите действие";
      } finally {
        saving = false;
        if (!disposed) renderAll();
      }
    }

    function renderAll() { renderVersions(); renderBar(); renderTree(); renderForm(); form.inert = saving; }

    root.append(h("div", { class: "da-page" },
      h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, "Чек-лист"), versions),
      bar,
      h("div", { class: "da-editor" }, tree, form)));
    renderAll();

    const leave = (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", leave);
    return () => { disposed = true; window.removeEventListener("beforeunload", leave); };
  };
})();
