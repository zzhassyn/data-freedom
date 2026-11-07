/* Боковое меню и маршрутизация через хэш: в веб-ресурсе Dynamics 365 путь сервера недоступен. */
(function () {
  const DA = window.DA, h = DA.h;
  DA.i18n.addMessages({
    "app.conversations": { ru: "Обращения", kk: "Өтініштер", en: "Conversations" },
    "app.conversation": { ru: "Обращение", kk: "Өтініш", en: "Conversation" },
    "app.appeals": { ru: "Апелляции", kk: "Апелляциялар", en: "Appeals" },
    "app.checklist": { ru: "Чек-лист", kk: "Чек-парақ", en: "Checklist" },
    "app.insights": { ru: "Сводка", kk: "Жиынтық", en: "Overview" },
    "app.queue": { ru: "Очередь", kk: "Кезек", en: "Queue" },
    "app.decided": { ru: "Решённые", kk: "Шешілгендер", en: "Decided" },
    "app.reviewQueue": { ru: "Очередь апелляций", kk: "Апелляциялар кезегі", en: "Appeal queue" },
    "app.decidedAppeals": { ru: "Решённые апелляции", kk: "Шешілген апелляциялар", en: "Decided appeals" },
    "app.accuracy": { ru: "Точность оценки", kk: "Бағалау дәлдігі", en: "Evaluation accuracy" },
    "app.sections": { ru: "Разделы", kk: "Бөлімдер", en: "Sections" },
    "app.analyst": { ru: "Аналитик", kk: "Талдаушы", en: "Analyst" },
    "app.reviewer": { ru: "Проверяющий", kk: "Тексеруші", en: "Reviewer" },
    "app.role": { ru: "Режим работы", kk: "Жұмыс режимі", en: "Work mode" },
    "app.toggleMenu": { ru: "Свернуть или развернуть меню", kk: "Мәзірді жию немесе ашу", en: "Collapse or expand menu" },
    "app.openMenu": { ru: "Открыть меню", kk: "Мәзірді ашу", en: "Open menu" },
    "app.loading": { ru: "Загружаем данные", kk: "Деректер жүктелуде", en: "Loading data" },
    "app.loadError": { ru: "Не удалось загрузить данные", kk: "Деректерді жүктеу мүмкін болмады", en: "Could not load the data" },
    "app.openError": { ru: "Не удалось открыть страницу. Попробуйте ещё раз", kk: "Бетті ашу мүмкін болмады. Қайталап көріңіз", en: "Could not open the page. Try again" },
    "app.networkError": { ru: "Нет связи с сервером. Проверьте подключение и повторите запрос", kk: "Сервермен байланыс жоқ. Қосылымды тексеріп, қайталап көріңіз", en: "Cannot connect to the server. Check your connection and try again" },
    "app.responseError": { ru: "Не удалось прочитать ответ сервера. Повторите запрос", kk: "Сервер жауабын оқу мүмкін болмады. Қайталап көріңіз", en: "Could not read the server response. Try again" },
    "app.missingData": { ru: "Запрошенные данные не найдены. Вернитесь к списку и откройте их заново", kk: "Сұралған деректер табылмады. Тізімге оралып, қайта ашыңыз", en: "The requested data was not found. Return to the list and open it again" },
    "app.staleData": { ru: "Данные изменились. Откройте страницу заново", kk: "Деректер өзгерді. Бетті қайта ашыңыз", en: "The data has changed. Open the page again" },
    "app.retry": { ru: "Повторить", kk: "Қайталау", en: "Try again" },
    "app.notFound": { ru: "Такой страницы нет", kk: "Мұндай бет жоқ", en: "This page does not exist" },
    "app.backToWork": { ru: "Вернуться к работе", kk: "Жұмысқа оралу", en: "Back to work" }
  });
  const msg = (key) => DA.msg(`app.${key}`);
  let unmount = null, routeId = 0, routeRequest = null, ready = false, restored = false, healthStarted = false;

  /* Меню по роли. Входа в систему нет, роль выбирается переключателем внизу меню. */
  const NAV = {
    analyst: [
      { href: "#/", match: /^#\/(c\/.*|\?.*)?$/, label: "conversations", icon: "list" },
      { href: "#/appeals", match: /^#\/appeals/, label: "appeals", icon: "message", count: true },
      { href: "#/checklists", match: /^#\/checklists/, label: "checklist", icon: "scale" },
      { href: "#/insights", match: /^#\/insights/, label: "insights", icon: "chart" }
    ],
    reviewer: [
      { href: "#/review", match: /^#\/review(\/(?!done$)[^/]+)?$/, label: "queue", icon: "message", count: true },
      { href: "#/review/done", match: /^#\/review\/done$/, label: "decided", icon: "check" }
    ]
  };
  const home = () => (DA.state.role === "reviewer" ? "#/review" : "#/");
  const narrow = () => matchMedia("(max-width: 900px)").matches;

  function sidebar() {
    const count = h("span", { class: "da-count" });
    const nav = h("nav", { class: "da-side-nav", "aria-label": msg("sections") });
    let items = [], links = [];
    const role = DA.segmented([{ value: "analyst", label: msg("analyst") }, { value: "reviewer", label: msg("reviewer") }], DA.state.role, (v) => DA.setRole(v), msg("role"));
    const language = DA.i18n.createControl();
    const toggle = h("button", { class: "da-burger", type: "button", "aria-label": msg("toggleMenu"), onclick: () => setOpen(document.body.dataset.sidebar !== "open") }, DA.icon("menu"));
    const marks = [0, 1].map(() => h("a", { class: "da-wordmark", href: home() }, h("b", {}, "Data"), "Avengers"));
    const el = h("aside", { class: "da-side" },
      h("div", { class: "da-side-top" }, toggle, marks[0]),
      nav,
      h("div", { class: "da-side-bottom" },
        h("div", { class: "da-label" }, DA.msg("ui.language")), language,
        h("div", { class: "da-label" }, msg("role")), role));
    const mobileBar = h("div", { class: "da-mobilebar" },
      h("button", { class: "da-burger", type: "button", "aria-label": msg("openMenu"), onclick: () => setOpen(true) }, DA.icon("menu")),
      marks[1]);
    const scrim = h("div", { class: "da-side-scrim", onclick: () => setOpen(false) });

    function setOpen(open) {
      document.body.dataset.sidebar = open ? "open" : "closed";
      if (!narrow()) { DA.state.sidebar = document.body.dataset.sidebar; DA.save(); }
    }
    /* Пункты меню собираются заново при смене роли и въезжают по очереди. */
    function renderNav(animate) {
      items = NAV[DA.state.role] || NAV.analyst;
      links = items.map((n, i) => h("a", { class: "da-side-link" + (animate ? " is-entering" : ""), href: n.href, title: msg(n.label), style: animate ? { animationDelay: i * 40 + "ms" } : null },
        DA.icon(n.icon), h("span", { class: "da-side-text" }, msg(n.label)), n.count ? count : null));
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
    window.addEventListener("da:locale-changed", () => role.setValue(DA.state.role));
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

  const titles = { registry: "conversations", card: "conversation", appeals: "appeals", checklists: "checklist", insights: "insights", accuracy: "accuracy", review: "reviewQueue", reviewDone: "decidedAppeals" };
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
      h("div", { class: "da-page-head" }, h("h1", { class: "da-h1" }, msg(titles[scope])), skeleton("160px", "is-action")),
      h("span", { class: "da-sr", role: "status" }, msg("loading")),
      h("div", { "aria-hidden": "true" }, content)));
  }

  function errorState(scope, error) {
    const message = DA.msg(() => DA.apiErrorMessage(error));
    main().replaceChildren(h("div", { class: "da-page" },
      h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, msg(titles[scope]))),
      h("div", { class: "da-empty da-load-error", role: "alert" },
        h("h2", {}, msg("loadError")), h("p", {}, message),
        h("button", { class: "da-btn is-primary", type: "button", onclick: () => DA.route() }, DA.icon("refresh"), msg("retry")))));
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
        if (!healthStarted) {
          healthStarted = true;
          DA.api.health({ timeout: 5000 }).then((health) => { if (health?.ok) DA.health = health; }).catch(() => {});
        }
        await DA.data.prepare(hit[1], { id: hit[0][1] ? decodeURIComponent(hit[0][1]) : null,
          evaluationId: query.evaluation, refresh: true, signal: request.signal });
        if (current !== routeId || request.signal.aborted) return;
        DA.backendAvailable = true;
        main().replaceChildren();
        unmount = hit[2](hit[0], query) || null;
        if (!restored) { restored = true; DA.bulk?.restore(); DA.stt?.restore(); }
      } catch (error) {
        if (current !== routeId || request.signal.aborted) return;
        errorState(hit[1], error);
      }
    } else main().replaceChildren(h("div", { class: "da-page" }, h("div", { class: "da-empty" }, h("h2", { tabindex: -1 }, msg("notFound")), h("a", { class: "da-btn", href: home() }, msg("backToWork")))));
    main().removeAttribute("aria-busy");
    const title = main().querySelector("h1, h2");
    if (title) title.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    DA.side.sync();
  };

  async function start() {
    DA.initState();
    DA.side = sidebar();
    document.body.prepend(DA.side.mobileBar, DA.side.el, DA.side.scrim);
    ready = true;
    window.addEventListener("hashchange", DA.route);
    await DA.route();
  }
  start();
})();
