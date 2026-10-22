# light-liquid-glass

Test environment: Windows, Node.js v26.12.1, 2026-10-22. The host checks passed 69 cases, and 75 Lens map comparisons matched byte for byte. An earlier version passed 116/116 Chromium checks on 2026-10-21.

The user reported that Android Edge Light worked and approved the revised Firefox prototype by visual inspection. The updated browser suite and physical Android Full rendering still need testing. GPU frame rates have not been measured. Results and test scope are in [VALIDATION.md](demo/VALIDATION.md).

English · [中文说明](README.zh-CN.md)

A liquid glass effect for websites, built with plain HTML, CSS and JavaScript. Refraction follows the rounded edges, with a small amount of RGB dispersion and a lightly blurred center. A soft glow follows the pointer and disappears when it leaves the panel.

![Liquid glass preview](demo/preview.png)

The effect started in a chat interface and now ships as `glass.js` and `glass.css`. It has no framework, npm, CDN or WebGL dependencies. The screenshot predates the latest changes.

## Run the demo

With Node.js 18+, run `node demo/server.mjs` from the repository root and open <http://localhost:4178>. The server listens on loopback by default and only serves allowlisted demo files.

Use the selector to switch modes. The sliders adjust refraction (0 to 200), dispersion (0 to 50), edge width (1 to 120px) and liquid backdrop blur (0 to 12px, in steps of 0.1). Values update as you drag; the effect changes when you release the slider. Arrow keys work too.

Reset restores 110 / 14 / 15px / 2px. It keeps your input, added cards and selected quality. Reloading restores the default parameters. You can also add or remove cards and run the browser checks from the demo.

To test on a phone, put both devices on a LAN where they can reach each other. In PowerShell, run `$env:HOST="your LAN IPv4"; $env:PORT="4179"; node demo/server.mjs`, then open `http://your-LAN-IPv4:4179/` on the phone.

## Add it to a page

Copy `glass.css` and `glass.js` into your static assets, include the stylesheet and mark the panels:

```html
<link rel="stylesheet" href="./glass.css">
<article class="lg-glass" data-liquid-glass style="padding:28px">
  <h2>Your panel</h2>
  <p>Use a detailed backdrop to make refraction visible.</p>
</article>
<script type="module">
  import { createLiquidGlass } from './glass.js';
  const glass = createLiquidGlass({ root: document, quality: 'auto' });
  // glass.setQuality('full' | 'light' | 'frost' | 'solid' | 'auto');
  // glass.refresh(); after dynamic mount/unmount or radius-only style changes
  // glass.getState(); diagnostic counters
  // glass.destroy(); on component teardown
</script>
```

Use a backdrop with visible texture or lines to make the refraction easier to see. The stylesheet targets `.lg-glass` without resetting the body, controls or layout. The ::before pseudo-element draws the pointer glow, so check whether your component already uses it. The demo background and server are optional.

## Control the material

`createLiquidGlass({ root, quality, optics, onChange })` returns `setQuality()`, `refresh()`, `getState()` and `destroy()`. Choose `auto`, `full`, `light`, `frost` or `solid`. Full and Light fall back when refraction is unavailable. Set `data-liquid-glass="frost"` to keep an individual panel frosted.

`optics` accepts `refraction` (default 110, range 0 to 200), `dispersion` (14, 0 to 50) and `edgeWidth` (15, 1 to 120). Values must be finite numbers. Strings, `NaN`, `Infinity` and other non-numbers throw a `TypeError` before resources are created; finite values outside the range are clamped. The `edgeWidth` band stays in CSS pixels when a large panel uses a lower-resolution map. To change optics, destroy the controller and create another one.

A container usually needs one controller. A second controller skips elements that already have an owner. The root itself is included if it carries the marker.

Size changes update automatically. Call `refresh()` after adding or removing panels, or after changing a corner radius without changing size. On teardown, `destroy()` releases listeners, observers, timers, animation frames, SVG nodes and cached maps, then restores the original inline styles and state attributes. Repeated calls are safe. Create a new controller to mount again.

The first `onChange` runs synchronously during construction. If setup or that callback throws, the controller restores the elements and releases its resources before rethrowing the original error. Later callback errors also propagate; you can use the returned controller to clean up.

The engine does not use application storage or save preferences. `demo.js` shows how to connect the selector to localStorage.

CSS variables control the material: `--lg-radius` (28px), `--lg-center-blur` (2px), `--lg-frost-blur` (6px), `--lg-tint`, `--lg-solid`, `--lg-glow-width` (210px), `--lg-glow-height` (130px) and `--lg-glow-opacity` (1). The edge band is up to 15 CSS pixels. The [Chinese guide](README.zh-CN.md) has a full CSS example.

## Firefox background-image prototype

On desktop and Android Firefox, the demo draws a copy of the supplied background inside each glass panel and applies ordinary SVG filters to it. The text and controls stay separate. This path refracts the background image; it cannot capture text, video or overlapping cards behind the panel.

Open `/?renderer=background` to try it in another browser, or `/?renderer=native` to return to native backdrop sampling. Auto uses Light; manual Full adds RGB refraction. Both modes remove offscreen copies and realign visible copies on each scroll frame. The defaults are still 15px / 2px. The user has approved the appearance by visual inspection; full Firefox rendering checks and GPU measurements remain pending.

Decode the image before passing `background: { image, overlayTop, overlayBottom, color }` to createLiquidGlass. Only image is required. The other fields set a vertical gradient and base color. The page and the copies must use the same viewport-fixed, centered cover image, gradient and color. See the demo stylesheet and [Chinese example](README.zh-CN.md). Arbitrary CSS backgrounds, transformed panels and nested glass are outside the prototype's scope.

getState().renderer reports background-image or backdrop. Prototype compatibility is background-image-experimental, or unsupported if the feature check fails.

The demo starts with a 55% tint overlay. Select 100% to compare the original tint. This changes the decorative overlay, leaving panel and text opacity alone; blur stays at 2px and the edge band at 15px. The core variable is `--lg-image-tint-opacity`, with a default of 1.

The demo has 17 checks for this path, including RGB channels and Lens pixels. Native backdrop checks may still skip on Firefox. Each skipped case lists its reason and is excluded from the pass count. These checks do not replace a visual review.

## How it works

Light makes one displacement pass at `optics.refraction`, which defaults to 110. Full uses three passes for RGB dispersion. Both modes share a curved-edge bitmap, so switching modes can reuse it.

Canvas creates the map when geometry changes. For inward distance `t = clamp(-d / band, 0, 1)`, the Lens curve is `1 - sqrt(1 - (1 - t)^2)`. Optical normals use 1.5 times the corner radius, capped at half the shorter side. Full blends the RGB result with the baseline sample. Text and controls stay outside the backdrop filter; pointer movement only changes the glow's CSS coordinates.

Lens is the only optical model. With `D = dispersion / 50` and channel indices 0, 1, 2, displacement scales are `refraction * (1 + (channel - 1) * D * 0.006)`. The defaults are about 109.8152/110/110.1848. The RGB blend weight is `0.20 * D`, or zero when D ≤ 0.001, giving 5.6% at the default setting. The older broad curve has been removed. Parameter names and ranges remain the same, though dispersion values have a different visual meaning.

Desktop Auto gives Full to at most 3 panels per controller, within 400,000 CSS pixels of combined visible area. Larger areas take priority; ties follow mount order. Other visible panels use Light. Scrolling or resizing temporarily changes Full panels to Light. IntersectionObserver activates entering panels on the next animation frame. Offscreen panels release their SVG filter, blur, shadow and glow while keeping their layout. After 120ms without another event, Auto restores its Full budget. Manual Full keeps its requested mode.

IntersectionObserver reports visibility asynchronously and does not detect occlusion or CSS opacity. Without it, the controller checks visibility once per scroll frame. These limits do not guarantee a frame rate.

Each controller shares one ResizeObserver and one pointer animation frame. It reads geometry and styles before writing material changes, avoids writes on an unchanged refresh and keeps up to eight maps in an LRU cache. Automatic geometry updates do not rescan panel membership; use `refresh()` after adding or removing panels. Map generation skips the neutral center without changing Lens pixels. Maps are capped at about 360,000 pixels; panels over 1,200,000 CSS pixels fall back to frost. `getState().opticalModel` is always `lens`.

Full and Light apply browser Gaussian blur after refraction, at 2px by default. The implementation does not reproduce the native finite 25-tap kernel or claim pixel equality with native rendering. Ordinary lists can use `data-liquid-glass="frost"`.

## Compatibility

Desktop Chromium uses SVG backdrop-filter for Full and Light. Desktop devices with a coarse primary pointer keep the frosted fallback.

Android Chromium, including Edge with an Android UA, has experimental Full and Light support on touch devices. Auto uses Light; manual Full uses three channels. Frost and Solid remain available, and touch events do not animate the pointer glow. `getState().compatibility` reports `android-experimental`, `desktop` or `unsupported` for the native path. The demo labels active Android refraction.

Firefox uses the separate background-image prototype described above when the demo enables it. Without that option, the core keeps its native fallback on Firefox, iOS and other unsupported engines.

CSS capability or Canvas setup failures fall back to frost. A successful feature check still needs a rendering test on the device. Android Edge Light has user testing; Android Full and GPU performance need further checks. Reduced transparency selects Solid, and reduced motion hides the pointer glow.

Use the same non-elliptical radius on all four corners, preferably a px value for `--lg-radius`. Nested glass and scaled or rotated panels can change sampling and pointer coordinates.

For a strict CSP, allow the local modules, generated `data:` images and required dynamic style updates. Add the needed rules to your existing policy. Servers with a file whitelist must include the effect files and backdrop.

## Files and checks

The core files and both READMEs are at the repository root. The demo, background image, validation record and check scripts are under `demo/`. `index.html`, `demo.js` and `demo.css` make up the demo; `manifest.sha256` records the file hashes.

Click "运行全部自检" for lifecycle, parameter, quality, integration and optical checks. The suite includes 9 checks for panels entering and leaving the viewport during continuous scrolling. Android Auto stays on Light; manual Full runs the three-channel checks. The expanded suite has not yet had a full browser run.

To run just the parameter checks in the browser console:

```js
const { runParameterChecks } = await import('./parameters-checks.js');
await runParameterChecks(document.querySelector('#check-results'));
```

The output uses PASS/FAIL/SKIP for optics validation, clamping, map edge width, channel scales and glow variables. Optical checks skip when Full is unavailable. `checks.js` covers the controller lifecycle.

Run `node demo/refresh-checks.mjs` for the 69 host scheduling and compatibility checks. `node demo/performance.mjs` compares 75 Lens maps with the pre-optimization reference and samples CPU time. `benchmark.mjs`, run with `node demo/benchmark.mjs`, checks the current Lens math and times pixel calculations and array writes. These host measurements exclude PNG encoding, browser compositing and GPU sampling.

Code and documentation were written with AI assistance. The demo background is AI generated.

References: [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter), [MDN ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver).
