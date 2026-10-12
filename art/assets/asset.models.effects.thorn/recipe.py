"""Editable low-poly replacements for the existing runtime projectile silhouettes."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
if not bpy.app.background:raise RuntimeError('Run in background Blender')
work=Path(sys.argv[-1]).resolve()
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.75;return m
def cone(name,lower,upper,length,position,mat):
 bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=lower,radius2=upper,depth=length,location=position);o=bpy.context.object;o.name=name;o.data.materials.append(mat);return o
for kind in ['arrow','thorn','stone']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 wood=material('Natural wood',(.42,.30,.16));ivory=material('Ivory tip',(.75,.62,.40));stone=material('Stone',(.32,.27,.19))
 # Local +Z is the longitudinal axis. glTF converts it to +Y.
 if kind=='arrow':
  cone('Shaft',.012,.012,.62,(0,0,0),wood);cone('Arrowhead',.04,0,.12,(0,0,.37),ivory)
  for yaw in [0,math.pi/2]:
   bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,-.23));o=bpy.context.object;o.name='Fletching';o.scale=(.10,.01,.13);o.rotation_euler.z=yaw;o.data.materials.append(ivory)
 elif kind=='thorn':cone('Thorn',.195,0,.84,(0,0,0),ivory)
 else:
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.16);bpy.context.object.name='Stone';bpy.context.object.data.materials.append(stone)
 folder=work/kind;folder.mkdir(exist_ok=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(folder/'source.blend'),compress=False)
 bpy.ops.export_scene.gltf(filepath=str(folder/'geometry.glb'),export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
