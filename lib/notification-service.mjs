import {compareMerchants,mergePending} from './portfolio-changes.mjs';
import {PortfolioWorkflow} from './portfolio-workflow.mjs';
import {createHash,randomBytes,timingSafeEqual,randomInt} from 'node:crypto';
import {NotificationStore} from './notification-store.mjs';
import {createProviders} from './notification-providers.mjs';
import {googleRequest,singleConsultant} from '../api/sheets.mjs';
import portfolio from '../home.js';
import {buildDailySummary,composeDailyEmail,localDay} from './daily-summary.mjs';
export const digest=v=>createHash('sha256').update(v).digest('hex');
export const safeEqual=(a,b)=>{const aa=Buffer.from(a||''),bb=Buffer.from(b||'');return aa.length>0&&aa.length===bb.length&&timingSafeEqual(aa,bb);};
const fail=(text,status=400)=>Object.assign(Error(text),{status});
const nowISO=()=>new Date().toISOString();
const scheduleTime=now=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class NotificationService{
 constructor({env=process.env,store=new NotificationStore(env),providers=createProviders(env),google=googleRequest,portfolioLock,clock=()=>new Date(),wait=pause}={}){
  Object.assign(this,{env,store,providers,google,clock,wait});this.workflow=new PortfolioWorkflow(this,portfolioLock);
 }
 automaticStatus(s){
  const now=this.clock(),date=localDay(now).date,time=s.time||'09:00';
  if(s.dailyRun?.date===date){
   if(s.dailyRun.status!=='running')return s.dailyRun.status;
   return Date.parse(s.dailyRun.startedAt)+300000<now.getTime()?'missed':'running';
  }
  const scheduleWasActive=s.scheduleSince==null||localDay(new Date(s.scheduleSince)).date!==date||scheduleTime(new Date(s.scheduleSince))<=time;
  return s.enabled&&scheduleWasActive&&scheduleTime(now)>time?'missed':null;
 }
 async status(owner,privateSession=false){
  const {state:s}=await this.store.read(owner);
  return {enabled:!!s.enabled,time:s.time||'09:00',email:s.email||'',emailVerified:!!s.emailVerified,telegramLinked:false,telegramPending:false,telegramExpired:false,telegramCandidate:null,
   emailConfigured:this.providers.emailConfigured,telegramConfigured:false,
   jobs:Object.values(s.jobs||{}).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(j=>({date:j.date,channel:j.channel,status:j.status,attempts:j.attempts})),
   automaticStatus:this.automaticStatus(s),
   canReview:privateSession,reviewReady:s.portfolioReview===true&&!s.portfolioReviewError,
   registrationEnabled:this.workflow.enabled,writesEnabled:privateSession&&this.workflow.enabled,backupError:s.portfolioBackupError||null,
   sourceVersion:s.sourceVersion||null,changes:privateSession&&s.portfolioReview===true?(s.pendingChanges||[]).map(({id,kind,name,applicable})=>({id,kind,name,applicable})):[],reviewError:s.portfolioReviewError||null,sourceAt:s.sourceAt||null,lastError:s.lastError||null};
 }
 async configure(owner,b){
  if(/@resend\.dev>?$/.test(this.env.NOTIFICATION_FROM||'')&&typeof b.email==='string'&&b.email&&b.email.toLowerCase()!==owner)throw fail('El remitente de prueba solo permite enviar al correo de la cuenta de Resend. Para otro destino, primero verificá un dominio propio.');
  if(typeof b.enabled!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)||typeof b.email!=='string'||b.email.length>254||(b.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)))throw fail('Revisá correo y horario.');
  await this.workflow.withLock(()=>this.store.update(owner,s=>{
   if(s.email!==b.email){s.email=b.email;s.emailVerified=false;delete s.challenges.email;}
   if(s.time!==b.time||s.enabled!==b.enabled||!s.scheduleVersion){
    s.scheduleVersion=randomBytes(16).toString('hex');s.scheduleSince=this.clock().toISOString();
   }
   s.enabled=b.enabled;s.time=b.time;
  }));
 }
 async sendCode(owner){
  if(!this.providers.emailConfigured)throw fail('Falta configurar el proveedor de correo.',503);
  const code=String(randomInt(100000,1000000)),id=randomBytes(16).toString('hex');
  const email=await this.store.update(owner,s=>{
   if(!s.email)throw fail('Guardá primero el correo de destino.');
   if(s.challenges.email?.sentAt>Date.now()-60000)throw fail('Esperá un minuto antes de pedir otro código.',429);
   s.challenges.email={hash:digest(code),id,expires:Date.now()+600000,sentAt:Date.now(),attempts:0,email:s.email};return s.email;
  });
  await this.providers.email(email,`Tu código de verificación de Consultor App es ${code}. Vence en 10 minutos.`, 'verify-'+id,'Verificá tu correo · Consultor App');
 }
 async verifyCode(owner,code){
  const ok=await this.store.update(owner,s=>{
   const c=s.challenges.email;if(!c||c.expires<Date.now()||c.attempts>=5||c.email!==s.email)return false;
   c.attempts++;if(!safeEqual(digest(String(code)),c.hash))return false;
   s.emailVerified=true;delete s.challenges.email;return true;
  });if(!ok)throw fail('Código incorrecto o vencido.');
 }
 parseSummaryRows(values){
  if(!Array.isArray(values)||!values.length)throw fail('Importación vacía o fallida; no se procesaron diferencias.',503);
  const mapping=portfolio.mapPortfolioHeaders(values[0]);
  if(['e','id','accept','survey','blindaje'].some(k=>mapping[k]<0))throw fail('Cambió la estructura de Base Consultor App.',503);
  // Reject ambiguous mapped headers instead of interpreting their first match.
  for(const col of Object.values(mapping).filter(c=>c>=0))if(values[0].filter(h=>portfolio.normalizeAnswer(h)===portfolio.normalizeAnswer(values[0][col])).length!==1)throw fail('Encabezados ambiguos en Base Consultor App.',503);
  const rows=portfolio.parsePortfolioRows(values,mapping);
  if(!rows.length)throw fail('Base Consultor App está vacía; se requiere revisión manual.',503);
  return rows;
 }
 async reconcileLocked(owner){
  const checkedAt=this.clock().toISOString();
  try{
    const data=await this.workflow.read();
    const detected=compareMerchants(data.imported,data.portfolio);
    const rows=this.parseSummaryRows(data.activeValues),version=digest(JSON.stringify(rows));
    let backupError=null;
    try{await this.store.saveSnapshots(owner,await this.workflow.captureObservedRows(data));}
    catch{backupError='No se pudo renovar el respaldo de cartera.';}
    await this.store.update(owner,s=>{
     if(!s.portfolioReview){
      s.portfolioLegacyPending=s.pendingChanges||[];
      s.pendingChanges=[];
     }
     s.portfolioReview=true;
     s.pendingChanges=mergePending(s.pendingChanges||[],detected,true,checkedAt);
     s.portfolioCheckedAt=checkedAt;
     if(backupError)s.portfolioBackupError=backupError;
     else delete s.portfolioBackupError;
     s.sourceRows=rows;s.sourceVersion=version;s.sourceAt=nowISO();s.lastError=null;
     delete s.portfolioReviewError;
    });
    return {rows,version};
  }catch(error){
   await this.store.update(owner,s=>{
    s.portfolioCheckedAt=checkedAt;
    s.portfolioReviewError=error.importValidation?error.message:'No pudimos verificar las diferencias de cartera.';
   });
   if(error.importValidation)throw error;
   throw fail('No se pudieron conciliar las planillas. Los pendientes anteriores se conservaron.',503);
  }
 }
 async reviewChanges(owner){return this.workflow.withLock(()=>this.reconcileLocked(owner));}
 async preview(owner,now=new Date()){
  return (await this.previewMessage(owner,now)).text;
 }
 async previewMessage(owner,now=new Date()){
  const {state:s}=await this.store.read(owner),rows=s.sourceRows;
  if(!Array.isArray(rows)||!s.portfolioReview)throw fail('Todavía no hay una conciliación guardada. Realizá una conciliación para preparar el resumen.',409);
  const shared=await this.store.call('consultor_shared_state?id=eq.demo&select=revision,data');
  if(shared.length!==1||!Array.isArray(shared[0].data?.activities))throw fail('Agenda no disponible.',503);
  const pending=s.portfolioReview?(s.pendingChanges||[]).filter(c=>c.applicable!==false):[];
  const changes={additions:pending.filter(c=>c.kind==='add').length,removals:pending.filter(c=>c.kind==='remove').length,unverified:!!s.portfolioReviewError||!s.portfolioReview};
  const summary=buildDailySummary({rows,activities:shared[0].data.activities,changes,now});
  return composeDailyEmail(summary,this.env.APP_ORIGIN||'https://consultor-app.vercel.app');
 }
 // Manual review delivery is isolated from daily payloads and daily job keys.
 async sendTest(owner,requestId){
  if(typeof requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(requestId))throw fail('Identificador de envío inválido.');
  const {state:s}=await this.store.read(owner);
  if(!s.email||!s.emailVerified||!this.providers.emailConfigured)throw fail('Verificá el correo y el proveedor antes de enviar una prueba.');
  const message=await this.previewMessage(owner);
  const destination=await this.store.update(owner,v=>{
   if(v.email!==s.email||!v.emailVerified)throw fail('Cambió el correo de destino. Actualizá antes de enviar.',409);
   if(v.testDelivery?.requestId===requestId||v.testDelivery?.startedAt>Date.now()-60000)throw fail('La prueba ya se solicitó. Revisá tu correo antes de repetirla.',409);
   v.testDelivery={requestId,destination:v.email,startedAt:Date.now(),status:'processing'};return v.email;
  });
  try{
   const providerId=await this.providers.email(destination,message.text,'test-'+digest(owner+':'+requestId),'Prueba · Tu resumen diario · Consultor App',message.html);
   await this.store.update(owner,v=>{if(v.testDelivery?.requestId===requestId)Object.assign(v.testDelivery,{status:'accepted',providerId});});
   return {status:'accepted',destination,providerId};
  }catch(error){
   await this.store.update(owner,v=>{if(v.testDelivery?.requestId===requestId)v.testDelivery.status=error.kind==='permanent'?'failed':'uncertain';});
   throw fail('No se pudo confirmar la prueba. Revisá el correo antes de intentar otro envío.',503);
  }
 }
 async run(scheduleVersion){
  // Old jobs and late requests must never reach Google Sheets.
  if(typeof scheduleVersion!=='string'||!/^[a-f0-9]{32}$/.test(scheduleVersion))return {skipped:true};
  const owner=singleConsultant(this.env);
  const permitted=(s,now)=>s.enabled&&s.scheduleVersion===scheduleVersion&&scheduleTime(now)===(s.time||'09:00')&&s.dailyRun?.date!==localDay(now).date;
  const initial=(await this.store.read(owner)).state;
  if(!permitted(initial,this.clock()))return {skipped:true};
  let delivery;
  const runLocked=()=>this.workflow.withLock(async()=>{
    const current=(await this.store.read(owner)).state,now=this.clock();
    if(!permitted(current,now))return null;
    const date=localDay(now).date;
    const claimed=await this.store.update(owner,s=>{
     if(!permitted(s,this.clock()))return false;
     s.dailyRun={date,status:'running',startedAt:now.toISOString()};
     return true;
    });
    if(!claimed)return null;
    try{
     if(scheduleTime(this.clock())!==(current.time||'09:00')){
      await this.store.update(owner,s=>{s.dailyRun.status='missed';});
      return null;
     }
     await this.reconcileLocked(owner);
     await this.store.update(owner,s=>{s.dailyRun.status='completed';});
    }catch(error){
     await this.store.update(owner,s=>{s.dailyRun.status='failed';});
     if(!current.portfolioReview||!Array.isArray(current.sourceRows))throw error;
    }
    if(!current.emailVerified||!current.email||!this.providers.emailConfigured)return null;
    const {text,html}=await this.previewMessage(owner,now),key=date+':email:0';
    return this.store.update(owner,s=>{
     if(!s.enabled||!s.emailVerified||s.email!==current.email)return null;
     s.jobs||={};
     for(const [oldKey,job] of Object.entries(s.jobs)){
      if(job.date<new Date(now.getTime()-35*86400000).toISOString().slice(0,10))delete s.jobs[oldKey];
     }
     s.jobs[key]||={date,channel:'email',destination:s.email,text,html,status:'pending',attempts:0};
     return key;
    });
  });
  for(let attempt=0;attempt<8;attempt++){
   if(!permitted(initial,this.clock()))return {skipped:true};
   try{delivery=await runLocked();break;}
   catch(error){
    if(!error.lockBusy)throw error;
    if(attempt<7)await this.wait(5000);
   }
  }
  if(!delivery)return {skipped:true};
  const results=[];
  for(let attempt=0;attempt<3;attempt++){
   const claim=randomBytes(12).toString('hex');
   const job=await this.store.update(owner,s=>{
    const item=s.jobs?.[delivery];
    if(!item||!s.enabled||!s.emailVerified||item.destination!==s.email||!['pending','retry'].includes(item.status)||item.attempts>=3)return null;
    Object.assign(item,{status:'processing',startedAt:Date.now(),claim,attempts:item.attempts+1});
    return structuredClone(item);
   });
   if(!job)break;
   let status='accepted',providerId=null,errorKind=null;
   try{providerId=await this.providers.email(job.destination,job.text,'daily-'+digest(owner+':'+delivery),undefined,job.html);}
   catch(error){
    errorKind=['temporary','permanent','uncertain'].includes(error.kind)?error.kind:'uncertain';
    status=errorKind==='temporary'?(job.attempts<3?'retry':'failed'):errorKind==='permanent'?'failed':'uncertain';
   }
   await this.store.update(owner,s=>{
    const item=s.jobs?.[delivery];
    if(item?.claim===claim)Object.assign(item,{status,providerId,errorKind,finishedAt:nowISO()});
   });
   results.push({channel:'email',status});
   if(status!=='retry')break;
   await this.wait(1000*job.attempts);
  }
  return {results};
 }
}
