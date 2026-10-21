/* ============================================================
 * assets/core.js —— 核心数学（《让会倒的东西站住》配套项目）
 *
 * 与上一篇《一捆数与一张表》的 项目/assets/core.js 同一套记号与同一套函数，
 * 在其上追加了"控制"这一站要用的三件东西：
 *   闭环改表  A → A − b·k       （把测到的偏差引回来，喂进那张表）
 *   倍数搬家  placePoles        （想让两个倍数落到哪，反解出 k）
 *   够不够得着 controllable     （两张表拼起来，行列式为 0 就是搬不动）
 *
 * 浏览器里挂在 window.Lin，Node 里 module.exports，
 * 因此 tests/verify-core.cjs 可以直接抽出来跑断言，
 * 包括"把故障装回去"的反向对照。
 *
 * 记号与文章、与全部五个视角一致：
 *   θ, ω     一捆数（偏角、角速度）——相平面上从原点出发的箭头
 *   A        一张表 [[a,b],[c,d]]，作用在 x 上：A·x
 *   a, c     这张表的两个数：a = g/L（棍子"往外拉的劲"），c = 阻尼
 *   b        输入从哪进去（一列）；k        反馈系数（一行）
 *   λ        特征方向上的倍数（特征值）
 *   det(A)   作用对面积的放大倍数
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

  /* ============================================================
   * 以下为这一篇新增：控制这一站的三件东西
   * ============================================================ */

  /* ---------- 一张表"稳不稳"，只看两个倍数 ----------
   * λ² − tr·λ + det = 0。两个倍数的实部都小于 0 → 自己会回来；
   * 只要有一个大于 0 → 有一个方向自己跑掉。
   */
  function maxReal(M) {
    var e = eigen(M);
    if (e.type === "complex") return e.re;
    if (e.type === "real") return Math.max(e.l1, e.l2);
    return e.l;
  }
  function allNegative(M, eps) {
    return maxReal(M) < -(eps || 1e-9);
  }
  /* 一句话说清"稳不稳"：maxReal < 0 自己回来；> 0 自己跑掉；= 0 不肯停 */
  function verdict(M, eps) {
    var m = maxReal(M);
    eps = eps || 1e-9;
    if (m < -eps) return "回";
    if (m > eps) return "跑";
    return "绕";
  }

  /* ---------- 把测到的偏差引回来 ----------
   * 一列 b 说"从哪儿使劲"，一行 k 说"用多大力"。
   * 闭环那张表 ＝ A − b·k（一个列乘一个行，得到 2×2）。
   */
  function closeLoop(A, b, k) {
    return mat(A.a - b.x * k.x, A.b - b.x * k.y,
               A.c - b.y * k.x, A.d - b.y * k.y);
  }

  /* ---------- 够不够得着：两张表拼起来 ----------
   * C = [ b , A·b ]（两列）。det(C) 不为 0 → 每个方向都够得着，倍数想搬哪搬哪；
   * 等于 0 → 有一个方向，怎么使劲都够不着，那个倍数搬不动。
   */
  function controlMatrix(A, b) {
    var ab = apply(A, b);
    return mat(b.x, ab.x, b.y, ab.y); // 列为 b 与 A·b
  }
  function controllable(A, b) { return Math.abs(det(controlMatrix(A, b))) > 1e-9; }

  /* ---------- 倍数搬家（极点配置）----------
   * 想让闭环那张表的两个倍数是 p、q，反解出该用多大力：Ackermann 公式
   *   k = e₂ᵀ · C⁻¹ · φ(A),   φ(A) = A² − (p+q)A + pq·I
   * det(C) = 0 时返回 null：那个倍数搬不动。
   */
  /* 只说"两个倍数加起来是多少（s）、乘起来是多少（t）"的版本。
     目标是共轭一对 p ± qi 时，s ＝ 2p、t ＝ p²+q² 仍是实数，
     所以这一版照样给出实的 k —— 一行实数的力，搬得动一对共轭的倍数。 */
  function placePolesST(A, b, s, t) {
    var ab = apply(A, b);
    var d = b.x * ab.y - ab.x * b.y;          // ＝ det(C)
    if (Math.abs(d) < 1e-9) return null;       // 够不着，搬不动
    var A2 = mul(A, A);
    var phi = mat(A2.a - s * A.a + t, A2.b - s * A.b,
                  A2.c - s * A.c, A2.d - s * A.d + t);
    var rx = -b.y / d, ry = b.x / d;          // C⁻¹ 的第二行
    return vec(rx * phi.a + ry * phi.c, rx * phi.b + ry * phi.d);
  }
  function placePoles(A, b, p, q) { return placePolesST(A, b, p + q, p * q); }

  /* 反过来念同一件事：对棍子这张表（b ＝ (0,1)），想让两个倍数的"和"是 s、
     "积"是 t，要用的力写成两行就有闭式——
       k₁ ＝ a + t， k₂ ＝ −s − c
     因为闭环那张表的特征方程恰好是 λ² + (c+k₂)λ + (k₁−a) ＝ 0，
     对着 λ² − sλ + t 一比系数就出来了。这是"搬到哪要多少力"的另一条算路，
     与 placePoles 的拉杆公式互相印证（views/04 就是拿它俩对读的）。 */
  function gainsStick(a, c, s, t) { return vec(a + t, -s - c); }

  /* ---------- 预设 ---------- */
  var PRESETS = {
    identity:  { label: "不动（单位表）", m: mat(1, 0, 0, 1) },
    stretchX:  { label: "横方向抻 2 倍", m: mat(2, 0, 0, 1) },
    rotate90:  { label: "转 90°", m: mat(0, -1, 1, 0) },
    shear:     { label: "剪切（顶被推歪）", m: mat(1, 1, 0, 1) },
    squash:    { label: "摁扁（det=0）", m: mat(1, 0.5, 2, 1) },
    /* 这一篇的主角：棍子。A = [[0,1],[a,−c]]，a = g/L，c = 阻尼 */
    stick:     { label: "立在掌心的棍子", m: mat(0, 1, 1, -0.2) },
    pendulum:  { label: "挂在下面的摆", m: mat(0, 1, -1, -0.2) },
    stiffer:   { label: "更长的棍子（a 更小）", m: mat(0, 1, 0.4, -0.2) },
    damped:    { label: "阻尼加倍", m: mat(0, 1, 1, -1.2) }
  };

  /* 这一篇反复用的几个量：棍子的表、从哪儿使劲、闭环之后 */
  function stickMat(a, c) { return mat(0, 1, a, -c); }
  var B_STICK = vec(0, 1);   // 手（或轮子）的力作用在角速度这一行上

  return {
    vec: vec, add: add, sub: sub, scale: scale, dot: dot, norm: norm,
    normalize: normalize, dist: dist, cross: cross, eqv: eqv,
    mat: mat, ID: ID, ZERO: ZERO, apply: apply, mul: mul, det: det, trace: trace,
    isZero: isZero, eqm: eqm, inv: inv, solve: solve, scaleMat: scaleMat, addMat: addMat,
    eigen: eigen, expm2: expm2, PRESETS: PRESETS,
    /* 控制三件套 */
    maxReal: maxReal, allNegative: allNegative, verdict: verdict,
    closeLoop: closeLoop, controlMatrix: controlMatrix, controllable: controllable,
    placePoles: placePoles, placePolesST: placePolesST, gainsStick: gainsStick,
    stickMat: stickMat, B_STICK: B_STICK
  };
});
