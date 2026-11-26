// Isolated browser regression: every API and external request is intercepted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Evelin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const root=path.resolve('dist');
 const headers=['Mail','Nombre del comercio','Cust_id comercio','Aceptación','Encuesta valida','Blindaje','LatLog'];
 const portfolio=[headers,['a@example.com','Pendiente','1','No','','','-27.36, -55.89'],['b@example.com','Aceptado','2','Si','Si','','']];
 const state={revision:1,sellers:[],data:{activities:[],links:[],actions:[],assignments:[],equipment:[],settings:{}}};
 const settings={enabled:false,time:'09:00',email:'owner@example.com',emailVerified:false,telegramLinked:false,telegramPending:false,emailConfigured:true,telegramConfigured:true,changes:[],jobs:[]};
 const calls=[],errors=[];let authenticated=true;
 const page=await browser.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url()),req=route.request(),b=req.postDataJSON?.();
  const json=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
  if(u.hostname!=='fixture.test')return route.abort();
  if(u.pathname==='/api/sheets'){
   if(req.method()==='GET')return json({configured:true,authenticated,privateStateEnabled:true});
   if(b.operation==='snapshot')return json({portfolio,stock:[],links:[]});
   if(b.path?.startsWith('?'))return json({properties:{title:'Fixture'},sheets:[{properties:{sheetId:192864634,title:'Base Consultor App',gridProperties:{rowCount:100,columnCount:80}}},{properties:{sheetId:500157585,title:'Points_ConsultoresApp'}},{properties:{sheetId:1266882678,title:'Links_ConsultoresApp'}}]});
   return json({valueRanges:[{valueRange:{values:b.body?.dataFilters?.[0]?.gridRange.sheetId===192864634?portfolio:[]}}]});
  }
  if(u.pathname==='/api/state'){
   if(b?.operation==='visitVisualization')return json({revision:0,settings:{mode:'default',dateColumn:'',months:3}});
   return json(b?.path?.includes('select=revision,sellers,data')?[state]:b?.path?.includes('select=revision')?[{revision:1}]:state);
  }
  if(u.pathname==='/api/notifications'){
   calls.push(b||{view:u.searchParams.get('view')||'full'});
   if(b?.operation==='configure')Object.assign(settings,{enabled:b.enabled,time:b.time,email:b.email});
   if(b?.operation==='verifyEmail')settings.emailVerified=true;
   if(b?.operation==='review'){
    if(settings.invalidImport)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({importValidation:true,error:'Base importada está vacía o solo tiene encabezados.'})});
    settings.automaticStatus='completed';
   }
   if(b?.operation==='applyPortfolioChanges'){
    if(settings.rejectApply)return json({...settings,reviewError:'Base importada está vacía.',results:[]});
    settings.changes=settings.changes.filter(change=>!b.ids.includes(change.id));
    settings.needsAttention=settings.changes.length>0;
    return json({...settings,results:b.ids.map(id=>({id,applied:true}))});
   }
   return json(b?.operation==='preview'?{text:'Resumen de prueba'}:settings);
  }
  try{return await route.fulfill({path:path.join(root,u.pathname==='/'?'index.html':u.pathname)});}catch{return route.fulfill({status:404,body:''});}
 });
 try{
  await page.goto('https://fixture.test/?pantalla=sellers&cartera=sin-aceptacion');
  await page.locator('.live-seller').first().waitFor();assert.equal(await page.locator('.live-seller').count(),1);
  assert.equal(await page.evaluate(()=>sellerFilters.accept),'no');
  await page.locator('[data-op="seller-map"]').click();assert.equal(await page.evaluate(()=>sellerView),'map');
  await page.locator('[data-op="seller-list"]').click();assert.equal(await page.evaluate(()=>sellerFilters.accept),'no');
  await page.locator('[data-excel]').click();assert.ok(await page.locator('dialog[open]').count());await page.evaluate(()=>document.querySelector('dialog[open]').close());
  await page.locator('[data-routes]').click();assert.ok(await page.locator('dialog[open]').count());await page.evaluate(()=>document.querySelector('dialog[open]').close());
  await page.goto('https://fixture.test/?pantalla=usuario');await page.locator('[data-daily-form]').waitFor();
  await page.locator('[data-edit-notifications]').click();
  await page.locator('[data-daily-form] [name=time]').fill('20:30');await page.locator('[data-daily-form] [type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('[data-daily-form] [name=time]')?.disabled);assert.equal(settings.time,'20:30');
  await page.locator('[data-email-confirm]').click();await page.locator('dialog[open] [name=code]').fill('123456');await page.locator('dialog[open] form button').click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.ok(calls.some(c=>c.operation==='verifyEmail'));
  assert.ok(!calls.some(c=>c.operation==='review'));
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  authenticated=false;await page.goto('https://fixture.test/?pantalla=sellers&cartera=sin-aceptacion');await page.getByRole('button',{name:'Ingresar con Google'}).waitFor();
  assert.equal(await page.locator('.live-seller').count(),0);assert.ok(page.url().includes('cartera=sin-aceptacion'));
  authenticated=true;await page.reload();await page.locator('.live-seller').first().waitFor();assert.equal(await page.evaluate(()=>sellerFilters.accept),'no');
  Object.assign(settings,{canReview:true,writesEnabled:false,reviewReady:true,needsAttention:true,automaticStatus:'missed',changes:[{id:'id:4',kind:'add',name:'Alta pendiente',applicable:true}]});
  calls.length=0;
  await page.goto('https://fixture.test/?pantalla=sellers');
  const manual=page.getByRole('button',{name:'Conciliar sellers'});
  await manual.waitFor();
  assert.equal(await page.locator('.workspace-notification').count(),0);
  await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(calls.length,0);
  await page.goto('https://fixture.test/?pantalla=sellers&notificaciones=cambios');
  const dialog=page.getByRole('dialog',{name:'Registrar modificación cartera'});
  await dialog.getByRole('heading',{name:'Hay cambios pendientes'}).waitFor();
  assert.equal(calls.filter(c=>c.operation==='review').length,0);
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).last().click();
  await dialog.waitFor({state:'hidden'});
  await manual.click();
  await dialog.getByRole('heading',{name:'Hay cambios pendientes'}).waitFor();
  assert.equal(calls.filter(c=>c.operation==='review').length,1);
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).last().click();
  await dialog.waitFor({state:'hidden'});
  settings.invalidImport=true;
  await manual.click();
  await dialog.getByRole('heading',{name:'Conciliación bloqueada'}).waitFor();
  await dialog.locator('#portfolio-review').getByText('Base importada está vacía o solo tiene encabezados.').waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Comenzar conciliación'}).count(),0);
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).last().click();
  await dialog.waitFor({state:'hidden'});
  settings.invalidImport=false;
  Object.assign(settings,{writesEnabled:true,changes:[{id:'id:5',kind:'remove',name:'Baja pendiente',applicable:true},...settings.changes]});
  await manual.click();
  await dialog.locator('.portfolio-count-remove').getByText('1 seller').waitFor();
  const confirmRegistration=async()=>{
   await dialog.getByRole('button',{name:'Comenzar conciliación'}).click();
   await dialog.getByRole('checkbox').check();
   await dialog.getByRole('button',{name:'Continuar'}).click();
   if(await dialog.getByRole('checkbox').count()){
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button',{name:'Continuar'}).click();
   }
   await dialog.getByRole('button',{name:'Registrar cambios'}).click();
   await page.getByRole('dialog',{name:'Confirmar registro'}).getByRole('button',{name:'Confirmar',exact:true}).click();
   await dialog.waitFor({state:'hidden'});
  };
  await confirmRegistration();
  const toast=page.locator('.toast[data-operation-notice]');
  await toast.getByText('Registro finalizado').waitFor();
  assert.match(await toast.innerText(),/Se agregó 1 comercio\. Se eliminó 1 comercio\./);
  assert.equal(await toast.evaluate(el=>getComputedStyle(el).fontSize),'14px');
  await manual.click();
  await dialog.getByRole('heading',{name:'Las planillas están conciliadas'}).waitFor();
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).last().click();
  await dialog.waitFor({state:'hidden'});
  Object.assign(settings,{rejectApply:true,needsAttention:true,changes:[{id:'id:6',kind:'remove',name:'Nueva baja',applicable:true}]});
  await manual.click();
  await dialog.getByRole('heading',{name:'Hay cambios pendientes'}).waitFor();
  await confirmRegistration();
  await toast.getByText('No se completó la conciliación').waitFor();
  await toast.getByText('Base importada está vacía.').waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: settings, preview, test delivery, no bell requests, saved results link and explicit reconciliation. API fixtures only.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
