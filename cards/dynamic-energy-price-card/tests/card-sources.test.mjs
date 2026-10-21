import * as periods from '../../../shared/periods.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as utils from '../src/price-utils.js';
import * as graph from '../../../shared/graph.js';
import * as localization from '../src/localization.js';
let Card;const timers=new Map();let timerId=0;
vm.runInNewContext(readFileSync(new URL('../src/dynamic-energy-price-card.js',import.meta.url),'utf8').replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm,''),{
 ...periods,...graph,...utils,...localization,Date,Intl,URLSearchParams,console,
 setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
 HTMLElement:class{attachShadow(){this.shadowRoot={querySelector:()=>null,querySelectorAll:()=>[]};}},
 customElements:{get:()=>undefined,define:(n,c)=>{if(n==='eleven-dynamic-energy-price-card')Card=c;}},window:{addEventListener(){},removeEventListener(){}}
});
test('new cards have no preselected entity and render a localized source prompt',()=>{
 assert.equal(Card.getStubConfig().entity,undefined);
 const c=new Card();assert.doesNotThrow(()=>c.setConfig({}));
 c.hass={language:'nl',states:{},config:{time_zone:'Europe/Amsterdam'}};
 assert.match(c.shadowRoot.innerHTML,/Kies een prijsbron/);
 c.hass={language:'en',states:{},config:{time_zone:'Europe/Amsterdam'}};
 assert.match(c.shadowRoot.innerHTML,/Choose a price source/);
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const base=()=>{const c=new Card();c._render=()=>{};return c;};
const reply={response:{success:true,price_info:[{startsAt:'2026-10-15T00:00:00+02:00',total:-.0123}]}};
test('a stalled Tibber request times out and can be retried',async()=>{
 const c=base();c.setConfig({import_source:'tibber_prices'});let calls=0;
 c._hass={config:{time_zone:'UTC'},states:{},callWS:()=>{calls++;return new Promise(()=>{});}};
 c._ensureTibber('import');const timer=[...timers.values()].find(item=>item.delay===15000);assert.ok(timer);
 timer.fn();await tick();assert.equal(c._tibberCache.get(c._tibberKey('import')).status,'error');
 c._tibberCache.get(c._tibberKey('import')).fetchedAt-=60001;c._ensureTibber('import');assert.equal(calls,2);
 c.disconnectedCallback();
});
test('Tibber source calls read-only get_price in EUR with no sensor and caches/deduplicates identical entries',async()=>{
 const c=base();c.setConfig({import_source:'tibber_prices',export_source:'tibber_prices',graph_mode:'both',import_tibber_entry:'entry-one',export_tibber_entry:'entry-one'});
 let calls=0;let message;
 c._hass={config:{time_zone:'Europe/Amsterdam'},states:{},callWS:async m=>{calls++;message=m;return reply;}};
 c._ensureTibber('import');c._ensureTibber('export');await tick();
 assert.equal(calls,1);assert.equal(message.type,'call_service');assert.equal(message.domain,'tibber_prices');assert.equal(message.service,'get_price');assert.equal(message.return_response,true);
 assert.equal(message.service_data.entry_id,'entry-one');
 assert.deepEqual(Object.keys(message.service_data).sort(),['end_time','entry_id','start_time']);
 assert.equal(utils.localDayKey(message.service_data.start_time,'Europe/Amsterdam'),utils.localDayKey(new Date(),'Europe/Amsterdam'));
 assert.equal(utils.localHour(message.service_data.start_time,'Europe/Amsterdam'),0);
 assert.equal(utils.localDayKey(message.service_data.end_time,'Europe/Amsterdam'),utils.addDaysToKey(utils.localDayKey(new Date(),'Europe/Amsterdam'),2));
 assert.equal(utils.localHour(message.service_data.end_time,'Europe/Amsterdam'),0);
 assert.equal(c._sourceState('import').attributes.data[0].price_per_kwh,-.0123);
 assert.equal(c._hasExportSource(),true);
 c._ensureTibber('import');assert.equal(calls,1);
 c._tibberCache.values().next().value.fetchedAt-=300001;c._ensureTibber('import');await tick();assert.equal(calls,2);
});
test('get_price renders without an entity, preserves negative prices and handles missing service and non-EUR honestly',async()=>{
 const c=new Card();c.setConfig({import_source:'tibber_prices'});
 const start=new Date();start.setUTCHours(0,0,0,0);
 const data=Array.from({length:24},(_,i)=>({start_time:new Date(+start+i*3600000).toISOString(),price_per_kwh:i===0?-.0123:.25}));
 c.hass={language:'en',config:{time_zone:'UTC',currency:'EUR'},states:{},callWS:async()=>({response:{success:true,price_info:data.map(r=>({startsAt:r.start_time,total:r.price_per_kwh}))}})};
 assert.match(c.shadowRoot.innerHTML,/Loading Tibber prices/);await tick();
 assert.match(c.shadowRoot.innerHTML,/price-line import-line/);assert.equal(c._chart.timeline[0].importPrice,-.0123);
 c.setConfig({import_source:'tibber_prices'});c.hass={...c._hass,callWS:async()=>{throw Error('Service not found');}};await tick();
 assert.match(c.shadowRoot.innerHTML,/Tibber prices unavailable/);assert.doesNotMatch(c.shadowRoot.innerHTML,/price-line import-line/);
 c.setConfig({import_source:'tibber_prices'});c.hass={...c._hass,config:{time_zone:'UTC',currency:'NOK'},callWS:async()=>reply};await tick();
 assert.match(c.shadowRoot.innerHTML,/Only EUR\/kWh/);
});
test('late get_price responses cannot survive reconfiguration or disconnect, and default sensors never call a service',async()=>{
 let resolve,calls=0;
 const c=base();c.setConfig({import_source:'tibber_prices'});c._hass={states:{},callWS:()=>{calls++;return new Promise(r=>resolve=r);}};
 c._ensureTibber('import');c.setConfig({entity:'sensor.other'});resolve(reply);await tick();assert.equal(c._tibberCache.size,0);
 c._ensureTibber('import');assert.equal(calls,1);
 c.setConfig({import_source:'tibber_prices'});c._ensureTibber('import');c.disconnectedCallback();resolve(reply);await tick();assert.equal(c._tibberCache.size,0);
});
test('native source selectors reveal only the matching source fields without discarding dormant entity values',()=>{
 const flat=s=>s.flatMap(f=>f.schema?flat(f.schema):[f]);
 for(const prefix of ['import','export']) {
  const old=Card.getConfigForm({});const oldFields=new Map(flat(old.schema).map(s=>[s.name,s]));
  assert.ok(oldFields.has(`${prefix}_source`));assert.ok(oldFields.has(prefix==='import'?'entity':'export_entity'));
  assert.ok(!oldFields.has(`${prefix}_tibber_entry`));
  const form=Card.getConfigForm({[`${prefix}_source`]:'tibber_prices'}),fields=new Map(flat(form.schema).map(s=>[s.name,s]));
  assert.ok(!fields.has(prefix==='import'?'entity':'export_entity'));
  assert.equal(fields.get(`${prefix}_tibber_entry`).selector.config_entry.integration,'tibber_prices');
  const source=fields.get(`${prefix}_source`);
  assert.notEqual(form.computeLabel.call({hass:{language:'en'}},source),form.computeLabel.call({hass:{language:'nl'}},source));
 }
 const data=Card.editorConfig({entity:'sensor.existing',import_source:'tibber_prices'});assert.equal(data.entity,'sensor.existing');
});
test('HA reconnection invalidates get_price and detach removes price connection listeners',async()=>{
 const listeners=new Map();const connection={connected:true,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 const c=base();c.setConfig({import_source:'tibber_prices'});c.hass={connection,states:{},callWS:async()=>reply};
 c._ensureTibber('import');await tick();assert.ok(c._sourceState('import'));assert.ok(listeners.has('ready'));
 listeners.get('ready')();assert.equal(c._tibberCache.size,0);
 connection.connected=false;c._ensureTibber('import');assert.equal(c._tibberCache.size,0);
 c.disconnectedCallback();assert.equal(listeners.size,0);
});
test('attached get_price cards refresh after five minutes and cancel the timer when detached',async()=>{
 const c=base();c.isConnected=true;c.setConfig({import_source:'tibber_prices'});c._hass={states:{},callWS:async()=>reply};
 c._ensureTibber('import');await tick();assert.ok(c._tibberTimer);const timer=timers.get(c._tibberTimer);assert.equal(timer.delay,300000);
 timer.fn();assert.equal(c._tibberCache.size,0);
 c._ensureTibber('import');await tick();const id=c._tibberTimer;c.disconnectedCallback();assert.ok(!timers.has(id));
});
test('Zonneplan One forecast supports current quarter-hour and legacy hourly shapes in EUR/kWh, never null as zero',()=>{
 const c=base();assert.doesNotThrow(()=>c.setConfig({entity:'sensor.zonneplan',import_source:'zonneplan'}));
 c._hass={states:{'sensor.zonneplan':{attributes:{forecast:[
  {start_date:'2026-10-15T00:00:00+02:00',price_tax_included:{amount:-123000}},
  {datetime:'2026-10-15T01:00:00+02:00',electricity_price:2500000},
  {datetime:'2026-10-15T02:00:00+02:00',electricity_price:null},
  {datetime:'2026-10-15T03:00:00+02:00',electricity_price:0},
 ]}}}};
 const data=c._sourceState('import').attributes.data;
 assert.equal(data.length,3);assert.ok(Math.abs(data[0].price_per_kwh+.0123)<1e-12);assert.equal(data[1].price_per_kwh,.25);assert.equal(data[2].price_per_kwh,0);
});
test('get_price isolates two entries and does not keep stale data after a failed refresh',async()=>{
 const c=base();c.setConfig({import_source:'tibber_prices',export_source:'tibber_prices',import_tibber_entry:'import-entry',export_tibber_entry:'export-entry',graph_mode:'both'});
 const calls=[];c._hass={states:{},callWS:async m=>{calls.push(m);return {response:{price_info:[{startsAt:'2026-10-15T00:00:00Z',total:m.service_data.entry_id==='import-entry'?.25:.12}]}};}};
 c._ensureTibber('import');c._ensureTibber('export');await tick();
 assert.equal(calls.length,2);assert.equal(c._sourceState('import').attributes.data[0].price_per_kwh,.25);assert.equal(c._sourceState('export').attributes.data[0].price_per_kwh,.12);
 for(const request of c._tibberCache.values())request.fetchedAt-=300001;
 c._hass.callWS=async()=>({response:{success:false,price_info:[]}});
 c._ensureTibber('import');await tick();
 assert.equal(c._sourceState('import'),null);assert.ok(c._sourceState('export'));
 assert.equal(c._tibberCache.get(c._tibberKey('import')).status,'error');
});

test('data resolved before attachment still schedules a refresh on the attached cached render',async()=>{
 const c=base();c.setConfig({import_source:'tibber_prices'});c._hass={states:{},callWS:async()=>reply};c._ensureTibber('import');await tick();assert.equal(c._tibberTimer,undefined);
 c.isConnected=true;c._ensureTibber('import');assert.ok(c._tibberTimer);c.disconnectedCallback();
});
