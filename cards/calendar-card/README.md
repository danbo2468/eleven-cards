# Eleven Calendar (local beta)

Calendar events from 1–12 Home Assistant calendar entities. Choose a day list, day columns or a month view in the card configuration. An optional weather entity adds temperatures from its daily forecast. The card follows the Home Assistant timezone, including daylight saving changes. Week rows start on Monday.

[Back to Eleven Cards](../../README.md)

## Installation and configuration

The local collection build includes `custom:eleven-calendar-card`. Run the repository build, update your dashboard resource and refresh Home Assistant. This beta is not yet published through HACS. You can also register [the standalone module](dist/eleven-calendar-card.js) as a JavaScript module; use either the collection or standalone resource.

Add **Eleven Calendar (beta)** and choose the agenda entities in its visual editor. The editor provides Home Assistant entity selectors for calendars and weather, a native RGB color picker for each calendar, reordering and removal, the view, compact or expanded density, number of days and display options.

```yaml
type: custom:eleven-calendar-card
title: Agenda
view: list
days_to_show: 5
weather_entity: weather.home
entities:
  - entity: calendar.family
    name: Gezin
    color: [231, 175, 103]
  - entity: calendar.work
    name: Werk
    color: [130, 173, 245]
```

Replace the example entity IDs with your own. Names and colors are optional. If a name is omitted, the Home Assistant friendly name appears. Colors selected in the editor are saved as RGB arrays; hex colors in YAML are also accepted.

| Setting | Default | Purpose |
| --- | --- | --- |
| `entities` | required | 1–12 unique `calendar.*` entities, as IDs or objects with `entity`, optional `name` and `color`. |
| `weather_entity` | none | Optional `weather.*` entity. The daily forecast supplies each day's condition, high and low temperature. |
| `view` | `list` | Fixed card view: `list`, `columns` or `month`. Change it in the visual editor or YAML. |
| `density` | `expanded` | `expanded` or `compact` for all three views. Compact hides secondary event text; event popups retain the details. |
| `days_to_show` | `5` | 1–14 days for list and columns. Month always shows the full calendar month. |
| `show_title` | `true` | Show the card title. |
| `show_legend` | `true` | Show agenda toggles above the events. Click to hide or show one agenda; double-click to show only that agenda, and double-click again to show all. |
| `show_navigation` | `true` | Show previous, Now and next controls. |
| `hide_empty_days` | `false` | Hide days without visible appointments in the day list. Columns and month keep their complete calendar structure. |

The day list groups appointments below each date. In compact mode, each event uses one row with time and title. Day columns place events side by side and scroll inside the card when needed; compact mode reduces spacing and hides secondary text. The month view shows full Monday–Sunday weeks, including dimmed days from neighboring months. Expanded month cells use larger event text and spacing, showing three events per date; compact cells show two. **+N more** opens the complete list for that date. Click an event for its time, calendar, location and description. All-day events use an exclusive end date, as in Home Assistant.

The legend works like the graph legends: each agenda can be temporarily hidden or shown without changing the saved configuration or its Home Assistant subscription. Double-click or press Shift+Enter on a legend item to isolate that agenda; repeat to show all agendas. The choice lasts while the card stays open. If every agenda is hidden, the card shows a message; use the legend to show one again. Hiding the legend in the configuration restores all agendas.

Calendar data comes from Home Assistant's `calendar/event/subscribe` WebSocket API. The card receives the current date range and later event updates from each calendar. Changing the range replaces the subscriptions. Weather uses `weather/subscribe_forecast` with a daily forecast; older weather entities can provide the legacy `forecast` attribute. A weather entity without a daily forecast can still show the current condition for today. Future dates without forecast data stay empty. Calendar and weather subscriptions are released when the card is removed.

The first appointment that starts in the future is subtly highlighted, including in event detail lists. The marker advances automatically without replacing an open popup. A small warning in the legend identifies a calendar whose subscription failed or whose entity is unavailable; the other calendars remain usable.

The calendar has its own day and month navigation. Graph timeframe synchronization is not applied to calendar events. The calendar layout uses Home Assistant theme colors and Dutch or English labels. Its day and month boundaries use the configured Home Assistant timezone, including 23 and 25-hour dates.

In a Home Assistant Sections view, resize the card vertically in the Layout tab. The heading and legend remain above a scrollable event area. All three views support the chosen height; masonry dashboards use the card's content estimate.

For a local browser preview with generated appointments, open [the test page](qa/index.html). For a test card in Home Assistant, build the separate test collection with `node scripts/build-test.mjs`, register the generated module and add `custom:eleven-calendar-card-test`. The test page uses fictional data; the installed card reads your selected Home Assistant entities.
