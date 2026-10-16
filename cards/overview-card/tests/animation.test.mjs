import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class{attachShadow(){this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}};
const {OverviewCard}=await import('../src/overview-card.js');
function fixture(){
 let now=0,next=0;const frames=new Map();
 globalThis.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};
 globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.matchMedia=()=>({matches:false});
 const c=new OverviewCard();c._connected=true;
 const tick=t=>{now=t;const work=[...frames.values()];frames.clear();for(const fn of work)fn(now);};
 return {c,tick,frames};
}
test('short eased animation starts at old reading, retargets continuously and stops exactly',()=>{
 const {c,tick,frames}=fixture();
 assert.equal(c._reading('sensor.a',10,'W'),10);
 assert.equal(c._reading('sensor.a',20,'W'),10);
 tick(0);tick(150);const mid=c._readings.get('sensor.a').value;assert.ok(mid>10&&mid<20);
 assert.equal(c._reading('sensor.a',30,'W'),mid);
 tick(160);tick(310);assert.ok(c._readings.get('sensor.a').value>mid);
 tick(600);assert.equal(c._readings.get('sensor.a').value,30);assert.equal(frames.size,0);
});
test('unchanged target does not restart; unavailable, new units and reduced motion snap',()=>{
 const {c,tick,frames}=fixture();c._reading('sensor.a',10,'W');c._reading('sensor.a',20,'W');tick(0);tick(100);
 const entry=c._readings.get('sensor.a');c._reading('sensor.a',20,'W');assert.equal(entry,c._readings.get('sensor.a'));
 assert.equal(c._reading('sensor.a',null,'W'),null);assert.equal(c._reading('sensor.a',25,'W'),25);
 assert.equal(c._reading('sensor.a',0.025,'kW'),0.025);
 globalThis.matchMedia=()=>({matches:true});assert.equal(c._reading('sensor.a',1,'kW'),1);tick(400);assert.equal(frames.size,0);
});
test('animated readings never add decimals beyond the normal target display',()=>{
 const {c}=fixture();c._hass={locale:{language:'nl'}};
 for(const [target,precision] of [[20,0],[20.5,1],[20.55,2],[0.00004,5],[-20,0]]){
  const text=c._format(12.3456789,target);
  assert.ok((text.split(',')[1]?.length??0)<=precision,`${target}: ${text}`);
 }
 assert.equal(c._format(19.75,20),'20');
 assert.equal(c._format(19.75,20.5),'19,8');
 assert.equal(c._format(0.00004,0.00004),'0,00004');
});
test('spring accelerates briefly, settles with subtle overshoot and ends within 320ms',()=>{
 const {c,tick,frames}=fixture();c._reading('sensor.a',0,'W');c._reading('sensor.a',100,'W');
 const samples=[];for(let t=0;t<=320;t+=20){tick(t);samples.push(c._readings.get('sensor.a').value);}
 assert.ok(samples[2]-samples[1]>samples[1]-samples[0],'spring should accelerate from rest');
 assert.ok(Math.max(...samples)>100 && Math.max(...samples)<102,'subtle overshoot');
 assert.equal(samples.at(-1),100);assert.equal(frames.size,0);
});
test('render and every animated frame respect target display precision',()=>{
 const {c,tick}=fixture();c._hass={locale:{language:'nl'},states:{'sensor.a':{state:'10',attributes:{}}}};
 c._refresh=()=>Promise.resolve();c.setConfig({entities:['sensor.a'],show_graph:false,show_delta:false});
 const node={dataset:{entity:'sensor.a'},querySelector:()=>value},value={textContent:''};
 c.shadowRoot.querySelectorAll=()=>[node];
 c._hass.states['sensor.a'].state='20';c._render();
 assert.ok(c.shadowRoot.innerHTML.includes('class="value">10</span>'));
 for(let t=0;t<=320;t+=20){tick(t);assert.ok(!value.textContent.includes(','),value.textContent);}
 assert.equal(value.textContent,'20');
});
test('disconnect cancels animation; detached updates and reconnect start at actual value',()=>{
 const {c,frames}=fixture();c._reading('sensor.a',1,'W');c._reading('sensor.a',2,'W');assert.equal(frames.size,1);
 c.disconnectedCallback();assert.equal(frames.size,0);assert.equal(c._reading('sensor.a',3,'W'),3);
});
