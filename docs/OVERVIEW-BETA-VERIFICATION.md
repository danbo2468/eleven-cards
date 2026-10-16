# Eleven Overview (beta) — verification

## Delivered
Source, tests, standalone self-contained module, collection build inclusion, four-card registry/picker/duplicate-load/overlap tests, native visual editor and docs. Written design/plan predates implementation: OVERVIEW-BETA-PLAN.md. No commit, push, publication or HACS release. Existing dirty History/Timeline source changes preserved; the combined local bundle was rebuilt for tests but not installed.

## Execution evidence
Final `npm test`: collection/root+Overview 67/67; Energy JavaScript 51/51 plus Python 20/20; History 64/64. `npm run check` and `git diff --check` passed. One prior concurrent collection test run failed with Unexpected end of input; the cause was not established. Isolated tests and the full rerun passed. No unrelated sibling build-source repair was deployed.

Overview focused unit tests: config copy/validation and injection safety; strict numeric states including zero/negative/tiny; batched full-unit Recorder URL; held boundary delta, unit mismatch and unavailable gaps; precise gap endpoints and constant charts; request timeout/retry, ignored detached response and no API request on ordinary hass updates; beta stub, editor ownership, grid contract and percentage-point labels.

`tests/browser-overview.py`: synthetic 1280/390/320px, light/dark, no horizontal overflow; keyboard more-info, unavailable state, history failure/retry; eight sensors, long labels/units/large negative values, hostile text escaping; graph and delta hidden independently. No page errors. Evidence: qa-evidence/overview/synthetic-results.json and screenshots.

`/opt/data/cache/scratch/overview-native-qa.py --installed`: actual HA frontend and served module, real Recorder history, native edit-card wrapper, independently edited sensor name, reorder, captured Save and reopen without dashboard persistence; single-sensor shorthand/default editor and two-sensor expanded settings; 1280/390/320 light/dark editor and live preview. No relevant page errors. Actual temperature and Quooker history yielded recorded points and valid start-boundary values; current values came from live states. Visual screenshots inspected. Evidence: qa-evidence/overview/installed-native.json and installed-preview.png. These are temporary native previews, not cards saved to a dashboard.

## Installation
Only new `/local/eleven-cards/eleven-overview-card.js?v=7015bfb75389` module resource, ID `77faf4aa895249de901a86b15377fe20`.
SHA-256: `7015bfb753896aa6e868ddb183bef4dbf3c3985945044aebe1162008e8b56634`.
Exact served bytes matched local build. Existing resources and Eleven bundle bytes unchanged; all dashboard configs unchanged. No automations or physical devices controlled. Temporary SSH key removed and original SSH add-on options restored; add-on returned to stopped.
Installation read-back: /opt/data/cache/scratch/overview-install/verified.json.
Cleanup read-back: /opt/data/cache/scratch/overview-install/cleanup-verified.json.

## Beta limitations
No graph threshold/color-mode machinery, previous-period average, shared hover or historical navigation. Sparklines use independent vertical ranges; delta is absolute since rolling period start, with percent sensors labeled pp. Recorder availability/retention determines graph coverage. The user adds the card through Add card → Eleven Overview (beta); existing dashboard layout was intentionally not changed. High-frequency long histories can be large. Product layout and added contextual metrics remain open for feedback.
