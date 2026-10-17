import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}};
globalThis.customElements={get:()=>undefined,define(){}};globalThis.window={};globalThis.document={querySelector:()=>null};
const {deltaBarTotals}=await import('../src/bar-chart.js');
const {aggregateSeries,periodBounds}=await import('../../history-graph-card/src/history-utils.js');
const H=3600000,items=[{id:'sensor.a',name:'Heating',unit:'kWh'}];
test('raw Delta total includes only complete known counter intervals and retains negative changes',()=>{
 const raw=[{id:'sensor.a',points:[{t:0,v:100},{t:H,v:102},{t:1.5*H,v:null},{t:2*H,v:105},{t:3*H,v:109},{t:4*H,v:108}]}];
 const series=aggregateSeries(raw,0,4*H,'hour','delta','UTC',{preserveGaps:false});
 const [total]=deltaBarTotals(series,items,{start:0,end:4*H,period:'hour'});
 assert.equal(total.value,5);assert.equal(total.count,3);assert.equal(total.missing,true);assert.equal(total.clipped,false);
});
for(const day of ['2026-03-28T23:00:00Z','2026-10-24T22:00:00Z'])test(`statistics totals cover complete local days across DST: ${day}`,()=>{
 const start=Date.parse(day),zone='Europe/Amsterdam',points=[];let cursor=start;
 for(let i=0;i<3;i++){points.push({t:cursor,v:i+1});cursor=periodBounds(cursor,'day',zone)[1];}
 points.push({t:cursor,v:null});
 const [total]=deltaBarTotals([{id:'sensor.a',source:'statistics',points}],items,{start,end:cursor,period:'day',zone});
 assert.equal(total.value,6);assert.equal(total.count,3);assert.equal(total.missing,false);assert.equal(total.clipped,false);
});
test('partial statistics months retain whole Recorder changes and flag clipped boundaries',()=>{
 const start=Date.parse('2024-02-15T12:00:00Z'),end=Date.parse('2024-04-10T12:00:00Z'),points=[{t:start,v:20},{t:Date.parse('2024-03-01T00:00:00Z'),v:30},{t:Date.parse('2024-04-01T00:00:00Z'),v:10},{t:end,v:null}];
 const [total]=deltaBarTotals([{id:'sensor.a',source:'statistics',points}],items,{start,end,period:'month'});
 assert.equal(total.value,60);assert.equal(total.clipped,true);assert.equal(total.missing,false);
});
test('zero is known consumption, a wholly missing source has no numeric total, and mixed units remain separate',()=>{
 const series=[{points:[{t:0,v:0},{t:H,v:null}]},{points:[]}],meta=[...items,{id:'sensor.b',name:'Water',unit:'L'}];
 const totals=deltaBarTotals(series,meta,{start:0,end:H,period:'hour'});
 assert.equal(totals[0].value,0);assert.equal(totals[0].missing,false);
 assert.equal(totals[1].value,null);assert.equal(totals[1].missing,true);assert.equal(totals[1].unit,'L');
});
test('an explicit gap within a statistics bin marks the full bar total as incomplete',()=>{
 const [total]=deltaBarTotals([{source:'statistics',points:[{t:0,v:5},{t:H/2,v:null}]}],items,{start:0,end:H,period:'hour'});
 assert.equal(total.value,5);assert.equal(total.missing,true);
});
