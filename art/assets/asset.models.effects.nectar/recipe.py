import bpy,sys,math
from pathlib import Path
if not bpy.app.background:raise RuntimeError('Run in background Blender')
work=Path(sys.argv[-1]).resolve();bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,c):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*c,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8;return m
gold=mat('Warm nectar',(1,.48,.025))
bs=gold.node_tree.nodes['Principled BSDF'];bs.inputs['Emission Color'].default_value=(1,.35,.012,1);bs.inputs['Emission Strength'].default_value=.35
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.24);o=bpy.context.object;o.name='Golden nectar drop';o.scale=(.8,.8,1.4);o.data.materials.append(gold)
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.ops.object.join()
bpy.ops.wm.save_as_mainfile(filepath=str(work/'nectar/source.blend'),compress=False)
bpy.ops.export_scene.gltf(filepath=str(work/'nectar/geometry.glb'),export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
