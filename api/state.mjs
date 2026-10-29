import {requireConsultant} from './sheets.mjs';
import {NotificationStore} from '../lib/notification-store.mjs';
import {validateUserProfile} from '../lib/profile-settings.mjs';
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
   if(b.path==='rpc/consultor_update_details'&&b.method==='POST'&&b.data?.change?.kind==='userProfile'){
    const {expected_revision:revision,change}=b.data;
    const profile=validateUserProfile(change);
    if(!Number.isInteger(revision))throw Error('Revisión de perfil inválida.');
    const rows=await store.call(reads[0]),row=rows[0];
    if(!row||row.revision!==revision)throw Object.assign(Error('Otro dispositivo guardó cambios. Actualizá antes de reintentar.'),{status:409});
    const data={...row.data,settings:{...row.data.settings,profile:{...row.data.settings?.profile,...profile}}};
    const updated=await store.call('consultor_shared_state?id=eq.demo&revision=eq.'+revision,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data,revision:revision+1,updated_at:new Date().toISOString()})});
    if(updated.length!==1)throw Object.assign(Error('El perfil cambió. Actualizá antes de reintentar.'),{status:409});
    return res.status(200).json(updated[0]);
   }
   if(b.path==='rpc/consultor_update_details'&&b.method==='POST'&&b.data?.change?.kind==='card'&&Object.hasOwn(b.data.change,'additionalColumns')){
    const {expected_revision:revision,change}=b.data;
    const valid=value=>typeof value==='string'&&/^c\d{1,3}$/.test(value);
    if(!Number.isInteger(revision)||!valid(change.title)||!Array.isArray(change.additionalColumns)||change.additionalColumns.length>100||!change.additionalColumns.every(valid)||new Set(change.additionalColumns).size!==change.additionalColumns.length)throw Error('Preferencias inválidas.');
    const rows=await store.call(reads[0]),row=rows[0];
    if(!row||row.revision!==revision)throw Object.assign(Error('Otro dispositivo guardó cambios. Actualizá antes de reintentar.'),{status:409});
    const data={...row.data,settings:{...row.data.settings,card:{...row.data.settings?.card,title:change.title,additional:change.additionalColumns[0]||'',additionalColumns:change.additionalColumns}}};
    const updated=await store.call('consultor_shared_state?id=eq.demo&revision=eq.'+revision,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data,revision:revision+1,updated_at:new Date().toISOString()})});
    if(updated.length!==1)throw Object.assign(Error('La configuración cambió. Actualizá antes de reintentar.'),{status:409});
    return res.status(200).json(updated[0]);
   }
   if(['rpc/consultor_save_demo','rpc/consultor_update_details'].includes(b.path)&&b.method==='POST')return res.status(200).json(await store.call(b.path,{method:'POST',body:JSON.stringify(b.data)}));
   return res.status(400).json({error:'Operación no permitida.'});
  }catch(e){return res.status(e.status||400).json({error:e.status?e.message:'Solicitud inválida.'});}
 };
}
export default createStateHandler();
