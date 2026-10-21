// Shared pure composition. The authenticated notification service supplies fresh
// validated records. This module grants no access and performs no delivery.
import portfolio from '../home.js';
const {computePortfolio}=portfolio;
export const TIME_ZONE='America/Argentina/Buenos_Aires';
export function localDay(now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'
  }).formatToParts(now).map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour)};
}
export function buildDailySummary({rows,activities,changes,now=new Date()}){
  if(!Array.isArray(rows)||!rows.every(r=>r&&typeof r==='object'&&!Array.isArray(r)))throw Error('Cartera inválida');
  if(!Array.isArray(activities)||!activities.every(a=>a&&/^\d{4}-\d{2}-\d{2}$/.test(a.date)&&/^\d{2}:\d{2}$/.test(a.time)&&typeof a.description==='string'&&(a.completed===undefined||typeof a.completed==='boolean')))throw Error('Agenda inválida');
  // Unknown change state must never be silently reported as zero changes.
  if(!changes||!['additions','removals'].every(k=>Number.isSafeInteger(changes[k])&&changes[k]>=0))throw Error('Cambios no verificados');
  const local=localDay(now),metrics=computePortfolio(rows);
  const nextDate=new Date(local.date+'T12:00:00Z');nextDate.setUTCDate(nextDate.getUTCDate()+1);
  const tomorrow=nextDate.toISOString().slice(0,10);
  const pending=date=>activities.filter(a=>a.date===date&&!a.completed).slice().sort((a,b)=>a.time.localeCompare(b.time)).map(a=>({time:a.time,description:a.description}));
  return {
    date:local.date,night:local.hour>=20,
    greeting:local.hour<12?'Buenos días':local.hour<20?'Buenas tardes':'Buenas noches',
    metrics,nextGoal:metrics.percentage===null?null:metrics.goals.find(g=>g.target>metrics.percentage)??null,
    maximumReached:metrics.percentage===100,
    changes:{additions:changes.additions,removals:changes.removals},
    today:pending(local.date),tomorrow:local.hour>=20?pending(tomorrow):null
  };
}
export function composeDailyText(summary,origin){
  const base=new URL(origin);
  if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('Origen inválido');
  const m=summary.metrics;
  const percentage=m.percentage===null?'Sin base de cálculo':new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(m.percentage)+'%';
  const blocks=[`¡${summary.greeting}!\n\nEste es el resumen de tu jornada.`,
    `📊 ESTADO DE TU CARTERA\n\nAl día de hoy tenés ${m.total} comercios en tu cartera.\nComercios con aceptación: ${m.accepted}.\nPorcentaje de encuestas válidas sobre comercios con aceptación: ${percentage}.\n`+
    (summary.maximumReached?'Llegaste al objetivo máximo del 100%.':summary.nextGoal?`Para llegar al ${summary.nextGoal.target}%, te faltan ${summary.nextGoal.missing} encuestas.`:'Sin comercios con aceptación para calcular el próximo objetivo.')];
  if(summary.changes.additions||summary.changes.removals)blocks.push(`🔴 PRIORIDAD: CAMBIOS EN TU CARTERA\n\nHay ${summary.changes.additions} comercios para agregar y ${summary.changes.removals} para eliminar.\nRevisá los cambios detectados en la fuente sincronizada:\n${new URL('?pantalla=usuario&notificaciones=cambios',base).href}`);
  blocks.push(`🏪 COMERCIOS PENDIENTES DE ACEPTACIÓN\n\nTenés ${m.rejected} comercios pendientes de aceptación.\n${new URL('?pantalla=sellers&cartera=sin-aceptacion',base).href}`);
  const agenda=(title,items)=>`${title}\n\n`+(items.length?`${items.length} actividades pendientes: ${items.slice(0,5).map(a=>`${a.time} · ${a.description.slice(0,140)}`).join('; ')}${items.length>5?`; y ${items.length-5} más en Consultor App`:''}.`:'No tenés actividades pendientes.');
  blocks.push(agenda(summary.night?'🌙 PENDIENTES DE HOY':'📅 TU AGENDA DE HOY',summary.today));
  if(summary.night)blocks.push(agenda('📅 AGENDA DE MAÑANA',summary.tomorrow));
  blocks.push(new URL('?pantalla=agenda',base).href);
  return blocks.join('\n\n');
}
