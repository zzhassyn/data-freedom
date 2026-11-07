const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const web = path.join(__dirname, '..');
const json = (value) => JSON.parse(JSON.stringify(value));
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const turn = { idx: 0, timestamp: '00:01', tSec: 0, speaker: 'operator', text: 'Здравствуйте' };
const source = { id: 'fixture', number: 12, transcriptHash: 'original', startedAt: '2026-11-01T10:00:00Z', importedAt: '2026-11-01T10:00:00Z', channel: 'agent chat', language: 'RU', audioUrl: null, transcript: [turn] };

function environment(fetcher, savedState) {
  const storage = new Map(), events = new EventTarget();
  if (savedState) storage.set('da.proto.v2', savedState);
  const context = { console, fetch: fetcher || (() => Promise.resolve(reply({ ok: false }))),
    URL, URLSearchParams, AbortController, DOMException, TextDecoder, structuredClone, Intl,
    setTimeout: (fn, ms) => setTimeout(fn, [450, 700, 1000].includes(ms) ? 0 : ms), clearTimeout,
    CustomEvent: class extends Event { constructor(type, opts) { super(type); this.detail = opts?.detail; } },
    dispatchEvent: events.dispatchEvent.bind(events), addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    document: { documentElement: { lang: 'ru' } },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    location: { reload() {} } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(web, 'data/checklist.js'), 'utf8'), context);
  context.DA_DEV = { records: [{ conversation_id: 'fixture', channel: source.channel, language: source.language, transcript: [turn], audio_url: null }] };
  context.DA_MOCK_ANSWERS = { fixture: Object.fromEntries(context.DA_CHECKLIST.criteria.map((c) => [c.id, { answer: c.type === 'scale' ? Math.max(...c.scale.map((s) => s.value)) : c.type === 'flag' ? 'no' : 'yes', explanation: 'Проверено', evidence: [] }])) };
  context.DA_MOCK_APPEALS = [];
  for (const file of ['i18n.js', 'api.js', 'core.js']) vm.runInContext(fs.readFileSync(path.join(web, 'js', file), 'utf8'), context);
  context.DA.initState();
  return { DA: context.DA, context, storage };
}
function rawEvaluation(cl, extra) {
  return { id: 'ev_server', conversationId: source.id, checklistId: cl.id, checklistVersion: 1, status: 'done',
    total: 93.75, originalTotal: 93.75, finishedAt: '2026-11-01T10:02:00Z', durationMs: 1250,
    grossError: { flagged: false }, sections: null,
    items: cl.criteria.map((c) => ({ criterionId: c.id, status: 'done', answer: c.type === 'scale' ? c.scale[0].value : c.type === 'flag' ? 'no' : 'yes', evidence: [], points: c.weight, effectiveWeight: c.weight, fraction: 1 })), ...extra };
}
function fixtureServer() {
  const env = environment();
  const cl = json(env.context.DA_CHECKLIST), ev = rawEvaluation(cl);
  const calls = [];
  env.context.fetch = async (url, opts) => {
    calls.push([url, opts]);
    if (url === '/api/checklists') return reply({ items: [{ id: cl.id }] });
    if (url === '/api/checklists/' + cl.id) return reply(cl);
    if (url === '/api/conversations') return reply({ items: [{ ...source, lastEvaluation: { id: ev.id, status: 'done' } }] });
    if (url === '/api/conversations/fixture') return reply(source);
    if (url === '/api/conversations/fixture/evaluations') return reply({ items: [ev] });
    if (url === '/api/evaluations/' + ev.id) return reply(ev);
    if (url === '/api/appeals?status=all') return reply({ items: [] });
    return reply({ error: { code: 'not_found', message: 'Не найдено' } }, 404);
  };
  env.DA.mode = 'server';
  env.DA.initState();
  return { ...env, cl, ev, calls };
}

test('detect is one request and an API failure never switches a detected server to local data', async () => {
  let requests = 0;
  const { DA } = environment(async (url) => {
    requests++;
    if (url === '/api/health') return reply({ ok: true });
    throw new TypeError('offline');
  });
  assert.equal(await DA.api.detect(), 'server');
  assert.equal(await DA.api.detect(), 'server');
  assert.equal(requests, 1);
  await assert.rejects(DA.api.getConversation('fixture'), (e) => e.code === 'network' && e.message === 'Нет связи с сервером');
  assert.equal(DA.mode, 'server');
});

test('API preserves contract errors, encodes identifiers and sends JSON for mutations', async () => {
  let request;
  const { DA } = environment(async (url, opts) => { request = { url, opts }; return reply({ error: { code: 'appeal_decided', message: 'Решение уже принято' } }, 409); });
  await assert.rejects(DA.api.decideAppeal('ap /1', { action: 'confirm', reason: 'Проверено по реплике' }), (e) => e.status === 409 && e.code === 'appeal_decided' && e.message === 'Решение уже принято');
  assert.equal(request.url, '/api/appeals/ap%20%2F1/decision');
  assert.equal(request.opts.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(request.opts.body).action, 'confirm');
});

test('STT and AI requests encode IDs, pass refresh separately and send JSON on mutation routes', async () => {
  const calls = [], timers = [];
  const { DA, context } = environment(async (url, opts) => { calls.push({ url, opts }); return reply({ ok: true }); });
  context.setTimeout = (fn, ms) => { timers.push(ms); return setTimeout(fn, ms); };
  await DA.api.getSttJobs({ groupId: 'DEV & UPLOAD' });
  await DA.api.getTranscription('call /1');
  await DA.api.retryTranscription('call /1');
  await DA.api.getSummary('call /1', { refresh: true });
  await DA.api.getTranslation('call /1');
  await DA.api.getCoaching('ev /1', { refresh: false });
  await DA.api.secondOpinion('ap /1', { refresh: true });
  assert.deepEqual(calls.map(({ url }) => url), [
    '/api/stt/jobs?groupId=DEV+%26+UPLOAD', '/api/conversations/call%20%2F1/transcription',
    '/api/conversations/call%20%2F1/transcription/retry', '/api/conversations/call%20%2F1/summary?refresh=true',
    '/api/conversations/call%20%2F1/translation?targetLanguage=RU&source=canonical', '/api/evaluations/ev%20%2F1/coaching?refresh=false',
    '/api/appeals/ap%20%2F1/second-opinion?refresh=true'
  ]);
  for (const index of [2, 6]) {
    assert.equal(calls[index].opts.method, 'POST');
    assert.equal(calls[index].opts.headers['Content-Type'], 'application/json');
    assert.equal(calls[index].opts.body, '{}');
  }
  assert.deepEqual(timers, [30000, 30000, 30000, 120000, 120000, 120000, 120000]);
  await DA.api.retryTranscription('call /1', { force: true });
  assert.equal(calls.at(-1).url, '/api/conversations/call%20%2F1/transcription/retry');
  assert.deepEqual(JSON.parse(calls.at(-1).opts.body), { force: true });
  await DA.api.getTranslation('call /1', { targetLanguage: 'KZ', source: 'transcription', sourceHash: 'hash +&/', refresh: true });
  assert.equal(calls.at(-1).url, '/api/conversations/call%20%2F1/translation?refresh=true&targetLanguage=KZ&source=transcription&sourceHash=hash+%2B%26%2F');
});

test('locale switching updates formatting and labels without changing evaluation or conversation data', () => {
  const { DA } = environment();
  const before = json({ evaluations: DA.state.evaluations, conversations: DA.state.conversations });
  const forms = { ru: ['обращение', 'обращения', 'обращений'], kk: ['өтініш'], en: ['conversation', 'conversations'] };
  assert.equal(DA.fmt.plural(21, forms), 'обращение');
  assert.equal(DA.fmt.plural(22, forms), 'обращения');
  assert.equal(DA.fmt.plural(25, forms), 'обращений');
  DA.i18n.setLocale('en');
  assert.equal(DA.fmt.locale(), 'en-US');
  assert.equal(DA.fmt.score(1234.5), '1,234.50');
  assert.equal(DA.fmt.plural(21, forms), 'conversations');
  assert.equal(DA.speakerLabel.operator, 'Agent');
  assert.equal(DA.channelLabel({ channel: 'voice call' }), 'Call');
  assert.equal(DA.answerText('yes', { type: 'binary' }), 'Yes');
  assert.equal(DA.fmt.ago(5), '5 min ago');
  DA.i18n.setLocale('kk');
  assert.equal(DA.fmt.locale(), 'kk-KZ');
  assert.equal(DA.fmt.score(1234.5), new Intl.NumberFormat('kk-KZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.5));
  assert.equal(DA.fmt.plural(22, forms), 'өтініш');
  assert.equal(DA.speakerLabel.system, 'Жүйе');
  assert.equal(DA.channelLabel({ channel: 'voice call' }), 'Қоңырау');
  assert.equal(DA.answerText('yes', { type: 'binary' }), 'Иә');
  assert.equal(DA.fmt.ago(5), '5 мин бұрын');
  DA.i18n.setLocale('ru');
  assert.equal(DA.speakerLabel.operator, 'Оператор');
  assert.deepEqual(json({ evaluations: DA.state.evaluations, conversations: DA.state.conversations }), before);
});

test('API error copy follows the current locale while preserving original and authored validation details', () => {
  const { DA } = environment();
  const network = new DA.ApiError('network', 'Нет связи с сервером', 0);
  const validation = new DA.ApiError('invalid_checklist', 'Критерий «Моя проверка Q3»: вес должен быть больше нуля', 400);
  const answer = new DA.ApiError('invalid_answer', 'Недопустимый ответ для критерия «Моя проверка Q3»', 400);
  assert.match(DA.apiErrorMessage(network), /Нет связи с сервером/);
  DA.i18n.setLocale('en');
  assert.equal(DA.apiErrorMessage(network), 'Cannot reach the server. Check your connection and try again.');
  assert.equal(DA.apiErrorMessage(validation), 'Check the data and try again. ' + validation.message);
  assert.equal(DA.apiErrorMessage(answer), 'The answer is not valid for “Моя проверка Q3”. Check the selected answer.');
  assert.equal(DA.apiErrorMessage(new Error('internal implementation detail')), 'Could not complete the action. Try again.');
  assert.equal(DA.apiErrorMessage(new DA.ApiError('future_contract_code', 'User field: original custom value', 400)),
    'Could not complete the action. Check the message: User field: original custom value');
  DA.i18n.setLocale('kk');
  assert.match(DA.apiErrorMessage(network), /Сервермен байланыс жоқ/);
  assert.ok(DA.apiErrorMessage(validation).endsWith(validation.message));
  assert.ok(DA.apiErrorMessage(answer).includes('Моя проверка Q3'));
  DA.i18n.setLocale('ru');
  assert.equal(DA.apiErrorMessage(validation), validation.message);
  assert.equal(network.message, 'Нет связи с сервером');
  assert.equal(network.code, 'network');
  assert.equal(DA.i18n.audit().missingUsed.length, 0);
  assert.equal(DA.i18n.audit().missingLocales.length, 0);
});

test('second opinion and reviewer decision preserve each other in either response order', async () => {
  for (const opinionFirst of [false, true]) {
    const { DA, ev, cl } = fixtureServer();
    await DA.data.prepare('registry', { refresh: true });
    const appeal = { id: 'ap_opinion', evaluationId: ev.id, conversationId: source.id, criterionId: cl.criteria[0].id,
      createdAt: 1, status: 'open', secondOpinion: null };
    DA.state.appeals = [appeal, { ...appeal, id: 'ap_untouched' }];
    const opinion = { answer: 'no', agreesWithAppeal: true, explanation: 'Проверено заново', evidence: [] };
    const decision = { action: 'change', newAnswer: 'no', reason: 'Проверено по реплике', decidedAt: '2026-11-01T12:00:00Z' };
    let releaseOpinion, releaseDecision;
    DA.api.secondOpinion = () => new Promise((resolve) => { releaseOpinion = resolve; });
    DA.api.decideAppeal = () => new Promise((resolve) => { releaseDecision = resolve; });
    const rereading = DA.data.secondOpinion(appeal.id);
    const deciding = DA.data.decideAppeal(appeal.id, 'change', 'no', decision.reason);
    if (opinionFirst) { releaseOpinion(opinion); await rereading; }
    releaseDecision({ appeal: { ...appeal, status: 'changed', decision }, evaluation: { ...ev, total: 80 } });
    await deciding;
    if (!opinionFirst) { releaseOpinion(opinion); await rereading; }
    const saved = DA.state.appeals.find((entry) => entry.id === appeal.id);
    assert.equal(saved.status, 'changed');
    assert.equal(saved.decision.reason, decision.reason);
    assert.deepEqual(json(saved.secondOpinion), opinion);
    assert.equal(DA.state.evaluations.fixture.total, 80);
    assert.equal(DA.state.appeals[1].secondOpinion, null);
  }
});

test('an abandoned second opinion cannot update the appeal after its caller aborts', async () => {
  const { DA, ev } = fixtureServer();
  const appeal = { id: 'ap_abandoned', evaluationId: ev.id, conversationId: source.id, status: 'open', secondOpinion: null };
  DA.state.appeals = [appeal];
  const controller = new AbortController();
  let release;
  DA.api.secondOpinion = () => new Promise((resolve) => { release = resolve; });
  const request = DA.data.secondOpinion(appeal.id, { signal: controller.signal });
  controller.abort();
  release({ answer: 'no', agreesWithAppeal: true, explanation: 'Проверено заново', evidence: [] });
  await assert.rejects(request, (error) => error.name === 'AbortError');
  assert.equal(DA.state.appeals[0].secondOpinion, null);
});

test('server normalization preserves authoritative totals, null sections, stable numbers and conversation cache', async () => {
  const { DA, calls } = fixtureServer();
  assert.equal(Object.keys(DA.state.evaluations).length, 0);
  await DA.data.prepare('registry', { refresh: true });
  assert.equal(DA.state.evaluations.fixture.total, 93.75);
  assert.deepEqual(json(DA.state.evaluations.fixture.sections), []);
  assert.equal(DA.state.evaluations.fixture.durationSec, 1.25);
  assert.equal(DA.state.numbers.fixture, 12);
  assert.equal(DA.tx.startedAt(DA.state.conversations.fixture), Date.parse(source.startedAt));
  const before = calls.length;
  await DA.data.conversations();
  assert.equal(calls.length, before);
  await DA.data.conversations({ refresh: true });
  assert.equal(calls.length, before + 1, 'fresh list reuses unchanged transcript details');
  DA.data.invalidate('conversations');
  await DA.data.conversations();
  assert.ok(calls.length > before);
});

test('server preferences do not overwrite durable local data', async () => {
  const { DA, storage } = environment();
  DA.save();
  const original = JSON.parse(storage.get('da.proto.v2'));
  DA.mode = 'server'; DA.initState();
  assert.equal(Object.keys(DA.state.conversations).length, 0);
  DA.state.evaluations = { serverOnly: { id: 'serverOnly' } };
  DA.state.role = 'reviewer'; DA.save();
  const saved = JSON.parse(storage.get('da.proto.v2'));
  assert.deepEqual(saved.evaluations, original.evaluations);
  assert.equal(saved.role, 'reviewer');
});

test('historical card and appeal use the original transcript without replacing the latest evaluation', async () => {
  const { DA, context, ev, cl } = fixtureServer();
  const old = rawEvaluation(cl, { id: 'ev_old', total: 50 });
  const snapshot = { ...source, transcript: [{ ...turn, text: 'Исходная реплика' }] };
  const savedFetch = context.fetch;
  context.fetch = async (url, opts) => {
    if (url === '/api/evaluations/ev_old') return reply(old);
    if (url === '/api/evaluations/ev_old/conversation') return reply(snapshot);
    return savedFetch(url, opts);
  };
  await DA.data.prepare('card', { id: source.id, evaluationId: old.id, refresh: true });
  assert.equal(DA.data.cardContext(source.id, old.id).conv.transcript[0].text, 'Исходная реплика');
  assert.equal(DA.state.evaluations.fixture.id, ev.id);
  DA.state.appeals = [{ id: 'ap_old', conversationId: source.id, criterionId: cl.criteria[0].id, evaluation: DA.data.normalizeEvaluation(old), conversation: DA.data.normalizeConversation(snapshot) }];
  assert.equal(DA.data.appealContext('ap_old').ev.total, 50);
});

test('watchEvaluation stops polling on abort and keeps partial results', async () => {
  const { DA, context, ev } = fixtureServer();
  const controller = new AbortController();
  let requests = 0;
  context.fetch = async () => { requests++; return reply({ ...ev, status: 'running', total: null }); };
  await assert.rejects(DA.data.watchEvaluation(ev.id, { signal: controller.signal, onProgress: () => controller.abort() }), (e) => e.name === 'AbortError');
  assert.equal(requests, 1);
  assert.equal(DA.state.evaluations.fixture.status, 'running');
  assert.equal(DA.state.evaluations.fixture.total, null);
});

test('local evaluation saves version history, reports new unknown criteria as failed, and preserves appeals', async () => {
  const { DA } = environment();
  const oldId = DA.state.evaluations.fixture.id;
  const appeal = await DA.data.createAppeal('fixture', 'contact', 'Проверьте приветствие', 'no');
  const draft = structuredClone(DA.activeChecklist());
  draft.criteria[0].description += ' Уточнённое правило.';
  const saved = await DA.data.saveChecklist(draft);
  const done = await DA.data.evaluate('fixture', { checklistVersion: saved.version });
  assert.equal(done.status, 'done');
  assert.equal(DA.data.appealContext(appeal).ev.id, oldId);
  assert.equal((await DA.data.history('fixture')).length, 2);
  const compare = await DA.data.compareChecklists(saved.version, 1);
  assert.equal(compare.items[0].before, 100);
  assert.equal(compare.items[0].after, 100);
  const unknown = structuredClone(saved);
  unknown.criteria[0].id = 'unknown';
  const version = await DA.data.saveChecklist(unknown);
  const failed = await DA.data.evaluate('fixture', { checklistVersion: version.version });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.total, null);
  assert.equal(failed.items[0].status, 'failed');
  assert.equal(failed.items[1].status, 'done');
});

test('source stream completes only after done and exposes provider errors', async () => {
  let body = '{"stage":"importing","processed":1,"total":2}\n{"stage":"done","result":{"imported":2}}\n';
  const { DA } = environment(async () => new Response(body, { headers: { 'content-type': 'application/x-ndjson' } }));
  const progress = [];
  assert.equal((await DA.api.syncSource({ onProgress: (step) => progress.push(step.stage) })).imported, 2);
  assert.deepEqual(progress, ['importing', 'done']);
  body = '{"stage":"error","error":{"code":"upstream_failed","message":"CRM не ответила"}}\n';
  await assert.rejects(DA.api.syncSource({ onProgress() {} }), (e) => e.code === 'upstream_failed' && e.message === 'CRM не ответила');
});

test('an earlier evaluation read cannot overwrite a later saved appeal decision', async () => {
  const { DA, ev, cl } = fixtureServer();
  await DA.data.prepare('registry', { refresh: true });
  let release;
  DA.api.listEvaluations = () => new Promise((resolve) => { release = resolve; });
  const loading = DA.data.evaluation('fixture', { refresh: true });
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  const appeal = { id: 'ap_race', evaluationId: ev.id, conversationId: source.id, criterionId: cl.criteria[0].id, createdAt: 1, status: 'open' };
  DA.state.appeals = [appeal];
  DA.api.decideAppeal = async () => ({ appeal: { ...appeal, status: 'changed', decision: { action: 'change', newAnswer: 'no', reason: 'Проверено по реплике', decidedAt: '2026-11-01T12:00:00Z' } }, evaluation: { ...ev, total: 80 } });
  await DA.data.decideAppeal(appeal, 'change', 'no', 'Проверено по реплике');
  release({ items: [ev] });
  await loading;
  assert.equal(DA.state.evaluations.fixture.total, 80);
});

test('local running evaluation can be watched after navigation without any API request', async () => {
  let calls = 0;
  const { DA } = environment(async () => { calls++; throw new TypeError('unexpected network'); });
  let started;
  const start = new Promise((resolve) => { started = resolve; });
  const running = DA.data.evaluate('fixture', { onProgress: (ev) => started(ev.id) });
  const id = await start;
  const watched = await DA.data.watchEvaluation(id);
  await running;
  assert.equal(watched.status, 'done');
  assert.equal(calls, 0);
});

test('local interruption after reload is recoverable and retry only changes the failed criterion', async () => {
  const { DA } = environment();
  const ev = DA.state.evaluations.fixture;
  const unaffected = structuredClone(ev.items[1]);
  ev.status = 'running'; ev.items[0].status = 'pending'; ev.items[0].answer = null;
  DA.save(); DA.initState();
  assert.equal(DA.state.evaluations.fixture.status, 'failed');
  const retried = await DA.data.retryCriterion(ev.id, 'contact');
  assert.equal(retried.status, 'done');
  assert.deepEqual(json(retried.items[1]), json(unaffected));
});

test('deciding two local appeals on one evaluation preserves both decisions', async () => {
  const { DA } = environment();
  const contact = await DA.data.createAppeal('fixture', 'contact', 'Проверьте приветствие', 'no');
  const needs = await DA.data.createAppeal('fixture', 'needs', 'Проверьте уточнения', 'no');
  await DA.data.decideAppeal(contact, 'change', 'no', 'Приветствие отсутствует');
  assert.equal(DA.data.appealContext(needs).ev.total, 90);
  await DA.data.decideAppeal(needs, 'change', 'no', 'Уточнения отсутствуют');
  assert.equal(DA.state.evaluations.fixture.total, 75);
  assert.equal(DA.data.appealContext(contact).ev.items.find((item) => item.criterionId === 'needs').answer, 'no');
});

test('an older poll response keeps the stale flag discovered by a newer registry refresh', async () => {
  const { DA, context, ev } = fixtureServer();
  await DA.data.prepare('registry', { refresh: true });
  let release, first = true;
  DA.api.getEvaluation = () => first ? (first = false, new Promise((resolve) => { release = resolve; })) : Promise.resolve(ev);
  const watching = DA.data.watchEvaluation(ev.id);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  const savedFetch = context.fetch;
  context.fetch = (url, opts) => url === '/api/conversations' ? Promise.resolve(reply({ items: [{ ...source, lastEvaluation: { id: ev.id, status: 'stale' } }] })) : savedFetch(url, opts);
  await DA.data.prepare('registry', { refresh: true });
  assert.equal(DA.state.evaluations.fixture.stale, true);
  release(ev);
  await watching;
  assert.equal(DA.state.evaluations.fixture.stale, true);
});

test('confirming an appeal keeps its changed-transcript evaluation stale and preserves the historical card snapshot', async () => {
  const { DA, context, ev, cl } = fixtureServer();
  const old = { ...ev, transcriptHash: 'original' };
  const updatedSource = { ...source, transcriptHash: 'updated', transcript: [{ ...turn, text: 'Обновлённая реплика' }] };
  const savedFetch = context.fetch;
  context.fetch = (url, opts) => {
    if (url === '/api/conversations') return Promise.resolve(reply({ items: [{ ...updatedSource, lastEvaluation: { id: ev.id, status: 'stale' } }] }));
    if (url === '/api/conversations/fixture') return Promise.resolve(reply(updatedSource));
    if (url === '/api/conversations/fixture/evaluations') return Promise.resolve(reply({ items: [old] }));
    if (url === '/api/evaluations/' + ev.id) return Promise.resolve(reply(old));
    if (url === '/api/evaluations/' + ev.id + '/conversation') return Promise.resolve(reply(source));
    return savedFetch(url, opts);
  };
  await DA.data.prepare('card', { id: source.id, evaluationId: ev.id, refresh: true });
  const a = { id: 'ap_stale', evaluationId: ev.id, conversationId: source.id, criterionId: cl.criteria[0].id,
    evaluation: DA.data.normalizeEvaluation(old), conversation: DA.data.normalizeConversation(source), createdAt: 1, status: 'open' };
  DA.state.appeals = [a];
  DA.api.decideAppeal = async () => ({ appeal: { ...a, status: 'confirmed', decision: { action: 'confirm', reason: 'Реплика проверена', decidedAt: '2026-11-01T12:00:00Z' } }, evaluation: old });
  const result = await DA.data.decideAppeal(a, 'confirm', null, 'Реплика проверена');
  assert.equal(result.evaluation.stale, true);
  assert.equal(DA.state.evaluations.fixture.stale, true);
  assert.equal(DA.data.appealContext(a.id).ev.stale, true);
  const historical = DA.data.cardContext(source.id, ev.id);
  assert.equal(historical.ev.stale, true);
  assert.equal(historical.conv.transcript[0].text, 'Здравствуйте');
  assert.equal(DA.state.conversations.fixture.transcript[0].text, 'Обновлённая реплика');
  const latest = { ...old, id: 'ev_new', transcriptHash: 'updated', stale: false };
  DA.state.evaluations.fixture = latest;
  await DA.data.decideAppeal({ ...a, id: 'ap_other', criterionId: cl.criteria[1].id }, 'confirm', null, 'Вторая реплика проверена');
  assert.equal(DA.state.evaluations.fixture.id, 'ev_new');
  assert.equal(DA.state.evaluations.fixture.stale, false);
  assert.equal(DA.data.cardContext(source.id, ev.id).ev.stale, true);
});

test('invalidate followed by source refresh cannot be undone by an older poll response', async () => {
  const { DA, context, ev } = fixtureServer();
  await DA.data.prepare('registry', { refresh: true });
  const old = { ...ev, transcriptHash: 'original' };
  const latest = { ...ev, id: 'ev_after_sync', transcriptHash: 'updated', total: 75 };
  let release, first = true;
  DA.api.getEvaluation = () => first ? (first = false, new Promise((resolve) => { release = resolve; })) : Promise.resolve(latest);
  const watching = DA.data.watchEvaluation(ev.id);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  const updatedSource = { ...source, transcriptHash: 'updated', transcript: [{ ...turn, text: 'Новая версия реплики' }] };
  const savedFetch = context.fetch;
  context.fetch = (url, opts) => {
    if (url === '/api/conversations') return Promise.resolve(reply({ items: [{ ...updatedSource, lastEvaluation: { id: latest.id, status: 'done' } }] }));
    if (url === '/api/conversations/fixture') return Promise.resolve(reply(updatedSource));
    return savedFetch(url, opts);
  };
  DA.data.invalidate('conversations');
  await DA.data.refresh();
  release(old);
  const watched = await watching;
  assert.equal(watched.id, ev.id);
  assert.equal(watched.stale, true);
  assert.equal(DA.state.evaluations.fixture.id, latest.id);
  assert.equal(DA.state.evaluations.fixture.total, 75);
  assert.equal(DA.state.conversations.fixture.transcript[0].text, 'Новая версия реплики');
});

test('server batch sends one POST and returns its accepted identity before any polling request', async () => {
  const { DA, context, ev } = fixtureServer();
  let posts = 0, jobGets = 0, submitted;
  const savedFetch = context.fetch;
  context.fetch = (url, opts) => {
    if (url === '/api/evaluations') {
      posts++; submitted = JSON.parse(opts.body);
      return Promise.resolve(reply({ jobId: 'job_many', evaluationIds: { fixture: 'ev_many_1', extra: 'ev_many_2' } }, 202));
    }
    if (url === '/api/jobs/job_many') { jobGets++; return Promise.reject(new TypeError('offline')); }
    return savedFetch(url, opts);
  };
  const started = await DA.data.startBatch(['fixture', 'extra', 'fixture'], { checklistVersion: 1, reuse: true });
  assert.equal(posts, 1);
  assert.equal(jobGets, 0);
  assert.equal(started.jobId, 'job_many');
  assert.deepEqual(submitted.conversationIds, ['fixture', 'extra']);
  assert.equal(submitted.reuse, true);
  assert.equal(started.job.items[0].status, 'queued');
  await assert.rejects(DA.data.getJob(started.jobId), (e) => e.code === 'network');
  const done = { ...ev, id: 'ev_many_1', usage: { inputTokens: 0, outputTokens: 0, calls: 0, costUsd: 0 }, finishedAt: '2026-11-01T10:02:00Z' };
  const failed = { ...ev, id: 'ev_many_2', conversationId: 'extra', status: 'failed', total: null, finishedAt: '2026-11-01T10:02:02Z', items: [{ criterionId: 'contact', status: 'failed', explanation: 'Оценка этого обращения сейчас недоступна' }] };
  context.fetch = (url, opts) => {
    if (url === '/api/jobs/job_many') return Promise.resolve(reply({ id: 'job_many', status: 'failed', total: 2, done: 1, failed: 1, startedAt: '2026-11-01T10:02:00Z', usage: done.usage,
      items: [{ conversationId: 'fixture', evaluationId: done.id, status: 'done' }, { conversationId: 'extra', evaluationId: failed.id, status: 'failed' }] }));
    if (url === '/api/evaluations/' + done.id) return Promise.resolve(reply(done));
    if (url === '/api/evaluations/' + failed.id) return Promise.resolve(reply(failed));
    return savedFetch(url, opts);
  };
  const job = await DA.data.watchJob(started.jobId);
  assert.equal(job.done, 1); assert.equal(job.failed, 1);
  assert.equal(job.durationSec, 2);
  assert.equal(job.items[1].total, null);
  assert.equal(job.items[1].error, 'Оценка этого обращения сейчас недоступна');
  assert.equal(job.usage.calls, 0);
  assert.equal(DA.state.evaluations.fixture.id, done.id);
  assert.equal(posts, 1);
});

test('adopting an accepted import job needs no request and retains IDs when a followup read fails', async () => {
  const { DA, context } = fixtureServer();
  let requests = 0;
  context.fetch = async () => { requests++; throw new TypeError('offline'); };
  const accepted = { jobId: 'job_import', evaluationIds: { new_call: 'ev_import' }, checklistId: 'cl_3', checklistVersion: 3, reuse: false };
  const adopted = await DA.data.adoptBatch(accepted);
  assert.equal(requests, 0);
  assert.equal(adopted.job.checklistVersion, 3);
  assert.equal(DA.state.evaluations.new_call.id, 'ev_import');
  assert.equal(DA.state.jobs.job_import.items[0].evaluationId, 'ev_import');
  await assert.rejects(DA.data.getJob(accepted.jobId), (error) => error.code === 'network');
  const again = await DA.data.adoptBatch(accepted);
  assert.equal(requests, 1, 'adopting again never resubmits or reloads the accepted job');
  assert.equal(again.job.startedAt, adopted.job.startedAt);
  assert.deepEqual(json(again.evaluationIds), accepted.evaluationIds);
});

test('re-adopting an old job preserves its progress and a newer evaluation while tracking both jobs', async () => {
  const { DA, ev, cl } = fixtureServer();
  await DA.data.prepare('registry', { refresh: true });
  const accepted = { jobId: 'job_import_done', evaluationIds: { fixture: ev.id }, checklistId: cl.id, checklistVersion: cl.version, reuse: false };
  const adopted = await DA.data.adoptBatch(accepted);
  assert.equal(adopted.job.status, 'done');
  assert.equal(adopted.job.items[0].total, 93.75);
  assert.equal(adopted.job.durationSec, 1.25);
  let posts = 0;
  DA.api.startEvaluation = async () => { posts++; return { jobId: 'job_explicit_redo', evaluationIds: { fixture: 'ev_newer' } }; };
  const newer = await DA.data.startBatch(['fixture'], { reuse: false });
  const repeated = await DA.data.adoptBatch(accepted);
  assert.equal(posts, 1, 'only the explicit redo submits work');
  assert.equal(repeated.job.status, 'done');
  assert.equal(repeated.job.items[0].total, 93.75);
  assert.equal(DA.state.evaluations.fixture.id, newer.evaluationIds.fixture);
  assert.deepEqual(Object.keys(DA.state.jobs).sort(), ['job_explicit_redo', 'job_import_done']);
});

test('adopting a second job cannot discard the first job completion or submit extra work', async () => {
  const { DA, ev, cl } = fixtureServer();
  await DA.data.prepare('registry', { refresh: true });
  const done = { ...ev, id: 'ev_auto_first' };
  await DA.data.adoptBatch({ jobId: 'job_auto_first', evaluationIds: { new_call: done.id }, checklistId: cl.id, checklistVersion: cl.version });
  done.conversationId = 'new_call';
  let release, reads = 0, posts = 0;
  DA.api.startEvaluation = async () => { posts++; throw new Error('unexpected POST'); };
  DA.api.getJob = async () => {
    reads++;
    return { id: 'job_auto_first', status: 'done', total: 1, done: 1, failed: 0, startedAt: '2026-11-01T10:00:00Z',
      items: [{ conversationId: done.conversationId, evaluationId: done.id, status: 'done' }] };
  };
  DA.api.getEvaluation = () => release ? Promise.resolve(done) : new Promise((resolve) => { release = resolve; });
  const watching = DA.data.watchJob('job_auto_first');
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  await DA.data.adoptBatch({ jobId: 'job_auto_second', evaluationIds: { another_call: 'ev_auto_second' }, checklistId: cl.id, checklistVersion: cl.version });
  release(done);
  const completed = await watching;
  assert.equal(completed.status, 'done');
  assert.equal(DA.state.evaluations.new_call.status, 'done');
  assert.equal(DA.state.evaluations.new_call.total, 93.75);
  assert.equal(DA.state.jobs.job_auto_first.status, 'done');
  assert.equal(DA.state.jobs.job_auto_second.status, 'running');
  assert.equal(reads, 2, 'a changed revision re-reads the existing job before stopping its watcher');
  assert.equal(posts, 0);
});

test('local batch evaluates only known fixtures, reports unknown records and retries only failures', async () => {
  let requests = 0;
  const { DA } = environment(async () => { requests++; throw new TypeError('unexpected network'); });
  DA.upsertConversations([{ conversation_id: 'unknown', channel: source.channel, language: source.language, transcript: [turn], audio_url: null }]);
  const started = await DA.data.startBatch(['fixture', 'unknown'], { checklistVersion: 1 });
  const finished = await DA.data.watchJob(started.jobId);
  assert.equal(finished.done, 1);
  assert.equal(finished.failed, 1);
  assert.equal(finished.status, 'failed');
  assert.equal(finished.items.find((item) => item.conversationId === 'fixture').total, 100);
  assert.equal(finished.items.find((item) => item.conversationId === 'unknown').error, 'Оценка этого обращения сейчас недоступна');
  const completedId = DA.state.evaluations.fixture.id;
  const retried = await DA.data.retryBatch(started.jobId);
  assert.deepEqual(Object.keys(retried.evaluationIds), ['unknown']);
  const final = await DA.data.watchJob(retried.jobId);
  assert.equal(final.failed, 1);
  assert.equal(DA.state.evaluations.fixture.id, completedId);
  assert.equal(requests, 0);
});

test('local weight-only batch reuses model answers rather than reviewer overrides', async () => {
  const { DA } = environment();
  const appeal = await DA.data.createAppeal('fixture', 'contact', 'Проверьте приветствие', 'no');
  await DA.data.decideAppeal(appeal, 'change', 'no', 'Приветствие отсутствует');
  const draft = structuredClone(DA.activeChecklist());
  draft.criteria.find((c) => c.id === 'contact').weight = 20;
  const saved = await DA.data.saveChecklist(draft);
  const diff = await DA.data.diffChecklists(saved.version, 1);
  assert.deepEqual(json(diff.changed), [{ criterionId: 'contact', fields: ['weight'] }]);
  const started = await DA.data.startBatch(['fixture'], { checklistVersion: saved.version, reuse: true });
  const job = await DA.data.watchJob(started.jobId);
  const ev = job.items[0].evaluation;
  assert.equal(ev.status, 'done');
  assert.ok(ev.items.every((item) => item.reused));
  assert.equal(ev.items.find((item) => item.criterionId === 'contact').answer, 'yes');
  assert.equal(ev.items.find((item) => item.criterionId === 'contact').original, null);
  assert.equal(job.usage.calls, 0);
});

test('local batch resumes the same evaluation after reload and keeps already completed criteria', async () => {
  const first = environment();
  const ev = structuredClone(first.DA.state.evaluations.fixture);
  ev.id = 'ev_resumable'; ev.status = 'running'; ev.startedAt = new Date().toISOString(); ev.total = null;
  ev.items[0].explanation = 'Сохранённый ответ до перезагрузки';
  ev.items.slice(1).forEach((item) => { item.status = 'pending'; item.answer = null; });
  first.DA.state.evaluations.fixture = ev;
  first.DA.state.evaluationHistory[ev.id] = ev;
  first.DA.state.jobs.job_resumable = { id: 'job_resumable', status: 'running', total: 1, done: 0, failed: 0,
    startedAt: ev.startedAt, checklistVersion: 1, reuse: false, items: [{ conversationId: 'fixture', evaluationId: ev.id, status: 'running' }] };
  first.DA.save();
  const restored = environment(undefined, first.storage.get('da.proto.v2'));
  const job = await restored.DA.data.watchJob('job_resumable');
  assert.equal(job.status, 'done');
  assert.equal(job.items[0].evaluationId, ev.id);
  assert.equal(job.items[0].evaluation.items[0].explanation, 'Сохранённый ответ до перезагрузки');
  assert.ok(job.items[0].evaluation.items.every((item) => item.status === 'done'));
});

test('local compare uses completed current-transcript union, keeps zero scores and includes removed answers', async () => {
  const { DA } = environment();
  for (const cid of ['before-only', 'after-only', 'never-evaluated']) DA.upsertConversations([{ conversation_id: cid, channel: source.channel, language: source.language, transcript: [turn], audio_url: null }]);
  const original = structuredClone(DA.state.evaluations.fixture);
  const draft = structuredClone(DA.activeChecklist());
  draft.criteria = draft.criteria.filter((c) => c.id !== 'closing');
  const saved = await DA.data.saveChecklist(draft);
  await DA.data.evaluate('fixture', { checklistVersion: saved.version, reuse: true });
  DA.state.evaluationHistory.ev_before_only = { ...structuredClone(original), id: 'ev_before_only', conversationId: 'before-only', total: 0 };
  DA.state.evaluationHistory.ev_after_only = { ...structuredClone(original), id: 'ev_after_only', conversationId: 'after-only', checklistVersion: saved.version, total: 0 };
  DA.state.evaluationHistory.ev_later_failure = { ...structuredClone(original), id: 'ev_later_failure', checklistVersion: saved.version, status: 'failed', total: null };
  const compared = await DA.data.compareChecklists(saved.version, 1);
  assert.equal(compared.items.length, 3);
  assert.equal(compared.items.find((item) => item.conversationId === 'before-only').before, 0);
  assert.equal(compared.items.find((item) => item.conversationId === 'before-only').after, null);
  assert.equal(compared.items.find((item) => item.conversationId === 'after-only').before, null);
  assert.equal(compared.items.find((item) => item.conversationId === 'after-only').after, 0);
  assert.deepEqual(json(compared.items.find((item) => item.conversationId === 'fixture').changed), [{ criterionId: 'closing', before: 'yes', after: null }]);
  assert.equal(compared.summary.avgDelta, 0);
  DA.state.conversations.fixture.transcript = [{ ...turn, text: 'Изменённый разговор' }];
  const current = await DA.data.compareChecklists(saved.version, 1);
  assert.equal(current.items.length, 2);
  assert.equal(current.summary.avgDelta, null);
});

test('aborting a batch watcher leaves the local job running and allows reconnecting', async () => {
  const { DA } = environment();
  const started = await DA.data.startBatch(['fixture']);
  const controller = new AbortController();
  await assert.rejects(DA.data.watchJob(started.jobId, { signal: controller.signal, onProgress: () => controller.abort() }), (e) => e.name === 'AbortError');
  const finished = await DA.data.watchJob(started.jobId);
  assert.equal(finished.status, 'done');
  assert.equal(finished.items[0].evaluationId, started.evaluationIds.fixture);
});

test('an older batch read cannot regress a completed card watcher for the same evaluation', async () => {
  const { DA, ev } = fixtureServer();
  await DA.data.prepare('registry', { refresh: true });
  const running = { ...ev, status: 'running', total: null, finishedAt: null };
  DA.state.evaluations.fixture = DA.data.normalizeEvaluation(running);
  let release, first = true;
  DA.api.getJob = async () => ({ id: 'job_race', status: 'running', total: 1, done: 0, failed: 0,
    startedAt: '2026-11-01T10:00:00Z', items: [{ conversationId: 'fixture', evaluationId: ev.id, status: 'running' }] });
  DA.api.getEvaluation = () => first ? (first = false, new Promise((resolve) => { release = resolve; })) : Promise.resolve(ev);
  const loading = DA.data.getJob('job_race');
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  await DA.data.watchEvaluation(ev.id);
  release(running);
  await loading;
  assert.equal(DA.state.evaluations.fixture.status, 'done');
  assert.equal(DA.state.evaluations.fixture.total, 93.75);
  DA.api.retryCriterion = async () => running;
  DA.api.getEvaluation = async () => { assert.equal(DA.state.evaluations.fixture.status, 'running'); return ev; };
  const retried = await DA.data.retryCriterion(ev.id, 'contact');
  assert.equal(retried.status, 'done');
  assert.equal(DA.state.evaluations.fixture.total, 93.75);
});

test('a multi-item job keeps newer card progress while another evaluation read is pending', async () => {
  const { DA, ev } = fixtureServer();
  await DA.data.prepare('registry', { refresh: true });
  const running = { ...ev, status: 'running', total: null, finishedAt: null };
  const other = { ...running, id: 'ev_other', conversationId: 'other' };
  DA.state.evaluations.fixture = DA.data.normalizeEvaluation(running);
  let release, first = true;
  DA.api.getJob = async () => ({ id: 'job_race_many', status: 'running', total: 2, done: 0, failed: 0,
    startedAt: '2026-11-01T10:00:00Z', items: [
      { conversationId: 'fixture', evaluationId: ev.id, status: 'running' },
      { conversationId: 'other', evaluationId: other.id, status: 'running' }
    ] });
  DA.api.getEvaluation = async (id) => id === other.id ? new Promise((resolve) => { release = resolve; })
    : first ? (first = false, running) : ev;
  const loading = DA.data.getJob('job_race_many');
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  await DA.data.watchEvaluation(ev.id);
  release(other);
  const job = await loading;
  assert.equal(DA.state.evaluations.fixture.status, 'done');
  assert.equal(DA.state.evaluations.fixture.total, 93.75);
  assert.equal(job.items[0].evaluation.status, 'done');
});
