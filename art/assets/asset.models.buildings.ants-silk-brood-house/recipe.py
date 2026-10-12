"""Adapt Tripo production buildings without altering their approved silhouettes.
Normalize square footprint to one source unit; gameplay scale belongs to binding.
Preserve full-resolution source paint and encode ownership in albedo alpha.
"""
import bpy,sys,json,struct,math,numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
assert bpy.app.background
work=Path(sys.argv[sys.argv.index('--')+1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(work/'provider.glb'))
config=json.loads((work/'config.json').read_text()) if (work/'config.json').exists() else {}
scene=bpy.context.scene;meshes=[o for o in scene.objects if o.type=='MESH']
for o in meshes:
 world=o.matrix_world.copy();o.parent=None;o.data.transform(world);o.matrix_world=Matrix.Identity(4)
 if config.get('rotateZ'):o.data.transform(Matrix.Rotation(math.radians(config['rotateZ']),4,'Z'))
for o in list(scene.objects):
 if o not in meshes:bpy.data.objects.remove(o,do_unlink=True)
points=[v.co for o in meshes for v in o.data.vertices];lo=Vector(tuple(min(p[i]for p in points)for i in range(3)));hi=Vector(tuple(max(p[i]for p in points)for i in range(3)));extent=hi-lo;centre=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
for o in meshes:
 for v in o.data.vertices:
  v.co-=centre;v.co.x/=extent.x;v.co.y/=extent.y;v.co.z/=max(extent.x,extent.y)
 o.name=work.name+' structure';o.data.update()
coverage=[]
for mat in {m for o in meshes for m in o.data.materials if m}:
 nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF');tex=bsdf.inputs['Base Color'].links[0].from_node;im=tex.image
 pixels=np.empty(len(im.pixels),np.float32);im.pixels.foreach_get(pixels);pixels=pixels.reshape((-1,4));r,g,b=pixels[:,:3].T
 # Blender exposes image RGB as normalized encoded source pixels here.
 smooth=lambda x:np.clip(x,0,1)**2*(3-2*np.clip(x,0,1))
 chroma=np.maximum(pixels[:,:3].max(1)-pixels[:,:3].min(1),.001)
 mask=smooth((r-np.maximum(g,b)-.045)/.12)*smooth((b-.65*g+.006)/.025)*smooth(((r-g)/chroma-.65)/.2)
 assert (mask>.5).mean()>.01,'No readable ownership surface'
 pixels[:,3]=mask;own=bpy.data.images.new('Authored paint and ownership',width=im.size[0],height=im.size[1],alpha=True);own.colorspace_settings.name=im.colorspace_settings.name;own.alpha_mode='CHANNEL_PACKED';own.pixels.foreach_set(pixels.ravel());own.pack();tex.image=own
 own.filepath_raw=str(work/'albedo.png');own.file_format='PNG';own.save()
 lin=lambda c:np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
 source_max=float(np.quantile(lin(r[mask>.95]),.95));coverage.append(float((mask>.5).mean()))
 mat.name='TC_TeamColor';mat['teamColorMask']='baseColorAlpha';mat['teamColorSourceMax']=source_max;mat['teamColorDefault']=[source_max,.025,.025];mat.diffuse_color=(1,1,1,1)
 for link in list(bsdf.inputs['Alpha'].links):links.remove(link)
 bsdf.inputs['Alpha'].default_value=1
 if work.name.startswith('ants'):
  for link in list(bsdf.inputs['Metallic'].links):links.remove(link)
  bsdf.inputs['Metallic'].default_value=0
 for n in nodes:
  if n.type=='NORMAL_MAP':n.inputs['Strength'].default_value=.45
ref=bpy.data.images.load(str(work/'reference.png'));ref.use_fake_user=True
for im in bpy.data.images:
 if im.has_data:im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(work/'source.blend'),compress=False)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
# Connect alpha only for export so glTF preserves the ownership channel.
for mat in {m for o in meshes for m in o.data.materials if m}:
 bsdf=mat.node_tree.nodes.get('Principled BSDF');tex=bsdf.inputs['Base Color'].links[0].from_node;mat.node_tree.links.new(tex.outputs['Alpha'],bsdf.inputs['Alpha'])
bpy.ops.export_scene.gltf(filepath=str(work/'geometry.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True)
# Alpha carries ownership, never transparency. Keep opaque rendering in final GLB.
f=work/'geometry.glb';b=f.read_bytes();n=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+n]);oldbin=b[28+n:]
# Blender's exporter premultiplies linked alpha. Embed the original channel-packed
# RGBA bytes explicitly so unowned RGB remains intact even where mask is zero.
replacements={}
for m in doc.get('materials',[]):
 m['alphaMode']='OPAQUE';m.pop('alphaCutoff',None)
 img=doc['images'][doc['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
 replacements[img['bufferView']]=(work/'albedo.png').read_bytes();img['mimeType']='image/png'
chunks=[];offset=0
for i,v in enumerate(doc['bufferViews']):
 data=replacements.get(i,oldbin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]);pad=(-offset)%4
 if pad:chunks.append(bytes(pad));offset+=pad
 v['byteOffset']=offset;v['byteLength']=len(data);chunks.append(data);offset+=len(data)
doc['buffers'][0]['byteLength']=offset;binary=b''.join(chunks);binary+=bytes((-len(binary))%4)
j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
f.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
for mat in {m for o in meshes for m in o.data.materials if m}:
 bsdf=mat.node_tree.nodes.get('Principled BSDF')
 for link in list(bsdf.inputs['Alpha'].links):mat.node_tree.links.remove(link)
 bsdf.inputs['Alpha'].default_value=1
# Neutral studio views use authored paint; runtime ownership is checked in shared renderer.
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.04,.04,.04,1)
height=max(v.co.z for o in meshes for v in o.data.vertices);target=Vector((0,0,height*.44))
for name,pos,power,size in [('Key',(-2,-3,3),220,3),('Fill',(3,-1,2),100,3),('Rim',(0,3,3),150,2)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO';d.ortho_scale=max(1.6,height*1.6)
for name,pos in [('front',(1,-2,1.65)),('back',(-1,2,1.65)),('entrance',(0,-3,1.3))]:
 cam.location=pos;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(work/f'review-{name}.png');bpy.ops.render.render(write_still=True)
report={'config':config,'triangles':sum(sum(len(f.vertices)-2 for f in o.data.polygons)for o in meshes),'footprint':[1,1],'height':height,'ownershipCoverage':coverage,'source':'Tripo mesh, Blender pivot/footprint normalization and ownership mask'}
(work/'adaptation.json').write_text(json.dumps(report,indent=2))
