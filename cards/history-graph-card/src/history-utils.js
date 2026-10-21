import {timeframeSyncConfig} from '../../../shared/periods.js';
import {graphPeriodBounds} from '../../../shared/periods.js';
function validColor(color){return typeof color==='string'?/^#[\da-f]{6}$/i.test(color):Array.isArray(color)&&color.length===3&&color.every(v=>Number.isInteger(v)&&v>=0&&v<=255);}
export const SERIES_COLORS=['#2196f3','#e78a14','#ab70d9','#26a69a','#e66b91','#718cc2','#a18d3a','#718d78'];
const APPEARANCE_KEYS=['line_width','line_style','line_interpolation','line_color','show_fill','fill_color','fill_opacity','fill_fade','gradient_mode','gradient_stops'];
// Resolve legacy inheritance once. Explicit modes on new rows have no implicit precedence.
const LINE_GEOMETRY_KEYS=['line_width','line_style','line_interpolation'];
export function seriesAppearance(config,index,seen=new Set()) {
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
export function editorConfig(config) {
 const data={hours_to_show:24,data_source:'auto',graph_mode:'lines',aggregation_period:'none',aggregation_method:'avg',show_hover_line:true,show_legend:true,show_title:true,show_navigation:true,show_grid:true,align_zero:true,sync_hover:true,hover_sync_group:'',sync_timeframe:false,...config,...timeframeSyncConfig(config,{draft:true}),entities:(config.entities??[]).map((entity,index)=>{
  const row=seriesAppearance(config,index);
  for(const key of ['color','fill_color'])if(validColor(row[key]))row[key]=[...rgb(row[key])];
  row.gradient_stops=row.gradient_stops.map(s=>({...s,color:validColor(s.color)?[...rgb(s.color)]:s.color}));
  return row;
 })};
 delete data.series_options;for(const key of APPEARANCE_KEYS)delete data[key];return data;
}
export function cardConfig(data) {
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
export function updateSeriesRow(data,index,value){
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
export function removeSeriesRow(data,index){
 const rows=resolvedEditorRows(data.entities),removed=rows[index].entity;
 const remaining=rows.filter((_,i)=>i!==index);
 for(const row of remaining)if(row.line_style_source===removed)delete row.line_style_source;
 return {...data,entities:resolvedEditorRows(remaining)};
}
export function lineStyleSources(rows,row){
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
export function validateConfig(config) {
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
export function gradientColor(stops,value,mode='smooth'){
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
export function statisticsPeriod(config,end=Date.now()){
 const source=config.data_source??'auto',period=config.aggregation_period??'none';
 const supported=['none','hour','day','week','month'].includes(period)&&(config.aggregation_method!=='delta'||period!=='none');
 if(source==='statistics'&&!supported)throw new Error('statistics_config');
 if(source==='history'||!supported||(source==='auto'&&config.hours_to_show<=48&&Date.now()-end<=48*3600000))return null;
 return period==='none'?'hour':period;
}
// HA has used epoch seconds and milliseconds across Recorder versions.
function statisticTime(value){return typeof value==='number'?(value<1e12?value*1000:value):Date.parse(value);}
export async function loadHistorySeries(hass,config,start,end){
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
export function numericState(state) {
 if(typeof state!=='string'||state.trim()==='') return null;
 const number=Number(state); return Number.isFinite(number)?number:null;
}
export function decodeHistory(response,entities,start,end) {
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
export function valueAt(points,time) {
 let left=0,right=points.length-1,index=-1;
 while(left<=right) {const mid=(left+right)>>1;if(points[mid].t<=time){index=mid;left=mid+1;}else right=mid-1;}
 return index<0?null:points[index].v;
}
export function stepPath(points,end,x,y) {
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
export function seriesMetadata(hass,entities,options=[]) {
 const items=entities.map(id=>{
  const state=hass.states?.[id]; if(!state) throw new Error('missing');
  const option=options.find(s=>s.entity===id);
  return {id,name:option?.name||state.attributes?.friendly_name||id,unit:state.attributes?.unit_of_measurement??''};
 });
 return {items,unit:items[0]?.unit??''};
}
// Group by exact unit, never add or scale incompatible quantities together.
export function graphAxes(series,meta,config,start,end,visible=series.map(()=>true)){
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
export function alignGridAxes(axes,config={}){
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
export function alignZeroAxes(axes,config={},primaryUnit=axes[0]?.unit){
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
export function yRange(series,config={}) {
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
export function yAxis(series,config={}){
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
export function periodBounds(t,period,zone='UTC'){return graphPeriodBounds(t,period,zone);}
export function aggregateSeries(series,start,end,period='none',method='avg',zone='UTC',{preserveGaps=true}={}){
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
export function connectGapPoints(points){
 const first=points.findIndex(p=>p.v!==null);if(first<0)return points;
 let last=points.length-1;while(last>first&&points[last].v===null)last--;
 return points.filter((p,i)=>p.v!==null||i<first||i>last);
}
export function displayPoints(points,start,end,bins=1500){
 let first=0,last=points.length;while(first<last){const mid=(first+last)>>1;if(points[mid].t<start)first=mid+1;else last=mid;}
 const begin=Math.max(0,first-1);first=begin;last=points.length;while(first<last){const mid=(first+last)>>1;if(points[mid].t<=end)first=mid+1;else last=mid;}
 const clipped=points.slice(begin,Math.min(points.length,first+1));if(clipped.length<=bins*4)return clipped;
 const keep=new Set([0,clipped.length-1]);let bin=-1,group=[];
 const flush=()=>{if(!group.length)return;keep.add(group[0]);keep.add(group.at(-1));let min=group[0],max=min;for(const i of group){if(clipped[i].v<clipped[min].v)min=i;if(clipped[i].v>clipped[max].v)max=i;}keep.add(min);keep.add(max);group=[];};
 clipped.forEach((p,i)=>{const next=Math.floor((p.t-start)/(end-start)*bins);if(next!==bin){flush();bin=next;}if(p.v===null){flush();for(const j of [i-1,i,i+1])if(j>=0&&j<clipped.length)keep.add(j);}else group.push(i);});flush();
 return [...keep].sort((a,b)=>a-b).map(i=>clipped[i]);
}
export function stackSeries(series,start,end){
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
export function historyUrl(config,end) {
 const start=new Date(end-config.hours_to_show*3600000).toISOString();
 const query=new URLSearchParams({filter_entity_id:config.entities.join(','),end_time:new Date(end).toISOString(),minimal_response:'',no_attributes:'',significant_changes_only:'0'});
 return `history/period/${encodeURIComponent(start)}?${query}`;
}
