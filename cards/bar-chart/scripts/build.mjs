import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const sources=['../../shared/graph.js','../../shared/ui-button.js','../../shared/ui-legend.js','../../shared/ui-tabs.js','../../shared/ui-popup.js','../../shared/card-header.js','../../shared/request.js','../../shared/periods.js','../../shared/period-controls.js','../../shared/chart-insights.js','../history-graph-card/src/history-utils.js','../history-graph-card/src/localization.js','../history-graph-card/src/eleven.js','../history-graph-card/src/library.js','../history-graph-card/src/history-graph-card.js','src/bar-chart.js'];
let bundle='/* Eleven Bar Chart — local beta; standalone, based on Eleven History. */\n(()=>{\n"use strict";\n';
for(const source of sources){
 let code=await readFile(new URL(source,root),'utf8');
 if(source.endsWith('/history-graph-card.js'))code=code.slice(0,code.indexOf("if(!customElements.get('eleven-history-graph-card'))"));
 bundle+=`\n// ${source}\n`+code.replace(/^import .*?;\n/gm,'').replace(/^export /gm,'');
}
bundle+='\n})();\n';await mkdir(new URL('dist/',root),{recursive:true});
const target=new URL('dist/eleven-bar-chart.js',root),tmp=new URL(`dist/.bar-${process.pid}.tmp`,root);
await writeFile(tmp,bundle);await rename(tmp,target);console.log(`Built dist/eleven-bar-chart.js (${Buffer.byteLength(bundle)} bytes)`);
