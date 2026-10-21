# Eleven Heatmap (local beta)

Sensor values grouped by hour, day, week or month. Color reveals repeating patterns in temperature, power or consumption. One sensor per card, a visual editor, HA theme colors and Dutch/English labels. The default is hourly cells over the past 672 hours (four weeks). Rolling ranges can include partial first and last intervals.

[Back to Eleven Cards](../../README.md)

## Installation

Included in local collection builds as `custom:eleven-heatmap-card`; not yet published to HACS. Refresh the dashboard resource, Add card and search for **Eleven Heatmap (beta)**.

For standalone installation copy [the standalone module](dist/eleven-heatmap-card.js) to `/config/www/eleven-cards/eleven-heatmap-card.js` and register `/local/eleven-cards/eleven-heatmap-card.js` as a JavaScript module. Choose either the collection or standalone resources.

```yaml
type: custom:eleven-heatmap-card
entity: sensor.living_room_temperature
title: Temperature patterns
hours_to_show: 672
mode: average
scale_min: 16
scale_max: 25
low_color: [219, 234, 254]
high_color: [29, 78, 216]
show_navigation: true
```

Entity IDs are examples. Bounds are optional; without them the color scale follows the loaded values. Fix both bounds to compare different periods or cards. Values outside the scale retain their real readings but use the endpoint color. The editor uses Home Assistant's native RGB color selector, like the other Eleven cards. Colors are saved as `[red, green, blue]` arrays (integers 0–255); existing six-digit hex values remain supported. Period supports 1–8760 hours. The shared picker also offers rolling and calendar periods, previous/Now/next navigation and the native History link. Period changes do not save dashboard configuration. There are no zoom controls in this beta.

## Visual configuration

The native editor follows the History and Bar Chart configurators: sensor, title, title visibility and default hours at the top, then expandable **Graph**, **Data processing**, **Colors** and **Grid appearance** groups. **Data processing → Aggregation period** offers Hour, Day, Week (Monday) and Month, using the same field name and labels as the sibling charts. Useful field help is available in Dutch and English. Settings stay flat in YAML. Existing configurations retain their default appearance. The editor preserves incomplete values and displays validation errors without recreating its form.

| Setting | Default | Meaning |
| --- | --- | --- |
| `aggregation_period` | `hour` | `hour`, `day`, `week` or `month`; changes the time interval represented by each cell and its row/column labels. |
| `show_title` | `true` | Show the card title; History and information remain available. |
| `show_legend` | `true` | Show the color scale above the matrix. |
| `show_labels` | `true` | Show row and column labels; cell descriptions retain dates and readings. |
| `show_navigation` | `true` | Show the timeframe controls. |
| `sync_timeframe` | `false` | Share timeframe selection and previous/next/Now with enabled cards in the same group. Zoom and aggregation remain local. |
| `hover_sync_group` | `''` | Synchronization group shared with the other cards' hover and timeframe settings. Each synchronization is enabled separately. Empty uses the default group. |
| `color_mode` | `scale` | `scale` uses low/high colors and optional bounds; `gradient` uses fixed sensor-value stops. Supplying stops without a mode selects `gradient`. |
| `gradient_mode` | `smooth` | `smooth` interpolates colors; `steps` uses hard thresholds, like the other charts. |
| `gradient_stops` | `[]` | 2–32 distinct sensor values and RGB/hex colors when using `gradient`. Stop values determine its legend range; `scale_min`/`scale_max` apply to `scale` mode. |
| `cell_width` | `24` | Minimum width in pixels, 6–64. Columns expand to fill available space. |
| `cell_height` | `24` | Height in pixels, 16–64. |
| `cell_gap` | `2` | Space between cells in pixels, 0–8. |
| `border_radius` | `3` | Corner radius in pixels, 0–16. |
| `max_height` | `800` | Maximum scroll area height in pixels, 100–2000. |

Switching to color stops initializes two stops from existing bounds and endpoint colors. Adjust their values to the sensor's range. Switching modes retains both sets of settings. For example, a temperature card can use:

```yaml
type: custom:eleven-heatmap-card
entity: sensor.living_room_temperature
color_mode: gradient
gradient_mode: smooth
gradient_stops:
  - value: 16
    color: [59, 130, 246]
  - value: 21
    color: [34, 197, 94]
  - value: 26
    color: [239, 68, 68]
cell_width: 8
cell_height: 20
cell_gap: 0
max_height: 500
```

Threshold colors clamp below the first stop and above the last. The tooltip always shows the real value. Narrow cells and smaller gaps can fit more columns on narrow cards; larger matrices retain internal scrolling. Cells remain static, with mouse hover only.

## Time grouping

| Aggregation period | Rows | Columns |
| --- | --- | --- |
| Hour (default) | Local dates | 00–23 |
| Day | Weeks starting Monday | Monday–Sunday |
| Week | ISO week-years | W01–W53 |
| Month | Calendar years | January–December |

The ISO week-year follows the week's Thursday: early January can belong to the previous ISO year, and late December to the next one. W53 stays outside/empty in years with 52 weeks. In every grouping, faded cells fall outside the selected range and hatched cells within the range have no numeric data.

Larger cells combine the existing hourly statistics: means are weighted by interval duration and consumption sums Recorder's hourly changes, including resets, zero and negative values. History fallback computes duration-weighted means directly from held readings. Grouping follows the Home Assistant timezone, including 23/25-hour dates, leap years and varying month lengths. Partial first/last calendar periods and missing coverage are marked incomplete; unknown time never becomes zero. Statistics are assigned by their actual interval start, and complete edge summaries are never split or prorated. The hover popup shows a compact start/end range for larger cells.

For daily consumption over the past year:

```yaml
type: custom:eleven-heatmap-card
entity: sensor.electricity_meter
hours_to_show: 8760
aggregation_period: day
mode: consumption
```

The selected range and aggregation period are independent, like History and Bar Chart: changing the timeframe does not silently change grouping. Minute, quarter-hour and raw-sample cells are not offered.

Open the **Custom range** tab in the timeframe menu, enter start and end dates and times, and select **Apply**. Inputs use the displayed Home Assistant timezone. Ranges can span up to 366 days and stay fixed across refreshes. Previous/next shift by the same duration; Now shows that duration ending at the current time. Default restores each linked card's own configured range. Existing `hover_sync_group` values keep working; legacy `timeframe_sync_group` is used when no hover group is supplied.

For a suitable energy counter:

```yaml
type: custom:eleven-heatmap-card
entity: sensor.electricity_meter
title: Consumption patterns
mode: consumption
hours_to_show: 672
```

## Data meaning

- **Average:** prefers hourly Recorder statistics with arithmetic means. If compatible statistics are unavailable, empty or fail, uses raw Recorder history for the requested range. No blending between sources. Raw averages are weighted by known duration, with recorded values held until the next state. Missing boundary values, unavailable states and unit changes leave gaps. Limited Recorder retention can leave older dates empty.
- **Consumption:** requires counter statistics (`has_sum`) and uses Recorder's hourly `change`, summed within each selected cell, including Home Assistant's counter reset handling. It does not subtract successive displayed readings, integrate power or create sensors. Unsupported statistics produce an actionable error; there is no raw-history consumption fallback.
- **Statistics intervals:** each full summary is attributed to the local grouping period in which its interval starts. Exact start/end appear in the cell popup; UTC offsets distinguish repeated DST hours in hourly mode. This matters in zones whose UTC offset includes minutes: an hourly column can represent, for example, an interval starting at 05:30. Summaries are never split or prorated. Clipped edge summaries count in full and are marked incomplete. An hourly summary does not establish that every underlying measurement was available.
- **Timezone:** uses Home Assistant's configured timezone. A skipped DST hour has no interval. Repeated hours share a cell: duration-weighted average or summed consumption; details show both actual intervals with offsets. Half-hour transitions are supported for raw history too.
- **Gaps:** hatched cells mean no numeric data, never zero. Faded cells have no interval in the viewed range (outside the rolling range or a skipped clock hour). A dot marks incomplete coverage or a clipped interval. Negative and zero values remain valid readings. Different units are never combined; statistics must be returned in the sensor's current display unit. Recorder's conversions from stored units (such as Wh to kWh) are supported.

The information icon beside History opens the same **Data information / Gegevens** popup as the other Eleven charts: sensor, source, unit and Min / Max / Avg., plus Sum for consumption. These metrics summarize the displayed numeric cells before color scaling; the average gives each known cell equal weight. Missing cells are excluded, and clipped/partial coverage or stale data has a compact status label. Color bounds do not change these metrics.

Hover a cell for a popup with date, actual interval, sensor and value, using the shared Eleven tooltip style. The popup fits the visible chart and viewport. Hover stays visible while moving onto the popup; leaving the chart, scrolling, resizing, Escape or outside interaction dismisses it. Cells are static: they have no keyboard navigation, selection or click/tap actions. Information and timeframe popups close each other and preserve their open state through refresh.

The normal card shows its title, color scale above the grid and the grid itself. Source/mode subtitles, scrolling instructions, permanent detail rows and explanatory legend labels have been removed. Missing and incomplete values remain identifiable through cell labels and popups. The default title is **Heatmap**; the card picker retains its beta label.

The grid uses static table semantics without cell tab stops. Header controls and the editor retain their normal keyboard operation. Narrow cards scroll horizontally with sticky dates. Large periods scroll vertically. Cell labels and popup readings expose numeric values independently of color.

Refreshes once per minute. Failed refreshes preserve previous data with a visible stale-data message and Retry. Entity, unit, timezone or period changes invalidate old results; late responses are ignored. Requests time out after 20 seconds. No commands are sent to devices.

## Development

For a separate Home Assistant test card alongside the installed collection, run `node cards/heatmap-card/scripts/build-test.mjs` from the collection root. This creates `eleven-heatmap-card-test.js` and Dutch setup instructions in `.cache/home-assistant-test/`. Copy the module to `/config/www/eleven-heatmap-card-test.js`, register `/local/eleven-heatmap-card-test.js?v=heatmap-0.3.0` as a JavaScript module, refresh and add `custom:eleven-heatmap-card-test`. The test card and editor have separate element names; the normal collection can stay loaded.

Edit `src/`, not generated `dist/` modules. From the collection root:

```sh
node cards/heatmap-card/scripts/build.mjs
node --test cards/heatmap-card/tests/*.test.mjs
npm test
npm run check
```

[Synthetic QA page](qa/index.html) exercises statistics, raw history with gaps, consumption, empty/error/retry states, a form fixture, language, themes and narrow cards. **Popups controleren** runs fourteen browser checks covering hover, static cells, scale placement, dismissal, refresh preservation and mutual exclusion of the header popups. **Kleurkeuze controleren** runs five checks covering the editor's RGB update contract and rendered color scale. **Gegevens controleren** runs seventeen checks covering sources, converted units, empty counters, failure/recovery, calendar navigation, annual layout and timezone changes. **Editor controleren** exercises native group contracts, focus/expansion retention, visibility, dimensions, color-stop add/edit/remove, mode switching, validation/recovery, optional bounds and language. **Groepering controleren** checks all four native aggregation options, matrix labels/columns, preserved consumption totals, hover and raw-history averages. The separate aggregation dropdown also allows manual comparison. It contains no real household data and the form fixture is not Home Assistant's real editor.
