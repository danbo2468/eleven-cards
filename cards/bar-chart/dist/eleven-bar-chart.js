/* Eleven Bar Chart — local beta; standalone, based on Eleven History. */
(()=>{
"use strict";

// ../../shared/graph.js
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

// ../../shared/ui-button.js
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

// ../../shared/ui-legend.js

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

// ../../shared/ui-tabs.js
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

// ../../shared/ui-popup.js
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

// ../../shared/card-header.js
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

// ../../shared/request.js
function retryDelay(failures, base = 60000, maximum = 300000) {
  return Math.min(maximum, base * 2 ** Math.max(0, failures - 1));
}

// ../../shared/periods.js
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

// ../../shared/period-controls.js
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

// ../../shared/chart-insights.js
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

// ../history-graph-card/src/history-utils.js
function validColor(color){return typeof color==='string'?/^#[\da-f]{6}$/i.test(color):Array.isArray(color)&&color.length===3&&color.every(v=>Number.isInteger(v)&&v>=0&&v<=255);}
const SERIES_COLORS=['#2196f3','#e78a14','#ab70d9','#26a69a','#e66b91','#718cc2','#a18d3a','#718d78'];
const APPEARANCE_KEYS=['line_width','line_style','line_interpolation','line_color','show_fill','fill_color','fill_opacity','fill_fade','gradient_mode','gradient_stops'];
// Resolve legacy inheritance once. Explicit modes on new rows have no implicit precedence.
const LINE_GEOMETRY_KEYS=['line_width','line_style','line_interpolation'];
function seriesAppearance(config,index,seen=new Set()) {
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
function editorConfig(config) {
 const data={hours_to_show:24,data_source:'auto',graph_mode:'lines',aggregation_period:'none',aggregation_method:'avg',show_hover_line:true,show_legend:true,show_title:true,show_navigation:true,show_grid:true,align_zero:true,sync_hover:true,hover_sync_group:'',sync_timeframe:false,...config,...timeframeSyncConfig(config,{draft:true}),entities:(config.entities??[]).map((entity,index)=>{
  const row=seriesAppearance(config,index);
  for(const key of ['color','fill_color'])if(validColor(row[key]))row[key]=[...rgb(row[key])];
  row.gradient_stops=row.gradient_stops.map(s=>({...s,color:validColor(s.color)?[...rgb(s.color)]:s.color}));
  return row;
 })};
 delete data.series_options;for(const key of APPEARANCE_KEYS)delete data[key];return data;
}
function cardConfig(data) {
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
function updateSeriesRow(data,index,value){
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
function removeSeriesRow(data,index){
 const rows=resolvedEditorRows(data.entities),removed=rows[index].entity;
 const remaining=rows.filter((_,i)=>i!==index);
 for(const row of remaining)if(row.line_style_source===removed)delete row.line_style_source;
 return {...data,entities:resolvedEditorRows(remaining)};
}
function lineStyleSources(rows,row){
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
function validateConfig(config) {
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
function gradientColor(stops,value,mode='smooth'){
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
function statisticsPeriod(config,end=Date.now()){
 const source=config.data_source??'auto',period=config.aggregation_period??'none';
 const supported=['none','hour','day','week','month'].includes(period)&&(config.aggregation_method!=='delta'||period!=='none');
 if(source==='statistics'&&!supported)throw new Error('statistics_config');
 if(source==='history'||!supported||(source==='auto'&&config.hours_to_show<=48&&Date.now()-end<=48*3600000))return null;
 return period==='none'?'hour':period;
}
// HA has used epoch seconds and milliseconds across Recorder versions.
function statisticTime(value){return typeof value==='number'?(value<1e12?value*1000:value):Date.parse(value);}
async function loadHistorySeries(hass,config,start,end){
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
function numericState(state) {
 if(typeof state!=='string'||state.trim()==='') return null;
 const number=Number(state); return Number.isFinite(number)?number:null;
}
function decodeHistory(response,entities,start,end) {
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
function valueAt(points,time) {
 let left=0,right=points.length-1,index=-1;
 while(left<=right) {const mid=(left+right)>>1;if(points[mid].t<=time){index=mid;left=mid+1;}else right=mid-1;}
 return index<0?null:points[index].v;
}
function stepPath(points,end,x,y) {
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
function seriesMetadata(hass,entities,options=[]) {
 const items=entities.map(id=>{
  const state=hass.states?.[id]; if(!state) throw new Error('missing');
  const option=options.find(s=>s.entity===id);
  return {id,name:option?.name||state.attributes?.friendly_name||id,unit:state.attributes?.unit_of_measurement??''};
 });
 return {items,unit:items[0]?.unit??''};
}
// Group by exact unit, never add or scale incompatible quantities together.
function graphAxes(series,meta,config,start,end,visible=series.map(()=>true)){
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
function alignGridAxes(axes,config={}){
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
function alignZeroAxes(axes,config={},primaryUnit=axes[0]?.unit){
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
function yRange(series,config={}) {
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
function yAxis(series,config={}){
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
function periodBounds(t,period,zone='UTC'){return graphPeriodBounds(t,period,zone);}
function aggregateSeries(series,start,end,period='none',method='avg',zone='UTC',{preserveGaps=true}={}){
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
function connectGapPoints(points){
 const first=points.findIndex(p=>p.v!==null);if(first<0)return points;
 let last=points.length-1;while(last>first&&points[last].v===null)last--;
 return points.filter((p,i)=>p.v!==null||i<first||i>last);
}
function displayPoints(points,start,end,bins=1500){
 let first=0,last=points.length;while(first<last){const mid=(first+last)>>1;if(points[mid].t<start)first=mid+1;else last=mid;}
 const begin=Math.max(0,first-1);first=begin;last=points.length;while(first<last){const mid=(first+last)>>1;if(points[mid].t<=end)first=mid+1;else last=mid;}
 const clipped=points.slice(begin,Math.min(points.length,first+1));if(clipped.length<=bins*4)return clipped;
 const keep=new Set([0,clipped.length-1]);let bin=-1,group=[];
 const flush=()=>{if(!group.length)return;keep.add(group[0]);keep.add(group.at(-1));let min=group[0],max=min;for(const i of group){if(clipped[i].v<clipped[min].v)min=i;if(clipped[i].v>clipped[max].v)max=i;}keep.add(min);keep.add(max);group=[];};
 clipped.forEach((p,i)=>{const next=Math.floor((p.t-start)/(end-start)*bins);if(next!==bin){flush();bin=next;}if(p.v===null){flush();for(const j of [i-1,i,i+1])if(j>=0&&j<clipped.length)keep.add(j);}else group.push(i);});flush();
 return [...keep].sort((a,b)=>a-b).map(i=>clipped[i]);
}
function stackSeries(series,start,end){
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
function historyUrl(config,end) {
 const start=new Date(end-config.hours_to_show*3600000).toISOString();
 const query=new URLSearchParams({filter_entity_id:config.entities.join(','),end_time:new Date(end).toISOString(),minimal_response:'',no_attributes:'',significant_changes_only:'0'});
 return `history/period/${encodeURIComponent(start)}?${query}`;
}

// ../history-graph-card/src/localization.js
const translations={
 title:['History','Historie'],loading:['Loading history…','Historie laden…'],empty:['No numeric history in this range.','Geen numerieke historie in deze periode.'],error:['History unavailable. Check recorder and connection.','Historie niet beschikbaar. Controleer recorder en verbinding.'],unit:['All sensors must have the same unit.','Alle sensoren moeten dezelfde eenheid hebben.'],missing:['Configured sensor not found.','Ingestelde sensor niet gevonden.'],unavailable:['Unavailable','Niet beschikbaar'],retry:['Retry','Opnieuw proberen'],chart:['History graph. Arrow keys, Home and End select a time; Escape closes details.','Historiegrafiek. Pijltjes, Home en End selecteren een tijd; Escape sluit details.'],entities:['Sensors','Sensoren'],hours_to_show:['Hours to show','Aantal uren'],hoursHelper:['Historical range: 1–8760 hours. Each different unit gets its own Y-axis.','Historische periode: 1–8760 uur. Iedere verschillende eenheid krijgt een eigen Y-as.'],titleField:['Title','Titel'],partial:['Some sensors have no numeric history:','Sommige sensoren hebben geen numerieke historie:'],config:['Invalid configuration: use 1–8 distinct sensors and 1–8760 hours.','Ongeldige configuratie: gebruik 1–8 unieke sensoren en 1–8760 uur.']};
Object.assign(translations,{
 sync_timeframe:['Synchronize timeframe','Tijdvak synchroniseren'],
 sync_timeframeHelper:['Shares timeframe selection and previous/next/Now with enabled cards in the same group.','Deelt tijdvakkeuze en vorige/volgende/Nu met ingeschakelde kaarten in dezelfde groep.'],
 show_title:['Show title','Titel tonen'],
 show_navigation:['Show timeframe selection','Tijdvakselectie tonen'],
 show_grid:['Show grid','Grid tonen'],
 show_gridHelper:['Show horizontal Y-axis grid lines and the left and right plot boundaries. Axis labels and data remain visible.','Toon horizontale Y-aslijnen en de linker- en rechterrand van de grafiek. Aslabels en gegevens blijven zichtbaar.'],
 show_navigationHelper:['Show the timeframe menu, previous/next, Now and the selected date range. The configured hours remain the default; aggregation is unchanged.','Toon het tijdvakmenu, vorige/volgende, Nu en het gekozen datumbereik. De ingestelde uren blijven de standaard; aggregatie verandert niet.'],
 data_source:['Data source','Gegevensbron'],auto:['Automatic','Automatisch'],history:['Raw history','Ruwe historie'],statistics:['Statistics','Statistics'],
 data_sourceHelper:['Automatic: statistics for ranges longer than 48 hours or ending more than 48 hours ago; raw history otherwise. Unsupported sensors fall back to history. Statistics use hour/day/week/month summaries (None uses hour). Delta uses counter change statistics, including counter resets. Minute and quarter-hour require history.','Automatisch: statistics bij periodes langer dan 48 uur of die meer dan 48 uur geleden eindigen; anders ruwe historie. Sensoren zonder ondersteuning vallen terug op historie. Statistics gebruikt uur/dag/week/maand (Geen gebruikt uur). Delta gebruikt tellerstatistieken, inclusief tellerresets. Minuut en kwartier vereisen historie.'],
 statistics_config:['Statistics requires hour, day, week or month. None uses hour for minimum, maximum or average; Delta requires an explicit period. Choose History for minute or quarter-hour.','Statistics vereist uur, dag, week of maand. Geen gebruikt uur bij minimum, maximum of gemiddelde; Delta vereist een expliciet tijdvak. Kies Historie voor minuut of kwartier.'],
 statistics_unavailable:['Statistics unavailable for a selected sensor or its unit. Delta requires counter statistics; minimum, maximum and average require measurement statistics. Choose Automatic or History.','Statistics ontbreekt voor een gekozen sensor of zijn eenheid. Delta vereist tellerstatistieken; minimum, maximum en gemiddelde vereisen meetstatistieken. Kies Automatisch of Historie.'],
 zoom:['Zoom','Zoom'],zoom_in:['Zoom in','Inzoomen'],zoom_out:['Zoom out','Uitzoomen'],zoom_reset:['Reset zoom','Zoom herstellen'],
 aggregation_period:['Aggregation period','Aggregatieperiode'],aggregation_method:['Aggregation method','Aggregatiemethode'],none:['None (raw history)','Geen (ruwe historie)'],minute:['Minute','Minuut'],quarter_hour:['Quarter hour','Kwartier'],hour:['Hour','Uur'],day:['Day','Dag'],week:['Week (Monday)','Week (maandag)'],month:['Month','Maand'],min:['Minimum','Minimum'],max:['Maximum','Maximum'],avg:['Time-weighted average','Tijdgewogen gemiddelde'],
 aggregation_periodHelper:['Applied separately to every sensor in the Home Assistant timezone. Zoom does not change it.','Per sensor toegepast in de Home Assistant-tijdzone. Zoom verandert dit niet.'],
 aggregation_methodHelper:['AVG weights numeric values by their recorded held duration; unavailable time is excluded.','AVG weegt numerieke waarden met hun geregistreerde duur; niet-beschikbare tijd wordt uitgesloten.'],
 graph_mode:['Graph mode','Grafiekmodus'],lines:['Separate lines','Losse lijnen'],stacked:['Stacked sums','Gestapelde sommen'],
 series_options:['Sensor names and colors','Sensornamen en kleuren'],entity:['Sensor','Sensor'],name:['Custom name','Eigen naam'],
 entitiesHelper:['Set name, fixed color or 2–32 color stops in each sensor entry. Sensor settings override shared colors; its own gradient overrides its fixed color.','Stel naam, vaste kleur of 2–32 kleurovergangen in per sensorregel. Sensorinstellingen gaan voor algemene kleuren; een eigen gradiënt gaat voor de eigen vaste kleur.'],
 sync_hover:['Synchronize hover','Hover synchroniseren'],hover_sync_group:['Synchronization group','Synchronisatiegroep'],
 sync_hoverHelper:['Shares the selected time with other Eleven graphs on this page.','Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.'],
 hover_sync_groupHelper:['Cards with the same group share hover and timeframe when the corresponding synchronization is enabled. Empty uses the default group.','Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.'],
 line_interpolation:['Line interpolation','Lijnverloop'],interpolation_smooth:['Smooth','Vloeiend'],interpolation_linear:['Linear','Recht'],interpolation_step:['Stepped','Trapvormig'],
 line_interpolationHelper:['Display only: chooses how recorded points are connected.','Alleen weergave: bepaalt hoe geregistreerde punten worden verbonden.'],
 connect_gaps:['Bridge missing data','Ontbrekende data overbruggen'],
 connect_gapsHelper:['Connect known points on either side of a gap using this line’s interpolation. Unknown starts and tails stay empty. Tooltips and calculations retain missing data.','Verbind bekende punten aan weerszijden van een gat volgens het lijnverloop. Ontbrekende data aan het begin en einde blijft leeg. Tooltips en berekeningen behouden ontbrekende waarden.'],
 y_step_error:['Invalid Y-axis step: enter a finite positive number or leave it empty for automatic steps.','Ongeldige stapgrootte Y-as: voer een eindig positief getal in of laat leeg voor automatische stappen.'],
 y_step_count:['Y-axis step cannot be drawn (maximum 200 ticks or numeric precision exceeded). Increase the step or narrow the Y-axis bounds.','Stapgrootte Y-as kan niet worden getekend (maximaal 200 maatstreepjes of numerieke precisie overschreden). Vergroot de stap of verklein het Y-asbereik.'],
 align_zero:['Align zero points','Nulpunten uitlijnen'],
 align_zeroHelper:['Align zero on negative Y-axes. Explicit first-axis bounds take priority.','Zet de nulpunten van negatieve Y-assen op dezelfde hoogte. Handmatige grenzen van de eerste as gaan voor.'],
 y_axis:['Y-axis','Y-as'],y_step:['Y-axis step','Stapgrootte Y-as'],
 y_stepHelper:['Optional positive tick interval in the sensor unit. Empty uses round 1/2/5 steps automatically. Maximum 200 ticks; increase the step or narrow the bounds if exceeded.','Optionele positieve stapgrootte in de sensoreenheid. Leeg kiest automatisch ronde 1/2/5-stappen. Maximaal 200 maatstreepjes; vergroot de stap of verklein het bereik bij overschrijding.'],
 y_min:['Y-axis minimum','Minimum Y-as'],y_max:['Y-axis maximum','Maximum Y-as'],
 y_minHelper:['Optional, in the first sensor’s unit. Empty scales automatically. Other units have independent automatic axes.','Optioneel, in de eenheid van de eerste sensor. Leeg schaalt automatisch. Andere eenheden hebben eigen automatische assen.'],
 y_maxHelper:['Optional, for the first sensor’s unit. Empty scales automatically. Must exceed the minimum.','Optioneel, voor de eenheid van de eerste sensor. Leeg schaalt automatisch. Moet hoger zijn dan het minimum.'],
 appearance:['Line and fill','Lijn en vulling'],line_style:['Line style','Lijnstijl'],line_width:['Line width','Lijndikte'],line_color:['Fixed line color','Vaste lijnkleur'],show_fill:['Fill below line','Vulling onder lijn'],fill_opacity:['Fill opacity','Dekking vulling'],fill_fade:['Fade fill','Vulling vervagen'],show_hover_line:['Show hover guide','Aanwijslijn tonen'],gradient_mode:['Color transitions','Kleurovergang'],gradient_stops:['Color stops','Kleurovergangen'],stop_value:['Sensor value','Sensorwaarde'],stop_color:['Color','Kleur'],solid:['Solid','Doorgetrokken'],dashed:['Dashed','Gestreept'],dotted:['Dotted','Gestippeld'],smooth:['Smooth gradient','Vloeiende gradiënt'],steps:['Hard transitions','Harde overgangen'],
 fill_color:['Fixed fill color','Vaste vulkleur'],fill_colorHelper:['Optional. Empty follows the line color or gradient.','Optioneel. Leeg volgt de lijnkleur of gradiënt.'],
 hours_to_showHelper:translations.hoursHelper,
 line_styleHelper:['Empty preserves the distinct default styles per sensor.','Leeg behoudt de verschillende standaard lijnstijlen per sensor.'],
 line_colorHelper:['Optional. Empty preserves sensor colors. Color stops take priority.','Optioneel. Leeg behoudt sensorkleuren. Kleurovergangen hebben voorrang.'],
 gradient_stopsHelper:['Add 2–32 distinct sensor values and colors. Values use the sensor unit, not percentages. Empty disables the gradient.','Voeg 2–32 unieke sensorwaarden met kleuren toe. Waarden gebruiken de sensoreenheid, geen percentages. Leeg schakelt de gradiënt uit.'],
 fill_fadeHelper:['Fades the fill towards the bottom of the graph.','Laat de vulling naar de onderkant van de grafiek vervagen.']
});
Object.assign(translations,{
 graph_settings:['Graph','Grafiek'],show_legend:['Show legend','Legenda tonen'],data_processing:['Data processing','Dataverwerking'],series_line:['Line','Lijn'],series_fill:['Fill','Vulling'],
 visible:['Show by default','Standaard tonen'],visibleHelper:['Initial visibility. Click the sensor in the legend to show or hide it temporarily.','Beginweergave. Klik op de sensor in de legenda om deze tijdelijk te tonen of verbergen.'],show_sensor:['Show','Toon'],hide_sensor:['Hide','Verberg'],no_visible:['All sensors are hidden. Enable a sensor in the legend.','Alle sensoren zijn verborgen. Zet een sensor aan via de legenda.'],
 color_mode:['Line color','Lijnkleur'],color_fixed:['Fixed color','Vaste kleur'],color_gradient:['Color stops','Kleurovergangen'],color:['Line color','Lijnkleur'],
 fill_mode:['Fill color','Vulkleur'],fill_line:['Follow line','Volg lijn'],fill_own:['Own color','Eigen kleur'],
 add_sensor:['Add sensor','Sensor toevoegen'],new_sensor:['New sensor','Nieuwe sensor'],add_sensorHelper:['Add a sensor to configure its name, line and fill.','Voeg een sensor toe om naam, lijn en vulling in te stellen.'],
 sensor_up:['Move up','Omhoog'],sensor_down:['Move down','Omlaag'],sensor_remove:['Remove','Verwijderen'],
 color_modeHelper:['Choose a fixed color or color stops based on measured values.','Kies een vaste kleur of kleurovergangen op basis van meetwaarden.'],
 fill_modeHelper:['Follow line uses this sensor’s line color, including its gradient. Own color changes only the fill.','Volg lijn gebruikt de lijnkleur van deze sensor, inclusief de gradiënt. Eigen kleur verandert alleen de vulling.'],
 gradient_stopsHelper:['Set 2–32 distinct values in the sensor unit, not percentages. Adjust the initial values to your sensor range.','Stel 2–32 unieke waarden in de sensoreenheid in, geen percentages. Pas de beginwaarden aan op het bereik van je sensor.'],
 line_styleHelper:['Only changes this sensor’s line.','Verandert alleen de lijn van deze sensor.'],fill_colorHelper:['Only used when Own color is selected.','Alleen gebruikt wanneer Eigen kleur is gekozen.']
});
Object.assign(translations,{
 line_style_source:['Line appearance','Lijnopmaak'],line_style_own:['Own appearance','Eigen opmaak'],line_style_follow:['Follow','Volg'],
 line_style_sourceHelper:['Follow another sensor’s width, line style and interpolation. Color and fill remain independent. Own appearance detaches with the current settings.','Volg dikte, lijnstijl en lijnverloop van een andere sensor. Kleur en vulling blijven eigen. Eigen opmaak neemt de huidige instellingen mee.'],
 line_style_source_error:['Invalid line appearance source: choose another sensor on this card, without circular links.','Ongeldige bron voor lijnopmaak: kies een andere sensor op deze kaart, zonder kringverwijzingen.']
});
translations.config=['Invalid configuration: check sensors, hours, Y-axis bounds, appearance and color stops.','Ongeldige configuratie: controleer sensoren, uren, Y-asgrenzen, lijnopties en kleurovergangen.'];
function language(hass){return String(hass?.locale?.language??hass?.language??'en').toLowerCase().startsWith('nl')?'nl':'en';}
function text(key,lang){return translations[key]?.[lang==='nl'?1:0]??key;}
function number(value,lang,axis=false){
 const small=value!==0&&Math.abs(value)<0.01;
 return new Intl.NumberFormat(lang==='nl'?'nl-NL':'en-GB',{
  ...(axis?{maximumSignificantDigits:15}:small?{maximumSignificantDigits:4}:{maximumFractionDigits:2}),
  ...(value!==0&&(Math.abs(value)<0.0001||axis&&Math.abs(value)>=1e6)?{notation:'scientific'}:{})
 }).format(Object.is(value,-0)?0:value);
}
function time(value,lang,timeZone,full=false){return new Intl.DateTimeFormat(lang==='nl'?'nl-NL':'en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',...(full?{day:'numeric',month:'short'}:{})}).format(new Date(value));}
function escapeHtml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function frontendHass(){return globalThis.document?.querySelector('home-assistant')?.hass;}

// ../history-graph-card/src/eleven.js
// One playful flyby, then gone until tomorrow.
const ELF_FLIGHT_MS=4200;
function elevenDay(date=new Date(),zone){
 try{return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}catch{return date.toDateString();}
}
function isElevenMinute(date=new Date(),zone){
 let parts;
 try{parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);}catch{parts=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);}
 return parts.find(p=>p.type==='hour')?.value==='11'&&parts.find(p=>p.type==='minute')?.value==='11';
}
function elevenMarkup(elapsed=0){return `<span class="eleven-elf" aria-hidden="true" style="animation-delay:-${elapsed}ms"><svg viewBox="0 0 64 56" width="48" height="42" fill="none"><g class="elf-wings" stroke="#7dd3fc" stroke-width=".8"><path d="M30 30C9 27 8 5 18 8c8 2 13 15 12 22Z" fill="#e0f2fe" fill-opacity=".85"/><path d="M35 31C35 17 46 4 51 11c5 8-4 19-16 20Z" fill="#f0e7ff" fill-opacity=".8"/><path d="M29 30C9 26 11 42 20 40l9-10ZM36 31c18-8 19 8 10 10Z" fill="#bae6fd" fill-opacity=".65"/><g class="elf-wing-veins" stroke="#ffffff" stroke-opacity=".9" stroke-width=".7"><path d="M29 29 17 12m18 17 13-15M28 32l-11 5m20-4 9 4"/></g></g><g stroke-linecap="round" stroke-linejoin="round"><path d="m28 36-8 9 7 1m8-10 7 8 7-3" stroke="#1e40af" stroke-width="4"/><path d="m20 44-4 3 10 1m17-5 5-4 3 2" stroke="#fbbf24" stroke-width="2"/><path d="M24 36q1-13 8-13t10 13l-7 3-5-3-4 3Z" fill="#2563eb" stroke="#1e40af" stroke-width=".7"/><path d="m27 33 11 1" stroke="#fbbf24" stroke-width="2"/><path d="m25 28-6 5-4-3m24-1 8-6" stroke="#ffd7b5" stroke-width="3"/><path d="m24 20-8-5 4 10m21-5 7-4-4 10" fill="#ffc99f" stroke="#dd996f" stroke-width=".6"/><ellipse cx="32" cy="22" rx="10" ry="9" fill="#ffdfbf"/><path d="M22 20q-1-13 11-13 9 0 9 13l-4-5-3 3-3-3-4 4-2-2Z" fill="#b9652a"/><path d="M21 16Q24 1 40 5l5 5-7-1 3 8Q31 13 21 18Z" fill="#2563eb" stroke="#1e40af" stroke-width=".7"/><path d="M23 17q9-4 17 0" stroke="#fbbf24" stroke-width="2.5"/><circle cx="45" cy="10" r="2.3" fill="#fbbf24"/><circle cx="28" cy="22" r="1.1" fill="#302337"/><path d="m35 22 3-1m-9 6q4 3 7-1" stroke="#793c31" stroke-width="1.3"/><ellipse cx="25" cy="25" rx="2" ry="1" fill="#fb7185" fill-opacity=".6"/><ellipse cx="39" cy="24" rx="1.7" ry="1" fill="#fb7185" fill-opacity=".6"/><path d="m46 24 6-11" stroke="#c48b36" stroke-width="1.4"/></g><g class="elf-sparkles" fill="#fbbf24"><path d="m53 8 1.2 3.8L58 13l-3.8 1.2L53 18l-1.2-3.8L48 13l3.8-1.2Z"/><path d="m9 28 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/><circle cx="5" cy="41" r="1.2"/><circle cx="14" cy="23" r=".9"/></g></svg></span>`;}
function elevenStyles(){return `.eleven-elf{position:absolute;left:0;top:6px;width:48px;height:42px;opacity:0;pointer-events:none;z-index:2;animation:eleven-flyby 4200ms linear both}.eleven-elf svg{display:block}.elf-wings{transform-origin:32px 28px;animation:eleven-flutter .16s ease-in-out infinite alternate}@keyframes eleven-flyby{0%{left:0;transform:translateX(-110%) translateY(8px) rotate(12deg);opacity:0}10%{opacity:.9}30%{transform:translateX(-30%) translateY(-5px) rotate(-8deg)}60%{transform:translateX(-60%) translateY(9px) rotate(8deg);opacity:.9}90%{opacity:.9}100%{left:100%;transform:translateX(10%) translateY(-9px) rotate(-12deg);opacity:0}}@keyframes eleven-flutter{from{transform:scaleX(.7)}to{transform:scaleX(1.1)}}@media(prefers-reduced-motion:reduce){.eleven-elf{animation:none;left:auto;right:10px;opacity:.85}.elf-wings{animation:none}}`;}

// ../history-graph-card/src/library.js
// Shared browser API for Eleven Cards; only connected cards are retained.
const ELEVEN_VERSION='0.3.1-local';
const elevenLibrary=window.elevenCards??={};
const elevenPreviews=elevenLibrary._elfPreviews??=new Set();
elevenLibrary.debug??={};
elevenLibrary.debug.elf=()=>{for(const preview of elevenPreviews)preview();return elevenPreviews.size;};
if(!elevenLibrary._announced){
 console.log(`%c Eleven Cards %c v${ELEVEN_VERSION} `,'background:#20252b;color:#ffffff;padding:5px 10px;border-bottom:3px solid #607d94;border-radius:5px 0 0 5px;font-weight:bold','background:#343b43;color:#e5e7eb;padding:5px 10px;border-bottom:3px solid #607d94;border-radius:0 5px 5px 0;font-weight:bold');
 elevenLibrary._announced=true;
}
function registerElfPreview(callback){elevenPreviews.add(callback);}
function unregisterElfPreview(callback){elevenPreviews.delete(callback);}

// ../history-graph-card/src/history-graph-card.js
const COLORS=['#2196f3','#e78a14','#ab70d9','#26a69a','#e66b91','#718cc2','#a18d3a','#718d78'];
const REFRESH_MS=60000;
// Native controls, with one independently owned appearance form per sensor.
class HistoryGraphEditor extends HTMLElement {
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
class HistoryGraphCard extends HTMLElement {
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

// src/bar-chart.js

class BarGraph extends SharedGraph {
 render(host,spec){return super.render(host,{...spec,lines:spec.lines.map(p=>({...p,className:'series-bar'}))});}
}

const defaults=config=>({aggregation_period:'hour',aggregation_method:'avg',...config});
const local=(en,nl)=>language(frontendHass())==='nl'?nl:en;
// Sum original bar values, never cumulative stack heights or prorated bins.
function deltaBarTotals(series,items,{start,end,viewStart=start,viewEnd=end,period,zone='UTC'}){
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
class BarChartEditor extends HistoryGraphEditor {
 static get cardClass(){return BarChartCard;}
 _editorConfig(config){return editorConfig(defaults(config));}
 _bind(form,definition,data){
  if(form===this._form&&data.aggregation_period==='none')definition={...definition,schema:definition.schema.map(group=>group.name==='data_processing'?{...group,schema:group.schema.filter(field=>field.name!=='aggregation_method')}:group)};
  super._bind(form,definition,data);
 }
 _emit(){this._render();super._emit();}
}
class BarChartCard extends HistoryGraphCard {
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

})();
