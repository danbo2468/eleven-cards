# Approved History settings redesign

## Product and scope
Eleven History Graph Card in the existing Home Assistant frontend. This implements the user's approved settings ownership analysis; not a new visual style. Desktop and 390/320px touch layouts, Dutch/English labels, existing native HA controls and themes.

## Ownership and workflows
Graph owns title, time span, Y bounds, graph mode and hover synchronization. Data processing owns shared aggregation. Sensors are selected once; each expandable sensor entry owns name, line and fill. One and two sensor workflows are identical; every sensor has independently editable width, style, interpolation, color mode and fill. No global appearance controls in the editor, no hidden inherited settings after save.

Line: explicit fixed color or value-based color stops; only applicable controls visible. Gradient interpolation independent of measurement interpolation. Concrete palette defaults for new sensors.
Fill: off by default; when enabled show opacity, fade and follow-line versus own-color. Follow-line includes the gradient. Own fill color never changes line. Conditional controls preserve dormant values when switching modes.

## Compatibility
Legacy YAML remains accepted. Resolve its effective appearance into explicit per-sensor settings without changing rendering; editing and saving migrates appearance keys, not dashboards. Preserve missing/empty legacy stop semantics during resolution, then remove hidden inheritance in canonical sensor settings. Keep raw recorder samples, unavailable gaps, aggregation, hover, flyby, stacking and shared energy renderer unchanged.

## Forms and accessibility
Reuse native HA form/selectors. Stable labeled graph/data/sensor/line/fill groups. Each sensor collapsed header identifies its name/entity and color. Keyboard accessible expand/remove controls; no duplicated entity picker. Dutch/English, inherited HA light/dark styles. No overflow at 320/390px.

## Approved explicit line-style linking
Within each sensor's Line group, a native dropdown named Line appearance offers Own appearance or another configured sensor by display name/entity. Linked sensors follow only width, dash style and interpolation, live; color, gradient and fill settings remain owned by each sensor. Hide owned geometry controls while linked; keep the source selection visible. Own appearance detaches with the currently effective geometry. Never offer self/cycle targets. YAML rejects missing sources, self-links and cycles. Reordering preserves references by entity ID. Removing or replacing a source detaches affected links with their effective geometry; replacing an entity also updates remaining references. A one-sensor card has no source picker. Native HA styling, Dutch/English and mobile remain unchanged.

Implementation plan: (1) failing resolver test then add explicit line_style_source resolution for the three geometry fields; (2) failing validation/lifecycle tests then validate graph and preserve links through save/reorder/detach/remove/replace; (3) failing schema/editor tests then implement conditional native dropdown and localized helpers; (4) regressions/build, actual native editor feedback/save and live Recorder rendering, desktop/mobile screenshots; (5) guarded local history-only installation and installed native QA. No publication, dashboard writes, energy/timeline changes or implicit global inheritance.

## Exclusions
No HACS publication, no energy/timeline changes, no dashboard changes. Optional appearance-copy shortcut deferred; it is not necessary for the ownership fix.

## Acceptance
Legacy appearance identical before/after normalization including global/per-sensor gradients and fixed fill. Independent two-line width/style/interpolation/fill. One-sensor flow no duplicate appearance fields. Native editor changes and save roundtrip; conditional fields; invalid values rejected specifically in tests. Node regression gates plus real-browser desktop/mobile and light/dark rendering and editor verification. Local install only after verification, preserve other resources and dashboards, exact served-byte readback.
