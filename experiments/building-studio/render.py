"""Render an already saved .blend; never rebuild or save over manual scene edits."""
import argparse
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stage import camera_view

parser = argparse.ArgumentParser()
parser.add_argument('--asset', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--quick', action='store_true')
parser.add_argument('--view', choices=['saved', 'reference', 'front', 'right', 'back'], default='saved')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
config = json.loads((args.asset / 'asset.json').read_text())
scene = bpy.context.scene
if args.view != 'saved':
    az = {'reference': config['camera']['azimuth'], 'front': 0, 'right': 90, 'back': 180}[args.view]
    camera_view(scene, config, az)
if args.quick:
    scene.render.resolution_percentage = 65
    if scene.render.engine == 'CYCLES':
        scene.cycles.samples = 16
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.filepath = str(args.output)
bpy.ops.render.render(write_still=True)
from export_viewer import export_viewer
metadata=export_viewer(args.asset,args.output.with_suffix('.glb'))
args.output.with_suffix('.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('BUILDING_RENDER_READY', args.output)
