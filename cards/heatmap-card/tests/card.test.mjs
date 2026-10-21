import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class {attachShadow(){this.shadowRoot={innerHTML:'',activeElement:null,querySelector:()=>null,querySelectorAll:()=>[]};}};
const {HeatmapCard,HeatmapEditor}=await import('../src/heatmap-card.js');
const states={'sensor.a':{state:'12',attributes:{friendly_name:'Kitchen <script>','unit_of_measurement':'W'}}};
const data=id=>[{entity_id:id,last_changed:new Date(Date.now()-86400000).toISOString(),state:'10',attributes:{unit_of_measurement:'W'}}];
const hass={states,config:{time_zone:'Europe/Amsterdam'},language:'nl',callWS:async()=>[],callApi:async()=>[data('sensor.a')]};

test('long heatmap windows limit cell DOM to visible rows',()=>{
 const card=new HeatmapCard();card.setConfig({entity:'sensor.a'});card._rows=Array.from({length:366},()=>({cells:[]}));
 const top=card._matrixWindow(0,800),bottom=card._matrixWindow(9000,800);
 assert.ok(top[1]-top[0]<60);assert.ok(bottom[1]-bottom[0]<60);assert.ok(bottom[0]>300);assert.equal(bottom[1],366);
});

test('history renders escaped labels; repeated hass updates do not refetch; detach clears polling',async()=>{
  let calls=0;const card=new HeatmapCard();card.setConfig({entity:'sensor.a',hours_to_show:24,show_navigation:false});
  card.hass={...hass,callApi:async()=>{calls++;return [data('sensor.a')];}};
  card.connectedCallback();await card._refresh();
  assert.equal(card._status,'ready');assert.match(card.shadowRoot.innerHTML,/Kitchen &lt;script&gt;/);assert.match(card.shadowRoot.innerHTML,/role="table"/);
  card.hass={...card.hass};assert.equal(calls,1);card.disconnectedCallback();assert.equal(card._timer,null);
});

test('failed refresh keeps existing data and retry recovers; stale period responses are ignored',async()=>{
  const card=new HeatmapCard();card.setConfig({entity:'sensor.a',show_navigation:false});card.hass=hass;card.connectedCallback();await card._refresh();
  const prior=card._data;
  card.hass={...hass,callApi:async()=>{throw Error('offline');}};await card._refresh();
  assert.equal(card._status,'error');assert.equal(card._data,prior);assert.match(card.shadowRoot.innerHTML,/Vorige gegevens/);
  card.hass=hass;await card._refresh();assert.equal(card._status,'ready');
  let resolve;card.hass={...hass,callApi:()=>new Promise(r=>resolve=r)};
  const pending=card._refresh();await Promise.resolve();await Promise.resolve();
  card.disconnectedCallback();resolve([data('sensor.a')]);await pending;assert.equal(card._timer,null);
});

test('config change rejects old response and loads the new entity; unit changes invalidate prior values',async()=>{
  let resolve;const card=new HeatmapCard();card.setConfig({entity:'sensor.a',show_navigation:false});
  card.hass={...hass,callApi:()=>new Promise(r=>resolve=r)};card.connectedCallback();const old=card._refresh();await Promise.resolve();await Promise.resolve();
  card.hass={...hass,states:{...states,'sensor.b':states['sensor.a']},callApi:async()=>[data('sensor.b')]};
  card.setConfig({entity:'sensor.b',hours_to_show:24,show_navigation:false});await card._refresh();
  resolve([data('sensor.a')]);await old;
  assert.equal(card._config.entity,'sensor.b');assert.equal(card._status,'ready');
  card.hass={...card.hass,states:{...card.hass.states,'sensor.b':{attributes:{unit_of_measurement:'kW'}}}};
  assert.equal(card._data,null);await card._refresh();assert.equal(card._data.unit,'kW');card.disconnectedCallback();
});

test('hung request times out and consumption errors explain the requirement',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const card=new HeatmapCard();card.setConfig({entity:'sensor.a',show_navigation:false});card.hass={...hass,callWS:()=>new Promise(()=>{})};card.connectedCallback();const pending=card._refresh();
  t.mock.timers.tick(20001);await pending;assert.equal(card._status,'error');assert.equal(card._promise,null);card.disconnectedCallback();
  const counter=new HeatmapCard();counter.setConfig({entity:'sensor.a',mode:'consumption',show_navigation:false});counter.hass=hass;counter.connectedCallback();await counter._refresh();
  assert.match(counter.shadowRoot.innerHTML,/tellerstatistieken/);counter.disconnectedCallback();
});

test('editor, stub and layout expose a single sensor and optional numeric bounds',()=>{
  assert.equal(HeatmapCard.getStubConfig(hass).entity,'sensor.a');
  const editor=new HeatmapEditor();editor.setConfig(Object.freeze({entity:'sensor.a'}));assert.equal(editor._config.entity,'sensor.a');
  assert.equal(HeatmapCard.getConfigForm().schema.find(s=>s.name==='entity').selector.entity.domain,'sensor');
  const fields=schema=>schema.flatMap(s=>s.schema?fields(s.schema):[s]);
  for(const name of ['low_color','high_color'])assert.deepEqual(fields(HeatmapCard.getConfigForm().schema).find(s=>s.name===name).selector,{color_rgb:{}});
  assert.deepEqual(editor._config.low_color,[219,234,254]);
  assert.ok(new HeatmapCard().getGridOptions().rows>=3);
  const annual=new HeatmapCard();annual.setConfig({entity:'sensor.a',hours_to_show:8760,show_navigation:false});assert.ok(annual.getCardSize()<=18);
});

test('configuration groups match the chart editors and expose native selectors with localized help',()=>{
  const definition=HeatmapCard.getConfigForm({entity:'sensor.a',color_mode:'gradient'},true),groups=definition.schema.filter(s=>s.type==='expandable');
  assert.deepEqual(groups.map(s=>s.name),['graph_settings','data_processing','color_settings','matrix_settings']);
  assert.ok(groups.every(s=>s.flatten));
  const colors=groups.find(s=>s.name==='color_settings');assert.equal(colors.title,'Kleuren');
  const stops=colors.schema.find(s=>s.name==='gradient_stops');assert.equal(stops.selector.object.multiple,true);
  assert.deepEqual(stops.selector.object.fields.color.selector,{color_rgb:{}});
  assert.ok(!colors.schema.some(s=>s.name==='low_color'));
  assert.equal(definition.computeLabel.call({hass:{language:'en'}},{name:'show_title'}),'Show title');
  assert.match(definition.computeHelper.call({hass:{language:'nl'}},{name:'gradient_stops'}),/sensoreenheid/);
  const period=groups.find(s=>s.name==='data_processing').schema.find(s=>s.name==='aggregation_period');
  assert.equal(period.default,'hour');assert.deepEqual(period.selector.select.options.map(o=>o.value),['hour','day','week','month']);
  assert.equal(period.selector.select.options[2].label,'Week (maandag)');
});

test('calendar aggregation updates matrix columns, labels, summaries and card height using hourly source data',async()=>{
  const end=Date.parse('2026-10-08T12:00:00Z');
  for(const [aggregation_period,count,corner] of [['hour',24,'Dag / uur'],['day',7,'Week / dag'],['week',53,'Jaar / week'],['month',12,'Jaar / maand']]){
    const requests=[],card=new HeatmapCard();
    card.setConfig({entity:'sensor.a',hours_to_show:168,aggregation_period,show_navigation:false});card._periodEnd=end;
    card.hass={...hass,callWS:async request=>{
      requests.push(request);
      if(request.type.endsWith('metadata'))return [{statistic_id:'sensor.a',has_mean:true,unit_of_measurement:'W'}];
      const start=Date.parse(request.start_time),end=Date.parse(request.end_time);
      return {'sensor.a':Array.from({length:(end-start)/3600000},(_,i)=>({start:start+i*3600000,end:start+(i+1)*3600000,mean:12}))};
    }};
    card.connectedCallback();await card._refresh();
    assert.equal(card._status,'ready');assert.equal(requests[1].period,'hour');assert.ok(card._rows.every(row=>row.cells.length===count));
    assert.match(card.shadowRoot.innerHTML,new RegExp(`aria-colcount="${count+1}"`));assert.ok(card.shadowRoot.innerHTML.includes(corner));
    assert.ok(card.shadowRoot.innerHTML.includes(`repeat(${count},minmax(`));assert.doesNotMatch(card.shadowRoot.innerHTML,/<button[^>]*data-cell|tabindex=/);
    const cell=card._rows.flatMap(row=>row.cells).find(cell=>cell.value!=null);
    assert.equal(cell.value,12);assert.doesNotMatch(card._label(cell),/undefined|Invalid Date/);assert.ok(card._cellBounds(cell).length);
    assert.match(card._information('nl'),/data-metric="average"/);
    assert.match(card._information('nl'),/class="insight-color" style="--insight-color:rgb\(/);
    if(aggregation_period!=='hour')assert.ok(card.getCardSize()<6);
    card.disconnectedCallback();
  }
});

test('switching aggregation while loading discards the old matrix and late response',async()=>{
  let resolve;const card=new HeatmapCard();card.setConfig({entity:'sensor.a',aggregation_period:'hour',show_navigation:false});
  card.hass={...hass,callApi:()=>new Promise(r=>resolve=r)};card.connectedCallback();const old=card._refresh();
  await Promise.resolve();await Promise.resolve();
  card.hass={...hass,callApi:async()=>[data('sensor.a').map(row=>({...row,state:'30'}))]};
  card.setConfig({...card._config,aggregation_period:'month'});await card._refresh();
  const rows=card._rows;assert.ok(rows.every(row=>row.cells.length===12));
  assert.equal(rows.flatMap(row=>row.cells).find(cell=>cell.value!=null).value,30);
  resolve([data('sensor.a')]);await old;
  assert.equal(card._rows,rows);assert.equal(card._config.aggregation_period,'month');card.disconnectedCallback();
});

test('visibility, custom grid dimensions and color stops change the rendered card while cells stay static',async()=>{
  const card=new HeatmapCard();card.setConfig({entity:'sensor.a',show_navigation:false,show_title:false,show_legend:false,show_labels:false,cell_width:7,cell_height:18,cell_gap:0,border_radius:0,max_height:200,color_mode:'gradient',gradient_mode:'steps',gradient_stops:[{value:0,color:[0,0,0]},{value:5,color:[255,0,0]},{value:15,color:[0,255,0]}]});
  card.hass=hass;card.connectedCallback();await card._refresh();const html=card.shadowRoot.innerHTML;
  assert.doesNotMatch(html,/<h2>|<div class="legend"|<button[^>]*data-cell/);
  assert.match(html,/max-height:200px/);assert.match(html,/min-width:168px/);assert.match(html,/min-width:7px;height:18px/);
  assert.match(html,/background-color:rgb\(255,0,0\)/);
  assert.match(html,/data-insight="data"/);card.disconnectedCallback();
});

test('an empty card opens the sensor picker without throwing or starting requests',async()=>{
  const card=new HeatmapCard();card.setConfig({type:'custom:eleven-heatmap-card'});card.hass=hass;card.connectedCallback();await card._refresh();
  assert.match(card.shadowRoot.innerHTML,/Kies een sensor/);assert.equal(card._promise,null);
  card.setConfig({entity:'sensor.a',hours_to_show:24,show_navigation:false});await card._refresh();assert.equal(card._status,'ready');card.disconnectedCallback();
});

test('shared information contains source, units and summaries while normal content stays compact',async()=>{
  const card=new HeatmapCard();card.setConfig({entity:'sensor.a',show_navigation:false});card.hass=hass;card.connectedCallback();await card._refresh();
  const html=card.shadowRoot.innerHTML;
  assert.match(html,/data-insight="data"/);assert.match(html,/data-metric="average"/);assert.match(html,/Historie/);
  assert.doesNotMatch(html,/class="(?:subtitle|hint|detail|detail-extra)"/);
  assert.match(html,/role="tooltip" hidden/);assert.doesNotMatch(html,/title="ma |title="di |title="wo /);
  assert.ok(html.indexOf('<div class="legend"')<html.indexOf('<div class="chart"'));
  assert.doesNotMatch(html.replace(/<style>[^]*?<\/style>/g,''),/<button[^>]*data-cell|tabindex=|aria-selected=|Pijltjestoetsen|class="announcement/);
  assert.match(html,/linear-gradient\(90deg,rgb\(219,234,254\),rgb\(29,78,216\)\)/);
  card._status='error';assert.match(card._information('nl'),/Verouderd/);assert.match(card._information('en'),/Outdated/);
  card.disconnectedCallback();
});

test('timezone changes during a request discard its result and reconnect restarts polling',async()=>{
  let resolve,calls=0;
  const card=new HeatmapCard();card.setConfig({entity:'sensor.a',hours_to_show:24,show_navigation:false});
  card.hass={...hass,callApi:()=>{calls++;return calls===1?new Promise(r=>resolve=r):Promise.resolve([data('sensor.a')]);}};
  card.connectedCallback();const first=card._refresh();await Promise.resolve();await Promise.resolve();
  card.hass={...card.hass,config:{time_zone:'UTC'}};resolve([data('sensor.a')]);await first;await card._refresh();
  assert.equal(card._zone,'UTC');assert.equal(card._status,'ready');assert.equal(calls,2);
  card.disconnectedCallback();assert.equal(card._timer,null);
  card.connectedCallback();await card._refresh();assert.equal(calls,3);assert.ok(card._timer);card.disconnectedCallback();
});
