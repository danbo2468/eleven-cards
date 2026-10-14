import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAveragePrice,
  classifyPrice,
  classifyPriceLevel,
  countMissingIntervals,
  createPriceTicks,
  findCurrentPoint,
  getVisiblePoints,
  groupSelectedPeriods,
  isCheapestHoursEnabled,
  mergePriceSeries,
  normalizeLineStyle,
  normalizeLineWidth,
  normalizePoints,
  normalizeSelectionMode,
  offsetPriceData,
  relativeAgeLabel,
  rgbColorToCss,
  selectCheapestDuration,
  selectHighestDuration,
  splitByLocalDay,
} from '../src/price-utils.js';

const zone = 'Europe/Amsterdam';

function quarterDay(day, basePrice = 0.40) {
  const points = [];
  for (let i = 0; i < 96; i += 1) {
    const hh = String(Math.floor(i / 4)).padStart(2, '0');
    const mm = String((i % 4) * 15).padStart(2, '0');
    points.push({ start_time: `${day}T${hh}:${mm}:00+02:00`, price_per_kwh: basePrice + i / 10000 });
  }
  return points;
}

test('€0.25 belongs to expensive class while lower values are cheap', () => {
  assert.equal(classifyPrice(0.2499, 0.25), 'cheap');
  assert.equal(classifyPrice(0.25, 0.25), 'expensive');
});

test('average price is calculated over the visible graph points', () => {
  assert.ok(Math.abs(calculateAveragePrice([{ price: 0.10 }, { price: 0.20 }, { price: 0.30 }]) - 0.20) < 1e-12);
  assert.equal(calculateAveragePrice([]), null);
});

test('price levels include a fixed negative blue-green band', () => {
  assert.equal(classifyPriceLevel(-0.01, 0.15, 0.25, 0.40), 'negative');
  assert.equal(classifyPriceLevel(0.12, 0.15, 0.25, 0.40), 'cheap');
  assert.equal(classifyPriceLevel(0.24, 0.15, 0.25, 0.40), 'normal');
  assert.equal(classifyPriceLevel(0.41, 0.15, 0.25, 0.40), 'expensive');
});

test('five y-axis price ticks include both scale endpoints', () => {
  assert.deepEqual(createPriceTicks(0.10, 0.50, 5), [0.50, 0.40, 0.30, 0.20, 0.10]);
});

test('cheapest hours is disabled unless configured with a positive value', () => {
  assert.equal(isCheapestHoursEnabled(undefined), false);
  assert.equal(isCheapestHoursEnabled(null), false);
  assert.equal(isCheapestHoursEnabled(0), false);
  assert.equal(isCheapestHoursEnabled(false), false);
  assert.equal(isCheapestHoursEnabled(4), true);
  assert.equal(isCheapestHoursEnabled('4'), true);
});

test('line styling values are normalized for safe SVG rendering', () => {
  assert.equal(normalizeLineStyle('solid', 'dashed'), 'solid');
  assert.equal(normalizeLineStyle('dotted', 'solid'), 'dotted');
  assert.equal(normalizeLineStyle('unknown', 'dashed'), 'dashed');
  assert.equal(normalizeLineWidth('4.5'), 4.5);
  assert.equal(normalizeLineWidth(0), 1);
  assert.equal(normalizeLineWidth(12), 8);
  assert.equal(normalizeLineWidth('invalid', 3.5), 3.5);
  assert.equal(rgbColorToCss([25, 118, 210]), 'rgb(25, 118, 210)');
  assert.equal(rgbColorToCss(undefined), null);
  assert.equal(rgbColorToCss([300, 0, 0]), null);
});

test('selected quarter-hours are grouped into contiguous table periods', () => {
  const points = normalizePoints(quarterDay('2026-10-07'), zone);
  const selected = new Set([0, 1, 4, 5, 6].map((index) => points[index].timestamp));
  const periods = groupSelectedPeriods(points, selected, 15);
  assert.equal(periods.length, 2);
  assert.deepEqual(periods.map((period) => period.durationMinutes), [30, 45]);
  assert.equal(periods[0].startTimestamp, points[0].timestamp);
  assert.equal(periods[0].endTimestamp, points[1].timestamp + 15 * 60000);
  assert.equal(periods[1].startTimestamp, points[4].timestamp);
  assert.equal(periods[1].endTimestamp, points[6].timestamp + 15 * 60000);
});

test('missing interval count reports only gaps inside the observed range', () => {
  const points = normalizePoints(quarterDay('2026-10-07').slice(0, 8), zone);
  assert.equal(countMissingIntervals(points, 15), 0);
  assert.equal(countMissingIntervals(points.filter((_, index) => ![2, 3, 6].includes(index)), 15), 3);
});

test('source age uses compact Dutch labels', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  assert.equal(relativeAgeLabel('2026-10-08T11:59:30Z', now), 'zojuist');
  assert.equal(relativeAgeLabel('2026-10-08T11:43:00Z', now), '17 min geleden');
  assert.equal(relativeAgeLabel('2026-10-08T09:50:00Z', now), '2 uur geleden');
  assert.equal(relativeAgeLabel(undefined, now), 'onbekend');
});

test('tomorrow is hidden before 14:00 and appears at 14:00 local time', () => {
  const data = [...quarterDay('2026-10-06'), ...quarterDay('2026-10-07')];
  const before = getVisiblePoints(data, new Date('2026-10-06T11:59:00Z'), zone, 14);
  const at = getVisiblePoints(data, new Date('2026-10-06T12:00:00Z'), zone, 14);
  assert.equal(new Set(before.map((point) => point.dayKey)).size, 1);
  assert.equal(new Set(at.map((point) => point.dayKey)).size, 2);
});

test('current price comes from the active price interval, not the sensor state', () => {
  const points = normalizePoints(quarterDay('2026-10-06', 0.30), zone);
  const current = findCurrentPoint(points, new Date('2026-10-06T12:07:00Z'));
  assert.equal(current.startTime, '2026-10-06T14:00:00+02:00');
  assert.equal(current.price, points[56].price);
});

test('selects non-consecutive cheapest quarter-hours totalling four hours', () => {
  const points = normalizePoints(quarterDay('2026-10-06', 0.50).map((point, index) => ({
    ...point,
    price_per_kwh: index % 6 === 0 ? index / 10000 : 0.50 + index / 10000,
  })), zone);
  const selected = selectCheapestDuration(points, 240);
  assert.equal(selected.size, 16);
  for (let i = 0; i < 96; i += 6) assert.ok(selected.has(points[i].timestamp));
});

test('cheapest duration is calculated independently per day', () => {
  const visible = getVisiblePoints(
    [...quarterDay('2026-10-06'), ...quarterDay('2026-10-07')],
    new Date('2026-10-06T13:00:00Z'),
    zone,
    14,
  );
  const groups = splitByLocalDay(visible);
  assert.equal(groups.size, 2);
  for (const points of groups.values()) {
    assert.equal(selectCheapestDuration(points, 240).size, 16);
  }
});

test('return prices can be derived from import prices with a signed offset', () => {
  const source = quarterDay('2026-10-07', 0.30).slice(0, 2);
  assert.deepEqual(
    offsetPriceData(source, -0.12).map((point) => point.price_per_kwh),
    [0.18, 0.1801],
  );
  assert.equal(source[0].price_per_kwh, 0.30);
});

test('a signed offset can also modify a dedicated return-price entity', () => {
  const returnSource = quarterDay('2026-10-07', 0.08).slice(0, 2);
  assert.deepEqual(
    offsetPriceData(returnSource, 0.02).map((point) => point.price_per_kwh),
    [0.10, 0.1001],
  );
});

test('import and return series merge by timestamp while preserving missing values', () => {
  const importPoints = normalizePoints(quarterDay('2026-10-07', 0.30).slice(0, 3), zone);
  const exportPoints = normalizePoints(quarterDay('2026-10-07', 0.10).slice(1, 3), zone);
  const merged = mergePriceSeries(importPoints, exportPoints);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].importPrice, importPoints[0].price);
  assert.equal(merged[0].exportPrice, undefined);
  assert.equal(merged[1].importPrice, importPoints[1].price);
  assert.equal(merged[1].exportPrice, exportPoints[0].price);
});

test('highest return-price intervals are selected independently from cheapest import intervals', () => {
  const points = normalizePoints(quarterDay('2026-10-07', 0.10), zone);
  const highest = selectHighestDuration(points, 60);
  assert.deepEqual([...highest], points.slice(-4).map((point) => point.timestamp));
});

test('one contiguous block selects the cheapest adjacent intervals', () => {
  const prices = [0.01, 0.50, 0.20, 0.21, 0.22, 0.60, 0.02, 0.03];
  const points = normalizePoints(quarterDay('2026-10-07').slice(0, prices.length).map((point, index) => ({
    ...point,
    price_per_kwh: prices[index],
  })), zone);
  const selected = selectCheapestDuration(points, 45, { mode: 'contiguous' });
  assert.deepEqual([...selected], points.slice(2, 5).map((point) => point.timestamp));
});

test('minimum-block mode never creates a selected run shorter than the configured duration', () => {
  const prices = [0.01, 0.50, 0.02, 0.03, 0.60, 0.04, 0.05, 0.70];
  const points = normalizePoints(quarterDay('2026-10-07').slice(0, prices.length).map((point, index) => ({
    ...point,
    price_per_kwh: prices[index],
  })), zone);
  const selected = selectCheapestDuration(points, 60, {
    mode: 'minimum_blocks',
    minimumBlockMinutes: 30,
  });
  const periods = groupSelectedPeriods(points, selected, 15);
  assert.equal(selected.size, 4);
  assert.ok(periods.every((period) => period.durationMinutes >= 30));
});

test('selection modes also support the highest export prices', () => {
  const prices = [0.10, 0.80, 0.79, 0.20, 0.70, 0.69, 0.10, 0.05];
  const points = normalizePoints(quarterDay('2026-10-07').slice(0, prices.length).map((point, index) => ({
    ...point,
    price_per_kwh: prices[index],
  })), zone);
  const contiguous = selectHighestDuration(points, 30, { mode: 'contiguous' });
  assert.deepEqual([...contiguous], points.slice(1, 3).map((point) => point.timestamp));
  const blocks = selectHighestDuration(points, 60, { mode: 'minimum_blocks', minimumBlockMinutes: 30 });
  assert.deepEqual([...blocks], points.slice(1, 3).concat(points.slice(4, 6)).map((point) => point.timestamp));
});

test('unknown selection mode safely falls back to individual intervals', () => {
  assert.equal(normalizeSelectionMode('contiguous'), 'contiguous');
  assert.equal(normalizeSelectionMode('minimum_blocks'), 'minimum_blocks');
  assert.equal(normalizeSelectionMode('unknown'), 'individual');
});
