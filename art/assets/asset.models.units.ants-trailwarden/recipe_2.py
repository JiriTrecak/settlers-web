"""Repair provider bow grip and author a ranger draw/release while preserving paint."""
import math
from mathutils import Matrix,Quaternion,Vector
from collections import defaultdict
# The provider misplaced the bow-side hand and its finger rest joints. The
# visible grip is at the bow shaft; preserve rest geometry and repair that pivot.
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
grp=Vector((-.185,.17,.485));arm=rig.data.edit_bones['mixamorig:RightForeArm'];arm.tail=grp
hand=rig.data.edit_bones['mixamorig:RightHand'];hand.head=grp;hand.tail=grp+Vector((-.035,0,-.015))
bpy.ops.object.mode_set(mode='OBJECT')
bow_parts=[151,158,180,181,191,115,116,120,121,122,124,126,127,129,130,131,132,134,135,136,137,138,139,141,145,146,147,148,153,156,159,163,164,166,169,170,175,176,177,178,179,182,183,185]
parts=json.loads((work/'parts.json').read_text());bow={i for n in bow_parts for i in parts[n]['ids']}
for mesh in meshes:
 image=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
 pixels=np.asarray(image.pixels[:]).reshape(image.size[1],image.size[0],4);cols=defaultdict(list)
 for loop in mesh.data.loops:
  u,v=mesh.data.uv_layers.active.data[loop.index].uv;cols[loop.vertex_index].append(pixels[min(image.size[1]-1,max(0,int(v*image.size[1]))),min(image.size[0]-1,max(0,int(u*image.size[0]))),3])
 regions={}
 for index,part in enumerate(parts):
  ids=part['ids'];lo,hi=part['min'],part['max'];red=float(np.mean([np.mean(cols[i]) for i in ids]));target=None
  if index in bow_parts:target='mixamorig:RightHand'
  elif lo[2]>.735:target='mixamorig:Head'
  elif index in [7,19,34,38,43,46,47,51,54,57]:target='mixamorig:Hips'
  elif red>.45:target='mixamorig:Spine2' if (lo[2]+hi[2])*.5>.57 else 'mixamorig:Hips'
  if target:
   for i in ids:regions[i]=target
 for v in mesh.data.vertices:
  target=regions.get(v.index);x,y,z=v.co
  if not target and -.25<x<-.13 and y>.11 and .435<z<.525:target='mixamorig:RightHand'
  if target:
   for i in [g.group for g in v.groups]:mesh.vertex_groups[i].remove([v.index])
   mesh.vertex_groups[target].add([v.index],1,'REPLACE')
  else:
   # Finger bones from the provider are unstable; keep each whole hand rigid.
   collapsed=defaultdict(float)
   for g in v.groups:
    name=mesh.vertex_groups[g.group].name
    if 'Hand' in name:name=name.split('Hand')[0]+'Hand'
    collapsed[name]+=g.weight
   for i in [g.group for g in v.groups]:mesh.vertex_groups[i].remove([v.index])
   for n,w in collapsed.items():mesh.vertex_groups[n].add([v.index],w,'REPLACE')
(work/'equipment-selection.json').write_text(json.dumps({'bow':sorted(bow),'grip':list(grp)}))
# Keep Tripo's lower-body gaits and fall; calm the bow and neck during movement.
for action in list(bpy.data.actions):
 rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];samples=[]
 for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
  scene.frame_set(frame);pose={}
  for bone in rig.pose.bones:
   n=bone.name
   if any(k in n for k in ['Arm','Hand','Shoulder']):pose[n]=Quaternion()
   elif 'Head' in n or 'Neck' in n:pose[n]=Quaternion().slerp(bone.rotation_quaternion,.18 if action.name!='death' else .5)
  samples.append((frame,pose))
 for frame,pose in samples:
  for n,q in pose.items():b=rig.pose.bones[n];b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=frame)
for name in ['idle','cast','hit']:
 if name in bpy.data.actions:bpy.data.actions.remove(bpy.data.actions[name])
def rotate(name,axis,angle):
 bpy.context.view_layer.update();b=rig.pose.bones['mixamorig:'+name];pivot=b.head.copy();b.matrix=Matrix.Translation(pivot)@Quaternion(axis,angle).to_matrix().to_4x4()@Matrix.Translation(-pivot)@b.matrix

def reach(side,target):
 bpy.context.view_layer.update();upper=rig.pose.bones['mixamorig:'+side+'Arm'];fore=rig.pose.bones['mixamorig:'+side+'ForeArm'];start=upper.head.copy();a=upper.length;b=fore.length;delta=target-start;d=min(delta.length,a+b-.001);axis=delta.normalized();pole=Vector((.05,.4 if side=='Right' else -.35,.62))-start;perp=(pole-axis*pole.dot(axis)).normalized();along=(a*a-b*b+d*d)/(2*d);elbow=start+axis*along+perp*math.sqrt(max(0,a*a-along*along))
 for bone,point in [(upper,elbow),(fore,start+axis*d)]:
  bpy.context.view_layer.update();p=bone.head.copy();q=(bone.tail-p).normalized().rotation_difference((point-p).normalized());bone.matrix=Matrix.Translation(p)@q.to_matrix().to_4x4()@Matrix.Translation(-p)@bone.matrix
 bpy.context.view_layer.update()
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def track(f,keys):
 for (a,x),(b,y) in zip(keys,keys[1:]):
  if a<=f<=b:return Vector(x).lerp(Vector(y),smooth((f-a)/(b-a)))
 return Vector(keys[-1][1])
rest={side:rig.data.bones['mixamorig:'+side+'Hand'].matrix_local.to_quaternion() for side in ['Right','Left']}
for name,end in [('idle',96),('attack',64),('cast',80),('hit',24)]:
 action=bpy.data.actions.new(name);action.use_fake_user=True;rig.animation_data.action=action
 for frame in range(end+1):
  for b in rig.pose.bones:b.matrix_basis.identity()
  if name=='idle':rotate('Spine',(0,1,0),.012*math.sin(frame/end*math.tau))
  elif name=='hit':rotate('Spine',(0,1,0),.12*math.sin(frame/end*math.pi))
  else:
   release=36 if name=='attack' else 48
   aim=smooth(frame/16)*(1-smooth((frame-release-5)/(end-release-5)))
   rotate('Spine',(0,0,1),-.10*aim)
   for side,keys in [
    ('Right',[(0,tuple(grp)),(16,(-.30,.14,.69)),(release+3,(-.30,.14,.69)),(end,tuple(grp))]),
    ('Left',[(0,(.03,-.114,.48)),(16,(-.23,.11,.68)),(release-4,(-.07,.14,.70)),(release,(-.045,.14,.70)),(release+6,(.015,.1,.69)),(end,(.03,-.114,.48))])]:
    reach(side,track(frame,keys));hand=rig.pose.bones['mixamorig:'+side+'Hand'];rotation=rest[side]
    if side=='Left':rotation=Quaternion().slerp(Vector((0,0,-1)).rotation_difference(Vector((-.9,.25,0)).normalized()),aim)@rotation
    hand.matrix=Matrix.Translation(hand.head)@rotation.to_matrix().to_4x4()
  for b in rig.pose.bones:
   b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
(work/'motion-events.json').write_text(json.dumps({'attack':{'time':36/24,'contact':36/64},'cast':{'time':48/24,'contact':48/80}},indent=2))
# Provider UV panels touch the boot and sleeve in the reference pose. Separate
# real equipment before seam averaging so those coincident surfaces cannot pull
# the body along with the bow or the quiver.
for mesh in list(meshes):
 for groupname,indices in [('Bow panels',bow),('Quiver panels',{i for n in [16,43,46,47,51,54,57,65] for i in parts[n]['ids']})]:
  group=mesh.vertex_groups.new(name=groupname);group.add(list(indices),1,'REPLACE')
 for groupname,gear,parent in [('Bow panels','bow','mixamorig:RightHand'),('Quiver panels','quiver','mixamorig:Hips')]:
  bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
  group=mesh.vertex_groups[groupname].index;selected={v.index for v in mesh.data.vertices if any(g.group==group for g in v.groups)}
  for v in mesh.data.vertices:v.select=False
  for e in mesh.data.edges:e.select=False
  for f in mesh.data.polygons:f.select=all(i in selected for i in f.vertices)
  before=set(bpy.data.objects);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.separate(type='SELECTED');bpy.ops.object.mode_set(mode='OBJECT')
  for obj in set(bpy.data.objects)-before:
   if obj.type!='MESH':continue
   obj.name='Trailwarden '+gear;obj['equipment']=gear;meshes.append(obj)
   for v in obj.data.vertices:
    for i in [g.group for g in v.groups]:obj.vertex_groups[i].remove([v.index])
   obj.vertex_groups[parent].add(list(range(len(obj.data.vertices))),1,'REPLACE')
