# Energy and Timeline settings redesign verification

Status: implemented, locally installed and verified. No publication or dashboard edits. The approved specification and pre-implementation plan are in ENERGY-TIMELINE-SETTINGS-DESIGN.md.

## Scope

Energy uses Graph, Price thresholds and colors, Import, Export, Grid-import energy and Table columns. Sources are selected once. Each series owns its interpolation; tariff line color modes and independent fill modes/opacity/fading are explicit. Conditional controls retain dormant values.

Timeline uses Timeline, one expandable entry per entity, Common state rules and Bar appearance. Identity, name and own state rules belong to each entity. Native individual state dialogs have no duplicate entity picker. Reordering retains ownership. Legacy flat YAML, orphan rules/name records and unrelated fields are preserved.

## Executed checks

- `npm test`: 157 tests passed (32 collection, 51 Energy Node, 20 Energy Python and 54 History regressions).
- `npm run check` and `git diff --check`: passed.
- Native Home Assistant `hui-dialog-edit-card` feedback, frozen configurations, real controls, intercepted Save and native state-rule dialogs: passed before and after installation.
- Installed editor views: 24 combinations across both cards, Dutch/English, 1280/390/320 px and native light/dark themes. No card/editor overflow or relevant page errors. Six additional expanded-field captures were made; representative expanded mobile views and overview desktop/mobile views were visually inspected.
- Immutable old/new Energy bundle comparisons: 48 exact pixel and SVG-property comparisons passed across four legacy configurations, desktop/mobile and light/dark, both direct legacy YAML and editor normalization.
- Timeline direct legacy and normalized rendering: identical HTML using authentic Recorder responses.
- Graph comparisons use real tariff and Recorder data, a frozen browser clock and shared cached API responses. Native editors run inside real HA, using temporary test configurations and intercepted Save callbacks. No dashboard is saved.

Evidence lives under `/opt/data/cache/scratch/energy-timeline-settings/`: `tests.log`, `qa/verified.json`, `installed-qa/verified.json`, `parity/verified.json`, screenshots and `install/verified.json`. Browser scripts are `native-qa.py`, `installed-native-qa.py` and `parity-qa.py` in that directory.

## Installation readback

Only these existing local resource IDs changed their hash-versioned URLs:

- Energy `233c26f73fdc4c30a3713005e3e5e0c9`, served SHA-256 `cfb30e3005d35e6da850c086875d544830ca28efcc63080bc34323326b383874`.
- Timeline `85b40d95ef414da5a2e8ef6c33a68014`, served SHA-256 `f5ce29d4c253943c4b7953dab2b8c75555bdf6a370a092d9ddb41923440f877e`.

Served bytes match local artifacts exactly. All dashboard configurations and unrelated resources remain unchanged. SSH options/state were restored, the add-on returned to stopped, and the temporary private/public key was removed. The installer backed up original bundles and resource/dashboard state and includes rollback.

History's standalone bundle remains SHA-256 `891bfd8a4f883e85db71793bc2c75c2c252d220401ec277134c375b3f7d30d90`; shared graph source remains `c8c1e811711d62f12a2f59ede5ae402b5a22657ded5a5fbb7201e939ae39d429`. Their code was not changed. The generated collection bundle is rebuilt for consistency but was not installed or published. Existing unrelated dirty worktree changes remain intact. No commit, push, release, HACS-managed file write, device control or automation modification occurred.

The native mobile dialog's long card title truncates at narrow widths; this is Home Assistant's existing wrapper behavior. Settings themselves fit and remain reachable by scrolling. Frontend preferences are changed only in isolated browser memory, not persisted.
