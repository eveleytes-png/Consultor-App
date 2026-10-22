/* Profile extension. All configuration and channel binding lives on the server. */
(()=>{
 const original=profileConfiguration;
 profileConfiguration=function(){original();mount();};
 let generation=0;
 async function call(operation,data={}){
  const r=await fetch('/api/notifications',{method:operation?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:operation?JSON.stringify({operation,...data}):undefined,signal:AbortSignal.timeout(30000)});
  const value=await r.json();if(!r.ok)throw Error(value.error||'No se pudieron consultar las notificaciones.');return value;
 }
 function mount(){
  const section=document.createElement('section');section.className='card profile-config';section.id='daily-notifications';
  section.innerHTML='<h2>Resumen diario</h2><p data-notification-message role="status">Consultando configuración…</p><div data-notification-body></div>';
  document.querySelector('main').append(section);const epoch=++generation;
  const message=section.querySelector('[data-notification-message]'),body=section.querySelector('[data-notification-body]');
  const names={pending:'Pendiente',processing:'Procesando',accepted:'Aceptado por proveedor',retry:'Reintento pendiente',failed:'Falló',uncertain:'Sin confirmación; revisar antes de reenviar',skipped:'Omitido por cambio de fecha'};
  function paint(s){
   document.dispatchEvent(new CustomEvent('consultor-notifications-state',{detail:s}));
   if(!section.isConnected||epoch!==generation)return;
   message.textContent=s.lastError||'';
   body.innerHTML=`<p>Horario de Buenos Aires. El proceso revisa envíos cada cinco minutos; pueden producirse demoras adicionales.</p><form data-daily-form><label class="notification-enable"><input type="checkbox" name="enabled" ${s.enabled?'checked':''}> Activar resumen diario</label><label>Horario<input class="input" name="time" type="time" required value="${escapeHtml(s.time)}"></label><label>Correo de destino<input class="input" name="email" type="email" maxlength="254" value="${escapeHtml(s.email)}"></label><p>Correo: ${s.emailConfigured?(s.emailVerified?'verificado':'pendiente de verificación'):'falta configurar el proveedor en el servidor'}.</p><button class="primary" type="submit">Guardar</button></form><div class="connection-actions"><button class="secondary" data-notify="emailCode" ${s.email&&s.emailConfigured?'':'disabled'}>Enviar código de correo</button><button class="secondary" data-email-confirm ${s.email&&s.emailConfigured?'':'disabled'}>Ingresar código</button></div><p>Telegram: ${s.telegramConfigured?(s.telegramLinked?'vinculado':s.telegramPending?'pendiente de confirmar':'sin vincular'):'falta configurar el bot en el servidor'}.</p><div class="connection-actions"><button class="secondary" data-notify="telegramLink" ${s.telegramConfigured?'':'disabled'}>Vincular Telegram</button><button class="secondary" data-notify="confirmTelegram" ${s.telegramPending?'':'disabled'}>Confirmar vínculo</button><button class="secondary" data-notify-refresh>Consultar vínculo pendiente</button><button class="secondary" data-notify="unlinkTelegram">Desvincular</button></div><h3>Cambios de cartera</h3><p>BaseApp ya aplica sus cambios a la cartera. Revisarlos aquí registra tu revisión y conserva una copia; no modifica Google Sheets.</p><p>${s.sourceAt?'Última lectura: '+escapeHtml(s.sourceAt):'Sin lectura inicial. La primera lectura establece la referencia y no genera bajas.'}</p><ul>${(s.changes||[]).map(c=>`<li>${c.kind==='add'?'Alta':'Baja'}: ${escapeHtml(c.name)} · ${escapeHtml(c.id)}</li>`).join('')||'<li>No hay cambios pendientes registrados.</li>'}</ul><div class="connection-actions"><button class="secondary" data-notify="refresh">Actualizar diferencias</button><button class="secondary" data-review ${s.changes.length?'':'disabled'}>Registrar revisión de cambios</button><button class="secondary" data-notify="preview">Ver resumen</button></div><h3>Últimos intentos por canal</h3><ul>${s.jobs.map(j=>`<li>${escapeHtml(j.date)} · ${escapeHtml(j.channel)}: ${escapeHtml(names[j.status]||j.status)}</li>`).join('')||'<li>Todavía no hay envíos registrados.</li>'}</ul><p>La aceptación del proveedor no confirma que el mensaje haya sido entregado o leído.</p><div data-notification-result></div>`;
   body.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;await perform('configure',{enabled:f.elements.enabled.checked,time:f.elements.time.value,email:f.elements.email.value.trim()});};
   body.querySelector('[data-notify-refresh]').onclick=async()=>{try{paint(await call());}catch(e){message.textContent=e.message;}};
   if(s.telegramCandidate){const p=document.createElement('p');p.textContent='Confirmá solo si esta es tu cuenta de Telegram: '+s.telegramCandidate.label+' (chat '+s.telegramCandidate.id+').';body.querySelector('[data-notification-result]').append(p);}
   body.querySelector('[data-review]').onclick=()=>perform('review',{version:s.sourceVersion});
   body.querySelector('[data-email-confirm]').onclick=()=>{
    const d=opDialog('Verificar correo','<form data-extra-form><label>Código recibido<input class="input" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><p role="alert"></p><button class="primary">Verificar</button></form>');
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();try{const value=await call('verifyEmail',{code:e.currentTarget.elements.code.value});d.close();paint(value);}catch(error){d.querySelector('[role=alert]').textContent=error.message;}};
   };
  }
  let working=false;
  async function perform(operation,data={}){
   if(working)return;working=true;message.textContent='Procesando…';
   try{
    const value=await call(operation,data);
    if(operation==='preview'){
     const d=opDialog('Tu resumen diario','');const pre=document.createElement('pre');pre.style.whiteSpace='pre-wrap';pre.textContent=value.text;d.append(pre);message.textContent='Vista previa generada; no se envió.';
    }else if(operation==='telegramLink'){
     message.textContent='Abrí Telegram, iniciá el bot, consultá el vínculo pendiente y confirmá tu cuenta.';
     const result=body.querySelector('[data-notification-result]');const a=document.createElement('a');a.textContent='Abrir Telegram para vincular';a.href=value.url;a.target='_blank';a.rel='noopener noreferrer';result.replaceChildren(a);
    }else{paint(value);message.textContent=operation==='emailCode'?'El proveedor aceptó el correo con el código. Revisá tu bandeja.':'Configuración actualizada.';}
   }catch(e){message.textContent=e.message;}finally{working=false;}
  }
  body.addEventListener('click',e=>{const b=e.target.closest('[data-notify]');if(b)perform(b.dataset.notify);});
  call().then(paint).catch(e=>{if(section.isConnected)message.textContent=e.message;});
  if(new URL(location.href).searchParams.get('notificaciones')==='cambios')section.scrollIntoView({block:'start'});
 }
})();
