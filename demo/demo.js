import { createLiquidGlass } from '../glass.js';
import { runChecks } from './checks.js';
const $ = id => document.getElementById(id);
const storageKey = 'liquid-glass-v2-demo-quality';
let saved = 'auto';
try { const value = localStorage.getItem(storageKey); if (['auto', 'full', 'frost', 'solid'].includes(value)) saved = value; } catch {}
$('quality').value = saved;
const glass = createLiquidGlass({ quality: saved, root: document.querySelector('main'), onChange(state) {
  document.documentElement.dataset.demoQuality = state.quality;
  $('state').textContent = state.full ? '液态折射 + RGB 色散 · ' + state.full + ' 个玻璃面板'
    : state.solid ? '纯色模式 · 透明效果关闭' : '毛玻璃 · 兼容模式';
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
  try { await runChecks($('check-results')); }
  catch (error) { $('check-results').textContent = 'FAIL: ' + error.message; }
  finally { $('checks').disabled = false; }
});
window.addEventListener('pagehide', () => glass.destroy());
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
