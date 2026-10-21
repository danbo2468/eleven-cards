import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),directory=new URL('.cache/home-assistant-test/',root);
let source=await readFile(new URL('dist/eleven-cards.js',root),'utf8');
const names=['eleven-dynamic-energy-price-card','eleven-history-graph-card','eleven-timeline-card','eleven-overview-card','eleven-bar-chart','eleven-heatmap-card','eleven-calendar-card','eleven-energy-editor','eleven-history-graph-editor','eleven-timeline-editor','eleven-overview-editor','eleven-heatmap-editor','eleven-calendar-editor'];
for(const name of names)source=source.replaceAll(name,name+'-test');
// Bar Chart's editor contains its card name and was renamed with it above.
source=source.replaceAll("name:'Eleven ","name:'Eleven Test ").replaceAll("name: 'Eleven ","name: 'Eleven Test ");
await mkdir(directory,{recursive:true});
await writeFile(new URL('eleven-cards-test.js',directory),'// Local test collection with separate card/editor names.\n'+source);
await writeFile(new URL('LEESMIJ.md',directory),'# Eleven Cards lokaal testen\n\nLees LEESMIJ-TIJDVAK.md voor de actuele testcollectie met alle zeven kaarten en de installatie-instructies.\n');
await writeFile(new URL('LEESMIJ-TIJDVAK.md',directory),`# Tijdvaksynchronisatie testen

1. Kopieer eleven-cards-test.js naar /config/www/eleven-cards-test.js in Home Assistant.
2. Voeg /local/eleven-cards-test.js?v=calendar-13 toe als JavaScript-module bij de dashboardbronnen. Bestaat deze resource al, wijzig alleen de versie achter ?v=.
3. Herlaad met Ctrl+F5. Dupliceer de te testen kaarten en gebruik de testtypes hieronder. De normale Eleven-resource kan blijven staan.

    custom:eleven-history-graph-card-test
    custom:eleven-bar-chart-test
    custom:eleven-timeline-card-test
    custom:eleven-heatmap-card-test
    custom:eleven-calendar-card-test
    custom:eleven-overview-card-test
    custom:eleven-dynamic-energy-price-card-test

4. Zet bij de grafiekkaarten Tijdvak synchroniseren aan en vul dezelfde Synchronisatiegroep in, bijvoorbeeld energie. In YAML:

    sync_timeframe: true
    hover_sync_group: energie

5. Kies in History, Bar Chart, Timeline of Heatmap een tijdvak. Controleer dat alle gekoppelde kaarten volgen. Test vorige/volgende/Nu ook vanuit een andere kaart.
6. Controleer dat zoom en aggregatie lokaal blijven. Zet synchronisatie op één kaart uit of geef deze een andere groep: die kaart moet zelfstandig blijven werken.
7. Open het tabblad Eigen bereik in het tijdvakmenu, vul Begin en Einde in en klik Toepassen. Gebruik de getoonde Home Assistant-tijdzone. Alle gekoppelde kaarten moeten exact dit bereik volgen. Test ook een ongeldige volgorde; de kaart moet dan een melding tonen en het vorige bereik behouden. Maximaal 366 dagen.
8. Geef kaarten verschillende standaarduren, bijvoorbeeld History 24 en Heatmap 168. Kies een gedeelde periode en daarna Standaard: elke kaart moet weer zijn eigen ingestelde uren tonen. Overview toont weer actuele waarden en Energy het normale prijsvenster.

De tijdvakpopup heeft de tabbladen Afgelopen, Kalender en Eigen bereik. Standaard blijft erboven bereikbaar. Tabbladen wisselen verandert de gekozen periode niet; ingevulde datums blijven behouden. De tijdvakselectie en vorige/Nu/volgende vormen één groep. Zoom heeft een eigen groep. Geschiedenis en info staan samen in een groep. Op smalle kaarten blijven de knoppen binnen elke groep bij elkaar.

De nieuwe Agenda-kaart heeft een eigen kalendernavigatie. Kies in de configurator een of meer calendar-entiteiten, optioneel een weather-entiteit, de weergave (Daglijst, Dagkolommen of Maand), Compact of Uitgebreid en 1–14 dagen. De kaart toont alleen de gekozen weergave. Klik in de legenda op een agenda om die afspraken tijdelijk te verbergen of weer te tonen. Dubbelklik op een agenda om alleen die agenda te tonen; nogmaals dubbelklikken toont alles. Dit moet in alle drie weergaven werken. Compact toont minder details en in Maand twee afspraken per dag; de afspraak-popup blijft volledig. De maand toont een volledige kalender, onafhankelijk van het aantal dagen. Controleer ook de RGB-kleuren per agenda en afspraken die tijdens het bekijken worden bijgewerkt. Deze kaart neemt de grafiektijdvaksynchronisatie niet over.

Zet bij Agenda onder Weergave de optie Lege dagen verbergen in daglijst aan. De kolommen en maand houden hun volledige kalenderstructuur. De eerstvolgende afspraak heeft een subtiele markering die automatisch doorschuift. Bij een laadfout of niet-beschikbare agenda verschijnt een waarschuwing bij dat legenda-item.

Open de Gegevens-popup van Agenda: per agenda staan Afspraken en Eerstvolgende naast elkaar, zonder algemene periode- of weersinformatie. Meerdaagse afspraken tellen één keer. De gekleurde markering naast de naam hoort ook bij de sensoren in de grafiekgegevenspopups. Controleer dat het sluitkruisje in alle popups midden in de knop staat. Open daarna een afspraak: de popup toont een datum- en tijdblok en, indien beschikbaar, aparte velden voor locatie en beschrijving. Controleer ook een hele dag en een afspraak over meerdere dagen.

Open voor elk van de zeven testkaarten het tabblad Indeling en pas het aantal rijen aan. Controleer een kleine en een grote hoogte, ook op een smalle kaart. De kaart moet binnen de toegewezen ruimte blijven en zo nodig intern scrollen. Test Agenda ook in Dagkolommen en Maand, compact en uitgebreid.

Scroll op de dashboardpagina met de muis boven een kaart die zelf niet kan scrollen, en boven een kaart waarvan de interne scrollbalk bovenaan of onderaan staat. De pagina moet door kunnen scrollen. Binnen een hoge agenda of heatmap blijft intern scrollen werken. De Agenda-infopopup toont de gekozen periode, aantallen, status per agenda en de eerstvolgende afspraak. Geef bij Heatmap een Sensornaam op en controleer die in de hoverpopup en de infopopup.

Overview volgt het gekozen bereik en toont de laatst vastgelegde waarde bij het einde ervan. De prijskaart volgt met de prijsintervallen die de bron beschikbaar heeft; een periode zonder bronprijzen krijgt een melding. De actuele prijs blijft als actuele prijs gelden. Deze twee kaarten hebben zelf geen tijdvakmenu.

Standaard staat synchronisatie uit. Een lege groepssleutel gebruikt de standaardgroep. De keuze wordt alleen gedeeld in deze geopende pagina; YAML blijft gelijk. Later toegevoegde kaarten volgen de laatste groepskeuze. Browser verversen wist de tijdelijke keuze.

Het losse heatmap-testbestand is niet daarnaast nodig: deze testcollectie bevat de heatmap al. Verwijder een eventueel geladen losse heatmap-testresource om dubbele versies van hetzelfde testtype te voorkomen.

Opruimen: verwijder de testkaarten en testresource. De normale kaarten blijven hun bestaande types gebruiken.
`);
console.log('Built all seven test cards and LEESMIJ-TIJDVAK.md.');
