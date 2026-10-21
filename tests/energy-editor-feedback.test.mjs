import * as periods from '../shared/periods.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as graph from '../shared/graph.js';
import * as utils from '../cards/dynamic-energy-price-card/src/price-utils.js';
import * as localization from '../cards/dynamic-energy-price-card/src/localization.js';
function load(language='en') {
  let Card;
  const ctx=vm.createContext({...periods,...graph,...utils,...localization,frontendHass:()=>({language}),HTMLElement:class {},window:{},document:{querySelector:()=>({hass:{language}})},customElements:{get:()=>undefined,define:(_,c)=>Card=c},setTimeout,clearTimeout,Date,Intl});
  const source=readFileSync(new URL('../cards/dynamic-energy-price-card/src/dynamic-energy-price-card.js',import.meta.url),'utf8').replace(/^import[^;]+;\s*/gm,'').replace(/^export /gm,'');
  vm.runInContext(source,ctx);return {Card,ctx};
}
const fields=s=>s.flatMap(f=>f.schema?fields(f.schema):[f]);
test('only inactive period table helpers receive the theme warning color',()=>{
  const {ctx,Card}=load();
  ctx.document.createElement=tag=>({localName:tag,style:{},setAttribute(k,v){this[k]=v;}});
  const editor=vm.runInContext('Object.create(EnergySettingsEditor.prototype)',ctx);
  editor._hass={language:'en'};
  for(const [toggle,hours] of [['show_cheapest_table','cheapest_hours'],['show_export_table','export_best_hours']]){
    for(const [enabled,count] of [[true,0],[true,3],[false,0]]){
      editor._data=Card.editorConfig({[toggle]:enabled,[hours]:count});
      const helper=editor._computeHelper(Card.getConfigForm(editor._data),{name:toggle});
      if(enabled&&count===0){
        assert.equal(helper.localName,'span');
        assert.equal(helper.style.color,'var(--warning-color, #ff9800)');
        assert.equal(helper.style.fontWeight,'600');
        assert.equal(helper.role,'status');
        assert.match(helper.textContent,/not shown.*0 hours/i);
      }else assert.equal(typeof helper,'string');
    }
  }
  assert.equal(typeof editor._computeHelper(Card.getConfigForm({}),{name:'cheapest_hours'}),'string');
});
test('editor price fields use cents and preserve euro YAML roundtrips without mutating inputs',()=>{
  const {Card}=load();
  const stored=Object.freeze({entity:'sensor.a',cheap_price:.15,normal_price:.253,expensive_price:.4,export_price_offset:-.0123,title:'Keep'});
  const display=Card.editorDisplayConfig(stored);
  assert.equal(display.cheap_price,15);assert.equal(display.normal_price,25.3);assert.equal(display.export_price_offset,-1.23);
  const f=Card.getConfigForm(stored);
  for(const key of ['cheap_price','normal_price','expensive_price','export_price_offset']){
    const field=fields(f.schema).find(f=>f.name===key);
    assert.equal(field.selector.number.unit_of_measurement,'ct/kWh');
    assert.equal(field.selector.number.min,-100);assert.equal(field.selector.number.max,100);
  }
  const back=Card.editorStoredConfig({...display,cheap_price:17,export_price_offset:-2.5});
  assert.equal(back.cheap_price,.17);assert.equal(back.normal_price,.253);assert.equal(back.export_price_offset,-.025);
  assert.equal(stored.cheap_price,.15);assert.equal(back.title,'Keep');
  for(const price of [0,-.15,.29,.001,.253,.123456789]){
    assert.equal(Card.editorStoredConfig(Card.editorDisplayConfig({cheap_price:price})).cheap_price,price);
  }
});
test('table hints explain zero hours for the corresponding tariff only, in both languages',()=>{
  for(const language of ['en','nl'])for(const [toggle,hours,other] of [['show_cheapest_table','cheapest_hours','export_best_hours'],['show_export_table','export_best_hours','cheapest_hours']]){
    const {Card}=load(language),helper=c=>Card.getConfigForm(c).computeHelper({name:toggle});
    const warning=helper({[toggle]:true,[hours]:0,[other]:4});
    assert.match(warning,language==='nl'?/verschijnt niet.*0 uur/i:/not shown.*0 hours/i);
    assert.match(warning,language==='nl'?/meer dan 0/i:/greater than 0/i);
    assert.notEqual(helper({[toggle]:false,[hours]:0}),warning);
    assert.notEqual(helper({[toggle]:true,[hours]:3}),warning);
    assert.equal(helper({[toggle]:true}),warning);
  }
});
test('energy top section is General/Algemeen while graph mode remains Graph/Grafiek',()=>{
  for(const [language,title,mode] of [['en','General','Graph'],['nl','Algemeen','Grafiek']]){
    const {Card}=load(language),f=Card.getConfigForm({});
    assert.equal(f.schema[0].title,title);
    assert.equal(f.computeLabel({name:'graph_settings'}),title);
    assert.equal(f.computeLabel({name:'graph_mode'}),mode);
  }
});
