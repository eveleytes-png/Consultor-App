/* Email-only daily summary settings. Configuration is saved on the server. */
(()=>{
 const original=profileConfiguration;
 profileConfiguration=function(){original();mount();};
 let generation=0;
 async function call(operation,data={}){
  const r=await fetch('/api/notifications',{method:operation?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:operation?JSON.stringify({operation,...data}):undefined,signal:AbortSignal.timeout(30000)});
  const value=await r.json();if(!r.ok)throw Error(value.error||'No se pudieron consultar las notificaciones.');return value;
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