import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isElevenMinute,elevenMarkup,elevenStyles} from '../src/eleven.js';
test('elf appears only during 11:11 in HA timezone, including DST',()=>{
 for(const [stamp,visible] of [['2026-10-14T09:10:59.999Z',false],['2026-10-14T09:11:00Z',true],['2026-10-14T09:11:59.999Z',true],['2026-10-14T09:12:00Z',false],['2026-12-14T10:11:30Z',true],['2026-10-14T21:11:30Z',false]])assert.equal(isElevenMinute(new Date(stamp),'Europe/Amsterdam'),visible,stamp);
 assert.doesNotThrow(()=>isElevenMinute(new Date(),'invalid'));
});
test('elf artwork uses sapphire and gold, translucent detailed wings, no muted green',()=>{
 const markup=elevenMarkup(1200);
 assert.match(markup,/#2563eb/);
 assert.match(markup,/#fbbf24/);
 assert.match(markup,/class="elf-wing-veins"/);
 assert.match(markup,/class="elf-sparkles"/);
 assert.doesNotMatch(markup,/#527d70|#6b9b88/);
 assert.match(markup,/animation-delay:-1200ms/);
});
test('small decorative elf, no pointer interception; reduced motion supported',()=>{
 assert.match(elevenMarkup(),/aria-hidden="true"/);
 assert.match(elevenMarkup(),/<svg/);
 assert.match(elevenStyles(),/pointer-events:none/);
 assert.match(elevenStyles(),/prefers-reduced-motion/);
});
