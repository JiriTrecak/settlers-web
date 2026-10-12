import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
p=Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(p/'provider.glb'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in bpy.context.scene.objects:o.select_set(o in meshes)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.join();o=bpy.context.object;o.name='RootEruption'
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
points=[o.matrix_world@Vector(v) for v in o.bound_box]
lo=Vector(tuple(min(v[k] for v in points)for k in range(3)));hi=Vector(tuple(max(v[k]for v in points)for k in range(3)))
center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
scale=14/max(hi.x-lo.x,hi.y-lo.y)
for v in o.data.vertices:v.co=(o.matrix_world@v.co-center)*scale
from mathutils import Matrix
o.matrix_world=Matrix.Identity(4)
for mat in o.data.materials:
 if not mat or not mat.use_nodes:continue
 for n in mat.node_tree.nodes:
  if n.type=='BSDF_PRINCIPLED':n.inputs['Metallic'].default_value=0
scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=0;scene.frame_end=60
height=max(v.co.z for v in o.data.vertices)
for v in o.data.vertices:v.co.z*=6.5/height
height=6.5
# A true ground eruption: quickly rise, hold, then retract. Ground hides the submerged model.
for frame,z in [(0,-height-.2),(2,-height*.5),(7,0),(37,0),(48,-height*.45),(60,-height-.2)]:
 o.location.z=z;o.keyframe_insert(data_path='location',frame=frame)
o.animation_data.action.name='erupt'
scene.frame_set(7)
for image in bpy.data.images:
 if image.source=='FILE':image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(p/'source.blend'),compress=False)
bpy.ops.export_scene.gltf(filepath=str(p/'geometry.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=True)
(p/'adaptation.json').write_text(json.dumps({'triangles':sum(len(f.vertices)-2 for f in o.data.polygons),'width':14,'height':height,'clip':'erupt','fps':24,'frames':60,'task':'16fa7b55-7efb-42ec-82b7-b94add512c72'},indent=2))
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=960;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Zinc studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.025,.029,1)
for name,pos,energy,size in [('Key',(8,-12,18),2200,12),('Fill',(-12,-5,10),1500,12),('Rim',(0,12,15),2400,10)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.size=size;l=bpy.data.objects.new(name,d);scene.collection.objects.link(l);l.location=pos;l.rotation_euler=(Vector((0,0,2))-l.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Camera');camera=bpy.data.objects.new('Camera',d);scene.collection.objects.link(camera);scene.camera=camera;d.type='ORTHO';d.ortho_scale=20;camera.location=(12,-18,18);camera.rotation_euler=(Vector((0,0,2))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(p/'preview.png');bpy.ops.render.render(write_still=True)
