/* ============================================================
 * 线性代数基础 · 核心数学（assets/core.js）
 * 这一层是纯计算：vec2 / mat2 / 特征方向 / 矩阵指数。
 * 浏览器里挂在 window.Lin，Node 里 module.exports，
 * 因此 tests/verify-core.cjs 可以直接抽出来跑断言，
 * 包括"把故障装回去"的反向对照。
 *
 * 记号与文章、与全部五个视角一致：
 *   u, v     一捆数（平面上从原点出发的箭头）
 *   M, A, B  一张表 [[a,b],[c,d]]，作用在 u 上：M·u
 *   λ        特征方向上的放大倍数
 *   det(M)   作用对面积的放大倍数
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Lin = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- 一捆数 ---------- */
  function vec(x, y) { return { x: x, y: y }; }
  function add(u, v) { return vec(u.x + v.x, u.y + v.y); }
  function sub(u, v) { return vec(u.x - v.x, u.y - v.y); }
  function scale(u, s) { return vec(u.x * s, u.y * s); }
  function dot(u, v) { return u.x * v.x + u.y * v.y; }
  function norm(u) { return Math.hypot(u.x, u.y); }
  function normalize(u) { var n = norm(u); return n < 1e-15 ? null : scale(u, 1 / n); }
  function dist(u, v) { return Math.hypot(u.x - v.x, u.y - v.y); }
  function cross(u, v) { return u.x * v.y - u.y * v.x; }
  function eqv(u, v, eps) {
    eps = eps || 1e-10;
    return Math.abs(u.x - v.x) < eps && Math.abs(u.y - v.y) < eps;
  }

  /* ---------- 一张表 ---------- mat = [[a,b],[c,d]]，M·(x,y) = (a*x+b*y, c*x+d*y) */
  function mat(a, b, c, d) { return { a: a, b: b, c: c, d: d }; }
  function ID() { return mat(1, 0, 0, 1); }
  function ZERO() { return mat(0, 0, 0, 0); }
  function apply(M, u) { return vec(M.a * u.x + M.b * u.y, M.c * u.x + M.d * u.y); }
  function mul(A, B) { // A·B：先摁 B，再摁 A
    return mat(
      A.a * B.a + A.b * B.c, A.a * B.b + A.b * B.d,
      A.c * B.a + A.d * B.c, A.c * B.b + A.d * B.d
    );
  }
  function det(M) { return M.a * M.d - M.b * M.c; }
  function trace(M) { return M.a + M.d; }
  function isZero(M, eps) {
    eps = eps || 1e-12;
    return Math.abs(M.a) < eps && Math.abs(M.b) < eps && Math.abs(M.c) < eps && Math.abs(M.d) < eps;
  }
  function eqm(A, B, eps) {
    eps = eps || 1e-10;
    return Math.abs(A.a - B.a) < eps && Math.abs(A.b - B.b) < eps &&
           Math.abs(A.c - B.c) < eps && Math.abs(A.d - B.d) < eps;
  }
  function inv(M) {
    var d = det(M);
    if (Math.abs(d) < 1e-12) return null; // 被摁扁了，反不回去
    return mat(M.d / d, -M.b / d, -M.c / d, M.a / d);
  }
  function solve(M, b) { var Mi = inv(M); return Mi ? apply(Mi, b) : null; }
  function scaleMat(M, s) { return mat(M.a * s, M.b * s, M.c * s, M.d * s); }
  function addMat(A, B) { return mat(A.a + B.a, A.b + B.b, A.c + B.c, A.d + B.d); }

  /* ---------- 特征方向 ----------
   * 2×2 的表，特征方程 λ² − tr·λ + det = 0。
   * disc > 0：两个实特征方向（方向不变，只剩长度按 λ 变）
   * disc < 0：没有不转的方向——是一边转圈一边缩放（复数乘法，04/05 篇的老朋友）
   * disc = 0：重根；除恒定表外只有一个方向（或每个方向）
   */
  function eigen(M) {
    var tr = trace(M), d = det(M);
    var disc = tr * tr - 4 * d;
    if (disc > 1e-10) {
      var s = Math.sqrt(disc);
      var l1 = (tr + s) / 2, l2 = (tr - s) / 2;
      function dir(l) {
        var r1 = vec(M.a - l, M.b), r2 = vec(M.c, M.d - l);
        var n1 = norm(r1), n2 = norm(r2);
        var r = n1 >= n2 ? r1 : r2;
        if (norm(r) < 1e-14) return null;
        return normalize(vec(-r.y, r.x)); // 与行垂直即零空间方向
      }
      return { type: "real", l1: l1, l2: l2, v1: dir(l1), v2: dir(l2), disc: disc };
    }
    if (disc < -1e-10) {
      return { type: "complex", re: tr / 2, im: Math.sqrt(-disc) / 2, disc: disc };
    }
    var l = tr / 2;
    var scalar = Math.abs(M.b) < 1e-12 && Math.abs(M.c) < 1e-12 && Math.abs(M.a - M.d) < 1e-12;
    var r1 = vec(M.a - l, M.b), r2 = vec(M.c, M.d - l);
    var r = norm(r1) >= norm(r2) ? r1 : r2;
    return {
      type: "repeated", l: l, scalar: scalar,
      v: norm(r) < 1e-14 ? null : normalize(vec(-r.y, r.x)), disc: disc
    };
  }

  /* ---------- 矩阵指数：相空间里"这一捆接下来去哪" ----------
   * e^{Mt}：把一捆数摁了时间 t 那么久。
   * 复数特征（弹簧欠阻尼）：e^{Mt} = e^{re·t}(cos(im·t)·I + sin(im·t)/im·(M−re·I))
   * 两个实特征：Sylvester 插值
   * 重根：e^{λt}(I + (M−λI)t)
   */
  function expm2(M, t) {
    var e = eigen(M);
    if (e.type === "complex") {
      var re = e.re, im = e.im;
      var B = mat(M.a - re, M.b, M.c, M.d - re);
      var k = Math.abs(im) < 1e-12 ? t : Math.sin(im * t) / im;
      var f = Math.exp(re * t);
      var c = Math.cos(im * t);
      return mat(f * (c + k * B.a), f * (k * B.b), f * (k * B.c), f * (c + k * B.d));
    }
    if (e.type === "real" && Math.abs(e.l1 - e.l2) > 1e-9) {
      var l1 = e.l1, l2 = e.l2;
      var A1 = mat((M.a - l2) / (l1 - l2), M.b / (l1 - l2), M.c / (l1 - l2), (M.d - l2) / (l1 - l2));
      var A2 = mat((M.a - l1) / (l2 - l1), M.b / (l2 - l1), M.c / (l2 - l1), (M.d - l1) / (l2 - l1));
      var f1 = Math.exp(l1 * t), f2 = Math.exp(l2 * t);
      return mat(f1 * A1.a + f2 * A2.a, f1 * A1.b + f2 * A2.b,
                 f1 * A1.c + f2 * A2.c, f1 * A1.d + f2 * A2.d);
    }
    var lr = e.type === "repeated" ? e.l : e.l1;
    var fr = Math.exp(lr * t);
    return mat(fr * (1 + (M.a - lr) * t), fr * (M.b * t), fr * (M.c * t), fr * (1 + (M.d - lr) * t));
  }

  /* ---------- 常用预设表 ---------- */
  var PRESETS = {
    identity:  { label: "不动（单位表）", m: mat(1, 0, 0, 1) },
    stretchX:  { label: "横方向抻 2 倍", m: mat(2, 0, 0, 1) },
    rotate90:  { label: "转 90°", m: mat(0, -1, 1, 0) },
    rotScale:  { label: "转 45° 再缩一半", m: mat(Math.SQRT1_2 / 2, -Math.SQRT1_2 / 2, Math.SQRT1_2 / 2, Math.SQRT1_2 / 2) },
    shear:     { label: "剪切（顶被推歪）", m: mat(1, 1, 0, 1) },
    flip:      { label: "翻面（mirror）", m: mat(-1, 0, 0, 1) },
    squash:    { label: "摁扁（det=0）", m: mat(1, 0.5, 2, 1) },
    diag21:    { label: "两个方向各伸缩", m: mat(2, 0, 0, 1.3) },
    sym:       { label: "对称表", m: mat(2, 0.9, 0.9, 1.3) },
    springC0:  { label: "弹簧 · 无阻尼", m: mat(0, 1, -4, 0) },
    springCd:  { label: "弹簧 · 小阻尼", m: mat(0, 1, -4, -0.4) },
    springCo:  { label: "弹簧 · 大阻尼", m: mat(0, 1, -4, -4.5) }
  };

  return {
    vec: vec, add: add, sub: sub, scale: scale, dot: dot, norm: norm,
    normalize: normalize, dist: dist, cross: cross, eqv: eqv,
    mat: mat, ID: ID, ZERO: ZERO, apply: apply, mul: mul, det: det, trace: trace,
    isZero: isZero, eqm: eqm, inv: inv, solve: solve, scaleMat: scaleMat, addMat: addMat,
    eigen: eigen, expm2: expm2, PRESETS: PRESETS
  };
});
