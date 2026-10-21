import * as periods from '../../../shared/periods.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as utils from '../src/price-utils.js';
import * as graph from '../../../shared/graph.js';
import * as localization from '../src/localization.js';
let Card;
vm.runInNewContext(readFileSync(new URL('../src/dynamic-energy-price-card.js', import.meta.url),'utf8').replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm,''), {
 ...periods,...graph, ...utils, ...localization, Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-11T21:00:30+02:00'])); } static now() { return Date.parse('2026-10-11T21:00:30+02:00'); } }, Intl, URLSearchParams, console, setTimeout, clearTimeout,
 HTMLElement: class {attachShadow(){this.shadowRoot = {querySelector:()=>null,querySelectorAll:()=>[]};}},
 customElements:{get:()=>undefined,define:(_,c)=>Card=c}, window:{addEventListener(){},removeEventListener(){}},
});
const make = config => { const c=new Card();c.setConfig({entity:'sensor.price',...config});return c;};
const base=Date.parse('2026-10-11T00:00:00+02:00');
const energy={attributes:{unit_of_measurement:'kWh',device_class:'energy',state_class:'total_increasing'}};
const history=Array.from({length:13},(_,i)=>({state:String(100+i*.1),last_changed:new Date(base+i*300000).toISOString()}));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('history loader deduplicates/cache-renders measured intervals and does not request when off/missing/invalid',async()=>{
 assert.equal(typeof make()._ensureConsumption,'function');
 let calls=0; const hass={states:{'sensor.energy':energy},callApi:async(method,path)=>{calls++;assert.equal(method,'GET');assert.match(path,/history\/period/);return [history];}};
 for(const config of [{},{show_consumption:true},{show_consumption:true,consumption_entity:'sensor.watts'}]){
  const c=make(config);c._hass=hass;c._render=()=>{};c._ensureConsumption(base,base+3600000,15);assert.equal(calls,0);
 }
 const c=make({show_consumption:true,consumption_entity:'sensor.energy'});c._hass=hass;let renders=0;c._render=()=>renders++;
 c._ensureConsumption(base,base+3600000,15);c._ensureConsumption(base,base+3600000,15);await tick();
 assert.equal(calls,1);assert.equal(renders,1);assert.equal(c._consumption.points.length,4);assert.equal(c._consumption.intervalMinutes,15);
 c._ensureConsumption(base,base+3600000,15);assert.equal(calls,1);
 c._consumption.fetchedAt-=300001;c._ensureConsumption(base,base+3600000,15);await tick();assert.equal(calls,2);
});
test('loader falls back to genuine hourly changes, catches errors, and ignores stale responses after entity/off/disconnect',async()=>{
 let stats=0;
 const c=make({show_consumption:true,consumption_entity:'sensor.energy'});c._render=()=>{};
 c._hass={states:{'sensor.energy':energy},callApi:async()=>[],callWS:async msg=>{stats++;assert.equal(msg.period,'hour');assert.equal(msg.units.energy,'kWh');return {'sensor.energy':[{start:base,end:base+3600000,change:.6}]};}};
 c._ensureConsumption(base,base+3600000,15);await tick();
 assert.equal(stats,1);assert.equal(c._consumption.intervalMinutes,60);assert.equal(c._consumption.points[0].energy,.6);
 let resolve; c.setConfig({entity:'sensor.price',show_consumption:true,consumption_entity:'sensor.energy'});
 c._hass.callApi=()=>new Promise(r=>resolve=r);c._ensureConsumption(base,base+3600000,15);
 c.setConfig({entity:'sensor.price',show_consumption:false});resolve([history]);await tick();assert.equal(c._consumption,undefined);
 c.setConfig({entity:'sensor.price',show_consumption:true,consumption_entity:'sensor.energy'});c._ensureConsumption(base,base+3600000,15);
 c.disconnectedCallback();resolve([history]);await tick();assert.equal(c._consumption,undefined);
 c._hass.callApi=async()=>{throw Error('permission')};c._hass.callWS=async()=>{throw Error('permission')};c._ensureConsumption(base,base+3600000,15);await tick();assert.equal(c._consumption.status,'error');
});
test('pending history cannot restore an overlay after source disappears',async()=>{
 let resolve;const c=make({show_consumption:true,consumption_entity:'sensor.energy'});c._render=()=>{};
 c._hass={states:{'sensor.energy':energy},callApi:()=>new Promise(r=>resolve=r)};
 c._ensureConsumption(base,base+3600000,15);delete c._hass.states['sensor.energy'];
 c._ensureConsumption(base,base+3600000,15);resolve([history]);await tick();assert.equal(c._consumption.status,'source');
});
test('a short synchronized window keeps the original price cadence and skips inverted consumption history',()=>{
 const prices=Array.from({length:48},(_,i)=>({start_time:new Date(base+i*900000).toISOString(),price_per_kwh:.2}));
 const card=make({sync_timeframe:true,show_consumption:true,consumption_entity:'sensor.energy',export_entity:'sensor.export',graph_mode:'both'});
 let historyCalls=0;
 card._hass={language:'en',config:{time_zone:'Europe/Amsterdam'},states:{'sensor.price':{attributes:{data:prices}},'sensor.export':{attributes:{data:prices}},'sensor.energy':energy},callApi:()=>{historyCalls++;return Promise.resolve([]);}};
 const start=base+10*3600000+20*60000,end=start+5*60000;
 card._sharedTimeframe={group:'default',offset:1,end,range:{start,end}};
 card._render();
 assert.equal(card._chart.intervalMs,900000);
 assert.equal(card._chart.timeline.length,1);
 assert.equal(card._consumption.status,'empty');
 assert.equal(historyCalls,0);
});
test('render adds independent kWh scale and measured line in every tariff mode while optional-off preserves geometry',()=>{
 const c=make({show_consumption:true,consumption_entity:'sensor.energy',export_entity:'sensor.export'});
 const prices=Array.from({length:96},(_,i)=>({start_time:new Date(base+i*900000).toISOString(),price_per_kwh:.1+i*.002}));
 c._hass={language:'en',config:{time_zone:'Europe/Amsterdam'},states:{'sensor.price':{attributes:{data:prices}},'sensor.export':{attributes:{data:prices}},'sensor.energy':energy}};
 c._ensureConsumption=()=>{};
 for(const mode of ['import','export','both']){
  c._config.graph_mode=mode;c._consumption={status:'ready',intervalMinutes:15,points:utils.consumptionFromHistory(history,base,base+3600000,15)};
  c._render();const html=c.shadowRoot.innerHTML;
  assert.match(html,/class="price-line consumption-line"/);assert.match(html,/energy-axis-label/);
  assert.match(html,/Grid import.*kWh \/ 15 min/);assert.doesNotMatch(html,/class="area consumption-area/);
  assert.equal(c._chart.consumptionPoints.length,4);
  c._config.show_consumption=false;c._render();const off=c.shadowRoot.innerHTML;
  assert.doesNotMatch(off,/class="price-line consumption-line"|class="chart-label energy-axis-label/);
  assert.equal(c._chart.plotRight,12);c._config.show_consumption=true;
 }
 c._config.show_consumption_fill=true;c._config.consumption_fill_fade=false;c._render();assert.match(c.shadowRoot.innerHTML,/class="area consumption-area"/);
 assert.ok(c.shadowRoot.innerHTML.indexOf('class="area consumption-area"')<c.shadowRoot.innerHTML.indexOf('class="price-line import-line"'),'energy fill stays behind price lines');
 c._toggleSeries('consumption');assert.doesNotMatch(c.shadowRoot.innerHTML,/class="price-line consumption-line"/);
});
test('consumption tooltip uses its actual interval, localized kWh value and honest gaps/future rather than hourly division',()=>{
 const c=make({show_consumption:true});assert.equal(typeof c._consumptionTooltip,'function');
 c._chart={graphShowsConsumption:true,timeZone:'Europe/Amsterdam',consumptionPoints:[{timestamp:base,endTimestamp:base+3600000,energy:.6}],consumptionAppearance:c._seriesAppearance('consumption')};
 for(const language of ['nl','en']){
  c._hass={language};const entry=c._consumptionTooltip(base+900000);
  assert.match(entry.html,/00:00–01:00/);assert.match(entry.html,language==='nl'?/0,600 kWh/:/0\.600 kWh/);
  assert.equal(entry.point.energy,.6);
  assert.match(c._consumptionTooltip(base+3600000).html,/—/);
 }
 c._chart.graphShowsConsumption=false;assert.equal(c._consumptionTooltip(base),null);
});
test('same-object HA ready event invalidates cache and disconnection removes listeners',async()=>{
 const listeners=new Map();const connection={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n)=>listeners.delete(n)};
 const c=make({show_consumption:true,consumption_entity:'sensor.energy'});c._render=()=>{};
 c.hass={connection,states:{'sensor.energy':energy},themes:{}};
 assert.ok(listeners.has('ready'));
 c._consumption={points:[{energy:1}]};listeners.get('ready')();assert.equal(c._consumption,undefined);
 c.disconnectedCallback();assert.equal(listeners.size,0);
});
test('consumption is optional, thin and muted with independent native flat localized controls',()=>{
 const c=make();assert.equal(c._config.show_consumption,false);
 assert.equal(c._config.show_consumption_fill,false);
 assert.equal(c._seriesAppearance('consumption').width,1.5);
 assert.equal(c._seriesAppearance('consumption').stroke,'var(--secondary-text-color)');
 const form=Card.getConfigForm({show_consumption:true,show_consumption_fill:true,consumption_fill_mode:'own'}); const group=form.schema.find(s=>s.name==='consumption_settings');
 assert.ok(group);assert.equal(group.flatten,true);
 const flat=s=>s.flatMap(f=>f.schema?flat(f.schema):[f]);const fields=new Map(flat(group.schema).map(s=>[s.name,s]));
 for(const name of ['show_consumption','consumption_entity','consumption_line_style','consumption_line_width','consumption_line_color','show_consumption_fill','consumption_fill_color','consumption_fill_fade']){
  const s=fields.get(name);assert.ok(s,name);
  assert.notEqual(form.computeLabel.call({hass:{language:'nl'}},s),name);
  assert.notEqual(form.computeLabel.call({hass:{language:'en'}},s),form.computeLabel.call({hass:{language:'nl'}},s));
  assert.ok(form.computeHelper.call({hass:{language:'en'}},s));
 }
 const custom=make({consumption_line_style:'dotted',consumption_line_width:2,consumption_line_color:[0,0,0],show_consumption_fill:false,consumption_fill_fade:false});
 assert.equal(custom._seriesAppearance('consumption').stroke,'rgb(0, 0, 0)');
 assert.equal(custom._seriesAppearance('consumption').dash,'1 7');
 assert.equal(custom._config.consumption_fill_fade,false);
 assert.equal(make({consumption_line_color:[]})._seriesAppearance('consumption').stroke,'var(--secondary-text-color)');
});
