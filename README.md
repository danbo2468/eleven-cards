# Eleven Cards

Home Assistant dashboard cards for energy prices, sensor graphs and state timelines.

## Cards

| Card | What it shows | Configuration |
| --- | --- | --- |
| **Energy** | Import and export prices, favorable periods and an optional grid-import energy overlay. | [Energy documentation](cards/dynamic-energy-price-card/README.md) |
| **History** | Recorded values from 1–8 numeric sensors with the same unit. | [History documentation](cards/history-graph-card/README.md) |
| **Timeline** | State history for entities such as doors, switches and people. | [Timeline documentation](cards/timeline-card/README.md) |

![Eleven Dynamic Energy Price Card preview](cards/dynamic-energy-price-card/docs/images/revised-default-dark-desktop.png)

All three cards include a visual editor and follow Home Assistant's light/dark theme and Dutch/English frontend language. Energy and History support synchronized hover across cards.

The cards use existing Home Assistant data. They do not provide tariffs, create sensors or control devices. See each card's documentation for its sensor requirements and configuration options.

## Installation

### HACS

1. Open **HACS → Custom repositories**.
2. Add `https://github.com/hidder11/eleven-cards` with type **Dashboard**.
3. Download **Eleven Cards**.
4. Under dashboard resources, check that `/hacsfiles/eleven-cards/eleven-cards.js` is registered as a **JavaScript module**. Add it if it is missing.
5. Refresh your browser.

All three cards are included in one module. Use the custom repository to install them; Eleven Cards is not included in the default HACS list.

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

The card documentation linked above includes YAML examples and option details.

## Migrating from the standalone cards

If your dashboard uses `custom:dynamic-energy-price-card` or `custom:history-graph-card`:

1. Back up your dashboard configuration and resource list.
2. Install Eleven Cards, keeping the old resources during migration.
3. Change the card types to `custom:eleven-dynamic-energy-price-card` and `custom:eleven-history-graph-card` respectively. Leave the other configuration options unchanged.
4. Refresh your browser and check the migrated cards.
5. Remove an old resource only when no dashboard uses its old card type.

Installing Eleven Cards does not automatically update saved dashboard configurations.

## Development

Requires Node.js 20+, npm and Python 3. No npm dependencies need to be installed.

Run from the repository root:

```sh
npm run build
npm test
npm run check
```

Edit the source files, not the generated bundles. The build produces `dist/eleven-cards.js` for the collection and a standalone module in each card's `dist/` directory.
