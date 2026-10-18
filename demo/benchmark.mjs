// 当前 Lens 的 CPU 贴图数学检查与计时，不包含 Canvas 编码、浏览器合成或 GPU。
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
const source = readFileSync(new URL('../glass.js', import.meta.url), 'utf8');
let pixels;
const document = { createElement() { return {
  getContext() { return {
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData(image) { pixels = image.data; }
  }; },
  toDataURL() { return 'data:benchmark'; }
}; } };
const code = source.slice(source.indexOf('function makeDisplacementMap'), source.indexOf('export function'));
const makeMap = new Function('document', code + '\nreturn makeDisplacementMap;')(document);
const samples = [[320, 220, 28, 58, 1], [900, 70, 28, 58, 1], [600, 600, 21, 58, .75], [120, 120, 60, 30, 1]];
for (const args of samples) {
  makeMap(...args);
  const [w, h] = args;
  const center = (Math.floor(h / 2) * w + Math.floor(w / 2)) * 4;
  assert.equal(pixels[center], 128); assert.equal(pixels[center + 1], 128);
  for (let i = 0; i < pixels.length; i += 4) {
    assert.equal(pixels[i + 2], 128); assert.equal(pixels[i + 3], 255);
  }
}
makeMap(320, 220, 28);
assert.equal(pixels[(0 * 320 + 160) * 4 + 1], 218);
assert.equal(pixels[(29 * 320 + 160) * 4 + 1], 141);
for (let i = 0; i < 3; i++) makeMap(600, 600, 28);
const times = [];
for (let i = 0; i < 9; i++) {
  const start = performance.now(); makeMap(600, 600, 28); times.push(performance.now() - start);
}
console.log(JSON.stringify({ model: 'lens', geometryCases: samples.length, dimensions: '600x600', iterations: 9,
  medianMs: times.sort((a, b) => a - b)[4],
  scope: 'Node CPU raster math only; excludes PNG encoding, browser compositing and GPU' }, null, 2));
