# -*- coding: utf-8 -*-
"""verify_article_form.py —— 正文页"新形式"判据的反向对照

把故障装回 文章.html，看 <项目>/tools/verify-repo-style.cjs 里那几条
「单文件 · 自带 :root · 公式服务端产出 · 项目就地内嵌」的判据抓不抓得住。
判据全绿只说明"现在没坏"，不说明"坏了会红"；这一步补的就是后半句。

用法：python tools/verify_article_form.py [项目名]   （默认 控制项目）
跑完自动还原，不改动任何交付物。
"""
import io
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJ = os.path.join(ROOT, sys.argv[1] if len(sys.argv) > 1 else "控制项目")
ART = os.path.join(PROJ, "文章.html")
BAK = ART + ".bak_mutate"
NODE = r"C:/Users/Lenovo/.workbuddy/binaries/node/versions/22.22.2-6/node.exe"

MUTS = [
    ("加一条外链样式表",
     lambda s: s.replace("</head>", '<link rel="stylesheet" href="assets/theme.css">\n</head>', 1)),
    ("在 :root 外面硬写一个颜色",
     lambda s: s.replace(".do{", ".do{color:#ff0000;", 1)),
    ("把一站指向不存在的页面",
     lambda s: s.replace('<iframe src="views/01-', '<iframe src="views/99-', 1)),
    ("正文里塞一段没转的 LaTeX 源码",
     lambda s: s.replace("</article>", "<p>$\\alpha + \\beta$</p>\n</article>", 1)),
    # 注意：不能把 <iframe 改成 <iframex——它照样满足 <iframe[^>]*src=，
    # 故障其实没装上，却会被读成"判据空转"。要整块删掉。
    ("少嵌一站",
     lambda s: __import__("re").sub(r"<iframe[\s\S]*?</iframe>", "", s, count=1)),
]


def run():
    p = subprocess.run([NODE, "tools/verify-repo-style.cjs"], cwd=PROJ,
                       capture_output=True)
    out = (p.stdout + p.stderr).decode("utf-8", "replace")
    return [l.strip() for l in out.splitlines() if "✗" in l], p.returncode


def main():
    src = io.open(ART, encoding="utf-8").read()
    shutil.copyfile(ART, BAK)
    bad = 0
    try:
        base, code = run()
        print("基线：%d 条报错（应为 0）" % len(base))
        if code != 0:
            bad += 1
        for name, fn in MUTS:
            mutated = fn(src)
            if mutated == src:
                print("[故障] %s\n  → 没装上（替换点没命中），这一条未执行" % name)
                bad += 1
                continue
            io.open(ART, "w", encoding="utf-8").write(mutated)
            fails, _ = run()
            if fails:
                print("[故障] %s\n  → 抓住 %d 条，第一条：%s" % (name, len(fails), fails[0]))
            else:
                print("[故障] %s\n  → ★ 一条都没抓住（判据空转）" % name)
                bad += 1
    finally:
        shutil.copyfile(BAK, ART)
        os.remove(BAK)
    print("\n还原后复跑：", "通过" if not run()[0] else "★ 还原失败")
    print("结论：%d／%d 处故障被抓住。" % (len(MUTS) - bad, len(MUTS)) if bad == 0 else
          "结论：有 %d 处没被抓住或未执行。" % bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
