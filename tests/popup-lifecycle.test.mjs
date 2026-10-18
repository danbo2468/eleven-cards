import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindChartInsights,disconnectChartInsights} from '../shared/chart-insights.js';
import {bindPeriodControls,disconnectPeriodControls,periodControls} from '../shared/period-controls.js';

// Document capture listeners run before bubble listeners, even when registered
// later. A restored popup has a capture listener for its pending focus state.
function events(){
 const listeners=[];
 return {
  addEventListener(type,fn,capture=false){listeners.push({type,fn,capture});},
  removeEventListener(type,fn,capture=false){const i=listeners.findIndex(l=>l.type===type&&l.fn===fn&&l.capture===capture);if(i>=0)listeners.splice(i,1);},
  dispatch(type,path=[]){for(const capture of [true,false])for(const l of [...listeners])if(l.type===type&&l.capture===capture)l.fn({composedPath:()=>path});}
 };
}
function fixture(t,native,kind){
 const win=Object.assign(events(),{innerWidth:800,innerHeight:300}),doc=events();
 const replaceGlobal=(key,value)=>{const previous=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});t.after(()=>{if(previous)Object.defineProperty(globalThis,key,previous);else delete globalThis[key];});};
 replaceGlobal('window',win);replaceGlobal('document',doc);
 let notify;replaceGlobal('ResizeObserver',class{constructor(fn){notify=fn;}observe(){}disconnect(){}});
 let ready,laidOut=false,visible=false,scroll=0;
 const attrs=new Map(),trigger={dataset:{insight:'data'},setAttribute:(k,v)=>attrs.set(k,v),getBoundingClientRect:()=>laidOut?{left:400,right:600,top:80,bottom:112,width:200,height:32}:{width:0,height:0},focus(){}};
 const close={focus(){}};
 const popup={style:{},dataset:{insightPanel:'data'},addEventListener(){},querySelector:()=>close,querySelectorAll:()=>[],matches:()=>visible,hasAttribute:()=>visible,setAttribute:()=>{visible=true;},removeAttribute:()=>{visible=false;},getBoundingClientRect:()=>({height:284})};
 if(native){popup.showPopover=()=>{visible=true;};popup.hidePopover=()=>{visible=false;};}
 // A hidden menu has no scrolling box. Height must also be constrained before
 // restoring scroll; setting it on a hidden/unconstrained menu clamps to zero.
 Object.defineProperty(popup,'scrollTop',{get:()=>visible?scroll:0,set:value=>{scroll=visible&&popup.style.maxHeight==='284px'?value:0;}});
 const control={querySelector:selector=>selector.includes('popup')||selector==='.period-menu'?popup:trigger};
 const root={activeElement:null,querySelector:selector=>selector==='ha-card'?{updateComplete:new Promise(r=>ready=r)}:selector==='.period-controls'?control:selector==='.period-menu'||selector.startsWith('[data-insight-panel')?popup:trigger,querySelectorAll:selector=>selector==='.insight-control'?[control]:selector==='.insight-popup'?[popup]:[]};
 const host={_config:{hours_to_show:24},shadowRoot:root};
 if(kind==='insight')Object.assign(host,{_insightOpen:'data',_insightFocus:{key:'data',inside:true}});
 else Object.assign(host,{_periodMenuOpen:true,_periodMenuScroll:180,_periodFocus:'option:today'});
 return {host,popup,trigger,control,doc,win,open:()=>visible,layout:async()=>{laidOut=true;ready();await Promise.resolve();},resize:()=>notify(),dispose:()=>kind==='insight'?disconnectChartInsights(host):disconnectPeriodControls(host)};
}

for(const native of [true,false]){
 const mode=native?'native':'fallback';
 test(`${mode}: restored information closes on outside click after deferred layout`,async t=>{
  const f=fixture(t,native,'insight');bindChartInsights(f.host);
  assert.equal(f.open(),false);await f.layout();assert.equal(f.open(),true);
  f.doc.dispatch('pointerdown',[f.popup,f.control,f.host]);assert.equal(f.open(),true,'inside click keeps the popup open');
  f.doc.dispatch('pointerdown',[]);
  if(native)f.popup.hidePopover(); // Browser's native light dismissal.
  assert.equal(f.open(),false);assert.equal(f.host._insightOpen,null);assert.equal(f.host._insightPending,null);
  f.resize();assert.equal(f.open(),false,'late layout cannot reopen a dismissed popup');f.dispose();
 });
 for(const repeat of [false,true])test(`${mode}: timeframe scroll survives ${repeat?'repeated pending renders':'deferred opening'} and is restored only once`,async t=>{
  const f=fixture(t,native,'period');bindPeriodControls(f.host);
  for(let i=0;i<(repeat?3:0);i++){
   periodControls(f.host);assert.equal(f.host._periodMenuScroll,180,'hidden replacements do not overwrite saved scroll');
   bindPeriodControls(f.host);
  }
  await f.layout();assert.equal(f.open(),true);assert.equal(f.popup.scrollTop,180);
  f.popup.scrollTop=120;f.resize();assert.equal(f.popup.scrollTop,120,'resize does not reset user scrolling');
  periodControls(f.host);assert.equal(f.host._periodMenuScroll,120,'capture updated visible scroll');f.dispose();
 });
 test(`${mode}: outside click cancels a restored information popup before layout`,async t=>{
  const f=fixture(t,native,'insight');bindChartInsights(f.host);f.doc.dispatch('pointerdown',[]);
  await f.layout();f.resize();assert.equal(f.open(),false);assert.equal(f.host._insightOpen,null);assert.equal(f.host._insightPending,null);f.dispose();
 });
}
