/* Shared Buenos Aires day clock; refresh dates without reloading the application. */
(function(root){
 const zone='America/Argentina/Buenos_Aires';
 function parts(now){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));}
 function key(now=new Date()){const p=parts(now);return `${p.year}-${p.month}-${p.day}`;}
 function untilMidnight(now=new Date()){const p=parts(now);return 86400000-(Number(p.hour)*3600000+Number(p.minute)*60000+Number(p.second)*1000+now.getUTCMilliseconds())+10;}
 root.ConsultorDayClock={key,untilMidnight};if(typeof module!=='undefined'&&module.exports)module.exports=root.ConsultorDayClock;
})(typeof window==='undefined'?globalThis:window);
if(typeof document!=='undefined')(()=>{
 let timer;
 function sync(){
  const next=window.ConsultorDayClock.key();if(next===todayKey)return;
  const previous=todayKey;todayKey=next;
  if(typeof calendarSelected!=='undefined'&&calendarSelected===previous&&!calendarActiveDate)calendarSelected=next;
  if((page==='inicio'||page==='agenda')&&state==='datos')refreshActivities();
  if(page==='sellers'&&state==='datos'&&sellerFilters.surveyAges.size)renderSellerResults();
  document.querySelectorAll('dialog[open].calendar-day-dialog').forEach(dialog=>{const rows=dialog.querySelector('[data-day-activities]');if(rows)rows.innerHTML=activityRows(dialog.dataset.day);});
  document.dispatchEvent(new CustomEvent('consultor-day-change',{detail:{previous,date:next}}));
 }
 function schedule(){clearTimeout(timer);sync();timer=setTimeout(schedule,window.ConsultorDayClock.untilMidnight());}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 window.addEventListener('focus',schedule);window.addEventListener('pageshow',schedule);
 // Handles clock adjustments and throttled/background timers without a page reload.
 setInterval(sync,30000);schedule();
})();
