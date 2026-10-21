# Eleven Bar Chart (local beta)

Vertical bars for recorded numeric sensor history, based on Eleven History's renderer, native editor and interactions.

[Back to Eleven Cards](../../README.md)

The cards share a compact period picker at the top right. Next to it, previous / Now / next and zoom out / in / reset form one borderless group with matching button sizes and a subtle divider between navigation and zoom. The picker, combined controls and History button share the same muted background and rounded corners; the History link uses an open icon. The header wraps on narrow cards and keeps the controls aligned to the right. **Default (N hours)** returns to hours_to_show. **Last** offers 1, 6, 12, 24 and 48 hours, plus 7, 14, 30, 90 and 365 days. **Calendar** offers Today, This week (Monday start), This month, This quarter and This year. Current calendar periods end now; earlier periods are complete and follow the Home Assistant timezone, including DST, leap years and variable month lengths. Rolling presets shift by their full duration. Historical ranges stay fixed during refresh. Selecting a period resets viewport zoom and never saves YAML or changes aggregation. The picker shows the period directly: Default (N hours) for the current configured view, compact dates and duration while browsing, calendar month/quarter/year names, and the visible range when zoomed. The separate range row is removed. The menu, hover title and accessible description retain the exact start/end with timezone offsets. Zoom status moves into the menu; it remains below the header if the picker is hidden. The native History link follows the viewed range. History and information use the same 8 px separation as the other header action groups, remaining adjacent when the header wraps. The menu supports arrow keys, Home/End, Enter, Escape and Tab, retains focus during card updates, and stays within the viewport. Period controls are visible by default; hide the timeframe selection in the visual editor (Show timeframe selection) or with show_navigation: false. Toggle grid lines independently with show_grid: false (Show grid); axis labels, data, zoom and the History link remain visible. Both settings default to true.

Zoom controls reflect the visible range: zoom out and reset are disabled at the full range, and zoom in is disabled at the one-minute minimum. A **Zoomed in / Ingezoomd** label appears beside the range and remains available when timeframe selection is hidden.

Double-click a sensor name in the History/Bar Chart legend to show only that series. Double-click the same name again to show all configured sensors. A single click still toggles one sensor. Timeline uses the entity name above its track for isolation while retaining its state-color legend. Shift+Enter (or Shift+click) provides the same isolate/restore action without double-clicking. The separate Focus series button and menu have been removed. These actions do not save YAML, refetch data or change the entities in the native History link.

The information icon beside **Open in History** opens **Data information / Gegevens**. Timeframe and information popups share their width, title/close row, spacing, theme surface, border and shadow. Sensor source/unit text is subdued. Each sensor has its own block with the actual source (History or Statistics). The compact popup contains only sensor information: name, source and unit, followed by aligned Min / Max / Avg. columns (plus Sum for Delta bars). Explanatory paragraphs and range/fetch-time blocks are omitted. Short per-sensor labels indicate hidden, incomplete, refreshing or outdated data; failed refreshes retain the previous values. Information and focus dialogs support keyboard use, Escape and outside dismissal, preserve state/focus across refresh, and fit the viewport. Minimum, maximum and average use the unstacked, undecimated chart values within the visible (zoomed) range, keeping each sensor's unit. Hidden sensors remain listed and marked as hidden. Missing data is excluded rather than counted as zero. Statistics may already be aggregated: min/max describe the displayed values, not the original measurements. The mean gives each displayed bar equal weight, including unequal calendar/DST bin lengths.


Delta bars with an explicit aggregation period include **Sum of bars / Som van staven** in that same information popup. Totals use original values before stacking, retain negative and zero values, and keep different units separate. Missing coverage uses a short status label; clipped bins count in full without prorating. Average/min/max and raw intervals do not show consumption totals. The separate Period consumption section and compact totals button have been removed.

Data processing → Data source offers Automatic / Raw history / Statistics (`data_source: auto|history|statistics`). Automatic uses statistics for ranges longer than 48 hours or ending more than 48 hours ago for supported sensors and periods, with per-sensor history fallback. Statistics supports hour/day/week/month with mean/min/max, or Delta for counter statistics; None uses hourly statistics for mean/min/max. Minute and quarter-hour require raw history. Forced Statistics reports unsupported sensors or combinations instead of silently switching. Missing statistics bins remain empty and summaries are never aggregated twice. See [History or statistics](../history-graph-card/README.md#history-or-statistics) for the full contract.

The default is one time-weighted average per sensor per hour, over the past 24 hours. Choose minute, quarter-hour, hour, day, week or month aggregation, minimum, maximum or delta instead of average, or raw recorder intervals.

Choose **Delta (end − start)** in Data processing and select a period to display the change within each interval (`aggregation_method: delta`). With raw history, Delta subtracts the recorder-held value at the interval start from the recorder-held value at its end, including a reading exactly on the boundary. Unchanged values produce zero; negative changes remain negative. Missing start/end values or an unavailable gap anywhere in the interval leave that bar empty. Partial edge intervals use only the requested range. Raw Delta performs no interpolation, counter-reset compensation or comparison with the previous bar. Delta requires a period other than raw history.

With statistics, Delta requests Recorder's **`change`** per hour/day/week/month for sensors with counter statistics (`has_sum`), such as `total` or `total_increasing` energy meters. This is the growth of Recorder's accumulated sum and includes Home Assistant's counter-reset handling and the baseline before the first requested period. It is used directly, without another subtraction or aggregation. Statistics are calendar summaries: clipping a partial edge period does not prorate its consumption. Missing or null summaries remain gaps; zero consumption remains zero. Automatic falls back to raw history per unsupported sensor or empty/failed request. To require statistics and expose unavailable counter statistics, select `data_source: statistics`.

For example, daily consumption over 90 days from yearly energy counters:

```yaml
type: custom:eleven-bar-chart
entities:
  - sensor.yearly_electrical_consumption
hours_to_show: 2160
data_source: auto
aggregation_period: day
aggregation_method: delta
```

```yaml
type: custom:eleven-bar-chart
entities:
  - sensor.living_room_temperature
hours_to_show: 24
aggregation_period: hour
aggregation_method: avg
```

Multiple sensors appear side by side by default. Set `graph_mode: stacked` for stacking; sensors with different units have independent axes and are never added together. Positive and negative values stack separately. Automatic scales include zero; explicit `y_min`, `y_max` and `y_step` remain available.

All displayed bars have the same width, including partial first/last periods, different calendar durations and irregular raw recorder intervals. Width does not encode duration. Aggregated bars use the centers of their complete calendar periods. The entire layout is fitted together, retaining equal spacing for equal-duration periods at both edges and after zoom. The time axis includes the enclosing periods; its labels, pointer hover and drag selection use that same fitted scale. The selected data range stays unchanged: a partial period still uses only the available/requested data. Raw intervals use their visible centers. Different month lengths, DST transitions and irregular raw intervals retain their actual time distances. Missing periods retain their space on the time axis. With average/minimum/maximum aggregation, each period with any available data produces one bar; averages use only the known duration, without inventing missing readings. Fully unavailable periods remain empty. Delta retains its stricter data requirements described above. Raw mode keeps separate recorder intervals, including empty unavailable intervals. Each bar is retained even in dense views; line-chart decimation is not applied to bars.

`align_zero` defaults to `true`: when multiple visible axes extend below zero, their zero points line up without changing the readings. Disable **Align zero points / Nulpunten uitlijnen** in Y-axis settings or set `align_zero: false` for independent scales. Explicit first-unit bounds take priority, as in History.

Like History, Bar Chart draws one horizontal grid behind the bars. Tick heights align across units while each axis keeps its own step. Legend and tooltip values contrast with the card's light or dark background; names retain the theme's secondary text color and markers retain their series colors.

Two vertical lines mark the left and right plot boundaries.

The native visual editor provides the same sensor entries, title, time window, legend, zoom, axis bounds, aggregation, fixed colors and value gradients as History. It omits line styles and area-fill controls because bars are filled shapes. Legend buttons toggle sensors; pointer, touch, keyboard navigation, History links and Eleven hover synchronization are inherited from History. `sync_hover` defaults to true; `hover_sync_group` can isolate a group.

Hover snaps to the selected bar rather than following the exact pointer time. The guide stays centered on that bar group, and markers sit on the individual bars. The tooltip shows the period's start in Home Assistant's timezone: date and start time for minute/quarter-hour/hour, date only for day/week, and month/year for month. Raw intervals show their actual start with seconds. Partial first/last periods retain their calendar start label. Mouse, touch, keyboard and incoming synchronized hover use the same selection.

`series_options` supports sensor `entity`, `name`, `visible`, `color_mode`, `color`, `gradient_mode` and `gradient_stops`, using the same color format and semantics as [History](../history-graph-card/README.md). General options retain History's YAML names; grouped bars use `graph_mode: lines` for configuration compatibility. Bars are not a distinct line-interpolation mode and existing History cards are unchanged.

This beta is installed locally as an independent Home Assistant resource and included in local collection builds; it has not been published to HACS. Existing dashboard configurations are unchanged. The standalone build is `dist/eleven-bar-chart.js` and registers only `eleven-bar-chart`. Use either the collection bundle or standalone modules, not both.

From the collection root:

```sh
npm --prefix cards/bar-chart run build
npm --prefix cards/bar-chart test
npm --prefix cards/bar-chart run check
uv run --with playwright python tests/browser-bar-chart.py
```

The browser QA page at `qa/index.html` uses explicitly synthetic power readings, including negative values and an unavailable interval. It is not a live Home Assistant dashboard.
