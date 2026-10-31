// Shared pure composition. The authenticated notification service supplies fresh
// validated records. This module grants no access and performs no delivery.
import portfolio from '../home.js';
const {computePortfolio,activitiesOnDate,surveyOlderThan}=portfolio;
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
  const pending=date=>activitiesOnDate(activities,date).filter(a=>!a.completed).sort((a,b)=>a.time.localeCompare(b.time)).map(a=>({time:a.time,description:a.description}));
  return {
    date:local.date,night:local.hour>=20,
    greeting:local.hour<12?'Buenos días':local.hour<20?'Buenas tardes':'Buenas noches',
    surveyFollowUp:countSurveyFollowUp(rows,now),
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

// Use exactly the age predicate used by filteredSellers; stale dated surveys
// qualify regardless of the separate valid-survey filter. Import rejects duplicate
// identities; also guard here against counting the same merchant twice.
export function countSurveyFollowUp(rows,now=new Date()){
 const ids=new Set(),mails=new Set();let over12=0,over18=0;
 for(const row of rows){
  const mail=portfolio.normalizeAnswer(row.e??row.Mail),id=String(row.id??'').trim();
  if(!mail||(id&&ids.has(id))||mails.has(mail))continue;
  if(id)ids.add(id);mails.add(mail);
  if(surveyOlderThan(row.d,12,now))over12++;
  if(surveyOlderThan(row.d,18,now))over18++;
 }
 return {over12,over18};
}
// Email presentation is separate from the shared/Telegram plain-text composer.
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function composeDailyEmail(summary,origin){
 // Reuse origin validation and existing navigation destinations.
 composeDailyText(summary,origin);
 const base=new URL(origin),url=query=>new URL(query,base).href;
 const links={changes:url('?pantalla=usuario&notificaciones=cambios'),acceptance:url('?pantalla=sellers&cartera=sin-aceptacion'),agenda:url('?pantalla=agenda')};
 const m=summary.metrics,follow=summary.surveyFollowUp||{over12:0,over18:0};
 const percentage=m.percentage===null?'Sin base de cálculo':new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(m.percentage)+'%';
 const goal=summary.maximumReached?'Llegaste al objetivo máximo del 100%.':summary.nextGoal?`Para llegar al ${summary.nextGoal.target}%, te faltan ${summary.nextGoal.missing} encuestas.`:'Sin comercios con aceptación para calcular el próximo objetivo.';
 const changes=summary.changes.additions||summary.changes.removals?`Hay ${summary.changes.additions} comercios para agregar y ${summary.changes.removals} para eliminar.`:'Tu cartera no presenta cambios pendientes.';
 const followLines=[12,18].filter(months=>follow['over'+months]>0).map(months=>`Tenés ${follow['over'+months]} comercios que llevan más de ${months} meses sin una encuesta realizada.`);
 const acceptance=m.rejected?`Tenés ${m.rejected} comercios pendientes de aceptación.`:'No tenés comercios pendientes de aceptación.';
 const agendaText=(title,items)=>[title,items.length?`${items.length} actividades pendientes:`:'No tenés actividades pendientes.',...items.slice(0,5).map(a=>`${a.time} · ${a.description.slice(0,140)}`),...(items.length>5?[`Y ${items.length-5} más en Consultor App.`]:[])].join('\n');
 const text=[`¡${summary.greeting}!\nEste es el resumen de tu cartera para hoy.`,`TU CARTERA EN NÚMEROS\nTotal de comercios: ${m.total}.\nComercios con aceptación: ${m.accepted}.\nEncuestas válidas sobre comercios con aceptación: ${percentage}.\n${goal}`,`IMPORTANTE · ACCIONES QUE REQUIEREN TU ATENCIÓN\n\nCambios en tu cartera\n${changes}${summary.changes.additions||summary.changes.removals?'\nRevisá los cambios detectados en la fuente sincronizada:\n'+links.changes:''}${followLines.length?'\n\nSeguimiento de encuestas\n'+followLines.join('\n'):''}`,`COMERCIOS PENDIENTES DE ACEPTACIÓN\n${acceptance}\n${links.acceptance}`,agendaText(summary.night?'PENDIENTES DE HOY':'TU AGENDA DE HOY',summary.today),...(summary.night?[agendaText('AGENDA DE MAÑANA',summary.tomorrow)]:[]),`Ver agenda completa\n${links.agenda}`].join('\n\n');
 const paragraph=value=>`<p style="margin:10px 0;color:#42566b;font-size:15px;line-height:1.6">${escape(value)}</p>`;
 const link=(label,href)=>`<a href="${escape(href)}" style="color:#007eb5;font-size:15px;font-weight:bold;text-decoration:underline">${escape(label)}</a>`;
 const heading=label=>`<h2 style="margin:0 0 16px;color:#15324f;font-size:20px;line-height:1.3">${escape(label)}</h2>`;
 const section=(label,content)=>`<tr><td style="padding:24px;border-bottom:1px solid #e5edf3">${heading(label)}${content}</td></tr>`;
 const card=(value,label)=>`<td width="50%" valign="top" style="padding:8px"><div style="padding:18px;background:#f0f8fc;border-radius:10px"><strong style="display:block;color:#006fa6;font-size:28px;line-height:1.2">${escape(value)}</strong><span style="display:block;margin-top:8px;color:#42566b;font-size:13px;line-height:1.5">${escape(label)}</span></div></td>`;
 const metrics=`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed"><tr>${card(m.total,'Comercios en cartera')}${card(m.accepted,'Comercios con aceptación')}</tr><tr>${card(percentage,'Encuestas válidas sobre comercios con aceptación')}${card(summary.nextGoal?summary.nextGoal.missing:summary.maximumReached?0:'—',goal)}</tr></table>`;
 const agendaHtml=items=>paragraph(items.length?`${items.length} actividades pendientes`:'No tenés actividades pendientes.')+(items.length?`<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items.slice(0,5).map(a=>`<tr><td valign="top" width="60" style="padding:12px 8px 12px 0;border-bottom:1px solid #e5edf3;color:#007eb5;font-size:15px;font-weight:bold">${escape(a.time)}</td><td style="padding:12px 0;border-bottom:1px solid #e5edf3;color:#42566b;font-size:15px;line-height:1.5;overflow-wrap:anywhere;word-break:break-word">${escape(a.description.slice(0,140))}</td></tr>`).join('')}</table>`:'')+(items.length>5?paragraph(`Y ${items.length-5} más en Consultor App.`):'');
 const important=`<h3 style="margin:0;font-size:16px;color:#15324f">Cambios en tu cartera</h3>${paragraph(changes)}${summary.changes.additions||summary.changes.removals?link('Revisar cambios de cartera',links.changes):''}${followLines.length?`<h3 style="margin:24px 0 0;font-size:16px;color:#15324f">Seguimiento de encuestas</h3>${followLines.map(line=>paragraph(line).replace(/Tenés (\d+) comercios/,'Tenés <strong>$1 comercios</strong>')).join('')}`:''}`;
 const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tu resumen diario · Consultor App</title></head><body style="margin:0;padding:0;background:#f3f7fa;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e5edf3;border-radius:14px;table-layout:fixed"><tr><td style="padding:28px 24px;background:#007eb5;color:#fff"><p style="margin:0 0 16px;font-size:13px;letter-spacing:1px">CONSULTOR APP</p><h1 style="margin:0 0 12px;font-size:26px">¡${escape(summary.greeting)}!</h1><p style="margin:0;font-size:16px;line-height:1.5">Este es el resumen de tu cartera para hoy.</p></td></tr>${section('Tu cartera en números',metrics)}${section('IMPORTANTE · Acciones que requieren tu atención',important)}${section('Comercios pendientes de aceptación',paragraph(acceptance)+link('Ver comercios pendientes',links.acceptance))}${section(summary.night?'Pendientes de hoy':'Tu agenda de hoy',agendaHtml(summary.today)+(summary.night?'':paragraph('')+link('Ver agenda completa',links.agenda)))}${summary.night?section('Agenda de mañana',agendaHtml(summary.tomorrow)+paragraph('')+link('Ver agenda completa',links.agenda)):''}<tr><td style="padding:20px 24px;color:#62758a;font-size:12px;line-height:1.5">Consultor App · Horario de Buenos Aires</td></tr></table></td></tr></table></body></html>`;
 return {text,html};
}
