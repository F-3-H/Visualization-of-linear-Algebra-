/* ============================================================
 * tests/verify-core.cjs —— 核心数学的可复算凭据（《让会倒的东西站住》）
 * 跑法：node tests/verify-core.cjs
 *
 * 三部分：
 *   1) 沿用的老底子：一捆数、一张表、特征方向、矩阵指数（与上一篇同一套）
 *   2) 这一篇新增：稳不稳、把线接回来、把倍数搬家、搬不动的时候
 *   3) 反向对照：把故障装回 core.js，校验必须抓住
 *      （抓不住，说明这条断言是摆设）
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const CORE = path.join(__dirname, "..", "assets", "core.js");
const src = fs.readFileSync(CORE, "utf8");
const L = require(CORE);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; failures.push(name + (detail ? " —— " + detail : "")); console.log("  ✗ " + name + (detail ? " —— " + detail : "")); }
}
function near(a, b, eps) { return Math.abs(a - b) < (eps || 1e-9); }
function vecNear(u, v, eps) { return near(u.x, v.x, eps) && near(u.y, v.y, eps); }
function matNear(A, B, eps) { return near(A.a, B.a, eps) && near(A.b, B.b, eps) && near(A.c, B.c, eps) && near(A.d, B.d, eps); }
/* 一张表的两个倍数，摆成一对复点，便于逐个对读（重根也照实说） */
function eigsOf(M) {
  const e = L.eigen(M);
  if (e.type === "real") return [{ x: e.l1, y: 0 }, { x: e.l2, y: 0 }];
  if (e.type === "complex") return [{ x: e.re, y: e.im }, { x: e.re, y: -e.im }];
  return [{ x: e.l, y: 0 }, { x: e.l, y: 0 }];
}
function pairNear(got, want, eps) {
  return near(got[0].x, want[0].x, eps) && near(got[0].y, want[0].y, eps) &&
         near(got[1].x, want[1].x, eps) && near(got[1].y, want[1].y, eps);
}

/* ---------- 老底子（与上一篇同一套记号） ---------- */
console.log("\n[一捆数] 加减与数乘");
check("add：两捆并成一捆", vecNear(L.add(L.vec(2, 1), L.vec(1, 2)), L.vec(3, 3)));
check("scale：整捆放大含反向", vecNear(L.scale(L.vec(1, -2), -1.5), L.vec(-1.5, 3)));
check("norm：长短", near(L.norm(L.vec(3, 4)), 5));
check("cross：共线判据", near(L.cross(L.vec(2, 1), L.vec(4, 2)), 0) && !near(L.cross(L.vec(2, 1), L.vec(1, 2)), 0));

console.log("\n[一张表] 作用、相乘、面积");
const M = L.mat(1.4, 0.6, 0.3, 0.9);
check("apply：M·u 逐项相加", vecNear(L.apply(M, L.vec(2, 1)), L.vec(3.4, 1.5)));
check("mul：A·B 即先摁 B 再摁 A", vecNear(L.apply(L.mul(M, L.mat(2, 0, 0, 3)), L.vec(1, 1)),
                                          L.apply(M, L.apply(L.mat(2, 0, 0, 3), L.vec(1, 1)))));
check("det：diag(2,1.3) = 2.6", near(L.det(L.mat(2, 0, 0, 1.3)), 2.6));
check("det = 单位正方形的像的面积（带符号）", near(L.det(M), (function () {
  const pts = [L.vec(0, 0), L.vec(1, 0), L.vec(1, 1), L.vec(0, 1)].map(p => L.apply(M, p));
  let s = 0;
  for (let i = 0; i < 4; i++) { const p = pts[i], q = pts[(i + 1) % 4]; s += p.x * q.y - q.x * p.y; }
  return s / 2;
})()));
check("inv：反作用可逆", vecNear(L.apply(L.inv(M), L.vec(3.4, 1.5)), L.vec(2, 1)));
check("solve：摁扁的表反不回去（null）", L.solve(L.mat(1, 0.5, 2, 1), L.vec(1, 1)) === null);

console.log("\n[特征方向与矩阵指数]");
const Dm = L.mat(2, 0, 0, 1.3), eD = L.eigen(Dm);
check("diag：两个实特征方向", eD.type === "real" && near(eD.l1, 2) && near(eD.l2, 1.3));
check("M·v = λ·v（第一方向）", vecNear(L.apply(Dm, eD.v1), L.scale(eD.v1, eD.l1), 1e-8));
const Sm = L.mat(2, 0.9, 0.9, 1.3), eS = L.eigen(Sm);
check("对称表：λ 之和 = tr、之积 = det",
  eS.type === "real" && near(eS.l1 + eS.l2, L.trace(Sm)) && near(eS.l1 * eS.l2, L.det(Sm)));
const R90 = L.mat(0, -1, 1, 0);
check("转 90°：没有不转的方向（复特征 re=0, im=1）", (function () {
  const e = L.eigen(R90); return e.type === "complex" && near(e.re, 0) && near(e.im, 1);
})());
const S0 = L.mat(0, 1, -4, 0);
check("无阻尼：相点在椭圆上（能量守恒）",
  (function () { const p = L.apply(L.expm2(S0, 0.7), L.vec(1, 0)); return near(p.y * p.y + 4 * p.x * p.x, 4, 1e-8); })());
check("面积比 det(e^{At}) = e^{tr·t}",
  near(L.det(L.expm2(L.mat(0, 1, -4, -0.4), 1.3)), Math.exp(L.trace(L.mat(0, 1, -4, -0.4)) * 1.3), 1e-9));

/* ---------- 这一篇新增一：稳不稳 ---------- */
console.log("\n[稳不稳] 两个倍数说了算");
const STICK = L.stickMat(1, 0.2);
check("棍子那张表：trace = −c、det = −a", near(L.trace(STICK), -0.2) && near(L.det(STICK), -1));
check("棍子的两个倍数：+0.904988 与 −1.104988", (function () {
  const e = L.eigen(STICK);
  return e.type === "real" && near(e.l1, 0.904988, 1e-5) && near(e.l2, -1.104988, 1e-5);
})());
check("两个倍数之和 = tr、之积 = det（对任何一张表）", (function () {
  const list = [L.mat(1.2, -0.4, 0.7, 2.1), L.mat(0, 1, -3, -0.5), L.mat(2, 1, 1, 3), L.mat(0, -1, 1, 0)];
  return list.every(function (X) {
    const e = L.eigen(X);
    if (e.type === "complex") return near(2 * e.re, L.trace(X)) && near(e.re * e.re + e.im * e.im, L.det(X));
    if (e.type === "real") return near(e.l1 + e.l2, L.trace(X)) && near(e.l1 * e.l2, L.det(X));
    return near(2 * e.l, L.trace(X)) && near(e.l * e.l, L.det(X));
  });
})());
check("棍子判词＝跑（有一个正倍数）", L.verdict(STICK) === "跑" && near(L.maxReal(STICK), 0.904988, 1e-5));
check("挂着下面的摆判词＝回", L.verdict(L.stickMat(-1, 0.2)) === "回");
check("verdict 会区分「绕」：转 90° 的表 maxReal = 0", L.verdict(R90) === "绕");

/* 这一篇最要紧的一句：a ＞ 0 时，阻尼再大也翻不过去 */
console.log("\n[内因改不动] a ＞ 0 的时候，正倍数跑不掉");
check("det ＝ −a：a ＞ 0 必然一正一负", (function () {
  for (let a = 0.05; a <= 3; a += 0.05) {
    for (let c = 0; c <= 12; c += 0.25) {
      const X = L.stickMat(a, c);
      if (!(L.det(X) < 0)) return false;
      // det ＝ 两个倍数之积 ＜ 0 ⟹ 一正一负
      const e = L.eigen(X);
      if (e.type === "complex") return false;
      if (!(e.l1 * e.l2 < 0)) return false;
    }
  }
  return true;
})());
check("把阻尼加到 10，正倍数仍在那儿（≈ +0.0990）", L.maxReal(L.stickMat(1, 10)) > 0 &&
  near(L.maxReal(L.stickMat(1, 10)), 0.0990195, 1e-6));
check("阻尼越大，正倍数越小，但永远 ＞ 0（c 从 0.2 扫到 20）", (function () {
  var last = Infinity;
  for (var c = 0.2; c <= 20; c += 0.2) {
    var m = L.maxReal(L.stickMat(1, c));
    if (!(m > 0)) return false;
    if (!(m < last)) return false;
    last = m;
  }
  return true;
})());
check("a ＜ 0 的时候反过来：只要有阻尼，两个倍数就都是负的", (function () {
  for (let a = -3; a <= -0.05; a += 0.05) {
    for (let c = 0.05; c <= 6; c += 0.05) if (L.verdict(L.stickMat(a, c)) !== "回") return false;
  }
  return true;
})());
check("边界：a ＜ 0 且阻尼为 0（无阻尼摆）→ 判词＝绕，荡个不停但不跑", (function () {
  for (let a = -3; a <= -0.05; a += 0.05) {
    const X = L.stickMat(a, 0);
    if (L.verdict(X) !== "绕") return false;
    if (!near(L.maxReal(X), 0, 1e-12)) return false;
  }
  return true;
})());
check("a ＝ 0 是分界：判词＝绕（倍数里有一个正落在 0 上）", L.verdict(L.stickMat(0, 0.2)) === "绕");

/* ---------- 这一篇新增二：把线接回来 ---------- */
console.log("\n[把线接回来] A − b·k");
const B = L.B_STICK;
check("B_STICK 是一列 (0, 1)：力从角速度那一行进去", vecNear(B, L.vec(0, 1)));
check("closeLoop 就是 A 减掉一列乘一行", matNear(L.closeLoop(L.stickMat(1, 0.2), B, L.vec(3, 2.8)),
  L.mat(0, 1, -2, -3), 1e-12));
check("闭环那张表：trace = −(c+k₂)、det = k₁−a", (function () {
  const k = L.vec(2.3, -0.7), X = L.closeLoop(L.stickMat(1, 0.2), B, k);
  return near(L.trace(X), -(0.2 - 0.7)) && near(L.det(X), 2.3 - 1);
})());
check("闭环判据：k₁ ＞ a 且 c＋k₂ ＞ 0 ⟺ 判词＝回（扫一遍 k）", (function () {
  var a = 1, c = 0.2;
  for (var k1 = -2; k1 <= 5; k1 += 0.1) {
    for (var k2 = -2; k2 <= 5; k2 += 0.1) {
      var Acl = L.closeLoop(L.stickMat(a, c), B, L.vec(k1, k2));
      var pred = (k1 - a) > 1e-9 && (c + k2) > 1e-9;
      var act = L.verdict(Acl) === "回";
      if (pred !== act) return false;
    }
  }
  return true;
})());
check("刚好抵消（k₁＝a）那一刻：det ＝ 0，倍数里有一个落在 0 上", (function () {
  const X = L.closeLoop(L.stickMat(1, 0.2), B, L.vec(1, 0.2));
  const e = L.eigen(X);
  return near(L.det(X), 0) && e.type === "real" && (near(e.l1, 0) || near(e.l2, 0)) && L.verdict(X) === "绕";
})());
check("搬到 −1 与 −2：k ＝ (3, 2.8) 让闭环倍数正好落在目标上", (function () {
  const X = L.closeLoop(L.stickMat(1, 0.2), B, L.vec(3, 2.8));
  return pairNear(eigsOf(X), [{ x: -1, y: 0 }, { x: -2, y: 0 }], 1e-9);
})());
check("不接线时闭环 ≡ 开环（k ＝ 0 两张表一模一样）", matNear(L.closeLoop(STICK, B, L.vec(0, 0)), STICK, 1e-15));

/* ---------- 这一篇新增三：把倍数搬家 ---------- */
console.log("\n[把倍数搬家] 反解出力");
check("placePoles 把实数一对搬到目标上（多组目标）", [[-1, -2], [-0.5, -1.5], [-2, -2], [0.5, -3]].every(function (t) {
  const A = L.stickMat(1, 0.2);
  const k = L.placePoles(A, B, t[0], t[1]);
  return !!k && pairNear(eigsOf(L.closeLoop(A, B, k)), [{ x: t[0], y: 0 }, { x: t[1], y: 0 }], 1e-8);
}));
check("placePoles 也搬得动一对共轭（s、t 都是实的）", [[-1, 2], [-0.5, 1.5], [-2, 0.8]].every(function (t) {
  const A = L.stickMat(1, 0.2);
  const p = t[0], q = t[1];
  const k = L.placePolesST(A, B, 2 * p, p * p + q * q);
  return !!k && pairNear(eigsOf(L.closeLoop(A, B, k)),
    [{ x: p, y: q }, { x: p, y: -q }], 1e-8);
}));
check("两条互相不通的算路给出同一个 k（拉杆公式 vs 对着系数念）", (function () {
  const A = L.stickMat(1, 0.2);
  const cases = [[-3, -1], [-3, 2], [-2, 1], [0.3, -1.4], [-4, 4], [-1, 0.25]];
  return cases.every(function (st) {
    const k1 = L.placePolesST(A, B, st[0], st[1]);
    const k2 = L.gainsStick(1, 0.2, st[0], st[1]);
    return !!k1 && vecNear(k1, k2, 1e-9);
  });
})());
check("对着系数念的闭式：k₁ ＝ a＋t、k₂ ＝ −s−c", (function () {
  const A = L.stickMat(1.4, 0.6);
  const k = L.placePolesST(A, B, -2.5, 1.2);
  return vecNear(k, L.vec(1.4 + 1.2, 2.5 - 0.6), 1e-9);
})());
check("把目标搬到右边，判词就变跑（搬家不是只能往好里搬）", (function () {
  const A = L.stickMat(1, 0.2);
  const k = L.placePoles(A, B, 0.5, -3);
  return L.verdict(L.closeLoop(A, B, k)) === "跑";
})());
check("一对不共轭的复目标：S 或 T 的虚部不为零，一行实数 k 做不到", (function () {
  const P = { x: -1, y: 2 }, Q = { x: -1, y: 1 };
  const s = { x: P.x + Q.x, y: P.y + Q.y }, t = { x: P.x * Q.x - P.y * Q.y, y: P.x * Q.y + P.y * Q.x };
  return !(near(s.y, 0) && near(t.y, 0));   // 直接判在数上，不靠 UI
})());

/* ---------- 这一篇新增四：搬不动的时候 ---------- */
console.log("\n[搬不动的时候] 能控与不能控");
check("controlMatrix 的两列就是 b 与 A·b", (function () {
  const A = L.mat(1, 2, 3, 4), b = L.vec(0.7, -0.3), ab = L.apply(A, b);
  const C = L.controlMatrix(A, b);
  return near(C.a, b.x) && near(C.c, b.y) && near(C.b, ab.x) && near(C.d, ab.y);
})());
check("det[b, A·b] ＝ cross(b, A·b)（面积就是叉积）", (function () {
  const A = L.mat(1, 2, 3, 4), b = L.vec(0.7, -0.3);
  return near(L.det(L.controlMatrix(A, b)), L.cross(b, L.apply(A, b)), 1e-12);
})());
check("一般的 b = (0, 1)：够得着", L.controllable(STICK, L.vec(0, 1)));
check("b 落在特征方向上：det ＝ 0，够不着", (function () {
  const e = L.eigen(STICK);
  return !L.controllable(STICK, L.scale(e.v1, 1)) && !L.controllable(STICK, L.scale(e.v2, 1));
})());
check("够不着时 placePoles 返回空（搬不动就说搬不动）", (function () {
  const e = L.eigen(STICK);
  return L.placePoles(STICK, L.scale(e.v1, 1), -1, -2) === null &&
         L.placePolesST(STICK, L.scale(e.v2, 1), -3, 2) === null;
})());
check("b 对准「回来」那条线：够不着的正是那个跑掉的倍数，怎么使劲都是跑", (function () {
  const e = L.eigen(STICK);            // v2 对应 λ2 = −1.104988
  const b = L.scale(e.v2, 1);
  return [[5, 5], [50, 50], [-20, 10], [1000, 1000], [0, -800]].every(function (kk) {
    const X = L.closeLoop(STICK, b, L.vec(kk[0], kk[1]));
    const got = eigsOf(X);
    const stuck = near(got[0].x, e.l1, 1e-6) || near(got[1].x, e.l1, 1e-6);
    return stuck && L.verdict(X) === "跑";
  });
})());
check("b 对准「跑掉」那条线：够不着的恰好是自己会回来的那个，还救得回来", (function () {
  const e = L.eigen(STICK);
  const b = L.scale(e.v1, 1);
  const X = L.closeLoop(STICK, b, L.vec(5, 5));
  const got = eigsOf(X);
  const stuck = near(got[0].x, e.l2, 1e-6) || near(got[1].x, e.l2, 1e-6);
  return stuck && L.verdict(X) === "回";
})());
check("往够不着那边偏一点点就恢复能控，但要的力在爆掉", (function () {
  const e = L.eigen(STICK);
  const perp = L.vec(-e.v2.y, e.v2.x);
  const mk = function (eps) {
    const b = L.add(L.scale(e.v2, 1), L.scale(perp, eps));
    return { d: Math.abs(L.det(L.controlMatrix(STICK, b))), k: L.placePoles(STICK, b, -1, -2) };
  };
  const a1 = mk(0.02), a2 = mk(0.001);
  return a1.d > 0 && a2.d > 0 && a1.k && a2.k &&
         L.norm(a2.k) > 10 * L.norm(a1.k) &&      // 力气在爆掉
         L.verdict(L.closeLoop(STICK, L.add(L.scale(e.v2, 1), L.scale(perp, 0.02)), a1.k)) === "回";
})());
check("能控性判的是「两列张成的面积不为零」——小到 1e−9 以下一律当够不着", (function () {
  const e = L.eigen(STICK);
  const tiny = L.add(L.scale(e.v2, 1), L.scale(L.vec(-e.v2.y, e.v2.x), 1e-12));
  return L.controllable(STICK, tiny) === false;   // 阈值以内一律当够不着
})());

/* ============================================================
 * 反向对照：把故障装回 core.js，断言必须抓住
 * ============================================================ */
console.log("\n[反向对照] 把故障装回 core.js");
function loadMutated(mutatedSrc) {
  const module = { exports: {} };
  new Function("module", "exports", "self", mutatedSrc)(module, module.exports, {});
  return module.exports;
}
function expectFail(name, mutation, assertion) {
  const mutated = src.replace(mutation.from, mutation.to);
  if (mutated === src) {
    check(name + "（变异本身没生效，检查替换串）", false, "源码中找不到替换目标");
    return;
  }
  let caught = false, detail = "";
  try {
    const M2 = loadMutated(mutated);
    const r = assertion(M2);
    caught = r === false || (r && r.ok === false);
    if (r && r.detail) detail = r.detail;
  } catch (err) { caught = true; detail = err.message; }
  check(name, caught, caught ? "" : "故障装回去了，断言居然没抓住：" + detail);
}

expectFail("maxReal 取成 max 装成 min（判词会从跑变成回）→ 断言抓住",
  { from: "    if (e.type === \"real\") return Math.max(e.l1, e.l2);",
    to: "    if (e.type === \"real\") return Math.min(e.l1, e.l2);" },
  (L2) => L2.verdict(L2.stickMat(1, 0.2)) === "跑");

expectFail("verdict 把「回」和「跑」的正负判反 → 断言抓住",
  { from: "    if (m < -eps) return \"回\";\n    if (m > eps) return \"跑\";",
    to: "    if (m > -eps) return \"回\";\n    if (m < eps) return \"跑\";" },
  (L2) => L2.verdict(L2.stickMat(1, 0.2)) === "跑" && L2.verdict(L2.stickMat(-1, 0.2)) === "回");

expectFail("stickMat 把 −c 写成 +c（阻尼当成了助推）→ trace 断言抓住",
  { from: "  function stickMat(a, c) { return mat(0, 1, a, -c); }",
    to: "  function stickMat(a, c) { return mat(0, 1, a, c); }" },
  (L2) => Math.abs(L2.trace(L2.stickMat(1, 0.2)) + 0.2) < 1e-12);

expectFail("closeLoop 里的减号写成加号（力推反了）→ 闭环断言抓住",
  { from: "    return mat(A.a - b.x * k.x, A.b - b.x * k.y,\n               A.c - b.y * k.x, A.d - b.y * k.y);",
    to: "    return mat(A.a + b.x * k.x, A.b + b.x * k.y,\n               A.c + b.y * k.x, A.d + b.y * k.y);" },
  (L2) => {
    const X = L2.closeLoop(L2.stickMat(1, 0.2), L2.vec(0, 1), L2.vec(3, 2.8));
    const e = L2.eigen(X);
    return e.type === "real" && Math.abs(e.l1 + 1) < 1e-8 && Math.abs(e.l2 + 2) < 1e-8;
  });

expectFail("controlMatrix 第二列忘了摁（写成 b 与 b）→ 能控断言抓住",
  { from: "    var ab = apply(A, b);\n    return mat(b.x, ab.x, b.y, ab.y); // 列为 b 与 A·b",
    to: "    var ab = apply(A, b);\n    return mat(b.x, b.x, b.y, b.y); // 列为 b 与 A·b" },
  (L2) => L2.controllable(L2.stickMat(1, 0.2), L2.vec(0, 1)));

expectFail("controlMatrix 两列调换（面积变号）→ 叉积断言抓住",
  { from: "    return mat(b.x, ab.x, b.y, ab.y); // 列为 b 与 A·b",
    to: "    return mat(ab.x, b.x, ab.y, b.y); // 列为 b 与 A·b" },
  (L2) => {
    const A = L2.mat(1, 2, 3, 4), b = L2.vec(0.7, -0.3);
    return Math.abs(L2.det(L2.controlMatrix(A, b)) - L2.cross(b, L2.apply(A, b))) < 1e-12;
  });

expectFail("placePolesST 的 φ(A) 把 −sA 写成 +sA → 搬家断言抓住",
  { from: "    var phi = mat(A2.a - s * A.a + t, A2.b - s * A.b,\n                  A2.c - s * A.c, A2.d - s * A.d + t);",
    to: "    var phi = mat(A2.a + s * A.a + t, A2.b + s * A.b,\n                  A2.c + s * A.c, A2.d + s * A.d + t);" },
  (L2) => {
    const A = L2.stickMat(1, 0.2);
    const k = L2.placePoles(A, L2.vec(0, 1), -1, -2);
    const e = L2.eigen(L2.closeLoop(A, L2.vec(0, 1), k));
    return e.type === "real" && Math.abs(e.l1 + 1) < 1e-8 && Math.abs(e.l2 + 2) < 1e-8;
  });

expectFail("gainsStick 的 k₂ 少一个负号 → 两条算路不再互证",
  { from: "  function gainsStick(a, c, s, t) { return vec(a + t, -s - c); }",
    to: "  function gainsStick(a, c, s, t) { return vec(a + t, s - c); }" },
  (L2) => {
    const k1 = L2.placePolesST(L2.stickMat(1, 0.2), L2.vec(0, 1), -3, 2);
    const k2 = L2.gainsStick(1, 0.2, -3, 2);
    return Math.abs(k1.x - k2.x) < 1e-9 && Math.abs(k1.y - k2.y) < 1e-9;
  });

expectFail("placePolesST 去掉「够不着就返回空」的闸门 → 断言抓住",
  { from: "    if (Math.abs(d) < 1e-9) return null;       // 够不着，搬不动",
    to: "    if (Math.abs(d) < 1e-300) return null;     // 够不着，搬不动" },
  (L2) => {
    const e = L2.eigen(L2.stickMat(1, 0.2));
    return L2.placePoles(L2.stickMat(1, 0.2), L2.scale(e.v1, 1), -1, -2) === null;
  });

expectFail("B_STICK 写成 (1, 0)（力进错了行）→ 闭环断言抓住",
  { from: "  var B_STICK = vec(0, 1);   // 手（或轮子）的力作用在角速度这一行上",
    to: "  var B_STICK = vec(1, 0);   // 手（或轮子）的力作用在角速度这一行上" },
  (L2) => L2.closeLoop(L2.stickMat(1, 0.2), L2.B_STICK, L2.vec(3, 2.8)).c === -2);

/* ---------- 汇总 ---------- */
console.log("\n────────────────────────");
console.log("正向断言：" + pass + " 通过；反向对照全部执行完毕。");
if (fail > 0) {
  console.log("失败 " + fail + " 项：");
  failures.forEach(f => console.log("  - " + f));
  process.exit(1);
}
console.log("全部通过。");
