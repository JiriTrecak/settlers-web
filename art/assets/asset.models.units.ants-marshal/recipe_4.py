import bpy,json,sys
from pathlib import Path
p=Path(sys.argv[-1]);bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(p/'provider.glb'));m=next(o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.vertices)>100);adj={v.index:set()for v in m.data.vertices}
for e in m.data.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
pending=set(adj);out=[]
while pending:
 todo=[pending.pop()];ids=[]
 while todo:
  v=todo.pop();ids.append(v)
  for j in adj[v]:
   if j in pending:pending.remove(j);todo.append(j)
 pts=[m.data.vertices[i].co for i in ids];out.append({'vertices':len(ids),'min':[min(p[k]for p in pts)for k in range(3)],'max':[max(p[k]for p in pts)for k in range(3)],'ids':ids})
(p/'parts.json').write_text(json.dumps(out));(p/'raw-geometry.json').write_text(json.dumps({'vertices':[list(v.co)for v in m.data.vertices]}));print(json.dumps([{k:v for k,v in c.items()if k!='ids'}for c in out]));
