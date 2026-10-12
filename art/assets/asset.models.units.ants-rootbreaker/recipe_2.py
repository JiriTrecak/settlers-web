"""Rootbreaker equipment-aware weights and heavy hero motions; preserves provider paint."""
import math
from mathutils import Quaternion,Matrix,Vector

def assign(mesh,v,weights):
 for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
 for name,w in weights:
  if w>0:mesh.vertex_groups[name].add([v.index],w,'REPLACE')
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
b=rig.data.edit_bones.new('Cape');b.head=(.07,.16,.65);b.tail=(.07,.20,.20);b.parent=rig.data.edit_bones['mixamorig:Hips'];bpy.ops.object.mode_set(mode='OBJECT')
for mesh in meshes:
 mesh.vertex_groups.new(name='Cape');parts=json.loads((work/'parts-colors.json').read_text());club=set();cape=set();kilt=set()
 for i,p in enumerate(parts):
  lo,hi=p['min'],p['max']
  if (hi[0]<-.15 and lo[2]>.55) or i in [99,114,131,133,137,140,141]:club.update(p['ids'])
  elif lo[1]>.08 or (p['redFraction']>.35 and hi[1]>.12):cape.update(p['ids'])
  elif p['redFraction']>.5 and hi[2]<.50:kilt.update(p['ids'])
 weight_regions={}
 for v in mesh.data.vertices:
  x,y,z=v.co;region='club' if v.index in club else 'cape' if v.index in cape else 'kilt' if v.index in kilt else 'body';weight_regions[v.index]=region
  if region=='club':assign(mesh,v,[('mixamorig:RightHand',1)])
  elif region=='cape':
   cloth=min(1,max(0,(.67-z)/.24));assign(mesh,v,[('Cape',cloth),('mixamorig:Spine2',1-cloth)])
  elif region=='kilt':assign(mesh,v,[('mixamorig:Hips',1)])
 (work/'equipment-selection.json').write_text(json.dumps({'club':sorted(club),'cape':sorted(cape),'kilt':sorted(kilt)}))
# Retain lower-body Tripo locomotion and collapse; prevent the giant club swimming.
for a in list(bpy.data.actions):
 rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0];samples=[];start,end=map(int,a.frame_range)
 for frame in range(start,end+1):
  scene.frame_set(frame);poses={}
  for b in rig.pose.bones:
   name=b.name.split(':')[-1]
   if any(x in name for x in ['Hand','Arm','Shoulder','Head','Neck','Spine']) or name=='Hips' and a.name in ['walk','run'] or a.name in ['walk','run'] and any(x in name for x in ['Leg','Foot','Toe']):
    keep=(.65 if a.name=='run' else .85) if any(x in name for x in ['Leg','Foot','Toe']) else 0 if any(x in name for x in ['Hand','Arm','Shoulder']) else .25 if name in ['Head','Neck'] else .45
    poses[b.name]=Quaternion().slerp(b.rotation_quaternion,keep)
  poses['Cape']=Quaternion((1,0,0),(.2 if a.name=='run' else .12 if a.name=='walk' else 0)-.025*math.sin((frame-start)/max(1,end-start)*math.tau));samples.append((frame,poses))
 for frame,poses in samples:
  for name,q in poses.items():b=rig.pose.bones[name];b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=frame)
for name in ['idle','attack','hit']:bpy.data.actions.remove(bpy.data.actions[name])
def rotate(name,axis,angle):
 bpy.context.view_layer.update();b=rig.pose.bones[name if name=='Cape' else 'mixamorig:'+name];p=b.head.copy();b.matrix=Matrix.Translation(p)@Quaternion(axis,angle).to_matrix().to_4x4()@Matrix.Translation(-p)@b.matrix

def reach(side,target):
 bpy.context.view_layer.update();upper=rig.pose.bones['mixamorig:'+side+'Arm'];fore=rig.pose.bones['mixamorig:'+side+'ForeArm']
 start=upper.head.copy();a=upper.length;b=fore.length;delta=target-start;distance=min(delta.length,a+b-.001);axis=delta.normalized()
 pole=Vector((.7 if side=='Left' else -.6,-.35,.35))-start;perp=(pole-axis*pole.dot(axis)).normalized()
 along=(a*a-b*b+distance*distance)/(2*distance);elbow=start+axis*along+perp*math.sqrt(max(0,a*a-along*along))
 for bone,point in [(upper,elbow),(fore,start+axis*distance)]:
  bpy.context.view_layer.update();pivot=bone.head.copy();q=(bone.tail-pivot).normalized().rotation_difference((point-pivot).normalized())
  bone.matrix=Matrix.Translation(pivot)@q.to_matrix().to_4x4()@Matrix.Translation(-pivot)@bone.matrix
 bpy.context.view_layer.update()
def two_hand_grip(weight,lift):
 names=['RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand'];before={n:rig.pose.bones['mixamorig:'+n].rotation_quaternion.copy() for n in names}
 hand=rig.pose.bones['mixamorig:RightHand'];orientation=hand.matrix.to_quaternion();target=Vector((.09,-.12,.53+lift));reach('Right',target)
 # Keep the heavy authored strike arc; move the grip slightly ahead of the torso
 # so the supporting hand can reach the shaft without crossing the chest.
 hand.matrix=Matrix.Translation(hand.head)@orientation.to_matrix().to_4x4();bpy.context.view_layer.update()
 target=hand.matrix@(hand.bone.matrix_local.inverted()@Vector((-.265,-.135,.54)));reach('Left',target)
 for n in names:
  bone=rig.pose.bones['mixamorig:'+n];bone.rotation_quaternion=before[n].slerp(bone.rotation_quaternion,weight)
 bpy.context.view_layer.update()

def curve(frame,keys):
 for (a,x),(b,y) in zip(keys,keys[1:]):
  if a<=frame<=b:
   t=(frame-a)/(b-a);return x+(y-x)*(t*t*(3-2*t))
 return keys[-1][1]
for name,end in [('idle',96),('hit',24),('attack',56),('skullcrack',60),('roar',64),('uproot',76),('cast',76)]:
 a=bpy.data.actions.new(name);a.use_fake_user=True;rig.animation_data.action=a
 for frame in range(end+1):
  for b in rig.pose.bones:b.matrix_basis.identity()
  t=frame/end
  if name=='idle':rotate('Spine',(1,0,0),math.sin(t*math.tau)*.01);rotate('Cape',(1,0,0),math.sin(t*math.tau)*.018)
  elif name=='hit':rotate('Spine',(1,0,0),-.15*math.sin(math.pi*t))
  elif name=='roar':
   spread=curve(frame,[(0,0),(18,1),(36,1),(64,0)]);rotate('Spine',(1,0,0),-.12*spread);rotate('Head',(1,0,0),-.2*spread);rotate('LeftArm',(0,1,0),.4*spread);rotate('RightArm',(0,1,0),-.15*spread);rotate('Cape',(1,0,0),-.04*spread)
  else:
   contact=26 if name=='attack' else 28 if name=='skullcrack' else 36
   swing=curve(frame,[(0,0),(contact-12,-.5),(contact-6,-.5),(contact,1.85 if name in ['uproot','cast'] else 1.5),(contact+3,1.85 if name in ['uproot','cast'] else 1.5),(end,0)])
   rotate('Spine',(1,0,0),swing*.16);rotate('Spine',(0,0,1),swing*.1)
   rotate('RightArm',(1,0,0),swing*.50);rotate('RightForeArm',(1,0,0),swing*.55);rotate('RightHand',(1,0,0),swing*.1)
   rotate('LeftArm',(0,0,1),-swing*.20);rotate('LeftForeArm',(1,0,0),swing*.35);rotate('Cape',(1,0,0),-swing*.035)
   if name in ['skullcrack','uproot','cast']:
    # Lower the two-handed grip for the ground slam; Skullcrack stays at
    # target-body height. The club must contact the floor at the release event.
    ground_lift=-.15 if name in ['uproot','cast'] else 0
    two_hand_grip(curve(frame,[(0,0),(10,1),(end-12,1),(end,0)]),curve(frame,[(0,0),(contact-12,.16),(contact-6,.16),(contact,ground_lift),(contact+3,ground_lift),(end,0)]))
  for b in rig.pose.bones:
   b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
(work/'motion-events.json').write_text(json.dumps({name:{'time':c/24,'contact':c/end}for name,c,end in [('attack',26,56),('skullcrack',28,60),('roar',30,64),('uproot',36,76),('cast',36,76)]},indent=2))
