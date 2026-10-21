/* 渲染器验收：用"记录型 2D 上下文"在 Node 里跑完整渲染，不需要浏览器。 */
'use strict';

const M = require('../js/span-math.js');
const Scene2D = require('../js/scene2d.js');
const Scene3D = require('../js/scene3d.js');

let passed = 0;
const failures = [];
const cases = [];
function test(name, fn) { cases.push([name, fn]); }
function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ` 期望 ${JSON.stringify(b)} 实际 ${JSON.stringify(a)}`);
}
function close(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= (tol == null ? 1e-6 : tol))) throw new Error((msg || '') + ` 期望 ${b} ± ${tol}，实际 ${a}`);
}

/* ---------------------------------------------------------------- 假画布 */

function makeCtx() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const methods = [
    'setTransform', 'clearRect', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo',
    'stroke', 'fill', 'arc', 'arcTo', 'closePath', 'fillRect', 'fillText', 'strokeText',
    'setLineDash', 'rect', 'quadraticCurveTo', 'bezierCurveTo', 'translate', 'rotate', 'scale'
  ];
  const ctx = {
    calls,
    measureText(text) { return { width: String(text).length * 7 }; },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    createPattern() { return null; }
  };
  for (const name of methods) ctx[name] = (...args) => { calls.push({ name, args }); };
  return ctx;
}

function makeCanvas(w, h) {
  const ctx = makeCtx();
  return {
    width: 0,
    height: 0,
    clientWidth: w,
    clientHeight: h,
    style: {},
    parentElement: null,
    getContext() { return ctx; },
    addEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: w, height: h }; },
    _ctx: ctx
  };
}

/* ---------------------------------------------------------------- 二维 */

test('2D：世界坐标 → 屏幕坐标', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene2D(c, { autoResize: false, animate: false });
  s.camera.x = 0; s.camera.y = 0; s.camera.scale = 100;
  const p = s.worldToScreen(1, 1);
  close(p.x, 550, 1e-9); close(p.y, 160, 1e-9);
  const q = s.screenToWorld(550, 160);
  close(q.x, 1, 1e-9); close(q.y, 1, 1e-9);
});

test('2D：缩放锚点保持光标下的世界点不动', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene2D(c, { autoResize: false, animate: false });
  s.camera.scale = 80;
  const before = s.screenToWorld(620, 180);
  s.zoomAt(620, 180, 2.3);
  const after = s.screenToWorld(620, 180);
  close(after.x, before.x, 1e-9); close(after.y, before.y, 1e-9);
});

test('2D：共线向量 → 只画直线、不画平面', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene2D(c, { autoResize: false, animate: false });
  const vectors = [[2, 1], [4, 2]];
  const info = M.spanInfo(vectors, 2);
  s.setWorld({ vectors, info, revealed: true });
  s.revealT = 1;
  s.render();
  eq(s.stats.rank, 1);
  eq(s.stats.line, true);
  eq(s.stats.plane, false);
  eq(s.stats.arrows, 2);
  ok(s.stats.lattice > 10, '整数组合点阵应有足够多的点');
});

test('2D：不共线向量 → 画满平面', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene2D(c, { autoResize: false, animate: false });
  const vectors = [[2, 1], [-1, 2]];
  const info = M.spanInfo(vectors, 2);
  s.setWorld({ vectors, info, revealed: true });
  s.revealT = 1;
  s.render();
  eq(s.stats.rank, 2);
  eq(s.stats.plane, true);
  eq(s.stats.line, false);
  ok(s.stats.lattice > 100, '平面点阵应足够密');
});

test('2D：零向量 → 原点', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene2D(c, { autoResize: false, animate: false });
  const vectors = [[0, 0]];
  const info = M.spanInfo(vectors, 2);
  s.setWorld({ vectors, info, revealed: true });
  s.revealT = 1;
  s.render();
  eq(s.stats.rank, 0);
  eq(s.stats.plane, false);
  eq(s.stats.line, false);
});

test('2D：用户调整视角后，更新数据不重置视角', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene2D(c, { autoResize: false, animate: false });
  s.camera.userAdjusted = true;
  s.camera.scale = 123;
  s.camera.x = 1.5;
  s.setWorld({ vectors: [[5, 5]], info: M.spanInfo([[5, 5]], 2), revealed: true });
  eq(s.camera.scale, 123);
  close(s.camera.x, 1.5, 1e-12);
});

test('2D：未展现时不绘制张成层', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene2D(c, { autoResize: false, animate: false });
  const vectors = [[2, 1], [-1, 2]];
  s.setWorld({ vectors, info: M.spanInfo(vectors, 2), revealed: false });
  s.render();
  eq(s.stats.revealed, false);
  eq(s.stats.plane, false);
});

/* ---------------------------------------------------------------- 三维 */

test('3D：原点投影到画布中心', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene3D(c, { autoResize: false, animate: false });
  s.resetView();
  const p = s.project([0, 0, 0]);
  ok(p.visible, '原点应可见');
  close(p.x, 450, 1e-6); close(p.y, 260, 1e-6);
});

test('3D：z 轴向上，x 轴在屏幕右侧', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene3D(c, { autoResize: false, animate: false });
  s.resetView();
  const z = s.project([0, 0, 1]);
  const x = s.project([1, 0, 0]);
  const y = s.project([0, 1, 0]);
  ok(z.visible && x.visible && y.visible, '三个轴端点都应可见');
  ok(z.y < 260, 'z 轴应朝屏幕上方');
  ok(x.x > 450, 'x 轴应朝屏幕右侧');
  ok(y.x < 450, 'y 轴应朝屏幕左侧');
});

test('3D：平面 → plane 标记 + 点阵；满秩 → space 标记', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene3D(c, { autoResize: false, animate: false });
  const vectors = [[2, 0, 1], [0, 2, 1], [1, 1, 1]];
  s.setWorld({ vectors, info: M.spanInfo(vectors, 3), revealed: true });
  s.revealT = 1;
  s.render();
  eq(s.stats.rank, 2);
  eq(s.stats.plane, true);
  eq(s.stats.space, false);
  ok(s.stats.lattice > 30, '平面点阵数量');

  const full = [[2, 0, 1], [0, 2, 1], [1, 1, 2]];
  s.setWorld({ vectors: full, info: M.spanInfo(full, 3), revealed: true });
  s.revealT = 1;
  s.render();
  eq(s.stats.rank, 3);
  eq(s.stats.plane, false);
  eq(s.stats.space, true);
  ok(s.stats.lattice > 20, '空间点阵数量');
});

test('3D：直线与零空间不崩溃', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene3D(c, { autoResize: false, animate: false });

  const line = [[1, 2, 3], [2, 4, 6]];
  s.setWorld({ vectors: line, info: M.spanInfo(line, 3), revealed: true });
  s.revealT = 1;
  s.render();
  eq(s.stats.rank, 1);
  ok(s.stats.lattice > 5, '直线点阵');

  const zero = [[0, 0, 0]];
  s.setWorld({ vectors: zero, info: M.spanInfo(zero, 3), revealed: true });
  s.revealT = 1;
  s.render();
  eq(s.stats.rank, 0);
});

test('3D：用户视角不会被数据更新重置', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene3D(c, { autoResize: false, animate: false });
  s.camera.userAdjusted = true;
  s.camera.yaw = 1.1;
  s.camera.pitch = -0.2;
  s.camera.dist = 9;
  s.setWorld({ vectors: [[3, 3, 3]], info: M.spanInfo([[3, 3, 3]], 3), revealed: true });
  close(s.camera.yaw, 1.1, 1e-12);
  close(s.camera.pitch, -0.2, 1e-12);
  close(s.camera.dist, 9, 1e-12);
});

test('3D：未展现时不绘制张成层', () => {
  const c = makeCanvas(900, 520);
  const s = new Scene3D(c, { autoResize: false, animate: false });
  const vectors = [[2, 0, 1], [0, 2, 1]];
  s.setWorld({ vectors, info: M.spanInfo(vectors, 3), revealed: false });
  s.render();
  eq(s.stats.revealed, false);
  eq(s.stats.plane, false);
});

/* ---------------------------------------------------------------- 运行 */

for (const [name, fn] of cases) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message.split('\n').join('\n    ')}`);
  }
}
console.log(`\n渲染器：${passed}/${cases.length} 通过`);
if (failures.length) process.exit(1);
