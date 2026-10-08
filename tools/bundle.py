#!/usr/bin/env python3
"""Bundles index.html + css + all scripts (in index.html order) into ONE self-contained html file.
Usage: python3 tools/bundle.py [output.html]   (run from the repo root; reads ./public)"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'public'          # the game lives in ./public in this repo
html = (root / 'index.html').read_text()
css = (root / 'css/style.css').read_text()
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '</style>')
def inline(m):
    js = (root / m.group(1)).read_text()
    assert '</script' not in js, m.group(1)
    return '<script>\n/* ' + m.group(1) + ' */\n' + js + '\n</script>'
html = re.sub(r'<script src="([^"]+)"(?: defer)?></script>', inline, html)
html = re.sub(r'<meta name="lazy-script" content="([^"]+)">', inline, html)          # one file: the late scripts are simply there already
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root.parent / 'ponyscapes.html')
out.write_text(html)
print('wrote', out, len(html) // 1024, 'KB')
