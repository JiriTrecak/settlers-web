"""Reference-generated worker, preserved rig and editable parts; no remeshing of source."""
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
 index=o.name.split('_')[-1];o['tripo_part']=int(index);o['role']='base'
 o.name=CFG['part_names'][index]
 if index in CFG['rigid_parts']:
  o.vertex_groups.clear();g=o.vertex_groups.new(name='mixamorig:'+CFG['rigid_parts'][index]);g.add(list(range(len(o.data.vertices))),1,'REPLACE')
# Original Tripo reference rest height is .97876. Scale at roots preserves binding.
for o in list(scene.objects):
 if o.parent is None and o.type in ('MESH','ARMATURE','EMPTY'):o.scale*=CFG['characterHeight']/.9787596
rig.name='Ant Worker Rig'
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

# A compact ivory hatchet with a timber poll serves chopping and construction.
# It is part of the same skinned budget and rigidly follows the real gripping hand.
def tool_material(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True
 m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1)
 m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8
 return m
wood=tool_material('Tool_Wood',(.22,.095,.031));ivory=tool_material('Tool_Ivory',(.67,.49,.27))
def tool_mesh(name,verts,faces,mat):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.materials.append(mat)
 ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);ob.parent=rig;ob['role']='base'
 g=ob.vertex_groups.new(name='mixamorig:RightHand');g.add(list(range(len(verts))),1,'REPLACE')
 mod=ob.modifiers.new('Hand attachment','ARMATURE');mod.object=rig
 return ob
cx,cy,cz=-.207,-.105,.291
verts=[(cx+.013*math.cos(j*math.tau/8),cy+d,cz+.013*math.sin(j*math.tau/8)) for d in [-.20,.11] for j in range(8)]
faces=[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(j,(j+1)%8,(j+1)%8+8,j+8) for j in range(8)]
tool_mesh('Worker hatchet handle',verts,faces,wood)
outline=[(.032,.027),(.032,-.027),(-.07,-.055),(-.108,-.04),(-.108,.048),(-.045,.037)]
verts=[(cx+x,cy-.175+y,cz+z) for z in [-.016,.016] for x,y in outline]
n=len(outline);faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
tool_mesh('Worker hatchet ivory head',verts,faces,ivory)
# Finger closure follows each finger's anatomical axis, rather than animating
# the provider's generic open hand through the wooden handle.
grip={}
for b in rig.data.bones:
 if 'RightHand' in b.name and any(k in b.name for k in ['Index','Middle','Ring','Pinky']) and b.name[-1] in '12':
  axis=b.matrix_local.to_quaternion().inverted()@Vector((0,-1,0))
  grip[b.name]=Quaternion(axis,math.radians(32 if b.name.endswith('1') else 28))
count=0
for a in list(bpy.data.actions):
 a.use_fake_user=True
 if a.name.startswith('Looping construction'):
  a.name='build' if count==0 else 'build_alternate';count+=1
 else:a.name={'box_01':'attack_unarmed','hit_to_body_01':'hit','fall':'death'}.get(a.name,a.name)
for a in bpy.data.actions:
 curves=a.layers[0].strips[0].channelbag(a.slots[0]).fcurves
 for fc in curves:
  if not fc.data_path.endswith('rotation_quaternion'):continue
  bone=fc.data_path.split('"')[1]
  if bone in grip:
   for k in fc.keyframe_points:k.co.y=grip[bone][fc.array_index]
   fc.update()
# Back-carried loads have a mild forward lean; keep the actual locomotion contacts.
for source,target in [('idle','carry'),('walk','carry_walk'),('run','carry_run')]:
 a=bpy.data.actions[source].copy();a.name=target;a.use_fake_user=True
 curves=a.layers[0].strips[0].channelbag(a.slots[0]).fcurves
 qcs={fc.array_index:fc for fc in curves if fc.data_path=='pose.bones["mixamorig:Spine"].rotation_quaternion'}
 if len(qcs)==4:
  frames=[k.co.x for k in qcs[0].keyframe_points]
  qs=[Quaternion([qcs[i].evaluate(f) for i in range(4)]).normalized()@Quaternion((1,0,0),math.radians(5)) for f in frames]
  for i,fc in qcs.items():
   for k,q in zip(fc.keyframe_points,qs):k.co.y=q[i]
   fc.update()
from locomotion import soften_running_lean
lean_report=soften_running_lean(rig,scene,.2)
(P/'locomotion.json').write_text(json.dumps(lean_report,indent=2)+'\n')
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
for pb in rig.pose.bones:pb.location=(0,0,0);pb.rotation_quaternion=grip.get(pb.name,Quaternion((1,0,0,0)));pb.scale=(1,1,1)
collection=bpy.data.collections.new('Studio');scene.collection.children.link(collection);create_stage(CFG,collection)
ref=bpy.data.images.load(str(P/'reference.png'));ref.name='reference.png';ref.pack();ref.use_fake_user=True
for im in bpy.data.images:
 if im.source=='FILE':
  try:im.pack()
  except RuntimeError:pass
sys.path.insert(0,str(P))
from cargo import create_cargo
cargo_counts=create_cargo(P,scene)
(P/'cargo-stats.json').write_text(json.dumps(cargo_counts,indent=2))
for f in ['asset.json','model.py','cargo.py','provenance.json']:bpy.data.texts.load(str(P/f))
scene.frame_set(0);bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(P/CFG['blend']))
scene.render.filepath=str(P/'render.png');bpy.ops.render.render(write_still=True)
meta=export_character(P,P/'model.glb');(P/'viewer.json').write_text(json.dumps(meta,indent=2)+'\n')
print('WORKER_READY',meta['triangles'],meta['animations'])
