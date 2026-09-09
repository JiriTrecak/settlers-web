"""Deterministic solid-mesh pine; hidden radial boughs and brown stump inferred."""
import bpy, json, math, random, sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage, aim
if not bpy.app.background: raise RuntimeError('Use separate background Blender process')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text()); P=json.loads((A/'palette.json').read_text())['samples']; random.seed(C['seed'])
scene=bpy.context.scene
cols={}
for n in ['01 Thick brown stump and roots','02 Layered olive boughs','03 Studio']:
 c=bpy.data.collections.new(n); scene.collection.children.link(c); cols[n]=c
woodcol=cols['01 Thick brown stump and roots']; leafcol=cols['02 Layered olive boughs']
def mat(n,col):
 m=bpy.data.materials.new(n); m.use_nodes=True; m.diffuse_color=(*col,1); b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*col,1); b.inputs['Roughness'].default_value=.92; b.inputs['Specular IOR Level'].default_value=.08; return m
base=P['olive_light']['representative']['linear_rgb']
leaves=[mat('Olive foliage '+str(i),[v*f for v in base]) for i,f in enumerate([.50,.65,.78,.9,1.05])]
def linear(h):
 return [((int(h[i:i+2],16)/255+.055)/1.055)**2.4 for i in (0,2,4)]
woods=[mat('Brown bark '+str(i),linear(h)) for i,h in enumerate(['654023','805333','93623c','50321f'])]
def mesh(n,v,f,ms,col):
 me=bpy.data.meshes.new(n); me.from_pydata(v,[],f); me.update(); ob=bpy.data.objects.new(n,me); col.objects.link(ob)
 for m in ms: me.materials.append(m)
 return ob

def tube(n,points,radii):
 v=[]; f=[]; sides=10
 for j,(p,r) in enumerate(zip(points,radii)):
  for i in range(sides):
   a=math.tau*i/sides; rr=r*(1+.09*math.sin(i*7.1)); v.append((p[0]+rr*math.cos(a),p[1]+rr*math.sin(a),p[2]))
 for j in range(len(points)-1):
  for i in range(sides): f.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
 f.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+i for i in range(sides))]); ob=mesh(n,v,f,woods,woodcol)
 for p in ob.data.polygons:p.material_index=(p.index%10)%4
 return ob

tube('Thick tapered brown stump',[(0,0,0),(.02,0,.22),(-.02,.02,.85),(.04,.03,1.5),(.03,0,3.3),(-.04,0,5.8),(0,0,7.35)],[.53,.46,.35,.3,.22,.105,.015])
for i in range(6):
 a=i*math.tau/6+.17; tube('Short root buttress %02d'%i,[(0,0,.65),(.42*math.cos(a),.42*math.sin(a),.22),(.8*math.cos(a),.8*math.sin(a),.065)],[.25,.21,.035])
# Each bough is a closed, ridged, toothed volume. Broad lobes, not needle cards.
def bough(n,a,z,r,w,drop):
 v=[]; faces=[]; N=33
 for j in range(N):
  t=j/(N-1); radius=.06+r*t
  profile=(math.sin(math.pi*t)**.75)*w
  tooth=[.48,.91,1,.70][j%4]*(1+.12*math.sin(j*2.34+a))
  width=profile*tooth
  zz=z-drop*t**.72+.1*math.sin(t*math.pi)
  for k in range(5):
   q=(k-2)/2; side=q*width*(1+.15*math.sin(j*.91+a+q*2))
   rr=radius+abs(q)*(.12*r)*math.sin(math.pi*t)
   h=zz-abs(q)*w*.27+.008*math.sin(j*1.6+k)
   v.append((rr*math.cos(a)-side*math.sin(a),rr*math.sin(a)+side*math.cos(a),h))
 for j in range(N-1):
  for k in range(4):
   p=j*5+k;faces.append((p,p+5,p+6,p+1))
 count=len(v);v.extend([(x,y,z-.022) for x,y,z in v])
 faces.extend([tuple(i+count for i in reversed(f)) for f in list(faces)])
 boundary=list(range(5))+[j*5+4 for j in range(1,N)]+list(range((N-1)*5+3,(N-1)*5-1,-1))+[j*5 for j in range(N-2,0,-1)]
 for i,p in enumerate(boundary):q=boundary[(i+1)%len(boundary)];faces.append((q,p,p+count,q+count))
 ob=mesh(n,v,faces,leaves,leafcol)
 for poly in ob.data.polygons: poly.use_smooth=True
 bias=random.randrange(1,4)
 for p in ob.data.polygons:p.material_index=max(0,min(4,bias+(1 if p.index%4==1 else 0)-(1 if p.index>=96 else 0)))

for tier in range(11):
 z=2.03+tier*.47; r=2.5*(1-tier/12)**.93; count=9 if tier<7 else 7
 for j in range(count):
  a=j*math.tau/count+tier*2.399+random.uniform(-.13,.13)
  rr=r*random.uniform(.85,1.14); zz=z+random.uniform(-.13,.13)
  bough('Tier %02d bough %02d'%(tier,j),a,zz,rr,rr*.34,random.uniform(.8,1.1))
# Slender pointed leader with steep pendant crown.
for j in range(6):bough('Pointed crown %02d'%j,j*math.tau/6,7.42,.57,.22,1.2)
create_stage(C,cols['03 Studio'])
for ob in cols['03 Studio'].objects:
 if ob.type=='LIGHT' and ob.name.startswith('Warm key'):ob.location=( -1,-4,10);ob.location.x=5;aim(ob,(0,0,4))
light=bpy.data.lights.new('Soft stump fill','AREA'); light.energy=65; light.color=(1,.72,.46); light.size=3
ob=bpy.data.objects.new('Soft stump fill',light); cols['03 Studio'].objects.link(ob); ob.location=(1,-3,1.8); aim(ob,(0,0,.5))
scene['source_note']='Reference-based stylized pine; back, branches and thick brown stump are inferred. No ownership flag: natural vegetation asset.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update()
stats={'objects':len(bpy.data.objects),'meshes':len(bpy.data.meshes),'faces':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'materials':len(bpy.data.materials),'blender':bpy.app.version_string}
(A/'model-stats.json').write_text(json.dumps(stats,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
