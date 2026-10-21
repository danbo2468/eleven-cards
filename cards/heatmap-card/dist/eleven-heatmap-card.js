// Eleven Heatmap (beta) 0.3.0 — self-contained standalone module
(()=>{
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



const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function numeric(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim()))) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function heatmapRgb(color) {
  if(typeof color==='string' && /^#[\da-f]{6}$/i.test(color))return [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  return Array.isArray(color) && color.length===3 && [...color].every(n=>Number.isInteger(n) && n>=0 && n<=255)?[...color]:null;
}

function normalizeConfig(input = {}, {draft = false} = {}) {
  const c = {...input,...timeframeSyncConfig(input,{draft}), type:'custom:eleven-heatmap-card', title:input.title ?? 'Heatmap',
    entity:input.entity ?? '', name:String(input.name ?? ''), hours_to_show:input.hours_to_show ?? 672,
    mode:input.mode ?? 'average', aggregation_period:input.aggregation_period??'hour', show_navigation:input.show_navigation !== false,
    show_title:input.show_title!==false,show_legend:input.show_legend!==false,show_labels:input.show_labels!==false,
    cell_width:input.cell_width??24,cell_height:input.cell_height??24,cell_gap:input.cell_gap??2,border_radius:input.border_radius??3,max_height:input.max_height??800,
    color_mode:input.color_mode??(input.gradient_stops?.length?'gradient':'scale'),gradient_mode:input.gradient_mode??'smooth',
    low_color:input.low_color ?? '#dbeafe', high_color:input.high_color ?? '#1d4ed8'};
  // Native number selectors emit undefined while their input is cleared.
  // Distinguish that draft from a missing field in a new configuration.
  if(draft)for(const key of ['hours_to_show','cell_width','cell_height','cell_gap','border_radius','max_height']){
    if(Object.hasOwn(input,key) && input[key]===undefined)c[key]=undefined;
  }
  if (!draft && !/^sensor\.[a-z0-9_]+$/.test(c.entity)) throw Error('Select one sensor. / Kies één sensor.');
  if (!draft && (!Number.isFinite(c.hours_to_show) || c.hours_to_show < 1 || c.hours_to_show > 8760)) throw Error('Period must be 1–8760 hours. / Periode moet 1–8760 uur zijn.');
  if (!draft && !['average','consumption'].includes(c.mode)) throw Error('Mode must be average or consumption. / Kies gemiddelde of verbruik.');
  if (!draft && !['hour','day','week','month'].includes(c.aggregation_period)) throw Error('Choose hour, day, week or month. / Kies uur, dag, week of maand.');
  for (const key of ['scale_min','scale_max']) {
    if (c[key] == null || c[key] === '') delete c[key];
    else if (numeric(c[key]) != null) c[key] = numeric(c[key]);
    else if(!draft)throw Error('Color bounds must be numbers. / Kleurgrenzen moeten getallen zijn.');
  }
  if (!draft && c.scale_min != null && c.scale_max != null && c.scale_min >= c.scale_max) throw Error('Minimum must be below maximum. / Minimum moet kleiner zijn dan maximum.');
  for (const key of ['low_color','high_color']) {
    const color=c[key];
    const rgb=heatmapRgb(color);
    if(rgb)c[key]=rgb;
    else if(!draft)throw Error('Use RGB colors or six-digit hex colors. / Gebruik RGB-kleuren of hexkleuren met zes cijfers.');
  }
  for(const [key,min,max] of [['cell_width',6,64],['cell_height',16,64],['cell_gap',0,8],['border_radius',0,16],['max_height',100,2000]]){
    if(!draft && (!Number.isInteger(c[key]) || c[key]<min || c[key]>max))throw Error(`${key}: ${min}–${max} px.`);
  }
  if(!draft && !['scale','gradient'].includes(c.color_mode))throw Error('Choose a color scale or color stops. / Kies een kleurschaal of kleurovergangen.');
  if(!draft && !['smooth','steps'].includes(c.gradient_mode))throw Error('Choose smooth or hard transitions. / Kies vloeiende of harde overgangen.');
  const stops=input.gradient_stops??[];
  if(!draft && (!Array.isArray(stops) || (stops.length>0 && stops.length<2) || stops.length>32 ||
    [...stops].some(s=>!s || !Number.isFinite(s.value) || !heatmapRgb(s.color)) || new Set(stops.map(s=>s.value)).size!==stops.length ||
    (c.color_mode==='gradient' && stops.length<2)))throw Error('Set 2–32 distinct sensor values and colors. / Stel 2–32 unieke sensorwaarden met kleuren in.');
  c.gradient_stops=Array.isArray(stops)?stops.map(s=>({...s,color:heatmapRgb(s?.color)??s?.color})):stops;
  if(!draft)c.gradient_stops.sort((a,b)=>a.value-b.value);
  return c;
}

const time = value => typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);

async function loadHeatmapData(hass, config, start, end) {
  const id = config.entity, unit = hass.states?.[id]?.attributes?.unit_of_measurement ?? '';
  let statisticsFailed = false;
  try {
    const metadata = await hass.callWS({type:'recorder/get_statistics_metadata', statistic_ids:[id]});
    const meta = metadata.find(row => row.statistic_id === id);
    const supported = config.mode === 'consumption' ? meta?.has_sum === true : meta?.mean_type!=null ? meta.mean_type===1 : meta?.has_mean===true;
    // Recorder returns statistics converted to its display unit, which can
    // differ from the unit stored in the database (for example Wh versus kWh).
    const statisticsUnit=meta && Object.hasOwn(meta,'display_unit_of_measurement') ? meta.display_unit_of_measurement ?? '' : meta?.statistics_unit_of_measurement ?? meta?.unit_of_measurement ?? '';
    if (!supported || statisticsUnit !== unit) throw Error('statistics_unavailable');
    const field = config.mode === 'consumption' ? 'change' : 'mean';
    // The API filters by interval start. Include the boundary hour so rolling
    // periods retain its complete summary and can mark it as clipped below.
    const statisticsStart=Math.floor(start/3600000)*3600000;
    const result = await hass.callWS({type:'recorder/statistics_during_period', statistic_ids:[id], start_time:new Date(statisticsStart).toISOString(), end_time:new Date(end).toISOString(), period:'hour', types:[field]});
    // Recorder returns {} when a supported sensor has no rows in this period.
    const records=result && typeof result==='object' && !Array.isArray(result) && !Object.keys(result).length ? [] : result?.[id];
    if (!Array.isArray(records)) throw Error('statistics_load_failed');
    const intervals = records.map(row => ({start:time(row.start), end:time(row.end), value:typeof row[field] === 'number' ? numeric(row[field]) : null}))
      .filter(row => Number.isFinite(row.start) && Number.isFinite(row.end) && row.end > row.start && row.start < end && row.end > start)
      .sort((a,b) => a.start-b.start);
    if (intervals.some(row => row.value != null) || config.mode === 'consumption') return {source:'statistics', unit, intervals};
  } catch (error) {
    statisticsFailed = true;
    if(config.mode==='consumption' && error.message!=='statistics_unavailable')throw Error('statistics_load_failed');
  }
  if (config.mode === 'consumption') throw Error('consumption_statistics_required');
  const url = `history/period/${new Date(start).toISOString()}?filter_entity_id=${encodeURIComponent(id)}&end_time=${encodeURIComponent(new Date(end).toISOString())}&significant_changes_only=0`;
  const response = await hass.callApi('GET', url);
  if (!Array.isArray(response) || response.some(rows => !Array.isArray(rows))) throw Error('history_unavailable');
  const rows = (response.find(rows => rows[0]?.entity_id === id) ?? []).map(row => ({t:Date.parse(row.last_updated ?? row.last_changed), value:(row.attributes?.unit_of_measurement ?? '') === unit ? numeric(row.state) : null}))
    .filter(row => Number.isFinite(row.t) && row.t <= end).sort((a,b) => a.t-b.t);
  const intervals = rows.map((row,i) => ({start:Math.max(start,row.t), end:Math.min(end,rows[i+1]?.t ?? end), value:row.value})).filter(row => row.end > row.start);
  return {source:'history', unit, intervals, statisticsFailed};
}

// Split on local clock hours AND offset transitions (including half-hour DST).
// Repeated hours share a cell; their real intervals remain available in details.
function clockGrid(start, end, zone = 'UTC') {
  const formatter = new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const parts = t => Object.fromEntries(formatter.formatToParts(t).filter(p => p.type !== 'literal').map(p => [p.type,Number(p.value)]));
  const offset = t => {const p=parts(t); return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-Math.floor(t/1000)*1000;};
  const rows = new Map();
  for (let t=start; t<end;) {
    const p=parts(t), key=`${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
    if (!rows.has(key)) rows.set(key,{key, timestamp:t, cells:Array.from({length:24},(_,hour)=>({key:`${key}/${hour}`,hour,intervals:[],value:null,coverage:0,partial:false,records:[]}))});
    let next=Math.min(end,t+3600000-p.minute*60000-p.second*1000-(t%1000));
    const currentOffset=offset(t);
    if (offset(next-1)!==currentOffset) {
      let a=t,b=next;
      while (b-a>1) {const mid=Math.floor((a+b)/2); if(offset(mid)===currentOffset)a=mid;else b=mid;}
      next=b;
    }
    rows.get(key).cells[p.hour].intervals.push({start:t,end:next});
    t=next;
  }
  return [...rows.values()];
}

function heatmapColumns(period='hour',locale='en-GB') {
  if(period==='day')return Array.from({length:7},(_,i)=>new Intl.DateTimeFormat(locale,{timeZone:'UTC',weekday:'short'}).format(Date.UTC(2026,0,5+i)));
  if(period==='week')return Array.from({length:53},(_,i)=>`W${String(i+1).padStart(2,'0')}`);
  if(period==='month')return Array.from({length:12},(_,i)=>new Intl.DateTimeFormat(locale,{timeZone:'UTC',month:'short'}).format(Date.UTC(2026,i,15)));
  return Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));
}

function calendarPlacement(t,period,zone,parts) {
  const [a,b]=graphPeriodBounds(t,period,zone),p=parts(a);
  if(period==='day'){
    const monday=graphPeriodBounds(a,'week',zone)[0],m=parts(monday);
    return {a,b,rowKey:`${m.year}-${String(m.month).padStart(2,'0')}-${String(m.day).padStart(2,'0')}`,timestamp:monday,column:(new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay()+6)%7};
  }
  if(period==='month')return {a,b,rowKey:String(p.year),timestamp:a,column:p.month-1};
  // ISO weeks belong to the year of their Thursday, including December/January.
  const monday=Date.UTC(p.year,p.month-1,p.day),year=new Date(monday+3*86400000).getUTCFullYear(),jan4=Date.UTC(year,0,4);
  const firstMonday=jan4-((new Date(jan4).getUTCDay()+6)%7)*86400000;
  return {a,b,rowKey:String(year),timestamp:a,column:Math.round((monday-firstMonday)/(7*86400000))};
}

function calendarGrid(start,end,zone='UTC',period='day') {
  const format=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  const parts=t=>Object.fromEntries(format.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const rows=new Map(),count={day:7,week:53,month:12}[period];
  for(let t=start;t<end;){
    const placement=calendarPlacement(t,period,zone,parts),{a,b,rowKey,timestamp,column}=placement;
    if(!rows.has(rowKey))rows.set(rowKey,{key:rowKey,timestamp,cells:Array.from({length:count},(_,column)=>({key:`${rowKey}/${column}`,rowKey,column,period,intervals:[],value:null,coverage:0,partial:false,records:[]}))});
    const cell=rows.get(rowKey).cells[column];
    cell.timestamp=a;cell.periodEnd=b;cell.clipped=a<start || b>end;
    cell.intervals.push({start:Math.max(start,a),end:Math.min(end,b)});
    t=b;
  }
  return [...rows.values()];
}

function buildHeatmap(data, start, end, zone='UTC', mode='average', period='hour') {
  const rows=period==='hour'?clockGrid(start,end,zone):calendarGrid(start,end,zone,period), cells=rows.flatMap(row=>row.cells);
  if (data.source === 'statistics') {
    // Never invent sub-hour consumption by prorating Recorder summaries.
    // Each summary belongs to the local grouping period in which it starts.
    const format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
    const parts=t=>Object.fromEntries(format.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    const byKey=new Map(cells.map(cell=>[cell.key,cell]));
    for (const record of data.intervals) {
      if(record.start>=end || record.end<=start || record.value==null)continue;
      const p=parts(record.start),placement=period==='hour'?null:calendarPlacement(record.start,period,zone,parts);
      const cell=byKey.get(placement?`${placement.rowKey}/${placement.column}`:`${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}/${p.hour}`);
      if (!cell || !cell.intervals.length) continue;
      cell.records.push(record);
      const duration=record.end-record.start;
      cell.value=(cell.value??0)+(mode==='consumption'?record.value:record.value*duration);
      cell.coverage+=duration;
      cell.partial ||= record.start<start || record.end>end;
    }
  } else {
    let index=0;
    for (const row of rows) {
      // On a repeated hour, process by absolute time, not column order.
      const spans=row.cells.flatMap(cell=>cell.intervals.map(interval=>({...interval,cell}))).sort((a,b)=>a.start-b.start);
      for (const {start:a,end:b,cell} of spans) {
        while(index<data.intervals.length && data.intervals[index].end<=a)index++;
        for(let i=index;i<data.intervals.length && data.intervals[i].start<b;i++) {
          const record=data.intervals[i],duration=Math.min(b,record.end)-Math.max(a,record.start);
          if(duration<=0 || record.value==null)continue;
          cell.value=(cell.value??0)+record.value*duration;
          cell.coverage+=duration;
        }
      }
    }
  }
  for (const cell of cells) {
    if(cell.value!=null && mode==='average') cell.value/=cell.coverage;
    const expected=cell.intervals.reduce((sum,r)=>sum+r.end-r.start,0);
    cell.partial ||= cell.value!=null && cell.coverage<expected-1;
    if(cell.clipped || (period==='hour' && data.source==='history' && expected>0 && expected%3600000!==0)) cell.partial ||= cell.value!=null;
  }
  return rows;
}

function colorScale(rows, config) {
  const custom=config.color_mode==='gradient',stops=config.gradient_stops;
  if(custom){
    const min=stops[0].value,max=stops.at(-1).value;
    const color=value=>{
      if(value<=min)return `rgb(${stops[0].color.join(',')})`;
      for(let i=1;i<stops.length;i++)if(value<stops[i].value){
        const a=stops[i-1],b=stops[i],ratio=config.gradient_mode==='steps'?0:(value-a.value)/(b.value-a.value);
        return `rgb(${a.color.map((n,j)=>Math.round(n+(b.color[j]-n)*ratio)).join(',')})`;
      }
      return `rgb(${stops.at(-1).color.join(',')})`;
    };
    const positions=[];
    for(let i=0;i<stops.length;i++){
      const percent=(stops[i].value-min)/(max-min)*100;
      if(config.gradient_mode==='steps' && i)positions.push(`rgb(${stops[i-1].color.join(',')}) ${percent}%`);
      positions.push(`rgb(${stops[i].color.join(',')}) ${percent}%`);
    }
    return {min,max,color,gradient:`linear-gradient(90deg,${positions.join(',')})`};
  }
  const values=rows.flatMap(row=>row.cells).map(cell=>cell.value).filter(value=>value!=null);
  let min=config.scale_min ?? (values.length?Math.min(...values):0), max=config.scale_max ?? (values.length?Math.max(...values):1);
  if(config.scale_min!=null && max<min)max=min;
  if(config.scale_max!=null && min>max)min=max;
  return {min,max,gradient:`linear-gradient(90deg,rgb(${config.low_color.join(',')}),rgb(${config.high_color.join(',')}))`,color(value){
    const ratio=max===min?(value<min?0:value>max?1:0.5):Math.max(0,Math.min(1,(value-min)/(max-min)));
    const a=config.low_color,b=config.high_color;
    return `rgb(${a.map((n,i)=>Math.round(n+(b[i]-n)*ratio)).join(',')})`;
  }};
}

// Summaries describe the displayed cells, like the Bar Chart information popup.
function summarizeHeatmap(rows, mode) {
  const cells=rows.flatMap(row=>row.cells),known=cells.filter(cell=>Number.isFinite(cell.value));
  const values=known.map(cell=>cell.value),sum=values.reduce((total,value)=>total+value,0);
  return {minimum:values.length?Math.min(...values):null,maximum:values.length?Math.max(...values):null,
    average:values.length?sum/values.length:null,count:values.length,
    missing:cells.some(cell=>cell.partial || (cell.intervals.length && cell.value==null)),
    ...(mode==='consumption'?{total:values.length?sum:null}:{})};
}









const esc=escapeHtml;
const isDutch=hass=>String(hass?.locale?.language ?? hass?.language ?? 'en').startsWith('nl');
const labels={sync_timeframe:['Tijdvak synchroniseren','Synchronize timeframe'],hover_sync_group:['Synchronisatiegroep','Synchronization group'],
  title:['Titel','Title'],entity:['Sensor','Sensor'],name:['Sensornaam','Sensor name'],hours_to_show:['Aantal uren','Hours to show'],mode:['Waarde per tijdvak','Value per interval'],aggregation_period:['Aggregatieperiode','Aggregation period'],
  show_title:['Titel tonen','Show title'],show_legend:['Legenda tonen','Show legend'],show_labels:['Rij- en kolomlabels tonen','Show row and column labels'],show_navigation:['Tijdvakselectie tonen','Show timeframe selection'],
  graph_settings:['Grafiek','Graph'],data_processing:['Dataverwerking','Data processing'],color_settings:['Kleuren','Colors'],matrix_settings:['Rasteropmaak','Grid appearance'],
  scale_min:['Minimum kleurschaal','Color scale minimum'],scale_max:['Maximum kleurschaal','Color scale maximum'],
  low_color:['Kleur lage waarden','Low value color'],high_color:['Kleur hoge waarden','High value color'],
  color_mode:['Kleurmodus','Color mode'],gradient_mode:['Kleurovergang','Color transitions'],gradient_stops:['Kleurovergangen','Color stops'],
  cell_width:['Minimale vakbreedte','Minimum cell width'],cell_height:['Vakhoogte','Cell height'],cell_gap:['Tussenruimte','Cell gap'],border_radius:['Hoekafronding','Border radius'],max_height:['Maximale rasterhoogte','Maximum grid height']
};
const helpers={sync_timeframe:['Deelt tijdvakkeuze en vorige/volgende/Nu met ingeschakelde kaarten in dezelfde groep.','Shares timeframe selection and previous/next/Now with enabled cards in the same group.'],hover_sync_group:['Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.','Cards with the same group share hover and timeframe when the corresponding synchronization is enabled. Empty uses the default group.'],
  hours_to_show:['Standaardperiode: 1–8760 uur. De tijdvakselectie kan deze tijdelijk wijzigen.','Default range: 1–8760 hours. The timeframe menu can change it temporarily.'],
  mode:['Gemiddelde weegt waarden naar hun duur. Verbruik telt de uurwijzigingen uit tellerstatistieken op, inclusief tellerresets.','Average weights values by their duration. Consumption sums hourly counter changes from statistics, including counter resets.'],
  aggregation_period:['Uren per dag, dagen per week, weken per ISO-jaar of maanden per jaar. Kalendergrenzen volgen de Home Assistant-tijdzone; weken beginnen op maandag.','Hours per day, days per week, weeks per ISO year or months per year. Calendar boundaries follow the Home Assistant timezone; weeks start on Monday.'],
  scale_min:['Optioneel, in de sensoreenheid. Leeg schaalt automatisch.','Optional, in the sensor unit. Empty scales automatically.'],
  scale_max:['Optioneel, in de sensoreenheid. Moet hoger zijn dan het minimum.','Optional, in the sensor unit. Must exceed the minimum.'],
  color_mode:['De kleurschaal volgt het waardenbereik. Kleurovergangen gebruiken vaste sensorwaarden en blijven tussen perioden vergelijkbaar.','The color scale follows the value range. Color stops use fixed sensor values and remain comparable across periods.'],
  gradient_stops:['Stel 2–32 unieke waarden in de sensoreenheid in, geen percentages. Pas de beginwaarden aan je sensor aan.','Set 2–32 distinct values in the sensor unit, not percentages. Adjust the initial values to your sensor.'],
  cell_width:['Minimale breedte in pixels. Kleinere vakken en minder tussenruimte passen meer kolommen op smalle kaarten.','Minimum width in pixels. Smaller cells and gaps fit more columns on narrow cards.'],
  max_height:['Grotere rasters scrollen binnen de kaart.','Larger grids scroll within the card.']
};

class HeatmapEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});}
  setConfig(config){this._config=normalizeConfig(config,{draft:true});this._render();}
  set hass(hass){this._hass=hass;this._render();}
  get hass(){return this._hass;}
  connectedCallback(){this._render();}
  _render(){
    if(!this._config || !this._hass)return;
    if(!this._form){
      this.shadowRoot.innerHTML='<style>:host{display:block;min-width:0}ha-form{display:block;min-width:0}.error{color:var(--error-color,#db4437);font-size:14px;overflow-wrap:anywhere}.error[hidden]{display:none}</style><ha-form></ha-form><p class="error" role="alert" hidden></p>';
      this._form=this.shadowRoot.querySelector('ha-form');
      this._form.addEventListener('value-changed',event=>{
        event.stopPropagation();
        const next={...this._config,...event.detail.value};
        if(next.color_mode==='gradient' && this._config.color_mode!=='gradient' && !next.gradient_stops?.length){
          const low=numeric(next.scale_min)??((numeric(next.scale_max)??1)-1),upper=numeric(next.scale_max),high=upper!=null&&upper>low?upper:low+1;
          next.gradient_stops=[{value:low,color:[...this._config.low_color]},{value:high,color:[...this._config.high_color]}];
        }
        // Preserve incomplete edits. Runtime validation protects the card while
        // the native form retains its focus, expansion state and entered values.
        this._config=normalizeConfig(next,{draft:true});
        this._render();
        this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...this._config}},bubbles:true,composed:true}));
      });
    }
    const dutch=isDutch(this._hass),definition=HeatmapCard.getConfigForm(this._config,dutch);
    this._form.hass=this._hass;
    this._form.data=this._config;
    this._form.schema=definition.schema;
    this._form.computeLabel=s=>definition.computeLabel.call(this,s);
    this._form.computeHelper=s=>definition.computeHelper.call(this,s);
    const error=this.shadowRoot.querySelector('.error');
    try{if(this._config.entity)normalizeConfig(this._config);error.hidden=true;error.textContent='';}
    catch(problem){error.textContent=problem.message.split(' / ')[dutch?1:0]??problem.message;error.hidden=false;}
  }
}

class HeatmapCard extends HTMLElement {
  constructor(){
    super();this.attachShadow({mode:'open'});
    this._generation=0;this._connected=false;this._status='loading';this._data=null;this._rows=[];this._timer=null;this._promise=null;
  }
  static getConfigForm(config={},dutch=isDutch(globalThis.document?.querySelector('home-assistant')?.hass)){
    const data=normalizeConfig(config,{draft:true}),label=key=>labels[key]?.[dutch?0:1]??key;
    const select=options=>({select:{mode:'dropdown',options:options.map(([value,nl,en])=>({value,label:dutch?nl:en}))}});
    const group=(name,schema,expanded=false)=>({type:'expandable',name,title:label(name),flatten:true,expanded,schema});
    const number=(name,min,max)=>({name,default:{cell_width:24,cell_height:24,cell_gap:2,border_radius:3,max_height:800}[name],selector:{number:{min,max,step:1,mode:'box',unit_of_measurement:'px'}}});
    const stops={object:{multiple:true,label_field:'value',fields:{
      value:{label:dutch?'Sensorwaarde':'Sensor value',required:true,selector:{number:{step:'any',mode:'box'}}},
      color:{label:dutch?'Kleur':'Color',required:true,selector:{color_rgb:{}}}
    }}};
    return {schema:[
      {name:'entity',required:true,selector:{entity:{domain:'sensor'}}},
      {name:'name',selector:{text:{}}},
      {name:'title',selector:{text:{}}},
      {name:'show_title',default:true,selector:{boolean:{}}},
      {name:'hours_to_show',default:672,selector:{number:{min:1,max:8760,step:1,mode:'box'}}},
      group('graph_settings',[...['show_legend','show_navigation','show_labels'].map(name=>({name,default:true,selector:{boolean:{}}})),{name:'sync_timeframe',default:false,selector:{boolean:{}}},{name:'hover_sync_group',selector:{text:{}}}]),
      group('data_processing',[
        {name:'aggregation_period',default:'hour',selector:select([['hour','Uur','Hour'],['day','Dag','Day'],['week','Week (maandag)','Week (Monday)'],['month','Maand','Month']])},
        {name:'mode',default:'average',selector:select([['average','Gemiddelde','Average'],['consumption','Verbruik','Consumption']])}
      ]),
      group('color_settings',[
        {name:'color_mode',required:true,selector:select([['scale','Kleurschaal','Color scale'],['gradient','Kleurovergangen','Color stops']])},
        ...(data.color_mode==='gradient'?[
          {name:'gradient_mode',required:true,selector:select([['smooth','Vloeiende gradiënt','Smooth gradient'],['steps','Harde overgangen','Hard transitions']])},
          {name:'gradient_stops',selector:stops}
        ]:[
          {name:'scale_min',selector:{number:{step:'any',mode:'box'}}},{name:'scale_max',selector:{number:{step:'any',mode:'box'}}},
          {name:'low_color',selector:{color_rgb:{}}},{name:'high_color',selector:{color_rgb:{}}}
        ])
      ],true),
      group('matrix_settings',[number('cell_width',6,64),number('cell_height',16,64),number('cell_gap',0,8),number('border_radius',0,16),number('max_height',100,2000)])
    ],computeLabel:function(item){return labels[item?.name]?.[isDutch(this?.hass??{language:dutch?'nl':'en'})?0:1]??item?.name;},
    computeHelper:function(item){return helpers[item?.name]?.[isDutch(this?.hass??{language:dutch?'nl':'en'})?0:1];}};
  }
  static async getConfigElement(){
    if(!customElements.get('ha-form')){
      const helpers=await window.loadCardHelpers();
      const card=await helpers.createCardElement({type:'entities',entities:[]});
      await card.constructor.getConfigElement();
      await customElements.whenDefined('ha-form');
    }
    if(!customElements.get('eleven-heatmap-editor'))customElements.define('eleven-heatmap-editor',HeatmapEditor);
    return document.createElement('eleven-heatmap-editor');
  }
  static getStubConfig(hass){return {entity:Object.keys(hass?.states ?? {}).find(id=>id.startsWith('sensor.') && numeric(hass.states[id].state)!=null) ?? '',hours_to_show:672,mode:'average',aggregation_period:'hour'};}
  setConfig(config){
    if(!config?.entity){
      disconnectTimeframeSync(this);this._config=null;this._emptyConfig=true;resetGraphPeriod(this);this._invalidate();
      disconnectPeriodControls(this);disconnectChartInsights(this);this._disconnectTooltip();this._render();return;
    }
    this._emptyConfig=false;
    this._config=normalizeConfig(config);resetGraphPeriod(this);this._invalidate();connectTimeframeSync(this);this._render();if(this._connected)this._refresh();
  }
  set hass(hass){
    const previous=this._context;
    this._hass=hass;
    const state=hass?.states?.[this._config?.entity];
    this._context=JSON.stringify([hass?.config?.time_zone,state?.attributes?.unit_of_measurement,state?.attributes?.friendly_name,isDutch(hass),!!state]);
    if(previous!==this._context){
      const unit=state?.attributes?.unit_of_measurement ?? '',zone=hass?.config?.time_zone || 'UTC';
      if(this._data && (this._data.unit!==unit || this._zone!==zone))this._invalidate();
      this._render();
    }
    if(this._connected && !this._promise && this._status==='loading')this._refresh();
  }
  get hass(){return this._hass;}
  connectedCallback(){this._connected=true;connectTimeframeSync(this);this._refresh();}
  disconnectedCallback(){disconnectTimeframeSync(this);this._connected=false;this._generation++;this._promise=null;clearTimeout(this._timer);this._timer=null;disconnectPeriodControls(this);disconnectChartInsights(this);this._disconnectTooltip();this._hideTooltip();}
  getCardSize(){
    const c=this._config??{},hours=c.hours_to_show??672,period=c.aggregation_period??'hour';
    const rows=this._rows.length || Math.ceil(hours/({hour:24,day:168,week:8760,month:8760}[period]))+(period==='hour'||period==='day'?1:2);
    return Math.ceil((90+Math.min(c.max_height??800,(rows+(c.show_labels!==false?1:0))*((c.cell_height??24)+(c.cell_gap??2))))/50);
  }
  getGridOptions(){return {columns:12,min_columns:6,rows:Math.max(3,Math.ceil(this.getCardSize()*50/64)),min_rows:3};}
  _invalidate(){this._hideTooltip();this._insightOpen=null;this._insightPending=null;this._generation++;this._promise=null;this._data=null;this._rows=[];this._status='loading';this._refreshFailures=0;clearTimeout(this._timer);this._timer=null;}
  _reloadPeriod(){this._invalidate();this._render();return this._refresh();}
  _refresh(){
    if(!this._connected || !this._hass || !this._config)return Promise.resolve();
    if(this._promise)return this._promise;
    clearTimeout(this._timer);
    const generation=this._generation,hass=this._hass,config=this._config,range=graphPeriodRange(this),zone=hass.config?.time_zone || 'UTC';
    let timeout;
    const work=Promise.race([loadHeatmapData(hass,config,range.start,range.end),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('timeout')),20000);})])
      .then(data=>{
        if(!this._connected || generation!==this._generation)return;
        const currentUnit=this._hass.states?.[config.entity]?.attributes?.unit_of_measurement ?? '';
        if(data.unit!==currentUnit || zone!==(this._hass.config?.time_zone || 'UTC')){this._invalidate();return;}
        this._rows=buildHeatmap(data,range.start,range.end,zone,config.mode,config.aggregation_period);
        this._data=data;this._zone=zone;this._start=range.start;this._end=range.end;this._viewStart=range.start;this._viewEnd=range.end;
        this._status='ready';this._refreshFailures=0;
      }).catch(error=>{
        if(this._connected && generation===this._generation){this._status='error';this._error=error.message;this._refreshFailures=(this._refreshFailures??0)+1;}
      }).finally(()=>{
        clearTimeout(timeout);
        if(this._connected && generation===this._generation){
          this._promise=null;this._render();this._timer=setTimeout(()=>this._refresh(),retryDelay(this._refreshFailures??0));
        } else if(this._connected && this._status==='loading' && !this._promise)this._refresh();
      });
    this._promise=work;return work;
  }
  _number(value){const locale=isDutch(this._hass)?'nl-NL':'en-GB';if(this._numberLocale!==locale){this._numberLocale=locale;this._numberFormat=new Intl.NumberFormat(locale,{maximumFractionDigits:2});this._smallNumberFormat=new Intl.NumberFormat(locale,{maximumSignificantDigits:3});}return (Math.abs(value)>0&&Math.abs(value)<0.01?this._smallNumberFormat:this._numberFormat).format(value);}
  _cellDate(cell){
    const period=this._config.aggregation_period,locale=isDutch(this._hass)?'nl-NL':'en-GB',zone=this._zone || this._hass?.config?.time_zone || 'UTC';
    if(period==='hour')return this._dateLabels.get(cell.key.split('/')[0]);
    if(period==='week')return `Week ${cell.column+1}, ${cell.rowKey}`;
    if(period==='month')return (this._monthFormatter??=new Intl.DateTimeFormat(locale,{timeZone:zone,month:'long',year:'numeric'})).format(cell.timestamp??Date.UTC(Number(cell.rowKey),cell.column,15));
    const row=this._rowByKey?.get(cell.rowKey);
    return (this._dayFormatter??=new Intl.DateTimeFormat(locale,{timeZone:zone,weekday:'short',day:'numeric',month:'short',year:'numeric'})).format(cell.timestamp??row.timestamp+(cell.column+.5)*86400000);
  }
  _label(cell){
    const dutch=isDutch(this._hass),date=this._cellDate(cell),hour=this._config.aggregation_period==='hour'?`, ${String(cell.hour).padStart(2,'0')}:00`:'';
    return `${date}${hour} · ${cell.value==null?(dutch?'Geen gegevens':'No data'):`${this._number(cell.value)} ${this._data.unit}`}${cell.partial?(dutch?' · Onvolledig':' · Incomplete'):''}`;
  }
  _information(language){
    this._insightLanguage=language;
    const summary={rows:[{id:this._config.entity,unit:this._data?.unit,...summarizeHeatmap(this._rows,this._config.mode)}]};
    // Adapt the single sensor to the shared information popup without adding
    // internal collection fields to the card's saved configuration.
    return chartDataInformation({_config:{entities:[this._config.entity],series_options:[{entity:this._config.entity,name:this._config.name?.trim()}]},_hass:this._hass,
      _insightOpen:this._insightOpen,_status:this._status,_inFlight:!!this._promise || this._status==='loading',_loadFailed:this._status==='error',
      _lastLoad:this._data?{sources:[{id:this._config.entity,source:this._data.source}],summary}:null,
      _isSeriesVisible:()=>true,_dataInformation:()=>summary,
      _insightColor:()=>{const scale=colorScale(this._rows,this._config),average=summary.rows[0].average;return scale.color(Number.isFinite(average)?average:(scale.min+scale.max)/2);}},language);
  }
  _sensorName(){return this._config.name?.trim()||this._hass?.states?.[this._config.entity]?.attributes?.friendly_name||this._config.entity;}
  _cellBounds(cell){
    const intervals=cell.records.length?cell.records:cell.intervals;
    if(this._config.aggregation_period!=='hour'){
      if(!intervals.length)return '';
      const format=new Intl.DateTimeFormat(isDutch(this._hass)?'nl-NL':'en-GB',{timeZone:this._zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
      return `${format.format(intervals[0].start)}–${format.format(intervals.at(-1).end)}`;
    }
    const locale=isDutch(this._hass)?'nl-NL':'en-GB',options={timeZone:this._zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'};
    const offset=new Intl.DateTimeFormat(locale,{timeZone:this._zone,timeZoneName:'shortOffset'});
    const zone=t=>offset.formatToParts(t).find(part=>part.type==='timeZoneName')?.value;
    const showOffset=intervals.length>1 || intervals.some(row=>zone(row.start)!==zone(row.end));
    const clock=new Intl.DateTimeFormat(locale,{...options,...(showOffset?{timeZoneName:'shortOffset'}:{})});
    return intervals.map(row=>`${clock.format(row.start)}–${clock.format(row.end)}`).join(', ') || `${String(cell.hour).padStart(2,'0')}:00–${String(cell.hour+1).padStart(2,'0')}:00`;
  }
  _hideTooltip(){
    this._tooltipKey=null;
    const tooltip=this.shadowRoot.querySelector('.tooltip');if(tooltip)tooltip.hidden=true;
    this._tooltipButton?.removeAttribute('aria-describedby');this._tooltipButton=null;
  }
  _showTooltip(key){
    if(this._periodMenuOpen || this._insightOpen){this._hideTooltip();return;}
    const root=this.shadowRoot,cell=this._cells?.get(key),button=this._cellElements?.get(key)??[...root.querySelectorAll('[data-cell]')].find(button=>button.dataset.cell===key);
    const tooltip=root.querySelector('.tooltip'),chart=root.querySelector('.chart'),scroll=root.querySelector('.matrix-scroll');
    if(!cell || !button || !tooltip || !chart || !scroll){this._hideTooltip();return;}
    const box=chart.getBoundingClientRect(),target=button.getBoundingClientRect(),grid=scroll.getBoundingClientRect();
    const left=Math.max(box.left,8),right=Math.min(box.right,window.innerWidth-8),top=Math.max(box.top,8),bottom=Math.min(box.bottom,window.innerHeight-8);
    if(target.right<=Math.max(grid.left+(this._config.show_labels?82+this._config.cell_gap:0),left) || target.left>=Math.min(grid.right,right) || target.bottom<=Math.max(grid.top,top) || target.top>=Math.min(grid.bottom,bottom)) {this._hideTooltip();return;}
    this._tooltipKey=key;
    const dutch=isDutch(this._hass),name=this._sensorName();
    const value=cell.value==null?(dutch?'Geen gegevens':'No data'):`${this._number(cell.value)} ${this._data.unit}`;
    const date=this._cellDate(cell),bounds=this._cellBounds(cell),color=cell.value==null?'var(--divider-color,#ddd)':(this._scale??colorScale(this._rows,this._config)).color(cell.value);
    tooltip.innerHTML=`<strong>${esc(date)}${bounds?` · ${esc(bounds)}`:''}</strong><span><i style="background:${color}"></i><b class="tooltip-label">${esc(name)}: <em class="tooltip-value">${esc(value)}</em></b>${cell.partial?`<small>${dutch?'Onvolledig':'Incomplete'}</small>`:''}</span>`;
    tooltip.style.width='max-content';tooltip.style.maxWidth=`${Math.max(0,Math.min(360,right-left-8))}px`;tooltip.style.maxHeight=`${Math.max(0,bottom-top-8)}px`;
    tooltip.hidden=false;
    const measured=tooltip.getBoundingClientRect();
    let x=target.right+10;if(x+measured.width>right-4)x=target.left-measured.width-10;
    const y=target.bottom+measured.height+8<=bottom?target.bottom+8:target.top-measured.height-8;
    tooltip.style.left=`${Math.max(left+4,Math.min(x,right-measured.width-4))-box.left}px`;
    tooltip.style.top=`${Math.max(top+4,Math.min(y,bottom-measured.height-4))-box.top}px`;
    if(this._tooltipButton!==button)this._tooltipButton?.removeAttribute('aria-describedby');this._tooltipButton=button;
    button.setAttribute('aria-describedby','heatmap-tooltip');
  }
  _disconnectTooltip(){this._tooltipCleanup?.();this._tooltipCleanup=null;}
  _bindTooltip(){
    this._disconnectTooltip();
    const root=this.shadowRoot,chart=root.querySelector('.chart');if(!chart)return;
    const cleanups=[],listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
    this._tooltipCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
    const viewportChange=()=>this._hideTooltip();
    listen(window,'resize',viewportChange);
    const scroll=root.querySelector('.matrix-scroll');let scrollLeft=scroll?.scrollLeft ?? 0,scrollTop=scroll?.scrollTop ?? 0;
    const targets=new Set([window,root]);for(let node=this;node;){const tree=node.getRootNode?.();if(!tree || targets.has(tree))break;targets.add(tree);node=tree.host;}
    for(const target of targets)listen(target,'scroll',event=>{
      if(event.composedPath().includes(root.querySelector('.tooltip')))return;
      if(event.target===scroll){
        const x=scroll.scrollLeft ?? 0,y=scroll.scrollTop ?? 0;
        if(x===scrollLeft && y===scrollTop)return;
        scrollLeft=x;scrollTop=y;
      }
      viewportChange();
    },true);
    listen(document,'pointerdown',event=>{if(!event.composedPath().includes(chart))this._hideTooltip();},true);
    listen(root,'keydown',event=>{if(event.key==='Escape' && this._tooltipKey){event.preventDefault();this._hideTooltip();}});
    chart.onpointerleave=()=>this._hideTooltip();
  }
  _matrixRow(row,index){
    const c=this._config,scale=this._scale,locale=isDutch(this._hass)?'nl-NL':'en-GB';
    const fmt=this._rowFormatter??=new Intl.DateTimeFormat(locale,{timeZone:this._zone||this._hass?.config?.time_zone||'UTC',weekday:'short',day:'numeric',month:'short'});
    return `<div class="matrix-row" role="row" aria-rowindex="${index+2}"><span class="day" role="rowheader">${esc(['week','month'].includes(c.aggregation_period)?row.key:fmt.format(row.timestamp))}</span>${row.cells.map(cell=>`<div role="cell" data-cell="${cell.key}" aria-label="${esc(this._label(cell))}" class="cell ${cell.value==null?'missing':''} ${!cell.intervals.length?'outside':''} ${cell.partial?'partial':''}"${cell.value!=null?` style="background-color:${scale.color(cell.value)}"`:''}></div>`).join('')}</div>`;
  }
  _matrixWindow(scrollTop,height){
    const step=this._config.cell_height+this._config.cell_gap,offset=this._config.show_labels?step:0,first=Math.min(Math.max(0,this._rows.length-1),Math.max(0,Math.floor((scrollTop-offset)/step)-8));
    return [first,Math.min(this._rows.length,first+Math.ceil(Math.max(height||0,200)/step)+17)];
  }
  _updateMatrixWindow(){
    if(!this._virtualRows)return;
    const scroll=this.shadowRoot.querySelector('.matrix-scroll'),body=this.shadowRoot.querySelector('.matrix-body');if(!scroll||!body)return;
    const [first,last]=this._matrixWindow(scroll.scrollTop,scroll.clientHeight);
    if(this._windowRange?.[0]===first&&this._windowRange?.[1]===last)return;
    this._hideTooltip();this._windowRange=[first,last];const step=this._config.cell_height+this._config.cell_gap;
    this._cells=new Map(this._rows.slice(first,last).flatMap(row=>row.cells).map(cell=>[cell.key,cell]));
    body.innerHTML=this._rows.slice(first,last).map((row,index)=>`<div class="virtual-row" style="top:${(first+index)*step}px">${this._matrixRow(row,first+index)}</div>`).join('');
    this._cellElements=new Map([...body.querySelectorAll('[data-cell]')].map(element=>[element.dataset.cell,element]));
  }
  _render(){
    if(!this._config){
      if(this._emptyConfig)this.shadowRoot.innerHTML=`<ha-card style="display:block;padding:16px">${isDutch(this._hass)?'Kies een sensor in de editor.':'Select a sensor in the editor.'}</ha-card>`;
      return;
    }
    const c=this._config,dutch=isDutch(this._hass),text=(en,nl)=>dutch?nl:en,language=dutch?'nl':'en';
    const scroll=this.shadowRoot.querySelector('.matrix-scroll');
    const scrollLeft=scroll?.scrollLeft ?? 0,scrollTop=scroll?.scrollTop ?? 0,tooltipKey=this._tooltipKey;
    captureChartInsights(this);
    const periods=periodControls(this,language),range=this._data?{start:this._start,end:this._end}:graphPeriodRange(this);
    const historyUrl=`/history?entity_id=${encodeURIComponent(c.entity)}&start_date=${encodeURIComponent(new Date(range.start).toISOString())}&end_date=${encodeURIComponent(new Date(range.end).toISOString())}`;
    const name=this._sensorName();
    const scale=colorScale(this._rows,c);this._scale=scale;
    this._rowByKey=new Map(this._rows.map(row=>[row.key,row]));this._monthFormatter=null;this._dayFormatter=null;
    const zone=this._zone || this._hass?.config?.time_zone || 'UTC',locale=dutch?'nl-NL':'en-GB';
    const columns=heatmapColumns(c.aggregation_period,locale),columnCount=columns.length;
    const corner={hour:text('Day / hour','Dag / uur'),day:text('Week / day','Week / dag'),week:text('Year / week','Jaar / week'),month:text('Year / month','Jaar / maand')}[c.aggregation_period];
    const fmt=new Intl.DateTimeFormat(locale,{timeZone:zone,weekday:'short',day:'numeric',month:'short'});this._rowFormatter=fmt;
    const fullDate=new Intl.DateTimeFormat(locale,{timeZone:zone,weekday:'short',day:'numeric',month:'short',year:'numeric'});
    this._dateLabels=new Map(this._rows.map(row=>[row.key,fullDate.format(row.timestamp)]));
    this._virtualRows=this._rows.length>80;const step=c.cell_height+c.cell_gap;
    const [first,last]=this._virtualRows?this._matrixWindow(scrollTop,scroll?.clientHeight||Math.min(c.max_height,600)):[0,this._rows.length];
    this._windowRange=[first,last];
    this._cells=new Map(this._rows.slice(first,last).flatMap(row=>row.cells).map(cell=>[cell.key,cell]));
    const matrix=this._virtualRows?`<div class="matrix-body" role="rowgroup" style="height:${Math.max(0,this._rows.length*step-c.cell_gap)}px">${this._rows.slice(first,last).map((row,index)=>`<div class="virtual-row" style="top:${(first+index)*step}px">${this._matrixRow(row,first+index)}</div>`).join('')}</div>`:this._rows.map((row,index)=>this._matrixRow(row,index)).join('');
    const status=this._status==='error'?(this._error==='consumption_statistics_required'?text('No counter statistics for this sensor.','Geen tellerstatistieken voor deze sensor.'):text('Could not load data.','Laden mislukt.')):text('Loading…','Laden…');
    const hasValues=this._rows.some(row=>row.cells.some(cell=>cell.value!=null)),information=this._information(language);
    disconnectPeriodControls(this,true);disconnectChartInsights(this,true);this._disconnectTooltip();
    this.shadowRoot.innerHTML=`<style>${cardHeaderStyles()}${periodControlsStyles()}${chartInsightStyles()}${SharedGraph.tooltipStyles()}
      :host{display:block;height:100%;min-width:0;min-height:0;container-type:inline-size}
      ha-card{display:block;height:100%;min-height:0;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));font-family:inherit}
      .content{display:flex;flex-direction:column;height:100%;padding:16px;min-width:0;min-height:0;box-sizing:border-box}.content>.card-header,.content>.legend,.content>.status{flex-shrink:0}.chart{position:relative;display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}
      .matrix-scroll{flex:1;min-height:0;overflow:auto;max-height:${c.max_height}px;box-sizing:border-box;padding-bottom:6px}
      .matrix{min-width:${(c.show_labels?82+c.cell_gap:0)+columnCount*c.cell_width+(columnCount-1)*c.cell_gap}px;display:grid;gap:${c.cell_gap}px}.matrix-row{display:grid;grid-template-columns:${c.show_labels?'82px ':''}repeat(${columnCount},minmax(${c.cell_width}px,1fr));gap:${c.cell_gap}px}.matrix-row:not(.hours){content-visibility:auto;contain-intrinsic-size:auto ${c.cell_height}px}.matrix-body{position:relative;min-width:100%}.virtual-row{position:absolute;left:0;right:0;height:${c.cell_height}px}
      .hours{${c.show_labels?'':'display:none;'}position:sticky;top:0;z-index:3;background:var(--ha-card-background,var(--card-background-color,#fff))}
      .hours span{font-size:10px;text-align:center;color:var(--secondary-text-color,#666);line-height:${c.cell_height}px}
      .day{${c.show_labels?'':'display:none;'}position:sticky;left:0;z-index:2;background:var(--ha-card-background,var(--card-background-color,#fff));font-size:11px;line-height:${c.cell_height}px;white-space:nowrap;color:var(--secondary-text-color,#666)}
      .cell{appearance:none;position:relative;border:0;border-radius:${c.border_radius}px;min-width:${c.cell_width}px;height:${c.cell_height}px;padding:0;cursor:default}
      .cell:hover{box-shadow:inset 0 0 0 2px var(--primary-text-color,#20252b)}
      .missing{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--divider-color,#ddd) 3px,var(--divider-color,#ddd) 5px);box-shadow:inset 0 0 0 1px var(--divider-color,#ddd)}.outside{opacity:.35}
      .partial:after{content:'';position:absolute;right:2px;bottom:2px;width:4px;height:4px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px #20252b}
      .legend{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--secondary-text-color,#666);margin:0 0 10px;font-variant-numeric:tabular-nums}
      .ramp{width:100px;height:10px;border-radius:3px;flex-shrink:1;background:${scale.gradient}}
      .legend-value{overflow-wrap:anywhere;min-width:0}
      .tooltip{pointer-events:auto}.tooltip .tooltip-label{color:var(--secondary-text-color,#666)}.tooltip .tooltip-value{color:var(--primary-text-color,#20252b);font-style:normal}
      .status{font-size:12px;line-height:1.5;margin:12px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
      .retry{font:inherit;color:inherit;background:transparent;border:1px solid var(--divider-color,#ddd);border-radius:5px;min-height:32px;padding:4px 10px;cursor:pointer}.retry:focus-visible{outline:2px solid var(--primary-color,#2196f3)}
      @media(forced-colors:active){.cell{border:1px solid CanvasText}.missing{border-style:dashed}}
    </style><ha-card><div class="content">${cardHeader({title:c.title,showTitle:c.show_title,historyUrl,language,periods,information})}
    ${this._status!=='ready'?`<div class="status" role="status"><span>${esc(status)}${this._data?' '+text('Previous data shown.','Vorige gegevens worden getoond.'):''}</span>${this._status==='error'?`<button class="retry" type="button">${text('Retry','Opnieuw')}</button>`:''}</div>`:''}
    ${this._data?`${!hasValues?`<p class="status" role="status">${text('No data','Geen gegevens')}</p>`:''}${c.show_legend?`<div class="legend" aria-label="${text('Color scale','Kleurschaal')}"><span class="legend-value">${this._number(scale.min)} ${esc(this._data.unit)}</span><span class="ramp" aria-hidden="true"></span><span class="legend-value">${this._number(scale.max)} ${esc(this._data.unit)}</span></div>`:''}<div class="chart"><div class="matrix-scroll"><div class="matrix" role="table" aria-label="${esc(name)}" aria-rowcount="${this._rows.length+(c.show_labels?1:0)}" aria-colcount="${columnCount+(c.show_labels?1:0)}"><div class="matrix-row hours" role="row"><span role="columnheader">${corner}</span>${columns.map(label=>`<span role="columnheader">${esc(label)}</span>`).join('')}</div>${matrix}</div></div><div class="tooltip" id="heatmap-tooltip" role="tooltip" hidden></div></div>`:''}</div></ha-card>`;
    bindPeriodControls(this);bindChartInsights(this);
    const retry=this.shadowRoot.querySelector('.retry');if(retry)retry.onclick=()=>this._refresh();
    const container=this.shadowRoot.querySelector('.matrix-scroll');if(container){container.scrollLeft=scrollLeft;container.scrollTop=scrollTop;container.onscroll=()=>this._updateMatrixWindow();}
    this._bindTooltip();
    const grid=this.shadowRoot.querySelector('.matrix');
    if(grid){
      this._cellElements=new Map([...grid.querySelectorAll('[data-cell]')].map(element=>[element.dataset.cell,element]));this._updateMatrixWindow();
      const target=e=>e.target.closest('[data-cell]');
      grid.onpointerover=e=>{const cell=target(e);if(cell && e.pointerType!=='touch')this._showTooltip(cell.dataset.cell);};
      const cell=this._cellElements.get(tooltipKey);
      if(cell?.matches(':hover'))this._showTooltip(tooltipKey);else this._hideTooltip();
    }
  }
}

if(!customElements.get('eleven-heatmap-card'))customElements.define('eleven-heatmap-card',HeatmapCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(c=>c.type==='eleven-heatmap-card'))window.customCards.push({type:'eleven-heatmap-card',name:'Eleven Heatmap (beta)',description:'Sensor averages or consumption grouped by hour, day, week or month.',preview:true});
})();
