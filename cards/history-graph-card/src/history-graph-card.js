import {validateConfig,historyUrl,decodeHistory,seriesMetadata,yRange,valueAt,stepPath,gradientColor} from './history-utils.js';
import {language,text,number,time,escapeHtml,frontendHass} from './localization.js';
import {ELF_FLIGHT_MS,elevenDay,isElevenMinute,elevenMarkup,elevenStyles} from './eleven.js';
import {registerElfPreview,unregisterElfPreview} from './library.js';
import {SharedGraph,graphLineStyle,graphStyles} from '../../../shared/graph.js';
const COLORS=['#2196f3','#e78a14','#ab70d9','#26a69a','#e66b91','#718cc2','#a18d3a','#718d78'];
const REFRESH_MS=60000;
export class HistoryGraphCard extends HTMLElement {
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
