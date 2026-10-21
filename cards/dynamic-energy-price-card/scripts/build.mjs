import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilsPath = resolve(root, 'src/price-utils.js');
const cardPath = resolve(root, 'src/dynamic-energy-price-card.js');
const outputPath = resolve(root, 'dist/eleven-dynamic-energy-price-card.js');

const [utilsSource, cardSource, localizationSource, graphSource, periodsSource] = await Promise.all([
  readFile(utilsPath, 'utf8'),
  readFile(cardPath, 'utf8'),
  readFile(resolve(root, 'src/localization.js'), 'utf8'),
  readFile(resolve(root, '../../shared/graph.js'), 'utf8'),
  readFile(resolve(root, '../../shared/periods.js'), 'utf8'),
]);

const importPattern = /^import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/price-utils\.js['"];\s*/;
if (!importPattern.test(cardSource)) {
  throw new Error('Expected price-utils import was not found in the card source.');
}

const bundledUtils = utilsSource.replace(/^export\s+/gm, '');
const bundledLocalization = localizationSource.replace(/^export\s+/gm, '');
const bundledCard = cardSource.replace(importPattern, '').replace(/^import .* from ['"][^'"]+['"];\s*/gm, '');
const banner = '// Eleven Dynamic Energy Price Card — standalone dashboard bundle\n';

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = resolve(dirname(outputPath), `.energy-${process.pid}.tmp`);
await writeFile(temporaryPath, `${banner}(()=>{\n"use strict";\n${graphSource.replace(/^export /gm, '')}\n${periodsSource.replace(/^export /gm, '')}\n${bundledUtils}\n${bundledLocalization}\n${bundledCard}\n})();\n`, 'utf8');
await rename(temporaryPath, outputPath);
console.log(`Built ${outputPath}`);
