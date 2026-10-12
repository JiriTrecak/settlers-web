import bpy,bmesh,sys,json,math
from pathlib import Path
from mathutils import Vector
work=Path(sys.argv[sys.argv.index('--')+1]).resolve();bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(work/'provider.glb'))
scene=bpy.context.scene;meshes=[o for o in scene.objects if o.type=='MESH']
# Preserve provider appearance, normalize local pivot and remove closed underside.
for o in meshes:
 o.data.transform(o.matrix_world);o.matrix_world.identity();o.parent=None
points=[v.co for o in meshes for v in o.data.vertices];lo=Vector(tuple(min(p[i] for p in points)for i in range(3)));hi=Vector(tuple(max(p[i] for p in points)for i in range(3)));size=hi-lo;scale=1/max(size.x,size.y);centre=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
removed=0
for o in meshes:
 for v in o.data.vertices:v.co=(v.co-centre)*scale
 bm=bmesh.new();bm.from_mesh(o.data);bm.normal_update();bottom=[f for f in bm.faces if f.normal.z<-.5 and f.calc_center_median().z<.08];removed+=len(bottom);bmesh.ops.delete(bm,geom=bottom,context='FACES');bm.to_mesh(o.data);bm.free();o.name='Construction enclosure'
 for mat in o.data.materials:
  if mat:mat.name='Neutral construction '+work.name;mat.use_nodes=True
for im in bpy.data.images:
 if im.has_data:im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(work/'source.blend'),compress=False)
for n,im in enumerate(list(bpy.data.images)):
 if not im.has_data:continue
 if im.packed_file:im.unpack(method='REMOVE')
 cap=1024
 if max(im.size)>cap:im.scale(cap,cap)
 im.filepath_raw=str(work/f'texture-{n}.png');im.file_format='PNG';im.save();im.pack()
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(work/'geometry.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)
report={'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in meshes),'removedUndersideFaces':removed,'teamColors':False,'source':'Tripo generated geometry and textures, Blender pivot normalization and open underside','runtimeTextures':[{'name':i.name,'size':list(i.size)}for i in bpy.data.images if i.has_data]};(work/'adaptation.json').write_text(json.dumps(report,indent=2))
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=850;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.06,.06,.06,1)
for name,pos,energy,s in [('Key',(2,-3,3),220,3),('Fill',(-3,-1,2),140,3),('Rim',(0,3,3),200,2)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=s;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.4))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Camera');o=bpy.data.objects.new('Camera',d);scene.collection.objects.link(o);scene.camera=o;d.type='ORTHO';d.ortho_scale=1.65
for name,pos in [('front',(1,-2,1.8)),('back',(-1,2,1.8))]:
 o.location=pos;o.rotation_euler=(Vector((0,0,.38))-o.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(work/f'review-{name}.png');bpy.ops.render.render(write_still=True)
