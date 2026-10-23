// Isolated activity fixtures. No authenticated services, real records or external writes.
const {chromium}=require('C:/Users/Evelin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('dist');
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://fixture.test').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(file,(error,body)=>{if(error){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(body);});}).listen(4191,'127.0.0.1');
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/google-config.js',r=>r.fulfill({body:'window.CONSULTOR_GOOGLE_CONFIG={enabled:false}'}));
  await page.route('**/supabase-config.js',r=>r.fulfill({body:'window.CONSULTOR_SUPABASE={enabled:false}'}));
  await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({changes:[]})}));
  await page.goto('http://127.0.0.1:4191/?pantalla=agenda');
  await page.waitForSelector('.calendar-view');
  await page.evaluate(()=>{activities.splice(0,activities.length,...[
   {id:'a',date:'2026-10-22',time:'09:30',description:'Revisar comercios prioritarios',comment:'Datos de prueba',completed:false},
   {id:'b',date:'2026-10-22',time:'09:30',description:'Seguimiento de encuestas',comment:'',completed:false},
   {id:'c',date:'2026-10-22',time:'15:30',description:'Corroborar comercios',comment:'',completed:true},
   {id:'late',date:'2026-10-23',time:'23:59',description:'Cierre del día',comment:'',completed:false}
  ]);calendarSelected='2026-10-22';calendarView='month';refreshActivities();});
  assert.equal(await page.locator('.agenda-breadcrumb').count(),0);
  assert.equal(await page.locator('main .calendar-activities').count(),0);
  await page.locator('[data-calendar-date="2026-10-22"]').click();
  await page.waitForSelector('.calendar-day-dialog[open]');
  assert.equal(await page.locator('.calendar-day-dialog [data-activity-id]').count(),3);
  await page.locator('.calendar-day-dialog [data-activity-id="a"]').click();
  await page.waitForSelector('dialog[open] [data-edit-activity]');
  assert.equal(await page.locator('.calendar-day-dialog[open]').count(),0);
  await page.locator('dialog[open] [data-edit-activity]').click();
  await page.locator('dialog[open] input[name="description"]').fill('Revisión actualizada');
  await page.locator('dialog[open] button[type="submit"]').click();
  assert.equal(await page.evaluate(()=>activities.find(a=>a.id==='a').description),'Revisión actualizada');
  await page.locator('[data-calendar-view="week"]').click();
  await page.waitForSelector('.calendar-week-scroll');
  assert.equal(await page.locator('.calendar-week-head [data-calendar-date]').count(),7);
  assert.equal(await page.locator('.calendar-week-event').count(),4);
  assert.equal(await page.locator('main .calendar-activities').count(),0);
  const lanes=await page.locator('.calendar-week-event[data-activity-id="a"],.calendar-week-event[data-activity-id="b"]').evaluateAll(nodes=>nodes.map(e=>({left:e.offsetLeft,width:e.offsetWidth,top:e.offsetTop})));
  assert.equal(lanes[0].top,lanes[1].top);assert.notEqual(lanes[0].left,lanes[1].left);
  await page.locator('.calendar-week-event[data-activity-id="a"]').click();
  await page.locator('dialog[open] [data-complete-activity]').click();
  assert.equal(await page.evaluate(()=>activities.find(a=>a.id==='a').completed),true);
  await page.waitForSelector('.calendar-week-event.is-completed[data-activity-id="a"]');
  await page.locator('.calendar-week-head [data-calendar-date="2026-10-23"]').click();
  assert.equal(await page.locator('.calendar-day-dialog[open]').count(),0);
  await page.locator('.calendar-view [data-open-activity]').click();
  assert.equal(await page.locator('dialog[open] input[name="date"]').inputValue(),'2026-10-23');
  await page.locator('dialog[open] input[name="time"]').fill('11:15');
  await page.locator('dialog[open] input[name="description"]').fill('Nueva actividad de prueba');
  await page.locator('dialog[open] button[type="submit"]').click();
  const newId=await page.evaluate(()=>activities.find(a=>a.description==='Nueva actividad de prueba').id);
  assert.equal(await page.locator('.calendar-week-event').count(),5);
  await page.locator(`.calendar-week-event[data-activity-id="${newId}"]`).click();
  await page.locator('dialog[open] [data-remove-activity]').click();
  await page.locator('dialog[open] [data-confirm-delete]').click();
  assert.equal(await page.evaluate(id=>activities.some(a=>a.id===id),newId),false);
  assert.equal(await page.locator('.calendar-week-event').count(),4);
  await page.evaluate(()=>document.querySelectorAll('.toast').forEach(e=>e.remove()));
  for(const width of [1366,768,390,320]){
   await page.setViewportSize({width,height:900});
   await page.locator('[data-calendar-view="month"]').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Monthly overflow ${width}`);
   await page.screenshot({path:`tests/calendar-month-${width}.png`,fullPage:true});
   await page.locator('[data-calendar-date="2026-10-22"]').click();
   await page.waitForSelector('.calendar-day-dialog[open]');
   if(width===390)await page.screenshot({path:'tests/calendar-day-popup-390.png'});
   await page.locator('.calendar-day-dialog [data-modal-close]').first().click();
   await page.locator('[data-calendar-view="week"]').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Weekly page overflow ${width}`);
   if(width<800)assert.equal(await page.locator('.calendar-week-scroll').evaluate(e=>e.scrollWidth>e.clientWidth),true);
   await page.screenshot({path:`tests/calendar-week-${width}.png`,fullPage:true});
  }
  await page.locator('.calendar-week-scroll').evaluate(e=>{e.scrollTop=700;e.scrollLeft=140;});
  await page.waitForTimeout(100);
  await page.evaluate(()=>refreshActivities());
  await page.waitForFunction(()=>document.querySelector('.calendar-week-scroll')?.scrollTop===700);
  assert.equal(await page.locator('.calendar-week-scroll').evaluate(e=>e.scrollLeft),140);
  await page.locator('[data-calendar-view="month"]').click();
  await page.locator('[data-calendar-date="2026-10-26"]').click();
  assert.match(await page.locator('.calendar-day-dialog').innerText(),/No hay actividades para este día/);
  await page.locator('.calendar-day-dialog [data-add-day]').click();
  assert.equal(await page.locator('dialog[open] input[name="date"]').inputValue(),'2026-10-26');
  await page.locator('dialog[open] [data-modal-close]').first().click();
  assert.deepEqual(errors,[]);
  console.log('PASS: monthly floating day details, no breadcrumb/below-calendar list, weekly seven-day time columns and collision lanes, activity create/edit/complete/delete, empty-day creation, scroll preservation and 1366/768/390/320 responsive views; no browser errors or real writes.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
