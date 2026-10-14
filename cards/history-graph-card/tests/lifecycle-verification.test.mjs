import {test} from 'node:test';import assert from 'node:assert/strict';
globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};globalThis.customElements={get:()=>undefined,define(){}};globalThis.window=new EventTarget();globalThis.document={addEventListener(){},removeEventListener(){},querySelector:()=>null};
const tick=()=>new Promise(r=>setImmediate(r));
test('contract verification: timeout at 15s, retry interval at 60s, disconnect stops subsequent polls',async t=>{
 const {HistoryGraphCard:C}=await import('../src/history-graph-card.js');
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-10-13T12:00:00Z')});
 let calls=0;const card=new C();card.setConfig({entities:['sensor.a']});card.hass={states:{'sensor.a':{state:'20',attributes:{unit_of_measurement:'°C'}}},callApi:()=>{calls++;return new Promise(()=>{});}};
 card.connectedCallback();assert.equal(calls,1);t.mock.timers.tick(14999);await tick();assert.equal(card._status,'loading');t.mock.timers.tick(1);await tick();assert.equal(card._status,'error');
 t.mock.timers.tick(59999);await tick();assert.equal(calls,1);t.mock.timers.tick(1);await tick();assert.equal(calls,2);
 card.disconnectedCallback();t.mock.timers.tick(120000);await tick();assert.equal(calls,2);assert.equal(card._timer,null);
});
