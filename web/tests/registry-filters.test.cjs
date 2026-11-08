const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = vm.createContext({ window: {}, URLSearchParams });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/filters.js'), 'utf8'), ctx);
const F = ctx.window.DA.registryFilters;
const plain = value => JSON.parse(JSON.stringify(value));

test('score boundaries preserve blank, zero and decimals and reject impossible ranges', () => {
  assert.equal(F.normalize({scoreFrom: ''}).scoreFrom, null);
  assert.equal(F.normalize({scoreTo: ' '}).scoreTo, null);
  assert.equal(F.normalize({scoreFrom: '0'}).scoreFrom, 0);
  assert.equal(F.normalize({scoreFrom: '61,5'}).scoreFrom, 61.5);
  assert.equal(F.validate({scoreFrom: 0, scoreTo: 100}).valid, true);
  assert.equal(F.validate({scoreFrom: 79, scoreTo: 79}).valid, true);
  for (const score of [-1, 101, 'abc', true, Infinity, '1e2']) assert.equal(F.validate({scoreFrom: score}).valid, false);
  assert.equal(F.validate({scoreFrom: 50, scoreTo: 40}).errors[0].code, 'scoreOrder');
  assert.equal(F.toQuery({scoreFrom: 0}).scoreFrom, '0');
  assert.equal(Object.hasOwn(F.toQuery({scoreFrom: ''}), 'scoreFrom'), false);
});

test('date validation rejects impossible dates and reversed intervals', () => {
  assert.equal(F.validate({dateFrom:'2024-02-29',dateTo:'2024-02-29',timezoneOffsetMinutes:-300}).valid, true);
  for(const date of ['2023-02-29','2024-04-31','2024-2-29','0000-01-01','today']) assert.equal(F.validate({dateFrom:date}).valid, false, date);
  assert.equal(F.validate({dateFrom:'2026-11-08',dateTo:'2026-11-07'}).errors[0].code, 'dateOrder');
  for(const offset of [-841,841,1.5,'bad']) assert.equal(F.validate({timezoneOffsetMinutes:offset}).valid, false);
  assert.equal(F.toQuery({dateFrom:'2026-11-08',timezoneOffsetMinutes:-300}).timezoneOffsetMinutes, '-300');
  assert.equal(Object.hasOwn(F.toQuery({timezoneOffsetMinutes:-300}), 'timezoneOffsetMinutes'), false);
});

test('exact IDs with punctuation roundtrip losslessly and empty selection is restrictive', () => {
  const ids=['one,two','space and + плюс','?/[]','#quote"'];
  const input = {q:'валюта + ?',conversationIds:ids,scoreTo:0,languages:['RU','KZ'],channels:['agent chat'],appealStatus:['none'],checklistId:'cl/v2'};
  const url = F.href(input);
  const output = F.readQuery(new URLSearchParams(url.slice(url.indexOf('?')+1)));
  assert.deepEqual(plain(output.conversationIds),ids);
  assert.equal(output.q,input.q);
  assert.equal(output.scoreTo,0);
  assert.equal(output.checklistId,'cl/v2');
  assert.deepEqual(plain(F.readQuery({conversationIds:'[]'}).conversationIds),[]);
  assert.equal(F.toQuery({conversationIds:[]}).conversationIds,'[]');
  assert.equal(Object.hasOwn(F.toQuery({}), 'conversationIds'), false);
  assert.equal(F.normalize().conversationIds,null);
  assert.equal(F.count({conversationIds:[]}),1);
});

test('malformed IDs, choices and non-array query IDs never widen silently', () => {
  for(const ids of ['[bad','null','"id"',{},[''],[1]]) {
    const filter = F.readQuery({conversationIds:ids});
    assert.equal(F.validate(filter).valid,false);
    assert.throws(()=>F.toQuery(filter));
  }
  assert.equal(F.validate({languages:['ZZ']}).valid,false);
  assert.equal(F.validate({status:['anything']}).valid,false);
  assert.equal(F.validate({appealStatus:['all']}).valid,false);
});

test('legacy links translate into canonical groups and preserve current query fields', () => {
  const result=F.readQuery({lang:'KZ,EN',channel:'calls',state:'gross,review,appeal,failed'});
  assert.deepEqual(plain(result.languages),['KZ','EN']);
  assert.deepEqual(plain(result.channels),['voice call']);
  assert.deepEqual(plain(result.status),['failed']);
  assert.deepEqual(plain(result.attention),['gross','review']);
  assert.deepEqual(plain(result.appealStatus),['open','resolved']);
  assert.equal(F.hasQuery({conversationIds:'[]'}),true);
  assert.equal(F.hasQuery({lang:'RU'}),true);
  assert.equal(F.hasQuery({}),false);
  assert.deepEqual(plain(F.toQuery({languages:['RU','RU'],attention:['gross','gross']})),{languages:'RU',attention:'gross'});
});
