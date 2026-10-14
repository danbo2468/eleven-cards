# Eleven History Graph Card

[← Eleven Cards](../../README.md)

A compact Home Assistant card for comparing historical numeric sensors that share one unit.

Part of the Eleven Cards collection. Both cards are bundled for HACS; installation remains unavailable while this repository is private. See [HACS installation](../../README.md#hacs-installation) and the [migration guide](../../README.md#migrating-existing-dashboards) before replacing an existing card.

## Quick start

After installing the standalone JavaScript module as described below, add a card with this YAML:

```yaml
type: custom:eleven-history-graph-card
entities:
  - sensor.living_room_temperature
  - sensor.bedroom_temperature
title: Temperature
hours_to_show: 24
```

Replace both example entity IDs with your own recorded numeric sensors. Their units must match exactly, such as two temperature sensors in °C.

## Installation

For collection installation, see [HACS installation](../../README.md#hacs-installation). It installs both cards through one module after the repository becomes public. For manual standalone installation, use `dist/eleven-history-graph-card.js` built from this collection's `cards/history-graph-card/` directory.

1. Build the standalone card using the commands under **Build and test**.
2. Copy `dist/eleven-history-graph-card.js` to `/config/www/eleven-cards/eleven-history-graph-card.js` in Home Assistant.
3. Register `/local/eleven-cards/eleven-history-graph-card.js` as a dashboard resource of type **JavaScript module**.
4. Refresh the browser and add the card using the quick-start YAML.

If an old history card is already installed, follow the migration guide: its old type is not registered by this new module. Leave existing entities and settings unchanged. Do not add a duplicate Eleven resource or overwrite HACS-managed files manually.

If you create the `www` directory for the first time, restart Home Assistant so its files become available. See the official [resource registration documentation](https://developers.home-assistant.io/docs/frontend/custom-ui/registering-resources/).

## Features

- Shared y axis for 1–8 sensors with exactly the same unit.
- Compact native `ha-card`, wrapping legend and distinct solid/dashed series.
- Mouse hover, click/touch-pinned details; keyboard arrows, Home/End and Escape.
- Automatic Dutch/English text and number/date formatting, light/dark theme inheritance.
- Native Home Assistant form/selectors and Sections resizing. Each sensor is added once, with its name, complete line styling and fill in the same expandable entry; existing YAML remains compatible.
- Recorder unavailable/unknown intervals remain real gaps.

## Examples

### Fixed temperature range

```yaml
type: custom:eleven-history-graph-card
entities:
  - sensor.living_room_temperature
  - sensor.bedroom_temperature
title: Temperature
hours_to_show: 48
y_min: 10
y_max: 30
show_hover_line: true
```

Omit either bound to let that side scale automatically. Set `title: ""` to hide the title. The gradient example below shows appearance settings that can be added to this configuration.

## Configuration

| Key | Required | Default | Meaning |
| --- | --- | --- | --- |
| `entities` | Yes | — | 1–8 unique numeric `sensor.*` entity IDs. Array of strings. |
| `title` | No | Localized History / Historie | Explicit text is preserved; empty string hides the title. |
| `hours_to_show` | No | `24` | Numeric range 1–8760 hours; only retained recorder history is available. |
| `series_options` | No | Concrete appearance per sensor | Per-sensor identity, line and fill settings, described below. RGB triplet or six-digit hex colors are accepted. |
| `graph_mode` | No | `lines` | Separate `lines` or cumulative `stacked` lines; positive and negative values stack separately. |
| `aggregation_period` | No | `none` | `none`, `minute`, `quarter_hour`, `hour`, `day`, `week`, or `month`; applies to every sensor separately. |
| `aggregation_method` | No | `avg` | `min`, `max`, or recorder-held time-weighted `avg` over valid data within each period. |
| `y_min` | No | Automatic | Exact shared Y-axis minimum in the sensor unit; blank/null restores automatic scaling. |
| `y_max` | No | Automatic | Exact shared Y-axis maximum in the sensor unit; must exceed `y_min` when both are set. |
| `show_legend` | No | `true` | Show sensor names, line keys and latest values. Hiding it preserves the unit, tooltip and all series. |
| `show_hover_line` | No | `true` | Vertical hover guide; disabling keeps tooltip and markers. |
| `sync_hover` | No | `true` | Shares hover, touch and keyboard selection with other Eleven energy/history graphs on the same page. Disable for independent interaction. |
| `hover_sync_group` | No | Empty | Only cards with the same group synchronize; empty uses the default group. Guides follow the exact timestamp, not the same pixel position. Outside a receiving chart's time range, its tooltip and guide are hidden. |
### Settings ownership

The editor separates Graph (title, time range, Y bounds, legend and hover), shared Data processing, and Sensors. Open one sensor entry to select its entity once and adjust its name, line and fill. There are no duplicate global appearance controls. Each of two sensors has exactly the same independent controls as a single sensor.

Each `series_options` record supports:

| Key | Default | Meaning |
| --- | --- | --- |
| `entity` | Required | A sensor listed in `entities`. |
| `name` | Sensor friendly name | Optional display name. |
| `line_style_source` | Own appearance | Optional entity ID of another sensor on this card. Follow its width, dash style and interpolation live; color, gradient and fill remain independent. Missing sources, self-links and cycles are rejected. |
| `line_width` | `3.5` | 1–8 pixels, independently per sensor unless explicitly following another sensor. |
| `line_style` | Alternating solid/dashed | `solid`, `dashed` or `dotted`. |
| `line_interpolation` | `step` | `smooth`, `linear` or recorder-held `step`; applies to that sensor's line and fill. |
| `color_mode` | `fixed` for new sensors | `fixed` shows one color picker; `gradient` shows value/color stops and transition mode. |
| `color` | Distinct sensor palette | Fixed line color. Dormant while gradient mode is selected. |
| `gradient_mode` | `smooth` | `smooth` color interpolation or `steps` hard thresholds; not measurement interpolation. |
| `gradient_stops` | `[]` | 2–32 distinct `{value,color}` records required in gradient mode. Initial editor stops use values 0 and 1: adjust them to your sensor's scale. |
| `show_fill` | `false` | Only this sensor's fill. Other fill controls appear when enabled. |
| `fill_opacity` | `0.18` | 0–1. |
| `fill_fade` | `true` | Fade towards the bottom of the graph. |
| `fill_mode` | `line` | `line` follows this sensor's line color or gradient; `own` uses a separate color. |
| `fill_color` | Sensor palette | Used only in `own` mode. Never changes the line. |

With two or more sensors, the Line group offers **Line appearance → Own appearance / Follow [sensor]**. Following hides width, line style and interpolation controls and keeps the source visible. Changing the source updates linked lines immediately. Choosing Own appearance retains the current effective geometry and makes those controls editable again. Removing a source detaches its followers with their current geometry; replacing its entity updates the links. Reordering uses entity IDs, not row positions. The selector excludes self and circular links; a single sensor needs no source selector. Color, gradients and all fill controls remain editable per sensor.

Mode changes retain dormant settings. Sensor reordering retains its appearance rather than assigning a new palette/style by position. Old top-level `line_style`, `line_width`, `line_interpolation`, `line_color`, fill options and gradient options remain accepted for existing YAML. Opening and saving the visual editor resolves their effective appearance into explicit per-sensor records and removes those legacy top-level appearance keys. It does not modify other cards or dashboards.

### Manual gradient
Set `y_min` and/or `y_max` independently in the native editor or YAML. Unset bounds remain automatic. If data lies entirely outside a single fixed bound, the automatic side stays at least one unit (or 5% of that bound) away to keep a valid range. Lines and fills outside the selected range are clipped; tooltips still report actual values without an off-chart marker.

The native editor exposes add/remove color-stop records inside each sensor's Line group. Values are absolute sensor values in the shared unit, not percentages of the changing chart range. Stops are sorted automatically; values outside the configured range keep the endpoint colors. Explicit `color_mode` selects fixed color versus gradient, and explicit `fill_mode` selects follow-line versus own fill color. There is no hidden priority between these controls. Legacy YAML's old priority rules are preserved only when resolving configurations that omit the explicit modes.

```yaml
series_options:
  - entity: sensor.living_room_temperature
    color_mode: gradient
    gradient_mode: smooth
    gradient_stops:
      - value: 10
        color: [30, 120, 240]
      - value: 25
        color: [240, 120, 30]
  - entity: sensor.bedroom_temperature
    color_mode: gradient
    gradient_mode: steps
    gradient_stops:
      - value: 10
        color: [160, 80, 220]
      - value: 25
        color: [40, 180, 100]
```

```yaml
series_options:
  - entity: sensor.living_room_temperature
    color_mode: fixed
    color: [33, 150, 243]
    line_width: 2
    line_style: solid
    line_interpolation: step
    show_fill: false
  - entity: sensor.bedroom_temperature
    color_mode: gradient
    line_width: 5
    line_style: dashed
    line_interpolation: linear
    gradient_mode: smooth
    gradient_stops:
      - value: 10
        color: [30, 120, 240]
      - value: 22
        color: [240, 120, 30]
    show_fill: true
    fill_mode: line
    fill_opacity: 0.18
    fill_fade: true
```

Use `gradient_mode: steps` for hard transitions. Hex colors such as `"#2878ef"` are also accepted in YAML. Duplicate values, invalid colors and out-of-range appearance options are rejected. Defaults preserve the existing sensor palette, step lines and unfilled graph.

Units come from current `hass.states` metadata. All units must match exactly, including unitless sensors. No implicit conversions. Current `unavailable` is allowed if recorded history contains numeric states. Numeric-looking data is validated per history row. Do not mix cumulative energy, power, temperatures or differently scaled units.

## Data contract

The card uses `hass.callApi('GET', 'history/period/<ISO start>?…')`. Home Assistant adds `/api/` and authentication. Query includes `filter_entity_id`, explicit `end_time`, `minimal_response`, `no_attributes` and `significant_changes_only=0`.

Official references:
- https://developers.home-assistant.io/docs/api/rest/
- https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/
- https://github.com/home-assistant/core/blob/dev/homeassistant/components/history/__init__.py
- https://github.com/home-assistant/core/blob/dev/homeassistant/components/recorder/history/__init__.py

REST returns a list of per-entity lists. First row identifies the entity; minimal subsequent rows may have only `state` and `last_changed`. The decoder does not rely on array position. Full-row `last_updated` takes priority; minimal timestamps use `last_changed`. Empty/missing entity lists are supported. This is REST minimal-response format, not the WebSocket `{s,lu}` compressed format.

Lines use recorder-held state (step geometry). Query-start initial state is deliberately included as context, not labelled a new measurement. A state remains valid until the next recorder state; an absent update alone is not proof of a gap. Non-numeric/unavailable/unknown rows interrupt the line until a numeric state resumes; times before the first state stay unknown. Tooltips report held values at the selected time, not interpolated readings.

Recorder/history must be enabled and include the sensors. Purged history cannot be recovered; partial missing data is labelled. Aggregation uses calendar boundaries in the Home Assistant time zone, Monday-based weeks and calendar months. Missing intervals remain gaps; averages use valid recorder-held durations, not sample counts. Zoom buttons and desktop drag selection change only the visible time range, never the configured aggregation. Long-term statistics, rate conversion and estimated gap filling are not implemented. Because `no_attributes` is used, historical unit changes cannot be detected: choose sensors whose units remain stable. Values are displayed with at most two decimal places; the plot retains numeric precision.

Requests are at most one per card per minute after completion (except explicit config changes/retry), not per `hass` update. A 15-second timeout bounds waiting; older results are ignored on configuration changes or disconnection. The underlying `callApi` request cannot be physically aborted by this API; timed-out results never overwrite newer data. Loading, empty, unit mismatch and network errors have explicit states. No runtime CDN or dependencies.

## Console debug preview

Run `window.elevenCards.debug.elf()` in the browser developer console for one 4.2-second elf flyby on every connected history card. Calling it again restarts the flight. The return value is the number of connected cards; `0` means none are mounted. The preview survives card rerenders without restarting and changes no saved configuration. At 11:11 in the Home Assistant time zone, one elf flies past, then disappears. A per-tab session marker prevents automatic repeats that day, including after a reload. Reduced-motion users see a brief stationary elf instead of flight.

The library prints one styled Eleven Cards name/version line on first load. The version follows the standalone build; additional instances and duplicate bundle loads do not repeat the banner.

## Troubleshooting

### The card is not found

Check that the JavaScript module resource is registered, its URL loads successfully, and the browser has been refreshed. Confirm that the YAML type is `custom:eleven-history-graph-card`.

### Units do not match

Check the selected sensors in **Developer Tools → States**. Their `unit_of_measurement` values must match exactly. The card does not convert °F to °C, W to kW, or power to energy.

### History is empty or incomplete

Verify that Recorder records each sensor, the requested period is retained, and your account can read history. Non-numeric, unknown and unavailable states are gaps, not zero values. Purged history cannot be recovered by this card.

### Configuration is rejected

Use 1–8 unique `sensor.*` entities, a period of 1–8760 hours, and valid appearance settings. If both axis bounds are set, `y_min` must be lower than `y_max`. Gradient stops need 2–32 unique values and valid colors, or an empty list to disable the gradient.

## Build and test

Run these commands in this collection's `cards/history-graph-card/` directory. The original standalone source project remains separate and unchanged.

Node 20+:

```sh
npm run build
npm test
node --check dist/eleven-history-graph-card.js
```

The only runtime file is **`dist/eleven-history-graph-card.js`**. Build concatenates the small ES modules into an isolated standalone bundle. Source is under `src/`; tests use the built-in Node runner, including a VM registration check. See the standalone source project's `docs/VERIFICATION.md` for actual RED/GREEN and browser results.

## Local synthetic QA

```sh
python3 -m http.server 18766 --bind 127.0.0.1
# Open http://127.0.0.1:18766/qa/ ; stop the server afterward.
```

Serve the project root, not `qa/`. The fixture emulates `ha-card` and `hass.callApi` using explicitly **synthetic** temperature history, including compressed-style REST rows, reversed entity order and an unavailable interval. Fixture-only language, theme and response controls are not card settings. `window.runChecks()` measures tooltip bounds, round markers, line dashes, Escape and page overflow. It is not proof of live HA integration or real native editor compatibility.

The manual Eleven installation uses `/local/eleven-cards/eleven-history-graph-card.js`; a cache query may be appended for updates. This preparation does not change any live resources or publish a release.
