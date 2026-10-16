import {HistoryGraphCard,HistoryGraphEditor} from '../../history-graph-card/src/history-graph-card.js';
import {editorConfig,graphAxes,yAxis,periodBounds,valueAt} from '../../history-graph-card/src/history-utils.js';
import {language,frontendHass} from '../../history-graph-card/src/localization.js';
import {SharedGraph} from '../../../shared/graph.js';

class BarGraph extends SharedGraph {
 render(host,spec){return super.render(host,{...spec,lines:spec.lines.map(p=>({...p,className:'series-bar'}))});}
}

const defaults=config=>({aggregation_period:'hour',aggregation_method:'avg',...config});
const local=(en,nl)=>language(frontendHass())==='nl'?nl:en;
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
  form.computeHelper=function(item){return item?.name==='aggregation_method'?local('Delta: end value minus start value per selected period. Negative changes are retained; missing data leaves a gap. AVG remains time-weighted.','Delta: eindwaarde min beginwaarde per gekozen tijdvak. Negatieve verschillen blijven behouden; ontbrekende gegevens geven een gat. AVG blijft tijdgewogen.'):helper.call(this,item);};
  return form;
 }
 static getSeriesConfigForm(row={},rows=[]){
  const form=super.getSeriesConfigForm(row,rows);
  // Reuse native sensor/color/gradient controls, not meaningless line/fill settings.
  form.schema=form.schema.filter(s=>s.name!=='series_fill').map(s=>s.name!=='series_line'?s:{...s,title:local('Bar appearance','Staafopmaak'),schema:s.schema.filter(f=>!['line_style_source','line_width','line_style','line_interpolation'].includes(f.name))});
  return form;
 }
 _seriesAppearance(index){return {...super._seriesAppearance(index),show_fill:false,line_style:'solid'};}
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
  return grouped;
 }
 _line(points,end,x,y,index=0){
  const visible=this._config.entities.map((_,i)=>i).filter(i=>this._isSeriesVisible(i));
  const grouped=this._config.graph_mode!=='stacked',count=grouped?visible.length:1,slot=grouped?visible.indexOf(index):0;
  let path='';
  for(let i=0;i<points.length;i++){
   const p=points[i],a=Math.max(this._viewStart,p.t),b=Math.min(this._viewEnd,points[i+1]?.t??end);
   if(p.v===null||!Number.isFinite(p.v)||b<=a)continue;
   const left=x(a),span=x(b)-left,padding=span*.12,width=span*.76/count;
   const l=left+padding+slot*width,r=l+width*.9,base=this._config.graph_mode==='stacked'?(p.base??0):0;
   path+=`M ${l} ${y(base)} V ${y(p.v)} H ${r} V ${y(base)} Z `;
  }
  return path.trim();
 }
 _hoverInterval(timestamp){
  const a=this._viewStart??this._start,b=this._viewEnd??this._end;
  const t=Math.max(a,Math.min(b-1,timestamp)),period=this._config.aggregation_period;
  const bounds=period==='none'?[this._start,this._end]:periodBounds(t,period,this._zone);
  // Fragment boundaries are real bar edges, including unavailable intervals.
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
  const left=x(interval.start),span=x(interval.end)-left,visible=this._series.map((_,i)=>i).filter(i=>this._isSeriesVisible(i));
  const grouped=this._config.graph_mode!=='stacked',count=grouped?visible.length:1;
  const px=left+span*(.5-.038/count),guide=chart.querySelector('.guide');if(guide)guide.style.left=`${px}px`;
  let dot=0;const markers=chart.querySelectorAll('.hover-dot');
  for(const i of visible){
   const height=valueAt((this._plotSeries??this._series)[i].points,interval.start),axis=this._axes?.[this._seriesAxes[i]]??{min:this._range[0],max:this._range[1]};
   if(height!==null&&height>=axis.min&&height<=axis.max){const slot=grouped?visible.indexOf(i):0;markers[dot++].style.left=`${left+span*(.12+(slot+.45)*.76/count)}px`;}
  }
  const measured=tooltip.getBoundingClientRect();
  tooltip.style.left=`${Math.max(4,Math.min(box.width-measured.width-4,px+14+measured.width>box.width-4?px-measured.width-14:px+14))}px`;
  if(publish)SharedGraph.publishHover(this,(interval.start+interval.end)/2);
 }
 _render(){
  if(this._config&&this._config.title===undefined){
   const title=language(this._hass)==='nl'?'Staafdiagram':'Bar chart';
   this._config={...this._config,title};super._render();delete this._config.title;
  }else super._render();
 }
 _styles(){
  const paints=this._config?.entities.map((id,i)=>`.series-bar[data-entity="${id}"]{fill:${this._appearance(i).stroke};stroke:none}`).join('')??'';
  return super._styles()+`\n${paints}\n.series-bar{stroke:none}.legend i{height:12px;width:8px;border:0!important;border-radius:2px;background:var(--series-color)}\n`;
 }
}
if(!customElements.get('eleven-bar-chart'))customElements.define('eleven-bar-chart',BarChartCard);
window.customCards=window.customCards??[];
if(!window.customCards.some(c=>c.type==='eleven-bar-chart'))window.customCards.push({type:'eleven-bar-chart',name:'Eleven Bar Chart',get description(){return local('Vertical sensor history bars, based on Eleven History.','Verticale staven van sensorhistorie, gebaseerd op Eleven History.');}});
