const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: { DA: { views: {}, i18n: { addMessages() {} },
  t: (key) => key, msg: (key) => key } } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/checklist-view.js'), 'utf8'), context);
const DA = context.window.DA;
const copy = (value) => JSON.parse(JSON.stringify(value));
const compare = (after, before) => copy(DA.checklistComparison(after, before));
const criterion = (extra = {}) => ({ id: 'contact', sectionId: 'start', order: 0, title: 'Контакт',
  description: 'Поприветствовать клиента.', type: 'binary', weight: 10,
  naAllowed: false, naCondition: null, scale: null, flagTypes: null, ...extra });
const checklist = (extra = {}) => ({ id: 'cl_1', version: 1, name: 'Качество поддержки',
  sections: [{ id: 'start', title: 'Начало', order: 0 }, { id: 'end', title: 'Завершение', order: 1 }],
  criteria: [criterion(), criterion({ id: 'closing', title: 'Прощание', sectionId: 'end', order: 1, weight: 5 })], ...extra });

test('same version has no changes or new evaluation requirements', () => {
  const source = checklist();
  const result = compare(source, source);
  assert.equal(result.hasChanges, false);
  assert.equal(result.needsEvaluation, 0);
  assert.equal(result.counts.unchanged, 2);
  assert.deepEqual(result.sections, []);
});

test('one criterion with multiple changed fields is counted once as a rule change', () => {
  const source = checklist(), target = copy(source);
  Object.assign(target.criteria[0], { title: 'Приветствие', description: 'Поздороваться и представиться.', weight: 25, order: 4, sectionId: 'end' });
  const result = compare(target, source);
  assert.equal(result.counts.rule, 1);
  assert.equal(result.counts.weight, 0);
  assert.equal(result.counts.layout, 0);
  assert.equal(result.needsEvaluation, 1);
  assert.deepEqual(result.criteria.find((c) => c.criterionId === 'contact').fields, ['title', 'description', 'weight', 'sectionId', 'order']);
});

test('criterion rename requires new judging, matching the server contentHash contract', () => {
  const source = checklist(), target = copy(source);
  target.criteria[0].title = 'Начало разговора';
  const row = compare(target, source).criteria[0];
  assert.equal(row.kind, 'rule');
  assert.equal(row.needsEvaluation, true);
});

test('weight plus placement changes preserve criterion content', () => {
  const source = checklist(), target = copy(source);
  Object.assign(target.criteria[0], { weight: 30, sectionId: 'end', order: 2 });
  const result = compare(target, source);
  assert.equal(result.counts.weight, 1);
  assert.equal(result.needsEvaluation, 0);
  assert.equal(result.criteria.find((row) => row.criterionId === 'contact').kind, 'weight');
});

test('layout-only changes do not require new judging', () => {
  const source = checklist(), target = copy(source);
  Object.assign(target.criteria[0], { sectionId: 'end', order: 2 });
  const result = compare(target, source);
  assert.equal(result.counts.layout, 1);
  assert.equal(result.needsEvaluation, 0);
});

test('checklist and section names remain visible without changing criterion rules', () => {
  const source = checklist(), target = copy(source);
  target.name = 'Новый чек-лист';
  target.sections[0].title = 'Начало общения';
  target.sections[0].order = 2;
  const result = compare(target, source);
  assert.equal(result.nameChanged, true);
  assert.equal(result.hasChanges, true);
  assert.equal(result.counts.unchanged, 2);
  assert.equal(result.needsEvaluation, 0);
  assert.deepEqual(result.sections[0].fields, ['title', 'order']);
});

test('replacing an ID is added plus removed even when the text is identical', () => {
  const source = checklist(), target = copy(source);
  target.criteria[0].id = 'new_contact';
  const result = compare(target, source);
  assert.equal(result.counts.added, 1);
  assert.equal(result.counts.removed, 1);
  assert.equal(result.needsEvaluation, 1);
  assert.equal(result.criteria.at(-1).criterionId, 'contact');
  assert.equal(result.criteria.at(-1).after, null);
});

test('reversing direction reverses additions/removals and keeps before/after values', () => {
  const source = checklist(), target = copy(source);
  target.criteria.push(criterion({ id: 'clarity', title: 'Ясность', order: 2 }));
  target.criteria[0].weight = 20;
  const forward = compare(target, source), reverse = compare(source, target);
  assert.equal(forward.counts.added, 1);
  assert.equal(reverse.counts.removed, 1);
  assert.equal(reverse.criteria[0].before.weight, 20);
  assert.equal(reverse.criteria[0].after.weight, 10);
  assert.equal(reverse.needsEvaluation, 0);
});

test('type, applicability, scale text and violation identities are semantic fields', () => {
  const cases = [
    { type: 'scale', scale: [{ value: 10, description: 'Полностью' }, { value: 0, description: 'Нет' }] },
    { naAllowed: true, naCondition: 'Общая консультация' },
    { naCondition: 'Уточнённое условие' },
    { type: 'flag', weight: 0, flagTypes: [{ id: 'insult', title: 'Оскорбление' }] }
  ];
  for (const patch of cases) {
    const source = checklist(), target = copy(source);
    Object.assign(target.criteria[0], patch);
    assert.equal(compare(target, source).needsEvaluation, 1);
  }
});

test('field object key order is irrelevant but flag/scale list order is preserved', () => {
  const source = checklist({ criteria: [criterion({ type: 'scale', scale: [{ value: 10, description: 'Да' }, { value: 0, description: 'Нет' }] })] });
  const target = copy(source);
  target.criteria[0].scale = [{ description: 'Да', value: 10 }, { description: 'Нет', value: 0 }];
  assert.equal(compare(target, source).hasChanges, false);
  target.criteria[0].scale.reverse();
  assert.equal(compare(target, source).needsEvaluation, 1);
});

test('section additions/removals are visible even without a retained criterion move', () => {
  const source = checklist(), target = copy(source);
  target.sections = [source.sections[0], { id: 'extra', title: 'Дополнительно', order: 2 }];
  target.criteria = [target.criteria[0]];
  const result = compare(target, source);
  assert.equal(result.sections.length, 2);
  assert.equal(result.sections.find((s) => s.id === 'extra').before, null);
  assert.equal(result.sections.find((s) => s.id === 'end').after, null);
});

test('recreated violation identities remain distinguishable when their titles are the same', () => {
  const source = checklist({ criteria: [criterion({ type: 'flag', weight: 0, flagTypes: [{ id: 'old', title: 'Нарушение' }] })] });
  const target = copy(source);
  target.criteria[0].flagTypes[0].id = 'new';
  const row = compare(target, source).criteria[0];
  assert.equal(row.needsEvaluation, true);
  assert.deepEqual(row.flagChanges, { added: ['new'], removed: ['old'], reordered: false });
});

test('reordered violation identities are distinct from newly created types', () => {
  const source = checklist({ criteria: [criterion({ type: 'flag', weight: 0, flagTypes: [{ id: 'a', title: 'А' }, { id: 'b', title: 'Б' }] })] });
  const target = copy(source);
  target.criteria[0].flagTypes.reverse();
  const row = compare(target, source).criteria[0];
  assert.equal(row.needsEvaluation, true);
  assert.deepEqual(row.flagChanges, { added: [], removed: [], reordered: true });
});

test('comparison does not mutate stored versions or reuse their ordering arrays', () => {
  const source = checklist(), target = copy(source);
  target.criteria.reverse();
  const snapshots = [JSON.stringify(source), JSON.stringify(target)];
  compare(target, source);
  assert.deepEqual([JSON.stringify(source), JSON.stringify(target)], snapshots);
  assert.equal(DA.checklistCompareHref(1, 3), '#/checklists?compare=1&from=1&to=3');
});
