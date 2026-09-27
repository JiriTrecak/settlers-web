"""Small ground debris for the meadow generator: pale pebbles, grey edge boulders, forked sticks.

The reference scatters light, readable stones across worn dirt and dry branches along the
grass rim. Existing woodland stones are dark and mossy, so these are separate originals.
  blender -b --factory-startup -P art/recipes/meadow_debris.py -- <out-dir> [slug ...]
Each slug writes <out>/<slug>/{geometry.glb,source.blend,build.json}. Z-up source, Y-up GLB.
"""
import bpy, bmesh, json, math, random, sys
from pathlib import Path
from mathutils import Vector, noise

# Linear base colours. The sun + biome grade lift props a lot, so these sit below the target sRGB.
STONE = {'light': (.30, .29, .27), 'warm': (.33, .30, .26), 'shade': (.21, .21, .205)}
BARK = (.13, .085, .05)
CUT = (.36, .27, .16)

def material(name, rgb, rough=.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    # Renderer contract shared with the woodland scenery: sun-lit plant shading, no ground tint.
    m['referenceEnvironment'] = True; m['sourceShader'] = 'plant'; m['foliage'] = False
    m['backsideLighting'] = 0; m['sourceShaderAttributes'] = {'IsUseGroundColor': 'false'}
    return m

def stone(bm, mat_index, centre, size, seed, detail=2):
    """Icosphere pushed by low-frequency noise and flattened: chunky, rounded, sits half-buried."""
    rng = random.Random(seed)
    geom = bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=1)['verts']
    off = Vector((rng.uniform(-50, 50), rng.uniform(-50, 50), rng.uniform(-50, 50)))
    for v in geom:
        d = v.co.normalized()
        v.co = d * (1 + .22 * noise.noise(d * 1.3 + off) + .06 * noise.noise(d * 3.1 + off))
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
        # Flat underside so the stone reads as resting, not floating, after the sink below.
        if v.co.z < 0: v.co.z *= .35
        v.co += Vector(centre)
    faces = {f for v in geom for f in v.link_faces}
    for f in faces: f.material_index = mat_index; f.smooth = True

def branch(bm, mat_index, points, radii, sides=5):
    """Tapered polygonal tube along points (open ends are hidden by the cap the caller adds)."""
    rings = []
    for i, (p, r) in enumerate(zip(points, radii)):
        p = Vector(p)
        t = (Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])).normalized()
        a = t.cross(Vector((0, 0, 1)));
        if a.length < .01: a = t.cross(Vector((1, 0, 0)))
        a.normalize(); b = t.cross(a)
        rings.append([bm.verts.new(p + (a * math.cos(k * math.tau / sides) + b * math.sin(k * math.tau / sides)) * r) for k in range(sides)])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(sides):
            f = bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k])); f.material_index = mat_index; f.smooth = True
    for ring, idx in ((rings[0], 2), (rings[-1], 2)):
        f = bm.faces.new(ring if ring is rings[-1] else list(reversed(ring))); f.material_index = idx

def build(out: Path, slug: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(slug)
    bm = bmesh.new()
    if slug.startswith('meadow-pebble'):
        mats = [material('Pale meadow stone', STONE['light']), material('Warm meadow stone', STONE['warm'])]
        layouts = {
            'meadow-pebble-a': [((0, 0, .1), (.32, .26, .2))],
            'meadow-pebble-b': [((0, 0, .1), (.3, .24, .2)), ((.42, .2, .06), (.16, .14, .11))],
            'meadow-pebble-c': [((0, 0, .12), (.36, .3, .24)), ((.5, -.15, .05), (.15, .13, .1)), ((-.35, .35, .05), (.13, .12, .09)), ((.2, .45, .04), (.1, .09, .07))],
        }
        for i, (c, s) in enumerate(layouts[slug]): stone(bm, i % 2, c, s, rng.randrange(1 << 20))
    elif slug == 'meadow-boulder':
        mats = [material('Grey edge boulder', STONE['light']), material('Shaded boulder facet', STONE['shade'])]
        stone(bm, 0, (0, 0, .45), (1.0, .8, .75), 11, detail=3)
        stone(bm, 1, (.95, .35, .12), (.35, .3, .26), 12)
        stone(bm, 0, (-.7, -.65, .08), (.24, .22, .18), 13)
    elif slug.startswith('meadow-stick'):
        mats = [material('Dry branch bark', BARK), material('Dry branch bark', BARK), material('Snapped branch end', CUT)]
        if slug == 'meadow-stick-a':
            branch(bm, 0, [(-1, 0, .07), (-.3, .08, .09), (.4, -.02, .08), (1, .1, .06)], [.075, .07, .06, .04])
            branch(bm, 0, [(-.1, .07, .09), (.25, .38, .09), (.45, .62, .07)], [.045, .035, .022], 4)
        else:
            branch(bm, 0, [(-.65, 0, .06), (0, .1, .07), (.6, -.05, .05)], [.06, .055, .035])
            branch(bm, 0, [(.15, .07, .07), (.35, -.3, .06)], [.035, .02], 4)
            branch(bm, 0, [(-.3, .03, .07), (-.45, .3, .06)], [.03, .018], 4)
    else:
        raise ValueError(slug)
    me = bpy.data.meshes.new(slug); bm.to_mesh(me); bm.free()
    # Sink so noisy undersides never show a gap on slopes; the meshes are ground-pivoted.
    for v in me.vertices: v.co.z -= .03
    o = bpy.data.objects.new(slug, me); bpy.context.scene.collection.objects.link(o)
    for m in mats: me.materials.append(m)
    o['referenceEnvironment'] = True
    dest = out / slug; dest.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(dest / 'source.blend'), compress=False)
    bpy.ops.export_scene.gltf(filepath=str(dest / 'geometry.glb'), export_format='GLB', export_cameras=False,
                              export_lights=False, export_extras=True, export_animations=False, export_yup=True)
    me.calc_loop_triangles()
    size = [round(v, 3) for v in o.dimensions]
    (dest / 'build.json').write_text(json.dumps({'slug': slug, 'recipe': 'art/recipes/meadow_debris.py', 'triangles': len(me.loop_triangles), 'size': size}, indent=1))
    print('BUILT', slug, len(me.loop_triangles), size)

SLUGS = ['meadow-pebble-a', 'meadow-pebble-b', 'meadow-pebble-c', 'meadow-boulder', 'meadow-stick-a', 'meadow-stick-b']
if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not args: raise SystemExit(__doc__)
    for s in args[1:] or SLUGS: build(Path(args[0]), s)
