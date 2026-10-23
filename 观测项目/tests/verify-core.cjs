/* ============================================================
 * tests/verify-core.cjs —— 数学内核的断言（正向 + 反向对照）
 * 跑法：node tests/verify-core.cjs [--reverse]
 *
 * 每条断言的"期望值"都在这个文件里另算一遍，不调用被测函数自证：
 *   - 两个倍数：λ² + 0.2λ − 1 = 0 直接解，不借 eigen()
 *   - A−LC 的四格：手算好了写死
 *   - 影子的末误差：文件里自带一段独立 RK4，与闭式解对读
 * 反向对照把故障装回 core.js 的副本，看断言抓不抓得住；
 * 装故障之前先核对"源码确实变了"，否则故障没装上却被读成"判据空转"。
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "assets", "core.js");
const TMP = path.join(ROOT, "tools", "_mut_core.js");

const R = { pass: 0, fail: 0, fails: [] };
function ok(cond, name, detail) {
  if (cond) { R.pass++; return true; }
  R.fail++; R.fails.push(name + (detail ? " —— " + detail : ""));
  return false;
}
function close(a, b, eps) { return Math.abs(a - b) < (eps == null ? 1e-9 : eps); }
function reset() { R.pass = 0; R.fail = 0; R.fails = []; }

function loadCore(mut) {
  let src = fs.readFileSync(SRC, "utf8");
  if (mut) {
    const after = mut(src);
    if (after === src) throw new Error("故障没装上：源码一个字都没变");
    src = after;
  }
  fs.writeFileSync(TMP, src, "utf8");
  delete require.cache[require.resolve(TMP)];
  return require(TMP);
}

/* ---------- 独立的 RK4：不用 core 的闭式，也不碰它的分量拼接 ---------- */
function rk4(A, cv, l, x0, xh0, T, n) {
  let x = x0.x, w = x0.y, X = xh0.x, W = xh0.y;
  const h = T / n;
  function step(x, w, X, W, h) {
    function d(xx, ww, XX, WW) {
      const y = cv.x * xx + cv.y * ww, yh = cv.x * XX + cv.y * WW;
      const dy = y - yh;
      return [A.a * xx + A.b * ww,
              A.c * xx + A.d * ww,
              A.a * XX + A.b * WW + l.x * dy,
              A.c * XX + A.d * WW + l.y * dy];
    }
    const k1 = d(x, w, X, W);
    const k2 = d(x + h / 2 * k1[0], w + h / 2 * k1[1], X + h / 2 * k1[2], W + h / 2 * k1[3]);
    const k3 = d(x + h / 2 * k2[0], w + h / 2 * k2[1], X + h / 2 * k2[2], W + h / 2 * k2[3]);
    const k4 = d(x + h * k3[0], w + h * k3[1], X + h * k3[2], W + h * k3[3]);
    return [x + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
            w + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
            X + h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
            W + h / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3])];
  }
  for (let i = 0; i < n; i++) {
    const s = step(x, w, X, W, h);
    x = s[0]; w = s[1]; X = s[2]; W = s[3];
  }
  return Math.hypot(x - X, w - W);
}

/* ---------- 全部断言 ---------- */
function checks(L) {
  const A = L.stickMat(1, 0.2);
  const CV = L.vec(1, 0);
  /* 精确的那两个倍数先在本文件里解出来（λ² + 0.2λ − 1 = 0），
     再拿它造"与 v₁ 严格垂直"的读数行——不借 eigen，免得"垂直"由被测函数自证。 */
  const LAM1 = (-0.2 + Math.sqrt(0.04 + 4)) / 2;
  const LAM2 = (-0.2 - Math.sqrt(0.04 + 4)) / 2;
  const V1E = L.vec(1, LAM1);
  const VE = L.vec(-LAM1, 1);   // v₁ ⊥ VE，点积恰为 0

  /* 1 · 两个倍数：直接解 λ² + 0.2λ − 1 = 0 */
  const lam1 = LAM1, lam2 = LAM2;
  const e = L.eigen(A);
  ok(e.type === "real" && close(e.l1, lam1, 1e-12) && close(e.l2, lam2, 1e-12),
    "棍子的两个倍数是 +0.905 / −1.105（解二次方程得到，不借 eigen）",
    "得 " + (e.type === "real" ? e.l1 + " / " + e.l2 : e.type));

  /* 2 · A − L C 的四格：L=(3,1)、C=(1,0) 手算为 [[−3,1],[0,−0.2]] */
  const M = L.observeMat(A, L.vec(3, 1), CV);
  ok(close(M.a, -3) && close(M.b, 1) && close(M.c, 0) && close(M.d, -0.2, 1e-12),
    "L=(3,1)、C=(1,0) 时 A−LC ＝ [[−3,1],[0,−0.2]]（手算值）",
    "得 [" + M.a + "," + M.b + "," + M.c + "," + M.d + "]");

  /* 3 · 只减第一列：第二列必须与 A 的第二列逐个相同（任意 L） */
  let colKept = true, rowKept = true;
  for (const l of [L.vec(0, 0), L.vec(2, -3), L.vec(7, 5.5), L.vec(-1, 4)]) {
    const m = L.observeMat(A, l, CV);
    if (!close(m.b, A.b, 1e-12) || !close(m.d, A.d, 1e-12)) colKept = false;
    const C2 = L.closeLoop(A, L.B_STICK, L.vec(l.x, l.y));   // 控制那一篇的减法：b k
    if (!close(C2.a, A.a, 1e-12) || !close(C2.b, A.b, 1e-12)) rowKept = false;
  }
  ok(colKept, "读数取 θ 时，A−LC 只改写第一列，第二列一格不动");
  ok(rowKept, "对着看：力从 b 进去时，A−bk 只改写第二行，第一行一格不动");

  /* 4 · "两个倍数都在左半边" ⟺ l₁ + c > 0 且 l₁c + l₂ − a > 0（随机 300 组） */
  let judgeBad = 0;
  const rnd = L.rng(12345);
  for (let i = 0; i < 300; i++) {
    const l1 = -3 + rnd() * 9, l2 = -4 + rnd() * 14;
    const mm = L.observeMat(A, L.vec(l1, l2), CV);
    const stable = L.maxReal(mm) < 0;
    const crit = (l1 + 0.2 > 0) && (l1 * 0.2 + l2 - 1 > 0);
    if (stable !== crit) judgeBad++;
  }
  ok(judgeBad === 0, "稳定判据与数值特征值在 300 组随机 L 上完全一致", judgeBad + " 组不一致");

  /* 5 · O 的交叉相减 ＝ c₁² − c·c₁·c₂ − a·c₂²（手推的式子） */
  let detBad = 0;
  for (let i = 0; i < 40; i++) {
    const c1 = -2 + rnd() * 4, c2 = -2 + rnd() * 4;
    const got = L.det(L.observabilityMatrix(A, L.vec(c1, c2)));
    const want = c1 * c1 - 0.2 * c1 * c2 - 1 * c2 * c2;
    if (!close(got, want, 1e-9)) detBad++;
  }
  ok(detBad === 0, "可观测矩阵的交叉相减 ＝ c₁² − 0.2·c₁c₂ − c₂²", detBad + " 组不符");

  /* 上面那张表 a＝1，恰好对称（A.b ＝ A.c），"取错一格"这类故障装上去等于没装。
     换一张不对称的（a＝2、c＝0.3）再量一遍：交叉相减 ＝ c₁² − 0.3c₁c₂ − 2c₂²。 */
  const AN = L.mat(0, 1, 2, -0.3);
  let detBad2 = 0;
  for (let i = 0; i < 40; i++) {
    const c1 = -2 + rnd() * 4, c2 = -2 + rnd() * 4;
    const got = L.det(L.observabilityMatrix(AN, L.vec(c1, c2)));
    const want = c1 * c1 - 0.3 * c1 * c2 - 2 * c2 * c2;
    if (!close(got, want, 1e-9)) detBad2++;
  }
  ok(detBad2 === 0, "换成不对称的表（a＝2）判据仍然对得上", detBad2 + " 组不符");

  /* 6 · 测 θ 时看得见；测 c ⊥ v 时看不见，且那条倍数钉死 */
  ok(L.observable(A, CV) === true, "测 θ：可观测（交叉相减 ＝ 1）");
  ok(L.observable(A, VE) === false, "测的方向与 v₁ 垂直：不可观测");
  const blind = L.blindDirection(A, VE);
  ok(blind && close(blind.lam, lam1, 1e-9), "不可观测时，钉住的是 +0.905 那个倍数",
    blind ? "得 " + blind.lam : "没找出盲方向");
  let pinned = true;
  for (const g of [0, 5, 60]) {
    const ev = L.eigen(L.observeMat(A, L.vec(g, g), VE));
    if (ev.type !== "real" || Math.min(Math.abs(ev.l1 - lam1), Math.abs(ev.l2 - lam1)) > 1e-9) pinned = false;
  }
  ok(pinned, "L 取 0／5／60 时 +0.905 一直是一个倍数（三组都对）");
  /* 反过来也要查：大多数方向没有盲区，不能见谁都报 */
  ok(L.blindDirection(A, CV) === null, "测 θ 时没有盲方向（不该见谁都报）");
  ok(L.blindDirection(A, L.vec(1, 1)) === null, "测 θ＋ω 时也没有盲方向");

  /* 7 · 影子的末误差：闭式解 vs 文件里自带的 RK4 */
  const x0 = L.vec(1, 0.5), xh0 = L.vec(1.12, 0.42);
  const l5 = L.vec(5, 5);
  const run = L.shadowRun(A, CV, l5, x0, xh0, 2, 400);
  const closed = run.err[run.err.length - 1];
  const integrated = rk4(A, CV, l5, x0, xh0, 2, 4000);
  ok(close(closed, integrated, 1e-6), "影子跑 2 秒：闭式解与 RK4 的末误差一致",
    "闭式 " + closed.toFixed(9) + " / RK4 " + integrated.toFixed(9));
  ok(close(run.err[0], Math.hypot(x0.x - xh0.x, x0.y - xh0.y), 1e-12),
    "误差序列的第一个数＝初值差本身");
  ok(run.err[run.err.length - 1] < run.err[0], "L=(5,5) 时偏差在缩小");
  const gi = L.shadowIntegrate(A, CV, l5, x0, xh0, 2, 4000);
  ok(close(gi.err, integrated, 1e-9), "核心里的 RK4 与文件里自带的 RK4 给出同一个末误差",
    "核心 " + gi.err.toFixed(9) + " / 自带 " + integrated.toFixed(9));

  /* 8 · 不纠正（L=0）时，偏差按 A 的倍数长：末误差／初误差 ≈ e^{0.905·T} */
  /* 只沿红线差一点点：偏差应当正好按 e^{0.905t} 长（红线上的方向不变） */
  const xr = L.vec(1, 0.5);
  const xhr = L.sub(xr, L.scale(L.normalize(V1E), 0.1));
  const run0 = L.shadowRun(A, CV, L.vec(0, 0), xr, xhr, 2, 400);
  const ratio = run0.err[run0.err.length - 1] / run0.err[0];
  ok(close(ratio, Math.exp(LAM1 * 2), 1e-9),
    "只沿红线差一点点时，偏差正好按 e^{λ₁·2} 长（λ₁ 由二次方程解出）", "比值 " + ratio.toFixed(6));

  /* 9 · 差分对一条直线必须分毫不差 */
  const line = (t) => 0.3 + 0.9 * t;
  const exact = L.diffEstimate(L.sampleTheta(line, 1.5, 0.05, 0, 7));
  const exactBad = exact.filter((p) => Math.abs(p.w - 0.9) > 1e-12).length;
  ok(exactBad === 0, "无噪声、线性信号：差分给出的速度恰好是 0.9", exactBad + " 个点不对");

  /* 10 · 噪声落在 ±σ 之内（种子固定，所以这一条也可复算） */
  const smp = L.sampleTheta(line, 1.2, 0.02, 0.006, 99);
  const outOfBand = smp.filter((p) => Math.abs(p.y - line(p.t)) > 0.006 + 1e-12).length;
  ok(outOfBand === 0, "采样噪声不超过 ±σ", outOfBand + " 个点越界");

  /* 11 · 上界必须真的罩住实测误差（12 组 h、σ 各试一遍） */
  const f = (t) => 0.2 * Math.exp(0.905 * t);
  let boundBad = 0, checked = 0;
  for (const h of [0.01, 0.02, 0.05, 0.1, 0.2]) {
    for (const s of [0, 0.002, 0.008]) {
      const est = L.diffEstimate(L.sampleTheta(f, 1.2, h, s, 3));
      let mx = 0;
      est.forEach((p) => { mx = Math.max(mx, Math.abs(p.w - 0.905 * f(p.t))); });
      if (mx > L.diffBound(0.2 * Math.exp(0.905 * 1.2), 0.905, h, s) + 1e-12) boundBad++;
      checked++;
    }
  }
  ok(boundBad === 0, "差分的误差上界罩住实测值（" + checked + " 组 h、σ）", boundBad + " 组越界");

  /* 12 · 种子固定 → 同一串噪声；换种子 → 换一串 */
  const a1 = L.sampleTheta(line, 1, 0.1, 0.01, 2024).map((p) => p.y.toFixed(9)).join(",");
  const a2 = L.sampleTheta(line, 1, 0.1, 0.01, 2024).map((p) => p.y.toFixed(9)).join(",");
  const a3 = L.sampleTheta(line, 1, 0.1, 0.01, 2025).map((p) => p.y.toFixed(9)).join(",");
  ok(a1 === a2, "同一个种子给出同一串噪声（可复算）");
  ok(a1 !== a3, "换一个种子就换一串噪声");
}

/* ---------- 正向 ---------- */
console.log("═══ 正向断言 ═══");
reset();
checks(loadCore(null));
console.log("  " + (R.fail === 0 ? "✓" : "✗") + " 通过 " + R.pass + "，失败 " + R.fail);
R.fails.forEach((f) => console.log("     ✗ " + f));

/* ---------- 反向对照 ---------- */
const FAULTS = [
  ["减错了列（把 L·C 减到第二列的那一格上）",
    (s) => s.replace("A.c - l.y * cv.x", "A.c - l.y * cv.y")],
  ["符号写反（A − LC 变成某个格加号）",
    (s) => s.replace("A.a - l.x * cv.x", "A.a + l.x * cv.x")],
  ["可观测矩阵第二行取错了 A 的一格",
    (s) => s.replace("cv.x * A.a + cv.y * A.c, cv.x * A.b + cv.y * A.d",
                     "cv.x * A.a + cv.y * A.b, cv.x * A.b + cv.y * A.d")],
  ["盲方向的判据松了一千倍（不该报的也报）",
    (s) => s.replace("var tol = 1e-3 * norm(cv);", "var tol = 1e3 * norm(cv);")],
  ["影子的误差按 A 走，而不是按 A−LC 走",
    (s) => s.replace("var e = apply(expm2(M, t), e0);", "var e = apply(expm2(A, t), e0);")],
  ["RK4 的权重写错（h/6 写成 h/2）",
    (s) => s.replace("h / 6", "h / 2")],
  ["差分除错了（除以 2h）",
    (s) => s.replace("w: (samples[i].y - samples[i - 1].y) / h",
                     "w: (samples[i].y - samples[i - 1].y) / (2 * h)")],
  ["误差上界漏掉噪声那一项",
    (s) => s.replace("return thetaMax * lam * lam * h / 2 + 2 * (sigma || 0) / h;",
                     "return thetaMax * lam * lam * h / 2;")],
  ["噪声放大到三倍 σ（越出 ±σ）",
    (s) => s.replace("sigma * (r() * 2 - 1)", "sigma * (r() * 4 - 1)")]
];

const wantReverse = process.argv.indexOf("--reverse") >= 0;
if (wantReverse) {
  console.log("\n═══ 反向对照（把故障装回去，看断言抓不抓得住）═══");
  let caught = 0;
  for (const [name, mut] of FAULTS) {
    reset();
    let L;
    try { L = loadCore(mut); }
    catch (err) { console.log("  ✗ " + name + " —— 故障注入本身出错：" + err.message); continue; }
    try { checks(L); } catch (err) { R.fail++; R.fails.push("断言过程抛异常：" + err.message); }
    if (R.fail > 0) {
      caught++;
      console.log("  ✓ 抓住了：" + name + "（" + R.fail + " 条断言报错）");
      console.log("       头一条：" + R.fails[0]);
    } else {
      console.log("  ✗ 漏过去了：" + name + "（" + R.pass + " 条断言全绿）");
    }
  }
  console.log("\n────────────────────────");
  console.log("反向对照：" + caught + " / " + FAULTS.length + " 处故障被抓住。");
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
  process.exit(caught === FAULTS.length && R.fail >= 0 ? 0 : 1);
} else {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
  console.log("\n────────────────────────");
  console.log(R.fail === 0 ? "全部通过。" : "失败 " + R.fail + " 条。");
  process.exit(R.fail === 0 ? 0 : 1);
}
