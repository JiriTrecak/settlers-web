"""A neutral living-root resin basin, reconstructed from the retained concept."""
import bpy,bmesh,json,math,random,sys
from pathlib import Path
from mathutils import Vector
if not bpy.app.background:raise RuntimeError('Build in a separate background Blender process')
A=Path(__file__).resolve().parent;ROOT=A.parents[3];sys.path.insert(0,str(ROOT/'experiments/building-studio'))
from stage import create_stage
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());rng=random.Random(C['seed'])
geo=bpy.data.collections.new('Living resin wellspring');bpy.context.scene.collection.children.link(geo)
studio=bpy.data.collections.new('Studio');bpy.context.scene.collection.children.link(studio)
def mat(name,h,texture=None,rough=.85,emit=0):
 rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)];rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough
 if texture:
  im=bpy.data.images.load(str((A/texture if (A/texture).exists() else ROOT/'assets/textures/terrain'/texture)),check_existing=True);im.pack();t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
 if emit:
  p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=emit
  if texture:m.node_tree.links.new(t.outputs['Color'],p.inputs['Emission Color'])
 return m
bark=mat('Wellspring warm bark','765234','hollow-bark.png');wood=mat('Exposed inner heartwood','a87840','heartwood-grain.png')
resin=mat('Living amber pool','ec9a21','resin-surface.png',rough=.24,emit=.65);resin['resinShimmer']={'strength':.3,'speed':.3}
drop=mat('Hanging amber','ffc256',rough=.24,emit=.8)
moss=[mat('Moss cushion '+str(i),h) for i,h in enumerate(['384526','4f5b2e','647139'])]
fungi=[mat('Ochre cap','ab6230'),mat('Golden cap margin','d39b58'),mat('Cream gills','cfba8f')]
def mesh(name,vs,fs,mats,indices=None,smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);geo.objects.link(o)
 for m in mats:me.materials.append(m)
 for p in me.polygons:p.material_index=indices[p.index] if indices else 0;p.use_smooth=smooth
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 uv=me.uv_layers.new(name='Natural grain')
 for p in me.polygons:
  for li in p.loop_indices:
   v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(v.x*.25,v.y*.25) if abs(p.normal.z)>.6 else ((v.y if abs(p.normal.x)>.6 else v.x)*.3,v.z*.25)
 return o
def tube(name,points,radii,material,sides=10):
 pts=[Vector(p) for p in points];vs=[]
 for j,p in enumerate(pts):
  d=(pts[min(j+1,len(pts)-1)]-pts[max(0,j-1)]).normalized();u=d.cross(Vector((0,1,0)))
  if u.length<.1:u=d.cross(Vector((1,0,0)))
  u.normalize();v=d.cross(u)
  for i in range(sides):
   a=i*math.tau/sides;r=radii[j]*(1+.07*math.sin(i*2.1+j*.4));vs.append(tuple(p+(u*math.cos(a)+v*math.sin(a))*r))
 fs=[tuple(reversed(range(sides))),tuple(range((len(pts)-1)*sides,len(pts)*sides))]+[(j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i) for j in range(len(pts)-1) for i in range(sides)]
 return mesh(name,vs,fs,[material],smooth=True)
def curve(points,n=20):
 p=[Vector(v) for v in points];return [tuple(p[0]*(1-t)**3+p[1]*(3*(1-t)**2*t)+p[2]*(3*(1-t)*t*t)+p[3]*t**3) for t in [i/n for i in range(n+1)]]
def cushion(name,p,rx,ry):
 x,y,z=p;N=8;vs=[(x,y,z+.11)]+[(x+math.cos(i*math.tau/N)*rx*rng.uniform(.8,1.15),y+math.sin(i*math.tau/N)*ry*rng.uniform(.8,1.15),z) for i in range(N)]
 return mesh(name,vs,[(0,1+i,1+(i+1)%N) for i in range(N)],moss,[rng.randrange(3) for i in range(N)])
# Closed elliptical root bowl. The front lip is lower than the rear wall.
N=64;profile=[(.80,.1),(1.0,.3),(1.04,.75),(.97,1.1),(.82,1.02),(.73,.45)];vs=[]
for r,z in profile:
 for i in range(N):
  a=i*math.tau/N;w=1+.04*math.sin(a*7)+.02*math.cos(a*13);vs.append((math.cos(a)*2.6*r*w,math.sin(a)*1.8*r*w,z+(.07*math.sin(a*5)+.09*math.sin(a))*z))
fs=[];ids=[]
for j in range(len(profile)-1):
 for i in range(N):fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i));ids.append(1 if j>=3 else 0)
fs+=[tuple(reversed(range(N))),tuple(range((len(profile)-1)*N,len(profile)*N))];ids += [0,1]
mesh('Hollow curled-root basin',vs,fs,[bark,wood],ids,smooth=True)
for i in range(26):
 a=i*math.tau/26
 if i%5!=0:cushion('Rim moss '+str(i),(math.cos(a)*2.64,math.sin(a)*1.85,.9),.28,.20)
# Sap surface stays flat, with shimmer supplied by a shared shader clock in game.
vs=[(0,0,.79)]+[(math.cos(i*math.tau/N)*2.16,math.sin(i*math.tau/N)*1.49,.79) for i in range(N)]
mesh('Living resin surface',vs,[(0,i+1,(i+1)%N+1) for i in range(N)],[resin])
roots=[([(-2.6,.8,.3),(-3.1,1.1,3.7),(-1.9,1.1,4.8),(-.65,1,4.25)],.67,.19),([(2.5,.8,.35),(3.15,.8,3.3),(1.55,1.25,3.6),(.7,1.1,3.15)],.6,.15)]
for k,(control,r0,r1) in enumerate(roots):
 pts=curve(control);tube('Crescent living root '+str(k),pts,[r0+(r1-r0)*j/(len(pts)-1) for j in range(len(pts))],bark,12)
 for j in range(1,len(pts)-1,2):
  x,y,z=pts[j];cushion('Crown moss %s.%s'%(k,j),(x,y+.12,z+r0*.65),.28,.23)
for i in range(10):
 a=i*math.tau/10;r0=2.15;p0=(math.cos(a)*r0,math.sin(a)*1.55,.65);p1=(math.cos(a)*(r0+.6),math.sin(a)*2,.5);p2=(math.cos(a)*(r0+1.0),math.sin(a)*2.35,.15);p3=(math.cos(a)*(r0+1.25),math.sin(a)*2.7,.03)
 pts=curve([p0,p1,p2,p3],10);tube('Grounded spreading root '+str(i),pts,[.36*(1-j/12)+.025 for j in range(11)],bark,8)
 for j in [2,5,7]:cushion('Foot moss %s.%s'%(i,j),(pts[j][0],pts[j][1],pts[j][2]+.18),.24,.2)
# Long drips, rounded lower bulbs and thin necks.
for i,(x,y,z,size,top) in enumerate([(-1.7,.75,2.75,.32,4.0),(-.98,1,3.35,.21,4.28),(1.5,.9,2.25,.3,3.38)]):
 rings=[(-1,.05),(-.85,.52),(-.4,.72),(.1,.53),(.9,.18),(1.4,.1)];K=12;vs=[(x,y,z-size)]
 for h,r in rings[1:]:
  for j in range(K):vs.append((x+math.cos(j*math.tau/K)*r*size,y+math.sin(j*math.tau/K)*r*size,z+h*size))
 vs.append((x,y,top));fs=[(0,1+(j+1)%K,1+j) for j in range(K)]
 for q in range(len(rings)-2):
  for j in range(K):fs.append((1+q*K+j,1+q*K+(j+1)%K,1+(q+1)*K+(j+1)%K,1+(q+1)*K+j))
 fs += [(len(vs)-1,1+(len(rings)-2)*K+j,1+(len(rings)-2)*K+(j+1)%K) for j in range(K)]
 mesh('Hanging amber drop '+str(i),vs,fs,[drop],smooth=True)
for k,(x,y,z,r) in enumerate([(2.35,-.65,.7,.7),(2.65,-.85,.34,.47),(2.4,-1.35,.25,.34)]):
 K=18;vs=[]
 for rr,h in [(.07,.24),(1,0),(.94,-.13),(.18,-.38)]:
  vs += [(x+math.cos(j*math.tau/K)*r*rr,y+math.sin(j*math.tau/K)*r*rr,z+h*r) for j in range(K)]
 fs=[];ids=[]
 for q in range(3):
  for j in range(K):fs.append((q*K+j,q*K+(j+1)%K,(q+1)*K+(j+1)%K,(q+1)*K+j));ids.append(q)
 fs += [tuple(reversed(range(K))),tuple(range(3*K,4*K))];ids += [0,2]
 mesh('Broad ochre shelf '+str(k),vs,fs,fungi,ids,smooth=True)
 tube('Shelf stem '+str(k),[(x,y,.1),(x,y,z)],[.12,.1],fungi[2],7)
create_stage(C,studio)
reference=bpy.data.images.load(str(A/'reference.png'),check_existing=True);reference.pack();reference.use_fake_user=True
parts=[o for o in geo.objects if o.type=='MESH'];(A/'model-stats.json').write_text(json.dumps({'meshes':len(parts),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in parts),'materials':len({m.name for o in parts for m in o.data.materials})},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
