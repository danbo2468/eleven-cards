// Eleven Cards — HACS collection; seven cards, no external dependencies.
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
function calendarDayStart(key,zone='UTC'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;
 const nominal=Date.parse(`${key}T00:00:00Z`);
 return Number.isFinite(nominal)&&new Date(nominal).toISOString().slice(0,10)===key?periodMidnight(nominal,zone||'UTC'):NaN;
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
function periodDateTime(t,zone='UTC'){
 const p=periodLocalParts(t,zone),pad=n=>String(n).padStart(2,'0');
 return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
function parsePeriodDateTime(value,zone='UTC',edge='start',previous){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;
 if(Number.isFinite(previous)&&periodDateTime(previous,zone)===value)return previous;
 const nominal=Date.parse(value+'Z');if(!Number.isFinite(nominal)||periodDateTime(nominal,'UTC')!==value)return NaN;
 // Collect the offsets on both sides of a transition. Reject skipped local
 // times; repeated times include both occurrences unless editing an existing bound.
 const candidates=new Set();
 for(let h=-48;h<=48;h+=6){const sample=nominal+h*3600000,offset=periodLocalEpoch(sample,zone)-sample,candidate=nominal-offset;if(periodDateTime(candidate,zone)===value)candidates.add(candidate);}
 const times=[...candidates].sort((a,b)=>a-b);return times.length?(edge==='end'?times.at(-1):times[0]):NaN;
}
function chooseCustomGraphPeriod(host,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>366*86400000)return false;
 resetGraphPeriod(host);host._periodMode='custom';host._periodHours=(end-start)/3600000;host._periodEnd=end;
 publishTimeframe(host);host._reloadPeriod();return true;
}
function timeframeSyncConfig(config,{draft=false}={}){
 if(!draft){
  if(config.sync_timeframe!==undefined&&typeof config.sync_timeframe!=='boolean')throw Error('sync_timeframe must be a boolean. / Tijdvak synchroniseren moet aan of uit zijn.');
  for(const key of ['hover_sync_group','timeframe_sync_group'])if(config[key]!=null&&typeof config[key]!=='string')throw Error(`${key} must be text. / De synchronisatiegroep moet tekst zijn.`);
 }
 return {sync_timeframe:config.sync_timeframe??false,hover_sync_group:config.hover_sync_group??config.timeframe_sync_group??''};
}
function timeframeGroup(host){return host._config?.sync_timeframe===true?((host._config.hover_sync_group??host._config.timeframe_sync_group)?.trim()||'default'):null;}
function timeframeGroups(){
 const root=globalThis.window??globalThis,key=Symbol.for('eleven-cards.timeframe-sync.v1');
 return root[key]??=new Map();
}
function applyTimeframe(host,selection){
 // Default is a group-wide reset to each card's own configured range (or
 // native price window), rather than a copy of the sender's hours.
 if(selection.mode==='configured'&&selection.offset===0){resetGraphPeriod(host);return;}
 host._sharedTimeframe=selection;
 Object.assign(host,{_periodMode:selection.mode,_periodHours:selection.hours,_periodEnd:selection.end,_periodOffset:selection.offset,_periodAnchor:selection.anchor});
}
function disconnectTimeframeSync(host){
 host._disconnectTimeframeSync?.();host._disconnectTimeframeSync=null;
}
function connectTimeframeSync(host){
 disconnectTimeframeSync(host);
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const groups=timeframeGroups();let entry=groups.get(group);
 if(!entry){entry={selection:null,listeners:new Set()};groups.set(group,entry);}
 const receive=(selection,source)=>{
  if(source===host||host._sharedTimeframe===selection)return;
  applyTimeframe(host,selection);host._reloadPeriod();
 };
 entry.listeners.add(receive);
 host._disconnectTimeframeSync=()=>entry.listeners.delete(receive);
 // Joining never publishes this card's default over an existing selection.
 if(entry.selection)applyTimeframe(host,entry.selection);
}
function publishTimeframe(host){
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const entry=timeframeGroups().get(group);if(!entry)return;
 const selection={group,mode:host._periodMode,hours:host._periodHours??host._config.hours_to_show,
  end:host._periodEnd,offset:host._periodOffset,anchor:host._periodAnchor,zone:host._hass?.config?.time_zone||'UTC',at:Date.now()};
 selection.range=localGraphPeriodRange(host,selection.at);
 entry.selection=selection;applyTimeframe(host,selection);
 for(const receive of entry.listeners)receive(selection,host);
}
function resetGraphPeriod(host){host._sharedTimeframe=null;host._periodMode='configured';host._periodHours=null;host._periodEnd=null;host._periodOffset=0;host._periodAnchor=null;host._periodMenuOpen=false;host._periodMenuPending=false;host._periodCustomDraft=null;host._periodTab=null;host._insightPending=null;}
function graphPeriodRange(host,now=Date.now()){
 const shared=host._sharedTimeframe;
 if(shared&&timeframeGroup(host)===shared.group){
  // One clock and timezone for the whole group, including separate bundles.
  // Live selections advance together on the minute; historical ranges stay fixed.
  if(shared.offset===0&&shared.end==null&&(Math.floor(now/60000)!==Math.floor(shared.at/60000))){
   shared.at=now;shared.range=localGraphPeriodRange({_periodMode:shared.mode,_periodHours:shared.hours,_periodOffset:0,_hass:{config:{time_zone:shared.zone}}},now);
  }
  return {...shared.range};
 }
 return localGraphPeriodRange(host,now);
}
function localGraphPeriodRange(host,now){
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
 publishTimeframe(host);
 return host._reloadPeriod();
}
function moveGraphPeriod(host,direction){
 if(![-1,0,1].includes(direction))return;
 if(host._periodMode==='custom'){
  if(direction===0){host._periodEnd=null;host._periodOffset=0;}
  else{const end=(host._periodEnd??Date.now())+direction*host._periodHours*3600000;host._periodEnd=direction>0?Math.min(Date.now(),end):end;host._periodOffset=(host._periodOffset??0)+direction;}
  host._periodCustomDraft=null;host._periodTab=null;host._sharedTimeframe=null;publishTimeframe(host);return host._reloadPeriod();
 }
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
 host._sharedTimeframe=null;
 publishTimeframe(host);
 return host._reloadPeriod();
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
 "Tijdvak synchroniseren":"Synchronize timeframe","Tijdvakgroep":"Timeframe group",
 "Volgt het gekozen tijdvak van ingeschakelde kaarten in dezelfde groep. Alleen beschikbare bronprijzen worden getoond.":"Follows the selected timeframe of enabled cards in the same group. Only available source prices are shown.",
 "Dezelfde sleutel koppelt kaarten op deze pagina. Leeg gebruikt de standaardgroep.":"The same key links cards on this page. Empty uses the default group.",
 "De prijsbron bevat geen prijsintervallen voor het gekozen tijdvak.":"The price source has no price intervals for the selected timeframe.",
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
  "Synchronisatiegroep": "Synchronization group",
  "Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.": "Shares the selected time with other Eleven graphs on this page.",
  "Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.": "Cards with the same group share hover and timeframe when the corresponding synchronization is enabled. Empty uses the default group.",
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

function priceRequestWithTimeout(promise, milliseconds) {
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),milliseconds);timer.unref?.();})])
    .finally(()=>globalThis.clearTimeout?.(timer));
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
  sync_timeframe: false,
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
    const data = clone({...DEFAULT_CONFIG,...config,...timeframeSyncConfig(config,{draft:true})});
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
      group('graph_settings','Algemeen',['title','show_title','graph_mode','current_price_mode','tomorrow_after','show_average_line','show_price_levels','show_hover_line','sync_hover','sync_timeframe',...(data.sync_hover||data.sync_timeframe?['hover_sync_group']:[])].map(field)),
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
      sync_timeframe: "Tijdvak synchroniseren",
      sync_hover: "Hover synchroniseren",
      hover_sync_group: "Synchronisatiegroep",
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
            { name: 'sync_timeframe', default: false, selector: { boolean: {} } },
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
        sync_timeframe: "Volgt het gekozen tijdvak van ingeschakelde kaarten in dezelfde groep. Alleen beschikbare bronprijzen worden getoond.",
        sync_hover: "Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.",
        hover_sync_group: "Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.",
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
    timeframeSyncConfig(config);
    if (config.sync_hover !== undefined && typeof config.sync_hover !== 'boolean') throw new Error('sync_hover');
    if (config.hover_sync_group != null && typeof config.hover_sync_group !== 'string') throw new Error('hover_sync_group');
    SharedGraph.clearHover(this);
    this._config = {
      ...DEFAULT_CONFIG,
      ...config,
      ...timeframeSyncConfig(config),
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
    resetGraphPeriod(this);connectTimeframeSync(this);
    if(this._connected&&this._hass)this._render();
  }

  _reloadPeriod(){this._activeIndex=null;this._chart=null;this._resetConsumption();this._lastSignature=null;if(this._hass)this._render();}

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
    this._tibberRefreshAt=undefined;
    this._tibberCache = new Map();
  }

  _unwatchTibberConnection() {
    for(const event of ['ready','disconnected'])this._tibberConnection?.removeEventListener(event,this._onTibberConnection);
    this._tibberConnection=undefined;
  }

  _scheduleTibberRefresh() {
    if(!this.isConnected)return;
    const now=Date.now(),next=Math.min(...[...(this._tibberCache?.values()??[])].filter(item=>item.status!=='loading').map(item=>item.fetchedAt+(item.status==='ready'||item.status==='currency'?300000:60000)));
    if(!Number.isFinite(next))return;
    if(this._tibberTimer&&this._tibberRefreshAt<=next)return;
    clearTimeout(this._tibberTimer);this._tibberRefreshAt=next;
    this._tibberTimer=setTimeout(()=>{
      const due=this._tibberRefreshAt;this._tibberTimer=undefined;this._tibberRefreshAt=undefined;
      for(const [key,item] of this._tibberCache??[])if(item.status!=='loading'&&item.fetchedAt+(item.status==='ready'||item.status==='currency'?300000:60000)<=due)this._tibberCache.delete(key);
      if(this.isConnected && this._hass)this._render();
    },Math.max(0,next-now));
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
    if(previous && (previous.status==='loading' || Date.now()-previous.fetchedAt<(previous.status==='ready'||previous.status==='currency'?300000:60000))) {
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
        const {response}=await priceRequestWithTimeout(this._hass.callWS({type:'call_service',domain:'tibber_prices',service:'get_price',service_data,return_response:true}),15000);
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
    this._connected=true;connectTimeframeSync(this);
    SharedGraph.connectHover(this, timestamp => this._receiveHover(timestamp));
    this._watchTibberConnection();
    window.addEventListener('pointerdown', this._onOutsidePointer);
    this._watchConsumptionConnection();
    this._observeConsumptionSize();
    if (this._hass && this._config) this._render();
  }

  disconnectedCallback() {
    this._connected=false;disconnectTimeframeSync(this);
    SharedGraph.disconnectHover(this);
    this._unwatchTibberConnection();
    window.removeEventListener('pointerdown', this._onOutsidePointer);
    this._unwatchConsumptionConnection();
    this._consumptionResizeObserver?.disconnect();
    this._consumptionResizeObserver = undefined;
    if(this._consumptionResizeFrame!=null)cancelAnimationFrame(this._consumptionResizeFrame);
    this._consumptionResizeFrame=null;
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
      if (this._hass && this._config?.show_consumption && this._consumptionResizeFrame==null) {
        if(typeof requestAnimationFrame!=='function'){this._render();return;}
        this._consumptionResizeFrame=requestAnimationFrame(()=>{this._consumptionResizeFrame=null;if(this.isConnected)this._render();});
      }
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
    globalThis.clearTimeout?.(this._consumptionRefreshTimer);this._consumptionRefreshTimer=undefined;
    this._consumption = undefined;
    this._consumptionRequest = undefined;
  }

  _scheduleConsumptionRefresh() {
    globalThis.clearTimeout?.(this._consumptionRefreshTimer);this._consumptionRefreshTimer=undefined;
    const current=this._consumption;
    if(!this.isConnected||!current?.fetchedAt||!['ready','partial','empty','error'].includes(current.status))return;
    const delay=current.status==='error'?60000:300000;
    this._consumptionRefreshTimer=setTimeout(()=>{this._consumptionRefreshTimer=undefined;if(this.isConnected&&this._hass)this._render();},Math.max(0,current.fetchedAt+delay-Date.now()));
  }

  _ensureConsumption(start, end, intervalMinutes) {
    if (this._config.show_consumption !== true) return;
    if (!(end > start)) {
      this._resetConsumption();
      this._consumption = { status: 'empty', points: [], intervalMinutes };
      return;
    }
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
    if (this._consumption?.key === key && Date.now() - this._consumption.fetchedAt < (this._consumption.status==='error'?60000:300000)) return;
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
        const history = await priceRequestWithTimeout(hass.callApi('GET', `history/period/${new Date(start - 300000).toISOString()}?${query}`),15000);
        if (!current()) return;
        points = consumptionFromHistory(history?.[0] ?? [], start, end, intervalMinutes, now);
      } catch { historyFailed = true; }
      if (!current()) return;
      if (!points.some(point => Number.isFinite(point.energy)) && until - start >= 3600000) {
        try {
          const statistics = await priceRequestWithTimeout(hass.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(start).toISOString(), end_time: new Date(until).toISOString(), statistic_ids: [entity], period: 'hour', types: ['change'], units: { energy: 'kWh' } }),15000);
          points = consumptionFromStatistics(statistics?.[entity] ?? [], start, end, now);
          cadence = 60;
          source = 'statistics';
        } catch {
          if (!current()) return;
          this._consumption = { key, fetchedAt: Date.now(), status: 'error', points: [], intervalMinutes };
          this._consumptionRequest = undefined;
          this._render();
          this._scheduleConsumptionRefresh();
          return;
        }
      }
      if (!current()) return;
      const available = points.filter(point => Number.isFinite(point.energy)).length;
      this._consumption = { key, fetchedAt: Date.now(), points, intervalMinutes: cadence, source,
        status: available ? (available < points.length ? 'partial' : 'ready') : historyFailed ? 'error' : 'empty' };
      this._consumptionRequest = undefined;
      this._render();
      this._scheduleConsumptionRefresh();
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
    const sharedRange=this._sharedTimeframe?graphPeriodRange(this):null;
    const visible=data=>{
      const points=sharedRange?normalizePoints(data,timeZone):getVisiblePoints(data,now,timeZone,this._config.tomorrow_after);
      const intervalMinutes=inferIntervalMinutes(points);
      return {points:sharedRange?points.filter(p=>p.timestamp<sharedRange.end&&p.timestamp+intervalMinutes*60000>sharedRange.start):points,intervalMinutes};
    };
    const {points:importPoints,intervalMinutes}=visible(rawImportData);
    if (!importPoints.length) {
      this.shadowRoot.innerHTML = this._stateCard(
        this._t("Nog geen prijsgegevens"),
        sharedRange?this._t("De prijsbron bevat geen prijsintervallen voor het gekozen tijdvak."):this._t("De afname-entiteit bevat geen prijsintervallen voor vandaag."),
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
    const {points:exportPoints,intervalMinutes:exportIntervalMinutes}=rawExportData
      ? visible(rawExportData)
      : {points:[],intervalMinutes:intervalMinutes};
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

    const intervalMs = intervalMinutes * 60000;
    const cheapPrice = Number(this._config.cheap_price);
    const normalPrice = Number(this._config.normal_price);
    const expensivePrice = Number(this._config.expensive_price);
    const svgWidth = SVG_WIDTH;
    const svgHeight = SVG_HEIGHT;
    const start = sharedRange?.start??timeline[0].timestamp;
    const end = sharedRange?.end??(timeline.at(-1).timestamp + intervalMs);
    const consumptionStart=sharedRange?Math.ceil(start/intervalMs)*intervalMs:start;
    this._ensureConsumption(consumptionStart, end, intervalMinutes);
    const consumptionEnabled = this._config.show_consumption === true;
    const graphShowsConsumption = consumptionEnabled && !this._hiddenSeries.has('consumption');
    const consumptionPoints = this._consumption?.points ?? [];
    const consumptionIntervalMs = (this._consumption?.intervalMinutes ?? intervalMinutes) * 60000;
    const chartPixels = this.shadowRoot.querySelector('.chart')?.clientWidth || Math.max(1, (this.clientWidth || 1000) - (this.clientWidth <= 520 ? 24 : 32));
    const plotRight = PLOT.right + (graphShowsConsumption ? 32 * svgWidth / chartPixels : 0);
    const plotWidth = svgWidth - PLOT.left - plotRight;
    const plotHeight = svgHeight - PLOT.top - PLOT.bottom;
    const span = Math.max(sharedRange?1:intervalMs, end - start);
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
    const xFor = (timestamp) => PLOT.left + (sharedRange?Math.max(0,Math.min(1,(timestamp-start)/span)):(timestamp-start)/span) * plotWidth;
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
      return `<span class="chart-label day-label" style="left:${(x / svgWidth) * 100}%">${sharedRange?'':`${index === 0 ? this._t("Vandaag") : this._t("Morgen")} · `}${this._formatDay(dayPoints[0].timestamp, timeZone)}</span>`;
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
    if (!sharedRange && showTomorrow && !tomorrowPoints.length) statusParts.push(this._t("Morgenprijzen ontbreken"));
    else if (!sharedRange && showTomorrow && tomorrowMinutes < 24 * 60) statusParts.push(this._t("Morgenprijzen zijn onvolledig"));
    const dataStatus = statusParts.length
      ? `<div class="data-status warning">${statusParts.map((part) => `<span>${escapeHtml(part)}</span>`).join('<i aria-hidden="true">·</i>')}</div>`
      : '';

    const currentImport = findCurrentPoint(getVisiblePoints(rawImportData,now,timeZone,this._config.tomorrow_after), now);
    const currentExport = findCurrentPoint(getVisiblePoints(rawExportData,now,timeZone,this._config.tomorrow_after), now);
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

// ../../shared/ui-button.js
// Native controls: text/attributes are escaped; content is trusted, caller-owned HTML.
function uiEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function uiAttributes(values={}){
 return Object.entries(values).map(([key,value])=>{
  if(!/^[a-zA-Z_:][\w:.-]*$/.test(key)||/^on/i.test(key))throw Error('Invalid UI attribute: '+key);
  if(value==null)return '';
  if(['disabled','hidden','required','autofocus','multiple','readonly'].includes(key))return value?` ${key}`:'';
  return ` ${key}="${uiEscape(value)}"`;
 }).join('');
}
function uiButton({text='',content,label,title,variant='icon',className='',type='button',href,disabled=false,attrs={}}={}){
 const classes=className?` class="${uiEscape(className)}"`:'';
 const body=content??uiEscape(text),attributes=uiAttributes({...attrs,...(label==null?{}:{'aria-label':label}),...(title==null?{}:{title}),...(disabled?{disabled:true}:{})});
 return href==null?`<button type="${uiEscape(type)}"${classes} data-ui-button="${uiEscape(variant)}"${attributes}>${body}</button>`:`<a${classes} data-ui-button="${uiEscape(variant)}" href="${uiEscape(href)}"${attributes}>${body}</a>`;
}
function uiButtonStyles(){return `
[data-ui-button]{display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:inherit;font-size:12px;font-weight:400;padding:0;border:0;border-radius:4px;background:transparent;color:var(--primary-text-color,#20252b);text-decoration:none;cursor:pointer;flex:none}
[data-ui-button="icon"]{width:32px;height:32px}
[data-ui-button]:not(:disabled):hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
[data-ui-button]:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
[data-ui-button="icon"]:focus-visible{background:var(--secondary-background-color,#eee)}
[data-ui-button]:disabled{opacity:.35;cursor:default}
[data-ui-button="surface"]{height:auto;width:100%;justify-content:space-between;gap:8px;min-height:34px;text-align:start;padding:6px 8px;border-radius:5px;background:var(--secondary-background-color,#eee)}
[data-ui-button="surface"][aria-checked="true"],[data-ui-button="surface"][aria-pressed="true"]{color:var(--primary-color,#2196f3);background:color-mix(in srgb,var(--primary-color,#2196f3) 14%,var(--ha-card-background,var(--card-background-color,#fff)));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--primary-color,#2196f3) 55%,transparent)}
[data-ui-button="text"]{min-height:30px;height:auto;width:auto;border-radius:5px}
[data-ui-button="close"]{width:30px;height:30px;min-height:30px;border-radius:5px;font-size:20px;color:inherit}
`;}

// ../../shared/ui-legend.js

// The caller owns each item's trusted HTML (swatch, label and optional value).
function uiLegendButton({id,visible=true,content='',title='',className='legend-item',attrs={}}={}){
 return `<button type="button" class="${uiEscape(className)}"${uiAttributes({...attrs,'data-ui-legend':id,'aria-pressed':visible,title})}>${content}</button>`;
}
function uiLegend({items=[],className='legend',attrs={},afterContent=''}={}){
 return `<div class="${uiEscape(className)}"${uiAttributes(attrs)}>${items.map(uiLegendButton).join('')}${afterContent}</div>`;
}
function cancelUILegendClicks(host){
 for(const timer of host._legendClickTimers?.values()??[])clearTimeout(timer);
 host._legendClickTimers?.clear();
}
function focusUILegend(host,id,selector='[data-ui-legend]',getId=button=>button.dataset.uiLegend){
 queueMicrotask(()=>[...host.shadowRoot.querySelectorAll(selector)].find(button=>getId(button)===id)?.focus({preventScroll:true}));
}
function bindUILegend(host,{selector='[data-ui-legend]',getId=button=>button.dataset.uiLegend,hint='',toggle,isolate}={}){
 for(const button of host.shadowRoot.querySelectorAll?.(selector)??[]){
  const id=getId(button);
  if(hint&&!button.title?.includes(hint))button.title=[button.title,hint].filter(Boolean).join(' ');
  if(hint)button.setAttribute('aria-description',hint);
  button.setAttribute('aria-keyshortcuts','Shift+Enter Shift+Space');
  button.onclick=event=>{
   clearTimeout(host._legendClickTimers?.get(id));host._legendClickTimers?.delete(id);
   if(event.shiftKey||event.detail>1){event.preventDefault();isolate?.(id);return;}
   if(!event.detail){(toggle??isolate)?.(id);return;}
   // Wait for the second click before a rerender replaces the clicked button.
   if(toggle){const config=host._config;host._legendClickTimers??=new Map();host._legendClickTimers.set(id,setTimeout(()=>{host._legendClickTimers.delete(id);if(host._config===config)toggle(id);},300));}
  };
  button.ondblclick=event=>event.preventDefault();
  button.onkeydown=event=>{if(event.shiftKey&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();isolate?.(id);}};
 }
}

// ../../shared/ui-tabs.js
function uiTabs({id,label,items,selected,className='',panelClassName=''}={}){
 if(typeof id!=='string'||!id||!items?.length||items.some(item=>typeof item.value!=='string'||!item.value)||new Set(items.map(item=>item.value)).size!==items.length)throw Error('Tabs need an id and distinct text values.');
 const active=items.find(item=>item.value===selected&&!item.disabled)??items.find(item=>!item.disabled);
 const tabId=value=>`${id}-tab-${encodeURIComponent(value)}`,panelId=value=>`${id}-panel-${encodeURIComponent(value)}`;
 const bar=`<div${uiAttributes({class:className||null,'data-ui-tabs':'',role:'tablist','aria-label':label})}>${items.map(item=>uiButton({variant:'tab',text:item.label,disabled:item.disabled,attrs:{role:'tab',id:tabId(item.value),'data-ui-tab':item.value,'aria-controls':panelId(item.value),'aria-selected':item===active,tabindex:item===active?0:-1,...item.tabAttrs}})).join('')}</div>`;
 const panels=items.map(item=>`<section${uiAttributes({class:[panelClassName,item.className].filter(Boolean).join(' ')||null,id:panelId(item.value),role:'tabpanel','aria-labelledby':tabId(item.value),'data-ui-tab-panel':item.value,...item.panelAttrs,hidden:item!==active})}>${item.content??''}</section>`).join('');
 return bar+panels;
}
function bindUITabs({tabs,panels,onSelect=()=>{}}){
 const buttons=[...tabs],sections=[...panels],cleanups=[];
 const select=(value,{focus=false,notify=true}={})=>{
  const target=buttons.find(tab=>tab.dataset.uiTab===value&&!tab.disabled);if(!target)return false;
  for(const tab of buttons){const active=tab===target;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  for(const panel of sections)panel.hidden=panel.dataset.uiTabPanel!==value;
  if(focus)target.focus({preventScroll:true});if(notify)onSelect(value,target);return true;
 };
 for(const tab of buttons){
  const click=()=>select(tab.dataset.uiTab,{focus:true});
  const keydown=e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
   e.preventDefault();e.stopPropagation();const enabled=buttons.filter(button=>!button.disabled),index=enabled.indexOf(tab);
   const next=e.key==='Home'?0:e.key==='End'?enabled.length-1:(index+(e.key==='ArrowRight'?1:-1)+enabled.length)%enabled.length;
   if(enabled[next])select(enabled[next].dataset.uiTab,{focus:true});
  };
  tab.onclick=click;tab.onkeydown=keydown;
  cleanups.push(()=>{if(tab.onclick===click)tab.onclick=null;if(tab.onkeydown===keydown)tab.onkeydown=null;});
 }
 return {select,disconnect(){cleanups.splice(0).forEach(remove=>remove());}};
}
function uiTabsStyles(){return `
[data-ui-tabs]{display:flex;align-items:flex-end;gap:8px;border-bottom:1px solid var(--divider-color,#ddd)}
[data-ui-tabs] [role="tab"]{flex:1;justify-content:center;min-width:0;min-height:36px;padding:8px 3px;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--secondary-text-color,#666);white-space:nowrap}
[data-ui-tabs] [role="tab"]:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 5%,var(--ha-card-background,var(--card-background-color,#fff)));color:var(--primary-text-color,#20252b)}
[data-ui-tabs] [role="tab"][aria-selected="true"]{border-bottom-color:var(--primary-color,#2196f3);color:var(--primary-color,#2196f3);font-weight:600}
[data-ui-tab-panel][hidden]{display:none!important}
`;}

// ../../shared/ui-popup.js
function uiPopup({id,title,label=title,closeLabel='Close',content='',className='',attrs={},closeAttrs={}}){
 return `<div${uiAttributes({id,class:className||null,'data-ui-popup':'',popover:'auto',role:'dialog','aria-label':label,...attrs})}><div class="ui-popup-heading"><strong>${uiEscape(title)}</strong>${uiButton({variant:'close',content:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>',label:closeLabel,attrs:{'data-ui-popup-close':'',...closeAttrs}})}</div>${content}</div>`;
}
function bindUIPopupPosition({trigger,popup,isRequested,onShow,ready,width=380,maxHeight=560}){
 let active=true;
 const position=()=>{
  if(!active||!isRequested())return;
  const box=trigger.getBoundingClientRect();
  if(!box.width||!box.height){popup.style.visibility='hidden';return;}
  const actualWidth=Math.min(width,window.innerWidth-16);
  popup.style.width=actualWidth+'px';popup.style.maxHeight=Math.min(maxHeight,window.innerHeight-16)+'px';
  popup.style.visibility='';onShow?.();
  const height=popup.getBoundingClientRect().height,below=window.innerHeight-box.bottom-8,above=box.top-8;
  popup.style.left=Math.max(8,Math.min(box.right-actualWidth,window.innerWidth-actualWidth-8))+'px';
  popup.style.top=Math.max(8,Math.min(below>=height||below>=above?box.bottom+6:box.top-height-6,window.innerHeight-height-8))+'px';
 };
 if(ready?.then)ready.then(position,()=>{});
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(position):null;
 observer?.observe(trigger);
 return {position,disconnect(){active=false;observer?.disconnect();}};
}
// Domain state lives in callbacks; this controller also works without a card host.
function bindUIPopup({trigger,popup,container=popup,ready,isRequested,isCurrent=()=>true,beforeOpen=()=>{},onOpen=()=>{},onClose=()=>{},onShown=()=>{},onToggle=()=>{},focusTarget,closeWhenAnchorHidden=false}){
 let requested=false,pending=false,focusPending=false,pointerWasOpen;
 const wantsOpen=isRequested??(()=>requested),native=typeof popup.showPopover==='function';
 const isOpen=()=>native?popup.matches(':popover-open'):popup.hasAttribute('data-fallback-open');
 trigger.setAttribute('aria-haspopup','dialog');if(popup.id)trigger.setAttribute('aria-controls',popup.id);trigger.setAttribute('aria-expanded',String(isOpen()));
 const cleanups=[],listen=(target,type,handler,capture=false)=>{target?.addEventListener?.(type,handler,capture);cleanups.push(()=>target?.removeEventListener?.(type,handler,capture));};
 const property=(target,key,handler)=>{if(!target)return;target[key]=handler;cleanups.push(()=>{if(target[key]===handler)target[key]=null;});};
 const closeButton=popup.querySelector('[data-ui-popup-close]');
 const placement=bindUIPopupPosition({trigger,popup,ready,isRequested:wantsOpen,onShow:()=>{
  pending=false;if(native){if(!isOpen())popup.showPopover();}else popup.setAttribute('data-fallback-open','');
  if(focusPending){(focusTarget?.()??closeButton)?.focus({preventScroll:true});focusPending=false;}
  onShown();
 }});
 const close=(focus=false)=>{
  requested=false;pending=false;focusPending=false;onClose();trigger.setAttribute('aria-expanded','false');
  if(native){if(isOpen())popup.hidePopover();}else popup.removeAttribute('data-fallback-open');
  if(focus)trigger.focus({preventScroll:true});
 };
 const open=(focus=true)=>{beforeOpen();requested=true;pending=true;focusPending=focus;onOpen(focus);trigger.setAttribute('aria-expanded','true');placement.position();};
 property(trigger,'onpointerdown',()=>{pointerWasOpen=wantsOpen();});
 property(trigger,'onpointercancel',()=>{pointerWasOpen=undefined;});
 property(trigger,'onclick',()=>{const wasOpen=pointerWasOpen??wantsOpen();pointerWasOpen=undefined;wasOpen?close(true):open();});
 property(closeButton,'onclick',()=>close(true));
 listen(popup,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}});
 listen(popup,'toggle',e=>{if(!isCurrent())return;const opened=e.newState==='open';if(!opened){if(wantsOpen())onClose();pending=false;focusPending=false;}requested=opened;trigger.setAttribute('aria-expanded',String(opened));onToggle(opened);});
 listen(window,'resize',()=>{if(wantsOpen()){if(closeWhenAnchorHidden&&trigger.getClientRects?.().length===0)close();else placement.position();}});
 listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(popup))close();},true);
 listen(document,'pointerdown',e=>{if((!native||pending)&&(isOpen()||wantsOpen())&&!e.composedPath().includes(container))close();});
 return {open,close,isOpen,position:placement.position,disconnect(){placement.disconnect();cleanups.splice(0).forEach(remove=>remove());}};
}
function uiPopupStyles(){return `
[data-ui-popup]{display:none;position:fixed;inset:auto;margin:0;padding:8px 12px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;z-index:20;max-width:calc(100vw - 16px);border:1px solid var(--divider-color,#ddd);border-radius:10px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font:inherit;font-size:12px;line-height:1.35;box-shadow:0 8px 28px #0004}
[data-ui-popup]:popover-open,[data-ui-popup][data-fallback-open]{display:block}
[data-ui-popup] [hidden]{display:none!important}
.ui-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.ui-popup-heading>strong{font-size:14px;font-weight:600}
.ui-popup-heading [data-ui-popup-close]{display:grid;place-items:center;width:30px;height:30px;min-height:30px;padding:0;line-height:1;flex:none}
.ui-popup-heading [data-ui-popup-close] svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
`;}

// ../../shared/card-header.js
// Shared markup stays in each card's shadow root: native links and existing
// data-zoom handlers work without cross-bundle custom-element registration.
const headerEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bindCardPopupPosition(host,trigger,popup,isRequested,show){
 return bindUIPopupPosition({trigger,popup,isRequested,onShow:show,ready:host.shadowRoot.querySelector('ha-card')?.updateComplete});
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
 const zoom=ready?`<div class="zoom-controls" role="group" aria-label="Zoom">${['out','in','reset'].map(action=>uiButton({content:cardHeaderIcon(action),disabled:!zoomState[action],title:label[['in','out','reset'].indexOf(action)],label:label[['in','out','reset'].indexOf(action)],attrs:{'data-zoom':action}})).join('')}</div>`:'';
 const group=periods.picker||periods.navigation?`<div class="chart-controls" role="group" aria-label="${nl?'Tijdvak':'Timeframe'}">${periods.picker??''}${periods.navigation??''}</div>`:'';
 const showZoomStatus=zoomState.zoomed&&!periods.picker;
 return `<header class="card-header">${showTitle&&title?`<h2>${headerEscape(title)}</h2>`:''}<div class="header-actions">${group}${zoom}<div class="chart-links" role="group" aria-label="${nl?'Geschiedenis en informatie':'History and information'}">${uiButton({href:historyUrl??'',className:'history-link',content:cardHeaderIcon('history'),title:label[3],label:label[3]})}${information}</div></div></header>${showZoomStatus?`<div class="chart-context"><div class="chart-range"><span class="zoom-status">${nl?'Ingezoomd':'Zoomed in'}</span></div></div>`:''}`;
}
function cardHeaderStyles(){return uiButtonStyles()+uiPopupStyles()+`
.card-header{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;min-height:32px;flex:none;margin:-6px -4px 10px 0}
.card-header h2{flex:1 1 110px;min-width:0;margin:4.75px 0 0;font-size:18px;line-height:1.25;font-weight:650;letter-spacing:-.01em;overflow-wrap:anywhere}
.header-actions{--chart-action-gap:8px;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:var(--chart-action-gap);flex:0 1 auto;min-width:0;max-width:100%;margin-inline-start:auto}
.chart-controls{display:flex;align-items:center;gap:0;min-width:0;max-width:100%}
.chart-links{display:flex;align-items:center;gap:0;flex:none}
.zoom-controls{display:flex;gap:0;position:relative}
.chart-controls,.zoom-controls,.chart-links{background:var(--secondary-background-color,#eee);border-radius:5px}
.chart-controls>[data-period="now"]{width:36px}
.chart-controls>.period-controls{position:relative;margin-inline-end:8px;padding-inline-end:8px}
.chart-controls>.period-controls::after{content:"";position:absolute;inset-inline-end:0;top:8px;height:16px;width:1px;background:var(--divider-color,#ddd)}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
`;}

// ../../shared/request.js
function retryDelay(failures, base = 60000, maximum = 300000) {
  return Math.min(maximum, base * 2 ** Math.max(0, failures - 1));
}

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
function calendarDayStart(key,zone='UTC'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;
 const nominal=Date.parse(`${key}T00:00:00Z`);
 return Number.isFinite(nominal)&&new Date(nominal).toISOString().slice(0,10)===key?periodMidnight(nominal,zone||'UTC'):NaN;
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
function periodDateTime(t,zone='UTC'){
 const p=periodLocalParts(t,zone),pad=n=>String(n).padStart(2,'0');
 return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
function parsePeriodDateTime(value,zone='UTC',edge='start',previous){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;
 if(Number.isFinite(previous)&&periodDateTime(previous,zone)===value)return previous;
 const nominal=Date.parse(value+'Z');if(!Number.isFinite(nominal)||periodDateTime(nominal,'UTC')!==value)return NaN;
 // Collect the offsets on both sides of a transition. Reject skipped local
 // times; repeated times include both occurrences unless editing an existing bound.
 const candidates=new Set();
 for(let h=-48;h<=48;h+=6){const sample=nominal+h*3600000,offset=periodLocalEpoch(sample,zone)-sample,candidate=nominal-offset;if(periodDateTime(candidate,zone)===value)candidates.add(candidate);}
 const times=[...candidates].sort((a,b)=>a-b);return times.length?(edge==='end'?times.at(-1):times[0]):NaN;
}
function chooseCustomGraphPeriod(host,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>366*86400000)return false;
 resetGraphPeriod(host);host._periodMode='custom';host._periodHours=(end-start)/3600000;host._periodEnd=end;
 publishTimeframe(host);host._reloadPeriod();return true;
}
function timeframeSyncConfig(config,{draft=false}={}){
 if(!draft){
  if(config.sync_timeframe!==undefined&&typeof config.sync_timeframe!=='boolean')throw Error('sync_timeframe must be a boolean. / Tijdvak synchroniseren moet aan of uit zijn.');
  for(const key of ['hover_sync_group','timeframe_sync_group'])if(config[key]!=null&&typeof config[key]!=='string')throw Error(`${key} must be text. / De synchronisatiegroep moet tekst zijn.`);
 }
 return {sync_timeframe:config.sync_timeframe??false,hover_sync_group:config.hover_sync_group??config.timeframe_sync_group??''};
}
function timeframeGroup(host){return host._config?.sync_timeframe===true?((host._config.hover_sync_group??host._config.timeframe_sync_group)?.trim()||'default'):null;}
function timeframeGroups(){
 const root=globalThis.window??globalThis,key=Symbol.for('eleven-cards.timeframe-sync.v1');
 return root[key]??=new Map();
}
function applyTimeframe(host,selection){
 // Default is a group-wide reset to each card's own configured range (or
 // native price window), rather than a copy of the sender's hours.
 if(selection.mode==='configured'&&selection.offset===0){resetGraphPeriod(host);return;}
 host._sharedTimeframe=selection;
 Object.assign(host,{_periodMode:selection.mode,_periodHours:selection.hours,_periodEnd:selection.end,_periodOffset:selection.offset,_periodAnchor:selection.anchor});
}
function disconnectTimeframeSync(host){
 host._disconnectTimeframeSync?.();host._disconnectTimeframeSync=null;
}
function connectTimeframeSync(host){
 disconnectTimeframeSync(host);
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const groups=timeframeGroups();let entry=groups.get(group);
 if(!entry){entry={selection:null,listeners:new Set()};groups.set(group,entry);}
 const receive=(selection,source)=>{
  if(source===host||host._sharedTimeframe===selection)return;
  applyTimeframe(host,selection);host._reloadPeriod();
 };
 entry.listeners.add(receive);
 host._disconnectTimeframeSync=()=>entry.listeners.delete(receive);
 // Joining never publishes this card's default over an existing selection.
 if(entry.selection)applyTimeframe(host,entry.selection);
}
function publishTimeframe(host){
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const entry=timeframeGroups().get(group);if(!entry)return;
 const selection={group,mode:host._periodMode,hours:host._periodHours??host._config.hours_to_show,
  end:host._periodEnd,offset:host._periodOffset,anchor:host._periodAnchor,zone:host._hass?.config?.time_zone||'UTC',at:Date.now()};
 selection.range=localGraphPeriodRange(host,selection.at);
 entry.selection=selection;applyTimeframe(host,selection);
 for(const receive of entry.listeners)receive(selection,host);
}
function resetGraphPeriod(host){host._sharedTimeframe=null;host._periodMode='configured';host._periodHours=null;host._periodEnd=null;host._periodOffset=0;host._periodAnchor=null;host._periodMenuOpen=false;host._periodMenuPending=false;host._periodCustomDraft=null;host._periodTab=null;host._insightPending=null;}
function graphPeriodRange(host,now=Date.now()){
 const shared=host._sharedTimeframe;
 if(shared&&timeframeGroup(host)===shared.group){
  // One clock and timezone for the whole group, including separate bundles.
  // Live selections advance together on the minute; historical ranges stay fixed.
  if(shared.offset===0&&shared.end==null&&(Math.floor(now/60000)!==Math.floor(shared.at/60000))){
   shared.at=now;shared.range=localGraphPeriodRange({_periodMode:shared.mode,_periodHours:shared.hours,_periodOffset:0,_hass:{config:{time_zone:shared.zone}}},now);
  }
  return {...shared.range};
 }
 return localGraphPeriodRange(host,now);
}
function localGraphPeriodRange(host,now){
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
 publishTimeframe(host);
 return host._reloadPeriod();
}
function moveGraphPeriod(host,direction){
 if(![-1,0,1].includes(direction))return;
 if(host._periodMode==='custom'){
  if(direction===0){host._periodEnd=null;host._periodOffset=0;}
  else{const end=(host._periodEnd??Date.now())+direction*host._periodHours*3600000;host._periodEnd=direction>0?Math.min(Date.now(),end):end;host._periodOffset=(host._periodOffset??0)+direction;}
  host._periodCustomDraft=null;host._periodTab=null;host._sharedTimeframe=null;publishTimeframe(host);return host._reloadPeriod();
 }
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
 host._sharedTimeframe=null;
 publishTimeframe(host);
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
 if(mode==='custom'||zoomed||(past&&!['today','week','month','quarter','year'].includes(mode)&&hours<24)){
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
 if(active?.closest?.('.header-actions'))host._periodFocus=active.dataset.periodTab!=null?`tab:${active.dataset.periodTab}`:active.dataset.customField!=null?`custom:${active.dataset.customField}`:active.dataset.periodOption!=null?`option:${active.dataset.periodOption}`:active.dataset.zoom!=null?`zoom:${active.dataset.zoom}`:active.classList.contains('history-link')?'history':active.dataset.period;
 if(host._config.show_navigation===false){host._periodMenuOpen=false;host._periodMenuPending=false;return {};}
 const previousMenu=host.shadowRoot.querySelector('.period-menu');
 if(previousMenu){
  if(!host._periodMenuPending)host._periodMenuScroll=previousMenu.scrollTop;
  host._periodMenuOpen=!!host._periodMenuPending||(typeof previousMenu.showPopover==='function'?previousMenu.matches(':popover-open'):previousMenu.hasAttribute('data-fallback-open'));
 }
 const nl=language.startsWith('nl'),label=(en,nlText)=>nl?nlText:en,mode=host._periodMode??'configured',past=(host._periodOffset??0)<0;
 const standard=label(`Default (${host._config.hours_to_show} hours)`,`Standaard (${host._config.hours_to_show} uur)`);
 const rolling=[['1h',1],['6h',6],['12h',12],['24h',24],['48h',48],['7d',168],['14d',336],['30d',720],['90d',2160],['365d',8760]].map(([id,hours])=>[id,hours<168?label(`${hours} ${hours===1?'hour':'hours'}`,`${hours} uur`):label(`${hours/24} days`,`${hours/24} dagen`),hours<168?`${hours} ${nl?'u':'h'}`:`${hours/24} d`]);
 const calendar=[['today',label('Today','Vandaag'),label('Day','Dag')],['week',label('This week','Deze week'),label('Week','Week')],['month',label('This month','Deze maand'),label('Month','Maand')],['quarter',label('This quarter','Dit kwartaal'),label('Quarter','Kwartaal')],['year',label('This year','Dit jaar'),label('Year','Jaar')]];
 const calendarChoice=calendar.find(([id])=>id===mode);
 if(!calendarChoice&&mode!=='configured'&&mode!=='custom'&&host._periodHours!=null&&!rolling.some(([id])=>id===mode))rolling.push([mode,label(`${host._periodHours} hours`,`${host._periodHours} uur`)]);
 const selectedStandard=label(`Default (${host._periodHours??host._config.hours_to_show} hours)`,`Standaard (${host._periodHours??host._config.hours_to_show} uur)`);
 const name=mode==='configured'?selectedStandard:calendarChoice?.[past?2:1]??rolling.find(([id])=>id===mode)?.[1]??standard;
 const tabIds=['rolling','calendar','custom'];
 const selectedTab=host._periodMenuOpen&&tabIds.includes(host._periodTab)?host._periodTab:mode==='custom'?'custom':calendarChoice?'calendar':'rolling';
 host._periodTab=selectedTab;
 const choice=([value,text,compact])=>uiButton({variant:'surface',content:`<span>${periodEscape(compact??text)}</span><span aria-hidden="true">${value===mode?'✓':''}</span>`,attrs:{role:'menuitemradio','aria-checked':value===mode,tabindex:-1,'aria-label':text,title:text,'data-period-option':value}});

 const {start,end}=host._status==='ready'&&Number.isFinite(host._viewStart)&&Number.isFinite(host._viewEnd)?{start:host._viewStart,end:host._viewEnd}:graphPeriodRange(host);
 const locale=nl?'nl-NL':'en-GB',zone=host._hass?.config?.time_zone||'UTC';
 const zoomed=host._status==='ready'&&(start>host._start+1||end<host._end-1);
 const compactName=compactPeriodName({start,end,mode,past,zoomed,hours:host._periodHours??host._config.hours_to_show,name,locale,zone});
 const format=new Intl.DateTimeFormat(locale,{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
 const range=`${format.format(start)} – ${format.format(end)}`;
 const customRange=graphPeriodRange(host),draft=host._periodCustomDraft??{start:periodDateTime(customRange.start,zone),end:periodDateTime(customRange.end,zone)};
 const canGoNext=mode==='custom'?host._periodEnd!=null&&customRange.end<Date.now():past;
 const custom=`<form data-custom-range><div class="period-custom-fields">${[['start',label('Start','Begin')],['end',label('End','Einde')]].map(([key,text])=>`<label>${text}<input type="datetime-local" name="${key}" data-custom-field="${key}" value="${periodEscape(draft[key])}" step="60" required></label>`).join('')}</div><p class="period-custom-zone">${periodEscape(zone)}</p><p class="period-custom-error" role="alert"${draft.error?'':' hidden'}>${periodEscape(draft.error??'')}</p>${uiButton({variant:'surface',type:'submit',text:label('Apply','Toepassen'),attrs:{'data-custom-field':'apply'}})}</form>`;
 const contents=uiTabs({id:'eleven-period',label:label('Period type','Soort tijdvak'),selected:selectedTab,className:'period-tabs',panelClassName:'period-panel',items:[
  {value:'rolling',label:label('Last','Afgelopen'),content:`<div class="period-options" role="menu" aria-label="${label('Last','Afgelopen')}">${rolling.map(choice).join('')}</div>`},
  {value:'calendar',label:label('Calendar','Kalender'),content:`<div class="period-options period-calendar" role="menu" aria-label="${label('Calendar','Kalender')}">${calendar.map(([id,text])=>choice([id,text])).join('')}</div>`},
  {value:'custom',label:label('Custom range','Eigen bereik'),content:custom,className:'period-custom'}
 ].map(item=>({...item,tabAttrs:{'data-period-tab':item.value},panelAttrs:{'data-period-panel':item.value}}))});
 const popup=uiPopup({id:'eleven-period-menu',className:'period-menu',title:label('Timeframe','Tijdvak'),label:label('Choose a period','Kies een periode'),closeLabel:label('Close','Sluiten'),closeAttrs:{'data-period':'close'},content:`<div class="period-current-range">${periodEscape(range)}${zoomed?`<span class="zoom-status">${label('Zoomed in','Ingezoomd')}</span>`:''}</div><div class="period-default" role="menu" aria-label="${label('Default','Standaard')}">${choice(['configured',standard])}</div>${contents}`});
 const trigger=uiButton({className:'period-trigger',content:`<span>${periodEscape(compactName)}</span>${cardHeaderIcon('down')}`,attrs:{'data-period':'menu','aria-haspopup':'dialog','aria-controls':'eleven-period-menu','aria-expanded':host._periodMenuOpen===true,title:range,'aria-label':label('Timeframe','Tijdvak')+': '+compactName,'aria-description':range+(zoomed?'. '+label('Zoomed in','Ingezoomd'):'')}});
 const navigation=[['previous',label('Previous period','Vorige periode')],['now',label('Return to the current period','Terug naar de huidige periode')],['next',label('Next period','Volgende periode')]].map(([key,title])=>uiButton({text:key==='now'?label('Now','Nu'):'',content:key==='now'?undefined:cardHeaderIcon(key),disabled:key==='next'&&!canGoNext,title,label:title,attrs:{'data-period':key}})).join('');
 return {picker:`<div class="period-controls">${trigger}${popup}</div>`,navigation};

}
function restorePeriodFocus(host,items=[]){
 const key=host._periodFocus;if(!key)return;const root=host.shadowRoot;
 const target=key.startsWith('tab:')?root.querySelector(host._periodMenuOpen?'[data-period-tab="'+key.slice(4)+'"]':'[data-period="menu"]'):key.startsWith('custom:')&&host._periodMenuOpen?root.querySelector('[data-custom-field="'+key.slice(7)+'"]'):key==='history'?root.querySelector('.history-link'):key.startsWith('zoom:')?root.querySelector('[data-zoom="'+key.slice(5)+'"]'):key.startsWith('option:')&&host._periodMenuOpen?items.find(item=>item.dataset.periodOption===key.slice(7)):root.querySelector('[data-period="'+(key.startsWith('option:')?'menu':key)+'"]');
 (target?.disabled?root.querySelector('[data-period="now"], [data-zoom="in"]:not(:disabled), .history-link'):target)?.focus?.({preventScroll:true});host._periodFocus=null;
}
function disconnectPeriodControls(host,preserveState=false){host._periodMenuCleanup?.();host._periodMenuCleanup=null;if(!preserveState)host._periodMenuPending=false;}
function bindPeriodControls(host){
 disconnectPeriodControls(host,true);
 const root=host.shadowRoot,nav=root.querySelector('.period-controls');if(!nav){restorePeriodFocus(host);return;}
 const menu=nav.querySelector('.period-menu'),trigger=nav.querySelector('[data-period="menu"]'),items=[...menu.querySelectorAll('[data-period-option]')];
 const nl=(host._hass?.language??'en').startsWith('nl'),label=(en,nlText)=>nl?nlText:en;
 const form=menu.querySelector('form[data-custom-range]'),tabs=[...menu.querySelectorAll('[data-period-tab]')],panels=[...menu.querySelectorAll('[data-period-panel]')];
 const visibleItems=()=>items.filter(item=>!item.closest?.('[data-period-panel]')?.hidden);
 const updateOptionFocus=()=>{
  const visible=visibleItems();for(const item of items)item.tabIndex=-1;
  const standard=visible.find(item=>item.dataset.periodOption==='configured');if(standard)standard.tabIndex=0;
  const options=visible.filter(item=>item!==standard),selected=options.find(item=>item.getAttribute('aria-checked')==='true')??options[0];if(selected)selected.tabIndex=0;
 };
 updateOptionFocus();
 const cleanups=[];
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 host._periodMenuCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 let scrollPending=false;
 const controller=bindUIPopup({trigger,popup:menu,container:nav,ready:root.querySelector('ha-card')?.updateComplete,
  isRequested:()=>host._periodMenuOpen,isCurrent:()=>root.querySelector('.period-menu')===menu,
  beforeOpen:()=>closeOtherCardPopups(host,'period'),
  onOpen:focus=>{host._periodMenuOpen=true;host._periodMenuPending=true;scrollPending=!focus;},
  onClose:()=>{host._periodMenuOpen=false;host._periodMenuPending=false;},
  onToggle:open=>{host._periodMenuOpen=open;},
  focusTarget:()=>visibleItems().find(item=>item.getAttribute('aria-checked')==='true')??tabs.find(tab=>tab.getAttribute('aria-selected')==='true')??items[0],
  onShown:()=>{host._periodMenuPending=false;restorePeriodFocus(host,items);if(scrollPending){menu.scrollTop=host._periodMenuScroll??0;scrollPending=false;}}
 });
 const {open,close,position}=controller;cleanups.push(()=>controller.disconnect());
 trigger.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();if(e.key==='ArrowUp')visibleItems().at(-1)?.focus({preventScroll:true});}};
 for(const item of items)item.onclick=()=>{close(true);chooseGraphPeriod(host,item.dataset.periodOption);};
 const tabController=bindUITabs({tabs,panels,onSelect:value=>{
  host._periodTab=value;updateOptionFocus();host._periodMenuScroll=0;menu.scrollTop=0;position();
 }});cleanups.push(()=>tabController.disconnect());
 if(form?.tagName==='FORM'){
  const fields=Object.fromEntries(['start','end'].map(key=>[key,form.elements.namedItem(key)]));
  const readDraft=()=>host._periodCustomDraft={start:fields.start.value,end:fields.end.value};
  listen(form,'input',()=>{readDraft();const error=form.querySelector('.period-custom-error');error.hidden=true;error.textContent='';});
  listen(form,'submit',e=>{
   e.preventDefault();const draft=readDraft(),zone=host._hass?.config?.time_zone||'UTC',previous=graphPeriodRange(host);
   const start=parsePeriodDateTime(draft.start,zone,'start',previous.start),end=parsePeriodDateTime(draft.end,zone,'end',previous.end);
   let message;
   if(!Number.isFinite(start)||!Number.isFinite(end))message=label('Choose valid dates and times in the displayed timezone.','Kies geldige datums en tijden in de getoonde tijdzone.');
   else if(end<=start)message=label('End must be after start.','Einde moet na begin liggen.');
   else if(end-start>366*86400000)message=label('Choose a range of at most 366 days.','Kies een bereik van maximaal 366 dagen.');
   if(message){draft.error=message;const error=form.querySelector('.period-custom-error');error.textContent=message;error.hidden=false;position();return;}
   close(true);chooseCustomGraphPeriod(host,start,end);
  });
 }
 menu.onkeydown=e=>{
  if(e.target?.closest?.('.period-custom, .period-tabs'))return;
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   const visible=visibleItems();if(!visible.length)return;e.preventDefault();const index=visible.indexOf(host.shadowRoot.activeElement),next=e.key==='Home'?0:e.key==='End'?visible.length-1:index<0?(e.key==='ArrowUp'?visible.length-1:0):(index+(e.key==='ArrowDown'?1:-1)+visible.length)%visible.length;
   visible[next].focus();
  }
 };
 for(const [key,direction]of [['previous',-1],['next',1],['now',0]])root.querySelector(`[data-period="${key}"]`).onclick=()=>{close();moveGraphPeriod(host,direction);};
 if(host._periodMenuOpen)open(false);
 if(!host._periodMenuPending)restorePeriodFocus(host,items);
}
function periodControlsStyles(){return uiTabsStyles()+`
.period-controls{display:flex;min-width:0;max-width:100%;flex:0 1 auto}
.header-actions .period-trigger{width:auto;min-width:0;max-width:100%;flex:0 1 auto;gap:6px;padding:4px 10px;border:0;border-radius:4px;background:transparent;font-weight:400}
.header-actions .period-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-trigger span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.period-current-range{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;margin:2px 0 10px}
.period-current-range .zoom-status{display:table;margin-top:4px}
.period-tabs{margin:10px 0 0}
.period-panel{padding-top:12px}
.period-options{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-bottom:4px}
.period-options button{position:relative;justify-content:center;padding:7px 3px;gap:0;min-width:0;white-space:nowrap}
.period-options button>span:last-child{position:absolute;inset-inline-end:2px;top:1px;font-size:9px;line-height:1}
.period-calendar{grid-template-columns:repeat(3,minmax(0,1fr))}
.period-custom-fields{display:grid;gap:10px}
.period-custom-fields label{display:grid;gap:4px;font-size:12px}
.period-custom input{box-sizing:border-box;width:100%;min-width:0;padding:8px;border:1px solid var(--divider-color,#ddd);border-radius:5px;font:inherit;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));color-scheme:inherit}
.period-custom input:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-1px}
.period-custom p{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);margin:8px 0;overflow-wrap:anywhere}
.period-custom .period-custom-error{color:var(--error-color,#db4437)}
.period-custom button[type="submit"]{justify-content:center;margin-top:10px}
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
function toggleChartIsolation(host,id){
 if(!host._config.entities.includes(id))return;
 cancelUILegendClicks(host);
 const only=host._config.entities.every((entity,i)=>host._isSeriesVisible(i)===(entity===id));
 only?showAllChartSeries(host):isolateChartSeries(host,id);
 focusUILegend(host,id,'[data-series]',button=>button.dataset.series);
}
function bindChartLegend(host){
 const nl=host._insightLanguage==='nl',hint=nl?'Dubbelklik of Shift+Enter: alleen deze sensor. Herhaal om alles te tonen.':'Double-click or Shift+Enter: show only this sensor. Repeat to show all.';
 bindUILegend(host,{selector:'[data-series]',getId:button=>button.dataset.series,hint,toggle:host._toggleSeries?id=>host._toggleSeries(id):null,isolate:id=>toggleChartIsolation(host,id)});
}
function insightControl(host,key,label,body,icon=''){
 const trigger=uiButton({className:'insight-trigger',content:icon+(key==='data'?'':`<span>${insightEscape(label)}</span>`),attrs:{'data-insight':key,title:label,'aria-label':label,'aria-haspopup':'dialog','aria-expanded':host._insightOpen===key,'aria-controls':'insight-'+key}});
 return `<div class="insight-control">${trigger}${uiPopup({id:'insight-'+key,className:'insight-popup',attrs:{'data-insight-panel':key},title:label,closeLabel:host._insightLanguage==='nl'?'Sluiten':'Close',closeAttrs:{'data-insight-close':''},content:body})}</div>`;
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
   const color=host._insightColor?.(i,row)??'var(--primary-color,#2196f3)';
   return `<section class="insight-sensor" data-information-entity="${insightEscape(item.id)}"><div class="insight-sensor-heading"><i class="insight-color" style="--insight-color:${insightEscape(color)}" aria-hidden="true"></i><strong>${insightEscape(item.name)}</strong><span class="insight-source">${sourceLabel}${unit?` <span class="insight-unit">· ${insightEscape(unit)}</span>`:''}</span></div>${metrics}${states.length?`<div class="insight-states" role="status">${states.join(' · ')}</div>`:''}</section>`;
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
function disconnectChartInsights(host,keepLegendClicks=false){if(!keepLegendClicks){cancelUILegendClicks(host);host._insightPending=null;}host._insightCleanup?.();host._insightCleanup=null;}
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
  const trigger=control.querySelector('[data-insight]'),popup=control.querySelector('.insight-popup'),key=trigger.dataset.insight;
  const controller=bindUIPopup({trigger,popup,container:control,ready:root.querySelector('ha-card')?.updateComplete,
   isRequested:()=>host._insightOpen===key,isCurrent:()=>root.querySelector(`[data-insight-panel="${key}"]`)===popup,
   beforeOpen:()=>closeOtherCardPopups(host,'insight'),
   onOpen:()=>{host._insightOpen=key;host._insightPending=key;},
   onClose:()=>{if(host._insightOpen===key)host._insightOpen=null;host._insightPending=null;},
   onToggle:open=>{if(!open&&host._insightOpen===key)host._insightOpen=null;},
   onShown:()=>{host._insightPending=null;restoreChartInsightFocus(host);},closeWhenAnchorHidden:true
  });
  const {open,close}=controller;cleanups.push(()=>controller.disconnect());
  for(const button of popup.querySelectorAll('[data-isolate]'))button.onclick=()=>{close(true);isolateChartSeries(host,button.dataset.isolate);};
  const all=popup.querySelector('[data-show-all]');if(all)all.onclick=()=>{close(true);showAllChartSeries(host);};
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
.insight-trigger svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.header-actions .insight-trigger{width:32px;height:32px;padding:0;background:transparent;border-radius:4px}
.header-actions .insight-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.header-actions .insight-trigger svg{width:18px;height:18px;stroke-width:2}
.insight-popup{z-index:21}
.insight-popup p{margin:8px 0 12px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-popup p strong{color:var(--primary-text-color,#20252b);font-weight:500}
.insight-popup .insight-choice{display:block;width:100%;padding:6px 8px;text-align:start;overflow-wrap:anywhere}
.insight-choice[aria-pressed="true"]{background:var(--secondary-background-color,#eee);font-weight:600}
.insight-sensors{display:grid}
.insight-sensor{min-width:0;padding:8px 0}
.insight-sensor+.insight-sensor{border-top:1px solid var(--divider-color,#ddd)}
.insight-sensor-heading{display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px}
.insight-color{display:block;width:7px;height:7px;flex:none;border-radius:2px;background:var(--insight-color,var(--primary-color,#2196f3))}
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
 const data={hours_to_show:24,data_source:'auto',graph_mode:'lines',aggregation_period:'none',aggregation_method:'avg',show_hover_line:true,show_legend:true,show_title:true,show_navigation:true,show_grid:true,align_zero:true,sync_hover:true,hover_sync_group:'',sync_timeframe:false,...config,...timeframeSyncConfig(config,{draft:true}),entities:(config.entities??[]).map((entity,index)=>{
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
 Object.assign(result,timeframeSyncConfig(config));
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
  }catch(error){if(strict)throw error;}
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
 // Padding must not invent negative space for nonnegative readings/bases.
 let dataMin=Infinity;
 for(const s of series)for(const p of s.points)for(const value of [p.v,p.base])if(Number.isFinite(value))dataMin=Math.min(dataMin,value);
 if(!Number.isFinite(config.y_min)&&Number.isFinite(dataMin)&&dataMin>=0&&max>0)min=Math.max(0,min);
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
 sync_timeframe:['Synchronize timeframe','Tijdvak synchroniseren'],
 sync_timeframeHelper:['Shares timeframe selection and previous/next/Now with enabled cards in the same group.','Deelt tijdvakkeuze en vorige/volgende/Nu met ingeschakelde kaarten in dezelfde groep.'],
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
 sync_hover:['Synchronize hover','Hover synchroniseren'],hover_sync_group:['Synchronization group','Synchronisatiegroep'],
 sync_hoverHelper:['Shares the selected time with other Eleven graphs on this page.','Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.'],
 hover_sync_groupHelper:['Cards with the same group share hover and timeframe when the corresponding synchronization is enabled. Empty uses the default group.','Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.'],
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
    {name:'hover_sync_group',selector:{text:{}}},{name:'sync_timeframe',default:false,selector:{boolean:{}}}
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
 _insightColor(index){
  const points=this._series[index]?.points??[];
  let last=null;for(let i=points.length-1;i>=0;i--)if(Number.isFinite(points[i].v)){last=points[i].v;break;}
  return this._appearance(index,last).color;
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
  SharedGraph.clearHover(this);this._config={...validated,...timeframeSyncConfig(validated)};this._lastLoad=null;this._loadFailed=false;this._insightOpen=null;this._generation++;this._inFlight=false;this._series=[];this._rawSeries=null;this._viewport=null;resetGraphPeriod(this);this._status='loading';this._refreshFailures=0;clearTimeout(this._timer);this._timer=null;connectTimeframeSync(this);this._render();if(this._connected&&this._hass)this._refresh();}
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
 connectedCallback(){this._connected=true;connectTimeframeSync(this);SharedGraph.connectHover(this,t=>this._receiveHover(t));this._elfPreview??=()=>{this._elfPreviewUntil=Date.now()+ELF_FLIGHT_MS;this.shadowRoot.querySelector('.eleven-elf')?.remove();this._syncElf();};registerElfPreview(this._elfPreview);document.addEventListener('pointerdown',this._outside);this._syncElf();if(this._config&&this._hass)this._refresh();}
 disconnectedCallback(){disconnectTimeframeSync(this);disconnectChartInsights(this);disconnectPeriodControls(this);SharedGraph.disconnectHover(this);this._connected=false;unregisterElfPreview(this._elfPreview);this._elfPreviewUntil=0;this._generation++;this._inFlight=false;this._started=false;clearTimeout(this._timer);this._timer=null;clearTimeout(this._elfTimer);this._elfTimer=null;document.removeEventListener('pointerdown',this._outside);}
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
   this._status=this._series.some(s=>s.points.some(p=>p.v!==null))?'ready':'empty';this._refreshFailures=0;
  }catch(e){if(generation!==this._generation||!this._connected)return;this._refreshFailures=(this._refreshFailures??0)+1;this._loadFailed=true;this._status=['missing','unit','statistics_config','statistics_unavailable'].includes(e.message)?e.message:'error';this._series=[];}
  finally{clearTimeout(timeout);if(generation===this._generation&&this._connected){this._inFlight=false;this._render();this._timer=setTimeout(()=>this._refresh(),retryDelay(this._refreshFailures??0,REFRESH_MS));this._timer.unref?.();}}
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
   const times=Array.from({length:4},(_,i)=>`<span class="axis-x" data-tick="${i}" style="left:calc(${i/3*100}% + ${44-i/3*56}px - ${i/3} * var(--axes-right,0px))">${escapeHtml(time(this._timeAtPlotPosition(i/3),lang,this._zone,(this._viewEnd-this._viewStart)>86400000))}</span>`).join('');

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
   const legend=uiLegend({items:meta.items.map((item,i)=>{const s=this._series[i],value=valueAt(s.points,this._end-(s.source==='statistics'?1:0));const a=this._appearance(i,value);return {id:item.id,visible:visible[i],title:text(visible[i]?'hide_sensor':'show_sensor',lang)+' '+item.name,attrs:{'data-series':item.id},content:`<i style="--series-color:${a.color};border-top-width:${a.width}px;border-top-style:${a.style}"></i><span>${escapeHtml(item.name)}</span><strong>${value===null?text('unavailable',lang):escapeHtml(number(value,lang))}${mixed&&value!==null&&item.unit?` ${escapeHtml(item.unit)}`:''}</strong>`};}),afterContent:mixed?'':`<span class="unit">${escapeHtml(meta.unit)}</span>`});
   const missing=meta.items.filter((_,i)=>visible[i]&&!this._series[i].points.some(p=>p.v!==null)).map(s=>s.name);
   content=`${this._config.show_legend?legend:`<div class="data-status">${escapeHtml(mixed?'':meta.unit)}</div>`}${missing.length?`<div class="data-status">${text('partial',lang)} ${escapeHtml(missing.join(', '))}</div>`:''}<div class="chart" style="--axis-column:min(48px, calc((100% - 124px) / ${Math.max(1,extra)}));--axes-right:calc(${extra} * var(--axis-column))" tabindex="0" role="group" aria-label="${text('chart',lang)}">${anyVisible?axes+times:`<div class="empty-visibility" role="status">${escapeHtml(text('no_visible',lang))}</div>`}<div class="plot">${graph}<div class="zoom-selection" hidden></div></div>${this._config.show_hover_line?'<div class="guide" hidden></div>':''}<div class="markers"></div><div class="tooltip" hidden></div><div class="sr-only" aria-live="polite"></div></div>`;
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
 _reloadPeriod(){this._generation++;this._inFlight=false;this._viewport=null;this._hideTooltip();clearTimeout(this._timer);this._status='loading';this._refreshFailures=0;this._render();return this._refresh();}
 _zoom(factor){
  this._hideTooltip();if(!factor)this._viewport=null;
  else{const a=this._viewStart??this._start,b=this._viewEnd??this._end,width=Math.min(this._end-this._start,Math.max(60000,(b-a)*factor)),center=(a+b)/2;
   const start=Math.max(this._start,Math.min(this._end-width,center-width/2));this._viewport=[start,start+width];}
  this._render();
 }
 _bindInteractions(){
  const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;
  const fromPointer=e=>{const box=chart.querySelector('.plot').getBoundingClientRect();return this._timeAtPlotPosition(Math.max(0,Math.min(1,(e.clientX-box.left)/box.width)));};
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
 _timeAtPlotPosition(ratio){const start=this._viewStart??this._start;return start+ratio*((this._viewEnd??this._end)-start);}
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
 .card-content{position:relative;display:flex;flex-direction:column;box-sizing:border-box;min-height:0;height:100%;overflow:auto;scrollbar-width:thin;padding:16px 16px 12px;line-height:1.4}
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
// Native controls: text/attributes are escaped; content is trusted, caller-owned HTML.
function uiEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function uiAttributes(values={}){
 return Object.entries(values).map(([key,value])=>{
  if(!/^[a-zA-Z_:][\w:.-]*$/.test(key)||/^on/i.test(key))throw Error('Invalid UI attribute: '+key);
  if(value==null)return '';
  if(['disabled','hidden','required','autofocus','multiple','readonly'].includes(key))return value?` ${key}`:'';
  return ` ${key}="${uiEscape(value)}"`;
 }).join('');
}
function uiButton({text='',content,label,title,variant='icon',className='',type='button',href,disabled=false,attrs={}}={}){
 const classes=className?` class="${uiEscape(className)}"`:'';
 const body=content??uiEscape(text),attributes=uiAttributes({...attrs,...(label==null?{}:{'aria-label':label}),...(title==null?{}:{title}),...(disabled?{disabled:true}:{})});
 return href==null?`<button type="${uiEscape(type)}"${classes} data-ui-button="${uiEscape(variant)}"${attributes}>${body}</button>`:`<a${classes} data-ui-button="${uiEscape(variant)}" href="${uiEscape(href)}"${attributes}>${body}</a>`;
}
function uiButtonStyles(){return `
[data-ui-button]{display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:inherit;font-size:12px;font-weight:400;padding:0;border:0;border-radius:4px;background:transparent;color:var(--primary-text-color,#20252b);text-decoration:none;cursor:pointer;flex:none}
[data-ui-button="icon"]{width:32px;height:32px}
[data-ui-button]:not(:disabled):hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
[data-ui-button]:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
[data-ui-button="icon"]:focus-visible{background:var(--secondary-background-color,#eee)}
[data-ui-button]:disabled{opacity:.35;cursor:default}
[data-ui-button="surface"]{height:auto;width:100%;justify-content:space-between;gap:8px;min-height:34px;text-align:start;padding:6px 8px;border-radius:5px;background:var(--secondary-background-color,#eee)}
[data-ui-button="surface"][aria-checked="true"],[data-ui-button="surface"][aria-pressed="true"]{color:var(--primary-color,#2196f3);background:color-mix(in srgb,var(--primary-color,#2196f3) 14%,var(--ha-card-background,var(--card-background-color,#fff)));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--primary-color,#2196f3) 55%,transparent)}
[data-ui-button="text"]{min-height:30px;height:auto;width:auto;border-radius:5px}
[data-ui-button="close"]{width:30px;height:30px;min-height:30px;border-radius:5px;font-size:20px;color:inherit}
`;}


// The caller owns each item's trusted HTML (swatch, label and optional value).
function uiLegendButton({id,visible=true,content='',title='',className='legend-item',attrs={}}={}){
 return `<button type="button" class="${uiEscape(className)}"${uiAttributes({...attrs,'data-ui-legend':id,'aria-pressed':visible,title})}>${content}</button>`;
}
function uiLegend({items=[],className='legend',attrs={},afterContent=''}={}){
 return `<div class="${uiEscape(className)}"${uiAttributes(attrs)}>${items.map(uiLegendButton).join('')}${afterContent}</div>`;
}
function cancelUILegendClicks(host){
 for(const timer of host._legendClickTimers?.values()??[])clearTimeout(timer);
 host._legendClickTimers?.clear();
}
function focusUILegend(host,id,selector='[data-ui-legend]',getId=button=>button.dataset.uiLegend){
 queueMicrotask(()=>[...host.shadowRoot.querySelectorAll(selector)].find(button=>getId(button)===id)?.focus({preventScroll:true}));
}
function bindUILegend(host,{selector='[data-ui-legend]',getId=button=>button.dataset.uiLegend,hint='',toggle,isolate}={}){
 for(const button of host.shadowRoot.querySelectorAll?.(selector)??[]){
  const id=getId(button);
  if(hint&&!button.title?.includes(hint))button.title=[button.title,hint].filter(Boolean).join(' ');
  if(hint)button.setAttribute('aria-description',hint);
  button.setAttribute('aria-keyshortcuts','Shift+Enter Shift+Space');
  button.onclick=event=>{
   clearTimeout(host._legendClickTimers?.get(id));host._legendClickTimers?.delete(id);
   if(event.shiftKey||event.detail>1){event.preventDefault();isolate?.(id);return;}
   if(!event.detail){(toggle??isolate)?.(id);return;}
   // Wait for the second click before a rerender replaces the clicked button.
   if(toggle){const config=host._config;host._legendClickTimers??=new Map();host._legendClickTimers.set(id,setTimeout(()=>{host._legendClickTimers.delete(id);if(host._config===config)toggle(id);},300));}
  };
  button.ondblclick=event=>event.preventDefault();
  button.onkeydown=event=>{if(event.shiftKey&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();isolate?.(id);}};
 }
}

function uiTabs({id,label,items,selected,className='',panelClassName=''}={}){
 if(typeof id!=='string'||!id||!items?.length||items.some(item=>typeof item.value!=='string'||!item.value)||new Set(items.map(item=>item.value)).size!==items.length)throw Error('Tabs need an id and distinct text values.');
 const active=items.find(item=>item.value===selected&&!item.disabled)??items.find(item=>!item.disabled);
 const tabId=value=>`${id}-tab-${encodeURIComponent(value)}`,panelId=value=>`${id}-panel-${encodeURIComponent(value)}`;
 const bar=`<div${uiAttributes({class:className||null,'data-ui-tabs':'',role:'tablist','aria-label':label})}>${items.map(item=>uiButton({variant:'tab',text:item.label,disabled:item.disabled,attrs:{role:'tab',id:tabId(item.value),'data-ui-tab':item.value,'aria-controls':panelId(item.value),'aria-selected':item===active,tabindex:item===active?0:-1,...item.tabAttrs}})).join('')}</div>`;
 const panels=items.map(item=>`<section${uiAttributes({class:[panelClassName,item.className].filter(Boolean).join(' ')||null,id:panelId(item.value),role:'tabpanel','aria-labelledby':tabId(item.value),'data-ui-tab-panel':item.value,...item.panelAttrs,hidden:item!==active})}>${item.content??''}</section>`).join('');
 return bar+panels;
}
function bindUITabs({tabs,panels,onSelect=()=>{}}){
 const buttons=[...tabs],sections=[...panels],cleanups=[];
 const select=(value,{focus=false,notify=true}={})=>{
  const target=buttons.find(tab=>tab.dataset.uiTab===value&&!tab.disabled);if(!target)return false;
  for(const tab of buttons){const active=tab===target;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  for(const panel of sections)panel.hidden=panel.dataset.uiTabPanel!==value;
  if(focus)target.focus({preventScroll:true});if(notify)onSelect(value,target);return true;
 };
 for(const tab of buttons){
  const click=()=>select(tab.dataset.uiTab,{focus:true});
  const keydown=e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
   e.preventDefault();e.stopPropagation();const enabled=buttons.filter(button=>!button.disabled),index=enabled.indexOf(tab);
   const next=e.key==='Home'?0:e.key==='End'?enabled.length-1:(index+(e.key==='ArrowRight'?1:-1)+enabled.length)%enabled.length;
   if(enabled[next])select(enabled[next].dataset.uiTab,{focus:true});
  };
  tab.onclick=click;tab.onkeydown=keydown;
  cleanups.push(()=>{if(tab.onclick===click)tab.onclick=null;if(tab.onkeydown===keydown)tab.onkeydown=null;});
 }
 return {select,disconnect(){cleanups.splice(0).forEach(remove=>remove());}};
}
function uiTabsStyles(){return `
[data-ui-tabs]{display:flex;align-items:flex-end;gap:8px;border-bottom:1px solid var(--divider-color,#ddd)}
[data-ui-tabs] [role="tab"]{flex:1;justify-content:center;min-width:0;min-height:36px;padding:8px 3px;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--secondary-text-color,#666);white-space:nowrap}
[data-ui-tabs] [role="tab"]:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 5%,var(--ha-card-background,var(--card-background-color,#fff)));color:var(--primary-text-color,#20252b)}
[data-ui-tabs] [role="tab"][aria-selected="true"]{border-bottom-color:var(--primary-color,#2196f3);color:var(--primary-color,#2196f3);font-weight:600}
[data-ui-tab-panel][hidden]{display:none!important}
`;}

function uiPopup({id,title,label=title,closeLabel='Close',content='',className='',attrs={},closeAttrs={}}){
 return `<div${uiAttributes({id,class:className||null,'data-ui-popup':'',popover:'auto',role:'dialog','aria-label':label,...attrs})}><div class="ui-popup-heading"><strong>${uiEscape(title)}</strong>${uiButton({variant:'close',content:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>',label:closeLabel,attrs:{'data-ui-popup-close':'',...closeAttrs}})}</div>${content}</div>`;
}
function bindUIPopupPosition({trigger,popup,isRequested,onShow,ready,width=380,maxHeight=560}){
 let active=true;
 const position=()=>{
  if(!active||!isRequested())return;
  const box=trigger.getBoundingClientRect();
  if(!box.width||!box.height){popup.style.visibility='hidden';return;}
  const actualWidth=Math.min(width,window.innerWidth-16);
  popup.style.width=actualWidth+'px';popup.style.maxHeight=Math.min(maxHeight,window.innerHeight-16)+'px';
  popup.style.visibility='';onShow?.();
  const height=popup.getBoundingClientRect().height,below=window.innerHeight-box.bottom-8,above=box.top-8;
  popup.style.left=Math.max(8,Math.min(box.right-actualWidth,window.innerWidth-actualWidth-8))+'px';
  popup.style.top=Math.max(8,Math.min(below>=height||below>=above?box.bottom+6:box.top-height-6,window.innerHeight-height-8))+'px';
 };
 if(ready?.then)ready.then(position,()=>{});
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(position):null;
 observer?.observe(trigger);
 return {position,disconnect(){active=false;observer?.disconnect();}};
}
// Domain state lives in callbacks; this controller also works without a card host.
function bindUIPopup({trigger,popup,container=popup,ready,isRequested,isCurrent=()=>true,beforeOpen=()=>{},onOpen=()=>{},onClose=()=>{},onShown=()=>{},onToggle=()=>{},focusTarget,closeWhenAnchorHidden=false}){
 let requested=false,pending=false,focusPending=false,pointerWasOpen;
 const wantsOpen=isRequested??(()=>requested),native=typeof popup.showPopover==='function';
 const isOpen=()=>native?popup.matches(':popover-open'):popup.hasAttribute('data-fallback-open');
 trigger.setAttribute('aria-haspopup','dialog');if(popup.id)trigger.setAttribute('aria-controls',popup.id);trigger.setAttribute('aria-expanded',String(isOpen()));
 const cleanups=[],listen=(target,type,handler,capture=false)=>{target?.addEventListener?.(type,handler,capture);cleanups.push(()=>target?.removeEventListener?.(type,handler,capture));};
 const property=(target,key,handler)=>{if(!target)return;target[key]=handler;cleanups.push(()=>{if(target[key]===handler)target[key]=null;});};
 const closeButton=popup.querySelector('[data-ui-popup-close]');
 const placement=bindUIPopupPosition({trigger,popup,ready,isRequested:wantsOpen,onShow:()=>{
  pending=false;if(native){if(!isOpen())popup.showPopover();}else popup.setAttribute('data-fallback-open','');
  if(focusPending){(focusTarget?.()??closeButton)?.focus({preventScroll:true});focusPending=false;}
  onShown();
 }});
 const close=(focus=false)=>{
  requested=false;pending=false;focusPending=false;onClose();trigger.setAttribute('aria-expanded','false');
  if(native){if(isOpen())popup.hidePopover();}else popup.removeAttribute('data-fallback-open');
  if(focus)trigger.focus({preventScroll:true});
 };
 const open=(focus=true)=>{beforeOpen();requested=true;pending=true;focusPending=focus;onOpen(focus);trigger.setAttribute('aria-expanded','true');placement.position();};
 property(trigger,'onpointerdown',()=>{pointerWasOpen=wantsOpen();});
 property(trigger,'onpointercancel',()=>{pointerWasOpen=undefined;});
 property(trigger,'onclick',()=>{const wasOpen=pointerWasOpen??wantsOpen();pointerWasOpen=undefined;wasOpen?close(true):open();});
 property(closeButton,'onclick',()=>close(true));
 listen(popup,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}});
 listen(popup,'toggle',e=>{if(!isCurrent())return;const opened=e.newState==='open';if(!opened){if(wantsOpen())onClose();pending=false;focusPending=false;}requested=opened;trigger.setAttribute('aria-expanded',String(opened));onToggle(opened);});
 listen(window,'resize',()=>{if(wantsOpen()){if(closeWhenAnchorHidden&&trigger.getClientRects?.().length===0)close();else placement.position();}});
 listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(popup))close();},true);
 listen(document,'pointerdown',e=>{if((!native||pending)&&(isOpen()||wantsOpen())&&!e.composedPath().includes(container))close();});
 return {open,close,isOpen,position:placement.position,disconnect(){placement.disconnect();cleanups.splice(0).forEach(remove=>remove());}};
}
function uiPopupStyles(){return `
[data-ui-popup]{display:none;position:fixed;inset:auto;margin:0;padding:8px 12px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;z-index:20;max-width:calc(100vw - 16px);border:1px solid var(--divider-color,#ddd);border-radius:10px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font:inherit;font-size:12px;line-height:1.35;box-shadow:0 8px 28px #0004}
[data-ui-popup]:popover-open,[data-ui-popup][data-fallback-open]{display:block}
[data-ui-popup] [hidden]{display:none!important}
.ui-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.ui-popup-heading>strong{font-size:14px;font-weight:600}
.ui-popup-heading [data-ui-popup-close]{display:grid;place-items:center;width:30px;height:30px;min-height:30px;padding:0;line-height:1;flex:none}
.ui-popup-heading [data-ui-popup-close] svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
`;}

// Shared markup stays in each card's shadow root: native links and existing
// data-zoom handlers work without cross-bundle custom-element registration.
const headerEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bindCardPopupPosition(host,trigger,popup,isRequested,show){
 return bindUIPopupPosition({trigger,popup,isRequested,onShow:show,ready:host.shadowRoot.querySelector('ha-card')?.updateComplete});
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
 const zoom=ready?`<div class="zoom-controls" role="group" aria-label="Zoom">${['out','in','reset'].map(action=>uiButton({content:cardHeaderIcon(action),disabled:!zoomState[action],title:label[['in','out','reset'].indexOf(action)],label:label[['in','out','reset'].indexOf(action)],attrs:{'data-zoom':action}})).join('')}</div>`:'';
 const group=periods.picker||periods.navigation?`<div class="chart-controls" role="group" aria-label="${nl?'Tijdvak':'Timeframe'}">${periods.picker??''}${periods.navigation??''}</div>`:'';
 const showZoomStatus=zoomState.zoomed&&!periods.picker;
 return `<header class="card-header">${showTitle&&title?`<h2>${headerEscape(title)}</h2>`:''}<div class="header-actions">${group}${zoom}<div class="chart-links" role="group" aria-label="${nl?'Geschiedenis en informatie':'History and information'}">${uiButton({href:historyUrl??'',className:'history-link',content:cardHeaderIcon('history'),title:label[3],label:label[3]})}${information}</div></div></header>${showZoomStatus?`<div class="chart-context"><div class="chart-range"><span class="zoom-status">${nl?'Ingezoomd':'Zoomed in'}</span></div></div>`:''}`;
}
function cardHeaderStyles(){return uiButtonStyles()+uiPopupStyles()+`
.card-header{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;min-height:32px;flex:none;margin:-6px -4px 10px 0}
.card-header h2{flex:1 1 110px;min-width:0;margin:4.75px 0 0;font-size:18px;line-height:1.25;font-weight:650;letter-spacing:-.01em;overflow-wrap:anywhere}
.header-actions{--chart-action-gap:8px;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:var(--chart-action-gap);flex:0 1 auto;min-width:0;max-width:100%;margin-inline-start:auto}
.chart-controls{display:flex;align-items:center;gap:0;min-width:0;max-width:100%}
.chart-links{display:flex;align-items:center;gap:0;flex:none}
.zoom-controls{display:flex;gap:0;position:relative}
.chart-controls,.zoom-controls,.chart-links{background:var(--secondary-background-color,#eee);border-radius:5px}
.chart-controls>[data-period="now"]{width:36px}
.chart-controls>.period-controls{position:relative;margin-inline-end:8px;padding-inline-end:8px}
.chart-controls>.period-controls::after{content:"";position:absolute;inset-inline-end:0;top:8px;height:16px;width:1px;background:var(--divider-color,#ddd)}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
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

function retryDelay(failures, base = 60000, maximum = 300000) {
  return Math.min(maximum, base * 2 ** Math.max(0, failures - 1));
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
function calendarDayStart(key,zone='UTC'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;
 const nominal=Date.parse(`${key}T00:00:00Z`);
 return Number.isFinite(nominal)&&new Date(nominal).toISOString().slice(0,10)===key?periodMidnight(nominal,zone||'UTC'):NaN;
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
function periodDateTime(t,zone='UTC'){
 const p=periodLocalParts(t,zone),pad=n=>String(n).padStart(2,'0');
 return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
function parsePeriodDateTime(value,zone='UTC',edge='start',previous){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;
 if(Number.isFinite(previous)&&periodDateTime(previous,zone)===value)return previous;
 const nominal=Date.parse(value+'Z');if(!Number.isFinite(nominal)||periodDateTime(nominal,'UTC')!==value)return NaN;
 // Collect the offsets on both sides of a transition. Reject skipped local
 // times; repeated times include both occurrences unless editing an existing bound.
 const candidates=new Set();
 for(let h=-48;h<=48;h+=6){const sample=nominal+h*3600000,offset=periodLocalEpoch(sample,zone)-sample,candidate=nominal-offset;if(periodDateTime(candidate,zone)===value)candidates.add(candidate);}
 const times=[...candidates].sort((a,b)=>a-b);return times.length?(edge==='end'?times.at(-1):times[0]):NaN;
}
function chooseCustomGraphPeriod(host,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>366*86400000)return false;
 resetGraphPeriod(host);host._periodMode='custom';host._periodHours=(end-start)/3600000;host._periodEnd=end;
 publishTimeframe(host);host._reloadPeriod();return true;
}
function timeframeSyncConfig(config,{draft=false}={}){
 if(!draft){
  if(config.sync_timeframe!==undefined&&typeof config.sync_timeframe!=='boolean')throw Error('sync_timeframe must be a boolean. / Tijdvak synchroniseren moet aan of uit zijn.');
  for(const key of ['hover_sync_group','timeframe_sync_group'])if(config[key]!=null&&typeof config[key]!=='string')throw Error(`${key} must be text. / De synchronisatiegroep moet tekst zijn.`);
 }
 return {sync_timeframe:config.sync_timeframe??false,hover_sync_group:config.hover_sync_group??config.timeframe_sync_group??''};
}
function timeframeGroup(host){return host._config?.sync_timeframe===true?((host._config.hover_sync_group??host._config.timeframe_sync_group)?.trim()||'default'):null;}
function timeframeGroups(){
 const root=globalThis.window??globalThis,key=Symbol.for('eleven-cards.timeframe-sync.v1');
 return root[key]??=new Map();
}
function applyTimeframe(host,selection){
 // Default is a group-wide reset to each card's own configured range (or
 // native price window), rather than a copy of the sender's hours.
 if(selection.mode==='configured'&&selection.offset===0){resetGraphPeriod(host);return;}
 host._sharedTimeframe=selection;
 Object.assign(host,{_periodMode:selection.mode,_periodHours:selection.hours,_periodEnd:selection.end,_periodOffset:selection.offset,_periodAnchor:selection.anchor});
}
function disconnectTimeframeSync(host){
 host._disconnectTimeframeSync?.();host._disconnectTimeframeSync=null;
}
function connectTimeframeSync(host){
 disconnectTimeframeSync(host);
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const groups=timeframeGroups();let entry=groups.get(group);
 if(!entry){entry={selection:null,listeners:new Set()};groups.set(group,entry);}
 const receive=(selection,source)=>{
  if(source===host||host._sharedTimeframe===selection)return;
  applyTimeframe(host,selection);host._reloadPeriod();
 };
 entry.listeners.add(receive);
 host._disconnectTimeframeSync=()=>entry.listeners.delete(receive);
 // Joining never publishes this card's default over an existing selection.
 if(entry.selection)applyTimeframe(host,entry.selection);
}
function publishTimeframe(host){
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const entry=timeframeGroups().get(group);if(!entry)return;
 const selection={group,mode:host._periodMode,hours:host._periodHours??host._config.hours_to_show,
  end:host._periodEnd,offset:host._periodOffset,anchor:host._periodAnchor,zone:host._hass?.config?.time_zone||'UTC',at:Date.now()};
 selection.range=localGraphPeriodRange(host,selection.at);
 entry.selection=selection;applyTimeframe(host,selection);
 for(const receive of entry.listeners)receive(selection,host);
}
function resetGraphPeriod(host){host._sharedTimeframe=null;host._periodMode='configured';host._periodHours=null;host._periodEnd=null;host._periodOffset=0;host._periodAnchor=null;host._periodMenuOpen=false;host._periodMenuPending=false;host._periodCustomDraft=null;host._periodTab=null;host._insightPending=null;}
function graphPeriodRange(host,now=Date.now()){
 const shared=host._sharedTimeframe;
 if(shared&&timeframeGroup(host)===shared.group){
  // One clock and timezone for the whole group, including separate bundles.
  // Live selections advance together on the minute; historical ranges stay fixed.
  if(shared.offset===0&&shared.end==null&&(Math.floor(now/60000)!==Math.floor(shared.at/60000))){
   shared.at=now;shared.range=localGraphPeriodRange({_periodMode:shared.mode,_periodHours:shared.hours,_periodOffset:0,_hass:{config:{time_zone:shared.zone}}},now);
  }
  return {...shared.range};
 }
 return localGraphPeriodRange(host,now);
}
function localGraphPeriodRange(host,now){
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
 publishTimeframe(host);
 return host._reloadPeriod();
}
function moveGraphPeriod(host,direction){
 if(![-1,0,1].includes(direction))return;
 if(host._periodMode==='custom'){
  if(direction===0){host._periodEnd=null;host._periodOffset=0;}
  else{const end=(host._periodEnd??Date.now())+direction*host._periodHours*3600000;host._periodEnd=direction>0?Math.min(Date.now(),end):end;host._periodOffset=(host._periodOffset??0)+direction;}
  host._periodCustomDraft=null;host._periodTab=null;host._sharedTimeframe=null;publishTimeframe(host);return host._reloadPeriod();
 }
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
 host._sharedTimeframe=null;
 publishTimeframe(host);
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
 if(mode==='custom'||zoomed||(past&&!['today','week','month','quarter','year'].includes(mode)&&hours<24)){
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
 if(active?.closest?.('.header-actions'))host._periodFocus=active.dataset.periodTab!=null?`tab:${active.dataset.periodTab}`:active.dataset.customField!=null?`custom:${active.dataset.customField}`:active.dataset.periodOption!=null?`option:${active.dataset.periodOption}`:active.dataset.zoom!=null?`zoom:${active.dataset.zoom}`:active.classList.contains('history-link')?'history':active.dataset.period;
 if(host._config.show_navigation===false){host._periodMenuOpen=false;host._periodMenuPending=false;return {};}
 const previousMenu=host.shadowRoot.querySelector('.period-menu');
 if(previousMenu){
  if(!host._periodMenuPending)host._periodMenuScroll=previousMenu.scrollTop;
  host._periodMenuOpen=!!host._periodMenuPending||(typeof previousMenu.showPopover==='function'?previousMenu.matches(':popover-open'):previousMenu.hasAttribute('data-fallback-open'));
 }
 const nl=language.startsWith('nl'),label=(en,nlText)=>nl?nlText:en,mode=host._periodMode??'configured',past=(host._periodOffset??0)<0;
 const standard=label(`Default (${host._config.hours_to_show} hours)`,`Standaard (${host._config.hours_to_show} uur)`);
 const rolling=[['1h',1],['6h',6],['12h',12],['24h',24],['48h',48],['7d',168],['14d',336],['30d',720],['90d',2160],['365d',8760]].map(([id,hours])=>[id,hours<168?label(`${hours} ${hours===1?'hour':'hours'}`,`${hours} uur`):label(`${hours/24} days`,`${hours/24} dagen`),hours<168?`${hours} ${nl?'u':'h'}`:`${hours/24} d`]);
 const calendar=[['today',label('Today','Vandaag'),label('Day','Dag')],['week',label('This week','Deze week'),label('Week','Week')],['month',label('This month','Deze maand'),label('Month','Maand')],['quarter',label('This quarter','Dit kwartaal'),label('Quarter','Kwartaal')],['year',label('This year','Dit jaar'),label('Year','Jaar')]];
 const calendarChoice=calendar.find(([id])=>id===mode);
 if(!calendarChoice&&mode!=='configured'&&mode!=='custom'&&host._periodHours!=null&&!rolling.some(([id])=>id===mode))rolling.push([mode,label(`${host._periodHours} hours`,`${host._periodHours} uur`)]);
 const selectedStandard=label(`Default (${host._periodHours??host._config.hours_to_show} hours)`,`Standaard (${host._periodHours??host._config.hours_to_show} uur)`);
 const name=mode==='configured'?selectedStandard:calendarChoice?.[past?2:1]??rolling.find(([id])=>id===mode)?.[1]??standard;
 const tabIds=['rolling','calendar','custom'];
 const selectedTab=host._periodMenuOpen&&tabIds.includes(host._periodTab)?host._periodTab:mode==='custom'?'custom':calendarChoice?'calendar':'rolling';
 host._periodTab=selectedTab;
 const choice=([value,text,compact])=>uiButton({variant:'surface',content:`<span>${periodEscape(compact??text)}</span><span aria-hidden="true">${value===mode?'✓':''}</span>`,attrs:{role:'menuitemradio','aria-checked':value===mode,tabindex:-1,'aria-label':text,title:text,'data-period-option':value}});

 const {start,end}=host._status==='ready'&&Number.isFinite(host._viewStart)&&Number.isFinite(host._viewEnd)?{start:host._viewStart,end:host._viewEnd}:graphPeriodRange(host);
 const locale=nl?'nl-NL':'en-GB',zone=host._hass?.config?.time_zone||'UTC';
 const zoomed=host._status==='ready'&&(start>host._start+1||end<host._end-1);
 const compactName=compactPeriodName({start,end,mode,past,zoomed,hours:host._periodHours??host._config.hours_to_show,name,locale,zone});
 const format=new Intl.DateTimeFormat(locale,{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
 const range=`${format.format(start)} – ${format.format(end)}`;
 const customRange=graphPeriodRange(host),draft=host._periodCustomDraft??{start:periodDateTime(customRange.start,zone),end:periodDateTime(customRange.end,zone)};
 const canGoNext=mode==='custom'?host._periodEnd!=null&&customRange.end<Date.now():past;
 const custom=`<form data-custom-range><div class="period-custom-fields">${[['start',label('Start','Begin')],['end',label('End','Einde')]].map(([key,text])=>`<label>${text}<input type="datetime-local" name="${key}" data-custom-field="${key}" value="${periodEscape(draft[key])}" step="60" required></label>`).join('')}</div><p class="period-custom-zone">${periodEscape(zone)}</p><p class="period-custom-error" role="alert"${draft.error?'':' hidden'}>${periodEscape(draft.error??'')}</p>${uiButton({variant:'surface',type:'submit',text:label('Apply','Toepassen'),attrs:{'data-custom-field':'apply'}})}</form>`;
 const contents=uiTabs({id:'eleven-period',label:label('Period type','Soort tijdvak'),selected:selectedTab,className:'period-tabs',panelClassName:'period-panel',items:[
  {value:'rolling',label:label('Last','Afgelopen'),content:`<div class="period-options" role="menu" aria-label="${label('Last','Afgelopen')}">${rolling.map(choice).join('')}</div>`},
  {value:'calendar',label:label('Calendar','Kalender'),content:`<div class="period-options period-calendar" role="menu" aria-label="${label('Calendar','Kalender')}">${calendar.map(([id,text])=>choice([id,text])).join('')}</div>`},
  {value:'custom',label:label('Custom range','Eigen bereik'),content:custom,className:'period-custom'}
 ].map(item=>({...item,tabAttrs:{'data-period-tab':item.value},panelAttrs:{'data-period-panel':item.value}}))});
 const popup=uiPopup({id:'eleven-period-menu',className:'period-menu',title:label('Timeframe','Tijdvak'),label:label('Choose a period','Kies een periode'),closeLabel:label('Close','Sluiten'),closeAttrs:{'data-period':'close'},content:`<div class="period-current-range">${periodEscape(range)}${zoomed?`<span class="zoom-status">${label('Zoomed in','Ingezoomd')}</span>`:''}</div><div class="period-default" role="menu" aria-label="${label('Default','Standaard')}">${choice(['configured',standard])}</div>${contents}`});
 const trigger=uiButton({className:'period-trigger',content:`<span>${periodEscape(compactName)}</span>${cardHeaderIcon('down')}`,attrs:{'data-period':'menu','aria-haspopup':'dialog','aria-controls':'eleven-period-menu','aria-expanded':host._periodMenuOpen===true,title:range,'aria-label':label('Timeframe','Tijdvak')+': '+compactName,'aria-description':range+(zoomed?'. '+label('Zoomed in','Ingezoomd'):'')}});
 const navigation=[['previous',label('Previous period','Vorige periode')],['now',label('Return to the current period','Terug naar de huidige periode')],['next',label('Next period','Volgende periode')]].map(([key,title])=>uiButton({text:key==='now'?label('Now','Nu'):'',content:key==='now'?undefined:cardHeaderIcon(key),disabled:key==='next'&&!canGoNext,title,label:title,attrs:{'data-period':key}})).join('');
 return {picker:`<div class="period-controls">${trigger}${popup}</div>`,navigation};

}
function restorePeriodFocus(host,items=[]){
 const key=host._periodFocus;if(!key)return;const root=host.shadowRoot;
 const target=key.startsWith('tab:')?root.querySelector(host._periodMenuOpen?'[data-period-tab="'+key.slice(4)+'"]':'[data-period="menu"]'):key.startsWith('custom:')&&host._periodMenuOpen?root.querySelector('[data-custom-field="'+key.slice(7)+'"]'):key==='history'?root.querySelector('.history-link'):key.startsWith('zoom:')?root.querySelector('[data-zoom="'+key.slice(5)+'"]'):key.startsWith('option:')&&host._periodMenuOpen?items.find(item=>item.dataset.periodOption===key.slice(7)):root.querySelector('[data-period="'+(key.startsWith('option:')?'menu':key)+'"]');
 (target?.disabled?root.querySelector('[data-period="now"], [data-zoom="in"]:not(:disabled), .history-link'):target)?.focus?.({preventScroll:true});host._periodFocus=null;
}
function disconnectPeriodControls(host,preserveState=false){host._periodMenuCleanup?.();host._periodMenuCleanup=null;if(!preserveState)host._periodMenuPending=false;}
function bindPeriodControls(host){
 disconnectPeriodControls(host,true);
 const root=host.shadowRoot,nav=root.querySelector('.period-controls');if(!nav){restorePeriodFocus(host);return;}
 const menu=nav.querySelector('.period-menu'),trigger=nav.querySelector('[data-period="menu"]'),items=[...menu.querySelectorAll('[data-period-option]')];
 const nl=(host._hass?.language??'en').startsWith('nl'),label=(en,nlText)=>nl?nlText:en;
 const form=menu.querySelector('form[data-custom-range]'),tabs=[...menu.querySelectorAll('[data-period-tab]')],panels=[...menu.querySelectorAll('[data-period-panel]')];
 const visibleItems=()=>items.filter(item=>!item.closest?.('[data-period-panel]')?.hidden);
 const updateOptionFocus=()=>{
  const visible=visibleItems();for(const item of items)item.tabIndex=-1;
  const standard=visible.find(item=>item.dataset.periodOption==='configured');if(standard)standard.tabIndex=0;
  const options=visible.filter(item=>item!==standard),selected=options.find(item=>item.getAttribute('aria-checked')==='true')??options[0];if(selected)selected.tabIndex=0;
 };
 updateOptionFocus();
 const cleanups=[];
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 host._periodMenuCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 let scrollPending=false;
 const controller=bindUIPopup({trigger,popup:menu,container:nav,ready:root.querySelector('ha-card')?.updateComplete,
  isRequested:()=>host._periodMenuOpen,isCurrent:()=>root.querySelector('.period-menu')===menu,
  beforeOpen:()=>closeOtherCardPopups(host,'period'),
  onOpen:focus=>{host._periodMenuOpen=true;host._periodMenuPending=true;scrollPending=!focus;},
  onClose:()=>{host._periodMenuOpen=false;host._periodMenuPending=false;},
  onToggle:open=>{host._periodMenuOpen=open;},
  focusTarget:()=>visibleItems().find(item=>item.getAttribute('aria-checked')==='true')??tabs.find(tab=>tab.getAttribute('aria-selected')==='true')??items[0],
  onShown:()=>{host._periodMenuPending=false;restorePeriodFocus(host,items);if(scrollPending){menu.scrollTop=host._periodMenuScroll??0;scrollPending=false;}}
 });
 const {open,close,position}=controller;cleanups.push(()=>controller.disconnect());
 trigger.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();if(e.key==='ArrowUp')visibleItems().at(-1)?.focus({preventScroll:true});}};
 for(const item of items)item.onclick=()=>{close(true);chooseGraphPeriod(host,item.dataset.periodOption);};
 const tabController=bindUITabs({tabs,panels,onSelect:value=>{
  host._periodTab=value;updateOptionFocus();host._periodMenuScroll=0;menu.scrollTop=0;position();
 }});cleanups.push(()=>tabController.disconnect());
 if(form?.tagName==='FORM'){
  const fields=Object.fromEntries(['start','end'].map(key=>[key,form.elements.namedItem(key)]));
  const readDraft=()=>host._periodCustomDraft={start:fields.start.value,end:fields.end.value};
  listen(form,'input',()=>{readDraft();const error=form.querySelector('.period-custom-error');error.hidden=true;error.textContent='';});
  listen(form,'submit',e=>{
   e.preventDefault();const draft=readDraft(),zone=host._hass?.config?.time_zone||'UTC',previous=graphPeriodRange(host);
   const start=parsePeriodDateTime(draft.start,zone,'start',previous.start),end=parsePeriodDateTime(draft.end,zone,'end',previous.end);
   let message;
   if(!Number.isFinite(start)||!Number.isFinite(end))message=label('Choose valid dates and times in the displayed timezone.','Kies geldige datums en tijden in de getoonde tijdzone.');
   else if(end<=start)message=label('End must be after start.','Einde moet na begin liggen.');
   else if(end-start>366*86400000)message=label('Choose a range of at most 366 days.','Kies een bereik van maximaal 366 dagen.');
   if(message){draft.error=message;const error=form.querySelector('.period-custom-error');error.textContent=message;error.hidden=false;position();return;}
   close(true);chooseCustomGraphPeriod(host,start,end);
  });
 }
 menu.onkeydown=e=>{
  if(e.target?.closest?.('.period-custom, .period-tabs'))return;
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   const visible=visibleItems();if(!visible.length)return;e.preventDefault();const index=visible.indexOf(host.shadowRoot.activeElement),next=e.key==='Home'?0:e.key==='End'?visible.length-1:index<0?(e.key==='ArrowUp'?visible.length-1:0):(index+(e.key==='ArrowDown'?1:-1)+visible.length)%visible.length;
   visible[next].focus();
  }
 };
 for(const [key,direction]of [['previous',-1],['next',1],['now',0]])root.querySelector(`[data-period="${key}"]`).onclick=()=>{close();moveGraphPeriod(host,direction);};
 if(host._periodMenuOpen)open(false);
 if(!host._periodMenuPending)restorePeriodFocus(host,items);
}
function periodControlsStyles(){return uiTabsStyles()+`
.period-controls{display:flex;min-width:0;max-width:100%;flex:0 1 auto}
.header-actions .period-trigger{width:auto;min-width:0;max-width:100%;flex:0 1 auto;gap:6px;padding:4px 10px;border:0;border-radius:4px;background:transparent;font-weight:400}
.header-actions .period-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-trigger span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.period-current-range{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;margin:2px 0 10px}
.period-current-range .zoom-status{display:table;margin-top:4px}
.period-tabs{margin:10px 0 0}
.period-panel{padding-top:12px}
.period-options{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-bottom:4px}
.period-options button{position:relative;justify-content:center;padding:7px 3px;gap:0;min-width:0;white-space:nowrap}
.period-options button>span:last-child{position:absolute;inset-inline-end:2px;top:1px;font-size:9px;line-height:1}
.period-calendar{grid-template-columns:repeat(3,minmax(0,1fr))}
.period-custom-fields{display:grid;gap:10px}
.period-custom-fields label{display:grid;gap:4px;font-size:12px}
.period-custom input{box-sizing:border-box;width:100%;min-width:0;padding:8px;border:1px solid var(--divider-color,#ddd);border-radius:5px;font:inherit;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));color-scheme:inherit}
.period-custom input:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-1px}
.period-custom p{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);margin:8px 0;overflow-wrap:anywhere}
.period-custom .period-custom-error{color:var(--error-color,#db4437)}
.period-custom button[type="submit"]{justify-content:center;margin-top:10px}
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
function toggleChartIsolation(host,id){
 if(!host._config.entities.includes(id))return;
 cancelUILegendClicks(host);
 const only=host._config.entities.every((entity,i)=>host._isSeriesVisible(i)===(entity===id));
 only?showAllChartSeries(host):isolateChartSeries(host,id);
 focusUILegend(host,id,'[data-series]',button=>button.dataset.series);
}
function bindChartLegend(host){
 const nl=host._insightLanguage==='nl',hint=nl?'Dubbelklik of Shift+Enter: alleen deze sensor. Herhaal om alles te tonen.':'Double-click or Shift+Enter: show only this sensor. Repeat to show all.';
 bindUILegend(host,{selector:'[data-series]',getId:button=>button.dataset.series,hint,toggle:host._toggleSeries?id=>host._toggleSeries(id):null,isolate:id=>toggleChartIsolation(host,id)});
}
function insightControl(host,key,label,body,icon=''){
 const trigger=uiButton({className:'insight-trigger',content:icon+(key==='data'?'':`<span>${insightEscape(label)}</span>`),attrs:{'data-insight':key,title:label,'aria-label':label,'aria-haspopup':'dialog','aria-expanded':host._insightOpen===key,'aria-controls':'insight-'+key}});
 return `<div class="insight-control">${trigger}${uiPopup({id:'insight-'+key,className:'insight-popup',attrs:{'data-insight-panel':key},title:label,closeLabel:host._insightLanguage==='nl'?'Sluiten':'Close',closeAttrs:{'data-insight-close':''},content:body})}</div>`;
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
   const color=host._insightColor?.(i,row)??'var(--primary-color,#2196f3)';
   return `<section class="insight-sensor" data-information-entity="${insightEscape(item.id)}"><div class="insight-sensor-heading"><i class="insight-color" style="--insight-color:${insightEscape(color)}" aria-hidden="true"></i><strong>${insightEscape(item.name)}</strong><span class="insight-source">${sourceLabel}${unit?` <span class="insight-unit">· ${insightEscape(unit)}</span>`:''}</span></div>${metrics}${states.length?`<div class="insight-states" role="status">${states.join(' · ')}</div>`:''}</section>`;
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
function disconnectChartInsights(host,keepLegendClicks=false){if(!keepLegendClicks){cancelUILegendClicks(host);host._insightPending=null;}host._insightCleanup?.();host._insightCleanup=null;}
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
  const trigger=control.querySelector('[data-insight]'),popup=control.querySelector('.insight-popup'),key=trigger.dataset.insight;
  const controller=bindUIPopup({trigger,popup,container:control,ready:root.querySelector('ha-card')?.updateComplete,
   isRequested:()=>host._insightOpen===key,isCurrent:()=>root.querySelector(`[data-insight-panel="${key}"]`)===popup,
   beforeOpen:()=>closeOtherCardPopups(host,'insight'),
   onOpen:()=>{host._insightOpen=key;host._insightPending=key;},
   onClose:()=>{if(host._insightOpen===key)host._insightOpen=null;host._insightPending=null;},
   onToggle:open=>{if(!open&&host._insightOpen===key)host._insightOpen=null;},
   onShown:()=>{host._insightPending=null;restoreChartInsightFocus(host);},closeWhenAnchorHidden:true
  });
  const {open,close}=controller;cleanups.push(()=>controller.disconnect());
  for(const button of popup.querySelectorAll('[data-isolate]'))button.onclick=()=>{close(true);isolateChartSeries(host,button.dataset.isolate);};
  const all=popup.querySelector('[data-show-all]');if(all)all.onclick=()=>{close(true);showAllChartSeries(host);};
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
.insight-trigger svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.header-actions .insight-trigger{width:32px;height:32px;padding:0;background:transparent;border-radius:4px}
.header-actions .insight-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.header-actions .insight-trigger svg{width:18px;height:18px;stroke-width:2}
.insight-popup{z-index:21}
.insight-popup p{margin:8px 0 12px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-popup p strong{color:var(--primary-text-color,#20252b);font-weight:500}
.insight-popup .insight-choice{display:block;width:100%;padding:6px 8px;text-align:start;overflow-wrap:anywhere}
.insight-choice[aria-pressed="true"]{background:var(--secondary-background-color,#eee);font-weight:600}
.insight-sensors{display:grid}
.insight-sensor{min-width:0;padding:8px 0}
.insight-sensor+.insight-sensor{border-top:1px solid var(--divider-color,#ddd)}
.insight-sensor-heading{display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px}
.insight-color{display:block;width:7px;height:7px;flex:none;border-radius:2px;background:var(--insight-color,var(--primary-color,#2196f3))}
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
  _reloadPeriod(){this._generation++;this._inFlight=false;this._viewport=null;this._hideTooltip();clearTimeout(this._timer);this._status='loading';this._refreshFailures=0;this._render();return this._refresh();},
 _ticks(){const width=this.shadowRoot.host?.clientWidth??600,count=width<400?3:5;return Array.from({length:count},(_,i)=>i/(count-1));},
 _segmentAppearance(s,id){return s.missing?{label:this._nl()?'Geen geschiedenis':'No history',color:'transparent'}:this._appearance(s.state,id);},
 _insightColor(index){
  const id=this._config.entities[index],segments=this._series[index]??[];
  for(let i=segments.length-1;i>=0;i--){const segment=segments[i];if(!segment.missing&&segment.start<this._viewEnd&&segment.end>this._viewStart)return this._appearance(String(segment.state),id).color;}
  return 'var(--primary-color,#2196f3)';
 },
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
 _segmentAt(segments,t,end){let low=0,high=segments.length;while(low<high){const mid=(low+high)>>1;if(segments[mid].start<=t)low=mid+1;else high=mid;}const segment=segments[low-1];return segment&&(t<segment.end||(t===end&&segment.end===end))?segment:null;},
 _hideTooltip(publish=true){if(this._hoverFrame!=null)globalThis.cancelAnimationFrame?.(this._hoverFrame);this._hoverFrame=null;this._hoverTime=null;if(publish)SharedGraph.clearHover(this);this._pointerFocusPending=null;this._cursor=null;this._pinned=false;for(const cls of ['tooltip','guide']){const el=this.shadowRoot.querySelector('.'+cls);if(el)el.hidden=true;}},
 _showTooltip(t,publish=true){
  if(!SharedGraph.tooltipInView(this)){this._hideTooltip(publish);return;}
  const chart=this.shadowRoot.querySelector('.chart'),tooltip=chart?.querySelector('.tooltip'),guide=chart?.querySelector('.guide');if(!tooltip)return;
  this._cursor=t;const nl=this._nl(),a=this._viewStart,b=this._viewEnd,esc=escapeTimeline;
  tooltip.innerHTML=`<strong>${esc(this._time(t))}</strong>`+this._config.entities.map((id,i)=>{if(!this._isSeriesVisible(i)||this._stateLimits?.[i])return '';const s=this._segmentAt(this._series[i]??[],t,b),v=s?this._segmentAppearance(s,id):{label:nl?'Geen geschiedenis':'No history',color:'transparent'};return `<span><i style="background:${v.color}"></i><b class="tooltip-label">${esc(this._name(id))}: <em class="tooltip-value">${esc(v.label)}</em></b>${s?`<small>${esc(this._time(s.start))} – ${esc(this._time(s.end))} · ${esc(this._duration(s.end-s.start))}</small>`:''}</span>`;}).join('');
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
  chart.onpointermove=e=>{if(drag&&Math.abs(e.clientX-drag.x)>=6){this._hideTooltip();const r=chart.getBoundingClientRect(),x=Math.max(r.left,Math.min(r.right,e.clientX));selection.hidden=false;selection.style.left=`${(Math.min(drag.x,x)-r.left)/r.width*100}%`;selection.style.width=`${Math.abs(x-drag.x)/r.width*100}%`;}else if(!this._pinned&&e.pointerType!=='touch'){this._hoverTime=timestamp(e);if(this._hoverFrame==null){if(typeof requestAnimationFrame==='function')this._hoverFrame=requestAnimationFrame(()=>{this._hoverFrame=null;if(this.shadowRoot.querySelector('.chart')===chart&&!this._pinned&&this._hoverTime!=null)this._showTooltip(this._hoverTime);});else this._showTooltip(this._hoverTime);}}};
  chart.onpointerdown=e=>{if(e.target?.closest?.('[data-series],.tooltip')||(e.button??0)!==0)return;this._pointerFocusPending=e.target?.closest?.('.segment')??null;this._pinned=true;this._showTooltip(timestamp(e));if(e.pointerType==='mouse'){drag={x:e.clientX,t:timestamp(e)};chart.setPointerCapture?.(e.pointerId);}};
  chart.onpointerup=e=>{selection.hidden=true;if(drag){const d=drag;drag=null;if(Math.abs(e.clientX-d.x)>=6){const t=timestamp(e),a=Math.min(d.t,t),b=Math.max(d.t,t);if(b-a>=60000){this._hideTooltip();this._viewport=[a,b];this._render();}}}};
  chart.onpointercancel=()=>{drag=null;selection.hidden=true;this._hideTooltip();};chart.onlostpointercapture=()=>{drag=null;selection.hidden=true;};chart.onpointerleave=()=>{if(!this._pinned&&!drag)this._hideTooltip();};
  chart.onkeydown=e=>{this._pointerFocusPending=null;if(e.key==='Escape'){drag=null;selection.hidden=true;this._hideTooltip();return;}if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const times=[...new Set([this._viewStart,...this._series.flatMap((s,i)=>this._isSeriesVisible(i)?s.map(v=>v.start):[]).filter(t=>t>this._viewStart&&t<this._viewEnd),this._viewEnd])].sort((a,b)=>a-b);let i=times.findIndex(t=>t>=(this._cursor??this._viewStart));if(i<0)i=times.length-1;i=e.key==='Home'?0:e.key==='End'?times.length-1:Math.max(0,Math.min(times.length-1,i+(e.key==='ArrowRight'?1:-1)));this._pinned=true;this._showTooltip(times[i]);};
  chart.onfocusout=e=>{if(!chart.contains(e.relatedTarget))this._hideTooltip();};this.shadowRoot.querySelectorAll('.segment').forEach(button=>{button.onfocus=()=>{const fromPointer=this._pointerFocusPending===button;this._pointerFocusPending=null;if(fromPointer&&this._cursor!=null)return;this._pinned=true;this._showTooltip(Number(button.dataset.time));};});
 },
 _render(){
  if(!this._config)return;if(this._hoverFrame!=null){cancelAnimationFrame(this._hoverFrame);this._hoverFrame=null;}captureChartInsights(this);const c=this._config,nl=this._nl(),esc=escapeTimeline;this._viewStart=this._viewport?.[0]??this._start;this._viewEnd=this._viewport?.[1]??this._end;const a=this._viewStart,b=this._viewEnd;let body='';const controls=cardHeader({title:c.title??(nl?'Statustijdlijn':'Status timeline'),showTitle:c.show_title!==false,ready:this._status==='ready',historyUrl:this._historyUrl(),language:nl?'nl':'en',periods:periodControls(this,nl?'nl':'en'),zoomState:chartZoomState(this),information:chartDataInformation(this,nl?'nl':'en')});
  if(this._status!=='ready')body=`<div class="message" role="status">${this._status==='error'?(nl?'Geschiedenis kon niet worden geladen.':'Unable to load history.'):(nl?'Geschiedenis laden…':'Loading history…')}${this._status==='error'?`<button class="retry">${nl?'Opnieuw proberen':'Retry'}</button>`:''}</div>`;
  else{

   const legend=new Map(),rows=c.entities.map((id,i)=>{if(!this._isSeriesVisible(i))return '';const name=this._name(id),label=`<button type="button" class="row-label" data-series="${esc(id)}">${esc(name)}</button>`;if(this._stateLimits?.[i])return `<div class="row">${label}<div class="state-limit" role="status">${esc(this._stateLimitMessage())}</div></div>`;const bars=(this._series[i]??[]).filter(s=>s.end>a&&s.start<b).map(s=>{const v=this._segmentAppearance(s,id);legend.set(v.label+'|'+v.color,v);const start=Math.max(a,s.start),end=Math.min(b,s.end),description=`${name}: ${v.label}, ${this._time(s.start)} – ${this._time(s.end)} · ${this._duration(s.end-s.start)}`;return `<button class="segment ${['unknown','unavailable'].includes(s.state)?'gap':''}" style="left:${(start-a)/(b-a)*100}%;width:${(end-start)/(b-a)*100}%;background-color:${v.color};color:${v.textColor??'inherit'}" aria-label="${esc(description)}" data-time="${start}">${c.show_state_labels?`<span>${esc(v.label)}</span>`:''}</button>`;}).join('');return `<div class="row">${c.show_labels?`${label}`:''}<div class="track">${bars}</div>${c.show_summary?`<div class="summary">${esc(this._summary(i))}</div>`:''}</div>`;}).join('');
   body=`<div class="chart" tabindex="0" role="group" aria-label="${nl?'Statustijdlijn':'Status timeline'}">${c.show_grid!==false?this._ticks().map(r=>`<div class="grid-line" style="left:${r*100}%"></div>`).join(''):''}${rows}<div class="guide" hidden></div><div class="zoom-selection" hidden></div><div class="tooltip" role="status" hidden></div></div>`;
   if(c.show_axis)body+=`<div class="axis">${this._ticks().map(r=>`<span>${esc(this._time(a+(b-a)*r))}</span>`).join('')}</div>`;
   if(c.show_legend)body+=`<div class="legend">${[...legend.values()].map(v=>`<span><i style="background:${v.color}"></i>${esc(v.label)}</span>`).join('')}</div>`;
  }
  this.shadowRoot.innerHTML=`<style>:host{display:block;height:100%;min-width:0;min-height:0}ha-card{display:block;min-height:0;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font-family:inherit;height:100%}
.content{height:100%;min-height:0;overflow:auto;padding:16px 16px 12px;box-sizing:border-box;position:relative;scrollbar-width:thin}
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
Object.assign(labels,{sync_timeframe:'Tijdvak synchroniseren',show_title:'Titel tonen',sync_hover:'Hover synchroniseren',hover_sync_group:'Synchronisatiegroep'});
Object.assign(helpers,{sync_timeframe:'Deelt tijdvakkeuze en vorige/volgende/Nu met ingeschakelde kaarten in dezelfde groep.',sync_hover:'Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.',hover_sync_group:'Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.'});
const timelineEnglish={
 'Tijdvak synchroniseren':'Synchronize timeframe','Tijdvakgroep':'Timeframe group',
 'Deelt tijdvakkeuze en vorige/volgende/Nu met ingeschakelde kaarten in dezelfde groep.':'Shares timeframe selection and previous/next/Now with enabled cards in the same group.',
 'Dezelfde sleutel koppelt kaarten op deze pagina. Leeg gebruikt de standaardgroep.':'The same key links cards on this page. Empty uses the default group.',
 'Titel tonen':'Show title',
 'Hover synchroniseren':'Synchronize hover','Synchronisatiegroep':'Synchronization group',
 'Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.':'Shares the selected time with other Eleven graphs on this page.',
 'Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.':'Cards with the same group share hover and timeframe when the corresponding synchronization is enabled. Empty uses the default group.',
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
  const data=clone({hours_to_show:24,bar_height:18,border_radius:5,row_gap:16,show_labels:true,show_legend:true,show_title:true,show_axis:true,show_state_labels:false,show_grid:true,show_summary:false,show_navigation:true,sync_hover:true,hover_sync_group:'',sync_timeframe:false,state_colors:[],series_options:[],...c,...timeframeSyncConfig(c,{draft:true})});
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
    {name:'hover_sync_group',selector:{text:{}}},{name:'sync_timeframe',default:false,selector:{boolean:{}}}
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
 setConfig(c){timeframeSyncConfig(c);validateTimeline(c,this._hass);if(!Array.isArray(c.entities)||!c.entities.length||c.entities.length>16||c.entities.some(id=>typeof id!=='string'||!/^\w+\.\w+$/.test(id)))throw Error('Kies 1–16 entiteiten.');const config={hours_to_show:24,bar_height:18,border_radius:5,row_gap:16,show_labels:true,show_legend:true,show_title:true,show_axis:true,show_state_labels:false,show_grid:true,show_summary:false,show_navigation:true,sync_hover:true,hover_sync_group:'',state_colors:[],series_options:[],...c};for(const [k,min,max] of [['hours_to_show',1,8760],['bar_height',4,80],['border_radius',0,40],['row_gap',0,64]])if(!Number.isFinite(config[k])||config[k]<min||config[k]>max)throw Error(`Ongeldige ${k}`);for(const k of ['state_colors','series_options'])if(!Array.isArray(config[k])||config[k].some(x=>!x||typeof x!=='object'))throw Error(`Ongeldige ${k}`);SharedGraph.clearHover(this);this._lastLoad=null;this._loadFailed=false;this._insightOpen=null;this._visibility=new Map();this._config={...config,...timeframeSyncConfig(c)};this._viewport=null;resetGraphPeriod(this);this._hideTooltip();this._generation++;this._inFlight=false;this._series=[];this._stateLimits=[];this._status='loading';this._refreshFailures=0;clearTimeout(this._timer);connectTimeframeSync(this);this._render();if(this._connected&&this._hass)this._refresh();}
 set hass(h){
  this._hass=h;
  const signature=JSON.stringify([h?.locale?.language??h?.language,h?.config?.time_zone,this._config?.entities.map(id=>{const state=h?.states?.[id];return [state?.state,state?.attributes?.friendly_name,state?.attributes?.device_class];})]);
  if(this._config&&signature!==this._hassSignature){this._hassSignature=signature;this._render();}
  if(this._config&&this._connected&&!this._started)this._refresh();
 }
 get hass(){return this._hass;}
 connectedCallback(){this._connected=true;connectTimeframeSync(this);SharedGraph.connectHover(this,t=>this._receiveHover(t));this._outside??=e=>{if(!e.composedPath().includes(this)&&!SharedGraph.hoverSourceInEvent(this,e))this._hideTooltip();};globalThis.document?.addEventListener('pointerdown',this._outside);if(typeof ResizeObserver!=='undefined'){this._resizeObserver??=new ResizeObserver(entries=>{const narrow=(entries[0]?.contentRect?.width??this.clientWidth)<400;if(this._axisNarrow!==undefined&&this._axisNarrow!==narrow&&this._config)this._render();this._axisNarrow=narrow;});this._resizeObserver.observe(this);}if(this._config&&this._hass)this._refresh();}
 disconnectedCallback(){disconnectTimeframeSync(this);disconnectChartInsights(this);disconnectPeriodControls(this);SharedGraph.disconnectHover(this);globalThis.document?.removeEventListener('pointerdown',this._outside);this._resizeObserver?.disconnect();if(this._hoverFrame!=null)cancelAnimationFrame(this._hoverFrame);this._hoverFrame=null;this._hideTooltip();this._connected=false;this._started=false;this._inFlight=false;this._generation++;clearTimeout(this._timer);}
 getCardSize(){return Math.ceil((90+(this._config?.entities.length??1)*((this._config?.bar_height??18)+(this._config?.row_gap??16)+24))/50);}
 getGridOptions(){return {columns:12,min_columns:6,rows:Math.max(3,Math.ceil(this.getCardSize()*50/64)),min_rows:3};}
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
 async _refresh(){if(!this._connected||!this._hass||!this._config||this._inFlight)return;clearTimeout(this._timer);this._inFlight=true;this._started=true;const generation=++this._generation,c=this._config,{start,end}=graphPeriodRange(this);let timeout;try{const q=new URLSearchParams({filter_entity_id:c.entities.join(','),end_time:new Date(end).toISOString(),minimal_response:'',no_attributes:''});const response=await Promise.race([this._hass.callApi('GET',`history/period/${new Date(start).toISOString()}?${q}`),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('timeout')),15000);timeout.unref?.();})]);if(!this._connected||generation!==this._generation)return;if(!Array.isArray(response))throw Error('Invalid history');this._start=start;this._end=end;this._stateLimits=[];const responseById=new Map(response.filter(rows=>Array.isArray(rows)&&rows[0]?.entity_id).map(rows=>[rows[0].entity_id,rows]));this._series=c.entities.map((id,index)=>{const rows=responseById.get(id)??[],states=new Set();for(const row of rows){if(row.state==null)continue;states.add(String(row.state));if(states.size>20){this._stateLimits[index]=true;return [];}}const result=segments(rows,start,end),first=Math.min(...rows.map(r=>Date.parse(r.last_changed??r.last_updated)).filter(Number.isFinite));if(result[0]?.state==='unknown'&&first>start){if(first<result[0].end)result.unshift({...result[0],end:first,missing:true}),result[1]={...result[1],start:first};else result[0]={...result[0],missing:true};}return result;});this._loadFailed=false;this._lastLoad={at:Date.now(),start,end,sources:c.entities.map((id,i)=>({id,source:'history',empty:!this._series[i]?.some(s=>!s.missing)}))};this._status='ready';this._refreshFailures=0;}catch{if(generation===this._generation){this._loadFailed=true;this._status='error';this._refreshFailures=(this._refreshFailures??0)+1;}}finally{clearTimeout(timeout);if(this._connected&&generation===this._generation){this._inFlight=false;this._render();this._timer=setTimeout(()=>this._refresh(),retryDelay(this._refreshFailures??0));this._timer.unref?.();}}}
}
Object.assign(TimelineCard.prototype,TimelineView);
if(!customElements.get('eleven-timeline-card'))customElements.define('eleven-timeline-card',TimelineCard);
window.customCards??=[];if(!window.customCards.some(c=>c.type==='eleven-timeline-card'))window.customCards.push({type:'eleven-timeline-card',name:'Eleven Timeline Card',description:'Horizontal status history with configurable bars and colors.',preview:true});


})();

;
// Eleven Overview (beta) 0.1.0 — self-contained standalone module
(()=>{
function retryDelay(failures, base = 60000, maximum = 300000) {
  return Math.min(maximum, base * 2 ** Math.max(0, failures - 1));
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
function calendarDayStart(key,zone='UTC'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;
 const nominal=Date.parse(`${key}T00:00:00Z`);
 return Number.isFinite(nominal)&&new Date(nominal).toISOString().slice(0,10)===key?periodMidnight(nominal,zone||'UTC'):NaN;
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
function periodDateTime(t,zone='UTC'){
 const p=periodLocalParts(t,zone),pad=n=>String(n).padStart(2,'0');
 return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
function parsePeriodDateTime(value,zone='UTC',edge='start',previous){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;
 if(Number.isFinite(previous)&&periodDateTime(previous,zone)===value)return previous;
 const nominal=Date.parse(value+'Z');if(!Number.isFinite(nominal)||periodDateTime(nominal,'UTC')!==value)return NaN;
 // Collect the offsets on both sides of a transition. Reject skipped local
 // times; repeated times include both occurrences unless editing an existing bound.
 const candidates=new Set();
 for(let h=-48;h<=48;h+=6){const sample=nominal+h*3600000,offset=periodLocalEpoch(sample,zone)-sample,candidate=nominal-offset;if(periodDateTime(candidate,zone)===value)candidates.add(candidate);}
 const times=[...candidates].sort((a,b)=>a-b);return times.length?(edge==='end'?times.at(-1):times[0]):NaN;
}
function chooseCustomGraphPeriod(host,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>366*86400000)return false;
 resetGraphPeriod(host);host._periodMode='custom';host._periodHours=(end-start)/3600000;host._periodEnd=end;
 publishTimeframe(host);host._reloadPeriod();return true;
}
function timeframeSyncConfig(config,{draft=false}={}){
 if(!draft){
  if(config.sync_timeframe!==undefined&&typeof config.sync_timeframe!=='boolean')throw Error('sync_timeframe must be a boolean. / Tijdvak synchroniseren moet aan of uit zijn.');
  for(const key of ['hover_sync_group','timeframe_sync_group'])if(config[key]!=null&&typeof config[key]!=='string')throw Error(`${key} must be text. / De synchronisatiegroep moet tekst zijn.`);
 }
 return {sync_timeframe:config.sync_timeframe??false,hover_sync_group:config.hover_sync_group??config.timeframe_sync_group??''};
}
function timeframeGroup(host){return host._config?.sync_timeframe===true?((host._config.hover_sync_group??host._config.timeframe_sync_group)?.trim()||'default'):null;}
function timeframeGroups(){
 const root=globalThis.window??globalThis,key=Symbol.for('eleven-cards.timeframe-sync.v1');
 return root[key]??=new Map();
}
function applyTimeframe(host,selection){
 // Default is a group-wide reset to each card's own configured range (or
 // native price window), rather than a copy of the sender's hours.
 if(selection.mode==='configured'&&selection.offset===0){resetGraphPeriod(host);return;}
 host._sharedTimeframe=selection;
 Object.assign(host,{_periodMode:selection.mode,_periodHours:selection.hours,_periodEnd:selection.end,_periodOffset:selection.offset,_periodAnchor:selection.anchor});
}
function disconnectTimeframeSync(host){
 host._disconnectTimeframeSync?.();host._disconnectTimeframeSync=null;
}
function connectTimeframeSync(host){
 disconnectTimeframeSync(host);
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const groups=timeframeGroups();let entry=groups.get(group);
 if(!entry){entry={selection:null,listeners:new Set()};groups.set(group,entry);}
 const receive=(selection,source)=>{
  if(source===host||host._sharedTimeframe===selection)return;
  applyTimeframe(host,selection);host._reloadPeriod();
 };
 entry.listeners.add(receive);
 host._disconnectTimeframeSync=()=>entry.listeners.delete(receive);
 // Joining never publishes this card's default over an existing selection.
 if(entry.selection)applyTimeframe(host,entry.selection);
}
function publishTimeframe(host){
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const entry=timeframeGroups().get(group);if(!entry)return;
 const selection={group,mode:host._periodMode,hours:host._periodHours??host._config.hours_to_show,
  end:host._periodEnd,offset:host._periodOffset,anchor:host._periodAnchor,zone:host._hass?.config?.time_zone||'UTC',at:Date.now()};
 selection.range=localGraphPeriodRange(host,selection.at);
 entry.selection=selection;applyTimeframe(host,selection);
 for(const receive of entry.listeners)receive(selection,host);
}
function resetGraphPeriod(host){host._sharedTimeframe=null;host._periodMode='configured';host._periodHours=null;host._periodEnd=null;host._periodOffset=0;host._periodAnchor=null;host._periodMenuOpen=false;host._periodMenuPending=false;host._periodCustomDraft=null;host._periodTab=null;host._insightPending=null;}
function graphPeriodRange(host,now=Date.now()){
 const shared=host._sharedTimeframe;
 if(shared&&timeframeGroup(host)===shared.group){
  // One clock and timezone for the whole group, including separate bundles.
  // Live selections advance together on the minute; historical ranges stay fixed.
  if(shared.offset===0&&shared.end==null&&(Math.floor(now/60000)!==Math.floor(shared.at/60000))){
   shared.at=now;shared.range=localGraphPeriodRange({_periodMode:shared.mode,_periodHours:shared.hours,_periodOffset:0,_hass:{config:{time_zone:shared.zone}}},now);
  }
  return {...shared.range};
 }
 return localGraphPeriodRange(host,now);
}
function localGraphPeriodRange(host,now){
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
 publishTimeframe(host);
 return host._reloadPeriod();
}
function moveGraphPeriod(host,direction){
 if(![-1,0,1].includes(direction))return;
 if(host._periodMode==='custom'){
  if(direction===0){host._periodEnd=null;host._periodOffset=0;}
  else{const end=(host._periodEnd??Date.now())+direction*host._periodHours*3600000;host._periodEnd=direction>0?Math.min(Date.now(),end):end;host._periodOffset=(host._periodOffset??0)+direction;}
  host._periodCustomDraft=null;host._periodTab=null;host._sharedTimeframe=null;publishTimeframe(host);return host._reloadPeriod();
 }
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
 host._sharedTimeframe=null;
 publishTimeframe(host);
 return host._reloadPeriod();
}


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
 return {...input,...timeframeSyncConfig(input,{draft}),type:'custom:eleven-overview-card',title:input.title??'Eleven Overview (beta)',hours_to_show:hours,columns,show_graph:input.show_graph!==false,show_delta:input.show_delta!==false,entities};
}





const esc=escapeHtml;
const nl=h=>String(h?.locale?.language??h?.language??'en').startsWith('nl');
const labels={sync_timeframe:['Tijdvak synchroniseren','Synchronize timeframe'],hover_sync_group:['Synchronisatiegroep','Synchronization group'],title:['Titel','Title'],hours_to_show:['Periode (uur)','Period (hours)'],columns:['Kolommen','Columns'],show_graph:['Trendlijnen tonen','Show sparklines'],show_delta:['Verandering tonen','Show change'],entity:['Sensor','Sensor'],name:['Naam','Name'],color:['Kleur','Color']};
const helpers={sync_timeframe:['Deelt tijdvakkeuze en vorige/volgende/Nu met ingeschakelde kaarten in dezelfde groep.','Shares timeframe selection and previous/next/Now with enabled cards in the same group.'],hover_sync_group:['Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.','Cards with the same group share hover and timeframe when the corresponding synchronization is enabled. Empty uses the default group.'],};
function form(schema){return {schema,computeLabel:function(s){return labels[s.name]?.[nl(this?.hass)?0:1]??s.name;},computeHelper:function(s){return helpers[s.name]?.[nl(this?.hass)?0:1];}};}
class OverviewEditor extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});}
 setConfig(c){this._config=normalizeConfig(c,{draft:true});this._render();}
 set hass(h){this._hass=h;this._render();}get hass(){return this._hass;}
 _emit(){this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...this._config,entities:this._config.entities.filter(r=>r.entity).map(r=>({...r,color:Array.isArray(r.color)?[...r.color]:r.color}))}},bubbles:true,composed:true}));}
 _bind(node,definition,data){node.hass=this._hass;node.schema=definition.schema;node.data=data;node.computeLabel=s=>definition.computeLabel.call(this,s);node.computeHelper=s=>definition.computeHelper?.call(this,s);}
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
 static getConfigForm(){return form([{name:'title',selector:{text:{}}},{name:'hours_to_show',selector:{number:{min:1,max:168,step:1,mode:'box'}}},{name:'columns',selector:{select:{mode:'dropdown',options:[{value:'auto',label:'Auto'},{value:'1',label:'1'},{value:'2',label:'2'},{value:'3',label:'3'}]}}},{name:'show_graph',selector:{boolean:{}}},{name:'show_delta',selector:{boolean:{}}},{name:'sync_timeframe',default:false,selector:{boolean:{}}},{name:'hover_sync_group',selector:{text:{}}}]);}
 static getSensorForm(){return form([{name:'entity',required:true,selector:{entity:{domain:'sensor'}}},{name:'name',selector:{text:{}}},{name:'color',selector:{color_rgb:{}}}]);}
 static async getConfigElement(){if(!customElements.get('ha-form')){const helpers=await window.loadCardHelpers();const card=await helpers.createCardElement({type:'entities',entities:[]});await card.constructor.getConfigElement();await customElements.whenDefined('ha-form');}if(!customElements.get('eleven-overview-editor'))customElements.define('eleven-overview-editor',OverviewEditor);return document.createElement('eleven-overview-editor');}
 static getStubConfig(hass){return {title:'Eleven Overview (beta)',hours_to_show:24,entities:Object.entries(hass?.states??{}).filter(([id,s])=>id.startsWith('sensor.')&&numeric(s.state)!=null).slice(0,4).map(([id])=>id)};}
 setConfig(config){this._stopAnimation();this._config=normalizeConfig(config);this._generation++;this._promise=null;this._history={};this._status='loading';this._refreshFailures=0;resetGraphPeriod(this);clearTimeout(this._timer);connectTimeframeSync(this);this._render();if(this._connected)this._refresh();}
 set hass(h){
  this._hass=h;
  const signature=JSON.stringify([h?.locale?.language??h?.language,h?.config?.time_zone,this._config?.entities.map(row=>{const state=h?.states?.[row.entity];return [state?.state,state?.attributes?.friendly_name,state?.attributes?.unit_of_measurement];})]);
  if(signature!==this._hassSignature){this._hassSignature=signature;this._render();}
  if(this._connected&&!this._promise&&this._status==='loading')this._refresh();
 }get hass(){return this._hass;}
 connectedCallback(){this._connected=true;connectTimeframeSync(this);this._refresh();}
 disconnectedCallback(){disconnectTimeframeSync(this);this._stopAnimation();this._connected=false;this._generation++;this._promise=null;clearTimeout(this._timer);this._timer=null;}
 getCardSize(){return 1+Math.ceil((this._config?.entities.length??1)/2)*2;}
 getGridOptions(){return {columns:12,min_columns:6,rows:Math.max(2,Math.ceil(this.getCardSize()*50/64)),min_rows:2};}
 // Only the visual reading is interpolated; sensor values remain authoritative.
 _stopAnimation(){if(this._animationFrame!=null)cancelAnimationFrame(this._animationFrame);this._animationFrame=null;this._readings.clear();}
 _reading(id,target,unit){
  const previous=this._readings.get(id),reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||globalThis.document?.hidden;
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
 _reloadPeriod(){this._stopAnimation();this._generation++;this._promise=null;this._history={};this._status='loading';this._refreshFailures=0;clearTimeout(this._timer);this._render();return this._refresh();}
 _refresh(){
  if(!this._connected||!this._hass||!this._config)return Promise.resolve();if(this._promise)return this._promise;
  clearTimeout(this._timer);const generation=this._generation,{start,end}=graphPeriodRange(this),ids=this._config.entities.map(r=>r.entity),hass=this._hass;
  const units=Object.fromEntries(ids.map(id=>[id,hass.states?.[id]?.attributes?.unit_of_measurement??'']));
  let requestTimer;const work=(async()=>{try{const data=await Promise.race([hass.callApi('GET',historyUrl(ids,start,end)),new Promise((_,reject)=>{requestTimer=setTimeout(()=>reject(Error('History timeout')),15000);})]);if(!this._connected||generation!==this._generation)return;
    if(!Array.isArray(data))throw Error('Invalid history');
    const grouped=new Map(data.filter(r=>Array.isArray(r)&&r.length).map(r=>[r[0].entity_id,r]));this._history=Object.fromEntries(ids.map(id=>[id,historySeries(grouped.get(id),start,end,units[id])]));this._units=units;this._start=start;this._end=end;this._status='ready';this._refreshFailures=0;
   }catch{if(generation===this._generation&&this._connected){this._status='error';this._refreshFailures=(this._refreshFailures??0)+1;}}
   finally{clearTimeout(requestTimer);if(generation===this._generation&&this._connected){this._promise=null;this._render();this._timer=setTimeout(()=>this._refresh(),retryDelay(this._refreshFailures??0));}}
  })();this._promise=work;return work;
 }
 _render(){
  if(!this._config)return;const c=this._config,dutch=nl(this._hass),focus=this.shadowRoot.activeElement?.dataset.entity;
  const synced=!!this._sharedTimeframe,range=this._status==='ready'?{start:this._start,end:this._end}:graphPeriodRange(this),formatter=new Intl.DateTimeFormat(dutch?'nl-NL':'en-GB',{timeZone:this._hass?.config?.time_zone||'UTC',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const period=synced?formatter.formatRange(range.start,range.end):`${c.hours_to_show} ${dutch?'uur':'hours'}`,cells=c.entities.map((row,i)=>{
   const s=this._hass?.states?.[row.entity],unit=s?.attributes?.unit_of_measurement??'',history=this._status==='ready'&&this._units[row.entity]===unit?this._history[row.entity]:null,v=synced?(history?.points.at(-1)?.v??null):numeric(s?.state),name=row.name||s?.attributes?.friendly_name||row.entity,displayValue=this._reading(row.entity,v,unit);
   const change=delta(history,v),path=history?sparkline(history.points,this._start,this._end):'';
   const status=!s?(dutch?'Sensor niet gevonden':'Entity not found'):v==null?(synced&&this._status==='loading'?(dutch?'Geschiedenis laden…':'Loading history…'):synced?(dutch?'Geen historische waarde':'No historical value'):(dutch?'Niet beschikbaar':'Unavailable')):'';
   const graphStatus=this._status==='loading'?(dutch?'Geschiedenis laden…':'Loading history…'):this._status==='error'?(dutch?'Geen geschiedenis geladen':'History not loaded'):dutch?'Geen geschiedenis':'No history';
   const difference=change==null?(dutch?'Geen vergelijkingspunt':'No comparison point'):`${change>0?'+':''}${this._format(change)}${unit?' '+(unit==='%'?'pp':unit):''}`;
   return `<button type="button" class="metric" data-entity="${esc(row.entity)}" aria-label="${esc(name+': '+(status||this._format(v)+' '+unit))}" style="--series-color:${color(row.color,PALETTE[i])}"><span class="label"><i></i>${esc(name)}</span><span class="reading"><span class="value">${v==null?'—':esc(this._format(displayValue,v))}</span>${v!=null&&unit?`<span class="unit">${esc(unit)}</span>`:''}</span>${status?`<span class="status">${status}</span>`:''}${c.show_graph?`<span class="spark">${path?`<svg viewBox="0 0 300 48" preserveAspectRatio="none" aria-hidden="true"><path d="${path}"/></svg>`:`<span>${graphStatus}</span>`}</span>`:''}${c.show_delta?`<span class="delta">${v==null?'—':esc(difference)}</span><span class="caption">${dutch?'sinds begin periode':'since period start'}</span>`:''}</button>`;
  }).join('');
  this.shadowRoot.innerHTML=`<style>:host{display:block;height:100%;min-width:0;min-height:0;container-type:inline-size}ha-card{display:block;height:100%;font-family:inherit;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b)}.content{height:100%;min-height:0;overflow:auto;padding:16px;box-sizing:border-box;scrollbar-width:thin}header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:20px}h2{font-size:18px;font-weight:650;letter-spacing:-.01em;line-height:1.25;margin:0;overflow-wrap:anywhere}.period{font-size:12px;text-align:right;overflow-wrap:anywhere;color:var(--secondary-text-color,#666);}.grid{display:grid;grid-template-columns:repeat(${c.columns==='auto'?'2':c.columns},minmax(0,1fr));gap:20px 24px}.metric{appearance:none;font:inherit;color:inherit;background:none;border:0;border-radius:4px;text-align:left;min-width:0;min-height:44px;padding:0;cursor:pointer;display:flex;flex-direction:column;align-items:stretch}.metric:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:5px}.label{font-size:12px;color:var(--secondary-text-color,#666);line-height:1.4;overflow-wrap:anywhere;display:flex;align-items:baseline;gap:7px}.label i{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--series-color);flex-shrink:0}.reading{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;margin-top:6px;font-variant-numeric:tabular-nums;min-width:0}.value{font-size:28px;font-weight:550;line-height:1.25;overflow-wrap:anywhere;letter-spacing:-.025em}.unit{font-size:13px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}.spark{height:48px;display:flex;align-items:center;margin-top:8px;color:var(--secondary-text-color,#666);font-size:11px}.spark svg{width:100%;height:48px;overflow:visible}.spark path{fill:none;stroke:var(--series-color);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}.delta{font-size:12px;font-variant-numeric:tabular-nums;margin-top:8px;overflow-wrap:anywhere}.caption{font-size:11px;color:var(--secondary-text-color,#666);margin-top:2px}.status{font-size:12px;color:var(--secondary-text-color,#666);margin-top:4px}.error{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;font-size:12px;color:var(--secondary-text-color,#666)}.retry{font:inherit;min-height:44px;flex-shrink:0;padding:8px 12px;border:1px solid var(--divider-color,#ddd);border-radius:6px;background:transparent;color:inherit;cursor:pointer}@container(max-width:340px){.grid{grid-template-columns:minmax(0,1fr)}header{margin-bottom:16px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style><ha-card><div class="content"><header><h2>${esc(c.title)}${/\(beta\)/i.test(c.title)?'':' <small>(beta)</small>'}</h2><span class="period">${period}</span></header><div class="grid">${cells}</div>${this._status==='error'?`<div class="error" role="status"><span>${synced?(dutch?'Geschiedenis kon niet worden geladen.':'History could not be loaded.'):(dutch?'Geschiedenis kon niet worden geladen. Actuele waarden blijven beschikbaar.':'History could not be loaded. Live values remain available.')}</span><button type="button" class="retry">${dutch?'Opnieuw':'Retry'}</button></div>`:''}</div></ha-card>`;
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

// ../../shared/ui-button.js
// Native controls: text/attributes are escaped; content is trusted, caller-owned HTML.
function uiEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function uiAttributes(values={}){
 return Object.entries(values).map(([key,value])=>{
  if(!/^[a-zA-Z_:][\w:.-]*$/.test(key)||/^on/i.test(key))throw Error('Invalid UI attribute: '+key);
  if(value==null)return '';
  if(['disabled','hidden','required','autofocus','multiple','readonly'].includes(key))return value?` ${key}`:'';
  return ` ${key}="${uiEscape(value)}"`;
 }).join('');
}
function uiButton({text='',content,label,title,variant='icon',className='',type='button',href,disabled=false,attrs={}}={}){
 const classes=className?` class="${uiEscape(className)}"`:'';
 const body=content??uiEscape(text),attributes=uiAttributes({...attrs,...(label==null?{}:{'aria-label':label}),...(title==null?{}:{title}),...(disabled?{disabled:true}:{})});
 return href==null?`<button type="${uiEscape(type)}"${classes} data-ui-button="${uiEscape(variant)}"${attributes}>${body}</button>`:`<a${classes} data-ui-button="${uiEscape(variant)}" href="${uiEscape(href)}"${attributes}>${body}</a>`;
}
function uiButtonStyles(){return `
[data-ui-button]{display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:inherit;font-size:12px;font-weight:400;padding:0;border:0;border-radius:4px;background:transparent;color:var(--primary-text-color,#20252b);text-decoration:none;cursor:pointer;flex:none}
[data-ui-button="icon"]{width:32px;height:32px}
[data-ui-button]:not(:disabled):hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
[data-ui-button]:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
[data-ui-button="icon"]:focus-visible{background:var(--secondary-background-color,#eee)}
[data-ui-button]:disabled{opacity:.35;cursor:default}
[data-ui-button="surface"]{height:auto;width:100%;justify-content:space-between;gap:8px;min-height:34px;text-align:start;padding:6px 8px;border-radius:5px;background:var(--secondary-background-color,#eee)}
[data-ui-button="surface"][aria-checked="true"],[data-ui-button="surface"][aria-pressed="true"]{color:var(--primary-color,#2196f3);background:color-mix(in srgb,var(--primary-color,#2196f3) 14%,var(--ha-card-background,var(--card-background-color,#fff)));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--primary-color,#2196f3) 55%,transparent)}
[data-ui-button="text"]{min-height:30px;height:auto;width:auto;border-radius:5px}
[data-ui-button="close"]{width:30px;height:30px;min-height:30px;border-radius:5px;font-size:20px;color:inherit}
`;}

// ../../shared/ui-legend.js

// The caller owns each item's trusted HTML (swatch, label and optional value).
function uiLegendButton({id,visible=true,content='',title='',className='legend-item',attrs={}}={}){
 return `<button type="button" class="${uiEscape(className)}"${uiAttributes({...attrs,'data-ui-legend':id,'aria-pressed':visible,title})}>${content}</button>`;
}
function uiLegend({items=[],className='legend',attrs={},afterContent=''}={}){
 return `<div class="${uiEscape(className)}"${uiAttributes(attrs)}>${items.map(uiLegendButton).join('')}${afterContent}</div>`;
}
function cancelUILegendClicks(host){
 for(const timer of host._legendClickTimers?.values()??[])clearTimeout(timer);
 host._legendClickTimers?.clear();
}
function focusUILegend(host,id,selector='[data-ui-legend]',getId=button=>button.dataset.uiLegend){
 queueMicrotask(()=>[...host.shadowRoot.querySelectorAll(selector)].find(button=>getId(button)===id)?.focus({preventScroll:true}));
}
function bindUILegend(host,{selector='[data-ui-legend]',getId=button=>button.dataset.uiLegend,hint='',toggle,isolate}={}){
 for(const button of host.shadowRoot.querySelectorAll?.(selector)??[]){
  const id=getId(button);
  if(hint&&!button.title?.includes(hint))button.title=[button.title,hint].filter(Boolean).join(' ');
  if(hint)button.setAttribute('aria-description',hint);
  button.setAttribute('aria-keyshortcuts','Shift+Enter Shift+Space');
  button.onclick=event=>{
   clearTimeout(host._legendClickTimers?.get(id));host._legendClickTimers?.delete(id);
   if(event.shiftKey||event.detail>1){event.preventDefault();isolate?.(id);return;}
   if(!event.detail){(toggle??isolate)?.(id);return;}
   // Wait for the second click before a rerender replaces the clicked button.
   if(toggle){const config=host._config;host._legendClickTimers??=new Map();host._legendClickTimers.set(id,setTimeout(()=>{host._legendClickTimers.delete(id);if(host._config===config)toggle(id);},300));}
  };
  button.ondblclick=event=>event.preventDefault();
  button.onkeydown=event=>{if(event.shiftKey&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();isolate?.(id);}};
 }
}

// ../../shared/ui-tabs.js
function uiTabs({id,label,items,selected,className='',panelClassName=''}={}){
 if(typeof id!=='string'||!id||!items?.length||items.some(item=>typeof item.value!=='string'||!item.value)||new Set(items.map(item=>item.value)).size!==items.length)throw Error('Tabs need an id and distinct text values.');
 const active=items.find(item=>item.value===selected&&!item.disabled)??items.find(item=>!item.disabled);
 const tabId=value=>`${id}-tab-${encodeURIComponent(value)}`,panelId=value=>`${id}-panel-${encodeURIComponent(value)}`;
 const bar=`<div${uiAttributes({class:className||null,'data-ui-tabs':'',role:'tablist','aria-label':label})}>${items.map(item=>uiButton({variant:'tab',text:item.label,disabled:item.disabled,attrs:{role:'tab',id:tabId(item.value),'data-ui-tab':item.value,'aria-controls':panelId(item.value),'aria-selected':item===active,tabindex:item===active?0:-1,...item.tabAttrs}})).join('')}</div>`;
 const panels=items.map(item=>`<section${uiAttributes({class:[panelClassName,item.className].filter(Boolean).join(' ')||null,id:panelId(item.value),role:'tabpanel','aria-labelledby':tabId(item.value),'data-ui-tab-panel':item.value,...item.panelAttrs,hidden:item!==active})}>${item.content??''}</section>`).join('');
 return bar+panels;
}
function bindUITabs({tabs,panels,onSelect=()=>{}}){
 const buttons=[...tabs],sections=[...panels],cleanups=[];
 const select=(value,{focus=false,notify=true}={})=>{
  const target=buttons.find(tab=>tab.dataset.uiTab===value&&!tab.disabled);if(!target)return false;
  for(const tab of buttons){const active=tab===target;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  for(const panel of sections)panel.hidden=panel.dataset.uiTabPanel!==value;
  if(focus)target.focus({preventScroll:true});if(notify)onSelect(value,target);return true;
 };
 for(const tab of buttons){
  const click=()=>select(tab.dataset.uiTab,{focus:true});
  const keydown=e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
   e.preventDefault();e.stopPropagation();const enabled=buttons.filter(button=>!button.disabled),index=enabled.indexOf(tab);
   const next=e.key==='Home'?0:e.key==='End'?enabled.length-1:(index+(e.key==='ArrowRight'?1:-1)+enabled.length)%enabled.length;
   if(enabled[next])select(enabled[next].dataset.uiTab,{focus:true});
  };
  tab.onclick=click;tab.onkeydown=keydown;
  cleanups.push(()=>{if(tab.onclick===click)tab.onclick=null;if(tab.onkeydown===keydown)tab.onkeydown=null;});
 }
 return {select,disconnect(){cleanups.splice(0).forEach(remove=>remove());}};
}
function uiTabsStyles(){return `
[data-ui-tabs]{display:flex;align-items:flex-end;gap:8px;border-bottom:1px solid var(--divider-color,#ddd)}
[data-ui-tabs] [role="tab"]{flex:1;justify-content:center;min-width:0;min-height:36px;padding:8px 3px;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--secondary-text-color,#666);white-space:nowrap}
[data-ui-tabs] [role="tab"]:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 5%,var(--ha-card-background,var(--card-background-color,#fff)));color:var(--primary-text-color,#20252b)}
[data-ui-tabs] [role="tab"][aria-selected="true"]{border-bottom-color:var(--primary-color,#2196f3);color:var(--primary-color,#2196f3);font-weight:600}
[data-ui-tab-panel][hidden]{display:none!important}
`;}

// ../../shared/ui-popup.js
function uiPopup({id,title,label=title,closeLabel='Close',content='',className='',attrs={},closeAttrs={}}){
 return `<div${uiAttributes({id,class:className||null,'data-ui-popup':'',popover:'auto',role:'dialog','aria-label':label,...attrs})}><div class="ui-popup-heading"><strong>${uiEscape(title)}</strong>${uiButton({variant:'close',content:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>',label:closeLabel,attrs:{'data-ui-popup-close':'',...closeAttrs}})}</div>${content}</div>`;
}
function bindUIPopupPosition({trigger,popup,isRequested,onShow,ready,width=380,maxHeight=560}){
 let active=true;
 const position=()=>{
  if(!active||!isRequested())return;
  const box=trigger.getBoundingClientRect();
  if(!box.width||!box.height){popup.style.visibility='hidden';return;}
  const actualWidth=Math.min(width,window.innerWidth-16);
  popup.style.width=actualWidth+'px';popup.style.maxHeight=Math.min(maxHeight,window.innerHeight-16)+'px';
  popup.style.visibility='';onShow?.();
  const height=popup.getBoundingClientRect().height,below=window.innerHeight-box.bottom-8,above=box.top-8;
  popup.style.left=Math.max(8,Math.min(box.right-actualWidth,window.innerWidth-actualWidth-8))+'px';
  popup.style.top=Math.max(8,Math.min(below>=height||below>=above?box.bottom+6:box.top-height-6,window.innerHeight-height-8))+'px';
 };
 if(ready?.then)ready.then(position,()=>{});
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(position):null;
 observer?.observe(trigger);
 return {position,disconnect(){active=false;observer?.disconnect();}};
}
// Domain state lives in callbacks; this controller also works without a card host.
function bindUIPopup({trigger,popup,container=popup,ready,isRequested,isCurrent=()=>true,beforeOpen=()=>{},onOpen=()=>{},onClose=()=>{},onShown=()=>{},onToggle=()=>{},focusTarget,closeWhenAnchorHidden=false}){
 let requested=false,pending=false,focusPending=false,pointerWasOpen;
 const wantsOpen=isRequested??(()=>requested),native=typeof popup.showPopover==='function';
 const isOpen=()=>native?popup.matches(':popover-open'):popup.hasAttribute('data-fallback-open');
 trigger.setAttribute('aria-haspopup','dialog');if(popup.id)trigger.setAttribute('aria-controls',popup.id);trigger.setAttribute('aria-expanded',String(isOpen()));
 const cleanups=[],listen=(target,type,handler,capture=false)=>{target?.addEventListener?.(type,handler,capture);cleanups.push(()=>target?.removeEventListener?.(type,handler,capture));};
 const property=(target,key,handler)=>{if(!target)return;target[key]=handler;cleanups.push(()=>{if(target[key]===handler)target[key]=null;});};
 const closeButton=popup.querySelector('[data-ui-popup-close]');
 const placement=bindUIPopupPosition({trigger,popup,ready,isRequested:wantsOpen,onShow:()=>{
  pending=false;if(native){if(!isOpen())popup.showPopover();}else popup.setAttribute('data-fallback-open','');
  if(focusPending){(focusTarget?.()??closeButton)?.focus({preventScroll:true});focusPending=false;}
  onShown();
 }});
 const close=(focus=false)=>{
  requested=false;pending=false;focusPending=false;onClose();trigger.setAttribute('aria-expanded','false');
  if(native){if(isOpen())popup.hidePopover();}else popup.removeAttribute('data-fallback-open');
  if(focus)trigger.focus({preventScroll:true});
 };
 const open=(focus=true)=>{beforeOpen();requested=true;pending=true;focusPending=focus;onOpen(focus);trigger.setAttribute('aria-expanded','true');placement.position();};
 property(trigger,'onpointerdown',()=>{pointerWasOpen=wantsOpen();});
 property(trigger,'onpointercancel',()=>{pointerWasOpen=undefined;});
 property(trigger,'onclick',()=>{const wasOpen=pointerWasOpen??wantsOpen();pointerWasOpen=undefined;wasOpen?close(true):open();});
 property(closeButton,'onclick',()=>close(true));
 listen(popup,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}});
 listen(popup,'toggle',e=>{if(!isCurrent())return;const opened=e.newState==='open';if(!opened){if(wantsOpen())onClose();pending=false;focusPending=false;}requested=opened;trigger.setAttribute('aria-expanded',String(opened));onToggle(opened);});
 listen(window,'resize',()=>{if(wantsOpen()){if(closeWhenAnchorHidden&&trigger.getClientRects?.().length===0)close();else placement.position();}});
 listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(popup))close();},true);
 listen(document,'pointerdown',e=>{if((!native||pending)&&(isOpen()||wantsOpen())&&!e.composedPath().includes(container))close();});
 return {open,close,isOpen,position:placement.position,disconnect(){placement.disconnect();cleanups.splice(0).forEach(remove=>remove());}};
}
function uiPopupStyles(){return `
[data-ui-popup]{display:none;position:fixed;inset:auto;margin:0;padding:8px 12px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;z-index:20;max-width:calc(100vw - 16px);border:1px solid var(--divider-color,#ddd);border-radius:10px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font:inherit;font-size:12px;line-height:1.35;box-shadow:0 8px 28px #0004}
[data-ui-popup]:popover-open,[data-ui-popup][data-fallback-open]{display:block}
[data-ui-popup] [hidden]{display:none!important}
.ui-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.ui-popup-heading>strong{font-size:14px;font-weight:600}
.ui-popup-heading [data-ui-popup-close]{display:grid;place-items:center;width:30px;height:30px;min-height:30px;padding:0;line-height:1;flex:none}
.ui-popup-heading [data-ui-popup-close] svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
`;}

// ../../shared/card-header.js
// Shared markup stays in each card's shadow root: native links and existing
// data-zoom handlers work without cross-bundle custom-element registration.
const headerEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bindCardPopupPosition(host,trigger,popup,isRequested,show){
 return bindUIPopupPosition({trigger,popup,isRequested,onShow:show,ready:host.shadowRoot.querySelector('ha-card')?.updateComplete});
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
 const zoom=ready?`<div class="zoom-controls" role="group" aria-label="Zoom">${['out','in','reset'].map(action=>uiButton({content:cardHeaderIcon(action),disabled:!zoomState[action],title:label[['in','out','reset'].indexOf(action)],label:label[['in','out','reset'].indexOf(action)],attrs:{'data-zoom':action}})).join('')}</div>`:'';
 const group=periods.picker||periods.navigation?`<div class="chart-controls" role="group" aria-label="${nl?'Tijdvak':'Timeframe'}">${periods.picker??''}${periods.navigation??''}</div>`:'';
 const showZoomStatus=zoomState.zoomed&&!periods.picker;
 return `<header class="card-header">${showTitle&&title?`<h2>${headerEscape(title)}</h2>`:''}<div class="header-actions">${group}${zoom}<div class="chart-links" role="group" aria-label="${nl?'Geschiedenis en informatie':'History and information'}">${uiButton({href:historyUrl??'',className:'history-link',content:cardHeaderIcon('history'),title:label[3],label:label[3]})}${information}</div></div></header>${showZoomStatus?`<div class="chart-context"><div class="chart-range"><span class="zoom-status">${nl?'Ingezoomd':'Zoomed in'}</span></div></div>`:''}`;
}
function cardHeaderStyles(){return uiButtonStyles()+uiPopupStyles()+`
.card-header{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;min-height:32px;flex:none;margin:-6px -4px 10px 0}
.card-header h2{flex:1 1 110px;min-width:0;margin:4.75px 0 0;font-size:18px;line-height:1.25;font-weight:650;letter-spacing:-.01em;overflow-wrap:anywhere}
.header-actions{--chart-action-gap:8px;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:var(--chart-action-gap);flex:0 1 auto;min-width:0;max-width:100%;margin-inline-start:auto}
.chart-controls{display:flex;align-items:center;gap:0;min-width:0;max-width:100%}
.chart-links{display:flex;align-items:center;gap:0;flex:none}
.zoom-controls{display:flex;gap:0;position:relative}
.chart-controls,.zoom-controls,.chart-links{background:var(--secondary-background-color,#eee);border-radius:5px}
.chart-controls>[data-period="now"]{width:36px}
.chart-controls>.period-controls{position:relative;margin-inline-end:8px;padding-inline-end:8px}
.chart-controls>.period-controls::after{content:"";position:absolute;inset-inline-end:0;top:8px;height:16px;width:1px;background:var(--divider-color,#ddd)}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
`;}

// ../../shared/request.js
function retryDelay(failures, base = 60000, maximum = 300000) {
  return Math.min(maximum, base * 2 ** Math.max(0, failures - 1));
}

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
function calendarDayStart(key,zone='UTC'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;
 const nominal=Date.parse(`${key}T00:00:00Z`);
 return Number.isFinite(nominal)&&new Date(nominal).toISOString().slice(0,10)===key?periodMidnight(nominal,zone||'UTC'):NaN;
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
function periodDateTime(t,zone='UTC'){
 const p=periodLocalParts(t,zone),pad=n=>String(n).padStart(2,'0');
 return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
function parsePeriodDateTime(value,zone='UTC',edge='start',previous){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;
 if(Number.isFinite(previous)&&periodDateTime(previous,zone)===value)return previous;
 const nominal=Date.parse(value+'Z');if(!Number.isFinite(nominal)||periodDateTime(nominal,'UTC')!==value)return NaN;
 // Collect the offsets on both sides of a transition. Reject skipped local
 // times; repeated times include both occurrences unless editing an existing bound.
 const candidates=new Set();
 for(let h=-48;h<=48;h+=6){const sample=nominal+h*3600000,offset=periodLocalEpoch(sample,zone)-sample,candidate=nominal-offset;if(periodDateTime(candidate,zone)===value)candidates.add(candidate);}
 const times=[...candidates].sort((a,b)=>a-b);return times.length?(edge==='end'?times.at(-1):times[0]):NaN;
}
function chooseCustomGraphPeriod(host,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>366*86400000)return false;
 resetGraphPeriod(host);host._periodMode='custom';host._periodHours=(end-start)/3600000;host._periodEnd=end;
 publishTimeframe(host);host._reloadPeriod();return true;
}
function timeframeSyncConfig(config,{draft=false}={}){
 if(!draft){
  if(config.sync_timeframe!==undefined&&typeof config.sync_timeframe!=='boolean')throw Error('sync_timeframe must be a boolean. / Tijdvak synchroniseren moet aan of uit zijn.');
  for(const key of ['hover_sync_group','timeframe_sync_group'])if(config[key]!=null&&typeof config[key]!=='string')throw Error(`${key} must be text. / De synchronisatiegroep moet tekst zijn.`);
 }
 return {sync_timeframe:config.sync_timeframe??false,hover_sync_group:config.hover_sync_group??config.timeframe_sync_group??''};
}
function timeframeGroup(host){return host._config?.sync_timeframe===true?((host._config.hover_sync_group??host._config.timeframe_sync_group)?.trim()||'default'):null;}
function timeframeGroups(){
 const root=globalThis.window??globalThis,key=Symbol.for('eleven-cards.timeframe-sync.v1');
 return root[key]??=new Map();
}
function applyTimeframe(host,selection){
 // Default is a group-wide reset to each card's own configured range (or
 // native price window), rather than a copy of the sender's hours.
 if(selection.mode==='configured'&&selection.offset===0){resetGraphPeriod(host);return;}
 host._sharedTimeframe=selection;
 Object.assign(host,{_periodMode:selection.mode,_periodHours:selection.hours,_periodEnd:selection.end,_periodOffset:selection.offset,_periodAnchor:selection.anchor});
}
function disconnectTimeframeSync(host){
 host._disconnectTimeframeSync?.();host._disconnectTimeframeSync=null;
}
function connectTimeframeSync(host){
 disconnectTimeframeSync(host);
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const groups=timeframeGroups();let entry=groups.get(group);
 if(!entry){entry={selection:null,listeners:new Set()};groups.set(group,entry);}
 const receive=(selection,source)=>{
  if(source===host||host._sharedTimeframe===selection)return;
  applyTimeframe(host,selection);host._reloadPeriod();
 };
 entry.listeners.add(receive);
 host._disconnectTimeframeSync=()=>entry.listeners.delete(receive);
 // Joining never publishes this card's default over an existing selection.
 if(entry.selection)applyTimeframe(host,entry.selection);
}
function publishTimeframe(host){
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const entry=timeframeGroups().get(group);if(!entry)return;
 const selection={group,mode:host._periodMode,hours:host._periodHours??host._config.hours_to_show,
  end:host._periodEnd,offset:host._periodOffset,anchor:host._periodAnchor,zone:host._hass?.config?.time_zone||'UTC',at:Date.now()};
 selection.range=localGraphPeriodRange(host,selection.at);
 entry.selection=selection;applyTimeframe(host,selection);
 for(const receive of entry.listeners)receive(selection,host);
}
function resetGraphPeriod(host){host._sharedTimeframe=null;host._periodMode='configured';host._periodHours=null;host._periodEnd=null;host._periodOffset=0;host._periodAnchor=null;host._periodMenuOpen=false;host._periodMenuPending=false;host._periodCustomDraft=null;host._periodTab=null;host._insightPending=null;}
function graphPeriodRange(host,now=Date.now()){
 const shared=host._sharedTimeframe;
 if(shared&&timeframeGroup(host)===shared.group){
  // One clock and timezone for the whole group, including separate bundles.
  // Live selections advance together on the minute; historical ranges stay fixed.
  if(shared.offset===0&&shared.end==null&&(Math.floor(now/60000)!==Math.floor(shared.at/60000))){
   shared.at=now;shared.range=localGraphPeriodRange({_periodMode:shared.mode,_periodHours:shared.hours,_periodOffset:0,_hass:{config:{time_zone:shared.zone}}},now);
  }
  return {...shared.range};
 }
 return localGraphPeriodRange(host,now);
}
function localGraphPeriodRange(host,now){
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
 publishTimeframe(host);
 return host._reloadPeriod();
}
function moveGraphPeriod(host,direction){
 if(![-1,0,1].includes(direction))return;
 if(host._periodMode==='custom'){
  if(direction===0){host._periodEnd=null;host._periodOffset=0;}
  else{const end=(host._periodEnd??Date.now())+direction*host._periodHours*3600000;host._periodEnd=direction>0?Math.min(Date.now(),end):end;host._periodOffset=(host._periodOffset??0)+direction;}
  host._periodCustomDraft=null;host._periodTab=null;host._sharedTimeframe=null;publishTimeframe(host);return host._reloadPeriod();
 }
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
 host._sharedTimeframe=null;
 publishTimeframe(host);
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
 if(mode==='custom'||zoomed||(past&&!['today','week','month','quarter','year'].includes(mode)&&hours<24)){
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
 if(active?.closest?.('.header-actions'))host._periodFocus=active.dataset.periodTab!=null?`tab:${active.dataset.periodTab}`:active.dataset.customField!=null?`custom:${active.dataset.customField}`:active.dataset.periodOption!=null?`option:${active.dataset.periodOption}`:active.dataset.zoom!=null?`zoom:${active.dataset.zoom}`:active.classList.contains('history-link')?'history':active.dataset.period;
 if(host._config.show_navigation===false){host._periodMenuOpen=false;host._periodMenuPending=false;return {};}
 const previousMenu=host.shadowRoot.querySelector('.period-menu');
 if(previousMenu){
  if(!host._periodMenuPending)host._periodMenuScroll=previousMenu.scrollTop;
  host._periodMenuOpen=!!host._periodMenuPending||(typeof previousMenu.showPopover==='function'?previousMenu.matches(':popover-open'):previousMenu.hasAttribute('data-fallback-open'));
 }
 const nl=language.startsWith('nl'),label=(en,nlText)=>nl?nlText:en,mode=host._periodMode??'configured',past=(host._periodOffset??0)<0;
 const standard=label(`Default (${host._config.hours_to_show} hours)`,`Standaard (${host._config.hours_to_show} uur)`);
 const rolling=[['1h',1],['6h',6],['12h',12],['24h',24],['48h',48],['7d',168],['14d',336],['30d',720],['90d',2160],['365d',8760]].map(([id,hours])=>[id,hours<168?label(`${hours} ${hours===1?'hour':'hours'}`,`${hours} uur`):label(`${hours/24} days`,`${hours/24} dagen`),hours<168?`${hours} ${nl?'u':'h'}`:`${hours/24} d`]);
 const calendar=[['today',label('Today','Vandaag'),label('Day','Dag')],['week',label('This week','Deze week'),label('Week','Week')],['month',label('This month','Deze maand'),label('Month','Maand')],['quarter',label('This quarter','Dit kwartaal'),label('Quarter','Kwartaal')],['year',label('This year','Dit jaar'),label('Year','Jaar')]];
 const calendarChoice=calendar.find(([id])=>id===mode);
 if(!calendarChoice&&mode!=='configured'&&mode!=='custom'&&host._periodHours!=null&&!rolling.some(([id])=>id===mode))rolling.push([mode,label(`${host._periodHours} hours`,`${host._periodHours} uur`)]);
 const selectedStandard=label(`Default (${host._periodHours??host._config.hours_to_show} hours)`,`Standaard (${host._periodHours??host._config.hours_to_show} uur)`);
 const name=mode==='configured'?selectedStandard:calendarChoice?.[past?2:1]??rolling.find(([id])=>id===mode)?.[1]??standard;
 const tabIds=['rolling','calendar','custom'];
 const selectedTab=host._periodMenuOpen&&tabIds.includes(host._periodTab)?host._periodTab:mode==='custom'?'custom':calendarChoice?'calendar':'rolling';
 host._periodTab=selectedTab;
 const choice=([value,text,compact])=>uiButton({variant:'surface',content:`<span>${periodEscape(compact??text)}</span><span aria-hidden="true">${value===mode?'✓':''}</span>`,attrs:{role:'menuitemradio','aria-checked':value===mode,tabindex:-1,'aria-label':text,title:text,'data-period-option':value}});

 const {start,end}=host._status==='ready'&&Number.isFinite(host._viewStart)&&Number.isFinite(host._viewEnd)?{start:host._viewStart,end:host._viewEnd}:graphPeriodRange(host);
 const locale=nl?'nl-NL':'en-GB',zone=host._hass?.config?.time_zone||'UTC';
 const zoomed=host._status==='ready'&&(start>host._start+1||end<host._end-1);
 const compactName=compactPeriodName({start,end,mode,past,zoomed,hours:host._periodHours??host._config.hours_to_show,name,locale,zone});
 const format=new Intl.DateTimeFormat(locale,{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
 const range=`${format.format(start)} – ${format.format(end)}`;
 const customRange=graphPeriodRange(host),draft=host._periodCustomDraft??{start:periodDateTime(customRange.start,zone),end:periodDateTime(customRange.end,zone)};
 const canGoNext=mode==='custom'?host._periodEnd!=null&&customRange.end<Date.now():past;
 const custom=`<form data-custom-range><div class="period-custom-fields">${[['start',label('Start','Begin')],['end',label('End','Einde')]].map(([key,text])=>`<label>${text}<input type="datetime-local" name="${key}" data-custom-field="${key}" value="${periodEscape(draft[key])}" step="60" required></label>`).join('')}</div><p class="period-custom-zone">${periodEscape(zone)}</p><p class="period-custom-error" role="alert"${draft.error?'':' hidden'}>${periodEscape(draft.error??'')}</p>${uiButton({variant:'surface',type:'submit',text:label('Apply','Toepassen'),attrs:{'data-custom-field':'apply'}})}</form>`;
 const contents=uiTabs({id:'eleven-period',label:label('Period type','Soort tijdvak'),selected:selectedTab,className:'period-tabs',panelClassName:'period-panel',items:[
  {value:'rolling',label:label('Last','Afgelopen'),content:`<div class="period-options" role="menu" aria-label="${label('Last','Afgelopen')}">${rolling.map(choice).join('')}</div>`},
  {value:'calendar',label:label('Calendar','Kalender'),content:`<div class="period-options period-calendar" role="menu" aria-label="${label('Calendar','Kalender')}">${calendar.map(([id,text])=>choice([id,text])).join('')}</div>`},
  {value:'custom',label:label('Custom range','Eigen bereik'),content:custom,className:'period-custom'}
 ].map(item=>({...item,tabAttrs:{'data-period-tab':item.value},panelAttrs:{'data-period-panel':item.value}}))});
 const popup=uiPopup({id:'eleven-period-menu',className:'period-menu',title:label('Timeframe','Tijdvak'),label:label('Choose a period','Kies een periode'),closeLabel:label('Close','Sluiten'),closeAttrs:{'data-period':'close'},content:`<div class="period-current-range">${periodEscape(range)}${zoomed?`<span class="zoom-status">${label('Zoomed in','Ingezoomd')}</span>`:''}</div><div class="period-default" role="menu" aria-label="${label('Default','Standaard')}">${choice(['configured',standard])}</div>${contents}`});
 const trigger=uiButton({className:'period-trigger',content:`<span>${periodEscape(compactName)}</span>${cardHeaderIcon('down')}`,attrs:{'data-period':'menu','aria-haspopup':'dialog','aria-controls':'eleven-period-menu','aria-expanded':host._periodMenuOpen===true,title:range,'aria-label':label('Timeframe','Tijdvak')+': '+compactName,'aria-description':range+(zoomed?'. '+label('Zoomed in','Ingezoomd'):'')}});
 const navigation=[['previous',label('Previous period','Vorige periode')],['now',label('Return to the current period','Terug naar de huidige periode')],['next',label('Next period','Volgende periode')]].map(([key,title])=>uiButton({text:key==='now'?label('Now','Nu'):'',content:key==='now'?undefined:cardHeaderIcon(key),disabled:key==='next'&&!canGoNext,title,label:title,attrs:{'data-period':key}})).join('');
 return {picker:`<div class="period-controls">${trigger}${popup}</div>`,navigation};

}
function restorePeriodFocus(host,items=[]){
 const key=host._periodFocus;if(!key)return;const root=host.shadowRoot;
 const target=key.startsWith('tab:')?root.querySelector(host._periodMenuOpen?'[data-period-tab="'+key.slice(4)+'"]':'[data-period="menu"]'):key.startsWith('custom:')&&host._periodMenuOpen?root.querySelector('[data-custom-field="'+key.slice(7)+'"]'):key==='history'?root.querySelector('.history-link'):key.startsWith('zoom:')?root.querySelector('[data-zoom="'+key.slice(5)+'"]'):key.startsWith('option:')&&host._periodMenuOpen?items.find(item=>item.dataset.periodOption===key.slice(7)):root.querySelector('[data-period="'+(key.startsWith('option:')?'menu':key)+'"]');
 (target?.disabled?root.querySelector('[data-period="now"], [data-zoom="in"]:not(:disabled), .history-link'):target)?.focus?.({preventScroll:true});host._periodFocus=null;
}
function disconnectPeriodControls(host,preserveState=false){host._periodMenuCleanup?.();host._periodMenuCleanup=null;if(!preserveState)host._periodMenuPending=false;}
function bindPeriodControls(host){
 disconnectPeriodControls(host,true);
 const root=host.shadowRoot,nav=root.querySelector('.period-controls');if(!nav){restorePeriodFocus(host);return;}
 const menu=nav.querySelector('.period-menu'),trigger=nav.querySelector('[data-period="menu"]'),items=[...menu.querySelectorAll('[data-period-option]')];
 const nl=(host._hass?.language??'en').startsWith('nl'),label=(en,nlText)=>nl?nlText:en;
 const form=menu.querySelector('form[data-custom-range]'),tabs=[...menu.querySelectorAll('[data-period-tab]')],panels=[...menu.querySelectorAll('[data-period-panel]')];
 const visibleItems=()=>items.filter(item=>!item.closest?.('[data-period-panel]')?.hidden);
 const updateOptionFocus=()=>{
  const visible=visibleItems();for(const item of items)item.tabIndex=-1;
  const standard=visible.find(item=>item.dataset.periodOption==='configured');if(standard)standard.tabIndex=0;
  const options=visible.filter(item=>item!==standard),selected=options.find(item=>item.getAttribute('aria-checked')==='true')??options[0];if(selected)selected.tabIndex=0;
 };
 updateOptionFocus();
 const cleanups=[];
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 host._periodMenuCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 let scrollPending=false;
 const controller=bindUIPopup({trigger,popup:menu,container:nav,ready:root.querySelector('ha-card')?.updateComplete,
  isRequested:()=>host._periodMenuOpen,isCurrent:()=>root.querySelector('.period-menu')===menu,
  beforeOpen:()=>closeOtherCardPopups(host,'period'),
  onOpen:focus=>{host._periodMenuOpen=true;host._periodMenuPending=true;scrollPending=!focus;},
  onClose:()=>{host._periodMenuOpen=false;host._periodMenuPending=false;},
  onToggle:open=>{host._periodMenuOpen=open;},
  focusTarget:()=>visibleItems().find(item=>item.getAttribute('aria-checked')==='true')??tabs.find(tab=>tab.getAttribute('aria-selected')==='true')??items[0],
  onShown:()=>{host._periodMenuPending=false;restorePeriodFocus(host,items);if(scrollPending){menu.scrollTop=host._periodMenuScroll??0;scrollPending=false;}}
 });
 const {open,close,position}=controller;cleanups.push(()=>controller.disconnect());
 trigger.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();if(e.key==='ArrowUp')visibleItems().at(-1)?.focus({preventScroll:true});}};
 for(const item of items)item.onclick=()=>{close(true);chooseGraphPeriod(host,item.dataset.periodOption);};
 const tabController=bindUITabs({tabs,panels,onSelect:value=>{
  host._periodTab=value;updateOptionFocus();host._periodMenuScroll=0;menu.scrollTop=0;position();
 }});cleanups.push(()=>tabController.disconnect());
 if(form?.tagName==='FORM'){
  const fields=Object.fromEntries(['start','end'].map(key=>[key,form.elements.namedItem(key)]));
  const readDraft=()=>host._periodCustomDraft={start:fields.start.value,end:fields.end.value};
  listen(form,'input',()=>{readDraft();const error=form.querySelector('.period-custom-error');error.hidden=true;error.textContent='';});
  listen(form,'submit',e=>{
   e.preventDefault();const draft=readDraft(),zone=host._hass?.config?.time_zone||'UTC',previous=graphPeriodRange(host);
   const start=parsePeriodDateTime(draft.start,zone,'start',previous.start),end=parsePeriodDateTime(draft.end,zone,'end',previous.end);
   let message;
   if(!Number.isFinite(start)||!Number.isFinite(end))message=label('Choose valid dates and times in the displayed timezone.','Kies geldige datums en tijden in de getoonde tijdzone.');
   else if(end<=start)message=label('End must be after start.','Einde moet na begin liggen.');
   else if(end-start>366*86400000)message=label('Choose a range of at most 366 days.','Kies een bereik van maximaal 366 dagen.');
   if(message){draft.error=message;const error=form.querySelector('.period-custom-error');error.textContent=message;error.hidden=false;position();return;}
   close(true);chooseCustomGraphPeriod(host,start,end);
  });
 }
 menu.onkeydown=e=>{
  if(e.target?.closest?.('.period-custom, .period-tabs'))return;
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   const visible=visibleItems();if(!visible.length)return;e.preventDefault();const index=visible.indexOf(host.shadowRoot.activeElement),next=e.key==='Home'?0:e.key==='End'?visible.length-1:index<0?(e.key==='ArrowUp'?visible.length-1:0):(index+(e.key==='ArrowDown'?1:-1)+visible.length)%visible.length;
   visible[next].focus();
  }
 };
 for(const [key,direction]of [['previous',-1],['next',1],['now',0]])root.querySelector(`[data-period="${key}"]`).onclick=()=>{close();moveGraphPeriod(host,direction);};
 if(host._periodMenuOpen)open(false);
 if(!host._periodMenuPending)restorePeriodFocus(host,items);
}
function periodControlsStyles(){return uiTabsStyles()+`
.period-controls{display:flex;min-width:0;max-width:100%;flex:0 1 auto}
.header-actions .period-trigger{width:auto;min-width:0;max-width:100%;flex:0 1 auto;gap:6px;padding:4px 10px;border:0;border-radius:4px;background:transparent;font-weight:400}
.header-actions .period-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-trigger span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.period-current-range{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;margin:2px 0 10px}
.period-current-range .zoom-status{display:table;margin-top:4px}
.period-tabs{margin:10px 0 0}
.period-panel{padding-top:12px}
.period-options{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-bottom:4px}
.period-options button{position:relative;justify-content:center;padding:7px 3px;gap:0;min-width:0;white-space:nowrap}
.period-options button>span:last-child{position:absolute;inset-inline-end:2px;top:1px;font-size:9px;line-height:1}
.period-calendar{grid-template-columns:repeat(3,minmax(0,1fr))}
.period-custom-fields{display:grid;gap:10px}
.period-custom-fields label{display:grid;gap:4px;font-size:12px}
.period-custom input{box-sizing:border-box;width:100%;min-width:0;padding:8px;border:1px solid var(--divider-color,#ddd);border-radius:5px;font:inherit;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));color-scheme:inherit}
.period-custom input:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-1px}
.period-custom p{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);margin:8px 0;overflow-wrap:anywhere}
.period-custom .period-custom-error{color:var(--error-color,#db4437)}
.period-custom button[type="submit"]{justify-content:center;margin-top:10px}
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
function toggleChartIsolation(host,id){
 if(!host._config.entities.includes(id))return;
 cancelUILegendClicks(host);
 const only=host._config.entities.every((entity,i)=>host._isSeriesVisible(i)===(entity===id));
 only?showAllChartSeries(host):isolateChartSeries(host,id);
 focusUILegend(host,id,'[data-series]',button=>button.dataset.series);
}
function bindChartLegend(host){
 const nl=host._insightLanguage==='nl',hint=nl?'Dubbelklik of Shift+Enter: alleen deze sensor. Herhaal om alles te tonen.':'Double-click or Shift+Enter: show only this sensor. Repeat to show all.';
 bindUILegend(host,{selector:'[data-series]',getId:button=>button.dataset.series,hint,toggle:host._toggleSeries?id=>host._toggleSeries(id):null,isolate:id=>toggleChartIsolation(host,id)});
}
function insightControl(host,key,label,body,icon=''){
 const trigger=uiButton({className:'insight-trigger',content:icon+(key==='data'?'':`<span>${insightEscape(label)}</span>`),attrs:{'data-insight':key,title:label,'aria-label':label,'aria-haspopup':'dialog','aria-expanded':host._insightOpen===key,'aria-controls':'insight-'+key}});
 return `<div class="insight-control">${trigger}${uiPopup({id:'insight-'+key,className:'insight-popup',attrs:{'data-insight-panel':key},title:label,closeLabel:host._insightLanguage==='nl'?'Sluiten':'Close',closeAttrs:{'data-insight-close':''},content:body})}</div>`;
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
   const color=host._insightColor?.(i,row)??'var(--primary-color,#2196f3)';
   return `<section class="insight-sensor" data-information-entity="${insightEscape(item.id)}"><div class="insight-sensor-heading"><i class="insight-color" style="--insight-color:${insightEscape(color)}" aria-hidden="true"></i><strong>${insightEscape(item.name)}</strong><span class="insight-source">${sourceLabel}${unit?` <span class="insight-unit">· ${insightEscape(unit)}</span>`:''}</span></div>${metrics}${states.length?`<div class="insight-states" role="status">${states.join(' · ')}</div>`:''}</section>`;
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
function disconnectChartInsights(host,keepLegendClicks=false){if(!keepLegendClicks){cancelUILegendClicks(host);host._insightPending=null;}host._insightCleanup?.();host._insightCleanup=null;}
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
  const trigger=control.querySelector('[data-insight]'),popup=control.querySelector('.insight-popup'),key=trigger.dataset.insight;
  const controller=bindUIPopup({trigger,popup,container:control,ready:root.querySelector('ha-card')?.updateComplete,
   isRequested:()=>host._insightOpen===key,isCurrent:()=>root.querySelector(`[data-insight-panel="${key}"]`)===popup,
   beforeOpen:()=>closeOtherCardPopups(host,'insight'),
   onOpen:()=>{host._insightOpen=key;host._insightPending=key;},
   onClose:()=>{if(host._insightOpen===key)host._insightOpen=null;host._insightPending=null;},
   onToggle:open=>{if(!open&&host._insightOpen===key)host._insightOpen=null;},
   onShown:()=>{host._insightPending=null;restoreChartInsightFocus(host);},closeWhenAnchorHidden:true
  });
  const {open,close}=controller;cleanups.push(()=>controller.disconnect());
  for(const button of popup.querySelectorAll('[data-isolate]'))button.onclick=()=>{close(true);isolateChartSeries(host,button.dataset.isolate);};
  const all=popup.querySelector('[data-show-all]');if(all)all.onclick=()=>{close(true);showAllChartSeries(host);};
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
.insight-trigger svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.header-actions .insight-trigger{width:32px;height:32px;padding:0;background:transparent;border-radius:4px}
.header-actions .insight-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.header-actions .insight-trigger svg{width:18px;height:18px;stroke-width:2}
.insight-popup{z-index:21}
.insight-popup p{margin:8px 0 12px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-popup p strong{color:var(--primary-text-color,#20252b);font-weight:500}
.insight-popup .insight-choice{display:block;width:100%;padding:6px 8px;text-align:start;overflow-wrap:anywhere}
.insight-choice[aria-pressed="true"]{background:var(--secondary-background-color,#eee);font-weight:600}
.insight-sensors{display:grid}
.insight-sensor{min-width:0;padding:8px 0}
.insight-sensor+.insight-sensor{border-top:1px solid var(--divider-color,#ddd)}
.insight-sensor-heading{display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px}
.insight-color{display:block;width:7px;height:7px;flex:none;border-radius:2px;background:var(--insight-color,var(--primary-color,#2196f3))}
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
 const data={hours_to_show:24,data_source:'auto',graph_mode:'lines',aggregation_period:'none',aggregation_method:'avg',show_hover_line:true,show_legend:true,show_title:true,show_navigation:true,show_grid:true,align_zero:true,sync_hover:true,hover_sync_group:'',sync_timeframe:false,...config,...timeframeSyncConfig(config,{draft:true}),entities:(config.entities??[]).map((entity,index)=>{
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
 Object.assign(result,timeframeSyncConfig(config));
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
  }catch(error){if(strict)throw error;}
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
 // Padding must not invent negative space for nonnegative readings/bases.
 let dataMin=Infinity;
 for(const s of series)for(const p of s.points)for(const value of [p.v,p.base])if(Number.isFinite(value))dataMin=Math.min(dataMin,value);
 if(!Number.isFinite(config.y_min)&&Number.isFinite(dataMin)&&dataMin>=0&&max>0)min=Math.max(0,min);
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
 sync_timeframe:['Synchronize timeframe','Tijdvak synchroniseren'],
 sync_timeframeHelper:['Shares timeframe selection and previous/next/Now with enabled cards in the same group.','Deelt tijdvakkeuze en vorige/volgende/Nu met ingeschakelde kaarten in dezelfde groep.'],
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
 sync_hover:['Synchronize hover','Hover synchroniseren'],hover_sync_group:['Synchronization group','Synchronisatiegroep'],
 sync_hoverHelper:['Shares the selected time with other Eleven graphs on this page.','Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.'],
 hover_sync_groupHelper:['Cards with the same group share hover and timeframe when the corresponding synchronization is enabled. Empty uses the default group.','Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.'],
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
    {name:'hover_sync_group',selector:{text:{}}},{name:'sync_timeframe',default:false,selector:{boolean:{}}}
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
 _insightColor(index){
  const points=this._series[index]?.points??[];
  let last=null;for(let i=points.length-1;i>=0;i--)if(Number.isFinite(points[i].v)){last=points[i].v;break;}
  return this._appearance(index,last).color;
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
  SharedGraph.clearHover(this);this._config={...validated,...timeframeSyncConfig(validated)};this._lastLoad=null;this._loadFailed=false;this._insightOpen=null;this._generation++;this._inFlight=false;this._series=[];this._rawSeries=null;this._viewport=null;resetGraphPeriod(this);this._status='loading';this._refreshFailures=0;clearTimeout(this._timer);this._timer=null;connectTimeframeSync(this);this._render();if(this._connected&&this._hass)this._refresh();}
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
 connectedCallback(){this._connected=true;connectTimeframeSync(this);SharedGraph.connectHover(this,t=>this._receiveHover(t));this._elfPreview??=()=>{this._elfPreviewUntil=Date.now()+ELF_FLIGHT_MS;this.shadowRoot.querySelector('.eleven-elf')?.remove();this._syncElf();};registerElfPreview(this._elfPreview);document.addEventListener('pointerdown',this._outside);this._syncElf();if(this._config&&this._hass)this._refresh();}
 disconnectedCallback(){disconnectTimeframeSync(this);disconnectChartInsights(this);disconnectPeriodControls(this);SharedGraph.disconnectHover(this);this._connected=false;unregisterElfPreview(this._elfPreview);this._elfPreviewUntil=0;this._generation++;this._inFlight=false;this._started=false;clearTimeout(this._timer);this._timer=null;clearTimeout(this._elfTimer);this._elfTimer=null;document.removeEventListener('pointerdown',this._outside);}
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
   this._status=this._series.some(s=>s.points.some(p=>p.v!==null))?'ready':'empty';this._refreshFailures=0;
  }catch(e){if(generation!==this._generation||!this._connected)return;this._refreshFailures=(this._refreshFailures??0)+1;this._loadFailed=true;this._status=['missing','unit','statistics_config','statistics_unavailable'].includes(e.message)?e.message:'error';this._series=[];}
  finally{clearTimeout(timeout);if(generation===this._generation&&this._connected){this._inFlight=false;this._render();this._timer=setTimeout(()=>this._refresh(),retryDelay(this._refreshFailures??0,REFRESH_MS));this._timer.unref?.();}}
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
   const times=Array.from({length:4},(_,i)=>`<span class="axis-x" data-tick="${i}" style="left:calc(${i/3*100}% + ${44-i/3*56}px - ${i/3} * var(--axes-right,0px))">${escapeHtml(time(this._timeAtPlotPosition(i/3),lang,this._zone,(this._viewEnd-this._viewStart)>86400000))}</span>`).join('');

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
   const legend=uiLegend({items:meta.items.map((item,i)=>{const s=this._series[i],value=valueAt(s.points,this._end-(s.source==='statistics'?1:0));const a=this._appearance(i,value);return {id:item.id,visible:visible[i],title:text(visible[i]?'hide_sensor':'show_sensor',lang)+' '+item.name,attrs:{'data-series':item.id},content:`<i style="--series-color:${a.color};border-top-width:${a.width}px;border-top-style:${a.style}"></i><span>${escapeHtml(item.name)}</span><strong>${value===null?text('unavailable',lang):escapeHtml(number(value,lang))}${mixed&&value!==null&&item.unit?` ${escapeHtml(item.unit)}`:''}</strong>`};}),afterContent:mixed?'':`<span class="unit">${escapeHtml(meta.unit)}</span>`});
   const missing=meta.items.filter((_,i)=>visible[i]&&!this._series[i].points.some(p=>p.v!==null)).map(s=>s.name);
   content=`${this._config.show_legend?legend:`<div class="data-status">${escapeHtml(mixed?'':meta.unit)}</div>`}${missing.length?`<div class="data-status">${text('partial',lang)} ${escapeHtml(missing.join(', '))}</div>`:''}<div class="chart" style="--axis-column:min(48px, calc((100% - 124px) / ${Math.max(1,extra)}));--axes-right:calc(${extra} * var(--axis-column))" tabindex="0" role="group" aria-label="${text('chart',lang)}">${anyVisible?axes+times:`<div class="empty-visibility" role="status">${escapeHtml(text('no_visible',lang))}</div>`}<div class="plot">${graph}<div class="zoom-selection" hidden></div></div>${this._config.show_hover_line?'<div class="guide" hidden></div>':''}<div class="markers"></div><div class="tooltip" hidden></div><div class="sr-only" aria-live="polite"></div></div>`;
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
 _reloadPeriod(){this._generation++;this._inFlight=false;this._viewport=null;this._hideTooltip();clearTimeout(this._timer);this._status='loading';this._refreshFailures=0;this._render();return this._refresh();}
 _zoom(factor){
  this._hideTooltip();if(!factor)this._viewport=null;
  else{const a=this._viewStart??this._start,b=this._viewEnd??this._end,width=Math.min(this._end-this._start,Math.max(60000,(b-a)*factor)),center=(a+b)/2;
   const start=Math.max(this._start,Math.min(this._end-width,center-width/2));this._viewport=[start,start+width];}
  this._render();
 }
 _bindInteractions(){
  const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;
  const fromPointer=e=>{const box=chart.querySelector('.plot').getBoundingClientRect();return this._timeAtPlotPosition(Math.max(0,Math.min(1,(e.clientX-box.left)/box.width)));};
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
 _timeAtPlotPosition(ratio){const start=this._viewStart??this._start;return start+ratio*((this._viewEnd??this._end)-start);}
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
 .card-content{position:relative;display:flex;flex-direction:column;box-sizing:border-box;min-height:0;height:100%;overflow:auto;scrollbar-width:thin;padding:16px 16px 12px;line-height:1.4}
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
  return {start:Math.max(this._start,start),end:Math.min(end,finish),duration:finish-start,...(period!=='none'?{center:(start+finish)/2}:{})};
 }
 _barLayout(){
  const source=this._plotSeries??this._series,visible=this._config.entities.map((_,i)=>i).filter(i=>this._isSeriesVisible(i));
  const key=JSON.stringify([this._viewStart,this._viewEnd,this._config.aggregation_period,this._zone,visible]);
  if(this._barLayoutSource===source&&this._barLayoutKey===key)return this._barLayoutCache;
  const centers=new Set(),intervals=[];let duration=Infinity;
  for(const index of visible){const points=source[index]?.points??[];
   for(let i=0;i<points.length;i++){
    const interval=this._barInterval(points,i,this._end,index,true),a=Math.max(this._viewStart,interval.start),b=Math.min(this._viewEnd,interval.end);
    if(b<=a)continue;
    duration=Math.min(duration,interval.duration);centers.add(interval.center??(a+b)/2);
    if(Number.isFinite(points[i].v))intervals.push({interval,index});
   }
  }
  const positions=[...centers].sort((a,b)=>a-b);let band=Number.isFinite(duration)?duration:this._viewEnd-this._viewStart;
  for(let i=1;i<positions.length;i++)band=Math.min(band,positions[i]-positions[i-1]);
  // Fit the entire layout once. Clamping individual edge centers changes
  // their distance to neighbours and makes a partial period squeeze all bars.
  const period=this._config.aggregation_period;
  const from=period==='none'?this._viewStart:periodBounds(this._viewStart,period,this._zone)[0];
  const to=period==='none'?this._viewEnd:periodBounds(this._viewEnd-1,period,this._zone)[1];
  const start=Math.min(from,positions.length?positions[0]-band/2:from),end=Math.max(to,positions.length?positions.at(-1)+band/2:to);
  const scale=(this._viewEnd-this._viewStart)/(end-start);
  this._barLayoutSource=source;this._barLayoutKey=key;
  return this._barLayoutCache={start,scale,band,span:band*.76,visible,intervals};
 }
 _barGeometry(interval,x,index){
  const {start,scale,span,visible}=this._barLayout(),grouped=this._config.graph_mode!=='stacked';
  const count=grouped?visible.length:1,slot=grouped?visible.indexOf(index):0;
  const a=Math.max(this._viewStart,interval.start),b=Math.min(this._viewEnd,interval.end);
  const center=this._viewStart+((interval.center??(a+b)/2)-start)*scale;
  const left=center-span*scale/2+slot*span*scale/count;
  return {left:x(left),right:x(left+span*scale*.9/count)};
 }
 _barAt(timestamp,index){
  const points=(this._plotSeries??this._series)[index].points;let low=0,high=points.length;
  while(low<high){const middle=(low+high)>>1;if(points[middle].t<=timestamp)low=middle+1;else high=middle;}
  return low?this._barInterval(points,low-1,this._end,index,true):null;
 }
 _timeAtPlotPosition(ratio){const layout=this._barLayout();return layout.start+ratio*(this._viewEnd-this._viewStart)/layout.scale;}
 _pointerTime(timestamp){
  // An edge bar may be inset beyond its period. Hit-test the painted bars for
  // pointer/touch, while keyboard and synchronized hover keep semantic times.
  const layout=this._barLayout();
  layout.hits??=layout.intervals.map(({interval,index})=>({...this._barGeometry(interval,t=>t,index),time:(Math.max(this._viewStart,interval.start)+Math.min(this._viewEnd,interval.end))/2})).sort((a,b)=>a.left-b.left);
  const position=this._viewStart+(timestamp-layout.start)*layout.scale;
  let low=0,high=layout.hits.length;while(low<high){const mid=(low+high)>>1;if(layout.hits[mid].left<=position)low=mid+1;else high=mid;}
  const hit=layout.hits[low-1];return hit&&position<=hit.right?hit.time:timestamp;
 }
 _line(points,end,x,y,index=0){
  let path='';const dense=new Map(),plotWidth=this.shadowRoot?.querySelector('.plot')?.clientWidth,minimum=plotWidth>0?1000/plotWidth:0;
  for(let i=0;i<points.length;i++){
   const p=points[i],interval=this._barInterval(points,i,Math.min(this._end,end),index,true);
   if(!Number.isFinite(p.v)||interval.end<=this._viewStart||interval.start>=this._viewEnd||interval.end<=interval.start)continue;
   const {left:l,right:r}=this._barGeometry(interval,x,index),base=this._config.graph_mode==='stacked'?(p.base??0):0;
   if(points.length>2000&&minimum&&r-l<minimum){const key=Math.round((l+r)/(2*minimum)),bucket=dense.get(key)??{};const side=p.v>=base?'positive':'negative';if(!bucket[side]||Math.abs(p.v-base)>Math.abs(bucket[side].value-bucket[side].base))bucket[side]={left:l,right:Math.min(1000,Math.max(r,l+minimum)),value:p.v,base};dense.set(key,bucket);}
   else path+=`M ${l} ${y(base)} V ${y(p.v)} H ${r} V ${y(base)} Z `;
  }
  for(const bucket of dense.values())for(const bar of [bucket.positive,bucket.negative])if(bar)path+=`M ${bar.left} ${y(bar.base)} V ${y(bar.value)} H ${bar.right} V ${y(bar.base)} Z `;
  return path.trim();
 }
 _hoverInterval(timestamp){
  const a=this._viewStart??this._start,b=this._viewEnd??this._end;
  const t=Math.max(a,Math.min(b-1,timestamp)),period=this._config.aggregation_period;
  const bounds=period==='none'?[this._start,this._end]:periodBounds(t,period,this._zone);
  // Aggregated bars select one whole period; raw intervals retain their edges.
  let start=Math.max(a,bounds[0]),end=Math.min(b,bounds[1]);
  for(let i=0;i<this._series.length;i++){
   if(!this._isSeriesVisible(i))continue;const points=this._series[i].points;let low=0,high=points.length;
   while(low<high){const mid=(low+high)>>1;if(points[mid].t<=t)low=mid+1;else high=mid;}
   const before=points[low-1]?.t,after=points[low]?.t;
   if(before>start&&before<end)start=before;if(after>t&&after<end&&after<bounds[1])end=after;
  }
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

;
// Eleven Heatmap (beta) 0.3.0 — self-contained standalone module
(()=>{
function retryDelay(failures, base = 60000, maximum = 300000) {
  return Math.min(maximum, base * 2 ** Math.max(0, failures - 1));
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
function calendarDayStart(key,zone='UTC'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;
 const nominal=Date.parse(`${key}T00:00:00Z`);
 return Number.isFinite(nominal)&&new Date(nominal).toISOString().slice(0,10)===key?periodMidnight(nominal,zone||'UTC'):NaN;
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
function periodDateTime(t,zone='UTC'){
 const p=periodLocalParts(t,zone),pad=n=>String(n).padStart(2,'0');
 return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
function parsePeriodDateTime(value,zone='UTC',edge='start',previous){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;
 if(Number.isFinite(previous)&&periodDateTime(previous,zone)===value)return previous;
 const nominal=Date.parse(value+'Z');if(!Number.isFinite(nominal)||periodDateTime(nominal,'UTC')!==value)return NaN;
 // Collect the offsets on both sides of a transition. Reject skipped local
 // times; repeated times include both occurrences unless editing an existing bound.
 const candidates=new Set();
 for(let h=-48;h<=48;h+=6){const sample=nominal+h*3600000,offset=periodLocalEpoch(sample,zone)-sample,candidate=nominal-offset;if(periodDateTime(candidate,zone)===value)candidates.add(candidate);}
 const times=[...candidates].sort((a,b)=>a-b);return times.length?(edge==='end'?times.at(-1):times[0]):NaN;
}
function chooseCustomGraphPeriod(host,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>366*86400000)return false;
 resetGraphPeriod(host);host._periodMode='custom';host._periodHours=(end-start)/3600000;host._periodEnd=end;
 publishTimeframe(host);host._reloadPeriod();return true;
}
function timeframeSyncConfig(config,{draft=false}={}){
 if(!draft){
  if(config.sync_timeframe!==undefined&&typeof config.sync_timeframe!=='boolean')throw Error('sync_timeframe must be a boolean. / Tijdvak synchroniseren moet aan of uit zijn.');
  for(const key of ['hover_sync_group','timeframe_sync_group'])if(config[key]!=null&&typeof config[key]!=='string')throw Error(`${key} must be text. / De synchronisatiegroep moet tekst zijn.`);
 }
 return {sync_timeframe:config.sync_timeframe??false,hover_sync_group:config.hover_sync_group??config.timeframe_sync_group??''};
}
function timeframeGroup(host){return host._config?.sync_timeframe===true?((host._config.hover_sync_group??host._config.timeframe_sync_group)?.trim()||'default'):null;}
function timeframeGroups(){
 const root=globalThis.window??globalThis,key=Symbol.for('eleven-cards.timeframe-sync.v1');
 return root[key]??=new Map();
}
function applyTimeframe(host,selection){
 // Default is a group-wide reset to each card's own configured range (or
 // native price window), rather than a copy of the sender's hours.
 if(selection.mode==='configured'&&selection.offset===0){resetGraphPeriod(host);return;}
 host._sharedTimeframe=selection;
 Object.assign(host,{_periodMode:selection.mode,_periodHours:selection.hours,_periodEnd:selection.end,_periodOffset:selection.offset,_periodAnchor:selection.anchor});
}
function disconnectTimeframeSync(host){
 host._disconnectTimeframeSync?.();host._disconnectTimeframeSync=null;
}
function connectTimeframeSync(host){
 disconnectTimeframeSync(host);
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const groups=timeframeGroups();let entry=groups.get(group);
 if(!entry){entry={selection:null,listeners:new Set()};groups.set(group,entry);}
 const receive=(selection,source)=>{
  if(source===host||host._sharedTimeframe===selection)return;
  applyTimeframe(host,selection);host._reloadPeriod();
 };
 entry.listeners.add(receive);
 host._disconnectTimeframeSync=()=>entry.listeners.delete(receive);
 // Joining never publishes this card's default over an existing selection.
 if(entry.selection)applyTimeframe(host,entry.selection);
}
function publishTimeframe(host){
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const entry=timeframeGroups().get(group);if(!entry)return;
 const selection={group,mode:host._periodMode,hours:host._periodHours??host._config.hours_to_show,
  end:host._periodEnd,offset:host._periodOffset,anchor:host._periodAnchor,zone:host._hass?.config?.time_zone||'UTC',at:Date.now()};
 selection.range=localGraphPeriodRange(host,selection.at);
 entry.selection=selection;applyTimeframe(host,selection);
 for(const receive of entry.listeners)receive(selection,host);
}
function resetGraphPeriod(host){host._sharedTimeframe=null;host._periodMode='configured';host._periodHours=null;host._periodEnd=null;host._periodOffset=0;host._periodAnchor=null;host._periodMenuOpen=false;host._periodMenuPending=false;host._periodCustomDraft=null;host._periodTab=null;host._insightPending=null;}
function graphPeriodRange(host,now=Date.now()){
 const shared=host._sharedTimeframe;
 if(shared&&timeframeGroup(host)===shared.group){
  // One clock and timezone for the whole group, including separate bundles.
  // Live selections advance together on the minute; historical ranges stay fixed.
  if(shared.offset===0&&shared.end==null&&(Math.floor(now/60000)!==Math.floor(shared.at/60000))){
   shared.at=now;shared.range=localGraphPeriodRange({_periodMode:shared.mode,_periodHours:shared.hours,_periodOffset:0,_hass:{config:{time_zone:shared.zone}}},now);
  }
  return {...shared.range};
 }
 return localGraphPeriodRange(host,now);
}
function localGraphPeriodRange(host,now){
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
 publishTimeframe(host);
 return host._reloadPeriod();
}
function moveGraphPeriod(host,direction){
 if(![-1,0,1].includes(direction))return;
 if(host._periodMode==='custom'){
  if(direction===0){host._periodEnd=null;host._periodOffset=0;}
  else{const end=(host._periodEnd??Date.now())+direction*host._periodHours*3600000;host._periodEnd=direction>0?Math.min(Date.now(),end):end;host._periodOffset=(host._periodOffset??0)+direction;}
  host._periodCustomDraft=null;host._periodTab=null;host._sharedTimeframe=null;publishTimeframe(host);return host._reloadPeriod();
 }
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
 host._sharedTimeframe=null;
 publishTimeframe(host);
 return host._reloadPeriod();
}

// Native controls: text/attributes are escaped; content is trusted, caller-owned HTML.
function uiEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function uiAttributes(values={}){
 return Object.entries(values).map(([key,value])=>{
  if(!/^[a-zA-Z_:][\w:.-]*$/.test(key)||/^on/i.test(key))throw Error('Invalid UI attribute: '+key);
  if(value==null)return '';
  if(['disabled','hidden','required','autofocus','multiple','readonly'].includes(key))return value?` ${key}`:'';
  return ` ${key}="${uiEscape(value)}"`;
 }).join('');
}
function uiButton({text='',content,label,title,variant='icon',className='',type='button',href,disabled=false,attrs={}}={}){
 const classes=className?` class="${uiEscape(className)}"`:'';
 const body=content??uiEscape(text),attributes=uiAttributes({...attrs,...(label==null?{}:{'aria-label':label}),...(title==null?{}:{title}),...(disabled?{disabled:true}:{})});
 return href==null?`<button type="${uiEscape(type)}"${classes} data-ui-button="${uiEscape(variant)}"${attributes}>${body}</button>`:`<a${classes} data-ui-button="${uiEscape(variant)}" href="${uiEscape(href)}"${attributes}>${body}</a>`;
}
function uiButtonStyles(){return `
[data-ui-button]{display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:inherit;font-size:12px;font-weight:400;padding:0;border:0;border-radius:4px;background:transparent;color:var(--primary-text-color,#20252b);text-decoration:none;cursor:pointer;flex:none}
[data-ui-button="icon"]{width:32px;height:32px}
[data-ui-button]:not(:disabled):hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
[data-ui-button]:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
[data-ui-button="icon"]:focus-visible{background:var(--secondary-background-color,#eee)}
[data-ui-button]:disabled{opacity:.35;cursor:default}
[data-ui-button="surface"]{height:auto;width:100%;justify-content:space-between;gap:8px;min-height:34px;text-align:start;padding:6px 8px;border-radius:5px;background:var(--secondary-background-color,#eee)}
[data-ui-button="surface"][aria-checked="true"],[data-ui-button="surface"][aria-pressed="true"]{color:var(--primary-color,#2196f3);background:color-mix(in srgb,var(--primary-color,#2196f3) 14%,var(--ha-card-background,var(--card-background-color,#fff)));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--primary-color,#2196f3) 55%,transparent)}
[data-ui-button="text"]{min-height:30px;height:auto;width:auto;border-radius:5px}
[data-ui-button="close"]{width:30px;height:30px;min-height:30px;border-radius:5px;font-size:20px;color:inherit}
`;}


// The caller owns each item's trusted HTML (swatch, label and optional value).
function uiLegendButton({id,visible=true,content='',title='',className='legend-item',attrs={}}={}){
 return `<button type="button" class="${uiEscape(className)}"${uiAttributes({...attrs,'data-ui-legend':id,'aria-pressed':visible,title})}>${content}</button>`;
}
function uiLegend({items=[],className='legend',attrs={},afterContent=''}={}){
 return `<div class="${uiEscape(className)}"${uiAttributes(attrs)}>${items.map(uiLegendButton).join('')}${afterContent}</div>`;
}
function cancelUILegendClicks(host){
 for(const timer of host._legendClickTimers?.values()??[])clearTimeout(timer);
 host._legendClickTimers?.clear();
}
function focusUILegend(host,id,selector='[data-ui-legend]',getId=button=>button.dataset.uiLegend){
 queueMicrotask(()=>[...host.shadowRoot.querySelectorAll(selector)].find(button=>getId(button)===id)?.focus({preventScroll:true}));
}
function bindUILegend(host,{selector='[data-ui-legend]',getId=button=>button.dataset.uiLegend,hint='',toggle,isolate}={}){
 for(const button of host.shadowRoot.querySelectorAll?.(selector)??[]){
  const id=getId(button);
  if(hint&&!button.title?.includes(hint))button.title=[button.title,hint].filter(Boolean).join(' ');
  if(hint)button.setAttribute('aria-description',hint);
  button.setAttribute('aria-keyshortcuts','Shift+Enter Shift+Space');
  button.onclick=event=>{
   clearTimeout(host._legendClickTimers?.get(id));host._legendClickTimers?.delete(id);
   if(event.shiftKey||event.detail>1){event.preventDefault();isolate?.(id);return;}
   if(!event.detail){(toggle??isolate)?.(id);return;}
   // Wait for the second click before a rerender replaces the clicked button.
   if(toggle){const config=host._config;host._legendClickTimers??=new Map();host._legendClickTimers.set(id,setTimeout(()=>{host._legendClickTimers.delete(id);if(host._config===config)toggle(id);},300));}
  };
  button.ondblclick=event=>event.preventDefault();
  button.onkeydown=event=>{if(event.shiftKey&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();isolate?.(id);}};
 }
}


function uiTabs({id,label,items,selected,className='',panelClassName=''}={}){
 if(typeof id!=='string'||!id||!items?.length||items.some(item=>typeof item.value!=='string'||!item.value)||new Set(items.map(item=>item.value)).size!==items.length)throw Error('Tabs need an id and distinct text values.');
 const active=items.find(item=>item.value===selected&&!item.disabled)??items.find(item=>!item.disabled);
 const tabId=value=>`${id}-tab-${encodeURIComponent(value)}`,panelId=value=>`${id}-panel-${encodeURIComponent(value)}`;
 const bar=`<div${uiAttributes({class:className||null,'data-ui-tabs':'',role:'tablist','aria-label':label})}>${items.map(item=>uiButton({variant:'tab',text:item.label,disabled:item.disabled,attrs:{role:'tab',id:tabId(item.value),'data-ui-tab':item.value,'aria-controls':panelId(item.value),'aria-selected':item===active,tabindex:item===active?0:-1,...item.tabAttrs}})).join('')}</div>`;
 const panels=items.map(item=>`<section${uiAttributes({class:[panelClassName,item.className].filter(Boolean).join(' ')||null,id:panelId(item.value),role:'tabpanel','aria-labelledby':tabId(item.value),'data-ui-tab-panel':item.value,...item.panelAttrs,hidden:item!==active})}>${item.content??''}</section>`).join('');
 return bar+panels;
}
function bindUITabs({tabs,panels,onSelect=()=>{}}){
 const buttons=[...tabs],sections=[...panels],cleanups=[];
 const select=(value,{focus=false,notify=true}={})=>{
  const target=buttons.find(tab=>tab.dataset.uiTab===value&&!tab.disabled);if(!target)return false;
  for(const tab of buttons){const active=tab===target;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  for(const panel of sections)panel.hidden=panel.dataset.uiTabPanel!==value;
  if(focus)target.focus({preventScroll:true});if(notify)onSelect(value,target);return true;
 };
 for(const tab of buttons){
  const click=()=>select(tab.dataset.uiTab,{focus:true});
  const keydown=e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
   e.preventDefault();e.stopPropagation();const enabled=buttons.filter(button=>!button.disabled),index=enabled.indexOf(tab);
   const next=e.key==='Home'?0:e.key==='End'?enabled.length-1:(index+(e.key==='ArrowRight'?1:-1)+enabled.length)%enabled.length;
   if(enabled[next])select(enabled[next].dataset.uiTab,{focus:true});
  };
  tab.onclick=click;tab.onkeydown=keydown;
  cleanups.push(()=>{if(tab.onclick===click)tab.onclick=null;if(tab.onkeydown===keydown)tab.onkeydown=null;});
 }
 return {select,disconnect(){cleanups.splice(0).forEach(remove=>remove());}};
}
function uiTabsStyles(){return `
[data-ui-tabs]{display:flex;align-items:flex-end;gap:8px;border-bottom:1px solid var(--divider-color,#ddd)}
[data-ui-tabs] [role="tab"]{flex:1;justify-content:center;min-width:0;min-height:36px;padding:8px 3px;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--secondary-text-color,#666);white-space:nowrap}
[data-ui-tabs] [role="tab"]:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 5%,var(--ha-card-background,var(--card-background-color,#fff)));color:var(--primary-text-color,#20252b)}
[data-ui-tabs] [role="tab"][aria-selected="true"]{border-bottom-color:var(--primary-color,#2196f3);color:var(--primary-color,#2196f3);font-weight:600}
[data-ui-tab-panel][hidden]{display:none!important}
`;}


function uiPopup({id,title,label=title,closeLabel='Close',content='',className='',attrs={},closeAttrs={}}){
 return `<div${uiAttributes({id,class:className||null,'data-ui-popup':'',popover:'auto',role:'dialog','aria-label':label,...attrs})}><div class="ui-popup-heading"><strong>${uiEscape(title)}</strong>${uiButton({variant:'close',content:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>',label:closeLabel,attrs:{'data-ui-popup-close':'',...closeAttrs}})}</div>${content}</div>`;
}
function bindUIPopupPosition({trigger,popup,isRequested,onShow,ready,width=380,maxHeight=560}){
 let active=true;
 const position=()=>{
  if(!active||!isRequested())return;
  const box=trigger.getBoundingClientRect();
  if(!box.width||!box.height){popup.style.visibility='hidden';return;}
  const actualWidth=Math.min(width,window.innerWidth-16);
  popup.style.width=actualWidth+'px';popup.style.maxHeight=Math.min(maxHeight,window.innerHeight-16)+'px';
  popup.style.visibility='';onShow?.();
  const height=popup.getBoundingClientRect().height,below=window.innerHeight-box.bottom-8,above=box.top-8;
  popup.style.left=Math.max(8,Math.min(box.right-actualWidth,window.innerWidth-actualWidth-8))+'px';
  popup.style.top=Math.max(8,Math.min(below>=height||below>=above?box.bottom+6:box.top-height-6,window.innerHeight-height-8))+'px';
 };
 if(ready?.then)ready.then(position,()=>{});
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(position):null;
 observer?.observe(trigger);
 return {position,disconnect(){active=false;observer?.disconnect();}};
}
// Domain state lives in callbacks; this controller also works without a card host.
function bindUIPopup({trigger,popup,container=popup,ready,isRequested,isCurrent=()=>true,beforeOpen=()=>{},onOpen=()=>{},onClose=()=>{},onShown=()=>{},onToggle=()=>{},focusTarget,closeWhenAnchorHidden=false}){
 let requested=false,pending=false,focusPending=false,pointerWasOpen;
 const wantsOpen=isRequested??(()=>requested),native=typeof popup.showPopover==='function';
 const isOpen=()=>native?popup.matches(':popover-open'):popup.hasAttribute('data-fallback-open');
 trigger.setAttribute('aria-haspopup','dialog');if(popup.id)trigger.setAttribute('aria-controls',popup.id);trigger.setAttribute('aria-expanded',String(isOpen()));
 const cleanups=[],listen=(target,type,handler,capture=false)=>{target?.addEventListener?.(type,handler,capture);cleanups.push(()=>target?.removeEventListener?.(type,handler,capture));};
 const property=(target,key,handler)=>{if(!target)return;target[key]=handler;cleanups.push(()=>{if(target[key]===handler)target[key]=null;});};
 const closeButton=popup.querySelector('[data-ui-popup-close]');
 const placement=bindUIPopupPosition({trigger,popup,ready,isRequested:wantsOpen,onShow:()=>{
  pending=false;if(native){if(!isOpen())popup.showPopover();}else popup.setAttribute('data-fallback-open','');
  if(focusPending){(focusTarget?.()??closeButton)?.focus({preventScroll:true});focusPending=false;}
  onShown();
 }});
 const close=(focus=false)=>{
  requested=false;pending=false;focusPending=false;onClose();trigger.setAttribute('aria-expanded','false');
  if(native){if(isOpen())popup.hidePopover();}else popup.removeAttribute('data-fallback-open');
  if(focus)trigger.focus({preventScroll:true});
 };
 const open=(focus=true)=>{beforeOpen();requested=true;pending=true;focusPending=focus;onOpen(focus);trigger.setAttribute('aria-expanded','true');placement.position();};
 property(trigger,'onpointerdown',()=>{pointerWasOpen=wantsOpen();});
 property(trigger,'onpointercancel',()=>{pointerWasOpen=undefined;});
 property(trigger,'onclick',()=>{const wasOpen=pointerWasOpen??wantsOpen();pointerWasOpen=undefined;wasOpen?close(true):open();});
 property(closeButton,'onclick',()=>close(true));
 listen(popup,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}});
 listen(popup,'toggle',e=>{if(!isCurrent())return;const opened=e.newState==='open';if(!opened){if(wantsOpen())onClose();pending=false;focusPending=false;}requested=opened;trigger.setAttribute('aria-expanded',String(opened));onToggle(opened);});
 listen(window,'resize',()=>{if(wantsOpen()){if(closeWhenAnchorHidden&&trigger.getClientRects?.().length===0)close();else placement.position();}});
 listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(popup))close();},true);
 listen(document,'pointerdown',e=>{if((!native||pending)&&(isOpen()||wantsOpen())&&!e.composedPath().includes(container))close();});
 return {open,close,isOpen,position:placement.position,disconnect(){placement.disconnect();cleanups.splice(0).forEach(remove=>remove());}};
}
function uiPopupStyles(){return `
[data-ui-popup]{display:none;position:fixed;inset:auto;margin:0;padding:8px 12px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;z-index:20;max-width:calc(100vw - 16px);border:1px solid var(--divider-color,#ddd);border-radius:10px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font:inherit;font-size:12px;line-height:1.35;box-shadow:0 8px 28px #0004}
[data-ui-popup]:popover-open,[data-ui-popup][data-fallback-open]{display:block}
[data-ui-popup] [hidden]{display:none!important}
.ui-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.ui-popup-heading>strong{font-size:14px;font-weight:600}
.ui-popup-heading [data-ui-popup-close]{display:grid;place-items:center;width:30px;height:30px;min-height:30px;padding:0;line-height:1;flex:none}
.ui-popup-heading [data-ui-popup-close] svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
`;}



// Shared markup stays in each card's shadow root: native links and existing
// data-zoom handlers work without cross-bundle custom-element registration.
const headerEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bindCardPopupPosition(host,trigger,popup,isRequested,show){
 return bindUIPopupPosition({trigger,popup,isRequested,onShow:show,ready:host.shadowRoot.querySelector('ha-card')?.updateComplete});
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
 const zoom=ready?`<div class="zoom-controls" role="group" aria-label="Zoom">${['out','in','reset'].map(action=>uiButton({content:cardHeaderIcon(action),disabled:!zoomState[action],title:label[['in','out','reset'].indexOf(action)],label:label[['in','out','reset'].indexOf(action)],attrs:{'data-zoom':action}})).join('')}</div>`:'';
 const group=periods.picker||periods.navigation?`<div class="chart-controls" role="group" aria-label="${nl?'Tijdvak':'Timeframe'}">${periods.picker??''}${periods.navigation??''}</div>`:'';
 const showZoomStatus=zoomState.zoomed&&!periods.picker;
 return `<header class="card-header">${showTitle&&title?`<h2>${headerEscape(title)}</h2>`:''}<div class="header-actions">${group}${zoom}<div class="chart-links" role="group" aria-label="${nl?'Geschiedenis en informatie':'History and information'}">${uiButton({href:historyUrl??'',className:'history-link',content:cardHeaderIcon('history'),title:label[3],label:label[3]})}${information}</div></div></header>${showZoomStatus?`<div class="chart-context"><div class="chart-range"><span class="zoom-status">${nl?'Ingezoomd':'Zoomed in'}</span></div></div>`:''}`;
}
function cardHeaderStyles(){return uiButtonStyles()+uiPopupStyles()+`
.card-header{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;min-height:32px;flex:none;margin:-6px -4px 10px 0}
.card-header h2{flex:1 1 110px;min-width:0;margin:4.75px 0 0;font-size:18px;line-height:1.25;font-weight:650;letter-spacing:-.01em;overflow-wrap:anywhere}
.header-actions{--chart-action-gap:8px;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:var(--chart-action-gap);flex:0 1 auto;min-width:0;max-width:100%;margin-inline-start:auto}
.chart-controls{display:flex;align-items:center;gap:0;min-width:0;max-width:100%}
.chart-links{display:flex;align-items:center;gap:0;flex:none}
.zoom-controls{display:flex;gap:0;position:relative}
.chart-controls,.zoom-controls,.chart-links{background:var(--secondary-background-color,#eee);border-radius:5px}
.chart-controls>[data-period="now"]{width:36px}
.chart-controls>.period-controls{position:relative;margin-inline-end:8px;padding-inline-end:8px}
.chart-controls>.period-controls::after{content:"";position:absolute;inset-inline-end:0;top:8px;height:16px;width:1px;background:var(--divider-color,#ddd)}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
`;}






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
 if(mode==='custom'||zoomed||(past&&!['today','week','month','quarter','year'].includes(mode)&&hours<24)){
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
 if(active?.closest?.('.header-actions'))host._periodFocus=active.dataset.periodTab!=null?`tab:${active.dataset.periodTab}`:active.dataset.customField!=null?`custom:${active.dataset.customField}`:active.dataset.periodOption!=null?`option:${active.dataset.periodOption}`:active.dataset.zoom!=null?`zoom:${active.dataset.zoom}`:active.classList.contains('history-link')?'history':active.dataset.period;
 if(host._config.show_navigation===false){host._periodMenuOpen=false;host._periodMenuPending=false;return {};}
 const previousMenu=host.shadowRoot.querySelector('.period-menu');
 if(previousMenu){
  if(!host._periodMenuPending)host._periodMenuScroll=previousMenu.scrollTop;
  host._periodMenuOpen=!!host._periodMenuPending||(typeof previousMenu.showPopover==='function'?previousMenu.matches(':popover-open'):previousMenu.hasAttribute('data-fallback-open'));
 }
 const nl=language.startsWith('nl'),label=(en,nlText)=>nl?nlText:en,mode=host._periodMode??'configured',past=(host._periodOffset??0)<0;
 const standard=label(`Default (${host._config.hours_to_show} hours)`,`Standaard (${host._config.hours_to_show} uur)`);
 const rolling=[['1h',1],['6h',6],['12h',12],['24h',24],['48h',48],['7d',168],['14d',336],['30d',720],['90d',2160],['365d',8760]].map(([id,hours])=>[id,hours<168?label(`${hours} ${hours===1?'hour':'hours'}`,`${hours} uur`):label(`${hours/24} days`,`${hours/24} dagen`),hours<168?`${hours} ${nl?'u':'h'}`:`${hours/24} d`]);
 const calendar=[['today',label('Today','Vandaag'),label('Day','Dag')],['week',label('This week','Deze week'),label('Week','Week')],['month',label('This month','Deze maand'),label('Month','Maand')],['quarter',label('This quarter','Dit kwartaal'),label('Quarter','Kwartaal')],['year',label('This year','Dit jaar'),label('Year','Jaar')]];
 const calendarChoice=calendar.find(([id])=>id===mode);
 if(!calendarChoice&&mode!=='configured'&&mode!=='custom'&&host._periodHours!=null&&!rolling.some(([id])=>id===mode))rolling.push([mode,label(`${host._periodHours} hours`,`${host._periodHours} uur`)]);
 const selectedStandard=label(`Default (${host._periodHours??host._config.hours_to_show} hours)`,`Standaard (${host._periodHours??host._config.hours_to_show} uur)`);
 const name=mode==='configured'?selectedStandard:calendarChoice?.[past?2:1]??rolling.find(([id])=>id===mode)?.[1]??standard;
 const tabIds=['rolling','calendar','custom'];
 const selectedTab=host._periodMenuOpen&&tabIds.includes(host._periodTab)?host._periodTab:mode==='custom'?'custom':calendarChoice?'calendar':'rolling';
 host._periodTab=selectedTab;
 const choice=([value,text,compact])=>uiButton({variant:'surface',content:`<span>${periodEscape(compact??text)}</span><span aria-hidden="true">${value===mode?'✓':''}</span>`,attrs:{role:'menuitemradio','aria-checked':value===mode,tabindex:-1,'aria-label':text,title:text,'data-period-option':value}});

 const {start,end}=host._status==='ready'&&Number.isFinite(host._viewStart)&&Number.isFinite(host._viewEnd)?{start:host._viewStart,end:host._viewEnd}:graphPeriodRange(host);
 const locale=nl?'nl-NL':'en-GB',zone=host._hass?.config?.time_zone||'UTC';
 const zoomed=host._status==='ready'&&(start>host._start+1||end<host._end-1);
 const compactName=compactPeriodName({start,end,mode,past,zoomed,hours:host._periodHours??host._config.hours_to_show,name,locale,zone});
 const format=new Intl.DateTimeFormat(locale,{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
 const range=`${format.format(start)} – ${format.format(end)}`;
 const customRange=graphPeriodRange(host),draft=host._periodCustomDraft??{start:periodDateTime(customRange.start,zone),end:periodDateTime(customRange.end,zone)};
 const canGoNext=mode==='custom'?host._periodEnd!=null&&customRange.end<Date.now():past;
 const custom=`<form data-custom-range><div class="period-custom-fields">${[['start',label('Start','Begin')],['end',label('End','Einde')]].map(([key,text])=>`<label>${text}<input type="datetime-local" name="${key}" data-custom-field="${key}" value="${periodEscape(draft[key])}" step="60" required></label>`).join('')}</div><p class="period-custom-zone">${periodEscape(zone)}</p><p class="period-custom-error" role="alert"${draft.error?'':' hidden'}>${periodEscape(draft.error??'')}</p>${uiButton({variant:'surface',type:'submit',text:label('Apply','Toepassen'),attrs:{'data-custom-field':'apply'}})}</form>`;
 const contents=uiTabs({id:'eleven-period',label:label('Period type','Soort tijdvak'),selected:selectedTab,className:'period-tabs',panelClassName:'period-panel',items:[
  {value:'rolling',label:label('Last','Afgelopen'),content:`<div class="period-options" role="menu" aria-label="${label('Last','Afgelopen')}">${rolling.map(choice).join('')}</div>`},
  {value:'calendar',label:label('Calendar','Kalender'),content:`<div class="period-options period-calendar" role="menu" aria-label="${label('Calendar','Kalender')}">${calendar.map(([id,text])=>choice([id,text])).join('')}</div>`},
  {value:'custom',label:label('Custom range','Eigen bereik'),content:custom,className:'period-custom'}
 ].map(item=>({...item,tabAttrs:{'data-period-tab':item.value},panelAttrs:{'data-period-panel':item.value}}))});
 const popup=uiPopup({id:'eleven-period-menu',className:'period-menu',title:label('Timeframe','Tijdvak'),label:label('Choose a period','Kies een periode'),closeLabel:label('Close','Sluiten'),closeAttrs:{'data-period':'close'},content:`<div class="period-current-range">${periodEscape(range)}${zoomed?`<span class="zoom-status">${label('Zoomed in','Ingezoomd')}</span>`:''}</div><div class="period-default" role="menu" aria-label="${label('Default','Standaard')}">${choice(['configured',standard])}</div>${contents}`});
 const trigger=uiButton({className:'period-trigger',content:`<span>${periodEscape(compactName)}</span>${cardHeaderIcon('down')}`,attrs:{'data-period':'menu','aria-haspopup':'dialog','aria-controls':'eleven-period-menu','aria-expanded':host._periodMenuOpen===true,title:range,'aria-label':label('Timeframe','Tijdvak')+': '+compactName,'aria-description':range+(zoomed?'. '+label('Zoomed in','Ingezoomd'):'')}});
 const navigation=[['previous',label('Previous period','Vorige periode')],['now',label('Return to the current period','Terug naar de huidige periode')],['next',label('Next period','Volgende periode')]].map(([key,title])=>uiButton({text:key==='now'?label('Now','Nu'):'',content:key==='now'?undefined:cardHeaderIcon(key),disabled:key==='next'&&!canGoNext,title,label:title,attrs:{'data-period':key}})).join('');
 return {picker:`<div class="period-controls">${trigger}${popup}</div>`,navigation};

}
function restorePeriodFocus(host,items=[]){
 const key=host._periodFocus;if(!key)return;const root=host.shadowRoot;
 const target=key.startsWith('tab:')?root.querySelector(host._periodMenuOpen?'[data-period-tab="'+key.slice(4)+'"]':'[data-period="menu"]'):key.startsWith('custom:')&&host._periodMenuOpen?root.querySelector('[data-custom-field="'+key.slice(7)+'"]'):key==='history'?root.querySelector('.history-link'):key.startsWith('zoom:')?root.querySelector('[data-zoom="'+key.slice(5)+'"]'):key.startsWith('option:')&&host._periodMenuOpen?items.find(item=>item.dataset.periodOption===key.slice(7)):root.querySelector('[data-period="'+(key.startsWith('option:')?'menu':key)+'"]');
 (target?.disabled?root.querySelector('[data-period="now"], [data-zoom="in"]:not(:disabled), .history-link'):target)?.focus?.({preventScroll:true});host._periodFocus=null;
}
function disconnectPeriodControls(host,preserveState=false){host._periodMenuCleanup?.();host._periodMenuCleanup=null;if(!preserveState)host._periodMenuPending=false;}
function bindPeriodControls(host){
 disconnectPeriodControls(host,true);
 const root=host.shadowRoot,nav=root.querySelector('.period-controls');if(!nav){restorePeriodFocus(host);return;}
 const menu=nav.querySelector('.period-menu'),trigger=nav.querySelector('[data-period="menu"]'),items=[...menu.querySelectorAll('[data-period-option]')];
 const nl=(host._hass?.language??'en').startsWith('nl'),label=(en,nlText)=>nl?nlText:en;
 const form=menu.querySelector('form[data-custom-range]'),tabs=[...menu.querySelectorAll('[data-period-tab]')],panels=[...menu.querySelectorAll('[data-period-panel]')];
 const visibleItems=()=>items.filter(item=>!item.closest?.('[data-period-panel]')?.hidden);
 const updateOptionFocus=()=>{
  const visible=visibleItems();for(const item of items)item.tabIndex=-1;
  const standard=visible.find(item=>item.dataset.periodOption==='configured');if(standard)standard.tabIndex=0;
  const options=visible.filter(item=>item!==standard),selected=options.find(item=>item.getAttribute('aria-checked')==='true')??options[0];if(selected)selected.tabIndex=0;
 };
 updateOptionFocus();
 const cleanups=[];
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 host._periodMenuCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 let scrollPending=false;
 const controller=bindUIPopup({trigger,popup:menu,container:nav,ready:root.querySelector('ha-card')?.updateComplete,
  isRequested:()=>host._periodMenuOpen,isCurrent:()=>root.querySelector('.period-menu')===menu,
  beforeOpen:()=>closeOtherCardPopups(host,'period'),
  onOpen:focus=>{host._periodMenuOpen=true;host._periodMenuPending=true;scrollPending=!focus;},
  onClose:()=>{host._periodMenuOpen=false;host._periodMenuPending=false;},
  onToggle:open=>{host._periodMenuOpen=open;},
  focusTarget:()=>visibleItems().find(item=>item.getAttribute('aria-checked')==='true')??tabs.find(tab=>tab.getAttribute('aria-selected')==='true')??items[0],
  onShown:()=>{host._periodMenuPending=false;restorePeriodFocus(host,items);if(scrollPending){menu.scrollTop=host._periodMenuScroll??0;scrollPending=false;}}
 });
 const {open,close,position}=controller;cleanups.push(()=>controller.disconnect());
 trigger.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();if(e.key==='ArrowUp')visibleItems().at(-1)?.focus({preventScroll:true});}};
 for(const item of items)item.onclick=()=>{close(true);chooseGraphPeriod(host,item.dataset.periodOption);};
 const tabController=bindUITabs({tabs,panels,onSelect:value=>{
  host._periodTab=value;updateOptionFocus();host._periodMenuScroll=0;menu.scrollTop=0;position();
 }});cleanups.push(()=>tabController.disconnect());
 if(form?.tagName==='FORM'){
  const fields=Object.fromEntries(['start','end'].map(key=>[key,form.elements.namedItem(key)]));
  const readDraft=()=>host._periodCustomDraft={start:fields.start.value,end:fields.end.value};
  listen(form,'input',()=>{readDraft();const error=form.querySelector('.period-custom-error');error.hidden=true;error.textContent='';});
  listen(form,'submit',e=>{
   e.preventDefault();const draft=readDraft(),zone=host._hass?.config?.time_zone||'UTC',previous=graphPeriodRange(host);
   const start=parsePeriodDateTime(draft.start,zone,'start',previous.start),end=parsePeriodDateTime(draft.end,zone,'end',previous.end);
   let message;
   if(!Number.isFinite(start)||!Number.isFinite(end))message=label('Choose valid dates and times in the displayed timezone.','Kies geldige datums en tijden in de getoonde tijdzone.');
   else if(end<=start)message=label('End must be after start.','Einde moet na begin liggen.');
   else if(end-start>366*86400000)message=label('Choose a range of at most 366 days.','Kies een bereik van maximaal 366 dagen.');
   if(message){draft.error=message;const error=form.querySelector('.period-custom-error');error.textContent=message;error.hidden=false;position();return;}
   close(true);chooseCustomGraphPeriod(host,start,end);
  });
 }
 menu.onkeydown=e=>{
  if(e.target?.closest?.('.period-custom, .period-tabs'))return;
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   const visible=visibleItems();if(!visible.length)return;e.preventDefault();const index=visible.indexOf(host.shadowRoot.activeElement),next=e.key==='Home'?0:e.key==='End'?visible.length-1:index<0?(e.key==='ArrowUp'?visible.length-1:0):(index+(e.key==='ArrowDown'?1:-1)+visible.length)%visible.length;
   visible[next].focus();
  }
 };
 for(const [key,direction]of [['previous',-1],['next',1],['now',0]])root.querySelector(`[data-period="${key}"]`).onclick=()=>{close();moveGraphPeriod(host,direction);};
 if(host._periodMenuOpen)open(false);
 if(!host._periodMenuPending)restorePeriodFocus(host,items);
}
function periodControlsStyles(){return uiTabsStyles()+`
.period-controls{display:flex;min-width:0;max-width:100%;flex:0 1 auto}
.header-actions .period-trigger{width:auto;min-width:0;max-width:100%;flex:0 1 auto;gap:6px;padding:4px 10px;border:0;border-radius:4px;background:transparent;font-weight:400}
.header-actions .period-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-trigger span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.period-current-range{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;margin:2px 0 10px}
.period-current-range .zoom-status{display:table;margin-top:4px}
.period-tabs{margin:10px 0 0}
.period-panel{padding-top:12px}
.period-options{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-bottom:4px}
.period-options button{position:relative;justify-content:center;padding:7px 3px;gap:0;min-width:0;white-space:nowrap}
.period-options button>span:last-child{position:absolute;inset-inline-end:2px;top:1px;font-size:9px;line-height:1}
.period-calendar{grid-template-columns:repeat(3,minmax(0,1fr))}
.period-custom-fields{display:grid;gap:10px}
.period-custom-fields label{display:grid;gap:4px;font-size:12px}
.period-custom input{box-sizing:border-box;width:100%;min-width:0;padding:8px;border:1px solid var(--divider-color,#ddd);border-radius:5px;font:inherit;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));color-scheme:inherit}
.period-custom input:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-1px}
.period-custom p{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);margin:8px 0;overflow-wrap:anywhere}
.period-custom .period-custom-error{color:var(--error-color,#db4437)}
.period-custom button[type="submit"]{justify-content:center;margin-top:10px}
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
function toggleChartIsolation(host,id){
 if(!host._config.entities.includes(id))return;
 cancelUILegendClicks(host);
 const only=host._config.entities.every((entity,i)=>host._isSeriesVisible(i)===(entity===id));
 only?showAllChartSeries(host):isolateChartSeries(host,id);
 focusUILegend(host,id,'[data-series]',button=>button.dataset.series);
}
function bindChartLegend(host){
 const nl=host._insightLanguage==='nl',hint=nl?'Dubbelklik of Shift+Enter: alleen deze sensor. Herhaal om alles te tonen.':'Double-click or Shift+Enter: show only this sensor. Repeat to show all.';
 bindUILegend(host,{selector:'[data-series]',getId:button=>button.dataset.series,hint,toggle:host._toggleSeries?id=>host._toggleSeries(id):null,isolate:id=>toggleChartIsolation(host,id)});
}
function insightControl(host,key,label,body,icon=''){
 const trigger=uiButton({className:'insight-trigger',content:icon+(key==='data'?'':`<span>${insightEscape(label)}</span>`),attrs:{'data-insight':key,title:label,'aria-label':label,'aria-haspopup':'dialog','aria-expanded':host._insightOpen===key,'aria-controls':'insight-'+key}});
 return `<div class="insight-control">${trigger}${uiPopup({id:'insight-'+key,className:'insight-popup',attrs:{'data-insight-panel':key},title:label,closeLabel:host._insightLanguage==='nl'?'Sluiten':'Close',closeAttrs:{'data-insight-close':''},content:body})}</div>`;
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
   const color=host._insightColor?.(i,row)??'var(--primary-color,#2196f3)';
   return `<section class="insight-sensor" data-information-entity="${insightEscape(item.id)}"><div class="insight-sensor-heading"><i class="insight-color" style="--insight-color:${insightEscape(color)}" aria-hidden="true"></i><strong>${insightEscape(item.name)}</strong><span class="insight-source">${sourceLabel}${unit?` <span class="insight-unit">· ${insightEscape(unit)}</span>`:''}</span></div>${metrics}${states.length?`<div class="insight-states" role="status">${states.join(' · ')}</div>`:''}</section>`;
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
function disconnectChartInsights(host,keepLegendClicks=false){if(!keepLegendClicks){cancelUILegendClicks(host);host._insightPending=null;}host._insightCleanup?.();host._insightCleanup=null;}
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
  const trigger=control.querySelector('[data-insight]'),popup=control.querySelector('.insight-popup'),key=trigger.dataset.insight;
  const controller=bindUIPopup({trigger,popup,container:control,ready:root.querySelector('ha-card')?.updateComplete,
   isRequested:()=>host._insightOpen===key,isCurrent:()=>root.querySelector(`[data-insight-panel="${key}"]`)===popup,
   beforeOpen:()=>closeOtherCardPopups(host,'insight'),
   onOpen:()=>{host._insightOpen=key;host._insightPending=key;},
   onClose:()=>{if(host._insightOpen===key)host._insightOpen=null;host._insightPending=null;},
   onToggle:open=>{if(!open&&host._insightOpen===key)host._insightOpen=null;},
   onShown:()=>{host._insightPending=null;restoreChartInsightFocus(host);},closeWhenAnchorHidden:true
  });
  const {open,close}=controller;cleanups.push(()=>controller.disconnect());
  for(const button of popup.querySelectorAll('[data-isolate]'))button.onclick=()=>{close(true);isolateChartSeries(host,button.dataset.isolate);};
  const all=popup.querySelector('[data-show-all]');if(all)all.onclick=()=>{close(true);showAllChartSeries(host);};
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
.insight-trigger svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.header-actions .insight-trigger{width:32px;height:32px;padding:0;background:transparent;border-radius:4px}
.header-actions .insight-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.header-actions .insight-trigger svg{width:18px;height:18px;stroke-width:2}
.insight-popup{z-index:21}
.insight-popup p{margin:8px 0 12px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-popup p strong{color:var(--primary-text-color,#20252b);font-weight:500}
.insight-popup .insight-choice{display:block;width:100%;padding:6px 8px;text-align:start;overflow-wrap:anywhere}
.insight-choice[aria-pressed="true"]{background:var(--secondary-background-color,#eee);font-weight:600}
.insight-sensors{display:grid}
.insight-sensor{min-width:0;padding:8px 0}
.insight-sensor+.insight-sensor{border-top:1px solid var(--divider-color,#ddd)}
.insight-sensor-heading{display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px}
.insight-color{display:block;width:7px;height:7px;flex:none;border-radius:2px;background:var(--insight-color,var(--primary-color,#2196f3))}
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



const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function numeric(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim()))) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function heatmapRgb(color) {
  if(typeof color==='string' && /^#[\da-f]{6}$/i.test(color))return [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  return Array.isArray(color) && color.length===3 && [...color].every(n=>Number.isInteger(n) && n>=0 && n<=255)?[...color]:null;
}

function normalizeConfig(input = {}, {draft = false} = {}) {
  const c = {...input,...timeframeSyncConfig(input,{draft}), type:'custom:eleven-heatmap-card', title:input.title ?? 'Heatmap',
    entity:input.entity ?? '', name:String(input.name ?? ''), hours_to_show:input.hours_to_show ?? 672,
    mode:input.mode ?? 'average', aggregation_period:input.aggregation_period??'hour', show_navigation:input.show_navigation !== false,
    show_title:input.show_title!==false,show_legend:input.show_legend!==false,show_labels:input.show_labels!==false,
    cell_width:input.cell_width??24,cell_height:input.cell_height??24,cell_gap:input.cell_gap??2,border_radius:input.border_radius??3,max_height:input.max_height??800,
    color_mode:input.color_mode??(input.gradient_stops?.length?'gradient':'scale'),gradient_mode:input.gradient_mode??'smooth',
    low_color:input.low_color ?? '#dbeafe', high_color:input.high_color ?? '#1d4ed8'};
  // Native number selectors emit undefined while their input is cleared.
  // Distinguish that draft from a missing field in a new configuration.
  if(draft)for(const key of ['hours_to_show','cell_width','cell_height','cell_gap','border_radius','max_height']){
    if(Object.hasOwn(input,key) && input[key]===undefined)c[key]=undefined;
  }
  if (!draft && !/^sensor\.[a-z0-9_]+$/.test(c.entity)) throw Error('Select one sensor. / Kies één sensor.');
  if (!draft && (!Number.isFinite(c.hours_to_show) || c.hours_to_show < 1 || c.hours_to_show > 8760)) throw Error('Period must be 1–8760 hours. / Periode moet 1–8760 uur zijn.');
  if (!draft && !['average','consumption'].includes(c.mode)) throw Error('Mode must be average or consumption. / Kies gemiddelde of verbruik.');
  if (!draft && !['hour','day','week','month'].includes(c.aggregation_period)) throw Error('Choose hour, day, week or month. / Kies uur, dag, week of maand.');
  for (const key of ['scale_min','scale_max']) {
    if (c[key] == null || c[key] === '') delete c[key];
    else if (numeric(c[key]) != null) c[key] = numeric(c[key]);
    else if(!draft)throw Error('Color bounds must be numbers. / Kleurgrenzen moeten getallen zijn.');
  }
  if (!draft && c.scale_min != null && c.scale_max != null && c.scale_min >= c.scale_max) throw Error('Minimum must be below maximum. / Minimum moet kleiner zijn dan maximum.');
  for (const key of ['low_color','high_color']) {
    const color=c[key];
    const rgb=heatmapRgb(color);
    if(rgb)c[key]=rgb;
    else if(!draft)throw Error('Use RGB colors or six-digit hex colors. / Gebruik RGB-kleuren of hexkleuren met zes cijfers.');
  }
  for(const [key,min,max] of [['cell_width',6,64],['cell_height',16,64],['cell_gap',0,8],['border_radius',0,16],['max_height',100,2000]]){
    if(!draft && (!Number.isInteger(c[key]) || c[key]<min || c[key]>max))throw Error(`${key}: ${min}–${max} px.`);
  }
  if(!draft && !['scale','gradient'].includes(c.color_mode))throw Error('Choose a color scale or color stops. / Kies een kleurschaal of kleurovergangen.');
  if(!draft && !['smooth','steps'].includes(c.gradient_mode))throw Error('Choose smooth or hard transitions. / Kies vloeiende of harde overgangen.');
  const stops=input.gradient_stops??[];
  if(!draft && (!Array.isArray(stops) || (stops.length>0 && stops.length<2) || stops.length>32 ||
    [...stops].some(s=>!s || !Number.isFinite(s.value) || !heatmapRgb(s.color)) || new Set(stops.map(s=>s.value)).size!==stops.length ||
    (c.color_mode==='gradient' && stops.length<2)))throw Error('Set 2–32 distinct sensor values and colors. / Stel 2–32 unieke sensorwaarden met kleuren in.');
  c.gradient_stops=Array.isArray(stops)?stops.map(s=>({...s,color:heatmapRgb(s?.color)??s?.color})):stops;
  if(!draft)c.gradient_stops.sort((a,b)=>a.value-b.value);
  return c;
}

const time = value => typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);

async function loadHeatmapData(hass, config, start, end) {
  const id = config.entity, unit = hass.states?.[id]?.attributes?.unit_of_measurement ?? '';
  let statisticsFailed = false;
  try {
    const metadata = await hass.callWS({type:'recorder/get_statistics_metadata', statistic_ids:[id]});
    const meta = metadata.find(row => row.statistic_id === id);
    const supported = config.mode === 'consumption' ? meta?.has_sum === true : meta?.mean_type!=null ? meta.mean_type===1 : meta?.has_mean===true;
    // Recorder returns statistics converted to its display unit, which can
    // differ from the unit stored in the database (for example Wh versus kWh).
    const statisticsUnit=meta && Object.hasOwn(meta,'display_unit_of_measurement') ? meta.display_unit_of_measurement ?? '' : meta?.statistics_unit_of_measurement ?? meta?.unit_of_measurement ?? '';
    if (!supported || statisticsUnit !== unit) throw Error('statistics_unavailable');
    const field = config.mode === 'consumption' ? 'change' : 'mean';
    // The API filters by interval start. Include the boundary hour so rolling
    // periods retain its complete summary and can mark it as clipped below.
    const statisticsStart=Math.floor(start/3600000)*3600000;
    const result = await hass.callWS({type:'recorder/statistics_during_period', statistic_ids:[id], start_time:new Date(statisticsStart).toISOString(), end_time:new Date(end).toISOString(), period:'hour', types:[field]});
    // Recorder returns {} when a supported sensor has no rows in this period.
    const records=result && typeof result==='object' && !Array.isArray(result) && !Object.keys(result).length ? [] : result?.[id];
    if (!Array.isArray(records)) throw Error('statistics_load_failed');
    const intervals = records.map(row => ({start:time(row.start), end:time(row.end), value:typeof row[field] === 'number' ? numeric(row[field]) : null}))
      .filter(row => Number.isFinite(row.start) && Number.isFinite(row.end) && row.end > row.start && row.start < end && row.end > start)
      .sort((a,b) => a.start-b.start);
    if (intervals.some(row => row.value != null) || config.mode === 'consumption') return {source:'statistics', unit, intervals};
  } catch (error) {
    statisticsFailed = true;
    if(config.mode==='consumption' && error.message!=='statistics_unavailable')throw Error('statistics_load_failed');
  }
  if (config.mode === 'consumption') throw Error('consumption_statistics_required');
  const url = `history/period/${new Date(start).toISOString()}?filter_entity_id=${encodeURIComponent(id)}&end_time=${encodeURIComponent(new Date(end).toISOString())}&significant_changes_only=0`;
  const response = await hass.callApi('GET', url);
  if (!Array.isArray(response) || response.some(rows => !Array.isArray(rows))) throw Error('history_unavailable');
  const rows = (response.find(rows => rows[0]?.entity_id === id) ?? []).map(row => ({t:Date.parse(row.last_updated ?? row.last_changed), value:(row.attributes?.unit_of_measurement ?? '') === unit ? numeric(row.state) : null}))
    .filter(row => Number.isFinite(row.t) && row.t <= end).sort((a,b) => a.t-b.t);
  const intervals = rows.map((row,i) => ({start:Math.max(start,row.t), end:Math.min(end,rows[i+1]?.t ?? end), value:row.value})).filter(row => row.end > row.start);
  return {source:'history', unit, intervals, statisticsFailed};
}

// Split on local clock hours AND offset transitions (including half-hour DST).
// Repeated hours share a cell; their real intervals remain available in details.
function clockGrid(start, end, zone = 'UTC') {
  const formatter = new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const parts = t => Object.fromEntries(formatter.formatToParts(t).filter(p => p.type !== 'literal').map(p => [p.type,Number(p.value)]));
  const offset = t => {const p=parts(t); return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-Math.floor(t/1000)*1000;};
  const rows = new Map();
  for (let t=start; t<end;) {
    const p=parts(t), key=`${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
    if (!rows.has(key)) rows.set(key,{key, timestamp:t, cells:Array.from({length:24},(_,hour)=>({key:`${key}/${hour}`,hour,intervals:[],value:null,coverage:0,partial:false,records:[]}))});
    let next=Math.min(end,t+3600000-p.minute*60000-p.second*1000-(t%1000));
    const currentOffset=offset(t);
    if (offset(next-1)!==currentOffset) {
      let a=t,b=next;
      while (b-a>1) {const mid=Math.floor((a+b)/2); if(offset(mid)===currentOffset)a=mid;else b=mid;}
      next=b;
    }
    rows.get(key).cells[p.hour].intervals.push({start:t,end:next});
    t=next;
  }
  return [...rows.values()];
}

function heatmapColumns(period='hour',locale='en-GB') {
  if(period==='day')return Array.from({length:7},(_,i)=>new Intl.DateTimeFormat(locale,{timeZone:'UTC',weekday:'short'}).format(Date.UTC(2026,0,5+i)));
  if(period==='week')return Array.from({length:53},(_,i)=>`W${String(i+1).padStart(2,'0')}`);
  if(period==='month')return Array.from({length:12},(_,i)=>new Intl.DateTimeFormat(locale,{timeZone:'UTC',month:'short'}).format(Date.UTC(2026,i,15)));
  return Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));
}

function calendarPlacement(t,period,zone,parts) {
  const [a,b]=graphPeriodBounds(t,period,zone),p=parts(a);
  if(period==='day'){
    const monday=graphPeriodBounds(a,'week',zone)[0],m=parts(monday);
    return {a,b,rowKey:`${m.year}-${String(m.month).padStart(2,'0')}-${String(m.day).padStart(2,'0')}`,timestamp:monday,column:(new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay()+6)%7};
  }
  if(period==='month')return {a,b,rowKey:String(p.year),timestamp:a,column:p.month-1};
  // ISO weeks belong to the year of their Thursday, including December/January.
  const monday=Date.UTC(p.year,p.month-1,p.day),year=new Date(monday+3*86400000).getUTCFullYear(),jan4=Date.UTC(year,0,4);
  const firstMonday=jan4-((new Date(jan4).getUTCDay()+6)%7)*86400000;
  return {a,b,rowKey:String(year),timestamp:a,column:Math.round((monday-firstMonday)/(7*86400000))};
}

function calendarGrid(start,end,zone='UTC',period='day') {
  const format=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  const parts=t=>Object.fromEntries(format.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const rows=new Map(),count={day:7,week:53,month:12}[period];
  for(let t=start;t<end;){
    const placement=calendarPlacement(t,period,zone,parts),{a,b,rowKey,timestamp,column}=placement;
    if(!rows.has(rowKey))rows.set(rowKey,{key:rowKey,timestamp,cells:Array.from({length:count},(_,column)=>({key:`${rowKey}/${column}`,rowKey,column,period,intervals:[],value:null,coverage:0,partial:false,records:[]}))});
    const cell=rows.get(rowKey).cells[column];
    cell.timestamp=a;cell.periodEnd=b;cell.clipped=a<start || b>end;
    cell.intervals.push({start:Math.max(start,a),end:Math.min(end,b)});
    t=b;
  }
  return [...rows.values()];
}

function buildHeatmap(data, start, end, zone='UTC', mode='average', period='hour') {
  const rows=period==='hour'?clockGrid(start,end,zone):calendarGrid(start,end,zone,period), cells=rows.flatMap(row=>row.cells);
  if (data.source === 'statistics') {
    // Never invent sub-hour consumption by prorating Recorder summaries.
    // Each summary belongs to the local grouping period in which it starts.
    const format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
    const parts=t=>Object.fromEntries(format.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    const byKey=new Map(cells.map(cell=>[cell.key,cell]));
    for (const record of data.intervals) {
      if(record.start>=end || record.end<=start || record.value==null)continue;
      const p=parts(record.start),placement=period==='hour'?null:calendarPlacement(record.start,period,zone,parts);
      const cell=byKey.get(placement?`${placement.rowKey}/${placement.column}`:`${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}/${p.hour}`);
      if (!cell || !cell.intervals.length) continue;
      cell.records.push(record);
      const duration=record.end-record.start;
      cell.value=(cell.value??0)+(mode==='consumption'?record.value:record.value*duration);
      cell.coverage+=duration;
      cell.partial ||= record.start<start || record.end>end;
    }
  } else {
    let index=0;
    for (const row of rows) {
      // On a repeated hour, process by absolute time, not column order.
      const spans=row.cells.flatMap(cell=>cell.intervals.map(interval=>({...interval,cell}))).sort((a,b)=>a.start-b.start);
      for (const {start:a,end:b,cell} of spans) {
        while(index<data.intervals.length && data.intervals[index].end<=a)index++;
        for(let i=index;i<data.intervals.length && data.intervals[i].start<b;i++) {
          const record=data.intervals[i],duration=Math.min(b,record.end)-Math.max(a,record.start);
          if(duration<=0 || record.value==null)continue;
          cell.value=(cell.value??0)+record.value*duration;
          cell.coverage+=duration;
        }
      }
    }
  }
  for (const cell of cells) {
    if(cell.value!=null && mode==='average') cell.value/=cell.coverage;
    const expected=cell.intervals.reduce((sum,r)=>sum+r.end-r.start,0);
    cell.partial ||= cell.value!=null && cell.coverage<expected-1;
    if(cell.clipped || (period==='hour' && data.source==='history' && expected>0 && expected%3600000!==0)) cell.partial ||= cell.value!=null;
  }
  return rows;
}

function colorScale(rows, config) {
  const custom=config.color_mode==='gradient',stops=config.gradient_stops;
  if(custom){
    const min=stops[0].value,max=stops.at(-1).value;
    const color=value=>{
      if(value<=min)return `rgb(${stops[0].color.join(',')})`;
      for(let i=1;i<stops.length;i++)if(value<stops[i].value){
        const a=stops[i-1],b=stops[i],ratio=config.gradient_mode==='steps'?0:(value-a.value)/(b.value-a.value);
        return `rgb(${a.color.map((n,j)=>Math.round(n+(b.color[j]-n)*ratio)).join(',')})`;
      }
      return `rgb(${stops.at(-1).color.join(',')})`;
    };
    const positions=[];
    for(let i=0;i<stops.length;i++){
      const percent=(stops[i].value-min)/(max-min)*100;
      if(config.gradient_mode==='steps' && i)positions.push(`rgb(${stops[i-1].color.join(',')}) ${percent}%`);
      positions.push(`rgb(${stops[i].color.join(',')}) ${percent}%`);
    }
    return {min,max,color,gradient:`linear-gradient(90deg,${positions.join(',')})`};
  }
  const values=rows.flatMap(row=>row.cells).map(cell=>cell.value).filter(value=>value!=null);
  let min=config.scale_min ?? (values.length?Math.min(...values):0), max=config.scale_max ?? (values.length?Math.max(...values):1);
  if(config.scale_min!=null && max<min)max=min;
  if(config.scale_max!=null && min>max)min=max;
  return {min,max,gradient:`linear-gradient(90deg,rgb(${config.low_color.join(',')}),rgb(${config.high_color.join(',')}))`,color(value){
    const ratio=max===min?(value<min?0:value>max?1:0.5):Math.max(0,Math.min(1,(value-min)/(max-min)));
    const a=config.low_color,b=config.high_color;
    return `rgb(${a.map((n,i)=>Math.round(n+(b[i]-n)*ratio)).join(',')})`;
  }};
}

// Summaries describe the displayed cells, like the Bar Chart information popup.
function summarizeHeatmap(rows, mode) {
  const cells=rows.flatMap(row=>row.cells),known=cells.filter(cell=>Number.isFinite(cell.value));
  const values=known.map(cell=>cell.value),sum=values.reduce((total,value)=>total+value,0);
  return {minimum:values.length?Math.min(...values):null,maximum:values.length?Math.max(...values):null,
    average:values.length?sum/values.length:null,count:values.length,
    missing:cells.some(cell=>cell.partial || (cell.intervals.length && cell.value==null)),
    ...(mode==='consumption'?{total:values.length?sum:null}:{})};
}









const esc=escapeHtml;
const isDutch=hass=>String(hass?.locale?.language ?? hass?.language ?? 'en').startsWith('nl');
const labels={sync_timeframe:['Tijdvak synchroniseren','Synchronize timeframe'],hover_sync_group:['Synchronisatiegroep','Synchronization group'],
  title:['Titel','Title'],entity:['Sensor','Sensor'],name:['Sensornaam','Sensor name'],hours_to_show:['Aantal uren','Hours to show'],mode:['Waarde per tijdvak','Value per interval'],aggregation_period:['Aggregatieperiode','Aggregation period'],
  show_title:['Titel tonen','Show title'],show_legend:['Legenda tonen','Show legend'],show_labels:['Rij- en kolomlabels tonen','Show row and column labels'],show_navigation:['Tijdvakselectie tonen','Show timeframe selection'],
  graph_settings:['Grafiek','Graph'],data_processing:['Dataverwerking','Data processing'],color_settings:['Kleuren','Colors'],matrix_settings:['Rasteropmaak','Grid appearance'],
  scale_min:['Minimum kleurschaal','Color scale minimum'],scale_max:['Maximum kleurschaal','Color scale maximum'],
  low_color:['Kleur lage waarden','Low value color'],high_color:['Kleur hoge waarden','High value color'],
  color_mode:['Kleurmodus','Color mode'],gradient_mode:['Kleurovergang','Color transitions'],gradient_stops:['Kleurovergangen','Color stops'],
  cell_width:['Minimale vakbreedte','Minimum cell width'],cell_height:['Vakhoogte','Cell height'],cell_gap:['Tussenruimte','Cell gap'],border_radius:['Hoekafronding','Border radius'],max_height:['Maximale rasterhoogte','Maximum grid height']
};
const helpers={sync_timeframe:['Deelt tijdvakkeuze en vorige/volgende/Nu met ingeschakelde kaarten in dezelfde groep.','Shares timeframe selection and previous/next/Now with enabled cards in the same group.'],hover_sync_group:['Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.','Cards with the same group share hover and timeframe when the corresponding synchronization is enabled. Empty uses the default group.'],
  hours_to_show:['Standaardperiode: 1–8760 uur. De tijdvakselectie kan deze tijdelijk wijzigen.','Default range: 1–8760 hours. The timeframe menu can change it temporarily.'],
  mode:['Gemiddelde weegt waarden naar hun duur. Verbruik telt de uurwijzigingen uit tellerstatistieken op, inclusief tellerresets.','Average weights values by their duration. Consumption sums hourly counter changes from statistics, including counter resets.'],
  aggregation_period:['Uren per dag, dagen per week, weken per ISO-jaar of maanden per jaar. Kalendergrenzen volgen de Home Assistant-tijdzone; weken beginnen op maandag.','Hours per day, days per week, weeks per ISO year or months per year. Calendar boundaries follow the Home Assistant timezone; weeks start on Monday.'],
  scale_min:['Optioneel, in de sensoreenheid. Leeg schaalt automatisch.','Optional, in the sensor unit. Empty scales automatically.'],
  scale_max:['Optioneel, in de sensoreenheid. Moet hoger zijn dan het minimum.','Optional, in the sensor unit. Must exceed the minimum.'],
  color_mode:['De kleurschaal volgt het waardenbereik. Kleurovergangen gebruiken vaste sensorwaarden en blijven tussen perioden vergelijkbaar.','The color scale follows the value range. Color stops use fixed sensor values and remain comparable across periods.'],
  gradient_stops:['Stel 2–32 unieke waarden in de sensoreenheid in, geen percentages. Pas de beginwaarden aan je sensor aan.','Set 2–32 distinct values in the sensor unit, not percentages. Adjust the initial values to your sensor.'],
  cell_width:['Minimale breedte in pixels. Kleinere vakken en minder tussenruimte passen meer kolommen op smalle kaarten.','Minimum width in pixels. Smaller cells and gaps fit more columns on narrow cards.'],
  max_height:['Grotere rasters scrollen binnen de kaart.','Larger grids scroll within the card.']
};

class HeatmapEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});}
  setConfig(config){this._config=normalizeConfig(config,{draft:true});this._render();}
  set hass(hass){this._hass=hass;this._render();}
  get hass(){return this._hass;}
  connectedCallback(){this._render();}
  _render(){
    if(!this._config || !this._hass)return;
    if(!this._form){
      this.shadowRoot.innerHTML='<style>:host{display:block;min-width:0}ha-form{display:block;min-width:0}.error{color:var(--error-color,#db4437);font-size:14px;overflow-wrap:anywhere}.error[hidden]{display:none}</style><ha-form></ha-form><p class="error" role="alert" hidden></p>';
      this._form=this.shadowRoot.querySelector('ha-form');
      this._form.addEventListener('value-changed',event=>{
        event.stopPropagation();
        const next={...this._config,...event.detail.value};
        if(next.color_mode==='gradient' && this._config.color_mode!=='gradient' && !next.gradient_stops?.length){
          const low=numeric(next.scale_min)??((numeric(next.scale_max)??1)-1),upper=numeric(next.scale_max),high=upper!=null&&upper>low?upper:low+1;
          next.gradient_stops=[{value:low,color:[...this._config.low_color]},{value:high,color:[...this._config.high_color]}];
        }
        // Preserve incomplete edits. Runtime validation protects the card while
        // the native form retains its focus, expansion state and entered values.
        this._config=normalizeConfig(next,{draft:true});
        this._render();
        this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...this._config}},bubbles:true,composed:true}));
      });
    }
    const dutch=isDutch(this._hass),definition=HeatmapCard.getConfigForm(this._config,dutch);
    this._form.hass=this._hass;
    this._form.data=this._config;
    this._form.schema=definition.schema;
    this._form.computeLabel=s=>definition.computeLabel.call(this,s);
    this._form.computeHelper=s=>definition.computeHelper.call(this,s);
    const error=this.shadowRoot.querySelector('.error');
    try{if(this._config.entity)normalizeConfig(this._config);error.hidden=true;error.textContent='';}
    catch(problem){error.textContent=problem.message.split(' / ')[dutch?1:0]??problem.message;error.hidden=false;}
  }
}

class HeatmapCard extends HTMLElement {
  constructor(){
    super();this.attachShadow({mode:'open'});
    this._generation=0;this._connected=false;this._status='loading';this._data=null;this._rows=[];this._timer=null;this._promise=null;
  }
  static getConfigForm(config={},dutch=isDutch(globalThis.document?.querySelector('home-assistant')?.hass)){
    const data=normalizeConfig(config,{draft:true}),label=key=>labels[key]?.[dutch?0:1]??key;
    const select=options=>({select:{mode:'dropdown',options:options.map(([value,nl,en])=>({value,label:dutch?nl:en}))}});
    const group=(name,schema,expanded=false)=>({type:'expandable',name,title:label(name),flatten:true,expanded,schema});
    const number=(name,min,max)=>({name,default:{cell_width:24,cell_height:24,cell_gap:2,border_radius:3,max_height:800}[name],selector:{number:{min,max,step:1,mode:'box',unit_of_measurement:'px'}}});
    const stops={object:{multiple:true,label_field:'value',fields:{
      value:{label:dutch?'Sensorwaarde':'Sensor value',required:true,selector:{number:{step:'any',mode:'box'}}},
      color:{label:dutch?'Kleur':'Color',required:true,selector:{color_rgb:{}}}
    }}};
    return {schema:[
      {name:'entity',required:true,selector:{entity:{domain:'sensor'}}},
      {name:'name',selector:{text:{}}},
      {name:'title',selector:{text:{}}},
      {name:'show_title',default:true,selector:{boolean:{}}},
      {name:'hours_to_show',default:672,selector:{number:{min:1,max:8760,step:1,mode:'box'}}},
      group('graph_settings',[...['show_legend','show_navigation','show_labels'].map(name=>({name,default:true,selector:{boolean:{}}})),{name:'sync_timeframe',default:false,selector:{boolean:{}}},{name:'hover_sync_group',selector:{text:{}}}]),
      group('data_processing',[
        {name:'aggregation_period',default:'hour',selector:select([['hour','Uur','Hour'],['day','Dag','Day'],['week','Week (maandag)','Week (Monday)'],['month','Maand','Month']])},
        {name:'mode',default:'average',selector:select([['average','Gemiddelde','Average'],['consumption','Verbruik','Consumption']])}
      ]),
      group('color_settings',[
        {name:'color_mode',required:true,selector:select([['scale','Kleurschaal','Color scale'],['gradient','Kleurovergangen','Color stops']])},
        ...(data.color_mode==='gradient'?[
          {name:'gradient_mode',required:true,selector:select([['smooth','Vloeiende gradiënt','Smooth gradient'],['steps','Harde overgangen','Hard transitions']])},
          {name:'gradient_stops',selector:stops}
        ]:[
          {name:'scale_min',selector:{number:{step:'any',mode:'box'}}},{name:'scale_max',selector:{number:{step:'any',mode:'box'}}},
          {name:'low_color',selector:{color_rgb:{}}},{name:'high_color',selector:{color_rgb:{}}}
        ])
      ],true),
      group('matrix_settings',[number('cell_width',6,64),number('cell_height',16,64),number('cell_gap',0,8),number('border_radius',0,16),number('max_height',100,2000)])
    ],computeLabel:function(item){return labels[item?.name]?.[isDutch(this?.hass??{language:dutch?'nl':'en'})?0:1]??item?.name;},
    computeHelper:function(item){return helpers[item?.name]?.[isDutch(this?.hass??{language:dutch?'nl':'en'})?0:1];}};
  }
  static async getConfigElement(){
    if(!customElements.get('ha-form')){
      const helpers=await window.loadCardHelpers();
      const card=await helpers.createCardElement({type:'entities',entities:[]});
      await card.constructor.getConfigElement();
      await customElements.whenDefined('ha-form');
    }
    if(!customElements.get('eleven-heatmap-editor'))customElements.define('eleven-heatmap-editor',HeatmapEditor);
    return document.createElement('eleven-heatmap-editor');
  }
  static getStubConfig(hass){return {entity:Object.keys(hass?.states ?? {}).find(id=>id.startsWith('sensor.') && numeric(hass.states[id].state)!=null) ?? '',hours_to_show:672,mode:'average',aggregation_period:'hour'};}
  setConfig(config){
    if(!config?.entity){
      disconnectTimeframeSync(this);this._config=null;this._emptyConfig=true;resetGraphPeriod(this);this._invalidate();
      disconnectPeriodControls(this);disconnectChartInsights(this);this._disconnectTooltip();this._render();return;
    }
    this._emptyConfig=false;
    this._config=normalizeConfig(config);resetGraphPeriod(this);this._invalidate();connectTimeframeSync(this);this._render();if(this._connected)this._refresh();
  }
  set hass(hass){
    const previous=this._context;
    this._hass=hass;
    const state=hass?.states?.[this._config?.entity];
    this._context=JSON.stringify([hass?.config?.time_zone,state?.attributes?.unit_of_measurement,state?.attributes?.friendly_name,isDutch(hass),!!state]);
    if(previous!==this._context){
      const unit=state?.attributes?.unit_of_measurement ?? '',zone=hass?.config?.time_zone || 'UTC';
      if(this._data && (this._data.unit!==unit || this._zone!==zone))this._invalidate();
      this._render();
    }
    if(this._connected && !this._promise && this._status==='loading')this._refresh();
  }
  get hass(){return this._hass;}
  connectedCallback(){this._connected=true;connectTimeframeSync(this);this._refresh();}
  disconnectedCallback(){disconnectTimeframeSync(this);this._connected=false;this._generation++;this._promise=null;clearTimeout(this._timer);this._timer=null;disconnectPeriodControls(this);disconnectChartInsights(this);this._disconnectTooltip();this._hideTooltip();}
  getCardSize(){
    const c=this._config??{},hours=c.hours_to_show??672,period=c.aggregation_period??'hour';
    const rows=this._rows.length || Math.ceil(hours/({hour:24,day:168,week:8760,month:8760}[period]))+(period==='hour'||period==='day'?1:2);
    return Math.ceil((90+Math.min(c.max_height??800,(rows+(c.show_labels!==false?1:0))*((c.cell_height??24)+(c.cell_gap??2))))/50);
  }
  getGridOptions(){return {columns:12,min_columns:6,rows:Math.max(3,Math.ceil(this.getCardSize()*50/64)),min_rows:3};}
  _invalidate(){this._hideTooltip();this._insightOpen=null;this._insightPending=null;this._generation++;this._promise=null;this._data=null;this._rows=[];this._status='loading';this._refreshFailures=0;clearTimeout(this._timer);this._timer=null;}
  _reloadPeriod(){this._invalidate();this._render();return this._refresh();}
  _refresh(){
    if(!this._connected || !this._hass || !this._config)return Promise.resolve();
    if(this._promise)return this._promise;
    clearTimeout(this._timer);
    const generation=this._generation,hass=this._hass,config=this._config,range=graphPeriodRange(this),zone=hass.config?.time_zone || 'UTC';
    let timeout;
    const work=Promise.race([loadHeatmapData(hass,config,range.start,range.end),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('timeout')),20000);})])
      .then(data=>{
        if(!this._connected || generation!==this._generation)return;
        const currentUnit=this._hass.states?.[config.entity]?.attributes?.unit_of_measurement ?? '';
        if(data.unit!==currentUnit || zone!==(this._hass.config?.time_zone || 'UTC')){this._invalidate();return;}
        this._rows=buildHeatmap(data,range.start,range.end,zone,config.mode,config.aggregation_period);
        this._data=data;this._zone=zone;this._start=range.start;this._end=range.end;this._viewStart=range.start;this._viewEnd=range.end;
        this._status='ready';this._refreshFailures=0;
      }).catch(error=>{
        if(this._connected && generation===this._generation){this._status='error';this._error=error.message;this._refreshFailures=(this._refreshFailures??0)+1;}
      }).finally(()=>{
        clearTimeout(timeout);
        if(this._connected && generation===this._generation){
          this._promise=null;this._render();this._timer=setTimeout(()=>this._refresh(),retryDelay(this._refreshFailures??0));
        } else if(this._connected && this._status==='loading' && !this._promise)this._refresh();
      });
    this._promise=work;return work;
  }
  _number(value){const locale=isDutch(this._hass)?'nl-NL':'en-GB';if(this._numberLocale!==locale){this._numberLocale=locale;this._numberFormat=new Intl.NumberFormat(locale,{maximumFractionDigits:2});this._smallNumberFormat=new Intl.NumberFormat(locale,{maximumSignificantDigits:3});}return (Math.abs(value)>0&&Math.abs(value)<0.01?this._smallNumberFormat:this._numberFormat).format(value);}
  _cellDate(cell){
    const period=this._config.aggregation_period,locale=isDutch(this._hass)?'nl-NL':'en-GB',zone=this._zone || this._hass?.config?.time_zone || 'UTC';
    if(period==='hour')return this._dateLabels.get(cell.key.split('/')[0]);
    if(period==='week')return `Week ${cell.column+1}, ${cell.rowKey}`;
    if(period==='month')return (this._monthFormatter??=new Intl.DateTimeFormat(locale,{timeZone:zone,month:'long',year:'numeric'})).format(cell.timestamp??Date.UTC(Number(cell.rowKey),cell.column,15));
    const row=this._rowByKey?.get(cell.rowKey);
    return (this._dayFormatter??=new Intl.DateTimeFormat(locale,{timeZone:zone,weekday:'short',day:'numeric',month:'short',year:'numeric'})).format(cell.timestamp??row.timestamp+(cell.column+.5)*86400000);
  }
  _label(cell){
    const dutch=isDutch(this._hass),date=this._cellDate(cell),hour=this._config.aggregation_period==='hour'?`, ${String(cell.hour).padStart(2,'0')}:00`:'';
    return `${date}${hour} · ${cell.value==null?(dutch?'Geen gegevens':'No data'):`${this._number(cell.value)} ${this._data.unit}`}${cell.partial?(dutch?' · Onvolledig':' · Incomplete'):''}`;
  }
  _information(language){
    this._insightLanguage=language;
    const summary={rows:[{id:this._config.entity,unit:this._data?.unit,...summarizeHeatmap(this._rows,this._config.mode)}]};
    // Adapt the single sensor to the shared information popup without adding
    // internal collection fields to the card's saved configuration.
    return chartDataInformation({_config:{entities:[this._config.entity],series_options:[{entity:this._config.entity,name:this._config.name?.trim()}]},_hass:this._hass,
      _insightOpen:this._insightOpen,_status:this._status,_inFlight:!!this._promise || this._status==='loading',_loadFailed:this._status==='error',
      _lastLoad:this._data?{sources:[{id:this._config.entity,source:this._data.source}],summary}:null,
      _isSeriesVisible:()=>true,_dataInformation:()=>summary,
      _insightColor:()=>{const scale=colorScale(this._rows,this._config),average=summary.rows[0].average;return scale.color(Number.isFinite(average)?average:(scale.min+scale.max)/2);}},language);
  }
  _sensorName(){return this._config.name?.trim()||this._hass?.states?.[this._config.entity]?.attributes?.friendly_name||this._config.entity;}
  _cellBounds(cell){
    const intervals=cell.records.length?cell.records:cell.intervals;
    if(this._config.aggregation_period!=='hour'){
      if(!intervals.length)return '';
      const format=new Intl.DateTimeFormat(isDutch(this._hass)?'nl-NL':'en-GB',{timeZone:this._zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
      return `${format.format(intervals[0].start)}–${format.format(intervals.at(-1).end)}`;
    }
    const locale=isDutch(this._hass)?'nl-NL':'en-GB',options={timeZone:this._zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'};
    const offset=new Intl.DateTimeFormat(locale,{timeZone:this._zone,timeZoneName:'shortOffset'});
    const zone=t=>offset.formatToParts(t).find(part=>part.type==='timeZoneName')?.value;
    const showOffset=intervals.length>1 || intervals.some(row=>zone(row.start)!==zone(row.end));
    const clock=new Intl.DateTimeFormat(locale,{...options,...(showOffset?{timeZoneName:'shortOffset'}:{})});
    return intervals.map(row=>`${clock.format(row.start)}–${clock.format(row.end)}`).join(', ') || `${String(cell.hour).padStart(2,'0')}:00–${String(cell.hour+1).padStart(2,'0')}:00`;
  }
  _hideTooltip(){
    this._tooltipKey=null;
    const tooltip=this.shadowRoot.querySelector('.tooltip');if(tooltip)tooltip.hidden=true;
    this._tooltipButton?.removeAttribute('aria-describedby');this._tooltipButton=null;
  }
  _showTooltip(key){
    if(this._periodMenuOpen || this._insightOpen){this._hideTooltip();return;}
    const root=this.shadowRoot,cell=this._cells?.get(key),button=this._cellElements?.get(key)??[...root.querySelectorAll('[data-cell]')].find(button=>button.dataset.cell===key);
    const tooltip=root.querySelector('.tooltip'),chart=root.querySelector('.chart'),scroll=root.querySelector('.matrix-scroll');
    if(!cell || !button || !tooltip || !chart || !scroll){this._hideTooltip();return;}
    const box=chart.getBoundingClientRect(),target=button.getBoundingClientRect(),grid=scroll.getBoundingClientRect();
    const left=Math.max(box.left,8),right=Math.min(box.right,window.innerWidth-8),top=Math.max(box.top,8),bottom=Math.min(box.bottom,window.innerHeight-8);
    if(target.right<=Math.max(grid.left+(this._config.show_labels?82+this._config.cell_gap:0),left) || target.left>=Math.min(grid.right,right) || target.bottom<=Math.max(grid.top,top) || target.top>=Math.min(grid.bottom,bottom)) {this._hideTooltip();return;}
    this._tooltipKey=key;
    const dutch=isDutch(this._hass),name=this._sensorName();
    const value=cell.value==null?(dutch?'Geen gegevens':'No data'):`${this._number(cell.value)} ${this._data.unit}`;
    const date=this._cellDate(cell),bounds=this._cellBounds(cell),color=cell.value==null?'var(--divider-color,#ddd)':(this._scale??colorScale(this._rows,this._config)).color(cell.value);
    tooltip.innerHTML=`<strong>${esc(date)}${bounds?` · ${esc(bounds)}`:''}</strong><span><i style="background:${color}"></i><b class="tooltip-label">${esc(name)}: <em class="tooltip-value">${esc(value)}</em></b>${cell.partial?`<small>${dutch?'Onvolledig':'Incomplete'}</small>`:''}</span>`;
    tooltip.style.width='max-content';tooltip.style.maxWidth=`${Math.max(0,Math.min(360,right-left-8))}px`;tooltip.style.maxHeight=`${Math.max(0,bottom-top-8)}px`;
    tooltip.hidden=false;
    const measured=tooltip.getBoundingClientRect();
    let x=target.right+10;if(x+measured.width>right-4)x=target.left-measured.width-10;
    const y=target.bottom+measured.height+8<=bottom?target.bottom+8:target.top-measured.height-8;
    tooltip.style.left=`${Math.max(left+4,Math.min(x,right-measured.width-4))-box.left}px`;
    tooltip.style.top=`${Math.max(top+4,Math.min(y,bottom-measured.height-4))-box.top}px`;
    if(this._tooltipButton!==button)this._tooltipButton?.removeAttribute('aria-describedby');this._tooltipButton=button;
    button.setAttribute('aria-describedby','heatmap-tooltip');
  }
  _disconnectTooltip(){this._tooltipCleanup?.();this._tooltipCleanup=null;}
  _bindTooltip(){
    this._disconnectTooltip();
    const root=this.shadowRoot,chart=root.querySelector('.chart');if(!chart)return;
    const cleanups=[],listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
    this._tooltipCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
    const viewportChange=()=>this._hideTooltip();
    listen(window,'resize',viewportChange);
    const scroll=root.querySelector('.matrix-scroll');let scrollLeft=scroll?.scrollLeft ?? 0,scrollTop=scroll?.scrollTop ?? 0;
    const targets=new Set([window,root]);for(let node=this;node;){const tree=node.getRootNode?.();if(!tree || targets.has(tree))break;targets.add(tree);node=tree.host;}
    for(const target of targets)listen(target,'scroll',event=>{
      if(event.composedPath().includes(root.querySelector('.tooltip')))return;
      if(event.target===scroll){
        const x=scroll.scrollLeft ?? 0,y=scroll.scrollTop ?? 0;
        if(x===scrollLeft && y===scrollTop)return;
        scrollLeft=x;scrollTop=y;
      }
      viewportChange();
    },true);
    listen(document,'pointerdown',event=>{if(!event.composedPath().includes(chart))this._hideTooltip();},true);
    listen(root,'keydown',event=>{if(event.key==='Escape' && this._tooltipKey){event.preventDefault();this._hideTooltip();}});
    chart.onpointerleave=()=>this._hideTooltip();
  }
  _matrixRow(row,index){
    const c=this._config,scale=this._scale,locale=isDutch(this._hass)?'nl-NL':'en-GB';
    const fmt=this._rowFormatter??=new Intl.DateTimeFormat(locale,{timeZone:this._zone||this._hass?.config?.time_zone||'UTC',weekday:'short',day:'numeric',month:'short'});
    return `<div class="matrix-row" role="row" aria-rowindex="${index+2}"><span class="day" role="rowheader">${esc(['week','month'].includes(c.aggregation_period)?row.key:fmt.format(row.timestamp))}</span>${row.cells.map(cell=>`<div role="cell" data-cell="${cell.key}" aria-label="${esc(this._label(cell))}" class="cell ${cell.value==null?'missing':''} ${!cell.intervals.length?'outside':''} ${cell.partial?'partial':''}"${cell.value!=null?` style="background-color:${scale.color(cell.value)}"`:''}></div>`).join('')}</div>`;
  }
  _matrixWindow(scrollTop,height){
    const step=this._config.cell_height+this._config.cell_gap,offset=this._config.show_labels?step:0,first=Math.min(Math.max(0,this._rows.length-1),Math.max(0,Math.floor((scrollTop-offset)/step)-8));
    return [first,Math.min(this._rows.length,first+Math.ceil(Math.max(height||0,200)/step)+17)];
  }
  _updateMatrixWindow(){
    if(!this._virtualRows)return;
    const scroll=this.shadowRoot.querySelector('.matrix-scroll'),body=this.shadowRoot.querySelector('.matrix-body');if(!scroll||!body)return;
    const [first,last]=this._matrixWindow(scroll.scrollTop,scroll.clientHeight);
    if(this._windowRange?.[0]===first&&this._windowRange?.[1]===last)return;
    this._hideTooltip();this._windowRange=[first,last];const step=this._config.cell_height+this._config.cell_gap;
    this._cells=new Map(this._rows.slice(first,last).flatMap(row=>row.cells).map(cell=>[cell.key,cell]));
    body.innerHTML=this._rows.slice(first,last).map((row,index)=>`<div class="virtual-row" style="top:${(first+index)*step}px">${this._matrixRow(row,first+index)}</div>`).join('');
    this._cellElements=new Map([...body.querySelectorAll('[data-cell]')].map(element=>[element.dataset.cell,element]));
  }
  _render(){
    if(!this._config){
      if(this._emptyConfig)this.shadowRoot.innerHTML=`<ha-card style="display:block;padding:16px">${isDutch(this._hass)?'Kies een sensor in de editor.':'Select a sensor in the editor.'}</ha-card>`;
      return;
    }
    const c=this._config,dutch=isDutch(this._hass),text=(en,nl)=>dutch?nl:en,language=dutch?'nl':'en';
    const scroll=this.shadowRoot.querySelector('.matrix-scroll');
    const scrollLeft=scroll?.scrollLeft ?? 0,scrollTop=scroll?.scrollTop ?? 0,tooltipKey=this._tooltipKey;
    captureChartInsights(this);
    const periods=periodControls(this,language),range=this._data?{start:this._start,end:this._end}:graphPeriodRange(this);
    const historyUrl=`/history?entity_id=${encodeURIComponent(c.entity)}&start_date=${encodeURIComponent(new Date(range.start).toISOString())}&end_date=${encodeURIComponent(new Date(range.end).toISOString())}`;
    const name=this._sensorName();
    const scale=colorScale(this._rows,c);this._scale=scale;
    this._rowByKey=new Map(this._rows.map(row=>[row.key,row]));this._monthFormatter=null;this._dayFormatter=null;
    const zone=this._zone || this._hass?.config?.time_zone || 'UTC',locale=dutch?'nl-NL':'en-GB';
    const columns=heatmapColumns(c.aggregation_period,locale),columnCount=columns.length;
    const corner={hour:text('Day / hour','Dag / uur'),day:text('Week / day','Week / dag'),week:text('Year / week','Jaar / week'),month:text('Year / month','Jaar / maand')}[c.aggregation_period];
    const fmt=new Intl.DateTimeFormat(locale,{timeZone:zone,weekday:'short',day:'numeric',month:'short'});this._rowFormatter=fmt;
    const fullDate=new Intl.DateTimeFormat(locale,{timeZone:zone,weekday:'short',day:'numeric',month:'short',year:'numeric'});
    this._dateLabels=new Map(this._rows.map(row=>[row.key,fullDate.format(row.timestamp)]));
    this._virtualRows=this._rows.length>80;const step=c.cell_height+c.cell_gap;
    const [first,last]=this._virtualRows?this._matrixWindow(scrollTop,scroll?.clientHeight||Math.min(c.max_height,600)):[0,this._rows.length];
    this._windowRange=[first,last];
    this._cells=new Map(this._rows.slice(first,last).flatMap(row=>row.cells).map(cell=>[cell.key,cell]));
    const matrix=this._virtualRows?`<div class="matrix-body" role="rowgroup" style="height:${Math.max(0,this._rows.length*step-c.cell_gap)}px">${this._rows.slice(first,last).map((row,index)=>`<div class="virtual-row" style="top:${(first+index)*step}px">${this._matrixRow(row,first+index)}</div>`).join('')}</div>`:this._rows.map((row,index)=>this._matrixRow(row,index)).join('');
    const status=this._status==='error'?(this._error==='consumption_statistics_required'?text('No counter statistics for this sensor.','Geen tellerstatistieken voor deze sensor.'):text('Could not load data.','Laden mislukt.')):text('Loading…','Laden…');
    const hasValues=this._rows.some(row=>row.cells.some(cell=>cell.value!=null)),information=this._information(language);
    disconnectPeriodControls(this,true);disconnectChartInsights(this,true);this._disconnectTooltip();
    this.shadowRoot.innerHTML=`<style>${cardHeaderStyles()}${periodControlsStyles()}${chartInsightStyles()}${SharedGraph.tooltipStyles()}
      :host{display:block;height:100%;min-width:0;min-height:0;container-type:inline-size}
      ha-card{display:block;height:100%;min-height:0;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));font-family:inherit}
      .content{display:flex;flex-direction:column;height:100%;padding:16px;min-width:0;min-height:0;box-sizing:border-box}.content>.card-header,.content>.legend,.content>.status{flex-shrink:0}.chart{position:relative;display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}
      .matrix-scroll{flex:1;min-height:0;overflow:auto;max-height:${c.max_height}px;box-sizing:border-box;padding-bottom:6px}
      .matrix{min-width:${(c.show_labels?82+c.cell_gap:0)+columnCount*c.cell_width+(columnCount-1)*c.cell_gap}px;display:grid;gap:${c.cell_gap}px}.matrix-row{display:grid;grid-template-columns:${c.show_labels?'82px ':''}repeat(${columnCount},minmax(${c.cell_width}px,1fr));gap:${c.cell_gap}px}.matrix-row:not(.hours){content-visibility:auto;contain-intrinsic-size:auto ${c.cell_height}px}.matrix-body{position:relative;min-width:100%}.virtual-row{position:absolute;left:0;right:0;height:${c.cell_height}px}
      .hours{${c.show_labels?'':'display:none;'}position:sticky;top:0;z-index:3;background:var(--ha-card-background,var(--card-background-color,#fff))}
      .hours span{font-size:10px;text-align:center;color:var(--secondary-text-color,#666);line-height:${c.cell_height}px}
      .day{${c.show_labels?'':'display:none;'}position:sticky;left:0;z-index:2;background:var(--ha-card-background,var(--card-background-color,#fff));font-size:11px;line-height:${c.cell_height}px;white-space:nowrap;color:var(--secondary-text-color,#666)}
      .cell{appearance:none;position:relative;border:0;border-radius:${c.border_radius}px;min-width:${c.cell_width}px;height:${c.cell_height}px;padding:0;cursor:default}
      .cell:hover{box-shadow:inset 0 0 0 2px var(--primary-text-color,#20252b)}
      .missing{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--divider-color,#ddd) 3px,var(--divider-color,#ddd) 5px);box-shadow:inset 0 0 0 1px var(--divider-color,#ddd)}.outside{opacity:.35}
      .partial:after{content:'';position:absolute;right:2px;bottom:2px;width:4px;height:4px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px #20252b}
      .legend{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--secondary-text-color,#666);margin:0 0 10px;font-variant-numeric:tabular-nums}
      .ramp{width:100px;height:10px;border-radius:3px;flex-shrink:1;background:${scale.gradient}}
      .legend-value{overflow-wrap:anywhere;min-width:0}
      .tooltip{pointer-events:auto}.tooltip .tooltip-label{color:var(--secondary-text-color,#666)}.tooltip .tooltip-value{color:var(--primary-text-color,#20252b);font-style:normal}
      .status{font-size:12px;line-height:1.5;margin:12px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
      .retry{font:inherit;color:inherit;background:transparent;border:1px solid var(--divider-color,#ddd);border-radius:5px;min-height:32px;padding:4px 10px;cursor:pointer}.retry:focus-visible{outline:2px solid var(--primary-color,#2196f3)}
      @media(forced-colors:active){.cell{border:1px solid CanvasText}.missing{border-style:dashed}}
    </style><ha-card><div class="content">${cardHeader({title:c.title,showTitle:c.show_title,historyUrl,language,periods,information})}
    ${this._status!=='ready'?`<div class="status" role="status"><span>${esc(status)}${this._data?' '+text('Previous data shown.','Vorige gegevens worden getoond.'):''}</span>${this._status==='error'?`<button class="retry" type="button">${text('Retry','Opnieuw')}</button>`:''}</div>`:''}
    ${this._data?`${!hasValues?`<p class="status" role="status">${text('No data','Geen gegevens')}</p>`:''}${c.show_legend?`<div class="legend" aria-label="${text('Color scale','Kleurschaal')}"><span class="legend-value">${this._number(scale.min)} ${esc(this._data.unit)}</span><span class="ramp" aria-hidden="true"></span><span class="legend-value">${this._number(scale.max)} ${esc(this._data.unit)}</span></div>`:''}<div class="chart"><div class="matrix-scroll"><div class="matrix" role="table" aria-label="${esc(name)}" aria-rowcount="${this._rows.length+(c.show_labels?1:0)}" aria-colcount="${columnCount+(c.show_labels?1:0)}"><div class="matrix-row hours" role="row"><span role="columnheader">${corner}</span>${columns.map(label=>`<span role="columnheader">${esc(label)}</span>`).join('')}</div>${matrix}</div></div><div class="tooltip" id="heatmap-tooltip" role="tooltip" hidden></div></div>`:''}</div></ha-card>`;
    bindPeriodControls(this);bindChartInsights(this);
    const retry=this.shadowRoot.querySelector('.retry');if(retry)retry.onclick=()=>this._refresh();
    const container=this.shadowRoot.querySelector('.matrix-scroll');if(container){container.scrollLeft=scrollLeft;container.scrollTop=scrollTop;container.onscroll=()=>this._updateMatrixWindow();}
    this._bindTooltip();
    const grid=this.shadowRoot.querySelector('.matrix');
    if(grid){
      this._cellElements=new Map([...grid.querySelectorAll('[data-cell]')].map(element=>[element.dataset.cell,element]));this._updateMatrixWindow();
      const target=e=>e.target.closest('[data-cell]');
      grid.onpointerover=e=>{const cell=target(e);if(cell && e.pointerType!=='touch')this._showTooltip(cell.dataset.cell);};
      const cell=this._cellElements.get(tooltipKey);
      if(cell?.matches(':hover'))this._showTooltip(tooltipKey);else this._hideTooltip();
    }
  }
}

if(!customElements.get('eleven-heatmap-card'))customElements.define('eleven-heatmap-card',HeatmapCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(c=>c.type==='eleven-heatmap-card'))window.customCards.push({type:'eleven-heatmap-card',name:'Eleven Heatmap (beta)',description:'Sensor averages or consumption grouped by hour, day, week or month.',preview:true});
})();

;
// Eleven Calendar (beta) — self-contained standalone module
(()=>{
function retryDelay(failures, base = 60000, maximum = 300000) {
  return Math.min(maximum, base * 2 ** Math.max(0, failures - 1));
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
function calendarDayStart(key,zone='UTC'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;
 const nominal=Date.parse(`${key}T00:00:00Z`);
 return Number.isFinite(nominal)&&new Date(nominal).toISOString().slice(0,10)===key?periodMidnight(nominal,zone||'UTC'):NaN;
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
function periodDateTime(t,zone='UTC'){
 const p=periodLocalParts(t,zone),pad=n=>String(n).padStart(2,'0');
 return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
function parsePeriodDateTime(value,zone='UTC',edge='start',previous){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;
 if(Number.isFinite(previous)&&periodDateTime(previous,zone)===value)return previous;
 const nominal=Date.parse(value+'Z');if(!Number.isFinite(nominal)||periodDateTime(nominal,'UTC')!==value)return NaN;
 // Collect the offsets on both sides of a transition. Reject skipped local
 // times; repeated times include both occurrences unless editing an existing bound.
 const candidates=new Set();
 for(let h=-48;h<=48;h+=6){const sample=nominal+h*3600000,offset=periodLocalEpoch(sample,zone)-sample,candidate=nominal-offset;if(periodDateTime(candidate,zone)===value)candidates.add(candidate);}
 const times=[...candidates].sort((a,b)=>a-b);return times.length?(edge==='end'?times.at(-1):times[0]):NaN;
}
function chooseCustomGraphPeriod(host,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>366*86400000)return false;
 resetGraphPeriod(host);host._periodMode='custom';host._periodHours=(end-start)/3600000;host._periodEnd=end;
 publishTimeframe(host);host._reloadPeriod();return true;
}
function timeframeSyncConfig(config,{draft=false}={}){
 if(!draft){
  if(config.sync_timeframe!==undefined&&typeof config.sync_timeframe!=='boolean')throw Error('sync_timeframe must be a boolean. / Tijdvak synchroniseren moet aan of uit zijn.');
  for(const key of ['hover_sync_group','timeframe_sync_group'])if(config[key]!=null&&typeof config[key]!=='string')throw Error(`${key} must be text. / De synchronisatiegroep moet tekst zijn.`);
 }
 return {sync_timeframe:config.sync_timeframe??false,hover_sync_group:config.hover_sync_group??config.timeframe_sync_group??''};
}
function timeframeGroup(host){return host._config?.sync_timeframe===true?((host._config.hover_sync_group??host._config.timeframe_sync_group)?.trim()||'default'):null;}
function timeframeGroups(){
 const root=globalThis.window??globalThis,key=Symbol.for('eleven-cards.timeframe-sync.v1');
 return root[key]??=new Map();
}
function applyTimeframe(host,selection){
 // Default is a group-wide reset to each card's own configured range (or
 // native price window), rather than a copy of the sender's hours.
 if(selection.mode==='configured'&&selection.offset===0){resetGraphPeriod(host);return;}
 host._sharedTimeframe=selection;
 Object.assign(host,{_periodMode:selection.mode,_periodHours:selection.hours,_periodEnd:selection.end,_periodOffset:selection.offset,_periodAnchor:selection.anchor});
}
function disconnectTimeframeSync(host){
 host._disconnectTimeframeSync?.();host._disconnectTimeframeSync=null;
}
function connectTimeframeSync(host){
 disconnectTimeframeSync(host);
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const groups=timeframeGroups();let entry=groups.get(group);
 if(!entry){entry={selection:null,listeners:new Set()};groups.set(group,entry);}
 const receive=(selection,source)=>{
  if(source===host||host._sharedTimeframe===selection)return;
  applyTimeframe(host,selection);host._reloadPeriod();
 };
 entry.listeners.add(receive);
 host._disconnectTimeframeSync=()=>entry.listeners.delete(receive);
 // Joining never publishes this card's default over an existing selection.
 if(entry.selection)applyTimeframe(host,entry.selection);
}
function publishTimeframe(host){
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const entry=timeframeGroups().get(group);if(!entry)return;
 const selection={group,mode:host._periodMode,hours:host._periodHours??host._config.hours_to_show,
  end:host._periodEnd,offset:host._periodOffset,anchor:host._periodAnchor,zone:host._hass?.config?.time_zone||'UTC',at:Date.now()};
 selection.range=localGraphPeriodRange(host,selection.at);
 entry.selection=selection;applyTimeframe(host,selection);
 for(const receive of entry.listeners)receive(selection,host);
}
function resetGraphPeriod(host){host._sharedTimeframe=null;host._periodMode='configured';host._periodHours=null;host._periodEnd=null;host._periodOffset=0;host._periodAnchor=null;host._periodMenuOpen=false;host._periodMenuPending=false;host._periodCustomDraft=null;host._periodTab=null;host._insightPending=null;}
function graphPeriodRange(host,now=Date.now()){
 const shared=host._sharedTimeframe;
 if(shared&&timeframeGroup(host)===shared.group){
  // One clock and timezone for the whole group, including separate bundles.
  // Live selections advance together on the minute; historical ranges stay fixed.
  if(shared.offset===0&&shared.end==null&&(Math.floor(now/60000)!==Math.floor(shared.at/60000))){
   shared.at=now;shared.range=localGraphPeriodRange({_periodMode:shared.mode,_periodHours:shared.hours,_periodOffset:0,_hass:{config:{time_zone:shared.zone}}},now);
  }
  return {...shared.range};
 }
 return localGraphPeriodRange(host,now);
}
function localGraphPeriodRange(host,now){
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
 publishTimeframe(host);
 return host._reloadPeriod();
}
function moveGraphPeriod(host,direction){
 if(![-1,0,1].includes(direction))return;
 if(host._periodMode==='custom'){
  if(direction===0){host._periodEnd=null;host._periodOffset=0;}
  else{const end=(host._periodEnd??Date.now())+direction*host._periodHours*3600000;host._periodEnd=direction>0?Math.min(Date.now(),end):end;host._periodOffset=(host._periodOffset??0)+direction;}
  host._periodCustomDraft=null;host._periodTab=null;host._sharedTimeframe=null;publishTimeframe(host);return host._reloadPeriod();
 }
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
 host._sharedTimeframe=null;
 publishTimeframe(host);
 return host._reloadPeriod();
}

// Native controls: text/attributes are escaped; content is trusted, caller-owned HTML.
function uiEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function uiAttributes(values={}){
 return Object.entries(values).map(([key,value])=>{
  if(!/^[a-zA-Z_:][\w:.-]*$/.test(key)||/^on/i.test(key))throw Error('Invalid UI attribute: '+key);
  if(value==null)return '';
  if(['disabled','hidden','required','autofocus','multiple','readonly'].includes(key))return value?` ${key}`:'';
  return ` ${key}="${uiEscape(value)}"`;
 }).join('');
}
function uiButton({text='',content,label,title,variant='icon',className='',type='button',href,disabled=false,attrs={}}={}){
 const classes=className?` class="${uiEscape(className)}"`:'';
 const body=content??uiEscape(text),attributes=uiAttributes({...attrs,...(label==null?{}:{'aria-label':label}),...(title==null?{}:{title}),...(disabled?{disabled:true}:{})});
 return href==null?`<button type="${uiEscape(type)}"${classes} data-ui-button="${uiEscape(variant)}"${attributes}>${body}</button>`:`<a${classes} data-ui-button="${uiEscape(variant)}" href="${uiEscape(href)}"${attributes}>${body}</a>`;
}
function uiButtonStyles(){return `
[data-ui-button]{display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:inherit;font-size:12px;font-weight:400;padding:0;border:0;border-radius:4px;background:transparent;color:var(--primary-text-color,#20252b);text-decoration:none;cursor:pointer;flex:none}
[data-ui-button="icon"]{width:32px;height:32px}
[data-ui-button]:not(:disabled):hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
[data-ui-button]:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
[data-ui-button="icon"]:focus-visible{background:var(--secondary-background-color,#eee)}
[data-ui-button]:disabled{opacity:.35;cursor:default}
[data-ui-button="surface"]{height:auto;width:100%;justify-content:space-between;gap:8px;min-height:34px;text-align:start;padding:6px 8px;border-radius:5px;background:var(--secondary-background-color,#eee)}
[data-ui-button="surface"][aria-checked="true"],[data-ui-button="surface"][aria-pressed="true"]{color:var(--primary-color,#2196f3);background:color-mix(in srgb,var(--primary-color,#2196f3) 14%,var(--ha-card-background,var(--card-background-color,#fff)));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--primary-color,#2196f3) 55%,transparent)}
[data-ui-button="text"]{min-height:30px;height:auto;width:auto;border-radius:5px}
[data-ui-button="close"]{width:30px;height:30px;min-height:30px;border-radius:5px;font-size:20px;color:inherit}
`;}


// The caller owns each item's trusted HTML (swatch, label and optional value).
function uiLegendButton({id,visible=true,content='',title='',className='legend-item',attrs={}}={}){
 return `<button type="button" class="${uiEscape(className)}"${uiAttributes({...attrs,'data-ui-legend':id,'aria-pressed':visible,title})}>${content}</button>`;
}
function uiLegend({items=[],className='legend',attrs={},afterContent=''}={}){
 return `<div class="${uiEscape(className)}"${uiAttributes(attrs)}>${items.map(uiLegendButton).join('')}${afterContent}</div>`;
}
function cancelUILegendClicks(host){
 for(const timer of host._legendClickTimers?.values()??[])clearTimeout(timer);
 host._legendClickTimers?.clear();
}
function focusUILegend(host,id,selector='[data-ui-legend]',getId=button=>button.dataset.uiLegend){
 queueMicrotask(()=>[...host.shadowRoot.querySelectorAll(selector)].find(button=>getId(button)===id)?.focus({preventScroll:true}));
}
function bindUILegend(host,{selector='[data-ui-legend]',getId=button=>button.dataset.uiLegend,hint='',toggle,isolate}={}){
 for(const button of host.shadowRoot.querySelectorAll?.(selector)??[]){
  const id=getId(button);
  if(hint&&!button.title?.includes(hint))button.title=[button.title,hint].filter(Boolean).join(' ');
  if(hint)button.setAttribute('aria-description',hint);
  button.setAttribute('aria-keyshortcuts','Shift+Enter Shift+Space');
  button.onclick=event=>{
   clearTimeout(host._legendClickTimers?.get(id));host._legendClickTimers?.delete(id);
   if(event.shiftKey||event.detail>1){event.preventDefault();isolate?.(id);return;}
   if(!event.detail){(toggle??isolate)?.(id);return;}
   // Wait for the second click before a rerender replaces the clicked button.
   if(toggle){const config=host._config;host._legendClickTimers??=new Map();host._legendClickTimers.set(id,setTimeout(()=>{host._legendClickTimers.delete(id);if(host._config===config)toggle(id);},300));}
  };
  button.ondblclick=event=>event.preventDefault();
  button.onkeydown=event=>{if(event.shiftKey&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();isolate?.(id);}};
 }
}


function uiPopup({id,title,label=title,closeLabel='Close',content='',className='',attrs={},closeAttrs={}}){
 return `<div${uiAttributes({id,class:className||null,'data-ui-popup':'',popover:'auto',role:'dialog','aria-label':label,...attrs})}><div class="ui-popup-heading"><strong>${uiEscape(title)}</strong>${uiButton({variant:'close',content:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>',label:closeLabel,attrs:{'data-ui-popup-close':'',...closeAttrs}})}</div>${content}</div>`;
}
function bindUIPopupPosition({trigger,popup,isRequested,onShow,ready,width=380,maxHeight=560}){
 let active=true;
 const position=()=>{
  if(!active||!isRequested())return;
  const box=trigger.getBoundingClientRect();
  if(!box.width||!box.height){popup.style.visibility='hidden';return;}
  const actualWidth=Math.min(width,window.innerWidth-16);
  popup.style.width=actualWidth+'px';popup.style.maxHeight=Math.min(maxHeight,window.innerHeight-16)+'px';
  popup.style.visibility='';onShow?.();
  const height=popup.getBoundingClientRect().height,below=window.innerHeight-box.bottom-8,above=box.top-8;
  popup.style.left=Math.max(8,Math.min(box.right-actualWidth,window.innerWidth-actualWidth-8))+'px';
  popup.style.top=Math.max(8,Math.min(below>=height||below>=above?box.bottom+6:box.top-height-6,window.innerHeight-height-8))+'px';
 };
 if(ready?.then)ready.then(position,()=>{});
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(position):null;
 observer?.observe(trigger);
 return {position,disconnect(){active=false;observer?.disconnect();}};
}
// Domain state lives in callbacks; this controller also works without a card host.
function bindUIPopup({trigger,popup,container=popup,ready,isRequested,isCurrent=()=>true,beforeOpen=()=>{},onOpen=()=>{},onClose=()=>{},onShown=()=>{},onToggle=()=>{},focusTarget,closeWhenAnchorHidden=false}){
 let requested=false,pending=false,focusPending=false,pointerWasOpen;
 const wantsOpen=isRequested??(()=>requested),native=typeof popup.showPopover==='function';
 const isOpen=()=>native?popup.matches(':popover-open'):popup.hasAttribute('data-fallback-open');
 trigger.setAttribute('aria-haspopup','dialog');if(popup.id)trigger.setAttribute('aria-controls',popup.id);trigger.setAttribute('aria-expanded',String(isOpen()));
 const cleanups=[],listen=(target,type,handler,capture=false)=>{target?.addEventListener?.(type,handler,capture);cleanups.push(()=>target?.removeEventListener?.(type,handler,capture));};
 const property=(target,key,handler)=>{if(!target)return;target[key]=handler;cleanups.push(()=>{if(target[key]===handler)target[key]=null;});};
 const closeButton=popup.querySelector('[data-ui-popup-close]');
 const placement=bindUIPopupPosition({trigger,popup,ready,isRequested:wantsOpen,onShow:()=>{
  pending=false;if(native){if(!isOpen())popup.showPopover();}else popup.setAttribute('data-fallback-open','');
  if(focusPending){(focusTarget?.()??closeButton)?.focus({preventScroll:true});focusPending=false;}
  onShown();
 }});
 const close=(focus=false)=>{
  requested=false;pending=false;focusPending=false;onClose();trigger.setAttribute('aria-expanded','false');
  if(native){if(isOpen())popup.hidePopover();}else popup.removeAttribute('data-fallback-open');
  if(focus)trigger.focus({preventScroll:true});
 };
 const open=(focus=true)=>{beforeOpen();requested=true;pending=true;focusPending=focus;onOpen(focus);trigger.setAttribute('aria-expanded','true');placement.position();};
 property(trigger,'onpointerdown',()=>{pointerWasOpen=wantsOpen();});
 property(trigger,'onpointercancel',()=>{pointerWasOpen=undefined;});
 property(trigger,'onclick',()=>{const wasOpen=pointerWasOpen??wantsOpen();pointerWasOpen=undefined;wasOpen?close(true):open();});
 property(closeButton,'onclick',()=>close(true));
 listen(popup,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}});
 listen(popup,'toggle',e=>{if(!isCurrent())return;const opened=e.newState==='open';if(!opened){if(wantsOpen())onClose();pending=false;focusPending=false;}requested=opened;trigger.setAttribute('aria-expanded',String(opened));onToggle(opened);});
 listen(window,'resize',()=>{if(wantsOpen()){if(closeWhenAnchorHidden&&trigger.getClientRects?.().length===0)close();else placement.position();}});
 listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(popup))close();},true);
 listen(document,'pointerdown',e=>{if((!native||pending)&&(isOpen()||wantsOpen())&&!e.composedPath().includes(container))close();});
 return {open,close,isOpen,position:placement.position,disconnect(){placement.disconnect();cleanups.splice(0).forEach(remove=>remove());}};
}
function uiPopupStyles(){return `
[data-ui-popup]{display:none;position:fixed;inset:auto;margin:0;padding:8px 12px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;z-index:20;max-width:calc(100vw - 16px);border:1px solid var(--divider-color,#ddd);border-radius:10px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font:inherit;font-size:12px;line-height:1.35;box-shadow:0 8px 28px #0004}
[data-ui-popup]:popover-open,[data-ui-popup][data-fallback-open]{display:block}
[data-ui-popup] [hidden]{display:none!important}
.ui-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.ui-popup-heading>strong{font-size:14px;font-weight:600}
.ui-popup-heading [data-ui-popup-close]{display:grid;place-items:center;width:30px;height:30px;min-height:30px;padding:0;line-height:1;flex:none}
.ui-popup-heading [data-ui-popup-close] svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
`;}



// Shared markup stays in each card's shadow root: native links and existing
// data-zoom handlers work without cross-bundle custom-element registration.
const headerEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bindCardPopupPosition(host,trigger,popup,isRequested,show){
 return bindUIPopupPosition({trigger,popup,isRequested,onShow:show,ready:host.shadowRoot.querySelector('ha-card')?.updateComplete});
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
 const zoom=ready?`<div class="zoom-controls" role="group" aria-label="Zoom">${['out','in','reset'].map(action=>uiButton({content:cardHeaderIcon(action),disabled:!zoomState[action],title:label[['in','out','reset'].indexOf(action)],label:label[['in','out','reset'].indexOf(action)],attrs:{'data-zoom':action}})).join('')}</div>`:'';
 const group=periods.picker||periods.navigation?`<div class="chart-controls" role="group" aria-label="${nl?'Tijdvak':'Timeframe'}">${periods.picker??''}${periods.navigation??''}</div>`:'';
 const showZoomStatus=zoomState.zoomed&&!periods.picker;
 return `<header class="card-header">${showTitle&&title?`<h2>${headerEscape(title)}</h2>`:''}<div class="header-actions">${group}${zoom}<div class="chart-links" role="group" aria-label="${nl?'Geschiedenis en informatie':'History and information'}">${uiButton({href:historyUrl??'',className:'history-link',content:cardHeaderIcon('history'),title:label[3],label:label[3]})}${information}</div></div></header>${showZoomStatus?`<div class="chart-context"><div class="chart-range"><span class="zoom-status">${nl?'Ingezoomd':'Zoomed in'}</span></div></div>`:''}`;
}
function cardHeaderStyles(){return uiButtonStyles()+uiPopupStyles()+`
.card-header{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;min-height:32px;flex:none;margin:-6px -4px 10px 0}
.card-header h2{flex:1 1 110px;min-width:0;margin:4.75px 0 0;font-size:18px;line-height:1.25;font-weight:650;letter-spacing:-.01em;overflow-wrap:anywhere}
.header-actions{--chart-action-gap:8px;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:var(--chart-action-gap);flex:0 1 auto;min-width:0;max-width:100%;margin-inline-start:auto}
.chart-controls{display:flex;align-items:center;gap:0;min-width:0;max-width:100%}
.chart-links{display:flex;align-items:center;gap:0;flex:none}
.zoom-controls{display:flex;gap:0;position:relative}
.chart-controls,.zoom-controls,.chart-links{background:var(--secondary-background-color,#eee);border-radius:5px}
.chart-controls>[data-period="now"]{width:36px}
.chart-controls>.period-controls{position:relative;margin-inline-end:8px;padding-inline-end:8px}
.chart-controls>.period-controls::after{content:"";position:absolute;inset-inline-end:0;top:8px;height:16px;width:1px;background:var(--divider-color,#ddd)}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
`;}


const CALENDAR_COLORS=['#82adf5','#e7af67','#8ac6a6','#b99cf0','#eb8d9f','#80c6d6','#d8bd68','#a5b7d3'];
const escapeCalendarHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function calendarRgb(value){
 if(Array.isArray(value))return [...value];
 if(typeof value!=='string'||!/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value))return null;
 const hex=value.length===4?value.slice(1).split('').map(ch=>ch+ch).join(''):value.slice(1);
 return [0,2,4].map(index=>parseInt(hex.slice(index,index+2),16));
}
function calendarColor(value,fallback=CALENDAR_COLORS[0]){
 if(Array.isArray(value)&&value.length===3&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255))return `rgb(${value.join(',')})`;
 return typeof value==='string'&&/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)?value:fallback;
}
const validColor=value=>Array.isArray(value)&&value.length===3&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255)||typeof value==='string'&&/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value);
function normalizeCalendarConfig(input={}, {draft=false}={}){
 const source=input.entities??input.calendars??[];
 if(!Array.isArray(source))throw Error('Calendars must be a list. / Agenda’s moeten een lijst zijn.');
 const entities=source.map((row,index)=>{
  const item=typeof row==='string'?{entity:row}:row&&typeof row==='object'&&!Array.isArray(row)?row:{};
  const color=item.color??calendarRgb(CALENDAR_COLORS[index%CALENDAR_COLORS.length]);
  if(!draft&&!validColor(color))throw Error('Choose an RGB color for each calendar. / Kies een RGB-kleur voor elke agenda.');
  return {...item,entity:item.entity??'',name:item.name??'',color:Array.isArray(color)?[...color]:color};
 });
 const days=input.days_to_show??5,view=input.view??'list',density=input.density??'expanded',weather=input.weather_entity??'';
 if(!draft){
  if(!entities.length||entities.length>12||entities.some(row=>!/^calendar\.[a-z0-9_]+$/.test(row.entity))||new Set(entities.map(row=>row.entity)).size!==entities.length)throw Error('Choose 1–12 different calendar entities. / Kies 1–12 verschillende agenda-entiteiten.');
  if(!Number.isInteger(days)||days<1||days>14)throw Error('Days must be 1–14. / Aantal dagen moet 1–14 zijn.');
  if(!['list','columns','month'].includes(view))throw Error('Choose list, columns or month. / Kies lijst, kolommen of maand.');
  if(!['expanded','compact'].includes(density))throw Error('Choose expanded or compact density. / Kies uitgebreide of compacte weergave.');
  if(weather&&!/^weather\.[a-z0-9_]+$/.test(weather))throw Error('Choose a weather entity. / Kies een weerentiteit.');
  for(const field of ['show_title','show_legend','show_navigation','hide_empty_days'])if(input[field]!==undefined&&typeof input[field]!=='boolean')throw Error(`${field} must be true or false.`);
 }
 const {show_view_switcher: _legacyViewSwitcher,...settings}=input;
 return {...settings,type:'custom:eleven-calendar-card',title:input.title??'',entities,weather_entity:weather,days_to_show:draft&&Object.hasOwn(input,'days_to_show')&&input.days_to_show===undefined?undefined:days,view,density,
  show_title:input.show_title!==false,show_legend:input.show_legend!==false,show_navigation:input.show_navigation!==false,hide_empty_days:input.hide_empty_days===true};
}
const dayMs=86400000,zoneFormats=new Map();
function dateFormatter(zone){
 let formatter=zoneFormats.get(zone);
 if(!formatter){formatter=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});zoneFormats.set(zone,formatter);}
 return formatter;
}
function localCalendarDayKey(value,zone='UTC'){
 const t=typeof value==='number'?value:Date.parse(value);
 if(!Number.isFinite(t))return null;
 const parts=Object.fromEntries(dateFormatter(zone).formatToParts(t).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
function nextCalendarDayKey(key,step=1){return new Date(Date.parse(`${key}T00:00:00Z`)+step*dayMs).toISOString().slice(0,10);}
const mondayIndex=nominal=>(new Date(nominal).getUTCDay()+6)%7;
function calendarDisplayRange(view,daysToShow,offset,todayKey,zone='UTC'){
 const today=Date.parse(`${todayKey}T00:00:00Z`);
 let first,last,monthKey=null;
 if(view==='month'){
  const current=new Date(today),monthStart=Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+offset,1),nextMonth=Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+offset+1,1);
  first=monthStart-mondayIndex(monthStart)*dayMs;
  last=nextMonth+(6-mondayIndex(nextMonth-dayMs))*dayMs;
  monthKey=new Date(monthStart).toISOString().slice(0,10);
 }else{
  first=today+offset*daysToShow*dayMs;last=first+daysToShow*dayMs;
 }
 const count=Math.round((last-first)/dayMs),keys=Array.from({length:count},(_,index)=>new Date(first+index*dayMs).toISOString().slice(0,10));
 const startKey=keys[0],endKey=new Date(last).toISOString().slice(0,10);
 return {startKey,endKey,monthKey,keys,start:calendarDayStart(startKey,zone),end:calendarDayStart(endKey,zone)};
}
function normalizeCalendarEvent(raw,calendar,zone='UTC'){
 if(!raw||typeof raw.start!=='string'||typeof raw.end!=='string')return null;
 const allDay=/^\d{4}-\d{2}-\d{2}$/.test(raw.start)&&/^\d{4}-\d{2}-\d{2}$/.test(raw.end);
 const start=allDay?calendarDayStart(raw.start,zone):Date.parse(raw.start),end=allDay?calendarDayStart(raw.end,zone):Date.parse(raw.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
 return {calendar,summary:String(raw.summary??''),description:String(raw.description??''),location:String(raw.location??''),allDay,
  start,end,startKey:allDay?raw.start:localCalendarDayKey(start,zone),endKey:allDay?raw.end:localCalendarDayKey(end-1,zone)};
}
function calendarDaysWithEvents(range,eventsByEntity,entities,zone='UTC'){
 const events=entities.flatMap(row=>(eventsByEntity[row.entity]??[]).map(event=>normalizeCalendarEvent(event,row.entity,zone)).filter(Boolean));
 const days=range.keys.map(key=>({key,start:calendarDayStart(key,zone),end:calendarDayStart(nextCalendarDayKey(key),zone),events:[]}));
 for(const event of events){
  let low=0,high=days.length;
  while(low<high){const mid=(low+high)>>1;if(days[mid].end<=event.start)low=mid+1;else high=mid;}
  for(let index=low;index<days.length&&days[index].start<event.end;index++)days[index].events.push(event);
 }
 for(const day of days)day.events.sort((a,b)=>Number(b.allDay)-Number(a.allDay)||Math.max(a.start,day.start)-Math.max(b.start,day.start)||a.summary.localeCompare(b.summary));
 return days;
}
function forecastByCalendarDay(forecast,zone='UTC'){
 const days=new Map();
 for(const entry of Array.isArray(forecast)?forecast:[]){
  const key=localCalendarDayKey(entry?.datetime,zone);
  if(key&&!days.has(key))days.set(key,entry);
 }
 return days;
}
const calendarEventKey=event=>JSON.stringify([event.calendar,event.start,event.end,event.summary]);
function nextCalendarEvent(events,now=Date.now()){
 return events.reduce((next,event)=>event.start>now&&(!next||event.start<next.start)?event:next,null);
}

function calendarCardStyles(){return `
:host{display:block;height:100%;min-width:0;min-height:0;container-type:inline-size}
ha-card{display:block;height:100%;min-width:0;min-height:0;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));font:inherit}
.content{display:flex;flex-direction:column;height:100%;padding:16px;min-width:0;min-height:0;box-sizing:border-box}
.content>.header,.content>.legend,.content>.status{flex-shrink:0}
.calendar-body{flex:1;min-height:0;overflow:auto;scrollbar-width:thin}
.legend-error{display:inline-grid;place-items:center;width:13px;height:13px;border:1px solid currentColor;border-radius:50%;color:var(--error-color,#db4437);font-size:10px;line-height:1;flex:none}
.event-button[data-next-event],.month-chip[data-next-event],.popup-more li[data-next-event]{background:color-mix(in srgb,var(--event-color) 18%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--event-color) 50%,transparent)}
.event-button[data-next-event] .event-title{font-weight:650}
.header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 12px;margin-bottom:12px}
.header h2{font-size:18px;line-height:1.25;font-weight:650;margin:0;min-width:72px;flex:1}
.header-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;margin-inline-start:auto}
.navigation{display:flex;align-items:center;min-width:0;border-radius:5px;background:var(--secondary-background-color,#f3f3f3)}
.navigation .range{padding:0 9px;white-space:nowrap;font-size:11px;font-variant-numeric:tabular-nums;border-inline-end:1px solid var(--divider-color,#ddd)}
.navigation [data-nav=now]{width:auto;padding:0 9px}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.info-button{background:var(--secondary-background-color,#f3f3f3);border-radius:5px}
.legend{display:flex;flex-wrap:wrap;align-items:center;gap:6px 15px;margin:0 0 12px;font-size:11px;color:var(--secondary-text-color,#666)}
.legend-item{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;min-height:26px;padding:3px 0;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer}.legend-item[aria-pressed="false"]{opacity:.45}.legend-item[aria-pressed="false"] span{text-decoration:line-through}.legend-item:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:2px}.legend-item span{overflow-wrap:anywhere}.dot{width:7px;height:7px;border-radius:2px;flex:none;background:var(--event-color)}
.status{font-size:12px;line-height:1.45;color:var(--secondary-text-color,#666);margin:6px 0 12px}
.status.error{color:var(--error-color,#db4437)}.status button{font:inherit;cursor:pointer;margin-inline-start:8px;padding:3px 8px;border:1px solid var(--divider-color,#ddd);border-radius:5px;background:transparent;color:inherit}
.day-list{display:grid}.list-day+.list-day{border-top:1px solid var(--divider-color,#ddd);margin-top:12px;padding-top:12px}
.day-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px}
.day-title{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 7px;font-size:12px;font-weight:600}.day-title time{font-size:11px;font-weight:400;color:var(--secondary-text-color,#666)}
.weather{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;font-size:11px;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums}
.weather svg{width:21px;height:21px;flex:none;stroke:currentColor;stroke-width:1.5;fill:none;stroke-linecap:round;stroke-linejoin:round}
.weather b{font-weight:600;color:var(--primary-text-color,#20252b)}
.list-event{display:grid;grid-template-columns:59px minmax(0,1fr);gap:10px;align-items:start;padding:6px 0}
.event-time{font-size:11px;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums;line-height:1.4}.list-event>.event-time small{display:block;font-size:10px}
.event-button{display:block!important;min-width:0;width:100%;text-align:start;padding:0 0 0 9px!important;border-inline-start:3px solid var(--event-color)!important;border-radius:0!important;line-height:1.35}
.event-button .event-title{display:block;font-size:12px;font-weight:500;overflow-wrap:anywhere}.event-button .event-meta{display:block;margin-top:2px;color:var(--secondary-text-color,#666);font-size:10px;overflow-wrap:anywhere}
.empty-day{font-size:11px;color:var(--secondary-text-color,#666);padding:7px 0;margin:0}
.horizontal{overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--divider-color,#ddd) transparent}
.day-columns{display:grid;grid-template-columns:repeat(var(--days),minmax(132px,1fr));min-width:calc(var(--days)*132px)}
.column{min-width:0;padding:0 10px 10px}.column:first-child{padding-left:0}.column:last-child{padding-right:0}.column+.column{border-inline-start:1px solid var(--divider-color,#ddd)}
.column-heading{display:flex;flex-direction:column;gap:6px;min-height:64px;margin-bottom:9px;font-size:12px;font-weight:600}.column-heading time{font-size:11px;color:var(--secondary-text-color,#666);font-weight:400;margin-inline-start:4px}
.column .event-button{padding:7px 7px 7px 9px!important;background:color-mix(in srgb,var(--event-color) 9%,transparent);border-radius:0 5px 5px 0!important;margin-bottom:7px}
.column .event-button:hover,.month-chip:hover{background:color-mix(in srgb,var(--event-color) 17%,transparent)}
.column .event-time{display:block;margin-bottom:4px;color:var(--event-color);font-size:10px}.column .event-title{font-size:11px}.column .event-meta{font-size:10px}
.month-grid{display:grid;grid-template-columns:repeat(7,minmax(95px,1fr));min-width:665px;border-top:1px solid var(--divider-color,#ddd);border-inline-start:1px solid var(--divider-color,#ddd)}
.month-weekday{padding:7px 5px;text-align:center;color:var(--secondary-text-color,#666);font-size:10px;font-weight:600;border-inline-end:1px solid var(--divider-color,#ddd);border-bottom:1px solid var(--divider-color,#ddd)}
.month-cell{min-width:0;min-height:108px;padding:7px 7px 9px;border-inline-end:1px solid var(--divider-color,#ddd);border-bottom:1px solid var(--divider-color,#ddd)}
.month-cell.outside{background:color-mix(in srgb,var(--secondary-text-color,#666) 4%,transparent)}
.month-cell.today{box-shadow:inset 0 0 0 1px var(--primary-color,#2196f3)}
.month-cell-head{display:flex;align-items:center;justify-content:space-between;gap:2px;min-height:22px;margin-bottom:3px;font-size:11px}
.month-cell-head time{font-weight:600}.month-cell.outside .month-cell-head time{color:var(--secondary-text-color,#666)}
.month-cell .weather{gap:2px;font-size:10px}.month-cell .weather svg{width:17px;height:17px}.month-cell .weather .low{display:none}
.month-chip{display:block!important;width:100%;min-height:30px!important;min-width:0;text-align:start;margin:0 0 4px;padding:5px 6px!important;border:0!important;border-inline-start:3px solid var(--event-color)!important;border-radius:0 4px 4px 0!important;background:color-mix(in srgb,var(--event-color) 9%,transparent);font-size:12px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.month-more{display:block;min-height:26px;padding:4px 6px;border:0;background:transparent;color:var(--secondary-text-color,#666);font:inherit;font-size:11px;cursor:pointer;text-align:start}
.compact .content{padding:12px 14px}.compact .header{margin-bottom:8px}.compact .legend{margin-bottom:7px}
.compact .list-day+.list-day{margin-top:7px;padding-top:7px}.compact .day-heading{margin-bottom:2px}
.compact .list-event{grid-template-columns:54px minmax(0,1fr);gap:7px;align-items:center;padding:2px 0}.compact .list-event>.event-time{font-size:10px}.compact .list-event .event-button{min-height:24px!important;padding-inline-start:7px!important}.compact .list-event .event-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.compact .event-meta{display:none}.compact .empty-day{padding:3px 0}
.compact .column{padding-bottom:6px}.compact .column-heading{min-height:48px;margin-bottom:5px;gap:3px}.compact .column .event-button{min-height:24px!important;margin-bottom:4px;padding:4px 6px 4px 8px!important}.compact .column .event-time{margin-bottom:2px}
.compact .month-cell{min-height:74px;padding:3px 4px 5px}.compact .month-cell-head{min-height:19px;margin-bottom:2px}.compact .month-chip{min-height:24px!important;margin-bottom:2px;padding:2px 4px!important;font-size:10px;line-height:1.2}.compact .month-more{min-height:23px;padding:3px 5px;font-size:10px}
.calendar-event-popup{width:min(380px,calc(100vw - 16px))}.calendar-event-popup .ui-popup-heading>strong{min-width:0;overflow-wrap:anywhere}
.popup-calendar{display:flex;align-items:center;gap:7px;margin:5px 0 12px;color:var(--secondary-text-color,#666);font-size:11px}
.popup-when{padding:10px 12px;background:var(--secondary-background-color,#f3f3f3);border-radius:6px}
.popup-date,.popup-date-range{display:flex;flex-wrap:wrap;gap:3px 6px;overflow-wrap:anywhere;font-size:12px;font-weight:600}
.popup-date-range{display:grid;gap:2px}.popup-date-range .popup-date-separator{color:var(--secondary-text-color,#666)}
.popup-time{margin-top:3px;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}.popup-field{padding:10px 0 0;margin-top:10px;border-top:1px solid var(--divider-color,#ddd)}
.popup-field-label{display:block;margin-bottom:3px;color:var(--secondary-text-color,#666);font-size:10px}.popup-location,.popup-description{font-size:12px;overflow-wrap:anywhere}.popup-description{white-space:pre-wrap}
.popup-more{list-style:none;padding:0;margin:9px 0}.popup-more li{padding:5px 0;border-top:1px solid var(--divider-color,#ddd);font-size:11px}.popup-more summary{cursor:pointer}.popup-more small{display:block;color:var(--secondary-text-color,#666)}.popup-more-detail{padding:8px 0 10px 12px}
.calendar-info .insight-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 8px}
.calendar-info .calendar-agenda-metrics{grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:8px 12px;margin:6px 0 0}
.calendar-info .insight-metrics>div{min-width:0}.calendar-info dt{font-size:10px;color:var(--secondary-text-color,#666)}.calendar-info dd{margin:2px 0 0;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.calendar-info .calendar-agenda-metrics dd small{display:block;margin-top:2px;font-size:10px;font-weight:400;color:var(--secondary-text-color,#666)}
.calendar-info .insight-sensor{padding:8px 0}
.calendar-info .insight-sensor+.insight-sensor{border-top:1px solid var(--divider-color,#ddd)}
.calendar-info .insight-sensor-heading{display:flex;align-items:center;gap:8px;min-width:0}.calendar-info .insight-sensor-heading strong{flex:1;min-width:0;overflow-wrap:anywhere}
.calendar-info .insight-states{font-size:10px;color:var(--secondary-text-color,#666);margin-top:4px}
@container(max-width:420px){.content{padding:12px}.header{align-items:flex-start}.header-actions{gap:5px}.navigation .range{font-size:10px;padding:0 6px}.navigation [data-nav=now]{padding:0 6px}.list-event{grid-template-columns:50px minmax(0,1fr);gap:8px}.weather{font-size:10px}}
`;}









const isDutch=hass=>String(hass?.locale?.language??hass?.language??'en').startsWith('nl');
const words={
 calendarUnavailable:['Agenda niet beschikbaar','Calendar unavailable'],nextEvent:['Eerstvolgende afspraak','Next event'],
 title:['Agenda','Calendar'],list:['Daglijst','Day list'],columns:['Dagkolommen','Day columns'],month:['Maand','Month'],today:['Vandaag','Today'],tomorrow:['Morgen','Tomorrow'],
 now:['Nu','Now'],previous:['Vorige periode','Previous period'],next:['Volgende periode','Next period'],info:['Informatie','Information'],close:['Sluiten','Close'],
 allDay:['Hele dag','All day'],noEvents:['Geen afspraken','No events'],loading:['Afspraken laden…','Loading events…'],failed:['Afspraken konden niet worden geladen.','Could not load calendar events.'],
 retry:['Opnieuw','Retry'],select:['Kies een agenda in de configuratie.','Select a calendar in the editor.'],more:['meer','more'],weather:['Weer','Weather'],
 hideCalendar:['Verberg agenda','Hide calendar'],showCalendar:['Toon agenda','Show calendar'],allHidden:['Alle agenda’s zijn verborgen.','All calendars are hidden.'],
 soloHint:['Dubbelklik of Shift+Enter: toon alleen deze agenda. Herhaal om alle agenda’s te tonen.','Double-click or Shift+Enter: show only this calendar. Repeat to show all calendars.'],
 continuing:['Doorlopend','Continuing'],until:['Tot','Until'],from:['Vanaf','From'],
 appointments:['Afspraken','Events'],hidden:['Verborgen','Hidden'],noData:['Nog geen gegevens','No data yet'],
 nextAppointment:['Eerstvolgende','Next event'],location:['Locatie','Location'],description:['Beschrijving','Description']
};
const label=(key,dutch)=>words[key]?.[dutch?0:1]??key;
const fieldLabels={title:['Titel','Title'],view:['Weergave','View'],density:['Dichtheid','Density'],days_to_show:['Aantal dagen','Days to show'],weather_entity:['Weerentiteit','Weather entity'],
 show_title:['Titel tonen','Show title'],show_legend:['Agendalegenda tonen','Show calendar legend'],show_navigation:['Navigatie tonen','Show navigation'],hide_empty_days:['Lege dagen verbergen in daglijst','Hide empty days in day list'],
 entity:['Agenda','Calendar'],name:['Naam','Name'],color:['Kleur','Color']};
const fieldHelp={density:['Compact toont minder details; open een afspraak voor alle informatie.','Compact shows fewer details; open an event for full information.'],days_to_show:['Voor daglijst en dagkolommen; de maandweergave toont altijd een hele maand.','For list and columns; the month view always shows a full month.'],
 weather_entity:['Optioneel. Dagtemperaturen komen uit de dagelijkse voorspelling van deze weerentiteit.','Optional. Daily temperatures come from this weather entity’s daily forecast.'],
 color:['Kleur van afspraken en de legenda.','Color for events and the legend.']};
const selectorOptions=(dutch,items)=>({select:{mode:'dropdown',options:items.map(([value,nl,en])=>({value,label:dutch?nl:en}))}});

class CalendarEditor extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});}
 setConfig(config){this._config=normalizeCalendarConfig(config,{draft:true});this._render();}
 set hass(hass){this._hass=hass;this._render();}get hass(){return this._hass;}
 _formDefinition(fields){const dutch=isDutch(this._hass);return {schema:fields,computeLabel:item=>fieldLabels[item.name]?.[dutch?0:1]??item.name,computeHelper:item=>fieldHelp[item.name]?.[dutch?0:1]};}
 _bind(form,fields,data){const definition=this._formDefinition(fields);form.hass=this._hass;form.schema=definition.schema;form.data=data;form.computeLabel=definition.computeLabel;form.computeHelper=definition.computeHelper;}
 _emit(){const entities=this._config.entities.filter(row=>row.entity).map(row=>({...row,color:Array.isArray(row.color)?[...row.color]:row.color}));this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...this._config,entities}},bubbles:true,composed:true}));}
 _render(){
  if(!this._config||!this._hass)return;
  const dutch=isDutch(this._hass);
  if(!this._form){
   this.shadowRoot.innerHTML=`<style>:host{display:block;min-width:0}ha-form{display:block;min-width:0}h3{font-size:16px;margin:24px 0 12px}details{border:1px solid var(--divider-color,#ddd);border-radius:10px;margin:10px 0;min-width:0}summary{padding:12px;min-height:44px;box-sizing:border-box;cursor:pointer;overflow-wrap:anywhere}.body{padding:0 12px 12px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}button{font:inherit;min-height:36px;border:1px solid var(--divider-color,#ddd);border-radius:6px;padding:6px 12px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#20252b);cursor:pointer}button:disabled{opacity:.4}.remove{margin-inline-start:auto}.error{font-size:12px;color:var(--error-color,#db4437);overflow-wrap:anywhere}.error[hidden]{display:none}button:focus-visible,summary:focus-visible{outline:2px solid var(--primary-color,#2196f3)}</style><ha-form class="global"></ha-form><h3></h3><div class="calendars"></div><button class="add" type="button"></button><p class="error" role="alert" hidden></p>`;
   this._form=this.shadowRoot.querySelector('.global');
   this._form.addEventListener('value-changed',event=>{event.stopPropagation();this._config=normalizeCalendarConfig({...this._config,...event.detail.value,entities:this._config.entities},{draft:true});this._render();this._emit();});
   this.shadowRoot.querySelector('.add').onclick=()=>{if(this._config.entities.length>=12)return;this._config={...this._config,entities:[...this._config.entities,{entity:'',name:'',color:calendarRgb(CALENDAR_COLORS[this._config.entities.length%CALENDAR_COLORS.length])}]};this._render();this.shadowRoot.querySelector('.calendars').lastElementChild.open=true;};
  }
  const global=CalendarCard.getConfigForm(dutch);this._form.hass=this._hass;this._form.schema=global.schema;this._form.data=this._config;this._form.computeLabel=global.computeLabel;this._form.computeHelper=global.computeHelper;
  this.shadowRoot.querySelector('h3').textContent=dutch?'Agenda’s':'Calendars';
  const add=this.shadowRoot.querySelector('.add');add.textContent=dutch?'Agenda toevoegen':'Add calendar';add.disabled=this._config.entities.length>=12;
  const container=this.shadowRoot.querySelector('.calendars');while(container.children.length>this._config.entities.length)container.lastElementChild.remove();
  this._config.entities.forEach((row,index)=>{
   let entry=container.children[index];
   if(!entry){entry=document.createElement('details');entry.open=this._config.entities.length===1;entry.innerHTML='<summary></summary><div class="body"><ha-form></ha-form><div class="actions"><button class="up" type="button"></button><button class="down" type="button"></button><button class="remove" type="button"></button></div></div>';container.append(entry);
    entry.querySelector('ha-form').addEventListener('value-changed',event=>{event.stopPropagation();const entities=this._config.entities.map((item,i)=>i===index?{...item,...event.detail.value}:item);this._config={...this._config,entities};this._render();this._emit();});
    for(const [action,delta] of [['up',-1],['down',1],['remove',0]])entry.querySelector('.'+action).onclick=()=>{const entities=[...this._config.entities];if(action==='remove')entities.splice(index,1);else{const other=index+delta;if(other<0||other>=entities.length)return;[entities[index],entities[other]]=[entities[other],entities[index]];}this._config={...this._config,entities};this._render();this._emit();};
   }
   entry.querySelector('summary').textContent=row.name||this._hass.states?.[row.entity]?.attributes?.friendly_name||row.entity||(dutch?'Nieuwe agenda':'New calendar');
   this._bind(entry.querySelector('ha-form'),[{name:'entity',required:true,selector:{entity:{domain:'calendar'}}},{name:'name',selector:{text:{}}},{name:'color',selector:{color_rgb:{}}}],{...row,color:calendarRgb(row.color)??row.color});
   for(const [action,nl,en] of [['up','Omhoog','Move up'],['down','Omlaag','Move down'],['remove','Verwijderen','Remove']]){const button=entry.querySelector('.'+action);button.textContent=dutch?nl:en;button.disabled=action==='up'?index===0:action==='down'?index===this._config.entities.length-1:false;}
  });
  const error=this.shadowRoot.querySelector('.error');try{if(this._config.entities.some(row=>row.entity))normalizeCalendarConfig(this._config);error.hidden=true;error.textContent='';}catch(problem){error.hidden=false;error.textContent=problem.message.split(' / ')[dutch?1:0]??problem.message;}
 }
}

class CalendarCard extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});this._connected=false;this._calendarGeneration=0;this._weatherGeneration=0;this._calendarUnsubs=[];this._events={};this._statuses={};this._forecast=null;this._weatherError=false;this._view='list';this._offset=0;this._hiddenCalendars=new Set();this._legendClickTimers=new Map();this._popupControllers=[];this._todayKey=null;}
 static getConfigForm(dutch=false){return {schema:[
  {name:'title',selector:{text:{}}},{name:'view',default:'list',selector:selectorOptions(dutch,[['list','Daglijst','Day list'],['columns','Dagkolommen','Day columns'],['month','Maand','Month']])},
  {name:'density',default:'expanded',selector:selectorOptions(dutch,[['expanded','Uitgebreid','Expanded'],['compact','Compact','Compact']])},
  {name:'days_to_show',default:5,selector:{number:{min:1,max:14,step:1,mode:'box'}}},{name:'weather_entity',selector:{entity:{domain:'weather'}}},
  {type:'expandable',name:'appearance',title:dutch?'Weergave':'Appearance',flatten:true,schema:[{name:'show_title',default:true,selector:{boolean:{}}},{name:'show_legend',default:true,selector:{boolean:{}}},{name:'show_navigation',default:true,selector:{boolean:{}}},{name:'hide_empty_days',default:false,selector:{boolean:{}}}]}
 ],computeLabel:item=>fieldLabels[item.name]?.[dutch?0:1]??item.name,computeHelper:item=>fieldHelp[item.name]?.[dutch?0:1]};}
 static async getConfigElement(){
  if(!customElements.get('ha-form')){const helpers=await window.loadCardHelpers();const card=await helpers.createCardElement({type:'entities',entities:[]});await card.constructor.getConfigElement();await customElements.whenDefined('ha-form');}
  if(!customElements.get('eleven-calendar-editor'))customElements.define('eleven-calendar-editor',CalendarEditor);
  return document.createElement('eleven-calendar-editor');
 }
 static getStubConfig(hass){const entity=Object.keys(hass?.states??{}).find(id=>id.startsWith('calendar.'));return {entities:entity?[{entity,color:calendarRgb(CALENDAR_COLORS[0])}]:[],days_to_show:5,view:'list'};}
 setConfig(input){
  const empty=!input?.entities?.length&&!input?.calendars?.length;
  const config=normalizeCalendarConfig(input,{draft:empty}),previous=this._config,wasEmpty=this._emptyConfig;
  if(!empty)normalizeCalendarConfig(input);
  this._cancelLegendClicks();
  this._config=config;this._emptyConfig=empty;
  this._hiddenCalendars=new Set(config.show_legend?config.entities.map(row=>row.entity).filter(id=>this._hiddenCalendars.has(id)):[]);
  const priorIds=previous?.entities?.map(row=>row.entity).join('|'),nextIds=config.entities.map(row=>row.entity).join('|');
  if(!previous||previous.view!==config.view)this._view=config.view;
  if(!previous||previous.days_to_show!==config.days_to_show||previous.view!==config.view)this._offset=0;
  if(this._connected&&this._hass){
   if(empty){this._stopCalendars();this._stopWeather();}
   else{if(priorIds!==nextIds||previous?.days_to_show!==config.days_to_show||previous?.view!==config.view)this._startCalendars();
    if(wasEmpty||previous?.weather_entity!==config.weather_entity)this._startWeather();}
  }
  this._render();
 }
 set hass(hass){
  const previous=this._hass,zone=hass?.config?.time_zone||'UTC',oldZone=previous?.config?.time_zone||'UTC',connectionChanged=previous?.connection!==hass?.connection;
  this._hass=hass;
  const context=JSON.stringify([this._config?.entities?.map(row=>[hass?.states?.[row.entity]?.attributes?.friendly_name,hass?.states?.[row.entity]?.state]),this._config?.weather_entity&&[hass?.states?.[this._config.weather_entity]?.state,hass?.states?.[this._config.weather_entity]?.attributes?.temperature,hass?.states?.[this._config.weather_entity]?.attributes?.temperature_unit]]);
  const displayChanged=context!==this._displayContext;this._displayContext=context;
  const today=localCalendarDayKey(Date.now(),zone);
  if(this._todayKey!==today){this._todayKey=today;this._offset=0;if(this._connected&&this._config&&!this._emptyConfig)this._startCalendars();}
  else if(this._connected&&this._config&&!this._emptyConfig&&(connectionChanged||zone!==oldZone))this._startCalendars();
  if(this._connected&&this._config&&!this._emptyConfig&&(connectionChanged||zone!==oldZone))this._startWeather();
  if(!previous||zone!==oldZone||isDutch(previous)!==isDutch(hass)||connectionChanged||displayChanged)this._render();
  this._scheduleMidnight();
 }
 get hass(){return this._hass;}
 connectedCallback(){this._connected=true;this._todayKey=localCalendarDayKey(Date.now(),this._zone());if(this._config&&!this._emptyConfig){this._startCalendars();this._startWeather();}this._scheduleMidnight();this._render();}
 disconnectedCallback(){this._connected=false;this._cancelLegendClicks();this._stopCalendars();this._stopWeather();this._cleanupUI();clearTimeout(this._midnightTimer);this._midnightTimer=null;clearTimeout(this._nextEventTimer);this._nextEventTimer=null;}
 getCardSize(){const compact=this._config?.density==='compact';return this._view==='month'?(compact?11:14):this._view==='columns'?(compact?6:8):Math.max(3,Math.ceil(((compact?105:130)+(this._config?.days_to_show??5)*(compact?70:100))/50));}
 getGridOptions(){return {columns:12,min_columns:6,rows:Math.max(3,Math.ceil(this.getCardSize()*50/64)),min_rows:3};}
 _zone(){return this._hass?.config?.time_zone||'UTC';}
 _queueRender(){if(this._renderQueued)return;this._renderQueued=true;queueMicrotask(()=>{this._renderQueued=false;if(this._connected)this._render();});}
 _range(){const today=this._todayKey??=localCalendarDayKey(Date.now(),this._zone());return calendarDisplayRange(this._view,this._config?.days_to_show??5,this._offset,today,this._zone());}
 _stopCalendars(){this._calendarGeneration++;clearTimeout(this._calendarRetryTimer);this._calendarRetryTimer=null;for(const unsubscribe of this._calendarUnsubs)try{unsubscribe();}catch{}this._calendarUnsubs=[];}
 _retryCalendars(){if(this._calendarRetryTimer||!this._connected)return;const generation=this._calendarGeneration;this._calendarRetryFailures=(this._calendarRetryFailures??0)+1;this._calendarRetryTimer=setTimeout(()=>{this._calendarRetryTimer=null;if(this._connected&&generation===this._calendarGeneration&&Object.values(this._statuses).includes('error')){this._startCalendars();this._queueRender();}},retryDelay(this._calendarRetryFailures,30000));this._calendarRetryTimer.unref?.();}
 _startCalendars(){
  this._stopCalendars();if(!this._connected||!this._hass||!this._config||this._emptyConfig)return;
  const generation=this._calendarGeneration,range=this._range(),connection=this._hass.connection;
  const rangeKey=`${range.start}/${range.end}`;this._events=this._eventRangeKey===rangeKey?Object.fromEntries(this._config.entities.filter(row=>this._events[row.entity]).map(row=>[row.entity,this._events[row.entity]])):{};this._eventRangeKey=rangeKey;
  this._statuses=Object.fromEntries(this._config.entities.map(row=>[row.entity,'loading']));
  for(const row of this._config.entities){
   const entity=row.entity;
   if(typeof connection?.subscribeMessage!=='function'){this._statuses[entity]='error';this._retryCalendars();continue;}
   try{
    const promise=connection.subscribeMessage(payload=>{
     if(!this._connected||generation!==this._calendarGeneration)return;
     const events=payload?.event?.events??payload?.events;
     this._statuses[entity]=Array.isArray(events)?'ready':'error';if(Array.isArray(events)){this._events[entity]=events;this._eventRevision=(this._eventRevision??0)+1;if(Object.values(this._statuses).every(status=>status==='ready')){this._calendarRetryFailures=0;clearTimeout(this._calendarRetryTimer);this._calendarRetryTimer=null;}}else this._retryCalendars();this._queueRender();
    },{type:'calendar/event/subscribe',entity_id:entity,start:new Date(range.start).toISOString(),end:new Date(range.end).toISOString()});
    Promise.resolve(promise).then(unsubscribe=>{if(typeof unsubscribe!=='function')return;if(!this._connected||generation!==this._calendarGeneration)unsubscribe();else this._calendarUnsubs.push(unsubscribe);},()=>{if(this._connected&&generation===this._calendarGeneration){this._statuses[entity]='error';this._retryCalendars();this._queueRender();}});
   }catch{this._statuses[entity]='error';this._retryCalendars();}
  }
 }
 _stopWeather(){this._weatherGeneration++;clearTimeout(this._weatherRetryTimer);this._weatherRetryTimer=null;this._weatherUnsub?.();this._weatherUnsub=null;}
 _retryWeather(){if(this._weatherRetryTimer||!this._connected)return;const generation=this._weatherGeneration;this._weatherRetryFailures=(this._weatherRetryFailures??0)+1;this._weatherRetryTimer=setTimeout(()=>{this._weatherRetryTimer=null;if(this._connected&&generation===this._weatherGeneration&&this._weatherError)this._startWeather();},retryDelay(this._weatherRetryFailures,30000));this._weatherRetryTimer.unref?.();}
 _startWeather(){
  this._stopWeather();if(this._forecastEntity!==this._config?.weather_entity)this._forecast=null;this._forecastEntity=this._config?.weather_entity;this._weatherError=false;
  if(!this._connected||!this._hass||!this._config?.weather_entity)return;
  const generation=this._weatherGeneration,entity=this._config.weather_entity,state=this._hass.states?.[entity],legacy=state?.attributes?.forecast;
  if(Array.isArray(legacy))this._forecast=legacy;
  const subscribe=this._hass.connection?.subscribeMessage;
  if(typeof subscribe!=='function'){this._weatherError=!this._forecast?.length;if(this._weatherError)this._retryWeather();return;}
  try{
   const promise=subscribe.call(this._hass.connection,payload=>{
    if(!this._connected||generation!==this._weatherGeneration)return;
    if(Array.isArray(payload?.forecast)){this._forecast=payload.forecast;this._weatherError=false;this._weatherRetryFailures=0;clearTimeout(this._weatherRetryTimer);this._weatherRetryTimer=null;}
    else{this._weatherError=true;this._retryWeather();}
    this._queueRender();
   },{type:'weather/subscribe_forecast',forecast_type:'daily',entity_id:entity});
   Promise.resolve(promise).then(unsubscribe=>{if(typeof unsubscribe!=='function')return;if(!this._connected||generation!==this._weatherGeneration)unsubscribe();else this._weatherUnsub=unsubscribe;},()=>{if(this._connected&&generation===this._weatherGeneration){this._weatherError=true;this._retryWeather();this._queueRender();}});
  }catch{this._weatherError=true;this._retryWeather();}
 }
 _scheduleMidnight(){
  clearTimeout(this._midnightTimer);if(!this._connected||!this._hass)return;
  const today=localCalendarDayKey(Date.now(),this._zone()),next=calendarDayStart(nextCalendarDayKey(today),this._zone());
  this._midnightTimer=setTimeout(()=>{const current=localCalendarDayKey(Date.now(),this._zone());if(current!==this._todayKey){this._todayKey=current;this._offset=0;this._startCalendars();this._render();}this._scheduleMidnight();},Math.max(1000,Math.min(86400000,next-Date.now()+100)));
 }
 _calendarName(entity){const row=this._config.entities.find(item=>item.entity===entity);return row?.name||this._hass?.states?.[entity]?.attributes?.friendly_name||entity;}
 _calendarFailed(entity){return this._statuses[entity]==='error'||['unavailable','unknown'].includes(this._hass?.states?.[entity]?.state);}
 _updateNextEvent(){
  this._nextEvent=nextCalendarEvent(this._displayEvents??[]);
  const next=this._nextEvent?calendarEventKey(this._nextEvent):null;
  for(const button of this.shadowRoot.querySelectorAll('[data-calendar-event]')){
   const selected=button.dataset.calendarEvent===next;
   button.toggleAttribute('data-next-event',selected);
   if(selected)button.setAttribute('aria-description',label('nextEvent',isDutch(this._hass)));else button.removeAttribute('aria-description');
  }
  clearTimeout(this._nextEventTimer);this._nextEventTimer=null;
  if(this._connected&&this._nextEvent)this._nextEventTimer=setTimeout(()=>this._updateNextEvent(),Math.max(1,Math.min(2147483647,this._nextEvent.start-Date.now()+1)));
 }
 _eventColor(entity){return calendarColor(this._config.entities.find(item=>item.entity===entity)?.color);}
 _cancelLegendClicks(){cancelUILegendClicks(this);}
 _focusLegend(id){focusUILegend(this,id,'[data-calendar]',button=>button.dataset.calendar);}
 _toggleCalendar(id){if(!this._config.show_legend||!this._config.entities.some(row=>row.entity===id))return;
  if(this._hiddenCalendars.has(id))this._hiddenCalendars.delete(id);else this._hiddenCalendars.add(id);
  this._render();this._focusLegend(id);
 }
 _toggleCalendarIsolation(id){if(!this._config.show_legend||!this._config.entities.some(row=>row.entity===id))return;
  this._cancelLegendClicks();
  const only=this._config.entities.every(row=>this._hiddenCalendars.has(row.entity)===(row.entity!==id));
  this._hiddenCalendars=only?new Set():new Set(this._config.entities.filter(row=>row.entity!==id).map(row=>row.entity));
  this._render();this._focusLegend(id);
 }
 _formatter(options){return new Intl.DateTimeFormat(isDutch(this._hass)?'nl-NL':'en-GB',options);}
 _dayFormatter(options){return this._formatter({timeZone:'UTC',...options});}
 _time(value){return this._formatter({timeZone:this._zone(),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(value);}
 _dayTitle(key){const dutch=isDutch(this._hass);if(key===this._todayKey)return label('today',dutch);if(key===nextCalendarDayKey(this._todayKey))return label('tomorrow',dutch);return this._dayFormatter({weekday:'long'}).format(Date.parse(`${key}T12:00:00Z`));}
 _eventTime(event,day){
  const dutch=isDutch(this._hass);if(event.allDay)return label('allDay',dutch);
  if(event.start<day.start&&event.end>day.end)return label('continuing',dutch);
  if(event.start<day.start)return `${label('until',dutch)} ${this._time(event.end)}`;
  if(event.end>day.end)return `${label('from',dutch)} ${this._time(event.start)}`;
  return `${this._time(event.start)}–${this._time(event.end)}`;
 }
 _weatherIcon(condition){
  const sun='<circle cx="9" cy="8" r="3"/><path d="M9 1v2M9 13v2M2 8H0M16 8h2M3.3 2.3l1.4 1.4M13.3 12.3l1.4 1.4M3.3 13.7l1.4-1.4M13.3 3.7l1.4-1.4"/>';
  const cloud='<path d="M7 18a4 4 0 1 1 .8-7.9A5 5 0 0 1 17.5 12a3 3 0 1 1 .5 6Z"/>';
  const kind=/rain|pouring|lightning|hail|snow/.test(condition)?'rain':/cloud|fog/.test(condition)?'cloud':'sun';
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${kind==='sun'?`<g transform="translate(3 4)">${sun}</g>`:kind==='cloud'?sun+cloud:cloud+'<path d="m9 20-1 2m5-2-1 2m5-2-1 2"/>'}</svg>`;
 }
 _weatherFor(key,forecast){
  if(!this._config.weather_entity)return '';
  const row=forecast.get(key),state=this._hass?.states?.[this._config.weather_entity],current=key===this._todayKey?state:null;
  if(!row&&!current)return '';
  const high=Number(row?.temperature??current?.attributes?.temperature),low=row?.templow==null?NaN:Number(row.templow),condition=String(row?.condition??current?.state??''),unit=state?.attributes?.temperature_unit??'°';
  if(!Number.isFinite(high))return '';
  const text=`${Math.round(high)}${unit}`,description=`${condition||label('weather',isDutch(this._hass))}, ${text}${Number.isFinite(low)?` / ${Math.round(low)}${unit}`:''}`;
  return `<span class="weather" title="${escapeCalendarHtml(description)}" aria-label="${escapeCalendarHtml(description)}">${this._weatherIcon(condition)}<span><b>${escapeCalendarHtml(text)}</b>${Number.isFinite(low)?`<span class="low"> / ${Math.round(low)}${escapeCalendarHtml(unit)}</span>`:''}</span></span>`;
 }
 _detailTime(event){
  const dutch=isDutch(this._hass),options={weekday:'long',day:'numeric',month:'long',year:'numeric'};
  if(event.allDay){
   const format=this._dayFormatter(options),first=event.startKey,last=nextCalendarDayKey(event.endKey,-1);
   return `<div class="popup-date"><time datetime="${first}">${escapeCalendarHtml(format.format(Date.parse(`${first}T12:00:00Z`)))}</time>${last!==first?`<span class="popup-date-separator">–</span><time datetime="${last}">${escapeCalendarHtml(format.format(Date.parse(`${last}T12:00:00Z`)))}</time>`:''}</div><div class="popup-time">${label('allDay',dutch)}</div>`;
  }
  const format=this._formatter({timeZone:this._zone(),...options}),startKey=localCalendarDayKey(event.start,this._zone()),endKey=localCalendarDayKey(event.end,this._zone());
  if(startKey===endKey)return `<div class="popup-date"><time datetime="${new Date(event.start).toISOString()}">${escapeCalendarHtml(format.format(event.start))}</time></div><div class="popup-time">${escapeCalendarHtml(this._time(event.start))}–${escapeCalendarHtml(this._time(event.end))}</div>`;
  return `<div class="popup-date-range"><time datetime="${new Date(event.start).toISOString()}">${escapeCalendarHtml(format.format(event.start))} · ${escapeCalendarHtml(this._time(event.start))}</time><span class="popup-date-separator">–</span><time datetime="${new Date(event.end).toISOString()}">${escapeCalendarHtml(format.format(event.end))} · ${escapeCalendarHtml(this._time(event.end))}</time></div>`;
 }
 _eventButton(event,day,variant='list'){
  const dutch=isDutch(this._hass),name=this._calendarName(event.calendar),title=event.summary||(dutch?'Afspraak':'Event'),time=this._eventTime(event,day),id=`calendar-event-${this._popupSeq++}`;
  const content=variant==='month'?`${!event.allDay?`<span>${escapeCalendarHtml(this._time(event.start))} </span>`:''}${escapeCalendarHtml(title)}`:
   `${variant==='columns'?`<span class="event-time">${escapeCalendarHtml(time)}</span>`:''}<span class="event-title">${escapeCalendarHtml(title)}</span><span class="event-meta">${escapeCalendarHtml(name)}${event.location?' · '+escapeCalendarHtml(event.location):''}</span>`;
  const popup=uiPopup({id,title,className:'calendar-event-popup',closeLabel:label('close',dutch),content:`<div class="popup-calendar" style="--event-color:${this._eventColor(event.calendar)}"><i class="dot"></i>${escapeCalendarHtml(name)}</div><div class="popup-when">${this._detailTime(event)}</div>${event.location?`<div class="popup-field"><span class="popup-field-label">${label('location',dutch)}</span><div class="popup-location">${escapeCalendarHtml(event.location)}</div></div>`:''}${event.description?`<div class="popup-field"><span class="popup-field-label">${label('description',dutch)}</span><div class="popup-description">${escapeCalendarHtml(event.description)}</div></div>`:''}`});
  this._popupMarkup.push(popup);
  return uiButton({variant:'text',className:variant==='month'?'month-chip':'event-button',content,label:`${title}, ${time}, ${name}`,title:`${title} · ${time}`,attrs:{'data-event-popup-id':id,'data-calendar-event':calendarEventKey(event),'aria-controls':id,'aria-haspopup':'dialog',style:`--event-color:${this._eventColor(event.calendar)}`}});
 }
 _list(days,forecast){
  const short=this._dayFormatter({day:'numeric',month:'short'}),dutch=isDutch(this._hass);
  if(this._config.hide_empty_days)days=days.filter(day=>day.events.length);
  if(!days.length)return `<p class="status" role="status">${label('noEvents',dutch)}</p>`;
  return `<div class="day-list">${days.map(day=>`<section class="list-day"><div class="day-heading"><div class="day-title">${escapeCalendarHtml(this._dayTitle(day.key))}<time datetime="${day.key}">${short.format(Date.parse(`${day.key}T12:00:00Z`))}</time></div>${this._weatherFor(day.key,forecast)}</div>${day.events.length?day.events.map(event=>`<div class="list-event"><span class="event-time">${event.allDay?label('allDay',dutch):escapeCalendarHtml(this._eventTime(event,day))}</span>${this._eventButton(event,day)}</div>`).join(''):`<p class="empty-day">${label('noEvents',dutch)}</p>`}</section>`).join('')}</div>`;
 }
 _columns(days,forecast){
  const short=this._dayFormatter({weekday:'short'}),date=this._dayFormatter({day:'numeric',month:'short'}),dutch=isDutch(this._hass);
  return `<div class="horizontal" tabindex="0" role="region" aria-label="${label('columns',dutch)}"><div class="day-columns" style="--days:${days.length}">${days.map(day=>`<section class="column"><div class="column-heading"><div>${short.format(Date.parse(`${day.key}T12:00:00Z`))}<time datetime="${day.key}">${date.format(Date.parse(`${day.key}T12:00:00Z`))}</time></div>${this._weatherFor(day.key,forecast)}</div>${day.events.length?day.events.map(event=>this._eventButton(event,day,'columns')).join(''):`<p class="empty-day">${label('noEvents',dutch)}</p>`}</section>`).join('')}</div></div>`;
 }
 _month(days,range,forecast){
  const dutch=isDutch(this._hass),weekday=this._dayFormatter({weekday:'short'}),names=Array.from({length:7},(_,index)=>weekday.format(Date.UTC(2024,0,1+index)));
  const rows=days.map(day=>{
   const outside=day.key.slice(0,7)!==range.monthKey.slice(0,7),visible=day.events.slice(0,this._config.density==='compact'?2:3),remaining=day.events.length-visible.length;
   let more='';
   if(remaining){const id=`calendar-more-${this._popupSeq++}`,title=this._dayFormatter({weekday:'long',day:'numeric',month:'long'}).format(Date.parse(`${day.key}T12:00:00Z`));
    this._popupMarkup.push(uiPopup({id,title,closeLabel:label('close',dutch),content:`<ul class="popup-more">${day.events.map(event=>`<li data-calendar-event="${escapeCalendarHtml(calendarEventKey(event))}" style="--event-color:${this._eventColor(event.calendar)}"><details><summary><strong>${escapeCalendarHtml(event.summary||label('title',dutch))}</strong><small>${escapeCalendarHtml(this._eventTime(event,day))} · ${escapeCalendarHtml(this._calendarName(event.calendar))}</small></summary><div class="popup-more-detail"><div class="popup-when">${this._detailTime(event)}</div>${event.location?`<div class="popup-field"><span class="popup-field-label">${label('location',dutch)}</span><div class="popup-location">${escapeCalendarHtml(event.location)}</div></div>`:''}${event.description?`<div class="popup-field"><span class="popup-field-label">${label('description',dutch)}</span><div class="popup-description">${escapeCalendarHtml(event.description)}</div></div>`:''}</div></details></li>`).join('')}</ul>`}));
    more=uiButton({variant:'text',className:'month-more',text:`+${remaining} ${label('more',dutch)}`,label:`+${remaining} ${label('more',dutch)}`,attrs:{'data-event-popup-id':id,'aria-controls':id,'aria-haspopup':'dialog'}});
   }
   return `<section class="month-cell ${outside?'outside':''} ${day.key===this._todayKey?'today':''}" aria-label="${escapeCalendarHtml(this._dayFormatter({weekday:'long',day:'numeric',month:'long'}).format(Date.parse(`${day.key}T12:00:00Z`)))}"><div class="month-cell-head"><time datetime="${day.key}">${Number(day.key.slice(8))}</time>${this._weatherFor(day.key,forecast)}</div>${visible.map(event=>this._eventButton(event,day,'month')).join('')}${more}</section>`;
  }).join('');
  return `<div class="horizontal" tabindex="0" role="region" aria-label="${label('month',dutch)}"><div class="month-grid">${names.map(name=>`<div class="month-weekday">${escapeCalendarHtml(name)}</div>`).join('')}${rows}</div></div>`;
 }
 _status(){const dutch=isDutch(this._hass),states=Object.values(this._statuses);if(states.includes('error'))return `<p class="status error" role="status">${label('failed',dutch)}<button type="button" data-retry>${label('retry',dutch)}</button></p>`;
  if(states.includes('loading'))return `<p class="status" role="status">${label('loading',dutch)}</p>`;return '';}
 _rangeLabel(range){const short=this._dayFormatter({day:'numeric',month:'short'});if(this._view==='month')return this._dayFormatter({month:'long',year:'numeric'}).format(Date.parse(`${range.monthKey}T12:00:00Z`));return `${short.format(Date.parse(`${range.startKey}T12:00:00Z`))}–${short.format(Date.parse(`${nextCalendarDayKey(range.endKey,-1)}T12:00:00Z`))}`;}
 _infoPopup(dutch,range,days){
  const unique=events=>[...new Map(events.map(event=>[calendarEventKey(event),event])).values()];
  const periodDays=this._view==='month'?days.filter(day=>day.key.slice(0,7)===range.monthKey.slice(0,7)):days;
  const all=unique(periodDays.flatMap(day=>day.events));
  const locale=dutch?'nl-NL':'en-GB',nextFormat=new Intl.DateTimeFormat(locale,{timeZone:this._zone(),weekday:'short',day:'numeric',month:'short'});
  const rows=this._config.entities.map(row=>{
   const id=row.entity,events=all.filter(event=>event.calendar===id),next=nextCalendarEvent(events),hidden=this._hiddenCalendars.has(id),status=this._statuses[id],failed=this._calendarFailed(id);
   const states=[hidden?label('hidden',dutch):'',failed?label('calendarUnavailable',dutch):status==='loading'?label('loading',dutch):status!=='ready'?label('noData',dutch):''].filter(Boolean);
   const nextText=next?escapeCalendarHtml(next.summary||label('title',dutch)):'—',nextWhen=next?`${nextFormat.format(next.start)}${next.allDay?` · ${label('allDay',dutch)}`:` · ${this._time(next.start)}`}`:'';
   return `<section class="insight-sensor" data-information-entity="${escapeCalendarHtml(id)}"><div class="insight-sensor-heading"><i class="dot" style="--event-color:${this._eventColor(id)}" aria-hidden="true"></i><strong>${escapeCalendarHtml(this._calendarName(id))}</strong></div><dl class="insight-metrics calendar-agenda-metrics"><div><dt>${label('appointments',dutch)}</dt><dd>${status==='ready'?events.length:'—'}</dd></div><div><dt>${label('nextAppointment',dutch)}</dt><dd>${status==='ready'?nextText:'—'}${status==='ready'&&next?`<small>${escapeCalendarHtml(nextWhen)}</small>`:''}</dd></div></dl>${states.length?`<div class="insight-states" role="status">${escapeCalendarHtml(states.join(' · '))}</div>`:''}</section>`;
  }).join('');
  const content=`<div class="calendar-info"><div class="insight-sensors">${rows}</div></div>`;
  return uiPopup({id:'calendar-info',className:'insight-popup',title:dutch?'Gegevens':'Data information',closeLabel:label('close',dutch),content});
 }
 _cleanupUI(){for(const controller of this._popupControllers){controller.close();controller.disconnect();}this._popupControllers=[];}
 _render(){
  if(!this._config)return;
  const dutch=isDutch(this._hass),range=this._range(),renderKey=`${this._view}/${range.startKey}/${range.endKey}`,sameRange=this._renderKey===renderKey,scroll=sameRange?this.shadowRoot.querySelector('.horizontal')?.scrollLeft??0:0,scrollTop=sameRange?this.shadowRoot.querySelector('.calendar-body')?.scrollTop??0:0,focusedNav=this.shadowRoot.activeElement?.dataset?.nav;
  this._renderKey=renderKey;
  this._cleanupUI();
  if(this._emptyConfig){this._displayEvents=[];this._updateNextEvent();this.shadowRoot.innerHTML=`<style>${calendarCardStyles()}</style><ha-card><div class="content"><div class="status">${label('select',dutch)}</div></div></ha-card>`;return;}
  const visibleEntities=this._config.entities.filter(row=>!this._hiddenCalendars.has(row.entity));
  const daysKey=`${range.start}/${range.end}/${this._zone()}/${this._eventRevision??0}/${this._config.entities.map(row=>row.entity).join('|')}`;
  if(this._daysKey!==daysKey){this._daysCache=calendarDaysWithEvents(range,this._events,this._config.entities,this._zone());this._daysKey=daysKey;}
  const days=this._daysCache,visibleDays=days.map(day=>({...day,events:day.events.filter(event=>!this._hiddenCalendars.has(event.calendar))})),forecast=forecastByCalendarDay(this._forecast,this._zone());
  this._displayEvents=visibleDays.flatMap(day=>day.events);
  this._popupSeq=0;this._popupMarkup=[];
  const loadingOnly=Object.values(this._statuses).length>0&&Object.values(this._statuses).every(status=>status==='loading')&&!Object.values(this._events).some(events=>events.length);
  const body=!visibleEntities.length?`<p class="status" role="status">${label('allHidden',dutch)}</p>`:loadingOnly?'':this._view==='columns'?this._columns(visibleDays,forecast):this._view==='month'?this._month(visibleDays,range,forecast):this._list(visibleDays,forecast);
  const button=(action,content,name)=>uiButton({content,label:name,title:name,attrs:{'data-nav':action}});
  const navigation=this._config.show_navigation?`<div class="navigation"><span class="range">${escapeCalendarHtml(this._rangeLabel(range))}</span>${button('previous',cardHeaderIcon('previous'),label('previous',dutch))}${button('now',label('now',dutch),this._view==='month'?label('today',dutch):label('now',dutch))}${button('next',cardHeaderIcon('next'),label('next',dutch))}</div>`:'';
  const info=uiButton({content:cardHeaderIcon('info'),className:'info-button',label:label('info',dutch),attrs:{'data-info':'','aria-controls':'calendar-info','aria-haspopup':'dialog'}});
  const legend=this._config.show_legend?uiLegend({items:this._config.entities.map(row=>{const name=this._calendarName(row.entity),visible=!this._hiddenCalendars.has(row.entity),failed=this._calendarFailed(row.entity),failure=failed?label('calendarUnavailable',dutch):'';return {id:row.entity,visible,title:label(visible?'hideCalendar':'showCalendar',dutch)+' '+name+'.'+(failure?' '+failure+'.':''),attrs:{'data-calendar':row.entity,'data-calendar-error':failed?'':null,'aria-label':failure?name+'. '+failure:null,style:`--event-color:${this._eventColor(row.entity)}`},content:`<i class="dot"></i><span>${escapeCalendarHtml(name)}</span>${failed?'<b class="legend-error" aria-hidden="true">!</b>':''}`};})}):'';
  this.shadowRoot.innerHTML=`<style>${uiButtonStyles()}${uiPopupStyles()}${calendarCardStyles()}</style><ha-card class="${this._config.density==='compact'?'compact':''}"><div class="content"><header class="header">${this._config.show_title?`<h2>${escapeCalendarHtml(this._config.title||label('title',dutch))}</h2>`:''}<div class="header-actions">${navigation}${info}</div></header>${legend}${this._status()}<div class="calendar-body">${body}</div>${this._infoPopup(dutch,range,days)}${this._popupMarkup.join('')}</div></ha-card>`;
  const horizontal=this.shadowRoot.querySelector('.horizontal');if(horizontal)horizontal.scrollLeft=scroll;
  const calendarBody=this.shadowRoot.querySelector('.calendar-body');if(calendarBody)calendarBody.scrollTop=scrollTop;
  this._updateNextEvent();
  bindUILegend(this,{selector:'[data-calendar]',getId:button=>button.dataset.calendar,hint:label('soloHint',dutch),toggle:id=>this._toggleCalendar(id),isolate:id=>this._toggleCalendarIsolation(id)});
  for(const action of this.shadowRoot.querySelectorAll('[data-nav]'))action.onclick=()=>{const kind=action.dataset.nav;this._offset=kind==='now'?0:this._offset+(kind==='previous'?-1:1);this._startCalendars();this._render();this.shadowRoot.querySelector(`[data-nav="${kind}"]`)?.focus({preventScroll:true});};
  if(focusedNav)this.shadowRoot.querySelector(`[data-nav="${focusedNav}"]`)?.focus({preventScroll:true});
  const makePopup=(trigger,popup)=>{let control;control=bindUIPopup({trigger,popup,container:this.shadowRoot.querySelector('ha-card'),beforeOpen:()=>this._popupControllers.forEach(item=>{if(item!==control)item.close();})});this._popupControllers.push(control);};
  makePopup(this.shadowRoot.querySelector('[data-info]'),this.shadowRoot.querySelector('#calendar-info'));
  for(const trigger of this.shadowRoot.querySelectorAll('[data-event-popup-id]'))makePopup(trigger,this.shadowRoot.getElementById(trigger.dataset.eventPopupId));
  this.shadowRoot.querySelector('[data-retry]')?.addEventListener('click',()=>{this._calendarRetryFailures=0;this._startCalendars();this._render();});
 }
}

if(!customElements.get('eleven-calendar-card'))customElements.define('eleven-calendar-card',CalendarCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(card=>card.type==='eleven-calendar-card'))window.customCards.push({type:'eleven-calendar-card',name:'Eleven Calendar (beta)',description:'Calendar events in a list, day columns or month view, with optional weather.',preview:true});
})();
