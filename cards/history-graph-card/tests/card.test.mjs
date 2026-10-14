import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class {attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}};
globalThis.customElements={get:()=>undefined,define:()=>{}};globalThis.window={};globalThis.document={addEventListener(){},removeEventListener(){},querySelector(){return null;}};
const load=()=>import('../src/history-graph-card.js');
const tick=()=>new Promise(r=>setImmediate(r));
const state={state:'21',attributes:{unit_of_measurement:'°C',friendly_name:'Room'}};
const response=id=>[[{entity_id:id,state:'21',last_changed:new Date(Date.now()-1000).toISOString()}]];
test('native form localizes callback context, preserves custom title, registers Sections layout',async()=>{
 const {HistoryGraphCard:C}=await load();const form=C.getConfigForm();
 assert.deepEqual(form.schema.slice(0,3).map(s=>s.name),['entities','title','hours_to_show']);
 assert.equal(form.schema[0].selector.entity.multiple,true);
 assert.equal(form.computeLabel.call({hass:{language:'nl'}},{name:'entities'}),'Sensoren');
 const card=new C();card.setConfig({entities:['sensor.a'],title:'Mijn expliciete titel'});
 assert.deepEqual(card.getGridOptions(),{rows:6,columns:12,min_rows:4,min_columns:6});
 assert.match(card._styles(),/\.chart\{[^}]*min-height:120px/);assert.match(card._styles(),/\.state\{[^}]*min-height:120px/);
 card.hass={language:'en',states:{'sensor.a':state}};
 assert.match(card.shadowRoot.innerHTML,/Mijn expliciete titel/);
 card.disconnectedCallback();
});
test('history renders loading then graph, throttles hass updates and drops race/disconnect responses',async()=>{
 const {HistoryGraphCard:C}=await load();const pending=[];const card=new C();
 card.setConfig({entities:['sensor.a']});
 const hass={language:'nl',states:{'sensor.a':state,'sensor.b':state},callApi:(method,url)=>{assert.equal(method,'GET');return new Promise(resolve=>pending.push({url,resolve}));}};
 card.hass=hass;card.connectedCallback();assert.equal(pending.length,1);assert.match(card.shadowRoot.innerHTML,/Historie laden/);
 card.hass={...hass};assert.equal(pending.length,1);
 card.setConfig({entities:['sensor.b']});assert.equal(pending.length,2);
 pending[1].resolve(response('sensor.b'));await tick();assert.equal(card._series[0].id,'sensor.b');assert.match(card.shadowRoot.innerHTML,/series-line/);
 pending[0].resolve(response('sensor.a'));await tick();assert.equal(card._series[0].id,'sensor.b');
 const before=card.shadowRoot.innerHTML;card._refresh();assert.equal(pending.length,3);card.disconnectedCallback();pending[2].resolve([]);await tick();assert.notEqual(card._status,'empty');assert.equal(card._timer,null);
});
test('empty, rejected history and metadata unit errors render honest localized states',async()=>{
 const {HistoryGraphCard:C}=await load();const card=new C();card.setConfig({entities:['sensor.a']});
 card.hass={states:{'sensor.a':state},callApi:async()=>[]};card.connectedCallback();await tick();assert.equal(card._status,'empty');
 card.hass={states:{'sensor.a':state},callApi:async()=>{throw new Error('HTTP 500');}};await card._refresh();assert.equal(card._status,'error');assert.match(card.shadowRoot.innerHTML,/Retry/);
 card.setConfig({entities:['sensor.a','sensor.b']});card.hass={states:{'sensor.a':state,'sensor.b':{...state,attributes:{unit_of_measurement:'W'}}},callApi:async()=>{throw new Error('should not fetch');}};await card._refresh();assert.equal(card._status,'unit');card.disconnectedCallback();
});
