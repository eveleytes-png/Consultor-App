// Resolved coordinates remain in memory; source cells and exports are untouched.
const sellerGeocodes=new Map();
let geolocationEpoch=0;
function sellerAddress(s){
 const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 if(typeof portfolioHeaders==='undefined')return '';
 const col=portfolioHeaders.findIndex(h=>['direccion','direccion comercio','direccion del comercio'].includes(norm(h)));
 return col<0?'':String(s.sourceValues?.[col]??'');
}
function sellerCoordinates(s){
 const primary=parseLatLog(s.latlog);if(primary)return primary;
 const hit=sellerGeocodes.get(String(s.id));
 return hit&&hit.address===sellerAddress(s)&&hit.until>Date.now()?hit.coordinates:null;
}
window.clearSellerGeocodes=()=>{geolocationEpoch++;sellerGeocodes.clear();};
window.resolveSellerLocations=async function(load){
 const epoch=++geolocationEpoch;
 const candidates=sellers.filter(s=>{
  const key=String(s.id),address=sellerAddress(s),hit=sellerGeocodes.get(key);
  if(parseLatLog(s.latlog)||!address){sellerGeocodes.delete(key);return false;}
  return !hit||hit.address!==address||hit.until<=Date.now();
 });
 // Clear obsolete coordinates before any asynchronous request can return.
 for(const s of candidates)sellerGeocodes.delete(String(s.id));
 for(let i=0;i<candidates.length;i+=5){
  if(epoch!==geolocationEpoch)return;
  const batch=candidates.slice(i,i+5),addresses=new Map(batch.map(s=>[String(s.id),sellerAddress(s)]));let results=[];
  try{results=(await load(batch.map(s=>String(s.id)))).results||[];}catch{}
  if(epoch!==geolocationEpoch)return;
  for(const s of batch){
   const current=sellers.find(row=>String(row.id)===String(s.id)),address=addresses.get(String(s.id));
   if(!current||parseLatLog(current.latlog)||sellerAddress(current)!==address)continue;
   const r=results.find(r=>String(r.sellerId)===String(s.id)&&r.address===address);
   const coords=r?.status==='resolved'&&Array.isArray(r.coordinates)?parseLatLog(r.coordinates.join(',')):null;
   sellerGeocodes.set(String(s.id),{address,coordinates:coords,until:Date.now()+(r&&r.status!=='unavailable'?86400000:60000)});
  }
  if(page==='sellers'&&document.querySelector('#seller-results'))renderSellerResults();
  window.refreshUnlocatedSellers?.();window.refreshOpenSellerDetails?.();
 }
};
