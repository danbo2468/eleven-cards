// Shared markup stays in each card's shadow root: native links and existing
// data-zoom handlers work without cross-bundle custom-element registration.
const headerEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function bindCardPopupPosition(host,trigger,popup,isRequested,show){
 let active=true;
 const position=()=>{
  if(!active||!isRequested())return;
  const box=trigger.getBoundingClientRect();
  // A newly inserted ha-card may not have rendered its slot yet. Never anchor
  // an open popup to its temporarily empty trigger rectangle at (0, 0).
  if(!box.width||!box.height){popup.style.visibility='hidden';return;}
  popup.style.visibility='';show?.();
  const width=Math.min(380,window.innerWidth-16);
  popup.style.width=width+'px';popup.style.maxHeight=Math.min(560,window.innerHeight-16)+'px';
  const height=popup.getBoundingClientRect().height,below=window.innerHeight-box.bottom-8,above=box.top-8;
  popup.style.left=Math.max(8,Math.min(box.right-width,window.innerWidth-width-8))+'px';
  popup.style.top=Math.max(8,Math.min(below>=height||below>=above?box.bottom+6:box.top-height-6,window.innerHeight-height-8))+'px';
 };
 const ready=host.shadowRoot.querySelector('ha-card')?.updateComplete;
 if(ready?.then)ready.then(position,()=>{});
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(position):null;
 observer?.observe(trigger);
 return {position,disconnect(){active=false;observer?.disconnect();}};
}
// Native toggle events are asynchronous. Clear the other popup's restore
// state synchronously, also for browsers using the attribute fallback.
export function closeOtherCardPopups(host,kind){
 const period=kind==='period',root=host.shadowRoot;
 if(period){host._insightOpen=null;host._insightPending=null;host._insightFocus=null;}
 else{host._periodMenuOpen=false;host._periodMenuPending=false;host._periodFocus=null;}
 for(const panel of root.querySelectorAll?.(period?'.insight-popup':'.period-menu')??[]){
  if(typeof panel.showPopover==='function'){if(panel.matches(':popover-open'))panel.hidePopover();}
  else panel.removeAttribute('data-fallback-open');
 }
 for(const trigger of root.querySelectorAll?.(period?'[data-insight]':'[data-period="menu"]')??[])trigger.setAttribute('aria-expanded','false');
}
export function cardHeaderIcon(name){
 const paths={in:'M5 12h14M12 5v14',out:'M5 12h14',reset:'M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6',previous:'m15 6-6 6 6 6',next:'m9 6 6 6-6 6',info:'M12 17v-5M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',history:'M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',down:'m6 9 6 6 6-6'};
 return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
}
export function cardHeader({title,showTitle=true,ready=false,historyUrl,language='en',periods={},zoomState={in:true,out:true,reset:true,zoomed:false},information=''}){
 const nl=language.startsWith('nl'),label=nl?['Inzoomen','Uitzoomen','Zoom herstellen','Open in Home Assistant Geschiedenis']:['Zoom in','Zoom out','Reset zoom','Open in Home Assistant History'];
 const zoom=ready?`<div class="zoom-controls" role="group" aria-label="Zoom">${['out','in','reset'].map(action=>`<button type="button" data-zoom="${action}"${zoomState[action]?'':' disabled'} title="${label[['in','out','reset'].indexOf(action)]}" aria-label="${label[['in','out','reset'].indexOf(action)]}">${cardHeaderIcon(action)}</button>`).join('')}</div>`:'';
 const group=periods.navigation||zoom?`<div class="chart-controls" role="group" aria-label="${nl?'Periode en zoom':'Period and zoom'}">${periods.navigation??''}${zoom}</div>`:'';
 const showZoomStatus=zoomState.zoomed&&!periods.picker;
 return `<header class="card-header">${showTitle&&title?`<h2>${headerEscape(title)}</h2>`:''}<div class="header-actions">${periods.picker??''}${group}<div class="chart-links"><a class="history-link" href="${headerEscape(historyUrl)}" title="${label[3]}" aria-label="${label[3]}">${cardHeaderIcon('history')}</a>${information}</div></div></header>${showZoomStatus?`<div class="chart-context"><div class="chart-range"><span class="zoom-status">${nl?'Ingezoomd':'Zoomed in'}</span></div></div>`:''}`;
}
export function cardHeaderStyles(){return `
.card-header{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;min-height:32px;flex:none;margin:-6px -4px 10px 0}
.card-header h2{flex:1 1 110px;min-width:0;margin:4.75px 0 0;font-size:18px;line-height:1.25;font-weight:650;letter-spacing:-.01em;overflow-wrap:anywhere}
.header-actions{--chart-action-gap:8px;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:var(--chart-action-gap);flex:0 1 auto;min-width:0;max-width:100%;margin-inline-start:auto}
.chart-controls{display:flex;align-items:center;flex-wrap:wrap;gap:0;max-width:100%}
.chart-links{display:flex;align-items:center;gap:var(--chart-action-gap);flex:none}
.zoom-controls{display:flex;gap:0;position:relative}
.header-actions button,.history-link{display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:inherit;font-size:12px;font-weight:400;width:32px;height:32px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--primary-text-color,#20252b);text-decoration:none;cursor:pointer;flex:none}
.chart-controls,.chart-links>.history-link{background:var(--secondary-background-color,#eee);border-radius:5px}
.chart-controls button:not(:disabled):hover,.chart-links>.history-link:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.chart-controls>[data-period="now"]{width:36px}
.chart-controls>[data-period="next"]+.zoom-controls{margin-inline-start:8px;padding-inline-start:8px}
.chart-controls>[data-period="next"]+.zoom-controls::before{content:"";position:absolute;inset-inline-start:0;top:8px;height:16px;width:1px;background:var(--divider-color,#ddd)}
.header-actions button:disabled{opacity:.35;cursor:default}
.header-actions button:hover,.history-link:hover{background:var(--secondary-background-color,#eee)}
.header-actions button:focus-visible,.history-link:focus-visible{background:var(--secondary-background-color,#eee);outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.period-menu,.insight-popup{display:none;position:fixed;inset:auto;margin:0;padding:8px 12px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;z-index:20;max-width:calc(100vw - 16px);border:1px solid var(--divider-color,#ddd);border-radius:10px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font:inherit;font-size:12px;line-height:1.35;box-shadow:0 8px 28px #0004}
.chart-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.chart-popup-heading>strong{font-size:14px;font-weight:600}
.period-menu .chart-popup-heading>button,.insight-popup .chart-popup-heading>button{display:flex;align-items:center;justify-content:center;width:30px;height:30px;min-height:30px;padding:0;border:0;border-radius:5px;background:transparent;color:inherit;font:inherit;font-size:20px;font-weight:400;flex:none;cursor:pointer}
`;}
