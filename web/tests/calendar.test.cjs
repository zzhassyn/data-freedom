const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({window:{DA:{i18n:{addMessages(){}}}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/ui.js'),'utf8'),context);
const dates=context.window.DA.calendarDates;

test('calendar text dates accept ISO and display dates without timezone conversion',()=>{
  assert.equal(dates.parse('29.02.2024'),'2024-02-29');
  assert.equal(dates.parse(' 2026-11-08 '),'2026-11-08');
  assert.equal(dates.format('2026-11-08'),'08.11.2026');
  assert.equal(dates.parse('31.12.2026'),'2026-12-31');
  assert.equal(dates.parse('01.01.2027'),'2027-01-01');
  assert.equal(dates.parse('01.01.0099'),'0099-01-01');
  assert.equal(dates.format('0099-01-01'),'01.01.0099');
});

test('calendar date parser keeps empty bounds and rejects impossible or incomplete dates',()=>{
  assert.equal(dates.parse(''), '');
  assert.equal(dates.parse('  '), '');
  assert.equal(dates.format(''), '');
  for(const value of ['29.02.2023','31.04.2026','00.11.2026','01.13.2026','01.01.0000','8.11.2026','01.','abc','2026-02-30'])
    assert.equal(dates.parse(value),null,value);
});
