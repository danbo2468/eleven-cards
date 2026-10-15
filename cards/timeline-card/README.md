# Eleven Timeline Card

Horizontal status-history bars, one per entity. Uses Home Assistant Recorder history; missing history remains unknown and is never replaced by the current state. Read-only: no devices or automations are controlled.

## Installation

Included in the root Eleven Cards collection (`dist/eleven-cards.js`). Alternatively build with `node cards/timeline-card/scripts/build.mjs`, copy `dist/eleven-timeline-card.js` from this card to `/config/www/eleven-cards/`, and register `/local/eleven-cards/eleven-timeline-card.js` as a JavaScript module. Do not register the standalone module and collection together.

Add **Eleven Timeline Card** through the card picker. The editor uses native Home Assistant controls: **Timeline**, one expandable entry per entity, **Common state rules**, and **Bar appearance**. Select each entity once; its optional name and its own status/color/label rules live in that same entry. Add, remove and reorder entries without separating their names and rules. Individual state rules use native object dialogs without another entity picker. Common rules apply only when no entity-specific rule matches. Duplicate state values within the same scope are reported explicitly.

Existing flat `entities`, `series_options` and `state_colors` YAML stays valid. Opening the editor performs no save; saving converts the grouped editor view back to those keys. Rules and name overrides for entities outside the visible list are preserved. Clearing an optional name in the editor restores the Home Assistant name. Editors and labels follow Dutch/English frontend language; user text is never translated.

```yaml
type: custom:eleven-timeline-card
entities:
  - binary_sensor.example
  - person.example
hours_to_show: 24
bar_height: 18
border_radius: 5
row_gap: 16
show_labels: true
show_legend: true
show_axis: true
show_state_labels: false
state_colors:
  - state: 'on'
    color: [38, 166, 154]
    label: Aan
  - state: 'off'
    color: [96, 125, 148]
    label: Uit
```

## Options

`entities`: 1–16 entity IDs, any domain. Each entity is limited to 20 distinct recorded state values in the fetched period (including `unknown` and `unavailable`). At the 21st distinct value, that entity shows a clear warning instead of segments, summary or legend entries; other entities remain visible. This fixed limit uses raw values, not display labels. Zoom cannot bypass it; loading a period with at most 20 values restores the timeline. Missing history does not count as a recorded state. `title`: optional heading. `hours_to_show`: 1–8760 hours, default 24 (available data depends on Recorder retention).

`bar_height`: 4–80 pixels, default 18. `border_radius`: 0–40 pixels, default 5. `row_gap`: 0–64 pixels, default 16. `default_color`: fallback color for unmapped states, RGB array or hex. All three layout controls are exposed in the visual editor.

`show_labels`, `show_legend`, `show_axis`: default true. `show_state_labels`: default false; labels inside short segments are clipped instead of overlapping.

`show_grid`: default true, subtle vertical time guides aligned across all entities. Time labels adapt to the visible window and narrow cards use fewer ticks. `show_navigation`: default true, compact 6-hour / 24-hour / 7-day selection, previous/next window and Now. A configured custom duration remains available in the picker. These controls change only the current card session; they never save dashboard YAML. Previous/next shifts by the selected duration, not calendar days. The displayed dates follow the Home Assistant timezone.

`show_summary`: default false. Optional state-duration totals below each entity, calculated over only the visible (zoomed) interval; missing/unknown/unavailable durations remain separate.

`state_colors`: list of `state`, `color`, optional `label`, optional `entity`. Entity-specific mappings take priority over global mappings. Colors accept RGB arrays, hex, named CSS colors or CSS variables. `series_options`: list of `entity` and optional `name`.

Defaults distinguish on/home (green), off (blue-grey), not_home (amber), unknown/unavailable (striped grey) and other states (purple). Explicit mappings override defaults.

Hover shows a vertical guide across all bars and an absolutely positioned tooltip with the state, interval start/end and duration for each entity. This overlay does not change the card height. A mouse click or touch tap pins it; Escape, focus leaving the chart or an outside tap dismisses it. Tab reaches segments; arrow keys and Home/End navigate state boundaries. Long pinned tooltips can be scrolled. Missing Recorder history is explicitly labeled No history, distinct from recorded Unknown and Unavailable, and is never replaced by the current entity state.

`sync_hover`: default true, shares the selected epoch timestamp bidirectionally with Eleven History and Energy graphs on the same page. `hover_sync_group`: default empty (the shared default group). Cards follow only the same named group; disabling sync keeps local hover working. Both settings are available under Timeline in the visual editor. Receivers hide for times outside their visible window, rather than clamping to its edges. Mouse, touch and keyboard share the same protocol; updates preserve the shared selection and detaching the source clears its group.

Zoom matches the History Card: + halves the visible window, − doubles it, ↺ restores the fetched window, and a left-button mouse drag selects a time range (minimum one minute). Zoom only clips cached intervals and does not fetch again or change their recorded values. Touch retains vertical page scrolling; use the zoom buttons on mobile. Period navigation fetches the requested window. The native state-rule selector suggests common values, an entity's current state and any advertised options, while accepting custom values.

Times follow the Home Assistant timezone; titles/messages follow Dutch/English frontend language. History refreshes every minute while connected. Disconnection clears polling and the outside-pointer listener; outdated requests are discarded.

## Verification

From the collection root, run `npm test` and `npm run check`. Timeline tests and the isolated browser fixture live in the root `tests/` directory. Browser fixtures use explicitly synthetic data, not household history.
