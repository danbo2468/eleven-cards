import {test} from 'node:test';
import assert from 'node:assert/strict';

globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};
globalThis.customElements={get:()=>undefined,define:()=>{}};
globalThis.window={};globalThis.document={querySelector:()=>null};
const {BarChartCard}=await import('../src/bar-chart.js');
const {HistoryGraphCard}=await import('../../history-graph-card/src/history-graph-card.js');
const H=3600000;
function fixture({config={},start=0,end=3*H,points=[[{t:0,v:10}]],sources=[],Card=BarChartCard}={}){
 const c=new Card(),entities=points.map((_,i)=>`sensor.s${i}`);
 c.setConfig({entities,aggregation_period:'hour',...config});
 c._hass={language:'en',config:{time_zone:'UTC'},states:Object.fromEntries(entities.map(id=>[id,{attributes:{unit_of_measurement:'W'}}]))};
 c._rawSeries=points.map((p,i)=>({id:entities[i],points:p,...(sources[i]?{source:sources[i]}:{})}));
 c._start=start;c._end=end;c._status='ready';c._render();return c;
}
function rectangles(c){
 return [...c.shadowRoot.innerHTML.matchAll(/<path\b[^>]*class="series-bar"[^>]*d="([^"]*)"|<path\b[^>]*d="([^"]*)"[^>]*class="series-bar"/g)].map(path=>
  [...(path[1]??path[2]).matchAll(/M (\S+) (\S+) V (\S+) H (\S+) V (\S+) Z/g)].map(m=>({left:+m[1],right:+m[4],base:+m[2],top:+m[3]})));
}
function assertUniform(c,counts){
 const groups=rectangles(c);assert.deepEqual(groups.map(g=>g.length),counts);
 const bars=groups.flat();assert.ok(bars.length);
 const width=bars[0].right-bars[0].left;assert.ok(width>0);
 for(const b of bars){assert.ok(Math.abs(b.right-b.left-width)<1e-8);assert.ok(b.left>=-1e-8&&b.right<=1000+1e-8);}
 for(const group of groups)for(let i=1;i<group.length;i++)assert.ok(group[i-1].right<=group[i].left+1e-8,'adjacent bars do not overlap');
 return groups;
}

test('partial data produces one complete aggregate bar; a wholly missing period stays empty and History retains its gaps',()=>{
 const points=[[{t:0,v:null},{t:H/4,v:10},{t:H/2,v:null},{t:3*H/4,v:30},{t:H,v:null},{t:2*H,v:20}]];
 for(const [method,value] of [['avg',20],['min',10],['max',30]]){
  const c=fixture({points,config:{aggregation_method:method}});
  assert.deepEqual(c._series[0].points,[{t:0,v:value},{t:H,v:null},{t:2*H,v:20}]);
  const [bars]=assertUniform(c,[2]);assert.ok(bars[0].right<1000/3&&bars[1].left>2000/3,'missing hour is not filled or stretched over');
  assert.deepEqual(c._hoverInterval(H/8),c._hoverInterval(7*H/8),'one hover selection for the entire aggregate');
 }
 const history=fixture({points,Card:HistoryGraphCard});
 assert.deepEqual(history._series[0].points.slice(0,4),[{t:0,v:null},{t:H/4,v:20},{t:H/2,v:null},{t:3*H/4,v:20}]);
});

for(const graph_mode of ['lines','stacked'])test(graph_mode+' keeps edge periods, zoomed periods and all sensors equally wide',()=>{
 const c=fixture({start:H/6,end:3*H+H/600,points:[[{t:0,v:10}],[{t:0,v:20}]],config:{graph_mode}});
 assertUniform(c,[4,4]);
 c._viewport=[H*.95,H*2.02];c._render();assertUniform(c,[3,3]);
 const [a,b]=rectangles(c);
 if(graph_mode==='stacked')assert.deepEqual(a.map(p=>[p.left,p.right]),b.map(p=>[p.left,p.right]));
 else for(let i=0;i<a.length;i++)assert.ok(a[i].right<b[i].left);
});

test('missing values in one sensor do not change another sensor’s width or grouped slot',()=>{
 const c=fixture({points:[[{t:0,v:10}],[{t:0,v:20},{t:H,v:null},{t:2*H,v:30}]]});
 const [a,b]=assertUniform(c,[3,2]);assert.ok(a[0].right<b[0].left&&a[2].right<b[1].left);
 c._visibility.set('sensor.s1',false);c._render();assertUniform(c,[3]);
});

test('different month lengths and daylight-saving days use equal bar widths without changing their readings',()=>{
 for(const [period,start,end,zone] of [
  ['month',Date.parse('2026-01-01T00:00:00Z'),Date.parse('2026-04-01T00:00:00Z'),'UTC'],
  ['day',Date.parse('2026-10-23T22:00:00Z'),Date.parse('2026-10-26T23:00:00Z'),'Europe/Amsterdam'],
 ]){
  const c=fixture({start,end,points:[[{t:start,v:12}]],config:{aggregation_period:period}});
  c._hass.config.time_zone=zone;c._render();assertUniform(c,[3]);assert.ok(c._series[0].points.every(p=>p.v===12));
 }
});

test('uneven raw recorder intervals keep equal widths and unavailable intervals stay empty',()=>{
 const c=fixture({points:[[{t:0,v:10},{t:H/6,v:20},{t:H*.8,v:null},{t:2*H,v:-5}]],config:{aggregation_period:'none'}});
 assertUniform(c,[3]);assert.equal(c._series[0].points[2].v,null);
});

test('statistics bins retain their values and missing bins without being aggregated again',()=>{
 for(const aggregation_period of ['hour','none']){
  const points=[[{t:H/6,v:12},{t:H,v:null},{t:2*H,v:24},{t:3*H,v:null}]];
  const c=fixture({start:H/6,end:3*H,points,sources:['statistics'],config:{aggregation_period}});
  assert.strictEqual(c._series[0],c._rawSeries[0]);assertUniform(c,[2]);
 }
});

test('an all-missing aggregate is omitted rather than converted to zero',()=>{
 const c=fixture({points:[[{t:0,v:null}]]});assert.deepEqual(rectangles(c),[]);
 assert.ok(c._series[0].points.every(p=>p.v===null));
});

test('dense bar data is not decimated into omitted periods or wider bars',()=>{
 const count=6010,points=[Array.from({length:count},(_,i)=>({t:i*H,v:12}))];
 const c=fixture({points,sources:['statistics'],end:count*H});assertUniform(c,[count]);
});

test('pointer hits on inset edge bars select their real period, while semantic hover and keyboard times stay unchanged',()=>{
 const c=fixture({start:H/6,end:3*H+H/600,points:[[{t:0,v:10},{t:3*H,v:40}]]});
 c._viewport=[H*.95,H*2.02];c._render();
 const [bars]=rectangles(c),duration=c._viewEnd-c._viewStart;
 for(const [i,bar] of bars.entries()){
  const pointer=c._viewStart+(bar.left+bar.right)/2000*duration;
  const interval=c._hoverInterval(c._pointerTime(pointer));
  assert.equal(interval.labelTime,i*H);
 }
 assert.equal(c._hoverInterval(1.1*H).labelTime,H,'semantic time still selects the containing hour');
});

test('partial edge groups retain visible separation from neighbours and the plot boundaries',()=>{
 for(const graph_mode of ['lines','stacked'])for(const sensors of [1,2,3]){
  const c=fixture({start:7*H/60,end:12*H+7*H/60,points:Array.from({length:sensors},(_,i)=>[{t:0,v:10+i}]),config:{graph_mode}});
  for(const viewport of [null,[H*.95,H*2.02]]){
   c._viewport=viewport;c._render();const groups=assertUniform(c,Array(sensors).fill(viewport?3:13));
   const bounds=groups[0].map((_,i)=>({left:Math.min(...groups.map(g=>g[i].left)),right:Math.max(...groups.map(g=>g[i].right))}));
   const width=bounds[0].right-bounds[0].left;
   assert.ok(bounds[0].left>=width*.1-1e-8,'left edge retains padding');
   assert.ok(1000-bounds.at(-1).right>=width*.1-1e-8,'right edge retains padding');
   for(let i=1;i<bounds.length;i++)assert.ok(bounds[i].left-bounds[i-1].right>=width*.25-1e-8,`${graph_mode}/${sensors}: groups ${i-1} and ${i} retain a visible gap`);
  }
 }
});
