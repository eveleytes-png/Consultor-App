const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{randomUUID}=require('crypto');
const main={innerHTML:'',querySelectorAll(){return [{dataset:{op:'seller-list'},setAttribute(k,v){this[k]=v;}},{dataset:{op:'seller-map'},setAttribute(k,v){this[k]=v;}}];}};
const ctx=vm.createContext({assert,console,crypto:{randomUUID},localStorage:{getItem:()=>null},setTimeout(){},normalizeAnswer:v=>String(v??'').trim().toLowerCase(),escapeHtml:String,document:{querySelector:()=>main}});
vm.runInContext('const sellers=[{id:"1",e:"one@example.com",n:"Uno",a:[],z:"Centro",s:"Norte",accept:"si",survey:"si"}];',ctx);
vm.runInContext(fs.readFileSync('dist/operations.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('dist/enhancements.js','utf8').split('\ninitOperations();')[0],ctx);
vm.runInContext(`
normalizeActionColor=v=>v;actionColorSelector=()=>'';icon=()=>'';renderSellerResults=()=>{};renderActionResults=()=>{};showOpNotice=()=>{};setupMemberSearch=()=>{};
page='sellers';sellerView='map';sellerSearch='Uno';sellerFilters.zones.add('Centro');renderOperations();
assert.match(document.querySelector().innerHTML,/class="selected"[^>]*data-op="seller-map"|data-op="seller-map"[^>]*class="selected"/);
assert.ok(document.querySelector().innerHTML.includes('value="Uno"'));assert.equal(filteredSellers().length,1);
page='acciones';renderOperations();page='sellers';renderOperations();assert.equal(sellerView,'map');assert.equal(sellerSearch,'Uno');assert.ok(sellerFilters.zones.has('Centro'));
sellerView='list';renderOperations();assert.match(document.querySelector().innerHTML,/class="selected"[^>]*data-op="seller-list"|data-op="seller-list"[^>]*class="selected"/);
let forms=[];opDialog=(title,html)=>{const f={elements:{name:{value:'Repetida'},color:{value:'red'},members:{value:'1'}}},error={textContent:''};forms.push({f,error,html});return {querySelector:s=>s==='form'?f:error,close(){}};};
actionRegistry=[{name:'Repetida',color:'blue'}];liveAssignments=[{id:'original',action:'Repetida',email:'one@example.com',color:'blue'}];
for(let i=0;i<2;i++){newActionDialog();const {f,error,html}=forms.at(-1);assert.ok(html.includes('autocomplete="off"'));f.onsubmit({preventDefault(){},currentTarget:f});assert.equal(error.textContent,'');}
assert.equal(actionRegistry.length,3);assert.equal(liveAssignments.length,3);assert.equal(liveAssignments[0].id,'original');assert.equal(new Set(liveAssignments.map(a=>a.id)).size,3);
`,ctx);
console.log('PASS: Sellers view/search/filters retained; repeated action names and same seller accepted; existing assignments intact.');
