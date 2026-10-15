import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editorConfig,updateSeriesRow,cardConfig,validateConfig} from '../src/history-utils.js';
test('selecting an entity in a new native row never turns empty own-style choices into self links',()=>{
 const original=editorConfig({entities:['sensor.a']});
 original.entities[0].line_style_source='';
 const blank=editorConfig({entities:['']}).entities[0];
 const data={...original,entities:[...original.entities,blank]};
 const result=updateSeriesRow(data,1,{...blank,entity:'sensor.b',line_style_source:''});
 assert.equal(result.entities[0].line_style_source,'');
 assert.ok(!result.entities[1].line_style_source);
 assert.deepEqual(validateConfig(cardConfig(result)).entities,['sensor.a','sensor.b']);
 assert.equal(data.entities[1].entity,'');
});
