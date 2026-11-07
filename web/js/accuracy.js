/* Внутренний инструмент сравнения модели с ручной разметкой. */
(function () {
  const DA = window.DA, h = DA.h;
  const GOLD_KEY = "da.gold";
  const one = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
  const pct = (x) => `${Math.round(x * 100)} %`;
  const nConv = (n) => `${n} ${DA.fmt.plural(n, ["обращение", "обращения", "обращений"])}`;
  function doneItem(ev, criterionId) {
    if (ev.stale) return null;
    const item = ev.items.find((i) => i.criterionId === criterionId && i.status === "done");
    const c = item && DA.criterionById(DA.checklist(ev.checklistVersion), criterionId);
    return c ? { item, c } : null;
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

  DA.views.accuracy = function mount(root) {
    const body = h("div");
    function render() { body.replaceChildren(accuracyView(render)); }
    root.append(h("div", { class: "da-page da-ins" },
      h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, "Точность модели")), body,
      h("p", { class: "da-ins-after" }, "Внутренний инструмент команды: сравнение ответов модели с ручной разметкой")));
    render();
  };
})();
