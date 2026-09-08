"""Durable side-by-side artifact for both human review and agent image inspection."""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


def comparison(asset, output=None):
    asset = Path(asset)
    ref, render = (Image.open(asset / f).convert('RGB') for f in ['reference.png', 'render.png'])
    width = 900
    height = round(width * ref.height / ref.width)
    page = Image.new('RGB', (width*2+48, height+100), '#16191d')
    draw = ImageDraw.Draw(page)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 19)
    except OSError:
        font = ImageFont.load_default(size=19)
    for i, (im, title) in enumerate([(ref,'REFERENCE'),(render,'BLENDER · saved scene render')]):
        x=16+i*(width+16)
        draw.text((x,17),title,font=font,fill='#dfdfdf')
        # Contain, never stretch: differences in framing must remain visible.
        page.paste(ImageOps.pad(im,(width,height),color='black'),(x,49))
    draw.text((16,height+65),'Single-image reconstruction · hidden surfaces are inferred · colors include lighting',font=font,fill='#959ba3')
    page.save(output or asset/'comparison.png')
    return page.size


if __name__=='__main__':
    import sys
    comparison(Path(sys.argv[1]))
