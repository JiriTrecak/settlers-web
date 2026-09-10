"""Build rigid tree reactions from the approved low-poly GLB; preserves static source."""
import bpy,bmesh,math,json,sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage
if not bpy.app.background:raise RuntimeError('Background only')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(A/'pine-game.glb'))
source=next(o for o in bpy.context.scene.objects if o.type=='MESH')
# Imported glTF is converted back to Blender Z up. Apply any import transforms.
bpy.context.view_layer.objects.active=source;source.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
cut=.65
parts=[]
for name,upper in [('CrownMesh',True),('StumpMesh',False)]:
 me=source.data.copy();ob=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(ob)
 bm=bmesh.new();bm.from_mesh(me)
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=(0,0,cut),plane_no=(0,0,1),clear_inner=upper,clear_outer=not upper)
 edges=[e for e in bm.edges if e.is_boundary and all(abs(v.co.z-cut)<.0001 for v in e.verts)]
 if edges:
  faces=bmesh.ops.holes_fill(bm,edges=edges,sides=0)['faces']
  for layer in bm.loops.layers.float_color.values():
   for f in faces:
    for l in f.loops:l[layer]=(.18,.085,.035,1)
  for layer in bm.loops.layers.color.values():
   for f in faces:
    for l in f.loops:l[layer]=(.18,.085,.035,1)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();parts.append(ob)
bpy.data.objects.remove(source,do_unlink=True)
root=bpy.data.objects.new('TreeRoot',None);bpy.context.scene.collection.objects.link(root)
pivot=bpy.data.objects.new('FallPivot',None);bpy.context.scene.collection.objects.link(pivot);pivot.parent=root;pivot.location.z=cut
stump=bpy.data.objects.new('StumpPivot',None);bpy.context.scene.collection.objects.link(stump);stump.parent=root
parts[0].parent=pivot
for v in parts[0].data.vertices:v.co.z-=cut
parts[1].parent=stump
verts=[v.co.copy() for v in parts[0].data.vertices]
scene=bpy.context.scene;scene.render.fps=30
# Bake the same deterministic keys to Blender NLA and to a portable key-data file.
data={}
sink_distance=max(v.y for v in verts)+.1
for name,duration in [('hit',.6),('fall',1.8),('decay',6.0)]:
 rows=[]
 for i in range(round(duration*30)+1):
  t=i/30
  if name=='hit':
   angle=math.radians(4.5)*math.sin(t/.6*math.pi*5)*(1-t/.6)**2;z=cut;scale=1;ss=1
  elif name=='fall':
   # Fall around ground-level root: no foliage-clearance lift or bounce.
   u=max(0,min(1,(t-.15)/1.10));angle=math.radians(90)*u*u
   scale=1;z=cut*math.cos(angle);ss=1
  else:
   angle=math.radians(90);u=max(0,min(1,(t-.75)/5.25));ease=u*u*(3-2*u);scale=1;z=-sink_distance*ease;v=max(0,min(1,(t-4.5)/1.5));ss=1
  stump_height=-(cut+.1)*(v*v*(3-2*v)) if name=='decay' else 0
  depth=0 if name=='hit' else cut*math.sin(angle)*scale
  rows.append({'time':t,'angle':angle,'height':z,'scale':scale,'stumpScale':ss,'depth':depth,'stumpHeight':stump_height})
 data[name]={'duration':duration,'keys':rows}
 for ob in [pivot,stump]:
  ob.animation_data_create();action=bpy.data.actions.new(name+'_'+ob.name);ob.animation_data.action=action
  for row in rows:
   frame=1+round(row['time']*30)
   if ob==pivot:ob.rotation_euler=(row['angle'],0,0);ob.location=(0,-row['depth'],row['height']);ob.scale=(row['scale'],)*3
   else:ob.rotation_euler=(0,0,0);ob.location=(0,0,row['stumpHeight']);ob.scale=(1,1,1)
   for prop in ['location','rotation_euler','scale']:ob.keyframe_insert(data_path=prop,frame=frame)
  track=ob.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,1,action);strip.extrapolation='NOTHING';track.mute=True;ob.animation_data.action=None
pivot.location=(0,0,cut);pivot.rotation_euler=(0,0,0);pivot.scale=(1,1,1);stump.scale=(1,1,1);stump.location=(0,0,0)
(A/'animation-keys.json').write_text(json.dumps(data))
# Export rigid hierarchy without actions; the exact sampled clips are attached by pack-animation.mjs.
bpy.ops.object.select_all(action='DESELECT')
for ob in [root,pivot,stump,*parts]:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(A/'animation-rig.glb'),export_format='GLB',use_selection=True,export_animations=False,export_vertex_color='ACTIVE',export_materials='EXPORT')
col=bpy.data.collections.new('Animation studio');scene.collection.children.link(col);cfg=json.loads((A/'asset.json').read_text());create_stage(cfg,col)
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
scene['animation_usage']='Mute all NLA tracks, then enable matching hit/fall/decay tracks on FallPivot and StumpPivot. Source FPS 30.'
scene.frame_end=181;scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(A/'olive-pine-animated.blend'))
print('TREE_ANIMATION_SOURCE_READY')
