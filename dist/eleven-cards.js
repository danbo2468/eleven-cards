// Eleven Cards — HACS collection; five cards, no external dependencies.
// Eleven Dynamic Energy Price Card — standalone dashboard bundle
(()=>{
"use strict";
// Domain-neutral SVG renderer. Adapters own data, geometry, colors and annotations.
function graphLineStyle(style, width = 3.5) {
  return {style, width, dash: style === 'dashed' ? '8 7' : style === 'dotted' ? '1 7' : 'none', cap: style === 'dashed' ? 'butt' : 'round'};
}
const graphAttribute = value => String(value).replace(/[&"<>]/g, c => ({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
class SharedGraph {
  static hoverGroup(host) {
    return host._config?.sync_hover === false ? null : (host._config?.hover_sync_group?.trim() || 'default');
  }
  static hoverState() {
    const key = Symbol.for('eleven-cards.hover-sync.v1');
    const target = globalThis.window ?? globalThis;
    return target[key] ??= new Map();
  }
  static connectHover(host, receive) {
    this.disconnectHover(host);
    host._receiveSharedHover = receive;
    host._sharedHoverListener = event => {
      const {source, group, timestamp} = event.detail;
      if (source !== host && host.isConnected && group === this.hoverGroup(host)) receive(timestamp);
    };
    window.addEventListener('eleven-cards:hover-sync', host._sharedHoverListener);
    // Scroll does not cross shadow roots: listen in every enclosing tree.
    host._sharedScrollTargets = [window];
    for (let root = host.getRootNode?.(); root && root !== window; root = root.host?.getRootNode()) {
      host._sharedScrollTargets.push(root);
    }
    host._sharedScrollListener = event => {
      if (event?.composedPath?.().some(node => node?.classList?.contains('tooltip'))) return;
      host._hideTooltip();
    };
    for (const target of host._sharedScrollTargets) target.addEventListener('scroll', host._sharedScrollListener, true);
    window.addEventListener('resize', host._sharedScrollListener);
  }
  static tooltipInView(host) {
    const chart = host.shadowRoot?.querySelector('.chart');
    const box = chart?.getBoundingClientRect?.();
    if (!box) return true;
    const bottom = box.bottom ?? box.top + box.height, right = box.right ?? box.left + box.width;
    if (bottom <= 0 || right <= 0 || box.top >= (window.innerHeight ?? Infinity) || box.left >= (window.innerWidth ?? Infinity)) return false;
    // Respect nested scrolling/clipping containers, including HA's shadow trees.
    for (let node = host; node; node = node.parentElement ?? node.getRootNode?.().host) {
      if (!node.getBoundingClientRect || !globalThis.getComputedStyle) continue;
      const style = getComputedStyle(node), clipX = /auto|scroll|hidden|clip/.test(style.overflowX), clipY = /auto|scroll|hidden|clip/.test(style.overflowY);
      if (!clipX && !clipY) continue;
      const bounds = node.getBoundingClientRect();
      if ((clipY && (bottom <= bounds.top || box.top >= bounds.bottom)) || (clipX && (right <= bounds.left || box.left >= bounds.right))) return false;
    }
    return true;
  }
  static tooltipStyles() {
    return `.tooltip{position:absolute;z-index:4;box-sizing:border-box;min-width:0;max-width:calc(100% - 8px);padding:8px 10px;border:1px solid var(--divider-color,#ddd);border-radius:6px;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));box-shadow:0 3px 12px #0002;font-size:12px;line-height:1.4;font-variant-numeric:tabular-nums;overflow:auto;overflow-wrap:anywhere;pointer-events:none}.tooltip[hidden]{display:none}.tooltip strong{display:block;margin-bottom:4px;white-space:normal}.tooltip span{display:grid;grid-template-columns:9px minmax(0,1fr);column-gap:6px;margin-top:5px;white-space:normal}.tooltip i{display:block;width:9px;height:9px;margin:4px 0 0;border:0;border-radius:3px;flex-shrink:0;background:var(--series-color)}.tooltip b{font-weight:600;min-width:0;overflow-wrap:anywhere}.tooltip small{display:block;grid-column:2;color:var(--secondary-text-color,#666);font-size:10px;white-space:normal;font-variant-numeric:tabular-nums}`;
  }
  static publishHover(host, timestamp) {
    const group = this.hoverGroup(host);
    if (!group || !host.isConnected || !Number.isFinite(timestamp)) return;
    this.hoverState().set(group, {source: host, timestamp});
    window.dispatchEvent(new CustomEvent('eleven-cards:hover-sync', {detail: {source: host, group, timestamp}}));
  }
  static clearHover(host) {
    for (const [group, active] of this.hoverState()) {
      if (active.source !== host) continue;
      this.hoverState().delete(group);
      window.dispatchEvent(new CustomEvent('eleven-cards:hover-sync', {detail: {source: host, group, timestamp: null}}));
    }
  }
  static hoverSourceInEvent(host, event) {
    const active = this.hoverState().get(this.hoverGroup(host));
    return Boolean(active && event.composedPath().includes(active.source));
  }
  static restoreHover(host) {
    if (!host.isConnected) return;
    const active = this.hoverState().get(this.hoverGroup(host));
    if (active && host.isConnected) host._receiveSharedHover?.(active.timestamp);
  }
  static disconnectHover(host) {
    this.clearHover(host);
    if (host._sharedHoverListener) globalThis.window?.removeEventListener('eleven-cards:hover-sync', host._sharedHoverListener);
    for (const target of host._sharedScrollTargets ?? []) target.removeEventListener('scroll', host._sharedScrollListener, true);
    globalThis.window?.removeEventListener('resize', host._sharedScrollListener);
    host._sharedScrollTargets = [];
    host._sharedScrollListener = null;
    host._sharedHoverListener = null;
    host._receiveSharedHover = null;
  }
  static interpolation(value, fallback = 'smooth') {
    const mode = value == null || value === '' ? fallback : value;
    if (!['smooth', 'linear', 'step'].includes(mode)) throw new Error('line_interpolation');
    return mode;
  }
  static path(points, mode = 'smooth', end) {
    mode = this.interpolation(mode);
    let path = '', previous = null;
    for (const [x, y] of points) {
      if (!Number.isFinite(y)) {
        if (previous && end !== undefined) path += ` H ${x}`;
        previous = null;
        continue;
      }
      if (!previous) path += `${path ? ' ' : ''}M ${x} ${y}`;
      else if (mode === 'linear') path += ` L ${x} ${y}`;
      else if (mode === 'step') path += ` H ${x} V ${y}`;
      else {
        const middle = (previous[0] + x) / 2;
        path += ` C ${middle} ${previous[1]}, ${middle} ${y}, ${x} ${y}`;
      }
      previous = [x, y];
    }
    if (previous && end !== undefined) path += ` H ${end}`;
    return path;
  }
  render(host, {viewBox, defs = '', before = '', after = '', fills = [], lines = []}) {
    const previous = host.shadowRoot.querySelector('.chart-enter')?.getAnimations?.().find(a => a.animationName === 'chart-reveal' && a.playState !== 'finished' && Number(a.currentTime ?? 0) < 650);
    this.progress = Number(previous?.currentTime ?? 0);
    this.entering = Boolean(host.isConnected && (!this.loaded || previous) && lines.some(p => p.d));
    if (host.isConnected && lines.some(p => p.d)) this.loaded = true;
    const areas = fills.filter(p => p.d).map(p => `<path d="${graphAttribute(p.d)}" class="${graphAttribute(p.className)}"${p.fill ? ` fill="${graphAttribute(p.fill)}"` : ''}${p.opacity != null ? ` fill-opacity="${p.opacity}"` : ''}${p.mask ? ` mask="${graphAttribute(p.mask)}"` : ''}/>`).join('');
    const paths = lines.filter(p => p.d).map(p => {
      const a = p.appearance;
      const stroke = p.inlineStyle ? `style="stroke:${graphAttribute(a.stroke)};stroke-width:${a.width};stroke-dasharray:${a.dash};stroke-linecap:${a.cap}"` : `stroke="${graphAttribute(a.stroke)}" stroke-width="${a.width}" stroke-dasharray="${a.dash}" stroke-linecap="${a.cap}"`;
      return `<path d="${graphAttribute(p.d)}" class="${graphAttribute(p.className)}"${p.entity ? ` data-entity="${graphAttribute(p.entity)}"` : ''} ${stroke}/>`;
    }).join('');
    return `<svg viewBox="${viewBox}" preserveAspectRatio="none" aria-hidden="true">${defs}${before}<g class="chart-series${this.entering ? ' chart-enter' : ''}">${areas}${paths}</g>${after}</svg>`;
  }
  restore(host) {
    if (this.entering && this.progress > 0) {
      const animation = host.shadowRoot.querySelector('.chart-enter')?.getAnimations?.().find(a => a.animationName === 'chart-reveal');
      if (animation) animation.currentTime = this.progress;
    }
  }
}
function graphStyles() {
  return `
      .price-line, .series-line { fill: none; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
      .chart-enter { animation: chart-reveal 650ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      @keyframes chart-reveal {
        from { clip-path: inset(0 100% 0 0); }
        to { clip-path: inset(0 0 0 0); }
      }
      .hover-dot { position: absolute; z-index: 2; width: 12px; height: 12px; box-sizing: border-box; border: 3px solid; border-radius: 50%; transform: translate(-50%, -50%); background: var(--card-background-color); pointer-events: none; }
      @media (prefers-reduced-motion: reduce) { .chart-enter { animation: none; } }
  `;
}

// Observed boundary deltas only: never interpolate a meter or split hourly energy.
function consumptionFromHistory(history, start, end, intervalMinutes, now = Date.now()) {
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
function consumptionFromStatistics(rows, start, end, now = Date.now()) {
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
function placeEnergyTooltip(width, height, boxWidth, boxHeight, anchorX, anchorY, markers) {
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

function zonedParts(value, timeZone) {
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

function localDayKey(value, timeZone) {
  const parts = zonedParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localHour(value, timeZone) {
  return Number(zonedParts(value, timeZone).hour);
}

function addDaysToKey(dayKey, days) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calculateAveragePrice(points) {
  if (!points.length) return null;
  return points.reduce((total, point) => total + Number(point.price), 0) / points.length;
}

function offsetPriceData(data, offset) {
  const amount = Number(offset);
  if (!Array.isArray(data) || !Number.isFinite(amount)) return [];
  return data.map((entry) => ({
    ...entry,
    price_per_kwh: Number((Number(entry?.price_per_kwh) + amount).toFixed(10)),
  }));
}

function mergePriceSeries(importPoints = [], exportPoints = []) {
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

function classifyPrice(price, threshold = 0.25) {
  return Number(price) < Number(threshold) ? 'cheap' : 'expensive';
}

function classifyPriceLevel(price, cheapPrice = 0.15, normalPrice = 0.25, expensivePrice = 0.40) {
  const value = Number(price);
  if (value < 0) return 'negative';
  if (value <= Number(cheapPrice)) return 'cheap';
  if (value <= Number(expensivePrice)) return 'normal';
  return 'expensive';
}

function isCheapestHoursEnabled(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function normalizeLineStyle(value, fallback = 'solid') {
  const allowed = new Set(['solid', 'dashed', 'dotted']);
  return allowed.has(value) ? value : allowed.has(fallback) ? fallback : 'solid';
}

function normalizeSelectionMode(value) {
  return ['individual', 'contiguous', 'minimum_blocks'].includes(value) ? value : 'individual';
}

function normalizeLineWidth(value, fallback = 3.5) {
  const parsed = Number(value);
  const fallbackValue = Number(fallback);
  const width = Number.isFinite(parsed) ? parsed : Number.isFinite(fallbackValue) ? fallbackValue : 3.5;
  return Math.round(Math.min(8, Math.max(1, width)) * 2) / 2;
}

function rgbColorToCss(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const channels = value.map(Number);
  if (!channels.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)) return null;
  return `rgb(${channels.join(', ')})`;
}

function countMissingIntervals(points, intervalMinutes = inferIntervalMinutes(points)) {
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

function relativeAgeLabel(value, now = new Date()) {
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

function groupSelectedPeriods(points, selected, intervalMinutes) {
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

function createPriceTicks(minimum, maximum, count = 5) {
  const size = Math.max(2, Math.trunc(count));
  const step = (Number(maximum) - Number(minimum)) / (size - 1);
  return Array.from({ length: size }, (_, index) => Number((Number(maximum) - step * index).toFixed(10)));
}

// get_price returns unscaled base-currency totals, not chartdata metadata.
function tibberPriceData(response) {
  if(response?.success===false)throw Error('unavailable');
  if(!Array.isArray(response?.price_info))throw Error('format');
  return response.price_info.flatMap(row=>{
    if(typeof row?.total!=='number' || !Number.isFinite(row.total) || typeof row.startsAt!=='string' || !Number.isFinite(Date.parse(row.startsAt)))return [];
    return [{start_time:row.startsAt,price_per_kwh:row.total}];
  });
}

function tibberPriceRange(now, timeZone) {
  const day=localDayKey(now,timeZone);
  const midnight=key=>{
    const target=Date.parse(`${key}T00:00:00Z`);
    let instant=target;
    // Resolve each midnight independently: a two-day range can span 47/49 hours.
    for(let i=0;i<4;i++) {
      const p=zonedParts(instant,timeZone);
      const local=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
      if(local===target)return new Date(instant).toISOString();
      instant+=target-local;
    }
    throw Error('timezone');
  };
  return {start_time:midnight(day),end_time:midnight(addDaysToKey(day,2))};
}

// Zonneplan One exposes raw fixed-point amounts in forecast, not its scaled sensor state.
function zonneplanPriceData(forecast) {
  if(!Array.isArray(forecast))return [];
  return forecast.flatMap(row=>{
    const start_time=row?.start_date ?? row?.datetime;
    const amount=row?.price_tax_included?.amount ?? row?.electricity_price;
    if(typeof amount!=='number' || !Number.isFinite(amount) || !Number.isFinite(Date.parse(start_time)))return [];
    return [{start_time,price_per_kwh:amount/10000000}];
  });
}

function normalizePoints(data, timeZone) {
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

function getVisiblePoints(data, now = new Date(), timeZone = 'Europe/Amsterdam', tomorrowAfterHour = 14) {
  const today = localDayKey(now, timeZone);
  const tomorrow = addDaysToKey(today, 1);
  const showTomorrow = localHour(now, timeZone) >= Number(tomorrowAfterHour);
  return normalizePoints(data, timeZone).filter(
    (point) => point.dayKey === today || (showTomorrow && point.dayKey === tomorrow),
  );
}

function splitByLocalDay(points) {
  const groups = new Map();
  for (const point of points) {
    if (!groups.has(point.dayKey)) groups.set(point.dayKey, []);
    groups.get(point.dayKey).push(point);
  }
  return groups;
}

function inferIntervalMinutes(points) {
  const differences = [];
  for (let index = 1; index < points.length; index += 1) {
    const minutes = (points[index].timestamp - points[index - 1].timestamp) / 60000;
    if (minutes > 0 && minutes <= 180) differences.push(minutes);
  }
  if (!differences.length) return 60;
  differences.sort((a, b) => a - b);
  return differences[Math.floor(differences.length / 2)];
}

function findCurrentPoint(points, now = new Date()) {
  if (!points.length) return null;
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const intervalMs = inferIntervalMinutes(points) * 60000;
  return points.find((point) => point.timestamp <= timestamp && timestamp < point.timestamp + intervalMs) ?? null;
}

function selectCheapestDuration(points, totalMinutes = 240, options = {}) {
  return selectDurationByPrice(points, totalMinutes, 'lowest', options);
}

function selectHighestDuration(points, totalMinutes = 240, options = {}) {
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

// Dutch source strings are translation keys; no user-provided text is translated.
const ENGLISH = Object.freeze({
  "Prijsbron":"Price source",
  "Tibber-aansluiting":"Tibber connection",
  "Prijs-/templatesensor":"Price/template sensor",
  "Tibber Prices (get_price)":"Tibber Prices (get_price)",
  "Kies een prijs-/templatesensor, Tibber Prices get_price of Zonneplan One forecast.":"Choose a price/template sensor, Tibber Prices get_price or Zonneplan One forecast.",
  "Selecteer de Zonneplan One-tariefsensor met forecast. Uur- en kwartierprijzen worden omgerekend naar EUR/kWh.":"Select the Zonneplan One tariff sensor with forecast. Hourly and quarter-hour prices are converted to EUR/kWh.",
  "Optioneel bij één aansluiting. Kies de aansluiting bij meerdere Tibber Prices-configuraties. Alleen EUR/kWh.":"Optional with one connection. Select the connection when multiple Tibber Prices configurations exist. EUR/kWh only.",
  "Tibber-prijzen laden…":"Loading Tibber prices…",
  "Tibber-prijzen niet beschikbaar":"Tibber prices unavailable",
  "Alleen EUR/kWh wordt ondersteund.":"Only EUR/kWh is supported.",
  "Prijsgegevens worden opgehaald.":"Fetching price data.",
  "Controleer de Tibber Prices-integratie, get_price en de gekozen aansluiting.":"Check the Tibber Prices integration, get_price and the selected connection.",
  "Kies een prijsbron":"Choose a price source",
  "Selecteer een prijsbron bij Afname in de kaartinstellingen.":"Select a price source under Import in the card settings.",
  "De tabel verschijnt niet omdat er 0 uur is geselecteerd. Stel Goedkoopste uren per dag in op meer dan 0.":"The table is not shown because 0 hours are selected. Set Cheapest hours per day to a value greater than 0.",
  "De tabel verschijnt niet omdat er 0 uur is geselecteerd. Stel Beste terugleveruren per dag in op meer dan 0.":"The table is not shown because 0 hours are selected. Set Best export hours per day to a value greater than 0.",
  "Prijsgrenzen en prijskleuren":"Price thresholds and colors",
  "Tabelkolommen":"Table columns",
  "Lijn":"Line",
  "Vulling":"Fill",
  "Vaste kleur":"Fixed color",
  "Volg lijn":"Follow line",
  "Eigen kleur":"Own color",
  "Lijnkleur":"Line color",
  "Vulkleurmodus":"Fill color mode",
  "Dekking":"Opacity",
  "Dezelfde grenzen gelden voor beide tarieven; lage afnameprijzen en hoge terugleverprijzen zijn gunstig.":"The same thresholds apply to both tariffs; low import prices and high export prices are favorable.",
  "Leeg behoudt de bestaande themakleur. Volg lijn volgt ook de prijskleuren.":"Empty preserves the existing theme color. Follow line also follows price colors.",
  "Prijskleuren volgen de prijsgrenzen. Vaste kleur geldt voor de hele lijn.":"Price colors follow the thresholds. Fixed color applies to the entire line.",
  "Lijnverloop": "Line interpolation",
  "Vloeiend": "Smooth",
  "Recht": "Linear",
  "Trapvormig": "Stepped",
  "Netafname": "Grid import",
  "Verbruiksbron ontbreekt": "Consumption source missing",
  "Gebruik een cumulatieve netafnamemeter in kWh": "Use a cumulative grid-import meter in kWh",
  "Verbruik laden…": "Loading consumption\u2026",
  "Verbruikshistorie niet beschikbaar": "Consumption history unavailable",
  "Geen voltooide verbruiksintervallen": "No completed consumption intervals",
  "Verbruikshistorie is onvolledig": "Consumption history is incomplete",
  "Netafname energie": "Grid-import energy",
  "Verbruikslijn tonen": "Show consumption line",
  "Energiemeter netafname": "Grid-import energy meter",
  "Toont gemeten netafname in kWh per voltooid interval, op een aparte schaal.": "Shows measured grid import in kWh per completed interval, on a separate scale.",
  "Cumulatieve netafnamemeter in kWh (energy, total_increasing). Geen vermogen of huishoudelijk verbruik inclusief zon.": "Cumulative grid-import meter in kWh (energy, total_increasing). Not power or household consumption including solar.",
  "Optioneel. Leeg gebruikt de secundaire thematekstkleur.": "Optional. Empty uses the secondary theme text color.",
  "Toont een transparante kleur onder de verbruikslijn.": "Shows a transparent fill below the consumption line.",
  "Optioneel. Leeg gebruikt de verbruikslijnkleur.": "Optional. Empty uses the consumption line color.",
  "Vdg.": "Today",
  "Mrg.": "Tmr.",
  "Af.": "Imp.",
  "Ter.": "Exp.",
  "Afname": "Import",
  "Teruglevering": "Export",
  "Afname en teruglevering": "Import and export",
  "Geen": "None",
  "Doorgetrokken": "Solid",
  "Gestreept": "Dashed",
  "Gestippeld": "Dotted",
  "Losse kwartieren": "Individual intervals",
  "Eén aaneengesloten blok": "One continuous block",
  "Blokken met minimale duur": "Blocks with minimum duration",
  "Prijsentity afname": "Import price entity",
  "Prijsentity teruglevering": "Export price entity",
  "Correctie op terugleverprijs": "Export price correction",
  "Grafiek": "Graph",
  "Actuele prijzen": "Current prices",
  "Titel": "Title",
  "Titel tonen": "Show title",
  "Verticale hoverlijn": "Vertical hover line",
  "Hover synchroniseren": "Synchronize hover",
  "Hover-synchronisatiegroep": "Hover synchronization group",
  "Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.": "Shares the selected time with other Eleven graphs on this page.",
  "Kaarten met dezelfde groep volgen elkaar. Leeg gebruikt de standaardgroep.": "Cards with the same group follow each other. Empty uses the default group.",
  "Gemiddelde prijslijn": "Average price line",
  "Gemiddelde prijs in tabel": "Average price in table",
  "Dag in tabel": "Day column in table",
  "Tarief in tabel": "Tariff column in table",
  "Starttijd in tabel": "Start time column in table",
  "Eindtijd in tabel": "End time column in table",
  "Duur in tabel": "Duration column in table",
  "Gem. prijs": "Avg. price",
  "Toont de gemiddelde prijs per periode in de afname- en teruglevertabel, in ct/kWh.": "Shows the average price per period in the import and export table, in ct/kWh.",
  "Prijsgrenzen tonen": "Show price thresholds",
  "Lijnstijl": "Line style",
  "Lijndikte": "Line width",
  "Vaste lijnkleur": "Fixed line color",
  "Vulling onder lijn": "Fill below line",
  "Vulkleur": "Fill color",
  "Vulling vervagen": "Fade fill",
  "Selectiemethode": "Selection method",
  "Minimale blokduur": "Minimum block duration",
  "Gunstige perioden": "Favorable periods",
  "Lijn en vulling": "Line and fill",
  "Prijskleuren": "Price colors",
  "Goedkope prijs": "Cheap price",
  "Normale prijs": "Normal price",
  "Dure prijs": "Expensive price",
  "Prijs rond nul": "Price around zero",
  "Negatieve prijs": "Negative price",
  "Kleur gunstige afnameperioden": "Favorable import period color",
  "Kleur gunstige terugleverperioden": "Favorable export period color",
  "Goedkoop": "Cheap",
  "Normaal": "Normal",
  "Duur": "Duration",
  "Goedkoopste uren per dag": "Cheapest hours per day",
  "Beste terugleveruren per dag": "Best export hours per day",
  "Tabel goedkoopste momenten": "Cheapest periods table",
  "Tabel beste teruglevermomenten": "Best export periods table",
  "Morgenprijzen tonen vanaf": "Show tomorrow's prices from",
  "Algemeen": "General",
  "uur": "h",
  "Een prijsentity voor afname is verplicht.": "An import price entity is required.",
  "Prijsniveaus moeten oplopen: goedkoop < normaal < duur.": "Price thresholds must increase: cheap < normal < expensive.",
  "Afname-entiteit niet gevonden": "Import entity not found",
  "Terugleverbron ontbreekt": "Export source missing",
  "Stel export_entity in, of kies alleen afname.": "Set export_entity, or select import only.",
  "Teruglever-entiteit niet gevonden": "Export entity not found",
  "Nog geen prijsgegevens": "No price data yet",
  "De afname-entiteit bevat geen prijsintervallen voor vandaag.": "The import entity has no price intervals for today.",
  "Nu": "Now",
  "nu": "now",
  "Gem. afname": "Avg. import",
  "Gem. teruglevering": "Avg. export",
  "Vandaag": "Today",
  "Morgen": "Tomorrow",
  "prijsinterval ontbreekt": "price interval missing",
  "prijsintervallen ontbreken": "price intervals missing",
  "Morgenprijzen ontbreken": "Tomorrow's prices are missing",
  "Morgenprijzen zijn onvolledig": "Tomorrow's prices are incomplete",
  "Legenda": "Legend",
  "Elektriciteitsprijzen per interval. Gebruik de pijltjestoetsen om prijzen te bekijken.": "Electricity prices per interval. Use the arrow keys to inspect prices.",
  "Goedkoopst": "Cheapest",
  "Beste opbrengst": "Best return",
  "onbekend": "unknown",
  "Toon": "Show",
  "Verberg": "Hide",
  "Gunstige momenten": "Favorable periods",
  "Dag": "Day",
  "Moment": "Tariff",
  "Start": "Start",
  "Einde": "End",
  "goedkoopste": "cheapest",
  "beste": "best",
  "afname": "import",
  "teruglevering": "export",
  "niet beschikbaar": "unavailable",
  "cent per kilowattuur": "cents per kilowatt-hour",
  "tot": "to",
  "Dynamische energieprijzen": "Dynamic energy prices",
  "Afname- en terugleverprijzen met gunstige momenten per dag.": "Import and export prices with favorable periods per day.",
  "Kies welke tarieven in de gedeelde tijdgrafiek staan.": "Choose which tariffs appear in the shared time chart.",
  "Staat los van de gekozen grafiekweergave.": "Independent of the selected graph mode.",
  "Verberg de titel om actieve gunstige-urencontext op die plek te tonen.": "Hide the title to show active favorable-hours context in its place.",
  "Toont een verticale hulplijn bij het actieve prijsinterval.": "Shows a vertical guide for the active price interval.",
  "Toont per zichtbare tariefreeks een gelabeld gemiddelde.": "Shows a labeled average for each visible tariff series.",
  "Toont de lijnen en prijslabels voor goedkoop, normaal en duur.": "Shows the cheap, normal and expensive threshold lines and price labels.",
  "Kies doorgetrokken, gestreept of gestippeld.": "Choose solid, dashed or dotted.",
  "Lijndikte van 1 tot 8 pixels.": "Line thickness from 1 to 8 pixels.",
  "Optioneel. Leeg behoudt de automatische prijskleuren.": "Optional. Empty keeps automatic price colors.",
  "Toont een transparante kleur onder de afnamelijn.": "Shows a transparent fill below the import line.",
  "Optioneel. Leeg gebruikt de primaire Home Assistant-kleur.": "Optional. Empty uses the Home Assistant primary color.",
  "Laat de vulling geleidelijk transparant worden naar de onderkant.": "Gradually fades the fill towards the bottom.",
  "Kies losse kwartieren, één blok of meerdere blokken.": "Choose individual intervals, one block or multiple blocks.",
  "Alleen gebruikt bij blokken met minimale duur.": "Only used for blocks with minimum duration.",
  "Toont een transparante kleur onder de terugleverlijn.": "Shows a transparent fill below the export line.",
  "Optioneel. Leeg gebruikt blauw.": "Optional. Empty uses blue.",
  "Optioneel. Leeg behoudt de groene themakleur voor gunstige prijzen.": "Optional. Empty keeps the theme's green color for favorable prices.",
  "Optioneel. Leeg behoudt de standaard oranje prijskleur.": "Optional. Empty keeps the default orange price color.",
  "Optioneel. Leeg behoudt de rode themakleur voor ongunstige prijzen.": "Optional. Empty keeps the theme's red color for unfavorable prices.",
  "Optioneel. Leeg behoudt de standaard kleur rond nul in de afnamegradiënt.": "Optional. Empty keeps the default zero-price color in the import gradient.",
  "Optioneel. Leeg behoudt de standaard negatieve afnameprijskleur.": "Optional. Empty keeps the default negative import price color.",
  "Optioneel, onafhankelijk van prijskleuren. Leeg behoudt de groene themakleur voor perioden, labels en tabel.": "Optional, independent of price colors. Empty keeps the theme's green color for periods, labels and table.",
  "Optioneel, onafhankelijk van prijskleuren. Leeg behoudt blauw voor perioden, labels en tabel.": "Optional, independent of price colors. Empty keeps blue for periods, labels and table.",
  "Onder deze prijs is afname goedkoop; voor teruglevering is laag juist ongunstig.": "Below this price import is cheap; for export low prices are unfavorable.",
  "Middelste prijsgrens voor beide tarieven.": "Middle price threshold for both tariffs.",
  "Boven deze prijs is afname duur en teruglevering gunstig.": "Above this price import is expensive and export is favorable.",
  "0 schakelt de selectie van goedkope afname-uren uit.": "0 disables cheap import hour selection.",
  "Toont aaneengesloten goedkope afnamemomenten onder de grafiek.": "Shows continuous cheap import periods below the chart.",
  "Prijsbron voor teruglevering. Verplicht zodra teruglevering wordt getoond.": "Export price source. Required whenever export is shown.",
  "Terugleverprijs = prijs uit terugleverentity + verschil. Negatieve waarden zijn toegestaan.": "Export price = export entity price + correction. Negative values are allowed.",
  "0 schakelt de selectie van beste terugleveruren uit.": "0 disables best export hour selection.",
  "Toont aaneengesloten beste teruglevermomenten onder de grafiek.": "Shows continuous best export periods below the chart.",
  "Vanaf dit uur worden beschikbare morgenprijzen getoond.": "Available tomorrow prices are shown from this hour.",
  "Controleer {entity} in de cardconfiguratie.": "Check {entity} in the card configuration.",
  "Goedkoopste {hours} uur/dag": "Cheapest {hours} h/day",
  "Beste teruglevering {hours} uur/dag": "Best export {hours} h/day",
  "Huidige {tariff}prijs {price}": "Current {tariff} price {price}",
  "{hours} u {minutes} min": "{hours} h {minutes} min",
  "{hours} uur": "{hours} h"
});

function resolveLanguage(hass) {
  const language = hass?.locale?.language ?? hass?.language;
  return typeof language === 'string' && /^nl(?:[-_]|$)/i.test(language) ? 'nl' : 'en';
}

// getConfigForm has no hass argument in HA. Schema getters read the frontend root;
// native computeLabel/computeHelper are invoked as methods of hui-form-editor.
function frontendHass() {
  return typeof document === 'undefined' ? undefined : document.querySelector('home-assistant')?.hass;
}

function translate(text, language = 'en', values = {}) {
  const template = language === 'nl' ? text : ENGLISH[text] ?? text;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}

function formatDuration(minutes, language = 'en') {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours && remainder ? translate('{hours} u {minutes} min', language, { hours, minutes: remainder })
    : hours ? translate('{hours} uur', language, { hours }) : `${remainder} min`;
}

const SVG_WIDTH = 1000;
const SVG_HEIGHT = 330;
const PLOT = { left: 44, right: 12, top: 20, bottom: 34 };
const IMPORT_MODES = new Set(['import', 'both']);
const EXPORT_MODES = new Set(['export', 'both']);
const DEFAULT_CONFIG = Object.freeze({
  import_source: 'sensor',
  export_source: 'sensor',
  line_interpolation: 'smooth',
  graph_mode: 'import',
  current_price_mode: 'import',
  show_title: true,
  show_hover_line: true,
  sync_hover: true,
  hover_sync_group: '',
  show_average_line: false,
  show_period_average: false,
  show_period_day: true,
  show_period_type: true,
  show_period_start: true,
  show_period_end: true,
  show_period_duration: true,
  show_consumption: false,
  consumption_line_style: 'solid',
  consumption_line_width: 1.5,
  show_consumption_fill: false,
  consumption_fill_fade: true,
  show_price_levels: true,
  tomorrow_after: 14,
  cheap_price: 0.15,
  normal_price: 0.25,
  expensive_price: 0.40,
  cheapest_hours: 0,
  import_selection_mode: 'individual',
  import_minimum_duration: 30,
  show_cheapest_table: false,
  import_line_style: 'solid',
  import_line_width: 3.5,
  show_import_fill: true,
  import_fill_fade: true,
  export_price_offset: 0,
  export_best_hours: 0,
  export_selection_mode: 'individual',
  export_minimum_duration: 30,
  show_export_table: false,
  export_line_style: 'dashed',
  export_line_width: 3.5,
  show_export_fill: false,
  export_fill_fade: true,
});

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const formatPrice = (value, digits = 2, language = 'en') => new Intl.NumberFormat(language === 'nl' ? 'nl-NL' : 'en-GB', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
}).format(Number(value) * 100);

const formatTime = (timestamp, timeZone, language = 'en') => new Intl.DateTimeFormat(language === 'nl' ? 'nl-NL' : 'en-GB', {
  timeZone,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}).format(new Date(timestamp));

const formatDay = (timestamp, timeZone, language = 'en') => new Intl.DateTimeFormat(language === 'nl' ? 'nl-NL' : 'en-GB', {
  timeZone,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
}).format(new Date(timestamp));

const seriesPath = (timeline, key, xFor, yFor, intervalMs, interpolation = 'smooth') => {
  const segments = [];
  let segment = [];
  let previousTimestamp = null;
  for (const point of timeline) {
    const price = point[key];
    if (!Number.isFinite(price) || (previousTimestamp !== null && point.timestamp - previousTimestamp > intervalMs * 1.5)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (Number.isFinite(price)) {
      segment.push([xFor(point.timestamp), yFor(price)]);
      previousTimestamp = point.timestamp;
    } else {
      previousTimestamp = null;
    }
  }
  if (segment.length) segments.push(segment);
  return segments.map(points => SharedGraph.path(points, interpolation)).join(' ');
};

const editorText = (text) => translate(text, resolveLanguage(frontendHass()));

const modeOptions = (includeNone = false) => [
  { value: 'import', label: editorText("Afname") },
  { value: 'both', label: editorText("Afname en teruglevering") },
  { value: 'export', label: editorText("Teruglevering") },
  ...(includeNone ? [{ value: 'none', label: editorText("Geen") }] : []),
];

const lineStyleOptions = () => [
  { value: 'solid', label: editorText("Doorgetrokken") },
  { value: 'dashed', label: editorText("Gestreept") },
  { value: 'dotted', label: editorText("Gestippeld") },
];

const selectionModeOptions = () => [
  { value: 'individual', label: editorText("Losse kwartieren") },
  { value: 'contiguous', label: editorText("Eén aaneengesloten blok") },
  { value: 'minimum_blocks', label: editorText("Blokken met minimale duur") },
];

class EnergySettingsEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});}
  setConfig(c){this._data=DynamicEnergyPriceCard.editorConfig(c);this._render();}
  set hass(h){this._hass=h;this._render();}
  get hass(){return this._hass;}
  connectedCallback(){this._render();}
  _render(){
    if(!this._data||!this._hass)return;
    if(!this._form){
      this.shadowRoot.innerHTML='<style>:host{display:block;min-width:0}ha-form{display:block;min-width:0}</style><ha-form></ha-form>';
      this._form=this.shadowRoot.querySelector('ha-form');
      this._form.addEventListener('value-changed',e=>{
        e.stopPropagation();this._data=DynamicEnergyPriceCard.editorConfig({...this._data,...DynamicEnergyPriceCard.editorStoredConfig(e.detail.value)});this._render();
        this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:DynamicEnergyPriceCard.editorConfig(this._data)},bubbles:true,composed:true}));
      });
    }
    const f=DynamicEnergyPriceCard.getConfigForm(this._data);this._form.hass=this._hass;this._form.data=DynamicEnergyPriceCard.editorDisplayConfig(this._data);this._form.schema=f.schema;
    this._form.computeLabel=s=>f.computeLabel.call(this,s);this._form.computeHelper=s=>this._computeHelper(f,s);
  }
  _computeHelper(form,schema){
    const text=form.computeHelper.call(this,schema);
    const hours={show_cheapest_table:'cheapest_hours',show_export_table:'export_best_hours'}[schema?.name];
    if(!hours||!this._data[schema.name]||isCheapestHoursEnabled(this._data[hours]))return text;
    // Native ha-selector renders helper content with Lit, including safe DOM nodes.
    // Scope emphasis to this warning; other helpers and switch labels stay unchanged.
    const warning=document.createElement('span');
    warning.className='period-table-warning';
    warning.style.color='var(--warning-color, #ff9800)';
    warning.style.fontWeight='600';
    warning.setAttribute('role','status');
    warning.textContent=text;
    return warning;
  }
}
class DynamicEnergyPriceCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hiddenSeries = new Set();
    this._onOutsidePointer = (event) => {
      const chart = this.shadowRoot?.querySelector('.chart');
      if (chart && !event.composedPath().includes(chart) && !SharedGraph.hoverSourceInEvent(this, event)) this._hideTooltip();
    };
  }

  static editorConfig(config = {}) {
    const clone = v => Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])) : v;
    const data = clone({...DEFAULT_CONFIG,...config});
    for (const p of ['import','export','consumption']) {
      data[`${p}_line_interpolation`] ??= data.line_interpolation;
      data[`${p}_color_mode`] ??= rgbColorToCss(data[`${p}_line_color`]) ? 'fixed' : p==='consumption' ? 'fixed' : 'price';
      data[`${p}_fill_mode`] ??= p==='consumption' && !rgbColorToCss(data[`${p}_fill_color`]) ? 'line' : 'own';
      data[`${p}_fill_opacity`] ??= data[`${p}_fill_fade`]!==false ? p==='consumption' ? .18 : .22 : .14;
    }
    delete data.line_interpolation;
    return data;
  }
  // Only the visual form uses cents. Public YAML and renderer stay in euros/kWh.
  static editorDisplayConfig(config) {
    const data=this.editorConfig(config);
    for(const key of ['cheap_price','normal_price','expensive_price','export_price_offset'])
      if(Number.isFinite(data[key]))data[key]=Number((data[key]*100).toPrecision(15));
    return data;
  }
  static editorStoredConfig(config) {
    const data={...config};
    for(const key of ['cheap_price','normal_price','expensive_price','export_price_offset'])
      if(Number.isFinite(data[key]))data[key]=Number((data[key]/100).toPrecision(15));
    return data;
  }
  static async getConfigElement() {
    if (!customElements.get('ha-form')) {
      const helpers=await window.loadCardHelpers(),card=await helpers.createCardElement({type:'entities',entities:[]});
      await card.constructor.getConfigElement();await customElements.whenDefined('ha-form');
    }
    if(!customElements.get('eleven-energy-editor'))customElements.define('eleven-energy-editor',EnergySettingsEditor);
    return document.createElement('eleven-energy-editor');
  }
  static getConfigForm(config) {
    const data=this.editorConfig(config),base=this._legacyConfigForm(),all=new Map();
    const collect=s=>s.forEach(f=>f.schema?collect(f.schema):all.set(f.name,f));collect(base.schema);
    const field=name=>all.get(name),group=(name,title,schema)=>({type:'expandable',name,get title(){return editorText(title);},flatten:true,schema});
    const select=(name,options)=>({name,selector:{select:{mode:'dropdown',get options(){return options.map(([value,label])=>({value,label:editorText(label)}));}}}});
    const line=p=>group(p+'_line_settings','Lijn',[
      field(p+'_line_width'),field(p+'_line_style'),{...select(p+'_line_interpolation',[['smooth','Vloeiend'],['linear','Recht'],['step','Trapvormig']]),default:'smooth'},
      ...(p==='consumption'?[field(p+'_line_color')]:[
        select(p+'_color_mode',[['price','Prijskleuren'],['fixed','Vaste kleur']]),
        ...(data[p+'_color_mode']==='fixed'?[field(p+'_line_color')]:[])
      ])
    ]);
    const fill=p=>group(p+'_fill_settings','Vulling',[
      field('show_'+p+'_fill'),...(data['show_'+p+'_fill']?[
        {name:p+'_fill_opacity',selector:{number:{min:0,max:1,step:.01,mode:'slider'}}},field(p+'_fill_fade'),
        select(p+'_fill_mode',[['line','Volg lijn'],['own','Eigen kleur']]),
        ...(data[p+'_fill_mode']==='own'?[field(p+'_fill_color')]:[])
      ]:[])
    ]);
    const favorable=p=>group(p+'_favorable_settings','Gunstige perioden',[
      field(p==='import'?'cheapest_hours':'export_best_hours'),field(p+'_selection_mode'),
      ...(data[p+'_selection_mode']==='minimum_blocks'?[field(p+'_minimum_duration')]:[]),
      field(p+'_favorable_color'),field(p==='import'?'show_cheapest_table':'show_export_table')
    ]);
    const source=p=>[
      select(p+'_source',[['sensor','Prijs-/templatesensor'],['tibber_prices','Tibber Prices (get_price)'],['zonneplan','Zonneplan One (forecast)']]),
      ...(data[p+'_source']==='tibber_prices'
        ? [{name:p+'_tibber_entry',selector:{config_entry:{integration:'tibber_prices'}}}]
        : [field(p==='import'?'entity':'export_entity')])
    ];
    const schema=[
      group('graph_settings','Algemeen',['title','show_title','graph_mode','current_price_mode','tomorrow_after','show_average_line','show_price_levels','show_hover_line','sync_hover',...(data.sync_hover?['hover_sync_group']:[])].map(field)),
      group('price_settings','Prijsgrenzen en prijskleuren',[
        ...['cheap_price','normal_price','expensive_price'].map(field),
        group('price_color_settings','Prijskleuren',['cheap_color','normal_color','expensive_color','zero_color','negative_color'].map(field))
      ]),
      group('import_settings','Afname',[...source('import'),line('import'),fill('import'),favorable('import')]),
      group('export_settings','Teruglevering',[...source('export'),field('export_price_offset'),line('export'),fill('export'),favorable('export')]),
      group('consumption_settings','Netafname energie',[field('show_consumption'),...(data.show_consumption?[field('consumption_entity'),line('consumption'),fill('consumption')]:[])]),
      group('table_settings','Tabelkolommen',['day','type','start','end','duration','average'].map(c=>field('show_period_'+c)))
    ];
    const newLabels={graph_settings:'Algemeen',price_settings:'Prijsgrenzen en prijskleuren',table_settings:'Tabelkolommen'};
    const suffix={source:'Prijsbron',tibber_entry:'Tibber-aansluiting',line_interpolation:'Lijnverloop',color_mode:'Lijnkleur',fill_mode:'Vulkleurmodus',fill_opacity:'Dekking',line_settings:'Lijn',fill_settings:'Vulling'};
    return {schema,computeLabel:function(s){const key=s?.name??'',label=newLabels[key]??suffix[key.replace(/^(import|export|consumption)_/,'')];return label?translate(label,resolveLanguage(this?.hass??frontendHass())):base.computeLabel.call(this,s);},computeHelper:function(s){
      const key=s?.name??'',lang=resolveLanguage(this?.hass??frontendHass());
      if(key.endsWith('_source'))return translate('Kies een prijs-/templatesensor, Tibber Prices get_price of Zonneplan One forecast.',lang);
      if((key==='entity' && data.import_source==='zonneplan') || (key==='export_entity' && data.export_source==='zonneplan'))
        return translate('Selecteer de Zonneplan One-tariefsensor met forecast. Uur- en kwartierprijzen worden omgerekend naar EUR/kWh.',lang);
      if(key.endsWith('_tibber_entry'))return translate('Optioneel bij één aansluiting. Kies de aansluiting bij meerdere Tibber Prices-configuraties. Alleen EUR/kWh.',lang);
      if(key==='show_cheapest_table' && data.show_cheapest_table && !isCheapestHoursEnabled(data.cheapest_hours))
        return translate('De tabel verschijnt niet omdat er 0 uur is geselecteerd. Stel Goedkoopste uren per dag in op meer dan 0.',lang);
      if(key==='show_export_table' && data.show_export_table && !isCheapestHoursEnabled(data.export_best_hours))
        return translate('De tabel verschijnt niet omdat er 0 uur is geselecteerd. Stel Beste terugleveruren per dag in op meer dan 0.',lang);
      if(key==='price_settings')return translate('Dezelfde grenzen gelden voor beide tarieven; lage afnameprijzen en hoge terugleverprijzen zijn gunstig.',lang);
      if(['import_line_color','export_line_color'].includes(key))return translate('Optioneel. Leeg gebruikt de primaire Home Assistant-kleur.',lang);
      if(key.endsWith('_fill_color'))return translate('Leeg behoudt de bestaande themakleur. Volg lijn volgt ook de prijskleuren.',lang);
      if(key.endsWith('_color_mode'))return translate('Prijskleuren volgen de prijsgrenzen. Vaste kleur geldt voor de hele lijn.',lang);
      return base.computeHelper.call(this,s);
    }};
  }
  static _legacyConfigForm() {
    const labels = {
      general_settings: 'Algemeen',
      line_interpolation: 'Lijnverloop',
      consumption_settings: "Netafname energie",
      show_consumption: "Verbruikslijn tonen",
      consumption_entity: "Energiemeter netafname",
      consumption_line_style: "Lijnstijl",
      consumption_line_width: "Lijndikte",
      consumption_line_color: "Vaste lijnkleur",
      show_consumption_fill: "Vulling onder lijn",
      consumption_fill_color: "Vulkleur",
      consumption_fill_fade: "Vulling vervagen",
      import_settings: 'Afname',
      export_settings: 'Teruglevering',
      entity: "Prijsentity afname",
      export_entity: "Prijsentity teruglevering",
      export_price_offset: "Correctie op terugleverprijs",
      graph_mode: "Grafiek",
      current_price_mode: "Actuele prijzen",
      title: "Titel",
      show_title: "Titel tonen",
      show_hover_line: "Verticale hoverlijn",
      sync_hover: "Hover synchroniseren",
      hover_sync_group: "Hover-synchronisatiegroep",
      show_average_line: "Gemiddelde prijslijn",
      show_period_average: "Gemiddelde prijs in tabel",
      show_period_day: "Dag in tabel",
      show_period_type: "Tarief in tabel",
      show_period_start: "Starttijd in tabel",
      show_period_end: "Eindtijd in tabel",
      show_period_duration: "Duur in tabel",
      show_price_levels: "Prijsgrenzen tonen",
      import_line_style: "Lijnstijl",
      import_line_width: "Lijndikte",
      import_line_color: "Vaste lijnkleur",
      show_import_fill: "Vulling onder lijn",
      import_fill_color: "Vulkleur",
      import_fill_fade: "Vulling vervagen",
      import_selection_mode: "Selectiemethode",
      import_minimum_duration: "Minimale blokduur",
      import_favorable_settings: "Gunstige perioden",
      import_appearance_settings: "Lijn en vulling",
      export_line_style: "Lijnstijl",
      export_line_width: "Lijndikte",
      export_line_color: "Vaste lijnkleur",
      show_export_fill: "Vulling onder lijn",
      export_fill_color: "Vulkleur",
      export_fill_fade: "Vulling vervagen",
      export_selection_mode: "Selectiemethode",
      export_minimum_duration: "Minimale blokduur",
      export_favorable_settings: "Gunstige perioden",
      export_appearance_settings: "Lijn en vulling",
      price_color_settings: "Prijskleuren",
      cheap_color: "Goedkope prijs",
      normal_color: "Normale prijs",
      expensive_color: "Dure prijs",
      zero_color: "Prijs rond nul",
      negative_color: "Negatieve prijs",
      import_favorable_color: "Kleur gunstige afnameperioden",
      export_favorable_color: "Kleur gunstige terugleverperioden",
      cheap_price: "Goedkoop",
      normal_price: "Normaal",
      expensive_price: "Duur",
      cheapest_hours: "Goedkoopste uren per dag",
      export_best_hours: "Beste terugleveruren per dag",
      show_cheapest_table: "Tabel goedkoopste momenten",
      show_export_table: "Tabel beste teruglevermomenten",
      tomorrow_after: "Morgenprijzen tonen vanaf",
    };
    const numberSelector = (unit) => ({
      number: { min: 0, max: 24, step: 1, mode: 'slider', get unit_of_measurement() { return unit === 'uur' ? editorText('uur') : unit; } },
    });
    const thresholdSelector = {
      number: { min: -100, max: 100, step: 1, mode: 'slider', unit_of_measurement: 'ct/kWh' },
    };
    const lineStyleSelector = { select: { mode: 'dropdown', get options() { return lineStyleOptions(); } } };
    const lineWidthSelector = {
      number: { min: 1, max: 8, step: 0.5, mode: 'box', unit_of_measurement: 'px' },
    };
    const lineColorSelector = { color_rgb: {} };
    const selectionModeSelector = { select: { mode: 'dropdown', get options() { return selectionModeOptions(); } } };
    const minimumDurationSelector = {
      number: { min: 15, max: 360, step: 15, mode: 'box', unit_of_measurement: 'min' },
    };

    return {
      schema: [
        {
          type: 'expandable',
          name: 'general_settings',
          get title() { return editorText("Algemeen"); },
          flatten: true,
          schema: [
            {
              name: 'graph_mode', default: DEFAULT_CONFIG.graph_mode,
              selector: { select: { mode: 'dropdown', get options() { return modeOptions(); } } },
            },
            {
              name: 'current_price_mode', default: DEFAULT_CONFIG.current_price_mode,
              selector: { select: { mode: 'dropdown', get options() { return modeOptions(true); } } },
            },
            { name: 'line_interpolation', default: DEFAULT_CONFIG.line_interpolation, selector: { select: { mode: 'dropdown', get options() { return [{value:'smooth',label:editorText('Vloeiend')},{value:'linear',label:editorText('Recht')},{value:'step',label:editorText('Trapvormig')}]; } } } },
            { name: 'title', selector: { text: {} } },
            { name: 'show_title', default: DEFAULT_CONFIG.show_title, selector: { boolean: {} } },
            { name: 'show_hover_line', default: DEFAULT_CONFIG.show_hover_line, selector: { boolean: {} } },
            { name: 'sync_hover', default: true, selector: { boolean: {} } },
            { name: 'hover_sync_group', selector: { text: {} } },
            { name: 'show_average_line', default: DEFAULT_CONFIG.show_average_line, selector: { boolean: {} } },
            { name: 'show_period_average', default: DEFAULT_CONFIG.show_period_average, selector: { boolean: {} } },
            ...['day', 'type', 'start', 'end', 'duration'].map(column => ({ name: `show_period_${column}`, default: DEFAULT_CONFIG[`show_period_${column}`], selector: { boolean: {} } })),
            { name: 'show_price_levels', default: DEFAULT_CONFIG.show_price_levels, selector: { boolean: {} } },
            { name: 'tomorrow_after', default: DEFAULT_CONFIG.tomorrow_after, required: true, selector: numberSelector('uur') },
            { name: 'cheap_price', default: DEFAULT_CONFIG.cheap_price * 100, required: true, selector: thresholdSelector },
            { name: 'normal_price', default: DEFAULT_CONFIG.normal_price * 100, required: true, selector: thresholdSelector },
            { name: 'expensive_price', default: DEFAULT_CONFIG.expensive_price * 100, required: true, selector: thresholdSelector },
            {
              type: 'expandable', name: 'price_color_settings', get title() { return editorText("Prijskleuren"); }, flatten: true,
              schema: [
                { name: 'cheap_color', selector: lineColorSelector },
                { name: 'normal_color', selector: lineColorSelector },
                { name: 'expensive_color', selector: lineColorSelector },
                { name: 'zero_color', selector: lineColorSelector },
                { name: 'negative_color', selector: lineColorSelector },
              ],
            },
          ],
        },
        {
          type: 'expandable',
          name: 'import_settings',
          get title() { return editorText("Afname"); },
          flatten: true,
          schema: [
            {
              name: 'entity',
              required: true,
              selector: { entity: { domain: 'sensor' } },
            },
            {
              type: 'expandable', name: 'import_favorable_settings', get title() { return editorText("Gunstige perioden"); }, flatten: true,
              schema: [
                { name: 'cheapest_hours', default: DEFAULT_CONFIG.cheapest_hours, selector: numberSelector('uur') },
                { name: 'import_selection_mode', default: DEFAULT_CONFIG.import_selection_mode, selector: selectionModeSelector },
                { name: 'import_minimum_duration', default: DEFAULT_CONFIG.import_minimum_duration, selector: minimumDurationSelector },
                { name: 'show_cheapest_table', default: DEFAULT_CONFIG.show_cheapest_table, selector: { boolean: {} } },
                { name: 'import_favorable_color', selector: lineColorSelector },
              ],
            },
            {
              type: 'expandable', name: 'import_appearance_settings', get title() { return editorText("Lijn en vulling"); }, flatten: true,
              schema: [
                { name: 'import_line_style', default: DEFAULT_CONFIG.import_line_style, selector: lineStyleSelector },
                { name: 'import_line_width', default: DEFAULT_CONFIG.import_line_width, selector: lineWidthSelector },
                { name: 'import_line_color', selector: lineColorSelector },
                { name: 'show_import_fill', default: DEFAULT_CONFIG.show_import_fill, selector: { boolean: {} } },
                { name: 'import_fill_color', selector: lineColorSelector },
                { name: 'import_fill_fade', default: DEFAULT_CONFIG.import_fill_fade, selector: { boolean: {} } },
              ],
            },
          ],
        },
        {
          type: 'expandable',
          name: 'export_settings',
          get title() { return editorText("Teruglevering"); },
          flatten: true,
          schema: [
            { name: 'export_entity', selector: { entity: { domain: 'sensor' } } },
            {
              name: 'export_price_offset', default: DEFAULT_CONFIG.export_price_offset,
              selector: { number: { min: -100, max: 100, step: 0.1, mode: 'box', unit_of_measurement: 'ct/kWh' } },
            },
            {
              type: 'expandable', name: 'export_favorable_settings', get title() { return editorText("Gunstige perioden"); }, flatten: true,
              schema: [
                { name: 'export_best_hours', default: DEFAULT_CONFIG.export_best_hours, selector: numberSelector('uur') },
                { name: 'export_selection_mode', default: DEFAULT_CONFIG.export_selection_mode, selector: selectionModeSelector },
                { name: 'export_minimum_duration', default: DEFAULT_CONFIG.export_minimum_duration, selector: minimumDurationSelector },
                { name: 'show_export_table', default: DEFAULT_CONFIG.show_export_table, selector: { boolean: {} } },
                { name: 'export_favorable_color', selector: lineColorSelector },
              ],
            },
            {
              type: 'expandable', name: 'export_appearance_settings', get title() { return editorText("Lijn en vulling"); }, flatten: true,
              schema: [
                { name: 'export_line_style', default: DEFAULT_CONFIG.export_line_style, selector: lineStyleSelector },
                { name: 'export_line_width', default: DEFAULT_CONFIG.export_line_width, selector: lineWidthSelector },
                { name: 'export_line_color', selector: lineColorSelector },
                { name: 'show_export_fill', default: DEFAULT_CONFIG.show_export_fill, selector: { boolean: {} } },
                { name: 'export_fill_color', selector: lineColorSelector },
                { name: 'export_fill_fade', default: DEFAULT_CONFIG.export_fill_fade, selector: { boolean: {} } },
              ],
            },
          ],
        },
        { type: 'expandable', name: 'consumption_settings', get title() { return editorText('Netafname energie'); }, flatten: true,
          schema: [
            { name: 'show_consumption', default: DEFAULT_CONFIG.show_consumption, selector: { boolean: {} } },
            { name: 'consumption_entity', selector: { entity: { domain: 'sensor', device_class: 'energy' } } },
            { name: 'consumption_line_style', default: DEFAULT_CONFIG.consumption_line_style, selector: lineStyleSelector },
            { name: 'consumption_line_width', default: DEFAULT_CONFIG.consumption_line_width, selector: lineWidthSelector },
            { name: 'consumption_line_color', selector: lineColorSelector },
            { name: 'show_consumption_fill', default: DEFAULT_CONFIG.show_consumption_fill, selector: { boolean: {} } },
            { name: 'consumption_fill_color', selector: lineColorSelector },
            { name: 'consumption_fill_fade', default: DEFAULT_CONFIG.consumption_fill_fade, selector: { boolean: {} } },
          ],
        },
      ],
      computeLabel: function (schema) {
        if (!schema?.name) return schema?.title ?? '';
        if (schema.name === "expensive_price" && resolveLanguage(this?.hass ?? frontendHass()) === "en") return "Expensive";
        return translate(labels[schema.name] ?? schema.title ?? schema.name, resolveLanguage(this?.hass ?? frontendHass()));
      },
      computeHelper: function (schema) {
        const helpers = ({
        show_consumption: "Toont gemeten netafname in kWh per voltooid interval, op een aparte schaal.",
        consumption_entity: "Cumulatieve netafnamemeter in kWh (energy, total_increasing). Geen vermogen of huishoudelijk verbruik inclusief zon.",
        consumption_line_style: "Kies doorgetrokken, gestreept of gestippeld.",
        consumption_line_width: "Lijndikte van 1 tot 8 pixels.",
        consumption_line_color: "Optioneel. Leeg gebruikt de secundaire thematekstkleur.",
        show_consumption_fill: "Toont een transparante kleur onder de verbruikslijn.",
        consumption_fill_color: "Optioneel. Leeg gebruikt de verbruikslijnkleur.",
        consumption_fill_fade: "Laat de vulling geleidelijk transparant worden naar de onderkant.",
        graph_mode: "Kies welke tarieven in de gedeelde tijdgrafiek staan.",
        current_price_mode: "Staat los van de gekozen grafiekweergave.",
        show_title: "Verberg de titel om actieve gunstige-urencontext op die plek te tonen.",
        show_hover_line: "Toont een verticale hulplijn bij het actieve prijsinterval.",
        sync_hover: "Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.",
        hover_sync_group: "Kaarten met dezelfde groep volgen elkaar. Leeg gebruikt de standaardgroep.",
        show_average_line: "Toont per zichtbare tariefreeks een gelabeld gemiddelde.",
        show_period_average: "Toont de gemiddelde prijs per periode in de afname- en teruglevertabel, in ct/kWh.",
        show_price_levels: "Toont de lijnen en prijslabels voor goedkoop, normaal en duur.",
        import_line_style: "Kies doorgetrokken, gestreept of gestippeld.",
        import_line_width: "Lijndikte van 1 tot 8 pixels.",
        import_line_color: "Optioneel. Leeg behoudt de automatische prijskleuren.",
        show_import_fill: "Toont een transparante kleur onder de afnamelijn.",
        import_fill_color: "Optioneel. Leeg gebruikt de primaire Home Assistant-kleur.",
        import_fill_fade: "Laat de vulling geleidelijk transparant worden naar de onderkant.",
        import_selection_mode: "Kies losse kwartieren, één blok of meerdere blokken.",
        import_minimum_duration: "Alleen gebruikt bij blokken met minimale duur.",
        export_line_style: "Kies doorgetrokken, gestreept of gestippeld.",
        export_line_width: "Lijndikte van 1 tot 8 pixels.",
        export_line_color: "Optioneel. Leeg behoudt de automatische prijskleuren.",
        show_export_fill: "Toont een transparante kleur onder de terugleverlijn.",
        export_fill_color: "Optioneel. Leeg gebruikt blauw.",
        export_fill_fade: "Laat de vulling geleidelijk transparant worden naar de onderkant.",
        export_selection_mode: "Kies losse kwartieren, één blok of meerdere blokken.",
        export_minimum_duration: "Alleen gebruikt bij blokken met minimale duur.",
        cheap_color: "Optioneel. Leeg behoudt de groene themakleur voor gunstige prijzen.",
        normal_color: "Optioneel. Leeg behoudt de standaard oranje prijskleur.",
        expensive_color: "Optioneel. Leeg behoudt de rode themakleur voor ongunstige prijzen.",
        zero_color: "Optioneel. Leeg behoudt de standaard kleur rond nul in de afnamegradiënt.",
        negative_color: "Optioneel. Leeg behoudt de standaard negatieve afnameprijskleur.",
        import_favorable_color: "Optioneel, onafhankelijk van prijskleuren. Leeg behoudt de groene themakleur voor perioden, labels en tabel.",
        export_favorable_color: "Optioneel, onafhankelijk van prijskleuren. Leeg behoudt blauw voor perioden, labels en tabel.",
        cheap_price: "Onder deze prijs is afname goedkoop; voor teruglevering is laag juist ongunstig.",
        normal_price: "Middelste prijsgrens voor beide tarieven.",
        expensive_price: "Boven deze prijs is afname duur en teruglevering gunstig.",
        cheapest_hours: "0 schakelt de selectie van goedkope afname-uren uit.",
        show_cheapest_table: "Toont aaneengesloten goedkope afnamemomenten onder de grafiek.",
        export_entity: "Prijsbron voor teruglevering. Verplicht zodra teruglevering wordt getoond.",
        export_price_offset: "Terugleverprijs = prijs uit terugleverentity + verschil. Negatieve waarden zijn toegestaan.",
        export_best_hours: "0 schakelt de selectie van beste terugleveruren uit.",
        show_export_table: "Toont aaneengesloten beste teruglevermomenten onder de grafiek.",
        tomorrow_after: "Vanaf dit uur worden beschikbare morgenprijzen getoond.",
      });
        const text = helpers[schema?.name];
        return text === undefined ? undefined : translate(text, resolveLanguage(this?.hass ?? frontendHass()));
      },
    };
  }

  static getStubConfig() {
    return {
      ...DEFAULT_CONFIG,
    };
  }

  setConfig(config) {
    config ??= {};
    if (config.sync_hover !== undefined && typeof config.sync_hover !== 'boolean') throw new Error('sync_hover');
    if (config.hover_sync_group != null && typeof config.hover_sync_group !== 'string') throw new Error('hover_sync_group');
    SharedGraph.clearHover(this);
    this._config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    for(const prefix of ['import','export']) {
      if(!['sensor','tibber_prices','zonneplan'].includes(this._config[`${prefix}_source`]))throw Error(`${prefix}_source`);
    }
    this._resetTibber();
    this._watchTibberConnection();
    this._config.line_interpolation = SharedGraph.interpolation(this._config.line_interpolation);
    for(const p of ['import','export','consumption']) {
      if(this._config[p+'_line_interpolation']!==undefined)SharedGraph.interpolation(this._config[p+'_line_interpolation']);
      const cm=this._config[p+'_color_mode'],fm=this._config[p+'_fill_mode'],opacity=this._config[p+'_fill_opacity'];
      if(cm!==undefined&&!['fixed','price'].includes(cm))throw Error(p+'_color_mode');
      if(fm!==undefined&&!['own','line'].includes(fm))throw Error(p+'_fill_mode');
      if(opacity!==undefined&&(!Number.isFinite(opacity)||opacity<0||opacity>1))throw Error(p+'_fill_opacity');
    }
    if (!['import', 'both', 'export'].includes(this._config.graph_mode)) this._config.graph_mode = 'import';
    if (!['import', 'both', 'export', 'none'].includes(this._config.current_price_mode)) this._config.current_price_mode = 'import';
    this._config.import_selection_mode = normalizeSelectionMode(this._config.import_selection_mode);
    this._config.export_selection_mode = normalizeSelectionMode(this._config.export_selection_mode);
    const levels = [this._config.cheap_price, this._config.normal_price, this._config.expensive_price].map(Number);
    if (!levels.every(Number.isFinite) || !(levels[0] < levels[1] && levels[1] < levels[2])) {
      throw new Error(this._t("Prijsniveaus moeten oplopen: goedkoop < normaal < duur."));
    }
    this._resetConsumption();
    this._watchConsumptionConnection();
    this._observeConsumptionSize();
    this._lastSignature = null;
    this._activeIndex = null;
  }

  get _language() { return resolveLanguage(this._hass ?? frontendHass()); }
  _t(text, values) { return translate(text, this._language, values); }
  _formatPrice(value, digits = 2) { return formatPrice(value, digits, this._language); }
  _formatTime(timestamp, timeZone) { return formatTime(timestamp, timeZone, this._language); }
  _formatDay(timestamp, timeZone) { return formatDay(timestamp, timeZone, this._language); }

  _hasExportSource() {
    return this._config?.export_source === 'tibber_prices' || Boolean(this._config?.export_entity);
  }

  _tibberKey(prefix) {
    const zone=this._hass?.config?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return `${this._config[`${prefix}_tibber_entry`] || ''}|${localDayKey(new Date(),zone)}`;
  }

  _sourceState(prefix) {
    if(this._config[`${prefix}_source`] === 'zonneplan') {
      const state=this._hass?.states?.[this._config[prefix==='import'?'entity':'export_entity']];
      return state ? {...state,attributes:{...state.attributes,data:zonneplanPriceData(state.attributes?.forecast)}} : null;
    }
    if(this._config[`${prefix}_source`] !== 'tibber_prices')
      return this._hass?.states?.[this._config[prefix==='import'?'entity':'export_entity']];
    const cached=this._tibberCache?.get(this._tibberKey(prefix));
    return cached?.status==='ready' ? {attributes:{data:cached.data}} : null;
  }

  _resetTibber() {
    if(this._tibberTimer)clearTimeout(this._tibberTimer);
    this._tibberTimer=undefined;
    this._tibberCache = new Map();
  }

  _unwatchTibberConnection() {
    for(const event of ['ready','disconnected'])this._tibberConnection?.removeEventListener(event,this._onTibberConnection);
    this._tibberConnection=undefined;
  }

  _scheduleTibberRefresh() {
    if(!this.isConnected || this._tibberTimer)return;
    this._tibberTimer=setTimeout(()=>{
      this._resetTibber();
      if(this.isConnected && this._hass)this._render();
    },300000);
  }

  _watchTibberConnection() {
    const needed=this._config?.import_source==='tibber_prices' || (this._exportRequired() && this._config?.export_source==='tibber_prices');
    const connection=needed?this._hass?.connection:undefined;
    if(connection===this._tibberConnection)return;
    this._unwatchTibberConnection();this._resetTibber();this._tibberConnection=connection;
    this._onTibberConnection=()=>{
      this._resetTibber();this._lastSignature=null;
      if(connection?.connected!==false && this._config && this._hass)this._render();
    };
    for(const event of ['ready','disconnected'])connection?.addEventListener(event,this._onTibberConnection);
  }

  _tibberStatusCard(prefix) {
    const status=this._tibberCache?.get(this._tibberKey(prefix))?.status;
    const label=this._t(prefix==='import'?'Afname':'Teruglevering');
    return this._stateCard(
      this._t(status==='loading'?'Tibber-prijzen laden…':'Tibber-prijzen niet beschikbaar'),
      `${label}: ${this._t(status==='currency'?'Alleen EUR/kWh wordt ondersteund.':status==='loading'?'Prijsgegevens worden opgehaald.':'Controleer de Tibber Prices-integratie, get_price en de gekozen aansluiting.')}`,
    );
  }

  _ensureTibber(prefix) {
    if(this._config[`${prefix}_source`] !== 'tibber_prices' || !this._hass || this._hass.connection?.connected===false) return;
    const key=this._tibberKey(prefix);
    this._tibberCache ??= new Map();
    const previous=this._tibberCache.get(key);
    if(previous && (previous.status==='loading' || Date.now()-previous.fetchedAt<300000)) {
      if(previous.status!=='loading')this._scheduleTibberRefresh();
      return;
    }
    const request={status:'loading'};
    this._tibberCache.set(key,request);
    (async()=>{
      try {
        // get_price has no currency metadata. EUR homes are a documented precondition;
        // HA's configured currency is a guard, not proof of the Tibber home's currency.
        if(this._hass.config?.currency && this._hass.config.currency!=='EUR')throw Error('currency');
        const zone=this._hass.config?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const service_data=tibberPriceRange(new Date(),zone);
        const entry=this._config[`${prefix}_tibber_entry`];
        if(entry)service_data.entry_id=entry;
        const {response}=await this._hass.callWS({type:'call_service',domain:'tibber_prices',service:'get_price',service_data,return_response:true});
        if(this._tibberCache?.get(key)!==request)return;
        Object.assign(request,{status:'ready',data:tibberPriceData(response),fetchedAt:Date.now()});
      } catch(error) {
        if(this._tibberCache?.get(key)!==request)return;
        Object.assign(request,{status:error?.message==='currency'?'currency':'error',fetchedAt:Date.now()});
      }
      this._scheduleTibberRefresh();
      this._render();
    })();
  }

  _exportRequired() {
    return EXPORT_MODES.has(this._config?.graph_mode)
      || EXPORT_MODES.has(this._config?.current_price_mode)
      || isCheapestHoursEnabled(this._config?.export_best_hours);
  }

  _hasAnyTable() {
    const hasCheapestTable = isCheapestHoursEnabled(this._config?.cheapest_hours)
      && Boolean(this._config?.show_cheapest_table);
    const hasExportTable = isCheapestHoursEnabled(this._config?.export_best_hours)
      && Boolean(this._config?.show_export_table);
    return hasCheapestTable || hasExportTable;
  }

  getCardSize() {
    return this._hasAnyTable() ? 9 : 6;
  }

  getGridOptions() {
    const hasCheapestTable = isCheapestHoursEnabled(this._config?.cheapest_hours)
      && Boolean(this._config?.show_cheapest_table);
    const hasExportTable = isCheapestHoursEnabled(this._config?.export_best_hours)
      && Boolean(this._config?.show_export_table);
    const hasAnyTable = hasCheapestTable || hasExportTable;
    return {
      rows: hasCheapestTable ? 9 : 6,
      columns: 12,
      min_rows: hasCheapestTable ? 6 : 4,
      min_columns: 9,
      ...(hasAnyTable ? { rows: 9, min_rows: 6 } : {}),
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    this._watchTibberConnection();
    this._watchConsumptionConnection();
    const importState = hass.states[this._config.entity];
    const exportState = this._config.export_entity ? hass.states[this._config.export_entity] : null;
    const consumptionState = this._config.show_consumption ? hass.states[this._config.consumption_entity] : null;
    const minute = Math.floor(Date.now() / 60000);
    const signature = `${this._language}|${importState?.last_updated ?? 'missing'}|${exportState?.last_updated ?? 'none'}|${consumptionState ? `${consumptionState.attributes?.unit_of_measurement}|${consumptionState.attributes?.device_class}|${consumptionState.attributes?.state_class}` : 'none'}|${minute}|${hass.themes?.darkMode ?? false}`;
    if (signature !== this._lastSignature) {
      this._lastSignature = signature;
      this._render();
    }
  }

  connectedCallback() {
    SharedGraph.connectHover(this, timestamp => this._receiveHover(timestamp));
    this._watchTibberConnection();
    window.addEventListener('pointerdown', this._onOutsidePointer);
    this._watchConsumptionConnection();
    this._observeConsumptionSize();
    if (this._hass && this._config) this._render();
  }

  disconnectedCallback() {
    SharedGraph.disconnectHover(this);
    this._unwatchTibberConnection();
    window.removeEventListener('pointerdown', this._onOutsidePointer);
    this._unwatchConsumptionConnection();
    this._consumptionResizeObserver?.disconnect();
    this._consumptionResizeObserver = undefined;
    this._resetConsumption();
    this._resetTibber();
  }

  _observeConsumptionSize() {
    if (this._config?.show_consumption !== true) {
      this._consumptionResizeObserver?.disconnect();
      this._consumptionResizeObserver = undefined;
      return;
    }
    if (this._consumptionResizeObserver || typeof ResizeObserver === 'undefined') return;
    this._consumptionResizeObserver = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (!width || width === this._consumptionWidth) return;
      this._consumptionWidth = width;
      if (this._hass && this._config?.show_consumption) this._render();
    });
    this._consumptionResizeObserver.observe(this);
  }

  _unwatchConsumptionConnection() {
    for (const event of ['ready', 'disconnected']) this._consumptionConnection?.removeEventListener(event, this._onConsumptionConnection);
    this._consumptionConnection = undefined;
  }

  _watchConsumptionConnection() {
    const connection = this._config?.show_consumption === true ? this._hass?.connection : undefined;
    if (connection === this._consumptionConnection) return;
    this._unwatchConsumptionConnection();
    this._resetConsumption();
    this._consumptionConnection = connection;
    this._onConsumptionConnection = () => {
      this._resetConsumption();
      this._lastSignature = null;
      if (connection?.connected !== false && this._config && this._hass) this._render();
    };
    for (const event of ['ready', 'disconnected']) connection?.addEventListener(event, this._onConsumptionConnection);
  }

  _resetConsumption() {
    this._consumptionGeneration = (this._consumptionGeneration ?? 0) + 1;
    this._consumption = undefined;
    this._consumptionRequest = undefined;
  }

  _ensureConsumption(start, end, intervalMinutes) {
    if (this._config.show_consumption !== true) return;
    const entity = this._config.consumption_entity;
    const state = this._hass?.states?.[entity];
    if (!entity || !state) {
      this._resetConsumption();
      this._consumption = { status: 'source', points: [], intervalMinutes };
      return;
    }
    const attrs = state.attributes;
    if (attrs?.unit_of_measurement !== 'kWh' || attrs.device_class !== 'energy' || attrs.state_class !== 'total_increasing') {
      this._resetConsumption();
      this._consumption = { status: 'invalid', points: [], intervalMinutes };
      return;
    }
    const key = `${entity}|${start}|${end}|${intervalMinutes}`;
    if (this._consumptionRequest?.key === key) return;
    if (this._consumption?.key === key && Date.now() - this._consumption.fetchedAt < 300000) return;
    const generation = this._consumptionGeneration;
    const hass = this._hass;
    const request = { key };
    this._consumptionRequest = request;
    this._consumption = { key, status: 'loading', points: [], intervalMinutes };
    const current = () => this._consumptionGeneration === generation && this._consumptionRequest === request;
    (async () => {
      let points = [];
      let cadence = intervalMinutes;
      let source = 'history';
      let historyFailed = false;
      const now = Date.now();
      const until = Math.min(end, now);
      try {
        const query = new URLSearchParams({ filter_entity_id: entity, end_time: new Date(until).toISOString(), minimal_response: '', no_attributes: '', skip_initial_state: '', significant_changes_only: '0' });
        const history = await hass.callApi('GET', `history/period/${new Date(start - 300000).toISOString()}?${query}`);
        if (!current()) return;
        points = consumptionFromHistory(history?.[0] ?? [], start, end, intervalMinutes, now);
      } catch { historyFailed = true; }
      if (!current()) return;
      if (!points.some(point => Number.isFinite(point.energy)) && until - start >= 3600000) {
        try {
          const statistics = await hass.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(start).toISOString(), end_time: new Date(until).toISOString(), statistic_ids: [entity], period: 'hour', types: ['change'], units: { energy: 'kWh' } });
          points = consumptionFromStatistics(statistics?.[entity] ?? [], start, end, now);
          cadence = 60;
          source = 'statistics';
        } catch {
          if (!current()) return;
          this._consumption = { key, fetchedAt: Date.now(), status: 'error', points: [], intervalMinutes };
          this._consumptionRequest = undefined;
          this._render();
          return;
        }
      }
      if (!current()) return;
      const available = points.filter(point => Number.isFinite(point.energy)).length;
      this._consumption = { key, fetchedAt: Date.now(), points, intervalMinutes: cadence, source,
        status: available ? (available < points.length ? 'partial' : 'ready') : historyFailed ? 'error' : 'empty' };
      this._consumptionRequest = undefined;
      this._render();
    })();
  }

  _render() {
    const tibberImport=this._config.import_source==='tibber_prices';
    if (!tibberImport && !this._config.entity) {
      this.shadowRoot.innerHTML = this._stateCard(this._t("Kies een prijsbron"), this._t("Selecteer een prijsbron bij Afname in de kaartinstellingen."));
      return;
    }
    this._ensureTibber('import');
    if(this._exportRequired())this._ensureTibber('export');
    const importState = this._sourceState('import');
    if(tibberImport && !importState) {
      this.shadowRoot.innerHTML=this._tibberStatusCard('import');
      return;
    }
    if (!importState) {
      this.shadowRoot.innerHTML = this._stateCard(
        this._t("Afname-entiteit niet gevonden"),
        this._t("Controleer {entity} in de cardconfiguratie.", { entity: escapeHtml(this._config.entity) }),
      );
      return;
    }
    if (this._exportRequired() && !this._hasExportSource()) {
      this.shadowRoot.innerHTML = this._stateCard(
        this._t("Terugleverbron ontbreekt"),
        this._t("Stel export_entity in, of kies alleen afname."),
      );
      return;
    }
    const exportState = this._sourceState('export');
    if(this._exportRequired() && this._config.export_source==='tibber_prices' && !exportState) {
      this.shadowRoot.innerHTML=this._tibberStatusCard('export');
      return;
    }
    if (this._exportRequired() && this._config.export_entity && !exportState) {
      this.shadowRoot.innerHTML = this._stateCard(
        this._t("Teruglever-entiteit niet gevonden"),
        this._t("Controleer {entity} in de cardconfiguratie.", { entity: escapeHtml(this._config.export_entity) }),
      );
      return;
    }

    const timeZone = this._hass.config.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const rawImportData = importState.attributes?.data;
    const importPoints = getVisiblePoints(rawImportData, now, timeZone, this._config.tomorrow_after);
    if (!importPoints.length) {
      this.shadowRoot.innerHTML = this._stateCard(
        this._t("Nog geen prijsgegevens"),
        this._t("De afname-entiteit bevat geen prijsintervallen voor vandaag."),
      );
      return;
    }

    const hasExportOffset = this._config.export_price_offset !== undefined
      && this._config.export_price_offset !== null
      && this._config.export_price_offset !== ''
      && Number.isFinite(Number(this._config.export_price_offset));
    const exportOffset = hasExportOffset ? Number(this._config.export_price_offset) : 0;
    const rawExportData = exportState
      ? offsetPriceData(exportState.attributes?.data, exportOffset)
      : null;
    const exportPoints = rawExportData
      ? getVisiblePoints(rawExportData, now, timeZone, this._config.tomorrow_after)
      : [];
    const timeline = mergePriceSeries(importPoints, exportPoints);
    const graphIncludesImport = IMPORT_MODES.has(this._config.graph_mode);
    const graphIncludesExport = EXPORT_MODES.has(this._config.graph_mode);
    const graphShowsImport = graphIncludesImport && !this._hiddenSeries.has('import');
    const graphShowsExport = graphIncludesExport && !this._hiddenSeries.has('export');
    const currentShowsImport = IMPORT_MODES.has(this._config.current_price_mode);
    const currentShowsExport = EXPORT_MODES.has(this._config.current_price_mode);

    const importGroups = splitByLocalDay(importPoints);
    const exportGroups = splitByLocalDay(exportPoints);
    const cheapestEnabled = isCheapestHoursEnabled(this._config.cheapest_hours);
    const exportBestEnabled = isCheapestHoursEnabled(this._config.export_best_hours);
    const importSelected = new Set();
    const exportSelected = new Set();
    if (cheapestEnabled) {
      for (const dayPoints of importGroups.values()) {
        for (const timestamp of selectCheapestDuration(dayPoints, Number(this._config.cheapest_hours) * 60, {
          mode: this._config.import_selection_mode,
          minimumBlockMinutes: this._config.import_minimum_duration,
        })) importSelected.add(timestamp);
      }
    }
    if (exportBestEnabled) {
      for (const dayPoints of exportGroups.values()) {
        for (const timestamp of selectHighestDuration(dayPoints, Number(this._config.export_best_hours) * 60, {
          mode: this._config.export_selection_mode,
          minimumBlockMinutes: this._config.export_minimum_duration,
        })) exportSelected.add(timestamp);
      }
    }

    const intervalMinutes = inferIntervalMinutes(importPoints);
    const exportIntervalMinutes = inferIntervalMinutes(exportPoints);
    const intervalMs = intervalMinutes * 60000;
    const cheapPrice = Number(this._config.cheap_price);
    const normalPrice = Number(this._config.normal_price);
    const expensivePrice = Number(this._config.expensive_price);
    const svgWidth = SVG_WIDTH;
    const svgHeight = SVG_HEIGHT;
    const start = timeline[0].timestamp;
    const end = timeline.at(-1).timestamp + intervalMs;
    this._ensureConsumption(start, end, intervalMinutes);
    const consumptionEnabled = this._config.show_consumption === true;
    const graphShowsConsumption = consumptionEnabled && !this._hiddenSeries.has('consumption');
    const consumptionPoints = this._consumption?.points ?? [];
    const consumptionIntervalMs = (this._consumption?.intervalMinutes ?? intervalMinutes) * 60000;
    const chartPixels = this.shadowRoot.querySelector('.chart')?.clientWidth || Math.max(1, (this.clientWidth || 1000) - (this.clientWidth <= 520 ? 24 : 32));
    const plotRight = PLOT.right + (graphShowsConsumption ? 32 * svgWidth / chartPixels : 0);
    const plotWidth = svgWidth - PLOT.left - plotRight;
    const plotHeight = svgHeight - PLOT.top - PLOT.bottom;
    const span = Math.max(intervalMs, end - start);
    const visiblePrices = timeline.flatMap((point) => [
      ...(graphShowsImport && Number.isFinite(point.importPrice) ? [point.importPrice] : []),
      ...(graphShowsExport && Number.isFinite(point.exportPrice) ? [point.exportPrice] : []),
    ]);
    const rawMin = Math.min(cheapPrice, ...visiblePrices);
    const rawMax = Math.max(expensivePrice, ...visiblePrices);
    const range = Math.max(0.04, rawMax - rawMin);
    const minimum = Math.max(-1, rawMin - range * 0.12);
    const maximum = rawMax + range * 0.12;
    const yRange = maximum - minimum;
    const xFor = (timestamp) => PLOT.left + ((timestamp - start) / span) * plotWidth;
    const yFor = (price) => PLOT.top + ((maximum - price) / yRange) * plotHeight;
    const importPath = graphShowsImport ? seriesPath(timeline, 'importPrice', xFor, yFor, intervalMs, this._config.import_line_interpolation ?? this._config.line_interpolation) : '';
    const exportPath = graphShowsExport ? seriesPath(timeline, 'exportPrice', xFor, yFor, intervalMs, this._config.export_line_interpolation ?? this._config.line_interpolation) : '';
    const importAppearance = this._seriesAppearance('import');
    const exportAppearance = this._seriesAppearance('export');
    const consumptionAppearance = this._seriesAppearance('consumption');
    const energyMaximum = Math.max(0.1, ...consumptionPoints.map(point => Number.isFinite(point.energy) ? point.energy * 1.12 : 0));
    const energyYFor = energy => PLOT.top + (1 - energy / energyMaximum) * plotHeight;
    const consumptionPath = graphShowsConsumption ? seriesPath(consumptionPoints, 'energy', xFor, energyYFor, consumptionIntervalMs, this._config.consumption_line_interpolation ?? this._config.line_interpolation) : '';
    const energyLabels = graphShowsConsumption ? `<span class="chart-label energy-unit">kWh</span>` + createPriceTicks(0, energyMaximum, 5).map(value => `<span class="chart-label energy-axis-label" style="top:${energyYFor(value) / svgHeight * 100}%">${new Intl.NumberFormat(this._language, { maximumFractionDigits: 2 }).format(value)}</span>`).join('') : '';
    const consumptionFillColor = rgbColorToCss(this._config.consumption_fill_color) ?? consumptionAppearance.stroke;
    let consumptionAreaPath = '';
    if (graphShowsConsumption && this._config.show_consumption_fill === true) {
      let segment = [];
      const close = () => {
        if (segment.length) consumptionAreaPath += `${seriesPath(segment, 'energy', xFor, energyYFor, consumptionIntervalMs, this._config.consumption_line_interpolation ?? this._config.line_interpolation)} L ${xFor(segment.at(-1).timestamp)} ${PLOT.top + plotHeight} L ${xFor(segment[0].timestamp)} ${PLOT.top + plotHeight} Z `;
        segment = [];
      };
      for (const point of consumptionPoints) {
        if (!Number.isFinite(point.energy) || (segment.length && point.timestamp - segment.at(-1).timestamp > consumptionIntervalMs)) close();
        if (Number.isFinite(point.energy)) segment.push(point);
      }
      close();
    }

    const areaPath = (path, key) => path && timeline.every((point) => Number.isFinite(point[key]))
      ? `${path} L ${xFor(timeline.at(-1).timestamp)} ${PLOT.top + plotHeight} L ${xFor(start)} ${PLOT.top + plotHeight} Z`
      : '';
    const importAreaPath = graphShowsImport && this._config.show_import_fill !== false
      ? areaPath(importPath, 'importPrice')
      : '';
    const exportAreaPath = graphShowsExport && this._config.show_export_fill === true
      ? areaPath(exportPath, 'exportPrice')
      : '';
    const importFillColor = rgbColorToCss(this._config.import_fill_color) ?? 'var(--primary-color)';
    const exportFillColor = rgbColorToCss(this._config.export_fill_color) ?? 'var(--export-best)';
    const importAreaClass = `area import-area${this._config.import_fill_fade !== false ? ' fade' : ''}`;
    const exportAreaClass = `area export-area${this._config.export_fill_fade !== false ? ' fade' : ''}`;

    const importSelectedPeriods = groupSelectedPeriods(importPoints, importSelected, intervalMinutes);
    const exportSelectedPeriods = groupSelectedPeriods(exportPoints, exportSelected, exportIntervalMinutes);
    const bandRects = (periods, className) => periods.map((period) => {
      const x = xFor(period.startTimestamp);
      const width = Math.max(2, xFor(period.endTimestamp) - x);
      return `<rect x="${x.toFixed(2)}" y="${PLOT.top}" width="${width.toFixed(2)}" height="${plotHeight}" class="selection-band ${className}" />`;
    }).join('');
    const selectionBandRects = [
      graphShowsImport && cheapestEnabled ? bandRects(importSelectedPeriods, 'import-selection-band') : '',
      graphShowsExport && exportBestEnabled ? bandRects(exportSelectedPeriods, 'export-selection-band') : '',
    ].join('');

    const offsetForPrice = (price) => Math.max(0, Math.min(100, ((yFor(price) - PLOT.top) / plotHeight) * 100));
    const expensiveOffset = offsetForPrice(expensivePrice);
    const normalOffset = offsetForPrice(normalPrice);
    const cheapOffset = offsetForPrice(cheapPrice);
    const zeroOffset = offsetForPrice(0);
    const importNegativeStops = minimum < 0
      ? `<stop offset="${zeroOffset}%" stop-color="var(--zero-color)" /><stop offset="100%" stop-color="var(--negative-color)" />`
      : `<stop offset="100%" stop-color="var(--cheap)" />`;

    const nowTimestamp = now.getTime();
    const nowX = xFor(nowTimestamp);
    const nowVisible = nowTimestamp >= start && nowTimestamp <= end;
    const nowMarker = nowVisible
      ? `<line class="now-line" x1="${nowX}" y1="${PLOT.top}" x2="${nowX}" y2="${PLOT.top + plotHeight}" />`
      : '';
    const nowLabel = nowVisible
      ? `<span class="chart-label now-label" style="left:${Math.max(6, Math.min(94, (nowX / svgWidth) * 100))}%">${this._t("Nu")}</span>`
      : '';

    const averages = [];
    if (this._config.show_average_line && graphShowsImport) {
      const value = calculateAveragePrice(importPoints);
      if (value !== null) averages.push({ key: 'import', label: this._t("Gem. afname"), value, y: yFor(value) });
    }
    if (this._config.show_average_line && graphShowsExport) {
      const value = calculateAveragePrice(exportPoints);
      if (value !== null) averages.push({ key: 'export', label: this._t("Gem. teruglevering"), value, y: yFor(value) });
    }
    const averageLine = averages.map((average) => `<line class="average-line ${average.key}-average" x1="${PLOT.left}" y1="${average.y}" x2="${svgWidth - plotRight}" y2="${average.y}" />`).join('');
    const positionedAverages = [...averages].sort((left, right) => left.y - right.y);
    for (let index = 1; index < positionedAverages.length; index += 1) {
      positionedAverages[index].labelY = Math.max(
        positionedAverages[index].y,
        (positionedAverages[index - 1].labelY ?? positionedAverages[index - 1].y) + 18,
      );
    }
    const averageLabel = positionedAverages.map((average) => `<span class="chart-label average-label ${average.key}-average-label" style="top:${(Math.min(PLOT.top + plotHeight - 8, average.labelY ?? average.y) / svgHeight) * 100}%;left:${PLOT.left + 6}px">${average.label} ${this._formatPrice(average.value)} ct</span>`).join('');
    const hoverLine = this._config.show_hover_line
      ? `<line class="hover-line" x1="0" y1="${PLOT.top}" x2="0" y2="${PLOT.top + plotHeight}" hidden />`
      : '';

    const yTicks = createPriceTicks(minimum, maximum, 5);
    const yLabels = yTicks.map((price) => {
      const y = yFor(price);
      return `<span class="chart-label y-label" style="top:${(y / svgHeight) * 100}%">${this._formatPrice(price, 0)}</span>`;
    }).join('');
    const cheapY = yFor(cheapPrice);
    const normalY = yFor(normalPrice);
    const expensiveY = yFor(expensivePrice);
    const showPriceLevels = this._config.show_price_levels !== false;
    const bothGraph = graphShowsImport && graphShowsExport;
    const levelClass = bothGraph ? 'neutral-level' : graphShowsExport ? 'export-level' : 'import-level';
    const levelLines = showPriceLevels ? `
      <line x1="${PLOT.left}" y1="${cheapY}" x2="${svgWidth - plotRight}" y2="${cheapY}" class="level-line cheap-level" data-level-class="${levelClass}" />
      <line x1="${PLOT.left}" y1="${normalY}" x2="${svgWidth - plotRight}" y2="${normalY}" class="level-line normal-level" data-level-class="${levelClass}" />
      <line x1="${PLOT.left}" y1="${expensiveY}" x2="${svgWidth - plotRight}" y2="${expensiveY}" class="level-line expensive-level" data-level-class="${levelClass}" />` : '';
    const levelLabels = showPriceLevels ? `
      <span class="chart-label level-label ${levelClass}" style="top:${(cheapY / svgHeight) * 100}%">${this._formatPrice(cheapPrice)} ct</span>
      <span class="chart-label level-label ${levelClass}" style="top:${(normalY / svgHeight) * 100}%">${this._formatPrice(normalPrice)} ct</span>
      <span class="chart-label level-label ${levelClass}" style="top:${(expensiveY / svgHeight) * 100}%">${this._formatPrice(expensivePrice)} ct</span>` : '';

    const groups = splitByLocalDay(importPoints);
    const labelHourStep = groups.size > 1 ? 6 : 3;
    const xLabels = importPoints.filter((point) => {
      const parts = zonedParts(point.timestamp, timeZone);
      return Number(parts.minute) === 0 && Number(parts.hour) % labelHourStep === 0;
    }).map((point) => `<span class="chart-label x-label" style="left:${(xFor(point.timestamp) / svgWidth) * 100}%">${this._formatTime(point.timestamp, timeZone)}</span>`).join('');
    const dayMarkers = [...groups.values()].map((dayPoints, index) => {
      const x = xFor(dayPoints[0].timestamp);
      return index === 0 ? '' : `<line x1="${x}" y1="${PLOT.top}" x2="${x}" y2="${PLOT.top + plotHeight}" class="day-divider" />`;
    }).join('');
    const dayLabels = [...groups.values()].map((dayPoints, index) => {
      const x = Math.max(PLOT.left + 8, xFor(dayPoints[0].timestamp) + 10);
      return `<span class="chart-label day-label" style="left:${(x / svgWidth) * 100}%">${index === 0 ? this._t("Vandaag") : this._t("Morgen")} · ${this._formatDay(dayPoints[0].timestamp, timeZone)}</span>`;
    }).join('');

    const todayKey = localDayKey(now, timeZone);
    const tomorrowKey = addDaysToKey(todayKey, 1);
    const tomorrowPoints = groups.get(tomorrowKey) || [];
    const showTomorrow = localHour(now, timeZone) >= Number(this._config.tomorrow_after);
    const tomorrowMinutes = tomorrowPoints.length * intervalMinutes;
    const missingImport = countMissingIntervals(importPoints, intervalMinutes);
    const missingExport = exportPoints.length ? countMissingIntervals(exportPoints, exportIntervalMinutes) : 0;
    const missingTotal = missingImport + missingExport;
    const statusParts = [];
    if (consumptionEnabled) {
      const statuses = { source: 'Verbruiksbron ontbreekt', invalid: 'Gebruik een cumulatieve netafnamemeter in kWh', loading: 'Verbruik laden…', error: 'Verbruikshistorie niet beschikbaar', empty: 'Geen voltooide verbruiksintervallen', partial: 'Verbruikshistorie is onvolledig' };
      const text = statuses[this._consumption?.status];
      if (text) statusParts.push(this._t(text));
    }
    if (missingTotal) statusParts.push(`${missingTotal} ${missingTotal === 1 ? this._t("prijsinterval ontbreekt") : this._t("prijsintervallen ontbreken")}`);
    if (showTomorrow && !tomorrowPoints.length) statusParts.push(this._t("Morgenprijzen ontbreken"));
    else if (showTomorrow && tomorrowMinutes < 24 * 60) statusParts.push(this._t("Morgenprijzen zijn onvolledig"));
    const dataStatus = statusParts.length
      ? `<div class="data-status warning">${statusParts.map((part) => `<span>${escapeHtml(part)}</span>`).join('<i aria-hidden="true">·</i>')}</div>`
      : '';

    const currentImport = findCurrentPoint(importPoints, now);
    const currentExport = findCurrentPoint(exportPoints, now);
    const currentCards = [];
    if (currentShowsImport) currentCards.push(this._currentMetric(this._t("Afname"), currentImport, 'import', importSelected, cheapestEnabled));
    if (currentShowsExport) currentCards.push(this._currentMetric(this._t("Teruglevering"), currentExport, 'export', exportSelected, exportBestEnabled));

    const showTitle = this._config.show_title !== false;
    const useCompactSummary = !showTitle
      && graphIncludesImport && !graphIncludesExport
      && currentShowsImport && !currentShowsExport
      && cheapestEnabled;
    const compactSummary = useCompactSummary
      ? `<header class="compact-summary">${this._compactCurrentMetric(this._t("Afname"), currentImport, 'import', importSelected, cheapestEnabled)}<span class="compact-context">${this._t("Goedkoopste {hours} uur/dag", { hours: escapeHtml(this._config.cheapest_hours) })}</span></header>`
      : '';
    const currentBlock = !useCompactSummary && currentCards.length
      ? `<div class="current-block">${currentCards.join('')}</div>`
      : '';
    const contextLabels = [];
    if (cheapestEnabled) contextLabels.push(`<span><i class="swatch selection"></i>${this._t("Goedkoopste {hours} uur/dag", { hours: escapeHtml(this._config.cheapest_hours) })}</span>`);
    if (exportBestEnabled) contextLabels.push(`<span><i class="swatch export-selection"></i>${this._t("Beste teruglevering {hours} uur/dag", { hours: escapeHtml(this._config.export_best_hours) })}</span>`);
    const heading = useCompactSummary
      ? ''
      : showTitle
        ? `<div class="heading"><h2>${escapeHtml(this._config.title ?? this._t("Dynamische energieprijzen"))}</h2></div>`
        : contextLabels.length
          ? `<div class="heading"><div class="header-cheapest">${contextLabels.join('')}</div></div>`
          : '';
    const seriesLegend = [];
    if (graphIncludesImport && !useCompactSummary) seriesLegend.push(this._seriesLegendItem('import', this._t("Afname")));
    if (graphIncludesExport) seriesLegend.push(this._seriesLegendItem('export', this._t("Teruglevering")));
    if (consumptionEnabled) seriesLegend.push(this._seriesLegendItem('consumption', `${this._t('Netafname')} · kWh / ${this._consumption?.intervalMinutes ?? intervalMinutes} min`));
    const legendItems = [...seriesLegend, ...(showTitle ? contextLabels : [])];
    const legend = legendItems.length
      ? `<div class="legend" aria-label="${this._t("Legenda")}">${legendItems.join('')}</div>`
      : '';

    const importPeriods = cheapestEnabled && this._config.show_cheapest_table
      ? importSelectedPeriods
      : [];
    const exportPeriods = exportBestEnabled && this._config.show_export_table
      ? exportSelectedPeriods
      : [];
    const favorableTable = importPeriods.length || exportPeriods.length
      ? this._periodTable(importPeriods, exportPeriods, timeZone, todayKey, tomorrowKey)
      : '';

    this._chart = {
      timeline, importSelected, exportSelected, intervalMs, timeZone, xFor, yFor, start, span,
      cheapPrice, normalPrice, expensivePrice, svgWidth, svgHeight, graphShowsImport, graphShowsExport,
      importAppearance, exportAppearance, plotRight, consumptionPoints, consumptionAppearance, consumptionIntervalMs, graphShowsConsumption, energyYFor,
    };

    this._graph ??= new SharedGraph();
    this.shadowRoot.innerHTML = `
      <ha-card lang="${this._language}">
        <div class="card-content" style="--import-fill-color:${importFillColor};--export-fill-color:${exportFillColor};--consumption-fill-color:${consumptionFillColor}">
          ${compactSummary || `<header class="header">${heading}${currentBlock}</header>`}
          ${legend}
          ${dataStatus}
          <div class="chart${graphShowsConsumption ? ' with-consumption' : ''}" tabindex="0" role="img" aria-label="${this._t("Elektriciteitsprijzen per interval. Gebruik de pijltjestoetsen om prijzen te bekijken.")}">
            ${this._graph.render(this, {
              viewBox: `0 0 ${svgWidth} ${svgHeight}`,
              defs: `<defs>
                <linearGradient id="consumption-area-gradient" x1="0" y1="${PLOT.top}" x2="0" y2="${PLOT.top + plotHeight}" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="var(--consumption-fill-color)" stop-opacity="${this._config.consumption_fill_opacity ?? .18}" />
                  <stop offset="100%" stop-color="var(--consumption-fill-color)" stop-opacity="${(this._config.consumption_fill_opacity ?? .18)*(.01/.18)}" />
                </linearGradient>
                <linearGradient id="import-area-gradient" x1="0" y1="${PLOT.top}" x2="0" y2="${PLOT.top + plotHeight}" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="var(--import-fill-color)" stop-opacity="${this._config.import_fill_opacity ?? .22}" />
                  <stop offset="100%" stop-color="var(--import-fill-color)" stop-opacity="${(this._config.import_fill_opacity ?? .22)*(.01/.22)}" />
                </linearGradient>
                <linearGradient id="export-area-gradient" x1="0" y1="${PLOT.top}" x2="0" y2="${PLOT.top + plotHeight}" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="var(--export-fill-color)" stop-opacity="${this._config.export_fill_opacity ?? .22}" />
                  <stop offset="100%" stop-color="var(--export-fill-color)" stop-opacity="${(this._config.export_fill_opacity ?? .22)*(.01/.22)}" />
                </linearGradient>
                <linearGradient id="price-line-gradient" x1="0" y1="${PLOT.top}" x2="0" y2="${PLOT.top + plotHeight}" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="var(--expensive)" /><stop offset="${expensiveOffset}%" stop-color="var(--expensive)" />
                  <stop offset="${normalOffset}%" stop-color="var(--normal)" /><stop offset="${cheapOffset}%" stop-color="var(--cheap)" />${importNegativeStops}
                </linearGradient>
                <linearGradient id="export-line-gradient" x1="0" y1="${PLOT.top}" x2="0" y2="${PLOT.top + plotHeight}" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="var(--cheap)" /><stop offset="${expensiveOffset}%" stop-color="var(--cheap)" />
                  <stop offset="${normalOffset}%" stop-color="var(--normal)" /><stop offset="${cheapOffset}%" stop-color="var(--expensive)" />
                  <stop offset="100%" stop-color="var(--expensive)" />
                </linearGradient>
                ${['import','export','consumption'].map(p=>`<linearGradient id="${p}-follow-fade"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="${.01/(p==='consumption'?.18:.22)}"/></linearGradient><mask id="${p}-follow-mask" maskUnits="userSpaceOnUse" x="0" y="${PLOT.top}" width="${svgWidth}" height="${plotHeight}"><rect x="0" y="${PLOT.top}" width="${svgWidth}" height="${plotHeight}" fill="url(#${p}-follow-fade)"/></mask>`).join('')}
              </defs>`,
              before: selectionBandRects + levelLines + averageLine,
              fills: [
                {d: importAreaPath, className: importAreaClass},
                {d: exportAreaPath, className: exportAreaClass},
                {d: consumptionAreaPath, className: `area consumption-area${this._config.consumption_fill_fade !== false ? ' fade' : ''}`},
              ],
              lines: [
                {d: importPath, className: 'price-line import-line', appearance: importAppearance, inlineStyle: true},
                {d: exportPath, className: 'price-line export-line', appearance: exportAppearance, inlineStyle: true},
                {d: consumptionPath, className: 'price-line consumption-line', appearance: consumptionAppearance, inlineStyle: true},
              ],
              after: dayMarkers + nowMarker + hoverLine,
            })}
            <span class="hover-dot" data-series="import" hidden></span>
            <span class="hover-dot export-dot" data-series="export" hidden></span>
            ${consumptionEnabled ? '<span class="hover-dot consumption-dot" data-series="consumption" hidden></span>' : ''}
            ${yLabels}${levelLabels}${averageLabel}${dayLabels}${nowLabel}${xLabels}${energyLabels}
            <div class="tooltip" hidden></div>
          </div>
          ${favorableTable}
          <div class="sr-only" aria-live="polite"></div>
        </div>
      </ha-card>
      <style>${this._styles()}</style>`;
    this._graph.restore(this);
    this._chartHasLoaded = this._graph.loaded;
    this._bindInteractions();
    SharedGraph.restoreHover(this);
  }

  _currentMetric(label, point, type, selected, enabled) {
    const price = point?.price ?? null;
    const priceClass = price === null
      ? 'unavailable'
      : this._priceClass(price, type);
    const priceText = price === null ? '—' : this._formatPrice(price);
    const favorable = enabled && point ? selected.has(point.timestamp) : false;
    const badge = favorable
      ? type === 'import'
        ? `<div class="current-window active">${this._t("Goedkoopst")}</div>`
        : `<div class="current-window active">${this._t("Beste opbrengst")}</div>`
      : '';
    return `<div class="current-metric ${type}">
      <span class="current-label">${label}</span>
      <div class="current ${priceClass}" aria-label="${this._t("Huidige {tariff}prijs {price}", { tariff: label.toLowerCase(), price: price === null ? this._t("onbekend") : `${priceText} ${this._t("cent per kilowattuur")}` })}">
        <strong>${priceText}</strong><span>ct/kWh</span>
      </div>${badge}
    </div>`;
  }

  _compactCurrentMetric(label, point, type, selected, enabled) {
    const price = point?.price ?? null;
    const priceClass = price === null ? 'unavailable' : this._priceClass(price, type);
    const priceText = price === null ? '—' : this._formatPrice(price);
    const favorable = enabled && point ? selected.has(point.timestamp) : false;
    const appearance = this._seriesAppearance(type);
    const hidden = this._hiddenSeries.has(type);
    return `<button type="button" class="compact-current legend-series" data-series="${type}" aria-pressed="${!hidden}" title="${hidden ? this._t("Toon") : this._t("Verberg")} ${label.toLowerCase()}">
      <i class="swatch series-swatch ${appearance.style}" style="--series-color:${appearance.swatchColor};--series-width:${appearance.width}px"></i>
      ${label} <span>${this._t("nu")}</span> <strong class="${priceClass}">${priceText}</strong><small>ct/kWh</small>${favorable ? `<em>${this._t("Goedkoopst")}</em>` : ''}
    </button>`;
  }

  _periodTable(importPeriods, exportPeriods, timeZone, todayKey, tomorrowKey) {
    const periods = [
      ...importPeriods.map((period) => ({ ...period, type: 'import' })),
      ...exportPeriods.map((period) => ({ ...period, type: 'export' })),
    ].sort((left, right) => left.startTimestamp - right.startTimestamp || left.type.localeCompare(right.type));
    const showAverage = this._config.show_period_average === true;
    const columns = ['day', 'type', 'start', 'end', 'duration', 'average'].filter(column => column === 'average' ? showAverage : this._config[`show_period_${column}`] !== false);
    if (!columns.length) return '';
    const headings = { day: this._t("Dag"), type: this._t("Moment"), start: this._t("Start"), end: this._t("Einde"), duration: this._t("Duur"), average: '~ct' };
    const headers = columns.map(column => `<th class="period-${column}">${headings[column]}</th>`).join('');
    const rows = periods.map((period) => {
      const { type } = period;
      const typeLabel = type === 'import' ? this._t("Afname") : this._t("Teruglevering");
      const duration = formatDuration(period.durationMinutes, this._language);
      const dayLabel = period.dayKey === todayKey ? this._t("Vandaag") : period.dayKey === tomorrowKey ? this._t("Morgen") : period.dayKey;
      const day = period.dayKey === todayKey ? this._t("Vdg.") : period.dayKey === tomorrowKey ? this._t("Mrg.") : period.dayKey;
      const compactType = type === 'import' ? this._t("Af.") : this._t("Ter.");
      const cells = {
        day: `<span title="${escapeHtml(dayLabel)}" aria-label="${escapeHtml(dayLabel)}">${escapeHtml(day)}</span>`,
        type: `<span class="period-type ${type}" title="${typeLabel}" aria-label="${typeLabel}">${compactType}</span>`,
        start: this._formatTime(period.startTimestamp, timeZone),
        end: this._formatTime(period.endTimestamp, timeZone),
        duration,
        average: Number.isFinite(period.averagePrice) ? this._formatPrice(period.averagePrice) : '—',
      };
      return `<tr>${columns.map(column => `<td class="period-${column}">${cells[column]}</td>`).join('')}</tr>`;
    }).join('');
    return `<section class="price-table-wrap"><h3>${this._t("Gunstige momenten")}${showAverage ? '<span class="table-unit">ct/kWh</span>' : ''}</h3>
      <table class="cheapest-table favorable-table${showAverage ? ' with-average' : ''}"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
    </section>`;
  }

  _seriesAppearance(type) {
    const prefix = type;
    const fallbackStyle = type === 'export' ? 'dashed' : 'solid';
    const style = normalizeLineStyle(this._config?.[`${prefix}_line_style`], fallbackStyle);
    const width = normalizeLineWidth(type === 'consumption' ? this._config?.consumption_line_width ?? 1.5 : this._config?.[`${prefix}_line_width`], type === 'consumption' ? 1.5 : 3.5);
    const color = this._config?.[`${prefix}_color_mode`]==='price' ? null : rgbColorToCss(this._config?.[`${prefix}_line_color`]) ?? (this._config?.[`${prefix}_color_mode`]==='fixed' && type!=='consumption' ? 'var(--primary-color)' : null);
    const {dash, cap} = graphLineStyle(style, width);
    return {
      style,
      width,
      color,
      dash,
      cap,
      stroke: color ?? (type === 'consumption' ? 'var(--secondary-text-color)' : `url(#${type === 'export' ? 'export-line-gradient' : 'price-line-gradient'})`),
      swatchColor: color ?? (type === 'consumption' ? 'var(--secondary-text-color)' : 'var(--primary-color)'),
    };
  }

  _seriesLegendItem(type, label) {
    const appearance = this._seriesAppearance(type);
    const hidden = this._hiddenSeries.has(type);
    return `<button type="button" class="legend-series" data-series="${type}" aria-pressed="${!hidden}" title="${hidden ? this._t("Toon") : this._t("Verberg")} ${label.toLowerCase()}"><i class="swatch series-swatch ${appearance.style}" style="--series-color:${appearance.swatchColor};--series-width:${appearance.width}px"></i>${label}</button>`;
  }

  _toggleSeries(type) {
    if (this._hiddenSeries.has(type)) this._hiddenSeries.delete(type);
    else this._hiddenSeries.add(type);
    this._hideTooltip(false);
    this._render();
  }

  _priceClass(price, type) {
    const base = classifyPriceLevel(price, this._config.cheap_price, this._config.normal_price, this._config.expensive_price);
    if (type !== 'export') return base;
    if (base === 'expensive') return 'cheap';
    if (base === 'cheap' || base === 'negative') return 'expensive';
    return 'normal';
  }

  _stateCard(title, message) {
    return `<ha-card lang="${this._language}"><div class="state"><strong>${title}</strong><span>${message}</span></div></ha-card><style>${this._styles()}</style>`;
  }

  _bindInteractions() {
    this.shadowRoot.querySelectorAll('.legend-series').forEach((item) => {
      item.addEventListener('click', () => {
        const { series: type } = item.dataset;
        this._toggleSeries(type);
      });
    });
    const chart = this.shadowRoot.querySelector('.chart');
    if (!chart) return;
    chart.addEventListener('pointermove', (event) => this._pointFromPointer(event));
    chart.addEventListener('pointerdown', (event) => this._pointFromPointer(event));
    chart.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse') this._hideTooltip();
    });
    chart.addEventListener('focus', () => {
      const nearest = this._chart.timeline.reduce((best, point, index) => (
        Math.abs(point.timestamp - Date.now()) < Math.abs(this._chart.timeline[best].timestamp - Date.now()) ? index : best
      ), 0);
      this._showPoint(nearest);
    });
    chart.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Escape') return this._hideTooltip();
      if (event.key === 'Home') this._activeIndex = 0;
      else if (event.key === 'End') this._activeIndex = this._chart.timeline.length - 1;
      else {
        const delta = event.key === 'ArrowLeft' ? -1 : 1;
        this._activeIndex = Math.max(0, Math.min(this._chart.timeline.length - 1, (this._activeIndex ?? 0) + delta));
      }
      this._showPoint(this._activeIndex);
    });
  }

  _pointFromPointer(event) {
    const chart = this.shadowRoot.querySelector('.chart');
    const bounds = chart.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / bounds.width) * this._chart.svgWidth;
    const timestamp = this._chart.start + Math.max(0, Math.min(1, (svgX - PLOT.left) / (this._chart.svgWidth - PLOT.left - this._chart.plotRight))) * this._chart.span;
    let low = 0;
    let high = this._chart.timeline.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this._chart.timeline[middle].timestamp < timestamp) low = middle + 1;
      else high = middle;
    }
    const previous = Math.max(0, low - 1);
    const index = Math.abs(this._chart.timeline[low].timestamp - timestamp) < Math.abs(this._chart.timeline[previous].timestamp - timestamp) ? low : previous;
    this._showPoint(index);
  }

  _consumptionTooltip(timestamp) {
    if (!this._chart.graphShowsConsumption) return null;
    const point = this._chart.consumptionPoints.find(p => p.timestamp <= timestamp && timestamp < p.endTimestamp);
    const value = Number.isFinite(point?.energy)
      ? `${new Intl.NumberFormat(this._language, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(point.energy)} kWh`
      : '—';
    const appearance = this._chart.consumptionAppearance;
    const range = point ? `${this._formatTime(point.timestamp, this._chart.timeZone)}–${this._formatTime(point.endTimestamp, this._chart.timeZone)}` : '';
    return { point, html: `<span><i class="tooltip-series ${appearance.style}" style="--series-color:${appearance.swatchColor}"></i><b>${this._t('Netafname')}: ${value}</b>${range && (point.timestamp !== timestamp || point.endTimestamp - point.timestamp !== this._chart.intervalMs) ? `<small>${range}</small>` : ''}</span>`,
      live: `${this._t('Netafname')} ${value}, ${range}` };
  }

  _receiveHover(timestamp) {
    if (!this._chart || timestamp === null || timestamp < this._chart.start || timestamp >= this._chart.start + this._chart.span) { this._hideTooltip(false); return; }
    const index = this._chart.timeline.findIndex(p => p.timestamp <= timestamp && timestamp < p.timestamp + this._chart.intervalMs);
    if (index < 0) { this._hideTooltip(false); return; }
    this._showPoint(index, false, timestamp);
  }

  _showPoint(index, publish = true, timestamp) {
    if (!SharedGraph.tooltipInView(this)) { this._hideTooltip(publish); return; }
    const point = this._chart.timeline[index];
    if (!point) return;
    this._activeIndex = index;
    const nextTime = point.timestamp + this._chart.intervalMs;
    timestamp ??= point.timestamp;
    this._hoverTimestamp = timestamp;
    const x = this._chart.xFor(point.timestamp);
    const guideX = this._chart.xFor(timestamp);
    const line = this.shadowRoot.querySelector('.hover-line');
    line?.removeAttribute('hidden');
    if (line) {
      line.setAttribute('x1', guideX);
      line.setAttribute('x2', guideX);
    }

    const entries = [];
    const liveEntries = [];
    const anchorYs = [];
    const showDot = (type, price, selected, hours, favorableLabel) => {
      const dot = this.shadowRoot.querySelector(`.hover-dot[data-series="${type}"]`);
      if (!Number.isFinite(price)) {
        dot?.setAttribute('hidden', '');
        entries.push(`<span><i></i><b>${type === 'import' ? this._t("Afname") : this._t("Teruglevering")}: —</b></span>`);
        liveEntries.push(`${type === 'import' ? this._t("afname") : this._t("teruglevering")} ${this._t("niet beschikbaar")}`);
        return;
      }
      const y = this._chart.yFor(price);
      anchorYs.push(y);
      const priceClass = this._priceClass(price, type);
      const appearance = type === 'export' ? this._chart.exportAppearance : this._chart.importAppearance;
      dot.removeAttribute('hidden');
      dot.style.left = `${(x / this._chart.svgWidth) * 100}%`;
      dot.style.top = `${(y / this._chart.svgHeight) * 100}%`;
      dot.style.borderStyle = appearance.style === 'solid' ? 'solid' : appearance.style;
      if (appearance.color) dot.style.borderColor = appearance.color;
      else dot.style.removeProperty('border-color');
      dot.setAttribute('class', `hover-dot${type === 'export' ? ' export-dot' : ''} ${priceClass}`);
      const favorable = selected.has(point.timestamp);
      entries.push(`<span><i class="tooltip-series ${appearance.style}" style="--series-color:${appearance.color || `var(--${priceClass === 'negative' ? 'negative-color' : priceClass})`}"></i><b>${type === 'import' ? this._t("Afname") : this._t("Teruglevering")}: ${this._formatPrice(price)} ct/kWh</b>${favorable ? `<small>${favorableLabel} ${escapeHtml(hours)} ${this._t("uur")}</small>` : ''}</span>`);
      liveEntries.push(`${type === 'import' ? this._t("afname") : this._t("teruglevering")} ${this._formatPrice(price)} ${this._t("cent per kilowattuur")}${favorable ? `, ${favorableLabel} ${hours} ${this._t("uur")}` : ''}`);
    };
    if (this._chart.graphShowsImport) showDot('import', point.importPrice, this._chart.importSelected, this._config.cheapest_hours, this._t("goedkoopste"));
    if (this._chart.graphShowsExport) showDot('export', point.exportPrice, this._chart.exportSelected, this._config.export_best_hours, this._t("beste"));

    const consumption = this._consumptionTooltip(point.timestamp);
    if (consumption) {
      entries.push(consumption.html);
      liveEntries.push(consumption.live);
      const dot = this.shadowRoot.querySelector('.consumption-dot');
      if (Number.isFinite(consumption.point?.energy)) {
        const y = this._chart.energyYFor(consumption.point.energy);
        anchorYs.push(y);
        dot.removeAttribute('hidden');
        dot.style.left = `${this._chart.xFor(consumption.point.timestamp) / this._chart.svgWidth * 100}%`;
        dot.style.top = `${y / this._chart.svgHeight * 100}%`;
        dot.style.borderColor = this._chart.consumptionAppearance.stroke;
        dot.style.borderStyle = this._chart.consumptionAppearance.style;
      } else dot?.setAttribute('hidden', '');
    }

    const tooltip = this.shadowRoot.querySelector('.tooltip');
    tooltip.hidden = false;
    tooltip.innerHTML = `<strong>${this._formatTime(point.timestamp, this._chart.timeZone)}–${this._formatTime(nextTime, this._chart.timeZone)}</strong>${entries.join('')}`;
    const anchorY = anchorYs.length
      ? anchorYs.reduce((total, value) => total + value, 0) / anchorYs.length
      : this._chart.svgHeight / 2;
    const chart = this.shadowRoot.querySelector('.chart');
    const chartWidth = chart.clientWidth;
    const chartHeight = chart.clientHeight;
    const anchorX = (x / this._chart.svgWidth) * chartWidth;
    const anchorTop = (anchorY / this._chart.svgHeight) * chartHeight;
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const gap = 12;
    const edge = 4;
    const canPlaceRight = anchorX + gap + tooltipWidth <= chartWidth - edge;
    const canPlaceLeft = anchorX - gap - tooltipWidth >= edge;
    const canPlaceBelow = anchorTop + gap + tooltipHeight <= chartHeight - edge;
    tooltip.dataset.horizontal = canPlaceRight ? 'right' : canPlaceLeft ? 'left' : 'center';
    tooltip.dataset.vertical = canPlaceBelow ? 'below' : 'above';
    const centeredX = Math.max(tooltipWidth / 2 + edge, Math.min(chartWidth - tooltipWidth / 2 - edge, anchorX));
    tooltip.style.left = `${tooltip.dataset.horizontal === 'center' ? centeredX : anchorX}px`;
    tooltip.style.top = `${anchorTop}px`;
    if (this._chart.graphShowsConsumption) {
      const bounds = chart.getBoundingClientRect();
      const markers = [...this.shadowRoot.querySelectorAll('.hover-dot:not([hidden])')].map(dot => {
        const rect = dot.getBoundingClientRect();
        return { left: rect.left - bounds.left, right: rect.right - bounds.left, top: rect.top - bounds.top, bottom: rect.bottom - bounds.top };
      });
      const placement = placeEnergyTooltip(chartWidth, chartHeight, tooltipWidth, tooltipHeight, anchorX, anchorTop, markers);
      tooltip.dataset.horizontal = 'positioned';
      tooltip.style.left = `${placement.left}px`;
      tooltip.style.top = `${placement.top}px`;
    }
    const live = this.shadowRoot.querySelector('.sr-only');
    live.textContent = `${this._formatTime(point.timestamp, this._chart.timeZone)} ${this._t("tot")} ${this._formatTime(nextTime, this._chart.timeZone)}, ${liveEntries.join(', ')}.`;
    if (publish) SharedGraph.publishHover(this, timestamp);
  }

  _hideTooltip(publish = true) {
    if (publish) SharedGraph.clearHover(this);
    this._hoverTimestamp = null;
    this.shadowRoot.querySelector('.tooltip')?.setAttribute('hidden', '');
    this.shadowRoot.querySelector('.hover-line')?.setAttribute('hidden', '');
    this.shadowRoot.querySelector('.hover-dot[data-series="import"]')?.setAttribute('hidden', '');
    this.shadowRoot.querySelector('.hover-dot[data-series="export"]')?.setAttribute('hidden', '');
    this.shadowRoot.querySelector('.consumption-dot')?.setAttribute('hidden', '');
  }

  _styles() {
    const colorOverrides = [
      ['cheap_color', '--cheap'],
      ['normal_color', '--normal'],
      ['expensive_color', '--expensive'],
      ['zero_color', '--zero-color'],
      ['negative_color', '--negative-color'],
      ['import_favorable_color', '--import-best'],
      ['export_favorable_color', '--export-best'],
    ].map(([key, token]) => {
      const color = rgbColorToCss(this._config?.[key]);
      return color ? `${token}: ${color};` : '';
    }).join('\n');
    return `
      :host {
        --cheap: var(--success-color, #19a974);
        --normal: #f2a93b;
        --expensive: var(--error-color, #e45c4f);
        --zero-color: #18a999;
        --negative-color: #168aad;
        --import-best: var(--success-color, #19a974);
        --export-best: #1976d2;
        ${colorOverrides}
        --cheapest-fill: color-mix(in srgb, var(--import-best) 13%, transparent);
        --export-best-fill: color-mix(in srgb, var(--export-best) 18%, transparent);
        --font-size-meta: 10px;
        --font-size-label: 12px;
        --font-size-title: 18px;
        --font-size-value: 20px;
        --font-weight-regular: 400;
        --font-weight-medium: 500;
        --font-weight-strong: 600;
        --line-height-tight: 1.2;
        --line-height-normal: 1.4;
        display: block;
        height: 100%;
      }
      ha-card { overflow: hidden; height: 100%; }
      .card-content { display: flex; flex-direction: column; box-sizing: border-box; min-height: 0; height: 100%; padding: 16px 16px 12px; color: var(--primary-text-color); font-weight: var(--font-weight-regular); line-height: var(--line-height-normal); }
      .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      .heading { min-width: 0; }
      h2 { margin: 0; font-size: var(--font-size-title); line-height: var(--line-height-tight); font-weight: var(--font-weight-strong); letter-spacing: -0.01em; }
      .header-cheapest { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 12px; min-height: 34px; color: var(--secondary-text-color); font-size: var(--font-size-label); font-weight: var(--font-weight-strong); line-height: var(--line-height-tight); }
      .header-cheapest span { display: inline-flex; align-items: center; gap: 6px; }
      .compact-summary { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 30px; margin-bottom: 2px; }
      .compact-current { min-width: 0; white-space: nowrap; color: var(--primary-text-color); font-size: var(--font-size-label); font-weight: var(--font-weight-strong); }
      .compact-current span, .compact-current small { color: var(--secondary-text-color); font-size: var(--font-size-meta); font-weight: var(--font-weight-medium); }
      .compact-current strong { font-size: 16px; font-variant-numeric: tabular-nums; }
      .compact-current strong.negative { color: var(--negative-color); }
      .compact-current strong.cheap { color: var(--cheap); }
      .compact-current strong.normal { color: var(--normal); }
      .compact-current strong.expensive { color: var(--expensive); }
      .compact-current strong.unavailable { color: var(--secondary-text-color); }
      .compact-current em { padding: 2px 5px; border-radius: 999px; color: var(--import-best); background: var(--cheapest-fill); font-size: var(--font-size-meta); font-style: normal; }
      .compact-context { overflow: hidden; color: var(--secondary-text-color); font-size: var(--font-size-label); font-weight: var(--font-weight-medium); line-height: var(--line-height-tight); text-overflow: ellipsis; white-space: nowrap; }
      .current-block { display: flex; justify-content: flex-end; align-items: flex-start; gap: 8px; flex: none; margin-left: auto; }
      .current-metric { display: grid; justify-items: end; gap: 3px; min-width: 0; }
      .current-label { color: var(--secondary-text-color); font-size: var(--font-size-meta); font-weight: var(--font-weight-strong); line-height: var(--line-height-tight); }
      .current { display: grid; grid-template-columns: auto auto; align-items: baseline; column-gap: 5px; padding: 7px 9px; border-radius: 8px; background: var(--secondary-background-color); font-variant-numeric: tabular-nums; }
      .current strong { font-size: var(--font-size-value); line-height: 1; font-weight: var(--font-weight-strong); }
      .current span { font-size: var(--font-size-meta); color: var(--secondary-text-color); }
      .current.negative strong { color: var(--negative-color); }
      .current.cheap strong { color: var(--cheap); }
      .current.normal strong { color: var(--normal); }
      .current.expensive strong { color: var(--expensive); }
      .current.unavailable strong { color: var(--secondary-text-color); }
      .current-window { color: var(--secondary-text-color); font-size: var(--font-size-meta); font-weight: var(--font-weight-strong); line-height: var(--line-height-tight); }
      .current-window.active { color: var(--import-best); }
      .current-metric.export .current-window.active { color: var(--export-best); }
      .legend { display: flex; flex-wrap: wrap; gap: 7px 16px; margin: 12px 0 2px; color: var(--secondary-text-color); font-size: var(--font-size-label); font-weight: var(--font-weight-medium); line-height: var(--line-height-tight); }
      .legend span { display: inline-flex; align-items: center; gap: 6px; }
      .legend-series { display: inline-flex; align-items: center; gap: 6px; margin: 0; padding: 1px 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
      .legend-series[aria-pressed="false"] { opacity: 0.45; text-decoration: line-through; }
      .legend-series:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 3px; border-radius: 3px; }
      .data-status { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 7px; min-height: 14px; margin: 3px 0 0; color: var(--secondary-text-color); font-size: var(--font-size-meta); font-weight: var(--font-weight-medium); line-height: var(--line-height-tight); }
      .data-status i { opacity: 0.55; font-style: normal; }
      .data-status.warning { color: var(--warning-color, var(--normal)); }
      .swatch { width: 15px; height: 4px; border-radius: 4px; background: var(--divider-color); }
      .series-swatch { height: 0; border-radius: 0; border-top: var(--series-width, 3px) solid var(--series-color); background: none; }
      .series-swatch.dashed { border-top-style: dashed; }
      .series-swatch.dotted { border-top-style: dotted; }
      .swatch.selection, .swatch.export-selection { height: 11px; border-radius: 2px; background: var(--cheapest-fill); border: 1px solid color-mix(in srgb, var(--import-best) 45%, transparent); }
      .swatch.export-selection { background: var(--export-best-fill); border-color: color-mix(in srgb, var(--export-best) 55%, transparent); }
      .chart { position: relative; flex: 1 1 300px; min-height: 120px; outline: none; touch-action: pan-y; }
      .chart:focus-visible { box-shadow: inset 0 0 0 2px var(--primary-color); border-radius: 8px; }
      svg { display: block; width: 100%; height: 100%; overflow: hidden; }
      .chart-label { position: absolute; z-index: 1; pointer-events: none; font-size: var(--font-size-meta); font-weight: var(--font-weight-medium); line-height: var(--line-height-tight); font-variant-numeric: tabular-nums; white-space: nowrap; text-shadow: 0 1px 2px var(--card-background-color), 0 0 4px var(--card-background-color); }
      .x-label { bottom: 4px; transform: translateX(-50%); color: var(--secondary-text-color); }
      .energy-axis-label { right: 1px; transform: translateY(-50%); color: var(--secondary-text-color); }
      .energy-unit { right: 1px; top: 0; color: var(--secondary-text-color); }
      .with-consumption .level-label { right: 34px; }
      .consumption-area { fill: var(--consumption-fill-color); }
      .consumption-area.fade { fill: url(#consumption-area-gradient); opacity: 1; }
      .y-label { left: 1px; transform: translateY(-50%); color: var(--secondary-text-color); }
      .day-label { top: 8px; color: var(--primary-text-color); font-size: var(--font-size-label); font-weight: var(--font-weight-strong); }
      .now-label { top: 24px; transform: translateX(-50%); color: var(--primary-text-color); font-weight: var(--font-weight-strong); }
      .level-label { right: 3px; transform: translateY(-135%); padding: 1px 4px; border-radius: 3px; color: var(--secondary-text-color); background: color-mix(in srgb, var(--card-background-color) 88%, transparent); }
      .level-label.import-level:nth-of-type(1) { color: var(--cheap); }
      .average-label { transform: translateY(-135%); padding: 2px 5px; border-radius: 4px; color: var(--primary-text-color); background: color-mix(in srgb, var(--card-background-color) 88%, transparent); font-size: var(--font-size-label); font-weight: var(--font-weight-strong); }
      .export-average-label { border-left: 2px dashed currentColor; }
      .day-divider { stroke: var(--primary-text-color); stroke-opacity: 0.28; stroke-dasharray: 4 5; stroke-width: 1; vector-effect: non-scaling-stroke; }
      .selection-band { pointer-events: none; }
      .import-selection-band { fill: var(--import-best); fill-opacity: 0.09; }
      .export-selection-band { fill: var(--export-best); fill-opacity: 0.10; }
      .area { stroke: none; opacity: 0.14; }
      .import-area { fill: var(--import-fill-color); }
      .export-area { fill: var(--export-fill-color); }
      .import-area.fade { fill: url(#import-area-gradient); opacity: 1; }
      .export-area.fade { fill: url(#export-area-gradient); opacity: 1; }
      ${graphStyles()}
      ${['import','export','consumption'].map(p=>{
        const c=this._config,follow=c?.[p+'_fill_mode']==='line',opacity=c?.[p+'_fill_opacity'];
        return follow?`.${p}-area,.${p}-area.fade{fill:${this._seriesAppearance(p).stroke};opacity:${opacity??(c[p+'_fill_fade']!==false?(p==='consumption'?.18:.22):.14)};${c[p+'_fill_fade']!==false?`mask:url(#${p}-follow-mask);`:''}}`:opacity===undefined?'':`.${p}-area:not(.fade){opacity:${opacity};}`;
      }).join('')}
      .level-line { stroke-opacity: 0.55; stroke-dasharray: 5 5; stroke-width: 1; vector-effect: non-scaling-stroke; }
      .cheap-level[data-level-class="import-level"] { stroke: var(--cheap); }
      .normal-level { stroke: var(--normal); }
      .expensive-level[data-level-class="import-level"] { stroke: var(--expensive); }
      .cheap-level[data-level-class="export-level"] { stroke: var(--expensive); }
      .expensive-level[data-level-class="export-level"] { stroke: var(--cheap); }
      .level-line[data-level-class="neutral-level"] { stroke: var(--secondary-text-color); }
      .neutral-level { color: var(--secondary-text-color); }
      .average-line { stroke: var(--primary-text-color); stroke-opacity: 0.62; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
      .import-average { stroke-dasharray: 8 5; }
      .export-average { stroke-dasharray: 2 5; }
      .now-line { stroke: var(--primary-text-color); stroke-opacity: 0.72; stroke-dasharray: 3 3; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
      .hover-line { stroke: var(--primary-text-color); stroke-opacity: 0.75; stroke-width: 1.5; vector-effect: non-scaling-stroke; }

      .hover-dot.negative { border-color: var(--negative-color); }
      .hover-dot.cheap { border-color: var(--cheap); }
      .hover-dot.normal { border-color: var(--normal); }
      .hover-dot.expensive { border-color: var(--expensive); }
      .export-dot { width: 14px; height: 14px; }
      .consumption-dot { width: 10px; height: 10px; border-width: 2px; }
      ${SharedGraph.tooltipStyles()}
      .tooltip[data-horizontal="right"][data-vertical="below"] { transform: translate(12px, 12px); }
      .tooltip[data-horizontal="right"][data-vertical="above"] { transform: translate(12px, calc(-100% - 12px)); }
      .tooltip[data-horizontal="left"][data-vertical="below"] { transform: translate(calc(-100% - 12px), 12px); }
      .tooltip[data-horizontal="left"][data-vertical="above"] { transform: translate(calc(-100% - 12px), calc(-100% - 12px)); }
      .tooltip[data-horizontal="center"][data-vertical="below"] { transform: translate(-50%, 12px); }
      .tooltip[data-horizontal="center"][data-vertical="above"] { transform: translate(-50%, calc(-100% - 12px)); }

      .tooltip[data-horizontal="positioned"] { transform: none; }

      .price-table-wrap { flex: 0 1 auto; min-height: 0; max-height: 190px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--divider-color); overflow: auto; }
      .price-table-wrap h3 { margin: 0 0 4px; font-size: var(--font-size-label); font-weight: var(--font-weight-strong); line-height: var(--line-height-tight); }
      .table-unit { float: right; color: var(--secondary-text-color); font-size: var(--font-size-meta); font-weight: var(--font-weight-medium); }
      .cheapest-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-label); line-height: var(--line-height-normal); font-variant-numeric: tabular-nums; }
      .cheapest-table th, .cheapest-table td { padding: 6px 8px; text-align: left; white-space: nowrap; }
      .cheapest-table th { color: var(--secondary-text-color); font-size: var(--font-size-meta); font-weight: var(--font-weight-strong); text-transform: uppercase; letter-spacing: 0.04em; }
      .cheapest-table tbody tr { border-top: 1px solid var(--divider-color); }
      .cheapest-table .period-duration, .cheapest-table .period-average { text-align: right; }
      .period-type { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 999px; font-size: var(--font-size-meta); font-weight: var(--font-weight-strong); }
      .period-type.import { color: var(--import-best); background: var(--cheapest-fill); }
      .period-type.export { color: var(--export-best); background: var(--export-best-fill); }
      .state { display: grid; gap: 5px; padding: 20px; }
      .state span { color: var(--secondary-text-color); }
      .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
      [hidden] { display: none !important; }
      @media (max-width: 520px) {
        :host { --font-size-title: 17px; --font-size-value: 18px; }
        .card-content { padding: 12px 12px 10px; }
        .compact-summary { gap: 8px; }
        .compact-current { font-size: 11px; }
        .compact-current strong { font-size: 15px; }
        .compact-context { font-size: var(--font-size-meta); }
        .header { display: grid; grid-template-columns: minmax(0, 1fr); gap: 7px; }
        .heading { grid-column: 1 / -1; }
        .current-block { grid-column: 1 / -1; width: 100%; max-width: none; margin-left: 0; gap: 5px; justify-content: flex-end; }
        .current { padding: 5px 7px; column-gap: 3px; }
        .legend { gap: 6px 10px; margin-top: 9px; }
        .data-status { margin-top: 2px; }
        .chart { flex-basis: 260px; min-height: 110px; }

        .cheapest-table { font-size: 11px; }
        .cheapest-table th, .cheapest-table td { padding-inline: 1px; }
        .cheapest-table .period-type { padding-inline: 3px; }
      }
      @media (max-width: 360px) {
        .cheapest-table { font-size: 10px; }
        .current-block { justify-content: stretch; }
        .current-metric { flex: 1 1 0; justify-items: stretch; }
        .current { justify-content: center; }
      }
      @media (prefers-reduced-motion: reduce) { .tooltip { transition: none; } }
    `;
  }
}

if (!customElements.get('eleven-dynamic-energy-price-card')) {
  customElements.define('eleven-dynamic-energy-price-card', DynamicEnergyPriceCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === 'eleven-dynamic-energy-price-card')) {
  window.customCards.push({
    type: 'eleven-dynamic-energy-price-card',
    name: 'Eleven Dynamic Energy Price Card',
    get description() { return editorText('Afname- en terugleverprijzen met gunstige momenten per dag.'); },
    preview: true,
  });
}

})();

;
/* Eleven Cards 0.3.1-local — Eleven History Graph Card; standalone, no dependencies. */
(()=>{
"use strict";

// ../../shared/graph.js
// Domain-neutral SVG renderer. Adapters own data, geometry, colors and annotations.
function graphLineStyle(style, width = 3.5) {
  return {style, width, dash: style === 'dashed' ? '8 7' : style === 'dotted' ? '1 7' : 'none', cap: style === 'dashed' ? 'butt' : 'round'};
}
const graphAttribute = value => String(value).replace(/[&"<>]/g, c => ({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
class SharedGraph {
  static hoverGroup(host) {
    return host._config?.sync_hover === false ? null : (host._config?.hover_sync_group?.trim() || 'default');
  }
  static hoverState() {
    const key = Symbol.for('eleven-cards.hover-sync.v1');
    const target = globalThis.window ?? globalThis;
    return target[key] ??= new Map();
  }
  static connectHover(host, receive) {
    this.disconnectHover(host);
    host._receiveSharedHover = receive;
    host._sharedHoverListener = event => {
      const {source, group, timestamp} = event.detail;
      if (source !== host && host.isConnected && group === this.hoverGroup(host)) receive(timestamp);
    };
    window.addEventListener('eleven-cards:hover-sync', host._sharedHoverListener);
    // Scroll does not cross shadow roots: listen in every enclosing tree.
    host._sharedScrollTargets = [window];
    for (let root = host.getRootNode?.(); root && root !== window; root = root.host?.getRootNode()) {
      host._sharedScrollTargets.push(root);
    }
    host._sharedScrollListener = event => {
      if (event?.composedPath?.().some(node => node?.classList?.contains('tooltip'))) return;
      host._hideTooltip();
    };
    for (const target of host._sharedScrollTargets) target.addEventListener('scroll', host._sharedScrollListener, true);
    window.addEventListener('resize', host._sharedScrollListener);
  }
  static tooltipInView(host) {
    const chart = host.shadowRoot?.querySelector('.chart');
    const box = chart?.getBoundingClientRect?.();
    if (!box) return true;
    const bottom = box.bottom ?? box.top + box.height, right = box.right ?? box.left + box.width;
    if (bottom <= 0 || right <= 0 || box.top >= (window.innerHeight ?? Infinity) || box.left >= (window.innerWidth ?? Infinity)) return false;
    // Respect nested scrolling/clipping containers, including HA's shadow trees.
    for (let node = host; node; node = node.parentElement ?? node.getRootNode?.().host) {
      if (!node.getBoundingClientRect || !globalThis.getComputedStyle) continue;
      const style = getComputedStyle(node), clipX = /auto|scroll|hidden|clip/.test(style.overflowX), clipY = /auto|scroll|hidden|clip/.test(style.overflowY);
      if (!clipX && !clipY) continue;
      const bounds = node.getBoundingClientRect();
      if ((clipY && (bottom <= bounds.top || box.top >= bounds.bottom)) || (clipX && (right <= bounds.left || box.left >= bounds.right))) return false;
    }
    return true;
  }
  static tooltipStyles() {
    return `.tooltip{position:absolute;z-index:4;box-sizing:border-box;min-width:0;max-width:calc(100% - 8px);padding:8px 10px;border:1px solid var(--divider-color,#ddd);border-radius:6px;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));box-shadow:0 3px 12px #0002;font-size:12px;line-height:1.4;font-variant-numeric:tabular-nums;overflow:auto;overflow-wrap:anywhere;pointer-events:none}.tooltip[hidden]{display:none}.tooltip strong{display:block;margin-bottom:4px;white-space:normal}.tooltip span{display:grid;grid-template-columns:9px minmax(0,1fr);column-gap:6px;margin-top:5px;white-space:normal}.tooltip i{display:block;width:9px;height:9px;margin:4px 0 0;border:0;border-radius:3px;flex-shrink:0;background:var(--series-color)}.tooltip b{font-weight:600;min-width:0;overflow-wrap:anywhere}.tooltip small{display:block;grid-column:2;color:var(--secondary-text-color,#666);font-size:10px;white-space:normal;font-variant-numeric:tabular-nums}`;
  }
  static publishHover(host, timestamp) {
    const group = this.hoverGroup(host);
    if (!group || !host.isConnected || !Number.isFinite(timestamp)) return;
    this.hoverState().set(group, {source: host, timestamp});
    window.dispatchEvent(new CustomEvent('eleven-cards:hover-sync', {detail: {source: host, group, timestamp}}));
  }
  static clearHover(host) {
    for (const [group, active] of this.hoverState()) {
      if (active.source !== host) continue;
      this.hoverState().delete(group);
      window.dispatchEvent(new CustomEvent('eleven-cards:hover-sync', {detail: {source: host, group, timestamp: null}}));
    }
  }
  static hoverSourceInEvent(host, event) {
    const active = this.hoverState().get(this.hoverGroup(host));
    return Boolean(active && event.composedPath().includes(active.source));
  }
  static restoreHover(host) {
    if (!host.isConnected) return;
    const active = this.hoverState().get(this.hoverGroup(host));
    if (active && host.isConnected) host._receiveSharedHover?.(active.timestamp);
  }
  static disconnectHover(host) {
    this.clearHover(host);
    if (host._sharedHoverListener) globalThis.window?.removeEventListener('eleven-cards:hover-sync', host._sharedHoverListener);
    for (const target of host._sharedScrollTargets ?? []) target.removeEventListener('scroll', host._sharedScrollListener, true);
    globalThis.window?.removeEventListener('resize', host._sharedScrollListener);
    host._sharedScrollTargets = [];
    host._sharedScrollListener = null;
    host._sharedHoverListener = null;
    host._receiveSharedHover = null;
  }
  static interpolation(value, fallback = 'smooth') {
    const mode = value == null || value === '' ? fallback : value;
    if (!['smooth', 'linear', 'step'].includes(mode)) throw new Error('line_interpolation');
    return mode;
  }
  static path(points, mode = 'smooth', end) {
    mode = this.interpolation(mode);
    let path = '', previous = null;
    for (const [x, y] of points) {
      if (!Number.isFinite(y)) {
        if (previous && end !== undefined) path += ` H ${x}`;
        previous = null;
        continue;
      }
      if (!previous) path += `${path ? ' ' : ''}M ${x} ${y}`;
      else if (mode === 'linear') path += ` L ${x} ${y}`;
      else if (mode === 'step') path += ` H ${x} V ${y}`;
      else {
        const middle = (previous[0] + x) / 2;
        path += ` C ${middle} ${previous[1]}, ${middle} ${y}, ${x} ${y}`;
      }
      previous = [x, y];
    }
    if (previous && end !== undefined) path += ` H ${end}`;
    return path;
  }
  render(host, {viewBox, defs = '', before = '', after = '', fills = [], lines = []}) {
    const previous = host.shadowRoot.querySelector('.chart-enter')?.getAnimations?.().find(a => a.animationName === 'chart-reveal' && a.playState !== 'finished' && Number(a.currentTime ?? 0) < 650);
    this.progress = Number(previous?.currentTime ?? 0);
    this.entering = Boolean(host.isConnected && (!this.loaded || previous) && lines.some(p => p.d));
    if (host.isConnected && lines.some(p => p.d)) this.loaded = true;
    const areas = fills.filter(p => p.d).map(p => `<path d="${graphAttribute(p.d)}" class="${graphAttribute(p.className)}"${p.fill ? ` fill="${graphAttribute(p.fill)}"` : ''}${p.opacity != null ? ` fill-opacity="${p.opacity}"` : ''}${p.mask ? ` mask="${graphAttribute(p.mask)}"` : ''}/>`).join('');
    const paths = lines.filter(p => p.d).map(p => {
      const a = p.appearance;
      const stroke = p.inlineStyle ? `style="stroke:${graphAttribute(a.stroke)};stroke-width:${a.width};stroke-dasharray:${a.dash};stroke-linecap:${a.cap}"` : `stroke="${graphAttribute(a.stroke)}" stroke-width="${a.width}" stroke-dasharray="${a.dash}" stroke-linecap="${a.cap}"`;
      return `<path d="${graphAttribute(p.d)}" class="${graphAttribute(p.className)}"${p.entity ? ` data-entity="${graphAttribute(p.entity)}"` : ''} ${stroke}/>`;
    }).join('');
    return `<svg viewBox="${viewBox}" preserveAspectRatio="none" aria-hidden="true">${defs}${before}<g class="chart-series${this.entering ? ' chart-enter' : ''}">${areas}${paths}</g>${after}</svg>`;
  }
  restore(host) {
    if (this.entering && this.progress > 0) {
      const animation = host.shadowRoot.querySelector('.chart-enter')?.getAnimations?.().find(a => a.animationName === 'chart-reveal');
      if (animation) animation.currentTime = this.progress;
    }
  }
}
function graphStyles() {
  return `
      .price-line, .series-line { fill: none; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
      .chart-enter { animation: chart-reveal 650ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      @keyframes chart-reveal {
        from { clip-path: inset(0 100% 0 0); }
        to { clip-path: inset(0 0 0 0); }
      }
      .hover-dot { position: absolute; z-index: 2; width: 12px; height: 12px; box-sizing: border-box; border: 3px solid; border-radius: 50%; transform: translate(-50%, -50%); background: var(--card-background-color); pointer-events: none; }
      @media (prefers-reduced-motion: reduce) { .chart-enter { animation: none; } }
  `;
}

// ../../shared/card-header.js
// Shared markup stays in each card's shadow root: native links and existing
// data-zoom handlers work without cross-bundle custom-element registration.
const headerEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bindCardPopupPosition(host,trigger,popup,isRequested,show){
 let active=true;
 const position=()=>{
  if(!active||!isRequested())return;
  const box=trigger.getBoundingClientRect();
  // A newly inserted ha-card may not have rendered its slot yet. Never anchor
  // an open popup to its temporarily empty trigger rectangle at (0, 0).
  if(!box.width||!box.height){popup.style.visibility='hidden';return;}
  popup.style.visibility='';show?.();
  const width=Math.min(380,window.innerWidth-16);
  popup.style.width=width+'px';popup.style.maxHeight=Math.min(560,window.innerHeight-16)+'px';
  const height=popup.getBoundingClientRect().height,below=window.innerHeight-box.bottom-8,above=box.top-8;
  popup.style.left=Math.max(8,Math.min(box.right-width,window.innerWidth-width-8))+'px';
  popup.style.top=Math.max(8,Math.min(below>=height||below>=above?box.bottom+6:box.top-height-6,window.innerHeight-height-8))+'px';
 };
 const ready=host.shadowRoot.querySelector('ha-card')?.updateComplete;
 if(ready?.then)ready.then(position,()=>{});
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(position):null;
 observer?.observe(trigger);
 return {position,disconnect(){active=false;observer?.disconnect();}};
}
// Native toggle events are asynchronous. Clear the other popup's restore
// state synchronously, also for browsers using the attribute fallback.
function closeOtherCardPopups(host,kind){
 const period=kind==='period',root=host.shadowRoot;
 if(period){host._insightOpen=null;host._insightPending=null;host._insightFocus=null;}
 else{host._periodMenuOpen=false;host._periodMenuPending=false;host._periodFocus=null;}
 for(const panel of root.querySelectorAll?.(period?'.insight-popup':'.period-menu')??[]){
  if(typeof panel.showPopover==='function'){if(panel.matches(':popover-open'))panel.hidePopover();}
  else panel.removeAttribute('data-fallback-open');
 }
 for(const trigger of root.querySelectorAll?.(period?'[data-insight]':'[data-period="menu"]')??[])trigger.setAttribute('aria-expanded','false');
}
function cardHeaderIcon(name){
 const paths={in:'M5 12h14M12 5v14',out:'M5 12h14',reset:'M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6',previous:'m15 6-6 6 6 6',next:'m9 6 6 6-6 6',info:'M12 17v-5M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',history:'M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',down:'m6 9 6 6 6-6'};
 return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
}
function cardHeader({title,showTitle=true,ready=false,historyUrl,language='en',periods={},zoomState={in:true,out:true,reset:true,zoomed:false},information=''}){
 const nl=language.startsWith('nl'),label=nl?['Inzoomen','Uitzoomen','Zoom herstellen','Open in Home Assistant Geschiedenis']:['Zoom in','Zoom out','Reset zoom','Open in Home Assistant History'];
 const zoom=ready?`<div class="zoom-controls" role="group" aria-label="Zoom">${['out','in','reset'].map(action=>`<button type="button" data-zoom="${action}"${zoomState[action]?'':' disabled'} title="${label[['in','out','reset'].indexOf(action)]}" aria-label="${label[['in','out','reset'].indexOf(action)]}">${cardHeaderIcon(action)}</button>`).join('')}</div>`:'';
 const group=periods.navigation||zoom?`<div class="chart-controls" role="group" aria-label="${nl?'Periode en zoom':'Period and zoom'}">${periods.navigation??''}${zoom}</div>`:'';
 const showZoomStatus=zoomState.zoomed&&!periods.picker;
 return `<header class="card-header">${showTitle&&title?`<h2>${headerEscape(title)}</h2>`:''}<div class="header-actions">${periods.picker??''}${group}<div class="chart-links"><a class="history-link" href="${headerEscape(historyUrl)}" title="${label[3]}" aria-label="${label[3]}">${cardHeaderIcon('history')}</a>${information}</div></div></header>${showZoomStatus?`<div class="chart-context"><div class="chart-range"><span class="zoom-status">${nl?'Ingezoomd':'Zoomed in'}</span></div></div>`:''}`;
}
function cardHeaderStyles(){return `
.card-header{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;min-height:32px;flex:none;margin:-6px -4px 10px 0}
.card-header h2{flex:1 1 110px;min-width:0;margin:4.75px 0 0;font-size:18px;line-height:1.25;font-weight:650;letter-spacing:-.01em;overflow-wrap:anywhere}
.header-actions{--chart-action-gap:8px;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:var(--chart-action-gap);flex:0 1 auto;min-width:0;max-width:100%;margin-inline-start:auto}
.chart-controls{display:flex;align-items:center;flex-wrap:wrap;gap:0;max-width:100%}
.chart-links{display:flex;align-items:center;gap:var(--chart-action-gap);flex:none}
.zoom-controls{display:flex;gap:0;position:relative}
.header-actions button,.history-link{display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:inherit;font-size:12px;font-weight:400;width:32px;height:32px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--primary-text-color,#20252b);text-decoration:none;cursor:pointer;flex:none}
.chart-controls,.chart-links>.history-link{background:var(--secondary-background-color,#eee);border-radius:5px}
.chart-controls button:not(:disabled):hover,.chart-links>.history-link:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.chart-controls>[data-period="now"]{width:36px}
.chart-controls>[data-period="next"]+.zoom-controls{margin-inline-start:8px;padding-inline-start:8px}
.chart-controls>[data-period="next"]+.zoom-controls::before{content:"";position:absolute;inset-inline-start:0;top:8px;height:16px;width:1px;background:var(--divider-color,#ddd)}
.header-actions button:disabled{opacity:.35;cursor:default}
.header-actions button:hover,.history-link:hover{background:var(--secondary-background-color,#eee)}
.header-actions button:focus-visible,.history-link:focus-visible{background:var(--secondary-background-color,#eee);outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.period-menu,.insight-popup{display:none;position:fixed;inset:auto;margin:0;padding:8px 12px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;z-index:20;max-width:calc(100vw - 16px);border:1px solid var(--divider-color,#ddd);border-radius:10px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font:inherit;font-size:12px;line-height:1.35;box-shadow:0 8px 28px #0004}
.chart-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.chart-popup-heading>strong{font-size:14px;font-weight:600}
.period-menu .chart-popup-heading>button,.insight-popup .chart-popup-heading>button{display:flex;align-items:center;justify-content:center;width:30px;height:30px;min-height:30px;padding:0;border:0;border-radius:5px;background:transparent;color:inherit;font:inherit;font-size:20px;font-weight:400;flex:none;cursor:pointer}
`;}

// ../../shared/periods.js
// Calendar periods use the Home Assistant timezone, including DST boundaries.
const periodZoneFormats=new Map();
function periodLocalParts(t,zone){
 let format=periodZoneFormats.get(zone);
 if(!format){format=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});periodZoneFormats.set(zone,format);}
 return Object.fromEntries(format.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
}
function periodLocalEpoch(t,zone){const p=periodLocalParts(t,zone);return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
function periodMidnight(nominal,zone){
 let t=nominal;for(let i=0;i<6;i++){const next=nominal-(periodLocalEpoch(t,zone)-t);if(next===t)return t;t=next;}
 // Midnight can be skipped by a timezone transition. Use the first valid
 // instant of that local date rather than oscillating across the transition.
 let low=nominal-36*3600000,high=nominal+36*3600000;
 while(high-low>1000){const mid=Math.floor((low+high)/2000)*1000,p=periodLocalParts(mid,zone);if(Date.UTC(p.year,p.month-1,p.day)>=nominal)high=mid;else low=mid;}
 return high;
}
function graphPeriodBounds(t,period,zone='UTC'){
 zone ||= 'UTC';const p=periodLocalParts(t,zone),size={minute:60000,quarter_hour:900000,hour:3600000}[period];
 if(size){const local=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),a=t-(local%size)-(t%1000);return [a,a+size];}
 let nominal=Date.UTC(p.year,p.month-1,period==='month'?1:p.day);let next;
 if(period==='week'){const day=new Date(nominal).getUTCDay();nominal-=((day+6)%7)*86400000;next=nominal+7*86400000;}
 else if(period==='month')next=Date.UTC(p.year,p.month,1);
 else next=nominal+86400000;
 return [periodMidnight(nominal,zone),periodMidnight(next,zone)];
}
const periodCalendarModes=['today','week','month','quarter','year'];
const periodPresetHours={'1h':1,'6h':6,'12h':12,'24h':24,'48h':48,'7d':168,'14d':336,'30d':720,'90d':2160,'365d':8760};
function resetGraphPeriod(host){host._periodMode='configured';host._periodHours=null;host._periodEnd=null;host._periodOffset=0;host._periodAnchor=null;host._periodMenuOpen=false;host._periodMenuPending=false;host._insightPending=null;}
function graphPeriodRange(host,now=Date.now()){
 const mode=host._periodMode,offset=host._periodOffset??0;
 if(periodCalendarModes.includes(mode)){
  const zone=host._hass?.config?.time_zone||'UTC',p=periodLocalParts(host._periodAnchor??now,zone);
  let nominal,finishNominal;
  if(mode==='week'){
   nominal=Date.UTC(p.year,p.month-1,p.day);nominal+=(offset*7-(new Date(nominal).getUTCDay()+6)%7)*86400000;finishNominal=nominal+7*86400000;
  }else if(mode==='month'||mode==='quarter'){
   const size=mode==='quarter'?3:1,month=(mode==='quarter'?Math.floor((p.month-1)/3)*3:p.month-1)+offset*size;
   nominal=Date.UTC(p.year,month,1);finishNominal=Date.UTC(p.year,month+size,1);
  }else if(mode==='year'){nominal=Date.UTC(p.year+offset,0,1);finishNominal=Date.UTC(p.year+offset+1,0,1);}
  else{nominal=Date.UTC(p.year,p.month-1,p.day+offset);finishNominal=nominal+86400000;}
  const start=periodMidnight(nominal,zone),finish=periodMidnight(finishNominal,zone);
  return {start,end:Math.max(start+1,Math.min(now,finish))};
 }
 const end=host._periodEnd??now;
 return {start:end-(host._periodHours??host._config.hours_to_show)*3600000,end};
}
function chooseGraphPeriod(host,value){
 const calendar=value==='configured'||periodCalendarModes.includes(value),hours=periodPresetHours[value]??Number(value);
 if(!calendar&&(!Number.isFinite(hours)||hours<1||hours>8760))return;
 resetGraphPeriod(host);
 host._periodMode=calendar?value:Object.entries(periodPresetHours).find(([,h])=>h===hours)?.[0]??String(value);
 if(!calendar)host._periodHours=hours;
 return host._reloadPeriod();
}
function moveGraphPeriod(host,direction){
 if(![-1,0,1].includes(direction))return;
 if(direction===0){host._periodOffset=0;host._periodEnd=null;host._periodAnchor=null;}
 else{
  const previous=host._periodOffset??0;
  const calendar=periodCalendarModes.includes(host._periodMode);
  if(previous===0)host._periodAnchor=calendar?Date.now():host._status==='ready'?(host._end??Date.now()):Date.now();
  host._periodOffset=Math.min(0,previous+direction);
  if(host._periodOffset===0)host._periodAnchor=null;
  if(!calendar){
   host._periodEnd=host._periodOffset===0?null:host._periodAnchor+host._periodOffset*(host._periodHours??host._config.hours_to_show)*3600000;
  }
 }
 return host._reloadPeriod();
}

// ../../shared/period-controls.js
const periodEscape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function compactPeriodName({start,end,mode,past,zoomed,hours,name,locale,zone}){
 const format=options=>new Intl.DateTimeFormat(locale,{timeZone:zone,...options});
 const dates=format({year:'numeric',month:'numeric',day:'numeric'});
 const parts=t=>Object.fromEntries(dates.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 const a=parts(start),b=parts(end),currentYear=parts(Date.now()).year;
 const dayMonth=format({day:'numeric',month:'short'}),dayYear=format({day:'numeric',month:'short',year:'numeric'});
 const sameDay=a.year===b.year&&a.month===b.month&&a.day===b.day;
 const dateRange=(from,to)=>{
  const first=parts(from),last=parts(to),year=first.year!==currentYear?` ${first.year}`:'';
  if(first.year!==last.year)return `${dayYear.format(from)}–${dayYear.format(to)}`;
  if(first.month===last.month)return `${first.day===last.day?'':`${first.day}–`}${dayMonth.format(to)}${year}`;
  return `${dayMonth.format(from)}–${dayMonth.format(to)}${year}`;
 };
 if(zoomed||(past&&!['today','week','month','quarter','year'].includes(mode)&&hours<24)){
  const time=format({hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  if(sameDay){
   const offsets=format({timeZoneName:'shortOffset'}),offset=t=>offsets.formatToParts(t).find(p=>p.type==='timeZoneName')?.value;
   const clock=offset(start)!==offset(end)?format({hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'}):time;
   return `${(a.year===currentYear?dayMonth:dayYear).format(start)} · ${clock.format(start)}–${clock.format(end)}`;
  }
  if(end-start<48*3600000)return `${(a.year===b.year&&a.year===currentYear?dayMonth:dayYear).format(start)} ${time.format(start)}–${(a.year===b.year&&a.year===currentYear?dayMonth:dayYear).format(end)} ${time.format(end)}`;
  return dateRange(start,end);
 }
 if(mode==='month'){const month=format({month:'long',year:'numeric'}).format(start);return month[0].toLocaleUpperCase(locale)+month.slice(1);}
 if(mode==='quarter')return `Q${Math.ceil(a.month/3)} ${a.year}`;
 if(mode==='year')return String(a.year);
 if(mode==='week')return dateRange(start,Math.max(start,end-1));
 if(mode==='today')return past?dateRange(start,Math.max(start,end-1)):name;
 if(past)return `${dateRange(start,end)} · ${hours>=168&&hours%24===0?`${hours/24} ${locale==='nl-NL'?'dagen':'days'}`:`${hours} ${locale==='nl-NL'?'uur':hours===1?'hour':'hours'}`}`;
 return name;
}
function periodControls(host,language='en'){
 const active=host.shadowRoot.activeElement;
 if(!host._periodMenuPending)host._periodFocus=null;
 if(active?.closest?.('.header-actions'))host._periodFocus=active.dataset.periodOption!=null?`option:${active.dataset.periodOption}`:active.dataset.zoom!=null?`zoom:${active.dataset.zoom}`:active.classList.contains('history-link')?'history':active.dataset.period;
 if(host._config.show_navigation===false){host._periodMenuOpen=false;host._periodMenuPending=false;return {};}
 const previousMenu=host.shadowRoot.querySelector('.period-menu');
 if(previousMenu){
  host._periodMenuScroll=previousMenu.scrollTop;
  host._periodMenuOpen=!!host._periodMenuPending||(typeof previousMenu.showPopover==='function'?previousMenu.matches(':popover-open'):previousMenu.hasAttribute('data-fallback-open'));
 }
 const nl=language.startsWith('nl'),label=(en,nlText)=>nl?nlText:en,mode=host._periodMode??'configured',past=(host._periodOffset??0)<0;
 const standard=label(`Default (${host._config.hours_to_show} hours)`,`Standaard (${host._config.hours_to_show} uur)`);
 const rolling=[['1h',1],['6h',6],['12h',12],['24h',24],['48h',48],['7d',168],['14d',336],['30d',720],['90d',2160],['365d',8760]].map(([id,hours])=>[id,hours<168?label(`${hours} ${hours===1?'hour':'hours'}`,`${hours} uur`):label(`${hours/24} days`,`${hours/24} dagen`)]);
 const calendar=[['today',label('Today','Vandaag'),label('Day','Dag')],['week',label('This week','Deze week'),label('Week','Week')],['month',label('This month','Deze maand'),label('Month','Maand')],['quarter',label('This quarter','Dit kwartaal'),label('Quarter','Kwartaal')],['year',label('This year','Dit jaar'),label('Year','Jaar')]];
 if(host._periodHours!=null&&!rolling.some(([id])=>id===mode))rolling.push([mode,label(`${host._periodHours} hours`,`${host._periodHours} uur`)]);
 const calendarChoice=calendar.find(([id])=>id===mode),name=mode==='configured'?standard:calendarChoice?.[past?2:1]??rolling.find(([id])=>id===mode)?.[1]??standard;
 const choice=([value,text])=>`<button type="button" role="menuitemradio" aria-checked="${value===mode}" tabindex="-1" data-period-option="${periodEscape(value)}"><span>${periodEscape(text)}</span><span aria-hidden="true">${value===mode?'✓':''}</span></button>`;
 const {start,end}=host._status==='ready'&&Number.isFinite(host._viewStart)&&Number.isFinite(host._viewEnd)?{start:host._viewStart,end:host._viewEnd}:graphPeriodRange(host);
 const locale=nl?'nl-NL':'en-GB',zone=host._hass?.config?.time_zone||'UTC';
 const zoomed=host._status==='ready'&&(start>host._start+1||end<host._end-1);
 const compactName=compactPeriodName({start,end,mode,past,zoomed,hours:host._periodHours??host._config.hours_to_show,name,locale,zone});
 const format=new Intl.DateTimeFormat(locale,{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
 const range=`${format.format(start)} – ${format.format(end)}`;
 return {picker:`<div class="period-controls"><button type="button" class="period-trigger" data-period="menu" aria-haspopup="menu" aria-controls="eleven-period-menu" aria-expanded="${host._periodMenuOpen===true}" title="${periodEscape(range)}" aria-label="${label('Timeframe','Tijdvak')}: ${periodEscape(compactName)}" aria-description="${periodEscape(range)}${zoomed?`. ${label('Zoomed in','Ingezoomd')}`:''}"><span>${periodEscape(compactName)}</span>${cardHeaderIcon('down')}</button><div class="period-menu" id="eleven-period-menu" popover="auto" role="menu" aria-label="${label('Choose a period','Kies een periode')}"><div class="chart-popup-heading"><strong>${label('Timeframe','Tijdvak')}</strong><button type="button" role="menuitem" data-period="close" aria-label="${label('Close','Sluiten')}">×</button></div><div class="period-current-range">${periodEscape(range)}${zoomed?`<span class="zoom-status">${label('Zoomed in','Ingezoomd')}</span>`:''}</div><div class="period-default">${choice(['configured',standard])}</div><div class="period-menu-columns"><div role="group" aria-label="${label('Last','Afgelopen')}"><h3>${label('Last','Afgelopen')}</h3>${rolling.map(choice).join('')}</div><div role="group" aria-label="${label('Calendar','Kalender')}"><h3>${label('Calendar','Kalender')}</h3>${calendar.map(choice).join('')}<p>${label('From the start of the period until now. Use the arrows for previous periods.','Vanaf de start van het tijdvak tot nu. Gebruik de pijlen voor vorige perioden.')}</p></div></div></div></div>`,navigation:`<button type="button" data-period="previous" title="${label('Previous period','Vorige periode')}" aria-label="${label('Previous period','Vorige periode')}">${cardHeaderIcon('previous')}</button><button type="button" data-period="now" title="${label('Return to the current period','Terug naar de huidige periode')}">${label('Now','Nu')}</button><button type="button" data-period="next" title="${label('Next period','Volgende periode')}" aria-label="${label('Next period','Volgende periode')}"${past?'':' disabled'}>${cardHeaderIcon('next')}</button>`};
}
function restorePeriodFocus(host,items=[]){
 const key=host._periodFocus;if(!key)return;const root=host.shadowRoot;
 const target=key==='history'?root.querySelector('.history-link'):key.startsWith('zoom:')?root.querySelector('[data-zoom="'+key.slice(5)+'"]'):key.startsWith('option:')&&host._periodMenuOpen?items.find(item=>item.dataset.periodOption===key.slice(7)):root.querySelector('[data-period="'+(key.startsWith('option:')?'menu':key)+'"]');
 (target?.disabled?root.querySelector('[data-period="now"], [data-zoom="in"]:not(:disabled), .history-link'):target)?.focus?.({preventScroll:true});host._periodFocus=null;
}
function disconnectPeriodControls(host,preserveState=false){host._periodMenuCleanup?.();host._periodMenuCleanup=null;if(!preserveState)host._periodMenuPending=false;}
function bindPeriodControls(host){
 disconnectPeriodControls(host,true);
 const root=host.shadowRoot,nav=root.querySelector('.period-controls');if(!nav){restorePeriodFocus(host);return;}
 const menu=nav.querySelector('.period-menu'),trigger=nav.querySelector('[data-period="menu"]'),items=[...menu.querySelectorAll('[data-period-option]')],native=typeof menu.showPopover==='function';
 const cleanups=[];
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 host._periodMenuCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 const isOpen=()=>native?menu.matches(':popover-open'):menu.hasAttribute('data-fallback-open');
 let focusPending=false;
 const placement=bindCardPopupPosition(host,trigger,menu,()=>host._periodMenuOpen,()=>{
  host._periodMenuPending=false;
  if(native){if(!isOpen())menu.showPopover();}else menu.setAttribute('data-fallback-open','');
  if(focusPending){(items.find(item=>item.getAttribute('aria-checked')==='true')??items[0]).focus({preventScroll:true});focusPending=false;}
  restorePeriodFocus(host,items);
 }),position=placement.position;
 cleanups.push(()=>placement.disconnect());
 const close=(restore=false)=>{
  host._periodMenuOpen=false;host._periodMenuPending=false;trigger.setAttribute('aria-expanded','false');
  if(native){if(menu.matches(':popover-open'))menu.hidePopover();}else menu.removeAttribute('data-fallback-open');
  if(restore)trigger.focus({preventScroll:true});
 };
 const open=(focus=true)=>{
  closeOtherCardPopups(host,'period');
  host._periodMenuOpen=true;host._periodMenuPending=true;focusPending=focus;trigger.setAttribute('aria-expanded','true');
  position();
 };
 // Remember the pointer state before native light dismissal runs on pointerup.
 let pointerWasOpen;
 trigger.onpointerdown=()=>{pointerWasOpen=host._periodMenuOpen;};
 trigger.onpointercancel=()=>{pointerWasOpen=undefined;};
 trigger.onclick=()=>{const wasOpen=pointerWasOpen??host._periodMenuOpen;pointerWasOpen=undefined;wasOpen?close(true):open();};
 menu.querySelector('[data-period="close"]').onclick=()=>close(true);
 trigger.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();if(e.key==='ArrowUp')items.at(-1).focus({preventScroll:true});}};
 menu.addEventListener('toggle',e=>{if(host.shadowRoot.querySelector('.period-menu')!==menu)return;host._periodMenuOpen=e.newState==='open';trigger.setAttribute('aria-expanded',String(host._periodMenuOpen));});
 for(const item of items)item.onclick=()=>{close(true);chooseGraphPeriod(host,item.dataset.periodOption);};
 menu.onkeydown=e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
  if(e.key==='Tab'){e.preventDefault();close(true);if(!e.shiftKey)root.querySelector('.chart-controls button:not(:disabled)')?.focus();return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const index=items.indexOf(host.shadowRoot.activeElement),next=e.key==='Home'?0:e.key==='End'?items.length-1:index<0?(e.key==='ArrowUp'?items.length-1:0):(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();}
 };
 for(const [key,direction]of [['previous',-1],['next',1],['now',0]])root.querySelector(`[data-period="${key}"]`).onclick=()=>{close();moveGraphPeriod(host,direction);};
 listen(window,'resize',()=>{if(host._periodMenuOpen)position();});
 listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(menu))close();},true);
 listen(document,'pointerdown',e=>{if((!native||host._periodMenuPending)&&host._periodMenuOpen&&!e.composedPath().includes(nav))close();});
 if(host._periodMenuOpen){open(false);menu.scrollTop=host._periodMenuScroll??0;}
 if(!host._periodMenuPending)restorePeriodFocus(host,items);
}
function periodControlsStyles(){return `
.period-controls{display:flex;min-width:0;max-width:100%}
.header-actions .period-trigger{width:auto;max-width:100%;gap:6px;padding:4px 10px;border:0;border-radius:5px;background:var(--secondary-background-color,#eee);font-weight:400}
.header-actions .period-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-trigger span{min-width:0;overflow-wrap:anywhere}
.period-current-range{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;margin:2px 0 10px}
.period-current-range .zoom-status{display:table;margin-top:4px}
.period-menu:popover-open{display:block}
.period-menu[data-fallback-open]{display:block}
.period-menu-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.period-menu h3{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--secondary-text-color,#666);margin:8px}
.period-menu button{font:inherit;font-size:12px;color:var(--primary-text-color,#20252b);background:transparent;box-sizing:border-box;display:flex;border:1px solid transparent;border-radius:5px;cursor:pointer;height:auto;width:100%;justify-content:space-between;gap:8px;min-height:34px;border-color:transparent;text-align:start;padding:6px 8px;font-weight:400}
.period-menu button:hover{background:var(--secondary-background-color,#eee)}
.period-menu button:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.period-menu button[aria-checked="true"]{color:var(--primary-color,#2196f3);background:color-mix(in srgb,var(--primary-color,#2196f3) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-menu p{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);margin:10px 8px 2px;overflow-wrap:anywhere}
.period-default{border-bottom:1px solid var(--divider-color,#ddd);padding-bottom:8px;margin-bottom:8px}
`;}

// ../../shared/chart-insights.js
const insightEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function chartZoomState(host){
 const total=host._end-host._start,ready=host._status==='ready'&&Number.isFinite(total)&&total>0;
 const a=Math.max(host._start,host._viewport?.[0]??host._start),b=Math.min(host._end,host._viewport?.[1]??host._end),width=Math.max(0,b-a);
 const zoomed=ready&&(a>host._start+1||b<host._end-1);
 return {zoomed,in:ready&&width>Math.min(60000,total)+1,out:ready&&width<total-1,reset:zoomed};
}
function chartEntityItems(host){return host._config.entities.map(id=>({id,name:host._config.series_options?.find(row=>row.entity===id)?.name||host._hass?.states?.[id]?.attributes?.friendly_name||id}));}
function chartSeriesVisible(host,index){return host._visibility?.get(host._config.entities[index])??true;}
function isolateChartSeries(host,id){
 if(!host._config.entities.includes(id))return;
 host._visibility=new Map(host._config.entities.map(entity=>[entity,entity===id]));host._hideTooltip?.();host._render();
}
function showAllChartSeries(host){host._visibility=new Map(host._config.entities.map(id=>[id,true]));host._hideTooltip?.();host._render();}
function cancelChartLegendClicks(host){for(const timer of host._legendClickTimers?.values()??[])clearTimeout(timer);host._legendClickTimers?.clear();}
function toggleChartIsolation(host,id){
 if(!host._config.entities.includes(id))return;
 cancelChartLegendClicks(host);
 const only=host._config.entities.every((entity,i)=>host._isSeriesVisible(i)===(entity===id));
 only?showAllChartSeries(host):isolateChartSeries(host,id);
 queueMicrotask(()=>host.shadowRoot.querySelector(`[data-series="${id}"]`)?.focus({preventScroll:true}));
}
function bindChartLegend(host){
 const nl=host._insightLanguage==='nl',hint=nl?'Dubbelklik of Shift+Enter: alleen deze sensor. Herhaal om alles te tonen.':'Double-click or Shift+Enter: show only this sensor. Repeat to show all.';
 for(const button of host.shadowRoot.querySelectorAll?.('[data-series]')??[]){
  const id=button.dataset.series;
  if(!button.title?.includes(hint))button.title=[button.title,hint].filter(Boolean).join(' ');button.setAttribute('aria-description',hint);button.setAttribute('aria-keyshortcuts','Shift+Enter Shift+Space');
  button.onclick=e=>{
   clearTimeout(host._legendClickTimers?.get(id));host._legendClickTimers?.delete(id);
   if(e.shiftKey||e.detail>1){e.preventDefault();toggleChartIsolation(host,id);return;}
   if(!e.detail){host._toggleSeries?host._toggleSeries(id):toggleChartIsolation(host,id);return;}
   // Keep the target alive until a second click can arrive: rendering after
   // the first click would replace it and break native double-click detection.
   if(host._toggleSeries){const config=host._config;host._legendClickTimers??=new Map();host._legendClickTimers.set(id,setTimeout(()=>{host._legendClickTimers.delete(id);if(host._config===config)host._toggleSeries(id);},300));}
  };
  button.ondblclick=e=>e.preventDefault();
  button.onkeydown=e=>{if(e.shiftKey&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();toggleChartIsolation(host,id);}};
 }
}
function insightControl(host,key,label,body,icon=''){
 return `<div class="insight-control"><button type="button" class="insight-trigger" data-insight="${key}" title="${insightEscape(label)}" aria-label="${insightEscape(label)}" aria-haspopup="dialog" aria-expanded="${host._insightOpen===key}" aria-controls="insight-${key}">${icon}${key==='data'?'':`<span>${insightEscape(label)}</span>`}</button><div id="insight-${key}" class="insight-popup" data-insight-panel="${key}" popover="auto" role="dialog" aria-label="${insightEscape(label)}"><div class="chart-popup-heading"><strong>${insightEscape(label)}</strong><button type="button" data-insight-close aria-label="${host._insightLanguage==='nl'?'Sluiten':'Close'}">×</button></div>${body}</div></div>`;
}
// Work on unstacked, undecimated values. A history value holds until the next
// point (null breaks coverage); bars have equal weight, regardless of bin length.
function chartValueStatistics(points,start,end,interval){
 let minimum=Infinity,maximum=-Infinity,sum=0,weight=0,count=0,covered=0,until=start;
 for(let i=0;i<points.length;i++){
  const p=points[i],[a,b]=interval?interval(p,i):[p.t,points[i+1]?.t??end];
  const left=Math.max(start,a,p.t),right=Math.min(end,b);
  if(right<=left||!Number.isFinite(p.v))continue;
  minimum=Math.min(minimum,p.v);maximum=Math.max(maximum,p.v);count++;
  const w=interval?1:right-left;sum+=p.v*w;weight+=w;
  const knownEnd=Math.min(right,points[i+1]?.t??end);
  covered+=Math.max(0,knownEnd-Math.max(left,until));until=Math.max(until,knownEnd);
 }
 return {minimum:count?minimum:null,maximum:count?maximum:null,average:weight?sum/weight:null,count,missing:covered<end-start-1};
}
function chartDataInformation(host,language='en'){
 const nl=language.startsWith('nl');host._insightLanguage=nl?'nl':'en';
 const load=host._lastLoad;
 const summary=host._status==='ready'?host._dataInformation?.():load?.summary;
 if(load&&summary&&host._status==='ready')load.summary=summary;
 const value=v=>{
  if(!Number.isFinite(v))return '—';
  const small=v!==0&&Math.abs(v)<.01,options=small?{maximumSignificantDigits:4}:{maximumFractionDigits:2};
  if(v!==0&&Math.abs(v)<.0001)options.notation='scientific';
  return insightEscape(new Intl.NumberFormat(language,options).format(Object.is(v,-0)?0:v));
 };
 let body=load?'':`<p role="status">${host._inFlight?(nl?'Laden…':'Loading…'):host._loadFailed?(nl?'Laadfout':'Load failed'):(nl?'Geen gegevens':'No data')}</p>`;
 if(load){
  body+=`<div class="insight-sensors">${chartEntityItems(host).map((item,i)=>{
   const source=load.sources.find(s=>s.id===item.id),row=summary?.rows.find(r=>r.id===item.id),hidden=!host._isSeriesVisible(i);
   const sourceLabel=source?(source.source==='statistics'?(nl?'Statistieken':'Statistics'):(nl?'Historie':'History')):(nl?'Niet geladen':'Not loaded');
   const unit=row?.unit??host._hass?.states?.[item.id]?.attributes?.unit_of_measurement??'';
   const metrics=row?.durations?`<dl class="insight-durations">${row.durations.map(s=>`<div><dt title="${insightEscape(s.missing?(nl?'Geen geschiedenis':'No history'):s.state)}">${insightEscape(s.label)}</dt><dd>${insightEscape(host._duration(s.duration))}</dd></div>`).join('')}</dl>`:row?`<dl class="insight-metrics${'total' in row?' has-total':''}">${[['minimum','Min'],['maximum','Max'],['average',nl?'Gem.':'Avg.']].map(([key,label])=>`<div><dt${key==='average'?` title="${nl?'Gemiddeld':'Average'}"`:''}>${label}</dt><dd data-metric="${key}">${value(row[key])}</dd></div>`).join('')}${'total' in row?`<div><dt title="${nl?'Som van volledige staven':'Sum of whole bars'}">${nl?'Som':'Sum'}</dt><dd data-metric="total">${value(row.total)}</dd></div>`:''}</dl>`:'';
   const states=[host._inFlight?(nl?'Vernieuwen…':'Refreshing…'):host._loadFailed?(nl?'Verouderd':'Outdated'):'',hidden?(nl?'Verborgen':'Hidden'):'',row?.limited?(nl?'Meer dan 20 statussen':'More than 20 states'):row?.count===0||source?.empty?(nl?'Geen gegevens':'No data'):row?.missing?(nl?'Onvolledig':'Incomplete'):''].filter(Boolean);
   return `<section class="insight-sensor" data-information-entity="${insightEscape(item.id)}"><div class="insight-sensor-heading"><strong>${insightEscape(item.name)}</strong><span class="insight-source">${sourceLabel}${unit?` <span class="insight-unit">· ${insightEscape(unit)}</span>`:''}</span></div>${metrics}${states.length?`<div class="insight-states" role="status">${states.join(' · ')}</div>`:''}</section>`;
  }).join('')}</div>`;
 }
 return insightControl(host,'data',nl?'Gegevens':'Data information',body,cardHeaderIcon('info'));
}
function captureChartInsights(host){
 const active=host.shadowRoot.activeElement;
 if(!host._insightPending)host._insightFocus=null;
 if(active?.closest?.('.insight-control'))host._insightFocus={key:active.closest('.insight-control').querySelector('[data-insight]')?.dataset.insight,inside:!!active.closest('.insight-popup'),entity:active.dataset.isolate,all:active.hasAttribute('data-show-all')};
 const popup=[...(host.shadowRoot.querySelectorAll?.('.insight-popup')??[])].find(panel=>typeof panel.showPopover==='function'?panel.matches(':popover-open'):panel.hasAttribute('data-fallback-open'));
 host._insightOpen=popup?.dataset.insightPanel??host._insightPending??null;
}
function disconnectChartInsights(host,keepLegendClicks=false){if(!keepLegendClicks){cancelChartLegendClicks(host);host._insightPending=null;}host._insightCleanup?.();host._insightCleanup=null;}
function restoreChartInsightFocus(host){
 if(!host._insightFocus||host._insightPending)return;
 const root=host.shadowRoot,{key,inside,entity,all}=host._insightFocus,popup=root.querySelector(`[data-insight-panel="${key}"]`),target=inside&&host._insightOpen===key?popup?.querySelector(entity?`[data-isolate="${entity}"]`:all?'[data-show-all]':'[data-insight-close]'):root.querySelector(`[data-insight="${key}"]`);
 if(target){target.focus?.({preventScroll:true});host._insightFocus=null;}
}
function bindChartInsights(host){
 disconnectChartInsights(host,true);
 const root=host.shadowRoot,cleanups=[];host._insightCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 for(const control of root.querySelectorAll?.('.insight-control')??[]){
  const trigger=control.querySelector('[data-insight]'),popup=control.querySelector('.insight-popup'),key=trigger.dataset.insight,native=typeof popup.showPopover==='function';
  const isOpen=()=>native?popup.matches(':popover-open'):popup.hasAttribute('data-fallback-open');
  let focusPending=false;
  const placement=bindCardPopupPosition(host,trigger,popup,()=>host._insightOpen===key,()=>{
   host._insightPending=null;
   if(native){if(!isOpen())popup.showPopover();}else popup.setAttribute('data-fallback-open','');
   if(focusPending){popup.querySelector('[data-insight-close]')?.focus({preventScroll:true});focusPending=false;}
   restoreChartInsightFocus(host);
  }),position=placement.position;
  cleanups.push(()=>placement.disconnect());
  const close=(focus=false)=>{if(host._insightOpen===key)host._insightOpen=null;host._insightPending=null;trigger.setAttribute('aria-expanded','false');if(native){if(isOpen())popup.hidePopover();}else popup.removeAttribute('data-fallback-open');if(focus)trigger.focus({preventScroll:true});};
  const open=(focus=true)=>{closeOtherCardPopups(host,'insight');host._insightOpen=key;host._insightPending=key;focusPending=focus;trigger.setAttribute('aria-expanded','true');position();};
  let pointerWasOpen;trigger.onpointerdown=()=>{pointerWasOpen=isOpen();};trigger.onpointercancel=()=>{pointerWasOpen=undefined;};
  trigger.onclick=()=>{const wasOpen=pointerWasOpen??isOpen();pointerWasOpen=undefined;wasOpen?close(true):open();};
  popup.querySelector('[data-insight-close]').onclick=()=>close(true);
  popup.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}};
  popup.addEventListener('toggle',e=>{if(root.querySelector(`[data-insight-panel="${key}"]`)!==popup)return;trigger.setAttribute('aria-expanded',String(e.newState==='open'));if(e.newState==='closed'&&host._insightOpen===key)host._insightOpen=null;});
  for(const button of popup.querySelectorAll('[data-isolate]'))button.onclick=()=>{close(true);isolateChartSeries(host,button.dataset.isolate);};
  const all=popup.querySelector('[data-show-all]');if(all)all.onclick=()=>{close(true);showAllChartSeries(host);};
  listen(window,'resize',()=>{if(isOpen()){if(trigger.getClientRects().length)position();else close();}});
  listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(popup))close();},true);
  listen(document,'pointerdown',e=>{if((!native||host._insightPending===key)&&host._insightOpen===key&&!e.composedPath().includes(control))close();});
  if(host._insightOpen===key)open(false);
 }
 restoreChartInsightFocus(host);
 if(host._insightFocus)listen(document,'pointerdown',e=>{if(!e.composedPath().includes(host)){host._insightFocus=null;host._insightOpen=null;host._insightPending=null;}},true);
 bindChartLegend(host);
}
function chartInsightStyles(){return `
.chart-context{display:flex;align-items:center;justify-content:space-between;gap:6px 12px;flex-wrap:wrap;flex:none;margin:0 0 8px;min-width:0}
.chart-range{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;min-width:0;flex:1}
.chart-range .period-panel{margin:0}
.zoom-status{font-size:11px;color:var(--primary-text-color,#20252b);background:var(--secondary-background-color,#eee);border-radius:4px;padding:2px 6px;white-space:nowrap}
.insight-control{display:inline-flex;flex:none}
.insight-trigger{font:inherit;font-size:11px;min-height:28px;padding:3px 7px;display:flex;align-items:center;gap:5px;border:0;border-radius:5px;background:transparent;color:var(--primary-text-color,#20252b);cursor:pointer}
.insight-trigger svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.insight-trigger:hover{background:var(--secondary-background-color,#eee)}
.header-actions .insight-trigger{width:32px;height:32px;padding:0;background:var(--secondary-background-color,#eee);border-radius:5px}
.header-actions .insight-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.header-actions .insight-trigger svg{width:18px;height:18px;stroke-width:2}
.insight-trigger:focus-visible,.insight-popup button:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.insight-popup{z-index:21}
.insight-popup:popover-open{display:block}
.insight-popup[data-fallback-open]{display:block}
.insight-popup button{display:block;box-sizing:border-box;width:auto;height:auto;padding:0;font:inherit;cursor:pointer;color:inherit;background:transparent;border:0;border-radius:5px;min-height:30px}
.insight-popup button:disabled{opacity:.4;cursor:default}
.insight-popup button:hover{background:var(--secondary-background-color,#eee)}
.insight-popup p{margin:8px 0 12px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-popup p strong{color:var(--primary-text-color,#20252b);font-weight:500}
.insight-popup .insight-choice{display:block;width:100%;padding:6px 8px;text-align:start;overflow-wrap:anywhere}
.insight-choice[aria-pressed="true"]{background:var(--secondary-background-color,#eee);font-weight:600}
.insight-sensors{display:grid}
.insight-sensor{min-width:0;padding:8px 0}
.insight-sensor+.insight-sensor{border-top:1px solid var(--divider-color,#ddd)}
.insight-sensor-heading{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 8px}
.insight-sensor-heading>strong{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:600}
.insight-source{font-size:10px;font-weight:400;color:var(--secondary-text-color,#666);color:color-mix(in srgb,var(--secondary-text-color,#666) 90%,var(--ha-card-background,var(--card-background-color,#fff)));flex:none}
.insight-unit{white-space:nowrap}
.insight-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 8px;margin:6px 0 0}
.insight-metrics.has-total{grid-template-columns:repeat(4,minmax(0,1fr))}
.insight-metrics>div{min-width:0}
.insight-metrics dt{font-size:10px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-metrics dd{margin:1px 0 0;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;color:var(--primary-text-color,#20252b)}
.insight-states{font-size:10px;color:var(--secondary-text-color,#666);margin-top:4px}
.insight-durations{margin:6px 0 0;display:grid;gap:4px}
.insight-durations>div{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:12px}
.insight-durations dt{min-width:0;overflow-wrap:anywhere;color:var(--secondary-text-color,#666)}
.insight-durations dd{margin:0;color:var(--primary-text-color,#20252b);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
[data-series]{touch-action:manipulation}
`;}

// src/history-utils.js
function validColor(color){return typeof color==='string'?/^#[\da-f]{6}$/i.test(color):Array.isArray(color)&&color.length===3&&color.every(v=>Number.isInteger(v)&&v>=0&&v<=255);}
const SERIES_COLORS=['#2196f3','#e78a14','#ab70d9','#26a69a','#e66b91','#718cc2','#a18d3a','#718d78'];
const APPEARANCE_KEYS=['line_width','line_style','line_interpolation','line_color','show_fill','fill_color','fill_opacity','fill_fade','gradient_mode','gradient_stops'];
// Resolve legacy inheritance once. Explicit modes on new rows have no implicit precedence.
const LINE_GEOMETRY_KEYS=['line_width','line_style','line_interpolation'];
function seriesAppearance(config,index,seen=new Set()) {
 if(seen.has(config.entities[index]))throw new Error('line_style_source_cycle');
 seen.add(config.entities[index]);
 const option=config.series_options?.find(s=>s.entity===config.entities[index])??{};
 const inherited=option.gradient_stops??(option.color?[]:config.gradient_stops??[]);
 const color_mode=option.color_mode??(inherited.length?'gradient':'fixed');
 const row={entity:config.entities[index],visible:option.visible??true,...(option.name?{name:option.name}:{}),
  line_width:option.line_width??config.line_width??3.5,line_style:option.line_style??config.line_style??(index%2?'dashed':'solid'),
  line_interpolation:option.line_interpolation??config.line_interpolation??'step',connect_gaps:option.connect_gaps??false,
  color_mode,color:option.color||config.line_color||SERIES_COLORS[index%SERIES_COLORS.length],
  gradient_mode:option.gradient_mode??config.gradient_mode??'smooth',gradient_stops:option.gradient_stops??inherited,
  show_fill:option.show_fill??config.show_fill??false,fill_opacity:option.fill_opacity??config.fill_opacity??0.18,
  fill_fade:option.fill_fade??config.fill_fade??true,
  fill_mode:option.fill_mode??((option.fill_color||config.fill_color)?'own':'line'),
  fill_color:option.fill_color||config.fill_color||option.color||config.line_color||SERIES_COLORS[index%SERIES_COLORS.length]};
 if(option.line_style_source){
  const source=config.entities.indexOf(option.line_style_source);
  if(source<0)throw new Error('line_style_source_missing');
  const style=seriesAppearance(config,source,seen);
  for(const key of LINE_GEOMETRY_KEYS)row[key]=style[key];
  row.line_style_source=option.line_style_source;
 }
 return structuredClone(row);
}
function editorConfig(config) {
 const data={hours_to_show:24,data_source:'auto',graph_mode:'lines',aggregation_period:'none',aggregation_method:'avg',show_hover_line:true,show_legend:true,show_title:true,show_navigation:true,show_grid:true,align_zero:true,sync_hover:true,hover_sync_group:'',...config,entities:(config.entities??[]).map((entity,index)=>{
  const row=seriesAppearance(config,index);
  for(const key of ['color','fill_color'])if(validColor(row[key]))row[key]=[...rgb(row[key])];
  row.gradient_stops=row.gradient_stops.map(s=>({...s,color:validColor(s.color)?[...rgb(s.color)]:s.color}));
  return row;
 })};
 delete data.series_options;for(const key of APPEARANCE_KEYS)delete data[key];return data;
}
function cardConfig(data) {
 const result={...data,entities:(data.entities??[]).map(row=>row.entity)};
 result.series_options=(data.entities??[]).map((row,index)=>{
  const resolved=seriesAppearance({entities:result.entities,series_options:data.entities},index);
  if(!row.name)delete resolved.name;return resolved;
 });
 for(const key of APPEARANCE_KEYS)delete result[key];return result;
}
// Keep effective geometry concrete in editor rows; the explicit link remains its owner.
function resolvedEditorRows(rows){
 const config={entities:rows.map(r=>r.entity),series_options:rows};
 return rows.map((row,index)=>{
  if(!row.entity)return structuredClone(row);
  const result=structuredClone(row),effective=seriesAppearance(config,index);
  for(const key of LINE_GEOMETRY_KEYS)result[key]=effective[key];
  return result;
 });
}
function updateSeriesRow(data,index,value){
 const rows=resolvedEditorRows(data.entities),old=rows[index];
 rows[index]={...old,...structuredClone(value)};
 // Detaching takes the effective source geometry, never stale hidden fields.
 if(old.line_style_source&&!rows[index].line_style_source){
  delete rows[index].line_style_source;
  for(const key of LINE_GEOMETRY_KEYS)rows[index][key]=old[key];
 }
 if(old.entity&&old.entity!==rows[index].entity)for(const row of rows){
  if(row.line_style_source===old.entity){
   if(rows[index].entity)row.line_style_source=rows[index].entity;
   else delete row.line_style_source;
  }
 }
 return {...data,entities:resolvedEditorRows(rows)};
}
function removeSeriesRow(data,index){
 const rows=resolvedEditorRows(data.entities),removed=rows[index].entity;
 const remaining=rows.filter((_,i)=>i!==index);
 for(const row of remaining)if(row.line_style_source===removed)delete row.line_style_source;
 return {...data,entities:resolvedEditorRows(remaining)};
}
function lineStyleSources(rows,row){
 return rows.filter(candidate=>{
  if(!candidate.entity||candidate.entity===row.entity)return false;
  const seen=new Set([row.entity]);let current=candidate;
  while(current){
   if(seen.has(current.entity))return false;
   seen.add(current.entity);
   current=rows.find(r=>r.entity===current.line_style_source);
  }
  return true;
 });
}
function validateConfig(config) {
 const entities=config?.entities;
 if(!Array.isArray(entities)||entities.length<1||entities.length>8||entities.some(id=>typeof id!=='string'||!/^sensor\.[a-z0-9_]+$/.test(id))||new Set(entities).size!==entities.length) throw new Error('entities');
 const hours=config.hours_to_show??24;
 if(typeof hours!=='number'||!Number.isFinite(hours)||hours<1||hours>8760) throw new Error('hours');
 if(config.title!==undefined&&typeof config.title!=='string') throw new Error('title');
 const result={line_interpolation:'step',line_width:3.5,show_fill:false,fill_fade:true,fill_opacity:0.18,show_hover_line:true,show_legend:true,show_title:true,show_navigation:true,show_grid:true,align_zero:true,sync_hover:true,hover_sync_group:'',...config,entities:[...entities],hours_to_show:hours};
 if(typeof result.sync_hover!=='boolean')throw new Error('sync_hover');
 if(result.hover_sync_group==null)result.hover_sync_group='';
 if(typeof result.hover_sync_group!=='string')throw new Error('hover_sync_group');
 result.line_interpolation=result.line_interpolation==null||result.line_interpolation===''?'step':result.line_interpolation;
 if(!['smooth','linear','step'].includes(result.line_interpolation))throw new Error('line_interpolation');
 for(const key of ['y_min','y_max']){
  if(result[key]==null||result[key]==='')delete result[key];
  else if(!Number.isFinite(result[key]))throw new Error(key);
 }
 if(result.y_min!==undefined&&result.y_max!==undefined&&result.y_min>=result.y_max)throw new Error('y_range');
 if(result.y_step==null||result.y_step==='')delete result.y_step;
 else if(!Number.isFinite(result.y_step)||result.y_step<=0)throw new Error('y_step');
 if(result.y_step!==undefined&&result.y_min!==undefined&&result.y_max!==undefined)yAxis([],result);
 if(!Number.isFinite(result.line_width)||result.line_width<1||result.line_width>8) throw new Error('line_width');
 if(result.line_style!=null&&!['solid','dashed','dotted'].includes(result.line_style)) throw new Error('line_style');
 for(const key of ['line_color','fill_color']) if(result[key]!=null&&result[key]!==''&&!validColor(result[key])) throw new Error(key);
 for(const key of ['show_fill','fill_fade','show_hover_line','show_legend','show_navigation','show_grid','align_zero']) if(typeof result[key]!=='boolean') throw new Error(key);
 if(!Number.isFinite(result.fill_opacity)||result.fill_opacity<0||result.fill_opacity>1) throw new Error('fill_opacity');
 const stops=result.gradient_stops??[];
 if(!Array.isArray(stops)||(stops.length!==0&&stops.length<2)||stops.length>32||stops.some(s=>!s||!Number.isFinite(s.value)||!validColor(s.color))||new Set(stops.map(s=>s.value)).size!==stops.length) throw new Error('gradient_stops');
 result.gradient_stops=stops.map(s=>({value:s.value,color:Array.isArray(s.color)?[...s.color]:s.color})).sort((a,b)=>a.value-b.value);
 result.gradient_mode=result.gradient_mode??'smooth';
 if(!['smooth','steps'].includes(result.gradient_mode)) throw new Error('gradient_mode');
 result.graph_mode=result.graph_mode??'lines';
 result.data_source=result.data_source??'auto';
 if(!['auto','history','statistics'].includes(result.data_source))throw new Error('data_source');
 result.aggregation_period=result.aggregation_period??'none';result.aggregation_method=result.aggregation_method??'avg';
 if(!['none','minute','quarter_hour','hour','day','week','month'].includes(result.aggregation_period))throw new Error('aggregation_period');
 if(!['min','max','avg','delta'].includes(result.aggregation_method))throw new Error('aggregation_method');
 if(!['lines','stacked'].includes(result.graph_mode))throw new Error('graph_mode');
 const options=result.series_options??[];
 if(!Array.isArray(options)||options.some(s=>!s||!entities.includes(s.entity)||(s.name!=null&&typeof s.name!=='string')||(s.color!=null&&s.color!==''&&!validColor(s.color)))||new Set(options.map(s=>s.entity)).size!==options.length)throw new Error('series_options');
 result.series_options=options.map(s=>{
  if(s.line_style_source!=null&&s.line_style_source!==''&&(typeof s.line_style_source!=='string'||!entities.includes(s.line_style_source)||s.line_style_source===s.entity))throw new Error('line_style_source');
  if(s.line_width!=null&&(!Number.isFinite(s.line_width)||s.line_width<1||s.line_width>8))throw new Error('series_line_width');
  for(const [key,allowed] of Object.entries({line_style:['solid','dashed','dotted'],line_interpolation:['smooth','linear','step'],color_mode:['fixed','gradient'],fill_mode:['line','own']}))if(s[key]!=null&&!allowed.includes(s[key]))throw new Error('series_'+key);
  for(const key of ['show_fill','fill_fade','visible','connect_gaps'])if(s[key]!=null&&typeof s[key]!=='boolean')throw new Error('series_'+key);
  if(s.fill_opacity!=null&&(!Number.isFinite(s.fill_opacity)||s.fill_opacity<0||s.fill_opacity>1))throw new Error('series_fill_opacity');
  if(s.fill_color!=null&&s.fill_color!==''&&!validColor(s.fill_color))throw new Error('series_fill_color');
  if(s.color_mode==='gradient'&&(!Array.isArray(s.gradient_stops)||s.gradient_stops.length<2))throw new Error('series_gradient_stops');
  if(s.gradient_mode!=null&&!['smooth','steps'].includes(s.gradient_mode))throw new Error('series_gradient_mode');
  const row={...s,color:Array.isArray(s.color)?[...s.color]:s.color,fill_color:Array.isArray(s.fill_color)?[...s.fill_color]:s.fill_color};
  if(s.gradient_stops!=null){const stops=s.gradient_stops;if(!Array.isArray(stops)||(stops.length!==0&&stops.length<2)||stops.length>32||stops.some(s=>!s||!Number.isFinite(s.value)||!validColor(s.color))||new Set(stops.map(s=>s.value)).size!==stops.length)throw new Error('series_gradient_stops');row.gradient_stops=stops.map(s=>({value:s.value,color:Array.isArray(s.color)?[...s.color]:s.color})).sort((a,b)=>a.value-b.value);}
  return row;
 });
 for(let i=0;i<entities.length;i++)seriesAppearance(result,i);
 return result;
}
function rgb(color){return Array.isArray(color)?color:[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));}
function gradientColor(stops,value,mode='smooth'){
 if(!stops.length||!Number.isFinite(value)) return null;
 let color=rgb(stops[0].color);
 for(let i=1;i<stops.length;i++){
  const a=stops[i-1],b=stops[i];
  if(value<b.value){const ratio=mode==='steps'?0:Math.max(0,(value-a.value)/(b.value-a.value));const end=rgb(b.color);color=rgb(a.color).map((v,j)=>Math.round(v+(end[j]-v)*ratio));return `rgb(${color.join(',')})`;}
  color=rgb(b.color);
 }
 return `rgb(${color.join(',')})`;
}
// Statistics are hourly/calendar summaries; counter Delta uses Recorder change.
function statisticsPeriod(config,end=Date.now()){
 const source=config.data_source??'auto',period=config.aggregation_period??'none';
 const supported=['none','hour','day','week','month'].includes(period)&&(config.aggregation_method!=='delta'||period!=='none');
 if(source==='statistics'&&!supported)throw new Error('statistics_config');
 if(source==='history'||!supported||(source==='auto'&&config.hours_to_show<=48&&Date.now()-end<=48*3600000))return null;
 return period==='none'?'hour':period;
}
// HA has used epoch seconds and milliseconds across Recorder versions.
function statisticTime(value){return typeof value==='number'?(value<1e12?value*1000:value):Date.parse(value);}
async function loadHistorySeries(hass,config,start,end){
 const period=statisticsPeriod(config,end),strict=config.data_source==='statistics',selected=new Map();
 if(period){
  try{
   const metadata=await hass.callWS({type:'recorder/get_statistics_metadata',statistic_ids:config.entities});
   const field=config.aggregation_method==='delta'?'change':config.aggregation_method==='min'?'min':config.aggregation_method==='max'?'max':'mean';
   const ids=config.entities.filter(id=>metadata.some(m=>m.statistic_id===id&&(field==='change'?m.has_sum===true:m.has_mean===true||(typeof m.mean_type==='number'&&m.mean_type!==0))&&((m.statistics_unit_of_measurement??m.unit_of_measurement??'')===(hass.states?.[id]?.attributes?.unit_of_measurement??''))));
   if(strict&&ids.length!==config.entities.length)throw new Error('statistics_unavailable');
   if(ids.length){
    // Recorder change is the period's growth of sum, including HA's counter
    // reset handling and the baseline before the first requested period.
    const response=await hass.callWS({type:'recorder/statistics_during_period',statistic_ids:ids,start_time:new Date(start).toISOString(),end_time:new Date(end).toISOString(),period,types:[field]});
    for(const id of ids){
     if(!Array.isArray(response[id])){if(strict)throw new Error('statistics_unavailable');continue;}
     const points=[];
     // End every bin explicitly: missing bins and unfinished tails stay gaps.
     for(const row of [...response[id]].sort((a,b)=>statisticTime(a.start)-statisticTime(b.start))){
      const a=Math.max(start,statisticTime(row.start)),b=Math.min(end,statisticTime(row.end));
      if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)continue;
      points.push({t:a,v:typeof row[field]==='number'&&Number.isFinite(row[field])?row[field]:null},{t:b,v:null});
     }
     if(points.some(p=>p.v!==null)||strict)selected.set(id,{id,source:'statistics',points:[...new Map(points.map(p=>[p.t,p])).values()].sort((a,b)=>a.t-b.t)});
    }
   }
  }catch(error){if(strict)throw error;selected.clear();}
 }
 const missing=config.entities.filter(id=>!selected.has(id));
 if(missing.length){
  const response=await hass.callApi('GET',historyUrl({...config,entities:missing},end));
  for(const s of decodeHistory(response,missing,start,end))selected.set(s.id,s);
 }
 return config.entities.map(id=>selected.get(id));
}
function numericState(state) {
 if(typeof state!=='string'||state.trim()==='') return null;
 const number=Number(state); return Number.isFinite(number)?number:null;
}
function decodeHistory(response,entities,start,end) {
 if(!Array.isArray(response)||response.some(rows=>!Array.isArray(rows))) throw new Error('response');
 const byId=new Map();
 for(const rows of response) {
  if(!rows.length) continue;
  const id=rows[0]?.entity_id;
  if(!entities.includes(id)) continue;
  const points=rows.map(row=>({t:Date.parse(row.last_updated??row.last_changed),v:numericState(row.state)})).filter(p=>Number.isFinite(p.t)&&p.t<=end).sort((a,b)=>a.t-b.t);
  const previous=points.filter(p=>p.t<start).at(-1);
  const clipped=points.filter(p=>p.t>=start);
  if(previous) clipped.unshift({...previous,t:start});
  byId.set(id,[...new Map(clipped.map(p=>[p.t,p])).values()]);
 }
 return entities.map(id=>({id,points:byId.get(id)??[]}));
}
function valueAt(points,time) {
 let left=0,right=points.length-1,index=-1;
 while(left<=right) {const mid=(left+right)>>1;if(points[mid].t<=time){index=mid;left=mid+1;}else right=mid-1;}
 return index<0?null:points[index].v;
}
function stepPath(points,end,x,y) {
 let path='',active=false;
 for(const point of points) {
  if(active) path+=` H ${x(point.t)}`;
  if(point.v===null) {active=false;continue;}
  path+=active?` V ${y(point.v)}`:`${path?' ':''}M ${x(point.t)} ${y(point.v)}`;
  active=true;
 }
 if(active) path+=` H ${x(end)}`;
 return path;
}
function seriesMetadata(hass,entities,options=[]) {
 const items=entities.map(id=>{
  const state=hass.states?.[id]; if(!state) throw new Error('missing');
  const option=options.find(s=>s.entity===id);
  return {id,name:option?.name||state.attributes?.friendly_name||id,unit:state.attributes?.unit_of_measurement??''};
 });
 return {items,unit:items[0]?.unit??''};
}
// Group by exact unit, never add or scale incompatible quantities together.
function graphAxes(series,meta,config,start,end,visible=series.map(()=>true)){
 const units=[...new Set(meta.items.filter((_,i)=>visible[i]).map(item=>item.unit))];
 if(!units.length)units.push(meta.items[0]?.unit??'');
 const seriesAxes=meta.items.map(item=>units.indexOf(item.unit));
 const plotSeries=config.graph_mode==='stacked'?series.slice():series;
 const axes=units.map((unit,index)=>{
  const indices=seriesAxes.flatMap((axis,i)=>axis===index&&visible[i]?[i]:[]);
  let group=indices.map(i=>series[i]);
  if(config.graph_mode==='stacked'){
   group=stackSeries(group,start,end);
   indices.forEach((i,j)=>{plotSeries[i]=group[j];});
  }
  return {unit,...yAxis(group,unit===meta.items[0]?.unit?config:{})};
 });
 return {axes:alignGridAxes(alignZeroAxes(axes,config,meta.items[0]?.unit),config),seriesAxes,plotSeries};
}
// Keep the first axis (including manual bounds/step) as the grid reference.
// Other units use their own round step, expanding their ranges to fit the same
// tick heights. A whole-step offset keeps each scale anchored at round values.
function alignGridAxes(axes,config={}){
 if(axes.length<2)return axes;
 const reference=axes[0],span=reference.max-reference.min;
 if(!reference.ticks.length)return axes.map((axis,i)=>i?{...axis,ticks:[]}:axis);
 const bottom=reference.min/reference.step,top=reference.max/reference.step;
 const clean=value=>Number(value.toPrecision(15));
 const nice=value=>{
  const power=10**Math.floor(Math.log10(value));
  return clean(([1,2,5,10].find(n=>n*power>=value*(1-1e-14))??10)*power);
 };
 const negative=axes.filter(a=>a.min<0);
 const alignZero=config.align_zero!==false&&negative.length>1&&
  !(reference.min<0&&(reference.max<0||(reference.max===0&&negative.some(a=>a.max>0))));
 let zeroOffset=alignZero&&reference.min<0?0:null;
 return axes.map((axis,i)=>{
  if(!i)return axis;
  let step=nice((axis.max-axis.min)*(reference.step/span));
  const locked=alignZero&&axis.min<0?zeroOffset:null;
  const finish=(step,offset)=>{
   const min=clean((bottom+offset)*step),max=clean((top+offset)*step);
   const ticks=reference.ticks.map(t=>clean((t/reference.step+offset)*step));
   if(!Number.isFinite(min)||!Number.isFinite(max)||!(max>min)||ticks.some((t,j)=>!Number.isFinite(t)||(j&&t<=ticks[j-1])))throw new Error('y_step_count');
   if(alignZero&&axis.min<0&&zeroOffset===null)zeroOffset=offset;
   return {...axis,min,max,step,ticks};
  };
  for(let attempt=0;attempt<32;attempt++){
   const lower=axis.max/step-top,upper=axis.min/step-bottom;
   const epsilon=Number.EPSILON*Math.max(1,Math.abs(lower),Math.abs(upper))*8;
   const first=Math.ceil(lower-epsilon),last=Math.floor(upper+epsilon);
   const offset=locked??Math.max(first,Math.min(last,0));
   if(locked!==null?offset>=lower-epsilon&&offset<=upper+epsilon:first<=last){
    return finish(step,offset);
   }
   step=nice(step*(1+1e-10));
  }
  // A manual step can leave only an edge tick (e.g. 25–30, step 10).
  // A secondary range crossing zero cannot fit an integer offset there.
  // Allow shifted tick values instead of rejecting a valid configuration.
  step=nice((axis.max-axis.min)*(reference.step/span));
  return finish(step,Math.max(axis.max/step-top,Math.min(axis.min/step-bottom,0)));
 });
}
// Expand only negative axes; never rescale readings or clip the original ranges.
function alignZeroAxes(axes,config={},primaryUnit=axes[0]?.unit){
 if(config.align_zero===false)return axes;
 const negative=axes.filter(a=>a.min<0);
 if(negative.length<2)return axes;
 const primary=negative.find(a=>a.unit===primaryUnit);
 const fixed=primary&&[config.y_min,config.y_max].some(Number.isFinite);
 const fraction=a=>-a.min/(a.max-a.min);
 // Explicit first-unit bounds win, including bounds that exclude zero.
 if(fixed&&(primary.max<0||(primary.max===0&&negative.some(a=>a.max>0))))return axes;
 const part=fixed?fraction(primary):negative.reduce((sum,a)=>sum+Math.min(1,fraction(a)),0)/negative.length;
 return axes.map(a=>{
  if(a.min>=0||(fixed&&a===primary))return a;
  const span=Math.max(-a.min/part,part===1?0:Math.max(0,a.max)/(1-part));
  const min=-span*part,max=part===1?0:span*(1-part);
  const options={y_min:min,y_max:max,...(a.unit===primaryUnit&&config.y_step!=null?{y_step:config.y_step}:{})};
  return {unit:a.unit,...yAxis([],options)};
 });
}
function yRange(series,config={}) {
 let min=Infinity,max=-Infinity;
 for(const s of series) for(const p of s.points) for(const value of [p.v,p.base])if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value);}
 if(min===Infinity){min=0;max=1;}
 else {const padding=min===max?Math.max(1,Math.abs(min)*0.05):(max-min)*0.08;min-=padding;max+=padding;}
 if(Number.isFinite(config.y_min))min=config.y_min;
 if(Number.isFinite(config.y_max))max=config.y_max;
 if(min>=max){
  if(Number.isFinite(config.y_min)&&Number.isFinite(config.y_max))throw new Error('y_range');
  if(Number.isFinite(config.y_min))max=min+Math.max(1,Math.abs(min)*0.05);
  else min=max-Math.max(1,Math.abs(max)*0.05);
 }
 return [min,max];
}
// Preserve yRange's padding contract; only the displayed axis uses nice steps.
function yAxis(series,config={}){
 if(config.y_step!=null&&config.y_step!==''&&(!Number.isFinite(config.y_step)||config.y_step<=0))throw new Error('y_step');
 let [min,max]=yRange(series,config);
 const target=(max-min)/4,power=10**Math.floor(Math.log10(target));
 const step=(config.y_step===''?undefined:config.y_step)??([1,2,5,10].find(n=>n*power>=target)??10)*power;
 const clean=value=>Number(value.toPrecision(15));
 // Snap only floating-point noise at integral step indices (e.g. 0.3 / 0.1).
 const index=value=>{const n=value/step,nearest=Math.round(n);return Math.abs(n-nearest)<=Number.EPSILON*Math.max(1,Math.abs(n))*4?nearest:n;};
 if(!Number.isFinite(config.y_min))min=clean(Math.floor(index(min))*step);
 if(!Number.isFinite(config.y_max))max=clean(Math.ceil(index(max))*step);
 const first=Math.ceil(index(min)),last=Math.floor(index(max));
 const count=Math.max(0,last-first+1);
 if(!Number.isFinite(count)||count>200||!Number.isFinite(min)||!Number.isFinite(max)||!Number.isFinite(max-min)||!(max>min))throw new Error('y_step_count');
 const ticks=Array.from({length:count},(_,i)=>clean((first+i)*step));
 if(ticks.some((v,i)=>!Number.isFinite(v)||(i&&v<=ticks[i-1])))throw new Error('y_step_count');
 return {min,max,step,ticks};
}
function periodBounds(t,period,zone='UTC'){return graphPeriodBounds(t,period,zone);}
function aggregateSeries(series,start,end,period='none',method='avg',zone='UTC',{preserveGaps=true}={}){
 if(period==='none')return series;
 const bounds=[];for(let a=start;a<end;){const b=Math.min(end,periodBounds(a,period,zone)[1]);bounds.push([a,b]);a=b;}
 return series.map(s=>{if(s.source==='statistics')return s;const points=[];let index=0;
  for(const [a,b] of bounds){let cursor=a,total=0,duration=0,min=Infinity,max=-Infinity;
   while(index<s.points.length&&s.points[index].t<=a)index++;
   let value=index?s.points[index-1].v:null;
   if(method==='delta'){
    const first=value;let valid=Number.isFinite(first);
    // Recorder holds each reading until the next one. Include an exact end
    // boundary once as this bin's end and the following bin's start.
    while(index<s.points.length&&s.points[index].t<=b){value=s.points[index++].v;valid&&=Number.isFinite(value);}
    points.push({t:a,v:valid?value-first:null});continue;
   }
   const fragments=[{t:a,valid:value!==null}];
   while(cursor<b){const until=Math.min(b,s.points[index]?.t??b);if(value!==null){total+=value*(until-cursor);duration+=until-cursor;min=Math.min(min,value);max=Math.max(max,value);}cursor=until;if(cursor<b){value=s.points[index++].v;if((value!==null)!==fragments.at(-1).valid)fragments.push({t:cursor,valid:value!==null});}}
   const aggregate=duration?(method==='min'?min:method==='max'?max:total/duration):null;
   if(preserveGaps)for(const f of fragments)points.push({t:f.t,v:f.valid?aggregate:null});
   else points.push({t:a,v:aggregate});
  }
  return {id:s.id,points};
 });
}
// Drawing only: bridge internal gaps, retaining unknown starts and tails.
// Run before viewport clipping so a zoom entirely inside a gap keeps both anchors.
function connectGapPoints(points){
 const first=points.findIndex(p=>p.v!==null);if(first<0)return points;
 let last=points.length-1;while(last>first&&points[last].v===null)last--;
 return points.filter((p,i)=>p.v!==null||i<first||i>last);
}
function displayPoints(points,start,end,bins=1500){
 let first=0,last=points.length;while(first<last){const mid=(first+last)>>1;if(points[mid].t<start)first=mid+1;else last=mid;}
 const begin=Math.max(0,first-1);first=begin;last=points.length;while(first<last){const mid=(first+last)>>1;if(points[mid].t<=end)first=mid+1;else last=mid;}
 const clipped=points.slice(begin,Math.min(points.length,first+1));if(clipped.length<=bins*4)return clipped;
 const keep=new Set([0,clipped.length-1]);let bin=-1,group=[];
 const flush=()=>{if(!group.length)return;keep.add(group[0]);keep.add(group.at(-1));let min=group[0],max=min;for(const i of group){if(clipped[i].v<clipped[min].v)min=i;if(clipped[i].v>clipped[max].v)max=i;}keep.add(min);keep.add(max);group=[];};
 clipped.forEach((p,i)=>{const next=Math.floor((p.t-start)/(end-start)*bins);if(next!==bin){flush();bin=next;}if(p.v===null){flush();for(const j of [i-1,i,i+1])if(j>=0&&j<clipped.length)keep.add(j);}else group.push(i);});flush();
 return [...keep].sort((a,b)=>a-b).map(i=>clipped[i]);
}
function stackSeries(series,start,end){
 const times=[...new Set([start,...series.flatMap(s=>s.points.map(p=>p.t).filter(t=>t>=start&&t<end))])].sort((a,b)=>a-b);
 const result=series.map(s=>({id:s.id,points:[]}));
 for(const t of times){let positive=0,negative=0,missing=false;
  series.forEach((s,i)=>{const value=valueAt(s.points,t);missing ||= value===null;const base=value<0?negative:positive;
   result[i].points.push({t,v:missing?null:base+value,base:missing?null:base});
   if(value!==null){if(value<0)negative+=value;else positive+=value;}
  });
 }
 return result;
}
function historyUrl(config,end) {
 const start=new Date(end-config.hours_to_show*3600000).toISOString();
 const query=new URLSearchParams({filter_entity_id:config.entities.join(','),end_time:new Date(end).toISOString(),minimal_response:'',no_attributes:'',significant_changes_only:'0'});
 return `history/period/${encodeURIComponent(start)}?${query}`;
}

// src/localization.js
const translations={
 title:['History','Historie'],loading:['Loading history…','Historie laden…'],empty:['No numeric history in this range.','Geen numerieke historie in deze periode.'],error:['History unavailable. Check recorder and connection.','Historie niet beschikbaar. Controleer recorder en verbinding.'],unit:['All sensors must have the same unit.','Alle sensoren moeten dezelfde eenheid hebben.'],missing:['Configured sensor not found.','Ingestelde sensor niet gevonden.'],unavailable:['Unavailable','Niet beschikbaar'],retry:['Retry','Opnieuw proberen'],chart:['History graph. Arrow keys, Home and End select a time; Escape closes details.','Historiegrafiek. Pijltjes, Home en End selecteren een tijd; Escape sluit details.'],entities:['Sensors','Sensoren'],hours_to_show:['Hours to show','Aantal uren'],hoursHelper:['Historical range: 1–8760 hours. Each different unit gets its own Y-axis.','Historische periode: 1–8760 uur. Iedere verschillende eenheid krijgt een eigen Y-as.'],titleField:['Title','Titel'],partial:['Some sensors have no numeric history:','Sommige sensoren hebben geen numerieke historie:'],config:['Invalid configuration: use 1–8 distinct sensors and 1–8760 hours.','Ongeldige configuratie: gebruik 1–8 unieke sensoren en 1–8760 uur.']};
Object.assign(translations,{
 show_title:['Show title','Titel tonen'],
 show_navigation:['Show timeframe selection','Tijdvakselectie tonen'],
 show_grid:['Show grid','Grid tonen'],
 show_gridHelper:['Show horizontal Y-axis grid lines and the left and right plot boundaries. Axis labels and data remain visible.','Toon horizontale Y-aslijnen en de linker- en rechterrand van de grafiek. Aslabels en gegevens blijven zichtbaar.'],
 show_navigationHelper:['Show the timeframe menu, previous/next, Now and the selected date range. The configured hours remain the default; aggregation is unchanged.','Toon het tijdvakmenu, vorige/volgende, Nu en het gekozen datumbereik. De ingestelde uren blijven de standaard; aggregatie verandert niet.'],
 data_source:['Data source','Gegevensbron'],auto:['Automatic','Automatisch'],history:['Raw history','Ruwe historie'],statistics:['Statistics','Statistics'],
 data_sourceHelper:['Automatic: statistics for ranges longer than 48 hours or ending more than 48 hours ago; raw history otherwise. Unsupported sensors fall back to history. Statistics use hour/day/week/month summaries (None uses hour). Delta uses counter change statistics, including counter resets. Minute and quarter-hour require history.','Automatisch: statistics bij periodes langer dan 48 uur of die meer dan 48 uur geleden eindigen; anders ruwe historie. Sensoren zonder ondersteuning vallen terug op historie. Statistics gebruikt uur/dag/week/maand (Geen gebruikt uur). Delta gebruikt tellerstatistieken, inclusief tellerresets. Minuut en kwartier vereisen historie.'],
 statistics_config:['Statistics requires hour, day, week or month. None uses hour for minimum, maximum or average; Delta requires an explicit period. Choose History for minute or quarter-hour.','Statistics vereist uur, dag, week of maand. Geen gebruikt uur bij minimum, maximum of gemiddelde; Delta vereist een expliciet tijdvak. Kies Historie voor minuut of kwartier.'],
 statistics_unavailable:['Statistics unavailable for a selected sensor or its unit. Delta requires counter statistics; minimum, maximum and average require measurement statistics. Choose Automatic or History.','Statistics ontbreekt voor een gekozen sensor of zijn eenheid. Delta vereist tellerstatistieken; minimum, maximum en gemiddelde vereisen meetstatistieken. Kies Automatisch of Historie.'],
 zoom:['Zoom','Zoom'],zoom_in:['Zoom in','Inzoomen'],zoom_out:['Zoom out','Uitzoomen'],zoom_reset:['Reset zoom','Zoom herstellen'],
 aggregation_period:['Aggregation period','Aggregatieperiode'],aggregation_method:['Aggregation method','Aggregatiemethode'],none:['None (raw history)','Geen (ruwe historie)'],minute:['Minute','Minuut'],quarter_hour:['Quarter hour','Kwartier'],hour:['Hour','Uur'],day:['Day','Dag'],week:['Week (Monday)','Week (maandag)'],month:['Month','Maand'],min:['Minimum','Minimum'],max:['Maximum','Maximum'],avg:['Time-weighted average','Tijdgewogen gemiddelde'],
 aggregation_periodHelper:['Applied separately to every sensor in the Home Assistant timezone. Zoom does not change it.','Per sensor toegepast in de Home Assistant-tijdzone. Zoom verandert dit niet.'],
 aggregation_methodHelper:['AVG weights numeric values by their recorded held duration; unavailable time is excluded.','AVG weegt numerieke waarden met hun geregistreerde duur; niet-beschikbare tijd wordt uitgesloten.'],
 graph_mode:['Graph mode','Grafiekmodus'],lines:['Separate lines','Losse lijnen'],stacked:['Stacked sums','Gestapelde sommen'],
 series_options:['Sensor names and colors','Sensornamen en kleuren'],entity:['Sensor','Sensor'],name:['Custom name','Eigen naam'],
 entitiesHelper:['Set name, fixed color or 2–32 color stops in each sensor entry. Sensor settings override shared colors; its own gradient overrides its fixed color.','Stel naam, vaste kleur of 2–32 kleurovergangen in per sensorregel. Sensorinstellingen gaan voor algemene kleuren; een eigen gradiënt gaat voor de eigen vaste kleur.'],
 sync_hover:['Synchronize hover','Hover synchroniseren'],hover_sync_group:['Hover synchronization group','Hover-synchronisatiegroep'],
 sync_hoverHelper:['Shares the selected time with other Eleven graphs on this page.','Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.'],
 hover_sync_groupHelper:['Cards with the same group follow each other. Empty uses the default group.','Kaarten met dezelfde groep volgen elkaar. Leeg gebruikt de standaardgroep.'],
 line_interpolation:['Line interpolation','Lijnverloop'],interpolation_smooth:['Smooth','Vloeiend'],interpolation_linear:['Linear','Recht'],interpolation_step:['Stepped','Trapvormig'],
 line_interpolationHelper:['Display only: chooses how recorded points are connected.','Alleen weergave: bepaalt hoe geregistreerde punten worden verbonden.'],
 connect_gaps:['Bridge missing data','Ontbrekende data overbruggen'],
 connect_gapsHelper:['Connect known points on either side of a gap using this line’s interpolation. Unknown starts and tails stay empty. Tooltips and calculations retain missing data.','Verbind bekende punten aan weerszijden van een gat volgens het lijnverloop. Ontbrekende data aan het begin en einde blijft leeg. Tooltips en berekeningen behouden ontbrekende waarden.'],
 y_step_error:['Invalid Y-axis step: enter a finite positive number or leave it empty for automatic steps.','Ongeldige stapgrootte Y-as: voer een eindig positief getal in of laat leeg voor automatische stappen.'],
 y_step_count:['Y-axis step cannot be drawn (maximum 200 ticks or numeric precision exceeded). Increase the step or narrow the Y-axis bounds.','Stapgrootte Y-as kan niet worden getekend (maximaal 200 maatstreepjes of numerieke precisie overschreden). Vergroot de stap of verklein het Y-asbereik.'],
 align_zero:['Align zero points','Nulpunten uitlijnen'],
 align_zeroHelper:['Align zero on negative Y-axes. Explicit first-axis bounds take priority.','Zet de nulpunten van negatieve Y-assen op dezelfde hoogte. Handmatige grenzen van de eerste as gaan voor.'],
 y_axis:['Y-axis','Y-as'],y_step:['Y-axis step','Stapgrootte Y-as'],
 y_stepHelper:['Optional positive tick interval in the sensor unit. Empty uses round 1/2/5 steps automatically. Maximum 200 ticks; increase the step or narrow the bounds if exceeded.','Optionele positieve stapgrootte in de sensoreenheid. Leeg kiest automatisch ronde 1/2/5-stappen. Maximaal 200 maatstreepjes; vergroot de stap of verklein het bereik bij overschrijding.'],
 y_min:['Y-axis minimum','Minimum Y-as'],y_max:['Y-axis maximum','Maximum Y-as'],
 y_minHelper:['Optional, in the first sensor’s unit. Empty scales automatically. Other units have independent automatic axes.','Optioneel, in de eenheid van de eerste sensor. Leeg schaalt automatisch. Andere eenheden hebben eigen automatische assen.'],
 y_maxHelper:['Optional, for the first sensor’s unit. Empty scales automatically. Must exceed the minimum.','Optioneel, voor de eenheid van de eerste sensor. Leeg schaalt automatisch. Moet hoger zijn dan het minimum.'],
 appearance:['Line and fill','Lijn en vulling'],line_style:['Line style','Lijnstijl'],line_width:['Line width','Lijndikte'],line_color:['Fixed line color','Vaste lijnkleur'],show_fill:['Fill below line','Vulling onder lijn'],fill_opacity:['Fill opacity','Dekking vulling'],fill_fade:['Fade fill','Vulling vervagen'],show_hover_line:['Show hover guide','Aanwijslijn tonen'],gradient_mode:['Color transitions','Kleurovergang'],gradient_stops:['Color stops','Kleurovergangen'],stop_value:['Sensor value','Sensorwaarde'],stop_color:['Color','Kleur'],solid:['Solid','Doorgetrokken'],dashed:['Dashed','Gestreept'],dotted:['Dotted','Gestippeld'],smooth:['Smooth gradient','Vloeiende gradiënt'],steps:['Hard transitions','Harde overgangen'],
 fill_color:['Fixed fill color','Vaste vulkleur'],fill_colorHelper:['Optional. Empty follows the line color or gradient.','Optioneel. Leeg volgt de lijnkleur of gradiënt.'],
 hours_to_showHelper:translations.hoursHelper,
 line_styleHelper:['Empty preserves the distinct default styles per sensor.','Leeg behoudt de verschillende standaard lijnstijlen per sensor.'],
 line_colorHelper:['Optional. Empty preserves sensor colors. Color stops take priority.','Optioneel. Leeg behoudt sensorkleuren. Kleurovergangen hebben voorrang.'],
 gradient_stopsHelper:['Add 2–32 distinct sensor values and colors. Values use the sensor unit, not percentages. Empty disables the gradient.','Voeg 2–32 unieke sensorwaarden met kleuren toe. Waarden gebruiken de sensoreenheid, geen percentages. Leeg schakelt de gradiënt uit.'],
 fill_fadeHelper:['Fades the fill towards the bottom of the graph.','Laat de vulling naar de onderkant van de grafiek vervagen.']
});
Object.assign(translations,{
 graph_settings:['Graph','Grafiek'],show_legend:['Show legend','Legenda tonen'],data_processing:['Data processing','Dataverwerking'],series_line:['Line','Lijn'],series_fill:['Fill','Vulling'],
 visible:['Show by default','Standaard tonen'],visibleHelper:['Initial visibility. Click the sensor in the legend to show or hide it temporarily.','Beginweergave. Klik op de sensor in de legenda om deze tijdelijk te tonen of verbergen.'],show_sensor:['Show','Toon'],hide_sensor:['Hide','Verberg'],no_visible:['All sensors are hidden. Enable a sensor in the legend.','Alle sensoren zijn verborgen. Zet een sensor aan via de legenda.'],
 color_mode:['Line color','Lijnkleur'],color_fixed:['Fixed color','Vaste kleur'],color_gradient:['Color stops','Kleurovergangen'],color:['Line color','Lijnkleur'],
 fill_mode:['Fill color','Vulkleur'],fill_line:['Follow line','Volg lijn'],fill_own:['Own color','Eigen kleur'],
 add_sensor:['Add sensor','Sensor toevoegen'],new_sensor:['New sensor','Nieuwe sensor'],add_sensorHelper:['Add a sensor to configure its name, line and fill.','Voeg een sensor toe om naam, lijn en vulling in te stellen.'],
 sensor_up:['Move up','Omhoog'],sensor_down:['Move down','Omlaag'],sensor_remove:['Remove','Verwijderen'],
 color_modeHelper:['Choose a fixed color or color stops based on measured values.','Kies een vaste kleur of kleurovergangen op basis van meetwaarden.'],
 fill_modeHelper:['Follow line uses this sensor’s line color, including its gradient. Own color changes only the fill.','Volg lijn gebruikt de lijnkleur van deze sensor, inclusief de gradiënt. Eigen kleur verandert alleen de vulling.'],
 gradient_stopsHelper:['Set 2–32 distinct values in the sensor unit, not percentages. Adjust the initial values to your sensor range.','Stel 2–32 unieke waarden in de sensoreenheid in, geen percentages. Pas de beginwaarden aan op het bereik van je sensor.'],
 line_styleHelper:['Only changes this sensor’s line.','Verandert alleen de lijn van deze sensor.'],fill_colorHelper:['Only used when Own color is selected.','Alleen gebruikt wanneer Eigen kleur is gekozen.']
});
Object.assign(translations,{
 line_style_source:['Line appearance','Lijnopmaak'],line_style_own:['Own appearance','Eigen opmaak'],line_style_follow:['Follow','Volg'],
 line_style_sourceHelper:['Follow another sensor’s width, line style and interpolation. Color and fill remain independent. Own appearance detaches with the current settings.','Volg dikte, lijnstijl en lijnverloop van een andere sensor. Kleur en vulling blijven eigen. Eigen opmaak neemt de huidige instellingen mee.'],
 line_style_source_error:['Invalid line appearance source: choose another sensor on this card, without circular links.','Ongeldige bron voor lijnopmaak: kies een andere sensor op deze kaart, zonder kringverwijzingen.']
});
translations.config=['Invalid configuration: check sensors, hours, Y-axis bounds, appearance and color stops.','Ongeldige configuratie: controleer sensoren, uren, Y-asgrenzen, lijnopties en kleurovergangen.'];
function language(hass){return String(hass?.locale?.language??hass?.language??'en').toLowerCase().startsWith('nl')?'nl':'en';}
function text(key,lang){return translations[key]?.[lang==='nl'?1:0]??key;}
function number(value,lang,axis=false){
 const small=value!==0&&Math.abs(value)<0.01;
 return new Intl.NumberFormat(lang==='nl'?'nl-NL':'en-GB',{
  ...(axis?{maximumSignificantDigits:15}:small?{maximumSignificantDigits:4}:{maximumFractionDigits:2}),
  ...(value!==0&&(Math.abs(value)<0.0001||axis&&Math.abs(value)>=1e6)?{notation:'scientific'}:{})
 }).format(Object.is(value,-0)?0:value);
}
function time(value,lang,timeZone,full=false){return new Intl.DateTimeFormat(lang==='nl'?'nl-NL':'en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',...(full?{day:'numeric',month:'short'}:{})}).format(new Date(value));}
function escapeHtml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function frontendHass(){return globalThis.document?.querySelector('home-assistant')?.hass;}

// src/eleven.js
// One playful flyby, then gone until tomorrow.
const ELF_FLIGHT_MS=4200;
function elevenDay(date=new Date(),zone){
 try{return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}catch{return date.toDateString();}
}
function isElevenMinute(date=new Date(),zone){
 let parts;
 try{parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);}catch{parts=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);}
 return parts.find(p=>p.type==='hour')?.value==='11'&&parts.find(p=>p.type==='minute')?.value==='11';
}
function elevenMarkup(elapsed=0){return `<span class="eleven-elf" aria-hidden="true" style="animation-delay:-${elapsed}ms"><svg viewBox="0 0 64 56" width="48" height="42" fill="none"><g class="elf-wings" stroke="#7dd3fc" stroke-width=".8"><path d="M30 30C9 27 8 5 18 8c8 2 13 15 12 22Z" fill="#e0f2fe" fill-opacity=".85"/><path d="M35 31C35 17 46 4 51 11c5 8-4 19-16 20Z" fill="#f0e7ff" fill-opacity=".8"/><path d="M29 30C9 26 11 42 20 40l9-10ZM36 31c18-8 19 8 10 10Z" fill="#bae6fd" fill-opacity=".65"/><g class="elf-wing-veins" stroke="#ffffff" stroke-opacity=".9" stroke-width=".7"><path d="M29 29 17 12m18 17 13-15M28 32l-11 5m20-4 9 4"/></g></g><g stroke-linecap="round" stroke-linejoin="round"><path d="m28 36-8 9 7 1m8-10 7 8 7-3" stroke="#1e40af" stroke-width="4"/><path d="m20 44-4 3 10 1m17-5 5-4 3 2" stroke="#fbbf24" stroke-width="2"/><path d="M24 36q1-13 8-13t10 13l-7 3-5-3-4 3Z" fill="#2563eb" stroke="#1e40af" stroke-width=".7"/><path d="m27 33 11 1" stroke="#fbbf24" stroke-width="2"/><path d="m25 28-6 5-4-3m24-1 8-6" stroke="#ffd7b5" stroke-width="3"/><path d="m24 20-8-5 4 10m21-5 7-4-4 10" fill="#ffc99f" stroke="#dd996f" stroke-width=".6"/><ellipse cx="32" cy="22" rx="10" ry="9" fill="#ffdfbf"/><path d="M22 20q-1-13 11-13 9 0 9 13l-4-5-3 3-3-3-4 4-2-2Z" fill="#b9652a"/><path d="M21 16Q24 1 40 5l5 5-7-1 3 8Q31 13 21 18Z" fill="#2563eb" stroke="#1e40af" stroke-width=".7"/><path d="M23 17q9-4 17 0" stroke="#fbbf24" stroke-width="2.5"/><circle cx="45" cy="10" r="2.3" fill="#fbbf24"/><circle cx="28" cy="22" r="1.1" fill="#302337"/><path d="m35 22 3-1m-9 6q4 3 7-1" stroke="#793c31" stroke-width="1.3"/><ellipse cx="25" cy="25" rx="2" ry="1" fill="#fb7185" fill-opacity=".6"/><ellipse cx="39" cy="24" rx="1.7" ry="1" fill="#fb7185" fill-opacity=".6"/><path d="m46 24 6-11" stroke="#c48b36" stroke-width="1.4"/></g><g class="elf-sparkles" fill="#fbbf24"><path d="m53 8 1.2 3.8L58 13l-3.8 1.2L53 18l-1.2-3.8L48 13l3.8-1.2Z"/><path d="m9 28 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/><circle cx="5" cy="41" r="1.2"/><circle cx="14" cy="23" r=".9"/></g></svg></span>`;}
function elevenStyles(){return `.eleven-elf{position:absolute;left:0;top:6px;width:48px;height:42px;opacity:0;pointer-events:none;z-index:2;animation:eleven-flyby 4200ms linear both}.eleven-elf svg{display:block}.elf-wings{transform-origin:32px 28px;animation:eleven-flutter .16s ease-in-out infinite alternate}@keyframes eleven-flyby{0%{left:0;transform:translateX(-110%) translateY(8px) rotate(12deg);opacity:0}10%{opacity:.9}30%{transform:translateX(-30%) translateY(-5px) rotate(-8deg)}60%{transform:translateX(-60%) translateY(9px) rotate(8deg);opacity:.9}90%{opacity:.9}100%{left:100%;transform:translateX(10%) translateY(-9px) rotate(-12deg);opacity:0}}@keyframes eleven-flutter{from{transform:scaleX(.7)}to{transform:scaleX(1.1)}}@media(prefers-reduced-motion:reduce){.eleven-elf{animation:none;left:auto;right:10px;opacity:.85}.elf-wings{animation:none}}`;}

// src/library.js
// Shared browser API for Eleven Cards; only connected cards are retained.
const ELEVEN_VERSION='0.3.1-local';
const elevenLibrary=window.elevenCards??={};
const elevenPreviews=elevenLibrary._elfPreviews??=new Set();
elevenLibrary.debug??={};
elevenLibrary.debug.elf=()=>{for(const preview of elevenPreviews)preview();return elevenPreviews.size;};
if(!elevenLibrary._announced){
 console.log(`%c Eleven Cards %c v${ELEVEN_VERSION} `,'background:#20252b;color:#ffffff;padding:5px 10px;border-bottom:3px solid #607d94;border-radius:5px 0 0 5px;font-weight:bold','background:#343b43;color:#e5e7eb;padding:5px 10px;border-bottom:3px solid #607d94;border-radius:0 5px 5px 0;font-weight:bold');
 elevenLibrary._announced=true;
}
function registerElfPreview(callback){elevenPreviews.add(callback);}
function unregisterElfPreview(callback){elevenPreviews.delete(callback);}

// src/history-graph-card.js
const COLORS=['#2196f3','#e78a14','#ab70d9','#26a69a','#e66b91','#718cc2','#a18d3a','#718d78'];
const REFRESH_MS=60000;
// Native controls, with one independently owned appearance form per sensor.
class HistoryGraphEditor extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'});}
 _editorConfig(config){return editorConfig(config);}
 setConfig(config){this._data=this._editorConfig(config);this._render();}
 set hass(hass){this._hass=hass;this._render();}
 get hass(){return this._hass;}
 connectedCallback(){this._render();}
 _emit(){
  const data={...this._data,entities:this._data.entities.filter(row=>row.entity)};
  this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:cardConfig(data)},bubbles:true,composed:true}));
 }
 _bind(form,definition,data){
  form.hass=this._hass;form.schema=definition.schema;form.data=data;
  form.computeLabel=s=>definition.computeLabel.call(this,s);form.computeHelper=s=>definition.computeHelper.call(this,s);
 }
 _render(){
  if(!this._data||!this._hass)return;
  if(!this._form){
   this.shadowRoot.innerHTML=`<style>:host{display:block;min-width:0}h3{font-size:16px;margin:24px 0 12px}details{border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);margin:12px 0;min-width:0}summary{cursor:pointer;padding:12px;min-height:44px;box-sizing:border-box;display:flex;align-items:center;gap:10px}summary:focus-visible,button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}.swatch{width:24px;height:3px;flex:none}.sensor-name{overflow-wrap:anywhere;flex:1;min-width:0}.body{padding:0 12px 12px;min-width:0}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}button{font:inherit;color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:6px;min-height:44px;padding:8px 12px;cursor:pointer}button:disabled{opacity:.45;cursor:default}.remove{margin-left:auto;color:var(--error-color)}.empty{color:var(--secondary-text-color)}</style><ha-form class="graph-form"></ha-form><h3 class="sensors-heading"></h3><div class="sensors"></div><p class="empty"></p><button class="add-sensor" type="button"></button>`;
   this._form=this.shadowRoot.querySelector('.graph-form');
   this._form.addEventListener('value-changed',ev=>{ev.stopPropagation();this._data={...this._data,...ev.detail.value,entities:this._data.entities};this._emit();});
   this.shadowRoot.querySelector('.add-sensor').onclick=()=>{
    const index=this._data.entities.length;if(index>=8)return;
    const row=editorConfig({entities:[''],series_options:[{entity:'',color:COLORS[index],line_style:index%2?'dashed':'solid'}]}).entities[0];
    this._data={...this._data,entities:[...this._data.entities,row]};this._openNew=true;this._render();
   };
  }
  this._bind(this._form,(this.constructor.cardClass??HistoryGraphCard).getConfigForm(),this._data);
  const lang=language(this._hass),label=key=>text(key,lang),container=this.shadowRoot.querySelector('.sensors');
  this.shadowRoot.querySelector('.sensors-heading').textContent=label('entities');
  this.shadowRoot.querySelector('.empty').textContent=this._data.entities.length?'':label('add_sensorHelper');
  const add=this.shadowRoot.querySelector('.add-sensor');add.textContent=label('add_sensor');add.disabled=this._data.entities.length>=8;
  // Retain existing details/forms on ordinary edits, so focus and expansion survive.
  while(container.children.length>this._data.entities.length)container.lastElementChild.remove();
  this._data.entities.forEach((row,index)=>{
   let entry=container.children[index];
   if(!entry){
    entry=document.createElement('details');entry.className='sensor-entry';
    entry.innerHTML='<summary><span class="swatch"></span><span class="sensor-name"></span><span aria-hidden="true">▾</span></summary><div class="body"><ha-form class="sensor-form"></ha-form><div class="actions"><button type="button" class="up"></button><button type="button" class="down"></button><button type="button" class="remove"></button></div></div>';
    container.append(entry);entry.open=this._data.entities.length===1||Boolean(this._openNew);
    const form=entry.querySelector('ha-form');form.addEventListener('value-changed',ev=>{
     ev.stopPropagation();const old=this._data.entities[index];const updated={...old,...ev.detail.value};
     if(updated.color_mode==='gradient'&&!updated.gradient_stops?.length)updated.gradient_stops=[{value:0,color:[33,150,243]},{value:1,color:[231,138,20]}];
     this._data=updateSeriesRow(this._data,index,updated);this._render();this._emit();
    });
    entry.querySelector('.remove').onclick=()=>{this._data=removeSeriesRow(this._data,index);this._render();this._emit();};
    for(const [key,delta] of [['up',-1],['down',1]])entry.querySelector('.'+key).onclick=()=>{
     const rows=[...this._data.entities],next=index+delta;if(next<0||next>=rows.length)return;
     [rows[index],rows[next]]=[rows[next],rows[index]];this._data={...this._data,entities:rows};this._render();this._emit();
    };
   }
   entry.dataset.index=index;
   const name=row.name||this._hass.states?.[row.entity]?.attributes?.friendly_name||row.entity||label('new_sensor');
   entry.querySelector('.sensor-name').textContent=name;
   const cssColor=c=>Array.isArray(c)?`rgb(${c.join(',')})`:c;
   entry.querySelector('.swatch').style.background=row.color_mode==='gradient'&&row.gradient_stops.length?`linear-gradient(to right,${row.gradient_stops.map(s=>cssColor(s.color)).join(',')})`:cssColor(row.color);
   for(const key of ['up','down','remove']){const button=entry.querySelector('.'+key);button.textContent=label('sensor_'+key);button.setAttribute('aria-label',`${label('sensor_'+key)}: ${name}`);button.disabled=key==='up'?index===0:key==='down'?index===this._data.entities.length-1:false;}
   this._bind(entry.querySelector('ha-form'),(this.constructor.cardClass??HistoryGraphCard).getSeriesConfigForm(row,this._data.entities),{...row,line_style_source:row.line_style_source??''});
  });
  this._openNew=false;
 }
}
class HistoryGraphCard extends HTMLElement {
 static async getConfigElement(){
  // The built-in Entities editor lazily loads ha-form on a fresh frontend.
  if(!customElements.get('ha-form')){
   const helpers=await window.loadCardHelpers();const card=await helpers.createCardElement({type:'entities',entities:[]});
   await card.constructor.getConfigElement();await customElements.whenDefined('ha-form');
  }
  if(!customElements.get('eleven-history-graph-editor'))customElements.define('eleven-history-graph-editor',HistoryGraphEditor);
  return document.createElement('eleven-history-graph-editor');
 }
 constructor(){super();this.attachShadow({mode:'open'});this._generation=0;this._timer=null;this._connected=false;this._status='loading';this._series=[];this._outside=e=>{const chart=this.shadowRoot.querySelector('.chart');if(chart&&!e.composedPath().includes(chart)&&!SharedGraph.hoverSourceInEvent(this,e))this._hideTooltip?.();};}
 static _formContract(schema){
  return {schema,computeLabel:function(item){return text(item?.name==='title'?'titleField':item?.name??'',language(this?.hass??frontendHass()));},computeHelper:function(item){const key=`${item?.name}Helper`,value=text(key,language(this?.hass??frontendHass()));return value===key?undefined:value;}};
 }
 static getConfigForm(){
  const label=key=>text(key,language(frontendHass()));
  const select=keys=>({select:{mode:'dropdown',get options(){return keys.map(value=>({value,label:label(value)}));}}});
  return this._formContract([
   {name:'title',selector:{text:{}}},
   {name:'show_title',default:true,selector:{boolean:{}}},
   {name:'hours_to_show',selector:{number:{min:1,max:8760,step:0.5,mode:'box'}}},
   {type:'expandable',name:'graph_settings',get title(){return label('graph_settings');},flatten:true,schema:[
    {name:'graph_mode',default:'lines',selector:select(['lines','stacked'])},
    {name:'show_legend',default:true,selector:{boolean:{}}},
    {name:'show_navigation',default:true,selector:{boolean:{}}},
    {name:'show_grid',default:true,selector:{boolean:{}}},
    {name:'show_hover_line',default:true,selector:{boolean:{}}},
    {name:'sync_hover',default:true,selector:{boolean:{}}},
    {name:'hover_sync_group',selector:{text:{}}}
   ]},
   {type:'expandable',name:'y_axis',get title(){return label('y_axis');},flatten:true,schema:[
    {name:'y_min',selector:{number:{step:'any',mode:'box'}}},
    {name:'y_max',selector:{number:{step:'any',mode:'box'}}},
    {name:'y_step',selector:{number:{step:'any',mode:'box'}}},
    {name:'align_zero',default:true,selector:{boolean:{}}}
   ]},
   {type:'expandable',name:'data_processing',get title(){return label('data_processing');},flatten:true,schema:[
    {name:'data_source',default:'auto',selector:select(['auto','history','statistics'])},
    {name:'aggregation_period',default:'none',selector:select(['none','minute','quarter_hour','hour','day','week','month'])},
    {name:'aggregation_method',default:'avg',selector:select(['min','max','avg'])}
   ]}
  ]);
 }
 static getSeriesConfigForm(row={},rows=[]){
  const label=key=>text(key,language(frontendHass()));
  const select=(keys,prefix='')=>({select:{mode:'dropdown',get options(){return keys.map(value=>({value,label:label(prefix+value)}));}}});
  const sources=lineStyleSources(rows,row);
  const sourceSelector={select:{mode:'dropdown',options:[{value:'',label:label('line_style_own')},...sources.map(s=>({value:s.entity,label:label('line_style_follow')+' '+(s.name||frontendHass()?.states?.[s.entity]?.attributes?.friendly_name||s.entity)}))]}};
  const gradients={object:{multiple:true,label_field:'value',fields:{value:{get label(){return label('stop_value');},required:true,selector:{number:{step:'any',mode:'box'}}},color:{get label(){return label('stop_color');},required:true,selector:{color_rgb:{}}}}}};
  return this._formContract([
   {name:'entity',required:true,selector:{entity:{domain:'sensor'}}},
   {name:'name',selector:{text:{}}},
   {name:'visible',default:true,selector:{boolean:{}}},
   {type:'expandable',name:'series_line',get title(){return label('series_line');},flatten:true,expanded:true,schema:[
    ...(rows.filter(s=>s.entity).length>1?[{name:'line_style_source',selector:sourceSelector}]:[]),
    ...(!row.line_style_source?[
     {name:'line_width',required:true,selector:{number:{min:1,max:8,step:0.5,mode:'box',unit_of_measurement:'px'}}},
     {name:'line_style',required:true,selector:select(['solid','dashed','dotted'])},
     {name:'line_interpolation',required:true,default:'step',selector:select(['smooth','linear','step'],'interpolation_')}
    ]:[]),
    {name:'connect_gaps',default:false,selector:{boolean:{}}},
    {name:'color_mode',required:true,selector:select(['fixed','gradient'],'color_')},
    ...(row.color_mode==='gradient'?[
     {name:'gradient_mode',required:true,selector:select(['smooth','steps'])},
     {name:'gradient_stops',selector:gradients}
    ]:[{name:'color',selector:{color_rgb:{}}}])
   ]},
   {type:'expandable',name:'series_fill',get title(){return label('series_fill');},flatten:true,expanded:true,schema:[
    {name:'show_fill',selector:{boolean:{}}},
    ...(row.show_fill?[
     {name:'fill_opacity',selector:{number:{min:0,max:1,step:0.01,mode:'slider'}}},
     {name:'fill_fade',selector:{boolean:{}}},
     {name:'fill_mode',required:true,selector:select(['line','own'],'fill_')},
     ...(row.fill_mode==='own'?[{name:'fill_color',selector:{color_rgb:{}}}]:[])
    ]:[])
   ]}
  ]);
 }
 _seriesAppearance(index){
  const row=seriesAppearance(this._config,index);
  return {...row,stops:row.color_mode==='gradient'?row.gradient_stops:[],mode:row.gradient_mode,chosen:row.color};
 }
 _appearance(index,value){
  const {stops,mode,chosen,line_style:style,line_width:width}=this._seriesAppearance(index);
  const fixed=Array.isArray(chosen)?`rgb(${chosen.join(',')})`:chosen;
  const color=gradientColor(stops,value,mode)??fixed??COLORS[index];
  return {color:color||COLORS[index],stroke:stops.length?`url(#history-colors-${index})`:fixed||COLORS[index],...graphLineStyle(style,width)};
 }
 _gradient(min,max,y){
  const c=this._config;
  const gradients=c.entities.map((_,index)=>{
   if(!this._isSeriesVisible(index))return '';
   const {stops,mode}=this._seriesAppearance(index);if(!stops.length)return '';
   if(this._axes){({min,max}=this._axes[this._seriesAxes[index]]);y=v=>(max-v)/(max-min)*300;}
   const values=[max,...stops.map(s=>s.value).filter(v=>v>min&&v<max).reverse(),min];
   const markup=values.map((v,i)=>{const offset=y(v)/3;const high=gradientColor(stops,v,mode);const low=mode==='steps'&&i>0&&i<values.length-1?gradientColor(stops,v-Math.max(1,Math.abs(v))*Number.EPSILON*4,mode):high;return `<stop offset="${offset}%" stop-color="${high}"/>${low!==high?`<stop offset="${offset}%" stop-color="${low}"/>`:''}`;}).join('');
   return `<linearGradient id="history-colors-${index}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="300">${markup}</linearGradient>`;
  }).join('');
  return `<defs>${gradients}${c.entities.some((_,i)=>{const a=this._seriesAppearance(i);return a.show_fill&&a.fill_fade;})?'<linearGradient id="history-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient><mask id="history-fill-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="300"><rect width="1000" height="300" fill="url(#history-fade)"/></mask>':''}</defs>`;
 }
 _line(points,end,x,y,index=0){return SharedGraph.path(points.map(p=>[x(p.t),p.v===null?null:y(p.v)]),this._seriesAppearance(index).line_interpolation,end===undefined?undefined:x(end));}
 _area(points,x,y,index=0){
  const interpolation=this._seriesAppearance(index).line_interpolation;
  let path='',segment=[];
  const close=until=>{if(segment.length){
   const top=this._line(segment,until,x,y,index);let bottom=`L ${x(until)} 300 L ${x(segment[0].t)} 300`;
   if(this._config.graph_mode==='stacked'){
    const reverse=[{t:until,v:segment.at(-1).base}];
    for(let i=segment.length-1;i>=0;i--){const p=segment[i];reverse.push({t:p.t,v:p.base});if(interpolation==='step'&&i>0)reverse.push({t:p.t,v:segment[i-1].base});}
    bottom=SharedGraph.path(reverse.map(p=>[x(p.t),y(p.v)]),interpolation==='step'?'linear':interpolation).replace(/^M /,'L ');
   }
   path+=`${path?' ':''}${top} ${bottom} Z`;segment=[];
  }};
  for(const point of points){if(point.v===null)close(point.t);else segment.push(point);}close(Math.max(this._viewEnd??this._end,segment.at(-1)?.t??0));return path;
 }
 static getStubConfig(hass){const ids=Object.keys(hass?.states??{}).filter(id=>id.startsWith('sensor.')&&Number.isFinite(Number(hass.states[id].state))&&hass.states[id].state!=='');return {entities:ids.slice(0,1),hours_to_show:24};}
 getGridOptions(){return {rows:6,columns:12,min_rows:4,min_columns:6};}
 getCardSize(){return 6;}
 _isSeriesVisible(index){const id=this._config.entities[index];return this._visibility?.get(id)??(this._config.series_options.find(s=>s.entity===id)?.visible??true);}
 _toggleSeries(id){
  const index=this._config.entities.indexOf(id);if(index<0)return;
  this._visibility??=new Map();this._visibility.set(id,!this._isSeriesVisible(index));this._hideTooltip();this._render();
  queueMicrotask(()=>this.shadowRoot.querySelector?.(`button[data-series="${id}"]`)?.focus({preventScroll:true}));
 }
 setConfig(config){let validated;try{validated=validateConfig(config);}catch(error){throw new Error(text(error.message==='y_step'?'y_step_error':error.message==='y_step_count'?'y_step_count':error.message?.startsWith('line_style_source')?'line_style_source_error':'config',language(this._hass??frontendHass())));}
  const previous=this._config,visibility=this._visibility;
  this._visibility=new Map(validated.entities.map(id=>{const initial=validated.series_options.find(s=>s.entity===id)?.visible??true,old=previous?.series_options.find(s=>s.entity===id)?.visible??true;return [id,initial===old&&visibility?.has(id)?visibility.get(id):initial];}));
  SharedGraph.clearHover(this);this._config=validated;this._lastLoad=null;this._loadFailed=false;this._insightOpen=null;this._generation++;this._inFlight=false;this._series=[];this._rawSeries=null;this._viewport=null;resetGraphPeriod(this);this._status='loading';clearTimeout(this._timer);this._timer=null;this._render();if(this._connected&&this._hass)this._refresh();}
 set hass(hass){this._hass=hass;if(!this._config)return;let signature;try{const meta=seriesMetadata(hass,this._config.entities);signature=JSON.stringify([meta,language(hass),hass.config?.time_zone]);}catch(e){signature=e.message;}
  if(signature!==this._signature){this._signature=signature;this._render();}
  this._updateGraphTheme();
  if(this._connected&&!this._started)this._refresh();
 }
 get hass(){return this._hass;}
 _syncElf(){
  clearTimeout(this._elfTimer);this._elfTimer=null;
  const parent=this.shadowRoot.querySelector('.card-content');
  const now=Date.now(),zone=this._hass?.config?.time_zone,day=elevenDay(new Date(),zone);
  const dayKey='eleven-cards:elf-day';
  try{this._elfDay=window.sessionStorage?.getItem(dayKey)??this._elfDay;}catch{}
  if(parent&&isElevenMinute(new Date(),zone)&&this._elfDay!==day){this._elfDay=day;this._elfPreviewUntil=now+ELF_FLIGHT_MS;try{window.sessionStorage?.setItem(dayKey,day);}catch{}}
  if(parent){const elf=parent.querySelector('.eleven-elf');const visible=now<(this._elfPreviewUntil??0);if(visible&&!elf)parent.insertAdjacentHTML('beforeend',elevenMarkup(Math.max(0,now-(this._elfPreviewUntil-ELF_FLIGHT_MS))));else if(!visible&&elf)elf.remove();}
  if(this._connected){this._elfTimer=setTimeout(()=>this._syncElf(),Math.min(60000-now%60000,this._elfPreviewUntil>now?this._elfPreviewUntil-now:60000));this._elfTimer.unref?.();}
 }
 connectedCallback(){this._connected=true;SharedGraph.connectHover(this,t=>this._receiveHover(t));this._elfPreview??=()=>{this._elfPreviewUntil=Date.now()+ELF_FLIGHT_MS;this.shadowRoot.querySelector('.eleven-elf')?.remove();this._syncElf();};registerElfPreview(this._elfPreview);document.addEventListener('pointerdown',this._outside);this._syncElf();if(this._config&&this._hass)this._refresh();}
 disconnectedCallback(){disconnectChartInsights(this);disconnectPeriodControls(this);SharedGraph.disconnectHover(this);this._connected=false;unregisterElfPreview(this._elfPreview);this._elfPreviewUntil=0;this._generation++;this._inFlight=false;this._started=false;clearTimeout(this._timer);this._timer=null;clearTimeout(this._elfTimer);this._elfTimer=null;document.removeEventListener('pointerdown',this._outside);}
 async _refresh(){
  if(!this._connected||!this._config||!this._hass||this._inFlight)return;
  clearTimeout(this._timer);this._timer=null;const generation=++this._generation;this._inFlight=true;this._started=true;
  const {start,end}=graphPeriodRange(this);const config={...this._config,hours_to_show:(end-start)/3600000},hass=this._hass;
  this._status='loading';this._render();let timeout;
  try{
   seriesMetadata(hass,config.entities);
   const response=await Promise.race([loadHistorySeries(hass,config,start,end),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('timeout')),15000);timeout.unref?.();})]);
   if(generation!==this._generation||!this._connected)return;
   seriesMetadata(this._hass,config.entities);
   this._series=response;this._rawSeries=this._series;this._start=start;this._end=end;
   this._loadFailed=false;this._lastLoad={at:Date.now(),start,end,sources:response.map(s=>({id:s.id,source:s.source??'history',empty:!s.points.some(p=>p.v!==null)}))};
   this._status=this._series.some(s=>s.points.some(p=>p.v!==null))?'ready':'empty';
  }catch(e){if(generation!==this._generation||!this._connected)return;this._loadFailed=true;this._status=['missing','unit','statistics_config','statistics_unavailable'].includes(e.message)?e.message:'error';this._series=[];}
  finally{clearTimeout(timeout);if(generation===this._generation&&this._connected){this._inFlight=false;this._render();this._timer=setTimeout(()=>this._refresh(),REFRESH_MS);this._timer.unref?.();}}
 }
 _getGraphAxes(series,meta,visible){return graphAxes(series,meta,this._config,this._start,this._end,visible);}
 _aggregateSeries(){return aggregateSeries(this._rawSeries,this._start,this._end,this._config.aggregation_period,this._config.aggregation_method,this._zone);}
 _displayPoints(points,index=0){return displayPoints(this._seriesAppearance(index).connect_gaps?connectGapPoints(points):points,this._viewStart,this._viewEnd);}
 _dataInformation(){
  const start=this._viewStart,end=this._viewEnd;
  return {start,end,rows:this._series.map((s,i)=>({...this._meta.items[i],...chartValueStatistics(s.points,start,end)}))};
 }
 _defaultTitle(lang){return text('title',lang);}
 _render(){
  if(!this._config)return;captureChartInsights(this);const lang=language(this._hass);this._lang=lang;this._zone=this._hass?.config?.time_zone;
  let meta;try{meta=seriesMetadata(this._hass??{},this._config.entities,this._config.series_options);}catch(e){if(this._hass)this._status=e.message;}
  const title=this._config.title??this._defaultTitle(lang);let content='';
  if(this._status!=='ready'||!meta){content=`<div class="state" role="status">${escapeHtml(text(this._status,lang))}${['error','unit','missing','statistics_config','statistics_unavailable'].includes(this._status)?`<button class="retry">${text('retry',lang)}</button>`:''}</div>`;}
  else{
   this._rawSeries??=this._series;
   const key=JSON.stringify([this._start,this._end,this._zone,this._config.aggregation_period,this._config.aggregation_method]);
   if(this._processedRaw!==this._rawSeries||this._processedKey!==key){this._series=this._aggregateSeries();this._processedRaw=this._rawSeries;this._processedKey=key;}
   const visible=this._config.entities.map((_,i)=>this._isSeriesVisible(i)),anyVisible=visible.some(Boolean);
   const axisKey=JSON.stringify([meta.items.map(item=>item.unit),this._config.graph_mode,this._config.y_min,this._config.y_max,this._config.y_step,this._config.align_zero,visible]);
   let grouped;try{if(this._axisSource!==this._series||this._axisKey!==axisKey){this._axisGroups=this._getGraphAxes(this._series,meta,visible);this._axisSource=this._series;this._axisKey=axisKey;}grouped=this._axisGroups;}catch(error){if(!['y_step','y_step_count'].includes(error.message))throw error;this._status=error.message==='y_step'?'y_step_error':error.message;this._range=null;this._render();return;}
   this._meta=meta;this._axes=grouped.axes;this._seriesAxes=grouped.seriesAxes;this._plotSeries=grouped.plotSeries;
   const {min,max}=this._axes[0];this._range=[min,max];
   const extra=this._axes.length-1,mixed=new Set(meta.items.map(item=>item.unit)).size>1;
   this._viewStart=Math.max(this._start,this._viewport?.[0]??this._start);this._viewEnd=Math.min(this._end,this._viewport?.[1]??this._end);
   if(this._viewEnd<=this._viewStart){this._viewport=null;this._viewStart=this._start;this._viewEnd=this._end;}
   const x=t=>(t-this._viewStart)/(this._viewEnd-this._viewStart)*1000,y=v=>(max-v)/(max-min)*300;
   const axes=this._axes.map((axis,index)=>{
    const position=index?`left:auto;right:calc(12px + ${index-1} * var(--axis-column));width:var(--axis-column);max-width:var(--axis-column);text-align:right;`:'';
    const unit=mixed?`<span class="axis-unit" style="${position}">${escapeHtml(axis.unit||'—')}</span>`:'';
    return unit+[...axis.ticks].reverse().map(value=>{const ratio=(axis.max-value)/(axis.max-axis.min);return `<span class="axis-y" style="top:calc(${ratio*100}% + ${22-ratio*52}px);${position}">${escapeHtml(number(value,lang,true))}</span>`;}).join('');
   }).join('');
   const times=Array.from({length:4},(_,i)=>`<span class="axis-x" data-tick="${i}" style="left:calc(${i/3*100}% + ${44-i/3*56}px - ${i/3} * var(--axes-right,0px))">${escapeHtml(time(this._viewStart+(this._viewEnd-this._viewStart)*i/3,lang,this._zone,(this._viewEnd-this._viewStart)>86400000))}</span>`).join('');

   const display=this._plotSeries.map((s,i)=>({...s,points:this._displayPoints(s.points,i)}));
   const seriesY=i=>{const a=this._axes[this._seriesAxes[i]];return v=>(a.max-v)/(a.max-a.min)*300;};
   this._graph??=new SharedGraph();
   const graph=this._graph.render(this,{
    viewBox:'0 0 1000 300',defs:this._gradient(min,max,y),
    before:this._config.show_grid!==false?`<g class="y-grid">${this._axes[0].ticks.map((value,index)=>`<line class="grid-line${this._axes.some(a=>a.ticks[index]===0)?' grid-zero':''}" x1="0" x2="1000" y1="${y(value)}" y2="${y(value)}"/>`).join('')}</g><g class="grid-edges"><line class="grid-line grid-edge" x1="0" x2="0" y1="0" y2="300"/><line class="grid-line grid-edge" x1="1000" x2="1000" y1="0" y2="300"/></g>`:'',
    fills:display.flatMap((s,i)=>{const a=this._seriesAppearance(i);if(!visible[i]||!a.show_fill)return [];const fillColor=Array.isArray(a.fill_color)?`rgb(${a.fill_color.join(',')})`:a.fill_color;return [{d:this._area(s.points,x,seriesY(i),i),className:'series-fill',fill:a.fill_mode==='own'?fillColor:this._appearance(i).stroke,opacity:a.fill_opacity,mask:a.fill_fade?'url(#history-fill-fade)':null}];}),
    lines:display.flatMap((s,i)=>visible[i]?[{d:this._line(s.points,Math.max(this._viewEnd,s.points.at(-1)?.t??this._viewEnd),x,seriesY(i),i),className:'series-line',entity:s.id,appearance:this._appearance(i)}]:[]),
   });
   // Statistics bins end exclusively; sample inside the requested range rather
   // than its closing null sentinel. A real gap before the end remains null.
   const legend=meta.items.map((item,i)=>{const s=this._series[i],value=valueAt(s.points,this._end-(s.source==='statistics'?1:0));const a=this._appearance(i,value);return `<button type="button" class="legend-item" data-series="${item.id}" aria-pressed="${visible[i]}" title="${escapeHtml(text(visible[i]?'hide_sensor':'show_sensor',lang)+' '+item.name)}"><i style="--series-color:${a.color};border-top-width:${a.width}px;border-top-style:${a.style}"></i><span>${escapeHtml(item.name)}</span><strong>${value===null?text('unavailable',lang):escapeHtml(number(value,lang))}${mixed&&value!==null&&item.unit?` ${escapeHtml(item.unit)}`:''}</strong></button>`;}).join('');
   const missing=meta.items.filter((_,i)=>visible[i]&&!this._series[i].points.some(p=>p.v!==null)).map(s=>s.name);
   content=`${this._config.show_legend?`<div class="legend">${legend}${mixed?'':`<span class="unit">${escapeHtml(meta.unit)}</span>`}</div>`:`<div class="data-status">${escapeHtml(mixed?'':meta.unit)}</div>`}${missing.length?`<div class="data-status">${text('partial',lang)} ${escapeHtml(missing.join(', '))}</div>`:''}<div class="chart" style="--axis-column:min(48px, calc((100% - 124px) / ${Math.max(1,extra)}));--axes-right:calc(${extra} * var(--axis-column))" tabindex="0" role="group" aria-label="${text('chart',lang)}">${anyVisible?axes+times:`<div class="empty-visibility" role="status">${escapeHtml(text('no_visible',lang))}</div>`}<div class="plot">${graph}<div class="zoom-selection" hidden></div></div>${this._config.show_hover_line?'<div class="guide" hidden></div>':''}<div class="markers"></div><div class="tooltip" hidden></div><div class="sr-only" aria-live="polite"></div></div>`;
  }
  const controls=cardHeader({title,showTitle:this._config.show_title!==false,ready:this._status==='ready',historyUrl:this._historyUrl(),language:lang,periods:periodControls(this,lang),zoomState:chartZoomState(this),information:chartDataInformation(this,lang)});
  this.shadowRoot.innerHTML=`<style>${this._styles()}</style><ha-card lang="${lang}"><div class="card-content">${controls}${content}</div></ha-card>`;
  this._updateGraphTheme();bindPeriodControls(this);bindChartInsights(this);
  this.shadowRoot.querySelectorAll?.('[data-zoom]').forEach(button=>button.onclick=()=>this._zoom({in:0.5,out:2,reset:0}[button.dataset.zoom]));
  this._graph?.restore(this);
  const retry=this.shadowRoot.querySelector('.retry');if(retry)retry.onclick=()=>this._refresh();this._pinned=false;this._bindInteractions();
  this._syncElf();SharedGraph.restoreHover(this);
 }
 _updateGraphTheme(){
  const card=this.shadowRoot.querySelector('ha-card');
  if(!card?.style||!globalThis.getComputedStyle)return;
  // Use the actual card surface, including per-card background overrides.
  const background=getComputedStyle(card).backgroundColor;
  let dark=this._hass?.themes?.darkMode??false;
  const rgba=background.match(/^rgba?\(([^)]+)\)$/)?.[1].split(/[,\s/]+/).map(Number);
  if(rgba?.length>=3&&(rgba[3]??1)>0){
   const channels=rgba.slice(0,3).map(v=>{const c=v/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;});
   dark=channels[0]*.2126+channels[1]*.7152+channels[2]*.0722<.179;
  }
  card.style.setProperty('--history-value-color',dark?'#f3f4f6':'#111111');
  card.style.setProperty('--history-grid-color',dark?'#3a3b45':'#e1e3e8');
  card.style.setProperty('--history-grid-zero-color',dark?'#626571':'#b8bbc4');
 }
 _historyUrl(){const range=graphPeriodRange(this),ready=this._status==='ready';const end=this._viewport?.[1]??(ready?this._end:range.end)??range.end,start=this._viewport?.[0]??(ready?this._start:range.start)??range.start;return `/history?entity_id=${encodeURIComponent(this._config.entities.join(','))}&start_date=${encodeURIComponent(new Date(start).toISOString())}&end_date=${encodeURIComponent(new Date(end).toISOString())}`;}
 _setPeriod(hours){return chooseGraphPeriod(this,String(hours));}
 _navigate(direction){return moveGraphPeriod(this,direction);}
 _reloadPeriod(){this._generation++;this._inFlight=false;this._viewport=null;this._hideTooltip();clearTimeout(this._timer);this._status='loading';this._render();return this._refresh();}
 _zoom(factor){
  this._hideTooltip();if(!factor)this._viewport=null;
  else{const a=this._viewStart??this._start,b=this._viewEnd??this._end,width=Math.min(this._end-this._start,Math.max(60000,(b-a)*factor)),center=(a+b)/2;
   const start=Math.max(this._start,Math.min(this._end-width,center-width/2));this._viewport=[start,start+width];}
  this._render();
 }
 _bindInteractions(){
  const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;
  const fromPointer=e=>{const box=chart.querySelector('.plot').getBoundingClientRect();return (this._viewStart??this._start)+Math.max(0,Math.min(1,(e.clientX-box.left)/box.width))*((this._viewEnd??this._end)-(this._viewStart??this._start));};
  let drag=null;const selection=chart.querySelector('.zoom-selection');
  chart.onpointermove=e=>{if(drag&&Math.abs(e.clientX-drag.x)>=6){const plot=chart.querySelector('.plot').getBoundingClientRect();if(selection){selection.hidden=false;selection.style.left=`${Math.max(0,Math.min(drag.x,e.clientX)-plot.left)/plot.width*100}%`;selection.style.width=`${Math.min(plot.width,Math.abs(e.clientX-drag.x))/plot.width*100}%`;}}else if(!this._pinned&&!e.target?.closest?.('.tooltip'))this._showTooltip(this._pointerTime(fromPointer(e)));};
  chart.onpointerdown=e=>{if(e.target?.closest?.('.tooltip'))return;this._pinned=true;this._showTooltip(this._pointerTime(fromPointer(e)));if(e.pointerType==='mouse'&&(e.button??0)===0){drag={x:e.clientX,t:fromPointer(e)};chart.setPointerCapture?.(e.pointerId);}};
  chart.onpointerup=e=>{if(selection)selection.hidden=true;if(drag){const first=drag;drag=null;if(Math.abs(e.clientX-first.x)>=6){const last=fromPointer(e),a=Math.min(first.t,last),b=Math.max(first.t,last);if(b-a>=60000){this._hideTooltip();this._viewport=[a,b];this._render();}}}};
  chart.onpointercancel=()=>{drag=null;if(selection)selection.hidden=true;};
  chart.onpointerleave=()=>{if(!this._pinned)this._hideTooltip();};chart.onblur=()=>this._hideTooltip();
  chart.onkeydown=e=>{
   if(e.key==='Escape'){this._hideTooltip();return;}
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
   const a=this._viewStart??this._start,b=this._viewEnd??this._end;
   const timeline=[...new Set([a,...this._series.flatMap((s,i)=>this._isSeriesVisible(i)?s.points.map(p=>p.t):[]).filter(t=>t>a&&t<b),b])].sort((a,b)=>a-b);
   let index=timeline.findIndex(t=>t>=(this._cursor??this._start));if(index<0)index=timeline.length-1;
   if(e.key==='Home')index=0;else if(e.key==='End')index=timeline.length-1;else index=Math.max(0,Math.min(timeline.length-1,index+(e.key==='ArrowRight'?1:-1)));
   this._pinned=true;this._showTooltip(timeline[index]);
  };
 }
 _pointerTime(timestamp){return timestamp;}
 _receiveHover(timestamp){if(timestamp===null||timestamp<(this._viewStart??this._start)||timestamp>(this._viewEnd??this._end)){this._hideTooltip(false);return;}this._showTooltip(timestamp,false);}
 _hideTooltip(publish=true){if(publish)SharedGraph.clearHover(this);this._cursor=null;this._pinned=false;const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;const tooltip=chart.querySelector('.tooltip');if(tooltip)tooltip.hidden=true;const markers=chart.querySelector('.markers');if(markers)markers.innerHTML='';const guide=chart.querySelector('.guide');if(guide)guide.hidden=true;}
 _showTooltip(timestamp,publish=true){
  this._updateGraphTheme();
  if(!SharedGraph.tooltipInView(this)){this._hideTooltip(publish);return;}
  const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;this._cursor=timestamp;
  const tooltip=chart.querySelector('.tooltip'),plot=chart.querySelector('.plot');const box=chart.getBoundingClientRect(),p=plot.getBoundingClientRect();
  const px=p.left-box.left+(timestamp-(this._viewStart??this._start))/((this._viewEnd??this._end)-(this._viewStart??this._start))*p.width;
  const positions=[];
  const rows=this._series.flatMap((s,i)=>{if(!this._isSeriesVisible(i))return [];const {min,max}=this._axes?.[this._seriesAxes[i]]??{min:this._range[0],max:this._range[1]};const value=valueAt(s.points,timestamp),height=valueAt((this._plotSeries??this._series)[i].points,timestamp);if(height!==null&&height>=min&&height<=max)positions.push({x:px,y:p.top-box.top+(max-height)/(max-min)*p.height,color:this._appearance(i,value).color});return [{name:this._meta.items[i].name,value:value===null?text('unavailable',this._lang):`${number(value,this._lang)} ${this._meta.items[i].unit??this._meta.unit}`}];});
  if(!rows.length){this._hideTooltip(publish);return;}
  const colors=this._series.flatMap((s,i)=>this._isSeriesVisible(i)?[this._appearance(i,valueAt(s.points,timestamp)).color]:[]);
  tooltip.innerHTML=`<strong>${escapeHtml(time(timestamp,this._lang,this._zone,true))}</strong>${rows.map((row,i)=>`<span><i style="background:${escapeHtml(colors[i])}"></i><b class="tooltip-label">${escapeHtml(row.name)}: <em class="tooltip-value">${escapeHtml(row.value)}</em></b></span>`).join('')}`;tooltip.hidden=false;tooltip.style.pointerEvents=this._pinned?'auto':'none';
  tooltip.style.maxHeight=`${Math.max(0,box.height-8)}px`;
  const measured=tooltip.getBoundingClientRect();let left=Math.max(4,Math.min(box.width-measured.width-4,px+14));
  if(px+14+measured.width>box.width-4)left=Math.max(4,px-measured.width-14);
  const candidates=[4,Math.max(4,box.height-measured.height-4)];
  const overlaps=top=>positions.filter(m=>m.x>left-9&&m.x<left+measured.width+9&&m.y>top-9&&m.y<top+measured.height+9).length;
  const top=candidates.sort((a,b)=>overlaps(a)-overlaps(b))[0];tooltip.style.left=`${left}px`;tooltip.style.top=`${top}px`;
  chart.querySelector('.markers').innerHTML=positions.map(m=>`<i class="hover-dot" style="left:${m.x}px;top:${m.y}px;border-color:${m.color}"></i>`).join('');
  const guide=chart.querySelector('.guide');if(guide){guide.hidden=false;guide.style.left=`${px}px`;}
  chart.querySelector('.sr-only').textContent=`${time(timestamp,this._lang,this._zone,true)}. ${rows.map(row=>`${row.name}: ${row.value}`).join('. ')}`;
  if(publish)SharedGraph.publishHover(this,timestamp);
 }
 _styles(){return `
 :host{display:block;height:100%;min-width:0;container-type:inline-size;--font-size-meta:11px;--font-size-label:12px;--font-size-title:18px;}
 ha-card{height:100%;display:flex;flex-direction:column;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,inherit)}
 .card-content{position:relative;display:flex;flex-direction:column;box-sizing:border-box;min-height:0;height:100%;padding:16px 16px 12px;line-height:1.4}
 ${cardHeaderStyles()}
 ${periodControlsStyles()}
 ${chartInsightStyles()}
 .legend{display:flex;flex-wrap:wrap;align-items:center;gap:7px 16px;margin:0 0 2px;color:var(--secondary-text-color);font-size:var(--font-size-label)}
 .legend-item{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;border:0;padding:4px 0;background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer;border-radius:4px}.legend-item[aria-pressed="false"]{opacity:.45}.legend-item[aria-pressed="false"]>span{text-decoration:line-through}.legend-item:focus-visible{outline:2px solid var(--primary-color);outline-offset:3px}.legend-item>span{overflow-wrap:anywhere}.legend-item strong{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}.empty-visibility{position:absolute;inset:22px 12px 30px 44px;display:flex;align-items:center;justify-content:center;color:var(--secondary-text-color);font-size:12px;text-align:center;pointer-events:none}
 .legend i{width:15px;flex-shrink:0;border-top:3px solid var(--series-color)}.unit{margin-left:auto;font-weight:600}
 .data-status{font-size:11px;color:var(--secondary-text-color);margin-top:3px}
 .chart{position:relative;flex:1;min-height:120px;height:260px;margin-top:4px;outline:none;touch-action:pan-y}
 .chart:focus-visible{box-shadow:inset 0 0 0 2px var(--primary-color);border-radius:8px}
 .plot{position:absolute;left:44px;right:calc(12px + var(--axes-right,0px));top:22px;bottom:30px;overflow:hidden}.plot svg{width:100%;height:100%;overflow:hidden}
 .axis-y,.axis-x{position:absolute;color:var(--secondary-text-color);font-size:11px;line-height:1.2;font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none}.axis-y{left:0;transform:translateY(-50%);max-width:40px;overflow:hidden;text-overflow:ellipsis}.axis-x{bottom:4px;transform:translateX(-50%)}.axis-x:last-of-type{transform:translateX(-100%)}
 .axis-unit{position:absolute;left:0;top:2px;max-width:40px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--secondary-text-color);font-size:10px;font-weight:600}
 ${SharedGraph.tooltipStyles()}
 .legend-item strong,.tooltip .tooltip-value{color:var(--history-value-color,var(--primary-text-color));font-style:normal}
 .tooltip .tooltip-label{color:var(--secondary-text-color)}
 .grid-line{stroke:var(--history-grid-color,var(--divider-color));stroke-width:.8;vector-effect:non-scaling-stroke;pointer-events:none}.grid-zero{stroke:var(--history-grid-zero-color,var(--divider-color));stroke-width:1.2}
 .state{display:flex;flex:1;height:260px;flex-direction:column;justify-content:center;align-items:flex-start;gap:8px;min-height:120px;font-size:14px;color:var(--secondary-text-color)}.retry{font:inherit;border:1px solid var(--divider-color);border-radius:6px;background:var(--secondary-background-color);color:var(--primary-text-color);min-height:44px;padding:0 12px;cursor:pointer}
 .guide{position:absolute;top:22px;bottom:30px;border-left:1px dashed var(--secondary-text-color);pointer-events:none}.guide[hidden]{display:none}
 .zoom-selection{position:absolute;top:0;bottom:0;background:color-mix(in srgb,var(--primary-color,#2196f3) 18%,transparent);border-inline:1px solid var(--primary-color,#2196f3);pointer-events:none}.zoom-selection[hidden]{display:none}
 .sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
 ${elevenStyles()}
 ${graphStyles()}
 @container(max-width:480px){.axis-x[data-tick="1"],.axis-x[data-tick="2"]{display:none}}
 @media(max-width:480px){.card-content{padding:12px 12px 10px}}
 `;}
}
if(!customElements.get('eleven-history-graph-card'))customElements.define('eleven-history-graph-card',HistoryGraphCard);
window.customCards=window.customCards??[];
if(!window.customCards.some(card=>card.type==='eleven-history-graph-card'))window.customCards.push({type:'eleven-history-graph-card',name:'Eleven History Graph Card',get description(){return language(frontendHass())==='nl'?'Sensorhistorie met een eigen y-as per eenheid':'Sensor history with an independent y-axis per unit';}});

})();

;
(()=>{
// Shared markup stays in each card's shadow root: native links and existing
// data-zoom handlers work without cross-bundle custom-element registration.
const headerEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bindCardPopupPosition(host,trigger,popup,isRequested,show){
 let active=true;
 const position=()=>{
  if(!active||!isRequested())return;
  const box=trigger.getBoundingClientRect();
  // A newly inserted ha-card may not have rendered its slot yet. Never anchor
  // an open popup to its temporarily empty trigger rectangle at (0, 0).
  if(!box.width||!box.height){popup.style.visibility='hidden';return;}
  popup.style.visibility='';show?.();
  const width=Math.min(380,window.innerWidth-16);
  popup.style.width=width+'px';popup.style.maxHeight=Math.min(560,window.innerHeight-16)+'px';
  const height=popup.getBoundingClientRect().height,below=window.innerHeight-box.bottom-8,above=box.top-8;
  popup.style.left=Math.max(8,Math.min(box.right-width,window.innerWidth-width-8))+'px';
  popup.style.top=Math.max(8,Math.min(below>=height||below>=above?box.bottom+6:box.top-height-6,window.innerHeight-height-8))+'px';
 };
 const ready=host.shadowRoot.querySelector('ha-card')?.updateComplete;
 if(ready?.then)ready.then(position,()=>{});
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(position):null;
 observer?.observe(trigger);
 return {position,disconnect(){active=false;observer?.disconnect();}};
}
// Native toggle events are asynchronous. Clear the other popup's restore
// state synchronously, also for browsers using the attribute fallback.
function closeOtherCardPopups(host,kind){
 const period=kind==='period',root=host.shadowRoot;
 if(period){host._insightOpen=null;host._insightPending=null;host._insightFocus=null;}
 else{host._periodMenuOpen=false;host._periodMenuPending=false;host._periodFocus=null;}
 for(const panel of root.querySelectorAll?.(period?'.insight-popup':'.period-menu')??[]){
  if(typeof panel.showPopover==='function'){if(panel.matches(':popover-open'))panel.hidePopover();}
  else panel.removeAttribute('data-fallback-open');
 }
 for(const trigger of root.querySelectorAll?.(period?'[data-insight]':'[data-period="menu"]')??[])trigger.setAttribute('aria-expanded','false');
}
function cardHeaderIcon(name){
 const paths={in:'M5 12h14M12 5v14',out:'M5 12h14',reset:'M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6',previous:'m15 6-6 6 6 6',next:'m9 6 6 6-6 6',info:'M12 17v-5M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',history:'M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',down:'m6 9 6 6 6-6'};
 return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
}
function cardHeader({title,showTitle=true,ready=false,historyUrl,language='en',periods={},zoomState={in:true,out:true,reset:true,zoomed:false},information=''}){
 const nl=language.startsWith('nl'),label=nl?['Inzoomen','Uitzoomen','Zoom herstellen','Open in Home Assistant Geschiedenis']:['Zoom in','Zoom out','Reset zoom','Open in Home Assistant History'];
 const zoom=ready?`<div class="zoom-controls" role="group" aria-label="Zoom">${['out','in','reset'].map(action=>`<button type="button" data-zoom="${action}"${zoomState[action]?'':' disabled'} title="${label[['in','out','reset'].indexOf(action)]}" aria-label="${label[['in','out','reset'].indexOf(action)]}">${cardHeaderIcon(action)}</button>`).join('')}</div>`:'';
 const group=periods.navigation||zoom?`<div class="chart-controls" role="group" aria-label="${nl?'Periode en zoom':'Period and zoom'}">${periods.navigation??''}${zoom}</div>`:'';
 const showZoomStatus=zoomState.zoomed&&!periods.picker;
 return `<header class="card-header">${showTitle&&title?`<h2>${headerEscape(title)}</h2>`:''}<div class="header-actions">${periods.picker??''}${group}<div class="chart-links"><a class="history-link" href="${headerEscape(historyUrl)}" title="${label[3]}" aria-label="${label[3]}">${cardHeaderIcon('history')}</a>${information}</div></div></header>${showZoomStatus?`<div class="chart-context"><div class="chart-range"><span class="zoom-status">${nl?'Ingezoomd':'Zoomed in'}</span></div></div>`:''}`;
}
function cardHeaderStyles(){return `
.card-header{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;min-height:32px;flex:none;margin:-6px -4px 10px 0}
.card-header h2{flex:1 1 110px;min-width:0;margin:4.75px 0 0;font-size:18px;line-height:1.25;font-weight:650;letter-spacing:-.01em;overflow-wrap:anywhere}
.header-actions{--chart-action-gap:8px;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:var(--chart-action-gap);flex:0 1 auto;min-width:0;max-width:100%;margin-inline-start:auto}
.chart-controls{display:flex;align-items:center;flex-wrap:wrap;gap:0;max-width:100%}
.chart-links{display:flex;align-items:center;gap:var(--chart-action-gap);flex:none}
.zoom-controls{display:flex;gap:0;position:relative}
.header-actions button,.history-link{display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:inherit;font-size:12px;font-weight:400;width:32px;height:32px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--primary-text-color,#20252b);text-decoration:none;cursor:pointer;flex:none}
.chart-controls,.chart-links>.history-link{background:var(--secondary-background-color,#eee);border-radius:5px}
.chart-controls button:not(:disabled):hover,.chart-links>.history-link:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.chart-controls>[data-period="now"]{width:36px}
.chart-controls>[data-period="next"]+.zoom-controls{margin-inline-start:8px;padding-inline-start:8px}
.chart-controls>[data-period="next"]+.zoom-controls::before{content:"";position:absolute;inset-inline-start:0;top:8px;height:16px;width:1px;background:var(--divider-color,#ddd)}
.header-actions button:disabled{opacity:.35;cursor:default}
.header-actions button:hover,.history-link:hover{background:var(--secondary-background-color,#eee)}
.header-actions button:focus-visible,.history-link:focus-visible{background:var(--secondary-background-color,#eee);outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.period-menu,.insight-popup{display:none;position:fixed;inset:auto;margin:0;padding:8px 12px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;z-index:20;max-width:calc(100vw - 16px);border:1px solid var(--divider-color,#ddd);border-radius:10px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font:inherit;font-size:12px;line-height:1.35;box-shadow:0 8px 28px #0004}
.chart-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.chart-popup-heading>strong{font-size:14px;font-weight:600}
.period-menu .chart-popup-heading>button,.insight-popup .chart-popup-heading>button{display:flex;align-items:center;justify-content:center;width:30px;height:30px;min-height:30px;padding:0;border:0;border-radius:5px;background:transparent;color:inherit;font:inherit;font-size:20px;font-weight:400;flex:none;cursor:pointer}
`;}

// Domain-neutral SVG renderer. Adapters own data, geometry, colors and annotations.
function graphLineStyle(style, width = 3.5) {
  return {style, width, dash: style === 'dashed' ? '8 7' : style === 'dotted' ? '1 7' : 'none', cap: style === 'dashed' ? 'butt' : 'round'};
}
const graphAttribute = value => String(value).replace(/[&"<>]/g, c => ({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
class SharedGraph {
  static hoverGroup(host) {
    return host._config?.sync_hover === false ? null : (host._config?.hover_sync_group?.trim() || 'default');
  }
  static hoverState() {
    const key = Symbol.for('eleven-cards.hover-sync.v1');
    const target = globalThis.window ?? globalThis;
    return target[key] ??= new Map();
  }
  static connectHover(host, receive) {
    this.disconnectHover(host);
    host._receiveSharedHover = receive;
    host._sharedHoverListener = event => {
      const {source, group, timestamp} = event.detail;
      if (source !== host && host.isConnected && group === this.hoverGroup(host)) receive(timestamp);
    };
    window.addEventListener('eleven-cards:hover-sync', host._sharedHoverListener);
    // Scroll does not cross shadow roots: listen in every enclosing tree.
    host._sharedScrollTargets = [window];
    for (let root = host.getRootNode?.(); root && root !== window; root = root.host?.getRootNode()) {
      host._sharedScrollTargets.push(root);
    }
    host._sharedScrollListener = event => {
      if (event?.composedPath?.().some(node => node?.classList?.contains('tooltip'))) return;
      host._hideTooltip();
    };
    for (const target of host._sharedScrollTargets) target.addEventListener('scroll', host._sharedScrollListener, true);
    window.addEventListener('resize', host._sharedScrollListener);
  }
  static tooltipInView(host) {
    const chart = host.shadowRoot?.querySelector('.chart');
    const box = chart?.getBoundingClientRect?.();
    if (!box) return true;
    const bottom = box.bottom ?? box.top + box.height, right = box.right ?? box.left + box.width;
    if (bottom <= 0 || right <= 0 || box.top >= (window.innerHeight ?? Infinity) || box.left >= (window.innerWidth ?? Infinity)) return false;
    // Respect nested scrolling/clipping containers, including HA's shadow trees.
    for (let node = host; node; node = node.parentElement ?? node.getRootNode?.().host) {
      if (!node.getBoundingClientRect || !globalThis.getComputedStyle) continue;
      const style = getComputedStyle(node), clipX = /auto|scroll|hidden|clip/.test(style.overflowX), clipY = /auto|scroll|hidden|clip/.test(style.overflowY);
      if (!clipX && !clipY) continue;
      const bounds = node.getBoundingClientRect();
      if ((clipY && (bottom <= bounds.top || box.top >= bounds.bottom)) || (clipX && (right <= bounds.left || box.left >= bounds.right))) return false;
    }
    return true;
  }
  static tooltipStyles() {
    return `.tooltip{position:absolute;z-index:4;box-sizing:border-box;min-width:0;max-width:calc(100% - 8px);padding:8px 10px;border:1px solid var(--divider-color,#ddd);border-radius:6px;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));box-shadow:0 3px 12px #0002;font-size:12px;line-height:1.4;font-variant-numeric:tabular-nums;overflow:auto;overflow-wrap:anywhere;pointer-events:none}.tooltip[hidden]{display:none}.tooltip strong{display:block;margin-bottom:4px;white-space:normal}.tooltip span{display:grid;grid-template-columns:9px minmax(0,1fr);column-gap:6px;margin-top:5px;white-space:normal}.tooltip i{display:block;width:9px;height:9px;margin:4px 0 0;border:0;border-radius:3px;flex-shrink:0;background:var(--series-color)}.tooltip b{font-weight:600;min-width:0;overflow-wrap:anywhere}.tooltip small{display:block;grid-column:2;color:var(--secondary-text-color,#666);font-size:10px;white-space:normal;font-variant-numeric:tabular-nums}`;
  }
  static publishHover(host, timestamp) {
    const group = this.hoverGroup(host);
    if (!group || !host.isConnected || !Number.isFinite(timestamp)) return;
    this.hoverState().set(group, {source: host, timestamp});
    window.dispatchEvent(new CustomEvent('eleven-cards:hover-sync', {detail: {source: host, group, timestamp}}));
  }
  static clearHover(host) {
    for (const [group, active] of this.hoverState()) {
      if (active.source !== host) continue;
      this.hoverState().delete(group);
      window.dispatchEvent(new CustomEvent('eleven-cards:hover-sync', {detail: {source: host, group, timestamp: null}}));
    }
  }
  static hoverSourceInEvent(host, event) {
    const active = this.hoverState().get(this.hoverGroup(host));
    return Boolean(active && event.composedPath().includes(active.source));
  }
  static restoreHover(host) {
    if (!host.isConnected) return;
    const active = this.hoverState().get(this.hoverGroup(host));
    if (active && host.isConnected) host._receiveSharedHover?.(active.timestamp);
  }
  static disconnectHover(host) {
    this.clearHover(host);
    if (host._sharedHoverListener) globalThis.window?.removeEventListener('eleven-cards:hover-sync', host._sharedHoverListener);
    for (const target of host._sharedScrollTargets ?? []) target.removeEventListener('scroll', host._sharedScrollListener, true);
    globalThis.window?.removeEventListener('resize', host._sharedScrollListener);
    host._sharedScrollTargets = [];
    host._sharedScrollListener = null;
    host._sharedHoverListener = null;
    host._receiveSharedHover = null;
  }
  static interpolation(value, fallback = 'smooth') {
    const mode = value == null || value === '' ? fallback : value;
    if (!['smooth', 'linear', 'step'].includes(mode)) throw new Error('line_interpolation');
    return mode;
  }
  static path(points, mode = 'smooth', end) {
    mode = this.interpolation(mode);
    let path = '', previous = null;
    for (const [x, y] of points) {
      if (!Number.isFinite(y)) {
        if (previous && end !== undefined) path += ` H ${x}`;
        previous = null;
        continue;
      }
      if (!previous) path += `${path ? ' ' : ''}M ${x} ${y}`;
      else if (mode === 'linear') path += ` L ${x} ${y}`;
      else if (mode === 'step') path += ` H ${x} V ${y}`;
      else {
        const middle = (previous[0] + x) / 2;
        path += ` C ${middle} ${previous[1]}, ${middle} ${y}, ${x} ${y}`;
      }
      previous = [x, y];
    }
    if (previous && end !== undefined) path += ` H ${end}`;
    return path;
  }
  render(host, {viewBox, defs = '', before = '', after = '', fills = [], lines = []}) {
    const previous = host.shadowRoot.querySelector('.chart-enter')?.getAnimations?.().find(a => a.animationName === 'chart-reveal' && a.playState !== 'finished' && Number(a.currentTime ?? 0) < 650);
    this.progress = Number(previous?.currentTime ?? 0);
    this.entering = Boolean(host.isConnected && (!this.loaded || previous) && lines.some(p => p.d));
    if (host.isConnected && lines.some(p => p.d)) this.loaded = true;
    const areas = fills.filter(p => p.d).map(p => `<path d="${graphAttribute(p.d)}" class="${graphAttribute(p.className)}"${p.fill ? ` fill="${graphAttribute(p.fill)}"` : ''}${p.opacity != null ? ` fill-opacity="${p.opacity}"` : ''}${p.mask ? ` mask="${graphAttribute(p.mask)}"` : ''}/>`).join('');
    const paths = lines.filter(p => p.d).map(p => {
      const a = p.appearance;
      const stroke = p.inlineStyle ? `style="stroke:${graphAttribute(a.stroke)};stroke-width:${a.width};stroke-dasharray:${a.dash};stroke-linecap:${a.cap}"` : `stroke="${graphAttribute(a.stroke)}" stroke-width="${a.width}" stroke-dasharray="${a.dash}" stroke-linecap="${a.cap}"`;
      return `<path d="${graphAttribute(p.d)}" class="${graphAttribute(p.className)}"${p.entity ? ` data-entity="${graphAttribute(p.entity)}"` : ''} ${stroke}/>`;
    }).join('');
    return `<svg viewBox="${viewBox}" preserveAspectRatio="none" aria-hidden="true">${defs}${before}<g class="chart-series${this.entering ? ' chart-enter' : ''}">${areas}${paths}</g>${after}</svg>`;
  }
  restore(host) {
    if (this.entering && this.progress > 0) {
      const animation = host.shadowRoot.querySelector('.chart-enter')?.getAnimations?.().find(a => a.animationName === 'chart-reveal');
      if (animation) animation.currentTime = this.progress;
    }
  }
}
function graphStyles() {
  return `
      .price-line, .series-line { fill: none; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
      .chart-enter { animation: chart-reveal 650ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      @keyframes chart-reveal {
        from { clip-path: inset(0 100% 0 0); }
        to { clip-path: inset(0 0 0 0); }
      }
      .hover-dot { position: absolute; z-index: 2; width: 12px; height: 12px; box-sizing: border-box; border: 3px solid; border-radius: 50%; transform: translate(-50%, -50%); background: var(--card-background-color); pointer-events: none; }
      @media (prefers-reduced-motion: reduce) { .chart-enter { animation: none; } }
  `;
}

// Calendar periods use the Home Assistant timezone, including DST boundaries.
const periodZoneFormats=new Map();
function periodLocalParts(t,zone){
 let format=periodZoneFormats.get(zone);
 if(!format){format=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});periodZoneFormats.set(zone,format);}
 return Object.fromEntries(format.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
}
function periodLocalEpoch(t,zone){const p=periodLocalParts(t,zone);return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
function periodMidnight(nominal,zone){
 let t=nominal;for(let i=0;i<6;i++){const next=nominal-(periodLocalEpoch(t,zone)-t);if(next===t)return t;t=next;}
 // Midnight can be skipped by a timezone transition. Use the first valid
 // instant of that local date rather than oscillating across the transition.
 let low=nominal-36*3600000,high=nominal+36*3600000;
 while(high-low>1000){const mid=Math.floor((low+high)/2000)*1000,p=periodLocalParts(mid,zone);if(Date.UTC(p.year,p.month-1,p.day)>=nominal)high=mid;else low=mid;}
 return high;
}
function graphPeriodBounds(t,period,zone='UTC'){
 zone ||= 'UTC';const p=periodLocalParts(t,zone),size={minute:60000,quarter_hour:900000,hour:3600000}[period];
 if(size){const local=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),a=t-(local%size)-(t%1000);return [a,a+size];}
 let nominal=Date.UTC(p.year,p.month-1,period==='month'?1:p.day);let next;
 if(period==='week'){const day=new Date(nominal).getUTCDay();nominal-=((day+6)%7)*86400000;next=nominal+7*86400000;}
 else if(period==='month')next=Date.UTC(p.year,p.month,1);
 else next=nominal+86400000;
 return [periodMidnight(nominal,zone),periodMidnight(next,zone)];
}
const periodCalendarModes=['today','week','month','quarter','year'];
const periodPresetHours={'1h':1,'6h':6,'12h':12,'24h':24,'48h':48,'7d':168,'14d':336,'30d':720,'90d':2160,'365d':8760};
function resetGraphPeriod(host){host._periodMode='configured';host._periodHours=null;host._periodEnd=null;host._periodOffset=0;host._periodAnchor=null;host._periodMenuOpen=false;host._periodMenuPending=false;host._insightPending=null;}
function graphPeriodRange(host,now=Date.now()){
 const mode=host._periodMode,offset=host._periodOffset??0;
 if(periodCalendarModes.includes(mode)){
  const zone=host._hass?.config?.time_zone||'UTC',p=periodLocalParts(host._periodAnchor??now,zone);
  let nominal,finishNominal;
  if(mode==='week'){
   nominal=Date.UTC(p.year,p.month-1,p.day);nominal+=(offset*7-(new Date(nominal).getUTCDay()+6)%7)*86400000;finishNominal=nominal+7*86400000;
  }else if(mode==='month'||mode==='quarter'){
   const size=mode==='quarter'?3:1,month=(mode==='quarter'?Math.floor((p.month-1)/3)*3:p.month-1)+offset*size;
   nominal=Date.UTC(p.year,month,1);finishNominal=Date.UTC(p.year,month+size,1);
  }else if(mode==='year'){nominal=Date.UTC(p.year+offset,0,1);finishNominal=Date.UTC(p.year+offset+1,0,1);}
  else{nominal=Date.UTC(p.year,p.month-1,p.day+offset);finishNominal=nominal+86400000;}
  const start=periodMidnight(nominal,zone),finish=periodMidnight(finishNominal,zone);
  return {start,end:Math.max(start+1,Math.min(now,finish))};
 }
 const end=host._periodEnd??now;
 return {start:end-(host._periodHours??host._config.hours_to_show)*3600000,end};
}
function chooseGraphPeriod(host,value){
 const calendar=value==='configured'||periodCalendarModes.includes(value),hours=periodPresetHours[value]??Number(value);
 if(!calendar&&(!Number.isFinite(hours)||hours<1||hours>8760))return;
 resetGraphPeriod(host);
 host._periodMode=calendar?value:Object.entries(periodPresetHours).find(([,h])=>h===hours)?.[0]??String(value);
 if(!calendar)host._periodHours=hours;
 return host._reloadPeriod();
}
function moveGraphPeriod(host,direction){
 if(![-1,0,1].includes(direction))return;
 if(direction===0){host._periodOffset=0;host._periodEnd=null;host._periodAnchor=null;}
 else{
  const previous=host._periodOffset??0;
  const calendar=periodCalendarModes.includes(host._periodMode);
  if(previous===0)host._periodAnchor=calendar?Date.now():host._status==='ready'?(host._end??Date.now()):Date.now();
  host._periodOffset=Math.min(0,previous+direction);
  if(host._periodOffset===0)host._periodAnchor=null;
  if(!calendar){
   host._periodEnd=host._periodOffset===0?null:host._periodAnchor+host._periodOffset*(host._periodHours??host._config.hours_to_show)*3600000;
  }
 }
 return host._reloadPeriod();
}

const periodEscape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function compactPeriodName({start,end,mode,past,zoomed,hours,name,locale,zone}){
 const format=options=>new Intl.DateTimeFormat(locale,{timeZone:zone,...options});
 const dates=format({year:'numeric',month:'numeric',day:'numeric'});
 const parts=t=>Object.fromEntries(dates.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 const a=parts(start),b=parts(end),currentYear=parts(Date.now()).year;
 const dayMonth=format({day:'numeric',month:'short'}),dayYear=format({day:'numeric',month:'short',year:'numeric'});
 const sameDay=a.year===b.year&&a.month===b.month&&a.day===b.day;
 const dateRange=(from,to)=>{
  const first=parts(from),last=parts(to),year=first.year!==currentYear?` ${first.year}`:'';
  if(first.year!==last.year)return `${dayYear.format(from)}–${dayYear.format(to)}`;
  if(first.month===last.month)return `${first.day===last.day?'':`${first.day}–`}${dayMonth.format(to)}${year}`;
  return `${dayMonth.format(from)}–${dayMonth.format(to)}${year}`;
 };
 if(zoomed||(past&&!['today','week','month','quarter','year'].includes(mode)&&hours<24)){
  const time=format({hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  if(sameDay){
   const offsets=format({timeZoneName:'shortOffset'}),offset=t=>offsets.formatToParts(t).find(p=>p.type==='timeZoneName')?.value;
   const clock=offset(start)!==offset(end)?format({hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'}):time;
   return `${(a.year===currentYear?dayMonth:dayYear).format(start)} · ${clock.format(start)}–${clock.format(end)}`;
  }
  if(end-start<48*3600000)return `${(a.year===b.year&&a.year===currentYear?dayMonth:dayYear).format(start)} ${time.format(start)}–${(a.year===b.year&&a.year===currentYear?dayMonth:dayYear).format(end)} ${time.format(end)}`;
  return dateRange(start,end);
 }
 if(mode==='month'){const month=format({month:'long',year:'numeric'}).format(start);return month[0].toLocaleUpperCase(locale)+month.slice(1);}
 if(mode==='quarter')return `Q${Math.ceil(a.month/3)} ${a.year}`;
 if(mode==='year')return String(a.year);
 if(mode==='week')return dateRange(start,Math.max(start,end-1));
 if(mode==='today')return past?dateRange(start,Math.max(start,end-1)):name;
 if(past)return `${dateRange(start,end)} · ${hours>=168&&hours%24===0?`${hours/24} ${locale==='nl-NL'?'dagen':'days'}`:`${hours} ${locale==='nl-NL'?'uur':hours===1?'hour':'hours'}`}`;
 return name;
}
function periodControls(host,language='en'){
 const active=host.shadowRoot.activeElement;
 if(!host._periodMenuPending)host._periodFocus=null;
 if(active?.closest?.('.header-actions'))host._periodFocus=active.dataset.periodOption!=null?`option:${active.dataset.periodOption}`:active.dataset.zoom!=null?`zoom:${active.dataset.zoom}`:active.classList.contains('history-link')?'history':active.dataset.period;
 if(host._config.show_navigation===false){host._periodMenuOpen=false;host._periodMenuPending=false;return {};}
 const previousMenu=host.shadowRoot.querySelector('.period-menu');
 if(previousMenu){
  host._periodMenuScroll=previousMenu.scrollTop;
  host._periodMenuOpen=!!host._periodMenuPending||(typeof previousMenu.showPopover==='function'?previousMenu.matches(':popover-open'):previousMenu.hasAttribute('data-fallback-open'));
 }
 const nl=language.startsWith('nl'),label=(en,nlText)=>nl?nlText:en,mode=host._periodMode??'configured',past=(host._periodOffset??0)<0;
 const standard=label(`Default (${host._config.hours_to_show} hours)`,`Standaard (${host._config.hours_to_show} uur)`);
 const rolling=[['1h',1],['6h',6],['12h',12],['24h',24],['48h',48],['7d',168],['14d',336],['30d',720],['90d',2160],['365d',8760]].map(([id,hours])=>[id,hours<168?label(`${hours} ${hours===1?'hour':'hours'}`,`${hours} uur`):label(`${hours/24} days`,`${hours/24} dagen`)]);
 const calendar=[['today',label('Today','Vandaag'),label('Day','Dag')],['week',label('This week','Deze week'),label('Week','Week')],['month',label('This month','Deze maand'),label('Month','Maand')],['quarter',label('This quarter','Dit kwartaal'),label('Quarter','Kwartaal')],['year',label('This year','Dit jaar'),label('Year','Jaar')]];
 if(host._periodHours!=null&&!rolling.some(([id])=>id===mode))rolling.push([mode,label(`${host._periodHours} hours`,`${host._periodHours} uur`)]);
 const calendarChoice=calendar.find(([id])=>id===mode),name=mode==='configured'?standard:calendarChoice?.[past?2:1]??rolling.find(([id])=>id===mode)?.[1]??standard;
 const choice=([value,text])=>`<button type="button" role="menuitemradio" aria-checked="${value===mode}" tabindex="-1" data-period-option="${periodEscape(value)}"><span>${periodEscape(text)}</span><span aria-hidden="true">${value===mode?'✓':''}</span></button>`;
 const {start,end}=host._status==='ready'&&Number.isFinite(host._viewStart)&&Number.isFinite(host._viewEnd)?{start:host._viewStart,end:host._viewEnd}:graphPeriodRange(host);
 const locale=nl?'nl-NL':'en-GB',zone=host._hass?.config?.time_zone||'UTC';
 const zoomed=host._status==='ready'&&(start>host._start+1||end<host._end-1);
 const compactName=compactPeriodName({start,end,mode,past,zoomed,hours:host._periodHours??host._config.hours_to_show,name,locale,zone});
 const format=new Intl.DateTimeFormat(locale,{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
 const range=`${format.format(start)} – ${format.format(end)}`;
 return {picker:`<div class="period-controls"><button type="button" class="period-trigger" data-period="menu" aria-haspopup="menu" aria-controls="eleven-period-menu" aria-expanded="${host._periodMenuOpen===true}" title="${periodEscape(range)}" aria-label="${label('Timeframe','Tijdvak')}: ${periodEscape(compactName)}" aria-description="${periodEscape(range)}${zoomed?`. ${label('Zoomed in','Ingezoomd')}`:''}"><span>${periodEscape(compactName)}</span>${cardHeaderIcon('down')}</button><div class="period-menu" id="eleven-period-menu" popover="auto" role="menu" aria-label="${label('Choose a period','Kies een periode')}"><div class="chart-popup-heading"><strong>${label('Timeframe','Tijdvak')}</strong><button type="button" role="menuitem" data-period="close" aria-label="${label('Close','Sluiten')}">×</button></div><div class="period-current-range">${periodEscape(range)}${zoomed?`<span class="zoom-status">${label('Zoomed in','Ingezoomd')}</span>`:''}</div><div class="period-default">${choice(['configured',standard])}</div><div class="period-menu-columns"><div role="group" aria-label="${label('Last','Afgelopen')}"><h3>${label('Last','Afgelopen')}</h3>${rolling.map(choice).join('')}</div><div role="group" aria-label="${label('Calendar','Kalender')}"><h3>${label('Calendar','Kalender')}</h3>${calendar.map(choice).join('')}<p>${label('From the start of the period until now. Use the arrows for previous periods.','Vanaf de start van het tijdvak tot nu. Gebruik de pijlen voor vorige perioden.')}</p></div></div></div></div>`,navigation:`<button type="button" data-period="previous" title="${label('Previous period','Vorige periode')}" aria-label="${label('Previous period','Vorige periode')}">${cardHeaderIcon('previous')}</button><button type="button" data-period="now" title="${label('Return to the current period','Terug naar de huidige periode')}">${label('Now','Nu')}</button><button type="button" data-period="next" title="${label('Next period','Volgende periode')}" aria-label="${label('Next period','Volgende periode')}"${past?'':' disabled'}>${cardHeaderIcon('next')}</button>`};
}
function restorePeriodFocus(host,items=[]){
 const key=host._periodFocus;if(!key)return;const root=host.shadowRoot;
 const target=key==='history'?root.querySelector('.history-link'):key.startsWith('zoom:')?root.querySelector('[data-zoom="'+key.slice(5)+'"]'):key.startsWith('option:')&&host._periodMenuOpen?items.find(item=>item.dataset.periodOption===key.slice(7)):root.querySelector('[data-period="'+(key.startsWith('option:')?'menu':key)+'"]');
 (target?.disabled?root.querySelector('[data-period="now"], [data-zoom="in"]:not(:disabled), .history-link'):target)?.focus?.({preventScroll:true});host._periodFocus=null;
}
function disconnectPeriodControls(host,preserveState=false){host._periodMenuCleanup?.();host._periodMenuCleanup=null;if(!preserveState)host._periodMenuPending=false;}
function bindPeriodControls(host){
 disconnectPeriodControls(host,true);
 const root=host.shadowRoot,nav=root.querySelector('.period-controls');if(!nav){restorePeriodFocus(host);return;}
 const menu=nav.querySelector('.period-menu'),trigger=nav.querySelector('[data-period="menu"]'),items=[...menu.querySelectorAll('[data-period-option]')],native=typeof menu.showPopover==='function';
 const cleanups=[];
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 host._periodMenuCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 const isOpen=()=>native?menu.matches(':popover-open'):menu.hasAttribute('data-fallback-open');
 let focusPending=false;
 const placement=bindCardPopupPosition(host,trigger,menu,()=>host._periodMenuOpen,()=>{
  host._periodMenuPending=false;
  if(native){if(!isOpen())menu.showPopover();}else menu.setAttribute('data-fallback-open','');
  if(focusPending){(items.find(item=>item.getAttribute('aria-checked')==='true')??items[0]).focus({preventScroll:true});focusPending=false;}
  restorePeriodFocus(host,items);
 }),position=placement.position;
 cleanups.push(()=>placement.disconnect());
 const close=(restore=false)=>{
  host._periodMenuOpen=false;host._periodMenuPending=false;trigger.setAttribute('aria-expanded','false');
  if(native){if(menu.matches(':popover-open'))menu.hidePopover();}else menu.removeAttribute('data-fallback-open');
  if(restore)trigger.focus({preventScroll:true});
 };
 const open=(focus=true)=>{
  closeOtherCardPopups(host,'period');
  host._periodMenuOpen=true;host._periodMenuPending=true;focusPending=focus;trigger.setAttribute('aria-expanded','true');
  position();
 };
 // Remember the pointer state before native light dismissal runs on pointerup.
 let pointerWasOpen;
 trigger.onpointerdown=()=>{pointerWasOpen=host._periodMenuOpen;};
 trigger.onpointercancel=()=>{pointerWasOpen=undefined;};
 trigger.onclick=()=>{const wasOpen=pointerWasOpen??host._periodMenuOpen;pointerWasOpen=undefined;wasOpen?close(true):open();};
 menu.querySelector('[data-period="close"]').onclick=()=>close(true);
 trigger.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();if(e.key==='ArrowUp')items.at(-1).focus({preventScroll:true});}};
 menu.addEventListener('toggle',e=>{if(host.shadowRoot.querySelector('.period-menu')!==menu)return;host._periodMenuOpen=e.newState==='open';trigger.setAttribute('aria-expanded',String(host._periodMenuOpen));});
 for(const item of items)item.onclick=()=>{close(true);chooseGraphPeriod(host,item.dataset.periodOption);};
 menu.onkeydown=e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
  if(e.key==='Tab'){e.preventDefault();close(true);if(!e.shiftKey)root.querySelector('.chart-controls button:not(:disabled)')?.focus();return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const index=items.indexOf(host.shadowRoot.activeElement),next=e.key==='Home'?0:e.key==='End'?items.length-1:index<0?(e.key==='ArrowUp'?items.length-1:0):(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();}
 };
 for(const [key,direction]of [['previous',-1],['next',1],['now',0]])root.querySelector(`[data-period="${key}"]`).onclick=()=>{close();moveGraphPeriod(host,direction);};
 listen(window,'resize',()=>{if(host._periodMenuOpen)position();});
 listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(menu))close();},true);
 listen(document,'pointerdown',e=>{if((!native||host._periodMenuPending)&&host._periodMenuOpen&&!e.composedPath().includes(nav))close();});
 if(host._periodMenuOpen){open(false);menu.scrollTop=host._periodMenuScroll??0;}
 if(!host._periodMenuPending)restorePeriodFocus(host,items);
}
function periodControlsStyles(){return `
.period-controls{display:flex;min-width:0;max-width:100%}
.header-actions .period-trigger{width:auto;max-width:100%;gap:6px;padding:4px 10px;border:0;border-radius:5px;background:var(--secondary-background-color,#eee);font-weight:400}
.header-actions .period-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-trigger span{min-width:0;overflow-wrap:anywhere}
.period-current-range{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;margin:2px 0 10px}
.period-current-range .zoom-status{display:table;margin-top:4px}
.period-menu:popover-open{display:block}
.period-menu[data-fallback-open]{display:block}
.period-menu-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.period-menu h3{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--secondary-text-color,#666);margin:8px}
.period-menu button{font:inherit;font-size:12px;color:var(--primary-text-color,#20252b);background:transparent;box-sizing:border-box;display:flex;border:1px solid transparent;border-radius:5px;cursor:pointer;height:auto;width:100%;justify-content:space-between;gap:8px;min-height:34px;border-color:transparent;text-align:start;padding:6px 8px;font-weight:400}
.period-menu button:hover{background:var(--secondary-background-color,#eee)}
.period-menu button:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.period-menu button[aria-checked="true"]{color:var(--primary-color,#2196f3);background:color-mix(in srgb,var(--primary-color,#2196f3) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-menu p{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);margin:10px 8px 2px;overflow-wrap:anywhere}
.period-default{border-bottom:1px solid var(--divider-color,#ddd);padding-bottom:8px;margin-bottom:8px}
`;}

const insightEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function chartZoomState(host){
 const total=host._end-host._start,ready=host._status==='ready'&&Number.isFinite(total)&&total>0;
 const a=Math.max(host._start,host._viewport?.[0]??host._start),b=Math.min(host._end,host._viewport?.[1]??host._end),width=Math.max(0,b-a);
 const zoomed=ready&&(a>host._start+1||b<host._end-1);
 return {zoomed,in:ready&&width>Math.min(60000,total)+1,out:ready&&width<total-1,reset:zoomed};
}
function chartEntityItems(host){return host._config.entities.map(id=>({id,name:host._config.series_options?.find(row=>row.entity===id)?.name||host._hass?.states?.[id]?.attributes?.friendly_name||id}));}
function chartSeriesVisible(host,index){return host._visibility?.get(host._config.entities[index])??true;}
function isolateChartSeries(host,id){
 if(!host._config.entities.includes(id))return;
 host._visibility=new Map(host._config.entities.map(entity=>[entity,entity===id]));host._hideTooltip?.();host._render();
}
function showAllChartSeries(host){host._visibility=new Map(host._config.entities.map(id=>[id,true]));host._hideTooltip?.();host._render();}
function cancelChartLegendClicks(host){for(const timer of host._legendClickTimers?.values()??[])clearTimeout(timer);host._legendClickTimers?.clear();}
function toggleChartIsolation(host,id){
 if(!host._config.entities.includes(id))return;
 cancelChartLegendClicks(host);
 const only=host._config.entities.every((entity,i)=>host._isSeriesVisible(i)===(entity===id));
 only?showAllChartSeries(host):isolateChartSeries(host,id);
 queueMicrotask(()=>host.shadowRoot.querySelector(`[data-series="${id}"]`)?.focus({preventScroll:true}));
}
function bindChartLegend(host){
 const nl=host._insightLanguage==='nl',hint=nl?'Dubbelklik of Shift+Enter: alleen deze sensor. Herhaal om alles te tonen.':'Double-click or Shift+Enter: show only this sensor. Repeat to show all.';
 for(const button of host.shadowRoot.querySelectorAll?.('[data-series]')??[]){
  const id=button.dataset.series;
  if(!button.title?.includes(hint))button.title=[button.title,hint].filter(Boolean).join(' ');button.setAttribute('aria-description',hint);button.setAttribute('aria-keyshortcuts','Shift+Enter Shift+Space');
  button.onclick=e=>{
   clearTimeout(host._legendClickTimers?.get(id));host._legendClickTimers?.delete(id);
   if(e.shiftKey||e.detail>1){e.preventDefault();toggleChartIsolation(host,id);return;}
   if(!e.detail){host._toggleSeries?host._toggleSeries(id):toggleChartIsolation(host,id);return;}
   // Keep the target alive until a second click can arrive: rendering after
   // the first click would replace it and break native double-click detection.
   if(host._toggleSeries){const config=host._config;host._legendClickTimers??=new Map();host._legendClickTimers.set(id,setTimeout(()=>{host._legendClickTimers.delete(id);if(host._config===config)host._toggleSeries(id);},300));}
  };
  button.ondblclick=e=>e.preventDefault();
  button.onkeydown=e=>{if(e.shiftKey&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();toggleChartIsolation(host,id);}};
 }
}
function insightControl(host,key,label,body,icon=''){
 return `<div class="insight-control"><button type="button" class="insight-trigger" data-insight="${key}" title="${insightEscape(label)}" aria-label="${insightEscape(label)}" aria-haspopup="dialog" aria-expanded="${host._insightOpen===key}" aria-controls="insight-${key}">${icon}${key==='data'?'':`<span>${insightEscape(label)}</span>`}</button><div id="insight-${key}" class="insight-popup" data-insight-panel="${key}" popover="auto" role="dialog" aria-label="${insightEscape(label)}"><div class="chart-popup-heading"><strong>${insightEscape(label)}</strong><button type="button" data-insight-close aria-label="${host._insightLanguage==='nl'?'Sluiten':'Close'}">×</button></div>${body}</div></div>`;
}
// Work on unstacked, undecimated values. A history value holds until the next
// point (null breaks coverage); bars have equal weight, regardless of bin length.
function chartValueStatistics(points,start,end,interval){
 let minimum=Infinity,maximum=-Infinity,sum=0,weight=0,count=0,covered=0,until=start;
 for(let i=0;i<points.length;i++){
  const p=points[i],[a,b]=interval?interval(p,i):[p.t,points[i+1]?.t??end];
  const left=Math.max(start,a,p.t),right=Math.min(end,b);
  if(right<=left||!Number.isFinite(p.v))continue;
  minimum=Math.min(minimum,p.v);maximum=Math.max(maximum,p.v);count++;
  const w=interval?1:right-left;sum+=p.v*w;weight+=w;
  const knownEnd=Math.min(right,points[i+1]?.t??end);
  covered+=Math.max(0,knownEnd-Math.max(left,until));until=Math.max(until,knownEnd);
 }
 return {minimum:count?minimum:null,maximum:count?maximum:null,average:weight?sum/weight:null,count,missing:covered<end-start-1};
}
function chartDataInformation(host,language='en'){
 const nl=language.startsWith('nl');host._insightLanguage=nl?'nl':'en';
 const load=host._lastLoad;
 const summary=host._status==='ready'?host._dataInformation?.():load?.summary;
 if(load&&summary&&host._status==='ready')load.summary=summary;
 const value=v=>{
  if(!Number.isFinite(v))return '—';
  const small=v!==0&&Math.abs(v)<.01,options=small?{maximumSignificantDigits:4}:{maximumFractionDigits:2};
  if(v!==0&&Math.abs(v)<.0001)options.notation='scientific';
  return insightEscape(new Intl.NumberFormat(language,options).format(Object.is(v,-0)?0:v));
 };
 let body=load?'':`<p role="status">${host._inFlight?(nl?'Laden…':'Loading…'):host._loadFailed?(nl?'Laadfout':'Load failed'):(nl?'Geen gegevens':'No data')}</p>`;
 if(load){
  body+=`<div class="insight-sensors">${chartEntityItems(host).map((item,i)=>{
   const source=load.sources.find(s=>s.id===item.id),row=summary?.rows.find(r=>r.id===item.id),hidden=!host._isSeriesVisible(i);
   const sourceLabel=source?(source.source==='statistics'?(nl?'Statistieken':'Statistics'):(nl?'Historie':'History')):(nl?'Niet geladen':'Not loaded');
   const unit=row?.unit??host._hass?.states?.[item.id]?.attributes?.unit_of_measurement??'';
   const metrics=row?.durations?`<dl class="insight-durations">${row.durations.map(s=>`<div><dt title="${insightEscape(s.missing?(nl?'Geen geschiedenis':'No history'):s.state)}">${insightEscape(s.label)}</dt><dd>${insightEscape(host._duration(s.duration))}</dd></div>`).join('')}</dl>`:row?`<dl class="insight-metrics${'total' in row?' has-total':''}">${[['minimum','Min'],['maximum','Max'],['average',nl?'Gem.':'Avg.']].map(([key,label])=>`<div><dt${key==='average'?` title="${nl?'Gemiddeld':'Average'}"`:''}>${label}</dt><dd data-metric="${key}">${value(row[key])}</dd></div>`).join('')}${'total' in row?`<div><dt title="${nl?'Som van volledige staven':'Sum of whole bars'}">${nl?'Som':'Sum'}</dt><dd data-metric="total">${value(row.total)}</dd></div>`:''}</dl>`:'';
   const states=[host._inFlight?(nl?'Vernieuwen…':'Refreshing…'):host._loadFailed?(nl?'Verouderd':'Outdated'):'',hidden?(nl?'Verborgen':'Hidden'):'',row?.limited?(nl?'Meer dan 20 statussen':'More than 20 states'):row?.count===0||source?.empty?(nl?'Geen gegevens':'No data'):row?.missing?(nl?'Onvolledig':'Incomplete'):''].filter(Boolean);
   return `<section class="insight-sensor" data-information-entity="${insightEscape(item.id)}"><div class="insight-sensor-heading"><strong>${insightEscape(item.name)}</strong><span class="insight-source">${sourceLabel}${unit?` <span class="insight-unit">· ${insightEscape(unit)}</span>`:''}</span></div>${metrics}${states.length?`<div class="insight-states" role="status">${states.join(' · ')}</div>`:''}</section>`;
  }).join('')}</div>`;
 }
 return insightControl(host,'data',nl?'Gegevens':'Data information',body,cardHeaderIcon('info'));
}
function captureChartInsights(host){
 const active=host.shadowRoot.activeElement;
 if(!host._insightPending)host._insightFocus=null;
 if(active?.closest?.('.insight-control'))host._insightFocus={key:active.closest('.insight-control').querySelector('[data-insight]')?.dataset.insight,inside:!!active.closest('.insight-popup'),entity:active.dataset.isolate,all:active.hasAttribute('data-show-all')};
 const popup=[...(host.shadowRoot.querySelectorAll?.('.insight-popup')??[])].find(panel=>typeof panel.showPopover==='function'?panel.matches(':popover-open'):panel.hasAttribute('data-fallback-open'));
 host._insightOpen=popup?.dataset.insightPanel??host._insightPending??null;
}
function disconnectChartInsights(host,keepLegendClicks=false){if(!keepLegendClicks){cancelChartLegendClicks(host);host._insightPending=null;}host._insightCleanup?.();host._insightCleanup=null;}
function restoreChartInsightFocus(host){
 if(!host._insightFocus||host._insightPending)return;
 const root=host.shadowRoot,{key,inside,entity,all}=host._insightFocus,popup=root.querySelector(`[data-insight-panel="${key}"]`),target=inside&&host._insightOpen===key?popup?.querySelector(entity?`[data-isolate="${entity}"]`:all?'[data-show-all]':'[data-insight-close]'):root.querySelector(`[data-insight="${key}"]`);
 if(target){target.focus?.({preventScroll:true});host._insightFocus=null;}
}
function bindChartInsights(host){
 disconnectChartInsights(host,true);
 const root=host.shadowRoot,cleanups=[];host._insightCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 for(const control of root.querySelectorAll?.('.insight-control')??[]){
  const trigger=control.querySelector('[data-insight]'),popup=control.querySelector('.insight-popup'),key=trigger.dataset.insight,native=typeof popup.showPopover==='function';
  const isOpen=()=>native?popup.matches(':popover-open'):popup.hasAttribute('data-fallback-open');
  let focusPending=false;
  const placement=bindCardPopupPosition(host,trigger,popup,()=>host._insightOpen===key,()=>{
   host._insightPending=null;
   if(native){if(!isOpen())popup.showPopover();}else popup.setAttribute('data-fallback-open','');
   if(focusPending){popup.querySelector('[data-insight-close]')?.focus({preventScroll:true});focusPending=false;}
   restoreChartInsightFocus(host);
  }),position=placement.position;
  cleanups.push(()=>placement.disconnect());
  const close=(focus=false)=>{if(host._insightOpen===key)host._insightOpen=null;host._insightPending=null;trigger.setAttribute('aria-expanded','false');if(native){if(isOpen())popup.hidePopover();}else popup.removeAttribute('data-fallback-open');if(focus)trigger.focus({preventScroll:true});};
  const open=(focus=true)=>{closeOtherCardPopups(host,'insight');host._insightOpen=key;host._insightPending=key;focusPending=focus;trigger.setAttribute('aria-expanded','true');position();};
  let pointerWasOpen;trigger.onpointerdown=()=>{pointerWasOpen=isOpen();};trigger.onpointercancel=()=>{pointerWasOpen=undefined;};
  trigger.onclick=()=>{const wasOpen=pointerWasOpen??isOpen();pointerWasOpen=undefined;wasOpen?close(true):open();};
  popup.querySelector('[data-insight-close]').onclick=()=>close(true);
  popup.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}};
  popup.addEventListener('toggle',e=>{if(root.querySelector(`[data-insight-panel="${key}"]`)!==popup)return;trigger.setAttribute('aria-expanded',String(e.newState==='open'));if(e.newState==='closed'&&host._insightOpen===key)host._insightOpen=null;});
  for(const button of popup.querySelectorAll('[data-isolate]'))button.onclick=()=>{close(true);isolateChartSeries(host,button.dataset.isolate);};
  const all=popup.querySelector('[data-show-all]');if(all)all.onclick=()=>{close(true);showAllChartSeries(host);};
  listen(window,'resize',()=>{if(isOpen()){if(trigger.getClientRects().length)position();else close();}});
  listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(popup))close();},true);
  listen(document,'pointerdown',e=>{if((!native||host._insightPending===key)&&host._insightOpen===key&&!e.composedPath().includes(control))close();});
  if(host._insightOpen===key)open(false);
 }
 restoreChartInsightFocus(host);
 if(host._insightFocus)listen(document,'pointerdown',e=>{if(!e.composedPath().includes(host)){host._insightFocus=null;host._insightOpen=null;host._insightPending=null;}},true);
 bindChartLegend(host);
}
function chartInsightStyles(){return `
.chart-context{display:flex;align-items:center;justify-content:space-between;gap:6px 12px;flex-wrap:wrap;flex:none;margin:0 0 8px;min-width:0}
.chart-range{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;min-width:0;flex:1}
.chart-range .period-panel{margin:0}
.zoom-status{font-size:11px;color:var(--primary-text-color,#20252b);background:var(--secondary-background-color,#eee);border-radius:4px;padding:2px 6px;white-space:nowrap}
.insight-control{display:inline-flex;flex:none}
.insight-trigger{font:inherit;font-size:11px;min-height:28px;padding:3px 7px;display:flex;align-items:center;gap:5px;border:0;border-radius:5px;background:transparent;color:var(--primary-text-color,#20252b);cursor:pointer}
.insight-trigger svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.insight-trigger:hover{background:var(--secondary-background-color,#eee)}
.header-actions .insight-trigger{width:32px;height:32px;padding:0;background:var(--secondary-background-color,#eee);border-radius:5px}
.header-actions .insight-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.header-actions .insight-trigger svg{width:18px;height:18px;stroke-width:2}
.insight-trigger:focus-visible,.insight-popup button:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.insight-popup{z-index:21}
.insight-popup:popover-open{display:block}
.insight-popup[data-fallback-open]{display:block}
.insight-popup button{display:block;box-sizing:border-box;width:auto;height:auto;padding:0;font:inherit;cursor:pointer;color:inherit;background:transparent;border:0;border-radius:5px;min-height:30px}
.insight-popup button:disabled{opacity:.4;cursor:default}
.insight-popup button:hover{background:var(--secondary-background-color,#eee)}
.insight-popup p{margin:8px 0 12px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-popup p strong{color:var(--primary-text-color,#20252b);font-weight:500}
.insight-popup .insight-choice{display:block;width:100%;padding:6px 8px;text-align:start;overflow-wrap:anywhere}
.insight-choice[aria-pressed="true"]{background:var(--secondary-background-color,#eee);font-weight:600}
.insight-sensors{display:grid}
.insight-sensor{min-width:0;padding:8px 0}
.insight-sensor+.insight-sensor{border-top:1px solid var(--divider-color,#ddd)}
.insight-sensor-heading{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 8px}
.insight-sensor-heading>strong{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:600}
.insight-source{font-size:10px;font-weight:400;color:var(--secondary-text-color,#666);color:color-mix(in srgb,var(--secondary-text-color,#666) 90%,var(--ha-card-background,var(--card-background-color,#fff)));flex:none}
.insight-unit{white-space:nowrap}
.insight-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 8px;margin:6px 0 0}
.insight-metrics.has-total{grid-template-columns:repeat(4,minmax(0,1fr))}
.insight-metrics>div{min-width:0}
.insight-metrics dt{font-size:10px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-metrics dd{margin:1px 0 0;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;color:var(--primary-text-color,#20252b)}
.insight-states{font-size:10px;color:var(--secondary-text-color,#666);margin-top:4px}
.insight-durations{margin:6px 0 0;display:grid;gap:4px}
.insight-durations>div{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:12px}
.insight-durations dt{min-width:0;overflow-wrap:anywhere;color:var(--secondary-text-color,#666)}
.insight-durations dd{margin:0;color:var(--primary-text-color,#20252b);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
[data-series]{touch-action:manipulation}
`;}

// Sum elapsed time by the original state, keeping missing history separate
// even when it shares a display label with a recorded unknown state.
function timelineStateDurations(series,start,end){
 const totals=new Map();
 for(const s of series){
  const duration=Math.max(0,Math.min(end,s.end)-Math.max(start,s.start));
  if(!duration)continue;
  const key=s.missing?null:s.state;
  if(!totals.has(key))totals.set(key,{state:s.state,missing:!!s.missing,duration:0});
  totals.get(key).duration+=duration;
 }
 return [...totals.values()];
}
function segments(rows,start,end){
 const points=rows.map((r,i)=>({t:Date.parse(r.last_changed??r.last_updated),state:String(r.state??'unknown'),i})).filter(p=>Number.isFinite(p.t)&&p.t<=end).sort((a,b)=>a.t-b.t||a.i-b.i);
 let state='unknown',cursor=start;const result=[];
 for(const p of points){if(p.t<=start){state=p.state;continue;}if(p.state===state)continue;if(p.t>cursor)result.push({start:cursor,end:p.t,state});cursor=p.t;state=p.state;}
 if(cursor<end)result.push({start:cursor,end,state});return result;
}

const escapeTimeline=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TimelineView={
 _historyUrl(){const range=graphPeriodRange(this),ready=this._status==='ready';const end=this._viewport?.[1]??(ready?this._end:range.end)??range.end,start=this._viewport?.[0]??(ready?this._start:range.start)??range.start;return `/history?entity_id=${encodeURIComponent(this._config.entities.join(','))}&start_date=${encodeURIComponent(new Date(start).toISOString())}&end_date=${encodeURIComponent(new Date(end).toISOString())}`;},
 _setPeriod(hours){return chooseGraphPeriod(this,String(hours));},
 _navigate(direction){return moveGraphPeriod(this,direction);},
 _reloadPeriod(){this._generation++;this._inFlight=false;this._viewport=null;this._hideTooltip();clearTimeout(this._timer);this._status='loading';this._render();return this._refresh();},
 _ticks(){const width=this.shadowRoot.host?.clientWidth??600,count=width<400?3:5;return Array.from({length:count},(_,i)=>i/(count-1));},
 _segmentAppearance(s,id){return s.missing?{label:this._nl()?'Geen geschiedenis':'No history',color:'transparent'}:this._appearance(s.state,id);},
 _dataInformation(){
  const start=this._viewStart,end=this._viewEnd;
  return {start,end,rows:this._config.entities.map((id,i)=>{
   const durations=timelineStateDurations(this._series[i]??[],start,end).map(s=>({...s,label:this._segmentAppearance(s,id).label}));
   const known=durations.filter(s=>!s.missing);
   return {id,durations,count:known.length,missing:known.reduce((sum,s)=>sum+s.duration,0)<end-start-1,limited:!!this._stateLimits?.[i]};
  })};
 },
 _summary(index){const totals=new Map();for(const s of this._series[index]??[]){const ms=Math.max(0,Math.min(s.end,this._viewEnd)-Math.max(s.start,this._viewStart)),label=this._segmentAppearance(s,this._config.entities[index]).label;if(ms)totals.set(label,(totals.get(label)??0)+ms);}return [...totals].map(([label,ms])=>`${label}: ${this._duration(ms)}`).join(' · ');},
 _stateLimitMessage(){return this._nl()?'Maximaal 20 verschillende statussen per entiteit. Deze entiteit heeft er meer in de gekozen periode.':'Maximum 20 distinct states per entity. This entity has more in the selected period.';},
 _name(id){return this._config.series_options.find(x=>x.entity===id)?.name??this._hass?.states?.[id]?.attributes?.friendly_name??id;},
 _duration(ms){const minutes=Math.floor(ms/60000);return minutes<1?'<1 min':minutes<60?`${minutes} min`:`${Math.floor(minutes/60)}${this._nl()?'u':'h'} ${minutes%60} min`;},
 _zoom(factor){
  this._hideTooltip();if(!factor)this._viewport=null;
  else{const a=this._viewport?.[0]??this._start,b=this._viewport?.[1]??this._end,width=Math.min(this._end-this._start,Math.max(60000,(b-a)*factor)),center=(a+b)/2,start=Math.max(this._start,Math.min(this._end-width,center-width/2));this._viewport=[start,start+width];}
  this._render();
 },
 _receiveHover(t){if(t===null||!Number.isFinite(t)||t<this._viewStart||t>this._viewEnd){this._hideTooltip(false);return;}this._showTooltip(t,false);},
 _hideTooltip(publish=true){if(publish)SharedGraph.clearHover(this);this._pointerFocusPending=null;this._cursor=null;this._pinned=false;for(const cls of ['tooltip','guide']){const el=this.shadowRoot.querySelector('.'+cls);if(el)el.hidden=true;}},
 _showTooltip(t,publish=true){
  if(!SharedGraph.tooltipInView(this)){this._hideTooltip(publish);return;}
  const chart=this.shadowRoot.querySelector('.chart'),tooltip=chart?.querySelector('.tooltip'),guide=chart?.querySelector('.guide');if(!tooltip)return;
  this._cursor=t;const nl=this._nl(),a=this._viewStart,b=this._viewEnd,esc=escapeTimeline;
  tooltip.innerHTML=`<strong>${esc(this._time(t))}</strong>`+this._config.entities.map((id,i)=>{if(!this._isSeriesVisible(i)||this._stateLimits?.[i])return '';const s=(this._series[i]??[]).find(s=>s.start<=t&&(t<s.end||(t===b&&s.end===b))),v=s?this._segmentAppearance(s,id):{label:nl?'Geen geschiedenis':'No history',color:'transparent'};return `<span><i style="background:${v.color}"></i><b class="tooltip-label">${esc(this._name(id))}: <em class="tooltip-value">${esc(v.label)}</em></b>${s?`<small>${esc(this._time(s.start))} – ${esc(this._time(s.end))} · ${esc(this._duration(s.end-s.start))}</small>`:''}</span>`;}).join('');
  tooltip.hidden=false;tooltip.style.pointerEvents=this._pinned?'auto':'none';const box=chart.getBoundingClientRect(),px=(t-a)/(b-a)*box.width;
  if(guide){guide.hidden=false;guide.style.left=`${px}px`;}
  tooltip.style.maxHeight=`${Math.min(360,(window.innerHeight??480)-16)}px`;
  const measured=tooltip.getBoundingClientRect();let left=px+14;if(left+measured.width>box.width-4)left=px-measured.width-14;tooltip.style.left=`${Math.max(4,Math.min(box.width-measured.width-4,left))}px`;tooltip.style.top=`${Math.max(8-box.top,Math.min(0,(window.innerHeight??480)-box.top-measured.height-8))}px`;
  if(publish)SharedGraph.publishHover(this,t);
 },
 _bindInteractions(){
  const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;
  const timestamp=e=>{const r=chart.getBoundingClientRect();return this._viewStart+Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*(this._viewEnd-this._viewStart);};
  let drag=null;const selection=chart.querySelector('.zoom-selection');
  chart.onpointermove=e=>{if(drag&&Math.abs(e.clientX-drag.x)>=6){this._hideTooltip();const r=chart.getBoundingClientRect(),x=Math.max(r.left,Math.min(r.right,e.clientX));selection.hidden=false;selection.style.left=`${(Math.min(drag.x,x)-r.left)/r.width*100}%`;selection.style.width=`${Math.abs(x-drag.x)/r.width*100}%`;}else if(!this._pinned&&e.pointerType!=='touch')this._showTooltip(timestamp(e));};
  chart.onpointerdown=e=>{if(e.target?.closest?.('[data-series],.tooltip')||(e.button??0)!==0)return;this._pointerFocusPending=e.target?.closest?.('.segment')??null;this._pinned=true;this._showTooltip(timestamp(e));if(e.pointerType==='mouse'){drag={x:e.clientX,t:timestamp(e)};chart.setPointerCapture?.(e.pointerId);}};
  chart.onpointerup=e=>{selection.hidden=true;if(drag){const d=drag;drag=null;if(Math.abs(e.clientX-d.x)>=6){const t=timestamp(e),a=Math.min(d.t,t),b=Math.max(d.t,t);if(b-a>=60000){this._hideTooltip();this._viewport=[a,b];this._render();}}}};
  chart.onpointercancel=()=>{drag=null;selection.hidden=true;this._hideTooltip();};chart.onlostpointercapture=()=>{drag=null;selection.hidden=true;};chart.onpointerleave=()=>{if(!this._pinned&&!drag)this._hideTooltip();};
  chart.onkeydown=e=>{this._pointerFocusPending=null;if(e.key==='Escape'){drag=null;selection.hidden=true;this._hideTooltip();return;}if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const times=[...new Set([this._viewStart,...this._series.flatMap((s,i)=>this._isSeriesVisible(i)?s.map(v=>v.start):[]).filter(t=>t>this._viewStart&&t<this._viewEnd),this._viewEnd])].sort((a,b)=>a-b);let i=times.findIndex(t=>t>=(this._cursor??this._viewStart));if(i<0)i=times.length-1;i=e.key==='Home'?0:e.key==='End'?times.length-1:Math.max(0,Math.min(times.length-1,i+(e.key==='ArrowRight'?1:-1)));this._pinned=true;this._showTooltip(times[i]);};
  chart.onfocusout=e=>{if(!chart.contains(e.relatedTarget))this._hideTooltip();};this.shadowRoot.querySelectorAll('.segment').forEach(button=>{button.onfocus=()=>{const fromPointer=this._pointerFocusPending===button;this._pointerFocusPending=null;if(fromPointer&&this._cursor!=null)return;this._pinned=true;this._showTooltip(Number(button.dataset.time));};});
 },
 _render(){
  if(!this._config)return;captureChartInsights(this);const c=this._config,nl=this._nl(),esc=escapeTimeline;this._viewStart=this._viewport?.[0]??this._start;this._viewEnd=this._viewport?.[1]??this._end;const a=this._viewStart,b=this._viewEnd;let body='';const controls=cardHeader({title:c.title??(nl?'Statustijdlijn':'Status timeline'),showTitle:c.show_title!==false,ready:this._status==='ready',historyUrl:this._historyUrl(),language:nl?'nl':'en',periods:periodControls(this,nl?'nl':'en'),zoomState:chartZoomState(this),information:chartDataInformation(this,nl?'nl':'en')});
  if(this._status!=='ready')body=`<div class="message" role="status">${this._status==='error'?(nl?'Geschiedenis kon niet worden geladen.':'Unable to load history.'):(nl?'Geschiedenis laden…':'Loading history…')}${this._status==='error'?`<button class="retry">${nl?'Opnieuw proberen':'Retry'}</button>`:''}</div>`;
  else{

   const legend=new Map(),rows=c.entities.map((id,i)=>{if(!this._isSeriesVisible(i))return '';const name=this._name(id),label=`<button type="button" class="row-label" data-series="${esc(id)}">${esc(name)}</button>`;if(this._stateLimits?.[i])return `<div class="row">${label}<div class="state-limit" role="status">${esc(this._stateLimitMessage())}</div></div>`;const bars=(this._series[i]??[]).filter(s=>s.end>a&&s.start<b).map(s=>{const v=this._segmentAppearance(s,id);legend.set(v.label+'|'+v.color,v);const start=Math.max(a,s.start),end=Math.min(b,s.end),description=`${name}: ${v.label}, ${this._time(s.start)} – ${this._time(s.end)} · ${this._duration(s.end-s.start)}`;return `<button class="segment ${['unknown','unavailable'].includes(s.state)?'gap':''}" style="left:${(start-a)/(b-a)*100}%;width:${(end-start)/(b-a)*100}%;background-color:${v.color};color:${v.textColor??'inherit'}" aria-label="${esc(description)}" data-time="${start}">${c.show_state_labels?`<span>${esc(v.label)}</span>`:''}</button>`;}).join('');return `<div class="row">${c.show_labels?`${label}`:''}<div class="track">${bars}</div>${c.show_summary?`<div class="summary">${esc(this._summary(i))}</div>`:''}</div>`;}).join('');
   body=`<div class="chart" tabindex="0" role="group" aria-label="${nl?'Statustijdlijn':'Status timeline'}">${c.show_grid!==false?this._ticks().map(r=>`<div class="grid-line" style="left:${r*100}%"></div>`).join(''):''}${rows}<div class="guide" hidden></div><div class="zoom-selection" hidden></div><div class="tooltip" role="status" hidden></div></div>`;
   if(c.show_axis)body+=`<div class="axis">${this._ticks().map(r=>`<span>${esc(this._time(a+(b-a)*r))}</span>`).join('')}</div>`;
   if(c.show_legend)body+=`<div class="legend">${[...legend.values()].map(v=>`<span><i style="background:${v.color}"></i>${esc(v.label)}</span>`).join('')}</div>`;
  }
  this.shadowRoot.innerHTML=`<style>:host{display:block;min-width:0}ha-card{display:block;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font-family:inherit;height:100%}
.content{padding:16px 16px 12px;box-sizing:border-box;position:relative}
${cardHeaderStyles()}
${periodControlsStyles()}
${chartInsightStyles()}
@media(max-width:480px){.content{padding:12px 12px 10px}}
.chart{position:relative;touch-action:pan-y;min-width:0}
.grid-line{position:absolute;top:0;bottom:0;border-left:1px solid var(--divider-color,#ddd);opacity:.45;pointer-events:none}
.row{position:relative}
.row-label{position:relative;width:fit-content;background:var(--ha-card-background,var(--card-background-color,#fff))}
.summary{margin-top:6px;font-size:11px;color:var(--secondary-text-color,#666);background:var(--ha-card-background,var(--card-background-color,#fff));position:relative;overflow-wrap:anywhere}
.row+.row{margin-top:${c.row_gap}px}
.row-label{font-size:12px;color:var(--secondary-text-color,#666);margin-bottom:7px;overflow-wrap:anywhere}
.row-label[data-series]{display:block;max-width:100%;padding:0;border:0;text-align:start;font-family:inherit;cursor:pointer}
.row-label[data-series]:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:2px}
.track{position:relative;height:${c.bar_height}px;border-radius:${c.border_radius}px;overflow:hidden;background:var(--divider-color,#ddd)}
.segment{position:absolute;top:0;height:100%;padding:0;border:0;border-right:1px solid #ffffff24;box-sizing:border-box;cursor:pointer;color:white;min-width:0;overflow:hidden;font:11px inherit}
.segment span{padding:0 6px;white-space:nowrap}
.segment:focus-visible{outline:2px solid var(--primary-text-color,#222);outline-offset:-2px;z-index:1}
.gap{background-image:repeating-linear-gradient(135deg,transparent,transparent 4px,#ffffff40 4px,#ffffff40 8px)}
.axis{display:flex;justify-content:space-between;gap:8px;margin-top:10px;font-size:11px;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums}
.legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:16px;font-size:12px;color:var(--secondary-text-color,#666)}
.legend span{display:flex;align-items:center;gap:6px;overflow-wrap:anywhere}
.legend i,.tooltip i{width:9px;height:9px;border-radius:3px;flex-shrink:0}
.guide{position:absolute;top:0;bottom:0;border-left:1px solid var(--primary-text-color,#20252b);opacity:.6;pointer-events:none;z-index:2}
.zoom-selection{position:absolute;top:0;bottom:0;background:color-mix(in srgb,var(--primary-color,#2196f3) 18%,transparent);border-inline:1px solid var(--primary-color,#2196f3);pointer-events:none;z-index:3}
${SharedGraph.tooltipStyles()}
.tooltip .tooltip-label{color:var(--secondary-text-color,#666)}
.tooltip .tooltip-value{color:var(--primary-text-color,#20252b);font-style:normal}
.state-limit{font-size:12px;color:var(--error-color,#db4437);overflow-wrap:anywhere;position:relative}
.message{font-size:14px;color:var(--secondary-text-color,#666);min-height:60px}
.retry{display:block;margin-top:12px;min-height:44px;background:transparent;color:inherit;border:1px solid var(--divider-color,#ddd);border-radius:6px;padding:8px 12px}[hidden]{display:none}</style><ha-card><div class="content">${controls}${body}</div></ha-card>`;
  bindPeriodControls(this);bindChartInsights(this);
  const retry=this.shadowRoot.querySelector('.retry');if(retry)retry.onclick=()=>this._refresh();this.shadowRoot.querySelectorAll('[data-zoom]').forEach(button=>button.onclick=()=>this._zoom({in:.5,out:2,reset:0}[button.dataset.zoom]));this._bindInteractions();const renderedChart=this.shadowRoot.querySelector('.chart'),restoreTooltip=()=>{if(this.shadowRoot.querySelector('.chart')===renderedChart){SharedGraph.restoreHover(this);if(this._cursor!=null)this._showTooltip(this._cursor,false);}};const ready=this.shadowRoot.querySelector('ha-card')?.updateComplete;if(ready?.then)ready.then(restoreTooltip);else restoreTooltip();
 }
};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={entities:'Entiteiten op de tijdlijn',title:'Titel (optioneel)',hours_to_show:'Afgelopen aantal uren',bar_height:'Balkdikte (px)',border_radius:'Afronding (px)',row_gap:'Ruimte tussen balken (px)',state_colors:'Statuskleur toevoegen',show_labels:'Naam boven elke balk tonen',show_legend:'Legenda met statuskleuren tonen',show_axis:'Tijden onder de balken tonen',show_state_labels:'Statusnaam in de balk tonen',default_color:'Terugvalkleur (optioneel)',series_options:'Aangepaste naam toevoegen'};
const helpers={entities:'Elke entiteit krijgt één balk, in de gekozen volgorde. Kies 1–16 entiteiten met statusgeschiedenis.',hours_to_show:'Terugkijkperiode: 24 = één dag, 168 = één week. Alleen opgeslagen Home Assistant-geschiedenis is beschikbaar.',state_colors:'Gebruik de echte statuswaarde, bijvoorbeeld on, off, home of not_home. Zonder entiteit geldt de kleur voor alle balken; met entiteit alleen voor die balk. Een specifieke kleur gaat voor een algemene kleur. De weergavenaam is optioneel.',default_color:'Alleen voor statussen zonder eigen kleurregel. Leeg laten gebruikt de ingebouwde statuskleuren.',show_state_labels:'Op korte tijdvakken past niet altijd tekst. Details blijven beschikbaar door een tijdvak aan te tikken.',series_options:'Optioneel: wijzig de naam van een hierboven gekozen entiteit. Dit voegt geen extra balk toe. Zonder aanpassing wordt de Home Assistant-naam gebruikt.',bar_height:'Hoogte van elke statusbalk, van 4 tot 80 pixels.',border_radius:'Rondt de buitenhoeken van de volledige balk af.',row_gap:'Verticale ruimte tussen de rijen.'};
function color(v,fallback='#607d94'){if(Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&n>=0&&n<=255))return `rgb(${v.join(',')})`;return typeof v==='string'&&/^(#[\da-f]{3,8}|[a-z]+|var\(--[\w-]+\))$/i.test(v)?v:fallback;}
Object.assign(labels,{entity:'Entiteit',name:'Weergavenaam (optioneel)',state_colors:'Statusregels',timeline_settings:'Tijdlijn',status_settings:'Algemene statusregels',bar_settings:'Balkopmaak'});
Object.assign(helpers,{state_colors:'Gebruik de echte statuswaarde, bijvoorbeeld on, off, home of not_home. Eigen regels gaan voor algemene regels. Dubbele statuswaarden zijn niet toegestaan.',status_settings:'Deze regels gelden voor alle entiteiten, tenzij de entiteit een eigen regel voor dezelfde status heeft.'});
Object.assign(labels,{show_title:'Titel tonen',sync_hover:'Hover synchroniseren',hover_sync_group:'Hover-synchronisatiegroep'});
Object.assign(helpers,{sync_hover:'Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.',hover_sync_group:'Kaarten met dezelfde groep volgen elkaar. Leeg gebruikt de standaardgroep.'});
const timelineEnglish={
 'Titel tonen':'Show title',
 'Hover synchroniseren':'Synchronize hover','Hover-synchronisatiegroep':'Hover synchronization group',
 'Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.':'Shares the selected time with other Eleven graphs on this page.',
 'Kaarten met dezelfde groep volgen elkaar. Leeg gebruikt de standaardgroep.':'Cards with the same group follow each other. Empty uses the default group.',
 'Tijdlijn':'Timeline','Algemene statusregels':'Common state rules','Balkopmaak':'Bar appearance','Entiteiten':'Entities','Entiteit':'Entity',
 'Weergavenaam (optioneel)':'Display name (optional)','Statusregels':'State rules','Titel (optioneel)':'Title (optional)',
 'Afgelopen aantal uren':'Hours to show','Balkdikte (px)':'Bar height (px)','Afronding (px)':'Corner radius (px)','Ruimte tussen balken (px)':'Row gap (px)',
 'Naam boven elke balk tonen':'Show name above each bar','Legenda met statuskleuren tonen':'Show state legend','Tijden onder de balken tonen':'Show time axis','Statusnaam in de balk tonen':'Show state labels inside bars','Terugvalkleur (optioneel)':'Fallback color (optional)',
 'Statuswaarde (bijv. on of home)':'State value (e.g. on or home)','Kleur':'Color','Entiteit toevoegen':'Add entity','Nieuwe entiteit':'New entity','Omhoog':'Move up','Omlaag':'Move down','Verwijderen':'Remove',
 'Kies 1–16 unieke entiteiten.':'Choose 1–16 unique entities.','Dubbele statusregel':'Duplicate state rule',
 'Gebruik de echte statuswaarde, bijvoorbeeld on, off, home of not_home. Eigen regels gaan voor algemene regels. Dubbele statuswaarden zijn niet toegestaan.':'Use the actual state value, e.g. on, off, home or not_home. Entity rules override common rules. Duplicate states are not allowed.',
 'Deze regels gelden voor alle entiteiten, tenzij de entiteit een eigen regel voor dezelfde status heeft.':'These rules apply to all entities unless an entity has its own rule for the same state.',
 'Terugkijkperiode: 24 = één dag, 168 = één week. Alleen opgeslagen Home Assistant-geschiedenis is beschikbaar.':'History window: 24 = one day, 168 = one week. Only recorded Home Assistant history is available.',
 'Alleen voor statussen zonder eigen kleurregel. Leeg laten gebruikt de ingebouwde statuskleuren.':'Only for states without a matching color rule. Empty uses the built-in state colors.',
 'Op korte tijdvakken past niet altijd tekst. Details blijven beschikbaar door een tijdvak aan te tikken.':'Short segments may not fit text. Tap a segment to view its details.',
 'Hoogte van elke statusbalk, van 4 tot 80 pixels.':'Height of every state bar, from 4 to 80 pixels.',
 'Rondt de buitenhoeken van de volledige balk af.':'Rounds the outer corners of the whole bar.',
 'Verticale ruimte tussen de rijen.':'Vertical space between rows.'
};
Object.assign(labels,{show_grid:'Grid tonen',show_summary:'Statusduur per entiteit tonen',show_navigation:'Tijdvakselectie tonen'});
Object.assign(timelineEnglish,{'Grid tonen':'Show grid','Statusduur per entiteit tonen':'Show state duration per entity','Tijdvakselectie tonen':'Show timeframe selection'});
function timelineText(s,hass){const h=hass??(typeof document==='undefined'?undefined:document.querySelector('home-assistant')?.hass);return (h?.locale?.language??h?.language??'nl').startsWith('nl')?s:timelineEnglish[s]??s;}
Object.assign(helpers,{show_grid:'Toon verticale tijdlijnen achter de statusbalken. Aslabels en statusbalken blijven zichtbaar.',show_navigation:'Toon het tijdvakmenu, vorige/volgende, Nu en het gekozen datumbereik.'});
Object.assign(timelineEnglish,{'Toon verticale tijdlijnen achter de statusbalken. Aslabels en statusbalken blijven zichtbaar.':'Show vertical time grid lines behind the state bars. Axis labels and state bars remain visible.','Toon het tijdvakmenu, vorige/volgende, Nu en het gekozen datumbereik.':'Show the timeframe menu, previous/next, Now and the selected date range.'});
function validateTimeline(c,hass){
 for(const key of ['show_grid','show_navigation'])if(c[key]!==undefined&&typeof c[key]!=='boolean')throw Error(key);
 if(c.sync_hover!=null&&typeof c.sync_hover!=='boolean')throw Error('sync_hover');
 if(c.hover_sync_group!=null&&typeof c.hover_sync_group!=='string')throw Error('hover_sync_group');
 if(!Array.isArray(c.entities)||!c.entities.length||c.entities.length>16||new Set(c.entities).size!==c.entities.length||c.entities.some(id=>typeof id!=='string'||!/^\w+\.\w+$/.test(id)))throw Error(timelineText('Kies 1–16 unieke entiteiten.',hass));
 const keys=new Set();for(const r of c.state_colors??[]){const key=JSON.stringify([r.entity??'',String(r.state)]);if(keys.has(key))throw Error(timelineText('Dubbele statusregel',hass)+': '+(r.entity??'')+' / '+r.state);keys.add(key);}
}
class TimelineSettingsEditor extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});}
 setConfig(c){this._data=TimelineCard.editorConfig(c);this._render();}
 set hass(h){this._hass=h;this._render();}get hass(){return this._hass;}connectedCallback(){this._render();}
 _emit(){try{const c=TimelineCard.cardConfig(this._data);validateTimeline(c,this._hass);this._error='';this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:c},bubbles:true,composed:true}));}catch(e){this._error=e.message;}this._render();}
 _bind(form,definition,data){form.hass=this._hass;form.schema=definition.schema;form.data=data;form.computeLabel=s=>definition.computeLabel.call(this,s);form.computeHelper=s=>definition.computeHelper.call(this,s);}
 _render(){
  if(!this._data||!this._hass)return;
  const label=s=>timelineText(s,this._hass);
  if(!this._form){
   this.shadowRoot.innerHTML='<style>:host{display:block;min-width:0}h3{font-size:16px;margin:24px 0 12px}details{border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);margin:12px 0;min-width:0}summary{cursor:pointer;padding:12px;min-height:44px;box-sizing:border-box;overflow-wrap:anywhere}summary small{display:block;color:var(--secondary-text-color)}.body{padding:0 12px 12px;min-width:0}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}button{font:inherit;color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:6px;min-height:44px;padding:8px 12px;cursor:pointer}button:disabled{opacity:.45}.remove{margin-left:auto;color:var(--error-color)}summary:focus-visible,button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}.error{color:var(--error-color);overflow-wrap:anywhere}</style><ha-form class="timeline-form"></ha-form><h3></h3><div class="entities"></div><button class="add" type="button"></button><p class="error" role="alert"></p><ha-form class="common-form"></ha-form>';
   this._form=this.shadowRoot.querySelector('.timeline-form');this._common=this.shadowRoot.querySelector('.common-form');
   for(const f of [this._form,this._common])f.addEventListener('value-changed',e=>{e.stopPropagation();this._data={...this._data,...e.detail.value,entities:this._data.entities};this._emit();});
   this.shadowRoot.querySelector('.add').onclick=()=>{if(this._data.entities.length>=16)return;this._data={...this._data,entities:[...this._data.entities,{entity:'',state_colors:[]}]};this._openNew=true;this._render();};
  }
  const f=TimelineCard.getConfigForm();this._bind(this._form,{...f,schema:f.schema.slice(0,1)},this._data);this._bind(this._common,{...f,schema:f.schema.slice(1)},this._data);
  this.shadowRoot.querySelector('h3').textContent=label('Entiteiten');const add=this.shadowRoot.querySelector('.add');add.textContent=label('Entiteit toevoegen');add.disabled=this._data.entities.length>=16;
  this.shadowRoot.querySelector('.error').textContent=this._error??'';
  const container=this.shadowRoot.querySelector('.entities');while(container.children.length>this._data.entities.length)container.lastElementChild.remove();
  this._data.entities.forEach((r,i)=>{
   let entry=container.children[i];if(!entry){entry=document.createElement('details');entry.className='entity-entry';entry.innerHTML='<summary><span></span><small></small></summary><div class="body"><ha-form></ha-form><div class="actions"><button class="up" type="button"></button><button class="down" type="button"></button><button class="remove" type="button"></button></div></div>';container.append(entry);entry.open=this._data.entities.length===1||!!this._openNew;
    entry.querySelector('ha-form').addEventListener('value-changed',e=>{e.stopPropagation();const rows=[...this._data.entities];rows[i]={...rows[i],...e.detail.value};this._data={...this._data,entities:rows};this._emit();});
    entry.querySelector('.remove').onclick=()=>{this._data={...this._data,entities:this._data.entities.filter((_,n)=>n!==i)};this._emit();};
    for(const [key,delta]of [['up',-1],['down',1]])entry.querySelector('.'+key).onclick=()=>{const rows=[...this._data.entities],j=i+delta;if(j<0||j>=rows.length)return;[rows[i],rows[j]]=[rows[j],rows[i]];this._data={...this._data,entities:rows};this._emit();};
   }
   entry.querySelector('summary span').textContent=r.name||this._hass.states?.[r.entity]?.attributes?.friendly_name||r.entity||label('Nieuwe entiteit');entry.querySelector('small').textContent=r.entity;
   for(const [key,text]of [['up','Omhoog'],['down','Omlaag'],['remove','Verwijderen']]){const b=entry.querySelector('.'+key);b.textContent=label(text);b.disabled=key==='up'?i===0:key==='down'?i===this._data.entities.length-1:false;}
   this._bind(entry.querySelector('ha-form'),TimelineCard.getEntityConfigForm(r,this._hass),r);
  });this._openNew=false;
 }
}
class TimelineCard extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});this._generation=0;this._status='loading';this._series=[];}
 static getStubConfig(hass){return {entities:Object.keys(hass?.states??{}).filter(id=>/^(binary_sensor|person|input_boolean|switch)\./.test(id)).slice(0,1),hours_to_show:24};}
 static editorConfig(c={}){
  const clone=v=>Array.isArray(v)?v.map(clone):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])):v;
  const data=clone({hours_to_show:24,bar_height:18,border_radius:5,row_gap:16,show_labels:true,show_legend:true,show_title:true,show_axis:true,show_state_labels:false,show_grid:true,show_summary:false,show_navigation:true,sync_hover:true,hover_sync_group:'',state_colors:[],series_options:[],...c});
  const ids=data.entities??[];
  data._orphan_colors=data.state_colors.filter(r=>r.entity&&!ids.includes(r.entity));
  data._orphan_options=data.series_options.filter(r=>!ids.includes(r.entity));
  data.entities=ids.map(entity=>({...data.series_options.find(r=>r.entity===entity),entity,state_colors:data.state_colors.filter(r=>r.entity===entity).map(({entity,...rule})=>rule)}));
  data.state_colors=data.state_colors.filter(r=>!r.entity);delete data.series_options;return data;
 }
 static cardConfig(d){
  const {_orphan_colors=[],_orphan_options=[],...config}=d;
  config.entities=d.entities.filter(r=>r.entity).map(r=>r.entity);
  config.series_options=[..._orphan_options,...d.entities.filter(r=>r.entity).map(({state_colors,name,...r})=>({...r,...(name?{name}:{})}))];
  config.state_colors=[...d.state_colors,..._orphan_colors,...d.entities.filter(r=>r.entity).flatMap(r=>(r.state_colors??[]).map(rule=>({...rule,entity:r.entity})))];
  return JSON.parse(JSON.stringify(config));
 }
 static _form(schema){return {schema,computeLabel:function(s){return timelineText(labels[s?.name]??s?.title??s?.name??'',this?.hass);},computeHelper:function(s){return helpers[s?.name]?timelineText(helpers[s.name],this?.hass):undefined;}};}
 static _rules(row={},hass){const current=hass?.states?.[row.entity];const options=[...new Set(['on','off','home','not_home','unknown','unavailable',...(current?.attributes?.options??[]),...(row.state_colors??[]).map(r=>String(r.state)),...(current?.state?[current.state]:[])])];return {object:{multiple:true,label_field:'state',fields:{
  state:{get label(){return timelineText('Statuswaarde (bijv. on of home)');},required:true,selector:{select:{options,custom_value:true}}},
  color:{get label(){return timelineText('Kleur');},required:true,selector:{color_rgb:{}}},
  label:{get label(){return timelineText('Weergavenaam (optioneel)');},selector:{text:{}}}
 }}};}
 static getEntityConfigForm(row,hass){return this._form([
  {name:'entity',required:true,selector:{entity:{}}},{name:'name',selector:{text:{}}},
  {name:'state_colors',selector:this._rules(row,hass)}
 ]);}
 static getConfigForm(){
  const num=(name,min,max,def)=>({name,default:def,selector:{number:{min,max,step:1,mode:'box',unit_of_measurement:name==='hours_to_show'?'h':'px'}}});
  const group=(name,title,schema)=>({type:'expandable',name,get title(){return timelineText(title);},flatten:true,schema});
  return this._form([
   group('timeline_settings','Tijdlijn',[
    {name:'title',selector:{text:{}}},num('hours_to_show',1,8760,24),
    ...['show_title','show_labels','show_axis','show_legend','show_state_labels','show_grid','show_summary','show_navigation','sync_hover'].map(name=>({name,default:!['show_state_labels','show_summary'].includes(name),selector:{boolean:{}}})),
    {name:'hover_sync_group',selector:{text:{}}}
   ]),
   group('status_settings','Algemene statusregels',[{name:'state_colors',selector:this._rules()},{name:'default_color',selector:{color_rgb:{}}}]),
   group('bar_settings','Balkopmaak',[num('bar_height',4,80,18),num('border_radius',0,40,5),num('row_gap',0,64,16)])
  ]);
 }
 static async getConfigElement(){
  if(!customElements.get('ha-form')){const helpers=await window.loadCardHelpers(),card=await helpers.createCardElement({type:'entities',entities:[]});await card.constructor.getConfigElement();await customElements.whenDefined('ha-form');}
  if(!customElements.get('eleven-timeline-editor'))customElements.define('eleven-timeline-editor',TimelineSettingsEditor);
  return document.createElement('eleven-timeline-editor');
 }
 setConfig(c){validateTimeline(c,this._hass);if(!Array.isArray(c.entities)||!c.entities.length||c.entities.length>16||c.entities.some(id=>typeof id!=='string'||!/^\w+\.\w+$/.test(id)))throw Error('Kies 1–16 entiteiten.');const config={hours_to_show:24,bar_height:18,border_radius:5,row_gap:16,show_labels:true,show_legend:true,show_title:true,show_axis:true,show_state_labels:false,show_grid:true,show_summary:false,show_navigation:true,sync_hover:true,hover_sync_group:'',state_colors:[],series_options:[],...c};for(const [k,min,max] of [['hours_to_show',1,8760],['bar_height',4,80],['border_radius',0,40],['row_gap',0,64]])if(!Number.isFinite(config[k])||config[k]<min||config[k]>max)throw Error(`Ongeldige ${k}`);for(const k of ['state_colors','series_options'])if(!Array.isArray(config[k])||config[k].some(x=>!x||typeof x!=='object'))throw Error(`Ongeldige ${k}`);SharedGraph.clearHover(this);this._lastLoad=null;this._loadFailed=false;this._insightOpen=null;this._visibility=new Map();this._config={...config,hover_sync_group:config.hover_sync_group??''};this._viewport=null;resetGraphPeriod(this);this._hideTooltip();this._generation++;this._inFlight=false;this._series=[];this._stateLimits=[];this._status='loading';clearTimeout(this._timer);this._render();if(this._connected&&this._hass)this._refresh();}
 set hass(h){this._hass=h;if(this._config){this._render();if(this._connected&&!this._started)this._refresh();}}
 get hass(){return this._hass;}
 connectedCallback(){this._connected=true;SharedGraph.connectHover(this,t=>this._receiveHover(t));this._outside??=e=>{if(!e.composedPath().includes(this)&&!SharedGraph.hoverSourceInEvent(this,e))this._hideTooltip();};globalThis.document?.addEventListener('pointerdown',this._outside);if(this._config&&this._hass)this._refresh();}
 disconnectedCallback(){disconnectChartInsights(this);disconnectPeriodControls(this);SharedGraph.disconnectHover(this);globalThis.document?.removeEventListener('pointerdown',this._outside);this._hideTooltip();this._connected=false;this._started=false;this._inFlight=false;this._generation++;clearTimeout(this._timer);}
 getCardSize(){return Math.ceil((90+(this._config?.entities.length??1)*((this._config?.bar_height??18)+(this._config?.row_gap??16)+24))/50);}
 getGridOptions(){return {columns:12,min_columns:6};}
 _isSeriesVisible(index){return chartSeriesVisible(this,index);}
 _nl(){return (this._hass?.locale?.language??this._hass?.language??'nl').startsWith('nl');}
 _time(t,full=false){try{return new Intl.DateTimeFormat(this._nl()?'nl-NL':'en-GB',{hour:'2-digit',minute:'2-digit',...(full||(this._viewEnd-this._viewStart)>86400000?{day:'2-digit',month:'short'}:{}),timeZone:this._hass?.config?.time_zone}).format(t);}catch{return new Date(t).toLocaleTimeString();}}
 _semanticColor(state,id){
  const defaults={on:'#0072b2',off:'#8b949e',home:'#009e73',not_home:'#e69f00',unknown:'#767676',unavailable:'#b64e86'};
  if(id?.startsWith('binary_sensor.')&&['on','off'].includes(state)){
   const deviceClass=this._hass?.states?.[id]?.attributes?.device_class;
   if(['battery','carbon_monoxide','gas','moisture','problem','safety','smoke','tamper'].includes(deviceClass))return state==='on'?'#d55e00':'#009e73';
   if(['door','garage_door','opening','window','lock'].includes(deviceClass))return state==='on'?'#e69f00':deviceClass==='lock'?'#009e73':'#8b949e';
   if(deviceClass==='connectivity')return state==='on'?'#009e73':'#d55e00';
  }
  if(id?.startsWith('lock.'))return {locked:'#009e73',unlocked:'#e69f00',locking:'#0072b2',unlocking:'#cc79a7',jammed:'#d55e00'}[state]??defaults[state];
  if(id?.startsWith('cover.'))return {open:'#0072b2',closed:'#8b949e',opening:'#009e73',closing:'#e69f00'}[state]??defaults[state];
  return defaults[state];
 }
 _categoricalColor(state,id){
  const palette=['#4477aa','#ee7733','#228833','#cc6677','#aa3377','#66ccee','#997700','#882255','#44aa99','#332288','#ddaa33','#6699cc','#aa4499','#117733','#ddcc77','#88ccee','#cc3311','#7777bb','#bb8844','#44bbbb'];
  const series=this._series?.[this._config.entities.indexOf(id)];
  const hash=value=>{let n=2166136261;for(const ch of value)n=Math.imul(n^ch.charCodeAt(0),16777619);return n>>>0;};
  if(!series)return palette[hash(state)%palette.length];
  this._categoryColors??=new WeakMap();let colors=this._categoryColors.get(series);
  if(!colors){
   colors=new Map();const used=new Set(),states=[...new Set(series.filter(s=>!s.missing&&!this._semanticColor(String(s.state),id)).map(s=>String(s.state)))].sort();
   for(const value of states){let index=hash(value)%palette.length;while(used.has(index)&&used.size<palette.length)index=(index+1)%palette.length;used.add(index);colors.set(value,palette[index]);}
   this._categoryColors.set(series,colors);
  }
  return colors.get(state)??palette[hash(state)%palette.length];
 }
 _textColor(background){
  let rgb;if(/^#[\da-f]{6}$/i.test(background))rgb=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16));
  else if(/^#[\da-f]{3}$/i.test(background))rgb=[...background.slice(1)].map(ch=>parseInt(ch+ch,16));
  else if(/^rgb\([\d., ]+\)$/.test(background))rgb=background.slice(4,-1).split(',').map(Number);
  if(!rgb||rgb.length!==3)return '#ffffff';
  const linear=rgb.map(n=>{const s=n/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}),luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
  return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#ffffff';
 }
 _appearance(state,id){const m=this._config.state_colors.find(x=>String(x.state)===state&&x.entity===id)??this._config.state_colors.find(x=>String(x.state)===state&&!x.entity),background=color(m?.color,color(this._config.default_color,this._semanticColor(state,id)??this._categoricalColor(state,id)));return {label:m?.label??(state==='unknown'?(this._nl()?'Onbekend':'Unknown'):state==='unavailable'?(this._nl()?'Niet beschikbaar':'Unavailable'):state),color:background,textColor:this._textColor(background)};}
 async _refresh(){if(!this._connected||!this._hass||!this._config||this._inFlight)return;clearTimeout(this._timer);this._inFlight=true;this._started=true;const generation=++this._generation,c=this._config,{start,end}=graphPeriodRange(this);let timeout;try{const q=new URLSearchParams({filter_entity_id:c.entities.join(','),end_time:new Date(end).toISOString(),minimal_response:'',no_attributes:''});const response=await Promise.race([this._hass.callApi('GET',`history/period/${new Date(start).toISOString()}?${q}`),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('timeout')),15000);timeout.unref?.();})]);if(!this._connected||generation!==this._generation)return;if(!Array.isArray(response))throw Error('Invalid history');this._start=start;this._end=end;this._stateLimits=[];this._series=c.entities.map((id,index)=>{const rows=response.find(rows=>rows?.[0]?.entity_id===id)??[],states=new Set();for(const row of rows){if(row.state==null)continue;states.add(String(row.state));if(states.size>20){this._stateLimits[index]=true;return [];}}const result=segments(rows,start,end),first=Math.min(...rows.map(r=>Date.parse(r.last_changed??r.last_updated)).filter(Number.isFinite));if(result[0]?.state==='unknown'&&first>start){if(first<result[0].end)result.unshift({...result[0],end:first,missing:true}),result[1]={...result[1],start:first};else result[0]={...result[0],missing:true};}return result;});this._loadFailed=false;this._lastLoad={at:Date.now(),start,end,sources:c.entities.map((id,i)=>({id,source:'history',empty:!this._series[i]?.some(s=>!s.missing)}))};this._status='ready';}catch{if(generation===this._generation){this._loadFailed=true;this._status='error';}}finally{clearTimeout(timeout);if(this._connected&&generation===this._generation){this._inFlight=false;this._render();this._timer=setTimeout(()=>this._refresh(),60000);this._timer.unref?.();}}}
}
Object.assign(TimelineCard.prototype,TimelineView);
if(!customElements.get('eleven-timeline-card'))customElements.define('eleven-timeline-card',TimelineCard);
window.customCards??=[];if(!window.customCards.some(c=>c.type==='eleven-timeline-card'))window.customCards.push({type:'eleven-timeline-card',name:'Eleven Timeline Card',description:'Horizontal status history with configurable bars and colors.',preview:true});


})();

;
// Eleven Overview (beta) 0.1.0 — self-contained standalone module
(()=>{
function historyUrl(ids,start,end){return `history/period/${new Date(start).toISOString()}?filter_entity_id=${encodeURIComponent(ids.join(','))}&end_time=${encodeURIComponent(new Date(end).toISOString())}`;}
function historySeries(rows,start,end,unit){
 const data=(rows??[]).map(r=>({t:Date.parse(r.last_updated??r.last_changed),v:(r.attributes?.unit_of_measurement??'')===(unit??'')?numeric(r.state):null})).filter(r=>Number.isFinite(r.t)&&r.t<=end).sort((a,b)=>a.t-b.t);
 const before=data.filter(r=>r.t<=start).at(-1),points=before?[{t:start,v:before.v}]:[];
 for(const r of data)if(r.t>start)points.push(r);
 if(points.length)points.push({t:end,v:points.at(-1).v});
 return {points,baseline:before?.v??null};
}
function delta(series,current){return series?.baseline!=null&&current!=null?current-series.baseline:null;}
function sparkline(points,start,end){
 const values=points.filter(p=>p.v!=null).map(p=>p.v);if(!values.length||end<=start)return '';
 let min=Infinity,max=-Infinity;for(const v of values){min=Math.min(min,v);max=Math.max(max,v);}
 const span=max-min;let path='',prior=null;
 for(const p of points){const x=2+Math.max(0,Math.min(1,(p.t-start)/(end-start)))*296;if(p.v==null){if(prior)path+=`H${x.toFixed(2)}`;prior=null;continue;}const y=span?44-(p.v-min)/span*40:24;
 path+=prior==null?`M${x.toFixed(2)},${y.toFixed(2)}`:`H${x.toFixed(2)}V${y.toFixed(2)}`;prior=p;}
 return path;
}
const PALETTE=['#2196f3','#e78a14','#ab70d9','#26a69a','#e66b91','#718cc2','#a18d3a','#718d78'];
function numeric(value){if(typeof value!=='number'&&(typeof value!=='string'||!value.trim()||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim())))return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function color(value,fallback=PALETTE[0]){if(Array.isArray(value)&&value.length===3&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255))return `rgb(${value.join(',')})`;return typeof value==='string'&&/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)?value:fallback;}
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function normalizeConfig(input,{draft=false}={}){
 const entities=(input.entities??[]).map((row,i)=>typeof row==='string'?{entity:row,color:PALETTE[i]}:{...row,color:Array.isArray(row.color)?[...row.color]:row.color??PALETTE[i]});
 if(!draft&&(!entities.length||entities.length>8||entities.some(r=>!/^sensor\.[a-z0-9_]+$/.test(r.entity))||new Set(entities.map(r=>r.entity)).size!==entities.length))throw Error('Select 1–8 unique sensor entities. / Kies 1–8 unieke sensoren.');
 const hours=input.hours_to_show??24,columns=String(input.columns??'auto');
 if(!Number.isFinite(hours)||hours<1||hours>168)throw Error('Period must be 1–168 hours. / Periode moet 1–168 uur zijn.');
 if(!['auto','1','2','3'].includes(columns))throw Error('Columns must be auto, 1, 2 or 3.');
 return {...input,type:'custom:eleven-overview-card',title:input.title??'Eleven Overview (beta)',hours_to_show:hours,columns,show_graph:input.show_graph!==false,show_delta:input.show_delta!==false,entities};
}


const esc=escapeHtml;
const nl=h=>String(h?.locale?.language??h?.language??'en').startsWith('nl');
const labels={title:['Titel','Title'],hours_to_show:['Periode (uur)','Period (hours)'],columns:['Kolommen','Columns'],show_graph:['Trendlijnen tonen','Show sparklines'],show_delta:['Verandering tonen','Show change'],entity:['Sensor','Sensor'],name:['Naam','Name'],color:['Kleur','Color']};
function form(schema){return {schema,computeLabel:function(s){return labels[s.name]?.[nl(this?.hass)?0:1]??s.name;}};}
class OverviewEditor extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});}
 setConfig(c){this._config=normalizeConfig(c,{draft:true});this._render();}
 set hass(h){this._hass=h;this._render();}get hass(){return this._hass;}
 _emit(){this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...this._config,entities:this._config.entities.filter(r=>r.entity).map(r=>({...r,color:Array.isArray(r.color)?[...r.color]:r.color}))}},bubbles:true,composed:true}));}
 _bind(node,definition,data){node.hass=this._hass;node.schema=definition.schema;node.data=data;node.computeLabel=s=>definition.computeLabel.call(this,s);}
 _render(){
  if(!this._config||!this._hass)return;const dutch=nl(this._hass);
  if(!this._form){this.shadowRoot.innerHTML=`<style>:host{display:block;min-width:0}h3{font-size:16px;margin:24px 0 12px}details{border:1px solid var(--divider-color);border-radius:12px;margin:12px 0;min-width:0}summary{padding:12px;min-height:44px;box-sizing:border-box;cursor:pointer;overflow-wrap:anywhere}.body{padding:0 12px 12px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}button{font:inherit;min-height:44px;border:1px solid var(--divider-color);border-radius:6px;padding:8px 12px;background:var(--card-background-color);color:var(--primary-text-color);cursor:pointer}button:disabled{opacity:.4}button:focus-visible,summary:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}.remove{margin-left:auto}</style><ha-form class="global"></ha-form><h3></h3><div class="sensors"></div><button class="add" type="button"></button>`;
   this._form=this.shadowRoot.querySelector('.global');this._form.addEventListener('value-changed',e=>{e.stopPropagation();this._config=normalizeConfig({...this._config,...e.detail.value,entities:this._config.entities},{draft:true});this._emit();});
   this.shadowRoot.querySelector('.add').onclick=()=>{if(this._config.entities.length>=8)return;this._config={...this._config,entities:[...this._config.entities,{entity:'',color:PALETTE[this._config.entities.length]}]};this._render();this.shadowRoot.querySelector('.sensors').lastElementChild.open=true;};
  }
  this._bind(this._form,OverviewCard.getConfigForm(),this._config);this.shadowRoot.querySelector('h3').textContent=dutch?'Sensoren':'Sensors';const add=this.shadowRoot.querySelector('.add');add.textContent=dutch?'Sensor toevoegen':'Add sensor';add.disabled=this._config.entities.length>=8;
  const container=this.shadowRoot.querySelector('.sensors');while(container.children.length>this._config.entities.length)container.lastElementChild.remove();
  this._config.entities.forEach((r,i)=>{let entry=container.children[i];if(!entry){entry=document.createElement('details');entry.innerHTML='<summary></summary><div class="body"><ha-form></ha-form><div class="actions"><button class="up" type="button"></button><button class="down" type="button"></button><button class="remove" type="button"></button></div></div>';container.append(entry);entry.open=this._config.entities.length===1;
   entry.querySelector('ha-form').addEventListener('value-changed',e=>{e.stopPropagation();const rows=this._config.entities.map((row,j)=>j===i?{...row,...e.detail.value}:row);this._config={...this._config,entities:rows};this._render();this._emit();});
   for(const [key,d] of [['up',-1],['down',1],['remove',0]])entry.querySelector('.'+key).onclick=()=>{const rows=[...this._config.entities];if(key==='remove')rows.splice(i,1);else{const j=i+d;if(j<0||j>=rows.length)return;[rows[i],rows[j]]=[rows[j],rows[i]];}this._config={...this._config,entities:rows};this._render();this._emit();};
  }
  entry.querySelector('summary').textContent=r.name||this._hass.states?.[r.entity]?.attributes?.friendly_name||r.entity||(dutch?'Nieuwe sensor':'New sensor');this._bind(entry.querySelector('ha-form'),OverviewCard.getSensorForm(),r);
  for(const [key,title] of [['up',dutch?'Omhoog':'Move up'],['down',dutch?'Omlaag':'Move down'],['remove',dutch?'Verwijderen':'Remove']]){const b=entry.querySelector('.'+key);b.textContent=title;b.disabled=key==='up'?i===0:key==='down'?i===this._config.entities.length-1:false;}
  });
 }
}
class OverviewCard extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});this._generation=0;this._history={};this._units={};this._status='loading';this._connected=false;this._timer=null;this._readings=new Map();this._animationFrame=null;}
 static getConfigForm(){return form([{name:'title',selector:{text:{}}},{name:'hours_to_show',selector:{number:{min:1,max:168,step:1,mode:'box'}}},{name:'columns',selector:{select:{mode:'dropdown',options:[{value:'auto',label:'Auto'},{value:'1',label:'1'},{value:'2',label:'2'},{value:'3',label:'3'}]}}},{name:'show_graph',selector:{boolean:{}}},{name:'show_delta',selector:{boolean:{}}}]);}
 static getSensorForm(){return form([{name:'entity',required:true,selector:{entity:{domain:'sensor'}}},{name:'name',selector:{text:{}}},{name:'color',selector:{color_rgb:{}}}]);}
 static async getConfigElement(){if(!customElements.get('ha-form')){const helpers=await window.loadCardHelpers();const card=await helpers.createCardElement({type:'entities',entities:[]});await card.constructor.getConfigElement();await customElements.whenDefined('ha-form');}if(!customElements.get('eleven-overview-editor'))customElements.define('eleven-overview-editor',OverviewEditor);return document.createElement('eleven-overview-editor');}
 static getStubConfig(hass){return {title:'Eleven Overview (beta)',hours_to_show:24,entities:Object.entries(hass?.states??{}).filter(([id,s])=>id.startsWith('sensor.')&&numeric(s.state)!=null).slice(0,4).map(([id])=>id)};}
 setConfig(config){this._stopAnimation();this._config=normalizeConfig(config);this._generation++;this._promise=null;this._history={};this._status='loading';clearTimeout(this._timer);this._render();if(this._connected)this._refresh();}
 set hass(h){this._hass=h;this._render();if(this._connected&&!this._promise&&this._status==='loading')this._refresh();}get hass(){return this._hass;}
 connectedCallback(){this._connected=true;this._refresh();}
 disconnectedCallback(){this._stopAnimation();this._connected=false;this._generation++;this._promise=null;clearTimeout(this._timer);this._timer=null;}
 getCardSize(){return 1+Math.ceil((this._config?.entities.length??1)/2)*2;}
 getGridOptions(){return {columns:12,min_columns:6};}
 // Only the visual reading is interpolated; sensor values remain authoritative.
 _stopAnimation(){if(this._animationFrame!=null)cancelAnimationFrame(this._animationFrame);this._animationFrame=null;this._readings.clear();}
 _reading(id,target,unit){
  const previous=this._readings.get(id),reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(!this._connected||typeof requestAnimationFrame!=='function'||reduced||target==null||previous?.value==null||previous.unit!==unit){this._readings.set(id,{value:target,target,unit});return target;}
  if(previous.target!==target){this._readings.set(id,{value:previous.value,from:previous.value,target,unit,start:null});this._queueAnimation();}
  return this._readings.get(id).value;
 }
 _queueAnimation(){
  if(this._animationFrame!=null||!this._connected)return;
  this._animationFrame=requestAnimationFrame(time=>{
   this._animationFrame=null;let pending=false;
   const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
   for(const entry of this._readings.values()){
    if(entry.value===entry.target)continue;
    entry.start??=time;const progress=reduced?1:Math.min(1,(time-entry.start)/320);
    // Damped spring: quick acceleration, <1% overshoot, exact 320ms finish.
   const x=10*progress,damping=0.85,frequency=Math.sqrt(1-damping*damping);
   const eased=1-Math.exp(-damping*x)*(Math.cos(frequency*x)+damping/frequency*Math.sin(frequency*x));
   entry.value=progress===1?entry.target:entry.from+(entry.target-entry.from)*eased;
    pending ||= progress<1;
   }
   // Avoid rebuilding charts or disturbing focus on animation frames.
   this.shadowRoot.querySelectorAll('.metric').forEach(node=>{const entry=this._readings.get(node.dataset.entity);if(entry?.value!=null)node.querySelector('.value').textContent=this._format(entry.value,entry.target);});
   if(pending)this._queueAnimation();
  });
 }
 _format(value,target){const locale=this._hass?.locale?.language??this._hass?.language??'en',reference=target??value;try{const formatter=new Intl.NumberFormat(locale,Math.abs(reference)>0&&Math.abs(reference)<0.01?{maximumSignificantDigits:3}:{maximumFractionDigits:2});if(target===undefined)return formatter.format(value);const digits=formatter.formatToParts(reference).find(part=>part.type==='fraction')?.value.length??0;return new Intl.NumberFormat(locale,{maximumFractionDigits:digits}).format(value);}catch{return String(value);}}
 _refresh(){
  if(!this._connected||!this._hass||!this._config)return Promise.resolve();if(this._promise)return this._promise;
  clearTimeout(this._timer);const generation=this._generation,end=Date.now(),start=end-this._config.hours_to_show*3600000,ids=this._config.entities.map(r=>r.entity),hass=this._hass;
  const units=Object.fromEntries(ids.map(id=>[id,hass.states?.[id]?.attributes?.unit_of_measurement??'']));
  let requestTimer;const work=(async()=>{try{const data=await Promise.race([hass.callApi('GET',historyUrl(ids,start,end)),new Promise((_,reject)=>{requestTimer=setTimeout(()=>reject(Error('History timeout')),15000);})]);if(!this._connected||generation!==this._generation)return;
    const grouped=new Map((data??[]).filter(r=>r.length).map(r=>[r[0].entity_id,r]));this._history=Object.fromEntries(ids.map(id=>[id,historySeries(grouped.get(id),start,end,units[id])]));this._units=units;this._start=start;this._end=end;this._status='ready';
   }catch{if(generation===this._generation&&this._connected)this._status='error';}
   finally{clearTimeout(requestTimer);if(generation===this._generation&&this._connected){this._promise=null;this._render();this._timer=setTimeout(()=>this._refresh(),60000);}}
  })();this._promise=work;return work;
 }
 _render(){
  if(!this._config)return;const c=this._config,dutch=nl(this._hass),focus=this.shadowRoot.activeElement?.dataset.entity;
  const period=`${c.hours_to_show} ${dutch?'uur':'hours'}`,cells=c.entities.map((row,i)=>{
   const s=this._hass?.states?.[row.entity],v=numeric(s?.state),unit=s?.attributes?.unit_of_measurement??'',name=row.name||s?.attributes?.friendly_name||row.entity,displayValue=this._reading(row.entity,v,unit);
   const history=this._status==='ready'&&this._units[row.entity]===unit?this._history[row.entity]:null,change=delta(history,v),path=history?sparkline(history.points,this._start,this._end):'';
   const status=!s?(dutch?'Sensor niet gevonden':'Entity not found'):v==null?(dutch?'Niet beschikbaar':'Unavailable'):'';
   const graphStatus=this._status==='loading'?(dutch?'Geschiedenis laden…':'Loading history…'):this._status==='error'?(dutch?'Geen geschiedenis geladen':'History not loaded'):dutch?'Geen geschiedenis':'No history';
   const difference=change==null?(dutch?'Geen vergelijkingspunt':'No comparison point'):`${change>0?'+':''}${this._format(change)}${unit?' '+(unit==='%'?'pp':unit):''}`;
   return `<button type="button" class="metric" data-entity="${esc(row.entity)}" aria-label="${esc(name+': '+(status||this._format(v)+' '+unit))}" style="--series-color:${color(row.color,PALETTE[i])}"><span class="label"><i></i>${esc(name)}</span><span class="reading"><span class="value">${v==null?'—':esc(this._format(displayValue,v))}</span>${v!=null&&unit?`<span class="unit">${esc(unit)}</span>`:''}</span>${status?`<span class="status">${status}</span>`:''}${c.show_graph?`<span class="spark">${path?`<svg viewBox="0 0 300 48" preserveAspectRatio="none" aria-hidden="true"><path d="${path}"/></svg>`:`<span>${graphStatus}</span>`}</span>`:''}${c.show_delta?`<span class="delta">${v==null?'—':esc(difference)}</span><span class="caption">${dutch?'sinds begin periode':'since period start'}</span>`:''}</button>`;
  }).join('');
  this.shadowRoot.innerHTML=`<style>:host{display:block;min-width:0;container-type:inline-size}ha-card{display:block;height:100%;font-family:inherit;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b)}.content{padding:16px;box-sizing:border-box}header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:20px}h2{font-size:18px;font-weight:650;letter-spacing:-.01em;line-height:1.25;margin:0;overflow-wrap:anywhere}.period{font-size:12px;color:var(--secondary-text-color,#666);white-space:nowrap}.grid{display:grid;grid-template-columns:repeat(${c.columns==='auto'?'2':c.columns},minmax(0,1fr));gap:20px 24px}.metric{appearance:none;font:inherit;color:inherit;background:none;border:0;border-radius:4px;text-align:left;min-width:0;min-height:44px;padding:0;cursor:pointer;display:flex;flex-direction:column;align-items:stretch}.metric:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:5px}.label{font-size:12px;color:var(--secondary-text-color,#666);line-height:1.4;overflow-wrap:anywhere;display:flex;align-items:baseline;gap:7px}.label i{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--series-color);flex-shrink:0}.reading{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;margin-top:6px;font-variant-numeric:tabular-nums;min-width:0}.value{font-size:28px;font-weight:550;line-height:1.25;overflow-wrap:anywhere;letter-spacing:-.025em}.unit{font-size:13px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}.spark{height:48px;display:flex;align-items:center;margin-top:8px;color:var(--secondary-text-color,#666);font-size:11px}.spark svg{width:100%;height:48px;overflow:visible}.spark path{fill:none;stroke:var(--series-color);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}.delta{font-size:12px;font-variant-numeric:tabular-nums;margin-top:8px;overflow-wrap:anywhere}.caption{font-size:11px;color:var(--secondary-text-color,#666);margin-top:2px}.status{font-size:12px;color:var(--secondary-text-color,#666);margin-top:4px}.error{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;font-size:12px;color:var(--secondary-text-color,#666)}.retry{font:inherit;min-height:44px;flex-shrink:0;padding:8px 12px;border:1px solid var(--divider-color,#ddd);border-radius:6px;background:transparent;color:inherit;cursor:pointer}@container(max-width:340px){.grid{grid-template-columns:minmax(0,1fr)}header{margin-bottom:16px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style><ha-card><div class="content"><header><h2>${esc(c.title)}${/\(beta\)/i.test(c.title)?'':' <small>(beta)</small>'}</h2><span class="period">${period}</span></header><div class="grid">${cells}</div>${this._status==='error'?`<div class="error" role="status"><span>${dutch?'Geschiedenis kon niet worden geladen. Actuele waarden blijven beschikbaar.':'History could not be loaded. Live values remain available.'}</span><button type="button" class="retry">${dutch?'Opnieuw':'Retry'}</button></div>`:''}</div></ha-card>`;
  this.shadowRoot.querySelectorAll('.metric').forEach(b=>{b.onclick=()=>this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:b.dataset.entity},bubbles:true,composed:true}));if(b.dataset.entity===focus)b.focus();});const retry=this.shadowRoot.querySelector('.retry');if(retry)retry.onclick=()=>this._refresh();
 }
}

if(!customElements.get('eleven-overview-card'))customElements.define('eleven-overview-card',OverviewCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(c=>c.type==='eleven-overview-card'))window.customCards.push({type:'eleven-overview-card',name:'Eleven Overview (beta)',description:'Current sensor values, sparklines and change since period start.',preview:true});
})();

;
/* Eleven Bar Chart — local beta; standalone, based on Eleven History. */
(()=>{
"use strict";

// ../../shared/graph.js
// Domain-neutral SVG renderer. Adapters own data, geometry, colors and annotations.
function graphLineStyle(style, width = 3.5) {
  return {style, width, dash: style === 'dashed' ? '8 7' : style === 'dotted' ? '1 7' : 'none', cap: style === 'dashed' ? 'butt' : 'round'};
}
const graphAttribute = value => String(value).replace(/[&"<>]/g, c => ({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
class SharedGraph {
  static hoverGroup(host) {
    return host._config?.sync_hover === false ? null : (host._config?.hover_sync_group?.trim() || 'default');
  }
  static hoverState() {
    const key = Symbol.for('eleven-cards.hover-sync.v1');
    const target = globalThis.window ?? globalThis;
    return target[key] ??= new Map();
  }
  static connectHover(host, receive) {
    this.disconnectHover(host);
    host._receiveSharedHover = receive;
    host._sharedHoverListener = event => {
      const {source, group, timestamp} = event.detail;
      if (source !== host && host.isConnected && group === this.hoverGroup(host)) receive(timestamp);
    };
    window.addEventListener('eleven-cards:hover-sync', host._sharedHoverListener);
    // Scroll does not cross shadow roots: listen in every enclosing tree.
    host._sharedScrollTargets = [window];
    for (let root = host.getRootNode?.(); root && root !== window; root = root.host?.getRootNode()) {
      host._sharedScrollTargets.push(root);
    }
    host._sharedScrollListener = event => {
      if (event?.composedPath?.().some(node => node?.classList?.contains('tooltip'))) return;
      host._hideTooltip();
    };
    for (const target of host._sharedScrollTargets) target.addEventListener('scroll', host._sharedScrollListener, true);
    window.addEventListener('resize', host._sharedScrollListener);
  }
  static tooltipInView(host) {
    const chart = host.shadowRoot?.querySelector('.chart');
    const box = chart?.getBoundingClientRect?.();
    if (!box) return true;
    const bottom = box.bottom ?? box.top + box.height, right = box.right ?? box.left + box.width;
    if (bottom <= 0 || right <= 0 || box.top >= (window.innerHeight ?? Infinity) || box.left >= (window.innerWidth ?? Infinity)) return false;
    // Respect nested scrolling/clipping containers, including HA's shadow trees.
    for (let node = host; node; node = node.parentElement ?? node.getRootNode?.().host) {
      if (!node.getBoundingClientRect || !globalThis.getComputedStyle) continue;
      const style = getComputedStyle(node), clipX = /auto|scroll|hidden|clip/.test(style.overflowX), clipY = /auto|scroll|hidden|clip/.test(style.overflowY);
      if (!clipX && !clipY) continue;
      const bounds = node.getBoundingClientRect();
      if ((clipY && (bottom <= bounds.top || box.top >= bounds.bottom)) || (clipX && (right <= bounds.left || box.left >= bounds.right))) return false;
    }
    return true;
  }
  static tooltipStyles() {
    return `.tooltip{position:absolute;z-index:4;box-sizing:border-box;min-width:0;max-width:calc(100% - 8px);padding:8px 10px;border:1px solid var(--divider-color,#ddd);border-radius:6px;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));box-shadow:0 3px 12px #0002;font-size:12px;line-height:1.4;font-variant-numeric:tabular-nums;overflow:auto;overflow-wrap:anywhere;pointer-events:none}.tooltip[hidden]{display:none}.tooltip strong{display:block;margin-bottom:4px;white-space:normal}.tooltip span{display:grid;grid-template-columns:9px minmax(0,1fr);column-gap:6px;margin-top:5px;white-space:normal}.tooltip i{display:block;width:9px;height:9px;margin:4px 0 0;border:0;border-radius:3px;flex-shrink:0;background:var(--series-color)}.tooltip b{font-weight:600;min-width:0;overflow-wrap:anywhere}.tooltip small{display:block;grid-column:2;color:var(--secondary-text-color,#666);font-size:10px;white-space:normal;font-variant-numeric:tabular-nums}`;
  }
  static publishHover(host, timestamp) {
    const group = this.hoverGroup(host);
    if (!group || !host.isConnected || !Number.isFinite(timestamp)) return;
    this.hoverState().set(group, {source: host, timestamp});
    window.dispatchEvent(new CustomEvent('eleven-cards:hover-sync', {detail: {source: host, group, timestamp}}));
  }
  static clearHover(host) {
    for (const [group, active] of this.hoverState()) {
      if (active.source !== host) continue;
      this.hoverState().delete(group);
      window.dispatchEvent(new CustomEvent('eleven-cards:hover-sync', {detail: {source: host, group, timestamp: null}}));
    }
  }
  static hoverSourceInEvent(host, event) {
    const active = this.hoverState().get(this.hoverGroup(host));
    return Boolean(active && event.composedPath().includes(active.source));
  }
  static restoreHover(host) {
    if (!host.isConnected) return;
    const active = this.hoverState().get(this.hoverGroup(host));
    if (active && host.isConnected) host._receiveSharedHover?.(active.timestamp);
  }
  static disconnectHover(host) {
    this.clearHover(host);
    if (host._sharedHoverListener) globalThis.window?.removeEventListener('eleven-cards:hover-sync', host._sharedHoverListener);
    for (const target of host._sharedScrollTargets ?? []) target.removeEventListener('scroll', host._sharedScrollListener, true);
    globalThis.window?.removeEventListener('resize', host._sharedScrollListener);
    host._sharedScrollTargets = [];
    host._sharedScrollListener = null;
    host._sharedHoverListener = null;
    host._receiveSharedHover = null;
  }
  static interpolation(value, fallback = 'smooth') {
    const mode = value == null || value === '' ? fallback : value;
    if (!['smooth', 'linear', 'step'].includes(mode)) throw new Error('line_interpolation');
    return mode;
  }
  static path(points, mode = 'smooth', end) {
    mode = this.interpolation(mode);
    let path = '', previous = null;
    for (const [x, y] of points) {
      if (!Number.isFinite(y)) {
        if (previous && end !== undefined) path += ` H ${x}`;
        previous = null;
        continue;
      }
      if (!previous) path += `${path ? ' ' : ''}M ${x} ${y}`;
      else if (mode === 'linear') path += ` L ${x} ${y}`;
      else if (mode === 'step') path += ` H ${x} V ${y}`;
      else {
        const middle = (previous[0] + x) / 2;
        path += ` C ${middle} ${previous[1]}, ${middle} ${y}, ${x} ${y}`;
      }
      previous = [x, y];
    }
    if (previous && end !== undefined) path += ` H ${end}`;
    return path;
  }
  render(host, {viewBox, defs = '', before = '', after = '', fills = [], lines = []}) {
    const previous = host.shadowRoot.querySelector('.chart-enter')?.getAnimations?.().find(a => a.animationName === 'chart-reveal' && a.playState !== 'finished' && Number(a.currentTime ?? 0) < 650);
    this.progress = Number(previous?.currentTime ?? 0);
    this.entering = Boolean(host.isConnected && (!this.loaded || previous) && lines.some(p => p.d));
    if (host.isConnected && lines.some(p => p.d)) this.loaded = true;
    const areas = fills.filter(p => p.d).map(p => `<path d="${graphAttribute(p.d)}" class="${graphAttribute(p.className)}"${p.fill ? ` fill="${graphAttribute(p.fill)}"` : ''}${p.opacity != null ? ` fill-opacity="${p.opacity}"` : ''}${p.mask ? ` mask="${graphAttribute(p.mask)}"` : ''}/>`).join('');
    const paths = lines.filter(p => p.d).map(p => {
      const a = p.appearance;
      const stroke = p.inlineStyle ? `style="stroke:${graphAttribute(a.stroke)};stroke-width:${a.width};stroke-dasharray:${a.dash};stroke-linecap:${a.cap}"` : `stroke="${graphAttribute(a.stroke)}" stroke-width="${a.width}" stroke-dasharray="${a.dash}" stroke-linecap="${a.cap}"`;
      return `<path d="${graphAttribute(p.d)}" class="${graphAttribute(p.className)}"${p.entity ? ` data-entity="${graphAttribute(p.entity)}"` : ''} ${stroke}/>`;
    }).join('');
    return `<svg viewBox="${viewBox}" preserveAspectRatio="none" aria-hidden="true">${defs}${before}<g class="chart-series${this.entering ? ' chart-enter' : ''}">${areas}${paths}</g>${after}</svg>`;
  }
  restore(host) {
    if (this.entering && this.progress > 0) {
      const animation = host.shadowRoot.querySelector('.chart-enter')?.getAnimations?.().find(a => a.animationName === 'chart-reveal');
      if (animation) animation.currentTime = this.progress;
    }
  }
}
function graphStyles() {
  return `
      .price-line, .series-line { fill: none; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
      .chart-enter { animation: chart-reveal 650ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      @keyframes chart-reveal {
        from { clip-path: inset(0 100% 0 0); }
        to { clip-path: inset(0 0 0 0); }
      }
      .hover-dot { position: absolute; z-index: 2; width: 12px; height: 12px; box-sizing: border-box; border: 3px solid; border-radius: 50%; transform: translate(-50%, -50%); background: var(--card-background-color); pointer-events: none; }
      @media (prefers-reduced-motion: reduce) { .chart-enter { animation: none; } }
  `;
}

// ../../shared/card-header.js
// Shared markup stays in each card's shadow root: native links and existing
// data-zoom handlers work without cross-bundle custom-element registration.
const headerEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bindCardPopupPosition(host,trigger,popup,isRequested,show){
 let active=true;
 const position=()=>{
  if(!active||!isRequested())return;
  const box=trigger.getBoundingClientRect();
  // A newly inserted ha-card may not have rendered its slot yet. Never anchor
  // an open popup to its temporarily empty trigger rectangle at (0, 0).
  if(!box.width||!box.height){popup.style.visibility='hidden';return;}
  popup.style.visibility='';show?.();
  const width=Math.min(380,window.innerWidth-16);
  popup.style.width=width+'px';popup.style.maxHeight=Math.min(560,window.innerHeight-16)+'px';
  const height=popup.getBoundingClientRect().height,below=window.innerHeight-box.bottom-8,above=box.top-8;
  popup.style.left=Math.max(8,Math.min(box.right-width,window.innerWidth-width-8))+'px';
  popup.style.top=Math.max(8,Math.min(below>=height||below>=above?box.bottom+6:box.top-height-6,window.innerHeight-height-8))+'px';
 };
 const ready=host.shadowRoot.querySelector('ha-card')?.updateComplete;
 if(ready?.then)ready.then(position,()=>{});
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(position):null;
 observer?.observe(trigger);
 return {position,disconnect(){active=false;observer?.disconnect();}};
}
// Native toggle events are asynchronous. Clear the other popup's restore
// state synchronously, also for browsers using the attribute fallback.
function closeOtherCardPopups(host,kind){
 const period=kind==='period',root=host.shadowRoot;
 if(period){host._insightOpen=null;host._insightPending=null;host._insightFocus=null;}
 else{host._periodMenuOpen=false;host._periodMenuPending=false;host._periodFocus=null;}
 for(const panel of root.querySelectorAll?.(period?'.insight-popup':'.period-menu')??[]){
  if(typeof panel.showPopover==='function'){if(panel.matches(':popover-open'))panel.hidePopover();}
  else panel.removeAttribute('data-fallback-open');
 }
 for(const trigger of root.querySelectorAll?.(period?'[data-insight]':'[data-period="menu"]')??[])trigger.setAttribute('aria-expanded','false');
}
function cardHeaderIcon(name){
 const paths={in:'M5 12h14M12 5v14',out:'M5 12h14',reset:'M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6',previous:'m15 6-6 6 6 6',next:'m9 6 6 6-6 6',info:'M12 17v-5M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',history:'M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',down:'m6 9 6 6 6-6'};
 return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
}
function cardHeader({title,showTitle=true,ready=false,historyUrl,language='en',periods={},zoomState={in:true,out:true,reset:true,zoomed:false},information=''}){
 const nl=language.startsWith('nl'),label=nl?['Inzoomen','Uitzoomen','Zoom herstellen','Open in Home Assistant Geschiedenis']:['Zoom in','Zoom out','Reset zoom','Open in Home Assistant History'];
 const zoom=ready?`<div class="zoom-controls" role="group" aria-label="Zoom">${['out','in','reset'].map(action=>`<button type="button" data-zoom="${action}"${zoomState[action]?'':' disabled'} title="${label[['in','out','reset'].indexOf(action)]}" aria-label="${label[['in','out','reset'].indexOf(action)]}">${cardHeaderIcon(action)}</button>`).join('')}</div>`:'';
 const group=periods.navigation||zoom?`<div class="chart-controls" role="group" aria-label="${nl?'Periode en zoom':'Period and zoom'}">${periods.navigation??''}${zoom}</div>`:'';
 const showZoomStatus=zoomState.zoomed&&!periods.picker;
 return `<header class="card-header">${showTitle&&title?`<h2>${headerEscape(title)}</h2>`:''}<div class="header-actions">${periods.picker??''}${group}<div class="chart-links"><a class="history-link" href="${headerEscape(historyUrl)}" title="${label[3]}" aria-label="${label[3]}">${cardHeaderIcon('history')}</a>${information}</div></div></header>${showZoomStatus?`<div class="chart-context"><div class="chart-range"><span class="zoom-status">${nl?'Ingezoomd':'Zoomed in'}</span></div></div>`:''}`;
}
function cardHeaderStyles(){return `
.card-header{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;min-height:32px;flex:none;margin:-6px -4px 10px 0}
.card-header h2{flex:1 1 110px;min-width:0;margin:4.75px 0 0;font-size:18px;line-height:1.25;font-weight:650;letter-spacing:-.01em;overflow-wrap:anywhere}
.header-actions{--chart-action-gap:8px;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:var(--chart-action-gap);flex:0 1 auto;min-width:0;max-width:100%;margin-inline-start:auto}
.chart-controls{display:flex;align-items:center;flex-wrap:wrap;gap:0;max-width:100%}
.chart-links{display:flex;align-items:center;gap:var(--chart-action-gap);flex:none}
.zoom-controls{display:flex;gap:0;position:relative}
.header-actions button,.history-link{display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:inherit;font-size:12px;font-weight:400;width:32px;height:32px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--primary-text-color,#20252b);text-decoration:none;cursor:pointer;flex:none}
.chart-controls,.chart-links>.history-link{background:var(--secondary-background-color,#eee);border-radius:5px}
.chart-controls button:not(:disabled):hover,.chart-links>.history-link:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.chart-controls>[data-period="now"]{width:36px}
.chart-controls>[data-period="next"]+.zoom-controls{margin-inline-start:8px;padding-inline-start:8px}
.chart-controls>[data-period="next"]+.zoom-controls::before{content:"";position:absolute;inset-inline-start:0;top:8px;height:16px;width:1px;background:var(--divider-color,#ddd)}
.header-actions button:disabled{opacity:.35;cursor:default}
.header-actions button:hover,.history-link:hover{background:var(--secondary-background-color,#eee)}
.header-actions button:focus-visible,.history-link:focus-visible{background:var(--secondary-background-color,#eee);outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.period-menu,.insight-popup{display:none;position:fixed;inset:auto;margin:0;padding:8px 12px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;z-index:20;max-width:calc(100vw - 16px);border:1px solid var(--divider-color,#ddd);border-radius:10px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font:inherit;font-size:12px;line-height:1.35;box-shadow:0 8px 28px #0004}
.chart-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.chart-popup-heading>strong{font-size:14px;font-weight:600}
.period-menu .chart-popup-heading>button,.insight-popup .chart-popup-heading>button{display:flex;align-items:center;justify-content:center;width:30px;height:30px;min-height:30px;padding:0;border:0;border-radius:5px;background:transparent;color:inherit;font:inherit;font-size:20px;font-weight:400;flex:none;cursor:pointer}
`;}

// ../../shared/periods.js
// Calendar periods use the Home Assistant timezone, including DST boundaries.
const periodZoneFormats=new Map();
function periodLocalParts(t,zone){
 let format=periodZoneFormats.get(zone);
 if(!format){format=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});periodZoneFormats.set(zone,format);}
 return Object.fromEntries(format.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
}
function periodLocalEpoch(t,zone){const p=periodLocalParts(t,zone);return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
function periodMidnight(nominal,zone){
 let t=nominal;for(let i=0;i<6;i++){const next=nominal-(periodLocalEpoch(t,zone)-t);if(next===t)return t;t=next;}
 // Midnight can be skipped by a timezone transition. Use the first valid
 // instant of that local date rather than oscillating across the transition.
 let low=nominal-36*3600000,high=nominal+36*3600000;
 while(high-low>1000){const mid=Math.floor((low+high)/2000)*1000,p=periodLocalParts(mid,zone);if(Date.UTC(p.year,p.month-1,p.day)>=nominal)high=mid;else low=mid;}
 return high;
}
function graphPeriodBounds(t,period,zone='UTC'){
 zone ||= 'UTC';const p=periodLocalParts(t,zone),size={minute:60000,quarter_hour:900000,hour:3600000}[period];
 if(size){const local=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),a=t-(local%size)-(t%1000);return [a,a+size];}
 let nominal=Date.UTC(p.year,p.month-1,period==='month'?1:p.day);let next;
 if(period==='week'){const day=new Date(nominal).getUTCDay();nominal-=((day+6)%7)*86400000;next=nominal+7*86400000;}
 else if(period==='month')next=Date.UTC(p.year,p.month,1);
 else next=nominal+86400000;
 return [periodMidnight(nominal,zone),periodMidnight(next,zone)];
}
const periodCalendarModes=['today','week','month','quarter','year'];
const periodPresetHours={'1h':1,'6h':6,'12h':12,'24h':24,'48h':48,'7d':168,'14d':336,'30d':720,'90d':2160,'365d':8760};
function resetGraphPeriod(host){host._periodMode='configured';host._periodHours=null;host._periodEnd=null;host._periodOffset=0;host._periodAnchor=null;host._periodMenuOpen=false;host._periodMenuPending=false;host._insightPending=null;}
function graphPeriodRange(host,now=Date.now()){
 const mode=host._periodMode,offset=host._periodOffset??0;
 if(periodCalendarModes.includes(mode)){
  const zone=host._hass?.config?.time_zone||'UTC',p=periodLocalParts(host._periodAnchor??now,zone);
  let nominal,finishNominal;
  if(mode==='week'){
   nominal=Date.UTC(p.year,p.month-1,p.day);nominal+=(offset*7-(new Date(nominal).getUTCDay()+6)%7)*86400000;finishNominal=nominal+7*86400000;
  }else if(mode==='month'||mode==='quarter'){
   const size=mode==='quarter'?3:1,month=(mode==='quarter'?Math.floor((p.month-1)/3)*3:p.month-1)+offset*size;
   nominal=Date.UTC(p.year,month,1);finishNominal=Date.UTC(p.year,month+size,1);
  }else if(mode==='year'){nominal=Date.UTC(p.year+offset,0,1);finishNominal=Date.UTC(p.year+offset+1,0,1);}
  else{nominal=Date.UTC(p.year,p.month-1,p.day+offset);finishNominal=nominal+86400000;}
  const start=periodMidnight(nominal,zone),finish=periodMidnight(finishNominal,zone);
  return {start,end:Math.max(start+1,Math.min(now,finish))};
 }
 const end=host._periodEnd??now;
 return {start:end-(host._periodHours??host._config.hours_to_show)*3600000,end};
}
function chooseGraphPeriod(host,value){
 const calendar=value==='configured'||periodCalendarModes.includes(value),hours=periodPresetHours[value]??Number(value);
 if(!calendar&&(!Number.isFinite(hours)||hours<1||hours>8760))return;
 resetGraphPeriod(host);
 host._periodMode=calendar?value:Object.entries(periodPresetHours).find(([,h])=>h===hours)?.[0]??String(value);
 if(!calendar)host._periodHours=hours;
 return host._reloadPeriod();
}
function moveGraphPeriod(host,direction){
 if(![-1,0,1].includes(direction))return;
 if(direction===0){host._periodOffset=0;host._periodEnd=null;host._periodAnchor=null;}
 else{
  const previous=host._periodOffset??0;
  const calendar=periodCalendarModes.includes(host._periodMode);
  if(previous===0)host._periodAnchor=calendar?Date.now():host._status==='ready'?(host._end??Date.now()):Date.now();
  host._periodOffset=Math.min(0,previous+direction);
  if(host._periodOffset===0)host._periodAnchor=null;
  if(!calendar){
   host._periodEnd=host._periodOffset===0?null:host._periodAnchor+host._periodOffset*(host._periodHours??host._config.hours_to_show)*3600000;
  }
 }
 return host._reloadPeriod();
}

// ../../shared/period-controls.js
const periodEscape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function compactPeriodName({start,end,mode,past,zoomed,hours,name,locale,zone}){
 const format=options=>new Intl.DateTimeFormat(locale,{timeZone:zone,...options});
 const dates=format({year:'numeric',month:'numeric',day:'numeric'});
 const parts=t=>Object.fromEntries(dates.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 const a=parts(start),b=parts(end),currentYear=parts(Date.now()).year;
 const dayMonth=format({day:'numeric',month:'short'}),dayYear=format({day:'numeric',month:'short',year:'numeric'});
 const sameDay=a.year===b.year&&a.month===b.month&&a.day===b.day;
 const dateRange=(from,to)=>{
  const first=parts(from),last=parts(to),year=first.year!==currentYear?` ${first.year}`:'';
  if(first.year!==last.year)return `${dayYear.format(from)}–${dayYear.format(to)}`;
  if(first.month===last.month)return `${first.day===last.day?'':`${first.day}–`}${dayMonth.format(to)}${year}`;
  return `${dayMonth.format(from)}–${dayMonth.format(to)}${year}`;
 };
 if(zoomed||(past&&!['today','week','month','quarter','year'].includes(mode)&&hours<24)){
  const time=format({hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  if(sameDay){
   const offsets=format({timeZoneName:'shortOffset'}),offset=t=>offsets.formatToParts(t).find(p=>p.type==='timeZoneName')?.value;
   const clock=offset(start)!==offset(end)?format({hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'}):time;
   return `${(a.year===currentYear?dayMonth:dayYear).format(start)} · ${clock.format(start)}–${clock.format(end)}`;
  }
  if(end-start<48*3600000)return `${(a.year===b.year&&a.year===currentYear?dayMonth:dayYear).format(start)} ${time.format(start)}–${(a.year===b.year&&a.year===currentYear?dayMonth:dayYear).format(end)} ${time.format(end)}`;
  return dateRange(start,end);
 }
 if(mode==='month'){const month=format({month:'long',year:'numeric'}).format(start);return month[0].toLocaleUpperCase(locale)+month.slice(1);}
 if(mode==='quarter')return `Q${Math.ceil(a.month/3)} ${a.year}`;
 if(mode==='year')return String(a.year);
 if(mode==='week')return dateRange(start,Math.max(start,end-1));
 if(mode==='today')return past?dateRange(start,Math.max(start,end-1)):name;
 if(past)return `${dateRange(start,end)} · ${hours>=168&&hours%24===0?`${hours/24} ${locale==='nl-NL'?'dagen':'days'}`:`${hours} ${locale==='nl-NL'?'uur':hours===1?'hour':'hours'}`}`;
 return name;
}
function periodControls(host,language='en'){
 const active=host.shadowRoot.activeElement;
 if(!host._periodMenuPending)host._periodFocus=null;
 if(active?.closest?.('.header-actions'))host._periodFocus=active.dataset.periodOption!=null?`option:${active.dataset.periodOption}`:active.dataset.zoom!=null?`zoom:${active.dataset.zoom}`:active.classList.contains('history-link')?'history':active.dataset.period;
 if(host._config.show_navigation===false){host._periodMenuOpen=false;host._periodMenuPending=false;return {};}
 const previousMenu=host.shadowRoot.querySelector('.period-menu');
 if(previousMenu){
  host._periodMenuScroll=previousMenu.scrollTop;
  host._periodMenuOpen=!!host._periodMenuPending||(typeof previousMenu.showPopover==='function'?previousMenu.matches(':popover-open'):previousMenu.hasAttribute('data-fallback-open'));
 }
 const nl=language.startsWith('nl'),label=(en,nlText)=>nl?nlText:en,mode=host._periodMode??'configured',past=(host._periodOffset??0)<0;
 const standard=label(`Default (${host._config.hours_to_show} hours)`,`Standaard (${host._config.hours_to_show} uur)`);
 const rolling=[['1h',1],['6h',6],['12h',12],['24h',24],['48h',48],['7d',168],['14d',336],['30d',720],['90d',2160],['365d',8760]].map(([id,hours])=>[id,hours<168?label(`${hours} ${hours===1?'hour':'hours'}`,`${hours} uur`):label(`${hours/24} days`,`${hours/24} dagen`)]);
 const calendar=[['today',label('Today','Vandaag'),label('Day','Dag')],['week',label('This week','Deze week'),label('Week','Week')],['month',label('This month','Deze maand'),label('Month','Maand')],['quarter',label('This quarter','Dit kwartaal'),label('Quarter','Kwartaal')],['year',label('This year','Dit jaar'),label('Year','Jaar')]];
 if(host._periodHours!=null&&!rolling.some(([id])=>id===mode))rolling.push([mode,label(`${host._periodHours} hours`,`${host._periodHours} uur`)]);
 const calendarChoice=calendar.find(([id])=>id===mode),name=mode==='configured'?standard:calendarChoice?.[past?2:1]??rolling.find(([id])=>id===mode)?.[1]??standard;
 const choice=([value,text])=>`<button type="button" role="menuitemradio" aria-checked="${value===mode}" tabindex="-1" data-period-option="${periodEscape(value)}"><span>${periodEscape(text)}</span><span aria-hidden="true">${value===mode?'✓':''}</span></button>`;
 const {start,end}=host._status==='ready'&&Number.isFinite(host._viewStart)&&Number.isFinite(host._viewEnd)?{start:host._viewStart,end:host._viewEnd}:graphPeriodRange(host);
 const locale=nl?'nl-NL':'en-GB',zone=host._hass?.config?.time_zone||'UTC';
 const zoomed=host._status==='ready'&&(start>host._start+1||end<host._end-1);
 const compactName=compactPeriodName({start,end,mode,past,zoomed,hours:host._periodHours??host._config.hours_to_show,name,locale,zone});
 const format=new Intl.DateTimeFormat(locale,{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
 const range=`${format.format(start)} – ${format.format(end)}`;
 return {picker:`<div class="period-controls"><button type="button" class="period-trigger" data-period="menu" aria-haspopup="menu" aria-controls="eleven-period-menu" aria-expanded="${host._periodMenuOpen===true}" title="${periodEscape(range)}" aria-label="${label('Timeframe','Tijdvak')}: ${periodEscape(compactName)}" aria-description="${periodEscape(range)}${zoomed?`. ${label('Zoomed in','Ingezoomd')}`:''}"><span>${periodEscape(compactName)}</span>${cardHeaderIcon('down')}</button><div class="period-menu" id="eleven-period-menu" popover="auto" role="menu" aria-label="${label('Choose a period','Kies een periode')}"><div class="chart-popup-heading"><strong>${label('Timeframe','Tijdvak')}</strong><button type="button" role="menuitem" data-period="close" aria-label="${label('Close','Sluiten')}">×</button></div><div class="period-current-range">${periodEscape(range)}${zoomed?`<span class="zoom-status">${label('Zoomed in','Ingezoomd')}</span>`:''}</div><div class="period-default">${choice(['configured',standard])}</div><div class="period-menu-columns"><div role="group" aria-label="${label('Last','Afgelopen')}"><h3>${label('Last','Afgelopen')}</h3>${rolling.map(choice).join('')}</div><div role="group" aria-label="${label('Calendar','Kalender')}"><h3>${label('Calendar','Kalender')}</h3>${calendar.map(choice).join('')}<p>${label('From the start of the period until now. Use the arrows for previous periods.','Vanaf de start van het tijdvak tot nu. Gebruik de pijlen voor vorige perioden.')}</p></div></div></div></div>`,navigation:`<button type="button" data-period="previous" title="${label('Previous period','Vorige periode')}" aria-label="${label('Previous period','Vorige periode')}">${cardHeaderIcon('previous')}</button><button type="button" data-period="now" title="${label('Return to the current period','Terug naar de huidige periode')}">${label('Now','Nu')}</button><button type="button" data-period="next" title="${label('Next period','Volgende periode')}" aria-label="${label('Next period','Volgende periode')}"${past?'':' disabled'}>${cardHeaderIcon('next')}</button>`};
}
function restorePeriodFocus(host,items=[]){
 const key=host._periodFocus;if(!key)return;const root=host.shadowRoot;
 const target=key==='history'?root.querySelector('.history-link'):key.startsWith('zoom:')?root.querySelector('[data-zoom="'+key.slice(5)+'"]'):key.startsWith('option:')&&host._periodMenuOpen?items.find(item=>item.dataset.periodOption===key.slice(7)):root.querySelector('[data-period="'+(key.startsWith('option:')?'menu':key)+'"]');
 (target?.disabled?root.querySelector('[data-period="now"], [data-zoom="in"]:not(:disabled), .history-link'):target)?.focus?.({preventScroll:true});host._periodFocus=null;
}
function disconnectPeriodControls(host,preserveState=false){host._periodMenuCleanup?.();host._periodMenuCleanup=null;if(!preserveState)host._periodMenuPending=false;}
function bindPeriodControls(host){
 disconnectPeriodControls(host,true);
 const root=host.shadowRoot,nav=root.querySelector('.period-controls');if(!nav){restorePeriodFocus(host);return;}
 const menu=nav.querySelector('.period-menu'),trigger=nav.querySelector('[data-period="menu"]'),items=[...menu.querySelectorAll('[data-period-option]')],native=typeof menu.showPopover==='function';
 const cleanups=[];
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 host._periodMenuCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 const isOpen=()=>native?menu.matches(':popover-open'):menu.hasAttribute('data-fallback-open');
 let focusPending=false;
 const placement=bindCardPopupPosition(host,trigger,menu,()=>host._periodMenuOpen,()=>{
  host._periodMenuPending=false;
  if(native){if(!isOpen())menu.showPopover();}else menu.setAttribute('data-fallback-open','');
  if(focusPending){(items.find(item=>item.getAttribute('aria-checked')==='true')??items[0]).focus({preventScroll:true});focusPending=false;}
  restorePeriodFocus(host,items);
 }),position=placement.position;
 cleanups.push(()=>placement.disconnect());
 const close=(restore=false)=>{
  host._periodMenuOpen=false;host._periodMenuPending=false;trigger.setAttribute('aria-expanded','false');
  if(native){if(menu.matches(':popover-open'))menu.hidePopover();}else menu.removeAttribute('data-fallback-open');
  if(restore)trigger.focus({preventScroll:true});
 };
 const open=(focus=true)=>{
  closeOtherCardPopups(host,'period');
  host._periodMenuOpen=true;host._periodMenuPending=true;focusPending=focus;trigger.setAttribute('aria-expanded','true');
  position();
 };
 // Remember the pointer state before native light dismissal runs on pointerup.
 let pointerWasOpen;
 trigger.onpointerdown=()=>{pointerWasOpen=host._periodMenuOpen;};
 trigger.onpointercancel=()=>{pointerWasOpen=undefined;};
 trigger.onclick=()=>{const wasOpen=pointerWasOpen??host._periodMenuOpen;pointerWasOpen=undefined;wasOpen?close(true):open();};
 menu.querySelector('[data-period="close"]').onclick=()=>close(true);
 trigger.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();if(e.key==='ArrowUp')items.at(-1).focus({preventScroll:true});}};
 menu.addEventListener('toggle',e=>{if(host.shadowRoot.querySelector('.period-menu')!==menu)return;host._periodMenuOpen=e.newState==='open';trigger.setAttribute('aria-expanded',String(host._periodMenuOpen));});
 for(const item of items)item.onclick=()=>{close(true);chooseGraphPeriod(host,item.dataset.periodOption);};
 menu.onkeydown=e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
  if(e.key==='Tab'){e.preventDefault();close(true);if(!e.shiftKey)root.querySelector('.chart-controls button:not(:disabled)')?.focus();return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const index=items.indexOf(host.shadowRoot.activeElement),next=e.key==='Home'?0:e.key==='End'?items.length-1:index<0?(e.key==='ArrowUp'?items.length-1:0):(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();}
 };
 for(const [key,direction]of [['previous',-1],['next',1],['now',0]])root.querySelector(`[data-period="${key}"]`).onclick=()=>{close();moveGraphPeriod(host,direction);};
 listen(window,'resize',()=>{if(host._periodMenuOpen)position();});
 listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(menu))close();},true);
 listen(document,'pointerdown',e=>{if((!native||host._periodMenuPending)&&host._periodMenuOpen&&!e.composedPath().includes(nav))close();});
 if(host._periodMenuOpen){open(false);menu.scrollTop=host._periodMenuScroll??0;}
 if(!host._periodMenuPending)restorePeriodFocus(host,items);
}
function periodControlsStyles(){return `
.period-controls{display:flex;min-width:0;max-width:100%}
.header-actions .period-trigger{width:auto;max-width:100%;gap:6px;padding:4px 10px;border:0;border-radius:5px;background:var(--secondary-background-color,#eee);font-weight:400}
.header-actions .period-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-trigger span{min-width:0;overflow-wrap:anywhere}
.period-current-range{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;margin:2px 0 10px}
.period-current-range .zoom-status{display:table;margin-top:4px}
.period-menu:popover-open{display:block}
.period-menu[data-fallback-open]{display:block}
.period-menu-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.period-menu h3{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--secondary-text-color,#666);margin:8px}
.period-menu button{font:inherit;font-size:12px;color:var(--primary-text-color,#20252b);background:transparent;box-sizing:border-box;display:flex;border:1px solid transparent;border-radius:5px;cursor:pointer;height:auto;width:100%;justify-content:space-between;gap:8px;min-height:34px;border-color:transparent;text-align:start;padding:6px 8px;font-weight:400}
.period-menu button:hover{background:var(--secondary-background-color,#eee)}
.period-menu button:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.period-menu button[aria-checked="true"]{color:var(--primary-color,#2196f3);background:color-mix(in srgb,var(--primary-color,#2196f3) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-menu p{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);margin:10px 8px 2px;overflow-wrap:anywhere}
.period-default{border-bottom:1px solid var(--divider-color,#ddd);padding-bottom:8px;margin-bottom:8px}
`;}

// ../../shared/chart-insights.js
const insightEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function chartZoomState(host){
 const total=host._end-host._start,ready=host._status==='ready'&&Number.isFinite(total)&&total>0;
 const a=Math.max(host._start,host._viewport?.[0]??host._start),b=Math.min(host._end,host._viewport?.[1]??host._end),width=Math.max(0,b-a);
 const zoomed=ready&&(a>host._start+1||b<host._end-1);
 return {zoomed,in:ready&&width>Math.min(60000,total)+1,out:ready&&width<total-1,reset:zoomed};
}
function chartEntityItems(host){return host._config.entities.map(id=>({id,name:host._config.series_options?.find(row=>row.entity===id)?.name||host._hass?.states?.[id]?.attributes?.friendly_name||id}));}
function chartSeriesVisible(host,index){return host._visibility?.get(host._config.entities[index])??true;}
function isolateChartSeries(host,id){
 if(!host._config.entities.includes(id))return;
 host._visibility=new Map(host._config.entities.map(entity=>[entity,entity===id]));host._hideTooltip?.();host._render();
}
function showAllChartSeries(host){host._visibility=new Map(host._config.entities.map(id=>[id,true]));host._hideTooltip?.();host._render();}
function cancelChartLegendClicks(host){for(const timer of host._legendClickTimers?.values()??[])clearTimeout(timer);host._legendClickTimers?.clear();}
function toggleChartIsolation(host,id){
 if(!host._config.entities.includes(id))return;
 cancelChartLegendClicks(host);
 const only=host._config.entities.every((entity,i)=>host._isSeriesVisible(i)===(entity===id));
 only?showAllChartSeries(host):isolateChartSeries(host,id);
 queueMicrotask(()=>host.shadowRoot.querySelector(`[data-series="${id}"]`)?.focus({preventScroll:true}));
}
function bindChartLegend(host){
 const nl=host._insightLanguage==='nl',hint=nl?'Dubbelklik of Shift+Enter: alleen deze sensor. Herhaal om alles te tonen.':'Double-click or Shift+Enter: show only this sensor. Repeat to show all.';
 for(const button of host.shadowRoot.querySelectorAll?.('[data-series]')??[]){
  const id=button.dataset.series;
  if(!button.title?.includes(hint))button.title=[button.title,hint].filter(Boolean).join(' ');button.setAttribute('aria-description',hint);button.setAttribute('aria-keyshortcuts','Shift+Enter Shift+Space');
  button.onclick=e=>{
   clearTimeout(host._legendClickTimers?.get(id));host._legendClickTimers?.delete(id);
   if(e.shiftKey||e.detail>1){e.preventDefault();toggleChartIsolation(host,id);return;}
   if(!e.detail){host._toggleSeries?host._toggleSeries(id):toggleChartIsolation(host,id);return;}
   // Keep the target alive until a second click can arrive: rendering after
   // the first click would replace it and break native double-click detection.
   if(host._toggleSeries){const config=host._config;host._legendClickTimers??=new Map();host._legendClickTimers.set(id,setTimeout(()=>{host._legendClickTimers.delete(id);if(host._config===config)host._toggleSeries(id);},300));}
  };
  button.ondblclick=e=>e.preventDefault();
  button.onkeydown=e=>{if(e.shiftKey&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();toggleChartIsolation(host,id);}};
 }
}
function insightControl(host,key,label,body,icon=''){
 return `<div class="insight-control"><button type="button" class="insight-trigger" data-insight="${key}" title="${insightEscape(label)}" aria-label="${insightEscape(label)}" aria-haspopup="dialog" aria-expanded="${host._insightOpen===key}" aria-controls="insight-${key}">${icon}${key==='data'?'':`<span>${insightEscape(label)}</span>`}</button><div id="insight-${key}" class="insight-popup" data-insight-panel="${key}" popover="auto" role="dialog" aria-label="${insightEscape(label)}"><div class="chart-popup-heading"><strong>${insightEscape(label)}</strong><button type="button" data-insight-close aria-label="${host._insightLanguage==='nl'?'Sluiten':'Close'}">×</button></div>${body}</div></div>`;
}
// Work on unstacked, undecimated values. A history value holds until the next
// point (null breaks coverage); bars have equal weight, regardless of bin length.
function chartValueStatistics(points,start,end,interval){
 let minimum=Infinity,maximum=-Infinity,sum=0,weight=0,count=0,covered=0,until=start;
 for(let i=0;i<points.length;i++){
  const p=points[i],[a,b]=interval?interval(p,i):[p.t,points[i+1]?.t??end];
  const left=Math.max(start,a,p.t),right=Math.min(end,b);
  if(right<=left||!Number.isFinite(p.v))continue;
  minimum=Math.min(minimum,p.v);maximum=Math.max(maximum,p.v);count++;
  const w=interval?1:right-left;sum+=p.v*w;weight+=w;
  const knownEnd=Math.min(right,points[i+1]?.t??end);
  covered+=Math.max(0,knownEnd-Math.max(left,until));until=Math.max(until,knownEnd);
 }
 return {minimum:count?minimum:null,maximum:count?maximum:null,average:weight?sum/weight:null,count,missing:covered<end-start-1};
}
function chartDataInformation(host,language='en'){
 const nl=language.startsWith('nl');host._insightLanguage=nl?'nl':'en';
 const load=host._lastLoad;
 const summary=host._status==='ready'?host._dataInformation?.():load?.summary;
 if(load&&summary&&host._status==='ready')load.summary=summary;
 const value=v=>{
  if(!Number.isFinite(v))return '—';
  const small=v!==0&&Math.abs(v)<.01,options=small?{maximumSignificantDigits:4}:{maximumFractionDigits:2};
  if(v!==0&&Math.abs(v)<.0001)options.notation='scientific';
  return insightEscape(new Intl.NumberFormat(language,options).format(Object.is(v,-0)?0:v));
 };
 let body=load?'':`<p role="status">${host._inFlight?(nl?'Laden…':'Loading…'):host._loadFailed?(nl?'Laadfout':'Load failed'):(nl?'Geen gegevens':'No data')}</p>`;
 if(load){
  body+=`<div class="insight-sensors">${chartEntityItems(host).map((item,i)=>{
   const source=load.sources.find(s=>s.id===item.id),row=summary?.rows.find(r=>r.id===item.id),hidden=!host._isSeriesVisible(i);
   const sourceLabel=source?(source.source==='statistics'?(nl?'Statistieken':'Statistics'):(nl?'Historie':'History')):(nl?'Niet geladen':'Not loaded');
   const unit=row?.unit??host._hass?.states?.[item.id]?.attributes?.unit_of_measurement??'';
   const metrics=row?.durations?`<dl class="insight-durations">${row.durations.map(s=>`<div><dt title="${insightEscape(s.missing?(nl?'Geen geschiedenis':'No history'):s.state)}">${insightEscape(s.label)}</dt><dd>${insightEscape(host._duration(s.duration))}</dd></div>`).join('')}</dl>`:row?`<dl class="insight-metrics${'total' in row?' has-total':''}">${[['minimum','Min'],['maximum','Max'],['average',nl?'Gem.':'Avg.']].map(([key,label])=>`<div><dt${key==='average'?` title="${nl?'Gemiddeld':'Average'}"`:''}>${label}</dt><dd data-metric="${key}">${value(row[key])}</dd></div>`).join('')}${'total' in row?`<div><dt title="${nl?'Som van volledige staven':'Sum of whole bars'}">${nl?'Som':'Sum'}</dt><dd data-metric="total">${value(row.total)}</dd></div>`:''}</dl>`:'';
   const states=[host._inFlight?(nl?'Vernieuwen…':'Refreshing…'):host._loadFailed?(nl?'Verouderd':'Outdated'):'',hidden?(nl?'Verborgen':'Hidden'):'',row?.limited?(nl?'Meer dan 20 statussen':'More than 20 states'):row?.count===0||source?.empty?(nl?'Geen gegevens':'No data'):row?.missing?(nl?'Onvolledig':'Incomplete'):''].filter(Boolean);
   return `<section class="insight-sensor" data-information-entity="${insightEscape(item.id)}"><div class="insight-sensor-heading"><strong>${insightEscape(item.name)}</strong><span class="insight-source">${sourceLabel}${unit?` <span class="insight-unit">· ${insightEscape(unit)}</span>`:''}</span></div>${metrics}${states.length?`<div class="insight-states" role="status">${states.join(' · ')}</div>`:''}</section>`;
  }).join('')}</div>`;
 }
 return insightControl(host,'data',nl?'Gegevens':'Data information',body,cardHeaderIcon('info'));
}
function captureChartInsights(host){
 const active=host.shadowRoot.activeElement;
 if(!host._insightPending)host._insightFocus=null;
 if(active?.closest?.('.insight-control'))host._insightFocus={key:active.closest('.insight-control').querySelector('[data-insight]')?.dataset.insight,inside:!!active.closest('.insight-popup'),entity:active.dataset.isolate,all:active.hasAttribute('data-show-all')};
 const popup=[...(host.shadowRoot.querySelectorAll?.('.insight-popup')??[])].find(panel=>typeof panel.showPopover==='function'?panel.matches(':popover-open'):panel.hasAttribute('data-fallback-open'));
 host._insightOpen=popup?.dataset.insightPanel??host._insightPending??null;
}
function disconnectChartInsights(host,keepLegendClicks=false){if(!keepLegendClicks){cancelChartLegendClicks(host);host._insightPending=null;}host._insightCleanup?.();host._insightCleanup=null;}
function restoreChartInsightFocus(host){
 if(!host._insightFocus||host._insightPending)return;
 const root=host.shadowRoot,{key,inside,entity,all}=host._insightFocus,popup=root.querySelector(`[data-insight-panel="${key}"]`),target=inside&&host._insightOpen===key?popup?.querySelector(entity?`[data-isolate="${entity}"]`:all?'[data-show-all]':'[data-insight-close]'):root.querySelector(`[data-insight="${key}"]`);
 if(target){target.focus?.({preventScroll:true});host._insightFocus=null;}
}
function bindChartInsights(host){
 disconnectChartInsights(host,true);
 const root=host.shadowRoot,cleanups=[];host._insightCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 for(const control of root.querySelectorAll?.('.insight-control')??[]){
  const trigger=control.querySelector('[data-insight]'),popup=control.querySelector('.insight-popup'),key=trigger.dataset.insight,native=typeof popup.showPopover==='function';
  const isOpen=()=>native?popup.matches(':popover-open'):popup.hasAttribute('data-fallback-open');
  let focusPending=false;
  const placement=bindCardPopupPosition(host,trigger,popup,()=>host._insightOpen===key,()=>{
   host._insightPending=null;
   if(native){if(!isOpen())popup.showPopover();}else popup.setAttribute('data-fallback-open','');
   if(focusPending){popup.querySelector('[data-insight-close]')?.focus({preventScroll:true});focusPending=false;}
   restoreChartInsightFocus(host);
  }),position=placement.position;
  cleanups.push(()=>placement.disconnect());
  const close=(focus=false)=>{if(host._insightOpen===key)host._insightOpen=null;host._insightPending=null;trigger.setAttribute('aria-expanded','false');if(native){if(isOpen())popup.hidePopover();}else popup.removeAttribute('data-fallback-open');if(focus)trigger.focus({preventScroll:true});};
  const open=(focus=true)=>{closeOtherCardPopups(host,'insight');host._insightOpen=key;host._insightPending=key;focusPending=focus;trigger.setAttribute('aria-expanded','true');position();};
  let pointerWasOpen;trigger.onpointerdown=()=>{pointerWasOpen=isOpen();};trigger.onpointercancel=()=>{pointerWasOpen=undefined;};
  trigger.onclick=()=>{const wasOpen=pointerWasOpen??isOpen();pointerWasOpen=undefined;wasOpen?close(true):open();};
  popup.querySelector('[data-insight-close]').onclick=()=>close(true);
  popup.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}};
  popup.addEventListener('toggle',e=>{if(root.querySelector(`[data-insight-panel="${key}"]`)!==popup)return;trigger.setAttribute('aria-expanded',String(e.newState==='open'));if(e.newState==='closed'&&host._insightOpen===key)host._insightOpen=null;});
  for(const button of popup.querySelectorAll('[data-isolate]'))button.onclick=()=>{close(true);isolateChartSeries(host,button.dataset.isolate);};
  const all=popup.querySelector('[data-show-all]');if(all)all.onclick=()=>{close(true);showAllChartSeries(host);};
  listen(window,'resize',()=>{if(isOpen()){if(trigger.getClientRects().length)position();else close();}});
  listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(popup))close();},true);
  listen(document,'pointerdown',e=>{if((!native||host._insightPending===key)&&host._insightOpen===key&&!e.composedPath().includes(control))close();});
  if(host._insightOpen===key)open(false);
 }
 restoreChartInsightFocus(host);
 if(host._insightFocus)listen(document,'pointerdown',e=>{if(!e.composedPath().includes(host)){host._insightFocus=null;host._insightOpen=null;host._insightPending=null;}},true);
 bindChartLegend(host);
}
function chartInsightStyles(){return `
.chart-context{display:flex;align-items:center;justify-content:space-between;gap:6px 12px;flex-wrap:wrap;flex:none;margin:0 0 8px;min-width:0}
.chart-range{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;min-width:0;flex:1}
.chart-range .period-panel{margin:0}
.zoom-status{font-size:11px;color:var(--primary-text-color,#20252b);background:var(--secondary-background-color,#eee);border-radius:4px;padding:2px 6px;white-space:nowrap}
.insight-control{display:inline-flex;flex:none}
.insight-trigger{font:inherit;font-size:11px;min-height:28px;padding:3px 7px;display:flex;align-items:center;gap:5px;border:0;border-radius:5px;background:transparent;color:var(--primary-text-color,#20252b);cursor:pointer}
.insight-trigger svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.insight-trigger:hover{background:var(--secondary-background-color,#eee)}
.header-actions .insight-trigger{width:32px;height:32px;padding:0;background:var(--secondary-background-color,#eee);border-radius:5px}
.header-actions .insight-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.header-actions .insight-trigger svg{width:18px;height:18px;stroke-width:2}
.insight-trigger:focus-visible,.insight-popup button:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.insight-popup{z-index:21}
.insight-popup:popover-open{display:block}
.insight-popup[data-fallback-open]{display:block}
.insight-popup button{display:block;box-sizing:border-box;width:auto;height:auto;padding:0;font:inherit;cursor:pointer;color:inherit;background:transparent;border:0;border-radius:5px;min-height:30px}
.insight-popup button:disabled{opacity:.4;cursor:default}
.insight-popup button:hover{background:var(--secondary-background-color,#eee)}
.insight-popup p{margin:8px 0 12px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-popup p strong{color:var(--primary-text-color,#20252b);font-weight:500}
.insight-popup .insight-choice{display:block;width:100%;padding:6px 8px;text-align:start;overflow-wrap:anywhere}
.insight-choice[aria-pressed="true"]{background:var(--secondary-background-color,#eee);font-weight:600}
.insight-sensors{display:grid}
.insight-sensor{min-width:0;padding:8px 0}
.insight-sensor+.insight-sensor{border-top:1px solid var(--divider-color,#ddd)}
.insight-sensor-heading{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 8px}
.insight-sensor-heading>strong{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:600}
.insight-source{font-size:10px;font-weight:400;color:var(--secondary-text-color,#666);color:color-mix(in srgb,var(--secondary-text-color,#666) 90%,var(--ha-card-background,var(--card-background-color,#fff)));flex:none}
.insight-unit{white-space:nowrap}
.insight-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 8px;margin:6px 0 0}
.insight-metrics.has-total{grid-template-columns:repeat(4,minmax(0,1fr))}
.insight-metrics>div{min-width:0}
.insight-metrics dt{font-size:10px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-metrics dd{margin:1px 0 0;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;color:var(--primary-text-color,#20252b)}
.insight-states{font-size:10px;color:var(--secondary-text-color,#666);margin-top:4px}
.insight-durations{margin:6px 0 0;display:grid;gap:4px}
.insight-durations>div{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:12px}
.insight-durations dt{min-width:0;overflow-wrap:anywhere;color:var(--secondary-text-color,#666)}
.insight-durations dd{margin:0;color:var(--primary-text-color,#20252b);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
[data-series]{touch-action:manipulation}
`;}

// ../history-graph-card/src/history-utils.js
function validColor(color){return typeof color==='string'?/^#[\da-f]{6}$/i.test(color):Array.isArray(color)&&color.length===3&&color.every(v=>Number.isInteger(v)&&v>=0&&v<=255);}
const SERIES_COLORS=['#2196f3','#e78a14','#ab70d9','#26a69a','#e66b91','#718cc2','#a18d3a','#718d78'];
const APPEARANCE_KEYS=['line_width','line_style','line_interpolation','line_color','show_fill','fill_color','fill_opacity','fill_fade','gradient_mode','gradient_stops'];
// Resolve legacy inheritance once. Explicit modes on new rows have no implicit precedence.
const LINE_GEOMETRY_KEYS=['line_width','line_style','line_interpolation'];
function seriesAppearance(config,index,seen=new Set()) {
 if(seen.has(config.entities[index]))throw new Error('line_style_source_cycle');
 seen.add(config.entities[index]);
 const option=config.series_options?.find(s=>s.entity===config.entities[index])??{};
 const inherited=option.gradient_stops??(option.color?[]:config.gradient_stops??[]);
 const color_mode=option.color_mode??(inherited.length?'gradient':'fixed');
 const row={entity:config.entities[index],visible:option.visible??true,...(option.name?{name:option.name}:{}),
  line_width:option.line_width??config.line_width??3.5,line_style:option.line_style??config.line_style??(index%2?'dashed':'solid'),
  line_interpolation:option.line_interpolation??config.line_interpolation??'step',connect_gaps:option.connect_gaps??false,
  color_mode,color:option.color||config.line_color||SERIES_COLORS[index%SERIES_COLORS.length],
  gradient_mode:option.gradient_mode??config.gradient_mode??'smooth',gradient_stops:option.gradient_stops??inherited,
  show_fill:option.show_fill??config.show_fill??false,fill_opacity:option.fill_opacity??config.fill_opacity??0.18,
  fill_fade:option.fill_fade??config.fill_fade??true,
  fill_mode:option.fill_mode??((option.fill_color||config.fill_color)?'own':'line'),
  fill_color:option.fill_color||config.fill_color||option.color||config.line_color||SERIES_COLORS[index%SERIES_COLORS.length]};
 if(option.line_style_source){
  const source=config.entities.indexOf(option.line_style_source);
  if(source<0)throw new Error('line_style_source_missing');
  const style=seriesAppearance(config,source,seen);
  for(const key of LINE_GEOMETRY_KEYS)row[key]=style[key];
  row.line_style_source=option.line_style_source;
 }
 return structuredClone(row);
}
function editorConfig(config) {
 const data={hours_to_show:24,data_source:'auto',graph_mode:'lines',aggregation_period:'none',aggregation_method:'avg',show_hover_line:true,show_legend:true,show_title:true,show_navigation:true,show_grid:true,align_zero:true,sync_hover:true,hover_sync_group:'',...config,entities:(config.entities??[]).map((entity,index)=>{
  const row=seriesAppearance(config,index);
  for(const key of ['color','fill_color'])if(validColor(row[key]))row[key]=[...rgb(row[key])];
  row.gradient_stops=row.gradient_stops.map(s=>({...s,color:validColor(s.color)?[...rgb(s.color)]:s.color}));
  return row;
 })};
 delete data.series_options;for(const key of APPEARANCE_KEYS)delete data[key];return data;
}
function cardConfig(data) {
 const result={...data,entities:(data.entities??[]).map(row=>row.entity)};
 result.series_options=(data.entities??[]).map((row,index)=>{
  const resolved=seriesAppearance({entities:result.entities,series_options:data.entities},index);
  if(!row.name)delete resolved.name;return resolved;
 });
 for(const key of APPEARANCE_KEYS)delete result[key];return result;
}
// Keep effective geometry concrete in editor rows; the explicit link remains its owner.
function resolvedEditorRows(rows){
 const config={entities:rows.map(r=>r.entity),series_options:rows};
 return rows.map((row,index)=>{
  if(!row.entity)return structuredClone(row);
  const result=structuredClone(row),effective=seriesAppearance(config,index);
  for(const key of LINE_GEOMETRY_KEYS)result[key]=effective[key];
  return result;
 });
}
function updateSeriesRow(data,index,value){
 const rows=resolvedEditorRows(data.entities),old=rows[index];
 rows[index]={...old,...structuredClone(value)};
 // Detaching takes the effective source geometry, never stale hidden fields.
 if(old.line_style_source&&!rows[index].line_style_source){
  delete rows[index].line_style_source;
  for(const key of LINE_GEOMETRY_KEYS)rows[index][key]=old[key];
 }
 if(old.entity&&old.entity!==rows[index].entity)for(const row of rows){
  if(row.line_style_source===old.entity){
   if(rows[index].entity)row.line_style_source=rows[index].entity;
   else delete row.line_style_source;
  }
 }
 return {...data,entities:resolvedEditorRows(rows)};
}
function removeSeriesRow(data,index){
 const rows=resolvedEditorRows(data.entities),removed=rows[index].entity;
 const remaining=rows.filter((_,i)=>i!==index);
 for(const row of remaining)if(row.line_style_source===removed)delete row.line_style_source;
 return {...data,entities:resolvedEditorRows(remaining)};
}
function lineStyleSources(rows,row){
 return rows.filter(candidate=>{
  if(!candidate.entity||candidate.entity===row.entity)return false;
  const seen=new Set([row.entity]);let current=candidate;
  while(current){
   if(seen.has(current.entity))return false;
   seen.add(current.entity);
   current=rows.find(r=>r.entity===current.line_style_source);
  }
  return true;
 });
}
function validateConfig(config) {
 const entities=config?.entities;
 if(!Array.isArray(entities)||entities.length<1||entities.length>8||entities.some(id=>typeof id!=='string'||!/^sensor\.[a-z0-9_]+$/.test(id))||new Set(entities).size!==entities.length) throw new Error('entities');
 const hours=config.hours_to_show??24;
 if(typeof hours!=='number'||!Number.isFinite(hours)||hours<1||hours>8760) throw new Error('hours');
 if(config.title!==undefined&&typeof config.title!=='string') throw new Error('title');
 const result={line_interpolation:'step',line_width:3.5,show_fill:false,fill_fade:true,fill_opacity:0.18,show_hover_line:true,show_legend:true,show_title:true,show_navigation:true,show_grid:true,align_zero:true,sync_hover:true,hover_sync_group:'',...config,entities:[...entities],hours_to_show:hours};
 if(typeof result.sync_hover!=='boolean')throw new Error('sync_hover');
 if(result.hover_sync_group==null)result.hover_sync_group='';
 if(typeof result.hover_sync_group!=='string')throw new Error('hover_sync_group');
 result.line_interpolation=result.line_interpolation==null||result.line_interpolation===''?'step':result.line_interpolation;
 if(!['smooth','linear','step'].includes(result.line_interpolation))throw new Error('line_interpolation');
 for(const key of ['y_min','y_max']){
  if(result[key]==null||result[key]==='')delete result[key];
  else if(!Number.isFinite(result[key]))throw new Error(key);
 }
 if(result.y_min!==undefined&&result.y_max!==undefined&&result.y_min>=result.y_max)throw new Error('y_range');
 if(result.y_step==null||result.y_step==='')delete result.y_step;
 else if(!Number.isFinite(result.y_step)||result.y_step<=0)throw new Error('y_step');
 if(result.y_step!==undefined&&result.y_min!==undefined&&result.y_max!==undefined)yAxis([],result);
 if(!Number.isFinite(result.line_width)||result.line_width<1||result.line_width>8) throw new Error('line_width');
 if(result.line_style!=null&&!['solid','dashed','dotted'].includes(result.line_style)) throw new Error('line_style');
 for(const key of ['line_color','fill_color']) if(result[key]!=null&&result[key]!==''&&!validColor(result[key])) throw new Error(key);
 for(const key of ['show_fill','fill_fade','show_hover_line','show_legend','show_navigation','show_grid','align_zero']) if(typeof result[key]!=='boolean') throw new Error(key);
 if(!Number.isFinite(result.fill_opacity)||result.fill_opacity<0||result.fill_opacity>1) throw new Error('fill_opacity');
 const stops=result.gradient_stops??[];
 if(!Array.isArray(stops)||(stops.length!==0&&stops.length<2)||stops.length>32||stops.some(s=>!s||!Number.isFinite(s.value)||!validColor(s.color))||new Set(stops.map(s=>s.value)).size!==stops.length) throw new Error('gradient_stops');
 result.gradient_stops=stops.map(s=>({value:s.value,color:Array.isArray(s.color)?[...s.color]:s.color})).sort((a,b)=>a.value-b.value);
 result.gradient_mode=result.gradient_mode??'smooth';
 if(!['smooth','steps'].includes(result.gradient_mode)) throw new Error('gradient_mode');
 result.graph_mode=result.graph_mode??'lines';
 result.data_source=result.data_source??'auto';
 if(!['auto','history','statistics'].includes(result.data_source))throw new Error('data_source');
 result.aggregation_period=result.aggregation_period??'none';result.aggregation_method=result.aggregation_method??'avg';
 if(!['none','minute','quarter_hour','hour','day','week','month'].includes(result.aggregation_period))throw new Error('aggregation_period');
 if(!['min','max','avg','delta'].includes(result.aggregation_method))throw new Error('aggregation_method');
 if(!['lines','stacked'].includes(result.graph_mode))throw new Error('graph_mode');
 const options=result.series_options??[];
 if(!Array.isArray(options)||options.some(s=>!s||!entities.includes(s.entity)||(s.name!=null&&typeof s.name!=='string')||(s.color!=null&&s.color!==''&&!validColor(s.color)))||new Set(options.map(s=>s.entity)).size!==options.length)throw new Error('series_options');
 result.series_options=options.map(s=>{
  if(s.line_style_source!=null&&s.line_style_source!==''&&(typeof s.line_style_source!=='string'||!entities.includes(s.line_style_source)||s.line_style_source===s.entity))throw new Error('line_style_source');
  if(s.line_width!=null&&(!Number.isFinite(s.line_width)||s.line_width<1||s.line_width>8))throw new Error('series_line_width');
  for(const [key,allowed] of Object.entries({line_style:['solid','dashed','dotted'],line_interpolation:['smooth','linear','step'],color_mode:['fixed','gradient'],fill_mode:['line','own']}))if(s[key]!=null&&!allowed.includes(s[key]))throw new Error('series_'+key);
  for(const key of ['show_fill','fill_fade','visible','connect_gaps'])if(s[key]!=null&&typeof s[key]!=='boolean')throw new Error('series_'+key);
  if(s.fill_opacity!=null&&(!Number.isFinite(s.fill_opacity)||s.fill_opacity<0||s.fill_opacity>1))throw new Error('series_fill_opacity');
  if(s.fill_color!=null&&s.fill_color!==''&&!validColor(s.fill_color))throw new Error('series_fill_color');
  if(s.color_mode==='gradient'&&(!Array.isArray(s.gradient_stops)||s.gradient_stops.length<2))throw new Error('series_gradient_stops');
  if(s.gradient_mode!=null&&!['smooth','steps'].includes(s.gradient_mode))throw new Error('series_gradient_mode');
  const row={...s,color:Array.isArray(s.color)?[...s.color]:s.color,fill_color:Array.isArray(s.fill_color)?[...s.fill_color]:s.fill_color};
  if(s.gradient_stops!=null){const stops=s.gradient_stops;if(!Array.isArray(stops)||(stops.length!==0&&stops.length<2)||stops.length>32||stops.some(s=>!s||!Number.isFinite(s.value)||!validColor(s.color))||new Set(stops.map(s=>s.value)).size!==stops.length)throw new Error('series_gradient_stops');row.gradient_stops=stops.map(s=>({value:s.value,color:Array.isArray(s.color)?[...s.color]:s.color})).sort((a,b)=>a.value-b.value);}
  return row;
 });
 for(let i=0;i<entities.length;i++)seriesAppearance(result,i);
 return result;
}
function rgb(color){return Array.isArray(color)?color:[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));}
function gradientColor(stops,value,mode='smooth'){
 if(!stops.length||!Number.isFinite(value)) return null;
 let color=rgb(stops[0].color);
 for(let i=1;i<stops.length;i++){
  const a=stops[i-1],b=stops[i];
  if(value<b.value){const ratio=mode==='steps'?0:Math.max(0,(value-a.value)/(b.value-a.value));const end=rgb(b.color);color=rgb(a.color).map((v,j)=>Math.round(v+(end[j]-v)*ratio));return `rgb(${color.join(',')})`;}
  color=rgb(b.color);
 }
 return `rgb(${color.join(',')})`;
}
// Statistics are hourly/calendar summaries; counter Delta uses Recorder change.
function statisticsPeriod(config,end=Date.now()){
 const source=config.data_source??'auto',period=config.aggregation_period??'none';
 const supported=['none','hour','day','week','month'].includes(period)&&(config.aggregation_method!=='delta'||period!=='none');
 if(source==='statistics'&&!supported)throw new Error('statistics_config');
 if(source==='history'||!supported||(source==='auto'&&config.hours_to_show<=48&&Date.now()-end<=48*3600000))return null;
 return period==='none'?'hour':period;
}
// HA has used epoch seconds and milliseconds across Recorder versions.
function statisticTime(value){return typeof value==='number'?(value<1e12?value*1000:value):Date.parse(value);}
async function loadHistorySeries(hass,config,start,end){
 const period=statisticsPeriod(config,end),strict=config.data_source==='statistics',selected=new Map();
 if(period){
  try{
   const metadata=await hass.callWS({type:'recorder/get_statistics_metadata',statistic_ids:config.entities});
   const field=config.aggregation_method==='delta'?'change':config.aggregation_method==='min'?'min':config.aggregation_method==='max'?'max':'mean';
   const ids=config.entities.filter(id=>metadata.some(m=>m.statistic_id===id&&(field==='change'?m.has_sum===true:m.has_mean===true||(typeof m.mean_type==='number'&&m.mean_type!==0))&&((m.statistics_unit_of_measurement??m.unit_of_measurement??'')===(hass.states?.[id]?.attributes?.unit_of_measurement??''))));
   if(strict&&ids.length!==config.entities.length)throw new Error('statistics_unavailable');
   if(ids.length){
    // Recorder change is the period's growth of sum, including HA's counter
    // reset handling and the baseline before the first requested period.
    const response=await hass.callWS({type:'recorder/statistics_during_period',statistic_ids:ids,start_time:new Date(start).toISOString(),end_time:new Date(end).toISOString(),period,types:[field]});
    for(const id of ids){
     if(!Array.isArray(response[id])){if(strict)throw new Error('statistics_unavailable');continue;}
     const points=[];
     // End every bin explicitly: missing bins and unfinished tails stay gaps.
     for(const row of [...response[id]].sort((a,b)=>statisticTime(a.start)-statisticTime(b.start))){
      const a=Math.max(start,statisticTime(row.start)),b=Math.min(end,statisticTime(row.end));
      if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)continue;
      points.push({t:a,v:typeof row[field]==='number'&&Number.isFinite(row[field])?row[field]:null},{t:b,v:null});
     }
     if(points.some(p=>p.v!==null)||strict)selected.set(id,{id,source:'statistics',points:[...new Map(points.map(p=>[p.t,p])).values()].sort((a,b)=>a.t-b.t)});
    }
   }
  }catch(error){if(strict)throw error;selected.clear();}
 }
 const missing=config.entities.filter(id=>!selected.has(id));
 if(missing.length){
  const response=await hass.callApi('GET',historyUrl({...config,entities:missing},end));
  for(const s of decodeHistory(response,missing,start,end))selected.set(s.id,s);
 }
 return config.entities.map(id=>selected.get(id));
}
function numericState(state) {
 if(typeof state!=='string'||state.trim()==='') return null;
 const number=Number(state); return Number.isFinite(number)?number:null;
}
function decodeHistory(response,entities,start,end) {
 if(!Array.isArray(response)||response.some(rows=>!Array.isArray(rows))) throw new Error('response');
 const byId=new Map();
 for(const rows of response) {
  if(!rows.length) continue;
  const id=rows[0]?.entity_id;
  if(!entities.includes(id)) continue;
  const points=rows.map(row=>({t:Date.parse(row.last_updated??row.last_changed),v:numericState(row.state)})).filter(p=>Number.isFinite(p.t)&&p.t<=end).sort((a,b)=>a.t-b.t);
  const previous=points.filter(p=>p.t<start).at(-1);
  const clipped=points.filter(p=>p.t>=start);
  if(previous) clipped.unshift({...previous,t:start});
  byId.set(id,[...new Map(clipped.map(p=>[p.t,p])).values()]);
 }
 return entities.map(id=>({id,points:byId.get(id)??[]}));
}
function valueAt(points,time) {
 let left=0,right=points.length-1,index=-1;
 while(left<=right) {const mid=(left+right)>>1;if(points[mid].t<=time){index=mid;left=mid+1;}else right=mid-1;}
 return index<0?null:points[index].v;
}
function stepPath(points,end,x,y) {
 let path='',active=false;
 for(const point of points) {
  if(active) path+=` H ${x(point.t)}`;
  if(point.v===null) {active=false;continue;}
  path+=active?` V ${y(point.v)}`:`${path?' ':''}M ${x(point.t)} ${y(point.v)}`;
  active=true;
 }
 if(active) path+=` H ${x(end)}`;
 return path;
}
function seriesMetadata(hass,entities,options=[]) {
 const items=entities.map(id=>{
  const state=hass.states?.[id]; if(!state) throw new Error('missing');
  const option=options.find(s=>s.entity===id);
  return {id,name:option?.name||state.attributes?.friendly_name||id,unit:state.attributes?.unit_of_measurement??''};
 });
 return {items,unit:items[0]?.unit??''};
}
// Group by exact unit, never add or scale incompatible quantities together.
function graphAxes(series,meta,config,start,end,visible=series.map(()=>true)){
 const units=[...new Set(meta.items.filter((_,i)=>visible[i]).map(item=>item.unit))];
 if(!units.length)units.push(meta.items[0]?.unit??'');
 const seriesAxes=meta.items.map(item=>units.indexOf(item.unit));
 const plotSeries=config.graph_mode==='stacked'?series.slice():series;
 const axes=units.map((unit,index)=>{
  const indices=seriesAxes.flatMap((axis,i)=>axis===index&&visible[i]?[i]:[]);
  let group=indices.map(i=>series[i]);
  if(config.graph_mode==='stacked'){
   group=stackSeries(group,start,end);
   indices.forEach((i,j)=>{plotSeries[i]=group[j];});
  }
  return {unit,...yAxis(group,unit===meta.items[0]?.unit?config:{})};
 });
 return {axes:alignGridAxes(alignZeroAxes(axes,config,meta.items[0]?.unit),config),seriesAxes,plotSeries};
}
// Keep the first axis (including manual bounds/step) as the grid reference.
// Other units use their own round step, expanding their ranges to fit the same
// tick heights. A whole-step offset keeps each scale anchored at round values.
function alignGridAxes(axes,config={}){
 if(axes.length<2)return axes;
 const reference=axes[0],span=reference.max-reference.min;
 if(!reference.ticks.length)return axes.map((axis,i)=>i?{...axis,ticks:[]}:axis);
 const bottom=reference.min/reference.step,top=reference.max/reference.step;
 const clean=value=>Number(value.toPrecision(15));
 const nice=value=>{
  const power=10**Math.floor(Math.log10(value));
  return clean(([1,2,5,10].find(n=>n*power>=value*(1-1e-14))??10)*power);
 };
 const negative=axes.filter(a=>a.min<0);
 const alignZero=config.align_zero!==false&&negative.length>1&&
  !(reference.min<0&&(reference.max<0||(reference.max===0&&negative.some(a=>a.max>0))));
 let zeroOffset=alignZero&&reference.min<0?0:null;
 return axes.map((axis,i)=>{
  if(!i)return axis;
  let step=nice((axis.max-axis.min)*(reference.step/span));
  const locked=alignZero&&axis.min<0?zeroOffset:null;
  const finish=(step,offset)=>{
   const min=clean((bottom+offset)*step),max=clean((top+offset)*step);
   const ticks=reference.ticks.map(t=>clean((t/reference.step+offset)*step));
   if(!Number.isFinite(min)||!Number.isFinite(max)||!(max>min)||ticks.some((t,j)=>!Number.isFinite(t)||(j&&t<=ticks[j-1])))throw new Error('y_step_count');
   if(alignZero&&axis.min<0&&zeroOffset===null)zeroOffset=offset;
   return {...axis,min,max,step,ticks};
  };
  for(let attempt=0;attempt<32;attempt++){
   const lower=axis.max/step-top,upper=axis.min/step-bottom;
   const epsilon=Number.EPSILON*Math.max(1,Math.abs(lower),Math.abs(upper))*8;
   const first=Math.ceil(lower-epsilon),last=Math.floor(upper+epsilon);
   const offset=locked??Math.max(first,Math.min(last,0));
   if(locked!==null?offset>=lower-epsilon&&offset<=upper+epsilon:first<=last){
    return finish(step,offset);
   }
   step=nice(step*(1+1e-10));
  }
  // A manual step can leave only an edge tick (e.g. 25–30, step 10).
  // A secondary range crossing zero cannot fit an integer offset there.
  // Allow shifted tick values instead of rejecting a valid configuration.
  step=nice((axis.max-axis.min)*(reference.step/span));
  return finish(step,Math.max(axis.max/step-top,Math.min(axis.min/step-bottom,0)));
 });
}
// Expand only negative axes; never rescale readings or clip the original ranges.
function alignZeroAxes(axes,config={},primaryUnit=axes[0]?.unit){
 if(config.align_zero===false)return axes;
 const negative=axes.filter(a=>a.min<0);
 if(negative.length<2)return axes;
 const primary=negative.find(a=>a.unit===primaryUnit);
 const fixed=primary&&[config.y_min,config.y_max].some(Number.isFinite);
 const fraction=a=>-a.min/(a.max-a.min);
 // Explicit first-unit bounds win, including bounds that exclude zero.
 if(fixed&&(primary.max<0||(primary.max===0&&negative.some(a=>a.max>0))))return axes;
 const part=fixed?fraction(primary):negative.reduce((sum,a)=>sum+Math.min(1,fraction(a)),0)/negative.length;
 return axes.map(a=>{
  if(a.min>=0||(fixed&&a===primary))return a;
  const span=Math.max(-a.min/part,part===1?0:Math.max(0,a.max)/(1-part));
  const min=-span*part,max=part===1?0:span*(1-part);
  const options={y_min:min,y_max:max,...(a.unit===primaryUnit&&config.y_step!=null?{y_step:config.y_step}:{})};
  return {unit:a.unit,...yAxis([],options)};
 });
}
function yRange(series,config={}) {
 let min=Infinity,max=-Infinity;
 for(const s of series) for(const p of s.points) for(const value of [p.v,p.base])if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value);}
 if(min===Infinity){min=0;max=1;}
 else {const padding=min===max?Math.max(1,Math.abs(min)*0.05):(max-min)*0.08;min-=padding;max+=padding;}
 if(Number.isFinite(config.y_min))min=config.y_min;
 if(Number.isFinite(config.y_max))max=config.y_max;
 if(min>=max){
  if(Number.isFinite(config.y_min)&&Number.isFinite(config.y_max))throw new Error('y_range');
  if(Number.isFinite(config.y_min))max=min+Math.max(1,Math.abs(min)*0.05);
  else min=max-Math.max(1,Math.abs(max)*0.05);
 }
 return [min,max];
}
// Preserve yRange's padding contract; only the displayed axis uses nice steps.
function yAxis(series,config={}){
 if(config.y_step!=null&&config.y_step!==''&&(!Number.isFinite(config.y_step)||config.y_step<=0))throw new Error('y_step');
 let [min,max]=yRange(series,config);
 const target=(max-min)/4,power=10**Math.floor(Math.log10(target));
 const step=(config.y_step===''?undefined:config.y_step)??([1,2,5,10].find(n=>n*power>=target)??10)*power;
 const clean=value=>Number(value.toPrecision(15));
 // Snap only floating-point noise at integral step indices (e.g. 0.3 / 0.1).
 const index=value=>{const n=value/step,nearest=Math.round(n);return Math.abs(n-nearest)<=Number.EPSILON*Math.max(1,Math.abs(n))*4?nearest:n;};
 if(!Number.isFinite(config.y_min))min=clean(Math.floor(index(min))*step);
 if(!Number.isFinite(config.y_max))max=clean(Math.ceil(index(max))*step);
 const first=Math.ceil(index(min)),last=Math.floor(index(max));
 const count=Math.max(0,last-first+1);
 if(!Number.isFinite(count)||count>200||!Number.isFinite(min)||!Number.isFinite(max)||!Number.isFinite(max-min)||!(max>min))throw new Error('y_step_count');
 const ticks=Array.from({length:count},(_,i)=>clean((first+i)*step));
 if(ticks.some((v,i)=>!Number.isFinite(v)||(i&&v<=ticks[i-1])))throw new Error('y_step_count');
 return {min,max,step,ticks};
}
function periodBounds(t,period,zone='UTC'){return graphPeriodBounds(t,period,zone);}
function aggregateSeries(series,start,end,period='none',method='avg',zone='UTC',{preserveGaps=true}={}){
 if(period==='none')return series;
 const bounds=[];for(let a=start;a<end;){const b=Math.min(end,periodBounds(a,period,zone)[1]);bounds.push([a,b]);a=b;}
 return series.map(s=>{if(s.source==='statistics')return s;const points=[];let index=0;
  for(const [a,b] of bounds){let cursor=a,total=0,duration=0,min=Infinity,max=-Infinity;
   while(index<s.points.length&&s.points[index].t<=a)index++;
   let value=index?s.points[index-1].v:null;
   if(method==='delta'){
    const first=value;let valid=Number.isFinite(first);
    // Recorder holds each reading until the next one. Include an exact end
    // boundary once as this bin's end and the following bin's start.
    while(index<s.points.length&&s.points[index].t<=b){value=s.points[index++].v;valid&&=Number.isFinite(value);}
    points.push({t:a,v:valid?value-first:null});continue;
   }
   const fragments=[{t:a,valid:value!==null}];
   while(cursor<b){const until=Math.min(b,s.points[index]?.t??b);if(value!==null){total+=value*(until-cursor);duration+=until-cursor;min=Math.min(min,value);max=Math.max(max,value);}cursor=until;if(cursor<b){value=s.points[index++].v;if((value!==null)!==fragments.at(-1).valid)fragments.push({t:cursor,valid:value!==null});}}
   const aggregate=duration?(method==='min'?min:method==='max'?max:total/duration):null;
   if(preserveGaps)for(const f of fragments)points.push({t:f.t,v:f.valid?aggregate:null});
   else points.push({t:a,v:aggregate});
  }
  return {id:s.id,points};
 });
}
// Drawing only: bridge internal gaps, retaining unknown starts and tails.
// Run before viewport clipping so a zoom entirely inside a gap keeps both anchors.
function connectGapPoints(points){
 const first=points.findIndex(p=>p.v!==null);if(first<0)return points;
 let last=points.length-1;while(last>first&&points[last].v===null)last--;
 return points.filter((p,i)=>p.v!==null||i<first||i>last);
}
function displayPoints(points,start,end,bins=1500){
 let first=0,last=points.length;while(first<last){const mid=(first+last)>>1;if(points[mid].t<start)first=mid+1;else last=mid;}
 const begin=Math.max(0,first-1);first=begin;last=points.length;while(first<last){const mid=(first+last)>>1;if(points[mid].t<=end)first=mid+1;else last=mid;}
 const clipped=points.slice(begin,Math.min(points.length,first+1));if(clipped.length<=bins*4)return clipped;
 const keep=new Set([0,clipped.length-1]);let bin=-1,group=[];
 const flush=()=>{if(!group.length)return;keep.add(group[0]);keep.add(group.at(-1));let min=group[0],max=min;for(const i of group){if(clipped[i].v<clipped[min].v)min=i;if(clipped[i].v>clipped[max].v)max=i;}keep.add(min);keep.add(max);group=[];};
 clipped.forEach((p,i)=>{const next=Math.floor((p.t-start)/(end-start)*bins);if(next!==bin){flush();bin=next;}if(p.v===null){flush();for(const j of [i-1,i,i+1])if(j>=0&&j<clipped.length)keep.add(j);}else group.push(i);});flush();
 return [...keep].sort((a,b)=>a-b).map(i=>clipped[i]);
}
function stackSeries(series,start,end){
 const times=[...new Set([start,...series.flatMap(s=>s.points.map(p=>p.t).filter(t=>t>=start&&t<end))])].sort((a,b)=>a-b);
 const result=series.map(s=>({id:s.id,points:[]}));
 for(const t of times){let positive=0,negative=0,missing=false;
  series.forEach((s,i)=>{const value=valueAt(s.points,t);missing ||= value===null;const base=value<0?negative:positive;
   result[i].points.push({t,v:missing?null:base+value,base:missing?null:base});
   if(value!==null){if(value<0)negative+=value;else positive+=value;}
  });
 }
 return result;
}
function historyUrl(config,end) {
 const start=new Date(end-config.hours_to_show*3600000).toISOString();
 const query=new URLSearchParams({filter_entity_id:config.entities.join(','),end_time:new Date(end).toISOString(),minimal_response:'',no_attributes:'',significant_changes_only:'0'});
 return `history/period/${encodeURIComponent(start)}?${query}`;
}

// ../history-graph-card/src/localization.js
const translations={
 title:['History','Historie'],loading:['Loading history…','Historie laden…'],empty:['No numeric history in this range.','Geen numerieke historie in deze periode.'],error:['History unavailable. Check recorder and connection.','Historie niet beschikbaar. Controleer recorder en verbinding.'],unit:['All sensors must have the same unit.','Alle sensoren moeten dezelfde eenheid hebben.'],missing:['Configured sensor not found.','Ingestelde sensor niet gevonden.'],unavailable:['Unavailable','Niet beschikbaar'],retry:['Retry','Opnieuw proberen'],chart:['History graph. Arrow keys, Home and End select a time; Escape closes details.','Historiegrafiek. Pijltjes, Home en End selecteren een tijd; Escape sluit details.'],entities:['Sensors','Sensoren'],hours_to_show:['Hours to show','Aantal uren'],hoursHelper:['Historical range: 1–8760 hours. Each different unit gets its own Y-axis.','Historische periode: 1–8760 uur. Iedere verschillende eenheid krijgt een eigen Y-as.'],titleField:['Title','Titel'],partial:['Some sensors have no numeric history:','Sommige sensoren hebben geen numerieke historie:'],config:['Invalid configuration: use 1–8 distinct sensors and 1–8760 hours.','Ongeldige configuratie: gebruik 1–8 unieke sensoren en 1–8760 uur.']};
Object.assign(translations,{
 show_title:['Show title','Titel tonen'],
 show_navigation:['Show timeframe selection','Tijdvakselectie tonen'],
 show_grid:['Show grid','Grid tonen'],
 show_gridHelper:['Show horizontal Y-axis grid lines and the left and right plot boundaries. Axis labels and data remain visible.','Toon horizontale Y-aslijnen en de linker- en rechterrand van de grafiek. Aslabels en gegevens blijven zichtbaar.'],
 show_navigationHelper:['Show the timeframe menu, previous/next, Now and the selected date range. The configured hours remain the default; aggregation is unchanged.','Toon het tijdvakmenu, vorige/volgende, Nu en het gekozen datumbereik. De ingestelde uren blijven de standaard; aggregatie verandert niet.'],
 data_source:['Data source','Gegevensbron'],auto:['Automatic','Automatisch'],history:['Raw history','Ruwe historie'],statistics:['Statistics','Statistics'],
 data_sourceHelper:['Automatic: statistics for ranges longer than 48 hours or ending more than 48 hours ago; raw history otherwise. Unsupported sensors fall back to history. Statistics use hour/day/week/month summaries (None uses hour). Delta uses counter change statistics, including counter resets. Minute and quarter-hour require history.','Automatisch: statistics bij periodes langer dan 48 uur of die meer dan 48 uur geleden eindigen; anders ruwe historie. Sensoren zonder ondersteuning vallen terug op historie. Statistics gebruikt uur/dag/week/maand (Geen gebruikt uur). Delta gebruikt tellerstatistieken, inclusief tellerresets. Minuut en kwartier vereisen historie.'],
 statistics_config:['Statistics requires hour, day, week or month. None uses hour for minimum, maximum or average; Delta requires an explicit period. Choose History for minute or quarter-hour.','Statistics vereist uur, dag, week of maand. Geen gebruikt uur bij minimum, maximum of gemiddelde; Delta vereist een expliciet tijdvak. Kies Historie voor minuut of kwartier.'],
 statistics_unavailable:['Statistics unavailable for a selected sensor or its unit. Delta requires counter statistics; minimum, maximum and average require measurement statistics. Choose Automatic or History.','Statistics ontbreekt voor een gekozen sensor of zijn eenheid. Delta vereist tellerstatistieken; minimum, maximum en gemiddelde vereisen meetstatistieken. Kies Automatisch of Historie.'],
 zoom:['Zoom','Zoom'],zoom_in:['Zoom in','Inzoomen'],zoom_out:['Zoom out','Uitzoomen'],zoom_reset:['Reset zoom','Zoom herstellen'],
 aggregation_period:['Aggregation period','Aggregatieperiode'],aggregation_method:['Aggregation method','Aggregatiemethode'],none:['None (raw history)','Geen (ruwe historie)'],minute:['Minute','Minuut'],quarter_hour:['Quarter hour','Kwartier'],hour:['Hour','Uur'],day:['Day','Dag'],week:['Week (Monday)','Week (maandag)'],month:['Month','Maand'],min:['Minimum','Minimum'],max:['Maximum','Maximum'],avg:['Time-weighted average','Tijdgewogen gemiddelde'],
 aggregation_periodHelper:['Applied separately to every sensor in the Home Assistant timezone. Zoom does not change it.','Per sensor toegepast in de Home Assistant-tijdzone. Zoom verandert dit niet.'],
 aggregation_methodHelper:['AVG weights numeric values by their recorded held duration; unavailable time is excluded.','AVG weegt numerieke waarden met hun geregistreerde duur; niet-beschikbare tijd wordt uitgesloten.'],
 graph_mode:['Graph mode','Grafiekmodus'],lines:['Separate lines','Losse lijnen'],stacked:['Stacked sums','Gestapelde sommen'],
 series_options:['Sensor names and colors','Sensornamen en kleuren'],entity:['Sensor','Sensor'],name:['Custom name','Eigen naam'],
 entitiesHelper:['Set name, fixed color or 2–32 color stops in each sensor entry. Sensor settings override shared colors; its own gradient overrides its fixed color.','Stel naam, vaste kleur of 2–32 kleurovergangen in per sensorregel. Sensorinstellingen gaan voor algemene kleuren; een eigen gradiënt gaat voor de eigen vaste kleur.'],
 sync_hover:['Synchronize hover','Hover synchroniseren'],hover_sync_group:['Hover synchronization group','Hover-synchronisatiegroep'],
 sync_hoverHelper:['Shares the selected time with other Eleven graphs on this page.','Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.'],
 hover_sync_groupHelper:['Cards with the same group follow each other. Empty uses the default group.','Kaarten met dezelfde groep volgen elkaar. Leeg gebruikt de standaardgroep.'],
 line_interpolation:['Line interpolation','Lijnverloop'],interpolation_smooth:['Smooth','Vloeiend'],interpolation_linear:['Linear','Recht'],interpolation_step:['Stepped','Trapvormig'],
 line_interpolationHelper:['Display only: chooses how recorded points are connected.','Alleen weergave: bepaalt hoe geregistreerde punten worden verbonden.'],
 connect_gaps:['Bridge missing data','Ontbrekende data overbruggen'],
 connect_gapsHelper:['Connect known points on either side of a gap using this line’s interpolation. Unknown starts and tails stay empty. Tooltips and calculations retain missing data.','Verbind bekende punten aan weerszijden van een gat volgens het lijnverloop. Ontbrekende data aan het begin en einde blijft leeg. Tooltips en berekeningen behouden ontbrekende waarden.'],
 y_step_error:['Invalid Y-axis step: enter a finite positive number or leave it empty for automatic steps.','Ongeldige stapgrootte Y-as: voer een eindig positief getal in of laat leeg voor automatische stappen.'],
 y_step_count:['Y-axis step cannot be drawn (maximum 200 ticks or numeric precision exceeded). Increase the step or narrow the Y-axis bounds.','Stapgrootte Y-as kan niet worden getekend (maximaal 200 maatstreepjes of numerieke precisie overschreden). Vergroot de stap of verklein het Y-asbereik.'],
 align_zero:['Align zero points','Nulpunten uitlijnen'],
 align_zeroHelper:['Align zero on negative Y-axes. Explicit first-axis bounds take priority.','Zet de nulpunten van negatieve Y-assen op dezelfde hoogte. Handmatige grenzen van de eerste as gaan voor.'],
 y_axis:['Y-axis','Y-as'],y_step:['Y-axis step','Stapgrootte Y-as'],
 y_stepHelper:['Optional positive tick interval in the sensor unit. Empty uses round 1/2/5 steps automatically. Maximum 200 ticks; increase the step or narrow the bounds if exceeded.','Optionele positieve stapgrootte in de sensoreenheid. Leeg kiest automatisch ronde 1/2/5-stappen. Maximaal 200 maatstreepjes; vergroot de stap of verklein het bereik bij overschrijding.'],
 y_min:['Y-axis minimum','Minimum Y-as'],y_max:['Y-axis maximum','Maximum Y-as'],
 y_minHelper:['Optional, in the first sensor’s unit. Empty scales automatically. Other units have independent automatic axes.','Optioneel, in de eenheid van de eerste sensor. Leeg schaalt automatisch. Andere eenheden hebben eigen automatische assen.'],
 y_maxHelper:['Optional, for the first sensor’s unit. Empty scales automatically. Must exceed the minimum.','Optioneel, voor de eenheid van de eerste sensor. Leeg schaalt automatisch. Moet hoger zijn dan het minimum.'],
 appearance:['Line and fill','Lijn en vulling'],line_style:['Line style','Lijnstijl'],line_width:['Line width','Lijndikte'],line_color:['Fixed line color','Vaste lijnkleur'],show_fill:['Fill below line','Vulling onder lijn'],fill_opacity:['Fill opacity','Dekking vulling'],fill_fade:['Fade fill','Vulling vervagen'],show_hover_line:['Show hover guide','Aanwijslijn tonen'],gradient_mode:['Color transitions','Kleurovergang'],gradient_stops:['Color stops','Kleurovergangen'],stop_value:['Sensor value','Sensorwaarde'],stop_color:['Color','Kleur'],solid:['Solid','Doorgetrokken'],dashed:['Dashed','Gestreept'],dotted:['Dotted','Gestippeld'],smooth:['Smooth gradient','Vloeiende gradiënt'],steps:['Hard transitions','Harde overgangen'],
 fill_color:['Fixed fill color','Vaste vulkleur'],fill_colorHelper:['Optional. Empty follows the line color or gradient.','Optioneel. Leeg volgt de lijnkleur of gradiënt.'],
 hours_to_showHelper:translations.hoursHelper,
 line_styleHelper:['Empty preserves the distinct default styles per sensor.','Leeg behoudt de verschillende standaard lijnstijlen per sensor.'],
 line_colorHelper:['Optional. Empty preserves sensor colors. Color stops take priority.','Optioneel. Leeg behoudt sensorkleuren. Kleurovergangen hebben voorrang.'],
 gradient_stopsHelper:['Add 2–32 distinct sensor values and colors. Values use the sensor unit, not percentages. Empty disables the gradient.','Voeg 2–32 unieke sensorwaarden met kleuren toe. Waarden gebruiken de sensoreenheid, geen percentages. Leeg schakelt de gradiënt uit.'],
 fill_fadeHelper:['Fades the fill towards the bottom of the graph.','Laat de vulling naar de onderkant van de grafiek vervagen.']
});
Object.assign(translations,{
 graph_settings:['Graph','Grafiek'],show_legend:['Show legend','Legenda tonen'],data_processing:['Data processing','Dataverwerking'],series_line:['Line','Lijn'],series_fill:['Fill','Vulling'],
 visible:['Show by default','Standaard tonen'],visibleHelper:['Initial visibility. Click the sensor in the legend to show or hide it temporarily.','Beginweergave. Klik op de sensor in de legenda om deze tijdelijk te tonen of verbergen.'],show_sensor:['Show','Toon'],hide_sensor:['Hide','Verberg'],no_visible:['All sensors are hidden. Enable a sensor in the legend.','Alle sensoren zijn verborgen. Zet een sensor aan via de legenda.'],
 color_mode:['Line color','Lijnkleur'],color_fixed:['Fixed color','Vaste kleur'],color_gradient:['Color stops','Kleurovergangen'],color:['Line color','Lijnkleur'],
 fill_mode:['Fill color','Vulkleur'],fill_line:['Follow line','Volg lijn'],fill_own:['Own color','Eigen kleur'],
 add_sensor:['Add sensor','Sensor toevoegen'],new_sensor:['New sensor','Nieuwe sensor'],add_sensorHelper:['Add a sensor to configure its name, line and fill.','Voeg een sensor toe om naam, lijn en vulling in te stellen.'],
 sensor_up:['Move up','Omhoog'],sensor_down:['Move down','Omlaag'],sensor_remove:['Remove','Verwijderen'],
 color_modeHelper:['Choose a fixed color or color stops based on measured values.','Kies een vaste kleur of kleurovergangen op basis van meetwaarden.'],
 fill_modeHelper:['Follow line uses this sensor’s line color, including its gradient. Own color changes only the fill.','Volg lijn gebruikt de lijnkleur van deze sensor, inclusief de gradiënt. Eigen kleur verandert alleen de vulling.'],
 gradient_stopsHelper:['Set 2–32 distinct values in the sensor unit, not percentages. Adjust the initial values to your sensor range.','Stel 2–32 unieke waarden in de sensoreenheid in, geen percentages. Pas de beginwaarden aan op het bereik van je sensor.'],
 line_styleHelper:['Only changes this sensor’s line.','Verandert alleen de lijn van deze sensor.'],fill_colorHelper:['Only used when Own color is selected.','Alleen gebruikt wanneer Eigen kleur is gekozen.']
});
Object.assign(translations,{
 line_style_source:['Line appearance','Lijnopmaak'],line_style_own:['Own appearance','Eigen opmaak'],line_style_follow:['Follow','Volg'],
 line_style_sourceHelper:['Follow another sensor’s width, line style and interpolation. Color and fill remain independent. Own appearance detaches with the current settings.','Volg dikte, lijnstijl en lijnverloop van een andere sensor. Kleur en vulling blijven eigen. Eigen opmaak neemt de huidige instellingen mee.'],
 line_style_source_error:['Invalid line appearance source: choose another sensor on this card, without circular links.','Ongeldige bron voor lijnopmaak: kies een andere sensor op deze kaart, zonder kringverwijzingen.']
});
translations.config=['Invalid configuration: check sensors, hours, Y-axis bounds, appearance and color stops.','Ongeldige configuratie: controleer sensoren, uren, Y-asgrenzen, lijnopties en kleurovergangen.'];
function language(hass){return String(hass?.locale?.language??hass?.language??'en').toLowerCase().startsWith('nl')?'nl':'en';}
function text(key,lang){return translations[key]?.[lang==='nl'?1:0]??key;}
function number(value,lang,axis=false){
 const small=value!==0&&Math.abs(value)<0.01;
 return new Intl.NumberFormat(lang==='nl'?'nl-NL':'en-GB',{
  ...(axis?{maximumSignificantDigits:15}:small?{maximumSignificantDigits:4}:{maximumFractionDigits:2}),
  ...(value!==0&&(Math.abs(value)<0.0001||axis&&Math.abs(value)>=1e6)?{notation:'scientific'}:{})
 }).format(Object.is(value,-0)?0:value);
}
function time(value,lang,timeZone,full=false){return new Intl.DateTimeFormat(lang==='nl'?'nl-NL':'en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',...(full?{day:'numeric',month:'short'}:{})}).format(new Date(value));}
function escapeHtml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function frontendHass(){return globalThis.document?.querySelector('home-assistant')?.hass;}

// ../history-graph-card/src/eleven.js
// One playful flyby, then gone until tomorrow.
const ELF_FLIGHT_MS=4200;
function elevenDay(date=new Date(),zone){
 try{return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}catch{return date.toDateString();}
}
function isElevenMinute(date=new Date(),zone){
 let parts;
 try{parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);}catch{parts=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);}
 return parts.find(p=>p.type==='hour')?.value==='11'&&parts.find(p=>p.type==='minute')?.value==='11';
}
function elevenMarkup(elapsed=0){return `<span class="eleven-elf" aria-hidden="true" style="animation-delay:-${elapsed}ms"><svg viewBox="0 0 64 56" width="48" height="42" fill="none"><g class="elf-wings" stroke="#7dd3fc" stroke-width=".8"><path d="M30 30C9 27 8 5 18 8c8 2 13 15 12 22Z" fill="#e0f2fe" fill-opacity=".85"/><path d="M35 31C35 17 46 4 51 11c5 8-4 19-16 20Z" fill="#f0e7ff" fill-opacity=".8"/><path d="M29 30C9 26 11 42 20 40l9-10ZM36 31c18-8 19 8 10 10Z" fill="#bae6fd" fill-opacity=".65"/><g class="elf-wing-veins" stroke="#ffffff" stroke-opacity=".9" stroke-width=".7"><path d="M29 29 17 12m18 17 13-15M28 32l-11 5m20-4 9 4"/></g></g><g stroke-linecap="round" stroke-linejoin="round"><path d="m28 36-8 9 7 1m8-10 7 8 7-3" stroke="#1e40af" stroke-width="4"/><path d="m20 44-4 3 10 1m17-5 5-4 3 2" stroke="#fbbf24" stroke-width="2"/><path d="M24 36q1-13 8-13t10 13l-7 3-5-3-4 3Z" fill="#2563eb" stroke="#1e40af" stroke-width=".7"/><path d="m27 33 11 1" stroke="#fbbf24" stroke-width="2"/><path d="m25 28-6 5-4-3m24-1 8-6" stroke="#ffd7b5" stroke-width="3"/><path d="m24 20-8-5 4 10m21-5 7-4-4 10" fill="#ffc99f" stroke="#dd996f" stroke-width=".6"/><ellipse cx="32" cy="22" rx="10" ry="9" fill="#ffdfbf"/><path d="M22 20q-1-13 11-13 9 0 9 13l-4-5-3 3-3-3-4 4-2-2Z" fill="#b9652a"/><path d="M21 16Q24 1 40 5l5 5-7-1 3 8Q31 13 21 18Z" fill="#2563eb" stroke="#1e40af" stroke-width=".7"/><path d="M23 17q9-4 17 0" stroke="#fbbf24" stroke-width="2.5"/><circle cx="45" cy="10" r="2.3" fill="#fbbf24"/><circle cx="28" cy="22" r="1.1" fill="#302337"/><path d="m35 22 3-1m-9 6q4 3 7-1" stroke="#793c31" stroke-width="1.3"/><ellipse cx="25" cy="25" rx="2" ry="1" fill="#fb7185" fill-opacity=".6"/><ellipse cx="39" cy="24" rx="1.7" ry="1" fill="#fb7185" fill-opacity=".6"/><path d="m46 24 6-11" stroke="#c48b36" stroke-width="1.4"/></g><g class="elf-sparkles" fill="#fbbf24"><path d="m53 8 1.2 3.8L58 13l-3.8 1.2L53 18l-1.2-3.8L48 13l3.8-1.2Z"/><path d="m9 28 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/><circle cx="5" cy="41" r="1.2"/><circle cx="14" cy="23" r=".9"/></g></svg></span>`;}
function elevenStyles(){return `.eleven-elf{position:absolute;left:0;top:6px;width:48px;height:42px;opacity:0;pointer-events:none;z-index:2;animation:eleven-flyby 4200ms linear both}.eleven-elf svg{display:block}.elf-wings{transform-origin:32px 28px;animation:eleven-flutter .16s ease-in-out infinite alternate}@keyframes eleven-flyby{0%{left:0;transform:translateX(-110%) translateY(8px) rotate(12deg);opacity:0}10%{opacity:.9}30%{transform:translateX(-30%) translateY(-5px) rotate(-8deg)}60%{transform:translateX(-60%) translateY(9px) rotate(8deg);opacity:.9}90%{opacity:.9}100%{left:100%;transform:translateX(10%) translateY(-9px) rotate(-12deg);opacity:0}}@keyframes eleven-flutter{from{transform:scaleX(.7)}to{transform:scaleX(1.1)}}@media(prefers-reduced-motion:reduce){.eleven-elf{animation:none;left:auto;right:10px;opacity:.85}.elf-wings{animation:none}}`;}

// ../history-graph-card/src/library.js
// Shared browser API for Eleven Cards; only connected cards are retained.
const ELEVEN_VERSION='0.3.1-local';
const elevenLibrary=window.elevenCards??={};
const elevenPreviews=elevenLibrary._elfPreviews??=new Set();
elevenLibrary.debug??={};
elevenLibrary.debug.elf=()=>{for(const preview of elevenPreviews)preview();return elevenPreviews.size;};
if(!elevenLibrary._announced){
 console.log(`%c Eleven Cards %c v${ELEVEN_VERSION} `,'background:#20252b;color:#ffffff;padding:5px 10px;border-bottom:3px solid #607d94;border-radius:5px 0 0 5px;font-weight:bold','background:#343b43;color:#e5e7eb;padding:5px 10px;border-bottom:3px solid #607d94;border-radius:0 5px 5px 0;font-weight:bold');
 elevenLibrary._announced=true;
}
function registerElfPreview(callback){elevenPreviews.add(callback);}
function unregisterElfPreview(callback){elevenPreviews.delete(callback);}

// ../history-graph-card/src/history-graph-card.js
const COLORS=['#2196f3','#e78a14','#ab70d9','#26a69a','#e66b91','#718cc2','#a18d3a','#718d78'];
const REFRESH_MS=60000;
// Native controls, with one independently owned appearance form per sensor.
class HistoryGraphEditor extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'});}
 _editorConfig(config){return editorConfig(config);}
 setConfig(config){this._data=this._editorConfig(config);this._render();}
 set hass(hass){this._hass=hass;this._render();}
 get hass(){return this._hass;}
 connectedCallback(){this._render();}
 _emit(){
  const data={...this._data,entities:this._data.entities.filter(row=>row.entity)};
  this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:cardConfig(data)},bubbles:true,composed:true}));
 }
 _bind(form,definition,data){
  form.hass=this._hass;form.schema=definition.schema;form.data=data;
  form.computeLabel=s=>definition.computeLabel.call(this,s);form.computeHelper=s=>definition.computeHelper.call(this,s);
 }
 _render(){
  if(!this._data||!this._hass)return;
  if(!this._form){
   this.shadowRoot.innerHTML=`<style>:host{display:block;min-width:0}h3{font-size:16px;margin:24px 0 12px}details{border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);margin:12px 0;min-width:0}summary{cursor:pointer;padding:12px;min-height:44px;box-sizing:border-box;display:flex;align-items:center;gap:10px}summary:focus-visible,button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}.swatch{width:24px;height:3px;flex:none}.sensor-name{overflow-wrap:anywhere;flex:1;min-width:0}.body{padding:0 12px 12px;min-width:0}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}button{font:inherit;color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:6px;min-height:44px;padding:8px 12px;cursor:pointer}button:disabled{opacity:.45;cursor:default}.remove{margin-left:auto;color:var(--error-color)}.empty{color:var(--secondary-text-color)}</style><ha-form class="graph-form"></ha-form><h3 class="sensors-heading"></h3><div class="sensors"></div><p class="empty"></p><button class="add-sensor" type="button"></button>`;
   this._form=this.shadowRoot.querySelector('.graph-form');
   this._form.addEventListener('value-changed',ev=>{ev.stopPropagation();this._data={...this._data,...ev.detail.value,entities:this._data.entities};this._emit();});
   this.shadowRoot.querySelector('.add-sensor').onclick=()=>{
    const index=this._data.entities.length;if(index>=8)return;
    const row=editorConfig({entities:[''],series_options:[{entity:'',color:COLORS[index],line_style:index%2?'dashed':'solid'}]}).entities[0];
    this._data={...this._data,entities:[...this._data.entities,row]};this._openNew=true;this._render();
   };
  }
  this._bind(this._form,(this.constructor.cardClass??HistoryGraphCard).getConfigForm(),this._data);
  const lang=language(this._hass),label=key=>text(key,lang),container=this.shadowRoot.querySelector('.sensors');
  this.shadowRoot.querySelector('.sensors-heading').textContent=label('entities');
  this.shadowRoot.querySelector('.empty').textContent=this._data.entities.length?'':label('add_sensorHelper');
  const add=this.shadowRoot.querySelector('.add-sensor');add.textContent=label('add_sensor');add.disabled=this._data.entities.length>=8;
  // Retain existing details/forms on ordinary edits, so focus and expansion survive.
  while(container.children.length>this._data.entities.length)container.lastElementChild.remove();
  this._data.entities.forEach((row,index)=>{
   let entry=container.children[index];
   if(!entry){
    entry=document.createElement('details');entry.className='sensor-entry';
    entry.innerHTML='<summary><span class="swatch"></span><span class="sensor-name"></span><span aria-hidden="true">▾</span></summary><div class="body"><ha-form class="sensor-form"></ha-form><div class="actions"><button type="button" class="up"></button><button type="button" class="down"></button><button type="button" class="remove"></button></div></div>';
    container.append(entry);entry.open=this._data.entities.length===1||Boolean(this._openNew);
    const form=entry.querySelector('ha-form');form.addEventListener('value-changed',ev=>{
     ev.stopPropagation();const old=this._data.entities[index];const updated={...old,...ev.detail.value};
     if(updated.color_mode==='gradient'&&!updated.gradient_stops?.length)updated.gradient_stops=[{value:0,color:[33,150,243]},{value:1,color:[231,138,20]}];
     this._data=updateSeriesRow(this._data,index,updated);this._render();this._emit();
    });
    entry.querySelector('.remove').onclick=()=>{this._data=removeSeriesRow(this._data,index);this._render();this._emit();};
    for(const [key,delta] of [['up',-1],['down',1]])entry.querySelector('.'+key).onclick=()=>{
     const rows=[...this._data.entities],next=index+delta;if(next<0||next>=rows.length)return;
     [rows[index],rows[next]]=[rows[next],rows[index]];this._data={...this._data,entities:rows};this._render();this._emit();
    };
   }
   entry.dataset.index=index;
   const name=row.name||this._hass.states?.[row.entity]?.attributes?.friendly_name||row.entity||label('new_sensor');
   entry.querySelector('.sensor-name').textContent=name;
   const cssColor=c=>Array.isArray(c)?`rgb(${c.join(',')})`:c;
   entry.querySelector('.swatch').style.background=row.color_mode==='gradient'&&row.gradient_stops.length?`linear-gradient(to right,${row.gradient_stops.map(s=>cssColor(s.color)).join(',')})`:cssColor(row.color);
   for(const key of ['up','down','remove']){const button=entry.querySelector('.'+key);button.textContent=label('sensor_'+key);button.setAttribute('aria-label',`${label('sensor_'+key)}: ${name}`);button.disabled=key==='up'?index===0:key==='down'?index===this._data.entities.length-1:false;}
   this._bind(entry.querySelector('ha-form'),(this.constructor.cardClass??HistoryGraphCard).getSeriesConfigForm(row,this._data.entities),{...row,line_style_source:row.line_style_source??''});
  });
  this._openNew=false;
 }
}
class HistoryGraphCard extends HTMLElement {
 static async getConfigElement(){
  // The built-in Entities editor lazily loads ha-form on a fresh frontend.
  if(!customElements.get('ha-form')){
   const helpers=await window.loadCardHelpers();const card=await helpers.createCardElement({type:'entities',entities:[]});
   await card.constructor.getConfigElement();await customElements.whenDefined('ha-form');
  }
  if(!customElements.get('eleven-history-graph-editor'))customElements.define('eleven-history-graph-editor',HistoryGraphEditor);
  return document.createElement('eleven-history-graph-editor');
 }
 constructor(){super();this.attachShadow({mode:'open'});this._generation=0;this._timer=null;this._connected=false;this._status='loading';this._series=[];this._outside=e=>{const chart=this.shadowRoot.querySelector('.chart');if(chart&&!e.composedPath().includes(chart)&&!SharedGraph.hoverSourceInEvent(this,e))this._hideTooltip?.();};}
 static _formContract(schema){
  return {schema,computeLabel:function(item){return text(item?.name==='title'?'titleField':item?.name??'',language(this?.hass??frontendHass()));},computeHelper:function(item){const key=`${item?.name}Helper`,value=text(key,language(this?.hass??frontendHass()));return value===key?undefined:value;}};
 }
 static getConfigForm(){
  const label=key=>text(key,language(frontendHass()));
  const select=keys=>({select:{mode:'dropdown',get options(){return keys.map(value=>({value,label:label(value)}));}}});
  return this._formContract([
   {name:'title',selector:{text:{}}},
   {name:'show_title',default:true,selector:{boolean:{}}},
   {name:'hours_to_show',selector:{number:{min:1,max:8760,step:0.5,mode:'box'}}},
   {type:'expandable',name:'graph_settings',get title(){return label('graph_settings');},flatten:true,schema:[
    {name:'graph_mode',default:'lines',selector:select(['lines','stacked'])},
    {name:'show_legend',default:true,selector:{boolean:{}}},
    {name:'show_navigation',default:true,selector:{boolean:{}}},
    {name:'show_grid',default:true,selector:{boolean:{}}},
    {name:'show_hover_line',default:true,selector:{boolean:{}}},
    {name:'sync_hover',default:true,selector:{boolean:{}}},
    {name:'hover_sync_group',selector:{text:{}}}
   ]},
   {type:'expandable',name:'y_axis',get title(){return label('y_axis');},flatten:true,schema:[
    {name:'y_min',selector:{number:{step:'any',mode:'box'}}},
    {name:'y_max',selector:{number:{step:'any',mode:'box'}}},
    {name:'y_step',selector:{number:{step:'any',mode:'box'}}},
    {name:'align_zero',default:true,selector:{boolean:{}}}
   ]},
   {type:'expandable',name:'data_processing',get title(){return label('data_processing');},flatten:true,schema:[
    {name:'data_source',default:'auto',selector:select(['auto','history','statistics'])},
    {name:'aggregation_period',default:'none',selector:select(['none','minute','quarter_hour','hour','day','week','month'])},
    {name:'aggregation_method',default:'avg',selector:select(['min','max','avg'])}
   ]}
  ]);
 }
 static getSeriesConfigForm(row={},rows=[]){
  const label=key=>text(key,language(frontendHass()));
  const select=(keys,prefix='')=>({select:{mode:'dropdown',get options(){return keys.map(value=>({value,label:label(prefix+value)}));}}});
  const sources=lineStyleSources(rows,row);
  const sourceSelector={select:{mode:'dropdown',options:[{value:'',label:label('line_style_own')},...sources.map(s=>({value:s.entity,label:label('line_style_follow')+' '+(s.name||frontendHass()?.states?.[s.entity]?.attributes?.friendly_name||s.entity)}))]}};
  const gradients={object:{multiple:true,label_field:'value',fields:{value:{get label(){return label('stop_value');},required:true,selector:{number:{step:'any',mode:'box'}}},color:{get label(){return label('stop_color');},required:true,selector:{color_rgb:{}}}}}};
  return this._formContract([
   {name:'entity',required:true,selector:{entity:{domain:'sensor'}}},
   {name:'name',selector:{text:{}}},
   {name:'visible',default:true,selector:{boolean:{}}},
   {type:'expandable',name:'series_line',get title(){return label('series_line');},flatten:true,expanded:true,schema:[
    ...(rows.filter(s=>s.entity).length>1?[{name:'line_style_source',selector:sourceSelector}]:[]),
    ...(!row.line_style_source?[
     {name:'line_width',required:true,selector:{number:{min:1,max:8,step:0.5,mode:'box',unit_of_measurement:'px'}}},
     {name:'line_style',required:true,selector:select(['solid','dashed','dotted'])},
     {name:'line_interpolation',required:true,default:'step',selector:select(['smooth','linear','step'],'interpolation_')}
    ]:[]),
    {name:'connect_gaps',default:false,selector:{boolean:{}}},
    {name:'color_mode',required:true,selector:select(['fixed','gradient'],'color_')},
    ...(row.color_mode==='gradient'?[
     {name:'gradient_mode',required:true,selector:select(['smooth','steps'])},
     {name:'gradient_stops',selector:gradients}
    ]:[{name:'color',selector:{color_rgb:{}}}])
   ]},
   {type:'expandable',name:'series_fill',get title(){return label('series_fill');},flatten:true,expanded:true,schema:[
    {name:'show_fill',selector:{boolean:{}}},
    ...(row.show_fill?[
     {name:'fill_opacity',selector:{number:{min:0,max:1,step:0.01,mode:'slider'}}},
     {name:'fill_fade',selector:{boolean:{}}},
     {name:'fill_mode',required:true,selector:select(['line','own'],'fill_')},
     ...(row.fill_mode==='own'?[{name:'fill_color',selector:{color_rgb:{}}}]:[])
    ]:[])
   ]}
  ]);
 }
 _seriesAppearance(index){
  const row=seriesAppearance(this._config,index);
  return {...row,stops:row.color_mode==='gradient'?row.gradient_stops:[],mode:row.gradient_mode,chosen:row.color};
 }
 _appearance(index,value){
  const {stops,mode,chosen,line_style:style,line_width:width}=this._seriesAppearance(index);
  const fixed=Array.isArray(chosen)?`rgb(${chosen.join(',')})`:chosen;
  const color=gradientColor(stops,value,mode)??fixed??COLORS[index];
  return {color:color||COLORS[index],stroke:stops.length?`url(#history-colors-${index})`:fixed||COLORS[index],...graphLineStyle(style,width)};
 }
 _gradient(min,max,y){
  const c=this._config;
  const gradients=c.entities.map((_,index)=>{
   if(!this._isSeriesVisible(index))return '';
   const {stops,mode}=this._seriesAppearance(index);if(!stops.length)return '';
   if(this._axes){({min,max}=this._axes[this._seriesAxes[index]]);y=v=>(max-v)/(max-min)*300;}
   const values=[max,...stops.map(s=>s.value).filter(v=>v>min&&v<max).reverse(),min];
   const markup=values.map((v,i)=>{const offset=y(v)/3;const high=gradientColor(stops,v,mode);const low=mode==='steps'&&i>0&&i<values.length-1?gradientColor(stops,v-Math.max(1,Math.abs(v))*Number.EPSILON*4,mode):high;return `<stop offset="${offset}%" stop-color="${high}"/>${low!==high?`<stop offset="${offset}%" stop-color="${low}"/>`:''}`;}).join('');
   return `<linearGradient id="history-colors-${index}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="300">${markup}</linearGradient>`;
  }).join('');
  return `<defs>${gradients}${c.entities.some((_,i)=>{const a=this._seriesAppearance(i);return a.show_fill&&a.fill_fade;})?'<linearGradient id="history-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient><mask id="history-fill-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="300"><rect width="1000" height="300" fill="url(#history-fade)"/></mask>':''}</defs>`;
 }
 _line(points,end,x,y,index=0){return SharedGraph.path(points.map(p=>[x(p.t),p.v===null?null:y(p.v)]),this._seriesAppearance(index).line_interpolation,end===undefined?undefined:x(end));}
 _area(points,x,y,index=0){
  const interpolation=this._seriesAppearance(index).line_interpolation;
  let path='',segment=[];
  const close=until=>{if(segment.length){
   const top=this._line(segment,until,x,y,index);let bottom=`L ${x(until)} 300 L ${x(segment[0].t)} 300`;
   if(this._config.graph_mode==='stacked'){
    const reverse=[{t:until,v:segment.at(-1).base}];
    for(let i=segment.length-1;i>=0;i--){const p=segment[i];reverse.push({t:p.t,v:p.base});if(interpolation==='step'&&i>0)reverse.push({t:p.t,v:segment[i-1].base});}
    bottom=SharedGraph.path(reverse.map(p=>[x(p.t),y(p.v)]),interpolation==='step'?'linear':interpolation).replace(/^M /,'L ');
   }
   path+=`${path?' ':''}${top} ${bottom} Z`;segment=[];
  }};
  for(const point of points){if(point.v===null)close(point.t);else segment.push(point);}close(Math.max(this._viewEnd??this._end,segment.at(-1)?.t??0));return path;
 }
 static getStubConfig(hass){const ids=Object.keys(hass?.states??{}).filter(id=>id.startsWith('sensor.')&&Number.isFinite(Number(hass.states[id].state))&&hass.states[id].state!=='');return {entities:ids.slice(0,1),hours_to_show:24};}
 getGridOptions(){return {rows:6,columns:12,min_rows:4,min_columns:6};}
 getCardSize(){return 6;}
 _isSeriesVisible(index){const id=this._config.entities[index];return this._visibility?.get(id)??(this._config.series_options.find(s=>s.entity===id)?.visible??true);}
 _toggleSeries(id){
  const index=this._config.entities.indexOf(id);if(index<0)return;
  this._visibility??=new Map();this._visibility.set(id,!this._isSeriesVisible(index));this._hideTooltip();this._render();
  queueMicrotask(()=>this.shadowRoot.querySelector?.(`button[data-series="${id}"]`)?.focus({preventScroll:true}));
 }
 setConfig(config){let validated;try{validated=validateConfig(config);}catch(error){throw new Error(text(error.message==='y_step'?'y_step_error':error.message==='y_step_count'?'y_step_count':error.message?.startsWith('line_style_source')?'line_style_source_error':'config',language(this._hass??frontendHass())));}
  const previous=this._config,visibility=this._visibility;
  this._visibility=new Map(validated.entities.map(id=>{const initial=validated.series_options.find(s=>s.entity===id)?.visible??true,old=previous?.series_options.find(s=>s.entity===id)?.visible??true;return [id,initial===old&&visibility?.has(id)?visibility.get(id):initial];}));
  SharedGraph.clearHover(this);this._config=validated;this._lastLoad=null;this._loadFailed=false;this._insightOpen=null;this._generation++;this._inFlight=false;this._series=[];this._rawSeries=null;this._viewport=null;resetGraphPeriod(this);this._status='loading';clearTimeout(this._timer);this._timer=null;this._render();if(this._connected&&this._hass)this._refresh();}
 set hass(hass){this._hass=hass;if(!this._config)return;let signature;try{const meta=seriesMetadata(hass,this._config.entities);signature=JSON.stringify([meta,language(hass),hass.config?.time_zone]);}catch(e){signature=e.message;}
  if(signature!==this._signature){this._signature=signature;this._render();}
  this._updateGraphTheme();
  if(this._connected&&!this._started)this._refresh();
 }
 get hass(){return this._hass;}
 _syncElf(){
  clearTimeout(this._elfTimer);this._elfTimer=null;
  const parent=this.shadowRoot.querySelector('.card-content');
  const now=Date.now(),zone=this._hass?.config?.time_zone,day=elevenDay(new Date(),zone);
  const dayKey='eleven-cards:elf-day';
  try{this._elfDay=window.sessionStorage?.getItem(dayKey)??this._elfDay;}catch{}
  if(parent&&isElevenMinute(new Date(),zone)&&this._elfDay!==day){this._elfDay=day;this._elfPreviewUntil=now+ELF_FLIGHT_MS;try{window.sessionStorage?.setItem(dayKey,day);}catch{}}
  if(parent){const elf=parent.querySelector('.eleven-elf');const visible=now<(this._elfPreviewUntil??0);if(visible&&!elf)parent.insertAdjacentHTML('beforeend',elevenMarkup(Math.max(0,now-(this._elfPreviewUntil-ELF_FLIGHT_MS))));else if(!visible&&elf)elf.remove();}
  if(this._connected){this._elfTimer=setTimeout(()=>this._syncElf(),Math.min(60000-now%60000,this._elfPreviewUntil>now?this._elfPreviewUntil-now:60000));this._elfTimer.unref?.();}
 }
 connectedCallback(){this._connected=true;SharedGraph.connectHover(this,t=>this._receiveHover(t));this._elfPreview??=()=>{this._elfPreviewUntil=Date.now()+ELF_FLIGHT_MS;this.shadowRoot.querySelector('.eleven-elf')?.remove();this._syncElf();};registerElfPreview(this._elfPreview);document.addEventListener('pointerdown',this._outside);this._syncElf();if(this._config&&this._hass)this._refresh();}
 disconnectedCallback(){disconnectChartInsights(this);disconnectPeriodControls(this);SharedGraph.disconnectHover(this);this._connected=false;unregisterElfPreview(this._elfPreview);this._elfPreviewUntil=0;this._generation++;this._inFlight=false;this._started=false;clearTimeout(this._timer);this._timer=null;clearTimeout(this._elfTimer);this._elfTimer=null;document.removeEventListener('pointerdown',this._outside);}
 async _refresh(){
  if(!this._connected||!this._config||!this._hass||this._inFlight)return;
  clearTimeout(this._timer);this._timer=null;const generation=++this._generation;this._inFlight=true;this._started=true;
  const {start,end}=graphPeriodRange(this);const config={...this._config,hours_to_show:(end-start)/3600000},hass=this._hass;
  this._status='loading';this._render();let timeout;
  try{
   seriesMetadata(hass,config.entities);
   const response=await Promise.race([loadHistorySeries(hass,config,start,end),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('timeout')),15000);timeout.unref?.();})]);
   if(generation!==this._generation||!this._connected)return;
   seriesMetadata(this._hass,config.entities);
   this._series=response;this._rawSeries=this._series;this._start=start;this._end=end;
   this._loadFailed=false;this._lastLoad={at:Date.now(),start,end,sources:response.map(s=>({id:s.id,source:s.source??'history',empty:!s.points.some(p=>p.v!==null)}))};
   this._status=this._series.some(s=>s.points.some(p=>p.v!==null))?'ready':'empty';
  }catch(e){if(generation!==this._generation||!this._connected)return;this._loadFailed=true;this._status=['missing','unit','statistics_config','statistics_unavailable'].includes(e.message)?e.message:'error';this._series=[];}
  finally{clearTimeout(timeout);if(generation===this._generation&&this._connected){this._inFlight=false;this._render();this._timer=setTimeout(()=>this._refresh(),REFRESH_MS);this._timer.unref?.();}}
 }
 _getGraphAxes(series,meta,visible){return graphAxes(series,meta,this._config,this._start,this._end,visible);}
 _aggregateSeries(){return aggregateSeries(this._rawSeries,this._start,this._end,this._config.aggregation_period,this._config.aggregation_method,this._zone);}
 _displayPoints(points,index=0){return displayPoints(this._seriesAppearance(index).connect_gaps?connectGapPoints(points):points,this._viewStart,this._viewEnd);}
 _dataInformation(){
  const start=this._viewStart,end=this._viewEnd;
  return {start,end,rows:this._series.map((s,i)=>({...this._meta.items[i],...chartValueStatistics(s.points,start,end)}))};
 }
 _defaultTitle(lang){return text('title',lang);}
 _render(){
  if(!this._config)return;captureChartInsights(this);const lang=language(this._hass);this._lang=lang;this._zone=this._hass?.config?.time_zone;
  let meta;try{meta=seriesMetadata(this._hass??{},this._config.entities,this._config.series_options);}catch(e){if(this._hass)this._status=e.message;}
  const title=this._config.title??this._defaultTitle(lang);let content='';
  if(this._status!=='ready'||!meta){content=`<div class="state" role="status">${escapeHtml(text(this._status,lang))}${['error','unit','missing','statistics_config','statistics_unavailable'].includes(this._status)?`<button class="retry">${text('retry',lang)}</button>`:''}</div>`;}
  else{
   this._rawSeries??=this._series;
   const key=JSON.stringify([this._start,this._end,this._zone,this._config.aggregation_period,this._config.aggregation_method]);
   if(this._processedRaw!==this._rawSeries||this._processedKey!==key){this._series=this._aggregateSeries();this._processedRaw=this._rawSeries;this._processedKey=key;}
   const visible=this._config.entities.map((_,i)=>this._isSeriesVisible(i)),anyVisible=visible.some(Boolean);
   const axisKey=JSON.stringify([meta.items.map(item=>item.unit),this._config.graph_mode,this._config.y_min,this._config.y_max,this._config.y_step,this._config.align_zero,visible]);
   let grouped;try{if(this._axisSource!==this._series||this._axisKey!==axisKey){this._axisGroups=this._getGraphAxes(this._series,meta,visible);this._axisSource=this._series;this._axisKey=axisKey;}grouped=this._axisGroups;}catch(error){if(!['y_step','y_step_count'].includes(error.message))throw error;this._status=error.message==='y_step'?'y_step_error':error.message;this._range=null;this._render();return;}
   this._meta=meta;this._axes=grouped.axes;this._seriesAxes=grouped.seriesAxes;this._plotSeries=grouped.plotSeries;
   const {min,max}=this._axes[0];this._range=[min,max];
   const extra=this._axes.length-1,mixed=new Set(meta.items.map(item=>item.unit)).size>1;
   this._viewStart=Math.max(this._start,this._viewport?.[0]??this._start);this._viewEnd=Math.min(this._end,this._viewport?.[1]??this._end);
   if(this._viewEnd<=this._viewStart){this._viewport=null;this._viewStart=this._start;this._viewEnd=this._end;}
   const x=t=>(t-this._viewStart)/(this._viewEnd-this._viewStart)*1000,y=v=>(max-v)/(max-min)*300;
   const axes=this._axes.map((axis,index)=>{
    const position=index?`left:auto;right:calc(12px + ${index-1} * var(--axis-column));width:var(--axis-column);max-width:var(--axis-column);text-align:right;`:'';
    const unit=mixed?`<span class="axis-unit" style="${position}">${escapeHtml(axis.unit||'—')}</span>`:'';
    return unit+[...axis.ticks].reverse().map(value=>{const ratio=(axis.max-value)/(axis.max-axis.min);return `<span class="axis-y" style="top:calc(${ratio*100}% + ${22-ratio*52}px);${position}">${escapeHtml(number(value,lang,true))}</span>`;}).join('');
   }).join('');
   const times=Array.from({length:4},(_,i)=>`<span class="axis-x" data-tick="${i}" style="left:calc(${i/3*100}% + ${44-i/3*56}px - ${i/3} * var(--axes-right,0px))">${escapeHtml(time(this._viewStart+(this._viewEnd-this._viewStart)*i/3,lang,this._zone,(this._viewEnd-this._viewStart)>86400000))}</span>`).join('');

   const display=this._plotSeries.map((s,i)=>({...s,points:this._displayPoints(s.points,i)}));
   const seriesY=i=>{const a=this._axes[this._seriesAxes[i]];return v=>(a.max-v)/(a.max-a.min)*300;};
   this._graph??=new SharedGraph();
   const graph=this._graph.render(this,{
    viewBox:'0 0 1000 300',defs:this._gradient(min,max,y),
    before:this._config.show_grid!==false?`<g class="y-grid">${this._axes[0].ticks.map((value,index)=>`<line class="grid-line${this._axes.some(a=>a.ticks[index]===0)?' grid-zero':''}" x1="0" x2="1000" y1="${y(value)}" y2="${y(value)}"/>`).join('')}</g><g class="grid-edges"><line class="grid-line grid-edge" x1="0" x2="0" y1="0" y2="300"/><line class="grid-line grid-edge" x1="1000" x2="1000" y1="0" y2="300"/></g>`:'',
    fills:display.flatMap((s,i)=>{const a=this._seriesAppearance(i);if(!visible[i]||!a.show_fill)return [];const fillColor=Array.isArray(a.fill_color)?`rgb(${a.fill_color.join(',')})`:a.fill_color;return [{d:this._area(s.points,x,seriesY(i),i),className:'series-fill',fill:a.fill_mode==='own'?fillColor:this._appearance(i).stroke,opacity:a.fill_opacity,mask:a.fill_fade?'url(#history-fill-fade)':null}];}),
    lines:display.flatMap((s,i)=>visible[i]?[{d:this._line(s.points,Math.max(this._viewEnd,s.points.at(-1)?.t??this._viewEnd),x,seriesY(i),i),className:'series-line',entity:s.id,appearance:this._appearance(i)}]:[]),
   });
   // Statistics bins end exclusively; sample inside the requested range rather
   // than its closing null sentinel. A real gap before the end remains null.
   const legend=meta.items.map((item,i)=>{const s=this._series[i],value=valueAt(s.points,this._end-(s.source==='statistics'?1:0));const a=this._appearance(i,value);return `<button type="button" class="legend-item" data-series="${item.id}" aria-pressed="${visible[i]}" title="${escapeHtml(text(visible[i]?'hide_sensor':'show_sensor',lang)+' '+item.name)}"><i style="--series-color:${a.color};border-top-width:${a.width}px;border-top-style:${a.style}"></i><span>${escapeHtml(item.name)}</span><strong>${value===null?text('unavailable',lang):escapeHtml(number(value,lang))}${mixed&&value!==null&&item.unit?` ${escapeHtml(item.unit)}`:''}</strong></button>`;}).join('');
   const missing=meta.items.filter((_,i)=>visible[i]&&!this._series[i].points.some(p=>p.v!==null)).map(s=>s.name);
   content=`${this._config.show_legend?`<div class="legend">${legend}${mixed?'':`<span class="unit">${escapeHtml(meta.unit)}</span>`}</div>`:`<div class="data-status">${escapeHtml(mixed?'':meta.unit)}</div>`}${missing.length?`<div class="data-status">${text('partial',lang)} ${escapeHtml(missing.join(', '))}</div>`:''}<div class="chart" style="--axis-column:min(48px, calc((100% - 124px) / ${Math.max(1,extra)}));--axes-right:calc(${extra} * var(--axis-column))" tabindex="0" role="group" aria-label="${text('chart',lang)}">${anyVisible?axes+times:`<div class="empty-visibility" role="status">${escapeHtml(text('no_visible',lang))}</div>`}<div class="plot">${graph}<div class="zoom-selection" hidden></div></div>${this._config.show_hover_line?'<div class="guide" hidden></div>':''}<div class="markers"></div><div class="tooltip" hidden></div><div class="sr-only" aria-live="polite"></div></div>`;
  }
  const controls=cardHeader({title,showTitle:this._config.show_title!==false,ready:this._status==='ready',historyUrl:this._historyUrl(),language:lang,periods:periodControls(this,lang),zoomState:chartZoomState(this),information:chartDataInformation(this,lang)});
  this.shadowRoot.innerHTML=`<style>${this._styles()}</style><ha-card lang="${lang}"><div class="card-content">${controls}${content}</div></ha-card>`;
  this._updateGraphTheme();bindPeriodControls(this);bindChartInsights(this);
  this.shadowRoot.querySelectorAll?.('[data-zoom]').forEach(button=>button.onclick=()=>this._zoom({in:0.5,out:2,reset:0}[button.dataset.zoom]));
  this._graph?.restore(this);
  const retry=this.shadowRoot.querySelector('.retry');if(retry)retry.onclick=()=>this._refresh();this._pinned=false;this._bindInteractions();
  this._syncElf();SharedGraph.restoreHover(this);
 }
 _updateGraphTheme(){
  const card=this.shadowRoot.querySelector('ha-card');
  if(!card?.style||!globalThis.getComputedStyle)return;
  // Use the actual card surface, including per-card background overrides.
  const background=getComputedStyle(card).backgroundColor;
  let dark=this._hass?.themes?.darkMode??false;
  const rgba=background.match(/^rgba?\(([^)]+)\)$/)?.[1].split(/[,\s/]+/).map(Number);
  if(rgba?.length>=3&&(rgba[3]??1)>0){
   const channels=rgba.slice(0,3).map(v=>{const c=v/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;});
   dark=channels[0]*.2126+channels[1]*.7152+channels[2]*.0722<.179;
  }
  card.style.setProperty('--history-value-color',dark?'#f3f4f6':'#111111');
  card.style.setProperty('--history-grid-color',dark?'#3a3b45':'#e1e3e8');
  card.style.setProperty('--history-grid-zero-color',dark?'#626571':'#b8bbc4');
 }
 _historyUrl(){const range=graphPeriodRange(this),ready=this._status==='ready';const end=this._viewport?.[1]??(ready?this._end:range.end)??range.end,start=this._viewport?.[0]??(ready?this._start:range.start)??range.start;return `/history?entity_id=${encodeURIComponent(this._config.entities.join(','))}&start_date=${encodeURIComponent(new Date(start).toISOString())}&end_date=${encodeURIComponent(new Date(end).toISOString())}`;}
 _setPeriod(hours){return chooseGraphPeriod(this,String(hours));}
 _navigate(direction){return moveGraphPeriod(this,direction);}
 _reloadPeriod(){this._generation++;this._inFlight=false;this._viewport=null;this._hideTooltip();clearTimeout(this._timer);this._status='loading';this._render();return this._refresh();}
 _zoom(factor){
  this._hideTooltip();if(!factor)this._viewport=null;
  else{const a=this._viewStart??this._start,b=this._viewEnd??this._end,width=Math.min(this._end-this._start,Math.max(60000,(b-a)*factor)),center=(a+b)/2;
   const start=Math.max(this._start,Math.min(this._end-width,center-width/2));this._viewport=[start,start+width];}
  this._render();
 }
 _bindInteractions(){
  const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;
  const fromPointer=e=>{const box=chart.querySelector('.plot').getBoundingClientRect();return (this._viewStart??this._start)+Math.max(0,Math.min(1,(e.clientX-box.left)/box.width))*((this._viewEnd??this._end)-(this._viewStart??this._start));};
  let drag=null;const selection=chart.querySelector('.zoom-selection');
  chart.onpointermove=e=>{if(drag&&Math.abs(e.clientX-drag.x)>=6){const plot=chart.querySelector('.plot').getBoundingClientRect();if(selection){selection.hidden=false;selection.style.left=`${Math.max(0,Math.min(drag.x,e.clientX)-plot.left)/plot.width*100}%`;selection.style.width=`${Math.min(plot.width,Math.abs(e.clientX-drag.x))/plot.width*100}%`;}}else if(!this._pinned&&!e.target?.closest?.('.tooltip'))this._showTooltip(this._pointerTime(fromPointer(e)));};
  chart.onpointerdown=e=>{if(e.target?.closest?.('.tooltip'))return;this._pinned=true;this._showTooltip(this._pointerTime(fromPointer(e)));if(e.pointerType==='mouse'&&(e.button??0)===0){drag={x:e.clientX,t:fromPointer(e)};chart.setPointerCapture?.(e.pointerId);}};
  chart.onpointerup=e=>{if(selection)selection.hidden=true;if(drag){const first=drag;drag=null;if(Math.abs(e.clientX-first.x)>=6){const last=fromPointer(e),a=Math.min(first.t,last),b=Math.max(first.t,last);if(b-a>=60000){this._hideTooltip();this._viewport=[a,b];this._render();}}}};
  chart.onpointercancel=()=>{drag=null;if(selection)selection.hidden=true;};
  chart.onpointerleave=()=>{if(!this._pinned)this._hideTooltip();};chart.onblur=()=>this._hideTooltip();
  chart.onkeydown=e=>{
   if(e.key==='Escape'){this._hideTooltip();return;}
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
   const a=this._viewStart??this._start,b=this._viewEnd??this._end;
   const timeline=[...new Set([a,...this._series.flatMap((s,i)=>this._isSeriesVisible(i)?s.points.map(p=>p.t):[]).filter(t=>t>a&&t<b),b])].sort((a,b)=>a-b);
   let index=timeline.findIndex(t=>t>=(this._cursor??this._start));if(index<0)index=timeline.length-1;
   if(e.key==='Home')index=0;else if(e.key==='End')index=timeline.length-1;else index=Math.max(0,Math.min(timeline.length-1,index+(e.key==='ArrowRight'?1:-1)));
   this._pinned=true;this._showTooltip(timeline[index]);
  };
 }
 _pointerTime(timestamp){return timestamp;}
 _receiveHover(timestamp){if(timestamp===null||timestamp<(this._viewStart??this._start)||timestamp>(this._viewEnd??this._end)){this._hideTooltip(false);return;}this._showTooltip(timestamp,false);}
 _hideTooltip(publish=true){if(publish)SharedGraph.clearHover(this);this._cursor=null;this._pinned=false;const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;const tooltip=chart.querySelector('.tooltip');if(tooltip)tooltip.hidden=true;const markers=chart.querySelector('.markers');if(markers)markers.innerHTML='';const guide=chart.querySelector('.guide');if(guide)guide.hidden=true;}
 _showTooltip(timestamp,publish=true){
  this._updateGraphTheme();
  if(!SharedGraph.tooltipInView(this)){this._hideTooltip(publish);return;}
  const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;this._cursor=timestamp;
  const tooltip=chart.querySelector('.tooltip'),plot=chart.querySelector('.plot');const box=chart.getBoundingClientRect(),p=plot.getBoundingClientRect();
  const px=p.left-box.left+(timestamp-(this._viewStart??this._start))/((this._viewEnd??this._end)-(this._viewStart??this._start))*p.width;
  const positions=[];
  const rows=this._series.flatMap((s,i)=>{if(!this._isSeriesVisible(i))return [];const {min,max}=this._axes?.[this._seriesAxes[i]]??{min:this._range[0],max:this._range[1]};const value=valueAt(s.points,timestamp),height=valueAt((this._plotSeries??this._series)[i].points,timestamp);if(height!==null&&height>=min&&height<=max)positions.push({x:px,y:p.top-box.top+(max-height)/(max-min)*p.height,color:this._appearance(i,value).color});return [{name:this._meta.items[i].name,value:value===null?text('unavailable',this._lang):`${number(value,this._lang)} ${this._meta.items[i].unit??this._meta.unit}`}];});
  if(!rows.length){this._hideTooltip(publish);return;}
  const colors=this._series.flatMap((s,i)=>this._isSeriesVisible(i)?[this._appearance(i,valueAt(s.points,timestamp)).color]:[]);
  tooltip.innerHTML=`<strong>${escapeHtml(time(timestamp,this._lang,this._zone,true))}</strong>${rows.map((row,i)=>`<span><i style="background:${escapeHtml(colors[i])}"></i><b class="tooltip-label">${escapeHtml(row.name)}: <em class="tooltip-value">${escapeHtml(row.value)}</em></b></span>`).join('')}`;tooltip.hidden=false;tooltip.style.pointerEvents=this._pinned?'auto':'none';
  tooltip.style.maxHeight=`${Math.max(0,box.height-8)}px`;
  const measured=tooltip.getBoundingClientRect();let left=Math.max(4,Math.min(box.width-measured.width-4,px+14));
  if(px+14+measured.width>box.width-4)left=Math.max(4,px-measured.width-14);
  const candidates=[4,Math.max(4,box.height-measured.height-4)];
  const overlaps=top=>positions.filter(m=>m.x>left-9&&m.x<left+measured.width+9&&m.y>top-9&&m.y<top+measured.height+9).length;
  const top=candidates.sort((a,b)=>overlaps(a)-overlaps(b))[0];tooltip.style.left=`${left}px`;tooltip.style.top=`${top}px`;
  chart.querySelector('.markers').innerHTML=positions.map(m=>`<i class="hover-dot" style="left:${m.x}px;top:${m.y}px;border-color:${m.color}"></i>`).join('');
  const guide=chart.querySelector('.guide');if(guide){guide.hidden=false;guide.style.left=`${px}px`;}
  chart.querySelector('.sr-only').textContent=`${time(timestamp,this._lang,this._zone,true)}. ${rows.map(row=>`${row.name}: ${row.value}`).join('. ')}`;
  if(publish)SharedGraph.publishHover(this,timestamp);
 }
 _styles(){return `
 :host{display:block;height:100%;min-width:0;container-type:inline-size;--font-size-meta:11px;--font-size-label:12px;--font-size-title:18px;}
 ha-card{height:100%;display:flex;flex-direction:column;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,inherit)}
 .card-content{position:relative;display:flex;flex-direction:column;box-sizing:border-box;min-height:0;height:100%;padding:16px 16px 12px;line-height:1.4}
 ${cardHeaderStyles()}
 ${periodControlsStyles()}
 ${chartInsightStyles()}
 .legend{display:flex;flex-wrap:wrap;align-items:center;gap:7px 16px;margin:0 0 2px;color:var(--secondary-text-color);font-size:var(--font-size-label)}
 .legend-item{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;border:0;padding:4px 0;background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer;border-radius:4px}.legend-item[aria-pressed="false"]{opacity:.45}.legend-item[aria-pressed="false"]>span{text-decoration:line-through}.legend-item:focus-visible{outline:2px solid var(--primary-color);outline-offset:3px}.legend-item>span{overflow-wrap:anywhere}.legend-item strong{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}.empty-visibility{position:absolute;inset:22px 12px 30px 44px;display:flex;align-items:center;justify-content:center;color:var(--secondary-text-color);font-size:12px;text-align:center;pointer-events:none}
 .legend i{width:15px;flex-shrink:0;border-top:3px solid var(--series-color)}.unit{margin-left:auto;font-weight:600}
 .data-status{font-size:11px;color:var(--secondary-text-color);margin-top:3px}
 .chart{position:relative;flex:1;min-height:120px;height:260px;margin-top:4px;outline:none;touch-action:pan-y}
 .chart:focus-visible{box-shadow:inset 0 0 0 2px var(--primary-color);border-radius:8px}
 .plot{position:absolute;left:44px;right:calc(12px + var(--axes-right,0px));top:22px;bottom:30px;overflow:hidden}.plot svg{width:100%;height:100%;overflow:hidden}
 .axis-y,.axis-x{position:absolute;color:var(--secondary-text-color);font-size:11px;line-height:1.2;font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none}.axis-y{left:0;transform:translateY(-50%);max-width:40px;overflow:hidden;text-overflow:ellipsis}.axis-x{bottom:4px;transform:translateX(-50%)}.axis-x:last-of-type{transform:translateX(-100%)}
 .axis-unit{position:absolute;left:0;top:2px;max-width:40px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--secondary-text-color);font-size:10px;font-weight:600}
 ${SharedGraph.tooltipStyles()}
 .legend-item strong,.tooltip .tooltip-value{color:var(--history-value-color,var(--primary-text-color));font-style:normal}
 .tooltip .tooltip-label{color:var(--secondary-text-color)}
 .grid-line{stroke:var(--history-grid-color,var(--divider-color));stroke-width:.8;vector-effect:non-scaling-stroke;pointer-events:none}.grid-zero{stroke:var(--history-grid-zero-color,var(--divider-color));stroke-width:1.2}
 .state{display:flex;flex:1;height:260px;flex-direction:column;justify-content:center;align-items:flex-start;gap:8px;min-height:120px;font-size:14px;color:var(--secondary-text-color)}.retry{font:inherit;border:1px solid var(--divider-color);border-radius:6px;background:var(--secondary-background-color);color:var(--primary-text-color);min-height:44px;padding:0 12px;cursor:pointer}
 .guide{position:absolute;top:22px;bottom:30px;border-left:1px dashed var(--secondary-text-color);pointer-events:none}.guide[hidden]{display:none}
 .zoom-selection{position:absolute;top:0;bottom:0;background:color-mix(in srgb,var(--primary-color,#2196f3) 18%,transparent);border-inline:1px solid var(--primary-color,#2196f3);pointer-events:none}.zoom-selection[hidden]{display:none}
 .sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
 ${elevenStyles()}
 ${graphStyles()}
 @container(max-width:480px){.axis-x[data-tick="1"],.axis-x[data-tick="2"]{display:none}}
 @media(max-width:480px){.card-content{padding:12px 12px 10px}}
 `;}
}

// src/bar-chart.js

class BarGraph extends SharedGraph {
 render(host,spec){return super.render(host,{...spec,lines:spec.lines.map(p=>({...p,className:'series-bar'}))});}
}

const defaults=config=>({aggregation_period:'hour',aggregation_method:'avg',...config});
const local=(en,nl)=>language(frontendHass())==='nl'?nl:en;
// Sum original bar values, never cumulative stack heights or prorated bins.
function deltaBarTotals(series,items,{start,end,viewStart=start,viewEnd=end,period,zone='UTC'}){
 if(!period||period==='none'||viewEnd<=viewStart)return [];
 return series.map((s,index)=>{
  let sum=0,count=0,covered=0,until=viewStart,clipped=false;
  for(let i=0;i<s.points.length;i++){const p=s.points[i];
   const [a,b]=periodBounds(p.t,period,zone),from=Math.max(start,a),to=Math.min(end,b),left=Math.max(viewStart,from),right=Math.min(viewEnd,to);
   if(right<=left||!Number.isFinite(p.v))continue;
   sum+=p.v;count++;
   const knownEnd=Math.min(right,s.points[i+1]?.t??end),knownStart=Math.max(left,p.t);
   covered+=Math.max(0,knownEnd-Math.max(knownStart,until));until=Math.max(until,knownEnd);
   clipped||=left>from||right<to||(s.source==='statistics'&&(a<start||b>end));
  }
  return {...items[index],value:count?sum:null,count,missing:covered<viewEnd-viewStart-1,clipped};
 });
}
class BarChartEditor extends HistoryGraphEditor {
 static get cardClass(){return BarChartCard;}
 _editorConfig(config){return editorConfig(defaults(config));}
 _bind(form,definition,data){
  if(form===this._form&&data.aggregation_period==='none')definition={...definition,schema:definition.schema.map(group=>group.name==='data_processing'?{...group,schema:group.schema.filter(field=>field.name!=='aggregation_method')}:group)};
  super._bind(form,definition,data);
 }
 _emit(){this._render();super._emit();}
}
class BarChartCard extends HistoryGraphCard {
 constructor(){super();this._graph=new BarGraph();}
 static async getConfigElement(){
  await super.getConfigElement();
  if(!customElements.get('eleven-bar-chart-editor'))customElements.define('eleven-bar-chart-editor',BarChartEditor);
  return document.createElement('eleven-bar-chart-editor');
 }
 static getStubConfig(){return {entities:[],aggregation_period:'hour',aggregation_method:'avg',hours_to_show:24};}
 setConfig(config){
  const c=defaults(config);
  if(c.entities===undefined||(Array.isArray(c.entities)&&c.entities.length===0)){
   // Native Add Card must be able to open an unconfigured sensor picker.
   SharedGraph.clearHover(this);this._generation++;this._inFlight=false;this._started=false;
   clearTimeout(this._timer);this._timer=null;this._series=[];this._rawSeries=null;this._viewport=null;
   this._config=null;this.shadowRoot.innerHTML=`<ha-card style="padding:16px">${local('Select a sensor in the editor.','Kies een sensor in de editor.')}</ha-card>`;return;
  }
  super.setConfig(c);
 }
 static getConfigForm(){
  const form=super.getConfigForm();
  for(const group of form.schema){
   if(group.name==='graph_settings'){
    const mode=group.schema.find(s=>s.name==='graph_mode');
    mode.default='lines';mode.selector={select:{mode:'dropdown',options:[{value:'lines',label:local('Grouped bars','Gegroepeerde staven')},{value:'stacked',label:local('Stacked bars','Gestapelde staven')}]}};
   }
   if(group.name==='data_processing'){
    group.schema.find(s=>s.name==='aggregation_period').default='hour';
    const method=group.schema.find(s=>s.name==='aggregation_method'),select=method.selector.select;
    method.selector={select:{...select,get options(){return [...select.options,{value:'delta',label:local('Delta (end − start)','Delta (eind − begin)')}];}}};
   }
  }
  const helper=form.computeHelper;
  form.computeHelper=function(item){return item?.name==='aggregation_method'?local('Delta: end minus start in raw history; with statistics, Recorder counter change including resets. Negative changes are retained; missing data leaves a gap. AVG remains time-weighted.','Delta: eind min begin bij ruwe historie; bij statistics de tellerwijziging uit Recorder, inclusief resets. Negatieve verschillen blijven behouden; ontbrekende gegevens geven een gat. AVG blijft tijdgewogen.'):helper.call(this,item);};
  return form;
 }
 static getSeriesConfigForm(row={},rows=[]){
  const form=super.getSeriesConfigForm(row,rows);
  // Reuse native sensor/color/gradient controls, not meaningless line/fill settings.
  form.schema=form.schema.filter(s=>s.name!=='series_fill').map(s=>s.name!=='series_line'?s:{...s,title:local('Bar appearance','Staafopmaak'),schema:s.schema.filter(f=>!['line_style_source','line_width','line_style','line_interpolation','connect_gaps'].includes(f.name))});
  return form;
 }
 _seriesAppearance(index){return {...super._seriesAppearance(index),show_fill:false,line_style:'solid'};}
 _dataInformation(){
  const start=this._viewStart,end=this._viewEnd,totals=this._config.aggregation_method==='delta'?deltaBarTotals(this._series,this._meta.items,{start:this._start,end:this._end,viewStart:start,viewEnd:end,period:this._config.aggregation_period,zone:this._zone}):[];
  const rows=this._series.map((s,i)=>{
   const stats=chartValueStatistics(s.points,start,end,(p,index)=>{const interval=this._barInterval(s.points,index,this._end,i);return [interval.start,interval.end];});
   // Aggregation combines the known fragments into one bar. Its value does
   // not prove that the underlying sensor covered the whole visible period.
   stats.missing||=chartValueStatistics(this._rawSeries?.[i]?.points??s.points,start,end).missing;
   return {...this._meta.items[i],...stats,...(totals[i]?{total:totals[i].value,clipped:totals[i].clipped}: {})};
  });
  return {start,end,bars:true,rows};
 }
 _aggregateSeries(){return aggregateSeries(this._rawSeries,this._start,this._end,this._config.aggregation_period,this._config.aggregation_method,this._zone,{preserveGaps:false});}
 // Every interval is a separate bar; line decimation would silently omit bins.
 _displayPoints(points){return displayPoints(points,this._viewStart,this._viewEnd,Infinity);}
 _getGraphAxes(series,meta,visible){
  const grouped=graphAxes(series,meta,this._config,this._start,this._end,visible);
  grouped.axes=grouped.axes.map((axis,index)=>{
   const group=grouped.plotSeries.filter((_,i)=>visible[i]&&grouped.seriesAxes[i]===index);
   const options=axis.unit===meta.items[0]?.unit?{...this._config}:{};
   let low=0,high=0;for(const s of group)for(const p of s.points)for(const v of [p.v,p.base])if(Number.isFinite(v)){low=Math.min(low,v);high=Math.max(high,v);}
   if(low===0&&options.y_min==null)options.y_min=0;
   if(high===0&&low<0&&options.y_max==null)options.y_max=0;
   return {unit:axis.unit,...yAxis([...group,{points:[{t:this._start,v:0}]}],options)};
  });
  grouped.axes=alignGridAxes(alignZeroAxes(grouped.axes,this._config,meta.items[0]?.unit),this._config);
  return grouped;
 }
 _barInterval(points,index,end,seriesIndex,plot=false){
  // Stacking has already synchronized timestamps across all sensors. Use
  // those intervals for every layer, including statistics/history mixtures.
  const stacked=plot&&this._config.graph_mode==='stacked';
  const p=points[index],period=this._config.aggregation_period==='none'&&!stacked&&this._series[seriesIndex]?.source==='statistics'?'hour':this._config.aggregation_period;
  const [start,finish]=period==='none'?[p.t,points[index+1]?.t??end]:periodBounds(p.t,period,this._zone);
  return {start:Math.max(this._start,start),end:Math.min(end,finish),duration:finish-start};
 }
 _barLayout(){
  const source=this._plotSeries??this._series,visible=this._config.entities.map((_,i)=>i).filter(i=>this._isSeriesVisible(i));
  const key=JSON.stringify([this._viewStart,this._viewEnd,this._config.aggregation_period,this._zone,visible]);
  if(this._barLayoutSource===source&&this._barLayoutKey===key)return this._barLayoutCache;
  const centers=new Set(),intervals=[];let duration=this._viewEnd-this._viewStart;
  for(const index of visible){const points=source[index]?.points??[];
   for(let i=0;i<points.length;i++){
    const interval=this._barInterval(points,i,this._end,index,true),a=Math.max(this._viewStart,interval.start),b=Math.min(this._viewEnd,interval.end);
    if(b<=a)continue;
    duration=Math.min(duration,interval.duration);centers.add((a+b)/2);
    if(Number.isFinite(points[i].v))intervals.push({interval,index});
   }
  }
  const positions=[...centers].sort((a,b)=>a-b);let band=duration;
  for(let i=1;i<positions.length;i++)band=Math.min(band,positions[i]-positions[i-1]);
  // Reserve a whole band, including its outer padding, when fitting edge
  // groups. Fitting only the painted span squeezes the inter-group gap away.
  if(positions.length>1)band=Math.min(band,(positions[1]-this._viewStart)/1.5,(this._viewEnd-positions.at(-2))/1.5,(this._viewEnd-this._viewStart)/2);
  this._barLayoutSource=source;this._barLayoutKey=key;
  return this._barLayoutCache={band,span:band*.76,visible,intervals};
 }
 _barGeometry(interval,x,index){
  const {band,span,visible}=this._barLayout(),grouped=this._config.graph_mode!=='stacked';
  const count=grouped?visible.length:1,slot=grouped?visible.indexOf(index):0;
  const a=Math.max(this._viewStart,interval.start),b=Math.min(this._viewEnd,interval.end);
  const center=Math.max(this._viewStart+band/2,Math.min(this._viewEnd-band/2,(a+b)/2));
  const left=center-span/2+slot*span/count;
  return {left:x(left),right:x(left+span*.9/count)};
 }
 _barAt(timestamp,index){
  const points=(this._plotSeries??this._series)[index].points;let low=0,high=points.length;
  while(low<high){const middle=(low+high)>>1;if(points[middle].t<=timestamp)low=middle+1;else high=middle;}
  return low?this._barInterval(points,low-1,this._end,index,true):null;
 }
 _pointerTime(timestamp){
  // An edge bar may be inset beyond its period. Hit-test the painted bars for
  // pointer/touch, while keyboard and synchronized hover keep semantic times.
  const layout=this._barLayout();
  layout.hits??=layout.intervals.map(({interval,index})=>({...this._barGeometry(interval,t=>t,index),time:(Math.max(this._viewStart,interval.start)+Math.min(this._viewEnd,interval.end))/2}));
  return layout.hits.find(b=>timestamp>=b.left&&timestamp<=b.right)?.time??timestamp;
 }
 _line(points,end,x,y,index=0){
  let path='';
  for(let i=0;i<points.length;i++){
   const p=points[i],interval=this._barInterval(points,i,Math.min(this._end,end),index,true);
   if(!Number.isFinite(p.v)||interval.end<=this._viewStart||interval.start>=this._viewEnd||interval.end<=interval.start)continue;
   const {left:l,right:r}=this._barGeometry(interval,x,index),base=this._config.graph_mode==='stacked'?(p.base??0):0;
   path+=`M ${l} ${y(base)} V ${y(p.v)} H ${r} V ${y(base)} Z `;
  }
  return path.trim();
 }
 _hoverInterval(timestamp){
  const a=this._viewStart??this._start,b=this._viewEnd??this._end;
  const t=Math.max(a,Math.min(b-1,timestamp)),period=this._config.aggregation_period;
  const bounds=period==='none'?[this._start,this._end]:periodBounds(t,period,this._zone);
  // Aggregated bars select one whole period; raw intervals retain their edges.
  const edges=[Math.max(a,bounds[0]),Math.min(b,bounds[1]),...this._series.flatMap((s,i)=>this._isSeriesVisible(i)?s.points.map(p=>p.t).filter(x=>x>a&&x<b&&x>bounds[0]&&x<bounds[1]):[])].sort((x,y)=>x-y);
  const end=edges.find(x=>x>t)??b,start=edges.filter(x=>x<=t).at(-1)??a;
  return {start,end,labelTime:period==='none'?start:bounds[0]};
 }
 _barTime(timestamp){
  const period=this._config.aggregation_period,options={timeZone:this._zone,year:'numeric',month:period==='month'?'long':'short'};
  if(period!=='month')options.day='numeric';
  if(!['day','week','month'].includes(period))Object.assign(options,{hour:'2-digit',minute:'2-digit',...(period==='none'?{second:'2-digit'}:{})});
  return new Intl.DateTimeFormat(this._lang||'en',options).format(timestamp);
 }
 _showTooltip(timestamp,publish=true){
  const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;
  const interval=this._hoverInterval(timestamp);
  // Keep History's value/gap handling, escaping and accessible rows, but never
  // publish its unsnapped timestamp or leave its measurement-time guide visible.
  super._showTooltip(interval.start,false);
  const tooltip=chart.querySelector('.tooltip');if(tooltip.hidden)return;
  const heading=tooltip.querySelector('strong'),oldTitle=heading.textContent,title=this._barTime(interval.labelTime);heading.textContent=title;
  const sr=chart.querySelector('.sr-only');sr.textContent=title+sr.textContent.slice(oldTitle.length);
  const box=chart.getBoundingClientRect(),plot=chart.querySelector('.plot').getBoundingClientRect();
  const x=t=>plot.left-box.left+(t-this._viewStart)/(this._viewEnd-this._viewStart)*plot.width;
  const {visible}=this._barLayout(),bounds=visible.map(i=>this._barGeometry(this._barAt(interval.start,i)??interval,x,i));
  const px=(Math.min(...bounds.map(b=>b.left))+Math.max(...bounds.map(b=>b.right)))/2,guide=chart.querySelector('.guide');if(guide)guide.style.left=`${px}px`;
  let dot=0;const markers=chart.querySelectorAll('.hover-dot');
  for(const i of visible){
   const height=valueAt((this._plotSeries??this._series)[i].points,interval.start),axis=this._axes?.[this._seriesAxes[i]]??{min:this._range[0],max:this._range[1]};
   if(height!==null&&height>=axis.min&&height<=axis.max){const b=bounds[visible.indexOf(i)];markers[dot++].style.left=`${(b.left+b.right)/2}px`;}
  }
  const measured=tooltip.getBoundingClientRect();
  tooltip.style.left=`${Math.max(4,Math.min(box.width-measured.width-4,px+14+measured.width>box.width-4?px-measured.width-14:px+14))}px`;
  if(publish)SharedGraph.publishHover(this,(interval.start+interval.end)/2);
 }
 _defaultTitle(lang){return lang==='nl'?'Staafdiagram':'Bar chart';}
 _styles(){
  const paints=this._config?.entities.map((id,i)=>`.series-bar[data-entity="${id}"]{fill:${this._appearance(i).stroke};stroke:none}`).join('')??'';
  return super._styles()+`\n${paints}\n.series-bar{stroke:none}.legend i{height:12px;width:8px;border:0!important;border-radius:2px;background:var(--series-color)}
`;
 }
}
if(!customElements.get('eleven-bar-chart'))customElements.define('eleven-bar-chart',BarChartCard);
window.customCards=window.customCards??[];
if(!window.customCards.some(c=>c.type==='eleven-bar-chart'))window.customCards.push({type:'eleven-bar-chart',name:'Eleven Bar Chart',get description(){return local('Vertical sensor history bars, based on Eleven History.','Verticale staven van sensorhistorie, gebaseerd op Eleven History.');}});

})();
