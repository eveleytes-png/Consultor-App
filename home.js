// The same seller rows feed the list and the portfolio. No external data connection.
function normalizeAnswer(value){return String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function computePortfolio(rows){
  const merchants=rows.filter(row=>String(row.Mail??row.e??'').trim());
  const accepted=merchants.filter(row=>normalizeAnswer(row['Aceptación']??row.accept)==='si');
  const rejected=merchants.filter(row=>normalizeAnswer(row['Aceptación']??row.accept)==='no');
  const surveyed=accepted.filter(row=>normalizeAnswer(row['Encuesta valida']??row.survey)==='si');
  const blindados=merchants.filter(row=>String(row.Blindaje??row.blindaje??'').trim()).length;
  return {total:merchants.length,accepted:accepted.length,rejected:rejected.length,blindados,
    unknown:merchants.length-accepted.length-rejected.length,surveyed:surveyed.length,
    percentage:accepted.length?surveyed.length/accepted.length*100:null,
    goals:[60,70].map(target=>({target,total:Math.ceil(accepted.length*target/100),missing:Math.max(0,Math.ceil(accepted.length*target/100)-surveyed.length)}))};
}
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const todayKey=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const activities=[];
const usefulLinks=[];
function activityRows(){return activities.filter(a=>a.date===todayKey).sort((a,b)=>a.time.localeCompare(b.time)).map(a=>`<div class="activity agenda-activity"><time>${escapeHtml(a.time)}</time><div><strong>${escapeHtml(a.description)}</strong>${a.comment?`<small>${escapeHtml(a.comment)}</small>`:''}</div></div>`).join('')||'<p class="muted">No tenés actividades para hoy.</p>';}
function agendaCard(full=false){return `<div class="card agenda"><div class="agenda-heading"><h2>Agenda de hoy</h2><button type="button" class="agenda-add" data-open-activity aria-label="Cargar nueva actividad">${icon('calendarPlus')}</button></div><p class="agenda-date">${date}</p>${activityRows()}${full?'':`<a href="?pantalla=agenda" class="text-button">Ver agenda completa ${icon('arrow')}</a>`}</div>`;}
function renderUsefulLinks(all=false,selected=new Set()){
  const cards=usefulLinks.map((link,i)=>({link,i})).filter(({link})=>all||link.favorite);
  if(!cards.length)return `<p class="muted links-empty">${all?'No hay links en el listado.':'Marcá con una estrella hasta 3 links del listado para verlos en Inicio.'}</p>`;
  return `<div class="links ${all?'links-list':''}">${cards.map(({link,i})=>`<article class="card useful useful-link">${all?`<input type="checkbox" class="link-select" data-select-link="${i}" aria-label="Seleccionar ${escapeHtml(link.comment||'link')}" ${selected.has(link)?'checked':''}>`:''}<span class="icon-tile">${icon('link')}</span><button type="button" class="link-detail" data-edit-link="${i}" aria-label="Ver detalle de ${escapeHtml(link.comment||'link')}"><strong>${escapeHtml(link.comment||'Sin comentario')}</strong><small>${escapeHtml(new URL(link.url).hostname)}</small></button><div class="link-actions">${all?`<button type="button" class="icon-action favorite ${link.favorite?'is-favorite':''}" data-star-link="${i}" aria-pressed="${!!link.favorite}" aria-label="Favorito: ${escapeHtml(link.comment||'link')}">${icon('star')}</button>`:''}<button type="button" class="icon-action" data-edit-link="${i}" aria-label="Editar ${escapeHtml(link.comment||'link')}">${icon('pencil')}</button><a class="icon-action" data-open-link="${i}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${escapeHtml(link.comment||'link')}">${icon('arrow')}</a></div></article>`).join('')}</div>`;
}
function home(){
  const m=computePortfolio(sellers),percent=m.percentage===null?'—':new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(m.percentage)+'%';
  return `<section>${stateCard('la agenda')||(state==='vacio'?empty('No tenés actividades para hoy','Tu agenda de hoy está libre.') :agendaCard())}</section>
    <section>${title('Mi cartera')}${stateCard('la cartera')||(state==='vacio'?empty('Tu cartera todavía está vacía','Cuando tengas comercios, vas a ver sus métricas acá.'):`<div class="metrics">${metric('Total de comercios',m.total,'En tu cartera','store','<a href="?pantalla=sellers" class="mini">Ver sellers</a>',true)}${metric('Con aceptación',m.accepted,'','acceptYes')}${metric('Sin aceptación',m.rejected,'','acceptNo')}${metric('Comercios blindados',m.blindados,'','shield')}</div>${m.unknown?`<p class="count acceptance-note">${m.unknown} comercio${m.unknown===1?'':'s'} sin dato de aceptación</p>`:''}<div class="card survey"><div class="survey-progress"><div class="value-line"><div><h3>Encuestas realizadas</h3><small>${m.surveyed} de ${m.accepted} comercios con aceptación</small></div><strong>${percent}</strong></div><div class="progress" role="img" aria-label="${m.percentage===null?'Sin comercios con aceptación':percent+' de encuestas realizadas'}"><span style="width:${m.percentage??0}%"></span></div></div>${m.goals.map(g=>`<div class="goal"><span class="goal-number">${m.accepted?g.missing:'—'}</span><p>${m.accepted?(g.missing===0?'Meta alcanzada':'encuesta'+(g.missing===1?'':'s')+' pendiente'+(g.missing===1?'':'s')):'Sin base de cálculo'}<br><strong>para alcanzar el ${g.target}%</strong><br><small>${m.accepted?'Meta: '+g.total+' encuestas':'Sin comercios con aceptación'}</small></p></div>`).join('')}</div>`)}</section>
    <section>${title('Links útiles','','<button type=\"button\" class=\"text-button\" data-all-links>Ver todos '+icon('arrow')+'</button>')}${stateCard('los links')||(state==='vacio'?empty('Todavía no hay links útiles','Los recursos disponibles aparecerán acá.'):renderUsefulLinks())}</section>`;
}
function agendaScreen(){return `<div class="section-head"><p class="date">${date}</p><a href="./" class="text-button">Volver a Inicio</a></div>${stateCard('la agenda')||agendaCard(true)}`;}

function initHomeInteractions(){
  const dialog=document.createElement('dialog');
  dialog.className='edit-dialog';dialog.setAttribute('aria-labelledby','edit-title');
  document.body.append(dialog);
  const listDialog=document.createElement('dialog');
  listDialog.className='edit-dialog links-dialog';listDialog.setAttribute('aria-labelledby','links-title');
  document.body.append(listDialog);
  const toast=document.createElement('div');toast.className='toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
  let toastTimer;
  function notify(message){showOpNotice(message);}
  const selectedLinks=new Set();
  function refreshList(){listDialog.innerHTML=`<div class="section-head"><div><h2 id="links-title">Listado de Links</h2><p class="muted">Marcá hasta 3 links como favoritos para que aparezcan en Inicio.</p></div><button type="button" class="menu-close" data-close-links aria-label="Cerrar listado">${icon('close')}</button></div><div class="links-toolbar"><button type="button" class="primary" data-add-link>${icon('plus')}Agregar link</button>${selectedLinks.size?`<span class="selected-count">${selectedLinks.size} seleccionado${selectedLinks.size===1?'':'s'}</span><button type="button" class="secondary" data-delete-selected>Eliminar seleccionados</button>`:''}</div>${renderUsefulLinks(true,selectedLinks)}`;}
  listDialog.addEventListener('change',event=>{
    const checkbox=event.target.closest('[data-select-link]');if(!checkbox)return;
    const index=Number(checkbox.dataset.selectLink),link=usefulLinks[index];
    if(checkbox.checked)selectedLinks.add(link);else selectedLinks.delete(link);
    refreshList();listDialog.querySelector(`[data-select-link="${index}"]`)?.focus();
  });
  listDialog.addEventListener('close',()=>{document.body.classList.remove('links-open');document.querySelector('[data-all-links]')?.focus();});
  listDialog.addEventListener('click',event=>{const r=listDialog.getBoundingClientRect();if(event.target===listDialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))listDialog.close();});
  let returnFocus=null;
  function open(content,trigger){returnFocus=trigger;dialog.innerHTML=content;dialog.showModal();document.body.classList.add('editor-open');}
  function refresh(){document.querySelector('main').innerHTML=page==='agenda'?agendaScreen():home();if(listDialog.open)refreshList();}
  const closeButton=`<button type="button" class="menu-close" data-close-editor aria-label="Cerrar">${icon('close')}</button>`;
  const footer=`<div class="form-footer"><button type="button" class="secondary" data-close-editor>Cancelar</button><button type="submit" class="primary">Aplicar</button></div>`;
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-all-links]')){refreshList();listDialog.showModal();document.body.classList.add('links-open');}
    if(event.target.closest('[data-close-links]'))listDialog.close();
    const star=event.target.closest('[data-star-link]');
    if(star){const index=Number(star.dataset.starLink),link=usefulLinks[index];if(!link.favorite&&usefulLinks.filter(l=>l.favorite).length>=3){notify('Ya llegaste al máximo de 3 favoritos.');return;}link.favorite=!link.favorite;refresh();listDialog.querySelector(`[data-star-link="${index}"]`)?.focus();}
    const launch=event.target.closest('[data-open-link]');
    if(launch){const text=usefulLinks[Number(launch.dataset.openLink)]?.copyText;if(text){try{navigator.clipboard.writeText(text).then(()=>notify('Texto copiado al portapapeles.'),()=>notify('No se pudo copiar el texto. Podés copiarlo desde la ficha del link.'));}catch{notify('No se pudo copiar el texto. Podés copiarlo desde la ficha del link.');}}}
    const edit=event.target.closest('[data-edit-link]'),create=event.target.closest('[data-add-link]'),activity=event.target.closest('[data-open-activity]');
    if(edit||create){
      const index=create?usefulLinks.length:Number(edit.dataset.editLink),link=create?{url:'',comment:'',copyText:'',favorite:false}:usefulLinks[index];
      open(`<form id="link-form"><div class="section-head"><h2 id="edit-title">${create?'Agregar link':'Detalle del link'}</h2>${closeButton}</div><label for="link-url">Link</label><input class="input" id="link-url" name="url" type="url" required value="${escapeHtml(link.url)}" placeholder="https://"><label for="link-comment">Comentario</label><textarea class="input" id="link-comment" name="comment" rows="2">${escapeHtml(link.comment)}</textarea><label for="link-copy">Texto para copiar</label><textarea class="input" id="link-copy" name="copyText" rows="3" placeholder="Se copiará al abrir el link">${escapeHtml(link.copyText||'')}</textarea>${create?footer.replace('>Aplicar<','>Agregar link<'):footer.replace('<div class="form-footer">','<div class="form-footer"><button type="button" class="delete-link" data-delete-link="'+index+'">Eliminar link</button>')}</form>`,edit||create);
      const form=dialog.querySelector('form'),urlField=form.elements.url;
      urlField.addEventListener('input',()=>urlField.setCustomValidity(''));
      form.addEventListener('submit',e=>{e.preventDefault();let url;try{url=new URL(urlField.value.trim());if(!['https:','http:'].includes(url.protocol))throw new Error();}catch{urlField.setCustomValidity('Ingresá un link válido que comience con https:// o http://.');urlField.reportValidity();return;}
        Object.assign(link,{url:url.href,comment:form.elements.comment.value.trim(),copyText:form.elements.copyText.value});if(create)usefulLinks.push(link);dialog.close();refresh();(listDialog.open?listDialog:document).querySelector(`[data-edit-link="${index}"]`)?.focus();});
    }
    const remove=event.target.closest('[data-delete-link]');
    if(remove){const index=Number(remove.dataset.deleteLink);selectedLinks.delete(usefulLinks[index]);usefulLinks.splice(index,1);dialog.close();refresh();(listDialog.open?listDialog.querySelector('[data-close-links]'):document.querySelector('[data-all-links]'))?.focus();notify('Link eliminado.');}
    if(event.target.closest('[data-delete-selected]')&&selectedLinks.size){const count=selectedLinks.size;for(let i=usefulLinks.length-1;i>=0;i--)if(selectedLinks.has(usefulLinks[i]))usefulLinks.splice(i,1);selectedLinks.clear();refresh();listDialog.querySelector('[data-add-link]')?.focus();notify(count===1?'Link eliminado.':`${count} links eliminados.`);}
    if(activity){
      open(`<form id="activity-form"><div class="section-head"><h2 id="edit-title">Nueva actividad</h2>${closeButton}</div><label for="activity-date">Fecha</label><input class="input" id="activity-date" name="date" type="date" value="${todayKey}" required><label for="activity-time">Horario</label><input class="input" id="activity-time" name="time" type="time" required><label for="activity-description">Descripción</label><input class="input" id="activity-description" name="description" required>${footer}</form>`,activity);
      dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget,description=form.elements.description.value.trim();if(!description){form.elements.description.setCustomValidity('Ingresá una descripción.');form.elements.description.reportValidity();return;}activities.push({date:form.elements.date.value,time:form.elements.time.value,description,comment:''});dialog.close();refresh();document.querySelector('[data-open-activity]')?.focus();});
      dialog.querySelector('[name="description"]').addEventListener('input',e=>e.target.setCustomValidity(''));
    }
    if(event.target.closest('[data-close-editor]'))dialog.close();
  });
  dialog.addEventListener('close',()=>{document.body.classList.remove('editor-open');if(returnFocus?.isConnected)returnFocus.focus();});
  dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))dialog.close();});
}






