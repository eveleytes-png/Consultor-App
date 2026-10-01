(function(root){
  const sections=['activities','links','actions','assignments','equipment'];
  class SupabaseStore {
    constructor(config, request=(...args)=>globalThis.fetch(...args)){this.config=config;this.request=request;this.revision=null;this.loading=false;}
    async call(path,options={}){
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await this.request(this.config.url+'/rest/v1/'+path,{...options,signal:controller.signal,headers:{apikey:this.config.publishableKey,'Content-Type':'application/json',...options.headers}});
        const data=await response.json();
        if(!response.ok){const error=Error(data.code==='40001'?'Otro dispositivo guardó cambios. Cerrá el formulario, actualizá y volvé a intentarlo.':data.code==='PGRST205'||data.code==='PGRST202'?'Falta ejecutar la configuración de Supabase.':'No se pudo completar el guardado o la lectura en Supabase.');error.code=data.code;throw error;}
        return data;
      }catch(error){if(error.name==='AbortError'||error instanceof TypeError)throw Error('No se pudo confirmar la conexión. Actualizá antes de volver a guardar.');throw error;}finally{clearTimeout(timeout);}
    }
    validate(row){if(!row||!Number.isInteger(row.revision)||!Array.isArray(row.sellers)||!sections.every(k=>Array.isArray(row.data?.[k])))throw Error('La base compartida no tiene un formato compatible.');return row;}
    async read(){const rows=await this.call('consultor_shared_state?id=eq.demo&select=revision,sellers,data');return this.validate(rows[0]);}
    async changed(){const rows=await this.call('consultor_shared_state?id=eq.demo&select=revision');return rows[0]?.revision!==this.revision;}
    async save(data){if(this.revision===null)throw Error('Actualizá los datos antes de guardar.');const row=this.validate(await this.call('rpc/consultor_save_demo',{method:'POST',body:JSON.stringify({expected_revision:this.revision,new_data:Object.fromEntries(sections.map(k=>[k,data[k]]))})}));this.revision=row.revision;return row;}
  }
  root.SupabaseStore=SupabaseStore;
  if(typeof module!=='undefined')module.exports=SupabaseStore;
})(typeof window==='undefined'?globalThis:window);
