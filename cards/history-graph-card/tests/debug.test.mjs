import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const bundle=()=>readFileSync(new URL('../dist/eleven-history-graph-card.js',import.meta.url),'utf8');
function fixture(){
 const logs=[],timers=new Map();let now=Date.parse('2026-10-14T12:00:00Z'),id=0;
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const parent={elf:null,querySelector(){return this.elf;},insertAdjacentHTML(){this.elf={remove:()=>{this.elf=null;}};}};
 const registry=new Map();const context=vm.createContext({Date:Clock,Intl,console:{log:(...a)=>logs.push(a)},HTMLElement:class{attachShadow(){this.shadowRoot={querySelector:s=>s==='.eleven-elf'?parent.elf:parent};}},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},document:{addEventListener(){},removeEventListener(){}},setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:i=>timers.delete(i)});
 vm.runInContext(bundle(),context);const C=registry.get('eleven-history-graph-card');
 return {context,logs,timers,parent,C,advance(ms){now+=ms;for(const [i,t] of [...timers])if(t.at<=now){timers.delete(i);t.fn();}}};
}
test('console elf preview works outside 11:11, expires, survives sync and cleans up on disconnect',()=>{
 const f=fixture(),card=new f.C();card.connectedCallback();assert.equal(f.parent.elf,null);
 assert.equal(typeof f.context.window.elevenCards?.debug?.elf,'function');
 assert.equal(f.context.window.elevenCards.debug.elf(),1);assert.ok(f.parent.elf);
 card._syncElf();assert.ok(f.parent.elf);f.advance(4199);assert.ok(f.parent.elf);f.advance(1);assert.equal(f.parent.elf,null);
 f.context.window.elevenCards.debug.elf();assert.ok(f.parent.elf);card.disconnectedCallback();assert.equal(f.timers.size,0);
 assert.equal(f.context.window.elevenCards.debug.elf(),0);
});
test('daily flyby finishes once, survives same-minute sync and reconnect, returns next day',()=>{
 const f=fixture(),card=new f.C();card._hass={config:{time_zone:'Atlantic/Cape_Verde'}};
 f.advance(11*60000);card.connectedCallback();assert.ok(f.parent.elf);
 f.advance(4200);assert.equal(f.parent.elf,null);card._syncElf();assert.equal(f.parent.elf,null);
 card.disconnectedCallback();card.connectedCallback();assert.equal(f.parent.elf,null);
 f.advance(86400000);assert.ok(f.parent.elf);card.disconnectedCallback();
});
test('library prints one styled single-line name/version banner, not per card or duplicate bundle',()=>{
 const f=fixture();assert.equal(f.logs.length,1);assert.match(f.logs[0][0],/%c.*Eleven Cards.*%c.*\d+\.\d+\.\d+-local/);assert.ok(!f.logs[0][0].includes('by hidder11'));assert.ok(!f.logs[0][0].includes('\n'));
 assert.match(f.logs[0][1],/background:#20252b/i);assert.match(f.logs[0][1],/color:#ffffff/i);
 assert.match(f.logs[0][2],/background:#343b43/i);assert.match(f.logs[0][2],/color:#e5e7eb/i);assert.match(f.logs[0][1],/border-bottom:3px solid #607d94/i);assert.match(f.logs[0][2],/border-bottom:3px solid #607d94/i);assert.ok(!f.logs[0].slice(1).join('').includes('border-left'));assert.match(f.logs[0][1],/border-radius:5px 0 0 5px/);assert.match(f.logs[0][2],/border-radius:0 5px 5px 0/);
 assert.ok(!f.logs[0].slice(1).join('').includes('#c8102e'));
 new f.C();new f.C();vm.runInContext(bundle(),f.context);assert.equal(f.logs.length,1);
});
