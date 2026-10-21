# ============================================================
# tools/apply_dark_theme.py —— 把两个项目从浅色纸面改成参考项目那套深色
#
# 色值只有一个来源：tools/palette_dark.json。
# 做的事：
#   1. 重写 <项目>/assets/theme.css 的 :root 块（token 值换成深色那套）
#   2. 把 views/*.html、index.html、assets/draw.js 里硬写的旧浅色值换掉：
#        - 出现在 style="..." 里的 → var(--token)（行内也能用变量）
#        - 出现在脚本里的         → D.C.token（画布拿不到 CSS 变量，只能取算好的值）
#        - theme.css 自己          → var(--token)
#   3. 换完自查：旧色值一个不许剩（--check 只查不改）
#
# 跑法：
#   python tools/apply_dark_theme.py --check    # 只报数
#   python tools/apply_dark_theme.py            # 改
# ============================================================
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, "tools", "palette_dark.json"), encoding="utf-8"))
TOKENS = CFG["tokens"]
LEGACY = sorted(CFG["legacy"].items(), key=lambda kv: -len(kv[0]))  # 长的先换，防 #fff 抢 #ffffff

PROJECTS = ["项目", "控制项目"]

ROOT_KEEP = ["--radius", "--mono", "--sans"]


def slug(tok):
    """--ink-soft -> inkSoft"""
    parts = tok.lstrip("-").split("-")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)


# ---------- 1. theme.css 的 :root ----------
def new_root_block():
    lines = [":root {"]
    for k in ["--bg", "--panel", "--panel2", "--ink", "--ink-soft", "--line", "--grid", "--axis", "--paper"]:
        lines.append('  %s: %s;' % (k, TOKENS[k]))
    lines.append("")
    lines.append("  /* 数据色（与文章配图同源） */")
    for k, cmt in [("--u", "第一捆 u：绿 / b（力从哪儿进去）"),
                   ("--v", "第二捆 v：青 / 回来的那条线"),
                   ("--sum", "合成：琥珀 / 目标"),
                   ("--red", "特征方向：红 / 往外的那条线"),
                   ("--purple", "反作用：紫 / 相流"),
                   ("--ghost", "作用前的影子")]:
        lines.append('  %s: %s;   /* %s */' % (k, TOKENS[k], cmt))
    lines.append("")
    lines.append("  /* 控件与强调 */")
    for k in ["--accent", "--input-bg", "--hover", "--on-bg", "--pale-u", "--pale-sum", "--pale-purple", "--pale-v"]:
        lines.append('  %s: %s;' % (k, TOKENS[k]))
    lines.append("")
    lines.append('  --radius: 10px;')
    lines.append('  --mono: "SFMono-Regular", Consolas, "Liberation Mono", "Courier New", monospace;')
    lines.append('  --sans: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;')
    lines.append("}")
    return "\n".join(lines)


def rewrite_theme_css(text):
    m = re.search(r":root\s*\{.*?\n\}", text, re.S)
    if not m:
        raise SystemExit("theme.css 里找不到 :root 块")
    text = text[:m.start()] + new_root_block() + text[m.end():]
    head_old = "浅色主题：纸面白底，墨色文字。"
    head_new = "深色主题：墨底纸面，浅墨文字（照 D:/汽车悬挂系统 那篇正文页的配色）。"
    return text.replace(head_old, head_new)


# ---------- 2. 视图与脚本里的硬写色 ----------
RE_STYLE_ATTR = re.compile(r'style="[^"]*"')


def replace_in_text(text, is_js):
    """返回 (新文本, 计数, 明细)"""
    cnt = 0
    detail = {}

    def tok_of(hexv):
        for old, tok in LEGACY:
            if old.lower() == hexv.lower():
                return tok
        return None

    # (a) 先在 style="..." 里换成 var(--token)
    def fix_attr(m):
        nonlocal cnt
        s = m.group(0)
        for old, tok in LEGACY:
            if old in s:
                n = s.count(old)
                s = s.replace(old, "var(%s)" % tok)
                cnt += n
                detail["var(%s)" % tok] = detail.get("var(%s)" % tok, 0) + n
        return s

    text = RE_STYLE_ATTR.sub(fix_attr, text)

    # (b1) 先处理"带引号的色值字面量"。这一步不能省：`o.color || "#1c2430"` 直接换掉
    #      引号里的部分会留下 "C.ink" 这样一个字符串，画布不认它，fillStyle 停在默认黑，
    #      整张图画成黑底——这条坑是踩过才写在这儿的。
    def emit(tok):
        if is_js == "draw":
            return "C.%s" % slug(tok)
        if is_js == "css":
            return "var(%s)" % tok      # 样式表里当然用变量，不是 D.C
        return "D.C.%s" % slug(tok)

    def fix_quoted(m):
        nonlocal cnt
        tok = tok_of(m.group(1))
        if tok is None:
            return m.group(0)
        out = emit(tok)                  # 连引号一起去掉
        cnt += 1
        detail[out] = detail.get(out, 0) + 1
        return out

    text = re.sub(r'"(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})"', fix_quoted, text)

    # (b2) 剩下的是裸着的色值（样式块、style=""、对象字面量）
    def fix_code(m):
        nonlocal cnt
        tok = tok_of(m.group(0))
        if tok is None:
            return m.group(0)
        out = emit(tok)
        cnt += 1
        detail[out] = detail.get(out, 0) + 1
        return out

    text = re.sub(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", fix_code, text)
    return text, cnt, detail


def left_over(text):
    hits = []
    for old, tok in LEGACY:
        if old in text:
            hits.append((old, text.count(old)))
    return hits


def main():
    check_only = "--check" in sys.argv
    total = 0
    problems = []
    for proj in PROJECTS:
        base = os.path.join(ROOT, proj)
        targets = [os.path.join(base, "index.html"),
                   os.path.join(base, "assets", "theme.css"),
                   os.path.join(base, "assets", "draw.js")]
        vdir = os.path.join(base, "views")
        targets += [os.path.join(vdir, f) for f in sorted(os.listdir(vdir)) if f.endswith(".html")]

        for p in targets:
            name = os.path.relpath(p, ROOT)
            text = read(p)
            if p.endswith("theme.css"):
                if check_only:
                    hits = left_over(text)
                    if hits:
                        print("  %-34s 待换 %s" % (name, ", ".join("%s×%d" % h for h in hits)))
                        total += sum(h[1] for h in hits)
                    continue
                new = rewrite_theme_css(text)
                new, cnt, detail = replace_in_text(new, is_js="css")
                if new != text:
                    write(p, new)
                print("  %-34s 改 %d 处  %s" % (name, cnt, detail if detail else ""))
                total += cnt
                if left_over(new):
                    problems.append((name, left_over(new)))
                continue

            is_js = "draw" if p.endswith("draw.js") else False
            if check_only:
                hits = left_over(text)
                if hits:
                    print("  %-34s 待换 %s" % (name, ", ".join("%s×%d" % h for h in hits)))
                    total += sum(h[1] for h in hits)
                continue
            new, cnt, detail = replace_in_text(text, is_js)
            if new != text:
                write(p, new)
            if cnt:
                print("  %-34s 改 %d 处  %s" % (name, cnt, detail))
            total += cnt
            if left_over(new):
                problems.append((name, left_over(new)))

    print("----")
    print(("待换" if check_only else "已换") + "共 %d 处" % total)
    if problems:
        print("!! 还有旧色没换掉：")
        for n, h in problems:
            print("   ", n, h)
        sys.exit(1)


if __name__ == "__main__":
    main()
