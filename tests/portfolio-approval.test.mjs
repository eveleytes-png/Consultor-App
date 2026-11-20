import {test} from 'node:test';
import assert from 'node:assert/strict';

import {NotificationService} from '../lib/notification-service.mjs';

const headers=['Mail','Cust_id comercio','Nombre del comercio','Aceptación','Encuesta valida','Blindaje'];
const merchant=(id,email='m'+id+'@example.com')=>[email,id,'Comercio '+id,'Si','No',''];
const index=(...rows)=>indexMerchants([headers,...rows],'Prueba',{allowEmpty:true});
const owner='owner@example.com';
const activeId=192864634;
const col=(text)=>text===''?{}:{userEnteredValue:{stringValue:text},effectiveValue:{stringValue:text},formattedValue:text};
const tab=(sheetId,title)=>({sheetId,title,gridProperties:{rowCount:100,columnCount:20}});

function setup(){
 let imported=[headers,merchant('1'),merchant('2')];
 let active=[headers,merchant('1'),merchant('2')],archive=null,lockOwner=null,loseResponse=false,archiveRows=[],afterGrid=null;
 const state={},snapshots=new Map(),writes=[],markers=[];
 const store={
  read:async()=>({state:structuredClone(state)}),
  update:async(_,fn)=>fn(state),
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
   const scope=decodeURIComponent(path),archived=scope.includes('Comercios eliminados'),source=scope.includes('Base importada');
   const rows=(archived?archiveRows:(source?imported:active).map(row=>row.map(col))).map(values=>({values}));
   if(!archived&&!source&&rows[1])rows[1].values[2]={userEnteredValue:{formulaValue:'=B2'},effectiveValue:col(active[1][2]).effectiveValue,formattedValue:active[1][2]};
   if(!archived&&!source&&afterGrid){const edit=afterGrid;afterGrid=null;edit(active);}
   return {sheets:[{properties:{sheetId:archived?archive.sheetId:source?7:activeId},data:[{rowData:rows}]}]};
  }
  if(path==='/values:batchGetByDataFilter')return {valueRanges:[activeId,7].map(sheetId=>({dataFilters:[{gridRange:{sheetId}}],valueRange:{values:structuredClone(sheetId===activeId?active:imported)}}))};
  if(path===':batchUpdate'){
   writes.push(body.requests);
   for(const request of body.requests){
    if(request.addSheet)archive=request.addSheet.properties;
    if(request.updateCells){
     const {range,rows}=request.updateCells;
     if(range.sheetId===activeId){active[range.startRowIndex]||=[];active[range.startRowIndex][range.startColumnIndex]=rows[0].values[0].userEnteredValue?.stringValue??'';}
     else archiveRows[range.startRowIndex]=rows[0].values.map(c=>col(c.userEnteredValue?.stringValue??''));
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
 const env={PORTFOLIO_WORKFLOW_ENABLED:'true',PORTFOLIO_ACTIVE_SHEET_ID:String(activeId),PORTFOLIO_WRITES_ENABLED:'true',PORTFOLIO_ADD_COLUMNS:JSON.stringify({
  seed:{Mail:'Mail','Cust_id comercio':'Cust_id comercio'},formulas:['Nombre del comercio'],templateRow:2
 })};
 const service=new NotificationService({env,google,store,portfolioLock:lock});
 return {service,state,writes,archiveRows,setImported:rows=>{imported=[headers,...rows];},setCell:(row,col,value)=>{active[row][col]=value;},loseResponse:()=>{loseResponse=true;},editAfterGrid:edit=>{afterGrid=edit;}};
}

test('El enlace conserva los pendientes y el servidor aplica únicamente la selección confirmada',async()=>{
 const f=setup(),workflow=f.service.workflow;
 await f.service.refreshSource(owner);
 assert.equal(Object.keys(f.state.portfolioSnapshots).length,2);
 f.setImported([merchant('2'),merchant('3'),merchant('4')]);
 f.setCell(1,2,'');
 f.setCell(1,5,'Último dato manual');
 await f.service.reviewChanges(owner);
 assert.equal(f.state.pendingChanges.length,3);
 assert.equal(f.writes.length,0);
 assert.equal((await workflow.apply(owner,'add',['id:3']))[0].applied,true);
 assert.equal(f.state.pendingChanges.length,2);
 f.loseResponse();
 assert.equal((await workflow.apply(owner,'remove',['id:1']))[0].applied,false);
 assert.deepEqual(f.writes[1].filter(request=>request.appendCells).length,1);
 assert.ok(f.writes[1].at(-1).deleteDimension);
 assert.equal((await workflow.apply(owner,'remove',['id:1']))[0].applied,true);
 assert.deepEqual(f.state.pendingChanges.map(change=>change.id),['id:4']);
 assert.equal(f.archiveRows[1][2].effectiveValue.stringValue,'Comercio 1');
 assert.equal(f.archiveRows[1][5].effectiveValue.stringValue,'Último dato manual');
 assert.equal(f.writes.length,2);
});

test('Una baja sin copia íntegra o con la fuente vacía no escribe',async()=>{
 const f=setup();
 f.setImported([merchant('2')]);
 await f.service.refreshSource(owner);
 assert.match((await f.service.workflow.apply(owner,'remove',['id:1']))[0].error,/Falta un respaldo íntegro/);
 f.setImported([]);
 await f.service.refreshSource(owner);
 assert.equal((await f.service.workflow.apply(owner,'remove',['id:1']))[0].applied,false);
 assert.equal(f.writes.length,0);
});