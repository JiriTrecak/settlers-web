import math
from mathutils import Quaternion,Matrix
from mathutils.kdtree import KDTree

def rigid(mesh,v,name):
 for group in [g.group for g in v.groups]:mesh.vertex_groups[group].remove([v.index])
 mesh.vertex_groups['mixamorig:'+name].add([v.index],1,'REPLACE')

for mesh in meshes:
 valid=[]
 for v in mesh.data.vertices:
  weights=[(g.group,g.weight)for g in v.groups if mesh.vertex_groups[g.group].name.startswith('mixamorig:') and g.weight>0]
  if weights:valid.append((v.index,weights))
 tree=KDTree(len(valid));lookup=dict(valid)
 for i,_ in valid:tree.insert(mesh.data.vertices[i].co,i)
 tree.balance()
 for v in mesh.data.vertices:
  weights=lookup.get(v.index) or lookup[tree.find(v.co)[1]]
  for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
  total=sum(w for _,w in weights)
  for g,w in weights:mesh.vertex_groups[g].add([v.index],w/total,'REPLACE')
  x,y,z=v.co
  # The generated wooden mortar and harness form a single rigid back load.
  if z>.70 or (y>-.025 and z>.15):rigid(mesh,v,'Spine2')

def activate(a):rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
for a in list(bpy.data.actions):
 activate(a);samples=[]
 for frame in range(int(a.frame_range[0]),int(a.frame_range[1])+1):
  scene.frame_set(frame);poses={}
  for b in rig.pose.bones:
   name=b.name.split(':')[-1]
   if any(x in name for x in ['Hand','Arm','Shoulder','Head','Neck','Spine']):
    retain=0 if a.name=='death' or any(x in name for x in ['Hand','Arm','Shoulder']) else .2 if name in ['Head','Neck'] else .45
    poses[b.name]=Quaternion().slerp(b.rotation_quaternion,retain)
  samples.append((frame,poses))
 for frame,poses in samples:
  for name,q in poses.items():b=rig.pose.bones[name];b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=frame)

for name in ['idle','cast','hit']:bpy.data.actions.remove(bpy.data.actions[name])
def keypose(frame):
 for b in rig.pose.bones:
  b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
def torso(angle):
 bpy.context.view_layer.update();b=rig.pose.bones['mixamorig:Spine'];pivot=b.head.copy()
 b.matrix=Matrix.Translation(pivot)@Quaternion((1,0,0),angle).to_matrix().to_4x4()@Matrix.Translation(-pivot)@b.matrix

a=bpy.data.actions.new('idle');a.use_fake_user=True;rig.animation_data.action=a
for frame in range(97):
 for b in rig.pose.bones:b.matrix_basis.identity()
 torso(math.sin(frame/96*math.tau)*.008);keypose(frame)

a=bpy.data.actions.new('hit');a.use_fake_user=True;rig.animation_data.action=a
for frame in range(25):
 for b in rig.pose.bones:b.matrix_basis.identity()
 t=frame/24;torso(-.065*math.sin(math.pi*t));keypose(frame)

# Settle into a forward brace, fire at frame 16, absorb recoil quickly and recover.
keys=[(0,0),(10,.08),(15,.10),(16,.10),(19,-.12),(24,-.06),(36,.015),(52,0)]
for name in ['attack','cast']:
 a=bpy.data.actions.new(name);a.use_fake_user=True;rig.animation_data.action=a
 for frame in range(53):
  for b in rig.pose.bones:b.matrix_basis.identity()
  for (f0,v0),(f1,v1) in zip(keys,keys[1:]):
   if f0<=frame<=f1:t=(frame-f0)/(f1-f0);v=v0+(v1-v0)*t*t*(3-2*t);break
  torso(v);keypose(frame)

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
(work/'motion-events.json').write_text(json.dumps({'attack':{'time':16/24,'contact':16/52},'cast':{'time':16/24,'contact':16/52}},indent=2))
