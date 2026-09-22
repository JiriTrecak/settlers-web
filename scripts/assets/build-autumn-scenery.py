"""Original rounded autumn trees and leaf-litter geometry, canonical publication follows."""
import sys,math,random,bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'art/recipes'))
from forest_warfare import ForestKit
from forest_environment import tree_actions
OUT=Path('/tmp/utc-autumn-models')
class Kit(ForestKit):
 def __init__(self,seed):
  bpy.ops.wm.read_factory_settings(use_empty=True);self.rng=random.Random(seed);self.palette={};self.groups={};self.group('Amberleaf forest')
  self.bark=self.mat('Warm ridged bark','#79604a');self.wood=self.mat('Pale cut wood','#b39866');self.dark=self.mat('Bark grooves','#4c4131');self.cut=self.wood
 def save(self,slug,tree=False):
  obs=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.ops.object.select_all(action='DESELECT')
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join()
  if tree:tree_actions(self)
  d=OUT/slug;d.mkdir(exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(d/'source.blend'))
  bpy.ops.export_scene.gltf(filepath=str(d/'geometry.glb'),export_format='GLB',export_extras=True,export_animations=True,export_nla_strips=True,export_yup=True)
 def branch(self,pts,r):return self.tube('Bark',pts,r,self.bark,9,True)
 def leafmat(self):
  m=bpy.data.materials.new('Autumn leaf cards');m.use_nodes=True;m.surface_render_method='DITHERED';p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=1
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(OUT/'leaves.png'));t.image.pack();m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color']);m.node_tree.links.new(t.outputs['Alpha'],p.inputs['Alpha']);return m
 def card(self,c,u,v,m):
  o=self.mesh('Leaf cluster',[tuple(c-u-v),tuple(c+u-v),tuple(c+u+v),tuple(c-u+v)],[(0,1,2,3)],m)
  for li,uv in zip(o.data.polygons[0].loop_indices,[(0,0),(1,0),(1,1),(0,1)]):o.data.uv_layers.active.data[li].uv=uv
for index,slug in enumerate(['autumn-tree-gold','autumn-tree-copper','autumn-shrub-gold','autumn-shrub-copper','autumn-leaf-litter','autumn-stump','autumn-grass']):
 k=Kit(621+index);r=k.rng
 if slug=='autumn-grass':
  mats=[k.mat('Dry grass '+str(i),c) for i,c in enumerate(['#857354','#9b845b','#706248'])]
  for i in range(42):
   a=r.random()*math.tau;reach=r.random()**.7*.55;x,y=math.cos(a)*reach,math.sin(a)*reach;h=r.uniform(.10,.35)*(1-reach*.6);w=r.uniform(.012,.025)
   u=Vector((math.cos(a),math.sin(a),0));v=Vector((-u.y,u.x,0));c=Vector((x,y,.003));bend=u*r.uniform(.05,.17)
   verts=[tuple(c-v*w),tuple(c+v*w),tuple(c+bend*.3+v*w*.6+Vector((0,0,h*.6))),tuple(c+bend+Vector((0,0,h))),tuple(c+bend*.3-v*w*.6+Vector((0,0,h*.6)))]
   k.mesh('Dry bent blade',verts,[(0,1,2,4),(4,2,3)],mats[i%3])
 elif 'litter' in slug:
  mats=[k.mat('Fallen leaf '+str(i),c) for i,c in enumerate(['#bd7626','#b28c32','#994a27','#85602c','#7c3927'])]
  for i in range(24):
   x,y=r.uniform(-.8,.8),r.uniform(-.8,.8);a=r.random()*math.tau;s=r.uniform(.07,.17);h=r.uniform(.015,.065)
   shape=[(0,-1),(.35,-.25),(1,-.3),(.55,.1),(.85,.6),(.2,.4),(0,1),(-.2,.4),(-.85,.6),(-.55,.1),(-1,-.3),(-.35,-.25)]
   verts=[(x,y,h+.035)]+[(x+(u*math.cos(a)-v*math.sin(a))*s,y+(u*math.sin(a)+v*math.cos(a))*s,h) for u,v in shape]
   k.mesh('Fallen maple leaf',verts,[(0,1+j,1+(j+1)%12) for j in range(12)],mats[i%len(mats)])
 elif 'stump' in slug:
  k.branch([(0,0,0),(.02,0,.52),(0,0,.68)],[.45,.34,.31]);k.ell('Cut wood',(0,0,.67),(.30,.30,.025),k.wood,12,2)
  for i in range(5):
   a=i*math.tau/5;k.branch([(0,0,.4),(math.cos(a)*.6,math.sin(a)*.6,.03)],[.16,.025])
 else:
  shrub='shrub' in slug;scale=.31 if shrub else 1;H=7.8 if index%2==0 else 8.7;radius=2.7 if index%2==0 else 2.9
  k.branch([(0,0,0),(.12*scale,.1*scale,2.6*scale),(-.1*scale,.2*scale,(H-1)*scale)],[.39*scale,.24*scale,.055*scale])
  for i in range(7):
   a=i*2.4;z=(2.5+i*.5)*scale;rad=radius*.8*scale
   k.branch([(0,0,z*.8),(math.cos(a)*rad*.55,math.sin(a)*rad*.55,z+.45*scale),(math.cos(a)*rad,math.sin(a)*rad,z+.95*scale)],[.17*scale,.09*scale,.015*scale])
  m=k.leafmat()
  # Four overlapping rounded lobes of foliage. Angled exterior cards + interior fill:
  # enough depth to stay dense from the RTS view without a high triangle count.
  for i in range(84 if not shrub else 45):
   a=i*2.399963;z=r.uniform(-1,1);rad=math.sqrt(max(0,1-z*z));depth=r.uniform(.55,1.0)
   c=Vector((math.cos(a)*rad*radius*depth,math.sin(a)*rad*radius*depth,(H-2.35)+z*2.15))*scale
   n=Vector((math.cos(a)*rad,math.sin(a)*rad,z*.8+.35)).normalized();u=n.cross(Vector((0,0,1)))
   if u.length<.01:u=Vector((1,0,0))
   u.normalize();v=n.cross(u).normalized();extent=r.uniform(.95,1.4)*scale
   k.card(c,u*extent,v*extent,m)
 k.save(slug,tree='tree' in slug)
print('Original autumn scenery built')
