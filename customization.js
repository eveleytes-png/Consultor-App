/* Shared portfolio presentation. Source column IDs stay stable even with blank headers. */
const portfolioHeaders=window.CONSULTOR_DEMO_DATA?.headers||[];
function columnLetter(i){let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;}
const portfolioColumns=portfolioHeaders.map((label,i)=>({key:'c'+i,index:i,label:label||'Columna '+columnLetter(i),letter:columnLetter(i)}));
window.setPortfolioHeaders=function(headers){portfolioHeaders.splice(0,portfolioHeaders.length,...headers);portfolioColumns.splice(0,portfolioColumns.length,...headers.map((label,i)=>({key:'c'+i,index:i,label:label||'Columna '+columnLetter(i),letter:columnLetter(i)})));};
const legacyColumn={n:1,e:0,z:2,s:3,latlog:4,whatsapp:6,id:15,nombre:16,apellido:17,telefono1:19,survey:35,d:36,accept:49,blindaje:55};
let consultantSettings={};
window.getConsultorSettings=()=>consultantSettings;
function columnValue(s,key){const i=Number(key.slice(1));if(s.sourceValues)return String(s.sourceValues[i]??'');const alias=Object.keys(legacyColumn).find(k=>legacyColumn[k]===i);return String(s[alias]??'');}
function visibleDetailColumns(){return consultantSettings.detailColumns??portfolioColumns.map(c=>c.key);}
function visibleActionColumns(){return consultantSettings.actionColumns??['c1','c3','c16','c19','c22','c61'];}
window.restoreConsultorSettings=function(settings){consultantSettings=settings||{};cardPreferences=consultantSettings.card||{title:'c1',additional:'c36'};};
cardTitle=s=>columnValue(s,cardPreferences.title?.startsWith('c')?cardPreferences.title:'c'+(legacyColumn[cardPreferences.title]??1))||s.n||'Sin nombre';
function cardExtraColumns(){return Array.isArray(cardPreferences.additionalColumns)?cardPreferences.additionalColumns:(cardPreferences.additional?[cardPreferences.additional.startsWith('c')?cardPreferences.additional:'c'+(legacyColumn[cardPreferences.additional]??36)]:[]);}
cardAdditional=s=>cardExtraColumns().map(key=>columnValue(s,key)).filter(value=>value.trim()).join(' · ');
function extraError(d,message){let p=d.querySelector('[data-extra-error]');if(!p){p=document.createElement('p');p.dataset.extraError='';p.className='form-error';p.setAttribute('role','alert');d.append(p);}p.textContent=message;}
async function saveExtra(d,change,success){const controls=[...d.querySelectorAll('button,input,textarea,select')];const previous=controls.map(e=>e.disabled);controls.forEach(e=>e.disabled=true);try{await window.saveConsultorExtra(change);success?.();showOpNotice('Cambios guardados.');}catch(error){extraError(d,error.message);}finally{controls.forEach((e,i)=>e.disabled=previous[i]);}}
function columnOptions(value,empty=false){return (empty?'<option value="">Sin texto adicional</option>':'')+portfolioColumns.map(c=>`<option value="${c.key}" ${value===c.key?'selected':''}>${opEscape(c.label)} · ${c.letter}</option>`).join('');}
function chooseColumns(kind,onSaved){let chosen=[...(kind==='detailColumns'?visibleDetailColumns():visibleActionColumns())];const d=opDialog('Elegir y ordenar columnas','',true);d.dataset.extraForm='';const body=document.createElement('div');d.append(body);function paint(){const scroll=body.querySelector('.column-choice-list')?.scrollTop||0;const focused=document.activeElement?.dataset.column;const order=[...chosen,...portfolioColumns.map(c=>c.key).filter(k=>!chosen.includes(k))];body.innerHTML=`<p class="muted">Marcá las columnas que querés mostrar. Mantené apretada una columna o arrastrá el asa para cambiar su orden.${kind==='detailColumns'?' Se aplica a todas las fichas; los campos vacíos muestran «Sin información aún».':' Acción comercial, Mail e ID siempre se muestran.'}</p><div class="column-choice-list">${order.map(key=>{const c=portfolioColumns.find(c=>c.key===key);if(!c)return '';const pos=chosen.indexOf(key);return `<div class="column-choice"><label><input type="checkbox" class="live-check" data-column="${key}" ${pos>=0?'checked':''}>${opEscape(c.label)} <small>${c.letter}</small></label></div>`;}).join('')}</div><p class="form-error" data-extra-error role="alert"></p><div class="form-footer"><button class="secondary" data-modal-close>Cancelar</button><button class="primary" data-save-columns>Aplicar</button></div>`;body.querySelector('.column-choice-list').scrollTop=scroll;if(focused)body.querySelector(`[data-column="${focused}"]`)?.focus({preventScroll:true});if(window.enableColumnDrag)window.enableColumnDrag(body,chosen,paint); }
paint();body.onchange=e=>{const key=e.target.dataset.column;if(!key)return;if(e.target.checked)chosen.push(key);else chosen=chosen.filter(k=>k!==key);paint();};body.onclick=e=>{if(e.target.closest('[data-save-columns]'))saveExtra(d,{kind,columns:chosen},()=>{d.close();onSaved?.();});};}
columnDialog=()=>chooseColumns('actionColumns');
function actionTableColumns(){return [['action','Acción comercial'],['c0','Mail'],['c15','ID'],['c1','Nombre comercio'],['c2','Zona'],['c3','Subzona']].map(([key,label])=>({key,label}));}
function assignmentCell(a,c){if(c.key==='action')return a.action;const s=sellers.find(s=>opNorm(s.e)===opNorm(a.email));return s?columnValue(s,c.key):c.key==='c0'?a.email:c.key==='c1'?a.commerce:'';}
renderActionResults=function(){const root=document.querySelector('#action-results');if(!root)return;const rows=filteredAssignments(),cols=actionTableColumns();root.innerHTML=`${actionSelection.size?`<div class="selection"><span>${actionSelection.size} asignaciones seleccionadas</span>${deleteControl('Eliminar','data-op="delete-assignments"')}</div>`:''}<p class="count">${rows.length} asignaciones</p>${rows.length?`<div class="table-wrap card"><table><thead><tr><th><input type="checkbox" class="live-check" data-assignment-all aria-label="Seleccionar todas las asignaciones filtradas" ${rows.every(a=>actionSelection.has(a.id))?'checked':''}></th>${cols.map(c=>`<th>${opEscape(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(a=>`<tr><td>${opCheckbox(a.id,actionSelection.has(a.id),'Seleccionar '+a.commerce+' '+a.action,'assignment')}</td>${cols.map(c=>`<td>${c.key==='action'?actionPill(opEscape(a.action),a.color,a.actionId):opEscape(assignmentCell(a,c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="mobile-cards">${rows.map(a=>`<article class="card assignment"><div class="assignment-top">${actionPill(opEscape(a.action),a.color)}${opCheckbox(a.id,actionSelection.has(a.id),'Seleccionar '+a.commerce,'assignment')}</div><div class="detail-grid">${cols.slice(1).map(c=>`<div><small>${opEscape(c.label)}</small>${opEscape(assignmentCell(a,c))}</div>`).join('')}</div></article>`).join('')}</div>`:empty('No hay asignaciones para mostrar','Probá otra búsqueda o agregá una acción comercial.')}`;};
exportActions=function(){const cols=actionTableColumns(),safe=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';const csv='\ufeff'+[cols.map(c=>c.label),...filteredAssignments().map(a=>cols.map(c=>assignmentCell(a,c)))].map(r=>r.map(safe).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='AccionesComerciales.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
sellerDetail=function(s){
 if(!s)return;const d=opDialog(cardTitle(s),'',true);d.classList.add('seller-detail-dialog','configured-detail');const id=s.id;
 function paint(){
  s=sellers.find(s=>s.id===id);if(!s){d.close();if(page==='sellers')renderSellerResults();return;}
  const heading=d.querySelector('.section-head');heading.classList.add('detail-fixed-heading');heading.querySelector(':scope > h2')?.remove();heading.querySelector('[data-fixed-info]')?.remove();
  heading.insertAdjacentHTML('beforeend',`<div data-fixed-info>${liveSellerCard(s)}</div>`);
  const summary=heading.querySelector('[data-fixed-info] .live-seller');summary.classList.remove('card');summary.classList.add('detail-summary-card');
  summary.querySelectorAll('[data-op="seller-detail"]').forEach(el=>{el.removeAttribute('data-op');el.removeAttribute('role');el.removeAttribute('tabindex');el.removeAttribute('aria-label');});summary.removeAttribute('data-op');
  const fast=window.consultorFastSellerDetail(s,portfolioHeaders);
  summary.querySelector('.survey-buttons').insertAdjacentHTML('beforeend',fast.url?`<a class="mini" data-fast-detail ${window.ConsultorMercadoPago.attributes(fast.url)}>Detalle en fast</a>`:`<button type="button" class="mini" data-fast-detail disabled title="Cust ID no disponible" aria-label="Detalle en fast: Cust ID no disponible">Detalle en fast</button><small class="muted">Cust ID no disponible</small>`);
  const footer=summary.querySelector('.survey-buttons');footer.classList.add('seller-detail-footer');
  const contacts=summary.querySelector('.seller-actions');if(contacts)summary.append(contacts);
  summary.querySelector('.seller-contact-row')?.remove();
  const title=summary.querySelector('.seller-name-actions > strong');title.setAttribute('role','heading');title.setAttribute('aria-level','2');
  const edit=document.createElement('button');edit.type='button';edit.className='seller-detail-edit';edit.textContent='Editar ficha';edit.onclick=()=>editSellerData(s,paint);footer.append(edit);
  d.querySelector('.seller-detail-footer')?.remove();
  d.querySelector('[data-detail-body]')?.remove();d.insertAdjacentHTML('beforeend',`<div data-detail-body><div class="detail-grid">${visibleDetailColumns().map(key=>{const c=portfolioColumns.find(c=>c.key===key),v=columnValue(s,key);return c?`<div class="seller-field"><small>${opEscape(c.label)}</small><span${v.trim()?'':' class="muted"'}>${v.trim()?opEscape(v):'Sin información aún'}</span></div>`:'';}).join('')}</div><div class="detail-tools"><button type="button" class="detail-personalize" data-choose-detail>${icon('filter')}<strong>Personalizar datos visibles</strong><span>Ordená y elegí qué información mostrar</span></button></div></div>`);d.append(footer);d.querySelector('[data-choose-detail]').onclick=()=>chooseColumns('detailColumns',paint);
 }
 d.refreshSellerDetails=paint;paint();
};
function editableSellerColumns(){return portfolioColumns.filter(c=>c.index>=0&&c.index<=14&&String(portfolioHeaders[c.index]??'').trim());}
function editSellerData(s,after){
 const cols=editableSellerColumns(),d=opDialog('Editar datos del comercio',`<form data-extra-form class="seller-data-form"><div class="seller-edit-fields">${cols.map(c=>`<label>${opEscape(c.label)}<textarea class="input" data-seller-column="${c.index}" autocomplete="off" rows="2" maxlength="10000" disabled>${opEscape(columnValue(s,c.key))}</textarea></label>`).join('')}</div><p class="form-error" data-extra-error role="alert"></p><div class="form-footer"><button type="button" class="secondary" data-modal-close>Cancelar</button><button type="submit" class="primary" data-save-seller disabled>Guardar cambios</button></div></form>`,true);
 const f=d.querySelector('form'),inputs=[...f.querySelectorAll('[data-seller-column]')],button=f.querySelector('[data-save-seller]'),expected=new Map();let ready=false;
 (async()=>{try{const originals=await Promise.all(cols.map(async c=>[c.index,window.CONSULTOR_GOOGLE_CONFIG?.enabled&&window.readConsultorSellerCell?await window.readConsultorSellerCell(String(s.id),c.index):{value:columnValue(s,c.key),header:portfolioHeaders[c.index]}]));if(!d.isConnected)return;originals.forEach(([index,data])=>expected.set(index,{value:String(data.value??''),header:String(data.header??portfolioHeaders[index]??'')}));inputs.forEach(el=>{el.value=expected.get(Number(el.dataset.sellerColumn)).value;el.disabled=false;});ready=true;button.disabled=!cols.length;}catch(error){extraError(d,error.message);}})();
 f.onsubmit=async e=>{
  e.preventDefault();if(!ready)return;
  const changes=inputs.map(el=>({column:Number(el.dataset.sellerColumn),value:el.value,expected:expected.get(Number(el.dataset.sellerColumn))})).filter(c=>c.value!==c.expected.value).sort((a,b)=>(a.column===0)-(b.column===0));
  const location=changes.find(c=>c.column===4);if(location?.value.trim()&&!parseLatLog(location.value.trim())){extraError(d,'Ingresá latitud y longitud separadas por una coma.');return;}
  if(!changes.length){d.close();return;}inputs.forEach(el=>el.disabled=true);button.disabled=true;let saved=0;
  try{for(const c of changes){await window.saveConsultorExtra({kind:'sellerField',sellerId:String(s.id),column:c.column,value:c.value,expected:c.expected.value,header:c.expected.header});expected.set(c.column,{...c.expected,value:c.value});saved++;}d.close();after?.();showOpNotice('Cambios guardados.');}
  catch(error){extraError(d,(saved?`Se guardaron ${saved} campos. Los restantes siguen pendientes. `:'')+error.message);}
  finally{inputs.forEach(el=>el.disabled=false);button.disabled=false;}
 };
}
window.refreshOpenSellerDetails=()=>document.querySelectorAll('dialog[open].configured-detail').forEach(d=>d.refreshSellerDetails?.());
function editSellerField(s,index,after){const d=opDialog('Editar dato del comercio',`<form data-extra-form><label>Dato<select class="input" name="column">${portfolioColumns.filter(c=>c.index>=0&&c.index<=14).map(c=>`<option value="${c.index}" ${c.index===(index??1)?'selected':''}>${opEscape(c.label)} · ${c.letter}</option>`).join('')}</select></label><label>Valor<textarea class="input" name="value" rows="3" maxlength="10000">${opEscape(columnValue(s,'c'+(index??1)))}</textarea></label><p class="form-error" data-extra-error role="alert"></p><div class="form-footer"><button type="button" class="secondary" data-modal-close>Cancelar</button><button class="primary">Aplicar</button></div></form>`);const originalValues=[...(s.sourceValues||[])];const f=d.querySelector('form');let expected=String(originalValues[index??1]??columnValue(s,'c'+(index??1))),loadVersion=0,expectedHeader=String(portfolioHeaders[index??1]??'');async function loadCell(){const col=Number(f.elements.column.value),version=++loadVersion,submit=f.querySelector('button.primary');submit.disabled=true;f.elements.value.disabled=true;try{const data=window.CONSULTOR_GOOGLE_CONFIG?.enabled&&window.readConsultorSellerCell?await window.readConsultorSellerCell(String(s.id),col):{value:String(originalValues[col]??columnValue(s,'c'+col))};if(version!==loadVersion||!d.isConnected)return;expected=data.value;expectedHeader=String(data.header??portfolioHeaders[col]??'');f.elements.value.value=expected;f.elements.value.disabled=false;submit.disabled=false;extraError(d,'');}catch(error){if(version===loadVersion)extraError(d,error.message);}}f.elements.column.onchange=loadCell;loadCell();f.onsubmit=e=>{e.preventDefault();const col=Number(f.elements.column.value),value=f.elements.value.value.trim();if(col===4&&value&&!parseLatLog(value)){extraError(d,'Ingresá latitud y longitud separadas por una coma.');return;}saveExtra(d,{kind:'sellerField',sellerId:s.id,column:col,value,expected,header:expectedHeader},()=>{d.close();after();});};}
profileConfiguration=function(){
 const main=document.querySelector('main');main.innerHTML='';main.classList.add('settings-page');
 const selected=cardExtraColumns();
 const columns=portfolioColumns.filter(c=>String(portfolioHeaders[c.index]??'').trim());
 const primaryLabels=['mail','telefono oficial','localidad','zona','comentarios','cust_id comercio'];
 const primary=columns.filter(c=>primaryLabels.includes(normalizeAnswer(c.label))||selected.includes(c.key)).sort((a,b)=>{const rank=c=>{const i=primaryLabels.indexOf(normalizeAnswer(c.label));return i<0?primaryLabels.length:i;};return rank(a)-rank(b);});
 const others=columns.filter(c=>!primary.includes(c));
 const option=c=>`<label><input type="checkbox" name="additionalColumns" value="${c.key}" ${selected.includes(c.key)?'checked':''}><span>${opEscape(c.label)}</span><i aria-hidden="true">✓</i></label>`;
 const section=document.createElement('section');section.className='settings-section';section.id='card-settings';
 section.innerHTML=`<div class="settings-section-heading"><span class="eyebrow">VISUALIZACIÓN</span><h2>Datos de las fichas</h2><p>Definí qué información aparece en cada ficha de comercio y en qué nivel de importancia.</p></div><div class="settings-card-grid"><article class="settings-panel"><h3>Contenido de la ficha <span class="settings-step">1</span></h3><p>Elegí un texto destacado y los datos adicionales que querés consultar.</p><form data-card data-extra-form><label class="settings-label">Texto destacado<select name="title" class="input">${columnOptions(cardPreferences.title)}</select></label><fieldset class="settings-extras"><legend>Texto adicional</legend><div class="settings-checkbox-grid">${primary.map(option).join('')}</div>${others.length?`<details class="settings-more-columns"><summary>Más datos disponibles</summary><div class="settings-checkbox-grid">${others.map(option).join('')}</div></details>`:''}</fieldset><p class="form-error" data-extra-error role="alert"></p><button class="primary" type="submit">Guardar preferencias</button></form></article><article class="settings-panel settings-preview-panel"><h3>Vista previa <span class="settings-example">Ejemplo</span></h3><p>Así se verá una ficha en tu cartera.</p><div class="settings-preview-stage" data-card-preview></div><div class="settings-preview-key"><strong>Texto destacado</strong><span>Texto adicional</span></div></article></div>`;
 main.append(section);const form=section.querySelector('form');
 const preview=()=>{const title=columns.find(c=>c.key===form.elements.title.value)?.label||'Texto destacado';const extra=[...form.querySelectorAll('[name="additionalColumns"]:checked')].map(el=>columns.find(c=>c.key===el.value)?.label).filter(Boolean);section.querySelector('[data-card-preview]').innerHTML=`<div class="settings-example-card"><strong>${opEscape(title)}</strong><div class="settings-preview-icons" aria-hidden="true">${icon('chat')}${icon('phone')}<span>@</span></div><small>ejemplo@gmail.com</small><p>${extra.length?extra.map(opEscape).join(' · '):'Sin texto adicional'}</p><div class="settings-preview-buttons" aria-hidden="true"><i></i><i></i></div></div>`;};
 form.addEventListener('change',preview);preview();
 form.onsubmit=e=>{e.preventDefault();saveExtra(form,{kind:'card',title:form.elements.title.value,additionalColumns:[...form.querySelectorAll('[name="additionalColumns"]:checked')].map(el=>el.value)});};
};
let geographicMap=null,mapLibraryPromise=null,mapBaseLayer="Mapa",mapViewport=null;
const expandedMapSellers=new Set();
// Use the whole filtered business zone, never just the closest screen-space points.
function sellerMapZone(s,rows){
 const normalize=v=>String(v??'').trim().toLocaleLowerCase('es-AR'),zone=normalize(s.z),subzone=normalize(s.s);
 if(zone||subzone)return rows.filter(other=>(!zone||normalize(other.z)===zone)&&(!subzone||normalize(other.s)===subzone));
 const origin=parseLatLog(s.latlog),radians=n=>n*Math.PI/180;
 return rows.filter(other=>{const point=parseLatLog(other.latlog),lat=radians(point[0]-origin[0]),lng=radians(point[1]-origin[1]);const a=Math.sin(lat/2)**2+Math.cos(radians(origin[0]))*Math.cos(radians(point[0]))*Math.sin(lng/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)))<=1.5;});
}
function sellerMapCriteria(){return JSON.stringify([sellerSearch,Object.entries(sellerFilters).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,value instanceof Set?[...value].sort():value])]);}
function resetMapViewport(){mapViewport=null;expandedMapSellers.clear();}
window.addEventListener('popstate',resetMapViewport);
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(a){const url=new URL(a.href,location.href);if(url.origin===location.origin&&url.pathname===location.pathname&&a.target!=='_blank')resetMapViewport();}},true);
function mapLibrary(){
 if(window.L?.maplibreGL)return Promise.resolve(window.L);
 if(mapLibraryPromise)return mapLibraryPromise;
 mapLibraryPromise=(async()=>{
  const css=(href,integrity)=>{if(document.querySelector(`link[href="${href}"]`))return;const node=document.createElement('link');node.rel='stylesheet';node.href=href;if(integrity){node.integrity=integrity;node.crossOrigin='';}document.head.append(node);};
  const script=(src,integrity)=>new Promise((resolve,reject)=>{const node=document.createElement('script');node.src=src;if(integrity){node.integrity=integrity;node.crossOrigin='';}node.onload=resolve;node.onerror=()=>{node.remove();reject(Error('No se pudo cargar el mapa. Revisá tu conexión e intentá nuevamente.'));};document.head.append(node);});
  if(!window.L){css('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=');await script('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js','sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=');}
  css('https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css');
  if(!window.maplibregl)await script('https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js');
  if(!window.L.maplibreGL)await script('https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js');
  return window.L;
 })().catch(error=>{mapLibraryPromise=null;throw error;});
 return mapLibraryPromise;
}
const renderSellerList=renderSellerResults;
renderSellerResults=function(){geographicMap?.remove();geographicMap=null;if(sellerView!=='map'){resetMapViewport();renderSellerList();return;}const root=document.querySelector('#seller-results');if(!root)return;const criteria=sellerMapCriteria();if(mapViewport&&mapViewport.criteria!==criteria)resetMapViewport();const rows=filteredSellers(),located=rows.filter(s=>parseLatLog(s.latlog)),missing=rows.filter(s=>!parseLatLog(s.latlog));const filter=document.querySelector('[data-op="seller-filters"]');if(filter)filter.innerHTML=icon('filter')+'Filtros'+(filterCount()?' ('+filterCount()+')':'');root.innerHTML=`<div class="map-results-summary"><span><strong>${rows.length}</strong> comercios<span class="map-summary-found"> encontrados</span></span><span>Con ubicación: <strong>${located.length}</strong></span><button type="button" class="map-unlocated" data-map-unlocated aria-haspopup="dialog">Sin ubicación: <strong>${missing.length}</strong></button></div><div class="legend"><span style="--dot:#292932">Sin aceptación</span><span style="--dot:#288450">Encuesta válida</span><span style="--dot:#cf5058">Sin encuesta válida</span><span style="--dot:#8c8c9c">Sin dato</span></div><div class="geographic-wrapper"><div class="geographic-map" aria-label="Mapa de comercios"></div><div class="map-selected-card"></div><p class="map-load-status" role="status">${located.length?'Cargando mapa…':'No hay comercios con ubicación válida.'}</p></div>`;const host=root.querySelector('.geographic-map'),status=root.querySelector('.map-load-status'),card=root.querySelector('.map-selected-card');root.querySelector('[data-map-unlocated]').onclick=()=>window.showUnlocatedSellers?.(missing);
mapLibrary().then(L=>{
 if(!host.isConnected)return;
 const map=geographicMap=L.map(host,{scrollWheelZoom:true,dragging:true,touchZoom:true,zoomControl:false,minZoom:1,maxZoom:19});
 map.attributionControl?.setPosition('bottomleft');
 const layers={
  'Mapa':L.maplibreGL({style:'https://api.maptiler.com/maps/streets-v4/style.json?key='+encodeURIComponent(mapTilerKey),interactive:false}),
  'Satélite':L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'})
 };
 for(const layer of Object.values(layers))layer.on('tileerror',()=>{if(map.hasLayer(layer)){status.hidden=false;status.textContent='No se pudo cargar parte del mapa. Podés cambiar de vista o volver a intentar.';}});
 layers[mapBaseLayer].addTo(map);
 const watchVectorErrors=()=>layers.Mapa.getMaplibreMap?.()?.on('error',()=>{if(map.hasLayer(layers.Mapa)){status.hidden=false;status.textContent='No se pudo cargar parte del mapa. Revisá la conexión o probá la vista Satélite.';}});if(mapBaseLayer==='Mapa')watchVectorErrors();
 L.control.layers(layers,null,{collapsed:false,position:'topright'}).addTo(map);
 map.on('baselayerchange',e=>{mapBaseLayer=e.name;status.hidden=true;if(e.name==='Mapa')watchVectorErrors();});
 status.hidden=true;
 L.control.zoom({position:'bottomright'}).addTo(map);
 const locate=L.control({position:'bottomright'});locate.onAdd=()=>{const box=L.DomUtil.create('div','leaflet-bar device-center-control');const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','Centrar en mi ubicación');button.title='Centrar en mi ubicación';button.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3" stroke="currentColor" stroke-width="2"/></svg>';button.onclick=()=>window.centerDeviceOnMap?.();box.append(button);L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);return box;};locate.addTo(map);
 map.on('moveend zoomend',()=>{mapViewport={center:map.getCenter(),zoom:map.getZoom(),criteria};});
 function closeSellerCard(){mapSelected=null;card.replaceChildren();}
 function paintSellerCard(s){
  card.innerHTML=liveSellerCard(s);
  const close=document.createElement('button');close.type='button';close.className='map-card-close';close.setAttribute('aria-label','Cerrar ficha del comercio');close.textContent='×';
  close.onclick=e=>{e.stopPropagation();closeSellerCard();};card.querySelector('.seller').append(close);
 }
 // Leaflet converts mouse clicks and touch taps into this event. Controls and markers are excluded.
 map.on('click',e=>{if(e.originalEvent?.target?.closest?.('.leaflet-marker-icon,.leaflet-control,.leaflet-popup'))return;closeSellerCard();});
 function selectSeller(s){map.closePopup();mapSelected=s.id;paintSellerCard(s);}
 for(const s of located){
  const marker=L.marker(parseLatLog(s.latlog),{title:s.n,alt:'Ubicación de '+s.n,icon:L.divIcon({className:'seller-map-marker',html:`<span style="background:${sellerColor(s)}"></span>`,iconSize:[20,20],iconAnchor:[10,10]})}).addTo(map);
  marker.on('click',e=>{
   const center=map.latLngToContainerPoint(marker.getLatLng());
   const nearby=located.filter(other=>map.latLngToContainerPoint(parseLatLog(other.latlog)).distanceTo(center)<24);
   if(nearby.length>1&&!expandedMapSellers.has(s.id)){const zone=sellerMapZone(s,located);zone.forEach(seller=>expandedMapSellers.add(seller.id));closeSellerCard();map.fitBounds(zone.map(seller=>parseLatLog(seller.latlog)),{paddingTopLeft:[48,48],paddingBottomRight:[64,80],maxZoom:15});return;}
   // Identical coordinates cannot separate with zoom. Repeated taps cycle those sellers.
   const point=parseLatLog(s.latlog),coincident=located.filter(other=>{const p=parseLatLog(other.latlog);return Math.abs(p[0]-point[0])<1e-7&&Math.abs(p[1]-point[1])<1e-7;});
   const previous=coincident.findIndex(other=>other.id===mapSelected);
   selectSeller(coincident.length>1?coincident[(previous+1)%coincident.length]:s);
  });
 }
 const selected=located.find(s=>s.id===mapSelected);if(selected)paintSellerCard(selected);
 if(mapViewport)map.setView(mapViewport.center,mapViewport.zoom);else if(located.length)map.fitBounds(located.map(s=>parseLatLog(s.latlog)),{padding:[35,60],maxZoom:15});else map.setView([-27.37,-55.9],12);window.restoreDeviceMarker?.(map);
}).catch(e=>{if(host.isConnected)status.textContent=e.message;});};
