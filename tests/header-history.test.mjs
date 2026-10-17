import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
function load(name){const registry=new Map();const ctx=vm.createContext({HTMLElement:class{attachShadow(){this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}},window:new EventTarget(),document:{querySelector:()=>null},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},setTimeout,clearTimeout,structuredClone,URLSearchParams,Date,Intl,console:{info(){},log(){}}});vm.runInContext(readFileSync(new URL(`../cards/${name}/dist/eleven-${name}.js`,import.meta.url),'utf8'),ctx);return registry.get(`eleven-${name}`);}
for(const name of ['history-graph-card','timeline-card'])test(`${name} header links all configured entities to native history and current viewport`,()=>{
 const C=load(name),c=new C();c.setConfig({entities:['sensor.a','sensor.b'],title:'Test',series_options:[{entity:'sensor.b',visible:false}]});
 assert.match(c.shadowRoot.innerHTML,/class="history-link"/,'history link also available while loading');
 const link=()=>{const m=c.shadowRoot.innerHTML.match(/class="history-link"[^>]*href="([^"]+)"/);assert.ok(m,'header has a native link');return new URL(m[1].replaceAll('&amp;','&'),'http://ha');};
 let url=link();assert.equal(url.pathname,'/history');assert.equal(url.searchParams.get('entity_id'),'sensor.a,sensor.b');
 c._start=0;c._end=86400000;c._viewport=[21600000,64800000];c._status='ready';c._hass={language:'en',states:Object.fromEntries(['sensor.a','sensor.b'].map(id=>[id,{attributes:{unit_of_measurement:'W'}}]))};
 c._series=name==='history-graph-card'?['sensor.a','sensor.b'].map(id=>({id,points:[{t:0,v:1}]})):[[{start:0,end:86400000,state:'on'}],[{start:0,end:86400000,state:'off'}]];
 c._render();url=link();assert.equal(url.searchParams.get('start_date'),new Date(21600000).toISOString());assert.equal(url.searchParams.get('end_date'),new Date(64800000).toISOString());assert.match(c.shadowRoot.innerHTML,/aria-label="Open in Home Assistant History"/);assert.match(c.shadowRoot.innerHTML,/<svg[^>]*aria-hidden="true"/);
 c._hass.language='nl';c._render();assert.match(c.shadowRoot.innerHTML,/aria-label="Open in Home Assistant Geschiedenis"/);
 c.setConfig({entities:['sensor.a'],title:''});assert.match(c.shadowRoot.innerHTML,/class="history-link"/,'also works without title');
});
