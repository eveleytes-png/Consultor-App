import {createHash} from 'node:crypto';
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function coordinates(value){
 if(typeof value!=='string'||!value.trim())return null;
 const text=value.trim(),p=/[;,]/.test(text)?text.split(/[;,]/).map(v=>v.trim()):text.split(/\s+/);
 if(p.length!==2||p.some(v=>!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)))return null;
 const c=p.map(Number);return c.every(Number.isFinite)&&Math.abs(c[0])<=90&&Math.abs(c[1])<=180?c:null;
}
export function addressColumn(headers){return headers.findIndex(h=>['direccion','direccion comercio','direccion del comercio'].includes(norm(h)));}
export function strictResult(data,address){
 const results=data?.results;if(!Array.isArray(results)||results.length!==1)return null;
 const r=results[0],rank=r.rank||{},parsed=data.query?.parsed;
 if(r.result_type!=='building'||rank.match_type!=='full_match'||rank.confidence!==1||rank.confidence_building_level!==1||rank.confidence_street_level!==1||r.country_code!=='ar')return null;
 if(!parsed?.housenumber||!parsed.street||!parsed.city||!r.housenumber||!r.street||!r.city)return null;
 if(norm(parsed.housenumber)!==norm(r.housenumber)||norm(parsed.street)!==norm(r.street)||norm(parsed.city)!==norm(r.city))return null;
 if(parsed.state&&norm(parsed.state)!==norm(r.state))return null;
 // A numbered street alone must never be mistaken for a street plus house number.
 const first=norm(address.split(',')[0]);if(!first.includes(norm(parsed.street))||!new RegExp('(?:^| )'+norm(parsed.housenumber)+'(?: |$)').test(first.replace(norm(parsed.street),'')))return null;
 if(/\b(?:s\s*\/\s*n|sin numero)\b/i.test(address))return null;
 return coordinates(`${r.lat},${r.lon}`);
}
export function createGeocoder({env=process.env,request=fetch,now=Date.now}={}){
 const cache=new Map(),pending=new Map();let queue=Promise.resolve(),next=0;
 return async address=>{
  if(!address?.trim()||address.length>1000)return {status:'insufficient',coordinates:null};
  if(!env.GEOAPIFY_API_KEY)return {status:'unavailable',coordinates:null};
  const key=createHash('sha256').update(address).digest('hex'),hit=cache.get(key);
  if(hit&&hit.until>now())return hit.value;
  if(pending.has(key))return pending.get(key);
  const work=queue.catch(()=>{}).then(async()=>{
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,next-now())));next=now()+300;
   let value;
   try{
    const url=new URL('https://api.geoapify.com/v1/geocode/search');url.search=new URLSearchParams({text:address,filter:'countrycode:ar',format:'json',limit:'2',apiKey:env.GEOAPIFY_API_KEY}).toString();
    const response=await request(url,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Geocoding unavailable');
    const coords=strictResult(await response.json(),address);value={status:coords?'resolved':'unresolved',coordinates:coords};
   }catch{value={status:'unavailable',coordinates:null};}
   if(cache.size>=5000)cache.delete(cache.keys().next().value);
   cache.set(key,{until:now()+(value.status==='unavailable'?60000:86400000),value});return value;
  });
  queue=work;pending.set(key,work);try{return await work;}finally{pending.delete(key);}
 };
}
