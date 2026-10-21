import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const sources=['../../shared/graph.js','../../shared/ui-button.js','../../shared/ui-legend.js','../../shared/ui-tabs.js','../../shared/ui-popup.js','../../shared/card-header.js','../../shared/request.js','../../shared/periods.js','../../shared/period-controls.js','../../shared/chart-insights.js','src/history-utils.js','src/localization.js','src/eleven.js','src/library.js','src/history-graph-card.js'];
const {version}=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
const library=await readFile(new URL('src/library.js',root),'utf8');
if(!library.includes(`ELEVEN_VERSION='${version}'`))throw new Error('Library/package version mismatch');
let bundle=`/* Eleven Cards ${version} — Eleven History Graph Card; standalone, no dependencies. */\n(()=>{\n"use strict";\n`;
for(const source of sources){const code=await readFile(new URL(source,root),'utf8');bundle+=`\n// ${source}\n`+code.replace(/^import .*?;\n/gm,'').replace(/^export /gm,'');}
bundle+='\n})();\n';
await mkdir(new URL('dist/',root),{recursive:true});
const target=new URL('dist/eleven-history-graph-card.js',root),temporary=new URL(`dist/.history-${process.pid}.tmp`,root);
await writeFile(temporary,bundle);await rename(temporary,target);
console.log('Built dist/eleven-history-graph-card.js ('+Buffer.byteLength(bundle)+' bytes)');
