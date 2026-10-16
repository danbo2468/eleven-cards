# Eleven Overview (beta)

A compact overview of 1–8 numeric Home Assistant sensors, with current values, Recorder sparklines and signed change since the start of the selected rolling period. Different sensors may use different units. This is an exploratory beta; no device controls or sensor creation.

## Installation

Included in the local collection build `dist/eleven-cards.js`. For an existing standalone installation, install only `cards/overview-card/dist/eleven-overview-card.js` at `/config/www/eleven-cards/eleven-overview-card.js` and register `/local/eleven-cards/eleven-overview-card.js?v=<build-hash>` as a JavaScript module. Do not install a second combined resource alongside sibling modules. No HACS release has been published for this beta.

Refresh Home Assistant, Add card, search for **Eleven Overview (beta)**. A native visual editor provides title, period (1–168 hours), columns, graph and delta switches, plus independent expandable sensor settings: entity, name, color, reorder and remove.

```yaml
type: custom:eleven-overview-card
title: Eleven Overview (beta)
hours_to_show: 24
columns: auto
show_graph: true
show_delta: true
entities:
  - entity: sensor.example_power
    name: Power
    color: [33, 150, 243]
  - entity: sensor.example_temperature
    name: Temperature
    color: [231, 138, 20]
```

Entity identifiers above are examples, not installed sensors. Columns accepts `auto`, `1`, `2`, `3`; very narrow cards always reflow to one column. HA theme and Dutch/English labels are supported. Activate a sensor with click or keyboard to open Home Assistant more-info.

## Data semantics

Current values always come from live HA states. History refreshes once per minute in one batched request. Delta is current value minus the held value at the rolling period start, in that sensor's unit (percentage-point differences use `pp` for percent sensors). It is not yesterday's average, a percentage or a judgement of good/bad. Without a valid boundary value, comparison is unavailable. Unit changes and unavailable/non-numeric states break the line; gaps are never interpolated to zero. Recorder exclusion/retention limits can yield no history while the live value remains visible. History errors retain live values and offer Retry. Invalid or missing sensor states are explicit.

Miniature step lines have independent vertical scales per sensor and no cross-sensor amplitude meaning. They visualize recorded points, not reconstructed samples. Large retained histories can increase the initial request size; use short periods for high-frequency sensors.

## Development

Edit `src/`, not `dist/`. Run `node cards/overview-card/scripts/build.mjs`, `node --test cards/overview-card/tests/*.test.mjs`, then the root regression suite. Design and installation scope are recorded in `../../docs/OVERVIEW-BETA-PLAN.md`.
