/* Email-only daily summary settings. Configuration is saved on the server. */
(()=>{
 const original=profileConfiguration;
 profileConfiguration=function(){original();mount();};
 let generation=0,renderReview=null,reviewBusy=false,workflowOpened=false;
 const reviewRoute=()=>new URL(location.href).searchParams.get('notificaciones')==='cambios';
 function updateGlobal(s){
  document.dispatchEvent(new CustomEvent('consultor-notifications-state',{detail:s}));
  if(!reviewRoute())return;
  if(!workflowOpened){workflowOpened=true;mountWorkflow(s);}
  else if(!reviewBusy)renderReview?.(s);
 }
 async function refreshReview(){
  if(!reviewRoute())return;
  try{updateGlobal(await call());}
  catch(error){if(error.status===401)updateGlobal({canReview:false,changes:[]});}
 }
 window.addEventListener('focus',refreshReview);
 window.addEventListener('popstate',refreshReview);
 document.addEventListener('consultor-navigation',refreshReview);
 document.addEventListener('consultor-session-ready',refreshReview);
 refreshReview();
 function mountWorkflow(initial){
  if(page!=='sellers'){
   const url=new URL(location.href);url.searchParams.set('pantalla','sellers');
   location.replace(url.href);
   return;
  }
  const dialog=opDialog('Registrar modificación cartera',
   '<div class="planilla-body" id="portfolio-review"></div><p class="planilla-description" role="status" data-results></p>',true);
  dialog.classList.add('planilla-dialog');
  const body=dialog.querySelector('#portfolio-review'),result=dialog.querySelector('[data-results]');
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
   const visible=steps(),index=visible.indexOf(stage);
   return '<nav class="planilla-steps" aria-label="Progreso del registro"><ol>'+visible.map((step,i)=>
    '<li class="'+(i===index?'is-current':i<index?'is-complete':'')+'"'+(i===index?' aria-current="step"':'')+'><span class="planilla-step-number" aria-hidden="true">'+
    (i<index?'✓':i+1)+'</span><strong>'+labels[step]+'</strong><small>'+(i===index?'En curso':i<index?'Completado':i===index+1?'Siguiente':'Pendiente')+'</small></li>').join('')+'</ol></nav>';
  }
  function intro(){
   const removals=items('remove').length,additions=items('add').length;
   if(!state.canReview)return panel('Ingresá para revisar los cambios','Accedé con tu cuenta autorizada de Google.')+footer(button('Ingresar con Google','login','primary'));
   const reconcile=button('Realizar una conciliación ahora','reconcile',removals||additions?'secondary':'primary');
   if(state.reviewError)return panel('No se pudieron conciliar las planillas',escapeHtml(state.reviewError))+footer(reconcile);
   if(!removals&&!additions){
    return state.reviewReady?
     panel('Las planillas están conciliadas','No hay comercios para agregar ni eliminar de Base Consultor App.')+footer(reconcile):
     panel('Conciliá las planillas','Compará Base importada con Base Consultor App para saber si hay cambios pendientes.')+footer(reconcile);
   }
   const counts='<dl class="planilla-review"><div><dt>Para eliminar</dt><dd>'+removals+'</dd></div><div><dt>Para agregar</dt><dd>'+additions+'</dd></div></dl>';
   return panel('Hay cambios pendientes','Revisá las diferencias entre Base importada y Base Consultor App.',counts)+footer(reconcile,button('Comenzar','start','primary'));
  }
  function selectStep(){
   const changes=items(stage),chosen=selected[stage];
   const list='<div class="planilla-columns">'+changes.map(change=>'<label><input type="checkbox" data-choice="'+escapeHtml(change.id)+'"'+
    (chosen.has(change.id)?' checked':'')+'><span>'+escapeHtml(change.name)+'</span></label>').join('')+'</div>';
   const description=stage==='remove'?'Tildá los comercios que querés archivar en Comercios eliminados y quitar de Base Consultor App.':
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
   if(stage!=='intro'&&stage!=='done'&&(!state.canReview||state.reviewError||steps().length===1))stage='intro';
   if(order.includes(stage)&&!items(stage).length)stage='intro';
   body.innerHTML=stage==='intro'?intro():stage==='finish'?finish():stage==='done'?
    panel('Registro finalizado','Podés volver a revisar los cambios que quedaron pendientes.')+footer(button('Volver al inicio','home'),'<button type="button" class="primary" data-modal-close>Cerrar</button>'):selectStep();
   syncSelection();
  }
  function paint(next){
   const fingerprint=JSON.stringify([next.canReview,next.writesEnabled,next.reviewReady,next.reviewError,next.changes]);
   state=next;
   if(fingerprint===lastFingerprint)return;
   lastFingerprint=fingerprint;
   for(const kind of order){
    const available=new Set(items(kind).map(c=>c.id));
    for(const id of selected[kind])if(!available.has(id))selected[kind].delete(id);
   }
   render();
  }
  async function reconcile(){
   reviewBusy=true;body.inert=true;result.textContent='Conciliando las planillas…';
   try{
    const next=await call('review');
    stage='intro';for(const kind of order)selected[kind].clear();
    paint(next);render();updateGlobal(next);
    result.textContent=next.reviewError?'':order.some(kind=>items(kind).length)?'Encontramos cambios para revisar.':'No encontramos cambios para registrar.';
   }catch(error){result.textContent=error.message;}
   finally{reviewBusy=false;body.inert=false;}
  }
  async function apply(approved){
   reviewBusy=true;body.inert=true;result.textContent='Registrando los cambios seleccionados…';
   let total=0,next=state;
   const errors=[];
   try{
    for(const kind of order){
     for(const change of approved[kind]){
      next=await call('applyPortfolioChanges',{kind,ids:[change.id]});
      const outcome=next.results?.find(item=>item.id===change.id);
      if(outcome?.applied){total++;selected[kind].delete(change.id);}
      else errors.push(change.name+': '+(outcome?.error||'No se pudo verificar el registro.'));
     }
    }
   }catch(error){errors.push(error.message);}
   finally{
    reviewBusy=false;body.inert=false;stage='done';paint(next);render();updateGlobal(next);
    result.textContent=(total===1?'1 cambio registrado.':total+' cambios registrados.')+(errors.length?' '+errors.join(' '):'');
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
   if(action==='reconcile'){reconcile();return;}
   if(action==='login'){authenticating=true;window.SheetsApp?.openServerLogin();return;}
   if(action==='start'||action==='home'){stage=action==='home'?'intro':steps()[0];result.textContent='';}
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
    confirm.querySelector('[data-confirm]').onclick=()=>{confirm.close();apply(approved);};
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
  const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error||'No se pudieron consultar las notificaciones.'),{status:r.status});return value;
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
