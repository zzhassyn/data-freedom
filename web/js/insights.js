/* Сводка: выполнение критериев по языкам и операторы. */
(function () {
  const DA = window.DA, h = DA.h;

  const LANGS = ["RU", "KZ", "EN"];
  const TABS = [{ value: "quality", label: "Качество" }, { value: "operators", label: "Операторы" }];
  const BUCKETS = [[0, 49], [50, 69], [70, 84], [85, 100]];
  const pct = (x) => `${Math.round(x * 100)} %`;
  const convForms = ["обращение", "обращения", "обращений"];
  const nConv = (n) => `${n} ${DA.fmt.plural(n, convForms)}`;

  /* ---------- Данные ---------- */
  const evaluated = () => Object.values(DA.state.evaluations)
    .filter((ev) => ev && !ev.stale && ev.total != null && DA.state.conversations[ev.conversationId])
    .sort((a, b) => DA.state.numbers[a.conversationId] - DA.state.numbers[b.conversationId]);

  function doneItem(ev, criterionId) {
    const item = ev.items.find((i) => i.criterionId === criterionId && i.status === "done");
    const c = item && DA.criterionById(DA.checklist(ev.checklistVersion), criterionId);
    return c ? { item, c } : null;
  }
  const fraction = (answer, c) => (c.type === "scale" ? answer / DA.scaleMax(c) : answer === "yes" ? 1 : 0);

  /* Доли ответов и выполнение одного критерия: набранные баллы от возможных, N/A не в счёт. */
  function cellStats(evs, criterionId) {
    const s = { yes: 0, partial: 0, no: 0, na: 0, flag: 0, earned: 0, possible: 0, cids: [], c: null };
    for (const ev of evs) {
      const hit = doneItem(ev, criterionId);
      if (!hit) continue;
      s.c = hit.c;
      s[DA.tone(hit.item.answer, hit.c)]++;
      s.cids.push(ev.conversationId);
      if (hit.item.answer !== "na") { s.earned += fraction(hit.item.answer, hit.c); s.possible++; }
    }
    s.n = s.cids.length;
    s.rate = s.possible ? s.earned / s.possible : null;
    return s;
  }

  /* Критерий с наименьшим выполнением. Если всё выполнено полностью, слабого места нет. */
  function weakest(cl, evs) {
    let worst = null;
    for (const c of cl.criteria) {
      if (c.type === "flag") continue;
      const s = cellStats(evs, c.id);
      if (s.rate != null && s.rate < 1 && (!worst || s.rate < worst.stats.rate)) worst = { c, stats: s };
    }
    return worst;
  }

  const average = (evs) => (evs.length ? evs.reduce((s, ev) => s + ev.total, 0) / evs.length : null);

  /* Имя оператора из его первой реплики. Казахское «мен Айбекпін» теряет окончание сказуемого. */
  const NAME_RULES = [
    { re: /[Мм]еня зовут\s+(\p{Lu}\p{Ll}+)/u },
    { re: /[Мм]енің атым\s+(\p{Lu}\p{Ll}+)/u },
    { re: /[Mm]y name is\s+(\p{Lu}\p{Ll}+)/u },
    { re: /(?<!\p{L})I['’]m\s+(\p{Lu}\p{Ll}+)/u },
    { re: /(?<!\p{L})[Яя]\s+(\p{Lu}\p{Ll}+)/u },
    { re: /(?<!\p{L})[Мм]ен\s+(\p{Lu}\p{Ll}+)/u, kz: true }
  ];
  const NOT_NAMES = new Set(["Вам", "Вас", "Вы", "Сейчас", "Сіз", "Сізге"]);
  const HIDDEN_NAME = /\[(?:имя скрыто|персональные данные скрыты|аты[\s-]*жөні жасырылған|аты жасырылған|есімі жасырылған|жеке (?:деректер|мәліметтер) жасырылған|name (?:hidden|redacted)|personal (?:data|information) (?:hidden|redacted))\]/iu;
  function operatorName(conv) {
    const first = conv.transcript.find((t) => t.speaker === "operator");
    if (!first) return null;
    for (const rule of NAME_RULES) {
      const m = first.text.match(rule.re);
      if (!m || NOT_NAMES.has(m[1])) continue;
      const name = rule.kz ? m[1].replace(/(мын|мін|пын|пін|бын|бін)$/u, "") : m[1];
      if (name.length > 1) return name;
    }
    return null;
  }

  function operators() {
    const byName = new Map();
    let botOnly = 0;
    for (const conv of Object.values(DA.state.conversations)) {
      const turns = conv.transcript.filter((t) => t.speaker === "operator");
      if (!turns.length) { botOnly++; continue; }
      const name = operatorName(conv);
      const kind = name ? "named" : turns.some((t) => HIDDEN_NAME.test(t.text)) ? "hidden" : "missing";
      const key = kind === "named" ? "name:" + name : kind;
      if (!byName.has(key)) byName.set(key, { name: name || (kind === "hidden" ? "Имя скрыто в записи" : "Оператор не представился"), kind, convs: [] });
      byName.get(key).convs.push(conv.conversation_id);
    }
    const evs = evaluated(), cl = DA.activeChecklist();
    const rows = [...byName.values()].map((op) => {
      op.convs.sort((a, b) => DA.state.numbers[a] - DA.state.numbers[b]);
      op.evs = evs.filter((ev) => op.convs.includes(ev.conversationId));
      op.avg = average(op.evs);
      op.weak = weakest(cl, op.evs);
      op.gross = op.evs.filter((ev) => ev.grossFlagged).length;
      return op;
    });
    const order = { named: 0, missing: 1, hidden: 2 };
    const shown = rows.filter((op) => op.evs.length || op.kind !== "named")
      .sort((a, b) => order[a.kind] - order[b.kind] || b.avg - a.avg || b.evs.length - a.evs.length);
    const hiddenConvs = rows.filter((op) => !op.evs.length && op.kind === "named").reduce((s, op) => s + op.convs.length, 0);
    return { shown, hiddenConvs, botOnly };
  }

  /* ---------- Мелкие элементы ---------- */
  const TONES = ["yes", "partial", "no", "na"];
  const toneLabel = (tone, c) => ({ yes: c && c.type === "scale" ? "Полный балл" : "Да", partial: "Частично", no: "Нет", na: "N/A" })[tone];

  function stackBar(parts, cls) {
    const total = parts.reduce((s, p) => s + p.n, 0);
    return h("div", { class: "da-ins-stack" + (cls ? " " + cls : ""), "aria-hidden": "true" },
      total ? parts.filter((p) => p.n).map((p) => h("i", { class: `t-${p.tone}`, style: { flexGrow: p.n } })) : null);
  }

  function convLink(cid, extra) {
    const conv = DA.state.conversations[cid];
    return h("a", { class: "da-ins-conv", href: `#/c/${encodeURIComponent(cid)}` + (extra || "") },
      h("b", { class: "da-num" }, `№ ${DA.convNumber(cid)}`),
      h("span", { class: "da-muted" }, `${DA.langLabel[conv.language]}, ${DA.channelLabel(conv).toLowerCase()}`));
  }

  /* ---------- Качество ---------- */
  function quality(evs) {
    const cl = DA.activeChecklist();
    if (!evs.length) return emptyQuality();
    const cols = [{ key: null, label: "Все", evs }, ...LANGS.map((l) => ({ key: l, label: DA.langLabel[l], evs: evs.filter((ev) => DA.state.conversations[ev.conversationId].language === l) }))];
    const weak = weakest(cl, evs);

    const head = h("tr", {}, h("th", { scope: "col" }, "Критерий"),
      cols.map((col) => h("th", { scope: "col" }, col.label, h("small", {}, col.evs.length ? nConv(col.evs.length) : "нет оценок"))));
    const body = [];
    let i = 0;
    for (const sec of cl.sections.slice().sort((a, b) => a.order - b.order)) {
      const crits = cl.criteria.filter((c) => c.sectionId === sec.id && c.type !== "flag").sort((a, b) => a.order - b.order);
      if (!crits.length) continue;
      body.push(h("tr", { class: "da-ins-sec" }, h("th", { colspan: cols.length + 1, scope: "colgroup" }, sec.title)));
      for (const c of crits) {
        body.push(h("tr", {},
          h("th", { scope: "row" }, h("span", {}, c.title), weak && weak.c.id === c.id ? h("span", { class: "da-ins-weak" }, "Слабое место") : null),
          cols.map((col) => h("td", {}, matrixCell(c, col, i++)))));
      }
    }
    const gross = cl.criteria.find((c) => c.type === "flag");
    const grossRow = gross ? h("tbody", { class: "da-ins-gross-row" }, h("tr", {},
      h("th", { scope: "row" }, gross.title),
      cols.map((col) => {
        const s = cellStats(col.evs, gross.id);
        if (!s.n) return h("td", {}, h("span", { class: "da-ins-dash" }, "—"));
        return h("td", {}, s.flag ? h("span", { class: "da-ins-flag" }, DA.icon("flag", 14), `в ${s.flag} из ${s.n}`) : h("span", { class: "da-muted" }, "не найдены"));
      }))) : null;

    return h("div", { class: "da-ins-quality" },
      h("div", { class: "da-ins-matrix-wrap" }, h("table", { class: "da-ins-matrix" }, h("thead", {}, head), h("tbody", {}, body), grossRow)),
      h("div", { class: "da-ins-trio" }, totalsBlock(evs), grossBlock(evs), appealsBlock()));
  }

  function matrixCell(c, col, i) {
    const s = cellStats(col.evs, c.id);
    if (!s.n) return h("span", { class: "da-ins-dash", "aria-label": "Нет оценок" }, "—");
    const href = col.key ? `#/?lang=${col.key}&state=done` : "#/?state=done";
    const cell = h("a", { class: "da-ins-cell", href, style: { "--i": i },
      "aria-label": `${c.title}, ${col.label.toLowerCase()}: ${s.rate == null ? "везде N/A" : "выполнено " + pct(s.rate)}` },
      h("span", { class: "da-ins-rate" + (s.rate == null ? " is-na" : "") }, s.rate == null ? "N/A" : pct(s.rate)),
      stackBar(TONES.map((tone) => ({ tone, n: s[tone] }))));
    DA.hoverCard(cell, () => [
      h("div", { class: "da-hc-title" }, `${col.key ? col.label : "Все языки"}: ${nConv(s.n)}. ${TONES.filter((t) => s[t]).map((t) => `${toneLabel(t, c)} ${s[t]}`).join(", ")}`),
      h("ul", { class: "da-hc-list" }, TONES.filter((t) => s[t]).map((t) => h("li", {}, h("i", { class: `da-swatch t-${t}` }), h("span", {}, toneLabel(t, c)),
        h("b", {}, s.cids.filter((cid) => DA.tone(doneItem(DA.state.evaluations[cid], c.id).item.answer, c) === t).map((cid) => `№ ${DA.convNumber(cid)}`).join(", "))))),
      h("p", { class: "da-hc-note" }, "Нажмите, чтобы открыть эти обращения в списке.")
    ]);
    return cell;
  }

  function totalsBlock(evs) {
    const counts = BUCKETS.map(([lo, hi]) => evs.filter((ev) => ev.total >= lo && (hi === 100 ? ev.total <= 100 : ev.total < hi + 1)).length);
    const max = Math.max(1, ...counts);
    return h("section", { class: "da-ins-block is-totals" },
      h("h2", {}, "Средний итог"),
      h("div", { class: "da-ins-big" }, DA.fmt.score(average(evs)), h("small", {}, "из 100")),
      h("div", { class: "da-ins-hist", role: "img", "aria-label": "Распределение итогов: " + BUCKETS.map(([lo, hi], i) => `${lo}–${hi}: ${counts[i]}`).join(", ") },
        BUCKETS.map(([lo, hi], i) => h("div", { class: "da-ins-col" },
          h("b", { class: counts[i] ? "" : "da-quiet" }, counts[i]),
          h("i", { style: { height: `${(counts[i] / max) * 100}%`, "--i": i }, class: counts[i] ? "" : "is-zero" }),
          h("span", {}, `${lo}–${hi}`)))));
  }

  function grossBlock(evs) {
    const found = evs.filter((ev) => ev.grossFlagged);
    return h("section", { class: "da-ins-block" },
      h("h2", {}, "Грубые ошибки"),
      found.length
        ? h("div", { class: "da-ins-convs" }, found.map((ev) => convLink(ev.conversationId, "?criterion=gross")))
        : h("div", { class: "da-ins-clean" }, h("span", { class: "da-ins-ok" }, DA.icon("check", 16)),
          h("div", {}, h("b", {}, "Грубых ошибок не найдено"), h("p", {}, `Проверено ${nConv(evs.length)}.`))));
  }

  function appealsBlock() {
    const all = DA.state.appeals;
    const parts = [
      { tone: "confirmed", n: all.filter((a) => a.status === "confirmed").length, label: "Оценка подтверждена" },
      { tone: "changed", n: all.filter((a) => a.status === "changed").length, label: "Оценка изменена" },
      { tone: "open", n: all.filter((a) => a.status === "open").length, label: "На рассмотрении" }
    ];
    return h("section", { class: "da-ins-block" },
      h("h2", {}, "Апелляции"),
      h("div", { class: "da-ins-big" }, all.length, h("small", {}, DA.fmt.plural(all.length, ["подана", "поданы", "подано"]))),
      all.length ? stackBar(parts, "is-appeals") : null,
      all.length
        ? h("ul", { class: "da-ins-legend" }, parts.map((p) => h("li", { class: p.n ? "" : "is-zero" }, h("i", { class: `da-ins-dot t-${p.tone}` }), h("span", {}, p.label), h("b", {}, p.n))))
        : h("p", { class: "da-muted da-small" }, "Оценки пока никто не оспаривал."),
      all.length ? h("a", { class: "da-btn is-text is-sm da-ins-more", href: "#/appeals" }, "Открыть апелляции") : null);
  }

  function emptyQuality() {
    return h("div", { class: "da-empty" },
      h("div", { class: "da-empty-ribbon", "aria-hidden": "true" }, [10, 15, 20, 20, 15, 15, 5].map((w) => h("i", { style: { "--w": w } }))),
      h("h2", {}, "Сводка появится после первой оценки"),
      h("p", {}, "Здесь будет видно, какие пункты чек-листа выполняются хуже всего и на каком языке."),
      h("a", { class: "da-btn", href: "#/" }, "К списку обращений"));
  }

  /* ---------- Операторы ---------- */
  function operatorsView() {
    const { shown, hiddenConvs, botOnly } = operators();
    const list = h("div", { class: "da-ins-ops", role: "list" },
      h("div", { class: "da-ins-op-head", "aria-hidden": "true" },
        h("span", {}, "Оператор"), h("span", {}, "Обращений"), h("span", {}, "Средний итог"), h("span", {}, "Слабое место"), h("span", {}, "Грубые ошибки")),
      shown.map((op, i) => operatorRow(op, i)));
    return h("div", {}, shown.length ? list : emptyQuality(),
      botOnly ? h("p", { class: "da-ins-after" }, `${nConv(botOnly)} закрыл бот без оператора`) : null,
      hiddenConvs ? h("p", { class: "da-ins-after" }, `и ещё ${hiddenConvs} ${DA.fmt.plural(hiddenConvs, convForms)} без оценки: операторы появятся здесь, когда их обращения оценят`) : null);
  }

  function operatorRow(op, i) {
    const weakText = !op.weak ? null : op.weak.stats.possible >= 5
      ? `выполняет в ${pct(op.weak.stats.yes / op.weak.stats.possible)} обращений`
      : `выполняет в ${op.weak.stats.yes} из ${op.weak.stats.possible} ${DA.fmt.plural(op.weak.stats.possible, ["обращения", "обращений", "обращений"])}`;
    const panel = h("div", { class: "da-ins-op-panel", id: `da-op-${i}` },
      h("div", { class: "da-ins-op-inner" },
        op.convs.map((cid) => {
          const ev = DA.state.evaluations[cid];
          const conv = DA.state.conversations[cid];
          return h("a", { class: "da-ins-op-conv", href: `#/c/${encodeURIComponent(cid)}` },
            h("b", { class: "da-num" }, `№ ${DA.convNumber(cid)}`),
            h("span", { class: "da-ins-op-preview" }, DA.tx.preview(conv)),
            ev && !ev.stale && ev.total != null
              ? h("span", { class: "da-ins-op-total" }, ev.grossFlagged ? h("span", { class: "da-flag", title: "Грубая ошибка" }, DA.icon("flag", 14)) : null, DA.fmt.score(ev.total))
              : h("span", { class: "da-quiet" }, "Не оценено"));
        })));
    const row = h("button", { class: "da-ins-op", type: "button", "aria-expanded": "false", "aria-controls": `da-op-${i}` },
      h("span", { class: "da-ins-op-name" },
        h("span", { class: "da-ins-chev" }, DA.icon("chevron", 16)),
        h("span", {}, h("b", { class: op.kind === "named" ? "" : "is-unnamed" },
          op.kind === "missing" ? h("span", { class: "da-review", title: "В этих обращениях оператор не назвал имя в первом ответе" }, DA.icon("alert", 16)) : null, op.name),
          h("small", {}, `Оценено ${op.evs.length} из ${op.convs.length}`))),
      h("span", { class: "da-ins-op-n" }, h("i", { class: "da-ins-m" }, "Обращений "), op.convs.length),
      h("span", { class: "da-ins-op-avg" }, h("b", {}, DA.fmt.score(op.avg)), op.avg != null ? h("span", { class: "da-ins-meter" }, h("i", { style: { width: op.avg + "%", "--i": i } })) : null),
      h("span", { class: "da-ins-op-weak" }, op.kind === "missing" ? [h("b", {}, "Установление контакта"), h("small", {}, "Не названо имя в первом ответе")] : op.weak ? [h("b", {}, op.weak.c.title), h("small", {}, weakText)] : h("span", { class: "da-quiet" }, op.evs.length ? "Слабых мест нет" : "Нет оценок")),
      h("span", { class: "da-ins-op-gross" }, op.gross ? h("span", { class: "da-ins-flag" }, DA.icon("flag", 14), op.gross) : h("span", { class: "da-quiet" }, op.evs.length ? "Нет" : "Нет оценок")));
    if (op.kind === "missing") DA.hoverCard(row, () => "В этих обращениях оператор не назвал имя в первом ответе");
    row.addEventListener("click", () => {
      const open = row.getAttribute("aria-expanded") !== "true";
      row.setAttribute("aria-expanded", String(open));
      wrap.classList.toggle("is-open", open);
    });
    const wrap = h("div", { class: "da-ins-op-wrap", role: "listitem" }, row, panel);
    return wrap;
  }

  /* ---------- Экран ---------- */
  DA.views = DA.views || {};
  DA.views.insights = function mount(root, params) {
    let tab = TABS.some((t) => t.value === params.query.tab) ? params.query.tab : "quality";
    const body = h("div", { class: "da-ins-body" });
    const seg = DA.segmented(TABS, tab, (v) => {
      tab = v;
      history.replaceState(null, "", v === "quality" ? "#/insights" : `#/insights?tab=${v}`);
      render();
    }, "Раздел сводки");

    function coverage(evs) {
      const total = Object.keys(DA.state.conversations).length;
      const forms = ["обращения", "обращений", "обращений"];
      return h("div", { class: "da-ins-cover" },
        h("span", {}, `Оценено ${evs.length} из ${total} ${DA.fmt.plural(total, forms)}`),
        evs.length < total ? h("span", { class: "da-ins-cover-bar", "aria-hidden": "true" }, h("i", { style: { width: (evs.length / total) * 100 + "%" } })) : null);
    }

    function render() {
      const evs = evaluated();
      const view = tab === "quality" ? quality(evs) : operatorsView();
      body.replaceChildren(coverage(evs), h("div", { class: "da-ins-tab", "data-tab": tab }, view));
    }

    root.append(h("div", { class: "da-page da-ins" },
      h("div", { class: "da-page-head da-ins-head" }, h("h1", { class: "da-h1", tabindex: -1 }, "Сводка"), seg),
      body));
    render();
    window.addEventListener("da:appeals-changed", render);
    return () => window.removeEventListener("da:appeals-changed", render);
  };
})();
