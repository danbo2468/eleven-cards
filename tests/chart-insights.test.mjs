import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {chartZoomState,chartDataInformation,chartValueStatistics,isolateChartSeries,showAllChartSeries,bindChartLegend,disconnectChartInsights} from '../shared/chart-insights.js';
const H=3600000;
function load(slug){
 const registry=new Map(),ctx=vm.createContext({HTMLElement:class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}},window:new EventTarget(),document:{querySelector:()=>null,addEventListener(){},removeEventListener(){}},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},setTimeout,clearTimeout,structuredClone,URLSearchParams,Intl,queueMicrotask,console:{info(){},log(){}}});
 vm.runInContext(readFileSync(new URL(`../cards/${slug}/dist/eleven-${slug}.js`,import.meta.url),'utf8'),ctx);return registry.get(`eleven-${slug}`);
}
function fixture(slug,config={}){
 const C=load(slug),c=new C();c.setConfig({entities:['sensor.a','sensor.b'],hours_to_show:3,aggregation_period:'hour',...config});
 c._hass={language:'nl',config:{time_zone:'UTC'},states:{'sensor.a':{attributes:{unit_of_measurement:'kWh',friendly_name:'A'}},'sensor.b':{attributes:{unit_of_measurement:'kWh',friendly_name:'B'}}}};
 c._start=0;c._end=3*H;c._status='ready';
 c._series=slug==='timeline-card'?[[{start:0,end:3*H,state:'on'}],[{start:0,end:3*H,state:'off'}]]:[{id:'sensor.a',source:'statistics',points:[{t:0,v:2},{t:H,v:3},{t:2*H,v:0},{t:3*H,v:null}]},{id:'sensor.b',source:'statistics',points:[{t:0,v:4},{t:H,v:5},{t:2*H,v:1},{t:3*H,v:null}]}];
 c._lastLoad={at:1700000000000,start:0,end:3*H,sources:c._config.entities.map(id=>({id,source:slug==='timeline-card'?'history':'statistics'}))};c._render();return c;
}
const button=(html,action)=>html.match(new RegExp(`<button[^>]*data-zoom="${action}"[^>]*>`))?.[0];
test('information headings use each chart’s series or state color',()=>{
 for(const slug of ['history-graph-card','bar-chart','timeline-card']){
  const c=fixture(slug),section=c.shadowRoot.innerHTML.match(/<section class="insight-sensor" data-information-entity="sensor.a">[\s\S]*?<\/section>/)?.[0];
  assert.ok(section,slug);
  assert.match(section,/class="insight-color"/);
  assert.ok(section.includes(`--insight-color:${c._insightColor(0)}`),slug);
 }
});
test('zoom availability respects full windows, minimum width and loading',()=>{
 const host={_status:'ready',_start:0,_end:H};
 assert.deepEqual(chartZoomState(host),{zoomed:false,in:true,out:false,reset:false});
 host._viewport=[0,60000];assert.deepEqual(chartZoomState(host),{zoomed:true,in:false,out:true,reset:true});
 host._viewport=[0,H];assert.equal(chartZoomState(host).zoomed,false);
 host._end=30000;host._viewport=null;assert.equal(chartZoomState(host).in,false);
 host._status='loading';assert.equal(chartZoomState(host).reset,false);
});
for(const slug of ['history-graph-card','bar-chart','timeline-card']){
 test(`${slug}: zoom state and badge follow zoom/reset without changing configuration`,()=>{
  const c=fixture(slug),before=JSON.stringify(c._config);
  assert.match(button(c.shadowRoot.innerHTML,'out'),/ disabled/);assert.match(button(c.shadowRoot.innerHTML,'reset'),/ disabled/);
  assert.doesNotMatch(c.shadowRoot.innerHTML,/<span class="zoom-status">/);
  c._zoom(.5);assert.match(c.shadowRoot.innerHTML,/<span class="zoom-status">Ingezoomd/);
  const outsideHeader=c.shadowRoot.innerHTML.replace(/<header class="card-header">[^]*?<\/header>/,'');
  assert.doesNotMatch(outsideHeader,/class="chart-context"|class="period-panel"/);
  assert.match(c.shadowRoot.innerHTML,/class="period-current-range"[^]*?<span class="zoom-status">Ingezoomd/);
  assert.doesNotMatch(button(c.shadowRoot.innerHTML,'out'),/ disabled/);assert.doesNotMatch(button(c.shadowRoot.innerHTML,'reset'),/ disabled/);
  c._zoom(2);assert.doesNotMatch(c.shadowRoot.innerHTML,/<span class="zoom-status">/);assert.match(button(c.shadowRoot.innerHTML,'reset'),/ disabled/);
  c._zoom(.5);c._zoom(0);assert.equal(c._viewport,null);assert.equal(JSON.stringify(c._config),before);
 });
 test(`${slug}: isolation and show-all preserve configuration and include hidden sensors in History links`,()=>{
  const c=fixture(slug),before=JSON.stringify(c._config);
  isolateChartSeries(c,'sensor.b');assert.equal(c._isSeriesVisible(0),false);assert.equal(c._isSeriesVisible(1),true);
  assert.match(c._historyUrl(),/sensor.a%2Csensor.b/);assert.doesNotMatch(c.shadowRoot.innerHTML,/data-show-all|data-insight="series"/);
  if(slug==='timeline-card')assert.equal((c.shadowRoot.innerHTML.match(/class="row"/g)??[]).length,1);
  else assert.doesNotMatch(c.shadowRoot.innerHTML,/class="series-(?:line|bar)"[^>]*data-entity="sensor.a"/);
  showAllChartSeries(c);assert.equal(c._isSeriesVisible(0),true);assert.equal(c._isSeriesVisible(1),true);assert.equal(JSON.stringify(c._config),before);
 });
 test(`${slug}: zoom status and data information stay available with timeframe controls and legend hidden`,()=>{
  const c=fixture(slug,{show_navigation:false,show_legend:false});c._zoom(.5);
  assert.match(c.shadowRoot.innerHTML,/class="zoom-status"/);assert.match(c.shadowRoot.innerHTML,/data-insight="data"/);assert.doesNotMatch(c.shadowRoot.innerHTML,/data-period="menu"/);
 });
}
test('compact data information shows sources and short status labels without explanatory paragraphs',()=>{
 const c=fixture('history-graph-card');c._lastLoad={at:1700000000000,start:0,end:H,sources:[{id:'sensor.a',source:'statistics'},{id:'sensor.b',source:'history',empty:true}]};
 let html=chartDataInformation(c,'nl');assert.match(html,/Statistieken/);assert.match(html,/Historie/);assert.match(html,/Geen gegevens/);assert.doesNotMatch(html,/<p[ >]|insight-range|insight-updated|insight-explanation/);
 c._status='error';c._loadFailed=true;html=chartDataInformation(c,'en');assert.match(html,/Outdated/);assert.match(html,/data-metric="minimum"/);
 c._inFlight=true;assert.match(chartDataInformation(c,'en'),/Refreshing…/);
 c._config.series_options=[{entity:'sensor.a',name:'<script>bad</script>'}];assert.doesNotMatch(chartDataInformation(c,'en'),/<script>/);
});
const metric=(html,id,key)=>html.match(new RegExp(`data-information-entity="${id}"[\\s\\S]*?data-metric="${key}">([^<]*)`))?.[1].trim();

test('information preserves small measurements and totals, including negative and scientific values',()=>{
 for(const slug of ['history-graph-card','bar-chart'])for(const v of [0.001,-0.001,0.000001,-0.000001,0]){
  const c=fixture(slug,{aggregation_method:'delta'});
  c._rawSeries=c._series.map(s=>({...s,points:s.points.map(p=>({...p,v:p.v===null?null:v}))}));c._render();
  const expected=new Intl.NumberFormat('nl',v!==0&&Math.abs(v)<.0001?{maximumSignificantDigits:4,notation:'scientific'}:v!==0&&Math.abs(v)<.01?{maximumSignificantDigits:4}:{maximumFractionDigits:2}).format(v);
  for(const key of ['minimum','maximum','average'])assert.equal(metric(c.shadowRoot.innerHTML,'sensor.a',key),expected,`${slug} ${key} ${v}`);
  if(slug==='bar-chart'&&v===.001)assert.equal(metric(c.shadowRoot.innerHTML,'sensor.a','total'),'0,003');
 }
});
test('bar information combines per-sensor metrics and totals before stacking and follows zoom',()=>{
 const c=fixture('bar-chart',{graph_mode:'stacked',aggregation_method:'delta'});
 assert.equal(c._plotSeries[1].points[0].v,6);
 let html=c.shadowRoot.innerHTML;assert.doesNotMatch(html,/Periodeverbruik|period-totals|data-insight="totals"/);assert.equal(metric(html,'sensor.a','total'),'5');assert.equal(metric(html,'sensor.b','total'),'10');assert.equal(metric(html,'sensor.a','minimum'),'0');assert.equal(metric(html,'sensor.b','maximum'),'5');assert.equal(metric(html,'sensor.a','average'),'1,67');assert.doesNotMatch(html,/>Onvolledig/);
 c._viewport=[H,2*H];c._render();html=c.shadowRoot.innerHTML;assert.equal(metric(html,'sensor.a','total'),'3');assert.equal(metric(html,'sensor.b','total'),'5');assert.equal(metric(html,'sensor.a','average'),'3');
 isolateChartSeries(c,'sensor.b');assert.match(c.shadowRoot.innerHTML,/Verborgen/);assert.equal(metric(c.shadowRoot.innerHTML,'sensor.a','total'),'3');
});
test('bar summary marks missing data and counts clipped bars in full without prorating',()=>{
 const c=fixture('bar-chart',{aggregation_method:'delta'});c._rawSeries=[{id:'sensor.a',source:'statistics',points:[{t:0,v:0},{t:H,v:null},{t:2*H,v:-2},{t:3*H,v:null}]},{id:'sensor.b',source:'statistics',points:[]}];c._render();
 assert.equal(metric(c.shadowRoot.innerHTML,'sensor.a','total'),'-2');assert.equal(metric(c.shadowRoot.innerHTML,'sensor.b','total'),'—');assert.equal(metric(c.shadowRoot.innerHTML,'sensor.a','average'),'-1');assert.match(c.shadowRoot.innerHTML,/Onvolledig/);
 c._viewport=[H/2,5*H/2];c._render();assert.equal(metric(c.shadowRoot.innerHTML,'sensor.a','total'),'-2');assert.doesNotMatch(c.shadowRoot.innerHTML,/Deelvakken|Partial bins/);
});
test('bar summary does not invent consumption for averages or raw intervals',()=>{
 for(const config of [{aggregation_method:'avg'},{aggregation_method:'delta',aggregation_period:'none'}]){
  const c=fixture('bar-chart',config);assert.doesNotMatch(c.shadowRoot.innerHTML,/data-metric="total"/);assert.match(c.shadowRoot.innerHTML,/data-metric="average"/);
 }
});
test('successful-load metadata survives failures and is cleared when configuration changes',async()=>{
 for(const slug of ['history-graph-card','bar-chart','timeline-card']){
  const c=fixture(slug);let failed=false;c._connected=true;
  c._hass.callApi=async()=>{if(failed)throw Error('offline');return c._config.entities.map(entity_id=>[{entity_id,state:'10',last_changed:new Date(Date.now()-3*H).toISOString()}]);};
  try{
   await c._refresh();assert.equal(c._status,'ready');const loaded=c._lastLoad;
   assert.ok(Number.isFinite(loaded.at));assert.equal(loaded.sources.length,2);assert.ok(loaded.sources.every(s=>s.source==='history'));
   failed=true;await c._refresh();assert.equal(c._status,'error');assert.strictEqual(c._lastLoad,loaded);assert.equal(c._loadFailed,true);
   if(slug!=='timeline-card')assert.match(c.shadowRoot.innerHTML,/data-metric="minimum"/);
   c._connected=false;c.setConfig({entities:['sensor.a']});assert.equal(c._lastLoad,null);assert.equal(c._loadFailed,false);
  }finally{c.disconnectedCallback();}
 }
});
test('history metrics exclude gaps, use held values at the viewport edge and weight by duration',()=>{
 const points=[{t:0,v:0},{t:H,v:10},{t:3*H,v:null},{t:4*H,v:-5}];
 assert.deepEqual(chartValueStatistics(points,H/2,5*H),{minimum:-5,maximum:10,average:15/3.5,count:3,missing:true});
 assert.deepEqual(chartValueStatistics(points,2*H,3*H),{minimum:10,maximum:10,average:10,count:1,missing:false});
 assert.deepEqual(chartValueStatistics(points,3*H,4*H),{minimum:null,maximum:null,average:null,count:0,missing:true});
});
test('bar means give each displayed bar equal weight, including DST-length bins',()=>{
 const points=[{t:0,v:0},{t:23*H,v:10},{t:48*H,v:null}];
 const bins=[[0,23*H],[23*H,48*H],[48*H,72*H]];
 assert.deepEqual(chartValueStatistics(points,0,48*H,(_,i)=>bins[i]),{minimum:0,maximum:10,average:5,count:2,missing:false});
});
test('history popup uses unstacked aggregates, zoomed range and per-sensor units',()=>{
 const c=fixture('history-graph-card',{graph_mode:'stacked'});
 assert.equal(metric(c.shadowRoot.innerHTML,'sensor.b','maximum'),'5');
 assert.equal(metric(c.shadowRoot.innerHTML,'sensor.b','average'),'3,33');
 c._hass.states['sensor.b'].attributes.unit_of_measurement='W';c._viewport=[H,2*H];c._render();
 assert.equal(metric(c.shadowRoot.innerHTML,'sensor.b','minimum'),'5');
 assert.match(c.shadowRoot.innerHTML,/insight-unit">· W<\/span>/);assert.match(c.shadowRoot.innerHTML,/data-metric="average">5<\/dd>/);
 assert.equal(c._lastLoad.summary.start,H);assert.equal(c._lastLoad.summary.end,2*H);
});
test('timeline information describes state history without inventing numeric sensor metrics',()=>{
 const c=fixture('timeline-card');assert.match(c.shadowRoot.innerHTML,/insight-source">Historie/);assert.doesNotMatch(c.shadowRoot.innerHTML,/data-metric=/);
});
function legendFixture(){
 const ids=['sensor.a','sensor.b'],buttons=ids.map(id=>({dataset:{series:id},setAttribute(){},focus(){this.focused=true;}}));
 const host={_config:{entities:ids},_visibility:new Map(ids.map(id=>[id,true])),_insightLanguage:'nl',shadowRoot:{querySelectorAll:()=>buttons,querySelector:selector=>buttons.find(b=>selector.includes(b.dataset.series))},_render(){bindChartLegend(this);},_isSeriesVisible(i){return this._visibility.get(ids[i]);},_toggleSeries(id){this._visibility.set(id,!this._visibility.get(id));this._render();}};
 bindChartLegend(host);return {host,buttons};
}
const clickEvent=detail=>({detail,preventDefault(){}}),waitForLegend=()=>new Promise(resolve=>setTimeout(resolve,350));
test('legend double-click isolates and restores all without a delayed single-click changing the result',async()=>{
 const {host,buttons}=legendFixture(),b=buttons[1];
 b.onclick(clickEvent(1));b.onclick(clickEvent(2));await waitForLegend();assert.equal(host._isSeriesVisible(0),false);assert.equal(host._isSeriesVisible(1),true);
 b.onclick(clickEvent(1));b.onclick(clickEvent(2));await waitForLegend();assert.equal(host._isSeriesVisible(0),true);assert.equal(host._isSeriesVisible(1),true);assert.equal(b.focused,true);
});
test('rapid single-clicks on different legend entries both apply, including after rebinding',async()=>{
 const {host,buttons}=legendFixture();buttons[0].onclick(clickEvent(1));buttons[1].onclick(clickEvent(1));bindChartLegend(host);await waitForLegend();assert.equal(host._isSeriesVisible(0),false);assert.equal(host._isSeriesVisible(1),false);
});
test('legend keyboard actions are immediate and disconnect cancels pending pointer clicks',async()=>{
 const {host,buttons}=legendFixture();buttons[0].onclick(clickEvent(0));assert.equal(host._isSeriesVisible(0),false);
 buttons[0].onkeydown({shiftKey:true,key:'Enter',preventDefault(){},stopPropagation(){}});assert.equal(host._isSeriesVisible(0),true);assert.equal(host._isSeriesVisible(1),false);
 buttons[0].onkeydown({shiftKey:true,key:' ',preventDefault(){},stopPropagation(){}});assert.equal(host._isSeriesVisible(0),true);assert.equal(host._isSeriesVisible(1),true);
 buttons[0].onclick(clickEvent(1));disconnectChartInsights(host);await waitForLegend();assert.equal(host._isSeriesVisible(0),true);
});

test('bar legend clicks survive a refresh when the title is left at its default',async()=>{
 const c=fixture('bar-chart'),config=c._config,buttons=c._config.entities.map(id=>({dataset:{series:id},setAttribute(){},focus(){}}));
 c.shadowRoot.querySelectorAll=selector=>selector==='[data-series]'?buttons:[];bindChartLegend(c);
 buttons[0].onclick(clickEvent(1));c._render();await waitForLegend();
 assert.equal(c._isSeriesVisible(0),false);assert.strictEqual(c._config,config);
});
