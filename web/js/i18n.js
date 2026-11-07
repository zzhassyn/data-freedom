/* Язык интерфейса меняет только явно привязанные подписи, сохраняя рабочие узлы DOM. */
(function () {
  const DA = window.DA = window.DA || {};
  const LANGUAGES = [
    { locale: "ru", code: "RU", label: "RU", name: "Русский" },
    { locale: "kk", code: "KZ", label: "ҚАЗ", name: "Қазақша" },
    { locale: "en", code: "EN", label: "EN", name: "English" }
  ];
  const MESSAGE = Symbol("da.message"), catalog = new Map(), bindings = new Set(), index = new WeakMap();
  const missing = new Set(), rules = new Map();
  let active = "ru";
  const normalize = (value) => {
    const code = String(value || "").trim().toLowerCase().split(/[-_]/)[0];
    return code === "kz" ? "kk" : LANGUAGES.some((language) => language.locale === code) ? code : null;
  };
  try { active = normalize(localStorage.getItem("da.locale")) || "ru"; } catch (_) { /* Локализация доступна и без хранилища. */ }
  document.documentElement.lang = active;

  function pluralCategory(count, locale = active) {
    if (!rules.has(locale)) rules.set(locale, new Intl.PluralRules(locale));
    return rules.get(locale).select(Number(count));
  }
  function paramsOf(params) { return (typeof params === "function" ? params(active) : params) || {}; }
  function format(pattern, params) {
    return String(pattern).replace(/\{([\w.]+)\}/g, (token, name) => {
      const value = name.split(".").reduce((part, key) => part == null ? undefined : part[key], params);
      return value == null ? token : String(value);
    });
  }
  function translate(key, params) {
    const values = paramsOf(params);
    if (typeof key === "function") return String(key(active));
    const entry = catalog.get(key);
    if (!entry) { missing.add(key); return key; }
    let pattern = entry[active];
    if (pattern == null) { missing.add(`${key}:${active}`); pattern = entry.ru ?? key; }
    if (typeof pattern === "function") return String(pattern(values, active));
    if (pattern && typeof pattern === "object") pattern = pattern[pluralCategory(values.count ?? values.n ?? 0)] ?? pattern.other ?? pattern.one ?? key;
    return format(pattern, values);
  }
  function message(key, params) { return Object.freeze({ [MESSAGE]: true, key, params }); }
  function descriptor(key, params) { return key?.[MESSAGE] ? key : message(key, params); }
  function addMessages(entries) {
    for (const [key, entry] of Object.entries(entries)) catalog.set(key, { ...(catalog.get(key) || {}), ...entry });
  }
  function deref(binding) { return binding.ref ? binding.ref.deref() : binding.node; }
  function register(node, slot, getText, write) {
    let slots = index.get(node);
    if (!slots) index.set(node, slots = new Map());
    const previous = slots.get(slot);
    if (previous) bindings.delete(previous);
    const binding = { ...(typeof WeakRef === "function" ? { ref: new WeakRef(node) } : { node }), slot, getText, write };
    slots.set(slot, binding); bindings.add(binding);
    write(node, getText());
    return () => { bindings.delete(binding); if (slots.get(slot) === binding) slots.delete(slot); };
  }
  function bindText(node, key, params) {
    const value = descriptor(key, params);
    if (node.nodeType !== 3 && (node.nodeType !== 1 || node.isContentEditable || /^(INPUT|TEXTAREA|AUDIO|VIDEO|SELECT)$/.test(node.tagName) || [...node.childNodes].some((child) => child.nodeType !== 3))) {
      throw new TypeError("bindText accepts a Text node or a text-only element. Use i18n.text() alongside markup.");
    }
    if (node.nodeType !== 3) {
      for (const child of node.childNodes) {
        const prior = index.get(child)?.get("text");
        if (prior) { bindings.delete(prior); index.get(child).delete("text"); }
      }
      if (!node.firstChild) node.append(document.createTextNode(""));
      while (node.childNodes.length > 1) node.lastChild.remove();
    }
    const owned = node.nodeType === 3 ? node : node.firstChild;
    const ownedRef = typeof WeakRef === "function" ? new WeakRef(owned) : { deref: () => owned };
    let lastText;
    return register(node, "text", () => translate(value.key, value.params), (target, text) => {
      const textNode = ownedRef.deref();
      // Замена содержимого владельцем снимает старую привязку, а не возвращает устаревшую подпись.
      if (!textNode || (target.nodeType !== 3 && (target.firstChild !== textNode || target.childNodes.length !== 1)) || (lastText !== undefined && textNode.data !== lastText)) return false;
      if (textNode.data !== text) textNode.data = text;
      lastText = text;
    });
  }
  function bindAttr(node, name, key, params) {
    if (!/^(title|placeholder|alt|aria-label|aria-description|aria-valuetext|data-label)$/.test(name)) throw new TypeError(`Attribute ${name} is not an interface text binding`);
    const value = descriptor(key, params);
    let lastText;
    return register(node, `attr:${name}`, () => translate(value.key, value.params), (target, text) => {
      if (lastText !== undefined && target.getAttribute(name) !== lastText) return false;
      if (target.getAttribute(name) !== text) target.setAttribute(name, text);
      lastText = text;
    });
  }
  function text(key, params) {
    const node = document.createTextNode("");
    bindText(node, key, params);
    return node;
  }
  function refresh(node) {
    for (const binding of index.get(node)?.values() || []) if (binding.write(node, binding.getText()) === false) { bindings.delete(binding); index.get(node).delete(binding.slot); }
  }
  function unbindAttr(node, name) {
    const slots = index.get(node), binding = slots?.get(`attr:${name}`);
    if (binding) { bindings.delete(binding); slots.delete(`attr:${name}`); }
  }
  function setLocale(value) {
    const next = normalize(value);
    if (!next || next === active) return false;
    const previousLocale = active;
    active = next;
    document.documentElement.lang = next;
    try { localStorage.setItem("da.locale", next); } catch (_) { /* Выбор остаётся действующим до закрытия страницы. */ }
    for (const binding of bindings) {
      const node = deref(binding);
      if (!node) { bindings.delete(binding); continue; }
      if (node.isConnected && binding.write(node, binding.getText()) === false) { bindings.delete(binding); index.get(node)?.delete(binding.slot); }
    }
    window.dispatchEvent(new CustomEvent("da:locale-changed", { detail: { locale: next, previousLocale } }));
    return true;
  }
  function release(root) {
    for (const binding of bindings) {
      const node = deref(binding);
      if (!node || node === root || root.contains(node)) bindings.delete(binding);
    }
  }
  function audit() {
    return { keys: catalog.size, missingUsed: [...missing], missingLocales: [...catalog].flatMap(([key, entry]) => LANGUAGES.filter((language) => entry[language.locale] == null).map((language) => `${key}:${language.locale}`)) };
  }

  DA.t = translate;
  DA.msg = message;
  DA.i18n = {
    locale: () => active,
    languageCode: (locale = active) => LANGUAGES.find((language) => language.locale === normalize(locale))?.code || "RU",
    languages: LANGUAGES,
    normalize, setLocale, addMessages, has: (key) => catalog.has(key), audit,
    isMessage: (value) => !!value?.[MESSAGE], text, bindText, bindAttr, unbindAttr, refresh, release,
    plural: pluralCategory
  };
  addMessages({
    "ui.close": { ru: "Закрыть", kk: "Жабу", en: "Close" },
    "ui.filters": { ru: "Фильтры", kk: "Сүзгілер", en: "Filters" },
    "ui.notApplicable": { ru: "Не применимо", kk: "Қолданылмайды", en: "Not applicable" },
    "ui.evaluating": { ru: "оценивается", kk: "бағалануда", en: "being evaluated" },
    "ui.pointsOf": { ru: "{points} из {max}", kk: "{max} ұпайдан {points}", en: "{points} of {max}" },
    "ui.ribbonTitle": { ru: "{criterion}: {result}", kk: "{criterion}: {result}", en: "{criterion}: {result}" },
    "ui.ribbonProgress": { ru: "Лента весов: оценено {done} из {total} критериев", kk: "Салмақтар жолағы: {total} критерийдің {done} бағаланды", en: "Weight ribbon: {done} of {total} criteria evaluated" },
    "ui.totalBreakdown": { ru: "Из чего сложился итог", kk: "Қорытынды неден тұрады", en: "How the total is calculated" },
    "ui.ribbonMeaning": { ru: "Каждый сегмент это критерий. Ширина показывает его вес, заливка показывает, сколько баллов набрано.", kk: "Әр бөлік бір критерийді білдіреді. Ені оның салмағын, ал боялған бөлігі жиналған ұпайды көрсетеді.", en: "Each segment represents a criterion. Its width shows the weight, and the fill shows the points earned." },
    "ui.ribbonExcluded": { ru: " Штриховка отмечает критерии, которые не применяются. Их баллы распределены между остальными.", kk: " Штрихтар қолданылмайтын критерийлерді белгілейді. Олардың ұпайлары қалғандарына бөлінеді.", en: " Hatching marks criteria that do not apply. Their points are distributed among the others." },
    "ui.language": { ru: "Язык интерфейса", kk: "Интерфейс тілі", en: "Interface language" },
    "ui.languageChanged": { ru: "Язык интерфейса: {language}", kk: "Интерфейс тілі: {language}", en: "Interface language: {language}" }
  });

  DA.i18n.createControl = function () {
    const h = DA.h;
    const control = h("div", { class: "da-locale-control", role: "group", "aria-label": DA.msg("ui.language") });
    const announcement = h("span", { class: "da-sr", role: "status", "aria-live": "polite" });
    const buttons = LANGUAGES.map((language) => h("button", {
      class: "da-locale-option", type: "button", lang: language.locale, "data-locale": language.locale,
      "aria-label": language.name, title: language.name, "aria-pressed": String(active === language.locale),
      onmousedown: (event) => {
        // Выбор мышью не забирает курсор из редактируемого поля.
        const focused = document.activeElement;
        if (focused && (focused.matches("input,textarea") || focused.isContentEditable)) event.preventDefault();
      },
      onclick: () => setLocale(language.locale)
    }, language.label));
    control.append(...buttons, announcement);
    const changed = () => {
      for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.locale === active));
      announcement.textContent = translate("ui.languageChanged", { language: LANGUAGES.find((language) => language.locale === active).name });
    };
    window.addEventListener("da:locale-changed", changed);
    control.dispose = () => window.removeEventListener("da:locale-changed", changed);
    return control;
  };
})();
