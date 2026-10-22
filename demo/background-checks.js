// 背景副本的真实 DOM 回归；这些断言不代替 Firefox 的画面与帧耗时验收。
import { createLiquidGlass } from '../glass.js';
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
export async function runBackgroundChecks(output, background) {
  const results = [];
  const check = (name, ok) => {
    results.push({name,ok});
    output.textContent = results.map(r => (r.ok ? 'PASS ' : 'FAIL ') + r.name).join('\n');
  };
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:16px;top:16px;width:220px;height:120px;overflow:auto;opacity:0;pointer-events:none';
  const content = document.createElement('div'), card = document.createElement('div');
  content.style.height = '600px';card.className = 'lg-glass';card.dataset.liquidGlass = '';
  card.style.cssText = 'width:180px;height:100px;border:1px solid transparent';
  content.append(card);host.append(content);document.body.append(host);
  let api;
  try {
    api = createLiquidGlass({root:host,quality:'full',background});await frame();
    const layer = () => card.querySelector('[data-lg-background]');
    check('原型选择背景图路径',api.getState().renderer === 'background-image');
    check('手动 Full 实际开启',api.getState().full === 1);
    check('滤镜仅作用于背景副本',card.style.backdropFilter === 'none' && !!layer()?.querySelector('g[filter]'));
    const rect = card.getBoundingClientRect(), copy = layer()?.getBoundingClientRect();
    check('背景副本与边框外沿对齐',!!copy && Math.abs(copy.left-rect.left)<.6 && Math.abs(copy.top-rect.top)<.6);
    const scene = () => layer()?.querySelector('g > svg');
    check('背景采用视口坐标',Number(scene()?.getAttribute('x')) === -rect.left
      && Number(scene()?.getAttribute('width')) === document.documentElement.clientWidth);
    const filterId = /#([^"')]+)/.exec(layer().querySelector('g[filter]').getAttribute('filter'))?.[1];
    const filter = document.getElementById(filterId);
    const channels = [...filter.querySelectorAll('feDisplacementMap')];
    check('原型 Full 实际包含三个位移通道',channels.length === 3);
    check('原型 Full 默认通道强度正确',channels.length === 3 && channels.every((node,i) =>
      Math.abs(Number(node.getAttribute('scale')) - [109.8152,110,110.1848][i]) < 1e-8));
    const image = new Image(); image.src = filter.querySelector('feImage').getAttribute('href');await image.decode();
    check('原型 Lens 贴图与面板尺寸一致',image.naturalWidth === Math.round(rect.width) && image.naturalHeight === Math.round(rect.height));
    const canvas = document.createElement('canvas');canvas.width = image.naturalWidth;canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
    const pixels = context.getImageData(0,0,canvas.width,canvas.height).data;
    const green = y => pixels[(y * canvas.width + Math.floor(canvas.width/2))*4+1];
    check('原型默认 15px Lens 像素正确',green(0) === 205 && green(10) === 133 && green(20) === 128);
    card.style.setProperty('--lg-image-tint-opacity','.55');
    check('通透叠色只降低装饰层透明度',Number(getComputedStyle(layer(),'::after').opacity) === .55
      && api.getState().full === 1 && getComputedStyle(card).opacity === '1');
    card.style.removeProperty('--lg-image-tint-opacity');
    const builds = api.getState().mapBuilds;
    host.scrollTop = 30;await frame();
    check('滚动中背景立即对齐',Math.abs(Number(scene()?.getAttribute('y')) + card.getBoundingClientRect().top)<.6);
    check('滚动时保持 Full 并复用贴图',api.getState().full === 1 && api.getState().mapBuilds === builds);
    api.setQuality('light');check('可切换 Light',api.getState().light === 1);
    api.setQuality('frost');check('毛玻璃移除背景副本',!layer() && api.getState().filters === 0);
    api.setQuality('full');await frame();host.scrollTop = 400;await frame();await frame();
    check('滚出容器释放副本',!layer() && api.getState().filters === 0);
    host.scrollTop = 0;await frame();await frame();
    check('滚回容器恢复 Full',!!layer() && api.getState().full === 1);
    api.destroy();
    check('销毁恢复原属性和装饰层',!layer() && !card.hasAttribute('data-lg-mode') && card.style.backdropFilter === '');
  } catch(error) {check('原型检查中断：'+error.message,false);}
  finally {api?.destroy();host.remove();}
  return {passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,skipped:0,results};
}
