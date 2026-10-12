import bpy,json,sys,math
from collections import defaultdict
from pathlib import Path
p=Path(sys.argv[-1]);bpy.ops.wm.open_mainfile(filepath=str(p/'source.blend'));r=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];report={}
seams={}
for m in meshes:
 groups=defaultdict(list)
 for v in m.data.vertices:groups[tuple(round(c,4)for c in v.co)].append(v.index)
 seams[m.name]=[ids for ids in groups.values()if len(ids)>1]
for name in ['idle','walk','run','attack','cast','skullcrack','roar','uproot','hit','death']:
 a=bpy.data.actions[name];r.animation_data.action=a;r.animation_data.action_slot=a.slots[0]
 start,end=map(int,a.frame_range);samples=[]
 for frame in range(start,end+1):
  bpy.context.scene.frame_set(frame);bad=[];gaps=0
  for m in meshes:
   e=m.evaluated_get(bpy.context.evaluated_depsgraph_get())
   for ids in seams[m.name]:
    if any((e.data.vertices[i].co-e.data.vertices[ids[0]].co).length>.001 for i in ids[1:]):gaps+=1
   for edge in m.data.edges:
    i,j=edge.vertices;initial=(m.data.vertices[i].co-m.data.vertices[j].co).length;now=(e.data.vertices[i].co-e.data.vertices[j].co).length
    if now>max(.09,initial*3):bad.append({'mesh':m.name,'ratio':round(now/max(initial,.001),2),'vertices':[i,j],'rest':[list(m.data.vertices[i].co),list(m.data.vertices[j].co)]})
  samples.append({'frame':frame,'stretchedEdges':len(bad),'seamGaps':gaps,'worst':sorted(bad,key=lambda x:-x['ratio'])[:3]})
 report[name]=samples
(p/'deformation-review.json').write_text(json.dumps(report,indent=2))
print(json.dumps({name:[(s['frame'],s['stretchedEdges']) for s in samples] for name,samples in report.items()}))
