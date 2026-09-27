"""Tileable packed-earth albedo for woodland paths and hall rings.

Usage: python art/recipes/woodland_packed_earth.py out.png [soil|dirt]

Trodden earth reads at RTS distance as flat irregular plates split by thin dark
cracks, with warm low-frequency mottling and a few pale pebbles. Plates are a
periodic Voronoi (cKDTree boxsize wraps distances, so the tile has no seam);
noise is FFT-filtered white noise, periodic by construction. The luminance
doubles as height when the terrain publisher derives the NH normal/height map.
"""
import sys
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

N = 1024
# name: (seed, plates across, crack width, albedo mean sRGB, plate contrast, crack depth)
STYLES = {
    'soil': (11, 20, .007, (101, 82, 62), .24, .1),
    'dirt': (23, 24, .008, (94, 75, 56), .26, .14),
}

def periodic_noise(rng, scale):
    """Gaussian-filtered white noise on a torus; scale is the feature size in tile fractions."""
    f = np.fft.fftfreq(N)
    k2 = f[:, None] ** 2 + f[None, :] ** 2
    spectrum = np.fft.fft2(rng.standard_normal((N, N))) * np.exp(-k2 * (np.pi * scale * N) ** 2 / 2)
    n = np.real(np.fft.ifft2(spectrum))
    return (n - n.mean()) / n.std()

def build(style):
    seed, cells, crack_w, mean, contrast, crack_depth = STYLES[style]
    rng = np.random.default_rng(seed)
    g = (np.arange(cells) + .5) / cells
    pts = np.stack(np.meshgrid(g, g), -1).reshape(-1, 2)
    pts = (pts + (rng.random(pts.shape) - .5) * .85 / cells) % 1
    uv = (np.stack(np.meshgrid(np.arange(N), np.arange(N)), -1).reshape(-1, 2) + .5) / N
    # Warp lookups so plate borders wobble like trodden earth, not crystal facets.
    warp = np.stack([periodic_noise(rng, .02), periodic_noise(rng, .02)], -1).reshape(-1, 2) * .12 / cells
    d, idx = cKDTree(pts, boxsize=1).query((uv + warp) % 1, k=2)
    f1, f2 = d[:, 0].reshape(N, N), d[:, 1].reshape(N, N)
    edge = f2 - f1
    cell_value = rng.uniform(-1, 1, len(pts))[idx[:, 0]].reshape(N, N)
    crack = np.clip(1 - edge / crack_w, 0, 1) ** 1.5
    bevel = np.clip(edge / (crack_w * 9), 0, 1) ** .6      # soft plate rims carry the separation
    dome = 1 - (f1 * cells) ** 2 * .35
    mottle = periodic_noise(rng, .08) * .6 + periodic_noise(rng, .025) * .3
    grain = periodic_noise(rng, .002) * .5
    lum = 1 + contrast * (cell_value * .6 + mottle * .8 + grain * .35) + (dome - .9) * .5
    lum *= 1 - crack * crack_depth - (1 - bevel) * .2

    base = np.array(mean, float) / 255
    base = np.where(base <= .04045, base / 12.92, ((base + .055) / 1.055) ** 2.4)
    # Warmer, redder plates where the mottle is dark; drier, paler where it is light.
    warm = np.clip(mottle * .5, -1, 1)[..., None] * np.array([.05, 0, -.08])
    lin = base * lum[..., None] * (1 + warm)

    # Pale pebbles: small rounded dots with a darker contact rim.
    pebble_pts = rng.random((70, 2))
    pd, pi = cKDTree(pebble_pts, boxsize=1).query(uv, k=1)
    pd = pd.reshape(N, N)
    r = rng.uniform(1.5, 4.5, len(pebble_pts))[pi].reshape(N, N) / N
    stone = np.clip(1 - pd / r, 0, 1)
    rim = np.clip(1 - np.abs(pd - r * 1.25) / (r * .5), 0, 1)
    pebble_color = np.array([.16, .145, .125])
    lin = lin * (1 - rim[..., None] * .35)
    lin = lin * (1 - np.clip(stone * 3, 0, 1)[..., None]) + pebble_color * (.8 + stone[..., None] * .5) * np.clip(stone * 3, 0, 1)[..., None]

    lin *= base / lin.reshape(-1, 3).mean(0)
    srgb = np.where(lin <= .0031308, lin * 12.92, 1.055 * np.clip(lin, 0, 1) ** (1 / 2.4) - .055)
    return Image.fromarray((np.clip(srgb, 0, 1) * 255 + .5).astype(np.uint8))

if __name__ == '__main__':
    out, style = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'soil'
    img = build(style)
    img.save(out)
    a = np.asarray(img).reshape(-1, 3).astype(float)
    print(out, 'mean', a.mean(0).round(), 'lum std', (a @ [.3, .59, .11]).std().round(1))
