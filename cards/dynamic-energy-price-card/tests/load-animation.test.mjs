import * as periods from '../../../shared/periods.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as utils from '../src/price-utils.js';
import * as graph from '../../../shared/graph.js';
import * as localization from '../src/localization.js';
let Card;
vm.runInNewContext(readFileSync(new URL('../src/dynamic-energy-price-card.js', import.meta.url), 'utf8').replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm, ''), {
  ...periods,...graph, ...utils, ...localization,
  HTMLElement: class { attachShadow() { this.shadowRoot = { querySelector: () => null, querySelectorAll: () => [] }; } },
  customElements: { get: () => undefined, define: (_, constructor) => { Card = constructor; } }, window: {}, Intl, Date,
});
test('graph reveals only on its first successful data render, not subsequent updates', () => {
  const card = new Card();
  card.setConfig({entity: 'sensor.prices'});
  card._hass = {language: 'en', config: {time_zone: 'UTC'}, states: {'sensor.prices': {attributes: {data: []}}}};
  card._render();
  assert.doesNotMatch(card.shadowRoot.innerHTML, /class="chart-series chart-enter"/);
  const day = new Date().toISOString().slice(0,10);
  card._hass.states['sensor.prices'].attributes.data = Array.from({length: 24}, (_, hour) => ({start_time: `${day}T${String(hour).padStart(2,'0')}:00:00Z`, price_per_kwh: .2 + hour/100}));
  // HA can supply hass before inserting the card into the DOM.
  card.isConnected = false;
  card._render();
  assert.notEqual(card._chartHasLoaded, true, 'detached render must not consume entrance');
  card.isConnected = true;
  card._render();
  assert.match(card.shadowRoot.innerHTML, /class="chart-series chart-enter"/);
  assert.match(card.shadowRoot.innerHTML, /<g class="chart-series chart-enter">[\s\S]*class="price-line import-line"[\s\S]*<\/g>/);
  const animation = { animationName: 'chart-reveal', playState: 'running', currentTime: 180 };
  card.shadowRoot.querySelector = selector => selector === '.chart-enter'
    ? { getAnimations: () => [animation] } : null;
  card._render();
  assert.match(card.shadowRoot.innerHTML, /class="chart-series chart-enter"/);
  assert.equal(animation.currentTime, 180, 'update preserves entrance progress');
  animation.currentTime = 650;
  animation.playState = 'finished';
  card._render();
  assert.match(card.shadowRoot.innerHTML, /class="chart-series"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /class="chart-series chart-enter"/);
});
test('reveal respects reduced motion and leaves dashed line styling intact', () => {
  const card = new Card();
  card.setConfig({entity: 'sensor.prices'});
  const css = card._styles();
  assert.match(css, /@keyframes chart-reveal/);
  assert.match(css, /clip-path: inset\(0 100% 0 0\)/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.chart-enter \{ animation: none;/);
  assert.doesNotMatch(css, /@keyframes chart-reveal[^}]*stroke-dash/);
});
