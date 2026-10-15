import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../src/history-utils.js';
test('accepts mixed units and historical unavailable metadata, pads shared constant scale',()=>{
 const hass={states:{'sensor.a':{state:'unavailable',attributes:{unit_of_measurement:'°C',friendly_name:'Room'}},'sensor.b':{state:'21',attributes:{unit_of_measurement:'°C'}}}};
 assert.equal(u.seriesMetadata(hass,['sensor.a','sensor.b']).unit,'°C');
 hass.states['sensor.b'].attributes.unit_of_measurement='W'; assert.deepEqual(u.seriesMetadata(hass,['sensor.a','sensor.b']).items.map(s=>s.unit),['°C','W']);
 assert.throws(()=>u.seriesMetadata(hass,['sensor.missing']),/missing/);
 assert.deepEqual(u.yRange([{points:[{v:0},{v:null}]}]),[-1,1]);
 const [min,max]=u.yRange([{points:[{v:-5}]},{points:[{v:100}]}]);assert.ok(min<-5&&max>100);
});
test('localizes implicit title, preserves explicit text and formats numbers/time',async()=>{
 const l=await import('../src/localization.js');
 assert.equal(l.language({locale:{language:'nl-NL'},language:'en'}),'nl');
 assert.equal(l.text('title','nl'),'Historie'); assert.equal(l.text('title','en'),'History');
 assert.equal(l.number(12.5,'nl'),'12,5'); assert.equal(l.number(12.5,'en'),'12.5');
 assert.match(l.time(Date.parse('2026-10-13T12:00:00Z'),'nl','Europe/Amsterdam'),/14:00/);
 assert.equal(l.escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
});
