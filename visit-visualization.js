/* Map-only visit preferences. Shared pure helpers also validate server requests. */
(function(root){
 const colors={black:'#292932',green:'#288450',red:'#cf5058',gray:'#8c8c9c'};
 const defaults=()=>({mode:'default',dateColumn:'',months:3});
 function parseDate(value){
  const text=String(value??'').trim();
  const local=/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?=$|\s|\()/.exec(text),iso=/^(\d{4})-(\d{2})-(\d{2})(?=$|T|\s)/.exec(text);
  if(!local&&!iso)return null;
  const [year,month,day]=local?[+local[3],+local[2],+local[1]]:[+iso[1],+iso[2],+iso[3]],date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?{year,month,day}:null;
 }
 function dateColumns(headers,rows){
  const placeholder=value=>/^(?:|[-—]|sin fecha|sin dato|n\/a)$/i.test(value);
  const dateShape=value=>/^(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})(?=$|T|\s|\()/.test(value);
  return headers.flatMap((header,index)=>{
   if(typeof header!=='string'||!header.trim()||headers.filter(h=>h===header).length!==1)return [];
   const values=rows.map(row=>String((Array.isArray(row)?row:row.sourceValues)?.[index]??'').trim()).filter(v=>!placeholder(v));
   return values.some(parseDate)&&values.every(dateShape)?[{header,index}]:[];
  });
 }
 function validate(value,columns){
  if(!value||!['default','manual'].includes(value.mode)||typeof value.dateColumn!=='string'||value.dateColumn.length>500||!Number.isSafeInteger(value.months)||value.months<1)throw Error('Ingresá una cantidad entera y positiva de meses.');
  if(value.mode==='manual'&&!columns.some(c=>c.header===value.dateColumn))throw Error('Seleccioná una columna de fechas disponible en tu cartera.');
  return {mode:value.mode,dateColumn:value.dateColumn,months:value.months};
 }
 function manualColor(s,settings,headers,now=new Date()){
  const norm=v=>String(v??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(norm(s.accept)==='no')return colors.black;
  const index=headers.indexOf(settings.dateColumn);
  if(index<0||headers.lastIndexOf(settings.dateColumn)!==index||!Number.isSafeInteger(settings.months)||settings.months<1)return colors.gray;
  const date=parseDate(s.sourceValues?.[index]);if(!date)return colors.gray;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'numeric'}).formatToParts(now).map(p=>[p.type,p.value]));
  const current=Number(parts.year)*12+Number(parts.month)-1,start=date.year*12+date.month-1;
  // The recorded month counts as month 1. Compare months, never elapsed days.
  return current-start<settings.months?colors.green:colors.red;
 }
 const api={colors,defaults,parseDate,dateColumns,validate,manualColor};
 root.ConsultorVisitVisualization=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
