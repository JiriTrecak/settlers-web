"""Refine the approved pickaxe worker while preserving Tripo locomotion."""
# Broad leaf insets on the carrier's upper rails keep ownership visible from
# the RTS camera. Reuse the painted leaf atlas and skin to the rigid backpack.
mesh=meshes[0];material=mesh.data.materials[0]
im=material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
pixels=np.asarray(im.pixels[:]).reshape(im.size[1],im.size[0],4)
# Choose an interior patch, not a bright edge pixel: runtime downsizing and
# mipmaps would otherwise blend the ownership mask with adjacent bare wood.
tile=32;h,w=pixels.shape[:2]
patches=pixels[:h//tile*tile,:w//tile*tile].reshape(h//tile,tile,w//tile,tile,4)
coverage=patches[:,:,:,:,3].min(axis=(1,3));brightness=patches[:,:,:,:,0].mean(axis=(1,3))
score=np.where(coverage>.99,brightness,-1);py,px=np.unravel_index(score.argmax(),score.shape)
assert score[py,px]>0,'No solid ownership patch for carrier leaves'
uv=((px*tile+tile/2)/w,(py*tile+tile/2)/h)
verts=[];faces=[]
for x,normal in [(.025,-1),(.355,1)]:
 for side in [-1,1]:
  centre=side*.095;start=len(verts)
  verts.extend([(x,centre,.905),(x,centre+side*.09,.80),(x,centre,.695),(x,centre-side*.075,.80),(x+normal*.023,centre,.805)])
  faces.extend([(start+i,start+(i+1)%4,start+4)for i in range(4)])
data=bpy.data.meshes.new('Carrier leaf ownership insets');data.from_pydata(verts,[],faces);data.materials.append(material)
leaves=bpy.data.objects.new('Carrier leaf ownership insets',data);scene.collection.objects.link(leaves)
uvs=data.uv_layers.new(name='UVMap')
for loop in data.loops:uvs.data[loop.index].uv=uv
group=leaves.vertex_groups.new(name='mixamorig:Spine2');group.add(list(range(len(verts))),1,'REPLACE')
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);leaves.select_set(True);bpy.context.view_layer.objects.active=mesh;bpy.ops.object.join()
for mesh in meshes:
 for v in mesh.data.vertices:
  x,y,z=v.co;target=None
  if x>.025 and z>.53:target='Spine2'
  elif x<-.04 and z>.58:target='Head'
  elif x<-.20 and y>.06 and z<.48:target='RightHand'
  elif x>.09 and .17<z<.53:target='Hips'
  if target:
   group=mesh.vertex_groups.get('mixamorig:'+target)
   if group:
    for g in list(v.groups):mesh.vertex_groups[g.group].remove([v.index])
    group.add([v.index],1,'REPLACE')

# Author a short tool cycle with a planted provider idle stance. The generic
# source chop swings through the oversized backpack and is retained as a take.
bpy.data.actions['chop'].name='provider_chop'
idle=bpy.data.actions['idle'];rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0];scene.frame_set(0)
rest={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
hand=rig.pose.bones['mixamorig:RightHand'];grip=hand.matrix.to_quaternion()
for name,end,keys,angles in [
 ('chop',40,[(0,(-.17,.23,.32)),(12,(-.13,.25,.62)),(20,(-.36,.23,.25)),(25,(-.34,.23,.27)),(40,(-.17,.23,.32))],[(0,0),(12,65),(20,-20),(25,-15),(40,0)]),
 ('build',32,[(0,(-.22,.23,.39)),(10,(-.18,.24,.52)),(18,(-.33,.23,.36)),(22,(-.31,.23,.37)),(32,(-.22,.23,.39))],[(0,0),(10,30),(18,-12),(22,-8),(32,0)])]:
 rig.animation_data.action=None
 for b in rig.pose.bones:b.matrix_basis=rest[b.name]
 target=bpy.data.objects.new(name+' tool target',None);scene.collection.objects.link(target)
 fore=rig.pose.bones['mixamorig:RightForeArm'];con=fore.constraints.new('IK');con.target=target;con.chain_count=2;con.use_stretch=False
 def interpolate(frame,keys):
  for (f0,a),(f1,b) in zip(keys,keys[1:]):
   if f0<=frame<=f1:
    t=(frame-f0)/(f1-f0);t=t*t*(3-2*t)
    return Vector(a).lerp(Vector(b),t) if isinstance(a,tuple) else a+(b-a)*t
 baked=[]
 for frame in range(end+1):
  target.location=interpolate(frame,keys);bpy.context.view_layer.update()
  evaluated=rig.evaluated_get(bpy.context.evaluated_depsgraph_get());matrices={b.name:b.matrix.copy() for b in evaluated.pose.bones}
  rot=Quaternion((0,1,0),math.radians(interpolate(frame,angles)))@grip
  matrices[hand.name]=Matrix.Translation(matrices[hand.name].translation)@rot.to_matrix().to_4x4()
  # Fingers retain their local grip as the wrist turns.
  def move_children(parent):
   for child in parent.children:
    matrices[child.name]=matrices[parent.name]@evaluated.pose.bones[parent.name].matrix.inverted()@evaluated.pose.bones[child.name].matrix
    move_children(child)
  move_children(hand);baked.append((frame,matrices))
 fore.constraints.remove(con);bpy.data.objects.remove(target,do_unlink=True)
 action=bpy.data.actions.new(name);action.use_fake_user=True;rig.animation_data.action=action
 for frame,matrices in baked:
  for b in rig.pose.bones:
   b.matrix_basis=b.bone.convert_local_to_pose(matrices[b.name],b.bone.matrix_local,parent_matrix=matrices[b.parent.name] if b.parent else Matrix.Identity(4),parent_matrix_local=b.parent.bone.matrix_local if b.parent else Matrix.Identity(4),invert=True)
   b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)

# Carrying is a back-loaded gait, with a small thorax lean rather than lifted arms.
for source,name in [('idle','carry'),('walk','carry_walk'),('run','carry_run')]:
 action=bpy.data.actions[source].copy();action.name=name;action.use_fake_user=True
 rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
 spine=rig.pose.bones['mixamorig:Spine'];samples=[]
 for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
  scene.frame_set(frame);m=spine.matrix.copy();rot=Quaternion((0,1,0),math.radians(-4))@m.to_quaternion();samples.append((frame,Matrix.Translation(m.translation)@rot.to_matrix().to_4x4()))
 for frame,m in samples:
  scene.frame_set(frame);spine.matrix=m;spine.keyframe_insert('rotation_quaternion',frame=frame)
# Remove most of the generic human sprint's extra forward lean. Work in the
# provider's -X-facing armature coordinates, preserving pelvis and leg contacts.
spine=rig.pose.bones['mixamorig:Spine'];head=rig.pose.bones['mixamorig:Head']
def activate(a):
 rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
def pitch():
 direction=head.head-spine.head;return math.atan2(-direction.x,direction.z)
for name,neutral in [('run','idle'),('carry_run','carry')]:
 activate(bpy.data.actions[neutral]);scene.frame_set(0);baseline=pitch()
 action=bpy.data.actions[name];activate(action);samples=[]
 for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
  scene.frame_set(frame);current=pitch();delta=(baseline+.2*(current-baseline))-current
  p=spine.head.copy();m=Matrix.Translation(p)@Quaternion((0,1,0),-delta).to_matrix().to_4x4()@Matrix.Translation(-p)@spine.matrix
  spine.matrix=m;samples.append((frame,spine.rotation_quaternion.copy()))
 for frame,q in samples:spine.rotation_quaternion=q;spine.keyframe_insert('rotation_quaternion',frame=frame)
rig.rotation_mode='QUATERNION';rig.rotation_quaternion=Quaternion((0,0,1),math.pi/2)
for mesh in meshes:
 if mesh.parent is None:mesh.rotation_mode='QUATERNION';mesh.rotation_quaternion=rig.rotation_quaternion
(work/'motion-events.json').write_text(json.dumps({'attack':{'clip':'chop','contact':.5},'chop':{'contact':.5},'build':{'contact':18/32}},indent=2))

# Unedited provider takes remain in provider.glb. The editable finished model
# retains only its deliberate runtime states, avoiding unused 20-second takes.
for name in ['dig','lift_heavy','provider_chop']:
 action=bpy.data.actions.get(name)
 if action:bpy.data.actions.remove(action)
