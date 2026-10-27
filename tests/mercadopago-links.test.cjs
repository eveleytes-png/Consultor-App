const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const mp=require('../mercadopago-links.js'),{fastSellerDetail}=require('../fast-detail.js');
const desktop={userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',userAgentData:{mobile:false}};
const android={userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile',userAgentData:{mobile:true}};
const iphone={userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile'};
const validator='mercadopago://webview?url='+encodeURIComponent('https://www.mercadopago.com.ar/resellers/business/validator?from=dashboard')+'&hides_bottom_bar=true&bar_visibility=visible';
const registration='mercadopago://webview?url='+encodeURIComponent('https://www.mercadopago.com.ar/resellers/business/new?from=dashboard')+'&hides_bottom_bar=true&bar_visibility=visible';
const maxwell='mercadopago://webview?hides_bottom_bar=true&bar_visibility=gone&keyboard_toolbar_enabled=false&status_bar_color=FFFFFF&url='+encodeURIComponent('https://www.mercadopago.com.ar/multichannel-conversations/operator/chats');
const headers=['Mail','Cust_id comercio'];
const source=fs.readFileSync('improvements.js','utf8');
const ctx={window:{ConsultorMercadoPago:mp},portfolioHeaders:headers};vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('window.consultorSurveyUrl='),source.indexOf('\nconst oldContactButtons')),ctx);
const links=[validator,registration,maxwell];
for(const id of ['267082501','176697488','267082501']){
 const seller={id:'internal-unrelated',hasMerchantId:true,sourceValues:['x',id]};
 const fast=fastSellerDetail(seller,headers).url,register=ctx.window.consultorSurveyUrl(seller,'register');
 assert.equal(new URL(new URL(fast).searchParams.get('url')).searchParams.get('storeId'),id);
 assert.equal(new URL(new URL(register).searchParams.get('url')).searchParams.get('sellerId'),id);
 links.push(fast,register);
}
assert.equal(ctx.window.consultorSurveyUrl({id:'12345',sourceValues:['x','']},'register'),null);
for(const deep of links){
 const expected=new URL(deep).searchParams.get('url');
 for(const nav of [desktop,{}, {userAgent:'unknown'}, {...android,userAgentData:{mobile:false}}, {...desktop,innerWidth:390}]){
  assert.equal(mp.select(deep,nav).url,expected);assert(mp.attributes(deep,nav).includes('target="_blank" rel="noopener noreferrer"'));
 }
 for(const nav of [android,iphone]){assert.equal(mp.select(deep,nav).url,deep);assert(!mp.attributes(deep,nav).includes('target='));}
}
const workspace=fs.readFileSync('workspace.js','utf8');
for(const nav of [desktop,android]){
 const browserMP={...mp,attributes:link=>mp.attributes(link,nav)};
 const shell={window:{ConsultorMercadoPago:browserMP},workspaceName:()=> 'Test',page:'inicio',escapeHtml:String,icon:()=>'',usefulLinks:[]};vm.createContext(shell);
 const a=workspace.indexOf(' const link='),b=workspace.indexOf('\n',workspace.indexOf(' function sidebarHTML(){',a));
 vm.runInContext(workspace.slice(a,b)+'\nglobalThis.html=sidebarHTML();',shell);
 for(const label of ['Validar comercio','Registrar comercio','Maxwell'])assert.equal(shell.html.split('<span>'+label+(label==='Maxwell'?'<small>':'</span>')).length-1,1);
 assert(shell.html.includes('Maxwell<small>Próximamente</small>'));
 assert.equal((shell.html.match(/target="_blank"/g)||[]).length,nav===desktop?3:0);
 assert.equal((shell.html.match(/mercadopago:\/\//g)||[]).length,nav===android?3:0);
}
console.log('PASS: all five actions, desktop/unknown HTTPS, Android deep links unchanged, iPhone selection only (device not verified), resize independence, exact per-seller Cust IDs and menu markup.');