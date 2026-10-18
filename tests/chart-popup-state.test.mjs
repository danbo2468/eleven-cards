import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureChartInsights} from '../shared/chart-insights.js';
import {periodControls} from '../shared/period-controls.js';
import {closeOtherCardPopups} from '../shared/card-header.js';

for(const native of [true,false]){
 test(`${native?'native':'fallback'}: capture retains an opening request while ha-card layout is pending`,()=>{
  const panel={scrollTop:0,showPopover:native?()=>{}:undefined,matches:()=>false,hasAttribute:()=>false,removeAttribute(){},setAttribute(){}};
  const host={_periodMenuOpen:true,_periodMenuPending:true,_periodFocus:'option:today',_insightOpen:'data',_insightPending:'data',_insightFocus:{key:'data',inside:true},_config:{hours_to_show:24},shadowRoot:{querySelector:()=>panel,querySelectorAll:()=>[panel]}};
  periodControls(host);captureChartInsights(host);assert.equal(host._periodMenuOpen,true);assert.equal(host._periodFocus,'option:today');assert.equal(host._insightOpen,'data');assert.equal(host._insightFocus.inside,true);
  closeOtherCardPopups(host,'period');assert.equal(host._insightPending,null);
  closeOtherCardPopups(host,'insight');assert.equal(host._periodMenuPending,false);
 });
 for(const kind of ['period','insight'])test(`${native?'native':'fallback'}: opening ${kind} synchronously dismisses the other popup and its restore state`,()=>{
  let visible=true,expanded=true;
  const panel={showPopover:native?()=>{}:undefined,matches:()=>visible,hidePopover:()=>{visible=false;},removeAttribute:()=>{visible=false;}};
  const trigger={setAttribute:(key,value)=>{if(key==='aria-expanded')expanded=value==='true';}};
  const host={_periodMenuOpen:true,_periodFocus:'option:today',_insightOpen:'data',_insightFocus:{key:'data',inside:true},shadowRoot:{querySelectorAll:selector=>selector.startsWith('.')?[panel]:[trigger]}};
  closeOtherCardPopups(host,kind);assert.equal(visible,false);assert.equal(expanded,false);
  if(kind==='period'){assert.equal(host._insightOpen,null);assert.equal(host._insightFocus,null);assert.equal(host._periodMenuOpen,true);}
  else{assert.equal(host._periodMenuOpen,false);assert.equal(host._periodFocus,null);assert.equal(host._insightOpen,'data');}
 });
 test(`${native?'native':'fallback'}: capture clears dismissed information and stale focus before a pending toggle event`,()=>{
  const popup={dataset:{insightPanel:'data'},showPopover:native?()=>{}:undefined,matches:()=>false,hasAttribute:()=>false};
  const host={_insightOpen:'data',_insightFocus:{key:'data',inside:true},shadowRoot:{activeElement:{closest:()=>null},querySelectorAll:()=>[popup]}};
  captureChartInsights(host);assert.equal(host._insightOpen,null);assert.equal(host._insightFocus,null);
 });
 test(`${native?'native':'fallback'}: an actually open information popup survives refresh`,()=>{
  const popup={dataset:{insightPanel:'data'},showPopover:native?()=>{}:undefined,matches:()=>true,hasAttribute:()=>true};
  const host={shadowRoot:{querySelectorAll:()=>[popup]}};captureChartInsights(host);assert.equal(host._insightOpen,'data');
 });
 test(`${native?'native':'fallback'}: a dismissed period menu is not restored from stale state`,()=>{
  const menu={scrollTop:0,showPopover:native?()=>{}:undefined,matches:()=>false,hasAttribute:()=>false};
  const host={_periodMenuOpen:true,_config:{hours_to_show:24},shadowRoot:{querySelector:()=>menu}};
  periodControls(host);assert.equal(host._periodMenuOpen,false);
 });
}
