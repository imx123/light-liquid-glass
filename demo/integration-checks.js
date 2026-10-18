// 跨任务契约：参数在 light/full 切换后仍生效，降采样不扩大边缘作用带。
import { createLiquidGlass } from '../glass.js';
const filterFor = el => {
  const id = /url\(["']?#([^"')]+)["']?\)/.exec(el.style.getPropertyValue('backdrop-filter'))?.[1];
  return id ? document.getElementById(id) : null;
};
export async function runIntegrationChecks(output) {
  const results = [];
  const check = (name, ok) => {
    results.push({ name, ok });
    output.textContent = results.map(r => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}`).join('\n');
  };
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-4000px;top:0;pointer-events:none';
  const card = document.createElement('div');
  card.className = 'lg-glass'; card.dataset.liquidGlass = '';
  card.style.cssText = 'width:300px;height:200px';
  host.append(card); document.body.append(host);
  let api;
  try {
    api = createLiquidGlass({ root: host, quality: 'light', optics: { refraction: 145, dispersion: 20, edgeWidth: 30 } });
    if (api.getState().light !== 1) {
      output.textContent = 'SKIP 跨任务 SVG 检查：当前环境回退';
      return { passed: 0, failed: 0, skipped: 1, results };
    }
    const scales = () => [...filterFor(card).querySelectorAll('feDisplacementMap')].map(n => n.getAttribute('scale')).join(',');
    check('light 使用自定义折射强度', scales() === '145');
    const href = filterFor(card).querySelector('feImage').getAttribute('href');
    const builds = api.getState().mapBuilds;
    api.setQuality('full');
    check('切换 full 保留 Lens 折射和色散参数', scales().split(',').length === 3 && scales().split(',').every((value, i) =>
      Math.abs(Number(value) - [144.652, 145, 145.348][i]) < 1e-8));
    check('跨档切换共享自定义边缘贴图', api.getState().mapBuilds === builds
      && filterFor(card).querySelector('feImage').getAttribute('href') === href);
    api.setQuality('light');
    check('切回 light 保留参数且不增加贴图', scales() === '145' && api.getState().mapBuilds === builds);
    api.destroy();

    card.style.width = '800px'; card.style.height = '800px';
    api = createLiquidGlass({ root: host, quality: 'full' });
    const image = new Image(); image.src = filterFor(card).querySelector('feImage').getAttribute('href');
    await image.decode();
    check('大卡片使用降采样贴图', image.naturalWidth === 600 && image.naturalHeight === 600);
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 600;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 600, 600).data;
    const green = y => pixels[(y * 600 + 300) * 4 + 1];
    check('降采样后 30 CSS px 处仍有弯曲', green(22) !== 128);
    check('降采样后 50 CSS px 处已归零', green(37) === 128);
    api.destroy();

    const nativeContext = HTMLCanvasElement.prototype.getContext;
    const originalWarn = console.warn;
    let fallback;
    try {
      HTMLCanvasElement.prototype.getContext = () => null;
      // 本项故意触发绘图失败；只屏蔽这个同步测试期间的预期警告。
      console.warn = () => {};
      fallback = createLiquidGlass({ root: host, quality: 'light' });
    } finally {
      HTMLCanvasElement.prototype.getContext = nativeContext;
      console.warn = originalWarn;
    }
    api = fallback;
    check('Canvas 失败回退毛玻璃并释放滤镜', api.getState().frost === 1 && api.getState().filters === 0);
    api.destroy();
    api = createLiquidGlass({ root: host, quality: 'light' });
    check('绘图失败销毁后可以重新创建折射', api.getState().light === 1);
    const failed = results.filter(r => !r.ok).length;
    output.textContent += `\n\n${results.length - failed}/${results.length} 通过`;
    return { passed: results.length - failed, failed, skipped: 0, results };
  } finally { api?.destroy(); host.remove(); }
}
