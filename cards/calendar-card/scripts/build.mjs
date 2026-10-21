import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const files=['../../shared/request.js','../../shared/periods.js','../../shared/ui-button.js','../../shared/ui-legend.js','../../shared/ui-popup.js','../../shared/card-header.js','src/calendar-utils.js','src/calendar-styles.js','src/calendar-card.js'];
const sources=await Promise.all(files.map(async file=>(await readFile(new URL(file,root),'utf8')).replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')));
const output=`// Eleven Calendar (beta) — self-contained standalone module\n(()=>{\n${sources.join('\n')}\nif(!customElements.get('eleven-calendar-card'))customElements.define('eleven-calendar-card',CalendarCard);\nwindow.customCards=window.customCards||[];\nif(!window.customCards.some(card=>card.type==='eleven-calendar-card'))window.customCards.push({type:'eleven-calendar-card',name:'Eleven Calendar (beta)',description:'Calendar events in a list, day columns or month view, with optional weather.',preview:true});\n})();\n`;
await mkdir(new URL('dist/',root),{recursive:true});
await writeFile(new URL('dist/eleven-calendar-card.js',root),output);
console.log('Built Eleven Calendar (beta)');
