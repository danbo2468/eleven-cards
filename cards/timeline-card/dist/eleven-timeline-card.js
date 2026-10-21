(()=>{
// Native controls: text/attributes are escaped; content is trusted, caller-owned HTML.
function uiEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function uiAttributes(values={}){
 return Object.entries(values).map(([key,value])=>{
  if(!/^[a-zA-Z_:][\w:.-]*$/.test(key)||/^on/i.test(key))throw Error('Invalid UI attribute: '+key);
  if(value==null)return '';
  if(['disabled','hidden','required','autofocus','multiple','readonly'].includes(key))return value?` ${key}`:'';
  return ` ${key}="${uiEscape(value)}"`;
 }).join('');
}
function uiButton({text='',content,label,title,variant='icon',className='',type='button',href,disabled=false,attrs={}}={}){
 const classes=className?` class="${uiEscape(className)}"`:'';
 const body=content??uiEscape(text),attributes=uiAttributes({...attrs,...(label==null?{}:{'aria-label':label}),...(title==null?{}:{title}),...(disabled?{disabled:true}:{})});
 return href==null?`<button type="${uiEscape(type)}"${classes} data-ui-button="${uiEscape(variant)}"${attributes}>${body}</button>`:`<a${classes} data-ui-button="${uiEscape(variant)}" href="${uiEscape(href)}"${attributes}>${body}</a>`;
}
function uiButtonStyles(){return `
[data-ui-button]{display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:inherit;font-size:12px;font-weight:400;padding:0;border:0;border-radius:4px;background:transparent;color:var(--primary-text-color,#20252b);text-decoration:none;cursor:pointer;flex:none}
[data-ui-button="icon"]{width:32px;height:32px}
[data-ui-button]:not(:disabled):hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
[data-ui-button]:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
[data-ui-button="icon"]:focus-visible{background:var(--secondary-background-color,#eee)}
[data-ui-button]:disabled{opacity:.35;cursor:default}
[data-ui-button="surface"]{height:auto;width:100%;justify-content:space-between;gap:8px;min-height:34px;text-align:start;padding:6px 8px;border-radius:5px;background:var(--secondary-background-color,#eee)}
[data-ui-button="surface"][aria-checked="true"],[data-ui-button="surface"][aria-pressed="true"]{color:var(--primary-color,#2196f3);background:color-mix(in srgb,var(--primary-color,#2196f3) 14%,var(--ha-card-background,var(--card-background-color,#fff)));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--primary-color,#2196f3) 55%,transparent)}
[data-ui-button="text"]{min-height:30px;height:auto;width:auto;border-radius:5px}
[data-ui-button="close"]{width:30px;height:30px;min-height:30px;border-radius:5px;font-size:20px;color:inherit}
`;}


// The caller owns each item's trusted HTML (swatch, label and optional value).
function uiLegendButton({id,visible=true,content='',title='',className='legend-item',attrs={}}={}){
 return `<button type="button" class="${uiEscape(className)}"${uiAttributes({...attrs,'data-ui-legend':id,'aria-pressed':visible,title})}>${content}</button>`;
}
function uiLegend({items=[],className='legend',attrs={},afterContent=''}={}){
 return `<div class="${uiEscape(className)}"${uiAttributes(attrs)}>${items.map(uiLegendButton).join('')}${afterContent}</div>`;
}
function cancelUILegendClicks(host){
 for(const timer of host._legendClickTimers?.values()??[])clearTimeout(timer);
 host._legendClickTimers?.clear();
}
function focusUILegend(host,id,selector='[data-ui-legend]',getId=button=>button.dataset.uiLegend){
 queueMicrotask(()=>[...host.shadowRoot.querySelectorAll(selector)].find(button=>getId(button)===id)?.focus({preventScroll:true}));
}
function bindUILegend(host,{selector='[data-ui-legend]',getId=button=>button.dataset.uiLegend,hint='',toggle,isolate}={}){
 for(const button of host.shadowRoot.querySelectorAll?.(selector)??[]){
  const id=getId(button);
  if(hint&&!button.title?.includes(hint))button.title=[button.title,hint].filter(Boolean).join(' ');
  if(hint)button.setAttribute('aria-description',hint);
  button.setAttribute('aria-keyshortcuts','Shift+Enter Shift+Space');
  button.onclick=event=>{
   clearTimeout(host._legendClickTimers?.get(id));host._legendClickTimers?.delete(id);
   if(event.shiftKey||event.detail>1){event.preventDefault();isolate?.(id);return;}
   if(!event.detail){(toggle??isolate)?.(id);return;}
   // Wait for the second click before a rerender replaces the clicked button.
   if(toggle){const config=host._config;host._legendClickTimers??=new Map();host._legendClickTimers.set(id,setTimeout(()=>{host._legendClickTimers.delete(id);if(host._config===config)toggle(id);},300));}
  };
  button.ondblclick=event=>event.preventDefault();
  button.onkeydown=event=>{if(event.shiftKey&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();isolate?.(id);}};
 }
}

function uiTabs({id,label,items,selected,className='',panelClassName=''}={}){
 if(typeof id!=='string'||!id||!items?.length||items.some(item=>typeof item.value!=='string'||!item.value)||new Set(items.map(item=>item.value)).size!==items.length)throw Error('Tabs need an id and distinct text values.');
 const active=items.find(item=>item.value===selected&&!item.disabled)??items.find(item=>!item.disabled);
 const tabId=value=>`${id}-tab-${encodeURIComponent(value)}`,panelId=value=>`${id}-panel-${encodeURIComponent(value)}`;
 const bar=`<div${uiAttributes({class:className||null,'data-ui-tabs':'',role:'tablist','aria-label':label})}>${items.map(item=>uiButton({variant:'tab',text:item.label,disabled:item.disabled,attrs:{role:'tab',id:tabId(item.value),'data-ui-tab':item.value,'aria-controls':panelId(item.value),'aria-selected':item===active,tabindex:item===active?0:-1,...item.tabAttrs}})).join('')}</div>`;
 const panels=items.map(item=>`<section${uiAttributes({class:[panelClassName,item.className].filter(Boolean).join(' ')||null,id:panelId(item.value),role:'tabpanel','aria-labelledby':tabId(item.value),'data-ui-tab-panel':item.value,...item.panelAttrs,hidden:item!==active})}>${item.content??''}</section>`).join('');
 return bar+panels;
}
function bindUITabs({tabs,panels,onSelect=()=>{}}){
 const buttons=[...tabs],sections=[...panels],cleanups=[];
 const select=(value,{focus=false,notify=true}={})=>{
  const target=buttons.find(tab=>tab.dataset.uiTab===value&&!tab.disabled);if(!target)return false;
  for(const tab of buttons){const active=tab===target;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  for(const panel of sections)panel.hidden=panel.dataset.uiTabPanel!==value;
  if(focus)target.focus({preventScroll:true});if(notify)onSelect(value,target);return true;
 };
 for(const tab of buttons){
  const click=()=>select(tab.dataset.uiTab,{focus:true});
  const keydown=e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
   e.preventDefault();e.stopPropagation();const enabled=buttons.filter(button=>!button.disabled),index=enabled.indexOf(tab);
   const next=e.key==='Home'?0:e.key==='End'?enabled.length-1:(index+(e.key==='ArrowRight'?1:-1)+enabled.length)%enabled.length;
   if(enabled[next])select(enabled[next].dataset.uiTab,{focus:true});
  };
  tab.onclick=click;tab.onkeydown=keydown;
  cleanups.push(()=>{if(tab.onclick===click)tab.onclick=null;if(tab.onkeydown===keydown)tab.onkeydown=null;});
 }
 return {select,disconnect(){cleanups.splice(0).forEach(remove=>remove());}};
}
function uiTabsStyles(){return `
[data-ui-tabs]{display:flex;align-items:flex-end;gap:8px;border-bottom:1px solid var(--divider-color,#ddd)}
[data-ui-tabs] [role="tab"]{flex:1;justify-content:center;min-width:0;min-height:36px;padding:8px 3px;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--secondary-text-color,#666);white-space:nowrap}
[data-ui-tabs] [role="tab"]:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 5%,var(--ha-card-background,var(--card-background-color,#fff)));color:var(--primary-text-color,#20252b)}
[data-ui-tabs] [role="tab"][aria-selected="true"]{border-bottom-color:var(--primary-color,#2196f3);color:var(--primary-color,#2196f3);font-weight:600}
[data-ui-tab-panel][hidden]{display:none!important}
`;}

function uiPopup({id,title,label=title,closeLabel='Close',content='',className='',attrs={},closeAttrs={}}){
 return `<div${uiAttributes({id,class:className||null,'data-ui-popup':'',popover:'auto',role:'dialog','aria-label':label,...attrs})}><div class="ui-popup-heading"><strong>${uiEscape(title)}</strong>${uiButton({variant:'close',content:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>',label:closeLabel,attrs:{'data-ui-popup-close':'',...closeAttrs}})}</div>${content}</div>`;
}
function bindUIPopupPosition({trigger,popup,isRequested,onShow,ready,width=380,maxHeight=560}){
 let active=true;
 const position=()=>{
  if(!active||!isRequested())return;
  const box=trigger.getBoundingClientRect();
  if(!box.width||!box.height){popup.style.visibility='hidden';return;}
  const actualWidth=Math.min(width,window.innerWidth-16);
  popup.style.width=actualWidth+'px';popup.style.maxHeight=Math.min(maxHeight,window.innerHeight-16)+'px';
  popup.style.visibility='';onShow?.();
  const height=popup.getBoundingClientRect().height,below=window.innerHeight-box.bottom-8,above=box.top-8;
  popup.style.left=Math.max(8,Math.min(box.right-actualWidth,window.innerWidth-actualWidth-8))+'px';
  popup.style.top=Math.max(8,Math.min(below>=height||below>=above?box.bottom+6:box.top-height-6,window.innerHeight-height-8))+'px';
 };
 if(ready?.then)ready.then(position,()=>{});
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(position):null;
 observer?.observe(trigger);
 return {position,disconnect(){active=false;observer?.disconnect();}};
}
// Domain state lives in callbacks; this controller also works without a card host.
function bindUIPopup({trigger,popup,container=popup,ready,isRequested,isCurrent=()=>true,beforeOpen=()=>{},onOpen=()=>{},onClose=()=>{},onShown=()=>{},onToggle=()=>{},focusTarget,closeWhenAnchorHidden=false}){
 let requested=false,pending=false,focusPending=false,pointerWasOpen;
 const wantsOpen=isRequested??(()=>requested),native=typeof popup.showPopover==='function';
 const isOpen=()=>native?popup.matches(':popover-open'):popup.hasAttribute('data-fallback-open');
 trigger.setAttribute('aria-haspopup','dialog');if(popup.id)trigger.setAttribute('aria-controls',popup.id);trigger.setAttribute('aria-expanded',String(isOpen()));
 const cleanups=[],listen=(target,type,handler,capture=false)=>{target?.addEventListener?.(type,handler,capture);cleanups.push(()=>target?.removeEventListener?.(type,handler,capture));};
 const property=(target,key,handler)=>{if(!target)return;target[key]=handler;cleanups.push(()=>{if(target[key]===handler)target[key]=null;});};
 const closeButton=popup.querySelector('[data-ui-popup-close]');
 const placement=bindUIPopupPosition({trigger,popup,ready,isRequested:wantsOpen,onShow:()=>{
  pending=false;if(native){if(!isOpen())popup.showPopover();}else popup.setAttribute('data-fallback-open','');
  if(focusPending){(focusTarget?.()??closeButton)?.focus({preventScroll:true});focusPending=false;}
  onShown();
 }});
 const close=(focus=false)=>{
  requested=false;pending=false;focusPending=false;onClose();trigger.setAttribute('aria-expanded','false');
  if(native){if(isOpen())popup.hidePopover();}else popup.removeAttribute('data-fallback-open');
  if(focus)trigger.focus({preventScroll:true});
 };
 const open=(focus=true)=>{beforeOpen();requested=true;pending=true;focusPending=focus;onOpen(focus);trigger.setAttribute('aria-expanded','true');placement.position();};
 property(trigger,'onpointerdown',()=>{pointerWasOpen=wantsOpen();});
 property(trigger,'onpointercancel',()=>{pointerWasOpen=undefined;});
 property(trigger,'onclick',()=>{const wasOpen=pointerWasOpen??wantsOpen();pointerWasOpen=undefined;wasOpen?close(true):open();});
 property(closeButton,'onclick',()=>close(true));
 listen(popup,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}});
 listen(popup,'toggle',e=>{if(!isCurrent())return;const opened=e.newState==='open';if(!opened){if(wantsOpen())onClose();pending=false;focusPending=false;}requested=opened;trigger.setAttribute('aria-expanded',String(opened));onToggle(opened);});
 listen(window,'resize',()=>{if(wantsOpen()){if(closeWhenAnchorHidden&&trigger.getClientRects?.().length===0)close();else placement.position();}});
 listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(popup))close();},true);
 listen(document,'pointerdown',e=>{if((!native||pending)&&(isOpen()||wantsOpen())&&!e.composedPath().includes(container))close();});
 return {open,close,isOpen,position:placement.position,disconnect(){placement.disconnect();cleanups.splice(0).forEach(remove=>remove());}};
}
function uiPopupStyles(){return `
[data-ui-popup]{display:none;position:fixed;inset:auto;margin:0;padding:8px 12px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;z-index:20;max-width:calc(100vw - 16px);border:1px solid var(--divider-color,#ddd);border-radius:10px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font:inherit;font-size:12px;line-height:1.35;box-shadow:0 8px 28px #0004}
[data-ui-popup]:popover-open,[data-ui-popup][data-fallback-open]{display:block}
[data-ui-popup] [hidden]{display:none!important}
.ui-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.ui-popup-heading>strong{font-size:14px;font-weight:600}
.ui-popup-heading [data-ui-popup-close]{display:grid;place-items:center;width:30px;height:30px;min-height:30px;padding:0;line-height:1;flex:none}
.ui-popup-heading [data-ui-popup-close] svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
`;}

// Shared markup stays in each card's shadow root: native links and existing
// data-zoom handlers work without cross-bundle custom-element registration.
const headerEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bindCardPopupPosition(host,trigger,popup,isRequested,show){
 return bindUIPopupPosition({trigger,popup,isRequested,onShow:show,ready:host.shadowRoot.querySelector('ha-card')?.updateComplete});
}
// Native toggle events are asynchronous. Clear the other popup's restore
// state synchronously, also for browsers using the attribute fallback.
function closeOtherCardPopups(host,kind){
 const period=kind==='period',root=host.shadowRoot;
 if(period){host._insightOpen=null;host._insightPending=null;host._insightFocus=null;}
 else{host._periodMenuOpen=false;host._periodMenuPending=false;host._periodFocus=null;}
 for(const panel of root.querySelectorAll?.(period?'.insight-popup':'.period-menu')??[]){
  if(typeof panel.showPopover==='function'){if(panel.matches(':popover-open'))panel.hidePopover();}
  else panel.removeAttribute('data-fallback-open');
 }
 for(const trigger of root.querySelectorAll?.(period?'[data-insight]':'[data-period="menu"]')??[])trigger.setAttribute('aria-expanded','false');
}
function cardHeaderIcon(name){
 const paths={in:'M5 12h14M12 5v14',out:'M5 12h14',reset:'M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6',previous:'m15 6-6 6 6 6',next:'m9 6 6 6-6 6',info:'M12 17v-5M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',history:'M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',down:'m6 9 6 6 6-6'};
 return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
}
function cardHeader({title,showTitle=true,ready=false,historyUrl,language='en',periods={},zoomState={in:true,out:true,reset:true,zoomed:false},information=''}){
 const nl=language.startsWith('nl'),label=nl?['Inzoomen','Uitzoomen','Zoom herstellen','Open in Home Assistant Geschiedenis']:['Zoom in','Zoom out','Reset zoom','Open in Home Assistant History'];
 const zoom=ready?`<div class="zoom-controls" role="group" aria-label="Zoom">${['out','in','reset'].map(action=>uiButton({content:cardHeaderIcon(action),disabled:!zoomState[action],title:label[['in','out','reset'].indexOf(action)],label:label[['in','out','reset'].indexOf(action)],attrs:{'data-zoom':action}})).join('')}</div>`:'';
 const group=periods.picker||periods.navigation?`<div class="chart-controls" role="group" aria-label="${nl?'Tijdvak':'Timeframe'}">${periods.picker??''}${periods.navigation??''}</div>`:'';
 const showZoomStatus=zoomState.zoomed&&!periods.picker;
 return `<header class="card-header">${showTitle&&title?`<h2>${headerEscape(title)}</h2>`:''}<div class="header-actions">${group}${zoom}<div class="chart-links" role="group" aria-label="${nl?'Geschiedenis en informatie':'History and information'}">${uiButton({href:historyUrl??'',className:'history-link',content:cardHeaderIcon('history'),title:label[3],label:label[3]})}${information}</div></div></header>${showZoomStatus?`<div class="chart-context"><div class="chart-range"><span class="zoom-status">${nl?'Ingezoomd':'Zoomed in'}</span></div></div>`:''}`;
}
function cardHeaderStyles(){return uiButtonStyles()+uiPopupStyles()+`
.card-header{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;min-height:32px;flex:none;margin:-6px -4px 10px 0}
.card-header h2{flex:1 1 110px;min-width:0;margin:4.75px 0 0;font-size:18px;line-height:1.25;font-weight:650;letter-spacing:-.01em;overflow-wrap:anywhere}
.header-actions{--chart-action-gap:8px;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:var(--chart-action-gap);flex:0 1 auto;min-width:0;max-width:100%;margin-inline-start:auto}
.chart-controls{display:flex;align-items:center;gap:0;min-width:0;max-width:100%}
.chart-links{display:flex;align-items:center;gap:0;flex:none}
.zoom-controls{display:flex;gap:0;position:relative}
.chart-controls,.zoom-controls,.chart-links{background:var(--secondary-background-color,#eee);border-radius:5px}
.chart-controls>[data-period="now"]{width:36px}
.chart-controls>.period-controls{position:relative;margin-inline-end:8px;padding-inline-end:8px}
.chart-controls>.period-controls::after{content:"";position:absolute;inset-inline-end:0;top:8px;height:16px;width:1px;background:var(--divider-color,#ddd)}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
`;}

// Domain-neutral SVG renderer. Adapters own data, geometry, colors and annotations.
function graphLineStyle(style, width = 3.5) {
  return {style, width, dash: style === 'dashed' ? '8 7' : style === 'dotted' ? '1 7' : 'none', cap: style === 'dashed' ? 'butt' : 'round'};
}
const graphAttribute = value => String(value).replace(/[&"<>]/g, c => ({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
class SharedGraph {
  static hoverGroup(host) {
    return host._config?.sync_hover === false ? null : (host._config?.hover_sync_group?.trim() || 'default');
  }
  static hoverState() {
    const key = Symbol.for('eleven-cards.hover-sync.v1');
    const target = globalThis.window ?? globalThis;
    return target[key] ??= new Map();
  }
  static connectHover(host, receive) {
    this.disconnectHover(host);
    host._receiveSharedHover = receive;
    host._sharedHoverListener = event => {
      const {source, group, timestamp} = event.detail;
      if (source !== host && host.isConnected && group === this.hoverGroup(host)) receive(timestamp);
    };
    window.addEventListener('eleven-cards:hover-sync', host._sharedHoverListener);
    // Scroll does not cross shadow roots: listen in every enclosing tree.
    host._sharedScrollTargets = [window];
    for (let root = host.getRootNode?.(); root && root !== window; root = root.host?.getRootNode()) {
      host._sharedScrollTargets.push(root);
    }
    host._sharedScrollListener = event => {
      if (event?.composedPath?.().some(node => node?.classList?.contains('tooltip'))) return;
      host._hideTooltip();
    };
    for (const target of host._sharedScrollTargets) target.addEventListener('scroll', host._sharedScrollListener, true);
    window.addEventListener('resize', host._sharedScrollListener);
  }
  static tooltipInView(host) {
    const chart = host.shadowRoot?.querySelector('.chart');
    const box = chart?.getBoundingClientRect?.();
    if (!box) return true;
    const bottom = box.bottom ?? box.top + box.height, right = box.right ?? box.left + box.width;
    if (bottom <= 0 || right <= 0 || box.top >= (window.innerHeight ?? Infinity) || box.left >= (window.innerWidth ?? Infinity)) return false;
    // Respect nested scrolling/clipping containers, including HA's shadow trees.
    for (let node = host; node; node = node.parentElement ?? node.getRootNode?.().host) {
      if (!node.getBoundingClientRect || !globalThis.getComputedStyle) continue;
      const style = getComputedStyle(node), clipX = /auto|scroll|hidden|clip/.test(style.overflowX), clipY = /auto|scroll|hidden|clip/.test(style.overflowY);
      if (!clipX && !clipY) continue;
      const bounds = node.getBoundingClientRect();
      if ((clipY && (bottom <= bounds.top || box.top >= bounds.bottom)) || (clipX && (right <= bounds.left || box.left >= bounds.right))) return false;
    }
    return true;
  }
  static tooltipStyles() {
    return `.tooltip{position:absolute;z-index:4;box-sizing:border-box;min-width:0;max-width:calc(100% - 8px);padding:8px 10px;border:1px solid var(--divider-color,#ddd);border-radius:6px;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));box-shadow:0 3px 12px #0002;font-size:12px;line-height:1.4;font-variant-numeric:tabular-nums;overflow:auto;overflow-wrap:anywhere;pointer-events:none}.tooltip[hidden]{display:none}.tooltip strong{display:block;margin-bottom:4px;white-space:normal}.tooltip span{display:grid;grid-template-columns:9px minmax(0,1fr);column-gap:6px;margin-top:5px;white-space:normal}.tooltip i{display:block;width:9px;height:9px;margin:4px 0 0;border:0;border-radius:3px;flex-shrink:0;background:var(--series-color)}.tooltip b{font-weight:600;min-width:0;overflow-wrap:anywhere}.tooltip small{display:block;grid-column:2;color:var(--secondary-text-color,#666);font-size:10px;white-space:normal;font-variant-numeric:tabular-nums}`;
  }
  static publishHover(host, timestamp) {
    const group = this.hoverGroup(host);
    if (!group || !host.isConnected || !Number.isFinite(timestamp)) return;
    this.hoverState().set(group, {source: host, timestamp});
    window.dispatchEvent(new CustomEvent('eleven-cards:hover-sync', {detail: {source: host, group, timestamp}}));
  }
  static clearHover(host) {
    for (const [group, active] of this.hoverState()) {
      if (active.source !== host) continue;
      this.hoverState().delete(group);
      window.dispatchEvent(new CustomEvent('eleven-cards:hover-sync', {detail: {source: host, group, timestamp: null}}));
    }
  }
  static hoverSourceInEvent(host, event) {
    const active = this.hoverState().get(this.hoverGroup(host));
    return Boolean(active && event.composedPath().includes(active.source));
  }
  static restoreHover(host) {
    if (!host.isConnected) return;
    const active = this.hoverState().get(this.hoverGroup(host));
    if (active && host.isConnected) host._receiveSharedHover?.(active.timestamp);
  }
  static disconnectHover(host) {
    this.clearHover(host);
    if (host._sharedHoverListener) globalThis.window?.removeEventListener('eleven-cards:hover-sync', host._sharedHoverListener);
    for (const target of host._sharedScrollTargets ?? []) target.removeEventListener('scroll', host._sharedScrollListener, true);
    globalThis.window?.removeEventListener('resize', host._sharedScrollListener);
    host._sharedScrollTargets = [];
    host._sharedScrollListener = null;
    host._sharedHoverListener = null;
    host._receiveSharedHover = null;
  }
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

function retryDelay(failures, base = 60000, maximum = 300000) {
  return Math.min(maximum, base * 2 ** Math.max(0, failures - 1));
}

// Calendar periods use the Home Assistant timezone, including DST boundaries.
const periodZoneFormats=new Map();
function periodLocalParts(t,zone){
 let format=periodZoneFormats.get(zone);
 if(!format){format=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});periodZoneFormats.set(zone,format);}
 return Object.fromEntries(format.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
}
function periodLocalEpoch(t,zone){const p=periodLocalParts(t,zone);return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
function periodMidnight(nominal,zone){
 let t=nominal;for(let i=0;i<6;i++){const next=nominal-(periodLocalEpoch(t,zone)-t);if(next===t)return t;t=next;}
 // Midnight can be skipped by a timezone transition. Use the first valid
 // instant of that local date rather than oscillating across the transition.
 let low=nominal-36*3600000,high=nominal+36*3600000;
 while(high-low>1000){const mid=Math.floor((low+high)/2000)*1000,p=periodLocalParts(mid,zone);if(Date.UTC(p.year,p.month-1,p.day)>=nominal)high=mid;else low=mid;}
 return high;
}
function calendarDayStart(key,zone='UTC'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;
 const nominal=Date.parse(`${key}T00:00:00Z`);
 return Number.isFinite(nominal)&&new Date(nominal).toISOString().slice(0,10)===key?periodMidnight(nominal,zone||'UTC'):NaN;
}
function graphPeriodBounds(t,period,zone='UTC'){
 zone ||= 'UTC';const p=periodLocalParts(t,zone),size={minute:60000,quarter_hour:900000,hour:3600000}[period];
 if(size){const local=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),a=t-(local%size)-(t%1000);return [a,a+size];}
 let nominal=Date.UTC(p.year,p.month-1,period==='month'?1:p.day);let next;
 if(period==='week'){const day=new Date(nominal).getUTCDay();nominal-=((day+6)%7)*86400000;next=nominal+7*86400000;}
 else if(period==='month')next=Date.UTC(p.year,p.month,1);
 else next=nominal+86400000;
 return [periodMidnight(nominal,zone),periodMidnight(next,zone)];
}
const periodCalendarModes=['today','week','month','quarter','year'];
const periodPresetHours={'1h':1,'6h':6,'12h':12,'24h':24,'48h':48,'7d':168,'14d':336,'30d':720,'90d':2160,'365d':8760};
function periodDateTime(t,zone='UTC'){
 const p=periodLocalParts(t,zone),pad=n=>String(n).padStart(2,'0');
 return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
function parsePeriodDateTime(value,zone='UTC',edge='start',previous){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;
 if(Number.isFinite(previous)&&periodDateTime(previous,zone)===value)return previous;
 const nominal=Date.parse(value+'Z');if(!Number.isFinite(nominal)||periodDateTime(nominal,'UTC')!==value)return NaN;
 // Collect the offsets on both sides of a transition. Reject skipped local
 // times; repeated times include both occurrences unless editing an existing bound.
 const candidates=new Set();
 for(let h=-48;h<=48;h+=6){const sample=nominal+h*3600000,offset=periodLocalEpoch(sample,zone)-sample,candidate=nominal-offset;if(periodDateTime(candidate,zone)===value)candidates.add(candidate);}
 const times=[...candidates].sort((a,b)=>a-b);return times.length?(edge==='end'?times.at(-1):times[0]):NaN;
}
function chooseCustomGraphPeriod(host,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>366*86400000)return false;
 resetGraphPeriod(host);host._periodMode='custom';host._periodHours=(end-start)/3600000;host._periodEnd=end;
 publishTimeframe(host);host._reloadPeriod();return true;
}
function timeframeSyncConfig(config,{draft=false}={}){
 if(!draft){
  if(config.sync_timeframe!==undefined&&typeof config.sync_timeframe!=='boolean')throw Error('sync_timeframe must be a boolean. / Tijdvak synchroniseren moet aan of uit zijn.');
  for(const key of ['hover_sync_group','timeframe_sync_group'])if(config[key]!=null&&typeof config[key]!=='string')throw Error(`${key} must be text. / De synchronisatiegroep moet tekst zijn.`);
 }
 return {sync_timeframe:config.sync_timeframe??false,hover_sync_group:config.hover_sync_group??config.timeframe_sync_group??''};
}
function timeframeGroup(host){return host._config?.sync_timeframe===true?((host._config.hover_sync_group??host._config.timeframe_sync_group)?.trim()||'default'):null;}
function timeframeGroups(){
 const root=globalThis.window??globalThis,key=Symbol.for('eleven-cards.timeframe-sync.v1');
 return root[key]??=new Map();
}
function applyTimeframe(host,selection){
 // Default is a group-wide reset to each card's own configured range (or
 // native price window), rather than a copy of the sender's hours.
 if(selection.mode==='configured'&&selection.offset===0){resetGraphPeriod(host);return;}
 host._sharedTimeframe=selection;
 Object.assign(host,{_periodMode:selection.mode,_periodHours:selection.hours,_periodEnd:selection.end,_periodOffset:selection.offset,_periodAnchor:selection.anchor});
}
function disconnectTimeframeSync(host){
 host._disconnectTimeframeSync?.();host._disconnectTimeframeSync=null;
}
function connectTimeframeSync(host){
 disconnectTimeframeSync(host);
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const groups=timeframeGroups();let entry=groups.get(group);
 if(!entry){entry={selection:null,listeners:new Set()};groups.set(group,entry);}
 const receive=(selection,source)=>{
  if(source===host||host._sharedTimeframe===selection)return;
  applyTimeframe(host,selection);host._reloadPeriod();
 };
 entry.listeners.add(receive);
 host._disconnectTimeframeSync=()=>entry.listeners.delete(receive);
 // Joining never publishes this card's default over an existing selection.
 if(entry.selection)applyTimeframe(host,entry.selection);
}
function publishTimeframe(host){
 const group=timeframeGroup(host);if(group===null||!host._connected)return;
 const entry=timeframeGroups().get(group);if(!entry)return;
 const selection={group,mode:host._periodMode,hours:host._periodHours??host._config.hours_to_show,
  end:host._periodEnd,offset:host._periodOffset,anchor:host._periodAnchor,zone:host._hass?.config?.time_zone||'UTC',at:Date.now()};
 selection.range=localGraphPeriodRange(host,selection.at);
 entry.selection=selection;applyTimeframe(host,selection);
 for(const receive of entry.listeners)receive(selection,host);
}
function resetGraphPeriod(host){host._sharedTimeframe=null;host._periodMode='configured';host._periodHours=null;host._periodEnd=null;host._periodOffset=0;host._periodAnchor=null;host._periodMenuOpen=false;host._periodMenuPending=false;host._periodCustomDraft=null;host._periodTab=null;host._insightPending=null;}
function graphPeriodRange(host,now=Date.now()){
 const shared=host._sharedTimeframe;
 if(shared&&timeframeGroup(host)===shared.group){
  // One clock and timezone for the whole group, including separate bundles.
  // Live selections advance together on the minute; historical ranges stay fixed.
  if(shared.offset===0&&shared.end==null&&(Math.floor(now/60000)!==Math.floor(shared.at/60000))){
   shared.at=now;shared.range=localGraphPeriodRange({_periodMode:shared.mode,_periodHours:shared.hours,_periodOffset:0,_hass:{config:{time_zone:shared.zone}}},now);
  }
  return {...shared.range};
 }
 return localGraphPeriodRange(host,now);
}
function localGraphPeriodRange(host,now){
 const mode=host._periodMode,offset=host._periodOffset??0;
 if(periodCalendarModes.includes(mode)){
  const zone=host._hass?.config?.time_zone||'UTC',p=periodLocalParts(host._periodAnchor??now,zone);
  let nominal,finishNominal;
  if(mode==='week'){
   nominal=Date.UTC(p.year,p.month-1,p.day);nominal+=(offset*7-(new Date(nominal).getUTCDay()+6)%7)*86400000;finishNominal=nominal+7*86400000;
  }else if(mode==='month'||mode==='quarter'){
   const size=mode==='quarter'?3:1,month=(mode==='quarter'?Math.floor((p.month-1)/3)*3:p.month-1)+offset*size;
   nominal=Date.UTC(p.year,month,1);finishNominal=Date.UTC(p.year,month+size,1);
  }else if(mode==='year'){nominal=Date.UTC(p.year+offset,0,1);finishNominal=Date.UTC(p.year+offset+1,0,1);}
  else{nominal=Date.UTC(p.year,p.month-1,p.day+offset);finishNominal=nominal+86400000;}
  const start=periodMidnight(nominal,zone),finish=periodMidnight(finishNominal,zone);
  return {start,end:Math.max(start+1,Math.min(now,finish))};
 }
 const end=host._periodEnd??now;
 return {start:end-(host._periodHours??host._config.hours_to_show)*3600000,end};
}
function chooseGraphPeriod(host,value){
 const calendar=value==='configured'||periodCalendarModes.includes(value),hours=periodPresetHours[value]??Number(value);
 if(!calendar&&(!Number.isFinite(hours)||hours<1||hours>8760))return;
 resetGraphPeriod(host);
 host._periodMode=calendar?value:Object.entries(periodPresetHours).find(([,h])=>h===hours)?.[0]??String(value);
 if(!calendar)host._periodHours=hours;
 publishTimeframe(host);
 return host._reloadPeriod();
}
function moveGraphPeriod(host,direction){
 if(![-1,0,1].includes(direction))return;
 if(host._periodMode==='custom'){
  if(direction===0){host._periodEnd=null;host._periodOffset=0;}
  else{const end=(host._periodEnd??Date.now())+direction*host._periodHours*3600000;host._periodEnd=direction>0?Math.min(Date.now(),end):end;host._periodOffset=(host._periodOffset??0)+direction;}
  host._periodCustomDraft=null;host._periodTab=null;host._sharedTimeframe=null;publishTimeframe(host);return host._reloadPeriod();
 }
 if(direction===0){host._periodOffset=0;host._periodEnd=null;host._periodAnchor=null;}
 else{
  const previous=host._periodOffset??0;
  const calendar=periodCalendarModes.includes(host._periodMode);
  if(previous===0)host._periodAnchor=calendar?Date.now():host._status==='ready'?(host._end??Date.now()):Date.now();
  host._periodOffset=Math.min(0,previous+direction);
  if(host._periodOffset===0)host._periodAnchor=null;
  if(!calendar){
   host._periodEnd=host._periodOffset===0?null:host._periodAnchor+host._periodOffset*(host._periodHours??host._config.hours_to_show)*3600000;
  }
 }
 host._sharedTimeframe=null;
 publishTimeframe(host);
 return host._reloadPeriod();
}

const periodEscape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function compactPeriodName({start,end,mode,past,zoomed,hours,name,locale,zone}){
 const format=options=>new Intl.DateTimeFormat(locale,{timeZone:zone,...options});
 const dates=format({year:'numeric',month:'numeric',day:'numeric'});
 const parts=t=>Object.fromEntries(dates.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 const a=parts(start),b=parts(end),currentYear=parts(Date.now()).year;
 const dayMonth=format({day:'numeric',month:'short'}),dayYear=format({day:'numeric',month:'short',year:'numeric'});
 const sameDay=a.year===b.year&&a.month===b.month&&a.day===b.day;
 const dateRange=(from,to)=>{
  const first=parts(from),last=parts(to),year=first.year!==currentYear?` ${first.year}`:'';
  if(first.year!==last.year)return `${dayYear.format(from)}–${dayYear.format(to)}`;
  if(first.month===last.month)return `${first.day===last.day?'':`${first.day}–`}${dayMonth.format(to)}${year}`;
  return `${dayMonth.format(from)}–${dayMonth.format(to)}${year}`;
 };
 if(mode==='custom'||zoomed||(past&&!['today','week','month','quarter','year'].includes(mode)&&hours<24)){
  const time=format({hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  if(sameDay){
   const offsets=format({timeZoneName:'shortOffset'}),offset=t=>offsets.formatToParts(t).find(p=>p.type==='timeZoneName')?.value;
   const clock=offset(start)!==offset(end)?format({hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'}):time;
   return `${(a.year===currentYear?dayMonth:dayYear).format(start)} · ${clock.format(start)}–${clock.format(end)}`;
  }
  if(end-start<48*3600000)return `${(a.year===b.year&&a.year===currentYear?dayMonth:dayYear).format(start)} ${time.format(start)}–${(a.year===b.year&&a.year===currentYear?dayMonth:dayYear).format(end)} ${time.format(end)}`;
  return dateRange(start,end);
 }
 if(mode==='month'){const month=format({month:'long',year:'numeric'}).format(start);return month[0].toLocaleUpperCase(locale)+month.slice(1);}
 if(mode==='quarter')return `Q${Math.ceil(a.month/3)} ${a.year}`;
 if(mode==='year')return String(a.year);
 if(mode==='week')return dateRange(start,Math.max(start,end-1));
 if(mode==='today')return past?dateRange(start,Math.max(start,end-1)):name;
 if(past)return `${dateRange(start,end)} · ${hours>=168&&hours%24===0?`${hours/24} ${locale==='nl-NL'?'dagen':'days'}`:`${hours} ${locale==='nl-NL'?'uur':hours===1?'hour':'hours'}`}`;
 return name;
}
function periodControls(host,language='en'){
 const active=host.shadowRoot.activeElement;
 if(!host._periodMenuPending)host._periodFocus=null;
 if(active?.closest?.('.header-actions'))host._periodFocus=active.dataset.periodTab!=null?`tab:${active.dataset.periodTab}`:active.dataset.customField!=null?`custom:${active.dataset.customField}`:active.dataset.periodOption!=null?`option:${active.dataset.periodOption}`:active.dataset.zoom!=null?`zoom:${active.dataset.zoom}`:active.classList.contains('history-link')?'history':active.dataset.period;
 if(host._config.show_navigation===false){host._periodMenuOpen=false;host._periodMenuPending=false;return {};}
 const previousMenu=host.shadowRoot.querySelector('.period-menu');
 if(previousMenu){
  if(!host._periodMenuPending)host._periodMenuScroll=previousMenu.scrollTop;
  host._periodMenuOpen=!!host._periodMenuPending||(typeof previousMenu.showPopover==='function'?previousMenu.matches(':popover-open'):previousMenu.hasAttribute('data-fallback-open'));
 }
 const nl=language.startsWith('nl'),label=(en,nlText)=>nl?nlText:en,mode=host._periodMode??'configured',past=(host._periodOffset??0)<0;
 const standard=label(`Default (${host._config.hours_to_show} hours)`,`Standaard (${host._config.hours_to_show} uur)`);
 const rolling=[['1h',1],['6h',6],['12h',12],['24h',24],['48h',48],['7d',168],['14d',336],['30d',720],['90d',2160],['365d',8760]].map(([id,hours])=>[id,hours<168?label(`${hours} ${hours===1?'hour':'hours'}`,`${hours} uur`):label(`${hours/24} days`,`${hours/24} dagen`),hours<168?`${hours} ${nl?'u':'h'}`:`${hours/24} d`]);
 const calendar=[['today',label('Today','Vandaag'),label('Day','Dag')],['week',label('This week','Deze week'),label('Week','Week')],['month',label('This month','Deze maand'),label('Month','Maand')],['quarter',label('This quarter','Dit kwartaal'),label('Quarter','Kwartaal')],['year',label('This year','Dit jaar'),label('Year','Jaar')]];
 const calendarChoice=calendar.find(([id])=>id===mode);
 if(!calendarChoice&&mode!=='configured'&&mode!=='custom'&&host._periodHours!=null&&!rolling.some(([id])=>id===mode))rolling.push([mode,label(`${host._periodHours} hours`,`${host._periodHours} uur`)]);
 const selectedStandard=label(`Default (${host._periodHours??host._config.hours_to_show} hours)`,`Standaard (${host._periodHours??host._config.hours_to_show} uur)`);
 const name=mode==='configured'?selectedStandard:calendarChoice?.[past?2:1]??rolling.find(([id])=>id===mode)?.[1]??standard;
 const tabIds=['rolling','calendar','custom'];
 const selectedTab=host._periodMenuOpen&&tabIds.includes(host._periodTab)?host._periodTab:mode==='custom'?'custom':calendarChoice?'calendar':'rolling';
 host._periodTab=selectedTab;
 const choice=([value,text,compact])=>uiButton({variant:'surface',content:`<span>${periodEscape(compact??text)}</span><span aria-hidden="true">${value===mode?'✓':''}</span>`,attrs:{role:'menuitemradio','aria-checked':value===mode,tabindex:-1,'aria-label':text,title:text,'data-period-option':value}});

 const {start,end}=host._status==='ready'&&Number.isFinite(host._viewStart)&&Number.isFinite(host._viewEnd)?{start:host._viewStart,end:host._viewEnd}:graphPeriodRange(host);
 const locale=nl?'nl-NL':'en-GB',zone=host._hass?.config?.time_zone||'UTC';
 const zoomed=host._status==='ready'&&(start>host._start+1||end<host._end-1);
 const compactName=compactPeriodName({start,end,mode,past,zoomed,hours:host._periodHours??host._config.hours_to_show,name,locale,zone});
 const format=new Intl.DateTimeFormat(locale,{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
 const range=`${format.format(start)} – ${format.format(end)}`;
 const customRange=graphPeriodRange(host),draft=host._periodCustomDraft??{start:periodDateTime(customRange.start,zone),end:periodDateTime(customRange.end,zone)};
 const canGoNext=mode==='custom'?host._periodEnd!=null&&customRange.end<Date.now():past;
 const custom=`<form data-custom-range><div class="period-custom-fields">${[['start',label('Start','Begin')],['end',label('End','Einde')]].map(([key,text])=>`<label>${text}<input type="datetime-local" name="${key}" data-custom-field="${key}" value="${periodEscape(draft[key])}" step="60" required></label>`).join('')}</div><p class="period-custom-zone">${periodEscape(zone)}</p><p class="period-custom-error" role="alert"${draft.error?'':' hidden'}>${periodEscape(draft.error??'')}</p>${uiButton({variant:'surface',type:'submit',text:label('Apply','Toepassen'),attrs:{'data-custom-field':'apply'}})}</form>`;
 const contents=uiTabs({id:'eleven-period',label:label('Period type','Soort tijdvak'),selected:selectedTab,className:'period-tabs',panelClassName:'period-panel',items:[
  {value:'rolling',label:label('Last','Afgelopen'),content:`<div class="period-options" role="menu" aria-label="${label('Last','Afgelopen')}">${rolling.map(choice).join('')}</div>`},
  {value:'calendar',label:label('Calendar','Kalender'),content:`<div class="period-options period-calendar" role="menu" aria-label="${label('Calendar','Kalender')}">${calendar.map(([id,text])=>choice([id,text])).join('')}</div>`},
  {value:'custom',label:label('Custom range','Eigen bereik'),content:custom,className:'period-custom'}
 ].map(item=>({...item,tabAttrs:{'data-period-tab':item.value},panelAttrs:{'data-period-panel':item.value}}))});
 const popup=uiPopup({id:'eleven-period-menu',className:'period-menu',title:label('Timeframe','Tijdvak'),label:label('Choose a period','Kies een periode'),closeLabel:label('Close','Sluiten'),closeAttrs:{'data-period':'close'},content:`<div class="period-current-range">${periodEscape(range)}${zoomed?`<span class="zoom-status">${label('Zoomed in','Ingezoomd')}</span>`:''}</div><div class="period-default" role="menu" aria-label="${label('Default','Standaard')}">${choice(['configured',standard])}</div>${contents}`});
 const trigger=uiButton({className:'period-trigger',content:`<span>${periodEscape(compactName)}</span>${cardHeaderIcon('down')}`,attrs:{'data-period':'menu','aria-haspopup':'dialog','aria-controls':'eleven-period-menu','aria-expanded':host._periodMenuOpen===true,title:range,'aria-label':label('Timeframe','Tijdvak')+': '+compactName,'aria-description':range+(zoomed?'. '+label('Zoomed in','Ingezoomd'):'')}});
 const navigation=[['previous',label('Previous period','Vorige periode')],['now',label('Return to the current period','Terug naar de huidige periode')],['next',label('Next period','Volgende periode')]].map(([key,title])=>uiButton({text:key==='now'?label('Now','Nu'):'',content:key==='now'?undefined:cardHeaderIcon(key),disabled:key==='next'&&!canGoNext,title,label:title,attrs:{'data-period':key}})).join('');
 return {picker:`<div class="period-controls">${trigger}${popup}</div>`,navigation};

}
function restorePeriodFocus(host,items=[]){
 const key=host._periodFocus;if(!key)return;const root=host.shadowRoot;
 const target=key.startsWith('tab:')?root.querySelector(host._periodMenuOpen?'[data-period-tab="'+key.slice(4)+'"]':'[data-period="menu"]'):key.startsWith('custom:')&&host._periodMenuOpen?root.querySelector('[data-custom-field="'+key.slice(7)+'"]'):key==='history'?root.querySelector('.history-link'):key.startsWith('zoom:')?root.querySelector('[data-zoom="'+key.slice(5)+'"]'):key.startsWith('option:')&&host._periodMenuOpen?items.find(item=>item.dataset.periodOption===key.slice(7)):root.querySelector('[data-period="'+(key.startsWith('option:')?'menu':key)+'"]');
 (target?.disabled?root.querySelector('[data-period="now"], [data-zoom="in"]:not(:disabled), .history-link'):target)?.focus?.({preventScroll:true});host._periodFocus=null;
}
function disconnectPeriodControls(host,preserveState=false){host._periodMenuCleanup?.();host._periodMenuCleanup=null;if(!preserveState)host._periodMenuPending=false;}
function bindPeriodControls(host){
 disconnectPeriodControls(host,true);
 const root=host.shadowRoot,nav=root.querySelector('.period-controls');if(!nav){restorePeriodFocus(host);return;}
 const menu=nav.querySelector('.period-menu'),trigger=nav.querySelector('[data-period="menu"]'),items=[...menu.querySelectorAll('[data-period-option]')];
 const nl=(host._hass?.language??'en').startsWith('nl'),label=(en,nlText)=>nl?nlText:en;
 const form=menu.querySelector('form[data-custom-range]'),tabs=[...menu.querySelectorAll('[data-period-tab]')],panels=[...menu.querySelectorAll('[data-period-panel]')];
 const visibleItems=()=>items.filter(item=>!item.closest?.('[data-period-panel]')?.hidden);
 const updateOptionFocus=()=>{
  const visible=visibleItems();for(const item of items)item.tabIndex=-1;
  const standard=visible.find(item=>item.dataset.periodOption==='configured');if(standard)standard.tabIndex=0;
  const options=visible.filter(item=>item!==standard),selected=options.find(item=>item.getAttribute('aria-checked')==='true')??options[0];if(selected)selected.tabIndex=0;
 };
 updateOptionFocus();
 const cleanups=[];
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 host._periodMenuCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 let scrollPending=false;
 const controller=bindUIPopup({trigger,popup:menu,container:nav,ready:root.querySelector('ha-card')?.updateComplete,
  isRequested:()=>host._periodMenuOpen,isCurrent:()=>root.querySelector('.period-menu')===menu,
  beforeOpen:()=>closeOtherCardPopups(host,'period'),
  onOpen:focus=>{host._periodMenuOpen=true;host._periodMenuPending=true;scrollPending=!focus;},
  onClose:()=>{host._periodMenuOpen=false;host._periodMenuPending=false;},
  onToggle:open=>{host._periodMenuOpen=open;},
  focusTarget:()=>visibleItems().find(item=>item.getAttribute('aria-checked')==='true')??tabs.find(tab=>tab.getAttribute('aria-selected')==='true')??items[0],
  onShown:()=>{host._periodMenuPending=false;restorePeriodFocus(host,items);if(scrollPending){menu.scrollTop=host._periodMenuScroll??0;scrollPending=false;}}
 });
 const {open,close,position}=controller;cleanups.push(()=>controller.disconnect());
 trigger.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();if(e.key==='ArrowUp')visibleItems().at(-1)?.focus({preventScroll:true});}};
 for(const item of items)item.onclick=()=>{close(true);chooseGraphPeriod(host,item.dataset.periodOption);};
 const tabController=bindUITabs({tabs,panels,onSelect:value=>{
  host._periodTab=value;updateOptionFocus();host._periodMenuScroll=0;menu.scrollTop=0;position();
 }});cleanups.push(()=>tabController.disconnect());
 if(form?.tagName==='FORM'){
  const fields=Object.fromEntries(['start','end'].map(key=>[key,form.elements.namedItem(key)]));
  const readDraft=()=>host._periodCustomDraft={start:fields.start.value,end:fields.end.value};
  listen(form,'input',()=>{readDraft();const error=form.querySelector('.period-custom-error');error.hidden=true;error.textContent='';});
  listen(form,'submit',e=>{
   e.preventDefault();const draft=readDraft(),zone=host._hass?.config?.time_zone||'UTC',previous=graphPeriodRange(host);
   const start=parsePeriodDateTime(draft.start,zone,'start',previous.start),end=parsePeriodDateTime(draft.end,zone,'end',previous.end);
   let message;
   if(!Number.isFinite(start)||!Number.isFinite(end))message=label('Choose valid dates and times in the displayed timezone.','Kies geldige datums en tijden in de getoonde tijdzone.');
   else if(end<=start)message=label('End must be after start.','Einde moet na begin liggen.');
   else if(end-start>366*86400000)message=label('Choose a range of at most 366 days.','Kies een bereik van maximaal 366 dagen.');
   if(message){draft.error=message;const error=form.querySelector('.period-custom-error');error.textContent=message;error.hidden=false;position();return;}
   close(true);chooseCustomGraphPeriod(host,start,end);
  });
 }
 menu.onkeydown=e=>{
  if(e.target?.closest?.('.period-custom, .period-tabs'))return;
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   const visible=visibleItems();if(!visible.length)return;e.preventDefault();const index=visible.indexOf(host.shadowRoot.activeElement),next=e.key==='Home'?0:e.key==='End'?visible.length-1:index<0?(e.key==='ArrowUp'?visible.length-1:0):(index+(e.key==='ArrowDown'?1:-1)+visible.length)%visible.length;
   visible[next].focus();
  }
 };
 for(const [key,direction]of [['previous',-1],['next',1],['now',0]])root.querySelector(`[data-period="${key}"]`).onclick=()=>{close();moveGraphPeriod(host,direction);};
 if(host._periodMenuOpen)open(false);
 if(!host._periodMenuPending)restorePeriodFocus(host,items);
}
function periodControlsStyles(){return uiTabsStyles()+`
.period-controls{display:flex;min-width:0;max-width:100%;flex:0 1 auto}
.header-actions .period-trigger{width:auto;min-width:0;max-width:100%;flex:0 1 auto;gap:6px;padding:4px 10px;border:0;border-radius:4px;background:transparent;font-weight:400}
.header-actions .period-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-trigger span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.period-current-range{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;margin:2px 0 10px}
.period-current-range .zoom-status{display:table;margin-top:4px}
.period-tabs{margin:10px 0 0}
.period-panel{padding-top:12px}
.period-options{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-bottom:4px}
.period-options button{position:relative;justify-content:center;padding:7px 3px;gap:0;min-width:0;white-space:nowrap}
.period-options button>span:last-child{position:absolute;inset-inline-end:2px;top:1px;font-size:9px;line-height:1}
.period-calendar{grid-template-columns:repeat(3,minmax(0,1fr))}
.period-custom-fields{display:grid;gap:10px}
.period-custom-fields label{display:grid;gap:4px;font-size:12px}
.period-custom input{box-sizing:border-box;width:100%;min-width:0;padding:8px;border:1px solid var(--divider-color,#ddd);border-radius:5px;font:inherit;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));color-scheme:inherit}
.period-custom input:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-1px}
.period-custom p{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);margin:8px 0;overflow-wrap:anywhere}
.period-custom .period-custom-error{color:var(--error-color,#db4437)}
.period-custom button[type="submit"]{justify-content:center;margin-top:10px}
`;}

const insightEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function chartZoomState(host){
 const total=host._end-host._start,ready=host._status==='ready'&&Number.isFinite(total)&&total>0;
 const a=Math.max(host._start,host._viewport?.[0]??host._start),b=Math.min(host._end,host._viewport?.[1]??host._end),width=Math.max(0,b-a);
 const zoomed=ready&&(a>host._start+1||b<host._end-1);
 return {zoomed,in:ready&&width>Math.min(60000,total)+1,out:ready&&width<total-1,reset:zoomed};
}
function chartEntityItems(host){return host._config.entities.map(id=>({id,name:host._config.series_options?.find(row=>row.entity===id)?.name||host._hass?.states?.[id]?.attributes?.friendly_name||id}));}
function chartSeriesVisible(host,index){return host._visibility?.get(host._config.entities[index])??true;}
function isolateChartSeries(host,id){
 if(!host._config.entities.includes(id))return;
 host._visibility=new Map(host._config.entities.map(entity=>[entity,entity===id]));host._hideTooltip?.();host._render();
}
function showAllChartSeries(host){host._visibility=new Map(host._config.entities.map(id=>[id,true]));host._hideTooltip?.();host._render();}
function toggleChartIsolation(host,id){
 if(!host._config.entities.includes(id))return;
 cancelUILegendClicks(host);
 const only=host._config.entities.every((entity,i)=>host._isSeriesVisible(i)===(entity===id));
 only?showAllChartSeries(host):isolateChartSeries(host,id);
 focusUILegend(host,id,'[data-series]',button=>button.dataset.series);
}
function bindChartLegend(host){
 const nl=host._insightLanguage==='nl',hint=nl?'Dubbelklik of Shift+Enter: alleen deze sensor. Herhaal om alles te tonen.':'Double-click or Shift+Enter: show only this sensor. Repeat to show all.';
 bindUILegend(host,{selector:'[data-series]',getId:button=>button.dataset.series,hint,toggle:host._toggleSeries?id=>host._toggleSeries(id):null,isolate:id=>toggleChartIsolation(host,id)});
}
function insightControl(host,key,label,body,icon=''){
 const trigger=uiButton({className:'insight-trigger',content:icon+(key==='data'?'':`<span>${insightEscape(label)}</span>`),attrs:{'data-insight':key,title:label,'aria-label':label,'aria-haspopup':'dialog','aria-expanded':host._insightOpen===key,'aria-controls':'insight-'+key}});
 return `<div class="insight-control">${trigger}${uiPopup({id:'insight-'+key,className:'insight-popup',attrs:{'data-insight-panel':key},title:label,closeLabel:host._insightLanguage==='nl'?'Sluiten':'Close',closeAttrs:{'data-insight-close':''},content:body})}</div>`;
}
// Work on unstacked, undecimated values. A history value holds until the next
// point (null breaks coverage); bars have equal weight, regardless of bin length.
function chartValueStatistics(points,start,end,interval){
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
function chartDataInformation(host,language='en'){
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
   const color=host._insightColor?.(i,row)??'var(--primary-color,#2196f3)';
   return `<section class="insight-sensor" data-information-entity="${insightEscape(item.id)}"><div class="insight-sensor-heading"><i class="insight-color" style="--insight-color:${insightEscape(color)}" aria-hidden="true"></i><strong>${insightEscape(item.name)}</strong><span class="insight-source">${sourceLabel}${unit?` <span class="insight-unit">· ${insightEscape(unit)}</span>`:''}</span></div>${metrics}${states.length?`<div class="insight-states" role="status">${states.join(' · ')}</div>`:''}</section>`;
  }).join('')}</div>`;
 }
 return insightControl(host,'data',nl?'Gegevens':'Data information',body,cardHeaderIcon('info'));
}
function captureChartInsights(host){
 const active=host.shadowRoot.activeElement;
 if(!host._insightPending)host._insightFocus=null;
 if(active?.closest?.('.insight-control'))host._insightFocus={key:active.closest('.insight-control').querySelector('[data-insight]')?.dataset.insight,inside:!!active.closest('.insight-popup'),entity:active.dataset.isolate,all:active.hasAttribute('data-show-all')};
 const popup=[...(host.shadowRoot.querySelectorAll?.('.insight-popup')??[])].find(panel=>typeof panel.showPopover==='function'?panel.matches(':popover-open'):panel.hasAttribute('data-fallback-open'));
 host._insightOpen=popup?.dataset.insightPanel??host._insightPending??null;
}
function disconnectChartInsights(host,keepLegendClicks=false){if(!keepLegendClicks){cancelUILegendClicks(host);host._insightPending=null;}host._insightCleanup?.();host._insightCleanup=null;}
function restoreChartInsightFocus(host){
 if(!host._insightFocus||host._insightPending)return;
 const root=host.shadowRoot,{key,inside,entity,all}=host._insightFocus,popup=root.querySelector(`[data-insight-panel="${key}"]`),target=inside&&host._insightOpen===key?popup?.querySelector(entity?`[data-isolate="${entity}"]`:all?'[data-show-all]':'[data-insight-close]'):root.querySelector(`[data-insight="${key}"]`);
 if(target){target.focus?.({preventScroll:true});host._insightFocus=null;}
}
function bindChartInsights(host){
 disconnectChartInsights(host,true);
 const root=host.shadowRoot,cleanups=[];host._insightCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 for(const control of root.querySelectorAll?.('.insight-control')??[]){
  const trigger=control.querySelector('[data-insight]'),popup=control.querySelector('.insight-popup'),key=trigger.dataset.insight;
  const controller=bindUIPopup({trigger,popup,container:control,ready:root.querySelector('ha-card')?.updateComplete,
   isRequested:()=>host._insightOpen===key,isCurrent:()=>root.querySelector(`[data-insight-panel="${key}"]`)===popup,
   beforeOpen:()=>closeOtherCardPopups(host,'insight'),
   onOpen:()=>{host._insightOpen=key;host._insightPending=key;},
   onClose:()=>{if(host._insightOpen===key)host._insightOpen=null;host._insightPending=null;},
   onToggle:open=>{if(!open&&host._insightOpen===key)host._insightOpen=null;},
   onShown:()=>{host._insightPending=null;restoreChartInsightFocus(host);},closeWhenAnchorHidden:true
  });
  const {open,close}=controller;cleanups.push(()=>controller.disconnect());
  for(const button of popup.querySelectorAll('[data-isolate]'))button.onclick=()=>{close(true);isolateChartSeries(host,button.dataset.isolate);};
  const all=popup.querySelector('[data-show-all]');if(all)all.onclick=()=>{close(true);showAllChartSeries(host);};
  if(host._insightOpen===key)open(false);
 }
 restoreChartInsightFocus(host);
 if(host._insightFocus)listen(document,'pointerdown',e=>{if(!e.composedPath().includes(host)){host._insightFocus=null;host._insightOpen=null;host._insightPending=null;}},true);
 bindChartLegend(host);
}
function chartInsightStyles(){return `
.chart-context{display:flex;align-items:center;justify-content:space-between;gap:6px 12px;flex-wrap:wrap;flex:none;margin:0 0 8px;min-width:0}
.chart-range{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;min-width:0;flex:1}
.chart-range .period-panel{margin:0}
.zoom-status{font-size:11px;color:var(--primary-text-color,#20252b);background:var(--secondary-background-color,#eee);border-radius:4px;padding:2px 6px;white-space:nowrap}
.insight-control{display:inline-flex;flex:none}
.insight-trigger svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.header-actions .insight-trigger{width:32px;height:32px;padding:0;background:transparent;border-radius:4px}
.header-actions .insight-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.header-actions .insight-trigger svg{width:18px;height:18px;stroke-width:2}
.insight-popup{z-index:21}
.insight-popup p{margin:8px 0 12px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}
.insight-popup p strong{color:var(--primary-text-color,#20252b);font-weight:500}
.insight-popup .insight-choice{display:block;width:100%;padding:6px 8px;text-align:start;overflow-wrap:anywhere}
.insight-choice[aria-pressed="true"]{background:var(--secondary-background-color,#eee);font-weight:600}
.insight-sensors{display:grid}
.insight-sensor{min-width:0;padding:8px 0}
.insight-sensor+.insight-sensor{border-top:1px solid var(--divider-color,#ddd)}
.insight-sensor-heading{display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px}
.insight-color{display:block;width:7px;height:7px;flex:none;border-radius:2px;background:var(--insight-color,var(--primary-color,#2196f3))}
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

// Sum elapsed time by the original state, keeping missing history separate
// even when it shares a display label with a recorded unknown state.
function timelineStateDurations(series,start,end){
 const totals=new Map();
 for(const s of series){
  const duration=Math.max(0,Math.min(end,s.end)-Math.max(start,s.start));
  if(!duration)continue;
  const key=s.missing?null:s.state;
  if(!totals.has(key))totals.set(key,{state:s.state,missing:!!s.missing,duration:0});
  totals.get(key).duration+=duration;
 }
 return [...totals.values()];
}
function segments(rows,start,end){
 const points=rows.map((r,i)=>({t:Date.parse(r.last_changed??r.last_updated),state:String(r.state??'unknown'),i})).filter(p=>Number.isFinite(p.t)&&p.t<=end).sort((a,b)=>a.t-b.t||a.i-b.i);
 let state='unknown',cursor=start;const result=[];
 for(const p of points){if(p.t<=start){state=p.state;continue;}if(p.state===state)continue;if(p.t>cursor)result.push({start:cursor,end:p.t,state});cursor=p.t;state=p.state;}
 if(cursor<end)result.push({start:cursor,end,state});return result;
}

const escapeTimeline=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TimelineView={
 _historyUrl(){const range=graphPeriodRange(this),ready=this._status==='ready';const end=this._viewport?.[1]??(ready?this._end:range.end)??range.end,start=this._viewport?.[0]??(ready?this._start:range.start)??range.start;return `/history?entity_id=${encodeURIComponent(this._config.entities.join(','))}&start_date=${encodeURIComponent(new Date(start).toISOString())}&end_date=${encodeURIComponent(new Date(end).toISOString())}`;},
 _setPeriod(hours){return chooseGraphPeriod(this,String(hours));},
 _navigate(direction){return moveGraphPeriod(this,direction);},
  _reloadPeriod(){this._generation++;this._inFlight=false;this._viewport=null;this._hideTooltip();clearTimeout(this._timer);this._status='loading';this._refreshFailures=0;this._render();return this._refresh();},
 _ticks(){const width=this.shadowRoot.host?.clientWidth??600,count=width<400?3:5;return Array.from({length:count},(_,i)=>i/(count-1));},
 _segmentAppearance(s,id){return s.missing?{label:this._nl()?'Geen geschiedenis':'No history',color:'transparent'}:this._appearance(s.state,id);},
 _insightColor(index){
  const id=this._config.entities[index],segments=this._series[index]??[];
  for(let i=segments.length-1;i>=0;i--){const segment=segments[i];if(!segment.missing&&segment.start<this._viewEnd&&segment.end>this._viewStart)return this._appearance(String(segment.state),id).color;}
  return 'var(--primary-color,#2196f3)';
 },
 _dataInformation(){
  const start=this._viewStart,end=this._viewEnd;
  return {start,end,rows:this._config.entities.map((id,i)=>{
   const durations=timelineStateDurations(this._series[i]??[],start,end).map(s=>({...s,label:this._segmentAppearance(s,id).label}));
   const known=durations.filter(s=>!s.missing);
   return {id,durations,count:known.length,missing:known.reduce((sum,s)=>sum+s.duration,0)<end-start-1,limited:!!this._stateLimits?.[i]};
  })};
 },
 _summary(index){const totals=new Map();for(const s of this._series[index]??[]){const ms=Math.max(0,Math.min(s.end,this._viewEnd)-Math.max(s.start,this._viewStart)),label=this._segmentAppearance(s,this._config.entities[index]).label;if(ms)totals.set(label,(totals.get(label)??0)+ms);}return [...totals].map(([label,ms])=>`${label}: ${this._duration(ms)}`).join(' · ');},
 _stateLimitMessage(){return this._nl()?'Maximaal 20 verschillende statussen per entiteit. Deze entiteit heeft er meer in de gekozen periode.':'Maximum 20 distinct states per entity. This entity has more in the selected period.';},
 _name(id){return this._config.series_options.find(x=>x.entity===id)?.name??this._hass?.states?.[id]?.attributes?.friendly_name??id;},
 _duration(ms){const minutes=Math.floor(ms/60000);return minutes<1?'<1 min':minutes<60?`${minutes} min`:`${Math.floor(minutes/60)}${this._nl()?'u':'h'} ${minutes%60} min`;},
 _zoom(factor){
  this._hideTooltip();if(!factor)this._viewport=null;
  else{const a=this._viewport?.[0]??this._start,b=this._viewport?.[1]??this._end,width=Math.min(this._end-this._start,Math.max(60000,(b-a)*factor)),center=(a+b)/2,start=Math.max(this._start,Math.min(this._end-width,center-width/2));this._viewport=[start,start+width];}
  this._render();
 },
 _receiveHover(t){if(t===null||!Number.isFinite(t)||t<this._viewStart||t>this._viewEnd){this._hideTooltip(false);return;}this._showTooltip(t,false);},
 _segmentAt(segments,t,end){let low=0,high=segments.length;while(low<high){const mid=(low+high)>>1;if(segments[mid].start<=t)low=mid+1;else high=mid;}const segment=segments[low-1];return segment&&(t<segment.end||(t===end&&segment.end===end))?segment:null;},
 _hideTooltip(publish=true){if(this._hoverFrame!=null)globalThis.cancelAnimationFrame?.(this._hoverFrame);this._hoverFrame=null;this._hoverTime=null;if(publish)SharedGraph.clearHover(this);this._pointerFocusPending=null;this._cursor=null;this._pinned=false;for(const cls of ['tooltip','guide']){const el=this.shadowRoot.querySelector('.'+cls);if(el)el.hidden=true;}},
 _showTooltip(t,publish=true){
  if(!SharedGraph.tooltipInView(this)){this._hideTooltip(publish);return;}
  const chart=this.shadowRoot.querySelector('.chart'),tooltip=chart?.querySelector('.tooltip'),guide=chart?.querySelector('.guide');if(!tooltip)return;
  this._cursor=t;const nl=this._nl(),a=this._viewStart,b=this._viewEnd,esc=escapeTimeline;
  tooltip.innerHTML=`<strong>${esc(this._time(t))}</strong>`+this._config.entities.map((id,i)=>{if(!this._isSeriesVisible(i)||this._stateLimits?.[i])return '';const s=this._segmentAt(this._series[i]??[],t,b),v=s?this._segmentAppearance(s,id):{label:nl?'Geen geschiedenis':'No history',color:'transparent'};return `<span><i style="background:${v.color}"></i><b class="tooltip-label">${esc(this._name(id))}: <em class="tooltip-value">${esc(v.label)}</em></b>${s?`<small>${esc(this._time(s.start))} – ${esc(this._time(s.end))} · ${esc(this._duration(s.end-s.start))}</small>`:''}</span>`;}).join('');
  tooltip.hidden=false;tooltip.style.pointerEvents=this._pinned?'auto':'none';const box=chart.getBoundingClientRect(),px=(t-a)/(b-a)*box.width;
  if(guide){guide.hidden=false;guide.style.left=`${px}px`;}
  tooltip.style.maxHeight=`${Math.min(360,(window.innerHeight??480)-16)}px`;
  const measured=tooltip.getBoundingClientRect();let left=px+14;if(left+measured.width>box.width-4)left=px-measured.width-14;tooltip.style.left=`${Math.max(4,Math.min(box.width-measured.width-4,left))}px`;tooltip.style.top=`${Math.max(8-box.top,Math.min(0,(window.innerHeight??480)-box.top-measured.height-8))}px`;
  if(publish)SharedGraph.publishHover(this,t);
 },
 _bindInteractions(){
  const chart=this.shadowRoot.querySelector('.chart');if(!chart)return;
  const timestamp=e=>{const r=chart.getBoundingClientRect();return this._viewStart+Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*(this._viewEnd-this._viewStart);};
  let drag=null;const selection=chart.querySelector('.zoom-selection');
  chart.onpointermove=e=>{if(drag&&Math.abs(e.clientX-drag.x)>=6){this._hideTooltip();const r=chart.getBoundingClientRect(),x=Math.max(r.left,Math.min(r.right,e.clientX));selection.hidden=false;selection.style.left=`${(Math.min(drag.x,x)-r.left)/r.width*100}%`;selection.style.width=`${Math.abs(x-drag.x)/r.width*100}%`;}else if(!this._pinned&&e.pointerType!=='touch'){this._hoverTime=timestamp(e);if(this._hoverFrame==null){if(typeof requestAnimationFrame==='function')this._hoverFrame=requestAnimationFrame(()=>{this._hoverFrame=null;if(this.shadowRoot.querySelector('.chart')===chart&&!this._pinned&&this._hoverTime!=null)this._showTooltip(this._hoverTime);});else this._showTooltip(this._hoverTime);}}};
  chart.onpointerdown=e=>{if(e.target?.closest?.('[data-series],.tooltip')||(e.button??0)!==0)return;this._pointerFocusPending=e.target?.closest?.('.segment')??null;this._pinned=true;this._showTooltip(timestamp(e));if(e.pointerType==='mouse'){drag={x:e.clientX,t:timestamp(e)};chart.setPointerCapture?.(e.pointerId);}};
  chart.onpointerup=e=>{selection.hidden=true;if(drag){const d=drag;drag=null;if(Math.abs(e.clientX-d.x)>=6){const t=timestamp(e),a=Math.min(d.t,t),b=Math.max(d.t,t);if(b-a>=60000){this._hideTooltip();this._viewport=[a,b];this._render();}}}};
  chart.onpointercancel=()=>{drag=null;selection.hidden=true;this._hideTooltip();};chart.onlostpointercapture=()=>{drag=null;selection.hidden=true;};chart.onpointerleave=()=>{if(!this._pinned&&!drag)this._hideTooltip();};
  chart.onkeydown=e=>{this._pointerFocusPending=null;if(e.key==='Escape'){drag=null;selection.hidden=true;this._hideTooltip();return;}if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const times=[...new Set([this._viewStart,...this._series.flatMap((s,i)=>this._isSeriesVisible(i)?s.map(v=>v.start):[]).filter(t=>t>this._viewStart&&t<this._viewEnd),this._viewEnd])].sort((a,b)=>a-b);let i=times.findIndex(t=>t>=(this._cursor??this._viewStart));if(i<0)i=times.length-1;i=e.key==='Home'?0:e.key==='End'?times.length-1:Math.max(0,Math.min(times.length-1,i+(e.key==='ArrowRight'?1:-1)));this._pinned=true;this._showTooltip(times[i]);};
  chart.onfocusout=e=>{if(!chart.contains(e.relatedTarget))this._hideTooltip();};this.shadowRoot.querySelectorAll('.segment').forEach(button=>{button.onfocus=()=>{const fromPointer=this._pointerFocusPending===button;this._pointerFocusPending=null;if(fromPointer&&this._cursor!=null)return;this._pinned=true;this._showTooltip(Number(button.dataset.time));};});
 },
 _render(){
  if(!this._config)return;if(this._hoverFrame!=null){cancelAnimationFrame(this._hoverFrame);this._hoverFrame=null;}captureChartInsights(this);const c=this._config,nl=this._nl(),esc=escapeTimeline;this._viewStart=this._viewport?.[0]??this._start;this._viewEnd=this._viewport?.[1]??this._end;const a=this._viewStart,b=this._viewEnd;let body='';const controls=cardHeader({title:c.title??(nl?'Statustijdlijn':'Status timeline'),showTitle:c.show_title!==false,ready:this._status==='ready',historyUrl:this._historyUrl(),language:nl?'nl':'en',periods:periodControls(this,nl?'nl':'en'),zoomState:chartZoomState(this),information:chartDataInformation(this,nl?'nl':'en')});
  if(this._status!=='ready')body=`<div class="message" role="status">${this._status==='error'?(nl?'Geschiedenis kon niet worden geladen.':'Unable to load history.'):(nl?'Geschiedenis laden…':'Loading history…')}${this._status==='error'?`<button class="retry">${nl?'Opnieuw proberen':'Retry'}</button>`:''}</div>`;
  else{

   const legend=new Map(),rows=c.entities.map((id,i)=>{if(!this._isSeriesVisible(i))return '';const name=this._name(id),label=`<button type="button" class="row-label" data-series="${esc(id)}">${esc(name)}</button>`;if(this._stateLimits?.[i])return `<div class="row">${label}<div class="state-limit" role="status">${esc(this._stateLimitMessage())}</div></div>`;const bars=(this._series[i]??[]).filter(s=>s.end>a&&s.start<b).map(s=>{const v=this._segmentAppearance(s,id);legend.set(v.label+'|'+v.color,v);const start=Math.max(a,s.start),end=Math.min(b,s.end),description=`${name}: ${v.label}, ${this._time(s.start)} – ${this._time(s.end)} · ${this._duration(s.end-s.start)}`;return `<button class="segment ${['unknown','unavailable'].includes(s.state)?'gap':''}" style="left:${(start-a)/(b-a)*100}%;width:${(end-start)/(b-a)*100}%;background-color:${v.color};color:${v.textColor??'inherit'}" aria-label="${esc(description)}" data-time="${start}">${c.show_state_labels?`<span>${esc(v.label)}</span>`:''}</button>`;}).join('');return `<div class="row">${c.show_labels?`${label}`:''}<div class="track">${bars}</div>${c.show_summary?`<div class="summary">${esc(this._summary(i))}</div>`:''}</div>`;}).join('');
   body=`<div class="chart" tabindex="0" role="group" aria-label="${nl?'Statustijdlijn':'Status timeline'}">${c.show_grid!==false?this._ticks().map(r=>`<div class="grid-line" style="left:${r*100}%"></div>`).join(''):''}${rows}<div class="guide" hidden></div><div class="zoom-selection" hidden></div><div class="tooltip" role="status" hidden></div></div>`;
   if(c.show_axis)body+=`<div class="axis">${this._ticks().map(r=>`<span>${esc(this._time(a+(b-a)*r))}</span>`).join('')}</div>`;
   if(c.show_legend)body+=`<div class="legend">${[...legend.values()].map(v=>`<span><i style="background:${v.color}"></i>${esc(v.label)}</span>`).join('')}</div>`;
  }
  this.shadowRoot.innerHTML=`<style>:host{display:block;height:100%;min-width:0;min-height:0}ha-card{display:block;min-height:0;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#20252b);font-family:inherit;height:100%}
.content{height:100%;min-height:0;overflow:auto;padding:16px 16px 12px;box-sizing:border-box;position:relative;scrollbar-width:thin}
${cardHeaderStyles()}
${periodControlsStyles()}
${chartInsightStyles()}
@media(max-width:480px){.content{padding:12px 12px 10px}}
.chart{position:relative;touch-action:pan-y;min-width:0}
.grid-line{position:absolute;top:0;bottom:0;border-left:1px solid var(--divider-color,#ddd);opacity:.45;pointer-events:none}
.row{position:relative}
.row-label{position:relative;width:fit-content;background:var(--ha-card-background,var(--card-background-color,#fff))}
.summary{margin-top:6px;font-size:11px;color:var(--secondary-text-color,#666);background:var(--ha-card-background,var(--card-background-color,#fff));position:relative;overflow-wrap:anywhere}
.row+.row{margin-top:${c.row_gap}px}
.row-label{font-size:12px;color:var(--secondary-text-color,#666);margin-bottom:7px;overflow-wrap:anywhere}
.row-label[data-series]{display:block;max-width:100%;padding:0;border:0;text-align:start;font-family:inherit;cursor:pointer}
.row-label[data-series]:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:2px}
.track{position:relative;height:${c.bar_height}px;border-radius:${c.border_radius}px;overflow:hidden;background:var(--divider-color,#ddd)}
.segment{position:absolute;top:0;height:100%;padding:0;border:0;border-right:1px solid #ffffff24;box-sizing:border-box;cursor:pointer;color:white;min-width:0;overflow:hidden;font:11px inherit}
.segment span{padding:0 6px;white-space:nowrap}
.segment:focus-visible{outline:2px solid var(--primary-text-color,#222);outline-offset:-2px;z-index:1}
.gap{background-image:repeating-linear-gradient(135deg,transparent,transparent 4px,#ffffff40 4px,#ffffff40 8px)}
.axis{display:flex;justify-content:space-between;gap:8px;margin-top:10px;font-size:11px;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums}
.legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:16px;font-size:12px;color:var(--secondary-text-color,#666)}
.legend span{display:flex;align-items:center;gap:6px;overflow-wrap:anywhere}
.legend i,.tooltip i{width:9px;height:9px;border-radius:3px;flex-shrink:0}
.guide{position:absolute;top:0;bottom:0;border-left:1px solid var(--primary-text-color,#20252b);opacity:.6;pointer-events:none;z-index:2}
.zoom-selection{position:absolute;top:0;bottom:0;background:color-mix(in srgb,var(--primary-color,#2196f3) 18%,transparent);border-inline:1px solid var(--primary-color,#2196f3);pointer-events:none;z-index:3}
${SharedGraph.tooltipStyles()}
.tooltip .tooltip-label{color:var(--secondary-text-color,#666)}
.tooltip .tooltip-value{color:var(--primary-text-color,#20252b);font-style:normal}
.state-limit{font-size:12px;color:var(--error-color,#db4437);overflow-wrap:anywhere;position:relative}
.message{font-size:14px;color:var(--secondary-text-color,#666);min-height:60px}
.retry{display:block;margin-top:12px;min-height:44px;background:transparent;color:inherit;border:1px solid var(--divider-color,#ddd);border-radius:6px;padding:8px 12px}[hidden]{display:none}</style><ha-card><div class="content">${controls}${body}</div></ha-card>`;
  bindPeriodControls(this);bindChartInsights(this);
  const retry=this.shadowRoot.querySelector('.retry');if(retry)retry.onclick=()=>this._refresh();this.shadowRoot.querySelectorAll('[data-zoom]').forEach(button=>button.onclick=()=>this._zoom({in:.5,out:2,reset:0}[button.dataset.zoom]));this._bindInteractions();const renderedChart=this.shadowRoot.querySelector('.chart'),restoreTooltip=()=>{if(this.shadowRoot.querySelector('.chart')===renderedChart){SharedGraph.restoreHover(this);if(this._cursor!=null)this._showTooltip(this._cursor,false);}};const ready=this.shadowRoot.querySelector('ha-card')?.updateComplete;if(ready?.then)ready.then(restoreTooltip);else restoreTooltip();
 }
};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={entities:'Entiteiten op de tijdlijn',title:'Titel (optioneel)',hours_to_show:'Afgelopen aantal uren',bar_height:'Balkdikte (px)',border_radius:'Afronding (px)',row_gap:'Ruimte tussen balken (px)',state_colors:'Statuskleur toevoegen',show_labels:'Naam boven elke balk tonen',show_legend:'Legenda met statuskleuren tonen',show_axis:'Tijden onder de balken tonen',show_state_labels:'Statusnaam in de balk tonen',default_color:'Terugvalkleur (optioneel)',series_options:'Aangepaste naam toevoegen'};
const helpers={entities:'Elke entiteit krijgt één balk, in de gekozen volgorde. Kies 1–16 entiteiten met statusgeschiedenis.',hours_to_show:'Terugkijkperiode: 24 = één dag, 168 = één week. Alleen opgeslagen Home Assistant-geschiedenis is beschikbaar.',state_colors:'Gebruik de echte statuswaarde, bijvoorbeeld on, off, home of not_home. Zonder entiteit geldt de kleur voor alle balken; met entiteit alleen voor die balk. Een specifieke kleur gaat voor een algemene kleur. De weergavenaam is optioneel.',default_color:'Alleen voor statussen zonder eigen kleurregel. Leeg laten gebruikt de ingebouwde statuskleuren.',show_state_labels:'Op korte tijdvakken past niet altijd tekst. Details blijven beschikbaar door een tijdvak aan te tikken.',series_options:'Optioneel: wijzig de naam van een hierboven gekozen entiteit. Dit voegt geen extra balk toe. Zonder aanpassing wordt de Home Assistant-naam gebruikt.',bar_height:'Hoogte van elke statusbalk, van 4 tot 80 pixels.',border_radius:'Rondt de buitenhoeken van de volledige balk af.',row_gap:'Verticale ruimte tussen de rijen.'};
function color(v,fallback='#607d94'){if(Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&n>=0&&n<=255))return `rgb(${v.join(',')})`;return typeof v==='string'&&/^(#[\da-f]{3,8}|[a-z]+|var\(--[\w-]+\))$/i.test(v)?v:fallback;}
Object.assign(labels,{entity:'Entiteit',name:'Weergavenaam (optioneel)',state_colors:'Statusregels',timeline_settings:'Tijdlijn',status_settings:'Algemene statusregels',bar_settings:'Balkopmaak'});
Object.assign(helpers,{state_colors:'Gebruik de echte statuswaarde, bijvoorbeeld on, off, home of not_home. Eigen regels gaan voor algemene regels. Dubbele statuswaarden zijn niet toegestaan.',status_settings:'Deze regels gelden voor alle entiteiten, tenzij de entiteit een eigen regel voor dezelfde status heeft.'});
Object.assign(labels,{sync_timeframe:'Tijdvak synchroniseren',show_title:'Titel tonen',sync_hover:'Hover synchroniseren',hover_sync_group:'Synchronisatiegroep'});
Object.assign(helpers,{sync_timeframe:'Deelt tijdvakkeuze en vorige/volgende/Nu met ingeschakelde kaarten in dezelfde groep.',sync_hover:'Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.',hover_sync_group:'Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.'});
const timelineEnglish={
 'Tijdvak synchroniseren':'Synchronize timeframe','Tijdvakgroep':'Timeframe group',
 'Deelt tijdvakkeuze en vorige/volgende/Nu met ingeschakelde kaarten in dezelfde groep.':'Shares timeframe selection and previous/next/Now with enabled cards in the same group.',
 'Dezelfde sleutel koppelt kaarten op deze pagina. Leeg gebruikt de standaardgroep.':'The same key links cards on this page. Empty uses the default group.',
 'Titel tonen':'Show title',
 'Hover synchroniseren':'Synchronize hover','Synchronisatiegroep':'Synchronization group',
 'Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.':'Shares the selected time with other Eleven graphs on this page.',
 'Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.':'Cards with the same group share hover and timeframe when the corresponding synchronization is enabled. Empty uses the default group.',
 'Tijdlijn':'Timeline','Algemene statusregels':'Common state rules','Balkopmaak':'Bar appearance','Entiteiten':'Entities','Entiteit':'Entity',
 'Weergavenaam (optioneel)':'Display name (optional)','Statusregels':'State rules','Titel (optioneel)':'Title (optional)',
 'Afgelopen aantal uren':'Hours to show','Balkdikte (px)':'Bar height (px)','Afronding (px)':'Corner radius (px)','Ruimte tussen balken (px)':'Row gap (px)',
 'Naam boven elke balk tonen':'Show name above each bar','Legenda met statuskleuren tonen':'Show state legend','Tijden onder de balken tonen':'Show time axis','Statusnaam in de balk tonen':'Show state labels inside bars','Terugvalkleur (optioneel)':'Fallback color (optional)',
 'Statuswaarde (bijv. on of home)':'State value (e.g. on or home)','Kleur':'Color','Entiteit toevoegen':'Add entity','Nieuwe entiteit':'New entity','Omhoog':'Move up','Omlaag':'Move down','Verwijderen':'Remove',
 'Kies 1–16 unieke entiteiten.':'Choose 1–16 unique entities.','Dubbele statusregel':'Duplicate state rule',
 'Gebruik de echte statuswaarde, bijvoorbeeld on, off, home of not_home. Eigen regels gaan voor algemene regels. Dubbele statuswaarden zijn niet toegestaan.':'Use the actual state value, e.g. on, off, home or not_home. Entity rules override common rules. Duplicate states are not allowed.',
 'Deze regels gelden voor alle entiteiten, tenzij de entiteit een eigen regel voor dezelfde status heeft.':'These rules apply to all entities unless an entity has its own rule for the same state.',
 'Terugkijkperiode: 24 = één dag, 168 = één week. Alleen opgeslagen Home Assistant-geschiedenis is beschikbaar.':'History window: 24 = one day, 168 = one week. Only recorded Home Assistant history is available.',
 'Alleen voor statussen zonder eigen kleurregel. Leeg laten gebruikt de ingebouwde statuskleuren.':'Only for states without a matching color rule. Empty uses the built-in state colors.',
 'Op korte tijdvakken past niet altijd tekst. Details blijven beschikbaar door een tijdvak aan te tikken.':'Short segments may not fit text. Tap a segment to view its details.',
 'Hoogte van elke statusbalk, van 4 tot 80 pixels.':'Height of every state bar, from 4 to 80 pixels.',
 'Rondt de buitenhoeken van de volledige balk af.':'Rounds the outer corners of the whole bar.',
 'Verticale ruimte tussen de rijen.':'Vertical space between rows.'
};
Object.assign(labels,{show_grid:'Grid tonen',show_summary:'Statusduur per entiteit tonen',show_navigation:'Tijdvakselectie tonen'});
Object.assign(timelineEnglish,{'Grid tonen':'Show grid','Statusduur per entiteit tonen':'Show state duration per entity','Tijdvakselectie tonen':'Show timeframe selection'});
function timelineText(s,hass){const h=hass??(typeof document==='undefined'?undefined:document.querySelector('home-assistant')?.hass);return (h?.locale?.language??h?.language??'nl').startsWith('nl')?s:timelineEnglish[s]??s;}
Object.assign(helpers,{show_grid:'Toon verticale tijdlijnen achter de statusbalken. Aslabels en statusbalken blijven zichtbaar.',show_navigation:'Toon het tijdvakmenu, vorige/volgende, Nu en het gekozen datumbereik.'});
Object.assign(timelineEnglish,{'Toon verticale tijdlijnen achter de statusbalken. Aslabels en statusbalken blijven zichtbaar.':'Show vertical time grid lines behind the state bars. Axis labels and state bars remain visible.','Toon het tijdvakmenu, vorige/volgende, Nu en het gekozen datumbereik.':'Show the timeframe menu, previous/next, Now and the selected date range.'});
function validateTimeline(c,hass){
 for(const key of ['show_grid','show_navigation'])if(c[key]!==undefined&&typeof c[key]!=='boolean')throw Error(key);
 if(c.sync_hover!=null&&typeof c.sync_hover!=='boolean')throw Error('sync_hover');
 if(c.hover_sync_group!=null&&typeof c.hover_sync_group!=='string')throw Error('hover_sync_group');
 if(!Array.isArray(c.entities)||!c.entities.length||c.entities.length>16||new Set(c.entities).size!==c.entities.length||c.entities.some(id=>typeof id!=='string'||!/^\w+\.\w+$/.test(id)))throw Error(timelineText('Kies 1–16 unieke entiteiten.',hass));
 const keys=new Set();for(const r of c.state_colors??[]){const key=JSON.stringify([r.entity??'',String(r.state)]);if(keys.has(key))throw Error(timelineText('Dubbele statusregel',hass)+': '+(r.entity??'')+' / '+r.state);keys.add(key);}
}
class TimelineSettingsEditor extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});}
 setConfig(c){this._data=TimelineCard.editorConfig(c);this._render();}
 set hass(h){this._hass=h;this._render();}get hass(){return this._hass;}connectedCallback(){this._render();}
 _emit(){try{const c=TimelineCard.cardConfig(this._data);validateTimeline(c,this._hass);this._error='';this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:c},bubbles:true,composed:true}));}catch(e){this._error=e.message;}this._render();}
 _bind(form,definition,data){form.hass=this._hass;form.schema=definition.schema;form.data=data;form.computeLabel=s=>definition.computeLabel.call(this,s);form.computeHelper=s=>definition.computeHelper.call(this,s);}
 _render(){
  if(!this._data||!this._hass)return;
  const label=s=>timelineText(s,this._hass);
  if(!this._form){
   this.shadowRoot.innerHTML='<style>:host{display:block;min-width:0}h3{font-size:16px;margin:24px 0 12px}details{border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);margin:12px 0;min-width:0}summary{cursor:pointer;padding:12px;min-height:44px;box-sizing:border-box;overflow-wrap:anywhere}summary small{display:block;color:var(--secondary-text-color)}.body{padding:0 12px 12px;min-width:0}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}button{font:inherit;color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:6px;min-height:44px;padding:8px 12px;cursor:pointer}button:disabled{opacity:.45}.remove{margin-left:auto;color:var(--error-color)}summary:focus-visible,button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}.error{color:var(--error-color);overflow-wrap:anywhere}</style><ha-form class="timeline-form"></ha-form><h3></h3><div class="entities"></div><button class="add" type="button"></button><p class="error" role="alert"></p><ha-form class="common-form"></ha-form>';
   this._form=this.shadowRoot.querySelector('.timeline-form');this._common=this.shadowRoot.querySelector('.common-form');
   for(const f of [this._form,this._common])f.addEventListener('value-changed',e=>{e.stopPropagation();this._data={...this._data,...e.detail.value,entities:this._data.entities};this._emit();});
   this.shadowRoot.querySelector('.add').onclick=()=>{if(this._data.entities.length>=16)return;this._data={...this._data,entities:[...this._data.entities,{entity:'',state_colors:[]}]};this._openNew=true;this._render();};
  }
  const f=TimelineCard.getConfigForm();this._bind(this._form,{...f,schema:f.schema.slice(0,1)},this._data);this._bind(this._common,{...f,schema:f.schema.slice(1)},this._data);
  this.shadowRoot.querySelector('h3').textContent=label('Entiteiten');const add=this.shadowRoot.querySelector('.add');add.textContent=label('Entiteit toevoegen');add.disabled=this._data.entities.length>=16;
  this.shadowRoot.querySelector('.error').textContent=this._error??'';
  const container=this.shadowRoot.querySelector('.entities');while(container.children.length>this._data.entities.length)container.lastElementChild.remove();
  this._data.entities.forEach((r,i)=>{
   let entry=container.children[i];if(!entry){entry=document.createElement('details');entry.className='entity-entry';entry.innerHTML='<summary><span></span><small></small></summary><div class="body"><ha-form></ha-form><div class="actions"><button class="up" type="button"></button><button class="down" type="button"></button><button class="remove" type="button"></button></div></div>';container.append(entry);entry.open=this._data.entities.length===1||!!this._openNew;
    entry.querySelector('ha-form').addEventListener('value-changed',e=>{e.stopPropagation();const rows=[...this._data.entities];rows[i]={...rows[i],...e.detail.value};this._data={...this._data,entities:rows};this._emit();});
    entry.querySelector('.remove').onclick=()=>{this._data={...this._data,entities:this._data.entities.filter((_,n)=>n!==i)};this._emit();};
    for(const [key,delta]of [['up',-1],['down',1]])entry.querySelector('.'+key).onclick=()=>{const rows=[...this._data.entities],j=i+delta;if(j<0||j>=rows.length)return;[rows[i],rows[j]]=[rows[j],rows[i]];this._data={...this._data,entities:rows};this._emit();};
   }
   entry.querySelector('summary span').textContent=r.name||this._hass.states?.[r.entity]?.attributes?.friendly_name||r.entity||label('Nieuwe entiteit');entry.querySelector('small').textContent=r.entity;
   for(const [key,text]of [['up','Omhoog'],['down','Omlaag'],['remove','Verwijderen']]){const b=entry.querySelector('.'+key);b.textContent=label(text);b.disabled=key==='up'?i===0:key==='down'?i===this._data.entities.length-1:false;}
   this._bind(entry.querySelector('ha-form'),TimelineCard.getEntityConfigForm(r,this._hass),r);
  });this._openNew=false;
 }
}
class TimelineCard extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});this._generation=0;this._status='loading';this._series=[];}
 static getStubConfig(hass){return {entities:Object.keys(hass?.states??{}).filter(id=>/^(binary_sensor|person|input_boolean|switch)\./.test(id)).slice(0,1),hours_to_show:24};}
 static editorConfig(c={}){
  const clone=v=>Array.isArray(v)?v.map(clone):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])):v;
  const data=clone({hours_to_show:24,bar_height:18,border_radius:5,row_gap:16,show_labels:true,show_legend:true,show_title:true,show_axis:true,show_state_labels:false,show_grid:true,show_summary:false,show_navigation:true,sync_hover:true,hover_sync_group:'',sync_timeframe:false,state_colors:[],series_options:[],...c,...timeframeSyncConfig(c,{draft:true})});
  const ids=data.entities??[];
  data._orphan_colors=data.state_colors.filter(r=>r.entity&&!ids.includes(r.entity));
  data._orphan_options=data.series_options.filter(r=>!ids.includes(r.entity));
  data.entities=ids.map(entity=>({...data.series_options.find(r=>r.entity===entity),entity,state_colors:data.state_colors.filter(r=>r.entity===entity).map(({entity,...rule})=>rule)}));
  data.state_colors=data.state_colors.filter(r=>!r.entity);delete data.series_options;return data;
 }
 static cardConfig(d){
  const {_orphan_colors=[],_orphan_options=[],...config}=d;
  config.entities=d.entities.filter(r=>r.entity).map(r=>r.entity);
  config.series_options=[..._orphan_options,...d.entities.filter(r=>r.entity).map(({state_colors,name,...r})=>({...r,...(name?{name}:{})}))];
  config.state_colors=[...d.state_colors,..._orphan_colors,...d.entities.filter(r=>r.entity).flatMap(r=>(r.state_colors??[]).map(rule=>({...rule,entity:r.entity})))];
  return JSON.parse(JSON.stringify(config));
 }
 static _form(schema){return {schema,computeLabel:function(s){return timelineText(labels[s?.name]??s?.title??s?.name??'',this?.hass);},computeHelper:function(s){return helpers[s?.name]?timelineText(helpers[s.name],this?.hass):undefined;}};}
 static _rules(row={},hass){const current=hass?.states?.[row.entity];const options=[...new Set(['on','off','home','not_home','unknown','unavailable',...(current?.attributes?.options??[]),...(row.state_colors??[]).map(r=>String(r.state)),...(current?.state?[current.state]:[])])];return {object:{multiple:true,label_field:'state',fields:{
  state:{get label(){return timelineText('Statuswaarde (bijv. on of home)');},required:true,selector:{select:{options,custom_value:true}}},
  color:{get label(){return timelineText('Kleur');},required:true,selector:{color_rgb:{}}},
  label:{get label(){return timelineText('Weergavenaam (optioneel)');},selector:{text:{}}}
 }}};}
 static getEntityConfigForm(row,hass){return this._form([
  {name:'entity',required:true,selector:{entity:{}}},{name:'name',selector:{text:{}}},
  {name:'state_colors',selector:this._rules(row,hass)}
 ]);}
 static getConfigForm(){
  const num=(name,min,max,def)=>({name,default:def,selector:{number:{min,max,step:1,mode:'box',unit_of_measurement:name==='hours_to_show'?'h':'px'}}});
  const group=(name,title,schema)=>({type:'expandable',name,get title(){return timelineText(title);},flatten:true,schema});
  return this._form([
   group('timeline_settings','Tijdlijn',[
    {name:'title',selector:{text:{}}},num('hours_to_show',1,8760,24),
    ...['show_title','show_labels','show_axis','show_legend','show_state_labels','show_grid','show_summary','show_navigation','sync_hover'].map(name=>({name,default:!['show_state_labels','show_summary'].includes(name),selector:{boolean:{}}})),
    {name:'hover_sync_group',selector:{text:{}}},{name:'sync_timeframe',default:false,selector:{boolean:{}}}
   ]),
   group('status_settings','Algemene statusregels',[{name:'state_colors',selector:this._rules()},{name:'default_color',selector:{color_rgb:{}}}]),
   group('bar_settings','Balkopmaak',[num('bar_height',4,80,18),num('border_radius',0,40,5),num('row_gap',0,64,16)])
  ]);
 }
 static async getConfigElement(){
  if(!customElements.get('ha-form')){const helpers=await window.loadCardHelpers(),card=await helpers.createCardElement({type:'entities',entities:[]});await card.constructor.getConfigElement();await customElements.whenDefined('ha-form');}
  if(!customElements.get('eleven-timeline-editor'))customElements.define('eleven-timeline-editor',TimelineSettingsEditor);
  return document.createElement('eleven-timeline-editor');
 }
 setConfig(c){timeframeSyncConfig(c);validateTimeline(c,this._hass);if(!Array.isArray(c.entities)||!c.entities.length||c.entities.length>16||c.entities.some(id=>typeof id!=='string'||!/^\w+\.\w+$/.test(id)))throw Error('Kies 1–16 entiteiten.');const config={hours_to_show:24,bar_height:18,border_radius:5,row_gap:16,show_labels:true,show_legend:true,show_title:true,show_axis:true,show_state_labels:false,show_grid:true,show_summary:false,show_navigation:true,sync_hover:true,hover_sync_group:'',state_colors:[],series_options:[],...c};for(const [k,min,max] of [['hours_to_show',1,8760],['bar_height',4,80],['border_radius',0,40],['row_gap',0,64]])if(!Number.isFinite(config[k])||config[k]<min||config[k]>max)throw Error(`Ongeldige ${k}`);for(const k of ['state_colors','series_options'])if(!Array.isArray(config[k])||config[k].some(x=>!x||typeof x!=='object'))throw Error(`Ongeldige ${k}`);SharedGraph.clearHover(this);this._lastLoad=null;this._loadFailed=false;this._insightOpen=null;this._visibility=new Map();this._config={...config,...timeframeSyncConfig(c)};this._viewport=null;resetGraphPeriod(this);this._hideTooltip();this._generation++;this._inFlight=false;this._series=[];this._stateLimits=[];this._status='loading';this._refreshFailures=0;clearTimeout(this._timer);connectTimeframeSync(this);this._render();if(this._connected&&this._hass)this._refresh();}
 set hass(h){
  this._hass=h;
  const signature=JSON.stringify([h?.locale?.language??h?.language,h?.config?.time_zone,this._config?.entities.map(id=>{const state=h?.states?.[id];return [state?.state,state?.attributes?.friendly_name,state?.attributes?.device_class];})]);
  if(this._config&&signature!==this._hassSignature){this._hassSignature=signature;this._render();}
  if(this._config&&this._connected&&!this._started)this._refresh();
 }
 get hass(){return this._hass;}
 connectedCallback(){this._connected=true;connectTimeframeSync(this);SharedGraph.connectHover(this,t=>this._receiveHover(t));this._outside??=e=>{if(!e.composedPath().includes(this)&&!SharedGraph.hoverSourceInEvent(this,e))this._hideTooltip();};globalThis.document?.addEventListener('pointerdown',this._outside);if(typeof ResizeObserver!=='undefined'){this._resizeObserver??=new ResizeObserver(entries=>{const narrow=(entries[0]?.contentRect?.width??this.clientWidth)<400;if(this._axisNarrow!==undefined&&this._axisNarrow!==narrow&&this._config)this._render();this._axisNarrow=narrow;});this._resizeObserver.observe(this);}if(this._config&&this._hass)this._refresh();}
 disconnectedCallback(){disconnectTimeframeSync(this);disconnectChartInsights(this);disconnectPeriodControls(this);SharedGraph.disconnectHover(this);globalThis.document?.removeEventListener('pointerdown',this._outside);this._resizeObserver?.disconnect();if(this._hoverFrame!=null)cancelAnimationFrame(this._hoverFrame);this._hoverFrame=null;this._hideTooltip();this._connected=false;this._started=false;this._inFlight=false;this._generation++;clearTimeout(this._timer);}
 getCardSize(){return Math.ceil((90+(this._config?.entities.length??1)*((this._config?.bar_height??18)+(this._config?.row_gap??16)+24))/50);}
 getGridOptions(){return {columns:12,min_columns:6,rows:Math.max(3,Math.ceil(this.getCardSize()*50/64)),min_rows:3};}
 _isSeriesVisible(index){return chartSeriesVisible(this,index);}
 _nl(){return (this._hass?.locale?.language??this._hass?.language??'nl').startsWith('nl');}
 _time(t,full=false){try{return new Intl.DateTimeFormat(this._nl()?'nl-NL':'en-GB',{hour:'2-digit',minute:'2-digit',...(full||(this._viewEnd-this._viewStart)>86400000?{day:'2-digit',month:'short'}:{}),timeZone:this._hass?.config?.time_zone}).format(t);}catch{return new Date(t).toLocaleTimeString();}}
 _semanticColor(state,id){
  const defaults={on:'#0072b2',off:'#8b949e',home:'#009e73',not_home:'#e69f00',unknown:'#767676',unavailable:'#b64e86'};
  if(id?.startsWith('binary_sensor.')&&['on','off'].includes(state)){
   const deviceClass=this._hass?.states?.[id]?.attributes?.device_class;
   if(['battery','carbon_monoxide','gas','moisture','problem','safety','smoke','tamper'].includes(deviceClass))return state==='on'?'#d55e00':'#009e73';
   if(['door','garage_door','opening','window','lock'].includes(deviceClass))return state==='on'?'#e69f00':deviceClass==='lock'?'#009e73':'#8b949e';
   if(deviceClass==='connectivity')return state==='on'?'#009e73':'#d55e00';
  }
  if(id?.startsWith('lock.'))return {locked:'#009e73',unlocked:'#e69f00',locking:'#0072b2',unlocking:'#cc79a7',jammed:'#d55e00'}[state]??defaults[state];
  if(id?.startsWith('cover.'))return {open:'#0072b2',closed:'#8b949e',opening:'#009e73',closing:'#e69f00'}[state]??defaults[state];
  return defaults[state];
 }
 _categoricalColor(state,id){
  const palette=['#4477aa','#ee7733','#228833','#cc6677','#aa3377','#66ccee','#997700','#882255','#44aa99','#332288','#ddaa33','#6699cc','#aa4499','#117733','#ddcc77','#88ccee','#cc3311','#7777bb','#bb8844','#44bbbb'];
  const series=this._series?.[this._config.entities.indexOf(id)];
  const hash=value=>{let n=2166136261;for(const ch of value)n=Math.imul(n^ch.charCodeAt(0),16777619);return n>>>0;};
  if(!series)return palette[hash(state)%palette.length];
  this._categoryColors??=new WeakMap();let colors=this._categoryColors.get(series);
  if(!colors){
   colors=new Map();const used=new Set(),states=[...new Set(series.filter(s=>!s.missing&&!this._semanticColor(String(s.state),id)).map(s=>String(s.state)))].sort();
   for(const value of states){let index=hash(value)%palette.length;while(used.has(index)&&used.size<palette.length)index=(index+1)%palette.length;used.add(index);colors.set(value,palette[index]);}
   this._categoryColors.set(series,colors);
  }
  return colors.get(state)??palette[hash(state)%palette.length];
 }
 _textColor(background){
  let rgb;if(/^#[\da-f]{6}$/i.test(background))rgb=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16));
  else if(/^#[\da-f]{3}$/i.test(background))rgb=[...background.slice(1)].map(ch=>parseInt(ch+ch,16));
  else if(/^rgb\([\d., ]+\)$/.test(background))rgb=background.slice(4,-1).split(',').map(Number);
  if(!rgb||rgb.length!==3)return '#ffffff';
  const linear=rgb.map(n=>{const s=n/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}),luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
  return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#ffffff';
 }
 _appearance(state,id){const m=this._config.state_colors.find(x=>String(x.state)===state&&x.entity===id)??this._config.state_colors.find(x=>String(x.state)===state&&!x.entity),background=color(m?.color,color(this._config.default_color,this._semanticColor(state,id)??this._categoricalColor(state,id)));return {label:m?.label??(state==='unknown'?(this._nl()?'Onbekend':'Unknown'):state==='unavailable'?(this._nl()?'Niet beschikbaar':'Unavailable'):state),color:background,textColor:this._textColor(background)};}
 async _refresh(){if(!this._connected||!this._hass||!this._config||this._inFlight)return;clearTimeout(this._timer);this._inFlight=true;this._started=true;const generation=++this._generation,c=this._config,{start,end}=graphPeriodRange(this);let timeout;try{const q=new URLSearchParams({filter_entity_id:c.entities.join(','),end_time:new Date(end).toISOString(),minimal_response:'',no_attributes:''});const response=await Promise.race([this._hass.callApi('GET',`history/period/${new Date(start).toISOString()}?${q}`),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('timeout')),15000);timeout.unref?.();})]);if(!this._connected||generation!==this._generation)return;if(!Array.isArray(response))throw Error('Invalid history');this._start=start;this._end=end;this._stateLimits=[];const responseById=new Map(response.filter(rows=>Array.isArray(rows)&&rows[0]?.entity_id).map(rows=>[rows[0].entity_id,rows]));this._series=c.entities.map((id,index)=>{const rows=responseById.get(id)??[],states=new Set();for(const row of rows){if(row.state==null)continue;states.add(String(row.state));if(states.size>20){this._stateLimits[index]=true;return [];}}const result=segments(rows,start,end),first=Math.min(...rows.map(r=>Date.parse(r.last_changed??r.last_updated)).filter(Number.isFinite));if(result[0]?.state==='unknown'&&first>start){if(first<result[0].end)result.unshift({...result[0],end:first,missing:true}),result[1]={...result[1],start:first};else result[0]={...result[0],missing:true};}return result;});this._loadFailed=false;this._lastLoad={at:Date.now(),start,end,sources:c.entities.map((id,i)=>({id,source:'history',empty:!this._series[i]?.some(s=>!s.missing)}))};this._status='ready';this._refreshFailures=0;}catch{if(generation===this._generation){this._loadFailed=true;this._status='error';this._refreshFailures=(this._refreshFailures??0)+1;}}finally{clearTimeout(timeout);if(this._connected&&generation===this._generation){this._inFlight=false;this._render();this._timer=setTimeout(()=>this._refresh(),retryDelay(this._refreshFailures??0));this._timer.unref?.();}}}
}
Object.assign(TimelineCard.prototype,TimelineView);
if(!customElements.get('eleven-timeline-card'))customElements.define('eleven-timeline-card',TimelineCard);
window.customCards??=[];if(!window.customCards.some(c=>c.type==='eleven-timeline-card'))window.customCards.push({type:'eleven-timeline-card',name:'Eleven Timeline Card',description:'Horizontal status history with configurable bars and colors.',preview:true});


})();
