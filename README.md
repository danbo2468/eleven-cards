# Eleven Cards

Compact, configurable Home Assistant dashboard cards for energy prices and sensor history.

Each card works independently. They display existing Home Assistant data; they do not supply tariffs, create sensors, or control devices.

## Cards

| Card | Purpose | Documentation |
| --- | --- | --- |
| Eleven Dynamic Energy Price Card | Compare import/export prices, find favorable periods, and optionally overlay recorded grid-import energy. | [Installation and configuration](cards/dynamic-energy-price-card/README.md) |
| Eleven History Graph Card | Compare recorded values from 1–8 numeric sensors with the same unit. | [Installation and configuration](cards/history-graph-card/README.md) |

![Eleven Dynamic Energy Price Card preview](cards/dynamic-energy-price-card/docs/images/revised-default-dark-desktop.png)

The preview uses a real tariff snapshot in a standalone example, not a live dashboard. See the card documentation for its data provenance and settings. Screenshots predate the runtime rename; chart settings and appearance are unchanged.

## Start here

1. Choose a card and check its sensor requirements.
2. Build and install its Eleven-prefixed module using its README.
3. Add the card using the new YAML type.
4. Use Home Assistant's native visual editor for customization.

Both cards follow the frontend language automatically (Dutch or English), inherit light/dark theme colors, support touch and keyboard inspection, and provide native Sections resizing. Card picker names retain the Eleven brand in both languages; chart titles and descriptions remain localized. Explicit user titles are unchanged.

## Runtime names

| Card | YAML type | Built module |
| --- | --- | --- |
| Energy prices | `custom:eleven-dynamic-energy-price-card` | `cards/dynamic-energy-price-card/dist/eleven-dynamic-energy-price-card.js` |
| History | `custom:eleven-history-graph-card` | `cards/history-graph-card/dist/eleven-history-graph-card.js` |

The Eleven builds register only these new custom-element types, not aliases for the old types.

## Migrating existing dashboards

This is a breaking type/resource rename. Installing a new module alone does not migrate saved cards.

1. Back up the dashboard configuration and current resource list.
2. Build and install the desired Eleven module alongside the old resource temporarily.
3. Change each intended instance from `custom:dynamic-energy-price-card` to `custom:eleven-dynamic-energy-price-card`, or from `custom:history-graph-card` to `custom:eleven-history-graph-card`.
4. Leave entities, titles, colors, sizing and every other configuration key unchanged.
5. Reload the browser and verify all migrated instances.
6. Remove the old resource only after no dashboard still uses its old type. Do not overwrite HACS-managed files manually.

The old and new types are distinct, so a temporary migration overlap is possible. Do not register a second copy of the same Eleven module. Duplicate-load protection is tested, but duplicate resources remain unnecessary.

## Build and test

Node 20+, npm and Python 3 are required. No npm dependencies need installing.

From this repository root:

```sh
npm run build
npm test
npm run check
```

The build produces two independent JavaScript modules. Source and regression tests live under each card directory; root tests cover branding and both modules loading together. Edit source, not generated bundles.

### Shared graph

Both cards use `shared/graph.js` for the SVG surface, series lines/fills, non-scaling strokes, round markers and the one-time 650 ms clipped entrance animation. Each independent build embeds that same source; there is no extra runtime resource to install. Reduced motion disables the reveal, and an early rerender resumes it rather than replaying it.

Card adapters still own data loading, path geometry, gradients, axes, annotations and interactions. Tariffs, favorable periods, price thresholds and consumption remain energy-only. History retains recorder-held steps and true unavailable gaps; its default line width is now 3.5 px, with the same solid/dashed/dotted rhythm and caps as energy. Explicit line widths, the sensor palette and fill-off default remain supported.

Repeatable isolated browser QA (synthetic data, not a live dashboard):

```sh
uv run --with playwright --with pillow python tests/browser-shared-graph.py
```

The script currently uses the installed Chromium headless shell at `/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell` and the immutable pre-refactor backup at `/opt/data/cache/scratch/eleven-shared-graph-baseline`. Adjust those paths if reproducing elsewhere. It serves repository bytes through Playwright routing, with no listening server or Home Assistant requests. Results and baseline/after screenshots are under `qa-evidence/shared-graph/`. The shared-graph changes are built locally only; they have not been published or deployed.

## Repository status

The collection includes card sources, tests, QA fixtures, documentation and separately built Eleven modules. The original standalone source projects are unchanged.

Local installation has been tested separately. Private dashboard configurations and deployment evidence are intentionally not included. This is not a HACS collection release.

There is no published collection release, shared `eleven-cards.js` entry point or root HACS manifest yet. The per-card energy manifest is not a collection installation route. Existing standalone HACS releases still use their original names and types; they do not provide these renamed modules.

Before a collection release, verify shared HACS packaging, publish a prerelease, and promote only after approval. The verified local installation does not imply GitHub publication or HACS collection availability.
