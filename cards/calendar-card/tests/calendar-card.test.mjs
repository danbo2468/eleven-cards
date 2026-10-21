import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarEventKey} from '../src/calendar-utils.js';
globalThis.HTMLElement=class{attachShadow(){this.shadowRoot={innerHTML:'',querySelectorAll:()=>[]};}};
const {CalendarCard}=await import('../src/calendar-card.js');
const fixture=()=>{const card=new CalendarCard();card._render=()=>{};card.setConfig({entities:['calendar.family'],hide_empty_days:true});card._hass={language:'en'};card._todayKey='2026-10-20';return card;};
test('several subscription results are rendered together',async()=>{
 const card=fixture();let renders=0;card._render=()=>renders++;card._connected=true;
 card._queueRender();card._queueRender();card._queueRender();await Promise.resolve();
 assert.equal(renders,1);card._connected=false;
});
test('failed calendar subscriptions retry and retain the previous events',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const card=fixture();card._connected=true;let calls=0;
 card._hass={language:'en',config:{time_zone:'UTC'},connection:{subscribeMessage:()=>{calls++;return Promise.reject(Error('offline'));}}};
 card._eventRangeKey=`${card._range().start}/${card._range().end}`;card._events={'calendar.family':[{summary:'Previous'}]};
 card._startCalendars();await Promise.resolve();await Promise.resolve();
 assert.equal(card._statuses['calendar.family'],'error');assert.equal(card._events['calendar.family'][0].summary,'Previous');
 t.mock.timers.tick(30000);assert.equal(calls,2);card.disconnectedCallback();
});

test('weather subscription restarts when calendars are re-added with the same weather entity',()=>{
 const card=fixture();card._connected=true;card._hass={language:'en',states:{},config:{time_zone:'UTC'}};
 card._startCalendars=()=>{};let starts=0;card._startWeather=()=>starts++;
 card.setConfig({entities:[],weather_entity:'weather.home'});
 card.setConfig({entities:['calendar.family'],weather_entity:'weather.home'});
 assert.equal(starts,1);
 card.disconnectedCallback();
});

test('empty-day filter affects only the day list and retains a useful empty state',()=>{
 const card=fixture();card._eventButton=()=>'<button>Event</button>';
 const days=[{key:'2026-10-20',events:[]},{key:'2026-10-21',events:[{allDay:true}]}];
 assert.equal((card._list(days,new Map()).match(/class="list-day"/g)??[]).length,1);
 assert.match(card._list([days[0]],new Map()),/No events/);
 card._config.hide_empty_days=false;
 assert.equal((card._list(days,new Map()).match(/class="list-day"/g)??[]).length,2);
 assert.equal((card._columns(days,new Map()).match(/class="column"/g)??[]).length,2);
});

test('next-event marker advances without rerendering an open popup and stops on disconnect',t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
 const card=fixture(),events=[{calendar:'calendar.family',summary:'First',start:1000,end:2000},{calendar:'calendar.family',summary:'Second',start:3000,end:4000}];
 const buttons=events.map(event=>({dataset:{calendarEvent:calendarEventKey(event)},attrs:{},toggleAttribute(name,on){if(on)this.attrs[name]='';else delete this.attrs[name];},setAttribute(name,value){this.attrs[name]=value;},removeAttribute(name){delete this.attrs[name];}}));
 card.shadowRoot.querySelectorAll=()=>buttons;card._displayEvents=events;card._connected=true;card._render=()=>assert.fail('Marker updates must not replace popup DOM');
 card._updateNextEvent();assert.ok('data-next-event' in buttons[0].attrs);assert.equal(buttons[1].attrs['data-next-event'],undefined);
 t.mock.timers.tick(1001);assert.equal(buttons[0].attrs['data-next-event'],undefined);assert.ok('data-next-event' in buttons[1].attrs);
 card.disconnectedCallback();assert.equal(card._nextEventTimer,null);
});

test('legend failure includes unavailable entities and subscription errors, and clears on recovery',()=>{
 const card=fixture();card._hass.states={'calendar.family':{state:'unavailable'}};
 assert.equal(card._calendarFailed('calendar.family'),true);
 card._hass.states['calendar.family'].state='off';assert.equal(card._calendarFailed('calendar.family'),false);
 card._statuses['calendar.family']='error';assert.equal(card._calendarFailed('calendar.family'),true);
 card._statuses['calendar.family']='ready';assert.equal(card._calendarFailed('calendar.family'),false);
});

test('information summarizes distinct events and status for the selected period',()=>{
 const card=fixture(),start=Date.now()+86400000,event={calendar:'calendar.family',summary:'Planning',start,end:start+3600000,allDay:false};
 card._hass={language:'nl',config:{time_zone:'UTC'},states:{'calendar.family':{state:'on',attributes:{friendly_name:'Gezin'}}}};
 card._statuses['calendar.family']='ready';
 const day={key:new Date(start).toISOString().slice(0,10),events:[event]};
 card._rangeLabel=()=> '21–22 okt';
 const popup=card._infoPopup(true,{keys:[day.key,day.key],startKey:day.key,endKey:day.key},[day,{...day}]);
 assert.match(popup,/Gegevens/);assert.match(popup,/>1<\/dd>/);
 assert.match(popup,/Planning/);assert.match(popup,/Gezin/);assert.doesNotMatch(popup,/>2 afspraken/);
 assert.doesNotMatch(popup,/Periode:|Weer:|Zichtbaar|Actieve agenda’s|<dt>dagen<\/dt>/);
 card._hiddenCalendars.add('calendar.family');
 const hidden=card._infoPopup(true,{keys:[day.key],startKey:day.key,endKey:day.key},[day]);
 assert.match(hidden,/Verborgen/);assert.match(hidden,/>1<\/dd>/);
});

test('each calendar shows its event count and next event in adjacent metrics',()=>{
 const card=fixture(),start=Date.now()+86400000,key=new Date(start).toISOString().slice(0,10);
 card._config.entities=[{entity:'calendar.family'},{entity:'calendar.work'}];
 card._hass={language:'nl',config:{time_zone:'UTC'},states:{'calendar.family':{state:'on',attributes:{friendly_name:'Gezin'}},'calendar.work':{state:'on',attributes:{friendly_name:'Werk'}}}};
 card._statuses={'calendar.family':'ready','calendar.work':'ready'};card._rangeLabel=()=> '21–22 okt';
 const events=[{calendar:'calendar.family',summary:'Tandarts',start,end:start+3600000,allDay:false},{calendar:'calendar.work',summary:'Teamoverleg',start:start+7200000,end:start+10800000,allDay:false}];
 const popup=card._infoPopup(true,{keys:[key],startKey:key,endKey:key},[{key,events}]);
 assert.match(popup,/<section[^>]*data-information-entity="calendar.family"[\s\S]*?<dt>Afspraken<\/dt><dd>1<\/dd>[\s\S]*?<dt>Eerstvolgende<\/dt><dd>Tandarts<small>/);
 assert.match(popup,/<section[^>]*data-information-entity="calendar.work"[\s\S]*?<dt>Afspraken<\/dt><dd>1<\/dd>[\s\S]*?<dt>Eerstvolgende<\/dt><dd>Teamoverleg<small>/);
 assert.doesNotMatch(popup,/class="info-next"/);
});

test('event details show one date for same-day events and separate optional fields',()=>{
 const card=fixture();card._hass={language:'nl',config:{time_zone:'UTC'}};
 const start=Date.parse('2026-10-21T10:00:00Z'),event={calendar:'calendar.family',summary:'Tandarts',start,end:start+3600000,allDay:false,location:'Centrum',description:'Controle\nNeem <kaart> mee'};
 card._popupSeq=0;card._popupMarkup=[];card._eventButton(event,{key:'2026-10-21'});
 const popup=card._popupMarkup[0];
 assert.match(popup,/class="calendar-event-popup"/);assert.match(popup,/10:00–11:00/);
 assert.equal((popup.match(/21 oktober 2026/g)??[]).length,1);
 assert.match(popup,/>Locatie<\/span>/);assert.match(popup,/>Beschrijving<\/span>/);
 assert.match(popup,/Neem &lt;kaart&gt; mee/);assert.doesNotMatch(popup,/<kaart>/);
 const overnight=card._detailTime({...event,end:Date.parse('2026-10-22T01:00:00Z')});
 assert.match(overnight,/popup-date-range/);assert.match(overnight,/21 oktober 2026/);assert.match(overnight,/22 oktober 2026/);
 const allDay=card._detailTime({allDay:true,startKey:'2026-10-21',endKey:'2026-10-23'});
 assert.match(allDay,/21 oktober 2026/);assert.match(allDay,/22 oktober 2026/);assert.doesNotMatch(allDay,/23 oktober 2026/);
});

test('month overflow exposes full event details for appointments beyond visible chips',()=>{
 const card=fixture(),start=Date.parse('2026-10-21T09:00:00Z'),day={key:'2026-10-21',start:Date.parse('2026-10-21T00:00:00Z'),end:Date.parse('2026-10-22T00:00:00Z')};
 card._hass={language:'en',config:{time_zone:'UTC'}};card._config.density='compact';card._popupSeq=0;card._popupMarkup=[];
 day.events=Array.from({length:4},(_,index)=>({calendar:'calendar.family',summary:index===3?"O'Connor":`Event ${index}`,start:start+index*3600000,end:start+(index+1)*3600000,allDay:false,location:index===3?'Office <north>':'',description:index===3?'Bring <notes>':''}));
 card._month([day],{monthKey:'2026-10-01'},new Map());
 const overflow=card._popupMarkup.find(markup=>markup.includes('class="popup-more"'));
 assert.ok(overflow);assert.equal((overflow.match(/<details>/g)??[]).length,4);
 assert.match(overflow,/O&#39;Connor/);assert.match(overflow,/Office &lt;north&gt;/);assert.match(overflow,/Bring &lt;notes&gt;/);
 assert.doesNotMatch(overflow,/OundefinedConnor/);
});
