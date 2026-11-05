/* Presentation only: existing seller nodes, controls, events and data remain intact. */
(()=>{
 const main=document.querySelector('#app>main');
 if(!main)return;
 const actionIcons={
  'data-routes':'<path d="M6 5h10a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h10M6 2v6m-3-3h6m9 9 3 3-3 3"/>',
  'data-excel':icons.download,
  'data-backup-baseapp':'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>'
 };
 function bobbinHint(result){
  if(!result.info)return '';
  return result.needsConfiguration?'<a class="bobbin-config-link" href="?pantalla=usuario#bobbin-settings">'+escapeHtml(result.info)+'</a>':escapeHtml(result.info);
 }
 function bobbinHTML(rows){
  const result=window.consultorBobbinSummary?.(rows)||{total:null,info:'Consultando configuración…'};
  return '<div class="bobbin-stat'+(result.total===null?' cartera-stat-unavailable':'')+'"><strong>'+  (result.total===null?'—':new Intl.NumberFormat('es-AR',{maximumFractionDigits:6}).format(result.total))+'</strong><span>BOB necesarias</span>'+(result.info?'<small>'+bobbinHint(result)+'</small>':'')+'</div>';
 }
 function decorate(){
  const active=page==='sellers';
  main.classList.toggle('cartera-view',active);
  if(!active)return;
  const root=main.querySelector('#seller-results');
  if(!root)return;
  const toolbar=main.querySelector(':scope>.toolbar');
  toolbar?.classList.add('cartera-toolbar');
  const tools=root.querySelector('.portfolio-tools');
  if(tools){
   for(const [attribute,paths] of Object.entries(actionIcons)){
    const button=tools.querySelector(`[${attribute}]`);
    if(button&&!button.querySelector('.cartera-action-icon'))button.insertAdjacentHTML('afterbegin',`<svg class="cartera-action-icon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`);
   }
   // These use precisely the existing filtering and coordinate-validation functions.
   const rows=filteredSellers(),located=rows.filter(s=>sellerCoordinates(s)).length;
   let summary=root.querySelector(':scope>.cartera-stats');
   if(!summary){summary=document.createElement('div');summary.className='cartera-stats';summary.setAttribute('aria-label','Resumen de los comercios filtrados');tools.after(summary);}
   const html=`${[[rows.length,'Comercios'],[located,'Con ubicación'],[rows.length-located,'Sin ubicación']].map(([n,label])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('')}${bobbinHTML(rows)}`;
   if(summary.innerHTML!==html)summary.innerHTML=html;
   const mapSummary=root.querySelector('.map-results-summary');
   if(mapSummary){
    let bobbins=mapSummary.querySelector('[data-bobbin-map-summary]');if(!bobbins){bobbins=document.createElement('span');bobbins.dataset.bobbinMapSummary='';mapSummary.append(bobbins);}
    const result=window.consultorBobbinSummary?.(rows)||{total:null,info:'Consultando configuración…'};
    const content='BOB necesarias: <strong>'+(result.total===null?'—':new Intl.NumberFormat('es-AR',{maximumFractionDigits:6}).format(result.total))+'</strong>'+(result.info?' <small>'+bobbinHint(result)+'</small>':'');
    if(bobbins.innerHTML!==content)bobbins.innerHTML=content;
   }
  }
  for(const card of root.querySelectorAll('.live-seller')){
   const seller=sellers.find(s=>String(s.id)===String(card.dataset.id));
   if(!seller)continue;
   if(!card.querySelector('.cartera-meta')){
    const commentIndex=portfolioHeaders.findIndex(h=>normalizeAnswer(h)==='comentarios');
    const comment=commentIndex>=0?String(seller.sourceValues?.[commentIndex]??'').trim():'';
    const values=[seller.z,seller.s,comment].filter(v=>String(v??'').trim());
    if(values.length){const meta=document.createElement('div');meta.className='cartera-meta';for(const value of values){const span=document.createElement('span');span.textContent=value;meta.append(span);}card.append(meta);}
   }
  }
 }
 // Only add a visual scope to the existing filter dialog; handlers and fields stay untouched.
 function decorateFilters(){if(page!=='sellers')return;document.querySelectorAll('dialog.bottom-sheet').forEach(d=>{if(d.querySelector('.filter-content input[name="accept"]'))d.classList.add('cartera-filters');});}
 new MutationObserver(decorate).observe(main,{childList:true,subtree:true});
 new MutationObserver(decorateFilters).observe(document.body,{childList:true});
 document.addEventListener('consultor-bobbin-settings-change',decorate);
 decorate();decorateFilters();
})();
