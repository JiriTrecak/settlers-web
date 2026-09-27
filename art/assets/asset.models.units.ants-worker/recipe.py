"""Small authored carried loads. Counts are included in complete worker budgets."""
import bpy,math
from mathutils import Vector

def create_cargo(P,scene):
 collection=bpy.data.collections.new('Carried resource bundles');scene.collection.children.link(collection)
 def material(name,color):
  m=bpy.data.materials.new(name);m.use_nodes=True
  m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1)
  m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.78
  return m
 bark=material('Cargo timber',(.18,.076,.028));cut=material('Cargo cut wood',(.47,.27,.09))
 amber=material('Cargo amber',(.88,.34,.015));root=material('Cargo heartwood',(.20,.047,.14))
 result={}
 for kind in ['wood','amber','root']:
  objects=[]
  for i in range(3 if kind!='amber' else 5):
   if kind=='amber':
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1)
    ob=bpy.context.object;ob.scale=(.14,.11,.19);ob.location=((i%3-1)*.19,(i//3-.3)*.18,.13+(i%2)*.10);ob.rotation_euler=(.2*i,.3*i,.7*i)
    ob.data.materials.append(amber)
   else:
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.09,depth=.57 if kind=='wood' else .52)
    ob=bpy.context.object;ob.rotation_euler=(math.pi/2,.10*(i-1),.16*(i-1));ob.location=((i-1)*.15,0,.12+(i%2)*.13)
    ob.data.materials.append(bark if kind=='wood' else root);ob.data.materials.append(cut)
    for face in ob.data.polygons:
     if len(face.vertices)>4:face.material_index=1
   ob.name=f'{kind} load {i}'
   for c in list(ob.users_collection):c.objects.unlink(ob)
   collection.objects.link(ob);objects.append(ob)
  bpy.ops.object.select_all(action='DESELECT')
  for ob in objects:ob.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
  ob=bpy.context.object;ob.name=f'Carried {kind}';bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
  bpy.ops.export_scene.gltf(filepath=str(P/f'cargo-{kind}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
  result[kind]=sum(len(face.vertices)-2 for face in ob.data.polygons)
  ob.hide_render=True;ob.hide_set(True)
 return result
