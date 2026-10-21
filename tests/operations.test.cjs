const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx=vm.createContext({console,assert,setTimeout:()=>{},localStorage:{getItem:()=>null},normalizeAnswer:v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase(),escapeHtml:String,Blob,URL:{createObjectURL:b=>{ctx.csvBlob=b;return 'blob:test'},revokeObjectURL:()=>{}},document:{createElement:()=>({click(){ctx.exportName=this.download;}})}});
vm.runInContext('const sellers=[{id:"001",e:"a@example.com",n:"Uno",a:[],accept:"No",survey:"Sí"},{id:"002",e:"b@example.com",n:"Dos",a:[],accept:"Sí",survey:"Sí"}];',ctx);
vm.runInContext(fs.readFileSync('dist/operations.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('dist/enhancements.js','utf8').split('\ninitOperations();')[0],ctx);
vm.runInContext(`
liveAssignments=[{id:'a',action:'Visita',email:'a@example.com',commerce:'Uno',color:'red',locality:'X',contact:'A',phone:'123',category:'K',days:2},{id:'b',action:'Otra',email:'a@example.com',commerce:'Uno',color:'blue'}];
let r=resolveSellerTokens('001 A@example.com 002 missing','Nueva');assert.equal(r.found.length,2);assert.equal(r.duplicates.length,1);assert.deepEqual(r.unknown,['missing']);assert.equal(resolveSellerTokens('001','Visita').already.length,1);
syncSellerActions();assert.equal(sellers[0].a.length,2);liveAssignments=liveAssignments.filter(a=>a.action!=='Visita');syncSellerActions();assert.equal(sellers[0].a.length,1);assert.equal(sellers[0].a[0][0],'Otra');assert.equal(sellers.length,2);
assert.equal(sellerColor(sellers[0]),'#292932');assert.equal(parseLatLog('bad'),null);assert.equal(parseLatLog('91,20'),null);assert.equal(parseLatLog('-34.5,-58.4')[0],-34.5);
liveEquipment=[{id:'p1',serial:'ABC'}];const p={serial:'DEF',loaded:'2026-09-01',delivered:'',sent:'',email:'',type:'Propio',status:'Disponible'};assert.equal(pointValidation(p,'p2'),'');assert.ok(pointValidation({...p,serial:'abc'},'p2'));assert.ok(pointValidation({...p,status:'Entregado',delivered:'2026-08-01',email:'a@example.com'},'p2'));assert.ok(pointValidation({...p,status:'Enviado a Mercado Pago',delivered:'2026-09-02',sent:'2026-09-03',email:'a@example.com'},'p2'));
actionColumns=[2,4];actionSearch='001';exportActions();
`,ctx);
(async()=>{const csv=await ctx.csvBlob.text();assert.ok(csv.startsWith('"Acción comercial";"Mail";"ID";"Comercio";"Nombre de contacto"'));assert.ok(!csv.includes('Teléfono'));assert.ok(csv.includes('"001"'));assert.match(ctx.exportName,/^AccionesComerciales_AppConsultores_\d{4}-\d{2}-\d{2}\.csv$/);console.log('PASS: deduplicación mail/ID, inexistentes, relaciones, colores de mapa, coordenadas, validación Points y exportación.');})();
