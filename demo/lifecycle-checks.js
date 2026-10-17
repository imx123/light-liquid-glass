// 故障注入覆盖初始化回滚：只对独立测试元素操作，不访问业务数据。
import { createLiquidGlass } from '../glass.js';
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
export async function runLifecycleChecks(output) {
  const results = [];
  const check = (name, ok) => {
    results.push({ name, ok });
    output.textContent = results.map(r => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}`).join('\n');
  };
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-4000px;top:0;pointer-events:none';
  const card = document.createElement('div');
  card.className = 'lg-glass'; card.dataset.liquidGlass = '';
  card.style.cssText = 'width:300px;height:200px;--lg-mx:17%;backdrop-filter:blur(2px)!important';
  card.setAttribute('data-lg-mode', 'original'); card.setAttribute('data-pointer-light', 'original');
  host.append(card); document.body.append(host);
  const defsBefore = document.querySelectorAll('[data-lg-defs]').length;
  const originalStyle = card.getAttribute('style');
  let api;
  try {
    const failure = new Error('expected callback failure');
    let caught;
    try {
      createLiquidGlass({ root: host, quality: 'full', onChange() {
        card.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse', clientX: 20, clientY: 20 }));
        throw failure;
      } });
    } catch (error) { caught = error; }
    check('首次回调失败保留原异常', caught === failure);
    await nextFrame();
    check('初始化失败移除 SVG', document.querySelectorAll('[data-lg-defs]').length === defsBefore);
    check('初始化失败恢复样式与优先级', card.getAttribute('style') === originalStyle
      && card.style.getPropertyPriority('backdrop-filter') === 'important');
    check('初始化失败恢复属性并取消待绘制光斑', card.dataset.lgMode === 'original' && card.dataset.pointerLight === 'original');
    card.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 50, clientY: 50 }));
    await nextFrame();
    check('初始化失败解除鼠标监听器', card.dataset.pointerLight === 'original');
    const NativeObserver = window.ResizeObserver;
    let disconnected = 0, observeFailure;
    try {
      window.ResizeObserver = class extends NativeObserver {
        observe() { throw failure; }
        disconnect() { disconnected++; super.disconnect(); }
      };
      try { createLiquidGlass({ root: host }); } catch (error) { observeFailure = error; }
    } finally { window.ResizeObserver = NativeObserver; }
    check('挂载中途失败断开观察器并回滚', observeFailure === failure && disconnected === 1
      && card.dataset.lgMode === 'original' && card.dataset.pointerLight === 'original');
    api = createLiquidGlass({ root: host, quality: 'frost' });
    check('初始化失败释放元素所有权', api.getState().elements === 1);
    api.destroy();

    for (const [name, options] of [['root', { root: null }], ['onChange', { root: host, onChange: null }]]) {
      let invalid = false;
      try { createLiquidGlass(options); } catch (error) { invalid = error instanceof TypeError; }
      check(`非法 ${name} 在挂载前拒绝`, invalid && card.dataset.lgMode === 'original'
        && document.querySelectorAll('[data-lg-defs]').length === defsBefore);
    }
    let queryFailure;
    try { createLiquidGlass({ root: { querySelectorAll() { throw failure; } } }); }
    catch (error) { queryFailure = error; }
    check('扫描异常也可回滚', queryFailure === failure && document.querySelectorAll('[data-lg-defs]').length === defsBefore);

    let notifications = 0;
    api = createLiquidGlass({ root: host, quality: 'full', onChange() { if (++notifications > 1) throw failure; } });
    let refreshFailure;
    try { api.refresh(); } catch (error) { refreshFailure = error; }
    api.destroy(); api.destroy();
    check('后续回调异常仍可显式销毁', refreshFailure === failure && api.getState().disposed
      && card.dataset.lgMode === 'original' && document.querySelectorAll('[data-lg-defs]').length === defsBefore);
    const failed = results.filter(r => !r.ok).length;
    output.textContent += `\n\n${results.length - failed}/${results.length} 通过`;
    return { passed: results.length - failed, failed, results };
  } finally { api?.destroy(); host.remove(); }
}
