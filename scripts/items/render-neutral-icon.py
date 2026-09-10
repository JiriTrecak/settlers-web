"""Render a runtime icon directly from the saved Blender scene, without modifying the source."""
import bpy,sys
from pathlib import Path
if not bpy.app.background:raise RuntimeError('Background Blender only')
s=bpy.context.scene;s.render.resolution_x=128;s.render.resolution_y=128;s.render.resolution_percentage=100;s.cycles.samples=32
s.render.image_settings.file_format='PNG';s.render.filepath=str(Path(sys.argv[sys.argv.index('--')+1]).resolve());bpy.ops.render.render(write_still=True)
