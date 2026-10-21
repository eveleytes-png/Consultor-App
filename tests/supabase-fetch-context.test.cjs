const assert=require('node:assert/strict');
const Store=require('../dist/supabase-store.js');
const original=globalThis.fetch;
globalThis.fetch=async function(){
 assert.equal(this,globalThis,'fetch must retain its browser/global receiver');
 return {ok:true,json:async()=>[{revision:0,sellers:Array(11).fill({id:'test'}),data:{activities:[],links:[],actions:[],assignments:[],equipment:[]}}]};
};
(async()=>{try{
 const store=new Store({url:'https://example.supabase.co',publishableKey:'test'});
 assert.equal((await store.read()).sellers.length,11);
 console.log('PASS: default fetch retains global receiver and loads 11 sellers.');
}finally{globalThis.fetch=original;}})().catch(e=>{console.error(e);process.exitCode=1;});
