/* =========================================================================
 * app.js — 两个世界的界面与状态
 * ========================================================================= */
(function () {
  'use strict';

  var M = window.SpanMath;
  var Scene2D = window.Scene2D;
  var Scene3D = window.Scene3D;
  var MAX_VECTORS = 8;
  var AXES = ['x', 'y', 'z'];
  var COLORS = ['#00adb5', '#ff9f43', '#e056a0', '#4dabf7', '#b197fc', '#ff6b6b', '#51cf66', '#f7b731'];

  var DEFAULTS = {
    2: [[2, 1], [-1, 2], [1, 3]],
    3: [[2, 0, 1], [0, 2, 1], [1, 1, 1]]
  };

  var PRESETS = {
    2: [
      { id: 'standard', label: '标准基', vectors: [[1, 0], [0, 1]] },
      { id: 'line', label: '共线', vectors: [[2, 1], [4, 2]] },
      { id: 'single', label: '单向量', vectors: [[2, 1]] },
      { id: 'zero', label: '零向量', vectors: [[0, 0]] },
      { id: 'three', label: '三向量', vectors: [[2, 1], [-1, 2], [1, 3]] }
    ],
    3: [
      { id: 'standard', label: '标准基', vectors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
      { id: 'plane', label: '共面', vectors: [[2, 0, 1], [0, 2, 1], [2, 2, 2]] },
      { id: 'line', label: '共线', vectors: [[1, 1, 1], [2, 2, 2]] },
      { id: 'full', label: '满秩', vectors: [[2, 0, 1], [0, 2, 1], [1, 1, 2]] },
      { id: 'zero', label: '零向量', vectors: [[0, 0, 0]] }
    ]
  };

  function WorldPanel(root, dim) {
    this.root = root;
    this.dim = dim;
    this.axes = AXES.slice(0, dim);
    this.state = {
      vectors: DEFAULTS[dim].map(function (v) { return v.slice(); }),
      revealed: false,
      info: M.spanInfo(DEFAULTS[dim], dim),
      probeOn: false,
      probeCoefs: DEFAULTS[dim].map(function (_, i) { return i === 0 ? 0.8 : -0.45; })
    };
    this._inputTimer = null;

    root.classList.add('world');
    root.dataset.dim = String(dim);
    root.innerHTML = this.template();

    this.canvas = root.querySelector('canvas');
    this.rowsEl = root.querySelector('.rows');
    this.verdictEl = root.querySelector('.verdict');
    this.analysisBody = root.querySelector('.analysis-body');
    this.errorEl = root.querySelector('.error');
    this.commitBtn = root.querySelector('[data-act="commit"]');
    this.addBtn = root.querySelector('[data-act="add"]');
    this.countEl = root.querySelector('.count');

    this.scene = dim === 2
      ? new Scene2D(this.canvas)
      : new Scene3D(this.canvas);

    this.bind();
    this.renderRows();
    this.syncScene(false);
    this.updateVerdict(null);
    this.updateRowStates(this.state.info);
    this.updateAnalysis();
    this.updateCount();
    this.updateCanvasLabel();
  }

  WorldPanel.prototype.template = function () {
    var dim = this.dim;
    var dimText = dim === 2 ? 'R²' : 'R³';
    var title = dim === 2 ? '二维空间' : '三维空间';
    var sub = dim === 2 ? '两个坐标轴 · 平面上的方向' : '三个坐标轴 · 空间中的方向';
    var hint = dim === 2 ? '拖拽平移 · 滚轮缩放' : '拖拽旋转 · 滚轮缩放';
    var presetHtml = PRESETS[dim].map(function (p) {
      return '<button class="preset" type="button" data-preset="' + p.id + '">' + p.label + '</button>';
    }).join('');
    var legend = dim === 2
      ? '<span>坐标</span><i class="lx">x</i><i>·</i><i class="ly">y</i>'
      : '<span>坐标</span><i class="lx">x</i><i>·</i><i class="ly">y</i><i>·</i><i class="lz">z</i>';

    return '' +
      '<div class="world-head">' +
        '<div class="world-title">' +
          '<span class="bar-dot" aria-hidden="true"></span>' +
          '<span class="dim-tag">' + dimText + '</span>' +
          '<h2>' + title + '</h2>' +
          '<span class="world-sub">' + sub + '</span>' +
        '</div>' +
        '<div class="world-tools">' +
          '<button class="tool-btn" type="button" data-act="reset">重置视角</button>' +
        '</div>' +
      '</div>' +
      '<div class="stage-wrap">' +
        '<canvas data-testid="canvas-' + dim + '" aria-label="' + title + '张成空间可视化"></canvas>' +
        '<div class="stage-hint">' + hint + '</div>' +
        '<div class="stage-legend">' + legend + '</div>' +
      '</div>' +
      '<div class="verdict" data-state="waiting" data-rank="0" aria-live="polite" data-testid="verdict-' + dim + '">' +
        '<div class="verdict-main">' +
          '<span class="verdict-kicker">张成结果</span>' +
          '<strong class="verdict-title" data-testid="verdict-title-' + dim + '">等待展现</strong>' +
          '<span class="verdict-sub" data-testid="verdict-sub-' + dim + '">写好向量，点下方按钮</span>' +
        '</div>' +
        '<div class="verdict-badge"><b data-testid="rank-' + dim + '">—</b><span>维</span></div>' +
      '</div>' +
      '<div class="editor">' +
        '<div class="editor-head"><span>基向量</span><span class="count">n = 0</span></div>' +
        '<div class="rows" data-testid="rows-' + dim + '"></div>' +
        '<div class="editor-mid">' +
          '<button class="add-btn" type="button" data-act="add" data-testid="add-' + dim + '">+ 添加向量</button>' +
          '<span class="preset-hint">向量个数最多 ' + MAX_VECTORS + ' 个</span>' +
        '</div>' +
        '<div class="presets"><span class="preset-label">预设</span>' + presetHtml + '</div>' +
        '<div class="commit-row">' +
          '<button class="commit-btn" type="button" data-act="commit" data-testid="commit-' + dim + '">展现张成空间</button>' +
          '<span class="error" role="alert" data-testid="error-' + dim + '"></span>' +
        '</div>' +
      '</div>' +
      '<details class="analysis">' +
        '<summary>它为什么是这个结果？</summary>' +
        '<div class="analysis-body"></div>' +
      '</details>';
  };

  WorldPanel.prototype.bind = function () {
    var self = this;

    this.root.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button') : null;
      if (!btn || !self.root.contains(btn)) return;
      var act = btn.dataset.act;
      if (act === 'reset') self.scene.resetView();
      else if (act === 'add') self.addVector();
      else if (act === 'commit') self.commit();
      else if (btn.dataset.preset) self.applyPreset(btn.dataset.preset);
      else if (btn.dataset.remove != null) self.removeVector(Number(btn.dataset.remove));
    });

    this.rowsEl.addEventListener('input', function (e) {
      if (!e.target.matches('input[data-j]')) return;
      clearTimeout(self._inputTimer);
      self._inputTimer = setTimeout(function () { self.applyInputs({ silent: true }); }, 260);
    });

    this.rowsEl.addEventListener('change', function (e) {
      if (!e.target.matches('input[data-j]')) return;
      self.applyInputs({ silent: true });
    });

    this.rowsEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !e.target.matches('input[data-j]')) return;
      e.preventDefault();
      self.applyInputs();
      self.commit();
    });

    this.root.addEventListener('change', function (e) {
      if (e.target.matches('[data-probe-toggle]')) self.toggleProbe(e.target.checked);
    });

    this.root.addEventListener('input', function (e) {
      if (e.target.matches('[data-coef]')) self.onCoef(e.target);
    });
  };

  WorldPanel.prototype.renderRows = function () {
    var self = this;
    var html = '';
    this.state.vectors.forEach(function (v, i) {
      var color = COLORS[i % COLORS.length];
      var coords = v.map(function (x, j) {
        return '<label class="coord">' +
          '<span>' + self.axes[j] + '</span>' +
          '<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" ' +
            'data-i="' + i + '" data-j="' + j + '" value="' + M.fmtInput(x) + '" ' +
            'aria-label="第 ' + (i + 1) + ' 个向量的 ' + self.axes[j] + ' 坐标">' +
        '</label>';
      }).join('');
      html += '<div class="vec-row" style="--vc:' + color + '" data-row="' + i + '">' +
        '<span class="vec-name">v' + M.subscript(i + 1) + '</span>' +
        '<span class="vec-color"></span>' +
        '<span class="coords">' + coords + '</span>' +
        '<span class="vec-state" data-state-for="' + i + '" data-kind="pending">待定</span>' +
        '<button class="remove" type="button" data-remove="' + i + '" aria-label="删除向量 ' + (i + 1) + '" title="删除">×</button>' +
      '</div>';
    });
    if (!this.state.vectors.length) {
      html = '<div class="analysis-empty" style="padding:12px">还没有向量。张成只剩原点——点「展现」也可以。</div>';
    }
    this.rowsEl.innerHTML = html;
    this.updateCount();
  };

  WorldPanel.prototype.applyInputs = function (opts) {
    opts = opts || {};
    var self = this;
    var rows = this.rowsEl.querySelectorAll('.vec-row');
    var next = [];
    var bad = null;

    for (var i = 0; i < rows.length; i++) {
      var inputs = rows[i].querySelectorAll('input[data-j]');
      var v = [];
      for (var j = 0; j < inputs.length; j++) {
        var value = M.parseScalar(inputs[j].value);
        if (value === null) {
          rows[i].classList.add('invalid');
          bad = inputs[j];
        } else {
          rows[i].classList.remove('invalid');
          v.push(value);
        }
      }
      if (v.length === this.dim) next.push(v);
    }

    if (bad) {
      if (!opts.silent) this.showError('坐标要写成数字，例如 2、-1.5 或 3/4');
      return false;
    }

    this.clearError();
    this.state.vectors = next;
    this.state.info = M.spanInfo(next, this.dim);
    this.syncProbeCoefs();
    this.syncScene(true);

    if (this.state.revealed) this.updateVerdict(this.state.info);
    this.updateRowStates(this.state.info);
    this.updateAnalysis();
    this.updateCount();
    this.updateCanvasLabel();
    return true;
  };

  WorldPanel.prototype.commit = function () {
    if (!this.applyInputs()) return;
    this.state.revealed = true;
    this.state.info = M.spanInfo(this.state.vectors, this.dim);
    this.syncScene(true);
    this.scene.animateReveal(this.dim === 2 ? 720 : 840);
    this.updateVerdict(this.state.info);
    this.updateRowStates(this.state.info);
    this.updateAnalysis();
    this.updateCount();
    this.updateCanvasLabel();

    this.commitBtn.textContent = '重新展现张成空间';
    this.commitBtn.classList.remove('replay');
    void this.commitBtn.offsetWidth;
    this.commitBtn.classList.add('replay');
  };

  WorldPanel.prototype.addVector = function () {
    if (this.state.vectors.length >= MAX_VECTORS) return;
    if (!this.applyInputs()) return;
    var v = this.dim === 2 ? [1, 1] : [1, 1, 1];
    this.state.vectors.push(v);
    this.state.probeCoefs.push(0.4);
    this.renderRows();
    this.state.info = M.spanInfo(this.state.vectors, this.dim);
    this.syncScene(true);
    if (this.state.revealed) this.updateVerdict(this.state.info);
    this.updateRowStates(this.state.info);
    this.updateAnalysis();
    this.updateCount();
    this.updateCanvasLabel();

    var last = this.rowsEl.querySelector('.vec-row:last-child input');
    if (last) {
      last.focus();
      last.select();
    }
  };

  WorldPanel.prototype.removeVector = function (index) {
    if (index < 0 || index >= this.state.vectors.length) return;
    if (!this.applyInputs()) return;
    this.state.vectors.splice(index, 1);
    this.state.probeCoefs.splice(index, 1);
    this.renderRows();
    this.state.info = M.spanInfo(this.state.vectors, this.dim);
    this.syncScene(true);
    if (this.state.revealed) this.updateVerdict(this.state.info);
    this.updateRowStates(this.state.info);
    this.updateAnalysis();
    this.updateCount();
    this.updateCanvasLabel();
  };

  WorldPanel.prototype.applyPreset = function (id) {
    var preset = (PRESETS[this.dim] || []).filter(function (p) { return p.id === id; })[0];
    if (!preset) return;
    this.state.vectors = preset.vectors.map(function (v) { return v.slice(); });
    this.state.probeCoefs = preset.vectors.map(function (_, i) { return i === 0 ? 0.8 : -0.45; });
    this.renderRows();
    this.commit();
  };

  WorldPanel.prototype.syncProbeCoefs = function () {
    var n = this.state.vectors.length;
    var next = [];
    for (var i = 0; i < n; i++) {
      var v = this.state.probeCoefs[i];
      next.push(typeof v === 'number' && Number.isFinite(v) ? v : (i === 0 ? 0.8 : -0.45));
    }
    this.state.probeCoefs = next;
  };

  WorldPanel.prototype.syncScene = function (immediate) {
    this.scene.setWorld({
      vectors: this.state.vectors,
      revealed: this.state.revealed,
      info: this.state.info
    });
    this.scene.setProbe(this.state.probeOn ? { coefs: this.state.probeCoefs.slice() } : null);
    if (immediate) {
      this.scene.revealT = 1;
      this.scene.render();
    }
  };

  WorldPanel.prototype.toggleProbe = function (on) {
    this.state.probeOn = !!on;
    this.syncProbeCoefs();
    this.updateAnalysis();
    this.scene.setProbe(this.state.probeOn ? { coefs: this.state.probeCoefs.slice() } : null);
  };

  WorldPanel.prototype.onCoef = function (input) {
    var i = Number(input.dataset.coef);
    var value = Number(input.value);
    if (!Number.isFinite(value)) return;
    this.state.probeCoefs[i] = value;
    var out = this.root.querySelector('[data-out="' + i + '"]');
    if (out) out.textContent = value.toFixed(2);
    this.updateProbeReadout();
    this.scene.setProbe({ coefs: this.state.probeCoefs.slice() });
  };

  WorldPanel.prototype.comboPoint = function () {
    if (!this.state.vectors.length) return null;
    var out = new Array(this.dim).fill(0);
    for (var i = 0; i < this.state.vectors.length; i++) {
      var c = this.state.probeCoefs[i] || 0;
      for (var d = 0; d < this.dim; d++) out[d] += c * this.state.vectors[i][d];
    }
    return out;
  };

  WorldPanel.prototype.updateProbeReadout = function () {
    var el = this.root.querySelector('.probe-result');
    if (!el) return;
    var p = this.comboPoint();
    if (!p) { el.textContent = '还没有向量。'; return; }
    el.innerHTML = '<span class="math">' +
      M.combinationText(this.state.probeCoefs, this.state.vectors) +
      '</span> = <b>' + M.formatVector(p) + '</b>';
  };

  WorldPanel.prototype.updateVerdict = function (info) {
    var titleEl = this.verdictEl.querySelector('.verdict-title');
    var subEl = this.verdictEl.querySelector('.verdict-sub');
    var rankEl = this.verdictEl.querySelector('.verdict-badge b');

    if (!this.state.revealed || !info) {
      this.verdictEl.dataset.state = 'waiting';
      this.verdictEl.dataset.rank = '0';
      titleEl.textContent = '等待展现';
      subEl.textContent = '写好向量，点下方按钮';
      rankEl.textContent = '—';
      return;
    }

    this.verdictEl.dataset.state = 'revealed';
    this.verdictEl.dataset.rank = String(info.rank);
    titleEl.textContent = M.spanLabel(info);
    rankEl.textContent = String(info.rank);

    var parts = [M.dimensionLabel(info)];
    if (info.count > 0) {
      parts.push('n = ' + info.count + '，r = ' + info.rank);
      if (info.count > info.rank) parts.push((info.count - info.rank) + ' 个向量没有带来新方向');
      else parts.push('每个向量都带来了新方向');
    } else {
      parts.push('没有向量');
    }
    if (info.rank === 0 && info.count > 0) parts.push('所有向量都指向原点');
    subEl.textContent = parts.join(' · ');
  };

  WorldPanel.prototype.updateRowStates = function (info) {
    var self = this;
    for (var i = 0; i < this.state.vectors.length; i++) {
      var el = this.rowsEl.querySelector('[data-state-for="' + i + '"]');
      if (!el) continue;
      if (!this.state.revealed || !info || !info.increments[i]) {
        el.dataset.kind = 'pending';
        el.textContent = '待定';
        el.title = '点击展现后判定';
        continue;
      }
      var inc = info.increments[i];
      if (inc.zero) {
        el.dataset.kind = 'zero';
        el.textContent = '零向量';
        el.title = '零向量不提供方向';
      } else if (inc.independent) {
        el.dataset.kind = 'ind';
        el.textContent = '独立';
        el.title = '增加了一个新的独立方向';
      } else {
        el.dataset.kind = 'dep';
        el.textContent = '相关';
        el.title = inc.terms && inc.terms.length ? M.relationText(i, inc.terms) : '可由前面的向量表示';
      }
    }
  };

  WorldPanel.prototype.updateCount = function () {
    if (!this.countEl) return;
    this.countEl.textContent = 'n = ' + this.state.vectors.length;
    if (this.addBtn) this.addBtn.disabled = this.state.vectors.length >= MAX_VECTORS;
  };

  WorldPanel.prototype.updateCanvasLabel = function () {
    var info = this.state.info;
    var label = this.dim === 2 ? '二维空间' : '三维空间';
    if (!this.state.revealed || !info) {
      label += '，共 ' + this.state.vectors.length + ' 个向量，尚未展现';
    } else {
      label += '，共 ' + info.count + ' 个向量，张成' + M.spanLabel(info) + '，维数 ' + info.rank;
    }
    this.canvas.setAttribute('aria-label', label);
  };

  WorldPanel.prototype.showError = function (msg) {
    if (this.errorEl) this.errorEl.textContent = msg;
  };

  WorldPanel.prototype.clearError = function () {
    if (this.errorEl) this.errorEl.textContent = '';
  };

  WorldPanel.prototype.updateAnalysis = function () {
    if (!this.analysisBody) return;
    var info = this.state.info;
    var revealed = this.state.revealed;
    var n = this.state.vectors.length;
    var dim = this.dim;
    var self = this;

    var def = n
      ? 'span(v₁, …, v' + M.subscript(n) + ') = { c₁v₁ + … + c' + M.subscript(n) + 'v' + M.subscript(n) + ' | cᵢ ∈ ℝ }'
      : 'span(∅) = { 0 }';

    var html = '<p class="def">' + def + '</p>';

    if (!revealed) {
      html += '<p class="analysis-empty">点「展现张成空间」后，这里会给出：逐步独立性判定、这个子空间的方程、矩阵的秩，以及可拖动的组合探针。</p>';
      html += this.matrixHtml(info);
      html += this.probeHtml();
      this.analysisBody.innerHTML = html;
      return;
    }

    var steps = info.increments.map(function (inc, i) {
      var v = M.formatVector(inc.vector);
      var kind = 'ind';
      var title = '';
      var note = '';
      if (inc.zero) {
        kind = 'zero';
        title = 'v' + M.subscript(i + 1) + ' = ' + v + ' 是零向量';
        note = '不提供方向，张成维数不变。';
      } else if (inc.independent) {
        title = 'v' + M.subscript(i + 1) + ' = ' + v + ' 是独立方向';
        note = i === 0
          ? '建立第 1 个方向。'
          : '张成维数从 ' + (inc.rankAfter - 1) + ' 提高到 ' + inc.rankAfter + '。';
      } else {
        kind = 'dep';
        title = 'v' + M.subscript(i + 1) + ' = ' + v + ' 落在已有张成里';
        note = inc.terms && inc.terms.length
          ? M.relationText(i, inc.terms) + '，不增加维数。'
          : '不能增加新的方向。';
      }
      return '<li class="step" data-kind="' + kind + '">' +
        '<span class="step-index">' + (i + 1) + '</span>' +
        '<span class="step-main">' +
          '<span class="step-title"><span class="math">' + title + '</span></span>' +
          '<span class="step-note">' + note + '</span>' +
        '</span>' +
      '</li>';
    }).join('');

    var eq = this.equationInfo(info);
    var facts = this.factsHtml(info);

    html += '<div class="analysis-grid">' +
      '<div class="analysis-block">' +
        '<h4>逐步判定</h4>' +
        '<ol class="steps">' + steps + '</ol>' +
      '</div>' +
      '<div class="analysis-block">' +
        '<h4>这个子空间</h4>' +
        '<div class="eq-card">' +
          '<div class="eq">' + eq.title + '</div>' +
          '<p class="eq-note">' + eq.note + '</p>' +
          facts +
        '</div>' +
      '</div>' +
    '</div>';

    html += this.matrixHtml(info);
    html += this.probeHtml();
    this.analysisBody.innerHTML = html;
  };

  WorldPanel.prototype.equationInfo = function (info) {
    var dim = this.dim;
    var r = info.rank;
    if (r === 0) {
      return {
        title: dim === 2 ? '{ (0, 0) }' : '{ (0, 0, 0) }',
        note: '没有任何方向，张成只是一个点。'
      };
    }
    if (r === 1 && dim === 2) {
      return {
        title: info.equation.text,
        note: '过原点，法向量 n = ' + M.formatVector(info.equation.normal) +
          '；也就是所有与 ' + M.formatVector(info.basis[0]) + ' 共线的点。'
      };
    }
    if (r === 1 && dim === 3) {
      return {
        title: info.equation.text,
        note: '过原点，方向向量 ' + M.formatVector(info.basis[0]) + '；所有 k 倍都在同一条线上。'
      };
    }
    if (r === 2 && dim === 2) {
      return {
        title: '整个 ℝ²',
        note: '两个独立方向已经覆盖平面上的每一点；|det| = ' + M.fmt(info.measure) + ' 是基本平行四边形的面积。'
      };
    }
    if (r === 2 && dim === 3) {
      return {
        title: info.equation.text,
        note: '过原点，法向量 n = ' + M.formatVector(info.equation.normal) +
          '；两个独立方向铺成这张平面。'
      };
    }
    return {
      title: '整个 ℝ³',
      note: '三个独立方向撑满空间；|det| = ' + M.fmt(info.measure) + ' 是基本平行六面体的体积。'
    };
  };

  WorldPanel.prototype.factsHtml = function (info) {
    var measureLabel = info.measureKind === 'volume' ? '基本胞元体积'
      : info.measureKind === 'area' ? '基本胞元面积'
        : info.measureKind === 'length' ? '基准长度' : null;
    var rows = [
      ['张成维数', String(info.rank)],
      ['向量个数', String(info.count)],
      ['多余向量', String(info.count - info.rank)]
    ];
    if (measureLabel && info.measure != null) {
      rows.push([measureLabel, M.fmt(info.measure)]);
    }
    return rows.map(function (row) {
      return '<div class="fact-row"><span>' + row[0] + '</span><span>' + row[1] + '</span></div>';
    }).join('');
  };

  WorldPanel.prototype.matrixHtml = function (info) {
    var n = this.state.vectors.length;
    if (!n) return '';
    var dim = this.dim;
    var rows = [];
    for (var i = 0; i < dim; i++) {
      var cells = this.state.vectors.map(function (v) {
        return '<span>' + M.fmt(v[i]) + '</span>';
      }).join('');
      rows.push('<div class="matrix-row">' + cells + '</div>');
    }
    return '<div class="analysis-block matrix-block">' +
      '<div class="matrix-head">' +
        '<h4 style="margin:0">矩阵 A（列为向量）</h4>' +
        '<span class="rank-badge">rank = ' + info.rank + '</span>' +
      '</div>' +
      '<div class="matrix">' + rows.join('') + '</div>' +
      '<p class="eq-note" style="margin-top:6px">秩 = 独立方向的个数 = 张成的维数。多出来的列不改变秩。</p>' +
    '</div>';
  };

  WorldPanel.prototype.probeHtml = function () {
    var self = this;
    var n = this.state.vectors.length;
    var html = '<div class="probe-block">' +
      '<div class="probe-head">' +
        '<label class="switch">' +
          '<input type="checkbox" data-probe-toggle ' + (this.state.probeOn ? 'checked' : '') + '>' +
          '<span class="track" aria-hidden="true"></span>' +
          '<span>线性组合探针</span>' +
        '</label>' +
        '<span class="probe-note">拖动系数，看组合点是否始终落在张成空间里</span>' +
      '</div>';

    if (!this.state.probeOn) {
      html += '<p class="analysis-empty" style="margin-top:8px">打开后，可以用 c₁ … c' + (n ? M.subscript(n) : 'ₙ') + ' 手动组合出一个点。</p>';
    } else if (!n) {
      html += '<p class="analysis-empty" style="margin-top:8px">还没有向量，探针没有可组合的对象。</p>';
    } else {
      var rows = this.state.vectors.map(function (v, i) {
        var coef = self.state.probeCoefs[i] == null ? 0 : self.state.probeCoefs[i];
        return '<div class="probe-row" style="--vc:' + COLORS[i % COLORS.length] + '">' +
          '<span class="plabel">c' + M.subscript(i + 1) + '</span>' +
          '<input type="range" min="-2" max="2" step="0.05" value="' + coef + '" data-coef="' + i + '" aria-label="系数 c' + (i + 1) + '">' +
          '<output data-out="' + i + '">' + coef.toFixed(2) + '</output>' +
        '</div>';
      }).join('');
      var p = this.comboPoint();
      html += '<div class="probe-rows">' + rows + '</div>' +
        '<div class="probe-result"><span class="math">' +
          M.combinationText(this.state.probeCoefs, this.state.vectors) +
          '</span> = <b>' + M.formatVector(p) + '</b></div>';
    }

    html += '</div>';
    return html;
  };

  /* ---------------------------------------------------------------- 启动 */

  function boot() {
    var root2 = document.getElementById('world-2');
    var root3 = document.getElementById('world-3');
    if (!root2 || !root3) return;

    var panels = {
      2: new WorldPanel(root2, 2),
      3: new WorldPanel(root3, 3)
    };

    window.__SPANLAB__ = {
      panels: panels,
      WorldPanel: WorldPanel,
      M: M,
      version: '1.0.0'
    };

    var modal = document.getElementById('about-modal');
    var btnAbout = document.getElementById('btn-about');
    var btnClose = document.getElementById('btn-about-close');

    function openModal() {
      modal.hidden = false;
      if (btnClose) btnClose.focus();
    }
    function closeModal() {
      modal.hidden = true;
      if (btnAbout) btnAbout.focus();
    }

    if (btnAbout) btnAbout.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !modal.hidden) closeModal();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
