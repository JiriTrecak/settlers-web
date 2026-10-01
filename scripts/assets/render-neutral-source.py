"""Quick front/quarter inspection of a Tripo GLB before character adaptation.

blender -b --factory-startup -P scripts/assets/render-neutral-source.py -- INPUT.glb OUTPUT.png
"""

import math
import sys

import bpy
from mathutils import Vector


source, output = sys.argv[sys.argv.index("--") + 1 : sys.argv.index("--") + 3]
extra = sys.argv[sys.argv.index("--") + 3 :]
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and len(obj.data.polygons) > 100]
if not meshes:
    raise RuntimeError("Source GLB contains no mesh")
if extra:
    rig = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
    clip = bpy.data.actions.get(extra[0])
    if not rig or not clip:
        raise RuntimeError(f"Missing requested clip {extra[0]} ({list(bpy.data.actions)})")
    rig.animation_data_create()
    rig.animation_data.action = clip
    bpy.context.scene.frame_set(int(extra[1] if len(extra) > 1 else 14))

corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
low = Vector((min(v[i] for v in corners) for i in range(3)))
high = Vector((max(v[i] for v in corners) for i in range(3)))
center = (low + high) / 2
extent = max(high - low)

def aim(obj, point):
    direction = Vector(point) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


bpy.ops.object.camera_add(location=center + Vector((extent * 1.45, -extent * 2.55, extent * 1.05)))
camera = bpy.context.object
aim(camera, center)
camera.data.type = "ORTHO"
camera.data.ortho_scale = extent * 1.65
bpy.context.scene.camera = camera

for location, power, size in [((1.5, -2.5, 3), 500, 4), ((-2, 0, 1.7), 270, 3)]:
    bpy.ops.object.light_add(type="AREA", location=center + Vector(location) * extent)
    light = bpy.context.object
    light.data.energy = power * extent * extent
    light.data.shape = "DISK"
    light.data.size = size * extent
    aim(light, center)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = output
scene.world.color = (0.08, 0.08, 0.08)
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "Medium High Contrast"
scene.render.film_transparent = False
bpy.ops.render.render(write_still=True)
triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in meshes)
print({"triangles": triangles, "dimensions": tuple(high - low), "meshes": len(meshes), "materials": sum(len(obj.data.materials) for obj in meshes)})
