/* Форматирование, расчёт предпросмотра и единый слой данных экранов. */
(function () {
  const DA = (window.DA = window.DA || {});
  DA.i18n.addMessages({
    "core.justNow": { ru: "только что", kk: "жаңа ғана", en: "just now" },
    "core.minutesAgo": { ru: "{count} мин назад", kk: "{count} мин бұрын", en: "{count} min ago" },
    "core.hoursAgo": { ru: "{count} ч назад", kk: "{count} сағ бұрын", en: "{count} hr ago" },
    "core.todayAt": { ru: "Сегодня, {time}", kk: "Бүгін, {time}", en: "Today, {time}" },
    "core.speaker.client": { ru: "Клиент", kk: "Клиент", en: "Customer" },
    "core.speaker.operator": { ru: "Оператор", kk: "Оператор", en: "Agent" },
    "core.speaker.bot": { ru: "Бот AIM", kk: "AIM боты", en: "AIM bot" },
    "core.speaker.system": { ru: "Система", kk: "Жүйе", en: "System" },
    "core.language.RU": { ru: "Русский", kk: "Орысша", en: "Russian" },
    "core.language.KZ": { ru: "Казахский", kk: "Қазақша", en: "Kazakh" },
    "core.language.EN": { ru: "Английский", kk: "Ағылшынша", en: "English" },
    "core.channel.call": { ru: "Звонок", kk: "Қоңырау", en: "Call" },
    "core.channel.chat": { ru: "Чат", kk: "Чат", en: "Chat" },
    "core.answer.yes": { ru: "Да", kk: "Иә", en: "Yes" },
    "core.answer.no": { ru: "Нет", kk: "Жоқ", en: "No" },
    "core.answer.found": { ru: "Найдена", kk: "Табылды", en: "Found" },
    "core.answer.violation": { ru: "Нарушение", kk: "Бұзушылық", en: "Violation" },
    "core.answer.noViolations": { ru: "Нет нарушений", kk: "Бұзушылық жоқ", en: "No violations" },
    "core.answer.na": { ru: "Не применимо", kk: "Қолданылмайды", en: "Not applicable" },
    "core.answer.scale": { ru: "{value} из {max}", kk: "{max} ұпайдан {value}", en: "{value} of {max}" }
  });

  /* ---------- Форматирование ---------- */
  const scoreFormats = new Map();
  const locale = () => ({ ru: "ru-RU", kk: "kk-KZ", en: "en-US" })[DA.i18n.locale()];
  DA.fmt = {
    locale,
    score(x) {
      if (x == null) return "—";
      const code = locale();
      if (!scoreFormats.has(code)) scoreFormats.set(code, new Intl.NumberFormat(code, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      return scoreFormats.get(code).format(x);
    },
    duration(sec) {
      sec = Math.max(0, Math.round(sec));
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    },
    plural(n, forms) {
      const variants = Array.isArray(forms) ? forms : forms[DA.i18n.locale()] || forms.ru || forms;
      const category = DA.i18n.plural(n);
      if (!Array.isArray(variants)) return variants[category] ?? variants.other ?? variants.one;
      return variants[category === "one" ? 0 : category === "few" ? 1 : 2] ?? variants.at(-1);
    },
    ago(min) {
      if (min < 1) return DA.t("core.justNow");
      if (min < 60) return DA.t("core.minutesAgo", { count: min });
      return DA.t("core.hoursAgo", { count: Math.round(min / 60) });
    },
    dateTime(ms) {
      const d = new Date(ms), today = new Date();
      const time = d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
      if (d.toDateString() === today.toDateString()) return DA.t("core.todayAt", { time });
      return `${d.toLocaleDateString(locale(), { day: "numeric", month: "long" })}, ${time}`;
    },
    number: (n) => String(n).padStart(3, "0")
  };

  const labels = (prefix, keys) => Object.defineProperties({}, Object.fromEntries(keys.map((key) => [key, { enumerable: true, get: () => DA.t(prefix + key) }])));
  DA.speakerLabel = labels("core.speaker.", ["client", "operator", "bot", "system"]);
  DA.langLabel = labels("core.language.", ["RU", "KZ", "EN"]);
  DA.channelLabel = (conv) => DA.t(conv.channel === "voice call" ? "core.channel.call" : "core.channel.chat");

  DA.audioHref = function (conv) {
    if (!conv || typeof conv.audio_url !== "string" || !conv.audio_url.trim()) return null;
    return `/api/conversations/${encodeURIComponent(conv.conversation_id)}/audio`;
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
    if (c.type === "scale") return DA.t("core.answer.scale", { value: answer, max: DA.scaleMax(c) });
    if (c.type === "flag") return DA.t(answer === "yes" ? "core.answer.found" : "core.answer.no");
    return DA.t(answer === "yes" ? "core.answer.yes" : "core.answer.no");
  };
  DA.answerText = function (answer, c) {
    if (answer == null) return "…";
    if (answer === "na") return DA.t("core.answer.na");
    if (c.type === "scale") return DA.t("core.answer.scale", { value: answer, max: DA.scaleMax(c) });
    if (c.type === "flag") return DA.t(answer === "yes" ? "core.answer.violation" : "core.answer.noViolations");
    return DA.t(answer === "yes" ? "core.answer.yes" : "core.answer.no");
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

  /* Только предпочтения интерфейса хранятся в браузере. Данные загружает API. */
  const KEY = "da.proto.v2";
  DA.transcriptKey = (turns) => JSON.stringify(turns.map(({ timestamp, speaker, text }) => [timestamp, speaker, text]));
  function loadPreferences() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ role: DA.state.role, sidebar: DA.state.sidebar })); }
    catch (e) { /* Предпочтения необязательны для работы с сервером. */ }
  }
  function emptyState(preferences) {
    return { evaluations: {}, evaluationHistory: {}, jobs: {}, appeals: [],
      role: preferences?.role === "reviewer" ? "reviewer" : "analyst", conversations: {}, numbers: {}, checklists: [],
      importedAt: Date.now(), sidebar: preferences?.sidebar === "closed" ? "closed" : "open" };
  }
  DA.state = emptyState();
  DA.initState = function () {
    DA.stateMode = "server";
    DA.state = emptyState(loadPreferences());
  };
  DA.convNumber = (cid) => DA.fmt.number(DA.state.numbers[cid]);
  DA.save = save;
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
  let evaluationsRead = 0, appealsRead = 0, bootstrapRead = 0;
  const polls = new Map();
  const jobMetadata = new Map();
  const reopenedAt = new Map();
  const time = (value) => typeof value === "number" ? value : value ? Date.parse(value) : null;
  const emit = (name) => window.dispatchEvent(new CustomEvent(name));
  const failure = (code, message) => new DA.ApiError(code, message, 0);
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
  function evaluationStale(raw, records = DA.state.conversations, rows = summaries) {
    const currentConversation = records[raw.conversationId];
    if (raw.transcriptHash && currentConversation?.transcriptHash) return raw.transcriptHash !== currentConversation.transcriptHash;
    const summary = rows.get(raw.conversationId)?.lastEvaluation;
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
  function appeal(raw, records, rows) {
    return { ...raw, createdAt: time(raw.createdAt),
      decision: raw.decision ? { ...raw.decision, decidedAt: time(raw.decision.decidedAt) } : null,
      ...(raw.evaluation ? { evaluation: evaluation(raw.evaluation, evaluationStale(raw.evaluation, records, rows)) } : {}),
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
  /* Два экрана могут одновременно опрашивать одну оценку. Старый ответ чтения
     не откатывает готовые шаги; явный retry отдельно сбрасывает состояние. */
  function retainEvaluationProgress(incoming) {
    const latest = DA.state.evaluations[incoming.conversationId];
    const current = latest?.id === incoming.id ? latest : DA.state.evaluationHistory[incoming.id];
    if (!current) return incoming;
    const terminal = (ev) => ev.status === "done" || ev.status === "failed";
    const completed = (ev) => ev.items.filter((item) => item.status === "done" || item.status === "failed").length;
    if ((terminal(current) && !terminal(incoming)) || (current.status === "done" && incoming.status === "failed")
      || (current.status === "running" && incoming.status === "queued")
      || (current.status === "running" && incoming.status === "running" && completed(current) > completed(incoming))) return current;
    return incoming;
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
    await checklists();
    if (!options?.refresh && DA.state.evaluations[cid]) return DA.state.evaluations[cid];
    const revision = epoch.value;
    const sequence = (evaluationReads.get(cid) || 0) + 1;
    evaluationReads.set(cid, sequence);
    const history = await DA.api.listEvaluations(cid, options);
    const raw = history.items?.[0];
    if (epoch.value !== revision || evaluationReads.get(cid) !== sequence || options?.signal?.aborted) return DA.state.evaluations[cid] || null;
    if (!raw) { delete DA.state.evaluations[cid]; return null; }
    const ev = retainEvaluationProgress(evaluation(raw, summaries.get(cid)?.lastEvaluation?.status === "stale"));
    DA.state.evaluations[cid] = ev;
    return ev;
  }
  async function evaluations(options) {
    await checklists();
    await conversations();
    const revision = epoch.value;
    const sequence = ++evaluationsRead;
    const latest = [...summaries.values()].filter((row) => row.lastEvaluation);
    const loaded = (await mapLimit(latest, async (row) => evaluation(await DA.api.getEvaluation(row.lastEvaluation.id, options), row.lastEvaluation.status === "stale"))).map(retainEvaluationProgress);
    if (epoch.value === revision && sequence === evaluationsRead && !options?.signal?.aborted) DA.state.evaluations = Object.fromEntries(loaded.map((ev) => [ev.conversationId, ev]));
    return Object.values(DA.state.evaluations);
  }
  async function appeals(options) {
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
    const ev = a.evaluation || DA.state.evaluations[a.conversationId];
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
    const response = await DA.api.decideAppeal(a.id, { action, newAnswer, reason });
    epoch.value++;
    const ev = evaluation(response.evaluation);
    const current = DA.state.appeals.find((item) => item.id === a.id);
    const saved = appeal({ ...a, ...response.appeal, secondOpinion: response.appeal.secondOpinion || current?.secondOpinion || a.secondOpinion, evaluation: ev });
    const latest = DA.state.evaluations[a.conversationId];
    if (!latest || latest.id === ev.id) DA.state.evaluations[a.conversationId] = ev;
    updateEvaluationContexts(ev);
    upsertAppeal(saved);
    return { appeal: saved, evaluation: ev };
  }
  async function secondOpinion(id, options) {
    const opinion = await DA.api.secondOpinion(id, options);
    if (options?.signal?.aborted) throw new DOMException("Действие прервано", "AbortError");
    epoch.value++;
    const current = DA.state.appeals.find((item) => item.id === id);
    if (current) upsertAppeal({ ...current, secondOpinion: opinion });
    return opinion;
  }
  async function saveChecklist(draft, options) {
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
      const revision = epoch.value;
      const raw = await DA.api.getEvaluation(id, { signal: opts.signal });
      if ((reopenedAt.get(id) || 0) > revision) continue;
      const current = DA.state.evaluations[raw.conversationId];
      const latest = summaries.get(raw.conversationId)?.lastEvaluation;
      const ev = revision !== epoch.value && current?.id === id ? current : retainEvaluationProgress(evaluation(raw));
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
    const opts = options || {};
    const operationId = opts.evaluationId || cid;
    if (polls.has(operationId)) return polls.get(operationId);
    const task = (async () => {
      await checklists();
      const requested = opts.checklistId ?? opts.checklistVersion;
      const cl = requested == null ? DA.activeChecklist() : versionBy(requested);
      if (!cl) throw failure("not_found", "Версия чек-листа не найдена");
      const started = await DA.api.startEvaluation({ conversationIds: [cid], checklistId: cl.id, reuse: opts.reuse ?? false }, { signal: opts.signal });
      epoch.value++;
      const id = started.evaluationIds[cid];
      const row = summaries.get(cid);
      if (row) row.lastEvaluation = { id, status: "running" };
      return watchEvaluation(id, opts);
    })();
    polls.set(operationId, task);
    try { return await task; }
    finally { if (polls.get(operationId) === task) polls.delete(operationId); }
  }
  function emptyEvaluation(id, cid, cl, record) {
    return { id, conversationId: cid, checklistId: cl.id, checklistVersion: cl.version,
      status: "queued", total: null, originalTotal: null, sections: [], grossFlagged: false,
      minutesAgo: 0, durationSec: null, startedAt: null, finishedAt: null, durationMs: null, usage: null,
      transcriptHash: record?.transcriptHash, transcriptKey: record ? DA.transcriptKey(record.transcript) : null,
      items: cl.criteria.map((c) => ({ criterionId: c.id, status: "pending", answer: null, explanation: null,
        naReason: null, evidence: [], checkedRange: null, needsReview: false, original: null, appealId: null,
        effectiveWeight: 0, points: 0, fraction: null, reused: false, usage: null })) };
  }
  function jobSnapshot(job, evaluationsById) {
    const items = job.items.map((item) => {
      const ev = evaluationsById?.get(item.evaluationId) || DA.state.evaluationHistory[item.evaluationId]
        || (DA.state.evaluations[item.conversationId]?.id === item.evaluationId ? DA.state.evaluations[item.conversationId] : null);
      return { ...item, total: item.status === "done" ? ev?.total ?? null : null, evaluation: ev || null,
        error: item.status === "failed" ? ev?.items.find((entry) => entry.status === "failed")?.explanation || "Оценка этого обращения сейчас недоступна" : null };
    });
    const finished = items.map((item) => time(item.evaluation?.finishedAt)).filter((value) => value != null);
    const finishedAt = job.status === "running" ? null : job.finishedAt || (finished.length ? new Date(Math.max(...finished)).toISOString() : null);
    const elapsed = Math.max(0, ((time(finishedAt) || Date.now()) - time(job.startedAt)) / 1000);
    return { ...job, items, finishedAt, durationSec: elapsed,
      checklistVersion: job.checklistVersion || items.find((item) => item.evaluation)?.evaluation.checklistVersion,
      usage: job.usage ?? null };
  }
  /* Явная граница повторного запуска из свежего списка активных задач.
     Обычные запоздавшие ответы опроса по-прежнему не откатывают готовый результат. */
  function reopenJob(raw) {
    const terminal = (value) => value && ["done", "failed"].includes(value.status);
    if (!raw?.id || !["queued", "running"].includes(raw.status)) return [];
    const known = DA.state.jobs[raw.id];
    if (known && !terminal(known)) return [];
    const active = (raw.items || []).filter((item) => item.conversationId && item.evaluationId && ["queued", "running"].includes(item.status));
    if (!active.length) return [];
    const reopened = [];
    for (const item of active) {
      const current = DA.state.evaluations[item.conversationId];
      const historical = DA.state.evaluationHistory[item.evaluationId];
      const cached = current?.id === item.evaluationId ? current : historical;
      const summary = summaries.get(item.conversationId);
      if (summary?.lastEvaluation?.id === item.evaluationId) summary.lastEvaluation = current && current.id !== item.evaluationId
        ? { id: current.id, status: current.status } : { ...summary.lastEvaluation, status: item.status };
      if (!terminal(cached)) continue;
      if (terminal(historical)) delete DA.state.evaluationHistory[item.evaluationId];
      if (current?.id === item.evaluationId && terminal(current)) delete DA.state.evaluations[item.conversationId];
      reopened.push(item.evaluationId);
    }
    epoch.value++;
    active.forEach((item) => reopenedAt.set(item.evaluationId, epoch.value));
    DA.state.jobs[raw.id] = { ...known, ...raw, items: raw.items.map((item) => ({ ...item })) };
    return reopened;
  }
  function registerBatch(started, cl, options, replaceCurrent) {
    const opts = options || {}, ids = Object.keys(started.evaluationIds);
    const cached = DA.state.jobs[started.jobId];
    if (cached) return { ...started, evaluationIds: Object.fromEntries(cached.items.map((item) => [item.conversationId, item.evaluationId])), job: jobSnapshot(cached) };
    epoch.value++;
    const items = ids.map((cid) => {
      const id = started.evaluationIds[cid], current = DA.state.evaluations[cid];
      const ev = current?.id === id ? current : DA.state.evaluationHistory[id] || emptyEvaluation(id, cid, cl, DA.state.conversations[cid]);
      DA.state.evaluationHistory[id] = ev;
      if (replaceCurrent || !current || current.id === id) {
        if (current && current.id !== id) DA.state.evaluationHistory[current.id] = current;
        DA.state.evaluations[cid] = ev;
        const row = summaries.get(cid);
        if (row) row.lastEvaluation = { id, status: ev.status };
      }
      return { conversationId: cid, evaluationId: id, status: ev.status };
    });
    const done = items.filter((item) => item.status === "done").length;
    const failed = items.filter((item) => item.status === "failed").length;
    const starts = items.map((item) => DA.state.evaluationHistory[item.evaluationId]).map((ev) =>
      time(ev.startedAt) ?? (ev.finishedAt && ev.durationMs != null ? time(ev.finishedAt) - ev.durationMs : null)).filter(Number.isFinite);
    const job = { id: started.jobId, status: done + failed === ids.length ? failed ? "failed" : "done" : "running",
      total: ids.length, done, failed, startedAt: started.startedAt || opts.startedAt || new Date(starts.length ? Math.min(...starts) : Date.now()).toISOString(), finishedAt: null,
      checklistVersion: cl.version, reuse: started.reuse ?? opts.reuse ?? false, usage: null, items };
    jobMetadata.set(job.id, { checklistVersion: cl.version, reuse: job.reuse });
    DA.state.jobs[job.id] = job;
    emit("da:evaluations-changed");
    return { ...started, job: jobSnapshot(job) };
  }
  async function adoptBatch(started, options) {
    const entries = Object.entries(started?.evaluationIds || {});
    if (typeof started?.jobId !== "string" || !started.jobId || !entries.length
      || entries.some(([cid, id]) => !cid || typeof id !== "string" || !id)) throw failure("invalid_response", "Не удалось прочитать пакет оценок");
    const opts = options || {};
    const requested = started.checklistId ?? started.checklistVersion ?? opts.checklistId ?? opts.checklistVersion;
    const cl = (requested == null ? DA.activeChecklist() : versionBy(requested))
      || { id: started.checklistId || opts.checklistId || null, version: started.checklistVersion || opts.checklistVersion || null, criteria: [] };
    return registerBatch(started, cl, opts, false);
  }
  async function startBatch(conversationIds, options) {
    const opts = options || {}, ids = [...new Set(conversationIds)];
    if (!ids.length) throw failure("invalid_request", "Выберите хотя бы одно обращение");
    await checklists();
    const requested = opts.checklistId ?? opts.checklistVersion;
    const cl = requested == null ? DA.activeChecklist() : versionBy(requested);
    if (!cl) throw failure("not_found", "Версия чек-листа не найдена");
    const started = await DA.api.startEvaluation({ conversationIds: ids, checklistId: cl.id, reuse: opts.reuse ?? false }, { signal: opts.signal });
    return registerBatch(started, cl, opts, true);
  }
  async function getJob(id, options) {
    if (options?.signal?.aborted) throw new DOMException("Действие прервано", "AbortError");
    await checklists();
    const revision = epoch.value;
    const raw = await DA.api.getJob(id, options);
    const loaded = (await mapLimit(raw.items, async (item) => {
      const current = DA.state.evaluations[item.conversationId];
      const cached = current?.id === item.evaluationId ? current : DA.state.evaluationHistory[item.evaluationId];
      const ev = cached && item.status !== "running" && cached.status === item.status ? evaluation(cached) : evaluation(await DA.api.getEvaluation(item.evaluationId, options));
      return [item.evaluationId, ev];
    })).map(([evaluationId, ev]) => [evaluationId, retainEvaluationProgress(ev)]);
    if (options?.signal?.aborted) throw new DOMException("Действие прервано", "AbortError");
    // Завершённый пакет должен попасть в общее состояние до остановки опроса.
    if (epoch.value !== revision) return getJob(id, options);
    if (epoch.value === revision && !options?.signal?.aborted) loaded.forEach(([, ev]) => {
      DA.state.evaluationHistory[ev.id] = ev;
      const current = DA.state.evaluations[ev.conversationId];
      const latest = summaries.get(ev.conversationId)?.lastEvaluation;
      if (!current || current.id === ev.id || latest?.id === ev.id) {
        DA.state.evaluations[ev.conversationId] = ev;
        updateEvaluationContexts(ev);
      }
    });
    const snapshot = jobSnapshot({ ...jobMetadata.get(id), ...raw }, new Map(loaded));
    if (epoch.value === revision && !options?.signal?.aborted) DA.state.jobs[id] = snapshot;
    return snapshot;
  }
  async function watchJob(id, options) {
    const opts = options || {};
    while (true) {
      const job = await getJob(id, { signal: opts.signal });
      opts.onProgress?.(job);
      if (job.status === "done" || job.status === "failed") return job;
      await wait(1000, opts.signal);
    }
  }
  async function retryBatch(id, options) {
    const job = await getJob(id, { signal: options?.signal });
    const ids = job.items.filter((item) => item.status === "failed").map((item) => item.conversationId);
    if (!ids.length) throw failure("nothing_to_retry", "В этом пакете нет обращений с ошибкой");
    return startBatch(ids, { checklistVersion: job.checklistVersion, ...options, reuse: options?.reuse ?? true });
  }
  async function retryCriterion(id, criterionId, options) {
    const raw = await DA.api.retryCriterion(id, criterionId, { signal: options?.signal });
    epoch.value++;
    saveEvaluation(raw);
    return watchEvaluation(id, options);
  }
  async function history(cid, options) {
    return (await DA.api.listEvaluations(cid, options)).items.map((ev) => evaluation(ev));
  }
  async function evaluationById(id, options) {
    return evaluation(await DA.api.getEvaluation(id, options));
  }
  function versionBy(value) { return DA.state.checklists.find((cl) => cl.id === value || cl.version === value); }
  async function latestEvaluations(options) {
    const opts = options || {};
    await checklists();
    const records = await conversations();
    const version = opts.checklistId || opts.checklistVersion;
    const cl = version != null ? versionBy(version) : null;
    if (version != null && !cl) throw failure("not_found", "Версия чек-листа не найдена");
    const candidates = records.filter((conv) => {
      if (!opts.groupId) return true;
      return (conv.datasetGroupId || conv.groupId) === opts.groupId;
    });
    const loaded = await mapLimit(candidates, async (conv) => {
      const all = await history(conv.conversation_id, { signal: opts.signal });
      return all.find((ev) => {
        if ((!opts.includeIncomplete && ev.status !== "done") || (cl && ev.checklistVersion !== cl.version)) return false;
        if (ev.transcriptHash && conv.transcriptHash) return ev.transcriptHash === conv.transcriptHash;
        if (ev.transcriptKey) return ev.transcriptKey === DA.transcriptKey(conv.transcript);
        return !ev.stale;
      });
    });
    return loaded.filter(Boolean);
  }
  async function diffChecklists(value, against) {
    const target = versionBy(value), previous = versionBy(against);
    if (!target || !previous) throw failure("not_found", "Версия чек-листа не найдена");
    return DA.api.diffChecklists(target.id, previous.id);
  }
  async function compareChecklists(value, against, filters) {
    const target = versionBy(value), previous = versionBy(against);
    if (!target || !previous) throw failure("not_found", "Версия чек-листа не найдена");
    return DA.api.compareChecklists(target.id, previous.id, filters);
  }
  async function stats(filters) {
    return DA.api.getStats(filters);
  }
  /* Один свежий снимок вместо запросов для каждой строки. Собираем новое
     состояние целиком до публикации; старый маршрут или чтение до мутации
     не могут заменить уже сохранённые данные. История и задачи живут отдельно. */
  async function bootstrap(options) {
    const revision = epoch.value, sequence = ++bootstrapRead;
    const raw = await DA.api.bootstrap(options);
    if (options?.signal?.aborted) throw new DOMException("Действие прервано", "AbortError");
    if (revision !== epoch.value || sequence !== bootstrapRead) return false;
    if (raw?.schemaVersion !== 1 || !Array.isArray(raw.registry?.items)
      || !Array.isArray(raw.conversations) || !Array.isArray(raw.evaluations)
      || !Array.isArray(raw.checklists) || !Array.isArray(raw.appeals?.items)) {
      throw failure("invalid_response", "Не удалось прочитать ответ сервера");
    }
    const nextSummaries = new Map(raw.registry.items.map((row) => [row.id, row]));
    const records = raw.conversations.map((row) => conversation({ ...nextSummaries.get(row.id), ...row }));
    const nextConversations = Object.fromEntries(records.map((record) => [record.conversation_id, record]));
    const nextChecklists = raw.checklists.map(checklist).sort((a, b) => a.version - b.version);
    const nextEvaluations = raw.evaluations.map((row) => {
      const retained = retainEvaluationProgress(evaluation(row, evaluationStale(row, nextConversations, nextSummaries)));
      return evaluation(retained, evaluationStale(retained, nextConversations, nextSummaries));
    });
    const nextAppeals = raw.appeals.items.map((row) => {
      if (!row.evaluation || !row.conversation || !row.criterion || row.evaluation.id !== row.evaluationId
        || row.evaluation.conversationId !== row.conversationId) {
        throw failure("invalid_response", "Не удалось прочитать контекст апелляции");
      }
      return appeal(row, nextConversations, nextSummaries);
    });
    epoch.value++;
    summaries = nextSummaries;
    DA.state.conversations = nextConversations;
    DA.state.numbers = Object.fromEntries(records.map((record, index) => [record.conversation_id, record.number ?? index + 1]));
    DA.state.checklists = nextChecklists;
    DA.state.evaluations = Object.fromEntries(nextEvaluations.map((ev) => [ev.conversationId, ev]));
    DA.state.appeals = nextAppeals;
    conversationReady = true;
    conversationLoad = checklistLoad = null;
    emit("da:appeals-changed");
    return true;
  }
  async function prepare(scope, options) {
    const opts = options || {};
    const check = () => { if (opts.signal?.aborted) throw new DOMException("Действие прервано", "AbortError"); };
    check();
    if (!await bootstrap(opts)) return DA.state;
    if (scope === "card" && opts.evaluationId) await loadHistory(opts.id, opts.evaluationId, { signal: opts.signal });
    check();
    if (scope === "insights") { const result = await stats(); check(); DA.state.stats = result; }
    return DA.state;
  }
  DA.data = { prepare, conversations, checklists, evaluation: getEvaluation, evaluations, appeals, appealContext, cardContext,
    evaluate, watchEvaluation, retryCriterion, startBatch, adoptBatch, reopenJob, getJob, watchJob, retryBatch,
    history, evaluationById, latestEvaluations, diffChecklists, compareChecklists, createAppeal, decideAppeal, secondOpinion, saveChecklist, activateChecklist, stats,
    invalidate, refresh: () => prepare("registry", { refresh: true }),
    normalizeConversation: conversation, normalizeEvaluation: evaluation };
})();
