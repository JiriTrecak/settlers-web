import math
from mathutils import Quaternion,Matrix,Vector
scene.render.fps=24
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
rig.animation_data_create()
def rotate(name,axis,angle):
 bpy.context.view_layer.update();b=rig.pose.bones[name];pivot=b.head.copy();b.matrix=Matrix.Translation(pivot)@Quaternion(axis,angle).to_matrix().to_4x4()@Matrix.Translation(-pivot)@b.matrix

def curve(frame,keys):
 for (a,x),(b,y)in zip(keys,keys[1:]):
  if a<=frame<=b:
   t=(frame-a)/(b-a);return x+(y-x)*(t*t*(3-2*t))
 return keys[-1][1]
for name,end in [('idle',48),('walk',24),('run',24),('attack',36),('cast',36),('hit',18),('death',48)]:
 a=bpy.data.actions.new(name);a.use_fake_user=True;rig.animation_data.action=a
 for frame in range(end+1):
  for b in rig.pose.bones:b.matrix_basis.identity()
  t=frame/24;phase=t*math.tau*(6 if name=='run' else 4)
  dying=curve(frame,[(0,0),(12,.5),(36,1),(48,1)])if name=='death'else 0
  rig.pose.bones['Root'].location.z=.012*math.sin(phase/2)*(1-dying)
  if name in ['walk','run']:rotate('Thorax',(1,0,0),-.12 if name=='walk'else-.24)
  if name=='death':
   rotate('Root',(1,0,0),1.5*dying)
  for side,sign in [('L',1),('R',-1)]:
   for kind,amp,offset in [('Fore',.55,0),('Hind',.4,.45)]:
    rotate('Wing'+kind+side,(0,1,0),sign*(amp*math.sin(phase+offset)*(1-dying)-.65*dying))
   for kind in ['Front','Back']:rotate('Leg'+kind+side,(1,0,0),(.05*math.sin(t*math.tau+sign)+( .14 if name=='run' else 0))*(1-dying))
  rotate('Abdomen',(1,0,0),.025*math.sin(t*math.tau)*(1-dying))
  rotate('Head',(0,0,1),.02*math.sin(t*math.pi)*(1-dying))
  if name in ['attack','cast']:
   strike=curve(frame,[(0,0),(8,-.25),(12,-.25),(17,1),(20,.75),(36,0)])
   rotate('Thorax',(1,0,0),-.20*strike)
   # A quick whole-body dip with the lance driven forward by both hands.
   rig.pose.bones['Root'].location.z-=.45*max(0,strike)
   b=rig.pose.bones['Lance'];b.matrix=Matrix.Translation((0,-.07*strike,0))@b.matrix
  if name=='hit':rotate('Thorax',(1,0,0),.16*math.sin(frame/end*math.pi))
  if name=='death':
   # Settle the folded pose onto the model floor; world flight descent is renderer-owned.
   bpy.context.view_layer.update()
   floor=min(v.co.z for m in meshes for v in m.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices)
   b=rig.pose.bones['Root'];b.matrix=Matrix.Translation((0,0,-floor))@b.matrix
  for b in rig.pose.bones:
   b.rotation_mode='QUATERNION';b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
(work/'motion-events.json').write_text(json.dumps({'attack':{'time':17/24,'contact':17/36},'cast':{'time':17/24,'contact':17/36},'flight':'Four independently hinged wings, hover and forward-flight cycles; no provider motion clips were available.'},indent=2))
