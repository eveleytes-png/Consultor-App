const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {SheetsGateway,STOCK_HEADERS,LINK_HEADERS}=require('../dist/sheets-gateway.js');
const tables={1:[['Comercio','Mail','ID','Aceptación','Encuesta valida','Blindaje']]},props={1:{sheetId:1,title:'Ejemplo Planilla',gridProperties:{rowCount:1000,columnCount:26}}},writes=[];
let nextId=2,failCreate=true;
const request=async(url,opt)=>{const body=opt.body&&JSON.parse(opt.body);if(url.includes('batchGetByDataFilter'))return {ok:true,json:async()=>({valueRanges:[{valueRange:{values:JSON.parse(JSON.stringify(tables[body.dataFilters[0].gridRange.sheetId]))}}]})};
if(url.endsWith(':batchUpdate')){writes.push(body);for(const r of body.requests){if(r.addSheet){const id=nextId++;props[id]={...r.addSheet.properties,sheetId:id};tables[id]=[];if(failCreate){failCreate=false;throw Error('lost response');}}if(r.updateSheetProperties)Object.assign(props[r.updateSheetProperties.properties.sheetId],r.updateSheetProperties.properties);if(r.updateCells){const c=r.updateCells;for(let y=0;y<c.rows.length;y++){const row=tables[c.range.sheetId][c.range.startRowIndex+y] ||= [];c.rows[y].values.forEach((v,x)=>row[c.range.startColumnIndex+x]=v.userEnteredValue.stringValue);}}}return {ok:true,json:async()=>({})};}
return {ok:true,json:async()=>({properties:{title:'Test'},sheets:Object.values(props).map(properties=>({properties}))})};};
(async()=>{
const g=new SheetsGateway({request,token:()=> 'test',fileId:'selected',portfolioId:1});
assert.throws(()=>g.assert('other',1));await assert.rejects(()=>g.read('selected',9));
await assert.rejects(()=>g.batch('selected',[g.cell(1,0,0,[['forbidden']])]),/solo lectura/);
const stockId=await g.ensureStock(),linksId=await g.ensureLinks();await g.ensureStock();await g.ensureLinks();assert.equal(nextId,4);assert.deepEqual(tables[stockId],[STOCK_HEADERS]);assert.deepEqual(tables[linksId],[LINK_HEADERS]);
tables[linksId]=[['incompatible'],['preserve']];const count=writes.length;await assert.rejects(()=>g.ensureLinks(),/compatible/);assert.equal(writes.length,count);tables[linksId]=[LINK_HEADERS];
const memory=new Map(),ctx=vm.createContext({window:{CONSULTOR_GOOGLE_CONFIG:{}},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},escapeHtml:String,opNorm:s=>String(s??'').toLowerCase().trim(),activities:[],usefulLinks:[],sellers:[],liveAssignments:[],actionRegistry:[],liveEquipment:[],pointSelection:new Set(),actionSelection:new Set(),ensureActionIds:()=>{},syncSellerActions:()=>{},showOpNotice:()=>{},HTMLDialogElement:class{close(){}},Date,URL,console,STOCK_HEADERS,LINK_HEADERS});
ctx.renderSellerResults=()=>{};ctx.renderPointResults=()=>{};ctx.renderActionResults=()=>{};
Object.assign(ctx,require('../home.js'));
let source=fs.readFileSync('dist/sheets-app.js','utf8').split('window.SheetsApp=')[0];source+='window.test={hydrate,snapshot,persistRemote,setup(b,g){binding=b;gateway=g;ready=true;expires=Date.now()+60000;}};})();';vm.runInContext(source,ctx);
const api=ctx.window.test;api.setup({fileId:'selected',portfolioId:1,stockId,linksId,headers:tables[1][0],mapping:{n:0,e:1,id:2,accept:3,survey:4,blindaje:5}},g);
api.hydrate({portfolio:tables[1],stock:tables[stockId],links:tables[linksId]});
const before=api.snapshot();ctx.activities.push({id:'local-only'});await api.persistRemote(before,api.snapshot());assert.ok([...memory.values()].some(v=>v.includes('local-only')));
const p=api.snapshot();ctx.liveEquipment.push({id:'p1',serial:'A123',type:'Propio',status:'Disponible'});await api.persistRemote(p,api.snapshot());
const l=api.snapshot();ctx.usefulLinks.push({id:'l1',url:'https://example.com/',comment:'test',copyText:'copy',favorite:true});await api.persistRemote(l,api.snapshot());assert.equal(tables[linksId][1][1],'https://example.com/');
assert.equal(tables[1].length,1);assert.equal(tables[1][0].length,6);assert.ok(writes.every(b=>b.requests.every(r=>!r.updateCells||r.updateCells.range.sheetId!==1)));
const conflict=api.snapshot();tables[stockId][1][2]='REMOTE';ctx.liveEquipment[0].serial='LOCAL';await assert.rejects(()=>api.persistRemote(conflict,api.snapshot()),/cambió/);
props[stockId].title='Stock Points';await g.ensureStock();assert.equal(props[stockId].title,'PointsConsultoresApp');assert.equal(nextId,4);props[9]={sheetId:9,title:'Stock Points'};const migrationCount=writes.length;await assert.rejects(()=>g.ensureStock(),/Existen/);assert.equal(writes.length,migrationCount);delete props[9];
console.log('PASS: three-tab scope, portfolio read-only, retry without duplicates, incompatibility preserved, local agenda, remote Points/Links, conflict detection. No real Google operations.');
})();
