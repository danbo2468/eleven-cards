import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../src/history-utils.js';
const start=Date.parse('2026-10-01T00:00:00Z'),end=start+3*3600000;
const config={entities:['sensor.a'],hours_to_show:168,aggregation_period:'hour',aggregation_method:'avg'};
test('automatic statistics selects long supported views, preserves detail and Delta',()=>{
 assert.equal(u.validateConfig({entities:['sensor.a']}).data_source,'auto');
 assert.throws(()=>u.validateConfig({...config,data_source:'bogus'}),/data_source/);
 assert.equal(u.statisticsPeriod({...config,data_source:'auto'}),'hour');
 assert.equal(u.statisticsPeriod({...config,hours_to_show:24,data_source:'auto'}),null);
 assert.equal(u.statisticsPeriod({...config,aggregation_method:'delta'}),null);
 assert.equal(u.statisticsPeriod({...config,aggregation_period:'quarter_hour'}),null);
 assert.equal(u.statisticsPeriod({...config,aggregation_period:'none'}),'hour');
 assert.throws(()=>u.statisticsPeriod({...config,data_source:'statistics',aggregation_method:'delta'}),/statistics_config/);
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
  assert.match(card._styles(),/@container[^}]*max-width:480px/);
  assert.match(card.shadowRoot.innerHTML,/data-tick="1"/);
  card.disconnectedCallback();
 }
});
