"""Read reproducible sRGB pixels and robust material samples from a reference PNG."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def linear_rgb(rgb):
    return [round(c / 255 / 12.92 if c / 255 <= .04045 else ((c / 255 + .055) / 1.055) ** 2.4, 7) for c in rgb]


def describe(rgb):
    rgb = [int(c) for c in rgb]
    return {"rgb": rgb, "hex": "#" + "".join(f"{c:02x}" for c in rgb), "linear_rgb": linear_rgb(rgb)}


def extract(asset):
    asset = Path(asset)
    source = asset / "reference.png"
    image = Image.open(source).convert("RGB")
    pixels = np.asarray(image)
    height, width = pixels.shape[:2]
    points = json.loads((asset / "samples.json").read_text())
    samples = {}
    marked = image.copy()
    draw = ImageDraw.Draw(marked)
    for name, point in points.items():
        x, y = round(point["u"] * (width - 1)), round(point["v"] * (height - 1))
        if not (0 <= x < width and 0 <= y < height):
            raise ValueError(f"Sample {name} lies outside the image")
        radius = point.get("radius", 5)
        patch = pixels[max(0, y-radius):y+radius+1, max(0, x-radius):x+radius+1].reshape(-1, 3)
        median = np.median(patch, axis=0)
        # The robust sample is a REAL source pixel nearest the patch median, not an invented average.
        representative = patch[np.argmin(np.sum((patch.astype(float) - median) ** 2, axis=1))]
        samples[name] = {"x": x, "y": y, "u": point["u"], "v": point["v"], "radius": radius,
                         "pixel": describe(pixels[y, x]), "representative": describe(representative)}
        draw.ellipse((x-7, y-7, x+7, y+7), outline="white", width=2)
        draw.text((x+10, y-7), name, fill="white", stroke_width=2, stroke_fill="black")
    # Dominant clusters are only a guide; exclude pure black and near-black background.
    foreground = pixels[pixels.max(axis=2) > 24]
    if not len(foreground):
        raise ValueError("Reference has no foreground pixels")
    quant = Image.fromarray(foreground.reshape(1, -1, 3)).quantize(colors=18, method=Image.Quantize.MEDIANCUT)
    colors = quant.getpalette()
    dominant = [{**describe(colors[i*3:i*3+3]), "share": round(n / len(foreground), 5)}
                for n, i in sorted(quant.getcolors(), reverse=True)]
    result = {"source": "reference.png", "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
              "width": width, "height": height, "color_space": "display sRGB (image appearance, not inferred albedo)",
              "conversion": "IEC 61966-2-1 sRGB transfer function; linear values for Blender Base Color",
              "samples": samples, "dominant": dominant}
    (asset / "palette.json").write_text(json.dumps(result, indent=2) + "\n")
    marked.save(asset / "samples.png")
    config_path = asset / 'asset.json'
    config = json.loads(config_path.read_text()) if config_path.exists() else {}
    trace = config.get('emblem_trace')
    if trace:
        x0, y0, x1, y1 = trace['box']
        crop = pixels[y0:y1, x0:x1]
        r, g, b = crop.astype(float).transpose(2, 0, 1)
        mask = (r > 215) & (g > 170) & (b > 90) & (g / np.maximum(r, 1) > .70)
        yy, xx = np.where(mask)
        traced = {'source_box': trace['box'], 'width': crop.shape[1], 'height': crop.shape[0],
                  'threshold': 'r>215, g>170, b>90, g/r>.70 in display sRGB',
                  'points': [[round(float(x)/(crop.shape[1]-1), 5), round(float(y)/(crop.shape[0]-1), 5)] for x,y in zip(xx,yy)]}
        (asset / 'emblem-trace.json').write_text(json.dumps(traced, separators=(',', ':')) + '\n')
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("asset", type=Path)
    args = parser.parse_args()
    result = extract(args.asset)
    for name, sample in result["samples"].items():
        print(f'{name:18} {sample["representative"]["hex"]}  pixel ({sample["x"]}, {sample["y"]})')
