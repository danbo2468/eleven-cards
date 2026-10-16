import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};
globalThis.customElements={get:()=>undefined,define:()=>{}};globalThis.window={};globalThis.document={querySelector:()=>null};
const {HistoryGraphCard}=await import('../src/history-graph-card.js');
const {BarChartCard}=await import('../../bar-chart/src/bar-chart.js');
const entities=['sensor.a','sensor.b'];
const series=[[-10,30],[-200,100]].map((values,i)=>({id:entities[i],points:values.map((v,t)=>({t,v}))}));
const meta={items:entities.map((id,i)=>({id,unit:['°C','W'][i]}))};
const ratio=a=>-a.min/(a.max-a.min);
for(const C of [HistoryGraphCard,BarChartCard]){
 test(C.name+' exposes default-on native Y-axis switch and localized labels',()=>{
  const f=C.getConfigForm(),s=f.schema.find(s=>s.name==='y_axis').schema.find(s=>s.name==='align_zero');
  assert.deepEqual(s,{name:'align_zero',default:true,selector:{boolean:{}}});
  assert.equal(f.computeLabel.call({hass:{language:'nl'}},s),'Nulpunten uitlijnen');
  assert.equal(f.computeLabel.call({hass:{language:'en'}},s),'Align zero points');
 });
 test(C.name+' renders aligned zeroes and applies option changes without stale cached axes',()=>{
  const c=new C();const config={entities,aggregation_period:'none',sync_hover:false};
  c.setConfig(config);c._hass={language:'en',states:Object.fromEntries(meta.items.map(m=>[m.id,{attributes:{unit_of_measurement:m.unit}}]))};
  c._series=series;c._start=0;c._end=2;c._status='ready';c._render();
  assert.ok(Math.abs(ratio(c._axes[0])-ratio(c._axes[1]))<1e-12);
  c.setConfig({...config,align_zero:false});c._series=series;c._status='ready';c._render();
  assert.ok(Math.abs(ratio(c._axes[0])-ratio(c._axes[1]))>.01);
  c._config={...c._config,align_zero:true};c._render();assert.ok(Math.abs(ratio(c._axes[0])-ratio(c._axes[1]))<1e-12);
 });
}
