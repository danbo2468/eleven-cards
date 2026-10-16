import {test} from 'node:test';import assert from 'node:assert/strict';
import {historySeries,delta,sparkline,historyUrl} from '../src/overview-utils.js';
const row=(t,state,unit='W')=>({last_changed:new Date(t).toISOString(),state:String(state),attributes:{unit_of_measurement:unit}});
test('history holds boundary, preserves unavailable gaps and current uses live state',()=>{
 const s=historySeries([row(0,2),row(2000,4),row(4000,'unavailable'),row(6000,0)],1000,8000,'W');
 assert.equal(s.baseline,2);assert.equal(delta(s,8),6);assert.equal(delta(s,null),null);assert.ok(s.points.some(p=>p.v===null));
 const d=sparkline(s.points,1000,8000);assert.equal((d.match(/M/g)||[]).length,2);assert.ok(!/NaN|Infinity/.test(d));
 assert.equal(delta(historySeries([row(2000,4)],1000,8000,'W'),8),null);
 assert.equal(delta(historySeries([row(0,4,'kW')],1000,8000,'W'),8),null);
 assert.equal(delta(historySeries([row(0,0)],1000,8000,'W'),0),0);
});
test('constant values get a centered line, gaps never bridge, empty history stays empty',()=>{
 assert.equal(sparkline([],0,10000),'');const d=sparkline([{t:0,v:0},{t:10000,v:0}],0,10000);assert.match(d,/24/);assert.ok(!/NaN/.test(d));
 const s=historySeries([row(0,'unknown'),row(3000,-2),row(5000,'unavailable')],1000,8000,'W');assert.equal(s.baseline,null);assert.equal((sparkline(s.points,1000,8000).match(/M/g)||[]).length,1);
});
test('held value extends to the exact start of an unavailable interval',()=>{
 const path=sparkline([{t:0,v:1},{t:5000,v:null},{t:7000,v:2},{t:10000,v:2}],0,10000);assert.match(path,/H150\.00M209\.20/);
});
test('history request is a batched full-unit request with explicit end and no minimal attribute loss',()=>{
 const url=historyUrl(['sensor.a','sensor.b'],1000,8000);assert.match(url,/filter_entity_id=sensor.a%2Csensor.b/);assert.match(url,/end_time=/);assert.doesNotMatch(url,/minimal_response|no_attributes/);
});
