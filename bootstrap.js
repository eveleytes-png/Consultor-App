// Remove obsolete demo persistence once; never clear unrelated site data.
if(localStorage.getItem('consultor-clean-schema')!=='first-import-3'){
 for(const storage of [localStorage,sessionStorage])for(const key of Object.keys(storage))if(key.startsWith('consultor-'))storage.removeItem(key);
 localStorage.setItem('consultor-clean-schema','first-import-3');
}
const replayedEvents=new WeakSet();
for(const event of ['click','submit'])document.addEventListener(event,e=>{if(!replayedEvents.has(e))window.SheetsApp?.intercept(e);},true);
