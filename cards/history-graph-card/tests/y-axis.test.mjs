import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,yRange} from '../src/history-utils.js';
const series=[{points:[{v:10},{v:20}]}];
test('manual y bounds are exact, independent and resettable',()=>{
 assert.deepEqual(yRange(series,{y_min:0,y_max:30}),[0,30]);
 assert.deepEqual(yRange(series,{y_min:0}),[0,20.8]);
 assert.deepEqual(yRange(series,{y_max:30}),[9.2,30]);
 assert.deepEqual(yRange(series,{y_min:null,y_max:''}),yRange(series));
 const lower=yRange(series,{y_min:50});assert.equal(lower[0],50);assert.ok(lower[1]>50);
 const upper=yRange(series,{y_max:-10});assert.equal(upper[1],-10);assert.ok(upper[0]<-10);
 assert.deepEqual(yRange([],{y_min:-5,y_max:5}),[-5,5]);
 const base={entities:['sensor.a']};
 for(const key of ['y_min','y_max'])for(const value of ['2',NaN,Infinity])assert.throws(()=>validateConfig({...base,[key]:value}),/y_/);
 for(const bounds of [{y_min:2,y_max:2},{y_min:3,y_max:2}])assert.throws(()=>validateConfig({...base,...bounds}),/y_/);
 assert.equal(validateConfig({...base,y_min:0,y_max:30}).y_min,0);
});
