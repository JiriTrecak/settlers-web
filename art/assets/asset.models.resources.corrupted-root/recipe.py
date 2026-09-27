"""Harvestable heartroot: reuse our painted stump, with readable violet root growth."""
from pathlib import Path
import bpy,sys,math,json,random
from mathutils import Vector
assert bpy.app.background
P=Path(__file__).resolve().parent;ROOT=P.parents[3]
sys.path.insert(0,str(ROOT/'art/recipes'))
from forest_warfare import ForestKit
from stage import create_stage
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'art/assets/asset.models.environment.woodland-giant-stump/geometry.glb'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
# Flatten imported transforms before fitting to the existing 5x5 resource footprint.
for o in meshes:
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 world=o.matrix_world.copy();o.parent=None;o.matrix_world=world;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
points=[v.co.copy() for o in meshes for v in o.data.vertices]
lo=Vector(tuple(min(v[j] for v in points) for j in range(3)));hi=Vector(tuple(max(v[j] for v in points) for j in range(3)));center=(lo+hi)*.5
factor=4.5/max(hi.x-lo.x,hi.y-lo.y)
for o in meshes:
 for v in o.data.vertices:v.co=Vector(((v.co.x-center.x)*factor,(v.co.y-center.y)*factor,(v.co.z-lo.z)*factor))
k=ForestKit.__new__(ForestKit);k.palette={};k.rng=random.Random(2719);k.groups={};k.group('Corrupted root growth')
k.cut=k.mat('Root sap heart','#806486',rough=.7,glow=.1);k.wood=k.mat('Corrupted outer root','#493d48');k.sap=k.mat('Violet root tips','#735681',rough=.65)
for i in range(7):
 a=i*math.tau/7+.18;rad=Vector((math.cos(a),math.sin(a),0));side=Vector((-rad.y,rad.x,0))
 pts=[rad*.55+Vector((0,0,.65)),rad*1.05+side*.15+Vector((0,0,.35)),rad*1.6+side*.25+Vector((0,0,.18)),rad*2.25+side*.12+Vector((0,0,.05))]
 k.tube('Exposed living root',pts,[.26,.24,.15,.025],k.wood,9,True)
 k.tube('Sap ridge',[p+Vector((0,0,r*.8)) for p,r in zip(pts,[.26,.24,.15,.025])],[.065,.06,.04,.01],k.sap,6)
for i in range(5):
 a=i*2.4;r=.65+(i%2)*.3
 k.ell('Root knot',(math.cos(a)*r,math.sin(a)*r,.35),(.3,.22,.25),k.sap,10,6)
scene=bpy.context.scene
for o in scene.objects:
 if o.type=='MESH':
  o.select_set(True)
 else:o.select_set(False)
for im in bpy.data.images:
 if im.source=='FILE':im.pack()
# Merge disposable runtime copies; keep named editable source parts in Blender.
bpy.context.view_layer.objects.active=next(o for o in scene.objects if o.type=='MESH')
bpy.ops.object.duplicate();bpy.ops.object.join();runtime=bpy.context.object;runtime.name='Corrupted Root Runtime'
bpy.ops.export_scene.gltf(filepath=str(P/'geometry.glb'),export_format='GLB',use_selection=True,export_apply=True)
bpy.data.objects.remove(runtime,do_unlink=True)
cfg={'camera':{'azimuth':25,'elevation':30,'scale':6.2,'target':[0,0,.8],'distance':12},'render':{'width':768,'height':768,'samples':24},'light':{'key_energy':650,'fill_energy':300,'rim_energy':350,'scale':1,'target':[0,0,1]}}
c=bpy.data.collections.new('Studio');scene.collection.children.link(c);create_stage(cfg,c)
bpy.data.texts.load(str(P/'model.py'));bpy.ops.wm.save_as_mainfile(filepath=str(P/'source.blend'),compress=True)
scene.render.filepath=str(P/'render.png');bpy.ops.render.render(write_still=True)
print('ROOT_READY')
