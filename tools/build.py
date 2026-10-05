#!/usr/bin/env python3
"""Builds ./public (the game's static files) and ./src's shared relay modules from the game source.
Run from the realm-cloudflare folder:  python3 tools/build.py [path/to/realm]"""
import shutil, sys, pathlib
here = pathlib.Path(__file__).resolve().parent.parent
game = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else (here.parent / 'realm')
assert (game / 'index.html').exists(), f'game source not found at {game}'
# the relay modules are shared with the browser, so there is ONE source of truth
for name in ('relayProtocol.js', 'relayLogic.js'):
    shutil.copyfile(game / 'js/shared' / name, here / 'src' / name)
public = here / 'public'
if public.exists():
    keep = public / 'relay-config.js'
    saved = keep.read_text() if keep.exists() else None
    shutil.rmtree(public)
else:
    saved = None
public.mkdir()
shutil.copyfile(game / 'index.html', public / 'index.html')
shutil.copytree(game / 'css', public / 'css'); shutil.copytree(game / 'js', public / 'js')
(public / 'relay-config.js').write_text(saved if saved is not None else (game / 'relay-config.js').read_text())    # keeps YOUR edits to relay-config.js between builds
print('built', public, '-', sum(1 for _ in public.rglob('*') if _.is_file()), 'files')
