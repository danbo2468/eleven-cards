import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class{attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null};}};
globalThis.customElements={get:()=>undefined,define:()=>{}};globalThis.window={};globalThis.document={querySelector:()=>null};
const {HistoryGraphCard:C,HistoryGraphEditor:E}=await import('../src/history-graph-card.js');
test('History exposes unchanged axis and editor contracts for companion chart adapters',()=>{
 const c=new C(),series=[{id:'sensor.a',points:[{t:0,v:20}]}],meta={items:[{unit:'W'}]};
 c._config={};c._start=0;c._end=100;
 assert.equal(typeof c._getGraphAxes,'function');
 assert.ok(c._getGraphAxes(series,meta,[true]).axes[0].min>0);
 assert.equal(typeof E.prototype._editorConfig,'function');
 const e=new E();assert.equal(e._editorConfig({entities:['sensor.a']}).aggregation_period,'none');
});
