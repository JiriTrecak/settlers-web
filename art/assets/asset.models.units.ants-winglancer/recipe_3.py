"""Explicit flight skeleton on intact Tripo mesh. Coordinates remain provider-local."""
import math
from mathutils import Vector,Quaternion,Matrix
# Discard malformed provider armature nodes but retain the original source separately.
body=next(o for o in scene.objects if o.type=='MESH' and len(o.data.vertices)>100)
for o in list(scene.objects):
 if o!=body:bpy.data.objects.remove(o,do_unlink=True)
body.parent=None;body.vertex_groups.clear()
for m in list(body.modifiers):body.modifiers.remove(m)
d=bpy.data.armatures.new('Winglancer flight rig');rig=bpy.data.objects.new('Winglancer flight rig',d);scene.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
bones={
 'Root':(None,(0,.15,0),(0,.15,.1)),
 'Thorax':('Root',(0,.15,.6),(0,.15,.7)),
 'Head':('Thorax',(.025,.06,.69),(.025,-.025,.76)),
 'Abdomen':('Thorax',(-.06,.19,.53),(-.13,.19,.32)),
 'Lance':('Thorax',(.025,.02,.60),(.22,-.18,.46)),
 'WingForeL':('Thorax',(-.035,.14,.69),(-.34,.13,.87)),
 'WingHindL':('Thorax',(-.04,.16,.68),(-.3,.18,.64)),
 'WingForeR':('Thorax',(.05,.185,.7),(.32,.23,.86)),
 'WingHindR':('Thorax',(.055,.205,.60),(.3,.25,.5)),
 'LegBackL':('Thorax',(-.12,.21,.47),(-.28,.26,.15)),
 'LegFrontL':('Thorax',(-.085,.16,.55),(-.2,.15,.3)),
 'LegBackR':('Thorax',(.045,.24,.54),(.1,.31,.2)),
 'LegFrontR':('Thorax',(.038,.14,.47),(.07,.11,.24))}
for name,(parent,head,tail)in bones.items():
 b=d.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=d.edit_bones[parent]
for name,parent in [('socket_handR','Lance'),('socket_handL','Lance'),('socket_projectile','Lance'),('socket_cast','Thorax')]:
 b=d.edit_bones.new(name);b.head=d.edit_bones[parent].head;b.tail=b.head+Vector((0,-.02,0));b.parent=d.edit_bones[parent];b.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT');body.parent=rig;mod=body.modifiers.new('Flight skin','ARMATURE');mod.object=rig
for name in bones:body.vertex_groups.new(name=name)
# UV islands preserve the generated membrane surfaces and avoid tearing texture seams.
adj={v.index:set()for v in body.data.vertices}
for e in body.data.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
pending=set(adj);islands=[]
while pending:
 todo=[pending.pop()];ids=[]
 while todo:
  i=todo.pop();ids.append(i)
  for j in adj[i]:
   if j in pending:pending.remove(j);todo.append(j)
 islands.append(ids)
wing_members={n:[]for n in bones if n.startswith('Wing')}
for ids in islands:
 pts=[body.data.vertices[i].co for i in ids];lo=[min(v[k]for v in pts)for k in range(3)];hi=[max(v[k]for v in pts)for k in range(3)]
 bone=None
 if hi[0]<-.055 and lo[1]>.07 and lo[2]>.66:bone='WingForeL'
 elif hi[0]<-.055 and lo[1]>.14 and lo[2]>.57 and hi[2]<.71:bone='WingHindL'
 elif lo[0]>.055 and lo[1]>.15 and lo[2]>.665:bone='WingForeR'
 elif lo[0]>.065 and lo[1]>.18 and lo[2]>.40 and hi[2]<.66:bone='WingHindR'
 if bone:
  wing_members[bone]+=ids
  body.vertex_groups[bone].add(ids,1,'REPLACE')
owned={i for ids in wing_members.values()for i in ids}
for v in body.data.vertices:
 if v.index in owned:continue
 x,y,z=v.co
 if y<.07 and z>.645:bone='Head'
 elif y<.09 and z<.65:bone='Lance'
 elif y<.07 and x>.12:bone='Lance'
 elif z<.57 and -.18<x<.02 and .09<y<.29:bone='Abdomen'
 elif z<.56 and x<-.13:bone='LegBackL'
 elif z<.56 and x<-.05:bone='LegFrontL'
 elif z<.55 and x>.02:bone='LegBackR' if y>.18 else 'LegFrontR'
 else:bone='Thorax'
 body.vertex_groups[bone].add([v.index],1,'REPLACE')
# Weld only the skin weights across UV seams, leaving geometry and UVs untouched.
# Blend joints locally; distant membrane spans and the rigid lance remain stiff.
from collections import defaultdict
welded=defaultdict(list)
for v in body.data.vertices:welded[tuple(round(c,5)for c in v.co)].append(v.index)
key_for={i:key for key,ids in welded.items()for i in ids};edges={key:set()for key in welded}
for e in body.data.edges:
 a,b=(key_for[i]for i in e.vertices)
 if a!=b:edges[a].add(b);edges[b].add(a)
weights={}
for key,ids in welded.items():
 w=defaultdict(float)
 for i in ids:
  for g in body.data.vertices[i].groups:w[g.group]+=g.weight/len(ids)
 weights[key]=dict(w)
for iteration in range(2):
 next_weights={}
 for key,w in weights.items():
  x,y,z=key
  rigid_wing=any(i in owned for i in welded[key]) and abs(x)>.14
  rigid_lance=y<-.07
  neighbors=edges[key]
  if rigid_wing or rigid_lance or not neighbors:next_weights[key]=w;continue
  blend=defaultdict(float,{k:v*.65 for k,v in w.items()})
  for other in neighbors:
   for k,v in weights[other].items():blend[k]+=v*.35/len(neighbors)
  next_weights[key]=dict(blend)
 weights=next_weights
for key,ids in welded.items():
 w=sorted(weights[key].items(),key=lambda x:-x[1])[:4];total=sum(v for _,v in w)
 for i in ids:
  for g in list(body.data.vertices[i].groups):body.vertex_groups[g.group].remove([i])
  for group,value in w:body.vertex_groups[group].add([i],value/total,'REPLACE')
# Rotate into forward -Y, center the thorax laterally; all rig and skin data transform together.
rotation=Matrix.Rotation(math.radians(-30),4,'Z');transform=rotation@Matrix.Translation((0,-.15,0))
body.data.transform(transform);rig.data.transform(transform)
(work/'rig-selections.json').write_text(json.dumps(wing_members,indent=2))
meshes=[body]
