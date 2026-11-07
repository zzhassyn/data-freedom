/* Сводка: выполнение критериев по языкам, операторы, совпадение модели с ручной разметкой. */
(function () {
  const DA = window.DA, h = DA.h;

  const LANGS = ["RU", "KZ", "EN"];
  const TABS = [{ value: "quality", label: "Качество" }, { value: "operators", label: "Операторы" }, { value: "accuracy", label: "Точность модели" }];
  const BUCKETS = [[0, 49], [50, 69], [70, 84], [85, 100]];
  const GOLD_KEY = "da.gold";
  const one = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
  const pct = (x) => `${Math.round(x * 100)} %`;
  const convForms = ["обращение", "обращения", "обращений"];
  const nConv = (n) => `${n} ${DA.fmt.plural(n, convForms)}`;

  /* ---------- Данные ---------- */
  const evaluated = () => Object.values(DA.state.evaluations)
    .filter((ev) => ev && ev.total != null && DA.state.conversations[ev.conversationId])
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
    for (const conv of Object.values(DA.state.conversations)) {
      const name = operatorName(conv);
      const key = name || "";
      if (!byName.has(key)) byName.set(key, { name, convs: [] });
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
    const shown = rows.filter((op) => op.evs.length)
      .sort((a, b) => (!a.name) - (!b.name) || b.avg - a.avg || b.evs.length - a.evs.length);
    const hiddenConvs = rows.filter((op) => !op.evs.length).reduce((s, op) => s + op.convs.length, 0);
    return { shown, hiddenConvs };
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
    const href = col.key ? `#/?lang=${col.key}` : "#/?state=done";
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
    const { shown, hiddenConvs } = operators();
    if (!shown.length) return emptyQuality();
    const list = h("div", { class: "da-ins-ops", role: "list" },
      h("div", { class: "da-ins-op-head", "aria-hidden": "true" },
        h("span", {}, "Оператор"), h("span", {}, "Обращений"), h("span", {}, "Средний итог"), h("span", {}, "Слабое место"), h("span", {}, "Грубые ошибки")),
      shown.map((op, i) => operatorRow(op, i)));
    return h("div", {}, list,
      hiddenConvs ? h("p", { class: "da-ins-after" }, `и ещё ${hiddenConvs} ${DA.fmt.plural(hiddenConvs, convForms)} без оценки: операторы появятся здесь, когда их обращения оценят`) : null);
  }

  function operatorRow(op, i) {
    const rest = op.convs.length - op.evs.length;
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
            ev && ev.total != null
              ? h("span", { class: "da-ins-op-total" }, ev.grossFlagged ? h("span", { class: "da-flag", title: "Грубая ошибка" }, DA.icon("flag", 14)) : null, DA.fmt.score(ev.total))
              : h("span", { class: "da-quiet" }, "Не оценено"));
        })));
    const row = h("button", { class: "da-ins-op", type: "button", "aria-expanded": "false", "aria-controls": `da-op-${i}` },
      h("span", { class: "da-ins-op-name" },
        h("span", { class: "da-ins-chev" }, DA.icon("chevron", 16)),
        h("span", {}, h("b", { class: op.name ? "" : "is-unnamed" }, op.name || "Имя не названо"),
          rest ? h("small", {}, `и ещё ${rest} без оценки`) : null)),
      h("span", { class: "da-ins-op-n" }, h("i", { class: "da-ins-m" }, "Обращений "), op.evs.length),
      h("span", { class: "da-ins-op-avg" }, h("b", {}, DA.fmt.score(op.avg)), h("span", { class: "da-ins-meter" }, h("i", { style: { width: op.avg + "%", "--i": i } }))),
      h("span", { class: "da-ins-op-weak" }, op.weak ? [h("b", {}, op.weak.c.title), h("small", {}, weakText)] : h("span", { class: "da-quiet" }, "Слабых мест нет")),
      h("span", { class: "da-ins-op-gross" }, op.gross ? h("span", { class: "da-ins-flag" }, DA.icon("flag", 14), op.gross) : h("span", { class: "da-quiet" }, "Нет")));
    row.addEventListener("click", () => {
      const open = row.getAttribute("aria-expanded") !== "true";
      row.setAttribute("aria-expanded", String(open));
      wrap.classList.toggle("is-open", open);
    });
    const wrap = h("div", { class: "da-ins-op-wrap", role: "listitem" }, row, panel);
    return wrap;
  }

  /* ---------- Точность модели ---------- */
  function loadGold() { try { return JSON.parse(localStorage.getItem(GOLD_KEY)) || null; } catch (e) { return null; } }
  function saveGold(gold) { try { localStorage.setItem(GOLD_KEY, JSON.stringify(gold)); } catch (e) { /* без сохранения */ } }

  function parseCsv(text) {
    text = text.replace(/^﻿/, "");
    const firstLine = text.slice(0, text.indexOf("\n") + 1 || undefined);
    const sep = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === sep) { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch !== "\r") cell += ch;
    }
    row.push(cell);
    rows.push(row);
    return rows.map((r, i) => ({ line: i + 1, cells: r.map((c) => c.trim()) })).filter((r) => r.cells.some(Boolean));
  }

  /* Разбор файла разметки. Ошибка формата бросается с понятным текстом. */
  function readGold(text, fileName) {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error("Файл пустой.");
    const header = rows[0].cells.map((c) => c.toLowerCase());
    const col = Object.fromEntries(["conversation_id", "criterion_id", "answer", "note"].map((k) => [k, header.indexOf(k)]));
    if (col.conversation_id < 0 || col.criterion_id < 0 || col.answer < 0) throw new Error("В первой строке нужны столбцы conversation_id, criterion_id и answer.");
    const out = [];
    let skipped = 0;
    for (const r of rows.slice(1)) {
      const cid = r.cells[col.conversation_id], crit = r.cells[col.criterion_id], raw = (r.cells[col.answer] || "").toLowerCase();
      const ev = DA.state.evaluations[cid];
      const cl = ev ? DA.checklist(ev.checklistVersion) : DA.activeChecklist();
      const c = DA.state.conversations[cid] && DA.criterionById(cl, crit);
      if (!c) { skipped++; continue; }
      const answer = /^\d+$/.test(raw) ? Number(raw) : raw;
      if (!DA.allowedAnswers(c).includes(answer)) {
        throw new Error(`В строке ${r.line} ответ «${r.cells[col.answer]}» не подходит к критерию «${c.title}». Допустимо: ${DA.allowedAnswers(c).join(", ")}.`);
      }
      out.push({ conversationId: cid, criterionId: crit, answer, note: col.note >= 0 ? r.cells[col.note] || "" : "" });
    }
    if (!out.length) throw new Error("В файле нет строк с обращениями и критериями из этого набора.");
    return { fileName, loadedAt: Date.now(), rows: out, skipped };
  }

  /* Сравниваем с исходным ответом модели: решение по апелляции не должно влиять на её точность. */
  const modelAnswer = (item) => (item.original ? item.original.answer : item.answer);

  function compare(gold) {
    const pairs = [];
    let noEval = 0;
    for (const r of gold.rows) {
      const ev = DA.state.evaluations[r.conversationId];
      const hit = ev && ev.total != null && doneItem(ev, r.criterionId);
      if (!hit) { noEval++; continue; }
      pairs.push({ ev, cid: r.conversationId, c: hit.c, gold: r.answer, model: modelAnswer(hit.item), note: r.note });
    }
    const match = pairs.filter((p) => p.gold === p.model).length;

    const diffs = [...new Set(pairs.map((p) => p.ev))].map((ev) => {
      const cl = DA.checklist(ev.checklistVersion);
      const model = Object.fromEntries(ev.items.map((i) => [i.criterionId, modelAnswer(i)]));
      const golden = { ...model };
      pairs.filter((p) => p.ev === ev).forEach((p) => (golden[p.c.id] = p.gold));
      return Math.abs(DA.computeScores(cl, golden).total - DA.computeScores(cl, model).total);
    });

    const byCrit = new Map();
    for (const p of pairs) {
      if (!byCrit.has(p.c.id)) byCrit.set(p.c.id, { c: p.c, total: 0, match: 0, confusions: new Map() });
      const row = byCrit.get(p.c.id);
      row.total++;
      if (p.gold === p.model) { row.match++; continue; }
      const key = `${short(p.model, p.c)} вместо ${short(p.gold, p.c)}` + (p.c.type === "scale" && p.gold !== "na" ? " " + DA.fmt.plural(p.gold, ["балла", "баллов", "баллов"]) : "");
      row.confusions.set(key, (row.confusions.get(key) || 0) + 1);
    }
    const crits = [...byCrit.values()].sort((a, b) => a.c.order - b.c.order);
    const misses = pairs.filter((p) => p.gold !== p.model)
      .sort((a, b) => DA.state.numbers[a.cid] - DA.state.numbers[b.cid] || a.c.order - b.c.order);
    return { pairs, match, noEval, meanDiff: diffs.length ? diffs.reduce((s, d) => s + d, 0) / diffs.length : null, crits, misses };
  }
  /* «4,1 балла», но «4 балла» и «5 баллов». */
  const points = (x) => (Math.round(x * 10) % 10 ? "балла" : DA.fmt.plural(Math.round(x), ["балл", "балла", "баллов"]));
  const short = (answer, c) => (c.type === "scale" && answer !== "na" ? String(answer) : DA.answerLabel(answer, c));

  function accuracyView(rerender) {
    const gold = loadGold();
    const input = h("input", { type: "file", accept: ".csv,text/csv", class: "da-sr" });
    const error = h("p", { class: "da-error", role: "alert", hidden: true });
    function take(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const next = readGold(String(reader.result), file.name);
          saveGold(next);
          rerender();
          DA.toast(`Разметка загружена: ${next.rows.length} ${DA.fmt.plural(next.rows.length, ["ответ", "ответа", "ответов"])}` + (next.skipped ? `, пропущено строк: ${next.skipped}` : ""));
        } catch (e) {
          error.textContent = e.message;
          error.hidden = false;
          drop.classList.remove("is-shake"); void drop.offsetWidth; drop.classList.add("is-shake");
        }
      };
      reader.onerror = () => { error.textContent = "Не получилось прочитать файл. Попробуйте выбрать его ещё раз."; error.hidden = false; };
      reader.readAsText(file, "utf-8");
    }
    input.addEventListener("change", () => { take(input.files[0]); input.value = ""; });
    const drop = h("label", { class: "da-drop da-ins-drop" }, input, DA.icon("upload"),
      h("b", {}, "Перетащите файл разметки"), h("span", { class: "da-small da-muted" }, "или нажмите, чтобы выбрать CSV"));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); take(e.dataTransfer.files[0]); });

    if (!gold) {
      return h("div", { class: "da-ins-gold-empty" },
        h("div", { class: "da-ins-gold-intro" },
          h("h2", {}, "Загрузите ручную разметку, чтобы сравнить с ней ответы модели"),
          h("p", { class: "da-muted" }, "Нужен файл CSV: одна строка на ответ по одному критерию. В ответе yes, no, na или число баллов по шкале."),
          sampleTable(),
          h("a", { class: "da-btn is-sm da-ins-download", href: "data/gold-sample.csv", download: "gold-sample.csv" }, DA.icon("upload", 16), "Скачать пример файла")),
        h("div", { class: "da-ins-gold-drop" }, drop, error));
    }

    const r = compare(gold);
    const replace = h("button", { class: "da-btn is-sm", type: "button", onclick: () => input.click() }, DA.icon("refresh", 16), "Заменить разметку");
    drop.hidden = true;
    if (!r.pairs.length) {
      return h("div", { class: "da-empty" }, drop, h("h2", {}, "Сравнить пока не с чем"),
        h("p", {}, "В разметке нет обращений, которые уже оценила модель."), replace, error);
    }
    const rate = r.match / r.pairs.length;
    return h("div", { class: "da-ins-acc" }, drop,
      h("div", { class: "da-ins-acc-head" },
        h("div", { class: "da-ins-kpi" }, h("span", {}, "Совпадение с разметкой"), h("b", {}, pct(rate)),
          h("small", {}, `${r.match} из ${r.pairs.length} ${DA.fmt.plural(r.pairs.length, ["ответа", "ответов", "ответов"])}`)),
        h("div", { class: "da-ins-kpi" }, h("span", {}, "Средняя разница итога"),
          h("b", {}, one.format(r.meanDiff), h("em", {}, points(r.meanDiff))),
          h("small", {}, `по ${nConv(new Set(r.pairs.map((p) => p.cid)).size)}`)),
        h("div", { class: "da-ins-acc-file" },
          h("span", { class: "da-small da-muted" }, `Разметка из файла ${gold.fileName}`,
            r.noEval ? `. Без оценки модели: ${r.noEval} ${DA.fmt.plural(r.noEval, ["строка", "строки", "строк"])}` : ""),
          replace, error)),
      h("section", { class: "da-ins-block is-flat" },
        h("h2", {}, "По критериям"),
        h("div", { class: "da-ins-acc-rows" }, r.crits.map((row, i) => {
          const top = [...row.confusions.entries()].sort((a, b) => b[1] - a[1])[0];
          return h("div", { class: "da-ins-acc-row" },
            h("span", { class: "da-ins-acc-title" }, row.c.title),
            h("span", { class: "da-ins-meter is-wide" + (row.match < row.total ? " is-miss" : "") }, h("i", { style: { width: (row.match / row.total) * 100 + "%", "--i": i } })),
            h("b", { class: "da-ins-acc-n" }, `${row.match} из ${row.total}`),
            h("span", { class: "da-ins-acc-conf" }, top ? `${top[0]}: ${top[1]}` : h("span", { class: "da-quiet" }, "без расхождений")));
        }))),
      h("section", { class: "da-ins-block is-flat" },
        h("h2", {}, r.misses.length ? `Расхождения: ${r.misses.length}` : "Расхождений нет"),
        r.misses.length ? h("div", { class: "da-ins-misses" }, r.misses.map((p) =>
          h("a", { class: "da-ins-miss", href: `#/c/${encodeURIComponent(p.cid)}?criterion=${encodeURIComponent(p.c.id)}` },
            h("b", { class: "da-num" }, `№ ${DA.convNumber(p.cid)}`),
            h("span", { class: "da-ins-miss-main" }, h("b", {}, p.c.title), p.note ? h("span", { class: "da-muted" }, p.note) : null),
            h("span", { class: "da-ins-miss-ans" },
              h("span", {}, h("span", { class: "da-small da-muted" }, "разметка"), DA.answerPill(p.gold, p.c)),
              h("span", {}, h("span", { class: "da-small da-muted" }, "модель"), DA.answerPill(p.model, p.c))),
            DA.icon("chevron", 16)))) : h("p", { class: "da-muted" }, "Модель ответила так же, как в разметке, по всем критериям.")));
  }

  function sampleTable() {
    const rows = [["p1-ru-007", "contact", "yes", ""], ["p1-ru-007", "identification", "na", ""], ["p1-ru-007", "consultation", "5", "Не ответил, когда снова подавать на вывод"]];
    return h("div", { class: "da-ins-sample" }, h("table", {},
      h("thead", {}, h("tr", {}, ["conversation_id", "criterion_id", "answer", "note"].map((c) => h("th", {}, c)))),
      h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c) => h("td", {}, c)))))));
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
      const view = tab === "quality" ? quality(evs) : tab === "operators" ? operatorsView() : accuracyView(render);
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
