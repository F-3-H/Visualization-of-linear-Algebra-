/* ============================================================
 * tools/verify-views-layout.cjs —— 真实浏览器里的验收（《让会倒的东西站住》）
 *
 * 跑法：node tools/verify-views-layout.cjs [--reverse] [--shots=目录]
 * 依赖：playwright-core（驱动）+ 本机 Chrome/Edge（可用 CHROME_PATH 指定）
 *
 * 为什么单列这一条：verify-repo-style.cjs 读源码、smoke-dom.cjs 在 DOM 桩件里
 * 跑脚本——两者都测不到「排版」，也测不到「一个数算出来的结论有没有落到画里」。
 * 只有真实浏览器量得出 getBoundingClientRect，也只有在真实画布上取证，
 * 才能判断"读数里量得出的"与"图上看得见的"是不是同一件事。
 *
 * 四组断言：
 *   A 布局（五个视角 × 两种视口）
 *     A1 画布横向、A2 没被压没、A3 整个画布在首屏内、A4 页面不超长、A5 无控制台错误
 *   B 取景（五视角 × 十九个场景，每个都是"读者能做出的极端输入"）
 *     B1 记录下来的箭头端点/圆点/空心圈/文字框都必须落在画布内
 *     B2 读数里点明了本站在说什么（"严丝合缝"／"纹丝不动"／"做不到"…）
 *   C 语义（读数 ↔ Node 侧按同一组输入独立复算）
 *     C1 判词一致、C2 两个倍数一致、C3 关键量一致、C4 误差量为 0、
 *     C5 「哪条特征线叫什么名字」由几何独立算出，再回头核对页面上印的字
 *   D 约束对象（01/04/05 画框固定，拖动不许出框）
 *     D1 把对象拖到画布外面去，它必须还在画布内
 *
 * --reverse：把五个故障装回去（画布回到固有比例、取景写死成 0.9、
 * 夹取变成恒等、判词正负判反、读数里两条线的名字对调）。同一套断言必须按组报错——
 * 若仍全绿，或某一组一条都没报，说明那组是空转的。
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VIEWS = ["01-站不住的点", "02-内因改不动", "03-把线接回来", "04-把倍数搬家", "05-搬不动的时候"];
const VIEWPORTS = [{ w: 1280, h: 900 }, { w: 1024, h: 700 }];
const EDGE_MARGIN = 8;                // 数据类记号离画布边缘的最小距离
const TEXT_MARGIN = 2;                // 文字整块（含右边缘）
const BODY_MIN_AR = 1.2;
const PAD = 34;
/* 三个画框固定的视角：图里有必须原地对读的标尺，所以取景不动、约束对象。 */
const FIXED_FRAME = { "01-站不住的点": 2.6, "04-把倍数搬家": 3, "05-搬不动的时候": 2.6 };
const FROZEN_FRAME = 0.9;             // 故障②：取景被写死成这个数

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
 * 五个故障全都装在同一个 addInitScript 里、同一个 setter 里（⑤ 例外：
 * 它改的是读数的文字，装在 DOMContentLoaded 上）。
 * 上一次的教训：多个 addInitScript 各自包 window.Draw 的 setter 会互相覆盖，
 * 结果故障只装了一半、反向对照变成空转——那次反向只报出 26 条、全是 A 组。
 * 这一次 window.Draw 与 window.Lin 各只有一个 setter，Draw 的四个包装
 * （create / setRange / clamp / 记录）也在同一个 setter 内一次装完。 */
async function installHooks(page) {
  await page.addInitScript((opts) => {
    window.__trace = {};

    /* ① 画布回到"固有比例"：必须在页面脚本之前生效。canvas 的固有比例取自
       它的位图尺寸，而视角脚本一开始就 resize() 把位图同步成 3:2——
       事后再注入 CSS 已经改不动，故障会被无声地治好（上一次栽在这里，A 组全绿）。 */
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
          /* ② 取景写死：把因变量当自变量用（上一次这条写在 README 的第一条规矩里）。 */
          const view = opts.faultRange
            ? orig.call(v, cv, Object.assign({}, o, { range: opts.frozenFrame }))
            : orig.call(v, cv, o);
          if (opts.faultRange) {
            const sr = view.setRange;
            view.setRange = function () { sr.call(view, opts.frozenFrame); };
          }
          /* ③ 夹取变成恒等：画框固定时"约束对象"这条规矩被拆掉，
             读者把点拖到画布外面，它就真的出去了。 */
          if (opts.faultClamp) view.clamp = function (p) { return p; };

          if (opts.trace) {
            const A = view.arrow, Dt = view.dot, Rg = view.ring, T = view.text, C = view.clear;
            view.clear = function () {
              window.__trace[cv.id] = { w: view.width(), h: view.height(), arrow: [], dot: [], text: [] };
              return C.call(view);
            };
            view.arrow = function (p, q, o2) {
              const t = window.__trace[cv.id]; if (t) t.arrow.push([view.sx(p.x), view.sy(p.y), view.sx(q.x), view.sy(q.y)]);
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
              return T.call(view, p, s, o2);
            };
          }
          return view;
        };
        d = v;
      },
    });

    /* ④ 判词正负判反（C 组），并把搬家算错一点点（C 组里 04 的那一条）。
       读数是页面用 Lin 算的，Node 侧用真 core 复算——两边一分开，
       这两条错就只出现在"图上那一半"，正是 C 组要抓的东西。 */
    let l;
    Object.defineProperty(window, "Lin", {
      configurable: true,
      get() { return l; },
      set(v) {
        if (opts.faultSemantic) {
          const v0 = v.verdict;
          v.verdict = function (M, e) {
            const r = v0(M, e);
            return r === "跑" ? "回" : (r === "回" ? "跑" : r);
          };
          const p0 = v.placePolesST;
          v.placePolesST = function (A, b, s, t) {
            const k = p0(A, b, s, t);
            return k ? { x: k.x + 0.3, y: k.y } : k;
          };
        }
        l = v;
      },
    });

    /* ⑤ 把读数里两条特征方向的名字对调：数值一个不动，可"哪条线叫什么"整体反了。
       上一次真实漏掉的就是这一类——结论（还救得回来／没救）是对的，名字（跑掉／回来）
       却写反了，而当时 C 组只核数值，一个字都没碰文案，于是全绿通过。
       这一类错抓不到的办法是"再用页面自己的话去核对自己"，必须由 Node 侧从
       几何独立算出"b 落在哪条线"，再回头核对页面上印的名字。 */
    if (opts.faultNameSwap) {
      window.addEventListener("DOMContentLoaded", () => {
        const el = document.getElementById("ro");
        if (!el) return;
        const d = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
        const swap = (s) => s
          .replace(/「跑掉」/g, "「\u0000」")
          .replace(/「回来」/g, "「跑掉」")
          .replace(/「\u0000」/g, "「回来」");
        Object.defineProperty(el, "innerHTML", {
          configurable: true,
          get() { return d.get.call(this); },
          set(v) { d.set.call(this, typeof v === "string" ? swap(v) : v); },
        });
      });
    }
  }, {
    faultCanvas: REVERSE, faultRange: REVERSE, faultClamp: REVERSE, faultSemantic: REVERSE,
    faultNameSwap: REVERSE,
    frozenFrame: FROZEN_FRAME, trace: true,
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

/* ---------- 通用：把记录下来的记号逐条对账"在不在画布内" ---------- */
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

/* ---------- 场景 ---------- */
const SCENARIOS = [
  { v: "01-站不住的点", label: "阻尼归零（无阻尼，荡个不停）", set: [["#sc", 0]] },
  { v: "01-站不住的点", label: "阻尼拉满 3", set: [["#sc", 3]] },
  { v: "02-内因改不动", label: "a 拉到 2.5、c 拉到 3（角上）", set: [["#sa", 2.5], ["#sc", 3]] },
  { v: "02-内因改不动", label: "a 拉到 −2、c 归零（另一只角）", set: [["#sa", -2], ["#sc", 0]] },
  { v: "03-把线接回来", label: "不接线（k ＝ 0，两族曲线严丝合缝）", click: ["#b0"],
    says: ["严丝合缝"] },
  { v: "03-把线接回来", label: "搬到 −1 与 −2", click: ["#b2"] },
  { v: "03-把线接回来", label: "k 两根都拉满", set: [["#sk1", 5], ["#sk2", 5]] },
  { v: "03-把线接回来", label: "刚好抵消（k₁ ＝ a，判词绕）", click: ["#b1"] },
  { v: "04-把倍数搬家", label: "默认 −1 与 −2" },
  { v: "04-把倍数搬家", label: "一对共轭 −1±2i", click: ["#b2"] },
  { v: "04-把倍数搬家", label: "重根 −2", click: ["#b3"] },
  { v: "04-把倍数搬家", label: "一个跑到右边（判词跑）", click: ["#b4"] },
  { v: "04-把倍数搬家", label: "把目标拖成不共轭（会发现做不到）",
    drag: { view: "04-把倍数搬家", fromWorld: [-1, 0], toWorld: [-1, 1.2] }, says: ["做不到"] },
  { v: "05-搬不动的时候", label: "一般的 b（够得着）", click: ["#b1"], says: ["能控："] },
  { v: "05-搬不动的时候", label: "b 对准跑掉那条线（够不着，但还救得回来）", click: ["#b2"],
    says: ["够不着", "纹丝不动", "还救得回来", "落在「跑掉」"] },
  { v: "05-搬不动的时候", label: "b 对准回来那条线（够不着，且没救）", click: ["#b3"],
    says: ["没救了", "落在「回来」"] },
  { v: "05-搬不动的时候", label: "偏一点点（力气在爆掉）", click: ["#b4"] },
];

async function open(page, v) {
  await installHooks(page);
  await page.goto(url(v), { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(150);
}
async function applySet(page, sc) {
  for (const sel of (sc.click || [])) await page.click(sel);
  for (const [sel, val] of (sc.set || [])) await page.fill(sel, String(val));
  await page.waitForTimeout(150);
}
/* 按世界坐标把某个记号拖走（frame/pad 必须与视角一致；
   反向对照时取景被写死成 FROZEN_FRAME，所以这里也跟着换）。 */
function worldToPx(rect, frame, pad, x, y) {
  const a = rect.w / rect.h;
  const e = a >= 1 ? { x0: -frame * a, x1: frame * a, y0: -frame, y1: frame }
                   : { x0: -frame, x1: frame, y0: -frame / a, y1: frame / a };
  return {
    px: pad + (x - e.x0) / (e.x1 - e.x0) * (rect.w - 2 * pad),
    py: rect.h - pad - (y - e.y0) / (e.y1 - e.y0) * (rect.h - 2 * pad),
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

/* ---------- B 取景 + B2 读数的措辞 + C 语义 + D 约束对象 ---------- */
async function checkScenes(browser, Lin, shotsDir) {
  for (const sc of SCENARIOS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await open(page, sc.v);
    const rect = await canvasRect(page);
    const frame = REVERSE ? FROZEN_FRAME : (FIXED_FRAME[sc.v] || 3);

    if (sc.drag) {
      const from = worldToPx(rect, frame, PAD, sc.drag.fromWorld[0], sc.drag.fromWorld[1]);
      const to = worldToPx(rect, frame, PAD, sc.drag.toWorld[0], sc.drag.toWorld[1]);
      await dragBy(page, rect, from, to);
    }
    await applySet(page, sc);

    GROUP = "B";
    const tag = `${sc.v}/${sc.label}`;
    const trace = await getTrace(page);
    const per = checkInCanvas(trace, tag);
    if (per.length) {
      R.lines.push("  · " + tag + "  " + per.map((p) => `#${p.id} ${p.w}×${p.h} 画了 ${p.n} 样，最近的一处离边 ${p.worst.toFixed(0)}px（${p.worstWhat}）`).join("；"));
    }
    const ro = await readout(page);
    for (const s of (sc.says || [])) {
      ok(ro.indexOf(s) >= 0, `${tag} 读数里点明了「${s}」`, ro.replace(/\n/g, " ⏎ ").slice(0, 120));
    }

    GROUP = "C";
    checkSemantics(sc, ro, Lin, tag);

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
    const rect = await canvasRect(page);
    const tag = `${v}/拖到画布外面`;
    /* 抓住记号，往右边画布之外拖——没有夹取的话它就真的出去了 */
    const grab = { "01-站不住的点": [0.5, 1.5], "04-把倍数搬家": [-1, 0], "05-搬不动的时候": [0, 1] }[v];
    const frame = REVERSE ? FROZEN_FRAME : FIXED_FRAME[v];
    const from = worldToPx(rect, frame, PAD, grab[0], grab[1]);
    await dragBy(page, rect, from, { px: rect.w + 70, py: rect.h * 0.28 });
    const trace = await getTrace(page);
    const t = trace["cv"] || { dot: [] };
    const w = t.w || rect.w, h = t.h || rect.h;
    let worst = 1e9, worstWhat = "—";
    (t.dot || []).forEach((p) => {
      const m = Math.min(p[0], p[1], w - p[0], h - p[1]);
      if (m < worst) { worst = m; worstWhat = "圆点／空心圈"; }
      ok(m >= EDGE_MARGIN, `${tag} 拖出去之后记号仍在画布内`, `离边 ${m.toFixed(0)}px（画布 ${w.toFixed(0)}×${h.toFixed(0)}）`);
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

/* ---------- C：读数 ↔ Node 侧独立复算 ---------- */
function num(s) { return parseFloat(s); }
function checkSemantics(sc, ro, Lin, tag) {
  const A0 = Lin.stickMat(1, 0.2), B = Lin.B_STICK;

  if (sc.v === "01-站不住的点") {
    const m = ro.match(/ω′ = 1\.00·θ − ([\d.]+)·ω/);
    if (!ok(!!m, `${tag} 读数里有那一行表`)) return;
    const M = Lin.stickMat(1, num(m[1]));
    ok(Lin.verdict(M) === "跑", `${tag} 判词与独立复算一致`, "复算 " + Lin.verdict(M));
    const mr = ro.match(/两个倍数：λ₁ ＝ ([+\-]?[\d.]+)，λ₂ ＝ ([+\-]?[\d.]+)/);
    if (ok(!!mr, `${tag} 读数里有两个倍数`)) {
      const e = Lin.eigen(M);
      ok(Math.abs(num(mr[1]) - e.l1) < 0.011 && Math.abs(num(mr[2]) - e.l2) < 0.011,
        `${tag} 两个倍数与独立复算一致`, `读数 ${mr[1]}/${mr[2]}，复算 ${e.l1.toFixed(2)}/${e.l2.toFixed(2)}`);
    }
  }

  if (sc.v === "02-内因改不动") {
    const m = ro.match(/a ＝ (-?[\d.]+)　c ＝ ([\d.]+)/);
    if (!ok(!!m, `${tag} 读数里有 a 与 c`)) return;
    const M = Lin.stickMat(num(m[1]), num(m[2]));
    const mv = ro.match(/最大实部 ＝ ([+\-]?[\d.]+)/);
    if (ok(!!mv, `${tag} 读数里有最大实部`)) {
      ok(Math.abs(num(mv[1]) - Lin.maxReal(M)) < 1e-3, `${tag} 最大实部与独立复算一致`,
        `读数 ${mv[1]}，复算 ${Lin.maxReal(M).toFixed(3)}`);
    }
    ok(ro.indexOf("判词：" + Lin.verdict(M)) >= 0, `${tag} 判词与独立复算一致`, "复算 " + Lin.verdict(M));
  }

  if (sc.v === "03-把线接回来") {
    const m = ro.match(/闭环 ＝ A − b·k ＝ \[\[0, 1\], \[([\d.\-]+), ([\d.\-]+)\]\]/);
    if (!ok(!!m, `${tag} 读数里有闭环那张表`)) return;
    const k1 = 1 - num(m[1]), k2 = -0.2 - num(m[2]);
    const Acl = Lin.closeLoop(A0, B, Lin.vec(k1, k2));
    ok(ro.indexOf("闭环判词 " + Lin.verdict(Acl)) >= 0, `${tag} 闭环判词与独立复算一致`,
      `由读数反解 k ＝ (${k1.toFixed(2)}, ${k2.toFixed(2)})，复算 ${Lin.verdict(Acl)}`);
    ok(ro.indexOf("开环判词 跑") >= 0, `${tag} 开环判词恒为跑（那根棍子与 k 无关）`);
  }

  if (sc.v === "04-把倍数搬家") {
    /* 判别用"与目标差"而不是"做不到"：说得出"能做到"的那一支，
       反例那行里也会提一句"立刻变成做不到"。 */
    const solved = ro.indexOf("与目标差") >= 0;
    if (solved) {
      const d = ro.match(/与目标差 (\S+)/);
      if (ok(!!d, `${tag} 读数里有"与目标差"`)) {
        ok(num(d[1]) < 1e-9, `${tag} 目标与实得之间的误差在 1e−9 以内`, `读数 ${d[1]}`);
      }
    } else {
      ok(/和 s ＝ [+\-]?[\d.]+[+\-][\d.]+i/.test(ro) && /积 t ＝ [+\-]?[\d.]+[+\-][\d.]+i/.test(ro),
        `${tag} 读数给出了 s、t 的虚部（说明做不到出在结构上）`, ro.replace(/\n/g, " ⏎ ").slice(0, 140));
    }
  }

  if (sc.v === "05-搬不动的时候") {
    const mb = ro.match(/b ＝ \((-?[\d.]+), (-?[\d.]+)\)/);
    const md = ro.match(/det\[b, A·b\] ＝ (\S+)，夹角 ＝ ([\d.]+)°/);
    if (!ok(!!mb && !!md, `${tag} 读数里有 b、面积与夹角`)) return;
    const b = Lin.vec(num(mb[1]), num(mb[2]));
    const got = Lin.det(Lin.controlMatrix(A0, b));
    ok(Math.abs(num(md[1]) - got) <= Math.abs(got) * 0.02 + 0.01, `${tag} 面积与独立复算一致`,
      `读数 ${md[1]}，复算 ${got.toExponential(2)}`);
    /* 能控与否不拿"读数里那个只印到三位小数的 b"去复算：退化是一处点，
       舍入之后的 b 已经不在那处点了（这正是读数栏里单列夹角的原因）。
       改成两条各自站得住的核对：读数自洽（说够不着就得给出 0 面积与 0 夹角），
       以及读数与"精确的特征方向"之间的核对。 */
    const saysCtl = ro.indexOf("能控：") >= 0;
    if (saysCtl) {
      ok(Math.abs(num(md[1])) > 0 && num(md[2]) > 0.1,
        `${tag} 说"够得着"，它给出的面积与夹角就都不为零`, `读数 det ${md[1]}、夹角 ${md[2]}°`);
      const k = Lin.placePoles(A0, b, -1, -2);
      const v = k ? Lin.verdict(Lin.closeLoop(A0, b, k)) : null;
      const mm = ro.match(/判词 (回|跑|绕)/);
      ok(!!mm && mm[1] === v, `${tag} 闭环判词与独立复算一致`, `读数 ${mm ? mm[1] : "—"}，复算 ${v}`);
    } else {
      ok(Math.abs(num(md[1])) < 1e-9, `${tag} 说"够不着"，给出的面积也确实塌到了 0`, `读数 ${md[1]}`);
      /* 夹角按"两条直线"算：b 与 A·b 反向（差 180°）时也是排成一条直线，
         这正是 b 对准"回来"那条线上的情形（A·v ＝ λv，λ ＜ 0）。 */
      const flat = Math.min(num(md[2]), 180 - num(md[2]));
      ok(flat < 0.01, `${tag} 说"够不着"，给出的夹角也确实把两列拉平了`, `读数 ${md[2]}°（折到 0 方向 ${flat.toFixed(3)}°）`);
      const e = Lin.eigen(A0);
      const exact = [e.v1, e.v2].map((q) => Lin.controllable(A0, Lin.scale(q, 1)));
      ok(exact.every((x) => x === false) && Lin.placePoles(A0, Lin.scale(e.v1, 1), -1, -2) === null,
        `${tag} 而两根特征方向上确实都够不着、也解不出力（用精确方向独立复算）`);

      /* 「哪条线该叫什么名字」由 Node 侧从几何独立算出来，再回头核对页面上印的字。
         这一条是上一版缺的：当时 C 组只核数值，而"结论对、名字错"这种错法
         在数值上一点看不出来——b 落在跑线上该说「还救得回来」，落在回线上该说
         「没救了」，两句话的前提正是那条线的名字。
         b ∝ v_j 时够不着的是另一个模式（左特征向量 w_i·b ＝ 0，i ≠ j），所以：
           b 落在「跑掉」那条线（λ₁ ＝ +0.905）上 → 够不着的是 −1.105 那个 → 还救得回来
           b 落在「回来」那条线（λ₂ ＝ −1.105）上 → 够不着的是 +0.905 那个 → 没救 */
      const onRunLine = Math.abs(Lin.cross(b, e.v1)) <= Math.abs(Lin.cross(b, e.v2));
      const wantLine = onRunLine ? "跑掉" : "回来";
      ok(ro.indexOf("落在「" + wantLine + "」") >= 0,
        `${tag} 报得出 b 落在哪条线，且名字与几何一致`,
        `读数写的 ${(ro.match(/落在「[^」]*」/) || ["（没写）"])[0]}，几何独立算出应是「${wantLine}」`);
      ok((ro.indexOf("还救得回来") >= 0) === onRunLine,
        `${tag} 「还救得回来／没救」与 b 落在哪条线一致`,
        `几何独立算出落在「${wantLine}」那条线，应当${onRunLine ? "还救得回来" : "没救了"}`);
    }
  }
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
  const Lin = require(path.join(ROOT, "assets", "core.js"));
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  await checkLayout(browser);
  await checkScenes(browser, Lin, SHOTS);
  await browser.close();

  console.log("────────────────────────");
  if (R.lines.length) console.log("取景实测：\n" + R.lines.join("\n"));
  const byG = Object.keys(R.byGroup).sort().map((g) => `${g} 组 ${R.byGroup[g]} 条`).join("、") || "无";
  if (REVERSE) {
    console.log(`反向对照：把五个故障装回去后，${R.fail} 条断言报错（${byG}）、${R.pass} 条仍通过。`);
    const groups = ["A", "B", "C", "D"];
    const missing = groups.filter((g) => !R.byGroup[g]);
    /* 按组各取前 4 条打印。原来只截前 16 条，而那 16 条全落在先跑的 A 组，
       B/C/D 抓到了什么反而看不见——"每组都抓得住"这句就成了没有凭据的话。 */
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
