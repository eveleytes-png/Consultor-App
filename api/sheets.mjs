/* Shared server connection, like MisionesMP. Never expose service credentials. */
import {createHmac,timingSafeEqual} from 'node:crypto';
const FILE='1yKyxi4zM3XBVc7-XY3gDZ9TiWrdpbnTdoOUq5p9n73E';
const TABS={0:'BaseApp',500157585:'Points_ConsultoresApp',1266882678:'Links_ConsultoresApp'};
const CLIENT='503544568734-pb0dmd3mud6in8eeiigvpps8v26u6s5v.apps.googleusercontent.com';
const COOKIE='__Host-consultor-session';
const META='?fields=spreadsheetId,properties(title),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))';
const googleClients=new Map();
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const b64=value=>Buffer.from(value).toString('base64url');
function config(env){return {email:env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key:env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g,'\n'),secret:env.AUTH_SECRET,client:env.AUTH_GOOGLE_ID||CLIENT,origin:env.APP_ORIGIN||'https://consultor-app.vercel.app',allowed:(env.AUTH_ALLOWED_EMAILS||'eveleytes@gmail.com').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean)};}
function configured(c){return !!(c.email&&c.key&&c.secret?.length>=32&&c.allowed.length);}
function session(cookie,c){try{const raw=(cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!raw)return null;const parts=raw.split('.');if(parts.length!==2)return null;const signature=createHmac('sha256',c.secret).update(parts[0]).digest(),supplied=Buffer.from(parts[1],'base64url');if(signature.length!==supplied.length||!timingSafeEqual(signature,supplied))return null;const value=JSON.parse(Buffer.from(parts[0],'base64url'));return value.exp>Date.now()/1000&&c.allowed.includes(value.email)?value:null;}catch{return null;}}
function cookieFor(email,c){const payload=b64(JSON.stringify({email,exp:Math.floor(Date.now()/1000)+7*86400}));return `${COOKIE}=${payload}.${createHmac('sha256',c.secret).update(payload).digest('base64url')}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;}
function authorizeOperation(path,body){
 if(path===META){if(body!==undefined&&body!==null)throw fail('Metadatos inválidos.');return 'read';}
 if(path==='/values:batchGetByDataFilter'){
  if(body?.majorDimension!=='ROWS'||body?.valueRenderOption!=='FORMATTED_VALUE'||Object.keys(body).some(k=>!['dataFilters','majorDimension','valueRenderOption'].includes(k))||!Array.isArray(body.dataFilters)||body.dataFilters.length!==1)throw fail('Lectura no permitida.');
  const filter=body.dataFilters[0],r=filter.gridRange;
  if(Object.keys(filter).length!==1||!r||!Object.hasOwn(TABS,r.sheetId)||!Number.isInteger(r.sheetId)||r.startRowIndex!==0||Object.keys(r).some(k=>!['sheetId','startRowIndex','endRowIndex'].includes(k))||(r.endRowIndex!==undefined&&r.endRowIndex!==1))throw fail('Pestaña o intervalo no permitido.');
  return 'read';
 }
 if(path!==':batchUpdate'||!Array.isArray(body?.requests)||!body.requests.length||body.requests.length>10000)throw fail('Operación no permitida.');
 for(const request of body.requests){
  if(Object.keys(request).length!==1)throw fail('Operación no permitida.');
  if(request.updateCells){const u=request.updateCells,r=u.range;
   if(!r||![500157585,1266882678].includes(r.sheetId)||u.fields!=='userEnteredValue'||Object.keys(u).some(k=>!['range','rows','fields'].includes(k))||Object.keys(r).some(k=>!['sheetId','startRowIndex','endRowIndex','startColumnIndex','endColumnIndex'].includes(k)))throw fail('La cartera es de solo lectura.');
   const width=r.sheetId===500157585?9:5;
   if(![r.startRowIndex,r.endRowIndex,r.startColumnIndex,r.endColumnIndex].every(Number.isInteger)||r.startRowIndex<0||r.endRowIndex<=r.startRowIndex||r.endRowIndex>100000||r.startColumnIndex<0||r.endColumnIndex>width||r.endColumnIndex<=r.startColumnIndex||!Array.isArray(u.rows)||u.rows.length!==r.endRowIndex-r.startRowIndex)throw fail('Celdas no permitidas.');
   for(const row of u.rows){if(Object.keys(row).length!==1||!Array.isArray(row.values)||row.values.length!==r.endColumnIndex-r.startColumnIndex)throw fail('Formato de celdas no permitido.');for(const v of row.values)if(Object.keys(v).length!==1||!v.userEnteredValue||Object.keys(v.userEnteredValue).length!==1||typeof v.userEnteredValue.stringValue!=='string'||v.userEnteredValue.stringValue.length>50000)throw fail('Solo se guardan valores de texto.');}
  }else if(request.updateSheetProperties){const u=request.updateSheetProperties,p=u.properties;if(u.fields!=='gridProperties.rowCount'||![500157585,1266882678].includes(p?.sheetId)||Object.keys(u).length!==2||Object.keys(p).length!==2||Object.keys(p.gridProperties||{}).length!==1||!Number.isInteger(p.gridProperties.rowCount)||p.gridProperties.rowCount<1||p.gridProperties.rowCount>100000)throw fail('Propiedades no permitidas.');}
  else throw fail('No se crean, renombran ni eliminan pestañas.');
 }
 return 'write';
}
async function defaultIdentity(credential,client){const {OAuth2Client}=await import('google-auth-library');const ticket=await new OAuth2Client(client).verifyIdToken({idToken:credential,audience:client});return ticket.getPayload();}
async function defaultGoogle(c,path,body,mode){const {JWT}=await import('google-auth-library');const key=c.email+':'+mode;let auth=googleClients.get(key);if(!auth){auth=new JWT({email:c.email,key:c.key,scopes:[mode==='write'?'https://www.googleapis.com/auth/spreadsheets':'https://www.googleapis.com/auth/spreadsheets.readonly']});googleClients.set(key,auth);}const result=await auth.request({url:'https://sheets.googleapis.com/v4/spreadsheets/'+FILE+path,method:body?'POST':'GET',data:body,timeout:15000});return result.data;}
export function createHandler({env=process.env,verifyIdentity=defaultIdentity,googleRequest=defaultGoogle}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(status,value)=>res.status(status).json(value),c=config(env);
 try{
  if(req.method==='GET'){return send(200,{configured:configured(c),authenticated:configured(c)&&!!session(req.headers.cookie,c),clientId:c.client});}
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return send(405,{error:'Método no permitido.'});}
  if(!configured(c))return send(503,{error:'Falta configurar la conexión compartida en Vercel.'});
  if(req.headers.origin!==c.origin)throw fail('Origen no autorizado.',403);
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||Buffer.byteLength(JSON.stringify(body))>2000000)throw fail('Solicitud inválida.');
  if(body.operation==='login'){
   if(typeof body.credential!=='string'||body.credential.length>10000)throw fail('Credencial inválida.',401);
   let user;try{user=await verifyIdentity(body.credential,c.client);}catch{throw fail('No se pudo verificar la cuenta de Google.',401);}
   const email=user?.email?.trim().toLowerCase();if(!user?.email_verified||!c.allowed.includes(email))throw fail('Esta cuenta no está autorizada para Consultor App.',403);
   res.setHeader('Set-Cookie',cookieFor(email,c));return send(200,{authenticated:true});
  }
  if(!session(req.headers.cookie,c))throw fail('Ingresá con tu cuenta de Google para consultar la planilla.',401);
  if(body.operation==='logout'){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);return send(200,{authenticated:false});}
  const mode=authorizeOperation(body.path,body.body);
  let data;try{data=await googleRequest(c,body.path,body.body,mode);}catch(error){const status=error.response?.status;throw fail(status===403?'La cuenta de servicio no tiene acceso a la planilla. Revisá Compartir.':status===404?'No se encuentra la planilla configurada.':'Google no pudo completar la operación. Actualizá antes de reintentar.',502);}
  if(body.path===META){data={...data,sheets:(data.sheets||[]).filter(s=>Object.hasOwn(TABS,s.properties?.sheetId))};for(const [id,title] of Object.entries(TABS))if(!data.sheets.some(s=>s.properties.sheetId===Number(id)&&s.properties.title===title))throw fail('Cambió el nombre o ID de una pestaña configurada.',409);}
  return send(200,data);
 }catch(error){return send(error.status||400,{error:error.status?error.message:'Solicitud inválida.'});}
};}
export default createHandler();
