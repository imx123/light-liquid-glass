# light-liquid-glass

Test environment: 2026-10-17, Windows, Node.js v26.10.0, Codex desktop Chromium. Browser checks passed 97/97 with 0 skipped, covering Full and Light. Other browsers and GPU frame rates remain unverified. See [VALIDATION.md](VALIDATION.md).

English · [中文说明](README.zh-CN.md)

A small liquid glass effect for plain HTML, CSS and JavaScript. It bends the backdrop near rounded edges, separates the RGB channels slightly, and keeps the center mostly clear.

Designed for websites. The repository root contains only `glass.js` and `glass.css`; demo assets, documentation and checks live in `demo/`. Run the commands below from the repository root.

![Liquid glass preview](preview.png)

The effect started in a chat interface and is packaged as two files. A thin rim catches light at 45°, and a soft glow follows the pointer while it is inside a panel. The glow disappears on exit. There are no framework, npm, CDN or WebGL dependencies.

## Run the demo

With Node.js 18+, run `node demo/server.mjs` and open <http://localhost:4178>. The server binds to loopback only. The demo includes a mode selector, dynamic cards and a button to run the browser checks.

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
  // glass.setQuality('full' | 'frost' | 'solid' | 'auto');
  // glass.refresh(); after dynamic mount/unmount or radius-only style changes
  // glass.getState(); diagnostic counters
  // glass.destroy(); on component teardown
</script>
```

A detailed backdrop makes refraction easier to see. The stylesheet only targets `.lg-glass`; it does not reset body styles, controls or layout. Both pseudo-elements are used for decoration, so check for conflicts with existing components.

## Control the material

`createLiquidGlass({ root, quality, optics, onChange })` returns `setQuality()`, `refresh()`, `getState()` and `destroy()`. Quality can be `auto`, `full`, `light`, `frost` or `solid`. Full and Light fall back when the environment cannot use refraction.

`optics` adjusts the shape of the effect: `refraction` (default 96, range 0 to 200), `dispersion` (14, 0 to 50) and `edgeWidth` (58, 1 to 120). Only finite numbers are accepted. Strings, `NaN`, `Infinity` and other non-numbers throw a `TypeError` before the controller creates any resource; finite values are clamped to the range. Channel scales are `max(0, refraction + (channel - 1) * dispersion)`, so the defaults remain 82/96/110. `edgeWidth` is a CSS-pixel band, including when a large panel rasterizes its displacement map at a lower resolution.

Set `data-liquid-glass="frost"` to keep a particular panel frosted. Use one controller per container; another controller will skip elements that already have an owner. The root itself is included when it carries the marker.

Sizes update automatically. Call `refresh()` after mounting or removing elements, or after changing radius without changing size. On teardown, `destroy()` releases listeners, the observer, timers, animation frames, SVG nodes and cache. It restores the original inline styles and state attributes and can be called more than once. Create a new controller to mount again.

The first `onChange` runs synchronously during construction. If it or setup throws, the controller rolls back its resources and element changes before rethrowing the original error. Later callback errors still propagate; the returned controller remains available for explicit teardown.

The engine does not read application storage or save preferences. `demo.js` contains the selector and localStorage example.

CSS variables are `--lg-radius` (28px), `--lg-center-blur` (.6px), `--lg-frost-blur` (6px), `--lg-tint`, `--lg-solid`, `--lg-glow-width` (210px), `--lg-glow-height` (130px), `--lg-glow-opacity` (1) and `--lg-rim-opacity` (1). The default RGB displacement scales are 82/96/110, with an edge band up to 58 CSS pixels and a 1px rim. Full examples are in the [Chinese guide](README.zh-CN.md).

## Browser checks

Open the demo and click “运行全部自检” to run the lifecycle, parameter, quality and integration checks. To run only the parameter module in the browser console:

```js
const { runParameterChecks } = await import('./parameters-checks.js');
await runParameterChecks(document.querySelector('#check-results'));
```

The module reports PASS/FAIL/SKIP lines for optics validation, clamping, map edge width, channel scales and the glow/rim variables. It skips optical checks when the environment falls back from Full. `checks.js` covers the controller lifecycle.

## How it works

Light uses one displacement pass at `optics.refraction` (default 96), sharing the same curved-edge bitmap with Full. Full uses three passes for RGB dispersion. Switching modes reuses the bitmap.

Auto assigns Full to at most 3 panels per controller, within a combined viewport-clipped area of 400,000 CSS pixels. Larger visible areas take priority; ties keep mount order. Other visible panels use Light, while offscreen panels use Frost. Scrolling and viewport resizing schedule a shared refresh after 120ms without further events. The budget measures viewport intersection, without checking occlusion, CSS visibility or ancestor clipping. It is a layout heuristic and makes no frame-rate promise. Manual Full and Light bypass this budget while keeping the compatibility and 1,200,000-pixel safety limit.

Canvas generates a displacement map when geometry changes. Full's SVG filter samples the backdrop at three strengths and recombines the RGB channels; Light uses a single displacement pass. The text and controls stay outside the backdrop filter. Pointer movement only updates CSS coordinates.

A controller shares one ResizeObserver and one pointer animation frame. It caches up to eight maps by size and radius, so repeated refreshes and mode changes can reuse them. Map generation is capped at approximately 360,000 pixels; panels larger than 1,200,000 CSS pixels fall back to frost. Analytic normals reduce distance sampling, with finite differences retained at narrow seams to preserve the original shape.

In the recorded 600×600 CPU sample, map calculation dropped from about 7.60ms to 4.59ms, roughly 40%. This measures pixel math and array writes only. PNG encoding, compositing and GPU sampling are excluded. Run `node demo/benchmark.mjs` to repeat the comparison; see [VALIDATION.md](VALIDATION.md) for the measurements. Three-channel dispersion still costs more GPU work than blur, so use it on a few main panels and keep ordinary lists frosted.

## Compatibility

Full and Light use the SVG backdrop-filter path in desktop Chromium. A successful feature check is only a candidate signal; inspect the rendered result on the target device. Other engines and coarse primary pointers fall back to frost. Reduced transparency selects solid material, and reduced motion suppresses the pointer glow.

Use equal, non-elliptical corner radii, preferably a px value for `--lg-radius`. Avoid nested glass or scaling and rotating the glass element, which changes backdrop sampling and pointer coordinates.

A strict CSP must allow the local modules, generated `data:` images and required dynamic style updates. Keep the existing protections and add only the rules needed. Register the effect files and backdrop if your static server uses a whitelist. The included background, demo and server are optional.

## Files and checks

`glass.js` and `glass.css` are the material. `index.html`, `demo.js` and `demo.css` make up the demo. The five check modules cover controller behavior, exceptions, parameters, quality and integration. Click “运行全部自检” to run all 97 checks. `benchmark.mjs` compares map math and CPU time. `manifest.sha256` lists file hashes. The preview lives in `preview.png`.

Code and documentation were written with AI assistance. The demo background is AI generated.

References: [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter), [MDN ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver).
