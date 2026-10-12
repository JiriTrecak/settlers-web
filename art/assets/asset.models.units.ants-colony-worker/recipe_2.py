"""Role-specific deformation cleanup on Tripo meshes and exported rigs.
Executed in adapt-model.py's Blender context. No replacement geometry.
"""
from mathutils import Matrix, Quaternion
import math
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
 for mesh in meshes:
  group=mesh.vertex_groups['mixamorig:LeftHand'];uv=mesh.data.uv_layers.active
  image=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
  pixels=np.asarray(image.pixels[:],dtype=np.float32).reshape(image.size[1],image.size[0],4)
  red_vertices=set()
  for loop in mesh.data.loops:
   u,v=uv.data[loop.index].uv;r,g,b,_=pixels[min(image.size[1]-1,int(v*image.size[1]))%image.size[1],min(image.size[0]-1,int(u*image.size[0]))%image.size[0]]
   if r>.055 and g<r*.34 and b>g*.64 and b<r*.65:red_vertices.add(loop.vertex_index)
  for v in mesh.data.vertices:
   x,y,z=v.co;target=None
   if x>.035 and y<-.12 and .12<z<.73:target=group
   elif v.index in red_vertices:
    target=mesh.vertex_groups['mixamorig:Head' if z>.71 else 'mixamorig:Spine2' if z>.53 else 'mixamorig:Hips']
   if target:
    for g in list(v.groups):mesh.vertex_groups[g.group].remove([v.index])
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
