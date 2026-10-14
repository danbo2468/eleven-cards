import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../src/history-utils.js';
const base={entities:['sensor.a']};
test('appearance options preserve defaults and validate manual configuration',()=>{
 const c=u.validateConfig(base);
 assert.equal(c.line_width,3.5);assert.equal(c.show_fill,false);assert.equal(c.fill_fade,true);assert.equal(c.fill_opacity,0.18);assert.equal(c.show_hover_line,true);
 assert.equal(u.validateConfig({...base,line_style:'dotted',line_color:[0,0,0],show_fill:true}).line_style,'dotted');
 for(const option of [{line_width:0},{line_width:9},{line_style:'bad'},{line_color:'red;stroke:url(evil)'},{line_color:[256,0,0]},{show_fill:'yes'},{fill_opacity:2},{fill_fade:0},{show_hover_line:0}])assert.throws(()=>u.validateConfig({...base,...option}));
});
test('manual value-based gradient sorts stops, rejects ambiguous stops and interpolates colors',()=>{
 const stops=[{value:30,color:'#ff0000'},{value:10,color:[0,0,255]},{value:20,color:'#00ff00'}];
 const c=u.validateConfig({...base,gradient_stops:stops});
 assert.deepEqual(c.gradient_stops.map(s=>s.value),[10,20,30]);assert.equal(stops[0].value,30);
 assert.equal(u.gradientColor(c.gradient_stops,15,'smooth'),'rgb(0,128,128)');
 assert.equal(u.gradientColor(c.gradient_stops,15,'steps'),'rgb(0,0,255)');
 assert.equal(u.gradientColor(c.gradient_stops,-5,'smooth'),'rgb(0,0,255)');
 assert.equal(u.gradientColor(c.gradient_stops,99,'smooth'),'rgb(255,0,0)');
 for(const option of [{gradient_stops:[stops[0]]},{gradient_stops:[stops[0],stops[0]]},{gradient_stops:[{value:'10',color:'#000000'},stops[0]]},{gradient_stops:[{value:0,color:'bad'},stops[0]]},{gradient_mode:'bad'}])assert.throws(()=>u.validateConfig({...base,...option}));
 assert.deepEqual(u.validateConfig({...base,gradient_stops:null}).gradient_stops,[]);
});
