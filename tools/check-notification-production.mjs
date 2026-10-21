// Anonymous, read-only deployment check. Prints no merchant records or secrets.
import assert from 'node:assert/strict';
import vm from 'node:vm';
const origin=process.argv[2]||'https://consultor-app.vercel.app';
const read=async path=>{const r=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(20000)});return {status:r.status,text:await r.text()};};
const status=await read('/api/sheets'),data=JSON.parse(status.text);
assert.equal(status.status,200);assert.equal(data.configured,true);assert.equal(data.authenticated,false);
const notifications=await read('/api/notifications');assert.equal(notifications.status,401);
const state=await read('/api/state');assert.equal(state.status,401);
for(const path of ['/lib/notification-service.mjs','/supabase/notifications.sql','/tests/notification-service.test.mjs'])assert.equal((await read(path)).status,404,path);
const seed=await read('/demo-data.js'),context={window:{}};vm.runInNewContext(seed.text,context);
assert.equal(context.window.CONSULTOR_DEMO_DATA.sellers.length,0);
const profile=await read('/notifications.js');assert.equal(profile.status,200);assert.ok(profile.text.includes('Resumen diario'));
console.log(JSON.stringify({origin,googleConfigured:data.configured,privateStateEnabled:data.privateStateEnabled,newEndpointsRequireLogin:true,publicMerchantSeedRemoved:true,privateSourceExcluded:true}));
