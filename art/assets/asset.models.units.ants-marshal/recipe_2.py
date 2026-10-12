"""Equipment-aware refinement of the approved generated Marshal, preserving its paint."""
import math
from mathutils import Quaternion,Matrix,Vector

def rigid(mesh,v,name):
 for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
 mesh.vertex_groups['mixamorig:'+name].add([v.index],1,'REPLACE')
# The leaf cape gets its own hinge, independent of both legs.
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
b=rig.data.edit_bones.new('Cape');b.head=(0,.11,.61);b.tail=(0,.22,.35);b.parent=rig.data.edit_bones['mixamorig:Hips'];bpy.ops.object.mode_set(mode='OBJECT')
for mesh in meshes:
 mesh.vertex_groups.new(name='Cape')
 parts=json.loads((work/'parts-colors.json').read_text());mace=set();cape=set();abdomen=set();cape_join=set(parts[107]['ids'])
 for part_index,part in enumerate(parts):
  lo,hi=part['min'],part['max']
  if hi[0]<-.15 and hi[1]<-.16 and lo[2]>.25:mace.update(part['ids'])
  elif (part_index in [13,23,36] or (lo[2]>.10 and hi[2]<.51 and lo[0]>-.20 and hi[0]<.18)):abdomen.update(part['ids'])
  elif part['redFraction']>.45 and lo[1]>-.10:cape.update(part['ids'])
 weight_regions={}
 for v in mesh.data.vertices:
  x,y,z=v.co
  weight_regions[v.index]='mace' if v.index in mace else 'cloth' if v.index in cape or v.index in abdomen else 'body'
  if v.index in mace:rigid(mesh,v,'RightHand')
  elif v.index in cape or v.index in abdomen:
   for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
   # The provider joins cape lining to the abdomen/kilt. Use the same continuous
   # weight field across these surfaces so UV splits cannot tear during a stride.
   cloth=min(1,max(0,(.66-z)/.30))*max(min(1,max(0,(y-.04)/.18)),min(1,max(0,(abs(x)-.22)/.10)))
   spine=min(1,max(0,(z-.43)/.18))*(1-cloth)
   for bone,weight in [('Cape',cloth),('mixamorig:Spine2',spine),('mixamorig:Hips',1-cloth-spine)]:
    mesh.vertex_groups[bone].add([v.index],weight,'REPLACE')
  elif z>.665 and x>-.195 and x<.22 and y<.11:rigid(mesh,v,'Head')
 (work/'equipment-selection.json').write_text(json.dumps({'mace':sorted(mace),'cape':sorted(cape)}))
def activate(a):rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
for a in list(bpy.data.actions):
 activate(a);samples=[];start,end=map(int,a.frame_range)
 for frame in range(start,end+1):
  scene.frame_set(frame);poses={}
  for b in rig.pose.bones:
   name=b.name.split(':')[-1]
   if any(x in name for x in ['Hand','Arm','Shoulder','Head','Neck','Spine']) or (name=='Hips' and a.name in ['walk','run']):
    retain=0 if any(x in name for x in ['Hand','Arm','Shoulder']) else .15 if name in ['Head','Neck'] else .35 if name=='Hips' else .45
    poses[b.name]=Quaternion().slerp(b.rotation_quaternion,retain)
  # Low-amplitude secondary motion; one complete cycle per gait loop.
  poses['Cape']=Quaternion((1,0,0),-.035*math.sin((frame-start)/max(1,end-start)*math.tau))
  samples.append((frame,poses))
 for frame,poses in samples:
  for name,q in poses.items():b=rig.pose.bones[name];b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=frame)
for name in ['idle','attack','hit']:bpy.data.actions.remove(bpy.data.actions[name])
def keypose(frame):
 for b in rig.pose.bones:
  b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
def rotate(name,axis,angle):
 bpy.context.view_layer.update();b=rig.pose.bones[name if name=='Cape' else 'mixamorig:'+name];pivot=b.head.copy()
 b.matrix=Matrix.Translation(pivot)@Quaternion(axis,angle).to_matrix().to_4x4()@Matrix.Translation(-pivot)@b.matrix

def curve(frame,keys):
 for (a,x),(b,y) in zip(keys,keys[1:]):
  if a<=frame<=b:
   t=(frame-a)/(b-a);return x+(y-x)*(t*t*(3-2*t))
 return keys[-1][1]
for name,end in [('idle',96),('hit',24),('attack',44),('cast',52)]:
 a=bpy.data.actions.new(name);a.use_fake_user=True;rig.animation_data.action=a
 for frame in range(end+1):
  for b in rig.pose.bones:b.matrix_basis.identity()
  t=frame/end
  if name=='idle':rotate('Spine',(1,0,0),math.sin(t*math.tau)*.008);rotate('Cape',(1,0,0),math.sin(t*math.tau)*.018)
  elif name=='hit':rotate('Spine',(1,0,0),-.12*math.sin(math.pi*t))
  else:
   contact=21 if name=='attack' else 28
   swing=curve(frame,[(0,0),(contact-10,-.30),(contact-5,-.30),(contact,1.1),(contact+4,1.1),(end,0)])
   rotate('Spine',(0,0,1),swing*.14);rotate('Spine',(1,0,0),swing*.05)
   rotate('RightArm',(1,0,0),swing*.48);rotate('RightForeArm',(1,0,0),swing*.55);rotate('RightHand',(1,0,0),swing*.15)
   rotate('LeftArm',(0,0,1),-swing*.12);rotate('Cape',(1,0,0),-swing*.06)
  keypose(frame)
(work/'motion-events.json').write_text(json.dumps({'attack':{'time':21/24,'contact':21/44},'cast':{'time':28/24,'contact':28/52}},indent=2))
