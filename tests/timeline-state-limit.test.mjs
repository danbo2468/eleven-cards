import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function load(){
 const registry=new Map();
 const context=vm.createContext({HTMLElement:class{attachShadow(){this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}},window:new EventTarget(),customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},setTimeout,clearTimeout,URLSearchParams,Date,Intl});
 vm.runInContext(readFileSync(new URL('../cards/timeline-card/dist/eleven-timeline-card.js',import.meta.url),'utf8'),context);
 return registry.get('eleven-timeline-card');
}
async function history(states,options={}){
 const Card=load(),card=new Card();card.setConfig({entities:['sensor.test','switch.valid'],show_summary:true,...options});
 card.hass={locale:{language:'nl'},states:{},callApi:async(_,url)=>{
  const start=Date.parse(url.split('?')[0].replace('history/period/',''));
  return [states.map((state,i)=>({entity_id:'sensor.test',state,last_changed:new Date(start+i*1000).toISOString()})),[{entity_id:'switch.valid',state:'on',last_changed:new Date(start).toISOString()}]];
 }};
 card.connectedCallback();await new Promise(r=>setImmediate(r));card.disconnectedCallback();return card;
}
test('21 distinct states reject only the offending entity before rendering segments',async()=>{
 const card=await history(Array.from({length:21},(_,i)=>String(i)));
 assert.equal(card._status,'ready');
 assert.equal(card._series[0].length,0);
 assert.equal(card._series[1].length,1);
 assert.match(card.shadowRoot.innerHTML,/Maximaal 20 verschillende statussen per entiteit/);
 assert.equal((card.shadowRoot.innerHTML.match(/class="segment /g)??[]).length,1);
 assert.doesNotMatch(card.shadowRoot.innerHTML,/sensor\.test: 0/);
});
test('rejected entities are omitted from the tooltip while valid entities remain',async()=>{
 const card=await history(Array.from({length:50},(_,i)=>String(i)));
 const tooltip={innerHTML:'',style:{},getBoundingClientRect:()=>({width:180,height:80})};
 const guide={style:{}};
 const chart={querySelector:s=>s==='.tooltip'?tooltip:guide,getBoundingClientRect:()=>({width:600,top:40})};
 card.shadowRoot.querySelector=s=>s==='.chart'?chart:null;
 card._showTooltip(card._viewStart+1000,false);
 assert.doesNotMatch(tooltip.innerHTML,/sensor\.test|Maximaal 20/);
 assert.match(tooltip.innerHTML,/switch\.valid/);
 assert.equal(tooltip.hidden,false);
});
test('20 distinct states remain allowed, including repeated transitions',async()=>{
 const card=await history(Array.from({length:200},(_,i)=>String(i%20)));
 assert.equal(card._series[0].length,200);
 assert.doesNotMatch(card.shadowRoot.innerHTML,/class="state-limit"/);
});
test('state limits use raw values, not mapped labels; unknown and unavailable count',async()=>{
 const states=[...Array.from({length:19},(_,i)=>String(i)),'unknown','unavailable'];
 const card=await history(states,{state_colors:states.map(state=>({state,label:'Same',color:'#fff'}))});
 assert.equal(card._series[0].length,0);
});
test('a later valid history clears rejection and zoom does not bypass rejection',async()=>{
 const card=await history(Array.from({length:21},(_,i)=>String(i)));
 card._zoom(.5);assert.match(card.shadowRoot.innerHTML,/class="state-limit"/);
 card._hass.callApi=async()=>[[{entity_id:'sensor.test',state:'on',last_changed:new Date(card._start).toISOString()}]];
 card.connectedCallback();await new Promise(r=>setImmediate(r));card.disconnectedCallback();
 assert.equal(card._series[0].length,1);
 assert.doesNotMatch(card.shadowRoot.innerHTML,/class="state-limit"/);
 card._hass.locale.language='en';assert.match(card._stateLimitMessage(),/Maximum 20 distinct states/);
});
