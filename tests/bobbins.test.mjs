import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import bobbins from '../bobbins.js';
import {createStateHandler} from '../api/state.mjs';
const headers=['Mail','Bobinas a entregar','Otra cantidad'];
const rows=[{id:'1',e:'a',n:'Uno',z:'Norte',s:'',accept:'si',survey:'si',a:[],latlog:'',sourceValues:['a','2','100']},{id:'2',e:'b',n:'Dos',z:'Sur',s:'',accept:'si',survey:'no',a:[],sourceValues:['b','3','200']},{id:'3',e:'c',n:'Tres',z:'Norte',s:'',accept:'no',survey:'no',a:[],sourceValues:['c','4','300']}];
test('Suma exacta de los resultados de filtros existentes y búsqueda; incluye sin ubicación',()=>{
 const source=fs.readFileSync(new URL('../operations.js',import.meta.url),'utf8'),start=source.indexOf('function filteredSellers(){'),end=source.indexOf('\n',start);
 const filters={survey:'',surveyAges:new Set(),accept:'',actions:new Set(),zones:new Set(),subzones:new Set()};
 const ctx={sellers:rows,sellerSearch:'',opNorm:v=>String(v??'').toLowerCase(),sellerFilters:filters};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 const sum=()=>bobbins.total(vm.runInContext('filteredSellers()',ctx),headers,'Bobinas a entregar').total;
 assert.equal(sum(),9);filters.zones.add('Norte');assert.equal(sum(),6);filters.accept='si';assert.equal(sum(),2);filters.zones.clear();assert.equal(sum(),5);ctx.sellerSearch='Dos';assert.equal(sum(),3);ctx.sellerSearch='inexistente';assert.equal(sum(),0);
});
test('Vacíos, cero, números localizados, errores y columnas cambiadas',()=>{
 for(const [input,value] of [['',0],['0',0],['12',12],['1.000',1000],['1.234,5',1234.5],['2,5',2.5],['2.5',2.5],[7,7],['abc',null],['-2',null],['1,2,3',null]])assert.equal(bobbins.quantity(input),value);
 assert.deepEqual(bobbins.total([{sourceValues:['a','']},{sourceValues:['b','n/a']},{sourceValues:['c','2']}],headers,'Bobinas a entregar'),{total:2,invalid:1});
 assert.equal(bobbins.total(rows,headers,'Otra cantidad').total,600);assert.equal(bobbins.total(rows,headers,'No existe').total,null);
 assert.equal(bobbins.total([{sourceValues:['3','a']}],['Bobinas a entregar','Mail'],'Bobinas a entregar').total,3);
 assert.deepEqual(bobbins.columns(['','Una','Una','Dos']).map(c=>c.header),['Dos']);
});
test('Persistencia por cuenta, conflictos y sin alterar configuración ni datos de comercios',async()=>{
 const states=new Map(),store={async read(owner){return {state:structuredClone(states.get(owner)||{time:'09:00',visitVisualization:{mode:'manual'},jobs:{}})};},async update(owner,fn){const {state}=await this.read(owner);fn(state);states.set(owner,state);},call(){throw Error('No debe acceder a datos compartidos');}};
 const call=async(owner,body)=>{const env={APP_ORIGIN:'https://fixture.test',GOOGLE_SERVICE_ACCOUNT_EMAIL:'test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'test',AUTH_ALLOWED_EMAILS:owner};const handler=createStateHandler({env,store,google:async()=>({valueRanges:[{valueRange:{values:[headers]}}]})});const res={setHeader(){},status(n){this.code=n;return this;},json(value){this.value=value;return this;}};await handler({method:'POST',headers:{origin:env.APP_ORIGIN},body:{operation:'bobbinVisualization',...body}},res);return res;};
 assert.equal((await call('a',{method:'GET'})).value.settings.column,'');
 assert.equal((await call('a',{method:'PUT',expectedRevision:0,settings:{column:'Bobinas a entregar'}})).code,200);
 assert.equal((await call('a',{method:'GET'})).value.settings.column,'Bobinas a entregar');assert.equal((await call('b',{method:'GET'})).value.settings.column,'');
 assert.equal((await call('a',{method:'PUT',expectedRevision:0,settings:{column:'Bobinas a entregar'}})).code,409);
 assert.equal((await call('a',{method:'PUT',expectedRevision:1,settings:{column:'No existe'}})).code,400);
 assert.equal(states.get('a').time,'09:00');assert.deepEqual(states.get('a').visitVisualization,{mode:'manual'});assert.deepEqual(states.get('a').jobs,{});
 assert.equal((await call('a',{method:'PUT',expectedRevision:1,settings:{column:''}})).code,200);
});
