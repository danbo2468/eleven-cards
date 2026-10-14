import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const module = await import('../shared/graph.js').catch(() => ({}));
test('shared reveal waits for attachment, resumes replacement and never replays completion', () => {
  const graph = new module.SharedGraph();
  let animation;
  const host = {isConnected:false,shadowRoot:{querySelector:()=>animation?{getAnimations:()=>[animation]}:null}};
  const options = {viewBox:'0 0 1000 300',lines:[{d:'M 0 10 H 20',className:'series-line',appearance:{stroke:'black',...module.graphLineStyle('solid')}}]};
  assert.doesNotMatch(graph.render(host,options),/chart-enter/);
  host.isConnected=true;
  assert.match(graph.render(host,options),/chart-series chart-enter/);
  animation={animationName:'chart-reveal',playState:'running',currentTime:180};
  assert.match(graph.render(host,options),/chart-enter/);
  animation.currentTime=0;
  graph.restore(host);
  assert.equal(animation.currentTime,180);
  animation.currentTime=650;animation.playState='finished';
  assert.doesNotMatch(graph.render(host,options),/chart-enter/);
  animation=undefined;
  assert.doesNotMatch(graph.render(host,options),/chart-enter/);
  host.isConnected=false;
  assert.doesNotMatch(graph.render(host,options),/chart-enter/);
  host.isConnected=true;
  assert.doesNotMatch(graph.render(host,options),/chart-enter/);
});
test('both independent bundles use the same renderer and keep domain logic in adapters', () => {
  for (const [card,file] of [['dynamic-energy-price-card','dynamic-energy-price-card'],['history-graph-card','history-graph-card']]) {
    const source=readFileSync(new URL(`../cards/${card}/src/${file}.js`,import.meta.url),'utf8');
    assert.match(source,/import \{SharedGraph,graphLineStyle,graphStyles\} from '\.\.\/\.\.\/\.\.\/shared\/graph.js'/);
    assert.match(source,/\.render\(this,/);
    assert.match(source,/\.restore\(this\)/);
    assert.doesNotMatch(source,/@keyframes chart-reveal/);
    assert.doesNotMatch(source,/<path[^\n]*class="(?:price-line|series-line)/);
    const bundle=readFileSync(new URL(`../cards/${card}/dist/eleven-${file}.js`,import.meta.url),'utf8');
    assert.match(bundle,/class SharedGraph/);
    assert.doesNotMatch(bundle,/^import /m);
    assert.ok(bundle.includes(readFileSync(new URL('../shared/graph.js',import.meta.url),'utf8').replace(/^export /gm,'')));
  }
});
test('shared graph renders supplied geometry, fills, layers and energy line styles without domain knowledge', () => {
  assert.equal(typeof module.SharedGraph, 'function', 'shared graph component is missing');
  const graph = new module.SharedGraph();
  const host = {isConnected:false,shadowRoot:{querySelector:()=>null}};
  const html = graph.render(host,{viewBox:'0 0 1000 300',defs:'<defs id="adapter-colors"/>',before:'<g id="annotation"/>',after:'<g id="cursor"/>',fills:[{d:'M 0 300 L 20 200 Z',className:'series-fill',fill:'#123456',opacity:.18}],lines:[{d:'M 0 20 H 250 M 500 40 H 1000',className:'series-line',entity:'sensor.a',appearance:{stroke:'#abcdef',...module.graphLineStyle('dotted',6)}}]});
  assert.match(html,/<svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">/);
  assert.match(html,/M 0 20 H 250 M 500 40 H 1000/);
  assert.match(html,/stroke-width="6" stroke-dasharray="1 7" stroke-linecap="round"/);
  assert.ok(html.indexOf('adapter-colors') < html.indexOf('annotation'));
  assert.ok(html.indexOf('series-fill') < html.indexOf('series-line'));
  assert.ok(html.indexOf('series-line') < html.indexOf('cursor'));
  assert.doesNotMatch(html,/chart-enter/);
  assert.deepEqual(module.graphLineStyle('dashed',3.5),{style:'dashed',width:3.5,dash:'8 7',cap:'butt'});
  assert.match(module.graphStyles(),/vector-effect: non-scaling-stroke/);
  assert.match(module.graphStyles(),/chart-reveal 650ms/);
  assert.doesNotMatch(readFileSync(new URL('../shared/graph.js',import.meta.url),'utf8'),/cheapest|tariff|recorder|price-line-gradient/);
});
