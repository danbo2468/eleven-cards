import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('energy build replaces the public bundle atomically for concurrent QA readers',()=>{
 const source=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/await writeFile\(outputPath,/);
 assert.match(source,/process\.pid/);
 assert.match(source,/await rename\(temporaryPath, outputPath\)/);
});
