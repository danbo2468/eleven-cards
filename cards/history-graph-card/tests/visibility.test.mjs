import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,editorConfig,cardConfig,graphAxes} from '../src/history-utils.js';
globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};
globalThis.customElements={get:()=>undefined,define:()=>{}};globalThis.window={};globalThis.document={querySelector:()=>null};
const {HistoryGraphCard:C}=await import('../src/history-graph-card.js');
const entities=['sensor.a','sensor.b'];
test('default sensor visibility survives native editor normalization and frozen feedback',()=>{
 const input={entities,series_options:[{entity:entities[1],visible:false}]};
 const rows=editorConfig(input).entities;
 assert.equal(rows[0].visible,true);assert.equal(rows[1].visible,false);
 Object.freeze(rows[1]);Object.freeze(rows);
 const saved=cardConfig({...input,entities:rows});
 assert.equal(saved.series_options[1].visible,false);
 assert.equal(validateConfig(saved).series_options[1].visible,false);
 assert.throws(()=>validateConfig({entities,series_options:[{entity:entities[0],visible:'false'}]}),/visible/);
 assert.equal(C.getSeriesConfigForm(rows[1],rows).schema.find(s=>s.name==='visible').selector.boolean!==undefined,true);
});
function fixture(config={}){
 const c=new C();c.setConfig({entities,show_fill:true,...config});
 c._hass={language:'en',states:Object.fromEntries(entities.map(id=>[id,{attributes:{unit_of_measurement:'W',friendly_name:id}}]))};
 c._series=[{id:entities[0],points:[{t:0,v:10},{t:50,v:20}]},{id:entities[1],points:[{t:0,v:1000},{t:50,v:3000}]}];
 c._start=0;c._end=100;c._status='ready';c._render();return c;
}
test('legend toggles hide paths and fills, rescale and preserve data and viewport',()=>{
 const c=fixture({series_options:[{entity:entities[1],visible:false}]});
 const paths=()=> (c.shadowRoot.innerHTML.match(/class="series-line"/g)??[]).length;
 assert.equal(paths(),1);assert.ok(c._axes[0].max<100);
 assert.match(c.shadowRoot.innerHTML,/button[^>]*data-series="sensor.b"[^>]*aria-pressed="false"/);
 const raw=c._rawSeries;c._viewport=[0,80];c._toggleSeries(entities[1]);
 assert.equal(paths(),2);assert.ok(c._axes[0].max>=3000);assert.equal(c._rawSeries,raw);assert.deepEqual(c._viewport,[0,80]);
 c._toggleSeries(entities[0]);c._toggleSeries(entities[1]);
 assert.equal(paths(),0);assert.equal((c.shadowRoot.innerHTML.match(/class="series-fill"/g)??[]).length,0);
 assert.match(c.shadowRoot.innerHTML,/All sensors are hidden/);
 c._toggleSeries(entities[0]);assert.equal(paths(),1);
 c._render();assert.equal(paths(),1,'refresh render keeps choices');
 const saved=structuredClone(c._config);c.setConfig(saved);
 assert.equal(c._isSeriesVisible(1),false,'same config feedback keeps toggles');
 c.setConfig({...saved,series_options:[{entity:entities[1],visible:true}]});
 assert.equal(c._isSeriesVisible(1),true,'changed default applies immediately');
});
test('hidden sensors are excluded from tooltip, accessible text and hover markers',()=>{
 const c=fixture({series_options:[{entity:entities[1],visible:false}]});
 const box={left:0,top:0,width:500,height:300},nodes=Object.fromEntries(['.tooltip','.plot','.markers','.guide','.sr-only'].map(k=>[k,{style:{},hidden:true,innerHTML:'',getBoundingClientRect:()=>box}]));
 c.shadowRoot.querySelector=s=>s==='.chart'?{querySelector:s=>nodes[s],getBoundingClientRect:()=>box}:null;
 c._showTooltip(50,false);
 assert.match(nodes['.tooltip'].innerHTML,/sensor.a/);assert.doesNotMatch(nodes['.tooltip'].innerHTML,/sensor.b/);
 assert.equal((nodes['.markers'].innerHTML.match(/hover-dot/g)??[]).length,1);
 assert.doesNotMatch(nodes['.sr-only'].textContent,/sensor.b/);
 c._visibility.set(entities[0],false);c._showTooltip(50,false);assert.equal(nodes['.tooltip'].hidden,true);
});
test('visibility changes stacking and unit axes without mutating raw data or moving manual bounds to a different unit',()=>{
 const series=[{id:entities[0],points:[{t:0,v:10}]},{id:entities[1],points:[{t:0,v:1000}]}],meta={items:[{unit:'W'},{unit:'W'}]};
 let result=graphAxes(series,meta,{graph_mode:'stacked'},0,100,[false,true]);
 assert.equal(result.plotSeries[1].points[0].base,0);assert.equal(result.plotSeries[1].points[0].v,1000);
 meta.items[1].unit='°C';result=graphAxes(series,meta,{y_min:0,y_max:20},0,100,[false,true]);
 assert.equal(result.axes.length,1);assert.equal(result.axes[0].unit,'°C');assert.ok(result.axes[0].max>1000);
 assert.deepEqual(series[1].points,[{t:0,v:1000}]);
});
