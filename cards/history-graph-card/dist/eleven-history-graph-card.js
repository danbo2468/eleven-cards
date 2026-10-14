/* Eleven Cards 0.2.4-local — Eleven History Graph Card; standalone, no dependencies. */
(()=>{
"use strict";

// ../../shared/graph.js
// Domain-neutral SVG renderer. Adapters own data, geometry, colors and annotations.
function graphLineStyle(style, width = 3.5) {
  return {style, width, dash: style === 'dashed' ? '8 7' : style === 'dotted' ? '1 7' : 'none', cap: style === 'dashed' ? 'butt' : 'round'};
}
const graphAttribute = value => String(value).replace(/[&"<>]/g, c => ({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
class SharedGraph {
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
function validateConfig(config) {
 const entities=config?.entities;
 if(!Array.isArray(entities)||entities.length<1||entities.length>8||entities.some(id=>typeof id!=='string'||!/^sensor\.[a-z0-9_]+$/.test(id))||new Set(entities).size!==entities.length) throw new Error('entities');
 const hours=config.hours_to_show??24;
 if(typeof hours!=='number'||!Number.isFinite(hours)||hours<1||hours>168) throw new Error('hours');
 if(config.title!==undefined&&typeof config.title!=='string') throw new Error('title');
 const result={line_interpolation:'step',line_width:3.5,show_fill:false,fill_fade:true,fill_opacity:0.18,show_hover_line:true,...config,entities:[...entities],hours_to_show:hours};
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
 for(const key of ['show_fill','fill_fade','show_hover_line']) if(typeof result[key]!=='boolean') throw new Error(key);
 if(!Number.isFinite(result.fill_opacity)||result.fill_opacity<0||result.fill_opacity>1) throw new Error('fill_opacity');
 const stops=result.gradient_stops??[];
 if(!Array.isArray(stops)||(stops.length!==0&&stops.length<2)||stops.length>32||stops.some(s=>!s||!Number.isFinite(s.value)||!validColor(s.color))||new Set(stops.map(s=>s.value)).size!==stops.length) throw new Error('gradient_stops');
 result.gradient_stops=stops.map(s=>({value:s.value,color:Array.isArray(s.color)?[...s.color]:s.color})).sort((a,b)=>a.value-b.value);
 result.gradient_mode=result.gradient_mode??'smooth';
 if(!['smooth','steps'].includes(result.gradient_mode)) throw new Error('gradient_mode');
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
function seriesMetadata(hass,entities) {
 const items=entities.map(id=>{
  const state=hass.states?.[id]; if(!state) throw new Error('missing');
  return {id,name:state.attributes?.friendly_name??id,unit:state.attributes?.unit_of_measurement??''};
 });
 if(items.some(item=>item.unit!==items[0].unit)) throw new Error('unit');
 return {items,unit:items[0].unit};
}
function yRange(series,config={}) {
 let min=Infinity,max=-Infinity;
 for(const s of series) for(const p of s.points) if(Number.isFinite(p.v)){min=Math.min(min,p.v);max=Math.max(max,p.v);}
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
function historyUrl(config,end) {
 const start=new Date(end-config.hours_to_show*3600000).toISOString();
 const query=new URLSearchParams({filter_entity_id:config.entities.join(','),end_time:new Date(end).toISOString(),minimal_response:'',no_attributes:'',significant_changes_only:'0'});
 return `history/period/${encodeURIComponent(start)}?${query}`;
}

// src/localization.js
const translations={
 title:['History','Historie'],loading:['Loading history…','Historie laden…'],empty:['No numeric history in this range.','Geen numerieke historie in deze periode.'],error:['History unavailable. Check recorder and connection.','Historie niet beschikbaar. Controleer recorder en verbinding.'],unit:['All sensors must have the same unit.','Alle sensoren moeten dezelfde eenheid hebben.'],missing:['Configured sensor not found.','Ingestelde sensor niet gevonden.'],unavailable:['Unavailable','Niet beschikbaar'],retry:['Retry','Opnieuw proberen'],chart:['History graph. Arrow keys, Home and End select a time; Escape closes details.','Historiegrafiek. Pijltjes, Home en End selecteren een tijd; Escape sluit details.'],entities:['Sensors','Sensoren'],hours_to_show:['Hours to show','Aantal uren'],hoursHelper:['Historical range: 1–168 hours. All sensors must use the same unit.','Historische periode: 1–168 uur. Alle sensoren moeten dezelfde eenheid hebben.'],titleField:['Title','Titel'],partial:['Some sensors have no numeric history:','Sommige sensoren hebben geen numerieke historie:'],config:['Invalid configuration: use 1–8 distinct sensors and 1–168 hours.','Ongeldige configuratie: gebruik 1–8 unieke sensoren en 1–168 uur.']};
Object.assign(translations,{
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
const ELEVEN_VERSION='0.2.4-local';
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
class HistoryGraphCard extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'});this._generation=0;this._timer=null;this._connected=false;this._status='loading';this._series=[];this._outside=e=>{const chart=this.shadowRoot.querySelector('.chart');if(chart&&!e.composedPath().includes(chart))this._hideTooltip?.();};}
 static getConfigForm(){
  const label=key=>text(key,language(frontendHass()));
  const select=keys=>({select:{mode:'dropdown',get options(){return keys.map(value=>({value,label:label(value)}));}}});
  return {schema:[{name:'entities',required:true,selector:{entity:{domain:'sensor',multiple:true}}},{name:'title',selector:{text:{}}},{name:'hours_to_show',selector:{number:{min:1,max:168,step:0.5,mode:'box'}}},
   {name:'show_hover_line',default:true,selector:{boolean:{}}},
   {name:'y_min',selector:{number:{step:'any',mode:'box'}}},
   {name:'y_max',selector:{number:{step:'any',mode:'box'}}},
   {type:'expandable',name:'appearance',get title(){return label('appearance');},flatten:true,schema:[
    {name:'line_interpolation',default:'step',selector:{select:{mode:'dropdown',get options(){return ['smooth','linear','step'].map(value=>({value,label:label('interpolation_'+value)}));}}}},
    {name:'line_style',selector:select(['solid','dashed','dotted'])},
    {name:'line_width',default:3.5,selector:{number:{min:1,max:8,step:0.5,mode:'box',unit_of_measurement:'px'}}},
    {name:'line_color',selector:{color_rgb:{}}},
    {name:'show_fill',default:false,selector:{boolean:{}}},
    {name:'fill_color',selector:{color_rgb:{}}},
    {name:'fill_opacity',default:0.18,selector:{number:{min:0,max:1,step:0.01,mode:'slider'}}},
    {name:'fill_fade',default:true,selector:{boolean:{}}},
    {name:'gradient_mode',default:'smooth',selector:select(['smooth','steps'])},
    {name:'gradient_stops',selector:{object:{multiple:true,label_field:'value',fields:{value:{get label(){return label('stop_value');},required:true,selector:{number:{step:'any',mode:'box'}}},color:{get label(){return label('stop_color');},required:true,selector:{color_rgb:{}}}}}}}
   ]}],computeLabel:function(schema){return text(schema?.name==='title'?'titleField':schema?.name??'',language(this?.hass??frontendHass()));},computeHelper:function(schema){const key=`${schema?.name}Helper`,result=text(key,language(this?.hass??frontendHass()));return result===key?undefined:result;}};
 }
 _appearance(index,value){
  const c=this._config;const style=c.line_style??(index%2?'dashed':'solid');
  const fixed=Array.isArray(c.line_color)?`rgb(${c.line_color.join(',')})`:c.line_color;
  const color=gradientColor(c.gradient_stops,value,c.gradient_mode)??fixed??COLORS[index];
  return {color:color||COLORS[index],stroke:c.gradient_stops.length?'url(#history-colors)':fixed||COLORS[index],...graphLineStyle(style,c.line_width)};
 }
 _gradient(min,max,y){
  const c=this._config;let stops='';
  if(c.gradient_stops.length){
   const values=[max,...c.gradient_stops.map(s=>s.value).filter(v=>v>min&&v<max).reverse(),min];
   stops=values.map((v,i)=>{const offset=y(v)/3;const high=gradientColor(c.gradient_stops,v,c.gradient_mode);const low=c.gradient_mode==='steps'&&i>0&&i<values.length-1?gradientColor(c.gradient_stops,v-Math.max(1,Math.abs(v))*Number.EPSILON*4,c.gradient_mode):high;return `<stop offset="${offset}%" stop-color="${high}"/>${low!==high?`<stop offset="${offset}%" stop-color="${low}"/>`:''}`;}).join('');
  }
  return `<defs>${stops?`<linearGradient id="history-colors" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="300">${stops}</linearGradient>`:''}${c.show_fill&&c.fill_fade?'<linearGradient id="history-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient><mask id="history-fill-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="300"><rect width="1000" height="300" fill="url(#history-fade)"/></mask>':''}</defs>`;
 }
 _line(points,end,x,y){return SharedGraph.path(points.map(p=>[x(p.t),p.v===null?null:y(p.v)]),this._config.line_interpolation,end===undefined?undefined:x(end));}
 _area(points,x,y){
  let path='',segment=[];
  const close=until=>{if(segment.length){path+=`${path?' ':''}${this._line(segment,until,x,y)} L ${x(until)} 300 L ${x(segment[0].t)} 300 Z`;segment=[];}};
  for(const point of points){if(point.v===null)close(point.t);else segment.push(point);}close(this._end);return path;
 }
 static getStubConfig(hass){const ids=Object.keys(hass?.states??{}).filter(id=>id.startsWith('sensor.')&&Number.isFinite(Number(hass.states[id].state))&&hass.states[id].state!=='');return {entities:ids.slice(0,1),hours_to_show:24};}
 getGridOptions(){return {rows:6,columns:12,min_rows:4,min_columns:6};}
 getCardSize(){return 6;}
 setConfig(config){try{this._config=validateConfig(config);}catch{throw new Error(text('config',language(this._hass??frontendHass())));}this._generation++;this._inFlight=false;this._series=[];this._status='loading';clearTimeout(this._timer);this._timer=null;this._render();if(this._connected&&this._hass)this._refresh();}
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
 connectedCallback(){this._connected=true;this._elfPreview??=()=>{this._elfPreviewUntil=Date.now()+ELF_FLIGHT_MS;this.shadowRoot.querySelector('.eleven-elf')?.remove();this._syncElf();};registerElfPreview(this._elfPreview);document.addEventListener('pointerdown',this._outside);this._syncElf();if(this._config&&this._hass)this._refresh();}
 disconnectedCallback(){this._connected=false;unregisterElfPreview(this._elfPreview);this._elfPreviewUntil=0;this._generation++;this._inFlight=false;this._started=false;clearTimeout(this._timer);this._timer=null;clearTimeout(this._elfTimer);this._elfTimer=null;document.removeEventListener('pointerdown',this._outside);}
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
   this._series=decodeHistory(response,config.entities,start,end);this._start=start;this._end=end;
   this._status=this._series.some(s=>s.points.some(p=>p.v!==null))?'ready':'empty';
  }catch(e){if(generation!==this._generation||!this._connected)return;this._status=['missing','unit'].includes(e.message)?e.message:'error';this._series=[];}
  finally{clearTimeout(timeout);if(generation===this._generation&&this._connected){this._inFlight=false;this._render();this._timer=setTimeout(()=>this._refresh(),REFRESH_MS);this._timer.unref?.();}}
 }
 _render(){
  if(!this._config)return;const lang=language(this._hass);this._lang=lang;this._zone=this._hass?.config?.time_zone;
  let meta;try{meta=seriesMetadata(this._hass??{},this._config.entities);}catch(e){if(this._hass)this._status=e.message;}
  const title=this._config.title??text('title',lang);let content='';
  if(this._status!=='ready'||!meta){content=`<div class="state" role="status">${escapeHtml(text(this._status,lang))}${['error','unit','missing'].includes(this._status)?`<button class="retry">${text('retry',lang)}</button>`:''}</div>`;}
  else{
   this._meta=meta;const [min,max]=yRange(this._series,this._config);this._range=[min,max];
   const x=t=>(t-this._start)/(this._end-this._start)*1000,y=v=>(max-v)/(max-min)*300;
   const axes=Array.from({length:5},(_,i)=>{const ratio=i/4;return `<span class="axis-y" style="top:calc(${ratio*100}% + ${22-ratio*52}px)">${escapeHtml(number(max-(max-min)*ratio,lang))}</span>`;}).join('');
   const times=Array.from({length:4},(_,i)=>`<span class="axis-x" style="left:calc(${i/3*100}% + ${44-i/3*56}px)">${escapeHtml(time(this._start+(this._end-this._start)*i/3,lang,this._zone,this._config.hours_to_show>24))}</span>`).join('');
   const fillColor=Array.isArray(this._config.fill_color)?`rgb(${this._config.fill_color.join(',')})`:this._config.fill_color;
   this._graph??=new SharedGraph();
   const graph=this._graph.render(this,{
    viewBox:'0 0 1000 300',defs:this._gradient(min,max,y),
    fills:this._config.show_fill?this._series.map((s,i)=>({d:this._area(s.points,x,y),className:'series-fill',fill:fillColor||this._appearance(i).stroke,opacity:this._config.fill_opacity,mask:this._config.fill_fade?'url(#history-fill-fade)':null})):[],
    lines:this._series.map((s,i)=>({d:this._line(s.points,this._end,x,y),className:'series-line',entity:s.id,appearance:this._appearance(i)})),
   });
   const legend=meta.items.map((item,i)=>{const value=valueAt(this._series[i].points,this._end);const a=this._appearance(i,value);return `<span class="legend-item"><i style="--series-color:${a.color};border-top-width:${a.width}px;border-top-style:${a.style}"></i><span>${escapeHtml(item.name)}</span><strong>${value===null?text('unavailable',lang):escapeHtml(number(value,lang))}</strong></span>`;}).join('');
   const missing=meta.items.filter((_,i)=>!this._series[i].points.some(p=>p.v!==null)).map(s=>s.name);
   content=`<div class="legend">${legend}<span class="unit">${escapeHtml(meta.unit)}</span></div>${missing.length?`<div class="data-status">${text('partial',lang)} ${escapeHtml(missing.join(', '))}</div>`:''}<div class="chart" tabindex="0" role="group" aria-label="${text('chart',lang)}">${axes}${times}<div class="plot">${graph}</div>${this._config.show_hover_line?'<div class="guide" hidden></div>':''}<div class="markers"></div><div class="tooltip" hidden></div><div class="sr-only" aria-live="polite"></div></div>`;
  }
  this.shadowRoot.innerHTML=`<style>${this._styles()}</style><ha-card lang="${lang}"><div class="card-content">${title?`<header><h2>${escapeHtml(title)}</h2></header>`:''}${content}</div></ha-card>`;
  this._graph?.restore(this);
  const retry=this.shadowRoot.querySelector('.retry');if(retry)retry.onclick=()=>this._refresh();this._pinned=false;this._bindInteractions();
  this._syncElf();
 }
 _bindInteractions(){
  const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;
  const fromPointer=e=>{const box=chart.querySelector('.plot').getBoundingClientRect();return this._start+Math.max(0,Math.min(1,(e.clientX-box.left)/box.width))*(this._end-this._start);};
  chart.onpointermove=e=>{if(!this._pinned&&!e.target?.closest?.('.tooltip'))this._showTooltip(fromPointer(e));};
  chart.onpointerdown=e=>{if(e.target?.closest?.('.tooltip'))return;this._pinned=true;this._showTooltip(fromPointer(e));};
  chart.onpointerleave=()=>{if(!this._pinned)this._hideTooltip();};chart.onblur=()=>this._hideTooltip();
  chart.onkeydown=e=>{
   if(e.key==='Escape'){this._hideTooltip();return;}
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
   const timeline=[...new Set([this._start,...this._series.flatMap(s=>s.points.map(p=>p.t)),this._end])].sort((a,b)=>a-b);
   let index=timeline.findIndex(t=>t>=(this._cursor??this._start));if(index<0)index=timeline.length-1;
   if(e.key==='Home')index=0;else if(e.key==='End')index=timeline.length-1;else index=Math.max(0,Math.min(timeline.length-1,index+(e.key==='ArrowRight'?1:-1)));
   this._pinned=true;this._showTooltip(timeline[index]);
  };
 }
 _hideTooltip(){this._pinned=false;const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;const tooltip=chart.querySelector('.tooltip');if(tooltip)tooltip.hidden=true;const markers=chart.querySelector('.markers');if(markers)markers.innerHTML='';const guide=chart.querySelector('.guide');if(guide)guide.hidden=true;}
 _showTooltip(timestamp){
  const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;this._cursor=timestamp;
  const tooltip=chart.querySelector('.tooltip'),plot=chart.querySelector('.plot');const box=chart.getBoundingClientRect(),p=plot.getBoundingClientRect();
  const px=p.left-box.left+(timestamp-this._start)/(this._end-this._start)*p.width;
  const [min,max]=this._range;const positions=[];
  const rows=this._series.map((s,i)=>{const value=valueAt(s.points,timestamp);if(value!==null&&value>=min&&value<=max)positions.push({x:px,y:p.top-box.top+(max-value)/(max-min)*p.height,color:this._appearance(i,value).color});return `${this._meta.items[i].name}: ${value===null?text('unavailable',this._lang):`${number(value,this._lang)} ${this._meta.unit}`}`;});
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
 }
 _styles(){return `
 :host{display:block;height:100%;min-width:0;--font-size-meta:11px;--font-size-label:12px;--font-size-title:18px;}
 ha-card{height:100%;display:flex;flex-direction:column;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,inherit)}
 .card-content{position:relative;display:flex;flex-direction:column;box-sizing:border-box;min-height:0;height:100%;padding:16px 16px 12px;line-height:1.4}
 h2{margin:0;font-size:var(--font-size-title);line-height:1.25;font-weight:650;letter-spacing:-.01em}
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
