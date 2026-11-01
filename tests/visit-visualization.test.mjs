import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import visits from '../visit-visualization.js';
import {createStateHandler} from '../api/state.mjs';
const {colors,manualColor,dateColumns}=visits;
const headers=['Mail','Última visita','Última encuesta','Cantidad','Teléfono','Vacía','Texto','Fecha inválida'];
const values=[['one@example.test','16/10/2026','2026-10-01','3','12345678','','texto','31/02/2026'],['two@example.test','','2026-09-10 (encuesta)','4','23456789','','otro','29/02/2024']];
const seller={id:'1',accept:'Si',survey:'No',sourceValues:values[0]},manual={mode:'manual',dateColumn:'Última visita',months:3};
const at=date=>new Date(date);
test('Columnas reales con fechas: excluye números, teléfonos, texto, vacías y encabezados ambiguos',()=>{
 assert.deepEqual(dateColumns(headers,values).map(c=>c.header),['Última visita','Última encuesta','Fecha inválida']);
 assert.deepEqual(dateColumns(['Fecha','Fecha'],[['16/10/2026','16/10/2026']]),[]);
 assert.deepEqual(dateColumns(headers,values.map(sourceValues=>({sourceValues}))),dateColumns(headers,values));
 for(const invalid of ['',null,'31/02/2026','29/02/2025','2026-13-01','12345678'])assert.equal(visits.parseDate(invalid),null);
 assert.deepEqual(visits.parseDate('29/02/2024'),{year:2024,month:2,day:29});
});
test('Manual: prioridad de no aceptación, vigencia inclusiva por mes y zona horaria',()=>{
 assert.equal(manualColor({...seller,accept:'No'},manual,headers,at('2026-11-01T12:00:00Z')),colors.black);
 for(const date of ['2026-10-16T12:00:00Z','2026-12-31T23:59:00Z','2027-01-01T02:59:59Z'])assert.equal(manualColor(seller,manual,headers,at(date)),colors.green);
 assert.equal(manualColor(seller,manual,headers,at('2027-01-01T03:00:00Z')),colors.red);
 for(const date of ['',null,'31/02/2026'])assert.equal(manualColor({...seller,sourceValues:['x',date]},manual,headers),colors.gray);
 assert.equal(manualColor({...seller,accept:''},manual,headers,at('2026-12-01T12:00:00Z')),colors.green);
 assert.equal(manualColor(seller,{...manual,dateColumn:'Renombrada'},headers),colors.gray);
 assert.equal(manualColor({...seller,sourceValues:['16/10/2026','x']},manual,['Última visita','Mail'],at('2026-12-01T12:00:00Z')),colors.green);
 assert.equal(manualColor(seller,{...manual,months:1},headers,at('2026-11-01T03:00:00Z')),colors.red);
});
test('Meses enteros positivos sin lista cerrada; no altera el objeto recibido',()=>{
 for(const months of [1,2,3,7,25,1200,Number.MAX_SAFE_INTEGER])assert.equal(visits.validate({...manual,months},dateColumns(headers,values)).months,months);
 for(const months of ['',0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>visits.validate({...manual,months},dateColumns(headers,values)));
 assert.throws(()=>visits.validate({...manual,dateColumn:'Mail'},dateColumns(headers,values)));
 assert.deepEqual(visits.defaults(),{mode:'default',dateColumn:'',months:3});
});
class MemoryStore{
 states=new Map();calls=[];
 async read(owner){return {state:structuredClone(this.states.get(owner)||{enabled:true,time:'09:00',email:owner,jobs:{},challenges:{}})};}
 async update(owner,change){const {state}=await this.read(owner),result=change(state);this.states.set(owner,state);return result;}
 async call(...args){this.calls.push(args);throw Error('No debe modificar el registro compartido');}
}
const envFor=owner=>({APP_ORIGIN:'https://fixture.test',GOOGLE_SERVICE_ACCOUNT_EMAIL:'test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'test',AUTH_ALLOWED_EMAILS:owner});
function setup(store=new MemoryStore(),owner='one@example.test'){
 let googleReads=0;const env=envFor(owner),handler=createStateHandler({env,store,google:async()=>{googleReads++;return {valueRanges:[{valueRange:{values:[headers,...values]}}]};}});
 const call=async(body,origin=env.APP_ORIGIN)=>{const response={setHeader(){},status(n){this.code=n;return this;},json(value){this.value=value;return this;}};await handler({method:'POST',headers:{origin},body:{operation:'visitVisualization',...body}},response);return response;};
 return {store,call,get googleReads(){return googleReads;}};
}
test('Persistencia aislada por cuenta, CAS y conservación de horarios y datos compartidos',async()=>{
 const store=new MemoryStore(),a=setup(store),b=setup(store,'two@example.test');
 assert.deepEqual((await a.call({method:'GET'})).value,{settings:visits.defaults(),revision:0});
 assert.equal((await a.call({method:'PUT',settings:manual,expectedRevision:0})).code,200);
 const saved=await a.call({method:'GET'});assert.deepEqual(saved.value,{settings:manual,revision:1});
 assert.equal((await b.call({method:'GET'})).value.settings.mode,'default');
 const own=(await store.read('one@example.test')).state;assert.equal(own.time,'09:00');assert.equal(own.email,'one@example.test');assert.deepEqual(own.jobs,{});assert.equal(store.calls.length,0);
 assert.equal((await a.call({method:'PUT',settings:manual,expectedRevision:0})).code,409);
 assert.equal((await a.call({method:'PUT',settings:{...manual,dateColumn:'Mail'},expectedRevision:1})).code,400);
 assert.equal((await a.call({method:'PUT',settings:{...manual,months:0},expectedRevision:1})).code,400);
 assert.equal((await a.call({method:'PUT',settings:{...manual,mode:'default'},expectedRevision:1})).code,200);
 assert.equal((await a.call({method:'GET'})).value.settings.mode,'default');
 assert.equal((await a.call({method:'GET'},'https://other.test')).code,403);
});
test('La modalidad predeterminada reutiliza la función original; manual recolorea sin reconstruir mapa ni cambiar filtros',async()=>{
 const operations=fs.readFileSync(new URL('../operations.js',import.meta.url),'utf8');const original=operations.slice(operations.indexOf('function sellerColor('),operations.indexOf('\n',operations.indexOf('function sellerColor(')));
 const rows=[{...seller,accept:'No'},{...seller,accept:'Si',survey:'Si'},{...seller,survey:'No'},{...seller,survey:''},{...seller,accept:'',survey:'Si'}];
 const ctx={opNorm:v=>String(v??'').toLowerCase(),profileConfiguration(){},console,Intl,Date,AbortSignal,MutationObserver:class{},setInterval(){},window:{ConsultorVisitVisualization:visits},portfolioHeaders:headers,sellers:[seller],opEscape:String,showOpNotice(){},document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},fetch:async()=>({ok:true,json:async()=>({settings:visits.defaults(),revision:0})})};
 vm.createContext(ctx);vm.runInContext(original,ctx);const before=rows.map(ctx.sellerColor);vm.runInContext(fs.readFileSync(new URL('../visit-settings.js',import.meta.url),'utf8'),ctx);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(rows.map(ctx.sellerColor),before);
 assert.deepEqual(before,[colors.black,colors.green,colors.red,colors.gray,colors.green]);
 const dot={style:{}},layer={options:{visitSellerId:seller.id},getElement:()=>({querySelector:()=>dot})};let visited=0;
 ctx.geographicMap={eachLayer:fn=>{visited++;fn(layer);}};
 ctx.fetch=async()=>({ok:true,json:async()=>({settings:manual,revision:1})});
 // New application session loads the saved owner-specific setting.
 const beforeRows=JSON.stringify(ctx.sellers);vm.runInContext(fs.readFileSync(new URL('../visit-settings.js',import.meta.url),'utf8'),ctx);await new Promise(resolve=>setImmediate(resolve));assert(visited>0);assert.equal(dot.style.background,ctx.sellerColor(seller));assert.equal(JSON.stringify(ctx.sellers),beforeRows);
});
