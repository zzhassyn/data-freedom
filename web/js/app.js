/* Боковое меню и маршрутизация через хэш: в веб-ресурсе Dynamics 365 путь сервера недоступен. */
(function () {
  const DA = window.DA, h = DA.h;
  let unmount = null, routeId = 0, routeRequest = null, ready = false;

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
    [/^\/?$/, "registry", (m, query) => DA.views.registry(main(), { query })],
    [/^\/c\/([^/]+)$/, "card", (m, query) => DA.views.card(main(), { id: decodeURIComponent(m[1]), query })],
    [/^\/appeals$/, "appeals", (m, query) => DA.views.appeals(main(), { query })],
    [/^\/checklists$/, "checklists", (m, query) => DA.views.checklistView(main(), { query })],
    [/^\/checklists\/edit$/, "checklists", (m, query) => DA.views.checklistEdit(main(), { query })],
    [/^\/checklists\/apply\/(\d+)$/, "checklists", (m, query) => DA.views.apply(main(), { version: Number(m[1]), query })],
    [/^\/insights$/, "insights", (m, query) => DA.views.insights(main(), { query })],
    [/^\/lab\/accuracy$/, "accuracy", () => DA.views.accuracy(main())],
    [/^\/review$/, "review", (m, query) => DA.views.review(main(), { query })],
    [/^\/review\/done$/, "reviewDone", (m, query) => DA.views.reviewDone(main(), { query })],
    [/^\/review\/([^/]+)$/, "review", (m, query) => DA.views.review(main(), { id: decodeURIComponent(m[1]), query })]
  ];
  /* Карточка для проверяющего доступна только для чтения; внутренний экран точности общий. */
  const allowed = (path) => path === "/lab/accuracy" || (DA.state.role === "reviewer" ? /^\/(review(\/.*)?|c\/.+)$/.test(path) : !/^\/review(\/|$)/.test(path));
  const main = () => document.getElementById("da-main");

  const titles = { registry: "Обращения", card: "Обращение", appeals: "Апелляции", checklists: "Чек-лист", insights: "Сводка", accuracy: "Точность оценки", review: "Очередь апелляций", reviewDone: "Решённые апелляции" };
  const skeleton = (width, cls) => h("div", { class: "da-skel" + (cls ? " " + cls : ""), style: { width } });
  function loadingState(scope) {
    const row = () => h("div", { class: "da-load-row" }, skeleton("52%"), skeleton("90%"), skeleton("38%"));
    const lines = (n) => Array.from({ length: n }, row);
    let content;
    if (scope === "card" || scope === "review") {
      content = h("div", { class: "da-load-columns" },
        h("div", { class: "da-load-paper da-load-transcript" }, lines(6)),
        h("div", { class: "da-load-paper" }, skeleton("42%", "is-total"), skeleton("100%", "is-ribbon"), lines(5)));
    } else if (scope === "checklists") {
      content = h("div", { class: "da-load-columns is-editor" },
        h("div", { class: "da-load-paper" }, lines(6)),
        h("div", { class: "da-load-paper" }, skeleton("55%", "is-heading"), lines(4)));
    } else {
      content = h("div", { class: "da-load-paper da-load-list" + (scope === "registry" || scope === "insights" ? " is-table" : "") }, lines(7));
    }
    main().setAttribute("aria-busy", "true");
    main().replaceChildren(h("div", { class: "da-page da-loading" },
      h("div", { class: "da-page-head" }, h("h1", { class: "da-h1" }, titles[scope]), skeleton("160px", "is-action")),
      h("span", { class: "da-sr", role: "status" }, "Загружаем данные"),
      h("div", { "aria-hidden": "true" }, content)));
  }

  function errorState(scope, error) {
    const message = error instanceof DA.ApiError ? error.message : "Не удалось открыть страницу. Попробуйте ещё раз";
    main().replaceChildren(h("div", { class: "da-page" },
      h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, titles[scope])),
      h("div", { class: "da-empty da-load-error", role: "alert" },
        h("h2", {}, "Не удалось загрузить данные"), h("p", {}, message),
        h("button", { class: "da-btn is-primary", type: "button", onclick: () => DA.route() }, DA.icon("refresh"), "Повторить"))));
  }

  DA.route = async function () {
    if (!ready) return;
    const current = ++routeId;
    routeRequest?.abort();
    const request = routeRequest = new AbortController();
    const [path, qs] = (location.hash || "#/").slice(1).split("?");
    if (!allowed(path)) { location.replace(DA.state.role === "reviewer" ? "#/review" : "#/appeals"); return; }
    const query = Object.fromEntries(new URLSearchParams(qs || ""));
    if (unmount) unmount();
    unmount = null;
    const hit = ROUTES.map(([re, scope, fn]) => [path.match(re), scope, fn]).find(([m]) => m);
    if (hit) {
      loadingState(hit[1]);
      try {
        await DA.data.prepare(hit[1], { id: hit[0][1] ? decodeURIComponent(hit[0][1]) : null,
          evaluationId: query.evaluation, refresh: true, signal: request.signal });
        if (current !== routeId || request.signal.aborted) return;
        main().replaceChildren();
        unmount = hit[2](hit[0], query) || null;
      } catch (error) {
        if (current !== routeId || request.signal.aborted) return;
        errorState(hit[1], error);
      }
    } else main().replaceChildren(h("div", { class: "da-page" }, h("div", { class: "da-empty" }, h("h2", { tabindex: -1 }, "Такой страницы нет"), h("a", { class: "da-btn", href: home() }, "Вернуться к работе"))));
    main().removeAttribute("aria-busy");
    const title = main().querySelector("h1, h2");
    if (title) title.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    DA.side.sync();
  };

  async function start() {
    loadingState("registry");
    await DA.api.detect();
    DA.initState();
    DA.side = sidebar();
    document.body.prepend(DA.side.mobileBar, DA.side.el, DA.side.scrim);
    DA.bulk?.restore();
    ready = true;
    window.addEventListener("hashchange", DA.route);
    await DA.route();
  }
  start();
})();
