// Pixel equality and paired CPU samples against the pre-optimization Lens function.
// No browser compositing, PNG encoding or GPU timing is represented here.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

function raster(source) {
  let pixels;
  const document = { createElement() { return {
    getContext() { return {
      createImageData(w, h) { return {data: new Uint8ClampedArray(w * h * 4)}; },
      putImageData(image) { pixels = image.data; }
    }; }, toDataURL() { return 'data:benchmark'; }
  }; } };
  const start = source.indexOf('function makeDisplacementMap');
  const end = source.indexOf('export function');
  const make = new Function('document', source.slice(start, end < 0 ? undefined : end)
    + '\nreturn makeDisplacementMap;')(document);
  return (...args) => { make(...args); return pixels; };
}
const before = raster(readFileSync(new URL('fixtures/lens-reference.js', import.meta.url), 'utf8'));
const after = raster(readFileSync(new URL('../glass.js', import.meta.url), 'utf8'));
const cases = [
  [320, 220, 28, 44, 1], [900, 70, 28, 58, 1], [600, 600, 21, 58, .75],
  [120, 120, 60, 30, 1], [301, 201, 0, 58, 1], [60, 22, 11, 120, 1],
  [1, 1, .5, 1, 1], [3, 5, 1.5, 120, 1], [800, 450, 34.25, 1, .63],
  [600, 600, 300, 44, 1], [319, 219, 27.75, 43.25, .75]
];
let seed = 0x20261021;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
for (let i = 0; i < 64; i++) {
  const w = 1 + Math.floor(random() * 700), h = 1 + Math.floor(random() * 500);
  cases.push([w, h, random() * Math.min(w, h) / 2, 1 + random() * 119, .25 + random() * .75]);
}
for (const args of cases) {
  const expected = before(...args), actual = after(...args);
  assert.deepEqual(actual, expected, 'Lens pixel mismatch: ' + args.join(','));
}
const median = values => values.sort((a,b) => a-b)[Math.floor(values.length / 2)];
const timings = [];
for (const args of [[320, 220, 28, 44, 1], [900, 70, 28, 44, 1], [600, 600, 28, 44, 1]]) {
  for (let i = 0; i < 5; i++) { before(...args); after(...args); }
  const oldTimes = [], newTimes = [];
  for (let i = 0; i < 15; i++) {
    for (const [fn, list] of i % 2 ? [[after,newTimes],[before,oldTimes]] : [[before,oldTimes],[after,newTimes]]) {
      const start = performance.now(); fn(...args); list.push(performance.now() - start);
    }
  }
  const beforeMs = median(oldTimes), afterMs = median(newTimes);
  timings.push({size:args[0]+'x'+args[1], beforeMs, afterMs, reductionPercent:(1-afterMs/beforeMs)*100});
}
console.log(JSON.stringify({node:process.version, equalPixelCases:cases.length, iterations:15, timings,
  scope:'Paired Node CPU raster math only; excludes PNG encoding, browser compositing and GPU'},null,2));
