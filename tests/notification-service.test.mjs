import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NotificationService} from '../lib/notification-service.mjs';
import {createNotificationHandler} from '../api/notifications.mjs';
import {createProviders,telegramParts,ProviderError} from '../lib/notification-providers.mjs';
class MemoryStore{
 constructor(){this.state={enabled:true,time:'09:00',email:'owner@example.com',emailVerified:true,scheduleVersion:version,telegramChat:'123',jobs:{},challenges:{}};this.agenda=[];}
 async read(){return {state:structuredClone(this.state),revision:1};}
 async update(owner,mutate){const next=structuredClone(this.state),result=mutate(next);this.state=next;return result;}
 async call(){return [{data:{activities:this.agenda}}];}
 async saveSnapshots(){}
}
const version='a'.repeat(32); const owner='owner@example.com';
const env={CONSULTOR_REQUIRE_LOGIN:"true",AUTH_ALLOWED_EMAILS:'owner@example.com',AUTH_SECRET:'a'.repeat(32),APP_ORIGIN:'https://example.com',TELEGRAM_BOT_USERNAME:'test_bot',TELEGRAM_WEBHOOK_SECRET:'secret',NOTIFICATION_CRON_SECRET:'cron-secret'};
function setup(){
 const store=new MemoryStore(),sent=[];
 const providers={emailConfigured:true,telegramConfigured:true,configureTelegramWebhook:async()=>true,email:async(...a)=>{sent.push(['email',...a]);return 'email-id';},telegram:async(...a)=>{sent.push(['telegram',...a]);return 'telegram-id';}};
 let rows=[['Mail','Cust_id comercio','Nombre del comercio','Aceptación','Encuesta valida','Blindaje'],['m@example.com','1','Comercio','Si','No','']];
 let imported=structuredClone(rows),lookupCount=0,lockOwner=null,instant=now;
 const service=new NotificationService({env,store,providers,clock:()=>instant,wait:async()=>{},portfolioLock:async(mode,claim)=>{
  if(mode==='acquire'){if(lockOwner)return false;lockOwner=claim;return true;}
  if(lockOwner!==claim)return false;
  if(mode==='release')lockOwner=null;
  return true;
 },google:async(c,path,body,mode)=>{
  if(path.startsWith('?fields='))lookupCount++;
  assert.equal(mode,'read');
  assert.ok(!path.includes('batchUpdate'));
  if(path.startsWith('?'))return {sheets:[{properties:{sheetId:192864634,title:'Base Consultor App'}},{properties:{sheetId:7,title:'Base importada'}}]};
  return {valueRanges:body.dataFilters.map(({gridRange})=>({dataFilters:[{gridRange}],valueRange:{values:structuredClone(gridRange.sheetId===7?imported:rows)}}))};
 }});
 return {service,store,sent,providers,comparisons:()=>lookupCount,setClock:value=>{instant=new Date(value);},setRows:r=>{rows=r;},setImported:r=>{imported=r;}};
}
const now=new Date('2026-10-21T12:00:00Z');
test('Remitente Resend de prueba exige correo del titular; dominio propio admite otro destino',async()=>{
 const x=setup();x.service.env={...env,NOTIFICATION_FROM:'Consultor App <onboarding@resend.dev>'};
 await assert.rejects(()=>x.service.configure('owner@example.com',{enabled:false,time:'09:00',email:'other@example.com'}),/remitente de prueba/);
 await x.service.configure('owner@example.com',{enabled:false,time:'09:00',email:'owner@example.com'});
 x.service.env.NOTIFICATION_FROM='Consultor App <resumen@dominio-propio.example>';
 await x.service.configure('owner@example.com',{enabled:false,time:'09:00',email:'other@example.com'});
});
test('Dos ejecuciones concurrentes y repetidas: una aceptación por canal',async()=>{
 const x=setup();await Promise.all([x.service.run(version),x.service.run(version)]);await x.service.run(version);
 assert.equal(x.comparisons(),1);
 assert.equal(x.sent.filter(s=>s[0]==='email').length,1);assert.equal(x.sent.filter(s=>s[0]==='telegram').length,0);
 assert.ok(Object.values(x.store.state.jobs).every(j=>j.status==='accepted'));
});

test('La tarea antigua no consulta el estado ni compara las planillas',async()=>{
 const x=setup();
 x.store.read=async()=>{throw Error('No debe consultar Supabase');};
 assert.deepEqual(await x.service.run(),{skipped:true});
 assert.equal(x.comparisons(),0);
});

test('Una importación inválida conserva los pendientes y permite un solo resumen con el último estado',async()=>{
 const x=setup();
 x.setImported([['Mail','Cust_id comercio','Nombre del comercio'],['new@example.com','2','Nuevo comercio']]);
 await x.service.reviewChanges(owner);
 const previous=structuredClone(x.store.state.pendingChanges);
 x.setImported([]);
 await x.service.run(version);
 await x.service.run(version);
 assert.deepEqual(x.store.state.pendingChanges,previous);
 assert.equal(x.store.state.dailyRun.status,'failed');
 assert.equal(x.sent.length,1);
 assert.equal(x.comparisons(),2);
});
for(const failed of ['email'])test(`Reintenta únicamente ${failed} tras 429`,async()=>{
 const x=setup(),original=x.providers[failed];let tries=0;
 x.providers[failed]=async(...args)=>{if(tries++===0)throw new ProviderError('temporary');return original(...args);};
 await x.service.run(version);
 assert.equal(Object.values(x.store.state.jobs).find(j=>j.channel===failed).status,'accepted');
 await x.service.run(version);assert.equal(x.sent.length,1);assert.equal(Object.values(x.store.state.jobs).find(j=>j.channel===failed).attempts,2);
});
test('Timeout de email no reenvía automáticamente',async()=>{const x=setup();x.providers.email=async()=>{throw new ProviderError('uncertain');};await x.service.run(version);await x.service.run(version);assert.equal(x.sent.length,0);const jobs=Object.values(x.store.state.jobs);assert.equal(jobs.length,1);assert.equal(jobs[0].channel,'email');assert.equal(jobs[0].status,'uncertain');assert.equal(jobs[0].attempts,1);});
test('Sin configuración y antes de hora no envía',async()=>{
 const x=setup();x.store.state.emailVerified=false;delete x.store.state.telegramChat;await x.service.run(version);assert.equal(x.sent.length,0);
 x.store.state.emailVerified=true;x.store.state.time='20:00';await x.service.run(version);assert.equal(x.sent.length,0);
});
test('Las diferencias persisten al revisar y sus detalles requieren sesión',async()=>{
 const x=setup(),owner='owner@example.com';
 const headers=['Mail','Cust_id comercio','Nombre del comercio','Aceptación','Encuesta valida','Blindaje'];
 x.setImported([headers,['different@example.com','1','Mismo ID','Si','No',''],['new@example.com','2','Nuevo','No','','']]);
 await x.service.reviewChanges(owner);
 assert.deepEqual(x.store.state.pendingChanges.map(c=>[c.kind,c.id]),[['add','id:2']]);
 assert.deepEqual((await x.service.status(owner)).changes,[]);
 assert.equal((await x.service.status(owner,true)).changes.length,1);
 x.setImported([headers,['m@example.com','1','Mismo ID','Si','No','']]);
 await x.service.reviewChanges(owner);
 assert.equal(x.store.state.pendingChanges.length,1);
 assert.equal(x.store.state.pendingChanges[0].applicable,false);
});
test('La conciliación cuenta altas y bajas sin exponer comercios ni borrar pendientes ante una carga vacía',async()=>{
 const x=setup(),owner='owner@example.com';
 const headers=['Mail','Cust_id comercio','Nombre del comercio','Aceptación','Encuesta valida','Blindaje'];
 x.setImported([headers,['new@example.com','2','Nombre confidencial','No','','']]);
 await x.service.reviewChanges(owner);
 const preview=await x.service.preview(owner,now);
 assert.match(preview,/Hay 1 comercio para agregar y 1 para eliminar/);
 assert.doesNotMatch(preview,/Nombre confidencial|new@example\.com|m@example\.com|id:2/);
 x.setImported([headers]);
 await assert.rejects(()=>x.service.reviewChanges(owner),/vacía o solo tiene encabezados/);
 assert.equal(x.store.state.pendingChanges.length,2);
 assert.match(x.store.state.portfolioReviewError,/vacía o solo tiene encabezados/);
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
 const multi=new NotificationService({env:{...env,AUTH_ALLOWED_EMAILS:'a@example.com,b@example.com'},store:x.store,providers:x.providers});await assert.rejects(()=>multi.run(version),/exactamente una cuenta/);
});
test('Proveedores: texto plano, claves privadas y clasificación conservadora',async()=>{
 let body,headers;const p=createProviders({RESEND_API_KEY:'private',NOTIFICATION_FROM:'a@example.com'},async(url,opt)=>{body=JSON.parse(opt.body);headers=opt.headers;return {ok:true,json:async()=>({id:'ok'})};});
 await p.email('b@example.com','contenido','stable');assert.equal(body.text,'contenido');assert.equal(body.html,undefined);assert.equal(headers['Idempotency-Key'],'stable');
 const timeout=createProviders({RESEND_API_KEY:'private',NOTIFICATION_FROM:'a@example.com'},async()=>{throw Error('timeout');});await assert.rejects(()=>timeout.email('b','c','d'),e=>e.kind==='uncertain');
 assert.equal(telegramParts('😀'.repeat(3000)).join(''),'😀'.repeat(3000));assert.ok(telegramParts('😀'.repeat(3000)).every(p=>p.length<=3500));
});


test('Solo email: bloquea trabajos Telegram antiguos y respeta switch y destino verificado',async()=>{
 const x=setup();x.store.state.jobs={legacy:{date:'2026-10-21',channel:'telegram',destination:'123',text:'old',index:0,status:'retry',attempts:0}};
 await x.service.run(version);assert.equal(x.sent.filter(s=>s[0]==='telegram').length,0);assert.equal(x.sent.filter(s=>s[0]==='email').length,1);
 const status=await x.service.status('owner@example.com');assert.equal(status.telegramConfigured,false);assert.equal(status.telegramLinked,false);
 const off=setup();off.store.state.enabled=false;await off.service.run(version);assert.equal(off.sent.length,0);
 const pending=setup();pending.store.state.emailVerified=false;await pending.service.run(version);assert.equal(pending.sent.length,0);
 const handler=createNotificationHandler({env:{...env,CONSULTOR_REQUIRE_LOGIN:'false',GOOGLE_SERVICE_ACCOUNT_EMAIL:'test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'test'},service:x.service});for(const operation of ['telegramLink','confirmTelegram']){let code;await handler({method:'POST',headers:{origin:'https://example.com'},body:{operation}}, {setHeader(){},status(n){code=n;return this;},json(){}});assert.equal(code,410);}
});

test('HTML y texto congelados juntos: un único envío y el mismo contenido tras reintento',async()=>{
 const x=setup(),original=x.providers.email;let first,attempt=0;
 x.setRows([['Mail','Cust_id comercio','Nombre del comercio','Aceptación','Encuesta valida','Blindaje','Última Fecha contesto'],['m@example.com','1','Comercio','Si','No','','01/01/2024']]);
 x.providers.email=async(...args)=>{if(attempt++===0){first=args;throw new ProviderError('temporary');}assert.deepEqual(args,first);return original(...args);};
 await x.service.run(version);const job=Object.values(x.store.state.jobs)[0];
 assert(job.text.includes('más de 12 meses'));assert(job.text.includes('más de 18 meses'));assert(job.html.includes('Seguimiento de encuestas'));
 const frozen=structuredClone(job);x.setRows([['Mail','Cust_id comercio','Nombre del comercio','Aceptación','Encuesta valida','Blindaje','Última Fecha contesto'],['m@example.com','1','Otro','Si','No','','20/10/2026']]);job.retryAt=0;
 await x.service.run(version);await x.service.run(version);assert.equal(x.sent.length,1);assert.equal(x.sent[0][5],frozen.html);assert.equal(x.store.state.time,'09:00');assert.equal(x.store.state.email,'owner@example.com');
});
test('Proveedor envía HTML opcional con texto alternativo y conserva Telegram',async()=>{
 const requests=[];const p=createProviders({RESEND_API_KEY:'private',NOTIFICATION_FROM:'a@example.com',TELEGRAM_BOT_TOKEN:'private',TELEGRAM_BOT_USERNAME:'fixture',TELEGRAM_WEBHOOK_SECRET:'fixture'},async(url,opt)=>{requests.push({url,body:JSON.parse(opt.body)});return {ok:true,json:async()=>({id:'ok',ok:true,result:{message_id:1}})};});
 await p.email('b@example.com','alternativo','stable',undefined,'<h1>Resumen</h1>');assert.equal(requests[0].body.html,'<h1>Resumen</h1>');assert.equal(requests[0].body.text,'alternativo');
 await p.telegram('123','texto Telegram');assert.equal(requests[1].body.text,'texto Telegram');assert.equal(requests[1].body.html,undefined);
});

test('Prueba manual separada del diario, destinatario verificado y sin duplicar solicitud',async()=>{
 const x=setup(),before=structuredClone(x.store.state),id='12345678-1234-1234-1234-123456789abc';
 await x.service.reviewChanges(owner);const count=x.comparisons();
 const result=await x.service.sendTest('owner@example.com',id);assert.equal(x.comparisons(),count);assert.equal(result.status,'accepted');assert.equal(result.destination,before.email);assert.equal(x.sent.length,1);assert(x.sent[0][5].includes('<html'));assert.deepEqual(x.store.state.jobs,before.jobs);assert.equal(x.store.state.payloadDate,undefined);assert.equal(x.store.state.time,before.time);assert.equal(x.store.state.email,before.email);
 await assert.rejects(()=>x.service.sendTest('owner@example.com',id),/ya se solicitó/);assert.equal(x.sent.length,1);
 const pending=setup();pending.store.state.emailVerified=false;await assert.rejects(()=>pending.service.sendTest('owner@example.com',id),/Verificá/);assert.equal(pending.sent.length,0);
 const timeout=setup();await timeout.service.reviewChanges(owner);timeout.providers.email=async()=>{throw new ProviderError('uncertain');};await assert.rejects(()=>timeout.service.sendTest('owner@example.com',id),/No se pudo confirmar/);assert.equal(timeout.store.state.testDelivery.status,'uncertain');await assert.rejects(()=>timeout.service.sendTest('owner@example.com',id),/ya se solicitó/);
});

test('Cambiar el horario invalida el trabajo anterior y los llamados tardíos',async()=>{
 const x=setup();
 await x.service.configure(owner,{enabled:true,time:'09:20',email:x.store.state.email});
 const current=x.store.state.scheduleVersion;
 assert.notEqual(current,version);
 await x.service.configure(owner,{enabled:true,time:'09:20',email:x.store.state.email});
 assert.equal(x.store.state.scheduleVersion,current);
 await x.service.run();
 await x.service.run(version);
 await x.service.run(current);
 assert.equal(x.comparisons(),0);
 x.setClock('2026-10-21T12:21:00Z');
 await x.service.run(current);
 assert.equal(x.comparisons(),0);
 assert.equal((await x.service.status(owner,true)).automaticStatus,'missed');
 x.setClock('2026-10-22T12:20:00Z');
 await x.service.run(current);
 assert.equal(x.comparisons(),1);
 await x.service.run(current);
 assert.equal(x.comparisons(),1);
 assert.equal((await x.service.status(owner,true)).automaticStatus,'completed');
});

test('Manual y automática comparten un bloqueo; estado y vista previa solo leen',async()=>{
 const x=setup();
 const read=x.service.workflow.read.bind(x.service.workflow);
 let release,entered;
 const started=new Promise(resolve=>{entered=resolve;});
 const delayed=new Promise(resolve=>{release=resolve;});
 x.service.workflow.read=async()=>{entered();await delayed;return read();};
 const manual=x.service.reviewChanges(owner);
 await started;
 await assert.rejects(()=>x.service.reviewChanges(owner),e=>e.status===409);
 assert.deepEqual(await x.service.run(version),{skipped:true});
 release();await manual;
 assert.equal(x.comparisons(),1);
 await x.service.status(owner,true);
 await x.service.preview(owner);
 assert.equal(x.comparisons(),1);
});
