const assert=require('node:assert/strict'),fs=require('node:fs');
const {fastSellerDetail}=require('../fast-detail.js');
const headers=['Mail','Cust_id comercio'];
const first={id:'internal-first',sourceValues:['first@example.test','267082501']};
const second={id:'internal-second',sourceValues:['second@example.test','176697488']};
for(const seller of [first,second,first]){
 const result=fastSellerDetail(seller,headers),deep=new URL(result.url),inner=new URL(deep.searchParams.get('url'));
 assert.equal(inner.href,'https://www.mercadopago.com.ar/blue-hero/store/home?storeId='+seller.sourceValues[1]);
 assert.equal(deep.searchParams.get('OPV'),'fend');assert.equal(deep.searchParams.get('webkit-engine'),'2');
 assert.equal(deep.searchParams.get('collaborator_validation_mode'),'fend');assert.equal(deep.searchParams.get('hides_bottom_bar'),'true');assert.equal(deep.searchParams.get('use_web_title'),'true');
 assert(result.url.endsWith(encodeURIComponent(inner.href)));assert(!result.url.includes('businessId'));
}
for(const value of ['',null,'sheet-mail:x','12a','12.0','-123']){
 const result=fastSellerDetail({id:'123',sourceValues:['x',value]},headers);
 assert.equal(result.url,null);assert.equal(result.reason,'Cust ID no disponible');
}
assert(fastSellerDetail({sourceValues:['x',' 123 ']},headers).url.includes(encodeURIComponent('storeId=123')));
for(const wrong of ['ID','CUIT','Cust_id_consultor'])assert.equal(fastSellerDetail(first,['Mail',wrong]).url,null);
assert.equal(fastSellerDetail(first,[...headers,'Cust_id comercio']).url,null);
const source=fs.readFileSync('customization.js','utf8');
const markup=source.slice(source.indexOf('const fast=window.consultorFastSellerDetail'),source.indexOf("const title=summary.querySelector"));
assert(markup.includes("summary.querySelector('.survey-buttons').insertAdjacentHTML('beforeend'"));
assert(markup.includes('class="mini" data-fast-detail ${window.ConsultorMercadoPago.attributes(fast.url)}'));
assert(markup.includes('disabled title="Cust ID no disponible"'));assert(!/target=|window.open|setTimeout/.test(markup));
assert(!source.includes('<div data-detail-body><div class="detail-tools">${fast.url?'));
console.log('PASS: two Android-verified Cust IDs and switching back; exact route and parameters; no businessId; missing/invalid IDs disabled; mini action beside survey buttons, direct anchor.');