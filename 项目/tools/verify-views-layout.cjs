/* ============================================================
 * tools/verify-views-layout.cjs —— 真实浏览器里的「布局 + 取景」验收
 *
 * 跑法：node tools/verify-views-layout.cjs [--reverse] [--shots=目录]
 * 依赖：playwright-core（驱动）+ 本机 Chrome/Edge（可用 CHROME_PATH 指定）
 *
 * 为什么单列这一条：tools/verify-repo-style.cjs 读源码、tests/smoke-dom.cjs
 * 在 DOM 桩件里跑脚本——两者都测不到「排版」。桩件里没有布局，
 * 所以「画布被固有比例撑成比窗口还高的竖长条」这类缺陷在任何
 * 读源码/跑桩件的验收里都是盲区。只有真实浏览器量得出 getBoundingClientRect，
 * 也只有在真实画布上做取证，才能判断「结论到底有没有落在画里」。
 *
 * 断言分两组：
 *   A 布局（五个视角 × 两种视口）
 *     A1 每张画布横向（宽/高 ≥ 1.2）
 *     A2 每张画布整体在首屏内
 *     A3 页面高度 ≤ 视口高 × 1.3
 *     A4 无控制台错误
 *   B 取景（五视角 × 多组极端输入）
 *     B1 画框内的东西确实画在画框里：view.arrow 的端点、view.dot、
 *        view.text 的文字框——都不能越出画布（文字连右边缘一起量）
 *     B2 读数与 Node 侧按输入独立复算一致（01/02/03/05 的结论量）
 *     B3 02 的圆点：像素取证找到的位置 ＝ 绘制调用记下的位置
 *        （把 B1 的"记录"钉在真实光栅上，免得记录自说自话）
 *     B4 02 的圆点离画布四边 ≥ 8px
 *
 * --reverse：把故障装回去（画布回到固有比例、取景回到写死范围）。
 * 同一套断言必须报错——若仍全绿，说明这套验收是空转的。
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VIEWS = ["01-向量工场", "02-矩阵作用台", "03-先后有别", "04-特征方向", "05-行列式与反作用"];
const VIEWPORTS = [{ w: 1280, h: 900 }, { w: 1024, h: 700 }];
const EDGE_MARGIN = 8;                // 结论离画布边缘的最小距离
const BODY_MIN_AR = 1.2;              // 画布至少这么"横"

const REVERSE = process.argv.includes("--reverse");
const SHOTS = ((process.argv.find((a) => a.startsWith("--shots=")) || "").split("=")[1]) || null;

/* ---------- 驱动与浏览器 ---------- */
function loadPlaywright() {
  try { return require("playwright-core"); }
  catch (e) {
    console.log("[跳过] 未安装 playwright-core —— 本项未执行，不是通过。");
    console.log("      安装：npm i playwright-core；并保证本机有 Chrome/Edge（或设 CHROME_PATH）。");
    process.exit(2);
  }
}
function findBrowser() {
  const cands = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.log("[跳过] 找不到 Chrome/Edge —— 本项未执行，不是通过（可用 CHROME_PATH 指定）。");
  process.exit(2);
}

/* ---------- 取证用的颜色 ----------
 * 一律从 assets/theme.css 的 :root 里读，不在这儿写死。
 * 写死过一版（[14,159,110] 绿 / [124,92,191] 紫），主题从浅色换成深色之后，
 * 像素探针照着旧紫去光栅上找圆盘，报"圆盘候选 0 处"——图画得好好的，
 * 是探针自己失效了。这类"判据的参数跟着产物一起过期"比没有判据更坏：
 * 它给的是红灯，但红灯指错了地方。
 * 读 theme.css 并不削弱这条判据：画布是运行时按同一组 CSS 变量取色的，
 * 谁把画布上色写死成别的颜色（"画布整片黑"那次就是这么来的），
 * 照样对不上 theme.css 里声明的值。
 */
function tokenRgb(name) {
  const cssPath = path.join(ROOT, "assets", "theme.css");
  if (!fs.existsSync(cssPath)) throw new Error("assets/theme.css 不在，取色无从谈起");
  const m = fs.readFileSync(cssPath, "utf8")
    .match(new RegExp("\\" + name + "\\s*:\\s*#([0-9a-fA-F]{6})\\b"));
  if (!m) throw new Error("theme.css 里没有 " + name + " 这个六位色值");
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const C_U = tokenRgb("--u");          // u（作用前）
const C_PURPLE = tokenRgb("--purple"); // M·u（作用后）

/* ---------- 断言账本 ---------- */
const R = { pass: 0, fail: 0, details: [], lines: [], byGroup: {} };
let GROUP = "?";
function ok(cond, msg, extra) {
  if (cond) { R.pass++; return true; }
  R.fail++;
  R.byGroup[GROUP] = (R.byGroup[GROUP] || 0) + 1;
  R.details.push("  [" + GROUP + "] ✗ " + msg + (extra ? "  [" + extra + "]" : ""));
  return false;
}

/* ---------- 故障注入（反向对照用） ---------- */
// ① 画布回到"固有比例"（height 属性 300:520 → 竖长条）。
// 注意：必须在页面脚本之前生效。canvas 的固有比例取自它的位图尺寸，
// 而视角脚本一开始就 resize() 把位图同步成 3:2——事后再注入 CSS 已经改不动了，
// 故障会被无声地"治"好，反向对照因此变成空转（首版就栽在这里：A 组全绿）。
async function injectCanvasFault(page) {
  await page.addInitScript(() => {
    const css = ".stage canvas{aspect-ratio:auto !important;max-height:none !important;}";
    const inject = () => {
      const host = document.head || document.documentElement;
      if (host && !document.getElementById("__fault_canvas")) {
        const s = document.createElement("style");
        s.id = "__fault_canvas"; s.textContent = css; host.appendChild(s);
      }
    };
    inject();
    // 观察 document 本身：init 脚本执行时 documentElement 可能还没建好，
    // 挂在它上面会漏掉第一次插入（首版就是这样，故障没装上、反向对照白跑）。
    new MutationObserver(inject).observe(document, { childList: true, subtree: true });
  });
}
// ② 取景回到"写死范围"：让视角的 setRange 变成空操作。
// 注意这条路必须与"记录型 2D 上下文"装在同一个 setter 里：
// 两者都要包 window.Draw 的 set，各自 addInitScript 会互相覆盖，
// 结果就是故障只装了一半、B 组反向对照变成空转（第一次跑就是这样：
// 反向只报出 26 条 A 组的错，B 组全绿，差点当成"验收有效"的证据）。
async function installDrawHooks(page, opts) {
  await page.addInitScript((opts) => {
    window.__trace = {};
    let d;
    Object.defineProperty(window, "Draw", {
      configurable: true,
      get() { return d; },
      set(v) {
        const orig = v.create;
        v.create = function (cv, o) {
          const view = orig.call(v, cv, o);
          if (opts.faultRange) view.setRange = function () {};   // 故障：取景写死
          /* 故障③：把"作用后"的实线箭头压到最后画（画序调回去）。
             这两支箭头在单位表下完全重合，实线压在上面就会把虚线盖没——
             "表动没动 u"图上再也看不出来。专门用来反向对照那条
             "重合的两支箭头都看得见"的断言是否空转。 */
          if (opts.orderFault) {
            const A0 = view.arrow;
            const pend = [];
            let scheduled = false;
            view.arrow = function (p, q, o2) {
              if (o2 && !o2.dash && (o2.width || 2) >= 3) {
                pend.push([p, q, o2]);
                if (!scheduled) {
                  scheduled = true;
                  // 一帧是同步画完的：微任务里再把它们补画上去，正好压在最后
                  queueMicrotask(function () {
                    scheduled = false;
                    for (const args of pend) A0.apply(view, args);
                    pend.length = 0;
                  });
                }
                return;
              }
              return A0.call(view, p, q, o2);
            };
          }
          if (opts.trace) {
            const A = view.arrow, Dt = view.dot, T = view.text, C = view.clear;
            view.clear = function () {
              window.__trace[cv.id] = { w: view.width(), h: view.height(), arrow: [], dot: [], text: [] };
              return C.call(view);
            };
            view.arrow = function (p, q, o2) {
              const t = window.__trace[cv.id]; if (t) t.arrow.push([view.sx(p.x), view.sy(p.y), view.sx(q.x), view.sy(q.y)]);
              return A.call(view, p, q, o2);
            };
            view.dot = function (p, o2) {
              const t = window.__trace[cv.id]; if (t) t.dot.push([view.sx(p.x), view.sy(p.y)]);
              return Dt.call(view, p, o2);
            };
            view.text = function (p, s, o2) {
              o2 = o2 || {};
              const ctx = view.ctx, px = view.sx(p.x) + (o2.dx || 0), py = view.sy(p.y) + (o2.dy || 0);
              const t = window.__trace[cv.id];
              if (t) {
                ctx.save();
                ctx.font = (o2.bold ? "700 " : "") + (o2.size || 12) + "px " +
                  (o2.mono ? "Consolas, 'Courier New', monospace"
                           : "'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif");
                const w = ctx.measureText(s).width;
                ctx.restore();
                const al = o2.align || "left";
                const x0 = al === "right" ? px - w : al === "center" ? px - w / 2 : px;
                t.text.push([x0, py - (o2.size || 12) / 2, x0 + w, py + (o2.size || 12) / 2, s, px, py]);
              }
              return T.call(view, p, s, o2);
            };
          }
          return view;
        };
        d = v;
      },
    });
  }, opts);
}
const url = (v) => "file:///" + path.join(ROOT, "views", v + ".html").replace(/\\/g, "/");

/* ---------- A 布局 ---------- */
async function checkLayout(browser) {
  GROUP = "A";
  for (const v of VIEWS) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      const errs = [];
      page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
      page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      if (REVERSE) await injectCanvasFault(page);
      await page.goto(url(v), { waitUntil: "load", timeout: 20000 });
      await page.waitForTimeout(200);

      const m = await page.evaluate(() => ({
        pageH: document.documentElement.scrollHeight,
        vh: window.innerHeight,
        canvases: [...document.querySelectorAll("canvas")].map((c) => {
          const r = c.getBoundingClientRect();
          return { id: c.id, w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) };
        }),
      }));

      const tag = `${v}@${vp.w}×${vp.h}`;
      ok(m.canvases.length > 0, `${tag} 找得到画布`);
      for (const c of m.canvases) {
        ok(c.w / c.h >= BODY_MIN_AR, `${tag} #${c.id} 画布是横向的`, `宽高比 ${(c.w / c.h).toFixed(2)}`);
        ok(c.h >= 160 && c.w >= 260, `${tag} #${c.id} 画布没有被压没`, `${c.w}×${c.h}`);
        ok(c.bottom <= vp.h + 1, `${tag} #${c.id} 整个画布在首屏内`, `底边超视口 ${(c.bottom - vp.h).toFixed(0)}px`);
      }
      ok(m.pageH <= vp.h * 1.3 + 1, `${tag} 页面不超长`, `页高 ${m.pageH} / 视口 ${m.vh}`);
      if (!REVERSE) ok(errs.length === 0, `${tag} 无控制台错误`, errs.join(" | ").slice(0, 160));
      await page.close();
    }
  }
}

/* ---------- B 取景 ---------- */
function extentOf(W, H, r) {
  const a = W / H;
  return a >= 1
    ? { x0: -r * a, x1: r * a, y0: -r, y1: r }
    : { x0: -r, x1: r, y0: -r / a, y1: r / a };
}
function expectedPx(W, H, pad, r, x, y) {
  const e = extentOf(W, H, r);
  return {
    px: pad + (x - e.x0) / (e.x1 - e.x0) * (W - 2 * pad),
    py: H - pad - (y - e.y0) / (e.y1 - e.y0) * (H - 2 * pad),
  };
}

// 在页面内做像素取证：找一枚"实心小圆盘"（圆点外面有一圈白环，
// 所以环向走 16 个方向都会在半径 ~4 处停下，行程长短一致）。
// 只按颜色密度取最密处会把标签文字当成圆点（首版探针恒偏约 65px，
// 抓的是"M·u（作用后）"那行字），故判据必须是"半径一致"。
async function findDot(page, rgb, cvId) {
  return page.evaluate(({ rgb, cvId }) => {
    const cv = document.getElementById(cvId);
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    const bw = cv.width, bh = cv.height;
    const solid = (x, y) => {
      if (x < 0 || y < 0 || x >= bw || y >= bh) return false;
      const i = (y * bw + x) * 4;
      return Math.abs(px[i] - rgb[0]) < 16 && Math.abs(px[i + 1] - rgb[1]) < 16 && Math.abs(px[i + 2] - rgb[2]) < 16;
    };
    function discScore(cx, cy) {
      let minR = 99, maxR = 0;
      for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8, dx = Math.cos(a), dy = Math.sin(a);
        let n = 0;
        while (n < 12 && solid(Math.round(cx + dx * n), Math.round(cy + dy * n))) n++;
        if (n === 0) return 0;
        minR = Math.min(minR, n); maxR = Math.max(maxR, n);
      }
      return minR >= 3 && maxR <= 9 ? minR : 0;   // 半径一致才算圆盘
    }
    const hits = [];
    for (let y = 2; y < bh - 2; y++) {
      for (let x = 2; x < bw - 2; x++) {
        if (!solid(x, y)) continue;
        const s = discScore(x, y);
        if (s > 0) hits.push([x, y, s]);
      }
    }
    let bestS = 0;
    hits.forEach((h) => { if (h[2] > bestS) bestS = h[2]; });
    let cx = 0, cy = 0, n = 0;
    hits.forEach((h) => { if (h[2] >= bestS - 1) { cx += h[0]; cy += h[1]; n++; } });
    return {
      rectW: r.width, rectH: r.height, dpr, bitmap: [bw, bh],
      bestX: n ? cx / n / dpr : -1, bestY: n ? cy / n / dpr : -1,
      hits: hits.length, score: bestS,
      readout: document.getElementById("ro").innerText,
    };
  }, { rgb, cvId });
}

const getTrace = (page) => page.evaluate(() => window.__trace);

/* 一条通用判据：记录下来的每一个箭头端点、圆点、文字框，
   都必须落在它那张画布里面。这就是"结论没有跑到画外"的形式化版本。 */
function checkInCanvas(trace, tag) {
  const per = [];
  for (const id of Object.keys(trace)) {
    const t = trace[id];
    if (!t) continue;
    const w = t.w, h = t.h;
    let worst = 1e9, worstWhat = "—";
    const inside = (x, y, what) => {
      const m = Math.min(x, y, w - x, h - y);
      if (m < worst) { worst = m; worstWhat = what; }
      ok(m >= EDGE_MARGIN, `${tag} #${id} ${what} 在画布内`, `离边 ${m.toFixed(0)}px（画布 ${w.toFixed(0)}×${h.toFixed(0)}）`);
    };
    t.arrow.forEach((a) => {
      inside(a[0], a[1], "箭头起点"); inside(a[2], a[3], "箭头终点");
    });
    t.dot.forEach((p) => inside(p[0], p[1], "圆点"));
    t.text.forEach((b) => {
      const m = Math.min(b[0], b[1], w - b[2], h - b[3]);
      if (m < worst) { worst = m; worstWhat = "文字“" + b[4] + "”"; }
      ok(m >= 2, `${tag} #${id} 文字“${b[4]}”整块在画布内`, `离边 ${m.toFixed(0)}px`);
      inside(b[5], b[6], "文字锚点");   // 锚点还得在画框内，不只是画布内
    });
    per.push({ id, w: Math.round(w), h: Math.round(h), n: t.arrow.length + t.dot.length + t.text.length, worst, worstWhat });
  }
  return per;
}

/* 沿一段已知的世界坐标线段采样，数一数画布上同时出现了哪几种颜色。
   专门给"两支箭头重合"这种情形用：重合时"看得出是两支"= 沿线上绿紫两种
   颜色都在。这条把"看得出来"从目测变成可断言的量——否则下次谁把画序调回去，
   图又变回"一支箭头挂两个标签"，没有任何断言会报警。 */
async function sampleAlong(page, colors, from, to, range, pad, cvId) {
  return page.evaluate(({ colors, from, to, range, pad, cvId }) => {
    const cv = document.getElementById(cvId || "cv");
    const r = cv.getBoundingClientRect();
    const a = r.width / r.height;
    const e = a >= 1 ? { x0: -range * a, x1: range * a, y0: -range, y1: range }
                     : { x0: -range, x1: range, y0: -range / a, y1: range / a };
    const sx = (x) => pad + (x - e.x0) / (e.x1 - e.x0) * (r.width - 2 * pad);
    const sy = (y) => r.height - pad - (y - e.y0) / (e.y1 - e.y0) * (r.height - 2 * pad);
    const dpr = window.devicePixelRatio || 1;
    const bw = cv.width;
    const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    const near = (X, Y, c) => {
      const i = (Math.round(Y * dpr) * bw + Math.round(X * dpr)) * 4;
      return Math.abs(px[i] - c[0]) < 26 && Math.abs(px[i + 1] - c[1]) < 26 && Math.abs(px[i + 2] - c[2]) < 26;
    };
    const count = colors.map(() => 0);
    const N = 240;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const X = sx(from[0] + (to[0] - from[0]) * t), Y = sy(from[1] + (to[1] - from[1]) * t);
      colors.forEach((c, idx) => { if (near(X, Y, c)) count[idx]++; });
    }
    return { count, total: N + 1 };
  }, { colors, from, to, range, pad, cvId });
}

/* ---------- B 场景 ---------- */
// 每个场景是"读者能做出的极端输入"：把这些推到边上，取景还装不装得下。
const SCENARIOS = [
  { view: "01-向量工场", label: "两捆都填大 + 2u + −u",
    set: [["#ux", 9], ["#uy", 7], ["#vx", 6], ["#vy", 8]], click: ["#t2u", "#tNeg"] },
  { view: "01-向量工场", label: "两捆反向填大",
    set: [["#ux", -12], ["#uy", 5], ["#vx", 4], ["#vy", -11]], click: ["#t2u"] },
  { view: "02-矩阵作用台", label: "不动（单位表）——两支箭头完全重合",
    set: [["#ma", 1], ["#mb", 0], ["#mc", 0], ["#md", 1]], coincident: true },
  /* u 也能手填之后，"读者能做出的极端输入"就多了一整个维度：表不动而 u 拉远
     （重合的两支箭头被拉得很长，画框得跟着走，采样还得采得出两种颜色）、
     u 与表都填大、以及 u 被填成零捆（两支箭头缩成一个点）。 */
  { view: "02-矩阵作用台", label: "u 手填到很远（表不动，两支箭头仍重合）",
    set: [["#ma", 1], ["#mb", 0], ["#mc", 0], ["#md", 1], ["#ux", 11], ["#uy", -8]],
    coincident: true },
  { view: "02-矩阵作用台", label: "u 与表都填大",
    set: [["#ma", 3], ["#mb", 4], ["#mc", 5], ["#md", 6], ["#ux", 9], ["#uy", -7]] },
  { view: "02-矩阵作用台", label: "u 填成零捆（0, 0）",
    set: [["#ux", 0], ["#uy", 0]] },
  { view: "03-先后有别", label: "两张大表（顺序不同，终点各走一边）",
    set: [["#aa", 2], ["#ab", 1], ["#ac", 0], ["#ad", 2], ["#ba", 3], ["#bb", 0], ["#bc", 0], ["#bd", 1]] },
  { view: "04-特征方向", label: "一般表（默认）" },
  { view: "04-特征方向", label: "填一张大表", set: [["#ma", 3], ["#mb", 4], ["#mc", 5], ["#md", 6]] },
  { view: "04-特征方向", label: "红线上拖到画框角落（自检行程到底）", dragProbe: true },
  { view: "04-特征方向", label: "弹簧系统", click: ["#mSpring"] },
  { view: "04-特征方向", label: "弹簧系统 · 硬弹簧", click: ["#mSpring"], set: [["#sk", 9], ["#sm", 0.4]] },
  { view: "05-行列式与反作用", label: "目标 b 填到很远", set: [["#bx", 20], ["#by", -14]] },
  { view: "05-行列式与反作用", label: "摁扁（t=1）且 b 很远", set: [["#tslide", 1], ["#bx", 12], ["#by", 9]] },
  { view: "05-行列式与反作用", label: "四个数填大（单位正方形的像也跟着大）",
    set: [["#ma", 2.5], ["#mb", 1.5], ["#mc", 1], ["#md", 2], ["#bx", 6], ["#by", 5]] },
];
const CASES02 = [
  ["不动（单位表）", [1, 0, 0, 1]],
  ["横方向抻 2 倍", [2, 0, 0, 1]],
  ["转 90°", [0, -1, 1, 0]],
  ["转 45° 再缩一半", [0.35355339, -0.35355339, 0.35355339, 0.35355339]],
  ["剪切（顶被推歪）", [1, 1, 0, 1]],
  ["翻面（mirror）", [-1, 0, 0, 1]],
  ["摁扁（det=0）", [1, 0.5, 2, 1]],
  ["两个方向各伸缩", [2, 0, 0, 1.3]],
  ["对称表", [2, 0.9, 0.9, 1.3]],
  ["手填·六", [1, 6, 1, 6]],
  ["手填·大表", [3, 4, 5, 6]],
  ["手填·小表", [0.1, 0, 0, 0.1]],
];

async function open(page, v) {
  // 故障（若反向）与记录必须装进同一个 setter 里，否则互相覆盖
  await installDrawHooks(page, { faultRange: REVERSE, orderFault: REVERSE, trace: true });
  await page.goto(url(v), { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(120);
}
async function applySet(page, set, click) {
  // 先点按钮：弹簧系统那组控件在点开之前是隐藏的（display:none），先填会超时
  for (const sel of (click || [])) await page.click(sel);
  for (const [sel, val] of (set || [])) await page.fill(sel, String(val));
  await page.waitForTimeout(120);
}

async function checkFraming(browser, Lin, shotsDir) {
  GROUP = "B";
  // ---- 五视角通用场景 ----
  for (const sc of SCENARIOS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await open(page, sc.view);
    await applySet(page, sc.set, sc.click);
    let tag = `${sc.view.replace(/\.html$/, "")}/${sc.label}`;

    if (sc.dragProbe) {
      // 把自检的点沿特征方向拖到画框角落：这是读者能做出的最极端行程
      const m = await page.evaluate(() => {
        const cv = document.getElementById("cv"), r = cv.getBoundingClientRect();
        return { w: r.width, h: r.height, ro: document.getElementById("ro").innerText };
      });
      const rM = m.ro.match(/M = \[ (-?\d+\.\d+) {2}(-?\d+\.\d+) \]\n\s*\[ (-?\d+\.\d+) {2}(-?\d+\.\d+) \]/);
      const R = parseFloat((m.ro.match(/画框 ±(\d+(?:\.\d+)?)/) || [, "4.2"])[1]);
      if (rM) {
        const M = Lin.mat(+rM[1], +rM[2], +rM[3], +rM[4]);
        const eig = Lin.eigen(M);
        if (eig.type === "real" && eig.v1) {
          const p = Lin.scale(eig.v1, 1.2);
          const at = expectedPx(m.w, m.h, 34, R, p.x, p.y);
          const cr = await page.evaluate(() => {
            const r = document.getElementById("cv").getBoundingClientRect();
            return { x: r.left, y: r.top };
          });
          await page.mouse.move(cr.x + at.px, cr.y + at.py);
          await page.mouse.down();
          await page.mouse.move(cr.x + m.w - 3, cr.y + 3, { steps: 8 });
          await page.waitForTimeout(80);
        }
      }
    }
    const trace = await getTrace(page);
    const per = checkInCanvas(trace, tag);
    if (per.length) {
      R.lines.push("  · " + tag + "  " + per.map((p) => `#${p.id} ${p.w}×${p.h} 画了 ${p.n} 样，最近的一处离边 ${p.worst.toFixed(0)}px（${p.worstWhat}）`).join("；"));
    }

    if (sc.coincident) {
      /* 单位表：M·u ＝ u。沿这支重合的箭头采样，绿（作用前）、紫（作用后）
         两种颜色都必须出现——只看得见一支，就说明画序把它们叠没了，
         "这张表动没动 u"在图上也就不存在了。 */
      const ro = await page.evaluate(() => document.getElementById("ro").innerText);
      const mM = ro.match(/M·u = \((-?\d+\.\d+), (-?\d+\.\d+)\)/);
      const rR = ro.match(/画框 ±(\d+(?:\.\d+)?)/);
      const w0 = (trace["cv"] || {}).w;
      if (ok(!!mM && !!rR && !!w0, `${tag} 读数里有 M·u 与画框`)) {
        const s = await sampleAlong(page, [C_U, C_PURPLE],
          [0, 0], [parseFloat(mM[1]), parseFloat(mM[2])], parseFloat(rR[1]), 34, "cv");
        ok(s.count[0] >= 12 && s.count[1] >= 12,
          `${tag} 重合的两支箭头在图上都看得见（绿 u 与紫 M·u）`,
          `沿线上绿 ${s.count[0]} 点、紫 ${s.count[1]} 点（共采样 ${s.total} 点）`);
        ok(/完全重合/.test(ro), `${tag} 读数里点明了"完全重合"`);
      }
    }
    if (shotsDir) {
      await page.screenshot({ path: path.join(shotsDir, "sc-" + tag.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "_") + ".png"), fullPage: false });
    }
    if (sc.dragProbe) await page.mouse.up();
    await page.close();
  }

  // ---- 02：像素取证 + 读数复算（把 B 组的记录钉在真实光栅上） ----
  for (const [label, M] of CASES02) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await open(page, "02-矩阵作用台");
    await applySet(page, [["#ma", M[0]], ["#mb", M[1]], ["#mc", M[2]], ["#md", M[3]]]);
    const tag = `02-矩阵作用台/${label}`;

    const trace = await getTrace(page);
    checkInCanvas(trace, tag);

    const s = await findDot(page, C_PURPLE, "cv");
    const rM = s.readout.match(/M·u = \((-?\d+\.\d+), (-?\d+\.\d+)\)/);
    const rU = s.readout.match(/u = \((-?\d+\.\d+), (-?\d+\.\d+)\)/);
    const rR = s.readout.match(/画框 ±(\d+(?:\.\d+)?)/);
    if (!ok(!!rM && !!rU && !!rR, `${tag} 读数里有 u、M·u 与画框`)) { await page.close(); continue; }
    const Mu = [parseFloat(rM[1]), parseFloat(rM[2])];
    const u = [parseFloat(rU[1]), parseFloat(rU[2])];
    const range = parseFloat(rR[1]);

    // B2 读数 vs Node 侧独立复算（输入值 → core.js）
    const Mu2 = Lin.apply(Lin.mat(M[0], M[1], M[2], M[3]), Lin.vec(u[0], u[1]));
    ok(Math.max(Math.abs(Mu[0] - Mu2.x), Math.abs(Mu[1] - Mu2.y)) < 0.011,
      `${tag} 读数与独立复算一致`);

    // B3 像素取证找到的位置 ＝ 绘制调用记下的位置
    const traced = (trace["cv"] || { dot: [] }).dot;
    if (ok(traced.length > 0, `${tag} 记录里有 M·u 圆点`)) {
      const last = traced[traced.length - 1];
      const gap = ok(s.score >= 3, `${tag} 画布上找得到 M·u 圆点`,
        `圆盘候选 ${s.hits} 处、半径一致度 ${s.score}`);
      if (gap) {
        const d2 = Math.max(Math.abs(s.bestX - last[0]), Math.abs(s.bestY - last[1]));
        ok(d2 <= 4, `${tag} 记录的位置与光栅上找到的圆点吻合`,
          `记录(${last[0].toFixed(0)},${last[1].toFixed(0)}) 光栅(${s.bestX.toFixed(0)},${s.bestY.toFixed(0)}) 差 ${d2.toFixed(1)}px`);
        // B4 与"读数 + 画框"推出的期望位置一致
        const exp = expectedPx(s.rectW, s.rectH, 34, range, Mu[0], Mu[1]);
        const err = Math.max(Math.abs(s.bestX - exp.px), Math.abs(s.bestY - exp.py));
        ok(err <= 6, `${tag} 圆点位置与读数相符`,
          `实测(${s.bestX.toFixed(0)},${s.bestY.toFixed(0)}) 期望(${exp.px.toFixed(0)},${exp.py.toFixed(0)}) 差 ${err.toFixed(1)}px`);
      }
    }
    if (shotsDir) {
      await (await page.$("#cv")).screenshot({
        path: path.join(shotsDir, "02-" + label.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "_") + ".png"),
      });
    }
    await page.close();
  }
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
  const Lin = require(path.join(ROOT, "assets", "core.js"));
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  await checkLayout(browser);
  await checkFraming(browser, Lin, SHOTS);
  await browser.close();

  console.log("────────────────────────");
  if (R.lines.length) console.log("取景实测：\n" + R.lines.join("\n"));
  const byG = Object.keys(R.byGroup).map((g) => `${g} 组 ${R.byGroup[g]} 条`).join("、") || "无";
  if (REVERSE) {
    console.log(`反向对照：把故障装回去后，${R.fail} 条断言报错（${byG}）、${R.pass} 条仍通过。`);
    console.log(R.fail > 0 ? "OK：验收确实抓得住这三个故障（不是空转的）。"
                           : "问题：故障装回去了却全绿——这套验收是空转的，必须重做。");
    if (R.details.length) console.log(R.details.slice(0, 14).join("\n"));
    process.exit(R.fail > 0 ? 0 : 1);
  }
  console.log(`断言：${R.pass} 通过，${R.fail} 失败。`);
  if (R.details.length) console.log(R.details.join("\n"));
  process.exit(R.fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", (e && e.stack) || e); process.exit(1); });
