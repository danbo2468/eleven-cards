# Implementation plan — approved settings ownership

1. Snapshot current history source/bundle and dirty tree. Inspect native form and actual appearance resolution, retain strict legacy effective output as migration baseline.
2. TDD vertical slice: canonical per-series appearance resolver plus migration/editor serialization; validate each property and cover own stops/fixed color/empty stops/global fallback.
3. TDD vertical slice: renderer uses independent series width/style/interpolation and fill settings, per-series fade/fill, including stacked paths and gaps; do not edit shared energy code.
4. TDD vertical slice: replace duplicate global appearance editor with graph + shared data + expandable sensor entries, line/fill conditional native forms. Existing custom editor adapter may be extended; reuse HA controls. Add/remove/reorder sensors and dormant-mode values roundtrip.
5. Update localization and README, history version/build metadata. Build history and combined artifact without publishing. Full collection tests/check, separate preexisting failures if any.
6. Browser QA genuine rendered source and installed native frontend: one/two sensors, independently change line and fill, conditional fields, legacy migration, 1280/390/320px light/dark. Inspect captures and console. Do not save dashboards.
7. Discover fresh resources; guarded local install preserves HACS-managed files and every dashboard/resource not explicitly in scope. Verify served exact bytes and resources; re-run installed editor QA.

Files: history src/history-utils.js, src/history-graph-card.js, src/localization.js, package.json, src/library.js and scripts/build.mjs if versioned; history tests/README/dist plus combined dist if built. Evidence under scratch and QA evidence. No production changes outside history. Existing unrelated dirty changes preserved. User authorized implementation of the approved design; no further interview required.
