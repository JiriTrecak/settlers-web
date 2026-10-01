"""Adapt an isolated Tripo creature into an editable, skinned game character.

Run in background Blender with `-- <slug>`. The high-resolution imported source
and its original images remain packed in source.blend. The disposable runtime GLB
uses smaller texture copies and six in-place action clips.
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path.cwd()
slug = sys.argv[sys.argv.index("--") + 1]
spec = next(item for item in json.loads((ROOT / "scripts/assets/neutral-creeps.json").read_text()) if item["slug"] == slug)
work = ROOT / ".asset-work/build/neutral-creeps" / slug
source = work / "source.glb"
if not source.exists():
    raise FileNotFoundError(source)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes:
    raise RuntimeError(f"{slug}: no mesh in provider GLB")

# Tripo's glTF transforms are consolidated before adding the game rig. The
# source is not rescaled by the global unitScale, which the engine applies once.
for obj in meshes:
    world = obj.matrix_world.copy()
    obj.parent = None
    for vertex in obj.data.vertices:
        vertex.co = world @ vertex.co
    obj.matrix_world = Matrix.Identity(4)
    obj.name = slug + "_painted"
corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
lo = Vector(min(v[i] for v in corners) for i in range(3))
hi = Vector(max(v[i] for v in corners) for i in range(3))
width, depth, height = hi - lo
scale = spec["height"] / height
offset = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
for obj in meshes:
    for vertex in obj.data.vertices:
        vertex.co = (vertex.co + offset) * scale
    obj.data.update()
width *= scale
depth *= scale
height = spec["height"]

# A compact rig follows the shape family. It deforms broad masses rather than
# asking a human humanoid rig to interpret spiders, frogs, or floating sprites.
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
rig = bpy.context.object
rig.name = "NeutralRig"
arm = rig.data
arm.name = slug + "_skeleton"
arm.edit_bones.remove(arm.edit_bones[0])


def bone(name, head, tail, parent=None):
    b = arm.edit_bones.new(name)
    b.head = head
    b.tail = tail
    if parent:
        b.parent = arm.edit_bones[parent]
    return b


bone("Root", (0, 0, 0), (0, 0, height * .32))
bone("Body", (0, 0, height * .31), (0, 0, height * .72), "Root")
bone("Head", (0, -depth * .12, height * .67), (0, -depth * .16, height * .94), "Body")
bone("Left", (width * .22, 0, height * .60), (width * .45, -depth * .04, height * .26), "Body")
bone("Right", (-width * .22, 0, height * .60), (-width * .45, -depth * .04, height * .26), "Body")
bone("LeftFoot", (width * .13, depth * .04, height * .35), (width * .18, depth * .04, height * .05), "Root")
bone("RightFoot", (-width * .13, depth * .04, height * .35), (-width * .18, depth * .04, height * .05), "Root")
bpy.ops.object.mode_set(mode="OBJECT")


def weights(x, y, z):
    nx = x / max(width * .5, .001)
    ny = y / max(depth * .5, .001)
    nz = z / height
    family = spec["body"]
    def smooth(a, b, v):
        t = max(0.0, min(1.0, (v - a) / (b - a)))
        return t * t * (3 - 2 * t)
    def normalized(parts):
        total = sum(parts.values())
        return {name: amount / total for name, amount in parts.items() if amount > .001}
    if family == "floater":
        head = smooth(.38, .76, nz) * .8
        arm = smooth(.35, .8, abs(nx)) * smooth(.2, .45, nz) * .45
        return normalized({"Head": head, "Left" if nx > 0 else "Right": arm,
            "Body": max(.1, 1 - head - arm), "Root": .07})
    if family in ("quadruped", "spider"):
        head = 1 - smooth(-.8, -.1, ny)
        head *= smooth(.32, .55, nz) * .7
        legs = (1 - smooth(.2, .55, nz)) * smooth(.22, .68, abs(nx)) * .66
        side = "Left" if nx > 0 else "Right"
        limb = side if ny < .08 else side + "Foot"
        return normalized({"Head": head, limb: legs, "Body": max(.12, 1 - head - legs), "Root": .1})
    if family == "flyer":
        wing = smooth(.30, .8, abs(nx)) * smooth(.35, .65, nz) * .7
        head = (1 - smooth(-.8, -.1, ny)) * smooth(.25, .5, nz) * .58
        return normalized({"Left" if nx > 0 else "Right": wing, "Head": head,
            "Body": max(.12, 1 - wing - head), "Root": .1})
    head = smooth(.57, .82, nz) * .88
    arm = smooth(.18, .64, abs(nx)) * smooth(.12, .33, nz) * (1 - smooth(.68, .9, nz)) * .75
    leg = (1 - smooth(.22, .46, nz)) * (1 - .5 * arm) * .8
    return normalized({"Head": head, "Left" if nx > 0 else "Right": arm,
        "LeftFoot" if nx > 0 else "RightFoot": leg,
        "Body": max(.12, 1 - head - arm - leg), "Root": .08})


for obj in meshes:
    groups = {name: obj.vertex_groups.new(name=name) for name in ["Root", "Body", "Head", "Left", "Right", "LeftFoot", "RightFoot"]}
    for vertex in obj.data.vertices:
        for name, value in weights(*vertex.co).items():
            groups[name].add([vertex.index], value, "REPLACE")
    obj.parent = rig
    obj.matrix_parent_inverse = Matrix.Identity(4)
    modifier = obj.modifiers.new("Neutral skeleton", "ARMATURE")
    modifier.object = rig

for pose_bone in rig.pose.bones:
    pose_bone.rotation_mode = "XYZ"


def frame(index, moves):
    for name, (location, rotation) in moves.items():
        part = rig.pose.bones[name]
        part.location = Vector(location)
        part.rotation_euler = rotation
        part.keyframe_insert(data_path="location", frame=index, group=name)
        part.keyframe_insert(data_path="rotation_euler", frame=index, group=name)


def reset_pose():
    for part in rig.pose.bones:
        part.location = (0, 0, 0)
        part.rotation_euler = (0, 0, 0)


def move(**parts):
    return {name: (Vector(value[0]), value[1]) for name, value in parts.items()}


def action(name, keys, cyclic=False):
    reset_pose()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    for index, moves in keys:
        frame(index, moves)
    if cyclic:
        # Playback loops from the first to the matching last pose.
        pass
    return act


zero = (0, 0, 0)
still = move(Root=(zero, zero), Body=(zero, zero), Head=(zero, zero),
             Left=(zero, zero), Right=(zero, zero), LeftFoot=(zero, zero), RightFoot=(zero, zero))
lift = .035 * height
float_lift = .08 * height if spec["body"] in ("floater", "flyer") else lift
action("idle", [
    (1, still),
    (16, move(Root=((0, 0, float_lift), zero), Body=(zero, (.018, 0, .018)), Head=(zero, (-.02, 0, 0)))),
    (32, still),
], True)

def gait(name, frames, amplitude):
    a = amplitude
    bob = .035 * height * (1.2 if name == "run" else 1)
    action(name, [
        (1, still),
        (frames // 4, move(Root=((0, 0, bob), zero), Body=(zero, (.035, 0, 0)),
            Left=(zero, (a, 0, 0)), Right=(zero, (-a, 0, 0)),
            LeftFoot=(zero, (-a, 0, 0)), RightFoot=(zero, (a, 0, 0)))),
        (frames // 2, still),
        (3 * frames // 4, move(Root=((0, 0, bob), zero), Body=(zero, (.035, 0, 0)),
            Left=(zero, (-a, 0, 0)), Right=(zero, (a, 0, 0)),
            LeftFoot=(zero, (a, 0, 0)), RightFoot=(zero, (-a, 0, 0)))),
        (frames, still),
    ], True)


gait("walk", 36, .18)
gait("run", 28, .27)

# The contact or release key is deliberately sharp and followed by a return.
# A ranged attacker aims/recoils while a melee creature lunges or swipes.
ranged = spec["attack"] == "ranged"
contact = 17 if ranged else 14
anticipation = move(Body=(zero, (-.10 if ranged else .12, 0, -.055)),
                    Head=(zero, (.045, 0, 0)),
                    Left=(zero, (-.20 if ranged else .30, 0, .08)),
                    Right=(zero, (-.18 if ranged else -.25, 0, -.08)))
strike = move(Root=((0, -.06 * height if ranged else -.11 * height, .02 * height), zero),
              Body=(zero, (.11 if ranged else -.14, 0, .04)),
              Head=(zero, (-.06 if ranged else -.1, 0, 0)),
              Left=(zero, (.22 if ranged else -.32, 0, .05)),
              Right=(zero, (.18 if ranged else .25, 0, -.05)))
action("attack", [(1, still), (9, anticipation), (contact, strike), (22, strike), (38, still)])
action("hit", [(1, still), (7, move(Root=((0, .07 * height, 0), zero), Body=(zero, (.14, 0, .06)), Head=(zero, (.12, 0, 0)))), (20, still)])
action("death", [(1, still), (12, move(Root=((0, 0, -.16 * height), (0, 0, .3)), Body=(zero, (.25, 0, .28)))),
                 (34, move(Root=((0, 0, -.28 * height), (0, 0, 1.05)), Body=(zero, (.26, 0, .45))))])
reset_pose()

states = {name: name for name in ("idle", "walk", "run", "attack", "hit", "death")}
event = "release" if ranged else "hit"
rig["characterProfile"] = {"variants": {"base": {"states": states}},
                           "attackEvents": {"base": {"event": event, "normalizedTime": contact / 38}}}
rig["variant"] = "base"
rig["sourceModel"] = "Tripo Studio"

# The empty is an actual exported attachment point for the projectile renderer.
if ranged:
    socket = bpy.data.objects.new("socket_projectile", None)
    bpy.context.scene.collection.objects.link(socket)
    socket.parent = rig
    socket.parent_type = "BONE"
    socket.parent_bone = "Head"
    socket.location = (0, -depth * .38, height * .61)

for image in bpy.data.images:
    if image.source == "FILE" and image.filepath:
        try:
            image.pack()
        except RuntimeError:
            pass
rig.animation_data.action = bpy.data.actions.get("idle")
bpy.ops.wm.save_as_mainfile(filepath=str(work / "source.blend"), compress=False)

# Source paint is retained in the Blend. Export-only image copies cap memory.
reduced = {}
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    for node in material.node_tree.nodes:
        if node.type != "TEX_IMAGE" or not node.image:
            continue
        image = node.image
        if max(image.size) <= 512:
            continue
        if image.name not in reduced:
            copy = image.copy()
            factor = 512 / max(image.size)
            copy.scale(max(1, round(image.size[0] * factor)), max(1, round(image.size[1] * factor)))
            copy.pack()
            reduced[image.name] = copy
        node.image = reduced[image.name]

rig.animation_data.action = bpy.data.actions.get("idle")
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
for obj in meshes:
    obj.select_set(True)
if ranged:
    socket.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=str(work / "model.glb"), export_format="GLB", use_selection=True,
    export_yup=True, export_animations=True, export_animation_mode="ACTIONS",
    export_force_sampling=True, export_skins=True, export_def_bones=False,
    export_extras=True, export_cameras=False, export_lights=False,
)

# Review thumbnail uses a neutral three-quarter camera. It is added only after
# both the editable source save and game export, so it cannot become asset mesh.
def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


focus = Vector((0, 0, height * .50))
bpy.ops.object.camera_add(location=(height * .95, -height * 2.2, height * 1.13))
camera = bpy.context.object
aim(camera, focus)
camera.data.type = "ORTHO"
camera.data.ortho_scale = max(height * 1.38, width * 1.45)
bpy.context.scene.camera = camera
for loc, power, size in [((1.3, -1.8, 2.3), 420, 3), ((-1.8, .8, 1.4), 230, 2.5)]:
    bpy.ops.object.light_add(type="AREA", location=Vector(loc) * height)
    light = bpy.context.object
    light.data.energy = power * height * height
    light.data.shape = "DISK"
    light.data.size = size * height
    aim(light, focus)
scene = bpy.context.scene
scene.frame_set(1)
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 768
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(work / "preview.png")
scene.world.color = (.08, .08, .08)
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "Medium High Contrast"
bpy.ops.render.render(write_still=True)

triangles = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in meshes)
if triangles > 5000:
    raise RuntimeError(f"{slug}: {triangles} triangles exceeds 5000")
(work / "build.json").write_text(json.dumps({"slug": slug, "triangles": triangles,
    "height": height, "body": spec["body"], "attack": spec["attack"],
    "animations": list(states), "attackEvent": {"name": event, "normalizedTime": contact / 38}}, indent=2) + "\n")
print(json.dumps({"slug": slug, "triangles": triangles, "height": height, "animations": list(states)}))
