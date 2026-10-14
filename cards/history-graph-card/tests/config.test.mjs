import {test} from 'node:test';
import assert from 'node:assert/strict';
test('validates sensor configuration and builds documented bounded history URL', async () => {
 const u=await import('../src/history-utils.js');
 assert.equal(u.validateConfig({entities:['sensor.room']}).hours_to_show,24);
 for(const c of [{entities:[]},{entities:['light.a']},{entities:['sensor.a','sensor.a']},{entities:['sensor.a'],hours_to_show:0},{entities:['sensor.a'],hours_to_show:Infinity},{entities:['sensor.a'],title:42}]) assert.throws(()=>u.validateConfig(c));
 const c=u.validateConfig({entities:['sensor.a','sensor.b'],hours_to_show:1.5});
 const [path,query]=u.historyUrl(c,Date.parse('2026-10-13T12:00:00Z')).split('?');
 const q=new URLSearchParams(query);
 assert.equal(decodeURIComponent(path),'history/period/2026-10-13T10:30:00.000Z');
 assert.equal(q.get('filter_entity_id'),'sensor.a,sensor.b');
 assert.equal(q.get('end_time'),'2026-10-13T12:00:00.000Z');
 assert.ok(q.has('minimal_response')&&q.has('no_attributes'));
 assert.equal(q.get('significant_changes_only'),'0');
});
