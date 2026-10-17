# Eleven Timeline Card

Horizontal status-history bars, one per entity. Uses Home Assistant Recorder history; missing history remains unknown and is never replaced by the current state. Read-only: no devices or automations are controlled.

## Installation

The Graph and Timeline cards share one header implementation, including title typography, responsive spacing and stroke-based SVG icons. The visual editor’s Show title / Titel tonen switch (`show_title`, default `true`) hides only the heading, preserving its configured text and the zoom and History controls.

The header’s arrow opens Home Assistant History with all configured entities and the currently visible time range, including period navigation and viewport zoom. The link is keyboard-accessible and remains available without a title.


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

`show_grid`: default true, subtle vertical time guides aligned across all entities. Time labels adapt to the visible window and narrow cards use fewer ticks.

The cards share a compact period picker at the top right. Next to it, previous / Now / next and zoom out / in / reset form one borderless group with matching button sizes and a subtle divider between navigation and zoom. The picker, combined controls and History button share the same muted background and rounded corners; the History link uses an open icon. The header wraps on narrow cards and keeps the controls aligned to the right. **Default (N hours)** returns to hours_to_show. **Last** offers 1, 6, 12, 24 and 48 hours, plus 7, 14, 30, 90 and 365 days. **Calendar** offers Today, This week (Monday start), This month, This quarter and This year. Current calendar periods end now; earlier periods are complete and follow the Home Assistant timezone, including DST, leap years and variable month lengths. Rolling presets shift by their full duration. Historical ranges stay fixed during refresh. Selecting a period resets viewport zoom and never saves YAML or changes aggregation. The picker shows the period directly: Default (N hours) for the current configured view, compact dates and duration while browsing, calendar month/quarter/year names, and the visible range when zoomed. The separate range row is removed. The menu, hover title and accessible description retain the exact start/end with timezone offsets. Zoom status moves into the menu; it remains below the header if the picker is hidden. The native History link follows the viewed range. History and information use the same 8 px separation as the other header action groups, remaining adjacent when the header wraps. The menu supports arrow keys, Home/End, Enter, Escape and Tab, retains focus during card updates, and stays within the viewport. Period controls are visible by default; hide the timeframe selection in the visual editor (Show timeframe selection) or with show_navigation: false. Toggle grid lines independently with show_grid: false (Show grid); axis labels, data, zoom and the History link remain visible. Both settings default to true.

Zoom controls reflect the visible range: zoom out and reset are disabled at the full range, and zoom in is disabled at the one-minute minimum. A **Zoomed in / Ingezoomd** label appears beside the range and remains available when timeframe selection is hidden.

Double-click a sensor name in the History/Bar Chart legend to show only that series. Double-click the same name again to show all configured sensors. A single click still toggles one sensor. Timeline uses the entity name above its track for isolation while retaining its state-color legend. Shift+Enter (or Shift+click) provides the same isolate/restore action without double-clicking. The separate Focus series button and menu have been removed. These actions do not save YAML, refetch data or change the entities in the native History link.

The information icon beside **Open in History** opens **Data information / Gegevens**. Timeframe and information popups share their width, title/close row, spacing, theme surface, border and shadow. Sensor source/unit text is subdued. Each entity has a compact row showing its name and actual history source. Explanatory paragraphs and range/fetch-time blocks are omitted. Short per-sensor labels indicate hidden, incomplete, refreshing or outdated data; failed refreshes retain the previous values. Information and focus dialogs support keyboard use, Escape and outside dismissal, preserve state/focus across refresh, and fit the viewport. Timeline describes state history; it does not calculate numeric min/max/average for categorical states.


Timeline also retains the 6-hour and 24-hour choices. Status timelines use raw Recorder history; browsing older periods cannot restore purged state transitions.

`show_summary`: default false. Optional state-duration totals below each entity, calculated over only the visible (zoomed) interval; missing/unknown/unavailable durations remain separate.

`state_colors`: list of `state`, `color`, optional `label`, optional `entity`. Entity-specific mappings take priority over global mappings. Colors accept RGB arrays, hex, named CSS colors or CSS variables. `series_options`: list of `entity` and optional `name`.

Defaults use blue for active/on and grey for inactive/off; home is teal-green and away is amber. Alarm/problem binary-sensor classes use vermilion for a detected problem and teal-green for safe; opening sensors use amber for open. Connectivity, locks and covers have matching semantic colors. Unknown is striped grey, while unavailable is striped mauve. Other recorded values receive a deterministic, collision-resolved categorical palette (up to the 20-state limit), not a single shared purple. Assignments use the full fetched history, so zoom and transition order do not recolor states; a different set of states in another period can resolve palette collisions differently. Labels inside default hex and configured hex/RGB bars automatically choose black or white for contrast. Explicit entity rules, common rules and `default_color` retain priority, in that order.

Hover shows a vertical guide across all bars and an absolutely positioned tooltip with the state, interval start/end and duration for each entity. This overlay does not change the card height. A mouse click or touch tap pins it; Escape, focus leaving the chart or an outside tap dismisses it. Tab reaches segments; arrow keys and Home/End navigate state boundaries. Long pinned tooltips can be scrolled. Missing Recorder history is explicitly labeled No history, distinct from recorded Unknown and Unavailable, and is never replaced by the current entity state.

`sync_hover`: default true, shares the selected epoch timestamp bidirectionally with Eleven History and Energy graphs on the same page. `hover_sync_group`: default empty (the shared default group). Cards follow only the same named group; disabling sync keeps local hover working. Both settings are available under Timeline in the visual editor. Receivers hide for times outside their visible window, rather than clamping to its edges. Mouse, touch and keyboard share the same protocol; updates preserve the shared selection and detaching the source clears its group.

Zoom matches the History Card: + halves the visible window, − doubles it, ↺ restores the fetched window, and a left-button mouse drag selects a time range (minimum one minute). Zoom only clips cached intervals and does not fetch again or change their recorded values. Touch retains vertical page scrolling; use the zoom buttons on mobile. Period navigation fetches the requested window. The native state-rule selector suggests common values, an entity's current state and any advertised options, while accepting custom values.

Times follow the Home Assistant timezone; titles/messages follow Dutch/English frontend language. History refreshes every minute while connected. Disconnection clears polling and the outside-pointer listener; outdated requests are discarded.

## Verification

From the collection root, run `npm test` and `npm run check`. Timeline tests and the isolated browser fixture live in the root `tests/` directory. Browser fixtures use explicitly synthetic data, not household history.
