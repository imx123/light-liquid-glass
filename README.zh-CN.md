# light-liquid-glass

测试环境：Windows、Node.js v26.12.1，2026-10-22。69 项 host 逻辑检查通过，75 组 Lens 贴图逐字节一致。此前版本在 2026-10-21 通过了 Chromium 116/116 项检查。

用户已反馈安卓 Edge Light 测试正常，并认可 Firefox 原型调整后的目测效果。更新后的完整浏览器自检、安卓 Full 画面仍待验证，GPU 帧耗时尚未测量。各轮结果见 [VALIDATION.md](demo/VALIDATION.md)。

[English](README.md) · 中文

一个用原生 HTML、CSS 和 JavaScript 写的网站液态玻璃效果。折射集中在圆角边缘，混入少量 RGB 色散，中央保留轻微模糊。鼠标移入卡片时有跟随光斑，移出后隐藏。

![液态玻璃效果预览](demo/preview.png)

这个效果最初用在聊天界面里，后来拆成了 `glass.js` 和 `glass.css`，可以单独接入。没有前端框架、npm、CDN 或 WebGL 依赖。截图早于最近几轮修改。

## 运行演示

需要 Node.js 18+。在仓库根目录运行：

```sh
node demo/server.mjs
```

打开 <http://localhost:4178>。服务默认只监听本机，只提供白名单里的演示文件，不开放项目目录浏览。

顶栏可以切换自动、液态折射、轻量折射、毛玻璃和纯色。滑块分别控制折射幅度（0 到 200）、色散（0 到 50）、边缘带宽（1 到 120px）和背景模糊（0 到 12px，步长 0.1）。拖动时更新读数，松开后应用，也支持方向键。

“恢复默认参数”回到 110 / 14 / 15px / 2px，保留输入内容、动态卡片和所选档位。刷新页面后，参数也会恢复默认值。页面下方可以添加、移除卡片，或运行全部自检。

手机测试需要两台设备在局域网内互通。在 PowerShell 运行 `$env:HOST="电脑的局域网 IPv4"; $env:PORT="4179"; node demo/server.mjs`，然后用手机打开 `http://电脑的局域网IPv4:4179/`。

## 接入页面

复制 `glass.css` 和 `glass.js`，让现有静态服务能访问它们。背景图和演示服务器都可以换成你自己的。下面是一个完整页面：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>玻璃卡片</title>
  <link rel="stylesheet" href="./glass.css">
  <style>
    body { margin: 0; padding: 40px; color: white; background: url('./demo/background.png') center / cover fixed #101226; }
    .card { max-width: 440px; padding: 28px; }
  </style>
</head>
<body>
  <article class="lg-glass card" data-liquid-glass>
    <h1>液态玻璃</h1>
    <p>背景线条经过卡片边缘时发生弯曲与色散。</p>
    <button type="button">原有控件可以正常交互</button>
  </article>
  <script type="module">
    import { createLiquidGlass } from './glass.js';
    const glass = createLiquidGlass();
    // 动态添加或删除玻璃卡片后调用 glass.refresh()。
    // 页面组件卸载时调用 glass.destroy()。
  </script>
</body>
</html>
```

有线条、明暗或纹理的背景更容易看出边缘折射。样式只作用于 `.lg-glass`，不会重置页面布局、字体和按钮。鼠标光斑使用 `::before`，接入时留意组件原有的伪元素。

## 参数与生命周期

```js
import { createLiquidGlass } from './glass.js';

const glass = createLiquidGlass({
  root: document,               // 也可以传入一个已连接到页面的容器元素
  quality: 'auto',              // auto | full | light | frost | solid
  optics: {                     // 光学形态，可省略；下面是默认值
    refraction: 110,             // 0..200
    dispersion: 14,             // 0..50
    edgeWidth: 15               // 1..120，CSS 像素
  },
  onChange(state) {
    console.log(state.quality, state.full, state.light, state.frost, state.solid);
  }
});

glass.setQuality('full');        // 申请液态模式；不兼容时仍会回退
glass.refresh();                 // 同步新增/移除的卡片；同尺寸不会重算贴图
console.log(glass.getState());   // 元素、滤镜、缓存、累计贴图生成次数
glass.destroy();                 // 释放监听器、观察器、RAF、定时器、滤镜和缓存
```

`setQuality('full')` 和 `setQuality('light')` 分别请求完整、轻量折射；不兼容的环境会回退。要让某张卡片始终使用毛玻璃，写 `data-liquid-glass="frost"`。

`optics` 的默认值是 `refraction` 110、`dispersion` 14、`edgeWidth` 15，范围分别为 0 到 200、0 到 50、1 到 120。参数必须是有限数字。字符串、`NaN`、`Infinity` 等会在创建资源前抛出 `TypeError`；超出范围的有限数字会被限制到边界。更换光学参数时，先销毁旧控制器，再创建一个。

`edgeWidth` 按 CSS 像素定义。大卡片使用降采样贴图时，边缘带宽也会同比缩小，避免作用范围变宽。

卡片尺寸变化会自动更新。增删卡片后调用 `refresh()`；只改圆角、没有改尺寸时，也需要主动刷新。组件卸载时调用 `destroy()`，它会释放事件、观察器、动画帧、定时器、SVG 和缓存，恢复接管前的 inline 样式与状态属性。可以重复销毁；再次使用时新建控制器。

一个容器通常只需要一个控制器。后创建的控制器会跳过已有归属的元素。`root` 自身带标记时，也会纳入。

首次 `onChange` 在初始化过程中同步执行。初始化或首次回调抛错时，控制器会清理已创建的资源、恢复元素，再抛出原异常。后续 `refresh()` 的回调异常也会向外抛出，此时可以用已取得的 `destroy()` 清理。

核心不读写业务存储，也不保存偏好。选择框和 localStorage 的接法见 `demo.js`。

## 调整材质

```css
.my-panel {
  --lg-radius: 28px;
  --lg-center-blur: 2px;    /* 液态模式中心轻模糊 */
  --lg-frost-blur: 6px;      /* 毛玻璃模式模糊 */
  --lg-solid: #1b253b;
  --lg-tint: linear-gradient(135deg, #c2ceff1e, #23315388 65%, #bbc6ff10);
  --lg-glow-width: 210px;    /* 光斑横向渐变半径 */
  --lg-glow-height: 130px;   /* 光斑纵向渐变半径 */
  --lg-glow-opacity: 1;      /* 光斑显示时的不透明度 */
}
```

边缘作用带默认最多 15 个 CSS 像素，短卡片会按比例收窄。鼠标光斑的横向、纵向渐变半径默认是 210/130px。需要修改光学计算时，可以从 `glass.js` 的 `makeDisplacementMap`、`ensureFilter` 和 `glass.css` 看起。

## Firefox 背景图原型

演示页在桌面和安卓 Firefox 中会自动使用背景图副本：把同一张背景图画到卡片装饰层里，再用普通 SVG filter 做折射。文字和控件独立于这层图像。这个路径只处理背景图，无法采样卡片后方的文字、视频或其他卡片。

其他浏览器可以打开 `/?renderer=background` 对比效果，用 `/?renderer=native` 切回原生背景采样。Auto 使用 Light，手动选择“液态折射”使用 Full。两档都会在卡片离屏时移除副本，并在滚动的每帧重新对齐。默认值仍是 15px / 2px。用户已认可目测效果，完整 Firefox 渲染检查和性能测量还没完成。

接入时显式传入 background 选项，并在初始化前等待背景图解码：

```js
const image = new Image();
image.src = './background.png';
await image.decode();
const glass = createLiquidGlass({
  quality: 'auto',
  background: {
    image: image.src,
    overlayTop: '#090e203d',
    overlayBottom: '#090e2059',
    color: '#101226'
  }
});
```

图像上方可以叠加纵向渐变。页面和卡片副本必须使用相同的颜色、渐变、居中 cover 和视口固定规则，演示样式里有对应写法。任意 CSS 背景、变换和嵌套玻璃不在原型适配范围内。

getState().renderer 返回 background-image 或 backdrop。原型的 compatibility 是 background-image-experimental；能力检查失败时为 unsupported。

演示默认使用“通透叠色（55%）”，也可以选“原始叠色（100%）”对比。它只调整卡片的着色覆盖层，背景模糊仍为 2px，边缘带宽仍为 15px。核心变量 `--lg-image-tint-opacity` 默认是 1，不改变整张卡片或文字的透明度。

原型有 17 项独立的 DOM 和光学自检，包含三通道和 Lens 像素检查。Firefox 的原生背景滤镜检查仍可能跳过，页面会列出原因；跳过项不计入通过数。实际画面仍需要在浏览器里看。

## 支持范围

桌面 Chromium 使用 SVG backdrop-filter 实现 Full 和 Light。主指针为粗指针的桌面设备保留毛玻璃回退。

安卓 Chromium（包括带 Android UA 的 Edge）已试验开放 Full 和 Light，触屏也可使用。Auto 使用单次 Light，手动 Full 使用三通道。毛玻璃、纯色仍能选择，触摸不驱动鼠标光斑。原生路径的 `getState().compatibility` 返回 `android-experimental`、`desktop` 或 `unsupported`，演示页会标注“安卓试验支持”。

Firefox 演示页使用上面的背景图原型。没有传入背景图选项时，核心在 Firefox、iOS 等不支持的原生路径上继续回退。

CSS 能力检测或 Canvas 创建失败时会回退毛玻璃。检测通过后仍需检查设备实际渲染。安卓 Edge Light 已有用户测试，安卓 Full 的画面和流畅度仍待确认。系统要求减少透明度时使用纯色，要求减少动画时隐藏鼠标光斑。

四个角应采用相同的非椭圆圆角，建议为 `--lg-radius` 设置 px 值。嵌套玻璃、缩放或旋转卡片都会改变采样与指针坐标。

严格 CSP 需要允许本地模块、生成贴图的 `data:` 图片和必要的动态 style 更新。在现有策略里增加所需规则即可。使用文件白名单的静态服务，需要登记效果文件和背景图。

## 原理与开销

`light` 只做一次位移，强度取 `optics.refraction`，默认 110；`full` 分别采样 RGB 后再混合。两档共用同一张弧面贴图，切换时可以复用。

Canvas 在初始化或几何变化时生成位移贴图。向内的归一化距离为 `t = clamp(-d / band, 0, 1)`，Lens 曲线为 `1 - sqrt(1 - (1 - t)^2)`。光学法线使用 1.5 倍圆角半径，上限为短边的一半。文字和控件不经过背景滤镜；鼠标移动只更新光斑的 CSS 坐标。

当前只使用 Lens 模型，旧宽弧面模型已移除。令 `D = dispersion / 50`，通道序号为 0、1、2，位移强度为 `refraction * (1 + (通道序号 - 1) * D * 0.006)`，默认约为 109.8152/110/110.1848。RGB 结果按 `0.20 * D` 混入绿色通道的基准画面；D ≤ 0.001 时不混入，默认混合量是 5.6%。参数名和范围保留，色散数值的视觉含义与旧版不同。

桌面 Auto 静止时，每个控制器最多分配 3 块 Full 面板，可见面积总和不超过 40 万 CSS 像素。较大的可见面积优先，同面积按挂载顺序，其余可见面板使用 Light。

滚动或调整窗口大小时，Auto 临时把 Full 切为 Light。IntersectionObserver 通知新卡片进入视口后，下一动画帧就启用 Light；离屏时释放 SVG、背景模糊、阴影和光斑，保留布局与内容。停止操作 120ms 后恢复 Full 预算。手动 Full 保持所选档位。

相交通知是异步的，不检查遮挡和 CSS 透明度。缺少 IntersectionObserver 时，每个滚动帧批量检查一次可见性。这些预算不代表帧率保证。

一个控制器共用一个 ResizeObserver 和一个鼠标动画帧。刷新时先读完几何和圆角，再修改材质；尺寸不变就避免重复写入。自动几何更新不扫描成员，动态增删仍需调用 `refresh()`。

贴图使用最多 8 张的 LRU 缓存。生成时跳过中性中心，Lens 像素保持不变。每张贴图约限 36 万像素，单卡片超过 120 万 CSS 像素会回退毛玻璃。`getState().opticalModel` 固定为 `lens`。

Full 和 Light 都在折射后应用浏览器高斯模糊，默认 2px。这里没有复现 native 的有限 25 点采样核，也不声明与 native 逐像素一致。普通列表可以使用 `data-liquid-glass="frost"`。

## 自检与文件

演示页的“运行全部自检”会检查生命周期、参数、质量档位、集成行为和 Lens 光学，也包含 9 项连续滚动进入与离屏释放检查。早期套件有 106 项，当前执行数量取决于浏览器和启用的路径。安卓 Auto 使用 Light，手动 Full 执行三通道检查；未运行的检查不算已验收。

只运行参数检查时，在浏览器控制台执行：

```js
const { runParameterChecks } = await import('./parameters-checks.js');
await runParameterChecks(document.querySelector('#check-results'));
```

输出使用 PASS/FAIL/SKIP，覆盖 optics 校验、范围钳制、贴图边缘带宽、通道强度和光斑变量。不支持 Full 时，相关光学检查会跳过。`checks.js` 负责生命周期检查。

`node demo/refresh-checks.mjs` 运行 69 项 host 调度与兼容检查。`node demo/performance.mjs` 对比优化前后的 75 组贴图，并交替采样 CPU 耗时。`node demo/benchmark.mjs` 检查当前 Lens 数学和数组写入耗时。这些结果不包含 PNG 编码、浏览器合成或 GPU 渲染，不能代替浏览器性能验证。

核心双文件和中英文 README 在仓库根目录，演示及检查脚本在 `demo/`。下表中除核心双文件外，其余文件都位于该目录。

| 文件 | 用途 |
| --- | --- |
| `glass.js` / `glass.css` | 核心效果，业务接入需要这两个文件 |
| `index.html` / `demo.js` / `demo.css` | 演示页、选择框和偏好保存示例 |
| `background.png` | 可替换的 AI 生成背景 |
| `checks.js` | 20 项基础浏览器检查 |
| `parameters-checks.js` | optics、边缘带宽和 CSS 变量检查 |
| `quality-checks.js` | 轻量滤镜、模式切换和 Auto 预算检查 |
| `lifecycle-checks.js` / `integration-checks.js` | 异常回滚、跨档参数和绘图回退检查 |
| `lens-checks.js` | Lens 曲线、色散混合和跨档恢复检查 |
| `performance-checks.js` | 滚动轻量、恢复和销毁检查 |
| `performance.mjs` / `refresh-checks.mjs` | 像素一致性、CPU 对比和 host 调度检查 |
| `benchmark.mjs` | 当前 Lens 数学检查和 CPU 计时 |
| `server.mjs` | 演示服务器，默认仅监听本机 |
| `VALIDATION.md` | 已执行检查及未覆盖范围 |
| `preview.png` | README 截图 |
| `manifest.sha256` | 文件完整性清单 |

代码和文档使用 AI 辅助编写，演示背景使用 AI 生成。

参考：[MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)、[MDN ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)、[MDN feDisplacementMap](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap)。
