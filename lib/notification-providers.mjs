export class ProviderError extends Error{
 constructor(kind){super('Falló el proveedor: '+kind);this.kind=kind;}
}
export function createProviders(env=process.env,request=fetch){
 async function post(url,body,headers={}){
  let r;
  try{r=await request(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}catch{throw new ProviderError('uncertain');}
  if(r.status===429)throw new ProviderError('temporary');
  if(r.status>=500)throw new ProviderError('uncertain');
  if(!r.ok)throw new ProviderError('permanent');
  try{return await r.json();}catch{throw new ProviderError('uncertain');}
 }
 return {
  emailConfigured:!!(env.RESEND_API_KEY&&env.NOTIFICATION_FROM),
  telegramConfigured:!!(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_BOT_USERNAME&&env.TELEGRAM_WEBHOOK_SECRET),
  async email(to,text,key,subject='Tu resumen diario · Consultor App'){
   if(!this.emailConfigured)throw new ProviderError('permanent');
   const data=await post('https://api.resend.com/emails',{from:env.NOTIFICATION_FROM,to:[to],subject,text},{Authorization:'Bearer '+env.RESEND_API_KEY,'Idempotency-Key':key});
   if(!data.id)throw new ProviderError('uncertain');return data.id;
  },
  async telegram(chat,text){
   if(!this.telegramConfigured)throw new ProviderError('permanent');
   const data=await post('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{chat_id:chat,text,link_preview_options:{is_disabled:true}});
   if(!data.ok||!data.result?.message_id)throw new ProviderError('uncertain');return String(data.result.message_id);
  }
 };
}
// Conservative size leaves room for Telegram UTF-16 accounting. Each fragment
// gets its own durable job; retrying a later fragment never repeats earlier ones.
export function telegramParts(text){
 const parts=[];let current='';
 for(const char of text){if(current.length+char.length>3500){parts.push(current);current='';}current+=char;}
 if(current)parts.push(current);return parts;
}
