import {test} from 'node:test';
import assert from 'node:assert/strict';
import {graphPeriodRange,chooseCustomGraphPeriod,chooseGraphPeriod,moveGraphPeriod,resetGraphPeriod,connectTimeframeSync,disconnectTimeframeSync,periodDateTime,parsePeriodDateTime} from '../shared/periods.js';
import {periodControls} from '../shared/period-controls.js';
const H=3600000,now=Date.parse('2026-10-26T12:00:00Z');
function host(hours=24){const h={_connected:true,_config:{hours_to_show:hours,sync_timeframe:true,hover_sync_group:'custom-period'},_hass:{config:{time_zone:'Europe/Amsterdam'}},_status:'ready',shadowRoot:{querySelector:()=>null},reloads:0,_reloadPeriod(){this.reloads++;}};resetGraphPeriod(h);return h;}
test('custom ranges stay fixed, share exact bounds across cards and restore individual defaults',t=>{
 t.mock.method(Date,'now',()=>now);const a=host(),b=host(168);connectTimeframeSync(a);connectTimeframeSync(b);
 try{
  const range={start:now-5*H-15*60000,end:now-3*H};assert.equal(chooseCustomGraphPeriod(a,range.start,range.end),true);
  assert.deepEqual(graphPeriodRange(a,now+H),range);assert.deepEqual(graphPeriodRange(b,now+H),range);assert.equal(a.reloads,1);assert.equal(b.reloads,1);
  const picker=periodControls(b,'nl').picker;assert.match(picker,/26 okt · 07:45–10:00/);assert.match(picker,/type="datetime-local"/);assert.doesNotMatch(picker,/data-period-option="custom"/);
  moveGraphPeriod(b,-1);assert.deepEqual(graphPeriodRange(a),{start:range.start-2.25*H,end:range.start});
  moveGraphPeriod(a,1);assert.deepEqual(graphPeriodRange(b),range);
  moveGraphPeriod(a,0);assert.equal(graphPeriodRange(b).end,now);assert.equal(graphPeriodRange(b).end-graphPeriodRange(b).start,2.25*H);
  assert.match(periodControls(b).navigation,/data-period="next"[^>]* disabled/);
  chooseGraphPeriod(b,'configured');for(const h of [a,b])assert.equal(graphPeriodRange(h).end-graphPeriodRange(h).start,h._config.hours_to_show*H);
 }finally{disconnectTimeframeSync(a);disconnectTimeframeSync(b);}
});
test('invalid ranges never reload or overwrite the previous selection; subhour and leap-year ranges work',()=>{
 const h=host();for(const [a,b]of [[NaN,now],[now,now],[now,now-1],[now-367*24*H,now]])assert.equal(chooseCustomGraphPeriod(h,a,b),false);
 assert.equal(h.reloads,0);assert.equal(h._periodMode,'configured');assert.equal(chooseCustomGraphPeriod(h,now-60000,now),true);assert.equal(graphPeriodRange(h).start,now-60000);
 assert.equal(chooseCustomGraphPeriod(h,now-366*24*H,now),true);
});
test('datetime inputs use the HA timezone, reject DST gaps and invalid dates, and preserve repeated-time bounds',()=>{
 const z='Europe/Amsterdam';assert.equal(periodDateTime(Date.parse('2026-10-26T12:00:00Z'),z),'2026-10-26T13:00');
 for(const value of ['','2026-02-30T12:00','2026-03-29T02:30','2026-10-26T24:00','bad'])assert.ok(Number.isNaN(parsePeriodDateTime(value,z)),value);
 assert.equal(parsePeriodDateTime('2026-10-25T02:30',z,'start'),Date.parse('2026-10-25T00:30Z'));
 assert.equal(parsePeriodDateTime('2026-10-25T02:30',z,'end'),Date.parse('2026-10-25T01:30Z'));
 const later=Date.parse('2026-10-25T01:30:18.123Z');assert.equal(parsePeriodDateTime('2026-10-25T02:30',z,'start',later),later);
 assert.equal(parsePeriodDateTime('2026-10-26T13:00','Asia/Kathmandu'),Date.parse('2026-10-26T07:15Z'));
});
test('custom drafts survive renders with escaped values and no stale rolling preset',()=>{
 const h=host();h._periodMenuOpen=true;h._periodTab='custom';h._periodCustomDraft={start:'2026-10-20T12:00',end:'2026-10-21T12:00',error:'End < start'};
 const markup=periodControls(h).picker;assert.match(markup,/data-period-panel="custom">/);assert.match(markup,/value="2026-10-20T12:00"/);assert.match(markup,/End &lt; start/);assert.match(markup,/Custom range/);
 resetGraphPeriod(h);assert.equal(h._periodCustomDraft,null);assert.equal(h._periodTab,null);
});
test('picker opens the category of its selected range and preserves the browsed tab during refresh',t=>{
 t.mock.method(Date,'now',()=>now);const h=host();
 for(const [selection,expected]of [['configured','rolling'],['7d','rolling'],['month','calendar']]){
  chooseGraphPeriod(h,selection);const markup=periodControls(h,'nl').picker;
  assert.match(markup,new RegExp(`aria-selected="true" tabindex="0" data-period-tab="${expected}"`));
  assert.match(markup,new RegExp(`data-period-panel="${expected}">`));
  assert.equal((markup.match(/data-period-panel="[^"]+" hidden/g)||[]).length,2);
 }
 chooseCustomGraphPeriod(h,now-2*H,now-H);assert.match(periodControls(h).picker,/data-period-panel="custom">/);
 h._periodMenuOpen=true;h._periodTab='rolling';assert.match(periodControls(h).picker,/data-period-panel="rolling">/);
 assert.equal(h._periodMode,'custom');assert.equal(h._periodCustomDraft,null);
});

test('synchronized calendar selections never become rolling options with the sending card default',()=>{
 const a=host(12),b=host(168);a._config.hover_sync_group=b._config.hover_sync_group='calendar-picker-regression';
 connectTimeframeSync(a);connectTimeframeSync(b);
 try{
  for(const mode of ['today','week','month','quarter','year']){
   chooseGraphPeriod(a,mode);
   for(const card of [a,b]){
    const markup=periodControls(card,'nl').picker;
    const rolling=markup.match(/aria-label="Afgelopen">([^]*?)<\/div>/)[1];
    assert.equal((rolling.match(/data-period-option=/g)||[]).length,10,`${mode}: only rolling presets belong under Last`);
    assert.equal((markup.match(new RegExp(`data-period-option="${mode}"`,'g'))||[]).length,1);
    assert.match(markup,new RegExp(`Standaard \\(${card._config.hours_to_show} uur\\)`));
   }
  }
  chooseGraphPeriod(a,'36');
  assert.match(periodControls(b,'nl').picker,/data-period-option="36"><span>36 uur<\/span>/);
 }finally{disconnectTimeframeSync(a);disconnectTimeframeSync(b);}
});
