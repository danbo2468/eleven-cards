import {uiButton,uiButtonStyles,uiEscape} from '../../../shared/ui-button.js';
import {uiTabs,bindUITabs,uiTabsStyles} from '../../../shared/ui-tabs.js';
import {uiPopup,bindUIPopup,uiPopupStyles} from '../../../shared/ui-popup.js';
import {cardHeaderIcon} from '../../../shared/card-header.js';

// Design prototypes only: no card registration, Home Assistant calls or real entities.
const componentStyle=document.createElement('style');componentStyle.textContent=uiButtonStyles()+uiTabsStyles()+uiPopupStyles();document.head.prepend(componentStyle);
const calendars={family:{name:'Gezin',entity:'calendar.gezin'},work:{name:'Werk',entity:'calendar.werk'},leisure:{name:'Vrije tijd',entity:'calendar.vrije_tijd'}};
const views=[
 {value:'list',label:'A · Daglijst',title:'A · Rustige daglijst',description:'Afspraken onder elkaar, gegroepeerd per dag. Het weer staat naast de datum; prettig voor een smalle kaart.'},
 {value:'columns',label:'B · Dagkolommen',title:'B · Dagen naast elkaar',description:'Elke dag heeft een eigen kolom met het weer bovenaan. Afspraken blijven compact; bij weinig ruimte kun je horizontaal schuiven.'},
 {value:'grid',label:'C · Tijdrooster',title:'C · Planning met tijdvakken',description:'Afspraken staan op hun begintijd en duren visueel even lang als in de agenda. Overlappende afspraken staan naast elkaar; hele dagen hebben een aparte rij.'}
];
const state={view:'list',days:5,width:1000,weather:'home',calendars:new Set(Object.keys(calendars)),offset:0};
const base=Date.UTC(2026,9,20),DAY=86400000,format=options=>new Intl.DateTimeFormat('nl-NL',{timeZone:'UTC',...options});
const dayMonth=format({day:'numeric',month:'short'}),weekday=format({weekday:'long'}),shortDay=format({weekday:'short'}),dateFull=format({weekday:'long',day:'numeric',month:'long',year:'numeric'});
const root=document.getElementById('examples');let disposers=[];
const minuteText=value=>`${Math.floor(value/60).toString().padStart(2,'0')}:${(value%60).toString().padStart(2,'0')}`;
const dayStamp=index=>base+index*DAY;
function dateName(index){return index===0?'Vandaag':index===1?'Morgen':weekday.format(dayStamp(index));}
function weatherIcon(condition){
 const sun='<circle cx="9" cy="8" r="3"/><path d="M9 1v2M9 13v2M2 8H0M16 8h2M3.3 2.3l1.4 1.4M13.3 12.3l1.4 1.4M3.3 13.7l1.4-1.4M13.3 3.7l1.4-1.4"/>';
 const cloud='<path d="M7 18a4 4 0 1 1 .8-7.9A5 5 0 0 1 17.5 12a3 3 0 1 1 .5 6Z"/>';
 return `<svg viewBox="0 0 24 24" aria-hidden="true">${condition==='sun'?'<g transform="translate(3 4)">'+sun+'</g>':condition==='cloud'?sun+cloud:cloud+'<path d="m9 21-1 2m5-2-1 2m5-2-1 2"/>'}</svg>`;
}
function weather(index){
 if(state.weather==='none')return '';
 const conditions=['cloud','rain','sun','cloud','sun','rain','cloud'],condition=conditions[((index%7)+7)%7],high=14+((index%4)+4)%4+(state.weather==='coast'?3:0),low=high-6;
 const label={cloud:'Halfbewolkt',sun:'Zonnig',rain:'Buien'}[condition];
 return `<span class="weather" title="${label} · maximaal ${high}°, minimaal ${low}°" aria-label="${label}, maximaal ${high} graden, minimaal ${low} graden">${weatherIcon(condition)}<span><b>${high}°</b><span class="low"> / ${low}°</span></span></span>`;
}
function eventsFor(index){
 const day=new Date(dayStamp(index)).getUTCDay(),events=[];
 const add=(calendar,title,start,end,location='',allDay=false)=>events.push({id:`${index}-${events.length}`,index,calendar,title,start,end,location,allDay});
 if(index>=0&&index<=2)add('family','Schoolvakantie',0,0,'',true);
 if(index>=3&&index<=5)add('family','Weekend weg · 23–25 okt',0,0,'Veluwe',true);
 if(day>=1&&day<=5){
  add('work','Dagstart',8*60+30,9*60,'Teams');
  if(day===2){add('family','Tandarts',10*60,10*60+45,'Centrum');add('work','Projectoverleg',13*60,14*60+30,'Kantoor');add('family','Pakket bezorgen',13*60+30,14*60,'Thuis');}
  if(day===3){add('work','Teamoverleg',9*60+30,10*60+30,'Kantoor');add('family','Kinderen ophalen',15*60,15*60+30,'School');}
  if(day===4){add('work','Bouwbespreking renovatie begane grond',11*60,12*60+30,'Op locatie');add('leisure','Hardlopen',18*60,19*60,'Park');}
  if(day===5)add('work','Weekafsluiting',14*60,15*60,'Kantoor');
  if(day===1)add('family','Boodschappen',17*60+30,18*60,'Supermarkt');
 }
 if(day===6)add('leisure','Fietsen',10*60,12*60,'Bos');
 if(day===0)add('family','Lunch met familie',12*60+30,14*60,'Bij opa en oma');
 return events.filter(event=>state.calendars.has(event.calendar)).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start-b.start);
}
function eventContent(event,{time=false,meta=true}={}){
 return `${time?`<span class="event-time">${event.allDay?'Hele dag':minuteText(event.start)+'–'+minuteText(event.end)}</span>`:''}<span class="event-title">${uiEscape(event.title)}</span>${meta?`<span class="event-meta">${calendars[event.calendar].name}${event.location?' · '+uiEscape(event.location):''}</span>`:''}`;
}
function eventButton(event,view,{time=false,meta=true,grid=false,style=''}={}){
 const description=`${event.title}, ${dateFull.format(dayStamp(event.index))}, ${event.allDay?'hele dag':minuteText(event.start)+' tot '+minuteText(event.end)}, ${calendars[event.calendar].name}`;
 return uiButton({variant:'text',className:`${grid?'time-event':'event-button'} ${event.calendar}`,content:eventContent(event,{time,meta}),label:description,title:description,attrs:{'data-event':event.id,'data-view':view,'aria-haspopup':'dialog','aria-controls':`event-popup-${view}-${event.id}`,style:style||null}});
}
function eventPopup(event,view){
 return uiPopup({id:`event-popup-${view}-${event.id}`,title:event.title,closeLabel:'Sluiten',content:`<div class="detail-calendar ${event.calendar}"><span class="dot"></span>${calendars[event.calendar].name}</div><p class="detail-time">${dateFull.format(dayStamp(event.index))}<br>${event.allDay?'Hele dag':minuteText(event.start)+'–'+minuteText(event.end)}</p>${event.location?`<p class="detail-location">${uiEscape(event.location)}</p>`:''}`});
}
function listContent(days){return `<div class="day-list">${days.map(day=>`<section class="list-day" data-day="${day.index}"><div class="day-heading"><div class="day-title">${dateName(day.index)}<time datetime="${new Date(dayStamp(day.index)).toISOString().slice(0,10)}">${dayMonth.format(dayStamp(day.index))}</time></div>${weather(day.index)}</div>${day.events.length?day.events.map(event=>`<div class="list-event"><div class="event-time ${event.allDay?'all-day':''}">${event.allDay?'Hele dag':minuteText(event.start)+`<small>${minuteText(event.end)}</small>`}</div>${eventButton(event,'list')}</div>`).join(''):'<p class="empty-day">Geen afspraken</p>'}</section>`).join('')}</div>`;}
function columnHeading(day){return `<div class="column-heading"><div>${shortDay.format(dayStamp(day.index))}<time>${dayMonth.format(dayStamp(day.index))}</time></div>${weather(day.index)}</div>`;}
function columnContent(days){return `<div class="horizontal" tabindex="0" role="region" aria-label="Dagen naast elkaar"><div class="day-columns" style="--days:${days.length}">${days.map(day=>`<section class="column" data-day="${day.index}">${columnHeading(day)}${day.events.length?day.events.map(event=>eventButton(event,'columns',{time:true})).join(''):'<p class="empty-day">Geen afspraken</p>'}</section>`).join('')}</div></div>`;}
function placeEvents(events){
 const result=[];let group=[],end=-1;
 const finish=()=>{const lanes=[];for(const event of group){let lane=lanes.findIndex(until=>until<=event.start);if(lane===-1)lane=lanes.length;lanes[lane]=event.end;event.lane=lane;}result.push(...group.map(event=>({...event,columns:lanes.length})));group=[];};
 for(const event of events.filter(event=>!event.allDay).map(event=>({...event})).sort((a,b)=>a.start-b.start||b.end-a.end)){if(event.start>=end){finish();end=-1;}group.push(event);end=Math.max(end,event.end);}finish();return result;
}
function gridContent(days){
 const hours=Array.from({length:12},(_,i)=>`<time style="top:${i*48}px">${i+8}:00</time>`).join('');
 return `<div class="horizontal" tabindex="0" role="region" aria-label="Tijdrooster van 8 tot 20 uur"><div class="week-grid" style="--days:${days.length}"><div class="week-head"><div></div>${days.map(columnHeading).join('')}</div><div class="all-day-row"><div class="all-day-label">Hele dag</div>${days.map(day=>`<div class="all-day-cell">${day.events.filter(event=>event.allDay).map(event=>eventButton(event,'grid',{meta:false})).join('')}</div>`).join('')}</div><div class="time-body"><div class="hours">${hours}</div>${days.map(day=>`<section class="time-lane" data-day="${day.index}" aria-label="${dateFull.format(dayStamp(day.index))}">${placeEvents(day.events).map(event=>eventButton(event,'grid',{grid:true,time:event.end-event.start>=60,meta:false,style:`top:${(event.start-480)*.8}px;height:${(event.end-event.start)*.8-2}px;left:calc(${event.lane/event.columns*100}% + 3px);width:calc(${100/event.columns}% - 6px)`})).join('')}</section>`).join('')}</div></div></div>`;
}
function cardContent(view,days){
 const range=dayMonth.format(dayStamp(state.offset))+'–'+dayMonth.format(dayStamp(state.offset+state.days-1));
 const button=(action,content,label)=>uiButton({content,label,title:label,attrs:{'data-action':action,'data-view':view}});
 const legend=[...state.calendars].map(key=>`<span class="${key}"><i class="dot"></i>${calendars[key].name}</span>`).join('');
 return `<div class="calendar-card" data-card="${view}"><header class="calendar-header"><h3>Agenda</h3><div class="header-actions"><div class="navigation"><span class="range">${range}</span>${button('previous',cardHeaderIcon('previous'),'Vorige dagen')}${button('today','Vandaag','Terug naar vandaag')}${button('next',cardHeaderIcon('next'),'Volgende dagen')}</div>${uiButton({content:cardHeaderIcon('info'),className:'info-trigger',label:'Informatie',attrs:{'data-info':view,'aria-haspopup':'dialog','aria-controls':'info-'+view}})}</div></header><div class="calendar-legend">${legend}</div>${state.calendars.size?(view==='list'?listContent(days):view==='columns'?columnContent(days):gridContent(days)):'<p class="no-calendars">Selecteer minimaal één agenda.</p>'}${uiPopup({id:'info-'+view,title:'Agenda’s en weer',closeLabel:'Sluiten',content:`<ul class="info-list">${[...state.calendars].map(key=>`<li>${calendars[key].name}</li>`).join('')}</ul><p class="popup-note">${state.days} dagen${state.weather==='none'?' · zonder weer':' · '+(state.weather==='home'?'Thuis':'Kust')}</p>`})}${days.flatMap(day=>day.events).map(event=>eventPopup(event,view)).join('')}</div>`;
}
function render(){
 disposers.forEach(dispose=>dispose());disposers=[];
 const days=Array.from({length:state.days},(_,n)=>({index:state.offset+n,events:eventsFor(state.offset+n)}));
 root.style.setProperty('--preview-width',state.width+'px');
 root.innerHTML=uiTabs({id:'calendar-views',label:'Agendaweergave',selected:state.view,items:views.map(view=>({value:view.value,label:view.label,content:`<div class="view-intro"><h2>${view.title}</h2><p>${view.description}</p></div><div class="stage">${cardContent(view.value,days)}</div>`}))});
 const controllers=[];
 const tabs=bindUITabs({tabs:root.querySelectorAll('[data-ui-tab]'),panels:root.querySelectorAll('[data-ui-tab-panel]'),onSelect:value=>{state.view=value;controllers.forEach(controller=>controller.close());}});disposers.push(()=>tabs.disconnect());
 for(const card of root.querySelectorAll('[data-card]')){
  const view=card.dataset.card,info=card.querySelector('#info-'+view),infoControl=bindUIPopup({trigger:card.querySelector('[data-info]'),popup:info,container:card.querySelector('.header-actions')});controllers.push(infoControl);disposers.push(()=>infoControl.disconnect());
  for(const button of card.querySelectorAll('[data-event]')){
   const control=bindUIPopup({trigger:button,popup:card.querySelector('#'+button.getAttribute('aria-controls')),container:card});
   controllers.push(control);disposers.push(()=>control.disconnect());
  }
 }
 for(const button of root.querySelectorAll('[data-action]'))button.onclick=()=>{state.offset=button.dataset.action==='today'?0:state.offset+(button.dataset.action==='previous'?-state.days:state.days);render();root.querySelector(`[data-card="${state.view}"] [data-action="${button.dataset.action}"]`)?.focus({preventScroll:true});};
}
document.getElementById('theme').onclick=()=>document.body.classList.toggle('light');
document.querySelector('.settings').onsubmit=event=>event.preventDefault();
document.getElementById('weather').onchange=e=>{state.weather=e.target.value;render();};
document.getElementById('days').oninput=e=>{const value=e.target.valueAsNumber;if(Number.isInteger(value)&&value>=1&&value<=14){state.days=value;render();}};
document.getElementById('width').onchange=e=>{state.width=Number(e.target.value);root.style.setProperty('--preview-width',state.width+'px');};
for(const checkbox of document.querySelectorAll('.calendar-toggle input'))checkbox.onchange=()=>{state.calendars=new Set([...document.querySelectorAll('.calendar-toggle input:checked')].map(input=>input.value));render();};
render();
