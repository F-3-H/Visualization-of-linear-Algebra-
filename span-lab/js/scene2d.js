/* =========================================================================
 * scene2d.js — 二维张成空间渲染器（Canvas 2D，无外部依赖）
 * ========================================================================= */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./span-math.js'), require('./canvas-utils.js'));
  } else {
    global.Scene2D = factory(global.SpanMath, global.CanvasUtils);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, U) {
  'use strict';

  var SPAN = '#00adb5';
  var VECTOR_COLORS = ['#00adb5', '#ff9f43', '#e056a0', '#4dabf7', '#b197fc', '#ff6b6b', '#51cf66', '#f7b731'];

  function Scene2D(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = Object.assign({ autoResize: true, animate: true }, opts || {});
    this.w = 960;
    this.h = 600;
    this.dpr = 1;
    this.camera = { x: 0, y: 0, scale: 80, userAdjusted: false };
    this.world = { vectors: [], revealed: false, info: null };
    this.probe = null;
    this.revealT = 1;
    this._pending = false;
    this._anim = null;
    this._drag = null;
    this.stats = { rank: 0, arrows: 0, lattice: 0, plane: false, line: false, revealed: false };

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

  Scene2D.prototype._bind = function () {
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
      self.camera.x -= dx / self.camera.scale;
      self.camera.y += dy / self.camera.scale;
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
      var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
      var sx = e.clientX - rect.left;
      var sy = e.clientY - rect.top;
      self.zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0014));
    }, { passive: false });
    canvas.style.cursor = 'grab';
  };

  Scene2D.prototype.resize = function (w, h, dpr) {
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

  Scene2D.prototype.setWorld = function (world) {
    this.world = {
      vectors: (world.vectors || []).map(function (v) { return v.slice(); }),
      revealed: !!world.revealed,
      info: world.info || null
    };
    if (!this.camera.userAdjusted) this.fit();
    this.requestRender();
  };

  Scene2D.prototype.setProbe = function (probe) {
    this.probe = probe;
    this.requestRender();
  };

  Scene2D.prototype.fit = function () {
    var maxNorm = 0;
    var vecs = this.world.vectors;
    for (var i = 0; i < vecs.length; i++) maxNorm = Math.max(maxNorm, M.vnorm(vecs[i]));
    if (this.probe && this.probe.coefs && this.world.vectors.length) {
      var p = this.probePoint();
      if (p) maxNorm = Math.max(maxNorm, M.vnorm(p));
    }
    var target = Math.max(1.8, maxNorm * 1.12);
    this.camera.x = 0;
    this.camera.y = 0;
    this.camera.scale = U.clamp(Math.min(this.w, this.h) * 0.38 / target, 6, 5000);
  };

  Scene2D.prototype.resetView = function () {
    this.camera.userAdjusted = false;
    this.fit();
    this.render();
  };

  Scene2D.prototype.probePoint = function () {
    if (!this.probe || !this.probe.coefs) return null;
    var out = [0, 0];
    for (var i = 0; i < this.world.vectors.length && i < this.probe.coefs.length; i++) {
      out[0] += this.probe.coefs[i] * this.world.vectors[i][0];
      out[1] += this.probe.coefs[i] * this.world.vectors[i][1];
    }
    return out;
  };

  Scene2D.prototype.worldToScreen = function (x, y) {
    return {
      x: this.w / 2 + (x - this.camera.x) * this.camera.scale,
      y: this.h / 2 - (y - this.camera.y) * this.camera.scale
    };
  };

  Scene2D.prototype.screenToWorld = function (sx, sy) {
    return {
      x: this.camera.x + (sx - this.w / 2) / this.camera.scale,
      y: this.camera.y - (sy - this.h / 2) / this.camera.scale
    };
  };

  Scene2D.prototype.zoomAt = function (sx, sy, factor) {
    var before = this.screenToWorld(sx, sy);
    this.camera.scale = U.clamp(this.camera.scale * factor, 6, 5000);
    var after = this.screenToWorld(sx, sy);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
    this.camera.userAdjusted = true;
    this.requestRender();
  };

  Scene2D.prototype.animateReveal = function (duration) {
    var self = this;
    duration = duration || 760;
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

  Scene2D.prototype.requestRender = function () {
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

  Scene2D.prototype.clear = function () {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  Scene2D.prototype.render = function () {
    if (!this.ctx) return;
    this.clear();

    this.drawGrid();

    var info = this.world.info;
    var revealed = this.world.revealed && info;
    var t = revealed ? this.revealT : 0;
    var latticeCount = 0;

    if (revealed) latticeCount = this.drawSpan(info, t);

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
      line: !!revealed && info.rank === 1,
      revealed: !!revealed
    };
  };

  /* ---------------------------------------------------------------- 网格与坐标轴 */

  Scene2D.prototype.drawGrid = function () {
    var ctx = this.ctx;
    var w = this.w, h = this.h;
    var scale = this.camera.scale;
    var ox = w / 2 + (0 - this.camera.x) * scale;
    var oy = h / 2 - (0 - this.camera.y) * scale;

    var step = U.niceStep(64 / scale);
    var xMin = this.camera.x - (w / 2) / scale;
    var xMax = this.camera.x + (w / 2) / scale;
    var yMin = this.camera.y - (h / 2) / scale;
    var yMax = this.camera.y + (h / 2) / scale;

    ctx.save();
    for (var i = Math.ceil(xMin / step); i * step <= xMax; i++) {
      var sx = w / 2 + (i * step - this.camera.x) * scale;
      var major = i % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(160,160,168,.105)' : 'rgba(160,160,168,.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (var j = Math.ceil(yMin / step); j * step <= yMax; j++) {
      var sy = h / 2 - (j * step - this.camera.y) * scale;
      var majorY = j % 5 === 0;
      ctx.strokeStyle = majorY ? 'rgba(160,160,168,.105)' : 'rgba(160,160,168,.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(160,160,168,.46)';
    ctx.lineWidth = 1.2;
    if (oy >= -30 && oy <= h + 30) {
      ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(w, oy); ctx.stroke();
      U.arrowHead(ctx, w - 20, oy, w - 2, oy, 8, 'rgba(160,160,168,.55)', 1);
      U.label(ctx, 'x', w - 12, oy - 16, { color: 'rgba(233,233,236,.72)', font: 'italic 600 13px ' + U.FONT_MATH, align: 'right' });
    }
    if (ox >= -30 && ox <= w + 30) {
      ctx.beginPath(); ctx.moveTo(ox, h); ctx.lineTo(ox, 0); ctx.stroke();
      U.arrowHead(ctx, ox, h - 20, ox, 2, 8, 'rgba(160,160,168,.55)', 1);
      U.label(ctx, 'y', ox + 14, 14, { color: 'rgba(233,233,236,.72)', font: 'italic 600 13px ' + U.FONT_MATH });
    }

    ctx.font = '10px ' + U.FONT_SANS;
    ctx.fillStyle = 'rgba(160,160,168,.46)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (oy >= -8 && oy <= h + 8) {
      for (var k = Math.ceil(xMin / step); k * step <= xMax; k++) {
        if (k === 0) continue;
        var tx = w / 2 + (k * step - this.camera.x) * scale;
        ctx.fillText(U.fmtTick(k * step, step), tx, U.clamp(oy + 6, 2, h - 14));
      }
    }
    if (ox >= -8 && ox <= w + 8) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (var m = Math.ceil(yMin / step); m * step <= yMax; m++) {
        if (m === 0) continue;
        var ty = h / 2 - (m * step - this.camera.y) * scale;
        ctx.fillText(U.fmtTick(m * step, step), U.clamp(ox - 6, 24, w - 4), ty);
      }
    }
    ctx.restore();
  };

  /* ---------------------------------------------------------------- 张成几何 */

  Scene2D.prototype.drawSpan = function (info, t) {
    if (info.rank === 0) return this.drawPointSpan(t);
    if (info.rank === 1) return this.drawLineSpan(info, t);
    return this.drawPlaneSpan(info, t);
  };

  Scene2D.prototype.drawPointSpan = function (t) {
    var ctx = this.ctx;
    var o = this.worldToScreen(0, 0);
    ctx.save();
    ctx.globalAlpha = t;
    ctx.strokeStyle = U.hexToRgba(SPAN, .8);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(o.x, o.y, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = U.hexToRgba(SPAN, .9);
    ctx.beginPath(); ctx.arc(o.x, o.y, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = t * .9;
    ctx.fillStyle = 'rgba(0,173,181,.8)';
    ctx.font = '600 11px ' + U.FONT_SANS;
    ctx.fillText('span = { 0 }', o.x + 18, o.y + 26);
    ctx.restore();
    return 1;
  };

  Scene2D.prototype.drawLineSpan = function (info, t) {
    var ctx = this.ctx;
    var d = info.direction;
    var extent = Math.max(this.w, this.h) / this.camera.scale * 1.4;
    var a = this.worldToScreen(-d[0] * extent, -d[1] * extent);
    var b = this.worldToScreen(d[0] * extent, d[1] * extent);
    var o = this.worldToScreen(0, 0);
    var ax = o.x + (a.x - o.x) * t;
    var ay = o.y + (a.y - o.y) * t;
    var ex = o.x + (b.x - o.x) * t;
    var ey = o.y + (b.y - o.y) * t;

    var grad = ctx.createLinearGradient(ax, ay, ex, ey);
    grad.addColorStop(0, U.hexToRgba(SPAN, 0));
    grad.addColorStop(0.18, U.hexToRgba(SPAN, 0.85));
    grad.addColorStop(0.82, U.hexToRgba(SPAN, 0.85));
    grad.addColorStop(1, U.hexToRgba(SPAN, 0));

    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 12;
    ctx.globalAlpha = .14;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.lineWidth = 5;
    ctx.globalAlpha = .22;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.lineWidth = 2.2;
    ctx.globalAlpha = .95;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.restore();

    var L = extent * 0.85;
    var pts = M.latticePoints([info.basis[0]], { range: 24, maxNorm: L });
    var ldx = b.x - a.x, ldy = b.y - a.y;
    var llen = Math.hypot(ldx, ldy) || 1;
    var lnx = -ldy / llen, lny = ldx / llen;
    for (var i = 0; i < pts.length; i++) {
      var p = this.worldToScreen(pts[i].point[0], pts[i].point[1]);
      if (p.x < -30 || p.x > this.w + 30 || p.y < -30 || p.y > this.h + 30) continue;
      var isZero = Math.abs(pts[i].coefs[0]) < 1e-9;
      ctx.save();
      ctx.globalAlpha = t * (isZero ? 1 : .55);
      ctx.fillStyle = SPAN;
      ctx.beginPath(); ctx.arc(p.x, p.y, isZero ? 4 : 2.1, 0, Math.PI * 2); ctx.fill();
      if (isZero) {
        ctx.strokeStyle = 'rgba(0,173,181,.55)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(0,173,181,.65)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x - lnx * 4, p.y - lny * 4);
        ctx.lineTo(p.x + lnx * 4, p.y + lny * 4);
        ctx.stroke();
      }
      ctx.restore();
    }

    var lx = a.x + (b.x - a.x) * .78;
    var ly = a.y + (b.y - a.y) * .78;
    var nx = -(b.y - a.y), ny = b.x - a.x;
    var nl = Math.hypot(nx, ny) || 1;
    U.label(ctx, 'span · 直线', lx + nx / nl * 22, ly + ny / nl * 22, {
      color: U.hexToRgba(SPAN, .95), font: '600 11px ' + U.FONT_SANS, align: 'center', alpha: t
    });
    return pts.length;
  };

  Scene2D.prototype.drawPlaneSpan = function (info, t) {
    var ctx = this.ctx;
    var o = this.worldToScreen(0, 0);
    var radius = Math.max(this.w, this.h) * .8;

    ctx.save();
    ctx.globalAlpha = t;
    var fill = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, radius);
    fill.addColorStop(0, 'rgba(0,173,181,.22)');
    fill.addColorStop(.55, 'rgba(0,173,181,.12)');
    fill.addColorStop(1, 'rgba(0,173,181,.03)');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, this.w, this.h);

    var u = info.basis[0], v = info.basis[1];
    var L = Math.hypot(this.w, this.h) / this.camera.scale * .62;
    var range = 14;
    var pts = M.latticePoints([u, v], { range: range, maxNorm: L * 2.8 });
    ctx.strokeStyle = 'rgba(0,173,181,.09)';
    ctx.lineWidth = 1;
    for (var i = 0; i < pts.length; i++) {
      var p = this.worldToScreen(pts[i].point[0], pts[i].point[1]);
      if (p.x < -40 || p.x > this.w + 40 || p.y < -40 || p.y > this.h + 40) continue;
      var co = pts[i].coefs;
      if (co[0] < range) {
        var p1 = this.worldToScreen(pts[i].point[0] + u[0], pts[i].point[1] + u[1]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      }
      if (co[1] < range) {
        var p2 = this.worldToScreen(pts[i].point[0] + v[0], pts[i].point[1] + v[1]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(0,173,181,.28)';
    for (var j = 0; j < pts.length; j++) {
      var q = this.worldToScreen(pts[j].point[0], pts[j].point[1]);
      if (q.x < 0 || q.x > this.w || q.y < 0 || q.y > this.h) continue;
      ctx.beginPath(); ctx.arc(q.x, q.y, 1.35, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return pts.length;
  };

  /* ---------------------------------------------------------------- 向量 */

  Scene2D.prototype.drawVectors = function (info) {
    var ctx = this.ctx;
    var o = this.worldToScreen(0, 0);
    var vecs = this.world.vectors;
    for (var i = 0; i < vecs.length; i++) {
      var v = vecs[i];
      var p = this.worldToScreen(v[0], v[1]);
      var color = VECTOR_COLORS[i % VECTOR_COLORS.length];
      var zero = M.vnorm(v) < 1e-9;
      var dep = !!(info && info.increments[i] && !info.increments[i].independent);

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

      var dx = p.x - o.x, dy = p.y - o.y;
      var len = Math.hypot(dx, dy);
      if (len < 1) continue;

      ctx.save();
      if (dep) {
        U.dashedSegment(ctx, o.x, o.y, p.x, p.y, color, 2, 6, 5, .55);
        U.arrowHead(ctx, o.x, o.y, p.x, p.y, 8, color, .55);
      } else {
        ctx.strokeStyle = color;
        ctx.globalAlpha = .16;
        ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.globalAlpha = .32;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.globalAlpha = .96;
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        U.arrowHead(ctx, o.x, o.y, p.x, p.y, 9.5, color, .96);
      }

      var ux = dx / len, uy = dy / len;
      var side = (i % 2 === 0 ? 1 : -1) * (14 + 10 * Math.floor(i / 2));
      U.label(ctx, 'v' + M.subscript(i + 1), p.x + ux * 14 - uy * side, p.y + uy * 14 + ux * side, {
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

  Scene2D.prototype.drawProbe = function () {
    if (!this.probe || !this.probe.coefs) return;
    var p = this.probePoint();
    if (!p) return;
    var ctx = this.ctx;
    var o = this.worldToScreen(0, 0);
    var q = this.worldToScreen(p[0], p[1]);
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

  Scene2D.prototype.drawOrigin = function () {
    var ctx = this.ctx;
    var o = this.worldToScreen(0, 0);
    ctx.save();
    ctx.fillStyle = '#e9e9ec';
    ctx.beginPath(); ctx.arc(o.x, o.y, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  Scene2D.prototype.drawHint = function () {
    var text = this.world.vectors.length ? '点击「展现张成空间」' : '还没有向量：张成只是原点';
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

  Scene2D.prototype.drawWatermark = function (info) {
    if (!info) return;
    var text = info.rank === 0 ? 'span = { 0 }' : info.rank === 1 ? 'span = 直线' : 'span = ℝ²';
    U.label(this.ctx, text, 14, this.h - 18, {
      color: 'rgba(0,173,181,.62)', font: '600 11px ' + U.FONT_SANS
    });
  };

  return Scene2D;
});
