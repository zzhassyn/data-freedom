/* Внутренний инструмент сравнения модели с ручной разметкой. */
(function () {
  const DA = window.DA, h = DA.h;
  const m = (key, params) => DA.msg("accuracy." + key, params);
  const t = (key, params) => DA.t("accuracy." + key, params);
  DA.i18n.addMessages({
    "accuracy.emptyFile": { ru: "Файл пустой.", kk: "Файл бос.", en: "The file is empty." },
    "accuracy.columns": { ru: "В первой строке нужны столбцы conversation_id, criterion_id и answer.", kk: "Бірінші жолда conversation_id, criterion_id және answer бағандары болуы керек.", en: "The header must include conversation_id, criterion_id and answer." },
    "accuracy.invalidAnswer": { ru: "В строке {line} ответ «{answer}» не подходит к критерию «{criterion}». Допустимо: {allowed}.", kk: "{line}-жолдағы «{answer}» жауабы «{criterion}» критерийіне сәйкес келмейді. Рұқсат етілген жауаптар: {allowed}.", en: "On line {line}, answer “{answer}” is not valid for “{criterion}”. Allowed: {allowed}." },
    "accuracy.noRows": { ru: "В файле нет строк с обращениями и критериями из этого набора.", kk: "Файлда осы жинақтағы өтініштер мен критерийлерге сәйкес жолдар жоқ.", en: "The file has no rows matching conversations and criteria in this dataset." },
    "accuracy.loaded": { ru: { one: "Разметка загружена: {count} ответ", few: "Разметка загружена: {count} ответа", many: "Разметка загружена: {count} ответов", other: "Разметка загружена: {count} ответа" }, kk: "Белгілеу жүктелді: {count} жауап", en: { one: "Labels uploaded: {count} answer", other: "Labels uploaded: {count} answers" } },
    "accuracy.skipped": { ru: ", пропущено строк: {count}", kk: ", өткізіп жіберілген жолдар: {count}", en: ", rows skipped: {count}" },
    "accuracy.readError": { ru: "Не получилось прочитать файл. Попробуйте выбрать его ещё раз.", kk: "Файлды оқу мүмкін болмады. Оны қайта таңдаңыз.", en: "Could not read the file. Try selecting it again." },
    "accuracy.dropFile": { ru: "Перетащите файл разметки", kk: "Белгілеу файлын сүйреп әкеліңіз", en: "Drop the labels file here" },
    "accuracy.chooseCsv": { ru: "или нажмите, чтобы выбрать CSV", kk: "немесе CSV таңдау үшін басыңыз", en: "or click to choose a CSV" },
    "accuracy.uploadTitle": { ru: "Загрузите ручную разметку, чтобы сравнить с ней ответы модели", kk: "Модель жауаптарымен салыстыру үшін қолмен белгіленген деректерді жүктеңіз", en: "Upload human labels to compare them with model answers" },
    "accuracy.csvHelp": { ru: "Нужен файл CSV: одна строка на ответ по одному критерию. В ответе yes, no, na или число баллов по шкале.", kk: "CSV файлы қажет: әр жолда бір критерийге берілген жауап. Жауап yes, no, na немесе шкаладағы ұпай саны болуы керек.", en: "Use a CSV with one criterion answer per row. Answers can be yes, no, na, or a numeric score from the scale." },
    "accuracy.sample": { ru: "Скачать пример файла", kk: "Файл үлгісін жүктеу", en: "Download sample file" },
    "accuracy.replace": { ru: "Заменить разметку", kk: "Белгілеуді ауыстыру", en: "Replace labels" },
    "accuracy.nothingToCompare": { ru: "Сравнить пока не с чем", kk: "Әзірге салыстыратын дерек жоқ", en: "Nothing to compare yet" },
    "accuracy.notEvaluated": { ru: "В разметке нет обращений, которые уже оценила модель.", kk: "Белгілеуде модель бағалаған өтініштер жоқ.", en: "None of the labeled conversations have been evaluated by the model." },
    "accuracy.agreement": { ru: "Совпадение с разметкой", kk: "Белгілеумен сәйкестік", en: "Agreement with labels" },
    "accuracy.matchAnswers": { ru: { one: "{matched} из {count} ответа", other: "{matched} из {count} ответов" }, kk: "Сәйкес: {matched} / {count}", en: { one: "{matched} of {count} answer", other: "{matched} of {count} answers" } },
    "accuracy.meanDifference": { ru: "Средняя разница итога", kk: "Қорытындының орташа айырмасы", en: "Mean score difference" },
    "accuracy.acrossConversations": { ru: { one: "по {count} обращению", other: "по {count} обращениям" }, kk: "{count} өтініш бойынша", en: { one: "across {count} conversation", other: "across {count} conversations" } },
    "accuracy.fromFile": { ru: "Разметка из файла {file}", kk: "Белгілеу файлы: {file}", en: "Labels from {file}" },
    "accuracy.unevaluatedRows": { ru: { one: ". Без оценки модели: {count} строка", few: ". Без оценки модели: {count} строки", other: ". Без оценки модели: {count} строк" }, kk: ". Модель бағаламаған: {count} жол", en: { one: ". Without a model evaluation: {count} row", other: ". Without a model evaluation: {count} rows" } },
    "accuracy.byCriterion": { ru: "По критериям", kk: "Критерийлер бойынша", en: "By criterion" },
    "accuracy.matchCount": { ru: "{matched} из {total}", kk: "{total} ішінен {matched}", en: "{matched} of {total}" },
    "accuracy.confusion": { ru: "{model} вместо {gold}: {count}", kk: "{gold} орнына {model}: {count}", en: "{model} instead of {gold}: {count}" },
    "accuracy.noDifferences": { ru: "без расхождений", kk: "айырмашылық жоқ", en: "no differences" },
    "accuracy.differencesCount": { ru: "Расхождения: {count}", kk: "Айырмашылықтар: {count}", en: "Differences: {count}" },
    "accuracy.noDifferencesTitle": { ru: "Расхождений нет", kk: "Айырмашылық жоқ", en: "No differences" },
    "accuracy.humanLabel": { ru: "разметка", kk: "белгілеу", en: "human label" },
    "accuracy.modelLabel": { ru: "модель", kk: "модель", en: "model" },
    "accuracy.allMatch": { ru: "Модель ответила так же, как в разметке, по всем критериям.", kk: "Модельдің барлық критерий бойынша жауаптары белгілеумен сәйкес келді.", en: "The model matched the human labels for every criterion." },
    "accuracy.title": { ru: "Точность модели", kk: "Модель дәлдігі", en: "Model accuracy" },
    "accuracy.internalTool": { ru: "Внутренний инструмент команды: сравнение ответов модели с ручной разметкой", kk: "Команданың ішкі құралы: модель жауаптарын қолмен белгілеумен салыстыру", en: "Internal team tool for comparing model answers with human labels" }
  });
  const GOLD_KEY = "da.gold";
  const one = (x) => new Intl.NumberFormat(DA.fmt.locale(), { maximumFractionDigits: 1 }).format(x);
  const pct = (x) => new Intl.NumberFormat(DA.fmt.locale(), { style: "percent", maximumFractionDigits: 0 }).format(x);
  function goldError(key, params) { return Object.assign(new Error(t(key, params)), { uiMessage: m(key, params) }); }
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
    if (!rows.length) throw goldError("emptyFile");
    const header = rows[0].cells.map((c) => c.toLowerCase());
    const col = Object.fromEntries(["conversation_id", "criterion_id", "answer", "note"].map((k) => [k, header.indexOf(k)]));
    if (col.conversation_id < 0 || col.criterion_id < 0 || col.answer < 0) throw goldError("columns");
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
        throw goldError("invalidAnswer", { line: r.line, answer: r.cells[col.answer], criterion: c.title, allowed: DA.allowedAnswers(c).join(", ") });
      }
      out.push({ conversationId: cid, criterionId: crit, answer, note: col.note >= 0 ? r.cells[col.note] || "" : "" });
    }
    if (!out.length) throw goldError("noRows");
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
      const key = JSON.stringify([p.model, p.gold]);
      const confusion = row.confusions.get(key) || { model: p.model, gold: p.gold, count: 0 };
      confusion.count++;
      row.confusions.set(key, confusion);
    }
    const crits = [...byCrit.values()].sort((a, b) => a.c.order - b.c.order);
    const misses = pairs.filter((p) => p.gold !== p.model)
      .sort((a, b) => DA.state.numbers[a.cid] - DA.state.numbers[b.cid] || a.c.order - b.c.order);
    return { pairs, match, noEval, meanDiff: diffs.length ? diffs.reduce((s, d) => s + d, 0) / diffs.length : null, crits, misses };
  }
  /* «4,1 балла», но «4 балла» и «5 баллов». */
  const points = (x) => DA.fmt.plural(x, { ru: { one: "балл", few: "балла", many: "баллов", other: "балла" }, kk: { other: "ұпай" }, en: { one: "point", other: "points" } });
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
          DA.toast(DA.msg(() => t("loaded", { count: next.rows.length }) + (next.skipped ? t("skipped", { count: next.skipped }) : "")));
        } catch (e) {
          DA.i18n.bindText(error, e.uiMessage || (() => e.message));
          error.hidden = false;
          drop.classList.remove("is-shake"); void drop.offsetWidth; drop.classList.add("is-shake");
        }
      };
      reader.onerror = () => { DA.i18n.bindText(error, m("readError")); error.hidden = false; };
      reader.readAsText(file, "utf-8");
    }
    input.addEventListener("change", () => { take(input.files[0]); input.value = ""; });
    const drop = h("label", { class: "da-drop da-ins-drop" }, input, DA.icon("upload"),
      h("b", {}, m("dropFile")), h("span", { class: "da-small da-muted" }, m("chooseCsv")));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); take(e.dataTransfer.files[0]); });

    if (!gold) {
      return h("div", { class: "da-ins-gold-empty" },
        h("div", { class: "da-ins-gold-intro" },
          h("h2", {}, m("uploadTitle")),
          h("p", { class: "da-muted" }, m("csvHelp")),
          sampleTable(),
          h("a", { class: "da-btn is-sm da-ins-download", href: "data/gold-sample.csv", download: "gold-sample.csv" }, DA.icon("upload", 16), m("sample"))),
        h("div", { class: "da-ins-gold-drop" }, drop, error));
    }

    const r = compare(gold);
    const replace = h("button", { class: "da-btn is-sm", type: "button", onclick: () => input.click() }, DA.icon("refresh", 16), m("replace"));
    drop.hidden = true;
    if (!r.pairs.length) {
      return h("div", { class: "da-empty" }, drop, h("h2", {}, m("nothingToCompare")),
        h("p", {}, m("notEvaluated")), replace, error);
    }
    const rate = r.match / r.pairs.length;
    return h("div", { class: "da-ins-acc" }, drop,
      h("div", { class: "da-ins-acc-head" },
        h("div", { class: "da-ins-kpi" }, h("span", {}, m("agreement")), h("b", {}, DA.msg(() => pct(rate))),
          h("small", {}, m("matchAnswers", { matched: r.match, count: r.pairs.length }))),
        h("div", { class: "da-ins-kpi" }, h("span", {}, m("meanDifference")),
          h("b", {}, DA.msg(() => one(r.meanDiff)), h("em", {}, DA.msg(() => points(r.meanDiff)))),
          h("small", {}, m("acrossConversations", { count: new Set(r.pairs.map((p) => p.cid)).size }))),
        h("div", { class: "da-ins-acc-file" },
          h("span", { class: "da-small da-muted" }, m("fromFile", { file: gold.fileName }),
            r.noEval ? m("unevaluatedRows", { count: r.noEval }) : ""),
          replace, error)),
      h("section", { class: "da-ins-block is-flat" },
        h("h2", {}, m("byCriterion")),
        h("div", { class: "da-ins-acc-rows" }, r.crits.map((row, i) => {
          const top = [...row.confusions.values()].sort((a, b) => b.count - a.count)[0];
          return h("div", { class: "da-ins-acc-row" },
            h("span", { class: "da-ins-acc-title" }, row.c.title),
            h("span", { class: "da-ins-meter is-wide" + (row.match < row.total ? " is-miss" : "") }, h("i", { style: { width: (row.match / row.total) * 100 + "%", "--i": i } })),
            h("b", { class: "da-ins-acc-n" }, m("matchCount", { matched: row.match, total: row.total })),
            h("span", { class: "da-ins-acc-conf" }, top ? m("confusion", () => ({ model: short(top.model, row.c), gold: short(top.gold, row.c), count: top.count })) : h("span", { class: "da-quiet" }, m("noDifferences"))));
        }))),
      h("section", { class: "da-ins-block is-flat" },
        h("h2", {}, r.misses.length ? m("differencesCount", { count: r.misses.length }) : m("noDifferencesTitle")),
        r.misses.length ? h("div", { class: "da-ins-misses" }, r.misses.map((p) =>
          h("a", { class: "da-ins-miss", href: `#/c/${encodeURIComponent(p.cid)}?criterion=${encodeURIComponent(p.c.id)}` },
            h("b", { class: "da-num" }, `№ ${DA.convNumber(p.cid)}`),
            h("span", { class: "da-ins-miss-main" }, h("b", {}, p.c.title), p.note ? h("span", { class: "da-muted" }, p.note) : null),
            h("span", { class: "da-ins-miss-ans" },
              h("span", {}, h("span", { class: "da-small da-muted" }, m("humanLabel")), DA.answerPill(p.gold, p.c)),
              h("span", {}, h("span", { class: "da-small da-muted" }, m("modelLabel")), DA.answerPill(p.model, p.c))),
            DA.icon("chevron", 16)))) : h("p", { class: "da-muted" }, m("allMatch"))));
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
      h("div", { class: "da-page-head" }, h("h1", { class: "da-h1", tabindex: -1 }, m("title"))), body,
      h("p", { class: "da-ins-after" }, m("internalTool"))));
    render();
  };
})();
