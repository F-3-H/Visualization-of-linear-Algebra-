# ============================================================
# tools/render_figures_observer.py —— 《看不见的状态》配图渲染器
#
# 与 观测项目/assets/core.js 同一套数学（此处为 Python 镜像），
# 与项目同一套配色（浅色纸面，取自 assets/theme.css）。
# 图即项目输出，不是另画的示意图：正文里每一张图，都能在
# 观测项目的五个视角里找到同一套数学算出的对应物。
#
# 跑法：python tools/render_figures_observer.py
# 输出：观测图/  （正文里 14 处 ![](控制图/figNN-….png) 的名字与顺序由它定死）
# ============================================================
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, Polygon, Arc, Rectangle, Circle
from matplotlib.font_manager import FontProperties

# ---------- 配色（与 控制项目/assets/theme.css 同源） ----------
# 两套纸面：浅色的给 docx，深色的给正文页。深色值读 tools/palette_dark.json，
# 与 theme.css 同一个来源（改配色只改那一个文件）。
# 跑法：python tools/render_figures_observer.py              → 控制图/
#       FIG_THEME=dark python tools/render_figures_observer.py → 观测图-dark/
HERE = os.path.dirname(os.path.abspath(__file__))
THEME = (os.environ.get("FIG_THEME") or "light").strip().lower()
C_U    = "#0e9f6e"   # 绿：这一捆 / b（力从哪儿进去）
C_V    = "#0e7490"   # 青：回来的那条线 / 闭环
C_SUM  = "#b7791f"   # 琥珀：目标 / 合成
C_RED  = "#d64545"   # 红：往外的那条线 / 开环
C_PUR  = "#7c5cbf"   # 紫：相流 / A·b
C_GHOST= "#aeb9c8"   # 作用前的影子
C_INK  = "#1c2430"
C_SOFT = "#5b6572"
C_GRID = "#e8edf3"
C_AXIS = "#9aa5b5"
C_BG   = "#fdfdfe"
C_PANEL= "#ffffff"
PALE_U, PALE_SUM, PALE_PUR, PALE_V = "#e9f7f1", "#fdf6e8", "#f2eefa", "#eef4f7"
OUT    = os.path.join(os.path.dirname(HERE), "观测图")

if THEME == "dark":
    import json
    _t = json.load(open(os.path.join(HERE, "palette_dark.json"), encoding="utf-8"))["tokens"]
    C_U, C_V, C_SUM = _t["--u"], _t["--v"], _t["--sum"]
    C_RED, C_PUR, C_GHOST = _t["--red"], _t["--purple"], _t["--ghost"]
    C_INK, C_SOFT = _t["--ink"], _t["--ink-soft"]
    C_GRID, C_AXIS = _t["--grid"], _t["--axis"]
    C_BG, C_PANEL = _t["--paper"], _t["--panel"]
    PALE_U, PALE_SUM = _t["--pale-u"], _t["--pale-sum"]
    PALE_PUR, PALE_V = _t["--pale-purple"], _t["--pale-v"]
    OUT = os.path.join(os.path.dirname(HERE), "观测图-dark")

os.makedirs(OUT, exist_ok=True)

zh = FontProperties(fname=r"C:\Windows\Fonts\msyh.ttc", size=12)
zh_sm = FontProperties(fname=r"C:\Windows\Fonts\msyh.ttc", size=10.5)
zh_xs = FontProperties(fname=r"C:\Windows\Fonts\msyh.ttc", size=9.5)
zh_title = FontProperties(fname=r"C:\Windows\Fonts\msyhbd.ttc", size=13.5)
# 等宽字体是给数字和 βγθω 这类符号用的，但读数里难免夹一个中文词
# （"第一行"、"λ1"），所以族里带上雅黑做回退，否则缺字形会被画成空白方块。
mono = FontProperties(family=["Consolas", "Microsoft YaHei"], size=11)
mono_sm = FontProperties(family=["Consolas", "Microsoft YaHei"], size=9.5)

plt.rcParams["axes.unicode_minus"] = False

# ============================================================
# 数学（core.js 的 Python 镜像）
# ============================================================
def vec(x, y): return np.array([float(x), float(y)])
def mat(a, b, c, d): return np.array([[a, b], [c, d]], dtype=float)
def apply_m(M, u): return M @ u
def mul(A, B): return A @ B
def det(M): return float(np.linalg.det(M))
def trace(M): return float(M[0, 0] + M[1, 1])
def stick_mat(a, c): return mat(0, 1, a, -c)
B_STICK = vec(0, 1)

def eigen(M):
    tr = trace(M); d = det(M); disc = tr * tr - 4 * d
    if disc > 1e-10:
        s = np.sqrt(disc); l1 = (tr + s) / 2; l2 = (tr - s) / 2
        def dirv(l):
            r1 = np.array([M[0, 0] - l, M[0, 1]]); r2 = np.array([M[1, 0], M[1, 1] - l])
            r = r1 if np.hypot(*r1) >= np.hypot(*r2) else r2
            return np.array([-r[1], r[0]]) / np.hypot(*r)
        return {"type": "real", "l1": l1, "l2": l2, "v1": dirv(l1), "v2": dirv(l2)}
    if disc < -1e-10:
        return {"type": "complex", "re": tr / 2, "im": np.sqrt(-disc) / 2}
    return {"type": "repeated", "l": tr / 2}

def expm2(M, t):
    e = eigen(M)
    if e["type"] == "complex":
        re, im = e["re"], e["im"]
        B = M - re * np.eye(2)
        k = t if abs(im) < 1e-12 else np.sin(im * t) / im
        f = np.exp(re * t); c = np.cos(im * t)
        return f * (c * np.eye(2) + k * B)
    if e["type"] == "real" and abs(e["l1"] - e["l2"]) > 1e-9:
        l1, l2 = e["l1"], e["l2"]
        A1 = (M - l2 * np.eye(2)) / (l1 - l2); A2 = (M - l1 * np.eye(2)) / (l2 - l1)
        return np.exp(l1 * t) * A1 + np.exp(l2 * t) * A2
    l = e.get("l", e.get("l1"))
    return np.exp(l * t) * (np.eye(2) + (M - l * np.eye(2)) * t)

def max_real(M):
    e = eigen(M)
    if e["type"] == "complex": return e["re"]
    if e["type"] == "real": return max(e["l1"], e["l2"])
    return e["l"]

def verdict(M, eps=1e-9):
    m = max_real(M)
    if m < -eps: return "回"
    if m > eps: return "跑"
    return "绕"

def close_loop(A, b, k):
    return mat(A[0, 0] - b[0] * k[0], A[0, 1] - b[0] * k[1],
               A[1, 0] - b[1] * k[0], A[1, 1] - b[1] * k[1])

def control_matrix(A, b):
    ab = A @ b
    return mat(b[0], ab[0], b[1], ab[1])

def place_poles_st(A, b, s, t):
    ab = A @ b
    d = b[0] * ab[1] - ab[0] * b[1]
    if abs(d) < 1e-9: return None
    A2 = A @ A
    phi = mat(A2[0, 0] - s * A[0, 0] + t, A2[0, 1] - s * A[0, 1],
              A2[1, 0] - s * A[1, 0], A2[1, 1] - s * A[1, 1] + t)
    rx = -b[1] / d; ry = b[0] / d
    return vec(rx * phi[0, 0] + ry * phi[1, 0], rx * phi[0, 1] + ry * phi[1, 1])

def gains_stick(a, c, s, t): return vec(a + t, -s - c)

def traj(M, s0, T, N, limit):
    pts = []
    for i in range(N + 1):
        p = expm2(M, T * i / N) @ s0
        pts.append(p)
        if max(abs(p[0]), abs(p[1])) > limit: break
    return np.array(pts)

# ============================================================
# 绘制助手
# ============================================================
def new_fig(figsize=(7.6, 4.6)):
    fig = plt.figure(figsize=figsize, dpi=200)
    fig.patch.set_facecolor(C_BG)
    return fig

def style_ax(ax, xlim, ylim, xlabel=None, ylabel=None, step=1, ticks=True, grid=True):
    ax.set_facecolor(C_BG)
    ax.set_xlim(*xlim); ax.set_ylim(*ylim)
    ax.set_aspect("equal")
    ax.spines[["top", "right"]].set_visible(False)
    for s in ["left", "bottom"]:
        ax.spines[s].set_color(C_AXIS)
    ax.tick_params(colors=C_SOFT, labelsize=8, length=3)
    if xlabel: ax.set_xlabel(xlabel, fontproperties=zh_sm, color=C_SOFT)
    if ylabel: ax.set_ylabel(ylabel, fontproperties=zh_sm, color=C_SOFT, rotation=0, labelpad=10)
    if ticks:
        ax.set_xticks(np.arange(np.ceil(xlim[0]), xlim[1] + 0.01, step))
        ax.set_yticks(np.arange(np.ceil(ylim[0]), ylim[1] + 0.01, step))
    if grid:
        ax.grid(True, color=C_GRID, linewidth=0.8); ax.set_axisbelow(True)
    return ax

def new_ax(figsize=(7.6, 4.6), xlim=(-4.6, 4.6), ylim=(-3.4, 3.4), xlabel="θ", ylabel="ω",
           step=1, ticks=True):
    fig = new_fig(figsize); ax = fig.add_subplot(111)
    style_ax(ax, xlim, ylim, xlabel, ylabel, step=step, ticks=ticks)
    return fig, ax

def arrow(ax, p, q, color=C_INK, lw=2.2, ls="-", alpha=1.0, z=3, head=0.16):
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle="-|>", mutation_scale=14 * head / 0.16,
                                 color=color, lw=lw, linestyle=ls, alpha=alpha,
                                 shrinkA=0, shrinkB=0, zorder=z))

def seg(ax, p, q, color=C_GRID, lw=0.8, ls="-", alpha=1.0, z=1):
    ax.plot([p[0], q[0]], [p[1], q[1]], color=color, lw=lw, ls=ls, alpha=alpha, zorder=z)

def txt(ax, p, s, color=C_INK, fp=None, dx=0, dy=0, ha="left", va="center", z=6, rot=0):
    ax.text(p[0] + dx, p[1] + dy, s, color=color, fontproperties=fp or zh_sm,
            ha=ha, va=va, zorder=z, rotation=rot)

def dot(ax, p, color, r=0.055, z=5):
    ax.add_patch(Circle(p, r, color=color, zorder=z))
    ax.add_patch(Circle(p, r, facecolor="none", edgecolor=C_PANEL, lw=1.2, zorder=z))

def cross(ax, p, r, color, lw, z=7):
    ax.plot([p[0] - r, p[0] + r], [p[1] - r, p[1] + r], color=color, lw=lw,
            solid_capstyle="round", zorder=z)
    ax.plot([p[0] + r, p[0] - r], [p[1] + r, p[1] - r], color=color, lw=lw,
            solid_capstyle="round", zorder=z)

def ring(ax, p, r, color, fill=None, lw=2.2, z=6):
    ax.add_patch(Circle(p, r, facecolor=fill or "none", edgecolor=color, lw=lw, zorder=z))

def line_full(ax, v, xlim, ylim, color, lw=1.4, ls=(0, (7, 5)), alpha=1.0, z=2):
    """画满整个画框的一整条直线（穿过远点的方向线）。"""
    tx = max(abs(xlim[0]), abs(xlim[1])) / abs(v[0]) if abs(v[0]) > 1e-12 else 1e9
    ty = max(abs(ylim[0]), abs(ylim[1])) / abs(v[1]) if abs(v[1]) > 1e-12 else 1e9
    t = min(tx, ty)
    ax.plot([-t * v[0], t * v[0]], [-t * v[1], t * v[1]], color=color, lw=lw,
            ls=ls, alpha=alpha, zorder=z, solid_capstyle="butt")

def save(fig, name):
    path = os.path.join(OUT, name)
    fig.savefig(path, bbox_inches="tight", facecolor=C_BG)
    plt.close(fig)
    print("写出", name)


# ============================================================
# 观测这一段的数学（观测项目/assets/core.js 的镜像）
# ============================================================
def observe_mat(A, l, cv):          return A - np.outer(l, cv)
def obs_matrix(A, cv):              return np.vstack([cv, cv @ A])
def observable(A, cv, eps=1e-3):    return abs(det(obs_matrix(A, cv))) > eps * float(cv @ cv)
def blind_dir(A, cv):
    e = eigen(A)
    if e["type"] != "real": return None
    tol = 1e-3 * float(np.hypot(*cv))
    if e.get("v1") is not None and abs(float(e["v1"] @ cv)) < tol: return (e["v1"], e["l1"])
    if e.get("v2") is not None and abs(float(e["v2"] @ cv)) < tol: return (e["v2"], e["l2"])
    return None
def shadow_run(A, cv, l, x0, xh0, T, n):
    M = observe_mat(A, l, cv); e0 = x0 - xh0
    ts = np.linspace(0, T, n + 1)
    tr = [expm2(A, t) @ x0 for t in ts]
    er = [expm2(M, t) @ e0 for t in ts]
    return ts, np.array(tr), np.array(er), np.array([np.hypot(*e) for e in er])
def sample_theta(f, T, h, sigma, seed):
    s = seed & 0xFFFFFFFF; out = []
    n = int(round(T / h))
    for i in range(n + 1):
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        u = s / 4294967296.0
        out.append((i * h, f(i * h) + sigma * (u * 2 - 1)))
    return out
def diff_est(samples):
    return [((samples[i][0] + samples[i-1][0]) / 2, (samples[i][1] - samples[i-1][1]) / (samples[i][0] - samples[i-1][0]))
            for i in range(1, len(samples))]
def diff_bound(th_max, lam, h, sigma): return th_max * lam * lam * h / 2 + 2 * sigma / h

A = stick_mat(1, 0.2)
E = eigen(A)
LAM1, LAM2 = E["l1"], E["l2"]
CV_TH = vec(1, 0)                       # 测 θ
VE = vec(-LAM1, 1)                      # 与 v1 严格垂直的那一行


# ============================================================
# 01 读数是一条线
# ============================================================
fig, ax = new_ax(figsize=(8.0, 5.2), xlim=(-3.2, 3.2), ylim=(-2.6, 2.6), xlabel="θ 歪了多少", ylabel="ω 歪得多快")
ax.yaxis.set_label_coords(-0.10, 0.5)
for t in np.arange(-3, 3.1, 0.8):
    seg(ax, (t, -2.6), (t, 2.6), color=C_GRID, lw=1.0, ls=(0, (3, 4)), z=1)
p = vec(0.9, 0.6); q = vec(0.9, 1.9)
seg(ax, (p[0], -2.6), (p[0], 2.6), color=C_V, lw=2.2, z=2)
arrow(ax, (0, 0), p, color=C_U, lw=2.4)
arrow(ax, (0, 0), q, color=C_SUM, lw=2.4)
dot(ax, p, C_U); dot(ax, q, C_SUM)
txt(ax, p, "你测到的这个", color=C_U, fp=zh_sm, dx=0.12, dy=-0.22)
txt(ax, q, "读数一样，状态不同", color=C_SUM, fp=zh_sm, dx=0.12, dy=0.2)
txt(ax, (0.9, -2.35), "这一整条线上的读数都等于 0.90", color=C_V, fp=zh_sm, dx=0.1)
txt(ax, (-3.0, 2.25), "一次读数只告诉你落在哪条线上，\n不告诉你在这条线的哪儿", color=C_INK, fp=zh)
save(fig, "fig01-读数是一条线.png")


# ============================================================
# 02 减在第一列
# ============================================================
def bracket_left(ax, x, ytop, ybot, w=0.13, color=C_INK, lw=1.6):
    ax.plot([x + w, x, x, x + w], [ytop, ytop, ybot, ybot], color=color, lw=lw,
            solid_capstyle="round", zorder=4)

def mat_panel(ax, x0, y0, M, title, hl=None, cw=0.74, tag=None):
    ax.text(x0 + cw, y0 + 0.62, title, color=C_INK, fontproperties=zh_sm, ha="center")
    for i in range(2):
        for j in range(2):
            x, y = x0 + j * cw, y0 - i * 0.60
            if hl == "col" and j == 0:
                ax.add_patch(Rectangle((x, y - 0.30), cw, 0.60, facecolor=PALE_U, edgecolor="none", zorder=1))
            if hl == "row" and i == 1:
                ax.add_patch(Rectangle((x, y - 0.30), cw, 0.60, facecolor=PALE_SUM, edgecolor="none", zorder=1))
            ax.text(x + cw / 2, y, "%+.2f" % M[i, j], color=C_INK, fontproperties=mono,
                    ha="center", va="center", zorder=3)
    bracket_left(ax, x0 - 0.26, y0 + 0.30, y0 - 0.90)
    xr = x0 + 2 * cw + 0.26
    ax.plot([xr - 0.13, xr, xr, xr - 0.13], [y0 + 0.30, y0 + 0.30, y0 - 0.90, y0 - 0.90],
            color=C_INK, lw=1.6, solid_capstyle="round", zorder=4)
    if tag:
        ax.text(x0 + cw, y0 - 1.28, tag, color=C_SOFT, fontproperties=zh_xs, ha="center")

fig = new_fig((11.2, 4.4)); ax = fig.add_axes([0, 0, 1, 1]); ax.axis("off")
ax.set_xlim(0, 11.2); ax.set_ylim(0, 4.4)
ax.text(0.42, 4.02, "同一道减法，减的行还是减的列", color=C_INK, fontproperties=zh_title)
ax.text(0.42, 3.52, "控制那一篇：力从 b 一列进去、k 一行乘上来，只改写第二行。观测这一篇：读数是一行 C，L 一列乘上去，只改写第一列。",
        color=C_SOFT, fontproperties=zh_xs)
mat_panel(ax, 0.92, 2.60, A, "原来的 A", tag="棍子自己的脾气")
mat_panel(ax, 4.42, 2.60, observe_mat(A, vec(2.5, 0.5), CV_TH), "A − LC，L = (2.5, 0.5)",
          hl="col", tag="第一列整列换掉")
mat_panel(ax, 7.92, 2.60, close_loop(A, B_STICK, vec(3, 2.8)), "A − bk，k = (3, 2.8)",
          hl="row", tag="第二行整行换掉")
ax.text(0.42, 0.52, "减行改的是「输入怎么进去」，减列改的是「读数怎么回来」——同一道减法，管的事完全不同。",
        color=C_INK, fontproperties=zh_xs)
save(fig, "fig02-减在第一列.png")


# ============================================================
# 03 差分的两头夹
# ============================================================
fig = new_fig((7.8, 4.6)); ax = fig.add_subplot(111)
hs = np.logspace(-3, np.log10(0.25), 200)
TH_MAX = 0.2 * np.exp(LAM1 * 1.5)
trunc = TH_MAX * LAM1 ** 2 * hs / 2
for sg, col in ((0.002, C_SUM), (0.008, C_RED)):
    noise = 2 * sg / hs
    ax.plot(hs, trunc + noise, color=col, lw=2, label="截断＋噪声（σ = %g）" % sg)
    ax.plot(hs, noise, color=col, lw=1, ls=(0, (4, 3)), alpha=0.8)
ax.plot(hs, trunc, color=C_V, lw=2, label="只有截断（∝ h）")
ax.set_xscale("log"); ax.set_yscale("log")
h_star = np.sqrt(4 * 0.002 / (TH_MAX * LAM1 ** 2))
ax.axvline(h_star, color=C_INK, lw=1.2, ls=(0, (6, 4)))
ax.text(h_star * 1.08, 0.9, "最省的间隔\nh ≈ %.3f" % h_star, color=C_INK, fontproperties=zh_xs)
ax.set_xlabel("采样间隔 h（秒）", fontproperties=zh_sm, color=C_SOFT)
ax.set_ylabel("速度的最大误差", fontproperties=zh_sm, color=C_SOFT)
ax.set_facecolor(C_BG)
ax.tick_params(colors=C_SOFT, labelsize=8)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
for s in ["left", "bottom"]: ax.spines[s].set_color(C_AXIS)
ax.grid(True, color=C_GRID, lw=0.8); ax.set_axisbelow(True)
lg = ax.legend(prop=zh_xs, frameon=False, loc="upper center")
for t in lg.get_texts(): t.set_color(C_INK)
ax.set_title("间隔小下去：一头变小，一头变大——没有「越精细越好」", fontproperties=zh, color=C_INK, fontsize=11)
save(fig, "fig03-差分的两头夹.png")


# ============================================================
# 04 影子不纠正
# ============================================================
x0 = vec(1.0, 0.5)
xh0 = vec(1.12, 0.42)
ts, tr, er, enorm = shadow_run(A, CV_TH, vec(0, 0), x0, xh0, 3.0, 300)
fig = new_fig((7.8, 4.5)); ax = fig.add_subplot(111)
ax.semilogy(ts, enorm, color=C_RED, lw=2.4, label="偏差有多大（数值）")
ax.semilogy(ts, enorm[0] * np.exp(LAM1 * ts), color=C_INK, lw=1.3, ls=(0, (6, 4)),
            label="e^{λ1t}·初值差（解析）")
ax.set_xlabel("时间（秒）", fontproperties=zh_sm, color=C_SOFT)
ax.set_ylabel("偏差", fontproperties=zh_sm, color=C_SOFT)
ax.set_facecolor(C_BG); ax.tick_params(colors=C_SOFT, labelsize=8)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
for s in ["left", "bottom"]: ax.spines[s].set_color(C_AXIS)
ax.grid(True, which="both", color=C_GRID, lw=0.7); ax.set_axisbelow(True)
lg = ax.legend(prop=zh_xs, frameon=False, loc="lower right")
for t in lg.get_texts(): t.set_color(C_INK)
ax.set_title("不纠正：偏差按棍子自己的倍数长（半对数图上是一条直线）", fontproperties=zh, color=C_INK, fontsize=11)
save(fig, "fig04-影子不纠正.png")


# ============================================================
# 05 影子纠正
# ============================================================
fig = new_fig((7.8, 4.5)); ax = fig.add_subplot(111)
for g, col, lb in ((0, C_RED, "L = (0, 0)：不纠正"), (1, C_SUM, "L = (1, 1)"),
                   (3, C_U, "L = (3, 1)"), (5, C_V, "L = (5, 5)")):
    ts2, tr2, er2, e2 = shadow_run(A, CV_TH, vec(g, g), x0, xh0, 3.0, 300)
    ax.plot(ts2, e2, color=col, lw=2.2, label=lb)
ax.set_xlabel("时间（秒）", fontproperties=zh_sm, color=C_SOFT)
ax.set_ylabel("偏差", fontproperties=zh_sm, color=C_SOFT)
ax.set_facecolor(C_BG); ax.tick_params(colors=C_SOFT, labelsize=8)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
for s in ["left", "bottom"]: ax.spines[s].set_color(C_AXIS)
ax.grid(True, color=C_GRID, lw=0.7); ax.set_axisbelow(True)
lg = ax.legend(prop=zh_xs, frameon=False, loc="upper left")
for t in lg.get_texts(): t.set_color(C_INK)
ax.set_title("把读数差接回去：同一份初值差，四组纠正力度", fontproperties=zh, color=C_INK, fontsize=11)
save(fig, "fig05-影子纠正.png")


# ============================================================
# 06 稳定域地图（l1–l2 平面）
# ============================================================
fig = new_fig((8.2, 5.4)); ax = fig.add_subplot(111)
ax.set_facecolor(C_BG)
l1s = np.linspace(-1.6, 6.4, 240); l2s = np.linspace(-2.6, 8.4, 240)
L1, L2 = np.meshgrid(l1s, l2s)
Z = np.zeros_like(L1)
for i in range(L1.shape[0]):
    for j in range(L1.shape[1]):
        Z[i, j] = max_real(observe_mat(A, vec(L1[i, j], L2[i, j]), CV_TH))
ax.contourf(L1, L2, Z, levels=[-np.inf, -1e-6, 1e-6, np.inf],
            colors=[PALE_U, C_GRID, PALE_SUM], alpha=0.9)
ax.contour(L1, L2, Z, levels=[0], colors=[C_INK], linewidths=1.6)
ax.plot([-0.2, -0.2], [-2.6, 8.4], color=C_INK, lw=1.6, ls=(0, (6, 4)))
ax.plot(l1s, 1 - 0.2 * l1s, color=C_INK, lw=1.6, ls=(0, (6, 4)))
ax.set_xlim(-1.6, 6.4); ax.set_ylim(-2.6, 8.4)
ax.set_xlabel("l1（按读数差补到 θ）", fontproperties=zh_sm, color=C_SOFT)
ax.set_ylabel("l2（同一份差补到 ω）", fontproperties=zh_sm, color=C_SOFT)
ax.tick_params(colors=C_SOFT, labelsize=8)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
for s in ["left", "bottom"]: ax.spines[s].set_color(C_AXIS)
txt(ax, (3.2, 5.2), "两个倍数都在左半边\n（绿）", color=C_U, fp=zh_sm, ha="center")
txt(ax, (3.2, -1.6), "一正一负", color=C_RED, fp=zh_sm, ha="center")
txt(ax, (-1.1, 3.0), "落在零上", color=C_SUM, fp=zh_xs, ha="center", rot=90)
ax.set_title("纠正两笔的稳定域：l1 ＞ −c，且 l1c + l2 ＞ a", fontproperties=zh, color=C_INK, fontsize=11)
save(fig, "fig06-稳定域.png")


# ============================================================
# 07 和与积：两句话定生死
# ============================================================
fig = new_fig((8.6, 4.6)); ax = fig.add_subplot(111)
ax.set_xlim(-2.2, 6.2); ax.set_ylim(-3.0, 8.0)
ax.set_facecolor(C_BG)
ax.fill_between([-0.2, 6.2], [1 - 0.2 * (-0.2)] * 2, [8.0] * 2, color=PALE_U, zorder=1)
ax.plot([-0.2, -0.2], [-3.0, 8.0], color=C_INK, lw=1.8)
ax.plot([-2.2, 6.2], 1 - 0.2 * np.array([-2.2, 6.2]), color=C_INK, lw=1.8)
txt(ax, (-0.15, 6.8), "和 ＝ −(l1+c) ＝ 0\n→ l1 ＝ −c", color=C_INK, fp=zh_xs, ha="left")
txt(ax, (2.2, 0.15), "积 ＝ l1c + l2 − a ＝ 0\n→ l2 ＝ a − c·l1", color=C_INK, fp=zh_xs)
txt(ax, (3.0, 5.6), "两条都过：偏差自己回来", color=C_U, fp=zh_sm, ha="center")
txt(ax, (3.0, -2.3), "积为负：一正一负，跑", color=C_RED, fp=zh_sm, ha="center")
txt(ax, (-1.2, 4.0), "和为正：\n两个一起跑", color=C_RED, fp=zh_xs, ha="center")
ax.set_xlabel("l1", fontproperties=zh_sm, color=C_SOFT)
ax.set_ylabel("l2", fontproperties=zh_sm, color=C_SOFT)
ax.tick_params(colors=C_SOFT, labelsize=8)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
for s in ["left", "bottom"]: ax.spines[s].set_color(C_AXIS)
ax.grid(True, color=C_GRID, lw=0.8); ax.set_axisbelow(True)
ax.set_title("判据不是一串数，是两条直线：右上方那一片才是「回」", fontproperties=zh, color=C_INK, fontsize=11)
save(fig, "fig07-和与积.png")


# ============================================================
# 08 两条算路
# ============================================================
roots_ab, lams = [], []
rngv = np.random.default_rng(7)
for _ in range(160):
    l1 = rngv.uniform(-2, 6); l2 = rngv.uniform(-3, 8)
    M = observe_mat(A, vec(l1, l2), CV_TH)
    s = -trace(M); p = det(M); disc = s * s - 4 * p
    if disc < 0: continue
    rr = [(-s + np.sqrt(disc)) / 2, (-s - np.sqrt(disc)) / 2]
    e = eigen(M)
    if e["type"] != "real": continue
    lams += [e["l1"], e["l2"]]; roots_ab += rr
fig = new_fig((6.6, 5.2)); ax = fig.add_subplot(111)
ax.plot([-5, 9], [-5, 9], color=C_INK, lw=1.2, ls=(0, (5, 4)))
ax.scatter(roots_ab, lams, s=14, color=C_U, alpha=0.75, edgecolors="none")
ax.set_xlabel("拿「和」与「积」解二次方程得到的根", fontproperties=zh_sm, color=C_SOFT)
ax.set_ylabel("直接对表算出的两个倍数", fontproperties=zh_sm, color=C_SOFT)
ax.set_xlim(-5, 9); ax.set_ylim(-5, 9)
ax.set_facecolor(C_BG); ax.tick_params(colors=C_SOFT, labelsize=8)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
for s in ["left", "bottom"]: ax.spines[s].set_color(C_AXIS)
ax.grid(True, color=C_GRID, lw=0.8); ax.set_axisbelow(True)
dev = float(np.max(np.abs(np.array(roots_ab) - np.array(lams))))
txt(ax, (-4.3, 6.4), "两条互不相通的路\n%d 个点全部落在斜线上\n最大偏差 %.1e" % (len(lams), dev),
    color=C_INK, fp=zh_sm)
ax.set_title("同一个答案，两条算路", fontproperties=zh, color=C_INK, fontsize=11)
save(fig, "fig08-两条算路.png")


# ============================================================
# 09 复平面：把倍数搬到左半边
# ============================================================
fig = new_fig((7.2, 5.4)); ax = fig.add_subplot(111)
ax.axvspan(-6.5, 0, color=PALE_U, zorder=1)
for g in (0, 1, 2, 3, 4, 5, 6):
    e = eigen(observe_mat(A, vec(g, g), CV_TH))
    if e["type"] == "real":
        ax.scatter([e["l1"], e["l2"]], [0, 0], s=42, color=C_U if e["l1"] < 0 else C_RED, zorder=4)
        ax.annotate("", xy=(e["l1"], 0), xytext=(e["l1"] * 1.12, 0),
                    arrowprops=dict(arrowstyle="->", color=C_SOFT, lw=0.8))
    else:
        ax.scatter([e["re"], e["re"]], [e["im"], -e["im"]], s=42, color=C_V, zorder=4)
ax.axvline(0, color=C_INK, lw=1.4)
ax.set_xlim(-5.2, 2.2); ax.set_ylim(-3.2, 3.2)
ax.set_xlabel("实部", fontproperties=zh_sm, color=C_SOFT)
ax.set_ylabel("虚部", fontproperties=zh_sm, color=C_SOFT)
ax.set_facecolor(C_BG); ax.tick_params(colors=C_SOFT, labelsize=8)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
for s in ["left", "bottom"]: ax.spines[s].set_color(C_AXIS)
txt(ax, (-5.0, 2.6), "左半边：自己回来", color=C_U, fp=zh_sm)
txt(ax, (0.15, 2.6), "右半边：跑", color=C_RED, fp=zh_sm)
txt(ax, (-4.9, -2.6), "L 从 (0,0) 一路加到 (6,6)：两个倍数先挤到一处，再一起往左走",
    color=C_INK, fp=zh_xs)
ax.set_title("纠正做的事：把偏差的两个倍数搬进左半边", fontproperties=zh, color=C_INK, fontsize=11)
save(fig, "fig09-复平面搬家.png")


# ============================================================
# 10 测的方向：等值线跟着转
# ============================================================
fig = new_fig((11.0, 4.2))
angles = [0, 30, 42.1]
for k, deg in enumerate(angles):
    axp = fig.add_axes([0.035 + k * 0.325, 0.06, 0.28, 0.84])
    style_ax(axp, (-3, 3), (-2.6, 2.6), "θ" if k == 1 else None, "ω" if k == 0 else None, step=1)
    r = np.deg2rad(deg); cvv = vec(np.cos(r), np.sin(r))
    if cvv[1] < 0: cvv = -cvv
    perp = vec(-cvv[1], cvv[0])
    for kk in np.arange(-3, 3.1, 0.9):
        b = cvv * kk
        seg(axp, b - perp * 4, b + perp * 4, color=C_AXIS, lw=0.9, ls=(0, (3, 4)), alpha=0.65)
    arrow(axp, (0, 0), cvv * 1.5, color=C_V, lw=2.2)
    txt(axp, cvv * 1.55, "读数方向", color=C_V, fp=zh_xs, dx=0.05 if cvv[0] >= 0 else -0.05,
        ha="left" if cvv[0] >= 0 else "right")
    bd = blind_dir(A, cvv)
    if bd:
        line_full(axp, bd[0], (-3, 3), (-2.6, 2.6), C_PUR, lw=3.4, ls=(0, (8, 4)))
        txt(axp, bd[0] * 1.75, "它既是特征方向\n又是一条等值线", color=C_PUR, fp=zh_xs,
            dx=-0.05 if bd[0][0] > 0 else 0.05, ha="right" if bd[0][0] > 0 else "left")
    axp.set_title("c 的角度 %g°" % deg, fontproperties=zh_sm, color=C_INK, fontsize=10)
fig.suptitle("读数方向一转，等值线跟着转；转到某个角度，一条特征线整条躺进等值线里",
             fontproperties=zh, color=C_INK, fontsize=11, y=0.985)
save(fig, "fig10-测的方向.png")


# ============================================================
# 11 盲方向那一帧（放大）
# ============================================================
fig, ax = new_ax(figsize=(8.2, 5.4), xlim=(-3.2, 3.2), ylim=(-2.6, 2.6), xlabel="θ", ylabel="ω")
# 先铺一条"读数相同的带子"：它就是那条等值线，红线整个躺在里面
line_full(ax, E["v1"], (-3.2, 3.2), (-2.6, 2.6), C_GRID, lw=15, ls="-", alpha=0.9, z=1)
line_full(ax, E["v1"], (-3.2, 3.2), (-2.6, 2.6), C_RED, lw=2.6, ls="-", z=3)
line_full(ax, E["v2"], (-3.2, 3.2), (-2.6, 2.6), C_V, lw=2.4, ls="-", z=3)
perp = vec(-VE[1], VE[0]); perp = perp / np.hypot(*perp)
for kk in np.arange(-3, 3.1, 0.9):
    b = (VE / np.hypot(*VE)) * kk
    seg(ax, b - perp * 5, b + perp * 5, color=C_AXIS, lw=1.0, ls=(0, (3, 4)), alpha=0.7)
arrow(ax, (0, 0), (VE / np.hypot(*VE)) * 1.35, color=C_V, lw=2.6, z=5)
txt(ax, (VE / np.hypot(*VE)) * 1.42, "读数方向 c", color=C_V, fp=zh_sm, dx=0.14, dy=-0.34)
txt(ax, (0.25, 2.15), "红线正躺在一条等值线上：\n沿它走，读数一点不变", color=C_RED, fp=zh_sm)
txt(ax, (-3.05, 1.65), "灰带 ＝ 同一条等值线", color=C_SOFT, fp=zh_xs)
fig.text(0.5, 0.015, "读数 ＝ C·x 只量到「沿 c 的那一份」；垂直于 c 的那一份整个没进来",
         color=C_INK, fontproperties=zh_xs, ha="center")
save(fig, "fig11-盲方向.png")


# ============================================================
# 12 钉子：有一个倍数怎么调都不动
# ============================================================
fig = new_fig((8.0, 4.6)); ax = fig.add_subplot(111)
gs = np.linspace(0, 60, 200)
for lbl, cvv, col in (("测 θ（看得见两条方向）", CV_TH, C_U), ("测的方向与 v1 垂直（盲）", VE / np.hypot(*VE), C_PUR)):
    hi, lo = [], []
    for g in gs:
        e = eigen(observe_mat(A, vec(g, g), cvv))
        pair = sorted([e["l1"], e["l2"]]) if e["type"] == "real" else [e["re"], e["re"]]
        hi.append(pair[1]); lo.append(pair[0])
    ax.plot(gs, hi, color=col, lw=2.2, label=lbl + "：大的那个")
    ax.plot(gs, lo, color=col, lw=2.2, ls=(0, (5, 4)), label=lbl + "：小的那个")
ax.axhline(0, color=C_INK, lw=1.2)
ax.axhline(LAM1, color=C_RED, lw=1.2, ls=(0, (1, 3)))
txt(ax, (1.0, LAM1 + 0.35), "λ1 ＝ +0.905：怎么加力都不动", color=C_RED, fp=zh_xs)
ax.set_xlabel("L 的两笔一起放大：L ＝ (g, g)", fontproperties=zh_sm, color=C_SOFT)
ax.set_ylabel("两个倍数", fontproperties=zh_sm, color=C_SOFT)
ax.set_facecolor(C_BG); ax.tick_params(colors=C_SOFT, labelsize=8)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
for s in ["left", "bottom"]: ax.spines[s].set_color(C_AXIS)
ax.grid(True, color=C_GRID, lw=0.8); ax.set_axisbelow(True)
lg = ax.legend(prop=zh_xs, frameon=False, loc="lower left")
for t in lg.get_texts(): t.set_color(C_INK)
ax.set_title("紫线里有一条从头到尾是平的：它对应的方向没进读数", fontproperties=zh, color=C_INK, fontsize=11)
save(fig, "fig12-钉子.png")


# ============================================================
# 13 detO 随角度：两处塌缩
# ============================================================
fig = new_fig((8.4, 4.4)); ax = fig.add_subplot(111)
degs = np.linspace(0, 180, 721)
vals = []
for d in degs:
    r = np.deg2rad(d); cvv = vec(np.cos(r), np.sin(r))
    vals.append(det(obs_matrix(A, cvv)))
vals = np.array(vals)
ax.plot(degs, vals, color=C_U, lw=2.2)
ax.axhline(0, color=C_INK, lw=1.2)
blinds = [42.1, 180 - 42.1]
for b in blinds:
    ax.axvline(b, color=C_PUR, lw=1.4, ls=(0, (5, 4)))
    ax.text(b + 2, 0.55, "%g°" % b, color=C_PUR, fontproperties=mono_sm)
ax.set_xlabel("读数方向 c 的角度（度）", fontproperties=zh_sm, color=C_SOFT)
ax.set_ylabel("O 的交叉相减", fontproperties=zh_sm, color=C_SOFT)
ax.set_facecolor(C_BG); ax.tick_params(colors=C_SOFT, labelsize=8)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
for s in ["left", "bottom"]: ax.spines[s].set_color(C_AXIS)
ax.grid(True, color=C_GRID, lw=0.8); ax.set_axisbelow(True)
txt(ax, (60, 0.85), "过零处：有一个方向永远看不见", color=C_PUR, fp=zh_sm)
ax.set_title("看得清不清，是一条曲线上的两个零点", fontproperties=zh, color=C_INK, fontsize=11)
save(fig, "fig13-detO随角度.png")


# ============================================================
# 14 落点：测什么，比算什么更值钱
# ============================================================
fig = new_fig((10.6, 4.4)); ax = fig.add_axes([0, 0, 1, 1]); ax.axis("off")
ax.set_xlim(0, 10.6); ax.set_ylim(0, 4.4)
ax.text(0.4, 3.95, "同一根棍子，四种测法：能挪动的倍数有几个", color=C_INK, fontproperties=zh_title)
rows = [("只测 θ", CV_TH, (4.2, 1.0)), ("测 θ 与 ω 的混合", vec(1, 1), (5.0, 1.0)),
        ("测 2θ − ω（混合，比例不同）", vec(2, -1), (5.0, 1.0)),
        ("测的方向与 v1 垂直", VE / np.hypot(*VE), (60.0, 60.0))]
for i, (name, cvv, l) in enumerate(rows):
    y = 3.30 - i * 0.78
    ax.text(0.4, y, name, color=C_INK, fontproperties=zh_sm, va="center")
    e0 = eigen(observe_mat(A, vec(0, 0), cvv))
    e1 = eigen(observe_mat(A, vec(l[0], l[1]), cvv))
    p0 = sorted([e0["l1"], e0["l2"]]) if e0["type"] == "real" else [e0["re"], e0["re"]]
    p1 = sorted([e1["l1"], e1["l2"]]) if e1["type"] == "real" else [e1["re"], e1["re"]]
    movers = int(abs(p1[0] - p0[0]) > 1e-6) + int(abs(p1[1] - p0[1]) > 1e-6)
    ax.text(4.95, y, "L=(0,0) → %+.3f / %+.3f" % (p0[0], p0[1]), color=C_SOFT, fontproperties=mono_sm, va="center")
    ax.text(7.35, y, "L=(%g,%g) → %+.3f / %+.3f" % (l[0], l[1], p1[0], p1[1]), color=C_SOFT, fontproperties=mono_sm, va="center")
    ax.add_patch(Circle((9.95, y), 0.19, facecolor=PALE_U if movers == 2 else PALE_SUM, edgecolor="none"))
    ax.text(9.95, y, "%d" % movers, color=C_U if movers == 2 else C_SUM, fontproperties=mono, ha="center", va="center")
ax.text(9.7, 3.80, "能挪动几个", color=C_SOFT, fontproperties=zh_xs, ha="right")
ax.text(0.4, 0.30, "最后一行的力度开到 (60, 60)——比第一行大二十倍——那个 +0.905 仍然一动不动。问题不在力，在测的方向。",
        color=C_INK, fontproperties=zh)
save(fig, "fig14-落点.png")

print("\n全部配图完成，共 14 张，输出目录：", OUT)
