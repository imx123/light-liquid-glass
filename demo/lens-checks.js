// Lens 光学回归：读取真实 PNG，并检查受控色散的基准混合与档位切换。
import { createLiquidGlass } from '../glass.js';
const filterOf = el => document.getElementById(/url\(["']?#([^"')]+)["']?\)/.exec(el.style.backdropFilter)?.[1]);
export async function runLensChecks(output) {
  const results = [];
  const check = (name, ok) => {
    results.push({ name, ok });
    output.textContent = results.map(r => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}`).join('\n');
  };
  const defsBefore = document.querySelectorAll('[data-lg-defs]').length;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-4000px;top:0;width:320px';
  const card = document.createElement('div');
  card.className = 'lg-glass'; card.dataset.liquidGlass = '';
  card.style.cssText = 'width:320px;height:220px;border-radius:28px';
  host.append(card); document.body.append(host);
  let api;
  try {
    api = createLiquidGlass({ root: host, quality: 'full' });
    check('唯一光学模型为 Lens', api.getState().opticalModel === 'lens');
    if (api.getState().full !== 1) {
      output.textContent += '\nSKIP Full Lens SVG 检查：当前实际模式未启用 Full';
      results.push({name:'Full Lens SVG 检查',ok:true,skipped:true,detail:'原生背景滤镜未启用 Full，未使用背景图原型'});
      return { results, passed: 1, failed: 0, skipped: 1 };
    }
    const image = new Image(); image.src = filterOf(card).querySelector('feImage').getAttribute('href');
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 220;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, 320, 220).data;
    const green = y => pixels[(y * 320 + 160) * 4 + 1];
    // 像素中心距边缘 .5px / 10.5px，带宽 15px，固定样本验证默认弧面。
    check('Lens 外缘采样符合圆形曲线', green(0) === 205);
    check('Lens 中段采样迅速收敛', green(10) === 133);
    const scales = () => [...filterOf(card).querySelectorAll('feDisplacementMap')].map(n => Number(n.getAttribute('scale')));
    const blend = () => filterOf(card).lastElementChild;
    const full = scales();
    check('默认色散保持绿色基准且总分离低于 0.37', full.length === 3 && full[0] < 110 && full[1] === 110 && full[2] > 110 && full[2] - full[0] < .37);
    check('默认只混入 5.6% RGB 色散', blend().getAttribute('in') === 'shift1' && blend().getAttribute('in2') === 'rgb'
      && Math.abs(Number(blend().getAttribute('k3')) - .056) < 1e-8
      && Math.abs(Number(blend().getAttribute('k2')) - .944) < 1e-8);
    const builds = api.getState().mapBuilds;
    api.setQuality('light');
    check('Light 仅保留基准位移', scales().length === 1 && scales()[0] === 110 && !filterOf(card).querySelector('feComposite'));
    api.setQuality('full');
    check('切回 Full 恢复受控混合且复用贴图', blend().getAttribute('in') === 'shift1' && api.getState().mapBuilds === builds);
    api.destroy(); api = createLiquidGlass({ root: host, quality: 'full', optics: { dispersion: 0 } });
    check('零色散完全使用基准画面', scales().every(scale => scale === 110) && Number(blend().getAttribute('k3')) === 0);
    api.destroy(); api = createLiquidGlass({ root: host, quality: 'full', optics: { dispersion: 50 } });
    const max = scales();
    check('最高色散总分离不超过 1.32 且混入 20%', max.length === 3 && Math.abs(max[2] - max[0] - 1.32) < 1e-8
      && Number(blend().getAttribute('k3')) === .2 && Number(blend().getAttribute('k2')) === .8);
  } catch (error) { check('Lens 自检无未处理异常：' + error.message, false); }
  finally { api?.destroy(); host.remove(); }
  check('Lens 自检结束后 SVG 数量恢复', document.querySelectorAll('[data-lg-defs]').length === defsBefore);
  const failed = results.filter(r => !r.ok).length;
  return { results, passed: results.length - failed, failed, skipped: 0 };
}
