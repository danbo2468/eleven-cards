# Eleven Bar Chart (local beta)

Vertical bars for recorded numeric sensor history, based on Eleven History's renderer, native editor and interactions.

[Back to Eleven Cards](../../README.md)

Data processing → Data source offers Automatic / Raw history / Statistics (`data_source: auto|history|statistics`). Automatic uses statistics beyond 48 hours for supported sensors and periods, with per-sensor history fallback. Statistics supports hour/day/week/month and mean/min/max; None uses hourly statistics. Minute, quarter-hour and Delta require raw history. Forced Statistics reports unsupported sensors or combinations instead of silently switching. Gaps remain gaps and summaries are never aggregated twice. See [History or statistics](../history-graph-card/README.md#history-or-statistics) for the full contract.

The default is one time-weighted average per sensor per hour, over the past 24 hours. Choose minute, quarter-hour, hour, day, week or month aggregation, minimum, maximum or delta instead of average, or raw recorder intervals.

Choose **Delta (end − start)** in Data processing and select a period to display the change within each interval (`aggregation_method: delta`). Delta subtracts the recorder-held value at the interval start from the recorder-held value at its end, including a reading exactly on the boundary. Unchanged values produce zero; negative changes remain negative. Missing start/end values or an unavailable gap anywhere in the interval leave that bar empty. Partial edge intervals use only the requested range. No interpolation, counter-reset compensation or comparison with the previous bar is performed; this is a simple signed difference, not a reset-aware consumption calculation. Delta requires a period other than raw history.

```yaml
type: custom:eleven-bar-chart
entities:
  - sensor.living_room_temperature
hours_to_show: 24
aggregation_period: hour
aggregation_method: avg
```

Multiple sensors appear side by side by default. Set `graph_mode: stacked` for stacking; sensors with different units have independent axes and are never added together. Positive and negative values stack separately. Automatic scales include zero; explicit `y_min`, `y_max` and `y_step` remain available. A partial first/last hour is clipped to the requested range. Unavailable fragments remain gaps; an average is calculated only over known duration, without inventing missing readings.

`align_zero` defaults to `true`: when multiple visible axes extend below zero, their zero points line up without changing the readings. Disable **Align zero points / Nulpunten uitlijnen** in Y-axis settings or set `align_zero: false` for independent scales. Explicit first-unit bounds take priority, as in History.

The native visual editor provides the same sensor entries, title, time window, legend, zoom, axis bounds, aggregation, fixed colors and value gradients as History. It omits line styles and area-fill controls because bars are filled shapes. Legend buttons toggle sensors; pointer, touch, keyboard navigation, History links and Eleven hover synchronization are inherited from History. `sync_hover` defaults to true; `hover_sync_group` can isolate a group.

Hover snaps to the selected bar rather than following the exact pointer time. The guide stays centered on that bar group, and markers sit on the individual bars. The tooltip shows the period's start in Home Assistant's timezone: date and start time for minute/quarter-hour/hour, date only for day/week, and month/year for month. Raw intervals show their actual start with seconds. Clipped first/last periods retain their calendar start label; unavailable fragments remain separate gaps. Mouse, touch, keyboard and incoming synchronized hover use the same selection.

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
