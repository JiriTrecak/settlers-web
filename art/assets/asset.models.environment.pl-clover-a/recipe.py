"""Adapt meshes from the licensed PL Stylized Fantasy Foliage pack into game foliage.

Two phases, same BUILDS table:
  python  art/recipes/pl_foliage.py textures <pack-dir> <out-dir> [slug ...]   (Pillow + SciPy)
  blender -b --factory-startup -P art/recipes/pl_foliage.py -- <pack-dir> <out-dir> [slug ...]

Texture phase: the pack stores junk RGB (white, pure green, pink) under zero
alpha. Mipmaps average it into bright fringes and coloured specks at RTS
distance, so the albedo is resized premultiplied and every transparent texel
takes the colour of its nearest opaque texel.

Mesh phase imports one named source object, bakes the game scale into the mesh,
re-centres its pivot on the ground contact, assigns a single alpha material with
the prepared albedo and exports a Y-up GLB. Material/node extras carry the
renderer contract: sourceShader=grass (upward meadow normals, grass wind) and
IsUseGroundColor.
"""
import sys, json
from pathlib import Path

# slug: (fbx, object, texture relative to pack, scale, ground colour, runtime texture size[, albedo multiplier])
# Grass multipliers compensate the sun + grade lift so rendered blades land on the
# woodland reference greens instead of lime.
BUILDS = {
    'pl-grass-lush-a': ('PL_Grass_Mesh_Pack', 'PL_Grass_VarB', 'Grass_Textures/Summer_Grass_Textures/PL_Grass_Summer_01.png', 2.4, False, 512, .82),
    'pl-grass-lush-b': ('PL_Grass_Mesh_Pack', 'PL_Grass_VarB', 'Grass_Textures/Summer_Grass_Textures/PL_Grass_Summer_04.png', 2.6, False, 512, .9),
    'pl-grass-lush-c': ('PL_Grass_Mesh_Pack', 'PL_Grass_VarA', 'Grass_Textures/Summer_Grass_Textures/PL_Grass_Summer_07.png', 2.3, False, 512, .9),
    'pl-grass-tall': ('PL_Grass_Mesh_Pack', 'PL_Grass_VarC', 'Grass_Textures/Summer_Grass_Textures/PL_Grass_Summer_08.png', 2.2, False, 512, .9),
    'pl-flowers-white': ('PL_Flowers_2_Pack', 'PL_White_Clump_VarA', 'Flowers_2_Textures/PL_Flowers_2_Albedo.png', 2.6, False, 1024),
    'pl-flowers-yellow': ('PL_Flowers_2_Pack', 'PL_Yellow_Clump_VarA', 'Flowers_2_Textures/PL_Flowers_2_Albedo.png', 2.6, False, 1024),
    'pl-flowers-blue': ('PL_Flowers_2_Pack', 'PL_Blue_Clump_VarA', 'Flowers_2_Textures/PL_Flowers_2_Albedo.png', 2.6, False, 1024),
    'pl-daisy': ('PL_Flowers_2_Pack', 'PL_Oxeye_Daisy_Flower_VarA', 'Flowers_2_Textures/PL_Flowers_2_Albedo.png', 1.1, False, 1024),
    'pl-fern-bushy': ('PL_Fern_Pack', 'PL_Bushy_Fern_VarA', 'Fern_Textures/PL_Fern_Albedo.png', 1.6, False, 1024),
    'pl-fern-sword': ('PL_Fern_Pack', 'PL_Sword_Fern_VarE', 'Fern_Textures/PL_Fern_Albedo.png', 1.5, False, 1024),
    'pl-fern-bushy-b': ('PL_Fern_Pack', 'PL_Bushy_Fern_VarE', 'Fern_Textures/PL_Fern_Albedo.png', 1.6, False, 1024),
    'pl-fern-sword-b': ('PL_Fern_Pack', 'PL_Sword_Fern_VarB', 'Fern_Textures/PL_Fern_Albedo.png', 1.4, False, 1024),
    # Forest-floor layer: shade flowers and low leafy mats that sit under the pine eaves.
    'pl-flowers-trillium': ('PL_Flowers_1_Pack', 'PL_White_Trillium_Flower_VarA', 'Flowers_1_Textures/PL_Flowers_1_Albedo.png', 1.0, False, 1024),
    'pl-flowers-bluebell': ('PL_Flowers_1_Pack', 'PL_Blue_Bell_Flowers_VarC', 'Flowers_1_Textures/PL_Flowers_1_Albedo.png', 1.0, False, 1024),
    'pl-clover-sorrel': ('PL_Water_Flora_Pack', 'PL_Violet_Wood_Sorrel_VarA', 'Water_Flowers_Textures/PL_Water_Flora_Albedo.png', 2.4, False, 1024),
    'pl-clover-a': ('PL_Water_Flora_Pack', 'PL_Clover_VarD', 'Water_Flowers_Textures/PL_Water_Flora_Albedo.png', 2.4, False, 1024),
}

def prepare_texture(pack: Path, out: Path, slug: str):
    import numpy as np
    from PIL import Image
    from scipy.ndimage import distance_transform_edt
    _, _, texture, _, _, size, *grade = BUILDS[slug]
    src = Image.open(pack / texture).convert('RGBA')
    small = src.convert('RGBa').resize((size, size), Image.LANCZOS).convert('RGBA')
    px = np.asarray(small).astype(np.float64)
    solid = px[..., 3] > 16
    _, (iy, ix) = distance_transform_edt(~solid, return_indices=True)
    px[..., :3] = px[iy, ix, :3]
    if grade:
        px[..., :3] *= grade[0]
    dest = out / slug; dest.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(px + .5, 0, 255).astype(np.uint8), 'RGBA').save(dest / 'albedo.png')

def build(pack: Path, out: Path, slug: str):
    import bpy
    fbx, name, texture, scale, ground, size, *grade = BUILDS[slug]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(pack / (fbx + '.fbx')))
    keep = bpy.data.objects[name]
    for o in list(bpy.context.scene.objects):
        if o != keep:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.objects.active = keep
    keep.select_set(True)
    # FBX objects arrive rotated +90° X with Y-up geometry; bake that into Z-up mesh data.
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    me = keep.data
    for v in me.vertices:
        v.co *= scale
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    cx, cy, z0 = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)
    for v in me.vertices:
        v.co.x -= cx; v.co.y -= cy; v.co.z -= z0 + .03  # tiny sink hides the card roots
    keep.location = (0, 0, 0)
    height = max(zs) - z0
    keep.name = slug
    keep['referenceEnvironment'] = True
    keep['plantHeight'] = round(height, 3)

    dest = out / slug
    albedo = dest / 'albedo.png'
    if not albedo.exists():
        raise RuntimeError(f'Run the texture phase first: {albedo}')
    img = bpy.data.images.load(str(albedo))
    img.pack()
    mat = bpy.data.materials.new('PL ' + slug); mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    mat.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = .9
    mat.surface_render_method = 'DITHERED'; mat.use_backface_culling = False
    mat['referenceEnvironment'] = True; mat['sourceShader'] = 'grass'; mat['foliage'] = False
    mat['backsideLighting'] = 0
    mat['sourceShaderAttributes'] = {'IsUseGroundColor': 'true' if ground else 'false'}
    me.materials.clear(); me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    bpy.ops.wm.save_as_mainfile(filepath=str(dest / 'source.blend'), compress=False)
    bpy.ops.export_scene.gltf(filepath=str(dest / 'geometry.glb'), export_format='GLB', use_selection=False,
                              export_cameras=False, export_lights=False, export_extras=True, export_animations=False, export_yup=True)
    me.calc_loop_triangles()
    (dest / 'build.json').write_text(json.dumps({'slug': slug, 'fbx': fbx + '.fbx', 'object': name, 'texture': texture,
        'scale': scale, 'textureSize': size, 'groundColor': ground, 'albedoMultiplier': grade[0] if grade else 1,
        'alphaBleed': 'premultiplied resize + nearest opaque colour', 'triangles': len(me.loop_triangles), 'height': round(height, 3)}, indent=1))

if __name__ == '__main__':
    if '--' in sys.argv:
        args = sys.argv[sys.argv.index('--') + 1:]
        pack, out = Path(args[0]), Path(args[1])
        for slug in args[2:] or BUILDS:
            build(pack, out, slug)
            print('BUILT', slug)
    elif sys.argv[1:2] == ['textures']:
        pack, out = Path(sys.argv[2]), Path(sys.argv[3])
        for slug in sys.argv[4:] or BUILDS:
            prepare_texture(pack, out, slug)
            print('TEXTURE', slug)
    else:
        raise SystemExit(__doc__)
