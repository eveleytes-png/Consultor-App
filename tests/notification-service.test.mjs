import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NotificationService} from '../lib/notification-service.mjs';
import {createNotificationHandler} from '../api/notifications.mjs';
import {createProviders,telegramParts,ProviderError} from '../lib/notification-providers.mjs';
class MemoryStore{
 constructor(){this.state={enabled:true,time:'09:00',email:'owner@example.com',emailVerified:true,telegramChat:'123',jobs:{},challenges:{}};this.agenda=[];}
 async read(){return {state:structuredClone(this.state),revision:1};}
 async update(owner,mutate){const next=structuredClone(this.state),result=mutate(next);this.state=next;return result;}
 async call(){return [{data:{activities:this.agenda}}];}
}
const env={CONSULTOR_REQUIRE_LOGIN:"true",AUTH_ALLOWED_EMAILS:'owner@example.com',AUTH_SECRET:'a'.repeat(32),APP_ORIGIN:'https://example.com',TELEGRAM_BOT_USERNAME:'test_bot',TELEGRAM_WEBHOOK_SECRET:'secret',NOTIFICATION_CRON_SECRET:'cron-secret'};
function setup(){
 const store=new MemoryStore(),sent=[];
 const providers={emailConfigured:true,telegramConfigured:true,configureTelegramWebhook:async()=>true,email:async(...a)=>{sent.push(['email',...a]);return 'email-id';},telegram:async(...a)=>{sent.push(['telegram',...a]);return 'telegram-id';}};
 let rows=[['Mail','Cust_id comercio','Nombre del comercio','Aceptación','Encuesta valida','Blindaje'],['m@example.com','1','Comercio','Si','No','']];
 const service=new NotificationService({env,store,providers,google:async()=>({valueRanges:[{valueRange:{values:structuredClone(rows)}}]})});
 return {service,store,sent,providers,setRows:r=>{rows=r;}};
}
const now=new Date('2026-10-21T15:00:00Z');
test('Remitente Resend de prueba exige correo del titular; dominio propio admite otro destino',async()=>{
 const x=setup();x.service.env={...env,NOTIFICATION_FROM:'Consultor App <onboarding@resend.dev>'};
 await assert.rejects(()=>x.service.configure('owner@example.com',{enabled:false,time:'09:00',email:'other@example.com'}),/remitente de prueba/);
 await x.service.configure('owner@example.com',{enabled:false,time:'09:00',email:'owner@example.com'});
 x.service.env.NOTIFICATION_FROM='Consultor App <resumen@dominio-propio.example>';
 await x.service.configure('owner@example.com',{enabled:false,time:'09:00',email:'other@example.com'});
});
test('Dos ejecuciones concurrentes y repetidas: una aceptación por canal',async()=>{
 const x=setup();await Promise.all([x.service.run(now),x.service.run(now)]);await x.service.run(now);
 assert.equal(x.sent.filter(s=>s[0]==='email').length,1);assert.equal(x.sent.filter(s=>s[0]==='telegram').length,0);
 assert.ok(Object.values(x.store.state.jobs).every(j=>j.status==='accepted'));
});
for(const failed of ['email'])test(`Reintenta únicamente ${failed} tras 429`,async()=>{
 const x=setup(),original=x.providers[failed];let tries=0;
 x.providers[failed]=async(...args)=>{if(tries++===0)throw new ProviderError('temporary');return original(...args);};
 await x.service.run(now);
 const retry=Object.values(x.store.state.jobs).find(j=>j.channel===failed);assert.equal(retry.status,'retry');retry.retryAt=0;
 await x.service.run(now);assert.equal(x.sent.length,1);assert.equal(Object.values(x.store.state.jobs).find(j=>j.channel===failed).attempts,2);
});
test('Timeout de email no reenvía automáticamente',async()=>{const x=setup();x.providers.email=async()=>{throw new ProviderError('uncertain');};await x.service.run(now);await x.service.run(now);assert.equal(x.sent.length,0);const jobs=Object.values(x.store.state.jobs);assert.equal(jobs.length,1);assert.equal(jobs[0].channel,'email');assert.equal(jobs[0].status,'uncertain');assert.equal(jobs[0].attempts,1);});
test('Sin configuración y antes de hora no envía',async()=>{
 const x=setup();x.store.state.emailVerified=false;delete x.store.state.telegramChat;await x.service.run(now);assert.equal(x.sent.length,0);
 x.store.state.emailVerified=true;x.store.state.time='20:00';await x.service.run(now);assert.equal(x.sent.length,0);
});
test('Diferencias persisten, vacíos/duplicados no generan bajas y revisión comprueba versión',async()=>{
 const x=setup();await x.service.refreshSource('owner@example.com');
 const headers=['Mail','Cust_id comercio','Nombre del comercio','Aceptación','Encuesta valida','Blindaje'];
 x.setRows([headers,['new@example.com','2','Nuevo','No','','']]);await x.service.refreshSource('owner@example.com');
 assert.equal(x.store.state.pendingChanges.length,2);await x.service.refreshSource('owner@example.com');assert.equal(x.store.state.pendingChanges.length,2);
 const version=x.store.state.sourceVersion;x.setRows([headers]);await assert.rejects(()=>x.service.refreshSource('owner@example.com'));assert.equal(x.store.state.pendingChanges.length,2);
 x.setRows([headers,['a','2','A','No','',''],['b','2','B','No','','']]);await assert.rejects(()=>x.service.refreshSource('owner@example.com'));assert.equal(x.store.state.pendingChanges.length,2);
 await assert.rejects(()=>x.service.reviewChanges('owner@example.com',version));
 x.setRows([headers,['new@example.com','2','Nuevo','No','','']]);await x.service.reviewChanges('owner@example.com',version);assert.equal(x.store.state.archive.length,2);assert.equal(x.store.state.pendingChanges.length,0);
});
test('Correo: código, caducidad lógica, límite de intentos y cambio de dirección',async()=>{
 const x=setup();x.store.state.emailVerified=false;await x.service.sendCode('owner@example.com');
 const code=/es (\d{6})/.exec(x.sent[0][2])[1];assert.ok(!JSON.stringify(x.store.state).includes(code));
 await x.service.verifyCode('owner@example.com',code);assert.equal(x.store.state.emailVerified,true);
 await x.service.configure('owner@example.com',{enabled:true,time:'21:00',email:'new@example.com'});assert.equal(x.store.state.emailVerified,false);
 await x.service.sendCode('owner@example.com');for(let i=0;i<5;i++)await assert.rejects(()=>x.service.verifyCode('owner@example.com','000000'));
 const next=/es (\d{6})/.exec(x.sent[1][2])[1];await assert.rejects(()=>x.service.verifyCode('owner@example.com',next));
});
test('APIs: anónimo y secretos falsos no ejecutan acciones; multiusuario bloqueado',async()=>{
 const x=setup(),handler=createNotificationHandler({env,service:x.service});
 const call=async(query={},headers={})=>{let status;const res={setHeader(){},status(n){status=n;return this;},json(data){return data;}};await handler({method:'POST',query,headers,body:{}},res);return status;};
 assert.equal(await call(),401);assert.equal(await call({run:'daily'},{authorization:'Bearer fake'}),403);assert.equal(await call({hook:'telegram'}),410);assert.equal(x.sent.length,0);
 const multi=new NotificationService({env:{...env,AUTH_ALLOWED_EMAILS:'a@example.com,b@example.com'},store:x.store,providers:x.providers});await assert.rejects(()=>multi.run(now),/exactamente una cuenta/);
});
test('Proveedores: texto plano, claves privadas y clasificación conservadora',async()=>{
 let body,headers;const p=createProviders({RESEND_API_KEY:'private',NOTIFICATION_FROM:'a@example.com'},async(url,opt)=>{body=JSON.parse(opt.body);headers=opt.headers;return {ok:true,json:async()=>({id:'ok'})};});
 await p.email('b@example.com','contenido','stable');assert.equal(body.text,'contenido');assert.equal(body.html,undefined);assert.equal(headers['Idempotency-Key'],'stable');
 const timeout=createProviders({RESEND_API_KEY:'private',NOTIFICATION_FROM:'a@example.com'},async()=>{throw Error('timeout');});await assert.rejects(()=>timeout.email('b','c','d'),e=>e.kind==='uncertain');
 assert.equal(telegramParts('😀'.repeat(3000)).join(''),'😀'.repeat(3000));assert.ok(telegramParts('😀'.repeat(3000)).every(p=>p.length<=3500));
});


test('Solo email: bloquea trabajos Telegram antiguos y respeta switch y destino verificado',async()=>{
 const x=setup();x.store.state.jobs={legacy:{date:'2026-10-21',channel:'telegram',destination:'123',text:'old',index:0,status:'retry',attempts:0}};
 await x.service.run(now);assert.equal(x.sent.filter(s=>s[0]==='telegram').length,0);assert.equal(x.sent.filter(s=>s[0]==='email').length,1);
 const status=await x.service.status('owner@example.com');assert.equal(status.telegramConfigured,false);assert.equal(status.telegramLinked,false);
 const off=setup();off.store.state.enabled=false;await off.service.run(now);assert.equal(off.sent.length,0);
 const pending=setup();pending.store.state.emailVerified=false;await pending.service.run(now);assert.equal(pending.sent.length,0);
 const handler=createNotificationHandler({env:{...env,CONSULTOR_REQUIRE_LOGIN:'false',GOOGLE_SERVICE_ACCOUNT_EMAIL:'test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'test'},service:x.service});for(const operation of ['telegramLink','confirmTelegram']){let code;await handler({method:'POST',headers:{origin:'https://example.com'},body:{operation}}, {setHeader(){},status(n){code=n;return this;},json(){}});assert.equal(code,410);}
});
