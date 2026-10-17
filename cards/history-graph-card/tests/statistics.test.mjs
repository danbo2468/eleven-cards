import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../src/history-utils.js';
const start=Date.parse('2026-10-01T00:00:00Z'),end=start+3*3600000;
const config={entities:['sensor.a'],hours_to_show:168,aggregation_period:'hour',aggregation_method:'avg'};
test('automatic statistics selects long supported views, including counter Delta',()=>{
 assert.equal(u.validateConfig({entities:['sensor.a']}).data_source,'auto');
 assert.throws(()=>u.validateConfig({...config,data_source:'bogus'}),/data_source/);
 assert.equal(u.statisticsPeriod({...config,data_source:'auto'}),'hour');
 assert.equal(u.statisticsPeriod({...config,hours_to_show:24,data_source:'auto'}),null);
 assert.equal(u.statisticsPeriod({...config,aggregation_method:'delta'}),'hour');
 assert.equal(u.statisticsPeriod({...config,aggregation_period:'day',aggregation_method:'delta'}),'day');
 assert.equal(u.statisticsPeriod({...config,aggregation_period:'quarter_hour'}),null);
 assert.equal(u.statisticsPeriod({...config,aggregation_period:'none'}),'hour');
 assert.equal(u.statisticsPeriod({...config,data_source:'statistics',aggregation_method:'delta'}),'hour');
 assert.equal(u.statisticsPeriod({...config,aggregation_period:'none',aggregation_method:'delta'}),null);
 assert.throws(()=>u.statisticsPeriod({...config,data_source:'statistics',aggregation_period:'none',aggregation_method:'delta'}),/statistics_config/);
 assert.throws(()=>u.statisticsPeriod({...config,data_source:'statistics',aggregation_period:'minute'}),/statistics_config/);
});
test('statistics loader preserves bins/gaps, requests mean and skips raw history',async()=>{
 const requests=[];
 const hass={states:{'sensor.a':{attributes:{unit_of_measurement:'°C'}}},callWS:async msg=>{requests.push(msg);return msg.type==='recorder/get_statistics_metadata'?[{statistic_id:'sensor.a',has_mean:true,unit_of_measurement:'°C'}]:{'sensor.a':[{start:start/1000,end:(start+3600000)/1000,mean:12},{start:(start+7200000)/1000,end:end/1000,mean:0}]};},callApi:()=>{throw Error('raw not expected');}};
 const result=await u.loadHistorySeries(hass,{...config,data_source:'statistics'},start,end);
 assert.deepEqual(requests[1].types,['mean']);assert.equal(requests[1].period,'hour');
 assert.equal(result[0].source,'statistics');
 assert.deepEqual(result[0].points,[{t:start,v:12},{t:start+3600000,v:null},{t:start+7200000,v:0},{t:end,v:null}]);
 assert.strictEqual(u.aggregateSeries(result,start,end,'day','avg')[0],result[0],'do not re-average summaries');
});
test('auto falls back per entity, but forced statistics never disguises missing support',async()=>{
 const calls=[];const hass={states:{},callWS:async()=>[],callApi:async(method,url)=>{calls.push(url);return [];}};
 assert.equal((await u.loadHistorySeries(hass,config,start,end))[0].source,undefined);
 assert.equal(calls.length,1);
 await assert.rejects(u.loadHistorySeries(hass,{...config,data_source:'statistics'},start,end),/statistics_unavailable/);
 assert.equal(calls.length,1);
});

test('counter Delta requests Recorder change with sum-only metadata, retaining zero, negative values and gaps',async()=>{
 const day=86400000,a=Date.parse('2026-07-19T00:00:00Z'),b=a+90*day;
 for(const metadata of [{has_sum:true,has_mean:false,unit_of_measurement:'kWh'},{has_sum:true,mean_type:0,statistics_unit_of_measurement:'kWh'}]){
  const calls=[];
  const hass={states:{'sensor.a':{attributes:{unit_of_measurement:'kWh'}}},callWS:async msg=>{
   calls.push(msg);
   return msg.type==='recorder/get_statistics_metadata'?[{statistic_id:'sensor.a',...metadata}]:{'sensor.a':[
    {start:a+3*day,end:a+4*day,change:null},
    {start:a,end:a+day,change:3,sum:1003,state:3},
    {start:a+day,end:a+2*day,change:0,sum:1003,state:3},
    {start:a+4*day,end:a+5*day,change:-2,sum:1001,state:1}
   ]};
  },callApi:()=>{throw Error('raw history must not be used for compatible counter statistics');}};
  const result=await u.loadHistorySeries(hass,{...config,hours_to_show:2160,data_source:'auto',aggregation_period:'day',aggregation_method:'delta'},a,b);
  assert.deepEqual(calls.map(m=>m.type),['recorder/get_statistics_metadata','recorder/statistics_during_period']);
  assert.deepEqual(calls[1].types,['change']);assert.equal(calls[1].period,'day');
  assert.equal(calls[1].start_time,new Date(a).toISOString());assert.equal(calls[1].end_time,new Date(b).toISOString());
  assert.equal(result[0].source,'statistics');
  assert.deepEqual(result[0].points.filter(p=>p.v!==null).map(p=>p.v),[3,0,-2],'use change directly, not state, sum, or adjacent-row subtraction');
  assert.equal(u.valueAt(result[0].points,a+2.5*day),null);
  assert.equal(u.valueAt(result[0].points,a+3.5*day),null);
  assert.strictEqual(u.aggregateSeries(result,a,b,'day','delta')[0],result[0],'statistics must not be differenced a second time');
 }
});

test('Delta statistics eligibility is per counter; measurements and mismatched units use raw history only in auto',async()=>{
 const calls=[],entities=['sensor.a','sensor.b','sensor.c'];
 const hass={states:Object.fromEntries(entities.map(id=>[id,{attributes:{unit_of_measurement:'kWh'}}])),callWS:async msg=>{
  calls.push(msg);
  return msg.type==='recorder/get_statistics_metadata'?[
   {statistic_id:'sensor.a',has_sum:true,mean_type:0,statistics_unit_of_measurement:'kWh'},
   {statistic_id:'sensor.b',has_sum:false,mean_type:1,statistics_unit_of_measurement:'kWh'},
   {statistic_id:'sensor.c',has_sum:true,mean_type:0,statistics_unit_of_measurement:'Wh'}
  ]:{'sensor.a':[{start,end,change:4}]};
 },callApi:async(_,url)=>{calls.push(url);return [];}};
 const c={...config,entities,aggregation_method:'delta',data_source:'auto'};
 const result=await u.loadHistorySeries(hass,c,start,end);
 assert.deepEqual(calls[1].statistic_ids,['sensor.a']);
 assert.deepEqual(result.map(s=>s.source),['statistics',undefined,undefined]);
 const filter=new URLSearchParams(calls[2].split('?')[1]).get('filter_entity_id');
 assert.equal(filter,'sensor.b,sensor.c');
 await assert.rejects(u.loadHistorySeries(hass,{...c,data_source:'statistics'},start,end),/statistics_unavailable/);
 assert.equal(calls.length,4,'forced statistics rejects before a partial fetch or raw fallback');
});

test('Delta stays on raw history for explicit history, short auto views and sub-hour periods',async()=>{
 for(const override of [{data_source:'history'},{hours_to_show:24},{aggregation_period:'quarter_hour'},{aggregation_period:'minute'}]){
  let raw=0;
  const hass={callWS:()=>{throw Error('statistics must not be requested');},callApi:async()=>{raw++;return [];}};
  const b=Date.now(),a=b-3*3600000;
  await u.loadHistorySeries(hass,{...config,aggregation_method:'delta',...override},a,b);
  assert.equal(raw,1);
 }
});

test('empty Delta statistics and failed requests retain automatic versus forced source behavior',async()=>{
 const c={...config,aggregation_method:'delta'};let raw=0;
 const hass={states:{},callWS:async msg=>msg.type==='recorder/get_statistics_metadata'?[{statistic_id:'sensor.a',has_sum:true}]:{'sensor.a':[]},callApi:async()=>{raw++;return [];}};
 assert.equal((await u.loadHistorySeries(hass,c,start,end))[0].source,undefined);
 assert.equal(raw,1);
 assert.equal((await u.loadHistorySeries(hass,{...c,data_source:'statistics'},start,end))[0].source,'statistics');
 assert.equal(raw,1);
 hass.callWS=async()=>{throw Error('offline');};
 await u.loadHistorySeries(hass,c,start,end);assert.equal(raw,2);
 await assert.rejects(u.loadHistorySeries(hass,{...c,data_source:'statistics'},start,end),/offline/);
 assert.equal(raw,2);
});

test('Delta statistics use Recorder calendar boundaries across a DST day and clip without prorating',async()=>{
 const a=Date.parse('2026-03-28T23:00:00Z'),b=Date.parse('2026-03-29T22:00:00Z');
 const hass={states:{},callWS:async msg=>msg.type==='recorder/get_statistics_metadata'?[{statistic_id:'sensor.a',has_sum:true}]:{'sensor.a':[{start:a,end:b,change:23}]},callApi:()=>{throw Error('raw not expected');}};
 const result=await u.loadHistorySeries(hass,{...config,data_source:'statistics',aggregation_period:'day',aggregation_method:'delta'},a+3600000,b-3600000);
 assert.deepEqual(result[0].points,[{t:a+3600000,v:23},{t:b-3600000,v:null}]);
});
globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}};
globalThis.customElements={get(){},define(){}};globalThis.window=new EventTarget();globalThis.document={addEventListener(){},removeEventListener(){},querySelector(){return null;}};
test('both cards expose localized source and render statistics through the real refresh lifecycle',async()=>{
 const {HistoryGraphCard}=await import('../src/history-graph-card.js');
 const {BarChartCard}=await import('../../bar-chart/src/bar-chart.js');
 for(const C of [HistoryGraphCard,BarChartCard]){
  const form=C.getConfigForm(),field=form.schema.find(s=>s.name==='data_processing').schema.find(s=>s.name==='data_source');
  assert.deepEqual(field.selector.select.options.map(o=>o.value),['auto','history','statistics']);
  assert.equal(form.computeLabel.call({hass:{language:'nl'}},{name:'data_source'}),'Gegevensbron');
  const card=new C();card.setConfig({...config,data_source:'statistics'});
  card.hass={states:{'sensor.a':{state:'12',attributes:{unit_of_measurement:'°C'}}},callWS:async msg=>msg.type==='recorder/get_statistics_metadata'?[{statistic_id:'sensor.a',mean_type:1,statistics_unit_of_measurement:'°C'}]:{'sensor.a':[{start:Date.now()-3600000,end:Date.now(),mean:12}]},callApi:()=>{throw Error('raw not expected');}};
  card.connectedCallback();await new Promise(r=>setImmediate(r));
  assert.equal(card._status,'ready');assert.equal(card._series[0].source,'statistics');
  assert.match(card.shadowRoot.innerHTML,/<strong>12<\/strong>/,'legend samples inside the final statistics bin');
  assert.match(card._styles(),/@container[^}]*max-width:480px/);
  assert.match(card.shadowRoot.innerHTML,/data-tick="1"/);
  const oldEnd=Date.now()-2*3600000;
  card.hass={...card.hass,callWS:async msg=>msg.type==='recorder/get_statistics_metadata'?[{statistic_id:'sensor.a',has_mean:true,unit_of_measurement:'°C'}]:{'sensor.a':[{start:oldEnd-3600000,end:oldEnd,mean:12}]}};
  await card._refresh();
  assert.match(card.shadowRoot.innerHTML,/<strong>Unavailable<\/strong>/,'a missing tail must not show an older value as current');
  card.disconnectedCallback();
 }
});

test('90-day stacked daily Delta bar chart loads counter statistics for all three consumption sensors',async()=>{
 const {BarChartCard}=await import('../../bar-chart/src/bar-chart.js');
 const entities=['sensor.climatecontrol_heating_yearly_electrical_consumption','sensor.climatecontrol_cooling_yearly_electrical_consumption','sensor.domestichotwatertank_heating_yearly_electrical_consumption'];
 const calls=[],card=new BarChartCard(),day=86400000;
 card.setConfig({entities,hours_to_show:2160,data_source:'auto',graph_mode:'stacked',aggregation_period:'day',aggregation_method:'delta'});
 card.hass={config:{time_zone:'UTC'},states:Object.fromEntries(entities.map(id=>[id,{state:'1000',attributes:{unit_of_measurement:'kWh',state_class:'total_increasing'}}])),callWS:async msg=>{
  calls.push(msg);
  if(msg.type==='recorder/get_statistics_metadata')return entities.map(statistic_id=>({statistic_id,has_sum:true,mean_type:0,statistics_unit_of_measurement:'kWh'}));
  const a=Date.parse(msg.start_time),b=Date.parse(msg.end_time);
  return Object.fromEntries(entities.map((id,i)=>[id,Array.from({length:90},(_,n)=>({start:a+n*day,end:Math.min(b,a+(n+1)*day),change:i+1}))]));
 },callApi:()=>{throw Error('regression: daily counter Delta fell back to raw history');}};
 card.connectedCallback();await new Promise(r=>setImmediate(r));
 try{
  assert.equal(card._status,'ready');assert.equal(calls.length,2);
  assert.equal(calls[1].period,'day');assert.deepEqual(calls[1].types,['change']);
  assert.deepEqual(calls[1].statistic_ids,entities);
  assert.deepEqual(card._series.map(s=>s.source),['statistics','statistics','statistics']);
  assert.deepEqual(card._series.map(s=>s.points.filter(p=>p.v!==null).length),[90,90,90]);
  assert.deepEqual(card._plotSeries.map(s=>s.points[0].v),[1,3,6]);
 }finally{card.disconnectedCallback();}
});
