// Eleven Overview (beta) 0.1.0 — self-contained standalone module
(()=>{
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
 return {...input,type:'custom:eleven-overview-card',title:input.title??'Eleven Overview (beta)',hours_to_show:hours,columns,show_graph:input.show_graph!==false,show_delta:input.show_delta!==false,entities};
}


const esc=escapeHtml;
const nl=h=>String(h?.locale?.language??h?.language??'en').startsWith('nl');
const labels={title:['Titel','Title'],hours_to_show:['Periode (uur)','Period (hours)'],columns:['Kolommen','Columns'],show_graph:['Trendlijnen tonen','Show sparklines'],show_delta:['Verandering tonen','Show change'],entity:['Sensor','Sensor'],name:['Naam','Name'],color:['Kleur','Color']};
function form(schema){return {schema,computeLabel:function(s){return labels[s.name]?.[nl(this?.hass)?0:1]??s.name;}};}
class OverviewEditor extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});}
 setConfig(c){this._config=normalizeConfig(c,{draft:true});this._render();}
 set hass(h){this._hass=h;this._render();}get hass(){return this._hass;}
 _emit(){this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...this._config,entities:this._config.entities.filter(r=>r.entity).map(r=>({...r,color:Array.isArray(r.color)?[...r.color]:r.color}))}},bubbles:true,composed:true}));}
 _bind(node,definition,data){node.hass=this._hass;node.schema=definition.schema;node.data=data;node.computeLabel=s=>definition.computeLabel.call(this,s);}
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
 constructor(){super();this.attachShadow({mode:'open'});this._generation=0;this._history={};this._units={};this._status='loading';this._connected=false;this._timer=null;}
 static getConfigForm(){return form([{name:'title',selector:{text:{}}},{name:'hours_to_show',selector:{number:{min:1,max:168,step:1,mode:'box'}}},{name:'columns',selector:{select:{mode:'dropdown',options:[{value:'auto',label:'Auto'},{value:'1',label:'1'},{value:'2',label:'2'},{value:'3',label:'3'}]}}},{name:'show_graph',selector:{boolean:{}}},{name:'show_delta',selector:{boolean:{}}}]);}
 static getSensorForm(){return form([{name:'entity',required:true,selector:{entity:{domain:'sensor'}}},{name:'name',selector:{text:{}}},{name:'color',selector:{color_rgb:{}}}]);}
 static async getConfigElement(){if(!customElements.get('ha-form')){const helpers=await window.loadCardHelpers();const card=await helpers.createCardElement({type:'entities',entities:[]});await card.constructor.getConfigElement();await customElements.whenDefined('ha-form');}if(!customElements.get('eleven-overview-editor'))customElements.define('eleven-overview-editor',OverviewEditor);return document.createElement('eleven-overview-editor');}
 static getStubConfig(hass){return {title:'Eleven Overview (beta)',hours_to_show:24,entities:Object.entries(hass?.states??{}).filter(([id,s])=>id.startsWith('sensor.')&&numeric(s.state)!=null).slice(0,4).map(([id])=>id)};}
 setConfig(config){this._config=normalizeConfig(config);this._generation++;this._promise=null;this._history={};this._status='loading';clearTimeout(this._timer);this._render();if(this._connected)this._refresh();}
 set hass(h){this._hass=h;this._render();if(this._connected&&!this._promise&&this._status==='loading')this._refresh();}get hass(){return this._hass;}
 connectedCallback(){this._connected=true;this._refresh();}
 disconnectedCallback(){this._connected=false;this._generation++;this._promise=null;clearTimeout(this._timer);this._timer=null;}
 getCardSize(){return 1+Math.ceil((this._config?.entities.length??1)/2)*2;}
 getGridOptions(){return {columns:12,min_columns:6};}
 _format(value){const locale=this._hass?.locale?.language??this._hass?.language??'en';try{return new Intl.NumberFormat(locale,Math.abs(value)>0&&Math.abs(value)<0.01?{maximumSignificantDigits:3}:{maximumFractionDigits:2}).format(value);}catch{return String(value);}}
 _refresh(){
  if(!this._connected||!this._hass||!this._config)return Promise.resolve();if(this._promise)return this._promise;
  clearTimeout(this._timer);const generation=this._generation,end=Date.now(),start=end-this._config.hours_to_show*3600000,ids=this._config.entities.map(r=>r.entity),hass=this._hass;
  const units=Object.fromEntries(ids.map(id=>[id,hass.states?.[id]?.attributes?.unit_of_measurement??'']));
  let requestTimer;const work=(async()=>{try{const data=await Promise.race([hass.callApi('GET',historyUrl(ids,start,end)),new Promise((_,reject)=>{requestTimer=setTimeout(()=>reject(Error('History timeout')),15000);})]);if(!this._connected||generation!==this._generation)return;
    const grouped=new Map((data??[]).filter(r=>r.length).map(r=>[r[0].entity_id,r]));this._history=Object.fromEntries(ids.map(id=>[id,historySeries(grouped.get(id),start,end,units[id])]));this._units=units;this._start=start;this._end=end;this._status='ready';
   }catch{if(generation===this._generation&&this._connected)this._status='error';}
   finally{clearTimeout(requestTimer);if(generation===this._generation&&this._connected){this._promise=null;this._render();this._timer=setTimeout(()=>this._refresh(),60000);}}
  })();this._promise=work;return work;
 }
 _render(){
  if(!this._config)return;const c=this._config,dutch=nl(this._hass),focus=this.shadowRoot.activeElement?.dataset.entity;
  const period=`${c.hours_to_show} ${dutch?'uur':'hours'}`,cells=c.entities.map((row,i)=>{
   const s=this._hass?.states?.[row.entity],v=numeric(s?.state),unit=s?.attributes?.unit_of_measurement??'',name=row.name||s?.attributes?.friendly_name||row.entity;
   const history=this._status==='ready'&&this._units[row.entity]===unit?this._history[row.entity]:null,change=delta(history,v),path=history?sparkline(history.points,this._start,this._end):'';
   const status=!s?(dutch?'Sensor niet gevonden':'Entity not found'):v==null?(dutch?'Niet beschikbaar':'Unavailable'):'';
   const graphStatus=this._status==='loading'?(dutch?'Geschiedenis laden…':'Loading history…'):this._status==='error'?(dutch?'Geen geschiedenis geladen':'History not loaded'):dutch?'Geen geschiedenis':'No history';
   const difference=change==null?(dutch?'Geen vergelijkingspunt':'No comparison point'):`${change>0?'+':''}${this._format(change)}${unit?' '+(unit==='%'?'pp':unit):''}`;
   return `<button type="button" class="metric" data-entity="${esc(row.entity)}" aria-label="${esc(name+': '+(status||this._format(v)+' '+unit))}" style="--series-color:${color(row.color,PALETTE[i])}"><span class="label"><i></i>${esc(name)}</span><span class="reading"><span class="value">${v==null?'—':esc(this._format(v))}</span>${v!=null&&unit?`<span class="unit">${esc(unit)}</span>`:''}</span>${status?`<span class="status">${status}</span>`:''}${c.show_graph?`<span class="spark">${path?`<svg viewBox="0 0 300 48" preserveAspectRatio="none" aria-hidden="true"><path d="${path}"/></svg>`:`<span>${graphStatus}</span>`}</span>`:''}${c.show_delta?`<span class="delta">${v==null?'—':esc(difference)}</span><span class="caption">${dutch?'sinds begin periode':'since period start'}</span>`:''}</button>`;
  }).join('');
  this.shadowRoot.innerHTML=`<style>:host{display:block;min-width:0;container-type:inline-size}ha-card{display:block;height:100%;font-family:inherit;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b)}.content{padding:16px;box-sizing:border-box}header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:20px}h2{font-size:18px;font-weight:650;letter-spacing:-.01em;line-height:1.25;margin:0;overflow-wrap:anywhere}.period{font-size:12px;color:var(--secondary-text-color,#666);white-space:nowrap}.grid{display:grid;grid-template-columns:repeat(${c.columns==='auto'?'2':c.columns},minmax(0,1fr));gap:20px 24px}.metric{appearance:none;font:inherit;color:inherit;background:none;border:0;border-radius:4px;text-align:left;min-width:0;min-height:44px;padding:0;cursor:pointer;display:flex;flex-direction:column;align-items:stretch}.metric:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:5px}.label{font-size:12px;color:var(--secondary-text-color,#666);line-height:1.4;overflow-wrap:anywhere;display:flex;align-items:baseline;gap:7px}.label i{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--series-color);flex-shrink:0}.reading{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;margin-top:6px;font-variant-numeric:tabular-nums;min-width:0}.value{font-size:28px;font-weight:550;line-height:1.25;overflow-wrap:anywhere;letter-spacing:-.025em}.unit{font-size:13px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}.spark{height:48px;display:flex;align-items:center;margin-top:8px;color:var(--secondary-text-color,#666);font-size:11px}.spark svg{width:100%;height:48px;overflow:visible}.spark path{fill:none;stroke:var(--series-color);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}.delta{font-size:12px;font-variant-numeric:tabular-nums;margin-top:8px;overflow-wrap:anywhere}.caption{font-size:11px;color:var(--secondary-text-color,#666);margin-top:2px}.status{font-size:12px;color:var(--secondary-text-color,#666);margin-top:4px}.error{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;font-size:12px;color:var(--secondary-text-color,#666)}.retry{font:inherit;min-height:44px;flex-shrink:0;padding:8px 12px;border:1px solid var(--divider-color,#ddd);border-radius:6px;background:transparent;color:inherit;cursor:pointer}@container(max-width:340px){.grid{grid-template-columns:minmax(0,1fr)}header{margin-bottom:16px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style><ha-card><div class="content"><header><h2>${esc(c.title)}${/\(beta\)/i.test(c.title)?'':' <small>(beta)</small>'}</h2><span class="period">${period}</span></header><div class="grid">${cells}</div>${this._status==='error'?`<div class="error" role="status"><span>${dutch?'Geschiedenis kon niet worden geladen. Actuele waarden blijven beschikbaar.':'History could not be loaded. Live values remain available.'}</span><button type="button" class="retry">${dutch?'Opnieuw':'Retry'}</button></div>`:''}</div></ha-card>`;
  this.shadowRoot.querySelectorAll('.metric').forEach(b=>{b.onclick=()=>this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:b.dataset.entity},bubbles:true,composed:true}));if(b.dataset.entity===focus)b.focus();});const retry=this.shadowRoot.querySelector('.retry');if(retry)retry.onclick=()=>this._refresh();
 }
}

if(!customElements.get('eleven-overview-card'))customElements.define('eleven-overview-card',OverviewCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(c=>c.type==='eleven-overview-card'))window.customCards.push({type:'eleven-overview-card',name:'Eleven Overview (beta)',description:'Current sensor values, sparklines and change since period start.',preview:true});
})();
