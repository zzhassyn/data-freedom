/* Данные прототипа: форматирование, транскрипт, расчёт баллов, хранилище. */
(function () {
  const DA = (window.DA = window.DA || {});

  /* ---------- Форматирование ---------- */
  const nf = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  DA.fmt = {
    score: (x) => (x == null ? "—" : nf.format(x)),
    duration(sec) {
      sec = Math.max(0, Math.round(sec));
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    },
    plural(n, forms) {
      const a = Math.abs(n) % 100, b = a % 10;
      if (a > 10 && a < 20) return forms[2];
      if (b > 1 && b < 5) return forms[1];
      if (b === 1) return forms[0];
      return forms[2];
    },
    ago(min) {
      if (min < 1) return "только что";
      if (min < 60) return `${min} мин назад`;
      return `${Math.round(min / 60)} ч назад`;
    },
    dateTime(ms) {
      const d = new Date(ms), today = new Date();
      const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      if (d.toDateString() === today.toDateString()) return `Сегодня, ${time}`;
      return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, ${time}`;
    },
    number: (n) => String(n).padStart(3, "0")
  };

  DA.speakerLabel = { client: "Клиент", operator: "Оператор", bot: "Бот AIM", system: "Система" };
  DA.langLabel = { RU: "Русский", KZ: "Казахский", EN: "Английский" };
  DA.channelLabel = (conv) => (conv.channel === "voice call" ? "Звонок" : "Чат");

  /* ---------- Транскрипт ---------- */
  DA.tx = {
    seconds(ts, first) {
      if (ts.includes("T")) return (Date.parse(ts.slice(0, 23) + ts.slice(-6)) - Date.parse(first.slice(0, 23) + first.slice(-6))) / 1000;
      const [m, s] = ts.split(":").map(Number);
      return m * 60 + s;
    },
    clock(ts) { return ts.includes("T") ? ts.slice(11, 16) : ts; },
    /* У звонков дата есть в транскрипте, у чатов её нет, поэтому берём время загрузки набора. */
    startedAt(conv) {
      const first = conv.transcript[0];
      return first && first.timestamp.includes("T") ? Date.parse(first.timestamp.slice(0, 23) + first.timestamp.slice(-6)) : DA.state.importedAt;
    },
    duration(conv) {
      const t = conv.transcript;
      return t.length ? DA.tx.seconds(t[t.length - 1].timestamp, t[0].timestamp) : 0;
    },
    preview(conv) {
      const first = conv.transcript.find((t) => t.speaker === "client" && t.text.length > 3);
      return first ? first.text : "";
    },
    firstOperatorIdx(conv) { return conv.transcript.findIndex((t) => t.speaker === "operator"); },
    /* Паузы от 60 с между репликой клиента и следующей репликой оператора. */
    gaps(conv) {
      const t = conv.transcript, out = {};
      let lastClient = null;
      t.forEach((turn, i) => {
        if (turn.speaker === "client") lastClient = i;
        if (turn.speaker === "operator" && lastClient != null) {
          const sec = DA.tx.seconds(turn.timestamp, t[0].timestamp) - DA.tx.seconds(t[lastClient].timestamp, t[0].timestamp);
          if (sec >= 60) out[i] = sec;
          lastClient = null;
        }
      });
      return out;
    },
    systemKind(text) {
      const s = text.toLowerCase();
      if (/подтвержден|расталды|identity verified/.test(s)) return "verified";
      if (/эскалац|операторға жіберілді|transferred to an agent|переведен/.test(s)) return "escalate";
      if (/закрыл|жапты|closed the chat|завершил|покинул|прерван|үзілді|lost/.test(s)) return "closed";
      if (/удержани|приостановлен/.test(s)) return "hold";
      return "plain";
    }
  };

  /* ---------- Ответы и расчёт баллов (CONTRACTS.md, раздел 3) ---------- */
  DA.criterionById = (cl, id) => cl.criteria.find((c) => c.id === id);
  DA.scaleMax = (c) => Math.max(...c.scale.map((s) => s.value));

  DA.tone = function (answer, c) {
    if (answer == null) return "pending";
    if (answer === "na") return "na";
    if (c.type === "flag") return answer === "yes" ? "flag" : "yes";
    if (c.type === "scale") {
      const max = DA.scaleMax(c);
      return answer === max ? "yes" : answer === 0 ? "no" : "partial";
    }
    return answer === "yes" ? "yes" : "no";
  };
  DA.answerLabel = function (answer, c) {
    if (answer == null) return "…";
    if (answer === "na") return "N/A";
    if (c.type === "scale") return `${answer} из ${DA.scaleMax(c)}`;
    if (c.type === "flag") return answer === "yes" ? "Найдена" : "Нет";
    return answer === "yes" ? "Да" : "Нет";
  };
  DA.allowedAnswers = function (c) {
    if (c.type === "scale") return [...c.scale.map((s) => s.value), ...(c.naAllowed ? ["na"] : [])];
    return ["yes", "no", ...(c.naAllowed ? ["na"] : [])];
  };

  /* answers: { criterionId: answer | null }. null = ещё не готов, считается применимым. */
  DA.computeScores = function (cl, answers) {
    const weighted = cl.criteria.filter((c) => c.type !== "flag" && c.weight > 0);
    const applicable = weighted.filter((c) => answers[c.id] !== "na");
    const W = applicable.reduce((s, c) => s + c.weight, 0);
    const items = {};
    for (const c of cl.criteria) {
      const a = answers[c.id];
      const isApp = applicable.includes(c);
      const eff = isApp && W > 0 ? (c.weight * 100) / W : 0;
      let fraction = null;
      if (a != null && a !== "na" && c.type !== "flag") fraction = c.type === "scale" ? a / DA.scaleMax(c) : a === "yes" ? 1 : 0;
      items[c.id] = { fraction, effectiveWeight: eff, points: (fraction || 0) * eff };
    }
    const sections = cl.sections.map((s) => {
      const cs = cl.criteria.filter((c) => c.sectionId === s.id && c.type !== "flag");
      return {
        sectionId: s.id,
        earned: cs.reduce((x, c) => x + items[c.id].points, 0),
        max: cs.reduce((x, c) => x + items[c.id].effectiveWeight, 0)
      };
    });
    const sum = Object.values(items).reduce((s, i) => s + i.points, 0);
    const total = W > 0 ? Math.round((sum + Number.EPSILON) * 100) / 100 : null;
    return { items, sections, total };
  };

  /* ---------- Версии чек-листа ---------- */
  DA.checklist = (version) => DA.state.checklists.find((c) => c.version === version);
  DA.activeChecklist = () => DA.state.checklists.find((c) => c.isActive);
  DA.saveChecklist = function (draft) {
    const version = Math.max(...DA.state.checklists.map((c) => c.version)) + 1;
    DA.state.checklists.forEach((c) => (c.isActive = false));
    const saved = { ...structuredClone(draft), id: "cl_" + version, version, basedOnVersion: draft.version, isActive: true, createdAt: Date.now() };
    DA.state.checklists.push(saved);
    save();
    return saved;
  };
  DA.activateChecklist = function (version) {
    DA.state.checklists.forEach((c) => (c.isActive = c.version === version));
    save();
  };

  /* ---------- Хранилище прототипа (в браузере, до бэкенда) ---------- */
  const KEY = "da.proto.v2";
  const PERSIST = ["evaluations", "appeals", "role", "checklists", "importedAt", "sidebar"];
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(PERSIST.map((k) => [k, DA.state[k]])))); } catch (e) { /* без сохранения */ }
  }

  function buildEvaluation(cid) {
    const src = window.DA_MOCK_ANSWERS[cid];
    if (!src) return null;
    const items = DA.checklist(1).criteria.map((c) => {
      const m = src[c.id];
      return {
        criterionId: c.id, status: "done", answer: m.answer,
        explanation: m.explanation || null, naReason: m.naReason || null,
        evidence: (m.evidence || []).map(([turnIdx, quote, kind]) => ({ turnIdx, quote, kind })),
        checkedRange: m.range ? { fromIdx: m.range[0], toIdx: m.range[1] } : null,
        needsReview: !!m.needsReview, original: null, appealId: null
      };
    });
    const ev = { id: "ev_" + cid, conversationId: cid, checklistVersion: 1, status: "done", minutesAgo: 25, durationSec: 11 + (cid.length % 7), items };
    DA.rescore(ev);
    ev.originalTotal = ev.total;
    return ev;
  }

  DA.rescore = function (ev) {
    const answers = Object.fromEntries(ev.items.map((i) => [i.criterionId, i.status === "done" ? i.answer : null]));
    const cl = DA.checklist(ev.checklistVersion);
    const r = DA.computeScores(cl, answers);
    ev.items.forEach((i) => Object.assign(i, r.items[i.criterionId]));
    ev.sections = r.sections;
    ev.total = ev.items.every((i) => i.status === "done") ? r.total : null;
    const g = ev.items.find((i) => DA.criterionById(cl, i.criterionId).type === "flag");
    ev.grossFlagged = !!g && g.answer === "yes";
    return ev;
  };

  DA.state = { evaluations: {}, appeals: [], role: "analyst", conversations: {}, numbers: {}, checklists: [], importedAt: Date.now(), sidebar: "open" };
  DA.initState = function () {
    window.DA_DEV.records.forEach((r, i) => {
      DA.state.conversations[r.conversation_id] = r;
      DA.state.numbers[r.conversation_id] = i + 1;
    });
    const saved = load();
    if (saved) Object.assign(DA.state, saved);
    else {
      DA.state.checklists = [{ ...structuredClone(window.DA_CHECKLIST), createdAt: Date.now() }];
      for (const cid of Object.keys(window.DA_MOCK_ANSWERS)) DA.state.evaluations[cid] = buildEvaluation(cid);
      for (const a of window.DA_MOCK_APPEALS) DA.createAppeal(a.conversationId, a.criterionId, a.comment, a.proposedAnswer, a.createdMinutesAgo, true);
      save();
    }
  };
  DA.convNumber = (cid) => DA.fmt.number(DA.state.numbers[cid]);
  DA.save = save;
  DA.resetState = function () { try { localStorage.removeItem(KEY); } catch (e) { /* ничего */ } location.reload(); };
  DA.freshEvaluation = buildEvaluation;

  DA.createAppeal = function (cid, criterionId, comment, proposedAnswer, minutesAgo, silent) {
    const ev = DA.state.evaluations[cid];
    const item = ev.items.find((i) => i.criterionId === criterionId);
    const appeal = {
      id: "ap_" + (DA.state.appeals.length + 1), conversationId: cid, criterionId, comment, proposedAnswer,
      createdAt: Date.now() - (minutesAgo || 0) * 60000, status: "open",
      originalAnswer: item.answer, totalBefore: ev.total, decision: null, totalAfter: null
    };
    DA.state.appeals.push(appeal);
    item.appealId = appeal.id;
    save();
    if (!silent) window.dispatchEvent(new CustomEvent("da:appeals-changed"));
    return appeal;
  };
  DA.decideAppeal = function (appeal, action, newAnswer, reason) {
    const ev = DA.state.evaluations[appeal.conversationId];
    const item = ev.items.find((i) => i.criterionId === appeal.criterionId);
    if (action === "change") {
      if (!item.original) item.original = { answer: item.answer, points: item.points, effectiveWeight: item.effectiveWeight };
      item.answer = newAnswer;
      DA.rescore(ev);
    }
    appeal.status = action === "change" ? "changed" : "confirmed";
    appeal.decision = { action, newAnswer: action === "change" ? newAnswer : null, reason, decidedAt: Date.now() };
    appeal.totalAfter = ev.total;
    save();
    window.dispatchEvent(new CustomEvent("da:appeals-changed"));
  };
  DA.openAppeals = () => DA.state.appeals.filter((a) => a.status === "open");

})();
