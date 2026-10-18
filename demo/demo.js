import { createLiquidGlass } from '../glass.js';
import { runChecks } from './checks.js';
import { runLifecycleChecks } from './lifecycle-checks.js';
const $ = id => document.getElementById(id);
const storageKey = 'liquid-glass-v2-demo-quality';
let saved = 'auto';
try { const value = localStorage.getItem(storageKey); if (['auto', 'full', 'light', 'frost', 'solid'].includes(value)) saved = value; } catch {}
$('quality').value = saved;
const glass = createLiquidGlass({ quality: saved, root: document.querySelector('main'), onChange(state) {
  document.documentElement.dataset.demoQuality = state.quality;
  const layers = [];
  if (state.full) layers.push('液态折射 ' + state.full);
  if (state.light) layers.push('轻量折射 ' + state.light);
  $('state').textContent = layers.length ? layers.join(' · ') + ' · 共 ' + state.elements + ' 个玻璃面板'
    : state.solid ? '纯色模式 · 透明效果关闭' : '毛玻璃 · 兼容模式 · ' + state.elements + ' 个玻璃面板';
}});
$('quality').addEventListener('change', () => {
  glass.setQuality($('quality').value);
  try { localStorage.setItem(storageKey, $('quality').value); } catch {}
});
$('action').addEventListener('click', () => { $('action-status').textContent = '按钮工作正常，玻璃装饰层没有拦截点击。'; });
let added = 0;
$('add-card').addEventListener('click', () => {
  const el = document.createElement('article');
  el.className = 'card lg-glass'; el.dataset.liquidGlass = ''; el.dataset.extra = '';
  const title = document.createElement('h2'); title.textContent = '新卡片 ' + ++added;
  const text = document.createElement('p'); text.textContent = '调用 refresh() 后接入，共用同一个尺寸观察器。';
  el.append(title, text); $('cards').append(el); glass.refresh();
});
$('remove-card').addEventListener('click', () => {
  $('cards').querySelector('[data-extra]:last-child')?.remove(); glass.refresh();
});
$('checks').addEventListener('click', async () => {
  $('checks').disabled = true;
  const output = $('check-results'), summaries = [], failures = [];
  let passed = 0, failed = 0, skipped = 0;
  delete output.dataset.passed; delete output.dataset.failed; delete output.dataset.skipped;
  try {
    const { runParameterChecks } = await import('./parameters-checks.js');
    const { runQualityChecks } = await import('./quality-checks.js');
    const { runIntegrationChecks } = await import('./integration-checks.js');
    const { runLensChecks } = await import('./lens-checks.js');
    for (const [name, run] of [['基础检查', runChecks], ['异常清理', runLifecycleChecks],
      ['效果参数', runParameterChecks], ['轻量档与 Auto', runQualityChecks], ['集成检查', runIntegrationChecks], ['Lens 光学', runLensChecks]]) {
      output.textContent = '正在运行：' + name;
      const result = await run(output);
      passed += result.passed; failed += result.failed; skipped += result.skipped || 0;
      summaries.push(`${name}：${result.passed}/${result.passed + result.failed} 通过`
        + (result.skipped ? `，${result.skipped} 跳过` : ''));
      for (const item of result.results.filter(r => !r.ok)) failures.push(name + ' / ' + item.name + (item.detail ? '：' + item.detail : ''));
    }
    output.dataset.passed = passed; output.dataset.failed = failed; output.dataset.skipped = skipped;
    output.textContent = summaries.join('\n') + `\n\n合计：${passed}/${passed + failed} 通过，${skipped} 跳过`
      + (failures.length ? '\n' + failures.join('\n') : '');
  } catch (error) { output.textContent = 'FAIL: ' + error.message; output.dataset.failed = String(failed + 1); }
  finally { $('checks').disabled = false; }
});
window.addEventListener('pagehide', () => glass.destroy());
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
