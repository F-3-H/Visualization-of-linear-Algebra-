/* =========================================================================
 * selftest.js — 浏览器内验收（?selftest=1）与演示态（?demo=1）
 * 这是交付物的一部分：它证明界面在真实 DOM / Canvas 上能跑通，
 * 而不仅是 Node 里的数学内核通过。
 * ========================================================================= */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);

  function run() {
    var app = window.__SPANLAB__;
    if (!app) {
      report(['FAIL: __SPANLAB__ 未初始化（app.js 未执行完成）'], false);
      return;
    }

    if (params.has('selftest')) {
      var results = [];

      function check(name, fn) {
        try {
          fn();
          results.push({ name: name, ok: true });
        } catch (err) {
          results.push({ name: name, ok: false, message: err.message || String(err) });
        }
      }
      function ok(value, message) {
        if (!value) throw new Error(message || '断言失败');
      }
      function eq(actual, expected, message) {
        if (String(actual) !== String(expected)) {
          throw new Error((message || '') + ' 期望 ' + expected + '，实际 ' + actual);
        }
      }

      check('两个世界都已建立，维度分别为 2 / 3', function () {
        ok(app.panels[2] && app.panels[3], '缺少世界面板');
        eq(app.panels[2].dim, 2);
        eq(app.panels[3].dim, 3);
      });

      check('初始状态：默认向量已填入、尚未展现', function () {
        eq(app.panels[2].state.vectors.length, 3);
        eq(app.panels[3].state.vectors.length, 3);
        eq(app.panels[2].state.revealed, false);
        eq(app.panels[3].state.revealed, false);
        eq(app.panels[2].root.querySelector('.verdict-title').textContent, '等待展现');
      });

      check('二维：展现后张成整个平面，秩为 2', function () {
        app.panels[2].commit();
        eq(app.panels[2].state.revealed, true);
        eq(app.panels[2].state.info.rank, 2);
        eq(app.panels[2].root.querySelector('.verdict-title').textContent, '整个平面');
        eq(app.panels[2].root.querySelector('.verdict-badge b').textContent, '2');
        eq(app.panels[2].scene.stats.plane, true);
        ok(app.panels[2].scene.stats.lattice > 50, '平面点阵数量不足');
      });

      check('三维：默认示例张成一张平面，第三个向量标为"相关"', function () {
        app.panels[3].commit();
        eq(app.panels[3].state.revealed, true);
        eq(app.panels[3].state.info.rank, 2);
        eq(app.panels[3].root.querySelector('.verdict-title').textContent, '一张过原点的平面');
        var state = app.panels[3].root.querySelector('[data-state-for="2"]');
        eq(state.dataset.kind, 'dep');
        eq(state.textContent, '相关');
        eq(app.panels[3].scene.stats.plane, true);
      });

      check('二维预设"共线"：降为 1 维直线', function () {
        app.panels[2].root.querySelector('[data-preset="line"]').click();
        eq(app.panels[2].state.info.rank, 1);
        eq(app.panels[2].root.querySelector('.verdict-title').textContent, '一条过原点的直线');
        eq(app.panels[2].root.querySelector('.verdict-badge b').textContent, '1');
        eq(app.panels[2].scene.stats.line, true);
        eq(app.panels[2].scene.stats.plane, false);
      });

      check('二维预设"零向量"：降为 0 维原点', function () {
        app.panels[2].root.querySelector('[data-preset="zero"]').click();
        eq(app.panels[2].state.info.rank, 0);
        eq(app.panels[2].root.querySelector('.verdict-title').textContent, '原点');
        eq(app.panels[2].root.querySelector('.verdict-badge b').textContent, '0');
      });

      check('增加向量：行数、计数同步增长', function () {
        var before = app.panels[2].state.vectors.length;
        app.panels[2].addVector();
        eq(app.panels[2].state.vectors.length, before + 1);
        eq(app.panels[2].root.querySelectorAll('.vec-row').length, before + 1);
        ok(app.panels[2].root.querySelector('.count').textContent.indexOf(String(before + 1)) >= 0, '计数未更新');
      });

      check('坐标支持分数并即时重算', function () {
        app.panels[2].state.vectors = [[2, 1], [-1, 2]];
        app.panels[2].renderRows();
        var input = app.panels[2].root.querySelector('input[data-i="0"][data-j="0"]');
        input.value = '3/4';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        app.panels[2].applyInputs();
        eq(app.panels[2].state.vectors[0][0], 0.75);
      });

      check('非法坐标：给出错误、状态不被污染', function () {
        var panel = app.panels[2];
        var input = panel.root.querySelector('input[data-i="0"][data-j="0"]');
        var previous = panel.state.vectors[0][0];
        input.value = 'abc';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        panel.commit();
        ok(panel.root.querySelector('.error').textContent.length > 0, '没有报错');
        eq(panel.state.vectors[0][0], previous);
        input.value = String(previous);
      });

      check('三维预设"满秩"：升为整个空间', function () {
        app.panels[3].root.querySelector('[data-preset="full"]').click();
        eq(app.panels[3].state.info.rank, 3);
        eq(app.panels[3].root.querySelector('.verdict-title').textContent, '整个三维空间');
        eq(app.panels[3].root.querySelector('.verdict-badge b').textContent, '3');
        eq(app.panels[3].scene.stats.space, true);
        eq(app.panels[3].scene.stats.plane, false);
        ok(app.panels[3].scene.stats.lattice > 20, '空间点阵数量不足');
      });

      check('清空向量：二维张成原点且不崩溃', function () {
        var panel = app.panels[2];
        panel.state.vectors = [];
        panel.renderRows();
        panel.commit();
        eq(panel.state.info.rank, 0);
        eq(panel.root.querySelector('.verdict-title').textContent, '原点');
        eq(panel.root.querySelector('.verdict-badge b').textContent, '0');
      });

      check('组合探针：开关、系数、读出一致', function () {
        var panel = app.panels[3];
        var toggle = panel.root.querySelector('[data-probe-toggle]');
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        eq(panel.state.probeOn, true);
        var rows = panel.root.querySelectorAll('.probe-row');
        eq(rows.length, panel.state.vectors.length);
        var slider = panel.root.querySelector('[data-coef="0"]');
        slider.value = '2';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        eq(panel.state.probeCoefs[0], 2);
        ok(panel.scene.probe && panel.scene.probe.coefs, '渲染器没有收到探针');
        ok(panel.root.querySelector('.probe-result').textContent.indexOf('v₁') >= 0, '读数里没有 v₁');
      });

      check('画布尺寸与 DPR 已生效', function () {
        [2, 3].forEach(function (dim) {
          var panel = app.panels[dim];
          ok(panel.canvas.width > 0 && panel.canvas.height > 0, dim + 'D 画布尺寸为 0');
          ok(panel.canvas.width >= panel.canvas.clientWidth, dim + 'D 画布未按 DPR 放大');
        });
      });

      check('页面没有未捕获的启动错误', function () {
        eq((window.__BOOT_ERRORS__ || []).length, 0);
      });

      var pass = results.filter(function (r) { return r.ok; }).length;
      var lines = results.map(function (r) {
        return (r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '\n      ' + r.message);
      });
      lines.unshift('SELFTEST ' + (pass === results.length ? 'PASS' : 'FAIL') + '  ' + pass + '/' + results.length);
      report(lines, pass === results.length);
      document.body.dataset.selftest = pass === results.length ? 'pass' : 'fail';
    }

    if (params.has('debug')) {
      var panel = app.panels[2];
      var row = panel.root.querySelector('.vec-row');
      var coords = row.querySelector('.coords');
      var coord = row.querySelector('.coord');
      var input = row.querySelector('input');
      var stage = panel.root.querySelector('.stage-wrap');
      var lines = [
        'DEBUG',
        'clientWidth=' + document.documentElement.clientWidth + ' scrollWidth=' + document.documentElement.scrollWidth,
        'bodyScrollWidth=' + document.body.scrollWidth,
        'card=' + panel.root.getBoundingClientRect().width,
        'stage=' + stage.getBoundingClientRect().width + ' canvasCss=' + panel.canvas.getBoundingClientRect().width + ' canvasAttr=' + panel.canvas.width,
        'row=' + row.getBoundingClientRect().width,
        'coords=' + coords.getBoundingClientRect().width,
        'coord=' + coord.getBoundingClientRect().width,
        'input=' + input.getBoundingClientRect().width,
        'masthead=' + document.querySelector('.masthead').getBoundingClientRect().width,
        'actions=' + document.querySelector('.header-top').getBoundingClientRect().width
      ];
      report(lines, true);
      return;
    }

    var demo = params.get('demo');
    if (demo) {
      // 演示态不需要动画：直接落到终态，截图与虚拟时间预算无关。
      app.panels[2].scene.opts.animate = false;
      app.panels[3].scene.opts.animate = false;
      app.panels[2].commit();
      app.panels[3].commit();
      if (demo === 'full') {
        app.panels[2].root.querySelector('[data-preset="line"]').click();
        app.panels[3].root.querySelector('[data-preset="full"]').click();
      }
      if (demo === 'probe' || demo === 'analysis') {
        app.panels[2].root.querySelector('details').open = true;
        app.panels[3].root.querySelector('details').open = true;
        var toggle = app.panels[3].root.querySelector('[data-probe-toggle]');
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (demo === 'zero') {
        app.panels[2].root.querySelector('[data-preset="zero"]').click();
        app.panels[3].root.querySelector('[data-preset="zero"]').click();
      }
    }
  }

  function report(lines, pass) {
    var el = document.getElementById('selftest-report');
    if (el) {
      el.hidden = false;
      el.textContent = lines.join('\n');
    }
    document.title = (pass ? 'SELFTEST PASS' : 'SELFTEST FAIL') + ' | Span Lab';
    if (window.console && console.log) console.log(lines.join('\n'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 0); });
  } else {
    setTimeout(run, 0);
  }
})();
