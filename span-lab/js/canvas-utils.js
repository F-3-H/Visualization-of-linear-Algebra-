/* =========================================================================
 * canvas-utils.js — 两个渲染器共用的小工具（不依赖 DOM）
 * ========================================================================= */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.CanvasUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FONT_SANS = '"Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
  var FONT_MATH = '"Segoe UI", "Microsoft YaHei", sans-serif';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function hexToRgba(hex, alpha) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function niceStep(raw) {
    var exp = Math.floor(Math.log10(Math.max(raw, 1e-12)));
    var base = Math.pow(10, exp);
    var f = raw / base;
    var m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return m * base;
  }

  function easeOutCubic(t) {
    t = clamp(t, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function fmtTick(v, step) {
    if (Math.abs(v) < step * 1e-6) return '0';
    var decimals = Math.max(0, -Math.floor(Math.log10(step)) + (step < 1 ? 0 : 0));
    var s = v.toFixed(Math.min(4, decimals));
    return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * 带描边光晕的文字；opts: {font, align, baseline, halo, haloWidth, alpha, pill, pillFill, pillStroke, padX, padY, color}
   */
  function label(ctx, text, x, y, opts) {
    opts = opts || {};
    var font = opts.font || ('600 12px ' + FONT_SANS);
    ctx.save();
    ctx.font = font;
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'middle';
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;

    if (opts.pill) {
      var m = ctx.measureText(text);
      var padX = opts.padX == null ? 8 : opts.padX;
      var padY = opts.padY == null ? 5 : opts.padY;
      var w = m.width + padX * 2;
      var h = (opts.pillHeight || 22);
      var left = x;
      if (ctx.textAlign === 'center') left = x - w / 2;
      else if (ctx.textAlign === 'right') left = x - w;
      roundRect(ctx, left, y - h / 2, w, h, 6);
      ctx.fillStyle = opts.pillFill || 'rgba(10,16,23,.78)';
      ctx.fill();
      if (opts.pillStroke) {
        ctx.strokeStyle = opts.pillStroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    if (opts.halo !== false) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = opts.haloWidth == null ? 3.5 : opts.haloWidth;
      ctx.strokeStyle = opts.halo || 'rgba(22,22,24,.94)';
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = opts.color || '#e8f1fa';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /** 屏幕空间的实心箭头（箭头尖在 x1,y1）。 */
  function arrowHead(ctx, x0, y0, x1, y1, size, color, alpha) {
    var ang = Math.atan2(y1 - y0, x1 - x0);
    var s = size == null ? 8 : size;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - s * Math.cos(ang - 0.42), y1 - s * Math.sin(ang - 0.42));
    ctx.lineTo(x1 - s * 0.62 * Math.cos(ang), y1 - s * 0.62 * Math.sin(ang));
    ctx.lineTo(x1 - s * Math.cos(ang + 0.42), y1 - s * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function dashedSegment(ctx, x0, y0, x1, y1, color, width, dash, gap, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width == null ? 1.5 : width;
    ctx.setLineDash([dash == null ? 5 : dash, gap == null ? 5 : gap]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  return {
    FONT_SANS: FONT_SANS,
    FONT_MATH: FONT_MATH,
    clamp: clamp,
    hexToRgba: hexToRgba,
    niceStep: niceStep,
    easeOutCubic: easeOutCubic,
    fmtTick: fmtTick,
    roundRect: roundRect,
    label: label,
    arrowHead: arrowHead,
    dashedSegment: dashedSegment
  };
});
