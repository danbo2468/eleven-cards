import {test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readFileSync} from 'node:fs';import vm from 'node:vm';
test('build produces standalone browser artifact with native card registration and no imports',()=>{
 execFileSync(process.execPath,['scripts/build.mjs'],{cwd:new URL('..',import.meta.url)});
 const code=readFileSync(new URL('../dist/eleven-history-graph-card.js',import.meta.url),'utf8');assert.doesNotMatch(code,/^import |^export /m);
 const registered=new Map();const window={};vm.runInNewContext(code,{HTMLElement:class{},window,customElements:{get:n=>registered.get(n),define:(n,c)=>registered.set(n,c)}});
 assert.ok(registered.has('eleven-history-graph-card'));assert.equal(window.customCards[0].type,'eleven-history-graph-card');
});
