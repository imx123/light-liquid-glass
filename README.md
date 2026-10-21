# light-liquid-glass

Test environment: 2026-10-21, Windows, Node.js v26.10.0, Codex desktop Chromium. The performance update passed 116/116 browser checks with 0 skipped, 23 host scheduling checks and 75 byte-exact Lens map comparisons. GPU frame rates remain unmeasured. See [VALIDATION.md](demo/VALIDATION.md).

English · [中文说明](README.zh-CN.md)

A small liquid glass effect for plain HTML, CSS and JavaScript. A circular Lens curve concentrates refraction near rounded edges, blends a small amount of RGB dispersion into the baseline sample, and keeps the center mostly clear.

Designed for websites. The core files and both READMEs live at the repository root; demo assets, validation notes and checks are in `demo/`. Run the commands below from the repository root.

![Liquid glass preview](demo/preview.png)

The effect started in a chat interface and is packaged as two files. A soft glow follows the pointer while it is inside a panel. The glow disappears on exit. There are no framework, npm, CDN or WebGL dependencies.

## Run the demo

With Node.js 18+, run `node demo/server.mjs` and open <http://localhost:4178>. The server binds to loopback only. Sliders control refraction (0–200), dispersion (0–50), edge width (1–120px) and liquid backdrop blur (0–12px, step 0.1). Values update during dragging; the effect applies on release. Arrow keys also work. Reset restores 110 / 14 / 44px / 3px while preserving input, dynamic cards and the current quality. Reloading restores default parameters. The demo also includes a mode selector and a button to run the browser checks.

## Add it to a page

Copy `glass.css` and `glass.js` into your static assets. Keep your existing server and layout, include the stylesheet, mark the panels, then initialize the module:

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

A detailed backdrop makes refraction easier to see. The stylesheet only targets `.lg-glass`; it does not reset body styles, controls or layout. The ::before pseudo-element draws the pointer glow; check for conflicts with existing components.

## Control the material

`createLiquidGlass({ root, quality, optics, onChange })` returns `setQuality()`, `refresh()`, `getState()` and `destroy()`. Quality can be `auto`, `full`, `light`, `frost` or `solid`. Full and Light fall back when the environment cannot use refraction.

`optics` adjusts the shape of the effect: `refraction` (default 110, range 0 to 200), `dispersion` (14, 0 to 50) and `edgeWidth` (44, 1 to 120). Only finite numbers are accepted. Strings, `NaN`, `Infinity` and other non-numbers throw a `TypeError` before the controller creates any resource; finite values are clamped to the range. `edgeWidth` is a CSS-pixel band, including when a large panel rasterizes its displacement map at a lower resolution.

Lens is now the only optical model; the previous broad curve has been removed. With `D = dispersion / 50` and channel indices 0, 1, 2, scales are `refraction * (1 + (channel - 1) * D * 0.006)`, giving approximately 109.8152/110/110.1848 by default. The RGB result is blended into the green-channel baseline with weight `0.20 * D` (zero when D ≤ 0.001), or 5.6% by default. Parameter names and ranges are retained, but dispersion values now have a different visual meaning.

Set `data-liquid-glass="frost"` to keep a particular panel frosted. Use one controller per container; another controller will skip elements that already have an owner. The root itself is included when it carries the marker.

Sizes update automatically. Call `refresh()` after mounting or removing elements, or after changing radius without changing size. On teardown, `destroy()` releases listeners, the observer, timers, animation frames, SVG nodes and cache. It restores the original inline styles and state attributes and can be called more than once. Create a new controller to mount again.

The first `onChange` runs synchronously during construction. If it or setup throws, the controller rolls back its resources and element changes before rethrowing the original error. Later callback errors still propagate; the returned controller remains available for explicit teardown.

The engine does not read application storage or save preferences. `demo.js` contains the selector and localStorage example.

CSS variables are `--lg-radius` (28px), `--lg-center-blur` (3px), `--lg-frost-blur` (6px), `--lg-tint`, `--lg-solid`, `--lg-glow-width` (210px), `--lg-glow-height` (130px), `--lg-glow-opacity` (1). The default edge band is up to 44 CSS pixels. Full examples are in the [Chinese guide](README.zh-CN.md).

## Browser checks

Open the demo and click “运行全部自检” to run the lifecycle, parameter, quality and integration checks. To run only the parameter module in the browser console:

```js
const { runParameterChecks } = await import('./parameters-checks.js');
await runParameterChecks(document.querySelector('#check-results'));
```

The module reports PASS/FAIL/SKIP lines for optics validation, clamping, map edge width, channel scales and the glow variables. It skips optical checks when the environment falls back from Full. `checks.js` covers the controller lifecycle.

## How it works

Light uses one displacement pass at `optics.refraction` (default 110), sharing the same curved-edge bitmap with Full. Full uses three passes for RGB dispersion. Switching modes reuses the bitmap.

Auto assigns Full to at most 3 panels per controller, within a combined viewport-clipped area of 400,000 CSS pixels. Larger visible areas take priority; ties keep mount order. Other visible panels use Light, while offscreen panels use Frost. During scrolling or window resizing, existing Full panels temporarily use Light without measuring layout or generating maps in the transition. After 120ms without further events, Auto remeasures and restores its Full budget. Manual Full keeps full dispersion during interaction. The budget measures viewport intersection, without checking occlusion, CSS visibility or ancestor clipping; it makes no frame-rate promise.

Canvas generates a displacement map when geometry changes. With normalized inward distance `t = clamp(-d / band, 0, 1)`, Lens strength is `1 - sqrt(1 - (1 - t)^2)`. Optical normals use 1.5 times the corner radius, capped at half the shorter side. Full combines RGB and blends it into the baseline sample; Light uses a single baseline displacement. The text and controls stay outside the backdrop filter. Pointer movement only updates CSS coordinates.

A controller shares one ResizeObserver and one pointer animation frame. Geometry and style reads are batched before material writes. Unchanged refreshes avoid redundant writes; automatic geometry updates do not rescan element membership. Call `refresh()` explicitly after mounting or removing panels. An eight-map LRU cache retains recently used sizes. Map generation skips the neutral center while preserving Lens pixels; it remains capped at approximately 360,000 pixels, with panels over 1,200,000 CSS pixels falling back to frost. `getState().opticalModel` is always `lens`.

Run `node demo/benchmark.mjs` to check the current Lens map and measure CPU pixel math and array writes. PNG encoding, compositing and GPU sampling are excluded. Full and Light apply browser Gaussian blur after refraction, at 3px by default. This does not reproduce the native finite 25-tap blur kernel or claim pixel equality with native rendering. Ordinary lists can use `data-liquid-glass="frost"`.

## Compatibility

Full and Light use the SVG backdrop-filter path in desktop Chromium. A successful feature check is only a candidate signal; inspect the rendered result on the target device. Other engines and coarse primary pointers fall back to frost. Reduced transparency selects solid material, and reduced motion suppresses the pointer glow.

Use equal, non-elliptical corner radii, preferably a px value for `--lg-radius`. Avoid nested glass or scaling and rotating the glass element, which changes backdrop sampling and pointer coordinates.

A strict CSP must allow the local modules, generated `data:` images and required dynamic style updates. Keep the existing protections and add only the rules needed. Register the effect files and backdrop if your static server uses a whitelist. The included background, demo and server are optional.

## Files and checks

Demo files, checks and the validation record are under `demo/`.

`glass.js` and `glass.css` are the material. `index.html`, `demo.js` and `demo.css` make up the demo. Click “运行全部自检” to run the 116 browser checks, including 10 adaptive-interaction checks. `node demo/refresh-checks.mjs` runs 23 host scheduler checks; `node demo/performance.mjs` compares 75 Lens maps with the pre-optimization reference and reports paired CPU timings. `benchmark.mjs` checks current Lens math. `manifest.sha256` lists file hashes. The preview predates this performance update.

Code and documentation were written with AI assistance. The demo background is AI generated.

References: [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter), [MDN ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver).
