import {calendarDayStart} from '../../../shared/periods.js';
import {localCalendarDayKey,nextCalendarDayKey} from '../src/calendar-utils.js';

const zone='Europe/Amsterdam',today=localCalendarDayKey(Date.now(),zone),subscriptions=new Map(),calls=[];
let nextSubscription=0,extraEvent=false;
const entry=(key,summary,hours,duration=60,location='')=>({start:new Date(calendarDayStart(key,zone)+hours*3600000).toISOString(),end:new Date(calendarDayStart(key,zone)+(hours*60+duration)*60000).toISOString(),summary,location});
const eventsFor=(entity,start,end)=>{
 const list=[],startKey=localCalendarDayKey(start,zone),endKey=localCalendarDayKey(Date.parse(end)-1,zone);
 for(let key=startKey;key<=endKey;key=nextCalendarDayKey(key)){
  const weekday=new Date(`${key}T12:00:00Z`).getUTCDay();
  if(entity==='calendar.family'){
   if(key===today){list.push({start:key,end:nextCalendarDayKey(key,2),summary:'Schoolvakantie'});list.push(entry(key,'Tandarts',10,45,'Centrum'));list.push(entry(key,'Pakket bezorgen',13.5,30,'Thuis'));list.push(entry(key,'Afspraak met buren',15,45,'Thuis'));if(extraEvent)list.push(entry(key,'Nieuw ontvangen afspraak',16,60,'Thuis'));}
   if(weekday===6)list.push(entry(key,'Fietsen',10,120,'Bos'));
   if(weekday===0)list.push(entry(key,'Lunch met familie',12.5,90,'Bij opa en oma'));
  }
  if(entity==='calendar.work'&&weekday>=1&&weekday<=5){list.push(entry(key,'Dagstart',8.5,30,'Teams'));if(weekday===2)list.push(entry(key,'Projectoverleg',13,90,'Kantoor'));}
  if(entity==='calendar.leisure'&&weekday===4)list.push(entry(key,'Hardlopen',18,60,'Park'));
 }
 return list;
};
const forecast=Array.from({length:14},(_,i)=>({datetime:new Date(calendarDayStart(nextCalendarDayKey(today,i),zone)).toISOString(),temperature:14+i%5,templow:7+i%4,condition:['partlycloudy','rainy','sunny'][i%3]}));
const connection={subscribeMessage(callback,request){
 const id=++nextSubscription;calls.push(request);subscriptions.set(id,{callback,request});
 queueMicrotask(()=>{if(!subscriptions.has(id))return;callback(request.type==='calendar/event/subscribe'?{events:eventsFor(request.entity_id,request.start,request.end)}:{type:'daily',forecast});});
 return Promise.resolve(()=>subscriptions.delete(id));
}};
const hass={language:'nl',locale:{language:'nl'},config:{time_zone:zone},connection,states:{
 'calendar.family':{state:'off',attributes:{friendly_name:'Gezin'}},'calendar.work':{state:'off',attributes:{friendly_name:'Werk'}},'calendar.leisure':{state:'off',attributes:{friendly_name:'Vrije tijd'}},
 'weather.home':{state:'partlycloudy',attributes:{friendly_name:'Weer thuis',temperature:16,temperature_unit:'°C'}}
}};
const card=document.querySelector('eleven-calendar-card');window.card=card;window.qaHass=hass;window.qaCalls=calls;window.qaSubscriptions=subscriptions;
card.setConfig({title:'Agenda',view:'list',days_to_show:5,weather_entity:'weather.home',entities:[{entity:'calendar.family',color:[231,175,103]},{entity:'calendar.work',color:[130,173,245]},{entity:'calendar.leisure',color:[138,198,166]}]});card.hass=hass;
document.getElementById('theme').onclick=()=>document.body.classList.toggle('dark');
document.getElementById('width').onclick=()=>document.querySelector('main').classList.toggle('narrow');
document.getElementById('new-event').onclick=()=>{extraEvent=true;for(const {callback,request} of subscriptions.values())if(request.type==='calendar/event/subscribe'&&request.entity_id==='calendar.family')callback({events:eventsFor(request.entity_id,request.start,request.end)});};
document.getElementById('editor-button').onclick=async()=>{
 const editor=await card.constructor.getConfigElement();window.editor=editor;editor.setConfig(card._config);editor.hass=hass;
 editor.addEventListener('config-changed',event=>{try{card.setConfig(event.detail.config);document.getElementById('results').textContent='';}catch(error){document.getElementById('results').textContent=error.message;}});
 document.getElementById('editor').replaceChildren(editor);
};
document.getElementById('audit').onclick=async()=>{
 const results=[],check=(name,condition)=>{results.push({name,ok:!!condition});if(!condition)throw Error(name);};
 try{
  const detached=document.createElement('eleven-calendar-card');
  detached.setConfig({...card._config,view:'list',days_to_show:8});
  check('configuratie werkt vóór koppeling met Home Assistant',detached.shadowRoot.querySelectorAll('.list-day').length===8);
  detached.disconnectedCallback();
  const features=document.createElement('eleven-calendar-card');features.setConfig({entities:['calendar.family'],days_to_show:3,hide_empty_days:true});features.hass=hass;
  features._events={'calendar.family':[entry(nextCalendarDayKey(today),'Eerstvolgende testafspraak',10)]};features._statuses={'calendar.family':'ready'};features._render();
  check('lege dagen worden alleen uit de daglijst verborgen',features.shadowRoot.querySelectorAll('.list-day').length===1);
  check('eerstvolgende afspraak heeft een markering',features.shadowRoot.querySelector('.event-button[data-next-event]')?.textContent.includes('Eerstvolgende testafspraak'));
  features.setConfig({...features._config,view:'columns'});
  check('kolommen houden alle dagen bij lege-dagenfilter',features.shadowRoot.querySelectorAll('.column').length===3);
  features._statuses['calendar.family']='error';features._render();
  check('legenda identificeert de agenda met een laadfout',!!features.shadowRoot.querySelector('[data-calendar="calendar.family"][data-calendar-error] .legend-error'));
  features._statuses['calendar.family']='ready';features._render();check('waarschuwing verdwijnt na herstel',!features.shadowRoot.querySelector('[data-calendar-error]'));
  features.setConfig({...features._config,view:'list'});features._events={};features._render();
  check('lege gefilterde lijst houdt een melding',!features.shadowRoot.querySelector('.list-day')&&features.shadowRoot.querySelector('.calendar-body').textContent.includes('Geen afspraken'));
  features.disconnectedCallback();
  await new Promise(resolve=>setTimeout(resolve,30));
  check('drie agenda-abonnementen',calls.filter(call=>call.type==='calendar/event/subscribe').length>=3);
  check('dagverwachting geabonneerd',calls.some(call=>call.type==='weather/subscribe_forecast'&&call.forecast_type==='daily'));
  check('daglijst toont afspraken',!!card.shadowRoot.querySelector('.day-list [data-event-popup-id]'));
  check('weer zichtbaar',!!card.shadowRoot.querySelector('.day-list .weather'));
  check('geen weergavetabs op de kaart',!card.shadowRoot.querySelector('[data-ui-tab]'));
  check('legenda heeft drie schakelaars',card.shadowRoot.querySelectorAll('[data-calendar][aria-pressed="true"]').length===3);
  const doubleClickLegend=id=>{const button=card.shadowRoot.querySelector(`[data-calendar="${id}"]`);button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:2}));};
  doubleClickLegend('calendar.family');await new Promise(resolve=>setTimeout(resolve,350));
  check('dubbelklik toont alleen gekozen agenda',card.shadowRoot.querySelectorAll('[data-calendar][aria-pressed="true"]').length===1&&card.shadowRoot.querySelector('.day-list').textContent.includes('Tandarts')&&!card.shadowRoot.querySelector('.day-list').textContent.includes('Dagstart'));
  doubleClickLegend('calendar.family');await new Promise(resolve=>setTimeout(resolve,350));
  check('tweede dubbelklik toont alle agenda’s',card.shadowRoot.querySelectorAll('[data-calendar][aria-pressed="true"]').length===3);
  card.shadowRoot.querySelector('[data-calendar="calendar.family"]').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
  check('enkelklik wacht kort op een tweede klik',card.shadowRoot.querySelector('[data-calendar="calendar.family"]').getAttribute('aria-pressed')==='true');
  await new Promise(resolve=>setTimeout(resolve,350));
  check('enkelklik verbergt daarna de agenda',card.shadowRoot.querySelector('[data-calendar="calendar.family"]').getAttribute('aria-pressed')==='false');
  card.shadowRoot.querySelector('[data-calendar="calendar.family"]').click();
  card.shadowRoot.querySelector('[data-calendar="calendar.work"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));
  check('Shift+Enter toont alleen gekozen agenda',card.shadowRoot.querySelectorAll('[data-calendar][aria-pressed="true"]').length===1&&card.shadowRoot.querySelector('[data-calendar="calendar.work"]').getAttribute('aria-pressed')==='true');
  card.shadowRoot.querySelector('[data-calendar="calendar.work"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));
  check('tweede Shift+Enter toont alle agenda’s',card.shadowRoot.querySelectorAll('[data-calendar][aria-pressed="true"]').length===3);
  const subscriptionsBeforeToggle=calls.length;
  card.shadowRoot.querySelector('[data-calendar="calendar.family"]').click();
  check('legenda verbergt alleen gekozen agenda',card.shadowRoot.querySelector('[data-calendar="calendar.family"]').getAttribute('aria-pressed')==='false'&&!card.shadowRoot.querySelector('.day-list').textContent.includes('Tandarts')&&card.shadowRoot.querySelector('.day-list').textContent.includes('Dagstart'));
  card.setConfig({...card._config,density:'compact'});
  check('compacte daglijst behoudt verborgen agenda',card.shadowRoot.querySelector('ha-card').classList.contains('compact')&&card.shadowRoot.querySelector('[data-calendar="calendar.family"]').getAttribute('aria-pressed')==='false');
  check('compacte daglijst toont tijd en titel op één regel',!!card.shadowRoot.querySelector('.list-event>.event-time')&&getComputedStyle(card.shadowRoot.querySelector('.list-event .event-meta')).display==='none');
  card.shadowRoot.querySelector('[data-calendar="calendar.family"]').click();
  check('legenda toont verborgen afspraken weer',card.shadowRoot.querySelector('.day-list').textContent.includes('Tandarts'));
  for(const id of ['calendar.family','calendar.work','calendar.leisure'])card.shadowRoot.querySelector(`[data-calendar="${id}"]`).click();
  check('alle agenda’s verborgen heeft melding',card.shadowRoot.textContent.includes('Alle agenda’s zijn verborgen.')&&!card.shadowRoot.querySelector('.day-list'));
  for(const id of ['calendar.family','calendar.work','calendar.leisure'])card.shadowRoot.querySelector(`[data-calendar="${id}"]`).click();
  check('legenda wisselen herlaadt agenda’s niet',calls.length===subscriptionsBeforeToggle);
  card.shadowRoot.querySelector('[data-calendar="calendar.family"]').click();
  card.setConfig({...card._config,show_legend:false});
  check('legenda verbergen herstelt alle agenda’s',!card.shadowRoot.querySelector('[data-calendar]')&&card.shadowRoot.querySelector('.day-list').textContent.includes('Tandarts'));
  card.setConfig({...card._config,show_legend:true});
  card.setConfig({...card._config,view:'columns'});
  await new Promise(resolve=>setTimeout(resolve,20));
  check('dagkolommen met vijf dagen',card.shadowRoot.querySelectorAll('.column').length===5);
  check('compacte dagkolommen',card.shadowRoot.querySelector('ha-card').classList.contains('compact')&&getComputedStyle(card.shadowRoot.querySelector('.column .event-meta')).display==='none');
  if(document.querySelector('main').classList.contains('narrow'))check('dagkolommen schuiven binnen de kaart',card.shadowRoot.querySelector('.horizontal').scrollWidth>card.shadowRoot.querySelector('.horizontal').clientWidth);
  card.setConfig({...card._config,view:'month'});
  await new Promise(resolve=>setTimeout(resolve,20));
  check('maand begint op maandag',card.shadowRoot.querySelector('.month-weekday')?.textContent.toLowerCase().startsWith('ma'));
  check('maand heeft volledige weken',card.shadowRoot.querySelectorAll('.month-cell').length%7===0);
  check('compacte maand toont twee afspraken per dag',card.shadowRoot.querySelector('.month-cell.today')?.querySelectorAll('.month-chip').length===2);
  doubleClickLegend('calendar.family');await new Promise(resolve=>setTimeout(resolve,350));
  check('dubbelklik werkt ook in maandweergave',card.shadowRoot.querySelectorAll('[data-calendar][aria-pressed="true"]').length===1&&card.shadowRoot.querySelector('.month-cell.today')?.textContent.includes('Tandarts'));
  doubleClickLegend('calendar.family');await new Promise(resolve=>setTimeout(resolve,350));
  check('geen horizontale pagina-overloop',document.body.scrollWidth<=window.innerWidth);
  if(document.querySelector('main').classList.contains('narrow'))check('maandraster schuift binnen de kaart',card.shadowRoot.querySelector('.horizontal').scrollWidth>card.shadowRoot.querySelector('.horizontal').clientWidth);
  const more=card.shadowRoot.querySelector('.month-more');check('extra afspraken krijgen een meerknop',!!more);more.click();
  check('meerknop toont volledige dag',card.shadowRoot.getElementById(more.dataset.eventPopupId).matches(':popover-open')&&card.shadowRoot.getElementById(more.dataset.eventPopupId).querySelectorAll('.popup-more li').length>=4);
  card.shadowRoot.getElementById(more.dataset.eventPopupId).querySelector('[data-ui-popup-close]').click();
  const monthLabel=card.shadowRoot.querySelector('.range').textContent;card.shadowRoot.querySelector('[data-nav=next]').click();
  check('volgende maand geopend',card.shadowRoot.querySelector('.range').textContent!==monthLabel);
  card.shadowRoot.querySelector('[data-nav=now]').click();await new Promise(resolve=>setTimeout(resolve,20));
  check('huidige maand hersteld',card.shadowRoot.querySelector('.range').textContent===monthLabel);
  document.getElementById('new-event').click();
  check('live agenda-update verwerkt',card.shadowRoot.textContent.includes('Nieuw ontvangen afspraak'));
  card.setConfig({...card._config,view:'list'});
  await new Promise(resolve=>setTimeout(resolve,20));
  check('terug naar daglijst',!!card.shadowRoot.querySelector('.day-list'));
  const first=card.shadowRoot.querySelector('[data-event-popup-id]');first.click();const popup=card.shadowRoot.getElementById(first.dataset.eventPopupId);
  check('afspraakdetails openen',popup.matches(':popover-open'));
  const close=popup.querySelector('[data-ui-popup-close]'),closeBox=close.getBoundingClientRect(),iconBox=close.querySelector('svg').getBoundingClientRect();
  check('sluitkruis staat midden in hovervlak',iconBox.width===16&&iconBox.height===16&&Math.abs((iconBox.left+iconBox.right-closeBox.left-closeBox.right)/2)<.5&&Math.abs((iconBox.top+iconBox.bottom-closeBox.top-closeBox.bottom)/2)<.5);
  popup.querySelector('[data-ui-popup-close]').click();
  check('afspraakdetails sluiten',!popup.matches(':popover-open'));
  const info=card.shadowRoot.querySelector('#calendar-info');
  check('gegevens tonen alleen gekleurde agenda’s met twee velden',info.querySelectorAll('.insight-sensor-heading .dot').length===3&&info.querySelectorAll('.calendar-agenda-metrics').length===3&&!info.querySelector('.info-range,.info-weather,.calendar-summary-metrics'));
  const previous=card.shadowRoot.querySelector('.range').textContent;card.shadowRoot.querySelector('[data-nav=next]').click();
  check('volgende periode laadt nieuw bereik',card.shadowRoot.querySelector('.range').textContent!==previous&&calls.filter(call=>call.type==='calendar/event/subscribe').length>=6);
  card.shadowRoot.querySelector('[data-nav=now]').click();
  check('Nu herstelt de actuele periode',card.shadowRoot.querySelector('.range').textContent===previous);
  document.getElementById('results').textContent=results.map(row=>'✓ '+row.name).join('\n');window.qaAuditResults=results;window.qaAuditError=null;
 }catch(error){window.qaAuditResults=results;window.qaAuditError=error.message;document.getElementById('results').textContent=results.map(row=>'✓ '+row.name).join('\n')+'\n✗ '+error.message;}
};
document.getElementById('editor-audit').onclick=async()=>{
 const results=[],check=(name,condition)=>{results.push({name,ok:!!condition});if(!condition)throw Error(name);};
 try{
  const editor=await card.constructor.getConfigElement();editor.setConfig(card._config);editor.hass=hass;
  let changed;editor.addEventListener('config-changed',event=>changed=event.detail.config);
  const global=editor.shadowRoot.querySelector('ha-form.global');
  check('agenda en weer gebruiken entiteitskiezers',editor.shadowRoot.querySelectorAll('ha-form').length===4&&card.constructor.getConfigForm().schema.find(row=>row.name==='weather_entity').selector.entity.domain==='weather');
  const days=global.querySelector('[name=days_to_show]');days.value='7';days.dispatchEvent(new Event('change',{bubbles:true}));
  check('aantal dagen opgeslagen',changed?.days_to_show===7);
  const month=global.querySelector('[name=view]');month.value='month';month.dispatchEvent(new Event('change',{bubbles:true}));
  check('maandweergave opgeslagen',changed?.view==='month');
  const density=global.querySelector('[name=density]');density.value='compact';density.dispatchEvent(new Event('change',{bubbles:true}));
  check('compacte weergave opgeslagen',changed?.density==='compact');
  const hideEmpty=global.querySelector('[name=hide_empty_days]');hideEmpty.checked=true;hideEmpty.dispatchEvent(new Event('change',{bubbles:true}));
  check('lege-dagenfilter opgeslagen',changed?.hide_empty_days===true);
  const color=editor.shadowRoot.querySelector('.calendars input[type=color]');color.value='#204060';color.dispatchEvent(new Event('change',{bubbles:true}));
  check('kleurkiezer slaat RGB op',JSON.stringify(changed?.entities[0].color)==='[32,64,96]');
  editor.shadowRoot.querySelector('.add').click();check('agenda toevoegen',editor.shadowRoot.querySelectorAll('.calendars details').length===4);
  editor.shadowRoot.querySelector('.calendars details:last-child .remove').click();check('agenda verwijderen',editor.shadowRoot.querySelectorAll('.calendars details').length===3);
  window.qaEditorResults=results;window.qaEditorError=null;document.getElementById('results').textContent=results.map(row=>'✓ '+row.name).join('\n');
 }catch(error){window.qaEditorResults=results;window.qaEditorError=error.message;document.getElementById('results').textContent=results.map(row=>'✓ '+row.name).join('\n')+'\n✗ '+error.message;}
};
