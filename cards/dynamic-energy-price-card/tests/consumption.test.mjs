import test from 'node:test';
import assert from 'node:assert/strict';
import * as utils from '../src/price-utils.js';
test('energy tooltip placement avoids separated markers and stays inside narrow chart', () => {
  assert.equal(typeof utils.placeEnergyTooltip, 'function');
  const markers=[{left:160,right:172,top:60,bottom:72},{left:160,right:172,top:292,bottom:304}];
  const result=utils.placeEnergyTooltip(342,330,204,120,166,180,markers);
  assert.ok(result.left>=4 && result.left+204<=338 && result.top>=4 && result.top+120<=326);
  for(const m of markers)assert.ok(result.left+204<=m.left || result.left>=m.right || result.top+120<=m.top || result.top>=m.bottom);
});
const base = Date.parse('2026-10-11T00:00:00+02:00');
const rows = Array.from({length: 13}, (_, i) => ({state: String(100 + i * .1), last_changed: new Date(base + i * 300000).toISOString()}));
test('history derives observed quarter-hour kWh deltas, not power or cumulative totals, and excludes future intervals', () => {
  assert.equal(typeof utils.consumptionFromHistory, 'function');
  const result = utils.consumptionFromHistory(rows, base, base + 3600000, 15, base + 2100000);
  assert.equal(result.length, 2);
  assert.equal(result[0].timestamp, base);
  assert.equal(result[0].endTimestamp, base + 900000);
  assert.ok(Math.abs(result[0].energy - .3) < 1e-10);
});

test('history rejects resets, unavailable, missing boundaries and recording gaps without bridging them', () => {
  for (const change of [r => r[2].state = 'unavailable', r => r[2].state = '0', r => r.splice(1, 2)]) {
    const input = structuredClone(rows); change(input);
    const result = utils.consumptionFromHistory(input, base, base + 3600000, 15, base + 3600000);
    assert.equal(result[0].energy, null);
    assert.ok(Number.isFinite(result.at(-1).energy));
  }
  assert.equal(utils.consumptionFromHistory([], base, base + 900000, 15)[0].energy, null);
  const zero = rows.map(row => ({...row, state: '100'}));
  assert.equal(utils.consumptionFromHistory(zero, base, base + 900000, 15)[0].energy, 0);
  assert.equal(utils.consumptionFromHistory(rows, base, base + 3600000, 30).length, 0);
});

test('hourly recorder change stays hourly and rejects null, negative, partial and future data', () => {
  assert.equal(typeof utils.consumptionFromStatistics, 'function');
  const input = [0, .9, null, -.2].map((change, i) => ({start: base + i * 3600000, end: base + (i + 1) * 3600000, change}));
  const result = utils.consumptionFromStatistics(input, base, base + 14400000, base + 12600000);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(p => p.energy), [0, .9, null]);
  assert.equal(result[1].endTimestamp - result[1].timestamp, 3600000);
  assert.equal(utils.consumptionFromStatistics(input, base, base + 14400000, base + 14400000)[3].energy, null);
  assert.equal(utils.consumptionFromStatistics([{start:base,end:base+300000,change:.2}],base,base+3600000,base+3600000)[0].energy,null);
});

test('absolute interval boundaries remain distinct during Amsterdam DST repeated hour', () => {
  const start = Date.parse('2026-10-25T02:00:00+02:00');
  const data = rows.map((r, i) => ({...r, last_changed: new Date(start + i * 300000).toISOString()}));
  const result = utils.consumptionFromHistory(data, start, start + 3600000, 15, start + 3600000);
  assert.equal(result.length, 4);
  assert.equal(result.at(-1).endTimestamp, Date.parse('2026-10-25T02:00:00+01:00'));
});
