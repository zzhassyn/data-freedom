/* Боковое меню и маршрутизация через хэш: в веб-ресурсе Dynamics 365 путь сервера недоступен. */
(function () {
  const DA = window.DA, h = DA.h;
  let unmount = null;

  /* Меню по роли. Входа в систему нет, роль выбирается переключателем внизу меню. */
  const NAV = {
    analyst: [
      { href: "#/", match: /^#\/(c\/.*|\?.*)?$/, label: "Обращения", icon: "list" },
      { href: "#/appeals", match: /^#\/appeals/, label: "Апелляции", icon: "message", count: true },
      { href: "#/checklists", match: /^#\/checklists/, label: "Чек-лист", icon: "scale" },
      { href: "#/insights", match: /^#\/insights/, label: "Сводка", icon: "chart" }
    ],
    reviewer: [
      { href: "#/review", match: /^#\/review(\/(?!done$)[^/]+)?$/, label: "Очередь", icon: "message", count: true },
      { href: "#/review/done", match: /^#\/review\/done$/, label: "Решённые", icon: "check" }
    ]
  };
  const home = () => (DA.state.role === "reviewer" ? "#/review" : "#/");
  const narrow = () => matchMedia("(max-width: 900px)").matches;

  function sidebar() {
    const count = h("span", { class: "da-count" });
    const nav = h("nav", { class: "da-side-nav", "aria-label": "Разделы" });
    let items = [], links = [];
    const role = DA.segmented([{ value: "analyst", label: "Аналитик" }, { value: "reviewer", label: "Проверяющий" }], DA.state.role, (v) => DA.setRole(v), "Режим работы");
    const toggle = h("button", { class: "da-burger", type: "button", "aria-label": "Свернуть или развернуть меню", onclick: () => setOpen(document.body.dataset.sidebar !== "open") }, DA.icon("menu"));
    const marks = [0, 1].map(() => h("a", { class: "da-wordmark", href: home() }, h("b", {}, "Data"), "Avengers"));
    const el = h("aside", { class: "da-side" },
      h("div", { class: "da-side-top" }, toggle, marks[0]),
      nav,
      h("div", { class: "da-side-bottom" }, h("div", { class: "da-label" }, "Режим работы"), role));
    const mobileBar = h("div", { class: "da-mobilebar" },
      h("button", { class: "da-burger", type: "button", "aria-label": "Открыть меню", onclick: () => setOpen(true) }, DA.icon("menu")),
      marks[1]);
    const scrim = h("div", { class: "da-side-scrim", onclick: () => setOpen(false) });

    function setOpen(open) {
      document.body.dataset.sidebar = open ? "open" : "closed";
      if (!narrow()) { DA.state.sidebar = document.body.dataset.sidebar; DA.save(); }
    }
    /* Пункты меню собираются заново при смене роли и въезжают по очереди. */
    function renderNav(animate) {
      items = NAV[DA.state.role] || NAV.analyst;
      links = items.map((n, i) => h("a", { class: "da-side-link" + (animate ? " is-entering" : ""), href: n.href, title: n.label, style: animate ? { animationDelay: i * 40 + "ms" } : null },
        DA.icon(n.icon), h("span", { class: "da-side-text" }, n.label), n.count ? count : null));
      nav.replaceChildren(...links);
      marks.forEach((a) => a.setAttribute("href", home()));
      sync();
    }
    function sync() {
      const n = DA.openAppeals().length;
      const was = count.textContent;
      count.textContent = n;
      count.hidden = !n;
      if (was && was !== String(n)) { count.classList.remove("is-bump"); void count.offsetWidth; count.classList.add("is-bump"); }
      links.forEach((a, i) => (items[i].match.test(location.hash || "#/") ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
      if (narrow()) document.body.dataset.sidebar = "closed";
    }
    document.body.dataset.sidebar = narrow() ? "closed" : DA.state.sidebar || "open";
    matchMedia("(max-width: 900px)").addEventListener("change", (e) => (document.body.dataset.sidebar = e.matches ? "closed" : DA.state.sidebar || "open"));
    window.addEventListener("da:appeals-changed", sync);
    window.addEventListener("hashchange", sync);
    renderNav(false);
    return { el, mobileBar, scrim, setRole: (v) => role.setValue(v), renderNav, sync };
  }

  /* Проверяющий сразу попадает в очередь. Аналитик со страниц проверяющего возвращается к обращениям. */
  DA.setRole = function (v) {
    DA.state.role = v;
    DA.save();
    DA.side.setRole(v);
    DA.side.renderNav(true);
    const target = location.hash.startsWith("#/lab/accuracy") ? null : v === "reviewer" ? "#/review" : /^#\/review/.test(location.hash) ? "#/" : null;
    if (target && location.hash !== target) location.hash = target;
    else DA.route();
  };

  const ROUTES = [
    [/^\/?$/, (m, query) => DA.views.registry(main(), { query })],
    [/^\/c\/([^/]+)$/, (m, query) => DA.views.card(main(), { id: decodeURIComponent(m[1]), query })],
    [/^\/appeals$/, (m, query) => DA.views.appeals(main(), { query })],
    [/^\/checklists$/, (m, query) => DA.views.checklists(main(), { query })],
    [/^\/insights$/, (m, query) => DA.views.insights(main(), { query })],
    [/^\/lab\/accuracy$/, () => DA.views.accuracy(main())],
    [/^\/review$/, (m, query) => DA.views.review(main(), { query })],
    [/^\/review\/done$/, (m, query) => DA.views.reviewDone(main(), { query })],
    [/^\/review\/([^/]+)$/, (m, query) => DA.views.review(main(), { id: decodeURIComponent(m[1]), query })]
  ];
  /* Карточка для проверяющего доступна только для чтения; внутренний экран точности общий. */
  const allowed = (path) => path === "/lab/accuracy" || (DA.state.role === "reviewer" ? /^\/(review(\/.*)?|c\/.+)$/.test(path) : !/^\/review(\/|$)/.test(path));
  const main = () => document.getElementById("da-main");

  DA.route = function () {
    const [path, qs] = (location.hash || "#/").slice(1).split("?");
    if (!allowed(path)) { location.replace(DA.state.role === "reviewer" ? "#/review" : "#/appeals"); return; }
    const query = Object.fromEntries(new URLSearchParams(qs || ""));
    if (unmount) unmount();
    unmount = null;
    main().replaceChildren();
    const hit = ROUTES.map(([re, fn]) => [path.match(re), fn]).find(([m]) => m);
    if (hit) unmount = hit[1](hit[0], query) || null;
    else main().append(h("div", { class: "da-page" }, h("div", { class: "da-empty" }, h("h2", { tabindex: -1 }, "Такой страницы нет"), h("a", { class: "da-btn", href: "#/" }, "К списку обращений"))));
    const title = main().querySelector("h1, h2");
    if (title) title.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    DA.side.sync();
  };

  DA.initState();
  DA.side = sidebar();
  document.body.prepend(DA.side.mobileBar, DA.side.el, DA.side.scrim);
  window.addEventListener("hashchange", DA.route);
  DA.route();
})();
