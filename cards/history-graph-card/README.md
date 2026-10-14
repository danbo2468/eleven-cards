# Eleven History Graph Card

[← Eleven Cards](../../README.md)

A compact Home Assistant card for comparing historical numeric sensors that share one unit.

Part of the Eleven Cards collection preparation. Shared HACS packaging is not yet published; this local build uses Eleven-prefixed runtime names. See the [migration guide](../../README.md#migrating-existing-dashboards) before replacing an existing card.

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

There is no published collection installation route yet. For manual installation, use `dist/eleven-history-graph-card.js` built from this collection's `cards/history-graph-card/` directory.

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
- Native `getConfigForm()` editor and Sections resizing.
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
| `hours_to_show` | No | `24` | Numeric range 1–168 hours, fractional values accepted. No in-card range controls. |
| `y_min` | No | Automatic | Exact shared Y-axis minimum in the sensor unit; blank/null restores automatic scaling. |
| `y_max` | No | Automatic | Exact shared Y-axis maximum in the sensor unit; must exceed `y_min` when both are set. |
| `line_style` | No | Alternating solid/dashed | `solid`, `dashed` or `dotted`; applies to all series. |
| `line_interpolation` | No | `step` | Line geometry: `smooth` (curved), `linear` (point-to-point), or `step` (held value until the next point). Applies to lines and fills. Gaps remain gaps; recorded values and tooltip values are unchanged. |
| `line_width` | No | `3.5` | Line width, 1–8 pixels; matches the energy graph default. |
| `line_color` | No | Per-sensor palette | RGB triplet or six-digit hex; empty/null restores the palette. Gradient stops take priority. |
| `show_fill` | No | `false` | Fill below each line; missing data stays a gap. |
| `fill_color` | No | Follows line | Fixed RGB triplet or six-digit hex; empty/null follows line or gradient. |
| `fill_opacity` | No | `0.18` | Fill opacity from 0 to 1. |
| `fill_fade` | No | `true` | Fade fill towards the graph bottom. |
| `show_hover_line` | No | `true` | Vertical hover guide; disabling keeps tooltip and markers. |
| `gradient_mode` | No | `smooth` | `smooth` interpolates colors; `steps` switches colors at thresholds. |
| `gradient_stops` | No | `[]` | 2–32 distinct `{value, color}` records, or empty/null to disable. |

### Manual gradient
Set `y_min` and/or `y_max` independently in the native editor or YAML. Unset bounds remain automatic. If data lies entirely outside a single fixed bound, the automatic side stays at least one unit (or 5% of that bound) away to keep a valid range. Lines and fills outside the selected range are clipped; tooltips still report actual values without an off-chart marker.

The native editor exposes add/remove color-stop records with a sensor value and RGB color picker. Values are absolute sensor values in the shared unit, not percentages of the changing chart range. Stops are sorted automatically; values below/above the configured range keep the endpoint colors. A gradient applies to all series. Lines keep recorder-held step geometry; color interpolation does not interpolate measurements. A fixed `fill_color` overrides the fill gradient only.

```yaml
line_style: dashed
line_width: 3.5
show_fill: true
fill_opacity: 0.18
fill_fade: true
gradient_mode: smooth
gradient_stops:
  - value: 10
    color: [30, 120, 240]
  - value: 19
    color: [40, 180, 100]
  - value: 22
    color: [240, 120, 30]
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

Recorder/history must be enabled and include the sensors. Purged history cannot be recovered; partial missing data is labelled. Long-term statistics, resampling, aggregation, rate conversion and estimated gap filling are not implemented. Because `no_attributes` is used, historical unit changes cannot be detected: choose sensors whose units remain stable. Values are displayed with at most two decimal places; the plot retains numeric precision.

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

Use 1–8 unique `sensor.*` entities, a period of 1–168 hours, and valid appearance settings. If both axis bounds are set, `y_min` must be lower than `y_max`. Gradient stops need 2–32 unique values and valid colors, or an empty list to disable the gradient.

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
