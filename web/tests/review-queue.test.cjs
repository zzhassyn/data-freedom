const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Mount the real reviewer view with a small DOM adapter and in-memory services.
// No HTTP, model request or application database is used by these tests.
function environment(count = 20, prepare) {
  let document, location;
  class Node {
    constructor(tag, text = '') {
      this.tagName = tag.toUpperCase(); this._text = text; this.childNodes = []; this.attrs = {};
      this.dataset = {}; this.events = {}; this.style = { setProperty(key, value) { this[key] = value; } };
      this.hidden = false; this.disabled = false; this.value = ''; this.offsetWidth = 100; this.offsetHeight = 40;
    }
    append(...nodes) {
      for (const value of nodes.flat(Infinity)) if (value != null && value !== false) {
        const child = value instanceof Node ? value : new Node('#text', String(value));
        if (child.parentNode) child.remove();
        child.parentNode = this; this.childNodes.push(child);
      }
    }
    replaceChildren(...nodes) { this.childNodes.forEach(node => { node.parentNode = null; }); this.childNodes = []; this._text = ''; this.append(...nodes); }
    remove() { if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter(node => node !== this); this.parentNode = null; }
    get children() { return this.childNodes.filter(node => node.tagName !== '#TEXT'); }
    get firstChild() { return this.childNodes[0] || null; }
    get firstElementChild() { return this.children[0] || null; }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get textContent() { return this._text + this.childNodes.map(node => node.textContent).join(''); }
    setAttribute(key, value) {
      this.attrs[key] = String(value);
      if (key === 'class') this.className = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    }
    getAttribute(key) { return this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    get classList() {
      const node = this;
      return {
        toggle(name, force) { const classes = new Set((node.className || '').split(/\s+/).filter(Boolean)); const on = force == null ? !classes.has(name) : force; on ? classes.add(name) : classes.delete(name); node.className = [...classes].join(' '); return on; },
        add(...names) { names.forEach(name => this.toggle(name, true)); },
        remove(...names) { names.forEach(name => this.toggle(name, false)); },
        contains(name) { return (node.className || '').split(/\s+/).includes(name); }
      };
    }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      const not = selector.match(/:not\(([^)]+)\)/);
      if (not && this.matches(not[1])) return false;
      selector = selector.replace(/:not\([^)]+\)/g, '');
      const tag = selector.match(/^[a-z][\w-]*/i);
      if (tag && this.tagName !== tag[0].toUpperCase()) return false;
      for (const [, name] of selector.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(name)) return false;
      for (const [, key, quoted, bare] of selector.matchAll(/\[([\w-]+)(?:=["']([^"']*)["']|=([^\]]+))?\]/g)) {
        const actual = key === 'disabled' ? this.disabled ? '' : null : this.getAttribute(key);
        if (actual == null || ((quoted ?? bare) != null && actual !== (quoted ?? bare))) return false;
      }
      return true;
    }
    querySelectorAll(selector) {
      const split = selector.trim().split(/\s+(?![^\[]*\])/);
      if (split.length > 1) return this.querySelectorAll(split[0]).flatMap(node => node.querySelectorAll(split.slice(1).join(' ')));
      return this.childNodes.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    contains(node) { return this === node || this.childNodes.some(child => child.contains(node)); }
    closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
    get isConnected() { return document.body.contains(this); }
    focus() { document.activeElement = this; }
    scrollIntoView() {}
    getBoundingClientRect() { return { top: 80, left: 0, right: 100, bottom: 120, width: 100, height: 40 }; }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    removeEventListener(name, fn) { this.events[name] = (this.events[name] || []).filter(handler => handler !== fn); }
    fire(name, details = {}) {
      const event = { target: this, currentTarget: this, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...details };
      this['on' + name]?.(event); (this.events[name] || []).forEach(handler => handler(event));
      if (name === 'click' && this.tagName === 'A' && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) location.hash = this.getAttribute('href');
      return event;
    }
    click() { if (!this.disabled) this.fire('click'); }
  }
  const documentEvents = new Map();
  document = { body: new Node('body'), activeElement: null,
    addEventListener: (name, fn) => documentEvents.set(name, fn), removeEventListener: name => documentEvents.delete(name),
    createTextNode: value => new Node('#text', String(value)) };
  document.activeElement = document.body;
  const root = new Node('main'); document.body.append(root);
  const messages = {}, calls = { hashes: [], history: [], saves: [], model: [] }, timers = new Map(), intervals = new Map(), storage = new Map();
  let timerId = 0, dispose = () => {}, hash = '#/review';
  location = { get hash() { return hash; }, set hash(value) { hash = value; calls.hashes.push(value); } };
  const translate = (key, params = {}) => {
    if (typeof key === 'function') return key();
    const args = typeof params === 'function' ? params() : params;
    let value = messages[key]?.en || key;
    if (typeof value === 'object') value = args.count === 1 ? value.one || value.other : value.other;
    return String(value).replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '');
  };
  const criterion = { id: 'contact', title: 'Contact', description: 'Greet the customer.', type: 'binary', weight: 10 };
  const checklist = { id: 'checklist-1', version: 1, criteria: [criterion] };
  const DA = {
    views: {}, state: { appeals: [], conversations: {}, evaluations: {}, numbers: {}, checklists: [checklist] },
    h(tag, attrs, ...children) {
      const node = new Node(tag);
      for (const [key, value] of Object.entries(attrs || {})) {
        if (value == null) continue;
        if (key === 'style') Object.assign(node.style, value);
        else if (key.startsWith('on') || ['hidden', 'disabled', 'value'].includes(key)) node[key] = value;
        else node.setAttribute(key, value);
      }
      node.append(...children); return node;
    },
    t: translate, msg: translate,
    i18n: { addMessages: entries => Object.assign(messages, entries), bindText: (node, value) => { node.textContent = typeof value === 'function' ? value() : value; }, refresh() {}, release() {} },
    icon: () => new Node('svg'), convNumber: id => DA.state.numbers[id] || id,
    langLabel: { RU: 'Russian', KZ: 'Kazakh', EN: 'English' }, channelLabel: conv => conv.channel === 'voice call' ? 'Call' : 'Chat',
    fmt: { score: String, dateTime: value => new Date(value).toISOString(), duration: String },
    openAppeals: () => DA.state.appeals.filter(appeal => appeal.status === 'open'),
    tone: () => 'yes', answerText: String, allowedAnswers: () => ['yes', 'no'], audioHref: () => null,
    answerPill: answer => DA.h('span', { class: 'da-pill' }, answer),
    segmented(options, value, change) { const node = new Node('nav'); node.value = value; node.choose = change; node.setValue = value => { node.value = value; }; return node; },
    dropdown(options, value, change, label) { const node = DA.h('div', { class: 'test-dropdown', 'aria-label': label }); node.options = options; node.value = value; node.choose = value => { node.value = value; change(value); }; node.setValue = value => { node.value = value; }; return node; },
    computeScores: () => ({ total: 80, items: { contact: { points: 8, effectiveWeight: 10 } } }),
    ribbon: () => { const node = new Node('div'); node.update = () => {}; return node; },
    countTo: (node, from, to) => { node.textContent = to; }, criterionById: () => criterion,
    tx: { gaps: () => ({}), firstOperatorIdx: () => -1 },
    appealRow: appeal => DA.h('div', { class: 'ap-row', 'data-id': appeal.id }, appeal.comment),
    setRole: role => { DA.state.role = role; }, ApiError: class extends Error {},
    data: {
      appealContext(appeal) { const ev = DA.state.evaluations[appeal.evaluationId]; return { c: criterion, cl: checklist, ev, item: ev.items[0], conv: DA.state.conversations[appeal.conversationId] }; },
      async decideAppeal(id, action, answer, reason) {
        calls.saves.push({ id, action, answer, reason });
        const appeal = DA.state.appeals.find(appeal => appeal.id === id);
        const result = { ...appeal, status: action === 'confirm' ? 'confirmed' : 'changed', totalBefore: 80, totalAfter: 80, decision: { action, newAnswer: answer, reason, decidedAt: Date.now() } };
        return { appeal: result, evaluation: { ...DA.state.evaluations[appeal.evaluationId] } };
      },
      secondOpinion() { calls.model.push(true); throw new Error('Unexpected model request'); }
    }
  };
  for (let index = 1; index <= count; index++) {
    const id = `a${index}`, cid = `c${index}`, eid = `e${index}`;
    DA.state.appeals.push({ id, conversationId: cid, evaluationId: eid, criterionId: criterion.id, status: 'open', originalAnswer: 'yes', proposedAnswer: 'no', comment: `Appeal ${index}`, createdAt: Date.now() - (count - index + 1) * 60000 });
    DA.state.conversations[cid] = { conversation_id: cid, language: ['RU', 'KZ', 'EN'][(index - 1) % 3], channel: index % 2 ? 'agent chat' : 'voice call', transcript: [] };
    DA.state.evaluations[eid] = { id: eid, total: 80, items: [{ criterionId: criterion.id, answer: 'yes', evidence: [], points: 8, effectiveWeight: 10, explanation: 'Supported model answer.' }] };
    DA.state.numbers[cid] = index;
  }
  prepare?.(DA.state);
  const context = { DA, document, location, console, URLSearchParams, AbortController, matchMedia: () => ({ matches: true }),
    history: { pushState(_, __, url) { hash = url; calls.history.push(url); }, replaceState(_, __, url) { hash = url; calls.history.push(url); } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)) },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    setInterval: fn => { intervals.set(++timerId, fn); return timerId; }, clearInterval: id => intervals.delete(id),
    scrollTo() {}, addEventListener() {}, removeEventListener() {} };
  context.window = context;
  function mount(id, done = false) {
    dispose(); root.replaceChildren(); hash = done ? '#/review/done' : id ? `#/review/${id}` : '#/review';
    dispose = (done ? DA.views.reviewDone(root) : DA.views.review(root, id ? { id } : {})) || (() => {});
  }
  DA.route = () => mount(hash.startsWith('#/review/') && hash !== '#/review/done' ? decodeURIComponent(hash.slice('#/review/'.length)) : null, hash === '#/review/done');
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/review.js'), 'utf8'), context);
  return { DA, calls, root, context, mount, get: selector => root.querySelector(selector), all: selector => root.querySelectorAll(selector),
    rows: () => root.querySelector('tbody')?.children || [],
    follow() { DA.route(); },
    flushTimers() { for (let round = 0; timers.size && round < 20; round++) { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); } },
    close() { dispose(); }, get hash() { return hash; } };
}

function rowId(row) { return row.dataset.id || row.dataset.appeal; }

test('review queue shows the oldest ten of twenty appeals without opening a decision', () => {
  const e = environment(); e.mount();
  assert.equal(e.hash, '#/review');
  assert.deepEqual(e.calls.history, []);
  assert.equal(e.rows().length, 10);
  assert.deepEqual(e.rows().map(rowId), Array.from({ length: 10 }, (_, index) => `a${index + 1}`));
  assert.equal(e.get('.rv-work'), null);
  assert.equal(e.get('.rv-decide'), null);
  const headings = e.all('th').map(node => node.textContent.toLowerCase()).join(' ');
  for (const label of ['conversation', 'criterion', 'language', 'channel', 'wait']) assert.match(headings, new RegExp(label));
  assert.match(e.rows()[0].textContent, /Contact/);
  assert.match(e.rows()[0].textContent, /Russian/);
  assert.match(e.rows()[0].textContent, /Chat/);
  assert.deepEqual(e.calls.saves, []); assert.deepEqual(e.calls.model, []);
  e.close();
});

test('queue pagination and 10/25/50 page sizes make all twenty appeals reachable', () => {
  const e = environment(); e.mount();
  const sizes = e.get('.test-dropdown');
  assert.deepEqual(Array.from(sizes.options, option => option.value), [10, 25, 50]);
  e.get('[data-go="next"]').click();
  assert.deepEqual(e.rows().map(rowId), Array.from({ length: 10 }, (_, index) => `a${index + 11}`));
  assert.equal(e.get('[data-go="next"]').disabled, true);
  e.get('[data-go="prev"]').click();
  assert.equal(rowId(e.rows()[0]), 'a1');
  sizes.choose(25); assert.equal(e.rows().length, 20);
  sizes.choose(50); assert.equal(e.rows().length, 20);
  sizes.choose(10); assert.equal(e.rows().length, 10);
  assert.equal(e.hash, '#/review');
  e.close();
});

test('click and Enter open only the explicitly chosen appeal', () => {
  const e = environment(); e.mount();
  e.rows()[6].click();
  assert.equal(e.hash, '#/review/a7');
  e.follow(); assert.equal(e.get('.rv-work').dataset.id, 'a7');
  e.mount(); e.rows()[3].fire('keydown', { key: 'Enter' });
  assert.equal(e.hash, '#/review/a4');
  e.follow(); assert.equal(e.get('.rv-work').dataset.id, 'a4');
  assert.deepEqual(e.calls.model, []);
  e.close();
});

test('detail returns to the queue with no strip and retains the selected queue page', () => {
  const e = environment(); e.mount(); e.get('[data-go="next"]').click();
  e.rows()[2].click(); e.follow();
  assert.equal(e.get('.rv-work').dataset.id, 'a13');
  assert.equal(e.get('table'), null);
  assert.equal(e.get('.rv-q-list'), null);
  const back = e.get('a[href="#/review"]');
  assert.ok(back, 'detail includes a back-to-queue link');
  back.click(); e.follow();
  assert.equal(e.hash, '#/review');
  assert.equal(rowId(e.rows()[0]), 'a11');
  assert.equal(e.get('.rv-work'), null);
  e.close();
});

test('saving a decision removes it from the queue and never opens the next appeal', async () => {
  const e = environment(); e.mount('a1');
  const work = e.get('.rv-work');
  work.decision.choose('confirm');
  const reason = e.get('textarea'); reason.value = 'The original answer is supported by the conversation.'; reason.fire('input');
  assert.equal(work.decision.ready(), true);
  await work.decision.save(); e.flushTimers();
  assert.equal(e.calls.saves.length, 1);
  assert.equal(e.calls.saves[0].id, 'a1');
  assert.equal(e.hash, '#/review');
  e.follow();
  assert.equal(e.DA.openAppeals().length, 19);
  assert.equal(rowId(e.rows()[0]), 'a2');
  assert.equal(e.get('.rv-work'), null);
  assert.equal(e.get('.rv-decide'), null);
  assert.deepEqual(e.calls.model, []);
  e.close();
});

test('empty queue and resolved history remain available without selecting an appeal', () => {
  const fresh = environment(0); fresh.mount();
  assert.match(fresh.root.textContent, /No appeals yet/); assert.equal(fresh.get('.rv-work'), null); fresh.close();
  const e = environment(2, state => state.appeals.forEach((appeal, index) => Object.assign(appeal, {
    status: 'confirmed', totalBefore: 80, totalAfter: 80,
    decision: { action: 'confirm', reason: 'Checked against transcript.', newAnswer: null, decidedAt: Date.now() - index * 60000 }
  })));
  e.mount(); assert.match(e.root.textContent, /All appeals resolved/);
  assert.ok(e.get('a[href="#/review/done"]'));
  e.mount(null, true); assert.equal(e.all('.ap-row').length, 2);
  assert.equal(e.get('.rv-decide'), null);
  e.close();
});
