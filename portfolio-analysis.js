/* Read-only analysis of the same original cells used by the seller detail. */
function portfolioTransaction(value){
  const v=normalizeAnswer(value);
  const ranges={'menor a 30%':0,'menor a 70%':0,'entre 70% y 90%':1,'entre 90% y 110%':2,'entre 110% y 130%':2,'mayor a 130%':3};
  if(Object.hasOwn(ranges,v))return ranges[v];
  // Sheets returns formatted percentages. Bare numbers have no verified unit.
  if(!/^-?\d+(?:[.,]\d+)?\s*%$/.test(v))return null;
  const n=Number(v.replace('%','').replace(',','.'));
  return n<70?0:n<90?1:n<=130?2:3;
}
function portfolioCategory(value){
  const v=normalizeAnswer(value),special=['menor a 0','abandono','abandono a categoria 0'];
  const i=special.indexOf(v);if(i>=0)return {key:v,label:['Menor a 0','Abandono','Abandono a categoría 0'][i],order:i};
  const match=/^c-?(\d+)$/.exec(v);if(!match)return null;
  const n=Number(match[1]);if(!Number.isSafeInteger(n))return null;
  if(n===0)return {key:'c0',label:'C0 (valor de origen)',order:3};
  const start=Math.floor((n-1)/5)*5+1;
  return {key:'c'+start,label:`C${start}–C${start+4}`,order:4+start};
}
function computePortfolioAnalysis(rows,headers){
  const merchants=rows.filter(row=>String(row.Mail??row.e??'').trim());
  return {total:merchants.length,products:['Point','QR'].map(product=>{
    const column=name=>{const indices=headers.map((h,i)=>normalizeAnswer(h)===normalizeAnswer(name)?i:-1).filter(i=>i>=0);return indices.length===1?indices[0]:-1;};
    const ti=column('Transaccionabilidad proyectada '+product),ci=column('Categoria proyectada '+product);
    const transactions=[0,0,0,0],categories=new Map(),unknownTransactions=new Map(),unknownCategories=new Map();
    const opportunities=[0,0],base=product==='Point'?'no pointer':'no qr';let valid=0,categoryValid=0;
    const add=(map,v)=>map.set(v,(map.get(v)||0)+1);
    for(const row of merchants){
      const t=String(row.sourceValues?.[ti]??'').trim(),c=String(row.sourceValues?.[ci]??'').trim();
      const states=new Set([normalizeAnswer(t),normalizeAnswer(c)]);
      // Count each explicit state once per merchant, even when repeated across cells.
      [base,base+' referible'].forEach((label,i)=>{if(states.has(label))opportunities[i]++;});
      const bucket=portfolioTransaction(t);if(bucket===null)add(unknownTransactions,t||'Sin dato');else{transactions[bucket]++;valid++;}
      const category=portfolioCategory(c);if(category){if(!categories.has(category.key))categories.set(category.key,{...category,count:0});categories.get(category.key).count++;categoryValid++;}
      else add(unknownCategories,c||'Sin dato');
    }
    return {product,transactions,valid,categories:[...categories.values()].sort((a,b)=>a.order-b.order),categoryValid,opportunities,unknownTransactions:[...unknownTransactions],unknownCategories:[...unknownCategories],missingColumns:[ti<0?'Transaccionabilidad':null,ci<0?'Categoría':null].filter(Boolean)};
  })};
}
function portfolioAnalysisSection(){
  const headers=typeof portfolioHeaders==='undefined'?[]:portfolioHeaders;
  const data=computePortfolioAnalysis(sellers,headers);
  const fmt=n=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(n);
  const bar=(label,count,base,tone='category')=>`<div class="analysis-row"><div><span>${escapeHtml(label)}</span><strong>${count} <small>· ${base?fmt(count/base*100)+'%':'—'}</small></strong></div><div class="analysis-track" aria-hidden="true"><span class="analysis-${tone}" style="width:${base?count/base*100:0}%"></span></div></div>`;
  const unknown=(label,values)=>values.length?`<details class="analysis-unknown"><summary>${label}: ${values.reduce((sum,v)=>sum+v[1],0)}</summary><ul>${values.map(([v,n])=>`<li>${escapeHtml(v)}: <strong>${n}</strong></li>`).join('')}</ul></details>`:'';
  const tones=['red','yellow','green','neutral'];
  const rangeLabels=['Menos de 70%','70% a menos de 90%','90% a 130% inclusive','Más de 130%'];
  const compactTransactions=data.products.map(p=>`<article class="analysis-product"><div class="analysis-product-head"><strong>${p.product}</strong><small>${p.valid} de ${data.total} comercios con datos disponibles</small></div><p class="analysis-attention">${p.valid?`<strong>${p.transactions[0]}</strong> comercio${p.transactions[0]===1?'':'s'} con menos de 70% ${p.transactions[0]?'<span>· Revisar</span>':''}`:'Sin datos de transaccionabilidad para evaluar'}</p><div class="analysis-segments" role="img" aria-label="${escapeHtml(p.product+': '+rangeLabels.map((label,i)=>label+' '+p.transactions[i]+' comercios').join(', '))}">${p.transactions.map((n,i)=>n?`<span class="analysis-${tones[i]}" style="flex-grow:${n}" title="${escapeHtml(rangeLabels[i])}: ${n}"></span>`:'').join('')}</div><div class="analysis-key">${p.transactions.map((n,i)=>`<span><i class="analysis-${tones[i]}" aria-hidden="true"></i><span>${escapeHtml(rangeLabels[i])}</span><b>${n}</b></span>`).join('')}</div>${data.total-p.valid?`<p class="analysis-data-note">${data.total-p.valid} sin dato o sin porcentaje verificable</p>`:''}</article>`).join('');
  const compactOpportunities=data.products.map(p=>`<div class="analysis-opportunity-line"><strong>${p.product}</strong><div>${p.opportunities.map((n,i)=>`<span>${p.product==='Point'?'No Pointer':'No QR'}${i?' referible':''} <b>${n}</b></span>`).join('')}</div></div>`).join('');
  const unavailable=stateCard('el análisis de cartera');
  return `<section class="portfolio-analysis" aria-labelledby="portfolio-analysis-title"><div class="section-head"><h2 id="portfolio-analysis-title">Gestión de cartera</h2></div>${unavailable||(!data.total?'<div class="card"><p class="muted">Cuando tengas comercios en tu cartera, vas a ver el análisis acá.</p></div>':`
  <div class="card analysis-executive"><div class="analysis-state"><h3>Estado de Point y QR</h3><p class="analysis-caption">Transaccionabilidad proyectada según la planilla. Revisá primero los comercios por debajo de 70%.</p><div class="analysis-compact-transactions">${compactTransactions}</div></div><div class="analysis-opportunities"><h3>Oportunidades comerciales</h3><p class="analysis-caption">Para trabajar el uso de Point como medio principal de cobro y la activación de QR.</p><div class="analysis-opportunity-products">${compactOpportunities}</div><p class="analysis-data-note">Según estados de la planilla. No sumar: un comercio puede aparecer en más de un indicador.</p></div><div class="analysis-categories-teaser"><h3>Categorías</h3><p class="analysis-caption">Consultá la distribución de categorías de Point y QR en el análisis completo.</p></div><details class="analysis-expanded"><summary><span class="analysis-show">Ver análisis completo</span><span class="analysis-hide">Ocultar análisis completo</span></summary><div class="analysis-full-detail">
  <div class="analysis-detail-block"><h3>Transaccionabilidad</h3><p class="muted">Porcentaje sobre comercios con transaccionabilidad válida de cada producto.</p><div class="analysis-columns">${data.products.map(p=>`<article><h4>${p.product}</h4><p class="analysis-base">${p.valid} analizados de ${data.total} comercios</p>${['Menor a 70%','70% a menos de 90%','90% a 130% inclusive','Mayor a 130%'].map((label,i)=>bar(label,p.transactions[i],p.valid,['red','yellow','green','neutral'][i])).join('')}${unknown('Sin dato o sin rango numérico verificable',p.unknownTransactions)}${p.missingColumns.length?`<p class="analysis-alert">Columnas ausentes o duplicadas: ${p.missingColumns.join(', ')}.</p>`:''}</article>`).join('')}</div><details class="analysis-unknown"><summary>Criterios de lectura</summary><p>Los rangos textuales de origen «Entre 70% y 90%», «Entre 90% y 110%» y «Entre 110% y 130%» se cuentan en sus bandas respectivas. La planilla no permite comprobar los extremos de esos intervalos. Los porcentajes numéricos explícitos respetan los límites indicados. Los números sin % y otros estados quedan fuera del cálculo.</p></details></div>
  <div class="analysis-detail-block"><h3>Categorías de Point y QR</h3><p class="muted">Cada porcentaje usa las categorías reconocidas de su producto. C significa categoría; se agrupan de cinco en cinco. Las barras comparten una escala de 0 a 100%. No se asigna un significado de rendimiento a las categorías.</p><div class="analysis-columns">${data.products.map(p=>`<article><h4>${p.product}</h4><p class="analysis-base">${p.categoryValid} con categoría reconocida de ${data.total}</p>${p.categories.map(c=>bar(c.label,c.count,p.categoryValid)).join('')||'<p class="muted">Sin categorías reconocidas.</p>'}${unknown('Sin dato o categoría sin equivalencia verificada',p.unknownCategories)}</article>`).join('')}</div><p class="analysis-base">C0 se conserva separado. «Menor a 0 no cuenta» no se equipara a «Menor a 0». Solo se muestran grupos presentes en la cartera.</p></div>
  <div class="analysis-detail-block"><h3>Oportunidades comerciales</h3><p class="muted">Base: ${data.total} comercios de la cartera para cada indicador. Se cuentan estados explícitos en las columnas de transaccionabilidad o categoría, una vez por comercio e indicador.</p><div class="analysis-columns">${data.products.map(p=>`<article><h4>${p.product==='Point'?'Point · Desarrollar principalidad':'QR · Activar QR'}</h4>${p.opportunities.map((count,i)=>bar((p.product==='Point'?'No Pointer':'No QR')+(i?' referible':''),count,data.total,'opportunity')).join('')}</article>`).join('')}</div><p class="analysis-base">Los indicadores no se suman: un comercio puede aparecer en más de uno. «No Pointer», «No Pointer referible», «No QR» y «No QR referible» son estados textuales de la planilla. La fuente no define la elegibilidad de «referible»: se conserva el valor informado sin deducirlo. Cero indica que no se encontró ese estado explícito; no se infiere a partir de otras categorías.</p></div></div></details></div>`)}</section>`;
}
