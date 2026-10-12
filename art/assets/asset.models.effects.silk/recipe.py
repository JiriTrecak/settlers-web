import bpy,sys,math
from pathlib import Path
if not bpy.app.background:raise RuntimeError('Run in background Blender')
work=Path(sys.argv[-1]).resolve();bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,c):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*c,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8;return m
cream=mat('Natural silk',(.88,.79,.59));thread=mat('Silk winding',(.65,.54,.36))
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.25);o=bpy.context.object;o.name='Compressed silk cocoon';o.scale=(.75,.75,1.35);o.data.materials.append(cream)
for i in [-1,0,1]:
 bpy.ops.mesh.primitive_torus_add(major_segments=8,minor_segments=3,major_radius=.19,minor_radius=.022,location=(0,0,i*.13));o=bpy.context.object;o.name='Bound silk strand';o.rotation_euler.x=.2*i;o.data.materials.append(thread)
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.ops.object.join()
bpy.ops.wm.save_as_mainfile(filepath=str(work/'silk/source.blend'),compress=False)
bpy.ops.export_scene.gltf(filepath=str(work/'silk/geometry.glb'),export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
