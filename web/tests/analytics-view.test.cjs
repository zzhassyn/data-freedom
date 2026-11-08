const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));

// Small DOM adapter: tests mount the real view and exercise its form and links.
class Element {
  constructor(tag, props = {}, children = []) {
    this.tag = tag; this.props = props; this.children = []; this.events = {}; this.dataset = {};
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('data-')) {this.dataset[key.slice(5)] = value;this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
      else if (key.startsWith('on')) this.events[key.slice(2)] = [value];
      else this[key] = value;
    }
    this.style = { ...props.style, setProperty(key,value) { this[key]=value; } };
    this.classList = { add() {}, remove() {} };
    this.value = props.value || ''; this.append(...children);
  }
  append(...items) { for (const child of items.flat(Infinity).filter(x => x != null && x !== false)) { this.children.push(child); if (child instanceof Element) child.parent = this; } }
  replaceChildren(...items) { this.children = []; this.append(...items); }
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
  setAttribute(key, value) { this.props[key] = value; this[key] = value; }
  getAttribute(key) { return this.props[key]; }
  get textContent() { return this.children.map(x => x instanceof Element ? x.textContent : String(x)).join(''); }
  all() { return this.children.flatMap(x => x instanceof Element ? [x, ...x.all()] : []); }
  querySelectorAll(selector) {
    if(selector.includes(',')) return this.all().filter(x=>selector.split(',').map(s=>s.trim()).includes(x.tag));
    if(selector.startsWith('.')) return this.all().filter(x=>(x.class||'').split(' ').includes(selector.slice(1)));
    const attribute=selector.match(/^\[([\w-]+)="([^"]*)"\]/);
    if(attribute)return this.all().filter(x=>x.getAttribute(attribute[1])===attribute[2]&&(!selector.includes(':not([disabled])')||!x.disabled));
    if(selector.startsWith('[aria-label=')) return this.all().filter(x=>x.props['aria-label']===selector.slice(13,-2));
    if (selector === 'details[data-disclosure][open]') return this.all().filter(x => x.tag === 'details' && x.dataset.disclosure && x.open);
    if (selector === 'details[data-disclosure]') return this.all().filter(x => x.tag === 'details' && x.dataset.disclosure);
    if (selector.startsWith('option[value=')) return this.all().filter(x => x.tag === 'option' && x.value === '_selection');
    return this.all().filter(x => x.tag === selector);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return this === node || this.all().includes(node); }
  closest(selector) { return this.tag === 'details' ? this : this.parent?.closest(selector) || null; }
  focus() { if(this.ownerDocument)this.ownerDocument.activeElement=this; }
  fire(name,details={}) { (this.events[name] || []).forEach(fn => fn({ preventDefault() {}, ...details })); }
  click() { this.fire('click'); }
}
function fixture(F, extra = {}) {
  const cell = { total: 3, evaluated: 2, assessed: 2, applicable: 1, na: 1, missing: 1, avgFraction: .5, belowTargetCount: 1, flaggedCount: 0, conversationIds: ['c1','c2'], belowTargetIds: ['c2'], answerCounts:{yes:0,partial:1,no:0,na:1}, answerIds:{yes:[],partial:['c2'],no:[],na:['c1']} };
  const criterion = { id: 'custom-rule', title: 'Custom current criterion', type: 'scale', sectionId:'section1',sectionTitle:'Original section',sectionOrder:1,order:1,...cell, byLanguage: Object.fromEntries(['RU','KZ','EN'].map(lang => [lang, {...cell}])) };
  const topic = { id: 'topic-a', topic: 'Account access', count: 2, resolved: 1, unresolved: 1, unknown: 0, known: 2, resolutionRate: .5, avgScore: 88, evaluated: 2, scoredCount: 1, conversationIds: ['c1','c2'], resolvedIds: ['c1'], unresolvedIds: ['c2'], unknownIds: [], isRare: true };
  return { sourceHash: 'snapshot-1', scope: { filters: F.normalize({checklistId:'cl2'}), checklist: {id:'cl2',version:2,name:'Current rules'}, checklists: [{id:'cl2',version:2,name:'Current rules',isActive:true},{id:'cl1',version:1,name:'Old rules',isActive:false}], total:3, conversationIds:['c1','c2','c3'], dateSourceCounts:{conversation:2,imported:1,unknown:0}},
    coverage: {evaluated:2,unevaluated:1,pending:0,failed:1,stale:0,readyWithNewerAttempt:1,topicsAnalyzed:2,topicsPending:1,topicsUnidentified:0},
    overview: {avgScore:88,scoredCount:1,lowScoreThreshold:70,lowScoreCount:0,grossCount:1,reviewCount:1,openAppealCount:2,openAppealConversations:1,attentionCount:2,unresolvedCount:1,callDuration:{averageSeconds:125,count:2,source:'audio'},appeals:{total:3,confirmed:1,changed:0,open:2,conversationIds:['c1','c2'],confirmedIds:['c2'],changedIds:[],openIds:['c1']},drilldowns:{attention:['c1','c2'],lowScore:[],gross:['c1'],review:['c1'],openAppeals:['c1'],unresolved:['c2'],failed:['c2'],pending:[],evaluated:['c1','c2'],unevaluated:['c3']}},
    criteria:[criterion], topics:{analyzed:2,pending:1,unidentified:0,minCount:3,job:{status:'idle'},rows:[topic]},
    operators:[{id:'name:A',kind:'named',name:'A',count:3,evaluated:2,scoredCount:1,avgScore:88,grossCount:1,smallSample:true,identityVerified:false,conversationIds:['c1','c2','c3'],weakCriteria:[criterion]}],
    periodComparison:{available:false,reason:'period_not_selected',current:{},previous:null,deltaScore:null},
    conversations:['c1','c2','c3'].map((id,i)=>({conversationId:id,number:i+1,preview:'Conversation '+id,language:'RU',channel:'agent chat',topicId:i<2?'topic-a':null,topic:i<2?'Account access':null,resolutionStatus:['resolved','unresolved','unknown'][i],qualityEvaluationId:i<2?'saved-ready-'+id:null,evaluationId:i<2?'saved-ready-'+id:null,total:i===0?88:null,readyIsPreviousAttempt:i===0})), ...extra };
}
function harness(query = {}, customize = x => x, getAnalytics) {
  const messages = {}, calls = { reads:[], analyzes:[], scopes:[], opens:[], urls:[], hashes:[], scrolls:[] }, events = {},timers=new Map();let timerId=0;
  const document={activeElement:null,addEventListener(){},removeEventListener(){}};
  const DA = { h: (tag,props,...children)=>new Element(tag,props,children), views:{},
    i18n:{addMessages: additions=>Object.assign(messages,additions)}, fmt:{locale:()=> 'en-US',score:value=>String(value)},
    apiErrorMessage:error=>error.message, setAssistantScope:scope=>calls.scopes.push(copy(scope)), openAssistant:args=>calls.opens.push(args),
    segmented(options,value,onChange) { const node=new Element('nav'); node.setValue=v=>{node.value=v;}; node.change=onChange; return node; },
    dropdown(options,value,onChange) { const node=new Element('div',{},[new Element('button',{'aria-expanded':'false'})]);node.setValue=v=>{node.value=v;};node.choose=onChange;return node; },
    icon:()=>new Element('svg'),hoverCard:(node,draw)=>{node.hover=draw;},langLabel:{RU:'Russian',KZ:'Kazakh',EN:'English'},
    state:new Proxy({}, {get(_,key){if(key==='checklists')return [{id:'cl2',criteria:[{title:'Current criterion preview'}]},{id:'cl1',criteria:[{title:'Previous criterion preview'}]}];throw Error('Browser aggregates must not be read');}}) };
  DA.t = (key,params={}) => { let text=messages[key]?.en || key; if (typeof text==='object') text=text.other; return text.replace(/\{(\w+)\}/g,(_,name)=>params[name]); };
  DA.msg = (key,params) => ({ __message:true, key, params });
  const resolve = value => !value?.__message ? value : typeof value.key === 'function' ? value.key() : DA.t(value.key,typeof value.params==='function'?value.params():value.params);
  DA.h = (tag,props,...children) => Object.assign(new Element(tag,Object.fromEntries(Object.entries(props || {}).map(([key,value])=>[key,resolve(value)])),children.flat(Infinity).map(resolve)),{ownerDocument:document});
  DA.i18n.bindText=(node,message)=>node.replaceChildren(resolve(message));
  const location={set hash(value){calls.hashes.push(value);}};
  const window={DA,location,scrollX:0,scrollY:0,scrollTo:value=>{calls.scrolls.push(value);window.scrollX=value.left;window.scrollY=value.top;},addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name]};
  const context=vm.createContext({window,document,history:{replaceState:(...args)=>calls.urls.push(args[2])},URLSearchParams,Intl,
    setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id) });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/filters.js'),'utf8'),context);
  const report=customize(fixture(DA.registryFilters));
  let response=report;
  DA.api={getAnalytics:filters=>{calls.reads.push(copy(filters));return getAnalytics?getAnalytics(filters):response instanceof Error?Promise.reject(response):Promise.resolve(copy(response));}, analyzeTopicSelection:ids=>{calls.analyzes.push(copy(ids));return Promise.resolve({status:'done'});}};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/insights.js'),'utf8'),context);
  const root=new Element('main'), cleanup=DA.views.insights(root,{query});
  return {DA,root,calls,report,events,cleanup,window,document,timers,setReport:value=>{response=value;},poll:()=>{const next=timers.entries().next().value;assert.ok(next,'Expected another background poll');timers.delete(next[0]);return next[1]();},filter:(key,value)=>root.all().find(x=>x.dataset.filter===key).choose(value),tab:value=>root.querySelector('nav').change(value),
    links:()=>root.all().filter(x=>x.tag==='a'), buttons:()=>root.all().filter(x=>x.tag==='button')};
}
const decoded = anchor => Object.fromEntries(new URLSearchParams(anchor.href.split('?')[1]));

test('overview uses one server report, exact attention IDs and score denominator', async()=>{
  const ui=harness({tab:'overview'}); await tick();
  assert.equal(ui.calls.reads.length,1);
  assert.match(ui.root.textContent,/From 1 scores/);
  assert.doesNotMatch(ui.root.textContent,/How metrics are calculated|saved completed score is included/);
  const link=ui.links().find(x=>x.textContent==='Open conversations to review');
  assert.deepEqual(JSON.parse(decoded(link).conversationIds),['c1','c2']);
  assert.equal(decoded(link).checklistId,'cl2');
  ui.buttons().find(x=>x.textContent==='Ask assistant').fire('click');
  assert.equal(ui.calls.opens[0].context,'workspace');
  assert.equal(ui.calls.scopes.at(-1).fingerprint,'snapshot-1');
  ui.cleanup(); assert.equal(Object.keys(ui.events).length,0);
});

test('criteria are dynamic and drill down to the actual below-target records',async()=>{
  const ui=harness({tab:'quality'}); await tick();
  assert.match(ui.root.textContent,/Custom current criterion/);
  assert.match(ui.root.textContent,/Original section/);
  const cells=ui.links().filter(x=>x.class==='da-ins-cell');
  assert.equal(cells.length,4);
  assert.match(cells[0].hover().map(x=>x.textContent).join(''),/N\/A: 1. Missing: 1/);
  assert.equal(cells[0].all().filter(x=>x.tag==='i').length,2);
  for(const cell of cells) { assert.deepEqual(JSON.parse(decoded(cell).conversationIds),['c2']); assert.equal(decoded(cell).checklistId,'cl2'); assert.equal(decoded(cell).status,undefined); }
  ui.cleanup();
});

test('topic table keeps exact outcome cohorts and selected version without expanded technical detail',async()=>{
  const ui=harness({tab:'topics'},r=>{r.scope.filters.languages=['RU'];return r;}); await tick();
  const resolved=ui.links().find(x=>x.class==='da-ins-topic-outcome is-resolved');
  assert.equal(resolved.title,'Resolved 1 of 2 conversations with a known outcome (50%)');
  assert.deepEqual(JSON.parse(decoded(resolved).conversationIds),['c1']);
  const topic=ui.links().find(x=>x.class==='da-ins-topic-name');
  assert.deepEqual(JSON.parse(decoded(topic).conversationIds),['c1','c2']);assert.equal(decoded(topic).checklistId,'cl2');assert.equal(decoded(topic).languages,'RU');
  const unknown=ui.links().find(x=>x.class==='da-ins-topic-stat is-unknown');
  assert.deepEqual(JSON.parse(decoded(unknown).conversationIds),['c3']);
  assert.equal(ui.root.querySelectorAll('details').length,0);
  assert.match(ui.root.textContent,/Rare topics \(1\)/);assert.match(ui.root.textContent,/Without an identified topic: 1/);
  ui.buttons().find(x=>x.textContent==='Identify topics (1)').fire('click'); await tick();
  assert.deepEqual(ui.calls.analyzes,[['c1','c2','c3']]);
  ui.cleanup();
});

test('operator detail has compact criteria and source links without expansion or repeated prose',async()=>{
  const ui=harness({tab:'operators',operator:'name:A'}); await tick();
  assert.match(ui.root.textContent,/What needs attention/);
  assert.match(ui.root.textContent,/Agent conversations/);
  assert.doesNotMatch(ui.root.textContent,/Small sample|Lost points|same name may refer/);
  assert.equal(ui.root.querySelectorAll('details').length,0);
  assert.equal(decoded(ui.links().find(x=>x.href.startsWith('#/c/c1'))).evaluation,'saved-ready-c1');
  const criterion=ui.links().find(x=>x.textContent==='Show conversations (1)');
  assert.deepEqual(JSON.parse(decoded(criterion).conversationIds),['c2']);
  ui.buttons().find(x=>x.textContent==='Ask assistant').fire('click');
  assert.deepEqual(ui.calls.scopes.at(-1).filters.conversationIds,['c1','c2','c3']);
  ui.cleanup();
});

test('period drilldown replaces current dates with previous dates and exact IDs',async()=>{
  const ui=harness({tab:'overview'},r=>{r.scope.filters.dateFrom='2026-11-03';r.scope.filters.dateTo='2026-11-04';
    r.periodComparison={available:true,deltaScore:8,current:{dateFrom:'2026-11-03',dateTo:'2026-11-04',count:7,evaluated:5,scoredCount:5,avgScore:88,conversationIds:['c1']},
      previous:{dateFrom:'2026-11-01',dateTo:'2026-11-02',count:8,evaluated:6,scoredCount:6,avgScore:80,conversationIds:['old1','old2']}};return r;}); await tick();
  const prior=ui.links().find(x=>x.textContent==='Evaluated 6 of 8');
  assert.equal(decoded(prior).dateFrom,'2026-11-01');assert.equal(decoded(prior).dateTo,'2026-11-02');
  assert.deepEqual(JSON.parse(decoded(prior).conversationIds),['old1','old2']);
  assert.match(ui.root.textContent,/Average score change: \+8 points/);
  ui.cleanup();
});

test('invalid date ranges do not fetch; applying valid scope preserves exact imported IDs',async()=>{
  const ui=harness({conversationIds:'["c1"]'},r=>{r.scope.filters.conversationIds=['c1'];return r;}); await tick();
  const inputs=ui.root.querySelectorAll('input'),apply=ui.buttons().find(x=>x.textContent==='Apply');
  inputs[0].value='05.11.2026';inputs[1].value='01.11.2026';apply.fire('click');
  assert.equal(ui.calls.reads.length,1);assert.equal(inputs[1]['aria-invalid'],'true');
  inputs[1].value='08.11.2026';apply.fire('click');ui.filter('channels','voice call');ui.filter('languages','KZ');
  ui.buttons().find(x=>x.textContent==='Version 2').fire('click');
  ui.buttons().find(x=>x.role==='option'&&x.textContent.startsWith('Version 1')).fire('click');await tick();
  const sent=ui.calls.reads.at(-1);assert.deepEqual(sent.conversationIds,['c1']);assert.deepEqual(sent.languages,['KZ']);assert.deepEqual(sent.channels,['voice call']);assert.equal(sent.checklistId,'cl1');assert.equal(sent.dateFrom,'2026-11-05');
  ui.cleanup();
});

test('another scope topic job is labeled and cannot start a duplicate',async()=>{
  const ui=harness({tab:'topics'},r=>{r.topics.job={status:'running',selectedCount:0};return r;});await tick();
  assert.match(ui.root.textContent,/Other conversations are being analyzed/);
  assert.equal(ui.buttons().find(x=>x.textContent==='Identifying topics…').disabled,true);
  assert.equal(ui.calls.analyzes.length,0);ui.cleanup();
});

test('empty selected IDs remain empty and do not start analysis',async()=>{
  const ui=harness({conversationIds:'[]'},r=>{r.scope.total=0;r.scope.conversationIds=[];r.scope.filters.conversationIds=[];return r;});await tick();
  assert.deepEqual(ui.calls.reads[0].conversationIds,[]);assert.match(ui.root.textContent,/No conversations found/);
  assert.equal(ui.calls.analyzes.length,0);ui.cleanup();
});

test('late response cannot overwrite a newer selected scope or a disposed view',async()=>{
  const resolvers=[];const ui=harness({},x=>x,()=>new Promise(resolve=>resolvers.push(resolve)));
  ui.filter('languages','KZ');
  const second=copy(ui.report);second.sourceHash='second';second.scope.filters.languages=['KZ'];
  resolvers[1](second);await tick();resolvers[0](ui.report);await tick();
  assert.equal(ui.calls.scopes.at(-1).fingerprint,'second');assert.deepEqual(ui.calls.scopes.at(-1).filters.languages,['KZ']);
  ui.events['da:appeals-changed']();ui.cleanup();resolvers[2](ui.report);await tick();
  assert.equal(ui.calls.scopes.at(-1).fingerprint,'second');
});

test('quality tab retains grouped matrix, answer bars, score histogram, gross sources and appeals',async()=>{
  const ui=harness({tab:'quality'},r=>{delete r.scope.filters.languages;return r;});await tick();
  assert.ok(ui.root.all().some(x=>x.class==='da-ins-matrix'));
  assert.ok(ui.root.all().some(x=>x.class==='da-ins-sec'&&x.textContent==='Original section'));
  assert.ok(ui.root.all().some(x=>x.class==='da-ins-weak'));
  const histogram=ui.root.all().find(x=>x.class==='da-ins-hist');
  assert.equal(histogram.children.length,4);
  assert.match(histogram.props['aria-label'],/85–100: 1/);
  assert.ok(ui.links().some(x=>x.class==='da-ins-conv'&&decoded(x).evaluation==='saved-ready-c1'));
  const appeals=ui.root.all().find(x=>x.class==='da-ins-legend');
  assert.match(appeals.textContent,/Score confirmed1Score changed0Under review2/);
  assert.deepEqual(JSON.parse(decoded(appeals.all().find(x=>x.tag==='a'&&x.textContent==='1')).conversationIds),['c2']);
  ui.cleanup();
});

test('styled calendar and version preview replace native select/date controls',async()=>{
  const ui=harness();await tick();
  assert.equal(ui.root.querySelectorAll('select').length,0);
  assert.ok(ui.root.querySelectorAll('input').every(x=>x.type==='text'&&x.class==='da-input'));
  ui.buttons().find(x=>x.class==='da-dd-btn'&&x.textContent==='All time').fire('click');
  assert.ok(ui.buttons().filter(x=>x.class?.includes('da-ins-calendar-day')).length>=28);
  ui.buttons().find(x=>x.class==='da-dd-btn'&&x.textContent==='Version 2').fire('click');
  const prior=ui.buttons().find(x=>x.role==='option'&&x.textContent.startsWith('Version 1'));
  assert.match(prior.textContent,/Previous criterion preview/);
  assert.doesNotMatch(prior.textContent,/Old rules|v1/);
  ui.cleanup();
});

test('default tab is general summary and removed explanatory blocks stay absent',async()=>{
  const ui=harness();await tick();
  assert.ok(ui.root.all().some(x=>x.dataset.tab==='overview'));
  assert.ok(ui.root.all().some(x=>x.class==='da-ins-dashboard'));
  assert.equal(ui.root.all().filter(x=>x.class==='da-ins-basis').length,0);
  ui.tab('topics');
  assert.doesNotMatch(ui.root.textContent,/Resolution rate uses known outcomes|paid model requests|These topics occur fewer|How metrics are calculated/);
  ui.cleanup();
});

test('operator list paginates locally at 10, 25 and 50 rows and preserves scoped links',async()=>{
  const ui=harness({tab:'operators'},r=>{
    r.scope.filters.languages=['KZ'];
    r.operators=Array.from({length:55},(_,i)=>({...r.operators[0],id:'operator:'+i,name:'Agent '+i}));return r;
  });await tick();
  const rows=()=>ui.root.all().filter(x=>x.dataset.operator);
  assert.equal(rows().length,10);
  ui.buttons().find(x=>x.dataset['page-action']==='operators-next').fire('click');
  assert.equal(rows()[0].dataset.operator,'operator:10');
  assert.equal(ui.calls.reads.length,1);
  const href=ui.links().find(x=>x.textContent==='Agent 10').href;
  assert.equal(decoded({href}).operator,'operator:10');assert.equal(decoded({href}).languages,'KZ');assert.equal(decoded({href}).opPage,'2');
  const row=rows()[0];row.fire('keydown',{key:'Enter',target:row,currentTarget:row});
  assert.equal(ui.calls.hashes.at(-1),href);
  ui.root.all().find(x=>x.dataset.pagination==='operators').choose(25);
  assert.equal(rows().length,25);
  ui.root.all().find(x=>x.dataset.pagination==='operators').choose(50);
  assert.equal(rows().length,50);
  assert.equal(new URLSearchParams(ui.calls.urls.at(-1).split('?')[1]).get('opSize'),'50');
  assert.equal(ui.calls.reads.length,1);ui.cleanup();
});

test('operator conversation pagination keeps saved evaluation links and a filter-preserving back link',async()=>{
  const ui=harness({tab:'operators',operator:'name:A',opPage:'2',opSize:'25'},r=>{
    r.scope.filters.channels=['voice call'];
    r.conversations=Array.from({length:31},(_,i)=>({...r.conversations[0],conversationId:'call'+i,number:i+1,evaluationId:'saved'+i,channel:'voice call'}));
    r.operators[0].conversationIds=r.conversations.map(x=>x.conversationId);r.operators[0].count=31;return r;
  });await tick();
  const rows=()=>ui.root.all().filter(x=>x.dataset.conversation);
  assert.equal(rows().length,10);
  ui.buttons().find(x=>x.dataset['page-action']==='conversations-next').fire('click');
  assert.equal(rows()[0].dataset.conversation,'call10');
  assert.equal(decoded(ui.links().find(x=>x.href.startsWith('#/c/call10'))).evaluation,'saved10');
  ui.root.all().find(x=>x.dataset.pagination==='conversations').choose(25);
  assert.equal(rows().length,25);
  const back=decoded(ui.links().find(x=>x.textContent==='All agents'));
  assert.equal(back.operator,undefined);assert.equal(back.opPage,'2');assert.equal(back.opSize,'25');assert.equal(back.channels,'voice call');
  assert.equal(ui.calls.reads.length,1);ui.cleanup();
});

test('unknown operator key shows a recoverable state without widening the scope',async()=>{
  const ui=harness({tab:'operators',operator:'missing-key',conversationIds:'["c1"]'},r=>{r.scope.filters.conversationIds=['c1'];return r;});await tick();
  assert.match(ui.root.textContent,/This agent has no conversations matching these filters/);
  assert.deepEqual(JSON.parse(decoded(ui.links().find(x=>x.textContent==='All agents')).conversationIds),['c1']);
  assert.equal(ui.root.all().filter(x=>x.dataset.operator).length,0);ui.cleanup();
});

test('active topic polls update only progress and preserve the quality matrix, filters and reading position',async()=>{
  const ui=harness({tab:'quality'},r=>{r.topics.job={status:'running',phase:'running',selectedCount:3,total:3,processed:2,failed:0};return r;});await tick();
  const matrix=ui.root.querySelector('.da-ins-matrix'),wrap=ui.root.querySelector('.da-ins-matrix-wrap'),progress=ui.root.querySelector('.da-ins-topic-progress');
  wrap.scrollLeft=92;ui.window.scrollY=520;
  const date=ui.root.querySelectorAll('input')[0];date.value='07.11.2026';date.focus();
  const version=ui.buttons().find(x=>x.class==='da-dd-btn'&&x.textContent==='Version 2');version.fire('click');
  const versionOptions=ui.root.querySelector('.da-ins-version-popover').children;
  const updated=copy(ui.report);updated.sourceHash='topic-record-added';updated.topics.analyzed=3;updated.topics.pending=0;updated.coverage.evaluated=3;updated.criteria[0].avgFraction=1;
  ui.setReport(updated);await ui.poll();
  assert.equal(ui.root.querySelector('.da-ins-matrix'),matrix);
  assert.equal(ui.root.querySelector('.da-ins-matrix-wrap').scrollLeft,92);
  assert.match(ui.root.textContent,/Evaluated 2 of 3 conversations/);
  assert.match(progress.textContent,/Identifying topics…3 of 3/);
  assert.equal(progress.hidden,false);assert.equal(ui.root.querySelector('.da-ins-topic-spinner').hidden,false);
  assert.equal(date.value,'07.11.2026');assert.equal(ui.document.activeElement,date);
  assert.equal(version.getAttribute('aria-expanded'),'true');assert.equal(ui.root.querySelector('.da-ins-version-popover').children,versionOptions);
  assert.equal(ui.calls.scopes.length,1);assert.equal(ui.calls.scrolls.length,0);assert.equal(ui.window.scrollY,520);
  assert.equal(ui.calls.analyzes.length,0);ui.cleanup();assert.equal(ui.timers.size,0);
});

test('topic completion refreshes the table once while retaining source-link focus and scroll',async()=>{
  const ui=harness({tab:'topics'},r=>{r.topics.job={status:'running',phase:'running',selectedCount:3,total:3,processed:2};return r;});await tick();
  const row=ui.root.all().find(x=>x.dataset.topic==='topic-a');
  const source=row.all().find(x=>x.class==='da-ins-topic-name');source.focus();ui.window.scrollY=735;
  const updated=copy(ui.report);updated.sourceHash='topic-complete';updated.topics.analyzed=3;updated.topics.pending=0;updated.topics.job={status:'done',phase:'done',total:3,processed:3};
  updated.topics.rows[0].topic='Updated topic';ui.setReport(updated);await ui.poll();
  const finished=ui.root.all().find(x=>x.dataset.topic==='topic-a');
  assert.notEqual(finished,row);assert.match(finished.textContent,/Updated topic/);
  assert.notEqual(ui.document.activeElement,source);assert.equal(ui.document.activeElement.href,source.href);
  assert.equal(ui.window.scrollY,735);assert.equal(ui.calls.scrolls.length,1);
  assert.match(ui.root.querySelector('.da-ins-topic-progress').textContent,/Topic analysis finished/);
  assert.equal(ui.root.querySelector('.da-ins-topic-spinner').hidden,true);assert.equal(ui.timers.size,0);
  ui.events['da:appeals-changed']();await tick();
  assert.equal(ui.root.all().find(x=>x.dataset.topic==='topic-a'),finished);assert.equal(ui.calls.scrolls.length,1);
  ui.cleanup();
});

test('background failures keep the operator profile and retry without changing its route or count',async()=>{
  const ui=harness({tab:'operators',operator:'name:A',conversationPage:'2'},r=>{
    r.scope.filters.languages=['KZ'];r.topics.job={status:'running',phase:'running',selectedCount:3};
    r.conversations=Array.from({length:12},(_,i)=>({...r.conversations[0],conversationId:'c'+i,evaluationId:'saved'+i,number:i+1}));
    r.operators[0].conversationIds=r.conversations.map(x=>x.conversationId);return r;
  });await tick();
  const table=ui.root.querySelector('.da-ins-conversations-table'),route=ui.calls.urls.at(-1);
  ui.setReport(new Error('Temporary connection loss'));await ui.poll();
  assert.equal(ui.root.querySelector('.da-ins-conversations-table'),table);assert.doesNotMatch(ui.root.textContent,/Could not load the summary/);
  assert.equal(ui.calls.urls.at(-1),route);assert.equal(ui.timers.size,1);
  const updated=copy(ui.report);updated.sourceHash='more-topics';updated.topics.analyzed=3;ui.setReport(updated);await ui.poll();
  assert.equal(ui.root.querySelector('.da-ins-conversations-table'),table);
  updated.topics.job={status:'done'};ui.setReport(updated);await ui.poll();
  const params=new URLSearchParams(ui.calls.urls.at(-1).split('?')[1]);
  assert.equal(params.get('operator'),'name:A');assert.equal(params.get('conversationPage'),'2');assert.equal(params.get('languages'),'KZ');
  assert.equal(ui.calls.analyzes.length,0);ui.cleanup();
});

test('a new cohort applies during topic work and a queued job keeps its actual progress separate',async()=>{
  const ui=harness({tab:'quality'},r=>{r.topics.job={status:'running',phase:'queued',selectedCount:3};return r;});await tick();
  const matrix=ui.root.querySelector('.da-ins-matrix');
  assert.match(ui.root.querySelector('.da-ins-topic-progress').textContent,/Topic analysis queued2 of 3/);
  const updated=copy(ui.report);updated.sourceHash='new-cohort';updated.scope.total=4;updated.scope.conversationIds.push('c4');ui.setReport(updated);await ui.poll();
  assert.notEqual(ui.root.querySelector('.da-ins-matrix'),matrix);assert.match(ui.root.textContent,/Evaluated 2 of 4 conversations/);
  assert.match(ui.root.querySelector('.da-ins-topic-progress').textContent,/2 of 4/);
  ui.cleanup();
});

test('a fast failed topic job is shown even when no aggregate hash changed',async()=>{
  const ui=harness({tab:'topics'});await tick();
  const failed=copy(ui.report);failed.topics.job={status:'error',phase:'finished',failed:1,error:'Topic service could not process this record'};ui.setReport(failed);
  ui.buttons().find(x=>x.textContent==='Identify topics (1)').fire('click');await tick();
  assert.match(ui.root.textContent,/Topic service could not process this record/);
  assert.match(ui.root.querySelector('.da-ins-topic-progress').textContent,/Topic analysis finished with errors/);
  assert.equal(ui.calls.analyzes.length,1);assert.equal(ui.root.querySelector('.da-ins-topic-spinner').hidden,true);
  ui.cleanup();
});

test('a background event superseding a filter load still applies the requested report',async()=>{
  const resolvers=[];const ui=harness({},r=>{r.topics.job={status:'running',phase:'running',selectedCount:3};return r;},()=>new Promise(resolve=>resolvers.push(resolve)));
  resolvers[0](copy(ui.report));await tick();
  ui.filter('languages','KZ');assert.match(ui.root.textContent,/Loading summary…/);
  ui.events['da:appeals-changed']();
  const updated=copy(ui.report);updated.scope.filters.languages=['KZ'];updated.sourceHash='selected-language';
  resolvers[2](updated);await tick();resolvers[1](copy(ui.report));await tick();
  assert.doesNotMatch(ui.root.textContent,/Loading summary…/);assert.ok(ui.root.querySelector('.da-ins-dashboard'));
  assert.equal(ui.calls.scopes.at(-1).fingerprint,'selected-language');assert.deepEqual(ui.calls.scopes.at(-1).filters.languages,['KZ']);
  assert.equal(new URLSearchParams(ui.calls.urls.at(-1).split('?')[1]).get('languages'),'KZ');ui.cleanup();
});

test('a temporarily unreadable submitted job keeps its running status until the report is known',async()=>{
  const ui=harness({tab:'topics'});await tick();ui.setReport(new Error('Connection lost'));
  ui.buttons().find(x=>x.textContent==='Identify topics (1)').fire('click');await tick();
  assert.equal(ui.root.querySelector('.da-ins-topic-spinner').hidden,false);assert.match(ui.root.querySelector('.da-ins-topic-progress').textContent,/Identifying topics/);
  assert.doesNotMatch(ui.root.querySelector('.da-ins-topic-progress').textContent,/finished/);
  assert.equal(ui.buttons().find(x=>x.dataset.topicAction==='start').disabled,true);assert.equal(ui.timers.size,1);ui.cleanup();
});

test('topic summary partitions the whole filtered cohort including pending and unidentified records',async()=>{
  const ui=harness({tab:'topics'},r=>{
    r.scope.filters.dateFrom='2026-11-01';r.scope.filters.dateTo='2026-11-08';r.scope.filters.channels=['agent chat'];
    r.scope.total=5;r.scope.conversationIds=['c1','c2','c3','c4','c5'];
    r.conversations.push({...r.conversations[2],conversationId:'c4',number:4},{...r.conversations[0],conversationId:'c5',number:5});
    Object.assign(r.topics,{analyzed:4,pending:1,unidentified:1});
    Object.assign(r.topics.rows[0],{count:3,resolved:2,known:3,resolutionRate:2/3,isRare:false,conversationIds:['c1','c2','c5'],resolvedIds:['c1','c5']});return r;
  });await tick();
  const summary=ui.root.querySelector('.da-ins-topic-summary'),stats=summary.querySelectorAll('a');
  assert.deepEqual(stats.map(x=>JSON.parse(decoded(x).conversationIds)),[['c1','c2','c3','c4','c5'],['c1','c5'],['c2'],['c3','c4']]);
  assert.deepEqual(summary.querySelectorAll('b').map(x=>x.textContent),['5','2','1','2']);
  const bar=summary.querySelector('.da-ins-topic-proportions');
  assert.deepEqual(bar.querySelectorAll('i').map(x=>x.style.width),['40%','20%','40%']);
  const missing=ui.links().find(x=>x.class==='da-ins-topic-unassigned');
  assert.equal(missing.textContent,'Without an identified topic: 2');assert.deepEqual(JSON.parse(decoded(missing).conversationIds),['c3','c4']);
  for(const link of [...stats,missing,...ui.links().filter(x=>x.class?.startsWith('da-ins-topic-outcome'))]) {
    const query=decoded(link);assert.equal(query.checklistId,'cl2');assert.equal(query.dateFrom,'2026-11-01');assert.equal(query.dateTo,'2026-11-08');assert.equal(query.channels,'agent chat');
  }
  ui.cleanup();
});

function manyTopics(report) {
  const base=report.conversations[0];report.conversations=[];
  report.topics.rows=Array.from({length:18},(_,i)=>{
    const count=i<12?3:1,states=Array.from({length:count},(_,j)=>i===2||i===1&&j===0?'unresolved':i===0||i===17?'unknown':'resolved');
    const ids=states.map((status,j)=>{const id=`topic-${i}-conversation-${j}`;report.conversations.push({...base,conversationId:id,number:report.conversations.length+1,topicId:'topic-'+i,topic:'Topic '+String(i).padStart(2,'0'),resolutionStatus:status});return id;});
    const groups=Object.fromEntries(['resolved','unresolved','unknown'].map(key=>[key,ids.filter((_,j)=>states[j]===key)]));
    const known=groups.resolved.length+groups.unresolved.length;
    return {...report.topics.rows[0],id:'topic-'+i,topic:'Topic '+String(i).padStart(2,'0'),count,conversationIds:ids,
      ...Object.fromEntries(Object.entries(groups).flatMap(([key,values])=>[[key,values.length],[key+'Ids',values]])),
      known,resolutionRate:known?groups.resolved.length/known:null,isRare:count<3};
  });
  report.scope.conversationIds=report.conversations.map(row=>row.conversationId);report.scope.total=report.conversations.length;
  report.topics.analyzed=report.scope.total;report.topics.pending=0;report.topics.unidentified=0;return report;
}

test('topic table is capped at ten rows and sorting, rare filter and page state remain local',async()=>{
  const ui=harness({tab:'topics'},manyTopics);await tick();
  const rows=()=>ui.root.all().filter(x=>x.dataset.topic),order=()=>ui.root.all().find(x=>x.dataset.topicSort==='true');
  assert.equal(rows().length,10);assert.equal(rows()[0].dataset.topic,'topic-2');assert.equal(rows()[1].dataset.topic,'topic-1');
  assert.equal(ui.root.all().filter(x=>x.dataset.pagination==='topics').length,0);
  ui.buttons().find(x=>x.dataset.pageAction==='topics-next').fire('click');
  assert.equal(rows().length,8);assert.equal(new URLSearchParams(ui.calls.urls.at(-1).split('?')[1]).get('topicPage'),'2');
  order().choose('count');assert.equal(rows()[0].dataset.topic,'topic-0');assert.equal(rows().length,10);
  let query=new URLSearchParams(ui.calls.urls.at(-1).split('?')[1]);assert.equal(query.get('topicSort'),'count');assert.equal(query.get('topicPage'),null);
  ui.buttons().find(x=>x.dataset.topicAction==='rare').fire('click');assert.equal(rows().length,6);
  assert.ok(rows().every(x=>Number(x.dataset.topic.slice(6))>=12));assert.equal(ui.buttons().find(x=>x.dataset.topicAction==='rare').getAttribute('aria-pressed'),'true');
  query=new URLSearchParams(ui.calls.urls.at(-1).split('?')[1]);assert.equal(query.get('rareTopics'),'1');
  assert.equal(ui.root.querySelector('.da-ins-topic-summary').querySelector('b').textContent,'42');
  ui.tab('overview');ui.tab('topics');assert.equal(rows().length,6);
  assert.equal(ui.calls.reads.length,1);assert.equal(ui.calls.analyzes.length,0);ui.cleanup();
});

test('active topic polling preserves the current topic page, table, sort and focused source',async()=>{
  const ui=harness({tab:'topics',topicPage:'2',topicSort:'name'},r=>{manyTopics(r);r.topics.job={status:'running',phase:'running',selectedCount:42,total:42,processed:40};return r;});await tick();
  const table=ui.root.querySelector('.da-ins-topics-table'),summary=ui.root.querySelector('.da-ins-topic-summary');
  const source=table.querySelector('a');source.focus();ui.window.scrollY=340;
  const next=copy(ui.report);next.sourceHash='one-more-topic';next.topics.job.processed=41;ui.setReport(next);await ui.poll();
  assert.equal(ui.root.querySelector('.da-ins-topics-table'),table);assert.equal(ui.root.querySelector('.da-ins-topic-summary'),summary);
  assert.equal(ui.document.activeElement,source);assert.equal(ui.calls.scrolls.length,0);
  assert.match(ui.root.textContent,/Showing 11–18 of 18/);
  const query=new URLSearchParams(ui.calls.urls.at(-1).split('?')[1]);assert.equal(query.get('topicPage'),'2');assert.equal(query.get('topicSort'),'name');
  ui.cleanup();
});

test('a rare-only scope with no rare topics offers a return to all topics and clamps stale pages',async()=>{
  const ui=harness({tab:'topics',rareTopics:'1',topicPage:'99'},r=>{r.topics.rows[0].isRare=false;return r;});await tick();
  assert.match(ui.root.textContent,/No rare topics in this selection/);
  assert.equal(new URLSearchParams(ui.calls.urls.at(-1).split('?')[1]).get('topicPage'),null);
  const toggle=ui.buttons().find(x=>x.dataset.topicAction==='rare');assert.equal(toggle.disabled,undefined);toggle.fire('click');
  assert.equal(ui.root.all().filter(x=>x.dataset.topic).length,1);assert.equal(ui.calls.reads.length,1);ui.cleanup();
});
