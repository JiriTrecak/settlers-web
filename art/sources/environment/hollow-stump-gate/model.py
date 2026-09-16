"""Ancient hollow stump, an open entrance and explorable inner heartwood."""
import bpy,bmesh,math,json,random,sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent;ROOT=A.parents[3]
sys.path.insert(0,str(ROOT/'experiments/building-studio'))
from stage import create_stage,aim
if not bpy.app.background:raise RuntimeError('Background Blender only')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());rng=random.Random(6314);scene=bpy.context.scene
geo=bpy.data.collections.new('Hollow stump · doorway and roots');scene.collection.children.link(geo)
studio=bpy.data.collections.new('Studio');scene.collection.children.link(studio)
def mat(name,hex,rough=.93,emit=0):
 rgb=[int(hex[i:i+2],16)/255 for i in (0,2,4)];rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1);bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=rough
 if emit:bs.inputs['Emission Color'].default_value=(*rgb,1);bs.inputs['Emission Strength'].default_value=emit
 return m
bark=mat('Ancient packed bark','76624a');image=bpy.data.images.load(str(ROOT/'assets/textures/terrain/hollow-bark.png'));image.pack();tex=bark.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;bark.node_tree.links.new(tex.outputs['Color'],bark.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
wood=[mat('Exposed heartwood '+str(i),h) for i,h in enumerate(['6f4429','885d34','a87843','ba8c50'])]
heartwood_image=bpy.data.images.load(str(ROOT/'assets/textures/terrain/heartwood-grain.png'));heartwood_image.pack()
rings_image=bpy.data.images.load(str(ROOT/'assets/textures/terrain/heartwood-rings.png'));rings_image.pack()
for i,m in enumerate(wood):
 wood_tex=m.node_tree.nodes.new('ShaderNodeTexImage');wood_tex.image=rings_image if i>=2 else heartwood_image;m.node_tree.links.new(wood_tex.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

moss=[mat('Root moss '+str(i),h) for i,h in enumerate(['354b2b','4c6033','617644'])]
cap=[mat('Shelf fungus '+str(i),h) for i,h in enumerate(['89552d','b47c42','d3ae70'])]
resin=mat('Living amber glow','ee941c',.28,.35)
def mesh(name,vs,fs,mats,inds=None,smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);geo.objects.link(o)
 for m in mats:me.materials.append(m)
 for p in me.polygons:p.material_index=inds[p.index] if inds else 0;p.use_smooth=smooth
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 if bark in mats or any(m in wood for m in mats):
  uv=me.uv_layers.new(name='Bark grain')
  for p in me.polygons:
   coords=[]
   for li in p.loop_indices:
    v=me.vertices[me.loops[li].vertex_index].co;coords.append(((math.atan2(v.y,v.x)/math.tau%1)*6,v.z*.19))
   if max(u for u,v in coords)-min(u for u,v in coords)>3:coords=[(u+6 if u<3 else u,v) for u,v in coords]
   for li,co in zip(p.loop_indices,coords):
    v=me.vertices[me.loops[li].vertex_index].co
    uv.data[li].uv=(v.x/20+.5,v.y/20+.5) if mats[p.material_index] in wood[2:] else co
 return o
N=72;R=8;outer=[];inner=[]
for j,t in enumerate([0,.09,.24,.48,.74,1]):
 for i in range(N):
  a=i*math.tau/N;top=15+1.5*math.sin(a*7)+.8*math.sin(a*13+.8)
  doorway=10.4*math.sqrt(max(0,1-(R*math.cos(a)/4.4)**2)) if math.sin(a)<-.6 else 0
  z=doorway+(top-doorway)*t
  r=R+1.4*math.exp(-z/2)+.45*math.cos(a*15)-.07*z
  outer.append((r*math.cos(a),r*math.sin(a),z));ri=r-1.5
  inner.append((ri*math.cos(a),ri*math.sin(a),z))
faces=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(5) for i in range(N)]
mesh('Outer ancient bark',outer,faces,[bark],smooth=True)
mesh('Warm hollow heartwood',inner,[tuple(reversed(f)) for f in faces],[wood[1]],smooth=True)
# Exposed irregular ring and the arch soffit connect the shell rather than capping its opening.
vs=outer+inner;F=[];I=[]
for i in range(N):
 n=(i+1)%N;F.extend([(5*N+i,5*N+n,11*N+n,11*N+i),(i,6*N+i,6*N+n,n)]);I.extend([2+i%2,0])
mesh('Broken crown and doorway soffit',vs,F,wood,I)
# Integrated roots avoid the entrance corridor.
for k in range(13):
 a=k*math.tau/13
 if math.sin(a)<-.6 and abs(math.cos(a))<.65:continue
 length=rng.uniform(12,16);width=rng.uniform(1.1,1.7);v=[]
 for r,w,h in [(6,width,4.6),(9,width*1.25,2.3),(12,width*.8,.8),(length,.12,.05)]:
  for side,f in [(-1,0),(-.55,.72),(0,1),(.55,.72),(1,0)]:v.append((r*math.cos(a)-side*w*math.sin(a),r*math.sin(a)+side*w*math.cos(a),h*f))
 f=[(j*5+i,j*5+i+1,(j+1)*5+i+1,(j+1)*5+i) for j in range(3) for i in range(4)]
 mesh('Buttress root %02d'%k,v,f,[bark],smooth=True)
 # Small irregular cushions follow the root instead of a single green sheet.
 for patch in range(7):
  rr=rng.uniform(9.2,min(12.8,length));side=rng.uniform(-.5,.5)
  u=min(1,(rr-9)/3);hh=(2.3*(1-u)+.8*u)*(1-.55*abs(side))
  cx=rr*math.cos(a)-side*width*math.sin(a);cy=rr*math.sin(a)+side*width*math.cos(a)
  rad=rng.uniform(.3,.72);mv=[(cx,cy,hh+.16)];edge=[]
  for q in range(9):
   theta=q*math.tau/9;pr=rad*rng.uniform(.65,1.15);dx=math.cos(theta)*pr;dy=math.sin(theta)*pr
   along=dx*math.cos(a)+dy*math.sin(a);edge.append((cx+dx,cy+dy,hh-along*.5+.025))
  mv+=edge;mf=[(0,1+q,1+(q+1)%9) for q in range(9)]
  mesh('Root moss cushion %02d.%02d'%(k,patch),mv,mf,moss,[rng.randrange(3) for f in mf])
# Broad broken bark plates give the silhouette depth at RTS distance.
for k in range(52):
 a=k*math.tau/52;z=rng.uniform(2,12.5)
 doorway=10.4*math.sqrt(max(0,1-(R*math.cos(a)/4.4)**2)) if math.sin(a)<-.6 else 0
 if z<doorway+.5:continue
 length=rng.uniform(1.2,3.0);width=rng.uniform(.24,.48);vv=[]
 for t,w,off in [(0,.15,.03),(.15,1,.15),(.65,.9,.25),(1,.18,.07)]:
  zz=z+t*length;rr=R+1.4*math.exp(-zz/2)+.45*math.cos(a*15)-.07*zz+off
  for side in [-1,1]:vv.append((rr*math.cos(a)-side*w*width*math.sin(a),rr*math.sin(a)+side*w*width*math.cos(a),zz))
 mesh('Raised bark splinter %02d'%k,vv,[(0,1,3,2),(2,3,5,4),(4,5,7,6)],[bark])
# Warm bracket shelves grow on the sides, leaving the arch clear.
for k in range(15):
 a=(-.35 if k%2 else -2.8)+rng.uniform(-.2,.2);z=rng.uniform(1.3,11);r=7.4-.04*z;rad=rng.uniform(.45,1.35);v=[]
 for ring in [0,.6,1]:
  for i in range(13):
   t=-math.pi/2+i*math.pi/12;rr=r+math.cos(t)*rad*ring;v.append((rr*math.cos(a)-math.sin(t)*rad*ring*math.sin(a),rr*math.sin(a)+math.sin(t)*rad*ring*math.cos(a),z+.2*(1-ring*ring)))
 # Central fan has one vertex rather than a collapsed inner ring.
 v=[v[0]]+v[13:];f=[(0,1+i,2+i) for i in range(12)]+[(1+i,14+i,15+i,2+i) for i in range(12)]
 mesh('Layered bracket shelf %02d'%k,v,f,cap,[0]*12+[2]*12)
# Resin droplets use closed radial profiles: visible both inside and outside.
for k in range(11):
 x=rng.uniform(-3.3,3.3);y=-6.8+rng.uniform(-.6,.3);z=10.0-abs(x)*.32-rng.uniform(0,1.4);s=rng.uniform(.22,.44);v=[];rings=[(0,.04),(-.45,.1),(-.75,.56),(-1,.65),(-1.2,.3),(-1.25,.04)]
 for h,r in rings:
  for i in range(10):a=i*math.tau/10;v.append((x+math.cos(a)*r*s,y+math.sin(a)*r*s,z+h*s*2.5))
 f=[(j*10+i,j*10+(i+1)%10,(j+1)*10+(i+1)%10,(j+1)*10+i) for j in range(5) for i in range(10)]+[tuple(reversed(range(10))),tuple(50+i for i in range(10))]
 mesh('Amber teardrop %02d'%k,v,f,[resin],smooth=True)
create_stage(C,studio)
for o in studio.objects:
 if o.type=='LIGHT':o.location*=3;o.data.size*=3;aim(o,(0,0,5))
scene['source_note']='Generated Hollow Gate reference. Open hollow and arch are real geometry; rear surfaces inferred. Neutral scenery; no ownership flag.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update();(A/'model-stats.json').write_text(json.dumps({'meshes':len(geo.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in geo.objects),'materials':len(bpy.data.materials)},indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
