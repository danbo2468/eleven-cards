import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('local feature version is synchronized in package, library and generated standalone build',()=>{
 const {version}=JSON.parse(read('../package.json'));assert.match(version,/^\d+\.\d+\.\d+-local$/);
 assert.ok(read('../src/library.js').includes(`ELEVEN_VERSION='${version}'`));
 assert.ok(read('../dist/eleven-history-graph-card.js').includes(`Eleven Cards ${version}`));
});
test('build atomically replaces its bundle rather than exposing empty concurrent-reader artifacts',()=>{
 const build=read('../scripts/build.mjs');assert.match(build,/await rename\(/);
 assert.doesNotMatch(build,/writeFile\(new URL\('dist\/eleven-history-graph-card\.js'/);
});
