import {calendarDayStart} from '../../../shared/periods.js';
import {uiButton,uiButtonStyles} from '../../../shared/ui-button.js';
import {uiPopup,bindUIPopup,uiPopupStyles} from '../../../shared/ui-popup.js';
import {uiLegend,bindUILegend,cancelUILegendClicks,focusUILegend} from '../../../shared/ui-legend.js';
import {cardHeaderIcon} from '../../../shared/card-header.js';
import {retryDelay} from '../../../shared/request.js';
import {CALENDAR_COLORS,calendarRgb,escapeCalendarHtml,calendarColor,normalizeCalendarConfig,localCalendarDayKey,nextCalendarDayKey,calendarDisplayRange,calendarDaysWithEvents,forecastByCalendarDay,calendarEventKey,nextCalendarEvent} from './calendar-utils.js';
import {calendarCardStyles} from './calendar-styles.js';

const isDutch=hass=>String(hass?.locale?.language??hass?.language??'en').startsWith('nl');
const words={
 calendarUnavailable:['Agenda niet beschikbaar','Calendar unavailable'],nextEvent:['Eerstvolgende afspraak','Next event'],
 title:['Agenda','Calendar'],list:['Daglijst','Day list'],columns:['Dagkolommen','Day columns'],month:['Maand','Month'],today:['Vandaag','Today'],tomorrow:['Morgen','Tomorrow'],
 now:['Nu','Now'],previous:['Vorige periode','Previous period'],next:['Volgende periode','Next period'],info:['Informatie','Information'],close:['Sluiten','Close'],
 allDay:['Hele dag','All day'],noEvents:['Geen afspraken','No events'],loading:['Afspraken laden…','Loading events…'],failed:['Afspraken konden niet worden geladen.','Could not load calendar events.'],
 retry:['Opnieuw','Retry'],select:['Kies een agenda in de configuratie.','Select a calendar in the editor.'],more:['meer','more'],weather:['Weer','Weather'],
 hideCalendar:['Verberg agenda','Hide calendar'],showCalendar:['Toon agenda','Show calendar'],allHidden:['Alle agenda’s zijn verborgen.','All calendars are hidden.'],
 soloHint:['Dubbelklik of Shift+Enter: toon alleen deze agenda. Herhaal om alle agenda’s te tonen.','Double-click or Shift+Enter: show only this calendar. Repeat to show all calendars.'],
 continuing:['Doorlopend','Continuing'],until:['Tot','Until'],from:['Vanaf','From'],
 appointments:['Afspraken','Events'],hidden:['Verborgen','Hidden'],noData:['Nog geen gegevens','No data yet'],
 nextAppointment:['Eerstvolgende','Next event'],location:['Locatie','Location'],description:['Beschrijving','Description']
};
const label=(key,dutch)=>words[key]?.[dutch?0:1]??key;
const fieldLabels={title:['Titel','Title'],view:['Weergave','View'],density:['Dichtheid','Density'],days_to_show:['Aantal dagen','Days to show'],weather_entity:['Weerentiteit','Weather entity'],
 show_title:['Titel tonen','Show title'],show_legend:['Agendalegenda tonen','Show calendar legend'],show_navigation:['Navigatie tonen','Show navigation'],hide_empty_days:['Lege dagen verbergen in daglijst','Hide empty days in day list'],
 entity:['Agenda','Calendar'],name:['Naam','Name'],color:['Kleur','Color']};
const fieldHelp={density:['Compact toont minder details; open een afspraak voor alle informatie.','Compact shows fewer details; open an event for full information.'],days_to_show:['Voor daglijst en dagkolommen; de maandweergave toont altijd een hele maand.','For list and columns; the month view always shows a full month.'],
 weather_entity:['Optioneel. Dagtemperaturen komen uit de dagelijkse voorspelling van deze weerentiteit.','Optional. Daily temperatures come from this weather entity’s daily forecast.'],
 color:['Kleur van afspraken en de legenda.','Color for events and the legend.']};
const selectorOptions=(dutch,items)=>({select:{mode:'dropdown',options:items.map(([value,nl,en])=>({value,label:dutch?nl:en}))}});

export class CalendarEditor extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});}
 setConfig(config){this._config=normalizeCalendarConfig(config,{draft:true});this._render();}
 set hass(hass){this._hass=hass;this._render();}get hass(){return this._hass;}
 _formDefinition(fields){const dutch=isDutch(this._hass);return {schema:fields,computeLabel:item=>fieldLabels[item.name]?.[dutch?0:1]??item.name,computeHelper:item=>fieldHelp[item.name]?.[dutch?0:1]};}
 _bind(form,fields,data){const definition=this._formDefinition(fields);form.hass=this._hass;form.schema=definition.schema;form.data=data;form.computeLabel=definition.computeLabel;form.computeHelper=definition.computeHelper;}
 _emit(){const entities=this._config.entities.filter(row=>row.entity).map(row=>({...row,color:Array.isArray(row.color)?[...row.color]:row.color}));this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...this._config,entities}},bubbles:true,composed:true}));}
 _render(){
  if(!this._config||!this._hass)return;
  const dutch=isDutch(this._hass);
  if(!this._form){
   this.shadowRoot.innerHTML=`<style>:host{display:block;min-width:0}ha-form{display:block;min-width:0}h3{font-size:16px;margin:24px 0 12px}details{border:1px solid var(--divider-color,#ddd);border-radius:10px;margin:10px 0;min-width:0}summary{padding:12px;min-height:44px;box-sizing:border-box;cursor:pointer;overflow-wrap:anywhere}.body{padding:0 12px 12px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}button{font:inherit;min-height:36px;border:1px solid var(--divider-color,#ddd);border-radius:6px;padding:6px 12px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#20252b);cursor:pointer}button:disabled{opacity:.4}.remove{margin-inline-start:auto}.error{font-size:12px;color:var(--error-color,#db4437);overflow-wrap:anywhere}.error[hidden]{display:none}button:focus-visible,summary:focus-visible{outline:2px solid var(--primary-color,#2196f3)}</style><ha-form class="global"></ha-form><h3></h3><div class="calendars"></div><button class="add" type="button"></button><p class="error" role="alert" hidden></p>`;
   this._form=this.shadowRoot.querySelector('.global');
   this._form.addEventListener('value-changed',event=>{event.stopPropagation();this._config=normalizeCalendarConfig({...this._config,...event.detail.value,entities:this._config.entities},{draft:true});this._render();this._emit();});
   this.shadowRoot.querySelector('.add').onclick=()=>{if(this._config.entities.length>=12)return;this._config={...this._config,entities:[...this._config.entities,{entity:'',name:'',color:calendarRgb(CALENDAR_COLORS[this._config.entities.length%CALENDAR_COLORS.length])}]};this._render();this.shadowRoot.querySelector('.calendars').lastElementChild.open=true;};
  }
  const global=CalendarCard.getConfigForm(dutch);this._form.hass=this._hass;this._form.schema=global.schema;this._form.data=this._config;this._form.computeLabel=global.computeLabel;this._form.computeHelper=global.computeHelper;
  this.shadowRoot.querySelector('h3').textContent=dutch?'Agenda’s':'Calendars';
  const add=this.shadowRoot.querySelector('.add');add.textContent=dutch?'Agenda toevoegen':'Add calendar';add.disabled=this._config.entities.length>=12;
  const container=this.shadowRoot.querySelector('.calendars');while(container.children.length>this._config.entities.length)container.lastElementChild.remove();
  this._config.entities.forEach((row,index)=>{
   let entry=container.children[index];
   if(!entry){entry=document.createElement('details');entry.open=this._config.entities.length===1;entry.innerHTML='<summary></summary><div class="body"><ha-form></ha-form><div class="actions"><button class="up" type="button"></button><button class="down" type="button"></button><button class="remove" type="button"></button></div></div>';container.append(entry);
    entry.querySelector('ha-form').addEventListener('value-changed',event=>{event.stopPropagation();const entities=this._config.entities.map((item,i)=>i===index?{...item,...event.detail.value}:item);this._config={...this._config,entities};this._render();this._emit();});
    for(const [action,delta] of [['up',-1],['down',1],['remove',0]])entry.querySelector('.'+action).onclick=()=>{const entities=[...this._config.entities];if(action==='remove')entities.splice(index,1);else{const other=index+delta;if(other<0||other>=entities.length)return;[entities[index],entities[other]]=[entities[other],entities[index]];}this._config={...this._config,entities};this._render();this._emit();};
   }
   entry.querySelector('summary').textContent=row.name||this._hass.states?.[row.entity]?.attributes?.friendly_name||row.entity||(dutch?'Nieuwe agenda':'New calendar');
   this._bind(entry.querySelector('ha-form'),[{name:'entity',required:true,selector:{entity:{domain:'calendar'}}},{name:'name',selector:{text:{}}},{name:'color',selector:{color_rgb:{}}}],{...row,color:calendarRgb(row.color)??row.color});
   for(const [action,nl,en] of [['up','Omhoog','Move up'],['down','Omlaag','Move down'],['remove','Verwijderen','Remove']]){const button=entry.querySelector('.'+action);button.textContent=dutch?nl:en;button.disabled=action==='up'?index===0:action==='down'?index===this._config.entities.length-1:false;}
  });
  const error=this.shadowRoot.querySelector('.error');try{if(this._config.entities.some(row=>row.entity))normalizeCalendarConfig(this._config);error.hidden=true;error.textContent='';}catch(problem){error.hidden=false;error.textContent=problem.message.split(' / ')[dutch?1:0]??problem.message;}
 }
}

export class CalendarCard extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});this._connected=false;this._calendarGeneration=0;this._weatherGeneration=0;this._calendarUnsubs=[];this._events={};this._statuses={};this._forecast=null;this._weatherError=false;this._view='list';this._offset=0;this._hiddenCalendars=new Set();this._legendClickTimers=new Map();this._popupControllers=[];this._todayKey=null;}
 static getConfigForm(dutch=false){return {schema:[
  {name:'title',selector:{text:{}}},{name:'view',default:'list',selector:selectorOptions(dutch,[['list','Daglijst','Day list'],['columns','Dagkolommen','Day columns'],['month','Maand','Month']])},
  {name:'density',default:'expanded',selector:selectorOptions(dutch,[['expanded','Uitgebreid','Expanded'],['compact','Compact','Compact']])},
  {name:'days_to_show',default:5,selector:{number:{min:1,max:14,step:1,mode:'box'}}},{name:'weather_entity',selector:{entity:{domain:'weather'}}},
  {type:'expandable',name:'appearance',title:dutch?'Weergave':'Appearance',flatten:true,schema:[{name:'show_title',default:true,selector:{boolean:{}}},{name:'show_legend',default:true,selector:{boolean:{}}},{name:'show_navigation',default:true,selector:{boolean:{}}},{name:'hide_empty_days',default:false,selector:{boolean:{}}}]}
 ],computeLabel:item=>fieldLabels[item.name]?.[dutch?0:1]??item.name,computeHelper:item=>fieldHelp[item.name]?.[dutch?0:1]};}
 static async getConfigElement(){
  if(!customElements.get('ha-form')){const helpers=await window.loadCardHelpers();const card=await helpers.createCardElement({type:'entities',entities:[]});await card.constructor.getConfigElement();await customElements.whenDefined('ha-form');}
  if(!customElements.get('eleven-calendar-editor'))customElements.define('eleven-calendar-editor',CalendarEditor);
  return document.createElement('eleven-calendar-editor');
 }
 static getStubConfig(hass){const entity=Object.keys(hass?.states??{}).find(id=>id.startsWith('calendar.'));return {entities:entity?[{entity,color:calendarRgb(CALENDAR_COLORS[0])}]:[],days_to_show:5,view:'list'};}
 setConfig(input){
  const empty=!input?.entities?.length&&!input?.calendars?.length;
  const config=normalizeCalendarConfig(input,{draft:empty}),previous=this._config,wasEmpty=this._emptyConfig;
  if(!empty)normalizeCalendarConfig(input);
  this._cancelLegendClicks();
  this._config=config;this._emptyConfig=empty;
  this._hiddenCalendars=new Set(config.show_legend?config.entities.map(row=>row.entity).filter(id=>this._hiddenCalendars.has(id)):[]);
  const priorIds=previous?.entities?.map(row=>row.entity).join('|'),nextIds=config.entities.map(row=>row.entity).join('|');
  if(!previous||previous.view!==config.view)this._view=config.view;
  if(!previous||previous.days_to_show!==config.days_to_show||previous.view!==config.view)this._offset=0;
  if(this._connected&&this._hass){
   if(empty){this._stopCalendars();this._stopWeather();}
   else{if(priorIds!==nextIds||previous?.days_to_show!==config.days_to_show||previous?.view!==config.view)this._startCalendars();
    if(wasEmpty||previous?.weather_entity!==config.weather_entity)this._startWeather();}
  }
  this._render();
 }
 set hass(hass){
  const previous=this._hass,zone=hass?.config?.time_zone||'UTC',oldZone=previous?.config?.time_zone||'UTC',connectionChanged=previous?.connection!==hass?.connection;
  this._hass=hass;
  const context=JSON.stringify([this._config?.entities?.map(row=>[hass?.states?.[row.entity]?.attributes?.friendly_name,hass?.states?.[row.entity]?.state]),this._config?.weather_entity&&[hass?.states?.[this._config.weather_entity]?.state,hass?.states?.[this._config.weather_entity]?.attributes?.temperature,hass?.states?.[this._config.weather_entity]?.attributes?.temperature_unit]]);
  const displayChanged=context!==this._displayContext;this._displayContext=context;
  const today=localCalendarDayKey(Date.now(),zone);
  if(this._todayKey!==today){this._todayKey=today;this._offset=0;if(this._connected&&this._config&&!this._emptyConfig)this._startCalendars();}
  else if(this._connected&&this._config&&!this._emptyConfig&&(connectionChanged||zone!==oldZone))this._startCalendars();
  if(this._connected&&this._config&&!this._emptyConfig&&(connectionChanged||zone!==oldZone))this._startWeather();
  if(!previous||zone!==oldZone||isDutch(previous)!==isDutch(hass)||connectionChanged||displayChanged)this._render();
  this._scheduleMidnight();
 }
 get hass(){return this._hass;}
 connectedCallback(){this._connected=true;this._todayKey=localCalendarDayKey(Date.now(),this._zone());if(this._config&&!this._emptyConfig){this._startCalendars();this._startWeather();}this._scheduleMidnight();this._render();}
 disconnectedCallback(){this._connected=false;this._cancelLegendClicks();this._stopCalendars();this._stopWeather();this._cleanupUI();clearTimeout(this._midnightTimer);this._midnightTimer=null;clearTimeout(this._nextEventTimer);this._nextEventTimer=null;}
 getCardSize(){const compact=this._config?.density==='compact';return this._view==='month'?(compact?11:14):this._view==='columns'?(compact?6:8):Math.max(3,Math.ceil(((compact?105:130)+(this._config?.days_to_show??5)*(compact?70:100))/50));}
 getGridOptions(){return {columns:12,min_columns:6,rows:Math.max(3,Math.ceil(this.getCardSize()*50/64)),min_rows:3};}
 _zone(){return this._hass?.config?.time_zone||'UTC';}
 _queueRender(){if(this._renderQueued)return;this._renderQueued=true;queueMicrotask(()=>{this._renderQueued=false;if(this._connected)this._render();});}
 _range(){const today=this._todayKey??=localCalendarDayKey(Date.now(),this._zone());return calendarDisplayRange(this._view,this._config?.days_to_show??5,this._offset,today,this._zone());}
 _stopCalendars(){this._calendarGeneration++;clearTimeout(this._calendarRetryTimer);this._calendarRetryTimer=null;for(const unsubscribe of this._calendarUnsubs)try{unsubscribe();}catch{}this._calendarUnsubs=[];}
 _retryCalendars(){if(this._calendarRetryTimer||!this._connected)return;const generation=this._calendarGeneration;this._calendarRetryFailures=(this._calendarRetryFailures??0)+1;this._calendarRetryTimer=setTimeout(()=>{this._calendarRetryTimer=null;if(this._connected&&generation===this._calendarGeneration&&Object.values(this._statuses).includes('error')){this._startCalendars();this._queueRender();}},retryDelay(this._calendarRetryFailures,30000));this._calendarRetryTimer.unref?.();}
 _startCalendars(){
  this._stopCalendars();if(!this._connected||!this._hass||!this._config||this._emptyConfig)return;
  const generation=this._calendarGeneration,range=this._range(),connection=this._hass.connection;
  const rangeKey=`${range.start}/${range.end}`;this._events=this._eventRangeKey===rangeKey?Object.fromEntries(this._config.entities.filter(row=>this._events[row.entity]).map(row=>[row.entity,this._events[row.entity]])):{};this._eventRangeKey=rangeKey;
  this._statuses=Object.fromEntries(this._config.entities.map(row=>[row.entity,'loading']));
  for(const row of this._config.entities){
   const entity=row.entity;
   if(typeof connection?.subscribeMessage!=='function'){this._statuses[entity]='error';this._retryCalendars();continue;}
   try{
    const promise=connection.subscribeMessage(payload=>{
     if(!this._connected||generation!==this._calendarGeneration)return;
     const events=payload?.event?.events??payload?.events;
     this._statuses[entity]=Array.isArray(events)?'ready':'error';if(Array.isArray(events)){this._events[entity]=events;this._eventRevision=(this._eventRevision??0)+1;if(Object.values(this._statuses).every(status=>status==='ready')){this._calendarRetryFailures=0;clearTimeout(this._calendarRetryTimer);this._calendarRetryTimer=null;}}else this._retryCalendars();this._queueRender();
    },{type:'calendar/event/subscribe',entity_id:entity,start:new Date(range.start).toISOString(),end:new Date(range.end).toISOString()});
    Promise.resolve(promise).then(unsubscribe=>{if(typeof unsubscribe!=='function')return;if(!this._connected||generation!==this._calendarGeneration)unsubscribe();else this._calendarUnsubs.push(unsubscribe);},()=>{if(this._connected&&generation===this._calendarGeneration){this._statuses[entity]='error';this._retryCalendars();this._queueRender();}});
   }catch{this._statuses[entity]='error';this._retryCalendars();}
  }
 }
 _stopWeather(){this._weatherGeneration++;clearTimeout(this._weatherRetryTimer);this._weatherRetryTimer=null;this._weatherUnsub?.();this._weatherUnsub=null;}
 _retryWeather(){if(this._weatherRetryTimer||!this._connected)return;const generation=this._weatherGeneration;this._weatherRetryFailures=(this._weatherRetryFailures??0)+1;this._weatherRetryTimer=setTimeout(()=>{this._weatherRetryTimer=null;if(this._connected&&generation===this._weatherGeneration&&this._weatherError)this._startWeather();},retryDelay(this._weatherRetryFailures,30000));this._weatherRetryTimer.unref?.();}
 _startWeather(){
  this._stopWeather();if(this._forecastEntity!==this._config?.weather_entity)this._forecast=null;this._forecastEntity=this._config?.weather_entity;this._weatherError=false;
  if(!this._connected||!this._hass||!this._config?.weather_entity)return;
  const generation=this._weatherGeneration,entity=this._config.weather_entity,state=this._hass.states?.[entity],legacy=state?.attributes?.forecast;
  if(Array.isArray(legacy))this._forecast=legacy;
  const subscribe=this._hass.connection?.subscribeMessage;
  if(typeof subscribe!=='function'){this._weatherError=!this._forecast?.length;if(this._weatherError)this._retryWeather();return;}
  try{
   const promise=subscribe.call(this._hass.connection,payload=>{
    if(!this._connected||generation!==this._weatherGeneration)return;
    if(Array.isArray(payload?.forecast)){this._forecast=payload.forecast;this._weatherError=false;this._weatherRetryFailures=0;clearTimeout(this._weatherRetryTimer);this._weatherRetryTimer=null;}
    else{this._weatherError=true;this._retryWeather();}
    this._queueRender();
   },{type:'weather/subscribe_forecast',forecast_type:'daily',entity_id:entity});
   Promise.resolve(promise).then(unsubscribe=>{if(typeof unsubscribe!=='function')return;if(!this._connected||generation!==this._weatherGeneration)unsubscribe();else this._weatherUnsub=unsubscribe;},()=>{if(this._connected&&generation===this._weatherGeneration){this._weatherError=true;this._retryWeather();this._queueRender();}});
  }catch{this._weatherError=true;this._retryWeather();}
 }
 _scheduleMidnight(){
  clearTimeout(this._midnightTimer);if(!this._connected||!this._hass)return;
  const today=localCalendarDayKey(Date.now(),this._zone()),next=calendarDayStart(nextCalendarDayKey(today),this._zone());
  this._midnightTimer=setTimeout(()=>{const current=localCalendarDayKey(Date.now(),this._zone());if(current!==this._todayKey){this._todayKey=current;this._offset=0;this._startCalendars();this._render();}this._scheduleMidnight();},Math.max(1000,Math.min(86400000,next-Date.now()+100)));
 }
 _calendarName(entity){const row=this._config.entities.find(item=>item.entity===entity);return row?.name||this._hass?.states?.[entity]?.attributes?.friendly_name||entity;}
 _calendarFailed(entity){return this._statuses[entity]==='error'||['unavailable','unknown'].includes(this._hass?.states?.[entity]?.state);}
 _updateNextEvent(){
  this._nextEvent=nextCalendarEvent(this._displayEvents??[]);
  const next=this._nextEvent?calendarEventKey(this._nextEvent):null;
  for(const button of this.shadowRoot.querySelectorAll('[data-calendar-event]')){
   const selected=button.dataset.calendarEvent===next;
   button.toggleAttribute('data-next-event',selected);
   if(selected)button.setAttribute('aria-description',label('nextEvent',isDutch(this._hass)));else button.removeAttribute('aria-description');
  }
  clearTimeout(this._nextEventTimer);this._nextEventTimer=null;
  if(this._connected&&this._nextEvent)this._nextEventTimer=setTimeout(()=>this._updateNextEvent(),Math.max(1,Math.min(2147483647,this._nextEvent.start-Date.now()+1)));
 }
 _eventColor(entity){return calendarColor(this._config.entities.find(item=>item.entity===entity)?.color);}
 _cancelLegendClicks(){cancelUILegendClicks(this);}
 _focusLegend(id){focusUILegend(this,id,'[data-calendar]',button=>button.dataset.calendar);}
 _toggleCalendar(id){if(!this._config.show_legend||!this._config.entities.some(row=>row.entity===id))return;
  if(this._hiddenCalendars.has(id))this._hiddenCalendars.delete(id);else this._hiddenCalendars.add(id);
  this._render();this._focusLegend(id);
 }
 _toggleCalendarIsolation(id){if(!this._config.show_legend||!this._config.entities.some(row=>row.entity===id))return;
  this._cancelLegendClicks();
  const only=this._config.entities.every(row=>this._hiddenCalendars.has(row.entity)===(row.entity!==id));
  this._hiddenCalendars=only?new Set():new Set(this._config.entities.filter(row=>row.entity!==id).map(row=>row.entity));
  this._render();this._focusLegend(id);
 }
 _formatter(options){return new Intl.DateTimeFormat(isDutch(this._hass)?'nl-NL':'en-GB',options);}
 _dayFormatter(options){return this._formatter({timeZone:'UTC',...options});}
 _time(value){return this._formatter({timeZone:this._zone(),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(value);}
 _dayTitle(key){const dutch=isDutch(this._hass);if(key===this._todayKey)return label('today',dutch);if(key===nextCalendarDayKey(this._todayKey))return label('tomorrow',dutch);return this._dayFormatter({weekday:'long'}).format(Date.parse(`${key}T12:00:00Z`));}
 _eventTime(event,day){
  const dutch=isDutch(this._hass);if(event.allDay)return label('allDay',dutch);
  if(event.start<day.start&&event.end>day.end)return label('continuing',dutch);
  if(event.start<day.start)return `${label('until',dutch)} ${this._time(event.end)}`;
  if(event.end>day.end)return `${label('from',dutch)} ${this._time(event.start)}`;
  return `${this._time(event.start)}–${this._time(event.end)}`;
 }
 _weatherIcon(condition){
  const sun='<circle cx="9" cy="8" r="3"/><path d="M9 1v2M9 13v2M2 8H0M16 8h2M3.3 2.3l1.4 1.4M13.3 12.3l1.4 1.4M3.3 13.7l1.4-1.4M13.3 3.7l1.4-1.4"/>';
  const cloud='<path d="M7 18a4 4 0 1 1 .8-7.9A5 5 0 0 1 17.5 12a3 3 0 1 1 .5 6Z"/>';
  const kind=/rain|pouring|lightning|hail|snow/.test(condition)?'rain':/cloud|fog/.test(condition)?'cloud':'sun';
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${kind==='sun'?`<g transform="translate(3 4)">${sun}</g>`:kind==='cloud'?sun+cloud:cloud+'<path d="m9 20-1 2m5-2-1 2m5-2-1 2"/>'}</svg>`;
 }
 _weatherFor(key,forecast){
  if(!this._config.weather_entity)return '';
  const row=forecast.get(key),state=this._hass?.states?.[this._config.weather_entity],current=key===this._todayKey?state:null;
  if(!row&&!current)return '';
  const high=Number(row?.temperature??current?.attributes?.temperature),low=row?.templow==null?NaN:Number(row.templow),condition=String(row?.condition??current?.state??''),unit=state?.attributes?.temperature_unit??'°';
  if(!Number.isFinite(high))return '';
  const text=`${Math.round(high)}${unit}`,description=`${condition||label('weather',isDutch(this._hass))}, ${text}${Number.isFinite(low)?` / ${Math.round(low)}${unit}`:''}`;
  return `<span class="weather" title="${escapeCalendarHtml(description)}" aria-label="${escapeCalendarHtml(description)}">${this._weatherIcon(condition)}<span><b>${escapeCalendarHtml(text)}</b>${Number.isFinite(low)?`<span class="low"> / ${Math.round(low)}${escapeCalendarHtml(unit)}</span>`:''}</span></span>`;
 }
 _detailTime(event){
  const dutch=isDutch(this._hass),options={weekday:'long',day:'numeric',month:'long',year:'numeric'};
  if(event.allDay){
   const format=this._dayFormatter(options),first=event.startKey,last=nextCalendarDayKey(event.endKey,-1);
   return `<div class="popup-date"><time datetime="${first}">${escapeCalendarHtml(format.format(Date.parse(`${first}T12:00:00Z`)))}</time>${last!==first?`<span class="popup-date-separator">–</span><time datetime="${last}">${escapeCalendarHtml(format.format(Date.parse(`${last}T12:00:00Z`)))}</time>`:''}</div><div class="popup-time">${label('allDay',dutch)}</div>`;
  }
  const format=this._formatter({timeZone:this._zone(),...options}),startKey=localCalendarDayKey(event.start,this._zone()),endKey=localCalendarDayKey(event.end,this._zone());
  if(startKey===endKey)return `<div class="popup-date"><time datetime="${new Date(event.start).toISOString()}">${escapeCalendarHtml(format.format(event.start))}</time></div><div class="popup-time">${escapeCalendarHtml(this._time(event.start))}–${escapeCalendarHtml(this._time(event.end))}</div>`;
  return `<div class="popup-date-range"><time datetime="${new Date(event.start).toISOString()}">${escapeCalendarHtml(format.format(event.start))} · ${escapeCalendarHtml(this._time(event.start))}</time><span class="popup-date-separator">–</span><time datetime="${new Date(event.end).toISOString()}">${escapeCalendarHtml(format.format(event.end))} · ${escapeCalendarHtml(this._time(event.end))}</time></div>`;
 }
 _eventButton(event,day,variant='list'){
  const dutch=isDutch(this._hass),name=this._calendarName(event.calendar),title=event.summary||(dutch?'Afspraak':'Event'),time=this._eventTime(event,day),id=`calendar-event-${this._popupSeq++}`;
  const content=variant==='month'?`${!event.allDay?`<span>${escapeCalendarHtml(this._time(event.start))} </span>`:''}${escapeCalendarHtml(title)}`:
   `${variant==='columns'?`<span class="event-time">${escapeCalendarHtml(time)}</span>`:''}<span class="event-title">${escapeCalendarHtml(title)}</span><span class="event-meta">${escapeCalendarHtml(name)}${event.location?' · '+escapeCalendarHtml(event.location):''}</span>`;
  const popup=uiPopup({id,title,className:'calendar-event-popup',closeLabel:label('close',dutch),content:`<div class="popup-calendar" style="--event-color:${this._eventColor(event.calendar)}"><i class="dot"></i>${escapeCalendarHtml(name)}</div><div class="popup-when">${this._detailTime(event)}</div>${event.location?`<div class="popup-field"><span class="popup-field-label">${label('location',dutch)}</span><div class="popup-location">${escapeCalendarHtml(event.location)}</div></div>`:''}${event.description?`<div class="popup-field"><span class="popup-field-label">${label('description',dutch)}</span><div class="popup-description">${escapeCalendarHtml(event.description)}</div></div>`:''}`});
  this._popupMarkup.push(popup);
  return uiButton({variant:'text',className:variant==='month'?'month-chip':'event-button',content,label:`${title}, ${time}, ${name}`,title:`${title} · ${time}`,attrs:{'data-event-popup-id':id,'data-calendar-event':calendarEventKey(event),'aria-controls':id,'aria-haspopup':'dialog',style:`--event-color:${this._eventColor(event.calendar)}`}});
 }
 _list(days,forecast){
  const short=this._dayFormatter({day:'numeric',month:'short'}),dutch=isDutch(this._hass);
  if(this._config.hide_empty_days)days=days.filter(day=>day.events.length);
  if(!days.length)return `<p class="status" role="status">${label('noEvents',dutch)}</p>`;
  return `<div class="day-list">${days.map(day=>`<section class="list-day"><div class="day-heading"><div class="day-title">${escapeCalendarHtml(this._dayTitle(day.key))}<time datetime="${day.key}">${short.format(Date.parse(`${day.key}T12:00:00Z`))}</time></div>${this._weatherFor(day.key,forecast)}</div>${day.events.length?day.events.map(event=>`<div class="list-event"><span class="event-time">${event.allDay?label('allDay',dutch):escapeCalendarHtml(this._eventTime(event,day))}</span>${this._eventButton(event,day)}</div>`).join(''):`<p class="empty-day">${label('noEvents',dutch)}</p>`}</section>`).join('')}</div>`;
 }
 _columns(days,forecast){
  const short=this._dayFormatter({weekday:'short'}),date=this._dayFormatter({day:'numeric',month:'short'}),dutch=isDutch(this._hass);
  return `<div class="horizontal" tabindex="0" role="region" aria-label="${label('columns',dutch)}"><div class="day-columns" style="--days:${days.length}">${days.map(day=>`<section class="column"><div class="column-heading"><div>${short.format(Date.parse(`${day.key}T12:00:00Z`))}<time datetime="${day.key}">${date.format(Date.parse(`${day.key}T12:00:00Z`))}</time></div>${this._weatherFor(day.key,forecast)}</div>${day.events.length?day.events.map(event=>this._eventButton(event,day,'columns')).join(''):`<p class="empty-day">${label('noEvents',dutch)}</p>`}</section>`).join('')}</div></div>`;
 }
 _month(days,range,forecast){
  const dutch=isDutch(this._hass),weekday=this._dayFormatter({weekday:'short'}),names=Array.from({length:7},(_,index)=>weekday.format(Date.UTC(2024,0,1+index)));
  const rows=days.map(day=>{
   const outside=day.key.slice(0,7)!==range.monthKey.slice(0,7),visible=day.events.slice(0,this._config.density==='compact'?2:3),remaining=day.events.length-visible.length;
   let more='';
   if(remaining){const id=`calendar-more-${this._popupSeq++}`,title=this._dayFormatter({weekday:'long',day:'numeric',month:'long'}).format(Date.parse(`${day.key}T12:00:00Z`));
    this._popupMarkup.push(uiPopup({id,title,closeLabel:label('close',dutch),content:`<ul class="popup-more">${day.events.map(event=>`<li data-calendar-event="${escapeCalendarHtml(calendarEventKey(event))}" style="--event-color:${this._eventColor(event.calendar)}"><details><summary><strong>${escapeCalendarHtml(event.summary||label('title',dutch))}</strong><small>${escapeCalendarHtml(this._eventTime(event,day))} · ${escapeCalendarHtml(this._calendarName(event.calendar))}</small></summary><div class="popup-more-detail"><div class="popup-when">${this._detailTime(event)}</div>${event.location?`<div class="popup-field"><span class="popup-field-label">${label('location',dutch)}</span><div class="popup-location">${escapeCalendarHtml(event.location)}</div></div>`:''}${event.description?`<div class="popup-field"><span class="popup-field-label">${label('description',dutch)}</span><div class="popup-description">${escapeCalendarHtml(event.description)}</div></div>`:''}</div></details></li>`).join('')}</ul>`}));
    more=uiButton({variant:'text',className:'month-more',text:`+${remaining} ${label('more',dutch)}`,label:`+${remaining} ${label('more',dutch)}`,attrs:{'data-event-popup-id':id,'aria-controls':id,'aria-haspopup':'dialog'}});
   }
   return `<section class="month-cell ${outside?'outside':''} ${day.key===this._todayKey?'today':''}" aria-label="${escapeCalendarHtml(this._dayFormatter({weekday:'long',day:'numeric',month:'long'}).format(Date.parse(`${day.key}T12:00:00Z`)))}"><div class="month-cell-head"><time datetime="${day.key}">${Number(day.key.slice(8))}</time>${this._weatherFor(day.key,forecast)}</div>${visible.map(event=>this._eventButton(event,day,'month')).join('')}${more}</section>`;
  }).join('');
  return `<div class="horizontal" tabindex="0" role="region" aria-label="${label('month',dutch)}"><div class="month-grid">${names.map(name=>`<div class="month-weekday">${escapeCalendarHtml(name)}</div>`).join('')}${rows}</div></div>`;
 }
 _status(){const dutch=isDutch(this._hass),states=Object.values(this._statuses);if(states.includes('error'))return `<p class="status error" role="status">${label('failed',dutch)}<button type="button" data-retry>${label('retry',dutch)}</button></p>`;
  if(states.includes('loading'))return `<p class="status" role="status">${label('loading',dutch)}</p>`;return '';}
 _rangeLabel(range){const short=this._dayFormatter({day:'numeric',month:'short'});if(this._view==='month')return this._dayFormatter({month:'long',year:'numeric'}).format(Date.parse(`${range.monthKey}T12:00:00Z`));return `${short.format(Date.parse(`${range.startKey}T12:00:00Z`))}–${short.format(Date.parse(`${nextCalendarDayKey(range.endKey,-1)}T12:00:00Z`))}`;}
 _infoPopup(dutch,range,days){
  const unique=events=>[...new Map(events.map(event=>[calendarEventKey(event),event])).values()];
  const periodDays=this._view==='month'?days.filter(day=>day.key.slice(0,7)===range.monthKey.slice(0,7)):days;
  const all=unique(periodDays.flatMap(day=>day.events));
  const locale=dutch?'nl-NL':'en-GB',nextFormat=new Intl.DateTimeFormat(locale,{timeZone:this._zone(),weekday:'short',day:'numeric',month:'short'});
  const rows=this._config.entities.map(row=>{
   const id=row.entity,events=all.filter(event=>event.calendar===id),next=nextCalendarEvent(events),hidden=this._hiddenCalendars.has(id),status=this._statuses[id],failed=this._calendarFailed(id);
   const states=[hidden?label('hidden',dutch):'',failed?label('calendarUnavailable',dutch):status==='loading'?label('loading',dutch):status!=='ready'?label('noData',dutch):''].filter(Boolean);
   const nextText=next?escapeCalendarHtml(next.summary||label('title',dutch)):'—',nextWhen=next?`${nextFormat.format(next.start)}${next.allDay?` · ${label('allDay',dutch)}`:` · ${this._time(next.start)}`}`:'';
   return `<section class="insight-sensor" data-information-entity="${escapeCalendarHtml(id)}"><div class="insight-sensor-heading"><i class="dot" style="--event-color:${this._eventColor(id)}" aria-hidden="true"></i><strong>${escapeCalendarHtml(this._calendarName(id))}</strong></div><dl class="insight-metrics calendar-agenda-metrics"><div><dt>${label('appointments',dutch)}</dt><dd>${status==='ready'?events.length:'—'}</dd></div><div><dt>${label('nextAppointment',dutch)}</dt><dd>${status==='ready'?nextText:'—'}${status==='ready'&&next?`<small>${escapeCalendarHtml(nextWhen)}</small>`:''}</dd></div></dl>${states.length?`<div class="insight-states" role="status">${escapeCalendarHtml(states.join(' · '))}</div>`:''}</section>`;
  }).join('');
  const content=`<div class="calendar-info"><div class="insight-sensors">${rows}</div></div>`;
  return uiPopup({id:'calendar-info',className:'insight-popup',title:dutch?'Gegevens':'Data information',closeLabel:label('close',dutch),content});
 }
 _cleanupUI(){for(const controller of this._popupControllers){controller.close();controller.disconnect();}this._popupControllers=[];}
 _render(){
  if(!this._config)return;
  const dutch=isDutch(this._hass),range=this._range(),renderKey=`${this._view}/${range.startKey}/${range.endKey}`,sameRange=this._renderKey===renderKey,scroll=sameRange?this.shadowRoot.querySelector('.horizontal')?.scrollLeft??0:0,scrollTop=sameRange?this.shadowRoot.querySelector('.calendar-body')?.scrollTop??0:0,focusedNav=this.shadowRoot.activeElement?.dataset?.nav;
  this._renderKey=renderKey;
  this._cleanupUI();
  if(this._emptyConfig){this._displayEvents=[];this._updateNextEvent();this.shadowRoot.innerHTML=`<style>${calendarCardStyles()}</style><ha-card><div class="content"><div class="status">${label('select',dutch)}</div></div></ha-card>`;return;}
  const visibleEntities=this._config.entities.filter(row=>!this._hiddenCalendars.has(row.entity));
  const daysKey=`${range.start}/${range.end}/${this._zone()}/${this._eventRevision??0}/${this._config.entities.map(row=>row.entity).join('|')}`;
  if(this._daysKey!==daysKey){this._daysCache=calendarDaysWithEvents(range,this._events,this._config.entities,this._zone());this._daysKey=daysKey;}
  const days=this._daysCache,visibleDays=days.map(day=>({...day,events:day.events.filter(event=>!this._hiddenCalendars.has(event.calendar))})),forecast=forecastByCalendarDay(this._forecast,this._zone());
  this._displayEvents=visibleDays.flatMap(day=>day.events);
  this._popupSeq=0;this._popupMarkup=[];
  const loadingOnly=Object.values(this._statuses).length>0&&Object.values(this._statuses).every(status=>status==='loading')&&!Object.values(this._events).some(events=>events.length);
  const body=!visibleEntities.length?`<p class="status" role="status">${label('allHidden',dutch)}</p>`:loadingOnly?'':this._view==='columns'?this._columns(visibleDays,forecast):this._view==='month'?this._month(visibleDays,range,forecast):this._list(visibleDays,forecast);
  const button=(action,content,name)=>uiButton({content,label:name,title:name,attrs:{'data-nav':action}});
  const navigation=this._config.show_navigation?`<div class="navigation"><span class="range">${escapeCalendarHtml(this._rangeLabel(range))}</span>${button('previous',cardHeaderIcon('previous'),label('previous',dutch))}${button('now',label('now',dutch),this._view==='month'?label('today',dutch):label('now',dutch))}${button('next',cardHeaderIcon('next'),label('next',dutch))}</div>`:'';
  const info=uiButton({content:cardHeaderIcon('info'),className:'info-button',label:label('info',dutch),attrs:{'data-info':'','aria-controls':'calendar-info','aria-haspopup':'dialog'}});
  const legend=this._config.show_legend?uiLegend({items:this._config.entities.map(row=>{const name=this._calendarName(row.entity),visible=!this._hiddenCalendars.has(row.entity),failed=this._calendarFailed(row.entity),failure=failed?label('calendarUnavailable',dutch):'';return {id:row.entity,visible,title:label(visible?'hideCalendar':'showCalendar',dutch)+' '+name+'.'+(failure?' '+failure+'.':''),attrs:{'data-calendar':row.entity,'data-calendar-error':failed?'':null,'aria-label':failure?name+'. '+failure:null,style:`--event-color:${this._eventColor(row.entity)}`},content:`<i class="dot"></i><span>${escapeCalendarHtml(name)}</span>${failed?'<b class="legend-error" aria-hidden="true">!</b>':''}`};})}):'';
  this.shadowRoot.innerHTML=`<style>${uiButtonStyles()}${uiPopupStyles()}${calendarCardStyles()}</style><ha-card class="${this._config.density==='compact'?'compact':''}"><div class="content"><header class="header">${this._config.show_title?`<h2>${escapeCalendarHtml(this._config.title||label('title',dutch))}</h2>`:''}<div class="header-actions">${navigation}${info}</div></header>${legend}${this._status()}<div class="calendar-body">${body}</div>${this._infoPopup(dutch,range,days)}${this._popupMarkup.join('')}</div></ha-card>`;
  const horizontal=this.shadowRoot.querySelector('.horizontal');if(horizontal)horizontal.scrollLeft=scroll;
  const calendarBody=this.shadowRoot.querySelector('.calendar-body');if(calendarBody)calendarBody.scrollTop=scrollTop;
  this._updateNextEvent();
  bindUILegend(this,{selector:'[data-calendar]',getId:button=>button.dataset.calendar,hint:label('soloHint',dutch),toggle:id=>this._toggleCalendar(id),isolate:id=>this._toggleCalendarIsolation(id)});
  for(const action of this.shadowRoot.querySelectorAll('[data-nav]'))action.onclick=()=>{const kind=action.dataset.nav;this._offset=kind==='now'?0:this._offset+(kind==='previous'?-1:1);this._startCalendars();this._render();this.shadowRoot.querySelector(`[data-nav="${kind}"]`)?.focus({preventScroll:true});};
  if(focusedNav)this.shadowRoot.querySelector(`[data-nav="${focusedNav}"]`)?.focus({preventScroll:true});
  const makePopup=(trigger,popup)=>{let control;control=bindUIPopup({trigger,popup,container:this.shadowRoot.querySelector('ha-card'),beforeOpen:()=>this._popupControllers.forEach(item=>{if(item!==control)item.close();})});this._popupControllers.push(control);};
  makePopup(this.shadowRoot.querySelector('[data-info]'),this.shadowRoot.querySelector('#calendar-info'));
  for(const trigger of this.shadowRoot.querySelectorAll('[data-event-popup-id]'))makePopup(trigger,this.shadowRoot.getElementById(trigger.dataset.eventPopupId));
  this.shadowRoot.querySelector('[data-retry]')?.addEventListener('click',()=>{this._calendarRetryFailures=0;this._startCalendars();this._render();});
 }
}
