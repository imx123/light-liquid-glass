// Real-browser checks for the adaptive interaction path; not a GPU benchmark.
import { createLiquidGlass } from '../glass.js';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export async function runPerformanceChecks(output) {
  const results = [];
  const check = (name, ok) => {
    results.push({name,ok});
    output.textContent = results.map(r => (r.ok?'PASS ':'FAIL ') + r.name).join('\n');
  };
  const host = document.createElement('div');
  host.style.cssText='position:fixed;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none';
  const cards=[];
  let reads=0,api,changes;
  try {
    for(let i=0;i<4;i++) {
      const el=document.createElement('div');el.className='lg-glass';el.dataset.liquidGlass='';
      el.style.cssText='position:absolute;width:100px;height:100px;left:'+(i%2)*110+'px;top:'+Math.floor(i/2)*110+'px';
      const native=el.getBoundingClientRect;
      el.getBoundingClientRect=function(){reads++;return native.call(this);};
      cards.push(el);host.append(el);
    }
    document.body.append(host);
    api=createLiquidGlass({root:host,quality:'auto'});
    await wait(240);await frame();
    if(api.getState().full!==3 || api.getState().light!==1) {
      return {passed:0,failed:0,skipped:1,results:[{name:'交互性能路径',ok:true,skipped:true,detail:'折射不可用或视口不足'}]};
    }
    check('Auto 静止时仍使用 3 Full + 1 Light',true);
    changes=new MutationObserver(()=>{});changes.observe(host,{attributes:true,subtree:true});
    reads=0;api.refresh();
    check('稳定刷新每个面板只读取一次尺寸',reads===4);
    check('稳定刷新不重复写材质属性或样式',changes.takeRecords().length===0);
    const builds=api.getState().mapBuilds;
    reads=0;document.dispatchEvent(new Event('scroll'));await frame();
    check('Auto 滚动期间临时使用 Light',api.getState().light===4 && api.getState().quality==='auto');
    check('临时切换不读取尺寸或重算位图',reads===0 && api.getState().mapBuilds===builds);
    await wait(240);await frame();
    check('停止滚动后恢复原 Full 预算',api.getState().full===3 && api.getState().light===1);
    check('恢复完整效果复用原位图',api.getState().mapBuilds===builds);
    api.setQuality('full');await wait(240);reads=0;
    document.dispatchEvent(new Event('scroll'));await wait(240);await frame();
    check('手动 Full 滚动保持完整效果且不重新量尺寸',api.getState().full===4 && reads===0);
    api.setQuality('auto');window.dispatchEvent(new Event('resize'));await frame();
    check('Auto 拖窗路径同样临时轻量',api.getState().light===4);
    api.destroy();await wait(240);await frame();
    check('交互中销毁不留下滤镜或延后恢复',api.getState().disposed && api.getState().filters===0
      && cards.every(el=>!el.hasAttribute('data-lg-mode')));
  } catch(error) {check('检查未中断：'+error.message,false);}
  finally {changes?.disconnect();api?.destroy();host.remove();}
  const failed=results.filter(r=>!r.ok).length;
  return {passed:results.length-failed,failed,skipped:0,results};
}
