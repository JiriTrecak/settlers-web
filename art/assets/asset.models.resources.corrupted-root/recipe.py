"""Adapt a Tripo resource deposit for the existing neutral building bindings.

Run in background Blender with ``-- amber-deposit`` or ``-- corrupted-root``.
The provider GLB and reference live in .asset-work/build/resources/<slug>-v2/.
The editable Blend keeps the provider paint; only the exported GLB gets 1K maps.
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


assert bpy.app.background, "Use a background Blender process, not the open document"
slug = sys.argv[sys.argv.index("--") + 1]
if slug not in {"amber-deposit", "amber-deposit-one-third", "amber-deposit-two-thirds", "amber-deposit-empty", "corrupted-root"}:
    raise ValueError(slug)
root = Path.cwd()
work = root / ".asset-work/build/resources" / (slug + "-v2")
provider = work / "source.glb"
if not provider.exists():
    raise FileNotFoundError(provider)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(provider))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes:
    raise RuntimeError("Tripo export has no mesh")
for obj in meshes:
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.data.transform(world)
    obj.matrix_world = Matrix.Identity(4)
for obj in list(bpy.context.scene.objects):
    if obj.type != "MESH":
        bpy.data.objects.remove(obj, do_unlink=True)

lo = Vector(min(v.co[axis] for obj in meshes for v in obj.data.vertices) for axis in range(3))
hi = Vector(max(v.co[axis] for obj in meshes for v in obj.data.vertices) for axis in range(3))
extent = hi - lo
width = max(extent.x, extent.y)
scale = min(6.6 / width, 4.9 / extent.z)
center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
for obj in meshes:
    for vertex in obj.data.vertices:
        vertex.co = (vertex.co - center) * scale
    obj.data.update()
    obj.name = slug.replace("-", "_") + "_painted"
    obj.data.name = obj.name
    for face in obj.data.polygons:
        face.use_smooth = True

# Source is intentionally high resolution and editable. Lights and stage are absent.
for image in bpy.data.images:
    if image.source == "FILE" and image.filepath:
        try:
            image.pack()
        except RuntimeError:
            pass
bpy.ops.wm.save_as_mainfile(filepath=str(work / "source.blend"), compress=False)

# Reduce only copied images referenced by the runtime material nodes. The provider
# source remains available in source.glb and the saved Blend.
reduced = {}
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    for node in material.node_tree.nodes:
        if node.type != "TEX_IMAGE" or not node.image:
            continue
        image = node.image
        if max(image.size) <= 1024:
            continue
        if image.name not in reduced:
            copy = image.copy()
            factor = 1024 / max(image.size)
            copy.scale(max(1, round(image.size[0] * factor)), max(1, round(image.size[1] * factor)))
            copy.pack()
            reduced[image.name] = copy
        node.image = reduced[image.name]

bpy.ops.object.select_all(action="DESELECT")
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.export_scene.gltf(
    filepath=str(work / "model.glb"), export_format="GLB", use_selection=True,
    export_yup=True, export_image_format="AUTO", export_apply=True,
)

# A neutral catalogue view; the game screenshot is checked separately.
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
world = bpy.data.worlds.new("Preview world")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.035, .035, .04, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .7
scene.world = world

min_corner = Vector(min(v.co[i] for obj in meshes for v in obj.data.vertices) for i in range(3))
max_corner = Vector(max(v.co[i] for obj in meshes for v in obj.data.vertices) for i in range(3))
dims = max_corner - min_corner
radius = max(dims.x, dims.y, dims.z) * 2.1
camera_data = bpy.data.cameras.new("Preview camera")
camera = bpy.data.objects.new("Preview camera", camera_data)
scene.collection.objects.link(camera)
camera.location = (radius * .70, -radius * .78, radius * .72)
target = Vector((0, 0, dims.z * .40))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = max(dims.x, dims.y) * 1.65
scene.camera = camera
sun_data = bpy.data.lights.new("Preview sun", "SUN")
sun_data.energy = 3.0
sun = bpy.data.objects.new("Preview sun", sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(30), math.radians(-20), math.radians(35))
scene.render.filepath = str(work / "render.png")
bpy.ops.render.render(write_still=True)

triangles = sum(len(face.vertices) - 2 for obj in meshes for face in obj.data.polygons)
print(json.dumps({"slug": slug, "triangles": triangles, "dimensions": list(dims),
                  "materials": len(bpy.data.materials), "runtimeTextureSize": 1024}))
