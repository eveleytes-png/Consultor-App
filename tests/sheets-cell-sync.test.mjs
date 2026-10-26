import assert from 'node:assert/strict';
import {createHandler} from '../api/sheets.mjs';
const env={CONSULTOR_REQUIRE_LOGIN:"true",GOOGLE_SELLER_WRITES_ENABLED:"true",GOOGLE_SERVICE_ACCOUNT_EMAIL:'test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'test',AUTH_SECRET:'test-only-secret-at-least-32-characters',AUTH_ALLOWED_EMAILS:'owner@example.com'};
const origin='https://consultor-app.vercel.app';
const headers=Array.from({length:16},(_,i)=>i===15?'Cust_id comercio':i===0?'Mail':'Column '+i);
let rows=[headers,['mail@example.com',...Array(14).fill(''),'123']],writes=[],locked=false,marked=false;
const handler=createHandler({env,verifyIdentity:async()=>({email:'owner@example.com',email_verified:true}),lock:async method=>{if(method==='acquire'){if(locked)return false;locked=true;return true;}if(method==='mark'){marked=true;return true;}locked=false;return true;},googleRequest:async(c,path,body)=>{
 if(path.includes('batchGet'))return {valueRanges:body.dataFilters.map(f=>{const r=f.gridRange;let values=r.sheetId===0?structuredClone(rows):[];if(r.startColumnIndex!==undefined)values=values.slice(r.startRowIndex,r.endRowIndex).map(row=>row.slice(r.startColumnIndex,r.endColumnIndex));if(body.valueRenderOption!=='FORMULA')values=values.map(row=>row.map(v=>String(v).startsWith('=')?'calculated':v));return {dataFilters:[f],valueRange:{values}};})};
 writes.push(body);const u=body.requests[0].updateCells,v=u.rows[0].values[0].userEnteredValue;rows[u.range.startRowIndex][u.range.startColumnIndex]=v.formulaValue??v.stringValue;if(u.range.startColumnIndex===0)rows[u.range.startRowIndex][15]='789';return {};
}});
async function call(body,cookie=''){const response={setHeader(k,v){this[k]=v;},status(n){this.code=n;return this;},json(value){this.data=value;}};await handler({method:'POST',headers:{origin,cookie},body},response);return response;}
const login=await call({operation:'login',credential:'test'});const cookie=login['Set-Cookie'];
const edit=(column,value,expected='')=>({operation:'editSeller',sellerId:'123',column,value,expected,header:headers[column]});
assert.equal((await call(edit(1,'new'),cookie)).code,200);assert.equal(writes.length,1);assert.equal(marked,true);assert.equal(locked,false);
assert.deepEqual(writes[0].requests[0].updateCells.range,{sheetId:0,startRowIndex:1,endRowIndex:2,startColumnIndex:1,endColumnIndex:2});assert.equal(rows[1][15],'123');
assert.equal((await call(edit(1,'overwrite'),cookie)).code,409);assert.equal(writes.length,1);
for(const column of [15,16,62,-1])assert.equal((await call(edit(column,'forbidden'),cookie)).code,400);
assert.equal((await call(edit(0,'','mail@example.com'),cookie)).code,400);
locked=true;assert.equal((await call(edit(2,'blocked'),cookie)).code,409);locked=false;
const snap=await call({operation:'snapshot'},cookie);assert.deepEqual(Object.keys(snap.data),['portfolio','stock','links']);assert.equal(snap.data.portfolio[1][1],'new');
assert.equal((await call(edit(1,'anonymous'))).code,401);
// Match by stable ID even after a Sheet row insertion; never use cached row index.
rows.splice(1,0,['other@example.com',...Array(14).fill(''),'456']);
assert.equal((await call(edit(2,'moved'),cookie)).code,200);assert.equal(writes.at(-1).requests[0].updateCells.range.startRowIndex,2);
rows[2][7]='=1+1';rows[2][8]='=3+3';
const original=await call({operation:'sellerCell',sellerId:'123',column:7},cookie);assert.equal(original.data.value,'=1+1');
assert.equal((await call(edit(7,'=2+2','=1+1'),cookie)).code,200);assert.equal(writes.at(-1).requests[0].updateCells.rows[0].values[0].userEnteredValue.formulaValue,'=2+2');assert.equal(rows[2][8],'=3+3');
rows[2][7]='=2*2';assert.equal((await call(edit(7,'=4','=2+2'),cookie)).code,409);
assert.equal((await call(edit(1,'=literal','new'),cookie)).code,200);assert.equal(writes.at(-1).requests[0].updateCells.rows[0].values[0].userEnteredValue.stringValue,'=literal');
assert.equal((await call(edit(0,'new@example.com','mail@example.com'),cookie)).code,200);assert.equal(writes.at(-1).requests[0].updateCells.range.startColumnIndex,0);assert.equal(rows[2][15],'789');
console.log('PASS: exact single-cell A:O writes; raw H:O formulas loaded and saved without flattening adjacent formulas; formula conflicts rejected; A:G kept as text; mail save tolerates a derived Cust ID change; P+ not written by app. Controlled tests, no live writes.');
