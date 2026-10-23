const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const ctx=vm.createContext({window:{addEventListener(){}},document:{addEventListener(){}},cardPreferences:{},renderSellerResults(){},console});
vm.runInContext(fs.readFileSync('dist/demo-data.js','utf8'),ctx);
// Synthetic private rows belong in the test, never in the public release seed.
ctx.window.CONSULTOR_DEMO_DATA.sellers=[{sourceValues:Array.from({length:71},(_,i)=>({1:'Comercio ficticio',18:'COMERCIO FICTICIO',22:'Categoría de prueba',23:'TEST-CONSULTOR'}[i]||''))}];
vm.runInContext(fs.readFileSync('dist/customization.js','utf8'),ctx);
vm.runInContext(`
const first=window.CONSULTOR_DEMO_DATA.sellers[0];
window.result={count:portfolioColumns.length,blank:portfolioColumns[7],id:columnValue(first,'c23'),name:columnValue(first,'c1')};
window.restoreConsultorSettings({card:{title:'c18',additional:'c22'},detailColumns:['c22','c1'],actionColumns:['c62','c0','c15']});
window.result.title=cardTitle(first);window.result.additional=cardAdditional(first);window.result.order=visibleDetailColumns();window.result.action=actionTableColumns().map(c=>c.key);
`,ctx);
const r=JSON.parse(JSON.stringify(ctx.window.result));
assert.equal(r.count,71);assert.equal(r.blank.label,'Columna H');assert.equal(r.id,'TEST-CONSULTOR');assert.equal(r.name,'Comercio ficticio');assert.equal(r.title,'COMERCIO FICTICIO');assert.equal(r.additional,'Categoría de prueba');assert.deepEqual(r.order,['c22','c1']);assert.deepEqual(r.action,['action','c0','c15','c1','c2','c3']);
const home=fs.readFileSync('dist/home.js','utf8');assert(home.includes('data-copy-link'));assert(home.includes('data-link-search'));assert(home.includes('>Descripción</label>'));assert(!home.includes('for="link-comment">Comentario'));
console.log('PASS: 71 stable columns, blank headers, shared field choices, source values and action column deduplication.');
