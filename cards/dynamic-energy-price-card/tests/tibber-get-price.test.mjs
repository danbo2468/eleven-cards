import test from 'node:test';
import assert from 'node:assert/strict';
import * as utils from '../src/price-utils.js';

test('get_price range covers two local calendar days, including DST changes',()=>{
 for(const [now,start,end] of [
  ['2026-10-15T18:00:00Z','2026-10-14T22:00:00.000Z','2026-10-16T22:00:00.000Z'],
  ['2026-03-28T18:00:00Z','2026-03-27T23:00:00.000Z','2026-03-29T22:00:00.000Z'],
  ['2026-10-24T18:00:00Z','2026-10-23T22:00:00.000Z','2026-10-25T23:00:00.000Z'],
 ]) assert.deepEqual(utils.tibberPriceRange(new Date(now),'Europe/Amsterdam'),{start_time:start,end_time:end});
});
test('get_price normalizes startsAt/total, rejects malformed prices, and preserves negatives and zero',()=>{
 const start='2026-10-15T00:00:00Z';
 assert.deepEqual(utils.tibberPriceData({price_info:[
  {startsAt:start,total:-.01},{startsAt:start,total:0},{startsAt:start,total:null},
  {startsAt:start,total:'0.25'},{startsAt:'invalid',total:.25},null,
 ]}),[{start_time:start,price_per_kwh:-.01},{start_time:start,price_per_kwh:0}]);
 assert.throws(()=>utils.tibberPriceData({success:false,price_info:[]}),/unavailable/);
 assert.throws(()=>utils.tibberPriceData({data:[]}),/format/);
 assert.deepEqual(utils.tibberPriceData({success:true,price_info:[]}),[]);
});
