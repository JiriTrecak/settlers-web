from mathutils import Matrix,Quaternion
import bmesh
import math
# Keep the whole net in its grip and the rigid silk spool on the torso.
def rigid(mesh,v,name):
 for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
 mesh.vertex_groups['mixamorig:'+name].add([v.index],1,'REPLACE')
# The generated prop is welded to the thigh/rope. Separate prop faces first,
# duplicating boundary vertices so the hand cannot drag the character's leg.
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
net_objects=[]
for mesh in list(meshes):
 bm=bmesh.new();bm.from_mesh(mesh.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(mesh.data);bm.free()
 im=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
 pixels=np.asarray(im.pixels[:]).reshape(im.size[1],im.size[0],4);uv=mesh.data.uv_layers.active
 bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
 for v in mesh.data.vertices:v.select=False
 for e in mesh.data.edges:e.select=False
 selected=[]
 for poly in mesh.data.polygons:
  center=sum((mesh.data.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices);x,y,z=center
  colors=[]
  for loop in poly.loop_indices:
   u,v=uv.data[loop].uv;colors.append(pixels[min(im.size[1]-1,int(v*im.size[1])),min(im.size[0]-1,int(u*im.size[0])),:3])
  r,g,b=np.mean(colors,axis=0)
  natural=g>r*.44 and b>r*.20
  prop=natural and ((x>.075 and y<.10 and z>.40) or (x>.035 and y<.035 and .17<z<=.40))
  poly.select=bool(prop)
  if prop:selected.append(poly.index)
 before=set(bpy.context.scene.objects)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_mode(type='FACE');bpy.ops.mesh.separate(type='SELECTED');bpy.ops.object.mode_set(mode='OBJECT')
 for prop in set(bpy.context.scene.objects)-before:
  prop.name='Silk net — rigid held prop';net_objects.append(prop)
  for v in prop.data.vertices:rigid(prop,v,'LeftHand')
 for v in mesh.data.vertices:
  x,y,z=v.co
  if y>.14 and z>.40:
   # The spool's front wooden rim reaches forward of its silk core.
   rigid(mesh,v,'Spine2')
  elif y>.13 and .16<z<.38:rigid(mesh,v,'Hips')
meshes.extend(net_objects)
# Close the small exposed attachment cuts using existing painted color samples.
for mesh in meshes:
 bm=bmesh.new();bm.from_mesh(mesh.data);uv_layer=bm.loops.layers.uv.active
 holes=[e for e in bm.edges if e.is_boundary]
 if holes:
  result=bmesh.ops.holes_fill(bm,edges=holes,sides=0)
  for face in result['faces']:
   nearby=[l[uv_layer].uv.copy() for e in face.edges for f in e.link_faces if f!=face for l in f.loops if l.vert in e.verts]
   sample=nearby[0] if nearby else Vector((.5,.5))
   for loop in face.loops:loop[uv_layer].uv=sample
  bmesh.ops.triangulate(bm,faces=list(result['faces']))
 bm.to_mesh(mesh.data);bm.free()
def activate(a):rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
# Preserve the provider's leg motion; keep the occupied hand in reference grip.
for a in list(bpy.data.actions):
 activate(a);samples=[]
 for frame in range(int(a.frame_range[0]),int(a.frame_range[1])+1):
  scene.frame_set(frame);poses={}
  for b in rig.pose.bones:
   name=b.name.split(':')[-1]
   if any(x in name for x in ['Hand','Arm','Head','Neck','Spine']):
    retain=.0 if name.startswith('LeftHand') else .12 if name in ['LeftArm','LeftForeArm'] else .25 if name in ['Head','Neck'] else .45
    poses[b.name]=Quaternion().slerp(b.rotation_quaternion,retain)
  samples.append((frame,poses))
 for frame,poses in samples:
  for name,q in poses.items():b=rig.pose.bones[name];b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=frame)
# Reference stance with subtle breathing makes the carried net readable.
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
# Net-caster's compact draw-back and forward flick, instead of a human spell dance.
bpy.data.actions.remove(bpy.data.actions['cast']);a=bpy.data.actions.new('cast');a.use_fake_user=True;rig.animation_data.action=a
keys=[(0,(0,0,0)),(8,(-.25,-.15,-.06)),(11,(.55,.12,.09)),(15,(.35,.10,.04)),(30,(0,0,0))]
for frame in range(31):
 for b in rig.pose.bones:b.matrix_basis.identity()
 for (f0,v0),(f1,v1) in zip(keys,keys[1:]):
  if f0<=frame<=f1:
   t=(frame-f0)/(f1-f0);v=Vector(v0).lerp(Vector(v1),t*t*(3-2*t));break
 for name,axis,value in [('LeftArm',(1,0,0),v.x),('LeftForeArm',(0,0,1),v.y),('Spine',(0,0,1),v.z),('RightArm',(1,0,0),v.x*.3)]:
  b=rig.pose.bones['mixamorig:'+name];b.rotation_quaternion=Quaternion(axis,value)
 bpy.context.view_layer.update()
 hand=rig.pose.bones['mixamorig:LeftHand'];pivot=hand.head.copy();hand.matrix=Matrix.Translation(pivot)@Quaternion((1,0,0),v.x*.85).to_matrix().to_4x4()@Matrix.Translation(-pivot)@hand.matrix
 for b in rig.pose.bones:
  b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
# The same deliberate net flick launches the light basic silk shot.
attack=a.copy();attack.name='attack';attack.use_fake_user=True
(work/'motion-events.json').write_text(json.dumps({'attack':{'time':11/24,'contact':11/30},'cast':{'time':11/24,'contact':11/30}},indent=2))
