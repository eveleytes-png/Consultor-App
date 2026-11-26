/* Email-only daily summary settings. Configuration is saved on the server. */
(()=>{
 const original=profileConfiguration;
 profileConfiguration=function(){original();mount();};
 let generation=0,renderReview=null,reviewBusy=false,workflowOpened=false,reviewRequest=null;
 const reviewRoute=()=>new URL(location.href).searchParams.get('notificaciones')==='cambios';
 function updateGlobal(s){
  if(!reviewRoute())return;
  if(!workflowOpened){workflowOpened=true;mountWorkflow(s);}
  else if(!reviewBusy)renderReview?.(s);
 }
 function openReview(operation){
  if(!reviewRoute()||reviewRequest||(!operation&&workflowOpened))return;
  if(operation)showOpNotice('Comparando Base importada con Base Consultor App.');
  reviewRequest=call(operation).then(state=>{
   if(!reviewRoute())return;
   updateGlobal(state);
   if(operation)document.querySelector('[data-operation-notice]')?.remove();
  }).catch(error=>{
   if(!reviewRoute())return;
   if(error.status===401)updateGlobal({canReview:false,changes:[]});
   else if(error.importValidation)updateGlobal({canReview:true,changes:[],reviewError:error.message});
   showOpNotice(error.message,{title:'No se completó la conciliación',error:true});
  }).finally(()=>{reviewRequest=null;});
 }
 const openLinkedReview=()=>openReview();
 window.addEventListener('popstate',openLinkedReview);
 document.addEventListener('consultor-navigation',openLinkedReview);
 document.addEventListener('consultor-session-ready',()=>{if(workflowOpened&&reviewRoute()&&renderReview){call().then(updateGlobal).catch(()=>{});}else openLinkedReview();});
 document.addEventListener('click',event=>{
  if(page!=='sellers'||!event.target.closest('[data-reconcile-sellers]')||reviewRequest)return;
  const url=new URL(location.href);url.searchParams.set('notificaciones','cambios');
  history.replaceState(history.state,'',url);
  openReview('review');
 });
 openLinkedReview();
 function mountWorkflow(initial){
  if(page!=='sellers'){
   const url=new URL(location.href);url.searchParams.set('pantalla','sellers');
   location.replace(url.href);
   return;
  }
  const dialog=opDialog('Registrar modificación cartera',
   '<div class="planilla-body" id="portfolio-review"></div>',true);
  dialog.classList.add('planilla-dialog','portfolio-reconciliation-dialog');
  const body=dialog.querySelector('#portfolio-review');
  const order=['remove','add'],labels={remove:'Eliminar sellers',add:'Agregar sellers',finish:'Revisar y registrar'};
  const selected={add:new Set(),remove:new Set()};
  let state=initial,stage='intro',authenticating=false,lastFingerprint='';
  const items=kind=>(state.changes||[]).filter(c=>c.kind===kind&&c.applicable);
  const picked=kind=>items(kind).filter(c=>selected[kind].has(c.id));
  const steps=()=>[...order.filter(kind=>items(kind).length),'finish'];
  const button=(text,action,style='secondary',disabled=false)=>
   '<button type="button" class="'+style+'" data-wizard="'+action+'"'+(disabled?' disabled':'')+'>'+text+'</button>';
  const footer=(...buttons)=>'<div class="form-footer">'+buttons.join('')+'</div>';
  const panel=(title,description,content='')=>'<section class="planilla-content"><h3>'+title+'</h3><p class="planilla-description">'+description+'</p>'+content+'</section>';
  function progress(){
   const visible=['Cambios','Actualizar datos','Conciliación'],index=stage==='intro'?0:stage==='finish'?2:1;
   return '<nav class="planilla-steps" aria-label="Progreso de conciliación"><ol>'+visible.map((label,i)=>
    '<li class="'+(i===index?'is-current':i<index?'is-complete':'')+'"'+(i===index?' aria-current="step"':'')+'><span class="planilla-step-number" aria-hidden="true">'+
    (i<index?'✓':i+1)+'</span><strong>'+label+'</strong><small>'+(i===index?'En curso':i<index?'Completado':'Pendiente')+'</small></li>').join('')+'</ol></nav>';
  }
  function intro(){
   const removals=items('remove').length,additions=items('add').length;
   if(!state.canReview)return panel('Ingresá para revisar los cambios','Accedé con tu cuenta autorizada de Google.')+footer(button('Ingresar con Google','login','primary'));
   const close='<button type="button" class="secondary" data-modal-close>Cerrar</button>';
   if(state.reviewError)return panel('Conciliación bloqueada',escapeHtml(state.reviewError),
    '<p class="planilla-description">Revisá Base importada y usá «Conciliar sellers» en Mi cartera para volver a intentar.</p>')+footer(close);
   if(!removals&&!additions){
    return state.reviewReady?
     '<section class="planilla-content portfolio-reconciliation-empty"><span aria-hidden="true">✓</span><h3>Las planillas están conciliadas</h3><p class="planilla-description">No hay comercios para agregar ni eliminar de Base Consultor App.</p></section>'+footer(close):
     panel('Conciliá las planillas','Usá «Conciliar sellers» en Mi cartera para buscar cambios pendientes.')+footer(close);
   }
   const count=(kind,label,value)=>'<div class="portfolio-count-'+kind+'"><dt>'+label+'</dt><dd>'+value+' <span>'+ (value===1?'seller':'sellers')+'</span></dd></div>';
   const counts='<dl class="planilla-review portfolio-counts">'+count('remove','Para eliminar',removals)+count('add','Para agregar',additions)+'</dl>';
   return progress()+panel('Hay cambios pendientes','Revisá las diferencias entre tu Base importada y la Base Consultor App antes de continuar.',counts)+footer(close,button('Comenzar conciliación <span aria-hidden="true">→</span>','start','primary'));
  }
  function selectStep(){
   const changes=items(stage),chosen=selected[stage];
   const list='<div class="planilla-columns">'+changes.map(change=>'<label><input type="checkbox" data-choice="'+escapeHtml(change.id)+'"'+
    (chosen.has(change.id)?' checked':'')+'><span>'+escapeHtml(change.name)+'</span></label>').join('')+'</div>';
   const description=stage==='remove'?'Tildá los comercios que querés archivar en ComerciosEliminados y quitar de Base Consultor App.':
    'Tildá los comercios que querés incorporar a Base Consultor App.';
   const count='<p class="planilla-count" data-selected-count></p>';
   return progress()+panel(labels[stage],description,count+button('Seleccionar todos','toggle')+list)+footer(button('Volver','back'),button('Continuar','next','primary'));
  }
  function finish(){
   const total=order.reduce((count,kind)=>count+picked(kind).length,0);
   const lists=order.map(kind=>{
    const choices=picked(kind);
    return '<div><dt>'+labels[kind]+'</dt><dd>'+choices.length+'</dd></div>';
   }).join('');
   const names=order.map(kind=>{
    const choices=picked(kind);
    return choices.length?'<section><h4>'+labels[kind]+'</h4><div class="planilla-selected-columns">'+
     choices.map(change=>'<span>'+escapeHtml(change.name)+'</span>').join('')+'</div></section>':'';
   }).join('');
   const description=!total?'No seleccionaste comercios. Podés volver para elegirlos.':
    state.writesEnabled?'Revisá la selección antes de registrarla. Los demás cambios seguirán pendientes.':
     'La selección está lista para revisar. El registro en la planilla aún no está habilitado.';
   return progress()+panel('Cambios que vas a registrar',description,'<dl class="planilla-review">'+lists+'</dl>'+names)+
    footer(button('Volver','back'),button('Registrar cambios','confirm','primary',!total||!state.writesEnabled||!!state.reviewError));
  }
  function syncSelection(){
   const choices=items(stage);
   const count=body.querySelector('[data-selected-count]');
   if(!count)return;
   const total=picked(stage).length;
   count.textContent=total+' de '+choices.length+' seleccionados';
   body.querySelector('[data-wizard="toggle"]').textContent=total===choices.length?'Quitar selección':'Seleccionar todos';
  }
  function render(){
   if(!dialog.open)return;
   if(stage!=='intro'&&(!state.canReview||state.reviewError||steps().length===1))stage='intro';
   if(order.includes(stage)&&!items(stage).length)stage='intro';
   const overdue=stage==='intro'&&state.canReview&&['missed','failed'].includes(state.automaticStatus)?
    '<p class="planilla-description" role="status">La conciliación programada de hoy no se completó. Podés realizarla ahora.</p>':'';
   body.innerHTML=stage==='intro'?overdue+intro():stage==='finish'?finish():selectStep();
   syncSelection();
  }
  function paint(next){
   const fingerprint=JSON.stringify([next.canReview,next.writesEnabled,next.reviewReady,next.reviewError,next.automaticStatus,next.changes]);
   state=next;
   if(fingerprint===lastFingerprint)return;
   lastFingerprint=fingerprint;
   for(const kind of order){
    const available=new Set(items(kind).map(c=>c.id));
    for(const id of selected[kind])if(!available.has(id))selected[kind].delete(id);
   }
   render();
  }
  async function apply(approved,confirmedAt){
   reviewBusy=true;body.inert=true;
   body.innerHTML='<section class="planilla-content portfolio-reconciliation-empty" role="status"><h3>Registrando cambios…</h3></section>';
   let next=state;
   const counts={add:0,remove:0};
   const errors=[];
   try{
    for(const kind of order){
     for(const change of approved[kind]){
      next=await call('applyPortfolioChanges',{kind,ids:[change.id],...(kind==='remove'?{confirmedAt}:{})});
      if(next.reviewError){errors.push(next.reviewError);return;}
      const outcome=next.results?.find(item=>item.id===change.id);
      if(outcome?.applied){counts[kind]++;selected[kind].delete(change.id);}
      else errors.push(change.name+': '+(outcome?.error||'No se pudo verificar el registro.'));
     }
    }
   }catch(error){errors.push(error.message);}
   finally{
    reviewBusy=false;body.inert=false;dialog.close();
    const summary=[];
    if(counts.add)summary.push(counts.add===1?'Se agregó 1 comercio.':'Se agregaron '+counts.add+' comercios.');
    if(counts.remove)summary.push(counts.remove===1?'Se eliminó 1 comercio.':'Se eliminaron '+counts.remove+' comercios.');
    showOpNotice([...summary,...errors].join(' '),{title:errors.length?'No se completó la conciliación':'Registro finalizado',error:!!errors.length});
   }
  }
  body.onchange=event=>{
   const id=event.target.dataset.choice;
   if(!order.includes(stage)||!id)return;
   if(event.target.checked)selected[stage].add(id);else selected[stage].delete(id);
   syncSelection();
  };
  body.onclick=event=>{
   const action=event.target.closest('[data-wizard]')?.dataset.wizard;
   if(!action||reviewBusy)return;
   if(action==='login'){authenticating=true;window.SheetsApp?.openServerLogin();return;}
   if(action==='start')stage=steps()[0];
   if(action==='next'||action==='back'){
    const visible=steps(),i=visible.indexOf(stage);
    stage=visible[i+(action==='next'?1:-1)]||'intro';
   }
   if(action==='toggle'){
    const all=picked(stage).length===items(stage).length;
    selected[stage].clear();
    if(!all)for(const change of items(stage))selected[stage].add(change.id);
    for(const input of body.querySelectorAll('[data-choice]'))input.checked=!all;
    syncSelection();return;
   }
   if(action==='confirm'){
    const approved=Object.fromEntries(order.map(kind=>[kind,picked(kind)]));
    if(!state.writesEnabled||state.reviewError||!order.some(kind=>approved[kind].length))return;
    const count=approved.remove.length+approved.add.length;
    const confirm=opDialog('Confirmar registro',
     '<p>¿Querés registrar '+(count===1?'el cambio seleccionado':'los '+count+' cambios seleccionados')+'?</p>'+
     '<div class="form-footer"><button type="button" class="secondary" data-modal-close>Cancelar</button><button type="button" class="primary" data-confirm>Confirmar</button></div>');
    confirm.querySelector('[data-confirm]').onclick=()=>{const confirmedAt=new Date().toISOString();confirm.close();apply(approved,confirmedAt);};
    return;
   }
   render();
  };
  renderReview=paint;paint(initial);
  dialog.addEventListener('cancel',event=>{if(reviewBusy)event.preventDefault();});
  dialog.addEventListener('click',event=>{
   if(reviewBusy&&(event.target===dialog||event.target.closest('[data-modal-close]'))){
    event.preventDefault();event.stopImmediatePropagation();
   }
  },true);
  dialog.addEventListener('close',()=>{
   renderReview=null;workflowOpened=false;
   if(authenticating||!reviewRoute())return;
   const url=new URL(location.href);url.searchParams.delete('notificaciones');url.searchParams.set('pantalla','sellers');
   history.replaceState(history.state,'',url);
   window.SheetsApp?.refreshRemote();
  });
 }
 async function call(operation,data={}){
  const r=await fetch('/api/notifications',{method:operation?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:operation?JSON.stringify({operation,...data}):undefined,signal:AbortSignal.timeout(30000)});
  const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error||'No se pudieron consultar las notificaciones.'),{status:r.status,importValidation:value.importValidation});return value;
 }
 function mount(){
  const section=document.createElement('section');section.className='settings-section';section.id='daily-notifications';
  section.innerHTML='<div class="settings-section-heading"><span class="eyebrow">SEGUIMIENTO</span><h2>Notificaciones diarias</h2></div><p data-notification-message role="status">Consultando configuración…</p><div data-notification-body></div>';
  document.querySelector('main').append(section);const epoch=++generation;
  const message=section.querySelector('[data-notification-message]'),body=section.querySelector('[data-notification-body]');
  let working=false,editing=false;
  function paint(s){
   document.dispatchEvent(new CustomEvent('consultor-notifications-state',{detail:s}));
   if(!section.isConnected||epoch!==generation)return;
   message.textContent=s.lastError||'';
   const active=s.enabled&&s.emailVerified&&s.emailConfigured;
   body.innerHTML=`<article class="settings-panel notification-settings"><form data-daily-form><div class="notification-settings-top"><div><h3>Resumen diario de cartera</h3><p>Te avisamos si se agregaron o eliminaron comercios y cómo está evolucionando tu cartera.</p></div><label class="notification-switch"><input type="checkbox" role="switch" name="enabled" aria-label="Activar notificaciones diarias por email" ${s.enabled?'checked':''}><span aria-hidden="true"></span></label></div><div class="notification-fields"><label class="settings-label">Horario de envío<input class="input" name="time" type="time" required disabled value="${escapeHtml(s.time||'09:00')}"></label><label class="settings-label">Email de destino<input class="input" name="email" type="email" disabled autocomplete="email" required maxlength="254" value="${escapeHtml(s.email||'')}"></label><div class="connection-actions"><button class="secondary" type="button" data-edit-notifications>Modificar configuración</button><button class="primary" type="submit" hidden>Guardar</button><button class="secondary" type="button" data-cancel-notifications hidden>Cancelar</button></div></div><p class="notification-delivery ${active?'is-active':''}"><i aria-hidden="true"></i>${active?'Envío activo todos los días a las '+escapeHtml(s.time):!s.enabled?'Envíos desactivados':!s.emailConfigured?'Falta configurar el proveedor de correo':'Verificá el email para activar los envíos'}</p><p class="settings-timezone">Horario de Buenos Aires. El envío puede demorar unos minutos.</p></form>${s.email&&!s.emailVerified?`<div class="email-verification"><p>Verificá el correo guardado para recibir el resumen en esa dirección.</p><button class="secondary" data-notify="emailCode" ${s.emailConfigured?'':'disabled'}>Enviar código de verificación</button><button class="secondary" data-email-confirm>Ingresar código</button></div>`:''}</article>`;
   const form=body.querySelector('form');
   editing=false;
   const edit=form.querySelector('[data-edit-notifications]'),save=form.querySelector('[type="submit"]'),cancel=form.querySelector('[data-cancel-notifications]');
   edit.onclick=()=>{
    editing=true;form.elements.time.disabled=false;form.elements.email.disabled=false;form.elements.enabled.disabled=true;
    edit.hidden=true;save.hidden=false;cancel.hidden=false;form.elements.time.focus();
   };
   cancel.onclick=()=>paint(s);
   form.onsubmit=async e=>{e.preventDefault();if(!editing||working)return;await perform('configure',{enabled:form.elements.enabled.checked,time:form.elements.time.value,email:form.elements.email.value.trim()},s);};
   form.elements.enabled.onchange=()=>perform('configure',{enabled:form.elements.enabled.checked,time:s.time||'09:00',email:s.email||''},s);
   const confirm=body.querySelector('[data-email-confirm]');
   if(confirm)confirm.onclick=()=>{
    const d=opDialog('Verificar correo','<form data-extra-form><label>Código recibido<input class="input" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><p role="alert"></p><button class="primary">Verificar</button></form>');
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();try{const value=await call('verifyEmail',{code:e.currentTarget.elements.code.value});d.close();paint(value);}catch(error){d.querySelector('[role=alert]').textContent=error.message;}};
   };
  }
  async function perform(operation,data={},previous){
   if(working)return;working=true;message.textContent='Guardando…';
   const controls=[...body.querySelectorAll('button,input')];const disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
   try{
    const value=await call(operation,data);
    if(operation==='preview'){const d=opDialog('Tu resumen diario','');const pre=document.createElement('pre');pre.style.whiteSpace='pre-wrap';pre.textContent=value.text;d.append(pre);message.textContent='Vista previa; no se envió.';}
    else{paint(value);if(operation==='emailCode')message.textContent='Revisá tu correo para obtener el código de verificación.';else showOpNotice('Cambios guardados.');}
   }catch(error){if(previous&&!editing)paint(previous);message.textContent=error.message;}
   finally{controls.forEach((el,i)=>{if(el.isConnected)el.disabled=disabled[i];});working=false;}
  }
  body.addEventListener('click',e=>{const button=e.target.closest('[data-notify]');if(button)perform(button.dataset.notify);});
  call().then(paint).catch(error=>{if(section.isConnected)message.textContent=error.message;});
  if(new URL(location.href).searchParams.get('notificaciones')==='cambios')section.scrollIntoView({block:'start'});
 }
})();
