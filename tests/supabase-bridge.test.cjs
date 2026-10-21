const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let saved=null;
class Store {constructor(){this.revision=4;}async save(value){saved=JSON.parse(JSON.stringify(value));return {revision:5,data:value};}}
const ctx=vm.createContext({window:{CONSULTOR_SUPABASE:{enabled:true},CONSULTOR_DEMO_DATA:{},CONSULTOR_GOOGLE_CONFIG:{}},SupabaseStore:Store,localStorage:{getItem:()=>null,setItem:()=>{throw Error('Unexpected local save');}},escapeHtml:String,opNorm:String,activities:[],usefulLinks:[],sellers:[],liveAssignments:[],actionRegistry:[],liveEquipment:[],syncSellerActions(){},showOpNotice(){},HTMLDialogElement:class{close(){}},Date,URL,console});
ctx.renderSellerResults=()=>{};ctx.renderPointResults=()=>{};ctx.renderActionResults=()=>{};
let source=fs.readFileSync('dist/sheets-app.js','utf8').split('window.SheetsApp=')[0];
source+='window.test={snapshot,persistRemote,shared,demo};})();';vm.runInContext(source,ctx);
(async()=>{
 assert.equal(ctx.window.test.shared,true);assert.equal(ctx.window.test.demo,false);
 const before=ctx.window.test.snapshot();ctx.activities.push({id:'a'});ctx.usefulLinks.push({id:'l',url:'https://example.com'});ctx.liveEquipment.push({id:'p'});ctx.actionRegistry.push({id:'r'});ctx.liveAssignments.push({id:'x'});
 const after=ctx.window.test.snapshot();await ctx.window.test.persistRemote(before,after);
 for(const name of ['activities','links','equipment','actions','assignments'])assert.equal(saved[name].length,1);
 console.log('PASS: Supabase mode takes precedence over demo and all five collections use shared persistence.');
})().catch(error=>{console.error(error);process.exitCode=1;});
