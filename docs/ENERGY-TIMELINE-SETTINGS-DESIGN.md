# Energy and Timeline settings redesign — proposed

Status: ownership layout and implementation plan approved by the user. Implement and verify using temporary native Home Assistant editors; local resource upgrade follows verified existing deployment policy. No dashboard changes or publication. Reference: approved History settings design and native editor.

## Review
Energy General mixes graph settings, table columns, price thresholds/palette and one global interpolation. Import/export already own line/fill but cannot independently select interpolation. Timeline selects entities separately from optional name overrides and entity-specific status rules; this repeats entity selection and hides ownership. Both need structural ownership rather than CSS polish.

## Proposed ownership
Energy: Graph owns title, visibility modes, time coverage, guides and hover synchronization. Price classification owns shared thresholds and palette, explicitly shared because tariff favorable semantics are reversed. Favorable-period table owns shared columns. Each tariff (Import/Export) owns one entity selection, correction where applicable, favorable-period calculation/display, Line and Fill. Grid-import energy remains a separate series with its entity and Line/Fill; only relevant controls appear when enabled. Series-specific interpolation replaces implicit global inheritance in the editor, preserving existing effective interpolation. Fixed/price-based color and follow-line/own-color fill modes must resolve current effective paint before migration; no graph visual redesign. Dormant fields survive mode roundtrips.
Timeline: Timeline owns title, time span, axis and legend. Shared status rules are explicitly identified as common rules, not disguised per-entity inheritance. Each selected entity has one expandable entry owning entity/name and entity-specific state color/label overrides. Keep existing global bar geometry in a clearly named shared Bar layout section; per-row geometry is out of scope. Specific status rules retain precedence over common rules, and configured fallback colors preserve current semantics.

## Native components and presentation
Reuse History editor's native ha-form pattern, inline identity and expandable object entries; native object dialogs only for individual color/status rules. No duplicate entity picker, no custom control library or new palette. HA theme tokens/fonts/spacing remain authoritative. Dutch and English; keyboard/touch; desktop, 390px and 320px; real light/dark themes. Fields have one visible owner and conditional mode controls preserve dormant values. Empty/error/loading graph behavior remains unchanged.

## Compatibility and exclusions
Existing YAML and effective appearance remain accepted. Opening an editor does not write/migrate configuration. Editor save emits explicit settings only for the edited card; preserve source identity/order and unknown unrelated config. No changes to History, shared renderer behavior, source calculations, dashboards, publication, HACS-managed files or unrelated worktree changes. Installation route must be discovered and authorized through existing policy; compare live bundles to local baseline before any replacement.

## Acceptance
One and two series workflows; independent tariff styling and Timeline entity rules/names; no redundant entity selection; conditional fields; legacy normalization preserves appearance; actual native edit-card wrapper feedback with frozen config and captured save; no saved-dashboard changes in QA; rendered graph unchanged except explicitly edited settings. Full tests/build/check, desktop/mobile screenshots and overflow checks, Dutch/English light/dark, served-byte verification if installed.

## Implementation plan (after approval)
1. Read effective rendering and installed resources; preserve immutable baseline artifacts and existing dirty tree.
2. Energy tracer bullet: failing ownership/schema test, graph/classification/table grouping, focused green test. Then failing per-series mode/legacy tests, minimal resolver/editor implementation and graph parity checks.
3. Timeline tracer bullet: failing single-entry ownership test, native entity-row editor/config adapter, green tests. Then specific/common status-rule editing and legacy roundtrip tests/implementation.
4. Update card README descriptions, build all artifacts, full npm test/npm run check and diff checks.
5. Browser QA using actual HA controls/edit dialog without dashboard saves: frozen feedback, conditional mode roundtrips, names/rules, add/remove/reorder, independent line/fill and exact legacy render parity. Inspect screenshots and machine-readable results.
6. Discover deployment afresh, preserve dashboards/resources/SSH state, install only verified Energy/Timeline artifacts through the actual supported route; verify exact served bytes and unchanged unrelated external state. Report actual outcome, not availability assumptions.

Expected files: energy source/localization/tests/README/dist; Timeline source/editor utilities/tests/README/dist; combined generated artifact only if needed by active delivery; design/verification evidence. No commit/push/release without explicit scope.
