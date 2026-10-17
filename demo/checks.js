// 浏览器内本地自检：不读取业务配置，不联网，不使用第三方测试库。
import { createLiquidGlass } from '../glass.js';
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
export async function runChecks(output) {
  const lines = [], results = [];
  const check = (name, ok) => {
    results.push({ name, ok }); lines.push((ok ? 'PASS ' : 'FAIL ') + name);
    output.textContent = lines.join('\n');
  };
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-4000px;top:0;width:640px;pointer-events:none';
  const card = document.createElement('div');
  card.className = 'lg-glass'; card.dataset.liquidGlass = '';
  card.style.cssText = 'width:300px;height:200px;--lg-mx:17%;backdrop-filter:blur(2px)';
  host.append(card); document.body.append(host);
  const beforeDefs = document.querySelectorAll('[data-lg-defs]').length;
  let api;
  try {
    api = createLiquidGlass({ root: host, quality: 'full' });
    const initial = api.getState(), supportsFull = initial.full === 1;
    check('挂载一个元素', initial.elements === 1);
    api.refresh(); api.refresh();
    check('不变尺寸 refresh 不重建贴图', api.getState().mapBuilds === initial.mapBuilds);
    for (let i = 0; i < 50; i++) { api.setQuality('frost'); api.setQuality('full'); }
    check('切换 100 次滤镜数量稳定', api.getState().filters === initial.filters);
    check('切换复用缓存贴图', api.getState().mapBuilds === initial.mapBuilds);
    api.setQuality('solid');
    check('纯色关闭 SVG 滤镜', card.dataset.lgMode === 'solid' && api.getState().filters === 0);
    api.setQuality('frost');
    check('毛玻璃模式正确', card.dataset.lgMode === (matchMedia('(prefers-reduced-transparency: reduce)').matches ? 'solid' : 'frost'));
    api.setQuality('full');
    check('兼容回退可用', ['full', 'frost', 'solid'].includes(card.dataset.lgMode));
    card.dispatchEvent(new PointerEvent('pointerenter', { clientX: 80, clientY: 70, pointerType: 'mouse' }));
    await nextFrame();
    const canAnimate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    check('移入显示光斑或尊重减少动画偏好', card.dataset.pointerLight === String(canAnimate));
    const lastX = card.style.getPropertyValue('--lg-mx');
    card.dispatchEvent(new PointerEvent('pointerleave'));
    await nextFrame();
    check('移出隐藏且不重置坐标', card.dataset.pointerLight === 'false' && card.style.getPropertyValue('--lg-mx') === lastX);
    card.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 90, clientY: 80 }));
    card.dispatchEvent(new PointerEvent('pointerleave'));
    await nextFrame();
    check('取消尚未绘制的光斑', card.dataset.pointerLight === 'false');
    card.style.width = '1500px'; card.style.height = '1000px'; api.refresh();
    check('超大面积回退', card.dataset.lgMode !== 'full' && api.getState().filters === 0);
    card.style.width = '320px'; card.style.height = '220px'; api.refresh();
    check('缩小后恢复候选模式', api.getState().full === (supportsFull ? 1 : 0));
    const extra = card.cloneNode(false); host.append(extra); api.refresh();
    check('动态挂载', api.getState().elements === 2);
    const builds = api.getState().mapBuilds;
    for (let i = 0; i < 12; i++) { card.style.width = (330 + i) + 'px'; api.refresh(); }
    check('贴图缓存有上限', api.getState().cachedMaps <= 8 && api.getState().mapBuilds >= builds);
    extra.remove(); api.refresh();
    check('动态移除释放滤镜', api.getState().elements === 1 && api.getState().filters <= 1);
    card.remove(); api.refresh();
    check('移除全部元素后无滤镜', api.getState().elements === 0 && api.getState().filters === 0);
    host.append(card); api.refresh(); api.destroy(); api.destroy();
    check('destroy 幂等并移除 SVG/缓存', api.getState().disposed && api.getState().elements === 0
      && api.getState().cachedMaps === 0 && document.querySelectorAll('[data-lg-defs]').length === beforeDefs);
    check('恢复原 inline 样式和属性', card.style.getPropertyValue('--lg-mx') === '17%'
      && card.style.backdropFilter === 'blur(2px)' && !card.hasAttribute('data-lg-mode') && !card.hasAttribute('data-pointer-light'));
    card.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse', clientX: 10, clientY: 10 }));
    await nextFrame();
    check('destroy 移除鼠标监听器', !card.hasAttribute('data-pointer-light'));
    const second = createLiquidGlass({ root: host, quality: 'frost' });
    check('销毁后可以重新挂载', second.getState().elements === 1); second.destroy();
    const failed = results.filter(result => !result.ok).length;
    lines.push('\n' + (results.length - failed) + '/' + results.length + ' 通过；Full 路径：' + (supportsFull ? '已执行' : '环境回退，未覆盖'));
    output.textContent = lines.join('\n');
    return { passed: results.length - failed, failed, fullPath: supportsFull, results };
  } finally { api?.destroy(); host.remove(); }
}
