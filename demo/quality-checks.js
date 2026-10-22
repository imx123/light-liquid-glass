// 浏览器内质量自检：light 单次位移、full/light 切换缓存、Auto 预算与滚动恢复。
// 与 checks.js 分离，不影响原有 20 项基础自检。
import { createLiquidGlass } from '../glass.js';

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const tagNames = node => node ? [...node.children].map(child => child.tagName.toLowerCase()) : [];
const filterFor = el => {
  const match = /url\(["']?#([^"')]+)["']?\)/.exec(el.style.getPropertyValue('backdrop-filter'));
  return match ? document.getElementById(match[1]) : null;
};
const clippedArea = el => {
  const rect = el.getBoundingClientRect();
  const width = Math.min(rect.right, innerWidth) - Math.max(rect.left, 0);
  const height = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
  return width > 0 && height > 0 ? width * height : 0;
};
const makeCard = css => {
  const el = document.createElement('div');
  el.className = 'lg-glass'; el.dataset.liquidGlass = ''; el.style.cssText = css;
  return el;
};

export async function runQualityChecks(output) {
  const fallbackMode = matchMedia('(prefers-reduced-transparency: reduce)').matches ? 'solid' : 'frost';
  const lines = [], results = [], cleanups = [];
  const emit = () => { if (output) output.textContent = lines.join('\n'); };
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, ...(detail && !ok ? { detail } : {}) });
    lines.push((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? ' — ' + detail : ''));
    emit();
  };
  const skip = (name, reason) => {
    results.push({ name, ok: true, skipped: true, detail: reason });
    lines.push('SKIP ' + name + ' — ' + reason); emit();
  };
  let supportsLight = false, mobileLight = false;

  try {
    const selector = document.getElementById('quality');
    if (selector) check('演示选择框包含 light', [...selector.options].some(option => option.value === 'light'));
    else skip('演示选择框包含 light', '不在演示页运行');

    // 1. light 滤镜结构、离屏手动模式、指针光斑、full/light 重建与共享缓存。
    {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-4000px;top:0;width:640px;pointer-events:none';
      const card = makeCard('width:300px;height:200px;--lg-mx:17%;backdrop-filter:blur(2px)');
      host.append(card); document.body.append(host);
      const api = createLiquidGlass({ root: host, quality: 'light' });
      cleanups.push(() => { api.destroy(); host.remove(); });
      const initial = api.getState();
      mobileLight = initial.compatibility === 'android-light-experimental';
      supportsLight = card.dataset.lgMode === 'light';
      if (supportsLight) {
        check('手动 light 对离屏面板生效', initial.light === 1 && initial.filters === 1);
        const lightFilter = filterFor(card), primitives = tagNames(lightFilter);
        check('light 只有一个 feImage 与一个 feDisplacementMap',
          primitives.length === 2 && primitives[0] === 'feimage' && primitives[1] === 'fedisplacementmap',
          primitives.join(','));
        const displacement = lightFilter?.querySelector('feDisplacementMap');
        check('light 单次采样 SourceGraphic 且 scale=110',
          displacement?.getAttribute('in') === 'SourceGraphic' && displacement?.getAttribute('in2') === 'map'
          && displacement?.getAttribute('scale') === '110' && displacement?.getAttribute('xChannelSelector') === 'R'
          && displacement?.getAttribute('yChannelSelector') === 'G');
        check('light 不做通道拆分或颜色合成',
          !lightFilter?.querySelector('feColorMatrix') && !lightFilter?.querySelector('feComposite'));
        check('light 复用生成的弧面位图',
          (lightFilter?.querySelector('feImage')?.getAttribute('href') || '').startsWith('data:image/png'));
      } else {
        check('light 在回退环境尊重透明度偏好', card.dataset.lgMode === fallbackMode && initial.light === 0);
        skip('light 滤镜结构', '当前环境不支持 backdrop-filter 位移路径');
      }

      card.dispatchEvent(new PointerEvent('pointerenter', { clientX: 80, clientY: 70, pointerType: 'mouse' }));
      await nextFrame();
      const canAnimate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      check('light 保留指针光斑', card.dataset.pointerLight === String(canAnimate));
      card.dispatchEvent(new PointerEvent('pointerleave'));
      await nextFrame();

      if (supportsLight) {
        const builds = api.getState().mapBuilds;
        api.setQuality('full');
        const fullFilter = filterFor(card), fullPrimitives = tagNames(fullFilter);
        check(mobileLight ? '安卓 full 请求保持单次折射' : '切到 full 重建 Lens 三通道与基准混合滤镜',
          mobileLight ? card.dataset.lgMode === 'light' && fullPrimitives.length === 2
          : card.dataset.lgMode === 'full' && fullPrimitives.length === 10
          && fullFilter?.querySelectorAll('feDisplacementMap').length === 3
          && fullFilter?.querySelectorAll('feColorMatrix').length === 3
          && fullFilter?.querySelectorAll('feComposite').length === 3, fullPrimitives.join(','));
        check('full 沿用同一张缓存位图', api.getState().mapBuilds === builds);
        api.setQuality('light');
        const rebuilt = filterFor(card), rebuiltPrimitives = tagNames(rebuilt);
        check('切回 light 重建单采样滤镜',
          card.dataset.lgMode === 'light' && rebuiltPrimitives.length === 2
          && !rebuilt?.querySelector('feColorMatrix') && !rebuilt?.querySelector('feComposite'),
          rebuiltPrimitives.join(','));
        check('light 切回仍复用位图缓存', api.getState().mapBuilds === builds);
        check('模式切换只保留一个滤镜', api.getState().filters === 1);
      } else {
        skip('full/light 模式切换', '当前环境不支持 backdrop-filter 位移路径');
      }

      card.dataset.liquidGlass = 'frost'; api.setQuality('auto');
      check('元素级 frost 在 auto 下正确回退', card.dataset.lgMode === fallbackMode && api.getState().filters === 0);
      card.dataset.liquidGlass = ''; api.setQuality('light');
      check('恢复标记后 light 可重建', !supportsLight || card.dataset.lgMode === 'light');

      card.style.width = '1500px'; card.style.height = '1000px'; api.setQuality('light');
      check('light 保留 120 万 CSS 像素安全上限', card.dataset.lgMode === fallbackMode && api.getState().filters === 0);
      card.style.width = '300px'; card.style.height = '200px'; api.setQuality('light');
      check('缩小后 light 恢复', !supportsLight || card.dataset.lgMode === 'light');
    }

    // 2. Auto 数量预算：四块等面积可见面板只给三块 Full。
    {
      window.scrollTo(0, 0);
      await nextFrame();
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;opacity:0;z-index:-1';
      const cards = [];
      for (let index = 0; index < 4; index++) {
        const card = makeCard('position:absolute;left:' + (index % 2) * 120 + 'px;top:' + Math.floor(index / 2) * 120
          + 'px;width:100px;height:100px');
        cards.push(card); host.append(card);
      }
      document.body.append(host);
      const api = createLiquidGlass({ root: host, quality: 'auto' });
      cleanups.push(() => { api.destroy(); host.remove(); });
      const modes = () => cards.map(card => card.dataset.lgMode);
      const count = mode => modes().filter(value => value === mode).length;
      if (supportsLight) {
        check(mobileLight ? '安卓 auto 不分配三通道 Full' : 'auto 只分配 3 个 Full 面板', count('full') === (mobileLight ? 0 : 3), modes().join(','));
        check('其余可见面板使用 light', count('light') === (mobileLight ? 4 : 1) && count('frost') === 0, modes().join(','));
        check('同面积按 DOM 顺序确定性分配', modes().join(',') === (mobileLight ? 'light,light,light,light' : 'full,full,full,light'), modes().join(','));
      } else {
        check('auto 在回退环境尊重透明度偏好', count(fallbackMode) === 4 && count('full') === 0, modes().join(','));
      }
      const state = api.getState();
      check('getState 包含 light 计数', state.light === count('light'));
      const first = modes().join(',');
      api.refresh();
      check('重复 refresh 预算稳定', modes().join(',') === first);
      const fullArea = cards.filter(card => card.dataset.lgMode === 'full')
        .reduce((total, card) => total + clippedArea(card), 0);
      check('Full 总面积不超过 400000 CSS 像素', fullArea <= 400000, String(Math.round(fullArea)));
    }

    // 3. Auto 面积预算：两块各占大半屏时只有一块 Full；单块超过额度时降为 light。
    {
      window.scrollTo(0, 0);
      await nextFrame();
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;opacity:0;z-index:-1';
      const first = makeCard('position:absolute;left:0;top:0;width:500px;height:500px');
      const second = makeCard('position:absolute;left:0;top:0;width:500px;height:500px');
      host.append(first, second); document.body.append(host);
      const api = createLiquidGlass({ root: host, quality: 'auto' });
      cleanups.push(() => { api.destroy(); host.remove(); });
      const area = clippedArea(first);
      if (supportsLight && mobileLight) {
        check('安卓大面板仍只使用 light',first.dataset.lgMode==='light' && second.dataset.lgMode==='light');
      } else if (supportsLight && area > 200000) {
        check('单块超过一半额度后第二块改为 light',
          first.dataset.lgMode === 'full' && second.dataset.lgMode === 'light',
          first.dataset.lgMode + ',' + second.dataset.lgMode + ' area=' + Math.round(area));
      } else {
        skip('面积额度切分', supportsLight ? '视口裁剪面积 ' + Math.round(area) + ' 不足以覆盖额度' : '当前环境回退毛玻璃');
      }
      second.remove();
      first.style.width = '900px'; first.style.height = '600px'; api.refresh();
      const largeArea = clippedArea(first);
      if (supportsLight && largeArea > 400000) {
        check('单块超过 400000 像素额度时使用 light',
          first.dataset.lgMode === 'light' && api.getState().full === 0,
          first.dataset.lgMode + ' area=' + Math.round(largeArea));
      } else {
        skip('单块面积额度', supportsLight ? '视口裁剪面积 ' + Math.round(largeArea) + ' 未超过额度' : '当前环境回退毛玻璃');
      }
    }

    // 4. Auto 可见性：离屏 frost，滚动进入后自动刷新，滚出后恢复 frost。
    {
      window.scrollTo(0, 0);
      await nextFrame();
      const spacer = document.createElement('div');
      spacer.style.cssText = 'height:' + Math.max(2400, innerHeight * 3) + 'px;width:1px;pointer-events:none';
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:0;top:' + (innerHeight + 700)
        + 'px;width:320px;height:200px;pointer-events:none;opacity:0;z-index:-1';
      const card = makeCard('width:320px;height:200px');
      host.append(card); document.body.append(spacer, host);
      const api = createLiquidGlass({ root: host, quality: 'auto' });
      cleanups.push(() => { api.destroy(); host.remove(); spacer.remove(); window.scrollTo(0, 0); });
      check('auto 离屏候选面板正确回退', card.dataset.lgMode === fallbackMode);
      window.scrollTo(0, Math.max(0, host.offsetTop - 120));
      await wait(280); await nextFrame();
      check('滚动进入视口后自动恢复折射',
        !supportsLight || card.dataset.lgMode === 'full' || card.dataset.lgMode === 'light', card.dataset.lgMode);
      window.scrollTo(0, 0);
      await wait(280); await nextFrame();
      check('滚出视口后恢复毛玻璃', !supportsLight || card.dataset.lgMode === 'frost', card.dataset.lgMode);
    }
  } catch (error) {
    results.push({ name: '检查中断', ok: false, detail: error.message });
    lines.push('FAIL 检查中断 — ' + error.message); emit();
  } finally {
    for (const cleanup of cleanups.reverse()) { try { cleanup(); } catch {} }
  }

  const failed = results.filter(result => !result.ok).length;
  const skipped = results.filter(result => result.skipped).length;
  const executed = results.length - skipped;
  lines.push('\n' + (executed - failed) + '/' + executed + ' 通过'
    + (skipped ? '，' + skipped + ' 项因环境跳过' : '')
    + '；light 路径：' + (supportsLight ? '已执行' : '环境回退，未覆盖')
    + (mobileLight ? '；安卓 Full 请求限制为 Light' : ''));
  emit();
  return { passed: executed - failed, failed, skipped, lightPath: supportsLight, results };
}
