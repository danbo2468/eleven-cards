import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {graphPeriodRange,chooseGraphPeriod,moveGraphPeriod,resetGraphPeriod,connectTimeframeSync,disconnectTimeframeSync,timeframeSyncConfig} from '../shared/periods.js';
import {periodControls} from '../shared/period-controls.js';
const H=3600000,now=Date.parse('2026-10-26T12:00:00Z');
let groupId=0;
function host(group,hours=24,extra={}){
 const h={_connected:true,_config:{hours_to_show:hours,sync_timeframe:true,hover_sync_group:group,aggregation_period:'hour',...extra},_hass:{config:{time_zone:'Europe/Amsterdam'}},_status:'ready',_end:now,reloads:0,_reloadPeriod(){this.reloads++;this._viewport=null;}};
 resetGraphPeriod(h);connectTimeframeSync(h);return h;
}
test('default restores each card\'s own range; explicit selections share exact ranges and preserve config',t=>{
 t.mock.method(Date,'now',()=>now);const group=`ranges-${++groupId}`,a=host(group),b=host(group,672,{aggregation_period:'month'}),config=b._config;
 try{
  chooseGraphPeriod(a,'configured');assert.equal(graphPeriodRange(a).end-graphPeriodRange(a).start,24*H);assert.equal(graphPeriodRange(b).end-graphPeriodRange(b).start,672*H);assert.equal(b._periodHours,null);
  assert.equal(b.reloads,1);assert.equal(a.reloads,1);assert.strictEqual(b._config,config);assert.equal(b._config.aggregation_period,'month');
  b.shadowRoot={querySelector:()=>null};assert.match(periodControls(b,'nl').picker,/>Standaard \(672 uur\)</);assert.match(periodControls(b,'nl').picker,/data-period-option="configured"><span>Standaard \(672 uur\)/);
  chooseGraphPeriod(b,'month');moveGraphPeriod(a,-1);assert.deepEqual(graphPeriodRange(a),graphPeriodRange(b));assert.equal(b._periodOffset,-1);assert.equal(b.reloads,3);assert.equal(a.reloads,3);
  moveGraphPeriod(b,0);assert.equal(a._periodOffset,0);assert.equal(graphPeriodRange(a).end,now);
 }finally{disconnectTimeframeSync(a);disconnectTimeframeSync(b);}
});
test('resetting a historical selection restores defaults for late joins, reconnections and subsequent navigation',t=>{
 t.mock.method(Date,'now',()=>now);const group=`defaults-${++groupId}`,a=host(group,24),b=host(group,672);let c;
 try{
  chooseGraphPeriod(a,'month');moveGraphPeriod(a,-1);chooseGraphPeriod(b,'configured');
  for(const h of [a,b]){assert.equal(h._sharedTimeframe,null);assert.equal(h._periodMode,'configured');assert.equal(h._periodOffset,0);assert.equal(h._periodEnd,null);assert.equal(h._periodAnchor,null);assert.equal(graphPeriodRange(h).end-graphPeriodRange(h).start,h._config.hours_to_show*H);}
  c=host(group,168);assert.equal(graphPeriodRange(c).end-graphPeriodRange(c).start,168*H);assert.equal(c.reloads,0);
  disconnectTimeframeSync(a);connectTimeframeSync(a);assert.equal(graphPeriodRange(a).end-graphPeriodRange(a).start,24*H);
  moveGraphPeriod(a,-1);assert.deepEqual(graphPeriodRange(a),graphPeriodRange(b));assert.equal(graphPeriodRange(b).end,now-24*H);
  moveGraphPeriod(b,0);for(const h of [a,b,c])assert.equal(graphPeriodRange(h).end-graphPeriodRange(h).start,h._config.hours_to_show*H);
  chooseGraphPeriod(c,'7d');assert.deepEqual(graphPeriodRange(a),graphPeriodRange(b));assert.deepEqual(graphPeriodRange(b),graphPeriodRange(c));
 }finally{for(const h of [a,b,c].filter(Boolean))disconnectTimeframeSync(h);}
});
test('opt-out, independent groups, whitespace keys, invalid input and hidden controls',t=>{
 t.mock.method(Date,'now',()=>now);const key=`isolation-${++groupId}`,a=host(key),b=host(` ${key} `,48,{show_navigation:false}),off=host(key,12,{sync_timeframe:false}),other=host('other-'+key);
 try{
  chooseGraphPeriod(a,'7d');assert.deepEqual(graphPeriodRange(a),graphPeriodRange(b));assert.equal(off.reloads,0);assert.equal(other.reloads,0);
  for(const value of ['nope',0,8761])chooseGraphPeriod(a,value);moveGraphPeriod(a,2);assert.equal(b.reloads,1);
  assert.deepEqual(timeframeSyncConfig({}),{sync_timeframe:false,hover_sync_group:''});
  for(const config of [{sync_timeframe:'true'},{hover_sync_group:42},{timeframe_sync_group:42}])assert.throws(()=>timeframeSyncConfig(config));
 }finally{for(const h of [a,b,off,other])disconnectTimeframeSync(h);}
});
test('late and reconnected cards adopt the last choice without broadcasting; listeners are released',t=>{
 t.mock.method(Date,'now',()=>now);const key=`lifecycle-${++groupId}`,a=host(key);chooseGraphPeriod(a,'week');moveGraphPeriod(a,-1);const b=host(key,6);
 try{
  assert.deepEqual(graphPeriodRange(a),graphPeriodRange(b));assert.equal(b.reloads,0);assert.equal(a.reloads,2);
  disconnectTimeframeSync(b);chooseGraphPeriod(a,'1h');assert.equal(b._periodMode,'week');
  connectTimeframeSync(b);assert.equal(b._periodMode,'1h');assert.equal(b.reloads,0);
  connectTimeframeSync(b);chooseGraphPeriod(a,'6h');assert.equal(b.reloads,1,'repeated connect does not duplicate listeners');
  b._config={...b._config,hover_sync_group:'different-'+key};resetGraphPeriod(b);connectTimeframeSync(b);chooseGraphPeriod(a,'year');assert.equal(b._periodMode,'configured');
 }finally{disconnectTimeframeSync(a);disconnectTimeframeSync(b);}
 const groups=(globalThis.window??globalThis)[Symbol.for('eleven-cards.timeframe-sync.v1')];assert.equal(groups.get(key).listeners.size,0);
});
test('calendar DST, timezone agreement, rolling refresh and historical stability use a shared clock',t=>{
 let time=now;t.mock.method(Date,'now',()=>time);const key=`clock-${++groupId}`,a=host(key),b=host(key);b._hass.config.time_zone='America/New_York';
 try{
  chooseGraphPeriod(a,'today');moveGraphPeriod(a,-1);assert.equal(graphPeriodRange(b).end-graphPeriodRange(b).start,25*H);assert.deepEqual(graphPeriodRange(a),graphPeriodRange(b));
  time+=3*24*H;assert.deepEqual(graphPeriodRange(a),graphPeriodRange(b));assert.equal(graphPeriodRange(a).end,Date.parse('2026-10-25T23:00:00Z'));
  moveGraphPeriod(a,0);assert.equal(graphPeriodRange(b).end,time);
  chooseGraphPeriod(a,'48h');time+=61000;const range=graphPeriodRange(b);time+=123;assert.deepEqual(graphPeriodRange(a),range);assert.equal(range.end-range.start,48*H);
 }finally{disconnectTimeframeSync(a);disconnectTimeframeSync(b);}
});
const slugs=['history-graph-card','bar-chart','timeline-card','heatmap-card','overview-card','dynamic-energy-price-card'];
function environment(){
 const registry=new Map(),window=new EventTarget(),clock={now},requests=[];
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}}
 const context=vm.createContext({HTMLElement:class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}},window,document:{querySelector:()=>null,addEventListener(){},removeEventListener(){}},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},setTimeout,clearTimeout,structuredClone,URLSearchParams,Date:ClockDate,Intl,console:{info(){},log(){}}});
 for(const slug of slugs)vm.runInContext(readFileSync(new URL(`../cards/${slug}/dist/eleven-${slug}.js`,import.meta.url),'utf8'),context);
 const prices=Array.from({length:72},(_,i)=>({start_time:new Date(now-48*H+i*H).toISOString(),price_per_kwh:0.1+i/1000}));
 const hass={language:'nl',config:{time_zone:'Europe/Amsterdam'},states:{'sensor.a':{state:'999',attributes:{unit_of_measurement:'W'}},'sensor.price':{state:'0.1',attributes:{data:prices}}},callWS:async()=>[],callApi:async(_,url)=>{
  const q=new URLSearchParams(url.split('?')[1]),start=Date.parse(decodeURIComponent(url.split('history/period/')[1].split('?')[0])),end=Date.parse(q.get('end_time'));requests.push({start,end});
  return [[{entity_id:'sensor.a',state:'10',last_changed:new Date(start-H).toISOString(),attributes:{unit_of_measurement:'W'}},{entity_id:'sensor.a',state:'20',last_changed:new Date(start+Math.min(H,(end-start)/2)).toISOString(),attributes:{unit_of_measurement:'W'}}]];
 }};
 return {registry,clock,hass,requests};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('all six standalone bundles share one bus; navigation, requests, historical values, price availability and local zoom',async()=>{
 const {registry,hass,requests,clock}=environment(),cards=slugs.map((slug,i)=>{
  const card=new (registry.get('eleven-'+slug))();
  card.setConfig({entities:['sensor.a'],entity:slug==='dynamic-energy-price-card'?'sensor.price':'sensor.a',hours_to_show:i===3?168:24,data_source:'history',aggregation_period:'hour',sync_timeframe:true,hover_sync_group:'integration'});
  card.hass=hass;card.connectedCallback();return card;
 });
 try{
  await settle();const [history,bar,timeline,heatmap,overview,energy]=cards;
  await history._setPeriod('24h');await settle();await timeline._navigate(-1);await settle();
  const expected={start:now-48*H,end:now-24*H};
  for(const card of [history,bar,timeline,heatmap,overview]){assert.equal(card._start,expected.start);assert.equal(card._end,expected.end);assert.equal(card._status,'ready');}
  assert.equal(energy._chart.start,expected.start);assert.equal(energy._chart.span,24*H);
  assert.match(overview.shadowRoot.innerHTML,/>20<\/span>/);assert.doesNotMatch(overview.shadowRoot.innerHTML,/>999<\/span>/);
  assert.doesNotMatch(energy.shadowRoot.innerHTML,/class="chart-label day-label"[^>]*>Vandaag/);
  assert.ok(requests.some(r=>r.start===expected.start&&r.end===expected.end));
  const before=heatmap._sharedTimeframe;history._viewport=[now-30*H,now-25*H];history._render();assert.strictEqual(heatmap._sharedTimeframe,before);assert.equal(heatmap._start,expected.start);
  await bar._setPeriod('year');await settle();await bar._navigate(-1);await settle();
  assert.match(energy.shadowRoot.innerHTML,/geen prijsintervallen voor het gekozen tijdvak/);
  clock.now+=H;await history._navigate(0);await settle();assert.equal(heatmap._end,clock.now);
  await history._setPeriod('configured');await settle();
  for(const card of [history,bar,timeline,heatmap,overview]){
   assert.equal(card._end-card._start,card._config.hours_to_show*H);assert.equal(card._periodMode,'configured');assert.equal(card._periodHours,null);assert.equal(card._sharedTimeframe,null);
  }
  assert.match(heatmap.shadowRoot.innerHTML,/>Standaard \(168 uur\)</);assert.match(history.shadowRoot.innerHTML,/>Standaard \(24 uur\)</);
  assert.match(overview.shadowRoot.innerHTML,/>999<\/span>/);assert.equal(energy._sharedTimeframe,null);assert.ok(energy._chart,'native price window is restored');
  for(const card of cards){assert.equal(card._config.sync_timeframe,true);assert.equal(card._config.hover_sync_group,'integration');assert.equal(card._config.hours_to_show,card===heatmap?168:24);}
 }finally{for(const card of cards)card.disconnectedCallback();}
});
test('all six configurators expose the same opt-in switch and text key and reject invalid YAML',()=>{
 const {registry}=environment(),flatten=schema=>schema.flatMap(s=>s.schema?flatten(s.schema):[s]);
 for(const slug of slugs){
  const Card=registry.get('eleven-'+slug),fields=flatten(Card.getConfigForm().schema);
  const toggle=fields.find(s=>s.name==='sync_timeframe'),key=fields.find(s=>s.name==='hover_sync_group');
  assert.equal(toggle.default,false,slug);assert.ok(toggle.selector.boolean,slug);assert.ok(key.selector.text,slug);assert.equal(fields.filter(f=>f.name==='hover_sync_group').length,1,slug);assert.ok(!fields.some(f=>f.name==='timeframe_sync_group'),slug);
  for(const invalid of [{sync_timeframe:'true'},{hover_sync_group:42}])assert.throws(()=>new Card().setConfig({entities:['sensor.a'],entity:'sensor.a',...invalid}),slug);
 }
});
test('existing hover keys are shared by both synchronizations; legacy timeframe keys migrate without overriding hover',()=>{
 assert.deepEqual(timeframeSyncConfig({timeframe_sync_group:'old'}),{sync_timeframe:false,hover_sync_group:'old'});
 assert.equal(timeframeSyncConfig({hover_sync_group:'existing',timeframe_sync_group:'old'}).hover_sync_group,'existing');
 assert.equal(timeframeSyncConfig({hover_sync_group:'',timeframe_sync_group:'old'}).hover_sync_group,'');
 const {registry}=environment();
 for(const slug of slugs){
  const Card=registry.get('eleven-'+slug),base={entities:['sensor.a'],entity:'sensor.a',sync_timeframe:true,timeframe_sync_group:'old'};
  const card=new Card();card.setConfig(base);assert.equal(card._config.hover_sync_group,'old',slug);
  card.setConfig({...base,hover_sync_group:'existing'});assert.equal(card._config.hover_sync_group,'existing',slug);
  card.setConfig({...base,hover_sync_group:''});assert.equal(card._config.hover_sync_group,'',slug);
  if(Card.editorConfig){const draft=Card.editorConfig(base);assert.equal(draft.hover_sync_group,'old',slug);}
 }
 const Energy=registry.get('eleven-dynamic-energy-price-card'),fields=schema=>schema.flatMap(s=>s.schema?fields(s.schema):[s]);
 assert.ok(fields(Energy.getConfigForm(Energy.editorConfig({sync_hover:false,sync_timeframe:true})).schema).some(f=>f.name==='hover_sync_group'));
});
