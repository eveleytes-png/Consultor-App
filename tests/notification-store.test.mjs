import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NotificationStore} from '../lib/notification-store.mjs';
import {createStateHandler} from '../api/state.mjs';
import {createHandler} from '../api/sheets.mjs';
test('El almacenamiento aplica CAS incluso con dos escrituras concurrentes',async()=>{
 let row={owner:'owner@example.com',revision:0,state:{count:0}};
 const store=new NotificationStore({SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'private'},async(url,opt)=>{
  assert.equal(opt.headers.Authorization,'Bearer private');let result=[];
  if(!opt.method)result=[structuredClone(row)];
  if(opt.method==='PATCH'&&new URL(url).searchParams.get('revision')==='eq.'+row.revision){Object.assign(row,JSON.parse(opt.body));result=[structuredClone(row)];}
  return {ok:true,json:async()=>result};
 });
 await Promise.all([store.update(row.owner,s=>{s.count++;}),store.update(row.owner,s=>{s.count++;})]);assert.equal(row.state.count,2);assert.equal(row.revision,2);
});
test('Estado privado: requiere sesión y origen; no acepta tablas o RPC arbitrarios',async()=>{
 const env={CONSULTOR_REQUIRE_LOGIN:"true",AUTH_ALLOWED_EMAILS:'owner@example.com',AUTH_SECRET:'s'.repeat(32),GOOGLE_SERVICE_ACCOUNT_EMAIL:'test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'test',APP_ORIGIN:'https://example.com'};
 const login=createHandler({env,verifyIdentity:async()=>({email:'owner@example.com',email_verified:true})});
 const invoke=async(handler,body,cookie='',origin=env.APP_ORIGIN)=>{const h={},res={setHeader(k,v){h[k]=v;},status(n){this.code=n;return this;},json(v){this.data=v;}};await handler({method:'POST',headers:{origin,cookie},body},res);return {...res,headers:h};};
 const session=await invoke(login,{operation:'login',credential:'test'}),cookie=session.headers['Set-Cookie'];let calls=0;
 const handler=createStateHandler({env,store:{call:async()=>{calls++;return [];} }});
 const body={path:'consultor_shared_state?id=eq.demo&select=revision',method:'GET'};
 assert.equal((await invoke(handler,body)).code,401);assert.equal((await invoke(handler,body,cookie,'https://evil.example')).code,403);
 assert.equal((await invoke(handler,{path:'consultor_notifications',method:'GET'},cookie)).code,400);
 assert.equal((await invoke(handler,body,cookie)).code,200);assert.equal(calls,1);
});
