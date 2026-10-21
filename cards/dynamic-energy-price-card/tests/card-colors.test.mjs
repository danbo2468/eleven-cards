import * as periods from '../../../shared/periods.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as utils from '../src/price-utils.js';
import * as graph from '../../../shared/graph.js';
import * as localization from '../src/localization.js';

const source = readFileSync(new URL('../src/dynamic-energy-price-card.js', import.meta.url), 'utf8');
let Card;
vm.runInNewContext(source.replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm, ''), {
  ...periods,...graph, ...utils, ...localization,
  frontendHass: () => ({ language: 'nl' }),
  document: { querySelector: () => ({ hass: { language: 'nl' } }) },
  HTMLElement: class { attachShadow() { this.shadowRoot = {}; } },
  customElements: { get: () => undefined, define: (_, constructor) => { Card = constructor; } },
  window: {},
});
const card = (config = {}) => { const instance = new Card(); instance.setConfig({ entity: 'sensor.prices', ...config }); return instance; };
const token = (styles, name) => [...styles.matchAll(new RegExp(`${name}: ([^;]+);`, 'g'))].at(-1)?.[1];

test('optional price palette overrides semantic tokens without changing automatic defaults', () => {
  const defaults = card()._styles();
  assert.equal(token(defaults, '--cheap'), 'var(--success-color, #19a974)');
  assert.equal(token(defaults, '--normal'), '#f2a93b');
  assert.equal(token(defaults, '--expensive'), 'var(--error-color, #e45c4f)');
  assert.equal(token(defaults, '--zero-color'), '#18a999');
  assert.equal(token(defaults, '--negative-color'), '#168aad');
  const fields = { cheap_color: '--cheap', normal_color: '--normal', expensive_color: '--expensive', zero_color: '--zero-color', negative_color: '--negative-color' };
  for (const [field, name] of Object.entries(fields)) {
    assert.equal(token(card({ [field]: [0, 12, 255] })._styles(), name), 'rgb(0, 12, 255)');
    for (const empty of [undefined, null, '', [], [300, 0, 0], 'red']) {
      assert.equal(token(card({ [field]: empty })._styles(), name), token(defaults, name));
    }
  }
  const instance = card({ cheap_color: [0, 0, 0], show_import_fill: false, cheapest_hours: 0 });
  assert.equal(token(instance._styles(), '--cheap'), 'rgb(0, 0, 0)');
  assert.equal(instance._config.show_import_fill, false);
  assert.equal(instance._config.cheapest_hours, 0);
});

test('favorable import and export colors are independent of price semantics', () => {
  const styles = card({ cheap_color: [255, 0, 0], import_favorable_color: [120, 30, 200], export_favorable_color: [0, 0, 0] })._styles();
  assert.equal(token(styles, '--import-best'), 'rgb(120, 30, 200)');
  assert.equal(token(styles, '--export-best'), 'rgb(0, 0, 0)');
  assert.equal(token(card({ cheap_color: [255, 0, 0] })._styles(), '--import-best'), 'var(--success-color, #19a974)');
  assert.equal(token(card({ export_favorable_color: [] })._styles(), '--export-best'), '#1976d2');
  for (const selector of ['.import-selection-band', '.current-window.active', '.compact-current em', '.period-type.import']) {
    assert.match(styles, new RegExp(selector.replaceAll('.', '\\.') + ' \\{[^}]*var\\(--import-best\\)'));
  }
  assert.equal(token(styles, '--cheapest-fill'), 'color-mix(in srgb, var(--import-best) 13%, transparent)');
});

test('native editor exposes optional flat RGB colors in named logical subgroups', () => {
  const form = Card.getConfigForm();
  const groups = [];
  const fields = new Map();
  function walk(schema) {
    for (const field of schema) {
      if (field.schema) { groups.push(field); walk(field.schema); }
      else fields.set(field.name, field);
    }
  }
  walk(form.schema);
  for (const group of groups) { assert.ok(group.name); assert.equal(group.flatten, true); }
  const palette = groups.find(group => group.name === 'price_color_settings');
  assert.ok(palette);
  assert.equal(palette.schema.length, 5);
  for (const name of ['cheap_color', 'normal_color', 'expensive_color', 'zero_color', 'negative_color', 'import_favorable_color', 'export_favorable_color']) {
    const field = fields.get(name);
    assert.ok(field, name);
    assert.ok(field.selector.color_rgb);
    assert.equal(field.required, undefined);
    assert.equal(field.default, undefined);
    assert.notEqual(form.computeLabel(field), name);
    assert.match(form.computeHelper(field), /Leeg/);
  }
  for (const type of ['import', 'export']) {
    assert.ok(groups.find(group => group.name === `${type}_favorable_settings`).schema.some(field => field.name === `${type}_favorable_color`));
  }
  assert.equal(form.computeLabel({}), '');
});

