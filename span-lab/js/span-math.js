/* =========================================================================
 * span-math.js — 张成（span）的纯数学内核
 * 不依赖 DOM / Canvas，浏览器与 Node 共用（UMD）。
 *
 * 约定：向量是数组；矩阵的行是"一个向量"，列是坐标。
 * 所有判定使用相对容差，避免浮点噪声把"共线"判成"张成平面"。
 * ========================================================================= */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.SpanMath = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var EPS = 1e-9;
  var SUB = '₀₁₂₃₄₅₆₇₈₉';

  function clean(x) {
    return Math.abs(x) < 1e-12 ? 0 : x;
  }

  /* ---------------------------------------------------------------- 标量解析 */

  /** 接受 1、-2.5、.5、1e-3、3/4、−1/2（含 Unicode 负号）。非法返回 null。 */
  function parseScalar(raw) {
    if (typeof raw === 'number') {
      return Number.isFinite(raw) && Math.abs(raw) <= 1e9 ? raw : null;
    }
    if (raw == null) return null;
    var s = String(raw).trim()
      .replace(/[−–—]/g, '-')
      .replace(/[／]/g, '/')
      .replace(/[。]/g, '.');
    if (!s) return null;

    var frac = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*\/\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i);
    if (frac) {
      var a = Number(frac[1]), b = Number(frac[2]);
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b) < 1e-12) return null;
      var q = a / b;
      return Number.isFinite(q) && Math.abs(q) <= 1e9 ? q : null;
    }

    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s)) return null;
    var v = Number(s);
    return Number.isFinite(v) && Math.abs(v) <= 1e9 ? v : null;
  }

  /** 面向显示的数字：4 位有效数字，去掉浮点尾巴。 */
  function fmt(x, sig) {
    sig = sig || 4;
    if (!Number.isFinite(x)) return '—';
    if (Math.abs(x) < 5e-10) return '0';
    var r = Number(x.toPrecision(sig));
    if (Object.is(r, -0)) r = 0;
    return String(r);
  }

  /** 输入框回填：尽量短，但不丢精度。 */
  function fmtInput(x) {
    if (!Number.isFinite(x)) return '';
    if (Math.abs(x) < 1e-12) return '0';
    var r = Number(x.toPrecision(12));
    if (Object.is(r, -0)) r = 0;
    return String(r);
  }

  function subscript(n) {
    var s = String(n), out = '';
    for (var i = 0; i < s.length; i++) {
      var d = s.charCodeAt(i) - 48;
      out += d >= 0 && d <= 9 ? SUB[d] : s[i];
    }
    return out;
  }

  function superscript(n) {
    var map = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    return String(n).split('').map(function (c) { return map[c] || c; }).join('');
  }

  /* ---------------------------------------------------------------- 向量运算 */

  function vnorm(v) {
    var s = 0;
    for (var i = 0; i < v.length; i++) s += v[i] * v[i];
    return Math.sqrt(s);
  }

  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function add(a, b) {
    return a.map(function (x, i) { return x + b[i]; });
  }

  function sub(a, b) {
    return a.map(function (x, i) { return x - b[i]; });
  }

  function scaleVec(v, k) {
    return v.map(function (x) { return x * k; });
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function normalize(v) {
    var n = vnorm(v);
    if (n < 1e-12) return null;
    return v.map(function (x) { return x / n; });
  }

  function det2(a, b) {
    return a[0] * b[1] - a[1] * b[0];
  }

  function det3(a, b, c) {
    return a[0] * (b[1] * c[2] - b[2] * c[1])
      - a[1] * (b[0] * c[2] - b[2] * c[0])
      + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }

  /* ---------------------------------------------------------------- 线性代数 */

  /** 行阶梯（RREF）。返回 {matrix, pivots, rank}。 */
  function rref(input) {
    var m = (input || []).map(function (row) { return row.map(clean); });
    var rows = m.length;
    var cols = rows ? m[0].length : 0;
    if (!rows || !cols) return { matrix: [], pivots: [], rank: 0 };

    var maxAbs = 0;
    for (var i = 0; i < rows; i++) {
      for (var j = 0; j < cols; j++) maxAbs = Math.max(maxAbs, Math.abs(m[i][j]));
    }
    var tol = 1e-9 * Math.max(1, maxAbs);

    var r = 0;
    var pivots = [];
    for (var c = 0; c < cols && r < rows; c++) {
      var p = r;
      for (var k = r + 1; k < rows; k++) {
        if (Math.abs(m[k][c]) > Math.abs(m[p][c])) p = k;
      }
      if (Math.abs(m[p][c]) <= tol) {
        for (var k2 = r; k2 < rows; k2++) m[k2][c] = 0;
        continue;
      }
      var tmp = m[r]; m[r] = m[p]; m[p] = tmp;

      var piv = m[r][c];
      for (var j2 = c; j2 < cols; j2++) m[r][j2] = clean(m[r][j2] / piv);

      for (var i2 = 0; i2 < rows; i2++) {
        if (i2 === r) continue;
        var f = m[i2][c];
        if (Math.abs(f) <= tol) { m[i2][c] = 0; continue; }
        for (var j3 = c; j3 < cols; j3++) {
          m[i2][j3] = clean(m[i2][j3] - f * m[r][j3]);
        }
      }
      pivots.push(c);
      r++;
    }
    return { matrix: m, pivots: pivots, rank: pivots.length };
  }

  function rankOf(vectors) {
    if (!vectors || !vectors.length) return 0;
    return rref(vectors).rank;
  }

  /**
   * 解 A x = target，A 的列为 basis 中的向量（即找线性组合系数）。
   * 无解返回 null；有多解时自由变量取 0。
   */
  function solveCombination(target, basis) {
    var dim = target.length;
    var n = basis.length;
    if (!n) return vnorm(target) < 1e-8 ? [] : null;

    var A = [];
    for (var i = 0; i < dim; i++) {
      var row = [];
      for (var j = 0; j < n; j++) row.push(basis[j][i]);
      row.push(target[i]);
      A.push(row);
    }
    var R = rref(A);
    var maxAbs = 0;
    for (var a = 0; a < dim; a++) for (var b = 0; b <= n; b++) maxAbs = Math.max(maxAbs, Math.abs(A[a][b]));
    var tol = 1e-8 * Math.max(1, maxAbs);

    for (var r = 0; r < R.matrix.length; r++) {
      var allZero = true;
      for (var c = 0; c < n; c++) if (Math.abs(R.matrix[r][c]) > tol) allZero = false;
      if (allZero && Math.abs(R.matrix[r][n]) > tol) return null;
    }

    var x = new Array(n).fill(0);
    for (var rr = 0; rr < R.pivots.length; rr++) {
      var col = R.pivots[rr];
      if (col < n) x[col] = clean(R.matrix[rr][n]);
    }

    // 残差复核：防止数值病态把"无解"判成"有解"。
    var residual = sub(target, x.reduce(function (acc, k, idx) {
      return acc.map(function (v, d) { return v + k * basis[idx][d]; });
    }, new Array(dim).fill(0)));
    if (vnorm(residual) > 1e-7 * Math.max(1, vnorm(target))) return null;
    return x;
  }

  /* ---------------------------------------------------------------- 张成判定 */

  /**
   * 计算一组向量的张成信息。
   * @param {number[][]} vectors
   * @param {2|3} dim
   */
  function spanInfo(vectors, dim) {
    var vecs = (vectors || []).map(function (v) {
      var out = [];
      for (var i = 0; i < dim; i++) out.push(clean(Number(v[i]) || 0));
      return out;
    });
    var n = vecs.length;

    var increments = [];
    var basis = [];
    var basisIndices = [];
    var rank = 0;

    for (var k = 0; k < n; k++) {
      var before = rank;
      var after = rankOf(vecs.slice(0, k + 1));
      var independent = after > before;
      var zero = vnorm(vecs[k]) < 1e-10;
      var terms = null;

      if (!independent && !zero && basis.length) {
        var coefs = solveCombination(vecs[k], basis);
        if (coefs) {
          terms = [];
          for (var j = 0; j < coefs.length; j++) {
            if (Math.abs(coefs[j]) > 1e-9) {
              terms.push({ index: basisIndices[j], coef: clean(coefs[j]) });
            }
          }
        }
      }

      increments.push({
        index: k,
        vector: vecs[k],
        independent: independent,
        zero: zero,
        rankAfter: after,
        terms: terms
      });

      if (independent) {
        basis.push(vecs[k].slice());
        basisIndices.push(k);
        rank = after;
      }
    }

    var kind = rank === 0 ? 'point' : rank === 1 ? 'line' : rank === 2 ? 'plane' : 'space';
    var whole = rank === dim;
    var direction = null;
    var lineNormal = null;
    var planeNormal = null;
    var equation = null;
    var measure = null;
    var measureKind = null;

    if (rank >= 1) direction = normalize(basis[0]);
    if (rank === 1 && dim === 2) {
      lineNormal = [direction[1], -direction[0]];
      var ln = prettyNormal(lineNormal);
      equation = {
        type: 'line2',
        normal: ln,
        text: normalEquation(ln, ['x', 'y'])
      };
      measure = vnorm(basis[0]);
      measureKind = 'length';
    } else if (rank === 1 && dim === 3) {
      equation = {
        type: 'param3',
        direction: basis[0].slice(),
        text: '(x, y, z) = t · ' + formatVector(basis[0]) + ',  t ∈ ℝ'
      };
      measure = vnorm(basis[0]);
      measureKind = 'length';
    } else if (rank === 2 && dim === 3) {
      planeNormal = cross(basis[0], basis[1]);
      var pn = prettyNormal(planeNormal);
      equation = {
        type: 'plane3',
        normal: pn,
        text: normalEquation(pn, ['x', 'y', 'z'])
      };
      measure = vnorm(planeNormal);
      measureKind = 'area';
    } else if (rank === 2 && dim === 2) {
      equation = { type: 'whole2', text: '整个 ℝ²' };
      measure = Math.abs(det2(basis[0], basis[1]));
      measureKind = 'area';
    } else if (rank === 3 && dim === 3) {
      equation = { type: 'whole3', text: '整个 ℝ³' };
      measure = Math.abs(det3(basis[0], basis[1], basis[2]));
      measureKind = 'volume';
    } else if (rank === 0) {
      equation = { type: 'point', text: dim === 2 ? '{ (0, 0) }' : '{ (0, 0, 0) }' };
    }

    return {
      dim: dim,
      count: n,
      rank: rank,
      kind: kind,
      whole: whole,
      basis: basis,
      basisIndices: basisIndices,
      increments: increments,
      direction: direction,
      lineNormal: lineNormal,
      planeNormal: planeNormal,
      equation: equation,
      measure: measure,
      measureKind: measureKind,
      vectors: vecs
    };
  }

  function spanLabel(info) {
    if (info.rank === 0) return '原点';
    if (info.rank === 1) return '一条过原点的直线';
    if (info.rank === 2) return info.dim === 2 ? '整个平面' : '一张过原点的平面';
    return '整个三维空间';
  }

  function dimensionLabel(info) {
    if (info.rank === 0) return '0 维 · 只有原点';
    if (info.rank === 1) return '1 维 · 直线';
    if (info.rank === 2) return '2 维 · 平面';
    return '3 维 · 全空间';
  }

  /* ---------------------------------------------------------------- 整数组合点阵 */

  /**
   * 生成整数系数组合的点阵，用来把"所有线性组合"变成看得见的东西。
   * 返回 [{coefs, point}]。
   */
  function latticePoints(basis, opts) {
    opts = opts || {};
    var range = opts.range == null ? 6 : opts.range;
    var maxNorm = opts.maxNorm == null ? Infinity : opts.maxNorm;
    var out = [];

    function push(coefs) {
      var p = new Array(basis[0].length).fill(0);
      for (var i = 0; i < basis.length; i++) {
        for (var d = 0; d < p.length; d++) p[d] += coefs[i] * basis[i][d];
      }
      if (vnorm(p) <= maxNorm + 1e-9) out.push({ coefs: coefs, point: p });
    }

    if (!basis.length) return out;
    if (basis.length === 1) {
      for (var a = -range; a <= range; a++) push([a]);
    } else if (basis.length === 2) {
      for (var b = -range; b <= range; b++) {
        for (var c = -range; c <= range; c++) push([b, c]);
      }
    } else {
      var r3 = Math.min(range, 2);
      for (var d3 = -r3; d3 <= r3; d3++) {
        for (var e3 = -r3; e3 <= r3; e3++) {
          for (var f3 = -r3; f3 <= r3; f3++) push([d3, e3, f3]);
        }
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- 文本格式 */

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a;
  }

  /** 把法向量化成尽量整洁的整数/短小数。 */
  function prettyNormal(n) {
    var maxAbs = 0;
    for (var i = 0; i < n.length; i++) maxAbs = Math.max(maxAbs, Math.abs(n[i]));
    if (maxAbs < 1e-12) return null;

    var scaled = n.map(function (x) { return x / maxAbs; });
    var candidates = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20];
    for (var ci = 0; ci < candidates.length; ci++) {
      var k = candidates[ci];
      var ints = scaled.map(function (x) { return x * k; });
      var allInt = ints.every(function (x) { return Math.abs(x - Math.round(x)) < 1e-7; });
      if (allInt) {
        var arr = ints.map(Math.round);
        var g = 0;
        for (var j = 0; j < arr.length; j++) g = gcd(g, arr[j]);
        if (!g) g = 1;
        arr = arr.map(function (x) { return x / g; });
        var first = arr.find(function (x) { return x !== 0; });
        if (first != null && first < 0) arr = arr.map(function (x) { return -x; });
        return arr;
      }
    }
    var out = scaled.map(function (x) { return Number(x.toPrecision(3)); });
    var f = out.find(function (x) { return Math.abs(x) > 1e-9; });
    if (f != null && f < 0) out = out.map(function (x) { return -x; });
    return out;
  }

  function coefText(c) {
    var a = Math.abs(c);
    if (Math.abs(a - 1) < 1e-9) return '';
    return fmt(a);
  }

  function normalEquation(n, vars) {
    if (!n) return '';
    var parts = [];
    for (var i = 0; i < n.length; i++) {
      if (Math.abs(n[i]) < 1e-9) continue;
      var sign = n[i] < 0 ? '−' : '+';
      var body = coefText(n[i]) + vars[i];
      parts.push({ sign: sign, body: body, first: parts.length === 0 });
    }
    if (!parts.length) return '0 = 0';
    return parts.map(function (p, idx) {
      if (idx === 0) return (p.sign === '−' ? '−' : '') + p.body;
      return ' ' + p.sign + ' ' + p.body;
    }).join('') + ' = 0';
  }

  function formatVector(v) {
    return '(' + v.map(function (x) { return fmt(x, 3); }).join(', ') + ')';
  }

  /** 把 dependent 向量写成"v₃ = 2v₁ − 0.5v₂"。 */
  function relationText(index, terms) {
    var lhs = 'v' + subscript(index + 1);
    if (!terms || !terms.length) return lhs + ' = 0';
    var rhs = terms.map(function (t, i) {
      var sign = t.coef < 0 ? '−' : '+';
      var body = coefText(t.coef) + 'v' + subscript(t.index + 1);
      if (i === 0) return (sign === '−' ? '−' : '') + body;
      return ' ' + sign + ' ' + body;
    }).join('');
    return lhs + ' = ' + rhs;
  }

  function combinationText(coefs, vectors) {
    var terms = coefs.map(function (c, i) {
      return { index: i, coef: c };
    }).filter(function (t) { return Math.abs(t.coef) > 1e-9; });
    if (!terms.length) return '0';
    return terms.map(function (t, i) {
      var sign = t.coef < 0 ? '−' : '+';
      var body = coefText(t.coef) + 'v' + subscript(t.index + 1);
      if (i === 0) return (sign === '−' ? '−' : '') + body;
      return ' ' + sign + ' ' + body;
    }).join('');
  }

  return {
    EPS: EPS,
    parseScalar: parseScalar,
    fmt: fmt,
    fmtInput: fmtInput,
    subscript: subscript,
    superscript: superscript,
    vnorm: vnorm,
    dot: dot,
    add: add,
    sub: sub,
    scale: scaleVec,
    cross: cross,
    normalize: normalize,
    det2: det2,
    det3: det3,
    rref: rref,
    rankOf: rankOf,
    solveCombination: solveCombination,
    spanInfo: spanInfo,
    spanLabel: spanLabel,
    dimensionLabel: dimensionLabel,
    latticePoints: latticePoints,
    prettyNormal: prettyNormal,
    normalEquation: normalEquation,
    formatVector: formatVector,
    relationText: relationText,
    combinationText: combinationText
  };
});
