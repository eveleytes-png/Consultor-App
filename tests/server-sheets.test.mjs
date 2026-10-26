import assert from 'node:assert/strict';
import {createHandler} from '../api/sheets.mjs';
const origin='https://consultor-app.vercel.app';
const env={CONSULTOR_REQUIRE_LOGIN:"true",GOOGLE_SERVICE_ACCOUNT_EMAIL:'test@example.gserviceaccount.com',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'test-only',AUTH_SECRET:'test-only-session-secret-32-characters-long',AUTH_ALLOWED_EMAILS:'owner@example.com'};
const tables={0:[['Mail','Cust_id comercio'],['owner@example.com','1']],500157585:[],1266882678:[]};let calls=0,writes=0;
const readBody=id=>({dataFilters:[{gridRange:{sheetId:id,startRowIndex:0}}],majorDimension:'ROWS',valueRenderOption:'FORMATTED_VALUE'});
const handler=createHandler({env,verifyIdentity:async credential=>({email:credential==='valid'?'owner@example.com':'stranger@example.com',email_verified:credential!=='unverified'}),googleRequest:async(c,path,body)=>{calls++;if(path.startsWith('?'))return {properties:{title:'Planilla'},sheets:[{properties:{sheetId:0,title:'BaseApp'}},{properties:{sheetId:500157585,title:'Points_ConsultoresApp'}},{properties:{sheetId:1266882678,title:'Links_ConsultoresApp'}},{properties:{sheetId:99,title:'Other'}}]};if(path.includes('batchGetByDataFilter'))return {valueRanges:[{valueRange:{values:structuredClone(tables[body.dataFilters[0].gridRange.sheetId])}}]};writes++;for(const r of body.requests){const u=r.updateCells;u.rows.forEach((row,i)=>{const target=tables[u.range.sheetId][u.range.startRowIndex+i]||=[];row.values.forEach((v,j)=>target[u.range.startColumnIndex+j]=v.userEnteredValue.stringValue);});}return {};}});
async function call(body,{cookie='',requestOrigin=origin,method='POST',run=handler}={}){const headers={};const res={setHeader:(k,v)=>headers[k]=v,status(n){this.code=n;return this;},json(value){this.value=value;return this;}};await run({method,headers:{origin:requestOrigin,cookie},body},res);return {code:res.code,data:res.value,headers};}
let r=await call(null,{method:'GET'});assert.equal(r.data.configured,true);assert.equal(r.data.authenticated,false);assert.equal(calls,0);
r=await call({path:'/values:batchGetByDataFilter',body:readBody(0)});assert.equal(r.code,401);assert.equal(calls,0);
assert.equal((await call({operation:'login',credential:'valid'},{requestOrigin:'https://other.example'})).code,403);
assert.equal((await call({operation:'login',credential:'invalid'})).code,403);
const first=await call({operation:'login',credential:'valid'}),second=await call({operation:'login',credential:'valid'});
assert.equal(first.code,200);assert.match(first.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);
const one=first.headers['Set-Cookie'],two=second.headers['Set-Cookie'];
assert.equal((await call(null,{method:'GET',cookie:one})).data.authenticated,true);
assert.equal((await call(null,{method:'GET',cookie:one.replace('session=','session=modified')})).data.authenticated,false);
const metadata=await call({path:'?fields=spreadsheetId,properties(title),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'},{cookie:one});assert.equal(metadata.data.sheets.length,3);
for(const id of [0,500157585,1266882678])assert.equal((await call({path:'/values:batchGetByDataFilter',body:readBody(id)},{cookie:one})).code,200);
const prior=calls;assert.equal((await call({path:'/values:batchGetByDataFilter',body:readBody(99)},{cookie:one})).code,400);assert.equal(calls,prior);
const cells=(id,row,value)=>({path:':batchUpdate',body:{requests:[{updateCells:{range:{sheetId:id,startRowIndex:row,endRowIndex:row+1,startColumnIndex:0,endColumnIndex:1},rows:[{values:[{userEnteredValue:{stringValue:value}}]}],fields:'userEnteredValue'}}]}});
assert.equal((await call(cells(0,1,'forbidden'),{cookie:one})).code,400);assert.equal(writes,0);
assert.equal((await call({path:':batchUpdate',body:{requests:[{deleteSheet:{sheetId:500157585}}]}},{cookie:one})).code,400);
assert.equal((await call({path:':batchUpdate',body:{requests:[{addSheet:{properties:{title:'Other'}}}]}},{cookie:one})).code,400);
assert.equal((await call({path:':batchUpdate',body:{requests:[{updateCells:{...cells(500157585,0,'x').body.requests[0].updateCells,fields:'*'}}]}},{cookie:one})).code,400);
for(const id of [500157585,1266882678]){assert.equal((await call(cells(id,0,'saved-by-device-one'),{cookie:one})).code,200);const seen=await call({path:'/values:batchGetByDataFilter',body:readBody(id)},{cookie:two});assert.equal(seen.data.valueRanges[0].valueRange.values[0][0],'saved-by-device-one');}
assert.equal(tables[0][1][1],'1');assert.equal(writes,2);
const missing=createHandler({env:{}});r=await call(null,{method:'GET',run:missing});assert.equal(r.data.configured,false);assert.equal((await call({operation:'login',credential:'valid'},{run:missing})).code,503);
console.log('PASS: authorized Google accounts and secure cookies, anonymous/forged/other-origin access denied, fixed file and three-tab scope, no portfolio writes or sheet deletion, two device sessions see the same Points/Links, missing credentials fail safely. Controlled tests; no real Google writes.');
