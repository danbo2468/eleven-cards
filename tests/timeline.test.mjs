import {test} from 'node:test';
import assert from 'node:assert/strict';
import {segments} from '../cards/timeline-card/src/timeline-utils.js';
test('timeline preserves held states, unavailable intervals and exact window boundaries',()=>{
 const rows=[{state:'on',last_changed:new Date(0).toISOString()},{state:'off',last_changed:new Date(50).toISOString()},{state:'off',last_changed:new Date(60).toISOString()},{state:'unavailable',last_changed:new Date(80).toISOString()}];
 assert.deepEqual(segments(rows,20,100),[{start:20,end:50,state:'on'},{start:50,end:80,state:'off'},{start:80,end:100,state:'unavailable'}]);
 assert.deepEqual(segments([],20,100),[{start:20,end:100,state:'unknown'}]);
});
