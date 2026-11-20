import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid=message=>Object.assign(Error(message),{status:503});
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export const sheetDigest=hash;
export function indexMerchants(values,label,{allowEmpty=false}={}){
 if(!Array.isArray(values?.[0])||!values[0].length)throw invalid('No se pudo leer '+label+'.');
 const headers=values[0].map(norm);
 const column=aliases=>{
  const matches=headers.flatMap((h,i)=>aliases.includes(h)?[i]:[]);
  if(matches.length>1)throw invalid('Encabezados ambiguos en '+label+'.');
  return matches[0]??-1;
 };
 const idCol=column(['id','cust_id comercio']),mailCol=column(['mail','email','e-mail','correo','correo electronico']);
 const nameCol=column(['nombre del comercio','nombre comercio','comercio']);
 if(idCol<0&&mailCol<0)throw invalid('Falta una columna de identidad en '+label+'.');
 const ids=new Map(),emails=new Map(),entries=[];
 for(const [offset,row] of values.slice(1).entries()){
  if(!row.some(v=>String(v??'').trim()))continue;
  const id=String(row[idCol]??'').trim(),email=String(row[mailCol]??'').trim().toLowerCase();
  const validEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'';
  if(!id&&!validEmail)throw invalid('Hay filas sin ID ni email válido en '+label+'.');
  if(id&&ids.has(id))throw invalid('Hay IDs repetidos en '+label+'.');
  const entry={id,email:validEmail,key:id?'id:'+id:'email:'+validEmail,name:String(row[nameCol]||validEmail||id),row,index:offset+1};
  if(id)ids.set(id,entry);
  if(validEmail)emails.set(validEmail,[...(emails.get(validEmail)||[]),entry]);
  entries.push(entry);
 }
 if(!entries.length&&!allowEmpty)throw invalid(label+' está vacía; requiere revisión manual.');
 for(const matches of emails.values())if(matches.length>1&&matches.some(entry=>!entry.id))throw invalid('Hay emails ambiguos sin ID en '+label+'.');
 return {entries,ids,emails,idCol,mailCol};
}
function match(entry,other,own){
 if(entry.id&&other.ids.has(entry.id))return true;
 const matches=other.emails.get(entry.email)||[];
 return !!entry.email&&matches.length===1&&own.emails.get(entry.email)?.length===1&&(!entry.id||!matches[0].id);
}
export function compareMerchants(imported,active){
 return [[imported,active,'add'],[active,imported,'remove']].flatMap(([own,other,kind])=>
  own.entries.filter(entry=>!match(entry,other,own)).map(entry=>({id:entry.key,kind,name:entry.name}))
 ).sort((a,b)=>(a.kind+a.id).localeCompare(b.kind+b.id));
}
export function mergePending(previous,detected,verified,at){
 const changes=new Map(previous.map(change=>[change.kind+':'+change.id,{...change,applicable:false}]));
 for(const change of detected){
  if(change.kind==='remove'&&!verified)continue;
  const key=change.kind+':'+change.id,old=changes.get(key);
  changes.set(key,{...change,firstDetectedAt:old?.firstDetectedAt||at,lastDetectedAt:at,reviewedAt:old?.reviewedAt,applicable:true});
 }
 return [...changes.values()];
}
