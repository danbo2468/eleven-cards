# Bar Chart Delta verification

Implemented optional `aggregation_method: delta` in Eleven Bar Chart's existing Data processing controls. Choose a non-raw aggregation period. Defaults and History editor options remain unchanged.

Delta is the recorder-held end value minus the recorder-held start value for each interval, including exact boundary readings. Negative changes remain negative, unchanged values produce zero, and missing boundaries/unavailable gaps produce no bar. Partial first/last bins are clipped to the requested range. No reset correction, interpolation or previous-bar comparison is performed.

Verification performed:

- RED: pure delta test produced the old average (102 instead of 10); native/config test rejected the unsupported method. Both passed after implementation.
- `npm test`: complete root suite and both component suites passed.
- `npm run check` and `git diff --check`: passed.
- `tests/browser-bar-chart.py`: existing average, tooltip, legend, keyboard, zoom and stacked-gradient behavior passed at 1280/390/320 widths in light/dark.
- `tests/browser-bar-delta.py` and `--installed`: actual native Dutch Delta menu selection, frozen editor feedback, intercepted Save/reopen, actual Recorder history, hourly boundary oracle, quarter-hour rendering and six viewport/theme cases passed. Save is intercepted; no dashboard is saved.
- Installed live-history oracle checked 50 interval/sensor values, including 30 nonzero changes and 15 negative changes. Missing/unavailable cases are covered separately by synthetic unit tests.
- Desktop/light and narrow/mobile/dark screenshots inspected under `qa-evidence/bar-chart/delta/`.

Deployment changed only `/local/eleven-cards/eleven-bar-chart.js` and that existing resource's cache-busting URL, retaining resource ID `c11952df1a0648c1be09491dae0c05c7`. Served SHA-256: `ce0767740cab3cce0626a0baaa4a4dc4049541931ee61f0482efb5144190f4a6`.

All dashboards, sibling resource registrations and sibling served bundles were verified unchanged. Temporary SSH key removed; original SSH options and stopped state restored. No HACS publication or History-module deployment.

Task-specific backup, guarded installer, deployment readback and cleanup reports: `/opt/data/cache/scratch/bar-delta/`. Recapture live baselines before any future upgrade; do not reuse this snapshot as current state.
