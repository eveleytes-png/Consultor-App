/* Quantity parsing and totals are shared by the indicator and its tests. */
(function(root){
 function quantity(value){
  if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:null;
  const text=String(value??'').trim();if(!text)return 0;
  if(!/^\d+(?:[.,]\d+)*$/.test(text))return null;
  let normalized=text;
  if(text.includes(',')){
   if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(text))return null;
   normalized=text.replace(/\./g,'').replace(',','.');
  }else if(/^\d{1,3}(?:\.\d{3})+$/.test(text))normalized=text.replace(/\./g,'');
  else if(!/^\d+(?:\.\d+)?$/.test(text))return null;
  const number=Number(normalized);return Number.isFinite(number)&&number>=0?number:null;
 }
 function columns(headers){return headers.flatMap((header,index)=>typeof header==='string'&&header.trim()&&headers.filter(h=>h===header).length===1?[{header,index}]:[]);}
 function total(rows,headers,column){
  const selected=columns(headers).find(c=>c.header===column);if(!selected)return {total:null,invalid:0};
  let sum=0,invalid=0;
  for(const row of rows){const n=quantity(row.sourceValues?.[selected.index]);if(n===null){invalid++;continue;}sum+=n;if(sum>Number.MAX_SAFE_INTEGER)return {total:null,invalid};}
  return {total:Math.round(sum*1e6)/1e6,invalid};
 }
 root.ConsultorBobbins={quantity,columns,total};if(typeof module!=='undefined'&&module.exports)module.exports=root.ConsultorBobbins;
})(typeof window==='undefined'?globalThis:window);
if(typeof document!=='undefined')(()=>{
 const original=profileConfiguration,helpers=window.ConsultorBobbins;let column='',revision=0,loading=true,error='',section=null,working=false,epoch=0,focusPending=false;
 const notify=()=>document.dispatchEvent(new CustomEvent('consultor-bobbin-settings-change'));
 window.consultorBobbinSummary=rows=>loading?{total:null,info:'Consultando configuración…'}:error?{total:null,info:'No se pudo consultar la configuración'}:!column?{total:null,info:'Seleccioná una columna en Configuración',needsConfiguration:true}:(()=>{const result=helpers.total(rows,portfolioHeaders,column);return {...result,info:result.total===null?'Columna no disponible':result.invalid?`${result.invalid} valores no numéricos omitidos`:''};})();
 async function request(method,extra={}){
  const r=await fetch('/api/state',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'bobbinVisualization',method,...extra}),signal:AbortSignal.timeout(20000)});const value=await r.json();if(!r.ok)throw Error(value.error||'No se pudo guardar la columna de bobinas.');return value;
 }
 async function load(){const token=++epoch;loading=true;error='';paint();notify();try{const value=await request('GET');if(token!==epoch)return;column=value.settings.column;revision=value.revision;}catch(e){if(token===epoch)error=e.message;}finally{if(token===epoch){loading=false;paint();notify();if(focusPending&&section?.isConnected){focusPending=false;requestAnimationFrame(()=>{if(!section?.isConnected)return;section.tabIndex=-1;section.focus({preventScroll:true});section.scrollIntoView({block:'start',behavior:'instant'});});}}}}
 function paint(){
  if(!section?.isConnected)return;
  const description='Seleccioná la columna que contiene la cantidad de bobinas que debés entregar. La app sumará los valores de los comercios incluidos en los filtros aplicados en el mapa y mostrará el resultado en “BOB necesarias”, en Mi cartera.';
  section.innerHTML=`<h3>Visualización cantidad de bobinas</h3><p>${description}</p>`;
  if(loading){section.insertAdjacentHTML('beforeend','<p role="status">Consultando tus preferencias…</p>');return;}
  if(error){section.insertAdjacentHTML('beforeend',`<p role="alert">${opEscape(error)}</p><button class="secondary" type="button" data-bobbin-retry>Reintentar</button>`);section.querySelector('button').onclick=load;return;}
  const columns=helpers.columns(portfolioHeaders),missing=column&&!columns.some(c=>c.header===column);
  section.insertAdjacentHTML('beforeend',`<form data-bobbin-form><label class="settings-label">Columna de cantidad de bobinas<select class="input" name="column"><option value="">Sin configurar</option>${missing?`<option selected disabled value="${opEscape(column)}">${opEscape(column)} (no disponible)</option>`:''}${columns.map(c=>`<option value="${opEscape(c.header)}" ${column===c.header?'selected':''}>${opEscape(c.header)}</option>`).join('')}</select></label><p class="visit-hint">Se suman todos los comercios que cumplen los filtros, aunque no tengan ubicación. Las celdas vacías cuentan como cero; los valores no numéricos se omiten y se indican junto al total.</p><p class="form-error" role="alert"></p><button class="primary" type="submit">Guardar configuración</button></form>`);
  const form=section.querySelector('form');form.onsubmit=async e=>{
   e.preventDefault();if(working)return;working=true;++epoch;const controls=[...form.querySelectorAll('button,select')];controls.forEach(el=>el.disabled=true);
   try{const value=await request('PUT',{settings:{column:form.elements.column.value},expectedRevision:revision});column=value.settings.column;revision=value.revision;notify();paint();showOpNotice('Cambios guardados.');}catch(e){form.querySelector('[role="alert"]').textContent=e.message;}finally{working=false;controls.forEach(el=>{if(el.isConnected)el.disabled=false;});}
  };
 }
 profileConfiguration=function(){original();const parent=document.querySelector('#card-settings');if(!parent)return;section=document.createElement('article');section.id='bobbin-settings';focusPending=location.hash==='#bobbin-settings';section.className='settings-panel visit-settings';const visits=parent.querySelector('#visit-settings');if(visits)visits.before(section);else parent.append(section);load();};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!working&&!section?.isConnected)load();});load();
})();
