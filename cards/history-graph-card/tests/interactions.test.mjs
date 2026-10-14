import {test} from 'node:test';import assert from 'node:assert/strict';
globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};globalThis.customElements={get:()=>undefined,define(){}};globalThis.window={};
const load=()=>import('../src/history-graph-card.js');
test('keyboard and pointer inspect held states with bounded tooltip; touch pins and Escape dismisses',async()=>{
 const {HistoryGraphCard:C}=await load();const card=new C();card.setConfig({entities:['sensor.a']});
 const tooltip={hidden:true,style:{},innerHTML:'',getBoundingClientRect(){return {width:140,height:Math.min(250,Number.parseFloat(this.style.maxHeight)||250)};}};const live={textContent:''},markers={innerHTML:''},guide={style:{},hidden:true};
 const plot={getBoundingClientRect:()=>({left:44,top:22,width:264,height:180})};
 const chart={getBoundingClientRect:()=>({left:0,top:0,width:320,height:232}),querySelector:s=>({'.tooltip':tooltip,'.sr-only':live,'.markers':markers,'.guide':guide,'.plot':plot}[s])};
 card.shadowRoot.querySelector=()=>chart;card._lang='nl';card._meta={unit:'°C',items:[{name:'Room'}]};card._series=[{points:[{t:0,v:20},{t:500,v:null},{t:750,v:21}]}];card._start=0;card._end=1000;card._range=[19,22];
 card._bindInteractions();chart.onkeydown({key:'Home',preventDefault(){}});assert.equal(tooltip.hidden,false);assert.match(tooltip.innerHTML,/20 °C/);assert.ok(Number.parseFloat(tooltip.style.left)>=4);assert.ok(Number.parseFloat(tooltip.style.left)+140<=316);assert.ok(Number.parseFloat(tooltip.style.top)+tooltip.getBoundingClientRect().height<=228);
 chart.onkeydown({key:'ArrowRight',preventDefault(){}});assert.match(tooltip.innerHTML,/Niet beschikbaar/);assert.equal(markers.innerHTML,'');
 chart.onpointerdown({clientX:280});assert.equal(card._pinned,true);assert.match(tooltip.innerHTML,/21 °C/);const pinnedCursor=card._cursor;chart.onpointerdown({clientX:50,target:{closest:()=>true}});assert.equal(card._cursor,pinnedCursor);chart.onpointerleave();assert.equal(tooltip.hidden,false);
 chart.onkeydown({key:'Escape',preventDefault(){}});assert.equal(tooltip.hidden,true);assert.equal(card._pinned,false);
 chart.onpointermove({clientX:50});assert.equal(tooltip.hidden,false);chart.onpointerleave();assert.equal(tooltip.hidden,true);
});
