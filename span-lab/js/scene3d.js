/* =========================================================================
 * scene3d.js — 三维张成空间渲染器（自研透视投影，Canvas 2D，无外部依赖）
 * 坐标约定：右手系，z 轴向上；轨道相机绕原点旋转。
 * ========================================================================= */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./span-math.js'), require('./canvas-utils.js'));
  } else {
    global.Scene3D = factory(global.SpanMath, global.CanvasUtils);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, U) {
  'use strict';

  var SPAN = '#00adb5';
  var AXIS = { x: '#ff6b6b', y: '#51cf66', z: '#4dabf7' };
  var VECTOR_COLORS = ['#00adb5', '#ff9f43', '#e056a0', '#4dabf7', '#b197fc', '#ff6b6b', '#51cf66', '#f7b731'];
  var DEFAULT_YAW = -0.62;
  var DEFAULT_PITCH = 0.46;

  function Scene3D(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = Object.assign({ autoResize: true, animate: true }, opts || {});
    this.w = 960;
    this.h = 600;
    this.dpr = 1;
    this.camera = {
      yaw: DEFAULT_YAW,
      pitch: DEFAULT_PITCH,
      dist: 14,
      fov: 36 * Math.PI / 180,
      userAdjusted: false
    };
    this.world = { vectors: [], revealed: false, info: null };
    this.probe = null;
    this.revealT = 1;
    this._pending = false;
    this._anim = null;
    this._drag = null;
    this._cam = null;
    this.stats = { rank: 0, arrows: 0, lattice: 0, plane: false, space: false, revealed: false };

    if (this.opts.autoResize && typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      var self = this;
      this._ro = new ResizeObserver(function () {
        self.resize(canvas.clientWidth, canvas.clientHeight, globalThis.devicePixelRatio || 1);
      });
      this._ro.observe(canvas.parentElement);
    }

    this._bind();
    this.resize(canvas.clientWidth || 960, canvas.clientHeight || 600, globalThis.devicePixelRatio || 1);
  }

  Scene3D.prototype._bind = function () {
    var self = this;
    var canvas = this.canvas;
    if (!canvas.addEventListener) return;

    canvas.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      self._drag = { x: e.clientX, y: e.clientY };
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!self._drag) return;
      var dx = e.clientX - self._drag.x;
      var dy = e.clientY - self._drag.y;
      self._drag.x = e.clientX;
      self._drag.y = e.clientY;
      self.camera.yaw -= dx * 0.008;
      self.camera.pitch = U.clamp(self.camera.pitch + dy * 0.008, -1.28, 1.34);
      self.camera.userAdjusted = true;
      self.requestRender();
    });
    function end(e) {
      self._drag = null;
      canvas.style.cursor = 'grab';
      if (canvas.releasePointerCapture && e && e.pointerId != null) {
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
      }
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('dblclick', function () { self.resetView(); });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.camera.dist = U.clamp(self.camera.dist * Math.exp(e.deltaY * 0.0012), 3.2, 55);
      self.camera.userAdjusted = true;
      self.requestRender();
    }, { passive: false });
    canvas.style.cursor = 'grab';
  };

  Scene3D.prototype.resize = function (w, h, dpr) {
    this.w = Math.max(1, w || this.w);
    this.h = Math.max(1, h || this.h);
    this.dpr = dpr || 1;
    var pw = Math.round(this.w * this.dpr);
    var ph = Math.round(this.h * this.dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    if (!this.camera.userAdjusted) this.fit();
    // 同步重绘：尺寸变化会清空画布，不能把重绘押在 rAF 上
    this.render();
  };

  Scene3D.prototype.setWorld = function (world) {
    this.world = {
      vectors: (world.vectors || []).map(function (v) { return v.slice(); }),
      revealed: !!world.revealed,
      info: world.info || null
    };
    if (!this.camera.userAdjusted) this.fit();
    this.requestRender();
  };

  Scene3D.prototype.setProbe = function (probe) {
    this.probe = probe;
    this.requestRender();
  };

  Scene3D.prototype.fit = function () {
    var maxNorm = 0;
    for (var i = 0; i < this.world.vectors.length; i++) {
      maxNorm = Math.max(maxNorm, M.vnorm(this.world.vectors[i]));
    }
    if (this.probe && this.probe.coefs && this.world.vectors.length) {
      var p = this.probePoint();
      if (p) maxNorm = Math.max(maxNorm, M.vnorm(p));
    }
    this.camera.dist = U.clamp(Math.max(4.5, maxNorm * 4.1), 4.5, 50);
  };

  Scene3D.prototype.resetView = function () {
    this.camera.yaw = DEFAULT_YAW;
    this.camera.pitch = DEFAULT_PITCH;
    this.camera.userAdjusted = false;
    this.fit();
    this.render();
  };

  Scene3D.prototype.probePoint = function () {
    if (!this.probe || !this.probe.coefs) return null;
    var out = [0, 0, 0];
    for (var i = 0; i < this.world.vectors.length && i < this.probe.coefs.length; i++) {
      for (var d = 0; d < 3; d++) out[d] += this.probe.coefs[i] * this.world.vectors[i][d];
    }
    return out;
  };

  Scene3D.prototype._computeCamera = function () {
    var c = this.camera;
    var cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    var eye = [c.dist * cp * Math.sin(c.yaw), -c.dist * cp * Math.cos(c.yaw), c.dist * sp];
    var forward = M.normalize([-eye[0], -eye[1], -eye[2]]);
    var right = M.normalize(M.cross(forward, [0, 0, 1]));
    var up = M.cross(right, forward);
    this._cam = {
      eye: eye,
      forward: forward,
      right: right,
      up: up,
      f: (this.h / 2) / Math.tan(c.fov / 2)
    };
    return this._cam;
  };

  Scene3D.prototype.project = function (p) {
    var c = this._cam || this._computeCamera();
    var rel = [p[0] - c.eye[0], p[1] - c.eye[1], p[2] - c.eye[2]];
    var z = M.dot(rel, c.forward);
    if (z < 0.08) return { x: 0, y: 0, z: z, visible: false };
    return {
      x: this.w / 2 + M.dot(rel, c.right) * c.f / z,
      y: this.h / 2 - M.dot(rel, c.up) * c.f / z,
      z: z,
      visible: true
    };
  };

  Scene3D.prototype.depthAlpha = function (z, min) {
    var d = this.camera.dist;
    var v = 0.58 + 0.42 * U.clamp((d * 1.45 - z) / (d * 0.95), 0, 1);
    return Math.max(min == null ? 0.3 : min, Math.min(1, v));
  };

  Scene3D.prototype.animateReveal = function (duration) {
    var self = this;
    duration = duration || 820;
    var reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.opts.animate === false || reduceMotion || typeof requestAnimationFrame !== 'function') {
      this.revealT = 1;
      this.render();
      return;
    }
    if (this._anim) cancelAnimationFrame(this._anim);
    this.revealT = 0;
    var start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var step = function (now) {
      var t = Math.min(1, (now - start) / duration);
      self.revealT = U.easeOutCubic(t);
      self.render();
      if (t < 1) self._anim = requestAnimationFrame(step);
      else self._anim = null;
    };
    this._anim = requestAnimationFrame(step);
  };

  Scene3D.prototype.requestRender = function () {
    var self = this;
    if (this._pending) return;
    this._pending = true;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { self._pending = false; self.render(); });
    } else {
      this._pending = false;
      this.render();
    }
  };

  Scene3D.prototype.clear = function () {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    var bg = ctx.createRadialGradient(this.w * .5, this.h * .42, 0, this.w * .5, this.h * .42, Math.max(this.w, this.h) * .72);
    bg.addColorStop(0, 'rgba(0,173,181,.05)');
    bg.addColorStop(1, 'rgba(17,17,18,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.w, this.h);
  };

  Scene3D.prototype.render = function () {
    if (!this.ctx) return;
    this._computeCamera();
    this.clear();

    this.drawFloor();

    var info = this.world.info;
    var revealed = this.world.revealed && info;
    var t = revealed ? this.revealT : 0;
    var latticeCount = 0;

    if (revealed) {
      if (info.rank === 0) latticeCount = this.drawPointSpan(t);
      else if (info.rank === 1) latticeCount = this.drawLineSpan(info, t);
      else if (info.rank === 2) latticeCount = this.drawPlaneSpan(info, t);
      else latticeCount = this.drawSpaceSpan(info, t);
    }

    this.drawAxes();
    this.drawVectors(revealed ? info : null);
    this.drawProbe();
    this.drawOrigin();

    if (!revealed) this.drawHint();
    else this.drawWatermark(info);

    this.stats = {
      rank: info ? info.rank : 0,
      arrows: this.world.vectors.length,
      lattice: latticeCount,
      plane: !!revealed && info.rank === 2,
      space: !!revealed && info.rank === 3,
      revealed: !!revealed
    };
  };

  /* ---------------------------------------------------------------- 地面与坐标轴 */

  Scene3D.prototype.drawFloor = function () {
    var ctx = this.ctx;
    var G = this.camera.dist * 0.6;
    var scaleAtOrigin = this._cam.f / this.camera.dist;
    var step = U.niceStep(54 / scaleAtOrigin);
    var count = Math.ceil(G / step);

    ctx.save();
    for (var i = -count; i <= count; i++) {
      var a = i * step;
      if (Math.abs(a) > G + 1e-9) continue;
      var p1 = this.project([-G, a, 0]);
      var p2 = this.project([G, a, 0]);
      var p3 = this.project([a, -G, 0]);
      var p4 = this.project([a, G, 0]);
      var major = Math.abs(i) % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(160,160,168,.12)' : 'rgba(160,160,168,.062)';
      ctx.lineWidth = 1;
      if (p1.visible && p2.visible) {
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
      if (p3.visible && p4.visible) {
        ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
      }
    }
    ctx.restore();
  };

  Scene3D.prototype.drawAxes = function () {
    var ctx = this.ctx;
    var G = this.camera.dist * 0.66;
    var axes = [
      { dir: [1, 0, 0], neg: [-1, 0, 0], color: AXIS.x, label: 'x' },
      { dir: [0, 1, 0], neg: [0, -1, 0], color: AXIS.y, label: 'y' },
      { dir: [0, 0, 1], neg: [0, 0, -1], color: AXIS.z, label: 'z' }
    ];
    for (var i = 0; i < axes.length; i++) {
      var ax = axes[i];
      var end = [ax.dir[0] * G, ax.dir[1] * G, ax.dir[2] * G];
      var start = [ax.neg[0] * G * 0.8, ax.neg[1] * G * 0.8, ax.neg[2] * G * 0.8];
      var p0 = this.project(start);
      var p1 = this.project(end);
      if (!p0.visible || !p1.visible) continue;
      ctx.save();
      ctx.strokeStyle = U.hexToRgba(ax.color, .5);
      ctx.lineWidth = 1.15;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      U.arrowHead(ctx, p0.x, p0.y, p1.x, p1.y, 8, U.hexToRgba(ax.color, .7), 1);
      U.label(ctx, ax.label, p1.x + 12, p1.y - 8, {
        color: U.hexToRgba(ax.color, .9),
        font: 'italic 600 13px ' + U.FONT_MATH
      });
      ctx.restore();
    }
  };

  /* ---------------------------------------------------------------- 张成几何 */

  Scene3D.prototype.drawPointSpan = function (t) {
    var ctx = this.ctx;
    var o = this.project([0, 0, 0]);
    if (!o.visible) return 0;
    ctx.save();
    ctx.globalAlpha = t;
    ctx.strokeStyle = U.hexToRgba(SPAN, .8);
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(o.x, o.y, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = U.hexToRgba(SPAN, .9);
    ctx.beginPath(); ctx.arc(o.x, o.y, 3.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    U.label(ctx, 'span = { 0 }', o.x + 16, o.y + 24, {
      color: U.hexToRgba(SPAN, .8), font: '600 11px ' + U.FONT_SANS, alpha: t
    });
    return 1;
  };

  Scene3D.prototype._planeBasis = function (info) {
    var e1 = M.normalize(info.basis[0]);
    var tmp = M.sub(info.basis[1], M.scale(e1, M.dot(info.basis[1], e1)));
    var e2 = M.normalize(tmp);
    if (!e2) {
      var helper = Math.abs(e1[2]) < .9 ? [0, 0, 1] : [0, 1, 0];
      e2 = M.normalize(M.cross(e1, helper));
    }
    return [e1, e2];
  };

  Scene3D.prototype.drawPlaneSpan = function (info, t) {
    var ctx = this.ctx;
    var basis = this._planeBasis(info);
    var e1 = basis[0], e2 = basis[1];
    var E = this.camera.dist * 0.55 * (0.12 + 0.88 * t);
    var corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(function (s) {
      return [
        (s[0] * e1[0] + s[1] * e2[0]) * E,
        (s[0] * e1[1] + s[1] * e2[1]) * E,
        (s[0] * e1[2] + s[1] * e2[2]) * E
      ];
    });
    var proj = corners.map(this.project.bind(this));
    var o = this.project([0, 0, 0]);

    if (proj.every(function (p) { return p.visible; }) && o.visible) {
      ctx.save();
      var grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, Math.min(this.w, this.h) * .72);
      grad.addColorStop(0, 'rgba(0,173,181,' + (0.13 * t) + ')');
      grad.addColorStop(.6, 'rgba(0,173,181,' + (0.06 * t) + ')');
      grad.addColorStop(1, 'rgba(0,173,181,' + (0.015 * t) + ')');
      ctx.beginPath();
      ctx.moveTo(proj[0].x, proj[0].y);
      for (var i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,173,181,' + (0.2 * t) + ')';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(0,173,181,' + (0.085 * t) + ')';
      ctx.lineWidth = 1;
      var N = 6;
      for (var s = -N; s <= N; s++) {
        var k = (s / N) * E;
        var a1 = this.project([e1[0] * E + e2[0] * k, e1[1] * E + e2[1] * k, e1[2] * E + e2[2] * k]);
        var a2 = this.project([-e1[0] * E + e2[0] * k, -e1[1] * E + e2[1] * k, -e1[2] * E + e2[2] * k]);
        var b1 = this.project([e2[0] * E + e1[0] * k, e2[1] * E + e1[1] * k, e2[2] * E + e1[2] * k]);
        var b2 = this.project([-e2[0] * E + e1[0] * k, -e2[1] * E + e1[1] * k, -e2[2] * E + e1[2] * k]);
        if (a1.visible && a2.visible) {
          ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
        }
        if (b1.visible && b2.visible) {
          ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
        }
      }
      ctx.restore();
    }

    var pts = M.latticePoints([info.basis[0], info.basis[1]], { range: 8, maxNorm: E * 2.1 });
    var count = 0;
    ctx.save();
    for (var j = 0; j < pts.length; j++) {
      var q = this.project(pts[j].point);
      if (!q.visible) continue;
      count++;
      ctx.globalAlpha = t * this.depthAlpha(q.z) * .55;
      ctx.fillStyle = SPAN;
      ctx.beginPath(); ctx.arc(q.x, q.y, 1.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    if (t > .35) {
      var lp = this.project([
        (e1[0] + e2[0]) * E * 0.62,
        (e1[1] + e2[1]) * E * 0.62,
        (e1[2] + e2[2]) * E * 0.62
      ]);
      if (lp.visible) {
        U.label(ctx, 'span · 平面', lp.x + 10, lp.y - 12, {
          color: U.hexToRgba(SPAN, .92),
          font: '600 11px ' + U.FONT_SANS,
          pill: true,
          pillFill: 'rgba(30,30,32,.92)',
          pillStroke: 'rgba(0,173,181,.24)',
          pillHeight: 22,
          alpha: (t - .35) / .65
        });
      }
    }
    return count;
  };

  Scene3D.prototype.drawLineSpan = function (info, t) {
    var ctx = this.ctx;
    var d = info.direction;
    var L = this.camera.dist * 0.72;
    var a = this.project([-d[0] * L, -d[1] * L, -d[2] * L]);
    var b = this.project([d[0] * L, d[1] * L, d[2] * L]);
    var o = this.project([0, 0, 0]);
    if (!a.visible || !b.visible || !o.visible) return 0;

    var ax = o.x + (a.x - o.x) * t, ay = o.y + (a.y - o.y) * t;
    var ex = o.x + (b.x - o.x) * t, ey = o.y + (b.y - o.y) * t;
    var grad = ctx.createLinearGradient(ax, ay, ex, ey);
    grad.addColorStop(0, U.hexToRgba(SPAN, 0));
    grad.addColorStop(.2, U.hexToRgba(SPAN, .85));
    grad.addColorStop(.8, U.hexToRgba(SPAN, .85));
    grad.addColorStop(1, U.hexToRgba(SPAN, 0));

    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 10;
    ctx.globalAlpha = .13;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.globalAlpha = .22;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.lineWidth = 2.2;
    ctx.globalAlpha = .92;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.restore();

    var pts = M.latticePoints([info.basis[0]], { range: 24, maxNorm: L });
    var count = 0;
    ctx.save();
    for (var i = 0; i < pts.length; i++) {
      var q = this.project(pts[i].point);
      if (!q.visible) continue;
      count++;
      var zero = Math.abs(pts[i].coefs[0]) < 1e-9;
      ctx.globalAlpha = t * (zero ? 1 : this.depthAlpha(q.z) * .5);
      ctx.fillStyle = SPAN;
      ctx.beginPath(); ctx.arc(q.x, q.y, zero ? 3.4 : 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    U.label(ctx, 'span · 直线', ex * .78 + ax * .22, ey * .78 + ay * .22 - 18, {
      color: U.hexToRgba(SPAN, .92), font: '600 11px ' + U.FONT_SANS, align: 'center', alpha: t
    });
    return count;
  };

  Scene3D.prototype.drawSpaceSpan = function (info, t) {
    var ctx = this.ctx;
    var basis = info.basis.slice(0, 3);
    if (basis.length < 3) return 0;

    var R = 2;
    var maxNorm = this.camera.dist * 0.62;
    var origin = this.project([0, 0, 0]);
    if (origin.visible) {
      var glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, Math.max(this.w, this.h) * .72);
      glow.addColorStop(0, 'rgba(0,173,181,' + (0.11 * t) + ')');
      glow.addColorStop(.55, 'rgba(0,173,181,' + (0.045 * t) + ')');
      glow.addColorStop(1, 'rgba(0,173,181,0)');
      ctx.save();
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
    var pts = [];
    for (var i = -R; i <= R; i++) {
      for (var j = -R; j <= R; j++) {
        for (var k = -R; k <= R; k++) {
          var p = [
            i * basis[0][0] + j * basis[1][0] + k * basis[2][0],
            i * basis[0][1] + j * basis[1][1] + k * basis[2][1],
            i * basis[0][2] + j * basis[1][2] + k * basis[2][2]
          ];
          if (M.vnorm(p) <= maxNorm) pts.push({ coefs: [i, j, k], point: p });
        }
      }
    }

    // 三维格线：每个整数点向三个方向各连一格，空间被网格填满
    ctx.save();
    ctx.strokeStyle = 'rgba(0,173,181,' + (0.07 * t) + ')';
    ctx.lineWidth = 1;
    for (var a = 0; a < pts.length; a++) {
      var pa = pts[a];
      for (var d = 0; d < 3; d++) {
        if (pa.coefs[d] >= R) continue;
        var nb = pa.coefs.slice();
        nb[d] += 1;
        var q = [
          nb[0] * basis[0][0] + nb[1] * basis[1][0] + nb[2] * basis[2][0],
          nb[0] * basis[0][1] + nb[1] * basis[1][1] + nb[2] * basis[2][1],
          nb[0] * basis[0][2] + nb[1] * basis[1][2] + nb[2] * basis[2][2]
        ];
        if (M.vnorm(q) > maxNorm) continue;
        var p0 = this.project(pa.point);
        var p1 = this.project(q);
        if (!p0.visible || !p1.visible) continue;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.save();
    for (var n = 0; n < pts.length; n++) {
      var pp = this.project(pts[n].point);
      if (!pp.visible) continue;
      ctx.globalAlpha = t * this.depthAlpha(pp.z) * .48;
      ctx.fillStyle = SPAN;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    return pts.length;
  };

  /* ---------------------------------------------------------------- 向量与探针 */

  Scene3D.prototype.drawVectors = function (info) {
    var ctx = this.ctx;
    var o = this.project([0, 0, 0]);
    var vecs = this.world.vectors;
    for (var i = 0; i < vecs.length; i++) {
      var v = vecs[i];
      var p = this.project(v);
      var color = VECTOR_COLORS[i % VECTOR_COLORS.length];
      var zero = M.vnorm(v) < 1e-9;
      if (!p.visible) continue;

      if (zero) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = .9;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(o.x, o.y, 6 + i * 3, 0, Math.PI * 2); ctx.stroke();
        U.label(ctx, 'v' + M.subscript(i + 1), o.x + 14 + i * 8, o.y + 18 + i * 6, {
          color: color, font: 'italic 600 12px ' + U.FONT_MATH
        });
        ctx.restore();
        continue;
      }

      var dep = !!(info && info.increments[i] && !info.increments[i].independent);
      var alpha = this.depthAlpha(p.z);
      ctx.save();
      if (dep) {
        U.dashedSegment(ctx, o.x, o.y, p.x, p.y, color, 2, 6, 5, alpha * .6);
        U.arrowHead(ctx, o.x, o.y, p.x, p.y, 8, color, alpha * .6);
      } else {
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha * .16;
        ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.globalAlpha = alpha * .32;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.globalAlpha = alpha * .96;
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        U.arrowHead(ctx, o.x, o.y, p.x, p.y, 9.5, color, alpha * .96);
      }

      var dx = p.x - o.x, dy = p.y - o.y;
      var len = Math.hypot(dx, dy) || 1;
      var side = (i % 2 === 0 ? 1 : -1) * (14 + 10 * Math.floor(i / 2));
      U.label(ctx, 'v' + M.subscript(i + 1), p.x + dx / len * 14 - dy / len * side, p.y + dy / len * 14 + dx / len * side, {
        color: color,
        font: 'italic 600 13px ' + U.FONT_MATH,
        align: 'center',
        pill: true,
        pillFill: 'rgba(30,30,32,.92)',
        pillStroke: U.hexToRgba(color, .35),
        pillHeight: 21
      });
      ctx.restore();
    }
  };

  Scene3D.prototype.drawProbe = function () {
    if (!this.probe || !this.probe.coefs) return;
    var p = this.probePoint();
    if (!p) return;
    var ctx = this.ctx;
    var o = this.project([0, 0, 0]);
    var q = this.project(p);
    if (!q.visible) return;
    U.dashedSegment(ctx, o.x, o.y, q.x, q.y, '#f8fafc', 1.6, 4, 4, .8);
    ctx.save();
    ctx.fillStyle = '#f8fafc';
    ctx.globalAlpha = .95;
    ctx.beginPath(); ctx.arc(q.x, q.y, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(248,250,252,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    U.label(ctx, 'c·v', q.x + 13, q.y - 12, { color: '#f8fafc', font: '600 11px ' + U.FONT_SANS });
  };

  Scene3D.prototype.drawOrigin = function () {
    var ctx = this.ctx;
    var o = this.project([0, 0, 0]);
    if (!o.visible) return;
    ctx.save();
    ctx.fillStyle = '#e9e9ec';
    ctx.beginPath(); ctx.arc(o.x, o.y, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  Scene3D.prototype.drawHint = function () {
    var text = this.world.vectors.length ? '拖拽旋转 · 点击「展现张成空间」' : '还没有向量：张成只是原点';
    U.label(this.ctx, text, this.w / 2, this.h - 26, {
      color: 'rgba(233,233,236,.9)',
      font: '600 11.5px ' + U.FONT_SANS,
      align: 'center',
      pill: true,
      pillFill: 'rgba(30,30,32,.94)',
      pillStroke: 'rgba(58,58,61,.9)',
      pillHeight: 26,
      padX: 12
    });
  };

  Scene3D.prototype.drawWatermark = function (info) {
    if (!info) return;
    var text = info.rank === 0 ? 'span = { 0 }' : info.rank === 1 ? 'span = 直线' : info.rank === 2 ? 'span = 平面' : 'span = ℝ³';
    U.label(this.ctx, text, 14, this.h - 18, {
      color: 'rgba(0,173,181,.62)', font: '600 11px ' + U.FONT_SANS
    });
  };

  return Scene3D;
});
