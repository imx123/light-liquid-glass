/** Liquid Glass v2 — 零依赖 ES 模块。仅显式初始化，不操作业务布局或存储。 */
const NS = 'http://www.w3.org/2000/svg';
const MODES = ['auto', 'full', 'light', 'frost', 'solid'];
const FULL_PANEL_LIMIT = 3;
const FULL_AREA_BUDGET = 400000;
const MAX_PANEL_AREA = 1200000;
const VIEWPORT_REFRESH_MS = 120;
const OPTICS = {
  refraction: {fallback: 110, min: 0, max: 200},
  dispersion: {fallback: 14, min: 0, max: 50},
  edgeWidth: {fallback: 44, min: 1, max: 120},
};
const owners = new WeakMap();
let uid = 0;
const svgNode = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

/** Validate the optical parameters before any DOM, observer or cache resource exists. */
function normalizeOptics(input) {
  if (input === undefined) input = {};
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Liquid Glass optics must be an object');
  }
  const optics = {};
  for (const [name, spec] of Object.entries(OPTICS)) {
    const value = input[name];
    if (value === undefined) { optics[name] = spec.fallback; continue; }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError('Liquid Glass optics.' + name + ' must be a finite number');
    }
    optics[name] = Math.min(spec.max, Math.max(spec.min, value));
  }
  return optics;
}

/** Compute circular Lens displacement near the rounded-rectangle rim.
 * Inward sampling limits transparent boundary artifacts in tightly cropped filters.
 * RGB R/G encode horizontal/vertical displacement; sRGB color space is required.
 */
function makeDisplacementMap(w, h, radius, edgeWidth = 44, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', {willReadFrequently: false});
  if (!ctx) throw new Error('Canvas2D is unavailable');
  const img = ctx.createImageData(w, h);
  const p = img.data;
  // 一次填好中性 RGBA。按本机字节序构造像素，不依赖大小端。
  const neutral = new Uint32Array(new Uint8Array([128, 128, 128, 255]).buffer)[0];
  new Uint32Array(p.buffer, p.byteOffset, w * h).fill(neutral);
  // 边缘带按 CSS 像素定义；贴图降采样时同比缩小，视觉宽度保持一致。
  const cssScale = scale > 0 ? scale : 1;
  const band = Math.min(edgeWidth, Math.max(22, Math.min(w, h) / cssScale * .32)) * cssScale;
  // 轮廓半径不变；光学法线使用 1.5 倍圆角半径，让折射集中在外缘。
  const normalRadius = Math.min(radius * 1.5, w / 2, h / 2);
  const inset = Math.max(radius, band);
  const skipStart = Math.max(0, Math.ceil(inset - .5));
  const skipEnd = Math.min(w, Math.floor(w - inset - .5) + 1);
  const horizontal = new Float64Array(w), normalX = new Float64Array(w);
  const signs = new Int8Array(w);
  for (let x = 0; x < w; x++) {
    const dx = x + .5 - w / 2;
    horizontal[x] = Math.abs(dx) - (w / 2 - radius);
    normalX[x] = Math.abs(dx) - (w / 2 - normalRadius);
    signs[x] = Math.sign(dx);
  }
  for (let y = 0; y < h; y++) {
    const py = y + .5;
    const qy = Math.abs(py - h / 2) - (h / 2 - radius);
    const nqy = Math.abs(py - h / 2) - (h / 2 - normalRadius);
    const signY = Math.sign(py - h / 2);
    const skipCenter = py >= inset && py <= h - inset && skipEnd > skipStart;
    for (let x = 0; x < w; x++) {
      // 中央矩形必在光学带外，直接跳过；圆角和边缘仍使用原公式。
      if (skipCenter && x === skipStart) { x = skipEnd - 1; continue; }
      const qx = horizontal[x];
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const length = Math.hypot(ox, oy);
      const d = length + Math.min(Math.max(qx, qy), 0) - radius;
      const i = (y*w + x)*4;
      if (d > 0 || d < -band) continue;
      const nqx = normalX[x];
      let nx, ny;
      if (nqx >= 0 || nqy >= 0) {
        const a = Math.max(nqx, .0001), b = Math.max(nqy, .0001);
        const inv = 1 / Math.hypot(a, b);
        nx = signs[x] * a * inv;
        ny = signY * b * inv;
      } else {
        nx = signs[x] * (nqx >= nqy ? 1 : 0);
        ny = signY * (nqx < nqy ? 1 : 0);
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


export function createLiquidGlass(options = {}) {
  const { optics: opticsInput = {} } = options;
  let { quality = 'auto' } = options;
  if (!MODES.includes(quality)) throw new TypeError('Unknown glass quality: ' + quality);
  const optics = normalizeOptics(opticsInput);
  const root = options.root === undefined ? document : options.root;
  const { onChange = () => {} } = options;
  if (!root || typeof root.querySelectorAll !== 'function') throw new TypeError('Glass root must support querySelectorAll');
  if (typeof onChange !== 'function') throw new TypeError('Glass onChange must be a function');
  const abort = new AbortController();
  const records = new Map(), cache = new Map();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const transparency = matchMedia('(prefers-reduced-transparency: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const chromium = /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent)
    && !/Firefox|FxiOS|CriOS|EdgiOS|iPhone|iPad|Android/.test(navigator.userAgent)
    && CSS.supports('backdrop-filter', 'url("#lg-probe")');
  let svg, defs, timer, frame = 0, viewportFrame = 0, moving = false;
  let pending = null, active = null, disposed = false, mapBuilds = 0;
  const listen = (target, event, fn, signal = abort.signal) =>
    target.addEventListener(event, fn, { passive: true, signal });
  const observer = new ResizeObserver(scheduleRefresh);

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
    if (!record.filter) return;
    record.filter.remove();
    record.filter = null; record.signature = ''; record.variant = '';
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
  function ensureFilter(record, variant) {
    if (!svg) {
      svg = svgNode('svg', { width: 0, height: 0, 'aria-hidden': 'true', 'data-lg-defs': '' });
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      defs = svgNode('defs'); svg.append(defs); document.body.append(svg);
    }
    const id = 'lg-v2-' + ++uid;
    const filter = svgNode('filter', { id, x: 0, y: 0, width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' });
    const map = svgNode('feImage', { x: 0, y: 0, result: 'map', preserveAspectRatio: 'none' });
    filter.append(map);
    if (variant === 'light') {
      // 单次位移：同一张弧面贴图，不做通道拆分或颜色合成。
      filter.append(svgNode('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: optics.refraction,
        xChannelSelector: 'R', yChannelSelector: 'G' }));
    } else {
      // dispersion 保留 0..50 的接口范围，归一化为 D=0..1。
      const dispersion = optics.dispersion / 50;
      for (let channel = 0; channel < 3; channel++) {
        const matrix = Array(20).fill(0); matrix[channel * 6] = 1; matrix[18] = 1;
        filter.append(svgNode('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: optics.refraction * (1 + (channel - 1) * dispersion * .006),
          xChannelSelector: 'R', yChannelSelector: 'G', result: 'shift' + channel }));
        filter.append(svgNode('feColorMatrix', { in: 'shift' + channel, type: 'matrix', values: matrix.join(' '), result: 'c' + channel }));
      }
      filter.append(svgNode('feComposite', { in: 'c0', in2: 'c1', operator: 'arithmetic', k2: 1, k3: 1, result: 'rg' }));
      filter.append(svgNode('feComposite', { in: 'rg', in2: 'c2', operator: 'arithmetic', k2: 1, k3: 1, result: 'rgb' }));
      const mix = dispersion > .001 ? dispersion * .20 : 0;
      filter.append(svgNode('feComposite', { in: 'shift1', in2: 'rgb', operator: 'arithmetic',
        k2: 1 - mix, k3: mix }));
    }
    defs.append(filter); Object.assign(record, { filter, map, id, variant });
  }
  function measure(record) {
    const el = record.el, rect = el.getBoundingClientRect();
    if (el.dataset.liquidGlass === 'frost' || !chromium || coarse.matches || record.failed
      || rect.width <= 0 || rect.height <= 0 || rect.width * rect.height > MAX_PANEL_AREA) return null;
    const width = Math.min(rect.right, innerWidth) - Math.max(rect.left, 0);
    const height = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
    return { rect, area: width > 0 && height > 0 ? width * height : 0 };
  }
  function planModes() {
    const plan = new Map(), candidates = [], geometry = new Map();
    let order = 0;
    for (const record of records.values()) {
      const el = record.el;
      if (transparency.matches || quality === 'solid') { plan.set(record, 'solid'); continue; }
      if (quality === 'frost' || el.dataset.liquidGlass === 'frost') { plan.set(record, 'frost'); continue; }
      const metrics = measure(record);
      if (metrics) {
        // 在任何材质写入前批量读尺寸与圆角，避免逐面板读写交错。
        try {
          const w = Math.round(metrics.rect.width), h = Math.round(metrics.rect.height);
          const raw = getComputedStyle(el).borderTopLeftRadius;
          const radius = Math.min(w / 2, h / 2, (parseFloat(raw) || 0) * (raw.endsWith('%') ? Math.min(w, h) / 100 : 1));
          geometry.set(record, { w, h, radius });
        } catch (error) { geometry.set(record, { error }); }
      }
      if (quality === 'full' || quality === 'light') { plan.set(record, metrics ? quality : 'frost'); continue; }
      if (!metrics || !metrics.area) { plan.set(record, 'frost'); continue; }
      if (moving) { plan.set(record, 'light'); continue; }
      candidates.push({ record, area: metrics.area, order: order++ });
    }
    // Auto 预算按裁剪后的可视面积从大到小分配，同面积保持 DOM 顺序。
    candidates.sort((a, b) => b.area - a.area || a.order - b.order);
    let fullPanels = 0, fullArea = 0;
    for (const { record, area } of candidates) {
      if (fullPanels < FULL_PANEL_LIMIT && fullArea + area <= FULL_AREA_BUDGET) {
        plan.set(record, 'full'); fullPanels++; fullArea += area;
      } else plan.set(record, 'light');
    }
    return { plan, geometry };
  }
  function apply(record, mode, geometry) {
    const el = record.el;
    if (el.dataset.lgMode !== mode) el.dataset.lgMode = mode;
    if (mode !== 'full' && mode !== 'light') { dropFilter(record); return; }
    try {
      if (geometry.error) throw geometry.error;
      const { w, h, radius } = geometry;
      record.geometry = geometry;
      const signature = [w, h, radius, optics.edgeWidth].join(':');
      if (record.filter && record.variant === mode && record.signature === signature) return;
      if (!record.filter || record.variant !== mode) {
        dropFilter(record);
        ensureFilter(record, mode);
      }
      let bitmap = cache.get(signature);
      // 命中的常用几何移到末尾，避免短暂尺寸变更挤掉热点贴图。
      if (bitmap) { cache.delete(signature); cache.set(signature, bitmap); }
      if (!bitmap) {
        const ratio = Math.min(1, Math.sqrt(360000 / (w * h)));
        bitmap = makeDisplacementMap(Math.max(1, Math.round(w * ratio)), Math.max(1, Math.round(h * ratio)),
          radius * ratio, optics.edgeWidth, ratio);
        mapBuilds++; cache.set(signature, bitmap);
        if (cache.size > 8) cache.delete(cache.keys().next().value);
      }
      record.map.setAttribute('href', bitmap);
      record.map.setAttribute('width', w); record.map.setAttribute('height', h);
      record.signature = signature;
      // 中央清晰，只有贴图边缘参与折射；文字不经过滤镜。
      el.style.setProperty('backdrop-filter', 'url("#' + record.id + '") blur(var(--lg-center-blur, 3px)) saturate(120%)');
      el.style.setProperty('-webkit-backdrop-filter', el.style.getPropertyValue('backdrop-filter'));
    } catch (error) {
      record.failed = true; dropFilter(record); el.dataset.lgMode = 'frost';
      console.warn('Liquid Glass: using frosted fallback.', error);
    }
  }
  function getState() {
    const counts = { full: 0, light: 0, frost: 0, solid: 0 };
    for (const { el } of records.values()) if (counts[el.dataset.lgMode] !== undefined) counts[el.dataset.lgMode]++;
    return { quality, opticalModel: 'lens', ...counts, elements: records.size, filters: defs?.childElementCount || 0,
      mapBuilds, cachedMaps: cache.size, disposed };
  }
  function render() {
    const { plan, geometry } = planModes();
    for (const record of records.values()) apply(record, plan.get(record) || 'frost', geometry.get(record));
    onChange(getState());
  }
  function refresh() {
    if (disposed) return;
    clearTimeout(timer); timer = 0;
    moving = false; cancelAnimationFrame(viewportFrame); viewportFrame = 0;
    const elements = new Set(root.querySelectorAll('[data-liquid-glass]'));
    if (root.matches?.('[data-liquid-glass]')) elements.add(root);
    for (const [el, record] of records) if (!elements.has(el) || !el.isConnected) unmount(record);
    for (const el of elements) if (el.isConnected && !records.has(el)) mount(el);
    render();
  }
  function scheduleRefresh() {
    if (disposed) return;
    clearTimeout(timer);
    // 自动几何刷新只处理已挂载记录。新增/移除仍由公开 refresh() 显式同步。
    timer = setTimeout(() => {
      timer = 0;
      if (disposed) return;
      moving = false; cancelAnimationFrame(viewportFrame); viewportFrame = 0;
      for (const record of records.values()) if (!record.el.isConnected) unmount(record);
      render();
    }, VIEWPORT_REFRESH_MS);
  }
  function viewportChange() {
    if (disposed) return;
    if (quality === 'auto' && !moving) {
      moving = true;
      // 操作期间用基准折射；只换滤镜，沿用旧几何与位图，不在滚动帧重算 PNG。
      viewportFrame = requestAnimationFrame(() => {
        viewportFrame = 0;
        if (disposed || !moving || quality !== 'auto') return;
        let changed = false;
        for (const record of records.values()) if (record.el.dataset.lgMode === 'full') {
          apply(record, 'light', record.geometry); changed = true;
        }
        if (changed) onChange(getState());
      });
    }
    scheduleRefresh();
  }
  function setQuality(value) {
    if (!MODES.includes(value)) throw new TypeError('Unknown glass quality: ' + value);
    quality = value; refresh();
  }
  function destroy() {
    if (disposed) return;
    disposed = true; abort.abort(); observer.disconnect(); clearTimeout(timer); hide();
    cancelAnimationFrame(viewportFrame); viewportFrame = 0;
    for (const record of [...records.values()]) unmount(record);
    svg?.remove(); cache.clear();
  }
  // 构造期间出错时 API 尚未交给调用方，必须先回滚，再保留原始异常。
  try {
    listen(window, 'blur', () => hide());
    listen(document, 'visibilitychange', () => { if (document.hidden) hide(); });
    listen(motion, 'change', () => { if (motion.matches) hide(); });
    listen(transparency, 'change', refresh); listen(coarse, 'change', refresh);
    // 捕获内部滚动容器的 scroll；与尺寸观察共用一个防抖定时器。
    document.addEventListener('scroll', () => { if (quality === 'auto') viewportChange(); },
      { passive: true, capture: true, signal: abort.signal });
    listen(window, 'resize', viewportChange);
    refresh();
  } catch (error) {
    destroy();
    throw error;
  }
  return { refresh, setQuality, getState, destroy };
}
