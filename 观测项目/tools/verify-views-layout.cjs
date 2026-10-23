/* ============================================================
 * tools/verify-views-layout.cjs —— 真实浏览器里的验收（《看不见的状态》）
 *
 * 跑法：node tools/verify-views-layout.cjs [--reverse] [--shots=目录]
 * 依赖：playwright-core（驱动）+ 本机 Chrome/Edge（可用 CHROME_PATH 指定）
 *
 * 为什么单列这一条：verify-repo-style.cjs 读源码、smoke-dom.cjs 在 DOM 桩件里跑脚本，
 * 两者都测不到"排版"，也测不到"算出来的结论有没有落到画里"。
 *
 * 四组断言：
 *   A 布局（五视角 × 两种视口）：画布横向、没被压没、整块在首屏内、页面不超长、无控制台错误
 *   B 取景（五视角 × 十五个场景，每个都是"读者能做出的极端输入"）
 *     B1 记录下来的箭头端点／圆点／空心圈／文字框都必须落在画布内
 *   C 语义（读数 ↔ 本文件自写的独立复算）
 *     C1 读数自洽（同一句话里的几个数互相推得出来）
 *     C2 与精确量核对（λ 由二次方程解出来、det O 由交叉相减算出来，不借页面那套）
 *     C3 名字由几何独立算出，再回头核对页面上印的字
 *   D 约束对象（01／04 画框固定，把点拖到画布外，它必须还在画框内）
 *
 * --reverse：把四个故障装回去（画布回到固有比例、夹取变成恒等、
 * 标签一律向左长、observeMat 原样返回 A）。同一套断言必须按组报错——
 * 若仍全绿，或某一组一条都没报，说明那组是空转的。
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VIEWS = ["01-只看见一个数", "02-差分这条路", "03-让影子跟着跑", "04-纠正减在第一列", "05-影子里那条线"];
const VIEWPORTS = [{ w: 1280, h: 900 }, { w: 1024, h: 700 }];
const EDGE_MARGIN = 8;
const TEXT_MARGIN = 2;
const BODY_MIN_AR = 1.2;

/* 画框固定的两个视角：把对象夹回画框（其余三站画框跟着对象走，不需要夹） */
const FIXED_FRAME = {
  "01-只看见一个数": { range: 2.4, pad: 36, shift: [0, 0] },
  "04-纠正减在第一列": { range: 2, pad: 40, shift: [1.5, 1] },
};
const FROZEN_FRAME = 0.9;

const REVERSE = process.argv.includes("--reverse");
const SHOTS = ((process.argv.find((a) => a.startsWith("--shots=")) || "").split("=")[1]) || null;

/* ---------- 驱动与浏览器 ---------- */
function loadPlaywright() {
  try { return require("playwright-core"); }
  catch (e) {
    console.log("[跳过] 未安装 playwright-core —— 本项未执行，不是通过。");
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

/* ---------- 故障注入 ----------
 * 四个故障全装在同一个 addInitScript、同一个 Draw setter 里：
 * 上次的教训是多个 addInitScript 各自包 setter 会互相覆盖，
 * 结果故障只装上一半，反向对照变成空转。 */
async function installHooks(page) {
  await page.addInitScript((opts) => {
    window.__trace = {};

    /* ① 画布回到"固有比例"：必须在页面脚本之前生效（页面脚本一开始就 resize，
       事后再改 CSS 已经改不动位图尺寸）。 */
    if (opts.faultCanvas) {
      const css = ".stage canvas{aspect-ratio:auto !important;max-height:none !important;}";
      const inject = () => {
        const host = document.head || document.documentElement;
        if (host && !document.getElementById("__fault_canvas")) {
          const s = document.createElement("style");
          s.id = "__fault_canvas"; s.textContent = css; host.appendChild(s);
        }
      };
      inject();
      new MutationObserver(inject).observe(document, { childList: true, subtree: true });
    }

    let d;
    Object.defineProperty(window, "Draw", {
      configurable: true,
      get() { return d; },
      set(v) {
        const orig = v.create;
        v.create = function (cv, o) {
          const view = orig.call(v, cv, o);
          /* ② 夹取变成恒等：画框固定的两站，"约束对象"这条规矩被拆掉 */
          if (opts.faultClamp) view.clamp = function (p) { return p; };
          /* ③ 标签一律向左长：贴边那几句话就出框了 */
          if (opts.faultAlign) {
            const T = view.text;
            view.text = function (p, s, o2) {
              return T.call(view, p, s, Object.assign({}, o2, { align: "left", dx: Math.abs((o2 && o2.dx) || 0) }));
            };
          }
          if (opts.trace) {
            const A = view.arrow, Dt = view.dot, Rg = view.ring, T2 = view.text, Cl = view.clear;
            view.clear = function () {
              window.__trace[cv.id] = { w: view.width(), h: view.height(), arrow: [], dot: [], text: [] };
              return Cl.call(view);
            };
            view.arrow = function (p, q, o2) {
              const t = window.__trace[cv.id];
              if (t) t.arrow.push([view.sx(p.x), view.sy(p.y), view.sx(q.x), view.sy(q.y)]);
              return A.call(view, p, q, o2);
            };
            const mark = function (p) { const t = window.__trace[cv.id]; if (t) t.dot.push([view.sx(p.x), view.sy(p.y)]); };
            view.dot = function (p, o2) { mark(p); return Dt.call(view, p, o2); };
            view.ring = function (p, o2) { mark(p); return Rg.call(view, p, o2); };
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
              return T2.call(view, p, s, o2);
            };
          }
          return view;
        };
        d = v;
      },
    });

    /* ④ observeMat 原样返回 A：纠正的两笔就全落空了。
       05 那站扫一串 L 会看到"倍数一个都不动"，而 det O 明明不是零——
       两条路当场对不上，C 组抓的就是这个。 */
    let l;
    Object.defineProperty(window, "Lin", {
      configurable: true,
      get() { return l; },
      set(v) {
        if (opts.faultObserve) {
          const o0 = v.observeMat;
          v.observeMat = function (A) { return o0 ? Object.assign({}, A) : A; };
        }
        l = v;
      },
    });
  }, {
    faultCanvas: REVERSE, faultClamp: REVERSE, faultAlign: REVERSE, faultObserve: REVERSE,
    trace: true,
  });
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
      await installHooks(page);
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

/* ---------- B 取景：把记录下来的记号逐条对账"在不在画布内" ---------- */
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
      ok(m >= EDGE_MARGIN, `${tag} #${id} ${what} 在画布内`,
        `离边 ${m.toFixed(0)}px（画布 ${w.toFixed(0)}×${h.toFixed(0)}）`);
    };
    t.arrow.forEach((a) => { inside(a[0], a[1], "箭头起点"); inside(a[2], a[3], "箭头终点"); });
    t.dot.forEach((p) => inside(p[0], p[1], "圆点／空心圈"));
    t.text.forEach((b) => {
      const m = Math.min(b[0], b[1], w - b[2], h - b[3]);
      if (m < worst) { worst = m; worstWhat = "文字“" + b[4] + "”"; }
      ok(m >= TEXT_MARGIN, `${tag} #${id} 文字“${b[4]}”整块在画布内`, `离边 ${m.toFixed(0)}px`);
      inside(b[5], b[6], "文字锚点");
    });
    per.push({ id, w: Math.round(w), h: Math.round(h), n: t.arrow.length + t.dot.length + t.text.length, worst, worstWhat });
  }
  return per;
}

const getTrace = (page) => page.evaluate(() => window.__trace);
const readout = (page) => page.evaluate(() => document.getElementById("ro").innerText);
const canvasRect = (page) => page.evaluate(() => {
  const r = document.getElementById("cv").getBoundingClientRect();
  return { left: r.left, top: r.top, w: r.width, h: r.height };
});

/* ---------- 本文件自写的独立复算 ----------
 * 一根棍子那张表 A ＝ [[0,1],[a,−c]]，a ＝ 1、c ＝ 0.2。
 * 这里不 require assets/core.js：判据要能独立成立，
 * 拿被测函数去核对被测页面等于自证。 */
const A_A = 1, A_C = 0.2;
const LAM1 = (-A_C + Math.sqrt(A_C * A_C + 4 * A_A)) / 2;      // λ² + cλ − a ＝ 0
const LAM2 = (-A_C - Math.sqrt(A_C * A_C + 4 * A_A)) / 2;
function plainEigen(a, c) {                                    // 任意表 [[0,1],[a,−c]] 的两个根
  const d = c * c + 4 * a;
  if (d < 0) return { real: false, re: -c / 2, im: Math.sqrt(-d) / 2 };
  return { real: true, l1: (-c + Math.sqrt(d)) / 2, l2: (-c - Math.sqrt(d)) / 2 };
}
function detO(c1, c2) { return c1 * c1 - A_C * c1 * c2 - A_A * c2 * c2; }   // det[C; CA]
function close(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 6e-3 : tol); }
function num(s) { return parseFloat(s); }

/* ---------- 场景 ---------- */
const SCENARIOS = [
  { v: "01-只看见一个数", label: "滑条拉满 2.00（另一个点推到最远）", set: [["#sd", 2]] },
  { v: "01-只看见一个数", label: "把点拖到画框左上角",
    drag: { from: [0.5, 0.5], to: [-1.9, 1.9] } },
  { v: "01-只看见一个数", label: "把点拖到画框右下角",
    drag: { from: [0.5, 0.5], to: [1.9, -1.9] } },

  { v: "02-差分这条路", label: "间隔最大 0.2、噪声最大 0.02", set: [["#sh", 0.2], ["#ss", 0.02]] },
  { v: "02-差分这条路", label: "间隔最小 0.005、噪声最大", set: [["#sh", 0.005], ["#ss", 0.02]] },
  { v: "02-差分这条路", label: "噪声归零", set: [["#ss", 0]] },

  { v: "03-让影子跟着跑", label: "方向 0°、差 0.8、跑 3 秒", set: [["#sp", 0], ["#sq", 0.8], ["#st", 3]] },
  { v: "03-让影子跟着跑", label: "方向 312°（几乎全落在青线上）", set: [["#sp", 312], ["#sq", 0.6], ["#st", 2]] },
  { v: "03-让影子跟着跑", label: "方向 180°、差最小 0.05、只跑 0.5 秒",
    set: [["#sp", 180], ["#sq", 0.05], ["#st", 0.5]] },

  { v: "04-纠正减在第一列", label: "两笔都拉到左下角", set: [["#s1", -1.5], ["#s2", -1]] },
  { v: "04-纠正减在第一列", label: "两笔都拉到右上角", set: [["#s1", 4.5], ["#s2", 3]] },
  { v: "04-纠正减在第一列", label: "压在「和为零」的竖线上", set: [["#s1", -0.2], ["#s2", 1]] },

  { v: "05-影子里那条线", label: "拧到 42.1°（盲方向）", set: [["#sph", 42.1], ["#slam", 1]] },
  { v: "05-影子里那条线", label: "拧到 132.1°（另一处盲方向）", set: [["#sph", 132.1], ["#slam", 1]] },
  { v: "05-影子里那条线", label: "回到 90°、力度拉满 10 倍", set: [["#sph", 90], ["#slam", 10]] },
];

async function open(page, v) {
  await installHooks(page);
  await page.goto(url(v), { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(150);
}
async function applySet(page, sc) {
  for (const [sel, val] of (sc.set || [])) await page.fill(sel, String(val));
  await page.waitForTimeout(150);
}
/* 世界坐标 → 画布像素。frame/pad/shift 必须与视角一致；
   反向对照时取景被写死成 FROZEN_FRAME，这里也跟着换。 */
function worldToPx(rect, frame, pad, shift, x, y) {
  const a = rect.w / rect.h;
  const e = a >= 1 ? { x0: -frame * a, x1: frame * a, y0: -frame, y1: frame }
                   : { x0: -frame, x1: frame, y0: -frame / a, y1: frame / a };
  const wx = x - shift[0], wy = y - shift[1];
  return {
    px: pad + (wx - e.x0) / (e.x1 - e.x0) * (rect.w - 2 * pad),
    py: rect.h - pad - (wy - e.y0) / (e.y1 - e.y0) * (rect.h - 2 * pad),
  };
}
async function dragBy(page, rect, from, to) {
  await page.mouse.move(rect.left + from.px, rect.top + from.py);
  await page.mouse.down();
  await page.mouse.move(rect.left + to.px, rect.top + to.py, { steps: 10 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(120);
}

/* ---------- B + C ---------- */
async function checkScenes(browser, shotsDir) {
  for (const sc of SCENARIOS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await open(page, sc.v);
    const tag = `${sc.v}/${sc.label}`;

    if (sc.drag) {
      const f = FIXED_FRAME[sc.v];
      const rect = await canvasRect(page);
      const frame = REVERSE ? FROZEN_FRAME : f.range;
      const from = worldToPx(rect, frame, f.pad, f.shift, sc.drag.from[0], sc.drag.from[1]);
      const to = worldToPx(rect, frame, f.pad, f.shift, sc.drag.to[0], sc.drag.to[1]);
      await dragBy(page, rect, from, to);
    }
    await applySet(page, sc);

    GROUP = "B";
    const trace = await getTrace(page);
    const per = checkInCanvas(trace, tag);
    if (per.length) {
      R.lines.push("  · " + tag + "  " + per.map((p) =>
        `#${p.id} ${p.w}×${p.h} 画了 ${p.n} 样，最近的一处离边 ${p.worst.toFixed(0)}px（${p.worstWhat}）`).join("；"));
    }

    GROUP = "C";
    const ro = await readout(page);
    const texts = (trace["cv"] ? trace["cv"].text : []).map((b) => b[4]);
    checkSemantics(sc, ro, texts, tag);

    if (shotsDir) {
      await page.screenshot({ path: path.join(shotsDir, "sc-" + tag.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "_") + ".png") });
    }
    await page.close();
  }

  /* ---------- D 约束对象：把记号拖到画布外面去 ---------- */
  GROUP = "D";
  for (const v of Object.keys(FIXED_FRAME)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await open(page, v);
    const f = FIXED_FRAME[v];
    const rect = await canvasRect(page);
    const frame = REVERSE ? FROZEN_FRAME : f.range;
    const tag = `${v}/拖到画布外面`;
    const grab = v.indexOf("01") === 0 ? [0.6, 0.4] : [3, 1];
    const from = worldToPx(rect, frame, f.pad, f.shift, grab[0], grab[1]);
    await dragBy(page, rect, from, { px: rect.w + 70, py: rect.h * 0.28 });
    const trace = await getTrace(page);
    const t = trace["cv"] || { dot: [], text: [] };
    const w = t.w || rect.w, h = t.h || rect.h;
    let worst = 1e9, worstWhat = "—";
    (t.dot || []).forEach((p) => {
      const m = Math.min(p[0], p[1], w - p[0], h - p[1]);
      if (m < worst) { worst = m; worstWhat = "圆点／空心圈"; }
      ok(m >= EDGE_MARGIN, `${tag} 拖出去之后记号仍在画布内`,
        `离边 ${m.toFixed(0)}px（画布 ${w.toFixed(0)}×${h.toFixed(0)}）`);
    });
    (t.text || []).forEach((b) => {
      const m = Math.min(b[0], b[1], w - b[2], h - b[3]);
      if (m < worst) { worst = m; worstWhat = "文字“" + b[4] + "”"; }
      ok(m >= TEXT_MARGIN, `${tag} 拖出去之后文字“${b[4]}”整块在画布内`, `离边 ${m.toFixed(0)}px`);
    });
    if (worst < 1e8) R.lines.push("  · " + tag + ` 最近的一处离边 ${worst.toFixed(0)}px（${worstWhat}）`);
    if (shotsDir) {
      await page.screenshot({ path: path.join(shotsDir, "drag-" + v.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "_") + ".png") });
    }
    await page.close();
  }
}

/* ---------- C：读数 ↔ 独立复算 ---------- */
function checkSemantics(sc, ro, texts, tag) {
  if (sc.v === "01-只看见一个数") {
    /* 读数那三行：y ＝ θ ＝ …、两个状态、两者之距。独立核对：
       ① y 就是第一个状态的 θ；② 两个状态的读数之差必须印成 0；
       ③ 代价 ＝ k₂·ω（k ＝ (3, 2.8)，把看不见的那个当零，差的就是 2.8ω）。 */
    const m = ro.match(/读数 y ＝ θ ＝ (-?[\d.]+)\n你测到的：θ ＝ (-?[\d.]+)，ω ＝ (-?[\d.]+)\n同一读数上的另一个：θ ＝ (-?[\d.]+)，ω ＝ (-?[\d.]+)/);
    if (!ok(!!m, `${tag} 读数里有 y、两个状态`, ro.replace(/\n/g, " ⏎ ").slice(0, 120))) return;
    const y = num(m[1]), t1 = num(m[2]), w1 = num(m[3]), t2 = num(m[4]), w2 = num(m[5]);
    ok(close(y, t1, 6e-3), `${tag} y 就是那个状态的 θ（不是别的量）`, `y ${y}，θ ${t1}`);
    ok(close(t1, t2, 6e-3), `${tag} 两个状态的 θ 相同——读数一个字都分不出来`, `θ ${t1} vs ${t2}`);
    const md = ro.match(/两个状态的读数之差 ＝ ([\d.]+)，它们本身相距 ([\d.]+)/);
    if (ok(!!md, `${tag} 读数里有"读数之差／本身相距"`)) {
      ok(num(md[1]) < 1e-9, `${tag} 读数之差确实是 0`, `读数 ${md[1]}`);
      const want = Math.hypot(t1 - t2, w1 - w2);
      ok(close(num(md[2]), want, 0.02), `${tag} 状态之间的距离与两点坐标对得上`,
        `读数 ${md[2]}，由坐标算是 ${want.toFixed(2)}`);
    }
    const mc = ro.indexOf("代价：") >= 0
      ? [ro.match(/代价：差了 ([\d.]+)/), ro.match(/该使的力 ＝ (-?[\d.]+)；把看不见的那个当零，算出来 ＝ (-?[\d.]+)/)]
      : [null, null];
    if (ok(!!mc[0] && !!mc[1], `${tag} 读数里有"该使的力／当零算／代价"`,
      ro.replace(/\n/g, " ⏎ ").slice(0, 140))) {
      ok(close(num(mc[0][1]), Math.abs(num(mc[1][1]) - num(mc[1][2])), 0.02),
        `${tag} "代价"就是那两笔力之差`, `${mc[0][1]} vs |${mc[1][1]}−${mc[1][2]}|`);
      ok(close(num(mc[1][2]), 3 * t1, 0.03), `${tag} "当零算"只用得到 θ（ω 那一份被扔了）`,
        `当零算 ${mc[1][2]}，3θ ＝ ${(3 * t1).toFixed(2)}`);
    }
    /* 名字/判词：图上那行字必须写着"读数都等于 y"，数字与读数一致 */
    const cap = texts.filter((s) => s.indexOf("这一整条线上的读数都等于") === 0)[0];
    ok(cap && close(num(cap.split("等于")[1]), y, 6e-3),
      `${tag} 图上那句"读数都等于…"里的数与读数栏一致`, `图上「${cap}」，读数 y ＝ ${y}`);
  }

  if (sc.v === "02-差分这条路") {
    /* 独立复算：θ(t) ＝ 0.2e^{λt}，λ 由二次方程解出；
       上界 ＝ θ(T)λ²h/2 + 2σ/h。读数里的"截断／噪声／上界"必须对得上这三条式子，
       且实测必须落在上界以内——这是本站在说的事，不能只印出来好看。 */
    const m = ro.match(/h ＝ ([\d.]+) 秒，σ ＝ ([\d.]+)，一共 (\d+) 个估计点/);
    if (!ok(!!m, `${tag} 读数里有 h、σ、点数`, ro.replace(/\n/g, " ⏎ ").slice(0, 120))) return;
    const h = num(m[1]), sig = num(m[2]), n = parseInt(m[3], 10);
    /* 采样从 0 到 T，步长 h：一共 floor(T/h)+1 个点，差分只能在中点上给出 floor(T/h) 个估计 */
    ok(n === Math.max(2, Math.floor(1.5 / h + 1e-9)), `${tag} 估计点数 ＝ 采样数 − 1（T ＝ 1.5）`,
      `读数 ${n}，算 ${Math.floor(1.5 / h + 1e-9)}`);
    const mm = ro.match(/实测最大误差 ＝ ([\d.]+)/);
    const mb = ro.match(/上界 ＝ ([\d.]+) ＝ 截断 ([\d.]+) ＋ 噪声 ([\d.]+)/);
    if (!ok(!!mm && !!mb, `${tag} 读数里有实测、上界、两笔账`)) return;
    const meas = num(mm[1]), bound = num(mb[1]), trunc = num(mb[2]), noise = num(mb[3]);
    const thT = 0.2 * Math.exp(LAM1 * 1.5);
    ok(close(trunc, thT * LAM1 * LAM1 * h / 2, 0.004), `${tag} 截断项与独立复算一致`,
      `读数 ${trunc}，算 ${(thT * LAM1 * LAM1 * h / 2).toFixed(3)}`);
    ok(close(noise, 2 * sig / h, 0.004), `${tag} 噪声项与独立复算一致`,
      `读数 ${noise}，算 ${(2 * sig / h).toFixed(3)}`);
    ok(close(bound, trunc + noise, 0.006), `${tag} 上界就是两笔账相加`, `${bound} vs ${(trunc + noise).toFixed(3)}`);
    ok(meas <= bound + 0.004, `${tag} 实测落在上界以内（这条上界真管用）`, `实测 ${meas}，上界 ${bound}`);
  }

  if (sc.v === "03-让影子跟着跑") {
    /* 独立复算：c₁、c₂ 是把 e₀ 按 exact 特征方向分解出来的系数
       （v₁ ＝ (1,λ₁)、v₂ ＝ (1,λ₂)，λ 由二次方程解出）；
       T 秒后的偏差 ＝ |c₁e^{λ₁T}v₁ + c₂e^{λ₂T}v₂|。 */
    const m = ro.match(/初值差 ([\d.]+)，方向 (\d+)°\n按两条方向分开：c₁ ＝ (-?[\d.]+)（配 λ₁ ＝ \+0\.905），c₂ ＝ (-?[\d.]+)/);
    if (!ok(!!m, `${tag} 读数里有初值差、方向、两个系数`, ro.replace(/\n/g, " ⏎ ").slice(0, 140))) return;
    const mag = num(m[1]), deg = num(m[2]), c1 = num(m[3]), c2 = num(m[4]);
    const r = deg * Math.PI / 180, e0x = mag * Math.cos(r), e0y = mag * Math.sin(r);
    /* 特征方向取单位向量 (1,λ)/√(1+λ²)——core 里给的就是单位向量，
       按 (1,λ) 直接解会差一个 √(1+λ²) 的因子，看着像"页面上算错了"。 */
    const n1 = Math.hypot(1, LAM1), n2 = Math.hypot(1, LAM2);
    const v1x = 1 / n1, v1y = LAM1 / n1, v2x = 1 / n2, v2y = LAM2 / n2;
    const dd = v1x * v2y - v1y * v2x;
    const want1 = (e0x * v2y - e0y * v2x) / dd;
    const want2 = (v1x * e0y - v1y * e0x) / dd;
    /* 特征向量的正负号是任意的（v 与 −v 是同一条线），core 给的 v₂ 就取了反号——
       所以核对"数值对不对"用大小，核对"是不是同一条分解"用重建：
       c₁v₁ + c₂v₂ 应该回到 e₀（v₂ 允许整体换号，换成哪种都得回到 e₀）。 */
    ok(close(Math.abs(c1), Math.abs(want1), 0.006) && close(Math.abs(c2), Math.abs(want2), 0.006),
      `${tag} c₁、c₂ 的大小与独立分解一致`, `读数 ${c1}/${c2}，算 ${want1.toFixed(3)}/${want2.toFixed(3)}`);
    const recOf = (s) => [c1 * v1x + s * c2 * v2x, c1 * v1y + s * c2 * v2y];
    const errOf = (q) => Math.hypot(q[0] - e0x, q[1] - e0y);
    const e1 = errOf(recOf(1)), e2 = errOf(recOf(-1));
    ok(Math.min(e1, e2) < 0.01, `${tag} 按特征方向再拼回去正好是初值差 e₀`,
      `两种号分别拼回 (${recOf(1)[0].toFixed(2)}, ${recOf(1)[1].toFixed(2)})／(${recOf(-1)[0].toFixed(2)}, ${recOf(-1)[1].toFixed(2)})，e₀ ＝ (${e0x.toFixed(2)}, ${e0y.toFixed(2)})`);
    const sgn = e1 <= e2 ? 1 : -1;
    const mv = ro.match(/跑了 ([\d.]+) 秒以后，偏差 ＝ ([\d.]+)/);
    if (ok(!!mv, `${tag} 读数里有 T 与偏差`)) {
      const T = num(mv[1]), got = num(mv[2]);
      const ax = c1 * Math.exp(LAM1 * T), bx = sgn * c2 * Math.exp(LAM2 * T);
      const want = Math.hypot(ax * v1x + bx * v2x, ax * v1y + bx * v2y);
      ok(close(got, want, 0.006), `${tag} 偏差与闭式解一致`, `读数 ${got}，算 ${want.toFixed(3)}`);
    }
    const mf = ro.match(/两条路差 ([\deE.+-]+)/);
    ok(!!mf && num(mf[1]) < 1e-6, `${tag} 两条算路（矩阵指数／乘倍数）互相印证`, mf ? mf[1] : "没印");
    /* 判词必须跟"偏差里有多少落在红线上"一致：落在红线上多 → 越差越远 */
    const pct = Math.abs(want1) / (Math.abs(want1) + Math.abs(want2) + 1e-12);
    ok((ro.indexOf("越差越远") >= 0) === (pct > 0.02),
      `${tag} 判词与几何一致（偏差里红线成分 ${(pct * 100).toFixed(0)}%）`,
      `读数「${(ro.match(/判词：[^—]*/) || ["（没写）"])[0]}」`);
  }

  if (sc.v === "04-纠正减在第一列") {
    /* 独立复算：A−LC 的和 ＝ −(l₁+c)、积 ＝ l₁c + l₂ − a；
       两个倍数由 λ² + (l₁+c)λ + (l₁c+l₂−a) ＝ 0 解出，不借页面那套。 */
    const m = ro.match(/L ＝ \((-?[\d.]+), (-?[\d.]+)\)\nA−LC ＝ \[ (-?[\d.]+)  (-?[\d.]+) \]\n\s+\[ (-?[\d.]+)  (-?[\d.]+) \]/);
    if (!ok(!!m, `${tag} 读数里有 L 与闭环那张表`, ro.replace(/\n/g, " ⏎ ").slice(0, 140))) return;
    const l1 = num(m[1]), l2 = num(m[2]);
    const Ma = num(m[3]), Mb = num(m[4]), Mc = num(m[5]), Md = num(m[6]);
    /* 那张表本身：减的只该落在第一列（第 12 篇的 b·k 改的是第二行） */
    ok(close(Mb, 1, 1e-9) && close(Md, -A_C, 1e-9), `${tag} A−LC 的第二列一动不动（减的只落在第一列）`,
      `第二列 ＝ (${Mb}, ${Md})，应是 (1, −0.2)`);
    ok(close(Ma, -l1, 6e-3) && close(Mc, A_A - l2, 6e-3), `${tag} 第一列 ＝ (−l₁, a−l₂)`,
      `读到 (${Ma}, ${Mc})，算 (−${l1}, ${(A_A - l2).toFixed(2)})`);
    const ms = ro.match(/判据：和 ＝ −\(l₁ \+ c\) ＝ (-?[\d.]+)；积 ＝ l₁c \+ l₂ − a ＝ (-?[\d.]+)/);
    if (!ok(!!ms, `${tag} 读数里有和与积`)) return;
    const sum = num(ms[1]), prod = num(ms[2]);
    ok(close(sum, -(l1 + A_C), 6e-3), `${tag} 和与 l₁、c 对得上`, `${sum} vs ${-(l1 + A_C)}`);
    ok(close(prod, l1 * A_C + l2 - A_A, 6e-3), `${tag} 积与 l₁、l₂、a 对得上`, `${prod} vs ${(l1 * A_C + l2 - A_A).toFixed(3)}`);
    /* 判词：两个根都落在左半边 ⟺ 和 < 0 且 积 > 0（这是本站要教的那句话本身） */
    const stable = sum < 0 && prod > 0;
    const say = ro.indexOf("判词：偏差自己回来") >= 0 ? "回"
              : (ro.indexOf("判词：偏差跑掉") >= 0 ? "跑" : "零");
    ok(say === (stable ? "回" : (prod < 0 ? "跑" : "零")),
      `${tag} 判词与"和／积"独立判出来的结论一致`,
      `读数 ${say}，由和 ${sum}、积 ${prod} 判应是 ${stable ? "回" : (prod < 0 ? "跑" : "零")}`);
  }

  if (sc.v === "05-影子里那条线") {
    /* 独立复算：det[C; CA] ＝ c₁² − c·c₁c₂ − a·c₂²（这一行是本站的判据）。
       再逐行按 A−LC 自己解一遍特征值（不借页面那套），
       然后问："λ_j 这个值在五组 L 里还在不在"——按值找，不按槽位找：
       两个根会交叉，按槽位比会把纹丝不动的那个也算成在动。 */
    const m = ro.match(/c ＝ \((-?[\d.]+), (-?[\d.]+)\)/);
    const md = ro.match(/O ＝ \[C; CA\] 的交叉相减 ＝ (-?[\d.]+)/);
    if (!ok(!!m && !!md, `${tag} 读数里有 c 与交叉相减`, ro.replace(/\n/g, " ⏎ ").slice(0, 140))) return;
    const c1 = num(m[1]), c2 = num(m[2]), got = num(md[1]);
    const want = detO(c1, c2);
    ok(close(got, want, 6e-3), `${tag} 交叉相减与独立复算一致`, `读数 ${got}，算 ${want.toFixed(4)}`);

    /* A−LC 的两行：A ＝ [[0,1],[a,−c]]，C ＝ (c₁,c₂)，L ＝ (g,g) */
    const lamOf = (g) => {
      const m11 = -g * c1, m12 = 1 - g * c2, m21 = A_A - g * c1, m22 = -A_C - g * c2;
      const tr = m11 + m22, de = m11 * m22 - m12 * m21;
      const d = tr * tr - 4 * de;
      if (d < 0) return [tr / 2, tr / 2];          // 复根时只比实部（本站盲方向都在实根一侧）
      return [(tr + Math.sqrt(d)) / 2, (tr - Math.sqrt(d)) / 2];
    };
    const rows = (ro.match(/L ＝ \((-?[\d.]+), (-?[\d.]+)\) → (-?[\d.]+) \/ (-?[\d.]+)/g) || []);
    ok(rows.length === 5, `${tag} 五组 L 各印了一行`, `实际 ${rows.length} 行`);
    const parsed = rows.map((s) => {
      const q = s.match(/L ＝ \((-?[\d.]+), (-?[\d.]+)\) → (-?[\d.]+) \/ (-?[\d.]+)/);
      return { g: num(q[1]), lam: [num(q[3]), num(q[4])] };
    });
    const bad = parsed.filter((r) => {
      const mine = lamOf(r.g).sort((a, b) => b - a), got2 = r.lam.slice().sort((a, b) => b - a);
      /* 容差要跟着力度放大：读数里的 c 只印到三位小数，
         近盲时特征值对 c 的敏感度是 L 的量级，L 越大，这点舍入被放得越开。 */
      const tol = 6e-3 + 2e-3 * Math.abs(r.g);
      return !close(mine[0], got2[0], tol) || !close(mine[1], got2[1], tol);
    });
    ok(bad.length === 0, `${tag} 五组 L 的两个倍数都与独立复算一致`,
      bad.length ? `L ＝ ${bad[0].g} 读到 ${bad[0].lam.join(" / ")}，算 ${lamOf(bad[0].g).map((v) => v.toFixed(3)).join(" / ")}` : "");

    /* 钉死与否：λ_j 这个值在每一组里都还找得到（精度取读数印得出的 5e−4）。
       近盲方向够不着"精确为 0"，所以判据按"另一个挪了多少"来定：
       不到另一个的 2%、或小到印不出来，就算"几乎不动"。 */
    const base = [LAM1, LAM2];
    const driftOf = (j) => Math.max(...parsed.map((r) => Math.min(...r.lam.map((v) => Math.abs(v - base[j])))));
    const dr = [driftOf(0), driftOf(1)];
    const pinnedOf = (j) => dr[j] < Math.max(5e-4, 0.02 * dr[1 - j]);
    const pinned = [0, 1].filter(pinnedOf).length;
    const isBlind = Math.abs(want) < 5e-3;
    ok(pinned === (isBlind ? 1 : 0), `${tag} 几乎不动的个数与交叉相减同进同退（盲：${isBlind}）`,
      `交叉相减 ${want.toFixed(4)}，独立算出不动 ${pinned} 个（λ₁ 漂 ${dr[0].toFixed(4)}、λ₂ 漂 ${dr[1].toFixed(4)}）`);
    const mm = ro.match(/钉死不动的一共 (\d) 个（动的 (\d) 个）/);
    ok(!!mm && parseInt(mm[1], 10) === pinned, `${tag} 读数说"钉死几个"与独立复算一致`,
      `读数「${mm ? mm[0] : "没印"}」，算 ${pinned}`);
    const blindSay = ro.indexOf("判词：追不上") >= 0;
    ok(blindSay === isBlind, `${tag} 判词（追不上／追得上）与交叉相减是否为零一致`,
      `交叉相减 ${want.toFixed(4)}，读数「${(ro.match(/判词：[^—]*/) || ["（没写）"])[0]}」`);
  }
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  await checkLayout(browser);
  await checkScenes(browser, SHOTS);
  await browser.close();

  console.log("────────────────────────");
  if (R.lines.length) console.log("取景实测：\n" + R.lines.join("\n"));
  const byG = Object.keys(R.byGroup).sort().map((g) => `${g} 组 ${R.byGroup[g]} 条`).join("、") || "无";
  if (REVERSE) {
    console.log(`反向对照：把四个故障装回去后，${R.fail} 条断言报错（${byG}）、${R.pass} 条仍通过。`);
    const groups = ["A", "B", "C", "D"];
    const missing = groups.filter((g) => !R.byGroup[g]);
    if (R.details.length) {
      const seen = {};
      console.log(R.details.filter((d) => {
        const g = (d.match(/^ {2}\[(\w+)\]/) || [])[1] || "?";
        seen[g] = (seen[g] || 0) + 1;
        return seen[g] <= 4;
      }).join("\n"));
    }
    console.log(R.fail > 0 && missing.length === 0
      ? "OK：四组都抓得住（不是空转的）。"
      : "问题：" + (missing.length ? missing.join("、") + " 组一条都没报错——那组是空转的；" : "") +
        (R.fail ? "" : "故障装回去了却全绿，必须重做。"));
    process.exit(R.fail > 0 && missing.length === 0 ? 0 : 1);
  }
  console.log(`断言：${R.pass} 通过，${R.fail} 失败。`);
  if (R.details.length) console.log(R.details.join("\n"));
  process.exit(R.fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", (e && e.stack) || e); process.exit(1); });
