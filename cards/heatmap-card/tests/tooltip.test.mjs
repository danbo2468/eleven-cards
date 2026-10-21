import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig} from '../src/heatmap-utils.js';
globalThis.HTMLElement=class{attachShadow(){this.shadowRoot={querySelector:()=>null,querySelectorAll:()=>[]};}};
const {HeatmapCard}=await import('../src/heatmap-card.js');

function harness({value=0,partial=false,cellLeft=270,cellTop=260}={}){
  const attributes=new Map(),cell={key:'2026-10-01/0',hour:0,value,partial,records:[],coverage:3600000,intervals:[{start:Date.parse('2026-10-01T00:00:00Z'),end:Date.parse('2026-10-01T01:00:00Z')}]};
  const target={dataset:{cell:cell.key},getBoundingClientRect:()=>({left:cellLeft,right:cellLeft+24,top:cellTop,bottom:cellTop+24}),setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key)};
  const box={left:20,right:308,top:100,bottom:400},chart={getBoundingClientRect:()=>box};
  const tooltip={hidden:true,style:{},getBoundingClientRect:()=>({width:260,height:70})},announcement={};
  const listeners=[];
  const events={addEventListener:(event,handler)=>listeners.push({event,handler}),removeEventListener:(event,handler)=>{const i=listeners.findIndex(row=>row.event===event&&row.handler===handler);if(i>=0)listeners.splice(i,1);}};
  globalThis.window={innerWidth:320,innerHeight:480,...events};globalThis.document={...events};
  const card=new HeatmapCard();card._config=normalizeConfig({entity:'sensor.test'});card._hass={states:{'sensor.test':{attributes:{friendly_name:'Kitchen <script>alert(1)</script>'}}}};
  card._data={unit:'W'};card._zone='UTC';card._rows=[{cells:[cell]}];card._cells=new Map([[cell.key,cell]]);card._dateLabels=new Map([['2026-10-01','1 Oct 2026']]);
  card.shadowRoot={...events,activeElement:target,querySelector:selector=>({'.tooltip':tooltip,'.chart':chart,'.matrix-scroll':chart,'.announcement':announcement}[selector]??null),querySelectorAll:selector=>selector==='[data-cell]'?[target]:selector==='[aria-describedby="heatmap-tooltip"]'&&attributes.has('aria-describedby')?[target]:[]};
  return {card,cell,tooltip,target,attributes,listeners,announcement,box};
}

test('value popup escapes labels, preserves zero and fits a narrow chart',()=>{
  const {card,cell,tooltip,attributes,announcement,box}=harness();
  card._showTooltip(cell.key);
  assert.equal(tooltip.hidden,false);assert.match(tooltip.innerHTML,/Kitchen &lt;script&gt;/);assert.doesNotMatch(tooltip.innerHTML,/<script>/);
  assert.match(tooltip.innerHTML,/>0 W</);assert.equal(attributes.get('aria-describedby'),'heatmap-tooltip');
  const left=parseFloat(tooltip.style.left)+box.left,top=parseFloat(tooltip.style.top)+box.top;
  assert.ok(left>=box.left && left+260<=box.right);assert.ok(top>=box.top && top+70<=box.bottom);
  card._hideTooltip();assert.equal(tooltip.hidden,true);assert.equal(attributes.has('aria-describedby'),false);
  card._showTooltip(cell.key);card._showTooltip('removed/date');assert.equal(tooltip.hidden,true);assert.equal(card._tooltipKey,null);
});

test('custom sensor name appears in hover and information popups',()=>{
  const {card,cell,tooltip}=harness();
  card._config.name='Nieuwe <naam>';
  card._showTooltip(cell.key);
  assert.match(tooltip.innerHTML,/Nieuwe &lt;naam&gt;/);
  assert.doesNotMatch(tooltip.innerHTML,/Kitchen/);
  card._status='ready';card._lastLoad={sources:[{id:'sensor.test',source:'history'}],summary:{rows:[]}};
  assert.match(card._information('en'),/Nieuwe &lt;naam&gt;/);
  card._config.name='  ';
  assert.match(card._information('en'),/Kitchen &lt;script&gt;/);
});

test('missing values have a missing label; incomplete values retain status; other popups suppress hover',()=>{
  const missing=harness({value:null});missing.card._showTooltip(missing.cell.key);assert.match(missing.tooltip.innerHTML,/No data/);assert.doesNotMatch(missing.tooltip.innerHTML,/>0 W</);
  const incomplete=harness({value:-1,partial:true});incomplete.card._showTooltip(incomplete.cell.key);assert.match(incomplete.tooltip.innerHTML,/-1 W/);assert.match(incomplete.tooltip.innerHTML,/Incomplete/);
  incomplete.card._insightOpen='data';incomplete.card._showTooltip(incomplete.cell.key);assert.equal(incomplete.tooltip.hidden,true);
  incomplete.card._insightOpen=null;incomplete.card._periodMenuOpen=true;incomplete.card._showTooltip(incomplete.cell.key);assert.equal(incomplete.tooltip.hidden,true);
});

test('Escape, leaving the chart and outside interaction dismiss the popup; cleanup removes listeners',()=>{
  const {card,cell,tooltip,listeners}=harness();card._bindTooltip();card._showTooltip(cell.key);
  card.shadowRoot.querySelector('.chart').onpointerleave();assert.equal(tooltip.hidden,true);
  card._showTooltip(cell.key);listeners.find(row=>row.event==='pointerdown').handler({composedPath:()=>[]});assert.equal(tooltip.hidden,true);
  card._showTooltip(cell.key);let prevented=false;listeners.find(row=>row.event==='keydown').handler({key:'Escape',preventDefault:()=>prevented=true});
  assert.equal(prevented,true);assert.equal(tooltip.hidden,true);card._disconnectTooltip();assert.equal(listeners.length,0);
});

test('internal scrolling dismisses hover; restoring the same scroll position does not',()=>{
  const {card,cell,tooltip,listeners}=harness();card._bindTooltip();card._showTooltip(cell.key);
  const scroll=card.shadowRoot.querySelector('.matrix-scroll'),event={target:scroll,composedPath:()=>[scroll]};
  listeners.find(row=>row.event==='scroll').handler(event);assert.equal(tooltip.hidden,false);
  scroll.scrollLeft=100;listeners.find(row=>row.event==='scroll').handler(event);assert.equal(tooltip.hidden,true);
  card._disconnectTooltip();
});

test('repeated DST hour retains both offsets in the popup interval',()=>{
  const {card,cell}=harness();card._zone='Europe/Amsterdam';cell.intervals=[{start:Date.parse('2026-10-25T00:00:00Z'),end:Date.parse('2026-10-25T01:00:00Z')},{start:Date.parse('2026-10-25T01:00:00Z'),end:Date.parse('2026-10-25T02:00:00Z')}];
  const label=card._cellBounds(cell);assert.match(label,/GMT\+2/);assert.match(label,/GMT\+1/);
});
