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

# The provider placed the standard hand below its visible grip. Correct its rest
# landmark while preserving the generated surface and in-place body skeleton.
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
h=rig.data.edit_bones['mixamorig:RightHand'];fore=rig.data.edit_bones['mixamorig:RightForeArm']
delta=Vector((-.013,-.082,.432))-h.head.copy();h.head+=delta;h.tail+=delta;fore.tail=h.head
bpy.ops.object.mode_set(mode='OBJECT')
# Split fused equipment at its painted boundaries; body vertices must not be
# dragged along by the rigid pole when the foot steps away from it.
import bmesh
props=[]
for mesh in list(meshes):
 bm=bmesh.new();bm.from_mesh(mesh.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(mesh.data);bm.free()
 im=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
 pixels=np.asarray(im.pixels[:]).reshape(im.size[1],im.size[0],4)
 for kind in ['standard','baton']:
  uv=mesh.data.uv_layers.active
  bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
  for v in mesh.data.vertices:v.select=False
  for e in mesh.data.edges:e.select=False
  for poly in mesh.data.polygons:
   center=sum((mesh.data.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices);x,y,z=center
   rgb=[]
   for loop in poly.loop_indices:
    u,v=uv.data[loop].uv;rgb.append(pixels[min(im.size[1]-1,int(v*im.size[1])),min(im.size[0]-1,int(u*im.size[0])),:3])
   r,g,b=np.mean(rgb,axis=0);chitin=r>.6 and .18*r<g<.42*r and b<.65*g
   equipment=(r>g*1.12 and g>b*1.2)or(g<r*.34 and b>g*.85)
   banner=z>.78 or (x<.032 and z>.52 and not chitin and equipment)
   pole=-.055<x<.035 and y<.02 and .045<z<.52 and not chitin and equipment
   baton=x>.19 and y<.015 and .10<z<.43 and not chitin
   poly.select=bool((banner or pole)if kind=='standard'else baton)
  before=set(bpy.context.scene.objects)
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_mode(type='FACE');bpy.ops.mesh.separate(type='SELECTED');bpy.ops.object.mode_set(mode='OBJECT')
  for prop in set(bpy.context.scene.objects)-before:
   prop.name='Banneret '+kind;props.append(prop)
   for v in prop.data.vertices:rigid(prop,v,'RightHand'if kind=='standard'else'LeftHand')
 for v in mesh.data.vertices:
  x,y,z=v.co
  if z>.51:rigid(mesh,v,'Head')
  elif (v.co-Vector((-.013,-.082,.432))).length<.06:rigid(mesh,v,'RightHand')
  elif x>.20 and .20<z<.36:rigid(mesh,v,'LeftHand')
  elif y>.065 and z<.30:rigid(mesh,v,'Hips')
meshes.extend(props)
# Close exposed attachment cuts with nearby painted samples.
for mesh in meshes:
 bm=bmesh.new();bm.from_mesh(mesh.data);uv_layer=bm.loops.layers.uv.active
 holes=[e for e in bm.edges if e.is_boundary]
 if holes:
  result=bmesh.ops.holes_fill(bm,edges=holes,sides=0)
  for face in result['faces']:
   nearby=[l[uv_layer].uv.copy() for e in face.edges for f in e.link_faces if f!=face for l in f.loops if l.vert in e.verts]
   sample=nearby[0]if nearby else Vector((.5,.5))
   for loop in face.loops:loop[uv_layer].uv=sample
  bmesh.ops.triangulate(bm,faces=list(result['faces']))
 bm.to_mesh(mesh.data);bm.free()
def activate(a):rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
for a in list(bpy.data.actions):
 activate(a);samples=[]
 for frame in range(int(a.frame_range[0]),int(a.frame_range[1])+1):
  scene.frame_set(frame);poses={}
  for b in rig.pose.bones:
   name=b.name.split(':')[-1]
   if any(x in name for x in ['Hand','Arm','Head','Neck','Spine']):
    retain=0 if 'Hand' in name else .10 if 'Arm' in name else .25 if name in ['Head','Neck'] else .5
    poses[b.name]=Quaternion().slerp(b.rotation_quaternion,retain)
  samples.append((frame,poses))
 for frame,poses in samples:
  for name,q in poses.items():b=rig.pose.bones[name];b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=frame)
# Restrained planted standard; the hand follows torso breathing rather than swinging.
for name in ['idle','cast']:
 bpy.data.actions.remove(bpy.data.actions[name])
def keypose(frame):
 for b in rig.pose.bones:
  b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
a=bpy.data.actions.new('idle');a.use_fake_user=True;rig.animation_data.action=a
for frame in range(97):
 for b in rig.pose.bones:b.matrix_basis.identity()
 rig.pose.bones['mixamorig:Spine'].rotation_quaternion=Quaternion((1,0,0),math.sin(frame/96*math.tau)*.01)
 keypose(frame)
# A brief upward rally with the standard, then return to its carrying stance.
for name,keys,end in [('cast',[(0,0),(8,-.08),(13,.65),(22,.55),(40,0)],40),('attack',[(0,0),(8,-.6),(12,1.05),(16,.7),(30,0)],30)]:
 a=bpy.data.actions.new(name);a.use_fake_user=True;rig.animation_data.action=a
 for frame in range(end+1):
  for b in rig.pose.bones:b.matrix_basis.identity()
  for (f0,v0),(f1,v1)in zip(keys,keys[1:]):
   if f0<=frame<=f1:t=(frame-f0)/(f1-f0);v=v0+(v1-v0)*t*t*(3-2*t);break
  if name=='cast':
   bpy.context.view_layer.update()
   arm=rig.pose.bones['mixamorig:RightArm'];pivot=arm.head.copy()
   arm.matrix=Matrix.Translation(pivot)@Quaternion((0,1,0),v).to_matrix().to_4x4()@Matrix.Translation(-pivot)@arm.matrix
  else:
   bpy.context.view_layer.update()
   arm=rig.pose.bones['mixamorig:LeftArm'];pivot=arm.head.copy();arm.matrix=Matrix.Translation(pivot)@Quaternion((1,0,0),-v).to_matrix().to_4x4()@Matrix.Translation(-pivot)@arm.matrix
   rig.pose.bones['mixamorig:LeftForeArm'].rotation_quaternion=Quaternion((0,0,1),v*.45)
   rig.pose.bones['mixamorig:Spine'].rotation_quaternion=Quaternion((0,0,1),v*.06)
  keypose(frame)
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
# Hold the standard with a slight rearward cant, exposing its broad team-color
# face to the overhead camera. Death retains its provider collapse.
rest=Quaternion((1,0,0),math.radians(-25))@rig.data.bones['mixamorig:RightHand'].matrix_local.to_quaternion()
for name in ['idle','walk','run','cast','attack','hit']:
 a=bpy.data.actions[name];activate(a);samples=[]
 for frame in range(int(a.frame_range[0]),int(a.frame_range[1])+1):
  scene.frame_set(frame);h=rig.pose.bones['mixamorig:RightHand'];h.matrix=Matrix.Translation(h.head)@rest.to_matrix().to_4x4();samples.append((frame,h.rotation_quaternion.copy(),h.location.copy()))
 for frame,q,l in samples:
  h.rotation_quaternion=q;h.location=l;h.keyframe_insert('rotation_quaternion',frame=frame);h.keyframe_insert('location',frame=frame)
(work/'motion-events.json').write_text(json.dumps({'attack':{'time':12/24,'contact':12/30},'cast':{'time':13/24,'contact':13/40}},indent=2))
