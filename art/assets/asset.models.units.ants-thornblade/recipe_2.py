"""Local adaptation of the approved paired-dagger Thornblade; never modifies provider.glb."""
from mathutils import Matrix,Quaternion
import math
def rigid(mesh,v,name):
 for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
 mesh.vertex_groups['mixamorig:'+name].add([v.index],1,'REPLACE')
# Generated rig sometimes assigns the upper blades to forearms and lower hilts
# to individual fingers. Treat complete dagger/grip assemblies as rigid.
for mesh in meshes:
 uv=mesh.data.uv_layers.active;im=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
 pixels=np.asarray(im.pixels[:]).reshape(im.size[1],im.size[0],4);ivory=set()
 for loop in mesh.data.loops:
  u,v=uv.data[loop.index].uv;r,g,b,a=pixels[min(im.size[1]-1,int(v*im.size[1])),min(im.size[0]-1,int(u*im.size[0]))]
  if r>.4 and g>r*.6 and b>r*.3:ivory.add(loop.vertex_index)
 for v in mesh.data.vertices:
  x,y,z=v.co;target=None
  for side in ['Left','Right']:
   fore=rig.data.bones['mixamorig:'+side+'ForeArm'];hand=rig.data.bones['mixamorig:'+side+'Hand'];axis=hand.head_local-fore.head_local
   distal=(v.co-fore.head_local).dot(axis)/axis.length_squared
   finger=sum(g.weight for g in v.groups if mesh.vertex_groups[g.group].name.startswith('mixamorig:'+side+'Hand'))
   weapon=(x>.26 if side=='Left' else x<-.19) and y<-.105 and z>.18 and v.index in ivory
   foreweight=sum(g.weight for g in v.groups if mesh.vertex_groups[g.group].name=='mixamorig:'+side+'ForeArm')
   if finger+foreweight>.45 or weapon or ((x>.28 if side=='Left' else x<-.27) and z>.25 and distal>.65):target=side+'ForeArm'
  # Abdomen is one shell; don't let thigh weights split it during a stride.
  if y>.075 and z>.14:target='Hips'
  if target:rigid(mesh,v,target)
for mat in {m for o in meshes for m in o.data.materials if m}:
 bsdf=mat.node_tree.nodes.get('Principled BSDF')
 for node in mat.node_tree.nodes:
  if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.35
 for link in list(bsdf.inputs['Roughness'].links):
  for inp in link.from_node.inputs:
   for source in inp.links:
    if source.from_node.type=='TEX_IMAGE':
     im=source.from_node.image;p=np.asarray(im.pixels[:],dtype=np.float32).reshape(-1,4);p[:,1]=.65+.3*p[:,1];p[:,2]=0;im.pixels.foreach_set(p.ravel());im.pack()
 bsdf.inputs['Roughness'].default_value=1
def activate(a):
 rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
# Retain the provider's leg gaits, breathing and recoil, but reduce human head
# droop and arm-swing so the broad daggers remain held out from the carapace.
for action in list(bpy.data.actions):
 if action.name in ['slash','death','idle']:continue
 activate(action);samples=[]
 for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
  scene.frame_set(frame);poses={}
  for name in ['Spine','Spine1','Spine2','Neck','Head','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftHand','RightHand']:
   b=rig.pose.bones['mixamorig:'+name];retain=.18 if name=='Head' else .28 if 'Hand' in name else .40 if 'Arm' in name else .55
   poses[b.name]=Quaternion().slerp(b.rotation_quaternion,retain)
  samples.append((frame,poses))
 for frame,poses in samples:
  for name,q in poses.items():b=rig.pose.bones[name];b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=frame)
# Replace the human narrow-foot idle with restrained breathing in the approved
# reference stance. All original provider takes remain in provider.glb.
bpy.data.actions.remove(bpy.data.actions['idle'])
a=bpy.data.actions.new('idle');a.use_fake_user=True;rig.animation_data.action=a
for frame in range(97):
 for b in rig.pose.bones:b.matrix_basis.identity()
 rig.pose.bones['mixamorig:Spine'].rotation_quaternion=Quaternion((1,0,0),math.sin(frame/96*math.tau)*.015)
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
# Compact asymmetric dagger combination: thrust, off-hand jab, cutting recovery.
# All contact motion is baked; no runtime bone overrides or per-unit renderer code.
activate(bpy.data.actions['idle']);scene.frame_set(0)
rest={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
hands={side:rig.pose.bones['mixamorig:'+side+'Hand'].head.copy() for side in ['Left','Right']}
axes={'Left':Vector((.10,-.07,.27)).normalized(),'Right':Vector((-.13,-.05,.25)).normalized()}
def sample(frame,keys):
 for (f0,v0),(f1,v1) in zip(keys,keys[1:]):
  if f0<=frame<=f1:
   t=(frame-f0)/(f1-f0);return Vector(v0).lerp(Vector(v1),t*t*(3-2*t))
 return Vector(keys[-1][1])
def bake(name,last,positions,directions,torso):
 rig.animation_data.action=None;targets={};constraints=[]
 for side in hands:
  t=bpy.data.objects.new(side+' dagger elbow target',None);scene.collection.objects.link(t);targets[side]=t
  b=rig.pose.bones['mixamorig:'+side+'ForeArm'];c=b.constraints.new('IK');c.target=t;c.chain_count=2;c.use_stretch=False;constraints.append((b,c))
 baked=[]
 for frame in range(last+1):
  for b in rig.pose.bones:b.matrix_basis=rest[b.name]
  bpy.context.view_layer.update()
  spine=rig.pose.bones['mixamorig:Spine'];pivot=spine.head.copy();lean,twist,_=sample(frame,torso)
  spine.matrix=Matrix.Translation(pivot)@(Quaternion((1,0,0),math.radians(lean))@Quaternion((0,0,1),math.radians(twist))).to_matrix().to_4x4()@Matrix.Translation(-pivot)@spine.matrix
  for side in hands:targets[side].location=sample(frame,positions[side])
  bpy.context.view_layer.update();ev=rig.evaluated_get(bpy.context.evaluated_depsgraph_get());matrices={b.name:b.matrix.copy() for b in ev.pose.bones}
  for side in hands:
   b=rig.data.bones['mixamorig:'+side+'ForeArm'];m=matrices[b.name];rotation=m.to_quaternion()@b.matrix_local.to_quaternion().inverted()
   axis=rotation@axes[side];desired=sample(frame,directions[side]).normalized()
   delta=Matrix.Translation(m.translation)@axis.rotation_difference(desired).to_matrix().to_4x4()@Matrix.Translation(-m.translation)
   for bone in [b,*b.children_recursive]:matrices[bone.name]=delta@matrices[bone.name]
  baked.append((frame,matrices))
 for b,c in constraints:b.constraints.remove(c)
 for t in targets.values():bpy.data.objects.remove(t,do_unlink=True)
 a=bpy.data.actions.new(name);a.use_fake_user=True;rig.animation_data.action=a
 for frame,matrices in baked:
  for b in rig.pose.bones:
   b.matrix_basis=b.bone.convert_local_to_pose(matrices[b.name],b.bone.matrix_local,parent_matrix=matrices[b.parent.name] if b.parent else Matrix.Identity(4),parent_matrix_local=b.parent.bone.matrix_local if b.parent else Matrix.Identity(4),invert=True)
   b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
R=hands['Right'];L=hands['Left']
bake('attack',24,{
 'Right':[(0,R),(4,(-.25,-.16,.43)),(7,(-.13,-.40,.43)),(9,(-.22,-.23,.43)),(13,(-.27,-.19,.48)),(16,(.10,-.37,.38)),(19,(-.10,-.29,.33)),(24,R)],
 'Left':[(0,L),(6,(.31,-.18,.32)),(8,(.29,-.17,.38)),(11,(.20,-.40,.40)),(14,(.29,-.22,.34)),(24,L)]},
 {'Right':[(0,axes['Right']),(4,(-.1,-1,.15)),(7,(0,-1,.02)),(9,(-.1,-.6,.6)),(13,(-.6,-.5,.4)),(16,(.7,-.7,-.15)),(19,(.5,-.4,.3)),(24,axes['Right'])],
 'Left':[(0,axes['Left']),(7,(.15,-.7,.5)),(8,(.05,-1,.12)),(11,(0,-1,0)),(14,(.2,-.6,.65)),(24,axes['Left'])]},
 [(0,(0,0,0)),(4,(-3,-8,0)),(7,(8,9,0)),(9,(3,0,0)),(11,(8,-9,0)),(13,(2,-12,0)),(16,(8,12,0)),(24,(0,0,0))])
# Dash has a braced, forward dagger pose, deliberately no running foot cycle.
bake('charge',12,{
 'Right':[(0,(-.17,-.32,.40)),(6,(-.15,-.34,.405)),(12,(-.17,-.32,.40))],
 'Left':[(0,(.30,-.13,.30)),(6,(.31,-.12,.30)),(12,(.30,-.13,.30))]},
 {'Right':[(0,(0,-1,.12)),(12,(0,-1,.12))],'Left':[(0,(.2,-.3,.9)),(12,(.2,-.3,.9))]},
 [(0,(15,8,0)),(6,(17,8,0)),(12,(15,8,0))])
if 'slash' in bpy.data.actions:bpy.data.actions.remove(bpy.data.actions['slash'])
(work/'motion-events.json').write_text(json.dumps({'attack':{'clip':'attack','contact':7/24,'time':7/24,'source':'Blender baked asymmetric thrust, off-hand jab and cutting recovery. One authoritative hit per combat cycle.'},'charge':{'clip':'charge','source':'Dedicated braced dagger lunge; no running gait.'}},indent=2))
