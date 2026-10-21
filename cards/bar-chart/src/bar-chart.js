import {HistoryGraphCard,HistoryGraphEditor} from '../../history-graph-card/src/history-graph-card.js';
import {editorConfig,graphAxes,yAxis,alignZeroAxes,alignGridAxes,periodBounds,valueAt,aggregateSeries,displayPoints} from '../../history-graph-card/src/history-utils.js';
import {language,frontendHass} from '../../history-graph-card/src/localization.js';
import {SharedGraph} from '../../../shared/graph.js';
import {chartValueStatistics} from '../../../shared/chart-insights.js';

class BarGraph extends SharedGraph {
 render(host,spec){return super.render(host,{...spec,lines:spec.lines.map(p=>({...p,className:'series-bar'}))});}
}

const defaults=config=>({aggregation_period:'hour',aggregation_method:'avg',...config});
const local=(en,nl)=>language(frontendHass())==='nl'?nl:en;
// Sum original bar values, never cumulative stack heights or prorated bins.
export function deltaBarTotals(series,items,{start,end,viewStart=start,viewEnd=end,period,zone='UTC'}){
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
export class BarChartEditor extends HistoryGraphEditor {
 static get cardClass(){return BarChartCard;}
 _editorConfig(config){return editorConfig(defaults(config));}
 _bind(form,definition,data){
  if(form===this._form&&data.aggregation_period==='none')definition={...definition,schema:definition.schema.map(group=>group.name==='data_processing'?{...group,schema:group.schema.filter(field=>field.name!=='aggregation_method')}:group)};
  super._bind(form,definition,data);
 }
 _emit(){this._render();super._emit();}
}
export class BarChartCard extends HistoryGraphCard {
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
