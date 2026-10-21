# Eleven Cards

Home Assistant dashboard cards for energy prices, sensor graphs, state timelines and calendars.

## Cards

| Card | What it shows | Configuration |
| --- | --- | --- |
| **Energy** | Import and export prices, favorable periods and an optional grid-import energy overlay. | [Energy documentation](cards/dynamic-energy-price-card/README.md) |
| **History** | Recorded values from 1–8 numeric sensors, with an independent y-axis per unit. | [History documentation](cards/history-graph-card/README.md) |
| **Timeline** | State history for entities such as doors, switches and people. | [Timeline documentation](cards/timeline-card/README.md) |
| **Overview (beta)** | Current sensor values, sparklines and change since period start. | [Overview documentation](cards/overview-card/README.md) |
| **Bar Chart (beta)** | Vertical grouped or stacked sensor-history bars, based on History. | [Bar Chart documentation](cards/bar-chart/README.md) |
| **Heatmap (beta)** | Sensor averages or consumption grouped by hour, day, week or month. | [Heatmap documentation](cards/heatmap-card/README.md) |
| **Calendar (beta)** | Calendar events in a day list, day columns or month view, with optional weather. | [Calendar documentation](cards/calendar-card/README.md) |

![Eleven Dynamic Energy Price Card preview](cards/dynamic-energy-price-card/docs/images/revised-default-dark-desktop.png)

All seven cards include a visual editor and follow Home Assistant's light/dark theme and Dutch/English frontend language. Energy, History, Timeline and Bar Chart support synchronized hover across cards. History, Bar Chart and Timeline also share a compact period picker and a single group for previous/next, Now and zoom controls in the header, with rolling windows and local calendar days, weeks, months, quarters and years. These three cards also indicate zoom, support isolating one entity and provide an information icon beside History with compact per-sensor source and unit information. History and Bar Chart include per-sensor min/max/average for the viewed range; Delta Bar Chart adds sums in the same popup. Calendar has its own day/month navigation and does not join graph timeframe synchronization.

The cards use existing Home Assistant data. They do not provide tariffs, create sensors or control devices. See each card's documentation for its sensor requirements and configuration options.

## Synchronize timeframes (local version)

All six visual editors expose **Synchronize timeframe** (off by default) and **Synchronization group**. Enable it on each card to link, using the same group key:

```yaml
sync_timeframe: true
hover_sync_group: energy
```

Hover and timeframe synchronization use the same `hover_sync_group` setting, labeled Synchronization group. Each synchronization can be enabled separately. Legacy `timeframe_sync_group` is accepted when `hover_sync_group` is absent.

The compact timeframe popup has **Last**, **Calendar** and **Custom range** tabs, with **Default** always available above them. It opens the category of the selected range and keeps drafts when switching tabs or refreshing.

Open the **Custom range** tab to enter start and end dates and times in the Home Assistant timezone (up to 366 days). The chosen range stays fixed and can be shared with the group. Previous/next move by the range duration; Now shows that duration ending at the current time. Default restores each card's own configured range.

History, Bar Chart, Timeline and Heatmap share timeframe menu selections and previous/next/Now. Explicit periods share the actual range, even when cards have different default hours. Selecting **Default** resets every linked card to its own configured hours; Overview returns to live values and Energy to its native price window. Zoom, aggregation and saved configuration remain local. Hiding navigation does not stop a card from following. Empty keys use the default group; different keys stay independent.

Overview follows the range and shows the last recorded value at its end, with change from its start. Energy follows using price intervals available in its source; missing periods show an availability message. Energy's current-price summaries still refer to now. Overview and Energy do not have their own timeframe picker.

Synchronization lasts within the open page. Later cards adopt the last group selection; reloading the page restores configured defaults. No Home Assistant server changes are required.

For a separate Home Assistant test collection, run `npm run build` and `node scripts/build-test.mjs`. The generated test module and Dutch instructions are in `.cache/home-assistant-test/` (`LEESMIJ-TIJDVAK.md`). Use this collection instead of also loading the separate Heatmap test resource. It includes Calendar as `custom:eleven-calendar-card-test`.

## Installation

### HACS

1. Open **HACS → Custom repositories**.
2. Add `https://github.com/hidder11/eleven-cards` with type **Dashboard**.
3. Download **Eleven Cards**.
4. Under dashboard resources, check that `/hacsfiles/eleven-cards/eleven-cards.js` is registered as a **JavaScript module**. Add it if it is missing.
5. Refresh your browser.

The published cards are included in one module. Local beta cards below are not yet published. Use the custom repository to install the released collection; Eleven Cards is not included in the default HACS list.

### Manual installation

1. Download [`dist/eleven-cards.js`](dist/eleven-cards.js).
2. Copy it to `/config/www/eleven-cards/eleven-cards.js`.
3. Add `/local/eleven-cards/eleven-cards.js` to your dashboard resources as a **JavaScript module**.
4. Refresh your browser.

Do not load the collection module alongside the standalone Eleven card modules. Choose one installation method to avoid registering the same cards twice.

## Add a card

Edit your dashboard, choose **Add card**, and search for **Eleven**. Select a card, choose its entities, and configure it in the visual editor.

For YAML configuration, use these types:

| Card | YAML type |
| --- | --- |
| Energy | `custom:eleven-dynamic-energy-price-card` |
| History | `custom:eleven-history-graph-card` |
| Timeline | `custom:eleven-timeline-card` |
| Overview (beta) | `custom:eleven-overview-card` |
| Bar Chart (beta) | `custom:eleven-bar-chart` |
| Heatmap (beta) | `custom:eleven-heatmap-card` |
| Calendar (beta) | `custom:eleven-calendar-card` |

Overview, Bar Chart, Heatmap and Calendar are local betas in this working tree; they have not been published as a HACS release.

The card documentation linked above includes YAML examples and option details.

## Migrating from the standalone cards

If your dashboard uses `custom:dynamic-energy-price-card` or `custom:history-graph-card`:

1. Back up your dashboard configuration and resource list.
2. Install Eleven Cards, keeping the old resources during migration.
3. Change the card types to `custom:eleven-dynamic-energy-price-card` and `custom:eleven-history-graph-card` respectively. Leave the other configuration options unchanged.
4. Refresh your browser and check the migrated cards.
5. Remove an old resource only when no dashboard uses its old card type.

Installing Eleven Cards does not automatically update saved dashboard configurations.

## Card height

All seven cards support vertical sizing in the Home Assistant Sections view. Open the card editor's Layout tab and choose its number of rows. Each card supplies a default and a minimum height. History, Bar Chart and Energy resize their graphs; Calendar, Timeline and Overview scroll their contents when needed. Heatmap scrolls its matrix inside the allocated height, still respecting its configured maximum matrix height. Masonry dashboards continue to use each card's `getCardSize()` estimate.

## Development

Requires Node.js 20+, npm and Python 3. No npm dependencies need to be installed.

Run from the repository root:

```sh
npm run build
npm test
npm run check
```

Edit the source files, not the generated bundles. The build produces `dist/eleven-cards.js` for the collection and a standalone module in each card's `dist/` directory.

Reusable buttons, tabs and popups live in `shared/ui-*.js`. See [Shared UI components](shared/README.md) for their rendering, styling and lifecycle APIs.
