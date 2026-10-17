import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectGapPoints,displayPoints,valueAt,validateConfig,seriesAppearance,editorConfig,cardConfig} from '../src/history-utils.js';

globalThis.HTMLElement=class{attachShadow(){this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}};
globalThis.customElements={get:()=>undefined,define(){}};
globalThis.window=new EventTarget();
globalThis.document={querySelector:()=>null,addEventListener(){},removeEventListener(){}};
const {HistoryGraphCard:C}=await import('../src/history-graph-card.js');
const {BarChartCard:B}=await import('../../bar-chart/src/bar-chart.js');
const ids=['sensor.a','sensor.b'];
const points=()=>[{t:0,v:null},{t:10,v:4},{t:20,v:null},{t:25,v:null},{t:30,v:8},{t:40,v:null}];
const flatten=schema=>schema.flatMap(s=>s.schema?flatten(s.schema):[s]);
function render(options={},viewport){
 const c=new C();c.setConfig({entities:ids,...options});
 c._hass={language:'nl',config:{time_zone:'UTC'},states:Object.fromEntries(ids.map(id=>[id,{attributes:{unit_of_measurement:'W'}}]))};
 c._start=0;c._end=50;c._viewport=viewport;c._series=ids.map(id=>({id,points:points()}));c._status='ready';c._render();return c;
}
const paths=(c,kind='line')=>[...c.shadowRoot.innerHTML.matchAll(new RegExp(`<path d="([^"]*)" class="series-${kind}"`,'g'))].map(m=>m[1]);

test('gap bridging defaults off, roundtrips per sensor and stays independent of linked line appearance',()=>{
 const config={entities:ids,series_options:[{entity:ids[0],connect_gaps:true},{entity:ids[1],line_style_source:ids[0]}]};
 assert.equal(seriesAppearance(config,0).connect_gaps,true);assert.equal(seriesAppearance(config,1).connect_gaps,false);
 const saved=cardConfig(editorConfig(validateConfig(config)));
 assert.equal(saved.series_options[0].connect_gaps,true);assert.equal(saved.series_options[1].connect_gaps,false);
 for(const invalid of ['true',1,{},[]])assert.throws(()=>validateConfig({entities:ids,series_options:[{entity:ids[0],connect_gaps:invalid}]}),/series_connect_gaps/);
 const form=C.getSeriesConfigForm({line_style_source:ids[0]});
 assert.equal(flatten(form.schema).find(s=>s.name==='connect_gaps').default,false);
 assert.equal(form.computeLabel.call({hass:{language:'nl'}},{name:'connect_gaps'}),'Ontbrekende data overbruggen');
 assert.ok(!flatten(C.getConfigForm().schema).some(s=>s.name==='connect_gaps'));
 assert.ok(!flatten(B.getSeriesConfigForm().schema).some(s=>s.name==='connect_gaps'));
});

test('bridging preserves unknown starts, tails and all-missing series without mutating measurements',()=>{
 const source=points(),before=structuredClone(source),bridged=connectGapPoints(source);
 assert.deepEqual(bridged,[source[0],source[1],source[4],source[5]]);assert.deepEqual(source,before);
 assert.equal(valueAt(source,25),null);assert.equal(valueAt(source,45),null);
 assert.deepEqual(connectGapPoints([]),[]);assert.deepEqual(connectGapPoints([{t:0,v:null},{t:10,v:null}]),[{t:0,v:null},{t:10,v:null}]);
 assert.deepEqual(connectGapPoints([{t:0,v:null},{t:10,v:0},{t:20,v:null}]),[{t:0,v:null},{t:10,v:0},{t:20,v:null}]);
});

test('each line and its fill can bridge gaps with step, linear or smooth interpolation',()=>{
 for(const mode of ['step','linear','smooth']){
  const c=render({line_interpolation:mode,show_fill:true,series_options:[{entity:ids[0],connect_gaps:true}]});
  const [connected,gapped]=paths(c),fills=paths(c,'fill');
  assert.equal((connected.match(/M /g)??[]).length,1);assert.equal((gapped.match(/M /g)??[]).length,2);
  assert.match(connected,/^M 200 /);assert.match(connected,/H 800$/);assert.doesNotMatch(connected,/H 1000/);
  assert.match(connected,mode==='step'?/ H 600 V /:mode==='linear'?/ L 600 /:/ C /);
  assert.equal((fills[0].match(/ Z/g)??[]).length,1);assert.equal((fills[1].match(/ Z/g)??[]).length,2);
  assert.deepEqual(c._series[0].points,points());assert.equal(valueAt(c._plotSeries[0].points,25),null);
 }
});

test('zooming wholly inside a gap retains the two external anchors before clipping and decimation',()=>{
 const c=render({line_interpolation:'linear',series_options:[{entity:ids[0],connect_gaps:true}]},[21,24]);
 const connected=c._displayPoints(c._plotSeries[0].points,0);
 assert.deepEqual(connected,[{t:10,v:4},{t:30,v:8}]);
 assert.match(paths(c)[0],/ L /);assert.equal(valueAt(c._series[0].points,22),null);
 const dense=Array.from({length:10000},(_,i)=>({t:i,v:i>100&&i<9900?null:i%5}));
 assert.ok(displayPoints(connectGapPoints(dense),5000,6000,1).every(p=>p.v!==null));
});

test('bridging does not change metrics, aggregation or the underlying stacked values',()=>{
 for(const graph_mode of ['lines','stacked']){
  const plain=render({graph_mode,aggregation_period:'none'}),bridged=render({graph_mode,aggregation_period:'none',series_options:[{entity:ids[0],connect_gaps:true},{entity:ids[1],connect_gaps:true}]});
  assert.deepEqual(bridged._series,plain._series);assert.deepEqual(bridged._plotSeries,plain._plotSeries);
  assert.deepEqual(bridged._dataInformation(),plain._dataInformation());
  assert.equal(valueAt(bridged._plotSeries[1].points,25),null);
  assert.equal((paths(bridged)[1].match(/M /g)??[]).length,1);
 }
});
