import {randomUUID} from 'node:crypto';
import {serverConfig} from '../api/sheets.mjs';
import {sheetLock} from '../api/sheets-lock.mjs';
import {compareMerchants,indexMerchants,sheetDigest} from './portfolio-changes.mjs';

const fail=(message,status=409)=>Object.assign(Error(message),{status});
const archiveTitle='Comercios eliminados';
const archiveColumns=['Fecha de eliminación','Operación de cartera'];
const range=(id,row,col,width=1)=>({sheetId:id,startRowIndex:row,endRowIndex:row+1,startColumnIndex:col,endColumnIndex:col+width});
const cell=value=>value==null?{}:{userEnteredValue:value};
const str=stringValue=>({stringValue:String(stringValue)});
const update=(id,row,col,values)=>({updateCells:{range:range(id,row,col,values.length),rows:[{values:values.map(cell)}],fields:'userEnteredValue'}});
const filters=ids=>ids.map(sheetId=>({gridRange:{sheetId,startRowIndex:0}}));
const returned=(data,id)=>data.valueRanges?.find(v=>v.dataFilters?.some(f=>f.gridRange&&(f.gridRange.sheetId??0)===id))?.valueRange?.values;
const lookup=(index,key)=>index.entries.find(entry=>entry.key===key);

export class PortfolioWorkflow{
 constructor(service,lock=sheetLock){this.service=service;this.lock=lock;}
 get enabled(){return this.service.env.PORTFOLIO_WRITES_ENABLED==='true';}
 async google(path,body,mode='read'){
  return this.service.google(serverConfig(this.service.env),path,body,mode);
 }
 async read(){
  const meta=await this.google('?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))');
  const tabs=meta.sheets?.map(s=>s.properties)||[];
  const active=tabs.find(t=>t.sheetId===192864634&&t.title==='Base Consultor App');
  const source=tabs.find(t=>t.title==='Base importada'&&t.sheetId!==active?.sheetId);
  if(!active||!source)throw fail('No se encontraron Base Consultor App y Base importada.',503);
  const data=await this.google('/values:batchGetByDataFilter',{dataFilters:filters([source.sheetId,active.sheetId]),majorDimension:'ROWS',valueRenderOption:'FORMATTED_VALUE'});
  const importedValues=returned(data,source.sheetId),activeValues=returned(data,active.sheetId);
  const imported=indexMerchants(importedValues,'Base importada',{allowEmpty:true});
  const portfolio=indexMerchants(activeValues,'Base Consultor App',{allowEmpty:true});
  return {active,source,tabs,importedValues,activeValues,imported,portfolio,digest:sheetDigest(importedValues)};
 }
 async grid(tab){
  const a1="'"+tab.title.replaceAll("'","''")+"'";
  const data=await this.google('?ranges='+encodeURIComponent(a1)+'&fields=sheets(properties(sheetId),data(rowData(values(userEnteredValue,effectiveValue,formattedValue)))');
  const result=data.sheets?.find(s=>s.properties?.sheetId===tab.sheetId)?.data?.[0]?.rowData;
  if(!Array.isArray(result))throw fail('No se pudieron verificar las celdas de '+tab.title+'.',503);
  return result;
 }
 async captureObservedRows(data){
  const grid=await this.grid(data.active),headers=data.activeValues[0],rows=[];
  for(const entry of data.portfolio.entries){
   if(!entry.id||!data.imported.ids.has(entry.id))continue;
   const cells=grid[entry.index]?.values||[];
   if(String(cells[data.portfolio.idCol]?.formattedValue??'').trim()!==entry.id||
      cells.slice(headers.length).some(c=>c.userEnteredValue||c.effectiveValue)||
      cells.some(c=>c.effectiveValue?.errorValue||(c.userEnteredValue?.formulaValue&&!c.effectiveValue)))continue;
   if(entry.row.some((value,i)=>String(value??'')!==String(cells[i]?.formattedValue??'')))continue;
   const values=Array.from({length:headers.length},(_,i)=>cells[i]?.effectiveValue??null);
   const linked=Array.from({length:headers.length},(_,i)=>Boolean(cells[i]?.userEnteredValue?.formulaValue||(!cells[i]?.userEnteredValue&&cells[i]?.effectiveValue)));
   rows.push({merchant_key:entry.key,snapshot:{headers,values,linked,capturedAt:new Date().toISOString()}});
  }
  return rows;
 }
 async withLock(operation){
  const owner=randomUUID();
  if(!await this.lock('acquire',owner))throw fail('Hay otra escritura en curso o pendiente de verificar.');
  let uncertain=false;
  const write=async(requests,before,discard)=>{
   if(!await this.lock('mark',owner))throw fail('Venció el bloqueo de escritura.');
   await before();
   uncertain=true;
   try{await this.google(':batchUpdate',{requests},'write');}
   catch(error){
    if([400,401,403,404].includes(error.response?.status)){await discard();uncertain=false;}
    throw fail('Google no confirmó el cambio. Verificá la planilla antes de reintentar.',502);
   }
  };
  try{return await operation(write,()=>{uncertain=false;},owner);}
  finally{if(!uncertain)await this.lock('release',owner);}
 }
 async apply(owner,kind,ids){
  if(!this.enabled||this.service.env.PORTFOLIO_WRITES_ENABLED!=='true')throw fail('La aplicación de cambios todavía no está habilitada.',503);
  if(!['add','remove'].includes(kind)||!Array.isArray(ids)||!ids.length||ids.length>10||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||id.length>300))throw fail('Selección inválida.',400);
  const results=[];
  for(const id of ids){
   try{await this.applyOne(owner,kind,id);results.push({id,applied:true});}
   catch(error){results.push({id,applied:false,error:error.status?error.message:'No se pudo confirmar el cambio.'});}
  }
  return results;
 }
 async applyOne(owner,kind,id){
  const outstanding=(await this.service.store.read(owner)).state.portfolioWrite;
  if(outstanding){
   if(outstanding.kind!==kind||outstanding.id!==id)throw fail('Hay un cambio anterior pendiente de verificar.');
   await this.verifyWrite(outstanding);
   await this.finishWrite(owner,outstanding);
   if(!await this.lock('release',outstanding.lockOwner))throw fail('El cambio se verificó. Revisá el bloqueo de escritura.');
   return;
  }
  return this.withLock(async(write,verified,lockOwner)=>{
   const {state}=await this.service.store.read(owner);
   const pending=state.pendingChanges?.find(c=>c.kind===kind&&c.id===id);
   if(!pending?.applicable||state.portfolioReviewError)throw fail('El cambio ya no está disponible. Volvé a comprobar.');
   const data=await this.read();
   const change=compareMerchants(data.imported,data.portfolio).find(c=>c.id===id&&c.kind===kind);
   if(!change)throw fail('El cambio ya no coincide con la planilla. Volvé a comprobar.');
   if(kind==='remove'&&!data.imported.entries.length)throw fail('Base importada está vacía. Revisá la carga antes de confirmar.');
   const operation=sheetDigest([owner,kind,id,pending.firstDetectedAt]);
   const requests=kind==='add'?await this.addRequests(data,id,operation):await this.removeRequests(data,owner,id,operation);
   const latest=await this.read();
   if(latest.digest!==data.digest||sheetDigest(latest.activeValues)!==sheetDigest(data.activeValues))throw fail('Las bases cambiaron durante la confirmación. Volvé a comprobar.');
   const intent={id,kind,operation,lockOwner,firstDetectedAt:pending.firstDetectedAt,archiveColumn:data.activeValues[0].length+1,portfolioId:data.active.sheetId};
   await write(requests,()=>this.service.store.update(owner,s=>{s.portfolioWrite=intent;}),()=>this.service.store.update(owner,s=>{if(s.portfolioWrite?.operation===operation)delete s.portfolioWrite;}));
   await this.verifyWrite(intent);
   await this.finishWrite(owner,intent);
   verified();
  });
 }
 async verifyWrite({id,kind,operation,archiveColumn,portfolioId}){
  const after=await this.read();
  if(Boolean(lookup(after.portfolio,id))!==(kind==='add'))throw fail('La escritura todavía no se pudo confirmar en Google.',502);
  if(kind==='remove'){
   const archive=after.tabs.find(tab=>tab.title===archiveTitle);
   if(!archive||(await this.grid(archive)).filter(row=>row.values?.[archiveColumn]?.effectiveValue?.stringValue===operation).length!==1)throw fail('No se pudo verificar el registro histórico.',502);
  }else{
   const markers=await this.google('/developerMetadata:search',{dataFilters:[{developerMetadataLookup:{metadataKey:'consultorPortfolioAdd',metadataValue:operation}}]});
   const marker=markers.matchedDeveloperMetadata?.[0]?.developerMetadata?.location?.dimensionRange;
   if(markers.matchedDeveloperMetadata?.length!==1||marker?.sheetId!==portfolioId||marker?.startIndex!==lookup(after.portfolio,id).index)throw fail('No se pudo verificar el alta en Google.',502);
  }
 }
 async finishWrite(owner,{id,kind,operation,firstDetectedAt}){
  await this.service.store.update(owner,s=>{
   if(s.portfolioWrite?.operation!==operation)return;
   s.pendingChanges=(s.pendingChanges||[]).filter(c=>c.kind!==kind||c.id!==id||c.firstDetectedAt!==firstDetectedAt);
   s.appliedChanges=[...(s.appliedChanges||[]).slice(-499),{id,kind,operation,appliedAt:new Date().toISOString()}];
   if(!s.pendingChanges.length&&s.review)s.review.status='resolved';
   delete s.portfolioWrite;
  });
 }
 async addRequests(data,id,operation){
  const entry=lookup(data.imported,id),headers=data.activeValues[0];
  let config;
  try{config=JSON.parse(this.service.env.PORTFOLIO_ADD_COLUMNS||'null');}catch{}
  if(!entry?.id||!config||!config.seed||!Array.isArray(config.formulas)||!Number.isSafeInteger(config.templateRow)||config.templateRow<2)throw fail('Falta configurar las columnas y la plantilla de altas.');
  const grid=await this.grid(data.active);
  const template=grid[config.templateRow-1]?.values;
  if(!template)throw fail('La fila plantilla no existe.');
  const sourceGrid=await this.grid(data.source),sourceCells=sourceGrid[entry.index]?.values||[];
  if(String(sourceCells[data.imported.idCol]?.formattedValue??'').trim()!==entry.id)throw fail('Cambió la fila importada.');
  if(String(sourceCells[data.imported.mailCol]?.formattedValue??'').trim().toLowerCase()!==entry.email)throw fail('Cambió el correo de la fila importada.');
  if(data.portfolio.emails.has(entry.email))throw fail('El correo ya está asociado a otro comercio en Base Consultor App.');
  const row=Math.max(data.activeValues.length,grid.length),requests=[];
  if(row>=data.active.gridProperties.rowCount)requests.push({appendDimension:{sheetId:data.active.sheetId,dimension:'ROWS',length:row+1-data.active.gridProperties.rowCount}});
  const headerIndex=(names,name)=>{
   const offsets=names.flatMap((h,i)=>h===name?[i]:[]);
   if(offsets.length!==1)throw fail('La plantilla contiene un encabezado faltante o ambiguo.');
   return offsets[0];
  };
  const seeded=new Set();
  for(const [target,source] of Object.entries(config.seed)){
   const col=headerIndex(headers,target),src=headerIndex(data.importedValues[0],source);
   const value=col===data.portfolio.idCol?str(entry.id):sourceCells[src]?.effectiveValue;
   if(value?.errorValue)throw fail('La fila importada contiene una fórmula con error.');
   if(col===data.portfolio.idCol&&src!==data.imported.idCol)throw fail('El mapeo de ID no coincide con la base importada.');
   seeded.add(col);
   requests.push(update(data.active.sheetId,row,col,[value]));
  }
  if(!seeded.has(data.portfolio.idCol)||!seeded.has(data.portfolio.mailCol)||!entry.email||config.seed[headers[data.portfolio.mailCol]]!==data.importedValues[0][data.imported.mailCol])throw fail('El alta requiere ID y correo válidos en las columnas configuradas.');
  for(const name of config.formulas){
   const col=headerIndex(headers,name);
   if(seeded.has(col)||!template[col]?.userEnteredValue?.formulaValue)throw fail('La fórmula prevista no coincide con la plantilla.');
   seeded.add(col);
   requests.push({copyPaste:{source:range(data.active.sheetId,config.templateRow-1,col),destination:range(data.active.sheetId,row,col),pasteType:'PASTE_FORMULA'}});
  }
  requests.push({createDeveloperMetadata:{developerMetadata:{metadataKey:'consultorPortfolioAdd',metadataValue:operation,visibility:'DOCUMENT',location:{dimensionRange:{sheetId:data.active.sheetId,dimension:'ROWS',startIndex:row,endIndex:row+1}}}}});
  return requests;
 }
 async removeRequests(data,owner,id,operation){
  const entry=lookup(data.portfolio,id),headers=data.activeValues[0];
  if(!entry?.id)throw fail('Se requiere un ID estable para archivar y eliminar.');
  if(headers.some(h=>archiveColumns.includes(h)))throw fail('Los encabezados reservados del archivo ya existen en Base Consultor App.');
  const {state}=await this.service.store.read(owner);
  const snapshot=state.portfolioSnapshots?.[id];
  if(!snapshot||snapshot.values?.length!==headers.length||sheetDigest(snapshot.headers)!==sheetDigest(headers))throw fail('Falta un respaldo íntegro compatible con esta fila.');
  const cells=(await this.grid(data.active))[entry.index]?.values||[];
  const idCell=cells[data.portfolio.idCol];
  if(String(idCell?.formattedValue??'').trim()!==entry.id||idCell?.userEnteredValue?.formulaValue)throw fail('La baja requiere un ID fijo en Base Consultor App.');
  if(cells.slice(headers.length).some(c=>c.userEnteredValue||c.effectiveValue))throw fail('La fila tiene valores en columnas sin encabezado.');
  const values=headers.map((_,i)=>cells[i]?.userEnteredValue?.formulaValue||(!cells[i]?.userEnteredValue&&snapshot.linked?.[i])?snapshot.values[i]:cells[i]?.effectiveValue??null);
  const archive=data.tabs.find(t=>t.title===archiveTitle),requests=[];
  const archiveHeaders=[...headers,...archiveColumns];
  let archiveId=archive?.sheetId;
  if(!archive){
   archiveId=Math.max(...data.tabs.map(tab=>tab.sheetId))+1;
   requests.push({addSheet:{properties:{sheetId:archiveId,title:archiveTitle,gridProperties:{rowCount:100,columnCount:archiveHeaders.length}}}});
   requests.push(update(archiveId,0,0,archiveHeaders.map(str)));
  }else{
   const grid=await this.grid(archive);
   const actual=grid[0]?.values?.map(c=>c.formattedValue??'');
   if(sheetDigest(actual)!==sheetDigest(archiveHeaders))throw fail('El archivo histórico tiene encabezados distintos.');
   if(grid.some(row=>row.values?.[headers.length+1]?.effectiveValue?.stringValue===operation))throw fail('La operación ya figura en el historial. Revisá la fila activa.');
  }
  requests.push({appendCells:{
   sheetId:archiveId,
   rows:[{values:[...values,str(new Date().toISOString()),str(operation)].map(cell)}],
   fields:'userEnteredValue'
  }});
  // One atomic Sheets batch: a rejected archive also rejects deletion.
  requests.push({deleteDimension:{range:{sheetId:data.active.sheetId,dimension:'ROWS',startIndex:entry.index,endIndex:entry.index+1}}});
  return requests;
 }
}

