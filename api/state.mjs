import {requireConsultant} from './sheets.mjs';
import {NotificationStore} from '../lib/notification-store.mjs';
export function createStateHandler({env=process.env,store=new NotificationStore(env)}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  try{
   requireConsultant(req,env);
   if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
   const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!b||JSON.stringify(b).length>2100000)throw Error('Solicitud inválida.');
   const reads=['consultor_shared_state?id=eq.demo&select=revision,sellers,data','consultor_shared_state?id=eq.demo&select=revision'];
   if(reads.includes(b.path)&&b.method==='GET')return res.status(200).json(await store.call(b.path));
   if(['rpc/consultor_save_demo','rpc/consultor_update_details'].includes(b.path)&&b.method==='POST')return res.status(200).json(await store.call(b.path,{method:'POST',body:JSON.stringify(b.data)}));
   return res.status(400).json({error:'Operación no permitida.'});
  }catch(e){return res.status(e.status||400).json({error:e.status?e.message:'Solicitud inválida.'});}
 };
}
export default createStateHandler();
