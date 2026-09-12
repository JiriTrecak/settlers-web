"""Derive the carried root bundle from the editable loose-cut roots in the deposit source."""
import bpy
from pathlib import Path
from mathutils import Vector
if not bpy.app.background: raise RuntimeError('Background export only')
a=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(a/'corrupted-root.blend'))
parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('Loose cut root')][:3]
assert len(parts)==3
for o in list(bpy.context.scene.objects):
 if o not in parts and o.type=='MESH': bpy.data.objects.remove(o,do_unlink=True)
points=[o.matrix_world@Vector(v) for o in parts for v in o.bound_box]
center=Vector(((min(p.x for p in points)+max(p.x for p in points))/2,(min(p.y for p in points)+max(p.y for p in points))/2,min(p.z for p in points)))
for o in parts:o.location-=center
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.wm.save_as_mainfile(filepath=str(a/'root-bundle.blend'))
bpy.ops.export_scene.gltf(filepath=str(a/'root-bundle.glb'),export_format='GLB',use_selection=True,export_yup=True)
