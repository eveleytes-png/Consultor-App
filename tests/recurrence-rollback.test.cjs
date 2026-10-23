const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const DemoStore=require('../dist/demo-store.js');
const dataContext={window:{}};vm.runInNewContext(fs.readFileSync('dist/demo-data.js','utf8'),dataContext);
const seed=dataContext.window.CONSULTOR_DEMO_DATA;
assert.equal(seed.sellers.length,0);assert.equal(seed.activities.length,0);assert.equal(seed.links.length,0);assert.equal(seed.equipment.length,0);
const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
const ctx=vm.createContext({replayedEvents:new WeakSet(),document:{querySelector:()=>null,querySelectorAll:()=>[]},Event,MouseEvent:class{},window:{CONSULTOR_DEMO_DATA:seed,CONSULTOR_GOOGLE_CONFIG:{}},DemoStore,localStorage:storage,escapeHtml:String,opNorm:s=>String(s).toLowerCase().trim(),activities:[],usefulLinks:[],sellers:[],liveAssignments:[],actionRegistry:[],liveEquipment:[],actionColumns:[2,3],pointSelection:new Set(),actionSelection:new Set(),syncSellerActions:()=>{},showOpNotice:()=>{},HTMLDialogElement:class{close(){}},Date,URL,console});
ctx.ensureActionIds=()=>{};ctx.renderSellerResults=()=>{};ctx.renderPointResults=()=>{};ctx.renderActionResults=()=>{};
let src=fs.readFileSync('dist/sheets-app.js','utf8').split('window.SheetsApp=')[0];
src+='window.test={loadDemo,snapshot,persistRemote,restore,runMutation,prepare(){render=()=>{};}};})();';vm.runInContext(src,ctx);

(async()=>{
 const api=ctx.window.test;api.loadDemo();api.prepare();
 const original={id:'r',date:'2026-10-22',time:'09:00',description:'Serie',repeat:'daily',completed:false};ctx.activities.push(original);
 storage.setItem=()=>{throw Error('Save rejected');};
 await api.runMutation({type:'click',target:{dispatchEvent(){original.excludedDates=['2026-10-22'];original.repeatBefore='2026-10-24';}}});
 assert.equal(ctx.activities[0],original);
 assert.equal('excludedDates' in original,false);
 assert.equal('repeatBefore' in original,false);
 console.log('PASS: failed recurring deletion restores the original object and removes unsaved exclusions/cutoffs.');
})().catch(error=>{console.error(error);process.exitCode=1;});
