// Browser regression helpers. Run from /qa/ against the built bundle.
// The README snapshots use docs/examples instead of this synthetic stress fixture.
export function checkLocalization(card = document.querySelector('#card')) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const root = () => card.shadowRoot;
  const results = [];
  const originalConfig = { ...card._config };
  const originalHass = card._hass;
  const frontend = document.createElement('home-assistant');
  const existingFrontend = document.querySelector('home-assistant');
  if (!existingFrontend) document.body.append(frontend);
  try {
    for (const language of ['en', 'nl']) {
      const hass = { ...originalHass, language, locale: { language } };
      frontend.hass = hass;
      card.setConfig({ ...originalConfig, title: undefined, graph_mode: 'both', current_price_mode: 'both', show_title: true, cheapest_hours: 4, export_best_hours: 4, show_cheapest_table: true, show_export_table: true });
      card.hass = hass;
      assert(root().querySelector('h2').textContent === (language === 'en' ? 'Dynamic energy prices' : 'Dynamische energieprijzen'), 'Automatic title');
      assert(root().querySelector('ha-card').lang === language, 'Accessible language');
      const form = card.constructor.getConfigForm();
      const fields = [];
      const walk = (schema) => schema.forEach(field => { fields.push(field); if (field.schema) walk(field.schema); });
      walk(form.schema);
      const context = { hass };
      for (const field of fields) {
        assert(field.name && (!field.schema || field.flatten === true), 'Named flat editor schema');
        const label = form.computeLabel.call(context, field);
        assert(label && label !== field.name, `Translated editor label: ${field.name}`);
      }
      assert(form.computeLabel.call(context, form.schema[0]) === (language === 'en' ? 'General' : 'Algemeen'), 'Editor group label');
      assert(fields.find(field => field.name === 'graph_mode').selector.select.options[0].label === (language === 'en' ? 'Import' : 'Afname'), 'Selector language');
      assert(form.computeHelper.call(context, { name: 'cheap_color' }).includes(language === 'en' ? 'Empty' : 'Leeg'), 'Helper language');
      const chart = root().querySelector('.chart');
      chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      assert(!root().querySelector('.tooltip').hidden, 'Keyboard opens tooltip');
      assert(root().querySelector('.sr-only').textContent.includes(language === 'en' ? 'cents per kilowatt-hour' : 'cent per kilowattuur'), 'Localized aria-live price');
      chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      assert(card._activeIndex === 1, 'Arrow navigation');
      chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      assert(card._activeIndex === card._chart.timeline.length - 1, 'End navigation');
      chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert(root().querySelector('.tooltip').hidden, 'Escape hides tooltip');
      const bounds = chart.getBoundingClientRect();
      chart.dispatchEvent(new PointerEvent('pointerdown', { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2, pointerType: 'touch', bubbles: true }));
      assert(!root().querySelector('.tooltip').hidden, 'Touch opens tooltip');
      document.body.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, composed: true }));
      assert(root().querySelector('.tooltip').hidden, 'Outside touch dismisses');
      const toggle = root().querySelector('.legend-series');
      toggle.click();
      assert(root().querySelector('.legend-series').getAttribute('aria-pressed') === 'false', 'Legend toggle');
      root().querySelector('.legend-series').click();
      card.setConfig({ ...card._config, show_hover_line: false, show_price_levels: false });
      card.hass = hass;
      assert(!root().querySelector('.hover-line') && !root().querySelector('.level-line') && !root().querySelector('.level-label'), 'Disabled overlays absent');
      card._showPoint(0);
      assert(!root().querySelector('.tooltip').hidden && !root().querySelector('.hover-dot').hidden, 'Tooltip and marker survive disabled guides');
      const missing = card._chart.timeline.findIndex(point => !Number.isFinite(point.exportPrice));
      if (missing !== -1) {
        card._showPoint(missing);
        assert(root().querySelector('.tooltip').innerText.includes('—'), 'Missing export remains explicit');
        assert(root().querySelector('.sr-only').textContent.includes(language === 'en' ? 'export unavailable' : 'teruglevering niet beschikbaar'), 'Localized missing-value announcement');
      }
      results.push({ language, editorFields: fields.length, keyboard: true, touch: true, legend: true, disabledGuides: true, missingValue: missing !== -1 });
    }
  } finally {
    card._hiddenSeries.clear();
    card.setConfig(originalConfig);
    card.hass = originalHass;
    if (!existingFrontend) frontend.remove();
  }
  return results;
}
window.checkLocalization = checkLocalization;
