"""Background validation of the actual saved artifact, optionally exercise its save watcher."""
import json
import math
import sys
from pathlib import Path

import bpy

scene=bpy.context.scene
meshes=[o for o in scene.objects if o.type=='MESH']
assert scene.camera is not None
assert scene.world.node_tree.nodes['Background'].inputs[1].default_value==0
assert len(meshes)>0
for obj in meshes:
    assert all(math.isfinite(c) for v in obj.data.vertices for c in v.co), obj.name
    assert all(0<=i<len(obj.data.vertices) for p in obj.data.polygons for i in p.vertices), obj.name
images=[{'name':im.name,'packed_files':len(im.packed_files),'size':list(im.size)} for im in bpy.data.images]
reference=next(im for im in bpy.data.images if im.name=='reference.png')
assert reference.packed_file is not None, 'Reference image is not packed'
result={'file':bpy.data.filepath,'meshes':len(meshes),'objects':len(scene.objects),
        'reference_packed':True,'images':images,'camera':scene.camera.name,'resolution':[scene.render.resolution_x,scene.render.resolution_y]}
if '--resave' in sys.argv:
    # A real Blender save verifies the same file event produced by Ctrl/Cmd+S in the GUI.
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    result['resaved']=True
print('BUILDING_VALIDATED',json.dumps(result))
