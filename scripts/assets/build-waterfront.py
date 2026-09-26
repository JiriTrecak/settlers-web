"""Original Threewater shoreline props; run in a separate background Blender process."""
import bpy,math,random,sys,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'art/recipes'))
from forest_warfare import ForestKit
OUT=Path('/tmp/utc-waterfront');OUT.mkdir(exist_ok=True)
SLUGS=['woodland-root-snag','woodland-drift-log','woodland-drift-scraps','woodland-bank-slabs','woodland-reed-tuft','woodland-broken-leaf-raft']
class Kit(ForestKit):
 def __init__(self,seed):
  if not bpy.app.background:raise RuntimeError('Background Blender only')
  bpy.ops.wm.read_factory_settings(use_empty=True)
  self.rng=random.Random(seed);self.palette={};self.groups={};self.group('Waterfront')
  self.bark=self.texture('Waterworn bark',ROOT/'art/assets/asset.textures.forest-giants-bark/albedo.png')
  self.stone=self.texture('Woodland stone',ROOT/'art/sources/textures/woodland-rock/albedo.png')
  self.cut=self.mat('Weathered exposed wood','#947c59');self.dark=self.mat('Wet heartwood','#3d392c');self.wood=self.bark
  self.rope=self.mat('Root bindings','#887c54');self.moss=self.mat('Bank moss','#596347')
  self.green=self.mat('Dull reed blades','#6c7344');self.reed=self.mat('Sunlit reed edges','#889057');self.seed=self.mat('Dry reed heads','#68523b')
  self.leafskin=self.mat('Weathered leaf sail','#69754a')
 def texture(self,name,path):
  m=self.mat(name,'#ffffff');p=m.node_tree.nodes.get('Principled BSDF');t=m.node_tree.nodes.new('ShaderNodeTexImage')
  t.image=bpy.data.images.load(str(path),check_existing=True);t.image.scale(512,512);t.image.pack();m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color']);return m
 def tube(self,name,pts,radii,mat=None,n=10,cuts=False):
  o=super().tube(name,pts,radii,mat,n,cuts)
  if mat==self.bark:
   for poly in o.data.polygons:
    if poly.index<2:continue
    inds=[o.data.loops[li].vertex_index%n for li in poly.loop_indices];seam=max(inds)-min(inds)>n/2
    for li in poly.loop_indices:
     ring,a=divmod(o.data.loops[li].vertex_index,n);o.data.uv_layers.active.data[li].uv=((a if not seam or a else n)/n,ring/max(1,len(pts)-1))
  return o
 def log(self,root=False):
  self.tube('Waterworn trunk',[(-4.8,0,.2),(-2,.15,.42),(1.5,-.18,.48),(4.7,.08,.32)],[.82,1,.82,.55],self.bark,16,True)
  if root:
   for i in range(6):
    a=i*math.tau/6;v=Vector((0,math.cos(a),math.sin(a)))
    self.tube('Exposed branching root',[(-4.1,0,.3),tuple(Vector((-5,.0,.3))+v*.8),tuple(Vector((-5.7,0,.3))+v*1.8),tuple(Vector((-6.1,0,.3))+v*2.5)],[.55,.36,.18,.025],self.bark,8,True)
  for i,(x,y) in enumerate([(-.8,-1),(2,1)]):self.tube('Snapped branch',[(x,0,.7),(x+.4,y,.9),(x+.8,y*1.6,1.15)],[.33,.22,.025],self.bark,8,True)
  self.ell('Low moss patch',(-1.8,0,1.29),(1.5,.6,.12),self.moss,12,4)
 def scraps(self):
  for i,(x,y,h) in enumerate([(-.8,-.6,.1),(1,.2,.06),(-.3,.85,.08)]):
   self.tube('Broken drift stick',[(x-1.1,y,h),(x,y+.13,h+.12),(x+.8,y-.1,h+.08)],[.15,.19,.08],self.bark,8,True)
  self.box('Split weathered slat',(.3,-.35,.12),(2.8,.42,.16),self.cut).rotation_euler.z=.45
 def stones(self):
  # Asymmetric stratified masses: bevels are broad, with a buried skirt for shore placement.
  for j,(cx,cy,sx,sy,h) in enumerate([(-1.7,.2,2.5,1.8,1.55),(1.5,.45,2,1.5,1.1),(.2,-1.4,1.5,1.25,.65)]):
   n=9;vs=[]
   for ring,(radius,z) in enumerate([(1,-.8),(1,.12),(.83,h*.75),(.62,h)]):
    for i in range(n):
     a=i*math.tau/n;w=1+.12*math.sin(a*3+j);vs.append((cx+math.cos(a)*sx*radius*w,cy+math.sin(a)*sy*radius*w,z+.06*math.sin(a*2+j)))
   fs=[tuple(reversed(range(n))),tuple(range(3*n,4*n))]
   for r in range(3):
    for i in range(n):fs.append((r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i))
   o=self.mesh('Rounded bank shelf',vs,fs,self.stone)
   for p in o.data.polygons:
    for li in p.loop_indices:
     v=o.data.vertices[o.data.loops[li].vertex_index].co;o.data.uv_layers.active.data[li].uv=(v.x*.16+v.z*.06,v.y*.16+v.z*.1)
   bevel=o.modifiers.new('Soft worn rims','BEVEL');bevel.width=.13;bevel.segments=2
   o.modifiers.new('Broad face normals','WEIGHTED_NORMAL')
 def reeds(self):
  for i in range(8):
   a=i*2.4;x=math.cos(a)*.5;y=math.sin(a)*.5;h=1.1+(i%3)*.35
   if i%2==0:
    self.tube('Reed stem',[(x,y,-.1),(x+.08,y,h),(x+.18,y,h+.35)],[.025,.02,.012],self.green,5)
    self.ell('Dry seed head',(x+.12,y,h+.15),(.09,.08,.24),self.seed,7,5)
   self.leaf('Bent strap leaf',(x,y,0),(x+math.cos(a)*.8,y+math.sin(a)*.8,h*.8),.14,self.reed if i%3==0 else self.green,veins=False)
 def raft(self):
  for i in range(5):
   y=(i-2)*.55;length=3.1 if i<3 else 2.2
   self.tube('Lashed twig float',[(-length,y,.15),(-.5,y+.08,.22),(length*.6,y,.14)],[.24,.3,.2],self.bark,10,True)
  for x in [-1.7,.7]:
   self.tube('Root cross brace',[(x,-1.45,.36),(x+.1,0,.4),(x,1.45,.36)],[.13,.17,.1],self.bark,8,True)
   for y in [-1.1,0,1.1]:self.lash((x,y,.35),.32,'y',2)
  self.tube('Broken leaning mast',[(-.3,0,.35),(.1,0,1.6),(1.1,.2,2)],[.14,.12,.025],self.bark,8,True)
  self.leaf('Sagging torn leaf',(-.1,.12,1.7),(1.8,1.05,.4),.75,self.leafskin,veins=False)
  self.box('Abandoned cargo',(-1,-.3,.7),(.8,.65,.65),self.cut)
 def save(self,slug):
  d=OUT/slug;d.mkdir(exist_ok=True);bpy.context.view_layer.update()
  bpy.ops.wm.save_as_mainfile(filepath=str(d/'source.blend'),compress=True)
  bpy.ops.export_scene.gltf(filepath=str(d/'geometry.glb'),export_format='GLB',export_yup=True,export_apply=True)
  (d/'generation.json').write_text(json.dumps({'method':'authored','recipe':'scripts/assets/build-waterfront.py','seed':928,'design':'Original quiet woodland shore props, broad weathered forms; shared original bark and rock palette.'},indent=2)+'\n')
  scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.045,.05,.04,1)
  objects=[o for o in scene.objects if o.type=='MESH'];corners=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box];lo=Vector(tuple(min(v[j] for v in corners) for j in range(3)));hi=Vector(tuple(max(v[j] for v in corners) for j in range(3)));center=(lo+hi)*.5;size=max(hi-lo)
  bpy.ops.object.camera_add(location=center+Vector((size,-size,size*.8)));cam=bpy.context.object;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=size*1.35;scene.camera=cam
  for loc,energy in [((1,-1,1.7),1600),((-1,-.3,.8),700)]:
   bpy.ops.object.light_add(type='AREA',location=center+Vector(loc)*size);light=bpy.context.object;light.data.energy=energy*size*size/100;light.data.size=size;light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
  scene.render.resolution_x=640;scene.render.resolution_y=480;scene.render.resolution_percentage=100;scene.render.filepath=str(d/'preview.png');scene.view_settings.view_transform='Standard';bpy.ops.render.render(write_still=True)
for i,slug in enumerate(SLUGS):
 k=Kit(928+i)
 if slug.endswith('root-snag'):k.log(True)
 elif slug.endswith('drift-log'):k.log()
 elif slug.endswith('drift-scraps'):k.scraps()
 elif slug.endswith('bank-slabs'):k.stones()
 elif slug.endswith('reed-tuft'):k.reeds()
 else:k.raft()
 k.save(slug)
