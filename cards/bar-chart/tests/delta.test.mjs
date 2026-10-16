import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregateSeries} from '../../history-graph-card/src/history-utils.js';
const H=3600000;
const run=(points,start=0,end=2*H,period='hour',zone='UTC')=>aggregateSeries([{id:'sensor.a',points}],start,end,period,'delta',zone)[0].points;
test('delta is the held end value minus the held start value per interval, including exact boundaries',()=>{
 assert.deepEqual(run([{t:0,v:100},{t:H/2,v:104},{t:H,v:110},{t:1.5*H,v:113},{t:2*H,v:115}]),[{t:0,v:10},{t:H,v:5}]);
});
test('delta preserves negative changes, zero and held values without interpolation',()=>{
 assert.deepEqual(run([{t:-H,v:20},{t:H/4,v:15}]),[{t:0,v:-5},{t:H,v:0}]);
});
test('missing start, empty history and unavailable gaps never become zero or partial deltas',()=>{
 assert.deepEqual(run([]),[{t:0,v:null},{t:H,v:null}]);
 assert.deepEqual(run([{t:H/4,v:100},{t:H,v:110},{t:2*H,v:120}]),[{t:0,v:null},{t:H,v:10}]);
 assert.deepEqual(run([{t:0,v:100},{t:H/4,v:null},{t:H/2,v:105},{t:H,v:110},{t:2*H,v:120}]),[{t:0,v:null},{t:H,v:10}]);
 assert.deepEqual(run([{t:0,v:100},{t:H,v:null},{t:1.5*H,v:120}]),[{t:0,v:null},{t:H,v:null}]);
});
test('delta clips edge bins and supports quarter hours and independent sensors',()=>{
 assert.deepEqual(run([{t:0,v:10},{t:H/2,v:12},{t:H,v:16},{t:1.5*H,v:19}],H/4,1.5*H),[{t:H/4,v:6},{t:H,v:3}]);
 assert.deepEqual(run([{t:0,v:10},{t:H/4,v:13},{t:H/2,v:11}],0,H/2,'quarter_hour'),[{t:0,v:3},{t:H/4,v:-2}]);
 const data=aggregateSeries([{id:'a',points:[{t:0,v:10},{t:H,v:13}]},{id:'b',points:[{t:0,v:50},{t:H,v:40}]}],0,H,'hour','delta');
 assert.deepEqual(data.map(s=>s.points[0].v),[3,-10]);
});
test('calendar deltas use local DST day boundaries',()=>{
 const a=Date.parse('2026-03-28T23:00:00Z'),b=Date.parse('2026-03-29T22:00:00Z');
 assert.deepEqual(run([{t:a,v:100},{t:b,v:130}],a,b,'day','Europe/Amsterdam'),[{t:a,v:30}]);
});
