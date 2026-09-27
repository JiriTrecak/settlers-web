"""Rigid mounted mortar, measured muzzle socket and editable firing recoil."""
import bpy,math
from mathutils import Vector,Quaternion

def add_mortar(rig,scene,objects):
 bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
 barrel=rig.data.edit_bones.new('mortar');barrel.head=(0,.075,.67);barrel.tail=(0,-.265,.858);barrel.parent=rig.data.edit_bones['mixamorig:Spine2']
 socket=rig.data.edit_bones.new('socket_projectile');socket.head=barrel.tail;socket.tail=barrel.tail+Vector((0,-.015,.015));socket.parent=barrel;socket.use_deform=False
 bpy.ops.object.mode_set(mode='OBJECT')
 part=next(o for o in objects if o['tripo_part']==0);part.vertex_groups.clear();g=part.vertex_groups.new(name='mortar');g.add(list(range(len(part.data.vertices))),1,'REPLACE')
 # Preserve planted generated legs; replace the unsuitable raised-arm motion.
 upper=['mixamorig:'+n for n in ['Spine','Spine1','Spine2','Neck','Head','LeftShoulder','RightShoulder','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftHand','RightHand']]
 idle=bpy.data.actions['idle'];rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0];scene.frame_set(0)
 neutral={n:(rig.pose.bones[n].location.copy(),rig.pose.bones[n].rotation_quaternion.copy(),rig.pose.bones[n].scale.copy()) for n in upper}
 shot=bpy.data.actions['attack_mortar'];rig.animation_data.action=shot;rig.animation_data.action_slot=shot.slots[0]
 for f in range(72):
  scene.frame_set(f)
  brace=min(1,max(0,(f-8)/22))*(1-min(1,max(0,(f-45)/26)))
  kick=max(0,1-abs(f-38)/9)
  for n,(loc,rot,scale) in neutral.items():
   b=rig.pose.bones[n];b.location=loc;b.rotation_quaternion=rot;b.scale=scale
   if n=='mixamorig:Spine':b.rotation_quaternion=rot@Quaternion((1,0,0),.07*brace-.13*kick)
   for prop in ['location','rotation_quaternion','scale']:b.keyframe_insert(prop,frame=f,group=n)
 for action in bpy.data.actions:
  rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
  b=rig.pose.bones['mortar'];b.rotation_mode='QUATERNION'
  keys=[(0,0),(30,0),(35,0),(36,-.065),(39,-.07),(46,-.025),(57,0),(71,0)] if action.name=='attack_mortar' else [(action.frame_range[0],0),(action.frame_range[1],0)]
  for frame,recoil in keys:
   b.location=(0,recoil,0);b.keyframe_insert('location',frame=frame,group='Mortar recoil')
 rig.animation_data.action=None
 for pb in rig.pose.bones:pb.location=(0,0,0);pb.rotation_quaternion=(1,0,0,0);pb.scale=(1,1,1)
 return 36/71
