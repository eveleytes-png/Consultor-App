/* Native anchors keep opening synchronous with the user's click. */
(function(root){
 function mobileEnvironment(nav={}){
  const ua=String(nav.userAgent||'');
  if(nav.userAgentData?.mobile===false||/Windows NT|CrOS|X11|Macintosh/i.test(ua))return false;
  return /Android|iPhone|iPad|iPod/i.test(ua);
 }
 function select(link,nav=root.navigator||{}){
  if(!link)return null;
  const raw=String(link).replaceAll('&amp;','&');
  const parsed=new URL(raw);
  const destination=parsed.protocol==='mercadopago:'?parsed.searchParams.get('url'):raw;
  const web=new URL(destination);
  if(web.protocol!=='https:'||web.hostname!=='www.mercadopago.com.ar')throw Error('Destino de Mercado Pago inválido.');
  return mobileEnvironment(nav)&&parsed.protocol==='mercadopago:'?{url:raw,target:'',rel:''}:{url:destination,target:'_blank',rel:'noopener noreferrer'};
 }
 function attributes(link,nav){
  const result=select(link,nav);if(!result)return '';
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  return 'href="'+escape(result.url)+'"'+(result.target?' target="_blank" rel="noopener noreferrer"':'');
 }
 function custId(seller,headers){
  const indices=headers.map((h,i)=>String(h??'').trim().toLowerCase().replace(/[\s_]/g,'')==='custidcomercio'?i:-1).filter(i=>i>=0);
  if(indices.length!==1)return '';
  const value=String(seller?.sourceValues?.[indices[0]]??'').trim();
  return /^\d+$/.test(value)?value:'';
 }
 const api={mobileEnvironment,select,attributes,custId};root.ConsultorMercadoPago=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
