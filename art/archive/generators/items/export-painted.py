"""Export the approved painted item masters at their runtime size (requires Pillow)."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art/sources/item-icons/painted-v2'
DEST = ROOT / 'assets/ui/icons/items-v2'

def main():
    manifest = json.loads((ART / 'generation.json').read_text())
    DEST.mkdir(parents=True, exist_ok=True)
    sheet = Image.new('RGB', (800, 1020), '#151515')
    draw = ImageDraw.Draw(sheet)
    for i, entry in enumerate(manifest['completed']):
        slug = entry['slug']
        with Image.open(ART / 'sources' / f'{slug}.png') as source:
            icon = source.convert('RGB').resize((128, 128), Image.Resampling.LANCZOS)
        icon.save(DEST / f'{slug}.png', optimize=True)
        x, y = (i % 5) * 160 + 16, (i // 5) * 170 + 8
        sheet.paste(icon, (x, y))
        label = slug.replace('-', ' ')
        draw.text((x + 64, y + 140), label, fill='#dddddd', anchor='mt')
    sheet.save(ART / 'contact-sheet.png')
    print(f"Exported {len(manifest['completed'])} icons to {DEST}")

if __name__ == '__main__':
    main()
