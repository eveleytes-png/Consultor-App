import {requireConsultant,singleConsultant} from './sheets.mjs';
import {NotificationService,safeEqual} from '../lib/notification-service.mjs';
export function createNotificationHandler({env=process.env,service=new NotificationService({env})}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
   const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(b&&JSON.stringify(b).length>100000)throw Object.assign(Error('Solicitud demasiado grande.'),{status:413});
   if(req.query?.hook==='telegram'){
    if(req.method!=='POST'||!safeEqual(req.headers['x-telegram-bot-api-secret-token'],env.TELEGRAM_WEBHOOK_SECRET))return res.status(403).json({error:'Acceso denegado.'});
    await service.telegramHook(b||{});return res.status(200).json({ok:true});
   }
   if(req.query?.run==='daily'){
    if(req.method!=='POST'||!safeEqual(req.headers.authorization,'Bearer '+(env.NOTIFICATION_CRON_SECRET||''))||!env.NOTIFICATION_CRON_SECRET)return res.status(403).json({error:'Acceso denegado.'});
    singleConsultant(env);
    try{return res.status(200).json(await service.run());}
    catch(e){await service.store.update(singleConsultant(env),s=>{s.lastError='No se pudo generar el resumen. Revisá la fuente, agenda y configuración del servidor.';});throw e;}
   }
   const owner=requireConsultant(req,env);
   if(req.method==='GET')return res.status(200).json(await service.status(owner));
   if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
   switch(b?.operation){
    case 'configure':await service.configure(owner,b);break;
    case 'emailCode':await service.sendCode(owner);break;
    case 'verifyEmail':await service.verifyCode(owner,b.code);break;
    case 'telegramLink':return res.status(200).json({url:await service.telegramLink(owner)});
    case 'confirmTelegram':await service.confirmTelegram(owner);break;
    case 'unlinkTelegram':await service.store.update(owner,s=>{delete s.telegramChat;delete s.pendingChat;delete s.challenges.telegram;});break;
    case 'refresh':await service.refreshSource(owner);break;
    case 'review':await service.reviewChanges(owner,b.version);break;
    case 'preview':return res.status(200).json({text:await service.preview(owner)});
    default:return res.status(400).json({error:'Operación no permitida.'});
   }
   return res.status(200).json(await service.status(owner));
  }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'No se pudo completar la operación. Revisá la configuración del servidor.'});}
 };
}
export default createNotificationHandler();
