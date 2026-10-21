import {timeframeSyncConfig,connectTimeframeSync,disconnectTimeframeSync} from '../../../shared/periods.js';
import {disconnectPeriodControls} from '../../../shared/period-controls.js';
import {SharedGraph} from '../../../shared/graph.js';
import {segments} from './timeline-utils.js';
import {TimelineView} from './timeline-view.js';
import {resetGraphPeriod,graphPeriodRange} from '../../../shared/periods.js';
import {retryDelay} from '../../../shared/request.js';
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
import {chartSeriesVisible,disconnectChartInsights} from '../../../shared/chart-insights.js';
export class TimelineCard extends HTMLElement{
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
