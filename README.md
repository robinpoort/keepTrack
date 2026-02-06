# KeepTrack

KeepTrack reads computed CSS property values from elements and exposes them as CSS custom properties (variables). This lets you use values like an element's rendered `height` or `background-color` elsewhere in your CSS — something not normally possible.

It automatically updates when elements resize, when the DOM changes, or (optionally) on every animation frame for non-layout properties.

## Installation

Include the script via a `<script>` tag, or import it as a CommonJS/AMD module:

```html
<script src="keepTrack.js"></script>
```

```js
const KeepTrack = require('keepTrack');
```

## Basic usage

```js
const tracker = new KeepTrack();
```

Add `data-keeptrack` to any HTML element with a comma-separated list of CSS properties to track:

```html
<div data-keeptrack="height">...</div>
```

This sets `--height` as an inline CSS variable on the element itself, updated whenever the element resizes.

You can track multiple properties:

```html
<div data-keeptrack="height, width, padding-top">...</div>
```

## Where the CSS variable is set

The target for the CSS variable depends on the element's attributes:

### On the element itself (default)

```html
<!-- Input -->
<div data-keeptrack="height">...</div>

<!-- Result -->
<div data-keeptrack="height" style="--height: 64px">...</div>
```

Multiple properties:

```html
<!-- Input -->
<div data-keeptrack="height, width, padding-top">...</div>

<!-- Result -->
<div data-keeptrack="height, width, padding-top" style="--height: 64px; --width: 320px; --padding-top: 16px">...</div>
```

### On the document root (via `id`)

If the element has an `id`, the variable is set on `:root` with the id as a prefix:

```html
<!-- Input -->
<header id="site-header" data-keeptrack="height">...</header>

<!-- Result: sets --site-header-height on :root -->
<html style="--site-header-height: 80px">
  ...
  <header id="site-header" data-keeptrack="height">...</header>
  ...
</html>
```

```css
main {
  padding-top: var(--site-header-height);
}
```

### On a target parent (via `data-keeptrack-target-parent`)

You can set the variable on a parent or any other element. The attribute accepts either a number (levels to traverse up) or a CSS selector:

```html
<!-- Traverse 2 levels up -->
<!-- Input -->
<div class="grandparent">
  <div class="parent">
    <div data-keeptrack="height" data-keeptrack-target-parent="2">...</div>
  </div>
</div>

<!-- Result: --height is set on .grandparent -->
<div class="grandparent" style="--height: 64px">
  <div class="parent">
    <div data-keeptrack="height" data-keeptrack-target-parent="2">...</div>
  </div>
</div>
```

```html
<!-- Closest ancestor matching the selector -->
<!-- Input -->
<div class="wrapper">
  <div>
    <div data-keeptrack="height" data-keeptrack-target-parent=".wrapper">...</div>
  </div>
</div>

<!-- Result: --height is set on .wrapper -->
<div class="wrapper" style="--height: 64px">
  <div>
    <div data-keeptrack="height" data-keeptrack-target-parent=".wrapper">...</div>
  </div>
</div>
```

When using a selector, KeepTrack first tries `el.closest(selector)` to find the nearest ancestor. If no ancestor matches, it falls back to `document.querySelector(selector)`.

If the element also has an `id`, the variable name includes the id:

```html
<!-- Input -->
<div class="layout">
  <div id="sidebar" data-keeptrack="width" data-keeptrack-target-parent=".layout">...</div>
</div>

<!-- Result: --sidebar-width is set on .layout -->
<div class="layout" style="--sidebar-width: 250px">
  <div id="sidebar" data-keeptrack="width" data-keeptrack-target-parent=".layout">...</div>
</div>
```

## Scrollbar dimensions

By default, KeepTrack sets `--scrollbar-width` on `:root`, updated on viewport resize. You can also enable `--scrollbar-height`.

- `--scrollbar-width` is the width (thickness) of the **vertical** scrollbar
- `--scrollbar-height` is the height (thickness) of the **horizontal** scrollbar

```js
new KeepTrack({
  scrollbarWidth: true,   // default: true
  scrollbarHeight: true   // default: false
});
```

```css
.full-width {
  width: calc(100vw - var(--scrollbar-width));
}
```

## Options

```js
new KeepTrack({
  scrollbarWidth: true,   // Track scrollbar width as --scrollbar-width on :root
  scrollbarHeight: false, // Track scrollbar height as --scrollbar-height on :root
  debounceTime: 250,      // Debounce delay in ms for resize and DOM changes
  poll: false,            // Enable requestAnimationFrame polling for non-layout changes
  onChange: null           // Callback when a tracked value changes
});
```

### `poll`

Enable this to track properties that don't affect element size, like `background-color`, `color`, or `font-size`. When enabled, KeepTrack checks all tracked values every animation frame and only updates when a value has changed.

```js
new KeepTrack({ poll: true });
```

### `onChange`

Called whenever a tracked value changes. Receives the element, the property name, and the new value:

```js
new KeepTrack({
  onChange(el, prop, value) {
    console.log(`${prop} changed to ${value}`, el);
  }
});
```

## API

### `init(options)`

Re-initializes with new options. Cleans up the previous instance first.

```js
tracker.init({ poll: true });
```

### `destroy()`

Removes all event listeners, observers, and stops polling.

```js
tracker.destroy();
```

### `recalculate()`

Manually trigger a recalculation of all tracked elements and scrollbar dimensions.

```js
tracker.recalculate();
```

### `observe(element)`

Programmatically start tracking an element (must have a `data-keeptrack` attribute):

```js
tracker.observe(document.querySelector('.my-element'));
```

### `unobserve(element)`

Stop tracking an element and clean up its caches:

```js
tracker.unobserve(document.querySelector('.my-element'));
```

## How it works

KeepTrack uses three mechanisms to detect changes:

- **ResizeObserver** tracks size changes on individual `[data-keeptrack]` elements
- **MutationObserver** detects when tracked elements are added/removed from the DOM, or when their `data-keeptrack`, `data-keeptrack-target-parent`, or `id` attributes change
- **requestAnimationFrame polling** (opt-in via `poll: true`) catches computed style changes that don't affect element size, like color or font changes

All paths use a value cache to avoid unnecessary `setProperty` calls when nothing has changed.
