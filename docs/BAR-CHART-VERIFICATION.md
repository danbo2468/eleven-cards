# Bar Chart beta verification

The new `custom:eleven-bar-chart` is a separate vertical-bar card based on the current History implementation. Default processing is hourly time-weighted average. Grouped bars retain `graph_mode: lines` for schema compatibility; stacked mode uses signed, unit-separated History stacks. No cumulative-energy delta or sum calculation is implied.

Implementation lives in `cards/bar-chart/`. History now exposes `_getGraphAxes` plus editor normalization/form-owner extension hooks; its defaults and rendering contracts are covered by a companion-adapter regression test. Bar's independently scoped bundle embeds History source without its registration tail and registers only Bar Chart. No History bundle was installed during this task.

Verification actually executed:

`npm test` completed: collection 80, Energy Node 64, Energy Python 20, History 73, all passing (237 tests total). `npm run check` and `git diff --check` passed. Full output is `/opt/data/cache/scratch/bar-chart-npm-test.log`.

`tests/browser-bar-chart.py` passed in Chromium 153.0.8010.12 with explicitly synthetic power data. It checks filled bar geometry at 1280/390/320px in light/dark, bounded tooltips, legend hide-all/recovery, keyboard/Escape, viewport zoom preserving raw data, stacked gradient rendering and blank-configuration guidance. Six screenshot records are in `qa-evidence/bar-chart/synthetic-results.json`. Desktop/light and mobile/dark captures were visually inspected.

`/opt/data/cache/scratch/bar-chart-native-qa.py` passed against the actual HA frontend with a locally injected module, and again with `--installed` without local module injection. Both use actual read-only Recorder history from `sensor.anna_temperature` and `sensor.quooker_power`. Installed QA verifies the served bundle equals the built bytes, two independent unit axes, native frozen-wrapper editing, name/title/reorder, intercepted nonpersisting Save/reopen, adding an initially blank sensor through the real entity picker, and native editor plus temporary real-data previews at 1280/390/320px in native light/dark. The installed report is `qa-evidence/bar-chart/installed-native-results.json`. Preview is not a saved dashboard card; snapshots before/after prove dashboard configs and resources unchanged by QA.

The guarded one-time installer `/opt/data/cache/scratch/bar-chart-install.py` added only resource `c11952df1a0648c1be09491dae0c05c7`, module `/local/eleven-cards/eleven-bar-chart.js?v=ead2e637a2a8`. SHA-256 is `ead2e637a2a8ea97b660b9f04dca4255244150660ba1b2dd3b2d7e9b0a76c9c8`. It verified served bytes, unchanged dashboard configs, unchanged existing resources and Eleven bundle bytes. Temporary SSH key removal, restored add-on options and stopped SSH state were read back successfully. Reports and backups are under `/opt/data/cache/scratch/bar-chart-install/`.

No GitHub push, tag or HACS publication was performed. Existing dirty Energy/History/Timeline/Overview work was retained; root builds include that pre-existing local work but the combined bundle was not deployed. Only the new standalone Bar Chart resource was installed. Refresh Home Assistant and choose Eleven Bar Chart in Add Card.
