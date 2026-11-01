import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import clock from '../day-clock.js';
const source=fs.readFileSync(new URL('../day-clock.js',import.meta.url),'utf8');
test('Medianoche de Buenos Aires: día, mes, año y programación exacta',()=>{
 for(const [before,after] of [['2026-11-01T02:59:59.990Z','2026-11-01T03:00:00.000Z'],['2027-01-01T02:59:59.990Z','2027-01-01T03:00:00.000Z'],['2028-03-01T02:59:59.990Z','2028-03-01T03:00:00.000Z']]){
  assert.notEqual(clock.key(new Date(before)),clock.key(new Date(after)));assert.equal(clock.untilMidnight(new Date(before)),20);
 }
 assert.equal(clock.key(new Date('2026-11-01T02:59:59Z')),'2026-10-31');assert.equal(clock.key(new Date('2026-11-01T03:00:00Z')),'2026-11-01');
});
function setup(page='agenda',selected='2026-10-31',active=null){
 let time=Date.parse('2026-11-01T02:59:59.990Z'),refreshes=0,mapRefreshes=0;const events=[],handlers={},windowEvents={},timeouts=[];
 class FakeDate extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
 const document={hidden:false,querySelectorAll:()=>[],addEventListener:(name,fn)=>handlers[name]=fn,dispatchEvent:event=>events.push(event)};
 const window={document,addEventListener:(name,fn)=>windowEvents[name]=fn};
 const ctx={window,document,Intl,Date:FakeDate,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},setTimeout:(fn,ms)=>{timeouts.push({fn,ms});return timeouts.length;},clearTimeout(){},setInterval:fn=>{handlers.tick=fn;},page,state:'datos',sellerFilters:{surveyAges:new Set()},refreshActivities:()=>refreshes++,renderSellerResults:()=>mapRefreshes++};
 vm.createContext(ctx);vm.runInContext(`let todayKey='2026-10-31',calendarSelected=${JSON.stringify(selected)},calendarActiveDate=${JSON.stringify(active)};`,ctx);vm.runInContext(source,ctx);
 return {ctx,handlers,windowEvents,events,timeouts,advance:value=>{time=Date.parse(value);},get refreshes(){return refreshes;},get mapRefreshes(){return mapRefreshes;},read:code=>vm.runInContext(code,ctx)};
}
test('Actualiza hoy y el calendario al cambiar el día sin recargar ni duplicar el refresco',()=>{
 const x=setup();assert.equal(x.timeouts[0].ms,20);assert.equal(x.refreshes,0);x.advance('2026-11-01T03:00:00.020Z');x.timeouts[0].fn();assert.equal(x.read('todayKey'),'2026-11-01');assert.equal(x.read('calendarSelected'),'2026-11-01');assert.equal(x.refreshes,1);assert.equal(x.events[0].type,'consultor-day-change');x.handlers.tick();assert.equal(x.refreshes,1);
});
test('Conserva períodos elegidos y formularios; no repinta Configuración',()=>{
 const browsing=setup('agenda','2026-12-15');browsing.advance('2026-11-01T03:00:00Z');browsing.handlers.tick();assert.equal(browsing.read('calendarSelected'),'2026-12-15');
 const dialog=setup('agenda','2026-10-31','2026-10-31');dialog.advance('2026-11-01T03:00:00Z');dialog.handlers.tick();assert.equal(dialog.read('calendarSelected'),'2026-10-31');
 const settings=setup('usuario');settings.advance('2026-11-01T03:00:00Z');settings.handlers.tick();assert.equal(settings.refreshes,0);assert.equal(settings.events.length,1);
});
test('Recupera fecha al volver desde suspensión o pestaña en segundo plano',()=>{
 for(const event of ['focus','pageshow','visibilitychange']){const x=setup('inicio');x.advance('2026-11-04T15:00:00Z');(event==='visibilitychange'?x.handlers[event]:x.windowEvents[event])();assert.equal(x.read('todayKey'),'2026-11-04');assert.equal(x.refreshes,1);}
});
test('Actualiza filtros de antigüedad activos sin borrar criterios',()=>{
 const x=setup('sellers');x.ctx.sellerFilters.surveyAges.add('12');x.advance('2026-11-01T03:00:00Z');x.handlers.tick();assert.equal(x.mapRefreshes,1);assert(x.ctx.sellerFilters.surveyAges.has('12'));
});
