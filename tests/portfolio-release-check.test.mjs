import {test} from 'node:test';
import assert from 'node:assert/strict';

import {NotificationService} from '../lib/notification-service.mjs';

const headers=['Mail','Comentarios','Nombre del comercio','Aceptación','Encuesta valida','Blindaje',...Array(9).fill(''),'Cust_id comercio','Dato calculado','Dato fijo'];
const merchant=(id,email='m'+id+'@example.com')=>[email,'','Comercio '+id,'Si','No','',...Array(9).fill(''),id,'Calculado '+id,'No copiar'];
const owner='owner@example.com';
const activeId=192864634;
const col=(text)=>text===''?{}:{userEnteredValue:{stringValue:text},effectiveValue:{stringValue:text},formattedValue:text};
const tab=(sheetId,title)=>({sheetId,title,gridProperties:{rowCount:100,columnCount:20}});

function setup(){
 let imported=[headers,merchant('1'),merchant('2')];
 let active=[headers,merchant('1'),merchant('2')],archive=null,lockOwner=null,loseResponse=false,archiveRows=[],afterGrid=null,rejectWrite=false;
 const state={},snapshots=new Map(),writes=[],markers=[];
 const store={
  read:async()=>({state:structuredClone(state)}),
  update:async(_,fn)=>fn(state),
  saveSnapshots:async(_,records)=>{for(const record of records)snapshots.set(record.merchant_key,record.snapshot);},
  findSnapshot:async(_,id)=>snapshots.get(id),
  call:async(path,opts)=>{
   if(path.startsWith('rpc/')){
    for(const row of JSON.parse(opts.body).records)snapshots.set(row.merchant_key,row);
    return null;
   }
   if(opts){for(const row of JSON.parse(opts.body))snapshots.set(row.merchant_key,row);return [];}
   if(path.startsWith('consultor_portfolio_snapshots?'))return [snapshots.get(new URLSearchParams(path.split('?')[1]).get('merchant_key').slice(3))].filter(Boolean);
   return [{data:{activities:[]}}];
  }
 };
 const google=async(_,path,body)=>{
  if(path.startsWith('?fields'))return {sheets:[tab(activeId,'Base Consultor App'),tab(7,'Base importada'),...(archive?[archive]:[])].map(properties=>({properties}))};
  if(path.startsWith('?ranges=')){
   const scope=decodeURIComponent(path),archived=scope.includes('ComerciosEliminados'),source=scope.includes('Base importada');
   const title=archived?'ComerciosEliminados':source?'Base importada':'Base Consultor App';
   assert.equal(path,'?ranges='+encodeURIComponent("'"+title+"'")+'&fields=sheets(properties(sheetId),data(rowData(values(userEnteredValue,effectiveValue,formattedValue))))');
   const rows=(archived?archiveRows:(source?imported:active).map(row=>row.map(col))).map(values=>({values}));
   if(!archived&&!source&&rows[1])rows[1].values[2]={userEnteredValue:{formulaValue:'=B2'},effectiveValue:col(active[1][2]).effectiveValue,formattedValue:active[1][2]};
   if(!archived&&!source&&rows[2])rows[2].values[16]={userEnteredValue:{formulaValue:'=A3'},effectiveValue:col(active[2][16]).effectiveValue,formattedValue:active[2][16]};
   if(!archived&&!source&&afterGrid){const edit=afterGrid;afterGrid=null;edit(active);}
   return {sheets:[{properties:{sheetId:archived?archive.sheetId:source?7:activeId},data:[{rowData:rows}]}]};
  }
  if(path==='/values:batchGetByDataFilter')return {valueRanges:[activeId,7].map(sheetId=>({dataFilters:[{gridRange:{sheetId}}],valueRange:{values:structuredClone(sheetId===activeId?active:imported)}}))};
  if(path===':batchUpdate'){
   writes.push(body.requests);
   if(rejectWrite){rejectWrite=false;throw Object.assign(Error('Invalid argument'),{response:{status:400}});}
   for(const request of body.requests){
    if(request.addSheet)archive=request.addSheet.properties;
    if(request.updateCells){
     const {range,rows}=request.updateCells;
     if(range.sheetId===activeId){active[range.startRowIndex]||=[];active[range.startRowIndex][range.startColumnIndex]=rows[0].values[0].userEnteredValue?.stringValue??'';}
     else archiveRows[range.startRowIndex]=rows[0].values.map(c=>c.userEnteredValue?{
      userEnteredValue:c.userEnteredValue,effectiveValue:c.userEnteredValue,
      formattedValue:String(Object.values(c.userEnteredValue)[0])
     }:{});
    }
    if(request.copyPaste)active[request.copyPaste.destination.startRowIndex][request.copyPaste.destination.startColumnIndex]='Nombre calculado';
    if(request.appendCells)archiveRows.push(...request.appendCells.rows.map(row=>row.values.map(c=>col(c.userEnteredValue?.stringValue??''))));
    if(request.createDeveloperMetadata)markers.push(request.createDeveloperMetadata);
    if(request.deleteDimension)active.splice(request.deleteDimension.range.startIndex,1);
   }
   if(loseResponse)throw Error('timeout');
   return {};
  }
  if(path==='/developerMetadata:search')return {matchedDeveloperMetadata:markers.filter(item=>item.developerMetadata.metadataValue===body.dataFilters[0].developerMetadataLookup.metadataValue)};
  throw Error(path);
 };
 const lock=async(mode,id)=>{
  if(mode==='acquire'){if(lockOwner)return false;lockOwner=id;return true;}
  if(lockOwner!==id)return false;
  if(mode==='release')lockOwner=null;
  return true;
 };
 const env={PORTFOLIO_WRITES_ENABLED:'true'};
 const service=new NotificationService({env,google,store,portfolioLock:lock});
 return {service,state,writes,snapshots,archiveRows,setImported:rows=>{imported=[headers,...rows];},setRawImport:rows=>{imported=rows;},setActive:rows=>{active=[headers,...rows];},setCell:(row,col,value)=>{active[row][col]=value;},loseResponse:()=>{loseResponse=true;},rejectWrite:()=>{rejectWrite=true;},editAfterGrid:edit=>{afterGrid=edit;}};
}

test('El enlace conserva los pendientes y el servidor aplica únicamente la selección confirmada',async()=>{
 const f=setup(),workflow=f.service.workflow;
 await f.service.reviewChanges(owner);
 assert.equal(f.snapshots.size,2);
 assert.deepEqual(f.snapshots.get('id:1').values[2],{stringValue:'Comercio 1'});
 assert.equal(f.snapshots.get('id:1').linked[2],true);
 assert.deepEqual(f.snapshots.get('id:1').values[17],{stringValue:'No copiar'});
 assert.equal(f.snapshots.get('id:1').linked[17],false);
 f.setImported([merchant('2'),merchant('3'),merchant('4')]);
 f.setCell(1,2,'');
 f.setCell(1,5,'Último dato manual');
 await f.service.reviewChanges(owner);
 assert.equal(f.state.pendingChanges.length,3);
 assert.equal(f.writes.length,0);
 assert.equal((await workflow.apply(owner,'add',['id:3']))[0].applied,true);
 const addRequests=f.writes[0];
 assert.deepEqual(addRequests.filter(r=>r.updateCells).map(r=>[r.updateCells.range.startColumnIndex,r.updateCells.rows[0].values[0].userEnteredValue]),[[0,{stringValue:'m3@example.com'}]]);
 assert.deepEqual(addRequests.filter(r=>r.copyPaste).map(r=>[r.copyPaste.source.startRowIndex,r.copyPaste.source.startColumnIndex,r.copyPaste.destination.startRowIndex,r.copyPaste.pasteType]),[[2,16,3,'PASTE_FORMULA']]);
 assert.equal(f.state.pendingChanges.length,2);
 f.loseResponse();
 const confirmedAt=new Date().toISOString();
 assert.equal((await workflow.apply(owner,'remove',['id:1'],confirmedAt))[0].applied,false);
 assert.equal(f.writes[1].filter(request=>request.updateCells).length,2);
 assert.ok(f.writes[1].at(-1).deleteDimension);
 assert.equal((await workflow.apply(owner,'remove',['id:1']))[0].applied,true);
 assert.deepEqual(f.state.pendingChanges.map(change=>change.id),['id:4']);
 assert.equal(f.writes[1].find(r=>r.addSheet).addSheet.properties.title,'ComerciosEliminados');
 assert.equal(f.archiveRows[0][0].effectiveValue.stringValue,'Fecha de eliminación');
 assert.equal(f.archiveRows[1][0].effectiveValue.stringValue,confirmedAt);
 assert.equal(f.archiveRows[1][1].effectiveValue.stringValue,'m1@example.com');
 assert.deepEqual(f.archiveRows[1][2],{});
 assert.deepEqual(f.archiveRows[1][3],{});
 assert.equal(f.archiveRows[1][6].effectiveValue.stringValue,'Último dato manual');
 assert.equal(f.writes.length,2);
});

test('Una fuente con columnas vacías concilia y una fuente rota bloquea cualquier escritura',async()=>{
 const f=setup();
 await f.service.reviewChanges(owner);
 f.setImported([merchant('2').map((value,i)=>[0,15].includes(i)?value:'')]);
 await f.service.reviewChanges(owner);
 f.setImported([merchant('#REF!')]);
 assert.match((await f.service.workflow.apply(owner,'remove',['id:1']))[0].error,/errores de fórmula/);
 await assert.rejects(()=>f.service.reviewChanges(owner),/errores de fórmula/);
 assert.equal(f.writes.length,0);
 assert.equal(f.state.pendingChanges.length,1);
});

test('Un rechazo definitivo de Google conserva el pendiente y permite un único alta al reintentar',async()=>{
 const f=setup(),workflow=f.service.workflow;
 f.setImported([merchant('1'),merchant('2'),merchant('3')]);
 await f.service.reviewChanges(owner);
 f.rejectWrite();
 assert.equal((await workflow.apply(owner,'add',['id:3']))[0].applied,false);
 assert.equal(f.state.portfolioWrite,undefined);
 assert.equal(f.state.pendingChanges.length,1);
 assert.equal((await workflow.apply(owner,'add',['id:3']))[0].applied,true);
 assert.equal((await workflow.apply(owner,'add',['id:3']))[0].applied,false);
 assert.equal(f.writes.length,2);
 assert.equal(f.state.appliedChanges.length,1);
});

test('Una baja archiva directamente aunque no exista un respaldo y la fuente vacía no permite otra baja',async()=>{
 const f=setup();
 f.setImported([merchant('2')]);
 await f.service.reviewChanges(owner);
 assert.equal(f.snapshots.has('id:1'),false);
 assert.equal((await f.service.workflow.apply(owner,'remove',['id:1']))[0].applied,true);
 assert.equal(f.archiveRows[1][3].effectiveValue.stringValue,'Comercio 1');
 f.setImported([]);
 await assert.rejects(()=>f.service.reviewChanges(owner),/vacía o solo tiene encabezados/);
 assert.equal((await f.service.workflow.apply(owner,'remove',['id:1']))[0].applied,false);
 assert.equal(f.writes.length,1);
});

test('La próxima baja solo anexa una fila en ComerciosEliminados',async()=>{
 const f=setup();
 await f.service.reviewChanges(owner);
 f.setImported([merchant('2'),merchant('3')]);
 await f.service.reviewChanges(owner);
 assert.equal((await f.service.workflow.apply(owner,'remove',['id:1']))[0].applied,true);
 const history=structuredClone(f.archiveRows);
 f.setImported([merchant('3')]);
 await f.service.reviewChanges(owner);
 assert.equal((await f.service.workflow.apply(owner,'remove',['id:2']))[0].applied,true);
 assert.deepEqual(f.archiveRows.slice(0,history.length),history);
 assert.deepEqual(f.writes[1].map(request=>Object.keys(request)[0]),['updateCells','createDeveloperMetadata','deleteDimension']);
 assert.equal(f.writes[1][0].updateCells.range.startRowIndex,2);
 assert.equal(f.archiveRows[2][17].effectiveValue.stringValue,'Calculado 2');
 assert.equal(f.archiveRows[2][17].userEnteredValue.formulaValue,undefined);
});

test('Un lote de archivado rechazado conserva la fila y el reintento guarda una sola copia completa',async()=>{
 const f=setup(),workflow=f.service.workflow;
 f.setCell(1,20,'Columna sin encabezado');
 f.setImported([merchant('2')]);
 await f.service.reviewChanges(owner);
 f.rejectWrite();
 assert.equal((await workflow.apply(owner,'remove',['id:1']))[0].applied,false);
 assert.equal(f.archiveRows.length,0);
 assert.equal((await workflow.read()).portfolio.ids.has('1'),true);
 assert.equal((await workflow.apply(owner,'remove',['id:1']))[0].applied,true);
 assert.equal(f.archiveRows.length,2);
 assert.deepEqual(f.archiveRows[1][20],{});
 assert.equal(f.archiveRows[1][21].effectiveValue.stringValue,'Columna sin encabezado');
 assert.equal((await workflow.read()).portfolio.ids.has('1'),false);
});

test('Registrar requiere una sesión y nunca permite escribir Base importada',async()=>{
 const f=setup(),workflow=f.service.workflow;
 f.service.env.PORTFOLIO_WRITES_ENABLED='false';
 const status=await f.service.status(owner);
 assert.equal(status.registrationEnabled,false);
 assert.equal(status.writesEnabled,false);
 assert.equal((await f.service.status(owner,true)).writesEnabled,false);
 const data=await workflow.read();
 for(const request of [
  {updateCells:{range:{sheetId:data.source.sheetId}}},
  {deleteDimension:{range:{sheetId:data.source.sheetId}}},
  {copyPaste:{source:{sheetId:activeId},destination:{sheetId:data.source.sheetId}}},
  {appendCells:{sheetId:data.source.sheetId}}
 ]){
  assert.throws(()=>workflow.checkWriteTargets([request],data),error=>error.status===403);
 }
 assert.equal(f.writes.length,0);
});

test('Una carga válida admite 60 altas juntas con columnas opcionales vacías',async()=>{
 const f=setup();
 const newRows=Array.from({length:60},(_,i)=>merchant(String(i+3)).map((value,col)=>[0,15].includes(col)?value:''));
 f.setImported([merchant('1'),merchant('2'),...newRows]);
 await f.service.reviewChanges(owner);
 assert.equal(f.state.pendingChanges.length,60);
 assert.ok(f.state.pendingChanges.every(c=>c.kind==='add'&&c.applicable));
 assert.equal(f.writes.length,0);
});

test('Una reducción legítima de 81 sellers a uno admite 80 bajas juntas',async()=>{
 const f=setup();
 f.setActive(Array.from({length:81},(_,i)=>merchant(String(i+1))));
 f.setImported([merchant('1')]);
 await f.service.reviewChanges(owner);
 assert.equal(f.state.pendingChanges.length,80);
 assert.ok(f.state.pendingChanges.every(c=>c.kind==='remove'&&c.applicable));
 assert.equal(f.writes.length,0);
});

test('Una fuente totalmente vacía o con filas sin identidad no modifica los pendientes',async()=>{
 const f=setup();
 f.setImported([merchant('2')]);
 await f.service.reviewChanges(owner);
 const previous=structuredClone(f.state.pendingChanges);
 for(const [rows,reason] of [[[],/vacía/],[[headers,['','','Comercio sin identidad']],/sin ID ni email válido/]]){
  f.setRawImport(rows);
  try{await f.service.reviewChanges(owner);}catch(error){assert.match(error.message,reason);}
  assert.match(f.state.portfolioReviewError,reason);
  assert.deepEqual(f.state.pendingChanges,previous);
  assert.equal(f.writes.length,0);
 }
});
