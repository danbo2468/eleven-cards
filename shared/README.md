# Shared UI components

These small components render native HTML into the caller's existing shadow root. They do not register custom elements or require a framework. History, Bar Chart, Timeline and Heatmap use them through their shared header, period controls and information panel.

Include each available style function once in the shadow root. `cardHeaderStyles()` includes the button and popup styles; `periodControlsStyles()` includes the tab styles. The legend uses each card's existing layout and swatch styles.

## Button

`uiButton()` in [ui-button.js](ui-button.js) renders a native button, or an anchor when `href` is supplied. Variants are `icon`, `surface`, `text`, `close` and `tab`. `type: 'submit'` preserves native form submission. Use `disabled` for buttons; anchors retain ordinary link semantics.

```js
uiButton({
  variant: 'surface', text: 'Apply',
  attrs: {'data-action': 'apply', 'aria-pressed': selected}
});
uiButton({href: historyUrl, content: historyIcon, label: 'History'});
```

`text`, labels, titles and attribute values are escaped. `content` is deliberately trusted HTML supplied by application code: escape any user-provided strings before interpolating them. This applies to panel and popup content as well. `uiAttributes()` rejects malformed attribute names and inline event handlers. Bind events after inserting the markup.

## Legend

[ui-legend.js](ui-legend.js) renders legend buttons with a common pressed state and binds single-click toggling, double-click or Shift+Enter isolation, focus restoration and delayed-click cleanup. Cards supply their own trusted swatch/label HTML and visibility callbacks; the graph and calendar legends share this behavior while keeping their own layout and colours. Call `cancelUILegendClicks(host)` when disconnecting or replacing the configuration.

```js
const markup = uiLegend({items:[{
  id: entity, visible: true, title: 'Hide calendar',
  attrs: {'data-calendar': entity},
  content: '<i class="dot"></i><span>Calendar</span>'
}]});
bindUILegend(host, {toggle: id => toggle(id), isolate: id => isolate(id)});
```

## Tabs

[ui-tabs.js](ui-tabs.js) owns tab/panel associations, active state, focus, arrow keys and Home/End. It skips disabled tabs and hides inactive panels without replacing their content or form drafts. Provide a unique `id` prefix within the shadow root and distinct item values.

```js
const markup = uiTabs({
  id: 'settings', label: 'Settings', selected: 'colours',
  items: [
    {value: 'colours', label: 'Colours', content: colourForm},
    {value: 'layout', label: 'Layout', content: layoutForm}
  ]
});
// After inserting markup:
const tabs = bindUITabs({
  tabs: root.querySelectorAll('[data-ui-tab]'),
  panels: root.querySelectorAll('[data-ui-tab-panel]'),
  onSelect: value => { selectedTab = value; }
});
tabs.select('layout', {focus: true});
```

`select(value, {focus, notify})` returns false for unknown or disabled values. `className`, `panelClassName`, item `className`, `tabAttrs` and `panelAttrs` allow domain-specific layout and selectors. Selection and navigation never fetch data themselves.

## Popup

[ui-popup.js](ui-popup.js) supplies the accessible shell, close button, native popover support, fallback display, viewport positioning, Escape, pointer toggling, outside dismissal and resize/scroll listeners.

```js
const markup = uiPopup({
  id: 'help', title: 'Information', closeLabel: 'Close', content: helpContent
});
// After inserting markup:
const popup = bindUIPopup({
  trigger: root.querySelector('[data-help]'),
  popup: root.querySelector('#help'),
  container: root.querySelector('.help-control'),
  ready: root.querySelector('ha-card')?.updateComplete
});
popup.open();
popup.close(true); // Restore focus to the trigger.
```

The optional `ready` promise delays positioning until layout is ready; an outside click can cancel a pending open. `bindUIPopupPosition()` can also be used alone, with configurable width and maximum height.

Adapters can supply `beforeOpen`, `onOpen(focus)`, `onShown`, `onClose`, `onToggle(open)`, `focusTarget`, `isRequested` and `isCurrent`. This keeps selection, synchronization, rerender restoration and card-specific state outside the component. `open(false)` restores a popup without stealing focus. The caller owns any saved scroll position.

Call `disconnect()` on tab and popup controllers before replacing their DOM or disconnecting a card. This removes handlers and observers and prevents a delayed layout promise from reopening detached content. Rebind controllers after rendering new markup.

Standalone build scripts include these modules before the card adapters. Their generated bundles remain self-contained and can overlap safely with the collection bundle.
