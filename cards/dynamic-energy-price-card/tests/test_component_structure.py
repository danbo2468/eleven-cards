import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
CARD = ROOT / "src" / "dynamic-energy-price-card.js"
GRAPH = ROOT.parents[1] / "shared" / "graph.js"


class CardSourceTests(unittest.TestCase):
    def test_native_sections_sizing_and_optional_title(self):
        card = CARD.read_text(encoding='utf-8')
        self.assertIn('getGridOptions()', card)
        self.assertIn('columns: 12', card)
        self.assertIn('min_columns: 9', card)
        self.assertIn('rows: hasCheapestTable ? 9 : 6', card)
        self.assertIn('min_rows: hasCheapestTable ? 6 : 4', card)
        self.assertIn('show_title: true', card)
        self.assertIn("name: 'show_title'", card)
        self.assertIn("showTitle ?", card)
        self.assertIn('class="header-cheapest"', card)
        self.assertIn('height: 100%', card)
        self.assertIn('flex: 1 1 300px', card)
        self.assertIn('overflow: auto', card)

    def test_hover_marker_stays_round_when_chart_resizes(self):
        card = CARD.read_text(encoding='utf-8')
        self.assertNotIn('<circle class="hover-dot"', card)
        self.assertIn('<span class="hover-dot"', card)
        self.assertIn("dot.style.left =", card)
        self.assertIn("dot.style.top =", card)
        graph = GRAPH.read_text(encoding='utf-8')
        self.assertIn('border-radius: 50%', graph)
        self.assertIn('width: 12px', graph)
        self.assertIn('height: 12px', graph)

    def test_mobile_hover_interaction_is_dismissible(self):
        card = CARD.read_text(encoding='utf-8')
        self.assertIn("line?.removeAttribute('hidden')", card)
        self.assertIn("dot.removeAttribute('hidden')", card)
        self.assertIn("window.addEventListener('pointerdown', this._onOutsidePointer)", card)
        self.assertIn("window.removeEventListener('pointerdown', this._onOutsidePointer)", card)

    def test_card_has_no_external_runtime_dependency(self):
        card = CARD.read_text(encoding="utf-8")
        self.assertNotIn("https://", card)
        self.assertNotIn("http://", card)
        self.assertIn("customElements.define", card)

    def test_chart_uses_gradient_now_line_and_html_labels(self):
        card = CARD.read_text(encoding="utf-8")
        self.assertIn('id="price-line-gradient"', card)
        self.assertIn('class="now-line"', card)
        self.assertIn('class="chart-label x-label"', card)
        self.assertIn('preserveAspectRatio="none"', GRAPH.read_text(encoding='utf-8'))
        self.assertNotIn('<text ', card)
        self.assertIn('cheap_price: 0.15', card)
        self.assertIn('normal_price: 0.25', card)
        self.assertIn('expensive_price: 0.40', card)
        self.assertIn('cheapest_hours: 0', card)
        self.assertIn('const legend = legendItems.length', card)
        self.assertNotIn('${yGrid}', card)
        self.assertNotIn('.grid-line {', card)
        self.assertIn('class="level-line cheap-level"', card)
        self.assertIn('class="level-line normal-level"', card)
        self.assertIn('class="level-line expensive-level"', card)
        self.assertNotIn('id="cheapest-hatch"', card)
        self.assertNotIn('<div class="summary">', card)
        self.assertNotIn('${escapeHtml(availability)}', card)
        self.assertIn('this._t("Goedkoopst")', card)
        self.assertIn('show_cheapest_table: false', card)
        self.assertIn('const favorableTable =', card)
        self.assertIn('<table class="cheapest-table favorable-table', card)
        self.assertIn("name: 'show_cheapest_table'", card)
        self.assertIn('show_hover_line: true', card)
        self.assertIn('show_average_line: false', card)
        self.assertIn("name: 'show_hover_line'", card)
        self.assertIn("name: 'show_average_line'", card)
        self.assertIn('class="average-line ', card)
        self.assertIn('const hoverLine =', card)

    def test_card_preserves_native_visual_editor(self):
        card = CARD.read_text(encoding="utf-8")
        self.assertIn('static getConfigForm(config)', card)
        self.assertIn('computeHelper:', card)
        self.assertIn("mode: 'slider'", card)
        self.assertNotIn('class DynamicEnergyPriceCardEditor', card)
        for field in ('title', 'cheap_price', 'normal_price', 'expensive_price', 'cheapest_hours', 'tomorrow_after'):
            self.assertIn(f"name: '{field}'", card)

    def test_import_and_export_series_are_independently_configurable(self):
        card = CARD.read_text(encoding="utf-8")
        for field in (
            'graph_mode', 'current_price_mode', 'export_entity', 'export_price_offset',
            'export_best_hours', 'show_export_table',
        ):
            self.assertIn(f"name: '{field}'", card)
        self.assertIn("type: 'expandable'", card)
        self.assertIn("name: 'general_settings'", card)
        self.assertIn("name: 'import_settings'", card)
        self.assertIn("name: 'export_settings'", card)
        self.assertIn('editorText("Algemeen")', card)
        self.assertIn('editorText("Afname")', card)
        self.assertIn('editorText("Teruglevering")', card)
        for field in (
            'import_line_style', 'import_line_width', 'import_line_color',
            'export_line_style', 'export_line_width', 'export_line_color',
        ):
            self.assertIn(f"name: '{field}'", card)
        self.assertIn("const lineColorSelector = { color_rgb: {} };", card)
        self.assertIn("selector: lineColorSelector", card)
        self.assertIn("import_line_style: 'solid'", card)
        self.assertIn("export_line_style: 'dashed'", card)
        self.assertIn("import_line_width: 3.5", card)
        self.assertIn("export_line_width: 3.5", card)
        self.assertIn("--font-size-meta: 10px;", card)
        self.assertIn("--font-size-label: 12px;", card)
        self.assertIn("--font-size-title: 18px;", card)
        self.assertIn("--font-weight-medium: 500;", card)
        self.assertIn("--font-weight-strong: 600;", card)
        self.assertNotIn("font-weight: 650", card)
        self.assertIn('export_price_offset: "Correctie op terugleverprijs"', card)
        self.assertNotIn("export_price_offset: 'Verschil t.o.v. afname'", card)
        self.assertIn("graph_mode: 'import'", card)
        self.assertIn("current_price_mode: 'import'", card)
        self.assertIn("show_price_levels: true", card)
        self.assertIn("name: 'show_price_levels'", card)
        self.assertIn('show_price_levels: "Prijsgrenzen tonen"', card)
        self.assertIn("const showPriceLevels = this._config.show_price_levels !== false;", card)
        self.assertIn("const levelLines = showPriceLevels", card)
        self.assertIn("const levelLabels = showPriceLevels", card)
        self.assertIn("id=\"export-line-gradient\"", card)
        self.assertIn("className: 'price-line export-line'", card)
        self.assertIn('graphLineStyle(style, width)', card)
        self.assertIn("dash: style === 'dashed' ? '8 7' : style === 'dotted' ? '1 7' : 'none'", GRAPH.read_text(encoding='utf-8'))
        self.assertIn("`url(#${type === 'export' ? 'export-line-gradient' : 'price-line-gradient'})`", card)
        self.assertIn('class="swatch series-swatch ${appearance.style}"', card)
        self.assertIn('--series-width:${appearance.width}px', card)
        self.assertIn('border-top: var(--series-width, 3px) solid var(--series-color);', card)
        self.assertIn('.series-swatch.dashed { border-top-style: dashed; }', card)
        self.assertIn('.series-swatch.dotted { border-top-style: dotted; }', card)
        self.assertNotIn('.export-line { stroke: url(#export-line-gradient);', card)
        self.assertIn('--export-best: #1976d2;', card)
        self.assertIn('--export-best-fill: color-mix(in srgb, var(--export-best) 18%, transparent);', card)
        self.assertIn('border-color: color-mix(in srgb, var(--export-best) 55%, transparent);', card)
        self.assertIn('selectHighestDuration', card)
        self.assertIn('offsetPriceData(exportState.attributes?.data, exportOffset)', card)
        self.assertNotIn('offsetPriceData(rawImportData, exportOffset)', card)

    def test_series_fills_are_independently_configurable(self):
        card = CARD.read_text(encoding="utf-8")
        for field in (
            'show_import_fill', 'import_fill_color',
            'import_fill_fade', 'show_export_fill', 'export_fill_color',
            'export_fill_fade',
        ):
            self.assertIn(f"name: '{field}'", card)
        self.assertIn("show_import_fill: true", card)
        self.assertIn("show_export_fill: false", card)
        self.assertIn("import_fill_fade: true", card)
        self.assertIn("export_fill_fade: true", card)
        self.assertIn('id="import-area-gradient"', card)
        self.assertIn('id="export-area-gradient"', card)
        self.assertIn("this._config.import_fill_fade !== false ? ' fade' : ''", card)
        self.assertIn("this._config.export_fill_fade !== false ? ' fade' : ''", card)
        self.assertIn('--import-fill-color:', card)
        self.assertIn('--export-fill-color:', card)

    def test_native_editor_displays_the_effective_runtime_defaults(self):
        card = CARD.read_text(encoding="utf-8")
        self.assertIn('const DEFAULT_CONFIG = Object.freeze({', card)
        self.assertIn('...DEFAULT_CONFIG,', card)
        fields = (
            'graph_mode', 'current_price_mode', 'show_title',
            'show_hover_line', 'show_average_line', 'show_price_levels',
            'tomorrow_after', 'cheap_price', 'normal_price', 'expensive_price',
            'cheapest_hours', 'import_selection_mode', 'import_minimum_duration',
            'show_cheapest_table', 'import_line_style', 'import_line_width',
            'show_import_fill', 'import_fill_fade', 'export_price_offset',
            'export_best_hours', 'export_selection_mode', 'export_minimum_duration',
            'show_export_table', 'export_line_style', 'export_line_width',
            'show_export_fill', 'export_fill_fade',
        )
        for field in fields:
            self.assertIn(f"name: '{field}', default: DEFAULT_CONFIG.{field}", card)

    def test_legend_items_toggle_their_series(self):
        card = CARD.read_text(encoding="utf-8")
        self.assertIn('class="legend-series"', card)
        self.assertIn('data-series="${type}"', card)
        self.assertIn("querySelectorAll('.legend-series')", card)
        self.assertIn("this._hiddenSeries.has(type)", card)
        self.assertIn("this._toggleSeries(type)", card)
        self.assertIn("aria-pressed=", card)

    def test_favorable_periods_share_one_semantic_table(self):
        card = CARD.read_text(encoding="utf-8")
        self.assertIn("this._periodTable(importPeriods, exportPeriods", card)
        self.assertIn('const typeLabel = type === \'import\' ? this._t("Afname") : this._t("Teruglevering");', card)
        self.assertIn('class="period-type ${type}"', card)
        self.assertIn('<h3>${this._t("Gunstige momenten")}', card)
        self.assertIn('type: this._t("Moment")', card)
        self.assertIn('<th class="period-${column}">${headings[column]}</th>', card)
        self.assertNotIn("this._periodTable('Goedkoopste afname'", card)
        self.assertNotIn("this._periodTable('Beste teruglevering'", card)

    def test_favorable_intervals_render_as_subtle_full_height_bands(self):
        card = CARD.read_text(encoding="utf-8")
        self.assertIn('const selectionBandRects =', card)
        self.assertIn("groupSelectedPeriods(importPoints, importSelected, intervalMinutes)", card)
        self.assertIn("groupSelectedPeriods(exportPoints, exportSelected, exportIntervalMinutes)", card)
        self.assertIn("'import-selection-band'", card)
        self.assertIn("'export-selection-band'", card)
        self.assertIn('height="${plotHeight}"', card)
        self.assertIn('class="selection-band ${className}"', card)
        self.assertNotIn('selection-rail', card)
        self.assertNotIn('class="cheapest-slot"', card)
        self.assertNotIn('class="export-best-slot"', card)

    def test_single_import_uses_one_compact_summary_row(self):
        card = CARD.read_text(encoding="utf-8")
        self.assertIn('const useCompactSummary =', card)
        self.assertIn('class="compact-summary"', card)
        self.assertIn('class="compact-current legend-series"', card)
        self.assertIn('this._compactCurrentMetric(this._t("Afname")', card)
        self.assertIn('${label} <span>${this._t("nu")}</span>', card)
        self.assertIn('class="compact-context"', card)
        self.assertIn('.compact-summary {', card)
        self.assertIn('grid-template-columns: minmax(0, 1fr) auto;', card)

    def test_status_only_appears_for_incomplete_price_data(self):
        card = CARD.read_text(encoding="utf-8")
        self.assertIn('const statusParts = [];', card)
        self.assertIn('countMissingIntervals(', card)
        self.assertIn("if (missingTotal) statusParts.push", card)
        self.assertIn("if (!sharedRange && showTomorrow && !tomorrowPoints.length)", card)
        self.assertIn('const dataStatus = statusParts.length', card)
        self.assertNotIn('relativeAgeLabel(', card)
        self.assertNotIn('Bron ${sourceAge}', card)

    def test_compact_redesign_preserves_the_table(self):
        card = CARD.read_text(encoding="utf-8")
        self.assertIn('<table class="cheapest-table favorable-table', card)
        self.assertNotIn('mobile-period-card', card)

    def test_tooltip_is_offset_away_from_the_selected_price_point(self):
        card = CARD.read_text(encoding="utf-8")
        self.assertIn('const tooltipWidth = tooltip.offsetWidth;', card)
        self.assertIn('const canPlaceRight = anchorX + gap + tooltipWidth <= chartWidth - edge;', card)
        self.assertIn("tooltip.dataset.horizontal = canPlaceRight ? 'right' : canPlaceLeft ? 'left' : 'center';", card)
        self.assertIn("tooltip.dataset.vertical = canPlaceBelow ? 'below' : 'above';", card)
        self.assertIn('.tooltip[data-horizontal="right"][data-vertical="below"]', card)
        self.assertIn('.tooltip[data-horizontal="left"][data-vertical="above"]', card)
        self.assertIn('.tooltip[data-horizontal="center"][data-vertical="above"]', card)
        self.assertIn('${SharedGraph.tooltipStyles()}', card)
        shared = (CARD.parents[3] / 'shared' / 'graph.js').read_text(encoding='utf-8')
        self.assertIn('.tooltip b{font-weight:600;min-width:0;', shared)
        self.assertNotIn("tooltip.style.top = '48%';", card)

    def test_native_editor_uses_flat_expandable_subgroups(self):
        card = CARD.read_text(encoding="utf-8")
        for group in (
            'import_favorable_settings', 'import_appearance_settings',
            'export_favorable_settings', 'export_appearance_settings',
        ):
            self.assertIn(f"name: '{group}'", card)
        self.assertGreaterEqual(card.count('flatten: true'), 7)

    def test_import_and_export_support_all_favorable_period_selection_modes(self):
        card = CARD.read_text(encoding="utf-8")
        for field in (
            'import_selection_mode', 'import_minimum_duration',
            'export_selection_mode', 'export_minimum_duration',
        ):
            self.assertIn(f"name: '{field}'", card)
        self.assertIn('{ value: \'individual\', label: editorText("Losse kwartieren") }', card)
        self.assertIn('{ value: \'contiguous\', label: editorText("Eén aaneengesloten blok") }', card)
        self.assertIn('{ value: \'minimum_blocks\', label: editorText("Blokken met minimale duur") }', card)
        self.assertIn("import_selection_mode: 'individual'", card)
        self.assertIn("export_selection_mode: 'individual'", card)
        self.assertIn("import_minimum_duration: 30", card)
        self.assertIn("export_minimum_duration: 30", card)
        self.assertIn("mode: this._config.import_selection_mode", card)
        self.assertIn("minimumBlockMinutes: this._config.import_minimum_duration", card)
        self.assertIn("mode: this._config.export_selection_mode", card)
        self.assertIn("minimumBlockMinutes: this._config.export_minimum_duration", card)


if __name__ == "__main__":
    unittest.main()
