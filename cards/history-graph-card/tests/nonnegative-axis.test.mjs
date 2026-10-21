import {test} from 'node:test';
import assert from 'node:assert/strict';
import {yAxis,graphAxes} from '../src/history-utils.js';
const series=values=>[{points:values.map((v,t)=>({t,v}))}];
test('nonnegative readings never acquire a negative automatic lower bound',()=>{
 for(const values of [[0.01,10],[0.2],[0],[0,100],[null,0.001,2],[1e-12],[0.01,10,null]]){
  for(const config of [{},{y_step:1},{y_max:20}]){
   const axis=yAxis(series(values),config);
   assert.ok(axis.min>=0,JSON.stringify({values,config,axis}));
   assert.ok(axis.ticks.every(t=>t>=0));
  }
 }
});
test('negative readings and explicit lower bounds retain negative space',()=>{
 assert.ok(yAxis(series([-0.01,10])).min<0);
 assert.ok(yAxis([{points:[{v:10,base:-2}]}]).min<0);
 assert.equal(yAxis(series([0.01,10]),{y_min:-5}).min,-5);
 assert.equal(yAxis(series([0.01,10]),{y_min:-5,y_max:-1}).max,-1);
 assert.ok(yAxis(series([1,2]),{y_max:-1}).min< -1);
});
test('mixed-unit alignment cannot turn a nonnegative series into a negative axis',()=>{
 const data=[...series([0.01,10]),...series([-10,20]),...series([-100,20])];
 const meta={items:[{unit:'A'},{unit:'B'},{unit:'C'}]};
 for(const graph_mode of ['lines','stacked']){
  const result=graphAxes(data,meta,{graph_mode},0,2);
  assert.ok(result.axes[0].min>=0);
 }
});
