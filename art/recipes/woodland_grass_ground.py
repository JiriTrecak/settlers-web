"""Flat painted meadow ground rendered from the licensed PL grass cards.

  blender -b --factory-startup -P art/recipes/woodland_grass_ground.py -- <pack-dir> <out.png> [seed]

The woodland ground reads as a flat layer of overlapping leafy clumps, with
the dirt showing through ragged gaps. Upright cards are edge-on from above, so
each tuft is tipped 50-75 degrees in a random direction before an orthographic
top-down render. Tufts near the border are repeated at the neighbouring tile
offsets, so the render wraps seamlessly.

Two passes: albedo (emission of the card texture) and height (emission of the
world Z). Gaps and low blades are darkened by height, so luminance tracks
height; the terrain publisher derives NH from luminance, and the shader's
height blend then lets dirt win in the gaps for a ragged grass edge.
"""
import bpy, sys, math, random
import numpy as np
from pathlib import Path
from mathutils import Euler, Matrix, Vector

TILE = 1 / (.9 * .08)  # world units per repeat at the biome's grass tiling .9
RES = 1024
TEXTURES = {  # Summer colourway: weight
    'PL_Grass_Summer_04.png': 5, 'PL_Grass_Summer_07.png': 3, 'PL_Grass_Summer_01.png': 3,
    'PL_Grass_Summer_06.png': 1.5, 'PL_Grass_Summer_02.png': 1,
}
MESHES = {'PL_Grass_VarA': 3, 'PL_Grass_VarB': 5, 'PL_Grass_VarC': 1}
TARGET = np.array([40, 62, 22]) / 255   # sRGB albedo mean; renders near the reference ground green
GAP = np.array([22, 30, 14]) / 255

def lin(c): return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)
def srgb(c): return np.where(c <= .0031308, c * 12.92, 1.055 * np.clip(c, 0, 1) ** (1 / 2.4) - .055)

def material(image):
    m = bpy.data.materials.new(image.name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image; tex.interpolation = 'Closest'
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Position'], xyz.inputs[0])
    height = nt.nodes.new('ShaderNodeMapRange'); height.inputs['From Max'].default_value = 1.1
    nt.links.new(xyz.outputs['Z'], height.inputs['Value'])
    emit = nt.nodes.new('ShaderNodeEmission'); emit.name = 'emit'
    nt.links.new(tex.outputs['Color'], emit.inputs['Color'])
    cut = nt.nodes.new('ShaderNodeMath'); cut.operation = 'GREATER_THAN'; cut.inputs[1].default_value = .5
    nt.links.new(tex.outputs['Alpha'], cut.inputs[0])
    mix = nt.nodes.new('ShaderNodeMixShader'); clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    nt.links.new(cut.outputs[0], mix.inputs[0]); nt.links.new(clear.outputs[0], mix.inputs[1]); nt.links.new(emit.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    m['tex'] = tex.name; m['height'] = height.name
    return m

def set_pass(mats, which):
    for m in mats:
        nt = m.node_tree; emit = nt.nodes['emit']
        src = nt.nodes[m['tex']].outputs['Color'] if which == 'albedo' else nt.nodes[m['height']].outputs['Result']
        nt.links.new(src, emit.inputs['Color'])

def render(path):
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(str(path))
    px = np.array(img.pixels[:]).reshape(RES, RES, 4)[::-1]  # Blender rows start at the bottom
    bpy.data.images.remove(img)
    return px

def periodic_noise(rng, scale):
    f = np.fft.fftfreq(RES); k2 = f[:, None] ** 2 + f[None, :] ** 2
    n = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((RES, RES))) * np.exp(-k2 * (np.pi * scale * RES) ** 2 / 2)))
    return (n - n.mean()) / n.std()

def main(pack: Path, out: Path, seed: int):
    random.seed(seed); rng = np.random.default_rng(seed)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(pack / 'PL_Grass_Mesh_Pack.fbx'))
    meshes = {}
    for name in MESHES:
        o = bpy.data.objects[name]
        me = o.data.copy(); me.transform(o.matrix_world.to_3x3().to_4x4())
        zs = [v.co.z for v in me.vertices]; me.transform(Matrix.Translation((0, 0, -min(zs))))
        meshes[name] = me
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    tex_dir = pack / 'Grass_Textures/Summer_Grass_Textures'
    mats = {t: material(bpy.data.images.load(str(tex_dir / t))) for t in TEXTURES}
    variants = {}
    for mn, me in meshes.items():
        for t, m in mats.items():
            v = me.copy(); v.materials.clear(); v.materials.append(m); variants[(mn, t)] = v
    pick = lambda d: random.choices(list(d), weights=list(d.values()))[0]

    scene = bpy.context.scene
    count = 900
    for i in range(count):
        me = variants[(pick(MESHES), pick(TEXTURES))]
        x, y = random.random() * TILE, random.random() * TILE
        s = random.uniform(2.6, 4.2)
        tilt = math.radians(random.uniform(50, 75)); heading = random.uniform(0, math.tau)
        rot = (Euler((0, 0, heading)).to_matrix() @ Euler((tilt, 0, 0)).to_matrix() @ Euler((0, 0, random.uniform(0, math.tau))).to_matrix()).to_4x4()
        reach = 1.6 * s * .5
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                px, py = x + dx * TILE, y + dy * TILE
                if px < -reach or px > TILE + reach or py < -reach or py > TILE + reach: continue
                o = bpy.data.objects.new(f'tuft{i}_{dx}{dy}', me)
                o.matrix_world = Matrix.Translation((px - TILE / 2, py - TILE / 2, random.uniform(0, .02))) @ rot @ Matrix.Scale(s, 4)
                scene.collection.objects.link(o)

    cam = bpy.data.cameras.new('top'); cam.type = 'ORTHO'; cam.ortho_scale = TILE
    co = bpy.data.objects.new('top', cam); co.location = (0, 0, 20); scene.collection.objects.link(co); scene.camera = co
    r = scene.render; r.engine = 'CYCLES'; r.resolution_x = r.resolution_y = RES; r.film_transparent = True
    r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'; r.image_settings.color_depth = '16'
    scene.cycles.samples = 16; scene.cycles.use_denoising = False; scene.cycles.transparent_max_bounces = 64
    scene.view_settings.view_transform = 'Standard'
    scene.world = bpy.data.worlds.new('none')
    tmp = out.parent
    set_pass(mats.values(), 'albedo'); albedo = render(tmp / (out.stem + '-albedo.png'))
    set_pass(mats.values(), 'height'); height = render(tmp / (out.stem + '-height.png'))

    cover = albedo[..., 3:4]
    h = np.clip(height[..., :1], 0, 1) * cover
    col = lin(albedo[..., :3]) * cover + lin(GAP) * (1 - cover)
    # Clumps: high blades lit, lower ones sink into shade, gaps darkest.
    shade = .38 + .62 * np.clip(h / .55, 0, 1) ** .7
    tone = 1 + .1 * periodic_noise(rng, .06)[..., None]
    col = col * shade * tone
    col *= lin(TARGET) / col.reshape(-1, 3).mean(0)
    # Byte images take pixels in their own (sRGB) space, bottom row first.
    img = bpy.data.images.new('ground', RES, RES, alpha=True)
    img.pixels[:] = np.dstack([np.clip(srgb(col), 0, 1), np.ones((RES, RES))])[::-1].ravel()
    img.filepath_raw = str(out); img.file_format = 'PNG'; img.save()

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    main(Path(args[0]), Path(args[1]), int(args[2]) if len(args) > 2 else 7)
