# Eleven Dynamic Energy Price Card

[← Eleven Cards](../../README.md)

Part of the Eleven Cards collection preparation. This local build uses Eleven-prefixed runtime names; the collection has not been published to HACS. See the [migration guide](../../README.md#migrating-existing-dashboards) before replacing an existing card.

**See electricity prices at a glance—and find the best times to use or export energy.**

A compact Home Assistant dashboard card for dynamic electricity tariffs. View the current price, follow today's price curve, and highlight favorable periods. Add a second sensor to compare import and export prices on the same chart.

![Eleven Dynamic Energy Price Card with current price, chart and favorable-period table](docs/images/revised-default-dark-desktop.png)

## What it can do

- **Plan energy use:** highlight the cheapest import periods and highest-paying export periods.
- **Choose useful time blocks:** select individual intervals, one continuous block, or multiple blocks with a minimum duration.
- **See today and tomorrow:** show available upcoming prices, the current price, and a clear Now marker.
- **Inspect any interval:** use hover, touch, or keyboard controls to read prices.
- **Compare actual grid import:** optionally overlay measured kWh per completed interval with its own scale and subtle line.
- **Make it your own:** customize price colors, period highlights, line styles, and optional fills—or keep the original appearance.
- **Keep your dashboard compact:** use a responsive chart, optional period table, and Home Assistant's native visual editor and Sections sizing.

The graph reveals its lines and fills from left to right when price data first loads into the attached card (650 ms). Initial rendering before dashboard insertion does not consume the animation; updates during the reveal preserve its progress. Routine updates and series toggles do not replay the animation. The device's reduced-motion preference disables it automatically.

Works with hourly or quarter-hour price intervals in the supported sensor format. Import-only is the default; export is optional. The card displays data from your sensors—it does not fetch tariffs or control appliances.

## Quick start

### 1. Build and install the Eleven module

1. Run `npm run build` in this card directory, or at the collection root.
2. Copy this card's `dist/eleven-dynamic-energy-price-card.js` to `/config/www/eleven-cards/eleven-dynamic-energy-price-card.js` in Home Assistant.
3. Register `/local/eleven-cards/eleven-dynamic-energy-price-card.js` as a dashboard resource of type **JavaScript module**.
4. Refresh your browser and select **Eleven Dynamic Energy Price Card** in the card picker.

The existing standalone HACS repository still supplies its original types and filenames, not this Eleven build. Do not overwrite its HACS-managed file manually. A collection HACS installation route will be documented after packaging and publication.

### 2. Add a card

Use Home Assistant's visual editor, or start with this YAML:

```yaml
type: custom:eleven-dynamic-energy-price-card
entity: sensor.tibber_prijzen
cheapest_hours: 4
import_selection_mode: contiguous
show_cheapest_table: true
```

Replace `entity` with your price sensor. This example highlights the cheapest continuous four-hour block per day and lists it below the chart. Omit the last three settings if you only want the price graph.

**Sensor requirement:** the sensor must provide a `data` attribute with timestamped prices in EUR/kWh. A sensor with only a current-price state is not enough. See **Sensor data** below for the exact format.

## Examples

The opening preview and examples below use real Tibber tariff data from October 8, 2026: 96 quarter-hour intervals read from `sensor.tibber_prijzen`. They were captured from the built card on a standalone Home Assistant-style surface, not a live dashboard. Card labels are English. Each uses import only, a hidden title, and the same continuous four-hour selection (12:15–16:15). Default and custom-color examples use the same data, layout and fixed example clock (19:00 Europe/Amsterdam). The one-day snapshot omits tomorrow; `tomorrow_after: 24` suppresses tomorrow warnings in these examples only. The normal default remains `14`.

The reproducible snapshot and screenshot viewer remain in `docs/examples/` in the original standalone source project. This collection includes the captures, card source, build and synthetic `qa/` fixture, but not those screenshot viewers.

### Original palette — compact light mobile

The same compact summary, chart and favorable-period table on mobile:

<img src="docs/images/revised-default-light-mobile.png" alt="Original palette and compact import summary on light mobile" width="390">

### Custom price colors and independent period highlights

Blue and rose price colors with an independent purple favorable-period highlight. Changing these colors does not change the layout or selected period.

![Custom colors with an independent purple period highlight on dark desktop](docs/images/revised-custom-dark-desktop.png)

<img src="docs/images/revised-custom-light-mobile.png" alt="Custom price and favorable-period colors on light mobile" width="390">

Example settings:

```yaml
show_title: false
cheapest_hours: 4
import_selection_mode: contiguous
show_cheapest_table: true
tomorrow_after: 24 # One-day README example only; normal default is 14.
cheap_color: [130, 90, 240]
normal_color: [50, 140, 210]
expensive_color: [225, 90, 125]
import_favorable_color: [140, 100, 230]
```

Export-period colors can be customized independently with `export_favorable_color`. Leave any color empty to retain its original default.

## Sensor data

Use an import sensor whose `data` attribute contains an array of intervals. Each interval must include an ISO timestamp with a timezone offset and a price in EUR/kWh:

```yaml
start_time: "2026-10-07T14:00:00+02:00"
price_per_kwh: 0.2345
```

An optional `export_entity` uses the same format. It is required when export prices are shown. The offset is applied to that entity:

```text
export price = export entity price + export_price_offset
```

Offsets may be negative. The import entity is never used as the base for an export offset.

## Configuration examples

Most settings can be changed in Home Assistant's native visual editor. The examples below show the equivalent flat YAML keys.

### Import-only configuration

An import-only setup with price guides, fading fill, and a four-hour selection in blocks of at least 30 minutes:

```yaml
type: custom:eleven-dynamic-energy-price-card
entity: sensor.tibber_prijzen
title: Dynamic energy prices
show_title: true
show_hover_line: true
show_average_line: false
show_price_levels: true
import_line_style: solid
import_line_width: 3.5
show_import_fill: true
import_fill_fade: true
import_selection_mode: minimum_blocks
import_minimum_duration: 30
cheap_price: 0.15
normal_price: 0.25
expensive_price: 0.40
cheapest_hours: 4
show_cheapest_table: true
tomorrow_after: 14
```

### Import and export entities

```yaml
type: custom:eleven-dynamic-energy-price-card
entity: sensor.dynamic_import_prices
export_entity: sensor.dynamic_export_prices
graph_mode: both
current_price_mode: both
show_average_line: true
cheap_price: 0.15
normal_price: 0.25
expensive_price: 0.40
cheapest_hours: 4
export_best_hours: 4
show_cheapest_table: true
show_export_table: true
tomorrow_after: 14
```

### Correct an export entity with an offset

```yaml
type: custom:eleven-dynamic-energy-price-card
entity: sensor.dynamic_import_prices
export_entity: sensor.dynamic_export_prices
export_price_offset: -0.12
graph_mode: both
current_price_mode: export
export_best_hours: 3
show_export_table: true
```

### Average price per favorable period

Enable **Average price in table** under **General** in the visual editor, or add:

```yaml
show_period_average: true
```

This adds a **~ct** average-price column in ct/kWh to the favorable-period table. The unit appears beside the table title so all column headings stay on one line; duration and average values align to the right. Each row averages only the price intervals inside that period, separately for import and export. Export averages include `export_price_offset`. With the supported equal-duration intervals, each interval has equal weight. The option defaults to `false`, does not enable a table by itself, and is independent of `show_average_line`. On mobile, the optional six-column table uses compact spacing; very narrow cards can scroll the table horizontally without widening the dashboard.

### Choose table columns

Under **General**, switch each table column on or off independently: day, tariff, start, end, duration and average price. This applies to both tariffs. All existing columns remain enabled by default; average price remains off. If every column is disabled, the table section is hidden. Compact rows use **Today / Tmr.** and **Imp. / Exp.** in English, or **Vdg. / Mrg.** and **Af. / Ter.** in Dutch. Hover and screen-reader labels retain the full day and tariff meanings. Chart labels remain unchanged.

### Grid-import energy per interval (optional)

Compare recorded **grid import** with prices on the same chart. This is energy consumed in **kWh per completed interval**, not power in W/kW and not household consumption including self-consumed solar.

```yaml
show_consumption: true
consumption_entity: sensor.your_grid_import_energy
consumption_line_style: solid
consumption_line_width: 1.5
show_consumption_fill: false
consumption_fill_fade: true
# Optional RGB overrides, independent of price line/fill settings:
# consumption_line_color: [110, 120, 130]
# consumption_fill_color: [110, 120, 130]
```

Choose a cumulative **grid-import** sensor with `unit_of_measurement: kWh`, `device_class: energy` and `state_class: total_increasing` in the native **Grid-import energy** editor group. Attributes alone cannot prove the meter measures grid import: do not select a household/solar/net-export meter. The overlay defaults to **off**. When enabled it has an independent, zero-based right-hand kWh scale; price values and their scale remain unchanged. The default line is a muted, theme-responsive **1.5px**, with no fill. Solid/dashed/dotted style, width, RGB color, fill and fade are independent of the tariff settings. Empty colors restore the theme defaults, including valid black RGB overrides.

The card reads Home Assistant recorder history for this one meter. For 15- or 60-minute prices it subtracts the final observed cumulative reading at/before each boundary, requiring readings within five minutes of both boundaries and no longer intervening recording gap. It never interpolates readings. Any decrease (even a small transient correction), reset, unavailable value or missing boundary makes that interval a gap, not zero. Only completed intervals appear; no future consumption is predicted. Boundary readings follow the meter's actual reporting cadence, so they are not guaranteed to land on the exact second.

If history yields no valid intervals, genuine **hourly recorder `change` statistics** are used instead, explicitly labeled **kWh / 60 min**, including their full time range in the tooltip. Hourly energy is never divided into made-up quarter-hours. Partial history remains partial rather than being filled from another cadence. Recorder must record the chosen sensor; the user's account must be able to read history/statistics. Loading, missing/invalid source, unavailable history and incomplete history are shown without blocking price data. Requests are deduplicated, cached for five minutes, and refreshed on HA updates/reconnection. Disabled or missing/invalid-source cards make no energy-history/statistics calls.

The legend toggles the overlay. Hover, touch and keyboard inspection include the energy value in kWh; a different energy interval (hourly fallback) shows its own time range.

Household consumption snapshots, screenshots and local real-data QA evidence are intentionally excluded from this repository for privacy. The standalone `qa/` fixture uses synthetic tariff data.

## Language

The card automatically follows the Home Assistant user's frontend language: Dutch for `nl` (including regional variants), and English for English or any unsupported language. This covers the native visual editor, selector options and helper text, chart labels, tables, hover details, errors, and screen-reader announcements. Dates, decimal separators and duration labels follow the same language; times retain a compact 24-hour format in Home Assistant's configured timezone.

The default title is translated automatically. A title explicitly entered in YAML or the editor is always preserved literally—even if it matches an old default title. Remove `title` to restore the automatic title. No language setting or nested configuration is required.

## Settings reference

| Option | Required | Default | Description |
|---|---:|---:|---|
| `entity` | Yes | — | Import sensor containing intervals in `attributes.data`. |
| `export_entity` | No | — | Export sensor with the same data format. Required when export information is shown. |
| `export_price_offset` | No | — | Signed EUR/kWh correction applied to the export entity prices. |
| `graph_mode` | No | `import` | Graph series: `import`, `both`, or `export`. |
| `current_price_mode` | No | `import` | Current metrics: `import`, `both`, `export`, or `none`. |
| `title` | No | Localized automatically | `Dynamic energy prices` / `Dynamische energieprijzen`. Explicit text is preserved literally. |
| `show_title` | No | `true` | Shows the title. When hidden, active favorable-period context uses its position. |
| `show_hover_line` | No | `true` | Shows a guide line for the active tooltip interval. |
| `show_average_line` | No | `false` | Shows a separately labelled average for each visible graph series. |
| `show_period_average` | No | `false` | Adds the average price of each favorable period to the table in ct/kWh, for both tariffs. |
| `show_period_day` | No | `true` | Show the compact day column in the period table. |
| `show_period_type` | No | `true` | Show the compact import/export tariff column. |
| `show_period_start` | No | `true` | Show period start times. |
| `show_period_end` | No | `true` | Show period end times. |
| `show_period_duration` | No | `true` | Show period durations. |
| `show_price_levels` | No | `true` | Shows the cheap, normal, and expensive reference lines and their price labels. |
| `show_consumption` | No | `false` | Optional recorded grid-import interval-energy line on a separate kWh scale. |
| `consumption_entity` | No | — | Cumulative grid-import meter in kWh, energy / total_increasing. Required for energy data, not for the price chart. |
| `consumption_line_style` | No | `solid` | Energy line: `solid`, `dashed`, or `dotted`. |
| `consumption_line_width` | No | `1.5` | Energy line width in px (1–8, step 0.5). |
| `consumption_line_color` | No | Theme secondary text | Optional RGB energy line color; empty restores the theme default. |
| `show_consumption_fill` | No | `false` | Independent energy fill, never bridging missing intervals. |
| `consumption_fill_color` | No | Energy line color | Optional RGB energy fill color. |
| `consumption_fill_fade` | No | `true` | Fade the energy fill vertically; does not enable fill. |
| `import_line_style` | No | `solid` | Import line style: `solid`, `dashed`, or `dotted`. |
| `line_interpolation` | No | `smooth` | Shared line geometry for import, export and consumption: `smooth` (curved), `linear` (point-to-point), or `step` (held value until the next point). Fills follow the line; missing intervals remain gaps. Does not change measured values, tariff calculations or tooltips. |
| `import_line_width` | No | `3.5` | Import line thickness from 1 to 8 px. |
| `import_line_color` | No | — | Optional RGB color override. Empty keeps automatic threshold colors. |
| `show_import_fill` | No | `true` | Shows a transparent fill below the import line. |
| `import_fill_color` | No | — | Optional RGB fill color. Empty uses the Home Assistant primary color. |
| `import_fill_fade` | No | `true` | Fades the import fill towards the bottom of the chart. |
| `import_selection_mode` | No | `individual` | `individual`, `contiguous`, or `minimum_blocks`. |
| `import_minimum_duration` | No | `30` | Minimum block duration in minutes for `minimum_blocks`. |
| `export_line_style` | No | `dashed` | Export line style: `solid`, `dashed`, or `dotted`. |
| `export_line_width` | No | `3.5` | Export line thickness from 1 to 8 px. |
| `export_line_color` | No | — | Optional RGB color override. Empty keeps automatic reversed threshold colors. |
| `show_export_fill` | No | `false` | Shows a transparent fill below the export line. |
| `export_fill_color` | No | — | Optional RGB fill color. Empty uses the export highlight blue. |
| `export_fill_fade` | No | `true` | Fades the export fill towards the bottom of the chart when enabled. |
| `export_selection_mode` | No | `individual` | `individual`, `contiguous`, or `minimum_blocks`. |
| `export_minimum_duration` | No | `30` | Minimum block duration in minutes for `minimum_blocks`. |
| `cheap_color` | No | Theme success color | Optional RGB override for favorable price semantics: low import / high export. |
| `normal_color` | No | `#f2a93b` | Optional RGB override for normal prices. |
| `expensive_color` | No | Theme error color | Optional RGB override for unfavorable price semantics: high import / low export. |
| `zero_color` | No | `#18a999` | Optional RGB override for the zero-price anchor in the import gradient. |
| `negative_color` | No | `#168aad` | Optional RGB override for negative import prices and markers. |
| `import_favorable_color` | No | Theme success color | Independent favorable import bands, legend, active-period badges, and table labels. Not linked to `cheap_color`. |
| `export_favorable_color` | No | `#1976d2` | Independent favorable export bands, legend, active-period badges, and table labels. Also supplies the automatic export fill color unless `export_fill_color` is set. |
| `cheap_price` | No | `0.15` | Low threshold in EUR/kWh. Low import is favorable; low export is unfavorable. |
| `normal_price` | No | `0.25` | Middle gradient anchor in EUR/kWh. |
| `expensive_price` | No | `0.40` | High threshold in EUR/kWh. High import is unfavorable; high export is favorable. |
| `cheapest_hours` | No | `0` | Lowest import duration selected per day. `0` disables it. |
| `export_best_hours` | No | `0` | Highest export duration selected per day. `0` disables it. |
| `show_cheapest_table` | No | `false` | Shows selected import periods when `cheapest_hours` is enabled. |
| `show_export_table` | No | `false` | Shows selected export periods when `export_best_hours` is enabled. |
| `tomorrow_after` | No | `14` | Local hour after which available tomorrow intervals become visible. |

Thresholds must be ordered as:

```text
cheap_price < normal_price < expensive_price
```

The visual editor groups configuration under **General**, **Import**, and **Export**. Price thresholds and the expandable **Price colors** (`Prijskleuren`) subgroup are in **General**. Independent period colors are in each tariff's **Favorable periods** subgroup. All settings are stored as flat YAML keys, so existing configurations remain compatible.

### Colors and overrides

- Colors are RGB arrays with three channels from `0` to `255`; `[0, 0, 0]` is valid black.
- Remove a key or clear its selector to restore its default. Empty arrays and `null` also reset safely.
- Price colors and favorable-period colors are independent: changing one does not recolor the other.
- Price colors apply to gradients, current-price values, reference lines, and hover markers. Export keeps the reversed meaning: high prices are favorable.
- `zero_color` controls the import gradient's zero-price anchor, not price classification.
- Fixed `import_line_color` and `export_line_color` override automatic line and marker colors. Explicit fill colors remain independent.
- Leaving the new colors unset preserves the original palette, opacity, spacing, and layout.

An export source is required only when the selected graph mode, current-price mode, or export-period selection uses export data. The card displays a configuration error with recovery guidance when such a source is missing.

## Favorable periods

`cheapest_hours` chooses the lowest-priced import duration per calendar day. `export_best_hours` independently chooses the highest-priced export duration. Each tariff supports three modes:

- `individual`: the best loose intervals;
- `contiguous`: one best contiguous block;
- `minimum_blocks`: the best one or more blocks, where every block meets the configured minimum duration.

Selected import and export periods share one table and remain clearly labelled.

With quarter-hour data and a value of `4`, sixteen intervals are selected per day.

## Interaction and accessibility

- Hover, pointer drag, and touch show all visible series for the nearest interval.
- Missing values in a partially aligned series are shown as `—` without hiding the other series.
- Import and export markers are separate round HTML elements, so they remain circular when the graph resizes.
- The graph is keyboard focusable. Use Left/Right, Home, End, and Escape.
- Tooltip text is mirrored to an `aria-live` region.
- Tapping outside the chart dismisses a touch tooltip.
- Clicking an import or export legend item toggles that graph series without changing the saved configuration.

## Sections view sizing

In a Home Assistant **Sections** view, use the card's **Layout** tab to change its height. The graph grows or shrinks with the allocated space. Enabling either table selects the taller default; tables scroll internally at smaller supported heights.

## Troubleshooting

### No import data

- Confirm that `entity` exists.
- Check **Developer Tools → States**.
- Verify `attributes.data` is an array containing `start_time` and `price_per_kwh`.
- Verify timestamps include a valid timezone offset.

### Export source required

Configure `export_entity`, or change export-dependent modes and selections back to import-only settings.

### Tomorrow is missing

Check the configured `tomorrow_after` hour and whether the source sensor already contains tomorrow's intervals.

## Development

Run these commands in `cards/dynamic-energy-price-card/` in this collection. The original standalone source project remains separate and unchanged.

```bash
npm test
npm run build
```

The build writes the standalone Eleven module to:

```text
dist/eleven-dynamic-energy-price-card.js
```

Do not edit the generated bundle directly. Serve this card directory and open `/qa/` for the synthetic fixture; `window.checkLocalization()` checks localization. Screenshot reproduction details remain in the original standalone project's `docs/QA-LOCALIZATION.md`.

## License

MIT
