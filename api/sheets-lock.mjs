// Uses the same public Supabase project as the existing app, for locks only.
const url='https://pvrtsmhzjkivzvnqkcdl.supabase.co';
const key='sb_publishable_1a0obbksZyZHqUWtbGlyog_z_NdHxsG';
export async function sheetLock(method,owner){
 const name=method==='mark'?'consultor_mark_sheet_write':'consultor_'+method+'_sheet_lock';
 const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({lock_owner:owner}),signal:AbortSignal.timeout(10000)});
 const result=await response.json();
 if(!response.ok)throw Object.assign(Error(result.code==='PGRST202'?'Falta habilitar la protección de guardados en Supabase. No se modificó la planilla.':'No se pudo confirmar la protección del guardado. No reintentes hasta actualizar.'),{status:503});
 return result===true;
}
