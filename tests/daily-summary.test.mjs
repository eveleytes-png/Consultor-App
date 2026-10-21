import {test} from 'node:test';
import assert from 'node:assert/strict';
import portfolio from '../home.js';
import {buildDailySummary,composeDailyText,localDay} from '../lib/daily-summary.mjs';
const rows=(surveyed,total=100)=>Array.from({length:total},(_,i)=>({e:`m${i}`,accept:'Sí',survey:i<surveyed?'Si':'No'}));
const build=(records,extra={})=>buildDailySummary({rows:records,activities:[],changes:{additions:0,removals:0},now:new Date('2026-10-21T15:00:00Z'),...extra});
for(const [surveyed,target,missing] of [[59,60,1],[60,75,15],[65,75,10],[75,100,25],[90,100,10],[100,null,null]])test(`Meta con ${surveyed}%`,()=>{
  const summary=build(rows(surveyed));assert.equal(summary.nextGoal?.target??null,target);assert.equal(summary.nextGoal?.missing??null,missing);
  assert.deepEqual(summary.metrics,portfolio.computePortfolio(rows(surveyed)));
  assert.equal(summary.maximumReached,surveyed===100);
});
test('No usa el porcentaje redondeado y respeta filtros originales',()=>{
  const result=build([...rows(599,1000),{e:'no',accept:'No'}, {e:'unknown'}, {e:'',accept:'Si',survey:'Si'}]);
  assert.equal(result.metrics.percentage,59.9);assert.equal(result.nextGoal.target,60);assert.equal(result.nextGoal.missing,1);
  assert.equal(result.metrics.rejected,1);assert.equal(result.metrics.total,1002);
  assert.equal(build([]).metrics.percentage,null);assert.equal(build([]).nextGoal,null);
  const rounded=build(rows(5999,10000));assert.equal(rounded.metrics.percentage,59.99);assert.equal(rounded.nextGoal.target,60);assert.equal(rounded.nextGoal.missing,1);
});
test('Agenda nocturna, medianoche y cambio de año sin mutaciones',()=>{
  const activities=[{date:'2026-12-31',time:'09:00',description:'Visita',completed:false},{date:'2026-12-31',time:'10:00',description:'Lista',completed:true},{date:'2027-01-01',time:'08:00',description:'Llamada',completed:false}];
  const before=structuredClone(activities);
  const day=build([],{activities,now:new Date('2026-12-31T22:59:00Z')});assert.equal(day.night,false);assert.equal(day.tomorrow,null);
  const night=build([],{activities,now:new Date('2026-12-31T23:00:00Z')});assert.equal(night.greeting,'Buenas noches');assert.equal(night.today.length,1);assert.equal(night.tomorrow[0].description,'Llamada');assert.deepEqual(activities,before);
  assert.equal(localDay(new Date('2027-01-01T02:59:00Z')).date,'2026-12-31');assert.equal(localDay(new Date('2027-01-01T03:00:00Z')).date,'2027-01-01');
});
test('Contenido, enlaces y persistencia de cambios suministrados',()=>{
  const changes={additions:2,removals:3};
  for(const date of ['2026-10-21','2026-10-22']){
    const summary=build(rows(60),{changes,now:new Date(date+'T15:00:00Z')});
    const text=composeDailyText(summary,'https://example.com');
    assert.ok(text.includes('2 comercios para agregar y 3 para eliminar'));
    assert.ok(text.indexOf('ESTADO DE TU CARTERA')<text.indexOf('PRIORIDAD:'));
    assert.ok(text.includes('?pantalla=sellers&cartera=sin-aceptacion'));assert.ok(text.includes('?pantalla=agenda'));
  }
  assert.ok(!composeDailyText(build([]),'https://example.com').includes('PRIORIDAD:'));
  assert.deepEqual(changes,{additions:2,removals:3});
});
test('Rechaza datos desconocidos y orígenes con credenciales',()=>{
  assert.throws(()=>build([],{changes:null}));assert.throws(()=>build(null));assert.throws(()=>build([],{activities:[{}]}));
  assert.throws(()=>composeDailyText(build([]),'https://user:secret@example.com'));
});
