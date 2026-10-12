import bpy,sys,json
from pathlib import Path
p=Path(sys.argv[-1]);bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(p/'provider.glb'))
r=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');ms=[o for o in bpy.context.scene.objects if o.type=='MESH']
d={'bones':[{'name':b.name,'parent':b.parent.name if b.parent else None,'head':list(b.head_local),'tail':list(b.tail_local)}for b in r.data.bones],'actions':[a.name for a in bpy.data.actions],'meshes':[{'name':o.name,'vertices':len(o.data.vertices),'triangles':sum(len(f.vertices)-2 for f in o.data.polygons),'min':[min(v.co[k]for v in o.data.vertices)for k in range(3)],'max':[max(v.co[k]for v in o.data.vertices)for k in range(3)],'groups':[g.name for g in o.vertex_groups]}for o in ms]};(p/'inspection.json').write_text(json.dumps(d,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(p/'inspection.blend'));print(json.dumps(d))
