import {test} from 'node:test';
import assert from 'node:assert/strict';
import {graphAxes,alignZeroAxes,validateConfig,editorConfig,cardConfig} from '../src/history-utils.js';
const entities=['sensor.a','sensor.b','sensor.c'];
const series=[[-10,30],[-200,100],[5,10]].map((values,i)=>({id:entities[i],points:values.map((v,t)=>({t,v}))}));
const meta={items:entities.map((id,i)=>({id,unit:['°C','W','%'][i]}))};
const ratio=a=>-a.min/(a.max-a.min);
test('negative mixed-unit axes align zero by default without clipping data or changing positive axes',()=>{
 const baseline=graphAxes(series,meta,{align_zero:false},0,2);
 const result=graphAxes(series,meta,{},0,2);
 assert.ok(Math.abs(ratio(result.axes[0])-ratio(result.axes[1]))<1e-12);
 result.axes.forEach((a,i)=>{assert.ok(a.min<=baseline.axes[i].min);assert.ok(a.max>=baseline.axes[i].max);assert.ok(a.ticks.every(t=>t>=a.min&&t<=a.max));});
 assert.deepEqual(result.axes[2],baseline.axes[2]);
 assert.equal(result.plotSeries,series);
});
test('option defaults on, validates booleans and roundtrips native editor values',()=>{
 assert.equal(validateConfig({entities}).align_zero,true);
 assert.equal(editorConfig({entities}).align_zero,true);
 for(const align_zero of [true,false])assert.equal(cardConfig(editorConfig({entities,align_zero})).align_zero,align_zero);
 assert.throws(()=>validateConfig({entities,align_zero:'false'}),/align_zero/);
});
test('opt-out and single negative axis retain exactly the legacy scales',()=>{
 const single=graphAxes(series,meta,{},0,2,[true,false,true]);
 assert.deepEqual(single,graphAxes(series,meta,{align_zero:false},0,2,[true,false,true]));
 const same={items:meta.items.map(m=>({...m,unit:'W'}))};
 assert.deepEqual(graphAxes(series,same,{},0,2),graphAxes(series,same,{align_zero:false},0,2));
});
test('manual bounds and step anchor the first unit and align other negative scales',()=>{
 const result=graphAxes(series,meta,{y_min:-10,y_max:40,y_step:5},0,2);
 assert.deepEqual([result.axes[0].min,result.axes[0].max,result.axes[0].step],[-10,40,5]);
 assert.ok(Math.abs(ratio(result.axes[0])-ratio(result.axes[1]))<1e-12);
});
test('negative-only axes include zero; mixed signs, tiny ranges and signed stacking remain finite',()=>{
 for(const ranges of [[[-30,-10],[-1000,-200]],[[-30,-10],[-200,100]],[[-1e-12,3e-12],[-2e-9,1e-9]]]){
  const input=ranges.map((v,i)=>({id:entities[i],points:v.map((v,t)=>({t,v}))}));
  for(const graph_mode of ['lines','stacked']){
   const result=graphAxes(input,{items:meta.items.slice(0,2)},{graph_mode},0,2);
   assert.ok(Math.abs(ratio(result.axes[0])-ratio(result.axes[1]))<1e-12);
   result.axes.forEach(a=>{assert.ok(a.max>=0);assert.ok(a.ticks.includes(0));assert.ok(Number.isFinite(a.min)&&Number.isFinite(a.max));});
  }
 }
});
test('incompatible explicit negative bounds win rather than clipping another unit',()=>{
 const result=graphAxes(series,meta,{y_min:-100,y_max:-10},0,2);
 assert.deepEqual(result,graphAxes(series,meta,{align_zero:false,y_min:-100,y_max:-10},0,2));
});
