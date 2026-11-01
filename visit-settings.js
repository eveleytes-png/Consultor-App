/* Per-consultant settings; only marker backgrounds and the map legend change. */
(()=>{
 const helpers=window.ConsultorVisitVisualization,originalColor=sellerColor,originalConfiguration=profileConfiguration;
 let settings=helpers.defaults(),revision=0,loading=true,working=false,loadError='',section=null,loadGeneration=0;
 const escape=opEscape;
 sellerColor=function(s){return settings.mode==='manual'?helpers.manualColor(s,settings,portfolioHeaders):originalColor(s);};
 async function request(method,data={}){
  const response=await fetch('/api/state',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'visitVisualization',method,...data}),signal:AbortSignal.timeout(20000)});
  const value=await response.json();if(!response.ok)throw Error(value.error||'No se pudo guardar la visualización de visitas.');return value;
 }
 const legend=manual=>(manual?[['green','Vigente'],['red','Vencida'],['gray','Sin fecha válida'],['black','Sin aceptación']]:[['green','Con aceptación y encuesta válida'],['red','Con aceptación y encuesta no válida'],['black','Sin aceptación'],['gray','Sin información de encuesta válida']]).map(([tone,label])=>`<span style="--dot:${helpers.colors[tone]}">${label}</span>`).join('');
 function refreshLegend(){
  const node=document.querySelector('#seller-results .legend');if(!node)return;
  if(settings.mode==='manual'){
   if(node.dataset.visitOriginal===undefined)node.dataset.visitOriginal=node.innerHTML;
   const html=legend(true);if(node.innerHTML!==html)node.innerHTML=html;
  }else if(node.dataset.visitOriginal!==undefined){node.innerHTML=node.dataset.visitOriginal;delete node.dataset.visitOriginal;}
 }
 function refreshColors(){
  if(typeof geographicMap!=='undefined')geographicMap?.eachLayer(layer=>{
   if(layer.options?.visitSellerId===undefined)return;
   const s=sellers.find(row=>row.id===layer.options.visitSellerId),dot=layer.getElement?.()?.querySelector('span');if(s&&dot)dot.style.background=sellerColor(s);
  });
  document.querySelectorAll('#seller-results [data-op="seller-marker"]').forEach(marker=>{const s=sellers.find(row=>row.id===marker.dataset.id);if(s)marker.style.background=sellerColor(s);});
  refreshLegend();
 }
 async function load(){
  const epoch=++loadGeneration;loading=true;loadError='';paint();
  try{const value=await request('GET');if(epoch!==loadGeneration)return;settings=value.settings;revision=value.revision;refreshColors();}
  catch(error){if(epoch===loadGeneration)loadError=error.message;}
  finally{if(epoch===loadGeneration){loading=false;paint();}}
 }
 function paint(){
  if(!section?.isConnected)return;
  if(loading){section.innerHTML='<h3>Visualización de visitas</h3><p role="status">Consultando tus preferencias…</p>';return;}
  if(loadError){section.innerHTML=`<h3>Visualización de visitas</h3><p role="alert">${escape(loadError)}</p><button type="button" class="secondary" data-visit-retry>Reintentar</button>`;section.querySelector('[data-visit-retry]').onclick=load;return;}
  const columns=helpers.dateColumns(portfolioHeaders,sellers),manual=settings.mode==='manual';
  const mode=(value,title,description)=>`<label class="visit-mode"><input type="radio" name="mode" value="${value}" ${settings.mode===value?'checked':''}><span><strong>${title}</strong><span class="visit-description">${description}</span><span class="legend visit-legend">${legend(value==='manual')}</span></span></label>`;
  const missing=settings.dateColumn&&!columns.some(c=>c.header===settings.dateColumn);
  section.innerHTML=`<h3>Visualización de visitas</h3><p>Definí cómo se asignan los colores de las visitas de tu cartera.</p><form data-visit-form><fieldset class="visit-modes"><legend class="sr-only">Modalidad de visualización de visitas</legend>${mode('default','Predeterminada','El mapa utiliza automáticamente la información de tu cartera para asignar los colores de cada comercio. Se tienen en cuenta la aceptación del asesoramiento y la validez de las encuestas.')}${mode('manual','Manual','Vos decidís qué fecha utilizar como referencia y durante cuántos meses se considera vigente. El mapa cambiará los colores de los comercios según la antigüedad de esa fecha.')}</fieldset><div data-visit-manual ${manual?'':'hidden'}><div class="visit-fields"><label class="settings-label">Columna de fecha<select class="input" name="dateColumn" ${manual?'':'disabled'} required><option value="">Seleccioná una columna de fecha</option>${missing?`<option value="${escape(settings.dateColumn)}" selected disabled>${escape(settings.dateColumn)} (no disponible)</option>`:''}${columns.map(c=>`<option value="${escape(c.header)}" ${settings.dateColumn===c.header?'selected':''}>${escape(c.header)}</option>`).join('')}</select></label><label class="settings-label">Vigencia en meses<input class="input" name="months" type="number" inputmode="numeric" min="1" step="1" required value="${settings.months}" ${manual?'':'disabled'}></label></div>${!columns.length?'<p class="visit-hint">No se encontraron columnas con fechas en la cartera. Para habilitar Manual, la columna debe contener al menos una fecha válida.</p>':''}<div class="legend visit-legend">${legend(true)}</div><p class="visit-explanation">La vigencia se calcula por mes calendario. La fecha se considera vigente hasta el último día del mes que corresponda según la cantidad de meses configurada.<br>Ejemplo: 16/10/2026 + 3 meses = verde hasta el 31/12/2026 inclusive. Desde el 01/01/2027 pasa a rojo.</p></div><p class="form-error" role="alert" data-visit-error></p><button class="primary" type="submit">Guardar configuración</button></form>`;
  const form=section.querySelector('form'),manualFields=form.querySelector('[data-visit-manual]');
  function toggle(){const active=form.elements.mode.value==='manual';manualFields.hidden=!active;form.elements.dateColumn.disabled=!active;form.elements.months.disabled=!active;}
  async function save(){
   if(working)return;
   const draft={mode:form.elements.mode.value,dateColumn:form.elements.dateColumn.value,months:form.elements.mode.value==='manual'?Number(form.elements.months.value):settings.months};
   const error=form.querySelector('[data-visit-error]');error.textContent='';
   try{helpers.validate(draft,columns);}catch(e){error.textContent=e.message;return;}
   if(!form.reportValidity())return;
   ++loadGeneration;working=true;const controls=[...form.querySelectorAll('input,select,button')],disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
   try{const result=await request('PUT',{settings:draft,expectedRevision:revision});settings=result.settings;revision=result.revision;refreshColors();showOpNotice('Cambios guardados.');paint();}
   catch(e){error.textContent=e.message;}
   finally{working=false;controls.forEach((el,i)=>{if(el.isConnected)el.disabled=disabled[i];});}
  }
  form.onchange=()=>{toggle();save();};form.onsubmit=e=>{e.preventDefault();save();};
 }
 profileConfiguration=function(){originalConfiguration();const parent=document.querySelector('#card-settings');if(!parent)return;section=document.createElement('article');section.id='visit-settings';section.className='settings-panel visit-settings';parent.append(section);load();};
 const main=document.querySelector('main');if(main)new MutationObserver(refreshLegend).observe(main,{childList:true,subtree:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!working&&!section?.isConnected)load();});
 setInterval(refreshColors,60000);load();
})();
