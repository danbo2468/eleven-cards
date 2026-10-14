import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../src/history-utils.js';
globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};
globalThis.customElements={get:()=>undefined,define:()=>{}};globalThis.window=new EventTarget();globalThis.document={querySelector:()=>null,addEventListener(){},removeEventListener(){}};
const {HistoryGraphCard:C}=await import('../src/history-graph-card.js');
test('calendar days begin at first valid local instant when DST skips midnight',()=>{
 const bounds=u.periodBounds(Date.parse('2026-09-06T12:00:00Z'),'day','America/Santiago');
 assert.deepEqual(bounds.map(t=>new Date(t).toISOString()),['2026-09-06T04:00:00.000Z','2026-09-07T03:00:00.000Z']);
});
test('zoom reuses cached full-history stack instead of recomputing all sensors',()=>{
 const c=card({graph_mode:'stacked'}),stack=c._plotSeries;c._zoom(0.5);assert.equal(c._plotSeries,stack);
});
test('stacked optional fill is a band between cumulative heights and its signed base, not chart bottom',()=>{
 const c=card({graph_mode:'stacked',show_fill:true}),points=[{t:0,v:5,base:2},{t:10,v:8,base:4},{t:20,v:null,base:null},{t:30,v:-5,base:-2}];
 c._end=40;c._viewEnd=40;
 const path=c._area(points,t=>t,v=>100-v);
 assert.match(path,/L 20 96/);assert.doesNotMatch(path,/300/);assert.equal((path.match(/Z/g)??[]).length,2);
 assert.ok(c._range[0]<0,'stacked scale includes zero base');
});
test('year history is allowed and dense rendering retains extrema and gaps without discarding raw points',()=>{
 assert.equal(u.validateConfig({entities:['sensor.a'],hours_to_show:8760}).hours_to_show,8760);
 assert.throws(()=>u.validateConfig({entities:['sensor.a'],hours_to_show:8761}));
 assert.equal(C.getConfigForm().schema.find(s=>s.name==='hours_to_show').selector.number.max,8760);
 const points=Array.from({length:100000},(_,t)=>({t,v:t===12345?999:t%10}));points[44444].v=null;
 const display=u.displayPoints(points,0,99999);
 assert.ok(display.length<6100);assert.ok(display.some(p=>p.v===999));assert.ok(display.some(p=>p.t===44444&&p.v===null));assert.equal(points.length,100000);
 const clipped=u.displayPoints(points,12000,13000);assert.ok(clipped.length<1010);assert.ok(clipped.some(p=>p.v===999));
});
test('desktop drag selection zooms without stealing touch tap, click or tiny drag',()=>{
 const c=card(),selection={style:{},hidden:true},plot={getBoundingClientRect:()=>({left:0,width:100})};
 const chart={querySelector:s=>s==='.plot'?plot:s==='.zoom-selection'?selection:null,setPointerCapture(){},releasePointerCapture(){}};
 c.shadowRoot.querySelector=()=>chart;c._showTooltip=()=>{};c._hideTooltip=()=>{};c._render=()=>{};c._bindInteractions();
 chart.onpointerdown({clientX:20,pointerType:'mouse',pointerId:1});chart.onpointermove({clientX:80,pointerType:'mouse',pointerId:1});chart.onpointerup({clientX:80,pointerType:'mouse',pointerId:1});
 assert.deepEqual(c._viewport,[720000,2880000]);assert.equal(selection.hidden,true);
 c._viewport=null;chart.onpointerdown({clientX:20,pointerType:'touch',pointerId:2});chart.onpointerup({clientX:80,pointerType:'touch',pointerId:2});assert.equal(c._viewport,null);
 chart.onpointerdown({clientX:20,pointerType:'mouse',pointerId:3});chart.onpointerup({clientX:22,pointerType:'mouse',pointerId:3});assert.equal(c._viewport,null);
});
test('zoom is viewport-only: preserves raw history, hand-set aggregation and issues no fetch',()=>{
 const c=card({aggregation_period:'hour',aggregation_method:'max'}),raw=c._rawSeries,aggregated=c._series;
 let requests=0;c._hass.callApi=()=>{requests++;};
 c._zoom(0.5);assert.deepEqual(c._viewport,[900000,2700000]);
 assert.equal(c._rawSeries,raw);assert.equal(c._series,aggregated);assert.equal(c._config.aggregation_period,'hour');assert.equal(requests,0);
 assert.match(c.shadowRoot.innerHTML,/class="zoom-controls"/);assert.equal(c._viewStart,900000);assert.equal(c._viewEnd,2700000);
 c._zoom(2);assert.deepEqual(c._viewport,[0,3600000]);c._zoom(0.5);c._zoom(0);assert.equal(c._viewport,null);
 c.setConfig({entities:['sensor.a']});assert.equal(c._rawSeries,null);assert.equal(c._viewport,null);
});
test('refresh replaces raw cache so repeated loads do not display stale aggregate values',async()=>{
 const c=new C();c.setConfig({entities:['sensor.a'],aggregation_period:'hour'});let v=5;
 c._hass={states:{'sensor.a':{attributes:{unit_of_measurement:'W'}}},callApi:async()=>[[{entity_id:'sensor.a',state:String(v),last_updated:new Date(Date.now()-3600000).toISOString()}]]};
 c._connected=true;await c._refresh();assert.equal(c._series[0].points.at(-1).v,5);v=9;await c._refresh();assert.equal(c._series[0].points.at(-1).v,9);assert.equal(c._rawSeries[0].points.at(-1).v,9);c.disconnectedCallback();
});
test('aggregation preserves unavailable and initially absent time rather than filling or zeroing gaps',()=>{
 const input=[{id:'a',points:[{t:600000,v:4},{t:1200000,v:null},{t:2400000,v:10}]}];
 const points=u.aggregateSeries(input,0,3600000,'hour','avg','UTC')[0].points;
 assert.deepEqual(points.map(p=>[p.t,p.v]),[[0,null],[600000,8],[1200000,null],[2400000,8]]);
 assert.equal(u.valueAt(points,1800000),null);
 assert.equal(u.aggregateSeries([{id:'a',points:[]}],0,3600000,'hour','max')[0].points[0].v,null);
});
test('calendar boundaries use HA timezone, Monday weeks, variable months and both DST transitions',()=>{
 const b=(iso,p,z='Europe/Amsterdam')=>u.periodBounds(Date.parse(iso),p,z).map(t=>new Date(t).toISOString());
 assert.deepEqual(b('2026-03-29T10:00:00Z','day'),['2026-03-28T23:00:00.000Z','2026-03-29T22:00:00.000Z']);
 assert.deepEqual(b('2026-10-25T10:00:00Z','day'),['2026-10-24T22:00:00.000Z','2026-10-25T23:00:00.000Z']);
 assert.deepEqual(b('2026-10-25T01:30:00Z','hour'),['2026-10-25T01:00:00.000Z','2026-10-25T02:00:00.000Z']);
 assert.deepEqual(b('2026-10-25T00:30:00Z','hour'),['2026-10-25T00:00:00.000Z','2026-10-25T01:00:00.000Z']);
 assert.deepEqual(b('2026-10-14T12:00:00Z','week'),['2026-10-11T22:00:00.000Z','2026-10-18T22:00:00.000Z']);
 assert.deepEqual(b('2026-03-14T12:00:00Z','month'),['2026-02-28T23:00:00.000Z','2026-03-31T22:00:00.000Z']);
 assert.deepEqual(b('2026-01-01T00:37:00Z','hour','Asia/Kathmandu'),['2026-01-01T00:15:00.000Z','2026-01-01T01:15:00.000Z']);
 const start=Date.parse('2026-03-28T23:00:00Z'),end=Date.parse('2026-03-30T22:00:00Z');
 assert.equal(u.aggregateSeries([{id:'a',points:[{t:start,v:8}]}],start,end,'day','avg','Europe/Amsterdam')[0].points.length,2);
});
test('global aggregation uses per-sensor recorder-held time-weighted avg, min and max',()=>{
 const input=[{id:'a',points:[{t:0,v:0},{t:900000,v:8}]},{id:'b',points:[{t:0,v:10},{t:1800000,v:20}]}];
 const avg=u.aggregateSeries(input,0,3600000,'hour','avg','UTC');
 assert.deepEqual(avg.map(s=>s.points[0].v),[6,15]);
 assert.deepEqual(u.aggregateSeries(input,0,3600000,'hour','min','UTC').map(s=>s.points[0].v),[0,10]);
 assert.deepEqual(u.aggregateSeries(input,0,3600000,'hour','max','UTC').map(s=>s.points[0].v),[8,20]);
 const c=card({aggregation_period:'hour',aggregation_method:'avg'});assert.equal(c._series[0].points[0].v,15);
 assert.equal(card()._config.aggregation_period,'none');
 for(const name of ['aggregation_period','aggregation_method'])assert.ok(C.getConfigForm().schema.flatMap(s=>s.schema??[s]).some(s=>s.name===name));
 assert.throws(()=>u.validateConfig({entities:['sensor.a'],aggregation_period:'year'}));
 assert.throws(()=>u.validateConfig({entities:['sensor.a'],aggregation_method:'sum'}));
});
test('stacking aligns held values, diverges negative sums and propagates missing gaps',()=>{
 const input=[{id:'a',points:[{t:0,v:2},{t:10,v:null},{t:20,v:-2}]},{id:'b',points:[{t:0,v:3},{t:5,v:-3},{t:25,v:-4}]}];
 const result=u.stackSeries(input,0,30);
 assert.deepEqual(result[1].points.map(p=>[p.t,p.v]),[[0,5],[5,-3],[10,null],[20,-5],[25,-6]]);
 assert.deepEqual(input[1].points.map(p=>p.v),[3,-3,-4]);
 const c=card({graph_mode:'stacked'});assert.equal(u.valueAt(c._plotSeries[1].points,0),21);
 assert.equal(c._config.graph_mode,'stacked');assert.equal(card()._config.graph_mode,'lines');
 assert.ok(C.getConfigForm().schema.flatMap(s=>s.schema??[s]).some(s=>s.name==='graph_mode'));
 assert.throws(()=>u.validateConfig({entities:['sensor.a'],graph_mode:'area'}));
});
function card(options={}){const c=new C();c.setConfig({entities:['sensor.a','sensor.b'],...options});c._hass={language:'en',config:{time_zone:'Europe/Amsterdam'},states:Object.fromEntries(['sensor.a','sensor.b'].map(id=>[id,{attributes:{unit_of_measurement:'W',friendly_name:id}}]))};c._series=['sensor.a','sensor.b'].map((id,i)=>({id,points:[{t:0,v:10+i},{t:1800000,v:20+i}]}));c._start=0;c._end=3600000;c._status='ready';c._render();return c;}
test('per-sensor native object options override name and color without changing entities',()=>{
 const c=card({series_options:[{entity:'sensor.b',name:'Custom B',color:[1,2,3]}]});
 assert.match(c.shadowRoot.innerHTML,/Custom B/);assert.match(c.shadowRoot.innerHTML,/stroke="rgb\(1,2,3\)"/);
 assert.deepEqual(c._config.entities,['sensor.a','sensor.b']);
 const s=C.getSeriesConfigForm().schema.find(s=>s.name==='entity');
 assert.equal(s.required,true);assert.equal(s.selector.entity.domain,'sensor');
 for(const options of [[{entity:'sensor.c'}],[{entity:'sensor.a',color:'red'}],[{entity:'sensor.a',name:3}],[{entity:'sensor.a'},{entity:'sensor.a'}]])assert.throws(()=>u.validateConfig({entities:['sensor.a'],series_options:options}));
});
