// 参数回归自检：验证 optics 契约、位移贴图边缘宽度与光斑 CSS 变量。
// 浏览器 ES module，无第三方依赖；由页面或控制台导入后调用 runParameterChecks(output)。
import { createLiquidGlass } from '../glass.js';

const nextFrame = () => new Promise(resolve => {
  let settled = false, timer = 0;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve();
  };
  timer = setTimeout(finish, 250);
  requestAnimationFrame(() => requestAnimationFrame(finish));
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runParameterChecks(output) {
  const target = typeof output === 'string' ? document.getElementById(output) : output;
  const lines = [], results = [];
  const emit = text => {
    if (target) target.textContent = text;
    else console.log(text);
  };
  const record = (name, status, detail = '') => {
    results.push({ name, status, ok: status !== 'fail', detail });
    lines.push((status === 'pass' ? 'PASS ' : status === 'skip' ? 'SKIP ' : 'FAIL ')
      + name + (detail ? ' — ' + detail : ''));
    emit(lines.join('\n'));
  };
  const check = (name, ok, detail = '') => record(name, ok ? 'pass' : 'fail', ok ? '' : detail);
  const skip = (name, detail) => record(name, 'skip', detail);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-4000px;top:0;width:900px;pointer-events:none';
  const cssHost = document.createElement('div');
  cssHost.style.cssText = 'position:fixed;left:-4000px;top:0;width:400px;pointer-events:none';
  document.body.append(host, cssHost);

  let active = null, supportsFull = false;
  const closeActive = () => { active?.close(); active = null; };
  const mount = async (width, height, optics) => {
    const el = document.createElement('div');
    el.className = 'lg-glass';
    el.dataset.liquidGlass = '';
    el.style.cssText = 'width:' + width + 'px;height:' + height + 'px';
    host.append(el);
    const api = createLiquidGlass({ root: host, quality: 'full', ...(optics ? { optics } : {}) });
    await nextFrame();
    return { el, api, close() { api.destroy(); el.remove(); } };
  };
  const filterOf = el => {
    const style = getComputedStyle(el);
    const value = style.backdropFilter || style.webkitBackdropFilter || '';
    const id = /url\(["']?#([^"')]+)["']?\)/.exec(value)?.[1];
    return id ? document.getElementById(id) : null;
  };
  const readMap = async (filter, width, height) => {
    const href = filter?.querySelector('feImage')?.getAttribute('href');
    if (!href) return null;
    const image = new Image();
    image.src = href;
    await image.decode();
    if (image.naturalWidth !== width || image.naturalHeight !== height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, width, height).data;
  };
  const green = (data, width, x, y) => data[(y * width + x) * 4 + 1];
  const opticsRun = async (width, height, optics) => {
    closeActive();
    active = await mount(width, height, optics);
    const mode = active.el.dataset.lgMode;
    const rect = active.el.getBoundingClientRect();
    const mapWidth = Math.round(rect.width), mapHeight = Math.round(rect.height);
    if (mode !== 'full') return { mode, scales: [], map: null, width: mapWidth, height: mapHeight };
    const filter = filterOf(active.el);
    const scales = filter
      ? [...filter.querySelectorAll('feDisplacementMap')].map(node => node.getAttribute('scale'))
      : [];
    return { mode, scales, map: filter ? await readMap(filter, mapWidth, mapHeight) : null,
      width: mapWidth, height: mapHeight };
  };

  try {
    // 1. 参数校验必须发生在任何资源创建之前。
    const defsBefore = document.querySelectorAll('[data-lg-defs]').length;
    const rejected = [
      ['refraction 字符串', { refraction: '96' }],
      ['refraction NaN', { refraction: NaN }],
      ['dispersion Infinity', { dispersion: Infinity }],
      ['edgeWidth null', { edgeWidth: null }],
      ['optics 非对象', null],
    ];
    for (const [name, optics] of rejected) {
      let thrown = null, accidental = null;
      try { accidental = createLiquidGlass({ root: host, optics }); }
      catch (error) { thrown = error; }
      accidental?.destroy();
      check('TypeError: ' + name, thrown instanceof TypeError, thrown ? thrown.constructor.name : '未抛出');
    }
    check('拒绝发生在创建 SVG 之前', document.querySelectorAll('[data-lg-defs]').length === defsBefore);

    // 2. 默认值与位移贴图。
    const base = await opticsRun(300, 200);
    supportsFull = base.mode === 'full';
    if (!supportsFull) {
      skip('optics 与位移贴图检查', '当前环境回退为 ' + base.mode + '，未执行 Full 路径');
    } else {
      check('默认光学强度 82/96/110', base.scales.join(',') === '82,96,110', base.scales.join(',') || '缺少滤镜');
      if (!base.map) {
        skip('默认位移贴图', '贴图不可解码或不是 1:1');
      } else {
        const middle = Math.floor(base.width / 2);
        check('默认 58px 边缘带在 40px 处生效', green(base.map, base.width, middle, 40) !== 128);
        check('默认 58px 边缘带在 70px 处归零', green(base.map, base.width, middle, 70) === 128);
        const center = (Math.floor(base.height / 2) * base.width + middle) * 4;
        check('贴图中心与 Alpha 保持中性', base.map[center] === 128 && base.map[center + 1] === 128
          && base.map[center + 2] === 128 && base.map[center + 3] === 255);
      }

      const explicit = await opticsRun(300, 200, { refraction: 96, dispersion: 14, edgeWidth: 58 });
      check('显式默认值强度一致', explicit.scales.join(',') === '82,96,110', explicit.scales.join(','));
      check('显式默认值复现默认贴图', !!explicit.map && !!base.map
        && explicit.map.length === base.map.length
        && explicit.map.every((value, index) => value === base.map[index]));

      const narrow = await opticsRun(300, 200, { edgeWidth: 30 });
      if (!narrow.map) skip('edgeWidth 30', '贴图不可解码');
      else {
        const middle = Math.floor(narrow.width / 2);
        check('edgeWidth 30 在 20px 处生效', green(narrow.map, narrow.width, middle, 20) !== 128);
        check('edgeWidth 30 在 40px 处归零', green(narrow.map, narrow.width, middle, 40) === 128);
      }

      const tiny = await opticsRun(300, 200, { edgeWidth: 0 });
      if (!tiny.map) skip('edgeWidth 下限', '贴图不可解码');
      else {
        const middle = Math.floor(tiny.width / 2);
        check('edgeWidth 0 被钳制为 1px', green(tiny.map, tiny.width, middle, 0) !== 128
          && green(tiny.map, tiny.width, middle, 3) === 128);
      }

      const wide = await opticsRun(500, 700, { edgeWidth: 999 });
      if (!wide.map) skip('edgeWidth 上限', '贴图不可解码或不是 1:1');
      else {
        const middle = Math.floor(wide.width / 2);
        check('edgeWidth 999 被钳制为 120px', green(wide.map, wide.width, middle, 110) !== 128
          && green(wide.map, wide.width, middle, 150) === 128);
      }

      const noRefraction = await opticsRun(300, 200, { refraction: -50, dispersion: 0 });
      check('refraction 下限钳制为 0', noRefraction.scales.join(',') === '0,0,0', noRefraction.scales.join(','));
      const maxRefraction = await opticsRun(300, 200, { refraction: 999, dispersion: 0 });
      check('refraction 上限钳制为 200', maxRefraction.scales.join(',') === '200,200,200', maxRefraction.scales.join(','));
      const maxDispersion = await opticsRun(300, 200, { refraction: 0, dispersion: 999 });
      check('dispersion 上限钳制为 50', maxDispersion.scales.join(',') === '0,0,50', maxDispersion.scales.join(','));
    }

    // 3. 光斑与高光的 CSS 变量（纯 CSS 层，不依赖 Full 路径）。
    const cssCard = document.createElement('div');
    cssCard.className = 'lg-glass';
    cssCard.style.cssText = 'width:300px;height:200px';
    cssHost.append(cssCard);
    const pseudo = name => getComputedStyle(cssCard, name);
    const ellipse = (value, width, height) => new RegExp(width + 'px\\s+' + height + 'px').test(value);
    const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce)').matches;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedTransparency) {
      skip('光斑与高光 CSS 变量', '系统要求减少透明度，装饰伪元素已隐藏');
    } else {
      if (reducedMotion) {
        skip('光斑 CSS 变量', '系统要求减少动画，光斑已隐藏');
      } else {
        check('光斑默认尺寸 210×130', ellipse(pseudo('::before').backgroundImage, 210, 130),
          pseudo('::before').backgroundImage);
        cssCard.style.setProperty('--lg-glow-width', '320px');
        cssCard.style.setProperty('--lg-glow-height', '90px');
        check('光斑尺寸可覆盖', ellipse(pseudo('::before').backgroundImage, 320, 90));
        cssCard.dataset.pointerLight = 'true';
        await wait(180);
        check('光斑默认不透明度为 1', Number(pseudo('::before').opacity) === 1, pseudo('::before').opacity);
        cssCard.style.setProperty('--lg-glow-opacity', '.5');
        await wait(180);
        check('光斑不透明度可覆盖', Math.abs(Number(pseudo('::before').opacity) - .5) < .01,
          pseudo('::before').opacity);
        cssCard.dataset.pointerLight = 'false';
        await wait(180);
        check('隐藏状态的光斑不透明度为 0', Number(pseudo('::before').opacity) === 0, pseudo('::before').opacity);
      }
      check('高光默认不透明度为 1', Number(pseudo('::after').opacity) === 1, pseudo('::after').opacity);
      cssCard.style.setProperty('--lg-rim-opacity', '.35');
      await wait(30);
      check('高光不透明度可覆盖', Math.abs(Number(pseudo('::after').opacity) - .35) < .01,
        pseudo('::after').opacity);
      cssCard.style.removeProperty('--lg-glow-width'); cssCard.style.removeProperty('--lg-glow-height');
      cssCard.style.removeProperty('--lg-rim-opacity');
      cssHost.style.setProperty('--lg-glow-width', '280px'); cssHost.style.setProperty('--lg-rim-opacity', '.45');
      check('容器级材质变量可以继承', ellipse(pseudo('::before').backgroundImage, 280, 130)
        && Math.abs(Number(pseudo('::after').opacity) - .45) < .01);
    }

    // 4. 指针退出仍会取消尚未绘制的光斑；自定义不透明度不改变隐藏状态。
    if (reducedMotion) {
      skip('指针退出回归', '系统要求减少动画，光斑逻辑按设计停用');
    } else {
      closeActive();
      active = await mount(300, 200);
      const card = active.el;
      card.style.setProperty('--lg-glow-opacity', '.5');
      card.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse', clientX: 20, clientY: 20 }));
      await nextFrame();
      check('移入显示光斑', card.dataset.pointerLight === 'true');
      card.dispatchEvent(new PointerEvent('pointerleave'));
      await nextFrame();
      check('移出立即取消待绘制光斑', card.dataset.pointerLight === 'false');
      await wait(180);
      check('移出后光斑不透明度归零', Number(getComputedStyle(card, '::before').opacity) === 0,
        getComputedStyle(card, '::before').opacity);
    }
  } catch (error) {
    record('参数自检未抛出异常', 'fail', error?.message || String(error));
  } finally {
    closeActive();
    cssHost.remove();
    host.remove();
  }

  const passed = results.filter(result => result.status === 'pass').length;
  const failed = results.filter(result => result.status === 'fail').length;
  const skipped = results.filter(result => result.status === 'skip').length;
  lines.push('\n' + passed + '/' + (passed + failed) + ' 通过'
    + (skipped ? '，' + skipped + ' 跳过' : '') + '；Full 路径：' + (supportsFull ? '已执行' : '环境回退'));
  emit(lines.join('\n'));
  return { passed, failed, skipped, fullPath: supportsFull, results };
}
