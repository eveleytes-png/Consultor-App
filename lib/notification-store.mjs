import {privateSupabase} from './private-supabase.mjs';

export class NotificationStore{
 constructor(env=process.env,request=fetch){this.env=env;this.request=request;}
 async call(path,options={}){
  const config=privateSupabase(this.env);
  if(!config)throw Object.assign(Error('Falta configurar el almacenamiento privado.'),{status:503});
  const {url,key}=config;
  const r=await this.request(url+'/rest/v1/'+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});
  const data=r.status===204?null:await r.json();
  if(!r.ok)throw Object.assign(Error(data.code==='40001'?'Otro dispositivo guardó cambios. Actualizá antes de reintentar.':'No se pudo consultar o guardar el almacenamiento privado.'),{status:data.code==='40001'?409:503});
  return data;
 }
 async read(owner){
  const path='consultor_notifications';
  const rows=await this.call(path+'?owner=eq.'+encodeURIComponent(owner)+'&select=revision,state');
  if(rows.length>1)throw Error('Se encontró más de una configuración privada.');
  return rows[0]??{revision:null,state:{jobs:{},challenges:{}}};
 }
 async update(owner,mutate){
  for(let i=0;i<5;i++){
   const row=await this.read(owner),next=structuredClone(row.state),result=mutate(next);
   if(JSON.stringify(row.state)===JSON.stringify(next))return result;
   const updated=row.revision===null?
    await this.call('consultor_notifications?select=revision',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({owner,state:next})}):
    await this.call('consultor_notifications?owner=eq.'+encodeURIComponent(owner)+'&revision=eq.'+row.revision+'&select=revision',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({state:next,revision:row.revision+1})});
   if(updated.length)return result;
  }
  throw Object.assign(Error('La configuración cambió. Volvé a intentar.'),{status:409});
 }
 async saveSnapshots(owner,records){
  for(let i=0;i<records.length;i+=100)await this.call('rpc/consultor_save_notification_snapshots',{method:'POST',body:JSON.stringify({target_owner:owner,records:records.slice(i,i+100)})});
 }
 async findSnapshot(owner,key,email){
  const base='consultor_portfolio_snapshots?owner=eq.'+encodeURIComponent(owner)+'&select=snapshot&limit=2';
  const direct=await this.call(base+'&merchant_key=eq.'+encodeURIComponent(key));
  if(direct.length===1||!email)return direct.length===1?direct[0].snapshot:null;
  const matches=await this.call(base+'&email=eq.'+encodeURIComponent(email));
  return matches.length===1?matches[0].snapshot:null;
 }
}
