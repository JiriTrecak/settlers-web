"""Validate evaluated geometry against the navigation profiles, not only mesh counts."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
results=[]
for slug in ['arched-root-walkway','woodland-timber-bridge','moss-stone-bridge']:
 folder=Path.cwd()/'art/sources/environment'/slug;c=json.loads((folder/'asset.json').read_text());d=c['deck']
 bpy.ops.wm.open_mainfile(filepath=str(folder/c['blend']))
 vs=[];faces=[];triangles=0;deps=bpy.context.evaluated_depsgraph_get()
 for ob in bpy.context.scene.objects:
  if ob.type!='MESH' or ob.hide_render:continue
  evaluated=ob.evaluated_get(deps);me=evaluated.to_mesh();offset=len(vs)
  vs.extend([ob.matrix_world@v.co for v in me.vertices]);faces.extend([tuple(offset+i for i in p.vertices) for p in me.polygons]);triangles+=sum(len(p.vertices)-2 for p in me.polygons)
  evaluated.to_mesh_clear()
 bvh=BVHTree.FromPolygons(vs,faces);errors=[]
 rows=24 if c['kind']=='timber' else 18 if c['kind']=='stone' else 36
 for i in range(rows):
  y=-d['depth']/2+(i+.5)*d['depth']/rows;expected=d['height']+d['arch']*math.cos(y*math.pi/d['depth'])
  for x in [-d['width']*.33,0,d['width']*.33]:
   hit,normal,index,distance=bvh.ray_cast(Vector((x,y,30)),Vector((0,0,-1)))
   assert hit is not None,(slug,'missing walk floor',x,y)
   error=abs(hit.z-expected);assert error<.08,(slug,'floor mismatch',x,y,error)
   errors.append(error)
 results.append({'asset':slug,'samples':len(errors),'maxFloorErrorMetres':max(errors),'evaluatedTriangles':triangles})
(folder.parent/'crossing-kit'/'floor-validation.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
