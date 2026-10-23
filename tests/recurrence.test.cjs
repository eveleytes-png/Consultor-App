const assert=require('node:assert/strict');
const {activitiesOnDate}=require('../dist/home.js');
const base={id:'r',date:'2026-01-31',time:'09:30',description:'Recurrente',completed:false};
for(const [repeat,yes,no] of [['daily','2026-02-01','2026-01-30'],['weekly','2026-02-07','2026-02-06'],['monthly','2026-02-28','2026-02-27'],['yearly','2027-01-31','2027-01-30']]){
 const record={...base,repeat};const before=JSON.stringify(record);
 assert.equal(activitiesOnDate([record],yes).length,1,repeat);assert.equal(activitiesOnDate([record],no).length,0,repeat);assert.equal(JSON.stringify(record),before);
}
const leap={...base,date:'2024-02-29',repeat:'yearly'};
assert.equal(activitiesOnDate([leap],'2025-02-28').length,1);
assert.equal(activitiesOnDate([leap],'2028-02-29').length,1);
const done={...base,repeat:'daily',completedDates:['2026-02-01']};
assert.equal(activitiesOnDate([done],'2026-02-01')[0].completed,true);
assert.equal(activitiesOnDate([done],'2026-02-02')[0].completed,false);
assert.deepEqual(activitiesOnDate([{...base,completed:true}],'2026-02-01'),[]);
console.log('PASS: daily/weekly/monthly/yearly recurrence, month ends, leap years, independent completion, no mutations.');
