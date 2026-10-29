export function validateUserProfile(change){
 const text=(key,max)=>{
  if(typeof change[key]!=='string'||change[key].length>max)throw Error('Datos de perfil inválidos.');
  return change[key].trim();
 };
 const firstName=text('firstName',100),lastName=text('lastName',100),email=text('email',254),custId=text('custId',100),avatar=text('avatar',400000);
 if(!firstName||!lastName)throw Error('Completá nombre y apellido.');
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Revisá el email de tu perfil.');
 if(avatar){
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(avatar);
  if(!match)throw Error('La imagen del perfil debe ser JPG, PNG o WEBP.');
  const bytes=Buffer.from(match[2],'base64');
  const valid=match[1]==='jpeg'?bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff:match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!valid)throw Error('El contenido de la imagen no es válido.');
 }
 return {name:firstName+' '+lastName,firstName,lastName,email,custId,avatar};
}
