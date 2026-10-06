#!/usr/bin/env python3
"""Keeps the relay Worker in step with the game: copies the relay modules (shared with the browser) from public/js/shared into src/.
public/ IS the game source and is deployed as it is; nothing here touches it.   Run from the repo root:  python3 tools/build.py"""
import shutil, pathlib
here = pathlib.Path(__file__).resolve().parent.parent
for name in ('relayProtocol.js', 'relayLogic.js'):          # ONE source of truth: the copies the browser loads
    shutil.copyfile(here / 'public/js/shared' / name, here / 'src' / name)
print('relay modules synced into src/')
