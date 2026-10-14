import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../src/history-utils.js';
const config=()=>({entities:['sensor.a','sensor.b'],series_options:[{entity:'sensor.a',line_width:6,line_style:'dotted',line_interpolation:'linear',color:'#ff0000',show_fill:true},{entity:'sensor.b',line_style_source:'sensor.a',color:'#0000ff',show_fill:false}]});
test('explicit link follows only source line geometry live, preserving own color and fill',()=>{
 const c=config(),before=structuredClone(c);const b=u.seriesAppearance(c,1);
 assert.equal(b.line_width,6);assert.equal(b.line_style,'dotted');assert.equal(b.line_interpolation,'linear');assert.equal(b.line_style_source,'sensor.a');
 assert.equal(b.color,'#0000ff');assert.equal(b.show_fill,false);assert.deepEqual(c,before);
 c.series_options[0].line_width=2;assert.equal(u.seriesAppearance(c,1).line_width,2);
});

test('link validation rejects missing, malformed, self and circular sources',()=>{
 for(const source of ['sensor.missing','bad',42,'sensor.b']){
  const c=config();c.series_options[1].line_style_source=source;
  assert.throws(()=>u.validateConfig(c),/line_style_source/);
 }
 const c=config();c.series_options[0].line_style_source='sensor.b';assert.throws(()=>u.validateConfig(c),/line_style_source/);
 assert.doesNotThrow(()=>u.validateConfig(config()));
});
test('editor roundtrip and reorder retain the link and source geometry without shared color arrays',()=>{
 const d=u.editorConfig(config());const saved=u.cardConfig(d);
 assert.equal(saved.series_options[1].line_style_source,'sensor.a');assert.equal(saved.series_options[1].line_width,6);
 d.entities.reverse();const reversed=u.cardConfig(d);assert.equal(reversed.series_options[0].line_style_source,'sensor.a');assert.equal(u.seriesAppearance(reversed,0).line_width,6);
 assert.deepEqual(u.editorConfig(saved),u.editorConfig(config()));
});
test('detaching keeps latest effective geometry and removing a source keeps dependents valid',()=>{
 let d=u.editorConfig(config());d=u.updateSeriesRow(d,0,{line_width:7});
 const detached=u.updateSeriesRow(d,1,{line_style_source:''});
 assert.equal(detached.entities[1].line_width,7);assert.ok(!detached.entities[1].line_style_source);
 assert.equal(u.seriesAppearance(u.cardConfig(detached),1).line_style,'dotted');
 const removed=u.removeSeriesRow(d,0);assert.equal(removed.entities.length,1);assert.equal(removed.entities[0].line_width,7);assert.ok(!removed.entities[0].line_style_source);assert.doesNotThrow(()=>u.validateConfig(u.cardConfig(removed)));
 const renamed=u.updateSeriesRow(d,0,{entity:'sensor.c'});assert.equal(renamed.entities[1].line_style_source,'sensor.c');assert.doesNotThrow(()=>u.validateConfig(u.cardConfig(renamed)));
});
test('source choices exclude self and downstream sensors so cycles cannot be selected',()=>{
 const d=u.editorConfig(config());
 assert.deepEqual(u.lineStyleSources(d.entities,d.entities[0]),[]);
 assert.deepEqual(u.lineStyleSources(d.entities,d.entities[1]).map(r=>r.entity),['sensor.a']);
});
