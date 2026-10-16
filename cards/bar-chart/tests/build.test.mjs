import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('standalone bundle registers only Bar Chart and tolerates duplicate loading',()=>{
 const bundle=readFileSync(new URL('../dist/eleven-bar-chart.js',import.meta.url),'utf8');
 const registry=new Map(),window={};const context=vm.createContext({HTMLElement:class{},window,customElements:{get:n=>registry.get(n),define:(n,c)=>{assert.ok(!registry.has(n));registry.set(n,c);}}});
 vm.runInContext(bundle,context);vm.runInContext(bundle,context);
 assert.deepEqual([...registry.keys()],['eleven-bar-chart']);assert.equal(window.customCards.length,1);assert.doesNotMatch(bundle,/^\s*(import|export) /m);
});
