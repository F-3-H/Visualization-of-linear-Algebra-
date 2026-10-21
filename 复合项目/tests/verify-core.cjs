/* ============================================================
 * tests/verify-core.cjs —— 复合项目的核心数学可复算凭据
 * 跑法：node tests/verify-core.cjs
 *
 * 两部分：
 *   1) 正向断言：A·B 的"连着作用"含义、两列的算法、非交换、结合律、
 *      可交换反例、过渡用的 mixMat
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
function col1(M) { return L.vec(M.a, M.c); }
function col2(M) { return L.vec(M.b, M.d); }
// 简单确定性伪随机（不用 Math.random，断言可复现）
let seed = 20261016;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff) * 4 - 2; }
function rmat() { return L.mat(rnd(), rnd(), rnd(), rnd()); }

const ROT = L.mat(0, -1, 1, 0);      // 转 90°
const SHEAR = L.mat(1, 1, 0, 1);     // 剪切

/* ---------- 一捆数 / 一张表（沿用，轻量） ---------- */
console.log("\n[一张表] 作用与两列");
const M = L.mat(1.4, 0.6, 0.3, 0.9);
check("apply：M·u 逐项相加", vecNear(L.apply(M, L.vec(2, 1)), L.vec(3.4, 1.5)));
check("第一列 = 横箭头 (1,0) 被送到哪", vecNear(col1(M), L.apply(M, L.vec(1, 0))));
check("第二列 = 竖箭头 (0,1) 被送到哪", vecNear(col2(M), L.apply(M, L.vec(0, 1))));

/* ---------- 复合：A·B ＝ 先摁 B 再摁 A ---------- */
console.log("\n[复合] 连着摁两下的含义");
check("A·B 作用在 u 上 = 先 B 后 A 分两步",
  vecNear(L.apply(L.mul(M, SHEAR), L.vec(1, 1)), L.apply(M, L.apply(SHEAR, L.vec(1, 1)))));
check("合表第一列 = 左表 ×（右表第一列）", vecNear(col1(L.mul(M, SHEAR)), L.apply(M, col1(SHEAR))));
check("合表第二列 = 左表 ×（右表第二列）", vecNear(col2(L.mul(M, SHEAR)), L.apply(M, col2(SHEAR))));
check("复合后仍是线性变换：可加性", (function () {
  var AB = L.mul(M, SHEAR), u = L.vec(1.1, -0.7), v = L.vec(-0.4, 1.3);
  return vecNear(L.apply(AB, L.add(u, v)), L.add(L.apply(AB, u), L.apply(AB, v)), 1e-9);
})());
check("复合后仍是线性变换：齐次性", (function () {
  var AB = L.mul(M, SHEAR), u = L.vec(1.1, -0.7);
  return vecNear(L.apply(AB, L.scale(u, 2.5)), L.scale(L.apply(AB, u), 2.5), 1e-9);
})());

/* ---------- 视频里那一对：剪切与转 90° ---------- */
console.log("\n[视频那一对] 剪切 ↦ 转90°");
check("转90°·剪切 = [[0,-1],[1,1]]（î→(0,1)，ĵ→(-1,1)）",
  matNear(L.mul(ROT, SHEAR), L.mat(0, -1, 1, 1)));
check("剪切·转90° = [[1,-1],[1,0]]（î→(1,1)，ĵ→(-1,0)）",
  matNear(L.mul(SHEAR, ROT), L.mat(1, -1, 1, 0)));

/* ---------- 非交换 ---------- */
console.log("\n[顺序] 非交换与可交换");
check("一般情形 A·B ≠ B·A", !matNear(L.mul(ROT, SHEAR), L.mul(SHEAR, ROT)));
check("一对角可交换（反例）",
  matNear(L.mul(L.mat(2, 0, 0, 1), L.mat(1, 0, 0, 3)), L.mul(L.mat(1, 0, 0, 3), L.mat(2, 0, 0, 1))));
check("旋转 × 均匀缩放可交换（反例）",
  matNear(L.mul(ROT, L.mat(1.5, 0, 0, 1.5)), L.mul(L.mat(1.5, 0, 0, 1.5), ROT)));
check("换先后，一般情形终点也不同", (function () {
  var u = L.vec(1.3, 0.9);
  return !vecNear(L.apply(L.mul(ROT, SHEAR), u), L.apply(L.mul(SHEAR, ROT), u));
})());

/* ---------- 结合律 ---------- */
console.log("\n[结合律] 括号摆哪儿都一样");
check("(A·B)·C = A·(B·C)", matNear(
  L.mul(L.mul(ROT, SHEAR), L.mat(1.5, 0, 0, 1)),
  L.mul(ROT, L.mul(SHEAR, L.mat(1.5, 0, 0, 1)))));
check("结合律：一批任意表上逐对成立", (function () {
  for (var i = 0; i < 20; i++) {
    var A = rmat(), B = rmat(), C = rmat();
    if (!matNear(L.mul(L.mul(A, B), C), L.mul(A, L.mul(B, C)), 1e-9)) return false;
  }
  return true;
})());
check("但顺序仍要紧：A·B·C ≠ C·B·A（这批里有反例）", (function () {
  for (var i = 0; i < 40; i++) {
    var A = rmat(), B = rmat(), C = rmat();
    if (!matNear(L.mul(A, L.mul(B, C)), L.mul(C, L.mul(B, A)), 1e-9)) return true;
  }
  return false;
})());

/* ---------- 面积：复合的放大倍数相乘 ---------- */
console.log("\n[面积] 复合的放大倍数");
check("det(A·B) = det(A)·det(B)（绕开的互证）", (function () {
  for (var i = 0; i < 12; i++) {
    var A = rmat(), B = rmat();
    if (!near(L.det(L.mul(A, B)), L.det(A) * L.det(B), 1e-8)) return false;
  }
  return true;
})());
check("转90° 与剪切的放大倍数都是 1", near(L.det(ROT), 1) && near(L.det(SHEAR), 1));

/* ---------- 过渡用的 mixMat：只画过程，不参与结论 ---------- */
console.log("\n[过渡] mixMat 走到一半");
check("s=0 还是 A，s=1 就是 B", matNear(L.mixMat(M, SHEAR, 0), M, 1e-12) && matNear(L.mixMat(M, SHEAR, 1), SHEAR, 1e-12));
check("s=0.5 是逐项中点", matNear(L.mixMat(L.mat(0, 0, 0, 0), L.mat(2, 4, -2, 6), 0.5), L.mat(1, 2, -1, 3), 1e-12));
check("第 2 段：把 A 一点点摁上去，s=1 时正是 A·B",
  matNear(L.mul(L.mixMat(L.ID(), ROT, 1), SHEAR), L.mul(ROT, SHEAR), 1e-12));
check("过渡途中每一刻仍是线性变换（去原点＝原点）",
  near(L.norm(L.apply(L.mixMat(L.ID(), M, 0.37), L.vec(0, 0))), 0));

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
  if (mutated === src) { check(name + "（变异本身没生效，检查替换串）", false, "源码中找不到替换目标"); return; }
  let caught = false, detail = "";
  try {
    const M2 = loadMutated(mutated);
    const r = assertion(M2);
    caught = r === false || (r && r.ok === false);
    if (r && r.detail) detail = r.detail;
  } catch (err) { caught = true; detail = err.message; }
  check(name, caught, caught ? "" : "故障装回去了，断言居然没抓住：" + detail);
}

const MUL_LINE = "      A.a * B.a + A.b * B.c, A.a * B.b + A.b * B.d,\n      A.c * B.a + A.d * B.c, A.c * B.b + A.d * B.d";

expectFail("乘法顺序装反（A·B 算成 B·A）→ 复合含义断言抓住",
  { from: MUL_LINE, to: "      B.a * A.a + B.c * A.b, B.a * A.b + B.c * A.d,\n      B.b * A.a + B.d * A.c, B.b * A.b + B.d * A.d" },
  (L2) => {
    const M3 = L2.mat(1.4, 0.6, 0.3, 0.9), S = L2.mat(1, 1, 0, 1);
    return L2.eqv(L2.apply(L2.mul(M3, S), L2.vec(1, 1)), L2.apply(M3, L2.apply(S, L2.vec(1, 1))));
  });

expectFail("合表第二列装错（b/d 项串了）→ 两列算法断言抓住",
  { from: "      A.a * B.a + A.b * B.c, A.a * B.b + A.b * B.d,", to: "      A.a * B.a + A.b * B.c, A.a * B.b + A.b * B.a," },
  (L2) => {
    // 右表取"四个数各不同"的，否则 B.a = B.b 会把故障掩盖掉
    const M3 = L2.mat(1.4, 0.6, 0.3, 0.9), S = L2.mat(1.3, -0.4, 0.6, 1.1);
    const P = L2.mul(M3, S);
    return L2.eqv(L2.vec(P.b, P.d), L2.apply(M3, L2.vec(S.b, S.d)));
  });

expectFail("mixMat 的 s 不生效（永远返回 A）→ 过渡断言抓住",
  { from: "    function mix(x, y) { return x + (y - x) * s; }", to: "    function mix(x, y) { return x; }" },
  (L2) => L2.eqm(L2.mixMat(L2.mat(1, 1, 0, 1), L2.mat(2, 0, 0, 3), 1), L2.mat(2, 0, 0, 3)));

expectFail("det 公式装错（加号）→ det 相乘断言抓住",
  { from: "function det(M) { return M.a * M.d - M.b * M.c; }", to: "function det(M) { return M.a * M.d + M.b * M.c; }" },
  (L2) => {
    // 挑一对特例可能恰好蒙混过关，这里扫一批任意表
    for (let i = 0; i < 12; i++) {
      const A = L2.mat(rnd(), rnd(), rnd(), rnd()), B = L2.mat(rnd(), rnd(), rnd(), rnd());
      if (Math.abs(L2.det(L2.mul(A, B)) - L2.det(A) * L2.det(B)) > 1e-8) return false;
    }
    return true;
  });

/* ---------- 汇总 ---------- */
console.log("\n────────────────────────");
console.log("正向断言：" + pass + " 通过；反向对照全部执行完毕。");
if (fail > 0) {
  console.log("失败 " + fail + " 项：");
  failures.forEach(f => console.log("  - " + f));
  process.exit(1);
}
console.log("全部通过。");
