/* Only explicit source identifiers can open a Mercado Pago seller detail. */
(function(root){
 function fastSellerDetail(seller,headers){
  const normalize=value=>String(value??'').trim().toLowerCase().replace(/[\s_]/g,'');
  function read(name){
   const indices=headers.map((header,index)=>normalize(header)===name?index:-1).filter(index=>index>=0);
   if(indices.length!==1)return '';
   const value=String(seller?.sourceValues?.[indices[0]]??'').trim();
   return /^[1-9]\d*$/.test(value)?value:'';
  }
  const custId=read('custidcomercio'),businessId=read('businessid');
  if(!custId||!businessId)return {url:null,reason:!custId&&!businessId?'Faltan Cust ID y businessId en los datos de este seller.':!custId?'Falta el Cust ID real de este seller.':'Falta businessId en los datos de este seller.'};
  const url='https://www.mercadopago.com.ar/multichannel/channel/cc/store?businessId='+businessId+'&custId='+custId;
  return {url:'mercadopago://webview?OPV=fend&webkit-engine=2&collaborator_validation_mode=fend&hides_bottom_bar=true&use_web_title=true&url='+encodeURIComponent(url),reason:''};
 }
 root.consultorFastSellerDetail=fastSellerDetail;
 if(typeof module!=='undefined'&&module.exports)module.exports={fastSellerDetail};
})(typeof window!=='undefined'?window:globalThis);
