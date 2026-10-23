const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=[
 {id:'a',date:'2026-10-22',time:'09:00',description:'Primera',completed:false},
 {id:'b',date:'2026-10-22',time:'09:00',description:'Segunda',completed:true},
 {id:'c',date:'2026-10-22',time:'09:15',description:'<img src=x onerror=alert(1)>',completed:false},
 {id:'d',date:'2026-10-22',time:'09:40',description:'Cuarta',completed:false},
 {id:'late',date:'2026-10-23',time:'23:59',description:'Última del día',completed:false},
 {id:'early',date:'2026-10-19',time:'00:00',description:'Primera hora',completed:false},
 {id:'outside',date:'2026-11-10',time:'12:00',description:'Otro mes',completed:false}
];
const ctx=vm.createContext({Intl,Date,todayKey:'2026-10-22',page:'agenda',activities:rows,escapeHtml,icon:()=>''});
vm.runInContext(fs.readFileSync('dist/calendar.js','utf8').replace(/\r\n/g,'\n').split('\n{\n')[0],ctx);
const run=s=>vm.runInContext(s,ctx),before=JSON.stringify(rows);
run(`calendarSelected='2026-10-22';calendarView='month';`);
const monthly=run('agendaScreen()');
assert.ok(!monthly.includes('agenda-breadcrumb'));
assert.ok(!monthly.includes('calendar-activities'));
assert.equal((monthly.match(/data-calendar-date=/g)||[]).length,35);
assert.ok(monthly.includes('aria-haspopup="dialog"'));
assert.ok(monthly.includes('calendar-access-message'));
assert.ok(!monthly.includes('data-activity-id='),'Monthly details belong only in the existing floating dialog');
run(`calendarView='week'`);
const weekly=run('agendaScreen()');
assert.ok(weekly.includes('calendar-week-scroll'));
assert.ok(!weekly.includes('calendar-activities'));
assert.equal((weekly.match(/data-calendar-date=/g)||[]).length,7);
assert.equal((weekly.match(/data-activity-id=/g)||[]).length,6);
assert.ok(!weekly.includes('data-activity-id="outside"'));
assert.ok(weekly.includes('23:59')&&weekly.includes('00:00'));
assert.ok(weekly.includes('&lt;img src=x onerror=alert(1)&gt;'));
assert.ok(!weekly.includes('<img src=x'));
assert.equal(run(`calendarWeekEntries('2026-10-22').map(e=>e.record.id).join(',')`),'a,b,c,d');
assert.equal(run(`calendarWeekEntries('2026-10-22').map(e=>e.lanes).join(',')`),'3,3,3,3');
assert.equal(run(`calendarWeekEntries('2026-10-22').map(e=>e.lane).join(',')`),'0,1,2,0');
assert.equal(run(`calendarWeekEntries('2026-10-23')[0].lanes`),1);
assert.equal(run(`calendarMinutes('23:59')`),1439);
assert.equal(run(`calendarMinutes('00:00')`),0);
assert.equal(JSON.stringify(rows),before,'Presentation must never change activity data, dates, times or states');
console.log('PASS: no breadcrumb or activity list below either view; monthly dialog hooks; seven weekly columns, midnight/late events, collision lanes, completion state, escaped descriptions, access-message target and unchanged activity records.');
