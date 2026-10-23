# ============================================================
# tools/verify_station_article.py —— 正文页验收（新形式）
#
# 判据都从"源"独立算，不拿生成器的中间量自证：
#   1. 段：md 每个段落抹掉 $...$ 与 ** 之后的文字，必须逐字等于页面上该段的文字
#      （页面那边要把 .im 里的公式文字剔除——公式落在 <sup>/<sub>/<span> 里）
#   2. 数：md 里 $...$ 的对数 = 页面 .im 的个数；$$ 块数 = .fm 个数；![] 数 = figure 数
#   3. 矩阵：md 里每个 pmatrix 的"几行几列、每格是什么"逐格比对页面上 .mx 的格子
#   4. 图：每个 img 的文件都在磁盘上；图题与正文里那句话一致（alt = figcaption）
#   5. 站：五站都在、src 落盘、顺序与正文锚点的先后一致、
#          .do 里点名的控件在该站页面里真的存在（防止"指引写着别站的滑条"）
#   6. 形式：单文件（无外链 css/js、无 http 资源）、样式只有一块、
#          配色只在 :root 里出现（别处只许 var()）
#
# 跑法：python tools/verify_station_article.py
# ============================================================
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ARTICLES = [
    ("控制项目/文章.html", "线性代数基础·让会倒的东西站住.md", "控制项目"),
    ("项目/文章.html", "线性代数基础·一捆数与一张表.md", "项目"),
    ("观测项目/文章.html", "线性代数基础·看不见的状态.md", "观测项目"),
]

R = {"pass": 0, "fail": 0, "fails": []}


def reset():
    R.update({"pass": 0, "fail": 0, "fails": []})


def ok(cond, name, detail=""):
    if cond:
        R["pass"] += 1
        print("  ✓ " + name)
    else:
        R["fail"] += 1
        R["fails"].append(name)
        print("  ✗ " + name + ("　—— " + detail if detail else ""))


# ---------- 页面结构解析 ----------
VOID = {"img", "br", "link", "meta", "input", "hr", "source", "col", "area", "base", "wbr"}


class Page(HTMLParser):
    """只取我们需要的东西：article 的一级块、图、站点、样式块、外链。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []          # {"kind":p/figure/fm/station, "text":..., "im":n, "img":(src,alt), "do":[...]}
        self.stack = []
        self.in_article = 0
        self.in_style = 0
        self.styles = []
        self.links = []
        self.scripts = []
        self.iframes = []
        self.headings = []
        self.cur = None
        self.cur_depth = None
        self.skip_im = 0
        self.in_caption = 0
        self.in_do = 0
        self.in_h1 = 0
        self.text_buf = []

    # ---- 工具 ----
    def _start_block(self, kind, depth):
        self.cur = {"kind": kind, "text": "", "im": 0, "img": None, "do": [], "src": None}
        self.cur_depth = depth
        self.text_buf = []

    def _close_block(self, depth):
        if self.cur is not None and depth == self.cur_depth:
            self.cur["text"] = "".join(self.text_buf)
            self.blocks.append(self.cur)
            self.cur = None
            self.cur_depth = None
            self.text_buf = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "")
        # 空元素（img/link/meta…）没有结束标签，压进栈会让后面的层数整体错位
        if tag in VOID:
            depth = len(self.stack) + 1
        else:
            self.stack.append(tag)
            depth = len(self.stack)

        if tag == "article":
            self.in_article = depth
            return
        if tag == "style":
            self.in_style = depth
            return
        if tag == "h1":
            self.in_h1 = depth
            return
        if tag == "link":
            self.links.append(a)
        if tag == "script":
            self.scripts.append(a)
        if tag == "iframe":
            self.iframes.append(a.get("src"))
            if self.cur is not None:
                self.cur["src"] = a.get("src")
        if tag == "img" and self.cur is not None and self.cur["kind"] == "figure":
            self.cur["img"] = (a.get("src"), a.get("alt"))

        if not self.in_article:
            return

        if depth == self.in_article + 1:
            if tag == "p":
                self._start_block("p", depth)
            elif tag == "figure":
                self._start_block("figure", depth)
            elif tag == "div" and cls == "fm":
                self._start_block("fm", depth)
            elif tag == "div" and cls.startswith("station"):
                self._start_block("station", depth)
            return

        if self.cur is not None:
            if tag == "span" and "im" in cls.split():
                self.cur["im"] += 1
                self.skip_im = depth
            elif tag == "figcaption":
                self.in_caption = depth
            elif tag == "p" and "do" in cls.split():
                self.in_do = depth

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        depth = len(self.stack)
        if tag == "article":
            self.in_article = 0
        elif tag == "style":
            self.in_style = 0
        elif tag == "h1":
            self.in_h1 = 0
        if self.skip_im and depth == self.skip_im:
            self.skip_im = 0
        if self.in_caption and depth == self.in_caption:
            self.in_caption = 0
        if self.in_do and depth == self.in_do:
            self.in_do = 0
        if self.cur is not None and depth == self.cur_depth and tag in ("p", "figure", "div"):
            self._close_block(depth)
        if self.stack:
            self.stack.pop()

    def handle_data(self, data):
        if self.in_style:
            self.styles.append(data)
            return
        if self.in_h1:
            self.headings.append(data)
            return
        if self.cur is None or self.skip_im:
            return
        if self.cur["kind"] == "figure" and not self.in_caption:
            return
        if self.in_do:
            self.cur["do"].append(data)
        self.text_buf.append(data)


def parse(path):
    p = Page()
    p.feed(open(path, encoding="utf-8").read())
    return p


# ---------- md 侧 ----------
RE_INLINE = re.compile(r"(?<!\$)\$([^$]+)\$(?!\$)")


def md_blocks(md):
    """与生成器同一套切块规则，但这里只用来做"独立的那一侧"。"""
    out = []
    lines = [l.rstrip() for l in md.split("\n")]
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line or line.startswith("# "):
            i += 1
            continue
        if line.startswith("!["):
            m = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line)
            out.append(("img", m.group(1), m.group(2)))
            i += 1
            continue
        if line.startswith("$$"):
            buf = [line]
            while not (buf[-1].strip().endswith("$$") and len(buf[-1].strip()) > 2):
                i += 1
                buf.append(lines[i].strip())
            raw = " ".join(buf).strip()
            out.append(("fm", raw[2:-2].strip(), None))
            i += 1
            continue
        out.append(("p", line, None))
        i += 1
    return out


def plain_para(t):
    t = RE_INLINE.sub("", t)              # 去掉公式
    t = t.replace("**", "")               # 去掉粗体记号
    return t


def latex_matrices(tex):
    """从 md 的 LaTeX 里数格子：每行几格、每格原文。"""
    out = []
    for m in re.finditer(r"\\begin\{pmatrix\}(.*?)\\end\{pmatrix\}", tex, re.S):
        body = m.group(1)
        rows = [r.strip() for r in body.split("\\\\")]
        grid = [[c.strip() for c in r.split("&")] for r in rows if r.strip()]
        out.append(grid)
    return out


def inner_span(html, k):
    """取以 <span …> 开头的那一段的内部 HTML（自己数嵌套，非贪婪正则会截在第一个 </span>）。"""
    j = html.index(">", k) + 1
    start = j
    depth = 1
    while j < len(html):
        if html.startswith("<span", j):
            depth += 1
            j = html.index(">", j) + 1
        elif html.startswith("</span>", j):
            depth -= 1
            if depth == 0:
                return html[start:j]
            j += len("</span>")
        else:
            j += 1
    return ""


def html_matrices(html):
    """从页面里数格子：grid-template-columns 的数字 + 每个 .c 的格子内容。"""
    out = []
    pos = 0
    while True:
        k = html.find('<span class="mx">', pos)
        if k < 0:
            break
        # 整块 mx 的内部：自己数嵌套，不能靠非贪婪正则
        j = html.index(">", k) + 1
        depth = 1
        while j < len(html) and depth:
            if html.startswith("<span", j):
                depth += 1
                j = html.index(">", j) + 1
            elif html.startswith("</span>", j):
                depth -= 1
                j += len("</span>")
            else:
                j += 1
        seg = html[k:j]

        m = re.search(r"repeat\((\d+),auto\)", seg)
        cells = []
        p2 = 0
        while True:
            c = seg.find('<span class="c">', p2)
            if c < 0:
                break
            inner = inner_span(seg, c)
            cells.append(inner)
            p2 = c + len('<span class="c">') + len(inner) + len("</span>")
        out.append({"cols": int(m.group(1)) if m else None, "cells": cells})
        pos = j
    return out


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s)


# 这一份「LaTeX 记号 → 页面字形」的小表是**另写**的，不引用生成器里那份。
# 两边对得上，说明页面上印的确实是这个符号；若只共用一张表，表本身错了也照样全绿。
TEX2TXT = [
    (r"\theta", "θ"), (r"\omega", "ω"), (r"\lambda", "λ"), (r"\pm", "±"),
    (r"\det", "det"), (r"\cdot", "·"), (r"\text", ""), (r"\mathrm", ""),
]


def norm_tex_cell(c):
    t = c
    for a, b in TEX2TXT:
        t = t.replace(a, b)
    t = t.replace("{", "").replace("}", "").replace("$", "").replace("_", "").replace("^", "")
    t = t.replace("-", "−").replace("'", "′")
    return re.sub(r"\s+", "", t)


def norm_page_cell(h):
    return re.sub(r"\s+", "", strip_tags(h))


# ---------- 逐篇检查 ----------
CONTROL_TOKENS = ["k₁", "k₂", "c", "a", "b", "m", "M", "u"]


def check(html_rel, md_rel, proj):
    print("\n[%s]" % html_rel)
    html_path = os.path.join(ROOT, html_rel)
    md_path = os.path.join(ROOT, md_rel)
    html = open(html_path, encoding="utf-8").read()
    md = open(md_path, encoding="utf-8").read()
    page = parse(html_path)
    mdb = md_blocks(md)
    out_dir = os.path.dirname(html_path)

    # 1. 块数与顺序
    kinds_md = [b[0] for b in mdb]
    kinds_html = [b["kind"] for b in page.blocks if b["kind"] in ("p", "figure", "fm", "station")]
    have_st = kinds_html.count("station")
    idx = [i for i, k in enumerate(kinds_html) if k != "station"]
    ok([k if k != "img" else "figure" for k in kinds_md] == [kinds_html[i] for i in idx],
       "块的种类与顺序与 md 一致（%d 段 · %d 图 · %d 公式）" % (
           kinds_md.count("p"), kinds_md.count("img"), kinds_md.count("fm")),
       "md=%s 页=%s" % (kinds_md[:8], [kinds_html[i] for i in idx][:8]))
    ok(have_st == 5, "正文里嵌了 5 站", "实际 %d" % have_st)

    # 2. 段落逐字
    md_ps = [plain_para(b[1]) for b in mdb if b[0] == "p"]
    html_ps = [b["text"] for b in page.blocks if b["kind"] == "p"]
    ok(len(md_ps) == len(html_ps), "段数一致（%d）" % len(md_ps), "%d vs %d" % (len(md_ps), len(html_ps)))
    bad = [(i, a, b) for i, (a, b) in enumerate(zip(md_ps, html_ps)) if a != b]
    ok(not bad, "每段文字逐字等于 md（公式以外的部分）",
       "" if not bad else "第 %d 段起不一致：md「%s…」页「%s…」" % (bad[0][0] + 1, bad[0][1][:30], bad[0][2][:30]))

    # 3. 公式数
    n_inline_md = len(RE_INLINE.findall(md))
    n_im = sum(b["im"] for b in page.blocks)
    ok(n_inline_md == n_im, "行内公式个数一致（%d）" % n_inline_md, "md %d vs 页 %d" % (n_inline_md, n_im))
    n_fm_md = sum(1 for b in mdb if b[0] == "fm")
    n_fm_html = html.count('<div class="fm">')
    ok(n_fm_md == n_fm_html, "展示公式个数一致（%d）" % n_fm_md, "%d vs %d" % (n_fm_md, n_fm_html))

    # 4. 矩阵逐格
    lm = latex_matrices(md)
    hm = html_matrices(html)
    ok(len(lm) == len(hm), "矩阵个数一致（%d）" % len(lm), "%d vs %d" % (len(lm), len(hm)))
    trouble = []
    for n, (g, h) in enumerate(zip(lm, hm)):
        nrow, ncol = len(g), max(len(r) for r in g)
        if h["cols"] != ncol:
            trouble.append("第 %d 个：列数 md=%d 页=%s" % (n + 1, ncol, h["cols"]))
        if len(h["cells"]) != nrow * ncol:
            trouble.append("第 %d 个：格子数 md=%d 页=%d" % (n + 1, nrow * ncol, len(h["cells"])))
        for r, row in enumerate(g):
            for c, cell in enumerate(row):
                want = norm_tex_cell(cell)
                got = norm_page_cell(h["cells"][r * ncol + c]) if r * ncol + c < len(h["cells"]) else ""
                if want != got:
                    trouble.append("第 %d 个 第%d行第%d列：md「%s」页「%s」" % (n + 1, r + 1, c + 1, want, got))
    ok(not trouble, "每个矩阵的行列数与格子对得上", "；".join(trouble[:4]))

    # 5. 图与图题
    figs = [b for b in page.blocks if b["kind"] == "figure"]
    ok(len(figs) == kinds_md.count("img"), "图数一致（%d）" % len(figs))
    missing = [b["img"][0] for b in figs if not b["img"] or not os.path.exists(os.path.join(out_dir, b["img"][0]))]
    ok(not missing, "每张图的文件都在磁盘上", str(missing[:3]))
    cap_bad = [b["img"][0] for b in figs if not b["img"][1] or b["img"][1] != b["text"].strip()]
    ok(not cap_bad, "图题与 alt（也就是正文里那句话）一致", str(cap_bad[:3]))
    blank = [b["img"][0] for b in figs if b["img"] and not b["img"][1]]
    ok(not blank, "每张图都有 alt（不许空着）", str(blank[:3]))

    # 6. 站点
    srcs = [b["src"] for b in page.blocks if b["kind"] == "station"]
    ok(len(srcs) == 5 and all(srcs), "五个站点都有 iframe src", str(srcs))
    ok(all(os.path.exists(os.path.join(out_dir, s)) for s in srcs if s), "每站的页面文件都在磁盘上")
    dos = ["".join(b["do"]).strip() for b in page.blocks if b["kind"] == "station"]
    ok(all(dos), "每站都写了「动哪儿」的指引")
    ok(all("<b>" in html.split(d)[0][-800:] or len(d) > 40 for d in dos), "每站指引都具体（有加粗的动作或足够长）")
    # 指引里点名的控件必须在该站页面里真的存在
    bad_tok = []
    for s, d in zip(srcs, dos):
        if not s:
            continue
        # 上一行已经报「页面不在磁盘上」了；这里不许再直接 open，
        # 否则一条坏 src 会把验收自己撞崩（反向对照里正是这么崩的），
        # 崩掉的验收不算抓住故障。
        if not os.path.exists(os.path.join(out_dir, s)):
            bad_tok.append("%s 页面不在磁盘上，控件无从核对" % s)
            continue
        target = open(os.path.join(out_dir, s), encoding="utf-8").read()
        for tok in ["k₁", "k₂"]:
            if tok in d and tok not in target:
                bad_tok.append("%s 提到 %s，页面里没有" % (os.path.basename(s), tok))
    ok(not bad_tok, "指引点到的控件在该站页面里存在", "；".join(bad_tok))
    # 站点顺序与正文锚点顺序一致（两边各自单调）
    ok(len(set(srcs)) == 5, "五站不重复（没有同一站嵌两次）", str(srcs))
    # 横条上印的站名必须就是它真正嵌入的那个文件名（去掉 0N- 前缀与 .html）。
    # 两站的 src 一调换，横条还写着旧名字，这里立刻炸——不靠配置，靠两边各自印的东西。
    bars = [b["text"] for b in page.blocks if b["kind"] == "station"]
    name_bad = []
    for b, s_ in zip(bars, srcs):
        m = re.search(r"·\s*(.+?)配套项目", b)
        nm = m.group(1).strip() if m else ""
        if not nm or not s_:
            name_bad.append("横条没印出站名或没 src：%s" % b[:24])
            continue
        stem = re.sub(r"^\d+-", "", os.path.basename(s_)).replace(".html", "")
        if nm != stem:
            name_bad.append("横条写「%s」，嵌入的是「%s」" % (nm, stem))
    ok(not name_bad, "每站横条上的站名就是它嵌入的那个文件名", "；".join(name_bad[:3]))

    # 7. 单文件形式
    ok(not [l for l in page.links if "stylesheet" in (l.get("rel") or "")], "没有外链样式表")
    ok(not [s for s in page.scripts if s.get("src")], "没有外链脚本（公式不在浏览器里现算）")
    ok("http://" not in html.replace("http://www.w3.org", "") and "https://" not in html,
       "没有任何 http(s) 资源（离线自足）")
    ok(len(page.styles) == 1, "样式只有一块", "实际 %d 块" % len(page.styles))
    style = page.styles[0]
    root_m = re.search(r":root\s*\{(.*?)\}", style, re.S)
    ok(root_m is not None, "样式里有一处 :root 定色")
    rest = style[:root_m.start()] + style[root_m.end():] if root_m else style
    stray = re.findall(r"#[0-9a-fA-F]{3,8}\b", rest)
    ok(not stray, "配色只在 :root 里出现（别处只许 var(--…)）", "越界色值 %s" % sorted(set(stray))[:6])
    ok(style.count("var(--") >= 20, "样式确实在用变量（var(--…) 至少 20 处）", str(style.count("var(--")))

    # 8. 外壳
    ok('lang="zh-CN"' in html, "lang=zh-CN")
    ok("index.html" in html, "能回到项目导航页")
    ok(page.headings and page.headings[0].strip(), "有一级标题")
    ok("<footer>" in html, "有页脚（可复算与出处写在那儿）")


def run_forward():
    for html_rel, md_rel, proj in ARTICLES:
        check(html_rel, md_rel, proj)
    print("\n────────────────────────")
    print("正向检查：%d 通过，%d 失败。" % (R["pass"], R["fail"]))
    if R["fail"]:
        for f in R["fails"]:
            print("  - " + f)
    return R["fail"]


# ---------- 反向对照：往页面里塞八个故障，同一套判据必须逐个抓住 ----------
def _first_span(html, cls):
    k = html.find('<span class="%s">' % cls)
    return k, inner_span(html, k)


def _first_plain_char(html):
    """找第一个「在正文段落里、不在标签里」的汉字——改一个字用它。"""
    k = html.find("<p>")
    if k < 0:
        return -1
    j = k + 3
    depth = 0
    while j < len(html):
        c = html[j]
        if c == "<":
            depth += 1
        elif c == ">":
            depth -= 1
        elif depth == 0 and "\u4e00" <= c <= "\u9fff":
            return j
        j += 1
    return -1


def faults(html):
    """返回 [(名字, 改坏的 html)]，每个只坏一处。

    故障的"抓手"一律从页面自己身上现找（第一个段落、第一个行内公式、第一个矩阵格子、
    第一条 iframe src……），不写死某一篇的句子——三篇共用同一套反向对照，
    否则给第二、第三篇跑的时候 == src 一个都改不动，"抓不住"会被误读成"判据空转"。
    """
    out = []

    j = _first_plain_char(html)
    if j >= 0:
        out.append(("改一个字", html[:j] + "某" + html[j + 1:]))

    k = html.find('<span class="im">')
    if k >= 0:
        inner = inner_span(html, k)
        out.append(("把一个行内公式拆成纯文本",
                    html[:k] + inner + html[k + len('<span class="im">') + len(inner) + len("</span>"):]))

    k = html.find('<span class="c">')
    if k >= 0:
        inner = inner_span(html, k)
        out.append(("改一格矩阵内容",
                    html[:k] + '<span class="c">−z</span>' + html[k + len('<span class="c">') + len(inner) + len("</span>"):]))

    m = re.search(r"<figcaption>.*?</figcaption>", html, re.S)
    if m:
        out.append(("删掉一条图题", html[:m.start()] + html[m.end():]))

    srcs = re.findall(r'src="(views/[^"]+)"', html)
    if srcs:
        out.append(("把一站指向不存在的页面",
                    html.replace('src="%s"' % srcs[0], 'src="views/99-不存在.html"', 1)))

    out.append(("掺一条外链样式表", html.replace("</head>", '<link rel="stylesheet" href="x.css">\n</head>', 1)))

    m = re.search(r":root\s*\{.*?\}", html, re.S)
    if m:
        out.append(("在 :root 外面硬写一个颜色",
                    html[:m.end()] + "\n  article{color:#ff0000;}" + html[m.end():]))

    # 两站的 src 对调，横条上的名字就与打开的那一页对不上了
    if len(srcs) >= 2:
        a, b = srcs[0], srcs[1]
        out.append(("两站的来源对调",
                    html.replace('src="%s"' % a, 'src="@@X@@"').replace('src="%s"' % b, 'src="%s"' % a)
                        .replace('src="@@X@@"', 'src="%s"' % b)))
    return out


def run_reverse():
    print("\n════════ 反向对照：每篇各塞八处故障，看判据是不是空转 ════════")
    total, caught_all, missed = 0, 0, []
    for html_rel, md_rel, proj in ARTICLES:
        src = open(os.path.join(ROOT, html_rel), encoding="utf-8").read()
        tmp_rel = os.path.join(os.path.dirname(html_rel), "_tmp_reverse.html").replace("\\", "/")
        tmp_abs = os.path.join(ROOT, tmp_rel)
        print("\n── %s" % html_rel)
        for name, bad in faults(src):
            total += 1
            if bad == src:
                print("  ! 故障「%s」没改动到任何东西——这条对照本身失效" % name)
                missed.append("%s/%s" % (html_rel, name))
                continue
            open(tmp_abs, "w", encoding="utf-8", newline="\n").write(bad)
            reset()
            import io
            buf = io.StringIO()
            old = sys.stdout
            sys.stdout = buf
            check(tmp_rel, md_rel, proj)
            sys.stdout = old
            first = [l for l in buf.getvalue().split("\n") if l.strip().startswith("✗")]
            if R["fail"] > 0:
                caught_all += 1
                print("  抓住 %d 条 · %s → %s" % (R["fail"], name, first[0].strip() if first else ""))
            else:
                missed.append("%s/%s" % (html_rel, name))
                print("  一条没抓住（判据在这里是空转的）· %s" % name)
        if os.path.exists(tmp_abs):
            os.remove(tmp_abs)
    print("\n反向对照：%d/%d 处故障被抓住。" % (caught_all, total))
    return len(missed)


def main():
    fail = run_forward()
    if "--reverse" in sys.argv:
        fail += run_reverse()
    if fail:
        sys.exit(1)


if __name__ == "__main__":
    main()
