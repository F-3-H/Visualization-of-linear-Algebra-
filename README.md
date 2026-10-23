# Visualization of Linear Algebra

用眼睛看的那部分线性代数：**三篇正文 + 四个可交互项目**。
全部静态、全部离线自足——没有 CDN、没有外链字体、没有构建步骤，双击 `index.html` 就能从第一页走到最后一页。

> 在线站点：<https://visualization-of-linear-algebra.pages.dev>（Cloudflare Pages，见文末）

---

## 目录与入口

| 入口 | 是什么 | 里面有什么 |
|---|---|---|
| [`index.html`](index.html) | 总入口 | 四条路的总目录 |
| [`项目/文章.html`](项目/文章.html) | **正文 · 第 11 篇《一捆数与一张表》** | 26 段 · 14 图 · 1 展示公式 · 17 行内公式 · 5 个就地内嵌的可交互站 |
| [`项目/index.html`](项目/index.html) | 第 11 篇配套项目 | 五视角：向量工场 / 矩阵作用台 / 先后有别 / 特征方向 / 行列式与反作用 |
| [`控制项目/文章.html`](控制项目/文章.html) | **正文 · 第 12 篇《让会倒的东西站住》** | 44 段 · 14 图 · 5 展示公式 · 19 行内公式 · 5 个就地内嵌的可交互站 |
| [`控制项目/index.html`](控制项目/index.html) | 第 12 篇配套项目 | 五视角：站不住的点 / 内因改不动 / 把线接回来 / 把倍数搬家 / 搬不动的时候 |
| [`观测项目/文章.html`](观测项目/文章.html) | **正文 · 第 13 篇《看不见的状态》** | 57 段 · 14 图 · 6 展示公式 · 37 行内公式 · 5 个就地内嵌的可交互站 |
| [`观测项目/index.html`](观测项目/index.html) | 第 13 篇配套项目 | 五视角：只看见一个数 / 差分这条路 / 让影子跟着跑 / 纠正减在第一列 / 影子里那条线 |
| [`复合项目/index.html`](复合项目/index.html) | 矩阵复合与顺序 | 四视角：两列的去向 / 连着摁两次 / 顺序有关系吗 / 括号摆哪儿都一样 |
| [`span-lab/index.html`](span-lab/index.html) | 张成实验室 | 二维 / 三维双工作区、整数组合点阵、组合探针、子空间方程与秩 |

三篇正文的 `.md` 源稿与 `.docx` 交付版在仓库根部，配图在 `图/`、`控制图/`、`观测图/`（浅色纸面，与站点里的深色版**几何逐张同像素**，只是配色不同）。

## 三条贯穿全部内容的技术约定

1. **正文与项目是同一个东西的两个面。** 正文里的每一张图都由项目里同一套数学渲染出来；正文不自己另画一套示意图。
2. **可交互那几站是"就地内嵌"的**，不是文末"另附演示"。正文走到需要动手那一段，卡片就插在那一段之后，卡片里写着"动哪儿"。
3. **结论可复算，而且判据自己也被验过。** 每个项目带两类脚本：
   - 正向断言（数学内核、真实浏览器里的取景、页面结构统一性）；
   - **反向对照**——把故障故意装回去，看断言抓不抓得住。只做正向断言的验收是自说自话。

## 怎么跑这些自检

```bash
# 第 11 / 12 / 13 篇的项目（Node，零依赖）
cd 项目          && node tests/verify-core.cjs && node tests/smoke-dom.cjs
cd 控制项目      && node tests/verify-core.cjs && node tests/smoke-dom.cjs
cd 观测项目      && node tests/verify-core.cjs && node tests/smoke-dom.cjs

# 页面结构与统一性（零依赖）
node 项目/tools/verify-repo-style.cjs
node 控制项目/tools/verify-repo-style.cjs
node 观测项目/tools/verify-repo-style.cjs

# 复合项目
node 复合项目/tests/verify-core.cjs

# 张成实验室
cd span-lab && npm test     # 17 条数学 + 13 条渲染
```

真实浏览器里的取景验收（`tools/verify-views-layout.cjs`）需要 `playwright-core` 和本机 Chrome：

```bash
cd 项目 && node tools/verify-views-layout.cjs          # 624 条
cd 控制项目 && node tools/verify-views-layout.cjs      # 394 条
cd 观测项目 && node tools/verify-views-layout.cjs      # 396 条
# 加 --reverse 走反向对照
```

## 技术栈

- 纯 HTML / CSS / 原生 JS，无框架、无模块加载、无构建
- 画布：自写 2D 取景层（画框由"必须看得见的点集"算出，网格按画框分档），3D 用自研透视投影
- 公式：正文页的公式在**生成阶段**就转成了标记（`.im` / `.fm`），浏览器里不跑 KaTeX
- 字体：只用系统字体栈，不带任何字体文件

## 许可

内容与代码用于教学与讨论，转载正文请注明出处。
