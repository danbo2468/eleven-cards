import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as graph from '../shared/graph.js';
import * as utils from '../cards/dynamic-energy-price-card/src/price-utils.js';
import * as localization from '../cards/dynamic-energy-price-card/src/localization.js';
import {validateConfig} from '../cards/history-graph-card/src/history-utils.js';
globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};
globalThis.customElements={get:()=>undefined,define:()=>{}};globalThis.window={};globalThis.document={querySelector:()=>null};
const {HistoryGraphCard:History}=await import('../cards/history-graph-card/src/history-graph-card.js');
let Energy;
const context=vm.createContext({...graph,...utils,...localization,HTMLElement:globalThis.HTMLElement,window:{},document:globalThis.document,customElements:{get:()=>undefined,define:(_,c)=>Energy=c}});
const source=readFileSync(new URL('../cards/dynamic-energy-price-card/src/dynamic-energy-price-card.js',import.meta.url),'utf8');
vm.runInContext(source.replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm,''),context);
const fields=s=>s.flatMap(f=>f.schema?fields(f.schema):[f]);
test('both cards expose localized line interpolation with preserved defaults',()=>{
 for(const [Card,fallback] of [[Energy,'smooth'],[History,'step']]){
  const form=Card.getConfigForm(),field=fields(form.schema).find(f=>f.name==='line_interpolation');
  assert.ok(field);assert.equal(field.default,fallback);
  assert.equal(form.computeLabel.call({hass:{language:'nl'}},field),'Lijnverloop');
  assert.equal(form.computeLabel.call({hass:{language:'en'}},field),'Line interpolation');
  assert.deepEqual(Array.from(field.selector.select.options,x=>x.value),['smooth','linear','step']);
 }
 assert.equal(validateConfig({entities:['sensor.a']}).line_interpolation,'step');
 assert.throws(()=>validateConfig({entities:['sensor.a'],line_interpolation:'bad'}));
 const e=new Energy();e.setConfig({entity:'sensor.a'});assert.equal(e._config.line_interpolation,'smooth');
 assert.throws(()=>e.setConfig({entity:'sensor.a',line_interpolation:'bad'}));
});
test('history lines and gap-safe fills follow each selected interpolation',()=>{
 for(const [mode,command] of [['smooth',' C '],['linear',' L '],['step',' V ']]){
  const c=new History();c.setConfig({entities:['sensor.a'],line_interpolation:mode,show_fill:true});
  c._hass={language:'en',states:{'sensor.a':{attributes:{unit_of_measurement:'°C'}}}};
  c._start=0;c._end=100;c._status='ready';c._series=[{id:'sensor.a',points:[{t:0,v:10},{t:20,v:20},{t:40,v:null},{t:60,v:15},{t:80,v:25}]}];c._render();
  for(const cls of ['series-line','series-fill']){
   const path=c.shadowRoot.innerHTML.match(new RegExp('<path d="([^"]+)" class="'+cls+'"'))[1];
   assert.ok(path.includes(command),mode+' '+cls);assert.equal(path.split('M ').length-1,2);
   if(cls==='series-fill')assert.equal(path.split(' Z').length-1,2);
  }
 }
});
test('energy adapter routes tariff and consumption geometry through shared interpolation',()=>{
 const points=[{timestamp:0,price:10},{timestamp:20,price:20},{timestamp:40,price:null},{timestamp:60,price:15},{timestamp:80,price:25}];
 context.points=points;
 for(const [mode,command] of [['smooth',' C '],['linear',' L '],['step',' V ']]){
  context.mode=mode;
  const path=vm.runInContext("seriesPath(points,'price',t=>t,v=>v,20,mode)",context);
  assert.ok(path.includes(command));assert.equal(path.split('M ').length-1,2);
 }
});
