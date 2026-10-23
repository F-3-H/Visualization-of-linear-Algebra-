/* ============================================================
 * 线性代数基础 · 共享绘图层（assets/draw.js）
 * 世界坐标（y 向上）↔ 画布坐标；网格、箭头、点、标签。
 * 五个视角共用，保证"点进任何一个模块都知道还在同一个项目里"。
 * ============================================================ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Draw = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  /* ---- 配色：从 theme.css 的 token 读一次，缓存成表 ----
   * 画布拿不到 CSS 变量（ctx.fillStyle 不认 var()），所以这里把 token 的
   * 计算值取出来。界面上仍只有 theme.css 一处定义，这里只是它的读取端。 */
  function readToken(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v || "").trim() || fallback;
    } catch (e) { return fallback; }
  }
  var C = {
    bg: readToken("--bg", "#161618"),
    panel: readToken("--panel", "#1e1e20"),
    paper: readToken("--paper", "#1b1b1d"),
    ink: readToken("--ink", "#e9e9ec"),
    soft: readToken("--ink-soft", "#a0a0a8"),
    line: readToken("--line", "#3a3a3d"),
    grid: readToken("--grid", "#2e2e31"),
    axis: readToken("--axis", "#6f6f78"),
    u: readToken("--u", "#3ddc97"),
    v: readToken("--v", "#22c7de"),
    sum: readToken("--sum", "#f0b429"),
    red: readToken("--red", "#ff6b6b"),
    purple: readToken("--purple", "#a78bfa"),
    ghost: readToken("--ghost", "#767f8c")
  };

  /* ---- 取景：画框要装得下这一站要说的事 ----
   * 有些视角要展示的对象，尺寸由读者输入决定（u、v、b、A、B 都能填任意数）。
   * 这时取景就是一个因变量：把它写成常量，等于把因变量当自变量用——读者一旦
   * 把输入推出常量所设的范围，对象就跑到画外，"读数里量出来的"与"图上看见的"
   * 就对不上了。修法不是把常量调大（那只是把破坏点往后挪），而是让取景从
   * "这一站要展示的对象集合"算出来。
   * 阶梯取整与拖动期冻结是这条做法的必要条件（见 views/02）：
   * 连续缩放会让画面抖、让鼠标底下的点自己跑。 */
  var RANGE_LADDER = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 16, 20, 30, 50, 80, 120, 200];

  /* 传入"必须看得见的点"，返回装得下它们的画框半高。
     横向画框比 range 更宽（extent() 按画布比例放宽），所以按 |x|、|y| 同时
     卡 range 是偏保守的一侧——留下的余量正好当箭头与标签的边距。 */
  function fitRange(points, opts) {
    opts = opts || {};
    var need = opts.min || 1e-6, i;
    for (i = 0; i < (points || []).length; i++) {
      var p = points[i];
      if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
      need = Math.max(need, Math.abs(p.x), Math.abs(p.y));
    }
    need *= (opts.margin || 1.15);          // 留边：对象别贴着画框
    for (i = 0; i < RANGE_LADDER.length; i++) {
      if (RANGE_LADDER[i] >= need) return RANGE_LADDER[i];
    }
    return RANGE_LADDER[RANGE_LADDER.length - 1];
  }

  /* 画框放大后网格要跟着放粗，否则糊成一片 */
  function gridStep(R) {
    return R <= 8 ? 1 : R <= 20 ? 2 : R <= 60 ? 5 : R <= 200 ? 10 : 20;
  }

  function create(canvas, opts) {
    opts = opts || {};
    var range = opts.range || 5;
    /* 边距。各视角用的是 pad；padding 为兼容旧写法保留别名。
       （此前只读 padding，视角传的 pad 被静默忽略、实际取默认 30。） */
    var pad = opts.pad != null ? opts.pad : (opts.padding == null ? 30 : opts.padding);
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = 1;

    function resize() {
      dpr = (root && root.devicePixelRatio) || 1;
      var rect = canvas.getBoundingClientRect();
      W = Math.max(200, rect.width || canvas.clientWidth || 640);
      H = Math.max(200, rect.height || canvas.clientHeight || 480);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function extent() {
      var half = range;
      var aspect = W / H;
      if (aspect >= 1) return { x0: -half * aspect, x1: half * aspect, y0: -half, y1: half };
      return { x0: -half, x1: half, y0: -half / aspect, y1: half / aspect };
    }
    /* 画框半高＝range（横向按画布比例自动放宽）。
       被观察的对象由读者输入决定时，取景必须跟着对象走：
       视角可以在画之前按内容改 range，使结论落在画内。 */
    function setRange(r) { range = r; }
    /* 画框能看见的最远处（横竖取大）。"整条线"——特征方向、塌缩线、延伸线——
       要画满画框，长度就得从取景算出来，不能写死：写死的话取景一放大，
       它就从"一整条"缩成中间一小截，看着像个孤立的短箭头。 */
    function reach() {
      var e = extent();
      return Math.max(Math.abs(e.x0), Math.abs(e.x1), Math.abs(e.y0), Math.abs(e.y1));
    }
    function sx(x) { var e = extent(); return pad + (x - e.x0) / (e.x1 - e.x0) * (W - 2 * pad); }
    function sy(y) { var e = extent(); return H - pad - (y - e.y0) / (e.y1 - e.y0) * (H - 2 * pad); }
    function wx(px) { var e = extent(); return e.x0 + (px - pad) / (W - 2 * pad) * (e.x1 - e.x0); }
    function wy(py) { var e = extent(); return e.y0 + (H - pad - py) / (H - 2 * pad) * (e.y1 - e.y0); }
    function scale() { return (W - 2 * pad) / (extent().x1 - extent().x0); }

    /* 画框固定的时候，反过来约束对象：把点夹回画框内（按画框的 mFrac 比例留边）。
       这一篇有三个视角（01/04/05）画框都不能动——图里有必须原地对读的标尺
       （特征方向线、左右半边的分界、a＝0 那条分界）。这时候"取景与对象只能
       有一个动"这条规矩就落到对象头上：拖动的手停在框边，读数里照实说明。
       上一次的教训是反过来的那一半（02 里由输入决定的一切都必须跟着画框走）；
       两次合起来才是完整的一句话：画框是关系的一个端点，两端必须协商，
       不能让一端自己跑。 */
    function clamp(p, mFrac) {
      var e = extent(), m = range * (mFrac == null ? 0.12 : mFrac);
      return { x: Math.max(e.x0 + m, Math.min(e.x1 - m, p.x)),
               y: Math.max(e.y0 + m, Math.min(e.y1 - m, p.y)) };
    }

    function grid(o) {
      o = o || {};
      var e = extent();
      var step = o.step || 1;
      ctx.lineWidth = 1;
      ctx.strokeStyle = o.gridColor || C.grid;
      ctx.beginPath();
      for (var x = Math.ceil(e.x0 / step) * step; x <= e.x1; x += step) {
        ctx.moveTo(sx(x), sy(e.y0)); ctx.lineTo(sx(x), sy(e.y1));
      }
      for (var y = Math.ceil(e.y0 / step) * step; y <= e.y1; y += step) {
        ctx.moveTo(sx(e.x0), sy(y)); ctx.lineTo(sx(e.x1), sy(y));
      }
      ctx.stroke();
      // 轴。axes:false 用于时间序列那类"原点不在画框里、两条轴都会横穿数据"的图。
      if (o.axes !== false) {
        ctx.strokeStyle = o.axisColor || C.axis;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sx(e.x0), sy(0)); ctx.lineTo(sx(e.x1), sy(0));
        ctx.moveTo(sx(0), sy(e.y0)); ctx.lineTo(sx(0), sy(e.y1));
        ctx.stroke();
      }
      // 刻度。labelAt:"edge" 把刻度数字挪到画框下沿与左沿——
      // 轴横穿数据时，数字压在曲线上谁也读不成（时间序列那站就是这个毛病）。
      if (o.labels !== false) {
        var edge = o.labelAt === "edge";
        /* axisOffset：画框平移过的时候（参数地图那站要把 l₁ 从 −1.5 摆到 4.5），
           刻度上该印的是平移之前的那个量，否则满图都是"P 之后的坐标"，
           和"横轴＝l₁"这句说明对不上。 */
        var ox = (o.axisOffset && o.axisOffset.x) || 0;
        var oy = (o.axisOffset && o.axisOffset.y) || 0;
        ctx.fillStyle = o.labelColor || C.soft;
        ctx.font = "11px " + (o.mono || "Consolas, monospace");
        if (edge) {
          ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          for (var x3 = Math.ceil(e.x0 / step) * step; x3 <= e.x1; x3 += step) {
            if (Math.abs(x3 + ox) < 1e-9) continue;
            ctx.fillText(String(+(x3 + ox).toFixed(2)), sx(x3), H - 3);
          }
          ctx.textAlign = "left"; ctx.textBaseline = "middle";
          for (var y3 = Math.ceil(e.y0 / step) * step; y3 <= e.y1; y3 += step) {
            if (Math.abs(y3 + oy) < 1e-9) continue;
            ctx.fillText(String(+(y3 + oy).toFixed(2)), 3, sy(y3));
          }
        } else {
          ctx.textAlign = "center"; ctx.textBaseline = "top";
          for (var x2 = Math.ceil(e.x0 / step) * step; x2 <= e.x1; x2 += step) {
            if (Math.abs(x2) < 1e-9) continue;
            ctx.fillText(String(+(x2 + ox).toFixed(2)), sx(x2), sy(0) + 4);
          }
          ctx.textAlign = "right"; ctx.textBaseline = "middle";
          for (var y2 = Math.ceil(e.y0 / step) * step; y2 <= e.y1; y2 += step) {
            if (Math.abs(y2) < 1e-9) continue;
            ctx.fillText(String(+(y2 + oy).toFixed(2)), sx(0) - 6, sy(y2));
          }
        }
        /* 轴名。以前这里写死了 "y" 与 "v"——那是上一个项目的记号，
           搬过来的每一站画的其实是 θ/ω、时间/角速度、l₁/l₂。留下的两个字母
           等于在别人的图上盖了个旧图章，也难怪图例得再解释一遍横轴是什么。
           现在由视角自己给名字，不给就不画。 */
        if (o.xName) {
          ctx.textAlign = "right"; ctx.textBaseline = "bottom";
          ctx.fillText(o.xName, W - 4, H - 16);
        }
        if (o.yName) {
          ctx.textAlign = "left"; ctx.textBaseline = "top";
          ctx.fillText(o.yName, sx(0) + 6, 4);
        }
      }
    }

    function arrow(p, q, o) {
      o = o || {};
      var x1 = sx(p.x), y1 = sy(p.y), x2 = sx(q.x), y2 = sy(q.y);
      var ang = Math.atan2(y2 - y1, x2 - x1);
      var len = Math.hypot(x2 - x1, y2 - y1);
      var head = o.head == null ? 9 : o.head;
      ctx.save();
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.strokeStyle = o.color || C.ink;
      ctx.fillStyle = o.color || C.ink;
      ctx.lineWidth = o.width || 2;
      if (len < 1) { ctx.restore(); return; }
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2 - Math.cos(ang) * head * 0.9, y2 - Math.sin(ang) * head * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(ang - 0.42) * head, y2 - Math.sin(ang - 0.42) * head);
      ctx.lineTo(x2 - Math.cos(ang + 0.42) * head, y2 - Math.sin(ang + 0.42) * head);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function dot(p, o) {
      o = o || {};
      ctx.save();
      ctx.fillStyle = o.color || C.ink;
      ctx.strokeStyle = o.ring || C.paper;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), o.r || 4.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    /* 空心的圈：目标点、期望位置这类"标在图上但里面要留空"的记号用它。
       里面必须留空——视角 04 的圈正好压在"实得"的叉上面，实心的会把叉盖掉。 */
    function ring(p, o) {
      o = o || {};
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), o.r || 6, 0, Math.PI * 2);
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      ctx.strokeStyle = o.color || C.ink;
      ctx.lineWidth = o.width || 2;
      ctx.stroke();
      ctx.restore();
    }

    function line(p, q, o) {
      o = o || {};
      ctx.save();
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.strokeStyle = o.color || C.ink;
      ctx.lineWidth = o.width || 1.5;
      ctx.beginPath();
      ctx.moveTo(sx(p.x), sy(p.y));
      ctx.lineTo(sx(q.x), sy(q.y));
      ctx.stroke();
      ctx.restore();
    }

    function text(p, s, o) {
      o = o || {};
      ctx.save();
      ctx.fillStyle = o.color || C.ink;
      ctx.font = (o.bold ? "700 " : "") + (o.size || 12) + "px " +
        (o.mono ? "Consolas, 'Courier New', monospace" : "'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif");
      ctx.textAlign = o.align || "left";
      ctx.textBaseline = o.baseline || "middle";
      ctx.fillText(s, sx(p.x) + (o.dx || 0), sy(p.y) + (o.dy || 0));
      ctx.restore();
    }

    function poly(points, o) {
      o = o || {};
      ctx.save();
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.beginPath();
      ctx.moveTo(sx(points[0].x), sy(points[0].y));
      for (var i = 1; i < points.length; i++) ctx.lineTo(sx(points[i].x), sy(points[i].y));
      ctx.closePath();
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.width || 2; ctx.stroke(); }
      ctx.restore();
    }

    /* 折线（不闭合）：这一篇画相流的轨迹用它。
       poly 会 closePath，轨迹用它会在终点与起点之间多出一条直线。 */
    function polyline(points, o) {
      o = o || {};
      if (!points || points.length < 2) return;
      ctx.save();
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.strokeStyle = o.color || C.ink;
      ctx.lineWidth = o.width || 1.6;
      ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(sx(points[0].x), sy(points[0].y));
      for (var i = 1; i < points.length; i++) ctx.lineTo(sx(points[i].x), sy(points[i].y));
      ctx.stroke();
      ctx.restore();
    }

    function clear() {
      ctx.save();
      ctx.fillStyle = C.paper;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    return {
      ctx: ctx, resize: resize, clear: clear, grid: grid, arrow: arrow, dot: dot, ring: ring,
      line: line, text: text, poly: poly, polyline: polyline, setRange: setRange, reach: reach,
      clamp: clamp,
      sx: sx, sy: sy, wx: wx, wy: wy, scale: scale, extent: extent,
      width: function () { return W; }, height: function () { return H; },
      range: function () { return range; }
    };
  }

  return { create: create, fitRange: fitRange, gridStep: gridStep, C: C };
});
