"""Adapt approved Tripo halls. Full source textures and editable mesh remain in Blender.
Only runtime copies use 2K textures; team ownership stays in packed albedo alpha.
"""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Matrix,Vector
assert bpy.app.background
slug=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else Path(__file__).parent.name
root=Path.cwd();p=root/'.asset-work/build/buildings'/slug
if not (p/'source.glb').exists():
 sys.path.insert(0,str(root/'experiments/building-studio'))
 from source_workspace import materialize
 materialize('asset.models.buildings.'+slug,'buildings')
own=json.loads((p/'ownership.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(p/'source.glb'))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in objects:
 world=o.matrix_world.copy();o.parent=None;o.data.transform(world);o.matrix_world=Matrix.Identity(4)
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
lo=Vector(min(v.co[a] for o in objects for v in o.data.vertices) for a in range(3))
hi=Vector(max(v.co[a] for o in objects for v in o.data.vertices) for a in range(3));extent=hi-lo
# Square construction footprint; widths/depths include stairs and corner supports.
center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
for i,o in enumerate(objects):
 for v in o.data.vertices:
  v.co-=center;v.co.x*=15/extent.x;v.co.y*=15/extent.y;v.co.z*=15/extent.x
 o.name=slug+'_structure_'+str(i);o.data.update()
 for f in o.data.polygons:f.use_smooth=True
mat=objects[0].data.materials[0];mat.name='TC_TeamColor';mat['teamColorMask']='baseColorAlpha';mat['teamColorSourceMax']=own['sourceMax'];mat['teamColorDefault']=own['default']
nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
tex=nodes.new('ShaderNodeTexImage');tex.name='Authored albedo with ownership mask';tex.image=bpy.data.images.load(str(p/'albedo-team.png'));tex.image.alpha_mode='CHANNEL_PACKED'
links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);mat.diffuse_color=(1,1,1,1)
if slug.startswith('ants'):
 for link in list(bsdf.inputs['Metallic'].links):links.remove(link)
 bsdf.inputs['Metallic'].default_value=0
for node in nodes:
 if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.45
# Named material slots and packed reference make the .blend useful for future editing.
reference=bpy.data.images.load(str(p/'reference.png'));reference.use_fake_user=True
for image in bpy.data.images:
 if image.source=='FILE':image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(p/'source.blend'),compress=False)
# Export a single draw using the original UVs and PBR maps.
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
if len(objects)>1:bpy.ops.object.join()
obj=bpy.context.view_layer.objects.active
reduced={}
for node in nodes:
 if node.type=='TEX_IMAGE' and node.image and max(node.image.size)>2048:
  original=node.image
  if original.name not in reduced:
   image=original.copy();f=2048/max(image.size);image.scale(round(original.size[0]*f),round(original.size[1]*f));image.pack();reduced[original.name]=image
  node.image=reduced[original.name]
bpy.ops.export_scene.gltf(filepath=str(p/'model.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_image_format='AUTO',export_animations=False)
# Review material uses the exact same alpha-mask equation as the runtime shader.
sep=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],sep.inputs[0])
mx=nodes.new('ShaderNodeMath');mx.operation='MAXIMUM';links.new(sep.outputs[0],mx.inputs[0]);links.new(sep.outputs[1],mx.inputs[1])
mx2=nodes.new('ShaderNodeMath');mx2.operation='MAXIMUM';links.new(mx.outputs[0],mx2.inputs[0]);links.new(sep.outputs[2],mx2.inputs[1])
div=nodes.new('ShaderNodeMath');div.operation='DIVIDE';links.new(mx2.outputs[0],div.inputs[0]);div.inputs[1].default_value=own['sourceMax']
tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;links.new(div.outputs[0],tint.inputs[1])
mix=nodes.new('ShaderNodeMixRGB');links.new(tex.outputs['Alpha'],mix.inputs[0]);links.new(tex.outputs['Color'],mix.inputs[1]);links.new(tint.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],bsdf.inputs['Base Color'])
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
world=bpy.data.worlds.new('Neutral review');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.12,.12,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7;scene.world=world
scene.view_settings.view_transform='AgX'
camera=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=25
height=max(v.co.z for v in obj.data.vertices);target=Vector((0,0,height*.4))
def view(x,y):
 camera.location=(x,y,23);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
view(25,-34)
for name,loc,energy,size in [('Key',(-12,-18,25),3300,12),('Fill',(18,-8,12),1800,12),('Rim',(4,14,22),2200,10)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size
 light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=loc;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
for color,value in [('red',(.55,.025,.025,1)),('blue',(.025,.12,.55,1)),('green',(.035,.42,.08,1)),('white',(.7,.7,.7,1))]:
 tint.inputs[2].default_value=value;scene.render.filepath=str(p/('render.png' if color=='red' else 'team-'+color+'.png'));bpy.ops.render.render(write_still=True)
view(-25,34);tint.inputs[2].default_value=(.55,.025,.025,1);scene.render.filepath=str(p/'rear.png');bpy.ops.render.render(write_still=True)
triangles=sum(len(f.vertices)-2 for f in obj.data.polygons)
(p/'stats.json').write_text(json.dumps({'triangles':triangles,'dimensions':[15,15,height],'materials':len(obj.data.materials),'textureSize':2048,'teamMaskCoverage':own['coverage']},indent=2))
print('HALL',slug,triangles,'height',height)

# Retain the review stage in the editable source, restoring full-resolution images.
for node in nodes:
 if node.type=='TEX_IMAGE' and node.image:
  for original_name,copy in reduced.items():
   if node.image==copy:node.image=bpy.data.images[original_name];break
view(25,-34)
bpy.ops.wm.save_as_mainfile(filepath=str(p/'source.blend'),compress=False)
