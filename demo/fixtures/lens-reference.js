// Pixel reference from 21f4e81 before performance changes; retained to verify Lens output byte for byte.
function makeDisplacementMap(w, h, radius, edgeWidth = 44, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', {willReadFrequently: false});
  if (!ctx) throw new Error('Canvas2D is unavailable');
  const img = ctx.createImageData(w, h);
  const p = img.data;
  // 边缘带按 CSS 像素定义；贴图降采样时同比缩小，视觉宽度保持一致。
  const cssScale = scale > 0 ? scale : 1;
  const band = Math.min(edgeWidth, Math.max(22, Math.min(w, h) / cssScale * .32)) * cssScale;
  // 轮廓半径不变；光学法线使用 1.5 倍圆角半径，让折射集中在外缘。
  const normalRadius = Math.min(radius * 1.5, w / 2, h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + .5, py = y + .5;
      const qx = Math.abs(px - w / 2) - (w / 2 - radius);
      const qy = Math.abs(py - h / 2) - (h / 2 - radius);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const length = Math.hypot(ox, oy);
      const d = length + Math.min(Math.max(qx, qy), 0) - radius;
      const i = (y*w + x)*4;
      if (d > 0 || d < -band) {
        p[i] = p[i + 1] = p[i + 2] = 128; p[i + 3] = 255;
        continue;
      }
      const nqx = Math.abs(px - w / 2) - (w / 2 - normalRadius);
      const nqy = Math.abs(py - h / 2) - (h / 2 - normalRadius);
      let nx, ny;
      if (nqx >= 0 || nqy >= 0) {
        const a = Math.max(nqx, .0001), b = Math.max(nqy, .0001);
        const inv = 1 / Math.hypot(a, b);
        nx = Math.sign(px - w / 2) * a * inv;
        ny = Math.sign(py - h / 2) * b * inv;
      } else {
        nx = Math.sign(px - w / 2) * (nqx >= nqy ? 1 : 0);
        ny = Math.sign(py - h / 2) * (nqx < nqy ? 1 : 0);
      }
      const t = Math.max(0, Math.min(1, -d/band));
      // 圆形 Lens 曲线：作用带中段迅速收敛，中心保持中性。
      const strength = 1 - Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
      // 位移量以贴图像素编码，最终采样距离再由 SVG 通道缩放（optics）决定。
      p[i] = Math.max(0,Math.min(255,Math.round(128 - nx*104*strength)));
      p[i + 1] = Math.max(0,Math.min(255,Math.round(128 - ny*104*strength)));
      p[i + 2] = 128; p[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}


