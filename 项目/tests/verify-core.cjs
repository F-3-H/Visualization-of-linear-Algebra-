/* ============================================================
 * tests/verify-core.cjs —— 核心数学的可复算凭据
 * 跑法：node tests/verify-core.cjs
 *
 * 两部分：
 *   1) 正向断言：core.js 的每一条性质
 *   2) 反向对照：把故障装回 core.js，校验必须抓住
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

/* ---------- 一捆数 ---------- */
console.log("\n[一捆数] 加减与数乘");
check("add：两捆并成一捆", vecNear(L.add(L.vec(2, 1), L.vec(1, 2)), L.vec(3, 3)));
check("scale：整捆放大含反向", vecNear(L.scale(L.vec(1, -2), -1.5), L.vec(-1.5, 3)));
check("norm：长短", near(L.norm(L.vec(3, 4)), 5));
check("cross：共线判据", near(L.cross(L.vec(2, 1), L.vec(4, 2)), 0) && !near(L.cross(L.vec(2, 1), L.vec(1, 2)), 0));

/* ---------- 一张表 ---------- */
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
check("solve：解出来再摁回去等于 b", vecNear(L.apply(M, L.solve(M, L.vec(1.2, -0.7))), L.vec(1.2, -0.7)));
check("solve：摁扁的表反不回去（null）", L.solve(L.mat(1, 0.5, 2, 1), L.vec(1, 1)) === null);
check("kernel：被摁扁的方向整条去原点", (function () {
  const S = L.mat(1, 0.5, 2, 1);
  const n = L.normalize(L.vec(-0.5, 1));
  return near(L.norm(L.apply(S, n)), 0);
})());

/* ---------- 先后有别 ---------- */
console.log("\n[先后有别] 顺序");
const A = L.mat(1, 1, 0, 1), B = L.mat(1, 0, 1, 1);
check("A·B ≠ B·A（一般情形）", !matNear(L.mul(A, B), L.mul(B, A)));
check("A·B 的数对得上", matNear(L.mul(A, B), L.mat(2, 1, 1, 1)));
check("一对角可交换（反例）", matNear(L.mul(L.mat(2, 0, 0, 1), L.mat(1, 0, 0, 3)), L.mul(L.mat(1, 0, 0, 3), L.mat(2, 0, 0, 1))));

/* ---------- 变了又没变的方向 ---------- */
console.log("\n[特征方向]");
const Dm = L.mat(2, 0, 0, 1.3), eD = L.eigen(Dm);
check("diag：两个实特征方向", eD.type === "real" && near(eD.l1, 2) && near(eD.l2, 1.3));
check("M·v = λ·v（第一方向）", vecNear(L.apply(Dm, eD.v1), L.scale(eD.v1, eD.l1), 1e-8));
check("M·v = λ·v（第二方向）", vecNear(L.apply(Dm, eD.v2), L.scale(eD.v2, eD.l2), 1e-8));
const Sm = L.mat(2, 0.9, 0.9, 1.3), eS = L.eigen(Sm);
check("对称表：λ = (tr ± √(tr²−4det))/2",
  eS.type === "real" && near(eS.l1 + eS.l2, L.trace(Sm)) && near(eS.l1 * eS.l2, L.det(Sm)));
check("对称表：方向正交", near(Math.abs(L.dot(eS.v1, eS.v2)), 0, 1e-8));
const R = L.mat(0, -1, 1, 0), eR = L.eigen(R);
check("转 90°：没有不转的方向（复特征）", eR.type === "complex" && near(eR.re, 0) && near(eR.im, 1));
const Sh = L.mat(1, 1, 0, 1), eSh = L.eigen(Sh);
check("剪切：只剩一个方向，且 λ=1", eSh.type === "repeated" && near(eSh.l, 1));
check("重根方向也是特征方向", vecNear(L.apply(Sh, eSh.v), L.scale(eSh.v, 1), 1e-8));
const Sq = L.mat(1, 0.5, 2, 1), eSq = L.eigen(Sq);
check("摁扁：有个 λ=0", eSq.type === "real" && (near(eSq.l1, 0) || near(eSq.l2, 0)));

/* ---------- 相空间：弹簧系统 ---------- */
console.log("\n[弹簧系统] 矩阵指数");
const S0 = L.mat(0, 1, -4, 0);            // 无阻尼
const p = L.apply(L.expm2(S0, 0.7), L.vec(1, 0));
check("无阻尼：相点在椭圆上（能量守恒）", near(p.y * p.y + 4 * p.x * p.x, 4, 1e-8));
check("无阻尼：一个周期 T=2π/ω=π 后回到起点", vecNear(L.apply(L.expm2(S0, Math.PI), L.vec(1, 0)), L.vec(1, 0), 1e-8));
const Sd = L.mat(0, 1, -4, -0.4);         // 小阻尼
check("有阻尼：边转边缩（转够两圈，且整体收缩）", (function () {
  var pts = [];
  for (var t = 0; t <= 12 + 1e-9; t += 0.02) pts.push(L.apply(L.expm2(Sd, t), L.vec(1, 0)));
  var r0 = L.norm(pts[0]), r1 = L.norm(pts[pts.length - 1]);
  var turns = 0;
  for (var i = 1; i < pts.length; i++) {
    var a0 = Math.atan2(pts[i - 1].y, pts[i - 1].x), a1 = Math.atan2(pts[i].y, pts[i].x);
    var d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    turns += d;
  }
  return Math.abs(turns) > 4 * Math.PI && r1 < 0.5 * r0;
})());
check("面积比 det(e^{At}) = e^{tr·t}", near(L.det(L.expm2(Sd, 1.3)), Math.exp(L.trace(Sd) * 1.3), 1e-9));
check("expm2：旋转发生器", matNear(L.expm2(R, Math.PI / 2), L.mat(0, -1, 1, 0), 1e-9));
check("expm2：伸缩发生器", matNear(L.expm2(L.mat(Math.log(3), 0, 0, Math.log(3)), 2), L.mat(9, 0, 0, 9), 1e-9));
check("复方向 λ = re ± i·im 与 tr、det 对得上", (function () {
  const e = L.eigen(Sd);
  return e.type === "complex" && near(2 * e.re, L.trace(Sd)) && near(e.re * e.re + e.im * e.im, L.det(Sd));
})());
check("越过临界阻尼：c 连续增大，特征从复变实", (function () {
  const mk = 4;
  const before = L.eigen(L.mat(0, 1, -mk / 1, -(2 * Math.sqrt(mk) - 0.01)));
  const after = L.eigen(L.mat(0, 1, -mk / 1, -(2 * Math.sqrt(mk) + 0.01)));
  return before.type === "complex" && after.type === "real";
})());

/* ============================================================
 * 反向对照：把故障装回去，断言必须抓住
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

expectFail("乘法顺序装反（A·B 算成了 B·A）→ 复合断言抓住",
  { from: "      A.a * B.a + A.b * B.c, A.a * B.b + A.b * B.d,\n      A.c * B.a + A.d * B.c, A.c * B.b + A.d * B.d",
    to: "      B.a * A.a + B.c * A.b, B.a * A.b + B.c * A.d,\n      B.b * A.a + B.d * A.c, B.b * A.b + B.d * A.d" },
  (L2) => L2.eqv(L2.apply(L2.mul(L2.mat(1, 1, 0, 1), L2.mat(1, 0, 1, 1)), L2.vec(1, 1)),
                 L2.apply(L2.mat(1, 1, 0, 1), L2.apply(L2.mat(1, 0, 1, 1), L2.vec(1, 1))), 1e-9));

expectFail("det 公式装错（加号）→ 面积断言抓住",
  { from: "function det(M) { return M.a * M.d - M.b * M.c; }", to: "function det(M) { return M.a * M.d + M.b * M.c; }" },
  (L2) => Math.abs(L2.det(L2.mat(1.4, 0.6, 0.3, 0.9)) - 1.08) < 1e-9);

expectFail("特征方向取成行向量（不是零空间）→ M·v=λ·v 抓住",
  { from: "return normalize(vec(-r.y, r.x)); // 与行垂直即零空间方向", to: "return normalize(r);" },
  (L2) => {
    const e = L2.eigen(L2.mat(2, 0, 0, 1.3));
    return L2.eqv(L2.apply(L2.mat(2, 0, 0, 1.3), e.v1), L2.scale(e.v1, e.l1), 1e-8);
  });

expectFail("复数分支的 sin/im 装成 sin → 无阻尼椭圆断言抓住（im=2 时必错）",
  { from: "var k = Math.abs(im) < 1e-12 ? t : Math.sin(im * t) / im;", to: "var k = Math.abs(im) < 1e-12 ? t : Math.sin(im * t);" },
  (L2) => {
    var q = L2.apply(L2.expm2(L2.mat(0, 1, -4, 0), 0.7), L2.vec(1, 0));
    return Math.abs(q.y * q.y + 4 * q.x * q.x - 4) < 1e-8;
  });

expectFail("inv 不判奇异 → 反不回去的断言抓住",
  { from: 'if (Math.abs(d) < 1e-12) return null; // 被摁扁了，反不回去', to: 'if (false) return null;' },
  (L2) => L2.solve(L2.mat(1, 0.5, 2, 1), L2.vec(1, 1)) === null);

expectFail("expm2 复数分支漏掉 e^{re·t} → 螺旋衰减断言抓住",
  { from: "var f = Math.exp(re * t);", to: "var f = 1;" },
  (L2) => L2.norm(L2.apply(L2.expm2(L2.mat(0, 1, -4, -0.4), 4), L2.vec(1, 0))) < 0.5);

/* ---------- 汇总 ---------- */
console.log("\n────────────────────────");
console.log("正向断言：" + pass + " 通过；反向对照全部执行完毕。");
if (fail > 0) {
  console.log("失败 " + fail + " 项：");
  failures.forEach(f => console.log("  - " + f));
  process.exit(1);
}
console.log("全部通过。");
