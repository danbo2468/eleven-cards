import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../src/history-utils.js';
const entities=['sensor.temp','sensor.power','sensor.temp2'];
const hass={states:Object.fromEntries(entities.map((id,i)=>[id,{attributes:{unit_of_measurement:i===1?'W':'°C'}}]))};
const series=entities.map((id,i)=>({id,points:[{t:0,v:i===1?2000:20},{t:50,v:i===1?4000:25}]}));
test('mixed sensor units each get a shared independent axis, preserving input order',()=>{
 const meta=u.seriesMetadata(hass,entities);
 assert.deepEqual(meta.items.map(s=>s.unit),['°C','W','°C']);
 const result=u.graphAxes(series,meta,{graph_mode:'lines',y_min:10,y_max:30,y_step:5},0,100);
 assert.deepEqual(result.seriesAxes,[0,1,0]);
 assert.deepEqual(result.axes.map(a=>a.unit),['°C','W']);
 assert.deepEqual([result.axes[0].min,result.axes[0].max],[10,30]);
 assert.ok(result.axes[1].max>=4000&&result.axes[1].min<=2000);
 assert.equal(result.plotSeries,series);
});
test('stacked mode stacks only sensors with identical units and preserves gaps per unit',()=>{
 const input=structuredClone(series);input[1].points[1].v=null;
 const result=u.graphAxes(input,u.seriesMetadata(hass,entities),{graph_mode:'stacked'},0,100);
 assert.deepEqual(result.plotSeries.map(s=>s.points[0].v),[20,2000,40]);
 assert.deepEqual(result.plotSeries.map(s=>s.points[1].v),[25,null,50]);
 assert.deepEqual(input.map(s=>s.points[0].v),[20,2000,20]);
});
