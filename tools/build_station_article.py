# ============================================================
# tools/build_station_article.py —— 把 md 正文做成"参考项目那个形式"的网页
#
# 形式（照 D:/汽车悬挂系统/悬挂系统内因篇（下）·现实悬挂系统的内因.html）：
#   1. 单文件：样式全在 <head> 里，不引任何外部 css/js（图与 iframe 仍是本地相对路径）
#   2. 墨底浅字：一处 :root 定色，别处只用 var()
#   3. 公式是服务端产出的纯文本数学（.fm 块），不在浏览器里跑公式脚本
#   4. 可交互的那几站用 .station 内嵌 iframe，直接插在论证需要它的地方，
#      带一句"动哪儿"的指引和一条"打不开怎么办"的退路
#
# 跑法：python tools/build_station_article.py            # 两篇都生成
#       python tools/build_station_article.py 控制         # 只生成一篇
# ============================================================
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ============================================================
# 一 · LaTeX → HTML（不依赖 KaTeX；矩阵、分式、上下标、希腊字母）
# ============================================================
GREEK = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε", "varepsilon": "ε",
    "zeta": "ζ", "eta": "η", "theta": "θ", "iota": "ι", "kappa": "κ", "lambda": "λ",
    "mu": "μ", "nu": "ν", "xi": "ξ", "pi": "π", "rho": "ρ", "sigma": "σ", "tau": "τ",
    "phi": "φ", "chi": "χ", "psi": "ψ", "omega": "ω",
    "Gamma": "Γ", "Delta": "Δ", "Theta": "Θ", "Lambda": "Λ", "Xi": "Ξ", "Pi": "Π",
    "Sigma": "Σ", "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω",
}
SYMBOL = {
    "pm": "±", "mp": "∓", "cdot": "·", "times": "×", "div": "÷", "approx": "≈",
    "le": "≤", "leq": "≤", "ge": "≥", "geq": "≥", "ne": "≠", "neq": "≠",
    "to": "→", "infty": "∞", "prime": "′", "ldots": "…", "cdots": "⋯",
    "lVert": "‖", "rVert": "‖", "Vert": "‖", "|": "‖", "{": "{", "}": "}",
    "%": "%", "&": "&", "#": "#", "_": "_",
}
OP_CHARS = "=+−±>≥≤≠→,"
UPRIGHT = {"mathrm", "operatorname", "textrm", "textnormal"}
# 加在字符正上方的小记号。观测器那一篇通篇是 \hat{x}（模型的复制品），
# 而"有没有戴帽子"正是区分"真的"与"算出来的替身"的唯一线索，不能省。
ACCENTS = {"hat": "hat", "widehat": "hat", "bar": "bar", "overline": "bar", "tilde": "tilde"}


class TexError(Exception):
    pass


def _read_group(s, i):
    """s[i] 是 '{'，返回 (组内文本, 组后的下标)。"""
    assert s[i] == "{", s[i:i + 20]
    depth, j = 0, i
    while j < len(s):
        if s[j] == "{":
            depth += 1
        elif s[j] == "}":
            depth -= 1
            if depth == 0:
                return s[i + 1:j], j + 1
        j += 1
    raise TexError("括号没配上：%r" % s[i:i + 40])


def _read_arg(s, i):
    """读一个参数：{...} 或单个记号。"""
    while i < len(s) and s[i] == " ":
        i += 1
    if i >= len(s):
        raise TexError("缺参数：%r" % s)
    if s[i] == "{":
        return _read_group(s, i)
    if s[i] == "\\":
        m = re.match(r"\\[A-Za-z]+|\\.", s[i:])
        return m.group(0), i + len(m.group(0))
    return s[i], i + 1


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def esc_attr(t):
    """属性值里必须把双引号也转掉：正文里那句图题自带 ASCII 引号
    （"够不够得着"），不转会把它后面的 alt 值截断、顺手多造出几个假属性。"""
    return esc(t).replace('"', "&quot;")


def _matrix(rows, display):
    ncol = max(len(r) for r in rows)
    cells = []
    for r in rows:
        for c in r:
            cells.append('<span class="c">%s</span>' % tex(c.strip(), display))
    return ('<span class="mx"><span class="br l"></span>'
            '<span class="cells" style="grid-template-columns:repeat(%d,auto)">%s</span>'
            '<span class="br r"></span></span>' % (ncol, "".join(cells)))


def _op(ch, display):
    """运算符：显示式里留出间距，行内紧凑一点。"""
    if ch in OP_CHARS:
        return '<span class="op">%s</span>' % ch
    return ch


def tex(src, display=False):
    """把一小段 LaTeX 转成 HTML 片段（数学用）。"""
    s = src.strip()
    out = []
    i, n = 0, len(s)

    def push(html):
        out.append(html)

    def attach(kind, body):
        """把刚产出的那个原子包成上标/下标。"""
        if not out:
            tag = "sup" if kind == "sup" else "sub"
            out.append("<%s>%s</%s>" % (tag, body, tag))
            return
        base = out.pop()
        tag = "sup" if kind == "sup" else "sub"     # 用真标签，别用 class——样式挂的就是 sup/sub
        out.append("%s<%s>%s</%s>" % (base, tag, body, tag))

    while i < n:
        ch = s[i]

        if ch == "\\":
            m = re.match(r"\\([A-Za-z]+|.)", s[i:])
            if not m:
                i += 1
                continue
            cmd = m.group(1)
            i += len(m.group(0))

            if cmd == "begin":
                env, i = _read_arg(s, i)
                endtok = "\\end{%s}" % env
                j = s.find(endtok, i)
                if j < 0:
                    raise TexError("矩阵没有 \\end{%s}：%r" % (env, s))
                body = s[i:j]
                i = j + len(endtok)
                rows = [r.split("&") for r in body.split("\\\\")]
                push(_matrix(rows, display))

            elif cmd in ("frac", "dfrac", "tfrac"):
                num, i = _read_arg(s, i)
                den, i = _read_arg(s, i)
                push('<span class="frac"><span class="nu">%s</span>'
                     '<span class="de">%s</span></span>' % (tex(num, display), tex(den, display)))

            elif cmd == "sqrt":
                arg, i = _read_arg(s, i)
                push('<span class="sq">√<span class="rad">%s</span></span>' % tex(arg, display))

            elif cmd == "text":
                arg, i = _read_arg(s, i)
                push('<span class="tx">%s</span>' % esc(arg))

            elif cmd in UPRIGHT:
                arg, i = _read_arg(s, i)
                push('<span class="up">%s</span>' % esc(arg))

            elif cmd == "det":
                push('<span class="up">det</span>')

            elif cmd in ACCENTS:
                # 帽子/横线：靠 CSS 在字符正上方挂一个小记号，不占横向宽度
                arg, i = _read_arg(s, i)
                push('<span class="%s">%s</span>' % (ACCENTS[cmd], tex(arg, display)))

            elif cmd in ("quad", "qquad"):
                push('<span class="gap"></span>')

            elif cmd == "," or cmd == ";":
                push('<span class="thin"></span>')

            elif cmd in GREEK:
                push(GREEK[cmd])

            elif cmd in SYMBOL:
                push(SYMBOL[cmd])

            elif cmd == "left" or cmd == "right":
                continue

            else:
                raise TexError("不认识的命令 \\%s（公式：%r）" % (cmd, s))

        elif ch == "{":
            body, i = _read_group(s, i)
            push(tex(body, display))

        elif ch == "^":
            i += 1                      # 先把 ^ 让过去，再读参数（否则读到的是 ^ 自己）
            body, i = _read_arg(s, i)
            attach("sup", tex(body, display))

        elif ch == "_":
            i += 1
            body, i = _read_arg(s, i)
            attach("sub", tex(body, display))

        elif ch == "'":
            push("′")
            i += 1

        elif ch == "-":
            push(_op("−", display))     # 显示式里减号两侧留白，行内不留
            i += 1

        elif ch == " ":
            i += 1

        else:
            push(_op(ch, display))
            i += 1

    return "".join(out)


# ============================================================
# 二 · 段落级：行内公式、粗体
# ============================================================
RE_INLINE = re.compile(r"(?<!\$)\$([^$]+)\$(?!\$)")


def inline_math(text):
    def rep(m):
        return '<span class="im">%s</span>' % tex(m.group(1))
    return RE_INLINE.sub(rep, text)


def para_html(text):
    t = inline_math(text)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    return "<p>%s</p>" % t


def figure_html(alt, src, web_src):
    return ('<figure><img src="%s" alt="%s" loading="lazy">'
            '<figcaption>%s</figcaption></figure>' % (esc_attr(web_src), esc_attr(alt), esc(alt)))


# ============================================================
# 三 · 站点：直接嵌在正文里的可交互那一站
# ============================================================
def station_html(st):
    # 不给 iframe 加 loading="lazy"：这一页是要从头读到尾、还要打印的，
    # 懒加载会让"整页截图/打印"里那几站空着——读者看到的是一块黑框。
    # 五个站点都是本地单文件，一起加载的代价远小于这个坑。
    tall = " tall" if st.get("tall") else ""
    return """<div class="station%s">
      <div class="bar"><span class="dot"></span>可交互一站 · %s<span class="sub">配套项目 %s</span></div>
      <div class="body">
        <p class="do">%s</p>
        <iframe src="%s" title="%s" style="--h:%dpx"></iframe>
        <p class="fallback">（这一站是单文件、零依赖，双击就能单独打开。）也可直接打开 <a href="%s" target="_blank" rel="noopener">这一站</a>。</p>
      </div>
    </div>""" % (tall, st["title"], st["tag"], st["do"], esc_attr(st["src"]), esc_attr(st["title"]),
                 st.get("h", 660), esc_attr(st["src"]))


# ============================================================
# 四 · 页面外壳（照参考项目那份深色阅读页）
# ============================================================
CSS = """
  :root{
    --bg:#161618; --paper:#1e1e20; --panel:#252526;
    --border:#3a3a3d; --text:#e9e9ec; --dim:#a0a0a8;
    --accent:#00adb5; --accent-soft:rgba(0,173,181,.12);
    --strong:#ffffff; --code-bg:#181818;
    --warn:#ff9f43; --ok:#51cf66; --red:#ff6b6b;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  html{scroll-behavior:smooth;}
  body{
    background:var(--bg); color:var(--text);
    font-family:"Segoe UI","Microsoft YaHei",-apple-system,BlinkMacSystemFont,sans-serif;
    line-height:1.95; font-size:16.5px; padding:56px 22px 96px;
  }
  .wrap{max-width:860px;margin:0 auto;}
  .eyebrow{
    display:inline-block;font-size:12px;letter-spacing:.18em;color:var(--accent);
    border:1px solid var(--accent);border-radius:999px;padding:4px 14px;margin-bottom:22px;
  }
  h1{font-size:clamp(26px,4vw,38px);font-weight:600;letter-spacing:.01em;line-height:1.35;margin-bottom:14px;}
  .lede{color:var(--dim);font-size:14.5px;border-left:3px solid var(--accent);padding-left:14px;}
  article{margin-top:40px;}
  article p{margin:20px 0;text-align:justify;}
  article strong{color:var(--strong);}
  /* 展示公式：一块纸面，字是强调色，不用图片也不用客户端公式库 */
  article .fm{
    background:var(--paper);border:1px solid var(--border);border-radius:10px;
    padding:20px 22px;margin:26px 0;text-align:center;font-size:18px;letter-spacing:.02em;
    color:var(--accent);overflow-x:auto;line-height:2.2;
  }
  article figure{margin:30px 0;}
  article figure img{width:100%;display:block;border-radius:12px;border:1px solid var(--border);}
  article figure figcaption{color:var(--dim);font-size:13px;margin-top:10px;text-align:center;}
  /* 行内数学 */
  .im{font-size:1.02em;letter-spacing:.01em;white-space:nowrap;}
  .im .op{margin:0 .12em;}
  .fm .op{margin:0 .34em;}
  .gap{display:inline-block;width:2.2em;}
  .thin{display:inline-block;width:.22em;}
  .up{font-style:normal;margin-right:.14em;}
  .tx{font-style:normal;}
  /* 上标下标 */
  sup,sub{font-size:.72em;line-height:0;}
  sup{vertical-align:.52em;}
  sub{vertical-align:-.22em;}
  /* 帽子与横线：绝对定位挂在字符正上方，不挤动行距。
     帽子用两条边转出来的"^"画，不用 ˆ 这个字符——那个字形在字体里
     自带一段侧边距，居中之后看着往右偏半个字，x̂ 会像戴在邻座上。 */
  .hat,.bar,.tilde{position:relative;display:inline-block;}
  .hat::before{
    content:"";position:absolute;left:50%;top:-.46em;width:.30em;height:.30em;
    border-left:1.4px solid currentColor;border-top:1.4px solid currentColor;
    transform:translateX(-50%) rotate(45deg);
  }
  .tilde::before{
    content:"˜";position:absolute;left:0;right:0;top:-.5em;text-align:center;
    font-size:.9em;line-height:1;pointer-events:none;
  }
  .bar::before{content:"";position:absolute;left:0;right:0;top:-.06em;border-top:1.2px solid currentColor;}
  /* 分式：竖着摞，分子下面一道细线 */
  .frac{display:inline-flex;flex-direction:column;vertical-align:-.62em;text-align:center;margin:0 .16em;}
  .frac .nu{border-bottom:1px solid currentColor;padding:0 .3em .05em;font-size:.94em;}
  .frac .de{padding:.05em .3em 0;font-size:.94em;}
  /* 矩阵：括号用两条弯边画，跟着内容高度走 */
  .mx{display:inline-flex;align-items:stretch;vertical-align:middle;margin:0 .12em;}
  .mx .br{width:.34em;border:1.4px solid currentColor;flex:0 0 auto;}
  .mx .br.l{border-right:none;border-radius:5px 0 0 5px;}
  .mx .br.r{border-left:none;border-radius:0 5px 5px 0;}
  .mx .cells{display:grid;gap:0 .9em;align-items:center;padding:0 .3em;font-size:.95em;}
  .mx .cells .c{text-align:center;padding:.06em 0;}
  .sq .rad{border-top:1px solid currentColor;padding:0 .1em;}
  /* 可交互一站 */
  .station{
    margin:34px 0;border:1px solid var(--accent);border-radius:14px;overflow:hidden;
    background:var(--accent-soft);
    width:min(1180px,calc(100vw - 56px));
    margin-left:calc(50% - min(590px,50vw - 28px));
  }
  .station .bar{
    display:flex;align-items:center;gap:10px;padding:12px 18px;
    background:rgba(0,173,181,.16);font-size:13.5px;color:var(--accent);font-weight:600;
  }
  .station .bar .dot{width:8px;height:8px;border-radius:50%;background:var(--accent);}
  .station .bar .sub{color:var(--dim);font-weight:400;margin-left:auto;font-size:12.5px;}
  .station .body{padding:14px 18px 18px;}
  .station .do{font-size:14.5px;color:var(--text);margin-bottom:12px;line-height:1.85;}
  .station .do b{color:var(--accent);}
  .station iframe{
    width:100%;height:var(--h,660px);border:1px solid var(--border);border-radius:10px;background:var(--paper);
  }

  .station .fallback{font-size:13px;color:var(--dim);margin-top:10px;}
  .station a{color:var(--accent);text-decoration:none;border-bottom:1px solid rgba(0,173,181,.4);}
  .station a:hover{border-bottom-color:var(--accent);}
  footer{
    margin-top:64px;padding-top:26px;border-top:1px solid var(--border);
    color:var(--dim);font-size:13px;
  }
  footer p{margin:8px 0;}
  footer a{color:var(--accent);text-decoration:none;}
  footer a:hover{text-decoration:underline;}
  code{
    font-family:Consolas,"Courier New",monospace;font-size:13px;color:var(--text);
    background:var(--code-bg);border:1px solid var(--border);border-radius:4px;padding:1px 5px;
  }
  @media (max-width:720px){
    body{padding:36px 16px 72px;font-size:15.5px;}
    .station{width:calc(100vw - 40px);margin-left:calc(50% - 50vw + 20px);}
    .station iframe{height:560px;}
  }
"""

PAGE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__</title>
<style>__CSS__</style>
</head>
<body>
<div class="wrap">

  <span class="eyebrow">__EYEBROW__</span>
  <h1>__H1L__<br>__H1R__</h1>
  <p class="lede">__LEDE__</p>

  <article>

__BODY__

  </article>

  <footer>
__FOOTER__
  </footer>

</div>
</body>
</html>
"""


# ============================================================
# 五 · 两篇的配置：站点插在哪儿、说什么
# ============================================================
ARTICLES = {
    "control": {
        "md": "线性代数基础·让会倒的东西站住.md",
        "out": os.path.join("控制项目", "文章.html"),
        "md_fig": "控制图/",
        "web_fig": "图/",
        "title": "让会倒的东西站住 · 线性代数基础 12",
        "eyebrow": "LINEAR ALGEBRA · 第 12 站",
        "h1": ("线性代数基础 12", "让会倒的东西站住"),
        "lede": ("上一篇把系统的脾气交给了一张表：改参数就改脾气。这一篇拿一根立不住的棍子去撞这句话——"
                 "阻尼加到十也压不掉的那个正数，说明有的系统的确非倒不可。撞断之后退一步看手："
                 "手把「歪了多少、歪得多快」变成一行力接回表里，于是表换了，倍数也搬得动了。"
                 "最后一站问的是更靠前的一句：力从哪儿进去，够得着吗？"),
        "footer": [
            '配图与可交互的五站见配套项目 <code>控制项目/</code>（离线自足，双击即可打开）；'
            '配套的 Word 版是 <code>线性代数基础·让会倒的东西站住.docx</code>。',
            '本页所有曲线与读数可由 <code>tools/render_figures_control.py</code> 复算'
            '（a ＝ 1、c ＝ 0.2，两个倍数 +0.9050 与 −1.1050）；'
            '<code>FIG_THEME=dark</code> 出的是本页这套墨底图，浅色那套给 Word。',
            '想从头读这一站，进 <a href="index.html">项目导航页</a>；'
            '上一篇是 <a href="../项目/文章.html">一捆数与一张表</a>。',
        ],
        "stations": [
            {"after": "从别处出发的一捆数走的是弯线",
             "src": "views/01-站不住的点.html", "h": 870, "tag": "VIEW 01", "title": "站不住的点",
             "do": "拖画布上的灰点。<b>拖到红线附近</b>，它笔直地冲出去；<b>拖到青线上</b>，它笔直地缩回来；"
                   "拖到别处，先绕一圈再被甩掉。滑条是阻尼 c，两个倍数当场重算。"},
            {"after": "这条线一直往下走，越走越慢",
             "src": "views/02-内因改不动.html", "h": 830, "tag": "VIEW 02", "title": "内因改不动",
             "do": "<b>把 c 一路拉到 3</b>，看正的那个倍数往下掉、却永远不掉过零；"
                   "<b>再把 a 拖到 0 以下</b>，红青两半当场对调——同一根棍子，只差一个符号，稳不稳换了个个儿。"},
            {"after": "这件事本身也有意思",
             "src": "views/03-把线接回来.html", "h": 920, "tag": "VIEW 03", "title": "把线接回来",
             "do": "<b>把 k₁ 拖到 a 以下、再拖过 a</b>，看判词当场变色；"
                   "按「刚好抵消」看压在临界上的那一下，按「搬到 −1 与 −2」看劲使对了以后两个倍数有多干净。"},
            {"after": "是复平面上的事",
             "src": "views/04-把倍数搬家.html", "h": 740, "tag": "VIEW 04", "title": "把倍数搬家",
             "do": "<b>拖复平面上的目标圆圈</b>，力替你算出来，两条互不相通的算路并排印在右边；"
                   "再把其中一只往上拖到不共轭——它会直接告诉你这一对做不到。"},
            {"after": "两处塌缩：落在一条线上还救得回来",
             "src": "views/05-搬不动的时候.html", "h": 920, "tag": "VIEW 05", "title": "搬不动的时候",
             "do": "拖 b 的两个分量，或者直接按「对准跑掉那条线／对准回来那条线」："
                   "看平行四边形怎么扁成一条线段，<b>再看两处塌缩的判词为什么相反</b>；"
                   "按「偏一点点」还能看面积从 0 变小时力怎么涨上去。",
             "tall": True},
        ],
    },

    "one": {
        "md": "线性代数基础·一捆数与一张表.md",
        "out": os.path.join("项目", "文章.html"),
        "md_fig": "图/",
        "web_fig": "图/",
        "title": "一捆数与一张表 · 线性代数基础 11",
        "eyebrow": "LINEAR ALGEBRA · 第 11 站",
        "h1": ("线性代数基础 11", "一捆数与一张表"),
        "lede": ("上一篇说，相空间里的一个点就是一个状态；还顺手写了句「可以写成矩阵形式」，然后就没有然后了。"
                 "这一篇还这笔账：两个数并排放，从来是一支从原点出发的箭头——一捆数；"
                 "规律作用在这一捆上，就是一个固定的摁法——一张表。表怎么来、两张表连着摁为什么先后有别、"
                 "摁弯的网格里为什么总有两条方向一动不动、面积放大还是摁扁，都在这五站里。"),
        "footer": [
            '配图与可交互的五站见配套项目 <code>项目/</code>（离线自足，双击即可打开）；'
            '配套的 Word 版是 <code>线性代数基础·一捆数与一张表.docx</code>。',
            '本页所有曲线与读数可由 <code>tools/render_figures.py</code> 复算；'
            '<code>FIG_THEME=dark</code> 出的是本页这套墨底图，浅色那套给 Word。',
            '想从头读这一站，进 <a href="index.html">项目导航页</a>；'
            '下一篇是 <a href="../控制项目/文章.html">让会倒的东西站住</a>。',
        ],
        "stations": [
            {"after": "整捆放大、缩小、反向",
             "src": "views/01-向量工场.html", "h": 750, "tag": "VIEW 01", "title": "向量工场",
             "do": "拖两支箭头的头。<b>按「平行四边形画法」</b>，看首尾相接与平行四边形两条路走到同一个终点；"
                   "<b>按「整捆放大 2u」「反向 −u」</b>，看整捆按比例变长变短——反向不过是按负的比例放。"},
            {"after": "表摁在整张平面上：网格歪的歪、转的转",
             "src": "views/02-矩阵作用台.html", "h": 910, "tag": "VIEW 02", "title": "矩阵作用台",
             "do": "四个格子填的就是这张表 M：<b>一格一格改</b>，看整张网格怎么被摁弯；"
                   "拖绿箭头的头改这一捆数 u，也可以直接把 u 的两个数敲进去；"
                   "下面那行读数把「u 被送到哪儿」写成数——数与图上那支紫箭头是同一件事。"},
            {"after": "合表的每一列，就是先摁那张表的对应列再被摁一次",
             "src": "views/03-先后有别.html", "h": 890, "tag": "VIEW 03", "title": "先后有别",
             "do": "两张表各四个格子。<b>先改 A 再改 B</b>，盯同一个起点被送到哪儿；"
                   "再把两张表都改成各自方向上的伸缩——谁也别挡谁的路，先后就无所谓了，这就是「顺序有别」的反例。",
             "tall": True},
            {"after": "这正是 01 篇那条“线性关系适应叠加原理”的深层面目",
             "src": "views/04-特征方向.html", "h": 830, "tag": "VIEW 04", "title": "特征方向",
             "do": "表可以手填，也可以按「弹簧系统（相图）」切成 m、k、c 三个参数。"
                   "<b>沿着那两条不变的方向拖</b>，箭头只改长短；<b>把阻尼 c 从 0 推过临界</b>，"
                   "两条实方向就在那一刻冒出来——量变到质变的那个点，能亲手摸到。"},
            {"after": "已知结果反推原因：反得回去与反不回去",
             "src": "views/05-行列式与反作用.html", "h": 880, "tag": "VIEW 05", "title": "行列式与反作用",
             "do": "<b>把「往摁扁的方向走」推到 1</b>，看平行四边形怎么塌成一条线、放大倍数落到 0；"
                   "再拖一个目标 b 出来，看反推回去是一条唯一的箭头，还是一整条线上的每一捆都行。"},
        ],
    },
    "observe": {
        "md": "线性代数基础·看不见的状态.md",
        "out": os.path.join("观测项目", "文章.html"),
        "md_fig": "观测图/",
        "web_fig": "图/",
        "title": "看不见的状态 · 线性代数基础 13",
        "eyebrow": "LINEAR ALGEBRA · 第 13 站",
        "h1": ("线性代数基础 13", "看不见的状态"),
        "lede": ("上一篇每一次反解，都先写下一支箭头：歪了多少、歪得多快。可手立棍子的时候，眼睛交上来的只是一个数。"
                 "这一篇先撞「一个数定不住两个数」，再撞「两次读数相减也不能把它逼出来」，"
                 "最后退到造一个复制品、用读数差把它拉住——而最后一站会拧一拧「测什么」，"
                 "让你看见有一条特征线，整条躲在影子里。"),
        "footer": [
            '配图与可交互的五站见配套项目 <code>观测项目/</code>（离线自足，双击即可打开）；'
            '配套的 Word 版是 <code>线性代数基础·看不见的状态.docx</code>。',
            '本页所有曲线与读数可由 <code>tools/render_figures_observer.py</code> 复算'
            '（a ＝ 1、c ＝ 0.2，两个倍数 +0.9050 与 −1.1050）；'
            '<code>FIG_THEME=dark</code> 出的是本页这套墨底图，浅色那套给 Word。',
            '想从头读这一站，进 <a href="index.html">项目导航页</a>；'
            '上一篇是 <a href="../控制项目/文章.html">让会倒的东西站住</a>。',
        ],
        "stations": [
            {"after": "一个数只能定住一维",
             "src": "views/01-只看见一个数.html", "h": 886, "tag": "VIEW 01", "title": "只看见一个数",
             "do": "拖画布上的绿点，再用滑条把橙点推远。<b>两个点的读数一栏始终是同一个数</b>，"
                   "而右侧那两笔力会越差越多——那是「把看不见的那个当零」的代价。"},
            {"after": "它在原理上被夹住了",
             "src": "views/02-差分这条路.html", "h": 886, "tag": "VIEW 02", "title": "差分这条路",
             "do": "把噪声 σ 拖到 0.008、再把间隔 h 拖到 0.005。<b>橙色那条折线会盖过真值</b>；"
                   "反过来把 h 往大拖，误差的读数换成截断那一项在涨。"},
            {"after": "谁笑到最后看谁长得快",
             "src": "views/03-让影子跟着跑.html", "h": 944, "tag": "VIEW 03", "title": "让影子跟着跑",
             "do": "先把「初值差有多大」从 0.05 拉到 0.8——<b>偏差的走势一点没变</b>；"
                   "再把方向拖到 312.1°，同一份差自己缩了回去。方向才是那个要紧的量。"},
            {"after": "这就是为什么行与列必须一开始就分清",
             "src": "views/04-纠正减在第一列.html", "h": 900, "tag": "VIEW 04", "title": "纠正减在第一列",
             "do": "把 l₁ 拖到 −0.2，两个倍数里有一个正好落在零上；<b>再往左一寸，判词就翻成「跑」</b>。"
                   "拖到右上方那一片，两个倍数都进左半边。"},
            {"after": "换了个位置说",
             "src": "views/05-影子里那条线.html", "h": 928, "tag": "VIEW 05", "title": "影子里那条线",
             "do": "把角度拖到 132.1°，再把力度开到 10 倍。<b>那个 +0.905 一动不动</b>；"
                   "转到 42.1° 再试——被藏起来的是 −1.105，另一个还搬得动，影子追得上。"},
        ],
    },
}


# ============================================================
# 六 · 组装
# ============================================================
def parse_blocks(md_text):
    """把 md 切成块：(kind, raw)。kind ∈ {p, img, fm}"""
    lines = [l.rstrip() for l in md_text.split("\n")]
    blocks = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith("# "):
            i += 1
            continue
        if line.startswith("!["):
            m = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line)
            blocks.append(("img", m.group(1), m.group(2)))
            i += 1
            continue
        if line.startswith("$$"):
            buf = [line]
            while not (buf[-1].strip().endswith("$$") and len(buf[-1].strip()) > 2):
                i += 1
                buf.append(lines[i].strip())
            raw = " ".join(buf)
            body = raw.strip()[2:]
            if body.endswith("$$"):
                body = body[:-2]
            blocks.append(("fm", body.strip(), None))
            i += 1
            continue
        blocks.append(("p", line, None))
        i += 1
    return blocks


def build(key):
    conf = ARTICLES[key]
    md_path = os.path.join(ROOT, conf["md"])
    md = open(md_path, encoding="utf-8").read()
    blocks = parse_blocks(md)

    # 站点插在哪块之后：按"原文里必须有这一段"配对，配不上就报错，不猜
    insert_after = {}
    for st in conf["stations"]:
        hits = [n for n, b in enumerate(blocks) if st["after"] in b[1]]
        if len(hits) != 1:
            raise SystemExit("[站点配不上] 「%s」在 md 里命中 %d 处（应恰好 1 处）" % (st["after"], len(hits)))
        insert_after.setdefault(hits[0], []).append(st)

    out_dir = os.path.dirname(os.path.join(ROOT, conf["out"]))
    parts = []
    stats = {"p": 0, "img": 0, "fm": 0, "station": 0, "inline": 0}

    for n, b in enumerate(blocks):
        if b[0] == "p":
            parts.append(para_html(b[1]))
            stats["p"] += 1
            stats["inline"] += len(RE_INLINE.findall(b[1]))
        elif b[0] == "fm":
            parts.append('<div class="fm">%s</div>' % tex(b[1], display=True))
            stats["fm"] += 1
        else:
            alt, src = b[1], b[2]
            assert src.startswith(conf["md_fig"]), "图路径不是约定的 %s：%s" % (conf["md_fig"], src)
            web = conf["web_fig"] + src[len(conf["md_fig"]):]
            if not os.path.exists(os.path.join(out_dir, web)):
                raise SystemExit("[缺图] %s" % os.path.join(out_dir, web))
            parts.append(figure_html(alt, src, web))
            stats["img"] += 1

        for st in insert_after.get(n, []):
            if not os.path.exists(os.path.join(out_dir, st["src"])):
                raise SystemExit("[缺站] %s" % st["src"])
            parts.append(station_html(st))
            stats["station"] += 1

    html = (PAGE
            .replace("__TITLE__", conf["title"])
            .replace("__CSS__", CSS)
            .replace("__EYEBROW__", conf["eyebrow"])
            .replace("__H1L__", conf["h1"][0])
            .replace("__H1R__", conf["h1"][1])
            .replace("__LEDE__", conf["lede"])
            .replace("__BODY__", "\n\n".join(parts))
            .replace("__FOOTER__", "\n".join("    <p>%s</p>" % f for f in conf["footer"])))

    dst = os.path.join(ROOT, conf["out"])
    with open(dst, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("写出 %-28s %5.1f KB  段 %d · 图 %d · 展示公式 %d · 行内公式 %d · 站点 %d"
          % (conf["out"], len(html.encode("utf-8")) / 1024.0,
             stats["p"], stats["img"], stats["fm"], stats["inline"], stats["station"]))
    return stats


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("all", "control"):
        build("control")
    if which in ("all", "one", "11"):
        build("one")
    if which in ("all", "observe", "13"):
        build("observe")


if __name__ == "__main__":
    main()
