# Timeline editor design and implementation plan

Scope: Eleven Timeline Card only. User requests autonomous analysis and logical configuration redesign. Keep native Home Assistant visual editor, Eleven conventions, existing YAML keys, entity ordering, and status-color precedence. No changes to other cards, dashboard contents, HACS registration or publication.

Review: the current form mixes basic selection, advanced geometry, visibility toggles and mapping lists in a single flat schema. Units and scope are unclear. Global and per-entity colors are not explained; status examples are absent; custom names require redundant entity selection.

Design: basic title, entities and period first. Then collapsible native flattened groups: Statuskleuren (status mappings first, fallback second), Weergave (names, legend, axis and labels), Balkopmaak (height, rounding, row spacing with px units), Namen aanpassen (optional overrides, explicitly not another entity-selection list). Keep existing mapping formats and explain exact raw states on/off/home/not_home, entity-specific overrides, and fallback precedence. Native controls remain keyboard, theme and mobile compatible; no custom form framework.

Acceptance: nested schema exposes every existing setting exactly once; all groups flattened so YAML stays compatible; clear labels and helper text; numbers display units; optional names and per-entity mapping scopes explained; card rendering unchanged; old configurations survive an editor roundtrip.

Plan before production edits: (1) write a failing grouped-editor test, run it; (2) restructure native schema and helpers; (3) update existing assertions to walk grouped schemas; (4) full build/tests/check; (5) actual Home Assistant native-form browser verification at desktop/mobile incl interaction and configuration roundtrip; (6) deploy only existing standalone Timeline resource, verify served bytes and unchanged other resources/dashboard configuration; preserve temporary SSH cleanup. No Git commit/push/release.
