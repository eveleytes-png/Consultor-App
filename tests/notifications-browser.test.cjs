// Isolated browser regression: every API and external request is intercepted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Evelin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const root=path.resolve('dist');
 const headers=['Mail','Nombre del comercio','Cust_id comercio','Aceptación','Encuesta valida','Blindaje','LatLog'];
 const portfolio=[headers,['a@example.com','Pendiente','1','No','','','-27.36, -55.89'],['b@example.com','Aceptado','2','Si','Si','','']];
 const state={revision:1,sellers:[],data:{activities:[],links:[],actions:[],assignments:[],equipment:[],settings:{}}};
 const settings={enabled:false,time:'09:00',email:'owner@example.com',emailVerified:false,telegramLinked:false,telegramPending:false,emailConfigured:true,telegramConfigured:true,changes:[],jobs:[],needsAttention:true,review:{status:'pending',checkedAt:'2026-10-22T12:00:00Z'},sheetUrl:'https://docs.google.com/spreadsheets/d/fixture/edit'};
 const calls=[],errors=[];let authenticated=true,reviewOutcome='pending';
 const page=await browser.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url()),req=route.request(),b=req.postDataJSON?.();
  const json=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
  if(u.hostname!=='fixture.test')return route.abort();
  if(u.pathname==='/api/sheets'){
   if(req.method()==='GET')return json({configured:true,authenticated,privateStateEnabled:true});
   if(b.operation==='snapshot')return json({portfolio,stock:[],links:[]});
   if(b.path?.startsWith('?'))return json({properties:{title:'Fixture'},sheets:[{properties:{sheetId:0,title:'BaseApp',gridProperties:{rowCount:100,columnCount:80}}},{properties:{sheetId:500157585,title:'Points_ConsultoresApp'}},{properties:{sheetId:1266882678,title:'Links_ConsultoresApp'}}]});
   return json({valueRanges:[{valueRange:{values:b.body?.dataFilters?.[0]?.gridRange.sheetId===0?portfolio:[]}}]});
  }
  if(u.pathname==='/api/state')return json(b.path.includes('select=revision,sellers,data')?[state]:b.path.includes('select=revision')?[{revision:1}]:state);
  if(u.pathname==='/api/notifications'){
   if(!authenticated)return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Ingresá con Google'})});
   if(b?.operation==='review'){
    if(reviewOutcome==='error'){settings.review.status='error';settings.review.lastError='Error de lectura';return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'No se pudo verificar'})});}
    settings.review.status=reviewOutcome;settings.needsAttention=reviewOutcome!=='resolved';
   }

   calls.push(b||{});if(b?.operation==='configure')Object.assign(settings,{enabled:b.enabled,time:b.time,email:b.email});
   if(b?.operation==='verifyEmail')settings.emailVerified=true;
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
  // Backup reads the entire source even while the acceptance filter hides a seller.
  await page.evaluate(()=>{
   window.backupTest={};
   window.XLSX={utils:{book_new:()=>({}),aoa_to_sheet:rows=>{window.backupTest.rows=rows;return rows;},book_append_sheet:()=>{}},write:()=>new Uint8Array([80,75])};
   window.showSaveFilePicker=async options=>{window.backupTest.filename=options.suggestedName;return {createWritable:async()=>({write:async blob=>{window.backupTest.size=blob.size;},close:async()=>{window.backupTest.closed=true;}})};};
  });
  await page.locator('[data-backup-baseapp]').click();await page.waitForFunction(()=>window.backupTest.closed);
  const backup=await page.evaluate(()=>window.backupTest);assert.deepEqual(backup.rows,portfolio);assert.match(backup.filename,/^BaseApp_Respaldo_.*[.]xlsx$/);assert.equal(backup.size,2);
  await page.evaluate(()=>{window.showSaveFilePicker=async()=>{throw new DOMException('Cancelado','AbortError');};});
  await page.locator('[data-backup-baseapp]').click();await page.waitForFunction(()=>!document.querySelector('[data-backup-baseapp]').disabled);
  await page.evaluate(()=>{delete window.showSaveFilePicker;});
  const downloaded=page.waitForEvent('download');await page.locator('[data-backup-baseapp]').click();assert.match((await downloaded).suggestedFilename(),/^BaseApp_Respaldo_/);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'tests/baseapp-backup-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:720});
  await page.locator('[data-excel]').click();assert.ok(await page.locator('dialog[open]').count());await page.evaluate(()=>document.querySelector('dialog[open]').close());
  await page.locator('[data-routes]').click();assert.ok(await page.locator('dialog[open]').count());await page.evaluate(()=>document.querySelector('dialog[open]').close());
  await page.goto('https://fixture.test/?pantalla=usuario');await page.locator('[data-daily-form]').waitFor();
  await page.locator('[data-daily-form] [name=time]').fill('20:30');await page.locator('[data-daily-form] button').click();
  await page.waitForFunction(()=>document.querySelector('[data-notification-message]')?.textContent==='Configuración actualizada.');assert.equal(settings.time,'20:30');
  await page.locator('[data-email-confirm]').click();await page.locator('dialog[open] [name=code]').fill('123456');await page.locator('dialog[open] form button').click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.ok(calls.some(c=>c.operation==='verifyEmail'));
  await page.locator('[data-notify=preview]').click();await page.getByText('Resumen de prueba',{exact:true}).waitFor();await page.evaluate(()=>document.querySelector('dialog[open]').close());
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'tests/notifications-profile-390.png',fullPage:true});
  await page.setViewportSize({width:1280,height:720});
  await page.locator('.workspace-notification.has-unread').waitFor();
  assert.equal(await page.locator('.workspace-top .workspace-notification').count(),1);
  await page.locator('.workspace-notification.has-unread').click();await page.locator('#portfolio-review').waitFor();
  assert.ok(await page.locator('.workspace-notification.has-unread').isVisible());
  await page.getByRole('button',{name:'Ya realicé los cambios manualmente'}).click();await page.getByText('Todavía quedan modificaciones por realizar.',{exact:true}).first().waitFor();
  await page.reload();await page.locator('#portfolio-review').waitFor();assert.ok(await page.locator('.workspace-notification.has-unread').isVisible());
  for(const screen of ['inicio','sellers','points','acciones']){await page.goto('https://fixture.test/?pantalla='+screen);await page.locator('.workspace-notification.has-unread').waitFor();}
  await page.setViewportSize({width:390,height:844});await page.locator('.workspace-notification.has-unread').waitFor();
  assert.equal(await page.locator('.workspace-top .workspace-hamburger').count(),1);assert.equal(await page.locator('.mobile-nav .current').isVisible(),false);
  await page.locator('.workspace-notification.has-unread').click();await page.locator('#portfolio-review').waitFor();
  reviewOutcome='error';await page.getByRole('button',{name:'Ya realicé los cambios manualmente'}).click();await page.getByText('No se pudo verificar',{exact:true}).waitFor();
  assert.equal(await page.locator('#portfolio-review ul').count(),0);assert.ok(await page.locator('.workspace-notification.has-unread').isVisible());
  await page.screenshot({path:'tests/portfolio-review-error-mobile.png',fullPage:true});
  authenticated=false;await page.reload();await page.getByRole('button',{name:'Ingresar con Google'}).waitFor();assert.equal(await page.locator('#portfolio-review').count(),0);assert.ok(page.url().includes('notificaciones=cambios'));
  authenticated=true;await page.reload();await page.locator('#portfolio-review').waitFor();assert.ok(await page.locator('.workspace-notification.has-unread').isVisible());
  reviewOutcome='resolved';await page.getByRole('button',{name:'Ya realicé los cambios manualmente'}).click();await page.getByText('Cartera actualizada. La comprobación confirmó que los emails coinciden.',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-portfolio-bell]').count(),0);await page.reload();await page.locator('#portfolio-review').waitFor();assert.equal(await page.locator('[data-portfolio-bell]').count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'tests/portfolio-review-resolved-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: persistent bell, desktop/mobile placement, navigation/reload/session, manual pending/error/resolved states, profile settings and verification dialog, mobile layout, deep link with active/closed session, filter/map/list/download/route dialogs. API fixtures only; no real login or delivery.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
