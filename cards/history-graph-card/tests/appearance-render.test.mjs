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
test('two sensors have independent line geometry and fill, also after legacy editor migration',()=>{
 const options={show_fill:true,series_options:[
  {entity:'sensor.a',color_mode:'fixed',color:'#ff0000',line_width:2,line_style:'solid',line_interpolation:'linear',show_fill:false},
  {entity:'sensor.b',color_mode:'gradient',gradient_stops:[{value:10,color:'#000000'},{value:30,color:'#ffffff'}],line_width:7,line_style:'dotted',line_interpolation:'smooth',show_fill:true,fill_mode:'own',fill_color:'#123456',fill_opacity:0.6,fill_fade:false}
 ]};
 const c=render(options),html=c.shadowRoot.innerHTML;
 assert.equal(c._appearance(0).width,2);assert.equal(c._appearance(1).width,7);
 assert.equal(c._appearance(1).style,'dotted');
 assert.equal((html.match(/class="series-fill"/g)??[]).length,1);
 assert.match(html,/fill="#123456"/);assert.match(html,/fill-opacity="0.6"/);assert.doesNotMatch(html,/mask="url/);
 const lines=[...html.matchAll(/<path[^>]+class="series-line"[^>]+>/g)].map(m=>m[0]);
 assert.match(lines[0],/ L /);assert.doesNotMatch(lines[0],/ V | C /);assert.match(lines[1],/ C /);
});
test('each sensor renders its own gradient for lines, fill and value colors',()=>{
 const card=render({show_fill:true,series_options:[
  {entity:'sensor.a',gradient_stops:[{value:10,color:'#000000'},{value:30,color:'#ff0000'}]},
  {entity:'sensor.b',gradient_mode:'steps',gradient_stops:[{value:10,color:'#0000ff'},{value:30,color:'#00ff00'}]}
 ]});
 assert.equal(card._appearance(0,20).color,'rgb(128,0,0)');
 assert.equal(card._appearance(1,20).color,'rgb(0,0,255)');
 const html=card.shadowRoot.innerHTML;
 for(const i of [0,1]){assert.match(html,new RegExp(`id="history-colors-${i}"`));assert.match(html,new RegExp(`stroke="url\\(#history-colors-${i}\\)"`));assert.match(html,new RegExp(`fill="url\\(#history-colors-${i}\\)"`));}
});
test('sensor fixed colors and explicitly empty gradients take priority over shared defaults',()=>{
 const card=render({gradient_stops:[{value:10,color:'#000000'},{value:30,color:'#ffffff'}],series_options:[{entity:'sensor.a',color:[0,0,0]},{entity:'sensor.b',gradient_stops:[]}]});
 assert.equal(card._appearance(0,20).color,'rgb(0,0,0)');assert.equal(card._appearance(0).stroke,'rgb(0,0,0)');
 assert.equal(card._appearance(1).stroke,'#e78a14');
 assert.doesNotMatch(card.shadowRoot.innerHTML,/id="history-colors-/);
 const fallback=render({gradient_stops:[{value:10,color:'#000000'},{value:30,color:'#ffffff'}]});assert.equal(fallback._appearance(0,20).color,'rgb(128,128,128)');
});
test('legend visibility belongs to the graph and preserves tooltip/series',()=>{
 const c=render({show_legend:false});assert.doesNotMatch(c.shadowRoot.innerHTML,/class="legend"/);assert.match(c.shadowRoot.innerHTML,/class="series-line"/);assert.match(c.shadowRoot.innerHTML,/class="tooltip"/);
 assert.ok(C.getConfigForm().schema.flatMap(s=>s.schema??[s]).some(s=>s.name==='show_legend'));
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
 const form=C.getSeriesConfigForm({color_mode:'gradient',show_fill:true,fill_mode:'own'});const all=form.schema.flatMap(s=>s.schema??[s]);
 for(const name of ['line_style','line_width','show_fill','fill_color','fill_opacity','fill_fade','gradient_mode','gradient_stops'])assert.ok(all.some(s=>s.name===name),name);
 assert.equal(form.computeLabel.call({hass:{language:'nl'}},{name:'gradient_stops'}),'Kleurovergangen');
 assert.equal(form.computeLabel.call({hass:{language:'en'}},{name:'line_width'}),'Line width');
 assert.doesNotThrow(()=>form.computeLabel({}));
});
test('Y-axis has its own localized discoverable expansion with optional flat fields',async()=>{
 const form=C.getConfigForm(),group=form.schema.find(s=>s.name==='y_axis');
 assert.ok(group,'dedicated Y-axis group');assert.equal(group.type,'expandable');assert.equal(group.flatten,true);
 assert.deepEqual(group.schema.map(s=>s.name),['y_min','y_max','y_step','align_zero']);
 for(const field of group.schema.filter(s=>s.name!=='align_zero')){assert.notEqual(field.required,true);assert.equal(field.selector.number.step,'any');}
 assert.equal(form.computeLabel.call({hass:{language:'nl'}},group),'Y-as');
 assert.equal(form.computeLabel.call({hass:{language:'en'}},group),'Y-axis');
 assert.equal(form.computeLabel.call({hass:{language:'nl'}},{name:'y_step'}),'Stapgrootte Y-as');
 assert.match(form.computeHelper.call({hass:{language:'en'}},{name:'y_step'}),/200/);
 assert.ok(!form.schema.find(s=>s.name==='graph_settings').schema.some(s=>s.name.startsWith('y_')));
 const {editorConfig,cardConfig,validateConfig}=await import('../src/history-utils.js');
 const original={entities:['sensor.a'],y_min:-1.1,y_max:1.1,y_step:0.5};
 const saved=cardConfig(editorConfig(original));
 for(const key of ['y_min','y_max','y_step'])assert.equal(saved[key],original[key]);
 const reset=validateConfig(cardConfig({...editorConfig(saved),y_min:'',y_max:null,y_step:''}));
 for(const key of ['y_min','y_max','y_step'])assert.equal(reset[key],undefined);
});
test('renderer uses nice ticks by default and actual manual tick positions',()=>{
 const automatic=render();assert.deepEqual(automatic._range,[0,40]);
 const labels=card=>[...card.shadowRoot.innerHTML.matchAll(/class="axis-y"[^>]*>([^<]+)<\/span>/g)].map(m=>m[1]);
 assert.deepEqual(labels(automatic),['40','30','20','10','0']);
 const fixed=render({y_min:11,y_max:23,y_step:5});
 assert.deepEqual(fixed._range,[11,23]);assert.deepEqual(labels(fixed),['20','15']);
 const positions=[...fixed.shadowRoot.innerHTML.matchAll(/class="axis-y" style="top:calc\(([\d.]+)%/g)].map(m=>Number(m[1]));
 assert.ok(Math.abs(positions[0]-25)<1e-8);assert.ok(Math.abs(positions[1]-200/3)<1e-8);
});
test('invalid or excessive manual steps show actionable localized errors',()=>{
 assert.throws(()=>new C().setConfig({entities:['sensor.a'],y_step:0}),/positive/);
 assert.throws(()=>new C().setConfig({entities:['sensor.a'],y_min:0,y_max:1000,y_step:1}),/200/);
 const dutch=new C();dutch._hass={language:'nl'};
 assert.throws(()=>dutch.setConfig({entities:['sensor.a'],y_step:-1}),/positief/);
 const excessive=render({y_step:0.001});
 assert.match(excessive.shadowRoot.innerHTML,/200/);assert.match(excessive.shadowRoot.innerHTML,/increase/i);
 assert.doesNotMatch(excessive.shadowRoot.innerHTML,/class="series-line"/);
 assert.equal(excessive._config.y_step,0.001,'never silently override manual step');
});
test('decimal tick labels stay distinct and tiny sensor values never display as zero',async()=>{
 const card=render({y_min:0.001,y_max:0.0025,y_step:0.0005});
 const labels=[...card.shadowRoot.innerHTML.matchAll(/class="axis-y"[^>]*>([^<]+)<\/span>/g)].map(m=>m[1]);
 assert.deepEqual(labels,['0.0025','0.002','0.0015','0.001']);
 const {number}=await import('../src/localization.js');
 assert.notEqual(number(0.00000012,'en'),'0');assert.notEqual(number(-0.00000012,'nl'),'-0');
 const nl=render({y_min:0.101,y_max:0.104,y_step:0.001});nl._hass.language='nl';nl._render();
 for(const value of ['0,101','0,102','0,103','0,104'])assert.ok(nl.shadowRoot.innerHTML.includes('>'+value+'</span>'),value);
});
