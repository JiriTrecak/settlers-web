import math
from mathutils import Quaternion,Matrix
from mathutils.kdtree import KDTree

def rigid(mesh,v,name):
 for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
 mesh.vertex_groups['mixamorig:'+name].add([v.index],1,'REPLACE')
for mesh in meshes:
 im=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
 pixels=np.asarray(im.pixels[:]).reshape(im.size[1],im.size[0],4);colours={}
 for loop in mesh.data.loops:
  u,v=mesh.data.uv_layers.active.data[loop.index].uv;colours[loop.vertex_index]=pixels[min(im.size[1]-1,int(v*im.size[1])),min(im.size[0]-1,int(u*im.size[0])),:3]
 valid=[]
 for v in mesh.data.vertices:
  weights=[(g.group,g.weight)for g in v.groups if mesh.vertex_groups[g.group].name.startswith('mixamorig:') and g.weight>0]
  if weights:valid.append((v.index,weights))
 tree=KDTree(len(valid));lookup=dict(valid)
 for i,_ in valid:tree.insert(mesh.data.vertices[i].co,i)
 tree.balance()
 for v in mesh.data.vertices:
  weights=lookup.get(v.index) or lookup[tree.find(v.co)[1]]
  r,g,b=colours[v.index]
  leaf=r>.055 and g<r*.15 and b<r*.65
  # The provider assigned free-hand fingers to the neighbouring red skirt.
  # Identify the cloth by paint, retaining the orange hand above the hem.
  if v.co.z<.32 or (v.co.z<.48 and leaf):
   anatomical=[(g,w)for g,w in weights if not any(n in mesh.vertex_groups[g].name for n in ['Hand','Arm'])]
   if anatomical:weights=anatomical
  for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
  total=sum(w for _,w in weights)
  for g,w in weights:mesh.vertex_groups[g].add([v.index],w/total,'REPLACE')
  x,y,z=v.co
  r,g,b=colours[v.index];chitin=r>.5 and .15*r<g<.4*r and b<.6*g
  if z>.70 and chitin:rigid(mesh,v,'Head')
  elif x>.055 and z>.70 or x>.105 and z>.29:rigid(mesh,v,'LeftHand')
  elif z>.70:rigid(mesh,v,'Head')

def activate(a):rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
for a in list(bpy.data.actions):
 activate(a);samples=[]
 for frame in range(int(a.frame_range[0]),int(a.frame_range[1])+1):
  scene.frame_set(frame);poses={}
  for b in rig.pose.bones:
   name=b.name.split(':')[-1]
   if any(x in name for x in ['Hand','Arm','Shoulder','Head','Neck','Spine']):
    retain=0 if any(x in name for x in ['Hand','Arm','Shoulder']) else .15 if name in ['Head','Neck'] else .4
    poses[b.name]=Quaternion().slerp(b.rotation_quaternion,retain)
  samples.append((frame,poses))
 for frame,poses in samples:
  for name,q in poses.items():b=rig.pose.bones[name];b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=frame)
for name in ['idle','cast','hit']:bpy.data.actions.remove(bpy.data.actions[name])
def keypose(frame):
 for b in rig.pose.bones:
  b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
def rotate(name,axis,angle):
 bpy.context.view_layer.update();b=rig.pose.bones['mixamorig:'+name];pivot=b.head.copy()
 b.matrix=Matrix.Translation(pivot)@Quaternion(axis,angle).to_matrix().to_4x4()@Matrix.Translation(-pivot)@b.matrix
for name,end in [('idle',96),('hit',24),('attack',40),('cast',48)]:
 a=bpy.data.actions.new(name);a.use_fake_user=True;rig.animation_data.action=a
 for frame in range(end+1):
  for b in rig.pose.bones:b.matrix_basis.identity()
  t=frame/end
  if name=='idle':rotate('Spine',(1,0,0),math.sin(t*math.tau)*.008)
  elif name=='hit':rotate('Spine',(1,0,0),-.08*math.sin(math.pi*t))
  else:
   strength=math.sin(math.pi*t)**2;rotate('Spine',(1,0,0),.04*strength);rotate('RightArm',(1,0,0),-.65*strength);rotate('RightForeArm',(1,0,0),-.35*strength)
   rotate('LeftArm',(1,0,0),-.16*strength)
  keypose(frame)
(work/'motion-events.json').write_text(json.dumps({'attack':{'time':20/24,'contact':.5},'cast':{'time':24/24,'contact':.5}},indent=2))
# Tilt the open focus toward the commander camera; its negative space must
# remain visible from directly above as well as from the front.
for action in list(bpy.data.actions):
 activate(action);samples=[]
 for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
  scene.frame_set(frame);rotate('LeftHand',(1,0,0),math.radians(30));samples.append((frame,rig.pose.bones['mixamorig:LeftHand'].rotation_quaternion.copy()))
 for frame,q in samples:
  b=rig.pose.bones['mixamorig:LeftHand'];b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=frame)
