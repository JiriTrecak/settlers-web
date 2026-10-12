"""Low-poly amber focus projectile, along glTF +Y for the shared flight renderer."""
import bpy,math,sys
from pathlib import Path
assert bpy.app.background
p=Path(sys.argv[-1]);bpy.ops.wm.read_factory_settings(use_empty=True)
vertices=[(0,0,.45),(0,0,-.25)]+[(.16*math.cos(i*math.tau/6),.16*math.sin(i*math.tau/6),0)for i in range(6)]
faces=[face for i in range(6)for face in [(0,2+i,2+(i+1)%6),(1,2+(i+1)%6,2+i)]]
mesh=bpy.data.meshes.new('Amber shard');mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new('Amber shard',mesh);bpy.context.collection.objects.link(o)
m=bpy.data.materials.new('Golden amber');m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(1,.35,.035,1);b.inputs['Roughness'].default_value=.45;b.inputs['Emission Color'].default_value=(1,.18,.01,1);b.inputs['Emission Strength'].default_value=.3;mesh.materials.append(m)
bpy.ops.wm.save_as_mainfile(filepath=str(p/'bolt.blend'),compress=False)
bpy.ops.export_scene.gltf(filepath=str(p/'bolt.glb'),export_format='GLB',export_yup=True,export_animations=False)
