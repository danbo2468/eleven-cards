import * as periods from '../../../shared/periods.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as utils from '../src/price-utils.js';
import * as graph from '../../../shared/graph.js';
import * as localization from '../src/localization.js';

let Card;
const source = readFileSync(new URL('../src/dynamic-energy-price-card.js', import.meta.url), 'utf8');
vm.runInNewContext(source.replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm, ''), {
  ...periods,...graph, ...utils, ...localization,
  HTMLElement: class { attachShadow() { this.shadowRoot = { querySelector: () => null, querySelectorAll: () => [] }; } },
  customElements: { get: () => undefined, define: (_, constructor) => { Card = constructor; } },
  window: {}, Intl, Date,
});

const base = Date.parse('2026-10-11T00:00:00+02:00');
const points = [-.1, .3, 9, .5, .7].map((price, index) => ({ price, timestamp: base + index * 900000, dayKey: '2026-10-11' }));

test('grouped period average includes only selected adjacent intervals, including negative prices', () => {
  const periods = utils.groupSelectedPeriods(points, new Set([0, 1, 3, 4].map(i => points[i].timestamp)), 15);
  assert.equal(periods.length, 2);
  assert.ok(Math.abs(periods[0].averagePrice - .1) < 1e-12);
  assert.ok(Math.abs(periods[1].averagePrice - .6) < 1e-12);
  assert.equal(utils.groupSelectedPeriods(points, new Set(), 15).length, 0);
});

test('period averages do not bridge missing intervals or local day boundaries', () => {
  const input = [
    { timestamp: base, dayKey: '2026-10-10', price: .1 },
    { timestamp: base + 900000, dayKey: '2026-10-11', price: .2 },
    { timestamp: base + 2700000, dayKey: '2026-10-11', price: -.3 },
  ];
  const periods = utils.groupSelectedPeriods(input, new Set(input.map(p => p.timestamp)), 15);
  assert.deepEqual(periods.map(p => p.averagePrice), [.1, .2, -.3]);
});

test('table headings stay single-line and duration alignment is independent of the average option', () => {
  const card = new Card();
  const periods = utils.groupSelectedPeriods(points, new Set([points[0].timestamp]), 15);
  for (const enabled of [false, true]) {
    card.setConfig({ entity: 'sensor.prices', show_period_average: enabled });
    const html = card._periodTable(periods, [], 'Europe/Amsterdam', '2026-10-11', '2026-10-12');
    assert.match(html, /<th class="period-duration">Duration<\/th>/);
    assert.match(html, /<td class="period-duration">15 min<\/td>/);
    assert.doesNotMatch(html, /<br>/);
    if (enabled) {
      assert.match(html, /<th class="period-average">~ct<\/th>/);
      assert.match(html, /<span class="table-unit">ct\/kWh<\/span>/);
    } else assert.doesNotMatch(html, /table-unit/);
  }
  assert.match(card._styles(), /\.cheapest-table \.period-duration, \.cheapest-table \.period-average \{ text-align: right; \}/);
  assert.doesNotMatch(card._styles(), /\.cheapest-table (?:td|th):last-child/);
});

test('optional average column is off by default and localizes import and corrected export prices', () => {
  const card = new Card();
  card.setConfig({ entity: 'sensor.prices' });
  assert.equal(card._config.show_period_average, false);
  const periods = utils.groupSelectedPeriods(points, new Set([points[0].timestamp, points[1].timestamp]), 15);
  const exportPoints = utils.offsetPriceData(points.slice(0, 2).map(p => ({ start_time: new Date(p.timestamp).toISOString(), price_per_kwh: p.price })), -.12);
  const corrected = utils.normalizePoints(exportPoints, 'Europe/Amsterdam');
  const exports = utils.groupSelectedPeriods(corrected, new Set(corrected.map(p => p.timestamp)), 15);
  const render = () => card._periodTable(periods, exports, 'Europe/Amsterdam', '2026-10-11', '2026-10-12');
  assert.doesNotMatch(render(), /period-average/);
  card.setConfig({ entity: 'sensor.prices', show_period_average: true });
  for (const language of ['en', 'nl']) {
    card._hass = { language };
    const html = render();
    assert.match(html, /~ct/);
    assert.match(html, language === 'en' ? /10\.00/ : /10,00/);
    assert.match(html, language === 'en' ? /-2\.00/ : /-2,00/);
    assert.match(html, /ct\/kWh/);
    assert.equal((html.match(/class="period-average"/g) ?? []).length, 3);
  }
  card.setConfig({ entity: 'sensor.prices', show_period_average: false });
  assert.doesNotMatch(render(), /period-average/);
  const form = Card.getConfigForm();
  const option = form.schema.find(s=>s.name==='table_settings').schema.find(field => field.name === 'show_period_average');
  assert.equal(option.default, false);
  assert.ok(option.selector.boolean);
  assert.equal(form.computeLabel.call({ hass: { language: 'en' } }, option), 'Average price in table');
  assert.match(form.computeHelper.call({ hass: { language: 'nl' } }, option), /periode/);
});
