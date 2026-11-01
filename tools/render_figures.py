# ============================================================
# tools/render_figures.py —— 文章配图渲染器
# 与 项目/assets/core.js 同一套数学（此处为 Python 镜像），
# 与项目同一套配色（浅色纸面）。图即项目输出，不是另画的示意图。
# 跑法：python tools/render_figures.py
# ============================================================
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, Polygon, Arc
from matplotlib.font_manager import FontProperties

# ---------- 配色（与 项目/assets/theme.css 同源） ----------
# 两套纸面：浅色的给 docx（白纸黑字），深色的给正文页（墨底浅字，照
# D:/汽车悬挂系统 那篇的形式）。深色值不在这里另写一遍——读
# tools/palette_dark.json，与 theme.css 同一个来源。
# 跑法：python tools/render_figures.py             → 图/
#       FIG_THEME=dark python tools/render_figures.py → 图-dark/
HERE = os.path.dirname(os.path.abspath(__file__))
THEME = (os.environ.get("FIG_THEME") or "light").strip().lower()
C_U    = "#0e9f6e"   # 第一捆 u：绿
C_V    = "#0e7490"   # 第二捆 v：青
C_SUM  = "#b7791f"   # 合成：琥珀
C_RED  = "#d64545"   # 特征方向：红
C_PUR  = "#7c5cbf"   # 作用结果：紫
C_GHOST= "#aeb9c8"   # 作用前的影子
C_INK  = "#1c2430"
C_SOFT = "#5b6572"
C_GRID = "#e8edf3"
C_AXIS = "#9aa5b5"
C_BG   = "#fdfdfe"
C_PANEL= "#ffffff"
PALE_U, PALE_SUM, PALE_PUR, PALE_V = "#e9f7f1", "#fdf6e8", "#f2eefa", "#eef4f7"
OUT    = os.path.join(os.path.dirname(HERE), "图")

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
    OUT = os.path.join(os.path.dirname(HERE), "图-dark")

os.makedirs(OUT, exist_ok=True)

zh = FontProperties(fname=r"C:\Windows\Fonts\msyh.ttc", size=12)
zh_sm = FontProperties(fname=r"C:\Windows\Fonts\msyh.ttc", size=10.5)
zh_title = FontProperties(fname=r"C:\Windows\Fonts\msyhbd.ttc", size=14)
mono = FontProperties(family="Consolas", size=11)

plt.rcParams["axes.unicode_minus"] = False

# ---------- 数学（core.js 的 Python 镜像） ----------
def vec(x, y): return np.array([float(x), float(y)])
def apply_m(M, u): return M @ u
def mat(a, b, c, d): return np.array([[a, b], [c, d]], dtype=float)
def mul(A, B): return A @ B
def det(M): return float(np.linalg.det(M))
def eigen(M):
    tr = np.trace(M); d = det(M); disc = tr * tr - 4 * d
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

# ---------- 绘制助手 ----------
def new_ax(figsize=(7.6, 4.6), xlim=(-4.6, 4.6), ylim=(-3.4, 3.4), xlabel="y", ylabel="v"):
    fig, ax = plt.subplots(figsize=figsize, dpi=200)
    fig.patch.set_facecolor(C_BG); ax.set_facecolor(C_BG)
    ax.set_xlim(*xlim); ax.set_ylim(*ylim)
    ax.set_aspect("equal")
    ax.spines[["top", "right"]].set_visible(False)
    for s in ["left", "bottom"]:
        ax.spines[s].set_color(C_AXIS)
    ax.tick_params(colors=C_SOFT, labelsize=8, length=3)
    ax.set_xlabel(xlabel, fontproperties=zh_sm, color=C_SOFT)
    ax.set_ylabel(ylabel, fontproperties=zh_sm, color=C_SOFT, rotation=0, labelpad=10)
    ax.set_xticks(np.arange(np.ceil(xlim[0]), xlim[1] + 0.01, 1))
    ax.set_yticks(np.arange(np.ceil(ylim[0]), ylim[1] + 0.01, 1))
    ax.grid(True, color=C_GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    return fig, ax

def arrow(ax, p, q, color=C_INK, lw=2.2, ls="-", alpha=1.0, z=3, head=0.16):
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle="-|>", mutation_scale=14 * head / 0.16,
                                 color=color, lw=lw, linestyle=ls, alpha=alpha,
                                 shrinkA=0, shrinkB=0, zorder=z))
def seg(ax, p, q, color=C_GRID, lw=0.8, ls="-", alpha=1.0, z=1):
    ax.plot([p[0], q[0]], [p[1], q[1]], color=color, lw=lw, ls=ls, alpha=alpha, zorder=z)
def txt(ax, p, s, color=C_INK, fp=None, dx=0, dy=0, ha="left", va="center", z=6):
    ax.text(p[0] + dx, p[1] + dy, s, color=color, fontproperties=fp or zh_sm,
            ha=ha, va=va, zorder=z)
def grid_of(ax, M, color, alpha=0.35, R=4.4, lw=0.9):
    for i in np.arange(-int(R), int(R) + 1, 1):
        a, b = M @ vec(-R, i), M @ vec(R, i)
        seg(ax, a, b, color=color, alpha=alpha, lw=lw, z=2)
        c, d = M @ vec(i, -R), M @ vec(i, R)
        seg(ax, c, d, color=color, alpha=alpha, lw=lw, z=2)
def dot(ax, p, color, r=0.055, z=5):
    ax.add_patch(plt.Circle(p, r, color=color, zorder=z))
    ax.add_patch(plt.Circle(p, r, facecolor="none", edgecolor=C_BG, lw=1.2, zorder=z))

def save(fig, name):
    path = os.path.join(OUT, name)
    fig.savefig(path, bbox_inches="tight", facecolor=C_BG)
    plt.close(fig)
    print("写出", name)

# ============================================================
# 图 01 · 相空间的点＝一捆数
# ============================================================
fig, ax = new_ax()
p = vec(2, 1.5)
arrow(ax, (0, 0), p, color=C_SUM, lw=2.8)
seg(ax, (p[0], 0), p, color=C_GHOST, ls=(0, (4, 3)), lw=1.2)
seg(ax, (0, p[1]), p, color=C_GHOST, ls=(0, (4, 3)), lw=1.2)
dot(ax, p, C_SUM)
txt(ax, p, "（y = 2，v = 1.5）", color=C_SUM, dx=0.14, dy=-0.28)
txt(ax, (p[0] * 0.55, -0.42), "第一个数", color=C_GHOST, ha="center")
txt(ax, (-0.28, p[1] * 0.55), "第二个数", color=C_GHOST, ha="right")
txt(ax, (1.0, 2.6), "两个数并排放，\n从来都是一支从原点出发的箭头", color=C_INK, fp=zh, dx=0.1)
save(fig, "fig01-一捆数.png")

# ============================================================
# 图 02 · 并成一捆（首尾相接 ＋ 平行四边形两条路）
# ============================================================
fig, ax = new_ax()
u, v = vec(2, 1), vec(1, 2); s = u + v
ax.add_patch(Polygon([(0, 0), u, s, v], closed=True, facecolor=C_SUM, alpha=0.06, zorder=1))
arrow(ax, (0, 0), u, color=C_U, lw=2.6)
arrow(ax, u, s, color=C_V, lw=2.6)           # 首尾相接
arrow(ax, v, s, color=C_GHOST, lw=1.4, ls=(0, (4, 3)))  # 平行四边形的另一组对边
arrow(ax, (0, 0), s, color=C_SUM, lw=3.0)
dot(ax, s, C_SUM)
txt(ax, u, "u", color=C_U, dx=0.12, dy=-0.3)
txt(ax, v, "v", color=C_V, dx=-0.34, dy=0.1, ha="right")
txt(ax, s, "u+v", color=C_SUM, dx=0.14, dy=0.05)
txt(ax, (-4.3, 2.9), "往东一段、再往北一段，\n等于直接斜着一段", color=C_INK, fp=zh)
txt(ax, (-4.3, -2.7), "首尾相接 与 平行四边形对角线：\n两条路，同一个终点", color=C_SOFT, fp=zh_sm)
save(fig, "fig02-并成一捆.png")

# ============================================================
# 图 03 · 整捆放大、缩小、反向
# ============================================================
fig, ax = new_ax(xlim=(-5.2, 5.2), ylim=(-3.2, 3.2), xlabel="横", ylabel="纵")
v = vec(1.2, 0.8)
for k, ls, lab, col in [(2.0, "-", "2v", C_U), (1.0, "-", "v", C_U),
                        (0.5, (0, (4, 3)), "一半的 v", C_U), (-1.0, "-", "−v（反向）", C_U)]:
    arrow(ax, (0, 0), k * v, color=col, lw=2.6 if k in (1.0, -1.0) else 1.8, ls=ls)
    txt(ax, k * v, lab, color=col, dx=0.14 if k > 0 else -0.14, dy=0.12, ha="left" if k > 0 else "right")
txt(ax, (-4.9, 2.7), "整捆按比例放大、缩小、反向：\n方向不变（或反过来），长短按比例变", color=C_INK, fp=zh)
save(fig, "fig03-整捆放大.png")

# ============================================================
# 图 04 · 摁一下：复数乘法＝转个角度、缩个比例（第 04 篇的老朋友）
# ============================================================
fig, ax = new_ax(xlim=(-3.4, 4.6), ylim=(-2.8, 4.2), xlabel="实", ylabel="虚")
before = vec(2, 1); after = vec(1, 3)
arrow(ax, (0, 0), before, color=C_U, lw=2.6)
arrow(ax, (0, 0), after, color=C_PUR, lw=3.0)
dot(ax, before, C_U); dot(ax, after, C_PUR)
txt(ax, before, "摁之前", color=C_U, dx=0.14, dy=-0.32)
txt(ax, after, "摁之后", color=C_PUR, dx=0.16, dy=0.1)
arc = Arc((0, 0), 2.6, 2.6, angle=0, theta1=26.6, theta2=71.6, color=C_SOFT, lw=1.2, ls=(0, (3, 2)))
ax.add_patch(arc)
txt(ax, (1.35, 0.95), "转个角度", color=C_SOFT)
txt(ax, (-3.1, 3.6), "乘以 (1+i)：\n方向转 45°，长短缩 √2 倍\n——一摁，整支箭头换了个位置", color=C_INK, fp=zh)
txt(ax, (-3.1, -2.4), "这种“摁一下”，就是作用", color=C_SUM, fp=zh)
save(fig, "fig04-摁一下.png")

# ============================================================
# 图 05 · 一张表的四数：两列的去向
# ============================================================
fig, ax = new_ax(xlim=(-3.2, 5.2), ylim=(-2.6, 3.4), xlabel="横", ylabel="纵")
M = mat(1.4, 0.6, 0.3, 0.9)
e1, e2 = vec(1, 0), vec(0, 1)
arrow(ax, (0, 0), e1, color=C_GHOST, lw=1.6, ls=(0, (3, 3)))
arrow(ax, (0, 0), e2, color=C_GHOST, lw=1.6, ls=(0, (3, 3)))
arrow(ax, (0, 0), M @ e1, color=C_SUM, lw=2.8)
arrow(ax, (0, 0), M @ e2, color=C_V, lw=2.8)
txt(ax, e1, "横箭头", color=C_GHOST, dx=0.1, dy=-0.32)
txt(ax, e2, "竖箭头", color=C_GHOST, dx=0.1, dy=0.22)
txt(ax, M @ e1, "第一列：横箭头被送到这", color=C_SUM, dx=0.14, dy=-0.3)
txt(ax, M @ e2, "第二列：竖箭头被送到这", color=C_V, dx=0.14, dy=0.16)
txt(ax, (-3.0, 2.9), "四个数排成两行两列：\n一整张表，就是两支底板箭头各自的去向", color=C_INK, fp=zh)
save(fig, "fig05-表的四数.png")

# ============================================================
# 图 06 · 网格被摁弯
# ============================================================
fig, ax = new_ax(xlim=(-4.6, 4.6), ylim=(-3.4, 3.4), xlabel="横", ylabel="纵")
grid_of(ax, M, C_PUR, alpha=0.5)
sq = [vec(0, 0), vec(1, 0), vec(1, 1), vec(0, 1)]
ax.add_patch(Polygon(sq, closed=True, facecolor=C_U, alpha=0.08, edgecolor=C_U, lw=1.2, zorder=2))
ax.add_patch(Polygon([M @ p for p in sq], closed=True, facecolor=C_PUR, alpha=0.10,
                     edgecolor=C_PUR, lw=1.8, zorder=4))
u = vec(1.6, 1.1)
arrow(ax, (0, 0), u, color=C_U, lw=2.2, ls=(0, (5, 4)))
arrow(ax, (0, 0), M @ u, color=C_PUR, lw=3.0)
dot(ax, M @ u, C_PUR)
txt(ax, u, "u（摁之前）", color=C_U, dx=-0.2, dy=-0.4, ha="right")
txt(ax, M @ u, "M·u（摁之后）", color=C_PUR, dx=0.16, dy=0.14)
txt(ax, (-4.4, 3.0), "表摁在整张平面上：网格歪的歪、转的转；\n单位小方块被摁成了平行四边形", color=C_INK, fp=zh)
save(fig, "fig06-摁弯网格.png")

# ============================================================
# 图 07 · 弹簧系统的矩阵形式（第 10 篇那句没展开的话，写全了）
# ============================================================
fig, ax = plt.subplots(figsize=(7.6, 3.4), dpi=200)
fig.patch.set_facecolor(C_BG); ax.set_facecolor(C_BG)
ax.set_xlim(0, 10); ax.set_ylim(0, 4.4); ax.axis("off")
# 输入一捆
p_in = vec(1.1, 0.0)
arrow(ax, (0.4, 2.2), (2.1, 2.2), color=C_U, lw=3.0)
txt(ax, (0.4, 3.0), "进来一捆：", color=C_INK, fp=zh)
txt(ax, (0.4, 2.55), "(y, v)", color=C_U, fp=mono)
# 表
box = plt.Rectangle((2.6, 1.3), 3.4, 1.9, facecolor=C_PANEL, edgecolor=C_AXIS, lw=1.4, zorder=3)
ax.add_patch(box)
txt(ax, (2.85, 2.85), "一张表（m、k、c 决定）", color=C_SOFT)
txt(ax, (3.0, 2.15), "y′ = v", color=C_PUR, fp=mono)
txt(ax, (3.0, 1.6), "v′ = −(k/m)y − (c/m)v", color=C_PUR, fp=mono)
arrow(ax, (6.0, 2.2), (7.7, 2.2), color=C_PUR, lw=3.0)
txt(ax, (7.85, 2.55), "出去一捆：", color=C_INK, fp=zh)
txt(ax, (7.85, 2.1), "(y′, v′)", color=C_PUR, fp=mono)
txt(ax, (0.4, 0.45), "第 10 篇说“可以写成矩阵形式”——写全了，就是一捆数进去、一捆数出来", color=C_SOFT, fp=zh_sm)
save(fig, "fig07-弹簧系统的矩阵形式.png")

# ============================================================
# 图 08 · 先后有别
# ============================================================
A = mat(0, -1, 1, 0)       # 转 90°
B = mat(1.6, 0, 0, 1)      # 横方向抻 1.6 倍
x0 = vec(1.3, 0.9)
fig, axes = plt.subplots(1, 2, figsize=(9.6, 4.3), dpi=200)
fig.patch.set_facecolor(C_BG)
for ax, (t1, t2, Mseq, name) in zip(axes, [
        ("先摁 B：抻", "再摁 A：转", B, "先 B 后 A ＝ A·B"),
        ("先摁 A：转", "再摁 B：抻", A, "先 A 后 B ＝ B·A")]):
    ax.set_facecolor(C_BG); ax.set_xlim(-3.6, 3.6); ax.set_ylim(-2.8, 2.8); ax.set_aspect("equal")
    ax.spines[["top", "right"]].set_visible(False)
    ax.tick_params(colors=C_SOFT, labelsize=7, length=3)
    ax.grid(True, color=C_GRID, linewidth=0.8); ax.set_axisbelow(True)
    grid_of(ax, Mseq, C_PUR, alpha=0.4, R=3.4)
    p1 = Mseq @ x0; p2 = (A if name.endswith("A·B") else B) @ p1
    arrow(ax, (0, 0), x0, color=C_U, lw=2.4)
    arrow(ax, (0, 0), p1, color=C_V, lw=2.2, ls=(0, (5, 4)))
    arrow(ax, (0, 0), p2, color=C_PUR, lw=3.0); dot(ax, p2, C_PUR)
    txt(ax, x0, "x", color=C_U, dx=0.1, dy=-0.3)
    txt(ax, p1, "中间", color=C_V, dx=0.1, dy=0.2)
    txt(ax, p2, "终点", color=C_PUR, dx=0.12, dy=0.1)
    ax.set_title(name, fontproperties=zh, color=C_INK, fontsize=12)
    txt(ax, (-3.4, 2.45), t1, color=C_SOFT)
    txt(ax, (-3.4, 2.05), t2, color=C_SOFT)
fig.suptitle("同样两张表，换个先后，终点就不同——先穿袜子后穿鞋，反过来谁都不行",
             fontproperties=zh, color=C_INK, fontsize=13, y=0.02)
fig.tight_layout(rect=[0, 0.05, 1, 1])
save(fig, "fig08-先后有别.png")

# ============================================================
# 图 09 · 表相乘怎么算：一列一列看
# ============================================================
fig, ax = new_ax(xlim=(-3.2, 5.4), ylim=(-2.6, 4.2), xlabel="横", ylabel="纵")
grid_of(ax, B, C_V, alpha=0.4)
e1, e2 = vec(1, 0), vec(0, 1)
arrow(ax, (0, 0), e1, color=C_GHOST, lw=1.5, ls=(0, (3, 3)))
arrow(ax, (0, 0), e2, color=C_GHOST, lw=1.5, ls=(0, (3, 3)))
b1, b2 = B @ e1, B @ e2
arrow(ax, (0, 0), b1, color=C_V, lw=2.2, ls=(0, (5, 3)))
arrow(ax, (0, 0), b2, color=C_V, lw=2.2, ls=(0, (5, 3)))
c1, c2 = A @ b1, A @ b2      # ＝ A·B 的两列
arrow(ax, (0, 0), c1, color=C_SUM, lw=3.0)
arrow(ax, (0, 0), c2, color=C_PUR, lw=3.0)
txt(ax, b1, "B 的第一列", color=C_V, dx=0.1, dy=-0.34)
txt(ax, b2, "B 的第二列", color=C_V, dx=0.1, dy=0.2)
txt(ax, c1, "被 A 送到这＝合表第一列", color=C_SUM, dx=0.14, dy=-0.1)
txt(ax, c2, "被 A 送到这＝合表第二列", color=C_PUR, dx=0.14, dy=0.12)
txt(ax, (-3.0, 3.8), "合表的一列一列，\n就是被先摁的那张表的各列，\n再被摁一次的结果", color=C_INK, fp=zh)
save(fig, "fig09-合表的列.png")

# ============================================================
# 图 10 · 变了又没变的方向
# ============================================================
fig, ax = new_ax(xlim=(-4.6, 4.6), ylim=(-3.4, 3.4), xlabel="横", ylabel="纵")
Ms = mat(2, 0.9, 0.9, 1.3)
eig = eigen(Ms)
grid_of(ax, Ms, C_PUR, alpha=0.42)
for v, l, lab_dy in [(eig["v1"], eig["l1"], -0.3), (eig["v2"], eig["l2"], 0.25)]:
    seg(ax, -4.4 * v, 4.4 * v, color=C_RED, lw=1.5, ls=(0, (7, 5)))
    tip = 2.05 * v
    arrow(ax, (0, 0), tip, color=C_RED, lw=2.2)
    dot(ax, tip, C_RED)
    txt(ax, tip, "λ=%.2f" % l, color=C_RED, fp=mono, dx=0.12, dy=lab_dy)
arrow(ax, (0, 0), Ms @ vec(1.5, -0.9), color=C_GHOST, lw=1.8, ls=(0, (4, 3)))
txt(ax, Ms @ vec(1.5, -0.9), "大多数方向：说转就转", color=C_SOFT, dx=0.12, dy=0.05)
txt(ax, (-4.4, 3.0), "网格被摁弯，唯独这两条线：\n箭头被拉长或压短，方向一点儿没变", color=C_INK, fp=zh)
save(fig, "fig10-变了又没变的方向.png")

# ============================================================
# 图 11 · 椭圆与螺旋（弹簧系统，复方向的读法）
# ============================================================
fig, axes = plt.subplots(1, 2, figsize=(9.6, 4.3), dpi=200)
fig.patch.set_facecolor(C_BG)
for ax, c, name, lam in [(axes[0], 0.0, "无阻尼 c=0：椭圆", "λ = ±2i"),
                          (axes[1], 0.4, "小阻尼 c=0.4：螺旋", "λ = −0.2 ± 1.99i")]:
    ax.set_facecolor(C_BG); ax.set_xlim(-2.6, 2.6); ax.set_ylim(-2.6, 2.6); ax.set_aspect("equal")
    ax.spines[["top", "right"]].set_visible(False)
    ax.tick_params(colors=C_SOFT, labelsize=7, length=3)
    ax.grid(True, color=C_GRID, linewidth=0.8); ax.set_axisbelow(True)
    ax.set_xlabel("y", fontproperties=zh_sm, color=C_SOFT)
    ax.set_ylabel("v", fontproperties=zh_sm, color=C_SOFT, rotation=0, labelpad=8)
    S = mat(0, 1, -4, -c)
    T = 6.3 if c == 0 else 8.0
    for a0 in np.linspace(0, 2 * np.pi, 7)[:-1]:
        s0 = 1.9 * vec(np.cos(a0), np.sin(a0))
        ts = np.linspace(0, T, 400)
        pts = np.array([expm2(S, t) @ s0 for t in ts])
        ax.plot(pts[:, 0], pts[:, 1], color=C_PUR, lw=1.4, alpha=0.9)
        dot(ax, s0, C_U, r=0.045)
    ax.set_title(name, fontproperties=zh, color=C_INK, fontsize=12)
    txt(ax, (-2.5, 2.25), lam, color=C_RED, fp=mono)
txt(axes[0], (-2.5, -2.35), "纯转圈：方向一直在换，\n没有一条不转的方向", color=C_SOFT, fp=zh_sm)
txt(axes[1], (-2.5, -2.35), "边转边缩：复数乘法\n就是旋转加放缩（第 04、05 篇）", color=C_SOFT, fp=zh_sm)
fig.tight_layout()
save(fig, "fig11-椭圆与螺旋.png")

# ============================================================
# 图 12 · 面积与塌缩（量变到质变）
# ============================================================
M0 = mat(1.4, 0.6, 0.3, 0.9)
SQ = mat(1, 0.5, 2, 1)   # 终点：被摁扁的表
sq = [vec(0, 0), vec(1, 0), vec(1, 1), vec(0, 1)]
fig, axes = plt.subplots(1, 3, figsize=(10.2, 3.6), dpi=200)
fig.patch.set_facecolor(C_BG)
for ax, t, name in [(axes[0], 0.0, "放大倍数 1.08"), (axes[1], 0.62, "连续变小……"),
                    (axes[2], 1.0, "放大倍数 0：塌成一条线")]:
    ax.set_facecolor(C_BG); ax.set_xlim(-1.2, 3.4); ax.set_ylim(-1.6, 2.6); ax.set_aspect("equal")
    ax.spines[["top", "right"]].set_visible(False)
    ax.tick_params(colors=C_SOFT, labelsize=7, length=3)
    ax.grid(True, color=C_GRID, linewidth=0.8); ax.set_axisbelow(True)
    M = (1 - t) * M0 + t * SQ
    ax.add_patch(Polygon(sq, closed=True, facecolor=C_U, alpha=0.10, edgecolor=C_U, lw=1.1, zorder=2))
    ax.add_patch(Polygon([M @ p for p in sq], closed=True, facecolor=C_PUR, alpha=0.12,
                         edgecolor=C_PUR, lw=1.6, zorder=4))
    ax.set_title(name, fontproperties=zh, color=C_INK, fontsize=11.5)
    txt(ax, (-1.1, 2.3), "det = %.2f" % det(M), color=C_PUR, fp=mono)
txt(axes[2], (-1.1, -1.35), "量变连续发生；\n到 0 那一刻，质变", color=C_RED, fp=zh_sm)
fig.tight_layout()
save(fig, "fig12-面积与塌缩.png")

# ============================================================
# 图 13 · 反作用：知道结果，反推原因
# ============================================================
fig, axes = plt.subplots(1, 2, figsize=(9.6, 4.0), dpi=200)
fig.patch.set_facecolor(C_BG)
b = vec(1.5, 1.1)
# 左：反得回去
ax = axes[0]
ax.set_facecolor(C_BG); ax.set_xlim(-2.8, 3.2); ax.set_ylim(-2.2, 2.6); ax.set_aspect("equal")
ax.spines[["top", "right"]].set_visible(False)
ax.tick_params(colors=C_SOFT, labelsize=7, length=3)
ax.grid(True, color=C_GRID, linewidth=0.8); ax.set_axisbelow(True)
M = M0
x = np.linalg.inv(M) @ b
arrow(ax, (0, 0), x, color=C_PUR, lw=3.0); dot(ax, x, C_PUR)
arrow(ax, (0, 0), b, color=C_INK, lw=2.4); dot(ax, b, C_INK)
txt(ax, x, "x（唯一的原因）", color=C_PUR, dx=0.12, dy=0.18)
txt(ax, b, "b（已知结果）", color=C_INK, dx=0.12, dy=-0.3)
ax.set_title("放大倍数不是 0：原因反得回去，且唯一", fontproperties=zh, color=C_INK, fontsize=11.5)
txt(ax, (-2.6, 2.25), "M·x = b", color=C_SOFT, fp=mono)
# 右：反不回去
ax = axes[1]
ax.set_facecolor(C_BG); ax.set_xlim(-2.8, 3.2); ax.set_ylim(-2.2, 2.6); ax.set_aspect("equal")
ax.spines[["top", "right"]].set_visible(False)
ax.tick_params(colors=C_SOFT, labelsize=7, length=3)
ax.grid(True, color=C_GRID, linewidth=0.8); ax.set_axisbelow(True)
row1 = np.array([1.0, 0.5]); n1sq = 2.25
xp = row1 * (b[0] / n1sq)
nvec = np.array([-0.5, 1.0]) / np.hypot(0.5, 1.0)
seg(ax, xp - 3.2 * nvec, xp + 3.2 * nvec, color=C_PUR, lw=1.6, ls=(0, (2, 3)))
arrow(ax, (0, 0), xp, color=C_PUR, lw=2.6); dot(ax, xp, C_PUR)
arrow(ax, (0, 0), b, color=C_INK, lw=2.4); dot(ax, b, C_INK)
for s_ in (-1.4, 1.4):
    dot(ax, xp + s_ * nvec, C_PUR, r=0.045)
txt(ax, xp, "原因有一整条", color=C_PUR, dx=0.12, dy=0.2)
txt(ax, b, "b（已知结果）", color=C_INK, dx=0.12, dy=-0.3)
ax.set_title("放大倍数是 0：反不回去了", fontproperties=zh, color=C_INK, fontsize=11.5)
txt(ax, (-2.6, 2.25), "一整条 x 都摁成同一个 b", color=C_RED, fp=zh_sm)
fig.tight_layout()
save(fig, "fig13-反作用.png")

# ============================================================
# 图 14 · 一捆数的一生（收束全篇）
# ============================================================
fig, axes = plt.subplots(1, 5, figsize=(12.6, 2.9), dpi=200)
fig.patch.set_facecolor(C_BG)
steps = [
    ("一捆数", lambda ax: arrow(ax, (0, 0), vec(1.2, 0.8), color=C_SUM, lw=3.0)),
    ("一张表摁一下", lambda ax: (grid_of(ax, M0, C_PUR, alpha=0.5, R=1.6),
                                  arrow(ax, (0, 0), M0 @ vec(1.2, 0.8), color=C_PUR, lw=2.6))),
    ("变了又没变的方向", lambda ax: (grid_of(ax, Ms, C_PUR, alpha=0.35, R=1.8),
                                     seg(ax, -1.8 * eig["v1"], 1.8 * eig["v1"], color=C_RED, lw=1.6, ls=(0, (6, 4))),
                                     seg(ax, -1.8 * eig["v2"], 1.8 * eig["v2"], color=C_RED, lw=1.6, ls=(0, (6, 4))))),
    ("面积放大倍数", lambda ax: (ax.add_patch(Polygon(sq, closed=True, facecolor=C_U, alpha=0.1, edgecolor=C_U, lw=1.0)),
                                 ax.add_patch(Polygon([M0 @ p for p in sq], closed=True, facecolor=C_PUR,
                                                      alpha=0.12, edgecolor=C_PUR, lw=1.4)))),
    ("反推原因", lambda ax: (arrow(ax, (0, 0), x, color=C_PUR, lw=2.6), dot(ax, x, C_PUR))),
]
for ax, (name, fn) in zip(axes, steps):
    ax.set_facecolor(C_BG); ax.set_xlim(-1.9, 1.9); ax.set_ylim(-1.9, 1.9); ax.set_aspect("equal")
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values(): s.set_color(C_GRID)
    fn(ax)
    ax.set_title(name, fontproperties=zh, color=C_INK, fontsize=12)
fig.tight_layout()
save(fig, "fig14-一捆数的一生.png")


# ============================================================
# 图 15 · 构成没变，尺子换了：同一个「1 个 + 1 个」落到别处
# ============================================================
def panel(fig, box, xlim, ylim, xlabel, ylabel):
    ax = fig.add_axes(box)
    ax.set_facecolor(C_BG)
    ax.set_xlim(*xlim); ax.set_ylim(*ylim); ax.set_aspect("equal")
    ax.spines[["top", "right"]].set_visible(False)
    for sp in ["left", "bottom"]:
        ax.spines[sp].set_color(C_AXIS)
    ax.tick_params(colors=C_SOFT, labelsize=8, length=3)
    ax.set_xlabel(xlabel, fontproperties=zh_sm, color=C_SOFT)
    ax.set_ylabel(ylabel, fontproperties=zh_sm, color=C_SOFT, rotation=0, labelpad=10)
    ax.grid(True, color=C_GRID, linewidth=0.8); ax.set_axisbelow(True)
    return ax

A_NEW = mat(2, 1, 1, 2)
fig = plt.figure(figsize=(9.8, 4.6)); fig.patch.set_facecolor(C_BG)

axL = panel(fig, [0.05, 0.16, 0.40, 0.72], (-1.3, 2.9), (-1.3, 2.9), "横", "纵")
arrow(axL, (0, 0), vec(1, 0), color=C_GHOST, lw=2.0)
arrow(axL, (0, 0), vec(0, 1), color=C_GHOST, lw=2.0)
seg(axL, (1, 0), (1, 1), color=C_GHOST, lw=1.0, ls=(0, (4, 4)))
seg(axL, (0, 1), (1, 1), color=C_GHOST, lw=1.0, ls=(0, (4, 4)))
arrow(axL, (0, 0), vec(1, 1), color=C_U, lw=3.0)
dot(axL, vec(1, 1), C_U)
txt(axL, vec(1, 0), "1 个横", color=C_GHOST, dx=0.05, dy=-0.28)
txt(axL, vec(0, 1), "1 个竖", color=C_GHOST, dx=0.10, dy=0.22)
txt(axL, vec(1, 1), "(1, 1)", color=C_U, dx=0.12, dy=0.22, fp=zh)
txt(axL, (-1.2, 2.6), "旧尺子：横 (1,0)、竖 (0,1)", color=C_INK, fp=zh_sm)
axL.set_title("1 个横 ＋ 1 个竖 ＝ (1,1)", fontproperties=zh, color=C_SOFT, fontsize=11, pad=6)

axR = panel(fig, [0.53, 0.16, 0.44, 0.72], (-1.3, 4.3), (-1.3, 4.3), "横", "纵")
a1, a2 = A_NEW @ vec(1, 0), A_NEW @ vec(0, 1)          # (2,1) 与 (1,2)：表的两列
arrow(axR, (0, 0), a1, color=C_SUM, lw=2.8)
arrow(axR, (0, 0), a2, color=C_V, lw=2.8)
seg(axR, a1, a1 + a2, color=C_GHOST, lw=1.0, ls=(0, (4, 4)))
seg(axR, a2, a1 + a2, color=C_GHOST, lw=1.0, ls=(0, (4, 4)))
arrow(axR, (0, 0), a1 + a2, color=C_U, lw=3.0)
dot(axR, a1 + a2, C_U)
txt(axR, a1, "第一列 (2,1)：新的横", color=C_SUM, dx=0.22, dy=-0.62, ha="left")
txt(axR, a2, "第二列 (1,2)：新的竖", color=C_V, dx=-0.18, dy=0.46, ha="right")
txt(axR, a1 + a2, "(3, 3)", color=C_U, dx=0.14, dy=0.24, fp=zh)
txt(axR, (-1.2, 4.0), "新尺子：横换成 (2,1)、竖换成 (1,2)", color=C_INK, fp=zh_sm)
axR.set_title("还是 1 个 ＋ 1 个，只是尺子换了 ＝ (3,3)", fontproperties=zh, color=C_SOFT, fontsize=11, pad=6)

fig.text(0.5, 0.015, "两根尺子换了一遍，构成那个「1 个 + 1 个」一个字没改——这就是同一个作用的第二种读法",
         ha="center", fontproperties=zh, color=C_INK, fontsize=10.5)
save(fig, "fig15-构成没变尺子换了.png")

print("\n全部配图完成，共 15 张，输出目录：", OUT)
