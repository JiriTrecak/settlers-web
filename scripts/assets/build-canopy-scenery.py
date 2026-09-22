"""Original forest-floor models using the current source material vocabulary.
Run with background Blender. Sources and GLBs are staged for canonical publication.
"""
import sys,math,json,random,struct,bpy,copy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'art/recipes'))
from forest_warfare import ForestKit
from forest_environment import tree_actions
OUT=Path('/tmp/utc-canopy-models');OUT.mkdir(exist_ok=True)
import shutil
shutil.copyfile(ROOT/'art/sources/textures/woodland-bark/albedo.png',OUT/'bark.png')
shutil.copyfile(ROOT/'art/sources/textures/woodland-oak-leaves/albedo.png',OUT/'leaves.png')
class Kit(ForestKit):
 def __init__(self):
  bpy.ops.wm.read_factory_settings(use_empty=True);self.rng=random.Random(2209);self.palette={};self.groups={};self.group('Forest materials')
  self.bark=self.mat('Original painted bark','#ffffff');p=self.bark.node_tree.nodes.get('Principled BSDF');t=self.bark.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(OUT/'bark.png'));t.image.pack();self.bark.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
  self.wood=self.mat('Exposed wood','#897050');self.cut=self.mat('Cut end','#b59b72');self.seed=self.mat('Ochre mushroom cap','#ad8753');self.cream=self.mat('Pale gills','#c1b391');self.russet=self.mat('Russet cap','#936348');self.cap=self.mat('Acorn cup','#645443');self.nut=self.mat('Acorn shell','#a48253');self.moss=self.mat('Muted moss','#69714b')
 def tube(self,name,pts,radii,mat=None,n=8,cuts=False):
  o=super().tube(name,pts,radii,mat,n,cuts)
  if mat==self.bark:
   # Project our tileable bark along each segment.
   for poly in o.data.polygons:
    if cuts and poly.index<2:continue
    for li in poly.loop_indices:
     vi=o.data.loops[li].vertex_index;ring,around=divmod(vi,n)
     o.data.uv_layers.active.data[li].uv=(around/(n-1),ring/(len(pts)-1))
  return o
 def consolidate(self):
  # One draw surface per material, before rigid tree animation is authored.
  objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
  if len(objects)>1:
   bpy.ops.object.select_all(action='DESELECT')
   for o in objects:o.select_set(True)
   bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
 def save(self,slug):
  d=OUT/slug;d.mkdir(exist_ok=True)
  bpy.ops.object.select_all(action='SELECT');bpy.ops.wm.save_as_mainfile(filepath=str(d/'source.blend'))
  bpy.ops.export_scene.gltf(filepath=str(d/'geometry.glb'),export_format='GLB',export_extras=True,export_animations=True,export_nla_strips=True,export_yup=True)
 def branch(self,points,radii):return self.tube('Bark branch',points,radii,self.bark,10,True)
 def mushroom(self,x,y,h,r,mat):
  self.tube('Stem',[(x,y,0),(x+.035,y,h)],[r*.22,r*.14],self.cream,7)
  self.ell('Gills',(x,y,h),(r,r,.09),self.cream,12,4)
  self.ell('Cap',(x,y,h+.09),(r,r,r*.47),mat,14,6)
for slug in ['canopy-mushrooms-ochre','canopy-mushrooms-russet','canopy-acorns','canopy-twig','canopy-ancient-tree','canopy-oak']:
 k=Kit()
 if 'mushrooms' in slug:
  for i,(x,y,h,r) in enumerate([(0,0,.68,.45),(.55,.15,.45,.32),(-.32,-.27,.31,.24)]):k.mushroom(x,y,h,r,k.russet if 'russet' in slug else k.seed)
 elif slug=='canopy-acorns':
  for x,y,r in [(0,0,.38),(.63,.26,.25),(-.48,.31,.20)]:
   k.ell('Acorn nut',(x,y,r*.75),(r*.70,r,r*.75),k.nut,10,6);k.ell('Cup',(x,y+r*.63,r*.78),(r*.75,r*.40,r*.75),k.cap,10,5)
   k.branch([(x,y+r*.80,r),(x+.08,y+r*1.15,r+.13)],[.06,.025])
 elif slug=='canopy-twig':
  k.branch([(-1.65,0,.22),(-.45,.12,.25),(.65,-.08,.24),(1.65,0,.2)],[.16,.22,.19,.10]);k.branch([(.3,0,.23),(.55,.40,.35),(.85,.65,.4)],[.12,.065,.02])
 elif slug=='canopy-ancient-tree':
  k.tube('Ancient trunk',[(0,0,0),(.4,.2,7),(-.6,.6,17),(.3,1,31)],[4.3,3,2.3,1.9],k.bark,16)
  for i in range(10):
   a=i*math.tau/10;v=Vector((math.cos(a),math.sin(a),0));reach=6.6+i%3
   k.tube('Buttress root',[tuple(v*reach+Vector((0,0,.04))),tuple(v*4.2+Vector((0,0,.65))),tuple(v*2.9+Vector((0,0,3))),tuple(v*2.5+Vector((.3,0,9)))],[.10,.6,.85,.22],k.bark,9)
  for i in range(5):
   a=i*math.tau/5;v=Vector((math.cos(a),math.sin(a),0));k.tube('Overhead bough',[(0,0,20+i),tuple(v*5+Vector((0,0,25+i))),tuple(v*11+Vector((0,0,28+i)))],[1.2,.62,.1],k.bark,10)
  for z in [2,4,7]:k.ell('Bracket cap',(3.2,.2,z),(1.05,.68,.27),k.seed,12,5)
 else:
  k.branch([(0,0,0),(.08,.02,2.5),(-.12,.1,5.4)],[.30,.21,.09])
  leaves=bpy.data.materials.new('Broadleaf cards');leaves.use_nodes=True;leaves.surface_render_method='DITHERED';p=leaves.node_tree.nodes.get('Principled BSDF');t=leaves.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(OUT/'leaves.png'));t.image.pack();leaves.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color']);leaves.node_tree.links.new(t.outputs['Alpha'],p.inputs['Alpha']);p.inputs['Roughness'].default_value=1
  for i in range(7):
   a=i*2.4;h=2.9+i*.32;center=Vector((math.cos(a)*1.35,math.sin(a)*1.35,h));k.branch([(0,0,2),tuple(center*.65+Vector((0,0,.8))),tuple(center)],[.17,.10,.025])
   # Several broad planes per cluster, using the original low-detail leaf silhouette.
   for j in range(5):
    angle=a+j*math.tau/5;u=Vector((math.cos(angle),math.sin(angle),.1));v=Vector((-math.sin(angle)*.5,math.cos(angle)*.5,.75));c=center+Vector((math.cos(j*2.4)*.35,math.sin(j*2.4)*.35,.25*j));r=1.05
    o=k.mesh('Broadleaf cluster',[tuple(c-u*r-v*r),tuple(c+u*r-v*r),tuple(c+u*r+v*r),tuple(c-u*r+v*r)],[(0,1,2,3)],leaves)
    for li,uv in zip(o.data.polygons[0].loop_indices,[(0,0),(1,0),(1,1),(0,1)]):o.data.uv_layers.active.data[li].uv=uv
  k.consolidate();tree_actions(k)
 if slug!='canopy-oak':k.consolidate()
 k.save(slug)
print('Created six source models and GLBs:',OUT)
