const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const web = path.join(__dirname, '..');

function environment() {
  const storage = new Map();
  const context = { console, structuredClone, Intl, URLSearchParams, AbortController, DOMException,
    setTimeout, clearTimeout, document: { documentElement: { lang: 'ru' } },
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    location: {}, addEventListener() {}, dispatchEvent() {} };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(web, 'tests/fixtures/checklist.js'), 'utf8'), context);
  for (const file of ['i18n.js', 'core.js']) vm.runInContext(fs.readFileSync(path.join(web, 'js', file), 'utf8'), context);
  const DA = context.DA;
  DA.views = {};
  vm.runInContext(fs.readFileSync(path.join(web, 'js/accuracy.js'), 'utf8'), context);
  const cl = structuredClone(context.DA_CHECKLIST);
  const changed = { ...structuredClone(cl), id: 'cl_3', version: 3, isActive: true };
  changed.criteria = changed.criteria.filter((c) => c.id !== 'contact');
  cl.isActive = false;
  DA.state.checklists = [cl, changed];
  DA.state.conversations = { a: { conversation_id: 'a', transcriptHash: 'current', transcript: [] }, b: { conversation_id: 'b', transcriptHash: 'current', transcript: [] } };
  DA.state.numbers = { a: 1, b: 2 };
  return { DA, cl, context };
}

function evaluation(cl, changes = {}) {
  const ev = { id: 'real-v1', conversationId: 'a', checklistVersion: 1, model: 'provider/model', status: 'done', transcriptHash: 'current', total: 100,
    finishedAt: '2026-11-07T10:00:00Z', items: cl.criteria.map((c) => ({ criterionId: c.id, status: 'done',
      answer: c.type === 'scale' ? Math.max(...c.scale.map((s) => s.value)) : c.type === 'flag' ? 'no' : 'yes' })) };
  return Object.assign(ev, changes);
}
const gold = (rows) => ({ rows: rows.map(([conversationId, criterionId, answer]) => ({ conversationId, criterionId, answer })) });
const fullGold = (ev) => gold(ev.items.map((item) => [ev.conversationId, item.criterionId, item.original?.answer ?? item.answer]));

test('CSV validates canonical v1 even when active/latest v3 removed its criterion', () => {
  const { DA } = environment();
  DA.state.evaluations.a = { checklistVersion: 3 };
  const labels = DA.accuracy.readGold('conversation_id,criterion_id,answer\na,contact,yes\n', 'human.csv');
  assert.equal(labels.checklistVersion, 1);
  assert.equal(labels.rows.length, 1);
  assert.equal(labels.rows[0].criterionId, 'contact');
  assert.throws(() => DA.accuracy.readGold('conversation_id,criterion_id,answer\na,contact,10', 'bad.csv'), /не подходит/);
});

test('blank CSV template requires an explicit human answer and contains no preset row', () => {
  const { DA } = environment();
  assert.throws(() => DA.accuracy.readGold('conversation_id,criterion_id,answer,note\n', 'human-labels-template.csv'), /нет ответов/);
});

test('duplicate gold pairs and malformed quoted CSV are rejected before they can weight metrics', () => {
  const { DA, cl } = environment();
  for (const second of ['yes', 'no']) assert.throws(() => DA.accuracy.readGold(`conversation_id,criterion_id,answer\na,contact,yes\na,contact,${second}`, 'duplicate.csv'), /больше одного раза/);
  assert.throws(() => DA.accuracy.readGold('conversation_id,criterion_id,answer,note\na,contact,yes,"broken', 'broken.csv'), /кавычки/);
  assert.throws(() => DA.accuracy.compare(gold([['a', 'contact', 'yes'], ['a', 'contact', 'yes']]), [evaluation(cl)]), /больше одного раза/);
});

test('partial labels count only labeled answers and never invent a full gold score', () => {
  const { DA, cl } = environment();
  const ev = evaluation(cl);
  const result = DA.accuracy.compare(gold([['a', 'contact', 'no']]), [ev]);
  assert.equal(result.pairs.length, 1);
  assert.equal(result.match, 0);
  assert.equal(result.partialCount, 1);
  assert.equal(result.totalCount, 0);
  assert.equal(result.meanDiff, null);
});

test('only fully human-labeled conversations enter MAE and original model answers survive appeals', () => {
  const { DA, cl } = environment();
  const ev = evaluation(cl);
  const contact = ev.items.find((i) => i.criterionId === 'contact');
  contact.original = { answer: 'no' }; contact.answer = 'yes';
  const labels = fullGold(ev);
  labels.rows.find((r) => r.criterionId === 'contact').answer = 'yes';
  labels.rows.push({ conversationId: 'b', criterionId: 'contact', answer: 'yes' });
  const result = DA.accuracy.compare(labels, [ev, evaluation(cl, { id: 'other', conversationId: 'b' })]);
  assert.equal(result.pairs.length, 9);
  assert.equal(result.match, 8);
  assert.equal(result.totalCount, 1);
  assert.equal(result.partialCount, 1);
  assert.equal(result.meanDiff, 10);
  assert.equal(result.misses[0].model, 'no');
  assert.equal(result.misses[0].ev.id, 'real-v1');
});

test('comparison excludes non-v1, stale, failed and fake results and selects newest valid v1', () => {
  const { DA, cl } = environment();
  const old = evaluation(cl, { id: 'old', finishedAt: '2026-11-06T10:00:00Z' });
  old.items.find((i) => i.criterionId === 'contact').answer = 'no';
  const current = evaluation(cl);
  DA.state.evaluations.a = evaluation(cl, { id: 'unrelated-v3', checklistVersion: 3 });
  const labels = gold([['a', 'contact', 'yes']]);
  const invalid = [evaluation(cl, { checklistVersion: 3 }), evaluation(cl, { stale: true }), evaluation(cl, { transcriptHash: 'old' }), evaluation(cl, { status: 'failed' }), evaluation(cl, { model: 'fake' }), evaluation(cl, { model: 'provider/model, fake' }), evaluation(cl, { model: null })];
  assert.equal(DA.accuracy.compare(labels, invalid).noEval, 1);
  const result = DA.accuracy.compare(labels, [old, current, ...invalid]);
  assert.equal(result.match, 1);
  assert.equal(result.pairs[0].ev.id, current.id);
  const mixed = evaluation(cl);
  mixed.items.find((i) => i.criterionId === 'contact').model = 'fake';
  assert.equal(DA.accuracy.compare(labels, [mixed]).noEval, 1);
});

test('contextual contact NA is accepted only with the server conversation flag', () => {
  const { DA, cl } = environment();
  const csv = 'conversation_id,criterion_id,answer\na,contact,na';
  assert.throws(() => DA.accuracy.readGold(csv, 'labels.csv'), /не подходит/);
  DA.state.conversations.a.contextualNaCriteria = ['contact'];
  assert.throws(() => DA.accuracy.readGold(csv, 'labels.csv'), /не подходит/);
  const contact = cl.criteria.find((c) => c.id === 'contact');
  contact.contentHash = 'canonical-contact';
  DA.state.conversations.a.contextualNaCriterionHashes = { contact: 'canonical-contact' };
  const labels = DA.accuracy.readGold(csv, 'labels.csv');
  const ev = evaluation(cl);
  ev.items.find((i) => i.criterionId === 'contact').answer = 'na';
  assert.equal(DA.accuracy.compare(labels, [ev]).match, 1);
  assert.equal(cl.criteria.find((c) => c.id === 'contact').naAllowed, false);
  contact.contentHash = 'edited-contact';
  assert.throws(() => DA.accuracy.readGold(csv, 'labels.csv'), /не подходит/);
});

test('a newer incomplete or fake attempt does not fall back to an older completed model score', () => {
  const { DA, cl } = environment();
  const older = evaluation(cl);
  const labels = gold([['a', 'contact', 'yes']]);
  for (const changes of [{ status: 'failed' }, { status: 'running', finishedAt: null, startedAt: '2026-11-07T11:00:00Z' }, { model: 'fake' }]) {
    const latest = evaluation(cl, { id: 'new-attempt', finishedAt: '2026-11-07T11:00:00Z', ...changes });
    assert.equal(DA.accuracy.compare(labels, [older, latest]).pairs.length, 0);
    assert.equal(DA.accuracy.compare(labels, [latest, older]).noEval, 1);
  }
});

test('scale zero, N/A and absent model answers remain distinct', () => {
  const { DA, cl } = environment();
  const labels = DA.accuracy.readGold('conversation_id;criterion_id;answer\na;consultation;0\na;needs;na\nb;closing;no', 'partial.csv');
  const ev = evaluation(cl);
  ev.items.find((i) => i.criterionId === 'consultation').answer = 0;
  ev.items.find((i) => i.criterionId === 'needs').answer = 'na';
  const result = DA.accuracy.compare(labels, [ev]);
  assert.equal(result.match, 2);
  assert.equal(result.pairs.length, 2);
  assert.equal(result.noEval, 1);
  assert.equal(result.meanDiff, null);
});
