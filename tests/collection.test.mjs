import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';

const slugs=['dynamic-energy-price-card','history-graph-card','timeline-card','bar-chart'];
test('both Eleven modules coexist in either load order and tolerate repeat loads',()=>{
 for(const order of [slugs,[...slugs].reverse()]) {
  const registry=new Map(),window={};
  const context=vm.createContext({HTMLElement:class{},window,customElements:{get:n=>registry.get(n),define:(n,c)=>{assert.ok(!registry.has(n));registry.set(n,c);}}});
  for(const slug of [...order,...order]) vm.runInContext(readFileSync(new URL(`../cards/${slug}/dist/eleven-${slug}.js`,import.meta.url),'utf8'),context);
  assert.equal(registry.size,4);
  assert.deepEqual(Array.from(window.customCards,c=>c.type).sort(),slugs.map(s=>`eleven-${s}`).sort());
 }
});
test('README relative links and images resolve and examples use Eleven types',()=>{
 for(const rel of ['README.md',...slugs.map(s=>`cards/${s}/README.md`)]) {
  const url=new URL(`../${rel}`,import.meta.url),text=readFileSync(url,'utf8');
  for(const match of text.matchAll(/\]\(([^)]+)\)|src="([^"]+)"/g)) {
   const target=match[1]??match[2];
   if(/^[a-z]+:|^#/i.test(target))continue;
   assert.ok(existsSync(new URL(target.split('#')[0],url)),`${rel}: ${target}`);
  }
  if(rel!=='README.md')assert.doesNotMatch(text,/type: custom:(?:dynamic-energy-price-card|history-graph-card)/);
 }
});
