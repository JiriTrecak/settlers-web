"""Bitter Heart: a split resin pod held in three old, asymmetric root curls."""
import bpy,bmesh,json,math,random,sys
from pathlib import Path
from mathutils import Vector
if not bpy.app.background: raise RuntimeError('Use a separate background Blender process')
A=Path(__file__).resolve().parent;ROOT=A.parents[3];sys.path.insert(0,str(ROOT/'experiments/building-studio'))
from stage import create_stage
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());rng=random.Random(C['seed'])
geo=bpy.data.collections.new('Bitter Heart');bpy.context.scene.collection.children.link(geo)
studio=bpy.data.collections.new('Studio');bpy.context.scene.collection.children.link(studio)
def linear(h):
 v=[int(h[i:i+2],16)/255 for i in (0,2,4)]
 return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in v)
def material(name,color,texture=None,rough=.85,emit=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*linear(color),1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=m.diffuse_color;p.inputs['Roughness'].default_value=rough
 if texture:
  im=bpy.data.images.load(str(texture),check_existing=True);im.pack();t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
 if emit:
  p.inputs['Emission Color'].default_value=(*linear(color),1);p.inputs['Emission Strength'].default_value=emit
  if texture:m.node_tree.links.new(t.outputs['Color'],p.inputs['Emission Color'])
 return m
bark=material('Fissured plum-brown root bark','50403d',A/'bitter-bark.png')
wood=material('Torn heartwood edges','9d6a52',ROOT/'assets/textures/terrain/heartwood-grain.png')
sap=material('Copper-red resin heart','a74f23',A/'bitter-resin.png',rough=.5,emit=.5);sap['resinShimmer']={'strength':.4,'speed':.22}
moss=material('Dark moss cushions','47432a',ROOT/'assets/textures/materials/ants/moss-surface.png')
cap=material('Old ochre shelf caps','8e623d');rim=material('Faded shelf rims','b79260')
def mesh(name,vs,fs,mats,ids=None,uvs=None,smooth=True):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new(name,me);geo.objects.link(ob)
 for m in mats:me.materials.append(m)
 for p in me.polygons:p.use_smooth=smooth;p.material_index=ids[p.index] if ids else 0
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 uv=me.uv_layers.new(name='Root grain')
 for p in me.polygons:
  for li in p.loop_indices:
   vi=me.loops[li].vertex_index;v=me.vertices[vi].co
   uv.data[li].uv=uvs[vi] if uvs else (v.x*.18,v.z*.18)
 return ob
def spline(points,steps=8):
 p=[Vector(v) for v in points];out=[]
 for i in range(len(p)-1):
  a,b,c,d=p[max(0,i-1)],p[i],p[i+1],p[min(len(p)-1,i+2)]
  for k in range(steps):
   t=k/steps;out.append((b*2+(c-a)*t+(a*2-b*5+c*4-d)*t*t+(-a+b*3-c*3+d)*t*t*t)*.5)
 out.append(p[-1]);return out
def root(name,control,widths,sides=18,steps=8):
 pts=spline(control,steps);vs=[];uvs=[];length=0
 # Ring frames follow the bend without sudden orientation changes.
 tangent=(pts[1]-pts[0]).normalized();u=tangent.cross(Vector((0,1,0))).normalized()
 for j,p in enumerate(pts):
  d=(pts[min(j+1,len(pts)-1)]-pts[max(0,j-1)]).normalized();u=(u-d*u.dot(d)).normalized();v=d.cross(u)
  if j:length+=(p-pts[j-1]).length
  f=j/steps;seg=min(len(widths)-2,int(f));blend=min(1,f-seg);r=widths[seg]*(1-blend)+widths[seg+1]*blend
  for k in range(sides+1):
   a=k*math.tau/sides;w=1+.10*math.sin(a*5+j*.018)+.045*math.cos(a*9-j*.025)
   vs.append(tuple(p+(u*math.cos(a)+v*math.sin(a))*r*w));uvs.append((k/sides,length*.19))
 fs=[tuple(reversed(range(sides))),tuple((len(pts)-1)*(sides+1)+k for k in range(sides))]
 fs += [(j*(sides+1)+k,j*(sides+1)+k+1,(j+1)*(sides+1)+k+1,(j+1)*(sides+1)+k) for j in range(len(pts)-1) for k in range(sides)]
 return mesh(name,vs,fs,[bark],uvs=uvs)
# Ground roots are broad and load-bearing; their ends sink into the terrain.
for i in range(9):
 a=i*math.tau/9+rng.uniform(-.2,.2);length=4.4+rng.random()*2.7;dx,dy=math.cos(a),math.sin(a)*.73;bend=rng.uniform(-.55,.55)
 pts=[(dx*1.1,dy*1.1,.9),(dx*2.9+dy*bend,dy*2.9-dx*bend,.65),(dx*length*.8-dy*bend,dy*length*.8+dx*bend,.32),(dx*length,dy*length,-.08)]
 root('Spreading root %02d'%i,pts,[.85,.69,.31,.025],12,6)
root('Great hooked root',[(-3.6,.5,.35),(-4.6,.6,2.7),(-4.8,.65,5.8),(-3.8,.7,8.6),(-1.8,.8,10.8),(.1,.9,10.4),(.65,.9,9.1),(.3,.8,8.2)],[1.5,1.25,1.0,.83,.65,.48,.29,.025],24,8)
root('Low forward curl',[(2.8,-.1,.25),(4.6,-.1,1.45),(5.15,.0,3.6),(4.75,.2,5.25),(3.6,.1,5.75),(2.8,-.1,5.05),(2.95,-.25,4.5)],[1.35,1.05,.86,.68,.46,.22,.025],22,8)
root('Rear heart buttress',[(1.5,2.7,.25),(1.6,2.75,3),(1.2,2.5,5.2),(.2,2.2,7.8),(-.45,2.1,8.8)],[1.15,.9,.65,.4,.025],18,7)
# Five thick, irregular bark valves open around the sap, with warm torn edges.
cols=7;rows=12
for index,(angle,height,width) in enumerate([(-.20,7.5,.94),(1.0,8.2,1.05),(2.1,8.65,1.02),(3.25,7.8,.91),(4.0,6.0,.83)]):
 vs=[];uvs=[]
 for inner in [False,True]:
  for j in range(rows):
   t=j/(rows-1);radius=.3+1.72*math.sin(t*math.pi)**.88
   for k in range(cols):
    q=k/(cols-1);a=angle+(q-.5)*width+.12*math.sin(t*math.pi)
    r=radius+(.10*math.cos(q*math.pi*4+t*2))-(.27 if inner else 0)
    z=.45+t*(height+.45*math.cos(q*math.pi*4)-.25*math.sin(q*math.pi*7))
    vs.append((math.cos(a)*r,math.sin(a)*r*.86,z));uvs.append((q*.8+index*.17,t*1.7))
 layer=rows*cols;fs=[];ids=[]
 for inner in [0,1]:
  for j in range(rows-1):
   for k in range(cols-1):
    p=inner*layer+j*cols+k;fs.append((p,p+1,p+cols+1,p+cols));ids.append(inner)
 edge=list(range(cols))+[j*cols+cols-1 for j in range(1,rows)]+list(range(layer-2,layer-cols-1,-1))+[j*cols for j in range(rows-2,0,-1)]
 for j,p in enumerate(edge):q=edge[(j+1)%len(edge)];fs.append((p,q,q+layer,p+layer));ids.append(1)
 mesh('Split heartwood valve %s'%index,vs,fs,[bark,wood],ids,uvs)
# A solid, uneven ovoid resin core, not a floating crystal.
N=40;R=20;vs=[(0,-.1,.65)];uvs=[(.5,0)]
for j in range(1,R):
 t=j/R;r=1.57*math.sin(t*math.pi)**.92
 for k in range(N+1):
  a=k*math.tau/N;w=1+.05*math.sin(a*7+t*11)+.025*math.cos(a*13-t*7)
  vs.append((math.cos(a)*r*w,-.18+math.sin(a)*r*.83*w,.65+t*6.95));uvs.append((k/N,t))
vs.append((0,-.18,7.6));uvs.append((.5,1));fs=[(0,1+k+1,1+k) for k in range(N)]
for j in range(R-2):
 for k in range(N):p=1+j*(N+1)+k;fs.append((p,p+1,p+N+2,p+N+1))
last=1+(R-2)*(N+1);fs += [(len(vs)-1,last+k,last+k+1) for k in range(N)]
mesh('Living copper resin core',vs,fs,[sap],uvs=uvs)
# Low moss masses and broad fungi stay subordinate to the heart silhouette.
def cushion(i,x,y,z,r):
 N=10;vs=[(x,y,z+.28*r)]
 for t,h in [(.7,.19),(1,-.04)]:
  for k in range(N):a=k*math.tau/N;w=rng.uniform(.85,1.12);vs.append((x+math.cos(a)*r*t*w,y+math.sin(a)*r*.7*t*w,z+h*r))
 fs=[(0,1+k,1+(k+1)%N) for k in range(N)]+[(1+k,1+(k+1)%N,1+N+(k+1)%N,1+N+k) for k in range(N)]
 mesh('Dark root moss %02d'%i,vs,fs,[moss],uvs=[(p[0]*.5,p[1]*.5) for p in vs])
for i in range(18):
 a=i*math.tau/18;r=2.2+rng.random()*2.5;cushion(i,math.cos(a)*r,math.sin(a)*r*.7,1.5-r*.17,.4+rng.random()*.38)
for i,(x,y,z,r) in enumerate([(-4.9,-.05,3.5,.5),(-4.85,-.1,3.85,.36),(-4.15,-.1,6.7,.5),(5.35,-.2,2.8,.4),(5.3,-.2,3.1,.33),(-2.6,-2.5,.65,.55),(2.8,-2.5,.55,.4)]):
 N=20;vs=[];uvs=[]
 for radius,h in [(.12,.12),(1,0),(.94,-.12),(.15,-.21)]:
  for k in range(N):a=k*math.tau/N;vs.append((x+math.cos(a)*r*radius,y+math.sin(a)*r*.7*radius,z+h));uvs.append((k/N,radius))
 fs=[];ids=[]
 for j in range(3):
  for k in range(N):fs.append((j*N+k,j*N+(k+1)%N,(j+1)*N+(k+1)%N,(j+1)*N+k));ids.append(0 if j==0 else 1)
 fs.extend([tuple(reversed(range(N))),tuple(range(N*3,N*4))]);ids.extend([0,1]);mesh('Aged shelf fungus %s'%i,vs,fs,[cap,rim],ids,uvs)
create_stage(C,studio)
reference=bpy.data.images.load(str(A/'reference.png'),check_existing=True);reference.pack();reference.use_fake_user=True
parts=[o for o in geo.objects if o.type=='MESH'];(A/'model-stats.json').write_text(json.dumps({'meshes':len(parts),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in parts),'materials':len({m.name for o in parts for m in o.data.materials})},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
