import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
for (const [slug,name] of [['dynamic-energy-price-card','Eleven Dynamic Energy Price Card'],['history-graph-card','Eleven History Graph Card']]) {
 test(`${name} registers only its Eleven type and picker name`,()=>{
  const root=new URL(`../cards/${slug}/`,import.meta.url);
  execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});
  const registry=new Map();const window={};
  const code=readFileSync(new URL(`dist/eleven-${slug}.js`,root),'utf8');
  const context=vm.createContext({HTMLElement:class{},window,customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)}});
  vm.runInContext(code,context);
  assert.ok(registry.has(`eleven-${slug}`));
  assert.equal(registry.has(slug),false);
  assert.equal(window.customCards[0].type,`eleven-${slug}`);
  assert.equal(window.customCards[0].name,name);
  vm.runInContext(code,context);
  assert.equal(window.customCards.length,1);
 });
}
