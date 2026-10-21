import {timeframeSyncConfig,connectTimeframeSync,disconnectTimeframeSync} from '../../../shared/periods.js';
import {validateConfig,loadHistorySeries,historyUrl,decodeHistory,seriesMetadata,graphAxes,valueAt,stepPath,gradientColor,aggregateSeries,displayPoints,connectGapPoints,editorConfig,cardConfig,seriesAppearance,updateSeriesRow,removeSeriesRow,lineStyleSources} from './history-utils.js';
import {language,text,number,time,escapeHtml,frontendHass} from './localization.js';
import {ELF_FLIGHT_MS,elevenDay,isElevenMinute,elevenMarkup,elevenStyles} from './eleven.js';
import {registerElfPreview,unregisterElfPreview} from './library.js';
import {SharedGraph,graphLineStyle,graphStyles} from '../../../shared/graph.js';
import {cardHeader,cardHeaderStyles} from '../../../shared/card-header.js';
import {resetGraphPeriod,graphPeriodRange,chooseGraphPeriod,moveGraphPeriod} from '../../../shared/periods.js';
import {periodControls,periodControlsStyles,bindPeriodControls,disconnectPeriodControls} from '../../../shared/period-controls.js';
import {chartZoomState,chartDataInformation,chartValueStatistics,captureChartInsights,bindChartInsights,disconnectChartInsights,chartInsightStyles} from '../../../shared/chart-insights.js';
import {uiLegend} from '../../../shared/ui-legend.js';
import {retryDelay} from '../../../shared/request.js';
const COLORS=['#2196f3','#e78a14','#ab70d9','#26a69a','#e66b91','#718cc2','#a18d3a','#718d78'];
const REFRESH_MS=60000;
// Native controls, with one independently owned appearance form per sensor.
export class HistoryGraphEditor extends HTMLElement {
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
export class HistoryGraphCard extends HTMLElement {
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
