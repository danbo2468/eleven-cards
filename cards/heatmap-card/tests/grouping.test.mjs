import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarGrid,buildHeatmap,heatmapColumns,normalizeConfig,summarizeHeatmap} from '../src/heatmap-utils.js';
import {graphPeriodBounds} from '../../../shared/periods.js';

const H=3600000,D=24*H,epoch=Date.parse('2026-10-01T00:00:00Z');
const known=rows=>rows.flatMap(row=>row.cells).filter(cell=>cell.value!=null);

test('aggregation defaults to hours, validates supported periods and localizes matrix columns',()=>{
  assert.equal(normalizeConfig({entity:'sensor.a'}).aggregation_period,'hour');
  for(const aggregation_period of ['hour','day','week','month'])assert.equal(normalizeConfig({entity:'sensor.a',aggregation_period}).aggregation_period,aggregation_period);
  for(const aggregation_period of ['none','minute','quarter_hour','year',''])assert.throws(()=>normalizeConfig({entity:'sensor.a',aggregation_period}));
  assert.deepEqual(heatmapColumns('day','nl-NL'),['ma','di','wo','do','vr','za','zo']);
  assert.deepEqual(heatmapColumns('day','en-GB'),['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);
  assert.equal(heatmapColumns('week').length,53);assert.equal(heatmapColumns('week')[52],'W53');
  assert.equal(heatmapColumns('month','nl-NL')[0],'jan');assert.equal(heatmapColumns('month','en-GB')[11],'Dec');
});

test('calendar grids cover every requested millisecond once across DST, offsets and leap days',()=>{
  for(const [from,to,zone] of [
    ['2026-03-28T23:00:00Z','2026-03-30T22:00:00Z','Europe/Amsterdam'],
    ['2026-10-24T22:00:00Z','2026-10-26T23:00:00Z','Europe/Amsterdam'],
    ['2026-10-03T13:30:00Z','2026-10-05T13:00:00Z','Australia/Lord_Howe'],
    ['2026-10-01T18:15:00Z','2026-10-03T18:15:00Z','Asia/Kathmandu'],
    ['2024-02-28T12:13:00Z','2024-03-02T08:01:00Z','UTC'],
  ])for(const period of ['day','week','month']){
    const start=Date.parse(from),end=Date.parse(to),rows=calendarGrid(start,end,zone,period);
    const spans=rows.flatMap(row=>row.cells.flatMap(cell=>cell.intervals)).sort((a,b)=>a.start-b.start);
    assert.equal(spans[0].start,start);assert.equal(spans.at(-1).end,end);
    assert.equal(spans.reduce((sum,span)=>sum+span.end-span.start,0),end-start);
    for(let i=1;i<spans.length;i++)assert.equal(spans[i-1].end,spans[i].start);
    assert.ok(rows.every(row=>row.cells.length==={day:7,week:53,month:12}[period]));
  }
  const spring=calendarGrid(Date.parse('2026-03-28T23:00:00Z'),Date.parse('2026-03-29T22:00:00Z'),'Europe/Amsterdam','day')[0].cells[6];
  assert.equal(spring.intervals[0].end-spring.intervals[0].start,23*H);
});

test('ISO week 53 and January dates retain their correct week-year without duplicate intervals',()=>{
  const start=Date.parse('2020-12-28T00:00:00Z'),end=Date.parse('2021-01-11T00:00:00Z');
  const rows=calendarGrid(start,end,'UTC','week');
  assert.deepEqual(rows.map(row=>row.key),['2020','2021']);
  assert.equal(rows[0].cells[52].timestamp,start);assert.equal(rows[0].cells[52].intervals[0].end,start+7*D);
  assert.equal(rows[1].cells[0].timestamp,start+7*D);assert.equal(rows[1].cells[52].intervals.length,0);
  const january=calendarGrid(Date.parse('2021-01-01T00:00:00Z'),Date.parse('2021-01-02T00:00:00Z'),'Europe/Amsterdam','week');
  assert.equal(january[0].key,'2020');assert.equal(january[0].cells[52].clipped,true);
});

test('day grouping uses Monday rows and month grouping includes leap February',()=>{
  const days=calendarGrid(Date.parse('2026-10-04T00:00:00Z'),Date.parse('2026-10-06T00:00:00Z'),'UTC','day');
  assert.deepEqual(days.map(row=>row.key),['2026-09-28','2026-10-05']);
  assert.equal(days[0].cells[6].intervals.length,1);assert.equal(days[1].cells[0].intervals.length,1);
  const months=calendarGrid(Date.parse('2024-01-31T12:00:00Z'),Date.parse('2024-03-02T08:00:00Z'),'UTC','month');
  assert.equal(months.length,1);assert.equal(months[0].key,'2024');
  const february=months[0].cells[1];assert.equal(february.periodEnd-february.timestamp,29*D);assert.equal(february.clipped,false);
});

test('larger cells use duration-weighted means for statistics and history while preserving missing coverage',()=>{
  for(const period of ['day','week','month'])for(const source of ['statistics','history']){
    const [start,end]=graphPeriodBounds(epoch,period,'UTC');
    const intervals=[{start,end:start+H,value:2},{start:start+H,end:start+4*H,value:4},{start:start+4*H,end,value:null}];
    const rows=buildHeatmap({source,unit:'W',intervals},start,end,'UTC','average',period),cells=known(rows);
    assert.equal(cells.length,1);assert.equal(cells[0].value,3.5);assert.equal(cells[0].coverage,4*H);assert.equal(cells[0].partial,true);
    assert.equal(summarizeHeatmap(rows,'average').missing,true);
  }
});

test('consumption sums original hourly changes, including zero, negative values, gaps and partial edges',()=>{
  const start=epoch+12*H,end=start+2*D,intervals=Array.from({length:48},(_,i)=>({start:start+i*H,end:start+(i+1)*H,value:i===0?0:i===1?-1:i===30?null:1}));
  for(const period of ['hour','day','week','month']){
    const rows=buildHeatmap({source:'statistics',unit:'kWh',intervals},start,end,'UTC','consumption',period),summary=summarizeHeatmap(rows,'consumption');
    assert.equal(summary.total,44);assert.equal(summary.missing,true);
    assert.ok(rows.flatMap(row=>row.cells).filter(cell=>!cell.intervals.length).every(cell=>cell.value===null));
    if(period==='day'){
      assert.deepEqual(known(rows).map(cell=>cell.value),[9,23,12]);
      assert.ok(known(rows).every(cell=>cell.partial));
    }
  }
});

test('larger statistics groups retain complete clipped summaries without placing values outside the requested calendar cells',()=>{
  const start=epoch+H/2,end=epoch+1.5*H,intervals=[{start:epoch,end:epoch+H,value:2},{start:epoch+H,end:epoch+2*H,value:3}];
  for(const period of ['day','week','month']){
    const cells=known(buildHeatmap({source:'statistics',unit:'kWh',intervals},start,end,'UTC','consumption',period));
    assert.equal(cells.length,1);assert.equal(cells[0].value,5);assert.equal(cells[0].partial,true);assert.equal(cells[0].records.length,2);
  }
  const a=Date.parse('2026-10-01T18:45:00Z'),b=a+2*H;
  const rows=buildHeatmap({source:'statistics',unit:'kWh',intervals:[{start:a-45*60000,end:a+15*60000,value:10},{start:a+15*60000,end:a+75*60000,value:2}]},a,b,'Asia/Kolkata','consumption','day');
  assert.equal(summarizeHeatmap(rows,'consumption').total,2,'a summary starting on the previous local date is not invented for the next day');
});
