const productionHost='pvrtsmhzjkivzvnqkcdl.supabase.co';

export function privateSupabase(env){
 const {SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key}=env;
 if(!url||!key)return null;
 if(env.CONSULTOR_ENV==='test'&&new URL(url).hostname===productionHost)return null;
 return {url,key};
}
