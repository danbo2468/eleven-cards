import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCalendarConfig,calendarDisplayRange,calendarDaysWithEvents,forecastByCalendarDay,localCalendarDayKey,nextCalendarEvent,escapeCalendarHtml} from '../src/calendar-utils.js';

test('event text escapes apostrophes and markup without changing the text',()=>{
 assert.equal(escapeCalendarHtml("O'Connor & <team>"),'O&#39;Connor &amp; &lt;team&gt;');
});

test('calendar configuration accepts entity rows, RGB colors and a weather entity',()=>{
 const config=normalizeCalendarConfig({entities:[{entity:'calendar.family',name:'Family',color:[31,114,201]},'calendar.work'],weather_entity:'weather.home',days_to_show:7,view:'month'});
 assert.equal(config.entities.length,2);assert.deepEqual(config.entities[0].color,[31,114,201]);assert.equal(config.entities[1].entity,'calendar.work');assert.equal(config.view,'month');
 assert.equal(config.density,'expanded');
 assert.equal(config.hide_empty_days,false);
 assert.equal(normalizeCalendarConfig({...config,hide_empty_days:true}).hide_empty_days,true);
 assert.throws(()=>normalizeCalendarConfig({...config,hide_empty_days:'yes'}),/hide_empty_days/);
 assert.equal(normalizeCalendarConfig({...config,density:'compact'}).density,'compact');
 assert.throws(()=>normalizeCalendarConfig({...config,density:'tiny'}),/expanded or compact/);
 assert.throws(()=>normalizeCalendarConfig({...config,entities:[config.entities[0],config.entities[0]]}),/different calendar/);
 assert.throws(()=>normalizeCalendarConfig({...config,days_to_show:15}),/1–14/);
 assert.throws(()=>normalizeCalendarConfig({...config,weather_entity:'sensor.outside'}),/weather entity/);
 const legacy=normalizeCalendarConfig({...config,show_view_switcher:false});
 assert.equal(legacy.view,'month');assert.equal(Object.hasOwn(legacy,'show_view_switcher'),false);
});

test('next event skips started events, handles unsorted all-day events and advances at the start time',()=>{
 const events=[{start:500,allDay:true},{start:100},{start:250},{start:50}];
 assert.equal(nextCalendarEvent(events,100),events[2]);
 assert.equal(nextCalendarEvent(events,250),events[0]);
 assert.equal(nextCalendarEvent(events,500),null);
 assert.equal(nextCalendarEvent([],0),null);
});

test('month view starts on Monday and includes the full final week',()=>{
 const range=calendarDisplayRange('month',5,0,'2026-11-15','Europe/Amsterdam');
 assert.equal(range.monthKey,'2026-11-01');assert.equal(range.startKey,'2026-10-26');assert.equal(range.endKey,'2026-12-07');assert.equal(range.keys.length,42);
 assert.equal(range.keys[0],'2026-10-26');assert.equal(range.keys.at(-1),'2026-12-06');
 const next=calendarDisplayRange('month',5,1,'2026-11-15','Europe/Amsterdam');assert.equal(next.monthKey,'2026-12-01');
});

test('day ranges use Home Assistant timezone across daylight saving transitions',()=>{
 const march=calendarDisplayRange('list',3,0,'2026-03-28','Europe/Amsterdam');
 assert.equal(march.end-march.start,71*3600000);
 const october=calendarDisplayRange('list',3,0,'2026-10-24','Europe/Amsterdam');
 assert.equal(october.end-october.start,73*3600000);
 assert.equal(localCalendarDayKey(Date.parse('2026-10-25T00:30:00Z'),'Europe/Amsterdam'),'2026-10-25');
});

test('all-day events keep exclusive end dates and overnight events appear on both dates',()=>{
 const range=calendarDisplayRange('list',3,0,'2026-10-20','Europe/Amsterdam');
 const entities=[{entity:'calendar.family'}],events={'calendar.family':[
  {start:'2026-10-20',end:'2026-10-22',summary:'Two days'},
  {start:'2026-10-20T22:30:00+02:00',end:'2026-10-21T01:30:00+02:00',summary:'Overnight'}
 ]};
 const days=calendarDaysWithEvents(range,events,entities,'Europe/Amsterdam');
 assert.deepEqual(days.map(day=>day.events.map(event=>event.summary)),[['Two days','Overnight'],['Two days','Overnight'],[]]);
});

test('daily forecasts map to calendar dates without inventing missing days',()=>{
 const days=forecastByCalendarDay([{datetime:'2026-10-20T00:00:00+02:00',temperature:14},{datetime:'2026-10-22T00:00:00+02:00',temperature:16}],'Europe/Amsterdam');
 assert.equal(days.get('2026-10-20').temperature,14);assert.equal(days.has('2026-10-21'),false);assert.equal(days.get('2026-10-22').temperature,16);
});
