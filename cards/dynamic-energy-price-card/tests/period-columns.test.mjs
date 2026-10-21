import * as periodTools from '../../../shared/periods.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as utils from '../src/price-utils.js';
import * as graph from '../../../shared/graph.js';
import * as localization from '../src/localization.js';
let Card;
vm.runInNewContext(readFileSync(new URL('../src/dynamic-energy-price-card.js', import.meta.url), 'utf8').replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm, ''), {
  ...periodTools,...graph, ...utils, ...localization,
  HTMLElement: class { attachShadow() { this.shadowRoot = { querySelector: () => null, querySelectorAll: () => [] }; } },
  customElements: { get: () => undefined, define: (_, constructor) => { Card = constructor; } }, window: {}, Intl, Date,
});
const periods = [
  { dayKey: '2026-10-14', startTimestamp: Date.parse('2026-10-14T12:00:00Z'), endTimestamp: Date.parse('2026-10-14T13:00:00Z'), durationMinutes: 60, averagePrice: .123 },
  { dayKey: '2026-10-15', startTimestamp: Date.parse('2026-10-15T12:00:00Z'), endTimestamp: Date.parse('2026-10-15T13:00:00Z'), durationMinutes: 60, averagePrice: -.02 },
];
const render = card => card._periodTable(periods, periods, 'Europe/Amsterdam', '2026-10-14', '2026-10-15');
test('each period column can be hidden independently with matching header and body', () => {
  const card = new Card();
  for (const column of ['day', 'type', 'start', 'end', 'duration', 'average']) {
    const config = { entity: 'sensor.prices', show_period_average: true };
    card.setConfig(config);
    assert.match(render(card), new RegExp(`class="period-${column}"`));
    config[`show_period_${column}`] = false;
    card.setConfig(config);
    assert.doesNotMatch(render(card), new RegExp(`class="period-${column}"`));
    const html = render(card);
    assert.equal((html.match(/<th /g) ?? []).length, 5);
    assert.equal((html.match(/<td /g) ?? []).length, 20);
  }
  card.setConfig({ entity: 'sensor.prices', ...Object.fromEntries(['day', 'type', 'start', 'end', 'duration', 'average'].map(c => [`show_period_${c}`, false])) });
  assert.equal(render(card), '');
  const fields = Card.getConfigForm().schema.find(s=>s.name==='table_settings').schema;
  for (const column of ['day', 'type', 'start', 'end', 'duration']) {
    const option = fields.find(f => f.name === `show_period_${column}`);
    assert.equal(option.default, true);
    assert.ok(option.selector.boolean);
    assert.doesNotMatch(Card.getConfigForm().computeLabel.call({hass: {language: 'en'}}, option), /show_period/);
  }
});
test('compact period labels retain full meanings in both languages', () => {
  const card = new Card();
  card.setConfig({ entity: 'sensor.prices', show_period_average: true });
  for (const language of ['en', 'nl']) {
    card._hass = { language };
    const html = render(card);
    assert.match(html, /<th class="period-average">~ct<\/th>/);
    assert.match(html, language === 'nl' ? />Vdg\.</ : />Today</);
    assert.match(html, language === 'nl' ? />Mrg\.</ : />Tmr\.</);
    assert.match(html, language === 'nl' ? />Af\.</ : />Imp\.</);
    assert.match(html, language === 'nl' ? />Ter\.</ : />Exp\.</);
    assert.match(html, language === 'nl' ? /title="Teruglevering"/ : /title="Export"/);
  }
});
