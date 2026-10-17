// 可复现的 CPU 贴图数学对比，不涉及真实 Canvas 编码或 GPU。
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
const original = "function sdfRoundedRect(x, y, w, h, radius) {\n  const qx = Math.abs(x - w / 2) - (w / 2 - radius);\n  const qy = Math.abs(y - h / 2) - (h / 2 - radius);\n  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0))\n    + Math.min(Math.max(qx, qy), 0) - radius;\n}\n\n/** Compute a smooth inward sample displacement near the rounded-rectangle rim.\n * Inward sampling limits transparent boundary artifacts in tightly cropped filters.\n * RGB R/G encode horizontal/vertical displacement; sRGB color space is required.\n */\nfunction makeDisplacementMap(w, h, radius) {\n  const canvas = document.createElement('canvas');\n  canvas.width = w;\n  canvas.height = h;\n  const ctx = canvas.getContext('2d', {willReadFrequently: false});\n  if (!ctx) throw new Error('Canvas2D is unavailable');\n  const img = ctx.createImageData(w, h);\n  const p = img.data;\n  // 更厚的弧面边缘，短顶栏也保留透明中心。\n  const band = Math.min(58, Math.max(22, Math.min(w, h) * .32));\n  for (let y = 0; y < h; y++) {\n    for (let x = 0; x < w; x++) {\n      const px = x + .5, py = y + .5;\n      const d = sdfRoundedRect(px, py, w, h, radius);\n      const i = (y*w + x)*4;\n      if (d > 0 || d < -band) {\n        p[i] = p[i + 1] = p[i + 2] = 128; p[i + 3] = 255;\n        continue;\n      }\n      // Outward SDF gradient = surface normal.\n      const gx = sdfRoundedRect(px+1,py,w,h,radius)-sdfRoundedRect(px-1,py,w,h,radius);\n      const gy = sdfRoundedRect(px,py+1,w,h,radius)-sdfRoundedRect(px,py-1,w,h,radius);\n      const inv = 1/Math.max(1e-5, Math.hypot(gx,gy));\n      const t = Math.max(0, Math.min(1, -d/band));\n      // 弧面近似：外缘较陡，向中心连续归零，拉出可见的透镜弯曲。\n      const strength = Math.pow(1 - t * t, 1.5);\n      // 增强共同折射，相邻通道差保持不变，避免只增加彩边。\n      // 最强通道约向内采样 44px，相邻通道最大相差约 5.7px。\n      p[i] = Math.max(0,Math.min(255,Math.round(128 - gx*inv*104*strength)));\n      p[i + 1] = Math.max(0,Math.min(255,Math.round(128 - gy*inv*104*strength)));\n      p[i + 2] = 128; p[i + 3] = 255;\n    }\n  }\n  ctx.putImageData(img, 0, 0);\n  return canvas.toDataURL('image/png');\n}\n\n";
const optimized = readFileSync(new URL('./glass.js', import.meta.url), 'utf8');
function harness(source, code) {
  let pixels;
  const document = { createElement() { return {
    getContext() { return { createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData(image) { pixels = image.data; } }; }, toDataURL() { return 'data:benchmark'; }
  }; } };
  const makeMap = new Function('document', code + '\nreturn makeDisplacementMap;')(document);
  return (w, h, r) => { makeMap(w, h, r); return pixels; };
}
const before = harness(original, original.slice(original.indexOf('function sdfRoundedRect'), original.indexOf('function svgNode')));
const after = harness(optimized, optimized.slice(optimized.indexOf('function sdfRoundedRect'), optimized.indexOf('export function')));
let difference = 0, largest = 0, channels = 0;
for (const [w, h, radius] of [[360, 240, 28], [900, 70, 28], [600, 600, 28], [120, 120, 60]]) {
  const a = before(w, h, radius), b = after(w, h, radius);
  for (let i = 0; i < a.length; i += 4) {
    for (let j = 0; j < 2; j++) { const d = Math.abs(a[i + j] - b[i + j]); difference += d; largest = Math.max(largest, d); channels++; }
    assert.equal(b[i + 3], 255);
  }
  const center = (Math.floor(h / 2) * w + Math.floor(w / 2)) * 4;
  assert.equal(b[center], 128); assert.equal(b[center + 1], 128);
}
const timing = fn => {
  for (let i = 0; i < 3; i++) fn(600, 600, 28);
  const samples = [];
  for (let i = 0; i < 9; i++) { const start = performance.now(); fn(600, 600, 28); samples.push(performance.now() - start); }
  return samples.sort((a, b) => a - b)[4];
};
const result = { dimensions: '600x600', iterations: 9, originalMedianMs: timing(before), optimizedMedianMs: timing(after),
  meanChannelDifference: difference / channels, maxChannelDifference: largest,
  scope: 'Node CPU raster math only; excludes PNG encoding, browser compositing and GPU' };
result.speedup = result.originalMedianMs / result.optimizedMedianMs;
assert.ok(result.meanChannelDifference < .1, 'Average deviation too large');
assert.ok(result.maxChannelDifference <= 8, 'Local deviation too large');
console.log(JSON.stringify(result, null, 2));
