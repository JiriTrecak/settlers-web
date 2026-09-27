"""Reference-generated bombardier with rigid mounted mortar, preserved rig and editable parts."""
from pathlib import Path
import bpy,json,sys,math
from mathutils import Vector,Quaternion
assert bpy.app.background
P=Path(__file__).resolve().parent;ROOT=P.parents[3]
sys.path.insert(0,str(ROOT/'experiments/building-studio'))
from stage import create_stage
from export_character import export_character
CFG=json.loads((P/'asset.json').read_text());own=json.loads((P/'ownership.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(P/'source.glb'))
scene=bpy.context.scene;scene.render.fps=24
rig=next(o for o in scene.objects if o.type=='ARMATURE')
objects=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('tripo_part_')]
for o in list(scene.objects):
 if o.type=='MESH' and o not in objects:bpy.data.objects.remove(o,do_unlink=True)
for pb in rig.pose.bones:pb.custom_shape=None
for o in objects:
 index=o.name.split('_')[-1];o['tripo_part']=int(index);o['role']='bombardier'
 o.name=CFG['part_names'][index]
 if index in CFG['rigid_parts']:
  o.vertex_groups.clear();g=o.vertex_groups.new(name='mixamorig:'+CFG['rigid_parts'][index]);g.add(list(range(len(o.data.vertices))),1,'REPLACE')
# Original Tripo reference rest height is .9797363. Scale at roots preserves binding.
for o in list(scene.objects):
 if o.parent is None and o.type in ('MESH','ARMATURE','EMPTY'):o.scale*=CFG['characterHeight']/.9797363
rig.name='Ant Bombardier Rig'
bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,parent,point in [('socket_handL','LeftHand',None),('socket_handR','RightHand',None),('socket_back','Spine2',(0,.073,.52))]:
 bone=rig.data.edit_bones.new(name);pb=rig.data.edit_bones['mixamorig:'+parent]
 bone.head=pb.head if point is None else Vector(point);bone.tail=bone.head+Vector((0,0,.015));bone.parent=pb;bone.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT')
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

for a in bpy.data.actions:
 a.use_fake_user=True
 a.name='attack_mortar' if a.name.startswith('A stocky siege') else {'hit_to_body_01':'hit','fall':'death'}.get(a.name,a.name)
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
for pb in rig.pose.bones:pb.location=(0,0,0);pb.rotation_quaternion=(1,0,0,0);pb.scale=(1,1,1)
sys.path.insert(0,str(P))
from mortar import add_mortar
CFG['attackEvents']['bombardier']['normalizedTime']=add_mortar(rig,scene,objects)
(P/'asset.json').write_text(json.dumps(CFG,indent=2)+'\n')
from locomotion import soften_running_lean
lean_report=soften_running_lean(rig,scene,.2)
(P/'locomotion.json').write_text(json.dumps(lean_report,indent=2)+'\n')
collection=bpy.data.collections.new('Studio');scene.collection.children.link(collection);create_stage(CFG,collection)
ref=bpy.data.images.load(str(P/'reference.png'));ref.name='reference.png';ref.pack();ref.use_fake_user=True
for im in bpy.data.images:
 if im.source=='FILE':
  try:im.pack()
  except RuntimeError:pass
for f in ['asset.json','model.py','mortar.py','provenance.json']:bpy.data.texts.load(str(P/f))
scene.frame_set(0);bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(P/CFG['blend']))
scene.render.filepath=str(P/'render.png');bpy.ops.render.render(write_still=True)
meta=export_character(P,P/'model.glb');(P/'viewer.json').write_text(json.dumps(meta,indent=2)+'\n')
print('BOMBARDIER_READY',meta['triangles'],meta['animations'])
