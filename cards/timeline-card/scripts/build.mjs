import {readFile,mkdir,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const sources=['../../shared/ui-button.js','../../shared/ui-legend.js','../../shared/ui-tabs.js','../../shared/ui-popup.js','../../shared/card-header.js','../../shared/graph.js','../../shared/request.js','../../shared/periods.js','../../shared/period-controls.js','../../shared/chart-insights.js','src/timeline-utils.js','src/timeline-view.js','src/timeline-card.js'];
let code='';
for(const name of sources)code+=(await readFile(new URL(name,root),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+'\n';
await mkdir(new URL('dist/',root),{recursive:true});
await writeFile(new URL('dist/eleven-timeline-card.js',root),'(()=>{\n'+code+'\n})();\n');
