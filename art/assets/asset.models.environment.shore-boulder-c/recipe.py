"""River-edge props for the gentle-river shore passes: grey mossy boulders, cattail clumps, flowering lily pads.

The reference river is lined with cool grey boulders half in the water, cattail clumps in the
shallows and lily pads carrying pink/white blooms. Meadow debris stones read beige under the warm
key light, so these use cooler, darker albedo and a moss cap on up-facing facets.
  blender -b --factory-startup -P art/recipes/river_shore.py -- <out-dir> [slug ...]
Each slug writes <out>/<slug>/{geometry.glb,source.blend,build.json}. Z-up source, Y-up GLB.
"""
import bpy, bmesh, json, math, random, sys
from pathlib import Path
from mathutils import Vector, noise
sys.path.insert(0, str(Path(__file__).resolve().parent))
from meadow_debris import material, stone

# Linear base colours; the sun + grade lift props roughly 2x and pull blue down to ~0.55x red,
# so rock albedo is pre-cooled to land on a neutral grey on screen.
ROCK = {'grey': (.07, .085, .19), 'shade': (.05, .062, .14), 'moss': (.04, .06, .03)}
REED = {'blade': (.07, .13, .03), 'dry': (.16, .14, .06), 'head': (.1, .05, .022)}
LILY = {'pad': (.026, .075, .02), 'rim': (.04, .095, .024), 'petal': (.85, .3, .48), 'white': (.8, .78, .74), 'heart': (.8, .55, .05)}

def moss_cap(bm, moss_index, seed):
    """Up-facing facets take the moss material where low-frequency noise allows, so caps are patchy."""
    off = Vector((seed % 97, seed % 53, 0))
    for f in bm.faces:
        if f.normal.z > .82 and noise.noise(f.calc_center_median() * 1.3 + off) > .05: f.material_index = moss_index

def boulders(bm, layout, seed):
    for i, (c, s) in enumerate(layout): stone(bm, 1 if i else 0, c, s, seed + i, detail=3 if i == 0 else 2)
    bm.normal_update(); moss_cap(bm, 2, seed)

def blade(bm, mat, base, angle, lean, height, width, segments=4):
    """Tapered two-sided strip curving outward: a reed leaf or cattail stem."""
    d = Vector((math.cos(angle), math.sin(angle), 0)); side = Vector((-d.y, d.x, 0))
    rows = []
    for k in range(segments + 1):
        t = k / segments
        p = Vector(base) + d * lean * t * t + Vector((0, 0, height * t))
        w = width * (1 - t) ** .8 + .004
        rows.append((bm.verts.new(p - side * w), bm.verts.new(p + side * w)))
    for (a0, b0), (a1, b1) in zip(rows, rows[1:]):
        f = bm.faces.new((a0, b0, b1, a1)); f.material_index = mat; f.smooth = True

def tube(bm, mat, centre, radius, length, sides=6):
    ring = lambda z: [bm.verts.new(Vector(centre) + Vector((math.cos(k * math.tau / sides) * radius, math.sin(k * math.tau / sides) * radius, z))) for k in range(sides)]
    r0, r1 = ring(0), ring(length)
    for k in range(sides):
        f = bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k])); f.material_index = mat; f.smooth = True
    for r in (list(reversed(r0)), r1): bm.faces.new(r).material_index = mat

def cattails(bm, rng):
    for _ in range(14):
        a = rng.uniform(0, math.tau); r = rng.uniform(0, .18)
        blade(bm, 0 if rng.random() > .2 else 1, (math.cos(a) * r, math.sin(a) * r, 0), a + rng.uniform(-.4, .4), rng.uniform(.15, .45), rng.uniform(.7, 1.25), rng.uniform(.03, .05))
    for _ in range(4):
        a = rng.uniform(0, math.tau); r = rng.uniform(0, .12); h = rng.uniform(1.05, 1.45)
        x, y = math.cos(a) * r, math.sin(a) * r
        blade(bm, 0, (x, y, 0), a, .03, h, .012, 2)
        tube(bm, 2, (x + math.cos(a) * .03, y + math.sin(a) * .03, h - .02), .04, .2)

def pad(bm, mats, centre, radius, notch, rng, sides=16):
    """Flat disc with a wedge notch, slightly cupped so the rim catches light."""
    c = bm.verts.new(Vector(centre) + Vector((0, 0, .012)))
    ring = []
    for k in range(sides + 1):
        a = notch + .35 + k * (math.tau - .7) / sides
        ring.append(bm.verts.new(Vector(centre) + Vector((math.cos(a) * radius, math.sin(a) * radius, .02))))
    for v0, v1 in zip(ring, ring[1:]):
        f = bm.faces.new((c, v0, v1)); f.material_index = mats[0]; f.smooth = True
    bm.faces.new((c, ring[-1], ring[0])).material_index = mats[0]

def bloom(bm, centre, petal, rng, count=8):
    base = Vector(centre)
    for layer, (n, spread, length) in enumerate(((count, .9, .22), (count - 2, .45, .16))):
        for k in range(n):
            a = k * math.tau / n + layer * .3
            d = Vector((math.cos(a), math.sin(a), 0)); side = Vector((-d.y, d.x, 0)) * .055
            tip = base + d * length * (1 - spread * .3) + Vector((0, 0, .04 + .14 * (1 - spread)))
            mid = base + d * length * .5 + Vector((0, 0, .02))
            f = bm.faces.new((bm.verts.new(base + Vector((0, 0, .015))), bm.verts.new(mid - side), bm.verts.new(tip), bm.verts.new(mid + side)))
            f.material_index = petal; f.smooth = True
    stone(bm, 5, (base.x, base.y, base.z + .05), (.045, .045, .035), rng.randrange(1 << 20), detail=1)

def build(out: Path, slug: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(slug)
    bm = bmesh.new()
    if slug.startswith('shore-boulder'):
        mats = [material('Shore boulder', ROCK['grey']), material('Shore boulder shade', ROCK['shade']), material('Boulder moss', ROCK['moss'])]
        layouts = {
            'shore-boulder-a': [((0, 0, .5), (1.05, .85, .8))],
            'shore-boulder-b': [((0, 0, .38), (.8, .65, .6)), ((.85, .3, .2), (.42, .36, .32)), ((-.55, -.6, .1), (.26, .22, .2))],
            'shore-boulder-c': [((0, 0, .28), (.55, .5, .42)), ((.5, -.25, .12), (.28, .24, .2))],
        }
        boulders(bm, layouts[slug], rng.randrange(1 << 20))
    elif slug == 'shore-cattails':
        mats = [material('Reed blade', REED['blade']), material('Dry reed blade', REED['dry']), material('Cattail head', REED['head'])]
        cattails(bm, rng)
    elif slug.startswith('shore-lily'):
        flower = 'petal' if slug == 'shore-lily-pink' else 'white'
        mats = [material('Lily pad', LILY['pad']), material('Lily pad rim', LILY['rim']), material('Lily petal', LILY[flower]), material('Lily petal', LILY[flower]), material('Lily petal', LILY[flower]), material('Lily heart', LILY['heart'])]
        spots = [((0, 0, 0), .42), ((.62, .28, 0), .3), ((-.45, .5, 0), .34), ((.2, -.6, 0), .26), ((-.7, -.25, 0), .22)]
        for c, r in spots: pad(bm, (0 if rng.random() > .3 else 1,), c, r, rng.uniform(0, math.tau), rng)
        bloom(bm, (.05, .05, .02), 2, rng)
        if slug == 'shore-lily-pink': bloom(bm, (-.42, .48, .02), 2, rng, 7)
    else:
        raise ValueError(slug)
    me = bpy.data.meshes.new(slug); bm.to_mesh(me); bm.free()
    if slug.startswith('shore-boulder'):
        for v in me.vertices: v.co.z -= .05
    o = bpy.data.objects.new(slug, me); bpy.context.scene.collection.objects.link(o)
    for m in mats: me.materials.append(m)
    o['referenceEnvironment'] = True
    dest = out / slug; dest.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(dest / 'source.blend'), compress=False)
    bpy.ops.export_scene.gltf(filepath=str(dest / 'geometry.glb'), export_format='GLB', export_cameras=False,
                              export_lights=False, export_extras=True, export_animations=False, export_yup=True)
    me.calc_loop_triangles()
    size = [round(v, 3) for v in o.dimensions]
    (dest / 'build.json').write_text(json.dumps({'slug': slug, 'recipe': 'art/recipes/river_shore.py', 'triangles': len(me.loop_triangles), 'size': size}, indent=1))
    print('BUILT', slug, len(me.loop_triangles), size)

SLUGS = ['shore-boulder-a', 'shore-boulder-b', 'shore-boulder-c', 'shore-cattails', 'shore-lily-pink', 'shore-lily-white']
if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not args: raise SystemExit(__doc__)
    for s in args[1:] or SLUGS: build(Path(args[0]), s)
