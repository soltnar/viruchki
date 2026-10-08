import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync('script.js', 'utf8');
const context = { state: { detailSort: 'revenue_desc' }, els: { detailGroupBy: {value:'total'}, dateFrom:{value:'2025-12-31'}, dateTo:{value:'2026-01-02'} } };
vm.createContext(context);
vm.runInContext(['groupRowsForTable','sortGroupRows','getPeriodInfo','isoToDate','dateToIso','formatDate','normalizeFilterDate','getWeekStart','addDays'].map((name) => {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\nfunction ', start + 1));
}).join('\n'), context);
const rows = [
  {date:'2025-12-31',group:'A',warehouse:'Kitchen',revenue:100},
  {date:'2026-01-01',group:'A',warehouse:'Kitchen',revenue:200},
  {date:'2026-01-02',group:'A',warehouse:'Bar',revenue:50},
  {date:'2026-01-02',group:'B',warehouse:'Kitchen',revenue:70}
];
const total = context.groupRowsForTable(rows);
assert.equal(total.length, 2);
assert.equal(total[0].total, 350);
assert.equal(total[0].items.reduce((sum,item)=>sum+item.revenue,0),350);
for(const [mode,count] of [['day',4],['month',3],['year',3]]) {
  context.els.detailGroupBy.value = mode;
  const result = context.groupRowsForTable(rows);
  assert.equal(result.length,count);
  assert.equal(result.reduce((sum,item)=>sum+item.total,0),420);
}
console.log('Restaurant totals, warehouse sums and day/month/year groupings preserve selected-period revenue');
