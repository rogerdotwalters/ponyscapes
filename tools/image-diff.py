#!/usr/bin/env python3
"""Compares two screenshots: python3 tools/image-diff.py a.png b.png [diff.png]. Prints the share of pixels that differ (any channel by > 8) and by > 40."""
import sys
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int); b = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(int)
if a.shape != b.shape: print('size differs', a.shape, b.shape); sys.exit(1)
d = np.abs(a - b).max(axis=2); n = d.size
print(f'differ>8: {100*(d>8).sum()/n:.3f}%   differ>40: {100*(d>40).sum()/n:.3f}%   max: {d.max()}')
if len(sys.argv) > 3: Image.fromarray(np.clip(d * 4, 0, 255).astype('uint8')).save(sys.argv[3])
