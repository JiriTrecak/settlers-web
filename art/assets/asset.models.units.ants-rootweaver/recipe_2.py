import math
from mathutils import Quaternion,Matrix,Vector
from mathutils.kdtree import KDTree

def rigid(mesh,v,name):
 for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
 mesh.vertex_groups['mixamorig:'+name].add([v.index],1,'REPLACE')
for mesh in meshes:
 # Connected UV islands preserve rigid gear even where a staff touches a hand.
 adj={v.index:set()for v in mesh.data.vertices}
 for e in mesh.data.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
 pending=set(adj);fan=set();staff=set();abdomen=set()
 while pending:
  todo=[pending.pop()];ids=[]
  while todo:
   i=todo.pop();ids.append(i)
   for j in adj[i]:
    if j in pending:pending.remove(j);todo.append(j)
  pts=[mesh.data.vertices[i].co for i in ids];lo=[min(p[k]for p in pts)for k in range(3)];hi=[max(p[k]for p in pts)for k in range(3)]
  if lo[2]>.60 and lo[1]>.0:fan.update(ids)
  elif lo[0]>.145 and hi[1]<.005:staff.update(ids)
  elif lo[0]>-.09 and hi[0]<.106 and lo[2]>.12 and hi[2]<.50:abdomen.update(ids)
 im=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
 pixels=np.asarray(im.pixels[:]).reshape(im.size[1],im.size[0],4);colours={}
 for loop in mesh.data.loops:
  u,v=mesh.data.uv_layers.active.data[loop.index].uv;colours[loop.vertex_index]=pixels[min(im.size[1]-1,int(v*im.size[1])),min(im.size[0]-1,int(u*im.size[0])),:3]
 for v in mesh.data.vertices:
  x,y,z=v.co;r,g,b=colours[v.index]
  if v.index in fan:
   rigid(mesh,v,'Spine2')
   pivot=Vector((0,.05,.60));angle=-math.radians(30)*min(1,max(0,(z-.60)/.12))*(.5+.5*max(0,1-abs(x)/.20));v.co=pivot+Quaternion((1,0,0),angle)@(v.co-pivot)
  elif v.index in staff:rigid(mesh,v,'LeftHand')
  elif z>.585 and y<.012 and x<.14:rigid(mesh,v,'Head')
  elif v.index in abdomen:rigid(mesh,v,'Hips')
 (work/'equipment-selection.json').write_text(json.dumps({'fan':sorted(fan),'staff':sorted(staff)}))
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
