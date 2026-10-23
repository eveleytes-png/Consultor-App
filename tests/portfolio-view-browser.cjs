// Visual regression with isolated fixtures. No merchant records or production writes.
const {chromium}=require('C:/Users/Evelin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('dist');
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://fixture.test').pathname;
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(b);});
 }).listen(4189,'127.0.0.1');
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:1000},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/google-config.js',r=>r.fulfill({body:'window.CONSULTOR_GOOGLE_CONFIG={enabled:false}'}));
  await page.route('**/supabase-config.js',r=>r.fulfill({body:'window.CONSULTOR_SUPABASE={enabled:false}'}));
  await page.route('**/api/**',r=>r.fulfill({status:r.request().url().includes('/notifications')?200:403,contentType:'application/json',body:JSON.stringify({changes:[]})}));
  // Load the unchanged screen first. The scoped stylesheet is inert without its class.
  await page.route('**/portfolio-view.js',r=>r.fulfill({body:''}));
  await page.goto('http://127.0.0.1:4189/?pantalla=sellers');
  await page.waitForSelector('#seller-results');
  await page.evaluate(()=>{
   consultantSettings.profile={name:'Consultor de prueba'};
   const records=[
    ['Ignacio GYM','ignacio@example.com','POSADAS','Centro','no','','-27.36,-55.89','Revisar activación de QR.'],
    ['Núñez Luis Alberto','nunez@example.com','RESISTENCIA','Norte','si','si','-27.45,-58.98','Interesado en ampliar cobertura.'],
    ['Local','local@example.com','POSADAS','Sur','','','','Sin datos de contacto.'],
    ['Autoservicio Diki','diki@example.com','ITAEMBÉ','Oeste','si','no','','Coordinar nueva visita.']
   ];
   sellers.splice(0,sellers.length,...records.map(([n,e,z,s,accept,survey,latlog,comment],i)=>{
    const sourceValues=[];Object.assign(sourceValues,{0:e,1:n,2:z,3:s,4:latlog,5:comment,6:i===2?'':'5491100000000',15:String(i+1),16:'Contacto',17:'Prueba',19:i<2?'5491100000000':'',35:survey,36:'22/10/2026',49:accept});
    return {id:String(i+1),n,e,z,s,accept,survey,latlog,a:[],nombre:'Contacto',apellido:'Prueba',telefono1:i<2?'5491100000000':'',whatsapp:i===2?'':'5491100000000',sourceValues};
   }));
   renderOperations();
   window.presentationBefore={
    functions:[filteredSellers,renderSellerResults,liveSellerCard,sellerDetail,sellerFilterDialog,window.captureConsultorView,window.consultorSurveyUrl],
    toolbar:document.querySelector('main>.toolbar'),search:document.querySelector('#seller-search'),cards:[...document.querySelectorAll('#seller-results>.live-seller')],
    actions:[...document.querySelectorAll('.portfolio-tools>button')].map(b=>[b,b.onclick]),
    data:JSON.stringify({sellers,consultantSettings,cardPreferences}),sidebar:document.querySelector('.workspace-sidebar').outerHTML
   };
  });
  await page.waitForFunction(()=>document.querySelector('.workspace-sidebar')?.textContent.includes('Consultor de prueba'));
  await page.evaluate(()=>window.presentationBefore.sidebar=document.querySelector('.workspace-sidebar').outerHTML);
  // Compare existing zoom-anchor behavior before/after; do not change navigation handlers.
  await page.locator('[data-op="seller-map"]').click();
  await page.waitForFunction(()=>Number.isFinite(geographicMap?.getZoom()),{},{timeout:40000});
  const baselineZoom=await page.evaluate(()=>geographicMap.getZoom());
  await page.locator(baselineZoom>=19?'.leaflet-control-zoom-out':'.leaflet-control-zoom-in').click();
  await page.waitForTimeout(500);
  const baselineZoomChanged=await page.evaluate(z=>geographicMap?.getZoom()!==z,baselineZoom);
  await page.locator('[data-op="seller-list"]').click();
  await page.waitForSelector('#seller-results>.live-seller');
  await page.evaluate(()=>{Object.assign(window.presentationBefore,{toolbar:document.querySelector('main>.toolbar'),search:document.querySelector('#seller-search'),cards:[...document.querySelectorAll('#seller-results>.live-seller')],actions:[...document.querySelectorAll('.portfolio-tools>button')].map(b=>[b,b.onclick])});});
  const sidebarBefore=await page.locator('.workspace-sidebar').screenshot();
  await page.screenshot({path:'tests/cartera-before-1366.png',fullPage:true});
  await page.addScriptTag({content:fs.readFileSync('dist/portfolio-view.js','utf8')});
  await page.waitForSelector('.cartera-view .cartera-stats');
  assert.equal(await page.evaluate(()=>{
   const b=window.presentationBefore;
   return b.functions.every((f,i)=>f===[filteredSellers,renderSellerResults,liveSellerCard,sellerDetail,sellerFilterDialog,window.captureConsultorView,window.consultorSurveyUrl][i])&&b.toolbar===document.querySelector('main>.toolbar')&&b.search===document.querySelector('#seller-search')&&b.cards.every((c,i)=>c===document.querySelectorAll('#seller-results>.live-seller')[i])&&b.actions.every(([node,fn])=>node.isConnected&&node.onclick===fn)&&b.data===JSON.stringify({sellers,consultantSettings,cardPreferences})&&b.sidebar===document.querySelector('.workspace-sidebar').outerHTML;
  }),true,'Functional controls, functions, data and menu must stay unchanged');
  assert.ok(sidebarBefore.equals(await page.locator('.workspace-sidebar').screenshot()),'Sidebar pixels must be identical');
  assert.deepEqual(await page.locator('.cartera-stats strong').allTextContents(),['4','2','2','—']);
  assert.equal(await page.locator('.cartera-status').count(),4);
  assert.ok((await page.locator('.cartera-meta').allTextContents()).some(t=>t.includes('Revisar activación de QR.')));
  assert.equal(await page.locator('.cartera-meta img').count(),0);
  await page.screenshot({path:'tests/cartera-list-1366.png',fullPage:true});
  const first=page.locator('#seller-results>.live-seller').first();
  await first.locator('[data-op="copy-mail"]').click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'diki@example.com');
  assert.match(await first.getByRole('link',{name:/WhatsApp de/}).getAttribute('href'),/^https:\/\/wa.me\//);
  await first.locator('.seller-body').click();
  await page.waitForSelector('.configured-detail[open]');
  await page.locator('.configured-detail [data-modal-close]').first().click();
  await page.locator('#seller-search').fill('ignacio');
  assert.equal(await page.locator('#seller-results>.live-seller').count(),1);
  await page.locator('#seller-search').fill('');
  await page.locator('[data-op="seller-filters"]').click();
  await page.locator('dialog[open] input[name="accept"][value="no"]').check();
  assert.equal(await page.locator('#seller-results>.live-seller').count(),1);
  assert.deepEqual(await page.locator('.cartera-stats strong').allTextContents(),['1','1','0','—']);
  await page.locator('dialog[open] [data-results]').click();
  await page.locator('#seller-search').fill('inexistente');
  assert.equal(await page.locator('#seller-results>.live-seller').count(),0);
  await page.getByRole('button',{name:'Limpiar búsqueda y filtros'}).click();
  assert.equal(await page.locator('#seller-results>.live-seller').count(),4);
  await page.locator('[data-routes]').click();assert.ok(await page.locator('dialog[open]').count());
  await page.evaluate(()=>document.querySelector('dialog[open]').close());
  await page.locator('[data-excel]').click();assert.ok(await page.locator('dialog[open]').count());
  await page.evaluate(()=>document.querySelector('dialog[open]').close());
  await page.evaluate(()=>document.querySelectorAll('.toast').forEach(e=>e.remove()));
  // Backup remains exactly the existing handler; do not create a real backup in this test.
  assert.match(await page.locator('[data-backup-baseapp]').evaluate(b=>b.onclick.toString()),/backupBaseApp/);
  for(const width of [1024,768,390,320]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}`);
   await page.screenshot({path:`tests/cartera-list-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1366,height:1000});
  await page.locator('[data-op="seller-map"]').click();
  await page.waitForSelector('.geographic-wrapper');
  assert.equal(await page.locator('.legend span').count(),4);
  assert.match(await page.locator('.map-results-summary').innerText(),/4.*comercios/s);
  assert.equal(await page.locator('[data-op="seller-map"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-map-unlocated]').click();
  await page.waitForSelector('.unlocated-dialog[open]');
  assert.equal(await page.locator('.unlocated-dialog .live-seller').count(),2);
  await page.evaluate(()=>document.querySelector('.unlocated-dialog').close());
  // Real map libraries are loaded by the existing code. A tile/network failure is reported by that code.
  await page.waitForFunction(()=>document.querySelector('.leaflet-container')||document.querySelector('.map-load-status')?.textContent.includes('No se pudo'),{},{timeout:40000});
  if(await page.locator('.leaflet-container').count()){
   await page.waitForFunction(()=>Number.isFinite(geographicMap?.getZoom()));
   const zoom=await page.evaluate(()=>geographicMap.getZoom());
   await page.locator(zoom>=19?'.leaflet-control-zoom-out':'.leaflet-control-zoom-in').click();
   await page.waitForTimeout(500);
   assert.equal(await page.evaluate(z=>geographicMap?.getZoom()!==z,zoom),baselineZoomChanged,'Zoom controls must preserve baseline behavior');
   console.log('Existing zoom-anchor behavior preserved; baseline zoom changed:',baselineZoomChanged);
   await page.waitForFunction(()=>Number.isFinite(geographicMap?.getZoom()));
   await page.locator('.seller-map-marker').first().click();
   await page.waitForSelector('.map-selected-card .live-seller');
   await page.locator('.map-card-close').click();
   assert.equal(await page.locator('.map-selected-card .live-seller').count(),0);
   await page.locator('.leaflet-control-layers').getByText('Satélite',{exact:true}).click();
   assert.equal(await page.evaluate(()=>mapBaseLayer),'Satélite');
   await page.locator('.leaflet-control-layers').getByText('Mapa',{exact:true}).click();
   assert.equal(await page.evaluate(()=>mapBaseLayer),'Mapa');
  }
  await page.screenshot({path:'tests/cartera-map-1366.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'tests/cartera-map-390.png',fullPage:true});
  await page.locator('[data-op="seller-list"]').click();
  assert.equal(await page.locator('#seller-results>.live-seller').count(),4);
  await page.setViewportSize({width:1366,height:1000});
  for(const screen of ['inicio','acciones','points','usuario']){
   await page.locator('.workspace-sidebar a[href="'+(screen==='inicio'?'./':'?pantalla='+screen)+'"]').first().click();
   await page.waitForFunction(()=>!document.querySelector('main.cartera-view'));
   assert.equal(await page.locator('.cartera-stats').count(),0);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: original function/node/handler identity and data unchanged; identical sidebar pixels; existing list/search/filter/detail/copy/contact/routes/download/backup behavior; genuine map switch and legend; stats and missing BOB indication; 1366/1024/768/390/320 responsive; presentation scope removed on other screens. API fixtures; no real login or writes.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
