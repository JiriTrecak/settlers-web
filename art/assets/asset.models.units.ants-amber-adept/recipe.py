"""Prepare a generated ant for subsequent motion/equipment refinement.
Keeps provider geometry, rig and paint; ownership is an alpha mask on red leaf pixels.
Outputs remain staging assets until per-role acceptance and canonical publication.
"""
import bpy,sys,json,struct,numpy as np
from pathlib import Path
from mathutils import Vector
assert bpy.app.background, 'Run this adapter in background Blender'
work=Path(sys.argv[sys.argv.index('--')+1]).resolve() if '--' in sys.argv else Path(__file__).resolve().parent;bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(work/'provider.glb'))
scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE');meshes=[o for o in scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
for o in list(scene.objects):
 if o.type=='MESH' and o not in meshes:bpy.data.objects.remove(o,do_unlink=True)
for t in rig.animation_data.nla_tracks:t.mute=True
rig.animation_data.action=None
for b in rig.pose.bones:b.matrix_basis.identity()
bpy.context.view_layer.update()
# Keep original 4K source embedded; runtime downsizing happens only after saving.
mask_fraction=0
for mat in {m for o in meshes for m in o.data.materials if m}:
 bsdf=mat.node_tree.nodes.get('Principled BSDF');node=bsdf.inputs['Base Color'].links[0].from_node;im=node.image
 pixels=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(pixels);pixels=pixels.reshape((-1,4));rgb=pixels[:,:3]
 # Red leaf paint has magenta/red hue; orange cuticle, ivory and wood are excluded.
 red,green,blue=rgb[:,0],rgb[:,1],rgb[:,2]
 mask=((red>.055)&(green<red*.34)&(blue>green*.85)&(blue<red*.65)).astype(np.float32)
 mask_fraction=float(mask.mean());pixels[:,3]=mask
 owned=bpy.data.images.new('Painted albedo and leaf ownership',width=im.size[0],height=im.size[1],alpha=True);owned.colorspace_settings.name=im.colorspace_settings.name;owned.alpha_mode='CHANNEL_PACKED';owned.pixels.foreach_set(pixels.ravel());owned.pack();node.image=owned
 owned.filepath_raw=str(work/'albedo.png');owned.file_format='PNG';owned.save()
 maskim=bpy.data.images.new('Red leaf ownership mask',width=im.size[0],height=im.size[1],alpha=False);mp=np.column_stack((mask,mask,mask,np.ones_like(mask)));maskim.pixels.foreach_set(mp.ravel());maskim.filepath_raw=str(work/'team-mask.png');maskim.file_format='PNG';maskim.save()
 mat.name='TC_TeamColor';mat['teamColorMask']='baseColorAlpha';mat['teamColorSourceMax']=1.0;mat['teamColorDefault']=[.65,.025,.045];mat.diffuse_color=(1,1,1,1);bsdf.inputs['Alpha'].default_value=1
 for link in list(bsdf.inputs['Alpha'].links):mat.node_tree.links.remove(link)
 bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['Roughness'].default_value=.75
 minimum_mask=.04
 assert mask_fraction>minimum_mask,f'Ownership extraction too small: {mask_fraction}'
# Imported provider length is around one metre. Preserve it and declare scale at binding.
for old,new in [('hit_to_body_01','hit'),('fall','death'),('cast_a_spell','cast')]:
 if old in bpy.data.actions:bpy.data.actions[old].name=new
for a in bpy.data.actions:a.use_fake_user=True
exec((Path(__file__).parent/'refine.py').read_text())
exec((Path(__file__).parent/'mantle.py').read_text())
# UV seams duplicate vertices. Keep their deformation weights identical so
# local gear cleanup cannot open cracks along texture islands.
from collections import defaultdict
for mesh in meshes:
 coincident=defaultdict(list)
 for v in mesh.data.vertices:coincident[tuple(round(c,4) for c in v.co)].append(v)
 for vertices in coincident.values():
  if len(vertices)<2:continue
  weights=defaultdict(float)
  for v in vertices:
   for g in v.groups:weights[g.group]+=g.weight/len(vertices)
  total=sum(weights.values())
  for v in vertices:
   for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
   for group,weight in weights.items():
    if weight>0:mesh.vertex_groups[group].add([v.index],weight/total,'REPLACE')
# Semantic sockets use actual rig landmarks; projectile refinement can adjust hand offsets.
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for name,parent in [('socket_handL','mixamorig:LeftHand'),('socket_handR','mixamorig:RightHand'),('socket_projectile','mixamorig:LeftHand'),('socket_cast','mixamorig:LeftHand')]:
 if parent in rig.data.edit_bones:
  p=rig.data.edit_bones[parent];b=rig.data.edit_bones.new(name)
  origin=Vector((.16,-.085,.81)) if name in ['socket_projectile','socket_cast'] else p.head
  b.head=origin;b.tail=origin+Vector((0,-.015,0));b.parent=p;b.use_deform=False
if work.name=='worker':
 b=rig.data.edit_bones.new('socket_back');b.head=Vector((.21,0,.71));b.tail=b.head+Vector((0,0,.015));b.parent=rig.data.edit_bones['mixamorig:Spine2'];b.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT')
if 'idle' in bpy.data.actions:
 a=bpy.data.actions['idle'];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0];scene.frame_set(0)
reference=work/'reference.png'
if reference.exists():
 ref=bpy.data.images.load(str(reference));ref.use_fake_user=True;ref.pack()
for im in list(bpy.data.images):
 if im.users==0:bpy.data.images.remove(im)
 elif im.has_data:im.pack()
# A saved comparison stage remains outside exported geometry.
from mathutils import Vector
scene.world=bpy.data.worlds.new('Zinc studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.025,.029,1)
for position,energy,size in [((2,-3,3),160,3),((-3,-1,2),100,3),((0,3,3),180,2)]:
 d=bpy.data.lights.new('Softbox','AREA');d.energy=energy;d.size=size;o=bpy.data.objects.new('Softbox',d);scene.collection.objects.link(o);o.location=position;o.rotation_euler=(Vector((0,0,.48))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO';d.ortho_scale=1.5;cam.location=(1,-3,1.8);cam.rotation_euler=(Vector((0,0,.48))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=str(work/'source.blend'),compress=False)
# Runtime texture sizing happens in the canonical publisher.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in meshes:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(work/'refinement.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_skins=True,export_def_bones=False,export_extras=True,export_cameras=False,export_lights=False)
f=work/'refinement.glb';b=f.read_bytes();n=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+n]);oldbin=b[28+n:]
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
(work/'adaptation.json').write_text(json.dumps({'ownershipMaskFraction':mask_fraction,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in meshes),'clips':[a.name for a in bpy.data.actions],'status':'requires-per-role-motion-and-game-review'},indent=2))
