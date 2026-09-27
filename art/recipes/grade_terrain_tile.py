"""Grade an already-seamless painted ground tile to a terrain albedo target.

Usage: python art/recipes/grade_terrain_tile.py in.png out.png r g b

Painted concept tiles arrive in on-screen colours; the renderer's sun and grade
lift terrain albedo roughly 2x, so the tile is scaled in linear light to the
given sRGB mean. Luminance scales everything; the per-channel retint is applied
in proportion to each pixel's saturation, so grey pebbles stay grey instead of
picking up the hue correction.
"""
import sys
import numpy as np
from PIL import Image

def lin(c): return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)
def srgb(c): return np.where(c <= .0031308, c * 12.92, 1.055 * np.clip(c, 0, 1) ** (1 / 2.4) - .055)

src, dst, *target = sys.argv[1:6]
a = lin(np.asarray(Image.open(src).convert('RGB').resize((1024, 1024), Image.LANCZOS)).astype(float) / 255)
goal = lin(np.array([float(v) for v in target]) / 255)
W = np.array([.2126, .7152, .0722])
a *= (goal @ W) / (a @ W).mean()
lum = (a @ W)[..., None]
sat = np.clip((a.max(-1) - a.min(-1)) / np.maximum(a.max(-1), 1e-6), 0, 1)[..., None]
tint = goal / a.reshape(-1, 3).mean(0)
tint /= tint @ W  # luminance-neutral hue correction
a = a * (1 + (tint - 1) * np.clip(sat / sat.mean(), 0, 1))
a *= goal / a.reshape(-1, 3).mean(0)
out = (np.clip(srgb(a), 0, 1) * 255 + .5).astype(np.uint8)
Image.fromarray(out).save(dst)
print(dst, 'mean', out.reshape(-1, 3).mean(0).round())
