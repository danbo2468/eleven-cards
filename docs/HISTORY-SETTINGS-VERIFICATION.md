# History settings redesign — verified result

## Delivered
History module version 0.3.0-local. Sensor-owned line width/style/interpolation, explicit fixed/gradient line mode, independent fill enablement/opacity/fade and follow-line/own-color mode. Single expandable entry per sensor, graph and shared processing groups, conditional native controls and add/remove/reorder. Graph-level legend visibility. Legacy appearance is resolved into concrete rows when the editor saves; legacy YAML continues to render without dashboard migration.

## Execution evidence
`npm test` at collection root passed: collection Node suite 25/25, energy Node 51/51 plus Python 20/20, History Node 47/47. `npm run check` and `git diff --check` passed.

`/opt/data/cache/scratch/history-settings-browser.py --installed` passed with Home Assistant-served bytes and live Recorder data for both UPS sensors. Actual native width/style/interpolation and color-mode changes, individual stop-dialog Save, independent fixed fill and follow-line gradient, separate sensor gradients, add/remove/reorder, and one-sensor workflow passed. Twelve legacy configurations were compared against an immutable pre-edit bundle for identical paths/gradients/legend/axes after canonicalizing equivalent hex/RGB colors. Actual native light/dark theme checks at 1280/390/320px passed with no horizontal overflow and no relevant page errors.

`/opt/data/cache/scratch/history-settings-native-dialog.py --installed` passed in the actual hui-dialog-edit-card wrapper with one/two sensors, parent config feedback, frozen config roundtrip and native Save. The dialog save callback was replaced with a local capture: no dashboard save callback was called. Dutch mobile labels were checked. Fresh dashboard/resource reads before/after were identical.

## Installation verification
Guarded installer `/opt/data/cache/scratch/install_history_settings.py` installed only the standalone local History module, preserved its resource ID and verified exact served bytes:
`/local/eleven-cards/eleven-history-graph-card.js?v=27ad5be27818`
SHA-256: `27ad5be27818f5658efe55bf1899ada8d4f4df734949cb4011b6fa84c7694ab7`.

Dashboards unchanged. Energy and Timeline served bytes unchanged. HACS-managed files untouched; no duplicate resource was disabled. Temporary SSH key removed; original SSH add-on options and stopped state restored and read back.

Machine-readable evidence: `/opt/data/cache/scratch/history-settings-install/verified.json`, `/opt/data/cache/scratch/history-settings-work/qa/installed-verified.json`, `/opt/data/cache/scratch/history-settings-work/native/installed-verified.json`. Browser captures in the corresponding qa/native directories were visually inspected.

## Scope and remaining availability
No GitHub push or HACS release. Installed locally, not a HACS update. One-time appearance-copy shortcut intentionally deferred in the approved specification. Existing unrelated working-tree changes preserved.
