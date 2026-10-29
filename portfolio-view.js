/* Presentation only: existing seller nodes, controls, events and data remain intact. */
(()=>{
 const main=document.querySelector('#app>main');
 if(!main)return;
 const actionIcons={
  'data-routes':'<path d="M6 5h10a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h10M6 2v6m-3-3h6m9 9 3 3-3 3"/>',
  'data-excel':icons.download,
  'data-backup-baseapp':'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>'
 };
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
   const rows=filteredSellers(),located=rows.filter(s=>parseLatLog(s.latlog)).length;
   let summary=root.querySelector(':scope>.cartera-stats');
   if(!summary){summary=document.createElement('div');summary.className='cartera-stats';summary.setAttribute('aria-label','Resumen de los comercios filtrados');tools.after(summary);}
   const html=`${[[rows.length,'Comercios'],[located,'Con ubicación'],[rows.length-located,'Sin ubicación']].map(([n,label])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('')}<div class="cartera-stat-unavailable" title="El proyecto actual no tiene implementado un indicador agregado de BOB. Se conserva sin calcular una regla nueva."><strong>—</strong><span>BOB necesarias</span><small>Indicador no disponible</small></div>`;
   if(summary.innerHTML!==html)summary.innerHTML=html;
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
 decorate();decorateFilters();
})();
