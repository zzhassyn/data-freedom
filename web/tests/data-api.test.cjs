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

function environment(fetcher) {
  const storage = new Map(), events = new EventTarget();
  const context = { console, fetch: fetcher || (() => Promise.resolve(reply({ ok: false }))),
    URL, URLSearchParams, AbortController, DOMException, TextDecoder, structuredClone, Intl,
    setTimeout: (fn, ms) => setTimeout(fn, [450, 700].includes(ms) ? 0 : ms), clearTimeout,
    CustomEvent: class extends Event { constructor(type, opts) { super(type); this.detail = opts?.detail; } },
    dispatchEvent: events.dispatchEvent.bind(events), addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    location: { reload() {} } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(web, 'data/checklist.js'), 'utf8'), context);
  context.DA_DEV = { records: [{ conversation_id: 'fixture', channel: source.channel, language: source.language, transcript: [turn], audio_url: null }] };
  context.DA_MOCK_ANSWERS = { fixture: Object.fromEntries(context.DA_CHECKLIST.criteria.map((c) => [c.id, { answer: c.type === 'scale' ? Math.max(...c.scale.map((s) => s.value)) : c.type === 'flag' ? 'no' : 'yes', explanation: 'Проверено', evidence: [] }])) };
  context.DA_MOCK_APPEALS = [];
  for (const file of ['api.js', 'core.js']) vm.runInContext(fs.readFileSync(path.join(web, 'js', file), 'utf8'), context);
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
