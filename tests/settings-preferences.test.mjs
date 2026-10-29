import assert from 'node:assert/strict';
import {createStateHandler} from '../api/state.mjs';
const env={APP_ORIGIN:'https://consultor-app.vercel.app',GOOGLE_SERVICE_ACCOUNT_EMAIL:'test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'test',AUTH_ALLOWED_EMAILS:'owner@example.test'};
let row={revision:3,sellers:[{id:'untouched'}],data:{activities:[{id:'keep'}],links:[],actions:[],assignments:[],equipment:[],settings:{profile:{name:'Existing'},detailColumns:['c2']}}};
let patches=0;
const handler=createStateHandler({env,store:{call:async(path,options)=>{
 if(options?.method==='PATCH'){patches++;const next=JSON.parse(options.body);row={...row,...next};return [structuredClone(row)];}
 return [structuredClone(row)];
}}});
async function save(change,revision=row.revision){const result={setHeader(){},status(code){this.code=code;return this;},json(value){this.value=value;}};await handler({method:'POST',headers:{origin:env.APP_ORIGIN},body:{path:'rpc/consultor_update_details',method:'POST',data:{expected_revision:revision,change}}},result);return result;}
const saved=await save({kind:'card',title:'c0',additionalColumns:['c19']});
assert.equal(saved.code,200);assert.deepEqual(row.data.settings.card,{title:'c0',additional:'c19',additionalColumns:['c19']});
assert.equal(row.data.settings.profile.name,'Existing');assert.deepEqual(row.data.settings.detailColumns,['c2']);assert.equal(row.data.activities[0].id,'keep');assert.equal(row.sellers[0].id,'untouched');
assert.equal((await save({kind:'card',title:'c0',additionalColumns:[]},3)).code,409);
assert.equal((await save({kind:'card',title:'invalid',additionalColumns:[]})).code,400);
assert.equal((await save({kind:'card',title:'c0',additionalColumns:['c1','c1']})).code,400);
assert.equal((await save({kind:'card',title:'c0',additionalColumns:'c1'})).code,400);
assert.equal((await save({kind:'card',title:'c0',additionalColumns:['c1','c4']})).code,400);
assert.equal(patches,1);
console.log('PASS: one optional card field persists with revision checks; multiple fields rejected; profile, detail columns, sellers and operational data preserved; invalid/stale writes rejected.');
