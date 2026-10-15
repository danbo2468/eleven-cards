import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function setup(){
 const registry=new Map(),window=new EventTarget();window.innerHeight=800;
 const node=()=>({hidden:true,style:{},getBoundingClientRect:()=>({left:0,top:0,width:200,height:80})});
 class Element {isConnected=true;attachShadow(){const tooltip=node(),guide=node(),chart={querySelector:s=>s==='.tooltip'?tooltip:guide,getBoundingClientRect:()=>({left:0,top:0,width:600,height:100})};this.shadowRoot={innerHTML:'',querySelector:s=>s==='.chart'?chart:s==='.tooltip'?tooltip:s==='.guide'?guide:null,querySelectorAll:()=>[]};}}
 const ctx=vm.createContext({HTMLElement:Element,window,CustomEvent,customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},setTimeout,clearTimeout,URLSearchParams,Date,Intl});
 vm.runInContext(readFileSync(new URL('../cards/timeline-card/dist/eleven-timeline-card.js',import.meta.url),'utf8'),ctx);
 const Card=registry.get('eleven-timeline-card');const make=(config={})=>{const c=new Card();c.setConfig({entities:['switch.a'],...config});c._start=0;c._end=3600000;c._viewStart=0;c._viewEnd=3600000;c._series=[[{start:0,end:3600000,state:'on'}]];c._refresh=()=>{};c.connectedCallback();return c;};return {Card,make,window};
}
test('timeline publishes and receives exact shared timestamps without echo, groups isolate and source clears',()=>{
 const {make,window}=setup(),a=make(),b=make(),separate=make({hover_sync_group:'other'}),off=make({sync_hover:false});let events=0;window.addEventListener('eleven-cards:hover-sync',()=>events++);
 a._showTooltip(1234567);assert.equal(b._cursor,1234567);assert.equal(events,1);assert.equal(separate._cursor,null);assert.equal(off._cursor,null);
 b._hideTooltip();assert.equal(a._cursor,1234567);a._hideTooltip();assert.equal(b._cursor,null);
 a._showTooltip(2000000);b._viewEnd=1000000;b._receiveHover(2000000);assert.equal(b._cursor,null);
 a.disconnectedCallback();assert.equal(b._cursor,null);for(const c of [b,separate,off])c.disconnectedCallback();
});
test('timeline editor exposes matching sync defaults and validates values',()=>{const {Card,make}=setup();const fields=Card.getConfigForm().schema.flatMap(x=>x.schema??[x]);assert.ok(fields.find(x=>x.name==='sync_hover'));assert.ok(fields.find(x=>x.name==='hover_sync_group'));assert.equal(Card.editorConfig({entities:['switch.a']}).sync_hover,true);assert.equal(Card.editorConfig({entities:['switch.a']}).hover_sync_group,'');assert.throws(()=>make({sync_hover:'yes'}));assert.throws(()=>make({hover_sync_group:12}));});
