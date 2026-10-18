import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindCardPopupPosition} from '../shared/card-header.js';

function fixture({width=900,height=700}={}){
 globalThis.window={innerWidth:width,innerHeight:height};
 let resolve,notify,box={width:0,height:0,left:0,right:0,top:0,bottom:0},open=true,disconnected=false,shown=0;
 globalThis.ResizeObserver=class{constructor(fn){notify=fn;}observe(){}disconnect(){disconnected=true;}};
 const popup={style:{},getBoundingClientRect:()=>({height:300})},trigger={getBoundingClientRect:()=>box};
 const host={shadowRoot:{querySelector:()=>({updateComplete:new Promise(r=>resolve=r)})}};
 const placement=bindCardPopupPosition(host,trigger,popup,()=>open,()=>shown++);
 return {placement,popup,resolve,notify,setBox:value=>{box=value;},setOpen:value=>{open=value;},disconnected:()=>disconnected,shown:()=>shown};
}
const box={left:600,right:750,top:100,bottom:132,width:150,height:32};

test('popup waits for ha-card rendering instead of positioning at the origin',async()=>{
 const f=fixture();f.placement.position();assert.equal(f.popup.style.visibility,'hidden');assert.equal(f.popup.style.left,undefined);
 assert.equal(f.shown(),0,'native popover is not opened before its trigger has layout');
 f.setBox(box);f.resolve();await Promise.resolve();
 assert.equal(f.popup.style.left,'370px');assert.equal(f.popup.style.top,'138px');assert.equal(f.popup.style.visibility,'');
 assert.equal(f.shown(),1);
 f.placement.disconnect();
});
test('resize observation recovers delayed layout and keeps the popup within a narrow viewport',()=>{
 const f=fixture({width:320,height:400});f.placement.position();
 f.setBox({...box,left:150,right:300,top:350,bottom:382});f.notify();
 assert.equal(f.popup.style.left,'8px');assert.equal(f.popup.style.top,'44px');assert.equal(f.popup.style.width,'304px');
 f.placement.disconnect();assert.equal(f.disconnected(),true);
});
test('closed or replaced popups ignore late layout notifications',async()=>{
 for(const dispose of [false,true]){
  const f=fixture();f.placement.position();f.setBox(box);
  if(dispose)f.placement.disconnect();else f.setOpen(false);
  f.resolve();await Promise.resolve();f.notify();assert.equal(f.popup.style.left,undefined);assert.equal(f.shown(),0);
  f.placement.disconnect();
 }
});
