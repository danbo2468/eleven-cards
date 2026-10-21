import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {graphPeriodRange,chooseGraphPeriod,moveGraphPeriod,resetGraphPeriod} from '../shared/periods.js';
import {statisticsPeriod} from '../cards/history-graph-card/src/history-utils.js';
import {periodControls} from '../shared/period-controls.js';
const H=3600000,D=24*H,now=Date.parse('2026-10-17T16:00:00Z');
const isoRange=host=>Object.values(graphPeriodRange(host)).map(t=>new Date(t).toISOString());
function host(hours=24,zone='Europe/Amsterdam'){
 const h={_config:{hours_to_show:hours},_hass:{config:{time_zone:zone}},_status:'ready',_end:now,reloads:0,_reloadPeriod(){this.reloads++;}};
 resetGraphPeriod(h);return h;
}
function periodMarkup(h,lang='nl'){
 const {start,end}=graphPeriodRange(h);Object.assign(h,{_start:start,_end:end,_viewStart:start,_viewEnd:end,shadowRoot:{querySelector:()=>null}});
 return periodControls(h,lang);
}
const periodName=controls=>controls.picker.match(/<span>([^<]+)<\/span>/)[1];

test('compact picker names distinguish current, historical and calendar periods without a separate range row',t=>{
 t.mock.method(Date,'now',()=>now);const h=host();
 assert.equal(periodName(periodMarkup(h)),'Standaard (24 uur)');
 assert.equal(periodMarkup(h).range,undefined);
 moveGraphPeriod(h,-1);assert.equal(periodName(periodMarkup(h)),'15–16 okt · 24 uur');
 chooseGraphPeriod(h,'1h');periodMarkup(h);moveGraphPeriod(h,-1);assert.equal(periodName(periodMarkup(h)),'17 okt · 16:00–17:00');
 chooseGraphPeriod(h,'week');moveGraphPeriod(h,-1);assert.equal(periodName(periodMarkup(h)),'5–11 okt');
 chooseGraphPeriod(h,'month');assert.equal(periodName(periodMarkup(h)),'Oktober 2026');
 moveGraphPeriod(h,-1);assert.equal(periodName(periodMarkup(h)),'September 2026');
 chooseGraphPeriod(h,'quarter');moveGraphPeriod(h,-1);assert.equal(periodName(periodMarkup(h)),'Q3 2026');
 chooseGraphPeriod(h,'year');moveGraphPeriod(h,-1);assert.equal(periodName(periodMarkup(h)),'2025');
 chooseGraphPeriod(h,'configured');h._config.hours_to_show=2160;assert.equal(periodName(periodMarkup(h)),'Standaard (2160 uur)');
 moveGraphPeriod(h,-1);assert.match(periodName(periodMarkup(h)),/ · 90 dagen$/);
});

test('historical labels retain cross-year and older-year context in the Home Assistant timezone',t=>{
 t.mock.method(Date,'now',()=>now);const h=host();h._periodOffset=-1;h._periodEnd=Date.parse('2027-01-01T12:00:00Z');
 assert.equal(periodName(periodMarkup(h)),'31 dec 2026–1 jan 2027 · 24 uur');
 h._periodEnd=Date.parse('2024-04-02T12:00:00Z');assert.equal(periodName(periodMarkup(h)),'1–2 apr 2024 · 24 uur');
 const tokyo=host(1,'Asia/Tokyo');tokyo._periodOffset=-1;tokyo._periodEnd=Date.parse('2026-10-17T15:30:00Z');
 assert.equal(periodName(periodMarkup(tokyo)),'17 okt 23:30–18 okt 00:30');
});

test('zoomed picker shows the visible range and keeps precise accessible popup details, including repeated DST hours',t=>{
 t.mock.method(Date,'now',()=>now);const h=host();periodMarkup(h);h._viewStart=now-6*H;
 let controls=periodControls(h,'nl');assert.equal(periodName(controls),'17 okt · 12:00–18:00');
 assert.match(controls.picker,/aria-description="[^"]*GMT\+2[^"]*Ingezoomd"/);assert.match(controls.picker,/class="period-current-range"/);
 assert.equal(periodName(periodControls(h,'en')),'17 Oct · 12:00–18:00');
 h._start=Date.parse('2026-10-25T00:00:00Z');h._end=h._start+6*H;h._viewStart=h._start+H/2;h._viewEnd=h._start+1.5*H;
 controls=periodControls(h,'nl');assert.equal(periodName(controls),'25 okt · 02:30 GMT+2–02:30 GMT+1');
 assert.match(controls.picker,/GMT\+2/);assert.match(controls.picker,/GMT\+1/);
});
test('presets keep configuration and aggregation intact; calendar periods end now',t=>{
 t.mock.method(Date,'now',()=>now);const h=host(2160),config=h._config;
 assert.deepEqual(isoRange(h),['2026-07-19T16:00:00.000Z','2026-10-17T16:00:00.000Z']);
 chooseGraphPeriod(h,'today');assert.deepEqual(isoRange(h),['2026-10-16T22:00:00.000Z','2026-10-17T16:00:00.000Z']);
 chooseGraphPeriod(h,'month');assert.deepEqual(isoRange(h),['2026-09-30T22:00:00.000Z','2026-10-17T16:00:00.000Z']);
 chooseGraphPeriod(h,'7d');assert.equal(graphPeriodRange(h).end-graphPeriodRange(h).start,7*D);
 chooseGraphPeriod(h,'90d');assert.equal(graphPeriodRange(h).end-graphPeriodRange(h).start,90*D);
 chooseGraphPeriod(h,'configured');assert.equal(graphPeriodRange(h).end-graphPeriodRange(h).start,90*D);
 assert.strictEqual(h._config,config);assert.equal(h._config.hours_to_show,2160);
 for(const value of ['garbage','0','8761','Infinity'])chooseGraphPeriod(h,value);
 assert.equal(h.reloads,5);
});
test('month navigation uses complete calendar months, preserves historical anchor across refresh and returns live',t=>{
 let time=now;t.mock.method(Date,'now',()=>time);const h=host();
 chooseGraphPeriod(h,'month');moveGraphPeriod(h,-1);
 assert.deepEqual(isoRange(h),['2026-08-31T22:00:00.000Z','2026-09-30T22:00:00.000Z']);
 time=Date.parse('2026-11-02T12:00:00Z');
 assert.deepEqual(isoRange(h),['2026-08-31T22:00:00.000Z','2026-09-30T22:00:00.000Z'],'refresh must not move a historical month');
 moveGraphPeriod(h,1);assert.deepEqual(isoRange(h),['2026-10-31T23:00:00.000Z','2026-11-02T12:00:00.000Z']);
 moveGraphPeriod(h,1);assert.equal(h._periodOffset,0,'cannot navigate into the future');
 moveGraphPeriod(h,-1);moveGraphPeriod(h,0);assert.equal(h._periodAnchor,null);
});
test('day navigation respects both DST transitions; leap months retain calendar length',t=>{
 let time=Date.parse('2026-03-30T10:00:00Z');t.mock.method(Date,'now',()=>time);const h=host();
 chooseGraphPeriod(h,'today');moveGraphPeriod(h,-1);
 assert.deepEqual(isoRange(h),['2026-03-28T23:00:00.000Z','2026-03-29T22:00:00.000Z']);
 assert.equal(graphPeriodRange(h).end-graphPeriodRange(h).start,23*H);
 time=Date.parse('2026-10-26T10:00:00Z');chooseGraphPeriod(h,'today');moveGraphPeriod(h,-1);
 assert.equal(graphPeriodRange(h).end-graphPeriodRange(h).start,25*H);
 time=Date.parse('2024-03-15T10:00:00Z');chooseGraphPeriod(h,'month');moveGraphPeriod(h,-1);
 assert.deepEqual(isoRange(h),['2024-01-31T23:00:00.000Z','2024-02-29T23:00:00.000Z']);
 assert.equal(graphPeriodRange(h).end-graphPeriodRange(h).start,29*D);
});
test('rolling windows stay fixed while browsing, step by their full duration and resume live',t=>{
 let time=now;t.mock.method(Date,'now',()=>time);const h=host();chooseGraphPeriod(h,'7d');
 moveGraphPeriod(h,-1);assert.deepEqual(graphPeriodRange(h),{start:now-14*D,end:now-7*D});
 time+=H;assert.equal(graphPeriodRange(h).end,now-7*D);
 moveGraphPeriod(h,-1);assert.equal(graphPeriodRange(h).end,now-14*D);
 moveGraphPeriod(h,1);assert.equal(graphPeriodRange(h).end,now-7*D);
 moveGraphPeriod(h,1);assert.equal(graphPeriodRange(h).end,time);
 assert.equal(h._periodEnd,null);moveGraphPeriod(h,1);assert.equal(h._periodOffset,0);
});
test('automatic statistics also covers short windows browsed into older history',t=>{
 t.mock.method(Date,'now',()=>now);const config={data_source:'auto',hours_to_show:24,aggregation_period:'hour'};
 assert.equal(statisticsPeriod(config,now),null);
 assert.equal(statisticsPeriod(config,now-3*D),'hour');
 assert.equal(statisticsPeriod({...config,data_source:'history'},now-90*D),null);
 assert.equal(statisticsPeriod({...config,aggregation_period:'minute'},now-90*D),null);
});

test('all rolling presets retain their exact duration when browsing and returning live',t=>{
 t.mock.method(Date,'now',()=>now);
 for(const [value,hours]of [['1h',1],['6h',6],['12h',12],['24h',24],['48h',48],['7d',168],['14d',336],['30d',720],['90d',2160],['365d',8760]]){
  const h=host(2160);chooseGraphPeriod(h,value);
  assert.deepEqual(graphPeriodRange(h),{start:now-hours*H,end:now},value);
  moveGraphPeriod(h,-1);assert.deepEqual(graphPeriodRange(h),{start:now-2*hours*H,end:now-hours*H},value);
  moveGraphPeriod(h,0);assert.equal(graphPeriodRange(h).end,now);assert.equal(h._config.hours_to_show,2160);
 }
});

test('calendar weeks start Monday and historical weeks follow DST with a fixed anchor',t=>{
 let time=Date.parse('2026-03-30T10:00:00Z');t.mock.method(Date,'now',()=>time);const h=host();
 chooseGraphPeriod(h,'week');assert.deepEqual(isoRange(h),['2026-03-29T22:00:00.000Z','2026-03-30T10:00:00.000Z']);
 moveGraphPeriod(h,-1);assert.deepEqual(isoRange(h),['2026-03-22T23:00:00.000Z','2026-03-29T22:00:00.000Z']);
 assert.equal(graphPeriodRange(h).end-graphPeriodRange(h).start,167*H);
 time=Date.parse('2026-04-15T10:00:00Z');assert.equal(graphPeriodRange(h).start,Date.parse('2026-03-22T23:00:00Z'));
 moveGraphPeriod(h,0);assert.equal(graphPeriodRange(h).start,Date.parse('2026-04-12T22:00:00Z'));
 time=Date.parse('2027-01-03T10:00:00Z');chooseGraphPeriod(h,'week');assert.equal(graphPeriodRange(h).start,Date.parse('2026-12-27T23:00:00Z'));
 time=Date.parse('2026-10-26T10:00:00Z');chooseGraphPeriod(h,'week');moveGraphPeriod(h,-1);assert.equal(graphPeriodRange(h).end-graphPeriodRange(h).start,169*H);
});

test('quarters and years use calendar boundaries, leap years and complete previous periods',t=>{
 let time=now;t.mock.method(Date,'now',()=>time);const h=host();
 chooseGraphPeriod(h,'quarter');assert.deepEqual(isoRange(h),['2026-09-30T22:00:00.000Z','2026-10-17T16:00:00.000Z']);
 moveGraphPeriod(h,-1);assert.deepEqual(isoRange(h),['2026-06-30T22:00:00.000Z','2026-09-30T22:00:00.000Z']);
 moveGraphPeriod(h,-3);assert.equal(h._periodOffset,-1,'invalid direction is ignored');
 time=Date.parse('2027-01-12T12:00:00Z');chooseGraphPeriod(h,'quarter');moveGraphPeriod(h,-1);
 assert.deepEqual(isoRange(h),['2026-09-30T22:00:00.000Z','2026-12-31T23:00:00.000Z']);
 time=Date.parse('2025-03-15T12:00:00Z');chooseGraphPeriod(h,'year');assert.equal(graphPeriodRange(h).start,Date.parse('2024-12-31T23:00:00Z'));
 moveGraphPeriod(h,-1);assert.deepEqual(isoRange(h),['2023-12-31T23:00:00.000Z','2024-12-31T23:00:00.000Z']);
 assert.equal(graphPeriodRange(h).end-graphPeriodRange(h).start,366*D);
 time=Date.parse('2028-04-15T12:00:00Z');assert.equal(graphPeriodRange(h).end,Date.parse('2024-12-31T23:00:00Z'));
 moveGraphPeriod(h,1);assert.equal(graphPeriodRange(h).start,Date.parse('2027-12-31T23:00:00Z'));assert.equal(graphPeriodRange(h).end,time);
});

function load(slug){
 const clock={now},registry=new Map();
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}}
 const ctx=vm.createContext({HTMLElement:class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}},window:new EventTarget(),document:{querySelector:()=>null,addEventListener(){},removeEventListener(){}},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},setTimeout,clearTimeout,structuredClone,URLSearchParams,Date:ClockDate,Intl,console:{info(){},log(){}}});
 vm.runInContext(readFileSync(new URL(`../cards/${slug}/dist/eleven-${slug}.js`,import.meta.url),'utf8'),ctx);
 return {Card:registry.get(`eleven-${slug}`),clock};
}
for(const slug of ['history-graph-card','bar-chart','timeline-card']){
 test(`${slug}: presets and navigation request their actual range, retain config, reset zoom and expose history links`,async()=>{
  const {Card,clock}=load(slug),card=new Card(),requests=[];
  card.setConfig({entities:['sensor.a'],hours_to_show:24,aggregation_period:'hour',aggregation_method:'avg'});
  const config=card._config;
  card.hass={language:'nl',config:{time_zone:'Europe/Amsterdam'},states:{'sensor.a':{state:'10',attributes:{unit_of_measurement:'W'}}},callApi:async(_,url)=>{
   const query=new URLSearchParams(url.split('?')[1]),a=Date.parse(decodeURIComponent(url.split('history/period/')[1].split('?')[0])),b=Date.parse(query.get('end_time'));
   requests.push({source:'history',start:a,end:b});return [[{entity_id:'sensor.a',state:'10',last_changed:new Date(a).toISOString()}]];
  },callWS:async msg=>{
   if(msg.type==='recorder/get_statistics_metadata')return [{statistic_id:'sensor.a',has_mean:true,unit_of_measurement:'W'}];
   requests.push({source:'statistics',start:Date.parse(msg.start_time),end:Date.parse(msg.end_time)});
   return {'sensor.a':[{start:Date.parse(msg.start_time),end:Date.parse(msg.end_time),mean:10}]};
  }};
  card.connectedCallback();await new Promise(r=>setImmediate(r));
  try{
   assert.equal(card._status,'ready');assert.equal(requests.at(-1).start,now-D);
   for(const value of ['configured','1h','6h','12h','24h','48h','7d','14d','30d','90d','365d','today','week','month','quarter','year'])assert.match(card.shadowRoot.innerHTML,new RegExp(`data-period-option="${value}"`));
   assert.match(card.shadowRoot.innerHTML,/Standaard \(24 uur\)/);
  assert.match(card.shadowRoot.innerHTML,/aria-haspopup="dialog"/);
   card._viewport=[now-H,now];await card._setPeriod('month');
   assert.equal(card._viewport,null);assert.equal(card._start,Date.parse('2026-09-30T22:00:00Z'));assert.equal(card._end,now);
   await card._navigate(-1);assert.equal(card._start,Date.parse('2026-08-31T22:00:00Z'));assert.equal(card._end,Date.parse('2026-09-30T22:00:00Z'));
   const historicalEnd=card._end;clock.now+=H;await card._refresh();assert.equal(card._end,historicalEnd);
   const link=card.shadowRoot.innerHTML.match(/class="history-link"[^>]*href="([^"]+)"/)[1].replaceAll('&amp;','&');
   assert.equal(new URL(link,'http://ha').searchParams.get('end_date'),new Date(historicalEnd).toISOString());
   await card._navigate(0);assert.equal(card._end,clock.now);
   await card._setPeriod('today');await card._navigate(-1);assert.equal(card._end-card._start,D);
   await card._setPeriod('7d');await card._navigate(-1);assert.equal(card._end,clock.now-7*D);
   await card._navigate(1);assert.equal(card._end,clock.now);
   for(const [preset,start]of [['week','2026-10-11T22:00:00Z'],['quarter','2026-09-30T22:00:00Z'],['year','2025-12-31T23:00:00Z']]){
    await card._setPeriod(preset);assert.equal(card._start,Date.parse(start));assert.equal(card._end,clock.now);
    assert.equal(requests.at(-1).start,card._start);assert.equal(requests.at(-1).end,card._end);
   }
   for(const [preset,hours]of [['1h',1],['6h',6],['12h',12],['24h',24],['48h',48],['14d',336],['30d',720],['365d',8760]]){
    await card._setPeriod(preset);assert.equal(card._start,clock.now-hours*H);assert.equal(card._end,clock.now);
    assert.equal(requests.at(-1).start,card._start);assert.equal(requests.at(-1).end,card._end);
   }
   await card._setPeriod('configured');assert.equal(card._end-card._start,D);
   assert.deepEqual(card._config,config);assert.equal(card._config.aggregation_period,'hour');assert.equal(card._config.hours_to_show,24);
   if(slug!=='timeline-card')assert.ok(requests.some(r=>r.source==='statistics'));
   assert.match(card.shadowRoot.innerHTML,/data-period="next"[^>]*disabled/);
   card.setConfig({...config,show_navigation:false});assert.doesNotMatch(card.shadowRoot.innerHTML,/class="period-controls"/);
  }finally{card.disconnectedCallback();}
 });
 test(`${slug}: changing period ignores an older pending request`,async()=>{
  const {Card}=load(slug),card=new Card();let resolve;
  card.setConfig({entities:['sensor.a'],hours_to_show:24});
  let calls=0;
  card.hass={states:{'sensor.a':{state:'2',attributes:{}}},callApi:async()=>++calls===1?new Promise(r=>resolve=r):[[{entity_id:'sensor.a',state:'2',last_changed:new Date(now-100*D).toISOString()}]],callWS:async msg=>msg.type==='recorder/get_statistics_metadata'?[{statistic_id:'sensor.a',has_mean:true}]:{'sensor.a':[{start:now-90*D,end:now,mean:2}]}};
  card.connectedCallback();await card._setPeriod('90d');
  resolve([[{entity_id:'sensor.a',state:'999',last_changed:new Date(now-D).toISOString()}]]);
  await new Promise(r=>setImmediate(r));
  try{assert.equal(card._status,'ready');assert.equal(card._start,now-90*D);assert.doesNotMatch(JSON.stringify(card._series),/999/);}finally{card.disconnectedCallback();}
 });
}
