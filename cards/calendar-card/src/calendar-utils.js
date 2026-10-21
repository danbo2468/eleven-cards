import {calendarDayStart} from '../../../shared/periods.js';

export const CALENDAR_COLORS=['#82adf5','#e7af67','#8ac6a6','#b99cf0','#eb8d9f','#80c6d6','#d8bd68','#a5b7d3'];
export const escapeCalendarHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function calendarRgb(value){
 if(Array.isArray(value))return [...value];
 if(typeof value!=='string'||!/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value))return null;
 const hex=value.length===4?value.slice(1).split('').map(ch=>ch+ch).join(''):value.slice(1);
 return [0,2,4].map(index=>parseInt(hex.slice(index,index+2),16));
}
export function calendarColor(value,fallback=CALENDAR_COLORS[0]){
 if(Array.isArray(value)&&value.length===3&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255))return `rgb(${value.join(',')})`;
 return typeof value==='string'&&/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)?value:fallback;
}
const validColor=value=>Array.isArray(value)&&value.length===3&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255)||typeof value==='string'&&/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value);
export function normalizeCalendarConfig(input={}, {draft=false}={}){
 const source=input.entities??input.calendars??[];
 if(!Array.isArray(source))throw Error('Calendars must be a list. / Agenda’s moeten een lijst zijn.');
 const entities=source.map((row,index)=>{
  const item=typeof row==='string'?{entity:row}:row&&typeof row==='object'&&!Array.isArray(row)?row:{};
  const color=item.color??calendarRgb(CALENDAR_COLORS[index%CALENDAR_COLORS.length]);
  if(!draft&&!validColor(color))throw Error('Choose an RGB color for each calendar. / Kies een RGB-kleur voor elke agenda.');
  return {...item,entity:item.entity??'',name:item.name??'',color:Array.isArray(color)?[...color]:color};
 });
 const days=input.days_to_show??5,view=input.view??'list',density=input.density??'expanded',weather=input.weather_entity??'';
 if(!draft){
  if(!entities.length||entities.length>12||entities.some(row=>!/^calendar\.[a-z0-9_]+$/.test(row.entity))||new Set(entities.map(row=>row.entity)).size!==entities.length)throw Error('Choose 1–12 different calendar entities. / Kies 1–12 verschillende agenda-entiteiten.');
  if(!Number.isInteger(days)||days<1||days>14)throw Error('Days must be 1–14. / Aantal dagen moet 1–14 zijn.');
  if(!['list','columns','month'].includes(view))throw Error('Choose list, columns or month. / Kies lijst, kolommen of maand.');
  if(!['expanded','compact'].includes(density))throw Error('Choose expanded or compact density. / Kies uitgebreide of compacte weergave.');
  if(weather&&!/^weather\.[a-z0-9_]+$/.test(weather))throw Error('Choose a weather entity. / Kies een weerentiteit.');
  for(const field of ['show_title','show_legend','show_navigation','hide_empty_days'])if(input[field]!==undefined&&typeof input[field]!=='boolean')throw Error(`${field} must be true or false.`);
 }
 const {show_view_switcher: _legacyViewSwitcher,...settings}=input;
 return {...settings,type:'custom:eleven-calendar-card',title:input.title??'',entities,weather_entity:weather,days_to_show:draft&&Object.hasOwn(input,'days_to_show')&&input.days_to_show===undefined?undefined:days,view,density,
  show_title:input.show_title!==false,show_legend:input.show_legend!==false,show_navigation:input.show_navigation!==false,hide_empty_days:input.hide_empty_days===true};
}
const dayMs=86400000,zoneFormats=new Map();
function dateFormatter(zone){
 let formatter=zoneFormats.get(zone);
 if(!formatter){formatter=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});zoneFormats.set(zone,formatter);}
 return formatter;
}
export function localCalendarDayKey(value,zone='UTC'){
 const t=typeof value==='number'?value:Date.parse(value);
 if(!Number.isFinite(t))return null;
 const parts=Object.fromEntries(dateFormatter(zone).formatToParts(t).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function nextCalendarDayKey(key,step=1){return new Date(Date.parse(`${key}T00:00:00Z`)+step*dayMs).toISOString().slice(0,10);}
const mondayIndex=nominal=>(new Date(nominal).getUTCDay()+6)%7;
export function calendarDisplayRange(view,daysToShow,offset,todayKey,zone='UTC'){
 const today=Date.parse(`${todayKey}T00:00:00Z`);
 let first,last,monthKey=null;
 if(view==='month'){
  const current=new Date(today),monthStart=Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+offset,1),nextMonth=Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+offset+1,1);
  first=monthStart-mondayIndex(monthStart)*dayMs;
  last=nextMonth+(6-mondayIndex(nextMonth-dayMs))*dayMs;
  monthKey=new Date(monthStart).toISOString().slice(0,10);
 }else{
  first=today+offset*daysToShow*dayMs;last=first+daysToShow*dayMs;
 }
 const count=Math.round((last-first)/dayMs),keys=Array.from({length:count},(_,index)=>new Date(first+index*dayMs).toISOString().slice(0,10));
 const startKey=keys[0],endKey=new Date(last).toISOString().slice(0,10);
 return {startKey,endKey,monthKey,keys,start:calendarDayStart(startKey,zone),end:calendarDayStart(endKey,zone)};
}
export function normalizeCalendarEvent(raw,calendar,zone='UTC'){
 if(!raw||typeof raw.start!=='string'||typeof raw.end!=='string')return null;
 const allDay=/^\d{4}-\d{2}-\d{2}$/.test(raw.start)&&/^\d{4}-\d{2}-\d{2}$/.test(raw.end);
 const start=allDay?calendarDayStart(raw.start,zone):Date.parse(raw.start),end=allDay?calendarDayStart(raw.end,zone):Date.parse(raw.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
 return {calendar,summary:String(raw.summary??''),description:String(raw.description??''),location:String(raw.location??''),allDay,
  start,end,startKey:allDay?raw.start:localCalendarDayKey(start,zone),endKey:allDay?raw.end:localCalendarDayKey(end-1,zone)};
}
export function calendarDaysWithEvents(range,eventsByEntity,entities,zone='UTC'){
 const events=entities.flatMap(row=>(eventsByEntity[row.entity]??[]).map(event=>normalizeCalendarEvent(event,row.entity,zone)).filter(Boolean));
 const days=range.keys.map(key=>({key,start:calendarDayStart(key,zone),end:calendarDayStart(nextCalendarDayKey(key),zone),events:[]}));
 for(const event of events){
  let low=0,high=days.length;
  while(low<high){const mid=(low+high)>>1;if(days[mid].end<=event.start)low=mid+1;else high=mid;}
  for(let index=low;index<days.length&&days[index].start<event.end;index++)days[index].events.push(event);
 }
 for(const day of days)day.events.sort((a,b)=>Number(b.allDay)-Number(a.allDay)||Math.max(a.start,day.start)-Math.max(b.start,day.start)||a.summary.localeCompare(b.summary));
 return days;
}
export function forecastByCalendarDay(forecast,zone='UTC'){
 const days=new Map();
 for(const entry of Array.isArray(forecast)?forecast:[]){
  const key=localCalendarDayKey(entry?.datetime,zone);
  if(key&&!days.has(key))days.set(key,entry);
 }
 return days;
}
export const calendarEventKey=event=>JSON.stringify([event.calendar,event.start,event.end,event.summary]);
export function nextCalendarEvent(events,now=Date.now()){
 return events.reduce((next,event)=>event.start>now&&(!next||event.start<next.start)?event:next,null);
}
