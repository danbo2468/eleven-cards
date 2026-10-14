import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class {attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};
globalThis.customElements={get:()=>undefined,define(){}};globalThis.window=new EventTarget();globalThis.document={querySelector:()=>null,addEventListener(){},removeEventListener(){}};
const {HistoryGraphCard:C}=await import('../src/history-graph-card.js');
const u=await import('../src/history-utils.js');
const flat=s=>s.flatMap(x=>x.schema?flat(x.schema):[x]);
test('explicit source selector hides linked geometry but retains independently owned colors and fill',()=>{
 const rows=u.editorConfig({entities:['sensor.a','sensor.b'],series_options:[{entity:'sensor.b',line_style_source:'sensor.a',color_mode:'fixed',show_fill:true,fill_mode:'own'}]}).entities;
 const linked=flat(C.getSeriesConfigForm(rows[1],rows).schema);
 const source=linked.find(x=>x.name==='line_style_source');assert.ok(source);
 assert.deepEqual(source.selector.select.options.map(x=>x.value),['','sensor.a']);
 for(const name of ['line_width','line_style','line_interpolation'])assert.ok(!linked.some(x=>x.name===name));
 for(const name of ['color_mode','color','show_fill','fill_mode','fill_color'])assert.ok(linked.some(x=>x.name===name));
 assert.ok(!flat(C.getSeriesConfigForm(rows[0],[rows[0]]).schema).some(x=>x.name==='line_style_source'));
 assert.equal(C.getSeriesConfigForm(rows[1],rows).computeLabel.call({hass:{language:'nl'}},{name:'line_style_source'}),'Lijnopmaak');
});
test('invalid line links report a specific localized configuration error',()=>{
 const card=new C();card.hass={language:'nl'};
 assert.throws(()=>card.setConfig({entities:['sensor.a'],series_options:[{entity:'sensor.a',line_style_source:'sensor.a'}]}),/Ongeldige bron voor lijnopmaak/);
});
test('graph controls have no duplicate entity or appearance selection',()=>{
 const all=flat(C.getConfigForm().schema);
 for(const name of ['entities','series_options','color','line_color','line_width','show_fill','gradient_stops'])assert.equal(all.some(x=>x.name===name),false,name);
 for(const name of ['title','hours_to_show','y_min','y_max','show_hover_line','aggregation_period','aggregation_method'])assert.equal(all.some(x=>x.name===name),true,name);
});
test('each sensor has identity, line and fill groups with conditional native fields',()=>{
 const fields=row=>flat(C.getSeriesConfigForm(row).schema).map(x=>x.name);
 const fixed=fields({color_mode:'fixed',show_fill:false});
 for(const name of ['entity','name','line_width','line_style','line_interpolation','color_mode','color','show_fill'])assert.ok(fixed.includes(name),name);
 for(const name of ['gradient_stops','gradient_mode','fill_color','fill_opacity','fill_fade','fill_mode'])assert.ok(!fixed.includes(name),name);
 const gradient=fields({color_mode:'gradient',show_fill:true,fill_mode:'line'});
 assert.ok(!gradient.includes('color'));assert.ok(gradient.includes('gradient_stops'));assert.ok(gradient.includes('gradient_mode'));
 assert.ok(gradient.includes('fill_opacity'));assert.ok(!gradient.includes('fill_color'));
 assert.ok(fields({color_mode:'fixed',show_fill:true,fill_mode:'own'}).includes('fill_color'));
 const f=C.getSeriesConfigForm({color_mode:'fixed'});
 assert.equal(f.computeLabel.call({hass:{language:'nl'}},{name:'color_mode'}),'Lijnkleur');
});
test('gradient-only legacy options roundtrip with modes, no mutation and sorted validation',()=>{
 const old={entities:['sensor.a'],series_options:[{entity:'sensor.a',gradient_mode:'steps',gradient_stops:[{value:30,color:'#ff0000'},{value:10,color:[0,0,255]}]}]};
 const copy=structuredClone(old),data=u.editorConfig(old),saved=u.cardConfig(data);
 assert.equal(saved.series_options[0].color_mode,'gradient');assert.equal(saved.series_options[0].gradient_mode,'steps');
 assert.deepEqual(u.validateConfig(saved).series_options[0].gradient_stops.map(s=>s.value),[10,30]);assert.deepEqual(old,copy);
});
test('remove, replace and reorder sensor rows preserve appearance on the object',()=>{
 const data=u.editorConfig({entities:['sensor.a','sensor.b'],series_options:[{entity:'sensor.b',name:'Bedroom',color:'#123456'}]});
 const b=data.entities[1];const saved=u.cardConfig({...data,entities:[b,{...data.entities[0],entity:'sensor.c',name:''}]});
 assert.deepEqual(saved.entities,['sensor.b','sensor.c']);assert.equal(saved.series_options[0].name,'Bedroom');assert.deepEqual(saved.series_options[0].color,[18,52,86]);assert.equal(saved.series_options[1].name,undefined);
 assert.doesNotThrow(()=>u.validateConfig(saved));
});
