/* Only this gateway issues data requests. Policy is based on file ID + numeric tab IDs. */
(function(root){
const STOCK_HEADERS=['ID','Tipo de equipo','Número de serie','Estado','Fecha de carga','Seller','Mail','Fecha de entrega','Fecha de envío'];
const LINK_HEADERS=['ID','Link','Comentario','Texto para copiar','Favorito'];
const POINTS_TITLE='PointsConsultoresApp',LINKS_TITLE='LinksConsultoresApp';
class SheetsGateway{
 constructor({request=fetch,token=()=>'',fileId,portfolioId=null,stockId=null,linksId=null}){this.request=request;this.token=token;this.fileId=fileId;this.portfolioId=portfolioId;this.stockId=stockId;this.linksId=linksId;this.controller=new AbortController();}
 assert(fileId,sheetId){if(fileId!==this.fileId||!Number.isInteger(sheetId)||![this.portfolioId,this.stockId,this.linksId].includes(sheetId))throw Error('Acceso fuera del archivo o las pestañas autorizadas por la app.');}
 async api(path,body){if(this.controller.signal.aborted)throw Error('Conexión detenida.');if(!this.token())throw Error('Reconectá con Google para continuar.');const r=await this.request('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(this.fileId)+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+this.token(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:this.controller.signal});const data=await r.json();if(!r.ok)throw Error(r.status===401?'La sesión de Google venció. Reconectá desde el perfil.':data.error?.message||'Google no pudo completar la operación.');return data;}
 metadata(){return this.api('?fields=spreadsheetId,properties(title),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))');}
 async read(fileId,sheetId,headerOnly=false){this.assert(fileId,sheetId);const range={sheetId,startRowIndex:0,...(headerOnly?{endRowIndex:1}:{})};const result=await this.api('/values:batchGetByDataFilter',{dataFilters:[{gridRange:range}],majorDimension:'ROWS',valueRenderOption:'FORMATTED_VALUE'});return result.valueRanges?.[0]?.valueRange?.values||[];}
 async batch(fileId,requests){if(fileId!==this.fileId)throw Error('Archivo no permitido.');for(const r of requests){if(r.updateCells){this.assert(fileId,r.updateCells.range?.sheetId);if(r.updateCells.range.sheetId===this.portfolioId)throw Error('La cartera es de solo lectura.');if(r.updateCells.fields!=='userEnteredValue')throw Error('Campos de escritura no permitidos.');}else if(r.updateSheetProperties){this.assert(fileId,r.updateSheetProperties.properties?.sheetId);if(r.updateSheetProperties.properties.sheetId===this.portfolioId)throw Error('La cartera no se modifica.');if(r.updateSheetProperties.fields==='title'&&(r.updateSheetProperties.properties.sheetId!==this.stockId||r.updateSheetProperties.properties.title!==POINTS_TITLE))throw Error('Renombre no permitido.');if(!['gridProperties.columnCount','gridProperties.rowCount','tabColorStyle','title'].includes(r.updateSheetProperties.fields))throw Error('Propiedad no permitida.');}else if(r.addSheet){const title=r.addSheet.properties.title;if(!((title===POINTS_TITLE&&this.stockId===null)||(title===LINKS_TITLE&&this.linksId===null)))throw Error('Solo se pueden crear las pestañas de Points y Links.');}else throw Error('Operación no permitida.');}return this.api(':batchUpdate',{requests});}
 cell(sheetId,row,col,values){this.assert(this.fileId,sheetId);return {updateCells:{range:{sheetId,startRowIndex:row,endRowIndex:row+values.length,startColumnIndex:col,endColumnIndex:col+Math.max(...values.map(r=>r.length))},rows:values.map(r=>({values:r.map(v=>({userEnteredValue:{stringValue:String(v??'')}}))})),fields:'userEnteredValue'}};}
 async ensureTab(kind){
 const title=kind==='stock'?POINTS_TITLE:LINKS_TITLE,headers=kind==='stock'?STOCK_HEADERS:LINK_HEADERS,key=kind==='stock'?'stockId':'linksId';
 let meta=await this.metadata(),tab=meta.sheets.find(s=>s.properties.title===title)?.properties;
 const legacy=kind==='stock'?meta.sheets.find(s=>s.properties.title==='Stock Points')?.properties:null;
 if(tab&&legacy)throw Error('Existen Stock Points y PointsConsultoresApp. Elegí cómo resolverlas antes de vincular; no se modificaron.');
 if(!tab&&legacy)tab=legacy;
 if(!tab){try{await this.batch(this.fileId,[{addSheet:{properties:{title,gridProperties:{rowCount:1000,columnCount:26},tabColorStyle:{rgbColor:{red:220/255,green:38/255,blue:38/255}}}}}]);}catch(error){meta=await this.metadata();if(!meta.sheets.some(s=>s.properties.title===title))throw error;}meta=await this.metadata();tab=meta.sheets.find(s=>s.properties.title===title)?.properties;}
 if(!tab||tab.sheetId===this.portfolioId||tab.sheetId===this[kind==='stock'?'linksId':'stockId'])throw Error('Las tres pestañas deben ser diferentes.');
 this[key]=tab.sheetId;
 const rows=await this.read(this.fileId,tab.sheetId);
 if(rows.length&&headers.some((h,i)=>rows[0]?.[i]!==h))throw Error('La pestaña '+tab.title+' no es compatible. No se sobrescribieron sus datos.');
 const requests=[];
 if(legacy)requests.push({updateSheetProperties:{properties:{sheetId:tab.sheetId,title},fields:'title'}});
 if(!rows.length)requests.push(this.cell(tab.sheetId,0,0,[headers]));
 requests.push({updateSheetProperties:{properties:{sheetId:tab.sheetId,tabColorStyle:{rgbColor:{red:220/255,green:38/255,blue:38/255}}},fields:'tabColorStyle'}});
 await this.batch(this.fileId,requests);return tab.sheetId;
 }
 ensureStock(){return this.ensureTab('stock');}
 ensureLinks(){return this.ensureTab('links');}
 stop(){this.controller.abort();}
}
root.SheetsGateway=SheetsGateway;root.STOCK_HEADERS=STOCK_HEADERS;root.LINK_HEADERS=LINK_HEADERS;
if(typeof module!=='undefined')module.exports={SheetsGateway,STOCK_HEADERS,LINK_HEADERS};
})(typeof window==='undefined'?globalThis:window);
