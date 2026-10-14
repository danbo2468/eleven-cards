import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../src/history-utils.js';
const iso=t=>new Date(t).toISOString();
test('decodes minimal response by entity ID; unavailable stays a gap and unchanged states hold',()=>{
 const response=[[{entity_id:'sensor.b',state:'-2',last_changed:iso(1000)},{state:'unavailable',last_changed:iso(3000)},{state:'4',last_changed:iso(5000)}],[{entity_id:'sensor.a',state:'0',last_updated:iso(2000)}]];
 const series=u.decodeHistory(response,['sensor.a','sensor.b'],1000,6000);
 assert.deepEqual(series[0].points,[{t:2000,v:0}]);
 assert.equal(u.valueAt(series[0].points,1000),null);
 assert.equal(u.valueAt(series[1].points,4000),null);
 assert.equal(u.valueAt(series[1].points,6000),4);
 assert.equal(u.stepPath(series[1].points,6000,t=>t,v=>v),'M 1000 -2 H 3000 M 5000 4 H 6000');
 assert.throws(()=>u.decodeHistory({},['sensor.a'],0,6000));
 assert.deepEqual(u.decodeHistory([],['sensor.a'],0,6000)[0].points,[]);
 assert.equal(u.numericState(''),null); assert.equal(u.numericState('Infinity'),null); assert.equal(u.numericState('unknown'),null); assert.equal(u.numericState('1.23'),1.23);
});
