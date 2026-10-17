# light-liquid-glass

测试环境：2026-10-17，Windows、Node.js v26.10.0、Codex 内置桌面 Chromium。浏览器自检 97/97 通过，0 项跳过，覆盖 Full 和 Light 路径；其他浏览器和 GPU 帧率尚未验收。详细结果见 [VALIDATION.md](VALIDATION.md)。

[English](README.md) · 中文

一个用原生 HTML、CSS 和 JavaScript 实现的液态玻璃效果。背景经过卡片边缘时会弯曲，并出现轻微的 RGB 色散；中间只保留一点模糊，让背景细节还能看清。

Designed for websites。根目录只保留 `glass.js` 和 `glass.css`，演示、文档、背景图和检查脚本都放在 `demo/`。下面的命令从仓库根目录运行。

![液态玻璃效果预览](preview.png)

这个效果最初用在聊天界面上，后来整理成了可以单独接入的两个文件。卡片有一圈较细的 45° 高光，鼠标移入时会出现跟随光斑，移出后光斑隐藏。它不需要前端框架、npm 依赖、CDN 或 WebGL。

## 先跑起来

用 Node.js 18+ 启动演示：

```sh
node demo/server.mjs
```

打开 <http://localhost:4178>。顶栏可以切换自动、液态折射、轻量折射、毛玻璃和纯色。下方可以添加、移除卡片，或运行全部自检。演示服务器只监听本机。

## 放进现有页面

复制 `glass.css` 和 `glass.js`，让现有静态服务能访问它们。背景图和演示服务器都是可选的。一个完整页面可以这样写：

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

选一张有线条、明暗或纹理的背景，会更容易看出边缘折射。样式只作用于 `.lg-glass`，不重置页面布局、字体和按钮。两个伪元素 `::before` / `::after` 分别用来画鼠标光斑和边缘高光，接入时留意已有组件是否占用了它们。

## 控制效果

```js
import { createLiquidGlass } from './glass.js';

const glass = createLiquidGlass({
  root: document,               // 也可以传入一个已连接到页面的容器元素
  quality: 'auto',              // auto | full | light | frost | solid
  optics: {                     // 光学形态，可省略；下面是默认值
    refraction: 96,             // 0..200
    dispersion: 14,             // 0..50
    edgeWidth: 58               // 1..120，CSS 像素
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

`setQuality('full')` 或 `setQuality('light')` 会申请对应折射效果；环境不兼容时仍然回退。想让个别卡片一直使用毛玻璃，可以写 `data-liquid-glass="frost"`。

`optics` 调整光学形态：`refraction` 默认 96（0 到 200），`dispersion` 默认 14（0 到 50），`edgeWidth` 默认 58（1 到 120）。字段只接受有限数字；字符串、`NaN`、`Infinity` 等会在创建控制器资源之前抛出 `TypeError`，有限值超出范围时限制到边界。三个通道的位移强度为 `max(0, refraction + (通道序号 - 1) * dispersion)`，默认仍是 82/96/110。大卡片的贴图降采样时，边缘带也同比缩小，保持 CSS 像素范围。要更换参数，先销毁旧控制器，再创建新控制器。

尺寸变化会自动更新。动态增加或移除卡片后调用 `refresh()`；如果只改了圆角等样式，也主动调用一次。组件卸载时调用 `destroy()`，它会释放事件、观察器、动画帧、定时器、SVG 和缓存，并恢复接管前的 inline 样式与状态属性。重复销毁不会报错，需要再次使用时新建一个控制器。

一个容器通常只需要一个控制器。重复控制同一元素时，后创建的控制器会跳过已有归属的元素。`root` 自身带标记时也会纳入。

首次 `onChange` 在初始化过程中同步执行。它或挂载过程抛错时，控制器会先清理已创建的资源、恢复元素，再抛出原异常。之后 `refresh()` 的回调异常仍向调用方抛出，可用已取得的 `destroy()` 清理。

引擎不读写业务存储，也不替页面保存偏好。`demo.js` 演示了选择框和 localStorage 的接法。

## 调整材质

```css
.my-panel {
  --lg-radius: 28px;
  --lg-center-blur: .6px;    /* 液态模式中心轻模糊 */
  --lg-frost-blur: 6px;      /* 毛玻璃模式模糊 */
  --lg-solid: #1b253b;
  --lg-tint: linear-gradient(135deg, #c2ceff1e, #23315388 65%, #bbc6ff10);
  --lg-glow-width: 210px;    /* 光斑横向渐变半径 */
  --lg-glow-height: 130px;   /* 光斑纵向渐变半径 */
  --lg-glow-opacity: 1;      /* 光斑显示时的不透明度 */
  --lg-rim-opacity: 1;       /* 45° 边缘高光不透明度 */
}
```

默认 RGB 位移强度是 `82 / 96 / 110`，边缘作用带默认上限 58 个 CSS 像素（短卡片按比例收窄；贴图降采样时同比缩小）。45° 高光环宽 1px，鼠标光斑默认 210×130。继续调整光学形态时，可以查看 `glass.js` 的 `makeDisplacementMap`、`ensureFilter`，以及 `glass.css`。

## 浏览器自检

在演示页点击“运行全部自检”，可以依次检查生命周期、参数、质量档位和集成行为。只检查参数时，也可以在浏览器控制台运行：

```js
const { runParameterChecks } = await import('./parameters-checks.js');
await runParameterChecks(document.querySelector('#check-results'));
```

输出 PASS/FAIL/SKIP，覆盖 optics 校验与钳制、贴图边缘宽度、通道强度和光斑/高光变量。环境回退、不支持 Full 时，相关光学检查会标记为 SKIP。`checks.js` 负责控制器生命周期。

## 实现和开销

轻量档 `light` 使用单次位移，强度取 `optics.refraction`，默认 96。它与 Full 共用弧面贴图，省去 RGB 分通道和颜色合成。切换档位会复用贴图。

Auto 对每个控制器最多分配 3 块 Full 面板，其与视口相交的面积总和不超过 40 万 CSS 像素。可见面积较大的面板优先，同面积按挂载顺序；其余可见面板使用 Light，视口外使用 Frost。滚动或视口尺寸停止变化 120ms 后会统一刷新。预算只计算视口相交面积，不检查遮挡、CSS 可见性和祖先容器裁剪，也不代表显卡能力或帧率承诺。手动 Full / Light 跳过该预算，仍保留兼容性回退和单面板 120 万像素上限。

Canvas 在初始化或尺寸变化时生成一张位移贴图；`full` 的 SVG 按三个不同强度采样背景并合成 RGB 通道，`light` 只做一次位移。文字和控件不经过背景滤镜。鼠标移动只更新 CSS 光斑位置，不会重新生成贴图。

一个控制器共用一个 ResizeObserver 和一个鼠标动画帧。贴图按尺寸和圆角缓存，最多保留 8 张；重复刷新和切换模式可以复用。每张贴图约限 36 万像素，单卡片超过 120 万 CSS 像素会回退毛玻璃。解析法线减少了距离采样，极窄的接缝仍沿用差分，避免方向跳变。

本机 600×600 贴图计算样本从约 7.60ms 降到 4.59ms，减少约 40%。这只包含像素数学和数组写入，不包含 PNG 编码、浏览器合成或 GPU 渲染。可以运行 `node demo/benchmark.mjs` 复现。三通道色散仍比普通模糊更耗 GPU，建议给少数主卡片启用，普通列表使用 `data-liquid-glass="frost"`。

## 兼容范围

液态效果（`full` / `light`）走桌面 Chromium 的 SVG backdrop-filter 路径。检测通过只说明它是候选环境，仍需检查实际画面。Firefox、Safari、主指针为触控的设备等默认回退毛玻璃。系统要求减少透明度时使用纯色，要求减少动画时隐藏鼠标光斑。

贴图按统一的圆角矩形生成，四个角应使用相同的非椭圆圆角，推荐设置 px 单位的 `--lg-radius`。避免嵌套多层玻璃，或直接缩放、旋转玻璃元素，这些操作会改变采样与坐标关系。

如果项目有严格 CSP，需要允许本地模块、生成贴图的 `data:` 图片和必要的动态 style 更新。保留现有保护，只增加所需规则。使用文件白名单的静态服务需要登记效果文件和背景图。

## 文件

| 文件 | 用途 |
| --- | --- |
| `glass.js` / `glass.css` | 核心效果，业务接入只需要这两个文件 |
| `index.html` / `demo.js` / `demo.css` | 演示页面、选择框和偏好保存示例 |
| `background.png` | AI 生成的演示背景，可替换 |
| `checks.js` | 浏览器内的 20 项自检 |
| `parameters-checks.js` | optics、边缘宽度与 CSS 变量的浏览器参数自检 |
| `quality-checks.js` | 轻量滤镜、模式切换和 Auto 预算自检 |
| `lifecycle-checks.js` / `integration-checks.js` | 异常回滚、跨档参数和绘图回退自检 |
| `benchmark.mjs` | 贴图数学一致性和 CPU 计算对比 |
| `server.mjs` | 本机演示服务器 |
| `VALIDATION.md` | 已执行检查和未覆盖范围 |
| `preview.png` | README 截图 |
| `manifest.sha256` | 文件完整性清单 |

代码和文档使用 AI 辅助编写，演示背景使用 AI 生成。

参考：[MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)、[MDN ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)、[MDN feDisplacementMap](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap)。
