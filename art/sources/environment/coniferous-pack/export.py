"""Export every purchased mesh separately. Evaluate imported object transforms before converting Blender +Z to glTF +Y."""
import bpy,json,re,math
from pathlib import Path
from mathutils import Vector
if not bpy.app.background:raise RuntimeError('Background export only')
A=Path(__file__).resolve().parent;OUT=A.parents[3]/'assets/environment/coniferous-pack'
OUT.mkdir(parents=True,exist_ok=True)
source=[o for o in bpy.data.objects if o.type=='MESH']
im=bpy.data.images.get('Texture_BaseColor_v02.png');im.filepath_raw=str(OUT/'atlas.png');im.file_format='PNG';im.save()
report=[]
bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=1
bpy.context.scene.render.bake.target='VERTEX_COLORS'
# The supplied texture is a color palette. Bake its UV-selected colors into vertices,
# preserving the palette look without uploading the 4K palette separately for every prop.
original=bpy.data.materials.get('Lowpoly_Trees_M')
for node in original.node_tree.nodes:
 if node.type=='OUTPUT_MATERIAL':output=node
tex=next(n for n in original.node_tree.nodes if n.type=='TEX_IMAGE')
emit=original.node_tree.nodes.new('ShaderNodeEmission');original.node_tree.links.new(tex.outputs['Color'],emit.inputs['Color']);original.node_tree.links.new(emit.outputs[0],output.inputs['Surface'])
baked=bpy.data.materials.new('Coniferous pack · authored palette');baked.use_nodes=True
bs=baked.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(1,1,1,1);bs.inputs['Roughness'].default_value=.86
vc=baked.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='PackColor';baked.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])

for src in source:
 name={'SM_Coniferous_Trees_14':'tree_primary','SM_Coniferous_Trees_13':'tree_secondary'}.get(src.name,src.name.removeprefix('SM_').lower())
 mesh=src.data.copy();ob=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(ob)
 pts=[src.matrix_world@v.co for v in mesh.vertices];lo=[min(v[i] for v in pts) for i in range(3)];hi=[max(v[i] for v in pts) for i in range(3)]
 for v,p in zip(mesh.vertices,pts):v.co=Vector((p.x-(lo[0]+hi[0])/2,p.y-(lo[1]+hi[1])/2,p.z-lo[2]))
 mesh.update();mesh.calc_loop_triangles()
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 attr=mesh.color_attributes.new(name='PackColor',type='FLOAT_COLOR',domain='CORNER');mesh.color_attributes.active_color=attr
 bpy.ops.object.bake(type='EMIT',target='VERTEX_COLORS',use_clear=True)
 mesh.materials.clear();mesh.materials.append(baked)
 clips=[]
 if name in ['tree_primary','tree_secondary']:
  bpy.context.scene.render.fps=30
  for clip,duration in [('hit',.6),('fall',1.8),('decay',6.)]:
   action=bpy.data.actions.new(clip);ob.animation_data_create();ob.animation_data.action=action
   ground=(hi[1]-lo[1])/2
   values=[(0,0,0),(.2,.025,0),(.4,-.018,0),(.6,0,0)] if clip=='hit' else [(0,0,0),(.45,.12,.08),(1.4,1.48,ground*.95),(1.8,math.pi/2,ground)] if clip=='fall' else [(0,math.pi/2,ground),(6,math.pi/2,-(hi[1]-lo[1])-.3)]
   for t,angle,z in values:
    ob.rotation_euler=(angle,0,0);ob.location.z=z;ob.keyframe_insert(data_path='rotation_euler',frame=t*30);ob.keyframe_insert(data_path='location',frame=t*30)
   track=ob.animation_data.nla_tracks.new();track.name=clip;track.strips.new(clip,0,action);track.mute=True;clips.append(action)
  ob.animation_data.action=None;ob.location=(0,0,0);ob.rotation_euler=(0,0,0)
 bpy.context.scene.frame_set(0)
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=bool(clips),export_animation_mode='ACTIONS',export_vertex_color='ACTIVE',export_materials='EXPORT',export_cameras=False,export_lights=False)
 report.append({'source':src.name,'id':name,'file':'assets/environment/coniferous-pack/'+name+'.glb','animations':[a.name for a in clips],'palette':'UV palette baked to vertex colors','triangles':len(mesh.loop_triangles),'width':hi[0]-lo[0],'height':hi[2]-lo[2],'depth':hi[1]-lo[1]})
 bpy.data.objects.remove(ob,do_unlink=True);bpy.data.meshes.remove(mesh)
 for action in clips:bpy.data.actions.remove(action)
(A/'exports.json').write_text(json.dumps(report,indent=2));print('EXPORTED',len(report))
