/* Правка чек-листа по шагам. Исходная версия не меняется до сохранения новой. */
(function () {
  const DA = window.DA, h = DA.h;
  const TYPES = [
    { value: "binary", title: "Да или нет", hint: "Оператор сделал это или нет" },
    { value: "scale", title: "Баллы по шкале", hint: "Насколько хорошо, например от 0 до 20" },
    { value: "flag", title: "Отметка нарушения", hint: "Не даёт баллов, отмечается отдельно, как грубые ошибки" }
  ];
  const sorted = (items) => [...items].sort((a, b) => a.order - b.order);

  function errorsOf(c, all) {
    const e = {};
    if (!c.title.trim()) e.title = "Назовите критерий";
    else if (all.filter((x) => x.title.trim().toLocaleLowerCase("ru-RU") === c.title.trim().toLocaleLowerCase("ru-RU")).length > 1) e.title = "Критерий с таким названием уже есть";
    if (!c.description.trim()) e.description = "Опишите действие, которое должна проверить модель";
    if (c.type !== "flag" && (!Number.isFinite(c.weight) || c.weight < 1 || c.weight > 100)) e.weight = "Укажите вес от 1 до 100";
    if (c.type !== "flag" && c.naAllowed && !(c.naCondition || "").trim()) e.naCondition = "Опишите, когда критерий не относится к разговору";
    if (c.type === "scale") {
      const steps = c.scale || [], values = steps.map((s) => s.value);
      if (steps.length < 2) e.scale = "Нужно минимум две ступени";
      else if (values.some((v) => !Number.isFinite(v) || v < 0)) e.scale = "Баллы должны быть не меньше нуля";
      else if (!values.includes(0)) e.scale = "Добавьте ступень 0";
      else if (new Set(values).size !== values.length) e.scale = "Баллы ступеней повторяются";
      else if (steps.some((s) => !s.description.trim())) e.scale = "Опишите каждую ступень";
    }
    return e;
  }

  DA.views.checklistEdit = function mount(root, params) {
    let viewing = DA.checklist(Number(params?.query?.version)) || DA.activeChecklist();
    if (!viewing) return;
    let draft = structuredClone(viewing), selectedId = draft.criteria[0]?.id, restored = false;
    const draftKey = () => `da.checklist.draft.${viewing.version}`;
    try {
      const cached = JSON.parse(sessionStorage.getItem(draftKey()) || "null");
      if (cached?.draft?.version === viewing.version && Array.isArray(cached.draft.criteria) && cached.draft.criteria.every((c) => typeof c.id === "string" && typeof c.title === "string" && typeof c.description === "string")) {
        draft = cached.draft; selectedId = cached.selectedId || draft.criteria[0]?.id; restored = true;
      }
    } catch (error) { /* Закрытое хранилище не мешает редактированию. */ }
    let saving = false, saveError = "", disposed = false, deleted = null, undoTimer = null, menuClose = null;
    let helpOpen = false, mobileTreeOpen = false;
    const typeDrafts = new Map();
    const page = h("div", { class: "da-page ce-page" });
    const bar = h("div", { class: "ce-top" });
    const tree = h("nav", { class: "ce-tree", "aria-label": "Критерии" });
    const form = h("div", { class: "ce-form" });
    const body = h("div", { class: "ce-layout" }, tree, form);
    root.append(page); page.append(bar, body);
    const selected = () => draft.criteria.find((c) => c.id === selectedId);
    const isDirty = () => JSON.stringify(viewing.criteria) !== JSON.stringify(draft.criteria);
    const allErrors = () => draft.criteria.length ? draft.criteria.reduce((n, c) => n + Object.keys(errorsOf(c, draft.criteria)).length, 0) : 1;
    const nextVersion = () => Math.max(...DA.state.checklists.map((cl) => cl.version)) + 1;
    const shares = () => DA.checklistShares(draft).criteria;
    function preserveDraft() {
      try {
        if (isDirty()) sessionStorage.setItem(draftKey(), JSON.stringify({ draft, selectedId }));
        else sessionStorage.removeItem(draftKey());
      } catch (error) { /* Основной путь сохранения остаётся доступным. */ }
    }
    function forgetDraft() { try { sessionStorage.removeItem(draftKey()); } catch (error) { /* Необязательное хранилище. */ } restored = false; }

    function renderBar() {
      preserveDraft();
      const errors = allErrors(), dirty = isDirty();
      const reason = saving ? "Сохраняем версию" : !dirty ? "Нет изменений" : errors ? `Исправьте ${errors} ${DA.fmt.plural(errors, ["поле", "поля", "полей"])}` : "";
      const save = h("button", { class: "da-btn is-primary", type: "button", disabled: !!reason, onclick: saveSummary }, saving ? "Сохраняем версию" : "Сохранить версию");
      const saveWrap = h("span", { class: "ce-save", tabindex: reason ? 0 : null, "aria-label": reason || null }, save);
      if (reason) DA.hoverCard(saveWrap, () => h("p", { class: "cl-ribbon-tip" }, reason));
      bar.replaceChildren(...[
        h("div", { class: "ce-heading" }, h("a", { class: "ce-back", href: `#/checklists?version=${viewing.version}` }, DA.icon("back", 16), "К чек-листу"),
          h("h1", { class: "da-h1", tabindex: -1 }, `Черновик версии ${nextVersion()}`),
          h("button", { class: "ce-version", type: "button", disabled: saving, onclick: chooseVersion }, `На основе версии ${viewing.version}`, DA.icon("chevron", 13))),
        saveWrap, saveError ? h("p", { class: "da-error ce-save-error", role: "alert" }, saveError) : null,
        restored ? h("p", { class: "ce-restored", role: "status" }, "Несохранённый черновик восстановлен") : null].filter(Boolean));
    }

    function renderTree() {
      menuClose?.();
      const portion = shares();
      const contents = h("div", { class: "ce-tree-content", id: "ce-criteria-list" });
      if (isDirty()) contents.append(h("button", { class: "da-btn is-text is-sm ce-reset", type: "button", disabled: saving, onclick: resetDraft }, "Отменить все изменения"));
      for (const section of sorted(draft.sections)) {
        const group = h("section", { class: "ce-tree-section" }, h("h3", {}, section.title));
        for (const c of sorted(draft.criteria.filter((item) => item.sectionId === section.id))) {
          const old = viewing.criteria.find((item) => item.id === c.id), errors = errorsOf(c, draft.criteria);
          const mark = !old ? "новый" : JSON.stringify(old) !== JSON.stringify(c) ? "изменён" : "";
          const row = h("button", { class: "ce-tree-row", type: "button", disabled: saving, "data-criterion": c.id,
            "aria-current": String(c.id === selectedId), onclick: () => selectCriterion(c.id) },
            h("span", { class: "ce-tree-name" }, Object.keys(errors).length ? h("span", { class: "ce-error-dot", "aria-label": Object.values(errors)[0] }) : null,
              c.title || "Новый критерий", mark ? h("small", { class: "ce-mark" + (!old ? " is-new" : "") }, mark) : null),
            h("span", { class: "ce-tree-share" }, c.type === "flag" ? DA.icon("flag", 15) : `${portion[c.id] || 0} %`));
          if (Object.keys(errors).length) DA.hoverCard(row, () => h("p", { class: "cl-ribbon-tip" }, Object.values(errors)[0]));
          group.append(row);
        }
        const add = h("button", { class: "da-btn is-text is-sm ce-add", type: "button", disabled: saving, "aria-expanded": "false", onclick: () => templateMenu(add, section.id) }, DA.icon("plus", 15), "Добавить критерий");
        group.append(add); contents.append(group);
      }
      tree.replaceChildren(h("div", { class: "ce-tree-head" }, h("h2", {}, "Критерии"), h("span", {}, `${draft.criteria.length}`)),
        h("button", { class: "ce-mobile-select", type: "button", "aria-expanded": String(mobileTreeOpen), "aria-controls": "ce-criteria-list", onclick: () => { mobileTreeOpen = !mobileTreeOpen; renderTree(); } },
          h("span", {}, selected()?.title || "Выбрать критерий"), DA.icon("chevron", 16)), contents);
      tree.classList.toggle("is-open", mobileTreeOpen);
    }

    function selectCriterion(id) {
      selectedId = id; mobileTreeOpen = false; renderTree(); renderForm();
      if (matchMedia("(max-width: 760px)").matches) form.scrollIntoView({ block: "start", behavior: "auto" });
      form.querySelector("h2")?.focus({ preventScroll: true });
    }

    function resetDraft() {
      clearTimeout(undoTimer); deleted = null; draft = structuredClone(viewing); saveError = ""; restored = false; typeDrafts.clear();
      if (!selected()) selectedId = draft.criteria[0]?.id;
      renderAll();
    }

    function templateMenu(anchor, sectionId) {
      if (menuClose) { menuClose(); return; }
      const menu = h("div", { class: "ce-add-menu", role: "group", "aria-label": "Добавить критерий" });
      for (const item of [{ key: null, title: "С нуля", summary: "Написать своё правило" }, ...(window.DA_CRITERION_TEMPLATES || [])]) {
        menu.append(h("button", { type: "button", onclick: () => { close(); addCriterion(sectionId, item.key ? item : null); } }, h("b", {}, item.title), h("span", {}, item.summary)));
      }
      function outside(e) { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); }
      function key(e) { if (e.key === "Escape") { e.preventDefault(); close(); anchor.focus(); } }
      function close() {
        menu.remove(); anchor.setAttribute("aria-expanded", "false");
        document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); menuClose = null;
      }
      menuClose = close; anchor.after(menu); anchor.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key);
      menu.querySelector("button").focus({ preventScroll: true });
    }

    function addCriterion(sectionId, template) {
      const fields = template ? structuredClone(template) : { title: "", description: "", type: "binary", weight: 10, naAllowed: false, naCondition: null, scale: null, flagTypes: null };
      delete fields.key; delete fields.summary;
      const c = { ...fields, id: "c_" + crypto.randomUUID().replaceAll("-", ""), sectionId, order: Math.max(0, ...draft.criteria.map((item) => item.order)) + 1 };
      draft.criteria.push(c); selectedId = c.id; mobileTreeOpen = false; saveError = ""; renderAll();
      form.querySelector("input")?.focus();
    }

    function renderForm() {
      form.replaceChildren();
      if (deleted) form.append(h("div", { class: "ce-undo", role: "status" }, h("span", {}, "Критерий удалён из черновика."), h("button", { class: "da-btn is-text is-sm", type: "button", onclick: undoDelete }, "Вернуть")));
      const c = selected();
      if (!c) {
        if (!deleted) form.append(h("div", { class: "ce-empty" }, h("h2", {}, "Добавьте критерий"), h("p", {}, "Выберите раздел и добавьте своё правило или готовый шаблон.")));
        return;
      }
      const errNodes = {}, steps = new Map();
      let shareNode, weightRibbon;
      const stepErrors = { 1: ["title", "description"], 2: ["scale"], 3: ["weight"], 4: ["naCondition"] };
      const errSlot = (key) => (errNodes[key] = h("span", { class: "da-error", id: `ce-error-${key}`, hidden: true }));
      function refresh(clearError = true) {
        if (clearError) saveError = "";
        renderTree(); renderBar();
        const errors = errorsOf(c, draft.criteria);
        for (const [key, node] of Object.entries(errNodes)) {
          node.textContent = errors[key] || ""; node.hidden = !errors[key];
          form.querySelector(`[aria-describedby="ce-error-${key}"]`)?.setAttribute("aria-invalid", String(!!errors[key]));
        }
        for (const [number, node] of steps) {
          const invalid = stepErrors[number].some((key) => errors[key]);
          node.classList.toggle("is-invalid", invalid);
          node.classList.toggle("is-quiet", number > 1 && (!!errors.title || !!errors.description));
          node.querySelector(".ce-step-number").replaceChildren(invalid || (number === 4 && !c.naAllowed) ? String(number) : DA.icon("check", 15));
        }
        if (shareNode) shareNode.textContent = `${shares()[c.id] || 0} % итога`;
        if (weightRibbon) weightRibbon.replaceChildren(DA.checklistRibbon(draft, { selected: c.id }));
      }
      function bind(node, key, map) {
        node.addEventListener("input", () => { c[key] = map ? map(node.value) : node.value; refresh(); });
        return node;
      }
      function field(label, node, key, hint) {
        node.setAttribute("aria-describedby", `ce-error-${key}`);
        return h("label", { class: "da-field" }, h("span", {}, label), node, hint ? h("small", { class: "ce-hint" }, hint) : null, errSlot(key));
      }
      function step(number, title, content, extra) {
        const node = h("section", { class: "ce-step-block", "data-step": number },
          h("div", { class: "ce-step-heading" }, h("span", { class: "ce-step-number", "aria-hidden": "true" }, number), h("h2", { tabindex: -1 }, title), extra ? h("span", { class: "ce-optional" }, extra) : null),
          h("div", { class: "ce-step-body" }, content));
        steps.set(number, node); return node;
      }
      const title = bind(h("input", { class: "da-input", value: c.title, placeholder: "Например: Предложение дополнительной помощи" }), "title");
      const rule = bind(h("textarea", { class: "da-textarea ce-rule-input", rows: 3, placeholder: "Да, если оператор…" }), "description"); rule.value = c.description;
      const resizeRule = () => { rule.style.height = "auto"; rule.style.height = Math.min(220, Math.max(92, rule.scrollHeight)) + "px"; };
      rule.addEventListener("input", resizeRule);
      const help = h("div", { class: "ce-rule-help", hidden: !helpOpen },
        h("div", { class: "ce-rule-example is-good" }, h("b", {}, "Конкретно"), h("p", {}, "Да, если оператор поздоровался на языке клиента и представился в первом ответе."), h("small", {}, "Конкретное действие, понятно, где искать.")),
        h("div", { class: "ce-rule-example" }, h("b", {}, "Неясно"), h("p", {}, "Оператор был вежливым."), h("small", {}, "Непонятно, что считать вежливостью.")),
        h("ul", {}, h("li", {}, "Одно действие на критерий."), h("li", {}, "Укажите, где в разговоре его искать."), h("li", {}, "Объясните, что считать нарушением.")));
      const helpButton = h("button", { class: "ce-help-toggle", type: "button", "aria-expanded": String(helpOpen), onclick: () => { helpOpen = !helpOpen; help.hidden = !helpOpen; helpButton.setAttribute("aria-expanded", String(helpOpen)); } }, DA.icon("chevron", 14), "Как написать правило, чтобы модель поняла");
      const sectionButton = h("button", { class: "ce-section-select", type: "button", onclick: () => chooseSection(c) }, "Раздел: ", draft.sections.find((s) => s.id === c.sectionId)?.title || "Выбрать", DA.icon("chevron", 13));
      form.append(step(1, "Что проверяем", [field("Название", title, "title"), field("Правило для модели", rule, "description"), helpButton, help, sectionButton]));

      const typeCards = h("div", { class: "ce-types", role: "group", "aria-label": "Как отвечать" }, TYPES.map((type) => {
        const sample = type.value === "binary" ? h("div", { class: "ce-type-sample" }, h("span", { class: "ce-mini-pill is-yes" }, "Да"), h("span", { class: "ce-mini-pill is-no" }, "Нет"))
          : type.value === "scale" ? h("div", { class: "ce-type-sample ce-scale-sample", "aria-hidden": "true" }, [1, 2, 3, 4, 5].map((n) => h("i", { style: { height: `${n * 4 + 3}px` } })))
          : h("div", { class: "ce-type-sample", "aria-hidden": "true" }, DA.icon("flag", 25));
        return h("button", { class: "ce-type", type: "button", "data-type": type.value, "aria-pressed": String(c.type === type.value), onclick: () => changeType(c, type.value) },
          sample, h("b", {}, type.title), h("span", {}, type.hint), c.type === type.value ? h("i", { class: "ce-type-check" }, DA.icon("check", 13)) : null);
      }));
      form.append(step(2, "Как отвечать", [typeCards, c.type === "scale" ? scaleEditor(c, errSlot("scale"), refresh) : null]));

      if (c.type !== "flag") {
        shareNode = h("strong", { class: "ce-share-live", "aria-live": "off" });
        const number = h("input", { class: "da-input ce-weight-number", type: "number", min: 1, max: 100, step: "any", value: c.weight, "aria-label": "Вес критерия", "aria-describedby": "ce-error-weight" });
        const slider = h("input", { class: "ce-weight-slider", type: "range", min: 1, max: 50, step: 1, value: Math.min(50, c.weight), "aria-label": "Изменить вес критерия" });
        const paintSlider = () => slider.style.setProperty("--filled", `${(Math.min(50, Math.max(1, Number(c.weight) || 1)) - 1) / 49 * 100}%`);
        slider.addEventListener("input", () => { c.weight = Number(slider.value); number.value = c.weight; paintSlider(); refresh(); });
        number.addEventListener("input", () => { c.weight = number.value === "" ? NaN : Number(number.value); slider.value = Math.min(50, c.weight || 1); paintSlider(); refresh(); });
        paintSlider(); weightRibbon = h("div", { class: "ce-weight-ribbon" });
        form.append(step(3, "Насколько важно", [h("div", { class: "ce-weight-value" }, shareNode, h("label", { class: "ce-weight-label" }, "Вес", number)),
          slider, errSlot("weight"), weightRibbon, h("p", { class: "ce-hint" }, "Сумма весов может быть любой, итог всё равно считается из 100.")]));
        const toggle = h("input", { type: "checkbox", checked: c.naAllowed });
        toggle.addEventListener("change", () => { c.naAllowed = toggle.checked; c.naCondition = toggle.checked ? (c.naCondition || "") : null; renderForm(); form.querySelector(".ce-na-switch input")?.focus({ preventScroll: true }); });
        const na = bind(h("textarea", { class: "da-textarea", rows: 2, placeholder: "Например: клиент спрашивал только про тарифы, проверять личность не нужно" }), "naCondition"); na.value = c.naCondition || "";
        form.append(step(4, "Когда не применять", [h("label", { class: "da-switch ce-na-switch" }, toggle, h("i", { "aria-hidden": "true" }), h("span", {}, "Критерий может не относиться к разговору")),
          c.naAllowed ? field("Когда он не относится", na, "naCondition") : null], "по желанию"));
      }
      form.append(h("div", { class: "ce-delete" }, h("button", { class: "da-btn is-text", type: "button", onclick: () => removeCriterion(c) }, DA.icon("trash", 16), "Удалить критерий")));
      refresh(false); requestAnimationFrame(() => { if (rule.isConnected) resizeRule(); }); form.inert = saving;
    }

    function scaleEditor(c, error, refresh) {
      const list = h("div", { class: "ce-scale-rows" });
      function draw(focusIndex) {
        list.replaceChildren(...c.scale.map((s, index) => {
          const value = h("input", { class: "da-input", type: "number", min: 0, step: "any", value: s.value, "aria-label": `Баллы ступени ${index + 1}` });
          value.addEventListener("input", () => { s.value = value.value === "" ? NaN : Number(value.value); refresh(); });
          value.addEventListener("change", () => {
            requestAnimationFrame(() => {
              if (!list.isConnected) return;
              const active = document.activeElement;
              const rowIndex = [...list.children].findIndex((row) => row.contains(active));
              const nextStep = c.scale[rowIndex];
              const controlIndex = rowIndex < 0 ? -1 : [...list.children[rowIndex].querySelectorAll("input, textarea, button")].indexOf(active);
              c.scale.sort((a, b) => b.value - a.value); draw(); refresh();
              if (nextStep && controlIndex >= 0) list.children[c.scale.indexOf(nextStep)]?.querySelectorAll("input, textarea, button")[controlIndex]?.focus({ preventScroll: true });
            });
          });
          const description = h("textarea", { class: "da-textarea", rows: 1, placeholder: "Что значит эта ступень", "aria-label": `Описание ступени ${index + 1}` });
          description.value = s.description;
          const resize = () => { description.style.height = "auto"; description.style.height = Math.max(44, description.scrollHeight) + "px"; };
          description.addEventListener("input", () => { s.description = description.value; resize(); refresh(); });
          requestAnimationFrame(() => { if (description.isConnected) resize(); });
          return h("div", { class: "ce-scale-row" }, value, description, h("button", { class: "da-icon-btn", type: "button", "aria-label": `Удалить ступень ${index + 1}`, onclick: () => { c.scale.splice(index, 1); draw(); refresh(); list.querySelector("input")?.focus(); } }, DA.icon("x", 16)));
        }));
        if (focusIndex != null) list.children[focusIndex]?.querySelector("input")?.focus({ preventScroll: true });
      }
      c.scale.sort((a, b) => b.value - a.value); draw();
      return h("div", { class: "ce-scale-editor" }, h("div", { class: "ce-scale-labels" }, h("span", {}, "Баллы"), h("span", {}, "Что значит")), list,
        h("button", { class: "da-btn is-text is-sm", type: "button", onclick: () => {
          const values = new Set(c.scale.map((s) => s.value)); let value = 0; while (values.has(value)) value++;
          const item = { value, description: "" }; c.scale.push(item); c.scale.sort((a, b) => b.value - a.value); draw(c.scale.indexOf(item)); refresh();
        } }, DA.icon("plus", 15), "Добавить ступень"),
        h("p", { class: "ce-hint" }, "Самая высокая ступень даёт полный вес критерия. Обязательно есть ступень 0."), error);
    }
    function changeType(c, type) {
      if (c.type === type) return;
      const remembered = typeDrafts.get(c.id) || {};
      if (c.type === "scale") remembered.scale = structuredClone(c.scale);
      if (c.type === "flag") remembered.flagTypes = structuredClone(c.flagTypes);
      else { remembered.weight = c.weight; remembered.naAllowed = c.naAllowed; remembered.naCondition = c.naCondition; }
      typeDrafts.set(c.id, remembered);
      const previous = c.type;
      c.type = type;
      const original = viewing.criteria.find((item) => item.id === c.id);
      c.scale = type === "scale" ? structuredClone(remembered.scale || original?.scale || [{ value: 20, description: "" }, { value: 10, description: "" }, { value: 0, description: "" }]) : null;
      c.flagTypes = type === "flag" ? structuredClone(remembered.flagTypes || original?.flagTypes || [{ id: "violation", title: "Нарушение" }]) : null;
      if (type === "flag") { c.weight = 0; c.naAllowed = false; c.naCondition = null; }
      else if (previous === "flag") { c.weight = remembered.weight || 10; c.naAllowed = !!remembered.naAllowed; c.naCondition = remembered.naCondition || null; }
      saveError = ""; renderAll(); form.querySelector(`[data-type="${type}"]`)?.focus({ preventScroll: true });
    }

    function chooseSection(c) {
      let modal;
      const list = h("div", { class: "ce-option-list" }, sorted(draft.sections).map((s) => h("button", { class: "ce-option", type: "button", "aria-pressed": String(c.sectionId === s.id), onclick: () => { c.sectionId = s.id; modal.close(); renderAll(); form.querySelector(".ce-section-select")?.focus({ preventScroll: true }); } }, s.title, c.sectionId === s.id ? DA.icon("check", 16) : null)));
      modal = DA.modal({ title: "Раздел критерия", body: list, width: 480 });
    }

    function removeCriterion(c) {
      clearTimeout(undoTimer); deleted = { c, index: draft.criteria.indexOf(c) };
      draft.criteria.splice(deleted.index, 1); selectedId = null; saveError = ""; renderAll();
      form.querySelector(".ce-undo button")?.focus({ preventScroll: true });
      undoTimer = setTimeout(() => {
        const index = deleted?.index || 0; deleted = null;
        if (!disposed && selected()) form.querySelector(".ce-undo")?.remove();
        else if (!disposed) { selectedId = (draft.criteria[index] || draft.criteria[index - 1])?.id; renderAll(); }
      }, 6000);
    }

    function undoDelete() {
      if (!deleted || saving) return;
      clearTimeout(undoTimer); draft.criteria.splice(deleted.index, 0, deleted.c); selectedId = deleted.c.id; deleted = null;
      renderAll(); form.querySelector("h2")?.focus({ preventScroll: true });
    }

    function confirmLeave(change, title) {
      if (!isDirty()) { change(); return; }
      let modal;
      modal = DA.modal({ title: title || "Выйти из редактора", body: h("p", {}, "Несохранённые изменения будут потеряны."),
        foot: h("div", { class: "ce-dialog-actions" }, h("button", { class: "da-btn", type: "button", onclick: () => modal.close() }, "Вернуться к правке"),
          h("button", { class: "da-btn is-primary", type: "button", onclick: () => { modal.close(); forgetDraft(); change(); } }, "Не сохранять")) });
    }

    function chooseVersion() {
      let modal;
      modal = DA.modal({ title: "Взять за основу", body: h("div", { class: "ce-option-list" }, [...DA.state.checklists].sort((a, b) => b.version - a.version).map((cl) =>
        h("button", { class: "ce-option", type: "button", "aria-pressed": String(cl.version === viewing.version), onclick: () => {
          modal.close(); if (cl.version === viewing.version) return;
          confirmLeave(() => { viewing = cl; draft = structuredClone(cl); selectedId = draft.criteria[0]?.id; deleted = null; clearTimeout(undoTimer); typeDrafts.clear(); saveError = ""; history.replaceState(null, "", `#/checklists/edit?version=${cl.version}`); renderAll(); }, "Перейти к другой версии");
        } }, h("span", {}, `Версия ${cl.version}`, cl.isActive ? h("small", {}, "активна") : null), cl.version === viewing.version ? DA.icon("check", 16) : null))), width: 420 });
    }

    function saveSummary() {
      if (saving || !isDirty() || allErrors()) return;
      const version = nextVersion();
      let modal;
      const list = h("ul", { class: "ce-change-list" }, DA.checklistChanges(draft, viewing).map((change) => h("li", {}, h("span", { class: `ce-change-label is-${change.kind}` }, change.label),
        h("span", {}, change.title, change.kind === "weight" ? h("small", {}, `Вес: ${change.before.weight} → ${change.after.weight}`) : null))));
      modal = DA.modal({ title: `Сохранить версию ${version}`, body: h("div", {}, list,
        h("p", { class: "ce-save-explainer" }, `Новые оценки пойдут по версии ${version}. Уже оценённые обращения можно переоценить, модель заново оценит только изменённые критерии.`)),
        foot: h("div", { class: "ce-save-actions" },
          h("button", { class: "da-btn is-primary", type: "button", onclick: () => { modal.close(); saveVersion(true); } }, "Сохранить и применить к обращениям"),
          h("div", {}, h("button", { class: "da-btn", type: "button", onclick: () => { modal.close(); saveVersion(false); } }, "Только сохранить"),
            h("button", { class: "da-btn is-text", type: "button", onclick: () => modal.close() }, "Вернуться к правке"))), width: 600 });
    }

    async function saveVersion(apply) {
      if (saving || allErrors()) return;
      saving = true; saveError = ""; menuClose?.(); clearTimeout(undoTimer); deleted = null; renderAll();
      try {
        const saved = await DA.data.saveChecklist(structuredClone(draft), { activate: true });
        forgetDraft(); viewing = saved; draft = structuredClone(saved);
        if (!disposed) location.hash = apply ? `#/checklists/apply/${saved.version}` : `#/checklists?version=${saved.version}`;
      } catch (error) { saveError = error.message || "Не удалось сохранить версию. Изменения остались в форме"; }
      finally { saving = false; if (!disposed) renderAll(); }
    }

    function renderAll() { renderBar(); renderTree(); renderForm(); tree.inert = saving; form.inert = saving; }
    /* Смена основы и внутренние переходы сохраняют возможность вернуться к вводу. */
    function guardNavigation(e) {
      const link = e.target.closest?.("a[href^='#']");
      if (!link || !isDirty() || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const hash = link.getAttribute("href");
      if (hash === location.hash) return;
      e.preventDefault(); e.stopPropagation();
      if (!saving) confirmLeave(() => { location.hash = hash; });
    }
    document.addEventListener("click", guardNavigation, true);
    renderAll();
    return () => { disposed = true; clearTimeout(undoTimer); menuClose?.(); document.removeEventListener("click", guardNavigation, true); };
  };
})();
