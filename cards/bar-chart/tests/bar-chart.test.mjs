import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};
globalThis.customElements={get:()=>undefined,define:()=>{}};globalThis.window={};globalThis.document={querySelector:()=>null};
const {BarChartCard:C,BarChartEditor:E}=await import('../src/bar-chart.js');
function fixture(config={}){
 const c=new C();c.setConfig({entities:['sensor.a','sensor.b'],...config});
 c._hass={language:'nl',config:{time_zone:'UTC'},states:Object.fromEntries(['sensor.a','sensor.b'].map(id=>[id,{attributes:{unit_of_measurement:'W',friendly_name:id}}]))};
 c._series=[{id:'sensor.a',points:[{t:0,v:10},{t:3600000,v:-5}]},{id:'sensor.b',points:[{t:0,v:20},{t:3600000,v:30}]}];
 c._start=0;c._end=7200000;c._status='ready';c._render();return c;
}
test('vertical bars reuse History interactions and use hourly averages and a zero baseline',()=>{
 const c=fixture();assert.equal(c._config.aggregation_period,'hour');assert.match(c.shadowRoot.innerHTML,/series-bar/);assert.doesNotMatch(c.shadowRoot.innerHTML,/class="series-line"/);
 assert.ok(c._axes[0].min<=-5&&c._axes[0].max>=30);assert.match(c.shadowRoot.innerHTML,/Staafdiagram/);
 assert.equal(typeof c._zoom,'function');assert.equal(typeof c._showTooltip,'function');
 const positive=fixture({y_min:0});assert.equal(positive._axes[0].min,0);
});
test('positive-only and negative-only bars include zero independently for each unit',()=>{
 const c=fixture();c._rawSeries=null;c._series=[{id:'sensor.a',points:[{t:0,v:20}]},{id:'sensor.b',points:[{t:0,v:-100}]}];
 c._hass.states['sensor.b'].attributes.unit_of_measurement='°C';c._render();
 assert.equal(c._axes[0].min,0);assert.equal(c._axes[1].max,0);assert.equal(c._axes.length,2);
});
test('grouped geometry gives each sensor its own slot and unavailable intervals stay empty',()=>{
 const c=fixture(),x=t=>t/3600,y=v=>300-v;
 const points=[{t:0,v:10},{t:3600000,v:null},{t:7200000,v:-5}];c._end=c._viewEnd=10800000;
 const a=c._line(points,10800000,x,y,0),b=c._line(points,10800000,x,y,1);
 assert.equal((a.match(/M /g)||[]).length,2);assert.match(a,/^M 120 300 V 290 H 462 V 300 Z/);
 assert.match(b,/^M 500 300 V 290 H 842 V 300 Z/);
 assert.doesNotMatch(a,/NaN|Infinity/);assert.match(a,/V 305/);
 c._visibility.set('sensor.b',false);assert.match(c._line(points,10800000,x,y,0),/^M 120 300 V 290 H 804/);
});
test('stacked bars use separate positive and negative bases, not grouped slots',()=>{
 const c=fixture({graph_mode:'stacked'});c._viewStart=0;c._viewEnd=3600000;
 const d=c._line([{t:0,v:-15,base:-10}],3600000,t=>t/36000,v=>300-v,1);
 assert.match(d,/^M 12 310 V 315 H 80.4 V 310 Z$/);
 assert.ok(c._plotSeries[1].points.some(p=>p.base===10));
});
test('editor defaults preserve bar type without irrelevant line controls',()=>{
 const data=new E()._editorConfig({type:'custom:eleven-bar-chart',entities:['sensor.a']});
 assert.equal(data.aggregation_period,'hour');assert.equal(data.type,'custom:eleven-bar-chart');
 const schema=C.getSeriesConfigForm(data.entities[0],data.entities).schema;
 assert.equal(schema.some(s=>s.name==='series_fill'),false);
 assert.equal(schema.find(s=>s.name==='series_line').schema.some(s=>s.name==='line_width'),false);
});
test('Delta is a native aggregation option, survives editor roundtrip and processes actual raw values',()=>{
 const c=fixture({aggregation_method:'delta'});
 assert.equal(c._config.aggregation_method,'delta');
 const form=C.getConfigForm(),field=form.schema.find(s=>s.name==='data_processing').schema.find(s=>s.name==='aggregation_method');
 assert.ok(field.selector.select.options.some(o=>o.value==='delta'&&o.label.includes('Delta')));
 assert.match(form.computeHelper({name:'aggregation_method'}),/end.*start|eind.*begin/i);
 const data=new E()._editorConfig(Object.freeze({type:'custom:eleven-bar-chart',entities:Object.freeze(['sensor.a']),aggregation_method:'delta',aggregation_period:'quarter_hour'}));
 assert.equal(data.aggregation_method,'delta');assert.equal(data.aggregation_period,'quarter_hour');
 c._rawSeries=[{id:'sensor.a',points:[{t:0,v:100},{t:3600000,v:110},{t:7200000,v:106}]},{id:'sensor.b',points:[{t:0,v:20},{t:3600000,v:22}]}];
 c._render();assert.deepEqual(c._series[0].points,[{t:0,v:10},{t:3600000,v:-4}]);
 assert.match(c.shadowRoot.innerHTML,/series-bar/);
 const raw=fixture({aggregation_method:'delta',aggregation_period:'none'});
 assert.equal(raw._config.aggregation_method,'delta');assert.equal(raw._config.aggregation_period,'none');
});
test('raw period hides only the method and retains its dormant value on return',()=>{
 const e=new E(),form={};e._form=form;
 for(const period of ['none','hour','quarter_hour']){
  const data=Object.freeze({aggregation_period:period,aggregation_method:'delta'});
  e._bind(form,C.getConfigForm(),data);
  const fields=form.schema.find(s=>s.name==='data_processing').schema;
  assert.equal(fields.some(s=>s.name==='aggregation_method'),period!=='none');
  assert.ok(fields.some(s=>s.name==='aggregation_period'));
  assert.equal(form.data.aggregation_method,'delta');
 }
 const sensorForm={};e._bind(sensorForm,C.getSeriesConfigForm(),{});assert.ok(sensorForm.schema.length);
});
test('method visibility refreshes before emitting period changes without requiring wrapper feedback',()=>{
 const e=new E();let rendered=false;e._render=()=>{rendered=true};
 e._data=e._editorConfig({entities:['sensor.a'],aggregation_period:'none',aggregation_method:'delta'});
 const previous=globalThis.CustomEvent;globalThis.CustomEvent=class{constructor(type,options){this.detail=options.detail}};
 e.dispatchEvent=ev=>{assert.ok(rendered);assert.equal(ev.detail.config.aggregation_method,'delta');assert.equal(ev.detail.config.aggregation_period,'none')};
 try{e._emit()}finally{globalThis.CustomEvent=previous}
});
test('blank card opens editor safely, malformed entity arrays are rejected, config clearing cancels refresh',()=>{
 const c=fixture();c._timer=setTimeout(()=>{},10000);c._timer.unref();c.setConfig({entities:[]});
 assert.equal(c._timer,null);assert.match(c.shadowRoot.innerHTML,/Select a sensor|Kies een sensor/);
 assert.throws(()=>c.setConfig({entities:'sensor.a'}));
});
