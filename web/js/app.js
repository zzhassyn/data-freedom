/* Шапка и маршрутизация через хэш: в веб-ресурсе Dynamics 365 путь сервера недоступен. */
(function () {
  const DA = window.DA, h = DA.h;
  let unmount = null;

  const NAV = [
    { href: "#/", match: /^#\/(c\/.*)?$/, label: "Диалоги", icon: "list" },
    { href: "#/appeals", match: /^#\/appeals/, label: "Апелляции", icon: "message", count: true },
    { href: "#/checklists", match: /^#\/checklists/, label: "Чек-лист", icon: "scale" },
    { href: "#/insights", match: /^#\/insights/, label: "Сводка", icon: "chart" }
  ];

  function header() {
    const count = h("span", { class: "da-count" });
    const links = NAV.map((n) => h("a", { href: n.href }, DA.icon(n.icon), h("span", { class: "da-nav-text" }, n.label), n.count ? count : null));
    const role = DA.segmented([{ value: "analyst", label: "Аналитик" }, { value: "reviewer", label: "Проверяющий" }], DA.state.role, (v) => DA.setRole(v), "Роль");
    const el = h("header", { class: "da-header" },
      h("a", { class: "da-wordmark", href: "#/" }, "DataAvengers"),
      h("nav", { class: "da-nav", "aria-label": "Разделы" }, links),
      h("div", { class: "da-header-end" },
        h("span", { class: "da-model", title: "Сейчас интерфейс работает на тестовых ответах из папки data" }, "Тестовые данные"),
        role,
        h("button", { class: "da-btn is-text is-sm", title: "Вернуть тестовые данные к исходным", onclick: () => DA.resetState() }, "Сбросить")));
    function sync() {
      const n = DA.openAppeals().length;
      const was = count.textContent;
      count.textContent = n;
      count.hidden = !n;
      if (was && was !== String(n)) { count.classList.remove("is-bump"); void count.offsetWidth; count.classList.add("is-bump"); }
      links.forEach((a, i) => (NAV[i].match.test(location.hash || "#/") ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    }
    window.addEventListener("da:appeals-changed", sync);
    window.addEventListener("hashchange", sync);
    el.setRole = (v) => role.setValue(v);
    sync();
    return el;
  }

  DA.setRole = function (v) {
    DA.state.role = v;
    DA.save();
    DA.headerEl.setRole(v);
    DA.route();
  };

  DA.route = function () {
    const hash = location.hash || "#/";
    const [path, qs] = hash.slice(1).split("?");
    const query = Object.fromEntries(new URLSearchParams(qs || ""));
    const main = document.getElementById("da-main");
    if (unmount) unmount();
    main.replaceChildren();
    let m;
    if (path === "/" || path === "") unmount = DA.views.registry(main, { query });
    else if ((m = path.match(/^\/c\/([^/]+)$/))) unmount = DA.views.card(main, { id: decodeURIComponent(m[1]), query });
    else if (path === "/appeals") unmount = DA.views.appeals(main, { query });
    else if (path === "/checklists") unmount = DA.views.checklists(main, { query });
    else if (path === "/insights") unmount = DA.views.insights(main, { query });
    else {
      main.append(h("div", { class: "da-page" }, h("div", { class: "da-empty" }, h("h2", { tabindex: -1 }, "Такой страницы нет"), h("a", { class: "da-btn", href: "#/" }, "К списку диалогов"))));
      unmount = null;
    }
    const title = main.querySelector("h1, h2");
    if (title) title.focus({ preventScroll: true });
    if (!path.startsWith("/c/")) window.scrollTo(0, 0);
  };

  DA.initState();
  DA.headerEl = header();
  document.body.prepend(DA.headerEl);
  window.addEventListener("hashchange", DA.route);
  DA.route();
})();
