// Eleven Calendar (beta) — self-contained standalone module
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


const CALENDAR_COLORS=['#82adf5','#e7af67','#8ac6a6','#b99cf0','#eb8d9f','#80c6d6','#d8bd68','#a5b7d3'];
const escapeCalendarHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function calendarRgb(value){
 if(Array.isArray(value))return [...value];
 if(typeof value!=='string'||!/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value))return null;
 const hex=value.length===4?value.slice(1).split('').map(ch=>ch+ch).join(''):value.slice(1);
 return [0,2,4].map(index=>parseInt(hex.slice(index,index+2),16));
}
function calendarColor(value,fallback=CALENDAR_COLORS[0]){
 if(Array.isArray(value)&&value.length===3&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255))return `rgb(${value.join(',')})`;
 return typeof value==='string'&&/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)?value:fallback;
}
const validColor=value=>Array.isArray(value)&&value.length===3&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255)||typeof value==='string'&&/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value);
function normalizeCalendarConfig(input={}, {draft=false}={}){
 const source=input.entities??input.calendars??[];
 if(!Array.isArray(source))throw Error('Calendars must be a list. / Agenda’s moeten een lijst zijn.');
 const entities=source.map((row,index)=>{
  const item=typeof row==='string'?{entity:row}:row&&typeof row==='object'&&!Array.isArray(row)?row:{};
  const color=item.color??calendarRgb(CALENDAR_COLORS[index%CALENDAR_COLORS.length]);
  if(!draft&&!validColor(color))throw Error('Choose an RGB color for each calendar. / Kies een RGB-kleur voor elke agenda.');
  return {...item,entity:item.entity??'',name:item.name??'',color:Array.isArray(color)?[...color]:color};
 });
 const days=input.days_to_show??5,view=input.view??'list',density=input.density??'expanded',weather=input.weather_entity??'';
 if(!draft){
  if(!entities.length||entities.length>12||entities.some(row=>!/^calendar\.[a-z0-9_]+$/.test(row.entity))||new Set(entities.map(row=>row.entity)).size!==entities.length)throw Error('Choose 1–12 different calendar entities. / Kies 1–12 verschillende agenda-entiteiten.');
  if(!Number.isInteger(days)||days<1||days>14)throw Error('Days must be 1–14. / Aantal dagen moet 1–14 zijn.');
  if(!['list','columns','month'].includes(view))throw Error('Choose list, columns or month. / Kies lijst, kolommen of maand.');
  if(!['expanded','compact'].includes(density))throw Error('Choose expanded or compact density. / Kies uitgebreide of compacte weergave.');
  if(weather&&!/^weather\.[a-z0-9_]+$/.test(weather))throw Error('Choose a weather entity. / Kies een weerentiteit.');
  for(const field of ['show_title','show_legend','show_navigation','hide_empty_days'])if(input[field]!==undefined&&typeof input[field]!=='boolean')throw Error(`${field} must be true or false.`);
 }
 const {show_view_switcher: _legacyViewSwitcher,...settings}=input;
 return {...settings,type:'custom:eleven-calendar-card',title:input.title??'',entities,weather_entity:weather,days_to_show:draft&&Object.hasOwn(input,'days_to_show')&&input.days_to_show===undefined?undefined:days,view,density,
  show_title:input.show_title!==false,show_legend:input.show_legend!==false,show_navigation:input.show_navigation!==false,hide_empty_days:input.hide_empty_days===true};
}
const dayMs=86400000,zoneFormats=new Map();
function dateFormatter(zone){
 let formatter=zoneFormats.get(zone);
 if(!formatter){formatter=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});zoneFormats.set(zone,formatter);}
 return formatter;
}
function localCalendarDayKey(value,zone='UTC'){
 const t=typeof value==='number'?value:Date.parse(value);
 if(!Number.isFinite(t))return null;
 const parts=Object.fromEntries(dateFormatter(zone).formatToParts(t).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
function nextCalendarDayKey(key,step=1){return new Date(Date.parse(`${key}T00:00:00Z`)+step*dayMs).toISOString().slice(0,10);}
const mondayIndex=nominal=>(new Date(nominal).getUTCDay()+6)%7;
function calendarDisplayRange(view,daysToShow,offset,todayKey,zone='UTC'){
 const today=Date.parse(`${todayKey}T00:00:00Z`);
 let first,last,monthKey=null;
 if(view==='month'){
  const current=new Date(today),monthStart=Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+offset,1),nextMonth=Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+offset+1,1);
  first=monthStart-mondayIndex(monthStart)*dayMs;
  last=nextMonth+(6-mondayIndex(nextMonth-dayMs))*dayMs;
  monthKey=new Date(monthStart).toISOString().slice(0,10);
 }else{
  first=today+offset*daysToShow*dayMs;last=first+daysToShow*dayMs;
 }
 const count=Math.round((last-first)/dayMs),keys=Array.from({length:count},(_,index)=>new Date(first+index*dayMs).toISOString().slice(0,10));
 const startKey=keys[0],endKey=new Date(last).toISOString().slice(0,10);
 return {startKey,endKey,monthKey,keys,start:calendarDayStart(startKey,zone),end:calendarDayStart(endKey,zone)};
}
function normalizeCalendarEvent(raw,calendar,zone='UTC'){
 if(!raw||typeof raw.start!=='string'||typeof raw.end!=='string')return null;
 const allDay=/^\d{4}-\d{2}-\d{2}$/.test(raw.start)&&/^\d{4}-\d{2}-\d{2}$/.test(raw.end);
 const start=allDay?calendarDayStart(raw.start,zone):Date.parse(raw.start),end=allDay?calendarDayStart(raw.end,zone):Date.parse(raw.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
 return {calendar,summary:String(raw.summary??''),description:String(raw.description??''),location:String(raw.location??''),allDay,
  start,end,startKey:allDay?raw.start:localCalendarDayKey(start,zone),endKey:allDay?raw.end:localCalendarDayKey(end-1,zone)};
}
function calendarDaysWithEvents(range,eventsByEntity,entities,zone='UTC'){
 const events=entities.flatMap(row=>(eventsByEntity[row.entity]??[]).map(event=>normalizeCalendarEvent(event,row.entity,zone)).filter(Boolean));
 const days=range.keys.map(key=>({key,start:calendarDayStart(key,zone),end:calendarDayStart(nextCalendarDayKey(key),zone),events:[]}));
 for(const event of events){
  let low=0,high=days.length;
  while(low<high){const mid=(low+high)>>1;if(days[mid].end<=event.start)low=mid+1;else high=mid;}
  for(let index=low;index<days.length&&days[index].start<event.end;index++)days[index].events.push(event);
 }
 for(const day of days)day.events.sort((a,b)=>Number(b.allDay)-Number(a.allDay)||Math.max(a.start,day.start)-Math.max(b.start,day.start)||a.summary.localeCompare(b.summary));
 return days;
}
function forecastByCalendarDay(forecast,zone='UTC'){
 const days=new Map();
 for(const entry of Array.isArray(forecast)?forecast:[]){
  const key=localCalendarDayKey(entry?.datetime,zone);
  if(key&&!days.has(key))days.set(key,entry);
 }
 return days;
}
const calendarEventKey=event=>JSON.stringify([event.calendar,event.start,event.end,event.summary]);
function nextCalendarEvent(events,now=Date.now()){
 return events.reduce((next,event)=>event.start>now&&(!next||event.start<next.start)?event:next,null);
}

function calendarCardStyles(){return `
:host{display:block;height:100%;min-width:0;min-height:0;container-type:inline-size}
ha-card{display:block;height:100%;min-width:0;min-height:0;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));font:inherit}
.content{display:flex;flex-direction:column;height:100%;padding:16px;min-width:0;min-height:0;box-sizing:border-box}
.content>.header,.content>.legend,.content>.status{flex-shrink:0}
.calendar-body{flex:1;min-height:0;overflow:auto;scrollbar-width:thin}
.legend-error{display:inline-grid;place-items:center;width:13px;height:13px;border:1px solid currentColor;border-radius:50%;color:var(--error-color,#db4437);font-size:10px;line-height:1;flex:none}
.event-button[data-next-event],.month-chip[data-next-event],.popup-more li[data-next-event]{background:color-mix(in srgb,var(--event-color) 18%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--event-color) 50%,transparent)}
.event-button[data-next-event] .event-title{font-weight:650}
.header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 12px;margin-bottom:12px}
.header h2{font-size:18px;line-height:1.25;font-weight:650;margin:0;min-width:72px;flex:1}
.header-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;margin-inline-start:auto}
.navigation{display:flex;align-items:center;min-width:0;border-radius:5px;background:var(--secondary-background-color,#f3f3f3)}
.navigation .range{padding:0 9px;white-space:nowrap;font-size:11px;font-variant-numeric:tabular-nums;border-inline-end:1px solid var(--divider-color,#ddd)}
.navigation [data-nav=now]{width:auto;padding:0 9px}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.info-button{background:var(--secondary-background-color,#f3f3f3);border-radius:5px}
.legend{display:flex;flex-wrap:wrap;align-items:center;gap:6px 15px;margin:0 0 12px;font-size:11px;color:var(--secondary-text-color,#666)}
.legend-item{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;min-height:26px;padding:3px 0;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer}.legend-item[aria-pressed="false"]{opacity:.45}.legend-item[aria-pressed="false"] span{text-decoration:line-through}.legend-item:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:2px}.legend-item span{overflow-wrap:anywhere}.dot{width:7px;height:7px;border-radius:2px;flex:none;background:var(--event-color)}
.status{font-size:12px;line-height:1.45;color:var(--secondary-text-color,#666);margin:6px 0 12px}
.status.error{color:var(--error-color,#db4437)}.status button{font:inherit;cursor:pointer;margin-inline-start:8px;padding:3px 8px;border:1px solid var(--divider-color,#ddd);border-radius:5px;background:transparent;color:inherit}
.day-list{display:grid}.list-day+.list-day{border-top:1px solid var(--divider-color,#ddd);margin-top:12px;padding-top:12px}
.day-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px}
.day-title{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 7px;font-size:12px;font-weight:600}.day-title time{font-size:11px;font-weight:400;color:var(--secondary-text-color,#666)}
.weather{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;font-size:11px;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums}
.weather svg{width:21px;height:21px;flex:none;stroke:currentColor;stroke-width:1.5;fill:none;stroke-linecap:round;stroke-linejoin:round}
.weather b{font-weight:600;color:var(--primary-text-color,#20252b)}
.list-event{display:grid;grid-template-columns:59px minmax(0,1fr);gap:10px;align-items:start;padding:6px 0}
.event-time{font-size:11px;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums;line-height:1.4}.list-event>.event-time small{display:block;font-size:10px}
.event-button{display:block!important;min-width:0;width:100%;text-align:start;padding:0 0 0 9px!important;border-inline-start:3px solid var(--event-color)!important;border-radius:0!important;line-height:1.35}
.event-button .event-title{display:block;font-size:12px;font-weight:500;overflow-wrap:anywhere}.event-button .event-meta{display:block;margin-top:2px;color:var(--secondary-text-color,#666);font-size:10px;overflow-wrap:anywhere}
.empty-day{font-size:11px;color:var(--secondary-text-color,#666);padding:7px 0;margin:0}
.horizontal{overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--divider-color,#ddd) transparent}
.day-columns{display:grid;grid-template-columns:repeat(var(--days),minmax(132px,1fr));min-width:calc(var(--days)*132px)}
.column{min-width:0;padding:0 10px 10px}.column:first-child{padding-left:0}.column:last-child{padding-right:0}.column+.column{border-inline-start:1px solid var(--divider-color,#ddd)}
.column-heading{display:flex;flex-direction:column;gap:6px;min-height:64px;margin-bottom:9px;font-size:12px;font-weight:600}.column-heading time{font-size:11px;color:var(--secondary-text-color,#666);font-weight:400;margin-inline-start:4px}
.column .event-button{padding:7px 7px 7px 9px!important;background:color-mix(in srgb,var(--event-color) 9%,transparent);border-radius:0 5px 5px 0!important;margin-bottom:7px}
.column .event-button:hover,.month-chip:hover{background:color-mix(in srgb,var(--event-color) 17%,transparent)}
.column .event-time{display:block;margin-bottom:4px;color:var(--event-color);font-size:10px}.column .event-title{font-size:11px}.column .event-meta{font-size:10px}
.month-grid{display:grid;grid-template-columns:repeat(7,minmax(95px,1fr));min-width:665px;border-top:1px solid var(--divider-color,#ddd);border-inline-start:1px solid var(--divider-color,#ddd)}
.month-weekday{padding:7px 5px;text-align:center;color:var(--secondary-text-color,#666);font-size:10px;font-weight:600;border-inline-end:1px solid var(--divider-color,#ddd);border-bottom:1px solid var(--divider-color,#ddd)}
.month-cell{min-width:0;min-height:108px;padding:7px 7px 9px;border-inline-end:1px solid var(--divider-color,#ddd);border-bottom:1px solid var(--divider-color,#ddd)}
.month-cell.outside{background:color-mix(in srgb,var(--secondary-text-color,#666) 4%,transparent)}
.month-cell.today{box-shadow:inset 0 0 0 1px var(--primary-color,#2196f3)}
.month-cell-head{display:flex;align-items:center;justify-content:space-between;gap:2px;min-height:22px;margin-bottom:3px;font-size:11px}
.month-cell-head time{font-weight:600}.month-cell.outside .month-cell-head time{color:var(--secondary-text-color,#666)}
.month-cell .weather{gap:2px;font-size:10px}.month-cell .weather svg{width:17px;height:17px}.month-cell .weather .low{display:none}
.month-chip{display:block!important;width:100%;min-height:30px!important;min-width:0;text-align:start;margin:0 0 4px;padding:5px 6px!important;border:0!important;border-inline-start:3px solid var(--event-color)!important;border-radius:0 4px 4px 0!important;background:color-mix(in srgb,var(--event-color) 9%,transparent);font-size:12px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.month-more{display:block;min-height:26px;padding:4px 6px;border:0;background:transparent;color:var(--secondary-text-color,#666);font:inherit;font-size:11px;cursor:pointer;text-align:start}
.compact .content{padding:12px 14px}.compact .header{margin-bottom:8px}.compact .legend{margin-bottom:7px}
.compact .list-day+.list-day{margin-top:7px;padding-top:7px}.compact .day-heading{margin-bottom:2px}
.compact .list-event{grid-template-columns:54px minmax(0,1fr);gap:7px;align-items:center;padding:2px 0}.compact .list-event>.event-time{font-size:10px}.compact .list-event .event-button{min-height:24px!important;padding-inline-start:7px!important}.compact .list-event .event-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.compact .event-meta{display:none}.compact .empty-day{padding:3px 0}
.compact .column{padding-bottom:6px}.compact .column-heading{min-height:48px;margin-bottom:5px;gap:3px}.compact .column .event-button{min-height:24px!important;margin-bottom:4px;padding:4px 6px 4px 8px!important}.compact .column .event-time{margin-bottom:2px}
.compact .month-cell{min-height:74px;padding:3px 4px 5px}.compact .month-cell-head{min-height:19px;margin-bottom:2px}.compact .month-chip{min-height:24px!important;margin-bottom:2px;padding:2px 4px!important;font-size:10px;line-height:1.2}.compact .month-more{min-height:23px;padding:3px 5px;font-size:10px}
.calendar-event-popup{width:min(380px,calc(100vw - 16px))}.calendar-event-popup .ui-popup-heading>strong{min-width:0;overflow-wrap:anywhere}
.popup-calendar{display:flex;align-items:center;gap:7px;margin:5px 0 12px;color:var(--secondary-text-color,#666);font-size:11px}
.popup-when{padding:10px 12px;background:var(--secondary-background-color,#f3f3f3);border-radius:6px}
.popup-date,.popup-date-range{display:flex;flex-wrap:wrap;gap:3px 6px;overflow-wrap:anywhere;font-size:12px;font-weight:600}
.popup-date-range{display:grid;gap:2px}.popup-date-range .popup-date-separator{color:var(--secondary-text-color,#666)}
.popup-time{margin-top:3px;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}.popup-field{padding:10px 0 0;margin-top:10px;border-top:1px solid var(--divider-color,#ddd)}
.popup-field-label{display:block;margin-bottom:3px;color:var(--secondary-text-color,#666);font-size:10px}.popup-location,.popup-description{font-size:12px;overflow-wrap:anywhere}.popup-description{white-space:pre-wrap}
.popup-more{list-style:none;padding:0;margin:9px 0}.popup-more li{padding:5px 0;border-top:1px solid var(--divider-color,#ddd);font-size:11px}.popup-more summary{cursor:pointer}.popup-more small{display:block;color:var(--secondary-text-color,#666)}.popup-more-detail{padding:8px 0 10px 12px}
.calendar-info .insight-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 8px}
.calendar-info .calendar-agenda-metrics{grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:8px 12px;margin:6px 0 0}
.calendar-info .insight-metrics>div{min-width:0}.calendar-info dt{font-size:10px;color:var(--secondary-text-color,#666)}.calendar-info dd{margin:2px 0 0;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.calendar-info .calendar-agenda-metrics dd small{display:block;margin-top:2px;font-size:10px;font-weight:400;color:var(--secondary-text-color,#666)}
.calendar-info .insight-sensor{padding:8px 0}
.calendar-info .insight-sensor+.insight-sensor{border-top:1px solid var(--divider-color,#ddd)}
.calendar-info .insight-sensor-heading{display:flex;align-items:center;gap:8px;min-width:0}.calendar-info .insight-sensor-heading strong{flex:1;min-width:0;overflow-wrap:anywhere}
.calendar-info .insight-states{font-size:10px;color:var(--secondary-text-color,#666);margin-top:4px}
@container(max-width:420px){.content{padding:12px}.header{align-items:flex-start}.header-actions{gap:5px}.navigation .range{font-size:10px;padding:0 6px}.navigation [data-nav=now]{padding:0 6px}.list-event{grid-template-columns:50px minmax(0,1fr);gap:8px}.weather{font-size:10px}}
`;}









const isDutch=hass=>String(hass?.locale?.language??hass?.language??'en').startsWith('nl');
const words={
 calendarUnavailable:['Agenda niet beschikbaar','Calendar unavailable'],nextEvent:['Eerstvolgende afspraak','Next event'],
 title:['Agenda','Calendar'],list:['Daglijst','Day list'],columns:['Dagkolommen','Day columns'],month:['Maand','Month'],today:['Vandaag','Today'],tomorrow:['Morgen','Tomorrow'],
 now:['Nu','Now'],previous:['Vorige periode','Previous period'],next:['Volgende periode','Next period'],info:['Informatie','Information'],close:['Sluiten','Close'],
 allDay:['Hele dag','All day'],noEvents:['Geen afspraken','No events'],loading:['Afspraken laden…','Loading events…'],failed:['Afspraken konden niet worden geladen.','Could not load calendar events.'],
 retry:['Opnieuw','Retry'],select:['Kies een agenda in de configuratie.','Select a calendar in the editor.'],more:['meer','more'],weather:['Weer','Weather'],
 hideCalendar:['Verberg agenda','Hide calendar'],showCalendar:['Toon agenda','Show calendar'],allHidden:['Alle agenda’s zijn verborgen.','All calendars are hidden.'],
 soloHint:['Dubbelklik of Shift+Enter: toon alleen deze agenda. Herhaal om alle agenda’s te tonen.','Double-click or Shift+Enter: show only this calendar. Repeat to show all calendars.'],
 continuing:['Doorlopend','Continuing'],until:['Tot','Until'],from:['Vanaf','From'],
 appointments:['Afspraken','Events'],hidden:['Verborgen','Hidden'],noData:['Nog geen gegevens','No data yet'],
 nextAppointment:['Eerstvolgende','Next event'],location:['Locatie','Location'],description:['Beschrijving','Description']
};
const label=(key,dutch)=>words[key]?.[dutch?0:1]??key;
const fieldLabels={title:['Titel','Title'],view:['Weergave','View'],density:['Dichtheid','Density'],days_to_show:['Aantal dagen','Days to show'],weather_entity:['Weerentiteit','Weather entity'],
 show_title:['Titel tonen','Show title'],show_legend:['Agendalegenda tonen','Show calendar legend'],show_navigation:['Navigatie tonen','Show navigation'],hide_empty_days:['Lege dagen verbergen in daglijst','Hide empty days in day list'],
 entity:['Agenda','Calendar'],name:['Naam','Name'],color:['Kleur','Color']};
const fieldHelp={density:['Compact toont minder details; open een afspraak voor alle informatie.','Compact shows fewer details; open an event for full information.'],days_to_show:['Voor daglijst en dagkolommen; de maandweergave toont altijd een hele maand.','For list and columns; the month view always shows a full month.'],
 weather_entity:['Optioneel. Dagtemperaturen komen uit de dagelijkse voorspelling van deze weerentiteit.','Optional. Daily temperatures come from this weather entity’s daily forecast.'],
 color:['Kleur van afspraken en de legenda.','Color for events and the legend.']};
const selectorOptions=(dutch,items)=>({select:{mode:'dropdown',options:items.map(([value,nl,en])=>({value,label:dutch?nl:en}))}});

class CalendarEditor extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});}
 setConfig(config){this._config=normalizeCalendarConfig(config,{draft:true});this._render();}
 set hass(hass){this._hass=hass;this._render();}get hass(){return this._hass;}
 _formDefinition(fields){const dutch=isDutch(this._hass);return {schema:fields,computeLabel:item=>fieldLabels[item.name]?.[dutch?0:1]??item.name,computeHelper:item=>fieldHelp[item.name]?.[dutch?0:1]};}
 _bind(form,fields,data){const definition=this._formDefinition(fields);form.hass=this._hass;form.schema=definition.schema;form.data=data;form.computeLabel=definition.computeLabel;form.computeHelper=definition.computeHelper;}
 _emit(){const entities=this._config.entities.filter(row=>row.entity).map(row=>({...row,color:Array.isArray(row.color)?[...row.color]:row.color}));this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...this._config,entities}},bubbles:true,composed:true}));}
 _render(){
  if(!this._config||!this._hass)return;
  const dutch=isDutch(this._hass);
  if(!this._form){
   this.shadowRoot.innerHTML=`<style>:host{display:block;min-width:0}ha-form{display:block;min-width:0}h3{font-size:16px;margin:24px 0 12px}details{border:1px solid var(--divider-color,#ddd);border-radius:10px;margin:10px 0;min-width:0}summary{padding:12px;min-height:44px;box-sizing:border-box;cursor:pointer;overflow-wrap:anywhere}.body{padding:0 12px 12px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}button{font:inherit;min-height:36px;border:1px solid var(--divider-color,#ddd);border-radius:6px;padding:6px 12px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#20252b);cursor:pointer}button:disabled{opacity:.4}.remove{margin-inline-start:auto}.error{font-size:12px;color:var(--error-color,#db4437);overflow-wrap:anywhere}.error[hidden]{display:none}button:focus-visible,summary:focus-visible{outline:2px solid var(--primary-color,#2196f3)}</style><ha-form class="global"></ha-form><h3></h3><div class="calendars"></div><button class="add" type="button"></button><p class="error" role="alert" hidden></p>`;
   this._form=this.shadowRoot.querySelector('.global');
   this._form.addEventListener('value-changed',event=>{event.stopPropagation();this._config=normalizeCalendarConfig({...this._config,...event.detail.value,entities:this._config.entities},{draft:true});this._render();this._emit();});
   this.shadowRoot.querySelector('.add').onclick=()=>{if(this._config.entities.length>=12)return;this._config={...this._config,entities:[...this._config.entities,{entity:'',name:'',color:calendarRgb(CALENDAR_COLORS[this._config.entities.length%CALENDAR_COLORS.length])}]};this._render();this.shadowRoot.querySelector('.calendars').lastElementChild.open=true;};
  }
  const global=CalendarCard.getConfigForm(dutch);this._form.hass=this._hass;this._form.schema=global.schema;this._form.data=this._config;this._form.computeLabel=global.computeLabel;this._form.computeHelper=global.computeHelper;
  this.shadowRoot.querySelector('h3').textContent=dutch?'Agenda’s':'Calendars';
  const add=this.shadowRoot.querySelector('.add');add.textContent=dutch?'Agenda toevoegen':'Add calendar';add.disabled=this._config.entities.length>=12;
  const container=this.shadowRoot.querySelector('.calendars');while(container.children.length>this._config.entities.length)container.lastElementChild.remove();
  this._config.entities.forEach((row,index)=>{
   let entry=container.children[index];
   if(!entry){entry=document.createElement('details');entry.open=this._config.entities.length===1;entry.innerHTML='<summary></summary><div class="body"><ha-form></ha-form><div class="actions"><button class="up" type="button"></button><button class="down" type="button"></button><button class="remove" type="button"></button></div></div>';container.append(entry);
    entry.querySelector('ha-form').addEventListener('value-changed',event=>{event.stopPropagation();const entities=this._config.entities.map((item,i)=>i===index?{...item,...event.detail.value}:item);this._config={...this._config,entities};this._render();this._emit();});
    for(const [action,delta] of [['up',-1],['down',1],['remove',0]])entry.querySelector('.'+action).onclick=()=>{const entities=[...this._config.entities];if(action==='remove')entities.splice(index,1);else{const other=index+delta;if(other<0||other>=entities.length)return;[entities[index],entities[other]]=[entities[other],entities[index]];}this._config={...this._config,entities};this._render();this._emit();};
   }
   entry.querySelector('summary').textContent=row.name||this._hass.states?.[row.entity]?.attributes?.friendly_name||row.entity||(dutch?'Nieuwe agenda':'New calendar');
   this._bind(entry.querySelector('ha-form'),[{name:'entity',required:true,selector:{entity:{domain:'calendar'}}},{name:'name',selector:{text:{}}},{name:'color',selector:{color_rgb:{}}}],{...row,color:calendarRgb(row.color)??row.color});
   for(const [action,nl,en] of [['up','Omhoog','Move up'],['down','Omlaag','Move down'],['remove','Verwijderen','Remove']]){const button=entry.querySelector('.'+action);button.textContent=dutch?nl:en;button.disabled=action==='up'?index===0:action==='down'?index===this._config.entities.length-1:false;}
  });
  const error=this.shadowRoot.querySelector('.error');try{if(this._config.entities.some(row=>row.entity))normalizeCalendarConfig(this._config);error.hidden=true;error.textContent='';}catch(problem){error.hidden=false;error.textContent=problem.message.split(' / ')[dutch?1:0]??problem.message;}
 }
}

class CalendarCard extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});this._connected=false;this._calendarGeneration=0;this._weatherGeneration=0;this._calendarUnsubs=[];this._events={};this._statuses={};this._forecast=null;this._weatherError=false;this._view='list';this._offset=0;this._hiddenCalendars=new Set();this._legendClickTimers=new Map();this._popupControllers=[];this._todayKey=null;}
 static getConfigForm(dutch=false){return {schema:[
  {name:'title',selector:{text:{}}},{name:'view',default:'list',selector:selectorOptions(dutch,[['list','Daglijst','Day list'],['columns','Dagkolommen','Day columns'],['month','Maand','Month']])},
  {name:'density',default:'expanded',selector:selectorOptions(dutch,[['expanded','Uitgebreid','Expanded'],['compact','Compact','Compact']])},
  {name:'days_to_show',default:5,selector:{number:{min:1,max:14,step:1,mode:'box'}}},{name:'weather_entity',selector:{entity:{domain:'weather'}}},
  {type:'expandable',name:'appearance',title:dutch?'Weergave':'Appearance',flatten:true,schema:[{name:'show_title',default:true,selector:{boolean:{}}},{name:'show_legend',default:true,selector:{boolean:{}}},{name:'show_navigation',default:true,selector:{boolean:{}}},{name:'hide_empty_days',default:false,selector:{boolean:{}}}]}
 ],computeLabel:item=>fieldLabels[item.name]?.[dutch?0:1]??item.name,computeHelper:item=>fieldHelp[item.name]?.[dutch?0:1]};}
 static async getConfigElement(){
  if(!customElements.get('ha-form')){const helpers=await window.loadCardHelpers();const card=await helpers.createCardElement({type:'entities',entities:[]});await card.constructor.getConfigElement();await customElements.whenDefined('ha-form');}
  if(!customElements.get('eleven-calendar-editor'))customElements.define('eleven-calendar-editor',CalendarEditor);
  return document.createElement('eleven-calendar-editor');
 }
 static getStubConfig(hass){const entity=Object.keys(hass?.states??{}).find(id=>id.startsWith('calendar.'));return {entities:entity?[{entity,color:calendarRgb(CALENDAR_COLORS[0])}]:[],days_to_show:5,view:'list'};}
 setConfig(input){
  const empty=!input?.entities?.length&&!input?.calendars?.length;
  const config=normalizeCalendarConfig(input,{draft:empty}),previous=this._config,wasEmpty=this._emptyConfig;
  if(!empty)normalizeCalendarConfig(input);
  this._cancelLegendClicks();
  this._config=config;this._emptyConfig=empty;
  this._hiddenCalendars=new Set(config.show_legend?config.entities.map(row=>row.entity).filter(id=>this._hiddenCalendars.has(id)):[]);
  const priorIds=previous?.entities?.map(row=>row.entity).join('|'),nextIds=config.entities.map(row=>row.entity).join('|');
  if(!previous||previous.view!==config.view)this._view=config.view;
  if(!previous||previous.days_to_show!==config.days_to_show||previous.view!==config.view)this._offset=0;
  if(this._connected&&this._hass){
   if(empty){this._stopCalendars();this._stopWeather();}
   else{if(priorIds!==nextIds||previous?.days_to_show!==config.days_to_show||previous?.view!==config.view)this._startCalendars();
    if(wasEmpty||previous?.weather_entity!==config.weather_entity)this._startWeather();}
  }
  this._render();
 }
 set hass(hass){
  const previous=this._hass,zone=hass?.config?.time_zone||'UTC',oldZone=previous?.config?.time_zone||'UTC',connectionChanged=previous?.connection!==hass?.connection;
  this._hass=hass;
  const context=JSON.stringify([this._config?.entities?.map(row=>[hass?.states?.[row.entity]?.attributes?.friendly_name,hass?.states?.[row.entity]?.state]),this._config?.weather_entity&&[hass?.states?.[this._config.weather_entity]?.state,hass?.states?.[this._config.weather_entity]?.attributes?.temperature,hass?.states?.[this._config.weather_entity]?.attributes?.temperature_unit]]);
  const displayChanged=context!==this._displayContext;this._displayContext=context;
  const today=localCalendarDayKey(Date.now(),zone);
  if(this._todayKey!==today){this._todayKey=today;this._offset=0;if(this._connected&&this._config&&!this._emptyConfig)this._startCalendars();}
  else if(this._connected&&this._config&&!this._emptyConfig&&(connectionChanged||zone!==oldZone))this._startCalendars();
  if(this._connected&&this._config&&!this._emptyConfig&&(connectionChanged||zone!==oldZone))this._startWeather();
  if(!previous||zone!==oldZone||isDutch(previous)!==isDutch(hass)||connectionChanged||displayChanged)this._render();
  this._scheduleMidnight();
 }
 get hass(){return this._hass;}
 connectedCallback(){this._connected=true;this._todayKey=localCalendarDayKey(Date.now(),this._zone());if(this._config&&!this._emptyConfig){this._startCalendars();this._startWeather();}this._scheduleMidnight();this._render();}
 disconnectedCallback(){this._connected=false;this._cancelLegendClicks();this._stopCalendars();this._stopWeather();this._cleanupUI();clearTimeout(this._midnightTimer);this._midnightTimer=null;clearTimeout(this._nextEventTimer);this._nextEventTimer=null;}
 getCardSize(){const compact=this._config?.density==='compact';return this._view==='month'?(compact?11:14):this._view==='columns'?(compact?6:8):Math.max(3,Math.ceil(((compact?105:130)+(this._config?.days_to_show??5)*(compact?70:100))/50));}
 getGridOptions(){return {columns:12,min_columns:6,rows:Math.max(3,Math.ceil(this.getCardSize()*50/64)),min_rows:3};}
 _zone(){return this._hass?.config?.time_zone||'UTC';}
 _queueRender(){if(this._renderQueued)return;this._renderQueued=true;queueMicrotask(()=>{this._renderQueued=false;if(this._connected)this._render();});}
 _range(){const today=this._todayKey??=localCalendarDayKey(Date.now(),this._zone());return calendarDisplayRange(this._view,this._config?.days_to_show??5,this._offset,today,this._zone());}
 _stopCalendars(){this._calendarGeneration++;clearTimeout(this._calendarRetryTimer);this._calendarRetryTimer=null;for(const unsubscribe of this._calendarUnsubs)try{unsubscribe();}catch{}this._calendarUnsubs=[];}
 _retryCalendars(){if(this._calendarRetryTimer||!this._connected)return;const generation=this._calendarGeneration;this._calendarRetryFailures=(this._calendarRetryFailures??0)+1;this._calendarRetryTimer=setTimeout(()=>{this._calendarRetryTimer=null;if(this._connected&&generation===this._calendarGeneration&&Object.values(this._statuses).includes('error')){this._startCalendars();this._queueRender();}},retryDelay(this._calendarRetryFailures,30000));this._calendarRetryTimer.unref?.();}
 _startCalendars(){
  this._stopCalendars();if(!this._connected||!this._hass||!this._config||this._emptyConfig)return;
  const generation=this._calendarGeneration,range=this._range(),connection=this._hass.connection;
  const rangeKey=`${range.start}/${range.end}`;this._events=this._eventRangeKey===rangeKey?Object.fromEntries(this._config.entities.filter(row=>this._events[row.entity]).map(row=>[row.entity,this._events[row.entity]])):{};this._eventRangeKey=rangeKey;
  this._statuses=Object.fromEntries(this._config.entities.map(row=>[row.entity,'loading']));
  for(const row of this._config.entities){
   const entity=row.entity;
   if(typeof connection?.subscribeMessage!=='function'){this._statuses[entity]='error';this._retryCalendars();continue;}
   try{
    const promise=connection.subscribeMessage(payload=>{
     if(!this._connected||generation!==this._calendarGeneration)return;
     const events=payload?.event?.events??payload?.events;
     this._statuses[entity]=Array.isArray(events)?'ready':'error';if(Array.isArray(events)){this._events[entity]=events;this._eventRevision=(this._eventRevision??0)+1;if(Object.values(this._statuses).every(status=>status==='ready')){this._calendarRetryFailures=0;clearTimeout(this._calendarRetryTimer);this._calendarRetryTimer=null;}}else this._retryCalendars();this._queueRender();
    },{type:'calendar/event/subscribe',entity_id:entity,start:new Date(range.start).toISOString(),end:new Date(range.end).toISOString()});
    Promise.resolve(promise).then(unsubscribe=>{if(typeof unsubscribe!=='function')return;if(!this._connected||generation!==this._calendarGeneration)unsubscribe();else this._calendarUnsubs.push(unsubscribe);},()=>{if(this._connected&&generation===this._calendarGeneration){this._statuses[entity]='error';this._retryCalendars();this._queueRender();}});
   }catch{this._statuses[entity]='error';this._retryCalendars();}
  }
 }
 _stopWeather(){this._weatherGeneration++;clearTimeout(this._weatherRetryTimer);this._weatherRetryTimer=null;this._weatherUnsub?.();this._weatherUnsub=null;}
 _retryWeather(){if(this._weatherRetryTimer||!this._connected)return;const generation=this._weatherGeneration;this._weatherRetryFailures=(this._weatherRetryFailures??0)+1;this._weatherRetryTimer=setTimeout(()=>{this._weatherRetryTimer=null;if(this._connected&&generation===this._weatherGeneration&&this._weatherError)this._startWeather();},retryDelay(this._weatherRetryFailures,30000));this._weatherRetryTimer.unref?.();}
 _startWeather(){
  this._stopWeather();if(this._forecastEntity!==this._config?.weather_entity)this._forecast=null;this._forecastEntity=this._config?.weather_entity;this._weatherError=false;
  if(!this._connected||!this._hass||!this._config?.weather_entity)return;
  const generation=this._weatherGeneration,entity=this._config.weather_entity,state=this._hass.states?.[entity],legacy=state?.attributes?.forecast;
  if(Array.isArray(legacy))this._forecast=legacy;
  const subscribe=this._hass.connection?.subscribeMessage;
  if(typeof subscribe!=='function'){this._weatherError=!this._forecast?.length;if(this._weatherError)this._retryWeather();return;}
  try{
   const promise=subscribe.call(this._hass.connection,payload=>{
    if(!this._connected||generation!==this._weatherGeneration)return;
    if(Array.isArray(payload?.forecast)){this._forecast=payload.forecast;this._weatherError=false;this._weatherRetryFailures=0;clearTimeout(this._weatherRetryTimer);this._weatherRetryTimer=null;}
    else{this._weatherError=true;this._retryWeather();}
    this._queueRender();
   },{type:'weather/subscribe_forecast',forecast_type:'daily',entity_id:entity});
   Promise.resolve(promise).then(unsubscribe=>{if(typeof unsubscribe!=='function')return;if(!this._connected||generation!==this._weatherGeneration)unsubscribe();else this._weatherUnsub=unsubscribe;},()=>{if(this._connected&&generation===this._weatherGeneration){this._weatherError=true;this._retryWeather();this._queueRender();}});
  }catch{this._weatherError=true;this._retryWeather();}
 }
 _scheduleMidnight(){
  clearTimeout(this._midnightTimer);if(!this._connected||!this._hass)return;
  const today=localCalendarDayKey(Date.now(),this._zone()),next=calendarDayStart(nextCalendarDayKey(today),this._zone());
  this._midnightTimer=setTimeout(()=>{const current=localCalendarDayKey(Date.now(),this._zone());if(current!==this._todayKey){this._todayKey=current;this._offset=0;this._startCalendars();this._render();}this._scheduleMidnight();},Math.max(1000,Math.min(86400000,next-Date.now()+100)));
 }
 _calendarName(entity){const row=this._config.entities.find(item=>item.entity===entity);return row?.name||this._hass?.states?.[entity]?.attributes?.friendly_name||entity;}
 _calendarFailed(entity){return this._statuses[entity]==='error'||['unavailable','unknown'].includes(this._hass?.states?.[entity]?.state);}
 _updateNextEvent(){
  this._nextEvent=nextCalendarEvent(this._displayEvents??[]);
  const next=this._nextEvent?calendarEventKey(this._nextEvent):null;
  for(const button of this.shadowRoot.querySelectorAll('[data-calendar-event]')){
   const selected=button.dataset.calendarEvent===next;
   button.toggleAttribute('data-next-event',selected);
   if(selected)button.setAttribute('aria-description',label('nextEvent',isDutch(this._hass)));else button.removeAttribute('aria-description');
  }
  clearTimeout(this._nextEventTimer);this._nextEventTimer=null;
  if(this._connected&&this._nextEvent)this._nextEventTimer=setTimeout(()=>this._updateNextEvent(),Math.max(1,Math.min(2147483647,this._nextEvent.start-Date.now()+1)));
 }
 _eventColor(entity){return calendarColor(this._config.entities.find(item=>item.entity===entity)?.color);}
 _cancelLegendClicks(){cancelUILegendClicks(this);}
 _focusLegend(id){focusUILegend(this,id,'[data-calendar]',button=>button.dataset.calendar);}
 _toggleCalendar(id){if(!this._config.show_legend||!this._config.entities.some(row=>row.entity===id))return;
  if(this._hiddenCalendars.has(id))this._hiddenCalendars.delete(id);else this._hiddenCalendars.add(id);
  this._render();this._focusLegend(id);
 }
 _toggleCalendarIsolation(id){if(!this._config.show_legend||!this._config.entities.some(row=>row.entity===id))return;
  this._cancelLegendClicks();
  const only=this._config.entities.every(row=>this._hiddenCalendars.has(row.entity)===(row.entity!==id));
  this._hiddenCalendars=only?new Set():new Set(this._config.entities.filter(row=>row.entity!==id).map(row=>row.entity));
  this._render();this._focusLegend(id);
 }
 _formatter(options){return new Intl.DateTimeFormat(isDutch(this._hass)?'nl-NL':'en-GB',options);}
 _dayFormatter(options){return this._formatter({timeZone:'UTC',...options});}
 _time(value){return this._formatter({timeZone:this._zone(),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(value);}
 _dayTitle(key){const dutch=isDutch(this._hass);if(key===this._todayKey)return label('today',dutch);if(key===nextCalendarDayKey(this._todayKey))return label('tomorrow',dutch);return this._dayFormatter({weekday:'long'}).format(Date.parse(`${key}T12:00:00Z`));}
 _eventTime(event,day){
  const dutch=isDutch(this._hass);if(event.allDay)return label('allDay',dutch);
  if(event.start<day.start&&event.end>day.end)return label('continuing',dutch);
  if(event.start<day.start)return `${label('until',dutch)} ${this._time(event.end)}`;
  if(event.end>day.end)return `${label('from',dutch)} ${this._time(event.start)}`;
  return `${this._time(event.start)}–${this._time(event.end)}`;
 }
 _weatherIcon(condition){
  const sun='<circle cx="9" cy="8" r="3"/><path d="M9 1v2M9 13v2M2 8H0M16 8h2M3.3 2.3l1.4 1.4M13.3 12.3l1.4 1.4M3.3 13.7l1.4-1.4M13.3 3.7l1.4-1.4"/>';
  const cloud='<path d="M7 18a4 4 0 1 1 .8-7.9A5 5 0 0 1 17.5 12a3 3 0 1 1 .5 6Z"/>';
  const kind=/rain|pouring|lightning|hail|snow/.test(condition)?'rain':/cloud|fog/.test(condition)?'cloud':'sun';
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${kind==='sun'?`<g transform="translate(3 4)">${sun}</g>`:kind==='cloud'?sun+cloud:cloud+'<path d="m9 20-1 2m5-2-1 2m5-2-1 2"/>'}</svg>`;
 }
 _weatherFor(key,forecast){
  if(!this._config.weather_entity)return '';
  const row=forecast.get(key),state=this._hass?.states?.[this._config.weather_entity],current=key===this._todayKey?state:null;
  if(!row&&!current)return '';
  const high=Number(row?.temperature??current?.attributes?.temperature),low=row?.templow==null?NaN:Number(row.templow),condition=String(row?.condition??current?.state??''),unit=state?.attributes?.temperature_unit??'°';
  if(!Number.isFinite(high))return '';
  const text=`${Math.round(high)}${unit}`,description=`${condition||label('weather',isDutch(this._hass))}, ${text}${Number.isFinite(low)?` / ${Math.round(low)}${unit}`:''}`;
  return `<span class="weather" title="${escapeCalendarHtml(description)}" aria-label="${escapeCalendarHtml(description)}">${this._weatherIcon(condition)}<span><b>${escapeCalendarHtml(text)}</b>${Number.isFinite(low)?`<span class="low"> / ${Math.round(low)}${escapeCalendarHtml(unit)}</span>`:''}</span></span>`;
 }
 _detailTime(event){
  const dutch=isDutch(this._hass),options={weekday:'long',day:'numeric',month:'long',year:'numeric'};
  if(event.allDay){
   const format=this._dayFormatter(options),first=event.startKey,last=nextCalendarDayKey(event.endKey,-1);
   return `<div class="popup-date"><time datetime="${first}">${escapeCalendarHtml(format.format(Date.parse(`${first}T12:00:00Z`)))}</time>${last!==first?`<span class="popup-date-separator">–</span><time datetime="${last}">${escapeCalendarHtml(format.format(Date.parse(`${last}T12:00:00Z`)))}</time>`:''}</div><div class="popup-time">${label('allDay',dutch)}</div>`;
  }
  const format=this._formatter({timeZone:this._zone(),...options}),startKey=localCalendarDayKey(event.start,this._zone()),endKey=localCalendarDayKey(event.end,this._zone());
  if(startKey===endKey)return `<div class="popup-date"><time datetime="${new Date(event.start).toISOString()}">${escapeCalendarHtml(format.format(event.start))}</time></div><div class="popup-time">${escapeCalendarHtml(this._time(event.start))}–${escapeCalendarHtml(this._time(event.end))}</div>`;
  return `<div class="popup-date-range"><time datetime="${new Date(event.start).toISOString()}">${escapeCalendarHtml(format.format(event.start))} · ${escapeCalendarHtml(this._time(event.start))}</time><span class="popup-date-separator">–</span><time datetime="${new Date(event.end).toISOString()}">${escapeCalendarHtml(format.format(event.end))} · ${escapeCalendarHtml(this._time(event.end))}</time></div>`;
 }
 _eventButton(event,day,variant='list'){
  const dutch=isDutch(this._hass),name=this._calendarName(event.calendar),title=event.summary||(dutch?'Afspraak':'Event'),time=this._eventTime(event,day),id=`calendar-event-${this._popupSeq++}`;
  const content=variant==='month'?`${!event.allDay?`<span>${escapeCalendarHtml(this._time(event.start))} </span>`:''}${escapeCalendarHtml(title)}`:
   `${variant==='columns'?`<span class="event-time">${escapeCalendarHtml(time)}</span>`:''}<span class="event-title">${escapeCalendarHtml(title)}</span><span class="event-meta">${escapeCalendarHtml(name)}${event.location?' · '+escapeCalendarHtml(event.location):''}</span>`;
  const popup=uiPopup({id,title,className:'calendar-event-popup',closeLabel:label('close',dutch),content:`<div class="popup-calendar" style="--event-color:${this._eventColor(event.calendar)}"><i class="dot"></i>${escapeCalendarHtml(name)}</div><div class="popup-when">${this._detailTime(event)}</div>${event.location?`<div class="popup-field"><span class="popup-field-label">${label('location',dutch)}</span><div class="popup-location">${escapeCalendarHtml(event.location)}</div></div>`:''}${event.description?`<div class="popup-field"><span class="popup-field-label">${label('description',dutch)}</span><div class="popup-description">${escapeCalendarHtml(event.description)}</div></div>`:''}`});
  this._popupMarkup.push(popup);
  return uiButton({variant:'text',className:variant==='month'?'month-chip':'event-button',content,label:`${title}, ${time}, ${name}`,title:`${title} · ${time}`,attrs:{'data-event-popup-id':id,'data-calendar-event':calendarEventKey(event),'aria-controls':id,'aria-haspopup':'dialog',style:`--event-color:${this._eventColor(event.calendar)}`}});
 }
 _list(days,forecast){
  const short=this._dayFormatter({day:'numeric',month:'short'}),dutch=isDutch(this._hass);
  if(this._config.hide_empty_days)days=days.filter(day=>day.events.length);
  if(!days.length)return `<p class="status" role="status">${label('noEvents',dutch)}</p>`;
  return `<div class="day-list">${days.map(day=>`<section class="list-day"><div class="day-heading"><div class="day-title">${escapeCalendarHtml(this._dayTitle(day.key))}<time datetime="${day.key}">${short.format(Date.parse(`${day.key}T12:00:00Z`))}</time></div>${this._weatherFor(day.key,forecast)}</div>${day.events.length?day.events.map(event=>`<div class="list-event"><span class="event-time">${event.allDay?label('allDay',dutch):escapeCalendarHtml(this._eventTime(event,day))}</span>${this._eventButton(event,day)}</div>`).join(''):`<p class="empty-day">${label('noEvents',dutch)}</p>`}</section>`).join('')}</div>`;
 }
 _columns(days,forecast){
  const short=this._dayFormatter({weekday:'short'}),date=this._dayFormatter({day:'numeric',month:'short'}),dutch=isDutch(this._hass);
  return `<div class="horizontal" tabindex="0" role="region" aria-label="${label('columns',dutch)}"><div class="day-columns" style="--days:${days.length}">${days.map(day=>`<section class="column"><div class="column-heading"><div>${short.format(Date.parse(`${day.key}T12:00:00Z`))}<time datetime="${day.key}">${date.format(Date.parse(`${day.key}T12:00:00Z`))}</time></div>${this._weatherFor(day.key,forecast)}</div>${day.events.length?day.events.map(event=>this._eventButton(event,day,'columns')).join(''):`<p class="empty-day">${label('noEvents',dutch)}</p>`}</section>`).join('')}</div></div>`;
 }
 _month(days,range,forecast){
  const dutch=isDutch(this._hass),weekday=this._dayFormatter({weekday:'short'}),names=Array.from({length:7},(_,index)=>weekday.format(Date.UTC(2024,0,1+index)));
  const rows=days.map(day=>{
   const outside=day.key.slice(0,7)!==range.monthKey.slice(0,7),visible=day.events.slice(0,this._config.density==='compact'?2:3),remaining=day.events.length-visible.length;
   let more='';
   if(remaining){const id=`calendar-more-${this._popupSeq++}`,title=this._dayFormatter({weekday:'long',day:'numeric',month:'long'}).format(Date.parse(`${day.key}T12:00:00Z`));
    this._popupMarkup.push(uiPopup({id,title,closeLabel:label('close',dutch),content:`<ul class="popup-more">${day.events.map(event=>`<li data-calendar-event="${escapeCalendarHtml(calendarEventKey(event))}" style="--event-color:${this._eventColor(event.calendar)}"><details><summary><strong>${escapeCalendarHtml(event.summary||label('title',dutch))}</strong><small>${escapeCalendarHtml(this._eventTime(event,day))} · ${escapeCalendarHtml(this._calendarName(event.calendar))}</small></summary><div class="popup-more-detail"><div class="popup-when">${this._detailTime(event)}</div>${event.location?`<div class="popup-field"><span class="popup-field-label">${label('location',dutch)}</span><div class="popup-location">${escapeCalendarHtml(event.location)}</div></div>`:''}${event.description?`<div class="popup-field"><span class="popup-field-label">${label('description',dutch)}</span><div class="popup-description">${escapeCalendarHtml(event.description)}</div></div>`:''}</div></details></li>`).join('')}</ul>`}));
    more=uiButton({variant:'text',className:'month-more',text:`+${remaining} ${label('more',dutch)}`,label:`+${remaining} ${label('more',dutch)}`,attrs:{'data-event-popup-id':id,'aria-controls':id,'aria-haspopup':'dialog'}});
   }
   return `<section class="month-cell ${outside?'outside':''} ${day.key===this._todayKey?'today':''}" aria-label="${escapeCalendarHtml(this._dayFormatter({weekday:'long',day:'numeric',month:'long'}).format(Date.parse(`${day.key}T12:00:00Z`)))}"><div class="month-cell-head"><time datetime="${day.key}">${Number(day.key.slice(8))}</time>${this._weatherFor(day.key,forecast)}</div>${visible.map(event=>this._eventButton(event,day,'month')).join('')}${more}</section>`;
  }).join('');
  return `<div class="horizontal" tabindex="0" role="region" aria-label="${label('month',dutch)}"><div class="month-grid">${names.map(name=>`<div class="month-weekday">${escapeCalendarHtml(name)}</div>`).join('')}${rows}</div></div>`;
 }
 _status(){const dutch=isDutch(this._hass),states=Object.values(this._statuses);if(states.includes('error'))return `<p class="status error" role="status">${label('failed',dutch)}<button type="button" data-retry>${label('retry',dutch)}</button></p>`;
  if(states.includes('loading'))return `<p class="status" role="status">${label('loading',dutch)}</p>`;return '';}
 _rangeLabel(range){const short=this._dayFormatter({day:'numeric',month:'short'});if(this._view==='month')return this._dayFormatter({month:'long',year:'numeric'}).format(Date.parse(`${range.monthKey}T12:00:00Z`));return `${short.format(Date.parse(`${range.startKey}T12:00:00Z`))}–${short.format(Date.parse(`${nextCalendarDayKey(range.endKey,-1)}T12:00:00Z`))}`;}
 _infoPopup(dutch,range,days){
  const unique=events=>[...new Map(events.map(event=>[calendarEventKey(event),event])).values()];
  const periodDays=this._view==='month'?days.filter(day=>day.key.slice(0,7)===range.monthKey.slice(0,7)):days;
  const all=unique(periodDays.flatMap(day=>day.events));
  const locale=dutch?'nl-NL':'en-GB',nextFormat=new Intl.DateTimeFormat(locale,{timeZone:this._zone(),weekday:'short',day:'numeric',month:'short'});
  const rows=this._config.entities.map(row=>{
   const id=row.entity,events=all.filter(event=>event.calendar===id),next=nextCalendarEvent(events),hidden=this._hiddenCalendars.has(id),status=this._statuses[id],failed=this._calendarFailed(id);
   const states=[hidden?label('hidden',dutch):'',failed?label('calendarUnavailable',dutch):status==='loading'?label('loading',dutch):status!=='ready'?label('noData',dutch):''].filter(Boolean);
   const nextText=next?escapeCalendarHtml(next.summary||label('title',dutch)):'—',nextWhen=next?`${nextFormat.format(next.start)}${next.allDay?` · ${label('allDay',dutch)}`:` · ${this._time(next.start)}`}`:'';
   return `<section class="insight-sensor" data-information-entity="${escapeCalendarHtml(id)}"><div class="insight-sensor-heading"><i class="dot" style="--event-color:${this._eventColor(id)}" aria-hidden="true"></i><strong>${escapeCalendarHtml(this._calendarName(id))}</strong></div><dl class="insight-metrics calendar-agenda-metrics"><div><dt>${label('appointments',dutch)}</dt><dd>${status==='ready'?events.length:'—'}</dd></div><div><dt>${label('nextAppointment',dutch)}</dt><dd>${status==='ready'?nextText:'—'}${status==='ready'&&next?`<small>${escapeCalendarHtml(nextWhen)}</small>`:''}</dd></div></dl>${states.length?`<div class="insight-states" role="status">${escapeCalendarHtml(states.join(' · '))}</div>`:''}</section>`;
  }).join('');
  const content=`<div class="calendar-info"><div class="insight-sensors">${rows}</div></div>`;
  return uiPopup({id:'calendar-info',className:'insight-popup',title:dutch?'Gegevens':'Data information',closeLabel:label('close',dutch),content});
 }
 _cleanupUI(){for(const controller of this._popupControllers){controller.close();controller.disconnect();}this._popupControllers=[];}
 _render(){
  if(!this._config)return;
  const dutch=isDutch(this._hass),range=this._range(),renderKey=`${this._view}/${range.startKey}/${range.endKey}`,sameRange=this._renderKey===renderKey,scroll=sameRange?this.shadowRoot.querySelector('.horizontal')?.scrollLeft??0:0,scrollTop=sameRange?this.shadowRoot.querySelector('.calendar-body')?.scrollTop??0:0,focusedNav=this.shadowRoot.activeElement?.dataset?.nav;
  this._renderKey=renderKey;
  this._cleanupUI();
  if(this._emptyConfig){this._displayEvents=[];this._updateNextEvent();this.shadowRoot.innerHTML=`<style>${calendarCardStyles()}</style><ha-card><div class="content"><div class="status">${label('select',dutch)}</div></div></ha-card>`;return;}
  const visibleEntities=this._config.entities.filter(row=>!this._hiddenCalendars.has(row.entity));
  const daysKey=`${range.start}/${range.end}/${this._zone()}/${this._eventRevision??0}/${this._config.entities.map(row=>row.entity).join('|')}`;
  if(this._daysKey!==daysKey){this._daysCache=calendarDaysWithEvents(range,this._events,this._config.entities,this._zone());this._daysKey=daysKey;}
  const days=this._daysCache,visibleDays=days.map(day=>({...day,events:day.events.filter(event=>!this._hiddenCalendars.has(event.calendar))})),forecast=forecastByCalendarDay(this._forecast,this._zone());
  this._displayEvents=visibleDays.flatMap(day=>day.events);
  this._popupSeq=0;this._popupMarkup=[];
  const loadingOnly=Object.values(this._statuses).length>0&&Object.values(this._statuses).every(status=>status==='loading')&&!Object.values(this._events).some(events=>events.length);
  const body=!visibleEntities.length?`<p class="status" role="status">${label('allHidden',dutch)}</p>`:loadingOnly?'':this._view==='columns'?this._columns(visibleDays,forecast):this._view==='month'?this._month(visibleDays,range,forecast):this._list(visibleDays,forecast);
  const button=(action,content,name)=>uiButton({content,label:name,title:name,attrs:{'data-nav':action}});
  const navigation=this._config.show_navigation?`<div class="navigation"><span class="range">${escapeCalendarHtml(this._rangeLabel(range))}</span>${button('previous',cardHeaderIcon('previous'),label('previous',dutch))}${button('now',label('now',dutch),this._view==='month'?label('today',dutch):label('now',dutch))}${button('next',cardHeaderIcon('next'),label('next',dutch))}</div>`:'';
  const info=uiButton({content:cardHeaderIcon('info'),className:'info-button',label:label('info',dutch),attrs:{'data-info':'','aria-controls':'calendar-info','aria-haspopup':'dialog'}});
  const legend=this._config.show_legend?uiLegend({items:this._config.entities.map(row=>{const name=this._calendarName(row.entity),visible=!this._hiddenCalendars.has(row.entity),failed=this._calendarFailed(row.entity),failure=failed?label('calendarUnavailable',dutch):'';return {id:row.entity,visible,title:label(visible?'hideCalendar':'showCalendar',dutch)+' '+name+'.'+(failure?' '+failure+'.':''),attrs:{'data-calendar':row.entity,'data-calendar-error':failed?'':null,'aria-label':failure?name+'. '+failure:null,style:`--event-color:${this._eventColor(row.entity)}`},content:`<i class="dot"></i><span>${escapeCalendarHtml(name)}</span>${failed?'<b class="legend-error" aria-hidden="true">!</b>':''}`};})}):'';
  this.shadowRoot.innerHTML=`<style>${uiButtonStyles()}${uiPopupStyles()}${calendarCardStyles()}</style><ha-card class="${this._config.density==='compact'?'compact':''}"><div class="content"><header class="header">${this._config.show_title?`<h2>${escapeCalendarHtml(this._config.title||label('title',dutch))}</h2>`:''}<div class="header-actions">${navigation}${info}</div></header>${legend}${this._status()}<div class="calendar-body">${body}</div>${this._infoPopup(dutch,range,days)}${this._popupMarkup.join('')}</div></ha-card>`;
  const horizontal=this.shadowRoot.querySelector('.horizontal');if(horizontal)horizontal.scrollLeft=scroll;
  const calendarBody=this.shadowRoot.querySelector('.calendar-body');if(calendarBody)calendarBody.scrollTop=scrollTop;
  this._updateNextEvent();
  bindUILegend(this,{selector:'[data-calendar]',getId:button=>button.dataset.calendar,hint:label('soloHint',dutch),toggle:id=>this._toggleCalendar(id),isolate:id=>this._toggleCalendarIsolation(id)});
  for(const action of this.shadowRoot.querySelectorAll('[data-nav]'))action.onclick=()=>{const kind=action.dataset.nav;this._offset=kind==='now'?0:this._offset+(kind==='previous'?-1:1);this._startCalendars();this._render();this.shadowRoot.querySelector(`[data-nav="${kind}"]`)?.focus({preventScroll:true});};
  if(focusedNav)this.shadowRoot.querySelector(`[data-nav="${focusedNav}"]`)?.focus({preventScroll:true});
  const makePopup=(trigger,popup)=>{let control;control=bindUIPopup({trigger,popup,container:this.shadowRoot.querySelector('ha-card'),beforeOpen:()=>this._popupControllers.forEach(item=>{if(item!==control)item.close();})});this._popupControllers.push(control);};
  makePopup(this.shadowRoot.querySelector('[data-info]'),this.shadowRoot.querySelector('#calendar-info'));
  for(const trigger of this.shadowRoot.querySelectorAll('[data-event-popup-id]'))makePopup(trigger,this.shadowRoot.getElementById(trigger.dataset.eventPopupId));
  this.shadowRoot.querySelector('[data-retry]')?.addEventListener('click',()=>{this._calendarRetryFailures=0;this._startCalendars();this._render();});
 }
}

if(!customElements.get('eleven-calendar-card'))customElements.define('eleven-calendar-card',CalendarCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(card=>card.type==='eleven-calendar-card'))window.customCards.push({type:'eleven-calendar-card',name:'Eleven Calendar (beta)',description:'Calendar events in a list, day columns or month view, with optional weather.',preview:true});
})();
