/* Profile and settings use separate routes; personal details never change notification destinations. */
(function(root){
 const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 function profileDraft(profile={},headers=[],rows=[]){
  profile=profile||{};const legacy=String(profile.name||'').trim().split(/\s+/).filter(Boolean);
  const indices=headers.map((h,i)=>String(h??'').toLowerCase().replace(/[\s_]/g,'')==='custidconsultor'?i:-1).filter(i=>i>=0);
  const sourceIds=indices.length===1?[...new Set(rows.map(s=>String(s.sourceValues?.[indices[0]]??'').trim()).filter(Boolean))]:[];
  return {firstName:profile.firstName??legacy[0]??'',lastName:profile.lastName??legacy.slice(1).join(' '),email:profile.email||'',custId:profile.custId??(sourceIds.length===1?sourceIds[0]:''),avatar:profile.avatar||''};
 }
 function avatarMarkup(profile={},initials=''){
  const avatar=String(profile?.avatar||'');
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)&&avatar.length<=400000?`<img src="${avatar}" alt="">`:escape(initials);
 }
 async function preparePhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Elegí una imagen JPG, PNG o WEBP.');
  if(file.size>5*1024*1024)throw Error('La imagen debe pesar como máximo 5 MB.');
  const url=URL.createObjectURL(file),image=new Image();
  try{
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('No pudimos leer la imagen. Elegí otro archivo.'));image.src=url;});
   const size=Math.max(image.naturalWidth,image.naturalHeight);
   if(!size)throw Error('La imagen no tiene un tamaño válido.');
   const canvas=document.createElement('canvas');
   const render=(limit,quality)=>{const ratio=Math.min(1,limit/size);canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',quality);};
   let result=render(512,.82);if(result.length>400000)result=render(256,.7);
   if(result.length>400000)throw Error('Elegí una imagen más pequeña.');
   return result;
  }finally{URL.revokeObjectURL(url);}
 }
 root.consultorProfileAvatar=avatarMarkup;
 root.renderConsultorProfile=function(){
  const main=document.querySelector('main');main.innerHTML='';main.classList.remove('settings-page');main.classList.add('user-profile-page');
  const draft=profileDraft(consultantSettings.profile,portfolioHeaders,sellers);
  const section=document.createElement('section');section.className='user-profile-panel';
  section.innerHTML=`<form data-user-profile data-extra-form><div class="user-profile-content"><span class="eyebrow">DATOS DEL CONSULTOR</span><h2>Información personal</h2><p class="user-profile-description">Tu nombre y apellido son los únicos datos obligatorios.</p><div class="user-profile-photo"><div class="user-profile-avatar" data-profile-avatar aria-label="Imagen de perfil"></div><div><strong>Imagen de perfil</strong><p>Opcional. JPG, PNG o WEBP de hasta 5 MB.</p><button type="button" class="profile-upload" data-upload-photo><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/></svg>Cargar imagen</button><input type="file" data-profile-file accept="image/jpeg,image/png,image/webp" hidden></div></div><div class="user-profile-fields"><label>Nombre <span aria-hidden="true">*</span><input class="input" name="firstName" autocomplete="given-name" required maxlength="100" value="${escape(draft.firstName)}"></label><label>Apellido <span aria-hidden="true">*</span><input class="input" name="lastName" autocomplete="family-name" required maxlength="100" value="${escape(draft.lastName)}"></label><label>Email<input class="input" name="email" type="email" autocomplete="email" maxlength="254" value="${escape(draft.email)}"></label><label>Cust ID consultor<input class="input" name="custId" maxlength="100" value="${escape(draft.custId)}"></label></div><p class="form-error" data-extra-error role="alert"></p><p class="profile-photo-status" data-photo-status role="status"></p></div><div class="user-profile-footer"><button class="primary" type="submit">Guardar cambios</button></div></form>`;
  main.append(section);const form=section.querySelector('form'),input=section.querySelector('[data-profile-file]'),submit=form.querySelector('[type="submit"]');let avatar=draft.avatar,preparing=false;
  const paintAvatar=()=>{const initials=[form.elements.firstName.value,form.elements.lastName.value].filter(Boolean).map(s=>s.trim()[0]||'').join('').toUpperCase()||'—';section.querySelector('[data-profile-avatar]').innerHTML=avatarMarkup({avatar},initials);};
  form.addEventListener('input',()=>{form.dataset.dirty='true';});form.elements.firstName.addEventListener('input',paintAvatar);form.elements.lastName.addEventListener('input',paintAvatar);paintAvatar();
  section.querySelector('[data-upload-photo]').onclick=()=>input.click();
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;preparing=true;form.dataset.dirty='true';submit.disabled=true;section.querySelector('[data-photo-status]').textContent='Preparando imagen…';form.querySelector('[data-extra-error]').textContent='';try{avatar=await preparePhoto(file);paintAvatar();section.querySelector('[data-photo-status]').textContent='Imagen lista. Guardá los cambios para conservarla.';}catch(error){form.querySelector('[data-extra-error]').textContent=error.message;section.querySelector('[data-photo-status]').textContent='';}finally{input.value='';preparing=false;submit.disabled=false;}};
  form.onsubmit=e=>{e.preventDefault();if(preparing||!form.reportValidity())return;if(!form.elements.firstName.value.trim()||!form.elements.lastName.value.trim()){extraError(form,'Completá nombre y apellido.');return;}saveExtra(form,{kind:'userProfile',firstName:form.elements.firstName.value.trim(),lastName:form.elements.lastName.value.trim(),email:form.elements.email.value.trim(),custId:form.elements.custId.value.trim(),avatar});};
 };
 if(typeof module!=='undefined'&&module.exports)module.exports={profileDraft,avatarMarkup};
})(typeof window!=='undefined'?window:globalThis);
