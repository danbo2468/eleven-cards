import {mkdir, readFile, writeFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const paths = [
  'cards/dynamic-energy-price-card/dist/eleven-dynamic-energy-price-card.js',
  'cards/history-graph-card/dist/eleven-history-graph-card.js',
  'cards/timeline-card/dist/eleven-timeline-card.js',
  'cards/overview-card/dist/eleven-overview-card.js',
  'cards/bar-chart/dist/eleven-bar-chart.js',
  'cards/heatmap-card/dist/eleven-heatmap-card.js',
  'cards/calendar-card/dist/eleven-calendar-card.js',
];
// Each standalone module already has its own scope and duplicate-load guard.
const modules = await Promise.all(paths.map(path => readFile(new URL(path, root), 'utf8')));
await mkdir(new URL('dist/', root), {recursive: true});
await writeFile(new URL('dist/eleven-cards.js', root),
  '// Eleven Cards — HACS collection; seven cards, no external dependencies.\n' + modules.join('\n;\n'));
console.log('Built dist/eleven-cards.js');
