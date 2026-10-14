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
 const row={entity:config.entities[index],...(option.name?{name:option.name}:{}),
  line_width:option.line_width??config.line_width??3.5,line_style:option.line_style??config.line_style??(index%2?'dashed':'solid'),
  line_interpolation:option.line_interpolation??config.line_interpolation??'step',
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
 const data={hours_to_show:24,graph_mode:'lines',aggregation_period:'none',aggregation_method:'avg',show_hover_line:true,show_legend:true,sync_hover:true,hover_sync_group:'',...config,entities:(config.entities??[]).map((entity,index)=>{
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
 if(old.entity!==rows[index].entity)for(const row of rows){
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
 const result={line_interpolation:'step',line_width:3.5,show_fill:false,fill_fade:true,fill_opacity:0.18,show_hover_line:true,show_legend:true,sync_hover:true,hover_sync_group:'',...config,entities:[...entities],hours_to_show:hours};
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
 if(!Number.isFinite(result.line_width)||result.line_width<1||result.line_width>8) throw new Error('line_width');
 if(result.line_style!=null&&!['solid','dashed','dotted'].includes(result.line_style)) throw new Error('line_style');
 for(const key of ['line_color','fill_color']) if(result[key]!=null&&result[key]!==''&&!validColor(result[key])) throw new Error(key);
 for(const key of ['show_fill','fill_fade','show_hover_line','show_legend']) if(typeof result[key]!=='boolean') throw new Error(key);
 if(!Number.isFinite(result.fill_opacity)||result.fill_opacity<0||result.fill_opacity>1) throw new Error('fill_opacity');
 const stops=result.gradient_stops??[];
 if(!Array.isArray(stops)||(stops.length!==0&&stops.length<2)||stops.length>32||stops.some(s=>!s||!Number.isFinite(s.value)||!validColor(s.color))||new Set(stops.map(s=>s.value)).size!==stops.length) throw new Error('gradient_stops');
 result.gradient_stops=stops.map(s=>({value:s.value,color:Array.isArray(s.color)?[...s.color]:s.color})).sort((a,b)=>a.value-b.value);
 result.gradient_mode=result.gradient_mode??'smooth';
 if(!['smooth','steps'].includes(result.gradient_mode)) throw new Error('gradient_mode');
 result.graph_mode=result.graph_mode??'lines';
 result.aggregation_period=result.aggregation_period??'none';result.aggregation_method=result.aggregation_method??'avg';
 if(!['none','minute','quarter_hour','hour','day','week','month'].includes(result.aggregation_period))throw new Error('aggregation_period');
 if(!['min','max','avg'].includes(result.aggregation_method))throw new Error('aggregation_method');
 if(!['lines','stacked'].includes(result.graph_mode))throw new Error('graph_mode');
 const options=result.series_options??[];
 if(!Array.isArray(options)||options.some(s=>!s||!entities.includes(s.entity)||(s.name!=null&&typeof s.name!=='string')||(s.color!=null&&s.color!==''&&!validColor(s.color)))||new Set(options.map(s=>s.entity)).size!==options.length)throw new Error('series_options');
 result.series_options=options.map(s=>{
  if(s.line_style_source!=null&&s.line_style_source!==''&&(typeof s.line_style_source!=='string'||!entities.includes(s.line_style_source)||s.line_style_source===s.entity))throw new Error('line_style_source');
  if(s.line_width!=null&&(!Number.isFinite(s.line_width)||s.line_width<1||s.line_width>8))throw new Error('series_line_width');
  for(const [key,allowed] of Object.entries({line_style:['solid','dashed','dotted'],line_interpolation:['smooth','linear','step'],color_mode:['fixed','gradient'],fill_mode:['line','own']}))if(s[key]!=null&&!allowed.includes(s[key]))throw new Error('series_'+key);
  for(const key of ['show_fill','fill_fade'])if(s[key]!=null&&typeof s[key]!=='boolean')throw new Error('series_'+key);
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
 if(items.some(item=>item.unit!==items[0].unit)) throw new Error('unit');
 return {items,unit:items[0].unit};
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
const zoneFormats=new Map();
function localParts(t,zone){
 let format=zoneFormats.get(zone);if(!format){format=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});zoneFormats.set(zone,format);}
 return Object.fromEntries(format.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
}
function localEpoch(t,zone){const p=localParts(t,zone);return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
function midnight(nominal,zone){
 let t=nominal;for(let i=0;i<6;i++){const next=nominal-(localEpoch(t,zone)-t);if(next===t)return t;t=next;}
 // Midnight can be skipped by a timezone transition. Find the first valid
 // instant of the requested local date rather than oscillating across it.
 let low=nominal-36*3600000,high=nominal+36*3600000;
 while(high-low>1000){const mid=Math.floor((low+high)/2000)*1000,p=localParts(mid,zone);if(Date.UTC(p.year,p.month-1,p.day)>=nominal)high=mid;else low=mid;}
 return high;
}
function periodBounds(t,period,zone='UTC'){
 zone ||= 'UTC';const p=localParts(t,zone),size={minute:60000,quarter_hour:900000,hour:3600000}[period];
 if(size){const local=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),a=t-(local%size)-(t%1000);return [a,a+size];}
 let nominal=Date.UTC(p.year,p.month-1,period==='month'?1:p.day);let next;
 if(period==='week'){const day=new Date(nominal).getUTCDay();nominal-=((day+6)%7)*86400000;next=nominal+7*86400000;}
 else if(period==='month')next=Date.UTC(p.year,p.month,1);
 else next=nominal+86400000;
 return [midnight(nominal,zone),midnight(next,zone)];
}
function aggregateSeries(series,start,end,period='none',method='avg',zone='UTC'){
 if(period==='none')return series;
 const bounds=[];for(let a=start;a<end;){const b=Math.min(end,periodBounds(a,period,zone)[1]);bounds.push([a,b]);a=b;}
 return series.map(s=>{const points=[];let index=0;
  for(const [a,b] of bounds){let cursor=a,total=0,duration=0,min=Infinity,max=-Infinity;
   while(index<s.points.length&&s.points[index].t<=a)index++;
   let value=index?s.points[index-1].v:null;const fragments=[{t:a,valid:value!==null}];
   while(cursor<b){const until=Math.min(b,s.points[index]?.t??b);if(value!==null){total+=value*(until-cursor);duration+=until-cursor;min=Math.min(min,value);max=Math.max(max,value);}cursor=until;if(cursor<b){value=s.points[index++].v;if((value!==null)!==fragments.at(-1).valid)fragments.push({t:cursor,valid:value!==null});}}
   const aggregate=duration?(method==='min'?min:method==='max'?max:total/duration):null;
   for(const f of fragments)points.push({t:f.t,v:f.valid?aggregate:null});
  }
  return {id:s.id,points};
 });
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
 title:['History','Historie'],loading:['Loading history…','Historie laden…'],empty:['No numeric history in this range.','Geen numerieke historie in deze periode.'],error:['History unavailable. Check recorder and connection.','Historie niet beschikbaar. Controleer recorder en verbinding.'],unit:['All sensors must have the same unit.','Alle sensoren moeten dezelfde eenheid hebben.'],missing:['Configured sensor not found.','Ingestelde sensor niet gevonden.'],unavailable:['Unavailable','Niet beschikbaar'],retry:['Retry','Opnieuw proberen'],chart:['History graph. Arrow keys, Home and End select a time; Escape closes details.','Historiegrafiek. Pijltjes, Home en End selecteren een tijd; Escape sluit details.'],entities:['Sensors','Sensoren'],hours_to_show:['Hours to show','Aantal uren'],hoursHelper:['Historical range: 1–8760 hours. All sensors must use the same unit.','Historische periode: 1–8760 uur. Alle sensoren moeten dezelfde eenheid hebben.'],titleField:['Title','Titel'],partial:['Some sensors have no numeric history:','Sommige sensoren hebben geen numerieke historie:'],config:['Invalid configuration: use 1–8 distinct sensors and 1–8760 hours.','Ongeldige configuratie: gebruik 1–8 unieke sensoren en 1–8760 uur.']};
Object.assign(translations,{
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
 line_interpolationHelper:['Display only: connects recorded points. Unavailable gaps remain gaps.','Alleen weergave: verbindt geregistreerde punten. Niet-beschikbare waarden blijven gaten.'],
 y_min:['Y-axis minimum','Minimum Y-as'],y_max:['Y-axis maximum','Maximum Y-as'],
 y_minHelper:['Optional. Empty scales automatically. Uses the sensor unit.','Optioneel. Leeg schaalt automatisch. Gebruikt de sensoreenheid.'],
 y_maxHelper:['Optional. Empty scales automatically. Must exceed the minimum.','Optioneel. Leeg schaalt automatisch. Moet hoger zijn dan het minimum.'],
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
function number(value,lang){return new Intl.NumberFormat(lang==='nl'?'nl-NL':'en-GB',{maximumFractionDigits:2}).format(value);}
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
 setConfig(config){this._data=editorConfig(config);this._render();}
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
  this._bind(this._form,HistoryGraphCard.getConfigForm(),this._data);
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
   this._bind(entry.querySelector('ha-form'),HistoryGraphCard.getSeriesConfigForm(row,this._data.entities),{...row,line_style_source:row.line_style_source??''});
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
   {name:'hours_to_show',selector:{number:{min:1,max:8760,step:0.5,mode:'box'}}},
   {type:'expandable',name:'graph_settings',get title(){return label('graph_settings');},flatten:true,schema:[
    {name:'graph_mode',default:'lines',selector:select(['lines','stacked'])},
    {name:'show_legend',default:true,selector:{boolean:{}}},
    {name:'show_hover_line',default:true,selector:{boolean:{}}},
    {name:'sync_hover',default:true,selector:{boolean:{}}},
    {name:'hover_sync_group',selector:{text:{}}},
    {name:'y_min',selector:{number:{step:'any',mode:'box'}}},
    {name:'y_max',selector:{number:{step:'any',mode:'box'}}}
   ]},
   {type:'expandable',name:'data_processing',get title(){return label('data_processing');},flatten:true,schema:[
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
   {type:'expandable',name:'series_line',get title(){return label('series_line');},flatten:true,expanded:true,schema:[
    ...(rows.filter(s=>s.entity).length>1?[{name:'line_style_source',selector:sourceSelector}]:[]),
    ...(!row.line_style_source?[
     {name:'line_width',required:true,selector:{number:{min:1,max:8,step:0.5,mode:'box',unit_of_measurement:'px'}}},
     {name:'line_style',required:true,selector:select(['solid','dashed','dotted'])},
     {name:'line_interpolation',required:true,default:'step',selector:select(['smooth','linear','step'],'interpolation_')}
    ]:[]),
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
   const {stops,mode}=this._seriesAppearance(index);if(!stops.length)return '';
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
 setConfig(config){let validated;try{validated=validateConfig(config);}catch(error){throw new Error(text(error.message?.startsWith('line_style_source')?'line_style_source_error':'config',language(this._hass??frontendHass())));}SharedGraph.clearHover(this);this._config=validated;this._generation++;this._inFlight=false;this._series=[];this._rawSeries=null;this._viewport=null;this._status='loading';clearTimeout(this._timer);this._timer=null;this._render();if(this._connected&&this._hass)this._refresh();}
 set hass(hass){this._hass=hass;if(!this._config)return;let signature;try{const meta=seriesMetadata(hass,this._config.entities);signature=JSON.stringify([meta,language(hass),hass.config?.time_zone]);}catch(e){signature=e.message;}
  if(signature!==this._signature){this._signature=signature;this._render();}
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
 disconnectedCallback(){SharedGraph.disconnectHover(this);this._connected=false;unregisterElfPreview(this._elfPreview);this._elfPreviewUntil=0;this._generation++;this._inFlight=false;this._started=false;clearTimeout(this._timer);this._timer=null;clearTimeout(this._elfTimer);this._elfTimer=null;document.removeEventListener('pointerdown',this._outside);}
 async _refresh(){
  if(!this._connected||!this._config||!this._hass||this._inFlight)return;
  clearTimeout(this._timer);this._timer=null;const generation=++this._generation;this._inFlight=true;this._started=true;
  const config=this._config,hass=this._hass;const end=Date.now(),start=end-config.hours_to_show*3600000;
  this._status='loading';this._render();let timeout;
  try{
   seriesMetadata(hass,config.entities);
   const response=await Promise.race([hass.callApi('GET',historyUrl(config,end)),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('timeout')),15000);timeout.unref?.();})]);
   if(generation!==this._generation||!this._connected)return;
   seriesMetadata(this._hass,config.entities);
   this._series=decodeHistory(response,config.entities,start,end);this._rawSeries=this._series;this._start=start;this._end=end;
   this._status=this._series.some(s=>s.points.some(p=>p.v!==null))?'ready':'empty';
  }catch(e){if(generation!==this._generation||!this._connected)return;this._status=['missing','unit'].includes(e.message)?e.message:'error';this._series=[];}
  finally{clearTimeout(timeout);if(generation===this._generation&&this._connected){this._inFlight=false;this._render();this._timer=setTimeout(()=>this._refresh(),REFRESH_MS);this._timer.unref?.();}}
 }
 _render(){
  if(!this._config)return;const lang=language(this._hass);this._lang=lang;this._zone=this._hass?.config?.time_zone;
  let meta;try{meta=seriesMetadata(this._hass??{},this._config.entities,this._config.series_options);}catch(e){if(this._hass)this._status=e.message;}
  const title=this._config.title??text('title',lang);let content='';
  if(this._status!=='ready'||!meta){content=`<div class="state" role="status">${escapeHtml(text(this._status,lang))}${['error','unit','missing'].includes(this._status)?`<button class="retry">${text('retry',lang)}</button>`:''}</div>`;}
  else{
   this._rawSeries??=this._series;
   const key=JSON.stringify([this._start,this._end,this._zone,this._config.aggregation_period,this._config.aggregation_method]);
   if(this._processedRaw!==this._rawSeries||this._processedKey!==key){this._series=aggregateSeries(this._rawSeries,this._start,this._end,this._config.aggregation_period,this._config.aggregation_method,this._zone);this._processedRaw=this._rawSeries;this._processedKey=key;}
   if(this._plotSource!==this._series||this._plotMode!==this._config.graph_mode){this._plotSeries=this._config.graph_mode==='stacked'?stackSeries(this._series,this._start,this._end):this._series;this._plotSource=this._series;this._plotMode=this._config.graph_mode;}
   this._meta=meta;const [min,max]=yRange(this._plotSeries,this._config);this._range=[min,max];
   this._viewStart=Math.max(this._start,this._viewport?.[0]??this._start);this._viewEnd=Math.min(this._end,this._viewport?.[1]??this._end);
   if(this._viewEnd<=this._viewStart){this._viewport=null;this._viewStart=this._start;this._viewEnd=this._end;}
   const x=t=>(t-this._viewStart)/(this._viewEnd-this._viewStart)*1000,y=v=>(max-v)/(max-min)*300;
   const axes=Array.from({length:5},(_,i)=>{const ratio=i/4;return `<span class="axis-y" style="top:calc(${ratio*100}% + ${22-ratio*52}px)">${escapeHtml(number(max-(max-min)*ratio,lang))}</span>`;}).join('');
   const times=Array.from({length:4},(_,i)=>`<span class="axis-x" style="left:calc(${i/3*100}% + ${44-i/3*56}px)">${escapeHtml(time(this._viewStart+(this._viewEnd-this._viewStart)*i/3,lang,this._zone,(this._viewEnd-this._viewStart)>86400000))}</span>`).join('');

   const display=this._plotSeries.map(s=>({...s,points:displayPoints(s.points,this._viewStart,this._viewEnd)}));
   this._graph??=new SharedGraph();
   const graph=this._graph.render(this,{
    viewBox:'0 0 1000 300',defs:this._gradient(min,max,y),
    fills:display.flatMap((s,i)=>{const a=this._seriesAppearance(i);if(!a.show_fill)return [];const fillColor=Array.isArray(a.fill_color)?`rgb(${a.fill_color.join(',')})`:a.fill_color;return [{d:this._area(s.points,x,y,i),className:'series-fill',fill:a.fill_mode==='own'?fillColor:this._appearance(i).stroke,opacity:a.fill_opacity,mask:a.fill_fade?'url(#history-fill-fade)':null}];}),
    lines:display.map((s,i)=>({d:this._line(s.points,Math.max(this._viewEnd,s.points.at(-1)?.t??this._viewEnd),x,y,i),className:'series-line',entity:s.id,appearance:this._appearance(i)})),
   });
   const legend=meta.items.map((item,i)=>{const value=valueAt(this._series[i].points,this._end);const a=this._appearance(i,value);return `<span class="legend-item"><i style="--series-color:${a.color};border-top-width:${a.width}px;border-top-style:${a.style}"></i><span>${escapeHtml(item.name)}</span><strong>${value===null?text('unavailable',lang):escapeHtml(number(value,lang))}</strong></span>`;}).join('');
   const missing=meta.items.filter((_,i)=>!this._series[i].points.some(p=>p.v!==null)).map(s=>s.name);
   content=`${this._config.show_legend?`<div class="legend">${legend}<span class="unit">${escapeHtml(meta.unit)}</span></div>`:`<div class="data-status">${escapeHtml(meta.unit)}</div>`}${missing.length?`<div class="data-status">${text('partial',lang)} ${escapeHtml(missing.join(', '))}</div>`:''}<div class="chart" tabindex="0" role="group" aria-label="${text('chart',lang)}">${axes}${times}<div class="plot">${graph}<div class="zoom-selection" hidden></div></div>${this._config.show_hover_line?'<div class="guide" hidden></div>':''}<div class="markers"></div><div class="tooltip" hidden></div><div class="sr-only" aria-live="polite"></div></div>`;
  }
  const controls=this._status==='ready'?`<div class="zoom-controls" role="group" aria-label="${text('zoom',lang)}">${[['in','+'],['out','−'],['reset','↺']].map(([action,label])=>`<button data-zoom="${action}" title="${text('zoom_'+action,lang)}" aria-label="${text('zoom_'+action,lang)}">${label}</button>`).join('')}</div>`:'';
  this.shadowRoot.innerHTML=`<style>${this._styles()}</style><ha-card lang="${lang}"><div class="card-content">${title?`<header><h2>${escapeHtml(title)}</h2></header>`:''}${controls}${content}</div></ha-card>`;
  this.shadowRoot.querySelectorAll?.('[data-zoom]').forEach(button=>button.onclick=()=>this._zoom({in:0.5,out:2,reset:0}[button.dataset.zoom]));
  this._graph?.restore(this);
  const retry=this.shadowRoot.querySelector('.retry');if(retry)retry.onclick=()=>this._refresh();this._pinned=false;this._bindInteractions();
  this._syncElf();SharedGraph.restoreHover(this);
 }
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
  chart.onpointermove=e=>{if(drag&&Math.abs(e.clientX-drag.x)>=6){const plot=chart.querySelector('.plot').getBoundingClientRect();if(selection){selection.hidden=false;selection.style.left=`${Math.max(0,Math.min(drag.x,e.clientX)-plot.left)/plot.width*100}%`;selection.style.width=`${Math.min(plot.width,Math.abs(e.clientX-drag.x))/plot.width*100}%`;}}else if(!this._pinned&&!e.target?.closest?.('.tooltip'))this._showTooltip(fromPointer(e));};
  chart.onpointerdown=e=>{if(e.target?.closest?.('.tooltip'))return;this._pinned=true;this._showTooltip(fromPointer(e));if(e.pointerType==='mouse'&&(e.button??0)===0){drag={x:e.clientX,t:fromPointer(e)};chart.setPointerCapture?.(e.pointerId);}};
  chart.onpointerup=e=>{if(selection)selection.hidden=true;if(drag){const first=drag;drag=null;if(Math.abs(e.clientX-first.x)>=6){const last=fromPointer(e),a=Math.min(first.t,last),b=Math.max(first.t,last);if(b-a>=60000){this._hideTooltip();this._viewport=[a,b];this._render();}}}};
  chart.onpointercancel=()=>{drag=null;if(selection)selection.hidden=true;};
  chart.onpointerleave=()=>{if(!this._pinned)this._hideTooltip();};chart.onblur=()=>this._hideTooltip();
  chart.onkeydown=e=>{
   if(e.key==='Escape'){this._hideTooltip();return;}
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
   const a=this._viewStart??this._start,b=this._viewEnd??this._end;
   const timeline=[...new Set([a,...this._series.flatMap(s=>s.points.map(p=>p.t)).filter(t=>t>a&&t<b),b])].sort((a,b)=>a-b);
   let index=timeline.findIndex(t=>t>=(this._cursor??this._start));if(index<0)index=timeline.length-1;
   if(e.key==='Home')index=0;else if(e.key==='End')index=timeline.length-1;else index=Math.max(0,Math.min(timeline.length-1,index+(e.key==='ArrowRight'?1:-1)));
   this._pinned=true;this._showTooltip(timeline[index]);
  };
 }
 _receiveHover(timestamp){if(timestamp===null||timestamp<(this._viewStart??this._start)||timestamp>(this._viewEnd??this._end)){this._hideTooltip(false);return;}this._showTooltip(timestamp,false);}
 _hideTooltip(publish=true){if(publish)SharedGraph.clearHover(this);this._cursor=null;this._pinned=false;const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;const tooltip=chart.querySelector('.tooltip');if(tooltip)tooltip.hidden=true;const markers=chart.querySelector('.markers');if(markers)markers.innerHTML='';const guide=chart.querySelector('.guide');if(guide)guide.hidden=true;}
 _showTooltip(timestamp,publish=true){
  const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;this._cursor=timestamp;
  const tooltip=chart.querySelector('.tooltip'),plot=chart.querySelector('.plot');const box=chart.getBoundingClientRect(),p=plot.getBoundingClientRect();
  const px=p.left-box.left+(timestamp-(this._viewStart??this._start))/((this._viewEnd??this._end)-(this._viewStart??this._start))*p.width;
  const [min,max]=this._range;const positions=[];
  const rows=this._series.map((s,i)=>{const value=valueAt(s.points,timestamp),height=valueAt((this._plotSeries??this._series)[i].points,timestamp);if(height!==null&&height>=min&&height<=max)positions.push({x:px,y:p.top-box.top+(max-height)/(max-min)*p.height,color:this._appearance(i,value).color});return `${this._meta.items[i].name}: ${value===null?text('unavailable',this._lang):`${number(value,this._lang)} ${this._meta.unit}`}`;});
  tooltip.innerHTML=`<strong>${escapeHtml(time(timestamp,this._lang,this._zone,true))}</strong>${rows.map(row=>`<span>${escapeHtml(row)}</span>`).join('')}`;tooltip.hidden=false;
  tooltip.style.maxHeight=`${Math.max(0,box.height-8)}px`;
  const measured=tooltip.getBoundingClientRect();let left=Math.max(4,Math.min(box.width-measured.width-4,px+14));
  if(px+14+measured.width>box.width-4)left=Math.max(4,px-measured.width-14);
  const candidates=[4,Math.max(4,box.height-measured.height-4)];
  const overlaps=top=>positions.filter(m=>m.x>left-9&&m.x<left+measured.width+9&&m.y>top-9&&m.y<top+measured.height+9).length;
  const top=candidates.sort((a,b)=>overlaps(a)-overlaps(b))[0];tooltip.style.left=`${left}px`;tooltip.style.top=`${top}px`;
  chart.querySelector('.markers').innerHTML=positions.map(m=>`<i class="hover-dot" style="left:${m.x}px;top:${m.y}px;border-color:${m.color}"></i>`).join('');
  const guide=chart.querySelector('.guide');if(guide){guide.hidden=false;guide.style.left=`${px}px`;}
  chart.querySelector('.sr-only').textContent=`${time(timestamp,this._lang,this._zone,true)}. ${rows.join('. ')}`;
  if(publish)SharedGraph.publishHover(this,timestamp);
 }
 _styles(){return `
 :host{display:block;height:100%;min-width:0;--font-size-meta:11px;--font-size-label:12px;--font-size-title:18px;}
 ha-card{height:100%;display:flex;flex-direction:column;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,inherit)}
 .card-content{position:relative;display:flex;flex-direction:column;box-sizing:border-box;min-height:0;height:100%;padding:16px 16px 12px;line-height:1.4}
 h2{margin:0;font-size:var(--font-size-title);line-height:1.25;font-weight:650;letter-spacing:-.01em}
 header{padding-right:106px}.zoom-controls{position:absolute;right:12px;top:10px;display:flex;gap:2px}.zoom-controls button{width:32px;height:32px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--secondary-text-color);font:20px inherit;cursor:pointer}.zoom-controls button:hover,.zoom-controls button:focus-visible{background:var(--secondary-background-color);outline:1px solid var(--divider-color)}
 .legend{display:flex;flex-wrap:wrap;align-items:center;gap:7px 16px;margin:12px 0 2px;color:var(--secondary-text-color);font-size:var(--font-size-label)}
 .legend-item{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%}.legend-item>span{overflow-wrap:anywhere}.legend-item strong{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
 .legend i{width:15px;flex-shrink:0;border-top:3px solid var(--series-color)}.unit{margin-left:auto;font-weight:600}
 .data-status{font-size:11px;color:var(--secondary-text-color);margin-top:3px}
 .chart{position:relative;flex:1;min-height:120px;height:260px;margin-top:4px;outline:none;touch-action:pan-y}
 .chart:focus-visible{box-shadow:inset 0 0 0 2px var(--primary-color);border-radius:8px}
 .plot{position:absolute;left:44px;right:12px;top:22px;bottom:30px;overflow:hidden}.plot svg{width:100%;height:100%;overflow:hidden}
 .axis-y,.axis-x{position:absolute;color:var(--secondary-text-color);font-size:11px;line-height:1.2;font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none}.axis-y{left:0;transform:translateY(-50%);max-width:40px;overflow:hidden;text-overflow:ellipsis}.axis-x{bottom:4px;transform:translateX(-50%)}.axis-x:last-of-type{transform:translateX(-100%)}
 .tooltip{overflow-y:auto;position:absolute;z-index:3;padding:9px 11px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);box-shadow:0 5px 16px #0003;pointer-events:auto;font-size:12px;font-variant-numeric:tabular-nums;box-sizing:border-box;max-width:calc(100% - 8px)}.tooltip strong,.tooltip span{display:block}.tooltip span{overflow-wrap:anywhere}.tooltip strong{margin-bottom:4px}.tooltip[hidden]{display:none}
 .state{display:flex;flex:1;height:260px;flex-direction:column;justify-content:center;align-items:flex-start;gap:8px;min-height:120px;font-size:14px;color:var(--secondary-text-color)}.retry{font:inherit;border:1px solid var(--divider-color);border-radius:6px;background:var(--secondary-background-color);color:var(--primary-text-color);min-height:44px;padding:0 12px;cursor:pointer}
 .guide{position:absolute;top:22px;bottom:30px;border-left:1px dashed var(--secondary-text-color);pointer-events:none}.guide[hidden]{display:none}
 .zoom-selection{position:absolute;top:0;bottom:0;background:color-mix(in srgb,var(--primary-color,#2196f3) 18%,transparent);border-inline:1px solid var(--primary-color,#2196f3);pointer-events:none}.zoom-selection[hidden]{display:none}
 .sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
 ${elevenStyles()}
 ${graphStyles()}
 @media(max-width:480px){.card-content{padding:12px 12px 10px}}
 `;}
}
if(!customElements.get('eleven-history-graph-card'))customElements.define('eleven-history-graph-card',HistoryGraphCard);
window.customCards=window.customCards??[];
if(!window.customCards.some(card=>card.type==='eleven-history-graph-card'))window.customCards.push({type:'eleven-history-graph-card',name:'Eleven History Graph Card',get description(){return language(frontendHass())==='nl'?'Historie van sensoren met dezelfde eenheid':'History of sensors sharing one unit';}});

})();
