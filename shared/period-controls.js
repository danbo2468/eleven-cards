import {cardHeaderIcon,closeOtherCardPopups,bindCardPopupPosition} from './card-header.js';
import {graphPeriodRange,chooseGraphPeriod,moveGraphPeriod} from './periods.js';
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
 if(zoomed||(past&&!['today','week','month','quarter','year'].includes(mode)&&hours<24)){
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
export function periodControls(host,language='en'){
 const active=host.shadowRoot.activeElement;
 if(!host._periodMenuPending)host._periodFocus=null;
 if(active?.closest?.('.header-actions'))host._periodFocus=active.dataset.periodOption!=null?`option:${active.dataset.periodOption}`:active.dataset.zoom!=null?`zoom:${active.dataset.zoom}`:active.classList.contains('history-link')?'history':active.dataset.period;
 if(host._config.show_navigation===false){host._periodMenuOpen=false;host._periodMenuPending=false;return {};}
 const previousMenu=host.shadowRoot.querySelector('.period-menu');
 if(previousMenu){
  host._periodMenuScroll=previousMenu.scrollTop;
  host._periodMenuOpen=!!host._periodMenuPending||(typeof previousMenu.showPopover==='function'?previousMenu.matches(':popover-open'):previousMenu.hasAttribute('data-fallback-open'));
 }
 const nl=language.startsWith('nl'),label=(en,nlText)=>nl?nlText:en,mode=host._periodMode??'configured',past=(host._periodOffset??0)<0;
 const standard=label(`Default (${host._config.hours_to_show} hours)`,`Standaard (${host._config.hours_to_show} uur)`);
 const rolling=[['1h',1],['6h',6],['12h',12],['24h',24],['48h',48],['7d',168],['14d',336],['30d',720],['90d',2160],['365d',8760]].map(([id,hours])=>[id,hours<168?label(`${hours} ${hours===1?'hour':'hours'}`,`${hours} uur`):label(`${hours/24} days`,`${hours/24} dagen`)]);
 const calendar=[['today',label('Today','Vandaag'),label('Day','Dag')],['week',label('This week','Deze week'),label('Week','Week')],['month',label('This month','Deze maand'),label('Month','Maand')],['quarter',label('This quarter','Dit kwartaal'),label('Quarter','Kwartaal')],['year',label('This year','Dit jaar'),label('Year','Jaar')]];
 if(host._periodHours!=null&&!rolling.some(([id])=>id===mode))rolling.push([mode,label(`${host._periodHours} hours`,`${host._periodHours} uur`)]);
 const calendarChoice=calendar.find(([id])=>id===mode),name=mode==='configured'?standard:calendarChoice?.[past?2:1]??rolling.find(([id])=>id===mode)?.[1]??standard;
 const choice=([value,text])=>`<button type="button" role="menuitemradio" aria-checked="${value===mode}" tabindex="-1" data-period-option="${periodEscape(value)}"><span>${periodEscape(text)}</span><span aria-hidden="true">${value===mode?'✓':''}</span></button>`;
 const {start,end}=host._status==='ready'&&Number.isFinite(host._viewStart)&&Number.isFinite(host._viewEnd)?{start:host._viewStart,end:host._viewEnd}:graphPeriodRange(host);
 const locale=nl?'nl-NL':'en-GB',zone=host._hass?.config?.time_zone||'UTC';
 const zoomed=host._status==='ready'&&(start>host._start+1||end<host._end-1);
 const compactName=compactPeriodName({start,end,mode,past,zoomed,hours:host._periodHours??host._config.hours_to_show,name,locale,zone});
 const format=new Intl.DateTimeFormat(locale,{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
 const range=`${format.format(start)} – ${format.format(end)}`;
 return {picker:`<div class="period-controls"><button type="button" class="period-trigger" data-period="menu" aria-haspopup="menu" aria-controls="eleven-period-menu" aria-expanded="${host._periodMenuOpen===true}" title="${periodEscape(range)}" aria-label="${label('Timeframe','Tijdvak')}: ${periodEscape(compactName)}" aria-description="${periodEscape(range)}${zoomed?`. ${label('Zoomed in','Ingezoomd')}`:''}"><span>${periodEscape(compactName)}</span>${cardHeaderIcon('down')}</button><div class="period-menu" id="eleven-period-menu" popover="auto" role="menu" aria-label="${label('Choose a period','Kies een periode')}"><div class="chart-popup-heading"><strong>${label('Timeframe','Tijdvak')}</strong><button type="button" role="menuitem" data-period="close" aria-label="${label('Close','Sluiten')}">×</button></div><div class="period-current-range">${periodEscape(range)}${zoomed?`<span class="zoom-status">${label('Zoomed in','Ingezoomd')}</span>`:''}</div><div class="period-default">${choice(['configured',standard])}</div><div class="period-menu-columns"><div role="group" aria-label="${label('Last','Afgelopen')}"><h3>${label('Last','Afgelopen')}</h3>${rolling.map(choice).join('')}</div><div role="group" aria-label="${label('Calendar','Kalender')}"><h3>${label('Calendar','Kalender')}</h3>${calendar.map(choice).join('')}<p>${label('From the start of the period until now. Use the arrows for previous periods.','Vanaf de start van het tijdvak tot nu. Gebruik de pijlen voor vorige perioden.')}</p></div></div></div></div>`,navigation:`<button type="button" data-period="previous" title="${label('Previous period','Vorige periode')}" aria-label="${label('Previous period','Vorige periode')}">${cardHeaderIcon('previous')}</button><button type="button" data-period="now" title="${label('Return to the current period','Terug naar de huidige periode')}">${label('Now','Nu')}</button><button type="button" data-period="next" title="${label('Next period','Volgende periode')}" aria-label="${label('Next period','Volgende periode')}"${past?'':' disabled'}>${cardHeaderIcon('next')}</button>`};
}
function restorePeriodFocus(host,items=[]){
 const key=host._periodFocus;if(!key)return;const root=host.shadowRoot;
 const target=key==='history'?root.querySelector('.history-link'):key.startsWith('zoom:')?root.querySelector('[data-zoom="'+key.slice(5)+'"]'):key.startsWith('option:')&&host._periodMenuOpen?items.find(item=>item.dataset.periodOption===key.slice(7)):root.querySelector('[data-period="'+(key.startsWith('option:')?'menu':key)+'"]');
 (target?.disabled?root.querySelector('[data-period="now"], [data-zoom="in"]:not(:disabled), .history-link'):target)?.focus?.({preventScroll:true});host._periodFocus=null;
}
export function disconnectPeriodControls(host,preserveState=false){host._periodMenuCleanup?.();host._periodMenuCleanup=null;if(!preserveState)host._periodMenuPending=false;}
export function bindPeriodControls(host){
 disconnectPeriodControls(host,true);
 const root=host.shadowRoot,nav=root.querySelector('.period-controls');if(!nav){restorePeriodFocus(host);return;}
 const menu=nav.querySelector('.period-menu'),trigger=nav.querySelector('[data-period="menu"]'),items=[...menu.querySelectorAll('[data-period-option]')],native=typeof menu.showPopover==='function';
 const cleanups=[];
 const listen=(target,event,handler,capture=false)=>{target?.addEventListener?.(event,handler,capture);cleanups.push(()=>target?.removeEventListener?.(event,handler,capture));};
 host._periodMenuCleanup=()=>cleanups.splice(0).forEach(remove=>remove());
 const isOpen=()=>native?menu.matches(':popover-open'):menu.hasAttribute('data-fallback-open');
 let focusPending=false;
 const placement=bindCardPopupPosition(host,trigger,menu,()=>host._periodMenuOpen,()=>{
  host._periodMenuPending=false;
  if(native){if(!isOpen())menu.showPopover();}else menu.setAttribute('data-fallback-open','');
  if(focusPending){(items.find(item=>item.getAttribute('aria-checked')==='true')??items[0]).focus({preventScroll:true});focusPending=false;}
  restorePeriodFocus(host,items);
 }),position=placement.position;
 cleanups.push(()=>placement.disconnect());
 const close=(restore=false)=>{
  host._periodMenuOpen=false;host._periodMenuPending=false;trigger.setAttribute('aria-expanded','false');
  if(native){if(menu.matches(':popover-open'))menu.hidePopover();}else menu.removeAttribute('data-fallback-open');
  if(restore)trigger.focus({preventScroll:true});
 };
 const open=(focus=true)=>{
  closeOtherCardPopups(host,'period');
  host._periodMenuOpen=true;host._periodMenuPending=true;focusPending=focus;trigger.setAttribute('aria-expanded','true');
  position();
 };
 // Remember the pointer state before native light dismissal runs on pointerup.
 let pointerWasOpen;
 trigger.onpointerdown=()=>{pointerWasOpen=host._periodMenuOpen;};
 trigger.onpointercancel=()=>{pointerWasOpen=undefined;};
 trigger.onclick=()=>{const wasOpen=pointerWasOpen??host._periodMenuOpen;pointerWasOpen=undefined;wasOpen?close(true):open();};
 menu.querySelector('[data-period="close"]').onclick=()=>close(true);
 trigger.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();if(e.key==='ArrowUp')items.at(-1).focus({preventScroll:true});}};
 menu.addEventListener('toggle',e=>{if(host.shadowRoot.querySelector('.period-menu')!==menu)return;host._periodMenuOpen=e.newState==='open';trigger.setAttribute('aria-expanded',String(host._periodMenuOpen));});
 for(const item of items)item.onclick=()=>{close(true);chooseGraphPeriod(host,item.dataset.periodOption);};
 menu.onkeydown=e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
  if(e.key==='Tab'){e.preventDefault();close(true);if(!e.shiftKey)root.querySelector('.chart-controls button:not(:disabled)')?.focus();return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const index=items.indexOf(host.shadowRoot.activeElement),next=e.key==='Home'?0:e.key==='End'?items.length-1:index<0?(e.key==='ArrowUp'?items.length-1:0):(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();}
 };
 for(const [key,direction]of [['previous',-1],['next',1],['now',0]])root.querySelector(`[data-period="${key}"]`).onclick=()=>{close();moveGraphPeriod(host,direction);};
 listen(window,'resize',()=>{if(host._periodMenuOpen)position();});
 listen(window,'scroll',e=>{if(isOpen()&&!e.composedPath().includes(menu))close();},true);
 listen(document,'pointerdown',e=>{if((!native||host._periodMenuPending)&&host._periodMenuOpen&&!e.composedPath().includes(nav))close();});
 if(host._periodMenuOpen){open(false);menu.scrollTop=host._periodMenuScroll??0;}
 if(!host._periodMenuPending)restorePeriodFocus(host,items);
}
export function periodControlsStyles(){return `
.period-controls{display:flex;min-width:0;max-width:100%}
.header-actions .period-trigger{width:auto;max-width:100%;gap:6px;padding:4px 10px;border:0;border-radius:5px;background:var(--secondary-background-color,#eee);font-weight:400}
.header-actions .period-trigger:hover{background:color-mix(in srgb,var(--primary-text-color,#20252b) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-trigger span{min-width:0;overflow-wrap:anywhere}
.period-current-range{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;margin:2px 0 10px}
.period-current-range .zoom-status{display:table;margin-top:4px}
.period-menu:popover-open{display:block}
.period-menu[data-fallback-open]{display:block}
.period-menu-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.period-menu h3{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--secondary-text-color,#666);margin:8px}
.period-menu button{font:inherit;font-size:12px;color:var(--primary-text-color,#20252b);background:transparent;box-sizing:border-box;display:flex;border:1px solid transparent;border-radius:5px;cursor:pointer;height:auto;width:100%;justify-content:space-between;gap:8px;min-height:34px;border-color:transparent;text-align:start;padding:6px 8px;font-weight:400}
.period-menu button:hover{background:var(--secondary-background-color,#eee)}
.period-menu button:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.period-menu button[aria-checked="true"]{color:var(--primary-color,#2196f3);background:color-mix(in srgb,var(--primary-color,#2196f3) 12%,var(--ha-card-background,var(--card-background-color,#fff)))}
.period-menu p{font-size:11px;line-height:1.5;color:var(--secondary-text-color,#666);margin:10px 8px 2px;overflow-wrap:anywhere}
.period-default{border-bottom:1px solid var(--divider-color,#ddd);padding-bottom:8px;margin-bottom:8px}
`;}
