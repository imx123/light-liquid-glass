# light-liquid-glass

Test environment: 2026-10-17, Windows, Node.js v26.10.0, Codex desktop Chromium. Browser checks passed 20/20 with the Full path enabled. Other browsers and GPU frame rates remain unverified. See [VALIDATION.md](VALIDATION.md).

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

`createLiquidGlass({ root, quality, onChange })` returns `setQuality()`, `refresh()`, `getState()` and `destroy()`. Quality can be `auto`, `full`, `frost` or `solid`. Requesting Full still allows the engine to fall back when the environment cannot use it.

Set `data-liquid-glass="frost"` to keep a particular panel frosted. Use one controller per container; another controller will skip elements that already have an owner. The root itself is included when it carries the marker.

Sizes update automatically. Call `refresh()` after mounting or removing elements, or after changing radius without changing size. On teardown, `destroy()` releases listeners, the observer, timers, animation frames, SVG nodes and cache. It restores the original inline styles and state attributes and can be called more than once. Create a new controller to mount again.

The engine does not read application storage or save preferences. `demo.js` contains the selector and localStorage example.

CSS variables are `--lg-radius` (28px), `--lg-center-blur` (.6px), `--lg-frost-blur` (6px), `--lg-tint` and `--lg-solid`. The default RGB displacement scales are 82/96/110, with an edge band up to 58 map pixels, a 1px rim and a 210×130 pointer glow. Full examples are in the [Chinese guide](README.zh-CN.md).

## How it works

Canvas generates a displacement map when geometry changes. SVG samples the backdrop at three strengths and recombines the RGB channels. The text and controls stay outside the backdrop filter. Pointer movement only updates CSS coordinates.

A controller shares one ResizeObserver and one pointer animation frame. It caches up to eight maps by size and radius, so repeated refreshes and mode changes can reuse them. Map generation is capped at approximately 360,000 pixels; panels larger than 1,200,000 CSS pixels fall back to frost. Analytic normals reduce distance sampling, with finite differences retained at narrow seams to preserve the original shape.

In the recorded 600×600 CPU sample, map calculation dropped from about 7.60ms to 4.59ms, roughly 40%. This measures pixel math and array writes only. PNG encoding, compositing and GPU sampling are excluded. Run `node demo/benchmark.mjs` to repeat the comparison; see [VALIDATION.md](VALIDATION.md) for the measurements. Three-channel dispersion still costs more GPU work than blur, so use it on a few main panels and keep ordinary lists frosted.

## Compatibility

Full uses the SVG backdrop-filter path in desktop Chromium. A successful feature check is only a candidate signal; inspect the rendered result on the target device. Other engines and coarse primary pointers fall back to frost. Reduced transparency selects solid material, and reduced motion suppresses the pointer glow.

Use equal, non-elliptical corner radii, preferably a px value for `--lg-radius`. Avoid nested glass or scaling and rotating the glass element, which changes backdrop sampling and pointer coordinates.

A strict CSP must allow the local modules, generated `data:` images and required dynamic style updates. Keep the existing protections and add only the rules needed. Register the effect files and backdrop if your static server uses a whitelist. The included background, demo and server are optional.

## Files and checks

`glass.js` and `glass.css` are the material. `index.html`, `demo.js` and `demo.css` make up the demo. `checks.js` runs the 20 browser checks, while `benchmark.mjs` compares map math and CPU time. `manifest.sha256` lists file hashes. The preview lives in `preview.png`.

Code and documentation were written with AI assistance. The demo background is AI generated.

References: [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter), [MDN ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver).
