import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editorConfig,cardConfig,validateConfig} from '../src/history-utils.js';

test('legacy appearance migrates to explicit independent sensor rows without duplicate global controls',()=>{
 const old={entities:['sensor.a','sensor.b'],line_width:5,line_style:'dotted',line_interpolation:'linear',show_fill:true,fill_color:'#112233',fill_opacity:0.4,fill_fade:false,gradient_stops:[{value:0,color:'#000000'},{value:20,color:'#ffffff'}],series_options:[{entity:'sensor.b',color:'#ff0000'}]};
 const copy=structuredClone(old),data=editorConfig(old);
 assert.equal(data.line_width,undefined);
 assert.equal(data.entities[0].color_mode,'gradient');assert.equal(data.entities[1].color_mode,'fixed');
 for(const row of data.entities){assert.equal(row.line_width,5);assert.equal(row.line_style,'dotted');assert.equal(row.line_interpolation,'linear');assert.equal(row.show_fill,true);assert.equal(row.fill_mode,'own');assert.deepEqual(row.fill_color,[17,34,51]);}
 assert.deepEqual(old,copy);
 const saved=cardConfig(data);assert.equal(saved.line_width,undefined);assert.equal(saved.gradient_stops,undefined);
 assert.equal(saved.series_options.length,2);assert.deepEqual(editorConfig(saved),data);
 assert.doesNotThrow(()=>validateConfig(saved));
});
test('editor shows concrete graph and processing defaults, not unchecked inherited switches',()=>{
 const data=editorConfig({entities:['sensor.a']});
 assert.equal(data.hours_to_show,24);assert.equal(data.show_hover_line,true);assert.equal(data.show_legend,true);assert.equal(data.sync_hover,true);assert.equal(data.graph_mode,'lines');assert.equal(data.aggregation_period,'none');assert.equal(data.aggregation_method,'avg');
});
test('every independent appearance property is validated including active color modes',()=>{
 for(const override of [{line_width:0},{line_style:'bad'},{line_interpolation:'bad'},{show_fill:'yes'},{fill_opacity:2},{fill_fade:'yes'},{fill_color:'bad'},{color_mode:'bad'},{fill_mode:'bad'},{color_mode:'gradient',gradient_stops:[]}]){
  assert.throws(()=>validateConfig({entities:['sensor.a'],series_options:[{entity:'sensor.a',...override}]}),JSON.stringify(override));
 }
 assert.doesNotThrow(()=>validateConfig({entities:['sensor.a'],series_options:[{entity:'sensor.a',color_mode:'fixed',color:[0,0,0],show_fill:false,fill_opacity:0,fill_fade:false,fill_mode:'line'}]}));
});
