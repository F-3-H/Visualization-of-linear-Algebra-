# -*- coding: utf-8 -*-
"""把仓库里"该上网的那部分"拼成一个可直接托管的目录 `_site/`。

为什么要有这一步：仓库里还放着正文源稿（.md / .docx）、自检脚本（tests/、tools/）
和已经没人引用的旧 KaTeX 资产。这些不该出现在站点里——
既让部署包变大，也会把内部文件直接暴露成可下载的路径。

所以站点 = 白名单，不是黑名单：只搬下面 SITE 里点名的东西，
再断言"搬过去的东西一个不少、多余的一个没有"。

用法：
    python tools/build_site.py            # 生成 _site/
    python tools/build_site.py --check    # 只核对，不写盘
"""
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "_site")

# 站点根：入口页
ROOT_FILES = ["index.html", ".nojekyll"]

# 每个项目目录里，只搬这些（相对项目根）。None 表示整个目录搬。
PROJECTS = {
    "项目": ["index.html", "文章.html", "views", "assets/core.js", "assets/draw.js",
             "assets/theme.css", "图"],
    "控制项目": ["index.html", "文章.html", "views", "assets/core.js", "assets/draw.js",
                 "assets/theme.css", "图"],
    "观测项目": ["index.html", "文章.html", "views", "assets/core.js", "assets/draw.js",
                 "assets/theme.css", "图"],
    "观测项目": ["index.html", "文章.html", "views", "assets/core.js", "assets/draw.js",
                 "assets/theme.css", "图"],
    "复合项目": ["index.html", "views", "assets/core.js", "assets/draw.js", "assets/theme.css"],
    "span-lab": ["index.html", "css", "js", "docs"],
}

# 搬完后必须存在的路径（少一个就报错，不许静默漏）
MUST = [
    "index.html",
    "项目/index.html", "项目/文章.html",
    "控制项目/index.html", "控制项目/文章.html",
    "观测项目/index.html", "观测项目/文章.html",
    "观测项目/index.html", "观测项目/文章.html",
    "复合项目/index.html",
    "span-lab/index.html",
]

# 出现即报错：这些不许进站点
NEVER = ["README.md", "package.json", "tests", "tools", "assets/katex"]


def copy_one(rel, dst_root):
    src = os.path.join(ROOT, rel)
    dst = os.path.join(dst_root, rel)
    if not os.path.exists(src):
        raise SystemExit("[缺件] %s 不在盘上" % rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.isdir(src):
        shutil.copytree(src, dst, dirs_exist_ok=True)
    else:
        shutil.copy2(src, dst)


def build():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    for f in ROOT_FILES:
        copy_one(f, OUT)
    for proj, items in PROJECTS.items():
        for it in items:
            copy_one(os.path.join(proj, it).replace("\\", "/"), OUT)


def audit():
    bad = []
    for m in MUST:
        if not os.path.exists(os.path.join(OUT, m)):
            bad.append("缺 %s" % m)
    for root, dirs, files in os.walk(OUT):
        for d in list(dirs):
            if d in ("tests", "tools", "katex", "node_modules"):
                bad.append("不该有目录 %s" % os.path.relpath(os.path.join(root, d), OUT))
        for f in files:
            if f in ("README.md", "package.json"):
                bad.append("不该有文件 %s" % os.path.relpath(os.path.join(root, f), OUT))
    # 入口页指向的四个目录都得在
    html = open(os.path.join(OUT, "index.html"), encoding="utf-8").read()
    for link in ["项目/index.html", "控制项目/文章.html", "观测项目/文章.html",
                 "复合项目/index.html", "span-lab/index.html"]:
        if link not in html:
            bad.append("入口页没链到 %s" % link)
        elif not os.path.exists(os.path.join(OUT, link)):
            bad.append("入口页链了 %s，但包里没有" % link)
    return bad


def size_mb(p):
    t = 0
    for root, _, files in os.walk(p):
        for f in files:
            t += os.path.getsize(os.path.join(root, f))
    return t / 1024 / 1024


def main():
    if "--check" not in sys.argv:
        build()
    if not os.path.isdir(OUT):
        raise SystemExit("_site/ 还没生成")
    n = sum(len(fs) for _, _, fs in os.walk(OUT))
    bad = audit()
    print("_site/  %d 个文件 · %.1f MB" % (n, size_mb(OUT)))
    if bad:
        for b in bad:
            print("  ✗ " + b)
        raise SystemExit(1)
    print("  ✓ 白名单齐、黑名单干净、入口页五条链接都落得下")
    return 0


if __name__ == "__main__":
    sys.exit(main())
