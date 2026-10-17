import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {editorConfig,cardConfig} from '../cards/history-graph-card/src/history-utils.js';

function load(slug){
 const registry=new Map();
 const ctx=vm.createContext({HTMLElement:class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}},window:new EventTarget(),document:{querySelector:()=>null,addEventListener(){},removeEventListener(){}},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},setTimeout,clearTimeout,structuredClone,URLSearchParams,Intl,console:{info(){},log(){}}});
 vm.runInContext(readFileSync(new URL(`../cards/${slug}/dist/eleven-${slug}.js`,import.meta.url),'utf8'),ctx);
 return registry.get(`eleven-${slug}`);
}
const fields=schema=>schema.flatMap(field=>[field,...fields(field.schema??[])]);
for(const slug of ['history-graph-card','bar-chart','timeline-card'])test(`${slug}: grid and timeframe controls are independent boolean settings with editor round trips`,()=>{
 const Card=load(slug),card=new Card(),config={entities:['sensor.a'],hours_to_show:24,aggregation_period:'none'};
 for(const key of ['show_grid','show_navigation']){
  const field=fields(Card.getConfigForm().schema).find(field=>field.name===key);
  assert.ok(field?.selector?.boolean);assert.equal(field.default,true);
  for(const value of ['false',0,null])assert.throws(()=>card.setConfig({...config,[key]:value}));
 }
 const render=(grid,navigation)=>{
  card.setConfig({...config,show_grid:grid,show_navigation:navigation});
  card._hass={language:'nl',config:{time_zone:'Europe/Amsterdam'},states:{'sensor.a':{attributes:{unit_of_measurement:'W'}}}};
  card._start=0;card._end=86400000;card._status='ready';
  card._series=slug==='timeline-card'?[[{start:0,end:86400000,state:'on'}]]:[{id:'sensor.a',points:[{t:0,v:2},{t:43200000,v:5}]}];
  card._render();return card.shadowRoot.innerHTML;
 };
 for(const grid of [true,false])for(const navigation of [true,false]){
  const html=render(grid,navigation);
  assert.equal(/class="grid-line(?:[" ])/.test(html),grid);
  assert.equal(/class="period-controls"/.test(html),navigation);
  assert.match(html,/class="history-link"/);assert.match(html,/data-zoom="in"/);
  assert.match(html,slug==='timeline-card'?/class="segment(?:[" ])/:/class="axis-y"/);
  const saved=(Card.cardConfig??cardConfig)((Card.editorConfig??editorConfig)({...config,show_grid:grid,show_navigation:navigation}));
  assert.equal(saved.show_grid,grid);assert.equal(saved.show_navigation,navigation);assert.equal(saved.hours_to_show,24);
 }
 card.setConfig(config);assert.equal(card._config.show_grid,true);assert.equal(card._config.show_navigation,true);
});
