/** Liquid Glass v2 — 零依赖 ES 模块。仅显式初始化，不操作业务布局或存储。 */
const NS = 'http://www.w3.org/2000/svg';
const MODES = ['auto', 'full', 'frost', 'solid'];
const owners = new WeakMap();
let uid = 0;
const svgNode = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

function sdfRoundedRect(x, y, w, h, radius) {
  const qx = Math.abs(x - w / 2) - (w / 2 - radius);
  const qy = Math.abs(y - h / 2) - (h / 2 - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
    + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Compute a smooth inward sample displacement near the rounded-rectangle rim.
 * Inward sampling limits transparent boundary artifacts in tightly cropped filters.
 * RGB R/G encode horizontal/vertical displacement; sRGB color space is required.
 */
function makeDisplacementMap(w, h, radius) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', {willReadFrequently: false});
  if (!ctx) throw new Error('Canvas2D is unavailable');
  const img = ctx.createImageData(w, h);
  const p = img.data;
  // 更厚的弧面边缘，短顶栏也保留透明中心。
  const band = Math.min(58, Math.max(22, Math.min(w, h) * .32));
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
      const sx = px < w / 2 ? -1 : 1, sy = py < h / 2 ? -1 : 1;
      let nx = length ? ox / length * sx : (qx >= qy ? sx : 0);
      let ny = length ? oy / length * sy : (qx < qy ? sy : 0);
      // 极窄的法线接缝沿用原差分，避免解析分段在中轴形成方向跳变。
      if ((Math.abs(qx - qy) < 2 && qx < 1 && qy < 1) || Math.abs(qx) < 1 || Math.abs(qy) < 1) {
        const gx = sdfRoundedRect(px+1,py,w,h,radius)-sdfRoundedRect(px-1,py,w,h,radius);
        const gy = sdfRoundedRect(px,py+1,w,h,radius)-sdfRoundedRect(px,py-1,w,h,radius);
        const inv = 1 / Math.max(1e-5, Math.hypot(gx, gy));
        nx = gx * inv; ny = gy * inv;
      }
      const t = Math.max(0, Math.min(1, -d/band));
      // 弧面近似：外缘较陡，向中心连续归零，拉出可见的透镜弯曲。
      const strength = Math.pow(1 - t * t, 1.5);
      // 增强共同折射，相邻通道差保持不变，避免只增加彩边。
      // 最强通道约向内采样 44px，相邻通道最大相差约 5.7px。
      p[i] = Math.max(0,Math.min(255,Math.round(128 - nx*104*strength)));
      p[i + 1] = Math.max(0,Math.min(255,Math.round(128 - ny*104*strength)));
      p[i + 2] = 128; p[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}


export function createLiquidGlass({ root = document, quality = 'auto', onChange = () => {} } = {}) {
  if (!MODES.includes(quality)) throw new TypeError('Unknown glass quality: ' + quality);
  const abort = new AbortController();
  const records = new Map(), cache = new Map();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const transparency = matchMedia('(prefers-reduced-transparency: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const chromium = /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent)
    && !/Firefox|FxiOS|CriOS|EdgiOS|iPhone|iPad|Android/.test(navigator.userAgent)
    && CSS.supports('backdrop-filter', 'url("#lg-probe")');
  let svg, defs, timer, frame = 0, pending = null, active = null, disposed = false, mapBuilds = 0;
  const listen = (target, event, fn, signal = abort.signal) =>
    target.addEventListener(event, fn, { passive: true, signal });
  const observer = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  });

  function hide(record = active) {
    if (record) record.el.dataset.pointerLight = 'false';
    if (!record || pending?.record === record) {
      cancelAnimationFrame(frame); frame = 0; pending = null;
    }
    if (active === record) active = null;
  }
  function point(record, event) {
    if (motion.matches || event.pointerType === 'touch') return hide(record);
    if (event.target.closest?.('[data-liquid-glass]') !== record.el) return;
    if (active && active !== record) hide(active);
    active = record;
    pending = { record, x: event.clientX, y: event.clientY };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!pending) return;
      const { record: current, x, y } = pending;
      pending = null;
      const rect = current.el.getBoundingClientRect();
      if (!rect.width || !rect.height) return hide(current);
      current.el.style.setProperty('--lg-mx', ((x - rect.left) / rect.width * 100).toFixed(2) + '%');
      current.el.style.setProperty('--lg-my', ((y - rect.top) / rect.height * 100).toFixed(2) + '%');
      current.el.dataset.pointerLight = 'true';
    });
  }
  function dropFilter(record) {
    record.filter?.remove();
    record.filter = null; record.signature = '';
    for (const key of ['backdrop-filter', '-webkit-backdrop-filter']) {
      const old = record.styles.get(key);
      old.value ? record.el.style.setProperty(key, old.value, old.priority) : record.el.style.removeProperty(key);
    }
  }
  function mount(el) {
    if (owners.has(el)) return;
    const record = { el, abort: new AbortController(), filter: null, failed: false, signature: '',
      attrs: new Map(['data-lg-mode', 'data-pointer-light'].map(key => [key, el.getAttribute(key)])),
      styles: new Map(['backdrop-filter', '-webkit-backdrop-filter', '--lg-mx', '--lg-my'].map(key =>
        [key, { value: el.style.getPropertyValue(key), priority: el.style.getPropertyPriority(key) }])) };
    owners.set(el, record); records.set(el, record);
    for (const event of ['pointerenter', 'pointermove']) listen(el, event, e => point(record, e), record.abort.signal);
    for (const event of ['pointerleave', 'pointercancel']) listen(el, event, () => hide(record), record.abort.signal);
    el.dataset.pointerLight = 'false';
    observer.observe(el);
  }
  function unmount(record) {
    hide(record); record.abort.abort(); observer.unobserve(record.el); dropFilter(record);
    for (const [key, old] of record.styles) {
      old.value ? record.el.style.setProperty(key, old.value, old.priority) : record.el.style.removeProperty(key);
    }
    for (const [key, value] of record.attrs) value === null ? record.el.removeAttribute(key) : record.el.setAttribute(key, value);
    records.delete(record.el); owners.delete(record.el);
  }
  function ensureFilter(record) {
    if (!svg) {
      svg = svgNode('svg', { width: 0, height: 0, 'aria-hidden': 'true', 'data-lg-defs': '' });
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      defs = svgNode('defs'); svg.append(defs); document.body.append(svg);
    }
    const id = 'lg-v2-' + ++uid;
    const filter = svgNode('filter', { id, x: 0, y: 0, width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' });
    const map = svgNode('feImage', { x: 0, y: 0, result: 'map', preserveAspectRatio: 'none' });
    filter.append(map);
    for (let channel = 0; channel < 3; channel++) {
      const matrix = Array(20).fill(0); matrix[channel * 6] = 1; matrix[18] = 1;
      filter.append(svgNode('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: 82 + channel * 14,
        xChannelSelector: 'R', yChannelSelector: 'G', result: 'shift' + channel }));
      filter.append(svgNode('feColorMatrix', { in: 'shift' + channel, type: 'matrix', values: matrix.join(' '), result: 'c' + channel }));
    }
    filter.append(svgNode('feComposite', { in: 'c0', in2: 'c1', operator: 'arithmetic', k2: 1, k3: 1, result: 'rg' }));
    filter.append(svgNode('feComposite', { in: 'rg', in2: 'c2', operator: 'arithmetic', k2: 1, k3: 1 }));
    defs.append(filter); Object.assign(record, { filter, map, id });
  }
  function apply(record) {
    const el = record.el, rect = el.getBoundingClientRect();
    let mode = transparency.matches || quality === 'solid' ? 'solid' : 'frost';
    if (mode !== 'solid' && quality !== 'frost' && el.dataset.liquidGlass !== 'frost'
      && chromium && !coarse.matches && !record.failed && rect.width > 0 && rect.height > 0
      && rect.width * rect.height <= 1200000) mode = 'full';
    el.dataset.lgMode = mode;
    if (mode !== 'full') { dropFilter(record); return; }
    try {
      const w = Math.round(rect.width), h = Math.round(rect.height);
      const raw = getComputedStyle(el).borderTopLeftRadius;
      const radius = Math.min(w / 2, h / 2, (parseFloat(raw) || 0) * (raw.endsWith('%') ? Math.min(w, h) / 100 : 1));
      const signature = [w, h, radius].join(':');
      if (record.filter && record.signature === signature) return;
      if (!record.filter) ensureFilter(record);
      let bitmap = cache.get(signature);
      if (!bitmap) {
        const ratio = Math.min(1, Math.sqrt(360000 / (w * h)));
        bitmap = makeDisplacementMap(Math.max(1, Math.round(w * ratio)), Math.max(1, Math.round(h * ratio)), radius * ratio);
        mapBuilds++; cache.set(signature, bitmap);
        if (cache.size > 8) cache.delete(cache.keys().next().value);
      }
      record.map.setAttribute('href', bitmap);
      record.map.setAttribute('width', w); record.map.setAttribute('height', h);
      record.signature = signature;
      // 中央清晰，只有贴图边缘参与折射；文字不经过滤镜。
      el.style.setProperty('backdrop-filter', 'url("#' + record.id + '") blur(var(--lg-center-blur, .6px)) saturate(120%)');
      el.style.setProperty('-webkit-backdrop-filter', el.style.getPropertyValue('backdrop-filter'));
    } catch (error) {
      record.failed = true; dropFilter(record); el.dataset.lgMode = 'frost';
      console.warn('Liquid Glass: using frosted fallback.', error);
    }
  }
  function getState() {
    const counts = { full: 0, frost: 0, solid: 0 };
    for (const { el } of records.values()) counts[el.dataset.lgMode]++;
    return { quality, ...counts, elements: records.size, filters: defs?.childElementCount || 0,
      mapBuilds, cachedMaps: cache.size, disposed };
  }
  function refresh() {
    if (disposed) return;
    clearTimeout(timer);
    const elements = new Set(root.querySelectorAll('[data-liquid-glass]'));
    if (root.matches?.('[data-liquid-glass]')) elements.add(root);
    for (const [el, record] of records) if (!elements.has(el) || !el.isConnected) unmount(record);
    for (const el of elements) if (el.isConnected && !records.has(el)) mount(el);
    for (const record of records.values()) apply(record);
    onChange(getState());
  }
  function setQuality(value) {
    if (!MODES.includes(value)) throw new TypeError('Unknown glass quality: ' + value);
    quality = value; refresh();
  }
  function destroy() {
    if (disposed) return;
    disposed = true; abort.abort(); observer.disconnect(); clearTimeout(timer); hide();
    for (const record of [...records.values()]) unmount(record);
    svg?.remove(); cache.clear();
  }
  listen(window, 'blur', () => hide());
  listen(document, 'visibilitychange', () => { if (document.hidden) hide(); });
  listen(motion, 'change', () => { if (motion.matches) hide(); });
  listen(transparency, 'change', refresh); listen(coarse, 'change', refresh);
  refresh();
  return { refresh, setQuality, getState, destroy };
}
