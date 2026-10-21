import * as periods from '../../../shared/periods.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as utils from '../src/price-utils.js';
import * as graph from '../../../shared/graph.js';
import * as localization from '../src/localization.js';

let rootHass = { language: 'en' };
const browserWindow = {};
const source = readFileSync(new URL('../src/dynamic-energy-price-card.js', import.meta.url), 'utf8');
let Card;
vm.runInNewContext(source.replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm, ''), {
  ...periods,...graph, ...utils, ...localization,
  frontendHass: () => rootHass,
  HTMLElement: class { attachShadow() { this.shadowRoot = { querySelector: () => null, querySelectorAll: () => [] }; } },
  customElements: { get: () => undefined, define: (_, constructor) => { Card = constructor; } },
  document: { querySelector: () => ({ hass: rootHass }) }, window: browserWindow, Intl, Date,
});

const make = (language, extra = {}) => {
  const card = new Card();
  card.setConfig({ entity: 'sensor.prices', cheapest_hours: 4, import_selection_mode: 'contiguous', show_cheapest_table: true, tomorrow_after: 24, ...extra });
  const day = utils.localDayKey(new Date(), 'Europe/Amsterdam');
  const data = Array.from({ length: 96 }, (_, i) => ({ start_time: `${day}T${String(Math.floor(i / 4)).padStart(2, '0')}:${String(i % 4 * 15).padStart(2, '0')}:00+02:00`, price_per_kwh: .2 }));
  card.hass = { language, locale: { language }, config: { time_zone: 'Europe/Amsterdam' }, states: { 'sensor.prices': { attributes: { data }, last_updated: 'same' } } };
  return card;
};

test('card follows frontend language with English fallback and preserves literal custom titles', () => {
  const card = make('en');
  assert.match(card.shadowRoot.innerHTML, /Dynamic energy prices/);
  assert.match(card.shadowRoot.innerHTML, /Favorable periods/);
  assert.match(card.shadowRoot.innerHTML, /Today/);
  assert.match(card.shadowRoot.innerHTML, /4 h/);
  card.hass = { ...card._hass, language: 'nl', locale: { language: 'nl' } };
  assert.match(card.shadowRoot.innerHTML, /Dynamische energieprijzen/);
  assert.match(card.shadowRoot.innerHTML, /Gunstige momenten/);
  assert.match(card.shadowRoot.innerHTML, /4 uur/);
  assert.match(make('fr').shadowRoot.innerHTML, /Dynamic energy prices/);
  assert.match(make('en', { title: 'Dynamische energieprijzen' }).shadowRoot.innerHTML, /Dynamische energieprijzen/);
  assert.match(make('nl', { title: 'My literal title' }).shadowRoot.innerHTML, /My literal title/);
});

test('native form localizes groups, selectors, helpers and units without changing flat keys', () => {
  const form = Card.getConfigForm();
  const fields = new Map();
  const walk = (schema) => schema.forEach(field => { fields.set(field.name, field); if (field.schema) walk(field.schema); });
  walk(form.schema);
  for (const [language, expected] of [['en', ['General', 'Import', 'Export', 'Solid', 'h', 'Title']], ['nl', ['Algemeen', 'Afname', 'Teruglevering', 'Doorgetrokken', 'uur', 'Titel']]]) {
    rootHass = { language };
    const context = { hass: rootHass };
    assert.equal(fields.get('graph_settings').title, expected[0]);
    assert.equal(fields.get('import_settings').title, expected[1]);
    assert.equal(fields.get('export_settings').title, expected[2]);
    assert.equal(fields.get('import_line_style').selector.select.options[0].label, expected[3]);
    assert.equal(fields.get('cheapest_hours').selector.number.unit_of_measurement, expected[4]);
    assert.equal(form.computeLabel.call(context, fields.get('title')), expected[5]);
    assert.match(form.computeHelper.call(context, fields.get('cheap_color')), language === 'nl' ? /Leeg/ : /Empty/);
    assert.equal(form.computeLabel.call(context, {}), '');
    assert.equal(form.computeHelper.call(context, {}), undefined);
    for (const field of fields.values()) {
      assert.ok(field.name);
      if (field.schema) assert.equal(field.flatten, true);
      assert.notEqual(form.computeLabel.call(context, field), field.name);
    }
  }
  const config = make('en', { show_title: false, cheapest_hours: 0, import_line_color: [0, 0, 0], cheap_color: [] })._config;
  assert.equal(config.show_title, false);
  assert.equal(config.cheapest_hours, 0);
  assert.deepEqual(config.import_line_color, [0, 0, 0]);
  assert.deepEqual(config.cheap_color, []);
  assert.equal(fields.get('title').default, undefined); // Automatic title is not persisted as custom text.
});

test('native editor callbacks use their own hass even when frontend root language differs', () => {
  rootHass = { language: 'en' };
  const form = Card.getConfigForm();
  const context = { hass: { language: 'nl' } };
  assert.equal(form.computeLabel.call(context, form.schema[0]), 'Algemeen');
  assert.equal(form.computeLabel.call(context, form.schema.find(s=>s.name==='import_settings')), 'Afname');
  assert.equal(form.computeLabel.call(context, form.schema.find(s=>s.name==='export_settings')), 'Teruglevering');
});

test('accessible language and localized number/date/duration formatting match the frontend', () => {
  for (const language of ['en', 'nl-NL']) {
    const card = make(language);
    assert.match(card.shadowRoot.innerHTML, language === 'en' ? /<ha-card lang="en">/ : /<ha-card lang="nl">/);
    assert.equal(card._formatPrice(.2345), language === 'en' ? '23.45' : '23,45');
    assert.match(card._formatDay(Date.parse('2026-10-08T12:00:00Z'), 'Europe/Amsterdam'), language === 'en' ? /Thu.*Oct/ : /do.*okt/);
    const html = card._periodTable([{ startTimestamp: Date.parse('2026-10-08T12:00:00Z'), endTimestamp: Date.parse('2026-10-08T13:30:00Z'), durationMinutes: 90, dayKey: '2026-10-08' }], [], 'Europe/Amsterdam', '2026-10-08', '2026-10-09');
    assert.match(html, language === 'en' ? /1 h 30 min/ : /1 u 30 min/);
  }
});

test('empty states, source errors, missing intervals and recovery guidance are localized', () => {
  for (const language of ['en', 'nl']) {
    const card = make(language);
    const hass = card._hass;
    card.hass = { ...hass, states: {} };
    assert.match(card.shadowRoot.innerHTML, language === 'en' ? /Import entity not found/ : /Afname-entiteit niet gevonden/);
    card.setConfig({ entity: 'sensor.prices', graph_mode: 'export' });
    card.hass = hass;
    assert.match(card.shadowRoot.innerHTML, language === 'en' ? /Export source missing/ : /Terugleverbron ontbreekt/);
    assert.match(card.shadowRoot.innerHTML, /export_entity/);
    card.setConfig({ entity: 'sensor.prices', export_entity: 'sensor.missing', graph_mode: 'export' });
    card.hass = hass;
    assert.match(card.shadowRoot.innerHTML, language === 'en' ? /Export entity not found/ : /Teruglever-entiteit niet gevonden/);
    card.setConfig({ entity: 'sensor.prices' });
    card.hass = { ...hass, states: { 'sensor.prices': { attributes: { data: [] } } } };
    assert.match(card.shadowRoot.innerHTML, language === 'en' ? /No price data yet/ : /Nog geen prijsgegevens/);
    const data = hass.states['sensor.prices'].attributes.data.filter((_, i) => i !== 7);
    card.setConfig({ entity: 'sensor.prices', tomorrow_after: 0 });
    card.hass = { ...hass, states: { 'sensor.prices': { attributes: { data } } } };
    assert.match(card.shadowRoot.innerHTML, language === 'en' ? /1 price interval missing/ : /1 prijsinterval ontbreekt/);
    assert.match(card.shadowRoot.innerHTML, language === 'en' ? /Tomorrow&#039;s prices are missing/ : /Morgenprijzen ontbreken/);
    assert.doesNotThrow(() => card.setConfig({}));
    card.hass = hass;
    assert.match(card.shadowRoot.innerHTML, language === 'en' ? /Choose a price source/ : /Kies een prijsbron/);
    assert.throws(() => card.setConfig({ entity: 'sensor.prices', cheap_price: 1 }), language === 'en' ? /Price thresholds must increase/ : /Prijsniveaus moeten oplopen/);
  }
});

test('card picker keeps Eleven branding while its description follows the frontend language', () => {
  const metadata = browserWindow.customCards[0];
  rootHass = { language: 'nl' };
  assert.equal(metadata.name, 'Eleven Dynamic Energy Price Card');
  assert.match(metadata.description, /Afname/);
  rootHass = { language: 'en' };
  assert.equal(metadata.name, 'Eleven Dynamic Energy Price Card');
  assert.match(metadata.description, /Import and export/);
});

test('language resolution prefers the frontend locale and rejects unsupported languages', () => {
  assert.equal(localization.resolveLanguage({ language: 'nl', locale: { language: 'en' } }), 'en');
  for (const language of ['nl', 'NL', 'nl-NL', 'nl-BE', 'nl_BE']) assert.equal(localization.resolveLanguage({ language }), 'nl');
  for (const language of ['en', 'fr', 'de', 'nlish', '', null]) assert.equal(localization.resolveLanguage({ language }), 'en');
  assert.equal(localization.resolveLanguage(), 'en');
});
