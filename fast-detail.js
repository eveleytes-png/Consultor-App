/* Only explicit source identifiers can open a Mercado Pago seller detail. */
(function(root){
 function fastSellerDetail(seller,headers){
  const mp=root.ConsultorMercadoPago||(typeof require==='function'?require('./mercadopago-links.js'):null);
  const custId=mp.custId(seller,headers);
  if(!custId)return {url:null,reason:'Cust ID no disponible'};
  const url='https://www.mercadopago.com.ar/blue-hero/store/home?storeId='+custId;
  return {url:'mercadopago://webview?OPV=fend&webkit-engine=2&collaborator_validation_mode=fend&hides_bottom_bar=true&use_web_title=true&url='+encodeURIComponent(url),reason:''};
 }
 root.consultorFastSellerDetail=fastSellerDetail;
 if(typeof module!=='undefined'&&module.exports)module.exports={fastSellerDetail};
})(typeof window!=='undefined'?window:globalThis);
