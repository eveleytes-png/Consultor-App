import {randomUUID} from 'node:crypto';
import {serverConfig} from '../api/sheets.mjs';
import {sheetLock} from '../api/sheets-lock.mjs';
import {compareMerchants,indexMerchants,sheetDigest} from './portfolio-changes.mjs';

const fail=(message,status=409)=>Object.assign(Error(message),{status});
const archiveTitle='ComerciosEliminados';
const archiveDate='Fecha de eliminación',archiveOperation='Operación de cartera';
const removalMarker='consultorPortfolioRemove';
const firstFormulaColumn=15;
const importFailure=message=>Object.assign(fail(message,503),{importValidation:true});
const cellError=/^#(?:REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|ERROR!|SPILL!|CALC!)$/i;
const range=(id,row,col,width=1)=>({sheetId:id,startRowIndex:row,endRowIndex:row+1,startColumnIndex:col,endColumnIndex:col+width});
const cell=value=>value==null?{}:{userEnteredValue:value};
const str=stringValue=>({stringValue:String(stringValue)});
const update=(id,row,col,values)=>({updateCells:{range:range(id,row,col,values.length),rows:[{values:values.map(cell)}],fields:'userEnteredValue'}});
const filters=ids=>ids.map(sheetId=>({gridRange:{sheetId,startRowIndex:0}}));
const returned=(data,id)=>data.valueRanges?.find(v=>v.dataFilters?.some(f=>f.gridRange&&(f.gridRange.sheetId??0)===id))?.valueRange?.values;
const lookup=(index,key)=>index.entries.find(entry=>entry.key===key);
const normalizedEmail=value=>String(value??'').trim().toLowerCase();

export class PortfolioWorkflow{
 constructor(service,lock=sheetLock){this.service=service;this.lock=lock;}
 get enabled(){return this.service.env.PORTFOLIO_WRITES_ENABLED!=='false';}
 async google(path,body,mode='read'){
  return this.service.google(serverConfig(this.service.env),path,body,mode);
 }
 async read(){
  const meta=await this.google('?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))');
  const tabs=meta.sheets?.map(s=>s.properties)||[];
  const active=tabs.find(t=>t.sheetId===192864634&&t.title==='Base Consultor App');
  const source=tabs.find(t=>t.title==='Base importada'&&t.sheetId!==active?.sheetId);
  if(!source)throw importFailure('No se encontró la pestaña Base importada.');
  if(!active)throw fail('No se encontró Base Consultor App.',503);
  const data=await this.google('/values:batchGetByDataFilter',{dataFilters:filters([source.sheetId,active.sheetId]),majorDimension:'ROWS',valueRenderOption:'FORMATTED_VALUE'});
  const importedValues=returned(data,source.sheetId),activeValues=returned(data,active.sheetId);
  const hasData=(importedValues||[]).slice(1).some(row=>row.some(value=>String(value??'').trim()));
  if(!hasData)throw importFailure('Base importada no contiene datos de comercios. Está vacía o solo tiene encabezados.');
  let imported;
  try{imported=indexMerchants(importedValues,'Base importada');}
  catch(error){throw importFailure(error.message);}
  if(imported.entries.some(entry=>cellError.test(entry.id)))throw importFailure('Base importada contiene errores de fórmula en los identificadores de comercios.');
  const portfolio=indexMerchants(activeValues,'Base Consultor App',{allowEmpty:true});
  return {active,source,tabs,importedValues,activeValues,imported,portfolio,digest:sheetDigest(importedValues)};
 }
 async grid(tab){
  const a1="'"+tab.title.replaceAll("'","''")+"'";
  const data=await this.google('?ranges='+encodeURIComponent(a1)+'&fields=sheets(properties(sheetId),data(rowData(values(userEnteredValue,effectiveValue,formattedValue))))');
  const sheet=data.sheets?.find(s=>s.properties?.sheetId===tab.sheetId);
  const result=sheet?.data?.[0]?.rowData??(sheet&&tab.title===archiveTitle?[]:null);
  if(!Array.isArray(result))throw fail('No se pudieron verificar las celdas de '+tab.title+'.',503);
  return result;
 }
 async captureObservedRows(data){
  const grid=await this.grid(data.active),headers=data.activeValues[0],rows=[];
  for(const entry of data.portfolio.entries){
   const emailMatches=data.imported.emails.get(entry.email)||[];
   const present=entry.id?data.imported.ids.has(entry.id):
    entry.email&&emailMatches.length===1&&data.portfolio.emails.get(entry.email)?.length===1;
   if(!present)continue;
   const cells=grid[entry.index]?.values||[];
   const identityMatches=entry.id?String(cells[data.portfolio.idCol]?.formattedValue??'').trim()===entry.id:
    normalizedEmail(cells[data.portfolio.mailCol]?.formattedValue)===entry.email;
   if(!identityMatches||
      cells.slice(headers.length).some(c=>c.userEnteredValue||c.effectiveValue)||
      cells.some(c=>c.effectiveValue?.errorValue||(c.userEnteredValue?.formulaValue&&!c.effectiveValue)))continue;
   if(entry.row.some((value,i)=>String(value??'')!==String(cells[i]?.formattedValue??'')))continue;
   const values=Array.from({length:headers.length},(_,i)=>cells[i]?.effectiveValue??null);
   const linked=Array.from({length:headers.length},(_,i)=>Boolean(cells[i]?.userEnteredValue?.formulaValue||(!cells[i]?.userEnteredValue&&cells[i]?.effectiveValue)));
   rows.push({merchant_key:entry.key,email:entry.email,snapshot:{headers,values,linked,capturedAt:new Date().toISOString()}});
  }
  return rows;
 }
 async withLock(operation){
  const owner=randomUUID();
  if(!await this.lock('acquire',owner))throw Object.assign(fail('Hay otra operación de cartera en curso o pendiente de verificar.'),{lockBusy:true});
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
 async apply(owner,kind,ids,confirmedAt){
  if(!this.enabled)throw fail('La aplicación de cambios todavía no está habilitada.',503);
  if(!['add','remove'].includes(kind)||!Array.isArray(ids)||!ids.length||ids.length>10||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||id.length>300))throw fail('Selección inválida.',400);
  const receivedAt=new Date();
  if(kind==='remove'){
   const time=confirmedAt===undefined?receivedAt.getTime():Date.parse(confirmedAt);
   if(!Number.isFinite(time)||Math.abs(time-receivedAt.getTime())>15*60*1000)throw fail('La fecha de confirmación no es válida. Volvé a confirmar la baja.',400);
   confirmedAt=new Date(time).toISOString();
  }
  const results=[];
  for(const id of ids){
   try{await this.applyOne(owner,kind,id,confirmedAt);results.push({id,applied:true});}
   catch(error){
    results.push({id,applied:false,error:error.status?error.message:'No se pudo confirmar el cambio.'});
    if(error.importValidation){
     await this.service.store.update(owner,state=>{state.portfolioReviewError=error.message;});
     break;
    }
   }
  }
  return results;
 }
 async applyOne(owner,kind,id,confirmedAt){
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
   const operation=sheetDigest([owner,kind,id,pending.firstDetectedAt]);
   const removal=kind==='remove'?await this.removeRequests(data,id,operation,confirmedAt):null;
   const requests=removal?.requests??await this.addRequests(data,id,operation);
   const latest=await this.read();
   if(latest.digest!==data.digest||sheetDigest(latest.activeValues)!==sheetDigest(data.activeValues))throw fail('Las bases cambiaron durante la confirmación. Volvé a comprobar.');
   if(removal){
    const entry=lookup(latest.portfolio,id);
    const current=(await this.grid(latest.active))[entry.index]?.values;
    if(!current||removal.originalDigest!==sheetDigest(current))throw fail('La fila cambió durante la confirmación. Volvé a comprobar.');
    const archive=latest.tabs.find(tab=>tab.title===archiveTitle);
    if(archive&&removal.archiveBeforeDigest!==sheetDigest(await this.grid(archive)))throw fail('El archivo cambió durante la confirmación. Volvé a comprobar.');
   }
   this.checkWriteTargets(requests,latest);
   const email=lookup(kind==='add'?data.imported:data.portfolio,id)?.email;
   const intent={id,kind,email,operation,lockOwner,firstDetectedAt:pending.firstDetectedAt,portfolioId:data.active.sheetId,...(removal?{archiveDigest:removal.archiveDigest,archiveWidth:removal.archiveWidth}:{})};
   await write(requests,()=>this.service.store.update(owner,s=>{s.portfolioWrite=intent;}),()=>this.service.store.update(owner,s=>{if(s.portfolioWrite?.operation===operation)delete s.portfolioWrite;}));
   await this.verifyWrite(intent);
   await this.finishWrite(owner,intent);
   verified();
  });
 }
 checkWriteTargets(requests,{active,source,tabs}){
  const archive=tabs.find(tab=>tab.title===archiveTitle);
  const archiveCreation=requests.find(request=>request.addSheet)?.addSheet.properties;
  const archiveId=archive?.sheetId??archiveCreation?.sheetId;
  const deny=()=>{throw fail('La escritura solicitada no está permitida en esa pestaña.',403);};
  for(const request of requests){
   if(Object.keys(request).length!==1)deny();
   if(request.addSheet){
    const properties=request.addSheet.properties;
    if(archive||properties?.title!==archiveTitle||!Number.isInteger(properties.sheetId)||tabs.some(tab=>tab.sheetId===properties.sheetId))deny();
    continue;
   }
   const destination=request.updateCells?.range?.sheetId??request.copyPaste?.destination?.sheetId??
    request.appendDimension?.sheetId??request.deleteDimension?.range?.sheetId??request.appendCells?.sheetId??
    request.createDeveloperMetadata?.developerMetadata?.location?.dimensionRange?.sheetId;
   if(!Number.isInteger(destination)||destination===source.sheetId||(destination!==active.sheetId&&destination!==archiveId))deny();
   if(request.copyPaste&&request.copyPaste.source?.sheetId!==active.sheetId)deny();
   if(request.deleteDimension&&destination!==active.sheetId)deny();
   if(request.appendCells&&destination!==archiveId)deny();
  }
 }
 async verifyWrite({id,kind,email,operation,archiveColumn,archiveDigest,archiveWidth,portfolioId}){
  const after=await this.read();
  const emailMatches=after.portfolio.emails.get(email)||[];
  const expectedId=id.startsWith('id:')?id.slice(3):null;
  const row=lookup(after.portfolio,id)||(emailMatches.length===1&&(!expectedId||!emailMatches[0].id)?emailMatches[0]:null);
  if(kind==='add'?(!row||(email&&row.email!==email)):row)throw fail('La escritura todavía no se pudo confirmar en Google.',502);
  if(kind==='remove'){
   const archive=after.tabs.find(tab=>tab.title===archiveTitle);
   if(!archive)throw fail('No se pudo verificar el registro histórico.',502);
   if(archiveDigest){
    const markers=await this.google('/developerMetadata:search',{dataFilters:[{developerMetadataLookup:{metadataKey:removalMarker,metadataValue:operation}}]});
    const marker=markers.matchedDeveloperMetadata?.[0]?.developerMetadata?.location?.dimensionRange;
    if(markers.matchedDeveloperMetadata?.length!==1||marker?.sheetId!==archive.sheetId)throw fail('No se pudo verificar el registro histórico.',502);
    const cells=(await this.grid(archive))[marker.startIndex]?.values||[];
    const saved=Array.from({length:archiveWidth},(_,i)=>cells[i]?.userEnteredValue??null);
    if(sheetDigest(saved)!==archiveDigest)throw fail('El registro histórico no coincide con la fila confirmada.',502);
   }else if((await this.grid(archive)).filter(row=>row.values?.[archiveColumn]?.effectiveValue?.stringValue===operation).length!==1){
    throw fail('No se pudo verificar el registro histórico.',502);
   }
  }else{
   const markers=await this.google('/developerMetadata:search',{dataFilters:[{developerMetadataLookup:{metadataKey:'consultorPortfolioAdd',metadataValue:operation}}]});
   const marker=markers.matchedDeveloperMetadata?.[0]?.developerMetadata?.location?.dimensionRange;
   if(markers.matchedDeveloperMetadata?.length!==1||marker?.sheetId!==portfolioId||marker?.startIndex!==row.index)throw fail('No se pudo verificar el alta en Google.',502);
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
  const entry=lookup(data.imported,id),mail=data.portfolio.mailCol;
  if(!entry?.email||mail<0||data.imported.mailCol<0)throw fail('Se requiere un correo válido para incorporar el comercio.');
  const grid=await this.grid(data.active);
  const templateRow=data.portfolio.entries.at(-1)?.index;
  const template=grid[templateRow]?.values;
  if(!template)throw fail('La fila plantilla no existe.');
  const sourceGrid=await this.grid(data.source),sourceCells=sourceGrid[entry.index]?.values||[];
  if(entry.id&&String(sourceCells[data.imported.idCol]?.formattedValue??'').trim()!==entry.id)throw fail('Cambió la fila importada.');
  const sourceEmail=sourceCells[data.imported.mailCol]?.formattedValue;
  if(normalizedEmail(sourceEmail)!==entry.email)throw fail('Cambió el correo de la fila importada.');
  if(data.imported.emails.get(entry.email)?.length!==1)throw fail('El correo está repetido en Base importada.');
  if(data.portfolio.emails.has(entry.email))throw fail('El correo ya está asociado a otro comercio en Base Consultor App.');
  const occupied=grid.findLastIndex(line=>line?.values?.some(c=>c.userEnteredValue||c.effectiveValue));
  const row=Math.max(data.activeValues.length,occupied+1),requests=[];
  if(row>=data.active.gridProperties.rowCount)requests.push({appendDimension:{sheetId:data.active.sheetId,dimension:'ROWS',length:row+1-data.active.gridProperties.rowCount}});
  requests.push(update(data.active.sheetId,row,mail,[str(String(sourceEmail).trim())]));
  for(let col=firstFormulaColumn;col<template.length;col++){
   const formula=template[col]?.userEnteredValue?.formulaValue;
   if(col===mail||!formula||/^=\s*ARRAYFORMULA\s*\(/i.test(formula))continue;
   requests.push({copyPaste:{source:range(data.active.sheetId,templateRow,col),destination:range(data.active.sheetId,row,col),pasteType:'PASTE_FORMULA'}});
  }
  requests.push({createDeveloperMetadata:{developerMetadata:{metadataKey:'consultorPortfolioAdd',metadataValue:operation,visibility:'DOCUMENT',location:{dimensionRange:{sheetId:data.active.sheetId,dimension:'ROWS',startIndex:row,endIndex:row+1}}}}});
  return requests;
 }
 async removeRequests(data,id,operation,confirmedAt){
  const entry=lookup(data.portfolio,id),headers=data.activeValues[0];
  if(!entry||(!entry.id&&data.portfolio.emails.get(entry.email)?.length!==1))throw fail('No se pudo identificar de forma inequívoca qué fila archivar.');
  if(headers.includes(archiveDate)||headers.includes(archiveOperation))throw fail('Los encabezados reservados del archivo ya existen en Base Consultor App.');
  const cells=(await this.grid(data.active))[entry.index]?.values||[];
  if(entry.id?String(cells[data.portfolio.idCol]?.formattedValue??'').trim()!==entry.id:
     normalizedEmail(cells[data.portfolio.mailCol]?.formattedValue)!==entry.email)throw fail('Cambió la fila que se va a archivar.');
  const width=Math.max(headers.length,cells.findLastIndex(c=>c.userEnteredValue||c.effectiveValue)+1);
  const values=Array.from({length:width},(_,i)=>{
   const current=cells[i],value=current?.effectiveValue;
   if(value?.errorValue)return str(current.formattedValue||value.errorValue.type);
   if(value)return value;
   if(current?.userEnteredValue?.formulaValue)return current.formattedValue?str(current.formattedValue):null;
   return current?.userEnteredValue??null;
  });
  const archive=data.tabs.find(t=>t.title===archiveTitle),requests=[];
  const archiveHeaders=[archiveDate,...Array.from({length:width},(_,i)=>headers[i]??'')];
  let archiveId=archive?.sheetId;
  let destinationRow=1;
  let archiveBeforeDigest;
  if(!archive){
   archiveId=Math.max(...data.tabs.map(tab=>tab.sheetId))+1;
   requests.push({addSheet:{properties:{sheetId:archiveId,title:archiveTitle,gridProperties:{rowCount:100,columnCount:archiveHeaders.length}}}});
   requests.push(update(archiveId,0,0,archiveHeaders.map(str)));
  }else{
   const grid=await this.grid(archive);
   archiveBeforeDigest=sheetDigest(grid);
   const actual=grid[0]?.values||[];
   const lastOccupied=grid.findLastIndex(row=>row.values?.some(c=>c.userEnteredValue||c.effectiveValue));
   if(lastOccupied<0){
    requests.push(update(archiveId,0,0,archiveHeaders.map(str)));
   }else{
    const label=String(actual[0]?.formattedValue??'').trim().toLowerCase();
    const matchesHeaders=['fecha de eliminación','fecha'].includes(label)&&headers.every((h,i)=>String(actual[i+1]?.formattedValue??'')===String(h??''));
    const operationHeader=actual[headers.length+1]?.formattedValue;
    if(!matchesHeaders||(operationHeader&&operationHeader!==archiveOperation))throw fail('El archivo histórico tiene encabezados distintos.');
   }
   if(archive.gridProperties.columnCount<archiveHeaders.length)requests.unshift({appendDimension:{sheetId:archiveId,dimension:'COLUMNS',length:archiveHeaders.length-archive.gridProperties.columnCount}});
   destinationRow=Math.max(1,lastOccupied+1);
   if(destinationRow>=archive.gridProperties.rowCount)requests.push({appendDimension:{sheetId:archiveId,dimension:'ROWS',length:destinationRow+1-archive.gridProperties.rowCount}});
  }
  const archivedValues=[str(confirmedAt),...values];
  requests.push(update(archiveId,destinationRow,0,archivedValues));
  requests.push({createDeveloperMetadata:{developerMetadata:{metadataKey:removalMarker,metadataValue:operation,visibility:'DOCUMENT',location:{dimensionRange:{sheetId:archiveId,dimension:'ROWS',startIndex:destinationRow,endIndex:destinationRow+1}}}}});
  // One atomic Sheets batch: a rejected archive also rejects deletion.
  requests.push({deleteDimension:{range:{sheetId:data.active.sheetId,dimension:'ROWS',startIndex:entry.index,endIndex:entry.index+1}}});
  return {requests,originalDigest:sheetDigest(cells),archiveBeforeDigest,archiveDigest:sheetDigest(archivedValues),archiveWidth:archivedValues.length};
 }
}

