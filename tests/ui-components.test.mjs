import {test} from 'node:test';
import assert from 'node:assert/strict';
import {uiButton,uiAttributes} from '../shared/ui-button.js';
import {uiTabs,bindUITabs} from '../shared/ui-tabs.js';
import {uiPopup,bindUIPopup} from '../shared/ui-popup.js';
import {uiLegend,bindUILegend,cancelUILegendClicks} from '../shared/ui-legend.js';

test('legend renders reusable buttons with escaped metadata and caller-owned swatches',()=>{
 const markup=uiLegend({items:[{id:'calendar.a"',visible:false,title:'Show <agenda>',attrs:{'data-calendar':'calendar.a"'},content:'<i class="dot"></i><span>Agenda</span>'}]});
 assert.match(markup,/<div class="legend"><button type="button" class="legend-item"/);
 assert.match(markup,/data-calendar="calendar.a&quot;" data-ui-legend="calendar.a&quot;" aria-pressed="false" title="Show &lt;agenda&gt;"/);
 assert.match(markup,/<i class="dot"><\/i><span>Agenda<\/span>/);
});

test('legend binder keeps a pending click across a rerender and cancels it on disconnect',async()=>{
 const button={dataset:{uiLegend:'calendar.a'},setAttribute(){},focus(){}},calls=[];
 const host={_config:{},shadowRoot:{querySelectorAll:()=>[button]}};
 const bind=()=>bindUILegend(host,{hint:'Only this calendar',toggle:id=>calls.push('toggle '+id),isolate:id=>calls.push('isolate '+id)});
 bind();button.onclick({detail:1});bind();await new Promise(resolve=>setTimeout(resolve,350));
 assert.deepEqual(calls,['toggle calendar.a']);
 button.onclick({detail:1});cancelUILegendClicks(host);await new Promise(resolve=>setTimeout(resolve,350));
 assert.deepEqual(calls,['toggle calendar.a']);
 button.onclick({detail:2,preventDefault(){}});assert.deepEqual(calls,['toggle calendar.a','isolate calendar.a']);
});

test('buttons keep native link/submit semantics and escape text and attribute values',()=>{
 const button=uiButton({text:'<Apply>',type:'submit',disabled:true,label:'A "label"',attrs:{'aria-pressed':false}});
 assert.match(button,/<button type="submit"/);assert.match(button,/&lt;Apply&gt;/);assert.match(button,/aria-label="A &quot;label&quot;"/);
 assert.match(button,/aria-pressed="false"/);assert.match(button,/ disabled>/);
 assert.match(uiButton({href:'/history?x="',text:'History'}),/<a[^>]*href="\/history\?x=&quot;"/);
 assert.equal(uiAttributes({hidden:false,required:true,'data-name':'<sensor>'}),' required data-name="&lt;sensor&gt;"');
 assert.throws(()=>uiAttributes({'bad"name':'x'}));assert.throws(()=>uiAttributes({onclick:'code()'}));
});

test('tabs render independent panel associations with an enabled fallback selection',()=>{
 const markup=uiTabs({id:'settings',label:'Settings',selected:'blocked',items:[{value:'blocked',label:'Blocked',disabled:true},{value:'colours',label:'<Colours>',content:'<input value="draft">'},{value:'other',label:'Other'}]});
 assert.match(markup,/aria-controls="settings-panel-colours" aria-selected="true" tabindex="0"/);
 assert.match(markup,/aria-labelledby="settings-tab-colours" data-ui-tab-panel="colours"><input value="draft">/);
 assert.match(markup,/&lt;Colours&gt;/);assert.equal((markup.match(/ hidden>/g)||[]).length,2);
 assert.throws(()=>uiTabs({id:'duplicate',items:[{value:'a'},{value:'a'}]}));
 assert.throws(()=>uiTabs({id:'ambiguous',items:[{value:1},{value:'1'}]}));
});

test('tab keyboard navigation skips disabled tabs, retains panel content and cleans up handlers',()=>{
 const calls=[],tabs=['first','blocked','last'].map(value=>({dataset:{uiTab:value},disabled:value==='blocked',attrs:{},setAttribute(k,v){this.attrs[k]=v;},focus(){this.focused=true;}}));
 const panels=tabs.map(tab=>({dataset:{uiTabPanel:tab.dataset.uiTab},hidden:true,draft:'untouched'}));
 const control=bindUITabs({tabs,panels,onSelect:value=>calls.push(value)});
 control.select('first',{notify:false});assert.equal(calls.length,0);
 const key={key:'ArrowRight',preventDefault(){},stopPropagation(){}};tabs[0].onkeydown(key);
 assert.deepEqual(calls,['last']);assert.equal(tabs[2].tabIndex,0);assert.equal(tabs[0].tabIndex,-1);assert.equal(panels[2].hidden,false);
 tabs[2].onkeydown({...key,key:'Home'});assert.equal(panels[0].hidden,false);assert.equal(panels[2].draft,'untouched');
 assert.equal(control.select('blocked'),false);control.disconnect();assert.equal(tabs[0].onclick,null);assert.equal(tabs[0].onkeydown,null);
});

function popupFixture(t,native,{deferred=false}={}){
 const restore=(key,value)=>{const previous=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});t.after(()=>{if(previous)Object.defineProperty(globalThis,key,previous);else delete globalThis[key];});};
 const win=Object.assign(new EventTarget(),{innerWidth:320,innerHeight:480}),doc=new EventTarget();restore('window',win);restore('document',doc);
 let notify;restore('ResizeObserver',class{constructor(fn){notify=fn;}observe(){}disconnect(){}});
 const element=()=>Object.assign(new EventTarget(),{attrs:new Map(),style:{},focuses:0,setAttribute(k,v){this.attrs.set(k,v);},removeAttribute(k){this.attrs.delete(k);},hasAttribute(k){return this.attrs.has(k);},focus(){this.focuses++;}});
 let ready,visible=false,laidOut=!deferred;
 const trigger=element(),popup=element(),closeButton=element(),container=element();
 trigger.getBoundingClientRect=()=>laidOut?{left:100,right:300,top:100,bottom:132,width:200,height:32}:{width:0,height:0};
 popup.id='generic-help';popup.getBoundingClientRect=()=>({height:200});popup.querySelector=()=>closeButton;
 if(native){popup.showPopover=()=>{visible=true;};popup.hidePopover=()=>{visible=false;};popup.matches=()=>visible;}
 const counts={opens:0,closes:0,shown:0};
 const controller=bindUIPopup({trigger,popup,container,ready:deferred?new Promise(r=>ready=r):null,onOpen:()=>counts.opens++,onClose:()=>counts.closes++,onShown:()=>counts.shown++});
 const dispatch=(target,type,extra={})=>{const event=Object.assign(new Event(type,{cancelable:true}),extra);target.dispatchEvent(event);return event;};
 return {controller,trigger,popup,closeButton,container,counts,resize:()=>notify(),layout:async()=>{laidOut=true;ready();await Promise.resolve();},outside:()=>dispatch(doc,'pointerdown',{composedPath:()=>[]}),inside:()=>dispatch(doc,'pointerdown',{composedPath:()=>[popup,container]}),key:key=>dispatch(popup,'keydown',{key}),toggle:newState=>dispatch(popup,'toggle',{newState})};
}

test('popup shell supplies escaped heading, native dialog and an accessible close control',()=>{
 const markup=uiPopup({id:'help',title:'<Help>',closeLabel:'Sluiten',content:'<p>Body</p>'});
 assert.match(markup,/popover="auto" role="dialog"/);assert.match(markup,/<strong>&lt;Help&gt;<\/strong>/);
 assert.match(markup,/data-ui-popup-close="" aria-label="Sluiten"/);assert.match(markup,/<p>Body<\/p>/);
 assert.match(markup,/<svg viewBox="0 0 24 24"[^>]*><path d="M6 6l12 12M18 6 6 18"\/><\/svg>/);
});

for(const native of [true,false]){
 test(`${native?'native':'fallback'}: generic popup opens, focuses, handles Escape and disconnects`,t=>{
  const f=popupFixture(t,native);f.trigger.onclick();assert.equal(f.controller.isOpen(),true);assert.equal(f.closeButton.focuses,1);assert.equal(f.trigger.attrs.get('aria-expanded'),'true');
  assert.equal(f.trigger.attrs.get('aria-haspopup'),'dialog');assert.equal(f.trigger.attrs.get('aria-controls'),'generic-help');
  assert.equal(f.popup.style.width,'304px');f.inside();assert.equal(f.controller.isOpen(),true);
  assert.equal(f.key('Escape').defaultPrevented,true);assert.equal(f.controller.isOpen(),false);assert.equal(f.trigger.focuses,1);
  f.controller.open(false);assert.equal(f.closeButton.focuses,1);f.closeButton.onclick();assert.equal(f.controller.isOpen(),false);
  f.controller.disconnect();assert.equal(f.trigger.onclick,null);assert.equal(f.closeButton.onclick,null);
 });
 test(`${native?'native':'fallback'}: outside click or disconnect cancels opening before layout`,async t=>{
  const f=popupFixture(t,native,{deferred:true});f.controller.open();assert.equal(f.controller.isOpen(),false);
  f.outside();await f.layout();f.resize();assert.equal(f.controller.isOpen(),false);assert.equal(f.counts.shown,0);f.controller.disconnect();
 });
}
test('native light dismissal clears state and pointer-down prevents reopening on the same click',t=>{
 const f=popupFixture(t,true);f.controller.open();f.trigger.onpointerdown();f.popup.hidePopover();f.toggle('closed');
 assert.equal(f.counts.closes,1);assert.equal(f.trigger.attrs.get('aria-expanded'),'false');f.trigger.onclick();assert.equal(f.controller.isOpen(),false);f.controller.disconnect();
});
test('fallback popup closes on an outside click after opening',t=>{
 const f=popupFixture(t,false);f.controller.open();f.outside();assert.equal(f.controller.isOpen(),false);f.controller.disconnect();
});
test('disconnect prevents a delayed layout from opening a detached popup',async t=>{
 const f=popupFixture(t,true,{deferred:true});f.controller.open();f.controller.disconnect();await f.layout();f.resize();assert.equal(f.counts.shown,0);
});
