import {test} from 'node:test';
import assert from 'node:assert/strict';

globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};
globalThis.customElements={get:()=>undefined,define:()=>{}};
globalThis.window={};globalThis.document={querySelector:()=>null};
const {HistoryGraphCard}=await import('../src/history-graph-card.js');
const {BarChartCard}=await import('../../bar-chart/src/bar-chart.js');

function fixture(C){
 const c=new C(),entities=['sensor.temp','sensor.power'];
 c.setConfig({entities,aggregation_period:'none',y_min:0,y_max:30,y_step:5});
 c._hass={language:'en',states:Object.fromEntries(entities.map((id,i)=>[id,{attributes:{unit_of_measurement:i?'W':'°C',friendly_name:i?'Power':'Room'}}]))};
 c._series=entities.map((id,i)=>({id,points:[{t:0,v:i?2000:20},{t:50,v:i?4000:25}]}));
 c._start=0;c._end=100;c._status='ready';c._render();return c;
}
for(const C of [HistoryGraphCard,BarChartCard]){
 test(C.name+' draws one grid behind its data with one line per aligned tick',()=>{
  const c=fixture(C),html=c.shadowRoot.innerHTML;
  const grid=[...html.matchAll(/<line class="grid-line(?: grid-zero)?"[^>]+y1="([^"]+)"/g)];
  assert.equal(grid.length,c._axes[0].ticks.length);
  assert.equal(new Set(grid.map(m=>m[1])).size,grid.length);
  for(const axis of c._axes)axis.ticks.forEach((t,i)=>assert.ok(Math.abs((axis.max-t)/(axis.max-axis.min)*300-Number(grid[i][1]))<1e-9));
  assert.ok(html.indexOf('<g class="y-grid">')<html.indexOf('<g class="chart-series'));
  assert.match(html,/<line class="grid-line grid-zero"/);
 });
 test(C.name+' marks only the two vertical plot edges, behind the data',()=>{
  const html=fixture(C).shadowRoot.innerHTML;
  const vertical=[...html.matchAll(/<line\b[^>]*x1="([^"]+)"[^>]*x2="([^"]+)"[^>]*y1="0"[^>]*y2="300"/g)];
  assert.deepEqual(vertical.map(m=>[Number(m[1]),Number(m[2])]),[[0,0],[1000,1000]]);
  assert.ok(html.indexOf('<g class="grid-edges">')<html.indexOf('<g class="chart-series'));
  assert.doesNotMatch(html,/grid-time/);
 });
 test(C.name+' picks contrasting values and grid colors from the card background, and follows theme changes',()=>{
  const c=fixture(C),variables=new Map();let background='rgb(35, 36, 45)';
  c.shadowRoot.querySelector=s=>s==='ha-card'?{style:{setProperty:(key,value)=>variables.set(key,value)}}:null;
  globalThis.getComputedStyle=()=>({backgroundColor:background});
  try{
   c.hass=c._hass;
   assert.equal(variables.get('--history-value-color'),'#f3f4f6');
   assert.equal(variables.get('--history-grid-color'),'#3a3b45');
   background='rgb(255, 255, 255)';c._hass.themes={darkMode:true};c.hass=c._hass;
   assert.equal(variables.get('--history-value-color'),'#111111','a light card overrides the dark global theme');
   assert.equal(variables.get('--history-grid-color'),'#e1e3e8');
  }finally{delete globalThis.getComputedStyle;}
 });
}
