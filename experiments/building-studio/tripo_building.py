"""Editable Tripo import adapter. Rebuilds scale, materials and stage, not AI geometry.
The original source.glb remains unchanged; generated structural parts stay editable.
"""
from pathlib import Path
import bpy, json, sys, math
from mathutils import Vector, Matrix
assert bpy.app.background, 'Run in a separate background Blender process.'
P=Path(ASSET_DIR).resolve();ROOT=P.parents[3]
sys.path.insert(0,str(ROOT/'experiments/building-studio'))
from stage import create_stage
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(P/'source.glb'))
CFG=json.loads((P/'asset.json').read_text());own=json.loads((P/'ownership.json').read_text())
scene=bpy.context.scene
objects=[o for o in scene.objects if o.type=='MESH']
orientation=Matrix.Rotation(math.radians(CFG.get('orientation_degrees',0)),4,'Z')
points=[orientation@o.matrix_world@v.co for o in objects for v in o.data.vertices]
low=Vector([min(p[i] for p in points) for i in range(3)]);high=Vector([max(p[i] for p in points) for i in range(3)])
scale=CFG["width"]/max(high.x-low.x,high.y-low.y)
center=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
for o in objects:
 index=objects.index(o);world=orientation@o.matrix_world;o.parent=None
 o.data.transform(Matrix.Scale(scale,4)@Matrix.Translation(-center)@world)
 # Expand a lookout opening without scaling its platform or changing its roof.
 lift=CFG.get('elevated_roof')
 if lift:
  for v in o.data.vertices:
   t=max(0,min(1,(v.co.z-lift['floor'])/(lift['roof']-lift['floor'])))
   v.co.z+=lift['lift']*t
 o.matrix_world=Matrix.Identity(4)
 o.name=CFG.get('part_names',{}).get(str(index),f'{CFG["name"]} part {index:02d}');o['tripoPart']=index
 o['source']='Reference-based Tripo H3.1';o['role']=CFG.get('part_role','building')
 for face in o.data.polygons:face.use_smooth=True
for o in list(scene.objects):
 if o.type=='EMPTY':bpy.data.objects.remove(o,do_unlink=True)
material=objects[0].data.materials[0].copy();material.name='TC_TeamColor';material.use_nodes=True
material['teamColorMask']='baseColorAlpha';material['teamColorSourceMax']=own['sourceMax'];material['teamColorDefault']=own['default']
material.diffuse_color=(*own['default'],1)
nodes,links=material.node_tree.nodes,material.node_tree.links
bsdf=nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.72;bsdf.inputs['Metallic'].default_value=0
for link in list(bsdf.inputs['Metallic'].links):links.remove(link)
for node in nodes:
 if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.45
texture=nodes.new('ShaderNodeTexImage');texture.name='Authored albedo with ownership mask';texture.image=bpy.data.images.load(str(P/'albedo-team.png'))
texture.image.alpha_mode='CHANNEL_PACKED';texture.image.pack()
# Keep the raw RGB albedo available for portable glTF display. The runtime
# ownership mask is its alpha channel, independent of opacity.
sep=nodes.new('ShaderNodeSeparateColor');links.new(texture.outputs['Color'],sep.inputs[0])
mx=nodes.new('ShaderNodeMath');mx.operation='MAXIMUM';links.new(sep.outputs[0],mx.inputs[0]);links.new(sep.outputs[1],mx.inputs[1])
mx2=nodes.new('ShaderNodeMath');mx2.operation='MAXIMUM';links.new(mx.outputs[0],mx2.inputs[0]);links.new(sep.outputs[2],mx2.inputs[1])
div=nodes.new('ShaderNodeMath');div.operation='DIVIDE';links.new(mx2.outputs[0],div.inputs[0]);div.inputs[1].default_value=own['sourceMax']
tint=nodes.new('ShaderNodeMixRGB');tint.name='Team color';tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(*own['default'],1);links.new(div.outputs[0],tint.inputs[1])
mix=nodes.new('ShaderNodeMixRGB');links.new(texture.outputs['Alpha'],mix.inputs[0]);links.new(texture.outputs['Color'],mix.inputs[1]);links.new(tint.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],bsdf.inputs['Base Color'])
if not CFG.get('team_color',True):
 material.name='Natural_Materials';material.diffuse_color=(1,1,1,1)
 for key in ['teamColorMask','teamColorSourceMax','teamColorDefault']:del material[key]
 links.new(texture.outputs['Color'],bsdf.inputs['Base Color'])
for o in objects:
 o.data.materials.clear();o.data.materials.append(material)
collection=bpy.data.collections.new('Studio');scene.collection.children.link(collection);create_stage(CFG,collection)
ref=bpy.data.images.load(str(P/'reference.png'));ref.name='reference.png';ref.pack();ref.use_fake_user=True
for f in ['model.py','prepare_texture.py','asset.json','provenance.json']:
 if (P/f).exists():bpy.data.texts.load(str(P/f))
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.shading.type='MATERIAL';area.spaces.active.region_3d.view_distance=14;area.spaces.active.region_3d.view_location=(0,0,2.8)
bpy.ops.wm.save_as_mainfile(filepath=str(P/CFG['blend']))
print('BUILDING_SOURCE',len(objects),'parts',sum(len(p.vertices)-2 for o in objects for p in o.data.polygons),'triangles')
