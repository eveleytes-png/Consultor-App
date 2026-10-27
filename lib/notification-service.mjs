import {createHash,randomBytes,timingSafeEqual,randomInt} from 'node:crypto';
import {NotificationStore} from './notification-store.mjs';
import {createProviders,telegramParts} from './notification-providers.mjs';
import {serverConfig,googleRequest,singleConsultant} from '../api/sheets.mjs';
import portfolio from '../home.js';
import {buildDailySummary,composeDailyText,localDay} from './daily-summary.mjs';
export const digest=v=>createHash('sha256').update(v).digest('hex');
export const safeEqual=(a,b)=>{const aa=Buffer.from(a||''),bb=Buffer.from(b||'');return aa.length>0&&aa.length===bb.length&&timingSafeEqual(aa,bb);};
const fail=(text,status=400)=>Object.assign(Error(text),{status});
const nowISO=()=>new Date().toISOString();
export class NotificationService{
 constructor({env=process.env,store=new NotificationStore(env),providers=createProviders(env),google=googleRequest}={}){Object.assign(this,{env,store,providers,google});}
 async status(owner){
  const {state:s}=await this.store.read(owner);
  return {enabled:!!s.enabled,time:s.time||'09:00',email:s.email||'',emailVerified:!!s.emailVerified,telegramLinked:!!s.telegramChat,telegramPending:!!s.pendingChat,telegramCandidate:s.pendingChat?{id:s.pendingChat.id,label:s.pendingChat.label}:null,
   emailConfigured:this.providers.emailConfigured,telegramConfigured:this.providers.telegramConfigured,
   jobs:Object.values(s.jobs||{}).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(j=>({date:j.date,channel:j.channel,status:j.status,attempts:j.attempts})),
   sourceVersion:s.sourceVersion||null,changes:(s.pendingChanges||[]).map(({id,kind,name})=>({id,kind,name})),sourceAt:s.sourceAt||null,lastError:s.lastError||null};
 }
 async configure(owner,b){
  if(/@resend\.dev>?$/.test(this.env.NOTIFICATION_FROM||'')&&typeof b.email==='string'&&b.email&&b.email.toLowerCase()!==owner)throw fail('El remitente de prueba solo permite enviar al correo de la cuenta de Resend. Para otro destino, primero verificá un dominio propio.');
  if(typeof b.enabled!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)||typeof b.email!=='string'||b.email.length>254||(b.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)))throw fail('Revisá correo y horario.');
  await this.store.update(owner,s=>{
   if(s.email!==b.email){s.email=b.email;s.emailVerified=false;delete s.challenges.email;}
   s.enabled=b.enabled;s.time=b.time;
  });
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
 async telegramLink(owner){
  if(!this.providers.telegramConfigured)throw fail('Falta configurar Telegram.',503);
  await this.providers.configureTelegramWebhook(new URL('/api/notifications?hook=telegram',this.env.APP_ORIGIN||'https://consultor-app.vercel.app').href);
  const token=randomBytes(24).toString('base64url');
  await this.store.update(owner,s=>{s.challenges.telegram={hash:digest(token),expires:Date.now()+600000};delete s.pendingChat;});
  return 'https://t.me/'+this.env.TELEGRAM_BOT_USERNAME+'?start='+token;
 }
 async telegramHook(update){
  const owner=singleConsultant(this.env),m=update.message;
  if(m?.chat?.type!=='private'||typeof m.text!=='string')return;
  const match=/^\/start ([A-Za-z0-9_-]{32})$/.exec(m.text);if(!match)return;
  await this.store.update(owner,s=>{
   const c=s.challenges.telegram;
   if(!c||c.expires<Date.now()||!safeEqual(c.hash,digest(match[1])))return;
   s.pendingChat={id:String(m.chat.id),label:m.chat.username?'@'+m.chat.username:String(m.chat.first_name||'Chat privado'),expires:Date.now()+600000};delete s.challenges.telegram;
  });
 }
 async confirmTelegram(owner){
  await this.store.update(owner,s=>{if(!s.pendingChat||s.pendingChat.expires<Date.now())throw fail('Abrí el enlace desde Telegram antes de confirmar.');s.telegramChat=s.pendingChat.id;delete s.pendingChat;});
 }
 async readSource(){
  const result=await this.google(serverConfig(this.env),'/values:batchGetByDataFilter',{dataFilters:[{gridRange:{sheetId:192864634,startRowIndex:0}}],majorDimension:'ROWS',valueRenderOption:'FORMATTED_VALUE'},'read');
  const values=result.valueRanges?.[0]?.valueRange?.values;
  if(!Array.isArray(values)||!values.length)throw fail('Importación vacía o fallida; no se procesaron diferencias.',503);
  const mapping=portfolio.mapPortfolioHeaders(values[0]);
  if(['e','id','accept','survey','blindaje'].some(k=>mapping[k]<0))throw fail('Cambió la estructura de BaseApp.',503);
  // Reject ambiguous mapped headers instead of interpreting their first match.
  for(const col of Object.values(mapping).filter(c=>c>=0))if(values[0].filter(h=>portfolio.normalizeAnswer(h)===portfolio.normalizeAnswer(values[0][col])).length!==1)throw fail('Encabezados ambiguos en BaseApp.',503);
  const rows=portfolio.parsePortfolioRows(values,mapping);
  if(!rows.length)throw fail('BaseApp está vacía; se requiere revisión manual.',503);
  return rows;
 }
 async refreshSource(owner){
  const rows=await this.readSource(),version=digest(JSON.stringify(rows));
  await this.store.update(owner,s=>{
   const previous=s.sourceRows;
   if(previous&&rows.length<previous.length/2)throw fail('BaseApp perdió más de la mitad de sus registros. Revisá la importación antes de continuar.',409);
   if(previous){
    const before=new Map(previous.map(r=>[r.id,r])),after=new Map(rows.map(r=>[r.id,r]));
    s.pendingChanges||=[];
    for(const [kind,items,other] of [['add',after,before],['remove',before,after]])for(const [id,row] of items){
     if(!other.has(id)&&!s.pendingChanges.some(c=>c.id===id&&c.kind===kind))s.pendingChanges.push({id,kind,name:row.n||row.e,detectedAt:nowISO(),row});
    }
   }
   s.sourceRows=rows;s.sourceVersion=version;s.sourceAt=nowISO();s.lastError=null;
  });return {rows,version};
 }
 async reviewChanges(owner,version){
  // BaseApp already controls the active app. Review acknowledges observed source
  // changes; it never inserts/deletes Google rows or erases operational history.
  const fresh=await this.readSource();
  if(digest(JSON.stringify(fresh))!==version)throw fail('La cartera cambió. Actualizá antes de revisar.',409);
  await this.store.update(owner,s=>{
   if(s.sourceVersion!==version)throw fail('La cartera cambió. Actualizá antes de revisar.',409);
   s.archive||=[];for(const c of s.pendingChanges||[])s.archive.push({...c,reviewedAt:nowISO(),version});
   s.pendingChanges=[];
  });
 }
 async preview(owner,now=new Date()){
  const {rows}=await this.refreshSource(owner),{state:s}=await this.store.read(owner);
  const shared=await this.store.call('consultor_shared_state?id=eq.demo&select=revision,data');
  if(shared.length!==1||!Array.isArray(shared[0].data?.activities))throw fail('Agenda no disponible.',503);
  const changes={additions:(s.pendingChanges||[]).filter(c=>c.kind==='add').length,removals:(s.pendingChanges||[]).filter(c=>c.kind==='remove').length};
  const summary=buildDailySummary({rows,activities:shared[0].data.activities,changes,now});
  return composeDailyText(summary,this.env.APP_ORIGIN||'https://consultor-app.vercel.app');
 }
 async run(now=new Date()){
  const owner=singleConsultant(this.env),local=localDay(now),date=local.date;
  const hour=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  let {state:s}=await this.store.read(owner);
  if(!s.enabled||hour<(s.time||'09:00'))return {skipped:true};
  const channels=[...(s.emailVerified&&this.providers.emailConfigured?[['email',s.email]]:[]),...(s.telegramChat&&this.providers.telegramConfigured?[['telegram',s.telegramChat]]:[])];
  if(!channels.length)return {skipped:true};
  // Freeze a daily payload only once; channel retries use the same text.
  if(s.payloadDate!==date){
   const text=await this.preview(owner,now);
   await this.store.update(owner,v=>{if(v.payloadDate!==date){v.payloadDate=date;v.payload=text;}});
  }
  ({state:s}=await this.store.read(owner));
  await this.store.update(owner,v=>{
   v.jobs||={};
   for(const [key,j] of Object.entries(v.jobs)){
    if(j.status==='processing'&&j.startedAt<Date.now()-120000)j.status='uncertain';
    if(j.date!==date&&['pending','retry'].includes(j.status))j.status='skipped';
    if(j.date<new Date(now.getTime()-35*86400000).toISOString().slice(0,10))delete v.jobs[key];
   }
   for(const [channel,destination] of channels){
    const parts=channel==='telegram'?telegramParts(v.payload):[v.payload];
    parts.forEach((text,index)=>{
     const key=`${date}:${channel}:${index}`;
     v.jobs[key]||={date,channel,destination,text,index,status:'pending',attempts:0};
    });
   }
  });
  const jobs=(await this.store.read(owner)).state.jobs,results=[];
  for(const key of Object.keys(jobs).sort()){
   const claim=randomBytes(12).toString('hex');
   const job=await this.store.update(owner,v=>{
    const j=v.jobs[key];if(!j||j.date!==date||!v.enabled||j.attempts>=3||!['pending','retry'].includes(j.status)||(j.retryAt||0)>Date.now())return null;
    if(j.channel==='email'&&(!v.emailVerified||v.email!==j.destination))return null;
    if(j.channel==='telegram'&&v.telegramChat!==j.destination)return null;
    if(j.index>0&&v.jobs[`${date}:${j.channel}:${j.index-1}`]?.status!=='accepted')return null;
    Object.assign(j,{status:'processing',startedAt:Date.now(),claim,attempts:j.attempts+1});return structuredClone(j);
   });
   if(!job)continue;
   let status='accepted',providerId=null,errorKind=null;
   try{providerId=job.channel==='email'?await this.providers.email(job.destination,job.text,'daily-'+digest(owner+':'+key)):await this.providers.telegram(job.destination,job.text);}
   catch(e){errorKind=['temporary','permanent','uncertain'].includes(e.kind)?e.kind:'uncertain';status=e.kind==='temporary'?(job.attempts<3?'retry':'failed'):e.kind==='permanent'?'failed':'uncertain';}
   await this.store.update(owner,v=>{const j=v.jobs[key];if(j?.claim===claim)Object.assign(j,{status,providerId,errorKind,finishedAt:nowISO(),retryAt:Date.now()+job.attempts*300000});});
   results.push({channel:job.channel,status});
  }
  return {results};
 }
}
