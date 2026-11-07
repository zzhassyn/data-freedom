/* Форматирование, расчёт предпросмотра и единый слой данных экранов. */
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

  /* Режим определяется один раз при запуске. Отказ API не подменяет серверные данные. */
  DA.backendAvailable = false;
  DA.checkBackend = function () {
    return DA.api ? DA.api.detect().then((mode) => mode === "server") : Promise.resolve(false);
  };
  DA.audioHref = function (conv) {
    if (!conv || typeof conv.audio_url !== "string" || !conv.audio_url.trim()) return null;
    if (DA.backendAvailable) return `/api/conversations/${encodeURIComponent(conv.conversation_id)}/audio`;
    try {
      const url = new URL(conv.audio_url);
      const host = url.hostname.toLowerCase().replace(/\.+$/, "");
      const allowed = ["environment.api.powerplatform.com", "dynamics.com"];
      if (url.protocol !== "https:" || url.username || url.password || !allowed.some((h) => host === h || host.endsWith("." + h))) return null;
      return url.href;
    } catch (e) { return null; }
  };

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
      if (conv.startedAt != null) return typeof conv.startedAt === "number" ? conv.startedAt : Date.parse(conv.startedAt);
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
  DA.answerText = function (answer, c) {
    if (answer == null) return "…";
    if (answer === "na") return "Не применимо";
    if (c.type === "scale") return `${answer} из ${DA.scaleMax(c)}`;
    if (c.type === "flag") return answer === "yes" ? "Нарушение" : "Нет нарушений";
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
  const PERSIST = ["evaluations", "evaluationHistory", "appeals", "role", "checklists", "importedAt", "sidebar", "conversations", "numbers", "source"];
  const builtins = new Map(window.DA_DEV.records.map((r) => [r.conversation_id, r]));
  DA.transcriptKey = (turns) => JSON.stringify(turns.map(({ timestamp, speaker, text }) => [timestamp, speaker, text]));
  const recordKey = (r) => JSON.stringify([r.channel, r.language, r.audio_url || null, DA.transcriptKey(r.transcript)]);
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save() {
    try {
      if (DA.mode === "server") {
        const stored = load() || {};
        stored.role = DA.state.role;
        stored.sidebar = DA.state.sidebar;
        localStorage.setItem(KEY, JSON.stringify(stored));
        return;
      }
      const stored = Object.fromEntries(PERSIST.map((k) => [k, DA.state[k]]));
      /* Встроенный DEV восстанавливаем из файла; сохраняем лишь добавления и изменённые записи. */
      stored.conversations = Object.fromEntries(Object.entries(DA.state.conversations).filter(([id]) => !builtins.has(id)));
      stored.numbers = Object.fromEntries(Object.entries(DA.state.numbers).filter(([id]) => !builtins.has(id)));
      stored.devOverrides = Object.fromEntries(Object.entries(DA.state.conversations).filter(([id, r]) => builtins.has(id) && recordKey(r) !== recordKey(builtins.get(id))));
      localStorage.setItem(KEY, JSON.stringify(stored));
    } catch (e) { /* без сохранения */ }
  }

  DA.upsertConversations = function (records) {
    let next = Math.max(0, ...Object.values(DA.state.numbers)) + 1;
    const result = { imported: 0, updated: 0, unchanged: 0, ids: [] };
    for (const r of records) {
      const id = r.conversation_id, old = DA.state.conversations[id];
      const changed = old && DA.transcriptKey(old.transcript) !== DA.transcriptKey(r.transcript);
      result[!old ? "imported" : changed ? "updated" : "unchanged"]++;
      if (!old) DA.state.numbers[id] = next++;
      if (!old || changed) result.ids.push(id);
      if (changed && DA.state.evaluations[id]) DA.state.evaluations[id].stale = true;
      DA.state.conversations[id] = structuredClone({ conversation_id: id, channel: r.channel, language: r.language,
        transcript: r.transcript.map(({ timestamp, speaker, text }) => ({ timestamp, speaker, text })), audio_url: r.audio_url || null });
    }
    save();
    return result;
  };

  function buildEvaluation(cid) {
    const src = window.DA_MOCK_ANSWERS[cid];
    if (!src) return null;
    if (builtins.has(cid) && DA.transcriptKey(DA.state.conversations[cid].transcript) !== DA.transcriptKey(builtins.get(cid).transcript)) return null;
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
    const ev = { id: "ev_" + cid, conversationId: cid, checklistVersion: 1, status: "done", minutesAgo: 25, durationSec: 11 + (cid.length % 7),
      sourceConversation: structuredClone(DA.state.conversations[cid]), transcriptKey: DA.transcriptKey(DA.state.conversations[cid].transcript), items };
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

  DA.state = { evaluations: {}, evaluationHistory: {}, appeals: [], role: "analyst", conversations: {}, numbers: {}, checklists: [], importedAt: Date.now(), sidebar: "open" };
  DA.initState = function () {
    const saved = load();
    DA.stateMode = DA.mode || "local";
    DA.state = { evaluations: {}, evaluationHistory: {}, appeals: [], role: saved?.role || "analyst", conversations: {}, numbers: {}, checklists: [], importedAt: Date.now(), sidebar: saved?.sidebar || "open" };
    if (DA.mode === "server") return;
    window.DA_DEV.records.forEach((r, i) => {
      DA.state.conversations[r.conversation_id] = structuredClone(r);
      DA.state.numbers[r.conversation_id] = i + 1;
    });
    if (saved) {
      const { conversations, numbers, devOverrides, ...rest } = saved;
      Object.assign(DA.state, rest);
      Object.assign(DA.state.conversations, conversations || {}, devOverrides || {});
      Object.assign(DA.state.numbers, numbers || {});
      if (!DA.state.checklists.length) DA.state.checklists = [{ ...structuredClone(window.DA_CHECKLIST), createdAt: Date.now() }];
    }
    else {
      DA.state.checklists = [{ ...structuredClone(window.DA_CHECKLIST), createdAt: Date.now() }];
      for (const cid of Object.keys(window.DA_MOCK_ANSWERS)) DA.state.evaluations[cid] = buildEvaluation(cid);
      for (const a of window.DA_MOCK_APPEALS) DA.createAppeal(a.conversationId, a.criterionId, a.comment, a.proposedAnswer, a.createdMinutesAgo, true);
      save();
    }
    DA.state.evaluationHistory = DA.state.evaluationHistory || {};
    Object.values(DA.state.evaluations).forEach((ev) => {
      if (!ev) return;
      if (["queued", "running"].includes(ev.status)) {
        ev.status = "failed";
        ev.total = null;
        ev.items.forEach((item) => {
          if (["pending", "running"].includes(item.status)) { item.status = "failed"; item.explanation = "Оценка прервалась. Повторите этот критерий"; }
        });
      }
      DA.state.evaluationHistory[ev.id] = ev;
    });
  };
  DA.convNumber = (cid) => DA.fmt.number(DA.state.numbers[cid]);
  DA.save = save;
  DA.resetState = function () { try { localStorage.removeItem(KEY); } catch (e) { /* ничего */ } location.reload(); };
  DA.freshEvaluation = buildEvaluation;

  DA.createAppeal = function (cid, criterionId, comment, proposedAnswer, minutesAgo, silent) {
    const ev = DA.state.evaluations[cid];
    const item = ev.items.find((i) => i.criterionId === criterionId);
    const appeal = {
      id: "ap_" + (DA.state.appeals.length + 1), evaluationId: ev.id, conversationId: cid, criterionId, comment, proposedAnswer,
      createdAt: Date.now() - (minutesAgo || 0) * 60000, status: "open",
      originalAnswer: item.answer, totalBefore: ev.total, decision: null, totalAfter: null,
      evaluation: structuredClone(ev), conversation: structuredClone(DA.state.conversations[cid])
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

/* Асинхронный фасад: DA.state служит зеркалом загруженных данных для рендереров.
   prepare(scope, { id, refresh }) загружает экран без изменений DOM.
   Мутации возвращаются только после сохранения; серверные итоги не пересчитываются здесь. */
(function () {
  const DA = window.DA;
  const epoch = { value: 0 };
  let conversationLoad = null, checklistLoad = null, conversationReady = false;
  let summaries = new Map();
  const historyContexts = new Map(), evaluationReads = new Map();
  let evaluationsRead = 0, appealsRead = 0;
  const polls = new Map();
  const time = (value) => typeof value === "number" ? value : value ? Date.parse(value) : null;
  const emit = (name) => window.dispatchEvent(new CustomEvent(name));
  const failure = (code, message) => new DA.ApiError(code, message, 0);
  const server = () => DA.mode === "server";
  function ensureMode() {
    if (DA.stateMode !== (DA.mode || "local")) {
      DA.initState();
      invalidate();
    }
  }
  function invalidate() {
    epoch.value++;
    conversationReady = false;
    conversationLoad = null;
    checklistLoad = null;
  }
  function conversation(raw) {
    const id = raw.id || raw.conversation_id;
    return { ...raw, conversation_id: id, audio_url: raw.audioUrl ?? raw.audio_url ?? null,
      importedAt: time(raw.importedAt), startedAt: time(raw.startedAt || raw.importedAt),
      transcript: (raw.transcript || []).map((turn, idx) => ({ ...turn, idx: turn.idx ?? idx })) };
  }
  function checklist(raw) {
    return { ...raw, createdAt: time(raw.createdAt), sections: raw.sections || [], criteria: raw.criteria || [] };
  }
  function evaluationStale(raw) {
    const currentConversation = DA.state.conversations[raw.conversationId];
    if (raw.transcriptHash && currentConversation?.transcriptHash) return raw.transcriptHash !== currentConversation.transcriptHash;
    const summary = summaries.get(raw.conversationId)?.lastEvaluation;
    const current = DA.state.evaluations[raw.conversationId];
    return !!raw.stale || (summary?.id === raw.id && summary.status === "stale") || (current?.id === raw.id && !!current.stale);
  }
  function evaluation(raw, stale) {
    if (!raw) return null;
    return { ...raw, items: (raw.items || []).map((item) => ({ ...item, evidence: item.evidence || [],
      original: item.original || null, appealId: item.appealId || null })),
      sections: raw.sections || [], grossFlagged: raw.grossError?.flagged ?? raw.grossFlagged ?? false,
      minutesAgo: raw.finishedAt || raw.startedAt ? Math.max(0, Math.floor((Date.now() - time(raw.finishedAt || raw.startedAt)) / 60000)) : raw.minutesAgo || 0,
      durationSec: raw.durationMs == null ? raw.durationSec ?? null : raw.durationMs / 1000,
      stale: stale == null ? evaluationStale(raw) : !!stale };
  }
  function appeal(raw) {
    return { ...raw, createdAt: time(raw.createdAt),
      decision: raw.decision ? { ...raw.decision, decidedAt: time(raw.decision.decidedAt) } : null,
      ...(raw.evaluation ? { evaluation: evaluation(raw.evaluation) } : {}),
      ...(raw.conversation ? { conversation: conversation(raw.conversation) } : {}) };
  }
  async function mapLimit(items, callback) {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await callback(items[index], index);
      }
    }));
    return results;
  }
  async function allPages() {
    const items = [], seen = new Set();
    let cursor, page = 1;
    while (true) {
      const result = await DA.api.listConversations(cursor ? { cursor } : page > 1 ? { page } : {});
      for (const row of result.items || []) if (!seen.has(row.id)) { seen.add(row.id); items.push(row); }
      if (result.nextCursor) cursor = result.nextCursor;
      else if (result.hasMore && (result.items || []).length) { cursor = null; page++; }
      else return items;
    }
  }
  async function conversations(options) {
    ensureMode();
    if (!server()) return Object.values(DA.state.conversations);
    if (conversationLoad) return conversationLoad;
    if (conversationReady && !options?.refresh) return Object.values(DA.state.conversations);
    const revision = epoch.value;
    const promise = (async () => {
      const rows = await allPages();
      const signature = (row) => JSON.stringify([row.transcriptHash, row.channel, row.language, row.audioUrl ?? row.audio_url, row.groupId ?? row.datasetGroupId]);
      const records = await mapLimit(rows, async (row) => {
        const cached = conversationReady && DA.state.conversations[row.id];
        if (cached && row.transcriptHash && signature(cached) === signature(row)) return { ...cached, summary: row.summary, lastEvaluation: row.lastEvaluation };
        return conversation({ ...row, ...await DA.api.getConversation(row.id) });
      });
      if (epoch.value !== revision) return Object.values(DA.state.conversations);
      summaries = new Map(rows.map((row) => [row.id, row]));
      DA.state.conversations = Object.fromEntries(records.map((record) => [record.conversation_id, record]));
      DA.state.numbers = Object.fromEntries(records.map((record, index) => [record.conversation_id, record.number ?? index + 1]));
      conversationReady = true;
      return records;
    })();
    conversationLoad = promise;
    try { return await promise; }
    finally { if (conversationLoad === promise) conversationLoad = null; }
  }
  async function checklists(options) {
    ensureMode();
    if (!server()) return DA.state.checklists;
    if (checklistLoad) return checklistLoad;
    if (DA.state.checklists.length && !options?.refresh) return DA.state.checklists;
    const revision = epoch.value;
    const promise = (async () => {
      const list = await DA.api.listChecklists();
      const loaded = await mapLimit(list.items || [], async (item) => checklist({ ...item, ...await DA.api.getChecklist(item.id) }));
      if (epoch.value === revision) DA.state.checklists = loaded.sort((a, b) => a.version - b.version);
      return DA.state.checklists;
    })();
    checklistLoad = promise;
    try { return await promise; }
    finally { if (checklistLoad === promise) checklistLoad = null; }
  }
  function saveEvaluation(raw, stale) {
    const ev = evaluation(raw, stale);
    DA.state.evaluations[ev.conversationId] = ev;
    return ev;
  }
  function updateEvaluationContexts(ev) {
    DA.state.evaluationHistory[ev.id] = ev;
    const latest = DA.state.evaluations[ev.conversationId];
    if (latest?.id === ev.id) DA.state.evaluations[ev.conversationId] = ev;
    DA.state.appeals.forEach((a) => {
      if (a.evaluationId === ev.id || a.evaluation?.id === ev.id) a.evaluation = ev;
    });
    const historical = historyContexts.get(ev.id);
    if (historical) historical.ev = ev;
  }
  async function getEvaluation(cid, options) {
    ensureMode();
    if (!server()) return DA.state.evaluations[cid] || null;
    await checklists();
    if (!options?.refresh && DA.state.evaluations[cid]) return DA.state.evaluations[cid];
    const revision = epoch.value;
    const sequence = (evaluationReads.get(cid) || 0) + 1;
    evaluationReads.set(cid, sequence);
    const history = await DA.api.listEvaluations(cid, options);
    const raw = history.items?.[0];
    if (epoch.value !== revision || evaluationReads.get(cid) !== sequence || options?.signal?.aborted) return DA.state.evaluations[cid] || null;
    if (!raw) { delete DA.state.evaluations[cid]; return null; }
    return saveEvaluation(raw, summaries.get(cid)?.lastEvaluation?.status === "stale");
  }
  async function evaluations(options) {
    if (!server()) return Object.values(DA.state.evaluations);
    await checklists();
    await conversations();
    const revision = epoch.value;
    const sequence = ++evaluationsRead;
    const latest = [...summaries.values()].filter((row) => row.lastEvaluation);
    const loaded = await mapLimit(latest, async (row) => evaluation(await DA.api.getEvaluation(row.lastEvaluation.id, options), row.lastEvaluation.status === "stale"));
    if (epoch.value === revision && sequence === evaluationsRead && !options?.signal?.aborted) DA.state.evaluations = Object.fromEntries(loaded.map((ev) => [ev.conversationId, ev]));
    return Object.values(DA.state.evaluations);
  }
  async function appeals(options) {
    ensureMode();
    if (!server()) return DA.state.appeals;
    const revision = epoch.value;
    const sequence = ++appealsRead;
    const result = await DA.api.listAppeals({ status: "all" }, options);
    const loaded = await mapLimit(result.items || [], async (item) => appeal(await DA.api.getAppeal(item.id, options)));
    if (epoch.value === revision && sequence === appealsRead && !options?.signal?.aborted) DA.state.appeals = loaded;
    emit("da:appeals-changed");
    return DA.state.appeals;
  }
  function appealContext(value) {
    const a = typeof value === "string" ? DA.state.appeals.find((item) => item.id === value) : value;
    if (!a) return null;
    const ev = (!server() && DA.state.evaluationHistory[a.evaluationId]) || a.evaluation || DA.state.evaluations[a.conversationId];
    const conv = a.conversation || DA.state.conversations[a.conversationId];
    const cl = ev && DA.checklist(ev.checklistVersion);
    const c = a.criterion || (cl && DA.criterionById(cl, a.criterionId));
    if (!ev || !conv || !cl || !c) return null;
    return { ev, conv, cl, c, item: ev.items.find((item) => item.criterionId === a.criterionId) };
  }
  function cardContext(cid, evaluationId) {
    if (evaluationId) {
      const historical = historyContexts.get(evaluationId);
      if (historical?.ev.conversationId === cid) return historical;
      const a = DA.state.appeals.find((entry) => entry.evaluationId === evaluationId);
      if (a?.evaluation && a.conversation) return { ev: a.evaluation, conv: a.conversation };
      const ev = DA.state.evaluationHistory?.[evaluationId];
      if (ev?.conversationId === cid) return { ev, conv: ev.sourceConversation || DA.state.conversations[cid] };
    }
    return { ev: DA.state.evaluations[cid] || null, conv: DA.state.conversations[cid] || null };
  }
  async function loadHistory(cid, evaluationId, options) {
    const a = DA.state.appeals.find((entry) => entry.evaluationId === evaluationId);
    const context = a?.evaluation && a.conversation ? { ev: a.evaluation, conv: a.conversation } : {
      ev: evaluation(await DA.api.getEvaluation(evaluationId, options)),
      conv: conversation(await DA.api.getEvaluationConversation(evaluationId, options))
    };
    if (context.ev.conversationId !== cid) throw failure("not_found", "Эта оценка относится к другому обращению");
    if (!options?.signal?.aborted) historyContexts.set(evaluationId, context);
    return context;
  }
  function upsertAppeal(saved) {
    const index = DA.state.appeals.findIndex((item) => item.id === saved.id);
    if (index < 0) DA.state.appeals.push(saved);
    else DA.state.appeals[index] = saved;
    emit("da:appeals-changed");
  }
  async function createAppeal(cid, criterionId, comment, proposedAnswer) {
    const ev = DA.state.evaluations[cid];
    if (!ev) throw failure("evaluation_not_ready", "Сначала оцените обращение");
    if (!server()) {
      if (DA.state.appeals.some((a) => a.conversationId === cid && a.evaluationId === ev.id && a.criterionId === criterionId && a.status === "open")) throw failure("appeal_exists", "По этому критерию уже открыта апелляция");
      const saved = DA.createAppeal(cid, criterionId, comment, proposedAnswer, 0);
      saved.evaluationId = ev.id;
      saved.evaluation = structuredClone(ev);
      saved.conversation = structuredClone(DA.state.conversations[cid]);
      DA.save();
      return saved;
    }
    const raw = await DA.api.createAppeal({ evaluationId: ev.id, criterionId, comment, proposedAnswer });
    epoch.value++;
    const saved = appeal({ ...raw, evaluation: ev, conversation: DA.state.conversations[cid] });
    const item = ev.items.find((entry) => entry.criterionId === criterionId);
    if (item) item.appealId = saved.id;
    upsertAppeal(saved);
    return saved;
  }
  async function decideAppeal(value, action, newAnswer, reason) {
    const a = typeof value === "string" ? DA.state.appeals.find((item) => item.id === value) : value;
    if (!a) throw failure("not_found", "Апелляция не найдена");
    if (!server()) {
      const latest = DA.state.evaluations[a.conversationId];
      const ctx = appealContext(a);
      DA.state.evaluations[a.conversationId] = ctx.ev;
      DA.decideAppeal(a, action, newAnswer, reason);
      a.evaluation = ctx.ev;
      updateEvaluationContexts(ctx.ev);
      if (latest && latest.id !== ctx.ev.id) DA.state.evaluations[a.conversationId] = latest;
      DA.save();
      return { appeal: a, evaluation: ctx.ev };
    }
    const response = await DA.api.decideAppeal(a.id, { action, newAnswer, reason });
    epoch.value++;
    const ev = evaluation(response.evaluation);
    const saved = appeal({ ...a, ...response.appeal, evaluation: ev });
    const latest = DA.state.evaluations[a.conversationId];
    if (!latest || latest.id === ev.id) DA.state.evaluations[a.conversationId] = ev;
    updateEvaluationContexts(ev);
    upsertAppeal(saved);
    return { appeal: saved, evaluation: ev };
  }
  async function saveChecklist(draft, options) {
    if (!server()) {
      const previous = DA.activeChecklist();
      const saved = DA.saveChecklist(draft);
      if (options?.activate === false) { saved.isActive = false; if (previous) previous.isActive = true; DA.save(); }
      return saved;
    }
    const saved = checklist(await DA.api.createChecklist({ ...draft, basedOnVersion: draft.version, isActive: options?.activate !== false }));
    epoch.value++;
    if (saved.isActive) DA.state.checklists.forEach((item) => { item.isActive = false; });
    DA.state.checklists.push(saved);
    emit("da:checklists-changed");
    return saved;
  }
  async function activateChecklist(value) {
    const target = DA.state.checklists.find((item) => item.id === value || item.version === value);
    if (!target) throw failure("not_found", "Версия чек-листа не найдена");
    if (!server()) { DA.activateChecklist(target.version); return target; }
    const saved = checklist(await DA.api.activateChecklist(target.id));
    epoch.value++;
    DA.state.checklists = DA.state.checklists.map((item) => item.id === saved.id ? saved : { ...item, isActive: false });
    emit("da:checklists-changed");
    return saved;
  }
  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException("Действие прервано", "AbortError")); };
      const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
  }
  async function watchEvaluation(id, options) {
    const opts = options || {};
    while (true) {
      if (opts.signal?.aborted) throw new DOMException("Действие прервано", "AbortError");
      if (!server()) {
        const local = DA.state.evaluationHistory[id] || Object.values(DA.state.evaluations).find((ev) => ev.id === id);
        if (!local) throw failure("not_found", "Оценка не найдена");
        opts.onProgress?.(local);
        if (local.status === "done" || local.status === "failed") return local;
        await wait(700, opts.signal);
        continue;
      }
      const revision = epoch.value;
      const raw = await DA.api.getEvaluation(id, { signal: opts.signal });
      const current = DA.state.evaluations[raw.conversationId];
      const latest = summaries.get(raw.conversationId)?.lastEvaluation;
      const ev = revision !== epoch.value && current?.id === id ? current : evaluation(raw);
      if (revision === epoch.value && (!current || current.id === id || latest?.id === id)) {
        DA.state.evaluations[raw.conversationId] = ev;
        updateEvaluationContexts(ev);
      }
      opts.onProgress?.(ev);
      if (ev.status === "done" || ev.status === "failed") { emit("da:evaluations-changed"); return ev; }
      await wait(700, opts.signal);
    }
  }
  async function evaluate(cid, options) {
    ensureMode();
    const opts = options || {};
    if (polls.has(cid)) return polls.get(cid);
    const task = (async () => {
      await checklists();
      const cl = DA.checklist(opts.checklistVersion) || DA.activeChecklist();
      if (server()) {
        const started = await DA.api.startEvaluation({ conversationIds: [cid], checklistId: cl.id, reuse: opts.reuse ?? false }, { signal: opts.signal });
        epoch.value++;
        const id = started.evaluationIds[cid];
        const row = summaries.get(cid);
        if (row) row.lastEvaluation = { id, status: "running" };
        return watchEvaluation(id, opts);
      }
      const fresh = DA.freshEvaluation(cid);
      if (!fresh) throw failure("evaluation_unavailable", "Оценка для этого транскрипта пока недоступна");
      const answers = new Map(fresh.items.map((item) => [item.criterionId, item]));
      const previous = DA.state.evaluations[cid];
      if (previous) DA.state.evaluationHistory[previous.id] = structuredClone(previous);
      fresh.id = "ev_local_" + Date.now() + "_" + cid;
      fresh.checklistVersion = cl.version;
      fresh.checklistId = cl.id;
      fresh.status = "running";
      fresh.items = cl.criteria.map((c) => ({ criterionId: c.id, evidence: [], ...answers.get(c.id), status: "pending", answer: null, appealId: null, original: null }));
      fresh.total = null;
      DA.state.evaluations[cid] = fresh;
      DA.rescore(fresh);
      const notify = () => { DA.state.evaluationHistory[fresh.id] = fresh; DA.save(); if (!opts.signal?.aborted) opts.onProgress?.(fresh); };
      notify();
      for (const item of fresh.items) {
        item.status = "running";
        notify();
        await wait(450);
        const answer = answers.get(item.criterionId), criterion = DA.criterionById(cl, item.criterionId);
        if (!answer || !DA.allowedAnswers(criterion).includes(answer.answer)) Object.assign(item, { status: "failed", explanation: "Оценка этого критерия сейчас недоступна. Попробуйте ещё раз позже" });
        else Object.assign(item, structuredClone(answer), { status: "done", appealId: null, original: null });
        DA.rescore(fresh);
        notify();
      }
      fresh.status = fresh.items.some((item) => item.status === "failed") ? "failed" : "done";
      fresh.minutesAgo = 0;
      fresh.originalTotal = fresh.total;
      notify();
      emit("da:evaluations-changed");
      return fresh;
    })();
    polls.set(cid, task);
    try { return await task; }
    finally { if (polls.get(cid) === task) polls.delete(cid); }
  }
  async function retryCriterion(id, criterionId, options) {
    if (!server()) {
      const ev = DA.state.evaluationHistory[id];
      const item = ev?.items.find((entry) => entry.criterionId === criterionId);
      if (!item || item.status !== "failed") throw failure("criterion_not_failed", "Повтор доступен для критерия с ошибкой");
      const fresh = DA.freshEvaluation(ev.conversationId), answer = fresh?.items.find((entry) => entry.criterionId === criterionId);
      const c = DA.criterionById(DA.checklist(ev.checklistVersion), criterionId);
      item.status = "running";
      ev.status = "running";
      options?.onProgress?.(ev);
      await wait(450, options?.signal);
      if (!answer || !DA.allowedAnswers(c).includes(answer.answer)) { item.status = "failed"; item.explanation = "Оценка этого критерия сейчас недоступна. Попробуйте ещё раз позже"; }
      else Object.assign(item, structuredClone(answer));
      DA.rescore(ev);
      ev.status = ev.items.some((entry) => entry.status === "failed") ? "failed" : "done";
      if (ev.status === "done" && ev.originalTotal == null) ev.originalTotal = ev.total;
      DA.save();
      options?.onProgress?.(ev);
      emit("da:evaluations-changed");
      return ev;
    }
    const raw = await DA.api.retryCriterion(id, criterionId, { signal: options?.signal });
    epoch.value++;
    saveEvaluation(raw);
    return watchEvaluation(id, options);
  }
  async function history(cid, options) {
    if (server()) return (await DA.api.listEvaluations(cid, options)).items.map((ev) => evaluation(ev));
    return Object.values(DA.state.evaluationHistory || {}).filter((ev) => ev.conversationId === cid).reverse();
  }
  async function evaluationById(id, options) {
    return server() ? evaluation(await DA.api.getEvaluation(id, options)) : DA.state.evaluationHistory[id] || null;
  }
  async function compareChecklists(value, against, filters) {
    const target = DA.state.checklists.find((cl) => cl.id === value || cl.version === value);
    const previous = DA.state.checklists.find((cl) => cl.id === against || cl.version === against);
    if (!target || !previous) throw failure("not_found", "Версия чек-листа не найдена");
    if (server()) return DA.api.compareChecklists(target.id, previous.id, filters);
    const items = Object.values(DA.state.conversations).map((conv) => {
      const all = Object.values(DA.state.evaluationHistory).filter((ev) => ev.conversationId === conv.conversation_id && ev.status === "done" && !ev.stale && (!ev.transcriptKey || ev.transcriptKey === DA.transcriptKey(conv.transcript))).reverse();
      const before = all.find((ev) => ev.checklistVersion === previous.version), after = all.find((ev) => ev.checklistVersion === target.version);
      return { conversationId: conv.conversation_id, before: before?.total ?? null, after: after?.total ?? null,
        changed: before && after ? after.items.filter((item) => before.items.find((old) => old.criterionId === item.criterionId)?.answer !== item.answer).map((item) => ({ criterionId: item.criterionId, before: before.items.find((old) => old.criterionId === item.criterionId)?.answer ?? null, after: item.answer })) : [] };
    });
    const paired = items.filter((item) => item.before != null && item.after != null);
    return { items, summary: { total: items.length, changedCount: paired.filter((item) => item.before !== item.after).length, avgDelta: paired.length ? paired.reduce((sum, item) => sum + item.after - item.before, 0) / paired.length : null } };
  }
  async function stats(filters) {
    if (server()) return DA.api.getStats(filters);
    const cl = DA.activeChecklist(), evs = Object.values(DA.state.evaluations).filter((ev) => ev.status === "done" && !ev.stale && ev.total != null);
    return { evaluated: evs.length, avgTotal: evs.length ? evs.reduce((sum, ev) => sum + ev.total, 0) / evs.length : null,
      grossCount: evs.filter((ev) => ev.grossFlagged).length,
      totals: evs.map((ev) => ({ conversationId: ev.conversationId, total: ev.total })),
      byCriterion: cl.criteria.map((c) => {
        const counts = (group) => {
          const items = group.map((ev) => ev.items.find((item) => item.criterionId === c.id)).filter((item) => item?.status === "done");
          const applicable = items.filter((item) => item.fraction != null);
          return { yes: items.filter((item) => DA.tone(item.answer, c) === "yes").length,
            no: items.filter((item) => ["no", "partial", "flag"].includes(DA.tone(item.answer, c))).length,
            na: items.filter((item) => item.answer === "na").length,
            avgFraction: applicable.length ? applicable.reduce((sum, item) => sum + item.fraction, 0) / applicable.length : null };
        };
        return { criterionId: c.id, ...counts(evs), byLanguage: Object.fromEntries(["RU", "KZ", "EN"].map((lang) => [lang, counts(evs.filter((ev) => DA.state.conversations[ev.conversationId]?.language === lang))])) };
      }), appeals: Object.fromEntries(["open", "confirmed", "changed"].map((status) => [status, DA.state.appeals.filter((a) => a.status === status).length])) };
  }
  async function prepare(scope, options) {
    ensureMode();
    if (!server()) return DA.state;
    const opts = options || {};
    const check = () => { if (opts.signal?.aborted) throw new DOMException("Действие прервано", "AbortError"); };
    check();
    await checklists({ refresh: opts.refresh });
    check();
    if (scope === "checklists") return DA.state;
    await conversations({ refresh: opts.refresh });
    check();
    if (scope === "card") {
      await Promise.all([getEvaluation(opts.id, { refresh: true, signal: opts.signal }), appeals({ signal: opts.signal })]);
      if (opts.evaluationId) await loadHistory(opts.id, opts.evaluationId, { signal: opts.signal });
    } else await Promise.all([evaluations({ signal: opts.signal }), appeals({ signal: opts.signal })]);
    check();
    if (scope === "insights") { const result = await stats(); check(); DA.state.stats = result; }
    return DA.state;
  }
  DA.data = { prepare, conversations, checklists, evaluation: getEvaluation, evaluations, appeals, appealContext, cardContext,
    evaluate, watchEvaluation, retryCriterion, history, evaluationById, compareChecklists, createAppeal, decideAppeal, saveChecklist, activateChecklist, stats,
    invalidate, refresh: () => prepare("registry", { refresh: true }),
    normalizeConversation: conversation, normalizeEvaluation: evaluation };
})();
