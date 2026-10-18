import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {timelineStateDurations} from '../cards/timeline-card/src/timeline-utils.js';
const H=3600000;
function fixture(config={}){
 const registry=new Map(),ctx=vm.createContext({HTMLElement:class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}},window:new EventTarget(),customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},setTimeout,clearTimeout,URLSearchParams,Intl,queueMicrotask});
 vm.runInContext(readFileSync(new URL('../cards/timeline-card/dist/eleven-timeline-card.js',import.meta.url),'utf8'),ctx);
 const C=registry.get('eleven-timeline-card'),c=new C();c.setConfig({entities:['switch.a','sensor.b'],...config});
 c._hass={language:'nl',config:{time_zone:'UTC'},states:{}};c._start=0;c._end=4*H;c._status='ready';
 c._series=[[{start:0,end:H,state:'on'},{start:H,end:2*H,state:'off'},{start:2*H,end:4*H,state:'on'}],[{start:0,end:H,state:'unknown',missing:true},{start:H,end:2*H,state:'unknown'},{start:2*H,end:4*H,state:'unavailable'}]];
 c._lastLoad={sources:c._config.entities.map(id=>({id,source:'history'}))};c._render();return c;
}
const sensor=(c,id)=>c.shadowRoot.innerHTML.match(new RegExp(`data-information-entity="${id}"[\\s\\S]*?</section>`))?.[0];

test('timeline sums recurring states over the visible interval without merging identical labels',()=>{
 const c=fixture({state_colors:[{state:'on',label:'Zelfde',color:'#fff'},{state:'off',label:'Zelfde',color:'#000'}]});
 let html=sensor(c,'switch.a');assert.match(html,/title="on">Zelfde<\/dt><dd>3u 0 min/);assert.match(html,/title="off">Zelfde<\/dt><dd>1u 0 min/);assert.doesNotMatch(html,/data-metric=/);
 c._viewport=[H/2,2.5*H];c._render();html=sensor(c,'switch.a');assert.match(html,/title="on">Zelfde<\/dt><dd>1u 0 min/);assert.match(html,/title="off">Zelfde<\/dt><dd>1u 0 min/);
});
test('missing history, recorded unknown and unavailable remain separate',()=>{
 const c=fixture(),html=sensor(c,'sensor.b');assert.match(html,/Geen geschiedenis<\/dt><dd>1u 0 min/);assert.match(html,/Onbekend<\/dt><dd>1u 0 min/);assert.match(html,/Niet beschikbaar<\/dt><dd>2u 0 min/);assert.match(html,/Onvolledig/);
 c._viewport=[H,4*H];c._render();assert.doesNotMatch(sensor(c,'sensor.b'),/Onvolledig|Geen geschiedenis<\/dt>/);
});
test('duration totals use elapsed time across DST and exclude exact-end transitions',()=>{
 const start=Date.parse('2026-10-24T22:00:00Z'),end=Date.parse('2026-10-25T23:00:00Z');
 assert.deepEqual(timelineStateDurations([{start:start-H,end,state:'on'},{start:end,end:end+H,state:'off'}],start,end),[{state:'on',missing:false,duration:25*H}]);
 assert.deepEqual(timelineStateDurations([],start,end),[]);
});
test('information remains safe and useful for hidden, short, stale and rejected series',()=>{
 const c=fixture({state_colors:[{state:'on',label:'<img src=x>',color:'#fff'}]});c._series[0]=[{start:0,end:1000,state:'on'}];c._visibility.set('switch.a',false);c._stateLimits=[false,true];c._render();
 assert.match(sensor(c,'switch.a'),/&lt;img src=x&gt;/);assert.match(sensor(c,'switch.a'),/&lt;1 min/);assert.match(sensor(c,'switch.a'),/Verborgen/);assert.doesNotMatch(c.shadowRoot.innerHTML,/<img/);assert.match(sensor(c,'sensor.b'),/Meer dan 20 statussen/);
 c._status='error';c._loadFailed=true;c._series=[];c._render();assert.match(sensor(c,'switch.a'),/&lt;1 min/);assert.match(sensor(c,'switch.a'),/Verouderd/);
});
test('timeline hover tooltip uses separate theme-aware labels and values',()=>{
 const c=fixture(),tooltip={style:{},getBoundingClientRect:()=>({width:200,height:100})},guide={style:{}};
 const chart={querySelector:s=>s==='.tooltip'?tooltip:guide,getBoundingClientRect:()=>({width:600,top:40})};
 c.shadowRoot.querySelector=s=>s==='.chart'?chart:null;c._showTooltip(H/2,false);
 assert.match(tooltip.innerHTML,/<b class="tooltip-label">switch.a: <em class="tooltip-value">on<\/em>/);
 assert.match(c.shadowRoot.innerHTML,/\.tooltip \.tooltip-label\{color:var\(--secondary-text-color,#666\)\}/);
 assert.match(c.shadowRoot.innerHTML,/\.tooltip \.tooltip-value\{color:var\(--primary-text-color,#20252b\)/);
});
