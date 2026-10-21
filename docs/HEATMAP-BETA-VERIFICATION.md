# Heatmap beta verification

Date: 2026-10-18. Scope: one-sensor analytical card using the existing Eleven theme, compact shared header and period navigation. Local beta only; no deployment, release or device commands.

## Automated checks

- Forty-five focused tests cover validated configuration, native RGB color arrays with legacy hex compatibility, numeric color limits, held-state time-weighted means, missing/unit-change gaps, zero/negative readings, hourly statistics requests and metadata, counter `change`, clipped summaries without prorating, and statistics failures versus unsupported consumption sensors. Popup tests cover escaped content, numeric cell labels, viewport bounds, repeated DST offsets, missing/incomplete states, mutual suppression, internal scrolling, dismissal and listener cleanup. Information summaries cover only displayed numeric cells and add a total only for consumption. Editor tests cover native flat/grouped form contracts, localized labels/help, mode switching, gradient controls, retained defaults, incomplete values and validation recovery. Calendar grouping tests cover hour/day/week/month options, ISO week-years and week 53, Monday rows, leap February, DST coverage, duration weighting and consumption totals across grouping levels.
- Timezone cases cover Amsterdam's 23-hour and 25-hour dates, repeated-hour weighting and summation, half-hour DST in Lord Howe and minute offsets in Kathmandu/Kolkata.
- Card lifecycle cases cover timeout/retry, stale-data retention, ordinary hass updates without refetching, invalidation on sensor/unit changes, late responses and detached polling cleanup.
- Collection tests include standalone load order, duplicate-load guards, the six-card combined module and documentation links.
- Current JavaScript regressions: 238 root/card tests plus 173 sibling Energy/History tests, 411 passing in total, including 45 Heatmap tests. Bundle syntax checks and whitespace checks pass. The existing Python Energy tests were not repeated for these JavaScript changes.
- The combined JavaScript run uses `node --test --test-concurrency=1` to avoid Windows file-lock races between suites rebuilding the same sibling artifacts. The previous parallel audit encountered two build rename errors; the sequential run passed.

## Rendered checks

Used the local synthetic QA fixture with Air browser keyboard actions and textual DOM/computed-layout inspection. No screenshots or recordings.

- Statistics averages and consumption load; raw history preserves gaps and marks partial coverage. Empty results show a recovery suggestion.
- A failed refresh preserves the previous matrix and offers retry. Recovery loads fresh data.
- Shared period menu opens as a native popover. Keyboard selection of This week produces seven date rows in the HA timezone. Native menu placement stays within the viewport.
- Grid uses static table cells with no tab stops or selected state. Clicking/tapping and arrow keys do not open or pin values. Mouse hover still shows numeric readings.
- Editor fixture changes emit RGB configuration arrays. Both color fields use the shared `color_rgb` selector contract; selecting colors updates the gradient and matrix. Existing hex configurations normalize to the same colors without mutation.
- At 320 px card width, scroll width remains 320 px. The matrix scrolls internally (288 px viewport / 708 px content); cells remain at least 24 × 24 px. Date labels are sticky.
- Theme variables resolve to light and dark surfaces/text. No screenshot-based visual assessment was performed.
- Refinement 0.1.1 reuses the shared chart information popup, popup lifecycle and tooltip styles. The info button sits beside History; source, units and summaries live in that popup. Subtitle/instructions/permanent details and explanatory legend labels are removed.
- Refinement 0.1.2 moves the color scale above the matrix. Computed geometry confirms this at desktop and 320 px card width; RGB colors produce a valid gradient. Cell keyboard/click actions and selected-state styling are removed; header controls retain their existing interaction.
- Fourteen browser popup/static-cell checks pass, including hover, pointer leave, no cell actions/tab stops, Escape, information open/close, header popup mutual exclusion and information preserved through refresh. Five editor color checks pass. The 320 px dark-theme card stays 320 px wide with internal matrix scrolling. Checks use DOM/layout state, not screenshots.

## Follow-up audit, version 0.1.3

- Corrected statistics unit validation to use Recorder's returned display unit. Stored Wh / displayed kWh and stored Celsius / displayed Fahrenheit now keep their valid statistics instead of rejecting them or falling back to history. Confirmed against the [Recorder metadata and conversion implementation](https://github.com/home-assistant/core/blob/dev/homeassistant/components/recorder/statistics.py). Explicit modern mean types take precedence over legacy `has_mean`.
- Aligned statistics requests to the containing UTC hour: Recorder filters by interval start, so an unaligned rolling request omitted its first overlapping summary. Its complete value is now retained and marked clipped, as documented.
- Recorder's valid empty `{}` result now means no rows for a supported counter. Malformed responses still produce a load error; unsupported counter metadata still produces the counter requirement message.
- A single fixed color bound now clamps readings outside a collapsed range to the correct endpoint color. Sparse RGB arrays are rejected.
- Masonry size estimates now respect the 800 px matrix height limit for annual ranges. The scroll container includes its padding within that limit.
- Added a timezone-change-during-load/reconnect regression. Late results in the old timezone are discarded and polling resumes on reconnect.
- Seventeen new browser data checks pass, including converted counter units, empty counter data, history gaps, stale data/recovery, week/previous/Now navigation, a full year's matrix and timezone changes. Together with the 14 popup and 5 editor checks, 36 browser checks pass.

## Configurator alignment, version 0.2.0

- Replaced the flat form with the same native `ha-form` expandable/flattened groups and field contracts used by History, Bar Chart and Timeline. Kept one sensor and added title/legend/axis-label visibility, native RGB color pickers and meaningful Dutch/English field help.
- Added sensor-value color stops with the same `gradient_stops` object selector, `smooth`/`steps` modes, interpolation and thresholds as the sibling chart editors. The legend reflects actual stop values and transitions; legacy endpoint colors and optional numeric bounds remain the default scale mode.
- Added minimum cell width, cell height, gap, radius and maximum scroll height. Layout, tooltip visibility checks and dashboard height estimation use those settings. Numeric dimensions are bounded before rendering CSS.
- Native number selectors can clear their inputs to `undefined` without immediate default replacement. Invalid drafts stay editable; valid configuration still passes full runtime validation. Empty card previews offer the sensor picker without sending Recorder requests.
- Extended the synthetic form fixture with expandable groups and editable object/color-stop lists. Added an editor scenario covering group/focus retention, toggles, layout, color modes, object rows, validation recovery and localization. The QA page and both fixture scripts pass syntax/HTTP checks.
- Browser inspection for this refinement is pending: the Air tools are attached to a different app on port 4173 and reject navigation to the Heatmap fixture on port 8765. The earlier 36 browser checks above apply to version 0.1.3, not the new grouped editor. A request to switch the Air preview has been sent; no screenshots were taken.

## Calendar grouping, version 0.3.0

- Added the native **Data processing → Aggregation period** selector with the same `aggregation_period` YAML field and Hour / Day / Week (Monday) / Month labels as History and Bar Chart. Hour remains the default for existing configurations. Minute/quarter-hour grouping was excluded following the user's scope selection.
- Matrices now show hours by date, weekdays by Monday-start week, ISO weeks by ISO year, or months by calendar year. Column labels/counts, row labels, accessible cell descriptions, layout and dashboard height estimates follow the selected grouping. Cells retain their static hover-only behavior.
- Larger periods aggregate existing hourly Recorder summaries: means use their real durations; consumption sums original counter changes without prorating or subtracting again. Raw-history fallback computes duration-weighted means. Empty/outside cells stay empty, and partial calendar periods/gaps retain incomplete markers.
- Added nine focused tests, including a late-response race when changing aggregation, calendar coverage across timezone transitions, leap days, week-year boundaries, gap/zero/negative consumption, source weighting, localized columns and preserved flat editor configuration. The complete 411-test JavaScript run passes.
- Rebuilt the standalone Heatmap and collection bundles. The synthetic QA page includes manual grouping selection and a 21-check grouping scenario; inline/fixture/bundle syntax and HTTP serving pass. Browser execution of this new scenario remains pending because Air is still attached to the other application on port 4173. No new browser checks or screenshots are claimed.

## Remaining verification limits

Data and forms in this fixture are synthetic. A live Home Assistant installation, its native ha-form component and actual recorder permissions/retention have not been exercised. Hover synchronization with other Eleven cards and zoom are outside this first beta. Hourly statistics are attributed by their actual interval start; minute-offset timezones retain source intervals rather than estimating sub-hour consumption.
