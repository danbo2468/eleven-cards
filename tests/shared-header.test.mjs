import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
function load(name){const registry=new Map();const ctx=vm.createContext({HTMLElement:class{attachShadow(){this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}},window:new EventTarget(),document:{querySelector:()=>null},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},setTimeout,clearTimeout,structuredClone,URLSearchParams,Date,Intl,console:{info(){},log(){}}});vm.runInContext(readFileSync(new URL(`../cards/${name}/dist/eleven-${name}.js`,import.meta.url),'utf8'),ctx);return registry.get(`eleven-${name}`);}
test('all three bundles share grouped timeframe controls, separate zoom and grouped history/info',()=>{
 const headers=[];
 for(const name of ['history-graph-card','bar-chart','timeline-card']){const C=load(name),c=new C();c.setConfig({entities:['sensor.a'],title:'Same'});c._status='ready';c._start=0;c._end=86400000;c._hass={language:'en',states:{'sensor.a':{attributes:{unit_of_measurement:'W'}}}};c._series=name==='timeline-card'?[[{start:0,end:86400000,state:'on'}]]:[{id:'sensor.a',points:[{t:0,v:1}]}];c._render();const html=c.shadowRoot.innerHTML;const header=html.match(/<header class="card-header">[\s\S]*?<\/header>/)?.[0];assert.ok(header,'shared header rendered');assert.equal((header.match(/<svg /g)||[]).length,10);assert.equal((header.match(/data-ui-popup-close/g)||[]).length,2);assert.doesNotMatch(header,/>[+−↺]</);assert.match(header,/<a class="history-link"[^>]*>[\s\S]*?<\/a><div class="insight-control"><button[^>]*data-insight="data"/);assert.match(header,/data-insight="data"[^>]*aria-label="Data information"[^>]*><svg[^]*?<\/svg><\/button>/);headers.push(header);assert.match(html,/stroke-width:2/);}
 assert.equal(headers[0],headers[1]);assert.equal(headers[0],headers[2]);
 const group=headers[0].match(/<div class="chart-controls"[^>]*>([\s\S]*?)<div class="zoom-controls"/)?.[1];assert.ok(group);
 assert.deepEqual([...group.matchAll(/data-(?:period|zoom)="([^"]+)"/g)].map(m=>m[1]),['menu','close','previous','now','next']);
 const zoom=headers[0].match(/<div class="zoom-controls"[^>]*>([\s\S]*?)<\/div>/)?.[1];assert.ok(zoom);
 assert.deepEqual([...zoom.matchAll(/data-zoom="([^"]+)"/g)].map(m=>m[1]),['out','in','reset']);
 assert.match(headers[0],/<div class="chart-links"[^>]*><a class="history-link"[^]*?<\/a><div class="insight-control">/);
});
test('timeline period arrows use the same SVG icon family',()=>{const C=load('timeline-card'),c=new C();c.setConfig({entities:['sensor.a']});assert.match(c.shadowRoot.innerHTML,/data-period="previous"[^>]*><svg /);assert.match(c.shadowRoot.innerHTML,/data-period="next"[^>]*><svg /);});
for(const name of ['history-graph-card','timeline-card'])test(`${name}: title toggle preserves configured title and history controls`,()=>{
 const C=load(name),c=new C();c.setConfig({entities:['sensor.a'],title:'A <title>',show_title:false});
 assert.doesNotMatch(c.shadowRoot.innerHTML,/<h2[ >]/);assert.match(c.shadowRoot.innerHTML,/class="history-link"/);
 assert.equal(c._config.title,'A <title>');c.setConfig({entities:['sensor.a'],title:'A <title>'});assert.match(c.shadowRoot.innerHTML,/A &lt;title&gt;/);
 const fields=s=>s.flatMap(f=>[f,...(f.schema?fields(f.schema):[])]);const field=fields(C.getConfigForm().schema).find(f=>f.name==='show_title');assert.ok(field?.selector?.boolean);assert.equal(field.default,true);
 const data=C.editorConfig?C.editorConfig({entities:['sensor.a'],title:'Saved',show_title:false}):null;
 if(data){assert.equal(data.show_title,false);assert.equal(C.cardConfig(data).show_title,false);assert.equal(C.cardConfig(data).title,'Saved');}
});
