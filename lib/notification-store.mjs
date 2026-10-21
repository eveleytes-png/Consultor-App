export class NotificationStore{
 constructor(env=process.env,request=fetch){this.env=env;this.request=request;}
 async call(path,options={}){
  const {SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key}=this.env;
  if(!url||!key)throw Object.assign(Error('Falta configurar el almacenamiento privado.'),{status:503});
  const r=await this.request(url+'/rest/v1/'+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});
  const data=await r.json();
  if(!r.ok)throw Object.assign(Error(data.code==='40001'?'Otro dispositivo guardó cambios. Actualizá antes de reintentar.':'No se pudo consultar o guardar el almacenamiento privado.'),{status:data.code==='40001'?409:503});
  return data;
 }
 async read(owner){
  const path='consultor_notifications';
  await this.call(path,{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({owner})});
  const rows=await this.call(path+'?owner=eq.'+encodeURIComponent(owner)+'&select=revision,state');
  if(rows.length!==1)throw Error('No se encontró la configuración privada.');
  return rows[0];
 }
 async update(owner,mutate){
  for(let i=0;i<5;i++){
   const row=await this.read(owner),next=structuredClone(row.state),result=mutate(next);
   const updated=await this.call('consultor_notifications?owner=eq.'+encodeURIComponent(owner)+'&revision=eq.'+row.revision,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({state:next,revision:row.revision+1})});
   if(updated.length)return result;
  }
  throw Object.assign(Error('La configuración cambió. Volvé a intentar.'),{status:409});
 }
}
