"""Original forest-scale landmarks. Run in background Blender; no external art required.
Editable sources go into canonical asset packages via publish-forest-giants.ts.
"""
import bpy, math, random, sys, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'art/recipes'))
from forest_warfare import ForestKit
OUT=Path('/tmp/utc-forest-giants');OUT.mkdir(exist_ok=True)
SLUGS=['woodland-canopy-elder','woodland-canopy-spreading','woodland-great-broken-trunk','woodland-great-fallen-log','woodland-giant-mushroom-ochre','woodland-giant-mushroom-russet','woodland-mushrooms-button','woodland-mushrooms-fan']
class Kit(ForestKit):
 def __init__(self,seed):
  if not bpy.app.background:raise RuntimeError('Use background Blender')
  bpy.ops.wm.read_factory_settings(use_empty=True)
  self.rng=random.Random(seed);self.palette={};self.groups={};self.group('Forest-scale landmark')
  self.bark=self.texture('Painted elder bark','asset.textures.forest-giants-bark')
  self.mushroomskin=self.texture('Painted woodland mushrooms','asset.textures.forest-giants-mushrooms')
  self.wood=self.bark;self.cut=self.mat('Exposed honey wood','#937750');self.dark=self.mat('Hollow heartwood','#343427')
  self.cream=self.mat('Warm mushroom gills','#a79b76');self.stem=self.mat('Ivory stem','#b5a986')
  self.ochre=self.mat('Ochre cap','#8a784d');self.russet=self.mat('Russet cap','#8b6047')
  self.rim=self.mat('Cap pale rim','#9a896b');self.moss=self.mat('Muted moss','#56613a')
  self.leaves=self.texture('Broadleaf canopy','woodland-oak-leaves',True)
 def texture(self,name,slug,alpha=False):
  m=self.mat(name,'#ffffff');p=m.node_tree.nodes.get('Principled BSDF');t=m.node_tree.nodes.new('ShaderNodeTexImage')
  folder=ROOT/'art/assets'/slug if slug.startswith('asset.') else ROOT/'art/sources/textures'/slug
  t.image=bpy.data.images.load(str(folder/'albedo.png'),check_existing=True);t.image.pack()
  m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
  if alpha:m.node_tree.links.new(t.outputs['Alpha'],p.inputs['Alpha']);m.surface_render_method='DITHERED';m.use_backface_culling=False
  return m
 def tube(self,name,pts,radii,mat=None,n=8,cuts=False):
  o=super().tube(name,pts,radii,mat,n,cuts)
  if mat not in [self.bark,self.mushroomskin]:return o
  distances=[0]
  for j in range(1,len(pts)):distances.append(distances[-1]+(Vector(pts[j])-Vector(pts[j-1])).length)
  for poly in o.data.polygons:
   if poly.index<2:continue
   arounds=[o.data.loops[li].vertex_index%n for li in poly.loop_indices];seam=max(arounds)-min(arounds)>n/2
   for li in poly.loop_indices:
    ring,around=divmod(o.data.loops[li].vertex_index,n)
    u=(around if not seam or around else n)/n;v=distances[ring]/(distances[-1] if mat==self.mushroomskin else 18)
    o.data.uv_layers.active.data[li].uv=(.51+u*.48,.01+v*.48) if mat==self.mushroomskin else (u,v)
  return o
 def trunk(self,height=38,broken=False):
  self.tube('Great tapering trunk',[(0,0,-.35),(.25,.2,2),(-.5,.1,height*.3),(.6,.6,height*.62),(1,.3,height)],[4.1,3.5,2.8,1.9,1.1 if not broken else 2.1],self.bark,16,True)
  for i in range(7):
   a=i*math.tau/7+.15;v=Vector((math.cos(a),math.sin(a),0))
   self.tube('Ground-hugging buttress root',[tuple(v*7+Vector((0,0,-.2))),tuple(v*4.4+Vector((0,0,.4))),tuple(v*2.8+Vector((0,0,2.5))),tuple(v*1.8+Vector((0,0,7)))],[.14,.6,.9,.7],self.bark,7)
  if broken:
   # Torn rim over dark end grain: broad splinters, not decorative sticks.
   for i in range(7):
    a=i*math.tau/7;v=Vector((math.cos(a),math.sin(a),0));h=height+self.rng.uniform(1,4)
    self.tube('Broken trunk splinter',[tuple(v*1.6+Vector((1,.3,height-3))),tuple(v*1.8+Vector((1,.3,height))),tuple(v*1.9+Vector((1,.3,h)))],[.7,.5,.03],self.bark,6,True)
 def crown(self,center,radius):
  # Shallow bent fans tangent to a dome; no perpendicular crossed billboards.
  c=Vector(center)
  for ring,count in [(0,5),(1,10),(2,14)]:
   for i in range(count):
    a=i*math.tau/count+ring*.71+self.rng.uniform(-.12,.12)
    r=radius*(.2+ring*.32);p=c+Vector((math.cos(a)*r,math.sin(a)*r,radius*(.4-ring*.21)))
    u=Vector((-math.sin(a),math.cos(a),0));v=Vector((math.cos(a),math.sin(a),-.5-ring*.14))
    w=radius*self.rng.uniform(.39,.53);h=radius*.68
    verts=[tuple(p-u*w-v*h*.4),tuple(p+u*w-v*h*.4),tuple(p+u*w+v*h*.6),tuple(p-u*w+v*h*.6),tuple(p+Vector((0,0,.45)))]
    o=self.mesh('Layered oak leaf fan',verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],self.leaves)
    coords=[(0,1),(1,1),(1,0),(0,0),(.5,.5)]
    for poly in o.data.polygons:
     for li in poly.loop_indices:o.data.uv_layers.active.data[li].uv=coords[o.data.loops[li].vertex_index]
 def tree(self,spread=False):
  h=32 if spread else 41;self.trunk(h)
  for i in range(6):
   a=i*2.399;reach=(13 if spread else 10)+self.rng.uniform(-2,2);v=Vector((math.cos(a),math.sin(a),0));z=h*.65+i*1.25
   end=v*reach+Vector((0,0,z+3))
   self.tube('Structural overhead limb',[(0,0,z-4),tuple(v*reach*.48+Vector((0,0,z))),tuple(end)],[1.1,.7,.12],self.bark,9)
   self.crown(end,8 if spread else 7)
  self.crown((.8,0,h),8)
 def mushroom(self,x=0,y=0,h=10,r=8,russet=False):
  self.tube('Curved supporting stem',[(x,y,-.2),(x-r*.055,y,h*.4),(x+r*.065,y+r*.025,h*.85),(x+r*.06,y,h)],[r*.16,r*.115,r*.09,r*.14],self.mushroomskin,20)
  # One continuous cap surface, with a shallow underside well above unit height.
  n=32 if r>2 else 12;vs=[]
  profile=[(.0,h+r*.35),(.32,h+r*.32),(.65,h+r*.23),(.9,h+r*.10),(1,h),(.98,h-.035*r),(.63,h-.13*r),(.14,h-.06*r)]
  for ring,(rr,z) in enumerate(profile):
   for i in range(n):
    a=i*math.tau/n;wave=1+.025*math.sin(a*5)+.018*math.sin(a*3)
    vs.append((x+r*.06+math.cos(a)*r*rr*wave,y+math.sin(a)*r*rr*.92*wave,z+.06*r*rr*math.sin(a*3)))
  fs=[];ids=[]
  for j in range(len(profile)-1):
   for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));ids.append(0 if j<3 else 1 if j<5 else 2)
  fs.append(tuple(range((len(profile)-1)*n,len(vs))));ids.append(2)
  o=self.mesh('Broad umbrella cap',vs,fs,self.mushroomskin)
  for p in o.data.polygons:
   p.use_smooth=True
   top=p.index<5*n;cx=.75 if russet and top else .25;cy=.75 if top else .25
   for li in p.loop_indices:
    ring,i=divmod(o.data.loops[li].vertex_index,n);a=i*math.tau/n;rr=profile[ring][0]
    o.data.uv_layers.active.data[li].uv=(cx+math.cos(a)*rr*.238,cy+math.sin(a)*rr*.238)
 def log(self):
  n=16;vs=[]
  for x,r in [(-15,3.0),(0,3.5),(15,2.7),(-15,2.1),(15,1.9)]:
   for i in range(n):a=i*math.tau/n;vs.append((x+(math.sin(a*5)*.45+math.cos(a*3)*.3 if x else 0),math.cos(a)*r,3.2+math.sin(a)*r))
  faces=[];ids=[]
  for i in range(n):
   q=(i+1)%n
   faces.extend([(i,q,n+q,n+i),(n+i,n+q,2*n+q,2*n+i),(3*n+i,4*n+i,4*n+q,3*n+q),(i,3*n+i,3*n+q,q),(2*n+i,2*n+q,4*n+q,4*n+i)]);ids.extend([0,0,1,2,2])
  o=self.mesh('Hollow fallen forest trunk',vs,faces,[self.bark,self.dark,self.cut],ids)
  for poly in o.data.polygons:poly.use_smooth=poly.material_index!=2
  for poly in o.data.polygons:
   if poly.material_index!=0:continue
   for li in poly.loop_indices:
    vi=o.data.loops[li].vertex_index;v=o.data.vertices[vi].co;o.data.uv_layers.active.data[li].uv=((vi%n)/(n-1),v.x/12)
  for x,a in [(-5,.7),(6,-.9)]:self.tube('Broken heavy branch',[(x,0,5.5),(x+1,a*2,7),(x+3,a*4,8.3)],[.9,.6,.1],self.bark,8,True)
  for x in [-7,-4,4]:self.ell('Moss cushion',(x,-1.1,6.1),(2.5,1.4,.35),self.moss,10,4)
 def save(self,slug):
  d=OUT/slug;d.mkdir(exist_ok=True)
  bpy.context.view_layer.update();objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
  tri=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
  # Keep named source pieces editable. Runtime publication batches by material.
  bpy.data.orphans_purge(do_recursive=True)
  bpy.ops.wm.save_as_mainfile(filepath=str(d/'source.blend'),compress=True)
  bpy.ops.export_scene.gltf(filepath=str(d/'geometry.glb'),export_format='GLB',export_extras=True,export_yup=True)
  (d/'generation.json').write_text(json.dumps({'method':'authored','recipe':'scripts/assets/build-forest-giants.py','triangles':tri,'design':'Original sparse forest-scale scenery. Mushroom collision is stem-only. Canopies use bent tangent leaf fans.', 'textures':['asset.textures.forest-giants-bark','asset.textures.forest-giants-mushrooms','woodland-oak-leaves']},indent=2)+'\n')
  print(slug,tri,'triangles')
  # Temporary contact-sheet views, deliberately outside the repository.
  scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.world=bpy.data.worlds.new('Black studio');scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.055,.06,.045,1)
  corners=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box];lo=Vector(tuple(min(v[j] for v in corners) for j in range(3)));hi=Vector(tuple(max(v[j] for v in corners) for j in range(3)));center=(lo+hi)*.5;size=max(hi-lo)
  bpy.ops.object.camera_add(location=center+Vector((size,-size,size*.8)));cam=bpy.context.object;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=size*1.38;scene.camera=cam
  for loc,energy,scale in [((1,-1,1.7),1800,1),((-1,-.3,.8),900,.8)]:
   bpy.ops.object.light_add(type='AREA',location=center+Vector(loc)*size);light=bpy.context.object;light.data.energy=energy*size*size/100;light.data.shape='DISK';light.data.size=size*scale;light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
  scene.render.resolution_x=720;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.filepath=str(d/'preview.png');scene.view_settings.view_transform='Standard';bpy.ops.render.render(write_still=True)
for i,slug in enumerate(SLUGS):
 k=Kit(914+i)
 if 'canopy' in slug:k.tree('spreading' in slug)
 elif 'broken-trunk' in slug:
  k.trunk(31,True)
  for j in range(3):k.ell('Bracket fungus',(2.7,.5,3+j*3),(2.1,1.6,.5),k.ochre,14,5)
 elif 'fallen-log' in slug:k.log()
 elif 'giant-mushroom' in slug:k.mushroom(h=11 if 'ochre' in slug else 8.5,r=8 if 'ochre' in slug else 6.5,russet='russet' in slug)
 else:
  for j,(x,y,h,r) in enumerate([(0,0,.95,.68),(.95,.2,.6,.46),(-.5,-.6,.48,.4)]):k.mushroom(x,y,h,r,'fan' in slug)
 k.save(slug)
