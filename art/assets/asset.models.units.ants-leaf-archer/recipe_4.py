import bpy,json,sys,math
from pathlib import Path
p=Path(sys.argv[-1]);bpy.ops.wm.open_mainfile(filepath=str(p/'source.blend'));r=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];report={}
for name in ['idle','walk','run','attack','hit','death']:
 a=bpy.data.actions[name];r.animation_data.action=a;r.animation_data.action_slot=a.slots[0]
 start,end=map(int,a.frame_range);samples=[]
 for frame in sorted(set([start,(start+end)//4,(start+end)//2,(start+end)*3//4,end])):
  bpy.context.scene.frame_set(frame);bad=[]
  for m in meshes:
   e=m.evaluated_get(bpy.context.evaluated_depsgraph_get())
   for edge in m.data.edges:
    i,j=edge.vertices;initial=(m.data.vertices[i].co-m.data.vertices[j].co).length;now=(e.data.vertices[i].co-e.data.vertices[j].co).length
    if now>max(.09,initial*3):bad.append({'mesh':m.name,'ratio':round(now/max(initial,.001),2),'vertices':[i,j],'rest':[list(m.data.vertices[i].co),list(m.data.vertices[j].co)]})
  samples.append({'frame':frame,'stretchedEdges':len(bad),'worst':sorted(bad,key=lambda x:-x['ratio'])[:3]})
 report[name]=samples
(p/'deformation-review.json').write_text(json.dumps(report,indent=2))
print(json.dumps({name:[(s['frame'],s['stretchedEdges']) for s in samples] for name,samples in report.items()}))
