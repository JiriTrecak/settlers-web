from mathutils import Matrix, Quaternion
import math
# Preserve connected armor blending; rigid complete hand-held cleaver.
# Regions measured on this provider model, not copied from the earlier Warrior.
for mesh in meshes:
 uv=mesh.data.uv_layers.active
 image=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
 pixels=np.asarray(image.pixels[:]).reshape(image.size[1],image.size[0],4)
 ivory=set()
 for loop in mesh.data.loops:
  u,v=uv.data[loop.index].uv
  r,g,b,a=pixels[min(image.size[1]-1,int(v*image.size[1])),min(image.size[0]-1,int(u*image.size[0]))]
  if r>.4 and g>r*.60 and b>r*.3:ivory.add(loop.vertex_index)
 for v in mesh.data.vertices:
  x,y,z=v.co;target=None
  # The provider assigns the entire cleaver to right finger bones. Consolidate
  # that hard equipment and its grip to the hand; preserve wrist transition.
  grip_weight=sum(g.weight for g in v.groups if mesh.vertex_groups[g.group].name.startswith('mixamorig:RightHand'))
  if grip_weight>.5:target='RightHand'
  if target:
   for group in [g.group for g in v.groups]:mesh.vertex_groups[group].remove([v.index])
   mesh.vertex_groups['mixamorig:'+target].add([v.index],1,'REPLACE')
# Keep the source paint, but remove wet-plastic surface response from natural leaves.
for mat in {m for o in meshes for m in o.data.materials if m}:
 bsdf=mat.node_tree.nodes.get('Principled BSDF')
 for node in mat.node_tree.nodes:
  if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.35
 for link in list(bsdf.inputs['Roughness'].links):
  upstream=link.from_node
  for inp in upstream.inputs:
   for source in inp.links:
    if source.from_node.type=='TEX_IMAGE':
     im=source.from_node.image;p=np.asarray(im.pixels[:],dtype=np.float32).reshape(-1,4)
     p[:,1]=.65+.3*p[:,1];p[:,2]=0;im.pixels.foreach_set(p.ravel());im.pack()
 bsdf.inputs['Roughness'].default_value=1
if 'slash' in bpy.data.actions:bpy.data.actions['slash'].name='attack'
# Keep the upright unit silhouette while retaining the provider's running legs.
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
# Large head remains broadly aligned with the reference through locomotion.
head=rig.pose.bones['mixamorig:Head'];rest=head.bone.matrix_local.to_quaternion()
for action in list(bpy.data.actions):
 if action.name=='death':continue
 rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];samples=[]
 for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
  scene.frame_set(frame);samples.append((frame,head.matrix.translation.copy(),head.matrix.to_quaternion().slerp(rest,.82)))
 for frame,pos,rot in samples:
  scene.frame_set(frame);head.matrix=Matrix.Translation(pos)@rot.to_matrix().to_4x4();head.keyframe_insert('rotation_quaternion',frame=frame)
old=bpy.data.actions['attack'];old.name='provider_attack'
# The provider's human wrist curl turns the broad cleaver edge-on. Preserve
# its reference grip while retaining the source arm movement and hand position.
hand=rig.pose.bones['mixamorig:RightHand'];bind_grip=hand.bone.matrix_local.to_quaternion();blade_axis=Vector((.35,-.34,-.27)).normalized();grip=blade_axis.rotation_difference(Vector((-.18,-.25,-.27)).normalized())@bind_grip
for source in list(bpy.data.actions):
 if source==old or source.name=='death':continue
 rig.animation_data.action=source;rig.animation_data.action_slot=source.slots[0];samples=[]
 for frame in range(int(source.frame_range[0]),int(source.frame_range[1])+1):
  scene.frame_set(frame);samples.append((frame,hand.matrix.translation.copy()))
 for frame,pos in samples:
  scene.frame_set(frame);hand.matrix=Matrix.Translation(pos)@grip.to_matrix().to_4x4();hand.keyframe_insert('rotation_quaternion',frame=frame)
idle=bpy.data.actions['idle'];rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0];scene.frame_set(0)
rest={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
start=tuple(hand.head)
rig.animation_data.action=None
target=bpy.data.objects.new('Cleaver wrist target',None);scene.collection.objects.link(target)
fore=rig.pose.bones['mixamorig:RightForeArm'];con=fore.constraints.new('IK');con.target=target;con.chain_count=2;con.use_stretch=False
keys=[(0,start),(10,(-.39,.045,.64)),(15,(-.40,-.035,.64)),(20,(-.25,-.27,.48)),(24,(-.20,-.24,.38)),(36,start)]
directions=[(0,(-.18,-.25,-.27)),(10,(0,-.08,.43)),(15,(0,-.08,.43)),(20,(-.02,-.40,-.12)),(24,(-.15,-.32,-.18)),(36,(-.18,-.25,-.27))]
rotations=[(frame,blade_axis.rotation_difference(Vector(direction).normalized())@bind_grip)for frame,direction in directions]
def sample_rotation(frame):
 for (f0,q0),(f1,q1) in zip(rotations,rotations[1:]):
  if f0<=frame<=f1:
   t=(frame-f0)/(f1-f0);return q0.slerp(q1,t*t*(3-2*t))

def sample(frame,keys):
 for (f0,a),(f1,b) in zip(keys,keys[1:]):
  if f0<=frame<=f1:
   t=(frame-f0)/(f1-f0);return Vector(a).lerp(Vector(b),t*t*(3-2*t))
baked=[]
for frame in range(37):
 for b in rig.pose.bones:b.matrix_basis=rest[b.name]
 bpy.context.view_layer.update()
 spine=rig.pose.bones['mixamorig:Spine'];pivot=spine.head.copy()
 turn=sample(frame,[(0,(0,0,0)),(10,(-5,0,-6)),(15,(-5,0,-6)),(20,(4,0,7)),(24,(6,0,9)),(36,(0,0,0))])
 twist=Quaternion((0,0,1),math.radians(turn.z))@Quaternion((1,0,0),math.radians(turn.x))
 spine.matrix=Matrix.Translation(pivot)@twist.to_matrix().to_4x4()@Matrix.Translation(-pivot)@spine.matrix
 target.location=sample(frame,keys);bpy.context.view_layer.update()
 evaluated=rig.evaluated_get(bpy.context.evaluated_depsgraph_get());matrices={b.name:b.matrix.copy() for b in evaluated.pose.bones}
 rot=sample_rotation(frame)
 matrices[hand.name]=Matrix.Translation(matrices[hand.name].translation)@rot.to_matrix().to_4x4()
 def move_children(parent):
  for child in parent.children:
   matrices[child.name]=matrices[parent.name]@evaluated.pose.bones[parent.name].matrix.inverted()@evaluated.pose.bones[child.name].matrix
   move_children(child)
 move_children(hand);baked.append((frame,matrices))
fore.constraints.remove(con);bpy.data.objects.remove(target,do_unlink=True)
action=bpy.data.actions.new('attack');action.use_fake_user=True;rig.animation_data.action=action
for frame,matrices in baked:
 for b in rig.pose.bones:
  b.matrix_basis=b.bone.convert_local_to_pose(matrices[b.name],b.bone.matrix_local,parent_matrix=matrices[b.parent.name] if b.parent else Matrix.Identity(4),parent_matrix_local=b.parent.bone.matrix_local if b.parent else Matrix.Identity(4),invert=True)
  b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
bpy.data.actions.remove(old)
(work/'motion-events.json').write_text(json.dumps({'attack':{'clip':'attack','contact':20/36,'time':20/24,'source':'Provider idle stance with Blender cleaver IK strike; original slash retained in provider.glb'}},indent=2))
