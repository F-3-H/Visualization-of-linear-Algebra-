# ============================================================
# tools/render_figures_control.py —— 《让会倒的东西站住》配图渲染器
#
# 与 控制项目/assets/core.js 同一套数学（此处为 Python 镜像），
# 与项目同一套配色（浅色纸面，取自 assets/theme.css）。
# 图即项目输出，不是另画的示意图：正文里每一张图，都能在
# 控制项目的五个视角里找到同一套数学算出的对应物。
#
# 跑法：python tools/render_figures_control.py
# 输出：控制图/  （正文里 14 处 ![](控制图/figNN-….png) 的名字与顺序由它定死）
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
# 跑法：python tools/render_figures_control.py              → 控制图/
#       FIG_THEME=dark python tools/render_figures_control.py → 控制图-dark/
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
OUT    = os.path.join(os.path.dirname(HERE), "控制图")

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
    OUT = os.path.join(os.path.dirname(HERE), "控制图-dark")

os.makedirs(OUT, exist_ok=True)

zh = FontProperties(fname=r"C:\Windows\Fonts\msyh.ttc", size=12)
zh_sm = FontProperties(fname=r"C:\Windows\Fonts\msyh.ttc", size=10.5)
zh_xs = FontProperties(fname=r"C:\Windows\Fonts\msyh.ttc", size=9.5)
zh_title = FontProperties(fname=r"C:\Windows\Fonts\msyhbd.ttc", size=13.5)
# 等宽字体是给数字和 βγθω 这类符号用的，但读数里难免夹一个中文词
# （"第一行"、"λ₁"），所以族里带上雅黑做回退，否则缺字形会被画成空白方块。
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

# 这一篇的主角：a ＝ 1、c ＝ 0.2 的棍子（与五个视角里的默认值一致）
A_STICK = stick_mat(1, 0.2)
E_STICK = eigen(A_STICK)          # λ ≈ +0.90 / −1.10
LAM_RUN, LAM_BACK = E_STICK["l1"], E_STICK["l2"]
V_RUN, V_BACK = E_STICK["v1"], E_STICK["v2"]

# ============================================================
# 图 01 · 棍子此刻的样子：两个数并排，就是一支箭头
# ============================================================
fig = new_fig((9.8, 4.4))
# 左：立在掌心的棍子
axL = fig.add_axes([0.02, 0.06, 0.40, 0.88]); axL.set_xlim(-2.1, 2.3); axL.set_ylim(-1.3, 3.1)
axL.set_aspect("equal"); axL.axis("off")
seg(axL, (-1.5, 0), (1.5, 0), color=C_INK, lw=5, z=4)          # 掌心
seg(axL, (-1.9, -0.16), (1.9, -0.16), color=C_GHOST, lw=3, z=3)
txt(axL, (1.55, -0.32), "掌心", color=C_SOFT, dx=0.06)
th = 0.52
L = 2.25
tip = np.array([L * np.sin(th), L * np.cos(th)])
seg(axL, (0, 0), (0, L), color=C_GHOST, ls=(0, (4, 3)), lw=1.3, z=2)   # 竖着的参考线
arrow(axL, (0, 0), tip, color=C_INK, lw=4.2, z=4)
dot(axL, (0, 0), C_INK, r=0.055)
axL.add_patch(Arc((0, 0), 1.05, 1.05, angle=0, theta1=90 - th * 180 / np.pi, theta2=90,
                  color=C_SUM, lw=1.6))
txt(axL, (0.30, 1.20), "θ", color=C_SUM, fp=mono)
axL.add_patch(Arc(tip, 0.72, 0.72, angle=0, theta1=-40, theta2=50, color=C_V, lw=1.8,
                  ls=(0, (3, 2))))
arrow(axL, tip + np.array([0.30, 0.34]), tip + np.array([0.66, 0.06]), color=C_V, lw=1.8, z=5)
txt(axL, tip, "ω", color=C_V, fp=mono, dx=0.42, dy=0.40)
txt(axL, (0.16, 2.95), "在掌心立一根棍子：它此刻的样子是两个数", color=C_INK, fp=zh)

# 右：相平面上的一支箭头
axR = fig.add_axes([0.50, 0.10, 0.48, 0.80])
style_ax(axR, (-2.6, 2.6), (-2.6, 2.6), "θ（歪了多少）", "ω（歪得多快）")
p = vec(0.95, 1.75)
seg(axR, (p[0], 0), p, color=C_GHOST, ls=(0, (4, 3)), lw=1.2, z=2)
seg(axR, (0, p[1]), p, color=C_GHOST, ls=(0, (4, 3)), lw=1.2, z=2)
arrow(axR, (0, 0), p, color=C_U, lw=3.0, z=4)
dot(axR, p, C_U, r=0.07)
txt(axR, p, "（0.95，1.75）", color=C_U, dx=0.14, dy=-0.30)
txt(axR, (0.48, -0.34), "歪了多少", color=C_GHOST, ha="center")
txt(axR, (-0.16, 0.88), "歪得多快", color=C_GHOST, ha="right")
txt(axR, (-2.5, 2.35), "两个数并排放，\n从来都是一支从原点出发的箭头", color=C_INK, fp=zh)
save(fig, "fig01-棍子与两个数.png")

# ============================================================
# 图 02 · 一张表的两行：一捆数进去，一捆数出来
# ============================================================
fig = new_fig((9.8, 4.0))
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 12); ax.set_ylim(0, 5); ax.axis("off")
arrow(ax, (0.5, 2.5), (2.5, 2.5), color=C_U, lw=3.2)
txt(ax, (0.5, 3.35), "进来一捆：", color=C_INK, fp=zh)
txt(ax, (0.5, 2.85), "(θ, ω)", color=C_U, fp=mono)
box = Rectangle((3.0, 1.35), 4.6, 2.3, facecolor=C_PANEL, edgecolor=C_AXIS, lw=1.5, zorder=3)
ax.add_patch(box)
txt(ax, (3.25, 3.28), "一张表（a、c 决定）", color=C_SOFT)
seg(ax, (3.15, 2.85), (7.45, 2.85), color=C_GRID, lw=1.2, z=4)
txt(ax, (3.30, 2.52), "第一行", color=C_GHOST, fp=zh_xs, z=5)
txt(ax, (4.55, 2.52), "θ′ = ω", color=C_PUR, fp=mono, z=5)
txt(ax, (3.30, 1.78), "第二行", color=C_GHOST, fp=zh_xs, z=5)
txt(ax, (4.55, 1.78), "ω′ = aθ − cω", color=C_PUR, fp=mono, z=5)
txt(ax, (7.30, 2.52), "管「歪了多少」", color=C_GHOST, ha="right", fp=zh_xs, z=5)
txt(ax, (7.30, 1.78), "管「歪得多快」", color=C_GHOST, ha="right", fp=zh_xs, z=5)
arrow(ax, (7.9, 2.5), (9.5, 2.5), color=C_PUR, lw=3.2)
txt(ax, (9.65, 3.35), "出去一捆：", color=C_INK, fp=zh)
txt(ax, (9.65, 2.85), "(θ′, ω′)", color=C_PUR, fp=mono)
txt(ax, (0.5, 0.62), "同一站里两行管两件事——第一行只是把角速度记下来，第二行才写着重力与阻尼在拔河",
    color=C_SOFT, fp=zh_sm)
save(fig, "fig02-表的两行.png")

# ============================================================
# 图 03 · 相流穿过两条直线：一条往外，一条往内
# ============================================================
R = 2.6
fig, ax = new_ax(figsize=(8.0, 5.4), xlim=(-4.0, 4.0), ylim=(-R, R), step=1)
seeds = [vec(R * 0.7 * np.cos(a), R * 0.7 * np.sin(a)) for a in np.linspace(0, 2 * np.pi, 14)[:-1]]
seeds += [vec(0.4, 0.4), vec(-0.4, 0.15), vec(0.15, -0.5), vec(-0.3, -0.3)]
for s0 in seeds:
    pts = traj(A_STICK, s0, 2.4, 96, R * 1.55)
    ax.plot(pts[:, 0], pts[:, 1], color=C_PUR, lw=1.3, alpha=0.7, zorder=2)
    dot(ax, s0, C_GHOST, r=0.045)
for f, col, lab in [((V_RUN), C_RED, "λ₁ = +0.90"), ((V_BACK), C_V, "λ₂ = −1.10")]:
    line_full(ax, f, (-4.0, 4.0), (-R, R), col, lw=1.4, alpha=0.75)
    tip = f * (R * 0.98)
    # 偏移是数据单位，不是像素：写成 ±8／−12，两个标签就被扔到画框外面去了，
    # bbox_inches="tight" 会把它们一起收进来，整张图下方空出一大片（图 03 的旧版就是这样）。
    txt(ax, tip, lab, color=col, fp=mono_sm, dx=0.14 if tip[0] >= 0 else -0.14, dy=-0.26,
        ha="left" if tip[0] >= 0 else "right")
txt(ax, (-3.95, 2.32), "红线上：越歪越快，笔直冲出去\n青线上：越转越慢，笔直缩回来\n别处的点：先绕一圈，再被红色那个方向甩掉",
    color=C_INK, fp=zh)
save(fig, "fig03-相流与两条线.png")

# ============================================================
# 图 04 · 在特征线上是直线，在别处是弯的
# ============================================================
fig = new_fig((9.8, 4.6))
axL_ = fig.add_axes([0.03, 0.10, 0.45, 0.80])
style_ax(axL_, (-2.6, 2.6), (-2.6, 2.6), "θ", "ω")
line_full(axL_, V_RUN, (-2.6, 2.6), (-2.6, 2.6), C_RED, lw=1.3, alpha=0.6)
line_full(axL_, V_BACK, (-2.6, 2.6), (-2.6, 2.6), C_V, lw=1.3, alpha=0.6)
s_run = V_RUN * 0.30; s_back = -V_BACK * 2.35
p_run = traj(A_STICK, s_run, 3.0, 120, 2.55); p_back = traj(A_STICK, s_back, 3.0, 120, 2.55)
axL_.plot(p_run[:, 0], p_run[:, 1], color=C_RED, lw=3.0, zorder=4)
axL_.plot(p_back[:, 0], p_back[:, 1], color=C_V, lw=3.0, zorder=4)
dot(axL_, s_run, C_RED, r=0.055); dot(axL_, s_back, C_V, r=0.055)
txt(axL_, s_run, "起点", color=C_RED, dx=-0.10, dy=-0.22, ha="right")
txt(axL_, s_back, "起点", color=C_V, dx=0.12, dy=0.22)
axL_.set_title("就在那两条线上：笔直地冲出去／缩回来", fontproperties=zh, color=C_INK, fontsize=11.5, pad=8)

axR_ = fig.add_axes([0.52, 0.10, 0.45, 0.80])
style_ax(axR_, (-2.6, 2.6), (-2.6, 2.6), "θ", "ω")
line_full(axR_, V_RUN, (-2.6, 2.6), (-2.6, 2.6), C_RED, lw=1.3, alpha=0.6)
line_full(axR_, V_BACK, (-2.6, 2.6), (-2.6, 2.6), C_V, lw=1.3, alpha=0.6)
s_off = vec(-0.55, 1.55)
p_off = traj(A_STICK, s_off, 3.2, 130, 2.55)
axR_.plot(p_off[:, 0], p_off[:, 1], color=C_PUR, lw=3.0, zorder=4)
dot(axR_, s_off, C_PUR, r=0.055)
txt(axR_, s_off, "起点", color=C_PUR, dx=-0.12, dy=0.20, ha="right")
txt(axR_, (1.15, 1.9), "绕一圈，\n再被甩出去", color=C_PUR, fp=zh)
axR_.set_title("只要离开这两条线：轨迹就弯了", fontproperties=zh, color=C_INK, fontsize=11.5, pad=8)
fig.suptitle("在那条线上 A·v = λv，走够 t 时间就是 e^(λt)·v——方向一刻没变，变的只是长短",
             fontproperties=zh, color=C_INK, fontsize=10.5, y=0.035)
save(fig, "fig04-直线与弯线.png")

# ============================================================
# 图 05 · 参数地图：每一格都是重新算出来的
# ============================================================
CW, AW = 3.5, 2.5          # 横轴 c ∈ [0, 3.5]，纵轴 a ∈ [−2.5, 2.5]
cols, rows = 200, 260
paper = np.array([int(C_BG[1:3], 16), int(C_BG[3:5], 16), int(C_BG[5:7], 16)], dtype=float)
C_RED_RGB = np.array([int(C_RED[1:3], 16), int(C_RED[3:5], 16), int(C_RED[5:7], 16)], dtype=float)
C_CYAN_RGB = np.array([int(C_V[1:3], 16), int(C_V[3:5], 16), int(C_V[5:7], 16)], dtype=float)
C_GRAY_RGB = np.array([int(C_SOFT[1:3], 16), int(C_SOFT[3:5], 16), int(C_SOFT[5:7], 16)], dtype=float)
img = np.zeros((rows, cols, 3), dtype=float)
for j in range(rows):
    aa = -AW + (j + 0.5) / rows * 2 * AW
    for i in range(cols):
        cc = (i + 0.5) / cols * CW
        mr = max_real(stick_mat(aa, cc))
        base = C_RED_RGB if mr > 0.005 else (C_CYAN_RGB if mr < -0.005 else C_GRAY_RGB)
        al = 0.20 if mr > 0.005 else (0.22 if mr < -0.005 else 0.22)
        img[j, i] = al * base + (1 - al) * paper
img /= 255.0

fig = new_fig((8.2, 5.2))
ax = fig.add_subplot(111)
style_ax(ax, (-0.02, CW), (-AW, AW), xlabel="c（阻尼）", ylabel="a（往外拉的劲）",
         step=1, ticks=True, grid=False)
ax.imshow(img, extent=[0, CW, -AW, AW], origin="lower", aspect="auto", zorder=1)
ax.axhline(0, color=C_INK, lw=1.6, ls=(0, (7, 5)), zorder=3)
ax.axvline(0, color=C_AXIS, lw=1.2, zorder=3)
txt(ax, (0.14, 2.28), "a ＞ 0：棍子朝上立着，非倒不可", color=C_RED, fp=zh, z=6)
txt(ax, (0.14, -2.34), "a ＜ 0：重锤挂在下面，自己会荡回来", color=C_V, fp=zh, z=6)
txt(ax, (2.62, 1.42), "红＝有一个正倍数", color=C_RED, fp=zh_sm, z=6)
txt(ax, (2.62, 1.06), "青＝两个都是负倍数", color=C_V, fp=zh_sm, z=6)
dot(ax, (0.2, 1.0), C_INK, r=0.05, z=7)
txt(ax, (0.2, 1.0), "这一篇开头那根棍子\n（a = 1，c = 0.2）", color=C_INK, dx=0.10, dy=0.30, fp=zh_xs, z=7)
ax.set_title("分界线正好落在 a ＝ 0 上：det = −a，两种颜色只差一个符号",
             fontproperties=zh, color=C_INK, fontsize=11.5, pad=10)
save(fig, "fig05-参数地图.png")

# ============================================================
# 图 06 · 阻尼从 0.2 加到 10：正的那个越来越小，永远在 0 上方
# ============================================================
fig = new_fig((8.2, 4.4))
ax = fig.add_subplot(111)
ax.set_facecolor(C_BG)
cs = np.linspace(0.05, 10, 600)
mr = np.array([max_real(stick_mat(1, c)) for c in cs])
ax.plot(cs, mr, color=C_RED, lw=2.6, zorder=3)
ax.axhline(0, color=C_INK, lw=1.4, ls=(0, (7, 5)), zorder=2)
ax.set_xlim(-0.4, 10.6); ax.set_ylim(-0.35, 1.05)
ax.spines[["top", "right"]].set_visible(False)
for s in ["left", "bottom"]:
    ax.spines[s].set_color(C_AXIS)
ax.tick_params(colors=C_SOFT, labelsize=8, length=3)
ax.grid(True, color=C_GRID, linewidth=0.8); ax.set_axisbelow(True)
ax.set_xlabel("c（阻尼，把棍子泡进越来越稠的糖浆）", fontproperties=zh_sm, color=C_SOFT)
ax.set_ylabel("最大实部", fontproperties=zh_sm, color=C_SOFT)
for c0, dy in [(0.2, 0.10), (10, 0.12)]:
    m0 = max_real(stick_mat(1, c0))
    dot(ax, (c0, m0), C_RED, r=0.07, z=5)
    txt(ax, (c0, m0), "c = %g：+%.3f" % (c0, m0), color=C_RED, fp=mono_sm,
        dx=0.22 if c0 < 5 else -0.22, dy=dy, ha="left" if c0 < 5 else "right")
txt(ax, (5.4, 0.10), "这条线一直往下走，越走越慢，永远不碰到零——\n量变一直积累，却没有那个质变的点",
    color=C_SOFT, fp=zh)
txt(ax, (5.4, 0.72), "正数一直在变小：0.90 → 0.099", color=C_RED, fp=zh)
ax.set_title("阻尼不是外因，它是内因之一；可把它连续地改下去，只是一次量变",
             fontproperties=zh, color=C_INK, fontsize=11.5, pad=10)
save(fig, "fig06-阻尼救不了.png")

# ============================================================
# 图 07 · 眼睛看见歪了，手跟着走——一条正在被接起来的线
# ============================================================
fig = new_fig((10.4, 4.2))
# 左：立棍子的那张速写
axL = fig.add_axes([0.01, 0.05, 0.31, 0.90]); axL.set_xlim(-2.2, 2.6); axL.set_ylim(-0.6, 4.4)
axL.set_aspect("equal"); axL.axis("off")
seg(axL, (-1.1, 0), (1.1, 0), color=C_INK, lw=5, z=4)
th = 0.36; L = 2.5
tip = np.array([L * np.sin(th), L * np.cos(th)])
seg(axL, (0, 0), (0, L + 0.2), color=C_GHOST, ls=(0, (4, 3)), lw=1.2, z=2)
arrow(axL, (0, 0), tip, color=C_INK, lw=4.2, z=4)
axL.add_patch(Arc((0, 0), 0.9, 0.9, angle=0, theta1=90 - th * 180 / np.pi, theta2=90,
                  color=C_SUM, lw=1.5))
txt(axL, (0.22, 1.30), "θ", color=C_SUM, fp=mono)
axL.add_patch(Circle((2.12, 2.55), 0.30, facecolor="none", edgecolor=C_SOFT, lw=1.6, zorder=5))
axL.add_patch(Circle((2.20, 2.55), 0.10, color=C_SOFT, zorder=6))
seg(axL, (1.55, 2.55), (1.82, 2.55), color=C_SOFT, lw=1.4, z=5)
txt(axL, (2.12, 3.05), "眼睛", color=C_SOFT, ha="center")
arrow(axL, tip + np.array([0.10, -0.18]), tip + np.array([0.72, -0.30]), color=C_U, lw=1.8, z=6)
arrow(axL, (0, 0.30), np.array([0.52, 0.62]), color=C_U, lw=2.2, z=6)
txt(axL, (0.62, 0.52), "手", color=C_U, fp=zh)
txt(axL, (-2.1, 4.10), "三秒钟里他做几十下，\n自己不知道在做什么数学", color=C_INK, fp=zh_xs)
# 右：一个圈
axR = fig.add_axes([0.34, 0.02, 0.65, 0.96]); axR.set_xlim(0, 10); axR.set_ylim(0, 6); axR.axis("off")
def bbox(x, y, w, h, title, lines, color):
    axR.add_patch(Rectangle((x, y), w, h, facecolor=C_PANEL, edgecolor=C_AXIS, lw=1.4, zorder=3))
    txt(axR, (x + 0.22, y + h - 0.42), title, color=C_INK, fp=zh, z=5)
    for i, s in enumerate(lines):
        txt(axR, (x + 0.22, y + h - 0.92 - i * 0.42), s, color=color, fp=mono_sm, z=5)
bbox(0.5, 3.6, 3.9, 1.9, "棍子这张表", ["θ′ = ω", "ω′ = aθ − cω"], C_PUR)
bbox(5.6, 3.6, 3.9, 1.9, "眼睛：量出偏差", ["θ（歪了多少）", "ω（歪得多快）"], C_U)
bbox(5.6, 0.5, 3.9, 1.9, "手：一股力", ["k₁·θ + k₂·ω", "按两笔分着使"], C_SUM)
arrow(axR, (4.5, 4.55), (5.5, 4.55), color=C_INK, lw=2.4)
arrow(axR, (7.55, 3.55), (7.55, 2.55), color=C_INK, lw=2.4)
arrow(axR, (5.5, 1.45), (4.5, 1.45), color=C_SUM, lw=2.6)
axR.plot([4.45, 4.45], [1.45, 4.55], color=C_SUM, lw=2.6, zorder=2)
arrow(axR, (4.45, 3.30), (4.45, 3.55), color=C_SUM, lw=2.6, z=3)
txt(axR, (4.60, 3.05), "减回表上：A → A − b k", color=C_SUM, fp=zh_sm, z=6)
txt(axR, (5.6, 0.26), "外因通过内因起作用——「通过」是一道减法", color=C_SOFT, fp=zh_xs, z=6)
save(fig, "fig07-手立棍子.png")

# ============================================================
# 图 08 · 接线改表：第二行被减掉了一截
# ============================================================
fig = new_fig((10.0, 4.4))
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 12); ax.set_ylim(0, 5.2); ax.axis("off")
# 一列 b，一行 k，外积
txt(ax, (0.35, 4.55), "一列 b（力从哪儿进去）", color=C_U, fp=zh_sm)
for i, v in enumerate([0, 1]):
    ax.add_patch(Rectangle((0.55, 3.05 - i * 0.85), 0.85, 0.75, facecolor=PALE_U,
                           edgecolor=C_U, lw=1.4, zorder=3))
    txt(ax, (0.975, 3.42 - i * 0.85), str(v), color=C_U, fp=mono, ha="center", z=5)
txt(ax, (0.35, 1.85), "b = (0, 1)", color=C_U, fp=mono_sm)
txt(ax, (2.05, 3.52), "×", color=C_INK, fp=zh)
txt(ax, (2.45, 4.55), "一行 k（使多大劲）", color=C_SUM, fp=zh_sm)
for i, v in enumerate(["k₁", "k₂"]):
    ax.add_patch(Rectangle((2.45 + i * 0.85, 3.55), 0.75, 0.75, facecolor=PALE_SUM,
                           edgecolor=C_SUM, lw=1.4, zorder=3))
    txt(ax, (2.825 + i * 0.85, 3.92), v, color=C_SUM, fp=mono, ha="center", z=5)
txt(ax, (2.45, 3.20), "k = (k₁, k₂)", color=C_SUM, fp=mono_sm)
# 外积 2×2
txt(ax, (4.55, 3.52), "＝", color=C_INK, fp=zh)
for i in range(2):
    for j in range(2):
        on = (i == 1)
        ax.add_patch(Rectangle((5.05 + j * 0.85, 3.55 - i * 0.85), 0.75, 0.75,
                               facecolor=PALE_PUR if on else C_PANEL,
                               edgecolor=C_PUR if on else C_GHOST, lw=1.4, zorder=3))
        txt(ax, (5.425 + j * 0.85, 3.92 - i * 0.85),
            ("k₁" if j == 0 else "k₂") if on else "0", color=C_PUR if on else C_GHOST,
            fp=mono, ha="center", z=5)
txt(ax, (5.05, 1.85), "只有第二行不是零：力只作用在「歪得多快」那一行",
    color=C_PUR, fp=zh_sm)
# 减在表上
txt(ax, (7.85, 3.92), "原表第二行", color=C_INK, fp=zh_sm, ha="center")
for j, v in enumerate(["a", "−c"]):
    ax.add_patch(Rectangle((7.15 + j * 0.85, 3.55), 0.75, 0.75, facecolor=C_PANEL,
                           edgecolor=C_AXIS, lw=1.4, zorder=3))
    txt(ax, (7.525 + j * 0.85, 3.92), v, color=C_INK, fp=mono, ha="center", z=5)
txt(ax, (9.05, 3.92), "−", color=C_INK, fp=zh)
for j, v in enumerate(["k₁", "k₂"]):
    ax.add_patch(Rectangle((9.35 + j * 0.85, 3.55), 0.75, 0.75, facecolor=PALE_SUM,
                           edgecolor=C_SUM, lw=1.4, zorder=3))
    txt(ax, (9.725 + j * 0.85, 3.92), v, color=C_SUM, fp=mono, ha="center", z=5)
txt(ax, (11.05, 3.92), "＝", color=C_INK, fp=zh, ha="center")
for j, v in enumerate(["a − k₁", "−c − k₂"]):
    ax.add_patch(Rectangle((11.1 + j * 0.92, 3.55), 0.86, 0.75, facecolor=PALE_V,
                           edgecolor=C_V, lw=1.4, zorder=3))
    txt(ax, (11.53 + j * 0.92, 3.92), v, color=C_V, fp=mono_sm, ha="center", z=5)
txt(ax, (7.15, 3.10), "第一行 (0, 1) 一个数都没动：力只从下面那行走", color=C_SOFT, fp=zh_sm)
txt(ax, (0.55, 1.05), "一列乘一行，减在那张表上——就减了这么一下，别的什么也没动。\n"
                     "引回来的那条线是外因；它一接上，就被吃进了那张表里，成了内因的一部分。",
    color=C_INK, fp=zh)
save(fig, "fig08-接线改表.png")

# ============================================================
# 图 09 · 开环与闭环：同一批起点，同一个画框
# ============================================================
R = 2.6
fig, ax = new_ax(figsize=(8.0, 5.4), xlim=(-4.0, 4.0), ylim=(-R, R), step=1)
seeds = [vec(1.25 * np.cos(a), 1.25 * np.sin(a)) for a in np.linspace(0, 2 * np.pi, 12)[:-1]]
seeds += [vec(0.45, 0.35), vec(-0.5, 0.2), vec(0.2, -0.6), vec(-0.35, -0.4)]
K_GOOD = vec(3, 2.8)
A_CL = close_loop(A_STICK, B_STICK, K_GOOD)
# 画序即语义：闭环（实线）先画，开环（虚线）后压
for s0 in seeds:
    pts = traj(A_CL, s0, 2.8, 100, R * 1.7)
    ax.plot(pts[:, 0], pts[:, 1], color=C_V, lw=2.0, alpha=0.92, zorder=2)
for s0 in seeds:
    pts = traj(A_STICK, s0, 2.8, 100, R * 1.7)
    ax.plot(pts[:, 0], pts[:, 1], color=C_RED, lw=1.2, alpha=0.55, ls=(0, (4, 4)), zorder=3)
for s0 in seeds:
    dot(ax, s0, C_GHOST, r=0.045)
dot(ax, (0, 0), C_INK, r=0.06)
txt(ax, (-3.95, 2.32), "红虚线：没接线（k = 0）——被红色那个方向甩出去\n"
                       "青实线：接上线（k = (3, 2.8)）——一律拐回原点\n"
                       "起点一模一样，画框一模一样，只有表变了",
    color=C_INK, fp=zh)
txt(ax, (-3.95, -2.30), "闭环第二行 (a−k₁, −c−k₂) = (1−3, −0.2−2.8) = (−2.0, −3.0)　"
                        "两个倍数 −1.00 与 −2.00", color=C_V, fp=zh_sm)
save(fig, "fig09-开环与闭环.png")

# ============================================================
# 图 10 · 两条互不相通的算路，给出同一个 k
# ============================================================
fig = new_fig((10.0, 4.2))
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 12); ax.set_ylim(0, 5); ax.axis("off")
def card(x, y, w, h, tag, formula, sub, color):
    ax.add_patch(Rectangle((x, y), w, h, facecolor=C_PANEL, edgecolor=C_AXIS, lw=1.4, zorder=3))
    txt(ax, (x + 0.25, y + h - 0.42), tag, color=color, fp=zh, z=5)
    txt(ax, (x + 0.25, y + h - 0.95), formula, color=C_INK, z=5)
    txt(ax, (x + 0.25, y + 0.34), sub, color=C_SOFT, fp=zh_xs, z=5)
card(0.3, 3.05, 4.5, 1.75, "算路一 · 从表出发",
     r"$k = e_2^{\top}\,C^{-1}\varphi(A)$", "把想要的方程代进表里算（拉杆公式）", C_PUR)
card(0.3, 0.35, 4.5, 1.75, "算路二 · 从系数出发",
     r"$k_1 = a + t,\;\; k_2 = -s - c$", "对着 λ² − sλ + t 一比系数就念出来", C_U)
ax.add_patch(Rectangle((8.4, 1.55), 3.2, 1.9, facecolor=PALE_V, edgecolor=C_V,
                       lw=1.8, zorder=3))
txt(ax, (10.0, 3.05), "同一个 k", color=C_V, fp=zh, ha="center", z=5)
txt(ax, (10.0, 2.45), "k = (3.000, 2.800)", color=C_V, fp=mono_sm, ha="center", z=5)
arrow(ax, (4.95, 3.92), (8.30, 3.05), color=C_PUR, lw=2.2, z=4)
arrow(ax, (4.95, 1.22), (8.30, 2.10), color=C_U, lw=2.2, z=4)
txt(ax, (0.3, 4.72), "想要 −1 与 −2：它们的和 s = −3、积 t = 2", color=C_INK, fp=zh)
txt(ax, (6.75, 1.05), "两条路一条从表出发、一条从数出发，\n答案分毫不差——这就是互证", color=C_SOFT, fp=zh_xs)
save(fig, "fig10-两条算路.png")

# ============================================================
# 图 11 · 复平面两半：把倍数从右边搬进来
# ============================================================
fig = new_fig((8.4, 5.0))
ax = fig.add_subplot(111)
XL, YL = (-3.6, 1.9), (-2.6, 2.6)
style_ax(ax, XL, YL, xlabel="实部", ylabel="虚部", step=1)
# 左右两半的底色：算出来的判据，不是装饰
ax.axvspan(XL[0], 0, color=C_V, alpha=0.085, zorder=0)
ax.axvspan(0, XL[1], color=C_RED, alpha=0.085, zorder=0)
ax.axvline(0, color=C_INK, lw=1.7, ls=(0, (7, 5)), zorder=2)
txt(ax, (XL[0] + 0.16, 2.28), "实部 ＜ 0：自己回来", color=C_V, fp=zh, z=6)
txt(ax, (XL[1] - 0.16, 2.28), "实部 ＞ 0：自己跑掉", color=C_RED, fp=zh, ha="right", z=6)
# 原来那根棍子的两个倍数
cross(ax, (LAM_RUN, 0), 0.11, C_GHOST, 2.0, z=5)
cross(ax, (LAM_BACK, 0), 0.11, C_GHOST, 2.0, z=5)
txt(ax, (LAM_RUN, 0), "原来的 +0.90", color=C_SOFT, fp=zh_xs, dx=0.12, dy=0.24, z=6)
txt(ax, (LAM_BACK, 0), "原来的 −1.10", color=C_SOFT, fp=zh_xs, dx=0.12, dy=-0.26, z=6)
# 目标 −1 与 −2，实得与目标重合
for p in [vec(-1, 0), vec(-2, 0)]:
    cross(ax, p, 0.14, C_U, 2.6, z=6)
    ring(ax, p, 0.26, C_SUM, fill=(1, 0.902, 0.68, 0.45), lw=2.2, z=7)
txt(ax, (vec(-1, 0)), "○ 目标 −1　× 实得", color=C_U, fp=zh_xs, dx=0.18, dy=0.34, z=8)
arrow(ax, (0.82, 0.72), (-0.62, 0.42), color=C_INK, lw=1.8, ls=(0, (5, 4)), z=6)
txt(ax, (0.30, 0.95), "搬到左边去", color=C_INK, fp=zh_xs, z=6)
ax.set_title("把原来的 +0.90 拖进左半边：○ 是你要的，× 是闭环那张表算出来的，两个重合",
             fontproperties=zh, color=C_INK, fontsize=11, pad=10)
save(fig, "fig11-复平面两半.png")

# ============================================================
# 图 12 · 搬家：○ 与 × 重合；不共轭时就没有解
# ============================================================
def plane(ax, xlim, ylim):
    style_ax(ax, xlim, ylim, "实部", "虚部", step=1)
    ax.axvspan(xlim[0], 0, color=C_V, alpha=0.085, zorder=0)
    ax.axvspan(0, xlim[1], color=C_RED, alpha=0.085, zorder=0)
    ax.axvline(0, color=C_INK, lw=1.5, ls=(0, (7, 5)), zorder=2)

fig = new_fig((10.0, 4.8))
XL2, YL2 = (-3.4, 1.4), (-2.8, 2.8)
# 左：共轭一对 —— 有解
axA = fig.add_axes([0.05, 0.12, 0.42, 0.76]); plane(axA, XL2, YL2)
P, Q = vec(-1, 2), vec(-1, -2)
s_, t_ = P + Q, vec(P[0] * Q[0] - P[1] * Q[1], P[0] * Q[1] + P[1] * Q[0])
k_ = place_poles_st(A_STICK, B_STICK, s_[0], t_[0])
Acl_ = close_loop(A_STICK, B_STICK, k_)
ec_ = eigen(Acl_)
for p in [P, Q]:
    cross(axA, p, 0.13, C_U, 2.6, z=6)
    ring(axA, p, 0.25, C_SUM, fill=(1, 0.902, 0.68, 0.45), lw=2.2, z=7)
axA.set_title("共轭一对 −1 ± 2i：解得出来", fontproperties=zh, color=C_INK, fontsize=11.5, pad=8)
txt(axA, (XL2[0] + 0.14, YL2[1] - 0.32), "s = −2、t = 5，都是实数", color=C_SOFT, fp=zh_xs, z=6)
txt(axA, (1.28, -2.45), "k = (%.3f, %.3f)\n实得 −1.00 ± 2.00i" % (k_[0], k_[1]),
    color=C_U, fp=zh_xs, ha="right", z=6)
# 右：不共轭 —— 无解
axB = fig.add_axes([0.55, 0.12, 0.42, 0.76]); plane(axB, XL2, YL2)
P2, Q2 = vec(-1, 2), vec(-1.3, -1.6)
s2 = P2 + Q2; t2 = vec(P2[0] * Q2[0] - P2[1] * Q2[1], P2[0] * Q2[1] + P2[1] * Q2[0])
for p in [P2, Q2]:
    ring(axB, p, 0.25, C_SUM, fill=(1, 0.902, 0.68, 0.45), lw=2.2, z=7)
    dot(axB, p, C_SUM, r=0.05, z=7)
axB.set_title("不共轭的一对：结构上做不到", fontproperties=zh, color=C_INK, fontsize=11.5, pad=8)
txt(axB, (XL2[0] + 0.14, YL2[1] - 0.32), "s = −2.3+0.4i、t = 4.5−1.0i：带了虚部",
    color=C_RED, fp=zh_xs, z=6)
txt(axB, (XL2[1] - 0.14, -2.45), "四个数都是实的 → 两个根要么一对实数、\n要么一对共轭复数。不是力不够大。",
    color=C_SOFT, fp=zh_xs, ha="right", z=6)
save(fig, "fig12-搬家.png")

# ============================================================
# 图 13 · 平行四边形塌了：两支箭头张成的面积
# ============================================================
fig = new_fig((10.0, 5.0))
XL3, YL3 = (-1.8, 2.2), (-2.2, 2.6)
def para_panel(ax, b):
    style_ax(ax, XL3, YL3, "θ", "ω", step=1)
    ab = A_STICK @ b
    d = float(np.linalg.det(control_matrix(A_STICK, b)))
    ok = abs(d) > 1e-9
    poly = [vec(0, 0), b, b + ab, ab]
    ax.add_patch(Polygon(poly, closed=True,
                         facecolor=(0.486, 0.361, 0.749, 0.13) if ok else (0.839, 0.271, 0.271, 0.16),
                         edgecolor=C_PUR if ok else C_RED, lw=1.6, zorder=2))
    arrow(ax, (0, 0), b, color=C_U, lw=3.2, z=5)
    arrow(ax, (0, 0), ab, color=C_PUR, lw=2.6, z=5)
    dot(ax, b, C_U, r=0.06, z=6)
    txt(ax, b, "b", color=C_U, fp=mono, dx=0.10, dy=-0.22, z=6)
    txt(ax, ab, "A·b", color=C_PUR, fp=mono, dx=0.10, dy=0.20, z=6)
    return d, ok
axA = fig.add_axes([0.05, 0.10, 0.42, 0.78])
d1, ok1 = para_panel(axA, vec(0, 1))
axA.set_title("一般的 b：两列不平行，两个方向都够得着", fontproperties=zh, color=C_INK,
              fontsize=11, pad=8)
txt(axA, (XL3[0] + 0.10, YL3[1] - 0.32), "面积 = |det[b, A·b]| = %.2f" % abs(d1), color=C_PUR,
    fp=zh_xs, z=6)
axB = fig.add_axes([0.55, 0.10, 0.42, 0.78])
d2, ok2 = para_panel(axB, V_BACK)
axB.set_title("b 对准那条特征线：平行四边形扁成一条线段", fontproperties=zh, color=C_INK,
              fontsize=11, pad=8)
txt(axB, (XL3[0] + 0.10, YL3[1] - 0.32), "两列排成一条直线，面积成了零", color=C_RED, fp=zh_xs, z=6)
txt(axB, (XL3[1] - 0.10, -2.02), "det[b, A·b] = 0　→　有一个方向够不着，\n那个倍数搬不动",
    color=C_RED, fp=zh_xs, ha="right", z=6)
fig.suptitle("面积不为零 ⟺ 每个方向都够得着；面积塌成零 ⟺ 有一个方向，怎么使劲都够不着",
             fontproperties=zh, color=C_INK, fontsize=10.5, y=0.03)
save(fig, "fig13-平行四边形塌了.png")

# ============================================================
# 图 14 · 两处塌缩：一个还有救，一个没救
# ============================================================
PUSH_OK = vec(50, 50)         # 落在"跑"那条线上：另一个（会跑的那个）照样搬得动
PUSH_NO = vec(1000, 1000)     # 落在"回"那条线上：硬使劲也没用

def after_pair(b, k):
    """硬使劲 k 之后，闭环那两个倍数（摆成实数对）。"""
    e = eigen(close_loop(A_STICK, b, k))
    if e["type"] == "real":
        return [e["l1"], e["l2"]]
    if e["type"] == "complex":
        return [e["re"], e["re"]]
    return [e["l"], e["l"]]

# 结论由左特征向量定：b ∝ v_j 时，够不着的是 w_i·b ＝ 0 的那一个模式（i ≠ j）。
#   b 落在「跑」那条线（λ₁ = +0.905）上 → 够不着的是 −1.105（本来就会回来的那个）→ 还救得回来
#   b 落在「回」那条线（λ₂ = −1.105）上 → 够不着的是 +0.905（会跑的那个）      → 没救
AFTER_RUNLINE = after_pair(V_RUN, PUSH_OK)     # 落在跑线上，硬使劲
AFTER_BACKLINE = after_pair(V_BACK, PUSH_NO)   # 落在回线上，硬使劲
print("fig14 复算：b 落在「跑」线上、k=(50,50)     → %+.4f 与 %+.4f" % tuple(AFTER_RUNLINE))
print("fig14 复算：b 落在「回」线上、k=(1000,1000) → %+.4f 与 %+.4f" % tuple(AFTER_BACKLINE))

fig = new_fig((10.6, 4.6))

def chip(ax, x, y, w, text, color, ringed=False):
    ax.add_patch(Rectangle((x, y), w, 0.62, facecolor=C_PANEL, edgecolor=color,
                           lw=1.6, zorder=3))
    if ringed:
        ax.add_patch(Rectangle((x - 0.12, y - 0.12), w + 0.24, 0.86, facecolor="none",
                               edgecolor=C_INK, lw=1.5, ls=(0, (4, 3)), zorder=4))
    txt(ax, (x + w / 2, y + 0.31), text, color=color, fp=mono_sm, ha="center", z=5)

def chip_panel(ax, title, before, after, label, note, tone, frozen):
    """frozen 是纹丝不动的那个倍数；它的位置由数值对出来，不靠手写序号。"""
    fb = min(range(len(before)), key=lambda i: abs(before[i] - frozen))
    fa = min(range(len(after)), key=lambda i: abs(after[i] - frozen))
    ax.set_xlim(0, 10); ax.set_ylim(0, 5.0); ax.axis("off")
    txt(ax, (0.0, 4.66), title, color=C_INK, fp=zh, z=6)
    txt(ax, (0.0, 3.90), "原来那两个倍数", color=C_SOFT, fp=zh_sm, z=6)
    for i, val in enumerate(before):
        chip(ax, 0.0 + i * 2.45, 2.92, 2.05, "%+.3f" % val,
             C_RED if val > 0 else C_V, ringed=(i == fb))
    txt(ax, (0.0, 2.58), "硬使劲以后（%s）" % label, color=C_SOFT, fp=zh_sm, z=6)
    for i, val in enumerate(after):
        chip(ax, 0.0 + i * 2.45, 1.62, 2.05, "%+.3f" % val,
             C_RED if val > 0 else C_V, ringed=(i == fa))
    txt(ax, (5.15, 2.94), "虚线框里那个\n纹丝不动：\n它对应的方向够不着", color=C_INK, fp=zh_xs, z=6)
    txt(ax, (0.0, 0.72), note, color=tone, fp=zh_sm, z=6)

axA = fig.add_axes([0.03, 0.02, 0.45, 0.96])
chip_panel(axA, "b 落在「跑掉」那条线上：还救得回来",
           [LAM_RUN, LAM_BACK], AFTER_RUNLINE, "k = (50, 50)",
           "够不着的那个方向本来就没事（−1.105）；只要使劲够大，\n另一个（会跑的那个）照样搬到 %.1f——够不着 ≠ 稳不住"
           % AFTER_RUNLINE[0],
           C_V, LAM_BACK)
axB = fig.add_axes([0.52, 0.02, 0.45, 0.96])
chip_panel(axB, "b 落在「回来」那条线上：没救了",
           [LAM_RUN, LAM_BACK], AFTER_BACKLINE, "k = (1000, 1000)",
           "够不着的那个方向，恰好就是它会跑的那个倍数——\n就算把 k 开到 (1000, 1000)，它还是 +0.905",
           C_RED, LAM_RUN)
fig.suptitle("同一处退化、同一个面积为零，一个还有救、一个没救——差别只在够不着的那个方向本来是正是负",
             fontproperties=zh, color=C_INK, fontsize=10.5, y=0.035)
save(fig, "fig14-两处塌缩.png")

print("\n全部配图完成，共 14 张，输出目录：", OUT)
