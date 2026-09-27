"""Low-triangle bow equipment and hand-fitted correction of the Tripo shot.
Generated torso/legs remain; baked two-bone IK gives the ant's short arms a
reachable draw. String and arrow are real skinned geometry, not render overlays.
"""
import bpy,math
from mathutils import Vector,Matrix,Quaternion

def add_bow(rig,scene):
 left=rig.data.bones['mixamorig:LeftHand'];right=rig.data.bones['mixamorig:RightHand']
 palmL=Vector((.232,-.047,.286));palmR=Vector((-.224,-.05,.285))
 offsetL=palmL-left.head_local;offsetR=palmR-right.head_local
 center=palmL+Vector((0,.075,0));tipTop=palmL+Vector((0,.075,.275));tipBottom=palmL+Vector((0,.075,-.275))
 bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
 for name,head,parent in [('bow_nock',center,'mixamorig:LeftHand'),('bow_arrow',center,'bow_nock'),('socket_projectile',palmL,'mixamorig:LeftHand')]:
  b=rig.data.edit_bones.new(name);b.head=head;b.tail=head+Vector((0,-.02,0));b.parent=rig.data.edit_bones[parent];b.use_deform=name!='socket_projectile'
 bpy.ops.object.mode_set(mode='OBJECT')
 def mat(name,color,rough=.75):
  m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=rough;return m
 wood=mat('Bow_Wood',(.27,.125,.038));ivory=mat('Bow_Ivory',(.68,.51,.30));string=mat('Bow_Fiber',(.43,.32,.17))
 def mesh(name,vertices,faces,material,weights):
  me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.materials.append(material)
  ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);ob.parent=rig;ob['role']='archer'
  for bone,indices in weights.items():g=ob.vertex_groups.new(name=bone);g.add(indices,1,'REPLACE')
  mod=ob.modifiers.new('Equipment rig','ARMATURE');mod.object=rig
  for face in me.polygons:face.use_smooth=True
  return ob
 # A tapered recurved timber limb, with six-sided cross-sections.
 vertices=[];rings=13
 for i in range(rings):
  t=(i/(rings-1)-.5)*2;z=.275*t;y=.075*(abs(t)**1.6)
  radius=.012*(1-.53*abs(t))
  for j in range(6):vertices.append(tuple(palmL+Vector((radius*math.cos(j*math.tau/6),y+radius*math.sin(j*math.tau/6),z))))
 faces=[tuple(range(5,-1,-1)),tuple(range((rings-1)*6,rings*6))]
 for i in range(rings-1):
  for j in range(6):a=i*6+j;b=i*6+(j+1)%6;faces.append((a,b,b+6,a+6))
 mesh('Carved timber bow',vertices,faces,wood,{'mixamorig:LeftHand':list(range(len(vertices)))})
 for suffix,tip,sign in [('upper',tipTop,1),('lower',tipBottom,-1)]:
  vs=[tuple(tip+Vector((.013*math.cos(j*math.tau/6),.013*math.sin(j*math.tau/6),0))) for j in range(6)]+[tuple(tip+Vector((0,0,sign*.035)))]
  mesh('Ivory bow tip '+suffix,vs,[(j,(j+1)%6,6) for j in range(6)]+[tuple(range(5,-1,-1))],ivory,{'mixamorig:LeftHand':list(range(7))})
 # Two narrow ribbons meeting at a separately animated nock bone.
 vs=[];weights={'mixamorig:LeftHand':[],'bow_nock':[]};faces=[]
 for tip in [tipTop,tipBottom]:
  start=len(vs)
  for point,bone in [(tip,'mixamorig:LeftHand'),(center,'bow_nock')]:
   for dx in [-.0018,.0018]:weights[bone].append(len(vs));vs.append(tuple(point+Vector((dx,0,0))))
  faces.extend([(start,start+1,start+3,start+2),(start+2,start+3,start+1,start)])
 mesh('Drawn bowstring',vs,faces,string,weights)
 # Arrow points forward along the nock bone's local Y axis.
 vs=[];faces=[]
 for d in [0,.35]:
  for j in range(4):vs.append(tuple(center+Vector((.0028*math.cos(j*math.tau/4),-d,.0028*math.sin(j*math.tau/4)))))
 faces.extend([(j,(j+1)%4,(j+1)%4+4,j+4) for j in range(4)])
 mesh('Nocked arrow shaft',vs,faces,wood,{'bow_arrow':list(range(len(vs)))})
 vs=[tuple(center+Vector((x,-.35,z))) for x,z in [(-.017,0),(0,.013),(.017,0),(0,-.013)]]+[tuple(center+Vector((0,-.41,0)))]
 mesh('Nocked ivory arrowhead',vs,[(j,(j+1)%4,4) for j in range(4)],ivory,{'bow_arrow':list(range(5))})
 for axis in [(1,0,0),(0,0,1)]:
  v=Vector(axis)*.025;vs=[tuple(center+Vector((0,-d,0))+v*s) for d,s in [(.01,0),(.07,0),(.07,1),(.025,1)]]
  mesh('Ivory arrow feathers',vs,[(0,1,2,3),(3,2,1,0)],ivory,{'bow_arrow':list(range(4))})
 upper=['mixamorig:'+n for n in ['Spine','Spine1','Spine2','Neck','Head']]
 idle=bpy.data.actions['idle'];rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0];scene.frame_set(0)
 neutral={n:rig.pose.bones[n].rotation_quaternion.copy() for n in upper}
 action=bpy.data.actions['attack_bow'];end=int(action.frame_range[1]);release=39
 rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
 for track in rig.animation_data.nla_tracks:track.mute=True
 # Add temporary arm targets and poles; bake the evaluated motion, then remove.
 targets=[];constraints=[]
 for side in ['Left','Right']:
  target=bpy.data.objects.new(side+' draw target',None);pole=bpy.data.objects.new(side+' draw elbow',None)
  scene.collection.objects.link(target);scene.collection.objects.link(pole)
  c=rig.pose.bones['mixamorig:'+side+'ForeArm'].constraints.new('IK');c.target=target;c.pole_target=pole;c.chain_count=2;c.use_stretch=False
  # Mixamo local axes differ from generic Blender limbs. The pole angle follows
  # the imported rest arm plane and is verified in the exported firing pose.
  c.pole_angle=math.pi/2 if side=='Left' else -math.pi/2
  targets.append((target,pole));constraints.append(c)
 samples=[]
 def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
 def point_for_hand(side,offset):
  pose=rig.pose.bones['mixamorig:'+side+'Hand'];rest=rig.data.bones[pose.name]
  return pose.matrix@rest.matrix_local.inverted()@(rest.head_local+offset)
 for f in range(end+1):
  for c in constraints:c.influence=0
  scene.frame_set(f)
  for n,q in neutral.items():rig.pose.bones[n].rotation_quaternion=q
  bpy.context.view_layer.update()
  influence=smooth((f-7)/15)*(1-smooth((f-48)/20))
  torso=rig.pose.bones['mixamorig:Spine2'].head-rig.data.bones['mixamorig:Spine2'].head_local
  draw=smooth((f-16)/16)
  aims=[Vector((.155,-.235,.49))-offsetL,Vector((.155,-.17+.15*draw,.49))-offsetR]
  # Release hand follows through backwards after the arrow is gone.
  if f>=release:aims[1].y+=.035*smooth((f-release)/5)
  for i,side in enumerate(['Left','Right']):
   wrist=rig.pose.bones['mixamorig:'+side+'Hand'].head.copy();target,pole=targets[i]
   target.location=rig.matrix_world@(wrist.lerp(aims[i]+torso,influence))
   pole.location=rig.matrix_world@(Vector((.32 if i==0 else -.32,-.02 if i==0 else .19,.48))+torso)
   constraints[i].influence=1
  bpy.context.view_layer.update()
  for side in ['Left','Right']:
   hand=rig.pose.bones['mixamorig:'+side+'Hand'];rest=rig.data.bones[hand.name]
   current=hand.matrix.to_quaternion();desired=current.slerp(rest.matrix_local.to_quaternion(),influence)
   hand.matrix=Matrix.Translation(hand.head)@desired.to_matrix().to_4x4()
  bpy.context.view_layer.update()
  leftFrame=rig.pose.bones['mixamorig:LeftHand'].matrix@rig.data.bones['mixamorig:LeftHand'].matrix_local.inverted()
  bowCenter=leftFrame@center;bowGrip=leftFrame@palmL
  drawPoint=point_for_hand('Right',offsetR)
  stringDraw=smooth((f-15)/15)*(1-smooth((f-release)/2))
  nock=bowCenter.lerp(drawPoint,stringDraw)
  direction=Vector((0,-1,0))
  rig.pose.bones['bow_nock'].matrix=Matrix.Translation(nock)@direction.to_track_quat('Y','Z').to_matrix().to_4x4()
  scale=1 if 14<=f<release else .0001
  rig.pose.bones['bow_arrow'].scale=(scale,scale,scale)
  bpy.context.view_layer.update()
  names=upper+['mixamorig:'+side+part for side in ['Left','Right'] for part in ['Arm','ForeArm','Hand']]+['bow_nock','bow_arrow']
  samples.append({n:rig.pose.bones[n].matrix.copy() for n in names})
 for side,c in zip(['Left','Right'],constraints):rig.pose.bones['mixamorig:'+side+'ForeArm'].constraints.remove(c)
 for pair in targets:
  for o in pair:bpy.data.objects.remove(o,do_unlink=True)
 # Baked local transforms remain editable, with no runtime IK dependency.
 for f,poses in enumerate(samples):
  scene.frame_set(f)
  for name,matrix in poses.items():
   pb=rig.pose.bones[name];pb.matrix=matrix
   for prop in ['location','rotation_quaternion','scale']:pb.keyframe_insert(prop,frame=f,group=name)
   bpy.context.view_layer.update()
 # Every other state deliberately hides the held arrow, retaining quiver arrows.
 for a in bpy.data.actions:
  if a==action:continue
  rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
  for f in [a.frame_range[0],a.frame_range[1]]:
   rig.pose.bones['bow_arrow'].scale=(.0001,)*3;rig.pose.bones['bow_arrow'].keyframe_insert('scale',frame=f,group='bow_arrow')
 rig.animation_data.action=None
 for pb in rig.pose.bones:pb.location=(0,0,0);pb.rotation_quaternion=(1,0,0,0);pb.scale=(1,1,1)
 rig.pose.bones['bow_arrow'].scale=(.0001,)*3
 return release/end
