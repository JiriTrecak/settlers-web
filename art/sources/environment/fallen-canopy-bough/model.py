"""A fallen bough at ant scale. Solid low obstacle, exposed end grain, bark scales and moss."""
import bpy,bmesh,math,random,json,sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent;sys.path.insert(0,str(A.parents[3]/'experiments/building-studio'))
from stage import create_stage,aim
if not bpy.app.background:raise RuntimeError('Background build only')
bpy.ops.wm.read_factory_settings(use_empty=True);C=json.loads((A/'asset.json').read_text());random.seed(714)
scene=bpy.context.scene;geo=bpy.data.collections.new('Fallen bough');scene.collection.children.link(geo);studio=bpy.data.collections.new('Studio');scene.collection.children.link(studio)
def mat(n,h):
 rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)];rgb=[v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4 for v in rgb];m=bpy.data.materials.new(n);m.use_nodes=True;m.diffuse_color=(*rgb,1);bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=.96;return m
bark=[mat('Cool weathered bark '+str(i),h) for i,h in enumerate(['48463e','625c4c','756b54','84785c'])];end=[mat('Exposed heartwood '+str(i),h) for i,h in enumerate(['ad9065','c3a67b','88734f'])];moss=[mat('Velvet moss '+str(i),h) for i,h in enumerate(['4e5d34','68733c','788447'])]
def mesh(n,v,f,mats,inds):
 me=bpy.data.meshes.new(n);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(n,me);geo.objects.link(o)
 for m in mats:me.materials.append(m)
 for p,i in zip(me.polygons,inds):p.material_index=i
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();return o
N=18;xs=[-8,-7,-5,-3,-1,1,3,5,7,8];v=[]
def point(x,a,extra=0):
 r=1.1-(x+8)*.025+extra;return (x,math.sin(x*.24)*.25+math.cos(a)*r,1.02+math.sin(a)*r)
for x in xs:
 for i in range(N):v.append(point(x+random.uniform(-.08,.08),i*math.tau/N))
f=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(len(xs)-1) for i in range(N)]
mesh('Curved fallen limb',v,f,bark,[random.randrange(4) for _ in f])
# Ringed broken ends with a recessed pith and rough perimeter.
for x in [-8,8]:
 vv=[point(x,0,-(1.1-(x+8)*.025))];ff=[];ind=[]
 for r in [.25,.6,.95]:
  for i in range(N):
   p=point(x+(random.uniform(-.06,.06) if r==.95 else -.015),i*math.tau/N,0);vv.append((p[0],p[1]*r,1.02+(p[2]-1.02)*r))
 for i in range(N):ff.append((0,1+i,1+(i+1)%N));ind.append(0)
 for j in range(2):
  for i in range(N):ff.append((1+j*N+i,1+j*N+(i+1)%N,1+(j+1)*N+(i+1)%N,1+(j+1)*N+i));ind.append(1 if j==0 else 2)
 mesh('Broken growth rings',vv,ff,end,ind)
# Asymmetric moss strips leave readable lengths of exposed wood.
for j in range(11):
 x=-6+j*1.05;a=1.15+random.uniform(-.35,.35);vv=[point(x+dx,a+da,.15) for dx,da in [(-.45,-.34),(.5,-.25),(.7,.1),(.3,.45),(-.5,.38)]]
 mesh('Raised moss patch',vv,[(0,1,2),(0,2,3),(0,3,4)],moss,[j%3]*3)
# Shared packed albedo retains bark detail at gameplay scale.
bark_image=bpy.data.images.load(str(A.parents[3]/'assets/textures/terrain/ancient-bark.png'));bark_image.pack()
textured=bark[2];nodes=textured.node_tree.nodes;links=textured.node_tree.links
tex=nodes.new('ShaderNodeTexImage');tex.image=bark_image;tex.extension='REPEAT'
links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
for ob in geo.objects:
 if not any(m in bark for m in ob.data.materials):continue
 for i,m in enumerate(ob.data.materials):
  if m in bark:ob.data.materials[i]=textured
 uv=ob.data.uv_layers.new(name='Bark flow')
 for polygon in ob.data.polygons:
  coords=[]
  for li in polygon.loop_indices:
   v=ob.data.vertices[ob.data.loops[li].vertex_index].co
   coords.append(((math.atan2(v.z-1.02,v.y)/math.tau%1)*4,v.x*.3))
  if max(u for u,v in coords)-min(u for u,v in coords)>2:coords=[(u+4 if u<2 else u,v) for u,v in coords]
  for li,co in zip(polygon.loop_indices,coords):uv.data[li].uv=co

create_stage(C,studio)
for ob in studio.objects:
 if ob.type=='LIGHT':ob.location*=1.7;ob.data.size*=1.7;aim(ob,(0,0,1))
scene['source_note']='Under the Canopy approved environment. Static fallen bough; bark, ringed ends and moss. Ground footprint 16 by 2.5 metres.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
