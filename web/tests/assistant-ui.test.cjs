const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const validReply = (answer = 'Подтверждённый ответ') => ({ answer, citations: [], sources: [], actions: [] });
const savedChats = e => [...e.store.entries()].filter(([key]) => key.startsWith('da.assistant.history.v1.')).map(([, value]) => JSON.parse(value));

function environment(savedStorage, prepareState, options = {}) {
  let document;
  class Node extends EventTarget {
    constructor(tag, text) { super(); this.tagName = tag; this._text = text || ''; this.childNodes = []; this.attrs = {}; this.hidden = false; this.value = ''; this.disabled = false; this.scrollTop = 0; this.scrollHeight = 100; this.clientHeight = 100; }
    append(...nodes) { for (const node of nodes.flat(Infinity)) if (node != null && node !== false) { const child = node instanceof Node ? node : new Node('#text', String(node)); child.parent = this; this.childNodes.push(child); } }
    replaceChildren(...nodes) { this.childNodes.forEach(node => { node.parent = null; }); this.childNodes = []; this._text = ''; this.append(...nodes); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get textContent() { return this._text + this.childNodes.map(node => node.textContent).join(''); }
    setAttribute(key, value) { this.attrs[key] = String(value); if (key === 'class') this.className = String(value); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    get classList() { const node = this; return { toggle(name, force) { const set = new Set((node.className || '').split(' ').filter(Boolean)); const on = force == null ? !set.has(name) : force; if (on) set.add(name); else set.delete(name); node.className = [...set].join(' '); }, remove(name) { this.toggle(name, false); }, contains(name) { return (node.className || '').split(' ').includes(name); } }; }
    matches(selector) { return selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : this.tagName === selector; }
    querySelectorAll(selector) { return this.childNodes.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    contains(node) { return node === this || this.childNodes.some(child => child.contains(node)); }
    get isConnected() { return document.body.contains(this); }
    focus() { document.activeElement = this; }
    remove() { if (this.parent) this.parent.childNodes = this.parent.childNodes.filter(node => node !== this); this.parent = null; }
  }
  document = { body: new Node('body'), activeElement: null, createTextNode: value => new Node('#text', value) };
  const store = savedStorage || new Map(), tabStore = options.tabStore || new Map(), requests = [], events = new EventTarget(), catalog = {};
  const failures = { local: false, session: false }, writes = { local: 0, session: 0 };
  const storageAdapter = (map, kind) => ({ get length() { return map.size; }, key: index => [...map.keys()][index] || null,
    getItem: key => map.get(key) || null, removeItem: key => { if (failures[kind]) throw new Error('Storage unavailable'); map.delete(key); },
    setItem: (key, value) => { if (failures[kind]) throw new Error('QuotaExceededError'); writes[kind]++; map.set(key, value); } });
  let language = 'ru';
  const translate = (key, params) => {
    let value = catalog[key]?.[language] ?? key;
    const args = typeof params === 'function' ? params() : params || {};
    if (value && typeof value === 'object') value = value[new Intl.PluralRules(language).select(args.count)] || value.other;
    return typeof value === 'function' ? value(args) : String(value).replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '');
  };
  const DA = {
    state: { role: 'analyst', conversations: { a: { transcriptHash: 'ha' } }, evaluations: {}, appeals: [], checklists: [{ id: 'c1', version: 1 }, { id: 'c2', version: 2, isActive: true }], numbers: { a: 1, b: 2 } },
    h(tag, attrs, ...children) { const node = new Node(tag); for (const [key, value] of Object.entries(attrs || {})) { if (key.startsWith('on') || ['hidden', 'disabled', 'value'].includes(key)) node[key] = value; else node.setAttribute(key, value); } node.append(...children); return node; },
    msg: (key, params) => typeof key === 'function' ? key() : translate(key, params), t: translate,
    i18n: { addMessages: entries => Object.assign(catalog, entries), release() {}, text: value => document.createTextNode(value), bindText: (node, value) => { node.textContent = value; }, bindAttr: (node, name, value) => node.setAttribute(name, value), languageCode: () => ({ ru: 'RU', kk: 'KZ', en: 'EN' })[language] },
    icon: () => new Node('svg'), convNumber: id => DA.state.numbers[id] || id, langLabel: { RU: 'Русский' }, channelLabel: () => 'Чат',
    setRole(value) { DA.state.role = value; DA.syncAssistantRole?.(); },
    apiErrorMessage: error => error.message,
    ApiError: class extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } },
    api: { askWorkspaceAssistant(body, options) { return new Promise((resolve, reject) => requests.push({ body: plain(body), options, resolve, reject })); } }
  };
  const context = { DA, document, console, URLSearchParams, AbortController, setTimeout, clearTimeout,
    navigator: { clipboard: { writeText: async () => {} } }, location: { hash: '#/' },
    localStorage: storageAdapter(store, 'local'), sessionStorage: storageAdapter(tabStore, 'session'),
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  context.window = context; vm.createContext(context);
  for (const file of ['filters.js', 'assistant.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
  prepareState?.(DA.state);
  const ui = DA.initAssistant();
  const get = selector => document.body.querySelector(selector);
  const submit = message => { const input = get('textarea'); input.value = message; input.oninput(); get('form').onsubmit({ preventDefault() {} }); };
  const click = selector => get(selector).onclick({ preventDefault() {}, stopPropagation() {} });
  const bind = (id = 'a', evaluation = { id: 'ev-a', transcriptHash: 'ha', status: 'done', total: 80, items: [] }) => {
    context.location.hash = '#/c/' + encodeURIComponent(id);
    return DA.conversationAssistant({ conversation: { conversation_id: id, transcriptHash: id === 'a' ? 'ha' : 'hb', language: 'RU' }, evaluation, onCitation: turn => { env.jumped = turn; } });
  };
  const env = { DA, ui, context, document, store, tabStore, failures, writes, requests, get, submit, click, bind,
    advance(index, step) { try { requests[index].options.onProgress(step); } catch (error) { requests[index].reject(error); } },
    language(value) { language = value; events.dispatchEvent(new Event('da:locale-changed')); }, change(name) { events.dispatchEvent(new Event(name)); } };
  return env;
}


test('page filters are optional focus, never a scope fence or visible context switch', () => {
  const e = environment();
  e.DA.setAssistantScope({ filters: { conversationIds: [], appealStatus: ['none'], scoreFrom: 0 }, count: 0, label: 'Не показывать' });
  e.ui.open(); e.submit('Найди все обращения');
  assert.deepEqual(e.requests[0].body.focus.filters, { appealStatus: ['none'], conversationIds: [], scoreFrom: 0 });
  assert.equal(Object.hasOwn(e.requests[0].body, 'scope'), false);
  assert.equal(Object.hasOwn(e.requests[0].body, 'context'), false);
  assert.equal(e.get('.da-assistant-context'), null);
  assert.equal(e.get('.da-assistant-context-tabs'), null);
  assert.doesNotMatch(e.get('.da-assistant-panel').textContent, /Не показывать/);
  e.ui.dispose();
});

test('real answer deltas display incrementally and only the validated final answer is committed', async () => {
  const e = environment(); e.ui.open(); e.submit('Что нужно проверить?');
  e.advance(0, { type: 'progress', stage: 'searching' });
  assert.match(e.get('.da-assistant-thinking').textContent, /Ищу обращения/);
  e.advance(0, { type: 'answer_delta', text: 'Сначала ' });
  assert.equal(e.get('.da-assistant-stream').textContent, 'Сначала ');
  e.advance(0, { type: 'answer_delta', text: 'посмотрите оценки.' });
  assert.equal(e.get('.da-assistant-stream').textContent, 'Сначала посмотрите оценки.');
  const stored = { sessions: savedChats(e) };
  assert.deepEqual(stored.sessions[0].history, []);
  e.advance(0, { type: 'progress', stage: 'checking' });
  assert.match(e.get('.da-assistant-thinking').textContent, /Проверяю источники/);
  e.requests[0].resolve(validReply('Проверенный окончательный ответ')); await tick();
  assert.equal(e.get('.da-assistant-stream'), null);
  assert.match(e.get('.da-assistant-prose').textContent, /Проверенный окончательный ответ/);
  assert.equal(savedChats(e)[0].history.length, 2);
  e.ui.dispose();
});

test('stop removes unfinished preview, restores question and ignores late chunks and completion', async () => {
  const e = environment(); e.ui.open(); e.submit('Первый вопрос');
  e.advance(0, { type: 'answer_delta', text: 'Незавершённый ответ' });
  e.click('.da-assistant-stop');
  assert.equal(e.requests[0].options.signal.aborted, true);
  assert.equal(e.get('textarea').value, 'Первый вопрос');
  e.advance(0, { type: 'answer_delta', text: 'Позднее продолжение' });
  e.requests[0].resolve(validReply('Не должен появиться')); await tick();
  assert.equal(e.get('.da-assistant-messages').textContent, '');
  assert.equal(e.get('textarea').disabled, false);
  assert.match(e.get('.da-assistant-notice').textContent, /Ответ остановлен/);
  e.ui.dispose();
});

test('navigation preserves an active answer and sending focus; old card disposal cannot detach the new card', async () => {
  const e = environment(), old = e.bind(); e.ui.open(); e.submit('Вопрос A');
  e.advance(0, { type: 'answer_delta', text: 'Ответ по A' });
  const current = e.bind('b', { id: 'ev-b', transcriptHash: 'hb', status: 'done', total: 90, items: [] });
  old.dispose();
  assert.equal(e.requests[0].options.signal.aborted, false);
  assert.equal(e.requests[0].body.focus.conversation.conversationId, 'a');
  assert.equal(e.get('.da-assistant-stream').textContent, 'Ответ по A');
  e.requests[0].resolve(validReply('Завершённый ответ A')); await tick();
  e.submit('А что по текущему обращению?');
  assert.equal(e.requests[1].body.focus.conversation.conversationId, 'b');
  assert.equal(e.requests[1].body.history[1].content, 'Завершённый ответ A');
  current.dispose(); e.ui.dispose();
});

test('history and draft remain continuous through routes, assessment updates and reload', async () => {
  const e = environment(), card = e.bind(); e.ui.open(); e.submit('Почему 80?');
  e.requests[0].resolve(validReply('Основание оценки')); await tick();
  e.get('textarea').value = 'Черновик'; e.get('textarea').oninput();
  card.updateEvaluation({ id: 'ev-new', transcriptHash: 'ha', status: 'done', total: 60, items: [] });
  card.dispose(); e.context.location.hash = '#/';
  e.DA.setAssistantScope({ filters: { scoreTo: 40 }, fingerprint: 'new-report' });
  e.ui.close(); e.ui.open();
  assert.equal(e.get('textarea').value, 'Черновик');
  assert.match(e.get('.da-assistant-messages').textContent, /Основание оценки/);
  e.ui.dispose();
  const next = environment(e.store); next.ui.open();
  assert.equal(next.get('textarea').value, 'Черновик');
  assert.match(next.get('.da-assistant-messages').textContent, /Основание оценки/);
  next.DA.setAssistantScope({ filters: {}, fingerprint: 'another-report' });
  assert.match(next.get('.da-assistant-messages').textContent, /Основание оценки/);
  next.ui.dispose();
});

test('both work modes share the chat and reviewer analytics actions open the analyst mode', async () => {
  const e = environment(); e.ui.open(); e.submit('Общая история аналитика');
  e.requests[0].resolve(validReply('Ответ аналитику')); await tick();
  e.ui.close(); e.DA.state.role = 'reviewer'; e.DA.syncAssistantRole();
  assert.equal(e.get('.da-assistant-launcher').hidden, false);
  e.ui.open(); assert.match(e.get('.da-assistant-messages').textContent, /Ответ аналитику/);
  e.submit('Вопрос проверяющего');
  e.requests[1].resolve({ ...validReply('Ответ проверяющему'), sources: [{ id: 'x', type: 'analytics', label: 'Открыть аналитику', filters: { scoreTo: 40 } }] }); await tick();
  assert.ok(e.get('.da-assistant-sources'));
  e.get('.da-assistant-sources').querySelector('button').onclick();
  assert.equal(e.DA.state.role, 'analyst');
  assert.equal(e.context.location.hash, '#/insights?scoreTo=40&tab=overview');
  e.ui.open();
  assert.match(e.get('.da-assistant-messages').textContent, /Ответ аналитику/);
  assert.match(e.get('.da-assistant-messages').textContent, /Ответ проверяющему/);
  e.ui.dispose();
});

test('changing work modes continues the same in-flight answer', async () => {
  const e = environment(); e.ui.open(); e.submit('Вопрос аналитика');
  e.advance(0, { type: 'answer_delta', text: 'Частичный ответ' });
  e.DA.state.role = 'reviewer'; e.DA.syncAssistantRole();
  assert.equal(e.requests[0].options.signal.aborted, false);
  assert.equal(e.get('.da-assistant-stream').textContent, 'Частичный ответ');
  e.DA.state.role = 'analyst'; e.DA.syncAssistantRole();
  e.advance(0, { type: 'answer_delta', text: ' и продолжение' });
  e.requests[0].resolve(validReply('Завершённый ответ')); await tick();
  assert.match(e.get('.da-assistant-messages').textContent, /Завершённый ответ/);
  assert.equal(e.get('textarea').value, '');
  e.ui.dispose();
});

test('comparison focus reads the live URL on each send without resetting history', async () => {
  const e = environment(); e.context.location.hash = '#/checklists?compare=1&from=1&to=2'; e.ui.open(); e.submit('Сравни');
  assert.deepEqual(e.requests[0].body.focus.comparison, { fromVersion: 1, toVersion: 2 });
  e.requests[0].resolve(validReply('Изменения 1 → 2')); await tick();
  e.context.location.hash = '#/checklists?compare=1&from=2&to=1'; e.submit('А теперь?');
  assert.deepEqual(e.requests[1].body.focus.comparison, { fromVersion: 2, toVersion: 1 });
  assert.equal(e.requests[1].body.history.length, 2);
  e.ui.dispose();
});

test('validated sources route safely, exact historical citations retain evaluation and turn', async () => {
  const e = environment(); e.ui.open(); e.submit('Источники');
  e.advance(0, { type: 'answer_delta', text: '<img src=x onerror=alert(1)>' });
  assert.equal(e.get('.da-assistant-stream').querySelector('img'), null);
  e.requests[0].resolve({ ...validReply('<img src=x onerror=alert(1)>\n\n- Факт'),
    citations: [{ id: 'quote', conversationId: 'b', evaluationId: 'ev /old', transcriptHash: 'old', turnIdx: 3, quote: 'Точная цитата' }],
    sources: [{ id: 'source', type: 'conversation', conversationId: 'b', label: 'Обращение' }],
    actions: [{ id: 'selection', type: 'show_registry', label: 'Открыть обращения', filters: { conversationIds: [] } }] }); await tick();
  assert.equal(e.get('.da-assistant-prose').querySelector('img'), null);
  assert.match(e.get('.da-assistant-prose').textContent, /<img src=x/);
  e.click('.da-assistant-citation');
  assert.equal(e.context.location.hash, '#/c/b?evaluation=ev+%2Fold&turn=3');
  e.ui.open(); e.get('.da-assistant-result-actions').querySelector('button').onclick();
  assert.equal(e.context.location.hash, '#/?conversationIds=%5B%5D');
  e.ui.dispose();
});

test('errors after deltas discard unfinished text and keep a retryable question', async () => {
  const e = environment(); e.ui.open(); e.submit('Повторяемый вопрос');
  e.advance(0, { type: 'answer_delta', text: 'Непроверенный ответ' });
  e.requests[0].reject(new Error('Не удалось проверить источники')); await tick();
  assert.equal(e.get('textarea').value, 'Повторяемый вопрос');
  assert.match(e.get('.da-assistant-notice').textContent, /Не удалось проверить источники/);
  assert.equal(e.get('.da-assistant-stream'), null);
  assert.equal(e.get('.da-assistant-messages').textContent, '');
  e.get('.da-assistant-notice').querySelector('button').onclick();
  e.requests[1].resolve({ ...validReply(), sources: [{ id: 'bad', type: 'javascript', label: 'Bad' }] }); await tick();
  assert.equal(e.get('.da-assistant-messages').textContent, '');
  assert.equal(e.get('textarea').disabled, false);
  e.ui.dispose();
});

test('malformed or overlong streamed text is rejected and cannot enter history', async () => {
  for (const text of [{ raw: 'JSON' }, 'a'.repeat(8001)]) {
    const e = environment(); e.ui.open(); e.submit('Проверка');
    e.advance(0, { type: 'answer_delta', text }); await tick();
    assert.equal(e.get('.da-assistant-messages').textContent, '');
    assert.equal(e.get('textarea').value, 'Проверка');
    assert.equal(e.get('textarea').disabled, false);
    e.ui.dispose();
  }
});

test('long answers render up to 8000 while follow-up history respects the server 6000 bound', async () => {
  const e = environment(); e.ui.open(); e.submit('Подробно');
  e.advance(0, { type: 'answer_delta', text: 'а'.repeat(4000) });
  e.advance(0, { type: 'answer_delta', text: 'а'.repeat(4000) });
  e.requests[0].resolve(validReply('а'.repeat(8000))); await tick();
  assert.equal(e.get('.da-assistant-prose').textContent.length, 8000);
  e.submit('Продолжи');
  assert.equal(e.requests[1].body.history[1].content.length, 6000);
  e.ui.dispose();
});

test('large application data is not stored in chat and does not prevent restored history', async () => {
  const populate = state => { for (let index = 0; index < 65; index++) state.evaluations['c' + index] = {
    id: 'ev' + index, status: 'done', total: 70, items: Array.from({ length: 8 }, (_, criterion) => ({ criterionId: 'criterion' + criterion, explanation: 'Объяснение и подтверждение из диалога. '.repeat(50) }))
  }; };
  const e = environment(null, populate); e.ui.open(); e.submit('Сводка всей базы');
  e.requests[0].resolve(validReply('Проверенная сводка')); await tick(); e.ui.dispose();
  const serialized = JSON.stringify(savedChats(e));
  assert.ok(serialized.length <= 180000);
  assert.doesNotMatch(serialized, /Объяснение и подтверждение из диалога/);
  const next = environment(e.store, populate); next.ui.open();
  assert.match(next.get('.da-assistant-messages').textContent, /Проверенная сводка/);
  next.ui.dispose();
});

test('updated page filters become next-request focus but do not change an active request', async () => {
  const e = environment(); e.DA.setAssistantScope({ filters: { scoreTo: 20 } }); e.ui.open(); e.submit('По этим обращениям');
  e.context.location.hash = '#/?scoreTo=40'; e.change('hashchange');
  e.requests[0].resolve(validReply('Ответ по первоначальному вопросу')); await tick();
  assert.equal(e.requests[0].options.signal.aborted, false);
  assert.equal(e.requests[0].body.focus.filters.scoreTo, 20);
  e.submit('А по этим?');
  assert.equal(e.requests[1].body.focus.filters.scoreTo, 40);
  assert.equal(e.requests[1].body.history.length, 2);
  e.ui.dispose();
});


test('previous mode-specific chats migrate to a continuous bounded thread', () => {
  const messagePair = answer => [{ role: 'user', content: 'Вопрос: ' + answer }, { role: 'assistant', content: answer, reply: validReply(answer) }];
  const stored = new Map([['da.assistant.chat.v4', JSON.stringify({ version: 4, sessions: [
    { key: 'analyst', history: messagePair('Ранний ответ'), draft: '', updatedAt: 1 },
    { key: 'reviewer', history: messagePair('Поздний ответ'), draft: 'Последний черновик', updatedAt: 2 }
  ] })]]);
  const e = environment(null, null, { tabStore: stored }); e.ui.open();
  assert.match(e.get('.da-assistant-messages').textContent, /Ранний ответ.*Поздний ответ/);
  assert.equal(e.get('textarea').value, 'Последний черновик');
  assert.equal(savedChats(e).length, 1);
  e.ui.dispose();
});

test('preflight stale focus refreshes once without losing history or exposing late first-attempt events', async () => {
  const e = environment(); e.ui.open(); e.submit('Предыдущий вопрос');
  e.requests[0].resolve(validReply('Предыдущий ответ')); await tick();
  e.bind();
  let releaseSource, releaseAssessments;
  const reads = [];
  e.DA.api.getConversation = (id, options) => { reads.push(['conversation', id, options.signal]); return new Promise(resolve => { releaseSource = resolve; }); };
  e.DA.api.listEvaluations = (id, options) => { reads.push(['evaluations', id, options.signal]); return new Promise(resolve => { releaseAssessments = resolve; }); };
  e.submit('Почему изменилась оценка?');
  e.requests[1].reject(new e.DA.ApiError('assistant_focus_stale', 'old reopen text', 409)); await tick();
  assert.match(e.get('.da-assistant-thinking').textContent, /Обновляю данные/);
  assert.equal(e.get('textarea').disabled, true);
  assert.equal(e.requests.length, 2);
  e.advance(1, { type: 'answer_delta', text: 'Поздний текст отклонённой попытки' });
  releaseSource({ id: 'a', transcriptHash: 'new-hash' });
  releaseAssessments({ items: [{ id: 'ev-new', conversationId: 'a', transcriptHash: 'new-hash' }] }); await tick();
  assert.equal(e.requests.length, 3);
  assert.deepEqual(e.requests[2].body.focus.conversation, { conversationId: 'a', evaluationId: 'ev-new', transcriptHash: 'new-hash' });
  assert.equal(e.requests[2].body.message, e.requests[1].body.message);
  assert.deepEqual(e.requests[2].body.history, e.requests[1].body.history);
  assert.equal(e.requests[2].body.language, e.requests[1].body.language);
  assert.ok(reads.every(read => read[2] === e.requests[2].options.signal));
  assert.doesNotMatch(e.get('.da-assistant-messages').textContent, /Поздний текст/);
  e.requests[2].resolve({ ...validReply('Обновлённый ответ'), citations: [{ id: 'fresh', conversationId: 'a', evaluationId: 'ev-new', transcriptHash: 'new-hash', turnIdx: 0, quote: 'Новая цитата' }] }); await tick();
  assert.equal(e.DA.state.conversations.a.transcriptHash, 'ha', 'request-local refresh does not rewrite the displayed card');
  assert.equal(savedChats(e)[0].history.length, 4);
  e.click('.da-assistant-citation');
  assert.equal(e.jumped, undefined, 'fresh quote never jumps into the old visible transcript');
  assert.equal(e.context.location.hash, '#/c/a?evaluation=ev-new&turn=0');
  e.ui.dispose();
});

test('historical focus refresh preserves the exact pinned evaluation and its transcript snapshot', async () => {
  const e = environment(); e.bind(); e.context.location.hash = '#/c/a?evaluation=ev-a'; e.ui.open();
  const reads = [];
  e.DA.api.getEvaluationConversation = async (id, options) => { reads.push(['snapshot', id, options.signal]); return { id: 'a', transcriptHash: 'historical-hash' }; };
  e.DA.api.getEvaluation = async (id, options) => { reads.push(['evaluation', id, options.signal]); return { id: 'ev-a', conversationId: 'a', transcriptHash: 'historical-hash' }; };
  e.DA.api.getConversation = () => { throw new Error('Must not read current conversation'); };
  e.DA.api.listEvaluations = () => { throw new Error('Must not substitute latest assessment'); };
  e.submit('Объясни именно эту оценку');
  e.requests[0].reject(new e.DA.ApiError('assistant_focus_stale', 'stale', 409)); await tick();
  assert.deepEqual(reads.map(read => read.slice(0, 2)), [['snapshot', 'ev-a'], ['evaluation', 'ev-a']]);
  assert.deepEqual(e.requests[1].body.focus.conversation, { conversationId: 'a', evaluationId: 'ev-a', transcriptHash: 'historical-hash' });
  e.requests[1].resolve(validReply()); await tick(); e.ui.dispose();
});

test('current focus never attaches an assessment from a different transcript', async () => {
  const e = environment(); e.bind(); e.ui.open();
  e.DA.api.getConversation = async () => ({ id: 'a', transcriptHash: 'current-hash' });
  e.DA.api.listEvaluations = async () => ({ items: [{ id: 'ev-a', conversationId: 'a', transcriptHash: 'ha' }] });
  e.submit('Текущее обращение');
  e.requests[0].reject(new e.DA.ApiError('assistant_focus_stale', 'stale', 409)); await tick();
  assert.deepEqual(e.requests[1].body.focus.conversation, { conversationId: 'a', evaluationId: null, transcriptHash: 'current-hash' });
  e.ui.dispose();
});

test('a second stale-focus error stops automatically and offers the preserved question for manual retry', async () => {
  const e = environment(); e.bind(); e.ui.open(); let readCount = 0;
  e.DA.api.getConversation = async () => { readCount++; return { id: 'a', transcriptHash: 'current-hash' }; };
  e.DA.api.listEvaluations = async () => ({ items: [] });
  e.submit('Сохранить этот вопрос');
  e.requests[0].reject(new e.DA.ApiError('assistant_focus_stale', 'stale', 409)); await tick();
  e.requests[1].reject(new e.DA.ApiError('assistant_focus_stale', 'Откройте обращение заново', 409)); await tick();
  assert.equal(e.requests.length, 2);
  assert.equal(readCount, 1);
  assert.equal(e.get('textarea').value, 'Сохранить этот вопрос');
  assert.equal(e.get('textarea').disabled, false);
  assert.match(e.get('.da-assistant-notice').textContent, /Повторите вопрос/);
  assert.doesNotMatch(e.get('.da-assistant-notice').textContent, /Откройте|заново/);
  e.ui.dispose();
});

test('stop cancels focus refresh and late GET completion cannot start the retry or replace a new draft', async () => {
  const e = environment(); e.bind(); e.ui.open(); let releaseSource, releaseAssessments; const signals = [];
  e.DA.api.getConversation = (_, options) => { signals.push(options.signal); return new Promise(resolve => { releaseSource = resolve; }); };
  e.DA.api.listEvaluations = (_, options) => { signals.push(options.signal); return new Promise(resolve => { releaseAssessments = resolve; }); };
  e.submit('Остановленный вопрос');
  e.requests[0].reject(new e.DA.ApiError('assistant_focus_stale', 'stale', 409)); await tick();
  e.click('.da-assistant-stop');
  assert.ok(signals.every(signal => signal.aborted));
  e.get('textarea').value = 'Новый черновик'; e.get('textarea').oninput();
  releaseSource({ id: 'a', transcriptHash: 'current-hash' }); releaseAssessments({ items: [] }); await tick();
  assert.equal(e.requests.length, 1);
  assert.equal(e.get('textarea').value, 'Новый черновик');
  assert.equal(e.get('textarea').disabled, false);
  e.ui.dispose();
});

test('navigation during refresh retains the original focus and leaves the new card binding intact', async () => {
  const e = environment(); const old = e.bind(); e.ui.open(); let releaseSource;
  e.DA.api.getConversation = async id => { assert.equal(id, 'a'); return new Promise(resolve => { releaseSource = resolve; }); };
  e.DA.api.listEvaluations = async () => ({ items: [] });
  e.submit('Первое обращение');
  e.requests[0].reject(new e.DA.ApiError('assistant_focus_stale', 'stale', 409)); await tick();
  const next = e.bind('b', { id: 'ev-b', transcriptHash: 'hb', status: 'done', items: [] }); old.dispose();
  releaseSource({ id: 'a', transcriptHash: 'a-refreshed' }); await tick();
  assert.equal(e.requests[1].body.focus.conversation.conversationId, 'a');
  e.requests[1].resolve(validReply('Ответ по первому обращению')); await tick();
  e.submit('Теперь второе');
  assert.equal(e.requests[2].body.focus.conversation.conversationId, 'b');
  next.dispose(); e.ui.dispose();
});

test('server answer_reset discards only provisional text and keeps the same question and history', async () => {
  const e = environment(); e.ui.open(); e.submit('Сравни данные');
  e.advance(0, { type: 'answer_delta', text: 'Устаревший предварительный ответ' });
  e.advance(0, { type: 'answer_reset' });
  e.advance(0, { type: 'progress', stage: 'refreshing' });
  assert.equal(e.get('.da-assistant-stream').textContent, '');
  assert.match(e.get('.da-assistant-messages').textContent, /Сравни данные/);
  assert.match(e.get('.da-assistant-thinking').textContent, /Обновляю данные/);
  assert.equal(e.get('textarea').disabled, true);
  e.advance(0, { type: 'answer_delta', text: 'Актуальный ответ' });
  e.requests[0].resolve(validReply('Актуальный ответ')); await tick();
  assert.equal(e.requests.length, 1);
  assert.doesNotMatch(e.get('.da-assistant-messages').textContent, /Устаревший/);
  assert.equal(savedChats(e)[0].history.length, 2);
  e.ui.dispose();
});

test('post-model source changes never cause a duplicate automatic model request', async () => {
  for (const code of ['assistant_source_changed', 'stale_source']) {
    const e = environment(); e.bind(); e.ui.open(); e.submit('Проверяемый вопрос');
    e.advance(0, { type: 'answer_delta', text: 'Непроверенный текст' });
    e.requests[0].reject(new e.DA.ApiError(code, 'Откройте обращение заново', 409)); await tick();
    assert.equal(e.requests.length, 1);
    assert.equal(e.get('.da-assistant-messages').textContent, '');
    assert.equal(e.get('textarea').value, 'Проверяемый вопрос');
    assert.match(e.get('.da-assistant-notice').textContent, /Повторите вопрос/);
    assert.doesNotMatch(e.get('.da-assistant-notice').textContent, /Откройте|заново/);
    e.ui.dispose();
  }
});

test('an unavailable or mismatched historical refresh fails without substituting current data', async () => {
  const e = environment(); e.bind(); e.context.location.hash = '#/c/a?evaluation=ev-a'; e.ui.open();
  e.DA.api.getEvaluationConversation = async () => ({ id: 'a', transcriptHash: 'snapshot-hash' });
  e.DA.api.getEvaluation = async () => ({ id: 'ev-different', conversationId: 'a', transcriptHash: 'snapshot-hash' });
  e.submit('Историческая оценка');
  e.requests[0].reject(new e.DA.ApiError('assistant_focus_stale', 'stale', 409)); await tick();
  assert.equal(e.requests.length, 1);
  assert.equal(e.get('textarea').value, 'Историческая оценка');
  assert.equal(e.get('textarea').disabled, false);
  e.ui.dispose();
});

test('an explicit historical route stays pinned even when the cached assessment hash is already stale', async () => {
  const e = environment();
  e.bind('a', { id: 'ev-a', transcriptHash: 'stale-cached-assessment-hash', status: 'done', items: [] });
  e.context.location.hash = '#/c/a?evaluation=ev-a'; e.ui.open();
  const reads = [];
  e.DA.api.getEvaluationConversation = async id => { reads.push(['snapshot', id]); return { id: 'a', transcriptHash: 'exact-snapshot-hash' }; };
  e.DA.api.getEvaluation = async id => { reads.push(['evaluation', id]); return { id: 'ev-a', conversationId: 'a', transcriptHash: 'exact-snapshot-hash' }; };
  e.DA.api.getConversation = () => { throw new Error('Historical pin must not become current'); };
  e.DA.api.listEvaluations = () => { throw new Error('Historical pin must not become latest'); };
  e.submit('Разбери сохранённую оценку');
  assert.equal(e.requests[0].body.focus.conversation.evaluationId, 'ev-a');
  e.requests[0].reject(new e.DA.ApiError('assistant_focus_stale', 'stale', 409)); await tick();
  assert.deepEqual(reads, [['snapshot', 'ev-a'], ['evaluation', 'ev-a']]);
  assert.deepEqual(e.requests[1].body.focus.conversation, { conversationId: 'a', evaluationId: 'ev-a', transcriptHash: 'exact-snapshot-hash' });
  e.requests[1].resolve(validReply('Ответ по сохранённой оценке')); await tick();
  e.ui.dispose();
});


function chooseChat(e, title) {
  if (e.get('.da-assistant-history').hidden) e.click('.da-assistant-history-toggle');
  const entry = e.get('.da-assistant-history-list').querySelectorAll('.da-assistant-history-entry').find(node => node.textContent.includes(title));
  assert.ok(entry, 'saved chat is listed: ' + title); entry.onclick();
}

test('new chat preserves the previous answer and draft and reopening sends only that chat history', async () => {
  const e = environment(); e.ui.open(); e.submit('Первый диалог');
  e.requests[0].resolve(validReply('Первый ответ')); await tick();
  e.get('textarea').value = 'Черновик первого'; e.get('textarea').oninput();
  e.click('.da-assistant-new');
  assert.equal(e.get('textarea').value, '');
  assert.equal(e.get('.da-assistant-messages').textContent, '');
  e.submit('Второй диалог'); e.requests[1].resolve(validReply('Второй ответ')); await tick();
  assert.equal(savedChats(e).length, 2);
  chooseChat(e, 'Первый диалог');
  assert.equal(e.get('textarea').value, 'Черновик первого');
  assert.match(e.get('.da-assistant-messages').textContent, /Первый ответ/);
  assert.doesNotMatch(e.get('.da-assistant-messages').textContent, /Второй ответ/);
  e.submit('Продолжение первого');
  assert.deepEqual(e.requests[2].body.history.map(item => item.content), ['Первый диалог', 'Первый ответ']);
  e.requests[2].resolve(validReply('Продолжение')); await tick(); e.ui.dispose();
});

test('switching chats cancels the old stream and preserves its question without cross-appending late text', async () => {
  const e = environment(); e.ui.open(); e.submit('Готовый диалог');
  e.requests[0].resolve(validReply('Сохранённый ответ')); await tick(); e.click('.da-assistant-new');
  e.submit('Ожидающий диалог'); e.advance(1, { type: 'answer_delta', text: 'Незавершённый ответ' });
  chooseChat(e, 'Готовый диалог');
  assert.equal(e.requests[1].options.signal.aborted, true);
  e.advance(1, { type: 'answer_delta', text: 'Поздний текст' });
  e.requests[1].resolve(validReply('Поздний ответ')); await tick();
  assert.doesNotMatch(e.get('.da-assistant-messages').textContent, /Поздний|Незавершённый/);
  chooseChat(e, 'Ожидающий диалог');
  assert.equal(e.get('textarea').value, 'Ожидающий диалог');
  assert.equal(e.get('.da-assistant-messages').textContent, '');
  e.ui.dispose();
});

test('switching chats during stale-focus refresh prevents the retry and leaves the selected chat intact', async () => {
  const e = environment(); e.ui.open(); e.submit('Старый диалог'); e.requests[0].resolve(validReply('Старый ответ')); await tick();
  e.click('.da-assistant-new'); e.bind(); let releaseSource;
  e.DA.api.getConversation = () => new Promise(resolve => { releaseSource = resolve; });
  e.DA.api.listEvaluations = async () => ({ items: [] });
  e.submit('Диалог с обновлением'); e.requests[1].reject(new e.DA.ApiError('assistant_focus_stale', 'stale', 409)); await tick();
  chooseChat(e, 'Старый диалог');
  releaseSource({ id: 'a', transcriptHash: 'new' }); await tick();
  assert.equal(e.requests.length, 2);
  assert.match(e.get('.da-assistant-messages').textContent, /Старый ответ/);
  chooseChat(e, 'Диалог с обновлением');
  assert.equal(e.get('textarea').value, 'Диалог с обновлением');
  e.ui.dispose();
});

test('saved chats survive a fresh tab and the active chat survives reload without changing its date', async () => {
  const e = environment(); e.ui.open(); e.submit('Чат A'); e.requests[0].resolve(validReply('Ответ A')); await tick();
  e.click('.da-assistant-new'); e.submit('Чат B'); e.requests[1].resolve(validReply('Ответ B')); await tick();
  const dates = Object.fromEntries(savedChats(e).map(chat => [chat.key, chat.updatedAt]));
  chooseChat(e, 'Чат A'); e.ui.dispose();
  const reload = environment(e.store, null, { tabStore: e.tabStore }); reload.ui.open();
  assert.match(reload.get('.da-assistant-messages').textContent, /Ответ A/);
  assert.deepEqual(Object.fromEntries(savedChats(reload).map(chat => [chat.key, chat.updatedAt])), dates);
  const freshTab = environment(e.store); freshTab.ui.open(); freshTab.click('.da-assistant-history-toggle');
  assert.equal(freshTab.get('.da-assistant-history-list').querySelectorAll('.da-assistant-history-entry').length, 2);
  reload.ui.dispose(); freshTab.ui.dispose();
});

test('v5 migration keeps the original dialogue and draft and removes legacy data only after durable save', () => {
  const pair = [{ role: 'user', content: 'Старый вопрос' }, { role: 'assistant', content: 'Старый ответ', reply: validReply('Старый ответ') }];
  const legacy = new Map([['da.assistant.chat.v5', JSON.stringify({ version: 5, sessions: [{ key: 'global', history: pair, draft: 'Старый черновик', updatedAt: 1234567890000 }] })]]);
  const e = environment(null, null, { tabStore: legacy }); e.failures.local = true; e.ui.open();
  assert.equal(e.get('textarea').value, 'Старый черновик');
  assert.match(e.get('.da-assistant-messages').textContent, /Старый ответ/);
  assert.equal(legacy.has('da.assistant.chat.v5'), true);
  assert.match(e.get('.da-assistant-storage-notice').textContent, /до её закрытия/);
  e.ui.dispose();
  const recovered = environment(e.store, null, { tabStore: legacy }); recovered.ui.open();
  assert.equal(savedChats(recovered).length, 1);
  assert.equal(savedChats(recovered)[0].updatedAt, 1234567890000);
  assert.equal(legacy.has('da.assistant.chat.v5'), false);
  assert.equal(recovered.get('textarea').value, 'Старый черновик');
  recovered.ui.dispose();
});

test('quota failure preserves the last durable copy and full tab fallback until save succeeds', async () => {
  const e = environment(); e.ui.open(); e.submit('Первый вопрос'); e.requests[0].resolve(validReply('Первый ответ')); await tick();
  const durableBefore = [...e.store.values()][0]; e.failures.local = true;
  e.submit('Новый вопрос'); e.requests[1].resolve(validReply('Новый ответ')); await tick();
  assert.equal([...e.store.values()][0], durableBefore);
  const backup = [...e.tabStore.entries()].find(([key]) => key.startsWith('da.assistant.history.tab.v1.'));
  assert.equal(JSON.parse(backup[1]).history.length, 4);
  assert.equal(e.get('.da-assistant-storage-notice').hidden, false);
  assert.match(e.get('.da-assistant-storage-notice').textContent, /этой вкладке/);
  e.failures.local = false; e.get('.da-assistant-storage-notice').querySelector('button').onclick();
  assert.equal(savedChats(e)[0].history.length, 4);
  assert.equal(e.get('.da-assistant-storage-notice').hidden, true);
  assert.equal([...e.tabStore.keys()].some(key => key.startsWith('da.assistant.history.tab.v1.')), false);
  e.ui.dispose();
});

test('a quota backup follows a concurrent-edit fork and never reappears as an extra recovered chat', async () => {
  for (const recoverImmediately of [true, false]) {
    const e = environment(); e.ui.open(); e.submit('Общий диалог'); e.requests[0].resolve(validReply('Общий ответ')); await tick();
    const other = environment(e.store); other.ui.open();
    e.failures.local = true;
    e.get('textarea').value = 'Черновик первой вкладки'; e.get('textarea').oninput(); e.ui.close();
    other.get('textarea').value = 'Черновик другой вкладки'; other.get('textarea').oninput(); other.ui.close();
    e.ui.open(); e.failures.local = !recoverImmediately;
    e.get('.da-assistant-storage-notice').querySelector('button').onclick();
    const backups = [...e.tabStore.keys()].filter(key => key.startsWith('da.assistant.history.tab.v1.'));
    assert.equal(backups.length, recoverImmediately ? 0 : 1);
    if (!recoverImmediately) {
      assert.notEqual(backups[0], 'da.assistant.history.tab.v1.' + savedChats(e)[0].key);
      e.failures.local = false; e.get('.da-assistant-storage-notice').querySelector('button').onclick();
    }
    assert.equal(savedChats(e).length, 2);
    assert.equal([...e.tabStore.keys()].some(key => key.startsWith('da.assistant.history.tab.v1.')), false);
    e.ui.dispose(); other.ui.dispose();
    const reload = environment(e.store, null, { tabStore: e.tabStore }); reload.ui.open(); reload.click('.da-assistant-history-toggle');
    assert.equal(reload.get('.da-assistant-history-list').querySelectorAll('.da-assistant-history-entry').length, 2);
    assert.ok(savedChats(reload).some(chat => chat.draft === 'Черновик первой вкладки'));
    assert.ok(savedChats(reload).some(chat => chat.draft === 'Черновик другой вкладки'));
    reload.ui.dispose();
  }
});

test('restoring an already durable revision removes its obsolete tab backup before later edits', async () => {
  const e = environment(); e.ui.open(); e.submit('Сохранённый диалог'); e.requests[0].resolve(validReply('Ответ')); await tick(); e.ui.dispose();
  const chat = savedChats(e)[0], backupKey = 'da.assistant.history.tab.v1.' + chat.key;
  e.tabStore.set(backupKey, JSON.stringify(chat));
  const reload = environment(e.store, null, { tabStore: e.tabStore }); reload.ui.open();
  assert.equal(e.tabStore.has(backupKey), false);
  reload.get('textarea').value = 'Поздний черновик'; reload.get('textarea').oninput(); reload.ui.dispose();
  const next = environment(e.store, null, { tabStore: e.tabStore }); next.ui.open(); next.click('.da-assistant-history-toggle');
  assert.equal(next.get('.da-assistant-history-list').querySelectorAll('.da-assistant-history-entry').length, 1);
  next.ui.dispose();
});

test('invalid stored dates are normalized without losing saved or migrated dialogue content', () => {
  const pair = [{ role: 'user', content: 'Вопрос' }, { role: 'assistant', content: 'Ответ', reply: validReply('Ответ') }];
  const store = new Map([['da.assistant.history.v1.saved', JSON.stringify({ version: 1, key: 'saved', title: 'Сохранённый',
    history: pair, draft: 'Черновик', createdAt: 1e100, updatedAt: 'Infinity', revision: 'saved-revision', baseRevision: null })]]);
  const tabStore = new Map([['da.assistant.chat.v5', JSON.stringify({ version: 5, sessions: [{ history: pair, draft: 'Старый черновик', updatedAt: -1e100 }] })]]);
  const e = environment(store, null, { tabStore }); e.ui.open(); e.click('.da-assistant-history-toggle');
  const entries = e.get('.da-assistant-history-list').querySelectorAll('.da-assistant-history-entry');
  assert.equal(entries.length, 2);
  for (const entry of entries) assert.ok(Number.isFinite(new Date(entry.querySelector('time').getAttribute('datetime')).getTime()));
  chooseChat(e, 'Сохранённый');
  assert.equal(e.get('textarea').value, 'Черновик');
  assert.match(e.get('.da-assistant-messages').textContent, /Ответ/);
  e.ui.dispose();
});

test('when both stores fail the answer remains in memory with an honest unsaved warning', async () => {
  const e = environment(); e.ui.open(); e.failures.local = true; e.failures.session = true;
  e.submit('Важный вопрос'); e.requests[0].resolve(validReply('Важный ответ')); await tick();
  assert.match(e.get('.da-assistant-messages').textContent, /Важный ответ/);
  assert.match(e.get('.da-assistant-storage-notice').textContent, /Скопируйте важные ответы/);
  assert.doesNotMatch(e.get('.da-assistant-storage-notice').textContent, /до её закрытия/);
  e.click('.da-assistant-new'); chooseChat(e, 'Важный вопрос');
  assert.match(e.get('.da-assistant-messages').textContent, /Важный ответ/);
  e.ui.dispose();
});

test('stream tokens never write history and draft writes are flushed on close', async () => {
  const e = environment(); e.ui.open(); e.submit('Запрос'); const before = e.writes.local;
  for (let i = 0; i < 10; i++) e.advance(0, { type: 'answer_delta', text: 'часть ' });
  assert.equal(e.writes.local, before);
  e.requests[0].resolve(validReply('Полный ответ')); await tick();
  assert.equal(e.writes.local, before + 1);
  const afterAnswer = e.writes.local;
  e.get('textarea').value = 'Черновик'; e.get('textarea').oninput();
  assert.equal(e.writes.local, afterAnswer);
  e.ui.close(); assert.equal(e.writes.local, afterAnswer + 1);
  e.ui.dispose();
});

test('saved history exceeds the model window while the original title and last12 request bound remain stable', async () => {
  const e = environment(); e.ui.open();
  for (let i = 0; i < 8; i++) { e.submit('Вопрос ' + i); e.requests[i].resolve(validReply('Ответ ' + i)); await tick(); }
  assert.equal(savedChats(e)[0].history.length, 16);
  assert.equal(savedChats(e)[0].title, 'Вопрос 0');
  e.submit('Вопрос 8');
  assert.equal(e.requests[8].body.history.length, 12);
  assert.equal(e.requests[8].body.history[0].content, 'Вопрос 2');
  e.ui.dispose();
});

test('history deletion requires explicit confirmation and the chat limit never silently evicts saved data', async () => {
  const store = new Map();
  for (let i = 0; i < 30; i++) store.set('da.assistant.history.v1.saved-' + i, JSON.stringify({ version: 1, key: 'saved-' + i,
    title: 'Сохранённый ' + i, history: [{ role: 'user', content: 'Вопрос ' + i }, { role: 'assistant', content: 'Ответ ' + i, reply: validReply('Ответ ' + i) }],
    draft: '', createdAt: 1000 + i, updatedAt: 1000 + i, revision: 'r-' + i, baseRevision: null }));
  const e = environment(store); e.ui.open(); e.click('.da-assistant-new');
  assert.equal(savedChats(e).length, 30);
  assert.match(e.get('.da-assistant-storage-notice').textContent, /Сохранено 30 диалогов/);
  e.get('.da-assistant-history-list').querySelector('.da-assistant-history-delete').onclick();
  assert.equal(savedChats(e).length, 30);
  e.click('.da-assistant-delete-confirmed');
  assert.equal(savedChats(e).length, 29);
  e.click('.da-assistant-new'); e.submit('Новый после удаления'); e.requests[0].resolve(validReply('Ответ')); await tick();
  assert.equal(savedChats(e).length, 30);
  e.ui.dispose();
});

test('separate browser tabs cannot overwrite unrelated chats or silently replace a concurrent edit', async () => {
  const shared = new Map(), a = environment(shared), b = environment(shared);
  a.ui.open(); b.ui.open(); a.submit('Чат первой вкладки'); a.requests[0].resolve(validReply('Ответ первой')); await tick();
  b.submit('Чат второй вкладки'); b.requests[0].resolve(validReply('Ответ второй')); await tick();
  assert.equal(savedChats(a).length, 2);
  const c = environment(shared); c.ui.open(); chooseChat(c, 'Чат первой вкладки');
  a.submit('Продолжение первой'); a.requests[1].resolve(validReply('Обновлённый ответ')); await tick();
  c.get('textarea').value = 'Другой черновик'; c.get('textarea').oninput(); c.ui.close();
  assert.equal(savedChats(a).length, 3);
  assert.ok(savedChats(a).some(chat => chat.history.some(item => item.content === 'Обновлённый ответ')));
  assert.ok(savedChats(a).some(chat => chat.draft === 'Другой черновик'));
  a.ui.dispose(); b.ui.dispose(); c.ui.dispose();
});

test('history empty state and controls localize, and Escape returns to the chat before closing', () => {
  const e = environment(); e.ui.open(); e.click('.da-assistant-history-toggle');
  assert.match(e.get('.da-assistant-history-list').textContent, /Диалогов пока нет/);
  e.language('en'); assert.match(e.get('.da-assistant-history-list').textContent, /No chats yet/);
  e.language('kk'); assert.match(e.get('.da-assistant-history-list').textContent, /Әзірге диалогтар жоқ/);
  const escape = () => { const event = new Event('keydown', { cancelable: true }); Object.defineProperty(event, 'key', { value: 'Escape' }); e.get('.da-assistant').dispatchEvent(event); };
  escape();
  assert.equal(e.get('.da-assistant-history').hidden, true);
  assert.equal(e.document.activeElement, e.get('.da-assistant-history-toggle'));
  assert.equal(e.get('.da-assistant-panel').hidden, false);
  escape(); assert.equal(e.get('.da-assistant-panel').hidden, true);
  e.ui.dispose();
});

test('answer formatting preserves numbered steps and safe emphasis without interpreting HTML or unsupported markup', async () => {
  const e = environment(); e.ui.open(); e.submit('Объясни порядок');
  e.requests[0].resolve(validReply('# **Порядок**\nПрочитайте **оценку**.\n\n3. **Проверьте** цитату\n5. Откройте обращение\n- Уточните результат\n- <img src=x onerror=alert(1)>\n\n**\n[Ссылка](javascript:alert(1))')); await tick();
  const prose = e.get('.da-assistant-prose');
  assert.deepEqual(prose.querySelectorAll('strong').map(node => node.textContent), ['Порядок', 'оценку', 'Проверьте']);
  const ordered = prose.querySelector('ol');
  assert.equal(ordered.getAttribute('start'), '3');
  assert.deepEqual(ordered.querySelectorAll('li').map(node => node.value), [3, 5]);
  assert.equal(prose.querySelectorAll('ul').length, 1);
  assert.equal(prose.querySelector('img'), null);
  assert.equal(prose.querySelector('a'), null);
  assert.match(prose.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.match(prose.textContent, /\*\*\n\[Ссылка\]/);
  e.ui.dispose();
});

test('visible sources deduplicate exact destinations while evaluations, snapshots, cohorts and citation turns stay distinct', async () => {
  const e = environment(); e.ui.open(); e.submit('Покажи основания');
  const conversation = { type: 'conversation', conversationId: 'a', evaluationId: 'saved-old', transcriptHash: 'old-hash' };
  e.requests[0].resolve({ ...validReply('Подтверждённые основания'), sources: [
    { ...conversation, id: 'old', label: 'Сохранённая оценка' },
    { ...conversation, id: 'old-copy', label: 'Повтор той же оценки' },
    { ...conversation, id: 'new', evaluationId: 'saved-new', label: 'Другая оценка' },
    { ...conversation, id: 'hash', transcriptHash: 'other-hash', label: 'Другой снимок' },
    { id: 'empty', type: 'analytics', label: 'Пустая выборка', filters: { conversationIds: [] } },
    { id: 'all', type: 'analytics', label: 'Все обращения', filters: {} },
    { id: 'topics', type: 'topics', label: 'Темы обращений', filters: {} },
    { id: 'forward', type: 'checklist_comparison', label: 'Версии 1 → 2', fromVersion: 1, toVersion: 2 },
    { id: 'backward', type: 'checklist_comparison', label: 'Версии 2 → 1', fromVersion: 2, toVersion: 1 }
  ], citations: [
    { id: 'turn-one', conversationId: 'a', evaluationId: 'saved-old', transcriptHash: 'old-hash', turnIdx: 1, quote: 'Первая цитата' },
    { id: 'turn-two', conversationId: 'a', evaluationId: 'saved-old', transcriptHash: 'old-hash', turnIdx: 2, quote: 'Вторая цитата' }
  ], actions: [
    { ...conversation, type: 'open_conversation', id: 'repeat-source', label: 'Повтор источника' },
    { id: 'cohort', type: 'show_registry', label: 'Низкие оценки', filters: { scoreTo: 40 } },
    { id: 'cohort-copy', type: 'show_registry', label: 'Повтор выборки', filters: { scoreTo: 40 } },
    { id: 'other-cohort', type: 'show_registry', label: 'Другие оценки', filters: { scoreTo: 60 } },
    { id: 'third-evaluation', type: 'open_conversation', conversationId: 'a', evaluationId: 'saved-third', label: 'Третья оценка' }
  ] }); await tick();
  const sources = e.get('.da-assistant-sources'), groups = sources.querySelectorAll('.da-assistant-source-links');
  assert.equal(sources.querySelectorAll('.da-assistant-reference').length, 8);
  assert.equal(groups[0].hidden, false); assert.equal(groups[0].querySelectorAll('button').length, 6);
  assert.equal(groups[1].hidden, true); assert.equal(groups[1].querySelectorAll('button').length, 2);
  assert.match(e.get('.da-assistant-sources-more').textContent, /\(2\)/);
  e.click('.da-assistant-sources-more'); assert.equal(groups[1].hidden, false);
  assert.equal(e.get('.da-assistant-sources-more').getAttribute('aria-expanded'), 'true');
  const actions = e.get('.da-assistant-result-actions').querySelectorAll('button');
  assert.deepEqual(actions.map(node => node.textContent), ['Низкие оценки', 'Другие оценки', 'Третья оценка']);
  const citations = e.get('.da-assistant-citations').querySelectorAll('.da-assistant-citation');
  assert.equal(citations.length, 2);
  citations[1].onclick(); assert.equal(e.context.location.hash, '#/c/a?evaluation=saved-old&turn=2');
  actions[2].onclick(); assert.equal(e.context.location.hash, '#/c/a?evaluation=saved-third');
  e.ui.dispose();
});

test('history offers a labelled new-chat action and compact composer keeps keyboard and cancellation behavior', async () => {
  const e = environment(); e.ui.open(); e.submit('Сохранённый вопрос'); e.requests[0].resolve(validReply('Сохранённый ответ')); await tick();
  e.click('.da-assistant-history-toggle');
  assert.match(e.get('.da-assistant-history-new').textContent, /Новый диалог/);
  e.click('.da-assistant-history-new');
  assert.equal(e.get('.da-assistant-history').hidden, true);
  assert.equal(e.get('textarea').getAttribute('rows'), '2');
  assert.equal(e.get('textarea').getAttribute('aria-label'), 'Ваш вопрос');
  e.get('textarea').value = 'Следующий вопрос'; e.get('textarea').oninput();
  let prevented = false;
  e.get('textarea').onkeydown({ key: 'Enter', shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, false); assert.equal(e.requests.length, 1);
  e.get('textarea').onkeydown({ key: 'Enter', shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(e.requests.length, 2);
  e.click('.da-assistant-stop');
  assert.equal(e.get('textarea').value, 'Следующий вопрос');
  chooseChat(e, 'Сохранённый вопрос'); assert.match(e.get('.da-assistant-messages').textContent, /Сохранённый ответ/);
  e.ui.dispose();
});
