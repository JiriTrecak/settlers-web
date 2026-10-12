import math
from mathutils import Quaternion,Matrix
# Preserve rigid carried objects while retaining the provider skin on robe/limbs.
def rigid(mesh,v,name):
 for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
 mesh.vertex_groups['mixamorig:'+name].add([v.index],1,'REPLACE')
# A handful of provider vertices have nondeforming helper weights. Restore
# anatomical weights from the coincident seam, or nearest weighted surface.
from mathutils.kdtree import KDTree
for mesh in meshes:
 valid=[]
 for v in mesh.data.vertices:
  weights=[(g.group,g.weight) for g in v.groups if mesh.vertex_groups[g.group].name.startswith('mixamorig:') and g.weight>0]
  if weights:valid.append((v.index,weights))
 tree=KDTree(len(valid));lookup=dict(valid)
 for i,_ in valid:tree.insert(mesh.data.vertices[i].co,i)
 tree.balance()
 for v in mesh.data.vertices:
  if not any(not mesh.vertex_groups[g.group].name.startswith('mixamorig:') for g in v.groups):continue
  weights=lookup.get(v.index)
  if not weights:weights=lookup[tree.find(v.co)[1]]
  for group in [g.group for g in v.groups]:mesh.vertex_groups[group].remove([v.index])
  total=sum(w for _,w in weights)
  for group,w in weights:mesh.vertex_groups[group].add([v.index],w/total,'REPLACE')

for mesh in meshes:
 im=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
 pixels=np.asarray(im.pixels[:]).reshape(im.size[1],im.size[0],4);leaf=set()
 for loop in mesh.data.loops:
  u,v=mesh.data.uv_layers.active.data[loop.index].uv
  if pixels[min(im.size[1]-1,int(v*im.size[1])),min(im.size[0]-1,int(u*im.size[0])),3]>.8:leaf.add(loop.vertex_index)
 for v in mesh.data.vertices:
  x,y,z=v.co
  if x<-.17 and y<-.055 and .20<z<.61:rigid(mesh,v,'RightHand')
  elif x>.22 and y<.03 and .39<z<.56:rigid(mesh,v,'LeftHand')
  elif z>.67:rigid(mesh,v,'Head')
def activate(a):rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
for a in list(bpy.data.actions):
 activate(a);samples=[]
 for frame in range(int(a.frame_range[0]),int(a.frame_range[1])+1):
  scene.frame_set(frame);poses={}
  for b in rig.pose.bones:
   name=b.name.split(':')[-1]
   if any(x in name for x in ['Hand','Arm','Head','Neck','Spine']):
    retain=.0 if 'Hand' in name else .12 if 'Arm' in name else .25 if name in ['Head','Neck'] else .5
    poses[b.name]=Quaternion().slerp(b.rotation_quaternion,retain)
  samples.append((frame,poses))
 for frame,poses in samples:
  for name,q in poses.items():b=rig.pose.bones[name];b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=frame)
bpy.data.actions.remove(bpy.data.actions['idle']);a=bpy.data.actions.new('idle');a.use_fake_user=True;rig.animation_data.action=a
for frame in range(97):
 for b in rig.pose.bones:b.matrix_basis.identity()
 rig.pose.bones['mixamorig:Spine'].rotation_quaternion=Quaternion((1,0,0),math.sin(frame/96*math.tau)*.012)
 for b in rig.pose.bones:
  b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
# Correct world-space torso pitch after retargeting. Human run clips lean the
# ant's large head much too far down even with reduced local rotations.
activate(bpy.data.actions['idle']);scene.frame_set(0)
spine=rig.pose.bones['mixamorig:Spine'];head=rig.pose.bones['mixamorig:Head']
def pitch():
 v=head.head-spine.head;return math.atan2(-v.y,v.z)
baseline=pitch()
for name in ['walk','run']:
 action=bpy.data.actions[name];activate(action);samples=[]
 for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
  scene.frame_set(frame);current=pitch();delta=baseline+.22*(current-baseline)-current;pivot=spine.head.copy()
  spine.matrix=Matrix.Translation(pivot)@Quaternion((1,0,0),delta).to_matrix().to_4x4()@Matrix.Translation(-pivot)@spine.matrix
  samples.append((frame,spine.rotation_quaternion.copy()))
 for frame,q in samples:spine.rotation_quaternion=q;spine.keyframe_insert('rotation_quaternion',frame=frame)
# Raise the bowl toward the ally, tip a drop, and settle it back into the palm.
bpy.data.actions.remove(bpy.data.actions['cast']);a=bpy.data.actions.new('cast');a.use_fake_user=True;rig.animation_data.action=a
keys=[(0,(0,0,0)),(9,(-.22,-.08,-.025)),(13,(.32,.10,.035)),(19,(.22,.06,.02)),(36,(0,0,0))]
for frame in range(37):
 for b in rig.pose.bones:b.matrix_basis.identity()
 for (f0,v0),(f1,v1) in zip(keys,keys[1:]):
  if f0<=frame<=f1:
   t=(frame-f0)/(f1-f0);v=Vector(v0).lerp(Vector(v1),t*t*(3-2*t));break
 for name,axis,value in [('LeftArm',(1,0,0),v.x),('LeftForeArm',(0,0,1),v.y),('Spine',(0,0,1),v.z)]:
  rig.pose.bones['mixamorig:'+name].rotation_quaternion=Quaternion(axis,value)
 bpy.context.view_layer.update()
 hand=rig.pose.bones['mixamorig:LeftHand'];pivot=hand.head.copy();hand.matrix=Matrix.Translation(pivot)@Quaternion((1,0,0),v.x*.6).to_matrix().to_4x4()@Matrix.Translation(-pivot)@hand.matrix
 for b in rig.pose.bones:
  b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
attack=a.copy();attack.name='attack';attack.use_fake_user=True
(work/'motion-events.json').write_text(json.dumps({'attack':{'time':13/24,'contact':13/36},'cast':{'time':13/24,'contact':13/36}},indent=2))
