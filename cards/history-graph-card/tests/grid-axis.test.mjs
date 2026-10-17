import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alignGridAxes,graphAxes,yAxis,alignZeroAxes} from '../src/history-utils.js';

const positions=axis=>axis.ticks.map(t=>(t-axis.min)/(axis.max-axis.min));
function aligned(axes){
 const expected=positions(axes[0]);
 for(const axis of axes){
  assert.equal(axis.ticks.length,expected.length);
  positions(axis).forEach((p,i)=>assert.ok(Math.abs(p-expected[i])<1e-12));
  for(let i=1;i<axis.ticks.length;i++)assert.ok(Math.abs((axis.ticks[i]-axis.ticks[i-1])/axis.step-1)<1e-10);
 }
}
const axis=(min,max,unit)=>({unit,...yAxis([{points:[{v:min},{v:max}]}])});

test('mixed-unit ticks share every grid height, use independent round steps and cover original ranges',()=>{
 const original=[axis(19,26,'°C'),axis(100,2600,'W'),axis(.01,.03,'m³')];
 const result=alignGridAxes(original);
 assert.equal(result[0],original[0]);
 aligned(result);
 result.forEach((a,i)=>{assert.ok(a.min<=original[i].min);assert.ok(a.max>=original[i].max);});
 assert.notEqual(result[0].step,result[1].step);
});

test('exact primary bounds and manual steps anchor all secondary ticks, including fractional edges',()=>{
 for(const config of [{y_min:11,y_max:23,y_step:5},{y_min:-1.1,y_max:1.1,y_step:.5},{y_min:0,y_max:199,y_step:1},{y_min:25,y_max:30,y_step:10}]){
  const original=[{unit:'°C',...yAxis([],config)},axis(-200,300,'W')];
  const result=alignGridAxes(original,config);
  assert.deepEqual(result[0],original[0]);aligned(result);
  assert.ok(result[1].min<=original[1].min&&result[1].max>=original[1].max);
 }
});

test('signed axes keep zero alignment along with the other grid ticks',()=>{
 for(const original of [[axis(-10,30,'°C'),axis(-200,100,'W')],[axis(10,30,'°C'),axis(-100,100,'W'),axis(-4,10,'m³')],[axis(-30,-10,'°C'),axis(-1000,-200,'W')]]){
  const result=alignGridAxes(alignZeroAxes(original));aligned(result);
  const negative=result.filter(a=>a.min<0);
  const zero=a=>-a.min/(a.max-a.min);
  negative.forEach(a=>assert.ok(Math.abs(zero(a)-zero(negative[0]))<1e-12));
 }
});

test('empty, constant, tiny and hidden series keep aligned finite scales',()=>{
 const meta={items:[{unit:'°C'},{unit:'W'},{unit:'m³'}]};
 for(const values of [[0,0,0],[1e-12,-2e-9,.03],[null,null,null]]){
  const series=values.map(v=>({points:[{t:0,v}]}));
  for(const visible of [[true,true,true],[false,true,true],[true,false,false],[false,false,false]]){
   const result=graphAxes(series,meta,{},0,1,visible);aligned(result.axes);
   result.axes.forEach(a=>assert.ok(Number.isFinite(a.min)&&Number.isFinite(a.max)));
  }
 }
});

test('single axes and deliberately tickless primary ranges preserve manual configuration',()=>{
 const single=[axis(10,20,'°C')];assert.equal(alignGridAxes(single),single);
 const primary={unit:'°C',...yAxis([],{y_min:.1,y_max:.2,y_step:1})};
 const result=alignGridAxes([primary,axis(10,20,'W')]);
 assert.equal(result[0],primary);assert.deepEqual(result[1].ticks,[]);
});
