const assert=require('node:assert/strict');
const Store=require('../dist/supabase-store.js');
const empty=()=>({activities:[],links:[],actions:[],assignments:[],equipment:[]});
let row={revision:0,sellers:[{id:'1',n:'Test'}],data:empty()},offline=false;
const clone=x=>JSON.parse(JSON.stringify(x));
const request=async(url,options)=>{
 assert.equal(options.headers.apikey,'sb_publishable_test');
 assert.equal(options.headers.Authorization,undefined);
 if(offline)throw new TypeError('network');
 let body;
 if(options.method==='POST'){
  body=JSON.parse(options.body);
  assert.equal(body.new_data.sellers,undefined);
  if(body.expected_revision!==row.revision)return {ok:false,json:async()=>({code:'40001'})};
  row={...row,revision:row.revision+1,data:clone(body.new_data)};
  return {ok:true,json:async()=>clone(row)};
 }
 return {ok:true,json:async()=>[clone(row)]};
};
(async()=>{
 const config={url:'https://example.supabase.co',publishableKey:'sb_publishable_test'};
 const a=new Store(config,request),b=new Store(config,request);
 a.revision=(await a.read()).revision;b.revision=(await b.read()).revision;
 const draft=empty();draft.activities.push({id:'a',description:'test'});
 await a.save(draft);assert.equal(await b.changed(),true);
 await assert.rejects(b.save(empty()),/Otro dispositivo/);
 assert.equal(row.data.activities.length,1);assert.equal(b.revision,0);
 b.revision=(await b.read()).revision;
 await b.save(empty());assert.equal((await a.read()).data.activities.length,0);
 offline=true;await assert.rejects(a.save(draft),/No se pudo confirmar/);
 assert.equal(row.revision,2);
 const missing=new Store(config,async()=>({ok:false,json:async()=>({code:'PGRST205'})}));
 await assert.rejects(missing.read(),/configuración de Supabase/);
 const corrupt=new Store(config,async()=>({ok:true,json:async()=>[{}]}));
 await assert.rejects(corrupt.read(),/formato compatible/);
 console.log('PASS: shared reads, optimistic concurrency, delete propagation, network failure, missing schema and public-key headers.');
})().catch(e=>{console.error(e);process.exitCode=1;});
