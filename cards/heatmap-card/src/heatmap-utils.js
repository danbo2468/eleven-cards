import {timeframeSyncConfig} from '../../../shared/periods.js';
import {graphPeriodBounds} from '../../../shared/periods.js';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function numeric(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim()))) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function heatmapRgb(color) {
  if(typeof color==='string' && /^#[\da-f]{6}$/i.test(color))return [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  return Array.isArray(color) && color.length===3 && [...color].every(n=>Number.isInteger(n) && n>=0 && n<=255)?[...color]:null;
}

export function normalizeConfig(input = {}, {draft = false} = {}) {
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

export async function loadHeatmapData(hass, config, start, end) {
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
export function clockGrid(start, end, zone = 'UTC') {
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

export function heatmapColumns(period='hour',locale='en-GB') {
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

export function calendarGrid(start,end,zone='UTC',period='day') {
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

export function buildHeatmap(data, start, end, zone='UTC', mode='average', period='hour') {
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

export function colorScale(rows, config) {
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
export function summarizeHeatmap(rows, mode) {
  const cells=rows.flatMap(row=>row.cells),known=cells.filter(cell=>Number.isFinite(cell.value));
  const values=known.map(cell=>cell.value),sum=values.reduce((total,value)=>total+value,0);
  return {minimum:values.length?Math.min(...values):null,maximum:values.length?Math.max(...values):null,
    average:values.length?sum/values.length:null,count:values.length,
    missing:cells.some(cell=>cell.partial || (cell.intervals.length && cell.value==null)),
    ...(mode==='consumption'?{total:values.length?sum:null}:{})};
}
