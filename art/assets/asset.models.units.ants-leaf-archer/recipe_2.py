"""Role-specific deformation cleanup on Tripo meshes and exported rigs.
Executed in adapt-model.py's Blender context. No replacement geometry.
"""
from mathutils import Matrix, Quaternion
import math
# Reduce the human sprint's excessive torso lean for the upright ant silhouette.
spine=rig.pose.bones['mixamorig:Spine'];head=rig.pose.bones['mixamorig:Head']
def activate(action):
 rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
def pitch():
 direction=head.head-spine.head;return math.atan2(-direction.y,direction.z)
activate(bpy.data.actions['idle']);scene.frame_set(0);baseline=pitch()
action=bpy.data.actions['run'];activate(action);samples=[]
for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
 scene.frame_set(frame);current=pitch();delta=(baseline+.3*(current-baseline))-current
 pivot=spine.head.copy();spine.matrix=Matrix.Translation(pivot)@Quaternion((1,0,0),delta).to_matrix().to_4x4()@Matrix.Translation(-pivot)@spine.matrix
 samples.append((frame,spine.rotation_quaternion.copy()))
for frame,q in samples:spine.rotation_quaternion=q;spine.keyframe_insert('rotation_quaternion',frame=frame)
if work.name in ('warrior','archer'):
 # Keep the large insect head looking forward while the human source torso
 # anticipates a strike. Preserve some secondary motion and all death motion.
 head=rig.pose.bones['mixamorig:Head']
 rest=head.bone.matrix_local.to_quaternion()
 for action in list(bpy.data.actions):
  if action.name=='death':continue
  rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
  start,end=map(int,action.frame_range);samples=[]
  for frame in range(start,end+1):
   scene.frame_set(frame);samples.append((frame,head.matrix.translation.copy(),head.matrix.to_quaternion().slerp(rest,.82)))
  for frame,pos,rot in samples:
   scene.frame_set(frame);head.matrix=Matrix.Translation(pos)@rot.to_matrix().to_4x4();head.keyframe_insert('rotation_quaternion',frame=frame)
if work.name=='archer':
 # The bow is rigid gear; provider skinning bent its limbs with the forearm.
 for mesh in list(meshes):
  group=mesh.vertex_groups['mixamorig:LeftHand'];uv=mesh.data.uv_layers.active
  image=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
  pixels=np.asarray(image.pixels[:],dtype=np.float32).reshape(image.size[1],image.size[0],4)
  # Classify complete UV-connected panels. Sampling single red vertices misses
  # shaded undersides and creates tears inside one leaf panel.
  from collections import defaultdict
  parent=list(range(len(mesh.data.vertices)))
  def root(i):
   while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
   return i
  for edge in mesh.data.edges:parent[root(edge.vertices[0])]=root(edge.vertices[1])
  colors=defaultdict(list)
  for loop in mesh.data.loops:
   u,v=uv.data[loop.index].uv
   colors[loop.vertex_index].append(pixels[min(image.size[1]-1,max(0,int(v*image.size[1]))),min(image.size[0]-1,max(0,int(u*image.size[0]))),:3])
  panels=defaultdict(list)
  for vertex in mesh.data.vertices:panels[root(vertex.index)].append(vertex)
  cloak_vertices=set();quiver_vertices=set();bow_vertices=set()
  for vertices in panels.values():
   rgb=np.array([np.mean(colors[v.index],axis=0) for v in vertices]);r,g,b=rgb.T
   red=(r>.008)&(g<r*.38)&(b>g*.55)&(b<r*.75)
   ymin=min(v.co.y for v in vertices);ymax=max(v.co.y for v in vertices);zmax=max(v.co.z for v in vertices)
   if min(v.co.x for v in vertices)>0 and ymax<-.05 and not (min(v.co.z for v in vertices)>.74 and min(v.co.x for v in vertices)<.125):bow_vertices.update(v.index for v in vertices)
   if red.mean()>.55 and ymax>-.05:
    cloak_vertices.update(v.index for v in vertices)
   elif ymin>.02 and zmax>.4:
    quiver_vertices.update(v.index for v in vertices)
  # Separate the cloth faces before weighting: provider retopology connected
  # cape rims to arms where the reference pose touches. UV seams alone are not
  # safe deformation boundaries, and averaging weights across them re-fuses cloth.
  bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
  for vertex in mesh.data.vertices:vertex.select=False
  for edge in mesh.data.edges:edge.select=False
  for polygon in mesh.data.polygons:polygon.select=all(i in cloak_vertices or i in quiver_vertices for i in polygon.vertices)
  selection=mesh.vertex_groups.new(name='Leaf cloth selection');selection.add(list(cloak_vertices),1,'REPLACE')
  bow_selection=mesh.vertex_groups.new(name='Bow selection');bow_selection.add(list(bow_vertices),1,'REPLACE')
  before=set(bpy.data.objects)
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.separate(type='SELECTED');bpy.ops.object.mode_set(mode='OBJECT')
  for piece in set(bpy.data.objects)-before:
   if piece.type=='MESH':piece.name='Archer leaf hood and cloak';piece['leafCloth']=True;meshes.append(piece)
 for mesh in meshes:
  group=mesh.vertex_groups['mixamorig:LeftHand']
  for v in mesh.data.vertices:
   x,y,z=v.co;target=None
   if mesh.get('leafCloth'):
    is_cloth=any(mesh.vertex_groups[g.group].name=='Leaf cloth selection' for g in v.groups)
    hood=max(0,min(1,(z-.69)/.10)) if is_cloth else 0;hood=hood*hood*(3-2*hood)
    for index in [g.group for g in v.groups]:mesh.vertex_groups[index].remove([v.index])
    for name,weight in [('mixamorig:Spine2',1-hood),('mixamorig:Head',hood)]:
     if weight>0:mesh.vertex_groups[name].add([v.index],weight,'REPLACE')
   elif any(mesh.vertex_groups[g.group].name=='Bow selection' for g in v.groups) or (x>0 and y<0 and sum(g.weight for g in v.groups if mesh.vertex_groups[g.group].name.startswith('mixamorig:LeftHand'))>.5):target=group
   if target:
    for group_index in [g.group for g in v.groups]:mesh.vertex_groups[group_index].remove([v.index])
    target.add([v.index],1,'REPLACE')
 # Retain the provider's planted feet/torso from the archer take, but correct
 # both hands to actually draw and release the bow using baked arm IK.
 source=next(a for a in bpy.data.actions if a.name.startswith('A single precise'))
 action=source.copy();action.name='attack';action.use_fake_user=True
 rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
 targets={};constraints=[]
 for side in ['Left','Right']:
  obj=bpy.data.objects.new(side+' shot hand target',None);scene.collection.objects.link(obj);targets[side]=obj
  forearm=rig.pose.bones['mixamorig:'+side+'ForeArm'];con=forearm.constraints.new('IK');con.target=obj;con.chain_count=2;con.use_tail=True;con.use_stretch=False;constraints.append((forearm,con))
 def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
 keyposes={
  'Left':[(0,(.115,-.13,.42)),(16,(.09,-.32,.68)),(38,(.09,-.33,.69)),(44,(.09,-.33,.69)),(71,(.115,-.13,.42))],
  'Right':[(0,(-.145,-.035,.46)),(18,(.075,-.275,.68)),(36,(-.10,-.13,.70)),(41,(-.135,-.09,.70)),(50,(-.14,-.09,.60)),(71,(-.145,-.035,.46))]}
 baked=[]
 for frame in range(72):
  scene.frame_set(frame)
  for side,keys in keyposes.items():
   for (f0,p0),(f1,p1) in zip(keys,keys[1:]):
    if f0<=frame<=f1:
     targets[side].location=Vector(p0).lerp(Vector(p1),smooth((frame-f0)/(f1-f0)));break
  bpy.context.view_layer.update()
  evaluated=rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
  matrices={b.name:b.matrix.copy() for b in evaluated.pose.bones}
  # The bow's long axis remains vertical through the draw; preserve grip.
  for side in ['Left','Right']:
   name='mixamorig:'+side+'Hand';matrices[name]=Matrix.Translation(matrices[name].translation)@rig.data.bones[name].matrix_local.to_quaternion().to_matrix().to_4x4()
  baked.append((frame,matrices))
 for bone,con in constraints:bone.constraints.remove(con)
 for target in targets.values():bpy.data.objects.remove(target,do_unlink=True)
 for frame,matrices in baked:
  scene.frame_set(frame)
  for bone in rig.pose.bones:
   bone.matrix_basis=bone.bone.convert_local_to_pose(matrices[bone.name],bone.bone.matrix_local,parent_matrix=matrices[bone.parent.name] if bone.parent else Matrix.Identity(4),parent_matrix_local=bone.parent.bone.matrix_local if bone.parent else Matrix.Identity(4),invert=True);bone.keyframe_insert('location',frame=frame);bone.keyframe_insert('rotation_quaternion',frame=frame);bone.keyframe_insert('scale',frame=frame)
 (work/'motion-events.json').write_text(json.dumps({'attack':{'release':41/71,'source':'Tripo archery take with Blender two-hand IK draw/release and rigid bow weighting'}},indent=2))

if work.name=='worker':exec((Path(__file__).parent/'refine-worker.py').read_text())
if work.name=='warrior':exec((Path(__file__).parent/'refine-warrior.py').read_text())

exec((Path(__file__).parent/'rig-bowstring.py').read_text())
