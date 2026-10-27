// Full browser -> real local API handlers -> fake Sheets/store. No login or real data writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Evelin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const {createHandler}=await import('../api/sheets.mjs'),{createStateHandler}=await import('../api/state.mjs');
 const env={GOOGLE_SERVICE_ACCOUNT_EMAIL:'fixture',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'fixture',AUTH_ALLOWED_EMAILS:'owner@example.test',SUPABASE_URL:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture'};
 const headers=['Mail','Nombre del comercio','Cust_id comercio','Aceptación','Encuesta valida','Blindaje','LatLog'];
 const portfolio=[headers,['qa@example.test','Café de prueba','1','Si','Si','','-34,-58']];
 const row={revision:7,sellers:[],data:{activities:[{id:'kept',description:'Actividad existente',date:'2026-10-25',time:'09:00'}],links:[],actions:[],assignments:[],equipment:[],settings:{profile:{name:'Consultor de prueba'}}}};
 let reads=0,loginCalls=0;const sheets=createHandler({env,googleRequest:async(c,p,b)=>{reads++;if(p.startsWith('?'))return {properties:{title:'Planilla existente'},sheets:[{properties:{sheetId:192864634,title:'Base Consultor App'}},{properties:{sheetId:500157585,title:'Points_ConsultoresApp'}},{properties:{sheetId:1266882678,title:'Links_ConsultoresApp'}}]};return {valueRanges:b.dataFilters.map(f=>({dataFilters:[f],valueRange:{values:f.gridRange.sheetId===192864634?portfolio:[]}}))};}});
 const state=createStateHandler({env,store:{call:async p=>p.includes('revision,sellers,data')?[structuredClone(row)]:[{revision:row.revision}]}});
 const root=path.resolve('dist');let server;
 server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://local');const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString();req.body=body?JSON.parse(body):undefined;
  res.status=n=>{res.statusCode=n;return res;};res.json=v=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));};
  if(u.pathname==='/api/sheets'){if(req.body?.operation==='login')loginCalls++;return sheets(req,res);}
  if(u.pathname==='/api/state')return state(req,res);
  if(u.pathname==='/api/notifications')return res.json({needsAttention:false,changes:[],jobs:[]});
  if(u.pathname==='/sw.js'){res.statusCode=404;return res.end();}
  const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;env.APP_ORIGIN=origin;
 const browser=await chromium.launch({channel:'chrome',headless:true});try{const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/?pantalla=sellers');await page.waitForFunction(()=>window.SheetsApp?.ready===true);await page.locator('.live-seller').waitFor();assert.equal(await page.locator('.live-seller').count(),1);assert.equal(await page.getByRole('button',{name:'Ingresar con Google',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>activities[0].id),'kept');assert(reads>0);assert.equal(loginCalls,0);
  await page.reload();await page.waitForFunction(()=>window.SheetsApp?.ready===true);await page.locator('.live-seller').waitFor();assert.equal(await page.locator('.live-seller').count(),1);assert.equal(await page.evaluate(()=>activities[0].id),'kept');
  await page.goto(origin+'/?pantalla=usuario');await page.getByRole('button',{name:'Actualizar desde Google',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Ingresar con Google',exact:true}).count(),0);
  assert.equal(loginCalls,0);assert.deepEqual(errors,[]);fs.mkdirSync('qa-evidence',{recursive:true});await page.screenshot({path:'qa-evidence/shared-connection-profile.png',fullPage:true});
  // Actual source shape: only A:G; no merchant ID or survey/status columns yet.
  portfolio.splice(0,portfolio.length,['Mail','Nombre Comercio','Zona','Sub-Zona','LatLong','Comentarios','Teléfono Oficial'],['qa@example.test','Café de prueba','Centro','Norte','-34,-58','','5491112345678'],['second@example.test','Sin ubicación']);
  row.revision++;row.data.actions=[{id:'tag1',name:'Visitar',color:'red'}];row.data.assignments=[{id:'assignment1',actionId:'tag1',action:'Visitar',color:'red',email:'qa@example.test',sellerId:'previous-id'}];
  await page.goto(origin+'/?pantalla=sellers');await page.waitForFunction(()=>window.SheetsApp?.ready===true);await page.locator('.live-seller').first().waitFor();assert.equal(await page.locator('.live-seller').count(),2);
  await page.locator('.source-columns-notice').waitFor();
  const partial=await page.evaluate(()=>({ids:sellers.map(s=>s.id),merchantIds:sellers.map(s=>s.hasMerchantId),links:sellers.map(s=>window.consultorSurveyUrl(s,'register')),merchantLinks:sellers.map(s=>window.consultorMerchantUrl(s)),tags:sellers[0].a.length,stats:computePortfolio(sellers)}));
  assert.equal(new Set(partial.ids).size,2);assert.deepEqual(partial.merchantIds,[false,false]);assert.deepEqual(partial.links,[null,null]);assert.deepEqual(partial.merchantLinks,[null,null]);assert.equal(partial.tags,1);assert.equal(partial.stats.unknown,2);assert.equal(partial.stats.percentage,null);
  await page.reload();await page.waitForFunction(()=>window.SheetsApp?.ready===true);await page.locator('.live-seller').first().waitFor();assert.deepEqual(await page.evaluate(()=>sellers.map(s=>s.id)),partial.ids);
  row.data.assignments[0].sellerId=partial.ids[0];row.revision++;while(portfolio[0].length<15)portfolio[0].push('');portfolio[0][15]='Cust_id comercio';portfolio[1][15]='12345';
  await page.reload();await page.waitForFunction(()=>window.SheetsApp?.ready===true);await page.locator('.live-seller').first().waitFor();assert.equal(await page.evaluate(()=>sellers[0].a.length),1);assert.equal(await page.evaluate(()=>sellers[0].hasMerchantId),true);assert.match(await page.evaluate(()=>window.consultorSurveyUrl(sellers[0],'register')),/12345/);
  portfolio[0][0]='Sin columna de correo';await page.reload();await page.locator('.source-state[role=alert]').waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.match(await page.locator('.source-state[role=alert]').innerText(),/Faltan columnas requeridas en BaseApp: Mail/);assert.equal(await page.evaluate(()=>window.SheetsApp.ready),false);
  assert.deepEqual(errors,[]);
  fs.writeFileSync('qa-evidence/shared-connection.json',JSON.stringify({result:'PASS',reads,loginCalls,retainedActivity:'kept',reload:true,deepLink:true,partialColumns:true,stableInternalIds:true,noInventedMerchantId:true,retainedTag:true,meaningfulMissingMailError:true,errors},null,2));console.log('PASS: shared source without login; full and A:G-only sheets, retained agenda/tags, stable internal identities, no invented merchant links, reload and meaningful schema errors');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});

