"""Mega-scenery Tripo adapter: run in background Blender.

  blender -b -P scripts/assets/build-mega-scenery.py -- <slug>

Works in the disposable .asset-work/build/scenery/<slug>/: a new asset is staged there by hand
(source.glb, reference.png, config.json, provenance.json); a published one is materialized from
its canonical package when those inputs are missing. The provider GLB stays untouched.
Normalizes orientation/scale/pivot (column cross-section or bounding-box axis), optionally
stretches the upper trunk along its grain, resizes textures, derives ground blockers from the
mesh (roots | stem | footprint | strip), bakes dew beads, and writes model.glb, source.blend,
render.png and blockers.json next to the inputs.
"""
import bpy, bmesh, json, math, sys
from pathlib import Path
from mathutils import Vector
assert bpy.app.background, 'Run in a separate background Blender process.'
SLUG = sys.argv[sys.argv.index('--') + 1]
ROOT = Path(__file__).resolve().parents[2]
SRC = OUT = ROOT / '.asset-work/build/scenery' / SLUG
if not (SRC / 'source.glb').exists():
    sys.path.insert(0, str(ROOT / 'experiments/building-studio'))
    from source_workspace import materialize
    materialize('asset.models.environment.' + SLUG, 'scenery')
OUT.mkdir(parents=True, exist_ok=True)
CFG = json.loads((SRC / 'config.json').read_text())

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SRC / 'source.glb'))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in meshes:
    o.data.transform(o.matrix_world); o.matrix_world.identity(); o.parent = None
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.objects.active = meshes[0]
for o in meshes: o.select_set(True)
if len(meshes) > 1: bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
obj.name = CFG['name']; obj.data.name = CFG['name']
verts = obj.data.vertices
if 'rotate' in CFG:
    from mathutils import Euler
    obj.data.transform(Euler([math.radians(a) for a in CFG['rotate']], 'XYZ').to_matrix().to_4x4())
# `align: long` turns the principal horizontal axis onto X (angle of the XY covariance), so
# elongated assets (logs) get axis-aligned strip blockers and a predictable placement yaw.
if CFG.get('align') == 'long':
    from mathutils import Matrix
    n = len(verts); mx = sum(v.co.x for v in verts) / n; my = sum(v.co.y for v in verts) / n
    sxx = sum((v.co.x - mx) ** 2 for v in verts); syy = sum((v.co.y - my) ** 2 for v in verts)
    sxy = sum((v.co.x - mx) * (v.co.y - my) for v in verts)
    obj.data.transform(Matrix.Rotation(-.5 * math.atan2(2 * sxy, sxx - syy), 4, 'Z'))
zs = [v.co.z for v in verts]; low, high = min(zs), max(zs)

m = CFG['measure']
if 'axis' in m:
    # Bounding-box sizing for non-column assets: extent along `axis` becomes `size`, centred on the box.
    i = 'xyz'.index(m['axis']); ext = [max(v.co[k] for v in verts) - min(v.co[k] for v in verts) for k in range(3)]
    cx = (max(v.co.x for v in verts) + min(v.co.x for v in verts)) / 2
    cy = (max(v.co.y for v in verts) + min(v.co.y for v in verts)) / 2
    scale = m['size'] / ext[i]
else:
    # Scale from the trunk/stem cross-section at `at` of the height, not the bounding box:
    # roots/caps spread arbitrarily, the column is what reads as "this is one tree".
    band = [v.co for v in verts if abs((v.co.z - low) / (high - low) - m['at']) < .02]
    cx = sum(p.x for p in band) / len(band); cy = sum(p.y for p in band) / len(band)
    radii = sorted(math.hypot(p.x - cx, p.y - cy) for p in band)
    scale = m['diameter'] / 2 / radii[int(len(radii) * .8)]
for v in verts:
    v.co = Vector(((v.co.x - cx) * scale, (v.co.y - cy) * scale, (v.co.z - low) * scale - CFG.get('sink', 0)))

# Stretch above `from` (fraction of source height) so the top reaches `height`. Vertical only:
# bark furrows run with the grain, so the texture elongates without visibly smearing.
stretch = CFG.get('stretch')
if stretch:
    top = (high - low) * scale - CFG.get('sink', 0); z0 = top * stretch['from']
    k = (stretch['height'] - z0) / (top - z0)
    for v in verts:
        if v.co.z > z0: v.co.z = z0 + (v.co.z - z0) * k
for poly in obj.data.polygons: poly.use_smooth = True

# Runtime texture budget; the 4K provider maps stay in source.glb.
size = CFG.get('textureSize', 2048)
normals = {n.image for mat in obj.data.materials for n in mat.node_tree.nodes
           if n.type == 'TEX_IMAGE' and any(l.to_node.type == 'NORMAL_MAP' for l in n.outputs['Color'].links)}
(OUT / 'textures').mkdir(exist_ok=True)
for i, image in enumerate(list(bpy.data.images)):
    if image.size[0] > size: image.scale(size, size)
    # glTF AUTO export keeps a file-backed image's format; packed resized images would all become
    # PNG. Colour/roughness tolerate JPEG, normals stay lossless.
    lossless = image in normals
    path = OUT / 'textures' / f'{i}.{"png" if lossless else "jpg"}'
    scene = bpy.context.scene; scene.render.image_settings.file_format = 'PNG' if lossless else 'JPEG'
    scene.render.image_settings.quality = 90; scene.render.image_settings.color_mode = 'RGB'
    image.save_render(str(path), scene=scene)
    if image.packed_file: image.unpack(method='REMOVE')
    image.source = 'FILE'; image.filepath = str(path); image.reload(); image.pack()
for mat in obj.data.materials:
    mat.name = CFG['material']
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Metallic'].default_value = 0
        for link in list(bsdf.inputs['Metallic'].links): mat.node_tree.links.remove(link)
    for node in mat.node_tree.nodes:
        if node.type == 'NORMAL_MAP': node.inputs['Strength'].default_value = CFG.get('normalStrength', .6)

# Footprint blockers: an ellipse for the column plus one yawed box per angular sector whose
# length follows that sector's reach near the ground. Low sectors between roots stay walkable.
b = CFG.get('blockers')
blockers = []
low_verts = [v.co for v in verts if b and v.co.z <= b.get('height', 1e9)]
def extent(ps, k): return min(p[k] for p in ps), max(p[k] for p in ps)
if b and b.get('mode') == 'stem':
    # Stem-only: an ellipse through the stem band at `at` of the height; the cap overhang stays walkable.
    top = max(v.co.z for v in verts)
    band = [v.co for v in verts if abs(v.co.z / top - b['at']) < .02]
    sx = sum(p.x for p in band) / len(band); sy = sum(p.y for p in band) / len(band)
    d = 2 * sorted(math.hypot(p.x - sx, p.y - sy) for p in band)[int(len(band) * .8)] * b.get('core', 1)
    blockers.append({'width': round(d, 2), 'depth': round(d, 2), 'shape': 'ellipse', 'x': round(sx, 2), 'z': round(-sy, 2)})
elif b and b.get('mode') == 'footprint':
    (x0, x1), (y0, y1) = extent(low_verts, 0), extent(low_verts, 1)
    blockers.append({'width': round((x1 - x0) * b.get('core', .9), 2), 'depth': round((y1 - y0) * b.get('core', .9), 2),
                     'shape': 'ellipse', 'x': round((x0 + x1) / 2, 2), 'z': round(-(y0 + y1) / 2, 2)})
elif b and b.get('mode') == 'strip':
    # Elongated assets (after align=long): slice along X, one box per slice following the local
    # width near the ground, so tapers, bends and the broken end don't over-block.
    (x0, x1) = extent(low_verts, 0); n = b.get('slices', 6); step = (x1 - x0) / n
    for s in range(n):
        ps = [p for p in low_verts if x0 + s * step <= p.x <= x0 + (s + 1) * step]
        if len(ps) < 8: continue
        y0, y1 = extent(ps, 1)
        blockers.append({'width': round(step * b.get('fill', 1), 2), 'depth': round((y1 - y0) * b.get('core', .9), 2),
                         'x': round(x0 + (s + .5) * step, 2), 'z': round(-(y0 + y1) / 2, 2)})
elif b:
    core = m['diameter'] * b.get('core', .9)
    blockers.append({'width': round(core, 2), 'depth': round(core, 2), 'shape': 'ellipse'})
    sectors, reach = b['sectors'], [0.0] * b['sectors']
    for v in verts:
        if v.co.z > b['height']: continue
        a = math.atan2(v.co.y, v.co.x) % (2 * math.pi); s = int(a / (2 * math.pi) * sectors) % sectors
        reach[s] = max(reach[s], math.hypot(v.co.x, v.co.y))
    inner = core / 2 * .8
    for s, r in enumerate(reach):
        outer = r - b.get('margin', .5)
        if outer < core / 2 + b.get('minRoot', 1.5): continue
        yaw = (s + .5) / sectors * 2 * math.pi; mid = (inner + outer) / 2
        width = max(1.2, 2 * mid * math.sin(math.pi / sectors) * b.get('fill', .9))
        # Blender XY → game XZ: Blender -Y is glTF/game +Z.
        blockers.append({'width': round(outer - inner, 2), 'depth': round(width, 2),
                         'x': round(math.cos(yaw) * mid, 2), 'z': round(-math.sin(yaw) * mid, 2), 'yaw': round(yaw, 4)})
(OUT / 'blockers.json').write_text(json.dumps(blockers, indent=1))

# Dew beads for the runtime DewLayer: area-weighted points on sky-facing triangles whose straight
# up ray escapes the mesh (nothing under a cap or leaf), spaced apart. Node extras in glTF axes.
dew_cfg = CFG.get('dew'); beads = []
if dew_cfg:
    import random
    rng = random.Random(dew_cfg.get('seed', 1)); obj.data.update(); bpy.context.view_layer.update()
    faces = [p for p in obj.data.polygons if p.normal.z >= dew_cfg.get('up', .8) and p.area > 0]
    weights = [p.area for p in faces]; lo, hi = dew_cfg['radius']
    for _ in range(dew_cfg['count'] * 30):
        if len(beads) >= dew_cfg['count'] or not faces: break
        face = rng.choices(faces, weights)[0]; a, b, c = (verts[i].co for i in face.vertices[:3])
        u, v = rng.random(), rng.random()
        if u + v > 1: u, v = 1 - u, 1 - v
        point = a + (b - a) * u + (c - a) * v; r = lo + (hi - lo) * rng.random() ** 2
        if obj.ray_cast(point + face.normal * .05, Vector((0, 0, 1)))[0]: continue
        if any((point - q).length < (r + s) * 1.6 for q, s in beads): continue
        beads.append((point.copy(), r))
    obj['dew'] = [round(x, 3) for q, r in beads for x in (q.x, q.z, -q.y, r)]

bpy.ops.export_scene.gltf(filepath=str(OUT / 'model.glb'), export_format='GLB', use_selection=True,
                          export_image_format='AUTO', export_yup=True, export_apply=True, export_extras=True)

# Preview: neutral three-quarter render for the catalogue thumbnail.
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items.keys() else 'BLENDER_EEVEE'
scene.render.resolution_x = scene.render.resolution_y = 768
scene.render.image_settings.file_format = 'PNG'  # the texture pass leaves it on JPEG
scene.world = bpy.data.worlds.new('Stage'); scene.world.color = (.05, .05, .05)
dims = obj.dimensions; reach_xy = max(dims.x, dims.y); tall = dims.z
cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 50; d = max(reach_xy, tall) * 2.1
cam.location = (d * .7, -d * .7, tall * .45 + d * .55)
cam.rotation_euler = (Vector((0, 0, tall * .4)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 4; sun.rotation_euler = (.8, .2, .9)
scene.collection.objects.link(sun)
scene.render.filepath = str(OUT / 'render.png'); bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(cam, do_unlink=True); bpy.data.objects.remove(sun, do_unlink=True)
# Canonical packages store uncompressed .blend (the asset store validates the header).
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'source.blend'), compress=False)
tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
print(json.dumps({'slug': SLUG, 'triangles': tris, 'dimensions': list(obj.dimensions), 'scale': scale, 'blockers': len(blockers), 'dew': len(beads)}))
