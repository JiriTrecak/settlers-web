"""Reproducible Blender import of the Tripo experiment; not procedural mesh generation.
source.glb preserves the unmodified Tripo model, segmentation, textures and seven clips.
The adapter fixes rigid equipment weights and normalizes scale. Game integration is
intentionally separate until motion and appearance are approved.
"""
from pathlib import Path
import bpy, json, sys, math
from mathutils import Vector, Quaternion
assert bpy.app.background, 'Run in a separate background Blender process.'
P=Path(__file__).resolve().parent
ROOT=P.parents[3]
sys.path.insert(0,str(ROOT/'experiments/building-studio'))
from stage import create_stage, camera_view
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(P/'source.glb'))
CFG=json.loads((P/'asset.json').read_text())
scene=bpy.context.scene
scene.render.fps=24
rig=next(o for o in scene.objects if o.type=='ARMATURE')
parts={int(o.name.split('_')[-1]):o for o in scene.objects if o.type=='MESH' and o.name.startswith('tripo_part_')}
# Discard the glTF importer's display-only bone shapes, never include them in exports.
for o in list(scene.objects):
 if o.type=='MESH' and o not in parts.values():bpy.data.objects.remove(o,do_unlink=True)
for pb in rig.pose.bones:pb.custom_shape=None
names={0:'Body and clothing',1:'Head helmet and antennae',2:'Acorn shield',3:'Ivory sword and guard',4:'Rear shell',5:'Shield hand',6:'Sword pommel',7:'Left arm detail'}
for k,o in parts.items():
 o.name=names[k];o['role']='warrior';o['tripo_part']=k
 o['source']='Tripo segmented export'
# Rigid components must follow one bone. Automatic blended finger weights bend weapons.
for k,bone in [(1,'Head'),(2,'LeftHand'),(3,'RightHand'),(5,'LeftHand'),(6,'RightHand')]:
 o=parts[k];o.vertex_groups.clear();g=o.vertex_groups.new(name='mixamorig:'+bone)
 g.add(list(range(len(o.data.vertices))),1.0,'REPLACE')
# Preserve the original rear-shell mesh in the source, hidden per the requested cloth silhouette.
parts[4].hide_render=True;parts[4].hide_set(True);del parts[4]['role']
# Uniform root scale keeps the imported bind matrices and animated bone translations coherent.
for o in list(scene.objects):
 if o.parent is None and o.type in ('MESH','ARMATURE','EMPTY'):
  o.scale*=2.18
rig.name='Ant Warrior Tripo Rig'
# Stable attachment nodes for the engine's equipment and blade-trail effects.
# These follow the existing hand bones without modifying the approved mesh.
bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
sword=parts[3]
tip=rig.matrix_world.inverted() @ (sword.matrix_world @ max(sword.data.vertices,key=lambda v:v.co.z).co)
right=rig.data.edit_bones['mixamorig:RightHand']
blade_base=right.head+(tip-right.head)*.18
for name,parent,position in [('socket_handL','mixamorig:LeftHand',None),('socket_handR','mixamorig:RightHand',None),('socket_blade_base','mixamorig:RightHand',blade_base),('socket_blade_tip','mixamorig:RightHand',tip)]:
 parent_bone=rig.data.edit_bones[parent]
 bone=rig.data.edit_bones.new(name);bone.head=parent_bone.head if position is None else position
 bone.tail=bone.head+Vector((0,0,.015));bone.parent=parent_bone;bone.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT')
# Ownership surfaces are extracted from the existing green cloth/leaf regions.
# This changes material assignment and vertex colors, not the source bitmap files.
team=bpy.data.materials.new('TC_TeamColor');team.use_nodes=True
rgb=[.76,.18,.21]
linear=lambda v:v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
team.diffuse_color=(*[linear(v) for v in rgb],1)
team.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=team.diffuse_color
team.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.78
body=parts[0];me=body.data
im=next(n.image for n in body.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
import numpy as np
pixels=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(pixels)
pixels=pixels.reshape((im.size[1],im.size[0],4))
def color_at(uv):
 return pixels[min(im.size[1]-1,max(0,int(uv[1]*im.size[1]))),min(im.size[0]-1,max(0,int(uv[0]*im.size[0]))),:3]
def is_green(c):return c[1]>c[0]*1.0 and c[1]>c[2]*1.22 and c[1]>.035
uv=me.uv_layers.active.data;colors=me.color_attributes.new(name='Team cloth shading',type='FLOAT_COLOR',domain='CORNER')
for c in colors.data:c.color=(1,1,1,1)
me.materials.append(team);team_faces=0
for face in me.polygons:
 uvs=[uv[i].uv.copy() for i in face.loop_indices]
 samples=[color_at(t) for t in uvs]+[color_at(sum(uvs,Vector((0,0)))/len(uvs))]
 center=sum((me.vertices[i].co for i in face.vertices),Vector())/len(face.vertices)
 in_cloth_zone=center.z>.48 or (center.z<.36 and abs(center.x)<.105 and center.y<-.025)
 if in_cloth_zone and (is_green(samples[-1]) or sum(is_green(c) for c in samples)>=2):
  face.material_index=1;team_faces+=1
  for i in face.loop_indices:
   c=color_at(uv[i].uv);shade=min(1.,max(.28,float(c[1])/.6))
   colors.data[i].color=(shade,shade,shade,1)
assert team_faces>30, f'Ownership extraction found too few cloth faces: {team_faces}'
# A plain rear tabard covers the removed abdomen, matching the requested back silhouette.
vs=[];fs=[]
for z,y,half in [(.365,.131,.077),(.313,.139,.080),(.265,.161,.073),(.208,.131,.042),(.173,.11,0)]:
 for col in range(3):
  x=(col-1)*half
  vs.append((x,y+(.008 if col==1 else 0),z))
for row in range(4):
 for col in range(2):fs.append((row*3+col,row*3+col+1,(row+1)*3+col+1,(row+1)*3+col))
cloth_mesh=bpy.data.meshes.new('Rear cloth');cloth_mesh.from_pydata(vs,[],fs);cloth_mesh.materials.append(team)
cloth=bpy.data.objects.new('Rear team cloth',cloth_mesh);scene.collection.objects.link(cloth)
cloth.parent=rig;cloth['role']='warrior';cloth['tripo_part']=8
g=cloth.vertex_groups.new(name='mixamorig:Hips');g.add(list(range(len(vs))),1,'REPLACE')
mod=cloth.modifiers.new('Rig','ARMATURE');mod.object=rig;parts[8]=cloth
for face in cloth_mesh.polygons:face.use_smooth=True
# Joining meshes with and without a color attribute otherwise fills the missing
# attribute with black, multiplying the original natural-material textures to zero.
for o in parts.values():
 if not o.data.color_attributes:
  attr=o.data.color_attributes.new(name='Team cloth shading',type='FLOAT_COLOR',domain='CORNER')
  for c in attr.data:c.color=(1,1,1,1)
for a in bpy.data.actions:
 a.use_fake_user=True
 a.name=('attack_sword' if a.name.startswith('A planted sword-and-shield') else {'slash':'slash_preset','hit_to_body_01':'hit','fall':'death'}.get(a.name,a.name))
# Keep the reference's closed grips. Imported generic human finger motion should
# not uncurl the modeled hands or pull individual fingers through rigid gear.
for a in bpy.data.actions:
 channels=a.layers[0].strips[0].channelbag(a.slots[0]).fcurves
 grouped={}
 for fc in channels:
  if fc.data_path.endswith('rotation_quaternion'):
   grouped.setdefault(fc.data_path,{})[fc.array_index]=fc
 for path,curves in grouped.items():
  bone=path.split('"')[1];weight=1.
  if any(x in bone for x in ['HandIndex','HandMiddle','HandRing','HandPinky','HandThumb']):weight=0.
  if a.name in ('idle','walk','run') and any(bone.endswith(x) for x in ['Arm','ForeArm','Hand']):weight=.15
  if a.name=='attack_sword' and any(bone.endswith(x) for x in ['LeftArm','LeftForeArm','LeftHand']):weight=.18
  if weight==1 or len(curves)!=4:continue
  frames=[p.co.x for p in curves[0].keyframe_points]
  values=[Quaternion((1,0,0,0)).slerp(Quaternion([curves[i].evaluate(f) for i in range(4)]).normalized(),weight) for f in frames]
  for i,fc in curves.items():
   for point,q in zip(fc.keyframe_points,values):point.co.y=q[i]
   fc.update()
# The image-derived rest grip differs from a generic human animation's wrist.
# Calibrate the attack wrist at its actual strike so the rigid blade points out
# toward the opponent instead of behind the helmet. Apply one local correction
# throughout the take, retaining Tripo's arm/torso/leg motion.
attack=bpy.data.actions['attack_sword']
rig.animation_data.action=attack;rig.animation_data.action_slot=attack.slots[0]
for track in rig.animation_data.nla_tracks:track.mute=True
scene.frame_set(35);bpy.context.view_layer.update()
hand=rig.pose.bones['mixamorig:RightHand'];sword=parts[3]
tip_index=max(sword.data.vertices,key=lambda v:v.co.z).index
ev=sword.evaluated_get(bpy.context.evaluated_depsgraph_get())
tip=rig.matrix_world.inverted() @ (ev.matrix_world @ ev.data.vertices[tip_index].co)
inv=hand.matrix.to_quaternion().inverted()
direction=(inv @ (tip-hand.head)).normalized()
desired=(inv @ Vector((-.08,-1,-.18))).normalized()
correction=direction.rotation_difference(desired)
channels=attack.layers[0].strips[0].channelbag(attack.slots[0]).fcurves
curves={fc.array_index:fc for fc in channels if fc.data_path=='pose.bones["mixamorig:RightHand"].rotation_quaternion'}
frames=[p.co.x for p in curves[0].keyframe_points]
values=[(Quaternion([curves[i].evaluate(f) for i in range(4)]).normalized() @ correction).normalized() for f in frames]
for i,fc in curves.items():
 for point,q in zip(fc.keyframe_points,values):point.co.y=q[i]
 fc.update()
# Preserve the generated performance while trimming its duration to an RTS beat.
end=float(attack.frame_range[1]);factor=30/end
for fc in channels:
 for point in fc.keyframe_points:
  point.co.x*=factor;point.handle_left.x*=factor;point.handle_right.x*=factor
 fc.update()
# Start in the original reference pose; all imported actions remain editable in the NLA.
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
for pb in rig.pose.bones:
 pb.location=(0,0,0);pb.rotation_quaternion=(1,0,0,0);pb.scale=(1,1,1)
rig.data.pose_position='POSE'
stage=bpy.data.collections.new('Studio');scene.collection.children.link(stage)
create_stage(CFG,stage)
ref=bpy.data.images.load(str(P/'reference.png'));ref.name='reference.png';ref.pack();ref.use_fake_user=True
for im in bpy.data.images:
 if im.source=='FILE':
  try:im.pack()
  except RuntimeError:pass
scene.frame_set(0)
bpy.context.view_layer.update()
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.shading.type='MATERIAL'
   area.spaces.active.region_3d.view_distance=3.5
   area.spaces.active.region_3d.view_location=(0,0,1)
bpy.ops.wm.save_as_mainfile(filepath=str(P/CFG['blend']))
scene.render.filepath=str(P/'render.png')
bpy.ops.render.render(write_still=True)
# Existing studio exporter preserves textures, armature and named clips.
from export_character import export_character
meta=export_character(P,P/'model.glb')
(P/'viewer.json').write_text(json.dumps(meta,indent=2)+'\n')
(P/'model-stats.json').write_text(json.dumps({'sourceTriangles':9490,'visibleSourceTriangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in parts.values() if 'role' in o),'runtimeTriangles':meta['triangles'],'bones':len(rig.data.bones),'animations':meta['animations'],'notes':['Tripo-generated textured mesh; Blender import adapter','Rigid head, shield, sword and pommel weights','Rear shell retained hidden in editable source; plain rear team cloth added','Tripo presets plus generated diagonal slash with local grip and timing correction; no facial rig','Configured attack event; paired gameplay combat not yet verified']},indent=2)+'\n')
# Quick independent pose inspections on the reduced export geometry.
for a in bpy.data.actions:
 a.use_fake_user=True
print('TRIPO_STUDY_READY',meta['triangles'],meta['animations'])
