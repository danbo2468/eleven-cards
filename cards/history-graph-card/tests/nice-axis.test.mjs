import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as utils from '../src/history-utils.js';
const series=(...values)=>[{points:values.map(v=>({v}))}];
test('automatic Y-axis expands padded data to round 1/2/5 ticks',()=>{
 assert.equal(typeof utils.yAxis,'function');
 assert.deepEqual(utils.yAxis(series(11,23)),{min:10,max:25,step:5,ticks:[10,15,20,25]});
 assert.deepEqual(utils.yAxis(series(-23,-11)),{min:-25,max:-10,step:5,ticks:[-25,-20,-15,-10]});
 assert.deepEqual(utils.yAxis(series(0.0011,0.0023)),{min:0.001,max:0.0025,step:0.0005,ticks:[0.001,0.0015,0.002,0.0025]});
});
test('fixed bounds stay exact while ticks use actual step multiples',()=>{
 assert.deepEqual(utils.yAxis(series(11,23),{y_min:11,y_max:23}),{min:11,max:23,step:5,ticks:[15,20]});
 assert.deepEqual(utils.yAxis(series(11,23),{y_min:11}),{min:11,max:25,step:5,ticks:[15,20,25]});
 assert.deepEqual(utils.yAxis(series(11,23),{y_max:23}),{min:10,max:23,step:5,ticks:[10,15,20]});
 assert.deepEqual(utils.yAxis(series(-2,2),{y_min:-1.1,y_max:1.1,y_step:0.5}),{min:-1.1,max:1.1,step:0.5,ticks:[-1,-0.5,0,0.5,1]});
 assert.deepEqual(utils.yAxis(series(11,23),{y_step:2}),{min:10,max:24,step:2,ticks:[10,12,14,16,18,20,22,24]});
 assert.deepEqual(utils.yAxis([],{y_min:0.3,y_max:0.6,y_step:0.1}).ticks,[0.3,0.4,0.5,0.6]);
});
test('manual step is optional, resettable, positive and bounded without substitution',()=>{
 const base={entities:['sensor.a']};
 for(const value of [undefined,null,''])assert.equal(utils.validateConfig({...base,y_step:value}).y_step,undefined);
 for(const value of [0,-1,'2',NaN,Infinity,false])assert.throws(()=>utils.validateConfig({...base,y_step:value}),/^Error: y_step$/);
 assert.equal(utils.validateConfig({...base,y_step:0.001}).y_step,0.001);
 assert.throws(()=>utils.validateConfig({...base,y_min:0,y_max:1000,y_step:1}),/y_step_count/);
 assert.equal(utils.yAxis([],{y_min:0,y_max:199,y_step:1}).ticks.length,200);
 assert.throws(()=>utils.yAxis(series(0,1000),{y_step:1}),/y_step_count/);
 assert.throws(()=>utils.yAxis(series(0,1000),{y_step:Number.MIN_VALUE}),/y_step_count/);
 for(const value of [0,-1,Infinity])assert.throws(()=>utils.yAxis(series(0,1),{y_step:value}),/y_step/);
});
test('axis resets blanks directly and rejects a numerically overflowing range',()=>{
 assert.deepEqual(utils.yAxis(series(11,23),{y_step:''}),utils.yAxis(series(11,23)));
 assert.throws(()=>utils.yAxis(series(-1,1),{y_step:1e308}),/y_step_count/);
});
test('finite endpoints with overflowing span are rejected before rendering',()=>{
 assert.throws(()=>utils.yAxis([],{y_min:-1e308,y_max:1e308,y_step:1e308}),/y_step_count/);
});
test('nice axes cover empty, constant, signed and stacked-base ranges at different magnitudes',()=>{
 assert.deepEqual(utils.yAxis([]),{min:0,max:1,step:0.5,ticks:[0,0.5,1]});
 for(const values of [[0],[10],[-10],[-0.004,0.003],[1e-10,2e-10],[1000,8000]]){
  const data=series(...values),axis=utils.yAxis(data),[low,high]=utils.yRange(data);
  assert.ok(axis.min<=low&&axis.max>=high,JSON.stringify(values));
  const normalized=axis.step/10**Math.floor(Math.log10(axis.step));
  assert.ok([1,2,5].some(n=>Math.abs(normalized-n)<1e-8));
  assert.ok(axis.ticks.length>=2&&axis.ticks.length<=7);
  for(let i=1;i<axis.ticks.length;i++)assert.ok(Math.abs((axis.ticks[i]-axis.ticks[i-1])/axis.step-1)<1e-8);
 }
 const stacked=[{points:[{v:8,base:-3},{v:null,base:null}]}],axis=utils.yAxis(stacked);
 assert.ok(axis.min<=-3&&axis.max>=8);
 for(const config of [{y_min:50},{y_max:-50}]){
  const axis=utils.yAxis(series(10,20),config);
  if(config.y_min!==undefined)assert.equal(axis.min,config.y_min);else assert.equal(axis.max,config.y_max);
  assert.ok(axis.max>axis.min);
 }
 assert.deepEqual(utils.yAxis([],{y_min:0.1,y_max:0.2,y_step:1}).ticks,[]);
 assert.throws(()=>utils.yAxis([],{y_min:1,y_max:1.00000000000001,y_step:1e-16}),/y_step_count/);
});
