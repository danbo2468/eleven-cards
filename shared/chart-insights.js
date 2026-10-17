import {cardHeaderIcon,closeOtherCardPopups,bindCardPopupPosition} from './card-header.js';
const insightEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function chartZoomState(host){
 const total=host._end-host._start,ready=host._status==='ready'&&Number.isFinite(total)&&total>0;
 const a=Math.max(host._start,host._viewport?.[0]??host._start),b=Math.min(host._end,host._viewport?.[1]??host._end),width=Math.max(0,b-a);
 const zoomed=ready&&(a>host._start+1||b<host._end-1);
 return {zoomed,in:ready&&width>Math.min(60000,total)+1,out:ready&&width<total-1,reset:zoomed};
}
export function chartEntityItems(host){return host._config.entities.map(id=>({id,name:host._config.series_options?.find(row=>row.entity===id)?.name||host._hass?.states?.[id]?.attributes?.friendly_name||id}));}
export function chartSeriesVisible(host,index){return host._visibility?.get(host._config.entities[index])??true;}
export function isolateChartSeries(host,id){
 if(!host._config.entities.includes(id))return;
 host._visibility=new Map(host._config.entities.map(entity=>[entity,entity===id]));host._hideTooltip?.();host._render();
}
export function showAllChartSeries(host){host._visibility=new Map(host._config.entities.map(id=>[id,true]));host._hideTooltip?.();host._render();}
function cancelChartLegendClicks(host){for(const timer of host._legendClickTimers?.values()??[])clearTimeout(timer);host._legendClickTimers?.clear();}
export function toggleChartIsolation(host,id){
 if(!host._config.entities.includes(id))return;
 cancelChartLegendClicks(host);
 const only=host._config.entities.every((entity,i)=>host._isSeriesVisible(i)===(entity===id));
 only?showAllChartSeries(host):isolateChartSeries(host,id);
 queueMicrotask(()=>host.shadowRoot.querySelector(`[data-series="${id}"]`)?.focus({preventScroll:true}));
}
export function bindChartLegend(host){
 const nl=host._insightLanguage==='nl',hint=nl?'Dubbelklik of Shift+Enter: alleen deze sensor. Herhaal om alles te tonen.':'Double-click or Shift+Enter: show only this sensor. Repeat to show all.';
 for(const button of host.shadowRoot.querySelectorAll?.('[data-series]')??[]){
  const id=button.dataset.series;
  if(!button.title?.includes(hint))button.title=[button.title,hint].filter(Boolean).join(' ');button.setAttribute('aria-description',hint);button.setAttribute('aria-keyshortcuts','Shift+Enter Shift+Space');
  button.onclick=e=>{
   clearTimeout(host._legendClickTimers?.get(id));host._legendClickTimers?.delete(id);
   if(e.shiftKey||e.detail>1){e.preventDefault();toggleChartIsolation(host,id);return;}
   if(!e.detail){host._toggleSeries?host._toggleSeries(id):toggleChartIsolation(host,id);return;}
   // Keep the target alive until a second click can arrive: rendering after
   // the first click would replace it and break native double-click detection.
   if(host._toggleSeries){const config=host._config;host._legendClickTimers??=new Map();host._legendClickTimers.set(id,setTimeout(()=>{host._legendClickTimers.delete(id);if(host._config===config)host._toggleSeries(id);},300));}
  };
  button.ondblclick=e=>e.preventDefault();
  button.onkeydown=e=>{if(e.shiftKey&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();toggleChartIsolation(host,id);}};
 }
}
function insightControl(host,key,label,body,icon=''){
 return `<div class="insight-control"><button type="button" class="insight-trigger" data-insight="${key}" title="${insightEscape(label)}" aria-label="${insightEscape(label)}" aria-haspopup="dialog" aria-expanded="${host._insightOpen===key}" aria-controls="insight-${key}">${icon}${key==='data'?'':`<span>${insightEscape(label)}</span>`}</button><div id="insight-${key}" class="insight-popup" data-insight-panel="${key}" popover="auto" role="dialog" aria-label="${insightEscape(label)}"><div class="chart-popup-heading"><strong>${insightEscape(label)}</strong><button type="button" data-insight-close aria-label="${host._insightLanguage==='nl'?'Sluiten':'Close'}">×</button></div>${body}</div></div>`;
}
// Work on unstacked, undecimated values. A history value holds until the next
// point (null breaks coverage); bars have equal weight, regardless of bin length.
export function chartValueStatistics(points,start,end,interval){
 let minimum=Infinity,maximum=-Infinity,sum=0,weight=0,count=0,covered=0,until=start;
 for(let i=0;i<points.length;i++){
  const p=points[i],[a,b]=interval?interval(p,i):[p.t,points[i+1]?.t??end];
  const left=Math.max(start,a,p.t),right=Math.min(end,b);
  if(right<=left||!Number.isFinite(p.v))continue;
  minimum=Math.min(minimum,p.v);maximum=Math.max(maximum,p.v);count++;
  const w=interval?1:right-left;sum+=p.v*w;weight+=w;
  const knownEnd=Math.min(right,points[i+1]?.t??end);
  covered+=Math.max(0,knownEnd-Math.max(left,until));until=Math.max(until,knownEnd);
 }
 return {minimum:count?minimum:null,maximum:count?maximum:null,average:weight?sum/weight:null,count,missing:covered<end-start-1};
}
export function chartDataInformation(host,language='en'){
 const nl=language.startsWith('nl');host._insightLanguage=nl?'nl':'en';
 const load=host._lastLoad;
 const summary=host._status==='ready'?host._dataInformation?.():load?.summary;
 if(load&&summary&&host._status==='ready')load.summary=summary;
 const value=v=>{
  if(!Number.isFinite(v))return '—';
  const small=v!==0&&Math.abs(v)<.01,options=small?{maximumSignificantDigits:4}:{maximumFractionDigits:2};
  if(v!==0&&Math.abs(v)<.0001)options.notation='scientific';
  return insightEscape(new Intl.NumberFormat(language,options).format(Object.is(v,-0)?0:v));
 };
 let body=load?'':`<p role="status">${host._inFlight?(nl?'Laden…':'Loading…'):host._loadFailed?(nl?'Laadfout':'Load failed'):(nl?'Geen gegevens':'No data')}</p>`;
 if(load){
  body+=`<div class="insight-sensors">${chartEntityItems(host).map((item,i)=>{
   const source=load.sources.find(s=>s.id===item.id),row=summary?.rows.find(r=>r.id===item.id),hidden=!host._isSeriesVisible(i);
   const sourceLabel=source?(source.source==='statistics'?(nl?'Statistieken':'Statistics'):(nl?'Historie':'History')):(nl?'Niet geladen':'Not loaded');
   const unit=row?.unit??host._hass?.states?.[item.id]?.attributes?.unit_of_measurement??'';
   const metrics=row?.durations?`<dl class="insight-durations">${row.durations.map(s=>`<div><dt title="${insightEscape(s.missing?(nl?'Geen geschiedenis':'No history'):s.state)}">${insightEscape(s.label)}</dt><dd>${insightEscape(host._duration(s.duration))}</dd></div>`).join('')}</dl>`:row?`<dl class="insight-metrics${'total' in row?' has-total':''}">${[['minimum','Min'],['maximum','Max'],['average',nl?'Gem.':'Avg.']].map(([key,label])=>`<div><dt${key==='average'?` title="${nl?'Gemiddeld':'Average'}"`:''}>${label}</dt><dd data-metric="${key}">${value(row[key])}</dd></div>`).join('')}${'total' in row?`<div><dt title="${nl?'Som van volledige staven':'Sum of whole bars'}">${nl?'Som':'Sum'}</dt><dd data-metric="total">${value(row.total)}</dd></div>`:''}</dl>`:'';
   const states=[host._inFlight?(nl?'Vernieuwen…':'Refreshing…'):host._loadFailed?(nl?'Verouderd':'Outdated'):'',hidden?(nl?'Verborgen':'Hidden'):'',row?.limited?(nl?'Meer dan 20 statussen':'More than 20 states'):row?.count===0||source?.empty?(nl?'Geen gegevens':'No data'):row?.missing?(nl?'Onvolledig':'Incomplete'):''].filter(Boolean);
   return `<section class="insight-sensor" data-information-entity="${insightEscape(item.id)}"><div class="insight-sensor-heading"><strong>${insightEscape(item.name)}</strong><span class="insight-source">${sourceLabel}${unit?` <span class="insight-unit">· ${insightEscape(unit)}</span>`:''}</span></div>${metrics}${states.length?`<div class="insight-states" role="status">${states.join(' · ')}</div>`:''}</section>`;
  }).join('')}</div>`;
 }
 return insightControl(host,'data',nl?'Gegevens':'Data information',body,cardHeaderIcon('info'));
}
export function captureChartInsights(host){
 const active=host.shadowRoot.activeElement;
 if(!host._insightPending)host._insightFocus=null;
 if(active?.closest?.('.insight-control'))host._insightFocus={key:active.closest('.insight-control').querySelector('[data-insight]')?.dataset.insight,inside:!!active.closest('.insight-popup'),entity:active.dataset.isolate,all:active.hasAttribute('data-show-all')};
 const popup=[...(host.shadowRoot.querySelectorAll?.('.insight-popup')??[])].find(panel=>typeof panel.showPopover==='function'?panel.matches(':popover-open'):panel.hasAttribute('data-fallback-open'));
 host._insightOpen=popup?.dataset.insightPanel??host._insightPending??null;
}
export function disconnectChartInsights(host,keepLegendClicks=false){if(!keepLegendClicks){cancelChartLegendClicks(host);host._insightPending=null;}host._insightCleanup?.();host._insightCleanup=null;}
function restoreChartInsightFocus(host){
 if(!host._insightFocus||host._insightPending)return;
 const root=host.shadowRoot,{key,inside,entity,all}=host._insightFocus,popup=root.querySelector(`[data-insight-panel="${key}"]`),target=inside&&host._insightOpen===key?popup?.querySelector(entity?`[data-isolate="${entity}"]`:all?'[data-show-all]':'[data-insight-close]'):root.querySelector(`[data-insight="${key}"]`);
 if(target){target.focus?.({preventScroll:true});host._insightFocus=null;}
}
export function bindChartInsights(host){
 disconnectChartInsights(host,true);
 const root=host.shadowRoot,cleanups=[];host._insightCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 for(const control of root.querySelectorAll?.('.insight-control')??[]){
  const trigger=control.querySelector('[data-insight]'),popup=control.querySelector('.insight-popup'),key=trigger.dataset.insight,native=typeof popup.showPopover==='function';
  const isOpen=()=>native?popup.matches(':popover-open'):popup.hasAttribute('data-fallback-open');
  let focusPending=false;
  const placement=bindCardPopupPosition(host,trigger,popup,()=>host._insightOpen===key,()=>{
   host._insightPending=null;
   if(native){if(!isOpen())popup.showPopover();}else popup.setAttribute('data-fallback-open','');
   if(focusPending){popup.querySelector('[data-insight-close]')?.focus({preventScroll:true});focusPending=false;}
   restoreChartInsightFocus(host);
  }),position=placement.position;
  cleanups.push(()=>placement.disconnect());
  const close=(focus=false)=>{if(host._insightOpen===key)host._insightOpen=null;host._insightPending=null;trigger.setAttribute('aria-expanded','false');if(native){if(isOpen())popup.hidePopover();}else popup.removeAttribute('data-fallback-open');if(focus)trigger.focus({preventScroll:true});};
  const open=(focus=true)=>{closeOtherCardPopups(host,'insight');host._insightOpen=key;host._insightPending=key;focusPending=focus;trigger.setAttribute('aria-expanded','true');position();};
  let pointerWasOpen;trigger.onpointerdown=()=>{pointerWasOpen=isOpen();};trigger.onpointercancel=()=>{pointerWasOpen=undefined;};
  trigger.onclick=()=>{const wasOpen=pointerWasOpen??isOpen();pointerWasOpen=undefined;wasOpen?close(true):open();};
  popup.querySelector('[data-insight-close]').onclick=()=>close(true);
  popup.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}};
  popup.addEventListener('toggle',e=>{if(root.querySelector(`[data-insight-panel="${key}"]`)!==popup)return;trigger.setAttribute('aria-expanded',String(e.newState==='open'));if(e.newState==='closed'&&host._insightOpen===key)host._insightOpen=null;});
  for(const button of popup.querySelectorAll('[data-isolate]'))button.onclick=()=>{close(true);isolateChartSeries(host,button.dataset.isolate);};
  const all=popup.querySelector('[data-show-all]');if(all)all.onclick=()=>{close(true);showAllChartSeries(host);};
  listen(window,'resize',()=>{if(isOpen()){if(trigger.getClientRects().length)position();else close();}});
  listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(popup))close();},true);
  listen(document,'pointerdown',e=>{if((!native||host._insightPending===key)&&host._insightOpen===key&&!e.composedPath().includes(control))close();});
  if(host._insightOpen===key)open(false);
 }
 restoreChartInsightFocus(host);
 if(host._insightFocus)listen(document,'pointerdown',e=>{if(!e.composedPath().includes(host)){host._insightFocus=null;host._insightOpen=null;host._insightPending=null;}},true);
 bindChartLegend(host);
}
export function chartInsightStyles(){return `
.chart-context{display:flex;align-items:center;justify-content:space-between;gap:6px 12px;flex-wrap:wrap;flex:none;margin:0 0 8px;min-width:0}
.chart-range{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;min-width:0;flex:1}
.chart-range .period-panel{margin:0}
.zoom-status{font-size:11px;color:var(--primary-text-color,#20252b);background:var(--secondary-background-color,#eee);border-radius:4px;padding:2px 6px;white-space:nowrap}
.insight-control{display:inline-flex;flex:none}
.insight-trigger{font:inherit;font-size:11px;min-height:28px;padding:3px 7px;display:flex;align-items:center;gap:5px;border:0;border-radius:5px;background:transparent;color:var(--primary-text-color,#20252b);cursor:pointer}
.insight-trigger svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.insight-trigger:hover{background:var(--secondary-background-color,#eee)}
.header-actions .insight-trigger{width:32px;height:32px;padding:0;background:var(--secondary-background-color,#eee);border-radius:5px}
.header-actions .insight-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.header-actions .insight-trigger svg{width:18px;height:18px;stroke-width:2}
.insight-trigger:focus-visible,.insight-popup button:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.insight-popup{z-index:21}
.insight-popup:popover-open{display:block}
.insight-popup[data-fallback-open]{display:block}
.insight-popup button{display:block;box-sizing:border-box;width:auto;height:auto;padding:0;font:inherit;cursor:pointer;color:inherit;background:transparent;border:0;border-radius:5px;min-height:30px}
.insight-popup button:disabled{opacity:.4;cursor:default}
.insight-popup button:hover{background:var(--secondary-background-color,#eee)}
.insight-popup p{margin:8px 0 12px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-popup p strong{color:var(--primary-text-color,#20252b);font-weight:500}
.insight-popup .insight-choice{display:block;width:100%;padding:6px 8px;text-align:start;overflow-wrap:anywhere}
.insight-choice[aria-pressed="true"]{background:var(--secondary-background-color,#eee);font-weight:600}
.insight-sensors{display:grid}
.insight-sensor{min-width:0;padding:8px 0}
.insight-sensor+.insight-sensor{border-top:1px solid var(--divider-color,#ddd)}
.insight-sensor-heading{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 8px}
.insight-sensor-heading>strong{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:600}
.insight-source{font-size:10px;font-weight:400;color:var(--secondary-text-color,#666);color:color-mix(in srgb,var(--secondary-text-color,#666) 90%,var(--ha-card-background,var(--card-background-color,#fff)));flex:none}
.insight-unit{white-space:nowrap}
.insight-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 8px;margin:6px 0 0}
.insight-metrics.has-total{grid-template-columns:repeat(4,minmax(0,1fr))}
.insight-metrics>div{min-width:0}
.insight-metrics dt{font-size:10px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-metrics dd{margin:1px 0 0;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;color:var(--primary-text-color,#20252b)}
.insight-states{font-size:10px;color:var(--secondary-text-color,#666);margin-top:4px}
.insight-durations{margin:6px 0 0;display:grid;gap:4px}
.insight-durations>div{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:12px}
.insight-durations dt{min-width:0;overflow-wrap:anywhere;color:var(--secondary-text-color,#666)}
.insight-durations dd{margin:0;color:var(--primary-text-color,#20252b);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
[data-series]{touch-action:manipulation}
`;}
