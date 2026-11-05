import assert from 'node:assert/strict';
import {createHandler} from '../api/sheets.mjs';
const headers=Array(22).fill('');headers[4]='LatLong';headers[15]='Cust_id comercio';headers[21]='Dirección';
const row=(id,lat,address)=>{const r=[];r[4]=lat;r[15]=id;r[21]=address;return r;};
let rows=[headers,row('1','-27,-55','A 123, Posadas'),row('2','','B 456, Posadas')],queries=[];
const env={GOOGLE_SERVICE_ACCOUNT_EMAIL:'test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'test',AUTH_ALLOWED_EMAILS:'owner@test.com'};
const run=createHandler({env,googleRequest:async(c,path)=>{assert(path.includes('batchGet'));return {valueRanges:[{valueRange:{values:rows}}]};},geocode:async address=>{queries.push(address);return {status:'resolved',coordinates:[-27.1,-55.1]};}});
async function call(body,origin='https://consultor-app.vercel.app'){const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;}};await run({method:'POST',headers:{origin},body},res);return res;}
let r=await call({operation:'geolocateSellers',sellerIds:['1','2']});assert.equal(r.code,200);assert.deepEqual(queries,['B 456, Posadas']);assert.equal(r.data.results[0].status,'primary');assert.equal(r.data.results[1].address,'B 456, Posadas');
rows[2][4]='-28,-56';queries=[];r=await call({operation:'geolocateSellers',sellerIds:['2']});assert.equal(r.data.results[0].status,'primary');assert.equal(queries.length,0);
assert.equal((await call({operation:'geolocateSellers',sellerIds:['1'],address:'arbitrary'})).code,400);
assert.equal((await call({operation:'geolocateSellers',sellerIds:Array(6).fill('1')})).code,400);
assert.equal((await call({operation:'geolocateSellers',sellerIds:['1']},'https://other.test')).code,403);
r=await call({operation:'geolocateSellers',sellerIds:['unknown']});assert.equal(r.data.results[0].coordinates,null);
console.log('PASS: geolocation only reads authorized source rows; valid LatLong bypasses provider even if browser is stale; addresses are not accepted from client; batch/origin restrictions and missing sellers handled.');
