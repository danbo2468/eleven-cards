const translations={
 title:['History','Historie'],loading:['Loading history…','Historie laden…'],empty:['No numeric history in this range.','Geen numerieke historie in deze periode.'],error:['History unavailable. Check recorder and connection.','Historie niet beschikbaar. Controleer recorder en verbinding.'],unit:['All sensors must have the same unit.','Alle sensoren moeten dezelfde eenheid hebben.'],missing:['Configured sensor not found.','Ingestelde sensor niet gevonden.'],unavailable:['Unavailable','Niet beschikbaar'],retry:['Retry','Opnieuw proberen'],chart:['History graph. Arrow keys, Home and End select a time; Escape closes details.','Historiegrafiek. Pijltjes, Home en End selecteren een tijd; Escape sluit details.'],entities:['Sensors','Sensoren'],hours_to_show:['Hours to show','Aantal uren'],hoursHelper:['Historical range: 1–8760 hours. Each different unit gets its own Y-axis.','Historische periode: 1–8760 uur. Iedere verschillende eenheid krijgt een eigen Y-as.'],titleField:['Title','Titel'],partial:['Some sensors have no numeric history:','Sommige sensoren hebben geen numerieke historie:'],config:['Invalid configuration: use 1–8 distinct sensors and 1–8760 hours.','Ongeldige configuratie: gebruik 1–8 unieke sensoren en 1–8760 uur.']};
Object.assign(translations,{
 sync_timeframe:['Synchronize timeframe','Tijdvak synchroniseren'],
 sync_timeframeHelper:['Shares timeframe selection and previous/next/Now with enabled cards in the same group.','Deelt tijdvakkeuze en vorige/volgende/Nu met ingeschakelde kaarten in dezelfde groep.'],
 show_title:['Show title','Titel tonen'],
 show_navigation:['Show timeframe selection','Tijdvakselectie tonen'],
 show_grid:['Show grid','Grid tonen'],
 show_gridHelper:['Show horizontal Y-axis grid lines and the left and right plot boundaries. Axis labels and data remain visible.','Toon horizontale Y-aslijnen en de linker- en rechterrand van de grafiek. Aslabels en gegevens blijven zichtbaar.'],
 show_navigationHelper:['Show the timeframe menu, previous/next, Now and the selected date range. The configured hours remain the default; aggregation is unchanged.','Toon het tijdvakmenu, vorige/volgende, Nu en het gekozen datumbereik. De ingestelde uren blijven de standaard; aggregatie verandert niet.'],
 data_source:['Data source','Gegevensbron'],auto:['Automatic','Automatisch'],history:['Raw history','Ruwe historie'],statistics:['Statistics','Statistics'],
 data_sourceHelper:['Automatic: statistics for ranges longer than 48 hours or ending more than 48 hours ago; raw history otherwise. Unsupported sensors fall back to history. Statistics use hour/day/week/month summaries (None uses hour). Delta uses counter change statistics, including counter resets. Minute and quarter-hour require history.','Automatisch: statistics bij periodes langer dan 48 uur of die meer dan 48 uur geleden eindigen; anders ruwe historie. Sensoren zonder ondersteuning vallen terug op historie. Statistics gebruikt uur/dag/week/maand (Geen gebruikt uur). Delta gebruikt tellerstatistieken, inclusief tellerresets. Minuut en kwartier vereisen historie.'],
 statistics_config:['Statistics requires hour, day, week or month. None uses hour for minimum, maximum or average; Delta requires an explicit period. Choose History for minute or quarter-hour.','Statistics vereist uur, dag, week of maand. Geen gebruikt uur bij minimum, maximum of gemiddelde; Delta vereist een expliciet tijdvak. Kies Historie voor minuut of kwartier.'],
 statistics_unavailable:['Statistics unavailable for a selected sensor or its unit. Delta requires counter statistics; minimum, maximum and average require measurement statistics. Choose Automatic or History.','Statistics ontbreekt voor een gekozen sensor of zijn eenheid. Delta vereist tellerstatistieken; minimum, maximum en gemiddelde vereisen meetstatistieken. Kies Automatisch of Historie.'],
 zoom:['Zoom','Zoom'],zoom_in:['Zoom in','Inzoomen'],zoom_out:['Zoom out','Uitzoomen'],zoom_reset:['Reset zoom','Zoom herstellen'],
 aggregation_period:['Aggregation period','Aggregatieperiode'],aggregation_method:['Aggregation method','Aggregatiemethode'],none:['None (raw history)','Geen (ruwe historie)'],minute:['Minute','Minuut'],quarter_hour:['Quarter hour','Kwartier'],hour:['Hour','Uur'],day:['Day','Dag'],week:['Week (Monday)','Week (maandag)'],month:['Month','Maand'],min:['Minimum','Minimum'],max:['Maximum','Maximum'],avg:['Time-weighted average','Tijdgewogen gemiddelde'],
 aggregation_periodHelper:['Applied separately to every sensor in the Home Assistant timezone. Zoom does not change it.','Per sensor toegepast in de Home Assistant-tijdzone. Zoom verandert dit niet.'],
 aggregation_methodHelper:['AVG weights numeric values by their recorded held duration; unavailable time is excluded.','AVG weegt numerieke waarden met hun geregistreerde duur; niet-beschikbare tijd wordt uitgesloten.'],
 graph_mode:['Graph mode','Grafiekmodus'],lines:['Separate lines','Losse lijnen'],stacked:['Stacked sums','Gestapelde sommen'],
 series_options:['Sensor names and colors','Sensornamen en kleuren'],entity:['Sensor','Sensor'],name:['Custom name','Eigen naam'],
 entitiesHelper:['Set name, fixed color or 2–32 color stops in each sensor entry. Sensor settings override shared colors; its own gradient overrides its fixed color.','Stel naam, vaste kleur of 2–32 kleurovergangen in per sensorregel. Sensorinstellingen gaan voor algemene kleuren; een eigen gradiënt gaat voor de eigen vaste kleur.'],
 sync_hover:['Synchronize hover','Hover synchroniseren'],hover_sync_group:['Synchronization group','Synchronisatiegroep'],
 sync_hoverHelper:['Shares the selected time with other Eleven graphs on this page.','Deelt het gekozen tijdstip met andere Eleven-grafieken op deze pagina.'],
 hover_sync_groupHelper:['Cards with the same group share hover and timeframe when the corresponding synchronization is enabled. Empty uses the default group.','Kaarten met dezelfde groep delen hover en tijdvak als de bijbehorende synchronisatie aanstaat. Leeg gebruikt de standaardgroep.'],
 line_interpolation:['Line interpolation','Lijnverloop'],interpolation_smooth:['Smooth','Vloeiend'],interpolation_linear:['Linear','Recht'],interpolation_step:['Stepped','Trapvormig'],
 line_interpolationHelper:['Display only: chooses how recorded points are connected.','Alleen weergave: bepaalt hoe geregistreerde punten worden verbonden.'],
 connect_gaps:['Bridge missing data','Ontbrekende data overbruggen'],
 connect_gapsHelper:['Connect known points on either side of a gap using this line’s interpolation. Unknown starts and tails stay empty. Tooltips and calculations retain missing data.','Verbind bekende punten aan weerszijden van een gat volgens het lijnverloop. Ontbrekende data aan het begin en einde blijft leeg. Tooltips en berekeningen behouden ontbrekende waarden.'],
 y_step_error:['Invalid Y-axis step: enter a finite positive number or leave it empty for automatic steps.','Ongeldige stapgrootte Y-as: voer een eindig positief getal in of laat leeg voor automatische stappen.'],
 y_step_count:['Y-axis step cannot be drawn (maximum 200 ticks or numeric precision exceeded). Increase the step or narrow the Y-axis bounds.','Stapgrootte Y-as kan niet worden getekend (maximaal 200 maatstreepjes of numerieke precisie overschreden). Vergroot de stap of verklein het Y-asbereik.'],
 align_zero:['Align zero points','Nulpunten uitlijnen'],
 align_zeroHelper:['Align zero on negative Y-axes. Explicit first-axis bounds take priority.','Zet de nulpunten van negatieve Y-assen op dezelfde hoogte. Handmatige grenzen van de eerste as gaan voor.'],
 y_axis:['Y-axis','Y-as'],y_step:['Y-axis step','Stapgrootte Y-as'],
 y_stepHelper:['Optional positive tick interval in the sensor unit. Empty uses round 1/2/5 steps automatically. Maximum 200 ticks; increase the step or narrow the bounds if exceeded.','Optionele positieve stapgrootte in de sensoreenheid. Leeg kiest automatisch ronde 1/2/5-stappen. Maximaal 200 maatstreepjes; vergroot de stap of verklein het bereik bij overschrijding.'],
 y_min:['Y-axis minimum','Minimum Y-as'],y_max:['Y-axis maximum','Maximum Y-as'],
 y_minHelper:['Optional, in the first sensor’s unit. Empty scales automatically. Other units have independent automatic axes.','Optioneel, in de eenheid van de eerste sensor. Leeg schaalt automatisch. Andere eenheden hebben eigen automatische assen.'],
 y_maxHelper:['Optional, for the first sensor’s unit. Empty scales automatically. Must exceed the minimum.','Optioneel, voor de eenheid van de eerste sensor. Leeg schaalt automatisch. Moet hoger zijn dan het minimum.'],
 appearance:['Line and fill','Lijn en vulling'],line_style:['Line style','Lijnstijl'],line_width:['Line width','Lijndikte'],line_color:['Fixed line color','Vaste lijnkleur'],show_fill:['Fill below line','Vulling onder lijn'],fill_opacity:['Fill opacity','Dekking vulling'],fill_fade:['Fade fill','Vulling vervagen'],show_hover_line:['Show hover guide','Aanwijslijn tonen'],gradient_mode:['Color transitions','Kleurovergang'],gradient_stops:['Color stops','Kleurovergangen'],stop_value:['Sensor value','Sensorwaarde'],stop_color:['Color','Kleur'],solid:['Solid','Doorgetrokken'],dashed:['Dashed','Gestreept'],dotted:['Dotted','Gestippeld'],smooth:['Smooth gradient','Vloeiende gradiënt'],steps:['Hard transitions','Harde overgangen'],
 fill_color:['Fixed fill color','Vaste vulkleur'],fill_colorHelper:['Optional. Empty follows the line color or gradient.','Optioneel. Leeg volgt de lijnkleur of gradiënt.'],
 hours_to_showHelper:translations.hoursHelper,
 line_styleHelper:['Empty preserves the distinct default styles per sensor.','Leeg behoudt de verschillende standaard lijnstijlen per sensor.'],
 line_colorHelper:['Optional. Empty preserves sensor colors. Color stops take priority.','Optioneel. Leeg behoudt sensorkleuren. Kleurovergangen hebben voorrang.'],
 gradient_stopsHelper:['Add 2–32 distinct sensor values and colors. Values use the sensor unit, not percentages. Empty disables the gradient.','Voeg 2–32 unieke sensorwaarden met kleuren toe. Waarden gebruiken de sensoreenheid, geen percentages. Leeg schakelt de gradiënt uit.'],
 fill_fadeHelper:['Fades the fill towards the bottom of the graph.','Laat de vulling naar de onderkant van de grafiek vervagen.']
});
Object.assign(translations,{
 graph_settings:['Graph','Grafiek'],show_legend:['Show legend','Legenda tonen'],data_processing:['Data processing','Dataverwerking'],series_line:['Line','Lijn'],series_fill:['Fill','Vulling'],
 visible:['Show by default','Standaard tonen'],visibleHelper:['Initial visibility. Click the sensor in the legend to show or hide it temporarily.','Beginweergave. Klik op de sensor in de legenda om deze tijdelijk te tonen of verbergen.'],show_sensor:['Show','Toon'],hide_sensor:['Hide','Verberg'],no_visible:['All sensors are hidden. Enable a sensor in the legend.','Alle sensoren zijn verborgen. Zet een sensor aan via de legenda.'],
 color_mode:['Line color','Lijnkleur'],color_fixed:['Fixed color','Vaste kleur'],color_gradient:['Color stops','Kleurovergangen'],color:['Line color','Lijnkleur'],
 fill_mode:['Fill color','Vulkleur'],fill_line:['Follow line','Volg lijn'],fill_own:['Own color','Eigen kleur'],
 add_sensor:['Add sensor','Sensor toevoegen'],new_sensor:['New sensor','Nieuwe sensor'],add_sensorHelper:['Add a sensor to configure its name, line and fill.','Voeg een sensor toe om naam, lijn en vulling in te stellen.'],
 sensor_up:['Move up','Omhoog'],sensor_down:['Move down','Omlaag'],sensor_remove:['Remove','Verwijderen'],
 color_modeHelper:['Choose a fixed color or color stops based on measured values.','Kies een vaste kleur of kleurovergangen op basis van meetwaarden.'],
 fill_modeHelper:['Follow line uses this sensor’s line color, including its gradient. Own color changes only the fill.','Volg lijn gebruikt de lijnkleur van deze sensor, inclusief de gradiënt. Eigen kleur verandert alleen de vulling.'],
 gradient_stopsHelper:['Set 2–32 distinct values in the sensor unit, not percentages. Adjust the initial values to your sensor range.','Stel 2–32 unieke waarden in de sensoreenheid in, geen percentages. Pas de beginwaarden aan op het bereik van je sensor.'],
 line_styleHelper:['Only changes this sensor’s line.','Verandert alleen de lijn van deze sensor.'],fill_colorHelper:['Only used when Own color is selected.','Alleen gebruikt wanneer Eigen kleur is gekozen.']
});
Object.assign(translations,{
 line_style_source:['Line appearance','Lijnopmaak'],line_style_own:['Own appearance','Eigen opmaak'],line_style_follow:['Follow','Volg'],
 line_style_sourceHelper:['Follow another sensor’s width, line style and interpolation. Color and fill remain independent. Own appearance detaches with the current settings.','Volg dikte, lijnstijl en lijnverloop van een andere sensor. Kleur en vulling blijven eigen. Eigen opmaak neemt de huidige instellingen mee.'],
 line_style_source_error:['Invalid line appearance source: choose another sensor on this card, without circular links.','Ongeldige bron voor lijnopmaak: kies een andere sensor op deze kaart, zonder kringverwijzingen.']
});
translations.config=['Invalid configuration: check sensors, hours, Y-axis bounds, appearance and color stops.','Ongeldige configuratie: controleer sensoren, uren, Y-asgrenzen, lijnopties en kleurovergangen.'];
export function language(hass){return String(hass?.locale?.language??hass?.language??'en').toLowerCase().startsWith('nl')?'nl':'en';}
export function text(key,lang){return translations[key]?.[lang==='nl'?1:0]??key;}
export function number(value,lang,axis=false){
 const small=value!==0&&Math.abs(value)<0.01;
 return new Intl.NumberFormat(lang==='nl'?'nl-NL':'en-GB',{
  ...(axis?{maximumSignificantDigits:15}:small?{maximumSignificantDigits:4}:{maximumFractionDigits:2}),
  ...(value!==0&&(Math.abs(value)<0.0001||axis&&Math.abs(value)>=1e6)?{notation:'scientific'}:{})
 }).format(Object.is(value,-0)?0:value);
}
export function time(value,lang,timeZone,full=false){return new Intl.DateTimeFormat(lang==='nl'?'nl-NL':'en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',...(full?{day:'numeric',month:'short'}:{})}).format(new Date(value));}
export function escapeHtml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
export function frontendHass(){return globalThis.document?.querySelector('home-assistant')?.hass;}
