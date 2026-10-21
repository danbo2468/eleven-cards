import {test} from 'node:test';import assert from 'node:assert/strict';
globalThis.HTMLElement=class{attachShadow(){this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}dispatchEvent(e){this.event=e;}};
globalThis.window={customCards:[]};globalThis.customElements={get:()=>true};
const {OverviewCard,OverviewEditor}=await import('../src/overview-card.js');
const states={'sensor.a':{state:'12',attributes:{friendly_name:'Power',unit_of_measurement:'W'}}};
test('unrelated Home Assistant updates leave the rendered overview in place',()=>{
 const c=new OverviewCard();c.setConfig({entities:['sensor.a']});let renders=0;c._render=()=>renders++;
 c.hass={states,language:'en'};assert.equal(renders,1);
 c.hass={states:{...states,'sensor.unrelated':{state:'changed'}} ,language:'en'};assert.equal(renders,1);
 c.hass={states:{...states,'sensor.a':{...states['sensor.a'],state:'13'}},language:'en'};assert.equal(renders,2);
});
test('live current values remain visible when history fails; retry requests again',async()=>{
 const c=new OverviewCard();c.setConfig({entities:['sensor.a']});let calls=0;c.hass={states,callApi:async()=>{calls++;throw Error('offline');}};c.connectedCallback();await c._refresh();
 assert.match(c.shadowRoot.innerHTML,/>12</);assert.match(c.shadowRoot.innerHTML,/retry/);assert.equal(c._status,'error');await c._refresh();assert.equal(calls,2);c.disconnectedCallback();assert.equal(c._timer,null);
});
test('batched history, no requests on ordinary hass updates, and detached responses ignored',async()=>{
 let resolve,calls=0;const c=new OverviewCard();c.setConfig({entities:['sensor.a']});c.hass={states,callApi:()=>{calls++;return new Promise(r=>resolve=r);}};c.connectedCallback();assert.equal(calls,1);
 c.hass={...c.hass,states:{...states,'sensor.a':{...states['sensor.a'],state:'0'}}};assert.equal(calls,1);assert.match(c.shadowRoot.innerHTML,/>0</);c.disconnectedCallback();resolve([]);await Promise.resolve();assert.notEqual(c._status,'ready');
});
test('absolute percentage deltas are labeled percentage points, not relative percent',()=>{
 const c=new OverviewCard();c.setConfig({entities:['sensor.a']});c.hass={states:{'sensor.a':{state:'54',attributes:{unit_of_measurement:'%'}}}};c._status='ready';c._units={'sensor.a':'%'};c._history={'sensor.a':{points:[],baseline:50}};c._render();assert.match(c.shadowRoot.innerHTML,/\+4 pp</);
});
test('numeric formatting never rounds a finite nonzero reading to zero',()=>{
 const c=new OverviewCard();c.hass={language:'en',states:{}};assert.notEqual(c._format(0.00004),'0');assert.notEqual(c._format(-0.00004),'-0');
});
test('a hung history request times out and remains retryable',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const c=new OverviewCard();c.setConfig({entities:['sensor.a']});c.hass={states,callApi:()=>new Promise(()=>{})};c.connectedCallback();const pending=c._refresh();t.mock.timers.tick(15001);await pending;assert.equal(c._status,'error');assert.equal(c._promise,null);c.disconnectedCallback();
});
test('picker, stub and editor global/per-sensor ownership contract',()=>{
 assert.equal(OverviewCard.getGridOptions?.(),undefined);assert.ok(new OverviewCard().getGridOptions().rows>=2);
 const cfg=OverviewCard.getStubConfig({states});assert.equal(cfg.entities[0],'sensor.a');assert.equal(cfg.title,'Eleven Overview (beta)');
 const editor=new OverviewEditor();editor.setConfig(Object.freeze({entities:Object.freeze(['sensor.a'])}));assert.equal(editor._config.entities[0].entity,'sensor.a');
 assert.equal(OverviewCard.getConfigForm().schema.filter(s=>s.name==='entities').length,0);
 assert.deepEqual(OverviewCard.getSensorForm().schema.map(s=>s.name),['entity','name','color']);
});
