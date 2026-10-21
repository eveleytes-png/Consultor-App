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
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
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
  await page.locator('[data-excel]').click();assert.ok(await page.locator('dialog[open]').count());await page.evaluate(()=>document.querySelector('dialog[open]').close());
  await page.locator('[data-routes]').click();assert.ok(await page.locator('dialog[open]').count());await page.evaluate(()=>document.querySelector('dialog[open]').close());
  await page.goto('https://fixture.test/?pantalla=usuario&notificaciones=cambios');await page.locator('[data-daily-form]').waitFor();
  await page.locator('[data-daily-form] [name=time]').fill('20:30');await page.locator('[data-daily-form] button').click();
  await page.waitForFunction(()=>document.querySelector('[data-notification-message]')?.textContent==='Configuración actualizada.');assert.equal(settings.time,'20:30');
  await page.locator('[data-email-confirm]').click();await page.locator('dialog[open] [name=code]').fill('123456');await page.locator('dialog[open] form button').click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.ok(calls.some(c=>c.operation==='verifyEmail'));
  await page.locator('[data-notify=preview]').click();await page.getByText('Resumen de prueba',{exact:true}).waitFor();await page.evaluate(()=>document.querySelector('dialog[open]').close());
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'tests/notifications-profile-390.png',fullPage:true});
  authenticated=false;await page.goto('https://fixture.test/?pantalla=sellers&cartera=sin-aceptacion');await page.getByRole('button',{name:'Ingresar con Google'}).waitFor();
  assert.equal(await page.locator('.live-seller').count(),0);assert.ok(page.url().includes('cartera=sin-aceptacion'));
  authenticated=true;await page.reload();await page.locator('.live-seller').first().waitFor();assert.equal(await page.evaluate(()=>sellerFilters.accept),'no');
  assert.deepEqual(errors,[]);
  console.log('PASS: profile settings and verification dialog, mobile layout, deep link with active/closed session, filter/map/list/download/route dialogs. API fixtures only; no real login or delivery.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
