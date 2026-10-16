import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig,numeric,color,escapeHtml} from '../src/overview-utils.js';
test('numeric sensors keep zero and negatives but reject empty/non-numeric states',()=>{
 for(const value of ['',null,undefined,'unavailable','unknown','Infinity','12 W','0x10'])assert.equal(numeric(value),null);
 assert.equal(numeric('0'),0);assert.equal(numeric('-2.5'),-2.5);
});
test('normalize independently copies frozen sensor settings and validates ranges',()=>{
 const input=Object.freeze({entities:Object.freeze([Object.freeze({entity:'sensor.a',name:'A',color:Object.freeze([1,2,3])}),'sensor.b'])});
 const c=normalizeConfig(input);assert.equal(c.hours_to_show,24);assert.equal(c.columns,'auto');assert.equal(c.entities[1].entity,'sensor.b');
 c.entities[0].color[0]=99;assert.equal(input.entities[0].color[0],1);
 for(const entities of [[],['light.a'],['sensor.a','sensor.a'],Array.from({length:9},(_,i)=>'sensor.a'+i)])assert.throws(()=>normalizeConfig({entities}));
 for(const hours_to_show of [0,-1,Infinity,9000])assert.throws(()=>normalizeConfig({entities:['sensor.a'],hours_to_show}));
 assert.throws(()=>normalizeConfig({entities:['sensor.a'],columns:7}));
});
test('untrusted configuration is safe for text and inline colors',()=>{
 assert.equal(escapeHtml('<a "x">&'), '&lt;a &quot;x&quot;&gt;&amp;');
 assert.equal(color('red;position:fixed'),'#2196f3');assert.equal(color([1,2,3]),'rgb(1,2,3)');assert.equal(color('#aabbcc'),'#aabbcc');
});
