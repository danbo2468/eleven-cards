import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
test('root HACS manifest selects a single self-contained collection bundle', () => {
  const manifest = JSON.parse(readFileSync(new URL('hacs.json', root), 'utf8'));
  assert.equal(manifest.name, 'Eleven Cards');
  assert.equal(manifest.filename, 'eleven-cards.js');
  assert.equal(manifest.content_in_root, false);
  assert.deepEqual(readdirSync(new URL('dist/', root)), ['eleven-cards.js']);
});

test('HACS collection download registers all cards without imports or duplicate resources', () => {
  const bundle = readFileSync(new URL('dist/eleven-cards.js', root), 'utf8');
  assert.doesNotMatch(bundle, /^\s*(?:import|export)\s/gm);
  const registry = new Map(), window = {};
  const context = vm.createContext({HTMLElement: class {}, window, customElements: {
    get: name => registry.get(name),
    define: (name, card) => { assert.ok(!registry.has(name)); registry.set(name, card); },
  }});
  vm.runInContext(bundle, context);
  vm.runInContext(bundle, context);
  assert.deepEqual([...registry.keys()].sort(), ['eleven-bar-chart', 'eleven-calendar-card', 'eleven-dynamic-energy-price-card', 'eleven-heatmap-card', 'eleven-history-graph-card', 'eleven-overview-card', 'eleven-timeline-card']);
  assert.equal(window.customCards.length, 7);
  for (const type of ['eleven-heatmap-card', 'eleven-calendar-card']) {
    const pickerEntry = window.customCards.find(card => card.type === type);
    assert.match(pickerEntry?.name ?? '', /\(beta\)/i, `${type} should be marked beta in the card picker`);
    assert.equal(pickerEntry.preview, true);
  }
});

test('collection can overlap existing standalone modules safely during migration', () => {
  for (const collectionFirst of [true, false]) {
    const registry = new Map(), window = {};
    const context = vm.createContext({HTMLElement: class {}, window, customElements: {
      get: name => registry.get(name),
      define: (name, card) => { assert.ok(!registry.has(name)); registry.set(name, card); },
    }});
    const paths = ['cards/calendar-card/dist/eleven-calendar-card.js', 'cards/heatmap-card/dist/eleven-heatmap-card.js', 'cards/bar-chart/dist/eleven-bar-chart.js', 'cards/overview-card/dist/eleven-overview-card.js', 'cards/dynamic-energy-price-card/dist/eleven-dynamic-energy-price-card.js', 'cards/history-graph-card/dist/eleven-history-graph-card.js', 'cards/timeline-card/dist/eleven-timeline-card.js'];
    paths[collectionFirst ? 'unshift' : 'push']('dist/eleven-cards.js');
    for (const path of paths) vm.runInContext(readFileSync(new URL(path, root), 'utf8'), context);
    assert.equal(registry.size, 7);
    assert.equal(window.customCards.length, 7);
  }
});
