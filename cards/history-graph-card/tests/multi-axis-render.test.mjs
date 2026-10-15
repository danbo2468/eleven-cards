import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};
globalThis.customElements={get:()=>undefined,define:()=>{}};globalThis.window={};globalThis.document={querySelector:()=>null};
const {HistoryGraphCard:C}=await import('../src/history-graph-card.js');
test('mixed-unit renderer uses independent axes for paths, fills and gradients',()=>{
 const c=new C();c.setConfig({entities:['sensor.temp','sensor.power'],show_fill:true,series_options:[{entity:'sensor.power',gradient_stops:[{value:1000,color:'#000000'},{value:3000,color:'#ffffff'}]}]});
 c._hass={language:'en',states:{'sensor.temp':{attributes:{unit_of_measurement:'°C'}},'sensor.power':{attributes:{unit_of_measurement:'W'}}}};
 c._series=[{id:'sensor.temp',points:[{t:0,v:10},{t:50,v:30}]},{id:'sensor.power',points:[{t:0,v:1000},{t:50,v:3000}]}];c._start=0;c._end=100;c._status='ready';c._render();
 const html=c.shadowRoot.innerHTML;
 assert.equal((html.match(/class="series-line"/g)??[]).length,2);
 assert.equal(c._axes.length,2);assert.deepEqual(c._seriesAxes,[0,1]);
 assert.match(html,/class="axis-unit"[^>]*>W</);
 const lines=[...html.matchAll(/<path[^>]+class="series-line"[^>]+>/g)].map(m=>m[0]);
 const paths=lines.map(l=>l.match(/ d="([^"]+)"/)[1]);
 assert.equal(paths[0],paths[1],'equivalent normalized ranges overlay exactly');
 assert.match(html,/3000 W|3,000 W/);assert.match(html,/30 °C/);
 assert.match(html,/id="history-colors-1"[^>]*><stop offset="0%" stop-color="rgb\(255,255,255\)"\/><stop offset="25%"/);
});
