"""Read-only validation of the editable forest-floor masters (run with Blender)."""
import bpy,json,math,sys
from pathlib import Path
root=Path.cwd();names=['ancient-canopy-trunk','fallen-canopy-bough','fern-thicket','bramble-thicket','ochre-mushroom-colony','mossy-boulder-bank','curled-forest-leaf','forest-splinter-pile','interwoven-root-bank','fallen-acorn'];names=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else names;results=[]
for name in names:
 folder=root/'art/sources/environment'/name;config=json.loads((folder/'asset.json').read_text());bpy.ops.wm.open_mainfile(filepath=str(folder/config['blend']))
 geometry=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render]
 assert geometry,name+' has no render geometry'
 for ob in geometry:
  assert all(math.isfinite(c) for v in ob.data.vertices for c in v.co),name+' contains invalid vertices'
  assert all(p.area>1e-10 for p in ob.data.polygons),name+' contains degenerate faces'
  assert all(m is not None for m in ob.data.materials),name+' contains an empty material slot'
 for image in bpy.data.images:
  if image.source=='FILE' and image.users:assert image.packed_file or Path(bpy.path.abspath(image.filepath)).is_file(),name+' missing texture '+image.filepath
 results.append({'asset':name,'meshes':len(geometry),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in geometry),'packedImages':len([i for i in bpy.data.images if i.packed_file])})
(root/'tmp/canopy/blend-validation.json').write_text(json.dumps(results,indent=2)+'\n');print('VALIDATED',len(results),'editable environment masters')
