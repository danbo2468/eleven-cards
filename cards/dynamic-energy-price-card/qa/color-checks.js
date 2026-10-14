// Run in /qa/ after defining qaSet(config) and qaTheme(light).
// This probes real shadow DOM/computed styles, not rendered-source strings.
window.qaColorCheck = (custom, light) => {
  const c = document.querySelector('#card');
  const palette = custom ? {
    cheap_color: [38, 166, 154], normal_color: [240, 180, 60],
    expensive_color: [220, 75, 100], zero_color: [0, 172, 193],
    negative_color: [92, 107, 192], import_favorable_color: [142, 68, 173],
    export_favorable_color: [0, 137, 123],
  } : {};
  const rgb = value => `rgb(${value.join(', ')})`;
  const assert = (ok, label) => { if (!ok) throw new Error(label); };
  qaTheme(light);
  qaSet({ ...palette, cheapest_hours: 24, export_best_hours: 24 });
  const r = c.shadowRoot;
  const expectedImport = custom ? rgb(palette.import_favorable_color) : light ? 'rgb(25, 169, 116)' : 'rgb(52, 201, 149)';
  const expectedExport = custom ? rgb(palette.export_favorable_color) : 'rgb(25, 118, 210)';
  for (const [type, color] of [['import', expectedImport], ['export', expectedExport]]) {
    assert(getComputedStyle(r.querySelector(`.${type}-selection-band`)).fill === color, `${type} band`);
    assert(getComputedStyle(r.querySelector(`.period-type.${type}`)).color === color, `${type} table`);
    assert(getComputedStyle(r.querySelector(`.current-metric.${type} .current-window`)).color === color, `${type} badge`);
    const swatch = r.querySelector(type === 'import' ? '.swatch.selection' : '.swatch.export-selection');
    assert(getComputedStyle(swatch).backgroundColor.includes('color(srgb'), `${type} legend`);
  }
  if (custom) {
    const stops = [...r.querySelectorAll('#price-line-gradient stop')].map(e => getComputedStyle(e).stopColor);
    assert(stops.includes(rgb(palette.cheap_color)), 'cheap gradient');
    assert(stops.includes(rgb(palette.normal_color)), 'normal gradient');
    assert(stops.includes(rgb(palette.expensive_color)), 'expensive gradient');
  }
  assert(getComputedStyle(r.querySelector('.export-line')).strokeDasharray === '8px, 7px', 'export dashes');
  assert(getComputedStyle(r.querySelector('.export-line')).strokeLinecap === 'butt', 'export caps');
  assert(document.documentElement.scrollWidth <= innerWidth, 'page overflow');
  assert(r.querySelector('.card-content').scrollWidth <= c.clientWidth, 'card overflow');
  const timeline = c._chart.timeline;
  const indices = [...new Set([0, Math.floor(timeline.length / 4), Math.floor(timeline.length / 2), Math.floor(timeline.length * 3 / 4), timeline.length - 1,
    timeline.reduce((a, p, i) => p.importPrice > timeline[a].importPrice ? i : a, 0),
    timeline.reduce((a, p, i) => p.importPrice < timeline[a].importPrice ? i : a, 0)])];
  const tooltipOverlaps = [];
  for (const index of indices) {
    c._showPoint(index);
    const chart = r.querySelector('.chart').getBoundingClientRect();
    const tip = r.querySelector('.tooltip').getBoundingClientRect();
    assert(tip.left >= chart.left - 1 && tip.right <= chart.right + 1 && tip.top >= chart.top - 1 && tip.bottom <= chart.bottom + 1, `tooltip bounds ${index}`);
    for (const marker of r.querySelectorAll('.hover-dot:not([hidden])')) {
      const dot = marker.getBoundingClientRect();
      assert(Math.abs(dot.width - dot.height) < 0.1, 'round marker');
      // Existing beta.2 centered dual-tooltip placement can overlap one marker.
      // Record it rather than disguising the independently verified baseline issue.
      if (tip.left < dot.right && tip.right > dot.left && tip.top < dot.bottom && tip.bottom > dot.top) tooltipOverlaps.push(index);
    }
  }
  // Exercise the real keyboard and pointer listeners too.
  const chart = r.querySelector('.chart');
  chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  assert(c._activeIndex === 0, 'keyboard Home');
  chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert(c._activeIndex === 1, 'keyboard Right');
  chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert(r.querySelector('.tooltip').hidden, 'keyboard dismiss');
  const rect = chart.getBoundingClientRect();
  chart.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true }));
  assert(!r.querySelector('.tooltip').hidden, 'touch tooltip');
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  assert(r.querySelector('.tooltip').hidden, 'outside dismiss');
  const button = r.querySelector('.legend-series[data-series="export"]');
  button.click();
  assert(!c.shadowRoot.querySelector('.export-line'), 'legend hides export');
  c.shadowRoot.querySelector('.legend-series[data-series="export"]').click();
  assert(!!c.shadowRoot.querySelector('.export-line'), 'legend restores export');
  qaSet({ ...palette, show_hover_line: false, show_price_levels: false });
  c._showPoint(0);
  assert(!c.shadowRoot.querySelector('.hover-line,.level-line,.level-label'), 'optional guides disabled');
  assert(!c.shadowRoot.querySelector('.tooltip').hidden, 'tooltip without guide');
  qaSet({ ...palette, import_line_color: [0, 0, 0], import_fill_color: [0, 12, 255], export_line_color: [10, 20, 30], show_export_fill: true, export_fill_color: [40, 50, 60] });
  assert(getComputedStyle(c.shadowRoot.querySelector('.import-line')).stroke === 'rgb(0, 0, 0)', 'fixed black line');
  assert(getComputedStyle(c.shadowRoot.querySelector('#import-area-gradient stop')).stopColor === 'rgb(0, 12, 255)', 'fixed import fill');
  assert(getComputedStyle(c.shadowRoot.querySelector('.export-line')).stroke === 'rgb(10, 20, 30)', 'fixed export line');
  assert(getComputedStyle(c.shadowRoot.querySelector('#export-area-gradient stop')).stopColor === 'rgb(40, 50, 60)', 'fixed export fill');
  qaSet(palette);
  return { width: innerWidth, theme: light ? 'light' : 'dark', palette: custom ? 'custom' : 'default', tooltipPoints: indices.length, existingTooltipOverlaps: [...new Set(tooltipOverlaps)], result: 'PASS' };
};
