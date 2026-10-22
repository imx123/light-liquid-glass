// Real-browser checks for the adaptive interaction path; not a GPU benchmark.
import { createLiquidGlass } from '../glass.js';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
async function until(test) {
  const end = performance.now() + 2000;
  do { await frame(); if (test()) return true; } while (performance.now() < end);
  return false;
}

export async function runPerformanceChecks(output) {
  const results = [];
  const check = (name, ok) => {
    results.push({name,ok});
    output.textContent = results.map(r => (r.ok?'PASS ':'FAIL ') + r.name).join('\n');
  };
  const host = document.createElement('div');
  host.style.cssText='position:fixed;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none';
  const cards=[];
  let reads=0,api,changes,scrollHost,keepScrolling;
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
    const androidAutoLight=api.getState().compatibility==='android-experimental';
    if(androidAutoLight ? api.getState().light!==4 : api.getState().full!==3 || api.getState().light!==1) {
      return {passed:0,failed:0,skipped:1,results:[{name:'交互性能路径',ok:true,skipped:true,detail:'折射不可用或视口不足'}]};
    }
    check(androidAutoLight ? '安卓 Auto 静止时使用 Light' : 'Auto 静止时仍使用 3 Full + 1 Light',true);
    changes=new MutationObserver(()=>{});changes.observe(host,{attributes:true,subtree:true});
    reads=0;api.refresh();
    check('稳定刷新每个面板只读取一次尺寸',reads===4);
    check('稳定刷新不重复写材质属性或样式',changes.takeRecords().length===0);
    const builds=api.getState().mapBuilds;
    reads=0;document.dispatchEvent(new Event('scroll'));await frame();
    check('Auto 滚动期间临时使用 Light',api.getState().light===4 && api.getState().quality==='auto');
    check('临时切换不读取尺寸或重算位图',reads===0 && api.getState().mapBuilds===builds);
    await wait(240);await frame();
    check('停止滚动后恢复原质量预算',androidAutoLight ? api.getState().light===4 : api.getState().full===3 && api.getState().light===1);
    check('恢复完整效果复用原位图',api.getState().mapBuilds===builds);
    api.setQuality('full');await wait(240);reads=0;
    document.dispatchEvent(new Event('scroll'));await wait(240);await frame();
    check('手动 Full 滚动保持完整效果且不重新量尺寸',api.getState().full===4 && reads===0);
    api.setQuality('auto');window.dispatchEvent(new Event('resize'));await frame();
    check('Auto 拖窗路径同样临时轻量',api.getState().light===4);
    api.destroy();await wait(240);await frame();
    check('交互中销毁不留下滤镜或延后恢复',api.getState().disposed && api.getState().filters===0
      && cards.every(el=>!el.hasAttribute('data-lg-mode')));

    // 用真实滚动容器和 IntersectionObserver 覆盖“连续滚动到新卡片”。
    scrollHost=document.createElement('div');
    scrollHost.style.cssText='position:fixed;left:16px;top:16px;width:220px;height:120px;overflow:auto;opacity:0;pointer-events:none';
    const contents=document.createElement('div'),entering=document.createElement('div');
    const offscreenTop=Math.max(innerHeight+300,600);
    contents.style.cssText='position:relative;height:'+(offscreenTop+500)+'px';
    entering.className='lg-glass';entering.dataset.liquidGlass='';
    entering.style.cssText='position:absolute;left:0;top:'+offscreenTop+'px;width:160px;height:100px';
    contents.append(entering);scrollHost.append(contents);document.body.append(scrollHost);
    api=createLiquidGlass({root:scrollHost,quality:'auto'});
    await wait(240);await frame();
    check('离屏卡片初始化不生成滤镜或贴图',api.getState().filters===0 && api.getState().mapBuilds===0
      && entering.dataset.lgVisible==='false');
    const layoutHeight=scrollHost.scrollHeight;
    keepScrolling=setInterval(()=>document.dispatchEvent(new Event('scroll')),20);
    scrollHost.scrollTop=offscreenTop-40;
    check('连续滚动中刚进入的卡片立即使用 Light',await until(()=>entering.dataset.lgMode==='light'));
    check('进入时开启可见标记与折射滤镜',entering.dataset.lgVisible==='true' && api.getState().filters===1);
    const enteredBuilds=api.getState().mapBuilds;
    scrollHost.scrollTop=0;
    check('滚出视口即释放滤镜',await until(()=>entering.dataset.lgVisible==='false' && api.getState().filters===0));
    check('离屏不运行毛玻璃背景采样',getComputedStyle(entering).backdropFilter==='none');
    check('离屏暂停不改变布局占位',scrollHost.scrollHeight===layoutHeight);
    scrollHost.scrollTop=offscreenTop-40;
    check('再次滚入无需等待停顿且复用贴图',await until(()=>entering.dataset.lgMode==='light')
      && api.getState().mapBuilds===enteredBuilds);
    clearInterval(keepScrolling);keepScrolling=undefined;
    await wait(240);await frame();
    check('停下后新卡片遵循平台质量策略',entering.dataset.lgMode===(androidAutoLight ? 'light' : 'full'));
    api.destroy();
    check('销毁恢复可见性属性',!entering.hasAttribute('data-lg-visible') && api.getState().filters===0);
  } catch(error) {check('检查未中断：'+error.message,false);}
  finally {clearInterval(keepScrolling);changes?.disconnect();api?.destroy();scrollHost?.remove();host.remove();}
  const failed=results.filter(r=>!r.ok).length;
  return {passed:results.length-failed,failed,skipped:0,results};
}
