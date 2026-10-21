import {readFile, writeFile, mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const files=['../../shared/request.js','../../shared/periods.js','../../shared/ui-button.js','../../shared/ui-legend.js','../../shared/ui-tabs.js','../../shared/ui-popup.js','../../shared/card-header.js','../../shared/period-controls.js','../../shared/chart-insights.js','../../shared/graph.js','src/heatmap-utils.js','src/heatmap-card.js'];
const sources=await Promise.all(files.map(async path=>(await readFile(new URL(path,root),'utf8')).replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')));
const output=`// Eleven Heatmap (beta) 0.3.0 — self-contained standalone module\n(()=>{\n${sources.join('\n')}\nif(!customElements.get('eleven-heatmap-card'))customElements.define('eleven-heatmap-card',HeatmapCard);\nwindow.customCards=window.customCards||[];\nif(!window.customCards.some(c=>c.type==='eleven-heatmap-card'))window.customCards.push({type:'eleven-heatmap-card',name:'Eleven Heatmap (beta)',description:'Sensor averages or consumption grouped by hour, day, week or month.',preview:true});\n})();\n`;
await mkdir(new URL('dist/',root),{recursive:true});
await writeFile(new URL('dist/eleven-heatmap-card.js',root),output);
console.log('Built Eleven Heatmap (beta) 0.3.0');
