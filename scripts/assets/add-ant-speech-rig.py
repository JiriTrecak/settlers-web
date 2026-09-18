"""Non-destructive rig extension: preserve meshes/actions, add two rigid mandible bones."""
import bpy,sys,json,hashlib,shutil
from pathlib import Path
from mathutils import Vector
if not bpy.app.background: raise RuntimeError('Run in a separate background Blender process')
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'experiments/building-studio'))
from export_character import export_character
for slug in ['ant-family','ant-marshal','ant-hunter','ant-bombardier']:
 folder=root/'art/sources/characters'/slug
 source=folder/(slug+'.blend')
 backup=folder/'history'/'before-speech-rig.blend'
 backup.parent.mkdir(exist_ok=True)
 if not backup.exists():shutil.copy2(source,backup)
 bpy.ops.wm.open_mainfile(filepath=str(source))
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
 bpy.ops.object.select_all(action='DESELECT');rig.hide_set(False);rig.select_set(True);bpy.context.view_layer.objects.active=rig
 bpy.ops.object.mode_set(mode='EDIT')
 for side,sign in [('L',1),('R',-1)]:
  name='mandible.'+side
  bone=rig.data.edit_bones.get(name) or rig.data.edit_bones.new(name)
  bone.head=(sign*.105,-.195,1.30);bone.tail=bone.head+Vector((0,.10,0));bone.parent=rig.data.edit_bones['head']
 bpy.ops.object.mode_set(mode='OBJECT')
 for side in ['L','R']:
  ob=bpy.data.objects['Curved mandible '+side]
  ob.vertex_groups.clear();group=ob.vertex_groups.new(name='mandible.'+side);group.add(list(range(len(ob.data.vertices))),1,'REPLACE')
 rig['speechRig']={'left':'mandible.L','right':'mandible.R','axis':'z','angle':.24}
 bpy.ops.wm.save_as_mainfile(filepath=str(source))
 metadata=export_character(folder,folder/'model.glb')
 (folder/'speech-rig-validation.json').write_text(json.dumps({'bones':['mandible.L','mandible.R'],'geometryUnchanged':True,'metadata':metadata},indent=2))
 print('SPEECH_RIG_READY',slug,flush=True)
