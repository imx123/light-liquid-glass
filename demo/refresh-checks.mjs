// Dependency-free host model: checks scheduling, DOM operation ordering and cleanup.
// This does not simulate browser layout cost, compositing or GPU frame rate.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../glass.js', import.meta.url), 'utf8');

function environment() {
  const stats = {rects:0, styles:0, scans:0, writes:0, readsAfterWrite:0};
  const timers = new Map(), frames = new Map(), observers = [];
  let id = 0;
  const write = () => { stats.writes++; };
  const read = () => { if (stats.writes) stats.readsAfterWrite++; };
  class Style {
    values = new Map();
    getPropertyValue(key) { return this.values.get(key)?.value || ''; }
    getPropertyPriority(key) { return this.values.get(key)?.priority || ''; }
    setProperty(key, value, priority = '') { write(); this.values.set(key, {value,priority}); }
    removeProperty(key) { write(); this.values.delete(key); }
  }
  class Node extends EventTarget {
    constructor(tag = 'div') {
      super(); this.tag = tag; this.children = []; this.attrs = new Map(); this.style = new Style();
      this.isConnected = true; this.width = 100; this.height = 100; this.left = 0; this.top = 0; this.radius = '28px';
      this.dataset = new Proxy({}, {set(obj,key,value) {write(); obj[key]=String(value); return true;},
        deleteProperty(obj,key) {write(); delete obj[key]; return true;}});
    }
    append(...nodes) { write(); for (const node of nodes) { node.parent = this; this.children.push(node); } }
    remove() { write(); this.isConnected = false; if(this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
    get childElementCount() { return this.children.length; }
    querySelectorAll() { stats.scans++; return this.children.filter(n => n.dataset.liquidGlass !== undefined); }
    matches() { return this.dataset.liquidGlass !== undefined; }
    getAttribute(key) {
      if(key.startsWith('data-')) return this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] ?? null;
      return this.attrs.get(key) ?? null;
    }
    setAttribute(key,value) { write(); this.attrs.set(key,String(value)); }
    removeAttribute(key) {
      if(key.startsWith('data-')) delete this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];
      else { write(); this.attrs.delete(key); }
    }
    getBoundingClientRect() {
      stats.rects++; read();
      return {width:this.width,height:this.height,left:this.left,top:this.top,right:this.left+this.width,bottom:this.top+this.height};
    }
  }
  const document = new Node('document'); document.body = new Node('body');
  document.createElementNS = (_,tag) => new Node(tag);
  document.createElement = () => ({getContext:() => ({
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}), putImageData() {}
  }), toDataURL:()=> 'data:image/png;host-fixture'});
  const root = new Node(), window = new EventTarget();
  const reset = () => { for(const key of Object.keys(stats)) stats[key]=0; };
  const env = {
    document, window, navigator:{userAgent:'Chrome/130'}, CSS:{supports:()=>true}, innerWidth:1280, innerHeight:960,
    AbortController, console:{warn(){}},
    matchMedia:()=>Object.assign(new EventTarget(),{matches:false}),
    getComputedStyle:el=>{ stats.styles++; read(); return {borderTopLeftRadius:el.radius}; },
    ResizeObserver:class {
      constructor(callback) {this.callback=callback; observers.push(this);}
      observe() {} unobserve() {} disconnect() {this.disconnected=true;}
    },
    setTimeout:fn=>{timers.set(++id,fn);return id;}, clearTimeout:key=>timers.delete(key),
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;}, cancelAnimationFrame:key=>frames.delete(key)
  };
  const create = new Function(...Object.keys(env), source.replace('export function','function')
    +'\nreturn createLiquidGlass;')(...Object.values(env));
  const flush = queue => { const pending=[...queue.values()];queue.clear();for(const fn of pending)fn(); };
  function card() { const el = new Node(); el.dataset.liquidGlass='';root.append(el);return el; }
  return {create,card,root,document,window,stats,reset,timers,frames,observers,
    flushTimers:()=>flush(timers), flushFrames:()=>flush(frames)};
}
let passed=0;
function check(name,fn) {fn();passed++;console.log('PASS '+name);}

{
  const e=environment(); const cards=Array.from({length:8},()=>e.card());
  let notifications=0;
  const api=e.create({root:e.root,quality:'full',onChange(){notifications++;}});
  try {
    e.reset();api.refresh();
    check('one geometry read per unchanged panel',()=>assert.equal(e.stats.rects,8));
    check('unchanged refresh performs no attribute/filter/style writes',()=>assert.equal(e.stats.writes,0));
    check('explicit refresh preserves callback notification',()=>assert.equal(notifications,2));
    for(const [i,card] of cards.entries()) {card.width=120+i;card.radius='20px';}
    e.reset();api.refresh();
    check('resized panels still measured once',()=>assert.equal(e.stats.rects,8));
    check('all geometry/style reads precede material writes',()=>assert.equal(e.stats.readsAfterWrite,0));
    const builds=api.getState().mapBuilds;
    e.reset();e.document.dispatchEvent(new Event('scroll'));e.flushFrames();e.flushTimers();
    check('manual Full scroll does not scan or measure',()=>assert.equal(e.stats.rects+e.stats.scans,0));
    check('manual Full scroll preserves quality and bitmaps',()=>{assert.equal(api.getState().full,8);assert.equal(api.getState().mapBuilds,builds);});
    cards[0].width=135;e.reset();e.window.dispatchEvent(new Event('resize'));e.flushFrames();e.flushTimers();
    check('manual Full viewport resize still updates geometry',()=>{assert.equal(api.getState().full,8);assert.equal(api.getState().mapBuilds,builds+1);});
  } finally {api.destroy();}
}
{
  const e=environment();const cards=Array.from({length:4},()=>e.card());
  const api=e.create({root:e.root,quality:'auto'});
  try {
    check('Auto keeps original idle 3 Full + 1 Light budget',()=>{assert.equal(api.getState().full,3);assert.equal(api.getState().light,1);});
    const builds=api.getState().mapBuilds;
    e.reset();e.document.dispatchEvent(new Event('scroll'));e.flushFrames();
    check('Auto scroll uses Light while preserving requested Auto quality',()=>{assert.equal(api.getState().quality,'auto');assert.equal(api.getState().light,4);});
    check('interaction transition does not measure or scan DOM',()=>assert.equal(e.stats.rects+e.stats.styles+e.stats.scans,0));
    check('interaction transition does not regenerate bitmaps',()=>assert.equal(api.getState().mapBuilds,builds));
    e.reset();for(let i=0;i<20;i++)e.document.dispatchEvent(new Event('scroll'));e.flushFrames();
    check('scroll burst does not repeatedly rebuild filters',()=>assert.equal(e.stats.writes,0));
    check('scroll burst coalesces to one settle timer',()=>assert.equal(e.timers.size,1));
    e.flushTimers();
    check('idle automatically restores Full budget',()=>{assert.equal(api.getState().full,3);assert.equal(api.getState().light,1);});
    check('automatic settle does not rescan element membership',()=>assert.equal(e.stats.scans,0));
    check('settle reuses existing bitmaps',()=>assert.equal(api.getState().mapBuilds,builds));
    e.document.dispatchEvent(new Event('scroll'));e.flushFrames();cards[0].width=150;e.flushTimers();
    check('resizing through an interaction refreshes final geometry',()=>assert.equal(api.getState().mapBuilds,builds+1));
    e.document.dispatchEvent(new Event('scroll'));api.setQuality('full');e.flushFrames();e.flushTimers();
    check('explicit quality switch cancels pending adaptive downgrade',()=>assert.equal(api.getState().full,4));
    api.setQuality('auto');e.document.dispatchEvent(new Event('scroll'));api.destroy();e.flushFrames();e.flushTimers();
    check('destroy cancels adaptive frame/timer and releases filters',()=>{assert.equal(e.frames.size+e.timers.size,0);assert.equal(api.getState().filters,0);});
  } finally {api.destroy();}
}
{
  const e=environment();const card=e.card();const api=e.create({root:e.root,quality:'full'});
  try {
    for(let w=101;w<=107;w++){card.width=w;api.refresh();}
    card.width=100;api.refresh(); // Touch oldest geometry through its cached bitmap.
    card.width=108;api.refresh();
    const builds=api.getState().mapBuilds;
    card.width=100;api.refresh();
    check('LRU retains reused geometry within eight-map bound',()=>{assert.equal(api.getState().mapBuilds,builds);assert.equal(api.getState().cachedMaps,8);});
    const extra=e.card();api.refresh();
    check('explicit refresh still discovers dynamic panels',()=>assert.equal(api.getState().elements,2));
    extra.isConnected=false;e.observers[0].callback([]);e.flushTimers();
    check('automatic resize refresh releases disconnected records',()=>assert.equal(api.getState().elements,1));
  } finally {api.destroy();}
}
console.log(JSON.stringify({passed,scope:'Host DOM/scheduler model only; no real browser or GPU validation'}));
