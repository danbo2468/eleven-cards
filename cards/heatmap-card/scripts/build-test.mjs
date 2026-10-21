import './build.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';

const root=new URL('../',import.meta.url),directory=new URL('../../.cache/home-assistant-test/',root);
const source=await readFile(new URL('dist/eleven-heatmap-card.js',root),'utf8');
const bundle=source.replaceAll('eleven-heatmap-card','eleven-heatmap-card-test')
  .replaceAll('eleven-heatmap-editor','eleven-heatmap-test-editor')
  .replaceAll("name:'Eleven Heatmap (beta)'","name:'Eleven Heatmap (test)'");
await mkdir(directory,{recursive:true});
await writeFile(new URL('eleven-heatmap-card-test.js',directory),'// Separate Heatmap test card; may coexist with the installed Eleven collection.\n'+bundle);
await writeFile(new URL('LEESMIJ-HEATMAP.md',directory),`# Heatmap apart testen

Deze testversie gebruikt een eigen kaartnaam en editor. De normale Eleven-kaarten en resources kunnen blijven staan.

1. Kopieer eleven-heatmap-card-test.js naar /config/www/eleven-heatmap-card-test.js in Home Assistant.
2. Voeg bij de dashboardbronnen /local/eleven-heatmap-card-test.js?v=heatmap-0.3.0-tabs-6 toe als JavaScript-module. Staat dezelfde testresource er al, pas dan alleen de versie achter ?v= aan.
3. Herlaad de browser met Ctrl+F5.
4. Voeg Eleven Heatmap (test) toe via de kaartkiezer, of dupliceer je heatmap en verander het type in custom:eleven-heatmap-card-test.

Voorbeeld (vervang de sensor door je eigen numerieke sensor met historie):

    type: custom:eleven-heatmap-card-test
    entity: sensor.jouw_temperatuursensor
    title: Heatmap test
    hours_to_show: 672
    aggregation_period: day
    mode: average

Open in de visuele editor Dataverwerking → Aggregatieperiode en wissel tussen uur, dag, week en maand. Het raster toont uren per dag, dagen per week, weken per ISO-jaar of maanden per jaar. De kalender volgt de Home Assistant-tijdzone. Weken beginnen op maandag.

Gemiddelden zijn tijdgewogen. Voor een teller met geschikte verbruiksstatistieken kun je mode: consumption kiezen: die telt Recorder-uurwijzigingen op, inclusief tellerresets. Ontbrekende gegevens blijven leeg; aangesneden perioden krijgen een markering.

Controleer ook kleurkeuze en kleurstops, rasterafmetingen, de legenda bovenaan, de hover-popup en de infoknop. Sla op en open de editor opnieuw om de bewaarde instellingen te controleren. De vakjes hebben geen klikacties of toetsenbordnavigatie.

Open het tabblad Eigen bereik in het tijdvakmenu. Vul Begin en Einde inclusief tijd in en klik Toepassen. De getoonde tijdzone is die van Home Assistant. Het bereik blijft vaststaan en mag maximaal 366 dagen zijn. Vorige/volgende verschuiven met dezelfde duur; Nu toont die duur tot het huidige moment. Standaard herstelt de ingestelde uren per kaart.

Nieuw: Tijdvak synchroniseren en Synchronisatiegroep staan onder Grafiek. Gebruik dezelfde groep bij andere bijgewerkte kaarten om de tijdvakkeuze en vorige/volgende/Nu te delen. Standaard staat dit uit. Voor meerdere testkaarten kun je vanuit de repository node scripts/build-test.mjs draaien: gebruik dan die testcollectie in plaats van deze losse heatmap-testresource. Zie LEESMIJ-TIJDVAK.md.

Opruimen: verwijder de testkaarten, de testresource en eventueel eleven-heatmap-card-test.js. De normale kaarten gebruiken hun bestaande types.
`);
console.log('Built separate Heatmap test module and Dutch instructions in .cache/home-assistant-test/.');
