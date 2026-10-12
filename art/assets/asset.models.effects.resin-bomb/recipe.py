"""Small static seed-shell projectile, sized for the authored mortar."""
import bpy,sys
from pathlib import Path
from mathutils import Vector
p=Path(sys.argv[-1]);bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,colour):
 m=bpy.data.materials.new(name);m.diffuse_color=(*colour,1);m.use_nodes=True
 b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*colour,1);b.inputs['Roughness'].default_value=.7
 return m
shell=mat('Warm seed casing',(.28,.095,.028));resin=mat('Amber seam',(.8,.35,.035));wick=mat('Charred fuse',(.035,.021,.01))
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.25);o=bpy.context.object;o.name='Seed shell';o.scale=(1,1,1.15);o.data.materials.append(shell)
bpy.ops.mesh.primitive_torus_add(major_radius=.23,minor_radius=.025,major_segments=12,minor_segments=4);o=bpy.context.object;o.name='Resin band';o.data.materials.append(resin)
bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=.045,radius2=.028,depth=.14,location=(0,0,.32));o=bpy.context.object;o.name='Fuse';o.data.materials.append(wick)
for o in bpy.context.scene.objects:
 bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bpy.ops.wm.save_as_mainfile(filepath=str(p/'bomb.blend'),compress=False)
bpy.ops.export_scene.gltf(filepath=str(p/'bomb.glb'),export_format='GLB',export_yup=True,export_animations=False)
