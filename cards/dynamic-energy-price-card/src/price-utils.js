// Observed boundary deltas only: never interpolate a meter or split hourly energy.
export function consumptionFromHistory(history, start, end, intervalMinutes, now = Date.now()) {
  const step = intervalMinutes * 60000;
  if (![15, 60].includes(intervalMinutes) || !Array.isArray(history)) return [];
  const samples = history.map(row => ({
    timestamp: Date.parse(row.last_updated ?? row.last_changed),
    value: row.state === null || row.state === '' ? NaN : Number(row.state),
  })).filter(row => Number.isFinite(row.timestamp)).sort((a, b) => a.timestamp - b.timestamp);
  const points = [];
  let cursor = -1;
  for (let timestamp = start; timestamp + step <= Math.min(end, now); timestamp += step) {
    while (cursor + 1 < samples.length && samples[cursor + 1].timestamp <= timestamp) cursor++;
    const first = cursor;
    while (cursor + 1 < samples.length && samples[cursor + 1].timestamp <= timestamp + step) cursor++;
    const last = cursor;
    const a = samples[first];
    const b = samples[last];
    let valid = a && b && timestamp - a.timestamp <= 300000 && timestamp + step - b.timestamp <= 300000;
    for (let i = first; valid && i <= last; i++) {
      const sample = samples[i];
      valid = Number.isFinite(sample.value) && sample.value >= 0
        && (i === first || (sample.value >= samples[i - 1].value && sample.timestamp - samples[i - 1].timestamp <= 300000));
    }
    points.push({ timestamp, endTimestamp: timestamp + step, energy: valid ? b.value - a.value : null });
  }
  return points;
}

// HA recorder change is already reset-normalized and expressed in requested kWh.
export function consumptionFromStatistics(rows, start, end, now = Date.now()) {
  if (!Array.isArray(rows)) return [];
  const byStart = new Map(rows.map(row => [row.start, row]));
  const points = [];
  // Hour boundaries in absolute time; do not turn these into quarter-hour samples.
  for (let timestamp = Math.ceil(start / 3600000) * 3600000; timestamp + 3600000 <= Math.min(end, now); timestamp += 3600000) {
    const row = byStart.get(timestamp);
    const valid = row?.end === timestamp + 3600000 && typeof row.change === 'number' && Number.isFinite(row.change) && row.change >= 0;
    points.push({ timestamp, endTimestamp: timestamp + 3600000, energy: valid ? row.change : null });
  }
  return points;
}

// Overlay-only placement: preserve the established price-only tooltip geometry.
export function placeEnergyTooltip(width, height, boxWidth, boxHeight, anchorX, anchorY, markers) {
  const edge = 4;
  const gap = 12;
  const clamp = (value, max) => Math.max(edge, Math.min(max - edge, value));
  const xs = [anchorX + gap, anchorX - boxWidth - gap, clamp(anchorX - boxWidth / 2, width - boxWidth), edge, width - boxWidth - edge];
  const ys = [anchorY + gap, anchorY - boxHeight - gap, ...markers.flatMap(m => [m.bottom + gap, m.top - boxHeight - gap]), edge, height - boxHeight - edge];
  for (const left of xs) {
    for (const top of ys) {
      if (left < edge || top < edge || left + boxWidth > width - edge || top + boxHeight > height - edge) continue;
      if (markers.every(m => left + boxWidth <= m.left - 4 || left >= m.right + 4 || top + boxHeight <= m.top - 4 || top >= m.bottom + 4)) return { left, top };
    }
  }
  return { left: clamp(anchorX - boxWidth / 2, width - boxWidth), top: clamp(anchorY - boxHeight / 2, height - boxHeight) };
}

export function zonedParts(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function localDayKey(value, timeZone) {
  const parts = zonedParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function localHour(value, timeZone) {
  return Number(zonedParts(value, timeZone).hour);
}

export function addDaysToKey(dayKey, days) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function calculateAveragePrice(points) {
  if (!points.length) return null;
  return points.reduce((total, point) => total + Number(point.price), 0) / points.length;
}

export function offsetPriceData(data, offset) {
  const amount = Number(offset);
  if (!Array.isArray(data) || !Number.isFinite(amount)) return [];
  return data.map((entry) => ({
    ...entry,
    price_per_kwh: Number((Number(entry?.price_per_kwh) + amount).toFixed(10)),
  }));
}

export function mergePriceSeries(importPoints = [], exportPoints = []) {
  const merged = new Map();
  for (const point of importPoints) {
    merged.set(point.timestamp, {
      timestamp: point.timestamp,
      startTime: point.startTime,
      dayKey: point.dayKey,
      importPrice: point.price,
    });
  }
  for (const point of exportPoints) {
    const existing = merged.get(point.timestamp) ?? {
      timestamp: point.timestamp,
      startTime: point.startTime,
      dayKey: point.dayKey,
    };
    existing.exportPrice = point.price;
    merged.set(point.timestamp, existing);
  }
  return [...merged.values()].sort((left, right) => left.timestamp - right.timestamp);
}

export function classifyPrice(price, threshold = 0.25) {
  return Number(price) < Number(threshold) ? 'cheap' : 'expensive';
}

export function classifyPriceLevel(price, cheapPrice = 0.15, normalPrice = 0.25, expensivePrice = 0.40) {
  const value = Number(price);
  if (value < 0) return 'negative';
  if (value <= Number(cheapPrice)) return 'cheap';
  if (value <= Number(expensivePrice)) return 'normal';
  return 'expensive';
}

export function isCheapestHoursEnabled(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export function normalizeLineStyle(value, fallback = 'solid') {
  const allowed = new Set(['solid', 'dashed', 'dotted']);
  return allowed.has(value) ? value : allowed.has(fallback) ? fallback : 'solid';
}

export function normalizeSelectionMode(value) {
  return ['individual', 'contiguous', 'minimum_blocks'].includes(value) ? value : 'individual';
}

export function normalizeLineWidth(value, fallback = 3.5) {
  const parsed = Number(value);
  const fallbackValue = Number(fallback);
  const width = Number.isFinite(parsed) ? parsed : Number.isFinite(fallbackValue) ? fallbackValue : 3.5;
  return Math.round(Math.min(8, Math.max(1, width)) * 2) / 2;
}

export function rgbColorToCss(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const channels = value.map(Number);
  if (!channels.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)) return null;
  return `rgb(${channels.join(', ')})`;
}

export function countMissingIntervals(points, intervalMinutes = inferIntervalMinutes(points)) {
  const intervalMs = Number(intervalMinutes) * 60000;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0 || points.length < 2) return 0;
  const timestamps = [...new Set(points.map((point) => Number(point.timestamp)).filter(Number.isFinite))]
    .sort((left, right) => left - right);
  let missing = 0;
  for (let index = 1; index < timestamps.length; index += 1) {
    const steps = Math.round((timestamps[index] - timestamps[index - 1]) / intervalMs);
    if (steps > 1) missing += steps - 1;
  }
  return missing;
}

export function relativeAgeLabel(value, now = new Date()) {
  const timestamp = new Date(value).getTime();
  const nowTimestamp = new Date(now).getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowTimestamp)) return 'onbekend';
  const minutes = Math.max(0, Math.floor((nowTimestamp - timestamp) / 60000));
  if (minutes < 1) return 'zojuist';
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'dag' : 'dagen'} geleden`;
}

export function groupSelectedPeriods(points, selected, intervalMinutes) {
  const intervalMs = Number(intervalMinutes) * 60000;
  const periods = [];
  const chosen = points
    .filter((point) => selected.has(point.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);

  for (const point of chosen) {
    const last = periods.at(-1);
    const endTimestamp = point.timestamp + intervalMs;
    if (last && last.dayKey === point.dayKey && last.endTimestamp === point.timestamp) {
      last.averagePrice = (last.averagePrice * last.durationMinutes + point.price * Number(intervalMinutes))
        / (last.durationMinutes + Number(intervalMinutes));
      last.endTimestamp = endTimestamp;
      last.durationMinutes += Number(intervalMinutes);
    } else {
      periods.push({
        dayKey: point.dayKey,
        startTimestamp: point.timestamp,
        endTimestamp,
        durationMinutes: Number(intervalMinutes),
        averagePrice: point.price,
      });
    }
  }
  return periods;
}

export function createPriceTicks(minimum, maximum, count = 5) {
  const size = Math.max(2, Math.trunc(count));
  const step = (Number(maximum) - Number(minimum)) / (size - 1);
  return Array.from({ length: size }, (_, index) => Number((Number(maximum) - step * index).toFixed(10)));
}

export function normalizePoints(data, timeZone) {
  if (!Array.isArray(data)) return [];
  return data
    .map((entry) => {
      const timestamp = new Date(entry?.start_time).getTime();
      const price = Number(entry?.price_per_kwh);
      if (!Number.isFinite(timestamp) || !Number.isFinite(price)) return null;
      return {
        startTime: entry.start_time,
        timestamp,
        price,
        dayKey: localDayKey(timestamp, timeZone),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp);
}

export function getVisiblePoints(data, now = new Date(), timeZone = 'Europe/Amsterdam', tomorrowAfterHour = 14) {
  const today = localDayKey(now, timeZone);
  const tomorrow = addDaysToKey(today, 1);
  const showTomorrow = localHour(now, timeZone) >= Number(tomorrowAfterHour);
  return normalizePoints(data, timeZone).filter(
    (point) => point.dayKey === today || (showTomorrow && point.dayKey === tomorrow),
  );
}

export function splitByLocalDay(points) {
  const groups = new Map();
  for (const point of points) {
    if (!groups.has(point.dayKey)) groups.set(point.dayKey, []);
    groups.get(point.dayKey).push(point);
  }
  return groups;
}

export function inferIntervalMinutes(points) {
  const differences = [];
  for (let index = 1; index < points.length; index += 1) {
    const minutes = (points[index].timestamp - points[index - 1].timestamp) / 60000;
    if (minutes > 0 && minutes <= 180) differences.push(minutes);
  }
  if (!differences.length) return 60;
  differences.sort((a, b) => a - b);
  return differences[Math.floor(differences.length / 2)];
}

export function findCurrentPoint(points, now = new Date()) {
  if (!points.length) return null;
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const intervalMs = inferIntervalMinutes(points) * 60000;
  return points.find((point) => point.timestamp <= timestamp && timestamp < point.timestamp + intervalMs) ?? null;
}

export function selectCheapestDuration(points, totalMinutes = 240, options = {}) {
  return selectDurationByPrice(points, totalMinutes, 'lowest', options);
}

export function selectHighestDuration(points, totalMinutes = 240, options = {}) {
  return selectDurationByPrice(points, totalMinutes, 'highest', options);
}

function compareScore(candidate, current, direction) {
  if (!current) return true;
  return direction === 'highest' ? candidate > current.score : candidate < current.score;
}

function selectContiguousDuration(points, count, intervalMinutes, direction) {
  let best = null;
  for (let start = 0; start + count <= points.length; start += 1) {
    const window = points.slice(start, start + count);
    const contiguous = window.every((point, index) => (
      index === 0 || point.timestamp - window[index - 1].timestamp === intervalMinutes * 60000
    ));
    if (!contiguous) continue;
    const score = window.reduce((total, point) => total + point.price, 0);
    if (compareScore(score, best, direction)) best = { score, window };
  }
  return new Set((best?.window ?? []).map((point) => point.timestamp));
}

function selectMinimumBlocks(points, count, intervalMinutes, minimumBlockMinutes, direction) {
  const requestedMinimum = Number(minimumBlockMinutes);
  const minimumCount = Math.max(1, Math.min(
    count,
    Number.isFinite(requestedMinimum) ? Math.ceil(requestedMinimum / intervalMinutes) : 2,
  ));
  let states = new Map([['0|0', { selected: 0, run: 0, score: 0, indices: [] }]]);
  for (let index = 0; index < points.length; index += 1) {
    const contiguous = index === 0 || points[index].timestamp - points[index - 1].timestamp === intervalMinutes * 60000;
    const next = new Map();
    const save = (state) => {
      const key = `${state.selected}|${state.run}`;
      if (compareScore(state.score, next.get(key), direction)) next.set(key, state);
    };
    for (const original of states.values()) {
      if (!contiguous && original.run > 0 && original.run < minimumCount) continue;
      const state = !contiguous && original.run >= minimumCount ? { ...original, run: 0 } : original;
      if (state.run === 0 || state.run >= minimumCount) save({ ...state, run: 0 });
      if (state.selected < count) {
        const run = state.run === 0 ? 1 : Math.min(minimumCount, state.run + 1);
        save({
          selected: state.selected + 1,
          run,
          score: state.score + points[index].price,
          indices: [...state.indices, index],
        });
      }
    }
    states = next;
  }
  const candidates = [...states.values()].filter((state) => (
    state.selected === count && (state.run === 0 || state.run >= minimumCount)
  ));
  const best = candidates.reduce((current, candidate) => (
    compareScore(candidate.score, current, direction) ? candidate : current
  ), null);
  return new Set((best?.indices ?? []).map((index) => points[index].timestamp));
}

function selectDurationByPrice(points, totalMinutes, direction, options = {}) {
  const selected = new Set();
  if (!points.length || totalMinutes <= 0) return selected;
  const intervalMinutes = inferIntervalMinutes(points);
  const count = Math.min(points.length, Math.ceil(totalMinutes / intervalMinutes));
  const mode = normalizeSelectionMode(options.mode);
  if (mode === 'contiguous') return selectContiguousDuration(points, count, intervalMinutes, direction);
  if (mode === 'minimum_blocks') {
    return selectMinimumBlocks(points, count, intervalMinutes, options.minimumBlockMinutes, direction);
  }
  const ordered = [...points].sort(
    direction === 'highest'
      ? (left, right) => right.price - left.price || left.timestamp - right.timestamp
      : (left, right) => left.price - right.price || left.timestamp - right.timestamp,
  );
  for (const point of ordered.slice(0, count).sort((left, right) => left.timestamp - right.timestamp)) {
    selected.add(point.timestamp);
  }
  return selected;
}
