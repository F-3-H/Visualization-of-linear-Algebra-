/* 数学内核验收：只依赖 Node，不依赖浏览器。 */
'use strict';

const M = require('../js/span-math.js');

let passed = 0;
const failures = [];
const cases = [];

function test(name, fn) { cases.push([name, fn]); }
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((msg || '') + `\n  期望 ${e}\n  实际 ${a}`);
}
function close(actual, expected, tol, msg) {
  if (!(Math.abs(actual - expected) <= (tol == null ? 1e-9 : tol))) {
    throw new Error((msg || '') + `\n  期望 ${expected} ± ${tol}\n  实际 ${actual}`);
  }
}
function ok(value, msg) { if (!value) throw new Error(msg || '断言失败'); }

/* ---------------------------------------------------------------- 解析 */

test('parseScalar：整数、小数、负数、Unicode 负号', () => {
  eq(M.parseScalar('2'), 2);
  eq(M.parseScalar(' -2.5 '), -2.5);
  eq(M.parseScalar('−3'), -3);
  eq(M.parseScalar('.5'), 0.5);
  eq(M.parseScalar('1e-3'), 0.001);
});

test('parseScalar：分数与非法输入', () => {
  eq(M.parseScalar('3/4'), 0.75);
  eq(M.parseScalar('-1/2'), -0.5);
  eq(M.parseScalar('1/0'), null);
  eq(M.parseScalar('1/2/3'), null);
  eq(M.parseScalar('abc'), null);
  eq(M.parseScalar(''), null);
});

/* ---------------------------------------------------------------- 秩 */

test('rank：零向量、共线、平面、满秩', () => {
  eq(M.rankOf([[0, 0]]), 0);
  eq(M.rankOf([[1, 1], [2, 2]]), 1);
  eq(M.rankOf([[1, 0, 0], [0, 1, 0], [1, 1, 0]]), 2);
  eq(M.rankOf([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), 3);
  eq(M.rankOf([]), 0);
});

test('rank：数值噪声不把共线判成平面', () => {
  eq(M.rankOf([[1, 1], [1, 1 + 1e-12]]), 1);
  eq(M.rankOf([[1, 0, 1], [0, 1, 1], [1, 1, 2 + 1e-12]]), 2);
});

/* ---------------------------------------------------------------- 张成描述 */

test('2D：两个不共线向量张成整个平面', () => {
  const info = M.spanInfo([[2, 1], [-1, 2]], 2);
  eq(info.rank, 2);
  eq(info.whole, true);
  eq(info.kind, 'plane');
  eq(info.equation.type, 'whole2');
  close(info.measure, 5, 1e-9);
});

test('2D：共线向量张成直线，方程 x − 2y = 0', () => {
  const info = M.spanInfo([[2, 1], [4, 2]], 2);
  eq(info.rank, 1);
  eq(info.count, 2);
  eq(info.kind, 'line');
  eq(info.equation.text, 'x − 2y = 0');
  eq(info.increments[1].independent, false);
  eq(info.increments[1].terms, [{ index: 0, coef: 2 }]);
});

test('2D：零向量不提供方向', () => {
  const info = M.spanInfo([[0, 0]], 2);
  eq(info.rank, 0);
  eq(info.kind, 'point');
  eq(info.equation.text, '{ (0, 0) }');
  eq(info.increments[0].zero, true);
});

test('3D：一张平面 z = 0', () => {
  const info = M.spanInfo([[1, 0, 0], [0, 1, 0]], 3);
  eq(info.rank, 2);
  eq(info.kind, 'plane');
  eq(info.equation.text, 'z = 0');
  eq(info.equation.normal, [0, 0, 1]);
  close(info.measure, 1, 1e-9);
});

test('3D：默认示例是平面，第三个向量是前两个的平均', () => {
  const vectors = [[2, 0, 1], [0, 2, 1], [1, 1, 1]];
  const info = M.spanInfo(vectors, 3);
  eq(info.rank, 2);
  eq(info.equation.text, 'x + y − 2z = 0');
  eq(info.increments[2].independent, false);
  eq(info.increments[2].terms, [{ index: 0, coef: 0.5 }, { index: 1, coef: 0.5 }]);
});

test('3D：满秩时张成整个空间，行列式给出体积', () => {
  const info = M.spanInfo([[2, 0, 1], [0, 2, 1], [1, 1, 2]], 3);
  eq(info.rank, 3);
  eq(info.whole, true);
  eq(info.equation.type, 'whole3');
  close(info.measure, 4, 1e-9);
});

test('3D：共线时给出参数方程', () => {
  const info = M.spanInfo([[1, 2, 3], [2, 4, 6]], 3);
  eq(info.rank, 1);
  eq(info.equation.type, 'param3');
  ok(info.equation.text.indexOf('t · (1, 2, 3)') >= 0, info.equation.text);
});

/* ---------------------------------------------------------------- 线性组合 */

test('solveCombination：有解、无解、零解', () => {
  const basis = [[2, 0, 1], [0, 2, 1]];
  const c = M.solveCombination([2, 2, 2], basis);
  close(c[0], 1, 1e-9); close(c[1], 1, 1e-9);
  eq(M.solveCombination([1, 0, 0], basis), null);
  const z = M.solveCombination([0, 0, 0], basis);
  eq(z, [0, 0]);
});

test('relationText：依赖向量写成前向量的组合', () => {
  eq(M.relationText(2, [{ index: 0, coef: 0.5 }, { index: 1, coef: 0.5 }]), 'v₃ = 0.5v₁ + 0.5v₂');
  eq(M.relationText(1, [{ index: 0, coef: -2 }]), 'v₂ = −2v₁');
  eq(M.relationText(0, []), 'v₁ = 0');
});

/* ---------------------------------------------------------------- 点阵 */

test('latticePoints：一维 25 点、二维 169 点、三维 125 点', () => {
  eq(M.latticePoints([[1, 0]], { range: 12 }).length, 25);
  eq(M.latticePoints([[1, 0], [0, 1]], { range: 6 }).length, 169);
  eq(M.latticePoints([[1, 0, 0], [0, 1, 0], [0, 0, 1]], { range: 6 }).length, 125);
});

test('latticePoints：点确实在张成空间里', () => {
  const basis = [[2, 0, 1], [0, 2, 1]];
  const pts = M.latticePoints(basis, { range: 4 });
  for (const p of pts) {
    // 平面方程 x + y − 2z = 0
    close(p.point[0] + p.point[1] - 2 * p.point[2], 0, 1e-9);
  }
});

/* ---------------------------------------------------------------- 文本 */

test('normalEquation：符号与系数 1 的省略', () => {
  eq(M.normalEquation([1, -2], ['x', 'y']), 'x − 2y = 0');
  eq(M.normalEquation([-1, 0, 2], ['x', 'y', 'z']), '−x + 2z = 0');
  eq(M.normalEquation([0, 1, 0], ['x', 'y', 'z']), 'y = 0');
});

test('prettyNormal：整数化、约分、首项为正', () => {
  eq(M.prettyNormal([-0.5, -0.5, 1]), [1, 1, -2]);
  eq(M.prettyNormal([0.4472135955, -0.894427191]), [1, -2]);
  eq(M.prettyNormal([2, 4]), [1, 2]);
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

console.log(`\n数学内核：${passed}/${cases.length} 通过`);
if (failures.length) {
  console.error(`失败 ${failures.length} 项`);
  process.exit(1);
}
