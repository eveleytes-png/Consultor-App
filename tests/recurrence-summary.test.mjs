import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDailySummary} from '../lib/daily-summary.mjs';
test('Recurring activities are included in daily summaries and completed independently',()=>{
 const activities=[{id:'r',date:'2026-10-01',time:'09:00',description:'Recurrente',repeat:'daily',completedDates:['2026-10-22'],completed:false}];
 const summary=buildDailySummary({rows:[],activities,changes:{additions:0,removals:0},now:new Date('2026-10-23T00:00:00Z')});
 assert.equal(summary.today.length,0);assert.deepEqual(summary.tomorrow,[{time:'09:00',description:'Recurrente'}]);
 assert.deepEqual(activities[0].completedDates,['2026-10-22']);
});

test('Deleted recurring dates and following dates are omitted from notifications',()=>{
 const base={id:'r',date:'2026-10-01',time:'09:00',description:'Recurrente',repeat:'daily',completed:false};
 const build=record=>buildDailySummary({rows:[],activities:[record],changes:{additions:0,removals:0},now:new Date('2026-10-23T00:00:00Z')});
 assert.equal(build({...base,excludedDates:['2026-10-22']}).today.length,0);
 assert.equal(build({...base,excludedDates:['2026-10-22']}).tomorrow.length,1);
 assert.equal(build({...base,repeatBefore:'2026-10-22'}).today.length,0);
 assert.equal(build({...base,repeatBefore:'2026-10-22'}).tomorrow.length,0);
});
