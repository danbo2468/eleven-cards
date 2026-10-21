import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig, clockGrid, buildHeatmap, colorScale, loadHeatmapData, summarizeHeatmap} from '../src/heatmap-utils.js';

const epoch=Date.parse('2026-10-01T00:00:00Z'),hour=3600000;
const history=intervals=>({source:'history',unit:'W',intervals});
const statistics=intervals=>({source:'statistics',unit:'kWh',intervals});

test('information summarizes displayed cells; empty/outside cells are excluded and consumption adds a total',()=>{
  const rows=buildHeatmap(statistics([{start:epoch,end:epoch+hour,value:0},{start:epoch+hour,end:epoch+2*hour,value:4},{start:epoch+3*hour,end:epoch+4*hour,value:-1}]),epoch,epoch+4*hour,'UTC','consumption');
  const result=summarizeHeatmap(rows,'consumption');
  assert.equal(result.minimum,-1);assert.equal(result.maximum,4);assert.equal(result.average,1);assert.equal(result.total,3);assert.equal(result.count,3);assert.equal(result.missing,true);
  assert.ok(!('total' in summarizeHeatmap(rows,'average')));
  assert.deepEqual(summarizeHeatmap([],'consumption'),{minimum:null,maximum:null,average:null,count:0,missing:false,total:null});
});

test('configuration accepts optional bounds and rejects invalid entity, mode, colors and limits',()=>{
  assert.equal(normalizeConfig({entity:'sensor.a'}).hours_to_show,672);
  assert.equal(normalizeConfig({entity:'sensor.a',scale_min:0}).scale_min,0);
  assert.ok(!('scale_min' in normalizeConfig({entity:'sensor.a',scale_min:''})));
  for(const config of [{entity:'switch.a'},{entity:'sensor.a',mode:'sum'},{entity:'sensor.a',hours_to_show:0},{entity:'sensor.a',hours_to_show:Infinity},{entity:'sensor.a',scale_min:2,scale_max:1},{entity:'sensor.a',low_color:'red;display:none'}])assert.throws(()=>normalizeConfig(config));
});

test('native RGB colors round-trip without mutation and legacy hex colors keep identical scales',()=>{
  const low=Object.freeze([0,16,255]),high=Object.freeze([255,128,0]);
  const rgb=normalizeConfig({entity:'sensor.a',low_color:low,high_color:high,scale_min:0,scale_max:10});
  const hex=normalizeConfig({entity:'sensor.a',low_color:'#0010ff',high_color:'#ff8000',scale_min:0,scale_max:10});
  assert.deepEqual(rgb,hex);assert.notEqual(rgb.low_color,low);
  assert.deepEqual(normalizeConfig(rgb),rgb);
  for(const value of [-1,0,5,10,11])assert.equal(colorScale([],rgb).color(value),colorScale([],hex).color(value));
  for(const low_color of [[1,2],[1,2,3,4],[0,-1,3],[0,256,3],[0,2.5,3],[0,'2',3],new Array(3),{},'rgb(1,2,3)'])assert.throws(()=>normalizeConfig({entity:'sensor.a',low_color}));
});

test('drafts preserve incomplete input while runtime validates dimensions and color stops',()=>{
  const draft=normalizeConfig({entity:'sensor.a',hours_to_show:'',scale_min:20,scale_max:10,cell_width:3,color_mode:'gradient',gradient_stops:[{value:'',color:[0,0,0]}]},{draft:true});
  assert.equal(draft.hours_to_show,'');assert.equal(draft.scale_min,20);assert.equal(draft.gradient_stops[0].value,'');assert.throws(()=>normalizeConfig(draft));
  for(const input of [{cell_width:5},{cell_height:15},{cell_height:65},{cell_gap:-1},{border_radius:17},{max_height:99},{max_height:2001},{cell_width:8.2},{color_mode:'other'},{gradient_mode:'other'},
    {color_mode:'gradient',gradient_stops:[]},{gradient_stops:[{value:1,color:[0,0,0]},{value:1,color:[1,1,1]}]},
    {gradient_stops:[{value:1,color:[0,0,0]},{value:2,color:'red'}]}])assert.throws(()=>normalizeConfig({entity:'sensor.a',...input}));
});

test('absolute color stops sort immutably, interpolate or step like the other charts, and drive the legend',()=>{
  const original=Object.freeze([Object.freeze({value:30,color:Object.freeze([255,0,0])}),Object.freeze({value:10,color:'#0000ff'}),Object.freeze({value:20,color:Object.freeze([0,255,0])})]);
  const c=normalizeConfig({entity:'sensor.a',gradient_stops:original});assert.equal(c.color_mode,'gradient');
  assert.deepEqual(c.gradient_stops.map(s=>s.value),[10,20,30]);assert.equal(original[0].value,30);
  const smooth=colorScale([],c),steps=colorScale([],normalizeConfig({...c,gradient_mode:'steps'}));
  assert.deepEqual([smooth.min,smooth.max],[10,30]);assert.equal(smooth.color(-1),'rgb(0,0,255)');assert.equal(smooth.color(15),'rgb(0,128,128)');assert.equal(smooth.color(25),'rgb(128,128,0)');assert.equal(smooth.color(100),'rgb(255,0,0)');
  assert.equal(steps.color(19.99),'rgb(0,0,255)');assert.equal(steps.color(20),'rgb(0,255,0)');assert.equal(steps.color(29.99),'rgb(0,255,0)');assert.equal(steps.color(30),'rgb(255,0,0)');
  assert.match(smooth.gradient,/rgb\(0,255,0\) 50%/);assert.match(steps.gradient,/rgb\(0,0,255\) 50%,rgb\(0,255,0\) 50%/);
  const scale=colorScale([],normalizeConfig({...c,color_mode:'scale',scale_min:0,scale_max:100}));assert.deepEqual([scale.min,scale.max],[0,100]);
});

test('statistics use the returned display unit, including converted counters and temperatures',async()=>{
  for(const [mode,stored,display,value] of [['consumption','Wh','kWh',0.4],['average','°C','°F',68],['average',null,null,0]]){
    const requests=[],hass={states:{'sensor.a':{attributes:{unit_of_measurement:display}}},callApi:async()=>{throw Error('Unexpected history fallback');},callWS:async request=>{
      requests.push(request);
      return request.type.endsWith('metadata')?[{statistic_id:'sensor.a',has_sum:true,mean_type:1,statistics_unit_of_measurement:stored,display_unit_of_measurement:display}]:{'sensor.a':[{start:epoch,end:epoch+hour,[mode==='consumption'?'change':'mean']:value}]};
    }};
    const result=await loadHeatmapData(hass,{entity:'sensor.a',mode},epoch,epoch+hour);
    assert.equal(result.source,'statistics');assert.equal(result.unit,display??'');assert.equal(result.intervals[0].value,value);assert.equal(requests.length,2);
    const incompatible={...hass,callWS:async()=>[{statistic_id:'sensor.a',has_sum:true,display_unit_of_measurement:'wrong',statistics_unit_of_measurement:display}]};
    if(mode==='consumption')await assert.rejects(loadHeatmapData(incompatible,{entity:'sensor.a',mode},epoch,epoch+hour),/consumption_statistics_required/);
  }
});

test('non-arithmetic statistics fall back to history even when legacy metadata says has_mean',async()=>{
  let statistics=0;
  const hass={states:{'sensor.a':{attributes:{unit_of_measurement:'°'}}},callWS:async request=>{
    if(!request.type.endsWith('metadata'))statistics++;
    return [{statistic_id:'sensor.a',has_mean:true,mean_type:2,display_unit_of_measurement:'°'}];
  },callApi:async()=>[[{entity_id:'sensor.a',last_updated:new Date(epoch).toISOString(),state:'10',attributes:{unit_of_measurement:'°'}}]]};
  const result=await loadHeatmapData(hass,{entity:'sensor.a',mode:'average'},epoch,epoch+hour);
  assert.equal(result.source,'history');assert.equal(statistics,0);assert.equal(result.intervals[0].value,10);
});

test('an empty Recorder object means no counter data, while malformed responses remain load errors',async()=>{
  const hass={states:{'sensor.a':{attributes:{unit_of_measurement:'kWh'}}},callWS:async request=>request.type.endsWith('metadata')?[{statistic_id:'sensor.a',has_sum:true,unit_of_measurement:'kWh'}]:{},callApi:async()=>{throw Error('Counters must not fall back to history');}};
  const result=await loadHeatmapData(hass,{entity:'sensor.a',mode:'consumption'},epoch,epoch+hour);
  assert.equal(result.source,'statistics');assert.deepEqual(result.intervals,[]);
  for(const response of [null,[],{'sensor.a':{}},{'sensor.other':[]}]){
    const malformed={...hass,callWS:async request=>request.type.endsWith('metadata')?hass.callWS(request):response};
    await assert.rejects(loadHeatmapData(malformed,{entity:'sensor.a',mode:'consumption'},epoch,epoch+hour),/statistics_load_failed/);
  }
});

test('a rolling request includes its clipped first statistics hour instead of introducing an artificial gap',async()=>{
  const start=epoch+hour/4,end=epoch+7*hour/4,requests=[];
  const hass={states:{'sensor.a':{attributes:{unit_of_measurement:'kWh'}}},callWS:async request=>{
    requests.push(request);
    if(request.type.endsWith('metadata'))return [{statistic_id:'sensor.a',has_sum:true,statistics_unit_of_measurement:'kWh'}];
    const values=[{start:epoch,end:epoch+hour,change:2},{start:epoch+hour,end:epoch+2*hour,change:3}];
    return {'sensor.a':values.filter(row=>row.start>=Date.parse(request.start_time) && row.start<Date.parse(request.end_time))};
  }};
  const data=await loadHeatmapData(hass,{entity:'sensor.a',mode:'consumption'},start,end);
  assert.equal(Date.parse(requests[1].start_time),epoch);assert.equal(Date.parse(requests[1].end_time),end);
  const cells=buildHeatmap(data,start,end,'UTC','consumption')[0].cells;
  assert.equal(cells[0].value,2);assert.equal(cells[1].value,3);assert.equal(cells[0].partial,true);assert.equal(cells[1].partial,true);
  assert.equal(summarizeHeatmap([{cells}],'consumption').total,5);
});

test('Recorder averages are duration weighted; missing states are excluded; zero and negatives are real data',()=>{
  const rows=buildHeatmap(history([
    {start:epoch,end:epoch+hour/4,value:10},
    {start:epoch+hour/4,end:epoch+hour,value:30},
    {start:epoch+hour,end:epoch+1.5*hour,value:null},
    {start:epoch+1.5*hour,end:epoch+2*hour,value:0},
    {start:epoch+2*hour,end:epoch+3*hour,value:-2},
  ]),epoch,epoch+4*hour,'UTC','average');
  assert.equal(rows[0].cells[0].value,25);
  assert.equal(rows[0].cells[1].value,0);assert.equal(rows[0].cells[1].partial,true);
  assert.equal(rows[0].cells[2].value,-2);
  assert.equal(rows[0].cells[3].value,null);
  assert.equal(rows[0].cells[4].intervals.length,0);
});

test('spring DST skips one local hour; autumn combines repeated hours with weighted mean or sum',()=>{
  const start=Date.parse('2026-03-28T23:00:00Z'),end=Date.parse('2026-03-29T22:00:00Z');
  const spring=clockGrid(start,end,'Europe/Amsterdam');
  assert.equal(spring.length,1);assert.equal(spring[0].cells[2].intervals.length,0);
  assert.equal(spring[0].cells.flatMap(c=>c.intervals).reduce((sum,r)=>sum+r.end-r.start,0),23*hour);
  const a=Date.parse('2026-10-24T22:00:00Z'),b=Date.parse('2026-10-25T23:00:00Z');
  const intervals=[{start:a+2*hour,end:a+3*hour,value:2},{start:a+3*hour,end:a+4*hour,value:4}];
  const avg=buildHeatmap(statistics(intervals),a,b,'Europe/Amsterdam','average')[0].cells[2];
  const sum=buildHeatmap(statistics(intervals),a,b,'Europe/Amsterdam','consumption')[0].cells[2];
  assert.equal(avg.intervals.length,2);assert.equal(avg.value,3);assert.equal(sum.value,6);assert.equal(sum.records.length,2);
  const raw=buildHeatmap(history(intervals),a,b,'Europe/Amsterdam','average')[0].cells[2];assert.equal(raw.value,3);
});

test('half-hour DST and fractional-offset zones preserve every elapsed millisecond once',()=>{
  for(const [start,end,zone] of [
    ['2026-10-03T13:30:00Z','2026-10-04T13:00:00Z','Australia/Lord_Howe'],
    ['2026-04-04T13:00:00Z','2026-04-05T13:30:00Z','Australia/Lord_Howe'],
    ['2026-10-01T18:15:00Z','2026-10-02T18:15:00Z','Asia/Kathmandu'],
  ]){
    const a=Date.parse(start),b=Date.parse(end),spans=clockGrid(a,b,zone).flatMap(r=>r.cells.flatMap(c=>c.intervals)).sort((a,b)=>a.start-b.start);
    assert.equal(spans.reduce((sum,r)=>sum+r.end-r.start,0),b-a);
    assert.equal(spans[0].start,a);assert.equal(spans.at(-1).end,b);
    for(let i=1;i<spans.length;i++)assert.equal(spans[i].start,spans[i-1].end);
  }
});

test('statistics consumption uses change directly, preserves gaps and does not prorate clipped bins',()=>{
  const intervals=[{start:epoch,end:epoch+hour,value:3},{start:epoch+hour,end:epoch+2*hour,value:null},{start:epoch+2*hour,end:epoch+3*hour,value:0},{start:epoch+3*hour,end:epoch+4*hour,value:-1}];
  const cells=buildHeatmap(statistics(intervals),epoch+hour/2,epoch+4*hour,'UTC','consumption')[0].cells;
  assert.equal(cells[0].value,3);assert.equal(cells[0].partial,true);
  assert.equal(cells[1].value,null);assert.equal(cells[2].value,0);assert.equal(cells[3].value,-1);
});

test('non-integral timezone statistics retain actual source intervals and attribute by start hour',()=>{
  const start=Date.parse('2026-10-01T00:00:00Z');
  const cells=buildHeatmap(statistics([{start,end:start+hour,value:4}]),start,start+hour,'Asia/Kolkata','consumption')[0].cells;
  assert.equal(cells[5].value,4);assert.equal(cells[6].value,null);assert.equal(cells[5].records[0].start,start);
});

test('fixed scales remain comparable and clamp outside values; constant and empty ranges are finite',()=>{
  const c=normalizeConfig({entity:'sensor.a',scale_min:0,scale_max:100});
  const scale=colorScale([{cells:[{value:-5},{value:200}]}],c);
  assert.deepEqual([scale.min,scale.max],[0,100]);assert.equal(scale.color(-5),scale.color(0));assert.equal(scale.color(200),scale.color(100));
  for(const rows of [[],[{cells:[{value:2}]}]])assert.doesNotMatch(colorScale(rows,normalizeConfig({entity:'sensor.a'})).color(2),/NaN/);
});

test('a single fixed bound clamps out-of-range cells to the endpoint color even for a collapsed range',()=>{
  const lower=normalizeConfig({entity:'sensor.a',scale_min:10,low_color:[0,0,0],high_color:[255,255,255]});
  const upper=normalizeConfig({entity:'sensor.a',scale_max:10,low_color:[0,0,0],high_color:[255,255,255]});
  const below=colorScale([{cells:[{value:1},{value:2}]}],lower),above=colorScale([{cells:[{value:20},{value:30}]}],upper);
  assert.equal(below.color(1),'rgb(0,0,0)');assert.equal(above.color(20),'rgb(255,255,255)');
  assert.equal(colorScale([{cells:[{value:10}]}],lower).color(10),'rgb(128,128,128)');
});

test('statistics metadata gates consumption and unit changes; request uses reset-aware change',async()=>{
  const calls=[],hass={states:{'sensor.a':{attributes:{unit_of_measurement:'kWh'}}},callWS:async message=>{
    calls.push(message);
    return message.type.endsWith('metadata')?[{statistic_id:'sensor.a',has_sum:true,unit_of_measurement:'kWh'}]:{'sensor.a':[{start:epoch,end:epoch+hour,change:0.4},{start:epoch+hour,end:epoch+2*hour,change:null}]};
  }};
  const result=await loadHeatmapData(hass,{entity:'sensor.a',mode:'consumption'},epoch,epoch+2*hour);
  assert.equal(result.source,'statistics');assert.equal(result.intervals[0].value,0.4);assert.equal(result.intervals[1].value,null);
  assert.deepEqual(calls[1].types,['change']);assert.equal(calls[1].period,'hour');
  await assert.rejects(loadHeatmapData({...hass,callWS:async()=>[]},{entity:'sensor.a',mode:'consumption'},epoch,epoch+hour),/consumption_statistics_required/);
  await assert.rejects(loadHeatmapData({...hass,states:{'sensor.a':{attributes:{unit_of_measurement:'Wh'}}}},{entity:'sensor.a',mode:'consumption'},epoch,epoch+hour),/consumption_statistics_required/);
  await assert.rejects(loadHeatmapData({...hass,callWS:async()=>{throw Error('offline');}},{entity:'sensor.a',mode:'consumption'},epoch,epoch+hour),/statistics_load_failed/);
});

test('average falls back to raw history with a held baseline and unit/unavailable gaps',async()=>{
  const hass={states:{'sensor.a':{attributes:{unit_of_measurement:'W'}}},callWS:async()=>{throw Error('offline');},callApi:async()=>[[
    {entity_id:'sensor.a',last_changed:new Date(epoch-hour).toISOString(),state:'10',attributes:{unit_of_measurement:'W'}},
    {entity_id:'sensor.a',last_changed:new Date(epoch+hour).toISOString(),state:'unavailable',attributes:{unit_of_measurement:'W'}},
    {entity_id:'sensor.a',last_changed:new Date(epoch+2*hour).toISOString(),state:'20',attributes:{unit_of_measurement:'kW'}},
  ]]};
  const result=await loadHeatmapData(hass,{entity:'sensor.a',mode:'average'},epoch,epoch+3*hour);
  assert.equal(result.source,'history');assert.equal(result.intervals[0].start,epoch);
  assert.deepEqual(result.intervals.map(r=>r.value),[10,null,null]);
});

test('history fallback preserves a unit-only change when requesting all state changes',async()=>{
  let requestedUrl;
  const hass={states:{'sensor.a':{attributes:{unit_of_measurement:'W'}}},callWS:async()=>{throw Error('offline');},callApi:async(_method,url)=>{
    requestedUrl=url;
    return [[
      {entity_id:'sensor.a',last_updated:new Date(epoch-hour).toISOString(),state:'10',attributes:{unit_of_measurement:'W'}},
      {entity_id:'sensor.a',last_updated:new Date(epoch+hour).toISOString(),state:'10',attributes:{unit_of_measurement:'kW'}},
    ]];
  }};
  const result=await loadHeatmapData(hass,{entity:'sensor.a',mode:'average'},epoch,epoch+2*hour);
  assert.match(requestedUrl,/significant_changes_only=0/);
  assert.deepEqual(result.intervals.map(row=>row.value),[10,null]);
});
