import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import portfolio from '../home.js';
import {buildDailySummary,composeDailyEmail,composeDailyText,countSurveyFollowUp} from '../lib/daily-summary.mjs';
const now=new Date('2026-10-31T12:00:00Z');
const row=(id,d,survey='No')=>({id,e:id+'@example.com',n:id,d,survey,accept:'Si',a:[],z:'',s:''});
const records=[row('old','30/04/2025'),row('middle','30/10/2025'),row('equal12','31/10/2025'),row('equal18','30/04/2025 (anotación)'),row('validButOld','01/01/2024','Si'),row('future','01/01/2027'),row('empty',''),row('bad','31/02/2024'),row('iso','2025-01-01T10:00:00Z'),row('recent','30/10/2026')];
const build=(rows=records,extra={})=>buildDailySummary({rows,activities:[],changes:{additions:0,removals:0},now,...extra});
function filtered(rows,months,date=now){
 const source=fs.readFileSync(new URL('../operations.js',import.meta.url),'utf8');
 const start=source.indexOf('function filteredSellers(){'),end=source.indexOf('\n',start);
 const ctx={sellers:rows,sellerSearch:'',opNorm:portfolio.normalizeAnswer,surveyOlderThan:(v,m)=>portfolio.surveyOlderThan(v,m,date),sellerFilters:{survey:'',surveyAges:new Set([String(months)]),accept:'',actions:new Set(),zones:new Set(),subzones:new Set()}};
 return vm.runInNewContext(source.slice(start,end)+'\nfilteredSellers()',ctx);
}
test('Contadores coinciden con la función real de filtros, fechas límite y válidas/pendientes',()=>{
 for(const date of [now,new Date('2026-11-01T02:59:00Z'),new Date('2026-11-01T03:00:00Z'),new Date('2028-02-29T12:00:00Z')]){
  const counts=countSurveyFollowUp(records,date);
  for(const months of [12,18])assert.equal(counts['over'+months],filtered(records,months,date).length);
  assert(counts.over18<=counts.over12);
 }
 assert.equal(portfolio.surveyOlderThan('31/10/2025',12,now),false);
 assert.equal(portfolio.surveyOlderThan('30/04/2025',18,now),false);
 assert.equal(portfolio.surveyOlderThan('29/04/2025',18,now),true);
 assert(!filtered(records,12).some(r=>['bad','empty','future','recent'].includes(r.id)));
});
test('Sin duplicados ni mezcla de carteras; importación conserva rechazo de identidades ambiguas',()=>{
 const old=row('one','01/01/2024');
 assert.deepEqual(countSurveyFollowUp([old,{...old},{...old,id:'alias',e:'ONE@EXAMPLE.COM'}],now),{over12:1,over18:1});
 assert.deepEqual(countSurveyFollowUp([row('two','01/10/2026')],now),{over12:0,over18:0});
 const headers=['Mail','Cust_id comercio','Última Fecha contesto'];
 assert.throws(()=>portfolio.parsePortfolioRows([headers,['a','1','01/01/2024'],['a','1','01/01/2024']],portfolio.mapPortfolioHeaders(headers)),/repetidos/);
 const parsed=portfolio.parsePortfolioRows([headers,['a','1','01/01/2024']],portfolio.mapPortfolioHeaders(headers));assert.equal(countSurveyFollowUp(parsed,now).over18,1);
});
test('Correo: oculta cero, muestra solo 12 o ambos, sin cambiar texto de Telegram',()=>{
 for(const [rows,a,b] of [[[],0,0],[[row('one','01/08/2025')],1,0],[[row('one','01/01/2024')],1,1]]){
  const summary=build(rows),message=composeDailyEmail(summary,'https://example.com');
  assert.equal(message.html.includes('Seguimiento de encuestas'),!!a);
  for(const format of [message.text,message.html]){
   assert.equal(format.includes('más de 12 meses'),!!a);assert.equal(format.includes('más de 18 meses'),!!b);
   assert(format.includes('no presenta cambios pendientes'));assert(format.includes('No tenés actividades pendientes.'));
  }
  assert(!composeDailyText(summary,'https://example.com').includes('Seguimiento de encuestas'));
 }
});
test('HTML seguro, enlaces originales, agenda nocturna y máximo cinco actividades',()=>{
 const description='<img src=x onerror=alert(1)> & "prueba"';
 const activities=Array.from({length:7},(_,i)=>({date:'2026-10-31',time:'09:0'+i,description}));
 activities.push({date:'2026-11-01',time:'10:00',description:'Mañana'});
 const summary=build([],{activities,changes:{additions:2,removals:3},now:new Date('2026-10-31T23:00:00Z')});
 const {html,text}=composeDailyEmail(summary,'https://example.com');
 assert(html.includes('&lt;img'));assert(!html.includes('<img'));assert(text.includes(description));
 assert(html.includes('Agenda de mañana'));assert(html.includes('Y 2 más'));assert(text.includes('2 comercios para agregar y 3 para eliminar'));
 for(const q of ['?pantalla=usuario&amp;notificaciones=cambios','?pantalla=sellers&amp;cartera=sin-aceptacion','?pantalla=agenda'])assert(html.includes(q));
 assert.throws(()=>composeDailyEmail(summary,'https://user:secret@example.com'));
});

test('Cuarto cuadro muestra el próximo escalón y no repite la frase debajo',()=>{
 for(const [surveyed,target,missing] of [[59,60,1],[60,75,15],[66,75,9],[75,100,25],[99,100,1]]){
  const rows=Array.from({length:100},(_,i)=>row(String(i),'01/10/2026',i<surveyed?'Si':'No'));
  const {html}=composeDailyEmail(build(rows),'https://example.com');
  const phrase=`Para llegar al ${target}%, te faltan ${missing} encuestas.`;
  assert.equal(html.split(phrase).length-1,1);
  const section=html.slice(html.indexOf('Tu cartera en números'),html.indexOf('IMPORTANTE ·'));
  assert(section.indexOf(phrase)<section.lastIndexOf('</table>'));
  assert(!section.slice(section.lastIndexOf('</table>')).includes(phrase));
 }
 const complete=composeDailyEmail(build([row('one','','Si')]),'https://example.com').html;assert(complete.includes('Llegaste al objetivo máximo del 100%.'));assert(!complete.includes('Para llegar al'));
 const empty=composeDailyEmail(build([]),'https://example.com').html;assert(empty.includes('Sin comercios con aceptación para calcular el próximo objetivo.'));
});
