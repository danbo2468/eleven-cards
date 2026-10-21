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
