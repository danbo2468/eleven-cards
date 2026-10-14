import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};
globalThis.customElements={get:()=>undefined,define:()=>{}};globalThis.window={};globalThis.document={querySelector:()=>null};
const {HistoryGraphCard:C}=await import('../src/history-graph-card.js');
function render(options={}){const card=new C();card.setConfig({entities:['sensor.a','sensor.b'],...options});card._hass={language:'en',states:Object.fromEntries(['sensor.a','sensor.b'].map(id=>[id,{attributes:{unit_of_measurement:'°C',friendly_name:id}}]))};card._series=['sensor.a','sensor.b'].map(id=>({id,points:[{t:0,v:10},{t:25,v:null},{t:50,v:20},{t:75,v:30}]}));card._start=0;card._end=100;card._status='ready';card._render();return card;}
test('renders energy-card line styling, value gradient, gap-safe fill and fading',()=>{
 const card=render({line_style:'dotted',line_width:6,line_color:[0,0,0],show_fill:true,fill_opacity:0.3,gradient_stops:[{value:10,color:'#0000ff'},{value:20,color:'#00ff00'},{value:30,color:'#ff0000'}]});
 const html=card.shadowRoot.innerHTML;
 assert.match(html,/stroke-width="6"/);assert.match(html,/stroke-dasharray="1 7"/);assert.match(html,/stroke-linecap="round"/);
 assert.match(html,/linearGradient[^>]*gradientUnits="userSpaceOnUse"/);assert.match(html,/class="series-fill"/);assert.match(html,/fill-opacity="0.3"/);assert.match(html,/mask="url\(#history-fill-fade\)"/);
 assert.match(html,/M 0 [\d.]+ H 250 L 250 300 L 0 300 Z M 500/);
 assert.equal((html.match(/class="series-line"/g)??[]).length,2);
 assert.match(render().shadowRoot.innerHTML,/stroke="#2196f3"/);assert.doesNotMatch(render().shadowRoot.innerHTML,/class="series-fill"/);
 assert.doesNotMatch(render({show_fill:true,fill_fade:false}).shadowRoot.innerHTML,/mask="url/);
 assert.doesNotMatch(render({show_hover_line:false}).shadowRoot.innerHTML,/<div class="guide"/);
 assert.match(render({show_fill:true,fill_color:[12,34,56]}).shadowRoot.innerHTML,/fill="rgb\(12,34,56\)"/);
 assert.match(render({line_color:[0,0,0]}).shadowRoot.innerHTML,/stroke="rgb\(0,0,0\)"/);
});
test('manual bounds reach rendered axis and native editor',()=>{
 const card=render({y_min:15,y_max:25});
 assert.deepEqual(card._range,[15,25]);
 assert.match(card.shadowRoot.innerHTML,/overflow:hidden/);
 const form=C.getConfigForm();const all=form.schema.flatMap(s=>s.schema??[s]);
 for(const name of ['y_min','y_max'])assert.ok(all.some(s=>s.name===name),name);
 assert.equal(form.computeLabel.call({hass:{language:'nl'}},{name:'y_min'}),'Minimum Y-as');
});
test('native form exposes localized appearance and gradient controls',()=>{
 const form=C.getConfigForm();const all=form.schema.flatMap(s=>s.schema??[s]);
 for(const name of ['line_style','line_width','line_color','show_fill','fill_opacity','fill_fade','gradient_mode','gradient_stops','show_hover_line'])assert.ok(all.some(s=>s.name===name),name);
 assert.equal(form.computeLabel.call({hass:{language:'nl'}},{name:'gradient_stops'}),'Kleurovergangen');
 assert.equal(form.computeLabel.call({hass:{language:'en'}},{name:'line_width'}),'Line width');
 assert.doesNotThrow(()=>form.computeLabel({}));
});
