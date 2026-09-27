"""Recolour the woodland pine bough atlas onto the vibrant conifer palette.

Usage: python art/recipes/woodland_pine_atlas.py in.png out.png

Keeps the painted bough silhouettes (alpha) and their luminance detail, then
maps that detail through a saturated dark-to-light conifer ramp. Sprig tips
near the silhouette are lifted toward yellow-green so every tier carries a
bright rim like the art-direction reference; the bough cores stay deep green
so gaps between tiers read as shade. Values are albedo for a white
baseColorFactor: the renderer's sun, sky and grade lift them ~2x, and the sky
ambient adds blue, so blue is kept low here.
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter

RAMP = np.array([  # sRGB albedo stops at t = 0, .5, 1
    [12, 30, 14],
    [30, 62, 20],
    [78, 112, 30],
], float) / 255

def ramp(t):
    t = np.clip(t, 0, 1)[..., None]
    lo = RAMP[0] + (RAMP[1] - RAMP[0]) * np.clip(t * 2, 0, 1)
    return np.where(t < .5, lo, RAMP[1] + (RAMP[2] - RAMP[1]) * np.clip(t * 2 - 1, 0, 1))

def main(src, dst):
    im = np.asarray(Image.open(src).convert('RGBA')).astype(float) / 255
    alpha = im[..., 3]
    solid = alpha > .4
    lum = im[..., :3] @ [.3, .59, .11]
    ok = lum[solid]
    t = (lum - np.percentile(ok, 3)) / (np.percentile(ok, 97) - np.percentile(ok, 3))
    # Distance inside the silhouette, in texels: tips/edges are the first ~14 px.
    inside = distance_transform_edt(solid)
    rim = np.clip(1 - inside / 14, 0, 1) ** 1.5
    core = gaussian_filter(solid.astype(float), 24)
    t = t * .75 + rim * .35 - (core - .5) * .25
    rgb = ramp(t)
    _, (iy, ix) = distance_transform_edt(~solid, return_indices=True)
    rgb = rgb[iy, ix]  # bleed colour under transparent texels so mips stay clean
    out = np.dstack([rgb, alpha])
    Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8), 'RGBA').save(dst)
    a = (rgb[solid] * 255)
    print(dst, 'p10', np.percentile(a, 10, 0).round(), 'p50', np.percentile(a, 50, 0).round(), 'p90', np.percentile(a, 90, 0).round())

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
